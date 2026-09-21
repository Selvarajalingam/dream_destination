/**
 * Dream Destination service worker.
 *
 * Implements the five caching strategies from PRD Part II §11.1:
 *
 *   app shell and versioned assets   cache first
 *   public content                   stale while revalidate
 *   saved trip pack                  explicit user-managed cache
 *   crowd, weather, rules, prices    network first, short timeout,
 *                                    cached fallback labelled stale
 *   authentication and mutations     network only
 *
 * Every cached API response is stamped with the time it was stored, so the UI
 * can say "Viewing saved information from 8:30 AM" rather than presenting
 * stale data as current (§5.9).
 */

const VERSION = 'v1';
const SHELL_CACHE = `dd-shell-${VERSION}`;
const CONTENT_CACHE = `dd-content-${VERSION}`;
const FRESH_CACHE = `dd-fresh-${VERSION}`;
const PACK_PREFIX = 'dd-pack-';

/** Header carrying the moment a response was cached. */
const CACHED_AT = 'x-dd-cached-at';

/**
 * Next.js sets `Vary: rsc, next-router-state-tree, ...` on HTML responses, so
 * a cached page never matches a later navigation whose router headers differ.
 * Every lookup here ignores Vary, matching on the URL, which is what we
 * actually key these caches by.
 */
const MATCH = { ignoreVary: true };

/** Routes that must always work with no signal. */
const SHELL_ROUTES = ['/', '/help', '/trips', '/offline'];

/** Network-first timeout, short enough not to strand a traveller. */
const NETWORK_TIMEOUT_MS = 2500;

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

/**
 * Precaches each shell route independently.
 *
 * cache.addAll is atomic: one route returning 404 discards the whole batch and
 * leaves nothing cached, which is the worst possible failure for an offline
 * feature because it fails silently. Caching one at a time means a missing
 * route costs only that route.
 */
async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);

  await Promise.all(
    SHELL_ROUTES.map(async (route) => {
      try {
        const response = await fetch(new Request(route, { cache: 'reload' }));
        if (response.ok) await cache.put(route, stamp(response));
      } catch {
        // A route that cannot be precached still works online; it simply will
        // not be available offline until it has been visited once.
      }
    }),
  );
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith('dd-') &&
                !key.endsWith(VERSION) &&
                !key.startsWith(PACK_PREFIX),
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * API paths whose freshness matters, fetched network-first.
 *
 * Scoped to /api/ deliberately: the Nearby Help *page* is a navigation that
 * must survive offline from the shell cache, while the help *endpoint* should
 * prefer a fresh answer. Matching on the bare word would have sent the page
 * down the API path and looked for it in the wrong cache.
 */
const FRESHNESS_SENSITIVE = ['/api/v1/places/', '/api/v1/trips/', '/api/v1/weather'];

/** Paths that must never be served from cache. */
const NETWORK_ONLY = ['/api/v1/trips', '/api/v1/trip-briefs', '/api/v1/admin', '/api/v1/recommendations'];

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Authentication and mutations: network only. A stale answer here would be
  // worse than no answer.
  if (NETWORK_ONLY.some((path) => url.pathname.startsWith(path)) && !isPackResource(url)) {
    return;
  }

  if (FRESHNESS_SENSITIVE.some((path) => url.pathname.startsWith(path))) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(navigationStrategy(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

function isPackResource(url) {
  return /\/api\/v1\/trips\/[^/]+\/(offline-summary|help|rules|stories|businesses)$/.test(url.pathname);
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request, MATCH);
  if (cached !== undefined) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    void cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CONTENT_CACHE);
  const cached = await cache.match(request, MATCH);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) void cache.put(request, stamp(response.clone()));
      return response;
    })
    .catch(() => undefined);

  if (cached !== undefined) {
    void network;
    return cached;
  }

  const response = await network;
  return response ?? offlineFallback(request);
}

async function networkFirst(request) {
  const cache = await caches.open(FRESH_CACHE);

  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (response.ok) void cache.put(request, stamp(response.clone()));
    return response;
  } catch {
    // Fall back to whatever was stored, with its age attached so the UI can
    // label it rather than presenting it as current. The lookup spans every
    // cache, because a trip pack resource lives in its own pack cache.
    const cached = (await cache.match(request, MATCH)) ?? (await caches.match(request, MATCH));
    if (cached !== undefined) return markStale(cached);
    return offlineFallback(request);
  }
}

async function navigationStrategy(request) {
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (response.ok) {
      const cache = await caches.open(CONTENT_CACHE);
      void cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request, MATCH);
    if (cached !== undefined) return cached;

    const shell = await caches.match('/offline', MATCH);
    return shell ?? offlineFallback(request);
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Records when a response entered the cache. */
function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set(CACHED_AT, new Date().toISOString());
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Marks a served-from-cache response so the UI can show its age. */
function markStale(response) {
  const headers = new Headers(response.headers);
  headers.set('x-dd-stale', 'true');
  if (!headers.has(CACHED_AT)) headers.set(CACHED_AT, new Date(0).toISOString());
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function offlineFallback(request) {
  const accept = request.headers.get('accept') ?? '';

  if (accept.includes('application/json')) {
    return new Response(
      JSON.stringify({
        type: 'https://dreamdestination.in/problems/offline',
        title: 'You are offline',
        status: 503,
        detail: 'This information needs a connection. Your saved trip is still available.',
        actions: ['open_saved_trip'],
        requestId: 'offline',
      }),
      { status: 503, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
      '<body style="font-family:system-ui;padding:24px">' +
      '<h1>You are offline</h1>' +
      '<p>Your saved trip is still available from the Trips tab.</p>',
    { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

/**
 * Explicit, user-managed trip pack caching. The page posts the manifest; the
 * worker fetches each resource and reports progress back, so Screen T21 can
 * show which parts succeeded and which did not.
 */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (data === null || typeof data !== 'object') return;

  if (data.type === 'CACHE_TRIP_PACK') {
    event.waitUntil(cacheTripPack(data.manifest, event.source));
  }

  if (data.type === 'REMOVE_TRIP_PACK') {
    event.waitUntil(caches.delete(`${PACK_PREFIX}${data.tripId}`));
  }
});

async function cacheTripPack(manifest, client) {
  const cache = await caches.open(`${PACK_PREFIX}${manifest.tripId}`);
  const results = [];

  for (const resource of manifest.resources) {
    try {
      const response = await fetch(resource.url, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`status ${response.status}`);

      await cache.put(resource.url, stamp(response.clone()));
      results.push({ url: resource.url, label: resource.label, ok: true, required: resource.required });
    } catch (error) {
      results.push({
        url: resource.url,
        label: resource.label,
        ok: false,
        required: resource.required,
        reason: error instanceof Error ? error.message : 'failed',
      });
    }

    client?.postMessage({ type: 'TRIP_PACK_PROGRESS', tripId: manifest.tripId, results });
  }

  await cache.put(
    `/__pack__/${manifest.tripId}`,
    new Response(JSON.stringify({ ...manifest, results }), {
      headers: { 'content-type': 'application/json', [CACHED_AT]: new Date().toISOString() },
    }),
  );

  const requiredFailed = results.some((result) => result.required && !result.ok);

  client?.postMessage({
    type: 'TRIP_PACK_DONE',
    tripId: manifest.tripId,
    // "Partially failed" is a real T21 state: some resources saved, some not.
    status: requiredFailed ? 'partial' : results.every((r) => r.ok) ? 'saved' : 'partial',
    results,
  });
}
