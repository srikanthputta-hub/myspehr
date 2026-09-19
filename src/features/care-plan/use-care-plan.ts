import { useSharedPatientData } from "../_shared/patient-data-store";
import { useActiveMrn } from "../_shared/use-active-mrn";
import { extractSections } from "../_shared/parse-sections";

export interface CarePlanSlice {
  diet: string[];
  activity: string[];
  returnPrecautions: string[];
  education: string[];
  loading: boolean;
}

/**
 * Care plan → `care_plans` table.
 * Source narratives often arrive as one markdown blob with inline
 * `**Diet:**` / `**Activity:**` / etc. markers — extract only those.
 */
export function useCarePlan(): CarePlanSlice {
  const mrn = useActiveMrn();
  const { carePlans, loading } = useSharedPatientData(mrn);
  const diet: string[] = [];
  const activity: string[] = [];
  const returnPrecautions: string[] = [];
  const education: string[] = [];

  for (const cp of carePlans) {
    // Pool every text field so we can scan for inline section markers
    // regardless of which column the source dumped them into.
    const pool = [
      cp.diet_instructions,
      cp.activity_instructions,
      cp.return_precautions,
      cp.follow_up_details,
    ].filter(Boolean) as string[];

    for (const blob of pool) {
      diet.push(...extractSections(blob, ["diet", "nutrition"]));
      activity.push(...extractSections(blob, ["activity", "exercise"]));
      returnPrecautions.push(
        ...extractSections(blob, ["return precaution", "return precautions", "when to seek", "warning signs"]),
      );
      education.push(...extractSections(blob, ["patient education", "education"]));
    }

    // Fallbacks: if no marker matched but the column has a short value
    // (no other markers), trust the column as-is.
    const hasMarker = (s: string) => /\*\*[^*]+\*\*/.test(s);
    if (cp.diet_instructions && !hasMarker(cp.diet_instructions) && diet.length === 0) {
      diet.push(cp.diet_instructions);
    }
    if (cp.activity_instructions && !hasMarker(cp.activity_instructions) && activity.length === 0) {
      activity.push(cp.activity_instructions);
    }
  }

  return {
    diet: dedupe(diet),
    activity: dedupe(activity),
    returnPrecautions: dedupe(returnPrecautions),
    education: dedupe(education),
    loading,
  };
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
}
