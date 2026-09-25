/**
 * Live FHIR reads via the /api/fhir-proxy route. Every clinical page reads
 * from here so SPEHR-side writes appear within the same ~30–60s window
 * Medblocks already provides. No local Supabase snapshot involved.
 */
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useCallback } from "react";
import { fhirProxy } from "./fhir-proxy-client";

/* ------------ FHIR resource types (only the fields we use) ------------- */

export interface FhirBundle<T> {
  resourceType: "Bundle";
  entry?: Array<{ resource?: T }>;
}

export interface FhirMeta {
  lastUpdated?: string;
  tag?: Array<{ system?: string; code?: string }>;
}

export interface FhirPatient {
  resourceType: "Patient";
  id: string;
  name?: Array<{ text?: string; given?: string[]; family?: string; use?: string }>;
  gender?: string;
  birthDate?: string;
  telecom?: Array<{ system?: string; value?: string; use?: string }>;
  address?: Array<{ text?: string; line?: string[]; city?: string; state?: string; postalCode?: string; country?: string }>;
  identifier?: Array<{ system?: string; value?: string }>;
  contact?: Array<{
    name?: { text?: string; given?: string[]; family?: string };
    telecom?: Array<{ system?: string; value?: string }>;
    relationship?: Array<{ text?: string; coding?: Array<{ display?: string }> }>;
  }>;
  meta?: FhirMeta;
}

export interface FhirCoding {
  system?: string;
  code?: string;
  display?: string;
}

export interface FhirCodeableConcept {
  text?: string;
  coding?: FhirCoding[];
}

export interface FhirMedicationRequest {
  resourceType: "MedicationRequest";
  id: string;
  status?: string; // active | on-hold | cancelled | completed | stopped | draft
  intent?: string; // order | plan | proposal
  authoredOn?: string;
  medicationCodeableConcept?: FhirCodeableConcept;
  medicationReference?: { display?: string };
  dosageInstruction?: Array<{ text?: string }>;
  requester?: { display?: string; reference?: string };
  category?: FhirCodeableConcept[];
  meta?: FhirMeta;
}

export interface FhirCondition {
  resourceType: "Condition";
  id: string;
  code?: FhirCodeableConcept;
  clinicalStatus?: FhirCodeableConcept;
  verificationStatus?: FhirCodeableConcept;
  category?: FhirCodeableConcept[];
  bodySite?: FhirCodeableConcept[];
  onsetDateTime?: string;
  recordedDate?: string;
  note?: Array<{ text?: string }>;
  meta?: FhirMeta;
}

export interface FhirAllergyIntolerance {
  resourceType: "AllergyIntolerance";
  id: string;
  code?: FhirCodeableConcept;
  criticality?: string;
  reaction?: Array<{
    manifestation?: FhirCodeableConcept[];
    severity?: string;
    description?: string;
  }>;
  clinicalStatus?: FhirCodeableConcept;
  meta?: FhirMeta;
}

export interface FhirObservationComponent {
  code?: FhirCodeableConcept;
  valueQuantity?: { value?: number; unit?: string };
  valueString?: string;
}

export interface FhirObservation {
  resourceType: "Observation";
  id: string;
  status?: string;
  code?: FhirCodeableConcept;
  category?: FhirCodeableConcept[];
  effectiveDateTime?: string;
  issued?: string;
  valueQuantity?: { value?: number; unit?: string };
  valueString?: string;
  valueCodeableConcept?: FhirCodeableConcept;
  component?: FhirObservationComponent[];
  referenceRange?: Array<{ low?: { value?: number; unit?: string }; high?: { value?: number; unit?: string }; text?: string }>;
  interpretation?: FhirCodeableConcept[];
  performer?: Array<{ display?: string; reference?: string }>;
  meta?: FhirMeta;
}

export interface FhirEncounter {
  resourceType: "Encounter";
  id: string;
  status?: string;
  class?: { code?: string; display?: string };
  type?: FhirCodeableConcept[];
  period?: { start?: string; end?: string };
  reasonCode?: FhirCodeableConcept[];
  location?: Array<{ location?: { display?: string } }>;
  serviceProvider?: { display?: string };
  meta?: FhirMeta;
}

