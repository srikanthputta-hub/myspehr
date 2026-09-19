import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Silent background runner. Called from the client after an MRN is entered.
 * Fetches the FHIR bundle for that MRN through the server-only FHIR client,
 * parses each resource type, and upserts into our relational tables using
 * the service-role Supabase client.
 *
 * The browser never sees the bearer token or the raw FHIR payload — only
 * `{ ok, mrn, counts }`.
 */
export const syncMrn = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({ mrn: z.string().min(1).max(64), purge: z.boolean().optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { fhirJson } = await import("@/lib/fhir-client.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const mrn = data.mrn.trim();

    // Optional purge — wipes all rows for this MRN before re-fetch so a fresh
    // login starts from a clean slate (no duplicated/stale data).
    if (data.purge) {
      const tables = [
        "observations",
        "medications",
        "allergies",
        "clinical_history",
        "care_plans",
        "family_member_history",
        "care_team",
        "appointments",
        "encounters",
      ] as const;
      for (const t of tables) {
        await supabaseAdmin.from(t).delete().eq("patient_mrn", mrn);
      }
      await supabaseAdmin.from("patients").delete().eq("mrn", mrn);
    }



    // 1. Fetch the patient searchset and related resources in one bundle.
    // The FHIR server denies /$everything, so use _revinclude=* instead.
    const patientBundle = await fhirJson<FhirBundle>(
      `Patient?identifier=${encodeURIComponent(mrn)}&_revinclude=*`,
    );
    const entries = patientBundle.entry ?? [];
    const patientEntry = patientBundle.entry?.find((e) => e.resource?.resourceType === "Patient");
    if (!patientEntry?.resource) {
      return { ok: false as const, mrn, reason: "not_found" as const };
    }
    const patientResource = patientEntry.resource as FhirPatientResource;
    const patientFhirId = patientResource.id;
    if (!patientFhirId) throw new Error("Patient missing id");

    // RelatedPerson → emergency contact; Coverage → insurance.
    const relatedPersons = entries
      .filter((e) => e.resource?.resourceType === "RelatedPerson")
      .map((e) => e.resource as FhirResource);
    const coverages = entries
      .filter((e) => e.resource?.resourceType === "Coverage")
      .map((e) => e.resource as FhirResource);
    const compositions = entries
      .filter((e) => e.resource?.resourceType === "Composition")
      .map((e) => e.resource as FhirResource);
    const compositionSections = parseCompositionSectionsFromAll(compositions);

    // 2. Upsert patient row. Verify the row is actually present before any
    //    FK-dependent writes — encounters/observations/etc. all reference
    //    patients(mrn), so a missing patient row produces FK violations.
    const patientRow = mapPatient(mrn, patientResource, relatedPersons, coverages);
    const { data: upsertedPatient, error: pErr } = await supabaseAdmin
      .from("patients")
      .upsert(patientRow, { onConflict: "mrn" })
      .select("mrn")
      .maybeSingle();
    if (pErr) throw new Error(`patients upsert: ${pErr.message}`);
    if (!upsertedPatient?.mrn) {
      throw new Error(`patients upsert: row for ${mrn} not returned`);
    }

    // Confirm the row is visible to subsequent queries before issuing FK-bound
    // writes. PostgREST upsert + select returns the row from the same request,
    // but a follow-up explicit read closes any race with replicas/poolers.
    const { data: confirmed } = await supabaseAdmin
      .from("patients")
      .select("mrn")
      .eq("mrn", mrn)
      .maybeSingle();
    if (!confirmed?.mrn) {
      throw new Error(`patients row for ${mrn} not visible after upsert`);
    }

    // 3. Walk entries, group by resourceType.

    // Encounters first so we can map FHIR encounter id → our UUID.
    const encounterRows = entries
      .filter((e) => e.resource?.resourceType === "Encounter")
      .map((e) => mapEncounter(mrn, e.resource as FhirResource, compositionSections))
      .map((row) => ({ ...row, patient_mrn: mrn }));

    let encounterIdByFhir: Record<string, string> = {};
    if (encounterRows.length) {
      const runEncounterUpsert = () =>
        supabaseAdmin
          .from("encounters")
          .upsert(encounterRows, { onConflict: "fhir_id" })
          .select("id, fhir_id");
      let { data: encs, error } = await runEncounterUpsert();
      if (error && error.message.includes("encounters_patient_mrn_fkey")) {
        // Race: a parallel purge (concurrent login / 48h cron) removed the
        // patient row after our upsert. Re-insert it and retry once.
        await supabaseAdmin.from("patients").upsert(patientRow, { onConflict: "mrn" });
        ({ data: encs, error } = await runEncounterUpsert());
      }
      if (error) {
        throw new Error(
          `encounters upsert: ${error.message} (patient_mrn=${mrn}, rows=${encounterRows.length})`,
        );
      }
      encounterIdByFhir = Object.fromEntries(
        (encs ?? []).filter((r) => r.fhir_id).map((r) => [r.fhir_id as string, r.id as string]),
      );
    }


    const resolveEncounter = (ref?: string): string | null => {
      if (!ref) return null;
      const fhirId = ref.split("/").pop() ?? "";
      return encounterIdByFhir[fhirId] ?? null;
    };

    // Composite-key dedup: FHIR servers may return multiple resources with
    // distinct UUIDs but identical clinical values. Drop those before upsert
    // so the UI doesn't show duplicate rows.
    const conditionRows = dedupBy(
      entries
        .filter((e) => e.resource?.resourceType === "Condition")
        .map((e) => mapCondition(mrn, e.resource as FhirResource)),
      (r) => `${r.patient_mrn}|${norm(r.description)}|${norm(r.onset_date)}|${norm(r.clinical_status)}`,
    );

    const allergyRows = dedupBy(
      entries
        .filter((e) => e.resource?.resourceType === "AllergyIntolerance")
        .map((e) => mapAllergy(mrn, e.resource as FhirResource)),
      (r) => `${r.patient_mrn}|${norm(r.substance)}|${norm(r.category)}`,
    );

    const observationRows: ObservationRow[] = dedupBy(
      entries
        .filter((e) => e.resource?.resourceType === "Observation")
        .map((e) => mapObservation(mrn, e.resource as FhirResource, resolveEncounter)),
      (r) => `${r.patient_mrn}|${norm(r.test_name)}|${norm(r.value)}|${norm(r.effective_time)}`,
    );

    const medRows: MedicationRow[] = dedupBy(
      entries
        .filter(
          (e) =>
            e.resource?.resourceType === "MedicationStatement" ||
            e.resource?.resourceType === "MedicationRequest" ||
            e.resource?.resourceType === "MedicationAdministration",
        )
        .map((e) => mapMedication(mrn, e.resource as FhirResource, resolveEncounter)),
      (r) => `${r.patient_mrn}|${norm(r.name)}|${norm(r.dosage)}|${norm(r.encounter_id)}|${r.category}`,
    );

    const carePlanRows = entries
      .filter((e) => e.resource?.resourceType === "CarePlan")
      .map((e) => mapCarePlan(mrn, e.resource as FhirResource, resolveEncounter, compositionSections))
      .filter((r): r is CarePlanRow => r !== null);

    const familyHistoryRows = entries
      .filter((e) => e.resource?.resourceType === "FamilyMemberHistory")
      .flatMap((e) => mapFamilyMemberHistory(mrn, e.resource as FhirResource));

    // Build a quick lookup: Practitioner/PractitionerRole/Organization id → resource
    const resourceById: Record<string, FhirResource> = {};
    for (const e of entries) {
      if (e.resource?.id && e.resource.resourceType) {
        resourceById[`${e.resource.resourceType}/${e.resource.id}`] = e.resource;
      }
    }

    // Fallback provider names extracted from Composition discharge summaries,
    // used when the FHIR Appointment.participant array does not name a Practitioner.
    const providerByEncounter = buildCompositionProviderByEncounter(compositions);
    const followUpProvider = getBestCompositionProvider(compositions) ?? extractDoctorName(compositionSections.followUp);

    const appointmentRows = entries
      .filter((e) => e.resource?.resourceType === "Appointment")
      .map((e) =>
        mapAppointment(mrn, e.resource as FhirResource, resourceById, followUpProvider, providerByEncounter),
      )
      .filter((r): r is AppointmentRow => r !== null);
    const orgNameById = (ref: string | undefined): string | null => {
      if (!ref) return null;
      const r = resourceById[ref];
      if (!r) return null;
      return (r as { name?: string }).name ?? null;
    };

    const careTeamRows = dedupBy(
      entries
        .filter((e) => e.resource?.resourceType === "CareTeam")
        .flatMap((e) => mapCareTeam(mrn, e.resource as FhirResource, resourceById, orgNameById)),
      (r) => `${r.patient_mrn}|${r.member_key}`,
    );

    const writes: Array<PromiseLike<unknown>> = [];
    if (conditionRows.length) {
      writes.push(
        supabaseAdmin
          .from("clinical_history")
          .upsert(conditionRows, { onConflict: "fhir_id" })
          .then(({ error }) => {
            if (error) throw new Error(`clinical_history: ${error.message}`);
          }),
      );
    }
    if (allergyRows.length) {
      writes.push(
        supabaseAdmin
          .from("allergies")
          .upsert(allergyRows, { onConflict: "fhir_id" })
          .then(({ error }) => {
            if (error) throw new Error(`allergies: ${error.message}`);
          }),
      );
    }
    if (observationRows.length) {
      const safeObservationRows = await nullInvalidOptionalEncounterIds(
        supabaseAdmin,
        observationRows,
      );
      writes.push(
        supabaseAdmin
          .from("observations")
          .upsert(safeObservationRows, { onConflict: "fhir_id" })
          .then(({ error }) => {
            if (!error) return;
            if (!error.message.includes("observations_encounter_id_fkey")) {
              throw new Error(`observations: ${error.message}`);
            }
            return supabaseAdmin
              .from("observations")
              .upsert(
                safeObservationRows.map((row) => ({ ...row, encounter_id: null })),
                { onConflict: "fhir_id" },
              )
              .then(({ error: retryError }) => {
                if (retryError) throw new Error(`observations: ${retryError.message}`);
              });
          }),
      );

    }
    if (medRows.length) {
      const safeMedRows = await nullInvalidOptionalEncounterIds(
        supabaseAdmin,
        medRows,
      );
      writes.push(
        supabaseAdmin
          .from("medications")
          .upsert(safeMedRows, { onConflict: "fhir_id" })
          .then(({ error }) => {
            if (!error) return;
            if (!error.message.includes("medications_encounter_id_fkey")) {
              throw new Error(`medications: ${error.message}`);
            }
            return supabaseAdmin
              .from("medications")
              .upsert(
                safeMedRows.map((row) => ({ ...row, encounter_id: null })),
                { onConflict: "fhir_id" },
              )
              .then(({ error: retryError }) => {
                if (retryError) throw new Error(`medications: ${retryError.message}`);
              });
          }),
      );
    }
    if (carePlanRows.length) {
      const safeCarePlanRows = await filterValidRequiredEncounterIds(
        supabaseAdmin,
        carePlanRows,
      );
      if (safeCarePlanRows.length) {
        writes.push(
          supabaseAdmin
            .from("care_plans")
            .upsert(safeCarePlanRows, { onConflict: "fhir_id" })
            .then(async ({ error }) => {
              if (!error) return;
              if (!error.message.includes("care_plans_encounter_id_fkey")) {
                throw new Error(`care_plans: ${error.message}`);
              }

              // A parallel purge/resync can remove encounters between the
              // validation read and this write. Re-check and retry only rows
              // whose required encounter still exists; if none remain, skip
              // care plan rows rather than blanking the whole app.
              const retryRows = await filterValidRequiredEncounterIds(
                supabaseAdmin,
                safeCarePlanRows,
              );
              if (!retryRows.length) return;
              const { error: retryError } = await supabaseAdmin
                .from("care_plans")
                .upsert(retryRows, { onConflict: "fhir_id" });
              if (retryError && !retryError.message.includes("care_plans_encounter_id_fkey")) {
                throw new Error(`care_plans: ${retryError.message}`);
              }
            }),
        );
      }
    }
    if (familyHistoryRows.length) {
      const runFamilyUpsert = () =>
        supabaseAdmin
          .from("family_member_history")
          .upsert(familyHistoryRows, { onConflict: "fhir_id" });
      writes.push(
        (async () => {
          let { error } = await runFamilyUpsert();
          if (error && error.message.includes("family_member_history_patient_mrn_fkey")) {
            // Race with concurrent purge — re-insert patient and retry once.
            await supabaseAdmin.from("patients").upsert(patientRow, { onConflict: "mrn" });
            ({ error } = await runFamilyUpsert());
          }
          if (error) throw new Error(`family_member_history: ${error.message}`);
        })(),
      );
    }
    if (appointmentRows.length) {
      writes.push(
        supabaseAdmin
          .from("appointments")
          .upsert(appointmentRows, { onConflict: "fhir_id" })
          .then(({ error }) => {
            if (error) throw new Error(`appointments: ${error.message}`);
          }),
      );
    }
    if (careTeamRows.length) {
      const runCareTeamUpsert = () =>
        supabaseAdmin
          .from("care_team")
          .upsert(careTeamRows, { onConflict: "patient_mrn,member_key" });
      writes.push(
        (async () => {
          let { error } = await runCareTeamUpsert();
          if (error && error.message.includes("care_team_patient_mrn_fkey")) {
            await supabaseAdmin.from("patients").upsert(patientRow, { onConflict: "mrn" });
            ({ error } = await runCareTeamUpsert());
          }
          if (error) throw new Error(`care_team: ${error.message}`);
        })(),
      );
    }
    await Promise.all(writes);

    return {
      ok: true,
      mrn,
      counts: {
        encounters: encounterRows.length,
        conditions: conditionRows.length,
        allergies: allergyRows.length,
        observations: observationRows.length,
        medications: medRows.length,
        carePlans: carePlanRows.length,
        familyHistory: familyHistoryRows.length,
        appointments: appointmentRows.length,
        careTeam: careTeamRows.length,
      },
    };

  });

/* -------- Types & mappers (server-only — no client import overhead) -------- */

interface FhirBundle {
  resourceType?: string;
  entry?: Array<{ resource?: FhirResource }>;
}
interface FhirResource {
  resourceType: string;
  id?: string;
  [key: string]: unknown;
}

function norm(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

function dedupBy<T>(rows: T[], keyFn: (row: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = keyFn(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

interface FhirPatientResource extends FhirResource {
  name?: Array<{ given?: string[]; family?: string }>;
  birthDate?: string;
  gender?: string;
  telecom?: Array<{ system?: string; value?: string }>;
  address?: Array<{
    text?: string;
    line?: string[];
    city?: string;
    state?: string;
    postalCode?: string;
  }>;
  contact?: Array<{
    name?: { text?: string; given?: string[]; family?: string };
    telecom?: Array<{ system?: string; value?: string }>;
  }>;
  identifier?: Array<{ system?: string; value?: string; type?: { text?: string } }>;
}

function firstText(...vals: Array<string | undefined | null>): string | null {
  for (const v of vals) if (v && v.trim()) return v;
  return null;
}

function codeableText(cc: unknown): string | null {
  if (!cc || typeof cc !== "object") return null;
  const c = cc as { text?: string; coding?: Array<{ display?: string; code?: string }> };
  if (c.text) return c.text;
  const display = c.coding?.find((x) => x.display)?.display;
  if (display) return display;
  return c.coding?.[0]?.code ?? null;
}

function refId(ref: unknown): string | undefined {
  if (typeof ref !== "string") {
    if (ref && typeof ref === "object" && "reference" in ref) {
      const r = (ref as { reference?: string }).reference;
      return r;
    }
    return undefined;
  }
  return ref;
}

function normalizeFhirReference(ref: string | undefined | null): string | null {
  if (!ref) return null;
  const [path] = ref.split("?");
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2) return path || null;
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

function mapPatient(
  mrn: string,
  p: FhirPatientResource,
  relatedPersons: FhirResource[] = [],
  coverages: FhirResource[] = [],
) {
  const name = p.name?.[0];
  const phone = p.telecom?.find((t) => t.system === "phone")?.value ?? null;
  const addr = p.address?.[0];
  const addressLine =
    addr?.text ??
    ([addr?.line?.join(" "), addr?.city, addr?.state, addr?.postalCode]
      .filter(Boolean)
      .join(", ") ||
      null);

  // Prefer RelatedPerson (FHIR's emergency contact resource) over Patient.contact.
  let ecName: string | null = null;
  let ecPhone: string | null = null;
  let ecRelationship: string | null = null;
  const rp = relatedPersons[0] as
    | (FhirResource & {
        name?: Array<{ text?: string; given?: string[]; family?: string }>;
        telecom?: Array<{ system?: string; value?: string }>;
        relationship?: unknown[];
      })
    | undefined;
  if (rp) {
    const rpName = rp.name?.[0];
    ecName =
      rpName?.text ??
      ([rpName?.given?.join(" "), rpName?.family].filter(Boolean).join(" ") || null);
    ecPhone = rp.telecom?.find((t) => t.system === "phone")?.value ?? null;
    ecRelationship = codeableText(rp.relationship?.[0]);
  }
  if (!ecName || !ecPhone) {
    const contact = p.contact?.[0] as
      | {
          name?: { text?: string; given?: string[]; family?: string };
          telecom?: Array<{ system?: string; value?: string }>;
          relationship?: unknown[];
        }
      | undefined;
    ecName =
      ecName ??
      contact?.name?.text ??
      ([contact?.name?.given?.join(" "), contact?.name?.family].filter(Boolean).join(" ") ||
        null);
    ecPhone = ecPhone ?? contact?.telecom?.find((t) => t.system === "phone")?.value ?? null;
    ecRelationship = ecRelationship ?? codeableText(contact?.relationship?.[0]);
  }

  // Prefer Coverage resource for insurance; fall back to Patient.identifier.
  let insuranceProvider: string | null = null;
  let policyNumber: string | null = null;
  const cov = coverages[0] as
    | (FhirResource & {
        payor?: Array<{ display?: string }>;
        subscriberId?: string;
        identifier?: Array<{ value?: string }>;
      })
    | undefined;
  if (cov) {
    insuranceProvider = cov.payor?.[0]?.display ?? null;
    policyNumber = cov.subscriberId ?? cov.identifier?.[0]?.value ?? null;
  }
  if (!insuranceProvider || !policyNumber) {
    const insurance = p.identifier?.find((i) => i.type?.text?.toLowerCase().includes("insur"));
    insuranceProvider = insuranceProvider ?? insurance?.system ?? null;
    policyNumber = policyNumber ?? insurance?.value ?? null;
  }

  return {
    mrn,
    first_name: name?.given?.[0] ?? null,
    last_name: name?.family ?? null,
    dob: p.birthDate ?? null,
    gender: p.gender ?? null,
    phone,
    address: addressLine,
    emergency_contact_name: ecName,
    emergency_contact_phone: ecPhone,
    emergency_contact_relationship: ecRelationship,
    insurance_provider: insuranceProvider,
    policy_number: policyNumber,
  };
}


function mapEncounter(
  mrn: string,
  r: FhirResource,
  sections: CompositionSections,
) {
  const e = r as FhirResource & {
    period?: { start?: string; end?: string };
    serviceProvider?: { display?: string };
    class?: { display?: string; code?: string };
    type?: unknown[];
    status?: string;
    reasonCode?: unknown[];
    diagnosis?: Array<{
      condition?: { display?: string };
      use?: { coding?: Array<{ code?: string }>; text?: string };
    }>;
    hospitalization?: {
      dischargeDisposition?: unknown;
    };
    text?: { div?: string };
  };
  const diagText = (use: string) => {
    const match = e.diagnosis?.find((d) => {
      const u = (d.use?.text ?? d.use?.coding?.[0]?.code ?? "").toLowerCase();
      return u.includes(use);
    });
    return match?.condition?.display ?? null;
  };
  const narrative = e.text?.div ? stripTags(e.text.div) : null;
  return {
    fhir_id: r.id ?? null,
    patient_mrn: mrn,
    encounter_date: e.period?.start ?? null,
    encounter_end_time: e.period?.end ?? null,
    facility: e.serviceProvider?.display ?? null,
    type: e.class?.display ?? e.class?.code ?? codeableText(e.type?.[0]) ?? null,
    status: e.status ?? null,
    chief_complaint: codeableText(e.reasonCode?.[0]),
    admitting_diagnosis:
      diagText("admit") ?? diagText("admission") ?? sections.admittingDiagnosis,
    discharge_diagnosis: diagText("discharge") ?? sections.dischargeDiagnosis,
    hospital_course: narrative ?? sections.hospitalCourse,
    hospital_course_narrative: sections.hospitalCourse ?? narrative,
    discharge_condition: codeableText(e.hospitalization?.dischargeDisposition),
    diet_instructions: sections.diet,
    activity_instructions: sections.activity,
    return_precautions: sections.returnPrecautions,
  };
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function categorizeCondition(c: { category?: unknown[]; clinicalStatus?: unknown }): string {
  const cats = (c.category ?? []).map((x) => (codeableText(x) ?? "").toLowerCase());
  const joined = cats.join(" ");
  if (joined.includes("family")) return "Family History";
  if (joined.includes("surgical") || joined.includes("procedure")) return "Past Surgical";
  if (joined.includes("hospitalization") || joined.includes("encounter-diagnosis"))
    return "Prior Hospitalization";
  if (joined.includes("problem-list") || joined.includes("problem")) return "Medical";
  return "Medical";
}

function mapCondition(mrn: string, r: FhirResource) {
  const c = r as FhirResource & {
    category?: unknown[];
    code?: unknown;
    clinicalStatus?: unknown;
    onsetDateTime?: string;
    bodySite?: unknown[];
    note?: Array<{ text?: string }>;
  };
  const bodySite = c.bodySite?.map((b) => codeableText(b)).filter(Boolean).join(", ") || null;
  const clinicalNote =
    c.note?.map((n) => n.text).filter(Boolean).join("\n") || null;
  return {
    fhir_id: r.id ?? null,
    patient_mrn: mrn,
    category: categorizeCondition(c),
    description: codeableText(c.code),
    clinical_status: codeableText(c.clinicalStatus),
    onset_date: c.onsetDateTime ? c.onsetDateTime.slice(0, 10) : null,
    body_site: bodySite,
    clinical_note: clinicalNote,
  };
}

type OptionalEncounterRow = { encounter_id: string | null };
type RequiredEncounterRow = { encounter_id: string };
type EncounterLookupClient = { from: (table: string) => any };

async function nullInvalidOptionalEncounterIds<T extends OptionalEncounterRow>(
  supabaseAdmin: EncounterLookupClient,
  rows: T[],
): Promise<T[]> {
  const candidateIds = Array.from(
    new Set(rows.map((row) => row.encounter_id).filter((id): id is string => Boolean(id))),
  );
  if (!candidateIds.length) return rows;

  const { data: existing } = await supabaseAdmin
    .from("encounters")
    .select("id")
    .in("id", candidateIds);
  const validIds = new Set(
    ((existing ?? []) as Array<{ id: string }>).map((row) => row.id),
  );

  return rows.map((row) =>
    row.encounter_id && !validIds.has(row.encounter_id)
      ? { ...row, encounter_id: null }
      : row,
  );
}

async function filterValidRequiredEncounterIds<T extends RequiredEncounterRow>(
  supabaseAdmin: EncounterLookupClient,
  rows: T[],
): Promise<T[]> {
  const candidateIds = Array.from(
    new Set(rows.map((row) => row.encounter_id).filter(Boolean)),
  );
  if (!candidateIds.length) return [];

  const { data: existing } = await supabaseAdmin
    .from("encounters")
    .select("id")
    .in("id", candidateIds);
  const validIds = new Set(
    ((existing ?? []) as Array<{ id: string }>).map((row) => row.id),
  );

  return rows.filter((row) => validIds.has(row.encounter_id));
}


function mapAllergy(mrn: string, r: FhirResource) {
  const a = r as FhirResource & {
    category?: string[];
    code?: unknown;
    criticality?: string;
    reaction?: Array<{ manifestation?: unknown[]; description?: string }>;
  };
  const reaction = a.reaction?.[0];
  return {
    fhir_id: r.id ?? null,
    patient_mrn: mrn,
    category: a.category?.[0] ?? null,
    substance: codeableText(a.code),
    criticality: a.criticality ?? null,
    reaction: reaction?.description ?? codeableText(reaction?.manifestation?.[0]),
  };
}

interface ObservationRow {
  fhir_id: string | null;
  patient_mrn: string;
  encounter_id: string | null;
  category: string | null;
  test_name: string | null;
  value: string | null;
  unit: string | null;
  effective_time: string | null;
}

function mapObservation(
  mrn: string,
  r: FhirResource,
  resolveEncounter: (ref?: string) => string | null,
): ObservationRow {
  const o = r as FhirResource & {
    category?: unknown[];
    code?: unknown;
    valueQuantity?: { value?: number; unit?: string };
    valueString?: string;
    valueCodeableConcept?: unknown;
    effectiveDateTime?: string;
    encounter?: { reference?: string };
  };
  const value =
    o.valueQuantity?.value !== undefined
      ? String(o.valueQuantity.value)
      : (o.valueString ?? codeableText(o.valueCodeableConcept));
  return {
    fhir_id: r.id ?? null,
    patient_mrn: mrn,
    encounter_id: resolveEncounter(refId(o.encounter)),
    category: codeableText(o.category?.[0]),
    test_name: codeableText(o.code),
    value: value ?? null,
    unit: o.valueQuantity?.unit ?? null,
    effective_time: o.effectiveDateTime ?? null,
  };
}

interface MedicationRow {
  fhir_id: string | null;
  patient_mrn: string;
  encounter_id: string | null;
  name: string | null;
  dosage: string | null;
  category: string;
  status: string | null;
  prescribed_date: string | null;
  prescriber: string | null;
}

function mapMedication(
  mrn: string,
  r: FhirResource,
  resolveEncounter: (ref?: string) => string | null,
): MedicationRow {
  const m = r as FhirResource & {
    medicationCodeableConcept?: unknown;
    medicationReference?: { display?: string };
    dosage?: Array<{ text?: string }>;
    dosageInstruction?: Array<{ text?: string }>;
    status?: string;
    authoredOn?: string;
    effectiveDateTime?: string;
    requester?: { display?: string };
    context?: { reference?: string };
    encounter?: { reference?: string };
  };
  const dosage = m.dosageInstruction?.[0]?.text ?? m.dosage?.[0]?.text ?? null;
  let category: string;
  switch (r.resourceType) {
    case "MedicationAdministration":
      category = "Administered";
      break;
    case "MedicationRequest":
      category = "Prescribed";
      break;
    default:
      category = "Outpatient";
  }
  return {
    fhir_id: r.id ?? null,
    patient_mrn: mrn,
    encounter_id: resolveEncounter(refId(m.context) ?? refId(m.encounter)),
    name: codeableText(m.medicationCodeableConcept) ?? firstText(m.medicationReference?.display),
    dosage,
    category,
    status: m.status ?? null,
    prescribed_date: (m.authoredOn ?? m.effectiveDateTime)?.slice(0, 10) ?? null,
    prescriber: m.requester?.display ?? null,
  };
}

interface CarePlanRow {
  fhir_id: string | null;
  encounter_id: string;
  patient_mrn: string;
  diet_instructions: string | null;
  activity_instructions: string | null;
  follow_up_details: string | null;
  return_precautions: string | null;
}

function mapCarePlan(
  mrn: string,
  r: FhirResource,
  resolveEncounter: (ref?: string) => string | null,
  sections: CompositionSections,
): CarePlanRow | null {
  const cp = r as FhirResource & {
    encounter?: { reference?: string };
    activity?: Array<{ detail?: { description?: string; code?: unknown } }>;
    description?: string;
    note?: Array<{ text?: string }>;
  };
  const encounterId = resolveEncounter(refId(cp.encounter));
  if (!encounterId) return null; // care_plans requires an encounter

  const lines = (cp.activity ?? [])
    .map((a) => ({
      label: codeableText(a.detail?.code)?.toLowerCase() ?? "",
      text: a.detail?.description ?? null,
    }))
    .filter((x) => x.text);

  const pick = (...needles: string[]) =>
    lines.find((l) => needles.some((n) => l.label.includes(n)))?.text ?? null;

  const noteText =
    cp.note?.map((n) => n.text).filter(Boolean).join(" ") || null;

  return {
    fhir_id: r.id ?? null,
    encounter_id: encounterId,
    patient_mrn: mrn,
    diet_instructions: pick("diet", "nutrition") ?? sections.diet,
    activity_instructions: pick("activity", "exercise") ?? sections.activity,
    follow_up_details:
      pick("follow", "visit", "appointment") ?? sections.followUp ?? cp.description ?? null,
    return_precautions:
      pick("return", "precaution", "warning") ?? sections.returnPrecautions ?? noteText,
  };
}

/* -------- Composition (discharge summary) parsing -------- */

interface CompositionSections {
  admittingDiagnosis: string | null;
  dischargeDiagnosis: string | null;
  hospitalCourse: string | null;
  diet: string | null;
  activity: string | null;
  followUp: string | null;
  returnPrecautions: string | null;
  patientEducation: string | null;
}

const EMPTY_SECTIONS: CompositionSections = {
  admittingDiagnosis: null,
  dischargeDiagnosis: null,
  hospitalCourse: null,
  diet: null,
  activity: null,
  followUp: null,
  returnPrecautions: null,
  patientEducation: null,
};

function parseCompositionSections(comp?: FhirResource): CompositionSections {
  if (!comp) return EMPTY_SECTIONS;
  const c = comp as FhirResource & {
    section?: Array<{
      title?: string;
      code?: unknown;
      text?: { div?: string };
    }>;
  };
  const out: CompositionSections = { ...EMPTY_SECTIONS };
  for (const s of c.section ?? []) {
    const label = (s.title ?? codeableText(s.code) ?? "").toLowerCase();
    const text = s.text?.div ? stripTags(s.text.div) : null;
    if (!text) continue;
    if (label.includes("admit")) out.admittingDiagnosis ??= text;
    else if (label.includes("discharge diagnosis") || (label.includes("discharge") && label.includes("diagnos")))
      out.dischargeDiagnosis ??= text;
    else if (label.includes("hospital course") || label.includes("course")) out.hospitalCourse ??= text;
    else if (label.includes("diet") || label.includes("nutrition")) out.diet ??= text;
    else if (label.includes("activity") || label.includes("exercise")) out.activity ??= text;
    else if (label.includes("follow")) out.followUp ??= text;
    else if (label.includes("return") || label.includes("precaution") || label.includes("warning"))
      out.returnPrecautions ??= text;
    else if (label.includes("education") || label.includes("instruction")) out.patientEducation ??= text;
  }
  return out;
}

function parseCompositionSectionsFromAll(compositions: FhirResource[]): CompositionSections {
  const out: CompositionSections = { ...EMPTY_SECTIONS };
  for (const comp of compositions) {
    const sections = parseCompositionSections(comp);
    out.admittingDiagnosis ??= sections.admittingDiagnosis;
    out.dischargeDiagnosis ??= sections.dischargeDiagnosis;
    out.hospitalCourse ??= sections.hospitalCourse;
    out.diet ??= sections.diet;
    out.activity ??= sections.activity;
    out.followUp ??= sections.followUp;
    out.returnPrecautions ??= sections.returnPrecautions;
    out.patientEducation ??= sections.patientEducation;
  }
  return out;
}

function buildCompositionProviderByEncounter(compositions: FhirResource[]): Record<string, string> {
  const byEncounter: Record<string, string> = {};
  for (const comp of compositions) {
    const c = comp as FhirResource & { encounter?: { reference?: string } };
    const encounterRef = normalizeFhirReference(c.encounter?.reference);
    if (!encounterRef || byEncounter[encounterRef]) continue;
    const provider = extractDoctorName(parseCompositionSections(comp).followUp) ?? extractDoctorName(compositionText(comp));
    if (provider) byEncounter[encounterRef] = provider;
  }
  return byEncounter;
}

function getBestCompositionProvider(compositions: FhirResource[]): string | null {
  for (const comp of compositions) {
    const provider = extractDoctorName(parseCompositionSections(comp).followUp);
    if (provider) return provider;
  }
  for (const comp of compositions) {
    const provider = extractDoctorName(compositionText(comp));
    if (provider) return provider;
  }
  return null;
}

function compositionText(comp?: FhirResource): string | null {
  if (!comp) return null;
  const c = comp as FhirResource & { section?: Array<{ text?: { div?: string } }> };
  const text = (c.section ?? [])
    .map((section) => (section.text?.div ? stripTags(section.text.div) : null))
    .filter(Boolean)
    .join("\n");
  return text || null;
}

/* -------- FamilyMemberHistory -------- */

interface FamilyHistoryRow {
  fhir_id: string | null;
  patient_mrn: string;
  relationship: string | null;
  condition_name: string | null;
  status: string | null;
  notes: string | null;
}

function mapFamilyMemberHistory(mrn: string, r: FhirResource): FamilyHistoryRow[] {
  const f = r as FhirResource & {
    relationship?: unknown;
    status?: string;
    note?: Array<{ text?: string }>;
    condition?: Array<{ code?: unknown; note?: Array<{ text?: string }> }>;
  };
  const relationship = codeableText(f.relationship);
  const status = f.status ?? null;
  const baseNotes =
    f.note?.map((n) => n.text).filter(Boolean).join(" ") || null;
  if (!f.condition || f.condition.length === 0) {
    return [
      {
        fhir_id: r.id ?? null,
        patient_mrn: mrn,
        relationship,
        condition_name: null,
        status,
        notes: baseNotes,
      },
    ];
  }
  return f.condition.map((cond, idx) => ({
    fhir_id: r.id ? `${r.id}-${idx}` : null,
    patient_mrn: mrn,
    relationship,
    condition_name: codeableText(cond.code),
    status,
    notes:
      cond.note?.map((n) => n.text).filter(Boolean).join(" ") || baseNotes,
  }));
}

/* -------- Appointments -------- */

interface AppointmentRow {
  fhir_id: string | null;
  patient_mrn: string;
  scheduled_for: string;
  status: string;
  provider: string | null;
  location: string | null;
  reason: string | null;
  notes: string | null;
  appointment_type: string | null;
  description: string | null;
}

function mapAppointment(
  mrn: string,
  r: FhirResource,
  resourceById: Record<string, FhirResource> = {},
  fallbackProvider: string | null = null,
  providerByEncounter: Record<string, string> = {},
): AppointmentRow | null {
  const a = r as FhirResource & {
    start?: string;
    status?: string;
    description?: string;
    comment?: string;
    appointmentType?: unknown;
    serviceType?: unknown[];
    reasonCode?: unknown[];
    participant?: Array<{
      actor?: { reference?: string; display?: string; type?: string };
      type?: unknown[];
    }>;
    supportingInformation?: Array<{ reference?: string }>;
    basedOn?: Array<{ reference?: string }>;
    slot?: Array<{ reference?: string }>;
  };
  if (!a.start) return null;
  let provider: string | null = null;
  let location: string | null = null;
  for (const p of a.participant ?? []) {
    const ref = p.actor?.reference ?? "";
    const display = p.actor?.display ?? null;
    // Skip the patient themselves.
    if (ref.startsWith("Patient") || p.actor?.type === "Patient") continue;
    if (ref.startsWith("Location") || p.actor?.type === "Location") {
      location = location ?? display;
      continue;
    }
    // Any remaining participant (Practitioner, PractitionerRole, RelatedPerson…)
    // is treated as the assigned provider.
    if (!provider) {
      let resolved = display;
      if (!resolved && ref) {
        const referenced = resourceById[ref];
        if (referenced) {
          resolved = nameFromPractitioner(referenced) ??
            (referenced as { name?: string }).name ?? null;
        }
      }
      if (resolved) provider = resolved;
    }
  }

  // FHIR Appointment.status maps to our enum: proposed/booked/cancelled/completed
  const rawStatus = (a.status ?? "proposed").toLowerCase();
  const status =
    rawStatus === "booked" || rawStatus === "cancelled" || rawStatus === "completed"
      ? rawStatus
      : "proposed";
  const encounterProvider = findAppointmentEncounterProvider(a, providerByEncounter);

  return {
    fhir_id: r.id ?? null,
    patient_mrn: mrn,
    scheduled_for: a.start,
    status,
    provider: provider ?? encounterProvider ?? fallbackProvider,
    location,
    reason: codeableText(a.reasonCode?.[0]) ?? codeableText(a.serviceType?.[0]),
    notes: a.comment ?? null,
    appointment_type: codeableText(a.appointmentType),
    description: a.description ?? null,
  };
}

function findAppointmentEncounterProvider(
  appointment: {
    supportingInformation?: Array<{ reference?: string }>;
    basedOn?: Array<{ reference?: string }>;
    slot?: Array<{ reference?: string }>;
  },
  providerByEncounter: Record<string, string>,
): string | null {
  const refs = [
    ...(appointment.supportingInformation ?? []),
    ...(appointment.basedOn ?? []),
    ...(appointment.slot ?? []),
  ]
    .map((item) => normalizeFhirReference(item.reference))
    .filter((ref): ref is string => Boolean(ref));
  const encounterRef = refs.find((ref) => ref.startsWith("Encounter/"));
  return encounterRef ? providerByEncounter[encounterRef] ?? null : null;
}

/**
 * Extract a clinician's name from free-text discharge instructions, e.g.
 *   "Follow up with Dr. Priya Shah, MD in 1 week"
 *   "Schedule an appointment with Dr Anika Roy"
 * Returns the cleanest matched name including credential suffix when present.
 */
 function extractDoctorName(text: string | null): string | null {
   if (!text) return null;
   // Debug: log exactly what the parser is seeing for the Follow-Up Care section
   try {
     // eslint-disable-next-line no-console
     console.log("[fhir-sync] Follow-Up Care text seen by parser:", text);
   } catch {}
   // Case-insensitive: "Dr." / "Dr" / "Doctor" + name words, optional credential suffix
   const re = /(?:Dr\.?|Doctor)\s+([A-Za-z][A-Za-z'’.\-]*(?:\s+[A-Za-z][A-Za-z'’.\-]*){0,3})(\s*,\s*([A-Za-z.]+))?/i;
   const m = text.match(re);
   if (!m) return null;
   const name = m[1].replace(/[\s,.;:!?-]+$/, "").trim();
   const suffixRaw = m[3] ? m[3].replace(/[\s,.;:!?-]+$/, "").trim() : "";
   const result = suffixRaw ? `Dr. ${name}, ${suffixRaw}` : `Dr. ${name}`;
   try {
     // eslint-disable-next-line no-console
     console.log("[fhir-sync] extractDoctorName matched:", result);
   } catch {}
   return result.replace(/\s+/g, " ").trim();
 }


/* -------- CareTeam -------- */


interface CareTeamRow {
  fhir_id: string | null;
  patient_mrn: string;
  member_key: string;
  name: string;
  role: string | null;
  organization: string | null;
}

function nameFromPractitioner(p: FhirResource | undefined): string | null {
  if (!p) return null;
  const r = p as { name?: Array<{ text?: string; prefix?: string[]; given?: string[]; family?: string; suffix?: string[] }> };
  const n = r.name?.[0];
  if (!n) return null;
  if (n.text) return n.text;
  const parts = [
    n.prefix?.join(" "),
    n.given?.join(" "),
    n.family,
    n.suffix?.join(" "),
  ].filter(Boolean);
  return parts.join(" ").trim() || null;
}

function mapCareTeam(
  mrn: string,
  r: FhirResource,
  resourceById: Record<string, FhirResource>,
  orgNameById: (ref: string | undefined) => string | null,
): CareTeamRow[] {
  const ct = r as FhirResource & {
    participant?: Array<{
      member?: { reference?: string; display?: string; type?: string };
      role?: unknown[] | unknown;
      onBehalfOf?: { reference?: string; display?: string };
    }>;
  };
  const rows: CareTeamRow[] = [];
  for (const p of ct.participant ?? []) {
    const ref = p.member?.reference ?? "";
    // Resolve display name: prefer participant display, else look up Practitioner.
    let name = p.member?.display ?? null;
    if (!name && ref) {
      const referenced = resourceById[ref];
      name =
        nameFromPractitioner(referenced) ??
        (referenced as { name?: string } | undefined)?.name ??
        null;
    }
    if (!name) continue;

    // Role: participant.role is typically an array of CodeableConcept.
    let role: string | null = null;
    const roleVal = p.role;
    if (Array.isArray(roleVal)) role = codeableText(roleVal[0]);
    else if (roleVal) role = codeableText(roleVal);

    // If member is a PractitionerRole, fall back to its code/specialty for the role.
    if (!role && ref.startsWith("PractitionerRole/")) {
      const pr = resourceById[ref] as
        | (FhirResource & { code?: unknown[]; specialty?: unknown[] })
        | undefined;
      role =
        codeableText(pr?.code?.[0]) ??
        codeableText(pr?.specialty?.[0]) ??
        null;
    }

    const organization =
      p.onBehalfOf?.display ??
      orgNameById(p.onBehalfOf?.reference) ??
      null;

    // Stable per-patient key so the same FHIR participant upserts cleanly
    // even when the parent CareTeam resource id changes between bundles.
    const memberKey = ref || `${name}|${role ?? ""}`;

    rows.push({
      fhir_id: r.id ?? null,
      patient_mrn: mrn,
      member_key: memberKey,
      name,
      role,
      organization,
    });
  }
  return rows;
}

