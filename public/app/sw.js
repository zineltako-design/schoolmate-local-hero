/**
 * sw.js — Service Worker Zean School Manager R11
 * Stratégie : Cache-First pour les assets statiques + Network-First pour l'API
 * Permet le chargement de l'UI même hors connexion (après premier chargement)
 */

const CACHE_NAME = 'zean-school-v1';
const CACHE_VERSION = 1;

// Assets statiques à mettre en cache (shell de l'application)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/db.js',
  '/js/offline.js',
  '/js/help.js',
  '/js/app.js',
  '/js/pages.js'
];

// ── INSTALLATION ────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installation…');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Mise en cache des assets statiques');
        // On utilise addAll avec gestion des erreurs individuelles
        return Promise.allSettled(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch(err => console.warn(`[SW] Impossible de mettre en cache: ${url}`, err))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATION ──────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activation…');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log(`[SW] Suppression ancien cache: ${name}`);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── FETCH — Stratégie hybride ─────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ne pas intercepter les requêtes Chrome extension / non HTTP
  if (!event.request.url.startsWith('http')) return;

  // API Genspark (tables/) → Network-First (données fraîches prioritaires)
  if (url.pathname.includes('/tables/')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // CDN externe → Network-First avec fallback cache
  if (url.hostname !== self.location.hostname) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Assets statiques (HTML, CSS, JS) → Cache-First
  event.respondWith(cacheFirst(event.request));
});

// ── Stratégie Cache-First ────────────────────────────────────────
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Retourner la page principale si disponible (SPA fallback)
    const fallback = await caches.match('/index.html');
    if (fallback) return fallback;
    return new Response('Hors ligne — rechargez quand la connexion est rétablie.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

// ── Stratégie Network-First ─────────────────────────────────────
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    // Mettre en cache les réponses GET réussies
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Réseau indisponible → chercher dans le cache
    const cached = await caches.match(request);
    if (cached) {
      console.log(`[SW] Offline fallback depuis cache: ${request.url}`);
      return cached;
    }
    // Réponse d'erreur JSON pour les requêtes API
    if (request.url.includes('/tables/')) {
      return new Response(JSON.stringify({ error: 'Hors ligne', data: [], total: 0 }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('Ressource non disponible hors ligne.', { status: 503 });
  }
}

// ── MESSAGE : forcer la mise à jour du cache ─────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => console.log('[SW] Cache vidé'));
  }
});
