'use client';

import { useState } from 'react';
import { api } from '@/lib/api-client';

/**
 * B01 local-language selection. Saved on the account, so it follows the
 * owner. The page reloads, because every string on it changes.
 */

const OPTIONS = [
  { locale: 'en-IN', label: 'English' },
  { locale: 'ta-IN', label: 'தமிழ்' },
] as const;

export function LocaleSwitch({ locale, label }: { locale: string; label: string }) {
  const [busy, setBusy] = useState(false);

  const choose = async (next: string): Promise<void> => {
    if (next === locale) return;
    setBusy(true);
    try {
      await api.put('/api/v1/me/locale', { locale: next });
      window.location.reload();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div role="group" aria-label={label} className="flex rounded-lg border border-border-subtle p-0.5">
      {OPTIONS.map((option) => (
        <button
          key={option.locale}
          type="button"
          lang={option.locale === 'ta-IN' ? 'ta' : 'en'}
          aria-pressed={option.locale === locale}
          disabled={busy}
          onClick={() => void choose(option.locale)}
          className={`min-h-[40px] rounded-md px-3 text-[14px] font-[650] ${
            option.locale === locale ? 'bg-brand-deep text-white' : 'text-text-primary hover:bg-surface-subtle'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
