'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Chip } from '@/components/ui/primitives';
import { ICONS, Icon } from '@/components/landing/kit';

/**
 * The combined search and planning entry from Screen T01.
 *
 * A typed sentence opens Dream AI with the text preserved; a quick intent chip
 * does the same with a starting phrase. Nothing here requests location,
 * notifications or sign-in.
 */

/** PRD Part I T01 quick intent chips. */
const INTENT_CHIPS = [
  { label: 'Weekend', phrase: 'A weekend trip', icon: ICONS.calendar },
  { label: 'Within ₹15,000', phrase: 'A trip within ₹15,000', icon: ICONS.tag },
  { label: 'Low crowd', phrase: 'Somewhere quiet, I want to avoid crowds', icon: ICONS.users },
  { label: 'Nature', phrase: 'A nature trip', icon: ICONS.leaf },
  { label: 'Heritage', phrase: 'A heritage trip', icon: ICONS.landmark },
];

export function HomeSearch() {
  const router = useRouter();
  const [value, setValue] = useState('');

  const start = (text: string): void => {
    const trimmed = text.trim();
    if (trimmed === '') return;
    router.push(`/dream-ai?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="mt-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          start(value);
        }}
        className="flex flex-col gap-2 rounded-[28px] border border-white bg-white/90 p-2 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:rounded-full"
      >
        <label htmlFor="home-search" className="visually-hidden">
          Where do you want to dream today?
        </label>
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
          <Icon d={ICONS.search} className="text-text-secondary" />
          <input
            id="home-search"
            name="q"
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="A 4 day family trip from Coimbatore under ₹25,000"
            autoComplete="off"
            className="min-h-[48px] min-w-0 flex-1 bg-transparent text-[16px] placeholder:text-text-secondary focus-visible:outline-none"
          />
        </div>
        <Button type="submit" disabled={value.trim() === ''} className="rounded-full sm:px-7">
          Start planning
        </Button>
      </form>

      <ul className="mt-4 flex flex-wrap gap-2">
        {INTENT_CHIPS.map((chip) => (
          <li key={chip.label}>
            <Chip type="button" onClick={() => start(chip.phrase)} className="gap-2 shadow-sm">
              <Icon d={chip.icon} size={16} className="text-brand-primary" />
              {chip.label}
            </Chip>
          </li>
        ))}
      </ul>
    </div>
  );
}
