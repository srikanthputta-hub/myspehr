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

export async function deleteAppointment(id: string): Promise<void> {
  const { error } = await supabase.from("appointments").delete().eq("id", id);
  if (error) throw error;
}
