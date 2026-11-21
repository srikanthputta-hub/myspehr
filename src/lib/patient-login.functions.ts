import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Real second-factor login check (QA finding C5). Previously `/login`
 * accepted ANY typed MRN — including ones that don't exist — with no
 * password/verification at all, and logged straight into that patient's
 * full chart. MRNs are plain 6-digit numbers shown throughout the
 * clinician-facing spehr app, so they're trivially enumerable; this was a
 * complete authentication bypass.
 *
 * Fix: require MRN + date of birth, both of which must match the patient
 * record FHIR already holds, before the portal unlocks. This mirrors how
 * real patient portals commonly do identity verification without a full
 * password/account system. On any mismatch — including an MRN that simply
 * doesn't exist — this returns the SAME generic `{ ok: false }` so a client
 * can't distinguish "wrong DOB" from "no such patient" (which would just be
 * a different enumeration vector).
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
        // yyyy-mm-dd, as produced by <input type="date">.
        dob: z
          .string()
          .trim()
          .regex(/^\d{4}-\d{2}-\d{2}$/),
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

      // No such MRN — generic failure, never reveal that it's the MRN
      // that's wrong (that would itself be an enumeration oracle).
      if (!patientResource) {
        return { ok: false as const };
      }

      const dobOnFile = (patientResource.birthDate ?? "").trim();
      if (!dobOnFile || dobOnFile !== data.dob) {
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
      // Backend/FHIR error — fail closed, same generic shape. Never leak
      // whether the failure was "not found" vs. a server error.
      return { ok: false as const };
    }
  });
