import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { User, IdCard, MapPin, Phone, LifeBuoy } from "lucide-react";
import { DetailPageShell, CardShell, sectionColors } from "@/components/spehr-ui";
import { LiveMeta } from "@/components/live-meta";
import { Skeleton } from "@/components/ui/skeleton";
import { patientStore } from "@/lib/patient-store";
import { useActiveMrn } from "@/features/_shared/use-active-mrn";
import { useFhirPatient, fhirName, type FhirPatient } from "@/lib/fhir-live";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile — My SPEHR Link" }] }),
  component: ProfilePage,
});

function addressText(p: FhirPatient | null) {
  const a = p?.address?.[0];
  if (!a) return "";
  if (a.text) return a.text;
  return [a.line?.join(", "), a.city, a.state, a.postalCode, a.country].filter(Boolean).join(", ");
}

function phone(p: FhirPatient | null) {
  return p?.telecom?.find((t) => t.system === "phone")?.value ?? "";
}

function ProfilePage() {
  const navigate = useNavigate();
  const mrn = useActiveMrn();
  const q = useFhirPatient(mrn);
  const patient = q.data ?? null;
  const { full } = fhirName(patient);

  const onSignOut = () => {
    patientStore.set(null);
    navigate({ to: "/login" });
  };

  const address = addressText(patient);
  const contact = patient?.contact?.[0];
  const contactName =
    contact?.name?.text ??
    [contact?.name?.given?.join(" "), contact?.name?.family].filter(Boolean).join(" ");
  const contactPhone = contact?.telecom?.find((t) => t.system === "phone")?.value;

  return (
    <DetailPageShell
      title="Profile"
      subtitle="Account & demographics"
      icon={User}
      color={sectionColors.records}
    >
      <LiveMeta updatedAt={q.dataUpdatedAt} onRefresh={q.refresh} isFetching={q.isFetching} />

      <div className="space-y-3">
        <CardShell icon={IdCard} color={sectionColors.records} title="Identity">
          <div className="space-y-3 text-sm">
            <Field label="Name" value={full} loading={q.isLoading} />
            <Field label="MRN" value={mrn ?? ""} mono loading={!mrn} />
            <Field label="Date of birth" value={patient?.birthDate ?? ""} loading={q.isLoading} />
            <Field label="Gender" value={patient?.gender ?? ""} capitalize loading={q.isLoading} />
          </div>
        </CardShell>

        <CardShell icon={MapPin} color={sectionColors.appointments} title="Address">
          <Field value={address} loading={q.isLoading} block />
        </CardShell>

        <CardShell icon={Phone} color={sectionColors.medications} title="Contact number">
          <Field value={phone(patient)} mono loading={q.isLoading} block />
        </CardShell>

        {(contactName || contactPhone) && (
          <CardShell icon={LifeBuoy} color={sectionColors.allergies} title="Emergency contact">
            <div className="space-y-2 text-sm">
              {contactName && <Field label="Name" value={contactName} />}
              {contactPhone && <Field label="Phone" value={contactPhone} mono />}
            </div>
          </CardShell>
        )}
      </div>

      <button
        onClick={onSignOut}
        className="mt-4 w-full h-11 rounded-xl border border-border bg-card text-sm font-medium hover:bg-accent transition-colors"
      >
        Sign out
      </button>
    </DetailPageShell>
  );
}

function Field({
  label,
  value,
  mono,
  capitalize,
  loading,
  block,
}: {
  label?: string;
  value: string;
  mono?: boolean;
  capitalize?: boolean;
  loading?: boolean;
  block?: boolean;
}) {
  const content = loading ? (
    <Skeleton className="h-4 w-40" />
  ) : value ? (
    <p className={`mt-0.5 ${mono ? "font-mono" : ""} ${capitalize ? "capitalize" : ""}`}>{value}</p>
  ) : (
    <p className="mt-0.5 text-muted-foreground">Not on file</p>
  );
  if (block) return <div>{content}</div>;
  return (
    <div>
      {label && <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>}
      {content}
    </div>
  );
}