export interface FhirCompositionSection {
  title?: string;
  code?: FhirCodeableConcept;
  text?: { status?: string; div?: string };
  section?: FhirCompositionSection[];
  entry?: Array<{ reference?: string; display?: string }>;
}

export interface FhirComposition {
  resourceType: "Composition";
  id: string;
  status?: string;
  date?: string;
  title?: string;
  type?: FhirCodeableConcept;
  section?: FhirCompositionSection[];
  author?: Array<{ display?: string; reference?: string }>;
  meta?: FhirMeta;
}

export interface FhirAppointment {
  resourceType: "Appointment";
  id: string;
  status?: string;
  description?: string;
  appointmentType?: FhirCodeableConcept;
  serviceType?: FhirCodeableConcept[];
  start?: string;
  end?: string;
  comment?: string;
  participant?: Array<{
    actor?: { reference?: string; display?: string };
    status?: string;
  }>;
  location?: Array<{ display?: string }>;
  meta?: FhirMeta;
}

/** True for a spehr-originated post-discharge recall Appointment (Phase D):
 * appointmentType coded v2-0276 FOLLOWUP, or the `urn:spehr:appointment-origin`
 * tag set to `recall`. */
export function isRecallAppointment(a: FhirAppointment): boolean {
  const typeCode = a.appointmentType?.coding?.some((c) => c.code === "FOLLOWUP");
  const originTag = (a.meta?.tag ?? []).some(
    (t) => t.system === "urn:spehr:appointment-origin" && t.code === "recall",
  );
  return !!typeCode || originTag;
}

export interface FhirExtension {
  url?: string;
  valueString?: string;
  valueDecimal?: number;
  valueMoney?: { value?: number; currency?: string };
}

export interface FhirChargeItem {
  resourceType: "ChargeItem";
  id: string;
  status?: string;
  code?: FhirCodeableConcept;
  subject?: { reference?: string };
  quantity?: { value?: number };
  priceOverride?: { value?: number; currency?: string };
  extension?: FhirExtension[];
  supportingInformation?: Array<{ reference?: string }>;
  performer?: Array<{ actor?: { display?: string; reference?: string } }>;
  meta?: FhirMeta;
}

export interface FhirInvoiceFull {
  resourceType: "Invoice";
  id: string;
  status?: string;
  date?: string;
  totalGross?: { value?: number; currency?: string };
  totalNet?: { value?: number; currency?: string };
  identifier?: Array<{ value?: string; system?: string }>;
  type?: FhirCodeableConcept;
  issuer?: { display?: string; reference?: string };
  subject?: { reference?: string; display?: string };
  meta?: FhirMeta;
}

export interface FhirDocumentReference {
  resourceType: "DocumentReference";
  id: string;
  status?: string;
  date?: string;
  description?: string;
  type?: FhirCodeableConcept;
  content?: Array<{ attachment?: { contentType?: string; url?: string; data?: string; title?: string } }>;
  meta?: FhirMeta;
}

/* ---------- Utilities ---------- */

function entries<T>(bundle: FhirBundle<T> | null | undefined, kind: string): T[] {
  return (bundle?.entry ?? [])
    .map((e) => e.resource)
    .filter((r): r is T => !!r && (r as { resourceType?: string }).resourceType === kind);
}

