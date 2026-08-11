/**
 * app.js — Contrôleur principal Zean School Manager (R12)
 * Auth multi-tenancy : Code École → Email/MDP
 * Isolation données par ecole_code, identité dynamique, LicenceManager
 */

const App = {
  currentUser   : null,
  currentPage   : 'dashboard',
  currentEcole  : null,   // objet école courant (depuis table ecoles ou ecole_config)

  async init() {
    this.showLoader(true);
    await this.loadSession();
    this.bindGlobalEvents();
    this.updateClock();
    setInterval(() => this.updateClock(), 60000);
    this.showLoader(false);
  },

  showLoader(show) {
    let loader = document.getElementById('app-loader');
    if (show) {
      if (!loader) {
        loader = document.createElement('div');
        loader.id = 'app-loader';
        loader.innerHTML = `
          <div style="position:fixed;inset:0;background:#fff;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem">
            <div style="width:56px;height:56px;background:linear-gradient(135deg,#1a73e8,#0d47a1);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:1.6rem;color:white;box-shadow:0 8px 24px rgba(26,115,232,.35)">
              <i class="fa-solid fa-graduation-cap"></i>
            </div>
            <div style="font-size:1.1rem;font-weight:700;color:#202124">Zean School Manager</div>
            <div class="loading-spinner"></div>
            <div style="font-size:.8rem;color:#6c757d">Connexion à la base de données…</div>
          </div>`;
        document.body.appendChild(loader);
      }
      loader.style.display = 'flex';
    } else {
      if (loader) loader.style.display = 'none';
    }
  },

  // ── SESSION ──────────────────────────────────────────────────
  async loadSession() {
    const savedUser  = sessionStorage.getItem('zean_current_user');
    const savedEcole = sessionStorage.getItem('zean_current_ecole');
    if (savedUser) {
      this.currentUser  = JSON.parse(savedUser);
      this.currentEcole = savedEcole ? JSON.parse(savedEcole) : null;
      // Restaurer le code école dans DB pour le filtrage
      if (this.currentEcole?.code) DB.setCurrentEcoleCode(this.currentEcole.code);
      await this.showApp();
    } else {
      this.showLogin();
    }
  },

  saveSession(user, ecole) {
    this.currentUser  = user;
    this.currentEcole = ecole || null;
    sessionStorage.setItem('zean_current_user',  JSON.stringify(user));
    if (ecole) sessionStorage.setItem('zean_current_ecole', JSON.stringify(ecole));
  },

  clearSession() {
    this.currentUser  = null;
    this.currentEcole = null;
    sessionStorage.removeItem('zean_current_user');
    sessionStorage.removeItem('zean_current_ecole');
    sessionStorage.removeItem('zean_school_code');
    DB.setCurrentEcoleCode(null);
    DB.stopAutoSync(); // arrêter la sync en arrière-plan
  },

  // ── LOGIN MULTI-TENANCY ───────────────────────────────────────
  // Étape 1 : Afficher l'écran de login (étape Code École)
  showLogin() {
    document.getElementById('login-page').style.display = 'flex';
    document.getElementById('app').classList.remove('active');
    // Réinitialiser aux étapes de base
    this._loginShowStep('code');
  },

  // Basculer entre les 2 étapes
  _loginShowStep(step) {
    const stepCode  = document.getElementById('login-step-code');
    const stepCreds = document.getElementById('login-step-creds');
    const banner    = document.getElementById('ecole-found-banner');
    if (step === 'code') {
      stepCode.style.display  = 'flex';
      stepCreds.classList.remove('visible');
      if (banner) banner.classList.remove('visible');
    } else {
      stepCode.style.display = 'none';
      stepCreds.classList.add('visible');
    }
  },

  loginGoBack() {
    this._loginShowStep('code');
    const errEl = document.getElementById('school-code-error');
    if (errEl) errEl.textContent = '';
    DB.setCurrentEcoleCode(null);
    sessionStorage.removeItem('zean_school_code');
  },

  // Étape 1 : Vérifier le Code École
  async verifySchoolCode() {
    const codeInput = document.getElementById('login-school-code');
    const errEl     = document.getElementById('school-code-error');
    const btn       = document.getElementById('school-code-btn');
    const code      = (codeInput?.value || '').trim().toUpperCase();

    if (errEl) errEl.textContent = '';
    if (!code) {
      if (errEl) errEl.textContent = 'Veuillez entrer le code de votre école.';
      codeInput?.focus();
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<div class="loading-spinner" style="width:16px;height:16px;border-width:2px;display:inline-block"></div> Vérification…';

    try {
      // Chercher l'école dans la table 'ecoles' (SaaS) OU dans 'ecole_config' (mono-école)
      let ecole = null;

      // Tentative 0 (prioritaire) : registre LOCAL IndexedDB `ecoles`
      // → une école créée depuis le SuperAdmin est reconnue immédiatement.
      try {
        if (typeof DB.findEcoleByCode === 'function') {
          ecole = await DB.findEcoleByCode(code);
        }
      } catch { /* ignore */ }

      // Tentative 1 : base cloud partagée (école créée sur un autre appareil)
      if (!ecole && navigator.onLine && window.ZeanCloud) {
        try {
          const row = await ZeanCloud.findEcoleByCode(code);
          if (row) {
            ecole = row;
            // Persister localement pour les connexions suivantes (hors-ligne)
            if (typeof DB.registerEcole === 'function') {
              try { await DB.registerEcole(ecole); } catch { /* ignore */ }
            }
          }
        } catch { /* cloud indisponible */ }
      }

      // Tentative 2 : table 'ecole_config' — code stocké dans le champ 'matricule_prefix' ou 'code_ecole'
      if (!ecole) {
        try {
          const cfg = await DB.getEcoleConfig();
          const cfgCode = (cfg?.code_ecole || cfg?.matricule_prefix || '').toUpperCase();
          if (cfgCode && (cfgCode === code || code === 'DEMO')) {
            ecole = {
              id    : cfg.id || 'local',
              code  : cfgCode || code,
              nom   : cfg.nom || 'École',
              ville : cfg.ville || cfg.adresse || '',
              logo_url : cfg.logo_url || '',
              statut   : 'actif',
              essai_fin : cfg.essai_fin || null,
              licence_fin: cfg.licence_fin || null,
            };
          }
        } catch { /* ignore */ }
      }

      // Mode DÉMO : si le code est DEMO, on l'accepte toujours
      if (!ecole && code === 'DEMO') {
        ecole = {
          id: 'demo', code: 'DEMO', nom: 'École Démo Zean',
          ville: 'Conakry', statut: 'actif', essai_fin: null, licence_fin: null
        };
      }


      if (!ecole) {
        if (errEl) errEl.textContent = `Code "${code}" non reconnu. Vérifiez auprès de votre administration.`;
        return;
      }

      // École trouvée — vérifier si suspendue ou bloquée
      if (ecole.statut === 'bloque') {
        if (errEl) errEl.textContent = 'Cet établissement est actuellement bloqué. Contactez editrice@zean.app.';
        return;
      }
      if (ecole.statut === 'suspendu') {
        if (errEl) errEl.textContent = 'Cet établissement est suspendu. Contactez editrice@zean.app.';
        return;
      }

      // Mémoriser le code dans DB pour filtrer les requêtes
      DB.setCurrentEcoleCode(code);
      sessionStorage.setItem('zean_school_code', code);
      sessionStorage.setItem('zean_school_data', JSON.stringify(ecole));

      // Afficher la bannière de confirmation de l'école
      const banner   = document.getElementById('ecole-found-banner');
      const namEl    = document.getElementById('ecole-found-name');
      const villeEl  = document.getElementById('ecole-found-ville');
      const logoEl   = document.getElementById('ecole-found-logo');
      if (banner) {
        if (namEl)   namEl.textContent  = ecole.nom || code;
        if (villeEl) villeEl.textContent = ecole.ville || '';
        if (logoEl && ecole.logo_url) {
          logoEl.src = ecole.logo_url;
          logoEl.classList.add('visible');
        } else if (logoEl) { logoEl.classList.remove('visible'); }
        banner.classList.add('visible');
      }

      // Passer à l'étape 2 (identifiants)
      this._loginShowStep('creds');
      document.getElementById('login-email')?.focus();

    } catch (err) {
      console.error('verifySchoolCode error:', err);
      if (errEl) errEl.textContent = 'Erreur réseau. Vérifiez votre connexion.';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-arrow-right"></i> Continuer';
    }
  },

  // Étape 2 : Authentification email/MDP
  async handleLogin(e) {
    e.preventDefault();
    const email  = document.getElementById('login-email').value.trim();
    const pwd    = document.getElementById('login-pwd').value;
    const errEl  = document.getElementById('login-error');
    const btn    = e.target.querySelector('button[type="submit"]');
    errEl.textContent = '';
    btn.disabled = true;
    btn.innerHTML = '<div class="loading-spinner" style="width:18px;height:18px;border-width:2px"></div> Connexion…';

    try {
      // Récupérer l'école sélectionnée à l'étape 1
      const ecoleData = sessionStorage.getItem('zean_school_data');
      const ecole     = ecoleData ? JSON.parse(ecoleData) : null;

      // ── Authentification cloud (session réelle, partage entre appareils) ──
      // L'écran de connexion reste identique : on tente d'ouvrir une session
      // cloud en arrière-plan, puis on retombe sur le contrôle local.
      let cloudProfil = null;
      if (navigator.onLine && window.ZeanCloud) {
        try {
          const res = await ZeanCloud.signIn(email, pwd);
          if (!res.error) cloudProfil = await ZeanCloud.getProfil();
        } catch { /* mode local */ }
      }

      // Charger les utilisateurs filtrés par école
      const users = await DB.getUsersByEcole(ecole?.code);
      const user  = users.find(u =>
        u.email?.toLowerCase() === email.toLowerCase() &&
        u.mot_de_passe === pwd &&
        u.actif !== false
      );

      // Compte présent dans le cloud mais pas encore en local → on l'adopte
      let localUser = user;
      if (!localUser && cloudProfil) {
        localUser = {
          id: cloudProfil.user_id, email: cloudProfil.email, role: cloudProfil.role,
          prenom: cloudProfil.prenom, nom: cloudProfil.nom, actif: cloudProfil.actif !== false,
          ecole_code: cloudProfil.ecole_code
        };
        try { await DB._idbPut('utilisateurs', localUser, false); } catch {}
      }

      if (!localUser) {
        errEl.textContent = 'Email ou mot de passe incorrect.';
        document.getElementById('login-pwd').classList.add('shake');
        setTimeout(() => document.getElementById('login-pwd').classList.remove('shake'), 500);
        return;
      }

      // Enrichir l'utilisateur avec les infos de l'école
      const enrichedUser = {
        ...localUser,
        ecole_code : ecole?.code  || user.ecole_code || '',
        ecole_id   : ecole?.id    || user.ecole_id   || '',
        ecole_nom  : ecole?.nom   || user.ecole_nom  || '',
      };

      this.saveSession(enrichedUser, ecole);
      await this.showApp();
      Toast.success(`Bienvenue, ${localUser.prenom || localUser.nom} !`);

    } catch (err) {
      errEl.textContent = 'Erreur de connexion au serveur. Réessayez.';
      console.error(err);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Se connecter';
    }
  },

  logout() {
    if (!confirm('Voulez-vous vraiment vous déconnecter ?')) return;
    try { DB.stopRealtime && DB.stopRealtime(); } catch {}
    try { window.ZeanCloud && ZeanCloud.signOut(); } catch {}
    this.clearSession();
    // Masquer le lock screen si visible
    const lock = document.getElementById('licence-lock-screen');
    if (lock) lock.style.display = 'none';
    document.getElementById('login-page').style.display = 'flex';
    document.getElementById('app').classList.remove('active');
    this.showLogin();
  },

  // ── APP LAYOUT ────────────────────────────────────────────────
  async showApp() {
    try {
      // ── R17 : Pull initial BLOQUANT ─────────────────────────────
      // Avant TOUT affichage, on s'assure que IndexedDB est peuplée.
      // Si déjà fait (session restaurée), on saute.
      // Si offline, _initialPull retourne immédiatement (IDB déjà peuplée).
      if (!DB._pullReady) {
        this._showSyncIndicator(true);
        try { await DB._initialPull(); } catch { DB._pullReady = true; }
        this._showSyncIndicator(false);
      }

      const cfg = await DB.getEcoleConfig();
      if (!cfg?.configured && this.currentUser?.role === 'admin') {
        document.getElementById('login-page').style.display = 'none';
        document.getElementById('app').classList.add('active');
        this.buildSidebar();
        this.buildUserInfo();
        Wizard.show();
        DB.startAutoSync(30000);
        return;
      }
      document.getElementById('login-page').style.display = 'none';
      document.getElementById('app').classList.add('active');
      this.buildSidebar();
      this.buildUserInfo();
      const gearBtn = document.getElementById('topbar-config-btn');
      if (gearBtn) {
        const role = this.currentUser?.role;
        const noConfig = ['prof', 'directeur', 'comptable', 'superviseur'];
        gearBtn.style.display = noConfig.includes(role) ? 'none' : '';
      }
      await this.updateSchoolName();
      // Démarrer sync auto en arrière-plan (30s)
      DB.startAutoSync(30000);
      // Vérification licence
      const ecoleId   = this.currentUser?.ecole_id   || '';
      const ecoleCode = this.currentUser?.ecole_code || sessionStorage.getItem('zean_school_code') || '';
      if (['admin','directeur'].includes(this.currentUser?.role)) {
        LicenceManager.check(ecoleId || ecoleCode).catch(() => {});
      }
      if (ecoleId || ecoleCode) LicenceManager.loadAnnonces(ecoleId || ecoleCode).catch(() => {});
      this.navigateTo('dashboard');
    } catch (err) {
      console.error('showApp error:', err);
      document.getElementById('app').classList.add('active');
      this._showSyncIndicator(false);
      this.navigateTo('dashboard');
    }
  },

  // Indicateur discret de chargement initial (sous le loader principal)
  _showSyncIndicator(show) {
    let el = document.getElementById('sync-init-indicator');
    if (show) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'sync-init-indicator';
        el.style.cssText = 'position:fixed;bottom:1rem;right:1rem;background:rgba(26,115,232,.92);color:#fff;padding:.5rem 1rem;border-radius:20px;font-size:.82rem;z-index:9998;display:flex;align-items:center;gap:.5rem;box-shadow:0 2px 12px rgba(0,0,0,.2)';
        el.innerHTML = '<span style="width:12px;height:12px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;display:inline-block;animation:spin .7s linear infinite"></span> Synchronisation des données…';
        document.body.appendChild(el);
      }
      el.style.display = 'flex';
    } else {
      if (el) el.remove();
    }
  },

  buildSidebar() {
    const role = this.currentUser?.role;
    const nav = document.getElementById('sidebar-nav');

    // Bloc 4 : prof voit Bordereau au lieu de Bulletins, pas de Finance ni Config
    // Bloc 5 : directeur : pas de Finance, pas de Config, Notes en lecture seule
    // R10 : superviseur = lecture seule sur notes/présences/classes, pas de finance
    // T4.4 : bordereau aussi accessible pour admin & directeur
    const menus = [
      { section: 'Principal', items: [
        { id: 'dashboard', icon: 'fa-gauge-high', label: 'Tableau de bord', roles: ['admin','directeur','comptable','prof','superviseur'] },
      ]},
      { section: 'Supervision', items: [
        { id: 'supervisionEnseignants', icon: 'fa-user-shield', label: 'Supervision Enseignants', roles: ['superviseur'] },
      ]},
      { section: 'Académique', items: [
        { id: 'eleves',    icon: 'fa-user-graduate',  label: 'Élèves',             roles: ['admin','directeur','prof','comptable'] },
        { id: 'classes',   icon: 'fa-chalkboard',     label: 'Classes',            roles: ['admin','directeur','superviseur'] },
        { id: 'matieres',  icon: 'fa-book-open',      label: 'Matières',           roles: ['admin','directeur','prof','superviseur'] },
        { id: 'notes',     icon: 'fa-pen-to-square',  label: 'Saisie Notes',       roles: ['admin','prof'] },
        { id: 'notes',     icon: 'fa-eye',            label: 'Consulter Notes',    roles: ['directeur','superviseur'] },
        { id: 'bulletins', icon: 'fa-file-lines',     label: 'Bulletins',          roles: ['admin','directeur'] },
        { id: 'bordereau', icon: 'fa-table-list',     label: 'Bordereau de Notes', roles: ['prof','admin','directeur','superviseur'] },
        { id: 'presences', icon: 'fa-clipboard-check',label: 'Appel Journalier',   roles: ['admin','prof','directeur','superviseur'] },
      ]},
      { section: 'Finance', items: [
        { id: 'paiements',       icon: 'fa-money-bill-wave',label: 'Paiements',          roles: ['admin','comptable'] },
        { id: 'depenses',        icon: 'fa-receipt',        label: 'Dépenses',           roles: ['admin','comptable'] },
        { id: 'rapports',        icon: 'fa-chart-bar',      label: 'Rapports',           roles: ['admin','comptable'] },
        { id: 'grillePaiements', icon: 'fa-table-cells',    label: 'Grille Paiements',   roles: ['admin','comptable'] },
        { id: 'comptabilite',    icon: 'fa-calculator',     label: 'Comptabilité & Caisse', roles: ['admin','comptable','directeur'] },
      ]},
      { section: 'Statistiques', items: [
        { id: 'statistiques', icon: 'fa-chart-mixed', label: 'Statistiques & Graphiques', roles: ['admin','directeur'] },
      ]},
      { section: 'Administration', items: [
        { id: 'utilisateurs',    icon: 'fa-users-gear',    label: 'Utilisateurs',     roles: ['admin'] },
        { id: 'config',          icon: 'fa-gear',          label: 'Configuration',    roles: ['admin'] },
        { id: 'cloture',         icon: 'fa-calendar-xmark',label: 'Clôture Année',    roles: ['admin'] },
        { id: 'auditLog',        icon: 'fa-shield-halved', label: 'Journal d\'Audit', roles: ['admin','directeur'], badge: 'audit' },
      ]}
    ];
    let html = '';
    menus.forEach(section => {
      const allowed = section.items.filter(i => i.roles.includes(role));
      if (!allowed.length) return;
      html += `<div class="nav-section-label">${section.section}</div>`;
      allowed.forEach(item => {
        const badgeHtml = item.badge === 'audit'
          ? `<span id="audit-badge" style="display:none;background:#ea4335;color:white;border-radius:50%;min-width:18px;height:18px;font-size:.65rem;font-weight:700;line-height:18px;text-align:center;padding:0 4px;margin-left:auto">0</span>`
          : '';
        html += `<div class="nav-item" data-page="${item.id}" onclick="App.navigateTo('${item.id}')">
          <i class="fa-solid ${item.icon}"></i><span>${item.label}</span>${badgeHtml}
        </div>`;
      });
    });
    nav.innerHTML = html;
    // T2.3 — Charger le badge audit en arrière-plan
    this._refreshAuditBadge();
  },

  // T2.3 — Rafraîchir le badge (pastille rouge) du journal d'audit
  async _refreshAuditBadge() {
    try {
      const role = this.currentUser?.role;
      if (!['admin','directeur'].includes(role)) return;
      const logs = await DB.query('notes_audit_log', l => l.statut === 'pending_validation');
      const nb = logs.length;
      const badge = document.getElementById('audit-badge');
      if (!badge) return;
      if (nb > 0) {
        badge.textContent = nb > 99 ? '99+' : nb;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    } catch {}
  },

  buildUserInfo() {
    const u = this.currentUser;
    if (!u) return;
    const initials = ((u.prenom?.[0] || '') + (u.nom?.[0] || '')).toUpperCase() || '?';
    const roles = { admin: 'Administrateur', directeur: 'Directeur', comptable: 'Comptable', prof: 'Enseignant', superviseur: 'Superviseur Enseignants' };
    document.getElementById('user-avatar').textContent = initials;
    document.getElementById('user-name').textContent = `${u.prenom || ''} ${u.nom || ''}`.trim();
    document.getElementById('user-role-label').textContent = roles[u.role] || u.role;
  },

  async updateSchoolName() {
    try {
      // 1. Priorité : données école SaaS mémorisées en session
      const ecoleData = sessionStorage.getItem('zean_school_data');
      const ecole = ecoleData ? JSON.parse(ecoleData) : null;

      // 2. Fallback : table ecole_config
      const cfg = await DB.getEcoleConfig();

      const name     = ecole?.nom      || cfg?.nom      || 'Votre École';
      const ville    = ecole?.ville     || cfg?.ville    || '';
      const logoUrl  = ecole?.logo_url  || cfg?.logo_url || '';
      const code     = ecole?.code      || cfg?.code_ecole || sessionStorage.getItem('zean_school_code') || '';

      // Sidebar : titre + code
      const sideTitle = document.getElementById('sidebar-school-name');
      const sideCode  = document.getElementById('sidebar-school-code-display');
      if (sideTitle) sideTitle.textContent = name;
      if (sideCode)  sideCode.textContent  = code ? `Code : ${code}` : '';

      // Logo sidebar dynamique
      const sideLogoWrap = document.querySelector('.sidebar-logo');
      if (sideLogoWrap && logoUrl) {
        sideLogoWrap.innerHTML = `<img src="${logoUrl}" alt="${name}" style="width:36px;height:36px;object-fit:cover;border-radius:8px"><span class="sidebar-cross-badge">✦</span>`;
      }

      // Titre de la page navigateur
      document.title = `${name} — Zean School Manager`;

    } catch {}
  },

  navigateTo(pageId) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
    if (navItem) navItem.classList.add('active');
    this.currentPage = pageId;

    const titles = {
      dashboard: 'Tableau de bord', eleves: 'Gestion des Élèves',
      classes: 'Classes', matieres: 'Matières',
      notes: 'Saisie des Notes', bulletins: 'Bulletins Scolaires',
      bordereau: 'Bordereau de Notes',
      presences: 'Appel Journalier',
      paiements: 'Paiements Scolarité', depenses: 'Dépenses',
      rapports: 'Rapports Financiers', utilisateurs: 'Utilisateurs',
      config: 'Configuration',
      auditLog: 'Journal d\'Audit des Notes',
      grillePaiements: 'Grille des Paiements par Classe',
      supervisionEnseignants: 'Supervision des Enseignants',
      statistiques: 'Statistiques & Graphiques',
      cloture: 'Clôture d\'Année Scolaire'
    };
    document.getElementById('page-title').textContent = titles[pageId] || pageId;

    const content = document.getElementById('main-content');
    content.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4rem;gap:1rem;color:var(--gray-500)">
      <div class="loading-spinner" style="width:32px;height:32px"></div>
      <span>Chargement…</span>
    </div>`;

    // R12 — Rafraîchir les annonces plateforme à chaque visite du dashboard
    if (pageId === 'dashboard') {
      const ecoleId = this.currentUser?.ecole_id || '';
      if (ecoleId) LicenceManager.loadAnnonces(ecoleId).catch(() => {});
    }

    const renderers = {
      dashboard:                () => Pages.dashboard(),
      eleves:                   () => Pages.eleves(),
      classes:                  () => Pages.classes(),
      matieres:                 () => Pages.matieres(),
      notes:                    () => Pages.notes(),
      bulletins:                () => Pages.bulletins(),
      bordereau:                () => Pages.bordereau(),
      presences:                () => Pages.presences(),
      paiements:                () => Pages.paiements(),
      depenses:                 () => Pages.depenses(),
      rapports:                 () => Pages.rapports(),
      utilisateurs:             () => Pages.utilisateurs(),
      config:                   () => Pages.config(),
      auditLog:                 () => Pages.auditLog(),
      grillePaiements:          () => Pages.grillePaiements(),
      supervisionEnseignants:   () => Pages.supervisionEnseignants(),
      statistiques:             () => Pages.statistiques(),
      cloture:                  () => Pages.cloture(),
      comptabilite:             () => ComptaModule.render(),
    };
    if (renderers[pageId]) {
      setTimeout(() => {
        content.innerHTML = '';
        renderers[pageId]();
      }, 60);
    }

    // Fermer sidebar mobile
    document.getElementById('sidebar').classList.remove('mobile-open');
    document.getElementById('overlay-bg').classList.remove('active');
  },

  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth <= 768) {
      sidebar.classList.toggle('mobile-open');
      document.getElementById('overlay-bg').classList.toggle('active');
    } else {
      sidebar.classList.toggle('collapsed');
      // Synchroniser la position du bandeau licence
      const banner = document.getElementById('licence-banner');
      if (banner && banner.style.display !== 'none') {
        banner.style.left = sidebar.classList.contains('collapsed') ? '68px' : 'var(--sidebar-w)';
      }
    }
  },

  updateClock() {
    const el = document.getElementById('topbar-date');
    if (el) {
      el.textContent = new Date().toLocaleDateString('fr-FR', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
      });
    }
  },

  bindGlobalEvents() {
    // Formulaire principal (étape 2)
    document.getElementById('login-form')?.addEventListener('submit', e => this.handleLogin(e));

    // Touche Entrée sur le champ code école (étape 1)
    document.getElementById('login-school-code')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); this.verifySchoolCode(); }
    });

    // Toggle mot de passe
    const togglePwd = document.getElementById('toggle-pwd');
    if (togglePwd) {
      togglePwd.addEventListener('click', () => {
        const input = document.getElementById('login-pwd');
        const icon  = togglePwd.querySelector('i');
        input.type  = input.type === 'password' ? 'text' : 'password';
        icon.className = input.type === 'password' ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
      });
    }
  }
};

// ── TOAST NOTIFICATIONS ───────────────────────────────────────────
const Toast = {
  show(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `
      <i class="fa-solid ${icons[type] || icons.info}"></i>
      <span>${message}</span>
      <button class="toast-close" onclick="this.parentElement.remove()"><i class="fa-solid fa-xmark"></i></button>`;
    container.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(20px)'; el.style.transition = 'all .3s'; setTimeout(() => el.remove(), 300); }, duration);
  },
  success(msg) { this.show(msg, 'success'); },
  error(msg)   { this.show(msg, 'error', 5000); },
  warning(msg) { this.show(msg, 'warning'); },
  info(msg)    { this.show(msg, 'info'); }
};

// ── MODAL HELPER ───────────────────────────────────────────────────
const Modal = {
  open(title, bodyHtml, footerHtml = '', size = '') {
    this.close();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'global-modal-overlay';
    overlay.innerHTML = `
      <div class="modal ${size}" id="global-modal">
        <div class="modal-header">
          <div class="modal-title">${title}</div>
          <button class="modal-close" onclick="Modal.close()"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
      </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) this.close(); });
    document.body.appendChild(overlay);
  },
  close() { document.getElementById('global-modal-overlay')?.remove(); }
};

