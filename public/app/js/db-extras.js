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

  // Année scolaire : déduite de la configuration de l'école
  // (ex. « 2026-2027 » → 2026), sinon de la date de rentrée, sinon septembre.
  function anneeScolaire(cfg) {
    const lab = String(cfg?.annee_scolaire || '');
    const m = lab.match(/(20\d{2})/);
    if (m) return parseInt(m[1], 10);
    if (cfg?.date_rentree) {
      const d = new Date(cfg.date_rentree);
      if (!isNaN(d)) return d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
    }
    const now = new Date();
    return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  }
  /** Date de rentrée officielle (début de l'année scolaire configurée). */
  function dateRentree(cfg) {
    if (cfg?.date_rentree) {
      const d = new Date(cfg.date_rentree);
      if (!isNaN(d)) return d;
    }
    return new Date(anneeScolaire(cfg), 8, 15); // 15 septembre par défaut
  }
  function dateEcheance(moisIndex, cfg) {
    const y = anneeScolaire(cfg);
    const annee = moisIndex >= 8 ? y : y + 1;
    return new Date(annee, moisIndex, 5).toISOString().split('T')[0];
  }
  /** Découpe l'année scolaire en N tranches réparties d'octobre à juin. */
  function tranchesReparties(n) {
    const total = MOIS_SCO.length; // 9 mois utiles
    const nb = Math.max(1, Math.min(12, parseInt(n, 10) || 3));
    const out = [];
    for (let i = 0; i < nb; i++) {
      const idx = Math.min(total - 1, Math.round((i * total) / nb));
      out.push({ id: `tr${i + 1}`, label: `Tranche ${i + 1}`, mois: MOIS_SCO[idx].mois });
    }
    return out;
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

      // Réinscription : élève déjà présent l'année précédente
      const estReinscription = !!eleve && (
        eleve.reinscription === true ||
        eleve.type_scolarite === 'reinscription' ||
        (eleve.annee_arrivee && String(eleve.annee_arrivee) !== String(cfg?.annee_scolaire || ''))
      );

      // 1) Échéancier explicitement configuré par l'école (nombre libre de
      //    tranches, chacune avec son montant et sa date limite).
      const custom = Array.isArray(cfg?.montants_echeances) ? cfg.montants_echeances : [];
      if (custom.length) {
        const aInscription = custom.some(x => /inscription/i.test(x.label || ''));
        return custom.map((t, i) => {
          const label = t.label || `Tranche ${i + 1}`;
          const isInscr = /inscription/i.test(label);
          const ref = isInscr ? null : MOIS_SCO[Math.max(0, Math.min(MOIS_SCO.length - 1,
            (t.mois_index ?? i) - (aInscription ? 1 : 0)))];
          let montant = num(t.montant);
          if (isInscr) {
            const fraisI = num(estReinscription ? cfg?.frais_reinscription : cfg?.frais_inscription);
            if (fraisI > 0) montant = fraisI;
          }
          return {
            id: isInscr ? 'inscription' : (t.id || ref?.id || `tr${i}`),
            label: isInscr && estReinscription ? 'Réinscription' : label,
            montant,
            // Date limite saisie par l'école si présente
            date_echeance: t.date_echeance || (isInscr ? dateEcheance(8, cfg) : dateEcheance(ref ? ref.mois : 9, cfg))
          };
        });
      }

      // 2) Dérivation automatique : frais d'inscription/réinscription paramétrés
      //    + nombre de tranches librement configurable (nb_tranches).
      if (totalAnnuel <= 0) return [];
      const fraisConfig = num(estReinscription ? cfg?.frais_reinscription : cfg?.frais_inscription);
      const inscription = fraisConfig > 0 ? fraisConfig : Math.round(totalAnnuel * 0.15);
      const reste = Math.max(0, totalAnnuel - inscription);

      let base;
      if (num(cfg?.nb_tranches) > 0) base = tranchesReparties(cfg.nb_tranches);
      else base = (cfg?.type_echeancier || 'mensuel') === 'trimestriel' ? TRIMESTRES : MOIS_SCO;

      const part = Math.round(reste / base.length);

      return [
        {
          id: 'inscription',
          label: estReinscription ? 'Réinscription' : 'Inscription',
          montant: inscription,
          date_echeance: dateEcheance(8, cfg)
        },
        ...base.map((t, i) => ({
          id: t.id,
          label: t.label,
          montant: i === base.length - 1 ? reste - part * (base.length - 1) : part,
          date_echeance: dateEcheance(t.mois, cfg)
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

      // Aucun retard possible si l'année scolaire n'a pas encore débuté.
      const cfg = await this.getEcoleConfig();
      const today = new Date();
      if (today < dateRentree(cfg)) return 0;

      const echeances = await this.getEcheances(eleve.classe_id, eleveId);
      const pays = paiements.filter(p => p.eleve_id === eleveId && !p.annule);
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
