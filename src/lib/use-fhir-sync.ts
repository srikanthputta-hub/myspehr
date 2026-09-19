import { useCallback, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { syncMrn } from "./fhir-sync.functions";

/**
 * Silent background runner. Triggers a FHIR sync for the given MRN.
 * The work runs server-side; the browser only sees a small JSON result.
 *
 * Usage:
 *   const sync = useFhirSync();
 *   await sync("MRN-123456");
 */
export function useFhirSync() {
  const run = useServerFn(syncMrn);
  // Dedupe in-flight + recently-synced MRNs within this session.
  const lastRun = useRef<Map<string, number>>(new Map());

  return useCallback(
    async (
      mrn: string,
      { force = false, purge = false }: { force?: boolean; purge?: boolean } = {},
    ) => {
      const key = mrn.trim();
      if (!key) return null;
      const now = Date.now();
      const prev = lastRun.current.get(key) ?? 0;
      // Skip if we already synced this MRN in the last 60s (unless forced/purging).
      if (!force && !purge && now - prev < 60_000) return null;
      lastRun.current.set(key, now);
      try {
        const result = await run({ data: { mrn: key, purge } });
        return result;
      } catch (err) {
        lastRun.current.delete(key);
        // eslint-disable-next-line no-console
        console.error("[fhir-sync]", err);
        throw err;
      }
    },
    [run],
  );
}
