
CREATE TABLE public.local_conditions (
  mrn TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  data JSONB NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (mrn, resource_id)
);
GRANT ALL ON public.local_conditions TO service_role;
ALTER TABLE public.local_conditions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.local_conditions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX local_conditions_mrn_idx ON public.local_conditions(mrn);

CREATE TABLE public.local_allergies (
  mrn TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  data JSONB NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (mrn, resource_id)
);
GRANT ALL ON public.local_allergies TO service_role;
ALTER TABLE public.local_allergies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.local_allergies FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX local_allergies_mrn_idx ON public.local_allergies(mrn);

CREATE TABLE public.local_medication_administrations (
  mrn TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  data JSONB NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (mrn, resource_id)
);
GRANT ALL ON public.local_medication_administrations TO service_role;
ALTER TABLE public.local_medication_administrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.local_medication_administrations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX local_medadmins_mrn_idx ON public.local_medication_administrations(mrn);

CREATE TABLE public.local_appointments (
  mrn TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  data JSONB NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (mrn, resource_id)
);
GRANT ALL ON public.local_appointments TO service_role;
ALTER TABLE public.local_appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.local_appointments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX local_appointments_mrn_idx ON public.local_appointments(mrn);
