import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Compact strip shown at the top of every live-FHIR clinical page.
 * Renders "Live · Updated Xs ago" and a manual refresh button so patients
 * (and the SPEHR team, during field debugging) can see and trust freshness.
 */
export function LiveMeta({
  updatedAt,
  onRefresh,
  isFetching,
}: {
  updatedAt: number | null | undefined;
  onRefresh: () => void | Promise<unknown>;
  isFetching: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  const label = updatedAt ? formatAgo(now - updatedAt) : "just now";
  const asOf = updatedAt
    ? new Date(updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;
  return (
    <div className="mb-3 px-1">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400/90" />
          Live · updated {label}
        </span>
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground disabled:opacity-60 transition-colors"
        >
          <RefreshCw className={cn("w-3 h-3", isFetching && "animate-spin")} />
          Refresh
        </button>
      </div>
      {asOf && (
        <p className="mt-1 text-[10.5px] normal-case tracking-normal text-muted-foreground/70">
          As of {asOf} — new chart entries can take a minute or two to show up here.
        </p>
      )}
    </div>
  );
}

function formatAgo(ms: number): string {
  if (ms < 5_000) return "just now";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}
