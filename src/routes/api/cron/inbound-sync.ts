import { createFileRoute } from "@tanstack/react-router";
import { performMrnSync } from "@/lib/fhir-sync.functions";

/**
 * Cron-driven inbound FHIR sync.
 *
 * Before this route existed, a patient's data in myspehr only ever refreshed
 * when they personally logged in (login submit / dashboard mount both call
 * `syncMrn` client-side). Anything that changed in spehr after that point —
 * a discharge, a new lab result, a new allergy — never reached myspehr until
 * the patient happened to open the app again. This route closes that gap by
 * periodically re-running the exact same sync (`performMrnSync`, factored out
 * of `fhir-sync.functions.ts`) for every MRN myspehr already knows about,
 * driven by a pg_cron job (see the migration that adds it) instead of a
 * client action.
 *
 * This does NOT discover brand-new patients who have never logged in —
 * myspehr still only learns an MRN exists once someone logs in with it.
 * It only keeps ALREADY-KNOWN patients' records from going stale between
 * logins (e.g. the "shows discharged 41h ago as still in-progress" bug).
 *
 * Auth: a shared secret header, not Supabase auth — this is a
 * server-to-server call from Postgres (pg_cron -> pg_net -> this route),
 * which has no browser session to authenticate. Requires CRON_SYNC_SECRET
 * to be set as a Cloudflare Worker secret; the same value is embedded in
 * the pg_cron job's request header (see the migration).
 */

const BATCH_SIZE = 15;
// Only re-sync a patient if their `patients.updated_at` (bumped by every
// prior sync's upsert) is older than this. Keeps a MRN from being re-synced
// on every single cron tick regardless of the cron's own interval.
const STALE_AFTER_MINUTES = 3;

export const Route = createFileRoute("/api/cron/inbound-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_SYNC_SECRET;
        if (!expected) {
          return Response.json(
            { error: "CRON_SYNC_SECRET not configured on this deployment" },
            { status: 500 },
          );
        }
        const provided = request.headers.get("x-cron-secret");
        if (provided !== expected) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const staleCutoff = new Date(Date.now() - STALE_AFTER_MINUTES * 60_000).toISOString();
        const { data: candidates, error: selectError } = await supabaseAdmin
          .from("patients")
          .select("mrn")
          .lte("updated_at", staleCutoff)
          .order("updated_at", { ascending: true })
          .limit(BATCH_SIZE);
        if (selectError) {
          return Response.json({ error: selectError.message }, { status: 500 });
        }

        const mrns = (candidates ?? []).map((r) => r.mrn).filter(Boolean);
        const results: Array<{ mrn: string; ok: boolean; error?: string }> = [];
        // Sequential, not Promise.all: keeps load on the shared FHIR server
        // bounded, and — unlike spehr's own outbound poller — one MRN's
        // failure is caught per-iteration and never aborts the rest of the
        // batch.
        for (const mrn of mrns) {
          try {
            await performMrnSync(mrn, false);
            results.push({ mrn, ok: true });
          } catch (err) {
            results.push({ mrn, ok: false, error: err instanceof Error ? err.message : String(err) });
          }
        }

        return Response.json({
          ok: true,
          processed: results.length,
          succeeded: results.filter((r) => r.ok).length,
          results,
        });
      },
    },
  },
});
