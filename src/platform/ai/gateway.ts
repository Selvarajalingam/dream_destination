import type { ItineraryProse, Revision, TripBrief } from './schemas';

/**
 * Provider-neutral LLM gateway — PRD Part II §4 and §8.
 *
 * The model's job is narrow (PRD §8.2): understand intent, ask one focused
 * clarification, summarise retrieved evidence, write readable descriptions and
 * propose revisions. Scoring, budgets, feasibility, verification status, crowd
 * freshness, rule applicability and authorization are deterministic and live
 * in the domain modules (§8.3).
 */

export type ExtractionMode = 'llm' | 'deterministic';

export type Clarification = {
  /** Which brief field the question is about. */
  field: string;
  /** One focused question, ending in a question mark. */
  question: string;
  /** Optional tappable answers, so the traveler need not type. */
  options?: string[];
};

export type BriefExtraction = {
  brief: TripBrief;
  /** Fields understood from this message, for the highlight in T03. */
  extractedFields: string[];
  clarification: Clarification | null;
  /** 0-1. Lower when the parse relied on weak signals. */
  confidence: number;
  mode: ExtractionMode;
};

export type ItineraryPlanSummary = {
  destinationName: string;
  days: Array<{ dayNumber: number; itemTitles: string[] }>;
};

export type RevisionGoal = 'avoid_crowds' | 'reduce_cost' | 'reduce_travel' | 'more_time';

export type RevisionRequest = {
  destinationName: string;
  items: Array<{ id: string; title: string; locked: boolean; crowdLabel?: string }>;
  goal: RevisionGoal;
};

export interface AiGateway {
  readonly mode: ExtractionMode;

  /**
   * Turn a natural-language message into a structured brief, merged over
   * whatever was already understood.
   */
  extractBrief(message: string, prior: TripBrief | null): Promise<BriefExtraction>;

  /** Readable descriptions for a plan that has already been built. */
  describeItinerary(plan: ItineraryPlanSummary): Promise<ItineraryProse>;

  /** A proposed reordering. Locked items must never move. */
  proposeRevision(request: RevisionRequest): Promise<Revision>;
}
