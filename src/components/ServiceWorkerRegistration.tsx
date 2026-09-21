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
