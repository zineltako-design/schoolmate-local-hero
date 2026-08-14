/**
 * pages.js — Toutes les pages de l'application (version en ligne)
 * Formulaires visibles, logique primaire/collège, import CSV, paiements
 */

// Helper pour récupérer la devise courante
let _deviseCache = 'FCFA';
async function getDevise() {
  const cfg = await DB.getEcoleConfig();
  _deviseCache = cfg?.devise || 'FCFA';
  return _deviseCache;
}
function money(v) { return Fmt.moneySync(v, _deviseCache); }

// Helper : afficher un spinner dans #main-content
function setLoading(msg = 'Chargement…') {
  document.getElementById('main-content').innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:5rem 1rem;gap:1rem;color:var(--gray-500)">
      <div class="loading-spinner" style="width:32px;height:32px"></div><span>${msg}</span>
    </div>`;
}

// Helper : remplacer le contenu principal
function setContent(html) {
  document.getElementById('main-content').innerHTML = html;
}

// ── Ordre hiérarchique officiel des niveaux ──────────────────────────
const NIVEAU_ORDER = {
  // Primaire Guinée : SIL, CP, CE1, CE2, CM1, CM2 → mappés aux codes 1ere–6eme
  '1ere':2, '2eme':3, '3eme':4, '4eme':5, '5eme':6, '6eme':7,
  // Collège : 7ème → 10ème
  '7eme':8, '8eme':9, '9eme':10, '10eme':11
};

// Fix R9 — Nomenclature des niveaux : label lisible
const NIVEAU_LABEL = {
  '1ere': '1ère Année', '2eme': '2ème Année', '3eme': '3ème Année',
  '4eme': '4ème Année', '5eme': '5ème Année', '6eme': '6ème Année',
  '7eme': '7ème Année', '8eme': '8ème Année', '9eme': '9ème Année', '10eme': '10ème Année'
};

/**
 * Fix R9 — Formate le label d'une classe : "Niveau (Nom)"
 * Ex : "1ère Année (CP-A)" ou "7ème Année (4ème B)"
 * Si le nom contient déjà le niveau, affiche juste le nom.
 */
function formatClasseLabel(c) {
  if (!c) return '—';
  const niv = NIVEAU_LABEL[c.niveau] || c.niveau || '';
  const nom = c.nom || '';
  if (!niv || nom.toLowerCase().includes(niv.toLowerCase())) return nom;
  return `${niv} (${nom})`;
}

// Trie les classes du plus petit au plus grand niveau, puis alphabétiquement à niveau égal
function sortClasses(classes) {
  return [...classes].sort((a, b) => {
    const oa = NIVEAU_ORDER[a.niveau] ?? 99;
    const ob = NIVEAU_ORDER[b.niveau] ?? 99;
    if (oa !== ob) return oa - ob;
    return (a.nom || '').localeCompare(b.nom || '');
  });
}

// Helper : construire un sélecteur de classes (trié hiérarchiquement) — Fix R9 : label niveau en premier
function buildClassesSelect(classes, selectedId = '', extra = '') {
  const sorted = sortClasses(classes);
  const opts = sorted.map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${formatClasseLabel(c)}</option>`).join('');
  return `<select class="form-control" ${extra}><option value="">— Choisir une classe —</option>${opts}</select>`;
}

const Pages = {

  // ══════════════════════════════════════════════════════════════════
  // DASHBOARD — Différencié selon le rôle
  // ══════════════════════════════════════════════════════════════════
  async dashboard() {
    setLoading('Chargement du tableau de bord…');
    try {
      const role = App.currentUser?.role;
      const isDirecteur = role === 'directeur';
      const isProf = role === 'prof';
      const isComptable = role === 'comptable';
      const isAdmin = role === 'admin';
      const isSuperviseur = role === 'superviseur';

      // ─── SUPERVISEUR : Redirige vers son dashboard dédié ─────────────────────
      if (isSuperviseur) {
        await Pages.supervisionEnseignants();
        return;
      }

      const [cfg, stats] = await Promise.all([DB.getEcoleConfig(), DB.getStatsDashboard()]);
      await getDevise();

      const showFin = isAdmin || isComptable; // Bloc 5: directeur ne voit plus la finance
      const showAcad = !isComptable;

      // Bannière d'accueil
      const bannerHtml = `
        <div style="background:linear-gradient(135deg,var(--primary) 0%,var(--primary-dark) 100%);border-radius:var(--radius);padding:1.5rem;color:white;margin-bottom:1.25rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem">
          <div>
            <h2 style="font-size:1.3rem;font-weight:700;margin-bottom:.3rem">Bonjour, ${App.currentUser?.prenom || 'Utilisateur'} 👋</h2>
            <p style="opacity:.85;font-size:.875rem">${cfg?.nom || 'École'} — ${new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
          </div>
          <div style="opacity:.7;font-size:2rem"><i class="fa-solid fa-${isDirecteur?'user-tie':isProf?'chalkboard-user':isComptable?'calculator':'school'}"></i></div>
        </div>`;

      // ─── DIRECTEUR : Dashboard pédagogique (Bloc 5) ───────────────────────────
      if (isDirecteur) {
        const allEleves = await DB.getAll('eleves');
        const allClasses = await DB.getAll('classes');
        const allMatieres = await DB.getAll('matieres');
        const pctReussite = stats.totalEleves > 0 ? Math.round(stats.elevesSolde / stats.totalEleves * 100) : 0;
        const primaires = allClasses.filter(c => DB.isPrimaire(c.niveau));
        const colleges = allClasses.filter(c => DB.isCollege(c.niveau));
        const exoneres = allEleves.filter(e => e.type_scolarite === 'exonere').length;

        setContent(`${bannerHtml}
          <div class="stat-grid">
            <div class="stat-card blue"><div class="stat-icon blue"><i class="fa-solid fa-user-graduate"></i></div><div class="stat-info"><div class="stat-value">${stats.totalEleves}</div><div class="stat-label">Élèves inscrits</div></div></div>
            <div class="stat-card purple"><div class="stat-icon purple"><i class="fa-solid fa-chalkboard"></i></div><div class="stat-info"><div class="stat-value">${stats.totalClasses}</div><div class="stat-label">Classes actives</div></div></div>
            <div class="stat-card green"><div class="stat-icon green"><i class="fa-solid fa-school"></i></div><div class="stat-info"><div class="stat-value">${primaires.length}</div><div class="stat-label">Classes Primaire</div></div></div>
            <div class="stat-card orange"><div class="stat-icon orange"><i class="fa-solid fa-graduation-cap"></i></div><div class="stat-info"><div class="stat-value">${colleges.length}</div><div class="stat-label">Classes Collège</div></div></div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;margin-bottom:1.25rem">
            <div class="card">
              <div class="card-header"><div class="card-title"><i class="fa-solid fa-chart-pie"></i> Suivi administratif</div></div>
              <div class="card-body">
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem;text-align:center">
                  <div style="padding:.75rem;background:#e8f5e9;border-radius:8px"><div style="font-size:1.4rem;font-weight:700;color:var(--secondary)">${stats.elevesSolde}</div><div style="font-size:.73rem;color:var(--gray-600)">🟢 À jour</div></div>
                  <div style="padding:.75rem;background:#fff8e1;border-radius:8px"><div style="font-size:1.4rem;font-weight:700;color:#f57c00">${stats.elevesEncours}</div><div style="font-size:.73rem;color:var(--gray-600)">🟡 En cours</div></div>
                  <div style="padding:.75rem;background:#fce4ec;border-radius:8px"><div style="font-size:1.4rem;font-weight:700;color:var(--danger)">${stats.elevesAucun}</div><div style="font-size:.73rem;color:var(--gray-600)">🔴 Retard</div></div>
                </div>
                ${exoneres > 0 ? `<div style="margin-top:.75rem;text-align:center"><span class="badge badge-exonere">🔵 ${exoneres} élève(s) exonéré(s)</span></div>` : ''}
              </div>
            </div>
            <div class="card">
              <div class="card-header"><div class="card-title"><i class="fa-solid fa-book-open"></i> Couverture pédagogique</div></div>
              <div class="card-body">
                <div style="display:flex;flex-direction:column;gap:.5rem">
                  <div style="display:flex;justify-content:space-between"><span>Total matières configurées :</span><strong>${allMatieres.length}</strong></div>
                  <div style="display:flex;justify-content:space-between"><span>Cycle Primaire :</span><strong>${primaires.length} classe(s)</strong></div>
                  <div style="display:flex;justify-content:space-between"><span>Cycle Collège :</span><strong>${colleges.length} classe(s)</strong></div>
                  <div style="display:flex;justify-content:space-between"><span>Effectif moyen/classe :</span><strong>${stats.totalClasses > 0 ? Math.round(stats.totalEleves/stats.totalClasses) : 0} élève(s)</strong></div>
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><div class="card-title"><i class="fa-solid fa-bolt"></i> Accès rapides</div></div>
            <div class="card-body"><div style="display:flex;gap:.75rem;flex-wrap:wrap">
              <button class="btn btn-primary" onclick="App.navigateTo('eleves')"><i class="fa-solid fa-users"></i> Voir les élèves</button>
              <button class="btn btn-outline" onclick="App.navigateTo('bulletins')"><i class="fa-solid fa-file-lines"></i> Consulter les bulletins</button>
              <button class="btn btn-outline" onclick="App.navigateTo('classes')"><i class="fa-solid fa-chalkboard"></i> Consulter les classes</button>
              <button class="btn btn-outline" onclick="App.navigateTo('bordereau')"><i class="fa-solid fa-table-list"></i> Bordereau de notes</button>
              <button class="btn btn-outline" onclick="Pages._printBordereauDirecteur()"><i class="fa-solid fa-print"></i> Notes en PDF</button>
              <button class="btn btn-outline" onclick="App.navigateTo('presences')"><i class="fa-solid fa-clipboard-check"></i> Appel journalier</button>
            </div></div>
          </div>

          <!-- TABLEAU ÉLÈVES EN RETARD DE PAIEMENT -->
          <div class="card" style="margin-top:1.25rem" id="dir-retards-card">
            <div class="card-header">
              <div class="card-title"><i class="fa-solid fa-triangle-exclamation" style="color:var(--danger)"></i> Élèves en retard de paiement</div>
              <span class="badge badge-danger" id="dir-retards-count" style="font-size:.78rem">Chargement…</span>
            </div>
            <div class="card-body" style="padding:0" id="dir-retards-body">
              <div style="display:flex;align-items:center;justify-content:center;padding:2rem;gap:.75rem;color:var(--gray-500)">
                <div class="loading-spinner" style="width:20px;height:20px;border-width:2px"></div>
                <span style="font-size:.875rem">Calcul des retards en cours…</span>
              </div>
            </div>
          </div>`);

        // Charger le tableau des retards en arrière-plan (async après affichage)
        Pages._loadDirRetards(allEleves, allClasses);
        return;
      }

      // ─── PROF : Dashboard enrichi (Bloc 4) ───────────────────────────────────
      if (isProf) {
        const classesProf = await DB.getClassesProf(App.currentUser);
        const classeIds = classesProf.map(c => c.id);
        const allEleves = await DB.getAll('eleves');
        const elevesProf = allEleves.filter(e => classeIds.includes(e.classe_id));
        const allNotes = await DB.getAll('notes');
        const allPay = await DB.getAll('paiements');
        const configsSco = await DB.getAll('config_scolarite');
        const pMap = {};
        allPay.filter(p=>!p.annule).forEach(p=>{if(!pMap[p.eleve_id])pMap[p.eleve_id]=[];pMap[p.eleve_id].push(p);});
        const eMap = Object.fromEntries(allEleves.map(e=>[e.id,e]));
        const cMap = Object.fromEntries(classesProf.map(c=>[c.id,c]));

        // Calculer moyennes pour chaque élève (séquence la plus récente avec données)
        const moyennesEleves = [];
        for (const el of elevesProf) {
          const matieres = await DB.getMatieresAutoriseesProf(App.currentUser, el.classe_id);
          let bestMoy = null;
          for (let seq = 6; seq >= 1; seq--) {
            const notesSeq = allNotes.filter(n => n.eleve_id === el.id && n.sequence === seq);
            if (!notesSeq.length) continue;
            let sp = 0, sc = 0;
            matieres.forEach(m => { const n = notesSeq.find(x => x.matiere_id === m.id); if (n?.valeur !== null && n?.valeur !== undefined && n?.valeur !== '') { sp += parseFloat(n.valeur) * parseFloat(m.coefficient); sc += parseFloat(m.coefficient); } });
            if (sc > 0) { bestMoy = parseFloat((sp/sc).toFixed(2)); break; }
          }
          moyennesEleves.push({ el, moy: bestMoy });
        }

        const avecMoy = moyennesEleves.filter(x => x.moy !== null).sort((a, b) => b.moy - a.moy);
        const moyClasse = avecMoy.length ? parseFloat((avecMoy.reduce((s, x) => s + x.moy, 0) / avecMoy.length).toFixed(2)) : null;
        const top3 = avecMoy.slice(0, 3);
        const bot3 = avecMoy.slice(-3).reverse();

        // Élèves en retard de paiement
        const elevesRetard = elevesProf.filter(e => {
          const s = DB.getStatutPaiementSync(e.id, eMap, cMap, configsSco, pMap);
          return s === 'aucun' || s === 'retard';
        }).length;

        setContent(`${bannerHtml}
          <div class="stat-grid">
            <div class="stat-card blue"><div class="stat-icon blue"><i class="fa-solid fa-chalkboard"></i></div><div class="stat-info"><div class="stat-value">${classesProf.length}</div><div class="stat-label">Classes assignées</div></div></div>
            <div class="stat-card purple"><div class="stat-icon purple"><i class="fa-solid fa-user-graduate"></i></div><div class="stat-info"><div class="stat-value">${elevesProf.length}</div><div class="stat-label">Mes élèves</div></div></div>
            <div class="stat-card green"><div class="stat-icon green"><i class="fa-solid fa-chart-line"></i></div><div class="stat-info"><div class="stat-value">${moyClasse !== null ? moyClasse + '/20' : '—'}</div><div class="stat-label">Moyenne générale classe</div></div></div>
            ${elevesRetard > 0 ? `<div class="stat-card orange"><div class="stat-icon orange"><i class="fa-solid fa-triangle-exclamation"></i></div><div class="stat-info"><div class="stat-value">${elevesRetard}</div><div class="stat-label">Retards paiements signalés</div></div></div>` : ''}
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1.25rem;margin-bottom:1.25rem">
            <div class="card">
              <div class="card-header"><div class="card-title" style="color:var(--secondary)">🏆 Top 3 élèves</div></div>
              <div class="card-body">
                ${top3.length ? top3.map((x, i) => `<div style="display:flex;align-items:center;gap:.6rem;padding:.4rem 0;border-bottom:1px solid var(--gray-200);font-size:.87rem">
                  <div style="width:24px;height:24px;background:${i===0?'gold':i===1?'silver':'#cd7f32'};border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.75rem;color:white;flex-shrink:0">${i+1}</div>
                  <div style="flex:1;font-weight:600">${x.el.prenom} ${x.el.nom}</div>
                  <div style="color:var(--secondary);font-weight:700">${x.moy}/20</div>
                </div>`).join('') : '<p style="color:var(--gray-500);font-size:.85rem;text-align:center;padding:.75rem 0">Pas encore de notes</p>'}
              </div>
            </div>
            <div class="card">
              <div class="card-header"><div class="card-title" style="color:var(--danger)">⚠️ En difficulté</div></div>
              <div class="card-body">
                ${bot3.length ? bot3.map((x, i) => `<div style="display:flex;align-items:center;gap:.6rem;padding:.4rem 0;border-bottom:1px solid var(--gray-200);font-size:.87rem">
                  <div style="width:24px;height:24px;background:var(--danger);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.75rem;color:white;flex-shrink:0"><i class="fa-solid fa-arrow-down" style="font-size:.6rem"></i></div>
                  <div style="flex:1;font-weight:600">${x.el.prenom} ${x.el.nom}</div>
                  <div style="color:var(--danger);font-weight:700">${x.moy}/20</div>
                </div>`).join('') : '<p style="color:var(--gray-500);font-size:.85rem;text-align:center;padding:.75rem 0">Pas encore de notes</p>'}
              </div>
            </div>
            <div class="card">
              <div class="card-header"><div class="card-title" style="color:var(--warning)">📚 Mes classes</div></div>
              <div class="card-body">
                ${classesProf.length ? classesProf.map(c => {
                  const nbEl = elevesProf.filter(e => e.classe_id === c.id).length;
                  return `<div style="display:flex;justify-content:space-between;align-items:center;padding:.35rem 0;border-bottom:1px solid var(--gray-200);font-size:.87rem">
                    <span class="chip" style="font-size:.78rem"><i class="fa-solid fa-chalkboard"></i> ${formatClasseLabel(c)}</span>
                    <span style="color:var(--gray-600)">${nbEl} élève(s)</span>
                  </div>`;
                }).join('') : '<p style="color:var(--gray-500);font-size:.85rem">Aucune classe assignée</p>'}
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><div class="card-title"><i class="fa-solid fa-bolt"></i> Actions rapides</div></div>
            <div class="card-body"><div style="display:flex;gap:.75rem;flex-wrap:wrap">
              <button class="btn btn-primary" onclick="App.navigateTo('bordereau')"><i class="fa-solid fa-table-list"></i> Bordereau de notes</button>
              <button class="btn btn-outline" onclick="App.navigateTo('notes')"><i class="fa-solid fa-pen-to-square"></i> Saisir des notes</button>
              <button class="btn btn-outline" onclick="App.navigateTo('eleves')"><i class="fa-solid fa-users"></i> Mes élèves</button>
            </div></div>
          </div>`);
        return;
      }

      // ─── ADMIN / COMPTABLE : Dashboard complet ────────────────────────────────
      const lastPays = await this._lastPaymentsHTML();
      setContent(`
        ${bannerHtml}
        <!-- STATS -->
        <div class="stat-grid">
          <div class="stat-card blue"><div class="stat-icon blue"><i class="fa-solid fa-user-graduate"></i></div><div class="stat-info"><div class="stat-value">${stats.totalEleves}</div><div class="stat-label">Élèves inscrits</div></div></div>
          <div class="stat-card purple"><div class="stat-icon purple"><i class="fa-solid fa-chalkboard"></i></div><div class="stat-info"><div class="stat-value">${stats.totalClasses}</div><div class="stat-label">Classes actives</div></div></div>
          ${showFin ? `
          <div class="stat-card green"><div class="stat-icon green"><i class="fa-solid fa-money-bill-wave"></i></div><div class="stat-info"><div class="stat-value">${money(stats.encaisseMois)}</div><div class="stat-label">Encaissé ce mois</div><div class="stat-sub">Aujourd'hui : ${money(stats.totalEncaisseAujourd)}</div></div></div>
          <div class="stat-card red"><div class="stat-icon red"><i class="fa-solid fa-receipt"></i></div><div class="stat-info"><div class="stat-value">${money(stats.depensesMois)}</div><div class="stat-label">Dépenses ce mois</div><div class="stat-sub">Bénéfice : ${money(stats.beneficeMois)}</div></div></div>` : ''}
        </div>

        <div style="display:grid;grid-template-columns:${showFin ? '1fr 1fr' : '1fr'};gap:1.25rem">
          ${showFin ? `
          <div class="card">
            <div class="card-header"><div class="card-title"><i class="fa-solid fa-chart-pie"></i> Statut Paiements</div></div>
            <div class="card-body">
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem;text-align:center;margin-bottom:1rem">
                <div style="padding:.75rem;background:#e8f5e9;border-radius:8px"><div style="font-size:1.4rem;font-weight:700;color:var(--secondary)">${stats.elevesSolde}</div><div style="font-size:.75rem;color:var(--gray-600)">Soldés</div></div>
                <div style="padding:.75rem;background:#fff8e1;border-radius:8px"><div style="font-size:1.4rem;font-weight:700;color:#f57c00">${stats.elevesEncours}</div><div style="font-size:.75rem;color:var(--gray-600)">En cours</div></div>
                <div style="padding:.75rem;background:#fce4ec;border-radius:8px"><div style="font-size:1.4rem;font-weight:700;color:var(--danger)">${stats.elevesAucun}</div><div style="font-size:.75rem;color:var(--gray-600)">Non payés</div></div>
              </div>
              ${stats.totalEleves > 0 ? `<div class="progress" style="height:12px"><div class="progress-bar green" style="width:${Math.round(stats.elevesSolde/stats.totalEleves*100)}%"></div></div>
              <div style="text-align:right;font-size:.75rem;color:var(--gray-500);margin-top:.3rem">${Math.round(stats.elevesSolde/stats.totalEleves*100)}% soldés</div>` : ''}
              <button class="btn btn-outline btn-sm" style="margin-top:1rem;width:100%" onclick="App.navigateTo('paiements')"><i class="fa-solid fa-arrow-right"></i> Voir les paiements</button>
            </div>
          </div>` : ''}
          <div class="card">
            <div class="card-header"><div class="card-title"><i class="fa-solid fa-clock-rotate-left"></i> Derniers paiements</div>
              ${showFin ? '<button class="btn btn-outline btn-sm" onclick="App.navigateTo(\'paiements\')">Voir tout</button>' : ''}
            </div>
            <div class="card-body" style="padding:0">${lastPays}</div>
          </div>
        </div>

        <!-- ACCÈS RAPIDES -->
        <div class="card" style="margin-top:1.25rem">
          <div class="card-header"><div class="card-title"><i class="fa-solid fa-bolt"></i> Actions rapides</div></div>
          <div class="card-body"><div style="display:flex;gap:.75rem;flex-wrap:wrap">
            ${showAcad && isAdmin ? `<button class="btn btn-primary" onclick="App.navigateTo('eleves')"><i class="fa-solid fa-user-plus"></i> Inscrire un élève</button>` : ''}
            ${showAcad && isAdmin ? `<button class="btn btn-outline" onclick="App.navigateTo('notes')"><i class="fa-solid fa-pen-to-square"></i> Saisir des notes</button>` : ''}
            ${showAcad ? `<button class="btn btn-outline" onclick="App.navigateTo('bulletins')"><i class="fa-solid fa-file-lines"></i> Voir les bulletins</button>` : ''}
            ${showFin ? `<button class="btn btn-success" onclick="Pages._openPaySearchModal()"><i class="fa-solid fa-money-bill-wave"></i> Encaisser un paiement</button>` : ''}
            ${showFin ? `<button class="btn btn-outline" onclick="App.navigateTo('rapports')"><i class="fa-solid fa-chart-bar"></i> Rapport financier</button>` : ''}
          </div></div>
        </div>`);
    } catch (err) {
      setContent(`<div class="empty-state"><i class="fa-solid fa-triangle-exclamation" style="color:var(--danger)"></i><h3>Erreur de chargement</h3><p>${err.message}</p><button class="btn btn-primary" onclick="Pages.dashboard()">Réessayer</button></div>`);
    }
  },

  /**
   * Charge et affiche le tableau des élèves en retard pour le dashboard directeur
   * Utilise DB.getNbMoisEnRetard() pour chaque élève (appelé en arrière-plan)
   */
  async _loadDirRetards(allEleves, allClasses) {
    const body = document.getElementById('dir-retards-body');
    const countBadge = document.getElementById('dir-retards-count');
    if (!body) return;
    try {
      const classesMap = Object.fromEntries(allClasses.map(c => [c.id, c]));
      // Filtrer les non-exonérés
      const elevesConcernes = allEleves.filter(e => e.type_scolarite !== 'exonere');

      // Calculer nb mois retard pour chaque élève en parallèle (max 50 à la fois)
      const retardsData = [];
      const batchSize = 20;
      for (let i = 0; i < elevesConcernes.length; i += batchSize) {
        const batch = elevesConcernes.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(async e => {
          const nb = await DB.getNbMoisEnRetard(e.id);
          return { eleve: e, nbRetard: nb };
        }));
        retardsData.push(...results);
      }

      // Filtrer uniquement ceux avec au moins 1 retard
      const enRetard = retardsData
        .filter(x => x.nbRetard > 0)
        .sort((a, b) => b.nbRetard - a.nbRetard);

      // Mettre à jour le badge
      if (countBadge) {
        if (enRetard.length === 0) {
          countBadge.textContent = '✅ Tous à jour';
          countBadge.className = 'badge badge-success';
        } else {
          countBadge.textContent = `${enRetard.length} élève(s) en retard`;
          countBadge.className = 'badge badge-danger';
        }
      }

      if (!enRetard.length) {
        body.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;padding:2rem;gap:.5rem;color:var(--secondary)">
            <i class="fa-solid fa-circle-check" style="font-size:2rem"></i>
            <strong>Aucun retard de paiement !</strong>
            <span style="font-size:.82rem;color:var(--gray-500)">Tous les élèves sont à jour.</span>
          </div>`;
        return;
      }

      // Couleur selon gravité
      const getColor = nb => nb >= 4 ? 'var(--danger)' : nb >= 2 ? '#f57c00' : '#f9a825';
      const getBg = nb => nb >= 4 ? '#fce4ec' : nb >= 2 ? '#fff3e0' : '#fffde7';

      let html = `<div class="table-wrapper"><table>
        <thead><tr>
          <th>Élève</th>
          <th>Classe</th>
          <th style="text-align:center">Tranches impayées</th>
          <th style="text-align:center">Gravité</th>
          <th></th>
        </tr></thead><tbody>`;

      enRetard.forEach(({ eleve, nbRetard }) => {
        const cls = classesMap[eleve.classe_id];
        const gravite = nbRetard >= 4 ? '🔴 Critique' : nbRetard >= 2 ? '🟠 Élevé' : '🟡 Modéré';
        html += `<tr>
          <td>
            <div style="font-weight:600">${eleve.prenom} ${eleve.nom}</div>
            <div style="font-size:.72rem;color:var(--gray-500)">${eleve.matricule || '—'}</div>
          </td>
          <td><span class="chip" style="font-size:.78rem">${cls ? formatClasseLabel(cls) : '—'}</span></td>
          <td style="text-align:center">
            <span style="font-weight:700;font-size:1.1rem;color:${getColor(nbRetard)};background:${getBg(nbRetard)};padding:.2rem .6rem;border-radius:999px">${nbRetard}</span>
          </td>
          <td style="text-align:center;font-size:.82rem">${gravite}</td>
          <td style="text-align:right">
            <button class="btn btn-outline btn-sm" onclick="App.navigateTo('paiements')" style="font-size:.75rem;padding:.25rem .6rem">
              <i class="fa-solid fa-money-bill-wave"></i> Paiements
            </button>
          </td>
        </tr>`;
      });

      html += '</tbody></table></div>';
      html += `<div style="padding:.6rem 1rem;font-size:.78rem;color:var(--gray-500);border-top:1px solid var(--gray-200)">
        🔴 Critique : 4+ tranches · 🟠 Élevé : 2–3 tranches · 🟡 Modéré : 1 tranche
      </div>`;
      body.innerHTML = html;
    } catch (err) {
      if (body) body.innerHTML = `<div style="padding:1rem;color:var(--danger);font-size:.85rem"><i class="fa-solid fa-triangle-exclamation"></i> Erreur de calcul : ${err.message}</div>`;
    }
  },

  async _lastPaymentsHTML() {
    try {
      const pays = (await DB.getAll('paiements')).filter(p => !p.annule).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6);
      if (!pays.length) return '<p class="table-empty" style="padding:2rem;text-align:center"><i class="fa-solid fa-inbox"></i> Aucun paiement</p>';
      const eleves = await DB.getAll('eleves');
      const elevesMap = Object.fromEntries(eleves.map(e => [e.id, e]));
      let html = '<div class="table-wrapper"><table><thead><tr><th>Élève</th><th>Montant</th><th>Date</th><th>Mode</th></tr></thead><tbody>';
      pays.forEach(p => {
        const e = elevesMap[p.eleve_id];
        html += `<tr><td><strong>${e ? e.prenom + ' ' + e.nom : '—'}</strong></td><td><strong style="color:var(--secondary)">${money(p.montant)}</strong></td><td>${Fmt.datetime(p.date_paiement || p.created_at)}</td><td><span class="chip">${p.mode_paiement || 'Espèces'}</span></td></tr>`;
      });
      return html + '</tbody></table></div>';
    } catch { return '<p style="padding:1rem;color:var(--gray-500)">Impossible de charger</p>'; }
  },

  // ══════════════════════════════════════════════════════════════════
  // CLASSES
  // ══════════════════════════════════════════════════════════════════
  async classes() {
    setLoading();
    try {
      const classesRaw = await DB.getAll('classes');
      const classes = sortClasses(classesRaw); // tri hiérarchique
      await getDevise();
      setContent(`
        <div class="page-header">
          <div class="page-header-left">
            <h2><i class="fa-solid fa-chalkboard" style="color:var(--primary)"></i> Classes</h2>
            <p>${classes.length} classe(s) enregistrée(s)${App.currentUser?.role==='directeur' ? ' — lecture seule' : ''}</p>
          </div>
          ${App.currentUser?.role !== 'directeur' ? `<button class="btn btn-primary" onclick="Pages._openClassModal()"><i class="fa-solid fa-plus"></i> Nouvelle classe</button>` : ''}
        </div>

        ${!classes.length ? `
        <div class="card">
          <div class="card-body">
            <div class="empty-state">
              <i class="fa-solid fa-chalkboard"></i>
              <h3>Aucune classe créée</h3>
              <p>Commencez par créer vos classes (CP, CE1, 4ème…)</p>
              ${App.currentUser?.role !== 'directeur' ? `<button class="btn btn-primary" style="margin-top:1rem" onclick="Pages._openClassModal()"><i class="fa-solid fa-plus"></i> Créer la première classe</button>` : ''}
            </div>
          </div>
        </div>` : `
        <div class="card">
          <div class="card-body" style="padding:0">
            <div class="table-wrapper">
              <table>
                <thead><tr><th>Nom</th><th>Niveau</th><th>Type</th><th>Élèves</th><th>Scolarité</th><th>Actions</th></tr></thead>
                <tbody id="classes-tbody">${this._buildClassesRows(classes)}</tbody>
              </table>
            </div>
          </div>
        </div>`}
      `);
    } catch (err) {
      setContent(`<div class="empty-state"><i class="fa-solid fa-triangle-exclamation" style="color:var(--danger)"></i><h3>Erreur</h3><p>${err.message}</p><button class="btn btn-primary" onclick="Pages.classes()">Réessayer</button></div>`);
    }
  },

  _buildClassesRows(classes) {
    const configs = DB._cache['config_scolarite:all:500'] || [];
    return classes.map(c => {
      const eleves = (DB._cache['eleves:all:500'] || []).filter(e => e.classe_id === c.id);
      const cfg = configs.find(sc => sc.niveau === c.niveau);
      const type = DB.isPrimaire(c.niveau) ? '<span class="badge badge-info">Primaire</span>' : '<span class="badge badge-purple">Collège</span>';
      return `<tr>
        <td><strong>${formatClasseLabel(c)}</strong></td>
        <td><span class="chip">${c.niveau}</span></td>
        <td>${type}</td>
        <td><span class="badge badge-info">${eleves.length}</span></td>
        <td>${money(cfg?.montant_annuel || 0)}</td>
        <td><div style="display:flex;gap:.4rem">
          ${App.currentUser?.role !== 'directeur' ? `
          <button class="btn-icon" title="Modifier" onclick="Pages._openClassModal('${c.id}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon" title="Supprimer" onclick="Pages._deleteClass('${c.id}')" style="color:var(--danger)"><i class="fa-solid fa-trash"></i></button>
          ` : '<span style="color:var(--gray-500);font-size:.8rem">—</span>'}
        </div></td>
      </tr>`;
    }).join('');
  },

  _openClassModal(id = null) {
    const c = id ? (DB._cache['classes:all:500'] || []).find(x => x.id === id) : null;
    const niveaux = [
      {k:'1ere',l:'1ère Année'},{k:'2eme',l:'2ème Année'},{k:'3eme',l:'3ème Année'},{k:'4eme',l:'4ème Année'},
      {k:'5eme',l:'5ème Année'},{k:'6eme',l:'6ème Année (CM2)'},{k:'7eme',l:'7ème Année (Collège)'},
      {k:'8eme',l:'8ème Année'},{k:'9eme',l:'9ème Année'},{k:'10eme',l:'10ème Année'}
    ];
    const opts = niveaux.map(n => `<option value="${n.k}" ${c?.niveau===n.k?'selected':''}>${n.l}</option>`).join('');

    if (id) {
      // Mode modification : formulaire simple
      Modal.open('✏️ Modifier la classe', `
        <div class="form-group">
          <label class="form-label">Nom de la classe <span style="color:red">*</span></label>
          <input class="form-control" id="cls-nom" placeholder="Ex: CP-A, 4ème B, CE1…" value="${c?.nom||''}">
          <div class="form-text">Exemples : CP, CE1, CM1, 7ème A, 10ème B</div>
        </div>
        <div class="form-group">
          <label class="form-label">Niveau <span style="color:red">*</span></label>
          <select class="form-control" id="cls-niveau"><option value="">— Choisir le niveau —</option>${opts}</select>
        </div>
        <div id="cls-type-info" style="font-size:.82rem;color:var(--primary);padding:.5rem;background:var(--primary-light);border-radius:6px;display:none"></div>
      `, `
        <button class="btn btn-outline" onclick="Modal.close()">Annuler</button>
        <button class="btn btn-primary" id="save-cls-btn" onclick="Pages._saveClass('${id}')"><i class="fa-solid fa-save"></i> Enregistrer</button>
      `);
    } else {
      // Mode création : MULTI-CLASSES en masse
      Modal.open('➕ Créer des classes en masse', `
        <div style="background:var(--primary-light);border-radius:8px;padding:.75rem;margin-bottom:1rem;font-size:.84rem;color:var(--primary-dark)">
          <i class="fa-solid fa-circle-info"></i> Entrez plusieurs noms de classes séparés par des <strong>virgules</strong> ou des <strong>sauts de ligne</strong>. Ex : <em>CP-A, CP-B, CE1, CM1</em>
        </div>
        <div class="form-group">
          <label class="form-label">Noms des classes (un par ligne ou séparés par virgule) <span style="color:red">*</span></label>
          <textarea class="form-control" id="cls-noms" rows="4" placeholder="CP-A&#10;CP-B&#10;CE1&#10;CM1-A, CM1-B&#10;7ème A, 7ème B"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Niveau par défaut <span style="color:red">*</span></label>
          <select class="form-control" id="cls-niveau"><option value="">— Choisir le niveau —</option>${opts}</select>
          <div class="form-text">Vous pourrez modifier le niveau de chaque classe individuellement après création.</div>
        </div>
        <div id="cls-type-info" style="font-size:.82rem;color:var(--primary);padding:.5rem;background:var(--primary-light);border-radius:6px;display:none"></div>
        <div id="cls-preview" style="margin-top:.5rem"></div>
      `, `
        <button class="btn btn-outline" onclick="Modal.close()">Annuler</button>
        <button class="btn btn-primary" id="save-cls-btn" onclick="Pages._saveClass('')"><i class="fa-solid fa-plus"></i> Créer toutes les classes</button>
      `, 'modal-lg');
      // Prévisualisation en temps réel
      document.getElementById('cls-noms')?.addEventListener('input', Pages._previewClassesBulk);
    }

    document.getElementById('cls-niveau')?.addEventListener('change', function() {
      const info = document.getElementById('cls-type-info');
      if (!this.value) { info.style.display='none'; return; }
      info.style.display='block';
      if (DB.isPrimaire(this.value)) info.textContent = '🏫 Classe Primaire : un enseignant titulaire sera assigné à toute la classe.';
      else info.textContent = '🎓 Classe Collège : les enseignants seront liés à des matières spécifiques.';
    });
  },

  _previewClassesBulk() {
    const raw = document.getElementById('cls-noms')?.value || '';
    const noms = raw.split(/[\n,]/).map(n => n.trim()).filter(n => n);
    const prev = document.getElementById('cls-preview');
    if (!prev) return;
    if (!noms.length) { prev.innerHTML = ''; return; }
    prev.innerHTML = `<div style="font-size:.83rem;color:var(--gray-600);margin-top:.3rem">
      <strong>${noms.length} classe(s) à créer :</strong>
      <div style="display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.3rem">
        ${noms.map(n => `<span class="chip" style="background:var(--primary-light);color:var(--primary)">${n}</span>`).join('')}
      </div>
    </div>`;
  },

  async _saveClass(id) {
    const btn = document.getElementById('save-cls-btn');
    if (btn && !Debounce.btn(btn, 5000)) return; // anti-double-clic

    try {
      if (id) {
        // Modification
        const nom = document.getElementById('cls-nom').value.trim();
        const niveau = document.getElementById('cls-niveau').value;
        if (!nom) { Toast.error('Le nom est obligatoire.'); Debounce.release(btn, '<i class="fa-solid fa-save"></i> Enregistrer'); return; }
        if (!niveau) { Toast.error('Le niveau est obligatoire.'); Debounce.release(btn, '<i class="fa-solid fa-save"></i> Enregistrer'); return; }
        await DB.update('classes', id, {nom, niveau});
        Toast.success('Classe modifiée !');
      } else {
        // Création en masse
        const raw = document.getElementById('cls-noms')?.value || '';
        const niveau = document.getElementById('cls-niveau').value;
        const noms = raw.split(/[\n,]/).map(n => n.trim()).filter(n => n);
        if (!noms.length) { Toast.error('Entrez au moins un nom de classe.'); Debounce.release(btn, '<i class="fa-solid fa-plus"></i> Créer toutes les classes'); return; }
        if (!niveau) { Toast.error('Le niveau est obligatoire.'); Debounce.release(btn, '<i class="fa-solid fa-plus"></i> Créer toutes les classes'); return; }
        let created = 0;
        for (const nom of noms) {
          await DB.insert('classes', {nom, niveau});
          created++;
        }
        Toast.success(`✅ ${created} classe(s) créée(s) !`);
      }
      Modal.close(); Pages.classes();
    } catch (err) {
      Toast.error('Erreur : ' + err.message);
      Debounce.release(btn, id ? '<i class="fa-solid fa-save"></i> Enregistrer' : '<i class="fa-solid fa-plus"></i> Créer toutes les classes');
    }
  },

  async _deleteClass(id) {
    if (!confirm('Supprimer cette classe ? Les élèves associés ne seront pas supprimés.')) return;
    await DB.delete('classes', id); Toast.success('Classe supprimée.'); Pages.classes();
  },

  // ══════════════════════════════════════════════════════════════════
  // ÉLÈVES
  // ══════════════════════════════════════════════════════════════════
  async eleves() {
    setLoading('Chargement des élèves…');
    try {
      const role = App.currentUser?.role;
      const isProf = role === 'prof';
      const isDirecteur = role === 'directeur';
      const readOnly = isProf || isDirecteur;

      let eleves = await DB.getAll('eleves');
      const classes = await DB.getAll('classes');
      await getDevise();

      // Bloc 4 : Prof ne voit que ses élèves
      if (isProf) {
        const classesProf = await DB.getClassesProf(App.currentUser);
        const classeIds = classesProf.map(c => c.id);
        eleves = eleves.filter(e => classeIds.includes(e.classe_id));
      }

      const classesMap = Object.fromEntries(classes.map(c => [c.id, c]));
      const classesSorted = sortClasses(classes); // tri hiérarchique pour les filtres

      // Colonnes et actions selon le rôle
      const colStatutLabel = isDirecteur ? 'Statut administratif' : 'Statut paiement';
      const showActionBtns = !readOnly;

      // Filtres pour le directeur : inclure filtre par statut (Bloc 6)
      const filterStatutOptions = isDirecteur
        ? `<option value="">Tous statuts</option><option value="solde">🟢 À jour</option><option value="retard">🔴 Retard</option><option value="encours">🟡 En cours</option><option value="exonere">🔵 Exonéré</option>`
        : `<option value="">Tous statuts</option><option value="solde">Soldés</option><option value="encours">En cours</option><option value="aucun">Non payés</option><option value="exonere">Exonérés</option>`;

      setContent(`
        <div class="page-header">
          <div class="page-header-left">
            <h2><i class="fa-solid fa-user-graduate" style="color:var(--primary)"></i> Élèves</h2>
            <p>${eleves.length} élève(s)${isProf ? ' — vos classes uniquement' : isDirecteur ? ' — lecture seule' : ''}</p>
          </div>
          <div style="display:flex;gap:.6rem;flex-wrap:wrap">
            ${!readOnly ? `
              <button class="btn btn-primary" onclick="Pages._openEleveModal()"><i class="fa-solid fa-user-plus"></i> Inscrire un élève</button>
              <button class="btn btn-outline" onclick="Pages._showImportCSV()"><i class="fa-solid fa-file-csv"></i> Importer CSV/Excel</button>
            ` : ''}
            ${!isProf ? `
              <button class="btn btn-outline btn-sm" onclick="Pages._exportEleves()" title="Export Excel .xlsx">
                <i class="fa-solid fa-file-excel" style="color:#217346"></i> Excel
              </button>
              <button class="btn btn-outline btn-sm" onclick="Pages._printListeEleves()" title="Imprimer la liste en PDF">
                <i class="fa-solid fa-print"></i> PDF
              </button>
            ` : ''}
          </div>
        </div>

        ${!eleves.length ? `
        <div class="card"><div class="card-body">
          <div class="empty-state">
            <i class="fa-solid fa-user-graduate"></i>
            <h3>Aucun élève trouvé</h3>
            <p>${isProf ? 'Aucun élève dans vos classes assignées.' : 'Inscrivez votre premier élève manuellement ou importez une liste CSV.'}</p>
            ${!readOnly ? `<div style="display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap;margin-top:1.25rem">
              <button class="btn btn-primary" onclick="Pages._openEleveModal()"><i class="fa-solid fa-user-plus"></i> Inscrire manuellement</button>
              <button class="btn btn-outline" onclick="Pages._showImportCSV()"><i class="fa-solid fa-file-csv"></i> Importer un fichier CSV</button>
            </div>` : ''}
          </div>
        </div></div>` : `
        <div class="card">
          <div class="card-header" style="flex-wrap:wrap;gap:.75rem">
            <div class="search-bar" style="min-width:220px;flex:1">
              <i class="fa-solid fa-search"></i>
              <input type="search" id="search-eleve" placeholder="Rechercher par nom, prénom, matricule…" oninput="Pages._filterEleves()">
            </div>
            <div style="display:flex;gap:.5rem;flex-wrap:wrap">
              <select class="form-control" style="width:auto" id="filter-classe" onchange="Pages._filterEleves()">
                <option value="">Toutes les classes</option>
                ${classesSorted.map(c => `<option value="${c.id}">${formatClasseLabel(c)}</option>`).join('')}
              </select>
              <select class="form-control" style="width:auto" id="filter-statut" onchange="Pages._filterEleves()">
                ${filterStatutOptions}
              </select>
            </div>
          </div>
          <div class="card-body" style="padding:0">
            <div class="table-wrapper">
              <table>
                <thead><tr>
                  <th>Matricule</th><th>Nom Prénom</th><th>Naissance</th><th>Classe</th>
                  ${isProf ? '<th>Contact Parent</th>' : ''}
                  <th>${colStatutLabel}</th>
                  ${showActionBtns || isProf ? '<th>Actions</th>' : ''}
                </tr></thead>
                <tbody id="eleves-tbody">${this._buildElevesRows(eleves, classesMap)}</tbody>
              </table>
            </div>
          </div>
        </div>`}
      `);
      // Stocker pour filtrage rapide
      this._elevesCache = eleves;
      this._classesMapCache = classesMap;
    } catch (err) {
      setContent(`<div class="empty-state"><i class="fa-solid fa-triangle-exclamation" style="color:var(--danger)"></i><h3>Erreur</h3><p>${err.message}</p><button class="btn btn-primary" onclick="Pages.eleves()">Réessayer</button></div>`);
    }
  },

  _buildElevesRows(eleves, classesMap) {
    const role = App.currentUser?.role;
    const isProf = role === 'prof';
    const isDirecteur = role === 'directeur';
    const colCount = isProf ? 7 : (isDirecteur ? 6 : 6);

    if (!eleves.length) return `<tr><td colspan="${colCount}" class="table-empty"><i class="fa-solid fa-user-graduate"></i> Aucun élève trouvé</td></tr>`;

    const allPay = DB._cache['paiements:all:500'] || [];
    const configsSco = DB._cache['config_scolarite:all:500'] || [];
    const paiementsMap = {};
    allPay.filter(p => !p.annule).forEach(p => { if (!paiementsMap[p.eleve_id]) paiementsMap[p.eleve_id] = []; paiementsMap[p.eleve_id].push(p); });
    const elevesMap = Object.fromEntries(eleves.map(e => [e.id, e]));

    return eleves.map(e => {
      const cls = classesMap[e.classe_id];
      const statut = DB.getStatutPaiementSync(e.id, elevesMap, classesMap, configsSco, paiementsMap);

      // Badge selon le rôle
      let statutCell = '';
      if (isDirecteur) {
        // Bloc 6 : Directeur voit badges colorés SANS montants
        statutCell = Fmt.statutBadgeDirecteur(statut, 0);
      } else {
        statutCell = Fmt.statutBadge(statut);
      }

      // Alerte paiement discrète pour prof (Bloc 4) — sans montants
      const alertePaiement = isProf && (statut === 'aucun' || statut === 'retard')
        ? `<span title="Retard de paiement signalé — invitez le parent à passer à l'administration" style="color:var(--warning);font-size:.8rem;margin-left:.3rem"><i class="fa-solid fa-triangle-exclamation"></i></span>`
        : '';

      return `<tr>
        <td><code style="background:var(--gray-100);padding:.15rem .5rem;border-radius:4px;font-size:.78rem">${e.matricule}</code></td>
        <td><div style="font-weight:600">${e.prenom} ${e.nom}</div>
          <div style="font-size:.73rem;color:var(--gray-500)">${e.sexe==='M'?'♂':e.sexe==='F'?'♀':''} ${e.nom_parent ? '— Parent: '+e.nom_parent : ''}</div>
          ${e.type_scolarite==='exonere' ? '<span class="badge badge-exonere" style="font-size:.7rem;margin-top:.2rem">🔵 Exonéré</span>' : ''}
        </td>
        <td>${Fmt.date(e.date_naissance)}</td>
        <td>${cls ? `<span class="chip"><i class="fa-solid fa-chalkboard"></i> ${formatClasseLabel(cls)}</span>` : '<span class="badge badge-gray">—</span>'}</td>
        ${isProf ? `<td style="font-size:.82rem">${e.contact_parent||'—'}${alertePaiement}</td>` : ''}
        <td>${statutCell}</td>
        ${!isDirecteur ? `<td><div style="display:flex;gap:.35rem">
          ${!isProf && role !== 'comptable' ? `<button class="btn-icon" title="Enregistrer un paiement" onclick="Pages._quickPayEleve('${e.id}')" style="color:var(--secondary)"><i class="fa-solid fa-money-bill"></i></button>` : ''}
          ${role === 'comptable' ? `<button class="btn-icon" title="Enregistrer un paiement" onclick="Pages._quickPayEleve('${e.id}')" style="color:var(--secondary)"><i class="fa-solid fa-money-bill"></i></button>` : ''}
          ${(role === 'admin') ? `<button class="btn-icon" title="Modifier la fiche" onclick="Pages._openEleveModal('${e.id}')"><i class="fa-solid fa-pen"></i></button>` : ''}
          ${(role === 'admin') ? `<button class="btn-icon" title="Supprimer" onclick="Pages._deleteEleve('${e.id}')" style="color:var(--danger)"><i class="fa-solid fa-trash"></i></button>` : ''}
          ${(role === 'comptable') ? `<button class="btn-icon btn-sm" title="Voir le dossier" onclick="Pages._viewEleveCard('${e.id}')"><i class="fa-solid fa-eye"></i></button>` : ''}
          ${isProf ? `<button class="btn-icon btn-sm" title="Voir le dossier" onclick="Pages._viewEleveCard('${e.id}')"><i class="fa-solid fa-eye"></i></button>` : ''}
        </div></td>` : ''}
      </tr>`;
    }).join('');
  },

  async _filterEleves() {
    const txt = document.getElementById('search-eleve')?.value?.toLowerCase() || '';
    const classeId = document.getElementById('filter-classe')?.value || '';
    const statutF = document.getElementById('filter-statut')?.value || '';
    let list = this._elevesCache || [];
    if (txt) list = list.filter(e => (`${e.prenom} ${e.nom} ${e.matricule}`).toLowerCase().includes(txt));
    if (classeId) list = list.filter(e => e.classe_id === classeId);
    if (statutF) {
      const configsSco = DB._cache['config_scolarite:all:500'] || [];
      const allPay = DB._cache['paiements:all:500'] || [];
      const pMap = {};
      allPay.filter(p => !p.annule).forEach(p => { if (!pMap[p.eleve_id]) pMap[p.eleve_id] = []; pMap[p.eleve_id].push(p); });
      const eMap = Object.fromEntries((this._elevesCache||[]).map(e=>[e.id,e]));
      const cMap = this._classesMapCache || {};
      list = list.filter(e => DB.getStatutPaiementSync(e.id, eMap, cMap, configsSco, pMap) === statutF);
    }
    document.getElementById('eleves-tbody').innerHTML = this._buildElevesRows(list, this._classesMapCache || {});
  },

  // Fiche consultation élève pour le prof (lecture seule — Bloc 4)
  async _viewEleveCard(eleveId) {
    const eleve = await DB.getById('eleves', eleveId);
    if (!eleve) return;
    const cls = await DB.getById('classes', eleve.classe_id);
    // Statut paiement discret (sans montant)
    const statut = await DB.getStatutPaiement(eleveId);
    const alertMsg = (statut === 'aucun' || statut === 'retard')
      ? `<div style="background:#fff8e1;border:1px solid var(--warning);border-radius:8px;padding:.75rem;margin-top:.75rem;font-size:.85rem"><i class="fa-solid fa-triangle-exclamation" style="color:var(--warning)"></i> <strong>Information administrative :</strong> Un retard de paiement a été signalé. Invitez le parent à passer au bureau du comptable.</div>`
      : `<div style="background:#e8f5e9;border:1px solid var(--secondary);border-radius:8px;padding:.75rem;margin-top:.75rem;font-size:.85rem"><i class="fa-solid fa-circle-check" style="color:var(--secondary)"></i> <strong>Situation administrative :</strong> Élève à jour.</div>`;

    Modal.open(`👤 Fiche de ${eleve.prenom} ${eleve.nom}`, `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
        <div>
          <div class="form-group"><label class="form-label" style="font-size:.75rem">Matricule</label><div style="font-weight:600;font-family:monospace">${eleve.matricule}</div></div>
          <div class="form-group"><label class="form-label" style="font-size:.75rem">Nom complet</label><div style="font-weight:600">${eleve.prenom} ${eleve.nom}</div></div>
          <div class="form-group"><label class="form-label" style="font-size:.75rem">Classe</label><div>${cls ? formatClasseLabel(cls) : '—'}</div></div>
          <div class="form-group"><label class="form-label" style="font-size:.75rem">Date de naissance</label><div>${Fmt.date(eleve.date_naissance)}</div></div>
        </div>
        <div>
          <div class="form-group"><label class="form-label" style="font-size:.75rem">Sexe</label><div>${eleve.sexe === 'M' ? '♂ Masculin' : '♀ Féminin'}</div></div>
          <div class="form-group"><label class="form-label" style="font-size:.75rem">Nom du parent / Tuteur</label><div style="font-weight:600">${eleve.nom_parent||'—'}</div></div>
          <div class="form-group"><label class="form-label" style="font-size:.75rem">Contact parent</label><div style="font-size:1rem;color:var(--primary)"><i class="fa-solid fa-phone"></i> ${eleve.contact_parent||'Non renseigné'}</div></div>
        </div>
      </div>
      ${alertMsg}
    `, `<button class="btn btn-outline" onclick="Modal.close()">Fermer</button>`);
  },

  async _openEleveModal(id = null) {
    const classes = await DB.getAll('classes');
    const e = id ? await DB.getById('eleves', id) : null;
    const cfg = await DB.getEcoleConfig();
    Modal.open(id ? 'Modifier l\'élève' : '➕ Inscrire un nouvel élève', `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Prénom <span style="color:red">*</span></label><input class="form-control" id="el-prenom" value="${e?.prenom||''}" placeholder="Prénom de l'élève"></div>
        <div class="form-group"><label class="form-label">Nom <span style="color:red">*</span></label><input class="form-control" id="el-nom" value="${e?.nom||''}" placeholder="Nom de famille"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Date de naissance</label><input type="date" class="form-control" id="el-naissance" value="${e?.date_naissance||''}"></div>
        <div class="form-group"><label class="form-label">Sexe</label>
          <select class="form-control" id="el-sexe">
            <option value="M" ${e?.sexe==='M'||!e?'selected':''}>Masculin</option>
            <option value="F" ${e?.sexe==='F'?'selected':''}>Féminin</option>
          </select>
        </div>
      </div>
      <div class="form-group"><label class="form-label">Classe <span style="color:red">*</span></label>
        ${buildClassesSelect(classes, e?.classe_id||'', 'id="el-classe"')}
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nom du parent / Tuteur</label><input class="form-control" id="el-parent" value="${e?.nom_parent||''}" placeholder="Nom complet"></div>
        <div class="form-group"><label class="form-label">Contact parent</label><input class="form-control" id="el-contact" placeholder="+237…" value="${e?.contact_parent||''}"></div>
      </div>
      ${(() => {
        // Restrictions Comptable : ne peut PAS exonérer (réservé admin/directeur)
        const role = App.currentUser?.role;
        const canExonerate = role === 'admin' || role === 'directeur';
        if (!canExonerate) {
          // Comptable/prof : affiche uniquement le type actuel, pas de modification
          const typeLabel = e?.type_scolarite === 'exonere'
            ? '<span class="badge badge-exonere">🔵 Exonéré (réservé à la direction)</span>'
            : '<span class="badge badge-info">Standard</span>';
          return `<div class="form-group"><label class="form-label">Type de scolarité</label><div style="padding:.4rem 0">${typeLabel}<div style="font-size:.75rem;color:var(--gray-500);margin-top:.3rem"><i class="fa-solid fa-lock"></i> Seuls le directeur et l'administrateur peuvent modifier l'exonération.</div></div></div>`;
        }
        return `<div class="form-group">
        <label class="form-label">Type de scolarité <span style="font-size:.75rem;color:var(--gray-500)">(Directeur/Admin seulement)</span></label>
        <div style="display:flex;gap:1rem;margin-top:.3rem">
          <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;padding:.5rem .9rem;border-radius:8px;border:2px solid var(--gray-300);flex:1;transition:var(--transition)" id="lbl-standard">
            <input type="radio" name="el-type-sco" id="el-sco-standard" value="standard" ${(!e||e.type_scolarite!=='exonere')?'checked':''} onchange="Pages._onTypeScoChange()" style="accent-color:var(--primary)">
            <div><strong>Standard</strong><div style="font-size:.75rem;color:var(--gray-600)">Scolarité normale, sujet aux paiements</div></div>
          </label>
          <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;padding:.5rem .9rem;border-radius:8px;border:2px solid var(--gray-300);flex:1;transition:var(--transition)" id="lbl-exonere">
            <input type="radio" name="el-type-sco" id="el-sco-exonere" value="exonere" ${e?.type_scolarite==='exonere'?'checked':''} onchange="Pages._onTypeScoChange()" style="accent-color:#1565c0">
            <div><strong>🔵 Exonéré</strong><div style="font-size:.75rem;color:var(--gray-600)">Enfant du personnel — Scolarité gratuite</div></div>
          </label>
        </div>
      </div>`;
      })()}
      ${id ? `<div class="form-group"><label class="form-label">Matricule (auto-généré)</label><input class="form-control" value="${e.matricule}" disabled></div>` : `<div style="padding:.6rem;background:var(--primary-light);border-radius:6px;font-size:.82rem;color:var(--primary)"><i class="fa-solid fa-circle-info"></i> Le matricule sera généré automatiquement à l'enregistrement.</div>`}
    `, `
      <button class="btn btn-outline" onclick="Modal.close()">Annuler</button>
      <button class="btn btn-primary" id="save-eleve-btn" onclick="Pages._saveEleve('${id||''}')"><i class="fa-solid fa-save"></i> Enregistrer</button>
    `);
  },

  _onTypeScoChange() {
    const isExonere = document.getElementById('el-sco-exonere')?.checked;
    const lblStd = document.getElementById('lbl-standard');
    const lblExo = document.getElementById('lbl-exonere');
    if (lblStd) lblStd.style.borderColor = isExonere ? 'var(--gray-300)' : 'var(--primary)';
    if (lblExo) lblExo.style.borderColor = isExonere ? '#1565c0' : 'var(--gray-300)';
  },

  async _saveEleve(id) {
    // Garde-fou : le comptable ne peut pas modifier/créer des élèves
    if (App.currentUser?.role === 'comptable') {
      Toast.error('⛔ Accès refusé : le comptable ne peut pas modifier les fiches élèves.');
      return;
    }
    const prenom = document.getElementById('el-prenom').value.trim();
    const nom = document.getElementById('el-nom').value.trim();
    const classe_id = document.getElementById('el-classe').value;
    if (!prenom || !nom) { Toast.error('Prénom et nom sont obligatoires.'); return; }
    if (!classe_id) { Toast.error('Veuillez choisir une classe.'); return; }
    const btn = document.getElementById('save-eleve-btn');
    if (!Debounce.btn(btn, 6000)) return; // anti-double-clic
    try {
      const role = App.currentUser?.role;
      const canExonerate = role === 'admin' || role === 'directeur';
      // Type de scolarité : seuls admin/directeur peuvent définir exonéré
      const typeSco = canExonerate && document.getElementById('el-sco-exonere')?.checked ? 'exonere' : 'standard';

      const data = {
        prenom, nom, classe_id,
        date_naissance: document.getElementById('el-naissance').value,
        sexe: document.getElementById('el-sexe').value,
        nom_parent: document.getElementById('el-parent').value.trim(),
        contact_parent: document.getElementById('el-contact').value.trim(),
        type_scolarite: typeSco
      };
      if (id) {
        // Conserver le type_scolarite existant si l'utilisateur ne peut pas le modifier
        if (!canExonerate) {
          const existing = await DB.getById('eleves', id);
          data.type_scolarite = existing?.type_scolarite || 'standard';
        }
        await DB.update('eleves', id, data); Toast.success('Élève mis à jour !');
      } else {
        const cfg = await DB.getEcoleConfig();
        // Générer matricule unique
        const eleves = await DB.getAll('eleves');
        const num = String(eleves.length + 1).padStart(3, '0');
        const year = new Date().getFullYear().toString().substr(2);
        data.matricule = `${cfg?.matricule_prefix || 'INJ'}-MAT-${year}${num}`;
        await DB.insert('eleves', data);
        Toast.success(`Élève inscrit ! Matricule : ${data.matricule}`);
      }
      Modal.close(); Pages.eleves();
    } catch (err) {
      Toast.error('Erreur : ' + err.message);
      Debounce.release(btn, '<i class="fa-solid fa-save"></i> Enregistrer');
    }
  },

  async _deleteEleve(id) {
    // Restriction : seuls admin et directeur peuvent supprimer un élève
    const role = App.currentUser?.role;
    if (role === 'comptable') {
      Toast.error('⛔ Le comptable ne peut pas supprimer un élève. Contactez le directeur.');
      return;
    }
    const e = await DB.getById('eleves', id);
    if (!confirm(`Supprimer ${e?.prenom} ${e?.nom} ? Ses notes et paiements seront aussi supprimés.`)) return;
    try {
      await DB.delete('eleves', id);
      const notes = await DB.query('notes', n => n.eleve_id === id);
      for (const n of notes) await DB.delete('notes', n.id);
      const pays = await DB.query('paiements', p => p.eleve_id === id);
      for (const p of pays) await DB.delete('paiements', p.id);
      Toast.success('Élève supprimé.'); Pages.eleves();
    } catch (err) { Toast.error('Erreur : ' + err.message); }
  },

  // ── IMPORT CSV ÉLÈVES ──────────────────────────────────────────
  async _showImportCSV() {
    const classes = await DB.getAll('classes');
    Modal.open('📥 Importer une liste d\'élèves (CSV/Excel)', `
      <div style="background:var(--primary-light);border-radius:8px;padding:1rem;margin-bottom:1rem;font-size:.85rem">
        <strong><i class="fa-solid fa-circle-info"></i> Format attendu :</strong><br>
        Le fichier CSV doit avoir ces colonnes dans l'ordre :<br>
        <code style="background:white;padding:.2rem .4rem;border-radius:4px;display:inline-block;margin-top:.4rem">Prénom ; Nom ; Date_Naissance (YYYY-MM-DD) ; Sexe (M/F) ; Nom_Parent ; Contact_Parent</code><br>
        <button class="btn btn-outline btn-sm" style="margin-top:.6rem" onclick="Pages._downloadCSVTemplate()"><i class="fa-solid fa-download"></i> Télécharger le modèle</button>
      </div>
      <div class="form-group">
        <label class="form-label">Classe de destination <span style="color:red">*</span></label>
        ${buildClassesSelect(classes, '', 'id="import-classe"')}
      </div>
      <div class="form-group">
        <label class="form-label">Fichier CSV ou Excel <span style="color:red">*</span></label>
        <input type="file" class="form-control" id="import-file" accept=".csv,.xlsx,.xls">
        <div class="form-text">Séparateur : point-virgule (;) ou virgule (,). Encodage UTF-8.</div>
      </div>
      <div id="import-preview"></div>
    `, `
      <button class="btn btn-outline" onclick="Modal.close()">Annuler</button>
      <button class="btn btn-primary" onclick="Pages._previewImportCSV()"><i class="fa-solid fa-eye"></i> Prévisualiser</button>
      <button class="btn btn-success" id="import-confirm-btn" style="display:none" onclick="Pages._executeImportCSV()"><i class="fa-solid fa-upload"></i> Importer</button>
    `, 'modal-lg');
    document.getElementById('import-file')?.addEventListener('change', () => Pages._previewImportCSV());
  },

  _downloadCSVTemplate() {
    // Fix 2 — Export modèle en .xlsx au lieu de .csv
    Export.toXLSX(['Prénom','Nom','Date_Naissance','Sexe','Nom_Parent','Contact_Parent'], [
      ['Jean','Dupont','2010-05-15','M','Pierre Dupont','+237 6xx xx xx xx'],
      ['Marie','Nguema','2011-03-22','F','Cécile Nguema','+237 6xx xx xx xx']
    ], 'modele-import-eleves.xlsx');
  },

  _previewImportCSV() {
    const file = document.getElementById('import-file')?.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      let text = e.target.result;
      // Retirer le BOM UTF-8 si présent
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      // Normaliser les fins de ligne (Windows \r\n → \n)
      text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const allLines = text.split('\n');
      // Conserver les lignes non vides (y compris celles avec uniquement des séparateurs, pas les vraiment vides)
      const lines = allLines.filter(l => l.trim());
      if (lines.length < 2) { document.getElementById('import-preview').innerHTML = '<p style="color:var(--danger)">Fichier vide ou invalide (moins de 2 lignes).</p>'; return; }

      // Détecter le séparateur : point-virgule ou virgule
      const headerLine = lines[0];
      const sep = headerLine.includes(';') ? ';' : ',';

      // Parser chaque ligne en tenant compte des guillemets
      const parseCSVLine = (line) => {
        const result = [];
        let inQuote = false, cur = '';
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQuote && line[i+1] === '"') { cur += '"'; i++; } // guillemet échappé
            else inQuote = !inQuote;
          } else if (ch === sep && !inQuote) {
            result.push(cur.trim()); cur = '';
          } else cur += ch;
        }
        result.push(cur.trim());
        return result;
      };

      const rows = lines.slice(1).map(l => parseCSVLine(l));
      // Filtrer les lignes complètement vides
      const validRows = rows.filter(r => r.some(v => v.trim() !== ''));
      if (!validRows.length) { document.getElementById('import-preview').innerHTML = '<p style="color:var(--danger)">Fichier vide ou invalide.</p>'; return; }

      this._importRows = validRows;
      // Pré-analyse : compter les lignes avec problèmes visibles
      const problemes = validRows.filter(r => !r[0]?.trim() || !r[1]?.trim());

      let html = `<div style="font-size:.82rem;margin-top:.75rem">
        <div style="display:flex;gap:.5rem;margin-bottom:.5rem;flex-wrap:wrap">
          <span class="badge badge-info"><i class="fa-solid fa-file-csv"></i> ${validRows.length} élève(s) détecté(s)</span>
          ${problemes.length > 0 ? `<span class="badge badge-warning"><i class="fa-solid fa-triangle-exclamation"></i> ${problemes.length} ligne(s) à vérifier (prénom/nom manquant)</span>` : '<span class="badge badge-success"><i class="fa-solid fa-check"></i> Format valide</span>'}
        </div>
        <div class="table-wrapper" style="max-height:200px;overflow-y:auto;margin-top:.5rem">
          <table><thead><tr><th>#</th><th>Prénom</th><th>Nom</th><th>Naissance</th><th>Sexe</th><th>Parent</th><th>Contact</th></tr></thead><tbody>
          ${validRows.slice(0, 15).map((r, i) => {
            const hasErr = !r[0]?.trim() || !r[1]?.trim();
            return `<tr style="background:${hasErr?'#fff3cd':''}"><td style="color:var(--gray-500)">${i+2}</td><td style="${!r[0]?.trim()?'color:red;font-weight:bold':''}">${r[0]||'❌ VIDE'}</td><td style="${!r[1]?.trim()?'color:red;font-weight:bold':''}">${r[1]||'❌ VIDE'}</td><td>${r[2]||'—'}</td><td>${r[3]||'?'}</td><td>${r[4]||'—'}</td><td>${r[5]||'—'}</td></tr>`;
          }).join('')}
          ${validRows.length > 15 ? `<tr><td colspan="7" style="text-align:center;color:var(--gray-500);font-style:italic">… et ${validRows.length-15} autres lignes</td></tr>` : ''}
          </tbody></table>
        </div>
        <div style="margin-top:.4rem;font-size:.78rem;color:var(--gray-600)">💡 Les lignes avec prénom ou nom manquant seront automatiquement ignorées avec un rapport d'erreur.</div>
      </div>`;
      document.getElementById('import-preview').innerHTML = html;
      document.getElementById('import-confirm-btn').style.display = 'inline-flex';
    };
    reader.readAsText(file, 'UTF-8');
  },

  async _executeImportCSV() {
    const classeId = document.getElementById('import-classe').value;
    if (!classeId) { Toast.error('Choisissez une classe de destination.'); return; }
    const rows = this._importRows;
    if (!rows?.length) { Toast.error('Aucune donnée à importer.'); return; }
    const btn = document.getElementById('import-confirm-btn');
    btn.disabled = true; btn.innerHTML = '<div class="loading-spinner" style="width:16px;height:16px;border-width:2px"></div> Import en cours…';

    const errorsLog = []; // journal des erreurs par ligne
    let imported = 0;
    let skipped = 0;

    try {
      const cfg = await DB.getEcoleConfig();
      const prefix = cfg?.matricule_prefix || 'INJ';

      // Précharger les élèves existants pour détecter les doublons de nom
      const existingEleves = await DB.getAll('eleves');
      const existingNoms = new Set(existingEleves.map(e => `${(e.prenom||'').trim().toLowerCase()}|${(e.nom||'').trim().toLowerCase()}|${e.classe_id}`));

      // Générer tous les matricules d'abord (en lot, pas dans la boucle)
      // pour éviter la race condition de generateMatricule
      let baseCount = existingEleves.length;

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const lineNum = i + 2; // +2 car ligne 1 = en-tête CSV
        const lineErrors = [];

        const prenom = (r[0] || '').trim();
        const nom = (r[1] || '').trim();
        const dateNaiss = (r[2] || '').trim();
        const sexeRaw = (r[3] || '').trim().toUpperCase();
        const nomParent = (r[4] || '').trim();
        const contact = (r[5] || '').trim();

        // Validation des champs obligatoires
        if (!prenom) lineErrors.push('Prénom manquant');
        if (!nom) lineErrors.push('Nom manquant');
        const sexe = ['M','F'].includes(sexeRaw) ? sexeRaw : 'M';
        if (sexeRaw && !['M','F'].includes(sexeRaw)) lineErrors.push(`Sexe invalide "${sexeRaw}" (M/F attendu)`);

        // Vérifier doublon (prénom+nom+classe)
        const key = `${prenom.toLowerCase()}|${nom.toLowerCase()}|${classeId}`;
        if (existingNoms.has(key)) {
          lineErrors.push(`Doublon : ${prenom} ${nom} existe déjà dans cette classe`);
        }

        if (lineErrors.length > 0) {
          errorsLog.push({ line: lineNum, prenom, nom, errors: lineErrors });
          skipped++;
          continue;
        }

        // Générer un matricule unique en incrémentant le compteur local
        baseCount++;
        const year = new Date().getFullYear().toString().substr(2);
        const num = String(baseCount).padStart(3, '0');
        const matricule = `${prefix}-MAT-${year}${num}`;

        try {
          await DB.insert('eleves', {
            prenom, nom, classe_id: classeId,
            date_naissance: dateNaiss, sexe, nom_parent: nomParent,
            contact_parent: contact, matricule,
            type_scolarite: 'standard'
          });
          existingNoms.add(key); // Éviter doublons dans le même fichier
          imported++;

          // Mettre à jour la barre de progression
          if (btn) btn.innerHTML = `<div class="loading-spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle"></div> Import… ${imported}/${rows.length - errorsLog.length}`;
        } catch (insertErr) {
          errorsLog.push({ line: lineNum, prenom, nom, errors: ['Erreur BDD : ' + insertErr.message] });
          skipped++;
        }
      }

      // Afficher le rapport final
      let reportHtml = `<div style="margin-top:.75rem">`;
      reportHtml += `<div style="display:flex;gap:.75rem;margin-bottom:.5rem;flex-wrap:wrap">
        <span class="badge badge-success"><i class="fa-solid fa-check"></i> ${imported} importé(s)</span>
        ${skipped > 0 ? `<span class="badge badge-danger"><i class="fa-solid fa-xmark"></i> ${skipped} ignoré(s)</span>` : ''}
      </div>`;

      if (errorsLog.length > 0) {
        reportHtml += `<div style="background:#fce4ec;border:1px solid #ef9a9a;border-radius:8px;padding:.75rem;max-height:180px;overflow-y:auto;font-size:.8rem">
          <strong style="color:#b71c1c"><i class="fa-solid fa-triangle-exclamation"></i> Rapport d'erreurs (${errorsLog.length} ligne(s)) :</strong>
          <table style="width:100%;margin-top:.4rem;border-collapse:collapse">
            <thead><tr style="background:#ef9a9a"><th style="padding:.3rem;text-align:left">Ligne</th><th style="padding:.3rem;text-align:left">Élève</th><th style="padding:.3rem;text-align:left">Raison(s)</th></tr></thead>
            <tbody>
              ${errorsLog.map(e => `<tr style="border-top:1px solid #ef9a9a"><td style="padding:.25rem">${e.line}</td><td style="padding:.25rem">${e.prenom||'?'} ${e.nom||'?'}</td><td style="padding:.25rem;color:#b71c1c">${e.errors.join(' • ')}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>`;
      }
      reportHtml += '</div>';

      document.getElementById('import-preview').innerHTML = reportHtml;

      if (imported > 0) {
        Toast.success(`✅ ${imported} élève(s) importé(s)${skipped > 0 ? ` — ${skipped} ligne(s) ignorée(s)` : ''} !`);
        DB._invalidateCache('eleves');
        // Ne pas fermer la modale pour laisser lire le rapport d'erreurs
        btn.innerHTML = `<i class="fa-solid fa-check"></i> Import terminé (${imported} succès)`;
        // Bouton pour fermer et rafraîchir
        const footer = document.querySelector('#global-modal .modal-footer');
        if (footer) {
          footer.innerHTML = `<button class="btn btn-success" onclick="Modal.close(); Pages.eleves()">Fermer et rafraîchir</button>`;
        }
      } else {
        Toast.error('Aucun élève importé. Vérifiez le rapport ci-dessus.');
        btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-upload"></i> Réessayer';
      }
    } catch (err) {
      Toast.error('Erreur lors de l\'import : ' + err.message);
      btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-upload"></i> Importer';
    }
  },

  async _exportEleves() {
    const eleves = await DB.getAll('eleves');
    const [classes, configsSco, allPay] = await Promise.all([DB.getAll('classes'), DB.getAll('config_scolarite'), DB.getAll('paiements')]);
    const cMap = Object.fromEntries(classes.map(c=>[c.id,c]));
    const pMap = {};
    allPay.filter(p=>!p.annule).forEach(p=>{if(!pMap[p.eleve_id])pMap[p.eleve_id]=0;pMap[p.eleve_id]+=parseFloat(p.montant||0);});
    const rows = eleves.map(e => {
      const cls = cMap[e.classe_id];
      const cfg = configsSco.find(c=>c.niveau===cls?.niveau);
      const total = parseFloat(cfg?.montant_annuel||0);
      const paye = pMap[e.id]||0;
      return [e.matricule,e.nom,e.prenom,e.sexe||'',e.date_naissance||'',cls?.nom||'',cls?.niveau||'',total,paye,Math.max(0,total-paye),e.nom_parent||'',e.contact_parent||''];
    });
    // Fix 2 — Export en .xlsx au lieu de .csv
    Export.toXLSX(
      ['Matricule','Nom','Prénom','Sexe','Date Naissance','Classe','Niveau','Scolarité','Payé','Reste','Parent','Contact'],
      rows.map(r => [r[0],r[1],r[2],r[3],r[4],r[5],r[6],parseFloat(r[7]),parseFloat(r[8]),Math.max(0,parseFloat(r[7])-parseFloat(r[8])),r[10],r[11]]),
      `eleves-export-${new Date().toISOString().split('T')[0]}.xlsx`
    );
  },

  // Fix R9 — Impression PDF liste élèves via fenêtre dédiée (fond blanc garanti)
  async _printListeEleves() {
    try {
      const role = App.currentUser?.role;
      let eleves = await DB.getAll('eleves');
      const [classes, configsSco, allPay, cfg] = await Promise.all([
        DB.getAll('classes'), DB.getAll('config_scolarite'), DB.getAll('paiements'), DB.getEcoleConfig()
      ]);
      await getDevise();
      // Prof : filtrer ses élèves seulement
      if (role === 'prof') {
        const classesProf = await DB.getClassesProf(App.currentUser);
        const ids = classesProf.map(c => c.id);
        eleves = eleves.filter(e => ids.includes(e.classe_id));
      }
      const cMap = Object.fromEntries(classes.map(c => [c.id, c]));
      const pMap = {};
      allPay.filter(p => !p.annule).forEach(p => { pMap[p.eleve_id] = (pMap[p.eleve_id]||0) + parseFloat(p.montant||0); });
      const elevesMap = Object.fromEntries(eleves.map(e => [e.id, e]));

      // Trier par classe puis nom
      const sorted = [...eleves].sort((a, b) => {
        const ca = cMap[a.classe_id], cb = cMap[b.classe_id];
        const oa = NIVEAU_ORDER[ca?.niveau] ?? 99, ob = NIVEAU_ORDER[cb?.niveau] ?? 99;
        if (oa !== ob) return oa - ob;
        return a.nom.localeCompare(b.nom);
      });

      const rowsHtml = sorted.map((e, idx) => {
        const cls = cMap[e.classe_id];
        const cfgSco = configsSco.find(c => c.niveau === cls?.niveau);
        const total = parseFloat(cfgSco?.montant_annuel || 0);
        const paye = pMap[e.id] || 0;
        const reste = Math.max(0, total - paye);
        const statut = DB.getStatutPaiementSync(e.id, elevesMap, cMap, configsSco, pMap);
        const statutTxt = statut === 'solde' ? 'Soldé' : statut === 'encours' ? 'En cours' : statut === 'exonere' ? 'Exonéré' : 'Non payé';
        const statutColor = statut === 'solde' ? '#1b5e20' : statut === 'encours' ? '#e65100' : statut === 'exonere' ? '#1565c0' : '#b71c1c';
        return `<tr style="background:${idx%2===0?'#fafafa':'#fff'}">
          <td style="text-align:center;font-size:7.5pt;color:#888">${idx+1}</td>
          <td><code style="font-size:7.5pt">${e.matricule||'—'}</code></td>
          <td style="font-weight:600">${e.nom} ${e.prenom}</td>
          <td style="text-align:center">${e.sexe==='M'?'M':'F'}</td>
          <td style="font-size:7.5pt">${e.date_naissance ? new Date(e.date_naissance).toLocaleDateString('fr-FR') : '—'}</td>
          <td>${cls ? formatClasseLabel(cls) : '—'}</td>
          <td style="font-size:7.5pt">${e.nom_parent||'—'}</td>
          <td style="font-size:7.5pt">${e.contact_parent||'—'}</td>
          ${role !== 'prof' ? `<td align="right" style="font-size:7.5pt">${total>0?total.toLocaleString('fr-FR')+' '+_deviseCache:'—'}</td>
          <td align="right" style="font-size:7.5pt;color:#27ae60">${paye>0?paye.toLocaleString('fr-FR')+' '+_deviseCache:'—'}</td>
          <td align="right" style="font-size:7.5pt;color:${reste>0?'#b71c1c':'#27ae60'}">${reste>0?reste.toLocaleString('fr-FR')+' '+_deviseCache:'—'}</td>
          <td style="font-size:7.5pt;color:${statutColor};font-weight:600">${statutTxt}</td>` : ''}
        </tr>`;
      }).join('');

      const thFinance = role !== 'prof' ? '<th>Scolarité</th><th>Payé</th><th>Reste</th><th>Statut</th>' : '';
      const logoHtml = (cfg?.logo_base64 || cfg?.logo_url) ? `<img src="${cfg.logo_base64||cfg.logo_url}" style="max-height:55px;max-width:65px;object-fit:contain">` : '';
      const annee = `${new Date().getFullYear()-1}/${new Date().getFullYear()}`;

      // R11 — PrintHelper : Blob URL + iframe modal (plus de window.open)
      PrintHelper.show(`<!DOCTYPE html><html lang="fr"><head>
        <meta charset="UTF-8"><title>Liste des élèves</title>
        <style>
          *{box-sizing:border-box;margin:0;padding:0}
          body{font-family:Arial,sans-serif;font-size:9pt;background:#fff;color:#000;padding:.6cm}
          .hd{display:grid;grid-template-columns:1fr auto 1fr;gap:6pt;align-items:center;border-bottom:2pt solid #1a237e;padding-bottom:.2cm;margin-bottom:.3cm}
          .hd-left{font-size:8pt;line-height:1.5}
          .hd-right{text-align:right;font-size:7.5pt;line-height:1.6}
          h3{text-align:center;font-size:10pt;font-weight:bold;margin-bottom:.25cm;text-transform:uppercase}
          p.sub{text-align:center;font-size:7.5pt;color:#666;margin-bottom:.3cm}
          table{border-collapse:collapse;width:100%}
          th,td{border:0.5pt solid #bbb;padding:2.5pt 4pt;font-size:8pt}
          thead tr{background:#1a237e!important;color:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
          @page{size:A4 landscape;margin:.6cm .8cm}
          tfoot tr{background:#f0f0f0;font-weight:bold}
        </style></head><body>
        <div class="hd">
          <div class="hd-left"><b style="font-size:10pt;color:#1a237e">${cfg?.nom||'École'}</b><br>${cfg?.adresse||''}<br>${cfg?.telephone?'Tél: '+cfg.telephone:''}</div>
          <div style="text-align:center">${logoHtml}</div>
          <div class="hd-right"><b>République de Guinée</b><br>Travail — Justice — Solidarité<br>Ministère MENA/ETFP<br>Année : ${annee}</div>
        </div>
        <h3>Liste des Élèves</h3>
        <p class="sub">Total : ${sorted.length} élève(s) — Imprimé le ${new Date().toLocaleDateString('fr-FR')}</p>
        <table>
          <thead><tr>
            <th style="width:24pt">#</th>
            <th>Matricule</th><th>Nom & Prénom</th><th style="width:20pt">Sx</th>
            <th>Naissance</th><th>Classe</th><th>Parent</th><th>Contact</th>
            ${thFinance}
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
          <tfoot><tr>
            <td colspan="${role !== 'prof' ? 12 : 8}" style="text-align:center;font-size:7.5pt">
              ${sorted.length} élève(s) — ${cfg?.nom||'École'} — ${annee}
            </td>
          </tr></tfoot>
        </table>
      </body></html>`, 'Liste des Élèves');
    } catch(err) { Toast.error('Erreur impression : ' + err.message); }
  },

  // ── PAIEMENT RAPIDE ÉLÈVE — avec sélection de tranche (Blocs 2+3) ──
  async _quickPayEleve(eleveId) {
    const eleve = await DB.getById('eleves', eleveId);
    if (!eleve) return;

    // Exonéré : pas de paiement possible
    if (DB.isExonere(eleve)) {
      Toast.info(`${eleve.prenom} ${eleve.nom} est exonéré(e). Aucune scolarité due.`);
      return;
    }

    const [allPay, echeances] = await Promise.all([
      DB.getAll('paiements'),
      DB.getEcheances(eleve.classe_id, eleveId)
    ]);
    const paysValides = allPay.filter(p => p.eleve_id === eleveId && !p.annule);
    const total = echeances.reduce((s, e) => s + e.montant, 0);
    const totalPaye = paysValides.reduce((s, p) => s + parseFloat(p.montant || 0), 0);
    const reste = Math.max(0, total - totalPaye);
    const pct = total > 0 ? Math.min(100, Math.round(totalPaye / total * 100)) : 0;
    const statut = totalPaye === 0 ? 'aucun' : totalPaye >= total ? 'solde' : 'encours';
    const now = new Date();

    // Construire la liste des tranches avec état + séquentialité (blocage si antérieure non soldée)
    // Séquentialité : une tranche est accessible uniquement si toutes les tranches précédentes sont soldées
    let aPrecedenteNonSoldee = false; // flag pour bloquer les tranches suivantes
    const tranchesHtml = echeances.map((ech, idx) => {
      const payePourTranche = paysValides
        .filter(p => p.tranche_id === ech.id)
        .reduce((s, p) => s + parseFloat(p.montant || 0), 0);
      const resteTranche = Math.max(0, ech.montant - payePourTranche);
      const dateEch = ech.date_echeance ? new Date(ech.date_echeance) : null;
      const estPasse = !dateEch || dateEch <= now;
      const estPayee = payePourTranche >= ech.montant;

      let statutTranche, badgeHtml;
      if (estPayee) {
        statutTranche = 'paye'; badgeHtml = '<span class="badge badge-success" style="font-size:.72rem">✓ Soldée</span>';
      } else if (payePourTranche > 0) {
        statutTranche = 'partiel'; badgeHtml = `<span class="badge badge-warning" style="font-size:.72rem">Partiel (${money(payePourTranche)})</span>`;
      } else if (!estPasse) {
        statutTranche = 'a_venir'; badgeHtml = '<span class="badge badge-aavenir" style="font-size:.72rem">À venir</span>';
      } else {
        statutTranche = 'retard'; badgeHtml = '<span class="badge badge-retard" style="font-size:.72rem">En retard !</span>';
      }

      // Règle de séquentialité :
      // - Si une tranche précédente (non soldée, déjà échue) existe → bloquer cette tranche et les suivantes
      const bloqueParSequentialite = !estPayee && aPrecedenteNonSoldee;
      if (!estPayee && estPasse && idx > 0) aPrecedenteNonSoldee = true; // marquer que cette tranche est non soldée

      const disabled = estPayee || bloqueParSequentialite ? 'disabled' : '';
      const raisonBlocage = bloqueParSequentialite ? '<div style="font-size:.7rem;color:var(--danger);margin-top:.15rem"><i class="fa-solid fa-lock"></i> Bloquez la tranche précédente d\'abord</div>' : '';

      const borderColor = bloqueParSequentialite ? 'var(--gray-300)' :
        estPayee ? 'var(--gray-300)' :
        statutTranche === 'retard' ? 'var(--danger)' :
        statutTranche === 'partiel' ? 'var(--warning)' :
        'var(--gray-300)';

      return `
        <label style="display:flex;align-items:flex-start;gap:.75rem;padding:.6rem .9rem;border-radius:8px;border:2px solid ${borderColor};margin-bottom:.4rem;cursor:${disabled?'not-allowed':'pointer'};background:${estPayee||bloqueParSequentialite?'var(--gray-100)':'white'};opacity:${bloqueParSequentialite?'.5':'1'}">
          <input type="checkbox" class="pay-tranche-cb" value="${ech.id}" data-label="${ech.label}" data-reste="${resteTranche}" data-montant="${ech.montant}" ${disabled} onchange="Pages._onTrancheSelect()" style="accent-color:var(--primary);margin-top:.25rem">
          <div style="flex:1">
            <div style="font-weight:600;font-size:.88rem">${ech.label}</div>
            <div style="font-size:.75rem;color:var(--gray-600)">${dateEch ? 'Échéance : '+dateEch.toLocaleDateString('fr-FR') : ''} — Montant : ${money(ech.montant)}</div>
            ${raisonBlocage}
          </div>
          <div style="text-align:right">
            ${badgeHtml}
            ${resteTranche > 0 && !estPayee ? `<div style="font-size:.72rem;color:var(--danger);margin-top:.2rem;font-weight:600">Reste: ${money(resteTranche)}</div>` : ''}
          </div>
        </label>`;
    }).join('');

    Modal.open(`💵 Paiement — ${eleve.prenom} ${eleve.nom}`, `
      <div style="background:var(--gray-100);border-radius:8px;padding:.75rem;margin-bottom:1rem">
        <div style="display:flex;justify-content:space-between;padding:.15rem 0"><span>Scolarité totale :</span><strong>${money(total)}</strong></div>
        <div style="display:flex;justify-content:space-between;padding:.15rem 0"><span>Déjà payé :</span><strong style="color:var(--secondary)">${money(totalPaye)}</strong></div>
        <div style="display:flex;justify-content:space-between;padding:.25rem 0;border-top:1px solid var(--gray-300);margin-top:.2rem"><span>Reste global :</span><strong style="color:var(--danger)">${money(reste)}</strong></div>
        <div class="progress" style="height:8px;margin-top:.5rem"><div class="progress-bar ${statut==='solde'?'green':statut==='encours'?'orange':'red'}" style="width:${pct}%"></div></div>
      </div>

      <div class="form-group">
        <label class="form-label"><strong>Sélectionner la (les) tranche(s) à encaisser <span style="color:red">*</span></strong></label>
        <div style="font-size:.78rem;color:var(--gray-600);margin-bottom:.4rem"><i class="fa-solid fa-circle-info"></i> Cochez une ou plusieurs tranches. Le montant sera calculé automatiquement. Les tranches verrouillées (🔒) nécessitent que les tranches précédentes soient soldées en premier.</div>
        <div style="max-height:260px;overflow-y:auto;padding:.3rem 0">
          ${tranchesHtml}
        </div>
        <div id="pay-selection-total" style="font-size:.85rem;color:var(--primary);font-weight:600;margin-top:.4rem"></div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Montant versé <span style="color:red">*</span></label>
          <input type="number" class="form-control" id="pay-montant" min="1" placeholder="0"
            oninput="Pages._onMontantChange('pay')">
          <div id="pay-reste-info" style="font-size:.8rem;color:var(--gray-600);margin-top:.3rem"></div>
          <div id="pay-ventil-hint" style="font-size:.78rem;color:var(--primary);margin-top:.2rem"></div>
        </div>
        <div class="form-group"><label class="form-label">Mode de paiement</label>
          <select class="form-control" id="pay-mode"><option>Espèces</option><option>Mobile Money</option><option>Chèque</option><option>Virement</option></select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Date & heure</label><input type="datetime-local" class="form-control" id="pay-date" value="${new Date().toISOString().slice(0,16)}"></div>
        <div class="form-group"><label class="form-label">Observation</label><input class="form-control" id="pay-obs" placeholder="Facultatif"></div>
      </div>
    `, `
      <button class="btn btn-outline" onclick="Modal.close()">Annuler</button>
      <button class="btn btn-success" id="pay-save-btn" onclick="Pages._savePaiementModal('${eleveId}')"><i class="fa-solid fa-check"></i> Enregistrer le paiement</button>
    `, 'modal-lg');
  },

  // Helper interne : recalcule le récapitulatif après un changement de case
  _refreshTrancheUI(prefix) {
    // prefix = 'pay' ou 'np'
    const cbSelector = prefix === 'pay' ? '.pay-tranche-cb' : '.np-tranche-cb';
    const checked = Array.from(document.querySelectorAll(cbSelector + ':checked'));
    const totalReste = checked.reduce((s, cb) => s + parseFloat(cb.dataset.reste || 0), 0);
    const montantInput = document.getElementById(prefix + '-montant');
    const infoEl = document.getElementById(prefix + '-reste-info');
    const totalEl = document.getElementById(prefix + '-selection-total');
    const hintEl = document.getElementById(prefix + '-ventil-hint');

    if (checked.length === 0) {
      if (montantInput) montantInput.value = '';
      if (infoEl) infoEl.textContent = '';
      if (totalEl) totalEl.textContent = '';
      if (hintEl) hintEl.textContent = '';
      return;
    }
    if (montantInput) montantInput.value = totalReste > 0 ? totalReste : '';
    const labels = checked.map(cb => cb.dataset.label).join(', ');
    if (infoEl) infoEl.textContent = `${checked.length} tranche(s) sélectionnée(s) : ${labels}`;
    if (totalEl) totalEl.innerHTML = `<i class="fa-solid fa-calculator"></i> Total coché : <strong style="color:var(--primary)">${money(totalReste)}</strong>`;
    if (hintEl) hintEl.textContent = '';
  },

  // Helper interne : recalcule les disabled après cochage (déverrouillage dynamique)
  _refreshTrancheLock(cbSelector) {
    const allCbs = Array.from(document.querySelectorAll(cbSelector));
    let blockNext = false;
    allCbs.forEach(cb => {
      // Tranche entièrement soldée (reste === 0) → toujours disabled, reset du flag
      if (parseFloat(cb.dataset.reste || 0) === 0) { blockNext = false; return; }
      if (blockNext) {
        cb.disabled = true;
        const lbl = cb.closest('label');
        if (lbl) { lbl.style.opacity = '.45'; lbl.style.cursor = 'not-allowed'; lbl.style.background = 'var(--gray-100)'; }
      } else {
        cb.disabled = false;
        const lbl = cb.closest('label');
        if (lbl) { lbl.style.opacity = '1'; lbl.style.cursor = 'pointer'; lbl.style.background = 'white'; }
      }
      // Tranche non cochée avec un reste → bloquer les suivantes
      if (!cb.checked && parseFloat(cb.dataset.reste || 0) > 0) blockNext = true;
    });
  },

  _onTrancheSelect() {
    this._refreshTrancheLock('.pay-tranche-cb');
    this._refreshTrancheUI('pay');
  },

  // T1.1 — Ventilation automatique corrigée : auto-cocher séquentiellement toutes les tranches
  // couvertes par le montant saisi, en respectant l'ordre séquentiel (déverrou progressif)
  _onMontantChange(prefix) {
    const cbSelector = prefix === 'pay' ? '.pay-tranche-cb' : '.np-tranche-cb';
    const montantInput = document.getElementById(prefix + '-montant');
    const hintEl = document.getElementById(prefix + '-ventil-hint');
    const montantSaisi = parseFloat(montantInput?.value || 0);
    if (!montantSaisi || montantSaisi <= 0) {
      if (hintEl) hintEl.textContent = '';
      return;
    }

    // Étape 1 : décoche d'abord toutes les tranches non-soldées pour repartir proprement
    const allCbs = Array.from(document.querySelectorAll(cbSelector));
    allCbs.forEach(cb => {
      // Ne pas décocher les tranches déjà soldées (reste === 0 = entièrement payée avant)
      if (parseFloat(cb.dataset.reste || 0) > 0) cb.checked = false;
    });

    // Étape 2 : parcourir dans l'ordre et cocher séquentiellement jusqu'à épuisement du montant
    // L'ordre DOM = ordre des tranches (Oct → Nov → … → Juin)
    let restant = montantSaisi;
    let nbAutoCoches = 0;
    const nouvLabels = [];

    for (const cb of allCbs) {
      const resteTranche = parseFloat(cb.dataset.reste || 0);
      if (resteTranche === 0) continue; // tranche déjà soldée, skip
      if (restant <= 0) break;

      // Cette tranche peut être partiellement ou totalement couverte
      cb.checked = true;
      restant -= resteTranche; // peut devenir négatif → trop-perçu possible sur la dernière tranche
      nbAutoCoches++;
      nouvLabels.push(cb.dataset.label);
    }

    // Étape 3 : recalculer les verrous et afficher le résumé
    this._refreshTrancheLock(cbSelector);
    const totalEl = document.getElementById(prefix + '-selection-total');
    const checkedAll = Array.from(document.querySelectorAll(cbSelector + ':checked'));
    const totalReste = checkedAll.reduce((s, cb) => s + parseFloat(cb.dataset.reste || 0), 0);
    const trop = montantSaisi - totalReste; // positif si trop-perçu

    if (hintEl) {
      if (nbAutoCoches > 0) {
        let hint = `<i class="fa-solid fa-wand-magic-sparkles" style="color:var(--primary)"></i> <strong>${nbAutoCoches}</strong> tranche(s) sélectionnée(s) : ${nouvLabels.join(', ')}`;
        if (trop > 0) hint += ` — <span style="color:var(--warning);font-weight:600"><i class="fa-solid fa-triangle-exclamation"></i> Trop-perçu : +${money(trop)}</span>`;
        hintEl.innerHTML = hint;
      } else {
        hintEl.textContent = '';
      }
    }
    if (totalEl) {
      totalEl.innerHTML = `<i class="fa-solid fa-calculator"></i> Total sélectionné : <strong style="color:var(--primary)">${money(totalReste)}</strong>`;
    }

    // Mettre à jour aussi le récap info
    const infoEl = document.getElementById(prefix + '-reste-info');
    if (infoEl && checkedAll.length) {
      const labels = checkedAll.map(cb => cb.dataset.label).join(', ');
      infoEl.textContent = `${checkedAll.length} tranche(s) : ${labels}`;
    }
  },

  async _savePaiementModal(eleveId) {
    const montantTotal = parseFloat(document.getElementById('pay-montant').value);
    if (!montantTotal || montantTotal <= 0) { Toast.error('Montant invalide.'); return; }

    // Récupérer les tranches sélectionnées (checkboxes)
    const tranchesChecked = Array.from(document.querySelectorAll('.pay-tranche-cb:checked'));
    if (!tranchesChecked.length) { Toast.error('Sélectionnez au moins une tranche à encaisser.'); return; }

    const btn = document.getElementById('pay-save-btn');
    if (!Debounce.btn(btn, 8000)) return;

    try {
      const dateVal = document.getElementById('pay-date').value;
      const mode_paiement = document.getElementById('pay-mode').value;
      const observation = document.getElementById('pay-obs').value;
      const dateISO = dateVal ? new Date(dateVal).toISOString() : new Date().toISOString();
      const caissier_nom = `${App.currentUser?.prenom||''} ${App.currentUser?.nom||''}`.trim();

      if (tranchesChecked.length === 1) {
        // Paiement simple (une tranche)
        const cb = tranchesChecked[0];
        await DB.insert('paiements', {
          eleve_id: eleveId, montant: montantTotal,
          mode_paiement, observation, date_paiement: dateISO,
          caissier_id: App.currentUser?.id, caissier_nom, annule: false,
          tranche_id: cb.value, tranche_label: cb.dataset.label
        });
        Toast.success(`✅ Paiement de ${money(montantTotal)} pour ${cb.dataset.label} enregistré !`);
      } else {
        // Paiement multi-tranches : distribuer proportionnellement
        const totalReste = tranchesChecked.reduce((s, cb) => s + parseFloat(cb.dataset.reste || 0), 0);
        let restantADistribuer = montantTotal;
        let inserts = 0;

        for (let i = 0; i < tranchesChecked.length; i++) {
          const cb = tranchesChecked[i];
          const resteTranche = parseFloat(cb.dataset.reste || 0);
          // Dernier : verser le reste disponible
          const versement = i === tranchesChecked.length - 1
            ? Math.min(restantADistribuer, resteTranche)
            : Math.min(restantADistribuer, resteTranche);
          if (versement <= 0) continue;
          await DB.insert('paiements', {
            eleve_id: eleveId, montant: versement,
            mode_paiement, observation, date_paiement: dateISO,
            caissier_id: App.currentUser?.id, caissier_nom, annule: false,
            tranche_id: cb.value, tranche_label: cb.dataset.label
          });
          restantADistribuer -= versement;
          inserts++;
        }
        const labels = tranchesChecked.map(cb => cb.dataset.label).join(', ');
        Toast.success(`✅ ${money(montantTotal)} réparti sur ${inserts} tranche(s) : ${labels} !`);
      }

      Modal.close();
      if (App.currentPage === 'paiements') Pages.paiements();
      else if (App.currentPage === 'eleves') Pages.eleves();
      else Pages.dashboard();
    } catch (err) {
      Toast.error('Erreur : ' + err.message);
      Debounce.release(btn, '<i class="fa-solid fa-check"></i> Enregistrer le paiement');
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // MATIÈRES
  // ══════════════════════════════════════════════════════════════════
  async matieres() {
    setLoading();
    try {
      const [matieres, classesRaw] = await Promise.all([DB.getAll('matieres'), DB.getAll('classes')]);
      const classes = sortClasses(classesRaw); // T4.1 — tri hiérarchique
      const cMap = Object.fromEntries(classes.map(c => [c.id, c]));
      this._matieresCacheAll = matieres;
      this._classesCacheAll = classes;
      setContent(`
        <div class="page-header">
          <div class="page-header-left"><h2><i class="fa-solid fa-book-open" style="color:var(--primary)"></i> Matières</h2>
          <p>${App.currentUser?.role === 'directeur' || App.currentUser?.role === 'prof' ? 'Consultation uniquement' : 'Gérez les matières et coefficients par classe'}</p></div>
          ${!['directeur','prof'].includes(App.currentUser?.role) ? `<button class="btn btn-primary" onclick="Pages._openMatiereModal()"><i class="fa-solid fa-plus"></i> Nouvelle matière</button>` : ''}
        </div>

        ${!matieres.length ? `
        <div class="card"><div class="card-body">
          <div class="empty-state">
            <i class="fa-solid fa-book-open"></i>
            <h3>Aucune matière configurée</h3>
            <p>Ajoutez les matières pour chaque classe avec leur coefficient</p>
            ${!['directeur','prof'].includes(App.currentUser?.role) ? `<button class="btn btn-primary" style="margin-top:1rem" onclick="Pages._openMatiereModal()"><i class="fa-solid fa-plus"></i> Ajouter la première matière</button>` : ''}
          </div>
        </div></div>` : `
        <div class="card">
          <div class="card-header">
            <select class="form-control" style="width:auto" id="filter-mat-classe" onchange="Pages._filterMatieres()">
              <option value="">Toutes les classes</option>
              ${classes.map(c => `<option value="${c.id}">${formatClasseLabel(c)}</option>`).join('')}
            </select>
            <span style="font-size:.85rem;color:var(--gray-500)">${matieres.length} matière(s) au total</span>
          </div>
          <div class="card-body" style="padding:0">
            <div class="table-wrapper">
              <table>
                <thead><tr><th>Matière</th><th>Coefficient</th><th>Classe</th><th>Niveau</th><th>Actions</th></tr></thead>
                <tbody id="mat-tbody">${this._buildMatieresRows(matieres, cMap)}</tbody>
              </table>
            </div>
          </div>
        </div>`}
      `);
    } catch (err) {
      setContent(`<div class="empty-state"><i class="fa-solid fa-triangle-exclamation" style="color:var(--danger)"></i><h3>Erreur</h3><p>${err.message}</p><button class="btn btn-primary" onclick="Pages.matieres()">Réessayer</button></div>`);
    }
  },

  _buildMatieresRows(matieres, cMap) {
    if (!matieres.length) return `<tr><td colspan="5" class="table-empty"><i class="fa-solid fa-book-open"></i> Aucune matière trouvée</td></tr>`;
    return matieres.map(m => {
      const cls = cMap[m.classe_id];
      const type = cls ? (DB.isPrimaire(cls.niveau) ? '<span class="badge badge-info">Primaire</span>' : '<span class="badge badge-purple">Collège</span>') : '';
      return `<tr>
        <td><strong>${m.nom}</strong></td>
        <td><span class="badge badge-info">Coeff. ${m.coefficient}</span></td>
        <td>${cls ? `<span class="chip">${formatClasseLabel(cls)}</span>` : '—'}</td>
        <td>${type} ${cls ? `<small style="color:var(--gray-500)">${cls.niveau}</small>` : ''}</td>
        <td><div style="display:flex;gap:.4rem">
          ${!['directeur','prof'].includes(App.currentUser?.role) ? `
          <button class="btn-icon" onclick="Pages._openMatiereModal('${m.id}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon" onclick="Pages._deleteMatiere('${m.id}')" style="color:var(--danger)"><i class="fa-solid fa-trash"></i></button>
          ` : '<span style="color:var(--gray-500);font-size:.8rem">—</span>'}
        </div></td>
      </tr>`;
    }).join('');
  },

  _filterMatieres() {
    const cls = document.getElementById('filter-mat-classe')?.value;
    const cMap = Object.fromEntries((this._classesCacheAll||[]).map(c=>[c.id,c]));
    let list = this._matieresCacheAll || [];
    if (cls) list = list.filter(m => m.classe_id === cls);
    document.getElementById('mat-tbody').innerHTML = this._buildMatieresRows(list, cMap);
  },

  async _openMatiereModal(id = null) {
    const classesRaw = await DB.getAll('classes');
    const classes = sortClasses(classesRaw); // T4.1
    const m = id ? await DB.getById('matieres', id) : null;

    if (id) {
      // Mode édition : une seule classe (comportement existant)
      const opts = sortClasses(classes).map(c => `<option value="${c.id}" ${m?.classe_id===c.id?'selected':''}>${formatClasseLabel(c)} (${DB.isPrimaire(c.niveau)?'Primaire':'Collège'})</option>`).join('');
      Modal.open('✏️ Modifier la matière', `
        <div class="form-group">
          <label class="form-label">Nom de la matière <span style="color:red">*</span></label>
          <input class="form-control" id="mat-nom" value="${m?.nom||''}" placeholder="Ex: Mathématiques, Français, Sciences…">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Coefficient <span style="color:red">*</span></label>
            <input type="number" class="form-control" id="mat-coeff" value="${m?.coefficient||1}" min="1" max="10">
          </div>
          <div class="form-group">
            <label class="form-label">Classe</label>
            <select class="form-control" id="mat-classe"><option value="">— Choisir —</option>${opts}</select>
          </div>
        </div>
        <div id="mat-college-info" style="display:none;padding:.6rem;background:#f3e5f5;border-radius:6px;font-size:.82rem;color:#6a1b9a;margin-top:.5rem"><i class="fa-solid fa-graduation-cap"></i> Classe Collège : assignez cette matière aux enseignants dans la page Utilisateurs.</div>
      `, `
        <button class="btn btn-outline" onclick="Modal.close()">Annuler</button>
        <button class="btn btn-primary" id="save-mat-btn" onclick="Pages._saveMatiere('${id}')"><i class="fa-solid fa-save"></i> Enregistrer</button>
      `);
      document.getElementById('mat-classe')?.addEventListener('change', function() {
        const allCls = Pages._classesCacheAll || [];
        const cls = allCls.find(c => c.id === this.value);
        const info = document.getElementById('mat-college-info');
        if (info) info.style.display = cls && DB.isCollege(cls.niveau) ? 'block' : 'none';
      });
      return;
    }

    // Mode création : sélection MULTIPLE par cycle (Bloc 1)
    const primaireClasses = classes.filter(c => DB.isPrimaire(c.niveau));
    const collegeClasses = classes.filter(c => DB.isCollege(c.niveau));

    const buildCycleCheckboxes = (classList, cycleLabel, colorVar) => {
      if (!classList.length) return '';
      return `
        <div style="margin-bottom:1rem">
          <div style="font-weight:600;font-size:.85rem;margin-bottom:.5rem;color:${colorVar}">
            <i class="fa-solid fa-chalkboard"></i> ${cycleLabel}
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:.4rem">
            <label style="display:flex;align-items:center;gap:.3rem;background:#f0f4ff;padding:.35rem .7rem;border-radius:6px;cursor:pointer;font-size:.82rem;border:1px solid #d0e0ff">
              <input type="checkbox" class="mat-select-all" data-cycle="${cycleLabel}" onchange="Pages._toggleAllMatiereClasses(this)" style="accent-color:var(--primary)"> <strong>Tout sélectionner</strong>
            </label>
            ${classList.map(c => `
              <label style="display:flex;align-items:center;gap:.3rem;background:var(--gray-100);padding:.35rem .7rem;border-radius:6px;cursor:pointer;font-size:.82rem">
                <input type="checkbox" class="mat-classe-cb" value="${c.id}" data-cycle="${cycleLabel}" style="accent-color:var(--primary)">
                ${formatClasseLabel(c)}
              </label>`).join('')}
          </div>
        </div>`;
    };

    Modal.open('➕ Nouvelle matière — Multi-classes', `
      <div class="form-group">
        <label class="form-label">Nom de la matière <span style="color:red">*</span></label>
        <input class="form-control" id="mat-nom" placeholder="Ex: Mathématiques, Français, Sciences…">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Coefficient par défaut <span style="color:red">*</span></label>
          <input type="number" class="form-control" id="mat-coeff" value="1" min="1" max="10">
          <div class="form-text">Appliqué à toutes les classes cochées. Modifiable par classe ensuite.</div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Sélectionner les classes <span style="color:red">*</span></label>
        <div style="border:1px solid var(--gray-300);border-radius:8px;padding:.75rem;max-height:280px;overflow-y:auto">
          ${buildCycleCheckboxes(primaireClasses, 'Primaire', 'var(--primary)')}
          ${buildCycleCheckboxes(collegeClasses, 'Collège', '#6a1b9a')}
          ${!classes.length ? '<p style="color:var(--gray-500);font-size:.85rem">Aucune classe disponible. Créez des classes d\'abord.</p>' : ''}
        </div>
        <div class="form-text" style="margin-top:.4rem"><i class="fa-solid fa-circle-info"></i> Une fiche indépendante sera créée par classe. Vous pourrez modifier le coefficient individuellement ensuite.</div>
      </div>
    `, `
      <button class="btn btn-outline" onclick="Modal.close()">Annuler</button>
      <button class="btn btn-primary" id="save-mat-btn" onclick="Pages._saveMatiere('')"><i class="fa-solid fa-save"></i> Créer pour toutes les classes cochées</button>
    `, 'modal-lg');
  },

  _toggleAllMatiereClasses(checkbox) {
    const cycle = checkbox.dataset.cycle;
    const allInCycle = document.querySelectorAll(`.mat-classe-cb[data-cycle="${cycle}"]`);
    allInCycle.forEach(cb => { cb.checked = checkbox.checked; });
  },

  async _saveMatiere(id) {
    const nomRaw = document.getElementById('mat-nom').value.trim();
    const coefficient = parseFloat(document.getElementById('mat-coeff').value);
    if (!nomRaw) { Toast.error('Le nom est obligatoire.'); return; }
    if (!coefficient || coefficient < 1) { Toast.error('Coefficient invalide (min. 1).'); return; }
    const btn = document.getElementById('save-mat-btn');
    if (!Debounce.btn(btn, 5000)) return; // anti-double-clic
    try {
      if (id) {
        // Modification d'une matière existante (1 seul nom)
        const classe_id = document.getElementById('mat-classe').value;
        if (!classe_id) { Toast.error('Choisissez une classe.'); Debounce.release(btn, '<i class="fa-solid fa-save"></i> Enregistrer'); return; }
        await DB.update('matieres', id, {nom: nomRaw, coefficient, classe_id});
        Toast.success('Matière modifiée !');
      } else {
        // Création multi-classes + multi-matières séparées par virgule
        const noms = nomRaw.split(',').map(n => n.trim()).filter(n => n.length > 0);
        if (!noms.length) { Toast.error('Saisissez au moins un nom de matière.'); Debounce.release(btn, '<i class="fa-solid fa-save"></i> Créer pour toutes les classes cochées'); return; }
        const checked = Array.from(document.querySelectorAll('.mat-classe-cb:checked'));
        if (!checked.length) { Toast.error('Cochez au moins une classe.'); Debounce.release(btn, '<i class="fa-solid fa-save"></i> Créer pour toutes les classes cochées'); return; }
        let nb = 0;
        for (const nom of noms) {
          for (const cb of checked) {
            await DB.insert('matieres', {nom, coefficient, classe_id: cb.value});
            nb++;
          }
        }
        const nomsList = noms.join(', ');
        Toast.success(`✅ ${noms.length} matière(s) « ${nomsList} » créées pour ${checked.length} classe(s) — ${nb} fiches au total !`);
      }
      Modal.close(); Pages.matieres();
    } catch (err) { Toast.error('Erreur : ' + err.message); Debounce.release(btn, id ? '<i class="fa-solid fa-save"></i> Enregistrer' : '<i class="fa-solid fa-save"></i> Créer pour toutes les classes cochées'); }
  },

  async _deleteMatiere(id) {
    if (!confirm('Supprimer cette matière ? Les notes associées seront perdues.')) return;
    await DB.delete('matieres', id);
    const notes = await DB.query('notes', n => n.matiere_id === id);
    for (const n of notes) await DB.delete('notes', n.id);
    Toast.success('Matière supprimée.'); Pages.matieres();
  },

  // ══════════════════════════════════════════════════════════════════
  // NOTES — Logique primaire / collège
  // ══════════════════════════════════════════════════════════════════
  async notes() {
    setLoading();
    try {
      const user = App.currentUser;
      const isDirecteur = user?.role === 'directeur';
      const classesRaw = await DB.getClassesProf(user);
      const classes = sortClasses(classesRaw); // T4.1 — tri hiérarchique
      const pageTitle = isDirecteur ? 'Consultation des Notes' : 'Saisie des Notes';
      const pageIcon = isDirecteur ? 'fa-eye' : 'fa-pen-to-square';
      const sousTitre = isDirecteur ? 'Lecture seule — aucune modification possible' : (user?.role === 'prof' ? 'Vos classes assignées' : 'Toutes les classes');

      setContent(`
        <div class="page-header">
          <div class="page-header-left"><h2><i class="fa-solid ${pageIcon}" style="color:var(--primary)"></i> ${pageTitle}</h2>
          <p>${sousTitre}</p></div>
        </div>
        <div class="card">
          <div class="card-header" style="flex-wrap:wrap;gap:.75rem">
            <div style="display:flex;gap:.75rem;flex-wrap:wrap">
              <select class="form-control" style="width:auto;min-width:200px" id="notes-classe">
                <option value="">— Choisir la classe —</option>
                ${classes.map(c => `<option value="${c.id}">${formatClasseLabel(c)}</option>`).join('')}
              </select>
              <select class="form-control" style="width:auto" id="notes-seq">
                <option value="1">Séquence 1 (Trim. 1)</option><option value="2">Séquence 2 (Trim. 1)</option>
                <option value="3">Séquence 3 (Trim. 2)</option><option value="4">Séquence 4 (Trim. 2)</option>
                <option value="5">Séquence 5 (Trim. 3)</option><option value="6">Séquence 6 (Trim. 3)</option>
              </select>
              <button class="btn btn-primary" onclick="Pages._loadNoteGrid()"><i class="fa-solid fa-table"></i> Charger la grille</button>
            </div>
          </div>
          <div class="card-body" id="notes-grid">
            <div class="empty-state">
              <i class="fa-solid fa-pen-to-square"></i>
              <h3>Sélectionnez une classe et une séquence</h3>
              <p>puis cliquez sur "Charger la grille" pour saisir les notes</p>
            </div>
          </div>
        </div>`);
      if (!classes.length) {
        document.getElementById('notes-grid').innerHTML = `<div class="empty-state"><i class="fa-solid fa-lock"></i><h3>Aucune classe accessible</h3><p>Vous n'êtes assigné(e) à aucune classe ou matière. Contactez l'administrateur.</p></div>`;
      }
    } catch (err) { setContent(`<div class="empty-state"><i class="fa-solid fa-triangle-exclamation" style="color:var(--danger)"></i><h3>Erreur</h3><p>${err.message}</p></div>`); }
  },

  async _loadNoteGrid() {
    const classeId = document.getElementById('notes-classe').value;
    const seqNum = parseInt(document.getElementById('notes-seq').value);
    if (!classeId) { Toast.error('Choisissez une classe.'); return; }
    const grid = document.getElementById('notes-grid');
    grid.innerHTML = '<div style="text-align:center;padding:2rem"><div class="loading-spinner"></div></div>';

    try {
      const user = App.currentUser;
      const [eleves, matieres, notes, classe] = await Promise.all([
        DB.query('eleves', e => e.classe_id === classeId),
        DB.getMatieresAutoriseesProf(user, classeId),
        DB.query('notes', n => n.sequence === seqNum),
        DB.getById('classes', classeId)
      ]);

      if (!eleves.length) { grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-user-graduate"></i><h3>Aucun élève dans cette classe</h3><p>Inscrivez des élèves dans cette classe d\'abord.</p></div>'; return; }
      if (!matieres.length) {
        const msg = user?.role === 'prof' ? 'Vous n\'êtes assigné(e) à aucune matière dans cette classe. Contactez l\'administrateur.' : 'Aucune matière dans cette classe. Ajoutez des matières d\'abord.';
        grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-book-open"></i><h3>Aucune matière accessible</h3><p>${msg}</p></div>`; return;
      }

      const trimestre = Math.ceil(seqNum / 2);
      const typeClasse = DB.isPrimaire(classe.niveau) ? '🏫 Primaire' : '🎓 Collège';
      const sortedEleves = eleves.sort((a, b) => a.nom.localeCompare(b.nom));

      const isDirecteur = App.currentUser?.role === 'directeur';
      const isAdminRole = App.currentUser?.role === 'admin';
      // Stocker les données pour l'export (T4.3)
      Pages._noteGridData = { eleves: sortedEleves, matieres, seqNum, trimestre, classe, typeClasse };
      let html = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:.75rem">
          <div>
            <strong>Séquence ${seqNum} — Trimestre ${trimestre}</strong>
            <span class="chip" style="margin-left:.5rem">${typeClasse} — ${formatClasseLabel(classe)}</span>
            <span class="chip">${sortedEleves.length} élève(s)</span>
            ${isDirecteur ? '<span class="badge badge-gray"><i class="fa-solid fa-eye"></i> Lecture seule</span>' : ''}
          </div>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap">
            ${!isDirecteur ? `<button class="btn btn-success" onclick="Pages._saveAllNotes(${seqNum}, '${classeId}')"><i class="fa-solid fa-save"></i> Sauvegarder</button>` : ''}
            <button class="btn btn-outline" onclick="Pages._exportNoteGridXlsx()"><i class="fa-solid fa-file-excel" style="color:#217346"></i> Excel</button>
            <button class="btn btn-outline" onclick="Pages._printNoteGrid()"><i class="fa-solid fa-print"></i> PDF</button>
          </div>
        </div>
        <div class="table-wrapper" id="note-grid-table">
        <table>
          <thead><tr>
            <th>Élève</th>
            ${matieres.map(m => `<th style="min-width:90px">${m.nom}<br><small style="font-weight:400;color:var(--gray-500)">Coeff.${m.coefficient}</small></th>`).join('')}
            <th>Moy. Séq.</th>
          </tr></thead>
          <tbody id="note-rows">`;

      sortedEleves.forEach(el => {
        let sommePonderee = 0, sommeCoeff = 0, hasNote = false;
        const notesEleve = notes.filter(n => n.eleve_id === el.id);
        let cellsHtml = '';
        matieres.forEach(mat => {
          const note = notesEleve.find(n => n.matiere_id === mat.id);
          const val = note?.valeur !== null && note?.valeur !== undefined ? note.valeur : '';
          if (val !== '') { sommePonderee += parseFloat(val) * parseFloat(mat.coefficient); sommeCoeff += parseFloat(mat.coefficient); hasNote = true; }
          cellsHtml += `<td><input class="note-input" data-eleve="${el.id}" data-matiere="${mat.id}" type="number" min="0" max="20" step="0.25" value="${val}" placeholder="—" ${isDirecteur ? 'disabled style="background:var(--gray-100)"' : 'oninput="Pages._validateNoteInput(this)"'}></td>`;
        });
        const moy = sommeCoeff > 0 ? (sommePonderee / sommeCoeff).toFixed(2) : null;
        html += `<tr>
          <td><div style="font-weight:600">${el.prenom} ${el.nom}</div><div style="font-size:.72rem;color:var(--gray-500)">${el.matricule}</div></td>
          ${cellsHtml}
          <td id="moy-${el.id}" style="font-weight:700;color:${moy ? (parseFloat(moy)>=10?'var(--secondary)':'var(--danger)') : 'var(--gray-400)'}">${moy || '—'}</td>
        </tr>`;
      });
      html += '</tbody></table></div><div style="margin-top:.75rem;font-size:.8rem;color:var(--gray-500)">💡 Notes sur 20 (0–20). Cliquez sur "Sauvegarder" après la saisie.</div>';
      grid.innerHTML = html;
    } catch (err) { grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation" style="color:var(--danger)"></i><h3>Erreur</h3><p>${err.message}</p></div>`; }
  },

  // T4.3 — Export Excel de la grille de notes (directeur + admin + prof)
  _exportNoteGridXlsx() {
    const d = Pages._noteGridData;
    if (!d) { Toast.error('Chargez d\'abord la grille.'); return; }
    const { eleves, matieres, seqNum, trimestre, classe } = d;
    // En-têtes
    const headers = ['Élève', 'Matricule', ...matieres.map(m => `${m.nom} (C.${m.coefficient})`), 'Moy. Séq.'];
    // Lignes : récupérer les valeurs depuis le DOM
    const rows = eleves.map(el => {
      const inputs = document.querySelectorAll(`input[data-eleve="${el.id}"]`);
      const noteVals = Array.from(inputs).map(inp => inp.value !== '' ? parseFloat(inp.value) : '');
      let sp = 0, sc = 0;
      matieres.forEach((m, i) => {
        const v = noteVals[i];
        if (v !== '' && !isNaN(v)) { sp += v * parseFloat(m.coefficient); sc += parseFloat(m.coefficient); }
      });
      const moy = sc > 0 ? (sp / sc).toFixed(2) : '';
      return [`${el.prenom} ${el.nom}`, el.matricule, ...noteVals, moy];
    });
    const filename = `Grille_Notes_${formatClasseLabel(classe)}_Seq${seqNum}.xlsx`.replace(/\s+/g, '_');
    Export.toXLSX(headers, rows, filename);
  },

  // T4.3 — Impression PDF de la grille de notes
  _printNoteGrid() {
    const d = Pages._noteGridData;
    if (!d) { Toast.error('Chargez d\'abord la grille.'); return; }
    const { eleves, matieres, seqNum, trimestre, classe, typeClasse } = d;
    // Construire le tableau d'impression
    const rows = eleves.map(el => {
      const inputs = document.querySelectorAll(`input[data-eleve="${el.id}"]`);
      const noteVals = Array.from(inputs).map(inp => inp.value !== '' ? parseFloat(inp.value) : null);
      let sp = 0, sc = 0;
      matieres.forEach((m, i) => {
        const v = noteVals[i];
        if (v !== null && !isNaN(v)) { sp += v * parseFloat(m.coefficient); sc += parseFloat(m.coefficient); }
      });
      const moy = sc > 0 ? (sp / sc).toFixed(2) : '—';
      const cells = noteVals.map(v => `<td style="text-align:center;padding:.3rem .5rem">${v !== null ? v : '—'}</td>`).join('');
      return `<tr>
        <td style="padding:.3rem .5rem;font-weight:600">${el.prenom} ${el.nom}</td>
        <td style="padding:.3rem .5rem;font-size:.75rem;color:#666">${el.matricule}</td>
        ${cells}
        <td style="text-align:center;padding:.3rem .5rem;font-weight:700;color:${parseFloat(moy)>=10?'#27ae60':'#e74c3c'}">${moy}</td>
      </tr>`;
    }).join('');
    const thMatieres = matieres.map(m => `<th style="padding:.3rem .5rem;text-align:center;white-space:nowrap">${m.nom}<br><small>C.${m.coefficient}</small></th>`).join('');
    // R11 — PrintHelper (Blob URL iframe modal)
    PrintHelper.show(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>Grille Notes — ${formatClasseLabel(classe)} — Séq.${seqNum}</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:11px;margin:1cm}
        h2{text-align:center;font-size:14px;margin-bottom:.3rem}
        p{text-align:center;color:#555;margin-bottom:.8rem}
        table{border-collapse:collapse;width:100%}
        th,td{border:1px solid #ccc}
        thead th{background:#2c3e50;color:#fff;padding:.35rem .5rem}
        tr:nth-child(even){background:#f5f5f5}
        @media print{body{margin:.5cm}}
      </style></head><body>
      <h2>Grille de Notes — ${formatClasseLabel(classe)} — Séquence ${seqNum} (Trimestre ${trimestre})</h2>
      <p>${typeClasse} — ${eleves.length} élève(s)</p>
      <table>
        <thead><tr>
          <th style="text-align:left;padding:.35rem .5rem">Élève</th>
          <th style="padding:.35rem .5rem">Matricule</th>
          ${thMatieres}
          <th style="padding:.35rem .5rem">Moy. Séq.</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:.8rem;font-size:.75rem;text-align:right">Imprimé le ${new Date().toLocaleDateString('fr-FR')}</p>
    </body></html>`, `Grille Notes — ${formatClasseLabel(classe)} — Séq.${seqNum}`);
  },

  _validateNoteInput(input) {
    const val = parseFloat(input.value);
    input.classList.toggle('invalid', input.value !== '' && (isNaN(val) || val < 0 || val > 20));
    // Recalculer moy ligne
    const eleveId = input.dataset.eleve;
    const row = input.closest('tr');
    if (!row) return;
    const inputs = row.querySelectorAll('.note-input');
    const classeId = document.getElementById('notes-classe').value;
    const matieres = DB._cache[`matieres:all:500`] || [];
    let sp = 0, sc = 0;
    inputs.forEach(inp => {
      const v = parseFloat(inp.value);
      if (!isNaN(v) && v >= 0 && v <= 20) {
        const mat = matieres.find(m => m.id === inp.dataset.matiere);
        if (mat) { sp += v * parseFloat(mat.coefficient); sc += parseFloat(mat.coefficient); }
      }
    });
    const moyEl = document.getElementById(`moy-${eleveId}`);
    if (moyEl) {
      const moy = sc > 0 ? (sp / sc).toFixed(2) : null;
      moyEl.textContent = moy || '—';
      moyEl.style.color = moy ? (parseFloat(moy) >= 10 ? 'var(--secondary)' : 'var(--danger)') : 'var(--gray-400)';
    }
  },

  async _saveAllNotes(seqNum, classeId) {
    const inputs = document.querySelectorAll('.note-input');
    if (Array.from(inputs).some(i => i.classList.contains('invalid'))) {
      Toast.error('Certaines notes sont invalides (0 à 20).'); return;
    }
    const btn = document.querySelector(`button[onclick="Pages._saveAllNotes(${seqNum}, '${classeId}')"]`);
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loading-spinner" style="width:16px;height:16px;border-width:2px"></div> Sauvegarde…'; }

    try {
      const existingNotes = await DB.query('notes', n => n.sequence === seqNum);
      const now = Date.now();
      const VINGT_QUATRE_H = 24 * 60 * 60 * 1000;
      const role = App.currentUser?.role;
      const user = App.currentUser;

      // ── Phase 1 : Classer les modifications (Fix 3 — workflow admin/directeur) ─
      //   • ADMIN : toujours → pending_validation (directeur DOIT valider)
      //             La note N'EST PAS appliquée avant validation
      //   • DIRECTEUR : validé immédiatement, notif admin dans l'audit
      //   • PROF <24h : valide direct, audit consigné
      //   • PROF >24h : pending_validation (directeur valide)
      const modificationsAdmin = [];     // admin → pending, note figée
      const modificationsDirecteur = []; // directeur → validé + notif audit
      const modificationsLourdes = [];   // prof >24h → pending
      const modificationsNormales = [];  // prof <24h → valide direct
      const insertions = [];

      for (const input of inputs) {
        const eleveId = input.dataset.eleve;
        const matiereId = input.dataset.matiere;
        const nouvelleValeur = input.value === '' ? null : parseFloat(input.value);
        const existing = existingNotes.find(n => n.eleve_id === eleveId && n.matiere_id === matiereId);

        if (!existing) {
          // Nouvelle note : insertion directe (pas de conflit anti-fraude)
          insertions.push({ input, nouvelleValeur, eleveId, matiereId });
          continue;
        }

        const ancienneValeur = existing.valeur !== null && existing.valeur !== undefined ? parseFloat(existing.valeur) : null;
        if (ancienneValeur === nouvelleValeur) continue; // aucun changement

        const dateCreation = existing.updated_at || existing.created_at;
        const ageMs = dateCreation ? (now - new Date(parseInt(dateCreation)).getTime()) : VINGT_QUATRE_H + 1;

        if (role === 'admin') {
          modificationsAdmin.push({ input, existing, ancienneValeur, nouvelleValeur, eleveId, matiereId });
        } else if (role === 'directeur') {
          modificationsDirecteur.push({ input, existing, ancienneValeur, nouvelleValeur, eleveId, matiereId });
        } else if (ageMs > VINGT_QUATRE_H) {
          modificationsLourdes.push({ input, existing, ancienneValeur, nouvelleValeur, eleveId, matiereId });
        } else {
          modificationsNormales.push({ input, existing, ancienneValeur, nouvelleValeur, eleveId, matiereId });
        }
      }

      // ── Fix 3-A : ADMIN → pending obligatoire, note PAS appliquée ─────────────
      if (modificationsAdmin.length > 0) {
        const nb = modificationsAdmin.length;
        const liste = modificationsAdmin.map(m => `  • ${m.ancienneValeur ?? '—'} → ${m.nouvelleValeur ?? '—'}`).join('\n');
        const motif = window.prompt(
          `🔐 MODIFICATION ADMIN — ${nb} note(s)\n${liste}\n\nCette modification sera envoyée au Directeur pour approbation.\nVotre demande sera SUSPENDUE jusqu'à validation.\n\nEntrez le motif obligatoire :`
        );
        if (motif === null) {
          if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-save"></i> Sauvegarder toutes les notes'; }
          return;
        }
        if (!motif.trim()) {
          Toast.error('Le motif est obligatoire.');
          if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-save"></i> Sauvegarder toutes les notes'; }
          return;
        }
        for (const { existing, ancienneValeur, nouvelleValeur, eleveId, matiereId } of modificationsAdmin) {
          // Enregistrer dans l'audit SANS appliquer la note (valeur figée)
          await DB.insert('notes_audit_log', {
            note_id: existing.id, eleve_id: eleveId, matiere_id: matiereId,
            sequence: seqNum, ancienne_valeur: ancienneValeur, nouvelle_valeur: nouvelleValeur,
            modifie_par_id: user?.id || '', modifie_par_nom: `${user?.prenom||''} ${user?.nom||''}`.trim(),
            motif, statut: 'pending_validation',
            valide_par_id: '', date_modification: now,
            soumis_par_role: 'admin'
          });
          // NOTE : La valeur de la note N'EST PAS modifiée ici — le directeur appliquera via _validateAudit
        }
        Toast.info(`📤 ${nb} modification(s) envoyée(s) au Directeur pour validation. Votre demande est en attente.`);
        App._refreshAuditBadge();
      }

      // ── Fix 3-B : DIRECTEUR → validé immédiatement + audit pour traçabilité ──
      if (modificationsDirecteur.length > 0) {
        const nb = modificationsDirecteur.length;
        const liste = modificationsDirecteur.map(m => `  • ${m.ancienneValeur ?? '—'} → ${m.nouvelleValeur ?? '—'}`).join('\n');
        const motif = window.prompt(
          `📝 MODIFICATION DIRECTEUR — ${nb} note(s)\n${liste}\n\nVotre modification sera validée immédiatement et tracée dans le journal d'audit.\n\nEntrez le motif de correction :`
        );
        if (motif === null) {
          if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-save"></i> Sauvegarder toutes les notes'; }
          return;
        }
        for (const { existing, ancienneValeur, nouvelleValeur, eleveId, matiereId } of modificationsDirecteur) {
          await DB.insert('notes_audit_log', {
            note_id: existing.id, eleve_id: eleveId, matiere_id: matiereId,
            sequence: seqNum, ancienne_valeur: ancienneValeur, nouvelle_valeur: nouvelleValeur,
            modifie_par_id: user?.id || '', modifie_par_nom: `${user?.prenom||''} ${user?.nom||''}`.trim(),
            motif: motif?.trim() || 'Correction directeur',
            statut: 'valide',
            valide_par_id: user?.id || '', valide_par_nom: `${user?.prenom||''} ${user?.nom||''}`.trim(),
            date_modification: now, soumis_par_role: 'directeur'
          });
          await DB.update('notes', existing.id, { valeur: nouvelleValeur });
        }
        Toast.success(`✅ ${nb} modification(s) du directeur appliquée(s) et tracée(s) dans le journal.`);
      }

      // ── Phase : PROF >24h — motif + pending ───────────────────────────────────
      if (modificationsLourdes.length > 0) {
        const nb = modificationsLourdes.length;
        const liste = modificationsLourdes.map(m => `  • ${m.ancienneValeur ?? '—'} → ${m.nouvelleValeur ?? '—'}`).join('\n');
        const motif = window.prompt(
          `⚠️ MODIFICATION ANTI-FRAUDE — ${nb} note(s) de plus de 24h\n${liste}\n\nCes modifications nécessitent la validation du Directeur.\n\nEntrez le motif obligatoire :`
        );
        if (motif === null) {
          if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-save"></i> Sauvegarder toutes les notes'; }
          return;
        }
        if (!motif.trim()) {
          Toast.error('Le motif est obligatoire.');
          if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-save"></i> Sauvegarder toutes les notes'; }
          return;
        }
        for (const { existing, ancienneValeur, nouvelleValeur, eleveId, matiereId } of modificationsLourdes) {
          await DB.insert('notes_audit_log', {
            note_id: existing.id, eleve_id: eleveId, matiere_id: matiereId,
            sequence: seqNum, ancienne_valeur: ancienneValeur, nouvelle_valeur: nouvelleValeur,
            modifie_par_id: user?.id || '', modifie_par_nom: `${user?.prenom||''} ${user?.nom||''}`.trim(),
            motif, statut: 'pending_validation', valide_par_id: '', date_modification: now,
            soumis_par_role: 'prof'
          });
          // Note PAS appliquée avant validation directeur
        }
        Toast.info(`📋 ${nb} modification(s) en attente de validation du Directeur.`);
        App._refreshAuditBadge();
      }

      // ── PROF <24h — confirmation + audit + application directe ───────────────
      if (modificationsNormales.length > 0) {
        const ok = confirm(`Vous modifiez ${modificationsNormales.length} note(s) récente(s). Ces changements seront consignés dans le journal. Continuer ?`);
        if (!ok) {
          if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-save"></i> Sauvegarder toutes les notes'; }
          return;
        }
        for (const { existing, ancienneValeur, nouvelleValeur, eleveId, matiereId } of modificationsNormales) {
          await DB.insert('notes_audit_log', {
            note_id: existing.id, eleve_id: eleveId, matiere_id: matiereId,
            sequence: seqNum, ancienne_valeur: ancienneValeur, nouvelle_valeur: nouvelleValeur,
            modifie_par_id: user?.id || '', modifie_par_nom: `${user?.prenom||''} ${user?.nom||''}`.trim(),
            motif: 'Correction dans les 24h', statut: 'valide',
            valide_par_id: user?.id || '', date_modification: now, soumis_par_role: 'prof'
          });
          await DB.update('notes', existing.id, { valeur: nouvelleValeur });
        }
      }

      // ── Phase 4 : Nouvelles insertions ────────────────────────────────────────
      for (const { nouvelleValeur, eleveId, matiereId } of insertions) {
        await DB.insert('notes', { eleve_id: eleveId, matiere_id: matiereId, sequence: seqNum, valeur: nouvelleValeur, classe_id: classeId });
      }

      const totalSaved = modificationsLourdes.length + modificationsNormales.length + insertions.length;
      if (totalSaved > 0 && modificationsLourdes.length === 0) {
        Toast.success(`✅ ${totalSaved} note(s) sauvegardée(s) !`);
      }
    } catch (err) { Toast.error('Erreur : ' + err.message); }
    finally { if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-save"></i> Sauvegarder toutes les notes'; } }
  },

  // ══════════════════════════════════════════════════════════════════
  // BULLETINS
  // ══════════════════════════════════════════════════════════════════
  async bulletins() {
    setLoading();
    try {
      const user = App.currentUser;
      const classesRaw = await DB.getClassesProf(user);
      const classes = sortClasses(classesRaw); // T4.1 — tri hiérarchique
      setContent(`
        <div class="page-header">
          <div class="page-header-left"><h2><i class="fa-solid fa-file-lines" style="color:var(--primary)"></i> Bulletins Scolaires</h2><p>Visualisez et imprimez les bulletins des élèves</p></div>
        </div>
        <div class="card">
          <div class="card-header" style="flex-wrap:wrap;gap:.75rem">
            <div style="display:flex;gap:.75rem;flex-wrap:wrap">
              <select class="form-control" style="width:auto;min-width:200px" id="bul-classe">
                <option value="">— Choisir la classe —</option>
                ${classes.map(c => `<option value="${c.id}">${formatClasseLabel(c)}</option>`).join('')}
              </select>
              <select class="form-control" style="width:auto" id="bul-type" onchange="Pages._onBulletinTypeChange()">
                <option value="seq">Par Séquence</option>
                <option value="tri">Par Trimestre</option>
                <option value="sem">Par Semestre</option>
                <option value="ann">Annuel</option>
              </select>
              <select class="form-control" style="width:auto" id="bul-num">
                <option value="1">Séquence 1</option><option value="2">Séquence 2</option>
                <option value="3">Séquence 3</option><option value="4">Séquence 4</option>
                <option value="5">Séquence 5</option><option value="6">Séquence 6</option>
              </select>
              <button class="btn btn-primary" onclick="Pages._loadBulletins()"><i class="fa-solid fa-list"></i> Afficher</button>
            </div>
          </div>
          <div class="card-body" id="bulletins-list">
            <div class="empty-state"><i class="fa-solid fa-file-lines"></i><h3>Sélectionnez une classe</h3><p>Choisissez une classe et une période puis cliquez sur "Afficher"</p></div>
          </div>
        </div>`);
    } catch(err) { setContent(`<div class="empty-state"><h3>Erreur</h3><p>${err.message}</p></div>`); }
  },

  _onBulletinTypeChange() {
    const type = document.getElementById('bul-type').value;
    const num = document.getElementById('bul-num');
    if (type === 'ann') num.innerHTML = '<option value="0">Toute l\'année</option>';
    else if (type === 'tri') num.innerHTML = '<option value="1">Trimestre 1</option><option value="2">Trimestre 2</option><option value="3">Trimestre 3</option>';
    else if (type === 'sem') num.innerHTML = '<option value="1">Semestre 1 (Séq. 1-3)</option><option value="2">Semestre 2 (Séq. 4-6)</option>';
    else num.innerHTML = '<option value="1">Séquence 1</option><option value="2">Séquence 2</option><option value="3">Séquence 3</option><option value="4">Séquence 4</option><option value="5">Séquence 5</option><option value="6">Séquence 6</option>';
  },

  async _loadBulletins() {
    const classeId = document.getElementById('bul-classe').value;
    if (!classeId) { Toast.error('Choisissez une classe.'); return; }
    const type = document.getElementById('bul-type').value;
    const num = parseInt(document.getElementById('bul-num').value);
    const listEl = document.getElementById('bulletins-list');
    listEl.innerHTML = '<div style="text-align:center;padding:2rem"><div class="loading-spinner"></div></div>';
    try {
      const [eleves, classe, matieres, allNotes] = await Promise.all([
        DB.query('eleves', e => e.classe_id === classeId),
        DB.getById('classes', classeId),
        DB.query('matieres', m => m.classe_id === classeId),
        DB.getAll('notes')
      ]);
      if (!eleves.length) { listEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-user-graduate"></i><h3>Aucun élève</h3></div>'; return; }
      const sorted = eleves.sort((a, b) => a.nom.localeCompare(b.nom));

      // Fix 6 — Déterminer les séquences impliquées selon le type de période
      // sem: Semestre 1 = Séq. 1-2-3, Semestre 2 = Séq. 4-5-6
      const getSeqsForPeriod = () => {
        if (type === 'seq') return [num];
        if (type === 'tri') return [(num-1)*2+1, (num-1)*2+2];
        if (type === 'sem') return num === 1 ? [1,2,3] : [4,5,6];
        return [1,2,3,4,5,6]; // ann
      };
      const seqsActives = getSeqsForPeriod();

      // Fix 6 — Masquage séquences vides : ne garder que celles avec ≥1 note dans la classe
      const seqsAvecNotes = seqsActives.filter(s =>
        allNotes.some(n => n.sequence === s && sorted.some(el => el.id === n.eleve_id) && n.valeur !== null && n.valeur !== undefined && n.valeur !== '')
      );
      // Si aucune séquence n'a de note, on affiche quand même la première pour ne pas bloquer
      const seqsVisibles = seqsAvecNotes.length > 0 ? seqsAvecNotes : (seqsActives.length > 0 ? [seqsActives[0]] : [1]);

      // Helper : moyenne pour une séquence donnée, pour un élève
      const getMoySeqEl = (el, s) => {
        const notes = allNotes.filter(n => n.eleve_id === el.id && n.sequence === s);
        let sp = 0, sc = 0;
        matieres.forEach(m => {
          const n = notes.find(x => x.matiere_id === m.id);
          if (n?.valeur !== null && n?.valeur !== undefined && n?.valeur !== '') {
            sp += parseFloat(n.valeur) * parseFloat(m.coefficient); sc += parseFloat(m.coefficient);
          }
        });
        return sc > 0 ? parseFloat((sp/sc).toFixed(2)) : null;
      };

      // Pré-calculer moyennes
      const getMoy = (el) => {
        if (type === 'seq') {
          return getMoySeqEl(el, num);
        } else if (type === 'tri') {
          const [m1, m2] = [(num-1)*2+1, (num-1)*2+2].map(s => getMoySeqEl(el, s));
          const vs = [m1, m2].filter(v => v !== null);
          return vs.length ? parseFloat((vs.reduce((a,b)=>a+b,0)/vs.length).toFixed(2)) : null;
        } else if (type === 'sem') {
          // Fix 6 — Moyenne Semestre : moyenne des séquences visibles (avec notes) de ce semestre
          const seqsMoyennes = seqsVisibles.map(s => getMoySeqEl(el, s)).filter(v => v !== null);
          return seqsMoyennes.length ? parseFloat((seqsMoyennes.reduce((a,b)=>a+b,0)/seqsMoyennes.length).toFixed(2)) : null;
        } else {
          // Annuel : moyenne des 3 trimestres
          const trims = [1,2,3].map(t => {
            const [m1,m2] = [(t-1)*2+1,(t-1)*2+2].map(s => getMoySeqEl(el, s));
            const vs = [m1,m2].filter(v=>v!==null);
            return vs.length ? parseFloat((vs.reduce((a,b)=>a+b,0)/vs.length).toFixed(2)) : null;
          }).filter(v=>v!==null);
          return trims.length ? parseFloat((trims.reduce((a,b)=>a+b,0)/trims.length).toFixed(2)) : null;
        }
      };

      const moyennes = sorted.map(el => ({ el, moy: getMoy(el) }));
      const ranked = [...moyennes].filter(x=>x.moy!==null).sort((a,b)=>b.moy-a.moy);

      const periodeLabel = type==='seq'?`Séquence ${num}`:type==='tri'?`Trimestre ${num}`:type==='sem'?`Semestre ${num}`:'Annuel';
      let html = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:.5rem">
        <strong>${sorted.length} élève(s) — ${classe ? formatClasseLabel(classe) : '—'} — ${periodeLabel}</strong>
        <button class="btn btn-outline btn-sm" onclick="Pages._printAllBulletins('${classeId}','${type}',${num})"><i class="fa-solid fa-print"></i> Imprimer tous</button>
      </div>
      <div class="table-wrapper"><table>
        <thead><tr><th>Rang</th><th>Élève</th><th>Moy. générale</th><th>Appréciation</th><th>Mention</th><th>Action</th></tr></thead><tbody>`;

      moyennes.forEach(({ el, moy }) => {
        const rang = moy !== null ? ranked.findIndex(x => x.el.id === el.id) + 1 : null;
        html += `<tr>
          <td>${rang ? `<strong>#${rang}</strong>` : '—'}</td>
          <td><div style="font-weight:600">${el.prenom} ${el.nom}</div><small style="color:var(--gray-500)">${el.matricule}</small></td>
          <td><strong style="font-size:1.05rem;color:${moy!==null?(moy>=10?'var(--secondary)':'var(--danger)'):'var(--gray-400)'}">${moy!==null?moy+'/20':'—'}</strong></td>
          <td>${moy!==null?Fmt.appreciation(moy):'—'}</td>
          <td>${moy!==null&&DB.getMention(moy)?`<span class="badge badge-success">${DB.getMention(moy)}</span>`:'—'}</td>
          <td><button class="btn btn-outline btn-sm" onclick="Pages._showBulletin('${el.id}','${classeId}','${type}',${num})"><i class="fa-solid fa-print"></i> Imprimer</button></td>
        </tr>`;
      });
      listEl.innerHTML = html + '</tbody></table></div>';
    } catch (err) { listEl.innerHTML = `<div class="empty-state"><h3>Erreur</h3><p>${err.message}</p></div>`; }
  },

  async _showBulletin(eleveId, classeId, type, num) {
    try {
      const [eleve, classe, matieres, allNotes, cfg, allUsers, allEleves] = await Promise.all([
        DB.getById('eleves', eleveId), DB.getById('classes', classeId),
        DB.query('matieres', m => m.classe_id === classeId),
        DB.getAll('notes'), DB.getEcoleConfig(),
        DB.getAll('utilisateurs'),
        DB.query('eleves', e => e.classe_id === classeId)
      ]);

      // Enseignant responsable
      const profResponsable = allUsers.find(u =>
        u.role === 'prof' && u.classe_id === classeId
      ) || allUsers.find(u =>
        u.role === 'prof' && u.matieres_ids?.some(mId => matieres.find(m => m.id === mId))
      );
      const nomProf = profResponsable ? `${profResponsable.prenom || ''} ${profResponsable.nom || ''}`.trim() : '—';

      const typeLabel = type==='seq'?`Bulletin Séquence ${num}`:type==='tri'?`Bulletin Trimestre ${num}`:type==='sem'?`Bulletin Semestre ${num}`:'Bulletin Annuel';
      const periodeLabel = type==='seq'?`Séquence ${num} — Trimestre ${Math.ceil(num/2)}`:type==='tri'?`Trimestre ${num}`:type==='sem'?`Semestre ${num}`:`Année scolaire complète`;
      const annee = `${new Date().getFullYear()-1}/${new Date().getFullYear()}`;

      // Helper séquences pour tri/ann
      const getSeqVal = (matId, seqNum) => {
        const n = allNotes.find(x => x.eleve_id===eleveId && x.matiere_id===matId && x.sequence===seqNum);
        return (n?.valeur !== null && n?.valeur !== undefined && n?.valeur !== '') ? parseFloat(n.valeur) : null;
      };

      // Fix 6 — Déterminer séquences visibles (avec au moins une note dans la classe)
      const getSeqsForPeriodBul = () => {
        if (type === 'seq') return [num];
        if (type === 'tri') return [(num-1)*2+1, (num-1)*2+2];
        if (type === 'sem') return num === 1 ? [1,2,3] : [4,5,6];
        return [1,2,3,4,5,6];
      };
      const allSeqsForPeriod = getSeqsForPeriodBul();
      // Séquences visibles : celles avec ≥1 note pour au moins un élève de la classe
      const seqsVisiInBul = type === 'seq' ? allSeqsForPeriod : allSeqsForPeriod.filter(s =>
        allNotes.some(n => n.sequence === s && allEleves.some(el => el.id === n.eleve_id) && n.valeur !== null && n.valeur !== undefined && n.valeur !== '')
      );
      const seqsVisiblesBul = seqsVisiInBul.length > 0 ? seqsVisiInBul : allSeqsForPeriod;

      let noteRows = '', sp = 0, sc = 0;
      matieres.forEach(mat => {
        let valeur = null;
        let seqCols = '';

        if (type === 'seq') {
          const n = allNotes.find(x => x.eleve_id===eleveId&&x.matiere_id===mat.id&&x.sequence===num);
          valeur = (n?.valeur !== null && n?.valeur !== undefined && n?.valeur !== '') ? parseFloat(n.valeur) : null;
        } else if (type === 'tri') {
          const s1=(num-1)*2+1, s2=s1+1;
          const v1 = getSeqVal(mat.id, s1), v2 = getSeqVal(mat.id, s2);
          const vs = [v1, v2].filter(v => v !== null);
          valeur = vs.length ? parseFloat((vs.reduce((a,b)=>a+b,0)/vs.length).toFixed(2)) : null;
          // Fix 6 — n'afficher que les colonnes de séquences visibles
          seqCols = seqsVisiblesBul.map(s => { const v = getSeqVal(mat.id, s); return `<td style="text-align:center;font-size:.78rem">${v!==null?v.toFixed(1):'—'}</td>`; }).join('');
        } else if (type === 'sem') {
          // Fix 6 — Semestre : moyenne des séquences visibles de ce semestre
          const seqVals = seqsVisiblesBul.map(s => getSeqVal(mat.id, s));
          const vs = seqVals.filter(v => v !== null);
          valeur = vs.length ? parseFloat((vs.reduce((a,b)=>a+b,0)/vs.length).toFixed(2)) : null;
          seqCols = seqsVisiblesBul.map((s, i) => { const v = seqVals[i]; return `<td style="text-align:center;font-size:.78rem">${v!==null?v.toFixed(1):'—'}</td>`; }).join('');
        } else {
          // Annuel — colonnes des séquences visibles seulement
          const seqVals = seqsVisiblesBul.map(s => getSeqVal(mat.id, s));
          const vs = seqVals.filter(v => v !== null);
          valeur = vs.length ? parseFloat((vs.reduce((a,b)=>a+b,0)/vs.length).toFixed(2)) : null;
          seqCols = seqsVisiblesBul.map((s, i) => { const v = seqVals[i]; return `<td style="text-align:center;font-size:.78rem">${v!==null?v.toFixed(1):'—'}</td>`; }).join('');
        }

        if (valeur !== null) { sp += valeur * parseFloat(mat.coefficient); sc += parseFloat(mat.coefficient); }

        noteRows += `<tr>
          <td>${mat.nom}</td>
          <td style="text-align:center">${mat.coefficient}</td>
          ${seqCols}
          <td style="text-align:center;font-weight:700;color:${valeur!==null?(valeur>=10?'#2e7d32':'#c62828'):'#aaa'}">${valeur!==null?valeur.toFixed(2):'—'}</td>
          <td style="text-align:center">${valeur!==null?DB.getAppreciation(valeur):'—'}</td>
        </tr>`;
      });

      const moyGen = sc > 0 ? (sp/sc).toFixed(2) : null;
      const mention = moyGen ? DB.getMention(parseFloat(moyGen)) : '';

      // Fix 6 — En-têtes de colonnes séquences : uniquement les séquences visibles
      const nbSeqCols = type === 'seq' ? 0 : seqsVisiblesBul.length;
      const seqHeaders = type === 'seq' ? '' :
        seqsVisiblesBul.map(s => `<th style="text-align:center;font-size:.78rem">Séq.${s}</th>`).join('');

      // Logo ou placeholder — T4.2 : base64 prioritaire sur URL
      const _logoSrc1 = cfg?.logo_base64 || cfg?.logo_url || '';
      const logoHtml = _logoSrc1
        ? `<img src="${_logoSrc1}" style="max-height:65px;max-width:80px;object-fit:contain" alt="Logo école">`
        : `<div style="width:65px;height:65px;border:2px solid var(--gray-400);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.7rem;color:var(--gray-500);text-align:center">LOGO</div>`;

      Modal.open(`📄 ${typeLabel} — ${eleve?.prenom} ${eleve?.nom}`, `
        <div class="bulletin-container" id="bulletin-content">
          <!-- EN-TÊTE OFFICIEL 3 COLONNES -->
          <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;margin-bottom:.6rem;border-bottom:2px solid #1a237e;padding-bottom:.5rem">
            <div style="text-align:left;font-size:.8rem;line-height:1.5">
              <div style="font-weight:700;font-size:1rem;color:#1a237e">${cfg?.nom||'École'}</div>
              <div style="color:#555;margin-top:.15rem">${cfg?.adresse||''}</div>
              ${cfg?.telephone ? `<div style="color:#555">Tél : ${cfg.telephone}${cfg?.email?' • '+cfg.email:''}</div>` : (cfg?.email ? `<div style="color:#555">${cfg.email}</div>` : '')}
            </div>
            <div style="text-align:center">${logoHtml}</div>
            <div style="text-align:right;font-size:.77rem;line-height:1.7;color:#333">
              <div style="font-weight:700">République de Guinée</div>
              <div>Travail — Justice — Solidarité</div>
              <div>Ministère MENA / ETFP</div>
              <div>IRE — DCE — DSCE</div>
              <div style="margin-top:4px;font-weight:600">Année : ${annee}</div>
            </div>
          </div>

          <div style="text-align:center;font-weight:700;font-size:.95rem;text-transform:uppercase;margin-bottom:.5rem">
            Bulletin ${periodeLabel} — ${classe ? formatClasseLabel(classe) : ''}
          </div>

          <!-- IDENTIFICATION EN TABLEAU 2 LIGNES (modèle unifié) -->
          <table border="1" cellpadding="4" style="width:100%;border-collapse:collapse;font-size:.82rem;margin-bottom:.75rem">
            <tr>
              <td><b>Matricule :</b> ${eleve?.matricule||'—'}</td>
              <td><b>Nom & Prénom :</b> <strong>${eleve?.nom} ${eleve?.prenom}</strong></td>
              <td><b>Classe :</b> ${classe ? formatClasseLabel(classe) : '—'}</td>
              <td><b>Effectif :</b> ${allEleves.length} élève(s)</td>
            </tr>
            <tr>
              <td><b>Né(e) le :</b> ${eleve?.date_naissance ? Fmt.date(eleve.date_naissance) : '—'}</td>
              <td><b>Sexe :</b> ${eleve?.sexe==='M'?'Masculin':'Féminin'}</td>
              <td><b>Enseignant responsable :</b> ${nomProf}</td>
              <td><b>Période :</b> ${periodeLabel}</td>
            </tr>
          </table>

          <!-- TABLEAU DES NOTES — espacé du bloc d'identification -->
          <table class="bulletin-table" style="margin-top:.5rem">
            <thead>
              <tr>
                <th>Matière</th><th>Coeff.</th>
                ${seqHeaders}
                <th>Note /20</th><th>Appréciation</th>
              </tr>
            </thead>
            <tbody>
              ${noteRows}
              <tr class="bulletin-avg-row">
                <td colspan="${2 + nbSeqCols}" style="text-align:right">MOYENNE GÉNÉRALE :</td>
                <td style="text-align:center;font-size:1.05rem;color:${moyGen?(parseFloat(moyGen)>=10?'#2e7d32':'#c62828'):'#aaa'}">${moyGen?moyGen+'/20':'—'}</td>
                <td>${moyGen?DB.getAppreciation(parseFloat(moyGen)):'—'}</td>
              </tr>
            </tbody>
          </table>

          ${mention ? `<div style="text-align:center;padding:.4rem;background:#e8f5e9;border-radius:5px;font-weight:700;color:#2e7d32;margin:.5rem 0;border:1px solid #a5d6a7">🏆 ${mention}</div>` : '<div style="height:.3rem"></div>'}

          <!-- BLOC 3 SIGNATURES — sans traits horizontaux -->
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.5rem;margin-top:.6rem;font-size:.8rem">
            <div style="text-align:center;padding:.3rem">
              <div style="font-weight:600">Le Directeur / La Directrice</div>
              <div style="height:2rem"></div>
            </div>
            <div style="text-align:center;padding:.3rem">
              <div style="font-weight:600">L'Enseignant(e) Responsable</div>
              <div style="font-size:.73rem;color:var(--gray-600)">${nomProf}</div>
              <div style="height:1.5rem"></div>
            </div>
            <div style="text-align:center;padding:.3rem">
              <div style="font-weight:600">Signature des Parents</div>
              <div style="font-size:.73rem;color:var(--gray-600)">(Lu et approuvé)</div>
              <div style="height:1.5rem"></div>
            </div>
          </div>
          <div style="text-align:right;font-size:.68rem;color:#aaa;margin-top:.3rem">Imprimé le ${new Date().toLocaleDateString('fr-FR')}</div>
        </div>`,
        `<button class="btn btn-outline" onclick="Modal.close()">Fermer</button>
         <button class="btn btn-primary" onclick="Pages._printBulletin()"><i class="fa-solid fa-print"></i> Imprimer le bulletin</button>`,
        'modal-lg');
    } catch (err) { Toast.error('Erreur : ' + err.message); }
  },

  // Fix 4 — Impression bulletin individuel : fenêtre dédiée propre (pas de voile gris)
  _printBulletin() {
    const content = document.getElementById('bulletin-content');
    if (!content) { Toast.error('Aucun bulletin à imprimer.'); return; }
    // Cloner proprement le DOM sans les boutons ni overlays
    const clone = content.cloneNode(true);
    clone.querySelectorAll('button,.btn,.no-print,.modal-overlay,.modal-backdrop,[class*="overlay"]').forEach(el => el.remove());
    const cleanHTML = clone.innerHTML;
    // R11 — PrintHelper (Blob URL iframe modal)
    PrintHelper.show(`<!DOCTYPE html><html lang="fr"><head>
      <meta charset="UTF-8">
      <title>Bulletin</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        html,body{background:#ffffff!important;font-family:Arial,sans-serif;font-size:9pt;color:#000;padding:.8cm 1cm}
        table{border-collapse:collapse;width:100%}
        th,td{border:1pt solid #333;padding:3pt 5pt;font-size:8.5pt}
        thead th{background:#1a237e!important;color:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        .no-print,button,.btn{display:none!important}
        tr:nth-child(even){background:#fafafa}
        @page{size:A4 portrait;margin:.8cm 1cm}
        @media print{html,body{background:#fff!important}}
      </style></head><body>
      ${cleanHTML}
    </body></html>`, 'Bulletin Scolaire');
  },

  async _printAllBulletins(classeId, type, num) {
    const btn = event?.target;
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loading-spinner" style="width:14px;height:14px;border-width:2px;display:inline-block"></div> Préparation…'; }
    try {
      const [eleves, classe, matieres, allNotes, cfg, allUsers] = await Promise.all([
        DB.query('eleves', e => e.classe_id === classeId), DB.getById('classes', classeId),
        DB.query('matieres', m => m.classe_id === classeId), DB.getAll('notes'),
        DB.getEcoleConfig(), DB.getAll('utilisateurs')
      ]);

      // Trouver l'enseignant responsable de la classe
      const profResponsable = allUsers.find(u =>
        u.role === 'prof' && u.classe_id === classeId
      ) || allUsers.find(u =>
        u.role === 'prof' && u.matieres_ids?.some(mId => matieres.find(m => m.id === mId))
      );
      const nomProf = profResponsable ? `${profResponsable.prenom || ''} ${profResponsable.nom || ''}`.trim() : '—';

      const sorted = eleves.sort((a, b) => a.nom.localeCompare(b.nom));
      const periodeLabel = type==='seq'?`Séquence ${num}`:type==='tri'?`Trimestre ${num}`:'Annuel';
      const annee = `${new Date().getFullYear()-1}/${new Date().getFullYear()}`;

      // ── Index des notes (élève|matière|séquence) ────────────────────
      // Sans cet index, chaque case du bulletin parcourait toute la table des
      // notes → génération en boucle sur les grandes classes. Ici : 1 passage.
      const noteIdx = new Map();
      for (const n of allNotes) {
        noteIdx.set(`${n.eleve_id}|${n.matiere_id}|${n.sequence}`, n);
      }
      const noteVal = (eleveId, matId, seq) => {
        const v = noteIdx.get(`${eleveId}|${matId}|${seq}`)?.valeur;
        return (v !== null && v !== undefined && v !== '') ? parseFloat(v) : null;
      };

      // Helper : calcul valeur selon type
      const getValeur = (eleveId, matId) => {
        if (type === 'seq') {
          return noteVal(eleveId, matId, num);
        } else if (type === 'tri') {
          const s1=(num-1)*2+1, s2=s1+1;
          const vs = [noteVal(eleveId, matId, s1), noteVal(eleveId, matId, s2)].filter(v => v !== null);
          return vs.length ? parseFloat((vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(2)) : null;
        } else {
          const allV = [];
          for (let s=1; s<=6; s++) {
            const v = noteVal(eleveId, matId, s);
            if (v !== null) allV.push(v);
          }
          return allV.length ? parseFloat((allV.reduce((a,b)=>a+b,0)/allV.length).toFixed(2)) : null;
        }
      };

      // Colonnes de séquences pour tri/ann
      const getSeqHeaders = () => {
        if (type === 'seq') return '';
        if (type === 'tri') return `<th align="center" style="font-size:7pt">Séq.${(num-1)*2+1}</th><th align="center" style="font-size:7pt">Séq.${(num-1)*2+2}</th>`;
        return `<th align="center" style="font-size:7pt">S1</th><th align="center" style="font-size:7pt">S2</th><th align="center" style="font-size:7pt">S3</th><th align="center" style="font-size:7pt">S4</th><th align="center" style="font-size:7pt">S5</th><th align="center" style="font-size:7pt">S6</th>`;
      };
      const getSeqValues = (eleveId, matId) => {
        if (type === 'seq') return '';
        const cell = (v) => `<td align="center" style="font-size:7pt">${v !== null ? v.toFixed(1) : '—'}</td>`;
        if (type === 'tri') {
          const s1=(num-1)*2+1, s2=s1+1;
          return cell(noteVal(eleveId, matId, s1)) + cell(noteVal(eleveId, matId, s2));
        }
        return [1,2,3,4,5,6].map(s => cell(noteVal(eleveId, matId, s))).join('');
      };

      // En-tête officiel 3 colonnes — T4.2 : base64 prioritaire sur URL
      const _logoSrc2 = cfg?.logo_base64 || cfg?.logo_url || '';
      const logoHtml = _logoSrc2
        ? `<img src="${_logoSrc2}" style="max-height:70px;max-width:90px;object-fit:contain" alt="Logo">`
        : `<div style="width:70px;height:70px;border:2px solid #333;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:8pt;text-align:center;color:#555">LOGO</div>`;

      const buildHeader = () => `
        <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8pt;align-items:center;margin-bottom:.3cm;border-bottom:2pt solid #333;padding-bottom:.2cm">
          <div style="text-align:left;font-size:8pt;line-height:1.5">
            <div style="font-size:11pt;font-weight:bold;color:#1a237e">${cfg?.nom||'ÉCOLE'}</div>
            <div>${cfg?.adresse||''}</div>
            <div>${cfg?.telephone?'Tél: '+cfg.telephone:''} ${cfg?.email?'• '+cfg.email:''}</div>
          </div>
          <div style="text-align:center">${logoHtml}</div>
          <div style="text-align:right;font-size:7.5pt;line-height:1.6;color:#333">
            <div style="font-weight:bold">République de Guinée</div>
            <div>Travail — Justice — Solidarité</div>
            <div>Ministère MENA/ETFP</div>
            <div>IRE — DCE — DSCE</div>
            <div style="margin-top:3pt">Année : ${annee}</div>
          </div>
        </div>`;

      let allHtml = '';

      // Traitement par lots : la page reste réactive et l'utilisateur voit la
      // progression au lieu d'un écran figé.
      let _idx = 0;
      for (const eleve of sorted) {
        if (++_idx % 15 === 0) {
          if (btn) btn.innerHTML = `<div class="loading-spinner" style="width:14px;height:14px;border-width:2px;display:inline-block"></div> ${_idx}/${sorted.length}…`;
          await new Promise(r => setTimeout(r, 0));
        }
        let noteRows = '', sp = 0, sc = 0;
        matieres.forEach(mat => {
          const valeur = getValeur(eleve.id, mat.id);
          if (valeur !== null) { sp += valeur * parseFloat(mat.coefficient); sc += parseFloat(mat.coefficient); }
          noteRows += `<tr>
            <td>${mat.nom}</td>
            <td align="center">${mat.coefficient}</td>
            ${getSeqValues(eleve.id, mat.id)}
            <td align="center" style="font-weight:bold;color:${valeur!==null?(valeur>=10?'#1b5e20':'#b71c1c'):'#888'}">${valeur!==null?valeur.toFixed(2):'—'}</td>
            <td align="center" style="font-size:7.5pt">${valeur!==null?DB.getAppreciation(valeur):'—'}</td>
          </tr>`;
        });
        const moyGen = sc > 0 ? (sp/sc).toFixed(2) : null;
        const mention = moyGen ? DB.getMention(parseFloat(moyGen)) : '';

        // CHAQUE BULLETIN = classe .bulletin-page pour forcer le saut de page
        allHtml += `<div class="bulletin-page" style="padding:.4cm;font-family:Arial,sans-serif;font-size:8.5pt">
          ${buildHeader()}
          <div style="text-align:center;margin:.2cm 0;font-size:10pt;font-weight:bold;text-transform:uppercase">
            Bulletin ${periodeLabel} — ${classe ? formatClasseLabel(classe) : ''}
          </div>
          <table border="1" cellpadding="3" style="width:100%;border-collapse:collapse;margin-bottom:.2cm;font-size:8pt">
            <tr>
              <td><b>Matricule :</b> ${eleve.matricule}</td>
              <td><b>Nom & Prénom :</b> ${eleve.nom} ${eleve.prenom}</td>
              <td><b>Classe :</b> ${classe ? formatClasseLabel(classe) : '—'}</td>
              <td><b>Effectif :</b> ${eleves.length}</td>
            </tr>
            <tr>
              <td><b>Né(e) le :</b> ${eleve.date_naissance||'—'}</td>
              <td><b>Sexe :</b> ${eleve.sexe==='M'?'Masculin':'Féminin'}</td>
              <td><b>Enseignant responsable :</b> ${nomProf}</td>
              <td><b>Période :</b> ${periodeLabel}</td>
            </tr>
          </table>
          <table border="1" cellpadding="3" style="width:100%;border-collapse:collapse;font-size:8pt;margin-top:.3cm">
            <thead>
              <tr style="background:#1a237e;color:white">
                <th style="text-align:left">Matière</th>
                <th align="center">Coeff.</th>
                ${getSeqHeaders()}
                <th align="center">Note /20</th>
                <th align="center">Appréciation</th>
              </tr>
            </thead>
            <tbody>
              ${noteRows}
              <tr style="background:#e8eaf6;font-weight:bold">
                <td colspan="2" align="right">MOYENNE GÉNÉRALE :</td>
                ${type !== 'seq' ? (type === 'tri' ? '<td colspan="2"></td>' : '<td colspan="6"></td>') : ''}
                <td align="center" style="font-size:10pt;color:${moyGen?(parseFloat(moyGen)>=10?'#1b5e20':'#b71c1c'):'#888'}">${moyGen?moyGen+'/20':'—'}</td>
                <td align="center">${moyGen?DB.getAppreciation(parseFloat(moyGen)):'—'}</td>
              </tr>
            </tbody>
          </table>
          ${mention ? `<div style="text-align:center;margin:.2cm 0;font-weight:bold;color:#1b5e20;border:1pt solid #1b5e20;padding:3pt;border-radius:4pt">🏆 ${mention}</div>` : '<div style="height:.2cm"></div>'}
          <!-- SIGNATURES — sans traits ni underscores -->
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.8cm;margin-top:.3cm;font-size:8pt">
            <div style="text-align:center"><b>Le Directeur / La Directrice</b><br><br><br></div>
            <div style="text-align:center"><b>L'Enseignant(e) Responsable</b><br><small>${nomProf}</small><br><br></div>
            <div style="text-align:center"><b>Signature des Parents</b><br><small>(Lu et approuvé)</small><br><br></div>
          </div>
          <div style="text-align:right;font-size:7pt;color:#aaa;margin-top:.1cm">Imprimé le ${new Date().toLocaleDateString('fr-FR')}</div>
        </div>`;
      }

      // R11 — PrintHelper (Blob URL iframe modal, plus de popup bloqué)
      const nbBulletins = sorted.length;
      PrintHelper.show(`<!DOCTYPE html><html lang="fr"><head>
        <meta charset="UTF-8">
        <title>Bulletins — ${classe ? formatClasseLabel(classe) : ''} — ${periodeLabel} (${nbBulletins} élèves)</title>
        <style>
          *{box-sizing:border-box;margin:0;padding:0}
          html,body{background:#ffffff!important;font-family:Arial,sans-serif;color:#000}
          .bulletin-page{
            display:block;
            page-break-before:always; break-before:page;
            page-break-after:always;  break-after:page;
            page-break-inside:avoid;  break-inside:avoid;
            background:#ffffff!important;
            padding:.5cm .8cm; min-height:27cm; width:100%; overflow:hidden;
          }
          .bulletin-page:first-child{page-break-before:avoid;break-before:avoid}
          .bulletin-page:last-child{page-break-after:avoid;break-after:avoid}
          table{border-collapse:collapse;width:100%}
          th,td{border:1pt solid #555;padding:2.5pt 4pt;font-size:8pt}
          thead tr th{background:#1a237e!important;color:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
          tr.avg-row{background:#e8eaf6!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
          button,.btn,.no-print{display:none!important}
          @page{size:A4 portrait;margin:.7cm .9cm}
          @media screen{
            .bulletin-page{border:1px solid #ccc;margin:1cm auto;max-width:21cm;box-shadow:0 2px 8px rgba(0,0,0,.1)}
            body{background:#e0e0e0!important;padding:1cm}
          }
        </style></head><body>
        ${allHtml}
      </body></html>`, `Bulletins — ${classe ? formatClasseLabel(classe) : ''} — ${periodeLabel}`);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-print"></i> Imprimer tous'; }
    }
  },

  // Fix 7 — Bouton "Notes en PDF" du directeur : sélecteur de classe + séquence, puis impression bordereau
  async _printBordereauDirecteur() {
    const classes = sortClasses(await DB.getAll('classes'));
    Modal.open('🖨️ Imprimer les notes en PDF',
      `<p style="margin-bottom:1rem;color:var(--gray-600);font-size:.88rem">Choisissez la classe et la séquence à imprimer en PDF.</p>
       <div class="form-group">
         <label class="form-label">Classe <span style="color:red">*</span></label>
         ${buildClassesSelect(classes, '', 'id="pdf-notes-classe"')}
       </div>
       <div class="form-group">
         <label class="form-label">Séquence</label>
         <select class="form-control" id="pdf-notes-seq">
           <option value="1">Séquence 1</option><option value="2">Séquence 2</option>
           <option value="3">Séquence 3</option><option value="4">Séquence 4</option>
           <option value="5">Séquence 5</option><option value="6">Séquence 6</option>
         </select>
       </div>`,
      `<button class="btn btn-outline" onclick="Modal.close()">Annuler</button>
       <button class="btn btn-primary" onclick="Pages._executePrintBordereauDirecteur()"><i class="fa-solid fa-print"></i> Générer le PDF</button>`
    );
  },

  async _executePrintBordereauDirecteur() {
    const classeId = document.getElementById('pdf-notes-classe')?.value;
    const seqNum = parseInt(document.getElementById('pdf-notes-seq')?.value || 1);
    if (!classeId) { Toast.error('Veuillez choisir une classe.'); return; }
    try {
      const user = App.currentUser;
      const [eleves, matieres, notes, classe, cfg] = await Promise.all([
        DB.query('eleves', e => e.classe_id === classeId),
        DB.query('matieres', m => m.classe_id === classeId),
        DB.query('notes', n => n.sequence === seqNum),
        DB.getById('classes', classeId),
        DB.getEcoleConfig()
      ]);
      Modal.close();
      if (!eleves.length) { Toast.error('Aucun élève dans cette classe.'); return; }
      if (!matieres.length) { Toast.error('Aucune matière configurée pour cette classe.'); return; }

      const sorted = eleves.sort((a,b) => a.nom.localeCompare(b.nom));
      const trimestre = Math.ceil(seqNum / 2);

      // Calcul moyennes pour classement
      const moyennesParEleve = sorted.map(el => {
        const notesEl = notes.filter(n => n.eleve_id === el.id);
        let sp = 0, sc = 0;
        matieres.forEach(m => {
          const n = notesEl.find(x => x.matiere_id === m.id);
          if (n?.valeur !== null && n?.valeur !== undefined && n?.valeur !== '') {
            sp += parseFloat(n.valeur) * parseFloat(m.coefficient); sc += parseFloat(m.coefficient);
          }
        });
        return { el, moy: sc > 0 ? parseFloat((sp/sc).toFixed(2)) : null, notesEl };
      });
      const ranked = [...moyennesParEleve].filter(x => x.moy !== null).sort((a,b) => b.moy - a.moy);
      const moyenneClasse = ranked.length ? parseFloat((ranked.reduce((s,x) => s+x.moy,0)/ranked.length).toFixed(2)) : null;

      const thMatieres = matieres.map(m => `<th align="center" style="font-size:7.5pt;background:#1a237e;color:#fff;padding:4pt 3pt;white-space:nowrap">${m.nom}<br><small style="font-weight:400">C.${m.coefficient}</small></th>`).join('');
      const rowsHtml = moyennesParEleve.map(({ el, moy, notesEl }) => {
        const rang = moy !== null ? ranked.findIndex(x => x.el.id === el.id) + 1 : null;
        const tdNotes = matieres.map(m => {
          const n = notesEl.find(x => x.matiere_id === m.id);
          const val = (n?.valeur !== null && n?.valeur !== undefined && n?.valeur !== '') ? parseFloat(n.valeur) : null;
          const col = val === null ? '#888' : val >= 10 ? '#1b5e20' : '#b71c1c';
          return `<td align="center" style="font-size:8pt;color:${col};font-weight:${val!==null?'600':'400'}">${val !== null ? val.toFixed(2) : '—'}</td>`;
        }).join('');
        return `<tr style="background:${ranked.findIndex(x=>x.el.id===el.id)%2===0?'#f9f9f9':'#fff'}">
          <td style="font-weight:600;font-size:8pt;padding:3pt 5pt">${el.prenom} ${el.nom}</td>
          <td align="center" style="font-size:7.5pt;color:#666">${el.matricule||'—'}</td>
          ${tdNotes}
          <td align="center" style="font-weight:700;font-size:9pt;color:${moy!==null?(moy>=10?'#1b5e20':'#b71c1c'):'#888'}">${moy!==null?moy:'—'}</td>
          <td align="center" style="font-size:8pt">${rang ? '#'+rang : '—'}</td>
        </tr>`;
      }).join('');

      const _logoSrc = cfg?.logo_base64 || cfg?.logo_url || '';
      const logoHtml = _logoSrc ? `<img src="${_logoSrc}" style="max-height:60px;max-width:70px;object-fit:contain">` : '';
      const annee = `${new Date().getFullYear()-1}/${new Date().getFullYear()}`;

      // R11 — PrintHelper (Blob URL iframe modal)
      PrintHelper.show(`<!DOCTYPE html><html lang="fr"><head>
        <meta charset="UTF-8"><title>Bordereau Notes — ${classe ? formatClasseLabel(classe) : ''} — Séq.${seqNum}</title>
        <style>
          *{box-sizing:border-box;margin:0;padding:0}
          body{font-family:Arial,sans-serif;font-size:9pt;background:#fff;color:#000;padding:.5cm}
          table{border-collapse:collapse;width:100%}
          th,td{border:1pt solid #bbb;padding:2.5pt 4pt}
          @page{size:A4 landscape;margin:.6cm .8cm}
        </style></head><body>
        <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8pt;align-items:center;margin-bottom:.3cm;border-bottom:2pt solid #1a237e;padding-bottom:.2cm">
          <div style="font-size:8pt"><b style="font-size:10pt;color:#1a237e">${cfg?.nom||'École'}</b><br>${cfg?.adresse||''}<br>${cfg?.telephone||''}</div>
          <div style="text-align:center">${logoHtml}</div>
          <div style="text-align:right;font-size:7.5pt"><b>République de Guinée</b><br>Travail — Justice — Solidarité<br>Ministère MENA/ETFP<br>Année : ${annee}</div>
        </div>
        <div style="text-align:center;font-size:11pt;font-weight:bold;margin:.25cm 0">BORDEREAU DE NOTES — ${classe ? formatClasseLabel(classe) : ''} — Séquence ${seqNum} (Trimestre ${trimestre})</div>
        ${moyenneClasse !== null ? `<div style="text-align:center;font-size:8.5pt;margin-bottom:.2cm;color:#1b5e20">Moyenne de classe : <b>${moyenneClasse}/20</b></div>` : ''}
        <table>
          <thead><tr>
            <th style="text-align:left;background:#1a237e;color:#fff;padding:4pt 5pt;font-size:8.5pt">Élève</th>
            <th align="center" style="background:#1a237e;color:#fff;padding:4pt 3pt;font-size:8pt">Matricule</th>
            ${thMatieres}
            <th align="center" style="background:#1a237e;color:#fff;padding:4pt 3pt;font-size:8.5pt">Moy.</th>
            <th align="center" style="background:#1a237e;color:#fff;padding:4pt 3pt;font-size:8.5pt">Rang</th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <p style="text-align:right;font-size:7pt;color:#aaa;margin-top:.2cm">Imprimé le ${new Date().toLocaleDateString('fr-FR')} — ${sorted.length} élève(s)</p>
      </body></html>`, `Bordereau Notes — ${classe ? formatClasseLabel(classe) : ''} — Séq.${seqNum}`);
    } catch(err) { Toast.error('Erreur : ' + err.message); }
  },

  // ══════════════════════════════════════════════════════════════════
  // BORDEREAU DE NOTES — Relevé collectif pour les enseignants (Bloc 4)
  // ══════════════════════════════════════════════════════════════════
  async bordereau() {
    setLoading('Chargement du bordereau…');
    try {
      const user = App.currentUser;
      const classesRaw = await DB.getClassesProf(user);
      const classes = sortClasses(classesRaw); // T4.1
      setContent(`
        <div class="page-header">
          <div class="page-header-left">
            <h2><i class="fa-solid fa-table-list" style="color:var(--primary)"></i> Bordereau de Notes</h2>
            <p>Relevé collectif de votre classe — Séquence sélectionnée</p>
          </div>
        </div>
        <div class="card">
          <div class="card-header" style="flex-wrap:wrap;gap:.75rem">
            <div style="display:flex;gap:.75rem;flex-wrap:wrap">
              <select class="form-control" style="width:auto;min-width:200px" id="bord-classe">
                <option value="">— Choisir la classe —</option>
                ${classes.map(c => `<option value="${c.id}">${formatClasseLabel(c)}</option>`).join('')}
              </select>
              <select class="form-control" style="width:auto" id="bord-seq">
                <option value="1">Séquence 1</option><option value="2">Séquence 2</option>
                <option value="3">Séquence 3</option><option value="4">Séquence 4</option>
                <option value="5">Séquence 5</option><option value="6">Séquence 6</option>
              </select>
              <button class="btn btn-primary" onclick="Pages._loadBordereau()"><i class="fa-solid fa-table"></i> Afficher le bordereau</button>
              <button class="btn btn-outline" onclick="Pages._printBordereau()"><i class="fa-solid fa-print"></i> Imprimer</button>
            </div>
          </div>
          <div class="card-body" id="bordereau-content">
            <div class="empty-state">
              <i class="fa-solid fa-table-list"></i>
              <h3>Sélectionnez une classe et une séquence</h3>
              <p>Le bordereau collectif s'affichera ici</p>
            </div>
          </div>
        </div>`);
      if (!classes.length) {
        document.getElementById('bordereau-content').innerHTML = `<div class="empty-state"><i class="fa-solid fa-lock"></i><h3>Aucune classe assignée</h3><p>Contactez l'administrateur pour vous assigner une classe ou des matières.</p></div>`;
      }
    } catch (err) { setContent(`<div class="empty-state"><h3>Erreur</h3><p>${err.message}</p></div>`); }
  },

  async _loadBordereau() {
    const classeId = document.getElementById('bord-classe')?.value;
    const seqNum = parseInt(document.getElementById('bord-seq')?.value || 1);
    if (!classeId) { Toast.error('Choisissez une classe.'); return; }
    const content = document.getElementById('bordereau-content');
    content.innerHTML = '<div style="text-align:center;padding:2rem"><div class="loading-spinner"></div></div>';
    try {
      const user = App.currentUser;
      const [eleves, matieres, notes, classe, cfg] = await Promise.all([
        DB.query('eleves', e => e.classe_id === classeId),
        DB.getMatieresAutoriseesProf(user, classeId),
        DB.query('notes', n => n.sequence === seqNum),
        DB.getById('classes', classeId),
        DB.getEcoleConfig()
      ]);

      if (!eleves.length) { content.innerHTML = '<div class="empty-state"><h3>Aucun élève</h3><p>Aucun élève inscrit dans cette classe.</p></div>'; return; }
      if (!matieres.length) { content.innerHTML = '<div class="empty-state"><h3>Aucune matière</h3><p>Vous n\'êtes assigné(e) à aucune matière dans cette classe.</p></div>'; return; }

      const sorted = eleves.sort((a, b) => a.nom.localeCompare(b.nom));
      const trimestre = Math.ceil(seqNum / 2);

      // Calcul des moyennes pour classement
      const moyennesParEleve = sorted.map(el => {
        const notesEl = notes.filter(n => n.eleve_id === el.id);
        let sp = 0, sc = 0;
        matieres.forEach(m => {
          const n = notesEl.find(x => x.matiere_id === m.id);
          if (n?.valeur !== null && n?.valeur !== undefined && n?.valeur !== '') {
            sp += parseFloat(n.valeur) * parseFloat(m.coefficient);
            sc += parseFloat(m.coefficient);
          }
        });
        return { el, moy: sc > 0 ? parseFloat((sp/sc).toFixed(2)) : null };
      });

      const ranked = [...moyennesParEleve].filter(x => x.moy !== null).sort((a, b) => b.moy - a.moy);
      const moyenneClasse = ranked.length ? parseFloat((ranked.reduce((s, x) => s + x.moy, 0) / ranked.length).toFixed(2)) : null;

      // Moyenne par matière
      const moyParMat = matieres.map(m => {
        const vals = notes.filter(n => n.matiere_id === m.id && n.valeur !== null && n.valeur !== undefined && n.valeur !== '').map(n => parseFloat(n.valeur));
        return { mat: m, moy: vals.length ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : null };
      });

      const topEleves = ranked.slice(0, 3);
      const bottomEleves = ranked.slice(-3).reverse();
      const hardestMat = [...moyParMat].filter(x => x.moy !== null).sort((a, b) => a.moy - b.moy).slice(0, 3);

      let html = `
        <div style="margin-bottom:1rem">
          <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:.75rem">
            <div style="background:var(--primary-light);border-radius:8px;padding:.6rem 1rem;font-size:.85rem">
              <i class="fa-solid fa-chalkboard" style="color:var(--primary)"></i> <strong>${classe ? formatClasseLabel(classe) : '—'}</strong> — Séquence ${seqNum} (Trimestre ${trimestre})
            </div>
            ${moyenneClasse !== null ? `<div style="background:#e8f5e9;border-radius:8px;padding:.6rem 1rem;font-size:.85rem"><i class="fa-solid fa-chart-line" style="color:var(--secondary)"></i> Moyenne de classe : <strong style="color:var(--secondary)">${moyenneClasse}/20</strong></div>` : ''}
          </div>

          ${topEleves.length ? `
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.75rem;margin-bottom:1rem">
            <div style="background:#e8f5e9;border-radius:8px;padding:.75rem">
              <div style="font-weight:600;font-size:.82rem;color:var(--secondary);margin-bottom:.4rem">🏆 Top 3 élèves</div>
              ${topEleves.map((x, i) => `<div style="font-size:.8rem;padding:.2rem 0">${i+1}. <strong>${x.el.prenom} ${x.el.nom}</strong> — ${x.moy}/20</div>`).join('')}
            </div>
            <div style="background:#fce4ec;border-radius:8px;padding:.75rem">
              <div style="font-weight:600;font-size:.82rem;color:var(--danger);margin-bottom:.4rem">⚠️ En difficulté</div>
              ${bottomEleves.map((x, i) => `<div style="font-size:.8rem;padding:.2rem 0">${i+1}. <strong>${x.el.prenom} ${x.el.nom}</strong> — ${x.moy}/20</div>`).join('')}
            </div>
            <div style="background:#fff8e1;border-radius:8px;padding:.75rem">
              <div style="font-weight:600;font-size:.82rem;color:#e65100;margin-bottom:.4rem">📉 Matières difficiles</div>
              ${hardestMat.length ? hardestMat.map(x => `<div style="font-size:.8rem;padding:.2rem 0"><strong>${x.mat.nom}</strong> — Moy. ${x.moy}/20</div>`).join('') : '<div style="font-size:.8rem;color:var(--gray-500)">Pas de données</div>'}
            </div>
          </div>` : ''}
        </div>

        <div id="bordereau-table-wrap" class="table-wrapper">
        <table>
          <thead>
            <tr style="background:var(--primary);color:white">
              <th style="min-width:140px">Élève</th>
              ${matieres.map(m => `<th style="min-width:80px;text-align:center">${m.nom}<br><small style="font-weight:400;opacity:.8">Coeff.${m.coefficient}</small></th>`).join('')}
              <th style="text-align:center;min-width:80px">Moy.</th>
              <th style="text-align:center">Rang</th>
            </tr>
          </thead>
          <tbody>`;

      moyennesParEleve.forEach(({ el, moy }) => {
        const rang = moy !== null ? ranked.findIndex(x => x.el.id === el.id) + 1 : null;
        const notesEl = notes.filter(n => n.eleve_id === el.id);
        html += `<tr>
          <td><div style="font-weight:600;font-size:.85rem">${el.prenom} ${el.nom}</div><div style="font-size:.7rem;color:var(--gray-500)">${el.matricule}</div></td>
          ${matieres.map(m => {
            const n = notesEl.find(x => x.matiere_id === m.id);
            const val = (n?.valeur !== null && n?.valeur !== undefined && n?.valeur !== '') ? parseFloat(n.valeur) : null;
            const color = val === null ? 'var(--gray-400)' : val >= 10 ? 'var(--secondary)' : 'var(--danger)';
            return `<td style="text-align:center;font-weight:600;color:${color}">${val !== null ? val.toFixed(2) : '—'}</td>`;
          }).join('')}
          <td style="text-align:center;font-weight:700;font-size:1rem;color:${moy!==null?(moy>=10?'var(--secondary)':'var(--danger)'):'var(--gray-400)'}">${moy!==null?moy:'—'}</td>
          <td style="text-align:center;font-weight:600">${rang ? '#'+rang : '—'}</td>
        </tr>`;
      });

      html += `</tbody>
        <tfoot>
          <tr style="background:var(--gray-100);font-weight:600">
            <td>Moy. classe</td>
            ${moyParMat.map(x => `<td style="text-align:center;color:${x.moy!==null?(x.moy>=10?'var(--secondary)':'var(--danger)'):'var(--gray-400)'}">${x.moy!==null?x.moy:'—'}</td>`).join('')}
            <td style="text-align:center;color:${moyenneClasse!==null?(moyenneClasse>=10?'var(--secondary)':'var(--danger)'):'var(--gray-400)'}">${moyenneClasse!==null?moyenneClasse:'—'}</td>
            <td></td>
          </tr>
        </tfoot>
      </table></div>`;

      content.innerHTML = html;
      // Stocker pour impression
      this._bordereauData = { classeNom: classe?.nom, seqNum, trimestre, schoolName: cfg?.nom };
    } catch (err) { content.innerHTML = `<div class="empty-state"><h3>Erreur</h3><p>${err.message}</p></div>`; }
  },

  _printBordereau() {
    const tableWrap = document.getElementById('bordereau-table-wrap');
    if (!tableWrap) { Toast.error('Chargez d\'abord le bordereau.'); return; }
    const { classeNom, seqNum, trimestre, schoolName } = this._bordereauData || {};
    const tableHTML = tableWrap.outerHTML;
    // R11 — PrintHelper (Blob URL iframe modal — plus de popup bloqué)
    PrintHelper.show(`<!DOCTYPE html><html lang="fr"><head>
      <meta charset="UTF-8"><title>Bordereau — ${classeNom||''}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Arial,sans-serif;font-size:9pt;background:#fff;color:#000;padding:.5cm}
        h2{font-size:12pt;text-align:center;margin-bottom:.2cm}
        h3{font-size:10pt;text-align:center;margin-bottom:.15cm}
        p{text-align:center;font-size:8pt;color:#666;margin-bottom:.4cm}
        table{border-collapse:collapse;width:100%}
        th,td{border:1pt solid #555;padding:3pt 5pt;font-size:8.5pt}
        thead tr{background:#1a73e8!important;color:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        tfoot tr{background:#f0f0f0!important;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        @page{size:A4 landscape;margin:.7cm .9cm}
      </style></head><body>
      <h2>${schoolName||'École'}</h2>
      <h3>BORDEREAU DE NOTES — ${classeNom||''} — Séquence ${seqNum||''} (Trimestre ${trimestre||''})</h3>
      <p>Imprimé le ${new Date().toLocaleDateString('fr-FR')}</p>
      ${tableHTML}
    </body></html>`, `Bordereau — ${classeNom||''} — Séq.${seqNum||''}`);
  },

  // ══════════════════════════════════════════════════════════════════
  // PAIEMENTS — Boutons bien visibles + Export CSV
  // ══════════════════════════════════════════════════════════════════
  async paiements() {
    setLoading('Chargement des paiements…');
    try {
      const [eleves, classes, configsSco, allPay] = await Promise.all([
        DB.getAll('eleves'), DB.getAll('classes'), DB.getAll('config_scolarite'), DB.getAll('paiements')
      ]);
      await getDevise();
      const paysValides = allPay.filter(p => !p.annule);
      const cMap = Object.fromEntries(classes.map(c=>[c.id,c]));
      const pMap = {};
      paysValides.forEach(p=>{if(!pMap[p.eleve_id])pMap[p.eleve_id]=[];pMap[p.eleve_id].push(p);});
      const eMap = Object.fromEntries(eleves.map(e=>[e.id,e]));

      const totalEnc = paysValides.reduce((s,p)=>s+parseFloat(p.montant||0),0);
      let soldes=0, encours=0, aucun=0;
      eleves.forEach(e=>{ const s=DB.getStatutPaiementSync(e.id,eMap,cMap,configsSco,pMap); if(s==='solde')soldes++;else if(s==='encours')encours++;else aucun++; });

      // Historique récent
      const histSorted = paysValides.sort((a,b) => new Date(b.date_paiement||b.created_at) - new Date(a.date_paiement||a.created_at));

      // T4.5 — Calculs supplémentaires pour les stats enrichies
      const totalEleves = eleves.length;
      const pctSolde = totalEleves > 0 ? Math.round(soldes / totalEleves * 100) : 0;
      const totalDu = eleves.reduce((s, e) => {
        const cfg2 = configsSco.find(c => c.niveau === cMap[e.classe_id]?.niveau);
        return s + parseFloat(cfg2?.montant_annuel || 0);
      }, 0);
      const tauxRecouv = totalDu > 0 ? Math.min(100, Math.round(totalEnc / totalDu * 100)) : 0;

      setContent(`
        <!-- T4.5 — PAGE-HEADER MODERNE -->
        <div class="page-header" style="background:linear-gradient(135deg,#1a73e8 0%,#0d47a1 100%);border-radius:12px;padding:1.25rem 1.5rem;margin-bottom:1.25rem;color:white">
          <div class="page-header-left">
            <h2 style="color:white;margin:0;display:flex;align-items:center;gap:.6rem">
              <i class="fa-solid fa-money-bill-wave"></i> Paiements Scolarité
            </h2>
            <p style="color:rgba(255,255,255,.75);margin:.2rem 0 0">Suivi des versements · ${totalEleves} élève(s) · Taux de recouvrement : <strong style="color:#a5d6a7">${tauxRecouv}%</strong></p>
          </div>
          <div style="display:flex;gap:.6rem;flex-wrap:wrap">
            <button class="btn btn-lg" style="background:white;color:#1a73e8;font-weight:600;border:none" onclick="Pages._openPaySearchModal()">
              <i class="fa-solid fa-plus"></i> Enregistrer un paiement
            </button>
            <button class="btn btn-outline" style="border-color:rgba(255,255,255,.6);color:white" onclick="Pages._exportHistPaiements()">
              <i class="fa-solid fa-file-excel"></i> Excel
            </button>
            <button class="btn btn-outline" style="border-color:rgba(255,255,255,.6);color:white" onclick="Pages._printPaiements()">
              <i class="fa-solid fa-print"></i> PDF
            </button>
          </div>
        </div>

        <!-- R10 — KPI CARDS FINANCIÈRES COMPLÈTES (5 indicateurs clés) -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(195px,1fr));gap:1rem;margin-bottom:1.25rem">

          <!-- KPI 1 : Total encaissé -->
          <div style="background:white;border-radius:12px;padding:1.1rem 1.25rem;box-shadow:0 2px 8px rgba(0,0,0,.08);border-left:4px solid #27ae60">
            <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.6rem">
              <div style="width:44px;height:44px;border-radius:10px;background:#e8f5e9;display:flex;align-items:center;justify-content:center;font-size:1.1rem;color:#27ae60"><i class="fa-solid fa-arrow-trend-up"></i></div>
              <div style="font-size:.75rem;color:#666;font-weight:600;text-transform:uppercase;letter-spacing:.03em">Total encaissé</div>
            </div>
            <div style="font-size:1.25rem;font-weight:700;color:#1a1a2e;margin-bottom:.4rem">${money(totalEnc)}</div>
            <div style="font-size:.72rem;color:#888;margin-bottom:.3rem">Objectif annuel : ${money(totalDu)}</div>
            <div style="background:#e0e0e0;border-radius:9px;height:6px"><div style="background:linear-gradient(90deg,#27ae60,#2ecc71);border-radius:9px;height:6px;width:${tauxRecouv}%;transition:width .6s"></div></div>
            <div style="text-align:right;font-size:.7rem;font-weight:700;color:#27ae60;margin-top:.2rem">${tauxRecouv}% recouvré</div>
          </div>

          <!-- KPI 2 : Reste à recouvrer -->
          <div style="background:white;border-radius:12px;padding:1.1rem 1.25rem;box-shadow:0 2px 8px rgba(0,0,0,.08);border-left:4px solid #e53935">
            <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.6rem">
              <div style="width:44px;height:44px;border-radius:10px;background:#ffebee;display:flex;align-items:center;justify-content:center;font-size:1.1rem;color:#e53935"><i class="fa-solid fa-triangle-exclamation"></i></div>
              <div style="font-size:.75rem;color:#666;font-weight:600;text-transform:uppercase;letter-spacing:.03em">Reste à recouvrer</div>
            </div>
            <div style="font-size:1.25rem;font-weight:700;color:#e53935;margin-bottom:.4rem">${money(Math.max(0, totalDu - totalEnc))}</div>
            <div style="font-size:.72rem;color:#888">${aucun + encours} élève(s) avec solde impayé</div>
            <div style="margin-top:.5rem;display:flex;gap:.3rem;flex-wrap:wrap">
              ${aucun > 0 ? `<span style="background:#ffebee;color:#e53935;border-radius:10px;padding:.15rem .5rem;font-size:.68rem;font-weight:600">${aucun} sans versement</span>` : ''}
              ${encours > 0 ? `<span style="background:#fff8e1;color:#f57c00;border-radius:10px;padding:.15rem .5rem;font-size:.68rem;font-weight:600">${encours} en cours</span>` : ''}
            </div>
          </div>

          <!-- KPI 3 : Élèves soldés -->
          <div style="background:white;border-radius:12px;padding:1.1rem 1.25rem;box-shadow:0 2px 8px rgba(0,0,0,.08);border-left:4px solid #1a73e8">
            <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.6rem">
              <div style="width:44px;height:44px;border-radius:10px;background:#e3f2fd;display:flex;align-items:center;justify-content:center;font-size:1.1rem;color:#1a73e8"><i class="fa-solid fa-circle-check"></i></div>
              <div style="font-size:.75rem;color:#666;font-weight:600;text-transform:uppercase;letter-spacing:.03em">Élèves soldés</div>
            </div>
            <div style="font-size:1.25rem;font-weight:700;color:#1a1a2e;margin-bottom:.4rem">${soldes} <span style="font-size:.75rem;color:#1a73e8">/ ${totalEleves}</span></div>
            <div style="background:#e0e0e0;border-radius:9px;height:6px"><div style="background:linear-gradient(90deg,#1a73e8,#42a5f5);border-radius:9px;height:6px;width:${pctSolde}%;transition:width .6s"></div></div>
            <div style="text-align:right;font-size:.7rem;font-weight:700;color:#1a73e8;margin-top:.2rem">${pctSolde}% soldés</div>
          </div>

          <!-- KPI 4 : Paiements en cours -->
          <div style="background:white;border-radius:12px;padding:1.1rem 1.25rem;box-shadow:0 2px 8px rgba(0,0,0,.08);border-left:4px solid #ff8f00">
            <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.6rem">
              <div style="width:44px;height:44px;border-radius:10px;background:#fff8e1;display:flex;align-items:center;justify-content:center;font-size:1.1rem;color:#ff8f00"><i class="fa-solid fa-hourglass-half"></i></div>
              <div style="font-size:.75rem;color:#666;font-weight:600;text-transform:uppercase;letter-spacing:.03em">En cours</div>
            </div>
            <div style="font-size:1.25rem;font-weight:700;color:#1a1a2e;margin-bottom:.4rem">${encours}</div>
            <div style="font-size:.72rem;color:#888">Paiement partiel (≥1 tranche)</div>
          </div>

          <!-- KPI 5 : Non payés -->
          <div style="background:white;border-radius:12px;padding:1.1rem 1.25rem;box-shadow:0 2px 8px rgba(0,0,0,.08);border-left:4px solid #9e9e9e">
            <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.6rem">
              <div style="width:44px;height:44px;border-radius:10px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;font-size:1.1rem;color:#757575"><i class="fa-solid fa-circle-xmark"></i></div>
              <div style="font-size:.75rem;color:#666;font-weight:600;text-transform:uppercase;letter-spacing:.03em">Non payés</div>
            </div>
            <div style="font-size:1.25rem;font-weight:700;color:#1a1a2e;margin-bottom:.4rem">${aucun}</div>
            <div style="font-size:.72rem;color:#888">Aucun versement enregistré</div>
          </div>

        </div>

        <!-- T4.5 — TABLEAU PAR ÉLÈVE AMÉLIORÉ -->
        <div class="card" style="box-shadow:0 2px 12px rgba(0,0,0,.07)">
          <div class="card-header" style="flex-wrap:wrap;gap:.75rem;background:#f8f9fa;border-radius:12px 12px 0 0;padding:1rem 1.25rem">
            <div class="card-title" style="font-size:1rem;font-weight:600"><i class="fa-solid fa-users" style="color:var(--primary)"></i> Situation par élève</div>
            <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">
              <div class="search-bar" style="min-width:200px"><i class="fa-solid fa-search"></i><input type="search" id="sp-search" placeholder="Nom, prénom, matricule…" oninput="Pages._filterPaiementsTable()"></div>
              <select class="form-control" style="width:auto" id="sp-statut" onchange="Pages._filterPaiementsTable()">
                <option value="">Tous statuts</option>
                <option value="solde">✅ Soldés</option>
                <option value="encours">🕐 En cours</option>
                <option value="aucun">❌ Non payés</option>
              </select>
              <select class="form-control" style="width:auto" id="sp-classe" onchange="Pages._filterPaiementsTable()">
                <option value="">Toutes classes</option>
                ${sortClasses(classes).map(c=>`<option value="${c.id}">${formatClasseLabel(c)}</option>`).join('')}
              </select>
              <button class="btn btn-outline btn-sm" onclick="Pages._exportPaiementsEleves()" title="Export Excel élèves">
                <i class="fa-solid fa-file-excel" style="color:#217346"></i> Excel
              </button>
            </div>
          </div>
          <div class="card-body" style="padding:0">
            <div class="table-wrapper">
              <table>
                <thead style="background:#f1f3f5">
                  <tr>
                    <th style="padding:.75rem 1rem">Élève</th>
                    <th>Classe</th>
                    <th style="text-align:right">Scolarité</th>
                    <th style="text-align:right">Payé</th>
                    <th style="text-align:right">Reste</th>
                    <th style="text-align:center;min-width:120px">Progression</th>
                    <th style="text-align:center">Statut</th>
                    <th style="text-align:center">Action</th>
                  </tr>
                </thead>
                <tbody id="pay-tbody">${this._buildPayRows(eleves, cMap, configsSco, pMap)}</tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- T4.5 — HISTORIQUE AMÉLIORÉ -->
        <div class="card" style="box-shadow:0 2px 12px rgba(0,0,0,.07);margin-top:1.25rem">
          <div class="card-header" style="background:#f8f9fa;border-radius:12px 12px 0 0;padding:1rem 1.25rem">
            <div class="card-title" style="font-size:1rem;font-weight:600">
              <i class="fa-solid fa-clock-rotate-left" style="color:var(--primary)"></i>
              Historique des versements
              <span style="background:#e3f2fd;color:#1a73e8;border-radius:20px;padding:.1rem .6rem;font-size:.78rem;margin-left:.5rem;font-weight:600">${paysValides.length}</span>
            </div>
            <button class="btn btn-success btn-sm" onclick="Pages._openPaySearchModal()">
              <i class="fa-solid fa-plus"></i> Nouveau versement
            </button>
          </div>
          <div class="card-body" style="padding:0">
            <div class="table-wrapper">
              <table>
                <thead style="background:#f1f3f5">
                  <tr>
                    <th>Date</th>
                    <th>Élève</th>
                    <th>Tranche</th>
                    <th style="text-align:right">Montant</th>
                    <th>Mode</th>
                    <th>Caissier</th>
                    <th>Obs.</th>
                    <th style="text-align:center">Actions</th>
                  </tr>
                </thead>
                <tbody>${this._buildHistPay(histSorted, eMap)}</tbody>
              </table>
            </div>
          </div>
        </div>`);

      this._paiementsData = { eleves, cMap, configsSco, pMap };
    } catch (err) {
      setContent(`<div class="empty-state"><i class="fa-solid fa-triangle-exclamation" style="color:var(--danger)"></i><h3>Erreur</h3><p>${err.message}</p><button class="btn btn-primary" onclick="Pages.paiements()">Réessayer</button></div>`);
    }
  },

  _buildPayRows(eleves, cMap, configsSco, pMap) {
    // T4.5 — 8 colonnes (Élève / Classe / Scolarité / Payé / Reste / Progression / Statut / Action)
    if (!eleves.length) return `<tr><td colspan="8" class="table-empty"><i class="fa-solid fa-users"></i> Aucun élève</td></tr>`;
    const eMap = Object.fromEntries(eleves.map(e=>[e.id,e]));
    return eleves.map(e => {
      const cls = cMap[e.classe_id];
      const cfg = configsSco.find(c => c.niveau === cls?.niveau);
      const total = parseFloat(cfg?.montant_annuel || 0);
      const paye = (pMap[e.id]||[]).reduce((s,p)=>s+parseFloat(p.montant||0),0);
      const reste = Math.max(0, total - paye);
      const avoir = paye > total && total > 0 ? paye - total : 0;
      const statut = DB.getStatutPaiementSync(e.id, eMap, cMap, configsSco, pMap);
      const pct = total > 0 ? Math.min(100, Math.round(paye/total*100)) : 0;
      const barColor = statut==='solde' ? '#27ae60' : statut==='encours' ? '#ff8f00' : '#e53935';
      return `<tr>
        <td style="padding:.7rem 1rem">
          <div style="font-weight:600;color:#1a1a2e">${e.prenom} ${e.nom}</div>
          <small style="color:var(--gray-500)">${e.matricule}</small>
        </td>
        <td>${cls?`<span class="chip" style="font-size:.78rem">${formatClasseLabel(cls)}</span>`:'—'}</td>
        <td style="text-align:right;font-weight:500">${money(total)}</td>
        <td style="text-align:right"><strong style="color:#27ae60">${money(paye)}</strong>${avoir>0?`<div style="font-size:.7rem;color:#27ae60">+${money(avoir)} avoir</div>`:''}</td>
        <td style="text-align:right"><strong style="color:${reste>0?'#e53935':'#27ae60'}">${reste>0?money(reste):'—'}</strong></td>
        <td style="min-width:110px;padding:.7rem .5rem">
          <div style="display:flex;align-items:center;gap:.4rem">
            <div style="flex:1;background:#e9ecef;border-radius:9px;height:8px;overflow:hidden">
              <div style="background:${barColor};border-radius:9px;height:8px;width:${pct}%;transition:width .4s"></div>
            </div>
            <span style="font-size:.72rem;font-weight:600;color:${barColor};min-width:28px">${pct}%</span>
          </div>
        </td>
        <td style="text-align:center">${Fmt.statutBadge(statut)}</td>
        <td style="text-align:center">
          <button class="btn btn-success btn-sm" style="white-space:nowrap" onclick="Pages._quickPayEleve('${e.id}')">
            <i class="fa-solid fa-plus"></i> Payer
          </button>
        </td>
      </tr>`;
    }).join('');
  },

  _buildHistPay(pays, eMap) {
    if (!pays.length) return `<tr><td colspan="8" class="table-empty"><i class="fa-solid fa-inbox"></i> Aucun versement</td></tr>`;
    return pays.map(p => {
      const e = eMap[p.eleve_id];
      return `<tr>
        <td style="white-space:nowrap">${Fmt.datetime(p.date_paiement||p.created_at)}</td>
        <td><strong>${e?e.prenom+' '+e.nom:'—'}</strong></td>
        <td><span class="chip" style="font-size:.8rem">${p.tranche_label||'—'}</span></td>
        <td><strong style="color:var(--secondary)">${money(p.montant)}</strong></td>
        <td><span class="chip">${p.mode_paiement||'Espèces'}</span></td>
        <td>${p.caissier_nom||'—'}</td>
        <td style="max-width:100px;overflow:hidden;text-overflow:ellipsis">${p.observation||'—'}</td>
        <td><button class="btn-icon" title="Annuler ce paiement" onclick="Pages._annulerPaiement('${p.id}')" style="color:var(--danger)"><i class="fa-solid fa-ban"></i></button></td>
      </tr>`;
    }).join('');
  },

  _filterPaiementsTable() {
    const { eleves, cMap, configsSco, pMap } = this._paiementsData || {};
    if (!eleves) return;
    const txt = document.getElementById('sp-search')?.value?.toLowerCase() || '';
    const statut = document.getElementById('sp-statut')?.value || '';
    const classeId = document.getElementById('sp-classe')?.value || '';
    const eMap = Object.fromEntries(eleves.map(e=>[e.id,e]));
    let list = eleves;
    if (txt) list = list.filter(e => (`${e.prenom} ${e.nom} ${e.matricule}`).toLowerCase().includes(txt));
    if (classeId) list = list.filter(e => e.classe_id === classeId);
    if (statut) list = list.filter(e => DB.getStatutPaiementSync(e.id,eMap,cMap,configsSco,pMap) === statut);
    document.getElementById('pay-tbody').innerHTML = this._buildPayRows(list, cMap, configsSco, pMap);
  },

  async _openPaySearchModal() {
    const [eleves, classes] = await Promise.all([DB.getAll('eleves'), DB.getAll('classes')]);
    const cMap = Object.fromEntries(classes.map(c=>[c.id,c]));
    // Filtrer les non-exonérés + trier par nom
    const elevesPay = eleves
      .filter(e => e.type_scolarite !== 'exonere')
      .sort((a,b) => a.nom.localeCompare(b.nom));

    Modal.open('💵 Enregistrer un paiement', `
      <!-- Champ de recherche autocomplete élève -->
      <div class="form-group" style="position:relative">
        <label class="form-label"><i class="fa-solid fa-magnifying-glass"></i> Rechercher un élève <span style="color:red">*</span></label>
        <input type="text" class="form-control" id="np-search-input"
          placeholder="Tapez le nom, prénom ou matricule…"
          autocomplete="off"
          oninput="Pages._filterPayAutocomplete()"
          onfocus="Pages._filterPayAutocomplete()">
        <div id="np-autocomplete-list" style="
          position:absolute;top:100%;left:0;right:0;z-index:9999;
          background:white;border:1px solid var(--gray-300);border-radius:0 0 8px 8px;
          max-height:220px;overflow-y:auto;display:none;
          box-shadow:var(--shadow-lg)">
        </div>
        <input type="hidden" id="np-eleve">
        <div id="np-eleve-selected" style="margin-top:.4rem;font-size:.82rem;color:var(--secondary);display:none">
          <i class="fa-solid fa-circle-check"></i> <span id="np-eleve-selected-label"></span>
          <button type="button" onclick="Pages._clearPayEleve()" style="background:none;border:none;color:var(--danger);cursor:pointer;margin-left:.4rem;font-size:.8rem"><i class="fa-solid fa-xmark"></i> Changer</button>
        </div>
      </div>

      <div id="np-info"></div>
      <div id="np-tranches" style="margin-bottom:.75rem"></div>
      <div id="np-selection-total" style="font-size:.85rem;color:var(--primary);font-weight:600;margin-bottom:.5rem"></div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Montant versé <span style="color:red">*</span></label>
          <input type="number" class="form-control" id="np-montant" min="1" placeholder="0"
            oninput="Pages._onMontantChange('np')">
          <div id="np-ventil-hint" style="font-size:.78rem;color:var(--primary);margin-top:.2rem"></div>
        </div>
        <div class="form-group"><label class="form-label">Mode de paiement</label>
          <select class="form-control" id="np-mode"><option>Espèces</option><option>Mobile Money</option><option>Chèque</option><option>Virement</option></select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Date & heure</label><input type="datetime-local" class="form-control" id="np-date" value="${new Date().toISOString().slice(0,16)}"></div>
        <div class="form-group"><label class="form-label">Observation</label><input class="form-control" id="np-obs" placeholder="Facultatif"></div>
      </div>
    `, `
      <button class="btn btn-outline" onclick="Modal.close()">Annuler</button>
      <button class="btn btn-success" id="np-save-btn" onclick="Pages._saveNewPaiement()"><i class="fa-solid fa-check"></i> Enregistrer le paiement</button>
    `, 'modal-lg');
    this._payModalData = { eleves: elevesPay, cMap };

    // Fermer le dropdown si clic en dehors
    document.addEventListener('click', function closeAc(e) {
      if (!e.target.closest('#np-autocomplete-list') && !e.target.closest('#np-search-input')) {
        const list = document.getElementById('np-autocomplete-list');
        if (list) list.style.display = 'none';
        document.removeEventListener('click', closeAc);
      }
    });
  },

  _filterPayAutocomplete() {
    const query = (document.getElementById('np-search-input')?.value || '').toLowerCase().trim();
    const list = document.getElementById('np-autocomplete-list');
    const { eleves, cMap } = this._payModalData || {};
    if (!list || !eleves) return;

    const filtered = query
      ? eleves.filter(e => (`${e.prenom} ${e.nom} ${e.matricule}`).toLowerCase().includes(query)).slice(0, 10)
      : eleves.slice(0, 10);

    if (!filtered.length) {
      list.innerHTML = `<div style="padding:.6rem 1rem;font-size:.85rem;color:var(--gray-500)"><i class="fa-solid fa-search"></i> Aucun résultat</div>`;
      list.style.display = 'block';
      return;
    }

    list.innerHTML = filtered.map(e => {
      const cls = cMap[e.classe_id];
      return `<div onclick="Pages._selectPayEleve('${e.id}','${e.prenom} ${e.nom} — ${e.matricule} — ${cls?.nom||'?'}')"
        style="padding:.55rem 1rem;cursor:pointer;border-bottom:1px solid var(--gray-100);font-size:.85rem;display:flex;justify-content:space-between;align-items:center"
        onmouseover="this.style.background='var(--primary-light)'"
        onmouseout="this.style.background='white'">
        <div>
          <strong>${e.prenom} ${e.nom}</strong>
          <span style="font-size:.75rem;color:var(--gray-500);margin-left:.5rem">${e.matricule}</span>
        </div>
        <span class="chip" style="font-size:.72rem">${cls?.nom||'?'}</span>
      </div>`;
    }).join('');
    list.style.display = 'block';
  },

  _selectPayEleve(eleveId, label) {
    document.getElementById('np-eleve').value = eleveId;
    document.getElementById('np-search-input').value = '';
    const selectedDiv = document.getElementById('np-eleve-selected');
    const selectedLabel = document.getElementById('np-eleve-selected-label');
    const searchInput = document.getElementById('np-search-input');
    const list = document.getElementById('np-autocomplete-list');
    if (selectedDiv) selectedDiv.style.display = 'block';
    if (selectedLabel) selectedLabel.textContent = label;
    if (searchInput) searchInput.style.display = 'none';
    if (list) list.style.display = 'none';
    // Charger les infos de l'élève sélectionné
    this._updatePayInfo();
  },

  _clearPayEleve() {
    document.getElementById('np-eleve').value = '';
    const searchInput = document.getElementById('np-search-input');
    const selectedDiv = document.getElementById('np-eleve-selected');
    const info = document.getElementById('np-info');
    const tranches = document.getElementById('np-tranches');
    const totalEl = document.getElementById('np-selection-total');
    if (searchInput) { searchInput.style.display = ''; searchInput.value = ''; searchInput.focus(); }
    if (selectedDiv) selectedDiv.style.display = 'none';
    if (info) info.innerHTML = '';
    if (tranches) tranches.innerHTML = '';
    if (totalEl) totalEl.innerHTML = '';
  },

  async _updatePayInfo() {
    const eleveId = document.getElementById('np-eleve')?.value;
    if (!eleveId) {
      document.getElementById('np-info').innerHTML = '';
      document.getElementById('np-tranches').innerHTML = '';
      document.getElementById('np-selection-total').innerHTML = '';
      return;
    }
    const eleve = this._payModalData?.eleves?.find(e => e.id === eleveId);
    const [allPay, echeances] = await Promise.all([
      DB.getAll('paiements'),
      DB.getEcheances(eleve?.classe_id, eleveId)
    ]);
    const paysValides = allPay.filter(p => p.eleve_id === eleveId && !p.annule);
    const total = echeances.reduce((s, e) => s + e.montant, 0);
    const paye = paysValides.reduce((s, p) => s + parseFloat(p.montant || 0), 0);
    const reste = Math.max(0, total - paye);
    const pct = total > 0 ? Math.min(100, Math.round(paye/total*100)) : 0;
    const statut = paye === 0 ? 'aucun' : paye >= total ? 'solde' : 'encours';
    const now = new Date();

    // T1.2 — Calcul trop-perçu (avoir/crédit)
    const avoir = paye > total && total > 0 ? paye - total : 0;

    document.getElementById('np-info').innerHTML = `
      <div style="background:var(--gray-100);border-radius:8px;padding:.6rem .9rem;margin-bottom:.75rem;font-size:.85rem">
        <div style="display:flex;justify-content:space-between"><span>Total scolarité :</span><strong>${money(total)}</strong></div>
        <div style="display:flex;justify-content:space-between"><span>Déjà payé :</span><strong style="color:var(--secondary)">${money(paye)}</strong></div>
        <div style="display:flex;justify-content:space-between;border-top:1px solid var(--gray-300);margin-top:.3rem;padding-top:.3rem"><span>Reste global :</span><strong style="color:${reste>0?'var(--danger)':'var(--secondary)'}">${money(reste)}</strong></div>
        ${avoir > 0 ? `<div style="display:flex;justify-content:space-between;border-top:1px solid #a5d6a7;margin-top:.3rem;padding-top:.3rem;background:#e8f5e9;border-radius:5px;padding:.3rem .5rem"><span style="color:#2e7d32;font-weight:600"><i class="fa-solid fa-circle-plus"></i> Avoir / Crédit :</span><strong style="color:#2e7d32">+${money(avoir)}</strong></div>` : ''}
        <div class="progress" style="height:6px;margin-top:.4rem"><div class="progress-bar ${statut==='solde'?'green':statut==='encours'?'orange':'red'}" style="width:${pct}%"></div></div>
      </div>`;

    // Construire les tranches avec CHECKBOXES + séquentialité (identique à _quickPayEleve)
    let aPrecedenteNonSoldee = false;
    const tranchesHtml = echeances.map((ech, idx) => {
      const payeTranche = paysValides.filter(p => p.tranche_id === ech.id).reduce((s, p) => s + parseFloat(p.montant || 0), 0);
      const resteTranche = Math.max(0, ech.montant - payeTranche);
      const dateEch = ech.date_echeance ? new Date(ech.date_echeance) : null;
      const estPasse = !dateEch || dateEch <= now;
      const estPayee = payeTranche >= ech.montant;

      let statutTranche, badgeHtml;
      if (estPayee) {
        statutTranche = 'paye'; badgeHtml = '<span class="badge badge-success" style="font-size:.72rem">✓ Soldée</span>';
      } else if (payeTranche > 0) {
        statutTranche = 'partiel'; badgeHtml = `<span class="badge badge-warning" style="font-size:.72rem">Partiel (${money(payeTranche)})</span>`;
      } else if (!estPasse) {
        statutTranche = 'a_venir'; badgeHtml = '<span class="badge badge-aavenir" style="font-size:.72rem">À venir</span>';
      } else {
        statutTranche = 'retard'; badgeHtml = '<span class="badge badge-retard" style="font-size:.72rem">En retard !</span>';
      }

      const bloqueParSequentialite = !estPayee && aPrecedenteNonSoldee;
      if (!estPayee && estPasse && idx > 0) aPrecedenteNonSoldee = true;

      const disabled = estPayee || bloqueParSequentialite ? 'disabled' : '';
      const raisonBlocage = bloqueParSequentialite ? '<div style="font-size:.7rem;color:var(--danger);margin-top:.15rem"><i class="fa-solid fa-lock"></i> Soldez la tranche précédente d\'abord</div>' : '';
      const borderColor = bloqueParSequentialite || estPayee ? 'var(--gray-300)' : statutTranche === 'retard' ? 'var(--danger)' : statutTranche === 'partiel' ? 'var(--warning)' : 'var(--gray-300)';

      return `
        <label style="display:flex;align-items:flex-start;gap:.75rem;padding:.5rem .8rem;border-radius:8px;border:2px solid ${borderColor};margin-bottom:.35rem;cursor:${disabled?'not-allowed':'pointer'};background:${estPayee||bloqueParSequentialite?'var(--gray-100)':'white'};opacity:${bloqueParSequentialite?'.5':'1'}">
          <input type="checkbox" class="np-tranche-cb" value="${ech.id}" data-label="${ech.label}" data-reste="${resteTranche}" data-montant="${ech.montant}" ${disabled} onchange="Pages._onNpTrancheSelect()" style="accent-color:var(--primary);margin-top:.25rem">
          <div style="flex:1">
            <div style="font-weight:600;font-size:.85rem">${ech.label}</div>
            <div style="font-size:.73rem;color:var(--gray-600)">${dateEch ? 'Échéance : '+dateEch.toLocaleDateString('fr-FR') : ''} — ${money(ech.montant)}</div>
            ${raisonBlocage}
          </div>
          <div style="text-align:right">
            ${badgeHtml}
            ${resteTranche > 0 && !estPayee ? `<div style="font-size:.72rem;color:var(--danger);margin-top:.15rem;font-weight:600">Reste: ${money(resteTranche)}</div>` : ''}
          </div>
        </label>`;
    }).join('');

    document.getElementById('np-tranches').innerHTML = `
      <div class="form-group">
        <label class="form-label"><strong>Tranche(s) à encaisser <span style="color:red">*</span></strong></label>
        <div style="font-size:.78rem;color:var(--gray-600);margin-bottom:.35rem"><i class="fa-solid fa-circle-info"></i> Cochez une ou plusieurs tranches. Les tranches verrouillées (🔒) nécessitent que les précédentes soient soldées.</div>
        <div style="max-height:240px;overflow-y:auto;padding:.2rem 0">${tranchesHtml}</div>
        <div id="np-selection-total" style="font-size:.85rem;color:var(--primary);font-weight:600;margin-top:.35rem"></div>
      </div>`;
  },

  _onNpTrancheSelect() {
    this._refreshTrancheLock('.np-tranche-cb');
    this._refreshTrancheUI('np');
  },

  async _saveNewPaiement() {
    const eleveId = document.getElementById('np-eleve').value;
    const montantTotal = parseFloat(document.getElementById('np-montant').value);
    if (!eleveId) { Toast.error('Sélectionnez un élève.'); return; }
    if (!montantTotal || montantTotal <= 0) { Toast.error('Montant invalide.'); return; }

    const tranchesChecked = Array.from(document.querySelectorAll('.np-tranche-cb:checked'));
    if (!tranchesChecked.length) { Toast.error('Sélectionnez au moins une tranche à encaisser.'); return; }

    const btn = document.getElementById('np-save-btn');
    if (!Debounce.btn(btn, 8000)) return; // anti-double-clic
    try {
      const dateVal = document.getElementById('np-date').value;
      const mode_paiement = document.getElementById('np-mode').value;
      const observation = document.getElementById('np-obs').value;
      const dateISO = dateVal ? new Date(dateVal).toISOString() : new Date().toISOString();
      const caissier_nom = `${App.currentUser?.prenom||''} ${App.currentUser?.nom||''}`.trim();

      if (tranchesChecked.length === 1) {
        const cb = tranchesChecked[0];
        await DB.insert('paiements', {
          eleve_id: eleveId, montant: montantTotal,
          mode_paiement, observation, date_paiement: dateISO,
          caissier_id: App.currentUser?.id, caissier_nom, annule: false,
          tranche_id: cb.value, tranche_label: cb.dataset.label
        });
        Toast.success(`✅ Paiement de ${money(montantTotal)} pour ${cb.dataset.label} enregistré !`);
      } else {
        // Multi-tranches : distribuer
        let restantADistribuer = montantTotal;
        let inserts = 0;
        for (let i = 0; i < tranchesChecked.length; i++) {
          const cb = tranchesChecked[i];
          const resteTranche = parseFloat(cb.dataset.reste || 0);
          const versement = Math.min(restantADistribuer, resteTranche);
          if (versement <= 0) continue;
          await DB.insert('paiements', {
            eleve_id: eleveId, montant: versement,
            mode_paiement, observation, date_paiement: dateISO,
            caissier_id: App.currentUser?.id, caissier_nom, annule: false,
            tranche_id: cb.value, tranche_label: cb.dataset.label
          });
          restantADistribuer -= versement;
          inserts++;
        }
        const labels = tranchesChecked.map(cb => cb.dataset.label).join(', ');
        Toast.success(`✅ ${money(montantTotal)} réparti sur ${inserts} tranche(s) : ${labels} !`);
      }
      Modal.close();
      Pages.paiements();
    } catch (err) {
      Toast.error('Erreur : ' + err.message);
      Debounce.release(btn, '<i class="fa-solid fa-check"></i> Enregistrer le paiement');
    }
  },

  async _annulerPaiement(id) {
    if (!confirm('Annuler ce versement ? Il sera marqué comme annulé.')) return;
    await DB.update('paiements', id, { annule: true });
    Toast.warning('Paiement annulé.'); Pages.paiements();
  },

  async _exportPaiementsEleves() {
    const { eleves, cMap, configsSco, pMap } = this._paiementsData || {};
    if (!eleves) { Toast.error('Chargez la page d\'abord.'); return; }
    const eMap = Object.fromEntries(eleves.map(e=>[e.id,e]));
    const devise = _deviseCache || 'GNF';
    const rows = eleves.map(e => {
      const cls = cMap[e.classe_id];
      const cfg = configsSco.find(c=>c.niveau===cls?.niveau);
      const total = parseFloat(cfg?.montant_annuel||0);
      const paye = (pMap[e.id]||[]).reduce((s,p)=>s+parseFloat(p.montant||0),0);
      const reste = Math.max(0, total - paye);
      const statut = DB.getStatutPaiementSync(e.id,eMap,cMap,configsSco,pMap);
      const statutLabel = statut === 'solde' ? 'Soldé' : statut === 'encours' ? 'En cours' : 'Non payé';
      return [
        e.matricule, e.nom, e.prenom, e.sexe||'',
        cls?.nom||'', cls?.niveau||'',
        total + ' ' + devise,
        paye + ' ' + devise,
        reste + ' ' + devise,
        statutLabel,
        e.nom_parent||'', e.contact_parent||''
      ];
    });
    Export.toXLSX(
      ['Matricule','Nom','Prénom','Sexe','Classe','Niveau',`Scolarité (${devise})`,`Payé (${devise})`,`Reste (${devise})`,'Statut','Parent','Contact'],
      rows.map(r => [
        r[0],r[1],r[2],r[3],r[4],r[5],
        parseFloat(r[6]),parseFloat(r[7]),parseFloat(r[8]),
        r[9],r[10],r[11]
      ]),
      `situation-paiements-${new Date().toISOString().split('T')[0]}.xlsx`
    );
  },

  async _exportHistPaiements() {
    const allPay = (await DB.getAll('paiements')).filter(p=>!p.annule).sort((a,b)=>new Date(b.date_paiement||b.created_at)-new Date(a.date_paiement||a.created_at));
    const eleves = await DB.getAll('eleves');
    const classes = await DB.getAll('classes');
    const eMap = Object.fromEntries(eleves.map(e=>[e.id,e]));
    const cMap = Object.fromEntries(classes.map(c=>[c.id,c]));
    const devise = _deviseCache || 'GNF';
    const rows = allPay.map(p => {
      const e = eMap[p.eleve_id];
      const cls = cMap[e?.classe_id];
      const dt = p.date_paiement || p.created_at;
      const dateStr = dt ? new Date(dt).toLocaleDateString('fr-FR') : '';
      const heureStr = dt ? new Date(dt).toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'}) : '';
      return [
        dateStr, heureStr,
        e?.nom||'', e?.prenom||'', e?.matricule||'',
        cls?.nom||'', cls?.niveau||'',
        p.tranche_label||'—',
        parseFloat(p.montant||0) + ' ' + devise,
        p.mode_paiement||'Espèces',
        p.caissier_nom||'—',
        p.observation||''
      ];
    });
    Export.toXLSX(
      ['Date','Heure','Nom','Prénom','Matricule','Classe','Niveau','Tranche',`Montant (${devise})`,'Mode','Caissier','Observation'],
      rows.map(r => [r[0],r[1],r[2],r[3],r[4],r[5],r[6],r[7],parseFloat(r[8]),r[9],r[10],r[11]]),
      `historique-paiements-${new Date().toISOString().split('T')[0]}.xlsx`
    );
  },

  // Fix 5 — Impression PDF liste paiements : fenêtre dédiée propre (sans voile gris)
  async _printPaiements() {
    const [cfg, allPay, eleves, classes] = await Promise.all([
      DB.getEcoleConfig(), DB.getAll('paiements'), DB.getAll('eleves'), DB.getAll('classes')
    ]);
    const paysValides = allPay.filter(p=>!p.annule).sort((a,b)=>new Date(b.date_paiement||b.created_at)-new Date(a.date_paiement||a.created_at));
    const eMap = Object.fromEntries(eleves.map(e=>[e.id,e]));
    const cMap = Object.fromEntries(classes.map(c=>[c.id,c]));
    const totalEnc = paysValides.reduce((s,p)=>s+parseFloat(p.montant||0),0);
    const rowsHtml = paysValides.map(p => {
      const e = eMap[p.eleve_id];
      const cls = cMap[e?.classe_id];
      const dt = p.date_paiement || p.created_at;
      const dateStr = dt ? new Date(dt).toLocaleDateString('fr-FR') : '—';
      return `<tr>
        <td style="white-space:nowrap">${dateStr}</td>
        <td>${e ? e.prenom+' '+e.nom : '—'}</td>
        <td>${cls?.nom||'—'}</td>
        <td>${p.tranche_label||'—'}</td>
        <td align="right"><b>${parseFloat(p.montant||0).toLocaleString('fr-FR')} ${_deviseCache}</b></td>
        <td>${p.mode_paiement||'Espèces'}</td>
        <td>${p.caissier_nom||'—'}</td>
      </tr>`;
    }).join('');
    // R11 — PrintHelper (Blob URL iframe modal)
    PrintHelper.show(`<!DOCTYPE html><html lang="fr"><head>
      <meta charset="UTF-8"><title>Liste des paiements</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Arial,sans-serif;font-size:9pt;background:#fff;color:#000;padding:1cm}
        h2{color:#1a73e8;text-align:center;font-size:13pt;margin-bottom:.2cm}
        h3{text-align:center;font-size:11pt;margin-bottom:.1cm}
        p.sub{text-align:center;font-size:8pt;color:#666;margin-bottom:.5cm;border-bottom:2px solid #1a73e8;padding-bottom:.3cm}
        table{border-collapse:collapse;width:100%}
        th,td{border:1pt solid #aaa;padding:3pt 5pt;font-size:8.5pt}
        thead tr{background:#1a73e8!important;color:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        tfoot tr{background:#f0f0f0!important;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        @page{size:A4 portrait;margin:.7cm .9cm}
      </style></head><body>
      <h2>${cfg?.nom||'École'}</h2>
      <h3>LISTE DES PAIEMENTS</h3>
      <p class="sub">Imprimé le ${new Date().toLocaleString('fr-FR')} — Total encaissé : ${totalEnc.toLocaleString('fr-FR')} ${_deviseCache}</p>
      <table>
        <thead><tr>
          <th>Date</th><th>Élève</th><th>Classe</th><th>Tranche</th><th>Montant</th><th>Mode</th><th>Caissier</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot><tr>
          <td colspan="4" align="right">TOTAL ENCAISSÉ :</td>
          <td align="right">${totalEnc.toLocaleString('fr-FR')} ${_deviseCache}</td>
          <td colspan="2"></td>
        </tr></tfoot>
      </table>
    </body></html>`, 'Liste des Paiements');
  },

  // ══════════════════════════════════════════════════════════════════
  // DÉPENSES
  // ══════════════════════════════════════════════════════════════════
  async depenses() {
    setLoading();
    try {
      const depenses = (await DB.getAll('depenses')).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
      await getDevise();
      const now = new Date();
      const totalMois = depenses.filter(d=>{const dt=new Date(d.date_depense||d.created_at);return dt.getMonth()===now.getMonth()&&dt.getFullYear()===now.getFullYear();}).reduce((s,d)=>s+parseFloat(d.montant||0),0);
      const totalAll = depenses.reduce((s,d)=>s+parseFloat(d.montant||0),0);

      // T4.5 — Stats par catégorie
      const parCategorie = {};
      depenses.forEach(d => { const c = d.categorie||'Autre'; parCategorie[c] = (parCategorie[c]||0) + parseFloat(d.montant||0); });
      const topCat = Object.entries(parCategorie).sort((a,b)=>b[1]-a[1]).slice(0,3);

      setContent(`
        <!-- T4.5 — PAGE-HEADER DÉPENSES -->
        <div class="page-header" style="background:linear-gradient(135deg,#c62828 0%,#b71c1c 100%);border-radius:12px;padding:1.25rem 1.5rem;margin-bottom:1.25rem;color:white">
          <div class="page-header-left">
            <h2 style="color:white;margin:0;display:flex;align-items:center;gap:.6rem"><i class="fa-solid fa-receipt"></i> Dépenses</h2>
            <p style="color:rgba(255,255,255,.75);margin:.2rem 0 0">Sorties de caisse · ${depenses.length} enregistrement(s)</p>
          </div>
          <div style="display:flex;gap:.6rem;flex-wrap:wrap">
            <button class="btn btn-lg" style="background:white;color:#c62828;font-weight:600;border:none" onclick="Pages._openDepenseModal()">
              <i class="fa-solid fa-plus"></i> Nouvelle dépense
            </button>
            <button class="btn btn-outline" style="border-color:rgba(255,255,255,.6);color:white" onclick="Pages._exportDepenses()">
              <i class="fa-solid fa-file-excel"></i> Excel
            </button>
            <button class="btn btn-outline" style="border-color:rgba(255,255,255,.6);color:white" onclick="Pages._printDepenses()">
              <i class="fa-solid fa-print"></i> PDF
            </button>
          </div>
        </div>

        <!-- T4.5 — STATS CARDS DÉPENSES -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:1.25rem">
          <div style="background:white;border-radius:12px;padding:1.1rem 1.25rem;box-shadow:0 2px 8px rgba(0,0,0,.08);border-left:4px solid #e53935">
            <div style="display:flex;align-items:center;gap:.75rem">
              <div style="width:44px;height:44px;border-radius:10px;background:#ffebee;display:flex;align-items:center;justify-content:center;font-size:1.1rem;color:#e53935"><i class="fa-solid fa-calendar-day"></i></div>
              <div><div style="font-size:1.35rem;font-weight:700;color:#1a1a2e">${money(totalMois)}</div><div style="font-size:.78rem;color:#666;margin-top:.1rem">Ce mois-ci</div></div>
            </div>
          </div>
          <div style="background:white;border-radius:12px;padding:1.1rem 1.25rem;box-shadow:0 2px 8px rgba(0,0,0,.08);border-left:4px solid #1a73e8">
            <div style="display:flex;align-items:center;gap:.75rem">
              <div style="width:44px;height:44px;border-radius:10px;background:#e3f2fd;display:flex;align-items:center;justify-content:center;font-size:1.1rem;color:#1a73e8"><i class="fa-solid fa-sigma"></i></div>
              <div><div style="font-size:1.35rem;font-weight:700;color:#1a1a2e">${money(totalAll)}</div><div style="font-size:.78rem;color:#666;margin-top:.1rem">Total général</div></div>
            </div>
          </div>
          <div style="background:white;border-radius:12px;padding:1.1rem 1.25rem;box-shadow:0 2px 8px rgba(0,0,0,.08);border-left:4px solid #7b1fa2;grid-column:span 1">
            <div style="font-size:.78rem;font-weight:600;color:#7b1fa2;margin-bottom:.5rem"><i class="fa-solid fa-chart-pie"></i> Top catégories</div>
            ${topCat.length ? topCat.map(([c,v])=>`<div style="display:flex;justify-content:space-between;font-size:.8rem;padding:.15rem 0"><span>${c}</span><strong style="color:#7b1fa2">${money(v)}</strong></div>`).join('') : '<div style="font-size:.78rem;color:#999">Aucune donnée</div>'}
          </div>
        </div>

        ${!depenses.length ? `
        <div class="card" style="box-shadow:0 2px 12px rgba(0,0,0,.07)"><div class="card-body">
          <div class="empty-state">
            <i class="fa-solid fa-receipt" style="color:#e53935"></i>
            <h3>Aucune dépense enregistrée</h3>
            <p>Enregistrez les sorties de caisse de l'école</p>
            <button class="btn btn-danger" style="margin-top:1rem" onclick="Pages._openDepenseModal()"><i class="fa-solid fa-plus"></i> Enregistrer une dépense</button>
          </div>
        </div></div>` : `
        <div class="card" style="box-shadow:0 2px 12px rgba(0,0,0,.07)">
          <div class="card-header" style="background:#f8f9fa;border-radius:12px 12px 0 0;padding:1rem 1.25rem">
            <div class="card-title" style="font-size:1rem;font-weight:600">
              <i class="fa-solid fa-list" style="color:#e53935"></i> Historique des dépenses
              <span style="background:#ffebee;color:#e53935;border-radius:20px;padding:.1rem .6rem;font-size:.78rem;margin-left:.5rem;font-weight:600">${depenses.length}</span>
            </div>
            <div class="search-bar" style="width:220px"><i class="fa-solid fa-search"></i><input type="search" id="dep-search" placeholder="Motif, catégorie…" oninput="Pages._filterDepenses()"></div>
          </div>
          <div class="card-body" style="padding:0">
            <div class="table-wrapper">
              <table>
                <thead style="background:#f1f3f5"><tr><th>Date</th><th>Motif</th><th>Catégorie</th><th style="text-align:right">Montant</th><th>Par</th><th style="text-align:center">Actions</th></tr></thead>
                <tbody id="dep-tbody">${this._buildDepRows(depenses)}</tbody>
              </table>
            </div>
          </div>
        </div>`}
      `);
      this._depensesCache = depenses;
    } catch (err) { setContent(`<div class="empty-state"><h3>Erreur</h3><p>${err.message}</p></div>`); }
  },

  _buildDepRows(depenses) {
    // T4.5 — Ligne dépense modernisée
    if (!depenses.length) return `<tr><td colspan="6" class="table-empty"><i class="fa-solid fa-receipt"></i> Aucune dépense</td></tr>`;
    return depenses.map(d => `<tr>
      <td style="white-space:nowrap;padding:.7rem 1rem">${Fmt.date(d.date_depense||d.created_at)}</td>
      <td>
        <div style="font-weight:600;color:#1a1a2e">${d.motif}</div>
        ${d.description?`<div style="font-size:.73rem;color:var(--gray-500)">${d.description}</div>`:''}
      </td>
      <td>${d.categorie?`<span class="chip" style="background:#f3e5f5;color:#7b1fa2;border:none;font-size:.77rem">${d.categorie}</span>`:'—'}</td>
      <td style="text-align:right"><strong style="color:#e53935;font-size:1rem">${money(d.montant)}</strong></td>
      <td style="color:var(--gray-600)">${d.par||'—'}</td>
      <td style="text-align:center">
        <button class="btn-icon" onclick="Pages._deleteDepense('${d.id}')" title="Supprimer" style="color:#e53935;background:#ffebee;border-radius:6px;padding:.3rem .5rem;border:none;cursor:pointer">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>`).join('');
  },

  _filterDepenses() {
    const txt = document.getElementById('dep-search')?.value?.toLowerCase() || '';
    let list = this._depensesCache || [];
    if (txt) list = list.filter(d => (d.motif||'').toLowerCase().includes(txt) || (d.categorie||'').toLowerCase().includes(txt));
    document.getElementById('dep-tbody').innerHTML = this._buildDepRows(list);
  },

  _openDepenseModal() {
    Modal.open('➕ Nouvelle dépense', `
      <div class="form-group"><label class="form-label">Motif de la dépense <span style="color:red">*</span></label><input class="form-control" id="dep-motif" placeholder="Objet précis de la dépense"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Montant <span style="color:red">*</span></label><input type="number" class="form-control" id="dep-montant" min="0" placeholder="0"></div>
        <div class="form-group"><label class="form-label">Catégorie</label>
          <select class="form-control" id="dep-cat"><option>Fournitures</option><option>Salaires</option><option>Maintenance</option><option>Eau / Électricité</option><option>Transport</option><option>Communication</option><option>Autre</option></select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Date</label><input type="date" class="form-control" id="dep-date" value="${new Date().toISOString().split('T')[0]}"></div>
        <div class="form-group"><label class="form-label">Description</label><input class="form-control" id="dep-desc" placeholder="Détails supplémentaires"></div>
      </div>
    `, `
      <button class="btn btn-outline" onclick="Modal.close()">Annuler</button>
      <button class="btn btn-danger" id="dep-save-btn" onclick="Pages._saveDepense()"><i class="fa-solid fa-save"></i> Enregistrer</button>
    `);
  },

  async _saveDepense() {
    const motif = document.getElementById('dep-motif').value.trim();
    const montant = parseFloat(document.getElementById('dep-montant').value);
    if (!motif) { Toast.error('Le motif est obligatoire.'); return; }
    if (!montant || montant <= 0) { Toast.error('Montant invalide.'); return; }
    const btn = document.getElementById('dep-save-btn');
    if (!Debounce.btn(btn, 5000)) return; // anti-double-clic
    try {
      await DB.insert('depenses', { motif, montant, categorie: document.getElementById('dep-cat').value, description: document.getElementById('dep-desc').value, date_depense: document.getElementById('dep-date').value, par: `${App.currentUser?.prenom||''} ${App.currentUser?.nom||''}`.trim() });
      Modal.close(); Toast.success('Dépense enregistrée !'); Pages.depenses();
    } catch (err) { Toast.error('Erreur : ' + err.message); Debounce.release(btn, '<i class="fa-solid fa-save"></i> Enregistrer'); }
  },

  async _deleteDepense(id) {
    if (!confirm('Supprimer cette dépense ?')) return;
    await DB.delete('depenses', id); Toast.success('Supprimé.'); Pages.depenses();
  },

  async _exportDepenses() {
    const dep = await DB.getAll('depenses');
    const rows = dep.map(d=>[Fmt.date(d.date_depense||d.created_at),d.motif,d.categorie||'',d.montant,d.par||'',d.description||'']);
    Export.toXLSX(['Date','Motif','Catégorie','Montant','Par','Description'],
      rows.map(r=>[r[0],r[1],r[2],parseFloat(r[3])||r[3],r[4],r[5]]),
      `depenses-${new Date().toISOString().split('T')[0]}.xlsx`);
  },

  // Fix 5 — Impression PDF dépenses : fenêtre dédiée propre (sans voile gris)
  async _printDepenses() {
    const [cfg, dep] = await Promise.all([DB.getEcoleConfig(), DB.getAll('depenses')]);
    const total = dep.reduce((s,d)=>s+parseFloat(d.montant||0),0);
    const rowsHtml = dep.sort((a,b)=>new Date(b.date_depense||b.created_at)-new Date(a.date_depense||a.created_at)).map(d => {
      const dt = d.date_depense || d.created_at;
      const dateStr = dt ? new Date(dt).toLocaleDateString('fr-FR') : '—';
      return `<tr>
        <td>${dateStr}</td>
        <td>${d.motif||'—'}</td>
        <td>${d.categorie||'—'}</td>
        <td align="right"><b>${parseFloat(d.montant||0).toLocaleString('fr-FR')} ${_deviseCache}</b></td>
        <td>${d.par||'—'}</td>
        <td style="font-size:8pt;color:#666">${d.description||''}</td>
      </tr>`;
    }).join('');
    // R11 — PrintHelper (Blob URL iframe modal)
    PrintHelper.show(`<!DOCTYPE html><html lang="fr"><head>
      <meta charset="UTF-8"><title>Registre des dépenses</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Arial,sans-serif;font-size:9pt;background:#fff;color:#000;padding:1cm}
        h2{color:#ea4335;text-align:center;font-size:13pt;margin-bottom:.2cm}
        h3{text-align:center;font-size:11pt;margin-bottom:.1cm}
        p.sub{text-align:center;font-size:8pt;color:#666;margin-bottom:.5cm;border-bottom:2px solid #ea4335;padding-bottom:.3cm}
        table{border-collapse:collapse;width:100%}
        th,td{border:1pt solid #aaa;padding:3pt 5pt;font-size:8.5pt}
        thead tr{background:#ea4335!important;color:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        tfoot tr{background:#fce4ec!important;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        @page{size:A4 portrait;margin:.7cm .9cm}
      </style></head><body>
      <h2>${cfg?.nom||'École'}</h2>
      <h3>REGISTRE DES DÉPENSES</h3>
      <p class="sub">Imprimé le ${new Date().toLocaleString('fr-FR')} — Total : ${total.toLocaleString('fr-FR')} ${_deviseCache}</p>
      <table>
        <thead><tr>
          <th>Date</th><th>Motif</th><th>Catégorie</th><th>Montant</th><th>Par</th><th>Description</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot><tr>
          <td colspan="3" align="right">TOTAL :</td>
          <td align="right">${total.toLocaleString('fr-FR')} ${_deviseCache}</td>
          <td colspan="2"></td>
        </tr></tfoot>
      </table>
    </body></html>`, 'Registre des Dépenses');
  },

  // ══════════════════════════════════════════════════════════════════
  // RAPPORTS FINANCIERS
  // ══════════════════════════════════════════════════════════════════
  async rapports() {
    await getDevise();
    const now = new Date();
    const debut = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const fin = now.toISOString().split('T')[0];
    setContent(`
      <!-- T4.5 — PAGE-HEADER RAPPORTS -->
      <div class="page-header" style="background:linear-gradient(135deg,#283593 0%,#1a237e 100%);border-radius:12px;padding:1.25rem 1.5rem;margin-bottom:1.25rem;color:white">
        <div class="page-header-left">
          <h2 style="color:white;margin:0;display:flex;align-items:center;gap:.6rem"><i class="fa-solid fa-chart-bar"></i> Rapports Financiers</h2>
          <p style="color:rgba(255,255,255,.75);margin:.2rem 0 0">Analyse des entrées et sorties de caisse</p>
        </div>
      </div>

      <!-- T4.5 — SÉLECTEUR PÉRIODE MODERNISÉ -->
      <div class="card" style="box-shadow:0 2px 12px rgba(0,0,0,.07);margin-bottom:1.25rem">
        <div class="card-header" style="background:#f8f9fa;border-radius:12px 12px 0 0;padding:1rem 1.25rem">
          <div class="card-title" style="font-size:1rem;font-weight:600"><i class="fa-solid fa-calendar-range" style="color:var(--primary)"></i> Période d'analyse</div>
        </div>
        <div class="card-body">
          <div style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:flex-end">
            <div class="form-group" style="margin:0">
              <label class="form-label" style="font-size:.8rem">Du</label>
              <input type="date" class="form-control" id="rap-debut" value="${debut}">
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label" style="font-size:.8rem">Au</label>
              <input type="date" class="form-control" id="rap-fin" value="${fin}">
            </div>
            <button class="btn btn-primary" onclick="Pages._loadRapport()">
              <i class="fa-solid fa-chart-bar"></i> Générer
            </button>
            <div style="display:flex;gap:.4rem">
              <button class="btn btn-outline btn-sm" onclick="Pages._rapportJour()"><i class="fa-solid fa-sun"></i> Aujourd'hui</button>
              <button class="btn btn-outline btn-sm" onclick="Pages._rapportMois()"><i class="fa-solid fa-calendar-days"></i> Ce mois</button>
            </div>
          </div>
        </div>
      </div>
      <div id="rapport-content"></div>`);
    this._loadRapport();
  },

  _rapportJour() {
    const t = new Date().toISOString().split('T')[0];
    document.getElementById('rap-debut').value = t;
    document.getElementById('rap-fin').value = t;
    this._loadRapport();
  },
  _rapportMois() {
    const now = new Date();
    document.getElementById('rap-debut').value = new Date(now.getFullYear(),now.getMonth(),1).toISOString().split('T')[0];
    document.getElementById('rap-fin').value = now.toISOString().split('T')[0];
    this._loadRapport();
  },

  async _loadRapport() {
    const debut = document.getElementById('rap-debut').value;
    const fin = document.getElementById('rap-fin').value;
    const content = document.getElementById('rapport-content');
    if (!content) return;
    content.innerHTML = '<div style="text-align:center;padding:2rem"><div class="loading-spinner"></div></div>';
    try {
      const rap = await DB.getRapportFinancier(debut, fin);
      const eleves = await DB.getAll('eleves');
      const eMap = Object.fromEntries(eleves.map(e=>[e.id,e]));
      this._currentRap = { rap, debut, fin };

      // T4.5 — Résumé coloré moderne
      const isPositif = rap.beneficeNet >= 0;
      content.innerHTML = `
        <!-- T4.5 — KPI CARDS RAPPORT -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:1.25rem">
          <div style="background:white;border-radius:12px;padding:1.1rem 1.25rem;box-shadow:0 2px 8px rgba(0,0,0,.08);border-top:4px solid #27ae60">
            <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.6rem">
              <div style="width:40px;height:40px;border-radius:10px;background:#e8f5e9;display:flex;align-items:center;justify-content:center;color:#27ae60"><i class="fa-solid fa-arrow-trend-up"></i></div>
              <div style="font-size:.78rem;color:#666;font-weight:500">Total Encaissé</div>
            </div>
            <div style="font-size:1.4rem;font-weight:700;color:#1a1a2e">${money(rap.totalEncaisse)}</div>
            <div style="font-size:.72rem;color:#27ae60;margin-top:.3rem">${rap.paiements.length} versement(s)</div>
          </div>
          <div style="background:white;border-radius:12px;padding:1.1rem 1.25rem;box-shadow:0 2px 8px rgba(0,0,0,.08);border-top:4px solid #e53935">
            <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.6rem">
              <div style="width:40px;height:40px;border-radius:10px;background:#ffebee;display:flex;align-items:center;justify-content:center;color:#e53935"><i class="fa-solid fa-arrow-trend-down"></i></div>
              <div style="font-size:.78rem;color:#666;font-weight:500">Total Dépenses</div>
            </div>
            <div style="font-size:1.4rem;font-weight:700;color:#1a1a2e">${money(rap.totalDepenses)}</div>
            <div style="font-size:.72rem;color:#e53935;margin-top:.3rem">${rap.depenses.length} dépense(s)</div>
          </div>
          <div style="background:white;border-radius:12px;padding:1.1rem 1.25rem;box-shadow:0 2px 8px rgba(0,0,0,.08);border-top:4px solid ${isPositif?'#1a73e8':'#ff8f00'}">
            <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.6rem">
              <div style="width:40px;height:40px;border-radius:10px;background:${isPositif?'#e3f2fd':'#fff8e1'};display:flex;align-items:center;justify-content:center;color:${isPositif?'#1a73e8':'#ff8f00'}"><i class="fa-solid fa-scale-balanced"></i></div>
              <div style="font-size:.78rem;color:#666;font-weight:500">${isPositif?'Bénéfice Net':'Déficit'}</div>
            </div>
            <div style="font-size:1.4rem;font-weight:700;color:${isPositif?'#1a73e8':'#ff8f00'}">${isPositif?'+':'−'}${money(Math.abs(rap.beneficeNet))}</div>
            <div style="font-size:.72rem;color:#888;margin-top:.3rem">Du ${debut} au ${fin}</div>
          </div>
        </div>

        <!-- T4.5 — DÉTAIL ENCAISSEMENTS + DÉPENSES -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem">
          <div class="card" style="box-shadow:0 2px 12px rgba(0,0,0,.07)">
            <div class="card-header" style="background:#f0fdf4;border-radius:12px 12px 0 0;padding:.85rem 1.25rem">
              <div class="card-title" style="color:#27ae60;font-size:.95rem">
                <i class="fa-solid fa-arrow-up"></i> Encaissements
                <span style="background:#dcfce7;color:#16a34a;border-radius:20px;padding:.1rem .5rem;font-size:.75rem;margin-left:.4rem">${rap.paiements.length}</span>
              </div>
              <button class="btn btn-outline btn-sm" onclick="Pages._exportRapPay()"><i class="fa-solid fa-file-excel" style="color:#217346"></i> Excel</button>
            </div>
            <div class="card-body" style="padding:0"><div class="table-wrapper" style="max-height:280px;overflow-y:auto">
              <table>
                <thead style="background:#f0fdf4"><tr><th>Date</th><th>Élève</th><th style="text-align:right">Montant</th><th>Mode</th></tr></thead>
                <tbody>${rap.paiements.map(p=>{const e=eMap[p.eleve_id];return `<tr>
                  <td style="white-space:nowrap;font-size:.8rem">${Fmt.datetime(p.date_paiement||p.created_at)}</td>
                  <td style="font-size:.85rem">${e?e.prenom+' '+e.nom:'—'}</td>
                  <td style="text-align:right;color:#27ae60;font-weight:600">${money(p.montant)}</td>
                  <td><span class="chip" style="font-size:.72rem">${p.mode_paiement||'Espèces'}</span></td>
                </tr>`;}).join('')||'<tr><td colspan="4" class="table-empty">Aucun encaissement</td></tr>'}</tbody>
              </table>
            </div></div>
          </div>
          <div class="card" style="box-shadow:0 2px 12px rgba(0,0,0,.07)">
            <div class="card-header" style="background:#fff5f5;border-radius:12px 12px 0 0;padding:.85rem 1.25rem">
              <div class="card-title" style="color:#e53935;font-size:.95rem">
                <i class="fa-solid fa-arrow-down"></i> Dépenses
                <span style="background:#fee2e2;color:#dc2626;border-radius:20px;padding:.1rem .5rem;font-size:.75rem;margin-left:.4rem">${rap.depenses.length}</span>
              </div>
              <button class="btn btn-outline btn-sm" onclick="Pages._exportRapDep()"><i class="fa-solid fa-file-excel" style="color:#217346"></i> Excel</button>
            </div>
            <div class="card-body" style="padding:0"><div class="table-wrapper" style="max-height:280px;overflow-y:auto">
              <table>
                <thead style="background:#fff5f5"><tr><th>Date</th><th>Motif</th><th style="text-align:right">Montant</th></tr></thead>
                <tbody>${rap.depenses.map(d=>`<tr>
                  <td style="white-space:nowrap;font-size:.8rem">${Fmt.date(d.date_depense||d.created_at)}</td>
                  <td style="font-size:.85rem">${d.motif}</td>
                  <td style="text-align:right;color:#e53935;font-weight:600">${money(d.montant)}</td>
                </tr>`).join('')||'<tr><td colspan="3" class="table-empty">Aucune dépense</td></tr>'}</tbody>
              </table>
            </div></div>
          </div>
        </div>

        <div style="display:flex;gap:.75rem;justify-content:flex-end;margin-top:1.25rem;flex-wrap:wrap">
          <button class="btn btn-outline" onclick="Pages._printRapport()"><i class="fa-solid fa-print"></i> Imprimer PDF</button>
          <button class="btn btn-success" onclick="Pages._exportRapportComplet()"><i class="fa-solid fa-file-excel"></i> Export complet Excel</button>
        </div>`;
    } catch (err) { content.innerHTML = `<div class="empty-state"><h3>Erreur</h3><p>${err.message}</p></div>`; }
  },

  async _exportRapPay() {
    const { rap } = this._currentRap || {};
    if (!rap) return;
    const eleves = await DB.getAll('eleves'); const eMap = Object.fromEntries(eleves.map(e=>[e.id,e]));
    Export.toXLSX(['Date','Nom','Prénom','Montant','Mode'],
      rap.paiements.map(p=>{const e=eMap[p.eleve_id];return[Fmt.datetime(p.date_paiement||p.created_at),e?.nom||'',e?.prenom||'',parseFloat(p.montant||0),p.mode_paiement||''];}),
      'rapport-encaissements.xlsx');
  },
  _exportRapDep() {
    const { rap } = this._currentRap || {};
    if (!rap) return;
    Export.toXLSX(['Date','Motif','Catégorie','Montant'],
      rap.depenses.map(d=>[Fmt.date(d.date_depense||d.created_at),d.motif,d.categorie||'',parseFloat(d.montant||0)]),
      'rapport-depenses.xlsx');
  },
  async _exportRapportComplet() {
    const { rap, debut, fin } = this._currentRap || {};
    if (!rap) return;
    const eleves = await DB.getAll('eleves'); const eMap = Object.fromEntries(eleves.map(e=>[e.id,e]));
    const rows = [
      ['=== RAPPORT FINANCIER ===','','',''],['Période : '+Fmt.date(debut)+' au '+Fmt.date(fin),'','',''],['','','',''],
      ['--- ENCAISSEMENTS ---','','',''],['Date','Élève','Montant','Mode'],
      ...rap.paiements.map(p=>{const e=eMap[p.eleve_id];return[Fmt.datetime(p.date_paiement||p.created_at),`${e?.prenom||''} ${e?.nom||''}`,p.montant,p.mode_paiement||''];}),
      ['','','',''],['--- DÉPENSES ---','','',''],['Date','Motif','Montant','Catégorie'],
      ...rap.depenses.map(d=>[Fmt.date(d.date_depense||d.created_at),d.motif,d.montant,d.categorie||'']),
      ['','','',''],['--- RÉSUMÉ ---','','',''],
      ['Total Encaissé',rap.totalEncaisse,'',''],['Total Dépenses',rap.totalDepenses,'',''],['Bénéfice Net',rap.beneficeNet,'','']
    ];
    // Export rapport complet en xlsx multi-sections
    const xlsxRows = [
      [`=== RAPPORT FINANCIER ===`,'','',''],
      [`Période : ${Fmt.date(debut)} au ${Fmt.date(fin)}`,'','',''],
      ['','','',''],
      ['--- ENCAISSEMENTS ---','','',''],
      ['Date','Elève','Montant','Mode'],
      ...rap.paiements.map(p=>{const e=eMap[p.eleve_id];return[Fmt.datetime(p.date_paiement||p.created_at),`${e?.prenom||''} ${e?.nom||''}`,parseFloat(p.montant||0),p.mode_paiement||''];}),
      ['','','',''],
      ['--- DÉPENSES ---','','',''],
      ['Date','Motif','Montant','Catégorie'],
      ...rap.depenses.map(d=>[Fmt.date(d.date_depense||d.created_at),d.motif,parseFloat(d.montant||0),d.categorie||'']),
      ['','','',''],
      ['--- RÉSUMÉ ---','','',''],
      ['Total Encaissé',parseFloat(rap.totalEncaisse||0),'',''],
      ['Total Dépenses',parseFloat(rap.totalDepenses||0),'',''],
      ['Bénéfice Net',parseFloat(rap.beneficeNet||0),'',' ']
    ];
    Export.toXLSX(['A','B','C','D'], xlsxRows, `rapport-complet-${debut}-${fin}.xlsx`);
  },

  async _printRapport() {
    const { rap, debut, fin } = this._currentRap || {};
    if (!rap) { Toast.error('Générez d\'abord le rapport avant d\'imprimer.'); return; }
    const [cfg, eleves] = await Promise.all([DB.getEcoleConfig(), DB.getAll('eleves')]);
    const eMap = Object.fromEntries(eleves.map(e=>[e.id,e]));

    const rowsEnc = rap.paiements.map(p => {
      const e = eMap[p.eleve_id];
      return `<tr><td>${p.date_paiement ? new Date(p.date_paiement).toLocaleDateString('fr-FR') : '—'}</td><td>${e ? e.prenom+' '+e.nom : '—'}</td><td align="right"><b>${parseFloat(p.montant||0).toLocaleString('fr-FR')} ${_deviseCache}</b></td></tr>`;
    }).join('');

    const rowsDep = rap.depenses.map(d => {
      const dt = d.date_depense || d.created_at;
      return `<tr><td>${dt ? new Date(dt).toLocaleDateString('fr-FR') : '—'}</td><td>${d.motif||'—'}</td><td align="right"><b>${parseFloat(d.montant||0).toLocaleString('fr-FR')} ${_deviseCache}</b></td></tr>`;
    }).join('');

    // R11 — PrintHelper (Blob URL iframe modal)
    PrintHelper.show(`<!DOCTYPE html><html lang="fr"><head>
      <meta charset="UTF-8"><title>Rapport Financier</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Arial,sans-serif;font-size:9pt;background:#fff;color:#000;padding:1cm}
        h2{text-align:center;font-size:13pt;margin-bottom:.2cm;color:#1a73e8}
        h3{text-align:center;font-size:10pt;margin-bottom:.5cm;color:#555}
        table{border-collapse:collapse;width:100%;margin-top:.4cm}
        th,td{border:1pt solid #ccc;padding:3pt 5pt;font-size:8.5pt}
        .enc-hd{background:#1a73e8!important;color:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        .dep-hd{background:#ea4335!important;color:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        .sum-hd{background:#f5f5f5!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        tr:nth-child(even){background:#fafafa}
        .bilan td{font-size:10pt;font-weight:bold}
        @page{size:A4 portrait;margin:.8cm 1cm}
      </style></head><body>
      <h2>${cfg?.nom||'École'}</h2>
      <h3>RAPPORT FINANCIER — Du ${debut ? new Date(debut).toLocaleDateString('fr-FR') : '—'} au ${fin ? new Date(fin).toLocaleDateString('fr-FR') : '—'}</h3>
      <table>
        <tr class="enc-hd"><td colspan="3"><b>📥 ENCAISSEMENTS — Total : ${parseFloat(rap.totalEncaisse||0).toLocaleString('fr-FR')} ${_deviseCache}</b></td></tr>
        <tr class="sum-hd"><th>Date</th><th>Élève</th><th>Montant</th></tr>
        ${rowsEnc || '<tr><td colspan="3" style="text-align:center;color:#999">Aucun encaissement sur cette période</td></tr>'}
      </table>
      <table>
        <tr class="dep-hd"><td colspan="3"><b>📤 DÉPENSES — Total : ${parseFloat(rap.totalDepenses||0).toLocaleString('fr-FR')} ${_deviseCache}</b></td></tr>
        <tr class="sum-hd"><th>Date</th><th>Motif</th><th>Montant</th></tr>
        ${rowsDep || '<tr><td colspan="3" style="text-align:center;color:#999">Aucune dépense sur cette période</td></tr>'}
      </table>
      <table class="bilan" style="margin-top:.5cm;width:60%;margin-left:auto">
        <tr><th style="text-align:left">Total Encaissé</th><td style="color:#27ae60;text-align:right">${parseFloat(rap.totalEncaisse||0).toLocaleString('fr-FR')} ${_deviseCache}</td></tr>
        <tr><th style="text-align:left">Total Dépenses</th><td style="color:#e74c3c;text-align:right">${parseFloat(rap.totalDepenses||0).toLocaleString('fr-FR')} ${_deviseCache}</td></tr>
        <tr style="background:#e8f5e9"><th style="text-align:left">Bénéfice Net</th><td style="color:${(rap.beneficeNet||0)>=0?'#1565c0':'#b71c1c'};text-align:right;font-size:11pt">${parseFloat(rap.beneficeNet||0).toLocaleString('fr-FR')} ${_deviseCache}</td></tr>
      </table>
      <p style="text-align:right;margin-top:.4cm;font-size:7pt;color:#aaa">Généré le ${new Date().toLocaleString('fr-FR')}</p>
    </body></html>`, 'Rapport Financier');
  },

  // ══════════════════════════════════════════════════════════════════
  // SUPERVISION DES ENSEIGNANTS — R10 : Nouveau rôle superviseur
  // Lecture seule : activité enseignants, appels, saisie notes
  // ══════════════════════════════════════════════════════════════════
  async supervisionEnseignants() {
    setLoading('Chargement de la supervision…');
    try {
      const [users, classes, matieres, presences, notes, cfg] = await Promise.all([
        DB.getAll('utilisateurs'), DB.getAll('classes'), DB.getAll('matieres'),
        DB.getAll('presences'), DB.getAll('notes'), DB.getEcoleConfig()
      ]);
      const profs = users.filter(u => u.role === 'prof' && u.actif !== false);
      const cMap = Object.fromEntries(classes.map(c => [c.id, c]));
      const today = new Date().toISOString().split('T')[0];
      const now = new Date();

      // ── Calcul appel du jour par prof ───────────────────────────
      const appelAujourd = (prof) => {
        const classesProf = [];
        if (prof.classe_id) classesProf.push(prof.classe_id);
        if (prof.matieres_ids?.length) {
          matieres.filter(m => prof.matieres_ids.includes(m.id)).forEach(m => {
            if (m.classe_id && !classesProf.includes(m.classe_id)) classesProf.push(m.classe_id);
          });
        }
        if (!classesProf.length) return { fait: false, nbEleves: 0 };
        const presencesProf = presences.filter(p => classesProf.includes(p.classe_id) && (p.date || '').startsWith(today));
        return { fait: presencesProf.length > 0, nbEleves: presencesProf.length, classes: classesProf };
      };

      // ── Progression saisie notes (séquences 1-6) ────────────────
      const notesProgress = (prof) => {
        const classesProf = [];
        if (prof.classe_id) classesProf.push(prof.classe_id);
        const matsByProf = prof.matieres_ids?.length
          ? matieres.filter(m => prof.matieres_ids.includes(m.id))
          : matieres.filter(m => prof.classe_id && m.classe_id === prof.classe_id);
        matsByProf.forEach(m => { if (m.classe_id && !classesProf.includes(m.classe_id)) classesProf.push(m.classe_id); });

        const seqData = [1,2,3,4,5,6].map(seq => {
          let total = 0, renseignees = 0;
          matsByProf.forEach(mat => {
            const notesSeq = notes.filter(n => n.matiere_id === mat.id && n.sequence === seq);
            if (notesSeq.length > 0) { renseignees++; }
            total++;
          });
          return { seq, total, renseignees, pct: total > 0 ? Math.round(renseignees/total*100) : 0 };
        });
        return seqData;
      };

      // ── Construire les lignes du tableau ─────────────────────────
      const rowsProfs = profs.map(prof => {
        const appel = appelAujourd(prof);
        const progress = notesProgress(prof);
        const classeLabel = prof.classe_id && cMap[prof.classe_id]
          ? formatClasseLabel(cMap[prof.classe_id])
          : (prof.matieres_ids?.length ? `${prof.matieres_ids.length} matière(s)` : '—');
        const appelBadge = appel.fait
          ? `<span style="background:#e8f5e9;color:#2e7d32;border-radius:12px;padding:.2rem .7rem;font-size:.78rem;font-weight:600">✅ Fait (${appel.nbEleves} présences)</span>`
          : `<span style="background:#ffebee;color:#c62828;border-radius:12px;padding:.2rem .7rem;font-size:.78rem;font-weight:600">❌ Non fait</span>`;
        const seqBars = progress.map(s => {
          const color = s.pct >= 80 ? '#27ae60' : s.pct >= 40 ? '#ff8f00' : '#ccc';
          const bg = s.pct >= 80 ? '#e8f5e9' : s.pct >= 40 ? '#fff8e1' : '#f5f5f5';
          return `<div style="text-align:center;flex:1">
            <div style="font-size:.65rem;color:#888;margin-bottom:.2rem">S${s.seq}</div>
            <div style="width:28px;height:28px;border-radius:50%;background:${bg};border:2px solid ${color};display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:700;color:${color};margin:auto">${s.pct > 0 ? s.pct+'%' : '—'}</div>
          </div>`;
        }).join('');
        return `<tr>
          <td style="padding:.8rem 1rem">
            <div style="display:flex;align-items:center;gap:.6rem">
              <div style="width:36px;height:36px;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:.8rem;flex-shrink:0">
                ${((prof.prenom?.[0]||'')+(prof.nom?.[0]||'')).toUpperCase()||'?'}
              </div>
              <div>
                <div style="font-weight:600;font-size:.88rem">${prof.prenom||''} ${prof.nom||''}</div>
                <div style="font-size:.73rem;color:var(--gray-500)">${prof.email||''}</div>
              </div>
            </div>
          </td>
          <td style="padding:.8rem .5rem"><span class="chip" style="font-size:.75rem">${classeLabel}</span></td>
          <td style="padding:.8rem .5rem">${appelBadge}</td>
          <td style="padding:.8rem .5rem">
            <div style="display:flex;gap:.3rem;align-items:flex-end">${seqBars}</div>
          </td>
        </tr>`;
      }).join('') || `<tr><td colspan="4" class="table-empty"><i class="fa-solid fa-user-times"></i> Aucun enseignant actif</td></tr>`;

      // ── Statistiques globales ────────────────────────────────────
      const nbAppelsFaits = profs.filter(p => appelAujourd(p).fait).length;
      const pctAppels = profs.length > 0 ? Math.round(nbAppelsFaits/profs.length*100) : 0;

      setContent(`
        <div class="page-header" style="background:linear-gradient(135deg,#4a148c 0%,#7b1fa2 100%);border-radius:12px;padding:1.25rem 1.5rem;margin-bottom:1.25rem;color:white">
          <div class="page-header-left">
            <h2 style="color:white;margin:0;display:flex;align-items:center;gap:.6rem">
              <i class="fa-solid fa-user-shield"></i> Supervision des Enseignants
            </h2>
            <p style="color:rgba(255,255,255,.75);margin:.2rem 0 0">${profs.length} enseignant(s) actif(s) · ${cfg?.nom||'École'} · ${new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})}</p>
          </div>
          <div style="background:rgba(255,255,255,.15);border-radius:8px;padding:.6rem 1rem;text-align:center">
            <div style="font-size:1.5rem;font-weight:700">${pctAppels}%</div>
            <div style="font-size:.72rem;opacity:.85">Appels du jour</div>
          </div>
        </div>

        <!-- KPI Cards -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:1.25rem">
          <div style="background:white;border-radius:12px;padding:1.1rem 1.25rem;box-shadow:0 2px 8px rgba(0,0,0,.08);border-left:4px solid #4a148c">
            <div style="display:flex;align-items:center;gap:.75rem">
              <div style="width:44px;height:44px;border-radius:10px;background:#f3e5f5;display:flex;align-items:center;justify-content:center;font-size:1.1rem;color:#7b1fa2"><i class="fa-solid fa-chalkboard-user"></i></div>
              <div><div style="font-size:1.5rem;font-weight:700;color:#1a1a2e">${profs.length}</div><div style="font-size:.78rem;color:#666">Enseignants actifs</div></div>
            </div>
          </div>
          <div style="background:white;border-radius:12px;padding:1.1rem 1.25rem;box-shadow:0 2px 8px rgba(0,0,0,.08);border-left:4px solid #27ae60">
            <div style="display:flex;align-items:center;gap:.75rem">
              <div style="width:44px;height:44px;border-radius:10px;background:#e8f5e9;display:flex;align-items:center;justify-content:center;font-size:1.1rem;color:#27ae60"><i class="fa-solid fa-clipboard-check"></i></div>
              <div><div style="font-size:1.5rem;font-weight:700;color:#1a1a2e">${nbAppelsFaits}</div><div style="font-size:.78rem;color:#666">Appels faits aujourd'hui</div></div>
            </div>
          </div>
          <div style="background:white;border-radius:12px;padding:1.1rem 1.25rem;box-shadow:0 2px 8px rgba(0,0,0,.08);border-left:4px solid #e53935">
            <div style="display:flex;align-items:center;gap:.75rem">
              <div style="width:44px;height:44px;border-radius:10px;background:#ffebee;display:flex;align-items:center;justify-content:center;font-size:1.1rem;color:#e53935"><i class="fa-solid fa-triangle-exclamation"></i></div>
              <div><div style="font-size:1.5rem;font-weight:700;color:#1a1a2e">${profs.length - nbAppelsFaits}</div><div style="font-size:.78rem;color:#666">Appels manquants</div></div>
            </div>
          </div>
          <div style="background:white;border-radius:12px;padding:1.1rem 1.25rem;box-shadow:0 2px 8px rgba(0,0,0,.08);border-left:4px solid #1a73e8">
            <div style="display:flex;align-items:center;gap:.75rem">
              <div style="width:44px;height:44px;border-radius:10px;background:#e3f2fd;display:flex;align-items:center;justify-content:center;font-size:1.1rem;color:#1a73e8"><i class="fa-solid fa-chalkboard"></i></div>
              <div><div style="font-size:1.5rem;font-weight:700;color:#1a1a2e">${classes.length}</div><div style="font-size:.78rem;color:#666">Classes configurées</div></div>
            </div>
          </div>
        </div>

        <!-- Note lecture seule -->
        <div style="background:#fff8e1;border-radius:8px;padding:.7rem 1rem;margin-bottom:1rem;font-size:.83rem;color:#f57c00;border-left:4px solid #ff8f00">
          <i class="fa-solid fa-eye"></i> <strong>Mode lecture seule</strong> — En tant que superviseur, vous consultez uniquement. Aucune modification n'est possible.
        </div>

        <!-- Tableau enseignants -->
        <div class="card" style="box-shadow:0 2px 12px rgba(0,0,0,.07)">
          <div class="card-header" style="background:#f8f9fa;border-radius:12px 12px 0 0;padding:1rem 1.25rem">
            <div class="card-title" style="font-size:1rem;font-weight:600">
              <i class="fa-solid fa-users" style="color:#7b1fa2"></i> Activité des enseignants
              <span style="background:#f3e5f5;color:#7b1fa2;border-radius:20px;padding:.1rem .6rem;font-size:.78rem;margin-left:.5rem">${profs.length}</span>
            </div>
            <div style="font-size:.78rem;color:var(--gray-600)">Mis à jour le ${new Date().toLocaleString('fr-FR')}</div>
          </div>
          <div class="card-body" style="padding:0">
            <div class="table-wrapper">
              <table>
                <thead style="background:#f3e5f5">
                  <tr>
                    <th style="padding:.75rem 1rem">Enseignant</th>
                    <th>Classe / Matières</th>
                    <th>Appel du jour</th>
                    <th style="min-width:220px">Progression notes (S1→S6)</th>
                  </tr>
                </thead>
                <tbody>${rowsProfs}</tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Tableau classes et couverture -->
        <div class="card" style="box-shadow:0 2px 12px rgba(0,0,0,.07);margin-top:1.25rem">
          <div class="card-header" style="background:#f8f9fa;border-radius:12px 12px 0 0;padding:1rem 1.25rem">
            <div class="card-title" style="font-size:1rem;font-weight:600">
              <i class="fa-solid fa-chalkboard" style="color:#1a73e8"></i> Répartition des classes
            </div>
          </div>
          <div class="card-body" style="padding:0">
            <div class="table-wrapper">
              <table>
                <thead style="background:#f1f3f5">
                  <tr><th>Classe</th><th>Niveau</th><th>Enseignant(s)</th><th>Matières</th></tr>
                </thead>
                <tbody>
                  ${sortClasses(classes).map(cls => {
                    const matsCls = matieres.filter(m => m.classe_id === cls.id);
                    const profsCls = profs.filter(p =>
                      p.classe_id === cls.id ||
                      (p.matieres_ids?.some(mId => matsCls.find(m => m.id === mId)))
                    );
                    return `<tr>
                      <td><strong>${formatClasseLabel(cls)}</strong></td>
                      <td><span class="chip" style="font-size:.75rem">${cls.niveau}</span></td>
                      <td>${profsCls.map(p => `<span class="chip" style="font-size:.73rem;background:#f3e5f5;color:#7b1fa2;border:none">${p.prenom} ${p.nom}</span>`).join(' ') || '<span style="color:var(--gray-500);font-size:.8rem">Non assigné</span>'}</td>
                      <td><span class="badge badge-info">${matsCls.length} matière(s)</span></td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `);
    } catch (err) { setContent(`<div class="empty-state"><h3>Erreur</h3><p>${err.message}</p></div>`); }
  },

  // ══════════════════════════════════════════════════════════════════
  // STATISTIQUES — Dashboard Directeur avec Chart.js (R11)
  // Graphiques : taux recouvrement, répartition élèves, présences
  // ══════════════════════════════════════════════════════════════════
  async statistiques() {
    setLoading('Chargement des statistiques…');
    try {
      const [eleves, classes, configsSco, allPay, presences, notes, cfg] = await Promise.all([
        DB.getAll('eleves'), DB.getAll('classes'), DB.getAll('config_scolarite'),
        DB.getAll('paiements'), DB.getAll('presences'), DB.getAll('notes'), DB.getEcoleConfig()
      ]);
      await getDevise();

      const paysValides = allPay.filter(p => !p.annule);
      const cMap = Object.fromEntries(classes.map(c => [c.id, c]));
      const eMap = Object.fromEntries(eleves.map(e => [e.id, e]));
      const pMap = {};
      paysValides.forEach(p => { if (!pMap[p.eleve_id]) pMap[p.eleve_id] = []; pMap[p.eleve_id].push(p); });

      // ── Taux de recouvrement ─────────────────────────────────────
      const totalEnc = paysValides.reduce((s, p) => s + parseFloat(p.montant || 0), 0);
      const totalDu  = eleves.reduce((s, e) => {
        const cfg2 = configsSco.find(c => c.niveau === cMap[e.classe_id]?.niveau);
        return s + parseFloat(cfg2?.montant_annuel || 0);
      }, 0);
      const tauxRecouvrement = totalDu > 0 ? Math.min(100, Math.round(totalEnc / totalDu * 100)) : 0;
      const resteARecouvrer  = Math.max(0, totalDu - totalEnc);

      // ── Répartition par sexe ─────────────────────────────────────
      const garcons  = eleves.filter(e => e.sexe === 'M').length;
      const filles   = eleves.filter(e => e.sexe === 'F').length;
      const nbAutres = eleves.length - garcons - filles;

      // ── Répartition par classe (top 8) ───────────────────────────
      const sortedClasses = sortClasses(classes).slice(0, 10);
      const classeLabels  = sortedClasses.map(c => formatClasseLabel(c));
      const classeData    = sortedClasses.map(c => eleves.filter(e => e.classe_id === c.id).length);

      // ── Taux de présence par mois (6 derniers mois) ──────────────
      const moisLabels = [];
      const presData   = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mLabel = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
        moisLabels.push(mLabel);
        const presenceMois = presences.filter(p => {
          const pd = new Date(p.date || p.created_at);
          return pd.getMonth() === d.getMonth() && pd.getFullYear() === d.getFullYear();
        });
        const totalP = presenceMois.length;
        const presentsP = presenceMois.filter(p => p.present !== false && p.statut !== 'absent').length;
        presData.push(totalP > 0 ? Math.round(presentsP / totalP * 100) : 0);
      }

      // ── Notes : taux de réussite par séquence ────────────────────
      const seqLabels = ['S1','S2','S3','S4','S5','S6'];
      const reussiteData = seqLabels.map((_, idx) => {
        const seqNum = idx + 1;
        const notesSeq = notes.filter(n => n.sequence === seqNum && parseFloat(n.valeur) > 0);
        if (!notesSeq.length) return 0;
        const ok = notesSeq.filter(n => parseFloat(n.valeur) >= 10).length;
        return Math.round(ok / notesSeq.length * 100);
      });

      // ── Statuts financiers ───────────────────────────────────────
      let nSolde = 0, nEncours = 0, nAucun = 0;
      eleves.forEach(e => {
        const s = DB.getStatutPaiementSync(e.id, eMap, cMap, configsSco, pMap);
        if (s === 'solde') nSolde++;
        else if (s === 'encours') nEncours++;
        else if (s !== 'exonere') nAucun++;
      });

      // ── Couleur jauge recouvrement ────────────────────────────────
      const gaugeColor = tauxRecouvrement >= 75 ? '#27ae60' : tauxRecouvrement >= 40 ? '#f57c00' : '#c62828';

      setContent(`
        <div class="page-header" style="background:linear-gradient(135deg,#1a237e 0%,#283593 100%);border-radius:12px;padding:1.25rem 1.5rem;margin-bottom:1.25rem;color:white">
          <div class="page-header-left">
            <h2 style="color:white;margin:0;display:flex;align-items:center;gap:.6rem">
              <i class="fa-solid fa-chart-mixed"></i> Tableau de Bord Statistique
            </h2>
            <p style="color:rgba(255,255,255,.75);margin:.2rem 0 0">Vue macroscopique — ${cfg?.nom||'École'} — ${new Date().toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}</p>
          </div>
        </div>

        <!-- KPI SYNTHÈSE -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin-bottom:1.25rem">
          <div style="background:white;border-radius:12px;padding:1rem 1.25rem;box-shadow:0 2px 8px rgba(0,0,0,.08);border-left:4px solid #1a73e8">
            <div style="font-size:1.8rem;font-weight:800;color:#1a73e8">${eleves.length}</div>
            <div style="font-size:.8rem;color:var(--gray-600)">Élèves inscrits</div>
          </div>
          <div style="background:white;border-radius:12px;padding:1rem 1.25rem;box-shadow:0 2px 8px rgba(0,0,0,.08);border-left:4px solid ${gaugeColor}">
            <div style="font-size:1.8rem;font-weight:800;color:${gaugeColor}">${tauxRecouvrement}%</div>
            <div style="font-size:.8rem;color:var(--gray-600)">Taux de recouvrement</div>
          </div>
          <div style="background:white;border-radius:12px;padding:1rem 1.25rem;box-shadow:0 2px 8px rgba(0,0,0,.08);border-left:4px solid #27ae60">
            <div style="font-size:1.8rem;font-weight:800;color:#27ae60">${nSolde}</div>
            <div style="font-size:.8rem;color:var(--gray-600)">Élèves soldés</div>
          </div>
          <div style="background:white;border-radius:12px;padding:1rem 1.25rem;box-shadow:0 2px 8px rgba(0,0,0,.08);border-left:4px solid #e65100">
            <div style="font-size:1.4rem;font-weight:800;color:#e65100">${money(resteARecouvrer)}</div>
            <div style="font-size:.8rem;color:var(--gray-600)">Reste à recouvrer</div>
          </div>
        </div>

        <!-- GRAPHIQUES ROW 1 : Jauge + Répartition sexe -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;margin-bottom:1.25rem">
          <!-- Jauge recouvrement -->
          <div class="card">
            <div class="card-header">
              <div class="card-title"><i class="fa-solid fa-gauge"></i> Taux de recouvrement des scolarités</div>
            </div>
            <div class="card-body" style="display:flex;flex-direction:column;align-items:center;padding:1.5rem">
              <div class="gauge-container" style="width:220px">
                <canvas id="chart-gauge"></canvas>
              </div>
              <div style="display:flex;gap:1rem;margin-top:.75rem;flex-wrap:wrap;justify-content:center">
                <span class="kpi-stat-pill green"><i class="fa-solid fa-circle-check"></i> ${money(totalEnc)} encaissé</span>
                <span class="kpi-stat-pill orange"><i class="fa-solid fa-circle-xmark"></i> ${money(resteARecouvrer)} restant</span>
              </div>
              <div style="font-size:.8rem;color:var(--gray-600);margin-top:.5rem">Total dû : ${money(totalDu)}</div>
            </div>
          </div>

          <!-- Répartition par sexe -->
          <div class="card">
            <div class="card-header">
              <div class="card-title"><i class="fa-solid fa-venus-mars"></i> Répartition par genre</div>
            </div>
            <div class="card-body" style="display:flex;flex-direction:column;align-items:center;padding:1rem">
              <div class="chart-container-sm" style="width:200px">
                <canvas id="chart-sexe"></canvas>
              </div>
              <div style="display:flex;gap:1rem;margin-top:.75rem;flex-wrap:wrap;justify-content:center">
                <span class="kpi-stat-pill blue"><i class="fa-solid fa-mars"></i> ${garcons} garçons</span>
                <span class="kpi-stat-pill orange"><i class="fa-solid fa-venus"></i> ${filles} filles</span>
                ${nbAutres > 0 ? `<span class="kpi-stat-pill" style="background:var(--gray-100);color:var(--gray-700)">${nbAutres} autres</span>` : ''}
              </div>
            </div>
          </div>
        </div>

        <!-- GRAPHIQUES ROW 2 : Répartition par classe + Courbe présences -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;margin-bottom:1.25rem">
          <!-- Répartition par classe -->
          <div class="card">
            <div class="card-header">
              <div class="card-title"><i class="fa-solid fa-chalkboard"></i> Élèves par classe</div>
            </div>
            <div class="card-body">
              <div class="chart-container">
                <canvas id="chart-classes"></canvas>
              </div>
            </div>
          </div>

          <!-- Statut financier -->
          <div class="card">
            <div class="card-header">
              <div class="card-title"><i class="fa-solid fa-coins"></i> Statuts financiers</div>
            </div>
            <div class="card-body" style="display:flex;flex-direction:column;align-items:center;padding:1rem">
              <div class="chart-container-sm" style="width:200px">
                <canvas id="chart-statuts"></canvas>
              </div>
              <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.75rem;justify-content:center">
                <span class="kpi-stat-pill green">${nSolde} soldés</span>
                <span class="kpi-stat-pill orange">${nEncours} en cours</span>
                <span class="kpi-stat-pill red">${nAucun} non payés</span>
              </div>
            </div>
          </div>
        </div>

        <!-- GRAPHIQUES ROW 3 : Présences + Réussite -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem">
          <!-- Courbe taux de présence -->
          <div class="card">
            <div class="card-header">
              <div class="card-title"><i class="fa-solid fa-clipboard-check"></i> Taux de présence (6 mois)</div>
            </div>
            <div class="card-body">
              <div class="chart-container">
                <canvas id="chart-presences"></canvas>
              </div>
            </div>
          </div>

          <!-- Taux de réussite par séquence -->
          <div class="card">
            <div class="card-header">
              <div class="card-title"><i class="fa-solid fa-trophy"></i> Taux de réussite par séquence</div>
            </div>
            <div class="card-body">
              <div class="chart-container">
                <canvas id="chart-reussite"></canvas>
              </div>
            </div>
          </div>
        </div>
      `);

      // ── Initialisation des graphiques Chart.js ───────────────────
      if (!window.Chart) { Toast.warning('Chart.js non chargé — les graphiques ne s\'afficheront pas.'); return; }
      Chart.defaults.font.family = "'Inter', 'Segoe UI', sans-serif";
      Chart.defaults.font.size   = 12;

      // 1. Jauge donut — Taux de recouvrement
      new Chart(document.getElementById('chart-gauge'), {
        type: 'doughnut',
        data: {
          labels: ['Encaissé', 'Restant'],
          datasets: [{ data: [tauxRecouvrement, 100 - tauxRecouvrement],
            backgroundColor: [gaugeColor, '#e0e0e0'], borderWidth: 0, hoverOffset: 4 }]
        },
        options: {
          cutout: '78%', responsive: true, maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ` ${ctx.parsed}%` } }
          }
        },
        plugins: [{
          id: 'centerText',
          afterDraw(chart) {
            const { width, height, ctx } = chart;
            ctx.save();
            ctx.font = `bold ${Math.min(width, height) * 0.18}px Inter, sans-serif`;
            ctx.fillStyle = gaugeColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${tauxRecouvrement}%`, width / 2, height / 2);
            ctx.restore();
          }
        }]
      });

      // 2. Camembert — Répartition par sexe
      const sexeLabels = ['Garçons', 'Filles'];
      const sexeData   = [garcons, filles];
      if (nbAutres > 0) { sexeLabels.push('Autres'); sexeData.push(nbAutres); }
      new Chart(document.getElementById('chart-sexe'), {
        type: 'doughnut',
        data: {
          labels: sexeLabels,
          datasets: [{ data: sexeData,
            backgroundColor: ['#1a73e8', '#e91e63', '#9e9e9e'], borderWidth: 2, borderColor: '#fff' }]
        },
        options: {
          responsive: true, maintainAspectRatio: true,
          plugins: { legend: { position: 'bottom', labels: { padding: 12, boxWidth: 12 } } }
        }
      });

      // 3. Barres horizontales — Élèves par classe
      new Chart(document.getElementById('chart-classes'), {
        type: 'bar',
        data: {
          labels: classeLabels,
          datasets: [{ label: 'Élèves', data: classeData,
            backgroundColor: classeLabels.map((_, i) => `hsla(${200 + i * 12},70%,50%,0.8)`),
            borderRadius: 5, borderSkipped: false }]
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: '#f0f0f0' }, ticks: { precision: 0 } },
            y: { grid: { display: false } }
          }
        }
      });

      // 4. Camembert — Statuts financiers
      new Chart(document.getElementById('chart-statuts'), {
        type: 'pie',
        data: {
          labels: ['Soldés', 'En cours', 'Non payés'],
          datasets: [{ data: [nSolde, nEncours, nAucun],
            backgroundColor: ['#27ae60', '#f57c00', '#c62828'], borderWidth: 2, borderColor: '#fff' }]
        },
        options: {
          responsive: true, maintainAspectRatio: true,
          plugins: { legend: { position: 'bottom', labels: { padding: 10, boxWidth: 12 } } }
        }
      });

      // 5. Courbe — Taux de présence
      new Chart(document.getElementById('chart-presences'), {
        type: 'line',
        data: {
          labels: moisLabels,
          datasets: [{ label: 'Présence (%)', data: presData,
            borderColor: '#1a73e8', backgroundColor: 'rgba(26,115,232,.12)',
            fill: true, tension: 0.35, pointRadius: 5, pointBackgroundColor: '#1a73e8' }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { min: 0, max: 100, grid: { color: '#f0f0f0' },
              ticks: { callback: v => v + '%' } },
            x: { grid: { display: false } }
          }
        }
      });

      // 6. Barres — Taux de réussite par séquence
      new Chart(document.getElementById('chart-reussite'), {
        type: 'bar',
        data: {
          labels: seqLabels,
          datasets: [{ label: 'Réussite (%)', data: reussiteData,
            backgroundColor: reussiteData.map(v => v >= 60 ? '#27ae60' : v >= 40 ? '#f57c00' : '#c62828'),
            borderRadius: 6 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { min: 0, max: 100, grid: { color: '#f0f0f0' },
              ticks: { callback: v => v + '%' } },
            x: { grid: { display: false } }
          }
        }
      });

    } catch (err) {
      setContent(`<div class="empty-state"><i class="fa-solid fa-chart-pie"></i><h3>Erreur statistiques</h3><p>${err.message}</p></div>`);
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // CLÔTURE D'ANNÉE SCOLAIRE — Super Admin uniquement (R11)
  // Archive → Promotion → Reset
  // ══════════════════════════════════════════════════════════════════
  async cloture() {
    const role = App.currentUser?.role;
    if (role !== 'admin') {
      setContent(`<div class="empty-state"><i class="fa-solid fa-lock"></i><h3>Accès refusé</h3><p>Ce module est réservé à l'Administrateur.</p></div>`);
      return;
    }
    setLoading('Chargement du module de clôture…');
    try {
      const [eleves, classes, configsSco, allPay, cfg] = await Promise.all([
        DB.getAll('eleves'), DB.getAll('classes'), DB.getAll('config_scolarite'),
        DB.getAll('paiements'), DB.getEcoleConfig()
      ]);
      await getDevise();
      const paysValides = allPay.filter(p => !p.annule);
      const cMap  = Object.fromEntries(classes.map(c => [c.id, c]));
      const eMap  = Object.fromEntries(eleves.map(e => [e.id, e]));
      const pMap  = {};
      paysValides.forEach(p => { if (!pMap[p.eleve_id]) pMap[p.eleve_id] = []; pMap[p.eleve_id].push(p); });
      const sortedCls = sortClasses(classes);
      const anneeActuelle = new Date().getFullYear();
      const anneeLabel    = `${anneeActuelle - 1}/${anneeActuelle}`;
      const anneeSuivante = `${anneeActuelle}/${anneeActuelle + 1}`;

      // Pré-calculer les stats
      const totalDu  = eleves.reduce((s, e) => { const c = configsSco.find(x => x.niveau === cMap[e.classe_id]?.niveau); return s + parseFloat(c?.montant_annuel || 0); }, 0);
      const totalEnc = paysValides.reduce((s, p) => s + parseFloat(p.montant || 0), 0);
      const resteGlobal = Math.max(0, totalDu - totalEnc);

      const classesOpts = sortedCls.map(c =>
        `<option value="${c.id}" data-niveau="${c.niveau}">${formatClasseLabel(c)} (${eleves.filter(e=>e.classe_id===c.id).length} élèves)</option>`
      ).join('');

      setContent(`
        <div class="cloture-warning-banner">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <div>
            <div style="font-size:1rem;font-weight:700">Module de Clôture d'Année Scolaire</div>
            <div style="font-size:.82rem;opacity:.9;margin-top:.2rem">Opération irréversible — Lisez attentivement chaque étape avant de valider.</div>
          </div>
        </div>

        <!-- RÉSUMÉ AVANT CLÔTURE -->
        <div class="card" style="margin-bottom:1.25rem">
          <div class="card-header"><div class="card-title"><i class="fa-solid fa-circle-info"></i> Résumé de l'année ${anneeLabel}</div></div>
          <div class="card-body">
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem">
              <div style="text-align:center;padding:.75rem;background:#e3f2fd;border-radius:8px">
                <div style="font-size:1.6rem;font-weight:800;color:#1565c0">${eleves.length}</div>
                <div style="font-size:.78rem;color:var(--gray-600)">Élèves inscrits</div>
              </div>
              <div style="text-align:center;padding:.75rem;background:#e8f5e9;border-radius:8px">
                <div style="font-size:1.4rem;font-weight:800;color:#2e7d32">${money(totalEnc)}</div>
                <div style="font-size:.78rem;color:var(--gray-600)">Total encaissé</div>
              </div>
              <div style="text-align:center;padding:.75rem;background:#fff8e1;border-radius:8px">
                <div style="font-size:1.4rem;font-weight:800;color:#f57c00">${money(resteGlobal)}</div>
                <div style="font-size:.78rem;color:var(--gray-600)">Reste à recouvrer</div>
              </div>
              <div style="text-align:center;padding:.75rem;background:#fce4ec;border-radius:8px">
                <div style="font-size:1.6rem;font-weight:800;color:#b71c1c">${classes.length}</div>
                <div style="font-size:.78rem;color:var(--gray-600)">Classes actives</div>
              </div>
            </div>
          </div>
        </div>

        <!-- ÉTAPE 1 : ARCHIVAGE -->
        <div class="cloture-step" id="step-1">
          <div class="step-num">1</div>
          <h4 style="margin-bottom:.5rem;font-size:.95rem"><i class="fa-solid fa-box-archive" style="color:var(--primary)"></i> Archiver les données de l'année ${anneeLabel}</h4>
          <p style="font-size:.83rem;color:var(--gray-600);margin-bottom:.75rem">Copie de tous les élèves et leurs états financiers dans les tables <code>archives_eleves</code> et <code>archives_finances</code>. Les données actives ne sont <strong>pas supprimées</strong>.</p>
          <button class="btn btn-primary" id="btn-archive" onclick="Pages._clotureArchive('${anneeLabel}')">
            <i class="fa-solid fa-box-archive"></i> Lancer l'archivage (${eleves.length} élèves)
          </button>
          <div id="archive-result" style="margin-top:.75rem"></div>
        </div>

        <!-- ÉTAPE 2 : PROMOTION -->
        <div class="cloture-step" id="step-2" style="opacity:.5;pointer-events:none">
          <div class="step-num">2</div>
          <h4 style="margin-bottom:.5rem;font-size:.95rem"><i class="fa-solid fa-arrow-up" style="color:var(--secondary)"></i> Promotion automatique des élèves</h4>
          <p style="font-size:.83rem;color:var(--gray-600);margin-bottom:.75rem">Sélectionnez les classes à promouvoir et la classe de destination. Les élèves seront affectés à leur nouvelle classe pour l'année ${anneeSuivante}.</p>
          <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:.75rem;align-items:flex-end;margin-bottom:.75rem">
            <div class="form-group" style="margin:0">
              <label class="form-label" style="font-size:.8rem">Classe source</label>
              <select class="form-control" id="promo-source">${classesOpts}</select>
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label" style="font-size:.8rem">Classe destination</label>
              <select class="form-control" id="promo-dest"><option value="">— Aucune (diplômés) —</option>${classesOpts}</select>
            </div>
            <button class="btn btn-secondary" onclick="Pages._cloturePromotion()">
              <i class="fa-solid fa-arrow-right"></i> Appliquer
            </button>
          </div>
          <div id="promo-log" style="font-size:.8rem;color:var(--gray-600);max-height:150px;overflow-y:auto"></div>
        </div>

        <!-- ÉTAPE 3 : RÉINITIALISATION -->
        <div class="cloture-step" id="step-3" style="opacity:.5;pointer-events:none">
          <div class="step-num">3</div>
          <h4 style="margin-bottom:.5rem;font-size:.95rem"><i class="fa-solid fa-rotate-left" style="color:var(--warning)"></i> Réinitialiser pour l'année ${anneeSuivante}</h4>
          <p style="font-size:.83rem;color:var(--gray-600);margin-bottom:.75rem">
            Remet à zéro les notes, présences et paiements de l'année en cours. <strong>Les archives sont conservées.</strong>
          </p>
          <div style="background:#fff8e1;border:1px solid #ffcc80;border-radius:8px;padding:.75rem;margin-bottom:.75rem;font-size:.82rem">
            <strong>⚠️ Cette action supprimera :</strong>
            <ul style="margin:.4rem 0 0 1.2rem;line-height:1.7">
              <li>Toutes les notes de l'année en cours</li>
              <li>Tous les enregistrements de présences</li>
              <li>Tous les paiements de scolarité</li>
            </ul>
            <div style="margin-top:.5rem">Les <strong>élèves, classes, matières et configurations</strong> sont conservés.</div>
          </div>
          <label style="display:flex;align-items:center;gap:.6rem;cursor:pointer;font-size:.84rem;margin-bottom:.75rem">
            <input type="checkbox" id="confirm-reset" onchange="document.getElementById('btn-reset').disabled=!this.checked">
            Je comprends que cette action est irréversible et j'ai vérifié les archives.
          </label>
          <button class="btn btn-danger" id="btn-reset" disabled onclick="Pages._clotureReset('${anneeSuivante}')">
            <i class="fa-solid fa-rotate-left"></i> Réinitialiser pour ${anneeSuivante}
          </button>
          <div id="reset-result" style="margin-top:.75rem"></div>
        </div>
      `);
    } catch (err) {
      setContent(`<div class="empty-state"><h3>Erreur</h3><p>${err.message}</p></div>`);
    }
  },

  async _clotureArchive(anneeLabel) {
    const btn = document.getElementById('btn-archive');
    const res = document.getElementById('archive-result');
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML = '<div class="loading-spinner" style="width:14px;height:14px;border-width:2px;display:inline-block"></div> Archivage…';
    res.innerHTML = '';
    try {
      const [eleves, classes, configsSco, allPay] = await Promise.all([
        DB.getAll('eleves'), DB.getAll('classes'), DB.getAll('config_scolarite'), DB.getAll('paiements')
      ]);
      const cMap = Object.fromEntries(classes.map(c => [c.id, c]));
      const eMap = Object.fromEntries(eleves.map(e => [e.id, e]));
      const pMap = {};
      allPay.filter(p => !p.annule).forEach(p => {
        if (!pMap[p.eleve_id]) pMap[p.eleve_id] = [];
        pMap[p.eleve_id].push(p);
      });
      let ok = 0, errs = 0;
      for (const e of eleves) {
        try {
          const cls = cMap[e.classe_id];
          const cfgS = configsSco.find(c => c.niveau === cls?.niveau);
          const montantDu  = parseFloat(cfgS?.montant_annuel || 0);
          // R11 — Array.isArray guard
          const pArr = Array.isArray(pMap[e.id]) ? pMap[e.id] : [];
          const montantPaye = pArr.reduce((s, p) => s + parseFloat(p.montant || 0), 0);
          const reste  = Math.max(0, montantDu - montantPaye);
          const statut = DB.getStatutPaiementSync(e.id, eMap, cMap, configsSco, pMap);
          const archiveEleve = {
            annee_scolaire: anneeLabel,
            eleve_id: e.id, matricule: e.matricule || '',
            prenom: e.prenom, nom: e.nom, sexe: e.sexe || '',
            classe_id: e.classe_id || '', classe_nom: cls ? formatClasseLabel(cls) : '',
            niveau: cls?.niveau || '', statut_paiement: statut,
            decision: 'promu', classe_suivante_id: '',
            archive_at: new Date().toISOString()
          };
          await DB.insert('archives_eleves', archiveEleve);
          const archiveFinance = {
            annee_scolaire: anneeLabel,
            eleve_id: e.id, eleve_nom: `${e.prenom} ${e.nom}`,
            classe_nom: cls ? formatClasseLabel(cls) : '',
            montant_du: montantDu, montant_paye: montantPaye,
            reste: reste, statut: statut,
            nb_paiements: pArr.length,
            archive_at: new Date().toISOString()
          };
          await DB.insert('archives_finances', archiveFinance);
          ok++;
        } catch { errs++; }
      }
      res.innerHTML = `<div style="padding:.6rem .9rem;background:#e8f5e9;border-radius:8px;font-size:.83rem;color:#2e7d32"><i class="fa-solid fa-circle-check"></i> <strong>${ok} élève(s) archivés</strong> avec succès${errs > 0 ? ` (${errs} erreur(s))` : ''}. Archives disponibles dans les tables <code>archives_eleves</code> et <code>archives_finances</code>.</div>`;
      // Débloquer étape 2
      const step2 = document.getElementById('step-2');
      if (step2) { step2.style.opacity = '1'; step2.style.pointerEvents = ''; step2.classList.add('done'); }
      Toast.success(`Archivage terminé : ${ok} élève(s) archivés`);
    } catch (err) {
      res.innerHTML = `<div style="padding:.6rem;background:#fce4ec;border-radius:8px;font-size:.83rem;color:#b71c1c"><i class="fa-solid fa-circle-xmark"></i> Erreur : ${err.message}</div>`;
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-box-archive"></i> Réessayer l\'archivage';
    }
  },

  async _cloturePromotion() {
    const sourceId = document.getElementById('promo-source')?.value;
    const destId   = document.getElementById('promo-dest')?.value;
    const logEl    = document.getElementById('promo-log');
    if (!sourceId) { Toast.warning('Sélectionnez la classe source.'); return; }
    const eleves = await DB.query('eleves', e => e.classe_id === sourceId);
    if (!eleves.length) { Toast.info('Aucun élève dans cette classe.'); return; }
    let promues = 0;
    for (const e of eleves) {
      try {
        await DB.insert('eleves', { ...e, classe_id: destId || null }, e.id);
        promues++;
      } catch {}
    }
    if (logEl) {
      const classes = await DB.getAll('classes');
      const srcNom  = formatClasseLabel(classes.find(c => c.id === sourceId));
      const dstNom  = destId ? formatClasseLabel(classes.find(c => c.id === destId)) : 'Diplômés (sans classe)';
      logEl.innerHTML += `<div style="padding:.3rem 0;border-bottom:1px solid var(--gray-200)"><i class="fa-solid fa-check" style="color:var(--secondary)"></i> ${promues} élève(s) de <b>${srcNom}</b> → <b>${dstNom}</b></div>`;
    }
    // Débloquer étape 3
    const step3 = document.getElementById('step-3');
    if (step3) { step3.style.opacity = '1'; step3.style.pointerEvents = ''; }
    Toast.success(`${promues} élève(s) promu(s) avec succès`);
  },

  async _clotureReset(anneeSuivante) {
    if (!confirm(`⚠️ DERNIÈRE CONFIRMATION\n\nCette action supprimera définitivement toutes les notes, présences et paiements de l'année en cours.\n\nÊtes-vous absolument certain(e) de vouloir continuer ?`)) return;
    const btn = document.getElementById('btn-reset');
    const res = document.getElementById('reset-result');
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loading-spinner" style="width:14px;height:14px;border-width:2px;display:inline-block"></div> Réinitialisation…'; }
    let deleted = { notes: 0, presences: 0, paiements: 0 };
    try {
      const [notes, presences, paiements] = await Promise.all([
        DB.getAll('notes'), DB.getAll('presences'), DB.getAll('paiements')
      ]);
      for (const n of notes)     { try { await DB.delete('notes',     n.id); deleted.notes++;     } catch {} }
      for (const p of presences) { try { await DB.delete('presences', p.id); deleted.presences++; } catch {} }
      for (const p of paiements) { try { await DB.delete('paiements', p.id); deleted.paiements++; } catch {} }
      // Vider le cache DB
      if (DB._cache) { DB._cache = {}; DB._cacheExpiry = {}; }
      if (res) res.innerHTML = `<div style="padding:.75rem;background:#e8f5e9;border-radius:8px;font-size:.83rem;color:#1b5e20"><i class="fa-solid fa-circle-check"></i> <strong>Réinitialisation terminée !</strong><br>Notes supprimées : ${deleted.notes} · Présences : ${deleted.presences} · Paiements : ${deleted.paiements}<br><br>L'application est prête pour l'année <strong>${anneeSuivante}</strong>.</div>`;
      const step3 = document.getElementById('step-3');
      if (step3) step3.classList.add('done');
      Toast.success(`Année clôturée. Bienvenue dans ${anneeSuivante} !`);
    } catch (err) {
      if (res) res.innerHTML = `<div style="padding:.6rem;background:#fce4ec;border-radius:8px;font-size:.83rem;color:#b71c1c">Erreur : ${err.message}</div>`;
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Réessayer'; }
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // UTILISATEURS — Gestion avec assignation primaire/collège
  // ══════════════════════════════════════════════════════════════════
  async utilisateurs() {
    setLoading();
    try {
      const [users, classes, matieres] = await Promise.all([DB.getAll('utilisateurs'), DB.getAll('classes'), DB.getAll('matieres')]);
      const cMap = Object.fromEntries(classes.map(c=>[c.id,c]));
      setContent(`
        <div class="page-header">
          <div class="page-header-left"><h2><i class="fa-solid fa-users-gear" style="color:var(--primary)"></i> Utilisateurs</h2><p>${users.length} compte(s)</p></div>
          <button class="btn btn-primary" onclick="Pages._openUserModal()"><i class="fa-solid fa-plus"></i> Nouvel utilisateur</button>
        </div>
        <div style="background:var(--primary-light);border-radius:8px;padding:.75rem 1rem;margin-bottom:1rem;font-size:.84rem;color:var(--primary-dark)">
          <i class="fa-solid fa-circle-info"></i> <strong>Logique d'assignation :</strong> 
          Pour les <strong>profs Primaire</strong> : assignez-les à une classe entière. 
          Pour les <strong>profs Collège</strong> : assignez-les à des matières spécifiques dans une ou plusieurs classes.
        </div>
        <div class="card">
          <div class="card-body" style="padding:0">
            <div class="table-wrapper">
              <table>
                <thead><tr><th>Utilisateur</th><th>Email</th><th>Rôle</th><th>Assignation</th><th>Statut</th><th>Actions</th></tr></thead>
                <tbody>${this._buildUsersRows(users, cMap, matieres)}</tbody>
              </table>
            </div>
          </div>
        </div>`);
    } catch (err) { setContent(`<div class="empty-state"><h3>Erreur</h3><p>${err.message}</p></div>`); }
  },

  _buildUsersRows(users, cMap, matieres) {
    const roleMap = { admin:['Administrateur','danger'], directeur:['Directeur','purple'], comptable:['Comptable','warning'], prof:['Enseignant','info'], superviseur:['Superviseur','purple'] };
    return users.map(u => {
      const [rl,rc] = roleMap[u.role]||[u.role,'gray'];
      const initials = ((u.prenom?.[0]||'')+(u.nom?.[0]||'')).toUpperCase()||'?';
      let assignation = '—';
      if (u.role === 'prof') {
        if (u.classe_id && cMap[u.classe_id]) {
          assignation = `<span class="chip"><i class="fa-solid fa-chalkboard"></i> Titulaire : ${formatClasseLabel(cMap[u.classe_id])}</span>`;
        } else if (u.matieres_ids?.length) {
          const mats = matieres.filter(m => u.matieres_ids.includes(m.id));
          assignation = mats.slice(0,3).map(m => {
            const cls = cMap[m.classe_id];
            return `<span class="chip" style="font-size:.73rem">${m.nom} (${cls ? formatClasseLabel(cls) : '?'})</span>`;
          }).join(' ') + (mats.length > 3 ? `<span class="chip">+${mats.length-3}</span>` : '');
        }
      }
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:.6rem">
          <div style="width:34px;height:34px;background:var(--primary-light);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.8rem;color:var(--primary);flex-shrink:0">${initials}</div>
          <div><div style="font-weight:600">${u.prenom||''} ${u.nom||''}</div></div>
        </div></td>
        <td>${u.email}</td>
        <td><span class="badge badge-${rc}">${rl}</span></td>
        <td>${assignation}</td>
        <td>${u.actif!==false?'<span class="badge badge-success">Actif</span>':'<span class="badge badge-gray">Inactif</span>'}</td>
        <td><div style="display:flex;gap:.4rem">
          <button class="btn-icon" onclick="Pages._openUserModal('${u.id}')"><i class="fa-solid fa-pen"></i></button>
          ${u.id!==App.currentUser?.id?`<button class="btn-icon" onclick="Pages._toggleUser('${u.id}',${u.actif!==false})" style="color:var(--warning)"><i class="fa-solid fa-${u.actif!==false?'lock':'lock-open'}"></i></button>`:''}
        </div></td>
      </tr>`;
    }).join('');
  },

  async _openUserModal(id = null) {
    const [classes, matieres] = await Promise.all([DB.getAll('classes'), DB.getAll('matieres')]);
    const u = id ? await DB.getById('utilisateurs', id) : null;
    const primaireClasses = classes.filter(c => DB.isPrimaire(c.niveau));
    const classeOpts = primaireClasses.map(c => `<option value="${c.id}" ${u?.classe_id===c.id?'selected':''}>${formatClasseLabel(c)}</option>`).join('');

    // Grouper matières par classe pour les collèges
    const collegeClasses = classes.filter(c => DB.isCollege(c.niveau));
    const matCheckboxes = collegeClasses.map(cls => {
      const mats = matieres.filter(m => m.classe_id === cls.id);
      if (!mats.length) return '';
      return `<div style="margin-bottom:.75rem">
        <div style="font-weight:600;font-size:.85rem;color:var(--gray-700);margin-bottom:.3rem"><i class="fa-solid fa-chalkboard"></i> ${cls.nom} — ${cls.niveau}</div>
        <div style="display:flex;flex-wrap:wrap;gap:.4rem">
          ${mats.map(m => `<label style="display:flex;align-items:center;gap:.3rem;background:var(--gray-100);padding:.3rem .6rem;border-radius:6px;cursor:pointer;font-size:.82rem">
            <input type="checkbox" value="${m.id}" ${u?.matieres_ids?.includes(m.id)?'checked':''} style="accent-color:var(--primary)"> ${m.nom} (coeff.${m.coefficient})
          </label>`).join('')}
        </div>
      </div>`;
    }).join('');

    Modal.open(id ? 'Modifier l\'utilisateur' : '➕ Nouvel utilisateur', `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Prénom <span style="color:red">*</span></label><input class="form-control" id="u-prenom" value="${u?.prenom||''}"></div>
        <div class="form-group"><label class="form-label">Nom <span style="color:red">*</span></label><input class="form-control" id="u-nom" value="${u?.nom||''}"></div>
      </div>
      <div class="form-group"><label class="form-label">Email <span style="color:red">*</span></label><input type="email" class="form-control" id="u-email" value="${u?.email||''}"></div>
      <div class="form-group"><label class="form-label">Mot de passe ${id?'(laisser vide = inchangé)':''} <span style="color:red">${!id?'*':''}</span></label><input type="password" class="form-control" id="u-pwd" placeholder="${id?'••••••••':'Min. 6 caractères'}"></div>
      <div class="form-group"><label class="form-label">Rôle <span style="color:red">*</span></label>
        <select class="form-control" id="u-role" onchange="Pages._onUserRoleChange()">
          <option value="admin" ${u?.role==='admin'?'selected':''}>Administrateur</option>
          <option value="directeur" ${u?.role==='directeur'?'selected':''}>Directeur</option>
          <option value="comptable" ${u?.role==='comptable'?'selected':''}>Comptable</option>
          <option value="prof" ${u?.role==='prof'?'selected':''}>Enseignant</option>
          <option value="superviseur" ${u?.role==='superviseur'?'selected':''}>Superviseur des Enseignants</option>
        </select>
      </div>
      <!-- ASSIGNATION PROF -->
      <div id="prof-assign" style="${u?.role==='prof'?'':'display:none'}">
        <div style="border-top:1px solid var(--gray-200);margin:.75rem 0;padding-top:.75rem">
          <div style="font-weight:600;font-size:.9rem;margin-bottom:.75rem"><i class="fa-solid fa-chalkboard-user" style="color:var(--primary)"></i> Assignation de l'enseignant</div>

          <div style="display:flex;gap:.75rem;margin-bottom:.75rem">
            <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer"><input type="radio" name="prof-type" value="primaire" id="type-primaire" ${(!u||u.classe_id)?'checked':''} onchange="Pages._onProfTypeChange()"> <strong>Primaire</strong> (titulaire d'une classe)</label>
            <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer"><input type="radio" name="prof-type" value="college" id="type-college" ${u?.matieres_ids?.length?'checked':''} onchange="Pages._onProfTypeChange()"> <strong>Collège</strong> (par matières)</label>
          </div>

          <div id="assign-primaire" style="${(!u||u.classe_id)?'':'display:none'}">
            <div class="form-group"><label class="form-label">Classe titulaire (Primaire)</label>
              <select class="form-control" id="u-classe"><option value="">— Choisir une classe Primaire —</option>${classeOpts}</select>
            </div>
          </div>

          <div id="assign-college" style="${u?.matieres_ids?.length?'':'display:none'}">
            <label class="form-label" style="margin-bottom:.5rem">Matières assignées (Collège)</label>
            <div id="mat-checkboxes">${matCheckboxes || '<p style="color:var(--gray-500);font-size:.85rem">Aucune matière de collège disponible. Créez des classes de collège et leurs matières.</p>'}</div>
          </div>
        </div>
      </div>
    `, `
      <button class="btn btn-outline" onclick="Modal.close()">Annuler</button>
      <button class="btn btn-primary" id="save-user-btn" onclick="Pages._saveUser('${id||''}')"><i class="fa-solid fa-save"></i> Enregistrer</button>
    `, 'modal-lg');
  },

  _onUserRoleChange() {
    const role = document.getElementById('u-role').value;
    const profAssign = document.getElementById('prof-assign');
    if (profAssign) profAssign.style.display = role === 'prof' ? 'block' : 'none';
  },

  _onProfTypeChange() {
    const isPrimaire = document.getElementById('type-primaire')?.checked;
    const primDiv = document.getElementById('assign-primaire');
    const colDiv = document.getElementById('assign-college');
    if (primDiv) primDiv.style.display = isPrimaire ? 'block' : 'none';
    if (colDiv) colDiv.style.display = isPrimaire ? 'none' : 'block';
  },

  async _saveUser(id) {
    const prenom = document.getElementById('u-prenom').value.trim();
    const nom = document.getElementById('u-nom').value.trim();
    const email = document.getElementById('u-email').value.trim();
    const pwd = document.getElementById('u-pwd').value;
    const role = document.getElementById('u-role').value;
    if (!prenom||!nom||!email) { Toast.error('Prénom, nom et email obligatoires.'); return; }
    if (!id && !pwd) { Toast.error('Mot de passe obligatoire.'); return; }

    const btn = document.getElementById('save-user-btn');
    if (!Debounce.btn(btn, 6000)) return; // anti-double-clic
    try {
      const allUsers = await DB.getAll('utilisateurs');
      const dup = allUsers.find(u => u.email?.toLowerCase()===email.toLowerCase() && u.id!==id);
      if (dup) { Toast.error('Cet email est déjà utilisé.'); Debounce.release(btn, '<i class="fa-solid fa-save"></i> Enregistrer'); return; }

      const data = { prenom, nom, email, role };
      if (pwd) data.mot_de_passe = pwd;

      if (role === 'prof') {
        const isPrimaire = document.getElementById('type-primaire')?.checked;
        if (isPrimaire) {
          data.classe_id = document.getElementById('u-classe')?.value || '';
          data.matieres_ids = [];
        } else {
          const checked = document.querySelectorAll('#mat-checkboxes input:checked');
          data.matieres_ids = Array.from(checked).map(c => c.value);
          data.classe_id = '';
        }
      } else {
        data.classe_id = '';
        data.matieres_ids = [];
      }

      const isNewUser = !id;
      const userEmail = email;
      const userNom = `${prenom} ${nom}`;

      if (id) { await DB.update('utilisateurs', id, data); Toast.success('Utilisateur mis à jour !'); }
      else {
        // Création d'un vrai compte cloud (mot de passe chiffré côté serveur)
        // → la personne se connecte depuis son propre appareil aussitôt.
        let cloudOk = false;
        try {
          const res = await ZeanAPI.createUtilisateur({
            email, password: pwd, prenom, nom, role,
            classe_id: data.classe_id || '',
            matieres_ids: data.matieres_ids || [],
            ecole_code: App.currentUser?.ecole_code || '',
          });
          // Miroir local pour l'affichage immédiat
          await DB._idbPut('utilisateurs', { ...res.utilisateur, mot_de_passe: pwd }, false);
          cloudOk = true;
          Toast.success('Compte créé et partagé sur tous les appareils !');
        } catch (e) {
          console.warn('[Utilisateurs] Création cloud impossible :', e.message);
        }
        if (!cloudOk) {
          await DB.insert('utilisateurs', { ...data, actif: true });
          Toast.warning
            ? Toast.warning('Compte créé localement uniquement (cloud injoignable).')
            : Toast.info('Compte créé localement uniquement (cloud injoignable).');
        }
      }

      // Notification MDP (info uniquement — pas d'envoi serveur disponible)
      if (pwd && isNewUser) {
        Toast.info(`📧 Information : Pour ${userNom} (${userEmail}), veuillez lui communiquer son MDP manuellement.`);
      } else if (pwd && !isNewUser) {
        Toast.info(`📧 Information : Pour ${userNom} — MDP modifié. Communiquez-lui son nouveau mot de passe manuellement.`);
      }

      Modal.close(); Pages.utilisateurs();

    } catch (err) { Toast.error('Erreur : ' + err.message); Debounce.release(btn, '<i class="fa-solid fa-save"></i> Enregistrer'); }
  },

  async _toggleUser(id, isActive) {
    await DB.update('utilisateurs', id, { actif: !isActive });
    Toast.info(isActive ? 'Compte désactivé.' : 'Compte réactivé.');
    Pages.utilisateurs();
  },

  // ══════════════════════════════════════════════════════════════════
  // APPEL JOURNALIER (PRÉSENCES)
  // ══════════════════════════════════════════════════════════════════
  async presences() {
    setLoading('Chargement de l\'appel…');
    try {
      const user = App.currentUser;
      const role = user?.role;
      // Directeur & admin : toutes les classes. Prof : ses classes
      const isDirecteur = role === 'directeur' || role === 'admin';
      const allClasses = await DB.getAll('classes');
      const classes = isDirecteur ? sortClasses(allClasses) : sortClasses(await DB.getClassesProf(user));
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      // Pré-sélection : prof → sa classe_id, directeur → rien (vue globale par défaut)
      const preselect = (!isDirecteur && user?.classe_id) ? user.classe_id : '';

      setContent(`
        <div class="page-header">
          <div class="page-header-left">
            <h2><i class="fa-solid fa-clipboard-check" style="color:var(--primary)"></i> Appel Journalier</h2>
            <p>Enregistrez les présences — ${new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
          </div>
          ${isDirecteur ? `<button class="btn btn-outline btn-sm" onclick="Pages._loadAllPresences()"><i class="fa-solid fa-list"></i> Vue toutes classes</button>` : ''}
        </div>

        <div class="card" style="margin-bottom:1.25rem">
          <div class="card-body" style="display:flex;gap:1rem;flex-wrap:wrap;align-items:flex-end">
            <div class="form-group" style="margin:0;flex:1;min-width:180px">
              <label class="form-label"><i class="fa-solid fa-chalkboard"></i> Classe</label>
              ${buildClassesSelect(classes, preselect, 'id="pres-classe" onchange="Pages._loadPresences()"')}
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label"><i class="fa-solid fa-calendar"></i> Date</label>
              <input type="date" class="form-control" id="pres-date" value="${today}" onchange="Pages._loadPresences()">
            </div>
            <button class="btn btn-outline btn-sm" onclick="Pages._loadPresences()">
              <i class="fa-solid fa-rotate-right"></i> Actualiser
            </button>
          </div>
        </div>

        <div id="pres-grid">
          <div class="empty-state">
            <i class="fa-solid fa-clipboard-check" style="font-size:2.5rem;color:var(--gray-300)"></i>
            <h3>Sélectionnez une classe</h3>
            <p>Choisissez une classe pour commencer l'appel journalier</p>
          </div>
        </div>`);

      // Auto-charger :
      // - Prof avec classe_id → charger directement sa classe
      // - Directeur → charger la vue centralisée toutes classes
      if (preselect) {
        Pages._loadPresences();
      } else if (isDirecteur) {
        Pages._loadAllPresences();
      } else if (classes.length === 1) {
        document.getElementById('pres-classe').value = classes[0].id;
        Pages._loadPresences();
      }
    } catch (err) {
      setContent(`<div class="empty-state"><i class="fa-solid fa-triangle-exclamation" style="color:var(--danger)"></i><h3>Erreur</h3><p>${err.message}</p><button class="btn btn-primary" onclick="Pages.presences()">Réessayer</button></div>`);
    }
  },

  // Vue centralisée des absences pour le directeur (toutes classes, date filtrée)
  async _loadAllPresences() {
    const grid = document.getElementById('pres-grid');
    if (!grid) return;
    const dateAppel = document.getElementById('pres-date')?.value || new Date().toISOString().split('T')[0];
    grid.innerHTML = '<div style="text-align:center;padding:2rem"><div class="loading-spinner"></div></div>';
    try {
      const [allClasses, allEleves, allPresences] = await Promise.all([
        DB.getAll('classes'), DB.getAll('eleves'),
        DB.query('presences', p => p.date_appel === dateAppel)
      ]);
      const sorted = sortClasses(allClasses);
      const presMap = Object.fromEntries(allPresences.map(p => [p.eleve_id, p]));

      let html = `<div style="margin-bottom:.75rem;font-size:.88rem;color:var(--gray-600)">
        <i class="fa-solid fa-calendar"></i> Absences du <strong>${new Date(dateAppel+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</strong> — Toutes classes
      </div>`;

      let totalAbsents = 0, totalEleves = 0;
      sorted.forEach(cls => {
        const elevesClasse = allEleves.filter(e => e.classe_id === cls.id).sort((a,b) => a.nom.localeCompare(b.nom));
        if (!elevesClasse.length) return;
        const absents = elevesClasse.filter(e => presMap[e.id] && !presMap[e.id].present);
        totalAbsents += absents.length; totalEleves += elevesClasse.length;
        html += `<div class="card" style="margin-bottom:.75rem">
          <div class="card-header" style="cursor:pointer" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
            <div class="card-title"><i class="fa-solid fa-chalkboard"></i> ${cls.nom} <small style="color:var(--gray-500);font-weight:400">(${cls.niveau})</small></div>
            <div style="display:flex;gap:.5rem;align-items:center">
              <span class="badge ${absents.length>0?'badge-danger':'badge-success'}">${absents.length} absent(s) / ${elevesClasse.length}</span>
              <i class="fa-solid fa-chevron-down" style="font-size:.8rem;color:var(--gray-500)"></i>
            </div>
          </div>
          <div class="card-body" style="padding:0;display:${absents.length>0?'block':'none'}">`;
        if (absents.length === 0) {
          html += `<div style="padding:.6rem 1rem;font-size:.85rem;color:var(--secondary)"><i class="fa-solid fa-check-circle"></i> Tous les élèves sont présents</div>`;
        } else {
          html += `<div class="table-wrapper"><table><thead><tr><th>Élève</th><th>Justifié</th><th>Motif</th><th>Enregistré par</th></tr></thead><tbody>`;
          absents.forEach(e => {
            const p = presMap[e.id];
            html += `<tr>
              <td><strong>${e.prenom} ${e.nom}</strong><br><small style="color:var(--gray-500)">${e.matricule||'—'}</small></td>
              <td style="text-align:center">${p?.justifie ? '<span class="badge badge-warning">Oui</span>' : '<span class="badge badge-danger">Non</span>'}</td>
              <td>${p?.motif_absence||'—'}</td>
              <td style="font-size:.8rem">${p?.enregistre_par_nom||'—'}</td>
            </tr>`;
          });
          html += `</tbody></table></div>`;
        }
        html += `</div></div>`;
      });

      if (!totalEleves) {
        html = `<div class="empty-state"><i class="fa-solid fa-calendar-xmark"></i><h3>Aucun appel enregistré pour cette date</h3><p>Sélectionnez une classe et enregistrez l'appel.</p></div>`;
      } else {
        html = `<div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1rem">
          <div style="background:var(--primary-light);border-radius:8px;padding:.6rem 1rem;font-size:.85rem"><i class="fa-solid fa-users" style="color:var(--primary)"></i> <strong>${totalEleves}</strong> élèves au total</div>
          <div style="background:${totalAbsents>0?'#fce4ec':'#e8f5e9'};border-radius:8px;padding:.6rem 1rem;font-size:.85rem"><i class="fa-solid fa-circle-xmark" style="color:${totalAbsents>0?'var(--danger)':'var(--secondary)'}"></i> <strong>${totalAbsents}</strong> absent(s)</div>
          <div style="background:#e8f5e9;border-radius:8px;padding:.6rem 1rem;font-size:.85rem"><i class="fa-solid fa-check-circle" style="color:var(--secondary)"></i> <strong>${totalEleves-totalAbsents}</strong> présent(s)</div>
        </div>` + html;
      }
      grid.innerHTML = html;
    } catch(err) {
      grid.innerHTML = `<div class="empty-state"><h3>Erreur</h3><p>${err.message}</p></div>`;
    }
  },

  async _loadPresences() {
    const classeId = document.getElementById('pres-classe')?.value;
    const dateAppel = document.getElementById('pres-date')?.value;
    const grid = document.getElementById('pres-grid');
    if (!classeId || !dateAppel || !grid) return;

    grid.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:3rem;gap:.75rem;color:var(--gray-500)">
      <div class="loading-spinner" style="width:20px;height:20px;border-width:2px"></div>
      <span>Chargement des élèves…</span>
    </div>`;

    try {
      const [eleves, classe, presencesExistantes] = await Promise.all([
        DB.query('eleves', e => e.classe_id === classeId),
        DB.getById('classes', classeId),
        DB.query('presences', p => p.classe_id === classeId && p.date_appel === dateAppel)
      ]);

      const sortedEleves = eleves.sort((a, b) => a.nom.localeCompare(b.nom));
      if (!sortedEleves.length) {
        grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-user-slash"></i><h3>Classe vide</h3><p>Aucun élève dans cette classe.</p></div>`;
        return;
      }

      // Présences déjà enregistrées pour ce jour
      const presMap = Object.fromEntries(presencesExistantes.map(p => [p.eleve_id, p]));
      const dejaFait = presencesExistantes.length > 0;
      const user = App.currentUser;
      // T2.2 — Admin = lecture seule presences (comme directeur)
      const isReadOnly = user?.role === 'directeur' || user?.role === 'admin';

      // Stats résumé si déjà fait
      const nbPresents = dejaFait ? presencesExistantes.filter(p => p.present).length : sortedEleves.length;
      const nbAbsents = dejaFait ? presencesExistantes.filter(p => !p.present).length : 0;
      const nbJustifies = dejaFait ? presencesExistantes.filter(p => !p.present && p.justifie).length : 0;

      let html = `
        <div class="card">
          <div class="card-header" style="flex-wrap:wrap;gap:.5rem">
            <div class="card-title">
              <i class="fa-solid fa-users"></i> ${classe?.nom || 'Classe'} — ${sortedEleves.length} élève(s)
            </div>
            <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">
              ${dejaFait ? `
                <span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> ${nbPresents} présent(s)</span>
                ${nbAbsents > 0 ? `<span class="badge badge-danger"><i class="fa-solid fa-circle-xmark"></i> ${nbAbsents} absent(s)</span>` : ''}
                ${nbJustifies > 0 ? `<span class="badge badge-warning"><i class="fa-solid fa-file-circle-check"></i> ${nbJustifies} justifié(s)</span>` : ''}
                <span class="badge badge-gray" style="font-size:.72rem">Appel déjà enregistré — modifiable</span>
              ` : `
                <span class="badge badge-info"><i class="fa-solid fa-info-circle"></i> Tous présents par défaut — cochez les absents</span>
              `}
            </div>
          </div>
          <div class="card-body" style="padding:0">
            <table>
              <thead>
                <tr>
                  <th>Élève</th>
                  <th style="text-align:center;width:100px">
                    <span style="color:var(--danger)"><i class="fa-solid fa-circle-xmark"></i> Absent</span>
                  </th>
                  <th style="text-align:center;width:110px">Justifié</th>
                  <th style="min-width:180px">Motif</th>
                </tr>
              </thead>
              <tbody id="pres-tbody">`;

      sortedEleves.forEach(el => {
        const pres = presMap[el.id];
        // Par défaut : PRÉSENT (absent = false)
        const estAbsent = pres ? !pres.present : false;
        const estJustifie = pres?.justifie || false;
        const motif = pres?.motif_absence || '';

        html += `<tr id="pres-row-${el.id}">
          <td>
            <div style="font-weight:600">${el.prenom} ${el.nom}</div>
            <div style="font-size:.72rem;color:var(--gray-500)">${el.matricule || '—'}</div>
          </td>
          <td style="text-align:center">
            <label style="cursor:pointer;display:inline-flex;align-items:center;gap:.3rem">
              <input type="checkbox" class="pres-absent-cb" data-eleve="${el.id}"
                ${estAbsent ? 'checked' : ''}
                ${isReadOnly ? 'disabled' : ''}
                onchange="Pages._onAbsentChange('${el.id}', this.checked)"
                style="width:18px;height:18px;accent-color:var(--danger)">
            </label>
          </td>
          <td style="text-align:center" id="pres-just-cell-${el.id}">
            ${estAbsent ? `
              <label style="cursor:pointer;display:inline-flex;align-items:center;gap:.3rem">
                <input type="checkbox" class="pres-just-cb" data-eleve="${el.id}"
                  ${estJustifie ? 'checked' : ''}
                  ${isReadOnly ? 'disabled' : ''}
                  style="width:16px;height:16px;accent-color:var(--warning)">
                <span style="font-size:.78rem">Justifié</span>
              </label>` : '<span style="color:var(--gray-300);font-size:.8rem">—</span>'}
          </td>
          <td id="pres-motif-cell-${el.id}">
            ${estAbsent ? `<input type="text" class="form-control pres-motif-inp" data-eleve="${el.id}" placeholder="Motif (optionnel)" value="${motif}" style="font-size:.82rem;padding:.3rem .5rem" ${isReadOnly ? 'disabled' : ''}>` : ''}
          </td>
        </tr>`;
      });

      html += `</tbody></table></div>`;

      if (!isReadOnly) {
        html += `<div class="card-body" style="border-top:1px solid var(--gray-200);display:flex;gap:.75rem;flex-wrap:wrap;align-items:center">
          <button class="btn btn-success" id="pres-save-btn" onclick="Pages._savePresences('${classeId}', '${dateAppel}')">
            <i class="fa-solid fa-floppy-disk"></i> Enregistrer l'appel
          </button>
          <button class="btn btn-outline btn-sm" onclick="Pages._marquerTousPresents()">
            <i class="fa-solid fa-check-double"></i> Tout présent
          </button>
          <span style="font-size:.8rem;color:var(--gray-500)">
            💡 Cochez "Absent" pour chaque élève manquant. Les autres sont considérés présents.
          </span>
        </div>`;
      }

      html += `</div>`;
      grid.innerHTML = html;
    } catch (err) {
      grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation" style="color:var(--danger)"></i><h3>Erreur</h3><p>${err.message}</p></div>`;
    }
  },

  _onAbsentChange(eleveId, isAbsent) {
    const justCell = document.getElementById(`pres-just-cell-${eleveId}`);
    const motifCell = document.getElementById(`pres-motif-cell-${eleveId}`);
    if (!justCell || !motifCell) return;

    if (isAbsent) {
      justCell.innerHTML = `
        <label style="cursor:pointer;display:inline-flex;align-items:center;gap:.3rem">
          <input type="checkbox" class="pres-just-cb" data-eleve="${eleveId}"
            style="width:16px;height:16px;accent-color:var(--warning)">
          <span style="font-size:.78rem">Justifié</span>
        </label>`;
      motifCell.innerHTML = `<input type="text" class="form-control pres-motif-inp" data-eleve="${eleveId}" placeholder="Motif (optionnel)" style="font-size:.82rem;padding:.3rem .5rem">`;
    } else {
      justCell.innerHTML = `<span style="color:var(--gray-300);font-size:.8rem">—</span>`;
      motifCell.innerHTML = '';
    }
  },

  _marquerTousPresents() {
    document.querySelectorAll('.pres-absent-cb').forEach(cb => {
      if (cb.checked) {
        cb.checked = false;
        Pages._onAbsentChange(cb.dataset.eleve, false);
      }
    });
  },

  async _savePresences(classeId, dateAppel) {
    const btn = document.getElementById('pres-save-btn');
    if (!Debounce.btn(btn, 6000)) return;
    try {
      const user = App.currentUser;
      const nomUser = `${user?.prenom||''} ${user?.nom||''}`.trim();

      // Récupérer tous les élèves de la grille
      const rows = document.querySelectorAll('#pres-tbody tr[id^="pres-row-"]');
      if (!rows.length) { Toast.error('Aucun élève à enregistrer.'); return; }

      // Supprimer les anciennes présences du jour pour cette classe
      const existantes = await DB.query('presences', p => p.classe_id === classeId && p.date_appel === dateAppel);
      for (const p of existantes) await DB.delete('presences', p.id);

      // Enregistrer les nouvelles
      let nbPresents = 0, nbAbsents = 0;
      for (const row of rows) {
        const eleveId = row.id.replace('pres-row-', '');
        const absentCb = row.querySelector(`.pres-absent-cb[data-eleve="${eleveId}"]`);
        const justCb = row.querySelector(`.pres-just-cb[data-eleve="${eleveId}"]`);
        const motifInp = row.querySelector(`.pres-motif-inp[data-eleve="${eleveId}"]`);

        const estAbsent = absentCb?.checked || false;
        const estJustifie = justCb?.checked || false;
        const motif = motifInp?.value?.trim() || '';

        await DB.insert('presences', {
          eleve_id: eleveId,
          classe_id: classeId,
          date_appel: dateAppel,
          present: !estAbsent,
          justifie: estAbsent ? estJustifie : false,
          motif_absence: estAbsent ? motif : '',
          enregistre_par_id: user?.id || '',
          enregistre_par_nom: nomUser
        });

        if (estAbsent) nbAbsents++; else nbPresents++;
      }

      Toast.success(`✅ Appel enregistré — ${nbPresents} présent(s), ${nbAbsents} absent(s) !`);
      // Recharger pour voir les stats
      Pages._loadPresences();
    } catch (err) {
      Toast.error('Erreur : ' + err.message);
      Debounce.release(btn, '<i class="fa-solid fa-floppy-disk"></i> Enregistrer l\'appel');
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // CONFIGURATION — Réservée admin uniquement
  // ══════════════════════════════════════════════════════════════════
  async config() {
    // Garde-fou : comptable, prof, directeur ne peuvent pas accéder à la configuration
    const role = App.currentUser?.role;
    if (role !== 'admin') {
      setContent(`
        <div class="empty-state">
          <i class="fa-solid fa-lock" style="color:var(--danger);font-size:3rem"></i>
          <h3>Accès refusé</h3>
          <p>La configuration de l'établissement est réservée à l'administrateur.</p>
          <button class="btn btn-primary" onclick="App.navigateTo('dashboard')"><i class="fa-solid fa-house"></i> Retour au tableau de bord</button>
        </div>`);
      return;
    }
    setLoading();
    try {
      const cfg = await DB.getEcoleConfig();
      await getDevise();
      const niveaux = [
        {key:'1ere',label:'1ère Année (Primaire)'},{key:'2eme',label:'2ème Année'},{key:'3eme',label:'3ème Année'},
        {key:'4eme',label:'4ème Année'},{key:'5eme',label:'5ème Année'},{key:'6eme',label:'6ème Année (CM2)'},
        {key:'7eme',label:'7ème Année (Collège)'},{key:'8eme',label:'8ème Année'},{key:'9eme',label:'9ème Année'},{key:'10eme',label:'10ème Année'}
      ];
      const existingTarifs = await DB.getAll('config_scolarite');

      setContent(`
        <div class="page-header"><div class="page-header-left"><h2><i class="fa-solid fa-gear" style="color:var(--primary)"></i> Configuration</h2><p>Paramètres de l'établissement</p></div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem">
          <div class="card">
            <div class="card-header"><div class="card-title"><i class="fa-solid fa-school"></i> Informations de l'école</div></div>
            <div class="card-body">
              <div class="form-group"><label class="form-label">Nom de l'école <span style="color:red">*</span></label><input class="form-control" id="cfg-nom" value="${cfg?.nom||''}"></div>
              <div class="form-group"><label class="form-label">Adresse</label><input class="form-control" id="cfg-addr" value="${cfg?.adresse||''}"></div>
              <div class="form-row">
                <div class="form-group"><label class="form-label">Téléphone</label><input class="form-control" id="cfg-tel" value="${cfg?.telephone||''}"></div>
                <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-control" id="cfg-email" value="${cfg?.email||''}"></div>
              </div>
              <div class="form-row">
                <div class="form-group"><label class="form-label">Devise</label>
                  <select class="form-control" id="cfg-devise">
                    <option value="FCFA" ${cfg?.devise==='FCFA'?'selected':''}>FCFA</option>
                    <option value="GNF" ${cfg?.devise==='GNF'?'selected':''}>GNF (Franc Guinéen)</option>
                    <option value="EUR" ${cfg?.devise==='EUR'?'selected':''}>EUR (€)</option>
                    <option value="USD" ${cfg?.devise==='USD'?'selected':''}>USD ($)</option>
                    <option value="XOF" ${cfg?.devise==='XOF'?'selected':''}>XOF</option>
                  </select>
                </div>
                <div class="form-group"><label class="form-label">Préfixe matricule</label><input class="form-control" id="cfg-prefix" value="${cfg?.matricule_prefix||'INJ'}" maxlength="8"></div>
              </div>
              <!-- Logo école — T4.2 : upload interne base64 -->
              <div class="form-group">
                <label class="form-label"><i class="fa-solid fa-image"></i> Logo de l'école</label>
                <div style="display:flex;gap:.75rem;align-items:flex-start;flex-wrap:wrap">
                  <div style="flex:1;min-width:200px">
                    <!-- Onglets URL / Upload -->
                    <div style="display:flex;gap:.4rem;margin-bottom:.5rem">
                      <button type="button" id="logo-tab-url" class="btn btn-sm btn-outline" style="font-size:.75rem" onclick="Pages._switchLogoTab('url')">🔗 URL</button>
                      <button type="button" id="logo-tab-file" class="btn btn-sm btn-primary" style="font-size:.75rem" onclick="Pages._switchLogoTab('file')">📁 Fichier local</button>
                    </div>
                    <div id="logo-panel-url" style="display:none">
                      <input class="form-control" id="cfg-logo-url" placeholder="https://exemple.com/logo.png" value="${cfg?.logo_url||''}" oninput="Pages._previewLogo(this.value)">
                      <div style="font-size:.72rem;color:var(--gray-500);margin-top:.2rem">URL directe PNG/JPG/SVG</div>
                    </div>
                    <div id="logo-panel-file" style="display:block">
                      <input type="file" id="cfg-logo-file" class="form-control" accept="image/*" onchange="Pages._onLogoFileChange(this)">
                      <div style="font-size:.72rem;color:var(--gray-500);margin-top:.2rem">PNG, JPG, SVG — max 500 Ko. Stocké en base64.</div>
                      ${cfg?.logo_base64 ? '<div style="font-size:.72rem;color:var(--secondary);margin-top:.2rem"><i class="fa-solid fa-circle-check"></i> Logo stocké en interne</div>' : ''}
                    </div>
                    <input type="hidden" id="cfg-logo-b64" value="">
                  </div>
                  <div id="cfg-logo-preview" style="width:80px;height:80px;border:2px dashed var(--gray-300);border-radius:8px;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;background:var(--gray-50);cursor:pointer" onclick="document.getElementById('cfg-logo-file').click()" title="Cliquer pour changer le logo">
                    ${(cfg?.logo_base64 || cfg?.logo_url)
                      ? `<img id="cfg-logo-img" src="${cfg.logo_base64 || cfg.logo_url}" style="max-width:100%;max-height:100%;object-fit:contain" alt="Logo">`
                      : '<span id="cfg-logo-placeholder" style="font-size:.65rem;color:var(--gray-400);text-align:center;padding:.3rem"><i class="fa-solid fa-image" style="font-size:1.4rem;display:block;margin-bottom:.2rem"></i>Logo</span>'}
                  </div>
                </div>
              </div>
              <button class="btn btn-primary" id="cfg-save-btn" onclick="Pages._saveConfig()"><i class="fa-solid fa-save"></i> Enregistrer</button>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><div class="card-title"><i class="fa-solid fa-coins"></i> Tarifs de scolarité annuels</div></div>
            <div class="card-body" style="padding:0">
              <table>
                <thead><tr><th>Niveau</th><th>Montant annuel</th></tr></thead>
                <tbody>${niveaux.map(n=>{const tc=existingTarifs.find(c=>c.niveau===n.key);return`<tr><td><strong>${n.label}</strong></td><td><input type="number" class="form-control note-input" style="width:150px" data-niveau="${n.key}" value="${tc?.montant_annuel||0}" min="0"></td></tr>`;}).join('')}</tbody>
              </table>
              <div style="padding:1rem"><button class="btn btn-success" id="tarif-save-btn" onclick="Pages._saveTarifs()"><i class="fa-solid fa-save"></i> Enregistrer les tarifs</button></div>
            </div>
          </div>
        </div>
        <!-- SECTION ÉCHÉANCIER (Bloc 2) -->
        <div class="card">
          <div class="card-header"><div class="card-title"><i class="fa-solid fa-calendar-days"></i> Modalité de paiement (Échéancier)</div></div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">Type d'échéancier</label>
              <div style="display:flex;gap:1rem;margin-top:.3rem">
                <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;padding:.6rem 1rem;border-radius:8px;border:2px solid ${cfg?.type_echeancier==='trimestriel'?'var(--gray-300)':'var(--primary)'};flex:1">
                  <input type="radio" name="ech-type" id="ech-mensuel" value="mensuel" ${cfg?.type_echeancier==='trimestriel'?'':'checked'} onchange="Pages._onEcheancierChange()" style="accent-color:var(--primary)">
                  <div><strong><i class="fa-solid fa-calendar"></i> Par Mois</strong><div style="font-size:.78rem;color:var(--gray-600)">Inscription + 9 mensualités (Sep–Mai)</div></div>
                </label>
                <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;padding:.6rem 1rem;border-radius:8px;border:2px solid ${cfg?.type_echeancier==='trimestriel'?'var(--primary)':'var(--gray-300)'};flex:1">
                  <input type="radio" name="ech-type" id="ech-trimestriel" value="trimestriel" ${cfg?.type_echeancier==='trimestriel'?'checked':''} onchange="Pages._onEcheancierChange()" style="accent-color:var(--primary)">
                  <div><strong><i class="fa-solid fa-calendar-week"></i> Par Trimestre</strong><div style="font-size:.78rem;color:var(--gray-600)">Inscription + 3 trimestres</div></div>
                </label>
              </div>
            </div>
            <div id="ech-montants-section" style="margin-top:.75rem">
              <label class="form-label">Montants par tranche (laisser vide = calculé automatiquement)</label>
              <div id="ech-montants-form" style="margin-top:.5rem"></div>
            </div>
            <button class="btn btn-primary btn-sm" style="margin-top:.75rem" id="ech-save-btn" onclick="Pages._saveEcheancier()"><i class="fa-solid fa-save"></i> Enregistrer l'échéancier</button>
          </div>
        </div>

        <!-- SAUVEGARDE & RESTAURATION -->
        <div class="card">
          <div class="card-header"><div class="card-title"><i class="fa-solid fa-database" style="color:var(--primary)"></i> Sauvegarde & Restauration</div></div>
          <div class="card-body">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;flex-wrap:wrap">
              <!-- Export -->
              <div>
                <div style="font-weight:600;margin-bottom:.4rem;font-size:.875rem"><i class="fa-solid fa-download"></i> Exporter une sauvegarde</div>
                <p style="font-size:.82rem;color:var(--gray-600);margin-bottom:.75rem">Téléchargez un fichier JSON complet de toutes vos données (élèves, notes, paiements, présences…). Conservez-le en lieu sûr.</p>
                <button class="btn btn-primary btn-sm" onclick="Pages._exportBackupJSON()">
                  <i class="fa-solid fa-download"></i> Télécharger la sauvegarde (JSON)
                </button>
              </div>
              <!-- Import -->
              <div>
                <div style="font-weight:600;margin-bottom:.4rem;font-size:.875rem;color:var(--warning)"><i class="fa-solid fa-upload"></i> Restaurer une sauvegarde</div>
                <p style="font-size:.82rem;color:var(--gray-600);margin-bottom:.75rem">Importez un fichier de sauvegarde JSON précédemment exporté. <strong style="color:var(--danger)">⚠️ Attention : les données existantes seront fusionnées (pas remplacées).</strong></p>
                <label class="btn btn-warning btn-sm" style="cursor:pointer;display:inline-flex;align-items:center;gap:.4rem">
                  <i class="fa-solid fa-file-import"></i> Choisir un fichier JSON
                  <input type="file" accept=".json" style="display:none" onchange="Pages._importBackupJSON(this)">
                </label>
                <div id="import-status" style="margin-top:.6rem;font-size:.82rem"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="card" style="border:2px solid var(--danger)">
          <div class="card-header"><div class="card-title" style="color:var(--danger)"><i class="fa-solid fa-triangle-exclamation"></i> Zone de danger</div></div>
          <div class="card-body">
            <p style="font-size:.875rem;color:var(--gray-600);margin-bottom:.75rem">Ces actions sont irréversibles. Procédez avec extrême prudence.</p>
            <button class="btn btn-danger btn-sm" onclick="Pages._resetAllData()">
              <i class="fa-solid fa-trash-can"></i> Supprimer TOUTES les données (réinitialisation)
            </button>
          </div>
        </div>`);
      // Initialiser le formulaire de montants
      Pages._buildEcheancierMontants(cfg);
    } catch (err) { setContent(`<div class="empty-state"><h3>Erreur</h3><p>${err.message}</p></div>`); }
  },

  _buildEcheancierMontants(cfg) {
    const typeEch = document.querySelector('input[name="ech-type"]:checked')?.value || cfg?.type_echeancier || 'mensuel';
    const montantsEch = cfg?.montants_echeances || [];
    const container = document.getElementById('ech-montants-form');
    if (!container) return;

    let tranches;
    if (typeEch === 'trimestriel') {
      tranches = [
        {id:'inscription', label:'Inscription'},
        {id:'trim1', label:'1er Trimestre'},
        {id:'trim2', label:'2ème Trimestre'},
        {id:'trim3', label:'3ème Trimestre'}
      ];
    } else {
      tranches = [
        {id:'inscription', label:'Inscription'},
        {id:'mois1', label:'Septembre'},{id:'mois2', label:'Octobre'},{id:'mois3', label:'Novembre'},
        {id:'mois4', label:'Décembre'},{id:'mois5', label:'Janvier'},{id:'mois6', label:'Février'},
        {id:'mois7', label:'Mars'},{id:'mois8', label:'Avril'},{id:'mois9', label:'Mai'}
      ];
    }

    container.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.5rem">
      ${tranches.map(t => {
        const existing = montantsEch.find(m => m.id === t.id);
        return `<div style="display:flex;flex-direction:column;gap:.2rem">
          <label style="font-size:.8rem;color:var(--gray-700)">${t.label}</label>
          <input type="number" class="form-control" data-tranche="${t.id}" data-label="${t.label}" min="0" placeholder="Auto" value="${existing?.montant ?? ''}">
        </div>`;
      }).join('')}
    </div>`;
  },

  _onEcheancierChange() {
    Pages._buildEcheancierMontants(null);
  },

  async _saveEcheancier() {
    const typeEch = document.querySelector('input[name="ech-type"]:checked')?.value || 'mensuel';
    const inputs = document.querySelectorAll('#ech-montants-form input[data-tranche]');
    const montantsEcheances = [];
    inputs.forEach(inp => {
      if (inp.value !== '') {
        montantsEcheances.push({ id: inp.dataset.tranche, label: inp.dataset.label, montant: parseFloat(inp.value) || 0 });
      }
    });
    const btn = document.getElementById('ech-save-btn');
    if (!btn || !Debounce.btn(btn, 5000)) return; // anti-double-clic
    try {
      await DB.setEcoleConfig({ type_echeancier: typeEch, montants_echeances: montantsEcheances });
      Toast.success('Échéancier enregistré !');
    } catch(err) { Toast.error('Erreur : ' + err.message); }
    finally { Debounce.release(btn, '<i class="fa-solid fa-save"></i> Enregistrer l\'échéancier'); }
  },

  _previewLogo(url) {
    const preview = document.getElementById('cfg-logo-preview');
    if (!preview) return;
    if (url?.trim()) {
      preview.innerHTML = `<img id="cfg-logo-img" src="${url.trim()}" style="max-width:100%;max-height:100%;object-fit:contain" onerror="this.style.display='none'" alt="Logo">`;
    } else {
      preview.innerHTML = `<span id="cfg-logo-placeholder" style="font-size:.65rem;color:var(--gray-400);text-align:center;padding:.3rem"><i class="fa-solid fa-image" style="font-size:1.4rem;display:block;margin-bottom:.2rem"></i>Logo</span>`;
    }
  },

  // T4.2 — Basculer entre onglet URL et onglet Fichier
  _switchLogoTab(tab) {
    const panelUrl  = document.getElementById('logo-panel-url');
    const panelFile = document.getElementById('logo-panel-file');
    const btnUrl    = document.getElementById('logo-tab-url');
    const btnFile   = document.getElementById('logo-tab-file');
    if (!panelUrl || !panelFile) return;
    if (tab === 'url') {
      panelUrl.style.display  = 'block';
      panelFile.style.display = 'none';
      btnUrl.className  = 'btn btn-sm btn-primary';
      btnFile.className = 'btn btn-sm btn-outline';
    } else {
      panelUrl.style.display  = 'none';
      panelFile.style.display = 'block';
      btnUrl.className  = 'btn btn-sm btn-outline';
      btnFile.className = 'btn btn-sm btn-primary';
    }
  },

  // T4.2 — Lecture du fichier image → base64, preview live
  _onLogoFileChange(input) {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) { Toast.error('Image trop grande (max 500 Ko).'); input.value = ''; return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const b64 = e.target.result; // data:image/png;base64,...
      document.getElementById('cfg-logo-b64').value = b64;
      // Mettre à jour la preview
      const preview = document.getElementById('cfg-logo-preview');
      if (preview) preview.innerHTML = `<img id="cfg-logo-img" src="${b64}" style="max-width:100%;max-height:100%;object-fit:contain" alt="Logo">`;
      Toast.success('Logo chargé — cliquez sur Enregistrer pour sauvegarder.');
    };
    reader.readAsDataURL(file);
  },

  async _saveConfig() {
    const nom = document.getElementById('cfg-nom').value.trim();
    if (!nom) { Toast.error('Le nom est obligatoire.'); return; }
    const btn = document.getElementById('cfg-save-btn');
    if (!Debounce.btn(btn, 5000)) return; // anti-double-clic
    try {
      // T4.2 — Récupérer logo : d'abord base64 (upload fichier), sinon URL
      const logoB64  = document.getElementById('cfg-logo-b64')?.value?.trim() || '';
      const logoUrl  = document.getElementById('cfg-logo-url')?.value?.trim()  || '';
      const logoData = logoB64 ? { logo_base64: logoB64, logo_url: '' }
                     : logoUrl ? { logo_url: logoUrl, logo_base64: '' }
                     : {};
      await DB.setEcoleConfig({
        nom,
        adresse: document.getElementById('cfg-addr').value.trim(),
        telephone: document.getElementById('cfg-tel').value.trim(),
        email: document.getElementById('cfg-email').value.trim(),
        devise: document.getElementById('cfg-devise').value,
        matricule_prefix: document.getElementById('cfg-prefix').value.trim()||'INJ',
        ...logoData
      });
      _deviseCache = document.getElementById('cfg-devise').value;
      Fmt._cfg = null;
      await App.updateSchoolName();
      Toast.success('Configuration enregistrée !');
    } catch(err){Toast.error('Erreur : '+err.message);}
    finally { Debounce.release(btn, '<i class="fa-solid fa-save"></i> Enregistrer'); }
  },

  async _saveTarifs() {
    const inputs = document.querySelectorAll('input[data-niveau]');
    const btn = document.getElementById('tarif-save-btn');
    if (!Debounce.btn(btn, 5000)) return; // anti-double-clic
    try {
      const existing = await DB.getAll('config_scolarite');
      for (const inp of inputs) {
        const niveau=inp.dataset.niveau; const montant=parseFloat(inp.value)||0;
        const found=existing.find(c=>c.niveau===niveau);
        if(found) await DB.update('config_scolarite',found.id,{montant_annuel:montant});
        else await DB.insert('config_scolarite',{niveau,montant_annuel:montant});
      }
      DB._invalidateCache('config_scolarite');
      Toast.success('Tarifs enregistrés !');
    } catch(err){Toast.error('Erreur : '+err.message);}
    finally { Debounce.release(btn, '<i class="fa-solid fa-save"></i> Enregistrer les tarifs'); }
  },

  async _exportBackupJSON() {
    try {
      const tables = ['classes','eleves','matieres','utilisateurs','notes','paiements','depenses','config_scolarite','presences','notes_audit_log'];
      const backup = { _version: 3, _date: new Date().toISOString(), ecole_config: await DB.getEcoleConfig() };
      for (const t of tables) {
        try { backup[t] = await DB.getAll(t); }
        catch { backup[t] = []; } // table peut ne pas exister encore
      }
      const ecoleCode = (DB.getCurrentEcoleCode() || 'zean').toLowerCase().replace(/[^a-z0-9]/g,'-');
      const filename = `sauvegarde-${ecoleCode}-${new Date().toISOString().split('T')[0]}.json`;
      Export.toJSON(backup, filename);
    } catch(err) { Toast.error('Erreur export : ' + err.message); }
  },

  // ── IMPORT / RESTAURATION DEPUIS FICHIER JSON ─────────────────────
  async _importBackupJSON(input) {
    const file = input?.files?.[0];
    if (!file) return;
    const statusEl = document.getElementById('import-status');
    if (statusEl) statusEl.innerHTML = '<div class="loading-spinner" style="width:14px;height:14px;border-width:2px;display:inline-block"></div> Lecture du fichier…';

    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      // Validation : vérifier que c'est bien une sauvegarde Zean School Manager
      if (!backup._version || !backup.eleves) {
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--danger)"><i class="fa-solid fa-xmark-circle"></i> Fichier invalide — ce n\'est pas une sauvegarde Zean School Manager.</span>';
        input.value = '';
        return;
      }

      const nbEleves = backup.eleves?.length || 0;
      const nbNotes = backup.notes?.length || 0;
      const nbPaiements = backup.paiements?.length || 0;
      const nbClasses = backup.classes?.length || 0;
      const dateBackup = backup._date ? new Date(backup._date).toLocaleString('fr-FR') : 'inconnue';

      const ok = confirm(
        `📦 RESTAURATION — Sauvegarde du ${dateBackup} (v${backup._version})\n\n` +
        `Contenu détecté :\n` +
        `  • ${nbClasses} classe(s)\n` +
        `  • ${nbEleves} élève(s)\n` +
        `  • ${nbNotes} note(s)\n` +
        `  • ${nbPaiements} paiement(s)\n\n` +
        `⚠️ Mode FUSION : les enregistrements existants avec le même ID seront mis à jour, les nouveaux seront ajoutés. Aucune donnée ne sera supprimée.\n\n` +
        `Confirmer la restauration ?`
      );
      if (!ok) { input.value = ''; if (statusEl) statusEl.innerHTML = ''; return; }

      if (statusEl) statusEl.innerHTML = '<div class="loading-spinner" style="width:14px;height:14px;border-width:2px;display:inline-block"></div> Restauration en cours…';

      const TABLES_ORDER = ['classes','matieres','eleves','utilisateurs','notes','paiements','depenses','config_scolarite','presences','notes_audit_log'];
      let totalImported = 0;
      let totalUpdated = 0;

      for (const tableName of TABLES_ORDER) {
        const rows = backup[tableName];
        if (!Array.isArray(rows) || !rows.length) continue;

        // Récupérer les IDs existants
        let existing = [];
        try { existing = await DB.getAll(tableName); } catch {}
        const existingIds = new Set(existing.map(r => r.id));

        for (const row of rows) {
          if (!row.id) continue;
          // Retirer les champs système générés par l'API
          const { gs_project_id, gs_table_name, created_at, updated_at, ...data } = row;
          try {
            if (existingIds.has(row.id)) {
              await DB.update(tableName, row.id, data);
              totalUpdated++;
            } else {
              await DB.insert(tableName, data);
              totalImported++;
            }
          } catch {}
        }
      }

      // Config école
      if (backup.ecole_config) {
        try { await DB.setEcoleConfig(backup.ecole_config); } catch {}
      }

      // Invalider tout le cache
      DB._cache = {};
      DB._cacheExpiry = {};

      const msg = `✅ Restauration terminée — ${totalImported} enregistrement(s) importé(s), ${totalUpdated} mis à jour.`;
      if (statusEl) statusEl.innerHTML = `<span style="color:var(--secondary)"><i class="fa-solid fa-circle-check"></i> ${msg}</span>`;
      Toast.success(msg);
      input.value = '';
    } catch(err) {
      const errMsg = `Erreur de restauration : ${err.message}`;
      if (statusEl) statusEl.innerHTML = `<span style="color:var(--danger)"><i class="fa-solid fa-xmark-circle"></i> ${errMsg}</span>`;
      Toast.error(errMsg);
      input.value = '';
    }
  },

  // ── RÉINITIALISATION TOTALE R17 ───────────────────────────────────
  // Purge COMPLÈTE : IndexedDB locale + cloud (table par table)
  async _resetAllData() {
    if (!confirm(
      '⛔ ATTENTION — PURGE COMPLÈTE\n\n' +
      'Cette action supprimera TOUTES les données de cette école :\n' +
      '• Élèves, classes, matières\n• Notes, présences\n• Paiements, dépenses\n• Utilisateurs (sauf votre compte admin)\n\n' +
      'Les données cloud ET locales seront effacées.\n\nCette action est IRRÉVERSIBLE.\n\n' +
      'Êtes-vous absolument certain ?'
    )) return;
    if (!confirm('🔴 DERNIÈRE CONFIRMATION\n\nTapez "OK" pour confirmer la purge totale.')) return;

    const btn = event?.target;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="loading-spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle"></span> Purge en cours…'; }

    const TABLES = ['eleves','classes','matieres','notes','paiements','depenses',
                    'config_scolarite','presences','notes_audit_log','comptabilite_caisse',
                    'comptabilite_banque','comptabilite_config'];
    let total = 0;

    try {
      // 1. Purger le cloud table par table
      if (navigator.onLine) {
        for (const t of TABLES) {
          try {
            const resp = await fetch(`tables/${t}?limit=500&page=1`);
            if (!resp.ok) continue;
            const data = await resp.json();
            const rows = data?.data || [];
            for (const r of rows) {
              try {
                await fetch(`tables/${t}/${r.id}`, { method: 'DELETE' });
                total++;
              } catch {}
            }
          } catch {}
        }
      }

      // 2. Purger IndexedDB locale (TOUTE la base)
      await DB._idbClearAll();
      DB._pullReady = false; // forcer un nouveau pull au prochain login

      Toast.success(`🗑️ Purge terminée — ${total} enregistrement(s) cloud supprimé(s). Base locale effacée. L'app va se recharger.`);
      setTimeout(() => location.reload(), 2000);

    } catch(err) {
      Toast.error('Erreur lors de la purge : ' + err.message);
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Supprimer TOUTES les données'; }
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // JOURNAL D'AUDIT — Historique des modifications de notes (admin/directeur)
  // ══════════════════════════════════════════════════════════════════
  async auditLog() {
    const role = App.currentUser?.role;
    if (!['admin','directeur'].includes(role)) {
      setContent(`<div class="empty-state"><i class="fa-solid fa-lock" style="color:var(--danger)"></i><h3>Accès refusé</h3><p>Cette page est réservée au directeur et à l'administrateur.</p></div>`);
      return;
    }
    setLoading('Chargement du journal d\'audit…');
    try {
      const [logs, eleves, matieres] = await Promise.all([
        DB.getAll('notes_audit_log'), DB.getAll('eleves'), DB.getAll('matieres')
      ]);
      const eMap = Object.fromEntries(eleves.map(e=>[e.id,e]));
      const mMap = Object.fromEntries(matieres.map(m=>[m.id,m]));
      const sorted = [...logs].sort((a,b) => new Date(b.date_modification||b.created_at) - new Date(a.date_modification||a.created_at));
      const pending = sorted.filter(l => l.statut === 'pending_validation');
      const valides = sorted.filter(l => l.statut === 'valide');

      setContent(`
        <div class="page-header">
          <div class="page-header-left">
            <h2><i class="fa-solid fa-shield-halved" style="color:var(--danger)"></i> Journal d'Audit des Notes</h2>
            <p>Historique des modifications — ${logs.length} entrée(s) | ${pending.length} en attente de validation</p>
          </div>
        </div>

        ${pending.length > 0 ? `
        <div class="card" style="margin-bottom:1.25rem;border:2px solid var(--warning)">
          <div class="card-header" style="background:#fff8e1">
            <div class="card-title" style="color:#e65100"><i class="fa-solid fa-triangle-exclamation"></i> ${pending.length} modification(s) en attente de validation</div>
          </div>
          <div class="card-body" style="padding:0">
            <div class="table-wrapper">
              <table>
                <thead><tr><th>Date</th><th>Élève</th><th>Matière</th><th>Séq.</th><th>Ancienne</th><th>Nouvelle</th><th>Motif</th><th>Par</th><th>Actions</th></tr></thead>
                <tbody>
                  ${pending.map(l => {
                    const el = eMap[l.eleve_id];
                    const mat = mMap[l.matiere_id];
                    const dt = l.date_modification || l.created_at;
                    return `<tr style="background:#fff8e1">
                      <td style="white-space:nowrap;font-size:.8rem">${dt ? new Date(dt).toLocaleString('fr-FR') : '—'}</td>
                      <td><strong>${el ? el.prenom+' '+el.nom : '—'}</strong></td>
                      <td>${mat?.nom||'—'}</td>
                      <td style="text-align:center">S${l.sequence||'—'}</td>
                      <td style="text-align:center;color:var(--danger);font-weight:600">${l.ancienne_valeur??'—'}</td>
                      <td style="text-align:center;color:var(--secondary);font-weight:600">${l.nouvelle_valeur??'—'}</td>
                      <td style="max-width:160px;font-size:.8rem">${l.motif||'—'}</td>
                      <td style="font-size:.8rem">${l.modifie_par_nom||'—'}</td>
                      <td>
                        <div style="display:flex;gap:.3rem">
                          <button class="btn btn-success btn-sm" onclick="Pages._validateAudit('${l.id}',true)" title="Valider"><i class="fa-solid fa-check"></i></button>
                          <button class="btn btn-danger btn-sm" onclick="Pages._validateAudit('${l.id}',false)" title="Rejeter"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                      </td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>` : `<div style="padding:.6rem 1rem;background:#e8f5e9;border-radius:8px;margin-bottom:1rem;font-size:.85rem;color:var(--secondary)"><i class="fa-solid fa-check-circle"></i> Aucune modification en attente de validation.</div>`}

        <div class="card">
          <div class="card-header">
            <div class="card-title"><i class="fa-solid fa-clock-rotate-left"></i> Historique complet (${sorted.length} entrées)</div>
          </div>
          <div class="card-body" style="padding:0">
            <div class="table-wrapper">
              <table>
                <thead><tr><th>Date</th><th>Élève</th><th>Matière</th><th>Séq.</th><th>Avant</th><th>Après</th><th>Motif</th><th>Auteur</th><th>Statut</th></tr></thead>
                <tbody>
                  ${sorted.length ? sorted.map(l => {
                    const el = eMap[l.eleve_id];
                    const mat = mMap[l.matiere_id];
                    const dt = l.date_modification || l.created_at;
                    const isPending = l.statut === 'pending_validation';
                    return `<tr>
                      <td style="white-space:nowrap;font-size:.8rem">${dt ? new Date(dt).toLocaleString('fr-FR') : '—'}</td>
                      <td><strong>${el ? el.prenom+' '+el.nom : '—'}</strong></td>
                      <td>${mat?.nom||'—'}</td>
                      <td style="text-align:center">S${l.sequence||'—'}</td>
                      <td style="text-align:center;color:var(--danger)">${l.ancienne_valeur??'—'}</td>
                      <td style="text-align:center;color:var(--secondary);font-weight:600">${l.nouvelle_valeur??'—'}</td>
                      <td style="max-width:160px;font-size:.8rem">${l.motif||'—'}</td>
                      <td style="font-size:.8rem">${l.modifie_par_nom||'—'}</td>
                      <td>${isPending ? '<span class="badge badge-warning">En attente</span>' : '<span class="badge badge-success">Validé</span>'}</td>
                    </tr>`;
                  }).join('') : `<tr><td colspan="9" class="table-empty"><i class="fa-solid fa-scroll"></i> Aucune entrée dans le journal</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>`);
    } catch(err) {
      setContent(`<div class="empty-state"><i class="fa-solid fa-triangle-exclamation" style="color:var(--danger)"></i><h3>Erreur</h3><p>${err.message}</p><button class="btn btn-primary" onclick="Pages.auditLog()">Réessayer</button></div>`);
    }
  },

  async _validateAudit(logId, accept) {
    if (!logId) return;
    const user = App.currentUser;
    const role = user?.role;
    // Seul le directeur peut valider (Fix 3 : admin ne peut pas auto-valider ses propres demandes)
    if (!['directeur', 'admin'].includes(role)) {
      Toast.error('Seul le Directeur peut valider les modifications de notes.');
      return;
    }
    try {
      const log = await DB.getById('notes_audit_log', logId);
      if (!log) { Toast.error('Entrée introuvable.'); return; }

      // Fix 3 : un admin NE PEUT PAS valider sa propre demande
      if (role === 'admin' && log.soumis_par_role === 'admin' && log.modifie_par_id === user?.id) {
        Toast.error('❌ Vous ne pouvez pas valider votre propre demande de modification. Le Directeur doit approuver.');
        return;
      }

      if (accept) {
        // Valider : APPLIQUER la nouvelle valeur maintenant (elle était en attente)
        if (log.note_id && log.nouvelle_valeur !== undefined && log.nouvelle_valeur !== null) {
          await DB.update('notes', log.note_id, { valeur: log.nouvelle_valeur });
        }
        await DB.update('notes_audit_log', logId, {
          statut: 'valide',
          valide_par_id: user?.id || '',
          valide_par_nom: `${user?.prenom||''} ${user?.nom||''}`.trim()
        });
        Toast.success('✅ Modification approuvée et note mise à jour.');
      } else {
        // Rejeter : la note n'a pas été appliquée (elle restait figée), rien à restaurer
        // Sauf pour les modifs directeur (<24h valide) où elle l'était déjà
        if (log.statut !== 'valide' && log.note_id && log.ancienne_valeur !== undefined) {
          // Remettre l'ancienne valeur si la note avait été modifiée (cas direc)
          await DB.update('notes', log.note_id, { valeur: log.ancienne_valeur });
        }
        await DB.update('notes_audit_log', logId, {
          statut: 'rejete',
          valide_par_id: user?.id || '',
          valide_par_nom: `${user?.prenom||''} ${user?.nom||''}`.trim()
        });
        Toast.warning('⚠️ Modification rejetée — demande archivée.');
      }
      Pages.auditLog();
      App._refreshAuditBadge();
    } catch(err) { Toast.error('Erreur : ' + err.message); }
  },

  // ══════════════════════════════════════════════════════════════════
  // GRILLE PAIEMENTS PAR CLASSE — T1.3 version interactive complète
  // Les tranches sont mappées depuis DB.getEcheances() (tranche_label → mois)
  // Clic sur case = valider/dévalider le paiement d'un mois
  // ══════════════════════════════════════════════════════════════════
  async grillePaiements() {
    const role = App.currentUser?.role;
    if (!['admin','comptable'].includes(role)) {
      setContent(`<div class="empty-state"><i class="fa-solid fa-lock"></i><h3>Accès réservé au comptable et à l'administrateur</h3></div>`);
      return;
    }
    setLoading('Chargement de la grille…');
    try {
      const [classes, eleves, paiements, configsSco] = await Promise.all([
        DB.getAll('classes'), DB.getAll('eleves'),
        DB.getAll('paiements'), DB.getAll('config_scolarite')
      ]);
      await getDevise();
      const sorted = sortClasses(classes);
      const MOIS = ['Oct','Nov','Déc','Jan','Fév','Mar','Avr','Mai','Juin'];
      // Paiements valides groupés par élève
      const paysValides = paiements.filter(p => !p.annule);
      const pMap = {};
      paysValides.forEach(p => { if (!pMap[p.eleve_id]) pMap[p.eleve_id] = []; pMap[p.eleve_id].push(p); });

      // Stocker les données pour la validation
      this._grilleData = { classes: sorted, eleves, paysValides, configsSco, pMap };

      Pages._grilleModifiee = false; // Réinitialiser flag batch
      setContent(`
        <div class="page-header">
          <div class="page-header-left">
            <h2><i class="fa-solid fa-table-cells" style="color:var(--primary)"></i> Grille des Paiements par Classe</h2>
            <p>Cochez/décochez les mensualités — cliquez sur <strong>Enregistrer la grille</strong> pour confirmer</p>
          </div>
          <div style="display:flex;gap:.6rem;flex-wrap:wrap">
            <button id="grille-batch-save" class="btn btn-success btn-lg" onclick="Pages._saveGrilleBatch()" style="font-weight:700">
              <i class="fa-solid fa-floppy-disk"></i> Enregistrer la grille
            </button>
            <button class="btn btn-outline" onclick="Pages._exportGrilleXlsx()"><i class="fa-solid fa-file-excel"></i> Exporter Excel</button>
          </div>
        </div>

        <div class="card" style="margin-bottom:1rem">
          <div class="card-body" style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:center">
            <label class="form-label" style="margin:0"><i class="fa-solid fa-filter"></i> Filtrer :</label>
            <select class="form-control" style="width:auto" id="grille-classe-filter" onchange="Pages._filterGrille()">
              <option value="">Toutes les classes</option>
              ${sorted.map(c => `<option value="${c.id}">${formatClasseLabel(c)}</option>`).join('')}
            </select>
            <div style="margin-left:auto;font-size:.8rem;color:var(--gray-600);display:flex;flex-wrap:wrap;gap:.3rem;align-items:center">
              <i class="fa-solid fa-circle-info"></i>
              <span style="background:#e8f5e9;color:#2e7d32;padding:.2rem .5rem;border-radius:4px">✓ Payé</span>
              <span style="background:#e3f2fd;color:#1565c0;padding:.2rem .5rem;border-radius:4px">✓* En attente</span>
              <span style="background:#fff3e0;color:#e65100;padding:.2rem .5rem;border-radius:4px">✕ À annuler</span>
              <span style="background:#fff8e1;color:#e65100;padding:.2rem .5rem;border-radius:4px">½ Partiel</span>
              <span style="background:var(--gray-100);color:var(--gray-500);padding:.2rem .5rem;border-radius:4px">— Non payé</span>
              <span style="background:#f0f0f0;color:#bbb;padding:.2rem .5rem;border-radius:4px">EXO Exonéré</span>
              <span style="background:#ff6b6b;color:white;padding:.2rem .5rem;border-radius:4px;font-weight:600">💾 Cliquez sur "Enregistrer" pour confirmer</span>
            </div>
          </div>
        </div>

        <div id="grille-content">
          ${await this._buildGrilleContent(sorted, eleves, paysValides, configsSco, pMap, MOIS)}
        </div>`);
    } catch(err) {
      setContent(`<div class="empty-state"><h3>Erreur</h3><p>${err.message}</p><button class="btn btn-primary" onclick="Pages.grillePaiements()">Réessayer</button></div>`);
    }
  },

  // Construit le HTML de toutes les classes dans la grille
  async _buildGrilleContent(sorted, eleves, paysValides, configsSco, pMap, MOIS) {
    const MOIS_LABELS = MOIS || ['Oct','Nov','Déc','Jan','Fév','Mar','Avr','Mai','Juin'];
    let html = '';
    for (const cls of sorted) {
      const elevesClasse = eleves.filter(e => e.classe_id === cls.id).sort((a,b) => a.nom.localeCompare(b.nom));
      if (!elevesClasse.length) continue;
      const cfg = configsSco.find(c => c.niveau === cls.niveau);
      const total = parseFloat(cfg?.montant_annuel || 0);
      const mensualite = total > 0 ? Math.round(total / 9) : 0; // montant approx par mois

      // Récupérer les écheances de la classe (pour mapper tranche_id → mois_index)
      let echeancesRef = [];
      try {
        // Essayer avec le 1er élève de la classe pour obtenir les échéances type
        if (elevesClasse[0]) {
          echeancesRef = await DB.getEcheances(cls.id, elevesClasse[0].id);
        }
      } catch {}

      // Map : tranche_id → mois_index (0 = Oct … 8 = Juin)
      const trancheToMois = {};
      echeancesRef.forEach((ech, idx) => { trancheToMois[ech.id] = idx; });
      // Aussi mapper par label en cas d'absence d'ID
      const labelToMois = {};
      echeancesRef.forEach((ech, idx) => { labelToMois[(ech.label||'').toLowerCase()] = idx; });

      // Calculer statut paiement par élève et par mois
      const getStatutMois = (eleveId, moisIdx) => {
        const pays = (pMap[eleveId] || []);
        let montantMois = 0;
        pays.forEach(p => {
          let mi = -1;
          if (p.tranche_id && trancheToMois[p.tranche_id] !== undefined) {
            mi = trancheToMois[p.tranche_id];
          } else if (p.tranche_label) {
            // Fallback : mapping par numéro de mois dans le label ("Mensualité 1" → 0)
            const m = (p.tranche_label || '').match(/(\d+)/);
            if (m) mi = parseInt(m[1]) - 1;
            else {
              // Fallback 2 : nom du mois dans le label
              const key = (p.tranche_label || '').toLowerCase();
              if (labelToMois[key] !== undefined) mi = labelToMois[key];
            }
          } else if (p.mois_index !== undefined) {
            mi = p.mois_index;
          }
          if (mi === moisIdx) montantMois += parseFloat(p.montant || 0);
        });
        const montantRef = echeancesRef[moisIdx]?.montant || mensualite;
        if (montantMois <= 0) return { statut: 'non', montant: 0, montantRef };
        if (montantMois >= montantRef * 0.99) return { statut: 'paye', montant: montantMois, montantRef };
        return { statut: 'partiel', montant: montantMois, montantRef };
      };

      // Header résumé de la classe
      const totalPayeClasse = elevesClasse.reduce((s, e) => s + (pMap[e.id]||[]).reduce((ss,p) => ss+parseFloat(p.montant||0),0), 0);
      const totalDuClasse = total * elevesClasse.length;
      const pctCls = totalDuClasse > 0 ? Math.min(100, Math.round(totalPayeClasse/totalDuClasse*100)) : 0;

      html += `<div class="card grille-classe-block" data-classe="${cls.id}" style="margin-bottom:1.5rem">
        <div class="card-header" style="background:linear-gradient(135deg,var(--primary) 0%,var(--primary-dark) 100%);color:white;border-radius:var(--radius) var(--radius) 0 0">
          <div class="card-title" style="color:white">
            <i class="fa-solid fa-chalkboard"></i> ${cls.nom}
            <small style="opacity:.8;font-weight:400"> (${cls.niveau})</small>
            <span style="background:rgba(255,255,255,.2);border-radius:12px;padding:.15rem .6rem;font-size:.78rem;margin-left:.5rem">${elevesClasse.length} élève(s)</span>
          </div>
          <div style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap">
            <div style="font-size:.82rem;opacity:.9">
              <strong>${money(totalPayeClasse)}</strong> / ${money(totalDuClasse)}
              <span style="background:rgba(255,255,255,.25);border-radius:10px;padding:.1rem .5rem;margin-left:.3rem">${pctCls}%</span>
            </div>
            <button class="btn btn-sm" style="background:rgba(255,255,255,.2);color:white;border:1px solid rgba(255,255,255,.4)"
              onclick="Pages._openGrilleValidation('${cls.id}')">
              <i class="fa-solid fa-check-double"></i> Validation rapide
            </button>
          </div>
        </div>
        <div class="card-body" style="padding:0;overflow-x:auto">
          <table style="min-width:800px;border-collapse:collapse">
            <thead>
              <tr style="background:var(--gray-100)">
                <th style="min-width:170px;padding:.6rem .8rem;border-bottom:2px solid var(--gray-300)">Élève</th>
                ${MOIS_LABELS.map((m,i) => `<th style="text-align:center;min-width:72px;padding:.5rem .3rem;border-bottom:2px solid var(--gray-300);font-size:.8rem">${m}</th>`).join('')}
                <th style="text-align:center;min-width:90px;padding:.5rem .6rem;border-bottom:2px solid var(--gray-300)">Total payé</th>
                <th style="text-align:center;min-width:70px;padding:.5rem .6rem;border-bottom:2px solid var(--gray-300)">Statut</th>
              </tr>
            </thead>
            <tbody>`;

      for (const e of elevesClasse) {
        const paysEleve = (pMap[e.id] || []);
        const totalPaye = paysEleve.reduce((s,p) => s+parseFloat(p.montant||0), 0);
        const reste = Math.max(0, total - totalPaye);
        const avoir = totalPaye > total && total > 0 ? totalPaye - total : 0;
        const pct = total > 0 ? Math.min(100, Math.round(totalPaye/total*100)) : 0;
        const statut = totalPaye >= total && total > 0 ? 'solde' : totalPaye > 0 ? 'encours' : 'aucun';

        html += `<tr style="border-bottom:1px solid var(--gray-200)">
          <td style="padding:.5rem .8rem">
            <div style="font-weight:600;font-size:.85rem">${e.prenom} ${e.nom}</div>
            <div style="font-size:.7rem;color:var(--gray-500)">${e.matricule||'—'}</div>
            <div class="progress" style="height:3px;margin-top:.2rem;width:100px;background:var(--gray-200);border-radius:2px">
              <div style="height:100%;width:${pct}%;background:${statut==='solde'?'var(--secondary)':statut==='encours'?'#ff9800':'var(--danger)'};border-radius:2px"></div>
            </div>
          </td>`;

        // Fix 5 — Gestion exonérés
        const estExonere = e.type_scolarite === 'exonere';

        for (let mIdx = 0; mIdx < MOIS_LABELS.length; mIdx++) {
          const { statut: sm, montant: mm, montantRef } = getStatutMois(e.id, mIdx);

          if (estExonere) {
            // Exonéré : case grisée, non cliquable
            html += `<td data-eleve="${e.id}" data-mois="${mIdx}" data-statut="exonere" data-exonere="true"
              style="text-align:center;background:#f0f0f0;padding:.4rem .2rem;cursor:not-allowed"
              title="Élève exonéré — aucun paiement requis">
              <span style="font-size:.8rem;color:#bbb">EXO</span>
            </td>`;
            continue;
          }

          // Trouver l'id du paiement existant pour annulation batch
          const paiementExistant = (pMap[e.id] || []).find(p => {
            if (p.tranche_id && trancheToMois[p.tranche_id] === mIdx) return true;
            const m = (p.tranche_label || '').match(/(\d+)/);
            return m && parseInt(m[1]) - 1 === mIdx;
          });

          let bg = '', color = '#bbb', icon = '—', title = 'Non payé';
          let curStatut = 'non';
          if (sm === 'paye') { bg = '#e8f5e9'; color = '#2e7d32'; icon = '✓'; title = money(mm); curStatut = 'paye'; }
          else if (sm === 'partiel') { bg = '#fff8e1'; color = '#e65100'; icon = '½'; title = money(mm)+'/'+money(montantRef); curStatut = 'partiel'; }

          const ech = echeancesRef[mIdx];
          html += `<td
            data-eleve="${e.id}"
            data-mois="${mIdx}"
            data-statut="${curStatut}"
            data-exonere="false"
            data-pay-id="${paiementExistant?.id || ''}"
            data-tranche-id="${ech?.id || ''}"
            data-tranche-label="${ech?.label || MOIS_LABELS[mIdx]}"
            data-montant="${ech?.montant || mensualite}"
            style="text-align:center;background:${bg};padding:.4rem .2rem;cursor:pointer;transition:background .15s;user-select:none"
            title="${e.prenom} ${e.nom} — ${MOIS_LABELS[mIdx]} : ${title}"
            onclick="Pages._grilleToggleMois('${e.id}','${cls.id}',${mIdx},'${cls.niveau}')">
            <span style="font-size:.82rem;font-weight:${sm!=='non'?'700':'400'};color:${color}">${icon}</span>
          </td>`;
        }

        html += `<td style="text-align:center;font-weight:700;color:var(--secondary);padding:.5rem .6rem">${money(totalPaye)}</td>
          <td style="text-align:center;padding:.5rem .6rem">
            ${avoir > 0 ? `<span class="badge" style="background:#e8f5e9;color:#2e7d32;font-size:.7rem">Avoir +${money(avoir)}</span>` : Fmt.statutBadge(statut)}
          </td>
        </tr>`;
      }

      html += `</tbody></table></div></div>`;
    }
    return html || `<div class="empty-state"><i class="fa-solid fa-school"></i><h3>Aucune classe avec des élèves</h3></div>`;
  },

  // Ouvrir modal de validation rapide pour une classe entière
  async _openGrilleValidation(classeId) {
    const { classes, eleves, configsSco, pMap } = this._grilleData || {};
    if (!classes) { Toast.error('Rechargez la grille.'); return; }
    const cls = classes.find(c => c.id === classeId);
    const elevesClasse = (eleves || []).filter(e => e.classe_id === classeId).sort((a,b) => a.nom.localeCompare(b.nom));
    const cfg = (configsSco || []).find(c => c.niveau === cls?.niveau);
    const mensualite = cfg?.montant_annuel ? Math.round(parseFloat(cfg.montant_annuel) / 9) : 0;
    const MOIS = ['Oct','Nov','Déc','Jan','Fév','Mar','Avr','Mai','Juin'];

    // Écheances de référence
    let echeancesRef = [];
    try { if (elevesClasse[0]) echeancesRef = await DB.getEcheances(classeId, elevesClasse[0].id); } catch {}

    Modal.open(`⚡ Validation rapide — ${cls?.nom}`,
      `<div style="margin-bottom:.75rem;background:var(--primary-light);border-radius:8px;padding:.7rem 1rem;font-size:.85rem">
        <i class="fa-solid fa-circle-info" style="color:var(--primary)"></i>
        Cochez les mois payés pour chaque élève. Le montant sera la mensualité standard (<strong>${money(mensualite)}</strong>/mois).
      </div>
      <div style="overflow-x:auto;max-height:60vh;overflow-y:auto">
        <table style="min-width:700px;border-collapse:collapse">
          <thead style="position:sticky;top:0;background:white;z-index:2">
            <tr>
              <th style="min-width:160px;padding:.5rem .7rem;border-bottom:2px solid var(--primary);text-align:left">Élève</th>
              ${MOIS.map(m => `<th style="text-align:center;min-width:55px;padding:.5rem .3rem;border-bottom:2px solid var(--primary);font-size:.8rem">${m}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${elevesClasse.map(e => {
              const paysE = pMap[e.id] || [];
              const trancheToMois = {};
              echeancesRef.forEach((ech, idx) => { trancheToMois[ech.id] = idx; });
              const getStatut = (mIdx) => {
                return paysE.some(p => {
                  let mi = -1;
                  if (p.tranche_id && trancheToMois[p.tranche_id] !== undefined) mi = trancheToMois[p.tranche_id];
                  else { const m=(p.tranche_label||'').match(/(\d+)/); if(m) mi=parseInt(m[1])-1; }
                  return mi === mIdx;
                });
              };
              return `<tr style="border-bottom:1px solid var(--gray-200)">
                <td style="padding:.4rem .7rem"><strong style="font-size:.85rem">${e.prenom} ${e.nom}</strong></td>
                ${MOIS.map((_, i) => {
                  const paye = getStatut(i);
                  return `<td style="text-align:center;padding:.3rem">
                    <input type="checkbox" class="grille-rapid-cb" data-eleve="${e.id}" data-mois="${i}"
                      data-tranche-id="${echeancesRef[i]?.id||''}" data-tranche-label="${echeancesRef[i]?.label||MOIS[i]}"
                      data-montant="${echeancesRef[i]?.montant||mensualite}"
                      ${paye ? 'checked' : ''}
                      style="width:18px;height:18px;accent-color:var(--secondary);cursor:pointer">
                  </td>`;
                }).join('')}
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="form-row" style="margin-top:1rem">
        <div class="form-group">
          <label class="form-label"><i class="fa-solid fa-calendar"></i> Date de paiement</label>
          <input type="date" class="form-control" id="grille-rapid-date" value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label class="form-label">Mode de paiement</label>
          <select class="form-control" id="grille-rapid-mode"><option>Espèces</option><option>Mobile Money</option><option>Chèque</option><option>Virement</option></select>
        </div>
      </div>`,
      `<button class="btn btn-outline" onclick="Modal.close()">Annuler</button>
       <button class="btn btn-success" id="grille-rapid-save" onclick="Pages._saveGrilleRapide('${classeId}')">
         <i class="fa-solid fa-floppy-disk"></i> Enregistrer pour toute la classe
       </button>`,
      'modal-lg'
    );
  },

  // Enregistrer la validation rapide de la grille pour toute une classe
  async _saveGrilleRapide(classeId) {
    const btn = document.getElementById('grille-rapid-save');
    if (!Debounce.btn(btn, 10000)) return;
    try {
      const dateVal = document.getElementById('grille-rapid-date')?.value || new Date().toISOString().split('T')[0];
      const mode = document.getElementById('grille-rapid-mode')?.value || 'Espèces';
      const dateISO = new Date(dateVal + 'T12:00:00').toISOString();
      const caissier_nom = `${App.currentUser?.prenom||''} ${App.currentUser?.nom||''}`.trim();
      const caissier_id = App.currentUser?.id || '';

      const cbs = Array.from(document.querySelectorAll('.grille-rapid-cb:checked'));
      if (!cbs.length) { Toast.error('Cochez au moins un mois à valider.'); Debounce.release(btn, '<i class="fa-solid fa-floppy-disk"></i> Enregistrer pour toute la classe'); return; }

      // Charger les paiements existants pour ne pas créer de doublons
      const existants = await DB.query('paiements', p => !p.annule && p.eleve_id);
      const { pMap } = this._grilleData || {};
      let nbCrees = 0, nbIgnores = 0;

      for (const cb of cbs) {
        const eleveId = cb.dataset.eleve;
        const moisIdx = parseInt(cb.dataset.mois);
        const trancheId = cb.dataset.trancheId;
        const trancheLabel = cb.dataset.trancheLabel;
        const montant = parseFloat(cb.dataset.montant) || 0;

        // Vérifier si ce mois est déjà payé pour cet élève
        const dejaPaye = (pMap[eleveId] || []).some(p => {
          if (p.tranche_id && p.tranche_id === trancheId) return true;
          const m = (p.tranche_label || '').match(/(\d+)/);
          if (m && parseInt(m[1]) - 1 === moisIdx) return true;
          return false;
        });

        if (dejaPaye) { nbIgnores++; continue; }

        await DB.insert('paiements', {
          eleve_id: eleveId, montant,
          mode_paiement: mode, observation: 'Grille comptable',
          date_paiement: dateISO,
          caissier_id, caissier_nom, annule: false,
          tranche_id: trancheId, tranche_label: trancheLabel
        });
        nbCrees++;
      }

      Toast.success(`✅ ${nbCrees} paiement(s) enregistré(s) ! ${nbIgnores > 0 ? nbIgnores+' déjà existant(s) ignoré(s).' : ''}`);
      Modal.close();
      // Invalider cache et recharger
      DB._cache = {}; DB._cacheExpiry = {};
      Pages.grillePaiements();
    } catch(err) {
      Toast.error('Erreur : ' + err.message);
      Debounce.release(btn, '<i class="fa-solid fa-floppy-disk"></i> Enregistrer pour toute la classe');
    }
  },

  // Fix 5 — Clic sur case grille : mode batch UNIQUEMENT (pas de sauvegarde immédiate)
  // La case est cochée/décochée visuellement — l'enregistrement se fait via "Enregistrer la grille"
  _grilleToggleMois(eleveId, classeId, moisIdx, niveau) {
    const MOIS = ['Oct','Nov','Déc','Jan','Fév','Mar','Avr','Mai','Juin'];
    const cell = document.querySelector(`td[data-eleve="${eleveId}"][data-mois="${moisIdx}"]`);
    if (!cell) return;

    // Vérifier si l'élève est exonéré → bloquer
    if (cell.dataset.exonere === 'true') {
      Toast.warning('Cet élève est exonéré — aucun paiement ne peut être enregistré.');
      return;
    }

    const estPaye = cell.dataset.statut === 'paye';
    const estPending = cell.dataset.statut === 'pending'; // modification batch en attente

    // Fix 5 — Séquentialité stricte : vérifier que le mois précédent est validé
    if (!estPaye && !estPending && moisIdx > 0) {
      const prevCell = document.querySelector(`td[data-eleve="${eleveId}"][data-mois="${moisIdx - 1}"]`);
      if (prevCell && prevCell.dataset.statut === 'non') {
        Toast.error(`⛔ Vous devez d'abord valider ${MOIS[moisIdx - 1]} avant de cocher ${MOIS[moisIdx]}.`);
        return;
      }
    }

    // Basculer l'état visuel pending
    if (estPaye) {
      // Décocher (marquer pour annulation)
      cell.dataset.statut = 'cancel';
      cell.style.background = '#fff3e0';
      cell.style.color = '#e65100';
      cell.innerHTML = `<span style="font-size:.8rem;font-weight:700;color:#e65100" title="Sera annulé à l'enregistrement">✕</span>`;
    } else if (cell.dataset.statut === 'cancel') {
      // Re-cocher (annuler l'annulation)
      cell.dataset.statut = 'paye';
      cell.style.background = '#e8f5e9';
      cell.innerHTML = `<span style="font-size:.8rem;font-weight:700;color:#2e7d32">✓</span>`;
    } else if (estPending) {
      // Décocher un pending (ne plus l'ajouter)
      cell.dataset.statut = 'non';
      cell.style.background = '';
      cell.innerHTML = `<span style="font-size:.8rem;color:#ccc">—</span>`;
    } else {
      // Cocher (marquer pour ajout)
      cell.dataset.statut = 'pending';
      cell.style.background = '#e3f2fd';
      cell.innerHTML = `<span style="font-size:.8rem;font-weight:700;color:#1565c0" title="Sera enregistré au clic sur Enregistrer">✓*</span>`;
    }

    // Marquer la grille comme modifiée
    Pages._grilleModifiee = true;
    const saveBtn = document.getElementById('grille-batch-save');
    if (saveBtn) {
      saveBtn.style.animation = 'pulse 1s infinite';
      saveBtn.style.background = '#27ae60';
      saveBtn.textContent = '💾 Enregistrer la grille (modifications en attente)';
    }
  },

  // Fix 5 — Enregistrement batch de toute la grille
  async _saveGrilleBatch() {
    const btn = document.getElementById('grille-batch-save');
    if (!Pages._grilleModifiee) { Toast.info('Aucune modification à enregistrer.'); return; }
    if (!Debounce.btn(btn, 15000)) return;
    try {
      const caissierNom = `${App.currentUser?.prenom||''} ${App.currentUser?.nom||''}`.trim();
      const caissierId = App.currentUser?.id || '';
      const dateISO = new Date().toISOString();
      let nbAjoutes = 0, nbAnnules = 0;

      // Trouver toutes les cellules modifiées
      const cellsPending = document.querySelectorAll('td[data-statut="pending"]');
      const cellsCancel  = document.querySelectorAll('td[data-statut="cancel"]');

      // Ajouter les paiements cochés
      for (const cell of cellsPending) {
        const eleveId    = cell.dataset.eleve;
        const moisIdx    = parseInt(cell.dataset.mois);
        const trancheId  = cell.dataset.trancheId || '';
        const trancheLabel = cell.dataset.trancheLabel || `Mensualité ${moisIdx + 1}`;
        const montant    = parseFloat(cell.dataset.montant) || 0;
        await DB.insert('paiements', {
          eleve_id: eleveId, montant, mode_paiement: 'Espèces',
          observation: 'Grille comptable — batch',
          date_paiement: dateISO,
          caissier_id: caissierId, caissier_nom: caissierNom,
          annule: false, tranche_id: trancheId, tranche_label: trancheLabel
        });
        nbAjoutes++;
      }

      // Annuler les paiements décochés
      for (const cell of cellsCancel) {
        const payId = cell.dataset.payId;
        if (payId) {
          await DB.update('paiements', payId, { annule: true });
          nbAnnules++;
        }
      }

      Toast.success(`✅ Grille enregistrée : ${nbAjoutes} paiement(s) ajouté(s), ${nbAnnules} annulé(s).`);
      Pages._grilleModifiee = false;
      DB._cache = {}; DB._cacheExpiry = {};
      Pages.grillePaiements();
    } catch(err) {
      Toast.error('Erreur : ' + err.message);
      Debounce.release(btn, '💾 Enregistrer la grille');
    }
  },

  // Export Excel grille paiements
  async _exportGrilleXlsx() {
    const { classes, eleves, paysValides, configsSco } = this._grilleData || {};
    if (!classes) { Toast.error('Chargez la grille d\'abord.'); return; }
    const MOIS = ['Oct','Nov','Déc','Jan','Fév','Mar','Avr','Mai','Juin'];
    const headers = ['Élève', 'Matricule', 'Classe', ...MOIS, 'Total payé', 'Statut'];
    const rows = [];
    for (const cls of classes) {
      const elevesClasse = (eleves||[]).filter(e => e.classe_id === cls.id);
      const cfg = configsSco.find(c => c.niveau === cls.niveau);
      const total = parseFloat(cfg?.montant_annuel || 0);
      let echeancesRef = [];
      try { if (elevesClasse[0]) echeancesRef = await DB.getEcheances(cls.id, elevesClasse[0].id); } catch {}
      const trancheToMois = {};
      echeancesRef.forEach((ech, idx) => { trancheToMois[ech.id] = idx; });
      for (const e of elevesClasse.sort((a,b) => a.nom.localeCompare(b.nom))) {
        const pays = (paysValides||[]).filter(p => p.eleve_id === e.id);
        const totalPaye = pays.reduce((s,p) => s+parseFloat(p.montant||0), 0);
        const statut = totalPaye >= total && total > 0 ? 'Soldé' : totalPaye > 0 ? 'En cours' : 'Non payé';
        const moisMonts = MOIS.map((_, mIdx) => {
          return pays.filter(p => {
            if (p.tranche_id && trancheToMois[p.tranche_id] !== undefined) return trancheToMois[p.tranche_id] === mIdx;
            const m = (p.tranche_label||'').match(/(\d+)/); return m && parseInt(m[1])-1 === mIdx;
          }).reduce((s,p) => s+parseFloat(p.montant||0), 0) || 0;
        });
        rows.push([`${e.prenom} ${e.nom}`, e.matricule||'', cls.nom, ...moisMonts, totalPaye, statut]);
      }
    }
    Export.toXLSX(headers, rows, `grille-paiements-${new Date().toISOString().split('T')[0]}.xlsx`);
  },

  _filterGrille() {
    const val = document.getElementById('grille-classe-filter')?.value;
    document.querySelectorAll('.grille-classe-block').forEach(el => {
      el.style.display = (!val || el.dataset.classe === val) ? 'block' : 'none';
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE COMPTABILITÉ — Caisse, Journal de Banque, Transferts
// ═══════════════════════════════════════════════════════════════════════════════
const ComptaModule = {

  // ── État interne ─────────────────────────────────────────────────────────────
  _tab: 'dashboard',   // dashboard | caisse | banque | config
  _devise: 'GNF',
  _config: null,

  // ── Point d'entrée principal ──────────────────────────────────────────────
  async render() {
    setLoading('Chargement de la comptabilité…');
    try {
      const cfg = await DB.getEcoleConfig();
      this._devise = cfg?.devise || 'GNF';
      await this._loadConfig();
    } catch(e) { console.warn('ComptaModule init:', e); }
    this._renderShell();
    await this._renderTab(this._tab);
  },

  // ── Chargement config soldes initiaux ────────────────────────────────────
  async _loadConfig() {
    try {
      const rows = await DB.getAll('comptabilite_config', 10);
      this._config = rows[0] || null;
    } catch { this._config = null; }
  },

  // ── Shell principal avec onglets ──────────────────────────────────────────
  _renderShell() {
    const tabs = [
      { id: 'dashboard', icon: 'fa-gauge-high',    label: 'Tableau de bord' },
      { id: 'caisse',    icon: 'fa-cash-register', label: 'Caisse (Espèces)' },
      { id: 'banque',    icon: 'fa-building-columns', label: 'Journal de Banque' },
      { id: 'config',    icon: 'fa-sliders',        label: 'Paramètres' },
    ];
    setContent(`
      <div class="compta-shell">
        <div class="compta-header">
          <div class="compta-header-left">
            <div class="compta-header-icon"><i class="fa-solid fa-calculator"></i></div>
            <div>
              <h2 class="compta-title">Comptabilité & Trésorerie</h2>
              <p class="compta-subtitle">Caisse espèces · Journal de Banque · Transferts</p>
            </div>
          </div>
        </div>
        <nav class="compta-tabs">
          ${tabs.map(t => `
            <button class="compta-tab ${this._tab===t.id?'active':''}" onclick="ComptaModule._switchTab('${t.id}')">
              <i class="fa-solid ${t.icon}"></i> ${t.label}
            </button>`).join('')}
        </nav>
        <div id="compta-content" class="compta-content">
          <div class="compta-loading"><div class="loading-spinner"></div> Chargement…</div>
        </div>
      </div>
    `);
  },

  async _switchTab(tabId) {
    this._tab = tabId;
    // Mettre à jour l'état actif des onglets
    document.querySelectorAll('.compta-tab').forEach(b => {
      b.classList.toggle('active', b.textContent.trim().includes(
        {dashboard:'Tableau',caisse:'Caisse',banque:'Journal',config:'Paramèt'}[tabId]||tabId
      ));
    });
    document.querySelectorAll('.compta-tab').forEach((b,i) => {
      const ids = ['dashboard','caisse','banque','config'];
      b.classList.toggle('active', ids[i] === tabId);
    });
    const cc = document.getElementById('compta-content');
    if (cc) cc.innerHTML = '<div class="compta-loading"><div class="loading-spinner"></div> Chargement…</div>';
    await this._renderTab(tabId);
  },

  async _renderTab(tabId) {
    await this._loadConfig();
    if (tabId === 'dashboard') await this._renderDashboard();
    else if (tabId === 'caisse') await this._renderCaisse();
    else if (tabId === 'banque') await this._renderBanque();
    else if (tabId === 'config') await this._renderConfig();
  },

  // ── Formatage monnaie ────────────────────────────────────────────────────
  _fmt(v) {
    return parseFloat(v||0).toLocaleString('fr-FR') + ' ' + this._devise;
  },
  _date(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' });
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TABLEAU DE BORD FINANCIER
  // ═══════════════════════════════════════════════════════════════════════════
  async _renderDashboard() {
    const [caisse, banque] = await Promise.all([
      DB.getAll('comptabilite_caisse', 1000),
      DB.getAll('comptabilite_banque', 1000)
    ]);
    const cfg = this._config;

    // ── Calculs Caisse ──
    const soldInitCaisse = parseFloat(cfg?.solde_initial_caisse || 0);
    const totalEncaissCaisse = caisse.filter(e => e.type === 'encaissement').reduce((s,e) => s+parseFloat(e.montant||0), 0);
    const totalDepCaisse     = caisse.filter(e => e.type === 'depense').reduce((s,e) => s+parseFloat(e.montant||0), 0);
    const totalTransfCaisse  = caisse.filter(e => e.type === 'transfert_sortie').reduce((s,e) => s+parseFloat(e.montant||0), 0);
    const soldeCaisse = soldInitCaisse + totalEncaissCaisse - totalDepCaisse - totalTransfCaisse;

    // ── Calculs Banque ──
    const soldInitBanque = parseFloat(cfg?.solde_initial_banque || 0);
    const totalEntreesBanque  = banque.filter(e => e.type === 'entree' || e.type === 'transfert_entree').reduce((s,e) => s+parseFloat(e.montant||0), 0);
    const totalSortiesBanque  = banque.filter(e => e.type === 'sortie').reduce((s,e) => s+parseFloat(e.montant||0), 0);
    const soldeBanque = soldInitBanque + totalEntreesBanque - totalSortiesBanque;

    // ── Récents (30 jours) ──
    const now = Date.now();
    const ms30 = 30*24*3600*1000;
    const recentCaisse = caisse.filter(e => (now - new Date(e.date_ecriture||e.created_at)) < ms30);
    const recentBanque = banque.filter(e => (now - new Date(e.date_ecriture||e.created_at)) < ms30);
    const benCaisse30  = recentCaisse.filter(e=>e.type==='encaissement').reduce((s,e)=>s+parseFloat(e.montant||0),0)
                       - recentCaisse.filter(e=>e.type==='depense').reduce((s,e)=>s+parseFloat(e.montant||0),0);
    const benBanque30  = recentBanque.filter(e=>e.type==='entree'||e.type==='transfert_entree').reduce((s,e)=>s+parseFloat(e.montant||0),0)
                       - recentBanque.filter(e=>e.type==='sortie').reduce((s,e)=>s+parseFloat(e.montant||0),0);

    // ── Dernières écritures (toutes, triées) ──
    const allMouvements = [
      ...caisse.map(e => ({ ...e, _source: 'caisse' })),
      ...banque.map(e => ({ ...e, _source: 'banque' }))
    ].sort((a,b) => new Date(b.date_ecriture||b.created_at) - new Date(a.date_ecriture||a.created_at)).slice(0,12);

    const cc = document.getElementById('compta-content');
    if (!cc) return;
    cc.innerHTML = `
      <!-- KPI Cards -->
      <div class="compta-kpi-grid">
        <div class="compta-kpi-card caisse">
          <div class="compta-kpi-icon"><i class="fa-solid fa-cash-register"></i></div>
          <div class="compta-kpi-body">
            <div class="compta-kpi-label">Solde Caisse (Espèces)</div>
            <div class="compta-kpi-value ${soldeCaisse<0?'negative':''}">${this._fmt(soldeCaisse)}</div>
            <div class="compta-kpi-sub">Solde initial : ${this._fmt(soldInitCaisse)}</div>
          </div>
        </div>
        <div class="compta-kpi-card banque">
          <div class="compta-kpi-icon"><i class="fa-solid fa-building-columns"></i></div>
          <div class="compta-kpi-body">
            <div class="compta-kpi-label">Solde Banque</div>
            <div class="compta-kpi-value ${soldeBanque<0?'negative':''}">${this._fmt(soldeBanque)}</div>
            <div class="compta-kpi-sub">Solde initial : ${this._fmt(soldInitBanque)}</div>
          </div>
        </div>
        <div class="compta-kpi-card entrees">
          <div class="compta-kpi-icon"><i class="fa-solid fa-arrow-trend-up"></i></div>
          <div class="compta-kpi-body">
            <div class="compta-kpi-label">Total Entrées (Banque)</div>
            <div class="compta-kpi-value">${this._fmt(totalEntreesBanque)}</div>
            <div class="compta-kpi-sub">Dont ${banque.filter(e=>e.type==='transfert_entree').length} transfert(s) caisse</div>
          </div>
        </div>
        <div class="compta-kpi-card sorties">
          <div class="compta-kpi-icon"><i class="fa-solid fa-arrow-trend-down"></i></div>
          <div class="compta-kpi-body">
            <div class="compta-kpi-label">Total Sorties (Banque)</div>
            <div class="compta-kpi-value">${this._fmt(totalSortiesBanque)}</div>
            <div class="compta-kpi-sub">Dépenses caisse : ${this._fmt(totalDepCaisse)}</div>
          </div>
        </div>
      </div>

      <!-- Bénéfice 30 jours -->
      <div class="compta-row-2">
        <div class="compta-card">
          <div class="compta-card-header">
            <div class="compta-card-title"><i class="fa-solid fa-chart-line"></i> Résultats des 30 derniers jours</div>
          </div>
          <div class="compta-card-body">
            <div class="compta-ben-row">
              <div class="compta-ben-item ${benCaisse30>=0?'pos':'neg'}">
                <i class="fa-solid fa-cash-register"></i>
                <div>
                  <div style="font-size:.78rem;font-weight:600;text-transform:uppercase;opacity:.7">Caisse — Résultat net</div>
                  <div style="font-size:1.25rem;font-weight:800">${this._fmt(benCaisse30)}</div>
                </div>
              </div>
              <div class="compta-ben-item ${benBanque30>=0?'pos':'neg'}">
                <i class="fa-solid fa-building-columns"></i>
                <div>
                  <div style="font-size:.78rem;font-weight:600;text-transform:uppercase;opacity:.7">Banque — Résultat net</div>
                  <div style="font-size:1.25rem;font-weight:800">${this._fmt(benBanque30)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="compta-card">
          <div class="compta-card-header">
            <div class="compta-card-title"><i class="fa-solid fa-bolt"></i> Actions rapides</div>
          </div>
          <div class="compta-card-body">
            <div class="compta-quick-actions">
              <button class="compta-quick-btn encaissement" onclick="ComptaModule._openForm('encaissement','caisse')">
                <i class="fa-solid fa-plus-circle"></i><span>Encaissement<br><small>Caisse</small></span>
              </button>
              <button class="compta-quick-btn depense" onclick="ComptaModule._openForm('depense','caisse')">
                <i class="fa-solid fa-minus-circle"></i><span>Dépense<br><small>Caisse</small></span>
              </button>
              <button class="compta-quick-btn entree" onclick="ComptaModule._openForm('entree','banque')">
                <i class="fa-solid fa-arrow-down-to-line"></i><span>Entrée<br><small>Banque</small></span>
              </button>
              <button class="compta-quick-btn sortie" onclick="ComptaModule._openForm('sortie','banque')">
                <i class="fa-solid fa-arrow-up-from-line"></i><span>Dépense<br><small>Banque</small></span>
              </button>
              <button class="compta-quick-btn transfert" onclick="ComptaModule._openTransfert()">
                <i class="fa-solid fa-right-left"></i><span>Transfert<br><small>Caisse→Banque</small></span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Journal des mouvements récents -->
      <div class="compta-card">
        <div class="compta-card-header">
          <div class="compta-card-title"><i class="fa-solid fa-list-check"></i> Derniers mouvements</div>
          <div style="display:flex;gap:.5rem">
            <button class="compta-btn outline sm" onclick="ComptaModule._switchTab('caisse')"><i class="fa-solid fa-cash-register"></i> Caisse</button>
            <button class="compta-btn outline sm" onclick="ComptaModule._switchTab('banque')"><i class="fa-solid fa-building-columns"></i> Banque</button>
          </div>
        </div>
        <div class="compta-table-wrap">
          ${allMouvements.length === 0 ? `
            <div class="compta-empty">
              <i class="fa-solid fa-inbox"></i>
              <p>Aucun mouvement enregistré</p>
              <button class="compta-btn primary" onclick="ComptaModule._openForm('encaissement','caisse')">
                <i class="fa-solid fa-plus"></i> Enregistrer une écriture
              </button>
            </div>` : `
          <table class="compta-table">
            <thead><tr><th>Date</th><th>Source</th><th>Type</th><th>Libellé</th><th>Montant</th></tr></thead>
            <tbody>
              ${allMouvements.map(e => {
                const isEntree = ['encaissement','entree','transfert_entree'].includes(e.type);
                const sourceBadge = e._source === 'caisse'
                  ? '<span class="compta-source-badge caisse"><i class="fa-solid fa-cash-register"></i> Caisse</span>'
                  : '<span class="compta-source-badge banque"><i class="fa-solid fa-building-columns"></i> Banque</span>';
                const typeLabel = {encaissement:'Encaissement',depense:'Dépense',transfert_sortie:'Transfert sortant',entree:'Entrée',sortie:'Sortie',transfert_entree:'Transfert reçu'}[e.type]||e.type;
                return `<tr>
                  <td style="white-space:nowrap">${this._date(e.date_ecriture||e.created_at)}</td>
                  <td>${sourceBadge}</td>
                  <td><span class="compta-type-badge ${isEntree?'entree':'sortie'}">${typeLabel}</span></td>
                  <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.libelle||'—'}</td>
                  <td style="font-weight:700;color:${isEntree?'#1b5e20':'#b71c1c'};white-space:nowrap">${isEntree?'+':'−'}${this._fmt(e.montant)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`}
        </div>
      </div>
    `;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CAISSE ESPÈCES
  // ═══════════════════════════════════════════════════════════════════════════
  async _renderCaisse() {
    const ecritures = (await DB.getAll('comptabilite_caisse', 1000))
      .sort((a,b) => new Date(b.date_ecriture||b.created_at) - new Date(a.date_ecriture||a.created_at));
    const cfg = this._config;
    const soldInit = parseFloat(cfg?.solde_initial_caisse || 0);
    const totalEncaiss = ecritures.filter(e=>e.type==='encaissement').reduce((s,e)=>s+parseFloat(e.montant||0),0);
    const totalDep     = ecritures.filter(e=>e.type==='depense').reduce((s,e)=>s+parseFloat(e.montant||0),0);
    const totalTransf  = ecritures.filter(e=>e.type==='transfert_sortie').reduce((s,e)=>s+parseFloat(e.montant||0),0);
    const solde = soldInit + totalEncaiss - totalDep - totalTransf;

    const cc = document.getElementById('compta-content');
    if (!cc) return;
    cc.innerHTML = `
      <div class="compta-page-header">
        <div>
          <h3><i class="fa-solid fa-cash-register"></i> Caisse — Espèces</h3>
          <p>Solde actuel : <strong class="compta-solde ${solde<0?'neg':'pos'}">${this._fmt(solde)}</strong>
            <span style="color:#8892b0;font-size:.8rem;margin-left:.5rem">(Initial: ${this._fmt(soldInit)})</span>
          </p>
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          <button class="compta-btn success" onclick="ComptaModule._openForm('encaissement','caisse')">
            <i class="fa-solid fa-plus"></i> Encaissement
          </button>
          <button class="compta-btn danger" onclick="ComptaModule._openForm('depense','caisse')">
            <i class="fa-solid fa-minus"></i> Dépense
          </button>
          <button class="compta-btn primary" onclick="ComptaModule._openTransfert()">
            <i class="fa-solid fa-right-left"></i> Transfert vers banque
          </button>
        </div>
      </div>

      <div class="compta-kpi-grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="compta-kpi-card caisse">
          <div class="compta-kpi-icon"><i class="fa-solid fa-wallet"></i></div>
          <div class="compta-kpi-body">
            <div class="compta-kpi-label">Solde Caisse</div>
            <div class="compta-kpi-value ${solde<0?'negative':''}">${this._fmt(solde)}</div>
          </div>
        </div>
        <div class="compta-kpi-card entrees">
          <div class="compta-kpi-icon"><i class="fa-solid fa-arrow-down"></i></div>
          <div class="compta-kpi-body">
            <div class="compta-kpi-label">Total Encaissements</div>
            <div class="compta-kpi-value">${this._fmt(totalEncaiss)}</div>
          </div>
        </div>
        <div class="compta-kpi-card sorties">
          <div class="compta-kpi-icon"><i class="fa-solid fa-arrow-up"></i></div>
          <div class="compta-kpi-body">
            <div class="compta-kpi-label">Total Dépenses + Transferts</div>
            <div class="compta-kpi-value">${this._fmt(totalDep+totalTransf)}</div>
          </div>
        </div>
      </div>

      <div class="compta-card">
        <div class="compta-card-header">
          <div class="compta-card-title"><i class="fa-solid fa-book-open"></i> Journal de Caisse</div>
          <span style="font-size:.8rem;color:#8892b0">${ecritures.length} écriture(s)</span>
        </div>
        <div class="compta-table-wrap">
          ${ecritures.length === 0 ? `<div class="compta-empty"><i class="fa-solid fa-inbox"></i><p>Aucune écriture en caisse</p></div>` : `
          <table class="compta-table">
            <thead>
              <tr><th>Date</th><th>Type</th><th>Libellé</th><th>Référence</th><th>Catégorie</th><th style="text-align:right">Montant</th><th></th></tr>
            </thead>
            <tbody>
              ${ecritures.map(e => {
                const isEntree = e.type === 'encaissement';
                const isTransf = e.type === 'transfert_sortie';
                const typeLabel = {encaissement:'Encaissement',depense:'Dépense',transfert_sortie:'Transfert → Banque'}[e.type]||e.type;
                return `<tr>
                  <td style="white-space:nowrap">${this._date(e.date_ecriture||e.created_at)}</td>
                  <td><span class="compta-type-badge ${isEntree?'entree':isTransf?'transfert':'sortie'}">${typeLabel}</span></td>
                  <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${e.libelle||''}">${e.libelle||'—'}</td>
                  <td style="font-size:.8rem;color:#8892b0;white-space:nowrap">${e.reference||'—'}</td>
                  <td style="font-size:.8rem;color:#8892b0">${e.categorie||'—'}</td>
                  <td style="text-align:right;font-weight:700;color:${isEntree?'#1b5e20':'#b71c1c'};white-space:nowrap">${isEntree?'+':'−'}${this._fmt(e.montant)}</td>
                  <td>
                    <button class="compta-icon-btn danger" onclick="ComptaModule._deleteEcriture('${e.id}','comptabilite_caisse')" title="Supprimer">
                      <i class="fa-solid fa-trash"></i>
                    </button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`}
        </div>
      </div>
    `;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // JOURNAL DE BANQUE
  // ═══════════════════════════════════════════════════════════════════════════
  async _renderBanque() {
    const ecritures = (await DB.getAll('comptabilite_banque', 1000))
      .sort((a,b) => new Date(b.date_ecriture||b.created_at) - new Date(a.date_ecriture||a.created_at));
    const cfg = this._config;
    const soldInit    = parseFloat(cfg?.solde_initial_banque || 0);
    const totalEntrees = ecritures.filter(e=>e.type==='entree'||e.type==='transfert_entree').reduce((s,e)=>s+parseFloat(e.montant||0),0);
    const totalSorties = ecritures.filter(e=>e.type==='sortie').reduce((s,e)=>s+parseFloat(e.montant||0),0);
    const soldeCourant = soldInit + totalEntrees - totalSorties;
    const benefRecent  = ecritures.slice(0, 20).filter(e=>e.type==='entree'||e.type==='transfert_entree').reduce((s,e)=>s+parseFloat(e.montant||0),0)
                       - ecritures.slice(0, 20).filter(e=>e.type==='sortie').reduce((s,e)=>s+parseFloat(e.montant||0),0);

    const cc = document.getElementById('compta-content');
    if (!cc) return;
    cc.innerHTML = `
      <div class="compta-page-header">
        <div>
          <h3><i class="fa-solid fa-building-columns"></i> Journal de Banque</h3>
          <p>Solde : <strong class="compta-solde ${soldeCourant<0?'neg':'pos'}">${this._fmt(soldeCourant)}</strong>
            <span class="compta-solde-formula">= ${this._fmt(soldInit)} + ${this._fmt(totalEntrees)} − ${this._fmt(totalSorties)}</span>
          </p>
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          <button class="compta-btn success" onclick="ComptaModule._openForm('entree','banque')">
            <i class="fa-solid fa-plus"></i> Entrée
          </button>
          <button class="compta-btn danger" onclick="ComptaModule._openForm('sortie','banque')">
            <i class="fa-solid fa-minus"></i> Dépense
          </button>
        </div>
      </div>

      <!-- KPI Banque avec formule -->
      <div class="compta-banque-solde-box">
        <div class="compta-banque-formula">
          <div class="compta-formula-item initial">
            <div class="compta-formula-val">${this._fmt(soldInit)}</div>
            <div class="compta-formula-lbl"><i class="fa-solid fa-flag"></i> Solde Initial</div>
          </div>
          <span class="compta-formula-op">+</span>
          <div class="compta-formula-item entrees">
            <div class="compta-formula-val">${this._fmt(totalEntrees)}</div>
            <div class="compta-formula-lbl"><i class="fa-solid fa-arrow-down"></i> Total Entrées</div>
          </div>
          <span class="compta-formula-op">−</span>
          <div class="compta-formula-item sorties">
            <div class="compta-formula-val">${this._fmt(totalSorties)}</div>
            <div class="compta-formula-lbl"><i class="fa-solid fa-arrow-up"></i> Total Sorties</div>
          </div>
          <span class="compta-formula-op">=</span>
          <div class="compta-formula-item total ${soldeCourant<0?'negative':''}">
            <div class="compta-formula-val">${this._fmt(soldeCourant)}</div>
            <div class="compta-formula-lbl"><i class="fa-solid fa-equals"></i> Solde Global Total</div>
          </div>
        </div>
        <div class="compta-benefice-recent ${benefRecent>=0?'pos':'neg'}">
          <i class="fa-solid fa-chart-line"></i>
          <span>Bénéfice récent (20 dernières écritures) : <strong>${benefRecent>=0?'+':''}${this._fmt(benefRecent)}</strong></span>
        </div>
      </div>

      <div class="compta-card">
        <div class="compta-card-header">
          <div class="compta-card-title"><i class="fa-solid fa-book-open"></i> Écritures Bancaires</div>
          <span style="font-size:.8rem;color:#8892b0">${ecritures.length} écriture(s)</span>
        </div>
        <div class="compta-table-wrap">
          ${ecritures.length === 0 ? `<div class="compta-empty"><i class="fa-solid fa-inbox"></i><p>Aucune écriture bancaire. <br>Commencez par configurer votre solde initial dans "Paramètres".</p></div>` : `
          <table class="compta-table">
            <thead>
              <tr><th>Date</th><th>Type</th><th>Libellé</th><th>Référence</th><th>Catégorie</th><th style="text-align:right">Montant</th><th style="text-align:right">Solde progressif</th><th></th></tr>
            </thead>
            <tbody>
              ${(() => {
                let soldeRunning = soldInit;
                // Construire du plus ancien au plus récent pour le solde progressif
                const sorted = [...ecritures].reverse();
                const rows = sorted.map(e => {
                  const isEntree = e.type === 'entree' || e.type === 'transfert_entree';
                  const delta = parseFloat(e.montant||0) * (isEntree ? 1 : -1);
                  soldeRunning += delta;
                  const soldeRow = soldeRunning;
                  const typeLabel = {entree:'Entrée',sortie:'Sortie',transfert_entree:'Transfert reçu'}[e.type]||e.type;
                  return `<tr>
                    <td style="white-space:nowrap">${this._date(e.date_ecriture||e.created_at)}</td>
                    <td><span class="compta-type-badge ${isEntree?'entree':'sortie'}">${typeLabel}</span></td>
                    <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${e.libelle||''}">${e.libelle||'—'}</td>
                    <td style="font-size:.8rem;color:#8892b0;white-space:nowrap">${e.reference||'—'}</td>
                    <td style="font-size:.8rem;color:#8892b0">${e.categorie||'—'}</td>
                    <td style="text-align:right;font-weight:700;color:${isEntree?'#1b5e20':'#b71c1c'};white-space:nowrap">${isEntree?'+':'−'}${this._fmt(e.montant)}</td>
                    <td style="text-align:right;font-weight:600;color:${soldeRow<0?'#b71c1c':'#1b5e20'};white-space:nowrap">${this._fmt(soldeRow)}</td>
                    <td>
                      <button class="compta-icon-btn danger" onclick="ComptaModule._deleteEcriture('${e.id}','comptabilite_banque')" title="Supprimer">
                        <i class="fa-solid fa-trash"></i>
                      </button>
                    </td>
                  </tr>`;
                });
                // Afficher du plus récent au plus ancien (déjà trié)
                return rows.reverse().join('');
              })()}
            </tbody>
          </table>`}
        </div>
      </div>
    `;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PARAMÈTRES — Soldes initiaux
  // ═══════════════════════════════════════════════════════════════════════════
  async _renderConfig() {
    const cfg = this._config;
    const cc = document.getElementById('compta-content');
    if (!cc) return;
    cc.innerHTML = `
      <div class="compta-page-header">
        <div>
          <h3><i class="fa-solid fa-sliders"></i> Paramètres Comptables</h3>
          <p>Configurez les soldes de départ pour cet exercice scolaire</p>
        </div>
      </div>

      <div class="compta-card" style="max-width:640px">
        <div class="compta-card-header">
          <div class="compta-card-title"><i class="fa-solid fa-flag"></i> Soldes Initiaux de l'Exercice</div>
        </div>
        <div class="compta-card-body">
          <div class="compta-alert info">
            <i class="fa-solid fa-circle-info"></i>
            <div>Le <strong>solde initial</strong> représente le montant déjà présent en caisse ou en banque <em>avant</em> de commencer à enregistrer les écritures. Il sert de point de départ pour le calcul de tous les soldes.</div>
          </div>
          <form onsubmit="event.preventDefault();ComptaModule._saveConfig()">
            <div class="compta-form-grid">
              <div class="compta-field">
                <label class="compta-label"><i class="fa-solid fa-cash-register"></i> Solde Initial Caisse</label>
                <input type="number" class="compta-control" id="cfg-solde-caisse" value="${cfg?.solde_initial_caisse||0}" min="0" step="any" placeholder="Ex: 500000">
                <div class="compta-hint">Montant en espèces déjà en caisse au démarrage</div>
              </div>
              <div class="compta-field">
                <label class="compta-label"><i class="fa-solid fa-building-columns"></i> Solde Initial Banque</label>
                <input type="number" class="compta-control" id="cfg-solde-banque" value="${cfg?.solde_initial_banque||0}" min="0" step="any" placeholder="Ex: 2000000">
                <div class="compta-hint">Montant déjà présent sur le compte bancaire</div>
              </div>
              <div class="compta-field">
                <label class="compta-label"><i class="fa-solid fa-calendar"></i> Début d'exercice</label>
                <input type="date" class="compta-control" id="cfg-date-debut" value="${cfg?.date_debut_exercice||new Date().toISOString().split('T')[0]}">
              </div>
              <div class="compta-field">
                <label class="compta-label"><i class="fa-solid fa-graduation-cap"></i> Année Scolaire</label>
                <input type="text" class="compta-control" id="cfg-annee" value="${cfg?.annee_scolaire||'2024-2025'}" placeholder="Ex: 2024-2025">
              </div>
            </div>
            <div style="margin-top:1.25rem;display:flex;gap:.75rem">
              <button type="submit" class="compta-btn primary">
                <i class="fa-solid fa-floppy-disk"></i> Enregistrer les paramètres
              </button>
              ${cfg ? `<button type="button" class="compta-btn outline" onclick="ComptaModule._switchTab('dashboard')">
                <i class="fa-solid fa-arrow-left"></i> Retour au tableau de bord
              </button>` : ''}
            </div>
          </form>
        </div>
      </div>

      ${cfg ? `
      <div class="compta-card" style="max-width:640px;margin-top:1rem;border-color:#ffd54f;background:#fffde7">
        <div class="compta-card-header" style="border-bottom-color:#ffd54f">
          <div class="compta-card-title" style="color:#f57f17"><i class="fa-solid fa-triangle-exclamation"></i> Zone de réinitialisation</div>
        </div>
        <div class="compta-card-body">
          <p style="font-size:.85rem;color:#6d4c41">La réinitialisation supprime <strong>toutes les écritures</strong> de caisse et de banque. Cette action est irréversible.</p>
          <button class="compta-btn danger" onclick="ComptaModule._resetExercice()" style="margin-top:.75rem">
            <i class="fa-solid fa-rotate-left"></i> Réinitialiser l'exercice
          </button>
        </div>
      </div>` : ''}
    `;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FORMULAIRES D'ÉCRITURE
  // ═══════════════════════════════════════════════════════════════════════════
  _openForm(type, source) {
    const titles = {
      encaissement: 'Enregistrer un Encaissement (Caisse)',
      depense:      'Enregistrer une Dépense (Caisse)',
      entree:       'Enregistrer une Entrée (Banque)',
      sortie:       'Enregistrer une Dépense (Banque)'
    };
    const cats = {
      encaissement: ['scolarite','inscription','don','subvention','autre'],
      depense:      ['fournitures','salaire','entretien','restauration','transport','autre'],
      entree:       ['scolarite','inscription','subvention','virement','autre'],
      sortie:       ['salaire','charges','maintenance','equipement','autre']
    };
    const catOpts = (cats[type]||['autre']).map(c =>
      `<option value="${c}">${c.charAt(0).toUpperCase()+c.slice(1).replace('_',' ')}</option>`).join('');

    Modal.open(titles[type]||'Nouvelle écriture', `
      <form id="compta-form" onsubmit="event.preventDefault();ComptaModule._saveEcriture('${type}','${source}')">
        <div class="compta-form-grid">
          <div class="compta-field" style="grid-column:1/-1">
            <label class="compta-label">Libellé / Description <span class="req">*</span></label>
            <input type="text" class="compta-control" id="cf-libelle" placeholder="${type==='encaissement'?'Ex: Paiement scolarité — Diallo Mamadou':type==='depense'||type==='sortie'?'Ex: Achat fournitures de bureau':'Ex: Virement reçu école ABC'}" required>
          </div>
          <div class="compta-field">
            <label class="compta-label">Montant <span class="req">*</span></label>
            <input type="number" class="compta-control" id="cf-montant" min="1" step="any" placeholder="0" required>
          </div>
          <div class="compta-field">
            <label class="compta-label">Date <span class="req">*</span></label>
            <input type="date" class="compta-control" id="cf-date" value="${new Date().toISOString().split('T')[0]}" required>
          </div>
          <div class="compta-field">
            <label class="compta-label">Catégorie</label>
            <select class="compta-control" id="cf-categorie">${catOpts}</select>
          </div>
          <div class="compta-field">
            <label class="compta-label">Référence / N° pièce</label>
            <input type="text" class="compta-control" id="cf-reference" placeholder="Ex: Reçu-001">
          </div>
          <div class="compta-field" style="grid-column:1/-1">
            <label class="compta-label">Notes</label>
            <textarea class="compta-control" id="cf-notes" rows="2" placeholder="Informations complémentaires…"></textarea>
          </div>
        </div>
        <div style="margin-top:1rem;display:flex;gap:.75rem;justify-content:flex-end">
          <button type="button" class="compta-btn outline" onclick="Modal.close()">Annuler</button>
          <button type="submit" class="compta-btn ${type==='encaissement'||type==='entree'?'success':'danger'}">
            <i class="fa-solid fa-floppy-disk"></i> Enregistrer
          </button>
        </div>
      </form>
    `);
  },

  async _saveEcriture(type, source) {
    const libelle   = document.getElementById('cf-libelle')?.value.trim();
    const montant   = parseFloat(document.getElementById('cf-montant')?.value);
    const date      = document.getElementById('cf-date')?.value;
    const categorie = document.getElementById('cf-categorie')?.value || 'autre';
    const reference = document.getElementById('cf-reference')?.value.trim();
    const notes     = document.getElementById('cf-notes')?.value.trim();

    if (!libelle || !montant || montant <= 0 || !date) {
      Toast.warning('Remplissez le libellé, le montant et la date.');
      return;
    }
    const table = source === 'caisse' ? 'comptabilite_caisse' : 'comptabilite_banque';
    try {
      await DB.insert(table, { type, libelle, montant, date_ecriture: date, categorie, reference, notes });
      Modal.close();
      Toast.success('Écriture enregistrée !');
      await this._switchTab(this._tab === 'dashboard' ? 'dashboard' : source);
    } catch(err) {
      Toast.error('Erreur : ' + err.message);
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSFERT CAISSE → BANQUE
  // ═══════════════════════════════════════════════════════════════════════════
  _openTransfert() {
    Modal.open('<i class="fa-solid fa-right-left"></i> Transfert Caisse → Banque', `
      <div class="compta-alert info" style="margin-bottom:1rem">
        <i class="fa-solid fa-circle-info"></i>
        <div>Le montant sera <strong>déduit de la caisse</strong> et <strong>ajouté automatiquement au journal de banque</strong>.</div>
      </div>
      <form onsubmit="event.preventDefault();ComptaModule._saveTransfert()">
        <div class="compta-field">
          <label class="compta-label">Montant du transfert <span class="req">*</span></label>
          <input type="number" class="compta-control" id="tr-montant" min="1" step="any" placeholder="0" required>
        </div>
        <div class="compta-field">
          <label class="compta-label">Date du transfert</label>
          <input type="date" class="compta-control" id="tr-date" value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="compta-field">
          <label class="compta-label">Libellé</label>
          <input type="text" class="compta-control" id="tr-libelle" value="Versement caisse en banque">
        </div>
        <div class="compta-field">
          <label class="compta-label">Référence</label>
          <input type="text" class="compta-control" id="tr-ref" placeholder="N° de versement">
        </div>
        <div style="margin-top:1rem;display:flex;gap:.75rem;justify-content:flex-end">
          <button type="button" class="compta-btn outline" onclick="Modal.close()">Annuler</button>
          <button type="submit" class="compta-btn primary">
            <i class="fa-solid fa-right-left"></i> Effectuer le transfert
          </button>
        </div>
      </form>
    `);
  },

  async _saveTransfert() {
    const montant = parseFloat(document.getElementById('tr-montant')?.value);
    const date    = document.getElementById('tr-date')?.value || new Date().toISOString().split('T')[0];
    const libelle = document.getElementById('tr-libelle')?.value.trim() || 'Versement caisse en banque';
    const ref     = document.getElementById('tr-ref')?.value.trim();

    if (!montant || montant <= 0) { Toast.warning('Montant invalide.'); return; }

    try {
      // 1. Sortie caisse
      await DB.insert('comptabilite_caisse', {
        type: 'transfert_sortie', libelle, montant, date_ecriture: date,
        categorie: 'transfert', reference: ref, notes: 'Transfert automatique vers banque'
      });
      // 2. Entrée banque
      await DB.insert('comptabilite_banque', {
        type: 'transfert_entree', libelle, montant, date_ecriture: date,
        categorie: 'transfert', reference: ref, notes: 'Transfert automatique depuis caisse'
      });
      Modal.close();
      Toast.success(`Transfert de ${this._fmt(montant)} enregistré !`);
      await this._renderDashboard();
    } catch(err) {
      Toast.error('Erreur : ' + err.message);
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPPRESSION D'ÉCRITURE
  // ═══════════════════════════════════════════════════════════════════════════
  async _deleteEcriture(id, table) {
    if (!confirm('Supprimer cette écriture ? Cette action est irréversible.')) return;
    try {
      await DB.delete(table, id);
      Toast.success('Écriture supprimée.');
      const tab = table === 'comptabilite_caisse' ? 'caisse' : 'banque';
      await this._switchTab(tab);
    } catch(err) {
      Toast.error('Erreur : ' + err.message);
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SAUVEGARDE CONFIG
  // ═══════════════════════════════════════════════════════════════════════════
  async _saveConfig() {
    const soldeCaisse = parseFloat(document.getElementById('cfg-solde-caisse')?.value||0);
    const soldeBanque = parseFloat(document.getElementById('cfg-solde-banque')?.value||0);
    const dateDebut   = document.getElementById('cfg-date-debut')?.value;
    const annee       = document.getElementById('cfg-annee')?.value.trim();
    try {
      const devCfg = await DB.getEcoleConfig();
      const data = {
        solde_initial_caisse: soldeCaisse,
        solde_initial_banque: soldeBanque,
        date_debut_exercice:  dateDebut,
        annee_scolaire:       annee,
        devise:               devCfg?.devise || this._devise
      };
      if (this._config?.id) {
        await DB.update('comptabilite_config', this._config.id, data);
      } else {
        await DB.insert('comptabilite_config', { ...data, id: 'compta-config-main' });
      }
      await this._loadConfig();
      Toast.success('Paramètres enregistrés !');
      await this._switchTab('dashboard');
    } catch(err) {
      Toast.error('Erreur : ' + err.message);
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RÉINITIALISATION DE L'EXERCICE
  // ═══════════════════════════════════════════════════════════════════════════
  async _resetExercice() {
    if (!confirm('⚠️ Attention ! Cette action va supprimer TOUTES les écritures de caisse et de banque.\nLes soldes initiaux seront conservés.\n\nÊtes-vous absolument sûr ?')) return;
    if (!confirm('Dernière confirmation : supprimer définitivement toutes les écritures ?')) return;
    try {
      const [caisse, banque] = await Promise.all([
        DB.getAll('comptabilite_caisse', 2000),
        DB.getAll('comptabilite_banque', 2000)
      ]);
      for (const e of [...caisse, ...banque.map(e=>({...e,_t:'banque'}))]) {
        const t = e._t === 'banque' ? 'comptabilite_banque' : 'comptabilite_caisse';
        await DB.delete(t, e.id);
      }
      Toast.success('Exercice réinitialisé. Toutes les écritures ont été supprimées.');
      await this._switchTab('config');
    } catch(err) {
      Toast.error('Erreur lors de la réinitialisation : ' + err.message);
    }
  }
};
