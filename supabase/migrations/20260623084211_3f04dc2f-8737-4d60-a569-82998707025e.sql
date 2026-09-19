CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.purge_stale_patient_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff timestamptz := now() - interval '48 hours';
BEGIN
  DELETE FROM public.observations           WHERE created_at < cutoff;
  DELETE FROM public.medications            WHERE created_at < cutoff;
  DELETE FROM public.allergies              WHERE created_at < cutoff;
  DELETE FROM public.clinical_history       WHERE created_at < cutoff;
  DELETE FROM public.care_plans             WHERE created_at < cutoff;
  DELETE FROM public.family_member_history  WHERE created_at < cutoff;
  DELETE FROM public.appointments           WHERE created_at < cutoff;
  DELETE FROM public.encounters             WHERE created_at < cutoff;
  DELETE FROM public.patients               WHERE created_at < cutoff;
END;
$$;

-- Unschedule any prior version, then schedule hourly.
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'purge-stale-patient-data';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'purge-stale-patient-data',
  '17 * * * *',
  $$SELECT public.purge_stale_patient_data();$$
);