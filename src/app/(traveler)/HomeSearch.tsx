'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Chip } from '@/components/ui/primitives';

/**
 * The combined search and planning entry from Screen T01.
 *
 * A typed sentence opens Dream AI with the text preserved; a quick intent chip
 * does the same with a starting phrase. Nothing here requests location,
 * notifications or sign-in.
 */

/** PRD Part I T01 quick intent chips. */
const INTENT_CHIPS = [
  { label: 'Weekend', phrase: 'A weekend trip' },
  { label: 'Within ₹15,000', phrase: 'A trip within ₹15,000' },
  { label: 'Low crowd', phrase: 'Somewhere quiet, I want to avoid crowds' },
  { label: 'Nature', phrase: 'A nature trip' },
  { label: 'Heritage', phrase: 'A heritage trip' },
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
    <div className="mt-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          start(value);
        }}
        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
      >
        <label htmlFor="home-search" className="visually-hidden">
          Where do you want to dream today?
        </label>
        <input
          id="home-search"
          name="q"
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="A 4 day family trip from Coimbatore under ₹25,000"
          autoComplete="off"
          className="min-h-[52px] min-w-0 flex-1 basis-48 rounded-[12px] border border-border-subtle bg-surface-base px-4 text-[16px] placeholder:text-text-secondary"
        />
        <Button type="submit" disabled={value.trim() === ''}>
          Start planning
        </Button>
      </form>

      <ul className="mt-3 flex flex-wrap gap-2">
        {INTENT_CHIPS.map((chip) => (
          <li key={chip.label}>
            <Chip type="button" onClick={() => start(chip.phrase)}>
              {chip.label}
            </Chip>
          </li>
        ))}
      </ul>
    </div>
  );
}
