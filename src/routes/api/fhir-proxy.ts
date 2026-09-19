import { createFileRoute } from "@tanstack/react-router";

/**
 * Generic authenticated passthrough to the Medblocks (HAPI FHIR R4) server.
 *
 * Request contract (matches SPEHR's `fhir-proxy` edge function):
 *   POST /api/fhir-proxy
 *   Body: { method: "GET"|"POST"|"PUT"|"DELETE"|"PATCH", path: string,
 *           query?: Record<string,string>, body?: unknown }
 *
 * Response: Medblocks' response verbatim (status + JSON body).
 *
 * Includes jittered-backoff retry on HTTP 409 (HAPI version conflicts on PUT).
 * Same-origin only — cannot be used as an open relay.
 */

interface ProxyRequest {
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
}

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // same-origin / server-to-server
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  try {
    if (new URL(request.url).host === host) return true;
  } catch {
    /* fall through */
  }
  return (
    host === "myspehr.live" ||
    host === "www.myspehr.live"
  );
}

async function forward(payload: ProxyRequest): Promise<Response> {
  const baseUrl = (process.env.FHIR_BASE_URL ?? "").replace(/\/+$/, "");
  const token = process.env.FHIR_BEARER_TOKEN;
  if (!baseUrl || !token) {
    return Response.json(
      { error: "FHIR backend not configured (FHIR_BASE_URL / FHIR_BEARER_TOKEN)" },
      { status: 500 },
    );
  }

  const method = (payload.method ?? "GET").toUpperCase();
  const path = payload.path.startsWith("/") ? payload.path : `/${payload.path}`;
  const qs = payload.query
    ? "?" +
      new URLSearchParams(
        Object.entries(payload.query).filter(([, v]) => v != null && v !== ""),
      ).toString()
    : "";
  const url = `${baseUrl}${path}${qs}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/fhir+json",
  };
  let body: BodyInit | undefined;
  if (method !== "GET" && method !== "HEAD" && payload.body !== undefined) {
    headers["Content-Type"] = "application/fhir+json";
    body = typeof payload.body === "string" ? payload.body : JSON.stringify(payload.body);
  }

  const MAX_ATTEMPTS = 3;
  let lastRes: Response | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, { method, headers, body, cache: "no-store" });
    lastRes = res;
    if (res.status !== 409 || method !== "PUT" || attempt === MAX_ATTEMPTS) break;
    const delay = 150 + Math.floor(Math.random() * 250);
    console.warn(`[fhir-proxy] 409 on PUT ${path} — retry ${attempt}/${MAX_ATTEMPTS - 1} in ${delay}ms`);
    await new Promise((r) => setTimeout(r, delay));
  }

  const outHeaders = new Headers();
  const ct = lastRes!.headers.get("content-type");
  if (ct) outHeaders.set("content-type", ct);
  return new Response(lastRes!.body, { status: lastRes!.status, headers: outHeaders });
}

export const Route = createFileRoute("/api/fhir-proxy")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAllowedOrigin(request)) return new Response("Forbidden", { status: 403 });
        let payload: ProxyRequest;
        try {
          payload = (await request.json()) as ProxyRequest;
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        if (!payload?.path || typeof payload.path !== "string") {
          return Response.json({ error: "Missing 'path'" }, { status: 400 });
        }
        try {
          const res = await forward(payload);
          console.log(`[fhir-proxy] ${payload.method ?? "GET"} ${payload.path} -> ${res.status}`);
          return res;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Proxy error";
          console.error("[fhir-proxy] error", message);
          return Response.json({ error: message }, { status: 502 });
        }
      },
    },
  },
});
