-- ============================================================
-- ZEAN SCHOOL MANAGER — base cloud partagée
-- ============================================================

CREATE OR REPLACE FUNCTION public.zean_now_ms()
RETURNS bigint LANGUAGE sql STABLE AS $$ SELECT (EXTRACT(epoch FROM now()) * 1000)::bigint $$;

-- ---------- PROFILS (lien compte <-> école) ----------
CREATE TABLE public.profils (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ecole_code  text NOT NULL,
  role        text NOT NULL DEFAULT 'prof',
  email       text,
  prenom      text,
  nom         text,
  actif       boolean NOT NULL DEFAULT true,
  superadmin  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_profils_ecole ON public.profils(ecole_code);
GRANT SELECT ON public.profils TO authenticated;
GRANT ALL ON public.profils TO service_role;
ALTER TABLE public.profils ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_ecole_code()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT upper(trim(ecole_code)) FROM public.profils WHERE user_id = auth.uid() AND actif LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_zean_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profils WHERE user_id = auth.uid() AND actif LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_zean_superadmin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profils WHERE user_id = auth.uid() AND actif AND superadmin)
$$;

CREATE POLICY "profils_select_own_school" ON public.profils FOR SELECT TO authenticated
  USING (upper(trim(ecole_code)) = public.current_ecole_code() OR public.is_zean_superadmin());

-- ---------- TABLES SCOLAIRES ----------
CREATE TABLE public.ecole_config (
  id text PRIMARY KEY, ecole_code text NOT NULL,
  nom text, adresse text, telephone text, email text, devise text,
  matricule_prefix text, code_ecole text, ville text, logo_url text,
  configured boolean DEFAULT false, type_echeancier text,
  montants_echeances jsonb, annee_scolaire text,
  created_at bigint DEFAULT public.zean_now_ms(), updated_at bigint DEFAULT public.zean_now_ms()
);

CREATE TABLE public.classes (
  id text PRIMARY KEY, ecole_code text NOT NULL,
  nom text, niveau text,
  created_at bigint DEFAULT public.zean_now_ms(), updated_at bigint DEFAULT public.zean_now_ms()
);

CREATE TABLE public.eleves (
  id text PRIMARY KEY, ecole_code text NOT NULL,
  matricule text, prenom text, nom text, date_naissance text, sexe text,
  classe_id text, nom_parent text, contact_parent text, type_scolarite text DEFAULT 'standard',
  created_at bigint DEFAULT public.zean_now_ms(), updated_at bigint DEFAULT public.zean_now_ms()
);

CREATE TABLE public.matieres (
  id text PRIMARY KEY, ecole_code text NOT NULL,
  nom text, coefficient numeric, classe_id text,
  created_at bigint DEFAULT public.zean_now_ms(), updated_at bigint DEFAULT public.zean_now_ms()
);

CREATE TABLE public.utilisateurs (
  id text PRIMARY KEY, ecole_code text NOT NULL,
  email text, role text, prenom text, nom text, actif boolean DEFAULT true,
  classe_id text, matieres_ids jsonb, user_id uuid,
  created_at bigint DEFAULT public.zean_now_ms(), updated_at bigint DEFAULT public.zean_now_ms()
);

CREATE TABLE public.notes (
  id text PRIMARY KEY, ecole_code text NOT NULL,
  eleve_id text, matiere_id text, classe_id text, sequence numeric, valeur numeric,
  created_at bigint DEFAULT public.zean_now_ms(), updated_at bigint DEFAULT public.zean_now_ms()
);

CREATE TABLE public.paiements (
  id text PRIMARY KEY, ecole_code text NOT NULL,
  eleve_id text, montant numeric, mode_paiement text, observation text,
  date_paiement timestamptz, caissier_id text, caissier_nom text,
  annule boolean DEFAULT false, tranche_id text, tranche_label text,
  created_at bigint DEFAULT public.zean_now_ms(), updated_at bigint DEFAULT public.zean_now_ms()
);

CREATE TABLE public.depenses (
  id text PRIMARY KEY, ecole_code text NOT NULL,
  motif text, montant numeric, categorie text, date_depense text, par text, description text,
  created_at bigint DEFAULT public.zean_now_ms(), updated_at bigint DEFAULT public.zean_now_ms()
);

CREATE TABLE public.config_scolarite (
  id text PRIMARY KEY, ecole_code text NOT NULL,
  niveau text, montant_annuel numeric,
  created_at bigint DEFAULT public.zean_now_ms(), updated_at bigint DEFAULT public.zean_now_ms()
);

