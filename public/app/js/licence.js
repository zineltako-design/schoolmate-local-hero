/**
 * licence.js — Section « Licence & Activation » (menu Configuration)
 * ════════════════════════════════════════════════════════════════════
 * S'ajoute automatiquement en bas de la page Configuration (admin).
 * La clé saisie est vérifiée côté serveur dans la table licences_keys ;
 * si elle est valide, l'école passe en statut "actif" avec une date de fin.
 */
const ZeanLicence = {

  async _ecole() {
    try {
      const raw = sessionStorage.getItem('zean_school_data');
      const ecole = raw ? JSON.parse(raw) : null;
      const code = ecole?.code || App.currentUser?.ecole_code || '';
      if (!code) return ecole;
      // Version à jour depuis le cloud si possible
      try {
        const frais = window.ZeanCloud && await ZeanCloud.findEcoleByCode(code);
        if (frais) return frais;
      } catch {}
      return ecole;
    } catch { return null; }
  },

  _fmtDate(v) {
    if (!v) return '—';
    try { return new Date(v).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' }); }
    catch { return '—'; }
  },

  _badge(ecole) {
    const statut = ecole?.statut || 'essai';
    const map = {
      actif    : ['var(--secondary, #16a34a)', 'Licence active'],
      essai    : ['var(--warning, #f59e0b)',   'Période d’essai'],
      suspendu : ['var(--danger, #dc2626)',    'Suspendu'],
      bloque   : ['var(--danger, #dc2626)',    'Bloqué'],
    };
    const [color, label] = map[statut] || ['var(--gray-500,#6b7280)', statut];
    return `<span style="background:${color};color:#fff;padding:.25rem .6rem;border-radius:999px;font-size:.75rem;font-weight:600">${label}</span>`;
  },

  async inject() {
    const host = document.getElementById('main-content');
    if (!host || document.getElementById('licence-section')) return;
    if (App.currentUser?.role !== 'admin') return;

    const ecole = await this._ecole();
    const fin = ecole?.licence_fin || ecole?.essai_fin;
    const jours = fin ? Math.ceil((new Date(fin).getTime() - Date.now()) / 86400000) : null;

    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'licence-section';
    card.style.marginTop = '1.25rem';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-title"><i class="fa-solid fa-key" style="color:var(--primary)"></i> Licence &amp; Activation</div>
        ${this._badge(ecole)}
      </div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.9rem;margin-bottom:1rem">
          <div><div style="font-size:.75rem;color:var(--gray-500)">Établissement</div><strong>${ecole?.nom || '—'}</strong></div>
          <div><div style="font-size:.75rem;color:var(--gray-500)">Code école</div><strong>${ecole?.code || '—'}</strong></div>
          <div><div style="font-size:.75rem;color:var(--gray-500)">Valide jusqu'au</div><strong>${this._fmtDate(fin)}</strong></div>
          <div><div style="font-size:.75rem;color:var(--gray-500)">Jours restants</div><strong>${jours === null ? '—' : (jours > 0 ? jours + ' jours' : 'Expiré')}</strong></div>
        </div>
        <div class="form-group">
          <label class="form-label">Clé d'activation reçue</label>
          <input class="form-control" id="licence-cle" placeholder="ZEAN-XXXX-XXXX-XXXX" autocomplete="off"
                 style="text-transform:uppercase;letter-spacing:.06em;font-family:monospace">
          <div style="font-size:.75rem;color:var(--gray-500);margin-top:.25rem">
            Saisissez la clé communiquée par l'éditrice, puis validez. L'activation est immédiate et partagée avec toute l'école.
          </div>
        </div>
        <div id="licence-msg" style="margin-bottom:.6rem;font-size:.85rem"></div>
        <button class="btn btn-primary" id="licence-btn" onclick="ZeanLicence.activer()">
          <i class="fa-solid fa-unlock-keyhole"></i> Activer la licence
        </button>
      </div>`;
    host.appendChild(card);
  },

  async activer() {
    const input = document.getElementById('licence-cle');
    const msg   = document.getElementById('licence-msg');
    const btn   = document.getElementById('licence-btn');
    const cle   = (input?.value || '').trim().toUpperCase();
    if (msg) msg.textContent = '';
    if (!cle) {
      if (msg) { msg.style.color = 'var(--danger,#dc2626)'; msg.textContent = 'Veuillez saisir la clé d’activation.'; }
      input?.focus();
      return;
    }
    btn.disabled = true;
    const label = btn.innerHTML;
    btn.innerHTML = '<div class="loading-spinner" style="width:16px;height:16px;border-width:2px;display:inline-block"></div> Vérification…';
    try {
      const code = App.currentUser?.ecole_code || '';
      const res  = await ZeanAPI.activerLicence(cle, code);
      // Rafraîchir l'école en session
      try {
        const frais = await ZeanCloud.findEcoleByCode(code);
        if (frais) {
          sessionStorage.setItem('zean_school_data', JSON.stringify(frais));
          if (typeof DB.registerEcole === 'function') await DB.registerEcole(frais);
        }
      } catch {}
      if (msg) {
        msg.style.color = 'var(--secondary,#16a34a)';
        msg.innerHTML = `✓ Licence activée avec succès — valide jusqu'au <strong>${this._fmtDate(res.licence_fin)}</strong>.`;
      }
      if (typeof Toast !== 'undefined') Toast.success('Licence activée ! Votre établissement est actif.');
      document.getElementById('licence-section')?.remove();
      await this.inject();
    } catch (err) {
      if (msg) { msg.style.color = 'var(--danger,#dc2626)'; msg.textContent = '✗ ' + err.message; }
      if (typeof Toast !== 'undefined') Toast.error(err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = label;
    }
  },
};

window.ZeanLicence = ZeanLicence;

// Greffe automatique sur la page Configuration, sans modifier pages.js
(function hookConfig() {
  if (typeof Pages === 'undefined' || typeof Pages.config !== 'function') {
    return setTimeout(hookConfig, 200);
  }
  if (Pages.config.__licenceHooked) return;
  const original = Pages.config.bind(Pages);
  const wrapped = async function (...args) {
    const out = await original(...args);
    try { await ZeanLicence.inject(); } catch (e) { console.warn('[Licence]', e.message); }
    return out;
  };
  wrapped.__licenceHooked = true;
  Pages.config = wrapped;
})();