/** Strip XHTML narrative (`text.div`) into readable text. */
export function stripNarrative(div: string | undefined | null): string {
  if (!div) return "";
  return div
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Turn stripped narrative into an array of bullet-friendly lines. */
export function narrativeToLines(div: string | undefined | null): string[] {
  const text = stripNarrative(div);
  if (!text) return [];
  return text
    .split(/\n+|(?:^|\s)[•·]\s+/)
    .map((s) => s.replace(/^[-*·•\s]+/, "").trim())
    .filter(Boolean);
}

/* ---------- Generic hook ---------- */

interface UseLiveFhirOpts<TOut> {
  key: readonly unknown[];
  path: string;
  query?: Record<string, string | number | undefined | null>;
  select: (raw: unknown) => TOut;
  enabled?: boolean;
  refetchIntervalMs?: number;
}

export function useLiveFhir<TOut>(opts: UseLiveFhirOpts<TOut>): UseQueryResult<TOut, Error> & {
  refresh: () => Promise<unknown>;
} {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: opts.key,
    enabled: opts.enabled ?? true,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchInterval: opts.refetchIntervalMs ?? 30_000,
    queryFn: async () => {
      const res = await fhirProxy({ method: "GET", path: opts.path, query: opts.query });
      if (!res.ok) throw new Error(`FHIR ${res.status}: ${res.raw.slice(0, 200) || "request failed"}`);
      return opts.select(res.data);
    },
  });
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: opts.key }), [qc, opts.key]);
  return Object.assign(q, { refresh });
}

/* ---------- Resource-specific helpers ---------- */

export function useFhirPatient(mrn: string | null) {
  return useLiveFhir<FhirPatient | null>({
    key: ["fhir", "Patient", mrn],
    path: `/Patient/${mrn ?? ""}`,
    enabled: !!mrn,
    select: (raw) =>
      raw && (raw as { resourceType?: string }).resourceType === "Patient"
        ? (raw as FhirPatient)
        : null,
  });
}

export function useFhirMedications(mrn: string | null) {
  return useLiveFhir<FhirMedicationRequest[]>({
    key: ["fhir", "MedicationRequest", mrn],
    path: "/MedicationRequest",
    query: { subject: `Patient/${mrn}`, _sort: "-authoredon", _count: 200 },
    enabled: !!mrn,
    select: (raw) => entries<FhirMedicationRequest>(raw as FhirBundle<FhirMedicationRequest>, "MedicationRequest"),
  });
}

export function useFhirConditions(mrn: string | null) {
  return useLiveFhir<FhirCondition[]>({
    key: ["fhir", "Condition", mrn],
    path: "/Condition",
    query: { subject: `Patient/${mrn}`, _count: 200 },
    enabled: !!mrn,
    select: (raw) => entries<FhirCondition>(raw as FhirBundle<FhirCondition>, "Condition"),
  });
}

export function useFhirAllergies(mrn: string | null) {
  return useLiveFhir<FhirAllergyIntolerance[]>({
    key: ["fhir", "AllergyIntolerance", mrn],
    path: "/AllergyIntolerance",
    query: { patient: `Patient/${mrn}`, _count: 200 },
    enabled: !!mrn,
    select: (raw) =>
      entries<FhirAllergyIntolerance>(raw as FhirBundle<FhirAllergyIntolerance>, "AllergyIntolerance"),
  });
}

export function useFhirVitals(mrn: string | null) {
  return useLiveFhir<FhirObservation[]>({
    key: ["fhir", "Observation", "vital-signs", mrn],
    path: "/Observation",
    query: { subject: `Patient/${mrn}`, category: "vital-signs", _sort: "-date", _count: 200 },
    enabled: !!mrn,
    select: (raw) => entries<FhirObservation>(raw as FhirBundle<FhirObservation>, "Observation"),
  });
}

export function useFhirLabs(mrn: string | null) {
  return useLiveFhir<FhirObservation[]>({
    key: ["fhir", "Observation", "laboratory", mrn],
    path: "/Observation",
    query: { subject: `Patient/${mrn}`, category: "laboratory", _sort: "-date", _count: 200 },
    enabled: !!mrn,
    select: (raw) => entries<FhirObservation>(raw as FhirBundle<FhirObservation>, "Observation"),
  });
}

export function useFhirEncounters(mrn: string | null) {
  return useLiveFhir<FhirEncounter[]>({
    key: ["fhir", "Encounter", mrn],
    path: "/Encounter",
    query: { subject: `Patient/${mrn}`, _sort: "-date", _count: 100 },
    enabled: !!mrn,
    select: (raw) => entries<FhirEncounter>(raw as FhirBundle<FhirEncounter>, "Encounter"),
  });
}

