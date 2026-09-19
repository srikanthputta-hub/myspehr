REVOKE EXECUTE ON FUNCTION public.purge_stale_patient_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_stale_patient_data() TO service_role, postgres;