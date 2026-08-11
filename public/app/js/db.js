/**
 * db.js — Zean School Manager R17
 * ════════════════════════════════════════════════════════════════════
 * ARCHITECTURE LOCAL-FIRST PURE
 *
 * PRINCIPE FONDAMENTAL :
 *  1. Au 1er login → PULL CLOUD COMPLET → stocké en IndexedDB
 *  2. Toutes les LECTURES = IndexedDB uniquement (jamais réseau)
 *  3. Toutes les ÉCRITURES = IndexedDB immédiatement (visible tout de suite)
 *     + push cloud en arrière-plan (silencieux, aucun "pending" affiché)
 *  4. Sync auto toutes les 30s en ligne
 *
 * RÉSULTAT : l'app fonctionne pendant des semaines SANS internet.
 * Après un enregistrement → affichage INSTANTANÉ (pas d'attente réseau).
 *
 * BUG CORRIGÉ R17 :
 *  - getAll() ne déclenche PLUS de pull en arrière-plan (supprime le
 *    re-render silencieux qui n'arrivait jamais aux pages)
 *  - _initialPull() attend la FIN du pull avant de résoudre (bloquant
 *    une seule fois au login, invisible pour l'utilisateur)
 *  - insert/update : invalide le cache SYNCHRONIQUEMENT, données
 *    visibles IMMÉDIATEMENT après l'appel await DB.insert(...)
 *
 * Multi-tenancy strict : TOUTES les données filtrées par ecole_code.
 * Tables globales (écoles, licences…) : jamais filtrées.
 * ════════════════════════════════════════════════════════════════════
 */

