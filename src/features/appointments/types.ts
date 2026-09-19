import type { Database } from "@/integrations/supabase/types";

export type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];
export type AppointmentInsert = Database["public"]["Tables"]["appointments"]["Insert"];
export type AppointmentUpdate = Database["public"]["Tables"]["appointments"]["Update"];

export type AppointmentStatus = "proposed" | "booked" | "completed" | "cancelled";