export function useFhirComposition(mrn: string | null) {
  return useLiveFhir<FhirComposition[]>({
    key: ["fhir", "Composition", mrn],
    path: "/Composition",
    query: { subject: `Patient/${mrn}`, _sort: "-date", _count: 20 },
    enabled: !!mrn,
    select: (raw) => entries<FhirComposition>(raw as FhirBundle<FhirComposition>, "Composition"),
  });
}

export function useFhirDocumentReferences(mrn: string | null) {
  return useLiveFhir<FhirDocumentReference[]>({
    key: ["fhir", "DocumentReference", mrn],
    path: "/DocumentReference",
    query: { subject: `Patient/${mrn}`, _sort: "-date", _count: 50 },
    enabled: !!mrn,
    select: (raw) =>
      entries<FhirDocumentReference>(raw as FhirBundle<FhirDocumentReference>, "DocumentReference"),
  });
}

/* ---------- Field helpers ---------- */

export function conceptText(c?: FhirCodeableConcept | null): string {
  if (!c) return "";
  if (c.text) return c.text;
  const d = c.coding?.find((x) => x.display)?.display;
  return d ?? "";
}

export function conceptListText(list?: FhirCodeableConcept[] | null): string {
  if (!list?.length) return "";
  return list.map(conceptText).filter(Boolean).join(", ");
}

export function fhirName(p: FhirPatient | null | undefined): { full: string; first: string } {
  if (!p) return { full: "", first: "" };
  const official = p.name?.find((n) => n.use === "official") ?? p.name?.[0];
  if (!official) return { full: "", first: "" };
  const first = official.given?.[0] ?? "";
  const full = official.text ?? [official.given?.join(" "), official.family].filter(Boolean).join(" ");
  return { full: full || first || "", first: first || full || "" };
}

export function medicationName(m: FhirMedicationRequest): string {
  return (
    conceptText(m.medicationCodeableConcept) ||
    m.medicationReference?.display ||
    "Medication"
  );
}

/**
 * Group a MedicationRequest by SPEHR's clinical bucketing:
 *   - `active` + inpatient category → Administered (given during encounter)
 *   - `active` + no encounter link / outpatient category → Outpatient
 *   - anything else that isn't clearly outpatient → Prescribed
 * We only have `status` and free-text category to work with; use best effort.
 */
export type MedGroup = "administered" | "prescribed" | "outpatient";

export function medicationGroup(m: FhirMedicationRequest): MedGroup {
  const status = (m.status ?? "").toLowerCase();
  const cats = (m.category ?? []).map((c) => conceptText(c).toLowerCase());
  const isInpatient = cats.some((c) => c.includes("inpatient") || c.includes("discharge") === false && c.includes("hospital"));
  const isOutpatient = cats.some((c) => c.includes("outpatient") || c.includes("community") || c.includes("discharge"));
  if (status === "completed" || status === "stopped") return "administered";
  if (status === "active" && isInpatient) return "administered";
  if (status === "active" && isOutpatient) return "outpatient";
  if (status === "active") return "outpatient";
  return "prescribed";
}

export function useFhirAppointments(mrn: string | null) {
  return useLiveFhir<FhirAppointment[]>({
    key: ["fhir", "Appointment", mrn],
    path: "/Appointment",
    query: { patient: `Patient/${mrn}`, _sort: "-date", _count: 100 },
    enabled: !!mrn,
    select: (raw) => entries<FhirAppointment>(raw as FhirBundle<FhirAppointment>, "Appointment"),
  });
}

export function useFhirObservationsAll(mrn: string | null) {
  return useLiveFhir<FhirObservation[]>({
    key: ["fhir", "Observation", "all", mrn],
    path: "/Observation",
    query: { subject: `Patient/${mrn}`, _sort: "-date", _count: 500 },
    enabled: !!mrn,
    select: (raw) => entries<FhirObservation>(raw as FhirBundle<FhirObservation>, "Observation"),
  });
}

