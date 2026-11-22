import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarDays, Plus, Stethoscope, MapPin, X, Loader2, FileText, RefreshCw } from "lucide-react";
import { DetailPageShell, sectionColors } from "@/components/spehr-ui";
import {
  useAppointments,
  createAppointment,
  updateAppointmentByFhirId,
} from "@/features/appointments";
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

/* Statuses spehr's Scheduling tab treats as closed (see admissions-board.tsx
 * CLOSED_APPT_STATUSES) — mirrored here so a patient can't "cancel" an
 * appointment that's already finished or already cancelled. */
const CLOSED_STATUSES = new Set(["fulfilled", "completed", "cancelled", "noshow"]);

function AppointmentsPage() {
  const { mrn, appointments, loading, refresh } = useAppointments();
  const { followUp } = useDerivedFollowUp(mrn);
  const { patient } = useDemographics();
  const directory = useSpehrDirectory();
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const patientFullName = useMemo(() => {
    const parts = [patient?.first_name, patient?.last_name].filter(Boolean) as string[];
    return parts.length ? parts.join(" ") : mrn ?? "";
  }, [patient, mrn]);

  /**
   * Cancel a myspehr-booked appointment. Same gate as everywhere else that
   * writes to FHIR in this file: PUT the FHIR Appointment to a terminal
   * `status: "cancelled"` first (so spehr's Scheduling tab — and its
   * auto-accept/auto-admit automation, which only ever acts on non-terminal
   * statuses — reflects the cancellation), and mirror that status into the
   * local `appointments` row only once the FHIR write actually succeeds.
   * Never a local-only delete: that would desync from the FHIR record spehr
   * still has, and the merge in useAppointments() would just resurrect the
   * appointment from the live FHIR read on the next refresh anyway.
   *
   * QA finding C6: this used to show "Appointment cancelled" and flip the
   * card locally as soon as the PUT returned 2xx, with no real confirmation
   * that the cancellation stuck. Two concrete bugs made that worse:
   *  1. The local-mirror write used `updateAppointment(a.id, ...)`, but on
   *     the merged row from useAppointments(), `a.id` is the FHIR resource
   *     id (every live-FHIR entry sets `id: a.id` in fhirToRow), not the
   *     Supabase `appointments` primary key — so it silently updated zero
   *     rows (guarded behind an `isLocalRow()` check that, because of how
   *     the merge always lets the live-FHIR row's `created_at: null` win,
   *     evaluated false for literally every appointment visible in the
   *     live feed — i.e. always). The local mirror never actually recorded
   *     the cancellation.
   *  2. The toast fired off the PUT's HTTP status alone. Now we read the
   *     resource back and require status to actually read "cancelled"
   *     before calling it a success — if the write didn't really stick
   *     upstream, this surfaces as an error instead of a false "cancelled".
   */
  const cancelAppointment = async (a: (typeof appointments)[number]) => {
    if (!a.fhir_id) {
      toast.error("Cannot cancel", { description: "Missing FHIR record id." });
      return;
    }
    const confirmed = window.confirm(
      "Cancel this appointment? This can't be undone from here — you'll need to request a new one if you change your mind.",
    );
    if (!confirmed) return;

    setCancelingId(a.id);
    try {
      const startIso = new Date(a.scheduled_for).toISOString();
      const endIso = new Date(new Date(a.scheduled_for).getTime() + 30 * 60_000).toISOString();
      const facilityDisplay = a.location?.trim() ?? "";
      const resource = withMyspehrTag({
        resourceType: "Appointment",
        id: a.fhir_id,
        status: "cancelled",
        description: a.reason ?? a.description ?? "Cancelled by patient",
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
      const res = await fhirProxy<{ status?: string }>({
        method: "PUT",
        path: `/Appointment/${a.fhir_id}`,
        body: resource,
      });
      if (!res.ok) throw new Error(`FHIR ${res.status}: ${res.raw.slice(0, 200)}`);

      // Verify, don't trust: a 2xx from the proxy only means the write was
      // accepted, not that the terminal status actually persisted. Re-read
      // the resource and require it to actually say "cancelled" before
      // this counts as success.
      const verify = await fhirProxy<{ status?: string }>({
        method: "GET",
        path: `/Appointment/${a.fhir_id}`,
      });
      const persistedStatus = (verify.data?.status ?? "").toLowerCase();
      if (!verify.ok || persistedStatus !== "cancelled") {
        throw new Error(
          "The cancellation did not persist on the server. Please try again.",
        );
      }

      // Mirror into the local Supabase row by fhir_id — not a.id, which on
      // this merged row is the FHIR id, not the Supabase primary key (see
      // the comment above). Tolerant of there being no local row at all.
      await updateAppointmentByFhirId(a.fhir_id, { status: "cancelled" }).catch((e) => {
        // The FHIR write (source of truth) is already confirmed above; a
        // failure to update our own read-model mirror shouldn't turn a
        // real, verified cancellation into an error toast — just log it so
        // it's visible, and let the next refresh/poll reconcile from FHIR.
        console.error("[appointments] local mirror update after cancel failed", e);
      });

      toast.success("Appointment cancelled");
      await refresh();
    } catch (e) {
      toast.error("Could not cancel", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setCancelingId(null);
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

  // QA L21: the date field previously accepted any raw string with no format
  // or minimum-date validation (e.g. a bare, incomplete "202610"), and the
  // "Send request" button was just silently disabled with no indication of
  // why. `scheduledDate`/`dateError` give the UI something concrete to show,
  // and `minLocalDateTime` puts an HTML5 floor on the native picker itself.
  const scheduledDate = form.scheduled_for ? new Date(form.scheduled_for) : null;
  const dateIsValid = !!scheduledDate && !Number.isNaN(scheduledDate.getTime());
  const dateIsPast = dateIsValid && scheduledDate!.getTime() < Date.now();
  const dateError = !form.scheduled_for
    ? null
    : !dateIsValid
      ? "Enter a complete date and time."
      : dateIsPast
        ? "Choose a date and time in the future."
        : null;
  const minLocalDateTime = useMemo(() => {
    const now = new Date();
    now.setSeconds(0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }, []);
  const canSend = !busy && !!form.scheduled_for && dateIsValid && !dateIsPast;

  const onCreate = async () => {
    if (!mrn || !canSend) return;
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
                  {/* QA L22: a "Confirm appointment" action used to show here for a
                      status "proposed" appointment too, letting a patient appear to
                      self-confirm their own request. In this app "proposed" always
                      means the PATIENT requested it and the CLINIC still needs to
                      accept it (see onCreate below) — the patient's only appropriate
                      action while that's pending is to cancel/withdraw the request,
                      never to "confirm" it themselves. */}
                  {!CLOSED_STATUSES.has(a.status?.toLowerCase() ?? "") && a.fhir_id && (
                    <div className="pt-2 flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-rose-300 hover:text-rose-200 hover:bg-rose-400/10"
                        disabled={cancelingId === a.id}
                        onClick={() => void cancelAppointment(a)}
                      >
                        {cancelingId === a.id ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cancelling…
                          </>
                        ) : (
                          <>
                            <X className="w-3.5 h-3.5" /> Cancel
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
                min={minLocalDateTime}
                value={form.scheduled_for}
                onChange={(e) => setForm({ ...form, scheduled_for: e.target.value })}
                aria-invalid={!!dateError}
              />
              {dateError && (
                <p className="mt-1 text-[11px] text-rose-300">{dateError}</p>
              )}
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
                      directory.loading
                        ? "Loading directory…"
                        : directory.facilities.length === 0
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
              {!directory.loading && directory.failed && (
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  Couldn't reach the facility directory — you can still send this
                  request and the clinic will assign a location.
                  <button
                    type="button"
                    onClick={directory.retry}
                    className="inline-flex items-center gap-1 text-foreground underline underline-offset-2 hover:text-primary"
                  >
                    <RefreshCw className="w-3 h-3" /> Retry
                  </button>
                </p>
              )}
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
              <p className="mt-1 text-[11px] text-muted-foreground">
                Leave blank and the clinic will assign a provider when they
                confirm the request — it won't be chosen for you silently.
              </p>
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
          <DialogFooter className="flex-col items-stretch gap-1.5 sm:flex-row sm:items-center">
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={onCreate}
                disabled={!canSend}
                className="text-white hover:brightness-110"
                style={{ backgroundColor: TEAL }}
              >
                {busy ? "Sending…" : "Send request"}
              </Button>
            </div>
            {!canSend && !busy && (
              <p className="text-right text-[11px] text-muted-foreground">
                {!form.scheduled_for
                  ? "Pick a preferred date & time to continue."
                  : dateError}
              </p>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DetailPageShell>
  );
}
