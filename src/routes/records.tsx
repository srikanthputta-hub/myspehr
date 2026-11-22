import { createFileRoute } from "@tanstack/react-router";
import { FileText, Activity, AlertTriangle } from "lucide-react";
import { DetailPageShell, StatusBadge, sectionColors } from "@/components/spehr-ui";
import { LiveMeta } from "@/components/live-meta";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveMrn } from "@/features/_shared/use-active-mrn";
import {
  useFhirConditions,
  useFhirAllergies,
  conceptText,
  conceptListText,
  type FhirCondition,
  type FhirAllergyIntolerance,
} from "@/lib/fhir-live";

export const Route = createFileRoute("/records")({
  head: () => ({ meta: [{ title: "Records — My SPEHR Link" }] }),
  component: RecordsPage,
});

const SEVERITY_COLOR: Record<string, string> = {
  low: "oklch(0.72 0.08 185)",
  moderate: "oklch(0.78 0.12 80)",
  high: "oklch(0.65 0.18 25)",
};

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-foreground text-right">{value}</dd>
    </div>
  );
}

function conditionStatus(c: FhirCondition): string {
  return conceptText(c.clinicalStatus) || "";
}

function ConditionRow({ c }: { c: FhirCondition }) {
  const status = conditionStatus(c).toLowerCase();
  const active = status === "active";
  const color = active ? sectionColors.records : "oklch(0.65 0.04 240)";
  const title = conceptText(c.code) || "Condition";
  return (
    <AccordionItem
      value={c.id}
      className="border-white/[0.06] rounded-2xl overflow-hidden mb-2 last:mb-0"
      style={{ background: "var(--gradient-card)" }}
    >
      <AccordionTrigger className="px-4 py-3 hover:no-underline">
        <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <div
            className="w-8 h-8 rounded-lg shrink-0 grid place-items-center"
            style={{ backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)` }}
          >
            <Activity className="w-4 h-4" style={{ color }} />
          </div>
          <span className="truncate text-sm font-medium">{title}</span>
          {status && (
            <span className="ml-auto mr-2 shrink-0">
              <StatusBadge label={status} color={color} />
            </span>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        <dl className="space-y-1.5 text-sm">
          {conceptListText(c.category) && (
            <Detail label="Category" value={conceptListText(c.category)} />
          )}
          {conceptListText(c.bodySite) && (
            <Detail label="Body site" value={conceptListText(c.bodySite)} />
          )}
          {c.onsetDateTime && (
            <Detail label="Onset" value={new Date(c.onsetDateTime).toLocaleDateString()} />
          )}
          {c.note?.[0]?.text && (
            <div className="pt-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                Notes
              </p>
              <p className="text-foreground">{c.note[0].text}</p>
            </div>
          )}
        </dl>
      </AccordionContent>
    </AccordionItem>
  );
}

function allergySeverityRank(criticality?: string): number {
  const s = (criticality ?? "").toLowerCase();
  if (s === "high") return 3;
  if (s === "moderate") return 2;
  if (s === "low") return 1;
  return 0;
}

/**
 * Collapse AllergyIntolerance resources to one row per logical allergy.
 *
 * QA finding H19: the FHIR server can hold more than one AllergyIntolerance
 * resource for the same substance (e.g. one per documented severity level —
 * "Penicillin HIGH" and "Penicillin LOW" as two separate resources), and
 * this page was rendering one row per resource, so a patient with 2 real
 * allergies saw 4 rows ("Penicillin HIGH, Eggs HIGH, Eggs LOW, Penicillin
 * LOW"). This groups by the substance's display text and keeps only the
 * single most clinically significant record per substance (highest
 * criticality), merging in reaction detail from a duplicate that the kept
 * record didn't itself carry, so nothing is silently dropped — it's just no
 * longer shown as a separate row for the same allergy.
 */
function dedupeAllergiesBySubstance(raw: FhirAllergyIntolerance[]): FhirAllergyIntolerance[] {
  const bySubstance = new Map<string, FhirAllergyIntolerance>();
  for (const a of raw) {
    const key = (conceptText(a.code) || "allergy").trim().toLowerCase();
    const existing = bySubstance.get(key);
    if (!existing) {
      bySubstance.set(key, a);
      continue;
    }
    const keepExisting =
      allergySeverityRank(existing.criticality) >= allergySeverityRank(a.criticality);
    const winner = keepExisting ? existing : a;
    const loser = keepExisting ? a : existing;
    bySubstance.set(key, {
      ...winner,
      reaction: winner.reaction?.length ? winner.reaction : loser.reaction,
    });
  }
  return Array.from(bySubstance.values());
}

function AllergyItem({ a }: { a: FhirAllergyIntolerance }) {
  const sev = (a.criticality ?? "").toLowerCase();
  const color = SEVERITY_COLOR[sev] ?? sectionColors.allergies;
  const substance = conceptText(a.code) || "Allergy";
  const reaction =
    a.reaction?.[0]?.description || conceptListText(a.reaction?.[0]?.manifestation) || "";
  return (
    <AccordionItem
      value={a.id}
      className="border-white/[0.06] rounded-2xl overflow-hidden mb-2 last:mb-0"
      style={{ background: "var(--gradient-card)" }}
    >
      <AccordionTrigger className="px-4 py-3 hover:no-underline">
        <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <div
            className="w-8 h-8 rounded-lg shrink-0 grid place-items-center"
            style={{
              backgroundColor: `color-mix(in oklab, ${sectionColors.allergies} 12%, transparent)`,
            }}
          >
            <AlertTriangle className="w-4 h-4" style={{ color: sectionColors.allergies }} />
          </div>
          <span className="truncate text-sm font-medium">{substance}</span>
          {a.criticality && (
            <span className="ml-auto mr-2 shrink-0">
              <StatusBadge label={a.criticality} color={color} />
            </span>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        <dl className="space-y-1.5 text-sm">
          {reaction && <Detail label="Reaction" value={reaction} />}
          {a.criticality && <Detail label="Severity" value={a.criticality} />}
        </dl>
      </AccordionContent>
    </AccordionItem>
  );
}

function Group({
  id,
  icon: Icon,
  color,
  title,
  count,
  children,
}: {
  id: string;
  icon: typeof Activity;
  color: string;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <AccordionItem
      value={id}
      className="border-white/[0.06] rounded-2xl overflow-hidden"
      style={{ background: "var(--gradient-card)" }}
    >
      <AccordionTrigger className="px-5 py-4 hover:no-underline">
        <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <div
            className="w-9 h-9 rounded-lg shrink-0 grid place-items-center"
            style={{ backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)` }}
          >
            <Icon className="w-[18px] h-[18px]" style={{ color }} />
          </div>
          <span className="font-semibold text-[15px]">{title}</span>
          <span className="ml-auto mr-2 text-xs text-muted-foreground shrink-0">{count}</span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-3 pb-3">
        <Accordion type="multiple" className="w-full">
          {children}
        </Accordion>
      </AccordionContent>
    </AccordionItem>
  );
}

