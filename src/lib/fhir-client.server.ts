/**
 * Server-only FHIR client. Reads FHIR_BASE_URL + FHIR_BEARER_TOKEN from
 * the backend environment. The bearer token never leaves the server.
 *
 * The `.server.ts` extension prevents this module from ever being
 * bundled into the client.
 */

function getConfig() {
  const baseUrl = process.env.FHIR_BASE_URL;
  const token = process.env.FHIR_BEARER_TOKEN;
  if (!baseUrl || !token) {
    throw new Error(
      "FHIR backend not configured. Set FHIR_BASE_URL and FHIR_BEARER_TOKEN in Project Settings → Backend Secrets.",
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), token };
}

export interface FhirFetchOptions {
  method?: string;
  body?: BodyInit | null;
  headers?: HeadersInit;
}

/**
 * Forward a request to the upstream FHIR server. `pathAndQuery` is everything
 * after the FHIR base URL, e.g. `Patient?identifier=MRN-123`.
 */
export async function fhirFetch(
  pathAndQuery: string,
  opts: FhirFetchOptions = {},
): Promise<Response> {
  const { baseUrl, token } = getConfig();
  const url = `${baseUrl}/${pathAndQuery.replace(/^\/+/, "")}`;
  const headers = new Headers(opts.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Accept")) headers.set("Accept", "application/fhir+json");
  if (opts.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/fhir+json");
  }
  return fetch(url, {
    method: opts.method ?? "GET",
    body: opts.body,
    headers,
    // Avoid caching PHI proxy responses.
    cache: "no-store",
  });
}

export async function fhirJson<T = unknown>(pathAndQuery: string): Promise<T> {
  const res = await fhirFetch(pathAndQuery);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`FHIR ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}
