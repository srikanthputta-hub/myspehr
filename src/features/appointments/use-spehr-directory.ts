import { useEffect, useState } from "react";

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
      cache = EMPTY;
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Fetches the SPEHR public directory (facilities + providers) once and
 * caches the result at module scope. CORS-enabled endpoint, browser fetch.
 */
export function useSpehrDirectory(): SpehrDirectory {
  const [dir, setDir] = useState<SpehrDirectory>(cache ?? EMPTY);
  useEffect(() => {
    let alive = true;
    void loadDirectory().then((d) => {
      if (alive) setDir(d);
    });
    return () => {
      alive = false;
    };
  }, []);
  return dir;
}
