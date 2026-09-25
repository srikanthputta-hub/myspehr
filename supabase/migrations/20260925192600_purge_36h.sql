-- Phase E: tighten myspehr's local patient-data retention from 48h to 36h to
-- match spehr's purge_simulation_data() (system_settings.data_retention_hours).
--
-- Built on the LIVE body of purge_stale_patient_data() (pg_get_functiondef on
-- djcfdhoexfygvyzzsjgy). Its table list was checked against live schema and
-- is current: every patient-scoped public table (observations, medications,
-- allergies, clinical_history, care_plans, family_member_history, care_team,
-- appointments, encounters, patients) is covered, and the children all
-- ON DELETE CASCADE from patients(mrn) anyway. Only the interval changes.
--
-- Cadence: tightened from hourly (:17) to every 15 minutes (:02/:17/:32/:47),
-- so rows are gone within ~36h15m instead of up to ~37h, matching spehr's
-- 15-minute cadence while staying offset from spehr's :07/:22/:37/:52 run.
-- The tables are tiny, so the extra runs cost nothing.
CREATE OR REPLACE FUNCTION public.purge_stale_patient_data()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cutoff timestamptz := now() - interval '36 hours';
BEGIN
  DELETE FROM public.observations           WHERE created_at < cutoff;
  DELETE FROM public.medications            WHERE created_at < cutoff;
  DELETE FROM public.allergies              WHERE created_at < cutoff;
  DELETE FROM public.clinical_history       WHERE created_at < cutoff;
  DELETE FROM public.care_plans             WHERE created_at < cutoff;
  DELETE FROM public.family_member_history  WHERE created_at < cutoff;
  DELETE FROM public.care_team              WHERE created_at < cutoff;
  DELETE FROM public.appointments           WHERE created_at < cutoff;
  DELETE FROM public.encounters             WHERE created_at < cutoff;
  DELETE FROM public.patients               WHERE created_at < cutoff;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.purge_stale_patient_data() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-stale-patient-data') THEN
    PERFORM cron.unschedule('purge-stale-patient-data');
  END IF;
END $$;

SELECT cron.schedule('purge-stale-patient-data', '2,17,32,47 * * * *',
  $$SELECT public.purge_stale_patient_data();$$);
