-- ═══════════════════════════════════════════════════════════════════════════════
-- FixedGap — alta automática de médicos.
-- La app inicia sesión con «usuario» → usuario@fixedgap.local (sin email real).
-- Para dar de alta a un médico: Supabase → Authentication → Users → Add user, con
-- email «usuario@fixedgap.local», contraseña y «Auto Confirm User». Este trigger crea
-- su fila en public.operators (username = parte antes de la @; display_name opcional
-- en los metadatos del usuario). El registro público debe estar desactivado
-- (Authentication → Sign In / Providers → «Allow new users to sign up» = off).
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uname text;
BEGIN
  uname := lower(coalesce(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1), NEW.id::text));
  INSERT INTO public.operators (id, username, display_name)
  VALUES (NEW.id, uname, coalesce(NEW.raw_user_meta_data->>'display_name', uname))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM public, anon, authenticated;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
