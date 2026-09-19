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

const FOLLOWUP_RE =
  /follow[-\s]?up\s+with\s+([^.\n,]+?)(?:\s+within\s+(\d+)\s*(day|days|week|weeks))?[.\n,]/i;

export function parseFollowUp(comp: FhirComposition | undefined): DerivedFollowUp | null {
  if (!comp) return null;
  const text = allText(comp);
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
