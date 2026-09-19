-- Patients: emergency contact relationship
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship text;

-- Encounters: end time + richer discharge summary fields
ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS encounter_end_time timestamptz,
  ADD COLUMN IF NOT EXISTS discharge_diagnosis text,
  ADD COLUMN IF NOT EXISTS hospital_course_narrative text,
  ADD COLUMN IF NOT EXISTS diet_instructions text,
  ADD COLUMN IF NOT EXISTS activity_instructions text,
  ADD COLUMN IF NOT EXISTS return_precautions text;

-- Clinical history: body site + free-text clinical note (HPI detail)
ALTER TABLE public.clinical_history
  ADD COLUMN IF NOT EXISTS body_site text,
  ADD COLUMN IF NOT EXISTS clinical_note text;

-- Appointments: tie to FHIR resource + capture type/description
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS fhir_id text,
  ADD COLUMN IF NOT EXISTS appointment_type text,
  ADD COLUMN IF NOT EXISTS description text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_fhir_id_key'
  ) THEN
    ALTER TABLE public.appointments ADD CONSTRAINT appointments_fhir_id_key UNIQUE (fhir_id);
  END IF;
END $$;

-- New table: family_member_history
CREATE TABLE IF NOT EXISTS public.family_member_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fhir_id text UNIQUE,
  patient_mrn text NOT NULL REFERENCES public.patients(mrn) ON DELETE CASCADE,
  relationship text,
  condition_name text,
  status text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS family_member_history_patient_mrn_idx
  ON public.family_member_history (patient_mrn);

GRANT SELECT ON public.family_member_history TO anon, authenticated;
GRANT ALL ON public.family_member_history TO service_role;

ALTER TABLE public.family_member_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read family_member_history"
  ON public.family_member_history
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE TRIGGER family_member_history_set_updated_at
  BEFORE UPDATE ON public.family_member_history
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.family_member_history;