import { useSharedPatientData, type MedicationRow } from "../_shared/patient-data-store";
import { useActiveMrn } from "../_shared/use-active-mrn";

export interface MedicationGroups {
  /** Given during the current encounter. */
  administered: MedicationRow[];
  /** Written during the current encounter. */
  prescribed: MedicationRow[];
  /** Active outpatient / home medications. */
  outpatient: MedicationRow[];
  all: MedicationRow[];
  loading: boolean;
}

/**
 * Medications → `medications` table.
 * Split into Administered & Prescribed (current encounter) and Active Outpatient.
 */
export function useMedications(): MedicationGroups {
  const mrn = useActiveMrn();
  const { medications, loading } = useSharedPatientData(mrn);
  return {
    administered: medications.filter((m) => m.category === "Administered"),
    prescribed: medications.filter((m) => m.category === "Prescribed"),
    outpatient: medications.filter((m) => m.category === "Outpatient"),
    all: medications,
    loading,
  };
}
