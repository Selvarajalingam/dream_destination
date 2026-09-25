'use client';

import clsx from 'clsx';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * The sticky site header. At the top of the page it is a full-width bar; once
 * the page scrolls it shrinks into a floating pill. Motion is skipped for
 * people who ask for reduced motion.
 */
export function ScrollHeader({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = (): void => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return (
    <header className={clsx('sticky top-0 z-40 motion-safe:transition-[padding] motion-safe:duration-300', scrolled && 'px-3 pt-3')}>
      <div
        className={clsx(
          'mx-auto motion-safe:transition-all motion-safe:duration-300',
          scrolled
            ? 'max-w-[1100px] rounded-full border border-border-subtle bg-white/85 px-2 shadow-lg backdrop-blur-md'
            : 'max-w-none border-b border-border-subtle bg-white/90 backdrop-blur',
        )}
      >
        <div className={clsx('flex min-h-[64px] items-center justify-between gap-4 py-2', scrolled ? 'px-4' : 'page-gutter')}>
          {children}
        </div>
      </div>
    </header>
  );
}
