'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ICONS, Icon } from '@/components/landing/kit';
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

const GREETING = 'Hi! Where are you travelling from, and what kind of experience are you looking for?';

/** One-tap starting points; each sends a plain sentence the parser already handles. */
const STARTERS = [
  { label: 'Nature & hills', text: 'A nature and hills trip', icon: 'M3 19l6-10 4 6 3-4 5 8H3Z', tone: 'bg-[#e3f4ee]' },
  { label: 'Culture & heritage', text: 'A culture and heritage trip', icon: ICONS.landmark, tone: 'bg-[#fdf0dc]' },
  { label: 'Food trail', text: 'A food trail trip', icon: 'M7 3v7a2 2 0 0 0 2 2v9M11 3v7M7 3v7M17 3c-2 2-2 6 0 8v10', tone: 'bg-[#fde9e2]' },
  { label: 'Quiet escapes', text: 'A quiet escape with fewer crowds', icon: ICONS.leaf, tone: 'bg-[#e6f0fb]' },
] as const;

const EXAMPLE = '4 days from Coimbatore, under ₹25,000, nature, heritage and fewer crowds.';

function AssistantAvatar() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-[#d9f0ec] text-brand-primary"
    >
      <Icon d="M12 3v3M6 8h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2ZM9 13h.01M15 13h.01M9 16.5h6" size={24} />
    </span>
  );
}

export function Conversation({
  initialMessage,
  children,
}: {
  initialMessage: string | null;
  children?: ReactNode;
}) {
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

  const clearDetails = (): void => {
    setBrief({});
    setHighlighted([]);
    setReady(false);
    setClarifications(0);
  };

  return (
    <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="order-2 min-w-0 lg:order-1">
        <Card className="rounded-[24px] border-brand-primary/30 p-4 shadow-sm sm:p-6">
          {mode === 'deterministic' && messages.length > 0 && (
            <p className="mb-3 rounded-xl border border-border-subtle bg-surface-subtle p-3 text-[14px] text-text-secondary">
              Planning without the assistant right now. We are reading your request with a simpler
              method, so keep it short and specific.
            </p>
          )}

          <div className="flex gap-3">
            <AssistantAvatar />
            <div className="min-w-0">
              <p className="text-[16px] font-[700] text-brand-deep">
                Dream AI <span className="ml-1 text-[13px] font-normal text-text-secondary">· Just now</span>
              </p>
              <p className="mt-2 rounded-2xl bg-[#e6f4f2] px-4 py-3 text-[16px] text-text-primary">{GREETING}</p>
            </div>
          </div>

          <ol className="mt-4 space-y-3">
            {messages.map((message, index) => (
              <li
                key={index}
                className={
                  message.role === 'user'
                    ? 'ml-auto max-w-[85%] overflow-wrap-anywhere rounded-[18px] bg-brand-primary px-4 py-3 text-[16px] text-white'
                    : 'mr-auto max-w-[85%] overflow-wrap-anywhere rounded-[18px] bg-[#e6f4f2] px-4 py-3 text-[16px]'
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

          {messages.length === 0 && (
            <>
              <ul className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {STARTERS.map((starter) => (
                  <li key={starter.label}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void send(starter.text, brief)}
                      className={`flex min-h-[64px] w-full items-center gap-2 rounded-2xl px-3 text-left text-[14px] font-[600] transition-shadow hover:shadow-md ${starter.tone}`}
                    >
                      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-white/70 text-brand-deep">
                        <Icon d={starter.icon} size={18} />
                      </span>
                      {starter.label}
                    </button>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                disabled={busy}
                onClick={() => void send(EXAMPLE, brief)}
                className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-surface-subtle px-4 py-3 text-left text-[14px]"
              >
                <Icon
                  d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z"
                  size={20}
                  className="text-brand-saffron"
                />
                <span>
                  <strong className="text-brand-primary">Try:</strong>{' '}
                  <span className="italic text-text-secondary">{EXAMPLE}</span>
                </span>
              </button>
            </>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (input.trim() === '') return;
              void send(input, brief);
              setInput('');
            }}
            className="mt-5 flex items-center gap-2 rounded-full border border-border-subtle bg-white p-2 shadow-sm"
          >
            <label htmlFor="composer" className="visually-hidden">
              Message
            </label>
            <input
              id="composer"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Describe your dream trip…"
              className="min-h-[48px] min-w-0 flex-1 rounded-full bg-transparent px-4 text-[16px] outline-none"
              disabled={busy}
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={busy || input.trim() === ''}
              className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-primary text-white hover:bg-brand-primary-hover disabled:opacity-50"
            >
              <Icon d="M3 11l18-8-8 18-2-8-8-2Z" size={20} />
            </button>
          </form>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[13px] text-text-secondary">
            <Icon d={ICONS.check} size={16} className="text-brand-primary" />
            You can review every detail before we build your plan.
          </p>
        </Card>

        {children}
      </div>

      <Card className="order-1 h-fit min-w-0 rounded-[24px] p-5 lg:order-2 lg:sticky lg:top-4">
        <TripSummaryPanel brief={brief} highlighted={highlighted} onChange={setBrief} />
        <Button className="mt-5 w-full" onClick={() => void seeDestinations()} disabled={busy || !ready}>
          Build my trip
        </Button>
        <button
          type="button"
          onClick={clearDetails}
          disabled={busy}
          className="mt-2 min-h-[44px] w-full text-[15px] font-[650] text-brand-primary"
        >
          Clear details
        </button>
      </Card>
    </div>
  );
}
