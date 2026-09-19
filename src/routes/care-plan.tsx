import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ClipboardList,
  Salad,
  Activity,
  GraduationCap,
  CalendarCheck,
  AlertTriangle,
  FileText,
  Printer,
} from "lucide-react";
import { DetailPageShell, CardShell, sectionColors } from "@/components/spehr-ui";
import { LiveMeta } from "@/components/live-meta";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useActiveMrn } from "@/features/_shared/use-active-mrn";
import {
  useFhirComposition,
  useFhirDocumentReferences,
  stripNarrative,
  narrativeToLines,
  conceptText,
  type FhirComposition,
  type FhirCompositionSection,
  type FhirDocumentReference,
} from "@/lib/fhir-live";

export const Route = createFileRoute("/care-plan")({
  head: () => ({ meta: [{ title: "Care Plan — My SPEHR Link" }] }),
  component: CarePlanPage,
});

type Tab = "diet" | "followup" | "summary";

/** Flatten Composition sections (including nested). */
function flattenSections(sections?: FhirCompositionSection[]): FhirCompositionSection[] {
  if (!sections) return [];
  const out: FhirCompositionSection[] = [];
  for (const s of sections) {
    out.push(s);
    if (s.section?.length) out.push(...flattenSections(s.section));
  }
  return out;
}

/** Find a section by title/code keywords (case-insensitive). */
function findSection(
  sections: FhirCompositionSection[],
  keywords: string[],
): FhirCompositionSection | null {
  const kws = keywords.map((k) => k.toLowerCase());
  return (
    sections.find((s) => {
      const title = (s.title ?? "").toLowerCase();
      const code = conceptText(s.code).toLowerCase();
      return kws.some((k) => title.includes(k) || code.includes(k));
    }) ?? null
  );
}

function sectionLines(s: FhirCompositionSection | null): string[] {
  if (!s) return [];
  return narrativeToLines(s.text?.div);
}

function CarePlanPage() {
  const mrn = useActiveMrn();
  const cq = useFhirComposition(mrn);
  const dq = useFhirDocumentReferences(mrn);
  const [tab, setTab] = useState<Tab>("summary");

  // Pick the most recent Composition of type "Discharge Summary" or any.
  const composition: FhirComposition | null = useMemo(() => {
    const list = cq.data ?? [];
    const discharge = list.find((c) =>
      /discharge|summary/i.test(conceptText(c.type) + " " + (c.title ?? "")),
    );
    return discharge ?? list[0] ?? null;
  }, [cq.data]);

  const sections = flattenSections(composition?.section);
  const dietSec = findSection(sections, ["diet"]);
  const activitySec = findSection(sections, ["activity"]);
  const educationSec = findSection(sections, ["education", "instruction"]);
  const followUpSec = findSection(sections, ["follow-up", "follow up", "followup"]);
  const precautionSec = findSection(sections, ["precaution", "return", "warning", "call"]);
  const hospitalCourseSec = findSection(sections, ["hospital course", "course"]);
  const dischargeMedsSec = findSection(sections, ["discharge medication", "medications on discharge"]);

  const dischargeDoc: FhirDocumentReference | undefined = (dq.data ?? []).find((d) =>
    /discharge|summary/i.test(conceptText(d.type) + " " + (d.description ?? "")),
  );

  const updatedAt = Math.max(cq.dataUpdatedAt ?? 0, dq.dataUpdatedAt ?? 0) || null;
  const isFetching = cq.isFetching || dq.isFetching;
  const loading = cq.isLoading || dq.isLoading;

  const handlePrint = () => window.print();

  return (
    <DetailPageShell
      title="Care Plan & Discharge"
      subtitle="Instructions for your recovery"
      icon={ClipboardList}
      color={sectionColors.records}
    >
      <LiveMeta
        updatedAt={updatedAt}
        onRefresh={() => Promise.all([cq.refresh(), dq.refresh()])}
        isFetching={isFetching}
      />

      <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-card border border-border mb-4">
        <TabButton active={tab === "summary"} onClick={() => setTab("summary")}>Summary</TabButton>
        <TabButton active={tab === "diet"} onClick={() => setTab("diet")}>Diet & Activity</TabButton>
        <TabButton active={tab === "followup"} onClick={() => setTab("followup")}>Follow-Up</TabButton>
      </div>

      {loading ? (
        <SectionSkeleton />
      ) : cq.error ? (
        <p className="text-sm text-destructive">Could not load discharge summary: {cq.error.message}</p>
      ) : !composition ? (
        <CardShell icon={FileText} color={sectionColors.records} title="Discharge Summary">
          <p className="text-sm text-muted-foreground">
            No discharge summary on file yet. It will appear here once your clinician finalises it.
          </p>
        </CardShell>
      ) : tab === "summary" ? (
        <SummaryView
          composition={composition}
          hospitalCourse={hospitalCourseSec}
          dischargeMeds={dischargeMedsSec}
          dischargeDoc={dischargeDoc}
          onPrint={handlePrint}
        />
      ) : tab === "diet" ? (
        <DietActivityView diet={sectionLines(dietSec)} activity={sectionLines(activitySec)} education={sectionLines(educationSec)} />
      ) : (
        <FollowUpView followUps={sectionLines(followUpSec)} precautions={sectionLines(precautionSec)} />
      )}
    </DetailPageShell>
  );
}

