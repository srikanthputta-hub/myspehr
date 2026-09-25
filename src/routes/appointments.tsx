import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarDays, Plus, Stethoscope, MapPin, Check, Loader2, FileText } from "lucide-react";
import { DetailPageShell, sectionColors } from "@/components/spehr-ui";
import { useAppointments, createAppointment } from "@/features/appointments";
import { useDerivedFollowUp } from "@/features/appointments/derive-followup";
import { useSpehrDirectory } from "@/features/appointments/use-spehr-directory";
import { useDemographics } from "@/features/demographics";
import {
  fhirProxy,
  withMyspehrTag,
  myspehrAppointmentId,
} from "@/lib/fhir-proxy-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/appointments")({
  head: () => ({ meta: [{ title: "Appointments — My SPEHR Link" }] }),
  component: AppointmentsPage,
});

const TEAL = sectionColors.appointments;

/* ---------- Status badge (SPEHR-style pill) ---------- */

type BadgeTone = {
  label: string;
  ring: string;
  bg: string;
  fg: string;
  dot?: string;
};

function statusBadge(status: string): BadgeTone {
  const s = status.toLowerCase();
  if (s === "proposed" || s === "pending")
    return {
      label: "Pending confirmation",
      ring: "ring-amber-400/40",
      bg: "bg-amber-400/10",
      fg: "text-amber-300",
      dot: "bg-amber-400",
    };
  if (s === "booked" || s === "confirmed")
    return {
      label: "Confirmed",
      ring: "ring-emerald-400/40",
      bg: "bg-emerald-400/10",
      fg: "text-emerald-300",
    };
  if (s === "cancelled" || s === "noshow" || s === "canceled")
    return {
      label: s === "noshow" ? "No-show" : "Cancelled",
      ring: "ring-rose-400/40",
      bg: "bg-rose-400/10",
      fg: "text-rose-300",
    };
  return {
    label: status,
    ring: "ring-slate-400/30",
    bg: "bg-slate-400/10",
    fg: "text-slate-300",
  };
}

