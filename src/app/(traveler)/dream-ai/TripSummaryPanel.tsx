'use client';

import clsx from 'clsx';
import { useState } from 'react';
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

  return (
    <section aria-label="Trip summary">
      <h2 className="text-[18px] font-[650]">Your trip so far</h2>
      <p className="mt-1 text-[14px] text-text-secondary">
        Tap any value to change it. Nothing here is guessed from data you did not give us.
      </p>

      <dl className="mt-3 space-y-1">
        {FIELDS.map((field) => {
          const value = describe(field, brief);
          const isHighlighted = highlighted.includes(field);

          return (
            <div
              key={field}
              className="flex items-center justify-between gap-3 border-t border-border-subtle py-1"
            >
              <dt className="text-[14px] text-text-secondary">{LABELS[field]}</dt>
              <dd>
                <button
                  type="button"
                  data-testid={`brief-${field}`}
                  onClick={() => setEditing(field)}
                  className={clsx(
                    'min-h-[44px] rounded-lg px-2 text-right text-[14px] font-[650]',
                    value === null && 'text-text-secondary font-normal',
                    isHighlighted && 'bg-brand-saffron/15 ring-1 ring-brand-saffron/40',
                  )}
                >
                  {value ?? 'Not set'}
                </button>
              </dd>
            </div>
          );
        })}
      </dl>

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
