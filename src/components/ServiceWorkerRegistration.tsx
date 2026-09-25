'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker for the whole application.
 *
 * Registering only on the offline-pack screen meant the shell was precached
 * only if a traveller happened to visit that screen first, so Nearby Help
 * could be unavailable offline for someone who had never opened it. The
 * worker is registered once, on load, everywhere.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // In development the bundler reuses asset filenames across edits, so the
    // worker's cache-first rule for /_next/static/ would keep serving stale
    // CSS and JS. Remove any worker and its caches instead of registering.
    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())));
      void caches
        .keys()
        .then((keys) => Promise.all(keys.filter((key) => key.startsWith('dd-')).map((key) => caches.delete(key))));
      return;
    }

    const register = (): void => {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // A failed registration is not worth interrupting anyone over: the
        // application works normally online without it.
      });
    };

    // Registering after load keeps the worker's install fetches from competing
    // with the page's own requests on a slow connection.
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
