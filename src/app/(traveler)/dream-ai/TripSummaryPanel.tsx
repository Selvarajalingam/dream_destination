'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { Icon } from '@/components/landing/kit';
import { Button } from '@/components/ui/primitives';
import { formatInr, rupeesToMinor } from '@/shared/money';

/**
 * The persistent trip summary from Screen T03.
 *
 * Every extracted value is tap-to-edit, so a traveller can correct what was
 * understood without retyping the whole request. Values understood from the
 * latest message are highlighted.
 */

export type TripBriefView = {
  origin?: { label: string; coordinates?: [number, number] };
  dateFlexibility?: string;
  durationDays?: number;
  party?: { type: string; adults?: number; children?: number };
  budget?: { currency: 'INR'; totalMinor: number };
  interests?: string[];
  crowdTolerance?: 'low' | 'medium' | 'high';
  pace?: 'relaxed' | 'balanced' | 'packed';
  constraints?: { lowWalking?: boolean; medicalAccessRequired?: boolean; stepFreeRequired?: boolean };
};

/** The ten fields T03 lists for the summary panel. */
const FIELDS = [
  'origin',
  'dateFlexibility',
  'durationDays',
  'party',
  'budget',
  'interests',
  'pace',
  'crowdTolerance',
  'transport',
  'constraints',
] as const;

const LABELS: Record<(typeof FIELDS)[number], string> = {
  origin: 'From',
  dateFlexibility: 'When',
  durationDays: 'Days',
  party: 'Travelling as',
  budget: 'Budget',
  interests: 'Interests',
  pace: 'Pace',
  crowdTolerance: 'Crowds',
  transport: 'Transport',
  constraints: 'Access needs',
};

const FIELD_ICONS: Record<(typeof FIELDS)[number], string> = {
  origin: 'M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.800 12 21 12 21ZM12 12a2.500 2.500 0 1 0 0-5 2.500 2.500 0 0 0 0 5Z',
  dateFlexibility: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  durationDays: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  party: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20a6 6 0 0 1 12 0M16 5.500a3 3 0 0 1 0 5.500M18 14.500a6 6 0 0 1 3 5.500',
  budget: 'M6 4h12M6 9h12M9 4c5 0 6 5 0 5l6 8',
  interests: 'M12 20s-7-4.400-7-10a4 4 0 0 1 7-2.500A4 4 0 0 1 19 10c0 5.600-7 10-7 10Z',
  pace: 'M4 17a8 8 0 1 1 16 0M12 17l4-5',
  crowdTolerance: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20a6 6 0 0 1 12 0M16 5.500a3 3 0 0 1 0 5.500M18 14.500a6 6 0 0 1 3 5.500',
  transport: 'M5 16V11l2-5h10l2 5v5M3 16h18M7.500 19v-3M16.500 19v-3',
  constraints: 'M12 5a1.500 1.500 0 1 0 0-3 1.500 1.500 0 0 0 0 3ZM12 6v6h5l2 6M9 13a5 5 0 1 0 6 7',
};

/** How many of the ten summary fields have a value. */
export function completedCount(brief: TripBriefView): number {
  return FIELDS.filter((field) => describe(field, brief) !== null).length;
}

function describe(field: (typeof FIELDS)[number], brief: TripBriefView): string | null {
  switch (field) {
    case 'origin':
      return brief.origin?.label ?? null;
    case 'dateFlexibility':
      return brief.dateFlexibility ?? null;
    case 'durationDays':
      return brief.durationDays === undefined ? null : `${brief.durationDays} days`;
    case 'party': {
      if (brief.party === undefined) return null;
      const parts = [brief.party.type];
      if (brief.party.adults !== undefined) parts.push(`${brief.party.adults} adults`);
      if (brief.party.children !== undefined) parts.push(`${brief.party.children} children`);
      return parts.join(', ');
    }
    case 'budget':
      return brief.budget === undefined ? null : formatInr(brief.budget.totalMinor);
    case 'interests':
      return brief.interests === undefined || brief.interests.length === 0
        ? null
        : brief.interests.map((interest) => interest.replace(/_/g, ' ')).join(', ');
    case 'pace':
      return brief.pace ?? null;
    case 'crowdTolerance':
      return brief.crowdTolerance === undefined
        ? null
        : { low: 'Prefer quiet', medium: 'No preference', high: 'Busy is fine' }[brief.crowdTolerance];
    case 'transport':
      // Reserved in the summary; the MVP does not extract a transport mode.
      return null;
    case 'constraints': {
      const constraints = brief.constraints;
      if (constraints === undefined) return null;
      const notes: string[] = [];
      if (constraints.lowWalking === true) notes.push('Less walking');
      if (constraints.stepFreeRequired === true) notes.push('Step-free');
      if (constraints.medicalAccessRequired === true) notes.push('Medical access nearby');
      return notes.length === 0 ? null : notes.join(', ');
    }
    default:
      return null;
  }
}

