import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { resolveAppointmentProvidersFromDischarge } from "@/lib/fhir-provider-resolution.functions";
import { useFhirAppointments, conceptListText, type FhirAppointment } from "@/lib/fhir-live";
import { useActiveMrn } from "../_shared/use-active-mrn";
import type { AppointmentRow } from "./types";

/**
 * Subscribes to the active patient's scheduled and proposed appointments.
 * Merges the local Supabase mirror with the live FHIR /Appointment feed so
 * SPEHR-originated bookings (or fresh MySPEHR PUTs) show up regardless of
 * which side wrote them.
 */
function fhirToRow(a: FhirAppointment): AppointmentRow {
  const start = a.start ?? new Date().toISOString();
  const providerParticipant = (a.participant ?? []).find(
    (p) => p.actor?.reference?.startsWith("Practitioner/") || p.actor?.display,
  );
  return {
    id: a.id,
    patient_mrn: (a.participant ?? [])
      .map((p) => p.actor?.reference ?? "")
      .find((r) => r.startsWith("Patient/"))
      ?.replace("Patient/", "") ?? "",
    scheduled_for: start,
    status: (a.status ?? "proposed") as AppointmentRow["status"],
    reason: a.description ?? conceptListText(a.serviceType) ?? null,
    description: a.description ?? null,
    appointment_type: conceptListText(a.serviceType) || null,
    provider:
      providerParticipant?.actor?.reference?.startsWith("Practitioner/")
        ? providerParticipant.actor.display ?? null
        : providerParticipant?.actor?.display ?? null,
    location: a.location?.[0]?.display ?? null,
    notes: a.comment ?? null,
    fhir_id: a.id,
    created_at: null as unknown as string,
    updated_at: null as unknown as string,
  } as AppointmentRow;
}

export function useAppointments() {
  const mrn = useActiveMrn();
  const resolveProviders = useServerFn(resolveAppointmentProvidersFromDischarge);
  const attemptedProviderResolution = useRef<Set<string>>(new Set());
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fhirQ = useFhirAppointments(mrn);

  const fetchRows = useCallback(async (m: string): Promise<AppointmentRow[]> => {
    const { data } = await supabase
      .from("appointments")
      .select("*")
      .eq("patient_mrn", m)
      .order("scheduled_for", { ascending: true });
    return data ?? [];
  }, []);

  const load = useCallback(async (m: string) => {
    const rows = await fetchRows(m);
    setRows(rows);
    setLoading(false);
    if (!rows.some((row) => !row.provider) || attemptedProviderResolution.current.has(m)) return;
    attemptedProviderResolution.current.add(m);
    const result = await resolveProviders({ data: { mrn: m } });
    if (result.provider && result.updated > 0) {
      setRows(await fetchRows(m));
    }
  }, [fetchRows, resolveProviders]);

  useEffect(() => {
    if (!mrn) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void load(mrn);
    const channel = supabase
      .channel(`appointments-${mrn}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: `patient_mrn=eq.${mrn}`,
        },
        () => void load(mrn),
      )
      .subscribe();
    const interval = window.setInterval(() => void load(mrn), 20_000);
    return () => {
      void supabase.removeChannel(channel);
      window.clearInterval(interval);
    };
  }, [mrn, load]);

  const appointments = useMemo(() => {
    const byKey = new Map<string, AppointmentRow>();
    for (const r of rows) {
      const k = r.fhir_id ?? r.id;
      byKey.set(k, r);
    }
    for (const a of fhirQ.data ?? []) {
      const k = a.id;
      // Prefer FHIR-derived status (fresher) but keep local-only fields.
      const local = byKey.get(k);
      const fhirRow = fhirToRow(a);
      byKey.set(k, local ? { ...local, ...fhirRow, notes: local.notes ?? fhirRow.notes } : fhirRow);
    }
    return Array.from(byKey.values()).sort(
      (a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime(),
    );
  }, [rows, fhirQ.data]);

  return {
    mrn,
    appointments,
    loading: loading && fhirQ.isLoading,
    refresh: () => Promise.all([mrn ? load(mrn) : Promise.resolve(), fhirQ.refresh()]),
  };
}
