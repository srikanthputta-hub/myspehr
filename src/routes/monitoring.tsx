import { createFileRoute } from "@tanstack/react-router";
import { Activity, FlaskConical } from "lucide-react";
import { DetailPageShell, CardShell, sectionColors } from "@/components/spehr-ui";
import { LiveMeta } from "@/components/live-meta";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveMrn } from "@/features/_shared/use-active-mrn";
import {
  useFhirVitals,
  useFhirObservationsAll,
  observationValue,
  isVitalSign,
  latestVitalsByKind,
  conceptText,
  dedupeObservations,
  type FhirObservation,
} from "@/lib/fhir-live";

export const Route = createFileRoute("/monitoring")({
  head: () => ({ meta: [{ title: "Monitoring — My SPEHR Link" }] }),
  component: MonitoringPage,
});

function fmt(iso: string | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function obsTime(o: FhirObservation): number {
  return new Date(o.effectiveDateTime ?? o.issued ?? 0).getTime();
}

function MonitoringPage() {
  const mrn = useActiveMrn();
  const primary = useFhirVitals(mrn);
  const fallback = useFhirObservationsAll(mrn);

  const primaryList = primary.data ?? [];
  const allObs = fallback.data ?? [];
  const vitalsSource =
    primaryList.length > 0 ? primaryList : allObs.filter(isVitalSign);
  const vitals = latestVitalsByKind(vitalsSource);

  // Fallback: 5 most-recent observations of any kind when no vitals exist.
  const latest = vitals.length === 0
    ? dedupeObservations([...allObs].sort((a, b) => obsTime(b) - obsTime(a))).slice(0, 5)
    : [];

  const isLoading = primary.isLoading || (primaryList.length === 0 && fallback.isLoading);
  const err = primary.error ?? fallback.error;
  const updatedAt = Math.max(primary.dataUpdatedAt, fallback.dataUpdatedAt);
  const isFetching = primary.isFetching || fallback.isFetching;
  const refresh = () => Promise.all([primary.refresh(), fallback.refresh()]);

  return (
    <DetailPageShell
      title="Monitoring"
      subtitle="Vital signs (BP, HR, RR, SpO₂, Temp)"
      icon={Activity}
      color={sectionColors.medications}
    >
      <LiveMeta updatedAt={updatedAt} onRefresh={refresh} isFetching={isFetching} />
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : err ? (
        <p className="text-sm text-destructive">Could not load vitals: {err.message}</p>
      ) : vitals.length > 0 ? (
        <div className="space-y-3">
          {vitals.map(({ kind, label, obs }) => (
            <CardShell
              key={kind}
              icon={Activity}
              color={sectionColors.medications}
              title={label}
            >
              <p className="text-lg font-semibold">{observationValue(obs)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {fmt(obs.effectiveDateTime ?? obs.issued)}
              </p>
            </CardShell>
          ))}
        </div>
      ) : latest.length > 0 ? (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Last recorded readings</h3>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              No vital signs recorded for this encounter — showing the latest observations on file.
            </p>
          </div>
          {latest.map((o) => (
            <CardShell
              key={o.id}
              icon={FlaskConical}
              color={sectionColors.medications}
              title={conceptText(o.code) || "Observation"}
            >
              <div className="flex items-center gap-2">
                <p className="text-lg font-semibold">{observationValue(o)}</p>
                {!isVitalSign(o) && (
                  <span className="text-[9.5px] font-bold uppercase tracking-wider rounded-full px-1.5 py-[2px] bg-sky-400/10 text-sky-300 ring-1 ring-sky-400/30">
                    Lab
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {fmt(o.effectiveDateTime ?? o.issued)}
              </p>
            </CardShell>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No vitals or observations on file yet.</p>
      )}
    </DetailPageShell>
  );
}