// ── FORMATTER ──────────────────────────────────────────────────────
const Fmt = {
  _cfg: null,
  async money(amount) {
    if (!this._cfg) this._cfg = await DB.getEcoleConfig();
    return new Intl.NumberFormat('fr-FR').format(amount || 0) + ' ' + (this._cfg?.devise || 'FCFA');
  },
  moneySync(amount, devise = 'FCFA') {
    return new Intl.NumberFormat('fr-FR').format(amount || 0) + ' ' + devise;
  },
  date(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('fr-FR');
  },
  datetime(str) {
    if (!str) return '—';
    return new Date(str).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  },
  note(val) {
    if (val === null || val === undefined || val === '') return '—';
    return parseFloat(val).toFixed(2);
  },
  statutBadge(statut) {
    const map = {
      solde:    `<span class="badge badge-success"><span class="dot dot-green"></span> Soldé</span>`,
      encours:  `<span class="badge badge-warning"><span class="dot dot-orange"></span> En cours</span>`,
      aucun:    `<span class="badge badge-danger"><span class="dot dot-red"></span> Aucun paiement</span>`,
      retard:   `<span class="badge badge-retard"><span class="dot dot-red"></span> En retard</span>`,
      a_venir:  `<span class="badge badge-aavenir"><span class="dot dot-gray"></span> À venir</span>`,
      exonere:  `<span class="badge badge-exonere"><span class="dot dot-blue"></span> 🔵 Exonéré</span>`,
      partiel:  `<span class="badge badge-warning"><span class="dot dot-orange"></span> Partiel</span>`,
      paye:     `<span class="badge badge-success"><span class="dot dot-green"></span> Payé</span>`,
    };
    return map[statut] || `<span class="badge badge-gray">—</span>`;
  },

  // Badge statut financier sans montant (pour directeur — Bloc 6)
  statutBadgeDirecteur(statut, nbMoisRetard = 0) {
    if (statut === 'exonere') return `<span class="badge badge-exonere">🔵 Exonéré</span>`;
    if (statut === 'solde')   return `<span class="badge badge-success">🟢 À jour</span>`;
    if (statut === 'encours') return `<span class="badge badge-warning">🟡 En cours</span>`;
    if (statut === 'retard')  return `<span class="badge badge-retard">🔴 Retard${nbMoisRetard > 0 ? ' ('+nbMoisRetard+' tranche(s))' : ''}</span>`;
    return `<span class="badge badge-danger">🔴 Non payé</span>`;
  },
  appreciation(moy) {
    if (moy === null) return '—';
    const a = DB.getAppreciation(moy);
    const colors = { 'Médiocre':'danger','Passable':'warning','Assez Bien':'info','Bien':'success','Très Bien':'purple' };
    return `<span class="badge badge-${colors[a]||'gray'}">${a}</span>`;
  }
};

