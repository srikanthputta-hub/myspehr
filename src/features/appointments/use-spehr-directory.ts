import { useCallback, useEffect, useState } from "react";

export interface DirectoryProvider {
  name: string;
  facility: string;
}
export interface SpehrDirectory {
  facilities: string[];
  providers: DirectoryProvider[];
}

const EMPTY: SpehrDirectory = { facilities: [], providers: [] };
const ENDPOINT = "https://www.spehr.live/api/public/directory";

let cache: SpehrDirectory | null = null;
let inflight: Promise<SpehrDirectory> | null = null;

/**
 * Loads the directory once and caches the result at module scope — but only
 * a SUCCESSFUL result. A failed fetch (e.g. spehr's CORS allowlist not yet
 * including this origin — see QA L21) is deliberately NOT cached as the
 * permanent answer: that previously left the booking dialog's Location/
 * Provider pickers stuck on "Directory unavailable" for the rest of the SPA
 * session even after the underlying issue was fixed server-side. Callers can
 * retry (e.g. when the patient reopens the booking dialog) and it will hit
 * the network again instead of replaying a stale failure forever.
 */
async function loadDirectory(): Promise<SpehrDirectory> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(ENDPOINT);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as SpehrDirectory;
      cache = {
        facilities: Array.isArray(json.facilities) ? json.facilities : [],
        providers: Array.isArray(json.providers) ? json.providers : [],
      };
      return cache;
    } catch {
      return EMPTY;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Fetches the SPEHR public directory (facilities + providers) once and
 * caches the result at module scope. CORS-enabled endpoint, browser fetch.
 * Exposes `loading`/`failed`/`retry` so the booking UI can tell the patient
 * why the Location/Provider pickers are empty instead of leaving them
 * silently disabled (QA L21).
 */
export function useSpehrDirectory(): SpehrDirectory & {
  loading: boolean;
  failed: boolean;
  retry: () => void;
} {
  const [dir, setDir] = useState<SpehrDirectory>(cache ?? EMPTY);
  const [loading, setLoading] = useState(!cache);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(!cache);
    void loadDirectory().then((d) => {
      if (!alive) return;
      setDir(d);
      setFailed(d.facilities.length === 0 && d.providers.length === 0);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { ...dir, loading, failed, retry };
}
