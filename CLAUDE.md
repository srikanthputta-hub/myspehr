# CLAUDE.md — MySpehr Project Briefing

Read this fully before making changes. All patient data is 100% synthetic — no real PHI.

## What this is

MySpehr — FHIR-native patient portal, paired with S.P.E.H.R. (www.spehr.live, sibling repo at
`C:\Users\srika\spehr`). Both read the same Medblocks FHIR server; MySpehr never talks to spehr.live
directly, and vice versa — the only thing they share is that FHIR server.

Stack: React 19 + TypeScript (TanStack Start), same repo family and conventions as spehr.live. Hosted
standalone on Cloudflare Workers via nitro's `cloudflare-module` preset (not `@cloudflare/vite-plugin`).
Package manager is **bun** (`bun.lock`/`bunfig.toml`), not npm — this differs from spehr.live, which uses npm.

## Independence from Lovable (as of 2026-09-19)

This repo was extracted from a Lovable-managed project (owned by a different person's Lovable account,
"Anvitha") and de-Lovable-ified the same way spehr.live was: no `@lovable.dev/*` packages, no `.lovable/`
directory, no Lovable preview-auth broker, no Lovable domain checks in the FHIR proxy's origin allowlist.
The original Lovable project still exists and remains live on its own timeline — this repo is a clean,
independent extraction, not a fork that stays in sync with it.

**Not yet done as of 2026-09-19** (all require the user's own action, not tool access this session had):
- No GitHub repo connected yet — this is a local-only git repo (`git init`, one commit) waiting for a
  remote.
- No Cloudflare Workers Build connection — `wrangler.jsonc` has routes for `myspehr.live` /
  `www.myspehr.live`, but nothing is deployed. The domain also needs to actually be registered and added
  to the Cloudflare account before those routes bind.
- `SUPABASE_SERVICE_ROLE_KEY` is blank in the local `.env` — Supabase doesn't expose it via any tool, has
  to be pasted from the Supabase dashboard.
- `FHIR_BASE_URL`/`FHIR_BEARER_TOKEN` are already in the local `.env` (same shared Medblocks FHIR server
  spehr.live uses) but still need to be entered into Cloudflare's env/secrets UI once the Worker exists.

## Backend — dedicated Supabase project, NOT the same one as spehr.live

Project ref `djcfdhoexfygvyzzsjgy` ("myspehr"), region eu-west-1, same Supabase org as spehr.live's
projects but a **separate project** — MySpehr's schema and data are fully independent of spehr.live's.
Schema was migrated 1:1 from the original Lovable-managed project (ref `izdftamwdyabjpfmuzlc`, still
referenced nowhere in this repo now — `supabase/config.toml` points at the new project) by replaying its
9 migration files in order. Current tables: `patients`, `encounters`, `clinical_history`, `allergies`,
`observations`, `medications`, `care_plans`, `appointments`, `family_member_history`, `care_team`. All have
RLS enabled with public `SELECT` policies (`appointments` also allows anon INSERT/UPDATE/DELETE); writes
otherwise go through the service-role client only. An earlier architecture iteration had a `local_*`
resource-cache table family (`local_patients`, `local_sync_metadata`, etc.) — those were dropped in a
later migration and nothing in the current codebase references them; don't reintroduce that pattern
without checking why it was replaced.

A `pg_cron` job (`purge-stale-patient-data`, hourly at :17) runs `purge_stale_patient_data()`, which
deletes any row across all patient-data tables older than 48 hours. This is intentional — the app
re-fetches fresh from FHIR on every login (see below), so nothing here is meant to be durable storage.

## How data actually gets here — sync-on-login, not a background poller

`src/lib/fhir-sync.functions.ts`'s `syncMrn` server function is called from the client right after an MRN
is entered at login. It fetches that patient's full FHIR bundle server-side (`Patient?identifier=...&
_revinclude=*` — the FHIR server denies `$everything`), parses each resource type, and upserts into the
relational tables above using the service-role Supabase client. The bearer token and raw FHIR payload
never reach the browser — only `{ ok, mrn, counts }`. An optional `purge` flag wipes all of that MRN's
rows first, for a clean re-sync. There is no separate background sync worker; freshness comes from
sync-on-login plus the 48h purge cron, not a poller.

## FHIR access

`src/lib/fhir-client.server.ts` is server-only (`.server.ts` suffix keeps it out of the client bundle).
Reads `FHIR_BASE_URL` + `FHIR_BEARER_TOKEN` from the environment — same shared Medblocks server spehr.live
uses, but MySpehr owns its own copy of these env vars (set independently in Cloudflare, not inherited from
spehr.live's Worker). `src/routes/api/fhir-proxy.ts` and `src/routes/api/fhir/$.ts` are the client-facing
proxy routes; `src/lib/fhir-proxy-client.ts` is what the browser actually calls.

## Working style

Same conventions as spehr.live (see `C:\Users\srika\spehr\CLAUDE.md` for the fuller RuFlo Office / boss /
model-routing setup, which is spehr.live-specific tooling not duplicated here): one focused change at a
time, verify before the next, surgical fixes over rewrites. Deploy via Cloudflare Workers Build once
connected (git push → auto-deploy), not manual `wrangler deploy`.