CREATE TABLE public.notes_audit_log (
  id text PRIMARY KEY, ecole_code text NOT NULL,
  note_id text, eleve_id text, matiere_id text, sequence numeric,
  ancienne_valeur numeric, nouvelle_valeur numeric,
  modifie_par_id text, modifie_par_nom text, motif text, statut text,
  valide_par_id text, date_modification timestamptz,
  created_at bigint DEFAULT public.zean_now_ms(), updated_at bigint DEFAULT public.zean_now_ms()
);

CREATE TABLE public.presences (
  id text PRIMARY KEY, ecole_code text NOT NULL,
  eleve_id text, classe_id text, date_appel text,
  present boolean, justifie boolean, motif_absence text,
  enregistre_par_id text, enregistre_par_nom text,
  created_at bigint DEFAULT public.zean_now_ms(), updated_at bigint DEFAULT public.zean_now_ms()
);

CREATE TABLE public.archives_eleves (
  id text PRIMARY KEY, ecole_code text NOT NULL,
  annee_scolaire text, eleve_id text, matricule text, prenom text, nom text, sexe text,
  classe_id text, classe_nom text, niveau text, statut_paiement text,
  decision text, classe_suivante_id text, archive_at timestamptz,
  created_at bigint DEFAULT public.zean_now_ms(), updated_at bigint DEFAULT public.zean_now_ms()
);

CREATE TABLE public.archives_finances (
  id text PRIMARY KEY, ecole_code text NOT NULL,
  annee_scolaire text, eleve_id text, eleve_nom text, classe_nom text,
  montant_du numeric, montant_paye numeric, reste numeric, statut text,
  nb_paiements numeric, archive_at timestamptz,
  created_at bigint DEFAULT public.zean_now_ms(), updated_at bigint DEFAULT public.zean_now_ms()
);

CREATE TABLE public.comptabilite_caisse (
  id text PRIMARY KEY, ecole_code text NOT NULL,
  type text, libelle text, montant numeric, date_ecriture text, reference text,
  categorie text, created_by text, notes text,
  created_at bigint DEFAULT public.zean_now_ms(), updated_at bigint DEFAULT public.zean_now_ms()
);

CREATE TABLE public.comptabilite_banque (
  id text PRIMARY KEY, ecole_code text NOT NULL,
  type text, libelle text, montant numeric, date_ecriture text, reference text,
  categorie text, created_by text, notes text,
  created_at bigint DEFAULT public.zean_now_ms(), updated_at bigint DEFAULT public.zean_now_ms()
);

CREATE TABLE public.comptabilite_config (
  id text PRIMARY KEY, ecole_code text NOT NULL,
  solde_initial_banque numeric DEFAULT 0, solde_initial_caisse numeric DEFAULT 0,
  date_debut_exercice text, annee_scolaire text, devise text,
  created_at bigint DEFAULT public.zean_now_ms(), updated_at bigint DEFAULT public.zean_now_ms()
);

-- ---------- TABLES GLOBALES PLATEFORME ----------
CREATE TABLE public.ecoles (
  id text PRIMARY KEY,
  code text UNIQUE NOT NULL,
  nom text, ville text, pays text, adresse text, telephone text, email_contact text,
  directeur_nom text, directeur_email text, logo_url text, devise text,
  statut text DEFAULT 'essai', date_creation timestamptz DEFAULT now(),
  essai_fin timestamptz, licence_fin timestamptz,
  nb_eleves numeric DEFAULT 0, nb_utilisateurs numeric DEFAULT 0,
  plan text DEFAULT 'essai', notes_internes text,
  created_at bigint DEFAULT public.zean_now_ms(), updated_at bigint DEFAULT public.zean_now_ms()
);

CREATE TABLE public.licences_keys (
  id text PRIMARY KEY,
  cle text, ecole_id text, ecole_nom text, ecole_code text,
  duree_jours numeric, plan text, montant numeric, devise text, statut text,
  date_generation timestamptz, date_activation timestamptz, date_expiration timestamptz,
  activee_par text, notes text,
  created_at bigint DEFAULT public.zean_now_ms(), updated_at bigint DEFAULT public.zean_now_ms()
);

CREATE TABLE public.abonnements (
  id text PRIMARY KEY,
  ecole_id text, ecole_nom text, ecole_code text, licence_key_id text,
  plan text, montant numeric, devise text, mode_paiement text, statut text,
  date_paiement timestamptz, periode_debut timestamptz, periode_fin timestamptz,
  reference text, notes text,
  created_at bigint DEFAULT public.zean_now_ms(), updated_at bigint DEFAULT public.zean_now_ms()
);

