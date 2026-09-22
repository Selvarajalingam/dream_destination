'use client';

import { useState } from 'react';
import { Button, Sheet } from '@/components/ui/primitives';
import { ApiProblemError, api, ensureSession } from '@/lib/api-client';
import { MIN_REPORT_LENGTH, REPORT_CATEGORIES, type IncidentCategory } from '@/modules/incidents/domain/incidents';

/**
 * "Report a concern" — the traveller side of Screen A06.
 *
 * The traveller describes what they saw in plain words and chooses what kind
 * of problem it is; they are not asked how serious it is. The danger option
 * puts the emergency number on screen before anything is sent, because a
 * report form is the wrong tool if someone is hurt right now.
 */
export function ReportConcern({
  entityType,
  slug,
  name,
  label = 'Report a concern',
  variant = 'secondary',
}: {
  entityType: 'place' | 'business';
  slug: string;
  name: string;
  label?: string;
  variant?: 'secondary' | 'ghost';
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<IncidentCategory | null>(null);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ message: string; redacted: boolean } | null>(null);

  const reset = (): void => {
    setOpen(false);
    setCategory(null);
    setDescription('');
    setError(null);
    setDone(null);
  };

  const submit = async (): Promise<void> => {
    if (category === null) {
      setError('Choose what kind of problem it is.');
      return;
    }
    if (description.trim().length < MIN_REPORT_LENGTH) {
      setError('Add a few more words about what you saw, so someone can check it.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await ensureSession();
      const result = await api.post<{ message: string; redacted: boolean }>('/api/v1/incidents', {
        entityType,
        slug,
        category,
        description: description.trim(),
      });
      setDone(result);
    } catch (caught) {
      setError(
        caught instanceof ApiProblemError
          ? caught.problem.detail ?? caught.problem.title
          : 'The report could not be sent. Nothing you typed has been lost.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" size="small" variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>

      <Sheet open={open} onClose={reset} title={`Report a concern about ${name}`}>
        {done !== null ? (
          <div role="status">
            <p className="text-[16px] font-[650] text-status-good-text">Report sent</p>
            <p className="mt-2 text-[16px]">{done.message}</p>
            {done.redacted && (
              <p className="mt-2 text-[14px] text-text-secondary">
                We removed contact details or exact coordinates from your message before saving it,
                so nobody reviewing it can use them to reach you.
              </p>
            )}
            <Button className="mt-4" onClick={reset}>
              Close
            </Button>
          </div>
        ) : (
          <>
            <fieldset>
              <legend className="text-[14px] font-[650]">What is the problem?</legend>
              <div className="mt-2 space-y-2">
                {REPORT_CATEGORIES.map((option) => (
                  <label
                    key={option.key}
                    className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-border-subtle px-3 text-[14px]"
                  >
                    <input
                      type="radio"
                      name="report-category"
                      value={option.key}
                      checked={category === option.key}
                      onChange={() => setCategory(option.key)}
                      className="h-5 w-5"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>

            {category === 'danger' && (
              <div
                role="alert"
                className="mt-3 rounded-xl border border-status-danger/40 bg-status-danger-surface p-3"
              >
                <p className="text-[14px] font-[650] text-status-danger-text">
                  If anyone is hurt or in danger now, call for help first.
                </p>
                <a
                  href="tel:112"
                  data-touch-target
                  className="mt-2 inline-flex min-h-[44px] items-center rounded-xl bg-status-danger px-4 text-[14px] font-[700] text-white"
                >
                  Call 112
                </a>
              </div>
            )}

            <label className="mt-4 block text-[14px] font-[650]">
              What did you see?
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="What happened, where exactly, and roughly when."
                className="mt-1 block w-full rounded-[12px] border border-border-subtle p-3 text-[16px]"
              />
            </label>
            <p className="mt-1 text-[13px] text-text-secondary">
              Your name and contact details are not shown to the people reviewing this.
            </p>

            {error !== null && (
              <p role="alert" className="mt-3 text-[14px] font-[650] text-status-danger-text">
                {error}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <Button onClick={() => void submit()} disabled={busy}>
                {busy ? 'Sending…' : 'Send report'}
              </Button>
              <Button variant="secondary" onClick={reset}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </Sheet>
    </>
  );
}
