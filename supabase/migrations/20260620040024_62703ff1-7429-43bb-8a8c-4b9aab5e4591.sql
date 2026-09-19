
-- Sync metadata per MRN (one row per patient bundle)
CREATE TABLE public.local_sync_metadata (
  mrn TEXT PRIMARY KEY,
  patient_ids TEXT[] NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '48 hours'),
  status TEXT NOT NULL DEFAULT 'ok',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.local_sync_metadata TO service_role;
ALTER TABLE public.local_sync_metadata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.local_sync_metadata FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Shared shape for resource caches: (mrn, resource_id) PK + jsonb data
CREATE TABLE public.local_patients (
  mrn TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  data JSONB NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (mrn, resource_id)
);
GRANT ALL ON public.local_patients TO service_role;
ALTER TABLE public.local_patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.local_patients FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX local_patients_mrn_idx ON public.local_patients(mrn);

CREATE TABLE public.local_encounters (
  mrn TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  data JSONB NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (mrn, resource_id)
);
GRANT ALL ON public.local_encounters TO service_role;
ALTER TABLE public.local_encounters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.local_encounters FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX local_encounters_mrn_idx ON public.local_encounters(mrn);

CREATE TABLE public.local_medications (
  mrn TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  data JSONB NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (mrn, resource_id)
);
GRANT ALL ON public.local_medications TO service_role;
ALTER TABLE public.local_medications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.local_medications FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX local_medications_mrn_idx ON public.local_medications(mrn);

CREATE TABLE public.local_observations (
  mrn TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  data JSONB NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (mrn, resource_id)
);
GRANT ALL ON public.local_observations TO service_role;
ALTER TABLE public.local_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.local_observations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX local_observations_mrn_idx ON public.local_observations(mrn);

CREATE TABLE public.local_diagnostic_reports (
  mrn TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  data JSONB NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (mrn, resource_id)
);
GRANT ALL ON public.local_diagnostic_reports TO service_role;
ALTER TABLE public.local_diagnostic_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.local_diagnostic_reports FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX local_diagnostic_reports_mrn_idx ON public.local_diagnostic_reports(mrn);

CREATE TABLE public.local_compositions (
  mrn TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  data JSONB NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (mrn, resource_id)
);
GRANT ALL ON public.local_compositions TO service_role;
ALTER TABLE public.local_compositions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.local_compositions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX local_compositions_mrn_idx ON public.local_compositions(mrn);

-- updated_at trigger for sync metadata
CREATE OR REPLACE FUNCTION public.touch_local_sync_metadata()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER local_sync_metadata_touch
BEFORE UPDATE ON public.local_sync_metadata
FOR EACH ROW EXECUTE FUNCTION public.touch_local_sync_metadata();
