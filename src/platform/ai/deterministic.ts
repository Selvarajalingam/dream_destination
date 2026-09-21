import { rupeesToMinor } from '@/shared/money';
import type {
  AiGateway,
  BriefExtraction,
  Clarification,
  ItineraryPlanSummary,
  RevisionRequest,
} from './gateway';
import { REQUIRED_FOR_GENERATION, TripBriefSchema, type ItineraryProse, type Revision, type TripBrief } from './schemas';

/**
 * Deterministic brief parser.
 *
 * This is the degraded path PRD Part II §14.2 requires: "LLM unavailable: show
 * structured form and deterministic destination results." It is also the
 * default when no API key is configured, so the application always runs and
 * the demonstration never depends on a network call.
 *
 * It is rule-based on purpose. Everything it extracts is traceable to a
 * pattern, and its output is validated against the same schema the model path
 * must satisfy.
 */

type Extraction = { brief: TripBrief; fields: string[]; signals: number };

// --- Known origins in and around the pilot geography ---------------------

const KNOWN_ORIGINS: Array<{ pattern: RegExp; label: string; coordinates: [number, number] }> = [
  { pattern: /\bcoimbatore\b|\bkovai\b/i, label: 'Coimbatore', coordinates: [76.9558, 11.0168] },
  { pattern: /\bchennai\b/i, label: 'Chennai', coordinates: [80.2707, 13.0827] },
  { pattern: /\bbengaluru\b|\bbangalore\b/i, label: 'Bengaluru', coordinates: [77.5946, 12.9716] },
  { pattern: /\bmadurai\b/i, label: 'Madurai', coordinates: [78.1198, 9.9252] },
  { pattern: /\btiruppur\b|\btirupur\b/i, label: 'Tiruppur', coordinates: [77.3411, 11.1085] },
  { pattern: /\berode\b/i, label: 'Erode', coordinates: [77.7172, 11.341] },
  { pattern: /\bsalem\b/i, label: 'Salem', coordinates: [78.146, 11.6643] },
  { pattern: /\bkochi\b|\bcochin\b/i, label: 'Kochi', coordinates: [76.2673, 9.9312] },
  { pattern: /\bpalakkad\b/i, label: 'Palakkad', coordinates: [76.6548, 10.7867] },
  { pattern: /\bmysuru\b|\bmysore\b/i, label: 'Mysuru', coordinates: [76.6394, 12.2958] },
];

// --- Interest keywords to catalog themes ---------------------------------

const INTEREST_KEYWORDS: Array<{ pattern: RegExp; theme: string }> = [
  { pattern: /\bnature\b|\bscenic\b|\bgreenery\b|\blandscape\b|\bforest\b/i, theme: 'nature' },
  { pattern: /\bheritage\b|\bhistory\b|\bhistoric\b|\bcolonial\b|\bmonument\b/i, theme: 'heritage' },
  { pattern: /\btemple\b|\btemples\b|\bspiritual\b|\bpilgrim/i, theme: 'temples' },
  { pattern: /\bfood\b|\bcuisine\b|\beat\b|\beating\b|\bculinary\b|\brestaurant/i, theme: 'local_food' },
  { pattern: /\btea\b|\bplantation\b|\bestate\b/i, theme: 'tea' },
  { pattern: /\btrek\w*\b|\bhik\w*\b|\bwalk\w*\s+trail/i, theme: 'trekking' },
  { pattern: /\bwildlife\b|\banimal\b|\bbird\w*\b|\bsafari\b/i, theme: 'wildlife' },
  { pattern: /\bgarden\w*\b|\bflower\w*\b|\bbotanical\b/i, theme: 'gardens' },
  { pattern: /\bcraft\w*\b|\bartisan\w*\b|\bhandloom\b|\bpottery\b|\bweav/i, theme: 'crafts' },
  { pattern: /\bhill\s*station\b|\bhills\b|\bmountain\w*\b/i, theme: 'hill_station' },
  { pattern: /\bquiet\b|\bpeaceful\b|\boffbeat\b|\bsecluded\b|\bless\s+crowd/i, theme: 'quiet' },
  { pattern: /\baccessible\b|\bwheelchair\b|\bstep[-\s]?free\b/i, theme: 'accessible' },
];

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

// --- Field extractors -----------------------------------------------------

/**
 * Budget. Handles "₹25,000", "Rs. 12,500", "25000 rupees", "15k" and
 * "1.5 lakh". Ordered most specific first so "1.5 lakh" is not read as 1.5.
 */
