'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button, Card, Chip } from '@/components/ui/primitives';
import { ErrorState } from '@/components/states/states';
import { ApiProblemError, api, ensureSession } from '@/lib/api-client';
import { TripSummaryPanel, type TripBriefView } from './TripSummaryPanel';

/**
 * Screen T03 — the conversation itself.
 *
 * Extracted values are highlighted after the first message, the assistant asks
 * one focused question at a time, and at most two clarification rounds run
 * before options are offered. If the assistant fails, the trip summary is kept
 * and a deterministic path is offered instead (T03 error behaviour).
 */

type ParseResponse = {
  brief: TripBriefView;
  extractedFields: string[];
  clarification: { field: string; question: string; options?: string[] } | null;
  confidence: number;
  mode: 'llm' | 'deterministic';
  missingRequired: string[];
  readyToGenerate: boolean;
};

type Message = { role: 'user' | 'assistant'; text: string; options?: string[] };

/** PRD Part I T03: maximum two clarification rounds before showing options. */
const MAX_CLARIFICATIONS = 2;

/** The four generation stages T03 requires, announced politely. */
const STAGES = [
  'Understanding your request',
  'Finding places',
  'Checking constraints',
  'Creating your plan',
];

export function Conversation({ initialMessage }: { initialMessage: string | null }) {
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [brief, setBrief] = useState<TripBriefView>({});
  const [highlighted, setHighlighted] = useState<string[]>([]);
  const [clarifications, setClarifications] = useState(0);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<'llm' | 'deterministic'>('deterministic');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const started = useRef(false);

  const announce = (text: string): void => {
    const region = document.getElementById('live-region');
    if (region !== null) region.textContent = text;
  };

  const send = async (text: string, priorBrief: TripBriefView): Promise<void> => {
    setBusy(true);
    setFailed(false);
    setMessages((current) => [...current, { role: 'user', text }]);
    announce('Understanding your request');

    try {
      await ensureSession();

      const result = await api.post<ParseResponse>('/api/v1/trip-briefs/parse', {
        message: text,
        prior: Object.keys(priorBrief).length === 0 ? null : priorBrief,
      });

      setBrief(result.brief);
      setHighlighted(result.extractedFields);
      setMode(result.mode);
      setReady(result.readyToGenerate);

      const askedEnough = clarifications >= MAX_CLARIFICATIONS - 1;

      if (result.clarification !== null && !askedEnough) {
        setClarifications((count) => count + 1);
        setMessages((current) => [
          ...current,
          {
            role: 'assistant',
            text: result.clarification!.question,
            options: result.clarification!.options,
          },
        ]);
        announce(result.clarification.question);
      } else {
        // Either the brief is complete, or two rounds have been used and it is
        // time to show options rather than keep asking.
        setReady(true);
        const summary = result.readyToGenerate
          ? 'That is enough to compare destinations.'
          : 'We can work with this. You can fill in the rest on the next screen.';
        setMessages((current) => [...current, { role: 'assistant', text: summary }]);
        announce(summary);
      }
    } catch (error) {
      setFailed(true);
      const detail =
        error instanceof ApiProblemError
          ? error.problem.detail ?? error.problem.title
          : 'The assistant did not respond.';
      announce(detail);
    } finally {
      setBusy(false);
    }
  };

  // Carry the sentence typed on Home into the first turn.
  useEffect(() => {
    if (started.current || initialMessage === null) return;
    started.current = true;
    void send(initialMessage, {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage]);

  const seeDestinations = async (): Promise<void> => {
    setBusy(true);
    try {
      for (const [index, name] of STAGES.entries()) {
        setStage(name);
        announce(name);
        // A short pause between stages, so progress is readable rather than a
        // flash. Never a fake percentage (PRD §9.1).
        if (index < STAGES.length - 1) await new Promise((resolve) => setTimeout(resolve, 180));
      }

      sessionStorage.setItem('dd.brief', JSON.stringify(brief));
      router.push('/shortlist');
    } finally {
      setBusy(false);
      setStage(null);
    }
  };

  return (
    <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="order-2 min-w-0 lg:order-1">
        {mode === 'deterministic' && messages.length > 0 && (
          <p className="mb-3 rounded-xl border border-border-subtle bg-surface-subtle p-3 text-[14px] text-text-secondary">
            Planning without the assistant right now. We are reading your request with a simpler
            method, so keep it short and specific.
          </p>
        )}

        <ol className="space-y-3">
          {messages.map((message, index) => (
            <li
              key={index}
              className={
                message.role === 'user'
                  ? 'ml-auto max-w-[85%] overflow-wrap-anywhere rounded-[16px] bg-brand-primary px-4 py-3 text-[16px] text-white'
                  : 'mr-auto max-w-[85%] overflow-wrap-anywhere rounded-[16px] border border-border-subtle px-4 py-3 text-[16px]'
              }
            >
              {message.text}
              {message.options !== undefined && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {message.options.map((option) => (
                    <li key={option}>
                      <Chip type="button" onClick={() => void send(option, brief)} disabled={busy}>
                        {option}
                      </Chip>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>

        {stage !== null && (
          <p data-testid="generation-stage" className="mt-3 text-[14px] font-[650] text-brand-primary">
            {stage}…
          </p>
        )}

        {failed && (
          <div className="mt-3">
            <ErrorState
              title="The assistant is not responding"
              whatFailed="We could not read your request just now."
              stillAvailable="Everything you have entered has been kept. You can search destinations directly instead."
              action={
                <a
                  href="/explore"
                  className="inline-flex min-h-[44px] items-center rounded-xl border border-border-subtle px-4 text-[14px] font-[650]"
                >
                  Search destinations
                </a>
              }
            />
          </div>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (input.trim() === '') return;
            void send(input, brief);
            setInput('');
          }}
          className="mt-4 flex flex-wrap gap-2"
        >
          <label htmlFor="composer" className="visually-hidden">
            Message
          </label>
          <input
            id="composer"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Add a detail, or answer the question above"
            className="min-h-[52px] min-w-0 flex-1 basis-48 rounded-[12px] border border-border-subtle px-4 text-[16px]"
            disabled={busy}
          />
          <Button type="submit" disabled={busy || input.trim() === ''}>
            Send
          </Button>
        </form>

        {ready && (
          <Button className="mt-4 w-full" onClick={() => void seeDestinations()} disabled={busy}>
            See destinations
          </Button>
        )}
      </div>

      <Card className="order-1 h-fit min-w-0 p-4 lg:order-2 lg:sticky lg:top-4">
        <TripSummaryPanel brief={brief} highlighted={highlighted} onChange={setBrief} />
      </Card>
    </div>
  );
}
