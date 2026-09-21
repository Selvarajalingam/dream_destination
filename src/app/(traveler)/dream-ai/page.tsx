import { Conversation } from './Conversation';

/**
 * Screen T03 — Dream AI Conversation.
 *
 * The ?q= parameter carries the sentence typed on Home, so the text is
 * preserved rather than retyped.
 */
export default async function DreamAiPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  return (
    <div>
      <h1 className="text-[26px] lg:text-[32px]">Plan with Dream AI</h1>
      <p className="mt-1 text-[16px] text-text-secondary">
        Tell us about the trip. We will show what we understood so you can correct it.
      </p>

      <Conversation initialMessage={q ?? null} />
    </div>
  );
}
