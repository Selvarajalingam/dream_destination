'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button, Card, Chip } from '@/components/ui/primitives';
import { EmptyState } from '@/components/states/states';
import { ApiProblemError, api } from '@/lib/api-client';
import { MIN_REVERIFY_NOTE } from '@/modules/operations/domain/freshness';

/**
 * Screen A05 — the freshness board.
 *
 * Selection exists only to send reminders. Re-verification is a per-record
 * action with a mandatory note, reached from each row, and the screen says
 * plainly why there is no "mark all fresh".
 */

type Group = 'rule' | 'help_facility' | 'source' | 'business';

type Item = {
  entityType: Group;
  id: string;
  title: string;
  context: string;
  authority: string | null;
  reviewDueAt: string | null;
  state: 'stale' | 'expiring' | 'fresh';
  daysOverdue: number | null;
  assignedToId: string | null;
  assignedToName: string | null;
  reminderCount: number;
  lastRemindedAt: string | null;
};

const GROUP_LABEL: Record<Group, string> = {
  rule: 'Rules',
  help_facility: 'Emergency facilities',
  source: 'Operating hours',
  business: 'Business records',
};

const key = (item: Pick<Item, 'entityType' | 'id'>): string => `${item.entityType}:${item.id}`;

export function FreshnessBoard({
  items,
  reviewers,
}: {
  items: Item[];
  reviewers: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();

  const [filter, setFilter] = useState<'all' | 'stale' | 'expiring'>('all');
  const [group, setGroup] = useState<Group | 'all'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reverifying, setReverifying] = useState<Item | null>(null);
  const [message, setMessage] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const visible = useMemo(
    () =>
      items.filter(
        (item) => (filter === 'all' || item.state === filter) && (group === 'all' || item.entityType === group),
      ),
    [items, filter, group],
  );

  const counts = {
    stale: items.filter((item) => item.state === 'stale').length,
    expiring: items.filter((item) => item.state === 'expiring').length,
  };

  const toggle = (item: Item): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key(item))) next.delete(key(item));
      else next.add(key(item));
      return next;
    });
  };

  const remind = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      const entries = items
        .filter((item) => selected.has(key(item)))
        .map((item) => ({ entityType: item.entityType, entityId: item.id }));

      const result = await api.post<{ reminded: number }>('/api/v1/admin/freshness/remind', { entries });
      setMessage({
        tone: 'good',
        text: `Reminder recorded on ${result.reminded} record${result.reminded === 1 ? '' : 's'}.`,
      });
      setSelected(new Set());
      router.refresh();
    } catch (caught) {
      setMessage({ tone: 'bad', text: describe(caught) });
    } finally {
      setBusy(false);
    }
  };

  const assign = async (item: Item, assignedTo: string | null): Promise<void> => {
    setMessage(null);
    try {
      await api.post('/api/v1/admin/freshness/assign', {
        entityType: item.entityType,
        entityId: item.id,
        assignedTo,
      });
      router.refresh();
    } catch (caught) {
      setMessage({ tone: 'bad', text: describe(caught) });
    }
  };

  return (
    <div>
      <h1 className="text-[26px] lg:text-[32px]">Content freshness</h1>
      <p className="mt-1 text-[16px] text-text-secondary">
        {counts.stale} stale and {counts.expiring} expiring within 30 days. Travellers see a warning on
        anything stale; nothing is hidden from them.
      </p>

      <p className="mt-3 rounded-xl bg-surface-subtle p-3 text-[14px]">
        There is no &ldquo;mark all fresh&rdquo;. A record becomes fresh only when someone re-checks it
        against its source and says what they checked. Selection here sends reminders.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {(['all', 'stale', 'expiring'] as const).map((option) => (
          <Chip key={option} selected={filter === option} onClick={() => setFilter(option)}>
            {option === 'all' ? 'All' : option === 'stale' ? `Stale (${counts.stale})` : `Expiring (${counts.expiring})`}
          </Chip>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {(['all', 'rule', 'help_facility', 'source', 'business'] as const).map((option) => (
          <Chip key={option} selected={group === option} onClick={() => setGroup(option)}>
            {option === 'all' ? 'Every group' : GROUP_LABEL[option]}
          </Chip>
        ))}
      </div>

      {message !== null && (
        <p
          role={message.tone === 'bad' ? 'alert' : 'status'}
          className={`mt-4 rounded-xl p-3 text-[14px] font-[650] ${
            message.tone === 'good' ? 'bg-status-good-surface text-status-good-text' : 'bg-status-danger-surface text-status-danger-text'
          }`}
        >
          {message.text}
        </p>
      )}

      {selected.size > 0 && (
        <div className="sticky top-0 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-[16px] border border-border-subtle bg-surface-base p-3 elevation-2">
          <span className="text-[14px] font-[650]">{selected.size} selected</span>
          <Button size="small" onClick={() => void remind()} disabled={busy}>
            {busy ? 'Sending…' : 'Send reminder'}
          </Button>
          <Button size="small" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="mt-5">
          <EmptyState title="Nothing due" reason="No record in this view is stale or expiring." />
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {visible.map((item) => (
            <li key={key(item)}>
              <Card
                data-testid="freshness-item"
                data-state={item.state}
                data-group={item.entityType}
                className="p-4"
              >
                <div className="flex flex-wrap items-start gap-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${item.title} for a reminder`}
                    checked={selected.has(key(item))}
                    onChange={() => toggle(item)}
                    className="mt-1 h-5 w-5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-[650] uppercase tracking-wide text-text-secondary">
                      {GROUP_LABEL[item.entityType]}
                    </p>
                    <p className="mt-1 text-[16px] font-[650]">{item.title}</p>
                    <p className="text-[14px] text-text-secondary">{item.context}</p>
                    {item.authority !== null && item.authority !== item.title && (
                      <p className="text-[14px] text-text-secondary">{item.authority}</p>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-[13px] font-[650] ${
                      item.state === 'stale'
                        ? 'bg-status-danger-surface text-status-danger-text'
                        : 'bg-status-warn-surface text-status-warn-text'
                    }`}
                  >
                    {describeDue(item)}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-[14px]">
                    <span className="text-text-secondary">Assigned to</span>
                    <select
                      value={item.assignedToId ?? ''}
                      onChange={(event) => void assign(item, event.target.value === '' ? null : event.target.value)}
                      className="min-h-[44px] rounded-[12px] border border-border-subtle px-2 text-[14px]"
                    >
                      <option value="">Unassigned</option>
                      {reviewers.map((reviewer) => (
                        <option key={reviewer.id} value={reviewer.id}>
                          {reviewer.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <Button size="small" variant="secondary" onClick={() => setReverifying(item)}>
                    Re-verify this record
                  </Button>

                  {item.reminderCount > 0 && (
                    <span className="text-[13px] text-text-secondary">
                      Reminded {item.reminderCount} time{item.reminderCount === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {reverifying !== null && (
        <ReverifyDialog
          item={reverifying}
          onClose={() => setReverifying(null)}
          onDone={(text) => {
            setReverifying(null);
            setMessage({ tone: 'good', text });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ReverifyDialog({
  item,
  onClose,
  onDone,
}: {
  item: Item;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    if (note.trim().length < MIN_REVERIFY_NOTE) {
      setError('Say what you checked and against which source, so the next reviewer can rely on it.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.post(
        '/api/v1/admin/freshness/reverify',
        { entityType: item.entityType, entityId: item.id, note: note.trim() },
        { 'idempotency-key': `reverify-${item.entityType}-${item.id}-${Date.now()}` },
      );
      onDone(`${item.title} re-verified.`);
    } catch (caught) {
      setError(describe(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Re-verify ${item.title}`}
        className="elevation-3 relative w-full rounded-t-[24px] bg-surface-base p-5 sm:max-w-lg sm:rounded-[16px]"
      >
        <h2 className="text-[21px]">Re-verify</h2>
        <p className="mt-1 text-[14px] text-text-secondary">{item.title}</p>

        <label className="mt-4 block text-[14px] font-[650]">
          What did you check? (required)
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            placeholder="Called the range office on 22 Sep; entry hours unchanged for the season."
            className="mt-1 block w-full rounded-[12px] border border-border-subtle p-3 text-[16px]"
          />
        </label>

        {error !== null && (
          <p role="alert" className="mt-3 text-[14px] font-[650] text-status-danger-text">
            {error}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? 'Saving…' : 'Confirm re-verification'}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function describeDue(item: Item): string {
  if (item.daysOverdue === null) return 'No review date';
  if (item.daysOverdue > 0) return `${item.daysOverdue} days overdue`;
  if (item.daysOverdue === 0) return 'Due today';
  return `Due in ${-item.daysOverdue} days`;
}

function describe(caught: unknown): string {
  return caught instanceof ApiProblemError ? caught.problem.detail ?? caught.problem.title : 'Something went wrong.';
}
