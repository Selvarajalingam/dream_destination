'use client';

import { useEffect, useState } from 'react';

/**
 * False during the server render and until the page is interactive, then true.
 *
 * Forms that save through the API disable themselves until it flips. On a
 * slow connection, or while a dev server is still compiling, anything typed
 * or pressed before hydration would otherwise fall back to a native form
 * submit and be lost.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
