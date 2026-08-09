/**
 * offline.js — Zean School Manager R11
 * Architecture Offline-First : IndexedDB Queue + moteur de synchronisation automatique
 * Stratégie : last-write-wins basée sur updated_at / timestamp local
 *
 * Architecture :
 *   IndexedDB "zean_offline" → object store "action_queue"
 *   Chaque action : { id, table, method, recordId, payload, timestamp, synced, retries }
 *
 * API publique :
 *   OfflineQueue.push(table, method, payload, recordId?) → stocke l'action
 *   OfflineQueue.sync()                                  → pousse les actions en attente
 *   OfflineQueue.getPending()                            → retourne les actions non synchronisées
 *   OfflineQueue.clearSynced()                           → supprime les entrées synchronisées
 *
 * ConnectionMonitor :
 *   ConnectionMonitor.init()   → écoute online/offline, met à jour le badge
 *   ConnectionMonitor.isOnline → booléen état courant
 */

// ── CONSTANTES ────────────────────────────────────────────────────
const OFFLINE_DB_NAME    = 'zean_offline';
const OFFLINE_DB_VERSION = 1;
const OFFLINE_STORE      = 'action_queue';
const MAX_RETRIES        = 5;

// ══════════════════════════════════════════════════════════════════
// OfflineQueue — File d'attente IndexedDB
// ══════════════════════════════════════════════════════════════════
const OfflineQueue = {
  _db: null,

  // ── Ouverture / init de la base ─────────────────────────────────
  async _open() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB non supporté')); return; }
      const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(OFFLINE_STORE)) {
          const store = db.createObjectStore(OFFLINE_STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('synced',    'synced',    { unique: false });
          store.createIndex('table',     'table',     { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
      req.onsuccess = (e) => { this._db = e.target.result; resolve(this._db); };
      req.onerror   = (e) => reject(e.target.error);
    });
  },

  // ── Ajouter une action dans la file ─────────────────────────────
  /**
   * @param {string} table     - Nom de la table (ex: 'notes', 'paiements')
   * @param {string} method    - Méthode HTTP : 'POST' | 'PUT' | 'PATCH' | 'DELETE'
   * @param {object} payload   - Données à synchroniser
   * @param {string} [recordId]- ID du record (pour PUT/PATCH/DELETE)
   * @returns {Promise<number>} ID de l'action dans la file
   */
  async push(table, method, payload, recordId = null) {
    try {
      const db = await this._open();
      const action = {
        table,
        method: method.toUpperCase(),
        recordId,
        payload: { ...payload, updated_at: Date.now() }, // timestamp local
        timestamp: Date.now(),
        synced: false,
        retries: 0,
        error: null
      };
      return new Promise((resolve, reject) => {
        const tx  = db.transaction(OFFLINE_STORE, 'readwrite');
        const req = tx.objectStore(OFFLINE_STORE).add(action);
        req.onsuccess = (e) => {
          console.log(`[OfflineQueue] Action mise en file : ${method} ${table}`, recordId || '');
          resolve(e.target.result);
        };
        req.onerror = (e) => reject(e.target.error);
      });
    } catch (err) {
      console.error('[OfflineQueue] Erreur push :', err);
      // Fallback localStorage si IndexedDB indisponible
      this._pushLocalStorage(table, method, payload, recordId);
      return -1;
    }
  },

  // ── Récupérer les actions en attente ────────────────────────────
  async getPending() {
    try {
      const db = await this._open();
      return new Promise((resolve, reject) => {
        const tx  = db.transaction(OFFLINE_STORE, 'readonly');
        const idx = tx.objectStore(OFFLINE_STORE).index('synced');
        const req = idx.getAll(IDBKeyRange.only(false));
        req.onsuccess = (e) => resolve(e.target.result || []);
        req.onerror   = (e) => reject(e.target.error);
      });
    } catch (err) {
      console.error('[OfflineQueue] Erreur getPending :', err);
      return [];
    }
  },

  // ── Marquer une action comme synchronisée ───────────────────────
  async _markSynced(id) {
    try {
      const db = await this._open();
      return new Promise((resolve, reject) => {
        const tx    = db.transaction(OFFLINE_STORE, 'readwrite');
        const store = tx.objectStore(OFFLINE_STORE);
        const get   = store.get(id);
        get.onsuccess = (e) => {
          const record = e.target.result;
          if (!record) { resolve(); return; }
          record.synced = true;
          record.syncedAt = Date.now();
          const put = store.put(record);
          put.onsuccess = () => resolve();
          put.onerror   = (e2) => reject(e2.target.error);
        };
        get.onerror = (e) => reject(e.target.error);
      });
    } catch (err) { console.error('[OfflineQueue] Erreur _markSynced :', err); }
  },

  // ── Incrémenter le compteur de tentatives ───────────────────────
  async _incrementRetries(id, errorMsg) {
    try {
      const db = await this._open();
      return new Promise((resolve) => {
        const tx    = db.transaction(OFFLINE_STORE, 'readwrite');
        const store = tx.objectStore(OFFLINE_STORE);
        const get   = store.get(id);
        get.onsuccess = (e) => {
          const record = e.target.result;
          if (!record) { resolve(); return; }
          record.retries = (record.retries || 0) + 1;
          record.error = errorMsg;
          store.put(record);
          resolve(record.retries);
        };
        get.onerror = () => resolve(0);
      });
    } catch { return 0; }
  },

  // ── Supprimer les entrées synchronisées (nettoyage) ─────────────
  async clearSynced() {
    try {
      const db = await this._open();
      return new Promise((resolve, reject) => {
        const tx  = db.transaction(OFFLINE_STORE, 'readwrite');
        const idx = tx.objectStore(OFFLINE_STORE).index('synced');
        const req = idx.openCursor(IDBKeyRange.only(true));
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) { cursor.delete(); cursor.continue(); }
          else resolve();
        };
        req.onerror = (e) => reject(e.target.error);
      });
    } catch (err) { console.error('[OfflineQueue] Erreur clearSynced :', err); }
  },

  // ── MOTEUR DE SYNCHRONISATION ─────────────────────────────────────
  /**
   * Synchronise toutes les actions en attente vers l'API.
   * Stratégie : last-write-wins sur updated_at.
   * Une action qui dépasse MAX_RETRIES est abandonnée (marquée synced=true avec erreur).
   */
  async sync() {
    if (!navigator.onLine) {
      console.log('[OfflineQueue] Hors ligne — sync annulée');
      return { synced: 0, errors: 0 };
    }
    const pending = await this.getPending();
    if (!pending.length) {
      console.log('[OfflineQueue] Rien à synchroniser');
      return { synced: 0, errors: 0 };
    }

    console.log(`[OfflineQueue] Début sync : ${pending.length} action(s) en attente`);
    ConnectionMonitor.setBadge('syncing', `Synchronisation (${pending.length})…`);

    let synced = 0, errors = 0;

    // Trier par timestamp croissant (ordre chronologique)
    pending.sort((a, b) => a.timestamp - b.timestamp);

    for (const action of pending) {
      try {
        // Abandon si trop de tentatives
        if ((action.retries || 0) >= MAX_RETRIES) {
          await this._markSynced(action.id); // skip définitif
          errors++;
          continue;
        }

        const url = `tables/${action.table}${action.recordId ? '/' + action.recordId : ''}`;
        const options = {
          method: action.method,
          headers: { 'Content-Type': 'application/json' }
        };

        if (action.method !== 'DELETE') {
          // Résolution de conflit : on ajoute updated_at pour last-write-wins
          options.body = JSON.stringify({ ...action.payload });
        }

        const response = await fetch(url, options);

        if (response.ok || response.status === 204) {
          await this._markSynced(action.id);
          synced++;
          console.log(`[OfflineQueue] ✓ Sync OK : ${action.method} ${action.table} (id:${action.id})`);
        } else if (response.status === 404 && action.method !== 'POST') {
          // Record supprimé entre-temps → on ignore
          await this._markSynced(action.id);
          synced++;
        } else {
          const retries = await this._incrementRetries(action.id, `HTTP ${response.status}`);
          console.warn(`[OfflineQueue] ✗ Erreur sync : ${action.method} ${action.table} — HTTP ${response.status} (tentative ${retries}/${MAX_RETRIES})`);
          errors++;
        }
      } catch (err) {
        const retries = await this._incrementRetries(action.id, err.message);
        console.warn(`[OfflineQueue] ✗ Erreur réseau : ${action.table} — ${err.message} (tentative ${retries}/${MAX_RETRIES})`);
        errors++;
      }
    }

    // Nettoyer les actions synchronisées (garder seulement les erreurs pour debug)
    await this.clearSynced();

    // Invalider le cache DB pour forcer un rechargement des données fraîches
    if (typeof DB !== 'undefined' && DB._cache) {
      DB._cache = {};
      DB._cacheExpiry = {};
    }

    console.log(`[OfflineQueue] Sync terminée : ${synced} OK, ${errors} erreur(s)`);

    const remaining = await this.getPending();
    if (!remaining.length) {
      ConnectionMonitor.setBadge('online', 'En ligne');
      if (synced > 0) {
        if (typeof Toast !== 'undefined') Toast.success(`Synchronisation réussie (${synced} action(s))`);
      }
    } else {
      ConnectionMonitor.setBadge('offline', `${remaining.length} action(s) en attente`);
    }

    return { synced, errors };
  },

  // ── Fallback LocalStorage (si IndexedDB indisponible) ───────────
  _pushLocalStorage(table, method, payload, recordId) {
    try {
      const key = 'zean_offline_queue';
      const queue = JSON.parse(localStorage.getItem(key) || '[]');
      queue.push({ table, method, recordId, payload, timestamp: Date.now(), synced: false });
      localStorage.setItem(key, JSON.stringify(queue));
    } catch { /* ignore */ }
  },

  // ── Compter les actions en attente (pour badge) ─────────────────
  async countPending() {
    try {
      const pending = await this.getPending();
      return pending.length;
    } catch { return 0; }
  }
};

