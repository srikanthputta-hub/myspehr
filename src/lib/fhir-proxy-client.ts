/**
 * Browser-side helper for the MySPEHR ↔ Medblocks FHIR proxy.
 *
 * All writes MUST carry the `urn:spehr:source|myspehr` meta tag so SPEHR's
 * inbound poller ingests them (and so we don't loop over SPEHR's own data).
 */

export interface FhirProxyOptions {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  query?: Record<string, string | number | undefined | null>;
  body?: unknown;
}

export interface FhirProxyResult<T = unknown> {
  status: number;
  ok: boolean;
  data: T | null;
  raw: string;
}

export async function fhirProxy<T = unknown>(opts: FhirProxyOptions): Promise<FhirProxyResult<T>> {
  const query: Record<string, string> | undefined = opts.query
    ? Object.fromEntries(
        Object.entries(opts.query)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(([k, v]) => [k, String(v)]),
      )
    : undefined;

  const res = await fetch("/api/fhir-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      method: opts.method,
      path: opts.path,
      query,
      body: opts.body,
    }),
  });

  const raw = await res.text();
  let data: T | null = null;
  if (raw) {
    try {
      data = JSON.parse(raw) as T;
    } catch {
      data = null;
    }
  }
  return { status: res.status, ok: res.ok, data, raw };
}

export const MYSPEHR_TAG = { system: "urn:spehr:source", code: "myspehr" } as const;

interface WithMeta {
  meta?: { tag?: Array<{ system?: string; code?: string }> };
  [key: string]: unknown;
}

/** Ensure the resource carries `meta.tag = [{system:"urn:spehr:source", code:"myspehr"}]`. */
export function withMyspehrTag<T extends WithMeta>(resource: T): T {
  const existing = resource.meta?.tag ?? [];
  const hasTag = existing.some((t) => t.system === MYSPEHR_TAG.system && t.code === MYSPEHR_TAG.code);
  if (hasTag) return resource;
  return {
    ...resource,
    meta: { ...(resource.meta ?? {}), tag: [...existing, { ...MYSPEHR_TAG }] },
  };
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function myspehrAppointmentId(): string {
  return `myspehr-appt-${uuid()}`;
}

export function myspehrPaymentId(): string {
  return `myspehr-pay-${uuid()}`;
}
