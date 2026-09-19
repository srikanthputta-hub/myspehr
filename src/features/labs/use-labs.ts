import { useSharedPatientData, type ObservationRow } from "../_shared/patient-data-store";
import { useActiveMrn } from "../_shared/use-active-mrn";
import { isVital } from "../vitals/use-vitals";

const LAB_CATEGORY_HINTS = [
  "laboratory",
  "lab",
  "chemistry",
  "hematology",
  "microbiology",
  "pathology",
  "urinalysis",
  "serology",
  "imaging",
  "radiology",
];

/**
 * Labs filter — primary match is FHIR `Observation.category = laboratory`.
 * Fallback: any observation that is not a vital sign (so labs still populate
 * when FHIR sources omit a category code). Independent from `/features/vitals`.
 */
export function isLab(o: ObservationRow): boolean {
  const cat = (o.category ?? "").toLowerCase();
  if (LAB_CATEGORY_HINTS.some((h) => cat.includes(h))) return true;
  if (isVital(o)) return false;
  return true;
}

/**
 * Labs → `observations` table, filtered to laboratory results.
 */
export function useLabs() {
  const mrn = useActiveMrn();
  const { observations, loading } = useSharedPatientData(mrn);
  return { labs: observations.filter(isLab), loading };
}
