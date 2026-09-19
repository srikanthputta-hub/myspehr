import { useSharedPatientData, type ObservationRow } from "../_shared/patient-data-store";
import { useActiveMrn } from "../_shared/use-active-mrn";

const VITAL_CATEGORY_HINTS = ["vital-signs", "vitalsigns", "vital"];
const VITAL_NAME_HINTS = [
  "blood pressure",
  "systolic",
  "diastolic",
  "heart rate",
  "pulse",
  "respiratory rate",
  "respiration",
  "spo2",
  "oxygen saturation",
  "body temperature",
  "temperature",
];

/**
 * Vitals filter — primary match is FHIR `Observation.category = vital-signs`
 * with a test-name fallback for sources that omit the category code.
 * Completely independent from `/features/labs`.
 */
export function isVital(o: ObservationRow): boolean {
  const cat = (o.category ?? "").toLowerCase();
  if (VITAL_CATEGORY_HINTS.some((h) => cat.includes(h))) return true;
  const name = (o.test_name ?? "").toLowerCase();
  return VITAL_NAME_HINTS.some((h) => name.includes(h));
}

/**
 * Vitals → `observations` table, filtered to BP, HR, RR, SpO2, Temp.
 */
export function useVitals() {
  const mrn = useActiveMrn();
  const { observations, loading } = useSharedPatientData(mrn);
  return { vitals: observations.filter(isVital), loading };
}