function extractBudget(text: string): number | undefined {
  const lakh = /(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(?:lakh|lakhs|lac)\b/i.exec(text);
  if (lakh !== null) {
    return rupeesToMinor(Number(lakh[1].replace(/,/g, '')) * 100_000);
  }

  const thousandSuffix = /(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*k\b/i.exec(text);
  if (thousandSuffix !== null) {
    return rupeesToMinor(Number(thousandSuffix[1].replace(/,/g, '')) * 1_000);
  }

  const symbol = /(?:₹|rs\.?\s*|inr\s*)([\d,]+(?:\.\d{1,2})?)/i.exec(text);
  if (symbol !== null) {
    return rupeesToMinor(Number(symbol[1].replace(/,/g, '')));
  }

  const worded = /([\d,]+(?:\.\d{1,2})?)\s*(?:rupees|rs\b)/i.exec(text);
  if (worded !== null) {
    return rupeesToMinor(Number(worded[1].replace(/,/g, '')));
  }

  // A bare number next to budget language, e.g. "budget 25000", "under 20000".
  const contextual = /(?:budget|under|within|below|upto|up to|around|about|max(?:imum)?)\s*(?:of\s*)?([\d,]{4,})\b/i.exec(text);
  if (contextual !== null) {
    return rupeesToMinor(Number(contextual[1].replace(/,/g, '')));
  }

  return undefined;
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

function toNumber(value: string): number {
  return WORD_NUMBERS[value.toLowerCase()] ?? Number(value);
}

/** Duration. Nights convert to days by adding one, matching how people plan. */
function extractDuration(text: string): number | undefined {
  const days = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[\s-]*days?\b/i.exec(text);
  if (days !== null) return toNumber(days[1]);

  const nights = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[\s-]*nights?\b/i.exec(text);
  if (nights !== null) return toNumber(nights[1]) + 1;

  if (/\blong\s+weekend\b/i.test(text)) return 3;
  if (/\bweekend\b/i.test(text)) return 2;
  if (/\bfortnight\b|\btwo\s+weeks\b/i.test(text)) return 14;
  if (/\bweek\b/i.test(text)) return 7;
  if (/\bday\s*trip\b|\bsingle\s+day\b/i.test(text)) return 1;

  return undefined;
}

function extractOrigin(text: string): { label: string; coordinates: [number, number] } | undefined {
  // Prefer an explicit "from X" phrasing, then fall back to any mention.
  const fromMatch = /\bfrom\s+([a-zÀ-ɏ\s]{3,30}?)\b/i.exec(text);
  if (fromMatch !== null) {
    const candidate = KNOWN_ORIGINS.find((origin) => origin.pattern.test(fromMatch[1]));
    if (candidate !== undefined) {
      return { label: candidate.label, coordinates: candidate.coordinates };
    }
  }

  const mentioned = KNOWN_ORIGINS.find((origin) => origin.pattern.test(text));
  return mentioned === undefined
    ? undefined
    : { label: mentioned.label, coordinates: mentioned.coordinates };
}

function extractParty(text: string): TripBrief['party'] | undefined {
  const adultsMatch = /\b(\d{1,2})\s*adults?\b/i.exec(text);
  const childrenMatch = /\b(\d{1,2})\s*(?:children|child|kids?)\b/i.exec(text);

  let type: NonNullable<TripBrief['party']>['type'] | undefined;
  if (/\bfamily\b|\bwith\s+my\s+(?:parents|kids|children)\b/i.test(text)) type = 'family';
  else if (/\bsolo\b|\balone\b|\bby\s+myself\b|\bjust\s+me\b/i.test(text)) type = 'solo';
  else if (/\bcouple\b|\bpartner\b|\bwife\b|\bhusband\b|\bhoneymoon\b/i.test(text)) type = 'couple';
  else if (/\bfriends\b|\bmates\b/i.test(text)) type = 'friends';
  else if (/\bgroup\b|\bcolleagues\b|\bteam\b/i.test(text)) type = 'group';

  if (childrenMatch !== null && type === undefined) type = 'family';
  if (type === undefined && adultsMatch === null) return undefined;

  const party: NonNullable<TripBrief['party']> = { type: type ?? 'group' };
  if (adultsMatch !== null) party.adults = Number(adultsMatch[1]);
  if (childrenMatch !== null) party.children = Number(childrenMatch[1]);
  return party;
}

function extractInterests(text: string): string[] | undefined {
  const themes = INTEREST_KEYWORDS.filter(({ pattern }) => pattern.test(text)).map(({ theme }) => theme);
  const unique = [...new Set(themes)];
  return unique.length === 0 ? undefined : unique;
}

function extractCrowdTolerance(text: string): TripBrief['crowdTolerance'] {
  if (/\bavoid\s+crowd|\bless\s+crowd|\bnot\s+crowd|\bquiet\b|\bpeaceful\b|\boffbeat\b|\bsecluded\b/i.test(text)) {
    return 'low';
  }
  if (/\bdon'?t\s+mind\s+crowd|\bbusy\s+is\s+fine\b|\blively\b|\bfestival\b/i.test(text)) {
    return 'high';
  }
  return undefined;
}

function extractPace(text: string): TripBrief['pace'] {
  if (/\brelaxed\b|\bslow\b|\beasy\s+pace\b|\bunhurried\b|\blaid\s*back\b/i.test(text)) return 'relaxed';
  if (/\bpack(?:ed)?\s+in\b|\bas\s+much\s+as\s+possible\b|\bfast\s+paced\b|\bsee\s+everything\b/i.test(text)) {
    return 'packed';
  }
  if (/\bbalanced\b|\bmix\b/i.test(text)) return 'balanced';
  return undefined;
}

function extractConstraints(text: string): TripBrief['constraints'] {
  const constraints: NonNullable<TripBrief['constraints']> = {};
  if (/\bless\s+walk|\blimited\s+walk|\bcan'?t\s+walk|\bminimal\s+walk|\belderly\b|\bsenior\s+citizen/i.test(text)) {
    constraints.lowWalking = true;
  }
  if (/\bwheelchair\b|\bstep[-\s]?free\b/i.test(text)) {
    constraints.stepFreeRequired = true;
    constraints.lowWalking = true;
  }
  if (/\bmedical\b|\bhospital\s+nearby\b|\bdoctor\b|\bmedication\b/i.test(text)) {
    constraints.medicalAccessRequired = true;
  }
  return Object.keys(constraints).length === 0 ? undefined : constraints;
}

function extractDateFlexibility(text: string, now: Date): string | undefined {
  const isoMonth = /\b(20\d{2})-(0[1-9]|1[0-2])\b/.exec(text);
  if (isoMonth !== null) return `${isoMonth[1]}-${isoMonth[2]}`;

  for (const [name, month] of Object.entries(MONTHS)) {
    if (!new RegExp(`\\b${name}\\b`, 'i').test(text)) continue;

    // A month already past this year means the next occurrence of it.
    const year = month < now.getMonth() + 1 ? now.getFullYear() + 1 : now.getFullYear();
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  if (/\bnext\s+month\b/i.test(text)) {
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  }
  if (/\bthis\s+month\b/i.test(text)) {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  return undefined;
}

// --- Clarification --------------------------------------------------------

const CLARIFICATIONS: Record<string, Clarification> = {
  durationDays: {
    field: 'durationDays',
    question: 'How many days do you have for this trip?',
    options: ['Weekend (2 days)', '3 days', '4 days', 'A week'],
  },
  origin: {
    field: 'origin',
    question: 'Where will you be travelling from?',
    options: ['Coimbatore', 'Chennai', 'Bengaluru'],
  },
  budget: {
    field: 'budget',
    question: 'Roughly what total budget are you working with?',
    options: ['Under ₹15,000', '₹15,000–₹25,000', '₹25,000–₹40,000', 'Over ₹40,000'],
  },
  interests: {
    field: 'interests',
    question: 'What would you most like this trip to include?',
    options: ['Nature', 'Heritage', 'Local food', 'Wildlife', 'Quiet places'],
  },
};

// --- Gateway --------------------------------------------------------------

export class DeterministicGateway implements AiGateway {
  readonly mode = 'deterministic' as const;

  constructor(private readonly now: () => Date = () => new Date()) {}

  async extractBrief(message: string, prior: TripBrief | null): Promise<BriefExtraction> {
    const { brief: extracted, fields, signals } = this.parse(message);

    // Merge over the prior brief so a follow-up answer adds to what is already
    // understood, and a correction replaces it.
    const merged: TripBrief = { ...(prior ?? {}), ...extracted };

    // Interests accumulate rather than replace, since people add to them.
    if (prior?.interests !== undefined && extracted.interests !== undefined) {
      merged.interests = [...new Set([...prior.interests, ...extracted.interests])];
    }
    if (prior?.constraints !== undefined && extracted.constraints !== undefined) {
      merged.constraints = { ...prior.constraints, ...extracted.constraints };
    }

    const parsed = TripBriefSchema.safeParse(merged);
    const brief = parsed.success ? parsed.data : (prior ?? {});

    return {
      brief,
      extractedFields: fields,
      clarification: this.nextClarification(brief),
      // Confidence rises with how many independent signals were found.
      confidence: Math.min(0.9, 0.35 + signals * 0.12),
      mode: this.mode,
    };
  }

  /** One focused question for the most important missing field, or none. */
  private nextClarification(brief: TripBrief): Clarification | null {
    for (const field of REQUIRED_FOR_GENERATION) {
      const value = brief[field];
      const isMissing = value === undefined || (Array.isArray(value) && value.length === 0);
      if (isMissing) return CLARIFICATIONS[field] ?? null;
    }
    return null;
  }

  private parse(message: string): Extraction {
    const text = message.trim();
    const brief: TripBrief = {};
    const fields: string[] = [];

    const budget = extractBudget(text);
    if (budget !== undefined) {
      brief.budget = { currency: 'INR', totalMinor: budget };
      fields.push('budget');
    }

    const durationDays = extractDuration(text);
    if (durationDays !== undefined) {
      brief.durationDays = durationDays;
      fields.push('durationDays');
    }

    const origin = extractOrigin(text);
    if (origin !== undefined) {
      brief.origin = origin;
      fields.push('origin');
    }

    const party = extractParty(text);
    if (party !== undefined) {
      brief.party = party;
      fields.push('party');
    }

    const interests = extractInterests(text);
    if (interests !== undefined) {
      brief.interests = interests;
      fields.push('interests');
    }

    const crowdTolerance = extractCrowdTolerance(text);
    if (crowdTolerance !== undefined) {
      brief.crowdTolerance = crowdTolerance;
      fields.push('crowdTolerance');
    }

    const pace = extractPace(text);
    if (pace !== undefined) {
      brief.pace = pace;
      fields.push('pace');
    }

    const constraints = extractConstraints(text);
    if (constraints !== undefined) {
      brief.constraints = constraints;
      fields.push('constraints');
    }

    const dateFlexibility = extractDateFlexibility(text, this.now());
    if (dateFlexibility !== undefined) {
      brief.dateFlexibility = dateFlexibility;
      fields.push('dateFlexibility');
    }

    return { brief, fields, signals: fields.length };
  }

  async describeItinerary(plan: ItineraryPlanSummary): Promise<ItineraryProse> {
    const dayCount = plan.days.length;
    const summary =
      `A ${dayCount}-day plan for ${plan.destinationName}, ordered to keep travel between stops short. ` +
      'Times, costs and crowd notes come from the catalog rather than from the assistant.';

    const dayDescriptions = plan.days.map((day) => {
      if (day.itemTitles.length === 0) return `Day ${day.dayNumber} is open.`;
      if (day.itemTitles.length === 1) return `Day ${day.dayNumber}: ${day.itemTitles[0]}.`;

      const last = day.itemTitles[day.itemTitles.length - 1];
      const rest = day.itemTitles.slice(0, -1).join(', ');
      return `Day ${day.dayNumber}: ${rest}, then ${last}.`;
    });

    return { summary, dayDescriptions };
  }

  async proposeRevision(request: RevisionRequest): Promise<Revision> {
    const movable = request.items.filter((item) => !item.locked);
    const locked = request.items.filter((item) => item.locked);

    // Crowded stops move to the front of the movable run, so they are visited
    // earlier in the day. Locked items keep their positions exactly.
    const crowded = movable.filter((item) => item.crowdLabel === 'Heavy crowd');
    const rest = movable.filter((item) => item.crowdLabel !== 'Heavy crowd');
    const reordered = request.goal === 'avoid_crowds' ? [...crowded, ...rest] : movable;

    const proposedOrder: string[] = [];
    let cursor = 0;
    for (const item of request.items) {
      if (item.locked) {
        proposedOrder.push(item.id);
      } else {
        proposedOrder.push(reordered[cursor].id);
        cursor += 1;
      }
    }

    const explanation =
      crowded.length > 0 && request.goal === 'avoid_crowds'
        ? `${crowded[0].title} is usually busier later in the day. Visiting it earlier should mean less waiting.`
        : 'This order keeps travel between stops shorter without moving anything you locked.';

    return {
      explanation,
      estimatedImpact:
        crowded.length > 0
          ? 'Estimated to reduce waiting at the busiest stop.'
          : 'Estimated to reduce time spent travelling between stops.',
      proposedOrder: locked.length === request.items.length ? request.items.map((item) => item.id) : proposedOrder,
    };
  }
}