// ── EXPORT MULTI-FORMAT ─────────────────────────────────────────────────────
const Export = {
  /**
   * T3.4 — Export Excel .xlsx natif via SheetJS
   * Format tableau propre avec en-tête coloré
   */
  toXLSX(headers, rows, filename) {
    try {
      if (!window.XLSX) { Toast.error('Bibliothèque Excel non chargée. Réessayez.'); return; }
      const wsData = [headers, ...rows.map(r => r.map(v => v == null ? '' : v))];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      // Largeurs de colonnes automatiques
      const colWidths = headers.map((h, ci) => {
        const maxLen = Math.max(String(h).length, ...rows.map(r => String(r[ci] ?? '').length));
        return { wch: Math.min(40, Math.max(10, maxLen + 2)) };
      });
      ws['!cols'] = colWidths;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Données');
      XLSX.writeFile(wb, filename);
      Toast.success('Export Excel réussi !');
    } catch (err) {
      Toast.error('Erreur export Excel : ' + err.message);
      console.error(err);
    }
  },

  /**
   * Export CSV universel — compatible desktop, mobile, iOS Safari
   * Stratégie : BOM UTF-8 + data: URI fallback si createObjectURL échoue
   */
  toCSV(headers, rows, filename) {
    try {
      const BOM = '\uFEFF';
      const lines = [headers.join(';')];
      rows.forEach(r => lines.push(r.map(v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(';')));
      const csvContent = BOM + lines.join('\r\n');

      // Méthode 1 : Blob + URL.createObjectURL (Desktop Chrome/Firefox)
      if (window.Blob && URL.createObjectURL) {
        try {
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
          Toast.success('Export CSV réussi !');
          return;
        } catch (e) { /* fallback */ }
      }

      // Méthode 2 : data: URI (iOS Safari, anciens navigateurs)
      const dataUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
      const a2 = document.createElement('a');
      a2.href = dataUri;
      a2.download = filename;
      a2.style.display = 'none';
      document.body.appendChild(a2);
      a2.click();
      setTimeout(() => a2.remove(), 200);
      Toast.success('Export CSV réussi !');
    } catch (err) {
      Toast.error('Erreur export CSV : ' + err.message);
    }
  },

  /**
   * Export JSON (sauvegarde complète)
   */
  toJSON(data, filename) {
    try {
      const content = JSON.stringify(data, null, 2);
      if (window.Blob && URL.createObjectURL) {
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.style.display = 'none';
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
      } else {
        const uri = 'data:application/json;charset=utf-8,' + encodeURIComponent(content);
        const a = document.createElement('a');
        a.href = uri; a.download = filename; a.style.display = 'none';
        document.body.appendChild(a); a.click();
        setTimeout(() => a.remove(), 200);
      }
      Toast.success('Sauvegarde exportée !');
    } catch (err) { Toast.error('Erreur export : ' + err.message); }
  }
};

// ── DEBOUNCE — Anti-double-clic sur les boutons de formulaire ────────
/**
 * Protège un bouton contre les double-clics :
 * - Désactive le bouton immédiatement au clic
 * - Le réactive automatiquement après `ms` millisecondes
 * Usage inline : onclick="if(Debounce.btn(this)) Pages._saveClass('')"
 */
const Debounce = {
  btn(el, ms = 3000) {
    if (el.dataset.loading === '1') return false; // déjà en cours
    el.dataset.loading = '1';
    el.disabled = true;
    // Sauvegarder le contenu original
    const orig = el.innerHTML;
    el.innerHTML = '<span class="loading-spinner" style="display:inline-block;width:14px;height:14px;border-width:2px;vertical-align:middle;margin-right:4px"></span>' + (el.dataset.label || '');
    // Réactivation automatique (filet de sécurité)
    setTimeout(() => {
      el.disabled = false;
      el.dataset.loading = '0';
      el.innerHTML = orig;
    }, ms);
    return true; // OK, exécuter l'action
  },
  /** Réactive manuellement (après succès ou erreur) */
  release(el, label = null) {
    if (!el) return;
    el.disabled = false;
    el.dataset.loading = '0';
    if (label !== null) el.innerHTML = label;
  }
};

// ── R11 — PRINT HELPER : Impression PDF sans window.open() ────────
/**
 * PrintHelper — Remplace window.open() par un iframe Blob URL
 * intégré dans une modale native — compatible mobile et navigateurs
 * qui bloquent les popups.
 *
 * Usage :
 *   PrintHelper.show(htmlString, 'Titre du document');
 *   PrintHelper.printFrame();   // imprime depuis l'iframe
 *   PrintHelper.download();     // télécharge le blob en .html → PDF via impression
 *   PrintHelper.close();
 */
const PrintHelper = {
  _blobUrl: null,
  _title: '',

  /**
   * Affiche un document HTML dans la modale d'aperçu.
   * @param {string} htmlContent - HTML complet du document à afficher
   * @param {string} [title='Document'] - Titre affiché dans la barre de la modale
   */
  show(htmlContent, title = 'Document') {
    this._title = title;
    const overlay = document.getElementById('print-modal-overlay');
    const loading = document.getElementById('print-modal-loading');
    const iframe  = document.getElementById('print-modal-iframe');
    const titleEl = document.getElementById('print-modal-title');

    if (!overlay) { console.warn('PrintHelper: modale introuvable'); return; }

    // Réinitialiser l'état
    if (this._blobUrl) { URL.revokeObjectURL(this._blobUrl); this._blobUrl = null; }
    titleEl.innerHTML = `<i class="fa-solid fa-file-pdf"></i> ${title}`;
    iframe.style.display = 'none';
    loading.style.display = 'flex';
    overlay.classList.add('open');

    // Créer le Blob URL
    try {
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      this._blobUrl = URL.createObjectURL(blob);
      iframe.onload = () => {
        loading.style.display = 'none';
        iframe.style.display = 'block';
      };
      iframe.src = this._blobUrl;
    } catch (err) {
      // Fallback : srcdoc si Blob URL non disponible (rare)
      loading.style.display = 'none';
      iframe.srcdoc = htmlContent;
      iframe.style.display = 'block';
    }
    // Fermer avec Escape
    this._escHandler = (e) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this._escHandler);
  },

  /** Déclenche l'impression depuis l'iframe */
  printFrame() {
    const iframe = document.getElementById('print-modal-iframe');
    if (!iframe?.contentWindow) { Toast.error('Aperçu non prêt, attendez un instant.'); return; }
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {
      Toast.error('Impossible d\'imprimer depuis l\'aperçu. Essayez le téléchargement.');
    }
  },

  /** Télécharge le document HTML (l'utilisateur peut ensuite imprimer en PDF) */
  download() {
    if (!this._blobUrl) { Toast.error('Document non disponible.'); return; }
    const a = document.createElement('a');
    a.href = this._blobUrl;
    a.download = (this._title || 'document').replace(/[^a-z0-9\u00C0-\u024F ]/gi, '_') + '.html';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 200);
    Toast.info('Document téléchargé. Ouvrez-le et utilisez Imprimer → Enregistrer en PDF.');
  },

  /** Ferme la modale et libère le Blob URL */
  close() {
    const overlay = document.getElementById('print-modal-overlay');
    const iframe  = document.getElementById('print-modal-iframe');
    if (overlay) overlay.classList.remove('open');
    if (iframe) { iframe.src = ''; iframe.srcdoc = ''; iframe.style.display = 'none'; }
    if (this._blobUrl) { URL.revokeObjectURL(this._blobUrl); this._blobUrl = null; }
    if (this._escHandler) { document.removeEventListener('keydown', this._escHandler); this._escHandler = null; }
  }
};

