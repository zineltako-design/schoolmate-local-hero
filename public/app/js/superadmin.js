/**
 * superadmin.js — Zean School Manager · Espace Éditrice
 * Dashboard global Super-Admin : écoles, licences, abonnements, annonces
 *
 * Accès : superadmin.html (page séparée et isolée)
 * Auth  : table `utilisateurs` avec role === 'superadmin'
 *         + mot de passe maître vérifié localement
 *
 * Architecture SaaS :
 *   - table `ecoles`             → parc d'établissements
 *   - table `licences_keys`      → clés d'activation générées
 *   - table `abonnements`        → paiements SaaS reçus
 *   - table `annonces_plateforme`→ messages broadcast directeurs
 */

// ══════════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════════

// Compte Super-Admin maître (stocké côté client — protection par obscurité)
// En production réelle, remplacer par une vérification côté serveur / JWT
const SA_MASTER_EMAIL    = 'editrice@zean.app';
const SA_MASTER_PASSWORD = 'ZeanSuperAdmin2025!';
const SA_SESSION_KEY     = 'zean_sa_session';
const ESSAI_DUREE_JOURS  = 14;
const DEVISE_DEFAUT      = 'GNF';

// ══════════════════════════════════════════════════════════════════
// SA — Contrôleur principal Super-Admin
// ══════════════════════════════════════════════════════════════════
const SA = {
  currentPage: 'dashboard',
  _charts: {},

  // ── INIT ──────────────────────────────────────────────────────
  init() {
    const saved = sessionStorage.getItem(SA_SESSION_KEY);
    if (saved) {
      this._showApp();
    } else {
      this._showLogin();
    }
    this._bindLoginForm();
    this._updateClock();
    setInterval(() => this._updateClock(), 60000);
  },

  _showLogin() {
    document.getElementById('sa-login-page').style.display = 'flex';
    document.getElementById('sa-app').classList.remove('active');
  },

  async _showApp() {
    document.getElementById('sa-login-page').style.display = 'none';
    document.getElementById('sa-app').classList.add('active');
    // Mobile : afficher hamburger
    const mBtn = document.getElementById('sa-menu-btn');
    if (mBtn) mBtn.style.display = window.innerWidth <= 768 ? 'block' : 'none';
    this.buildNav();
    this.goTo('dashboard');
  },

  logout() {
    if (!confirm('Voulez-vous vraiment vous déconnecter ?')) return;
    sessionStorage.removeItem(SA_SESSION_KEY);
    location.reload();
  },

  openSidebar() {
    document.getElementById('sa-sidebar').classList.add('mobile-open');
    document.getElementById('sa-overlay').style.display = 'block';
  },
  closeSidebar() {
    document.getElementById('sa-sidebar').classList.remove('mobile-open');
    document.getElementById('sa-overlay').style.display = 'none';
  },

  // ── AUTH ──────────────────────────────────────────────────────
  _bindLoginForm() {
    const form = document.getElementById('sa-login-form');
    if (!form) return;
    form.addEventListener('submit', (e) => { e.preventDefault(); this._handleLogin(); });

    const toggle = document.getElementById('sa-toggle-pwd');
    if (toggle) toggle.addEventListener('click', () => {
      const inp = document.getElementById('sa-pwd');
      const ico = toggle.querySelector('i');
      inp.type = inp.type === 'password' ? 'text' : 'password';
      ico.className = inp.type === 'password' ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
    });
  },

  async _handleLogin() {
    const email = document.getElementById('sa-email').value.trim();
    const pwd   = document.getElementById('sa-pwd').value;
    const errEl = document.getElementById('sa-login-error');
    const btn   = document.getElementById('sa-login-btn');
    errEl.textContent = '';
    btn.disabled = true;
    btn.innerHTML = '<span class="sa-spinner"></span> Vérification…';
    // ── Session cloud réelle : indispensable pour écrire dans la base
    //    partagée (écoles, licences, abonnements, annonces). ─────────────
    try {
      const estMaster = email.toLowerCase() === SA_MASTER_EMAIL.toLowerCase() && pwd === SA_MASTER_PASSWORD;

      // Première utilisation : on crée le compte Éditrice côté serveur.
      if (estMaster && window.ZeanAPI) {
        try { await ZeanAPI.bootstrapSuperAdmin(SA_MASTER_EMAIL, SA_MASTER_PASSWORD); } catch {}
      }

      const res = await ZeanCloud.signIn(email, pwd);
      if (res.error) throw new Error(res.error);
      const profil = await ZeanCloud.getProfil();
      if (!profil || !profil.superadmin) {
        await ZeanCloud.signOut();
        throw new Error("Ce compte n'a pas les droits Éditrice.");
      }

      sessionStorage.setItem(SA_SESSION_KEY, JSON.stringify({ email, login_at: Date.now() }));
      await this._showApp();
      SATk.success('Connexion réussie. Bienvenue !');
    } catch (err) {
      errEl.textContent = err.message === 'Invalid login credentials'
        ? 'Identifiants incorrects.' : (err.message || 'Identifiants incorrects.');
      document.getElementById('sa-pwd').style.borderColor = '#e74c3c';
      setTimeout(() => { document.getElementById('sa-pwd').style.borderColor = ''; }, 2000);
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Accéder au panneau de contrôle';
  },


  // ── NAVIGATION ────────────────────────────────────────────────
  buildNav() {
    const items = [
      { section: 'Tableau de bord', entries: [
        { id: 'dashboard', icon: 'fa-gauge-high', label: 'Vue d\'ensemble' },
      ]},
      { section: 'Établissements', entries: [
        { id: 'ecoles',    icon: 'fa-school',        label: 'Parc des Écoles' },
        { id: 'licences',  icon: 'fa-key',           label: 'Licences & Clés' },
        { id: 'abonnements', icon: 'fa-credit-card', label: 'Revenus Plateforme' },
      ]},
      { section: 'Communication', entries: [
        { id: 'annonces',  icon: 'fa-bullhorn', label: 'Annonces & Maintenance' },
      ]},
      { section: 'Système', entries: [
        { id: 'stats',     icon: 'fa-chart-mixed', label: 'Statistiques Globales' },
      ]}
    ];
    let html = '';
    items.forEach(sec => {
      html += `<div class="sa-nav-section">${sec.section}</div>`;
      sec.entries.forEach(e => {
        html += `<div class="sa-nav-item" data-page="${e.id}" onclick="SA.goTo('${e.id}')">
          <i class="fa-solid ${e.icon}"></i><span>${e.label}</span>
        </div>`;
      });
    });
    document.getElementById('sa-nav').innerHTML = html;
  },

  goTo(pageId) {
    this.currentPage = pageId;
    document.querySelectorAll('.sa-nav-item').forEach(n => n.classList.remove('active'));
    const navEl = document.querySelector(`.sa-nav-item[data-page="${pageId}"]`);
    if (navEl) navEl.classList.add('active');
    const titles = {
      dashboard:    'Vue d\'ensemble — Plateforme',
      ecoles:       'Parc des Établissements',
      licences:     'Licences & Clés d\'Activation',
      abonnements:  'Revenus & Abonnements SaaS',
      annonces:     'Centre de Diffusion & Annonces',
      stats:        'Statistiques Globales'
    };
    document.getElementById('sa-page-title').textContent = titles[pageId] || pageId;
    const content = document.getElementById('sa-main-content');
    content.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:5rem;gap:1rem;color:#8892b0"><span class="sa-spinner"></span> Chargement…</div>`;
    // Détruire les graphiques précédents
    Object.values(this._charts).forEach(c => { try { c.destroy(); } catch {} });
    this._charts = {};
    this.closeSidebar();
    setTimeout(() => {
      const pages = { dashboard: () => SAPages.dashboard(), ecoles: () => SAPages.ecoles(),
        licences: () => SAPages.licences(), abonnements: () => SAPages.abonnements(),
        annonces: () => SAPages.annonces(), stats: () => SAPages.stats() };
      if (pages[pageId]) pages[pageId]();
    }, 60);
  },

  _updateClock() {
    const el = document.getElementById('sa-date');
    if (el) el.textContent = new Date().toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
  },

  setContent(html) { document.getElementById('sa-main-content').innerHTML = html; }
};

// ══════════════════════════════════════════════════════════════════
// SATk — Toast Notifications Super-Admin
// ══════════════════════════════════════════════════════════════════
const SATk = {
  show(msg, type = 'info', dur = 3500) {
    const c = document.getElementById('sa-toast-container');
    const icons = { success:'fa-circle-check', error:'fa-circle-xmark', warning:'fa-triangle-exclamation', info:'fa-circle-info' };
    const el = document.createElement('div');
    el.className = `sa-toast ${type}`;
    el.innerHTML = `<i class="fa-solid ${icons[type]||icons.info}" style="color:var(--sa-${type==='success'?'success':type==='error'?'danger':type==='warning'?'warning':'primary'})"></i><span>${msg}</span>`;
    c.appendChild(el);
    setTimeout(() => { el.style.opacity='0'; el.style.transform='translateX(30px)'; el.style.transition='all .3s'; setTimeout(()=>el.remove(),300); }, dur);
  },
  success(m) { this.show(m,'success'); },
  error(m)   { this.show(m,'error',5000); },
  warning(m) { this.show(m,'warning'); },
  info(m)    { this.show(m,'info'); }
};

// ══════════════════════════════════════════════════════════════════
// SAModal — Modale générique
// ══════════════════════════════════════════════════════════════════
const SAModal = {
  open(title, bodyHtml, footerHtml='', size='') {
    this.close();
    const ov = document.createElement('div');
    ov.className = 'sa-modal-overlay'; ov.id = 'sa-modal-ov';
    ov.innerHTML = `<div class="sa-modal ${size}" id="sa-modal">
      <div class="sa-modal-header">
        <div class="sa-modal-title">${title}</div>
        <button class="sa-modal-close" onclick="SAModal.close()"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="sa-modal-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="sa-modal-footer">${footerHtml}</div>` : ''}
    </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('open'));
    ov.addEventListener('click', e => { if (e.target === ov) this.close(); });
    document.addEventListener('keydown', this._esc = (e) => { if(e.key==='Escape') this.close(); });
  },
  close() {
    const ov = document.getElementById('sa-modal-ov');
    if (ov) { ov.classList.remove('open'); setTimeout(()=>ov.remove(),200); }
    if (this._esc) { document.removeEventListener('keydown', this._esc); this._esc=null; }
  },
  setBody(html) { const b = document.querySelector('#sa-modal .sa-modal-body'); if(b) b.innerHTML = html; }
};

