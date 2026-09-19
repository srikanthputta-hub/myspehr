
CREATE TABLE IF NOT EXISTS public.care_team (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fhir_id text,
  patient_mrn text NOT NULL REFERENCES public.patients(mrn) ON DELETE CASCADE,
  member_key text NOT NULL,
  name text NOT NULL,
  role text,
  organization text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT care_team_member_unique UNIQUE (patient_mrn, member_key)
);

CREATE INDEX IF NOT EXISTS care_team_patient_mrn_idx
  ON public.care_team (patient_mrn);

GRANT SELECT ON public.care_team TO anon, authenticated;
GRANT ALL ON public.care_team TO service_role;

ALTER TABLE public.care_team ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read care_team"
  ON public.care_team
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE TRIGGER care_team_set_updated_at
  BEFORE UPDATE ON public.care_team
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.care_team;

CREATE OR REPLACE FUNCTION public.purge_stale_patient_data()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cutoff timestamptz := now() - interval '48 hours';
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
