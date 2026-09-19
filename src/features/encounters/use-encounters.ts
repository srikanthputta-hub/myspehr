import { useSharedPatientData } from "../_shared/patient-data-store";
import { useActiveMrn } from "../_shared/use-active-mrn";

/**
 * Encounters → `encounters` table.
 * Date of service, type, status, diagnoses, chief complaint, HPI, hospital course.
 */
export function useEncounters() {
  const mrn = useActiveMrn();
  const { encounters, loading } = useSharedPatientData(mrn);
  return { encounters, loading };
}
