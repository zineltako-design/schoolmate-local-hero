/**
 * zean-api.js — Passerelle vers les routes de provisionnement sécurisées
 * ════════════════════════════════════════════════════════════════════
 * Certaines opérations ne peuvent PAS être faites depuis le navigateur :
 *   - création d'une école (table réservée à l'Éditrice)
 *   - création d'un compte membre (mot de passe chiffré côté serveur)
 *   - activation d'une clé de licence (mise à jour du statut de l'école)
 *
 * Elles passent donc par le serveur, qui vérifie l'identité de l'appelant
 * grâce à sa session cloud (jeton Bearer). Rien n'est fait en aveugle.
 */
const ZeanAPI = {
  BASE: '/api/public/zean',

  async _token() {
    try {
      const c = window.ZeanCloud && ZeanCloud.client;
      if (!c) return null;
      const { data } = await c.auth.getSession();
      return data?.session?.access_token || null;
    } catch { return null; }
  },

  async post(path, body, { auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      const token = await this._token();
      if (!token) throw new Error('Session cloud absente — reconnectez-vous.');
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(`${this.BASE}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body || {}),
    });
    let json = null;
    try { json = await res.json(); } catch {}
    if (!res.ok || !json?.ok) {
      throw new Error(json?.error || `Erreur serveur (${res.status})`);
    }
    return json;
  },

  /** Initialisation unique du compte Éditrice (sans session). */
  bootstrapSuperAdmin(email, password) {
    return this.post('/bootstrap', { email, password }, { auth: false });
  },

  createEcole(payload)      { return this.post('/ecoles', payload); },
  createUtilisateur(payload){ return this.post('/utilisateurs', payload); },
  activerLicence(cle, ecoleCode) { return this.post('/licence', { cle, ecole_code: ecoleCode }); },
};

window.ZeanAPI = ZeanAPI;
