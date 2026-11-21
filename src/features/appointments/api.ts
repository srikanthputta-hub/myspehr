import { supabase } from "@/integrations/supabase/client";
import type { AppointmentInsert, AppointmentRow, AppointmentUpdate } from "./types";

/**
 * Appointments → `appointments` table.
 * Strictly modular: only this file talks to the appointments table.
 */

export async function createAppointment(input: AppointmentInsert): Promise<AppointmentRow> {
  const { data, error } = await supabase
    .from("appointments")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAppointment(
  id: string,
  patch: AppointmentUpdate,
): Promise<AppointmentRow> {
  const { data, error } = await supabase
    .from("appointments")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Update the local mirror row for an appointment by its FHIR id rather than
 * its Supabase primary key.
 *
 * Used by cancel/confirm flows that only have the merged, FHIR-keyed row
 * from `useAppointments()` — on that merged object `a.id` is the FHIR
 * resource id (every live-FHIR entry sets `id: a.id`), NOT the Supabase
 * `appointments.id` UUID the local row actually has, so updating by `id`
 * either hits nothing or (with `.single()`) throws. Matching on `fhir_id`
 * avoids that mismatch. Deliberately tolerant of zero matches — a
 * spehr-originated appointment synced only from the live FHIR feed has no
 * backing local row at all, and that's not an error (see QA finding C6).
 */
export async function updateAppointmentByFhirId(
  fhirId: string,
  patch: AppointmentUpdate,
): Promise<AppointmentRow | null> {
  const { data, error } = await supabase
    .from("appointments")
    .update(patch)
    .eq("fhir_id", fhirId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function deleteAppointment(id: string): Promise<void> {
  const { error } = await supabase.from("appointments").delete().eq("id", id);
  if (error) throw error;
}
