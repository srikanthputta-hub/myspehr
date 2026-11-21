import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { DetailPageShell, CardShell, sectionColors } from "@/components/spehr-ui";
import { LiveMeta } from "@/components/live-meta";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useActiveMrn } from "@/features/_shared/use-active-mrn";
import {
  useFhirLabs,
  conceptText,
  conceptListText,
  dedupeObservations,
  type FhirObservation,
} from "@/lib/fhir-live";

export const Route = createFileRoute("/lab-reports")({
  head: () => ({ meta: [{ title: "Lab Reports — My SPEHR Link" }] }),
  component: LabReportsPage,
});

function fmt(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
function fmtFull(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

type LabSeverity = "critical" | "abnormal";

/**
 * Compare a numeric result against its own FHIR referenceRange. Returns
 * null when the value is inside the range (or there's nothing numeric to
 * compare), "abnormal" when it's outside, "critical" when it's far
 * outside (>80% of the range's span beyond the boundary) — mirroring the
 * H/HH, L/LL grading convention.
 *
 * This is authoritative over the upstream `interpretation` coding when
 * both a numeric value and a numeric range are present on THIS
 * observation, specifically so a stale/incorrect upstream interpretation
 * flag can't make an in-range result (e.g. Hemoglobin 14.6 against
 * 12.0–17.0, or WBC 7.5 against 4.5–11.0) show as ABNORMAL (H6).
 */
function rangeSeverity(o: FhirObservation): LabSeverity | null {
  const value = o.valueQuantity?.value;
  const range = o.referenceRange?.[0];
  if (value === undefined || !range) return null;
  const lo = range.low?.value;
  const hi = range.high?.value;
  if (lo === undefined && hi === undefined) return null;
  const span = (hi ?? lo ?? 0) - (lo ?? hi ?? 0) || Math.abs(hi ?? lo ?? 1) || 1;
  if (lo !== undefined && value < lo) {
    return value < lo - span * 0.8 ? "critical" : "abnormal";
  }
  if (hi !== undefined && value > hi) {
    return value > hi + span * 0.8 ? "critical" : "abnormal";
  }
  return null;
}

/**
 * Classify a lab's severity for the UI badge. Prefers the direct
 * value-vs-reference-range comparison above; only falls back to the raw
 * upstream `interpretation` flags/text when this observation has no
 * numeric value+range to compare (e.g. qualitative results like "Negative").
 * Interpretation codes follow common v2-0078 ObservationInterpretation
 * conventions, with a text fallback for servers that only populate `.text`.
 */
function labSeverity(o: FhirObservation): LabSeverity | null {
  if (o.valueQuantity?.value !== undefined && o.referenceRange?.[0]) {
    return rangeSeverity(o);
  }
  const interpretation = o.interpretation;
  const codes = (interpretation ?? [])
    .flatMap((c) => c.coding ?? [])
    .map((c) => (c.code ?? "").toUpperCase());
  if (codes.some((c) => c === "HH" || c === "LL" || c === "AA")) return "critical";
  if (codes.some((c) => c === "H" || c === "L" || c === "A" || c === "HU" || c === "LU"))
    return "abnormal";
  const text = conceptListText(interpretation).toLowerCase();
  if (text.includes("critical")) return "critical";
  if (text.includes("abnormal") || /\b(high|low)\b/.test(text)) return "abnormal";
  return null;
}

/** Small severity pill shared by the table row and the mobile card layout. */
function SeverityBadge({ sev }: { sev: LabSeverity }) {
  return (
    <span
      className={
        sev === "critical"
          ? "inline-flex items-center rounded-full px-1.5 py-[1px] text-[8.5px] font-bold uppercase tracking-wider ring-1 ring-rose-400/40 bg-rose-400/10 text-rose-300"
          : "inline-flex items-center rounded-full px-1.5 py-[1px] text-[8.5px] font-bold uppercase tracking-wider ring-1 ring-amber-400/40 bg-amber-400/10 text-amber-300"
      }
    >
      {sev === "critical" ? "Critical" : "Abnormal"}
    </span>
  );
}

/** Render a FHIR referenceRange entry as a short display string. */
function referenceRangeText(o: FhirObservation): string {
  const r = o.referenceRange?.[0];
  if (!r) return "";
  if (r.text) return r.text;
  const unit = r.low?.unit ?? r.high?.unit ?? "";
  if (r.low?.value !== undefined && r.high?.value !== undefined) {
    return `${r.low.value}–${r.high.value}${unit ? ` ${unit}` : ""}`;
  }
  if (r.low?.value !== undefined) return `≥ ${r.low.value}${unit ? ` ${unit}` : ""}`;
  if (r.high?.value !== undefined) return `≤ ${r.high.value}${unit ? ` ${unit}` : ""}`;
  return "";
}

function LabReportsPage() {
  const mrn = useActiveMrn();
  const q = useFhirLabs(mrn);
  const labs = dedupeObservations(q.data ?? []);
  const [selected, setSelected] = useState<FhirObservation | null>(null);

  const sorted = [...labs].sort((a, b) => {
    const ta = new Date(a.effectiveDateTime ?? a.issued ?? 0).getTime();
    const tb = new Date(b.effectiveDateTime ?? b.issued ?? 0).getTime();
    return tb - ta;
  });

  return (
    <DetailPageShell
      title="Lab Reports"
      subtitle="Laboratory results"
      icon={FlaskConical}
      color={sectionColors.records}
    >
      <LiveMeta updatedAt={q.dataUpdatedAt} onRefresh={q.refresh} isFetching={q.isFetching} />
      <CardShell icon={FlaskConical} color={sectionColors.records} title="Laboratory Results">
        {q.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : q.error ? (
          <p className="text-sm text-destructive">Could not load labs: {q.error.message}</p>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No lab reports on file yet.</p>
        ) : (
          <>
            {/* Narrow viewports (H17): the 4-column table (Test / Value /
                Unit / Date-Time) needs ~495px to show every column without
                truncating, which overflows a ~307px card body at 375px.
                The table itself scrolls (overflow-auto in ui/table.tsx),
                but with no visible scrollbar or edge cue there was nothing
                telling people more content existed, so Unit/Date just read
                as cut off ("Ur", "g/"). Below `sm` we swap to a stacked
                card per result — nothing to scroll, nothing to clip. */}
            <div className="sm:hidden space-y-2">
              {sorted.map((o) => {
                const sev = labSeverity(o);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setSelected(o)}
                    className="w-full text-left rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3 transition-colors hover:bg-white/[0.04]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex-1 min-w-0 truncate font-medium text-foreground">
                        {conceptText(o.code) || "—"}
                      </span>
                      {sev && <SeverityBadge sev={sev} />}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span className="tabular-nums">
                        {o.valueQuantity?.value ?? o.valueString ?? "—"}
                        {o.valueQuantity?.unit ? ` ${o.valueQuantity.unit}` : ""}
                      </span>
                      <span className="shrink-0">{fmt(o.effectiveDateTime ?? o.issued)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="hidden sm:block -mx-5">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-white/[0.06]">
                    <TableHead className="pl-5">Test</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="pr-5 text-right">Date/Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((o) => {
                    const sev = labSeverity(o);
                    return (
                      <TableRow
                        key={o.id}
                        onClick={() => setSelected(o)}
                        className="border-white/[0.04] cursor-pointer transition-colors hover:bg-white/[0.03]"
                      >
                        <TableCell className="pl-5 font-medium text-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            {conceptText(o.code) || "—"}
                            {sev && <SeverityBadge sev={sev} />}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {o.valueQuantity?.value ?? o.valueString ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {o.valueQuantity?.unit ?? "—"}
                        </TableCell>
                        <TableCell className="pr-5 text-right text-xs text-muted-foreground whitespace-nowrap">
                          {fmt(o.effectiveDateTime ?? o.issued)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardShell>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{conceptText(selected?.code) || "Lab Result"}</DialogTitle>
            <DialogDescription>Full result context</DialogDescription>
          </DialogHeader>
          {selected &&
            (() => {
              const sev = labSeverity(selected);
              const refRange = referenceRangeText(selected);
              return (
                <>
                  <dl className="space-y-3 text-sm">
                    <Row label="Value">
                      <span className="tabular-nums font-medium">
                        {selected.valueQuantity?.value ?? selected.valueString ?? "—"}
                        {selected.valueQuantity?.unit ? ` ${selected.valueQuantity.unit}` : ""}
                      </span>
                    </Row>
                    <Row label="Unit">{selected.valueQuantity?.unit ?? "—"}</Row>
                    {refRange && <Row label="Reference Range">{refRange}</Row>}
                    <Row label="Category">{conceptListText(selected.category) || "—"}</Row>
                    <Row label="Timestamp">
                      {fmtFull(selected.effectiveDateTime ?? selected.issued)}
                    </Row>
                    {selected.interpretation && (
                      <Row label="Interpretation">
                        {conceptListText(selected.interpretation) || "—"}
                      </Row>
                    )}
                  </dl>
                  {sev && (
                    <div
                      className={
                        sev === "critical"
                          ? "mt-3 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2.5 text-[11.5px] leading-relaxed text-rose-200/90"
                          : "mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-[11.5px] leading-relaxed text-amber-200/90"
                      }
                    >
                      <span
                        className={
                          sev === "critical"
                            ? "font-semibold text-rose-300"
                            : "font-semibold text-amber-300"
                        }
                      >
                        {sev === "critical" ? "Critical result: " : "Outside typical range: "}
                      </span>
                      {sev === "critical"
                        ? "This value is flagged as critical. Your care team is usually notified directly when a result comes back like this — if you haven't heard from them and have symptoms you're concerned about, contact your care team or seek care."
                        : "This value falls outside the typical reference range shown above. That doesn't always mean something is wrong — if you have questions about what it means for you, contact your care team."}
                    </div>
                  )}
                </>
              );
            })()}
        </DialogContent>
      </Dialog>
    </DetailPageShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-white/[0.05] pb-2 last:border-0">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground shrink-0">
        {label}
      </dt>
      <dd className="text-right text-foreground min-w-0">{children}</dd>
    </div>
  );
}
