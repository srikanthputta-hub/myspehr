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

/**
 * Masked MRN for display on patient-facing screens (dashboard header,
 * profile, the generic detail-page header). spehr's clinician UI still
 * needs to show full MRNs to staff — this masking is myspehr-only, so a
 * screenshot of the patient portal can't be used to enumerate/target other
 * patients' real MRNs (see QA finding C5). Keeps the "MRN-" prefix and the
 * last two digits so the patient can visually confirm it's their own chart;
 * everything else is replaced with a bullet.
 */
export function maskMrn(value: string | null | undefined): string {
  if (!value) return "MRN-—";
  const match = /^MRN-(\d+)$/.exec(value);
  if (!match) return "MRN-••••••";
  const digits = match[1];
  const visible = digits.slice(-2);
  const hidden = "•".repeat(Math.max(digits.length - visible.length, 4));
  return `MRN-${hidden}${visible}`;
}

/** Masked form of {@link patientMrn}, for display only. */
export function maskedPatientMrn(patient: PatientLike | null | undefined): string {
  return maskMrn(patientMrn(patient));
}
