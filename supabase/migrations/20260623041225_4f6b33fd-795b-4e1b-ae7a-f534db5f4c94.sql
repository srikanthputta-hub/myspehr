
-- Shared updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- patients
CREATE TABLE public.patients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mrn TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  dob DATE,
  gender TEXT,
  phone TEXT,
  address TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  insurance_provider TEXT,
  policy_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.patients TO authenticated, anon;
GRANT ALL ON public.patients TO service_role;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read patients" ON public.patients FOR SELECT TO authenticated, anon USING (true);
CREATE TRIGGER patients_set_updated_at BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- encounters
CREATE TABLE public.encounters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fhir_id TEXT UNIQUE,
  patient_mrn TEXT NOT NULL REFERENCES public.patients(mrn) ON DELETE CASCADE,
  encounter_date TIMESTAMPTZ,
  facility TEXT,
  type TEXT,
  status TEXT,
  chief_complaint TEXT,
  admitting_diagnosis TEXT,
  hospital_course TEXT,
  discharge_condition TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.encounters TO authenticated, anon;
GRANT ALL ON public.encounters TO service_role;
ALTER TABLE public.encounters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read encounters" ON public.encounters FOR SELECT TO authenticated, anon USING (true);
CREATE TRIGGER encounters_set_updated_at BEFORE UPDATE ON public.encounters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX encounters_patient_mrn_idx ON public.encounters(patient_mrn);

-- clinical_history
CREATE TABLE public.clinical_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fhir_id TEXT UNIQUE,
  patient_mrn TEXT NOT NULL REFERENCES public.patients(mrn) ON DELETE CASCADE,
  category TEXT,
  description TEXT,
  clinical_status TEXT,
  onset_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.clinical_history TO authenticated, anon;
GRANT ALL ON public.clinical_history TO service_role;
ALTER TABLE public.clinical_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read clinical_history" ON public.clinical_history FOR SELECT TO authenticated, anon USING (true);
CREATE TRIGGER clinical_history_set_updated_at BEFORE UPDATE ON public.clinical_history
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX clinical_history_patient_mrn_idx ON public.clinical_history(patient_mrn);

-- allergies
CREATE TABLE public.allergies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fhir_id TEXT UNIQUE,
  patient_mrn TEXT NOT NULL REFERENCES public.patients(mrn) ON DELETE CASCADE,
  category TEXT,
  substance TEXT,
  criticality TEXT,
  reaction TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.allergies TO authenticated, anon;
GRANT ALL ON public.allergies TO service_role;
ALTER TABLE public.allergies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read allergies" ON public.allergies FOR SELECT TO authenticated, anon USING (true);
CREATE TRIGGER allergies_set_updated_at BEFORE UPDATE ON public.allergies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX allergies_patient_mrn_idx ON public.allergies(patient_mrn);

-- observations
CREATE TABLE public.observations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fhir_id TEXT UNIQUE,
  patient_mrn TEXT NOT NULL REFERENCES public.patients(mrn) ON DELETE CASCADE,
  encounter_id UUID REFERENCES public.encounters(id) ON DELETE SET NULL,
  category TEXT,
  test_name TEXT,
  value TEXT,
  unit TEXT,
  effective_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.observations TO authenticated, anon;
GRANT ALL ON public.observations TO service_role;
ALTER TABLE public.observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read observations" ON public.observations FOR SELECT TO authenticated, anon USING (true);
CREATE TRIGGER observations_set_updated_at BEFORE UPDATE ON public.observations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX observations_patient_mrn_idx ON public.observations(patient_mrn);
CREATE INDEX observations_encounter_id_idx ON public.observations(encounter_id);

-- medications
CREATE TABLE public.medications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fhir_id TEXT UNIQUE,
  patient_mrn TEXT NOT NULL REFERENCES public.patients(mrn) ON DELETE CASCADE,
  encounter_id UUID REFERENCES public.encounters(id) ON DELETE SET NULL,
  name TEXT,
  dosage TEXT,
  category TEXT,
  status TEXT,
  prescribed_date DATE,
  prescriber TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.medications TO authenticated, anon;
GRANT ALL ON public.medications TO service_role;
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read medications" ON public.medications FOR SELECT TO authenticated, anon USING (true);
CREATE TRIGGER medications_set_updated_at BEFORE UPDATE ON public.medications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX medications_patient_mrn_idx ON public.medications(patient_mrn);
CREATE INDEX medications_encounter_id_idx ON public.medications(encounter_id);

-- care_plans
CREATE TABLE public.care_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fhir_id TEXT UNIQUE,
  encounter_id UUID NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  patient_mrn TEXT REFERENCES public.patients(mrn) ON DELETE CASCADE,
  diet_instructions TEXT,
  activity_instructions TEXT,
  follow_up_details TEXT,
  return_precautions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.care_plans TO authenticated, anon;
GRANT ALL ON public.care_plans TO service_role;
ALTER TABLE public.care_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read care_plans" ON public.care_plans FOR SELECT TO authenticated, anon USING (true);
CREATE TRIGGER care_plans_set_updated_at BEFORE UPDATE ON public.care_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX care_plans_encounter_id_idx ON public.care_plans(encounter_id);
CREATE INDEX care_plans_patient_mrn_idx ON public.care_plans(patient_mrn);

-- Enable Realtime on every table
ALTER TABLE public.patients REPLICA IDENTITY FULL;
ALTER TABLE public.encounters REPLICA IDENTITY FULL;
ALTER TABLE public.clinical_history REPLICA IDENTITY FULL;
ALTER TABLE public.allergies REPLICA IDENTITY FULL;
ALTER TABLE public.observations REPLICA IDENTITY FULL;
ALTER TABLE public.medications REPLICA IDENTITY FULL;
ALTER TABLE public.care_plans REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.patients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.encounters;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clinical_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.allergies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.observations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.medications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.care_plans;
