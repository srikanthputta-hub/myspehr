import { useState, type ComponentType, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Menu,
  Settings,
  Bell,
  Shield,
  HelpCircle,
  Info,
  GraduationCap,
  LogOut,
  ChevronRight,
  User,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { DetailPageShell, CardShell, sectionColors } from "@/components/spehr-ui";
import { patientStore } from "@/lib/patient-store";
import { clearAllChatHistory } from "@/lib/chat-storage";
import { useActiveMrn } from "@/features/_shared/use-active-mrn";
import { useFhirConditions, conceptText, type FhirCondition } from "@/lib/fhir-live";

export const Route = createFileRoute("/more")({
  head: () => ({ meta: [{ title: "More — My SPEHR Link" }] }),
  component: MorePage,
});

type ItemKey =
  | "profile"
  | "settings"
  | "notifications"
  | "privacy"
  | "help"
  | "about"
  | "training";

type Item = {
  key: ItemKey;
  label: string;
  desc: string;
  icon: ComponentType<{ className?: string; style?: React.CSSProperties }>;
  to?: "/profile";
};

const SECTIONS: ReadonlyArray<{ title: string; items: Item[] }> = [
  {
    title: "Account",
    items: [
      { key: "profile", label: "Profile", desc: "Your demographics & contact", icon: User, to: "/profile" },
    ],
  },
  {
    title: "App settings",
    items: [
      { key: "settings", label: "Settings", desc: "App preferences & language", icon: Settings },
      { key: "notifications", label: "Notifications", desc: "Alerts & reminders", icon: Bell },
      { key: "privacy", label: "Privacy & Security", desc: "Data, permissions & sign-in", icon: Shield },
    ],
  },
  {
    title: "Support",
    items: [
      { key: "help", label: "Help & Support", desc: "FAQs and contact us", icon: HelpCircle },
      { key: "about", label: "About", desc: "App version & legal", icon: Info },
    ],
  },
  {
    title: "Learn",
    items: [
      { key: "training", label: "Training & Education", desc: "Modules for your conditions", icon: GraduationCap },
    ],
  },
];

function MorePage() {
  const navigate = useNavigate();
  const [openKey, setOpenKey] = useState<ItemKey | null>(null);

  // Settings state
  const [language, setLanguage] = useState("en");
  const [darkMode, setDarkMode] = useState(true);
  // Notifications state
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [appointmentReminders, setAppointmentReminders] = useState(true);
  const [medicationReminders, setMedicationReminders] = useState(false);
  // Privacy state
  const [analytics, setAnalytics] = useState(true);

  const handleLogout = () => {
    patientStore.set(null);
    // Prevent a prior patient's typed chat drafts from lingering in
    // localStorage on a shared/public device after sign-out.
    clearAllChatHistory();
    navigate({ to: "/login" });
  };

  const closeDialog = () => setOpenKey(null);
  const saveAndClose = (msg: string) => {
    toast.success(msg);
    closeDialog();
  };

  return (
    <DetailPageShell
      title="More"
      subtitle="All modules & settings"
      icon={Menu}
      color={sectionColors.records}
    >
      <div className="space-y-5">
        {SECTIONS.map((sec) => (
          <CardShell key={sec.title} icon={Menu} color={sectionColors.records} title={sec.title}>
            <ul className="divide-y divide-white/[0.05]">
              {sec.items.map((item) => {
                const Icon = item.icon;
                const inner = (
                  <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: "color-mix(in oklab, var(--brand) 10%, transparent)" }}
                    >
                      <Icon className="w-[18px] h-[18px]" style={{ color: "var(--brand)" }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{item.label}</p>
                      <p className="text-xs text-muted-foreground truncate">{item.desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                );
                return (
                  <li key={item.key}>
                    {item.to ? (
                      <Link to={item.to} className="block hover:bg-white/[0.02]">
                        {inner}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setOpenKey(item.key)}
                        className="w-full text-left hover:bg-white/[0.02]"
                      >
                        {inner}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardShell>
        ))}

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-white/[0.08] text-sm font-medium text-white/60 hover:text-white hover:bg-white/[0.04] transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>

      {/* Settings */}
      <SimpleDialog
        open={openKey === "settings"}
        onClose={closeDialog}
        title="Settings"
        description="Customize how the app looks and behaves."
        onSave={() => saveAndClose("Settings saved")}
      >
        <Row label="Language">
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="es">Español</SelectItem>
              <SelectItem value="hi">हिन्दी</SelectItem>
              <SelectItem value="fr">Français</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <ToggleRow label="Dark mode" checked={darkMode} onChange={setDarkMode} />
      </SimpleDialog>

      {/* Notifications */}
      <SimpleDialog
        open={openKey === "notifications"}
        onClose={closeDialog}
        title="Notifications"
        description="Choose what you want to be alerted about."
        onSave={() => saveAndClose("Notification preferences updated")}
      >
        <ToggleRow label="Push notifications" checked={pushEnabled} onChange={setPushEnabled} />
        <ToggleRow label="Email notifications" checked={emailEnabled} onChange={setEmailEnabled} />
        <ToggleRow label="Appointment reminders" checked={appointmentReminders} onChange={setAppointmentReminders} />
        <ToggleRow label="Medication reminders" checked={medicationReminders} onChange={setMedicationReminders} />
      </SimpleDialog>

      {/* Privacy */}
      <SimpleDialog
        open={openKey === "privacy"}
        onClose={closeDialog}
        title="Privacy & Security"
        description="Control how your data is used and protected."
        onSave={() => saveAndClose("Privacy settings updated")}
      >
        {/* QA L27: there's no password/biometric infrastructure behind sign-in
            at all (login is MRN-only — see routes/login.tsx) so this toggle
            did nothing real no matter how it was set. Disabled + labeled as
            a placeholder rather than removed outright, so the roadmap intent
            stays visible without implying it works today. */}
        <ToggleRow label="Biometric sign-in" checked={false} onChange={() => {}} disabled />
        <p className="text-[11px] text-muted-foreground -mt-1.5">
          Placeholder — not available yet. Sign-in is MRN-only in this demo; there's no
          biometric auth behind this toggle.
        </p>
        <ToggleRow label="Share anonymous analytics" checked={analytics} onChange={setAnalytics} />
        <p className="text-xs text-muted-foreground pt-2">
          Connections to this app are encrypted in transit (HTTPS). This is a demo
          application and does not yet enforce per-patient access controls on stored
          records — avoid entering real personal health information. Read our privacy
          policy in About.
        </p>
      </SimpleDialog>

      {/* Help */}
      <SimpleDialog
        open={openKey === "help"}
        onClose={closeDialog}
        title="Help & Support"
        description="We're here to help."
      >
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Browse common questions or get in touch with our care team.
          </p>
          <a
            href="mailto:support@myspehr.live"
            className="block rounded-lg border border-white/[0.08] px-3 py-2.5 hover:bg-white/[0.04]"
          >
            📧 support@myspehr.live
          </a>
          {/* QA L27: this used to be an obviously-fake "+1 (800) 123-4567" styled
              and linked (tel:) exactly like a real support line — tapping it
              would dial an unrelated real phone number. No real support line
              exists for this demo, so it's removed rather than left looking
              real; email above is the one working contact channel. */}
        </div>
      </SimpleDialog>

      {/* About */}
      <SimpleDialog
        open={openKey === "about"}
        onClose={closeDialog}
        title="About"
        description="My SPEHR Link"
      >
        <div className="space-y-3 text-sm text-muted-foreground">
          <p><span className="text-foreground font-medium">Version:</span> 1.0.0</p>
          <p><span className="text-foreground font-medium">Build:</span> 2026.06.25</p>
          <p>© 2026 SPEHR Health. All rights reserved.</p>
          {/* QA L27: Privacy & Security said "Read our privacy policy in
              About" but there was no privacy policy content here at all. */}
          <div className="pt-2 border-t border-white/[0.08]">
            <p className="text-foreground font-medium mb-1">Privacy policy</p>
            <p>
              All patient data in this app is synthetic demo data — no real Protected
              Health Information (PHI) is collected, stored, or processed here.
            </p>
            <p className="mt-1.5">
              Demo records are mirrored from the shared S.P.E.H.R. FHIR server into this
              app's own database on sign-in and are automatically purged after 48 hours.
              Connections are encrypted in transit (HTTPS). Data is not sold or shared
              with third parties. This demo does not yet enforce per-patient access
              controls on stored records, so no real personal health information should
              ever be entered.
            </p>
            <p className="mt-1.5">Questions: support@myspehr.live.</p>
          </div>
        </div>
      </SimpleDialog>

      {/* Training */}
      <TrainingDialog open={openKey === "training"} onClose={closeDialog} />
    </DetailPageShell>
  );
}

function SimpleDialog({
  open,
  onClose,
  title,
  description,
  children,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  onSave?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3 py-2">{children}</div>
        <DialogFooter>
          {onSave ? (
            <>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={onSave}>Save</Button>
            </>
          ) : (
            <Button onClick={onClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Row label={label}>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </Row>
  );
}

/* ---------- Training & Education (personalised via live FHIR Conditions) ---------- */

// QA L26: "Modules matched to your active conditions" was matching against
// EVERY Condition on file for the patient — including resolved/historical
// ones — with no clinicalStatus filter at all. A patient admitted for
// pneumonia but with an old, long-resolved stroke in their history could
// get "Stroke Recovery" recommended over anything about pneumonia, because
// the resolved stroke Condition matched the regex just as readily as the
// active one. Scope matching to Conditions whose clinicalStatus is actually
// active (or a recurrence/relapse of an active problem) — never
// resolved/inactive/remission ones.
const ACTIVE_CLINICAL_STATUS_CODES = new Set(["active", "recurrence", "relapse"]);

function isActiveCondition(c: FhirCondition): boolean {
  const code = c.clinicalStatus?.coding?.find((x) => x.code)?.code?.toLowerCase();
  if (code) return ACTIVE_CLINICAL_STATUS_CODES.has(code);
  // No coded clinicalStatus — fall back to the display text, and only
  // treat it as active when the text doesn't say otherwise. An entirely
  // unknown status is kept (rather than silently dropped) so a condition
  // with missing metadata doesn't just vanish from matching.
  const text = conceptText(c.clinicalStatus).toLowerCase();
  if (!text) return true;
  return !/resolved|inactive|remission/.test(text);
}

function TrainingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mrn = useActiveMrn();
  // Only fetch when the dialog is opened.
  const cq = useFhirConditions(open ? mrn : null);
  const conditions = cq.data ?? [];
  const activeConditions = conditions.filter(isActiveCondition);

  const modules = personalizedModules(activeConditions.map((c) => conceptText(c.code)));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Training & Education</DialogTitle>
          <DialogDescription>
            {activeConditions.length > 0
              ? "Modules matched to your active conditions."
              : "General health & wellness modules."}
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 text-sm py-2">
          {modules.map((t) => (
            <li
              key={t}
              className="rounded-lg border border-white/[0.08] px-3 py-2.5 hover:bg-white/[0.04] cursor-pointer"
              onClick={() => toast.info(`Opening "${t}"…`)}
            >
              {t}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const MODULE_MAP: Array<{ match: RegExp; module: string }> = [
  { match: /hypertens|high blood pressure/i, module: "Managing Hypertension" },
  { match: /diabet/i, module: "Diabetes Self-Care" },
  { match: /asthma|copd|respirat/i, module: "Breathing & Lung Health" },
  { match: /cardi|heart|coronary|infarct/i, module: "Heart Health After Discharge" },
  { match: /kidney|renal/i, module: "Kidney Health Basics" },
  { match: /stroke|cva/i, module: "Stroke Recovery" },
  { match: /anxiety|depress|mental/i, module: "Mental Well-being" },
  { match: /pregnan/i, module: "Prenatal Care" },
  { match: /obes|overweight/i, module: "Healthy Weight Management" },
  { match: /chole|lipid/i, module: "Cholesterol & Diet" },
];

const FALLBACK_MODULES = [
  "Understanding Your Labs",
  "Healthy Eating Basics",
  "Staying Active After Discharge",
  "When to Call Your Doctor",
];

function personalizedModules(conditionTexts: string[]): string[] {
  const matched = new Set<string>();
  for (const t of conditionTexts) {
    for (const m of MODULE_MAP) {
      if (m.match.test(t)) matched.add(m.module);
    }
  }
  const arr = Array.from(matched);
  // Always append a couple of general modules.
  for (const g of FALLBACK_MODULES) {
    if (arr.length >= 6) break;
    if (!arr.includes(g)) arr.push(g);
  }
  return arr;
}
