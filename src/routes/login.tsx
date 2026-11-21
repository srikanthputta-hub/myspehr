import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { patientStore, type FhirPatient } from "@/lib/patient-store";
import { verifyPatientLogin } from "@/lib/patient-login.functions";
import { useFhirSync } from "@/lib/use-fhir-sync";
import logoUrl from "@/assets/spehr-logo.png";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Patient Gateway — My SPEHR Link" },
      { name: "description", content: "Secure patient gateway for My SPEHR Link, the patient-facing portal of the S.P.E.H.R. clinical network." },
    ],
  }),
  component: LoginPage,
});

// Generic on purpose (QA finding C5): the same message covers "no such
// MRN" and "DOB doesn't match" so the client can never tell which one
// failed. Revealing that would just be a different enumeration vector —
// MRNs are plain 6-digit numbers shown throughout the clinician-facing
// spehr app, so they're trivially guessable/scrapable.
const INVALID_CREDENTIALS_MESSAGE =
  "Invalid credentials. Check your MRN and date of birth and try again.";

function LoginPage() {
  const navigate = useNavigate();
  const sync = useFhirSync();
  const verifyLogin = useServerFn(verifyPatientLogin);
  const [mrn, setMrn] = useState("");
  const [dob, setDob] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = mrn.trim();
    if (!digits) {
      toast.error("Please enter your MRN");
      return;
    }
    if (!dob) {
      toast.error("Please enter your date of birth");
      return;
    }
    const normalized = `MRN-${digits}`;
    setLoading(true);

    try {
      // Real second factor: MRN alone used to be enough to open a full
      // chart, and even a nonexistent MRN "signed in" to an empty shell.
      // Both the MRN and DOB must now match a real patient record before
      // anything unlocks — verified server-side so the FHIR bearer token
      // and the unauthenticated chart data never touch the browser first.
      const result = await verifyLogin({ data: { mrnDigits: digits, dob } });
      if (!result.ok) {
        toast.error(INVALID_CREDENTIALS_MESSAGE);
        setLoading(false);
        return;
      }

      const patient: FhirPatient = result.patient;
      patientStore.set(patient);

      toast.success("Signed in");
      navigate({ to: "/dashboard" });

      // Kick the silent FHIR sync after the next tick so it never blocks
      // the navigation or paint. UI fills in via realtime as rows arrive.
      setTimeout(() => {
        void sync(normalized, { purge: true, force: true }).catch((err) => {
          const msg = err instanceof Error ? err.message : "Sync failed";
          toast.error(msg);
        });
      }, 0);
    } catch {
      // Network/server-fn error — same generic message, never a stack
      // trace or "backend not configured" detail to an unauthenticated
      // caller.
      toast.error(INVALID_CREDENTIALS_MESSAGE);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="h-full flex flex-col text-foreground">
      <header className="px-6 py-6 flex items-center border-b border-white/[0.06] backdrop-blur-md bg-white/[0.02]">
        <span className="text-xl font-bold tracking-tight">MySpehr</span>
      </header>

      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <div
          className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-2xl p-8 sm:p-10"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="flex justify-center py-6">
            <img
              src={logoUrl}
              alt="S Group Private Network"
              className="h-40 w-auto drop-shadow-xl"
            />
          </div>

          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="mrn"
                className="block text-[11px] font-medium text-muted-foreground/70 mb-1.5 pl-0.5"
              >
                MRN
              </label>
              <input
                id="mrn"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                required
                value={mrn}
                onChange={(e) => setMrn(e.target.value.replace(/\D/g, ""))}
                placeholder="MRN- "
                autoComplete="off"
                className="w-full h-12 px-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-transparent transition font-mono tracking-wider"
              />
            </div>

            <div>
              <label
                htmlFor="dob"
                className="block text-[11px] font-medium text-muted-foreground/70 mb-1.5 pl-0.5"
              >
                Date of birth
              </label>
              <input
                id="dob"
                type="date"
                required
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                autoComplete="off"
                className="w-full h-12 px-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-transparent transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group w-full h-12 rounded-xl bg-primary text-primary-foreground font-medium transition active:scale-[.99] disabled:opacity-60 flex items-center justify-center gap-2 hover:shadow-[0_0_28px_-6px_oklch(0.72_0.08_185/0.45)]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Authorizing…
                </>
              ) : (
                "Login"
              )}
            </button>
          </form>
        </div>
      </div>

      <footer className="px-6 pb-10 pt-4 text-center text-[11px] text-muted-foreground/60 max-w-xl mx-auto">
        Disclaimer: All patient data displayed in this system is 100% fabricated for
        simulation purposes and contains no real Protected Health Information (PHI).
      </footer>
    </main>
  );
}
