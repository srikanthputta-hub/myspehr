import { useEffect, type ComponentType, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useResolvedPatient } from "@/lib/patient-session";
import { patientMrn } from "@/lib/mrn";

/* ---------- Page shell with back button (used by all detail routes) ----- */

export function DetailPageShell({
  title,
  subtitle,
  icon: Icon,
  color,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  children: ReactNode;
}) {
  const { patient, ready } = useResolvedPatient();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !patient) navigate({ to: "/login" });
  }, [patient, ready, navigate]);

  if (!ready || !patient) {
    return null;
  }

  return (
    <main className="pb-6">
      <header
        className="px-6 pt-10 pb-8 relative overflow-hidden text-primary-foreground"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 90% 10%, white 2px, transparent 2px)",
            backgroundSize: "60px 60px",
          }}
        />
        <div className="relative">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs text-white/70 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to dashboard
          </Link>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: `color-mix(in oklab, ${color} 22%, transparent)`,
                border: `1px solid color-mix(in oklab, ${color} 35%, transparent)`,
              }}
            >
              <Icon className="w-5 h-5" style={{ color }} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-white truncate">
                {title}
              </h1>
              {subtitle && (
                <p className="text-xs text-white/60 mt-0.5 truncate">{subtitle}</p>
              )}
            </div>
          </div>
          <p className="text-[11px] text-white/50 mt-4 font-mono">
            {patientMrn(patient)}
          </p>
        </div>
      </header>

      <section className="px-6 mt-6">{children}</section>
    </main>
  );
}

/* ---------- Card primitives shared by dashboard + detail pages ---------- */

export function CardShell({
  icon: Icon,
  color,
  title,
  action,
  children,
}: {
  icon: ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border border-white/[0.06] overflow-hidden"
      style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-soft)" }}
    >
      <div className="px-5 py-4 flex items-center gap-3 border-b border-white/[0.05]">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)` }}
        >
          <Icon className="w-[18px] h-[18px]" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
          <h3 className="font-semibold text-foreground text-[15px]">{title}</h3>
          {action}
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

export function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider shrink-0"
      style={{
        color,
        backgroundColor: `color-mix(in oklab, ${color} 10%, transparent)`,
        border: `1px solid color-mix(in oklab, ${color} 20%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

export function ListSkeleton() {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-muted-foreground">{message}</p>;
}

export function ErrorState({ message }: { message: string }) {
  return <p className="text-xs text-destructive">{message}</p>;
}

/* ---------- Color tokens used across SPEHR sections --------------------- */

export const sectionColors = {
  appointments: "oklch(0.72 0.08 185)",
  medications: "oklch(0.7 0.12 145)",
  admissions: "oklch(0.62 0.13 200)",
  records: "oklch(0.6 0.15 260)",
  allergies: "oklch(0.68 0.18 30)",
} as const;
