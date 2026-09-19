import { useSyncExternalStore } from "react";

export interface FhirHumanName {
  use?: string;
  family?: string;
  given?: string[];
  text?: string;
}

export interface FhirPatient {
  resourceType: "Patient";
  id?: string;
  name?: FhirHumanName[];
  gender?: string;
  birthDate?: string;
  [key: string]: unknown;
}

const STORAGE_KEY = "sgroup.patient";
const listeners = new Set<() => void>();
let current: FhirPatient | null = null;
let hydrated = false;

function hydrate(): FhirPatient | null {
  if (hydrated || typeof window === "undefined") return current;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) current = JSON.parse(raw) as FhirPatient;
  } catch {
    current = null;
  }
  return current;
}

export const patientStore = {
  get(): FhirPatient | null {
    return hydrate();
  },
  isHydrated(): boolean {
    return hydrated;
  },
  set(p: FhirPatient | null) {
    current = p;
    hydrated = true;
    if (typeof window !== "undefined") {
      if (p) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
      else window.localStorage.removeItem(STORAGE_KEY);
    }
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function usePatient(): FhirPatient | null {
  return useSyncExternalStore(
    patientStore.subscribe,
    () => patientStore.get(),
    () => null,
  );
}

export function usePatientHydrated(): boolean {
  return useSyncExternalStore(
    patientStore.subscribe,
    () => {
      hydrate();
      return hydrated;
    },
    () => false,
  );
}
