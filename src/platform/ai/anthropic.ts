import Anthropic from '@anthropic-ai/sdk';
import { logger } from '@/platform/observability/logger';
import { DeterministicGateway } from './deterministic';
import type {
  AiGateway,
  BriefExtraction,
  ItineraryPlanSummary,
  RevisionRequest,
} from './gateway';
import {
  BRIEF_EXTRACTION_SYSTEM_PROMPT,
  ITINERARY_PROSE_SYSTEM_PROMPT,
  PROMPT_VERSION,
  REVISION_SYSTEM_PROMPT,
} from './prompts';
import {
  ItineraryProseSchema,
  RevisionSchema,
  TripBriefSchema,
  type ItineraryProse,
  type Revision,
  type TripBrief,
} from './schemas';

/**
 * Anthropic-backed gateway.
 *
 * Structured output is obtained through a forced tool call, so the model must
 * return data matching our schema rather than prose we then have to parse.
 * Every response is re-validated with Zod before it is trusted (PRD §8.5).
 *
 * On any failure — timeout, rate limit, schema violation, malformed response —
 * this falls back to the deterministic gateway and reports mode
 * 'deterministic', so the UI can tell the traveler the assistant is
 * unavailable rather than silently degrading (PRD §14.2).
 */

const DEFAULT_MODEL = 'claude-sonnet-5';
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_MESSAGE_LENGTH = 4_000;

type RecordShape = Record<string, unknown>;

const RECORD_BRIEF_TOOL = {
  name: 'record_trip_brief',
  description:
    'Record the structured trip brief understood from the traveller, and optionally one clarifying question.',
  input_schema: {
    type: 'object' as const,
    properties: {
      brief: {
        type: 'object',
        properties: {
          origin: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              coordinates: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
            },
            required: ['label'],
          },
          dateFlexibility: { type: 'string', description: 'YYYY-MM or YYYY-MM-DD' },
          durationDays: { type: 'integer', minimum: 1, maximum: 60 },
          party: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['solo', 'couple', 'family', 'friends', 'group'] },
              adults: { type: 'integer', minimum: 0 },
              children: { type: 'integer', minimum: 0 },
            },
            required: ['type'],
          },
          budget: {
            type: 'object',
            properties: {
              currency: { type: 'string', enum: ['INR'] },
              totalMinor: { type: 'integer', minimum: 0, description: 'Paise. 25000 rupees is 2500000.' },
            },
            required: ['currency', 'totalMinor'],
          },
          interests: { type: 'array', items: { type: 'string' } },
          crowdTolerance: { type: 'string', enum: ['low', 'medium', 'high'] },
          pace: { type: 'string', enum: ['relaxed', 'balanced', 'packed'] },
          constraints: {
            type: 'object',
            properties: {
              lowWalking: { type: 'boolean' },
              medicalAccessRequired: { type: 'boolean' },
              stepFreeRequired: { type: 'boolean' },
            },
          },
        },
      },
      extractedFields: {
        type: 'array',
        items: { type: 'string' },
        description: 'Names of the brief fields understood from this message.',
      },
      clarification: {
        type: 'object',
        description: 'Omit entirely when nothing important is missing.',
        properties: {
          field: { type: 'string' },
          question: { type: 'string', description: 'Exactly one short question.' },
          options: { type: 'array', items: { type: 'string' } },
        },
        required: ['field', 'question'],
      },
    },
    required: ['brief', 'extractedFields'],
  },
};

const WRITE_PROSE_TOOL = {
  name: 'write_itinerary_prose',
  description: 'Record the plain description of the plan.',
  input_schema: {
    type: 'object' as const,
    properties: {
      summary: { type: 'string' },
      dayDescriptions: { type: 'array', items: { type: 'string' } },
    },
    required: ['summary', 'dayDescriptions'],
  },
};

const PROPOSE_REVISION_TOOL = {
  name: 'propose_revision',
  description: 'Record one proposed reordering of the unlocked items.',
  input_schema: {
    type: 'object' as const,
    properties: {
      explanation: { type: 'string' },
      estimatedImpact: { type: 'string' },
      proposedOrder: { type: 'array', items: { type: 'string' } },
    },
    required: ['explanation', 'estimatedImpact', 'proposedOrder'],
  },
};

export class AnthropicGateway implements AiGateway {
  readonly mode = 'llm' as const;

