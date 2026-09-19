import { useEffect, useRef, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type PatientRow = Database["public"]["Tables"]["patients"]["Row"];
export type EncounterRow = Database["public"]["Tables"]["encounters"]["Row"];
export type HistoryRow = Database["public"]["Tables"]["clinical_history"]["Row"];
export type AllergyRow = Database["public"]["Tables"]["allergies"]["Row"];
export type ObservationRow = Database["public"]["Tables"]["observations"]["Row"];
export type MedicationRow = Database["public"]["Tables"]["medications"]["Row"];
export type CarePlanRow = Database["public"]["Tables"]["care_plans"]["Row"];
export type FamilyHistoryRow =
  Database["public"]["Tables"]["family_member_history"]["Row"];
export type CareTeamRow = Database["public"]["Tables"]["care_team"]["Row"];

export interface SharedPatientSnapshot {
  patient: PatientRow | null;
  encounters: EncounterRow[];
  history: HistoryRow[];
  allergies: AllergyRow[];
  observations: ObservationRow[];
  medications: MedicationRow[];
  carePlans: CarePlanRow[];
  familyHistory: FamilyHistoryRow[];
  careTeam: CareTeamRow[];
  loading: boolean;
}

const EMPTY: SharedPatientSnapshot = {
  patient: null,
  encounters: [],
  history: [],
  allergies: [],
  observations: [],
  medications: [],
  carePlans: [],
  familyHistory: [],
  careTeam: [],
  loading: true,
};


/**
 * One cache entry per MRN. All feature hooks subscribe through here so we
 * issue exactly one batched fetch + one realtime channel per active MRN,
 * regardless of how many feature selectors are mounted.
 */
interface Entry {
  snapshot: SharedPatientSnapshot;
  listeners: Set<() => void>;
  refCount: number;
  channel: ReturnType<typeof supabase.channel> | null;
  inflight: Promise<void> | null;
}

const entries = new Map<string, Entry>();

function emit(entry: Entry) {
  entry.listeners.forEach((l) => l());
}

async function fetchAll(mrn: string, entry: Entry) {
  if (entry.inflight) return entry.inflight;
  entry.inflight = (async () => {
    const [patient, encounters, history, allergies, observations, medications, carePlans, familyHistory, careTeam] =
      await Promise.all([
        supabase.from("patients").select("*").eq("mrn", mrn).maybeSingle(),
        supabase
          .from("encounters")
          .select("*")
          .eq("patient_mrn", mrn)
          .order("encounter_date", { ascending: false }),
        supabase.from("clinical_history").select("*").eq("patient_mrn", mrn),
        supabase.from("allergies").select("*").eq("patient_mrn", mrn),
        supabase
          .from("observations")
          .select("*")
          .eq("patient_mrn", mrn)
          .order("effective_time", { ascending: false }),
        supabase.from("medications").select("*").eq("patient_mrn", mrn),
        supabase.from("care_plans").select("*").eq("patient_mrn", mrn),
        supabase.from("family_member_history").select("*").eq("patient_mrn", mrn),
        supabase.from("care_team").select("*").eq("patient_mrn", mrn),
      ]);
    entry.snapshot = {
      patient: patient.data ?? null,
      encounters: encounters.data ?? [],
      history: history.data ?? [],
      allergies: allergies.data ?? [],
      observations: observations.data ?? [],
      medications: medications.data ?? [],
      carePlans: carePlans.data ?? [],
      familyHistory: familyHistory.data ?? [],
      careTeam: careTeam.data ?? [],
      loading: false,
    };
    emit(entry);
  })();

  try {
    await entry.inflight;
  } finally {
    entry.inflight = null;
  }
}

function acquire(mrn: string): Entry {
  let entry = entries.get(mrn);
  if (!entry) {
    entry = {
      snapshot: EMPTY,
      listeners: new Set(),
      refCount: 0,
      channel: null,
      inflight: null,
    };
    entries.set(mrn, entry);
  }
  entry.refCount += 1;
  if (entry.refCount === 1) {
    void fetchAll(mrn, entry);
    const channel = supabase.channel(`patient-shared-${mrn}`);
    const tables: Array<[string, string]> = [
      ["patients", `mrn=eq.${mrn}`],
      ["encounters", `patient_mrn=eq.${mrn}`],
      ["clinical_history", `patient_mrn=eq.${mrn}`],
      ["allergies", `patient_mrn=eq.${mrn}`],
      ["observations", `patient_mrn=eq.${mrn}`],
      ["medications", `patient_mrn=eq.${mrn}`],
      ["care_plans", `patient_mrn=eq.${mrn}`],
      ["family_member_history", `patient_mrn=eq.${mrn}`],
      ["care_team", `patient_mrn=eq.${mrn}`],


    ];
    for (const [table, filter] of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter },
        () => void fetchAll(mrn, entry!),
      );
    }
    channel.subscribe();
    entry.channel = channel;
  }
  return entry;
}

function release(mrn: string) {
  const entry = entries.get(mrn);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount <= 0) {
    if (entry.channel) void supabase.removeChannel(entry.channel);
    entries.delete(mrn);
  }
}

/**
 * Internal: returns the full snapshot for an MRN. Feature hooks should
 * select their slice on top of this — never import this from a route.
 */
export function useSharedPatientData(mrn: string | null | undefined): SharedPatientSnapshot {
  const key = mrn ?? "";
  const mountedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!mrn) return;
    acquire(mrn);
    mountedKey.current = mrn;
    return () => {
      release(mrn);
      mountedKey.current = null;
    };
  }, [mrn]);

  return useSyncExternalStore(
    (cb) => {
      if (!key) return () => {};
      const entry = entries.get(key);
      if (!entry) return () => {};
      entry.listeners.add(cb);
      return () => entry.listeners.delete(cb);
    },
    () => {
      if (!key) return { ...EMPTY, loading: false };
      return entries.get(key)?.snapshot ?? EMPTY;
    },
    () => EMPTY,
  );
}
