import { createFileRoute } from "@tanstack/react-router";
import { BedDouble } from "lucide-react";
import { DetailPageShell, CardShell, StatusBadge, sectionColors } from "@/components/spehr-ui";
import { LiveMeta } from "@/components/live-meta";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveMrn } from "@/features/_shared/use-active-mrn";
import { useFhirEncounters, conceptListText, type FhirEncounter } from "@/lib/fhir-live";

export const Route = createFileRoute("/admissions")({
  head: () => ({ meta: [{ title: "Admissions — My SPEHR Link" }] }),
  component: AdmissionsPage,
});

const TYPE_COLOR: Record<string, string> = {
  inpatient: "oklch(0.62 0.13 200)",
  imp: "oklch(0.62 0.13 200)",
  outpatient: "oklch(0.72 0.08 185)",
  amb: "oklch(0.72 0.08 185)",
  emergency: "oklch(0.65 0.18 25)",
  emer: "oklch(0.65 0.18 25)",
};

function fmt(iso: string | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function encounterType(e: FhirEncounter): string {
  return (
    conceptListText(e.type) ||
    e.class?.display ||
    e.class?.code ||
    ""
  );
}

function AdmissionsPage() {
  const mrn = useActiveMrn();
  const q = useFhirEncounters(mrn);
  const encounters = q.data ?? [];

  return (
    <DetailPageShell
      title="Admissions"
      subtitle="Encounters & hospital stays"
      icon={BedDouble}
      color={sectionColors.admissions}
    >
      <LiveMeta updatedAt={q.dataUpdatedAt} onRefresh={q.refresh} isFetching={q.isFetching} />
      {q.isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : q.error ? (
        <p className="text-sm text-destructive">Could not load encounters: {q.error.message}</p>
      ) : encounters.length === 0 ? (
        <p className="text-sm text-muted-foreground">No encounters on file yet.</p>
      ) : (
        <div className="space-y-3">
          {encounters.map((e) => {
            const type = encounterType(e);
            const color = TYPE_COLOR[type.toLowerCase()] ?? sectionColors.admissions;
            const reason = conceptListText(e.reasonCode) || "Encounter";
            const facility = e.serviceProvider?.display || e.location?.[0]?.location?.display || "";
            return (
              <CardShell
                key={e.id}
                icon={BedDouble}
                color={color}
                title={reason}
                action={type ? <StatusBadge label={type} color={color} /> : undefined}
              >
                {facility && <p className="text-sm">{facility}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {fmt(e.period?.start)}
                  {e.status ? ` · ${e.status}` : ""}
                </p>
              </CardShell>
            );
          })}
        </div>
      )}
    </DetailPageShell>
  );
}
