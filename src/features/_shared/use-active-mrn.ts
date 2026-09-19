import { useResolvedPatient } from "@/lib/patient-session";
import { patientMrn } from "@/lib/mrn";

/**
 * Resolves the active patient's MRN from the local session.
 * All feature hooks consume this so they never have to know about
 * patient-session/patient-store details.
 */
export function useActiveMrn(): string | null {
  const { patient } = useResolvedPatient();
  if (!patient) return null;
  const mrn = patientMrn(patient);
  return mrn === "MRN-—" ? null : mrn;
}