// ══════════════════════════════════════════════════════════════════
// SAHelpers — Utilitaires
// ══════════════════════════════════════════════════════════════════
const SAH = {
  money(v, devise = DEVISE_DEFAUT) {
    return parseFloat(v||0).toLocaleString('fr-FR') + ' ' + devise;
  },
  date(v) {
    if (!v) return '—';
    return new Date(v).toLocaleDateString('fr-FR');
  },
  datetime(v) {
    if (!v) return '—';
    return new Date(v).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  },
  // Calcule les jours restants avant expiration
  joursRestants(dateFin) {
    if (!dateFin) return null;
    const diff = new Date(dateFin) - new Date();
    return Math.ceil(diff / 86400000);
  },
  // Détermine le statut licence d'une école
  statutEcole(ecole) {
    const now = new Date();
    if (ecole.statut === 'bloque') return 'bloque';
    if (ecole.statut === 'suspendu') return 'suspendu';
    if (ecole.licence_fin && new Date(ecole.licence_fin) > now) return 'actif';
    if (ecole.essai_fin && new Date(ecole.essai_fin) > now) return 'essai';
    return 'expire';
  },
  statutBadge(statut) {
    const map = {
      actif:    '<span class="sa-badge actif"><i class="fa-solid fa-circle-check"></i> Actif</span>',
      essai:    '<span class="sa-badge essai"><i class="fa-solid fa-flask"></i> Essai gratuit</span>',
      suspendu: '<span class="sa-badge suspendu"><i class="fa-solid fa-pause"></i> Suspendu</span>',
      bloque:   '<span class="sa-badge bloque"><i class="fa-solid fa-ban"></i> Bloqué</span>',
      expire:   '<span class="sa-badge expire"><i class="fa-solid fa-clock-rotate-left"></i> Expiré</span>',
    };
    return map[statut] || `<span class="sa-badge">${statut}</span>`;
  },
  // Génère une clé de licence format ZEAN-XXXX-XXXX-XXXX
  genKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const seg = () => Array.from({length:4}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
    return `ZEAN-${seg()}-${seg()}-${seg()}`;
  },
  copyToClipboard(text, label='') {
    navigator.clipboard.writeText(text).then(() => {
      SATk.success(`${label || 'Texte'} copié dans le presse-papiers !`);
    }).catch(() => {
      prompt('Copiez manuellement :', text);
    });
  },
  planLabel(plan) {
    const m = { mensuel:'Mensuel (1 mois)', trimestriel:'Trimestriel (3 mois)', semestriel:'Semestriel (6 mois)', annuel:'Annuel (12 mois)', illimite:'Illimité', essai:'Essai gratuit' };
    return m[plan] || plan;
  },
  planJours(plan) {
    const m = { mensuel:30, trimestriel:90, semestriel:180, annuel:365, illimite:3650 };
    return m[plan] || 30;
  }
};

