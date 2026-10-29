import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer, Receipt, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveMrn } from "@/features/_shared/use-active-mrn";
import { fhirProxy } from "@/lib/fhir-proxy-client";
import { useFhirPatient, fhirName, type FhirChargeItem, type FhirInvoiceFull, type FhirBundle, type FhirExtension } from "@/lib/fhir-live";

/**
 * NOTE on this file's ownership check:
 *
 * The /api/fhir-proxy route performs NO per-patient authorization — it
 * will happily return any patient's Invoice to anyone who asks. The check
 * below (`isForeignInvoice`) is a client-side, UI-layer mitigation only:
 * it stops THIS app's UI from rendering another patient's invoice to the
 * current session, but it does nothing to stop a direct call to the
 * proxy API itself. The real fix is server-side per-patient authorization
 * on the FHIR proxy (tracked separately — it requires real patient
 * authentication, which is out of scope here).
 */

/** Pulls the id out of a FHIR "Patient/{id}" reference. */
function patientIdFromReference(ref?: string): string | null {
  if (!ref) return null;
  const m = /^Patient\/(.+)$/.exec(ref);
  return m ? m[1] : null;
}

export const Route = createFileRoute("/billing/$invoiceId")({
  head: () => ({ meta: [{ title: "Invoice — My SPEHR Link" }] }),
  component: InvoiceDetailPage,
});

function fmtDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function chargeCategory(c: FhirChargeItem): string {
  const ext = (c.extension ?? []).find(
    (e: FhirExtension) => e.url === "urn:spehr:charge-category",
  );
  return ext?.valueString ?? "—";
}

function chargeAmount(c: FhirChargeItem): { value: number; currency: string } {
  return {
    value: c.priceOverride?.value ?? 0,
    currency: c.priceOverride?.currency ?? "USD",
  };
}

