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

// QA L23: the page used to interpolate the raw FHIR Encounter.status code
// (e.g. "finished") straight into the UI. These are the standard FHIR
// encounter-status codes — map each to a label a patient would understand.
const ENCOUNTER_STATUS_LABEL: Record<string, string> = {
  planned: "Scheduled",
  arrived: "Checked in",
  triaged: "Triaged",
  "in-progress": "In progress",
  onleave: "On leave",
  finished: "Discharged",
  cancelled: "Cancelled",
  "entered-in-error": "Entered in error",
  unknown: "Status unknown",
};

function encounterStatusLabel(status?: string): string {
  if (!status) return "";
  const known = ENCOUNTER_STATUS_LABEL[status.toLowerCase()];
  if (known) return known;
  // Fall back to a readable version of whatever code shows up (e.g.
  // "my-custom-status" → "My custom status") rather than hiding it.
  const spaced = status.replace(/[-_]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** "3d 4h" / "6h" style length-of-stay, or null when either end of the stay
 * is missing/unparseable. Shown alongside the discharge date (QA L23: the
 * page previously showed neither). */
function lengthOfStay(startIso?: string, endIso?: string): string | null {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  const totalHours = Math.round((end - start) / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days === 0) return `${hours}h`;
  return hours === 0 ? `${days}d` : `${days}d ${hours}h`;
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
            const statusLabel = encounterStatusLabel(e.status);
            const los = lengthOfStay(e.period?.start, e.period?.end);
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
                  Admitted {fmt(e.period?.start)}
                  {statusLabel ? ` · ${statusLabel}` : ""}
                </p>
                {e.period?.end ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Discharged {fmt(e.period.end)}
                    {los ? ` · Length of stay ${los}` : ""}
                  </p>
                ) : (
                  statusLabel &&
                  !["Discharged", "Cancelled", "Entered in error"].includes(statusLabel) && (
                    <p className="mt-0.5 text-xs text-muted-foreground">Not yet discharged</p>
                  )
                )}
              </CardShell>
            );
          })}
        </div>
      )}
    </DetailPageShell>
  );
}