export function TripSummaryPanel({
  brief,
  highlighted,
  onChange,
}: {
  brief: TripBriefView;
  highlighted: string[];
  onChange: (brief: TripBriefView) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const done = completedCount(brief);

  return (
    <section aria-label="Trip summary">
      <h2 className="text-[24px] font-[800] leading-tight text-brand-deep">Your trip</h2>
      <p className="mt-1 text-[14px] text-text-secondary">
        {done} of {FIELDS.length} details complete
      </p>
      <div
        role="progressbar"
        aria-label="Trip details complete"
        aria-valuemin={0}
        aria-valuemax={FIELDS.length}
        aria-valuenow={done}
        className="mt-2 h-2 overflow-hidden rounded-full bg-surface-subtle"
      >
        <div
          className="h-full rounded-full bg-brand-primary transition-[width] duration-500"
          style={{ width: `${(done / FIELDS.length) * 100}%` }}
        />
      </div>
      <p className="mt-3 text-[13px] text-text-secondary">
        Tap any row to change it. Nothing here is guessed from data you did not give us.
      </p>

      <ul className="mt-2">
        {FIELDS.map((field) => {
          const value = describe(field, brief);
          const isHighlighted = highlighted.includes(field);

          return (
            <li key={field} className="border-t border-border-subtle first:border-t-0">
              <button
                type="button"
                data-testid={`brief-${field}`}
                onClick={() => setEditing(field)}
                className={clsx(
                  'flex min-h-[44px] w-full items-center gap-3 rounded-lg px-1 text-left',
                  isHighlighted && 'bg-brand-saffron/10',
                )}
              >
                <Icon d={FIELD_ICONS[field]} size={18} className="text-text-secondary" />
                <span className="w-[92px] shrink-0 text-[14px] text-text-secondary">{LABELS[field]}</span>
                <span
                  className={clsx(
                    'min-w-0 flex-1 truncate text-[14px]',
                    value === null ? 'font-normal text-text-secondary' : 'font-[600] text-text-primary',
                  )}
                >
                  {value ?? 'Add'}
                </span>
                {value !== null && (
                  <span
                    aria-hidden="true"
                    className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-status-good text-white"
                  >
                    <Icon d="M5 12.500l4.500 4.500L19 7.500" size={12} />
                  </span>
                )}
                <Icon d="M4 20h4L19 9l-4-4L4 16v4ZM13.500 6.500l4 4" size={16} className="text-text-secondary" />
              </button>
            </li>
          );
        })}
      </ul>

      {editing !== null && (
        <EditField
          field={editing}
          brief={brief}
          onCancel={() => setEditing(null)}
          onSave={(next) => {
            onChange(next);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

function EditField({
  field,
  brief,
  onSave,
  onCancel,
}: {
  field: string;
  brief: TripBriefView;
  onSave: (brief: TripBriefView) => void;
  onCancel: () => void;
}) {
  const [days, setDays] = useState(brief.durationDays ?? 3);
  const [rupees, setRupees] = useState(
    brief.budget === undefined ? 25_000 : brief.budget.totalMinor / 100,
  );
  const [origin, setOrigin] = useState(brief.origin?.label ?? '');

  const save = (): void => {
    if (field === 'durationDays') onSave({ ...brief, durationDays: days });
    else if (field === 'budget') onSave({ ...brief, budget: { currency: 'INR', totalMinor: rupeesToMinor(rupees) } });
    else if (field === 'origin') onSave({ ...brief, origin: { label: origin } });
    else onCancel();
  };

  return (
    <div className="mt-3 rounded-xl border border-border-subtle bg-surface-subtle p-3">
      {field === 'durationDays' && (
        <label className="block text-[14px] font-[650]">
          Days
          <input
            type="number"
            min={1}
            max={60}
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="mt-1 block min-h-[44px] w-full rounded-lg border border-border-subtle px-3 text-[16px]"
          />
        </label>
      )}

      {field === 'budget' && (
        <label className="block text-[14px] font-[650]">
          Total budget in rupees
          <input
            type="number"
            min={0}
            step={500}
            value={rupees}
            onChange={(event) => setRupees(Number(event.target.value))}
            className="mt-1 block min-h-[44px] w-full rounded-lg border border-border-subtle px-3 text-[16px]"
          />
        </label>
      )}

      {field === 'origin' && (
        <label className="block text-[14px] font-[650]">
          Travelling from
          <input
            type="text"
            value={origin}
            onChange={(event) => setOrigin(event.target.value)}
            className="mt-1 block min-h-[44px] w-full rounded-lg border border-border-subtle px-3 text-[16px]"
          />
        </label>
      )}

      {!['durationDays', 'budget', 'origin'].includes(field) && (
        <p className="text-[14px] text-text-secondary">
          Tell the assistant in the message box and it will update this.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <Button size="small" onClick={save}>
          Save
        </Button>
        <Button size="small" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
