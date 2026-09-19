import { useSharedPatientData } from "../_shared/patient-data-store";
import { useActiveMrn } from "../_shared/use-active-mrn";

/**
 * Allergies → `allergies` table.
 * Medication / environmental / food allergies with criticality.
 */
export function useAllergies() {
  const mrn = useActiveMrn();
  const { allergies, loading } = useSharedPatientData(mrn);
  return { allergies, loading };
}
