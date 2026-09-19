import { createFileRoute } from "@tanstack/react-router";
import { Pill } from "lucide-react";
import {
  DetailPageShell,
  StatusBadge,
  sectionColors,
} from "@/components/spehr-ui";
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
  useFhirMedications,
  medicationName,
  medicationGroup,
  dedupeMedications,
  type FhirMedicationRequest,
} from "@/lib/fhir-live";

export const Route = createFileRoute("/medications")({
  head: () => ({ meta: [{ title: "Medications — My SPEHR Link" }] }),
  component: MedicationsPage,
});

const STATUS_COLOR: Record<string, string> = {
  active: sectionColors.medications,
  "on-hold": "oklch(0.78 0.12 80)",
  completed: "oklch(0.65 0.04 240)",
  stopped: "oklch(0.65 0.04 240)",
  cancelled: "oklch(0.65 0.04 240)",
};

function dosageText(m: FhirMedicationRequest) {
  return m.dosageInstruction?.[0]?.text ?? "";
}

function MedRow({ m }: { m: FhirMedicationRequest }) {
  const status = (m.status ?? "").toLowerCase();
  const color = STATUS_COLOR[status] ?? sectionColors.medications;
  const dose = dosageText(m);
  const title = `${medicationName(m)}${dose ? ` · ${dose}` : ""}`;
  return (
    <AccordionItem
      value={m.id}
      className="border-white/[0.06] rounded-2xl overflow-hidden mb-2 last:mb-0"
      style={{ background: "var(--gradient-card)" }}
    >
      <AccordionTrigger className="px-4 py-3 hover:no-underline">
        <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <div
            className="w-8 h-8 rounded-lg shrink-0 grid place-items-center"
            style={{ backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)` }}
          >
            <Pill className="w-4 h-4" style={{ color }} />
          </div>
          <span className="truncate text-sm font-medium">{title}</span>
          {m.status && (
            <span className="ml-auto mr-2 shrink-0">
              <StatusBadge label={m.status} color={color} />
            </span>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        <dl className="space-y-1.5 text-sm">
          {dose && <Detail label="Dosage" value={dose} />}
          {m.requester?.display && <Detail label="Prescriber" value={m.requester.display} />}
          {m.authoredOn && (
            <Detail label="Prescribed" value={new Date(m.authoredOn).toLocaleDateString()} />
          )}
          {m.status && <Detail label="Status" value={m.status} />}
        </dl>
      </AccordionContent>
    </AccordionItem>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-foreground text-right">{value}</dd>
    </div>
  );
}

function MedGroup({ id, title, items }: { id: string; title: string; items: FhirMedicationRequest[] }) {
  if (items.length === 0) return null;
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
            style={{ backgroundColor: `color-mix(in oklab, ${sectionColors.medications} 12%, transparent)` }}
          >
            <Pill className="w-[18px] h-[18px]" style={{ color: sectionColors.medications }} />
          </div>
          <span className="font-semibold text-[15px]">{title}</span>
          <span className="ml-auto mr-2 text-xs text-muted-foreground shrink-0">{items.length}</span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-3 pb-3">
        <Accordion type="multiple" className="w-full">
          {items.map((m) => (
            <MedRow key={m.id} m={m} />
          ))}
        </Accordion>
      </AccordionContent>
    </AccordionItem>
  );
}

function MedicationsPage() {
  const mrn = useActiveMrn();
  const q = useFhirMedications(mrn);
  const all = dedupeMedications(q.data ?? []);

  const administered = all.filter((m) => medicationGroup(m) === "administered");
  const prescribed = all.filter((m) => medicationGroup(m) === "prescribed");
  const outpatient = all.filter((m) => medicationGroup(m) === "outpatient");

  return (
    <DetailPageShell
      title="Medications"
      subtitle="Prescriptions & active orders"
      icon={Pill}
      color={sectionColors.medications}
    >
      <LiveMeta
        updatedAt={q.dataUpdatedAt}
        onRefresh={q.refresh}
        isFetching={q.isFetching}
      />
      {q.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      ) : q.error ? (
        <p className="text-sm text-destructive">Could not load medications: {q.error.message}</p>
      ) : all.length === 0 ? (
        <p className="text-sm text-muted-foreground">No medications on file yet.</p>
      ) : (
        <Accordion type="multiple" defaultValue={["administered", "prescribed", "outpatient"]} className="space-y-3">
          <MedGroup id="administered" title="Administered" items={administered} />
          <MedGroup id="prescribed" title="Prescribed" items={prescribed} />
          <MedGroup id="outpatient" title="Active Outpatient Medications" items={outpatient} />
        </Accordion>
      )}
    </DetailPageShell>
  );
}
