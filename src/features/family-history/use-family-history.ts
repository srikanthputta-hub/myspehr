import { useActiveMrn } from "../_shared/use-active-mrn";
import { useSharedPatientData, type FamilyHistoryRow } from "../_shared/patient-data-store";

export interface FamilyHistoryEntry extends FamilyHistoryRow {}

export function useFamilyHistory() {
  const mrn = useActiveMrn();
  const { familyHistory, loading } = useSharedPatientData(mrn);
  return { items: familyHistory, loading };
}
