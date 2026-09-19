import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

interface FhirResource {
  resourceType?: string;
  id?: string;
  [key: string]: unknown;
}

interface FhirBundle {
  resourceType?: string;
  entry?: Array<{ resource?: FhirResource }>;
}

export const resolveAppointmentProvidersFromDischarge = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ mrn: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data }) => {
    const { fhirJson } = await import("@/lib/fhir-client.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const mrn = data.mrn.trim();
    const compositions = await fetchCompositionsForMrn(fhirJson, mrn);
    const provider = getBestCompositionProvider(compositions);
    if (!provider) return { provider: null, updated: 0 };

    const { data: updatedRows, error } = await supabaseAdmin
      .from("appointments")
      .update({ provider })
      .eq("patient_mrn", mrn)
      .is("provider", null)
      .select("id");
    if (error) throw new Error(`appointments provider update: ${error.message}`);

    return { provider, updated: updatedRows?.length ?? 0 };
  });

async function fetchCompositionsForMrn(
  fhirJson: <T = unknown>(pathAndQuery: string) => Promise<T>,
  mrn: string,
): Promise<FhirResource[]> {
  const paths = [
    `Composition?subject.identifier=${encodeURIComponent(mrn)}`,
    `Composition?subject=Patient/${encodeURIComponent(mrn)}`,
  ];
  const out: FhirResource[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    try {
      const bundle = await fhirJson<FhirBundle>(path);
      for (const entry of bundle.entry ?? []) {
        const resource = entry.resource;
        if (resource?.resourceType !== "Composition") continue;
        const key = resource.id ?? JSON.stringify(resource).slice(0, 200);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(resource);
      }
    } catch {
      // Try the alternate search form below.
    }
  }
  return out;
}

function getBestCompositionProvider(compositions: FhirResource[]): string | null {
  for (const comp of compositions) {
    const provider = extractDoctorName(getFollowUpText(comp));
    if (provider) return provider;
  }
  for (const comp of compositions) {
    const provider = extractDoctorName(compositionText(comp));
    if (provider) return provider;
  }
  return null;
}

function getFollowUpText(comp: FhirResource): string | null {
  const c = comp as FhirResource & {
    section?: Array<{ title?: string; code?: { text?: string }; text?: { div?: string } }>;
  };
  for (const section of c.section ?? []) {
    const label = `${section.title ?? ""} ${section.code?.text ?? ""}`.toLowerCase();
    if (!label.includes("follow")) continue;
    const text = section.text?.div ? stripTags(section.text.div) : null;
    if (text) return text;
  }
  return null;
}

function compositionText(comp: FhirResource): string | null {
  const c = comp as FhirResource & { section?: Array<{ text?: { div?: string } }> };
  const text = (c.section ?? [])
    .map((section) => (section.text?.div ? stripTags(section.text.div) : null))
    .filter(Boolean)
    .join("\n");
  return text || null;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function extractDoctorName(text: string | null): string | null {
  if (!text) return null;
  const match = text.match(
    /\b(?:Dr\.?|Doctor|Physician|Provider|Consultant)\s+([A-Z][A-Za-z'’.-]*(?:\s+[A-Z][A-Za-z'’.-]*){0,4})(?:\s*,\s*(MD|M\.D\.|DO|D\.O\.|MBBS|MBChB|NP|PA-C|PA))?/i,
  );
  if (!match) return null;
  const stopWords = new Set(["within", "in", "on", "at", "for", "after", "before", "clinic", "department"]);
  const nameParts = match[1]
    .split(/\s+/)
    .filter((part) => !stopWords.has(part.toLowerCase()))
    .slice(0, 4);
  const name = nameParts.join(" ").replace(/[\s,.;:!?-]+$/, "").trim();
  if (!name) return null;
  const credential = match[2]?.replace(/[\s,.;:!?-]+$/, "").trim();
  return `Dr. ${name}${credential ? `, ${credential}` : ""}`.replace(/\s+/g, " ").trim();
}