// ══════════════════════════════════════════════════════════════════
// ConnectionMonitor — Indicateur visuel de connexion
// ══════════════════════════════════════════════════════════════════
const ConnectionMonitor = {
  isOnline: navigator.onLine,
  _syncTimeout: null,

  // ── Initialisation : écoute online/offline ──────────────────────
  init() {
    this.updateBadge();

    window.addEventListener('online', async () => {
      console.log('[ConnectionMonitor] Connexion rétablie');
      this.isOnline = true;
      this.setBadge('syncing', 'Reprise de connexion…');
      // Délai court pour laisser la connexion se stabiliser
      clearTimeout(this._syncTimeout);
      this._syncTimeout = setTimeout(async () => {
        const count = await OfflineQueue.countPending();
        if (count > 0) {
          console.log(`[ConnectionMonitor] ${count} action(s) à synchroniser`);
          await OfflineQueue.sync();
        } else {
          this.setBadge('online', 'En ligne');
        }
      }, 1200);
    });

    window.addEventListener('offline', () => {
      console.log('[ConnectionMonitor] Connexion perdue');
      this.isOnline = false;
      this.setBadge('offline', 'Hors ligne');
      if (typeof Toast !== 'undefined') {
        Toast.warning('Connexion perdue. Les actions seront synchronisées dès le retour du réseau.');
      }
    });

    // Vérification périodique des actions en attente (toutes les 30s)
    setInterval(async () => {
      if (navigator.onLine) {
        const count = await OfflineQueue.countPending();
        if (count > 0) {
          await OfflineQueue.sync();
        }
      }
    }, 30000);
  },

  // ── Mettre à jour le badge de connexion ─────────────────────────
  setBadge(state, label) {
    const badge = document.getElementById('connection-badge');
    if (!badge) return;
    badge.className = `connection-badge ${state}`;
    const dot   = badge.querySelector('.conn-dot');
    const lbl   = badge.querySelector('.conn-label');
    if (lbl) lbl.textContent = label || (state === 'online' ? 'En ligne' : state === 'offline' ? 'Hors ligne' : 'Sync…');
  },

  updateBadge() {
    if (navigator.onLine) {
      this.setBadge('online', 'En ligne');
    } else {
      this.setBadge('offline', 'Hors ligne');
    }
    // Vérifier si des actions sont en attente
    OfflineQueue.countPending().then(count => {
      if (count > 0 && navigator.onLine) {
        this.setBadge('syncing', `${count} en attente`);
      } else if (count > 0) {
        this.setBadge('offline', `${count} non sync.`);
      }
    });
  }
};

// ── Auto-initialisation (après que le DOM soit prêt) ─────────────
document.addEventListener('DOMContentLoaded', () => {
  ConnectionMonitor.init();
});
