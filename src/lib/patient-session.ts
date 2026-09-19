import { usePatient, usePatientHydrated } from "./patient-store";

/**
 * Lightweight session hook. The FHIR-backed cache was removed; the active
 * patient now comes solely from the local `patientStore` (populated on the
 * login screen). Rebuild the FHIR sync layer to hydrate this further.
 */
export function useResolvedPatient() {
  const patient = usePatient();
  const hydrated = usePatientHydrated();
  return {
    patient,
    ready: Boolean(patient) || hydrated,
  };
}
