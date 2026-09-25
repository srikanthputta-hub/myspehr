import { useMemo } from "react";
import {
  useFhirComposition,
  stripNarrative,
  type FhirComposition,
  type FhirCompositionSection,
} from "@/lib/fhir-live";

export interface DerivedFollowUp {
  id: string;
  providerName: string | null;
  dueByIso: string;
  sourceCompositionId: string;
  note: string;
}

function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/[,;.]+$/, "")
    .replace(/\s+/g, " ")
    .replace(/\s*(md|do|np|pa|rn|mbbs|phd)\.?$/i, "");
}

function collectText(section: FhirCompositionSection | undefined): string {
  if (!section) return "";
  const parts: string[] = [];
  if (section.text?.div) parts.push(stripNarrative(section.text.div));
  for (const child of section.section ?? []) parts.push(collectText(child));
  return parts.join("\n");
}

function allText(comp: FhirComposition): string {
  const chunks: string[] = [];
  for (const s of comp.section ?? []) chunks.push(collectText(s));
  return chunks.join("\n");
}

/** Recursively find the "Follow-Up ..." section (e.g. spehr's "Follow-Up Care"). */
function findFollowUpSection(
  sections: FhirCompositionSection[] | undefined,
): FhirCompositionSection | undefined {
  for (const s of sections ?? []) {
    if (s.title && /follow[-\s]?up/i.test(s.title)) return s;
    const nested = findFollowUpSection(s.section);
    if (nested) return nested;
  }
  return undefined;
}

/** True when the Follow-Up section already links a real Appointment resource
 * (Phase D's `narrativeSection(..., [{reference: urn(apptId)}])`) — a real
 * appointment already covers this, so the client-derived card should not
 * also render. */
function followUpSectionHasAppointmentEntry(section: FhirCompositionSection | undefined): boolean {
  return (section?.entry ?? []).some((e) => (e.reference ?? "").includes("Appointment/") || (e.reference ?? "").startsWith("urn:uuid:"));
}

// Fixed: the previous pattern `[^.\n,]+?` stopped at the first period, so a
// name like "Dr. Alan Reyes, MD" only ever matched up to "Dr" before hitting
// the period in "Dr.". This version tolerates a leading "Dr." and a trailing
// credential suffix, and stops on comma/newline (not period) so "Dr. Alan
// Reyes" parses as the provider name.
const FOLLOWUP_RE =
  /follow[-\s]?up\s+with\s+((?:dr\.?\s+)?[^\n,]+?)(?:,\s*(?:md|do|np|pa))?\s+within\s+(\d+)\s*(day|days|week|weeks)/i;

export function parseFollowUp(comp: FhirComposition | undefined): DerivedFollowUp | null {
  if (!comp) return null;

  const followUpSection = findFollowUpSection(comp.section);
  // A real recall Appointment already exists for this discharge — don't show
  // the client-derived suggestion card on top of it.
  if (followUpSectionHasAppointmentEntry(followUpSection)) return null;

  const text = followUpSection ? collectText(followUpSection) : allText(comp);
  if (!text) return null;
  const m = FOLLOWUP_RE.exec(text);
  if (!m) return null;

  const providerName = m[1] ? normalizeName(m[1]) : null;
  const days = m[2]
    ? Number(m[2]) * (m[3]?.toLowerCase().startsWith("week") ? 7 : 1)
    : 7;

  const base = comp.date ? new Date(comp.date) : new Date();
  const due = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

  return {
    id: `derived:${comp.id}`,
    providerName: providerName && providerName.length >= 3 ? providerName : null,
    dueByIso: due.toISOString(),
    sourceCompositionId: comp.id,
    note: m[0].replace(/[.,\n]$/, "").trim(),
  };
}

export function useDerivedFollowUp(mrn: string | null): {
  followUp: DerivedFollowUp | null;
  loading: boolean;
} {
  const compsQ = useFhirComposition(mrn);
  const followUp = useMemo(() => {
    const list = compsQ.data ?? [];
    if (list.length === 0) return null;
    // Compositions are already sorted -date; take the newest with a parseable follow-up.
    for (const c of list) {
      const parsed = parseFollowUp(c);
      if (parsed) return parsed;
    }
    return null;
  }, [compsQ.data]);
  return { followUp, loading: compsQ.isLoading };
}