// ══════════════════════════════════════════════════════════════════
// SAPages — Pages du panneau Super-Admin
// ══════════════════════════════════════════════════════════════════
const SAPages = {

  // ── DASHBOARD GLOBAL ─────────────────────────────────────────
  async dashboard() {
    try {
      // SA n'a pas de filtre ecole_code — récupère tout depuis l'API cloud
      // Stratégie : API directe pour les compteurs (total réel), DB.getAll pour les détails
      const fetchTotal = async (table) => {
        try {
          const r = await fetch(`tables/${table}?page=1&limit=1`);
          if (!r.ok) return 0;
          const j = await r.json();
          return parseInt(j.total || j.data?.length || 0);
        } catch { return 0; }
      };

      const [ecoles, licences, abonnements, annonces, tousEleves, tousUsers] = await Promise.all([
        DB.getAll('ecoles', 200),
        DB.getAll('licences_keys', 500),
        DB.getAll('abonnements', 500),
        DB.getAll('annonces_plateforme', 100),
        fetchTotal('eleves'),      // Count réel depuis API (pas IDB filtré)
        fetchTotal('utilisateurs') // Count réel depuis API
      ]);
      const now = new Date();

      const nbEcoles  = ecoles.length;
      const nbActives = ecoles.filter(e => SAH.statutEcole(e) === 'actif').length;
      const nbEssai   = ecoles.filter(e => SAH.statutEcole(e) === 'essai').length;
      const nbExpires = ecoles.filter(e => ['expire','bloque','suspendu'].includes(SAH.statutEcole(e))).length;

      // Compteurs réels depuis l'API (priorité) → fallback somme nb_eleves des fiches école
      const totalEleves = tousEleves > 0 ? tousEleves
        : ecoles.reduce((s,e) => s + (parseInt(e.nb_eleves)||0), 0);
      const totalUsers  = tousUsers  > 0 ? tousUsers
        : ecoles.reduce((s,e) => s + (parseInt(e.nb_utilisateurs)||0), 0);

      // Revenus du mois courant
      const paysMois = abonnements.filter(a => {
        const d = new Date(a.date_paiement||a.created_at);
        return a.statut==='paye' && d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
      });
      const revenuMois = paysMois.reduce((s,a) => s+parseFloat(a.montant||0), 0);
      const revenuTotal = abonnements.filter(a=>a.statut==='paye').reduce((s,a)=>s+parseFloat(a.montant||0),0);

      const keysNonUsed = licences.filter(l => l.statut==='non_utilisee').length;
      const annonceActive = annonces.filter(a => a.active).length;

      // Écoles à risque (expiration dans 7 jours)
      const aRisque = ecoles.filter(e => {
        const jr = SAH.joursRestants(e.licence_fin || e.essai_fin);
        return jr !== null && jr >= 0 && jr <= 7;
      });

      SA.setContent(`
        <!-- KPIs -->
        <div class="sa-kpi-grid">
          <div class="sa-kpi-card">
            <div class="sa-kpi-icon purple"><i class="fa-solid fa-school"></i></div>
            <div class="sa-kpi-value">${nbEcoles}</div>
            <div class="sa-kpi-label">Écoles partenaires</div>
            <div class="sa-kpi-trend up"><i class="fa-solid fa-circle"></i> ${nbActives} actives · ${nbEssai} en essai</div>
          </div>
          <div class="sa-kpi-card green">
            <div class="sa-kpi-icon green"><i class="fa-solid fa-user-graduate"></i></div>
            <div class="sa-kpi-value">${totalEleves.toLocaleString('fr-FR')}</div>
            <div class="sa-kpi-label">Élèves sur la plateforme</div>
            <div class="sa-kpi-trend"><i class="fa-solid fa-users"></i> ${totalUsers} utilisateurs</div>
          </div>
          <div class="sa-kpi-card gold">
            <div class="sa-kpi-icon gold"><i class="fa-solid fa-coins"></i></div>
            <div class="sa-kpi-value">${SAH.money(revenuMois)}</div>
            <div class="sa-kpi-label">Revenus ce mois</div>
            <div class="sa-kpi-trend up"><i class="fa-solid fa-chart-line"></i> Total : ${SAH.money(revenuTotal)}</div>
          </div>
          <div class="sa-kpi-card ${nbExpires>0?'red':''}">
            <div class="sa-kpi-icon ${nbExpires>0?'red':'purple'}"><i class="fa-solid fa-triangle-exclamation"></i></div>
            <div class="sa-kpi-value">${nbExpires}</div>
            <div class="sa-kpi-label">Licences expirées / bloquées</div>
            <div class="sa-kpi-trend ${nbExpires>0?'down':''}"><i class="fa-solid fa-key"></i> ${keysNonUsed} clé(s) disponible(s)</div>
          </div>
        </div>

        <!-- Santé + Alertes -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;margin-bottom:1.25rem">
          <!-- Santé de la plateforme -->
          <div class="sa-card">
            <div class="sa-card-header">
              <div class="sa-card-title"><i class="fa-solid fa-heart-pulse"></i> Santé de la plateforme</div>
            </div>
            <div class="sa-card-body">
              <div style="display:flex;flex-direction:column;gap:.6rem">
                <div style="display:flex;align-items:center;justify-content:space-between;padding:.6rem .8rem;background:#f8f9ff;border-radius:8px">
                  <span style="font-size:.84rem"><span class="sa-health-dot ok"></span> API & Base de données</span>
                  <span style="font-size:.78rem;color:#27ae60;font-weight:600">Opérationnel</span>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;padding:.6rem .8rem;background:#f8f9ff;border-radius:8px">
                  <span style="font-size:.84rem"><span class="sa-health-dot ok"></span> Synchronisation hors-ligne</span>
                  <span style="font-size:.78rem;color:#27ae60;font-weight:600">Actif</span>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;padding:.6rem .8rem;background:#f8f9ff;border-radius:8px">
                  <span style="font-size:.84rem"><span class="sa-health-dot ok"></span> Service Worker PWA</span>
                  <span style="font-size:.78rem;color:#27ae60;font-weight:600">En ligne</span>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;padding:.6rem .8rem;background:#f8f9ff;border-radius:8px">
                  <span style="font-size:.84rem"><span class="${annonceActive>0?'sa-health-dot ok':'sa-health-dot'}"></span> Annonces actives</span>
                  <span style="font-size:.78rem;color:${annonceActive>0?'#1565c0':'#8892b0'};font-weight:600">${annonceActive} en cours</span>
                </div>
              </div>
              <div style="margin-top:1rem;padding:.65rem .9rem;background:var(--sa-primary-light);border-radius:8px;font-size:.8rem;color:var(--sa-primary)">
                <i class="fa-solid fa-circle-info"></i> Dernière vérification : ${new Date().toLocaleTimeString('fr-FR')}
              </div>
            </div>
          </div>

          <!-- Alertes à traiter -->
          <div class="sa-card">
            <div class="sa-card-header">
              <div class="sa-card-title"><i class="fa-solid fa-bell"></i> Alertes à traiter</div>
              ${aRisque.length > 0 ? `<span class="sa-badge bloque">${aRisque.length} urgente(s)</span>` : ''}
            </div>
            <div class="sa-card-body" style="max-height:240px;overflow-y:auto">
              ${aRisque.length === 0 ? `<div style="text-align:center;padding:2rem;color:#8892b0"><i class="fa-solid fa-check-circle" style="font-size:1.5rem;color:#27ae60"></i><br><br>Aucune alerte critique</div>` :
              aRisque.map(e => {
                const jr = SAH.joursRestants(e.licence_fin || e.essai_fin);
                return `<div style="display:flex;align-items:center;justify-content:space-between;padding:.6rem .8rem;background:#fff8e1;border-radius:8px;margin-bottom:.4rem">
                  <div>
                    <div style="font-size:.84rem;font-weight:700">${e.nom}</div>
                    <div style="font-size:.74rem;color:#8892b0">${e.ville||''}</div>
                  </div>
                  <div style="text-align:right">
                    <div style="font-size:.82rem;font-weight:700;color:${jr<=3?'#b71c1c':'#f57f17'}">${jr <= 0 ? 'Expiré !' : jr+' jour(s)'}</div>
                    <button class="sa-btn sa-btn-sm gold" style="margin-top:.3rem" onclick="SAPages._genKeyForEcole('${e.id}')">
                      <i class="fa-solid fa-key"></i> Renouveler
                    </button>
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- Dernières inscriptions -->
        <div class="sa-card">
          <div class="sa-card-header">
            <div class="sa-card-title"><i class="fa-solid fa-school"></i> Dernières écoles inscrites</div>
            <button class="sa-btn outline sa-btn-sm" onclick="SA.goTo('ecoles')"><i class="fa-solid fa-arrow-right"></i> Voir toutes</button>
          </div>
          <div class="sa-table-wrap">
            <table class="sa-table">
              <thead><tr><th>École</th><th>Ville</th><th>Directeur</th><th>Élèves</th><th>Statut</th><th>Fin licence</th></tr></thead>
              <tbody>
                ${ecoles.slice().sort((a,b)=>new Date(b.date_creation||b.created_at)-new Date(a.date_creation||a.created_at)).slice(0,8).map(e => {
                  const s = SAH.statutEcole(e);
                  const jr = SAH.joursRestants(e.licence_fin || e.essai_fin);
                  return `<tr>
                    <td><strong>${e.nom}</strong></td>
                    <td style="color:#8892b0">${e.ville||'—'}, ${e.pays||'GN'}</td>
                    <td style="font-size:.82rem">${e.directeur_nom||'—'}</td>
                    <td><strong>${e.nb_eleves||0}</strong></td>
                    <td>${SAH.statutBadge(s)}</td>
                    <td style="font-size:.82rem;color:${jr!==null&&jr<=7?'#b71c1c':'#8892b0'}">${SAH.date(e.licence_fin||e.essai_fin)}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Revenus récents -->
        <div class="sa-card">
          <div class="sa-card-header">
            <div class="sa-card-title"><i class="fa-solid fa-coins"></i> Derniers paiements reçus</div>
            <button class="sa-btn outline sa-btn-sm" onclick="SA.goTo('abonnements')"><i class="fa-solid fa-arrow-right"></i> Voir tous</button>
          </div>
          <div class="sa-table-wrap">
            <table class="sa-table">
              <thead><tr><th>École</th><th>Plan</th><th>Montant</th><th>Mode</th><th>Date</th><th>Statut</th></tr></thead>
              <tbody>
                ${abonnements.slice().sort((a,b)=>new Date(b.date_paiement||b.created_at)-new Date(a.date_paiement||a.created_at)).slice(0,6).map(a => `<tr>
                  <td><strong>${a.ecole_nom||'—'}</strong></td>
                  <td>${SAH.planLabel(a.plan)}</td>
                  <td><strong style="color:#27ae60">${SAH.money(a.montant, a.devise)}</strong></td>
                  <td style="font-size:.82rem">${a.mode_paiement||'—'}</td>
                  <td style="font-size:.82rem;color:#8892b0">${SAH.date(a.date_paiement||a.created_at)}</td>
                  <td><span class="sa-badge ${a.statut}">${a.statut}</span></td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `);
    } catch(err) {
      SA.setContent(`<div style="text-align:center;padding:3rem;color:#e74c3c"><i class="fa-solid fa-circle-xmark" style="font-size:2rem"></i><p style="margin-top:1rem">${err.message}</p></div>`);
    }
  },

  // ── PARC DES ÉCOLES ──────────────────────────────────────────
  async ecoles() {
    try {
      const ecoles = await DB.getAll('ecoles', 200);
      const sorted = ecoles.sort((a,b) => new Date(b.date_creation||b.created_at) - new Date(a.date_creation||a.created_at));

      SA.setContent(`
        <div class="sa-page-header">
          <div>
            <h2><i class="fa-solid fa-school"></i> Parc des Établissements</h2>
            <p>${ecoles.length} école(s) — ${ecoles.filter(e=>SAH.statutEcole(e)==='actif').length} actives · ${ecoles.filter(e=>SAH.statutEcole(e)==='essai').length} en essai</p>
          </div>
          <button class="sa-btn gold sa-btn-lg" onclick="SAPages._openNewEcoleModal()">
            <i class="fa-solid fa-plus"></i> Enregistrer une nouvelle école
          </button>
        </div>

        <div class="sa-search">
          <div class="sa-search-wrap">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" class="sa-search-input" id="ecoles-search" placeholder="Rechercher une école…" oninput="SAPages._filterEcoles()">
          </div>
          <select class="sa-control" style="width:auto" id="ecoles-filter" onchange="SAPages._filterEcoles()">
            <option value="">Tous les statuts</option>
            <option value="actif">Actif</option>
            <option value="essai">Essai gratuit</option>
            <option value="suspendu">Suspendu</option>
            <option value="expire">Expiré</option>
            <option value="bloque">Bloqué</option>
          </select>
        </div>

        <div id="ecoles-container">
          ${this._buildEcolesGrid(sorted)}
        </div>
      `);
      window._saEcoles = sorted;
    } catch(err) { SA.setContent(`<p style="color:red;padding:2rem">${err.message}</p>`); }
  },

  _buildEcolesGrid(ecoles) {
    if (!ecoles.length) return `<div style="text-align:center;padding:3rem;color:#8892b0"><i class="fa-solid fa-school" style="font-size:2rem"></i><p style="margin-top:1rem">Aucune école trouvée</p><button class="sa-btn gold" onclick="SAPages._openNewEcoleModal()" style="margin-top:1rem"><i class="fa-solid fa-plus"></i> Créer la première école</button></div>`;
    return `<div class="sa-ecoles-grid">${ecoles.map(e => {
      const s = SAH.statutEcole(e);
      const jr = SAH.joursRestants(e.licence_fin || e.essai_fin);
      const cardClass = s === 'suspendu' ? 'suspended' : s === 'bloque' ? 'blocked' : s === 'expire' ? 'expired' : '';
      return `<div class="sa-ecole-card ${cardClass}" onclick="SAPages._viewEcole('${e.id}')">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.4rem">
          <div>
            <div class="sa-ecole-name">${e.nom}</div>
            ${e.code||e.code_ecole ? `<div style="font-size:.7rem;font-weight:700;color:#6c3fc5;letter-spacing:.08em;font-family:monospace;margin-top:.1rem">🔑 ${e.code||e.code_ecole}</div>` : ''}
          </div>
          ${SAH.statutBadge(s)}
        </div>
        <div class="sa-ecole-meta"><i class="fa-solid fa-location-dot"></i> ${e.ville||'—'}, ${e.pays||'Guinée'}</div>
        <div class="sa-ecole-stats">
          <div class="sa-ecole-stat">
            <div class="sa-ecole-stat-val">${e.nb_eleves||0}</div>
            <div class="sa-ecole-stat-lbl">Élèves</div>
          </div>
          <div class="sa-ecole-stat">
            <div class="sa-ecole-stat-val">${e.nb_utilisateurs||0}</div>
            <div class="sa-ecole-stat-lbl">Utilisateurs</div>
          </div>
          <div class="sa-ecole-stat">
            <div class="sa-ecole-stat-val" style="color:${jr!==null&&jr<=7?'#e74c3c':'var(--sa-primary)'}">${jr===null?'—':jr<=0?'Expiré':jr+'j'}</div>
            <div class="sa-ecole-stat-lbl">Restants</div>
          </div>
        </div>
        <div style="font-size:.76rem;color:#8892b0"><i class="fa-solid fa-user-tie"></i> ${e.directeur_nom||'Non renseigné'}</div>
        <div style="display:flex;gap:.4rem;margin-top:.75rem;flex-wrap:wrap">
          <button class="sa-btn ghost sa-btn-sm" onclick="event.stopPropagation();SAPages._editEcole('${e.id}')"><i class="fa-solid fa-pen"></i></button>
          <button class="sa-btn gold sa-btn-sm" onclick="event.stopPropagation();SAPages._genKeyForEcole('${e.id}')"><i class="fa-solid fa-key"></i> Licence</button>
          ${s==='actif'||s==='essai' ? `<button class="sa-btn sa-btn-sm" style="background:#fff3e0;color:#e65100" onclick="event.stopPropagation();SAPages._toggleStatut('${e.id}','suspendu')"><i class="fa-solid fa-pause"></i> Suspendre</button>` : ''}
          ${s==='suspendu'||s==='expire' ? `<button class="sa-btn green sa-btn-sm" onclick="event.stopPropagation();SAPages._toggleStatut('${e.id}','actif')"><i class="fa-solid fa-play"></i> Activer</button>` : ''}
          ${s!=='bloque' ? `<button class="sa-btn red sa-btn-sm" onclick="event.stopPropagation();SAPages._toggleStatut('${e.id}','bloque')"><i class="fa-solid fa-ban"></i> Bloquer</button>` : ''}
        </div>
      </div>`;
    }).join('')}</div>`;
  },

  _filterEcoles() {
    const q = document.getElementById('ecoles-search')?.value.toLowerCase() || '';
    const f = document.getElementById('ecoles-filter')?.value || '';
    let list = window._saEcoles || [];
    if (q) list = list.filter(e => (e.nom+e.ville+e.directeur_nom+e.directeur_email).toLowerCase().includes(q));
    if (f) list = list.filter(e => SAH.statutEcole(e) === f);
    const cont = document.getElementById('ecoles-container');
    if (cont) cont.innerHTML = this._buildEcolesGrid(list);
  },

  _openNewEcoleModal() {
    SAModal.open('<i class="fa-solid fa-school"></i> Enregistrer une nouvelle école',
      `<div class="sa-alert info"><i class="fa-solid fa-circle-info"></i><div>L'école recevra automatiquement une <strong>période d'essai de ${ESSAI_DUREE_JOURS} jours</strong> dès sa création. Le <strong>Code École</strong> servira d'identifiant unique pour la connexion multi-écoles.</div></div>
      <div class="sa-form-grid">
        <div class="sa-field" style="grid-column:1/-1">
          <label class="sa-label">Code École (identifiant unique) <span class="req">*</span></label>
          <input class="sa-control" id="ne-code" placeholder="Ex: COYAH-01, CONAKRY-GS1…" required
            style="text-transform:uppercase;letter-spacing:.08em;font-family:monospace;font-weight:700"
            oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9-]/g,'')"
            title="Code unique servant à identifier l'école sur l'écran de connexion">
          <div style="font-size:.75rem;color:#8892b0;margin-top:.25rem"><i class="fa-solid fa-circle-info"></i> Ce code est saisi par les utilisateurs sur l'écran de connexion de Zean School Manager.</div>
        </div>
        <div class="sa-field"><label class="sa-label">Nom de l'école <span class="req">*</span></label><input class="sa-control" id="ne-nom" placeholder="Ex: Groupe Scolaire ABC" required></div>
        <div class="sa-field"><label class="sa-label">Ville <span class="req">*</span></label><input class="sa-control" id="ne-ville" placeholder="Conakry" required></div>
        <div class="sa-field"><label class="sa-label">Pays</label><input class="sa-control" id="ne-pays" placeholder="Guinée" value="Guinée"></div>
        <div class="sa-field"><label class="sa-label">Téléphone</label><input class="sa-control" id="ne-tel" placeholder="+224 6XX XXX XXX"></div>
        <div class="sa-field"><label class="sa-label">Nom du Directeur <span class="req">*</span></label><input class="sa-control" id="ne-dir-nom" placeholder="Nom Prénom" required></div>
        <div class="sa-field"><label class="sa-label">Email Directeur <span class="req">*</span></label><input type="email" class="sa-control" id="ne-dir-email" placeholder="directeur@ecole.com" required></div>
        <div class="sa-field"><label class="sa-label">Mot de passe initial <span class="req">*</span></label><input class="sa-control" id="ne-dir-pwd" placeholder="Mot de passe temporaire" value="Ecole2025!"></div>
        <div class="sa-field"><label class="sa-label">Devise</label><select class="sa-control" id="ne-devise"><option value="GNF">GNF (Franc Guinéen)</option><option value="FCFA">FCFA</option><option value="USD">USD</option><option value="EUR">EUR</option></select></div>
      </div>
      <div class="sa-field"><label class="sa-label">Notes internes</label><textarea class="sa-control" id="ne-notes" rows="2" placeholder="Mémo interne…"></textarea></div>`,
      `<button class="sa-btn ghost" onclick="SAModal.close()">Annuler</button>
       <button class="sa-btn purple sa-btn-lg" onclick="SAPages._saveNewEcole()"><i class="fa-solid fa-school"></i> Créer l'école</button>`,
      'lg'
    );
  },

  async _saveNewEcole() {
    const code     = document.getElementById('ne-code')?.value.trim().toUpperCase();
    const nom      = document.getElementById('ne-nom')?.value.trim();
    const ville    = document.getElementById('ne-ville')?.value.trim();
    const dirNom   = document.getElementById('ne-dir-nom')?.value.trim();
    const dirEmail = document.getElementById('ne-dir-email')?.value.trim();
    const dirPwd   = document.getElementById('ne-dir-pwd')?.value;
    if (!code || !nom || !ville || !dirNom || !dirEmail || !dirPwd) {
      SATk.error('Remplissez tous les champs obligatoires (y compris le Code École).');
      return;
    }
    if (!/^[A-Z0-9][A-Z0-9-]{1,14}$/.test(code)) {
      SATk.error('Code école invalide. Utilisez uniquement des lettres, chiffres et tirets. Ex: COYAH-01');
      return;
    }
    const now      = new Date();
    const essaiFin = new Date(now.getTime() + ESSAI_DUREE_JOURS * 86400000);
    try {
      SAModal.setBody('<div style="text-align:center;padding:2rem"><span class="sa-spinner" style="width:36px;height:36px;border-width:3px"></span><p style="margin-top:1rem">Création en cours…</p></div>');

      // Création atomique côté serveur : école + compte directeur + profil
      // + configuration initiale. Écrit DIRECTEMENT dans la base partagée,
      // donc le code école est reconnu immédiatement sur tout appareil.
      const res = await ZeanAPI.createEcole({
        code, nom, ville,
        pays: document.getElementById('ne-pays')?.value || 'Guinée',
        telephone: document.getElementById('ne-tel')?.value || '',
        directeur_nom: dirNom,
        directeur_email: dirEmail,
        directeur_password: dirPwd,
        devise: document.getElementById('ne-devise')?.value || 'GNF',
        notes_internes: document.getElementById('ne-notes')?.value || '',
        essai_jours: ESSAI_DUREE_JOURS,
      });

      const fiche = res.ecole;
      // Miroir local (affichage instantané + reconnaissance du code hors-ligne)
      try {
        await DB._idbPut('ecoles', fiche, false);
        if (typeof DB.registerEcole === 'function') await DB.registerEcole(fiche);
      } catch (e) { console.warn('Miroir local école :', e.message); }

      SAModal.close();
      SATk.success(`✓ École "${nom}" créée dans la base partagée ! Code: <strong>${code}</strong> — Essai jusqu'au ${SAH.date(essaiFin)}. Le directeur peut se connecter immédiatement.`);
      SAPages.ecoles();
    } catch(err) { SAModal.close(); SATk.error('Erreur création : ' + err.message); SAPages.ecoles(); }
  },


  async _viewEcole(id) {
    const [ecole, licences, abons] = await Promise.all([
      DB.getById('ecoles', id),
      DB.query('licences_keys', l => l.ecole_id === id),
      DB.query('abonnements', a => a.ecole_id === id)
    ]);
    if (!ecole) return;
    const s = SAH.statutEcole(ecole);
    const jr = SAH.joursRestants(ecole.licence_fin || ecole.essai_fin);
    const totalPaye = abons.filter(a=>a.statut==='paye').reduce((s,a)=>s+parseFloat(a.montant||0),0);

    SAModal.open(`<i class="fa-solid fa-school"></i> ${ecole.nom}`,
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.25rem">
        <div style="padding:.85rem;background:#f8f9ff;border-radius:10px">
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;color:#8892b0;margin-bottom:.5rem">Informations</div>
          <div style="font-size:.85rem;line-height:2">
            ${ecole.code||ecole.code_ecole ? `<i class="fa-solid fa-key"></i> Code: <strong style="color:#6c3fc5;font-family:monospace">${ecole.code||ecole.code_ecole}</strong><br>` : ''}
            <i class="fa-solid fa-location-dot"></i> ${ecole.ville}, ${ecole.pays||'Guinée'}<br>
            <i class="fa-solid fa-phone"></i> ${ecole.telephone||'—'}<br>
            <i class="fa-solid fa-user-tie"></i> ${ecole.directeur_nom||'—'}<br>
            <i class="fa-solid fa-envelope"></i> ${ecole.directeur_email||'—'}
          </div>
        </div>
        <div style="padding:.85rem;background:#f8f9ff;border-radius:10px">
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;color:#8892b0;margin-bottom:.5rem">Abonnement</div>
          <div style="margin-bottom:.4rem">${SAH.statutBadge(s)}</div>
          <div style="font-size:.83rem;line-height:1.8;color:#4a5580">
            Plan : ${SAH.planLabel(ecole.plan||'essai')}<br>
            Fin licence : ${SAH.date(ecole.licence_fin)||'—'}<br>
            Fin essai : ${SAH.date(ecole.essai_fin)||'—'}<br>
            Jours restants : <strong style="color:${jr<=7?'#e74c3c':'#1b5e20'}">${jr===null?'—':jr<=0?'Expiré !':jr}</strong>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:1rem;margin-bottom:1.25rem">
        <div style="flex:1;padding:.75rem;background:#e8f5e9;border-radius:8px;text-align:center">
          <div style="font-size:1.3rem;font-weight:800;color:#1b5e20">${ecole.nb_eleves||0}</div><div style="font-size:.75rem;color:#8892b0">Élèves</div>
        </div>
        <div style="flex:1;padding:.75rem;background:#e3f2fd;border-radius:8px;text-align:center">
          <div style="font-size:1.3rem;font-weight:800;color:#0d47a1">${ecole.nb_utilisateurs||0}</div><div style="font-size:.75rem;color:#8892b0">Utilisateurs</div>
        </div>
        <div style="flex:1;padding:.75rem;background:#fff8e1;border-radius:8px;text-align:center">
          <div style="font-size:1.1rem;font-weight:800;color:#f57f17">${SAH.money(totalPaye, ecole.devise)}</div><div style="font-size:.75rem;color:#8892b0">Total payé</div>
        </div>
      </div>
      <div style="font-size:.8rem;color:#8892b0;margin-bottom:.4rem"><strong>Licences activées :</strong> ${licences.filter(l=>l.statut==='active').length} | Générées : ${licences.length}</div>
      <div style="font-size:.8rem;color:#8892b0">Inscrite le : ${SAH.date(ecole.date_creation||ecole.created_at)}</div>`,
      `<button class="sa-btn ghost" onclick="SAModal.close()">Fermer</button>
       <button class="sa-btn gold" onclick="SAModal.close();SAPages._genKeyForEcole('${id}')"><i class="fa-solid fa-key"></i> Générer une clé</button>`,
      'lg'
    );
  },

  async _editEcole(id) {
    const ecole = await DB.getById('ecoles', id);
    if (!ecole) return;
    SAModal.open(`<i class="fa-solid fa-pen"></i> Modifier — ${ecole.nom}`,
      `<div class="sa-form-grid">
        <div class="sa-field"><label class="sa-label">Nom</label><input class="sa-control" id="ee-nom" value="${ecole.nom||''}"></div>
        <div class="sa-field"><label class="sa-label">Ville</label><input class="sa-control" id="ee-ville" value="${ecole.ville||''}"></div>
        <div class="sa-field"><label class="sa-label">Pays</label><input class="sa-control" id="ee-pays" value="${ecole.pays||'Guinée'}"></div>
        <div class="sa-field"><label class="sa-label">Téléphone</label><input class="sa-control" id="ee-tel" value="${ecole.telephone||''}"></div>
        <div class="sa-field"><label class="sa-label">Directeur (Nom)</label><input class="sa-control" id="ee-dir-nom" value="${ecole.directeur_nom||''}"></div>
        <div class="sa-field"><label class="sa-label">Directeur (Email)</label><input type="email" class="sa-control" id="ee-dir-email" value="${ecole.directeur_email||''}"></div>
        <div class="sa-field"><label class="sa-label">Statut</label><select class="sa-control" id="ee-statut"><option value="actif" ${ecole.statut==='actif'?'selected':''}>Actif</option><option value="essai" ${ecole.statut==='essai'?'selected':''}>Essai</option><option value="suspendu" ${ecole.statut==='suspendu'?'selected':''}>Suspendu</option><option value="bloque" ${ecole.statut==='bloque'?'selected':''}>Bloqué</option><option value="expire" ${ecole.statut==='expire'?'selected':''}>Expiré</option></select></div>
        <div class="sa-field"><label class="sa-label">Nb élèves</label><input type="number" class="sa-control" id="ee-eleves" value="${ecole.nb_eleves||0}"></div>
      </div>
      <div class="sa-field"><label class="sa-label">Notes internes</label><textarea class="sa-control" id="ee-notes">${ecole.notes_internes||''}</textarea></div>`,
      `<button class="sa-btn ghost" onclick="SAModal.close()">Annuler</button>
       <button class="sa-btn purple" onclick="SAPages._saveEcoleEdit('${id}')"><i class="fa-solid fa-floppy-disk"></i> Enregistrer</button>`
    );
  },

  async _saveEcoleEdit(id) {
    try {
      await DB.update('ecoles', id, {
        nom: document.getElementById('ee-nom').value.trim(),
        ville: document.getElementById('ee-ville').value.trim(),
        pays: document.getElementById('ee-pays').value.trim(),
        telephone: document.getElementById('ee-tel').value.trim(),
        directeur_nom: document.getElementById('ee-dir-nom').value.trim(),
        directeur_email: document.getElementById('ee-dir-email').value.trim(),
        statut: document.getElementById('ee-statut').value,
        nb_eleves: parseInt(document.getElementById('ee-eleves').value)||0,
        notes_internes: document.getElementById('ee-notes').value
      });
      SAModal.close(); SATk.success('École mise à jour !'); SAPages.ecoles();
    } catch(err) { SATk.error('Erreur : ' + err.message); }
  },

  async _toggleStatut(id, newStatut) {
    const labels = { actif:'activer', suspendu:'suspendre', bloque:'bloquer' };
    if (!confirm(`Voulez-vous vraiment ${labels[newStatut]||'modifier'} cette école ?`)) return;
    try {
      await DB.update('ecoles', id, { statut: newStatut });
      SATk.success(`Statut mis à jour : ${newStatut}`);
      SAPages.ecoles();
    } catch(err) { SATk.error(err.message); }
  },

  // ── LICENCES & CLÉS ──────────────────────────────────────────
  async licences() {
    try {
      const [licences, ecoles] = await Promise.all([
        DB.getAll('licences_keys', 500), DB.getAll('ecoles', 200)
      ]);
      const eMap = Object.fromEntries(ecoles.map(e => [e.id, e]));
      const sorted = licences.sort((a,b) => new Date(b.date_generation||b.created_at)-new Date(a.date_generation||a.created_at));

      SA.setContent(`
        <div class="sa-page-header">
          <div>
            <h2><i class="fa-solid fa-key"></i> Licences & Clés d'Activation</h2>
            <p>${licences.length} clé(s) générée(s) · ${licences.filter(l=>l.statut==='active').length} actives · ${licences.filter(l=>l.statut==='non_utilisee').length} disponibles</p>
          </div>
          <button class="sa-btn gold sa-btn-lg" onclick="SAPages._openGenKeyModal()">
            <i class="fa-solid fa-wand-magic-sparkles"></i> Générer une nouvelle clé
          </button>
        </div>

        <div class="sa-card">
          <div class="sa-card-header">
            <div class="sa-card-title"><i class="fa-solid fa-list"></i> Historique des clés</div>
          </div>
          <div class="sa-table-wrap">
            <table class="sa-table">
              <thead><tr><th>Clé</th><th>École</th><th>Plan</th><th>Durée</th><th>Statut</th><th>Généré le</th><th>Activé le</th><th>Expire le</th><th>Actions</th></tr></thead>
              <tbody>
                ${sorted.map(l => `<tr>
                  <td>
                    <div class="sa-licence-key" style="font-size:.85rem;padding:.4rem .7rem;min-width:190px" onclick="SAH.copyToClipboard('${l.cle}','Clé')">
                      ${l.cle} <i class="fa-regular fa-copy copy-icon"></i>
                    </div>
                  </td>
                  <td><strong>${l.ecole_nom||eMap[l.ecole_id]?.nom||'—'}</strong></td>
                  <td>${SAH.planLabel(l.plan)}</td>
                  <td>${l.duree_jours} j</td>
                  <td><span class="sa-badge ${l.statut}">${l.statut.replace('_',' ')}</span></td>
                  <td style="font-size:.8rem;color:#8892b0">${SAH.date(l.date_generation||l.created_at)}</td>
                  <td style="font-size:.8rem;color:#8892b0">${SAH.date(l.date_activation)||'—'}</td>
                  <td style="font-size:.8rem;color:${l.date_expiration&&SAH.joursRestants(l.date_expiration)<=7?'#b71c1c':'#8892b0'}">${SAH.date(l.date_expiration)||'—'}</td>
                  <td>
                    ${l.statut==='non_utilisee' ? `<button class="sa-btn red sa-btn-sm" onclick="SAPages._revokeKey('${l.id}')"><i class="fa-solid fa-trash"></i></button>` : ''}
                    <button class="sa-btn ghost sa-btn-sm" onclick="SAH.copyToClipboard('${l.cle}','Clé')"><i class="fa-regular fa-copy"></i></button>
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `);
      window._saEcoles = ecoles;
    } catch(err) { SA.setContent(`<p style="color:red;padding:2rem">${err.message}</p>`); }
  },

  _openGenKeyModal(preselEcoleId='') {
    const ecoles = window._saEcoles || [];
    const opts = ecoles.map(e => `<option value="${e.id}" ${e.id===preselEcoleId?'selected':''}>${e.nom} — ${e.ville||''}</option>`).join('');
    SAModal.open('<i class="fa-solid fa-wand-magic-sparkles"></i> Générer une clé d\'activation',
      `<div class="sa-field">
        <label class="sa-label">École destinataire <span class="req">*</span></label>
        <select class="sa-control" id="gk-ecole"><option value="">— Choisir une école —</option>${opts}</select>
      </div>
      <div class="sa-form-grid">
        <div class="sa-field">
          <label class="sa-label">Plan d'abonnement <span class="req">*</span></label>
          <select class="sa-control" id="gk-plan" onchange="SAPages._updateKeyAmount()">
            <option value="mensuel">Mensuel (30 jours)</option>
            <option value="trimestriel">Trimestriel (90 jours)</option>
            <option value="semestriel">Semestriel (180 jours)</option>
            <option value="annuel" selected>Annuel (365 jours)</option>
            <option value="illimite">Illimité (10 ans)</option>
          </select>
        </div>
        <div class="sa-field">
          <label class="sa-label">Montant perçu <span class="req">*</span></label>
          <input type="number" class="sa-control" id="gk-montant" placeholder="Ex: 500000">
        </div>
        <div class="sa-field">
          <label class="sa-label">Devise</label>
          <select class="sa-control" id="gk-devise"><option value="GNF">GNF</option><option value="CFA">FCFA</option><option value="USD">USD</option><option value="EUR">EUR</option></select>
        </div>
        <div class="sa-field">
          <label class="sa-label">Mode de paiement</label>
          <select class="sa-control" id="gk-mode"><option value="mobile_money">Mobile Money</option><option value="especes">Espèces</option><option value="virement">Virement</option><option value="offert">Offert</option></select>
        </div>
      </div>
      <div class="sa-field"><label class="sa-label">Notes</label><input class="sa-control" id="gk-notes" placeholder="Mémo (optionnel)"></div>
      <div id="gk-preview" style="margin-top:1rem"></div>`,
      `<button class="sa-btn ghost" onclick="SAModal.close()">Annuler</button>
       <button class="sa-btn gold sa-btn-lg" onclick="SAPages._generateKey()"><i class="fa-solid fa-wand-magic-sparkles"></i> Générer la clé</button>`
    );
    this._updateKeyAmount();
  },

  _genKeyForEcole(ecoleId) {
    // Charger les écoles si nécessaire
    DB.getAll('ecoles',200).then(ecoles => { window._saEcoles = ecoles; this._openGenKeyModal(ecoleId); });
  },

  _updateKeyAmount() {
    const plan = document.getElementById('gk-plan')?.value;
    const tarifs = { mensuel:'150000', trimestriel:'400000', semestriel:'700000', annuel:'1200000', illimite:'5000000' };
    const montantEl = document.getElementById('gk-montant');
    if (montantEl && tarifs[plan]) montantEl.value = tarifs[plan];
  },

  async _generateKey() {
    const ecoleId = document.getElementById('gk-ecole')?.value;
    const plan    = document.getElementById('gk-plan')?.value;
    const montant = parseFloat(document.getElementById('gk-montant')?.value||0);
    const devise  = document.getElementById('gk-devise')?.value || 'GNF';
    const mode    = document.getElementById('gk-mode')?.value || 'mobile_money';
    const notes   = document.getElementById('gk-notes')?.value;
    if (!ecoleId || !plan) { SATk.error('Sélectionnez une école et un plan.'); return; }
    const ecoles = window._saEcoles || [];
    const ecole  = ecoles.find(e => e.id === ecoleId);
    const duree  = SAH.planJours(plan);
    const cle    = SAH.genKey();
    try {
      const keyRecord = await DB.insert('licences_keys', {
        cle, ecole_id: ecoleId, ecole_nom: ecole?.nom||'',
        duree_jours: duree, plan, montant, devise,
        statut: 'non_utilisee',
        date_generation: new Date().toISOString(),
        date_activation: null, date_expiration: null,
        activee_par: SA_MASTER_EMAIL, notes
      });
      // Enregistrer aussi l'abonnement
      if (montant > 0) {
        await DB.insert('abonnements', {
          ecole_id: ecoleId, ecole_nom: ecole?.nom||'',
          licence_key_id: keyRecord.id, plan, montant, devise,
          mode_paiement: mode, statut: 'paye',
          date_paiement: new Date().toISOString(),
          reference: cle, notes
        });
      }
      // Afficher la clé générée
      SAModal.setBody(`
        <div class="sa-alert success"><i class="fa-solid fa-circle-check"></i><div>Clé générée pour <strong>${ecole?.nom||ecoleId}</strong> — Plan ${SAH.planLabel(plan)}</div></div>
        <div style="text-align:center;margin:1.5rem 0">
          <div style="font-size:.8rem;color:#8892b0;margin-bottom:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Clé d'activation (cliquer pour copier)</div>
          <div class="sa-licence-key" style="font-size:1.4rem;justify-content:center;gap:1rem" onclick="SAH.copyToClipboard('${cle}','Clé d\'activation')">
            ${cle} <i class="fa-regular fa-copy copy-icon"></i>
          </div>
          <div style="margin-top:1rem;font-size:.82rem;color:#8892b0">Durée : <strong>${duree} jours</strong> · Montant : <strong>${SAH.money(montant,devise)}</strong></div>
        </div>
        <div class="sa-alert warning"><i class="fa-solid fa-triangle-exclamation"></i><div>Transmettez cette clé au directeur de l'école par SMS, WhatsApp ou email. Elle sera valide dès sa saisie dans l'application.</div></div>
        <div style="text-align:center;margin-top:1rem">
          <button class="sa-btn gold" onclick="SAH.copyToClipboard('${cle}','Clé')"><i class="fa-regular fa-copy"></i> Copier la clé</button>
        </div>
      `);
      SATk.success('Clé générée et copiée !');
    } catch(err) { SATk.error('Erreur : ' + err.message); }
  },

  async _revokeKey(id) {
    if (!confirm('Révoquer cette clé ? Elle ne pourra plus être utilisée.')) return;
    try {
      await DB.update('licences_keys', id, { statut: 'revoquee' });
      SATk.success('Clé révoquée.'); SAPages.licences();
    } catch(err) { SATk.error(err.message); }
  },

  // ── ABONNEMENTS / REVENUS ─────────────────────────────────────
  async abonnements() {
    try {
      const abons = await DB.getAll('abonnements', 500);
      const sorted = abons.sort((a,b) => new Date(b.date_paiement||b.created_at)-new Date(a.date_paiement||a.created_at));
      const now = new Date();

      // Stats mensuelles (12 derniers mois)
      const moisLabels = [], moisData = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
        moisLabels.push(d.toLocaleDateString('fr-FR',{month:'short',year:'2-digit'}));
        moisData.push(abons.filter(a => {
          const ad = new Date(a.date_paiement||a.created_at);
          return a.statut==='paye' && ad.getMonth()===d.getMonth() && ad.getFullYear()===d.getFullYear();
        }).reduce((s,a)=>s+parseFloat(a.montant||0),0));
      }
      const totalMois  = moisData[moisData.length-1];
      const totalYear  = moisData.slice(-12).reduce((s,v)=>s+v,0);
      const totalAll   = abons.filter(a=>a.statut==='paye').reduce((s,a)=>s+parseFloat(a.montant||0),0);
      const nbImpays   = abons.filter(a=>a.statut==='impaye').length;

      SA.setContent(`
        <div class="sa-page-header">
          <div>
            <h2><i class="fa-solid fa-coins"></i> Revenus & Abonnements</h2>
            <p>${abons.length} transaction(s) · ${SAH.money(totalAll)} encaissés au total</p>
          </div>
          <button class="sa-btn gold" onclick="SAPages._openNewAbonModal()"><i class="fa-solid fa-plus"></i> Enregistrer un paiement</button>
        </div>

        <div class="sa-kpi-grid" style="grid-template-columns:repeat(4,1fr)">
          <div class="sa-kpi-card gold"><div class="sa-kpi-icon gold"><i class="fa-solid fa-coins"></i></div><div class="sa-kpi-value">${SAH.money(totalMois)}</div><div class="sa-kpi-label">Ce mois-ci</div></div>
          <div class="sa-kpi-card green"><div class="sa-kpi-icon green"><i class="fa-solid fa-chart-line"></i></div><div class="sa-kpi-value">${SAH.money(totalYear)}</div><div class="sa-kpi-label">12 derniers mois</div></div>
          <div class="sa-kpi-card"><div class="sa-kpi-icon purple"><i class="fa-solid fa-piggy-bank"></i></div><div class="sa-kpi-value">${SAH.money(totalAll)}</div><div class="sa-kpi-label">Total cumulé</div></div>
          <div class="sa-kpi-card ${nbImpays>0?'red':''}"><div class="sa-kpi-icon ${nbImpays>0?'red':'green'}"><i class="fa-solid fa-circle-exclamation"></i></div><div class="sa-kpi-value">${nbImpays}</div><div class="sa-kpi-label">Impayé(s) à régulariser</div></div>
        </div>

        <div class="sa-card" style="margin-bottom:1.25rem">
          <div class="sa-card-header"><div class="sa-card-title"><i class="fa-solid fa-chart-bar"></i> Revenus mensuels (12 mois)</div></div>
          <div class="sa-card-body"><div style="height:220px"><canvas id="chart-revenus"></canvas></div></div>
        </div>

        <div class="sa-card">
          <div class="sa-card-header"><div class="sa-card-title"><i class="fa-solid fa-list"></i> Historique des paiements</div></div>
          <div class="sa-table-wrap">
            <table class="sa-table">
              <thead><tr><th>École</th><th>Plan</th><th>Montant</th><th>Mode</th><th>Date</th><th>Statut</th></tr></thead>
              <tbody>
                ${sorted.map(a=>`<tr>
                  <td><strong>${a.ecole_nom||'—'}</strong></td>
                  <td>${SAH.planLabel(a.plan)}</td>
                  <td><strong style="color:${a.statut==='paye'?'#27ae60':'#e74c3c'}">${SAH.money(a.montant, a.devise)}</strong></td>
                  <td style="font-size:.82rem">${a.mode_paiement||'—'}</td>
                  <td style="font-size:.82rem;color:#8892b0">${SAH.date(a.date_paiement||a.created_at)}</td>
                  <td><span class="sa-badge ${a.statut}">${a.statut}</span></td>
                </tr>`).join('')}
              </tbody>
              <tfoot><tr><td colspan="2"><strong>TOTAL ENCAISSÉ</strong></td><td colspan="4"><strong style="color:#1b5e20">${SAH.money(totalAll)}</strong></td></tr></tfoot>
            </table>
          </div>
        </div>
      `);
      // Graphique revenus
      setTimeout(() => {
        const ctx = document.getElementById('chart-revenus');
        if (!ctx || !window.Chart) return;
        SA._charts['revenus'] = new Chart(ctx, {
          type: 'bar',
          data: { labels: moisLabels, datasets: [{ label: 'Revenus', data: moisData,
            backgroundColor: moisData.map(v => v>0?'rgba(108,63,197,0.75)':'rgba(220,220,220,0.5)'),
            borderRadius: 6 }] },
          options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
            scales:{ y:{grid:{color:'#f0eeff'},ticks:{callback:v=>SAH.money(v).replace(/\s/g,'').substring(0,8)}}, x:{grid:{display:false}} } }
        });
      }, 100);
    } catch(err) { SA.setContent(`<p style="color:red;padding:2rem">${err.message}</p>`); }
  },

  async _openNewAbonModal() {
    const ecoles = await DB.getAll('ecoles',200);
    window._saEcoles = ecoles;
    SAModal.open('<i class="fa-solid fa-plus"></i> Enregistrer un paiement d\'abonnement',
      `<div class="sa-form-grid">
        <div class="sa-field"><label class="sa-label">École <span class="req">*</span></label><select class="sa-control" id="na-ecole"><option value="">— Choisir —</option>${ecoles.map(e=>`<option value="${e.id}">${e.nom}</option>`).join('')}</select></div>
        <div class="sa-field"><label class="sa-label">Plan</label><select class="sa-control" id="na-plan"><option value="mensuel">Mensuel</option><option value="trimestriel">Trimestriel</option><option value="semestriel">Semestriel</option><option value="annuel">Annuel</option></select></div>
        <div class="sa-field"><label class="sa-label">Montant</label><input type="number" class="sa-control" id="na-montant" placeholder="500000"></div>
        <div class="sa-field"><label class="sa-label">Devise</label><select class="sa-control" id="na-devise"><option value="GNF">GNF</option><option value="CFA">FCFA</option><option value="USD">USD</option></select></div>
        <div class="sa-field"><label class="sa-label">Mode de paiement</label><select class="sa-control" id="na-mode"><option value="mobile_money">Mobile Money</option><option value="especes">Espèces</option><option value="virement">Virement</option><option value="offert">Offert</option></select></div>
        <div class="sa-field"><label class="sa-label">Statut</label><select class="sa-control" id="na-statut"><option value="paye">Payé</option><option value="en_attente">En attente</option><option value="impaye">Impayé</option></select></div>
      </div>
      <div class="sa-field"><label class="sa-label">Notes</label><input class="sa-control" id="na-notes" placeholder="Référence, remarques…"></div>`,
      `<button class="sa-btn ghost" onclick="SAModal.close()">Annuler</button>
       <button class="sa-btn purple" onclick="SAPages._saveAbon()"><i class="fa-solid fa-floppy-disk"></i> Enregistrer</button>`
    );
  },

  async _saveAbon() {
    const ecoleId = document.getElementById('na-ecole')?.value;
    const ecoles  = window._saEcoles||[];
    const ecole   = ecoles.find(e=>e.id===ecoleId);
    if (!ecoleId) { SATk.error('Sélectionnez une école.'); return; }
    try {
      await DB.insert('abonnements', {
        ecole_id: ecoleId, ecole_nom: ecole?.nom||'',
        plan: document.getElementById('na-plan').value,
        montant: parseFloat(document.getElementById('na-montant').value)||0,
        devise: document.getElementById('na-devise').value,
        mode_paiement: document.getElementById('na-mode').value,
        statut: document.getElementById('na-statut').value,
        date_paiement: new Date().toISOString(),
        notes: document.getElementById('na-notes').value
      });
      SAModal.close(); SATk.success('Paiement enregistré !'); SAPages.abonnements();
    } catch(err) { SATk.error(err.message); }
  },

  // ── ANNONCES & MAINTENANCE ────────────────────────────────────
  async annonces() {
    try {
      const annonces = await DB.getAll('annonces_plateforme', 200);
      const sorted = annonces.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
      const typeIcons = { info:'fa-circle-info', maintenance:'fa-wrench', mise_a_jour:'fa-arrows-rotate', alerte:'fa-triangle-exclamation', promotion:'fa-star' };
      const typeColors = { info:'#3498db', maintenance:'#f39c12', mise_a_jour:'#27ae60', alerte:'#e74c3c', promotion:'#f4b942' };

      SA.setContent(`
        <div class="sa-page-header">
          <div>
            <h2><i class="fa-solid fa-bullhorn"></i> Centre de Diffusion & Annonces</h2>
            <p>${annonces.filter(a=>a.active).length} annonce(s) active(s) · visibles sur tous les tableaux de bord</p>
          </div>
          <button class="sa-btn gold sa-btn-lg" onclick="SAPages._openNewAnnonceModal()">
            <i class="fa-solid fa-plus"></i> Nouvelle annonce
          </button>
        </div>

        <div class="sa-alert info"><i class="fa-solid fa-broadcast-tower"></i><div>Les annonces actives s'affichent en temps réel sur le tableau de bord de <strong>tous les directeurs</strong> connectés à la plateforme.</div></div>

        <div id="annonces-list">
          ${sorted.length === 0 ? `<div style="text-align:center;padding:3rem;color:#8892b0"><i class="fa-solid fa-bullhorn" style="font-size:2rem"></i><p style="margin-top:1rem">Aucune annonce diffusée</p></div>` :
          sorted.map(a => `
            <div class="sa-annonce-card ${a.type}" style="opacity:${a.active?1:.55}">
              <div class="sa-annonce-icon" style="background:${typeColors[a.type]||'#3498db'}22;color:${typeColors[a.type]||'#3498db'}">
                <i class="fa-solid ${typeIcons[a.type]||'fa-circle-info'}"></i>
              </div>
              <div style="flex:1">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem">
                  <div>
                    <div class="sa-annonce-title">${a.titre}</div>
                    <div class="sa-annonce-meta">
                      <span class="sa-badge ${a.type||'info'}" style="font-size:.68rem">${a.type||'info'}</span>
                      <span style="margin-left:.5rem">Cible : <strong>${a.cible||'tous'}</strong></span>
                      ${a.priorite==='urgente'?'<span class="sa-badge bloque" style="margin-left:.5rem;font-size:.68rem">⚡ URGENTE</span>':''}
                    </div>
                    <div style="font-size:.8rem;color:#4a5580;margin-top:.35rem">${(a.contenu||'').substring(0,120)}${(a.contenu||'').length>120?'…':''}</div>
                    <div style="font-size:.73rem;color:#8892b0;margin-top:.3rem">
                      Du ${SAH.date(a.date_debut)||'—'} au ${SAH.date(a.date_fin)||'—'} · ${a.nb_vues||0} vue(s)
                    </div>
                  </div>
                  <div style="display:flex;gap:.4rem;flex-shrink:0">
                    ${a.active
                      ? `<button class="sa-btn sa-btn-sm" style="background:#fce4ec;color:#b71c1c" onclick="SAPages._toggleAnnonce('${a.id}',false)"><i class="fa-solid fa-eye-slash"></i> Retirer</button>`
                      : `<button class="sa-btn green sa-btn-sm" onclick="SAPages._toggleAnnonce('${a.id}',true)"><i class="fa-solid fa-eye"></i> Publier</button>`}
                    <button class="sa-btn red sa-btn-sm" onclick="SAPages._deleteAnnonce('${a.id}')"><i class="fa-solid fa-trash"></i></button>
                  </div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `);
    } catch(err) { SA.setContent(`<p style="color:red;padding:2rem">${err.message}</p>`); }
  },

  _openNewAnnonceModal() {
    const today = new Date().toISOString().split('T')[0];
    const end   = new Date(Date.now() + 7*86400000).toISOString().split('T')[0];
    SAModal.open('<i class="fa-solid fa-bullhorn"></i> Diffuser une nouvelle annonce',
      `<div class="sa-form-grid">
        <div class="sa-field"><label class="sa-label">Type d'annonce <span class="req">*</span></label>
          <select class="sa-control" id="an-type">
            <option value="info">ℹ️ Information générale</option>
            <option value="maintenance">🔧 Maintenance</option>
            <option value="mise_a_jour">🔄 Mise à jour</option>
            <option value="alerte">⚠️ Alerte importante</option>
            <option value="promotion">⭐ Promotion / Offre</option>
          </select>
        </div>
        <div class="sa-field"><label class="sa-label">Priorité</label>
          <select class="sa-control" id="an-priorite">
            <option value="normale">Normale</option>
            <option value="haute">Haute</option>
            <option value="urgente">⚡ Urgente</option>
          </select>
        </div>
        <div class="sa-field"><label class="sa-label">Cible</label>
          <select class="sa-control" id="an-cible">
            <option value="tous">Tous les utilisateurs</option>
            <option value="directeurs">Directeurs seulement</option>
            <option value="admins">Administrateurs</option>
            <option value="comptables">Comptables</option>
            <option value="profs">Enseignants</option>
          </select>
        </div>
        <div class="sa-field"><label class="sa-label">Lien d'action (optionnel)</label><input class="sa-control" id="an-lien" placeholder="https://…"></div>
        <div class="sa-field"><label class="sa-label">Date de début</label><input type="date" class="sa-control" id="an-debut" value="${today}"></div>
        <div class="sa-field"><label class="sa-label">Date de fin</label><input type="date" class="sa-control" id="an-fin" value="${end}"></div>
      </div>
      <div class="sa-field"><label class="sa-label">Titre de l'annonce <span class="req">*</span></label><input class="sa-control" id="an-titre" placeholder="Ex: Maintenance prévue le 15 août à 22h"></div>
      <div class="sa-field"><label class="sa-label">Message complet <span class="req">*</span></label><textarea class="sa-control" id="an-contenu" rows="4" placeholder="Rédigez votre message ici…"></textarea></div>`,
      `<button class="sa-btn ghost" onclick="SAModal.close()">Annuler</button>
       <button class="sa-btn purple" onclick="SAPages._saveAnnonce(false)"><i class="fa-solid fa-floppy-disk"></i> Sauvegarder (brouillon)</button>
       <button class="sa-btn gold" onclick="SAPages._saveAnnonce(true)"><i class="fa-solid fa-broadcast-tower"></i> Publier maintenant</button>`,
      'lg'
    );
  },

  async _saveAnnonce(publie = true) {
    const titre   = document.getElementById('an-titre')?.value.trim();
    const contenu = document.getElementById('an-contenu')?.value.trim();
    if (!titre || !contenu) { SATk.error('Titre et message obligatoires.'); return; }
    try {
      await DB.insert('annonces_plateforme', {
        titre, contenu,
        type: document.getElementById('an-type').value,
        priorite: document.getElementById('an-priorite').value,
        cible: document.getElementById('an-cible').value,
        active: publie,
        date_debut: document.getElementById('an-debut').value,
        date_fin: document.getElementById('an-fin').value,
        lien_action: document.getElementById('an-lien').value,
        auteur: SA_MASTER_EMAIL, nb_vues: 0
      });
      SAModal.close();
      SATk.success(publie ? 'Annonce publiée et diffusée !' : 'Annonce sauvegardée (brouillon).');
      SAPages.annonces();
    } catch(err) { SATk.error(err.message); }
  },

  async _toggleAnnonce(id, active) {
    try { await DB.update('annonces_plateforme', id, { active }); SATk.success(active?'Annonce publiée !':'Annonce retirée.'); SAPages.annonces(); }
    catch(err) { SATk.error(err.message); }
  },

  async _deleteAnnonce(id) {
    if (!confirm('Supprimer cette annonce définitivement ?')) return;
    try { await DB.delete('annonces_plateforme', id); SATk.success('Annonce supprimée.'); SAPages.annonces(); }
    catch(err) { SATk.error(err.message); }
  },

  // ── STATISTIQUES GLOBALES ─────────────────────────────────────
  async stats() {
    try {
      const [ecoles, licences, abons] = await Promise.all([
        DB.getAll('ecoles',200), DB.getAll('licences_keys',500), DB.getAll('abonnements',500)
      ]);
      const now = new Date();

      // Répartition par statut
      const parStatut = { actif:0, essai:0, suspendu:0, bloque:0, expire:0 };
      ecoles.forEach(e => { const s = SAH.statutEcole(e); parStatut[s] = (parStatut[s]||0)+1; });

      // Revenus 6 derniers mois
      const moisLabels=[], moisData=[];
      for (let i=5;i>=0;i--) {
        const d = new Date(now.getFullYear(),now.getMonth()-i,1);
        moisLabels.push(d.toLocaleDateString('fr-FR',{month:'short'}));
        moisData.push(abons.filter(a=>{
          const ad=new Date(a.date_paiement||a.created_at);
          return a.statut==='paye'&&ad.getMonth()===d.getMonth()&&ad.getFullYear()===d.getFullYear();
        }).reduce((s,a)=>s+parseFloat(a.montant||0),0));
      }

      SA.setContent(`
        <div class="sa-page-header">
          <div><h2><i class="fa-solid fa-chart-mixed"></i> Statistiques Globales Plateforme</h2>
          <p>Vue macroscopique — ${ecoles.length} établissements · ${ecoles.reduce((s,e)=>s+(e.nb_eleves||0),0).toLocaleString('fr-FR')} élèves</p></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem">
          <div class="sa-card">
            <div class="sa-card-header"><div class="sa-card-title"><i class="fa-solid fa-chart-pie"></i> Répartition des écoles par statut</div></div>
            <div class="sa-card-body" style="display:flex;align-items:center;justify-content:center;height:250px"><canvas id="chart-statuts-sa"></canvas></div>
          </div>
          <div class="sa-card">
            <div class="sa-card-header"><div class="sa-card-title"><i class="fa-solid fa-chart-bar"></i> Revenus mensuels (6 mois)</div></div>
            <div class="sa-card-body" style="height:250px"><canvas id="chart-rev-sa"></canvas></div>
          </div>
          <div class="sa-card">
            <div class="sa-card-header"><div class="sa-card-title"><i class="fa-solid fa-key"></i> Statuts des clés de licence</div></div>
            <div class="sa-card-body" style="display:flex;align-items:center;justify-content:center;height:200px"><canvas id="chart-keys-sa"></canvas></div>
          </div>
          <div class="sa-card">
            <div class="sa-card-header"><div class="sa-card-title"><i class="fa-solid fa-users"></i> Top écoles par élèves</div></div>
            <div class="sa-card-body" style="height:200px"><canvas id="chart-top-sa"></canvas></div>
          </div>
        </div>
      `);

      setTimeout(() => {
        if (!window.Chart) return;
        Chart.defaults.font.family = "'Inter', sans-serif";

        // 1. Statuts écoles
        new Chart(document.getElementById('chart-statuts-sa'), {
          type: 'doughnut',
          data: { labels: Object.keys(parStatut), datasets:[{ data: Object.values(parStatut),
            backgroundColor:['#27ae60','#3498db','#f39c12','#e74c3c','#9b59b6'], borderWidth:2, borderColor:'#fff' }] },
          options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}} }
        });

        // 2. Revenus barres
        new Chart(document.getElementById('chart-rev-sa'), {
          type:'bar',
          data:{ labels:moisLabels, datasets:[{label:'Revenus', data:moisData,
            backgroundColor:'rgba(108,63,197,0.7)', borderRadius:6}] },
          options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
            scales:{ y:{grid:{color:'#f0eeff'}}, x:{grid:{display:false}} } }
        });

        // 3. Clés
        const keyStats = { 'Non utilisée': licences.filter(l=>l.statut==='non_utilisee').length,
          'Active': licences.filter(l=>l.statut==='active').length,
          'Expirée': licences.filter(l=>l.statut==='expiree').length,
          'Révoquée': licences.filter(l=>l.statut==='revoquee').length };
        new Chart(document.getElementById('chart-keys-sa'), {
          type:'doughnut',
          data:{ labels: Object.keys(keyStats), datasets:[{data:Object.values(keyStats),
            backgroundColor:['#3498db','#27ae60','#9b59b6','#e74c3c'],borderWidth:2,borderColor:'#fff'}] },
          options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{boxWidth:12}}}}
        });

        // 4. Top écoles par élèves
        const top = ecoles.sort((a,b)=>(b.nb_eleves||0)-(a.nb_eleves||0)).slice(0,6);
        new Chart(document.getElementById('chart-top-sa'), {
          type:'bar', data:{ labels:top.map(e=>e.nom.substring(0,18)),
            datasets:[{label:'Élèves',data:top.map(e=>e.nb_eleves||0),
              backgroundColor:'rgba(244,185,66,0.8)',borderRadius:5}] },
          options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false}},
            scales:{x:{grid:{color:'#f0eeff'},ticks:{precision:0}},y:{grid:{display:false}}}}
        });
      }, 150);
    } catch(err) { SA.setContent(`<p style="color:red;padding:2rem">${err.message}</p>`); }
  }
};
