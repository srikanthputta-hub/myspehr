import { useSharedPatientData } from "../_shared/patient-data-store";
import { useActiveMrn } from "../_shared/use-active-mrn";

/**
 * Clinical history → `clinical_history` table.
 * Active conditions, past surgical history, prior hospitalizations, family history.
 */
export function useHistory() {
  const mrn = useActiveMrn();
  const { history, loading } = useSharedPatientData(mrn);
  return { history, loading };
}
