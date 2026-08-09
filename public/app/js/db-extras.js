/**
 * db-extras.js — Compléments DB (Zean School Manager)
 * ────────────────────────────────────────────────────────────────────
 * Ces méthodes sont appelées par js/pages.js mais absentes de js/db.js
 * dans le dépôt. Elles sont 100% locales (IndexedDB via DB.getAll) et
 * respectent l'isolation par ecole_code, comme le reste du moteur.
 *
 *  - DB.isExonere            - DB.getEcheances
 *  - DB.getMention           - DB.getStatutPaiement
 *  - DB.getNbMoisEnRetard    - DB.getRapportFinancier
 *  - DB.getStatsDashboard    - DB._cache / DB._cacheExpiry (compat legacy)
 */
(function () {
  if (typeof DB === 'undefined') return;

  const MOIS_SCO = [
    { id: 'mois1', label: 'Octobre',  mois: 9  },
    { id: 'mois2', label: 'Novembre', mois: 10 },
    { id: 'mois3', label: 'Décembre', mois: 11 },
    { id: 'mois4', label: 'Janvier',  mois: 0  },
    { id: 'mois5', label: 'Février',  mois: 1  },
    { id: 'mois6', label: 'Mars',     mois: 2  },
    { id: 'mois7', label: 'Avril',    mois: 3  },
    { id: 'mois8', label: 'Mai',      mois: 4  },
    { id: 'mois9', label: 'Juin',     mois: 5  }
  ];
  const TRIMESTRES = [
    { id: 'trim1', label: 'Trimestre 1', mois: 9 },
    { id: 'trim2', label: 'Trimestre 2', mois: 0 },
    { id: 'trim3', label: 'Trimestre 3', mois: 2 }
  ];

  // Année scolaire : démarre en septembre
  function anneeScolaire() {
    const now = new Date();
    return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  }
  function dateEcheance(moisIndex) {
    const y = anneeScolaire();
    const annee = moisIndex >= 8 ? y : y + 1;
    return new Date(annee, moisIndex, 5).toISOString().split('T')[0];
  }
  const num = (v) => parseFloat(v || 0) || 0;

  Object.assign(DB, {
    /** Élève exonéré de scolarité ? */
    isExonere(eleve) {
      if (!eleve) return false;
      return eleve.exonere === true || eleve.type_scolarite === 'exonere';
    },

    /** Mention à partir d'une moyenne /20 */
    getMention(moy) {
      const m = parseFloat(moy);
      if (isNaN(m)) return '';
      if (m >= 16) return 'Excellent';
      if (m >= 14) return 'Très Bien';
      if (m >= 12) return 'Bien';
      if (m >= 10) return 'Passable';
      return '';
    },

    /**
     * Échéancier d'un élève : [{ id, label, montant, date_echeance }]
     * Basé sur ecole_config.montants_echeances si défini, sinon dérivé
     * du type d'échéancier (mensuel / trimestriel) et du tarif du niveau.
     */
    async getEcheances(classeId, eleveId) {
      const [cfg, classes, configsSco, eleves] = await Promise.all([
        this.getEcoleConfig(),
        this.getAll('classes'),
        this.getAll('config_scolarite'),
        eleveId ? this.getAll('eleves') : Promise.resolve([])
      ]);

      const eleve = eleveId ? eleves.find(e => e.id === eleveId) : null;
      if (eleve && this.isExonere(eleve)) return [];

      const cls = classes.find(c => c.id === classeId);
      const tarif = cls ? configsSco.find(c => c.niveau === cls.niveau) : null;
      const totalAnnuel = num(tarif?.montant_annuel);

      // 1) Échéancier explicitement configuré
      const custom = Array.isArray(cfg?.montants_echeances) ? cfg.montants_echeances : [];
      if (custom.length) {
        return custom.map((t, i) => {
          const label = t.label || `Tranche ${i + 1}`;
          const isInscr = /inscription/i.test(label);
          const ref = isInscr ? null : MOIS_SCO[Math.max(0, (t.mois_index ?? i) - (custom.some(x => /inscription/i.test(x.label || '')) ? 1 : 0))];
          return {
            id: isInscr ? 'inscription' : (ref?.id || `tr${i}`),
            label,
            montant: num(t.montant),
            date_echeance: isInscr ? dateEcheance(8) : dateEcheance(ref ? ref.mois : 9)
          };
        });
      }

      // 2) Dérivation automatique depuis le tarif annuel
      if (totalAnnuel <= 0) return [];
      const trimestriel = (cfg?.type_echeancier || 'mensuel') === 'trimestriel';
      const inscription = Math.round(totalAnnuel * 0.15);
      const reste = totalAnnuel - inscription;
      const base = trimestriel ? TRIMESTRES : MOIS_SCO;
      const part = Math.round(reste / base.length);

      return [
        { id: 'inscription', label: 'Inscription', montant: inscription, date_echeance: dateEcheance(8) },
        ...base.map((t, i) => ({
          id: t.id,
          label: t.label,
          montant: i === base.length - 1 ? reste - part * (base.length - 1) : part,
          date_echeance: dateEcheance(t.mois)
        }))
      ];
    },

    /** Statut paiement d'un élève : exonere | solde | encours | aucun */
    async getStatutPaiement(eleveId) {
      const [eleves, paiements] = await Promise.all([
        this.getAll('eleves'), this.getAll('paiements')
      ]);
      const eleve = eleves.find(e => e.id === eleveId);
      if (!eleve) return 'aucun';
      if (this.isExonere(eleve)) return 'exonere';

      const echeances = await this.getEcheances(eleve.classe_id, eleveId);
      const total = echeances.reduce((s, e) => s + num(e.montant), 0);
      if (total <= 0) return 'exonere';

      const paye = paiements
        .filter(p => p.eleve_id === eleveId && !p.annule)
        .reduce((s, p) => s + num(p.montant), 0);

      if (paye >= total) return 'solde';
      if (paye > 0) return 'encours';
      return 'aucun';
    },

    /** Nombre de tranches échues non soldées (retard) */
    async getNbMoisEnRetard(eleveId) {
      const [eleves, paiements] = await Promise.all([
        this.getAll('eleves'), this.getAll('paiements')
      ]);
      const eleve = eleves.find(e => e.id === eleveId);
      if (!eleve || this.isExonere(eleve)) return 0;

      const echeances = await this.getEcheances(eleve.classe_id, eleveId);
      const pays = paiements.filter(p => p.eleve_id === eleveId && !p.annule);
      const today = new Date();
      let retard = 0;

      for (const ech of echeances) {
        if (ech.date_echeance && new Date(ech.date_echeance) > today) continue;
        const payeTranche = pays
          .filter(p => p.tranche_id === ech.id || p.tranche_label === ech.label)
          .reduce((s, p) => s + num(p.montant), 0);
        if (payeTranche < num(ech.montant)) retard++;
      }
      return retard;
    },

    /** Rapport financier sur une période (dates YYYY-MM-DD incluses) */
    async getRapportFinancier(debut, fin) {
      const [paiements, depenses] = await Promise.all([
        this.getAll('paiements'), this.getAll('depenses')
      ]);
      const d = debut ? new Date(debut + 'T00:00:00').getTime() : -Infinity;
      const f = fin ? new Date(fin + 'T23:59:59').getTime() : Infinity;
      const ts = (v) => {
        if (!v) return 0;
        if (typeof v === 'number') return v;
        const t = new Date(v.length === 10 ? v + 'T12:00:00' : v).getTime();
        return isNaN(t) ? 0 : t;
      };

      const pays = paiements
        .filter(p => !p.annule)
        .filter(p => { const t = ts(p.date_paiement || p.created_at); return t >= d && t <= f; })
        .sort((a, b) => ts(b.date_paiement || b.created_at) - ts(a.date_paiement || a.created_at));

      const deps = depenses
        .filter(x => { const t = ts(x.date_depense || x.created_at); return t >= d && t <= f; })
        .sort((a, b) => ts(b.date_depense || b.created_at) - ts(a.date_depense || a.created_at));

      const totalEncaisse = pays.reduce((s, p) => s + num(p.montant), 0);
      const totalDepenses = deps.reduce((s, x) => s + num(x.montant), 0);

      return {
        paiements: pays,
        depenses: deps,
        totalEncaisse,
        totalDepenses,
        beneficeNet: totalEncaisse - totalDepenses,
        debut, fin
      };
    },

    /** Statistiques du tableau de bord — 100% local */
    async getStatsDashboard() {
      const [eleves, classes, paiements, depenses, configsSco] = await Promise.all([
        this.getAll('eleves'), this.getAll('classes'), this.getAll('paiements'),
        this.getAll('depenses'), this.getAll('config_scolarite')
      ]);

      const paysValides = paiements.filter(p => !p.annule);
      const now = new Date();
      const moisCourant = now.getMonth();
      const anneeCourante = now.getFullYear();
      const jour = now.toISOString().split('T')[0];

      const dateOf = (v) => {
        if (!v) return null;
        const dt = new Date(typeof v === 'number' ? v : (String(v).length === 10 ? v + 'T12:00:00' : v));
        return isNaN(dt.getTime()) ? null : dt;
      };

      let encaisseMois = 0, totalEncaisseAujourd = 0;
      for (const p of paysValides) {
        const dt = dateOf(p.date_paiement || p.created_at);
        if (!dt) continue;
        if (dt.getMonth() === moisCourant && dt.getFullYear() === anneeCourante) encaisseMois += num(p.montant);
        if (dt.toISOString().split('T')[0] === jour) totalEncaisseAujourd += num(p.montant);
      }

      let depensesMois = 0;
      for (const x of depenses) {
        const dt = dateOf(x.date_depense || x.created_at);
        if (dt && dt.getMonth() === moisCourant && dt.getFullYear() === anneeCourante) depensesMois += num(x.montant);
      }

      // Statuts de paiement par élève
      const clsMap = Object.fromEntries(classes.map(c => [c.id, c]));
      const payeParEleve = {};
      paysValides.forEach(p => { payeParEleve[p.eleve_id] = (payeParEleve[p.eleve_id] || 0) + num(p.montant); });

      let elevesSolde = 0, elevesEncours = 0, elevesAucun = 0;
      for (const e of eleves) {
        if (this.isExonere(e)) { elevesSolde++; continue; }
        const cls = clsMap[e.classe_id];
        const tarif = cls ? configsSco.find(c => c.niveau === cls.niveau) : null;
        const total = num(tarif?.montant_annuel);
        const paye = payeParEleve[e.id] || 0;
        if (total <= 0) { elevesSolde++; continue; }
        if (paye >= total) elevesSolde++;
        else if (paye > 0) elevesEncours++;
        else elevesAucun++;
      }

      return {
        totalEleves: eleves.length,
        totalClasses: classes.length,
        elevesSolde, elevesEncours, elevesAucun,
        encaisseMois, depensesMois,
        beneficeMois: encaisseMois - depensesMois,
        totalEncaisseAujourd
      };
    }
  });

  // ── Compat legacy : DB._cache['table:all:500'] / DB._cacheExpiry ──
  const legacy = (store) => new Proxy({}, {
    get: (_t, prop) => {
      if (typeof prop !== 'string') return undefined;
      const [table, , limit] = prop.split(':');
      const code = DB._currentEcoleCode || '';
      return DB[store][`${table}|all|${code}|${limit || 500}`];
    },
    set: () => true,
    has: () => true
  });

  Object.defineProperty(DB, '_cache', {
    configurable: true,
    get() { return legacy('_memCache'); },
    set() { DB._memCache = {}; DB._memCacheExp = {}; }
  });
  Object.defineProperty(DB, '_cacheExpiry', {
    configurable: true,
    get() { return legacy('_memCacheExp'); },
    set() { DB._memCacheExp = {}; }
  });
})();
