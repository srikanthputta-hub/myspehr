import { useSharedPatientData } from "../_shared/patient-data-store";
import { useActiveMrn } from "../_shared/use-active-mrn";
import {
  useFhirMedications,
  useFhirComposition,
  useFhirObservationsAll,
} from "@/lib/fhir-live";

export interface ProviderItem {
  id: string;
  name: string;
  role: string;
  organization?: string | null;
  isFallback?: boolean;
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const NON_HUMAN_PATTERNS = [
  /central laboratory/i,
  /^lab(oratory)?$/i,
  /radiology/i,
  /pharmacy/i,
  /imaging/i,
  /support desk/i,
  /system/i,
  /^unknown$/i,
];

function looksLikePerson(name: string | undefined | null): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (trimmed.length < 3) return false;
  if (NON_HUMAN_PATTERNS.some((r) => r.test(trimmed))) return false;
  // Accept if it has a Dr. prefix or two capitalized tokens.
  if (/\bdr\.?\b/i.test(trimmed)) return true;
  const tokens = trimmed.replace(/[,.]/g, "").split(/\s+/).filter(Boolean);
  const caps = tokens.filter((t) => /^[A-Z][a-zA-Z'-]+$/.test(t));
  return caps.length >= 2;
}

function normalizeName(name: string): string {
  return name.trim().replace(/[,;]+$/, "").replace(/\s+/g, " ");
}

/**
 * Care team for the active MRN. Priority order:
 *   1. Discrete FHIR CareTeam.participant (via local snapshot).
 *   2. Human names parsed out of MedicationRequest.requester,
 *      Observation.performer, and Composition.author.
 *   3. Hospital support-desk fallback derived from encounter facility.
 */
export function useProviders(): { providers: ProviderItem[]; loading: boolean } {
  const mrn = useActiveMrn();
  const { careTeam, encounters, loading } = useSharedPatientData(mrn);
  const medsQ = useFhirMedications(mrn);
  const compsQ = useFhirComposition(mrn);
  const obsQ = useFhirObservationsAll(mrn);

  // 1) Discrete CareTeam
  if (careTeam.length > 0) {
    const seen = new Set<string>();
    const providers: ProviderItem[] = [];
    for (const m of careTeam) {
      const id = slug(m.name) || slug(m.member_key);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      providers.push({
        id,
        name: m.name,
        role: m.role?.trim() || "Care team member",
        organization: m.organization,
      });
    }
    if (providers.length > 0) return { providers, loading };
  }

  // 2) Expanded human-name parse
  const parsed: ProviderItem[] = [];
  const seenIds = new Set<string>();

  const add = (rawName: string | undefined | null, role: string, organization?: string | null) => {
    if (!looksLikePerson(rawName)) return;
    const name = normalizeName(rawName!);
    const id = slug(name);
    if (!id || seenIds.has(id)) return;
    seenIds.add(id);
    parsed.push({ id, name, role, organization: organization ?? null });
  };

  for (const m of medsQ.data ?? []) {
    add(m.requester?.display, "Prescriber");
  }
  for (const c of compsQ.data ?? []) {
    for (const author of c.author ?? []) {
      add(author.display, "Discharging Physician");
    }
  }
  for (const o of obsQ.data ?? []) {
    const performers = (o as unknown as { performer?: Array<{ display?: string; reference?: string }> }).performer ?? [];
    for (const p of performers) {
      // Prefer Practitioner references; otherwise rely on looksLikePerson.
      const role = p.reference?.startsWith("Practitioner/") ? "Attending" : "Attending";
      add(p.display, role);
    }
  }

  if (parsed.length > 0) {
    return {
      providers: parsed,
      loading: loading && medsQ.isLoading && compsQ.isLoading && obsQ.isLoading,
    };
  }

  // 3) Hospital support-desk fallback
  const facility =
    encounters.find((e) => e.facility?.trim())?.facility?.trim() ?? null;
  const fallbackName = facility
    ? `${facility} Support Desk`
    : "Hospital Support Desk";

  return {
    providers: [
      {
        id: "support-desk",
        name: fallbackName,
        role: "Patient support",
        organization: facility,
        isFallback: true,
      },
    ],
    loading: loading && medsQ.isLoading && compsQ.isLoading && obsQ.isLoading,
  };
}