  private readonly client: Anthropic;
  private readonly model: string;
  private readonly fallback: DeterministicGateway;

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    this.client = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
    this.model = model;
    this.fallback = new DeterministicGateway();
  }

  async extractBrief(message: string, prior: TripBrief | null): Promise<BriefExtraction> {
    const truncated = message.slice(0, MAX_MESSAGE_LENGTH);

    try {
      const input = await this.callTool(
        BRIEF_EXTRACTION_SYSTEM_PROMPT,
        [
          prior === null
            ? null
            : `Already understood so far (merge new information over this):\n${JSON.stringify(prior)}`,
          `Traveller message:\n${truncated}`,
        ]
          .filter((part): part is string => part !== null)
          .join('\n\n'),
        RECORD_BRIEF_TOOL,
      );

      const merged = { ...(prior ?? {}), ...((input.brief as RecordShape | undefined) ?? {}) };
      const parsed = TripBriefSchema.safeParse(merged);
      if (!parsed.success) {
        throw new Error(`brief failed schema validation: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
      }

      const clarification = input.clarification as
        | { field: string; question: string; options?: string[] }
        | undefined;

      const extractedFields = Array.isArray(input.extractedFields)
        ? (input.extractedFields as unknown[]).filter((field): field is string => typeof field === 'string')
        : [];

      return {
        brief: parsed.data,
        extractedFields,
        clarification: clarification === undefined ? null : clarification,
        confidence: 0.9,
        mode: 'llm',
      };
    } catch (error) {
      logger.warn('ai.extract_brief.fallback', {
        promptVersion: PROMPT_VERSION,
        model: this.model,
        reason: error instanceof Error ? error.message : 'unknown',
      });
      // Degrade to the deterministic parser rather than failing the request.
      return this.fallback.extractBrief(message, prior);
    }
  }

  async describeItinerary(plan: ItineraryPlanSummary): Promise<ItineraryProse> {
    try {
      const input = await this.callTool(
        ITINERARY_PROSE_SYSTEM_PROMPT,
        `Destination: ${plan.destinationName}\n\n${plan.days
          .map((day) => `Day ${day.dayNumber}: ${day.itemTitles.join(', ')}`)
          .join('\n')}`,
        WRITE_PROSE_TOOL,
      );

      const parsed = ItineraryProseSchema.safeParse(input);
      if (!parsed.success) throw new Error('prose failed schema validation');

      // The model may return a different number of days than we asked for.
      if (parsed.data.dayDescriptions.length !== plan.days.length) {
        throw new Error('prose day count does not match the plan');
      }

      return parsed.data;
    } catch (error) {
      logger.warn('ai.describe_itinerary.fallback', {
        promptVersion: PROMPT_VERSION,
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return this.fallback.describeItinerary(plan);
    }
  }

  async proposeRevision(request: RevisionRequest): Promise<Revision> {
    try {
      const input = await this.callTool(
        REVISION_SYSTEM_PROMPT,
        `Destination: ${request.destinationName}\nGoal: ${request.goal}\n\nItems in current order:\n${request.items
          .map(
            (item, index) =>
              `${index}. id=${item.id} "${item.title}"${item.locked ? ' [LOCKED - must not move]' : ''}${
                item.crowdLabel === undefined ? '' : ` (crowd: ${item.crowdLabel})`
              }`,
          )
          .join('\n')}`,
        PROPOSE_REVISION_TOOL,
      );

      const parsed = RevisionSchema.safeParse(input);
      if (!parsed.success) throw new Error('revision failed schema validation');

      // Enforce the locked-item rule ourselves rather than trusting the model.
      // PRD Part I T09: "AI optimization never changes locked items."
      const violatesLock = request.items.some(
        (item, index) => item.locked && parsed.data.proposedOrder[index] !== item.id,
      );
      if (violatesLock) throw new Error('proposed revision moves a locked item');

      const sameSet =
        parsed.data.proposedOrder.length === request.items.length &&
        new Set(parsed.data.proposedOrder).size === request.items.length &&
        parsed.data.proposedOrder.every((id) => request.items.some((item) => item.id === id));
      if (!sameSet) throw new Error('proposed revision adds or removes items');

      return parsed.data;
    } catch (error) {
      logger.warn('ai.propose_revision.fallback', {
        promptVersion: PROMPT_VERSION,
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return this.fallback.proposeRevision(request);
    }
  }

  /** Forces a single structured tool call and returns its validated input. */
  private async callTool(
    system: string,
    userContent: string,
    tool: { name: string; description: string; input_schema: object },
  ): Promise<RecordShape> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2_000,
      system,
      messages: [{ role: 'user', content: userContent }],
      tools: [tool as never],
      tool_choice: { type: 'tool', name: tool.name },
    });

    const block = response.content.find((part) => part.type === 'tool_use');
    if (block === undefined || block.type !== 'tool_use') {
      throw new Error('model did not return the expected tool call');
    }

    logger.info('ai.call', {
      promptVersion: PROMPT_VERSION,
      model: this.model,
      tool: tool.name,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    return block.input as RecordShape;
  }
}
