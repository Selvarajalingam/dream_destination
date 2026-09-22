'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/primitives';
import { ApiProblemError, api } from '@/lib/api-client';

/** Small owner actions on the B05 dashboard. Each reports its own outcome. */

const describe = (caught: unknown, fallback: string): string =>
  caught instanceof ApiProblemError ? caught.problem.detail ?? caught.problem.title : fallback;

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>, fallback: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setDone(true);
      router.refresh();
    } catch (caught) {
      setError(describe(caught, fallback));
    } finally {
      setBusy(false);
    }
  };

  return { busy, done, error, run };
}

function Outcome({ done, doneText, error }: { done: boolean; doneText: string; error: string | null }) {
  return (
    <>
      <p role="status" aria-live="polite" className="mt-1 text-[14px] text-status-good-text">
        {done ? doneText : ''}
      </p>
      {error !== null && (
        <p role="alert" className="mt-1 text-[14px] font-[650] text-status-danger-text">
          {error}
        </p>
      )}
    </>
  );
}

export function ConfirmDetailsButton({ businessId, label, doneText }: { businessId: string; label: string; doneText: string }) {
  const { busy, done, error, run } = useAction();
  return (
    <div>
      <Button
        variant="secondary"
        disabled={busy || done}
        onClick={() => void run(() => api.post(`/api/v1/business/listings/${businessId}/confirm`, {}), 'Could not confirm.')}
      >
        {label}
      </Button>
      <Outcome done={done} doneText={doneText} error={error} />
    </div>
  );
}

export function SponsorshipButton({ businessId, label, doneText }: { businessId: string; label: string; doneText: string }) {
  const { busy, done, error, run } = useAction();
  return (
    <div>
      <Button
        variant="secondary"
        disabled={busy || done}
        onClick={() =>
          void run(
            () =>
              api.post(`/api/v1/business/listings/${businessId}/sponsorship`, {}, { 'idempotency-key': `sponsor-${businessId}-${Date.now()}` }),
            'Could not send the request.',
          )
        }
      >
        {label}
      </Button>
      <Outcome done={done} doneText={doneText} error={error} />
    </div>
  );
}

export function ReportResponseForm({
  businessId,
  reportId,
  labels,
}: {
  businessId: string;
  reportId: string;
  labels: { yourResponse: string; respond: string; responded: string };
}) {
  const { busy, done, error, run } = useAction();
  const [text, setText] = useState('');

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    void run(
      () => api.post(`/api/v1/business/listings/${businessId}/reports/${reportId}/response`, { response: text }),
      'Could not send the response.',
    );
  };

  if (done) return <Outcome done doneText={labels.responded} error={null} />;

  return (
    <form onSubmit={submit} className="mt-3">
      <label className="block">
        <span className="block text-[14px] font-[650]">{labels.yourResponse}</span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={1000}
          rows={3}
          className="mt-1 block w-full rounded-xl border border-text-secondary/60 bg-surface-base p-3 text-[16px]"
        />
      </label>
      <Button type="submit" size="small" className="mt-2" disabled={busy || text.trim().length < 10}>
        {labels.respond}
      </Button>
      <Outcome done={false} doneText="" error={error} />
    </form>
  );
}