// ── R12 — LICENCE MANAGER : Essai / Activation clé ────────────────
/**
 * LicenceManager — Gestion de la période d'essai et des licences
 * Vérifie l'état de la licence de l'école connectée après chaque login.
 *
 * Flux :
 *  1. LicenceManager.check(ecoleId)  → évalue essai_fin / licence_fin
 *  2. Si < 14j restants → showBanner(jr, isEssai)
 *  3. Si expiré        → showLockScreen()
 *  4. Depuis lock screen → activateKey(cle, ecoleId)
 *
 * Roles concernés : admin, directeur (les seuls qui voient le bandeau)
 */
const LicenceManager = {

  // ── Constantes ──────────────────────────────────────────────────
  ESSAI_JOURS      : 14,
  BANNER_ID        : 'licence-banner',
  LOCK_ID          : 'licence-lock-screen',
  BANNER_THRESHOLD : 14,   // Afficher le bandeau si ≤ 14 jours restants

  // ── Vérification principale ──────────────────────────────────────
  /**
   * Évalue le statut de licence de l'école.
   * @param {string} ecoleId - ID de l'école dans la table `ecoles`
   * @returns {{ statut: string, joursRestants: number, isEssai: boolean, isLocked: boolean }}
   */
  async check(ecoleId) {
    try {
      if (!ecoleId) return { statut: 'inconnu', joursRestants: 999, isEssai: false, isLocked: false };

      const resp = await fetch(`tables/ecoles/${ecoleId}`);
      if (!resp.ok) return { statut: 'inconnu', joursRestants: 999, isEssai: false, isLocked: false };
      const ecole = await resp.json();

      const now = Date.now();

      // 1. Licence payée active ?
      if (ecole.licence_fin) {
        const licenceFin = new Date(ecole.licence_fin).getTime();
        if (licenceFin > now) {
          const jr = Math.ceil((licenceFin - now) / 86400000);
          const result = { statut: 'actif', joursRestants: jr, isEssai: false, isLocked: false };
          // Bandeau d'avertissement si expire bientôt
          if (jr <= this.BANNER_THRESHOLD) this.showBanner(jr, false);
          else this.hideBanner();
          return result;
        }
      }

      // 2. Période d'essai active ?
      if (ecole.essai_fin) {
        const essaiFin = new Date(ecole.essai_fin).getTime();
        if (essaiFin > now) {
          const jr = Math.ceil((essaiFin - now) / 86400000);
          const result = { statut: 'essai', joursRestants: jr, isEssai: true, isLocked: false };
          this.showBanner(jr, true);
          return result;
        }
      }

      // 3. Rien de valide → verrouillé
      this.showLockScreen();
      return { statut: 'expire', joursRestants: 0, isEssai: false, isLocked: true };

    } catch (err) {
      // En cas d'erreur réseau, on ne bloque pas l'accès (mode offline)
      console.warn('LicenceManager.check error (ignoré offline):', err);
      return { statut: 'inconnu', joursRestants: 999, isEssai: false, isLocked: false };
    }
  },

  // ── Bandeau d'information ────────────────────────────────────────
  /**
   * Affiche le bandeau de compte à rebours sous la topbar.
   * Couleurs : bleu (>7j) → orange (≤7j) → rouge (≤3j)
   * Compte à rebours dynamique mis à jour toutes les heures.
   * @param {number} jr - Jours restants
   * @param {boolean} isEssai - true si période d'essai, false si licence proche expiration
   */
  showBanner(jr, isEssai) {
    const banner = document.getElementById(this.BANNER_ID);
    if (!banner) return;

    const urgence = jr <= 3 ? 'danger' : jr <= 7 ? 'warning' : 'info';
    const icon    = isEssai ? 'fa-hourglass-half' : 'fa-key';

    // Label coloré du compteur
    const countdownColor = urgence === 'danger' ? '#b71c1c' : urgence === 'warning' ? '#7c4f00' : '#0d47a1';
    const countdownBg    = urgence === 'danger' ? 'rgba(183,28,28,.15)' : urgence === 'warning' ? 'rgba(124,79,0,.12)' : 'rgba(13,71,161,.12)';

    const typeLabel = isEssai ? "Essai gratuit" : "Licence";
    const msg = isEssai
      ? `Votre <strong>${typeLabel}</strong> expire dans :`
      : `Votre <strong>${typeLabel}</strong> expire dans :`;
    const cta = isEssai
      ? 'Activez une clé pour continuer après l\'essai.'
      : 'Renouvelez pour ne pas perdre l\'accès.';

    banner.className = `licence-banner licence-banner--${urgence}`;
    banner.style.animation = 'slideDownBanner .35s cubic-bezier(.4,0,.2,1)';
    banner.innerHTML = `
      <div class="licence-banner-inner">
        <i class="fa-solid ${icon}" style="font-size:1.15rem;flex-shrink:0"></i>
        <span style="flex:1;min-width:0">${msg}
          <span id="licence-countdown" style="display:inline-flex;align-items:center;gap:.3rem;margin-left:.4rem;background:${countdownBg};color:${countdownColor};padding:.18rem .65rem;border-radius:20px;font-weight:800;font-size:.95rem;font-family:monospace;letter-spacing:.02em;border:1.5px solid ${countdownColor};box-shadow:0 1px 6px ${countdownBg}">
            <i class="fa-solid fa-clock" style="font-size:.78rem"></i>&nbsp;${jr}j restants
          </span>
          <span style="margin-left:.5rem;font-size:.82rem;opacity:.85">${cta}</span>
        </span>
        <button class="licence-banner-btn" onclick="LicenceManager.openActivationModal()">
          <i class="fa-solid fa-key"></i> Activer ma clé
        </button>
        <button class="licence-banner-close" onclick="LicenceManager.hideBanner()" title="Masquer cette notification">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>`;
    // Rendre visible — override du display:none CSS
    banner.style.display = 'block';

    // Démarrer le compte à rebours dynamique (mise à jour toutes les heures)
    if (this._countdownInterval) clearInterval(this._countdownInterval);
    this._countdownInterval = setInterval(() => {
      const el = document.getElementById('licence-countdown');
      if (el) {
        const hoursLeft = Math.max(0, jr * 24 - Math.floor((Date.now() - (this._bannerShownAt || Date.now())) / 3600000));
        const daysLeft  = Math.floor(hoursLeft / 24);
        const hRem      = hoursLeft % 24;
        el.textContent  = daysLeft > 0 ? `${daysLeft}j ${hRem}h` : `${hoursLeft}h`;
      }
    }, 3600000); // toutes les heures
    this._bannerShownAt = Date.now();

    // Décaler le contenu principal vers le bas
    const mainWrap = document.getElementById('main-wrap');
    if (mainWrap) mainWrap.classList.add('has-licence-banner');
  },

  hideBanner() {
    const banner = document.getElementById(this.BANNER_ID);
    if (banner) banner.style.display = 'none';
    const mainWrap = document.getElementById('main-wrap');
    if (mainWrap) mainWrap.classList.remove('has-licence-banner');
    if (this._countdownInterval) { clearInterval(this._countdownInterval); this._countdownInterval = null; }
  },

  // ── Écran de blocage ─────────────────────────────────────────────
  showLockScreen() {
    // Masquer toute l'interface applicative
    const app = document.getElementById('app');
    if (app) app.classList.remove('active');
    const loginPage = document.getElementById('login-page');
    if (loginPage) loginPage.style.display = 'none';

    let lock = document.getElementById(this.LOCK_ID);
    if (!lock) return;
    lock.style.display = 'flex';
  },

  hideLockScreen() {
    const lock = document.getElementById(this.LOCK_ID);
    if (lock) lock.style.display = 'none';
  },

  // ── Modal d'activation ───────────────────────────────────────────
  openActivationModal() {
    const ecoleId = App.currentUser?.ecole_id || '';
    Modal.open(
      '<i class="fa-solid fa-key"></i> Activer une clé de licence',
      `<div class="form-group">
        <label class="form-label">Votre clé de licence</label>
        <div class="input-group">
          <i class="left fa-solid fa-key"></i>
          <input type="text" class="form-control" id="activation-key-input"
            placeholder="ZEAN-XXXX-XXXX-XXXX"
            maxlength="19"
            style="text-transform:uppercase;letter-spacing:.1em;font-family:monospace;font-size:1.1rem"
            oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9-]/g,'')">
        </div>
        <p style="font-size:.8rem;color:var(--gray-600);margin-top:.5rem">
          <i class="fa-solid fa-circle-info"></i>
          Entrez la clé reçue après votre paiement (format : ZEAN-XXXX-XXXX-XXXX)
        </p>
        <div id="activation-error" style="color:var(--danger);font-size:.84rem;margin-top:.5rem;min-height:1.2rem"></div>
      </div>`,
      `<button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>
       <button class="btn btn-primary" id="activation-submit-btn"
         onclick="LicenceManager.activateKey(document.getElementById('activation-key-input').value.trim(), '${ecoleId}')">
         <i class="fa-solid fa-unlock"></i> Activer la licence
       </button>`
    );
  },

  // ── Activation de clé ────────────────────────────────────────────
  /**
   * Valide une clé dans la table licences_keys, met à jour ecoles.licence_fin
   * et déverrouille l'accès.
   * @param {string} cle - La clé saisie (ZEAN-XXXX-XXXX-XXXX)
   * @param {string} ecoleId - L'ID de l'école
   */
  async activateKey(cle, ecoleId) {
    const errEl  = document.getElementById('activation-error');
    const btnEl  = document.getElementById('activation-submit-btn');
    if (errEl) errEl.textContent = '';

    // Validation format
    if (!cle || !/^ZEAN-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(cle)) {
      if (errEl) errEl.textContent = 'Format de clé invalide. Exemple : ZEAN-AB12-CD34-EF56';
      return;
    }

    if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<div class="loading-spinner" style="width:16px;height:16px;border-width:2px;display:inline-block"></div> Vérification…'; }

    try {
      // 1. Chercher la clé dans la table licences_keys
      const resp = await fetch(`tables/licences_keys?search=${encodeURIComponent(cle)}&limit=10`);
      if (!resp.ok) throw new Error('Erreur serveur lors de la recherche de clé.');
      const result = await resp.json();
      const keys = result.data || [];

      const keyRecord = keys.find(k => k.cle === cle);

      if (!keyRecord) {
        if (errEl) errEl.textContent = 'Clé introuvable. Vérifiez la saisie ou contactez le support.';
        return;
      }
      if (keyRecord.statut === 'active' || keyRecord.statut === 'expiree') {
        if (errEl) errEl.textContent = 'Cette clé a déjà été utilisée. Contactez editrice@zean.app.';
        return;
      }
      if (keyRecord.statut === 'revoquee') {
        if (errEl) errEl.textContent = 'Cette clé a été révoquée. Contactez editrice@zean.app.';
        return;
      }
      if (keyRecord.ecole_id && keyRecord.ecole_id !== ecoleId) {
        if (errEl) errEl.textContent = 'Cette clé n\'est pas associée à votre école.';
        return;
      }

      // 2. Calculer la date d'expiration
      const duree  = parseInt(keyRecord.duree_jours) || 30;
      const finDt  = new Date(Date.now() + duree * 86400000).toISOString();

      // 3. Mettre à jour la table licences_keys
      await fetch(`tables/licences_keys/${keyRecord.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statut          : 'active',
          date_activation : new Date().toISOString(),
          date_expiration : finDt,
          activee_par     : App.currentUser?.email || ''
        })
      });

      // 4. Mettre à jour ecoles.licence_fin si l'école est connue
      if (ecoleId) {
        await fetch(`tables/ecoles/${ecoleId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            licence_fin : finDt,
            statut      : 'actif'
          })
        });
      }

      // 5. Succès — déverrouiller et fermer
      Modal.close();
      this.hideLockScreen();
      this.hideBanner();

      const dateStr = new Date(finDt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
      Toast.success(`✅ Licence activée ! Accès garanti jusqu'au ${dateStr}.`);

      // Recharger la page principale si on venait de l'écran de blocage
      const app = document.getElementById('app');
      if (app && !app.classList.contains('active')) {
        app.classList.add('active');
        await App.updateSchoolName();
        App.navigateTo('dashboard');
      }

    } catch (err) {
      console.error('LicenceManager.activateKey error:', err);
      if (errEl) errEl.textContent = 'Erreur lors de l\'activation. Vérifiez votre connexion.';
    } finally {
      if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '<i class="fa-solid fa-unlock"></i> Activer la licence'; }
    }
  },

  // ── Activation depuis l'écran de blocage ────────────────────────
  async _activateFromLockScreen() {
    const input = document.getElementById('lock-key-input');
    const errEl = document.getElementById('lock-key-error');
    const btn   = document.getElementById('lock-activate-btn');
    if (errEl) errEl.textContent = '';
    const cle     = (input?.value || '').trim().toUpperCase();
    const ecoleId = App.currentUser?.ecole_id || '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loading-spinner" style="width:14px;height:14px;border-width:2px;display:inline-block"></div>'; }
    try {
      await this.activateKey(cle, ecoleId);
    } catch (e) {
      if (errEl) errEl.textContent = 'Erreur réseau. Vérifiez votre connexion.';
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-unlock-keyhole"></i> Activer'; }
    }
  },

  // ── Affichage des annonces plateforme ────────────────────────────
  /**
   * Charge les annonces actives depuis annonces_plateforme
   * et les injecte dans #plateforme-annonces-container (si présent).
   * @param {string} ecoleId - Filtrer sur ecole_id ou 'toutes'
   */
  async loadAnnonces(ecoleId) {
    try {
      const resp = await fetch('tables/annonces_plateforme?limit=20');
      if (!resp.ok) return;
      const result = await resp.json();
      const all = result.data || [];
      const now = Date.now();

      // Filtrer : active + période valide + ciblée sur cette école ou 'toutes'
      const active = all.filter(a => {
        if (!a.active) return false;
        if (a.date_debut && new Date(a.date_debut).getTime() > now) return false;
        if (a.date_fin   && new Date(a.date_fin).getTime()   < now) return false;
        if (a.cible === 'ecoles_specifiques') {
          const ids = (a.ecoles_ids || '').split(',').map(s => s.trim());
          if (!ids.includes(ecoleId)) return false;
        }
        return true;
      });

      const container = document.getElementById('plateforme-annonces-container');
      if (!container || !active.length) return;

      const icons = { info: 'fa-circle-info', maintenance: 'fa-screwdriver-wrench', mise_a_jour: 'fa-arrows-rotate', alerte: 'fa-triangle-exclamation', promotion: 'fa-tag' };
      const colors = { info: 'info', maintenance: 'warning', mise_a_jour: 'primary', alerte: 'danger', promotion: 'success' };

      container.innerHTML = active.map(a => `
        <div class="annonce-card annonce-${colors[a.type] || 'info'}">
          <div class="annonce-icon"><i class="fa-solid ${icons[a.type] || 'fa-bullhorn'}"></i></div>
          <div class="annonce-body">
            <div class="annonce-titre">${a.titre || ''}</div>
            <div class="annonce-texte">${a.contenu || ''}</div>
            ${a.lien_action ? `<a href="${a.lien_action}" target="_blank" class="annonce-lien">${a.label_action || 'En savoir plus'} <i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}
          </div>
          <button class="annonce-close" onclick="this.closest('.annonce-card').remove()" title="Masquer"><i class="fa-solid fa-xmark"></i></button>
        </div>`).join('');

    } catch (err) {
      console.warn('LicenceManager.loadAnnonces error:', err);
    }
  }
};

// ── WIZARD DE CONFIGURATION INITIALE ──────────────────────────────
const Wizard = {
  step: 1,
  show() {
    document.getElementById('main-content').innerHTML = `
      <div class="setup-wizard">
        <div class="card">
          <div class="card-body">
            <div class="wizard-header">
              <div class="stat-icon blue" style="width:60px;height:60px;font-size:1.6rem;border-radius:14px;margin:0 auto 1rem"><i class="fa-solid fa-school"></i></div>
              <h2>Bienvenue ! Configurez votre école</h2>
              <p>Ces informations apparaîtront sur les bulletins et rapports</p>
              <div class="wizard-dots">
                <div class="wizard-dot active" id="dot-1"></div>
                <div class="wizard-dot" id="dot-2"></div>
                <div class="wizard-dot" id="dot-3"></div>
              </div>
            </div>
            <!-- STEP 1 -->
            <div class="wizard-step active" id="wizard-step-1">
              <div class="form-group">
                <label class="form-label">Nom de l'école <span style="color:red">*</span></label>
                <input class="form-control" id="w-school-name" placeholder="Ex: École Primaire Jean-Paul II">
              </div>
              <div class="form-group">
                <label class="form-label">Adresse</label>
                <input class="form-control" id="w-school-addr" placeholder="Quartier, Ville">
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Téléphone</label>
                  <input class="form-control" id="w-school-tel" placeholder="+237 xxx xxx xxx">
                </div>
                <div class="form-group">
                  <label class="form-label">Devise monétaire</label>
                  <select class="form-control" id="w-devise">
                    <option value="FCFA">FCFA</option>
                    <option value="GNF">GNF (Franc Guinéen)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="USD">USD ($)</option>
                    <option value="XOF">XOF</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Préfixe matricule élève</label>
                <input class="form-control" id="w-prefix" placeholder="INJ" maxlength="8" value="INJ">
                <div class="form-text">Le matricule sera du type : INJ-MAT-2501</div>
              </div>
              <button class="btn btn-primary btn-lg" style="width:100%" onclick="Wizard.nextStep(2)">Suivant <i class="fa-solid fa-arrow-right"></i></button>
            </div>
            <!-- STEP 2 -->
            <div class="wizard-step" id="wizard-step-2">
              <h3 style="font-size:1rem;font-weight:600;margin-bottom:1rem"><i class="fa-solid fa-coins" style="color:var(--warning)"></i> Tarifs de scolarité annuels par niveau</h3>
              <div id="tarifs-form"></div>
              <div style="display:flex;gap:.75rem;margin-top:1rem">
                <button class="btn btn-outline" onclick="Wizard.prevStep(1)"><i class="fa-solid fa-arrow-left"></i> Retour</button>
                <button class="btn btn-primary" style="flex:1" onclick="Wizard.nextStep(3)">Suivant <i class="fa-solid fa-arrow-right"></i></button>
              </div>
            </div>
            <!-- STEP 3 -->
            <div class="wizard-step" id="wizard-step-3">
              <div style="text-align:center;padding:2rem 0">
                <div style="font-size:3rem;margin-bottom:1rem">🎉</div>
                <h3 style="font-size:1.2rem;font-weight:700;margin-bottom:.5rem">Configuration terminée !</h3>
                <p style="color:var(--gray-600);margin-bottom:1.5rem">Votre école est configurée. Vous pouvez commencer à utiliser le logiciel.</p>
                <button class="btn btn-success btn-lg" id="wizard-finish-btn" onclick="Wizard.finish()"><i class="fa-solid fa-check"></i> Accéder au logiciel</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    this.buildTarifsForm();
  },

  buildTarifsForm() {
    const niveaux = [
      {key:'1ere',label:'1ère Année (Primaire)'},{key:'2eme',label:'2ème Année'},{key:'3eme',label:'3ème Année'},
      {key:'4eme',label:'4ème Année'},{key:'5eme',label:'5ème Année'},{key:'6eme',label:'6ème Année (CM2)'},
      {key:'7eme',label:'7ème Année (Collège)'},{key:'8eme',label:'8ème Année'},{key:'9eme',label:'9ème Année'},{key:'10eme',label:'10ème Année'}
    ];
    document.getElementById('tarifs-form').innerHTML = niveaux.map(n => `
      <div class="form-row" style="margin-bottom:.5rem">
        <div class="form-group" style="margin-bottom:0"><label class="form-label" style="padding-top:.5rem">${n.label}</label></div>
        <div class="form-group" style="margin-bottom:0"><input class="form-control" data-niveau="${n.key}" type="number" min="0" placeholder="0"></div>
      </div>`).join('');
  },

  nextStep(to) {
    if (to === 2) {
      const nom = document.getElementById('w-school-name').value.trim();
      if (!nom) { Toast.error('Le nom de l\'école est obligatoire.'); return; }
      DB.setEcoleConfig({ nom, adresse: document.getElementById('w-school-addr').value.trim(), telephone: document.getElementById('w-school-tel').value.trim(), devise: document.getElementById('w-devise').value, matricule_prefix: document.getElementById('w-prefix').value.trim() || 'INJ' });
    }
    document.getElementById(`wizard-step-${this.step}`).classList.remove('active');
    document.getElementById(`dot-${this.step}`).classList.remove('active');
    this.step = to;
    document.getElementById(`wizard-step-${this.step}`).classList.add('active');
    document.getElementById(`dot-${this.step}`).classList.add('active');
  },

  prevStep(to) {
    document.getElementById(`wizard-step-${this.step}`).classList.remove('active');
    document.getElementById(`dot-${this.step}`).classList.remove('active');
    this.step = to;
    document.getElementById(`wizard-step-${this.step}`).classList.add('active');
    document.getElementById(`dot-${this.step}`).classList.add('active');
  },

  async finish() {
    const btn = document.getElementById('wizard-finish-btn');
    btn.disabled = true; btn.innerHTML = '<div class="loading-spinner" style="width:16px;height:16px;border-width:2px"></div> Enregistrement…';
    try {
      const inputs = document.querySelectorAll('#tarifs-form input[data-niveau]');
      const existing = await DB.getAll('config_scolarite');
      for (const inp of inputs) {
        const niveau = inp.dataset.niveau;
        const montant = parseFloat(inp.value) || 0;
        const found = existing.find(c => c.niveau === niveau);
        if (found) await DB.update('config_scolarite', found.id, { montant_annuel: montant });
        else await DB.insert('config_scolarite', { niveau, montant_annuel: montant });
      }
      await DB.setEcoleConfig({ configured: true });
      App.buildSidebar();
      App.buildUserInfo();
      await App.updateSchoolName();
      App.navigateTo('dashboard');
      Toast.success('Configuration enregistrée !');
    } catch (err) {
      Toast.error('Erreur lors de l\'enregistrement : ' + err.message);
      btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Accéder au logiciel';
    }
  }
};