function InvoiceDetailPage() {
  const { invoiceId } = Route.useParams();
  const mrn = useActiveMrn();
  const patientQ = useFhirPatient(mrn);

  const invoiceQ = useQuery({
    queryKey: ["fhir", "invoice", invoiceId],
    queryFn: async () => {
      const res = await fhirProxy<FhirInvoiceFull>({
        method: "GET",
        path: `/Invoice/${invoiceId}`,
      });
      if (!res.ok || !res.data) throw new Error(`Invoice load failed (status ${res.status})`);
      return res.data;
    },
    staleTime: 30_000,
  });

  const chargesQ = useQuery({
    queryKey: ["fhir", "chargeItems", invoiceId, mrn],
    enabled: !!mrn,
    staleTime: 30_000,
    queryFn: async () => {
      // Try indexed search first.
      const indexed = await fhirProxy<FhirBundle<FhirChargeItem>>({
        method: "GET",
        path: "/ChargeItem",
        query: { "supporting-info": `Invoice/${invoiceId}`, _count: 200 },
      });
      let items: FhirChargeItem[] = [];
      if (indexed.ok && indexed.data) {
        items = (indexed.data.entry ?? [])
          .map((e) => e.resource)
          .filter((r): r is FhirChargeItem => r?.resourceType === "ChargeItem");
      }
      if (items.length === 0) {
        // Fallback: list all ChargeItems for the patient and filter client-side.
        const all = await fhirProxy<FhirBundle<FhirChargeItem>>({
          method: "GET",
          path: "/ChargeItem",
          query: { subject: `Patient/${mrn}`, _count: 500 },
        });
        if (!all.ok || !all.data) return [];
        items = (all.data.entry ?? [])
          .map((e) => e.resource)
          .filter((r): r is FhirChargeItem => r?.resourceType === "ChargeItem")
          .filter((c) =>
            (c.supportingInformation ?? []).some((s) => s.reference === `Invoice/${invoiceId}`),
          );
      }
      return items;
    },
  });

  const invoice = invoiceQ.data;
  const charges = chargesQ.data ?? [];
  const patient = patientQ.data ?? null;

  // Defense-in-depth ownership check (see note above): the invoice's FHIR
  // `subject` should reference the active session's patient. If it
  // references someone else, refuse to render their financial data.
  const subjectPatientId = patientIdFromReference(invoice?.subject?.reference);
  const isForeignInvoice = !!invoice && !!mrn && !!subjectPatientId && subjectPatientId !== mrn;

  const facility =
    invoice?.issuer?.display ||
    charges[0]?.performer?.[0]?.actor?.display ||
    "Facility";
  const invoiceNumber = invoice?.identifier?.[0]?.value ?? invoice?.id ?? invoiceId;
  const totalGross = invoice?.totalGross;
  const totalNet = invoice?.totalNet;
  const currency = totalGross?.currency ?? totalNet?.currency ?? charges[0]?.priceOverride?.currency ?? "USD";

  // "Bill to" should reflect the invoice's actual subject, never just
  // assume it's the current session's own patient (that was the bug:
  // this header used to always render the session's identity regardless
  // of whose invoice was actually loaded).
  const billToName =
    invoice?.subject?.display ||
    (subjectPatientId && subjectPatientId === mrn ? fhirName(patient).full : "") ||
    "Patient";
  const billToMrn = subjectPatientId ?? mrn ?? "—";

  return (
    <main className="pb-10 min-h-screen bg-background">
      <div className="print:hidden px-4 pt-4 flex items-center justify-between gap-3">
        <Link
          to="/billing"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to billing
        </Link>
        {!isForeignInvoice && (
          <Button size="sm" variant="outline" className="gap-2" onClick={() => window.print()}>
            <Printer className="w-4 h-4" /> Print to PDF
          </Button>
        )}
      </div>

      {isForeignInvoice ? (
        <section className="mx-4 mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <h1 className="text-sm font-semibold text-destructive">This invoice isn't available</h1>
              <p className="mt-1.5 text-xs text-muted-foreground max-w-md">
                This invoice doesn't belong to the patient currently signed in, so it can't be
                shown here. If you believe this is a billing error, contact support.
              </p>
            </div>
          </div>
        </section>
      ) : (
      <section className="print-invoice mx-4 mt-4 rounded-2xl border border-white/[0.06] bg-card p-6 print:m-0 print:rounded-none print:border-0 print:bg-white print:text-black">
        {/* Header */}
        <header className="flex items-start justify-between gap-4 border-b border-white/[0.06] pb-4 print:border-black/20">
          <div>
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              <h1 className="text-lg font-semibold">{facility}</h1>
            </div>
            <p className="mt-1 text-xs text-muted-foreground print:text-black/60">
              Invoice detail
            </p>
          </div>
          <div className="text-right text-xs">
            <p className="font-mono text-[11px] text-muted-foreground print:text-black/70">
              {invoiceNumber}
            </p>
            <p className="mt-0.5">{fmtDate(invoice?.date)}</p>
          </div>
        </header>

        {/* Patient */}
        <div className="grid grid-cols-2 gap-4 py-4 text-xs border-b border-white/[0.06] print:border-black/20">
          <div>
            <p className="uppercase tracking-wider text-muted-foreground print:text-black/60">Bill to</p>
            <p className="mt-1 font-medium text-sm">{billToName}</p>
            <p className="text-[11px] text-muted-foreground print:text-black/70 font-mono">
              MRN {billToMrn}
            </p>
          </div>
          <div className="text-right">
            <p className="uppercase tracking-wider text-muted-foreground print:text-black/60">
              Status
            </p>
            <p className="mt-1 font-medium text-sm capitalize">{invoice?.status ?? "—"}</p>
          </div>
        </div>

        {/* Items */}
        <div className="py-4">
          {invoiceQ.isLoading || chargesQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading invoice…</p>
          ) : invoiceQ.error ? (
            <p className="text-sm text-destructive">
              {(invoiceQ.error as Error).message}
            </p>
          ) : charges.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No itemized charges linked to this invoice.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground print:text-black/60 border-b border-white/[0.06] print:border-black/20">
                  <th className="py-2 pr-2 font-medium">Description</th>
                  <th className="py-2 px-2 font-medium">Category</th>
                  <th className="py-2 px-2 font-medium text-right">Qty</th>
                  <th className="py-2 pl-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {charges.map((c) => {
                  const { value, currency: cur } = chargeAmount(c);
                  return (
                    <tr key={c.id} className="border-b border-white/[0.04] print:border-black/10">
                      <td className="py-2 pr-2">{c.code?.text ?? "—"}</td>
                      <td className="py-2 px-2 text-muted-foreground print:text-black/70">
                        {chargeCategory(c)}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{c.quantity?.value ?? 1}</td>
                      <td className="py-2 pl-2 text-right tabular-nums">
                        {cur} {value.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Summary */}
        <footer className="pt-4 border-t border-white/[0.06] print:border-black/20">
          <dl className="space-y-1.5 text-sm max-w-xs ml-auto">
            {totalNet?.value !== undefined && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground print:text-black/70">Total Net</dt>
                <dd className="tabular-nums">
                  {totalNet.currency ?? currency} {totalNet.value.toFixed(2)}
                </dd>
              </div>
            )}
            {totalGross?.value !== undefined && (
              <div className="flex justify-between font-semibold text-base pt-1 border-t border-white/[0.06] print:border-black/20">
                <dt>Total Gross</dt>
                <dd className="tabular-nums">
                  {totalGross.currency ?? currency} {totalGross.value.toFixed(2)}
                </dd>
              </div>
            )}
          </dl>
        </footer>
      </section>
      )}

      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          nav, header:not(.print-invoice header), footer:not(.print-invoice footer),
          [data-bottom-nav], .print\\:hidden { display: none !important; }
          .print-invoice { box-shadow: none !important; }
        }
      `}</style>
    </main>
  );
}
