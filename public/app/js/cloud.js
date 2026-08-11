/**
 * cloud.js — Couche CLOUD partagé (Zean School Manager)
 * ════════════════════════════════════════════════════════════════════
 * Rôle : remplacer l'ancienne API `tables/` (Genspark/D1) par la base
 * cloud intégrée du projet. Aucune logique métier ici — uniquement le
 * transport (lecture / écriture / temps réel / authentification).
 *
 * L'architecture local-first de db.js reste intacte :
 *   lecture UI = IndexedDB, écriture = IndexedDB + file d'attente,
 *   cette couche assure le pull / push / temps réel avec le cloud.
 *
 * Multi-tenancy : le filtre ecole_code est appliqué ici (requêtes) ET
 * verrouillé côté serveur (RLS) — double barrière.
 * ════════════════════════════════════════════════════════════════════
 */

const ZeanCloud = {

  URL : 'https://zkcwdxuqiywuzhyqwopd.supabase.co',
  KEY : 'sb_publishable_aYkn-sxGCQ0YSb9pStkWHA_KVyx2BxP',

  _client   : null,
  _channels : {},

  // Tables globales (plateforme) — non filtrées par ecole_code
  GLOBAL_TABLES: ['ecoles', 'licences_keys', 'abonnements', 'annonces_plateforme'],

  // ─── Colonnes réelles + type de chaque table (protège PostgREST des
  //     champs parasites présents dans les objets locaux) ───────────────
  // t=texte  n=nombre  b=booléen  j=json  d=date/heure  ms=horodatage
  COLUMNS: {
    ecole_config: { id:'t', ecole_code:'t', nom:'t', adresse:'t', telephone:'t', email:'t', devise:'t',
      matricule_prefix:'t', code_ecole:'t', ville:'t', logo_url:'t', configured:'b', type_echeancier:'t',
      montants_echeances:'j', annee_scolaire:'t', created_at:'ms', updated_at:'ms' },
    classes: { id:'t', ecole_code:'t', nom:'t', niveau:'t', created_at:'ms', updated_at:'ms' },
    eleves: { id:'t', ecole_code:'t', matricule:'t', prenom:'t', nom:'t', date_naissance:'t', sexe:'t',
      classe_id:'t', nom_parent:'t', contact_parent:'t', type_scolarite:'t', created_at:'ms', updated_at:'ms' },
    matieres: { id:'t', ecole_code:'t', nom:'t', coefficient:'n', classe_id:'t', created_at:'ms', updated_at:'ms' },
    utilisateurs: { id:'t', ecole_code:'t', email:'t', role:'t', prenom:'t', nom:'t', actif:'b',
      classe_id:'t', matieres_ids:'j', user_id:'t', created_at:'ms', updated_at:'ms' },
    notes: { id:'t', ecole_code:'t', eleve_id:'t', matiere_id:'t', classe_id:'t', sequence:'n', valeur:'n',
      created_at:'ms', updated_at:'ms' },
    paiements: { id:'t', ecole_code:'t', eleve_id:'t', montant:'n', mode_paiement:'t', observation:'t',
      date_paiement:'d', caissier_id:'t', caissier_nom:'t', annule:'b', tranche_id:'t', tranche_label:'t',
      created_at:'ms', updated_at:'ms' },
    depenses: { id:'t', ecole_code:'t', motif:'t', montant:'n', categorie:'t', date_depense:'t', par:'t',
      description:'t', created_at:'ms', updated_at:'ms' },
    config_scolarite: { id:'t', ecole_code:'t', niveau:'t', montant_annuel:'n', created_at:'ms', updated_at:'ms' },
    notes_audit_log: { id:'t', ecole_code:'t', note_id:'t', eleve_id:'t', matiere_id:'t', sequence:'n',
      ancienne_valeur:'n', nouvelle_valeur:'n', modifie_par_id:'t', modifie_par_nom:'t', motif:'t', statut:'t',
      valide_par_id:'t', date_modification:'d', created_at:'ms', updated_at:'ms' },
    presences: { id:'t', ecole_code:'t', eleve_id:'t', classe_id:'t', date_appel:'t', present:'b',
      justifie:'b', motif_absence:'t', enregistre_par_id:'t', enregistre_par_nom:'t', created_at:'ms', updated_at:'ms' },
    archives_eleves: { id:'t', ecole_code:'t', annee_scolaire:'t', eleve_id:'t', matricule:'t', prenom:'t',
      nom:'t', sexe:'t', classe_id:'t', classe_nom:'t', niveau:'t', statut_paiement:'t', decision:'t',
      classe_suivante_id:'t', archive_at:'d', created_at:'ms', updated_at:'ms' },
    archives_finances: { id:'t', ecole_code:'t', annee_scolaire:'t', eleve_id:'t', eleve_nom:'t', classe_nom:'t',
      montant_du:'n', montant_paye:'n', reste:'n', statut:'t', nb_paiements:'n', archive_at:'d',
      created_at:'ms', updated_at:'ms' },
    comptabilite_caisse: { id:'t', ecole_code:'t', type:'t', libelle:'t', montant:'n', date_ecriture:'t',
      reference:'t', categorie:'t', created_by:'t', notes:'t', created_at:'ms', updated_at:'ms' },
    comptabilite_banque: { id:'t', ecole_code:'t', type:'t', libelle:'t', montant:'n', date_ecriture:'t',
      reference:'t', categorie:'t', created_by:'t', notes:'t', created_at:'ms', updated_at:'ms' },
    comptabilite_config: { id:'t', ecole_code:'t', solde_initial_banque:'n', solde_initial_caisse:'n',
      date_debut_exercice:'t', annee_scolaire:'t', devise:'t', created_at:'ms', updated_at:'ms' },
    ecoles: { id:'t', code:'t', nom:'t', ville:'t', pays:'t', adresse:'t', telephone:'t', email_contact:'t',
      directeur_nom:'t', directeur_email:'t', logo_url:'t', devise:'t', statut:'t', date_creation:'d',
      essai_fin:'d', licence_fin:'d', nb_eleves:'n', nb_utilisateurs:'n', plan:'t', notes_internes:'t',
      created_at:'ms', updated_at:'ms' },
    licences_keys: { id:'t', cle:'t', ecole_id:'t', ecole_nom:'t', ecole_code:'t', duree_jours:'n', plan:'t',
      montant:'n', devise:'t', statut:'t', date_generation:'d', date_activation:'d', date_expiration:'d',
      activee_par:'t', notes:'t', created_at:'ms', updated_at:'ms' },
    abonnements: { id:'t', ecole_id:'t', ecole_nom:'t', ecole_code:'t', licence_key_id:'t', plan:'t',
      montant:'n', devise:'t', mode_paiement:'t', statut:'t', date_paiement:'d', periode_debut:'d',
      periode_fin:'d', reference:'t', notes:'t', created_at:'ms', updated_at:'ms' },
    annonces_plateforme: { id:'t', titre:'t', contenu:'t', type:'t', priorite:'t', cible:'t', ecoles_ids:'j',
      active:'b', date_debut:'d', date_fin:'d', auteur:'t', nb_vues:'n', lien_action:'t', label_action:'t',
      created_at:'ms', updated_at:'ms' },
  },

  // ══════════════════════════════════════════════════════════════════
  // INITIALISATION
  // ══════════════════════════════════════════════════════════════════

  init() {
    if (this._client) return this._client;
    try {
      const lib = window.supabase;
      if (!lib || typeof lib.createClient !== 'function') {
        console.warn('[ZeanCloud] Librairie cloud absente — mode 100% local');
        return null;
      }
      this._client = lib.createClient(this.URL, this.KEY, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'zean_cloud_auth' },
        realtime: { params: { eventsPerSecond: 5 } },
      });
      console.log('[ZeanCloud] Client cloud prêt');
      return this._client;
    } catch (e) {
      console.warn('[ZeanCloud] Init impossible :', e.message);
      return null;
    }
  },

  get client() { return this._client || this.init(); },

  isTable(table) { return !!this.COLUMNS[table]; },

  /** Session cloud active ? (obligatoire pour lire/écrire) */
  async isReady() {
    const c = this.client;
    if (!c || !navigator.onLine) return false;
    try {
      const { data } = await c.auth.getSession();
      return !!data?.session;
    } catch { return false; }
  },

  // ══════════════════════════════════════════════════════════════════
  // AUTHENTIFICATION (écran de connexion inchangé)
  // ══════════════════════════════════════════════════════════════════

  async signIn(email, password) {
    const c = this.client;
    if (!c) return { error: 'offline' };
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { session: data.session, user: data.user };
  },

  async signOut() {
    try { this.unsubscribeAll(); await this.client?.auth.signOut(); } catch {}
  },

  async getUser() {
    try {
      const { data } = await this.client.auth.getUser();
      return data?.user || null;
    } catch { return null; }
  },

  /** Profil cloud du compte connecté (école + rôle) */
  async getProfil() {
    const c = this.client;
    if (!c) return null;
    try {
      const user = await this.getUser();
      if (!user) return null;
      const { data, error } = await c.from('profils').select('*').eq('user_id', user.id).maybeSingle();
      if (error) { console.warn('[ZeanCloud] Profil :', error.message); return null; }
      return data || null;
    } catch { return null; }
  },

  /** Vérification d'un code école (avant connexion — fonction dédiée) */
  async findEcoleByCode(code) {
    const c = this.client;
    if (!c || !navigator.onLine) return null;
    try {
      const { data, error } = await c.rpc('ecole_par_code', { p_code: (code || '').trim() });
      if (error) { console.warn('[ZeanCloud] Code école :', error.message); return null; }
      const row = Array.isArray(data) ? data[0] : data;
      return row || null;
    } catch { return null; }
  },

  // ══════════════════════════════════════════════════════════════════
  // NETTOYAGE / TYPAGE DES LIGNES
  // ══════════════════════════════════════════════════════════════════

  _toIso(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return new Date(v).toISOString();
    if (v instanceof Date) return v.toISOString();
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  },

  /** Ne conserve que les colonnes réelles, avec le bon type. */
  sanitize(table, row, ecoleCode) {
    const cols = this.COLUMNS[table];
    if (!cols || !row) return null;
    const out = {};
    Object.keys(cols).forEach((col) => {
      let v = row[col];
      if (v === undefined) return;
      switch (cols[col]) {
        case 'n':  v = (v === '' || v === null) ? null : Number(v); if (Number.isNaN(v)) v = null; break;
        case 'b':  v = (v === null || v === undefined) ? null : !!v; break;
        case 'd':  v = this._toIso(v); break;
        case 'ms': {
          if (v === null || v === undefined || v === '') { v = null; break; }
          v = (typeof v === 'number') ? v : (Date.parse(v) || Number(v));
          if (Number.isNaN(v)) v = null;
          break;
        }
        case 'j':  v = (v === null || v === undefined) ? null : v; break;
        default:   v = (v === null || v === undefined) ? null : String(v); break;
      }
      out[col] = v;
    });
    out.id = String(row.id);
    if (cols.ecole_code) {
      const code = (row.ecole_code || row.school_code || ecoleCode || '').trim().toUpperCase();
      if (!code) return null; // jamais d'écriture sans école (isolation)
      out.ecole_code = code;
    }
    out.updated_at = Date.now();
    if (!out.created_at) out.created_at = Date.now();
    return out;
  },

  // ══════════════════════════════════════════════════════════════════
  // LECTURE / ÉCRITURE
  // ══════════════════════════════════════════════════════════════════

  async select(table, ecoleCode, limit = 2000) {
    const c = this.client;
    if (!c || !this.isTable(table)) return null;
    try {
      let q = c.from(table).select('*').limit(limit);
      const code = (ecoleCode || '').trim().toUpperCase();
      if (code && !this.GLOBAL_TABLES.includes(table)) q = q.eq('ecole_code', code);
      const { data, error } = await q;
      if (error) { console.warn(`[ZeanCloud] Lecture "${table}" :`, error.message); return null; }
      return data || [];
    } catch (e) { console.warn(`[ZeanCloud] Lecture "${table}" :`, e.message); return null; }
  },

  async upsert(table, row, ecoleCode) {
    const c = this.client;
    if (!c || !this.isTable(table)) return false;
    const clean = this.sanitize(table, row, ecoleCode);
    if (!clean) return false;
    const { error } = await c.from(table).upsert(clean, { onConflict: 'id' });
    if (error) throw new Error(`${table}: ${error.message}`);
    return true;
  },

  async remove(table, id) {
    const c = this.client;
    if (!c || !this.isTable(table)) return false;
    const { error } = await c.from(table).delete().eq('id', String(id));
    if (error) throw new Error(`${table}: ${error.message}`);
    return true;
  },

  // ══════════════════════════════════════════════════════════════════
  // TEMPS RÉEL (plusieurs personnes, même école)
  // ══════════════════════════════════════════════════════════════════

  subscribe(tables, ecoleCode, onChange) {
    const c = this.client;
    if (!c) return;
    const code = (ecoleCode || '').trim().toUpperCase();
    if (!code) return;
    this.unsubscribeAll();
    const chan = c.channel(`zean_${code}`);
    tables.forEach((table) => {
      if (!this.isTable(table) || this.GLOBAL_TABLES.includes(table)) return;
      chan.on('postgres_changes',
        { event: '*', schema: 'public', table, filter: `ecole_code=eq.${code}` },
        (payload) => { try { onChange(table, payload); } catch {} });
    });
    chan.subscribe((status) => console.log('[ZeanCloud] Temps réel :', status));
    this._channels[code] = chan;
  },

  unsubscribeAll() {
    Object.values(this._channels).forEach((ch) => { try { this.client?.removeChannel(ch); } catch {} });
    this._channels = {};
  },
};

window.ZeanCloud = ZeanCloud;
ZeanCloud.init();
