'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { ApiProblemError, api } from '@/lib/api-client';

/** B03/B04: sends the listing for review. The server re-checks every blocker. */
export function SubmitButton({
  businessId,
  disabled,
  labels,
}: {
  businessId: string;
  disabled: boolean;
  labels: { send: string; sending: string; sent: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/v1/business/listings/${businessId}/submit`, {}, { 'idempotency-key': `submit-${businessId}-${Date.now()}` });
      setDone(true);
      router.push(`/business/${businessId}`);
    } catch (caught) {
      setError(caught instanceof ApiProblemError ? caught.problem.detail ?? caught.problem.title : 'Could not send the listing.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Button onClick={() => void submit()} disabled={disabled || busy || done}>
        {busy ? labels.sending : labels.send}
      </Button>
      <p role="status" aria-live="polite" className="mt-1 text-[14px] text-status-good-text">
        {done ? labels.sent : ''}
      </p>
      {error !== null && (
        <p role="alert" className="mt-1 text-[14px] font-[650] text-status-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
