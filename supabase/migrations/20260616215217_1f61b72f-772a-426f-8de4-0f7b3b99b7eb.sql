
CREATE TABLE public.fhir_cache (
  mrn TEXT PRIMARY KEY,
  patient_data JSONB,
  medication_data JSONB,
  condition_data JSONB,
  allergy_data JSONB,
  last_fetched TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT ALL ON public.fhir_cache TO service_role;

ALTER TABLE public.fhir_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only" ON public.fhir_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);
