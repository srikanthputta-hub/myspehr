import { createFileRoute } from "@tanstack/react-router";

/**
 * Secure FHIR proxy. The browser calls /api/fhir/<resource path>; this
 * handler forwards the request to the configured FHIR server with the
 * server-side bearer token attached. The token is NEVER sent to the client.
 *
 * Same-origin only — rejects cross-origin requests so the proxy can't be
 * used as an open relay from another site.
 */

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // server-side fetch / same-origin form post
  try {
    const reqUrl = new URL(request.url);
    const originUrl = new URL(origin);
    return reqUrl.host === originUrl.host;
  } catch {
    return false;
  }
}

async function handle(request: Request, splat: string): Promise<Response> {
  if (!isSameOrigin(request)) {
    return new Response("Forbidden", { status: 403 });
  }
  const { fhirFetch } = await import("@/lib/fhir-client.server");
  const url = new URL(request.url);
  const pathAndQuery = splat + (url.search ?? "");
  try {
    const upstream = await fhirFetch(pathAndQuery, {
      method: request.method,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : await request.arrayBuffer(),
      headers: { Accept: "application/fhir+json" },
    });
    // Stream upstream response straight back; keep status + content-type.
    const headers = new Headers();
    const ct = upstream.headers.get("content-type");
    if (ct) headers.set("content-type", ct);
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Proxy error";
    return new Response(message, { status: 502 });
  }
}

export const Route = createFileRoute("/api/fhir/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handle(request, params._splat ?? ""),
      POST: async ({ request, params }) => handle(request, params._splat ?? ""),
      PUT: async ({ request, params }) => handle(request, params._splat ?? ""),
      DELETE: async ({ request, params }) => handle(request, params._splat ?? ""),
    },
  },
});