function RecordsPage() {
  const mrn = useActiveMrn();
  const cq = useFhirConditions(mrn);
  const aq = useFhirAllergies(mrn);

  const conditions = cq.data ?? [];
  const allergies = dedupeAllergiesBySubstance(aq.data ?? []);

  const active = conditions.filter((c) => conditionStatus(c).toLowerCase() === "active");
  const resolved = conditions.filter((c) => conditionStatus(c).toLowerCase() !== "active");

  const loading = cq.isLoading || aq.isLoading;
  const updatedAt = Math.max(cq.dataUpdatedAt ?? 0, aq.dataUpdatedAt ?? 0) || null;
  const isFetching = cq.isFetching || aq.isFetching;

  return (
    <DetailPageShell
      title="Health Records"
      subtitle="Conditions, allergies & reports"
      icon={FileText}
      color={sectionColors.records}
    >
      <LiveMeta
        updatedAt={updatedAt}
        onRefresh={() => Promise.all([cq.refresh(), aq.refresh()])}
        isFetching={isFetching}
      />
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      ) : cq.error || aq.error ? (
        <p className="text-sm text-destructive">
          Could not load records: {(cq.error ?? aq.error)?.message}
        </p>
      ) : conditions.length === 0 && allergies.length === 0 ? (
        <p className="text-sm text-muted-foreground">No records on file yet.</p>
      ) : (
        <Accordion type="multiple" defaultValue={["active", "allergies"]} className="space-y-3">
          <Group
            id="active"
            icon={Activity}
            color={sectionColors.records}
            title="Active Conditions"
            count={active.length}
          >
            {active.map((c) => (
              <ConditionRow key={c.id} c={c} />
            ))}
          </Group>
          <Group
            id="resolved"
            icon={Activity}
            color="oklch(0.65 0.04 240)"
            title="Resolved / Prior"
            count={resolved.length}
          >
            {resolved.map((c) => (
              <ConditionRow key={c.id} c={c} />
            ))}
          </Group>
          <Group
            id="allergies"
            icon={AlertTriangle}
            color={sectionColors.allergies}
            title="Allergies"
            count={allergies.length}
          >
            {allergies.map((a) => (
              <AllergyItem key={a.id} a={a} />
            ))}
          </Group>
        </Accordion>
      )}
    </DetailPageShell>
  );
}
