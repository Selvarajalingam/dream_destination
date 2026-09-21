import { AnthropicGateway } from './anthropic';
import { DeterministicGateway } from './deterministic';
import type { AiGateway } from './gateway';

/**
 * Gateway factory.
 *
 * With a key configured, the Anthropic gateway runs and falls back per-call on
 * failure. With no key, the deterministic parser runs from the start, so the
 * application and the demonstration never depend on a network call.
 */

let cached: AiGateway | null = null;

export function getAiGateway(): AiGateway {
  if (cached !== null) return cached;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  cached =
    apiKey === undefined || apiKey.trim() === ''
      ? new DeterministicGateway()
      : new AnthropicGateway(apiKey, process.env.ANTHROPIC_MODEL ?? undefined);

  return cached;
}

/** Test seam: drops the cached gateway so env changes take effect. */
export function resetAiGateway(): void {
  cached = null;
}

export type { AiGateway, BriefExtraction, Clarification } from './gateway';
export { DeterministicGateway } from './deterministic';
export { AnthropicGateway } from './anthropic';
