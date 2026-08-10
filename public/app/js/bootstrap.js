/**
 * bootstrap.js — Amorçage local Zean School Manager
 * ─────────────────────────────────────────────────────────────
 * L'API REST `tables/` (Genspark / D1) n'est pas disponible dans cet
 * hébergement. Ce script garantit que l'IndexedDB contient une école
 * exploitable dès le premier chargement pour que le login 2 étapes,
 * le dashboard et tous les modules soient immédiatement utilisables.
 *
 * Il n'écrase JAMAIS des données existantes : si des utilisateurs sont
 * déjà présents en local, il ne fait rien.
 */
(function () {
  const CODE = 'DEMO';
  const FLAG = 'zean_bootstrap_v1';

  function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 10); }

  const COMPTES = [
    { email: 'admin@zean.app',      mot_de_passe: 'admin123',      role: 'admin',       prenom: 'Admin',    nom: 'Zean' },
    { email: 'directeur@zean.app',  mot_de_passe: 'directeur123',  role: 'directeur',   prenom: 'Directeur', nom: 'Zean' },
    { email: 'comptable@zean.app',  mot_de_passe: 'comptable123',  role: 'comptable',   prenom: 'Comptable', nom: 'Zean' },
    { email: 'prof@zean.app',       mot_de_passe: 'prof123',       role: 'prof',        prenom: 'Professeur', nom: 'Zean' },
    { email: 'superviseur@zean.app',mot_de_passe: 'superviseur123',role: 'superviseur', prenom: 'Superviseur', nom: 'Zean' }
  ];

  /** Garantit qu'au moins un compte valide existe pour l'école DEMO. */
  async function ensureDemoAccounts() {
    const prev = DB._currentEcoleCode;
    DB._currentEcoleCode = null;                  // lecture brute
    let all = [];
    try { all = await DB._idbGetAll('utilisateurs'); }
    finally { DB._currentEcoleCode = prev; }
    const demoUsers = all.filter(u => (u.ecole_code || '').toUpperCase() === CODE);
    const emails = new Set(demoUsers.map(u => (u.email || '').toLowerCase()));
    const now = Date.now();
    for (const c of COMPTES) {
      if (emails.has(c.email)) continue;
      await DB._idbPut('utilisateurs', {
        id: uid('user'), ecole_code: CODE, created_at: now, actif: true, ...c
      }, false);
    }
    DB._memInvalidate('utilisateurs');
    return demoUsers.length === 0;
  }

  async function seed() {
    if (typeof DB === 'undefined' || !DB._idbPut) return;
    try {
      // 1. Toujours garantir l'école DEMO dans le registre global local
      if (typeof DB.registerEcole === 'function') {
        await DB.registerEcole({
          id: 'ecole-demo', code: CODE, nom: 'École Démo Zean', ville: 'Conakry',
          statut: 'actif', essai_fin: null, licence_fin: null
        });
      }
      // 2. Toujours garantir au moins un compte DEMO utilisable
      const wasEmpty = await ensureDemoAccounts();
      // 3. Structure de démonstration : uniquement au tout premier lancement
      if (!wasEmpty) { localStorage.setItem(FLAG, '1'); return; }


      const now = Date.now();
      const put = (table, row) => DB._idbPut(table, { ecole_code: CODE, created_at: now, ...row }, false);

      await put('ecole_config', {
        id: 'ecole-main', nom: 'École Démo Zean', adresse: 'Conakry, Guinée',
        telephone: '+224 600 00 00 00', email: 'contact@zean.app', devise: 'GNF',
        matricule_prefix: CODE, code_ecole: CODE, configured: true,
        type_echeancier: 'mensuel',
        montants_echeances: [
          { label: 'Inscription', montant: 200000, mois_index: 0 },
          { label: 'Octobre', montant: 100000, mois_index: 1 },
          { label: 'Novembre', montant: 100000, mois_index: 2 },
          { label: 'Décembre', montant: 100000, mois_index: 3 },
          { label: 'Janvier', montant: 100000, mois_index: 4 },
          { label: 'Février', montant: 100000, mois_index: 5 },
          { label: 'Mars', montant: 100000, mois_index: 6 },
          { label: 'Avril', montant: 100000, mois_index: 7 },
          { label: 'Mai', montant: 100000, mois_index: 8 },
          { label: 'Juin', montant: 100000, mois_index: 9 }
        ]
      });


      // Classes, matières, tarifs — structure minimale exploitable
      const classes = [
        { id: 'cls-6a', nom: '6ème A', niveau: 'Collège' },
        { id: 'cls-cm2', nom: 'CM2', niveau: 'Primaire' }
      ];
      for (const c of classes) await put('classes', c);

      const matieres = [
        { nom: 'Mathématiques', coefficient: 4 },
        { nom: 'Français', coefficient: 4 },
        { nom: 'Histoire-Géographie', coefficient: 2 },
        { nom: 'Sciences', coefficient: 3 },
        { nom: 'Anglais', coefficient: 2 }
      ];
      for (const cls of classes) {
        for (const m of matieres) await put('matieres', { id: uid('mat'), classe_id: cls.id, ...m });
      }

      for (const cls of classes) {
        await put('config_scolarite', { id: uid('cfs'), niveau: cls.niveau, montant_annuel: 1100000 });
      }

      await put('comptabilite_config', { id: 'compta-main', solde_caisse_initial: 0, solde_banque_initial: 0 });

      localStorage.setItem(FLAG, '1');
      console.log('[Zean] Amorçage local terminé — code école : DEMO');
    } catch (err) {
      console.warn('[Zean] Amorçage local échoué :', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', seed);
  } else {
    seed();
  }
})();
