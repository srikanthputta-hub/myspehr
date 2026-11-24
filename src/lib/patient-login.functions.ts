import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Patient login check — MRN only, by explicit product decision (reverting
 * the MRN+DOB hardening added for QA finding C5). This is a demo/simulation
 * app, not a real patient portal, and the owner wants MRN alone to be enough
 * to log in: no DOB field, no second factor.
 *
 * This still does real server-side verification — it's not a no-op. The
 * typed MRN must resolve to an actual patient record in FHIR; a nonexistent
 * MRN is rejected with a plain "MRN not found" result. What's gone is the
 * DOB cross-check that used to be required in addition to that.
 */
export const verifyPatientLogin = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        // Digits only — the login form strips non-digits before calling this.
        mrnDigits: z
          .string()
          .trim()
          .min(1)
          .max(32)
          .regex(/^\d+$/),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { fhirJson } = await import("@/lib/fhir-client.server");
    const { MRN_SYSTEM } = await import("@/lib/mrn");

    const normalizedMrn = `MRN-${data.mrnDigits}`;

    try {
      // Same identifier-search shape the existing sync path uses
      // (fhir-sync.functions.ts) — value-only, no system prefix.
      const bundle = await fhirJson<{
        entry?: Array<{ resource?: Record<string, unknown> }>;
      }>(`Patient?identifier=${encodeURIComponent(normalizedMrn)}`);

      const patientResource = bundle.entry?.find(
        (e) => e.resource?.resourceType === "Patient",
      )?.resource as
        | {
            id?: string;
            birthDate?: string;
            name?: Array<{ text?: string; given?: string[]; family?: string }>;
          }
        | undefined;

      if (!patientResource) {
        return { ok: false as const };
      }

      return {
        ok: true as const,
        patient: {
          resourceType: "Patient" as const,
          id: patientResource.id ?? data.mrnDigits,
          identifier: [{ system: MRN_SYSTEM, value: normalizedMrn }],
          name: patientResource.name ?? [{ text: "Patient" }],
          birthDate: patientResource.birthDate,
        },
      };
    } catch {
      // Backend/FHIR error — fail closed.
      return { ok: false as const };
    }
  });