const DB = {

  // ══════════════════════════════════════════════════════════════════
  // CONFIGURATION & ÉTAT
  // ══════════════════════════════════════════════════════════════════

  _DB_NAME    : 'zean_local_db',
  _DB_VERSION : 2,
  _idb        : null,
  _syncing    : false,
  _syncTimer  : null,
  _currentEcoleCode: null,
  _pullReady  : false,   // true une fois le pull initial terminé

  // Tables SaaS globales (jamais filtrées par ecole_code)
  GLOBAL_TABLES: ['ecoles','licences_keys','abonnements','annonces_plateforme'],

  // ══════════════════════════════════════════════════════════════════
  // INITIALISATION IndexedDB
  // ══════════════════════════════════════════════════════════════════

  async _openIDB() {
    if (this._idb) return this._idb;
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB non supporté')); return; }
      const req = indexedDB.open(this._DB_NAME, this._DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('records')) {
          const store = db.createObjectStore('records', { keyPath: '_localKey' });
          store.createIndex('by_table',       'table',               { unique: false });
          store.createIndex('by_table_ecole', ['table','ecole_code'],{ unique: false });
          store.createIndex('by_id',          ['table','id'],        { unique: false });
        }
        if (!db.objectStoreNames.contains('write_queue')) {
          const wq = db.createObjectStore('write_queue', { keyPath: 'wqId', autoIncrement: true });
          wq.createIndex('by_table',  'table',  { unique: false });
          wq.createIndex('by_synced', 'synced', { unique: false });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };

      req.onsuccess = (e) => { this._idb = e.target.result; resolve(this._idb); };
      req.onerror   = (e) => reject(e.target.error);
    });
  },

  _lk(table, id) { return `${table}||${id}`; },

  // ══════════════════════════════════════════════════════════════════
  // MULTI-TENANCY STRICT
  // ══════════════════════════════════════════════════════════════════

  setCurrentEcoleCode(code) {
    this._currentEcoleCode = code ? code.trim().toUpperCase() : null;
    console.log('[ZeanDB] Ecole courante :', this._currentEcoleCode || 'aucune');
  },

  getCurrentEcoleCode() { return this._currentEcoleCode; },

  /**
   * Filtre STRICT par ecole_code.
   * Aucun passthrough — isolation absolue entre écoles.
   */
  _filterByEcole(rows, table) {
    if (this.GLOBAL_TABLES.includes(table)) return rows;
    const code = this._currentEcoleCode;
    if (!code) return rows; // Mode démo / SA sans code actif

    return rows.filter(r => {
      const rc = (r.ecole_code || r.school_code || '').trim().toUpperCase();
      return rc === code; // STRICT — aucun legacy passthrough
    });
  },

  // ══════════════════════════════════════════════════════════════════
  // LECTURE LOCALE (IndexedDB) — TOUJOURS INSTANTANÉE
  // ══════════════════════════════════════════════════════════════════

  async _idbGetAll(table) {
    try {
      const db = await this._openIDB();
      return new Promise((resolve) => {
        const tx  = db.transaction('records', 'readonly');
        const idx = tx.objectStore('records').index('by_table');
        const req = idx.getAll(IDBKeyRange.only(table));
        req.onsuccess = (e) => {
          const rows = (e.target.result || [])
            .filter(r => !r._deleted)
            .map(r => r.data);
          resolve(this._filterByEcole(rows, table));
        };
        req.onerror = () => resolve([]);
      });
    } catch { return []; }
  },

  async _idbGet(table, id) {
    try {
      const db = await this._openIDB();
      return new Promise((resolve) => {
        const tx  = db.transaction('records', 'readonly');
        const req = tx.objectStore('records').get(this._lk(table, id));
        req.onsuccess = (e) => {
          const record = e.target.result;
          resolve(record && !record._deleted ? record.data : null);
        };
        req.onerror = () => resolve(null);
      });
    } catch { return null; }
  },

  // ══════════════════════════════════════════════════════════════════
  // ÉCRITURE LOCALE (IndexedDB) — IMMÉDIATE, VISIBLE TOUT DE SUITE
  // ══════════════════════════════════════════════════════════════════

  async _idbPut(table, data, dirty = true) {
    try {
      const db = await this._openIDB();
      return new Promise((resolve) => {
        const tx  = db.transaction('records', 'readwrite');
        tx.objectStore('records').put({
          _localKey  : this._lk(table, data.id),
          table,
          id         : data.id,
          ecole_code : data.ecole_code || data.school_code || this._currentEcoleCode || '',
          data,
          _dirty     : dirty,
          _deleted   : false,
          _updatedAt : Date.now()
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror    = () => resolve(false);
      });
    } catch { return false; }
  },

  async _idbDelete(table, id) {
    try {
      const db = await this._openIDB();
      return new Promise((resolve) => {
        const tx    = db.transaction('records', 'readwrite');
        const store = tx.objectStore('records');
        const get   = store.get(this._lk(table, id));
        get.onsuccess = (e) => {
          const record = e.target.result;
          if (record) {
            record._deleted  = true;
            record._dirty    = true;
            record._updatedAt = Date.now();
            store.put(record);
          }
          resolve(true);
        };
        get.onerror = () => resolve(false);
        tx.onerror  = () => resolve(false);
      });
    } catch { return false; }
  },

  /**
   * Remplace TOUS les records d'une table (après pull cloud).
   * Préserve les records _dirty (écrits offline, pas encore sync).
   */
  async _idbReplaceAll(table, rows) {
    try {
      const db  = await this._openIDB();
      const code = this._currentEcoleCode;

      return new Promise((resolve) => {
        const tx    = db.transaction('records', 'readwrite');
        const store = tx.objectStore('records');
        const idx   = store.index('by_table');

        // Collecter d'abord les _dirty pour ne pas les écraser
        const dirtyKeys = new Set();
        const scanReq = idx.openCursor(IDBKeyRange.only(table));
        scanReq.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const rec = cursor.value;
            // Ne pas écraser les records dirty (offline non-sync)
            if (rec._dirty && !rec._deleted) dirtyKeys.add(rec._localKey);
            // Supprimer seulement les records non-dirty de cette école
            const recCode = (rec.ecole_code || '').toUpperCase();
            const isGlobal = this.GLOBAL_TABLES.includes(table);
            const sameEcole = isGlobal || !code || recCode === '' || recCode === code;
            if (sameEcole && !rec._dirty) cursor.delete();
            cursor.continue();
          } else {
            // Insérer les nouvelles lignes cloud (sauf si dirty locale existe)
            rows.forEach(row => {
              if (!row.id) return;
              const lk = this._lk(table, row.id);
              if (dirtyKeys.has(lk)) return; // préserver version locale
              store.put({
                _localKey  : lk,
                table,
                id         : row.id,
                ecole_code : row.ecole_code || row.school_code || code || '',
                data       : row,
                _dirty     : false,
                _deleted   : false,
                _updatedAt : Date.now()
              });
            });
            resolve(true);
          }
        };
        scanReq.onerror = () => resolve(false);
        tx.onerror      = () => resolve(false);
      });
    } catch { return false; }
  },

  // ══════════════════════════════════════════════════════════════════
  // WRITE QUEUE (actions à pousser vers le cloud)
  // ══════════════════════════════════════════════════════════════════

  async _wqPush(table, method, id, data) {
    try {
      const db = await this._openIDB();
      return new Promise((resolve) => {
        const tx = db.transaction('write_queue', 'readwrite');
        tx.objectStore('write_queue').add({
          table, method, id, data,
          ecole_code: this._currentEcoleCode || '',
          ts: Date.now(),
          synced: false,
          retries: 0
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror    = () => resolve(false);
      });
    } catch { return false; }
  },

  async _wqGetPending() {
    try {
      const db = await this._openIDB();
      return new Promise((resolve) => {
        const tx  = db.transaction('write_queue', 'readonly');
        const idx = tx.objectStore('write_queue').index('by_synced');
        const req = idx.getAll(IDBKeyRange.only(false));
        req.onsuccess = (e) => resolve((e.target.result || []).sort((a,b) => a.ts - b.ts));
        req.onerror   = () => resolve([]);
      });
    } catch { return []; }
  },

  async _wqMarkSynced(wqId) {
    try {
      const db = await this._openIDB();
      return new Promise((resolve) => {
        const tx    = db.transaction('write_queue', 'readwrite');
        const store = tx.objectStore('write_queue');
        const get   = store.get(wqId);
        get.onsuccess = (e) => {
          const r = e.target.result;
          if (r) { r.synced = true; r.syncedAt = Date.now(); store.put(r); }
          resolve();
        };
        get.onerror = () => resolve();
      });
    } catch {}
  },

  async _wqIncrRetries(wqId, errMsg) {
    try {
      const db = await this._openIDB();
      return new Promise((resolve) => {
        const tx    = db.transaction('write_queue', 'readwrite');
        const store = tx.objectStore('write_queue');
        const get   = store.get(wqId);
        get.onsuccess = (e) => {
          const r = e.target.result;
          if (r) { r.retries = (r.retries||0)+1; r.lastError = errMsg; store.put(r); }
          resolve(r ? r.retries : 0);
        };
        get.onerror = () => resolve(0);
      });
    } catch { return 0; }
  },

  async _wqClearSynced() {
    try {
      const db = await this._openIDB();
      return new Promise((resolve) => {
        const tx  = db.transaction('write_queue', 'readwrite');
        const idx = tx.objectStore('write_queue').index('by_synced');
        const req = idx.openCursor(IDBKeyRange.only(true));
        req.onsuccess = (e) => {
          const c = e.target.result;
          if (c) { c.delete(); c.continue(); } else resolve();
        };
        req.onerror = () => resolve();
      });
    } catch {}
  },

  // Purger TOUS les records d'une table dans IDB (reset)
  async _idbClearTable(table) {
    try {
      const db = await this._openIDB();
      return new Promise((resolve) => {
        const tx    = db.transaction('records', 'readwrite');
        const store = tx.objectStore('records');
        const idx   = store.index('by_table');
        const req   = idx.openCursor(IDBKeyRange.only(table));
        req.onsuccess = (e) => {
          const c = e.target.result;
          if (c) { c.delete(); c.continue(); } else resolve();
        };
        req.onerror = () => resolve();
      });
    } catch {}
  },

  // Purger TOUTE la base IDB (reset complet)
  async _idbClearAll() {
    try {
      const db = await this._openIDB();
      return new Promise((resolve) => {
        const tx = db.transaction(['records','write_queue','meta'], 'readwrite');
        tx.objectStore('records').clear();
        tx.objectStore('write_queue').clear();
        tx.objectStore('meta').clear();
        tx.oncomplete = () => { this._memCache = {}; resolve(); };
        tx.onerror    = () => resolve();
      });
    } catch {}
  },

  // ══════════════════════════════════════════════════════════════════
  // API CLOUD (HTTP) — usage interne uniquement
  // ══════════════════════════════════════════════════════════════════

  async _apiGet(path) {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
    return res.json();
  },

  async _apiPost(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) { const t = await res.text(); throw new Error(`POST ${path} → ${res.status}: ${t}`); }
    if (res.status === 204) return null;
    return res.json();
  },

  async _apiPatch(path, body) {
    const res = await fetch(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) { const t = await res.text(); throw new Error(`PATCH ${path} → ${res.status}: ${t}`); }
    if (res.status === 204) return null;
    return res.json();
  },

  async _apiDelete(path) {
    const res = await fetch(path, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });
    if (res.status === 204 || res.ok) return null;
    throw new Error(`DELETE ${path} → ${res.status}`);
  },

  // ══════════════════════════════════════════════════════════════════
  // SYNCHRONISATION CLOUD ← → LOCAL
  // ══════════════════════════════════════════════════════════════════

  /** Cloud disponible (librairie + réseau + session) ? */
  async _cloudReady() {
    if (!window.ZeanCloud) return false;
    return ZeanCloud.isReady();
  },

  /**
   * PULL : télécharge les données cloud partagées et met à jour IndexedDB.
   * Filtre ecole_code appliqué côté client ET côté serveur (RLS).
   */
  async _pullFromCloud(table, limit = 2000) {
    if (!navigator.onLine || !window.ZeanCloud) return;
    try {
      const rows = await ZeanCloud.select(table, this._currentEcoleCode, limit);
      if (!rows) return;                       // cloud indisponible → on garde le local
      await this._idbReplaceAll(table, rows);
      this._memInvalidate(table);
    } catch (err) {
      console.warn(`[ZeanDB] Pull échoué "${table}":`, err.message);
    }
  },

  /**
   * PUSH : envoie les écritures en attente vers le cloud partagé.
   * Exécuté en arrière-plan — ne bloque jamais l'UI.
   */
  async _pushToCloud() {
    if (!navigator.onLine || this._syncing || !window.ZeanCloud) return;
    if (!(await this._cloudReady())) return;   // pas de session cloud → reste local
    const pending = await this._wqGetPending();
    if (!pending.length) return;

    this._syncing = true;
    let synced = 0;

    for (const entry of pending) {
      if ((entry.retries||0) >= 5) { await this._wqMarkSynced(entry.wqId); continue; }
      if (!ZeanCloud.isTable(entry.table)) { await this._wqMarkSynced(entry.wqId); continue; }
      try {
        if (entry.method === 'DELETE' && entry.id) {
          await ZeanCloud.remove(entry.table, entry.id);
        } else {
          // On pousse toujours l'état local complet de la ligne (POST comme PATCH)
          const full = (entry.id ? await this._idbGet(entry.table, entry.id) : null) || entry.data;
          if (full) await ZeanCloud.upsert(entry.table, full, entry.ecole_code || this._currentEcoleCode);
        }

        await this._wqMarkSynced(entry.wqId);

        // Marquer le record local comme non-dirty (synced)
        if (entry.id && entry.method !== 'DELETE') {
          try {
            const db = await this._openIDB();
            const tx = db.transaction('records', 'readwrite');
            const store = tx.objectStore('records');
            const lk = this._lk(entry.table, entry.id);
            const getReq = store.get(lk);
            getReq.onsuccess = (e) => {
              const r = e.target.result;
              if (r) { r._dirty = false; store.put(r); }
            };
          } catch {}
        }

        synced++;
      } catch (err) {
        await this._wqIncrRetries(entry.wqId, err.message);
      }
    }

    await this._wqClearSynced();
    this._syncing = false;

    if (synced > 0) {
      console.log(`[ZeanDB] ✓ ${synced} écriture(s) synchronisée(s) avec le cloud`);
      this._showSyncBadge(synced);
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // TEMPS RÉEL — collaboration entre plusieurs utilisateurs
  // ══════════════════════════════════════════════════════════════════

  SYNC_TABLES: [
    'eleves','classes','matieres','notes','paiements','depenses',
    'presences','config_scolarite','ecole_config','utilisateurs',
    'notes_audit_log','comptabilite_caisse','comptabilite_banque',
    'comptabilite_config','archives_eleves','archives_finances'
  ],

  _rtTimers: {},

  /**
   * startRealtime : à la moindre modification faite par un collègue,
   * la table concernée est re-tirée du cloud puis la page rafraîchie.
   */
  startRealtime() {
    if (!window.ZeanCloud || !this._currentEcoleCode) return;
    ZeanCloud.subscribe(this.SYNC_TABLES, this._currentEcoleCode, (table) => {
      clearTimeout(this._rtTimers[table]);
      this._rtTimers[table] = setTimeout(async () => {
        await this._pullFromCloud(table);
        try {
          if (typeof App !== 'undefined' && typeof App.refreshCurrentPage === 'function') {
            App.refreshCurrentPage();
          } else if (typeof Router !== 'undefined' && typeof Router.reload === 'function') {
            Router.reload();
          }
        } catch {}
      }, 400);
    });
  },

  stopRealtime() {
    try { window.ZeanCloud && ZeanCloud.unsubscribeAll(); } catch {}
  },


  _showSyncBadge(count) {
    try {
      const fn = typeof Toast !== 'undefined' ? (m) => Toast.success(m)
               : typeof SATk  !== 'undefined' ? (m) => SATk.success(m)
               : null;
      if (fn && count > 0) fn(`✓ ${count} modification(s) synchronisée(s).`);
    } catch {}
  },

  /**
   * startAutoSync : démarre le timer de sync périodique.
   * Appelé UNE FOIS au login, après _initialPull().
   */
  startAutoSync(intervalMs = 30000) {
    if (this._syncTimer) clearInterval(this._syncTimer);
    // Push immédiat si en ligne
    if (navigator.onLine) this._pushToCloud().catch(() => {});
    // Timer régulier
    this._syncTimer = setInterval(() => {
      if (navigator.onLine) this._pushToCloud().catch(() => {});
    }, intervalMs);
    // Réagir au retour réseau
    window.addEventListener('online', this._onlineHandler = () => {
      console.log('[ZeanDB] Réseau revenu → push cloud');
      this._pushToCloud().catch(() => {});
    });
  },

  stopAutoSync() {
    if (this._syncTimer) { clearInterval(this._syncTimer); this._syncTimer = null; }
    if (this._onlineHandler) { window.removeEventListener('online', this._onlineHandler); this._onlineHandler = null; }
  },

  /**
   * _initialPull : ATTEND la fin du pull avant de résoudre.
   * Appelé UNE FOIS au login (avant startAutoSync).
   * Si offline → retourne immédiatement (IDB déjà peuplée).
   */
  async _initialPull() {
    if (!navigator.onLine) {
      console.log('[ZeanDB] Offline — utilisation des données locales');
      this._pullReady = true;
      return;
    }
    const tables = [
      'eleves','classes','matieres','notes','paiements','depenses',
      'presences','config_scolarite','ecole_config','utilisateurs',
      'annonces_plateforme','notes_audit_log','comptabilite_caisse',
      'comptabilite_banque','comptabilite_config'
    ];
    // Pull en parallèle par groupes de 5
    const chunks = [];
    for (let i = 0; i < tables.length; i += 5) chunks.push(tables.slice(i, i+5));
    for (const chunk of chunks) {
      await Promise.allSettled(chunk.map(t => this._pullFromCloud(t)));
    }
    this._pullReady = true;
    console.log('[ZeanDB] Pull initial terminé — données locales à jour');
  },

  // ══════════════════════════════════════════════════════════════════
  // CACHE MÉMOIRE (accélération lectures répétées dans une même page)
  // ══════════════════════════════════════════════════════════════════

  _memCache    : {},
  _memCacheExp : {},
  MEM_TTL      : 5000, // 5 secondes (court — données fraîches)

  _memGet(key) {
    if (this._memCache[key] && Date.now() < (this._memCacheExp[key]||0)) return this._memCache[key];
    return null;
  },
  _memSet(key, data) {
    this._memCache[key] = data;
    this._memCacheExp[key] = Date.now() + this.MEM_TTL;
  },
  _memInvalidate(table) {
    Object.keys(this._memCache).forEach(k => {
      if (k.startsWith(table + '|')) delete this._memCache[k];
    });
    Object.keys(this._memCacheExp).forEach(k => {
      if (k.startsWith(table + '|')) delete this._memCacheExp[k];
    });
  },

  // ══════════════════════════════════════════════════════════════════
  // API PUBLIQUE — CRUD (Local-First pur)
  // ══════════════════════════════════════════════════════════════════

  /**
   * getAll — Lecture depuis IndexedDB UNIQUEMENT.
   * Aucun pull réseau (pas de re-render silencieux cassé).
   * Les pages reçoivent les données actuelles de l'IDB.
   */
  async getAll(table, limit = 500) {
    const code = this._currentEcoleCode || '';
    const key  = `${table}|all|${code}|${limit}`;
    const cached = this._memGet(key);
    if (cached) return cached;

    const rows = await this._idbGetAll(table);
    this._memSet(key, rows);
    return rows;
  },

  /**
   * getById — Lecture depuis IndexedDB uniquement.
   */
  async getById(table, id) {
    if (!id) return null;
    const key = `${table}|id|${id}`;
    const cached = this._memGet(key);
    if (cached) return cached;

    const row = await this._idbGet(table, id);
    if (row) this._memSet(key, row);
    return row || null;
  },

  /**
   * query — getAll + filtre fonctionnel.
   */
  async query(table, filterFn, limit = 500) {
    const rows = await this.getAll(table, limit);
    return rows.filter(filterFn);
  },

  /**
   * getAllPaged — Pagination côté client sur IDB.
   * Fallback API directe si en ligne pour les grandes listes SA.
   */
  async getAllPaged(table, page = 1, limit = 50, search = '') {
    // Pour SA (pas de code école) et en ligne → API directe pour vrai total
    if (!this._currentEcoleCode && navigator.onLine) {
      try {
        const url = `tables/${table}?page=${page}&limit=${limit}${search ? '&search='+encodeURIComponent(search) : ''}`;
        const data = await this._apiGet(url);
        return data || { data: [], total: 0, page: 1, limit };
      } catch {}
    }
    // Sinon : pagination locale sur IDB
    const all = await this.getAll(table, 2000);
    const filtered = search
      ? all.filter(r => JSON.stringify(r).toLowerCase().includes(search.toLowerCase()))
      : all;
    const start = (page-1)*limit;
    return { data: filtered.slice(start, start+limit), total: filtered.length, page, limit };
  },

  /**
   * INSERT — Écriture immédiate en IDB.
   * Résultat visible SANS attendre le réseau.
   */
  async insert(table, data) {
    const enriched = { ...data };
    // Multi-tenancy : le code fourni explicitement gagne (création d'école /
    // de compte depuis le SuperAdmin), sinon on force l'école courante.
    if (!this.GLOBAL_TABLES.includes(table)) {
      const explicit = (data.ecole_code || data.school_code || '').trim().toUpperCase();
      if (explicit) enriched.ecole_code = explicit;
      else if (this._currentEcoleCode) enriched.ecole_code = this._currentEcoleCode;
    }
    if (!enriched.id) {
      enriched.id = 'loc_' + Date.now() + '_' + Math.random().toString(36).substr(2,6);
    }
    enriched.created_at = enriched.created_at || Date.now();
    enriched.updated_at = Date.now();

    // 1. Écriture IDB immédiate
    await this._idbPut(table, enriched, true);
    // 2. Invalider cache → prochain getAll lit les nouvelles données
    this._memInvalidate(table);
    // 3. Write queue → sync cloud en fond
    await this._wqPush(table, 'POST', enriched.id, enriched);
    // 4. Push cloud en arrière-plan (non-bloquant)
    if (navigator.onLine) this._pushToCloud().catch(() => {});

    return enriched;
  },

  /**
   * UPDATE — Mise à jour immédiate en IDB.
   */
  async update(table, id, data) {
    const existing = await this._idbGet(table, id) || {};
    const merged = { ...existing, ...data, id, updated_at: Date.now() };
    // Préserver isolation école (sans écraser un code déjà porté par la ligne)
    if (!this.GLOBAL_TABLES.includes(table)) {
      const keep = (data.ecole_code || existing.ecole_code || this._currentEcoleCode || '').trim().toUpperCase();
      if (keep) merged.ecole_code = keep;
    }

    await this._idbPut(table, merged, true);
    this._memInvalidate(table);
    await this._wqPush(table, 'PATCH', id, data);
    if (navigator.onLine) this._pushToCloud().catch(() => {});

    return merged;
  },

  /**
   * DELETE — Suppression immédiate en IDB (soft-delete).
   */
  async delete(table, id) {
    await this._idbDelete(table, id);
    this._memInvalidate(table);
    await this._wqPush(table, 'DELETE', id, null);
    if (navigator.onLine) this._pushToCloud().catch(() => {});
    return true;
  },

  // ══════════════════════════════════════════════════════════════════
  // USERS — Auth multi-école
  // ══════════════════════════════════════════════════════════════════

  async getUsersByEcole(ecoleCode) {
    const code = (ecoleCode || '').trim().toUpperCase();
    const match = (rows) => {
      if (!code) return rows;
      const tagged = rows.filter(u => (u.ecole_code || u.school_code || '').trim().toUpperCase() === code);
      if (tagged.length) return tagged;
      // Legacy / mono-école : comptes sans tag utilisables uniquement s'il
      // n'existe aucun compte tagué pour une autre école.
      const untagged = rows.filter(u => !(u.ecole_code || u.school_code));
      return untagged;
    };
    try {
      // 1. Lecture locale d'abord (local-first : la création est instantanée)
      const prev = this._currentEcoleCode;
      this._currentEcoleCode = null;         // lecture brute, sans filtre strict
      let allLocal = [];
      try { allLocal = await this._idbGetAll('utilisateurs'); }
      finally { this._currentEcoleCode = prev; }
      const local = match(allLocal);
      if (local.length) return local;

      // 2. Sinon seulement, tenter le cloud (si disponible)
      if (navigator.onLine) {
        try {
          const resp = await this._apiGet('tables/utilisateurs?limit=500');
          const rows = resp?.data || [];
          for (const u of rows) {
            if (u.id) await this._idbPut('utilisateurs', u, false);
          }
          this._memInvalidate('utilisateurs');
          return match(rows);
        } catch (e) { console.warn('[ZeanDB] getUsersByEcole cloud indisponible :', e.message); }
      }
      return local;
    } catch { return []; }
  },

  /**
   * findEcoleByCode — Recherche une école dans la table globale `ecoles`
   * de l'IndexedDB. 100% local : une école créée est reconnue immédiatement,
   * sans rafraîchissement réseau.
   */
  async findEcoleByCode(code) {
    const c = (code || '').trim().toUpperCase();
    if (!c) return null;
    try {
      const rows = await this._idbGetAll('ecoles');
      return rows.find(e =>
        (e.code || '').trim().toUpperCase() === c ||
        (e.code_ecole || '').trim().toUpperCase() === c
      ) || null;
    } catch { return null; }
  },

  /**
   * registerEcole — Enregistre / met à jour une école dans le registre global
   * local (table `ecoles`) afin que son code soit connectable aussitôt.
   */
  async registerEcole(ecole) {
    if (!ecole) return null;
    const code = (ecole.code || ecole.code_ecole || '').trim().toUpperCase();
    if (!code) return null;
    const existing = await this.findEcoleByCode(code);
    const row = {
      id: existing?.id || ecole.id || 'ecole-' + Date.now(),
      ...existing, ...ecole, code, code_ecole: code,
      created_at: existing?.created_at || ecole.created_at || Date.now(),
      updated_at: Date.now()
    };
    await this._idbPut('ecoles', row, false);
    this._memInvalidate('ecoles');
    return row;
  },

  // ══════════════════════════════════════════════════════════════════
  // CONFIG ÉCOLE
  // ══════════════════════════════════════════════════════════════════

  async getEcoleConfig() {
    const key = 'ecole_config|main';
    const cached = this._memGet(key);
    if (cached) return cached;

    const rows = await this.getAll('ecole_config', 10);
    const cfg = rows[0] || { nom: 'Mon École', devise: 'GNF', matricule_prefix: 'ZSM' };
    this._memSet(key, cfg);
    return cfg;
  },

  async setEcoleConfig(updates) {
    this._memInvalidate('ecole_config');
    const cfg = await this.getEcoleConfig();
    if (cfg?.id) {
      return this.update('ecole_config', cfg.id, updates);
    } else {
      return this.insert('ecole_config', { id: 'ecole-main', ...updates });
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // GÉNÉRATION MATRICULE
  // ══════════════════════════════════════════════════════════════════

  async generateMatricule(prefix) {
    const eleves = await this.getAll('eleves');
    const num  = String(eleves.length + 1).padStart(3, '0');
    const year = new Date().getFullYear().toString().substr(2);
    return `${prefix}-MAT-${year}${num}`;
  },

  // ══════════════════════════════════════════════════════════════════
  // LOGIQUE PRIMAIRE / COLLÈGE
  // ══════════════════════════════════════════════════════════════════

  isPrimaire(niveau) { return ['1ere','2eme','3eme','4eme','5eme','6eme'].includes(niveau); },
  isCollege(niveau)  { return ['7eme','8eme','9eme','10eme'].includes(niveau); },

  async getNiveauClasse(classeId) {
    const cls = await this.getById('classes', classeId);
    return cls?.niveau || '';
  },

  async getMatieresAutoriseesProf(user, classeId) {
    const matieres = await this.query('matieres', m => m.classe_id === classeId);
    if (!user || ['admin','directeur','comptable'].includes(user.role)) return matieres;
    const cls = await this.getById('classes', classeId);
    if (!cls) return matieres;
    if (this.isPrimaire(cls.niveau)) {
      return user.classe_id === classeId ? matieres : [];
    }
    // Collège : filtre par matieres_ids assignées
    if (user.matieres_ids?.length) {
      return matieres.filter(m => user.matieres_ids.includes(m.id));
    }
    return [];
  },

  async getClassesProf(user) {
    if (!user || ['admin','directeur','comptable','superviseur'].includes(user.role)) {
      return this.getAll('classes');
    }
    const classes = await this.getAll('classes');
    if (this.isPrimaire) {
      // Primaire : classe assignée directement
      if (user.classe_id) return classes.filter(c => c.id === user.classe_id);
    }
    // Collège : classes contenant ses matières
    if (user.matieres_ids?.length) {
      const matieres = await this.query('matieres', m => user.matieres_ids.includes(m.id));
      const classeIds = [...new Set(matieres.map(m => m.classe_id))];
      return classes.filter(c => classeIds.includes(c.id));
    }
    if (user.classe_id) return classes.filter(c => c.id === user.classe_id);
    return classes;
  },

  // ══════════════════════════════════════════════════════════════════
  // STATUTS PAIEMENTS — CALCUL 100% LOCAL
  // ══════════════════════════════════════════════════════════════════

  getAppreciation(moy) {
    if (moy === null || moy === undefined) return '—';
    const m = parseFloat(moy);
    if (m >= 16) return 'Très Bien';
    if (m >= 14) return 'Bien';
    if (m >= 12) return 'Assez Bien';
    if (m >= 10) return 'Passable';
    return 'Médiocre';
  },

  /**
   * Calcule le statut paiement d'un élève DEPUIS LES DONNÉES LOCALES.
   * Aucun accès réseau. Résultat immédiat.
   */
  getStatutPaiementSync(eleveId, elevesMap, classesMap, configsSco, paiementsMap) {
    const eleve  = elevesMap[eleveId];
    if (!eleve) return 'aucun';
    if (eleve.exonere) return 'exonere';
    const cls    = classesMap[eleve.classe_id];
    if (!cls) return 'aucun';
    const cfg    = configsSco.find(c => c.niveau === cls.niveau);
    if (!cfg)  return 'aucun';
    const total  = parseFloat(cfg.montant_annuel || 0);
    if (total <= 0) return 'exonere';
    const paye   = paiementsMap[eleveId] || 0;
    if (paye >= total) return 'solde';
    if (paye > 0) return 'encours';
    return 'aucun';
  },

  // ══════════════════════════════════════════════════════════════════
  // COMPATIBILITÉ (anciens appels)
  // ══════════════════════════════════════════════════════════════════

  _invalidateCache(table) { this._memInvalidate(table); },

  async _fetch(method, path, body) {
    try {
      if (method === 'GET') return await this._apiGet(path);
      if (method === 'POST') return await this._apiPost(path, body);
      if (method === 'PATCH') return await this._apiPatch(path, body);
      if (method === 'DELETE') { await this._apiDelete(path); return null; }
    } catch { return null; }
  }
};
