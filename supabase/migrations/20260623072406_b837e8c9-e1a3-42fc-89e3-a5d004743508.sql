
CREATE TABLE public.appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_mrn TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  provider TEXT,
  location TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX appointments_patient_mrn_idx ON public.appointments (patient_mrn, scheduled_for);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO anon, authenticated;
GRANT ALL ON public.appointments TO service_role;

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read appointments" ON public.appointments FOR SELECT USING (true);
CREATE POLICY "Insert appointments" ON public.appointments FOR INSERT WITH CHECK (true);
CREATE POLICY "Update appointments" ON public.appointments FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Delete appointments" ON public.appointments FOR DELETE USING (true);

CREATE TRIGGER appointments_set_updated_at
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
