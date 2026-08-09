/**
 * help.js — Zean School Manager R17
 * Centre d'aide contextuel — drawer FAQ strictement par rôle
 *
 * RÈGLE ABSOLUE : chaque rôle voit UNIQUEMENT ses fonctions.
 * Aucun chevauchement.
 *
 *  prof        → Notes + Appel journalier + Bordereau
 *  comptable   → Paiements + Grille + Dépenses + Comptabilité
 *  directeur   → Vue d'ensemble + Validation audit + Supervision financière
 *  superviseur → Supervision enseignants + Présences (lecture)
 *  admin       → Tout : élèves, notes, finance, comptabilité, config, purge
 */

const HelpCenter = {
  _isOpen: false,

  toggle() { this._isOpen ? this.close() : this.open(); },

  open() {
    this._isOpen = true;
    this.render();
    document.getElementById('help-drawer')?.classList.add('open');
    document.getElementById('help-drawer-overlay')?.classList.add('open');
  },

  close() {
    this._isOpen = false;
    document.getElementById('help-drawer')?.classList.remove('open');
    document.getElementById('help-drawer-overlay')?.classList.remove('open');
  },

  render() {
    const role = window.App?.currentUser?.role || 'admin';
    const roleLabels = {
      admin      : 'Administrateur',
      directeur  : 'Directeur',
      comptable  : 'Comptable / Secrétaire',
      prof       : 'Enseignant',
      superviseur: 'Superviseur Enseignants'
    };
    const bannerEl = document.getElementById('help-role-banner');
    const bodyEl   = document.getElementById('help-drawer-body');
    if (bannerEl) bannerEl.innerHTML =
      `<i class="fa-solid fa-user-shield"></i>&nbsp; Aide — <strong>${roleLabels[role] || role}</strong>`;
    if (bodyEl) bodyEl.innerHTML = this._buildContent(role);
  },

  // ════════════════════════════════════════════════════════════════
  // CONTENU PAR RÔLE — AUCUN CHEVAUCHEMENT
  // ════════════════════════════════════════════════════════════════

  _buildContent(role) {
    let sections = [];

    // ──────────────────────────────────────────────────────────────
    // PROF — uniquement notes + appel + bordereau
    // ──────────────────────────────────────────────────────────────
    if (role === 'prof') {
      sections = [
        {
          icon: '✏️', title: 'Saisie des Notes', color: '#1565c0',
          items: [
            { q: 'Comment saisir les notes ?',
              a: 'Menu → <strong>Saisie Notes</strong>. Sélectionnez votre classe et la séquence, entrez les notes (0–20), cliquez <strong>Enregistrer tout</strong>.' },
            { q: 'Les notes s\'enregistrent-elles sans internet ?',
              a: '✅ <strong>Oui, complètement.</strong> Les notes sont sauvegardées immédiatement dans votre appareil. Vous les verrez affichées tout de suite. La synchronisation cloud se fait automatiquement quand vous retrouvez le réseau.' },
            { q: 'Puis-je modifier une note après enregistrement ?',
              a: 'Dans les <strong>24 heures</strong> : modification libre. Après 24h : une <em>demande de validation</em> est envoyée au Directeur.' },
            { q: 'Que signifient les couleurs des notes ?',
              a: '🔴 &lt;10 insuffisant · 🟡 10–12 passable · 🟢 ≥12 satisfaisant. Case vide = non saisie ≠ zéro.' },
            { q: 'Je suis prof de collège — pourquoi ne vois-je pas certaines matières ?',
              a: 'En collège, vous voyez uniquement les matières qui vous ont été assignées par l\'admin. Contactez-le pour vérifier vos assignations dans Utilisateurs.' }
          ]
        },
        {
          icon: '📋', title: 'Appel Journalier', color: '#2e7d32',
          items: [
            { q: 'Comment faire l\'appel ?',
              a: 'Menu → <strong>Appel Journalier</strong>. Sélectionnez votre classe et la date, cochez les élèves <strong>présents</strong>, puis <strong>Valider l\'appel</strong>.' },
            { q: 'Puis-je faire l\'appel sans internet ?',
              a: '✅ <strong>Oui.</strong> L\'appel s\'enregistre localement et s\'affiche immédiatement. Il sera synchronisé dès le retour du réseau.' },
            { q: 'Puis-je corriger un appel déjà validé ?',
              a: 'Retournez sur la même date et classe. Vos modifications remplacent l\'appel précédent.' }
          ]
        },
        {
          icon: '📄', title: 'Bordereau de Notes', color: '#6a1b9a',
          items: [
            { q: 'Comment imprimer le bordereau de ma classe ?',
              a: 'Menu → <strong>Bordereau de Notes</strong>. Sélectionnez classe et séquence, puis <strong>Imprimer PDF</strong>. Fonctionne aussi hors-ligne.' },
            { q: 'Le bordereau est vide — pourquoi ?',
              a: 'Vérifiez que vous avez sélectionné la bonne séquence ET la bonne classe. Si aucune note n\'a été saisie pour cette séquence, le bordereau sera vide.' }
          ]
        }
      ];
    }

    // ──────────────────────────────────────────────────────────────
    // COMPTABLE — paiements + grille + dépenses + comptabilité
    // ──────────────────────────────────────────────────────────────
    else if (role === 'comptable') {
      sections = [
        {
          icon: '💳', title: 'Paiements de Scolarité', color: '#1b5e20',
          items: [
            { q: 'Comment enregistrer un paiement ?',
              a: 'Menu → <strong>Paiements</strong> → <strong>Enregistrer un paiement</strong>. Recherchez l\'élève, sélectionnez la tranche, entrez le montant reçu.' },
            { q: 'Les paiements fonctionnent-ils hors-ligne ?',
              a: '✅ <strong>Oui.</strong> Le paiement s\'enregistre immédiatement et s\'affiche de suite. La grille se met à jour instantanément sans attendre internet.' },
            { q: 'Pourquoi certaines tranches sont verrouillées (cadenas) ?',
              a: '<strong>Règle séquentielle</strong> : chaque tranche ne s\'ouvre que si la précédente est soldée. Commencez toujours par la tranche la plus ancienne.' },
            { q: 'Comment enregistrer un paiement partiel ?',
              a: 'Entrez exactement le montant reçu. Le reste apparaît comme "solde dû" sur la tranche.' },
            { q: 'Comment annuler un paiement erroné ?',
              a: 'Dans l\'historique, cliquez l\'icône ⊘ de la ligne. Le paiement est marqué "annulé" mais conservé pour l\'audit.' },
            { q: 'La scolarité totale affiche 0 GNF — que faire ?',
              a: 'Vérifiez que les <strong>tarifs de scolarité</strong> ont été configurés : Config → Tarifs par niveau. Si la classe de l\'élève n\'a pas de tarif, le total sera 0.' }
          ]
        },
        {
          icon: '📊', title: 'Grille des Paiements', color: '#0d47a1',
          items: [
            { q: 'À quoi sert la Grille Paiements ?',
              a: 'Vue d\'ensemble de tous les élèves mois par mois. 🟢 Payé · 🔴 Non payé · 🟡 Partiel.' },
            { q: 'Comment exporter la grille en Excel ?',
              a: 'Bouton <strong>Excel</strong> en haut de la grille. Fonctionne entièrement hors-ligne.' }
          ]
        },
        {
          icon: '🧾', title: 'Dépenses', color: '#c62828',
          items: [
            { q: 'Comment enregistrer une dépense ?',
              a: 'Menu → <strong>Dépenses</strong> → <strong>Nouvelle dépense</strong>. Remplissez catégorie, libellé, montant, date et mode de paiement.' },
            { q: 'Les dépenses fonctionnent hors-ligne ?',
              a: '✅ Oui. Enregistrement immédiat, affichage instantané.' }
          ]
        },
        {
          icon: '🏦', title: 'Comptabilité & Caisse', color: '#1565c0',
          items: [
            { q: 'Quelle est la différence entre Caisse et Banque ?',
              a: '<strong>Caisse</strong> = argent liquide (espèces). <strong>Banque</strong> = compte bancaire. Deux journaux distincts.' },
            { q: 'Comment est calculé le solde bancaire ?',
              a: '<strong>Solde initial + Entrées − Sorties</strong>. Calculé automatiquement depuis le journal de banque.' },
            { q: 'Comment transférer de la caisse vers la banque ?',
              a: 'Onglet Comptabilité → Tableau de bord → bouton <strong>Transfert Caisse→Banque</strong>. Entrez le montant : déduit de la caisse, ajouté à la banque.' },
            { q: 'Comment configurer les soldes initiaux ?',
              a: 'Onglet Comptabilité → onglet <strong>Configuration</strong>. Entrez le solde d\'ouverture de caisse et de banque pour l\'exercice courant.' }
          ]
        }
      ];
    }

    // ──────────────────────────────────────────────────────────────
    // DIRECTEUR — vue d'ensemble + validation + supervision
    // ──────────────────────────────────────────────────────────────
    else if (role === 'directeur') {
      sections = [
        {
          icon: '📊', title: 'Vue d\'ensemble & Statistiques', color: '#1565c0',
          items: [
            { q: 'Comment voir les statistiques de l\'école ?',
              a: 'Menu → <strong>Statistiques & Graphiques</strong> : taux de recouvrement, répartition élèves, taux de présence, taux de réussite par séquence.' },
            { q: 'Comment consulter les notes sans les modifier ?',
              a: 'Menu → <strong>Consulter Notes</strong>. Lecture seule sur toutes les classes.' },
            { q: 'Comment imprimer les bulletins d\'une classe ?',
              a: 'Menu → <strong>Bulletins</strong>. Sélectionnez classe et période, cliquez <strong>Imprimer tous les bulletins</strong>.' },
            { q: 'Puis-je accéder à tout hors-ligne ?',
              a: '✅ Oui. Toutes les données sont disponibles localement. Statistiques, bulletins, supervision : tout fonctionne sans internet.' }
          ]
        },
        {
          icon: '✅', title: 'Validation & Audit des Notes', color: '#2e7d32',
          items: [
            { q: 'Comment valider une demande de modification de note ?',
              a: 'Menu → <strong>Journal d\'Audit</strong>. Les demandes en attente ont un badge rouge. Cliquez ✅ Valider ou ❌ Rejeter.' },
            { q: 'Comment voir toutes les modifications de notes ?',
              a: 'Journal d\'Audit liste : qui a modifié, quelle note, quand, et le motif.' }
          ]
        },
        {
          icon: '💰', title: 'Supervision Financière', color: '#e65100',
          items: [
            { q: 'Comment voir le taux de recouvrement ?',
              a: 'Menu → <strong>Statistiques & Graphiques</strong>. Le graphique "Taux de recouvrement" montre le pourcentage de scolarité collecté.' },
            { q: 'Puis-je voir les paiements sans les modifier ?',
              a: 'Oui. La liste des élèves (Menu → Élèves) affiche le statut financier de chacun (Soldé / En cours / Non payé) en lecture seule.' }
          ]
        }
      ];
    }

    // ──────────────────────────────────────────────────────────────
    // SUPERVISEUR — supervision enseignants uniquement
    // ──────────────────────────────────────────────────────────────
    else if (role === 'superviseur') {
      sections = [
        {
          icon: '👁️', title: 'Supervision des Enseignants', color: '#4a148c',
          items: [
            { q: 'Que puis-je faire en tant que Superviseur ?',
              a: 'Vous avez un accès <strong>lecture seule</strong> sur : notes de toutes les classes, présences, bordereau. Vous ne pouvez PAS modifier ces données.' },
            { q: 'Comment voir si un prof a fait son appel aujourd\'hui ?',
              a: 'Menu → <strong>Supervision Enseignants</strong>. Le tableau montre pour chaque enseignant : appel fait ✅ ou non ❌, progression des notes par séquence.' },
            { q: 'Comment voir les notes d\'une classe ?',
              a: 'Menu → <strong>Consulter Notes</strong>. Sélectionnez une classe et une séquence.' },
            { q: 'Peut-on superviser sans internet ?',
              a: '✅ Oui. Toutes les données sont disponibles localement.' }
          ]
        }
      ];
    }

    // ──────────────────────────────────────────────────────────────
    // ADMIN — accès complet à tout
    // ──────────────────────────────────────────────────────────────
    else {
      sections = [
        {
          icon: '🏫', title: 'Gestion des Élèves', color: '#1565c0',
          items: [
            { q: 'Comment ajouter un élève ?',
              a: 'Menu → <strong>Élèves</strong> → <strong>Nouvel élève</strong>. Le matricule est généré automatiquement. Assignez-le à une classe.' },
            { q: 'Comment importer plusieurs élèves à la fois ?',
              a: 'Bouton <strong>Importer CSV</strong> dans la page Élèves. Téléchargez d\'abord le modèle CSV, remplissez-le, puis importez. Le code école est ajouté automatiquement.' },
            { q: 'Comment marquer un élève comme exonéré ?',
              a: 'Fiche élève → cochez <strong>Exonéré de scolarité</strong>. Cet élève n\'apparaît plus dans les impayés.' }
          ]
        },
        {
          icon: '✏️', title: 'Notes & Bulletins', color: '#0d47a1',
          items: [
            { q: 'Comment configurer les séquences (trimestres/semestres) ?',
              a: 'Menu → <strong>Configuration</strong> → choisir le type de bulletin (séquences, trimestres, semestres).' },
            { q: 'Les notes s\'enregistrent hors-ligne ?',
              a: '✅ Oui. Instantané et immédiatement visible. Sync cloud en fond au retour du réseau.' },
            { q: 'Comment valider une demande de modification de note d\'un prof ?',
              a: 'Menu → <strong>Journal d\'Audit</strong>. Badge rouge = demandes en attente. Validez ou rejetez chaque demande.' }
          ]
        },
        {
          icon: '💳', title: 'Paiements & Finance', color: '#1b5e20',
          items: [
            { q: 'Comment configurer les tarifs de scolarité ?',
              a: 'Menu → <strong>Configuration</strong> → <strong>Tarifs de scolarité</strong>. Définissez le montant annuel par niveau.' },
            { q: 'Comment choisir entre paiement mensuel et trimestriel ?',
              a: 'Configuration → <strong>Modalité de paiement</strong>. Choisissez "Par Mois" (9 mensualités + inscription) ou "Par Trimestre".' },
            { q: 'Les paiements fonctionnent hors-ligne ?',
              a: '✅ Oui. Enregistrement et affichage immédiats, sans attendre internet.' }
          ]
        },
        {
          icon: '🏦', title: 'Comptabilité & Caisse', color: '#4a148c',
          items: [
            { q: 'Comment accéder à la comptabilité ?',
              a: 'Menu → <strong>Comptabilité & Caisse</strong>. 4 onglets : Dashboard, Journal Caisse, Journal Banque, Configuration.' },
            { q: 'Comment configurer les soldes initiaux ?',
              a: 'Onglet <strong>Configuration</strong> → entrez le solde d\'ouverture de caisse et de banque.' },
            { q: 'Comment faire un transfert caisse → banque ?',
              a: 'Dashboard comptabilité → bouton <strong>Transfert Caisse→Banque</strong>.' }
          ]
        },
        {
          icon: '⚙️', title: 'Administration & Configuration', color: '#37474f',
          items: [
            { q: 'Comment créer un compte utilisateur (prof, comptable…) ?',
              a: 'Menu → <strong>Utilisateurs</strong> → <strong>Nouvel utilisateur</strong>. Définissez le rôle et l\'assignation (classe pour primaire, matières pour collège).' },
            { q: 'Comment assigner un prof de collège à ses matières ?',
              a: 'Fiche utilisateur → Rôle "Enseignant" → Sélectionnez "Collège" → cochez les matières dans les classes concernées.' },
            { q: 'Comment purger TOUTES les données de test ?',
              a: 'Menu → <strong>Configuration</strong> → Zone de danger → <strong>Supprimer TOUTES les données</strong>. Cette action efface les données cloud ET locales. Réservé aux remises à zéro avant mise en production.' },
            { q: 'Comment sauvegarder les données ?',
              a: 'Configuration → <strong>Sauvegarde & Restauration</strong> → Télécharger la sauvegarde (JSON). Conservez ce fichier en lieu sûr.' },
            { q: 'Comment activer une licence ?',
              a: 'Si le bandeau d\'essai apparaît en haut : cliquez <strong>Activer ma clé</strong>. Entrez la clé au format ZEAN-XXXX-XXXX-XXXX reçue après paiement. La licence est activée immédiatement.' },
            { q: 'Comment clôturer l\'année scolaire ?',
              a: 'Menu → <strong>Clôture d\'Année</strong>. 3 étapes : archiver les données, promouvoir les élèves, réinitialiser pour la nouvelle année.' }
          ]
        },
        {
          icon: '📶', title: 'Mode Hors-Ligne (Offline)', color: '#00695c',
          items: [
            { q: 'L\'application fonctionne-t-elle sans internet ?',
              a: '✅ <strong>Oui, entièrement.</strong> Toutes les fonctions (notes, paiements, présences, comptabilité) fonctionnent sans réseau pendant des semaines ou des mois.' },
            { q: 'Comment savoir si mes données sont synchronisées ?',
              a: 'Le badge en haut à droite indique l\'état : 🟢 En ligne (sync OK) · 🔴 Hors-ligne (données locales). La synchronisation est automatique au retour du réseau.' },
            { q: 'Que se passe-t-il si je ferme l\'app hors-ligne et la rouvre ?',
              a: 'Les données sont stockées localement. Au prochain démarrage, même sans internet, tout s\'affiche normalement.' }
          ]
        }
      ];
    }

    return this._renderSections(sections);
  },

  // ════════════════════════════════════════════════════════════════
  // RENDU HTML
  // ════════════════════════════════════════════════════════════════

  _renderSections(sections) {
    if (!sections.length) return '<p style="padding:1rem;color:#888">Aucune aide disponible.</p>';
    return sections.map(s => `
      <div class="help-section" style="margin-bottom:1.25rem">
        <div class="help-section-title" style="display:flex;align-items:center;gap:.5rem;font-size:.92rem;font-weight:700;color:${s.color};padding:.5rem .75rem;background:${s.color}12;border-radius:8px;margin-bottom:.5rem">
          <span style="font-size:1.1rem">${s.icon}</span> ${s.title}
        </div>
        ${s.items.map((item, i) => `
          <div class="help-faq-item" style="border-radius:7px;border:1px solid #e9ecef;margin-bottom:.35rem;overflow:hidden">
            <button class="help-q" onclick="HelpCenter._toggleFaq(this)"
              style="width:100%;text-align:left;background:#fafbfc;border:none;padding:.6rem .9rem;font-size:.83rem;font-weight:600;cursor:pointer;display:flex;justify-content:space-between;align-items:center;color:#202124;gap:.5rem">
              <span style="flex:1">${item.q}</span>
              <i class="fa-solid fa-chevron-down" style="font-size:.72rem;color:#6c757d;transition:transform .2s;flex-shrink:0"></i>
            </button>
            <div class="help-a" style="display:none;padding:.65rem .9rem .7rem;font-size:.82rem;color:#495057;line-height:1.6;border-top:1px solid #f0f0f0;background:#fff">
              ${item.a}
            </div>
          </div>
        `).join('')}
      </div>
    `).join('');
  },

  _toggleFaq(btn) {
    const answer = btn.nextElementSibling;
    const icon   = btn.querySelector('i');
    const isOpen = answer.style.display === 'block';
    answer.style.display = isOpen ? 'none' : 'block';
    if (icon) icon.style.transform = isOpen ? '' : 'rotate(180deg)';
  }
};