CREATE TABLE public.annonces_plateforme (
  id text PRIMARY KEY,
  titre text, contenu text, type text, priorite text, cible text,
  ecoles_ids jsonb, active boolean DEFAULT true,
  date_debut timestamptz, date_fin timestamptz, auteur text,
  nb_vues numeric DEFAULT 0, lien_action text, label_action text,
  created_at bigint DEFAULT public.zean_now_ms(), updated_at bigint DEFAULT public.zean_now_ms()
);

-- ---------- INDEX + GRANTS + RLS (tables scolaires) ----------
DO $$
DECLARE t text;
DECLARE tenant_tables text[] := ARRAY[
  'ecole_config','classes','eleves','matieres','utilisateurs','notes','paiements',
  'depenses','config_scolarite','notes_audit_log','presences','archives_eleves',
  'archives_finances','comptabilite_caisse','comptabilite_banque','comptabilite_config'];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('CREATE INDEX idx_%1$s_ecole ON public.%1$I(ecole_code)', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY "%1$s_tenant" ON public.%1$I FOR ALL TO authenticated
      USING (upper(trim(ecole_code)) = public.current_ecole_code())
      WITH CHECK (upper(trim(ecole_code)) = public.current_ecole_code())$p$, t);
    EXECUTE format($p$CREATE POLICY "%1$s_superadmin" ON public.%1$I FOR ALL TO authenticated
      USING (public.is_zean_superadmin()) WITH CHECK (public.is_zean_superadmin())$p$, t);
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;

-- ---------- GRANTS + RLS (tables globales) ----------
GRANT SELECT ON public.ecoles TO authenticated;
GRANT ALL ON public.ecoles TO service_role;
ALTER TABLE public.ecoles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ecoles_select_own" ON public.ecoles FOR SELECT TO authenticated
  USING (upper(trim(code)) = public.current_ecole_code() OR public.is_zean_superadmin());
CREATE POLICY "ecoles_superadmin_write" ON public.ecoles FOR ALL TO authenticated
  USING (public.is_zean_superadmin()) WITH CHECK (public.is_zean_superadmin());

GRANT SELECT ON public.licences_keys TO authenticated;
GRANT ALL ON public.licences_keys TO service_role;
ALTER TABLE public.licences_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "licences_select_own" ON public.licences_keys FOR SELECT TO authenticated
  USING (upper(trim(coalesce(ecole_code,''))) = public.current_ecole_code() OR public.is_zean_superadmin());
CREATE POLICY "licences_superadmin_write" ON public.licences_keys FOR ALL TO authenticated
  USING (public.is_zean_superadmin()) WITH CHECK (public.is_zean_superadmin());

GRANT SELECT ON public.abonnements TO authenticated;
GRANT ALL ON public.abonnements TO service_role;
ALTER TABLE public.abonnements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "abonnements_select_own" ON public.abonnements FOR SELECT TO authenticated
  USING (upper(trim(coalesce(ecole_code,''))) = public.current_ecole_code() OR public.is_zean_superadmin());
CREATE POLICY "abonnements_superadmin_write" ON public.abonnements FOR ALL TO authenticated
  USING (public.is_zean_superadmin()) WITH CHECK (public.is_zean_superadmin());

GRANT SELECT ON public.annonces_plateforme TO authenticated;
GRANT ALL ON public.annonces_plateforme TO service_role;
ALTER TABLE public.annonces_plateforme ENABLE ROW LEVEL SECURITY;
CREATE POLICY "annonces_select_all" ON public.annonces_plateforme FOR SELECT TO authenticated USING (true);
CREATE POLICY "annonces_superadmin_write" ON public.annonces_plateforme FOR ALL TO authenticated
  USING (public.is_zean_superadmin()) WITH CHECK (public.is_zean_superadmin());

-- ---------- RECHERCHE D'ÉCOLE PAR CODE (écran de connexion) ----------
CREATE OR REPLACE FUNCTION public.ecole_par_code(p_code text)
RETURNS TABLE (id text, code text, nom text, ville text, logo_url text, statut text, essai_fin timestamptz, licence_fin timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.code, e.nom, e.ville, e.logo_url, e.statut, e.essai_fin, e.licence_fin
  FROM public.ecoles e
  WHERE upper(trim(e.code)) = upper(trim(p_code))
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.ecole_par_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ecole_par_code(text) TO anon, authenticated;