function SummaryView({
  composition,
  hospitalCourse,
  dischargeMeds,
  dischargeDoc,
  onPrint,
}: {
  composition: FhirComposition;
  hospitalCourse: FhirCompositionSection | null;
  dischargeMeds: FhirCompositionSection | null;
  dischargeDoc: FhirDocumentReference | undefined;
  onPrint: () => void;
}) {
  const dateStr = composition.date
    ? new Date(composition.date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "";
  return (
    <div className="space-y-3">
      <CardShell
        icon={FileText}
        color={sectionColors.records}
        title={composition.title ?? conceptText(composition.type) ?? "Discharge Summary"}
        action={
          <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={onPrint}>
            <Printer className="w-3.5 h-3.5" /> Print
          </Button>
        }
      >
        {dateStr && <p className="text-xs text-muted-foreground mb-3">Finalised {dateStr}</p>}
        {dischargeDoc?.description && (
          <p className="text-sm mb-2">{dischargeDoc.description}</p>
        )}
        {!hospitalCourse && !dischargeMeds && (
          <p className="text-sm text-muted-foreground">
            Your discharge summary is available — see the Diet & Activity and Follow-Up tabs for details.
          </p>
        )}
      </CardShell>

      {hospitalCourse && (
        <NarrativeCard
          icon={Activity}
          color={sectionColors.medications}
          title={hospitalCourse.title ?? "Hospital Course"}
          section={hospitalCourse}
        />
      )}
      {dischargeMeds && (
        <NarrativeCard
          icon={ClipboardList}
          color={sectionColors.medications}
          title={dischargeMeds.title ?? "Discharge Medications"}
          section={dischargeMeds}
        />
      )}
    </div>
  );
}

function NarrativeCard({
  icon,
  color,
  title,
  section,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  title: string;
  section: FhirCompositionSection;
}) {
  const lines = narrativeToLines(section.text?.div);
  const asProse = stripNarrative(section.text?.div);
  return (
    <CardShell icon={icon} color={color} title={title}>
      {lines.length > 1 ? (
        <ul className="space-y-2.5">
          {lines.map((line, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{asProse || "—"}</p>
      )}
    </CardShell>
  );
}

function DietActivityView({ diet, activity, education }: { diet: string[]; activity: string[]; education: string[] }) {
  const hasAny = diet.length || activity.length || education.length;
  if (!hasAny) {
    return (
      <CardShell icon={Salad} color={sectionColors.medications} title="Diet, Activity & Education">
        <p className="text-sm text-muted-foreground">No diet or activity instructions in this discharge summary.</p>
      </CardShell>
    );
  }
  return (
    <div className="space-y-3">
      <InstructionCard icon={Salad} color={sectionColors.medications} title="Diet" items={diet} empty="No diet instructions." />
      <InstructionCard icon={Activity} color={sectionColors.appointments} title="Activity" items={activity} empty="No activity instructions." />
      <InstructionCard icon={GraduationCap} color={sectionColors.records} title="Patient Education" items={education} empty="No education materials." />
    </div>
  );
}

function FollowUpView({ followUps, precautions }: { followUps: string[]; precautions: string[] }) {
  const hasAny = followUps.length || precautions.length;
  if (!hasAny) {
    return (
      <CardShell icon={CalendarCheck} color={sectionColors.appointments} title="Follow-Up Care">
        <p className="text-sm text-muted-foreground">No follow-up details in this discharge summary.</p>
      </CardShell>
    );
  }
  return (
    <div className="space-y-3">
      <InstructionCard icon={CalendarCheck} color={sectionColors.appointments} title="Follow-Up Details" items={followUps} empty="No follow-up appointments scheduled." />
      <InstructionCard icon={AlertTriangle} color={sectionColors.allergies} title="Return Precautions" items={precautions} empty="No return precautions on file." />
    </div>
  );
}

function InstructionCard({
  icon,
  color,
  title,
  items,
  empty,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <CardShell icon={icon} color={color} title={title}>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((line, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

function SectionSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-2xl border border-white/[0.06] p-5 space-y-3" style={{ background: "var(--gradient-card)" }}>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`h-10 rounded-lg text-sm font-medium transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}