function StatusPill({ status }: { status: string }) {
  const t = statusBadge(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[10px] font-bold uppercase tracking-wider ring-1 ${t.bg} ${t.fg} ${t.ring}`}
    >
      {t.dot && (
        <span className="relative flex h-1.5 w-1.5">
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${t.dot} opacity-70`} />
          <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${t.dot}`} />
        </span>
      )}
      {t.label}
    </span>
  );
}

/* ---------- Date/time formatting ---------- */

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function AppointmentsPage() {
  const { mrn, appointments, loading, refresh } = useAppointments();
  const { followUp } = useDerivedFollowUp(mrn);
  const { patient } = useDemographics();
  const directory = useSpehrDirectory();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const patientFullName = useMemo(() => {
    const parts = [patient?.first_name, patient?.last_name].filter(Boolean) as string[];
    return parts.length ? parts.join(" ") : mrn ?? "";
  }, [patient, mrn]);

  const confirmAppointment = async (a: (typeof appointments)[number]) => {
    if (!a.fhir_id) {
      toast.error("Cannot confirm", { description: "Missing FHIR record id." });
      return;
    }
    setConfirmingId(a.id);
    try {
      const startIso = new Date(a.scheduled_for).toISOString();
      const endIso = new Date(new Date(a.scheduled_for).getTime() + 30 * 60_000).toISOString();
      const facilityDisplay = a.location?.trim() ?? "";
      const resource = withMyspehrTag({
        resourceType: "Appointment",
        id: a.fhir_id,
        status: "pending",
        description: a.reason ?? a.description ?? "Patient-confirmed appointment",
        serviceType: [{ text: a.appointment_type ?? a.reason ?? "Follow-up" }],
        start: startIso,
        end: endIso,
        comment: a.notes ?? undefined,
        participant: [
          {
            actor: { reference: `Patient/${mrn}`, type: "Patient", display: patientFullName || mrn || "" },
            required: "required",
            status: "accepted",
          },
          ...(a.provider
            ? [{ actor: { type: "Practitioner", display: a.provider }, required: "required", status: "accepted" }]
            : []),
          ...(facilityDisplay
            ? [
                {
                  actor: { type: "Location", display: facilityDisplay },
                  required: "required",
                  status: "accepted",
                },
              ]
            : []),
        ],
        ...(facilityDisplay ? { location: [{ display: facilityDisplay }] } : {}),
      });
      const res = await fhirProxy({
        method: "PUT",
        path: `/Appointment/${a.fhir_id}`,
        body: resource,
      });
      if (!res.ok) throw new Error(`FHIR ${res.status}: ${res.raw.slice(0, 200)}`);
      toast.success("Confirmation sent", { description: "Awaiting clinic acceptance." });
      await refresh();
    } catch (e) {
      toast.error("Could not confirm", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setConfirmingId(null);
    }
  };

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    reason: "",
    provider: "",
    location: "",
    scheduled_for: "",
    notes: "",
  });

  const onCreate = async () => {
    if (!mrn || !form.scheduled_for) return;
    setBusy(true);
    try {
      const startIso = new Date(form.scheduled_for).toISOString();
      const endIso = new Date(new Date(form.scheduled_for).getTime() + 30 * 60_000).toISOString();
      const fhirId = myspehrAppointmentId();

      const facilityDisplay = form.location.trim();
      // Patient-requested → PROPOSED. SPEHR clinician confirms it to booked.
      const resource = withMyspehrTag({
        resourceType: "Appointment",
        id: fhirId,
        status: "proposed",
        description: form.reason || "Patient-requested appointment",
        serviceType: [{ text: form.reason || "Follow-up" }],
        start: startIso,
        end: endIso,
        comment: form.notes || undefined,
        participant: [
          {
            actor: { reference: `Patient/${mrn}`, type: "Patient", display: patientFullName || mrn },
            required: "required",
            status: "accepted",
          },
          ...(form.provider
            ? [{ actor: { type: "Practitioner", display: form.provider }, required: "required", status: "accepted" }]
            : []),
          ...(facilityDisplay
            ? [
                {
                  actor: { type: "Location", display: facilityDisplay },
                  required: "required",
                  status: "accepted",
                },
              ]
            : []),
        ],
        ...(facilityDisplay ? { location: [{ display: facilityDisplay }] } : {}),
      });
      const res = await fhirProxy({
        method: "PUT",
        path: `/Appointment/${fhirId}`,
        body: resource,
      });
      if (!res.ok) throw new Error(`FHIR ${res.status}: ${res.raw.slice(0, 200)}`);

      await createAppointment({
        patient_mrn: mrn,
        scheduled_for: startIso,
        status: "proposed",
        reason: form.reason || null,
        provider: form.provider || null,
        location: form.location || "MySPEHR Portal",
        notes: form.notes || null,
        fhir_id: fhirId,
      });
      toast.success("Request sent", {
        description: "The clinic will confirm this appointment shortly.",
      });
      setOpen(false);
      setForm({ reason: "", provider: "", location: "", scheduled_for: "", notes: "" });
    } catch (e) {
      toast.error("Could not request appointment", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <DetailPageShell
      title="Appointments"
      subtitle="Upcoming visits & scheduling"
      icon={CalendarDays}
      color={TEAL}
    >
      <div className="mb-4 flex justify-end">
        <Button
          onClick={() => setOpen(true)}
          size="sm"
          className="gap-2 border-0 text-white hover:brightness-110"
          style={{ backgroundColor: TEAL }}
        >
          <Plus className="w-4 h-4" /> Book appointment
        </Button>
      </div>

      {loading && appointments.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">Loading…</p>
      ) : appointments.length === 0 ? (
        followUp ? (
          <article
            className="rounded-xl border border-white/[0.07] bg-card overflow-hidden"
            style={{ boxShadow: "var(--shadow-soft)" }}
          >
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-white/[0.05]">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: `color-mix(in oklab, ${TEAL} 14%, transparent)` }}
              >
                <CalendarDays className="w-4 h-4" style={{ color: TEAL }} />
              </div>
              <h3 className="flex-1 min-w-0 truncate text-[12.5px] font-semibold text-foreground">
                {followUp.providerName ? `Follow-up with ${followUp.providerName}` : "Primary care follow-up"}
              </h3>
              <StatusPill status="proposed" />
            </div>
            <div className="px-3.5 py-3 space-y-1.5">
              <p className="font-mono text-[11.5px] text-foreground/90">
                By {fmtDate(followUp.dueByIso)}
              </p>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <FileText className="w-3 h-3" />
                From discharge summary · not yet scheduled
              </p>
              <div className="pt-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5"
                  onClick={() => {
                    const localIso = followUp.dueByIso.slice(0, 16);
                    const match = followUp.providerName
                      ? directory.providers.find(
                          (p) => p.name.toLowerCase() === followUp.providerName!.toLowerCase(),
                        )
                      : undefined;
                    setForm({
                      reason: followUp.providerName
                        ? `Follow-up with ${followUp.providerName}`
                        : "Primary care follow-up",
                      provider: match?.name ?? "",
                      location: match?.facility ?? "",
                      scheduled_for: localIso,
                      notes: followUp.note,
                    });
                    setOpen(true);
                  }}
                >
                  <Plus className="w-3.5 h-3.5" /> Request this appointment
                </Button>
              </div>
            </div>
          </article>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            No upcoming or pending appointments yet.
          </p>
        )
      ) : (
        <div className="space-y-2.5">
          {appointments.map((a) => {
            const title =
              a.reason ??
              a.description ??
              a.appointment_type ??
              (a.provider ? `Visit with ${a.provider}` : "Appointment");
            return (
              <article
                key={a.id}
                className="rounded-xl border border-white/[0.07] bg-card overflow-hidden"
                style={{ boxShadow: "var(--shadow-soft)" }}
              >
                {/* Header bar */}
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-white/[0.05]">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: `color-mix(in oklab, ${TEAL} 14%, transparent)`,
                    }}
                  >
                    <CalendarDays className="w-4 h-4" style={{ color: TEAL }} />
                  </div>
                  <h3 className="flex-1 min-w-0 truncate text-[12.5px] font-semibold text-foreground">
                    {title}
                  </h3>
                  {a.isRecall && (
                    <span className="inline-flex items-center rounded-full px-2 py-[3px] text-[10px] font-bold uppercase tracking-wider ring-1 ring-sky-400/40 bg-sky-400/10 text-sky-300">
                      Hospital recall
                    </span>
                  )}
                  <StatusPill status={a.status} />
                </div>

                {/* Body */}
                <div className="px-3.5 py-3 space-y-1.5">
                  <p className="font-mono text-[11.5px] text-foreground/90">
                    {fmtDate(a.scheduled_for)}
                    <span className="text-muted-foreground"> · </span>
                    {fmtTime(a.scheduled_for)}
                  </p>
                  <p className="flex items-center gap-1.5 text-[11.5px] text-slate-400">
                    <Stethoscope className="w-3 h-3" />
                    <span>Provider: {a.provider ?? "Pending assignment"}</span>
                  </p>
                  {a.location && (
                    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <MapPin className="w-3 h-3" />
                      {a.location}
                    </p>
                  )}
                  {a.notes && (
                    <p className="text-[11px] text-muted-foreground pt-1">{a.notes}</p>
                  )}
                  {(a.status?.toLowerCase() === "proposed") && (
                    <div className="pt-2">
                      <Button
                        size="sm"
                        className="gap-1.5 border-0 text-white hover:brightness-110"
                        style={{ backgroundColor: TEAL }}
                        disabled={confirmingId === a.id}
                        onClick={() => void confirmAppointment(a)}
                      >
                        {confirmingId === a.id ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Confirming…
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" /> Confirm appointment
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `color-mix(in oklab, ${TEAL} 14%, transparent)` }}
              >
                <CalendarDays className="w-4 h-4" style={{ color: TEAL }} />
              </div>
              <div>
                <DialogTitle className="text-[15px]">Request appointment</DialogTitle>
                <DialogDescription className="text-[11.5px]">
                  Your clinic will confirm the time.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="reason" className="text-[11.5px]">Reason</Label>
              <Input
                id="reason"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="e.g. Follow-up"
              />
            </div>
            <div>
              <Label htmlFor="when" className="text-[11.5px]">Preferred date & time</Label>
              <Input
                id="when"
                type="datetime-local"
                value={form.scheduled_for}
                onChange={(e) => setForm({ ...form, scheduled_for: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="location" className="text-[11.5px]">Location (optional)</Label>
              <Select
                value={form.location || undefined}
                onValueChange={(v) => setForm({ ...form, location: v, provider: "" })}
                disabled={directory.facilities.length === 0}
              >
                <SelectTrigger id="location">
                  <SelectValue
                    placeholder={
                      directory.facilities.length === 0
                        ? "Directory unavailable"
                        : "Select a hospital"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {directory.facilities.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="provider" className="text-[11.5px]">Provider (optional)</Label>
              <Select
                value={form.provider || undefined}
                onValueChange={(v) => setForm({ ...form, provider: v })}
                disabled={!form.location}
              >
                <SelectTrigger id="provider">
                  <SelectValue
                    placeholder={
                      !form.location ? "Select a hospital first" : "Select a provider"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {directory.providers
                    .filter((p) => p.facility === form.location)
                    .map((p) => (
                      <SelectItem key={p.name} value={p.name}>
                        {p.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="notes" className="text-[11.5px]">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={onCreate}
              disabled={busy || !form.scheduled_for}
              className="text-white hover:brightness-110"
              style={{ backgroundColor: TEAL }}
            >
              {busy ? "Sending…" : "Send request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DetailPageShell>
  );
}
