import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Confirm a PROPOSED FHIR Appointment.
 *
 * Strategy:
 *  1. GET Appointment/{id} from FHIR server (need full resource for PUT).
 *  2. Try PUT /Appointment/{id} with the full updated resource (status="booked").
 *  3. If PUT is rejected (405/409/422 or similar), retry with JSON Patch:
 *       PATCH /Appointment/{id}
 *       Content-Type: application/json-patch+json
 *       Body: [{ "op": "replace", "path": "/status", "value": "booked" }]
 *  4. Only mirror the change locally if the FHIR update actually succeeded.
 *     On failure, leave the local row as "proposed" so the UI reverts to
 *     PROPOSED and the user gets a clear error.
 */
export const confirmFhirAppointment = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        appointmentId: z.string().uuid(),
        fhirId: z.string().min(1).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { fhirFetch, fhirJson } = await import("@/lib/fhir-client.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let fhirOk = false;
    let fhirReason: string | null = null;
    let method: "PUT" | "PATCH" | null = null;

    if (!data.fhirId) {
      fhirReason = "no_fhir_id";
    } else {
      const path = `Appointment/${encodeURIComponent(data.fhirId)}`;

      try {
        // 1. Fetch current resource so the PUT carries the full definition
        //    (FHIR PUT semantics require the entire resource, not a delta).
        const current = await fhirJson<Record<string, unknown>>(path);

        // 2. Build full updated resource with status="booked".
        const updated = {
          ...current,
          resourceType: "Appointment",
          id: data.fhirId,
          status: "booked",
        };

        // Log the exact outgoing payload for monitoring.
        console.log(
          "[confirmFhirAppointment] PUT",
          path,
          JSON.stringify(updated),
        );

        const putRes = await fhirFetch(path, {
          method: "PUT",
          body: JSON.stringify(updated),
          headers: { "Content-Type": "application/fhir+json" },
        });

        if (putRes.ok) {
          fhirOk = true;
          method = "PUT";
        } else {
          const putText = await putRes.text().catch(() => "");
          console.warn(
            `[confirmFhirAppointment] PUT failed ${putRes.status}: ${putText.slice(0, 200)} — falling back to PATCH`,
          );

          // 3. Fall back to JSON Patch.
          const patchBody = [
            { op: "replace", path: "/status", value: "booked" },
          ];
          console.log(
            "[confirmFhirAppointment] PATCH",
            path,
            JSON.stringify(patchBody),
          );

          const patchRes = await fhirFetch(path, {
            method: "PATCH",
            body: JSON.stringify(patchBody),
            headers: { "Content-Type": "application/json-patch+json" },
          });

          if (patchRes.ok) {
            fhirOk = true;
            method = "PATCH";
          } else {
            const patchText = await patchRes.text().catch(() => "");
            fhirReason = `FHIR PUT ${putRes.status} / PATCH ${patchRes.status}: ${patchText.slice(0, 160)}`;
            console.error("[confirmFhirAppointment] PATCH failed", fhirReason);
          }
        }
      } catch (err) {
        fhirReason = err instanceof Error ? err.message : "FHIR update failed";
        console.error("[confirmFhirAppointment] error", fhirReason);
      }
    }

    // 4. Only mirror locally when the FHIR server accepted the change.
    //    On failure we leave the row as-is so the UI flips back to PROPOSED.
    if (fhirOk) {
      const { data: row, error } = await supabaseAdmin
        .from("appointments")
        .update({ status: "booked" })
        .eq("id", data.appointmentId)
        .select()
        .single();
      if (error) throw new Error(`appointments: ${error.message}`);
      return { ok: true as const, fhirOk, method, fhirReason: null, appointment: row };
    }

    return { ok: false as const, fhirOk: false, method: null, fhirReason, appointment: null };
  });