/** Observation value → single display string ("120/80 mmHg", "98 %"). */
export function observationValue(o: FhirObservation): string {
  if (o.valueQuantity?.value !== undefined) {
    return `${o.valueQuantity.value}${o.valueQuantity.unit ? " " + o.valueQuantity.unit : ""}`;
  }
  if (o.valueString) return o.valueString;
  if (o.valueCodeableConcept) return conceptText(o.valueCodeableConcept);
  if (o.component?.length) {
    return o.component
      .map((c) => {
        if (c.valueQuantity?.value !== undefined) {
          return `${c.valueQuantity.value}${c.valueQuantity.unit ? " " + c.valueQuantity.unit : ""}`;
        }
        return c.valueString ?? "";
      })
      .filter(Boolean)
      .join(" / ");
  }
  return "—";
}

/* ---------- Deduplication helpers ---------- */

export function dedupeMedications(list: FhirMedicationRequest[]): FhirMedicationRequest[] {
  const seen = new Set<string>();
  const out: FhirMedicationRequest[] = [];
  for (const m of list) {
    const key = [
      medicationName(m).toLowerCase().trim(),
      (m.status ?? "").toLowerCase(),
      (m.dosageInstruction?.[0]?.text ?? "").toLowerCase().trim(),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

export function dedupeObservations(list: FhirObservation[]): FhirObservation[] {
  const seen = new Set<string>();
  const out: FhirObservation[] = [];
  for (const o of list) {
    const key = [
      conceptText(o.code).toLowerCase().trim(),
      o.effectiveDateTime ?? o.issued ?? "",
      observationValue(o),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out;
}

/* ---------- Vital-sign classification ---------- */

export type VitalKind = "hr" | "bp" | "rr" | "spo2" | "temp";

const LOINC_TO_VITAL: Record<string, VitalKind> = {
  "8867-4": "hr",
  "85354-9": "bp",
  "8480-6": "bp",
  "8462-4": "bp",
  "9279-1": "rr",
  "2708-6": "spo2",
  "59408-5": "spo2",
  "8310-5": "temp",
  "8331-1": "temp",
};

export const VITAL_LABEL: Record<VitalKind, string> = {
  hr: "Heart Rate",
  bp: "Blood Pressure",
  rr: "Respiratory Rate",
  spo2: "SpO₂",
  temp: "Body Temperature",
};

export function vitalKind(o: FhirObservation): VitalKind | null {
  const codes = o.code?.coding ?? [];
  for (const c of codes) {
    if (c.code && LOINC_TO_VITAL[c.code]) return LOINC_TO_VITAL[c.code];
  }
  const text = conceptText(o.code).toLowerCase();
  if (!text) return null;
  if (/(heart rate|pulse)/.test(text)) return "hr";
  if (/(blood pressure|systolic|diastolic|bp)/.test(text)) return "bp";
  if (/(respiratory rate|resp rate)/.test(text)) return "rr";
  if (/(oxygen|spo2|sp02|sao2)/.test(text)) return "spo2";
  if (/(temperature|temp)/.test(text)) return "temp";
  return null;
}

export function isVitalSign(o: FhirObservation): boolean {
  const cats = o.category ?? [];
  for (const cat of cats) {
    for (const c of cat.coding ?? []) {
      if (c.code === "vital-signs") return true;
    }
    if ((cat.text ?? "").toLowerCase().includes("vital")) return true;
  }
  return vitalKind(o) !== null;
}

/** Return the latest single observation per canonical vital sign kind. */
export function latestVitalsByKind(list: FhirObservation[]): Array<{ kind: VitalKind; label: string; obs: FhirObservation }> {
  const sorted = [...list].sort((a, b) => {
    const ta = new Date(a.effectiveDateTime ?? a.issued ?? 0).getTime();
    const tb = new Date(b.effectiveDateTime ?? b.issued ?? 0).getTime();
    return tb - ta;
  });
  const seen = new Map<VitalKind, FhirObservation>();
  for (const o of sorted) {
    const k = vitalKind(o);
    if (!k || seen.has(k)) continue;
    seen.set(k, o);
  }
  const order: VitalKind[] = ["hr", "bp", "rr", "spo2", "temp"];
  return order
    .filter((k) => seen.has(k))
    .map((k) => ({ kind: k, label: VITAL_LABEL[k], obs: seen.get(k)! }));
}
