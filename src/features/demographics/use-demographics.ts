import { useSharedPatientData } from "../_shared/patient-data-store";
import { useActiveMrn } from "../_shared/use-active-mrn";

/**
 * Demographics → `patients` table.
 * Name, DOB, gender, MRN, address, contact, emergency contact, insurance.
 */
export function useDemographics() {
  const mrn = useActiveMrn();
  const { patient, loading } = useSharedPatientData(mrn);
  return { mrn, patient, loading };
}
