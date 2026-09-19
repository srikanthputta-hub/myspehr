import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  Pill,
  CalendarDays,
  ClipboardList,
  Activity,
  BedDouble,
  FileText,
  FlaskConical,
  Receipt,
  UserCircle2,
  LogOut,
} from "lucide-react";
import { useActiveMrn } from "@/features/_shared/use-active-mrn";
import { useFhirPatient, fhirName } from "@/lib/fhir-live";
import { useFhirSync } from "@/lib/use-fhir-sync";
import { patientStore } from "@/lib/patient-store";
import { Skeleton } from "@/components/ui/skeleton";
import logoAsset from "@/assets/logo.png.asset.json";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — My SPEHR Link" }] }),
  component: DashboardPage,
});

const TILES: Array<{
  to:
    | "/medications"
    | "/records"
    | "/appointments"
    | "/care-plan"
    | "/monitoring"
    | "/admissions"
    | "/lab-reports"
    | "/billing";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { to: "/medications", label: "Medications", icon: Pill },
  { to: "/records", label: "Records", icon: FileText },
  { to: "/appointments", label: "Appointments", icon: CalendarDays },
  { to: "/care-plan", label: "Care Plan & Discharge", icon: ClipboardList },
  { to: "/monitoring", label: "Monitoring", icon: Activity },
  { to: "/admissions", label: "Admissions", icon: BedDouble },
  { to: "/lab-reports", label: "Lab Reports", icon: FlaskConical },
  { to: "/billing", label: "Billing & Insurance", icon: Receipt },
];


function DashboardPage() {
  const navigate = useNavigate();
  const mrn = useActiveMrn();
  const patientQ = useFhirPatient(mrn);
  const sync = useFhirSync();

  useEffect(() => {
    if (mrn) void sync(mrn).catch(() => {});
  }, [mrn, sync]);

  const { first: firstName } = fhirName(patientQ.data ?? null);
  const nameReady = !patientQ.isLoading && !!firstName;
  const mrnLabel = mrn ?? "MRN-—";

  const onSignOut = () => {
    patientStore.set(null);
    navigate({ to: "/login" });
  };

  return (
    <main className="pb-6">
      <header
        className="px-6 pt-12 pb-8 text-primary-foreground"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.18em] text-white/60">{mrnLabel}</p>
            <div className="mt-1 flex items-center gap-2">
              <Link to="/profile" aria-label="Open profile" className="shrink-0">
                <UserCircle2 className="w-7 h-7 text-white" />
              </Link>
              {nameReady ? (
                <h1 className="text-2xl font-semibold text-white truncate">Hi, {firstName}</h1>
              ) : (
                <Skeleton className="h-7 w-40 bg-white/15" />
              )}
            </div>
          </div>
          <img
            src={logoAsset.url}
            alt="Hospital logo"
            className="shrink-0 h-24 w-24 object-contain"
          />
        </div>
      </header>

      <section className="px-6 mt-6">
        <div className="grid grid-cols-2 gap-3">
          {TILES.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2 hover:bg-accent transition-colors"
            >
              <Icon className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="px-6 mt-6 mb-2 flex justify-center">
        <button
          onClick={onSignOut}
          className="inline-flex items-center gap-2 h-11 px-6 rounded-xl border border-border bg-card text-sm font-medium hover:bg-accent transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </main>
  );
}
