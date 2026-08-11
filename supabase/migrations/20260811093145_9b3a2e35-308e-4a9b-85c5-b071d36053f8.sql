CREATE OR REPLACE FUNCTION public.zean_now_ms()
RETURNS bigint LANGUAGE sql STABLE SET search_path = public AS $$ SELECT (EXTRACT(epoch FROM now()) * 1000)::bigint $$;

REVOKE ALL ON FUNCTION public.current_ecole_code() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_zean_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_zean_superadmin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_ecole_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_zean_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_zean_superadmin() TO authenticated;