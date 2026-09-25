-- myspehr had no server-side inbound sync at all: a patient's record only
-- ever refreshed when they personally logged in (login submit / dashboard
-- mount both trigger `syncMrn` client-side). Anything that changed in spehr
-- after that point never reached myspehr until the patient opened the app
-- again -- confirmed live: a patient's `encounters` row here stayed frozen
-- at "in-progress" for 41+ hours after they were actually discharged in
-- spehr, because they never logged back in.
--
-- This adds a pg_cron job that calls a new TanStack Start route,
-- /api/cron/inbound-sync (src/routes/api/cron/inbound-sync.ts), every 3
-- minutes. That route re-runs the same `performMrnSync` logic `syncMrn`
-- already uses, for every patient row whose `updated_at` (bumped by every
-- prior sync's upsert) is stale, so already-known patients' records keep
-- refreshing without requiring another login.
--
-- pg_net is required to call out from Postgres via net.http_post and is not
-- yet enabled on this project (unlike spehr's, which already has it).
--
-- Auth: the route checks an `x-cron-secret` header against CRON_SYNC_SECRET,
-- since this is a server-to-server call with no browser session to
-- authenticate via Supabase auth. The value below MUST be set as a
-- Cloudflare Worker secret (Settings -> Variables and secrets -> Secret)
-- named CRON_SYNC_SECRET with this exact value, or the cron job will get a
-- 500/403 on every tick and nothing will happen (fails closed, not open).

CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'myspehr-inbound-sync',
  '*/3 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://www.myspehr.live/api/cron/inbound-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'ea713c8ad639035aa43c51677cd67fe62a3a975d2ad6609d95abe05275919096'
    ),
    body := '{}'::jsonb
  );
  $$
);
