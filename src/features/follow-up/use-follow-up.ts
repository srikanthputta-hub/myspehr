import { useSharedPatientData } from "../_shared/patient-data-store";
import { useActiveMrn } from "../_shared/use-active-mrn";
import { extractSections } from "../_shared/parse-sections";

export interface FollowUpItem {
  id: string;
  details: string;
}

/**
 * Follow-up → strictly the `**Follow-Up Care**` / `**Follow-Up:**` section
 * extracted from any care_plans text column. Diet, activity, diagnoses,
 * history etc. are excluded.
 */
export function useFollowUp() {
  const mrn = useActiveMrn();
  const { carePlans, loading } = useSharedPatientData(mrn);
  const items: FollowUpItem[] = [];

  for (const cp of carePlans) {
    const pool = [
      cp.follow_up_details,
      cp.return_precautions,
      cp.diet_instructions,
      cp.activity_instructions,
    ].filter(Boolean) as string[];

    const sections: string[] = [];
    for (const blob of pool) {
      sections.push(...extractSections(blob, ["follow-up care", "follow up care", "follow-up", "follow up"]));
    }
    // Each section may be a markdown list — split into individual bullets so
    // every "- ..." line becomes its own follow-up item.
    const found: string[] = [];
    for (const section of sections) {
      const bullets = section
        .split(/\n(?=[-*]\s)/)
        .map((b) => b.replace(/^[-*]\s+/, "").replace(/\s+/g, " ").trim())
        .filter(Boolean);
      if (bullets.length > 0) found.push(...bullets);
      else found.push(section.replace(/\s+/g, " ").trim());
    }

    // Fallback: if no marker was found and follow_up_details has no other
    // markers at all, use it directly.
    if (found.length === 0 && cp.follow_up_details && !/\*\*[^*]+\*\*/.test(cp.follow_up_details)) {
      found.push(cp.follow_up_details);
    }

    const seen = new Set<string>();
    found.forEach((details, i) => {
      const t = details.trim();
      if (!t || seen.has(t)) return;
      seen.add(t);
      items.push({ id: `${cp.id}-${i}`, details: t });
    });
  }

  return { items, loading };
}
