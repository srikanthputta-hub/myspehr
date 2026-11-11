import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Receipt, Loader2, Check, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { DetailPageShell, CardShell, StatusBadge, sectionColors } from "@/components/spehr-ui";
import { Button } from "@/components/ui/button";
import { useActiveMrn } from "@/features/_shared/use-active-mrn";
import {
  fhirProxy,
  withMyspehrTag,
  myspehrPaymentId,
} from "@/lib/fhir-proxy-client";

export const Route = createFileRoute("/billing")({
  head: () => ({ meta: [{ title: "Billing — My SPEHR Link" }] }),
  component: BillingPage,
});

const STATUS_COLOR: Record<string, string> = {
  issued: "oklch(0.65 0.18 25)",
  outstanding: "oklch(0.65 0.18 25)",
  balanced: "oklch(0.7 0.12 145)",
  paid: "oklch(0.7 0.12 145)",
  cancelled: "oklch(0.65 0.04 240)",
  draft: "oklch(0.78 0.12 80)",
};

interface FhirInvoice {
  resourceType: "Invoice";
  id: string;
  status: string;
  date?: string;
  totalGross?: { value?: number; currency?: string };
  totalNet?: { value?: number; currency?: string };
  identifier?: Array<{ value?: string }>;
  type?: { text?: string };
  meta?: { tag?: Array<{ system?: string; code?: string }> };
}

interface FhirBundle<T> {
  resourceType: "Bundle";
  entry?: Array<{ resource?: T }>;
}

function fmtDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function invoiceTitle(inv: FhirInvoice) {
  return inv.type?.text || inv.identifier?.[0]?.value || `Invoice ${inv.id}`;
}

function invoiceAmount(inv: FhirInvoice) {
  const v = inv.totalGross?.value ?? inv.totalNet?.value ?? 0;
  const currency = inv.totalGross?.currency ?? inv.totalNet?.currency ?? "USD";
  return { value: v, currency };
}

function BillingPage() {
  const mrn = useActiveMrn();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [payingId, setPayingId] = useState<string | null>(null);
  // Synchronous (ref-based) guard against double-submission: React state
  // updates from onMutate/setPayingId are not visible until the next
  // render, so a rapid double-click (or a retry fired before that render)
  // could otherwise call mutate() twice for the same invoice before the
  // button has a chance to visually disable. This ref blocks that
  // immediately, in the same synchronous click handler.
  const submittingInvoiceIdsRef = useRef<Set<string>>(new Set());

  const invoicesQuery = useQuery({
    queryKey: ["fhir", "invoices", mrn],
    enabled: !!mrn,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const res = await fhirProxy<FhirBundle<FhirInvoice>>({
        method: "GET",
        path: "/Invoice",
        query: { subject: `Patient/${mrn}`, _sort: "-date" },
      });
      if (!res.ok || !res.data) {
        throw new Error(`Could not load invoices (status ${res.status})`);
      }
      return (res.data.entry ?? [])
        .map((e) => e.resource)
        .filter((r): r is FhirInvoice => r?.resourceType === "Invoice");
    },
  });

  const invoices = invoicesQuery.data ?? [];
  const outstanding = invoices
    .filter((i) => i.status === "issued" || i.status === "outstanding")
    .reduce((sum, i) => sum + invoiceAmount(i).value, 0);

  const payMutation = useMutation({
    mutationFn: async (inv: FhirInvoice) => {
      // Idempotency guard: a PaymentNotice may already exist for this
      // invoice (an earlier click that the UI missed, a retried request,
      // etc). Check before creating another one rather than blindly
      // PUTting a brand-new PaymentNotice every time.
      const existing = await fhirProxy<FhirBundle<{ id: string }>>({
        method: "GET",
        path: "/PaymentNotice",
        query: { request: `Invoice/${inv.id}`, _count: 1 },
      });
      if (existing.ok && (existing.data?.entry?.length ?? 0) > 0) {
        return { alreadyExisted: true as const };
      }

      const { value, currency } = invoiceAmount(inv);
      const id = myspehrPaymentId();
      const resource = withMyspehrTag({
        resourceType: "PaymentNotice",
        id,
        status: "active",
        request: { reference: `Invoice/${inv.id}` },
        amount: { value, currency },
        paymentStatus: { coding: [{ code: "paid", display: "Paid" }] },
        created: new Date().toISOString(),
        paymentMethod: { text: "MySPEHR patient portal" },
      });
      const res = await fhirProxy({
        method: "PUT",
        path: `/PaymentNotice/${id}`,
        body: resource,
      });
      if (!res.ok) throw new Error(`FHIR ${res.status}: ${res.raw.slice(0, 200)}`);
      return { id, alreadyExisted: false as const };
    },
    onMutate: (inv) => setPayingId(inv.id),
    onSuccess: (result) => {
      if (result.alreadyExisted) {
        toast.info("Already submitted", {
          description: "A payment for this invoice was already recorded.",
        });
      } else {
        toast.success("Payment submitted", {
          description: "It will show as settled on your billing summary shortly.",
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["fhir", "invoices", mrn] });
    },
    onError: (err) => {
      toast.error("Payment failed", {
        description: err instanceof Error ? err.message : undefined,
      });
    },
    onSettled: (_data, _err, inv) => {
      setPayingId(null);
      submittingInvoiceIdsRef.current.delete(inv.id);
    },
  });

  return (
    <DetailPageShell
      title="Billing"
      subtitle="Invoices & payments"
      icon={Receipt}
      color={sectionColors.appointments}
    >
      <div className="rounded-2xl border border-border bg-card p-5 mb-4">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Outstanding balance
        </p>
        <p className="mt-1 text-3xl font-semibold">${outstanding.toFixed(2)}</p>
      </div>

      {invoicesQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading invoices…</p>
      ) : invoicesQuery.error ? (
        <p className="text-sm text-destructive">
          {(invoicesQuery.error as Error).message}
        </p>
      ) : invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invoices on file.</p>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => {
            const color = STATUS_COLOR[inv.status] ?? sectionColors.appointments;
            const { value, currency } = invoiceAmount(inv);
            const canPay = inv.status === "issued" || inv.status === "outstanding";
            const isPaying = payingId === inv.id && payMutation.isPending;
            return (
              <div
                key={inv.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate({ to: "/billing/$invoiceId", params: { invoiceId: inv.id } })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate({ to: "/billing/$invoiceId", params: { invoiceId: inv.id } });
                  }
                }}
                className="cursor-pointer transition-colors hover:brightness-110 rounded-2xl"
              >
                <CardShell
                  icon={Receipt}
                  color={color}
                  title={invoiceTitle(inv)}
                  action={
                    <div className="flex items-center gap-2">
                      <StatusBadge label={inv.status} color={color} />
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  }
                >
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{fmtDate(inv.date)}</span>
                    <span className="font-medium">
                      {currency} {value.toFixed(2)}
                    </span>
                  </div>
                  {canPay && (
                    <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        className="gap-2"
                        disabled={isPaying || submittingInvoiceIdsRef.current.has(inv.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          // Guard against a rapid double-click submitting two
                          // PaymentNotice PUTs before React re-renders the
                          // disabled state.
                          if (submittingInvoiceIdsRef.current.has(inv.id)) {
                            return;
                          }
                          submittingInvoiceIdsRef.current.add(inv.id);
                          payMutation.mutate(inv);
                        }}
                      >
                        {isPaying ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" /> Submitting…
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" /> Pay {currency} {value.toFixed(2)}
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </CardShell>
              </div>
            );
          })}
        </div>
      )}
    </DetailPageShell>
  );
}
