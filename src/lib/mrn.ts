/**
 * MRN helpers. FHIR server interaction was removed — these are pure
 * formatting utilities used by the UI to display the active patient's MRN.
 */

export const MRN_SYSTEM = "http://spehr.local/mrn";

export function formatMrn(id: string | undefined | null): string {
  if (!id) return "MRN-—";
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const n = Math.abs(hash) % 1_000_000;
  return `MRN-${n.toString().padStart(6, "0")}`;
}

interface PatientLike {
  id?: string;
  identifier?: Array<{ system?: string; value?: string }>;
}

export function patientMrn(patient: PatientLike | null | undefined): string {
  if (!patient) return "MRN-—";
  const ident = patient.identifier?.find(
    (i) => i.system === MRN_SYSTEM && i.value,
  );
  if (ident?.value) return ident.value;
  return formatMrn(patient.id);
}
