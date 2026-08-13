DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname AS n
      FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE c.relkind = 'r' AND ns.nspname = 'public'
  LOOP
    IF t.n = 'profils' THEN
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t.n);
    ELSE
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t.n);
    END IF;
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t.n);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ecole_par_code(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_ecole_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_zean_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_zean_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.zean_now_ms() TO anon, authenticated;