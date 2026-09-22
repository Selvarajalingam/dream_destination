import { z } from 'zod';

/**
 * Business owner listing rules — PRD Part I B01–B06, backlog E10-S05 to S07.
 *
 * B02: "Collect name, category, address/pin, owner contact, hours, price band,
 * services, payment methods, accessibility, and photos. Save progress
 * automatically."
 * B04: "Highlight missing trust-critical fields."
 * B06: "Allow rapid update of hours, closure, price band, contact, and
 * availability. Sensitive ownership changes require review."
 */

export const BUSINESS_CATEGORIES = [
  'restaurant',
  'cafe',
  'homestay',
  'shop',
  'artisan',
  'farm',
  'guide',
  'transport',
] as const;
export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number];

export const PAYMENT_METHODS = ['cash', 'upi', 'card', 'bank_transfer'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Day = (typeof DAYS)[number];

export type Hours = Partial<Record<Day, [string, string] | null>>;

export type Accessibility = {
  stepFreeEntry?: boolean | null;
  accessibleToilet?: boolean | null;
  note?: string | null;
};

/** Everything an owner fills in, as the owner flow sees it. */
export type OwnerListing = {
  name: string;
  category: BusinessCategory | null;
  description: string | null;
  addressLine: string | null;
  locality: string | null;
  pin: string | null;
  lat: number;
  lng: number;
  locationConfirmed: boolean;
  phone: string | null;
  ownerName: string | null;
  hours: Hours;
  priceBand: number | null;
  services: string[];
  paymentMethods: string[];
  accessibility: Accessibility;
};

/**
 * A URL slug from the name plus a short suffix, so two businesses with the
 * same name never collide. The slug does not change when a name does, so
 * links travellers saved keep working.
 */
export function slugFor(name: string, suffix: string): string {
  const base = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return `${base === '' ? 'business' : base}-${suffix}`;
}

// --- Field validation ------------------------------------------------------

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const OUTSIDE_PILOT = 'Place the pin inside the pilot region.';

/** Indian mobile and landline numbers, normalised to +91 and ten digits. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s()-]/g, '');
  const match = /^(?:\+91|0091|0)?([1-9]\d{9})$/.exec(digits);
  return match === null ? null : `+91${match[1]}`;
}

/** Returns an error message, or null when the hours are coherent. */
export function validateHours(hours: Hours): string | null {
  for (const day of DAYS) {
    const slot = hours[day];
    if (slot == null) continue;
    const [open, close] = slot;
    if (!TIME.test(open) || !TIME.test(close)) return 'Use 24-hour times such as 09:30.';
    if (close <= open) return 'Closing time must be after opening time on the same day.';
  }
  return null;
}

const trimmed = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => value.trim())
    .transform((value) => (value === '' ? null : value));

// partialRecord: in Zod 4 an enum-keyed record requires every key, and an
// owner may leave days out.
const hoursSchema = z
  .partialRecord(z.enum(DAYS), z.tuple([z.string(), z.string()]).nullable())
  .superRefine((hours, context) => {
    const problem = validateHours(hours);
    if (problem !== null) context.addIssue({ code: 'custom', message: problem });
  });

/**
 * One schema per field, so an autosave can keep every valid field and report
 * the invalid ones instead of losing the whole form to one typo.
 */
export const DRAFT_FIELDS = {
  name: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(2, 'Enter the name travellers will see.').max(80)),
  category: z.enum(BUSINESS_CATEGORIES, { message: 'Choose a category.' }),
  description: trimmed(400),
  addressLine: trimmed(160),
  locality: trimmed(80),
  pin: z
    .string()
    .transform((value) => value.replace(/\s/g, ''))
    .pipe(z.string().regex(/^([1-9]\d{5})?$/, 'A PIN code is six digits.'))
    .transform((value) => (value === '' ? null : value)),
  // Roughly Tamil Nadu and Kerala: a pin far outside the pilot is a mistake.
  location: z
    .object({
      lat: z.number().min(8, OUTSIDE_PILOT).max(13.6, OUTSIDE_PILOT),
      lng: z.number().min(74.8, OUTSIDE_PILOT).max(80.4, OUTSIDE_PILOT),
    })
    .strict(),
  phone: z
    .string()
    .transform((value, context) => {
      if (value.trim() === '') return null;
      const phone = normalizePhone(value);
      if (phone === null) {
        context.addIssue({ code: 'custom', message: 'Enter a ten-digit Indian phone number.' });
        return z.NEVER;
      }
      return phone;
    }),
  ownerName: trimmed(80),
  hours: hoursSchema,
  priceBand: z.number().int().min(1).max(4).nullable(),
  services: z.array(z.string().trim().min(1).max(40)).max(12),
  paymentMethods: z.array(z.enum(PAYMENT_METHODS)).max(PAYMENT_METHODS.length),
  accessibility: z
    .object({
      stepFreeEntry: z.boolean().nullable().optional(),
      accessibleToilet: z.boolean().nullable().optional(),
      note: trimmed(200).optional(),
    })
    .strict(),
} as const;

export type DraftField = keyof typeof DRAFT_FIELDS;

export type DraftPatch = { [K in DraftField]?: z.output<(typeof DRAFT_FIELDS)[K]> };

/**
 * Splits a partial form into the fields that validated and the messages for
 * those that did not. Unknown keys are reported, never silently stored.
 */
export function parseDraftPatch(input: Record<string, unknown>): {
  values: DraftPatch;
  errors: Record<string, string>;
} {
  const values: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const [key, raw] of Object.entries(input)) {
    if (!(key in DRAFT_FIELDS)) {
      errors[key] = 'This field cannot be set here.';
      continue;
    }
    const result = DRAFT_FIELDS[key as DraftField].safeParse(raw);
    if (result.success) values[key] = result.data;
    else errors[key] = result.error.issues[0]?.message ?? 'This value is not valid.';
  }

  return { values: values as DraftPatch, errors };
}

// --- Completeness (B04) ----------------------------------------------------

export type ListingGap = {
  field: DraftField | 'photos';
  message: string;
  /** Critical gaps block submission. The rest are shown as advice. */
  critical: boolean;
};

/**
 * What a traveller would miss. Trust-critical fields are the ones a traveller
 * relies on to arrive at the right place at the right time and reach the
 * owner if something is wrong.
 */
export function listingGaps(listing: OwnerListing, photoCount: number): ListingGap[] {
  const gaps: ListingGap[] = [];
  const add = (field: ListingGap['field'], message: string, critical: boolean) => gaps.push({ field, message, critical });

  if (listing.name.trim().length < 2) add('name', 'The listing has no name.', true);
  if (listing.category === null) add('category', 'Choose a category so travellers can find it.', true);
  if (listing.addressLine === null) add('addressLine', 'Add a street address travellers can follow.', true);
  if (listing.pin === null) add('pin', 'Add the PIN code.', true);
  if (!listing.locationConfirmed) add('location', 'Place the map pin on the entrance. It is still at the area centre.', true);
  if (listing.phone === null) add('phone', 'Add a phone number travellers can call.', true);
  if (listing.ownerName === null) add('ownerName', 'Add the name of the person responsible for the listing.', true);
  if (!DAYS.some((day) => listing.hours[day] != null)) add('hours', 'Add opening hours for at least one day.', true);

  if (listing.priceBand === null) add('priceBand', 'Add a price band so travellers can plan their budget.', false);
  if (listing.accessibility.stepFreeEntry == null) {
    add('accessibility', 'Say whether the entrance is step-free. Travellers with limited mobility rely on it.', false);
  }
  if (listing.description === null) add('description', 'Add a short description.', false);
  if (photoCount === 0) add('photos', 'Add at least one photo of the entrance or frontage.', false);

  return gaps;
}

// --- Evidence (B03) --------------------------------------------------------

export type EvidenceKind = 'registration' | 'address_proof';

/**
 * Evidence by business type. Every business proves where it is; what proves
 * it is a real business of that type depends on the type.
 */
export const REQUIRED_EVIDENCE: Record<BusinessCategory, ReadonlyArray<{ kind: EvidenceKind; label: string }>> = {
  restaurant: [
    { kind: 'registration', label: 'FSSAI food business registration or licence' },
    { kind: 'address_proof', label: 'Address proof: trade licence, lease, patta or utility bill' },
  ],
  cafe: [
    { kind: 'registration', label: 'FSSAI food business registration or licence' },
    { kind: 'address_proof', label: 'Address proof: trade licence, lease, patta or utility bill' },
  ],
  homestay: [
    { kind: 'registration', label: 'Homestay registration with the district tourism office' },
    { kind: 'address_proof', label: 'Address proof: patta, lease or property tax receipt' },
  ],
  shop: [
    { kind: 'registration', label: 'GST certificate, Udyam registration or trade licence' },
    { kind: 'address_proof', label: 'Address proof: trade licence, lease or utility bill' },
  ],
  artisan: [
    { kind: 'registration', label: 'Artisan card, cooperative membership, Udyam or GST certificate' },
    { kind: 'address_proof', label: 'Address proof: lease, patta or utility bill' },
  ],
  farm: [
    { kind: 'registration', label: 'Patta, chitta or Udyam registration' },
    { kind: 'address_proof', label: 'Address proof: patta or utility bill' },
  ],
  guide: [
    { kind: 'registration', label: 'Guide licence or identity card from the tourism department' },
    { kind: 'address_proof', label: 'Address proof for the base you operate from' },
  ],
  transport: [
    { kind: 'registration', label: 'Tourist vehicle permit' },
    { kind: 'address_proof', label: 'Address proof for the base you operate from' },
  ],
};

export function requiredEvidence(category: BusinessCategory | null): ReadonlyArray<{ kind: EvidenceKind; label: string }> {
  return category === null ? [] : REQUIRED_EVIDENCE[category];
}

/** Everything that stops a draft being sent for review. Empty means ready. */
export function submissionBlockers(
  listing: OwnerListing,
  photoCount: number,
  evidenceKinds: ReadonlySet<string>,
): string[] {
  const blockers = listingGaps(listing, photoCount)
    .filter((gap) => gap.critical)
    .map((gap) => gap.message);

  for (const required of requiredEvidence(listing.category)) {
    if (!evidenceKinds.has(required.kind)) blockers.push(`Upload evidence: ${required.label}.`);
  }

  return blockers;
}

// --- What an owner may do, by state ----------------------------------------

export type OwnerMode =
  /** Fill in and submit. Also after a reviewer asks for changes. */
  | 'editing'
  /** Sent for review; nothing can change underneath the reviewer. */
  | 'in_review'
  /** Live: rapid updates apply at once, sensitive ones go to review. */
  | 'live'
  /** Rejected or suspended: only the decision is shown. */
  | 'closed';

export function ownerMode(status: string, verificationStatus: string | null): OwnerMode {
  if (status === 'draft') return 'editing';
  if (status === 'pending') return verificationStatus === 'changes_requested' ? 'editing' : 'in_review';
  if (status === 'active') return 'live';
  return 'closed';
}

// --- Live updates (B06) ----------------------------------------------------

/** Applied at once and stamped as the owner's latest confirmation. */
export const RAPID_FIELDS = [
  'hours',
  'priceBand',
  'phone',
  'description',
  'services',
  'paymentMethods',
  'accessibility',
] as const satisfies ReadonlyArray<DraftField>;

/**
 * Held for review, because each can redirect a traveller to a different
 * place or hand the listing to a different person.
 */
export const SENSITIVE_FIELDS = [
  'name',
  'category',
  'addressLine',
  'locality',
  'pin',
  'location',
  'ownerName',
] as const satisfies ReadonlyArray<DraftField>;

export type SensitiveField = (typeof SENSITIVE_FIELDS)[number];

export function splitUpdate(patch: DraftPatch): { rapid: DraftPatch; sensitive: DraftPatch } {
  const rapid: Record<string, unknown> = {};
  const sensitive: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if ((SENSITIVE_FIELDS as readonly string[]).includes(key)) sensitive[key] = value;
    else rapid[key] = value;
  }
  return { rapid: rapid as DraftPatch, sensitive: sensitive as DraftPatch };
}

/** An owner says why a sensitive change is needed; the reviewer reads it. */
export const MIN_CHANGE_NOTE = 15;

export type TemporaryClosure = { from: string; until: string; note: string | null };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CLOSURE_DAYS = 90;

/** Returns an error message, or null. `today` is an ISO date in IST. */
export function validateClosure(closure: TemporaryClosure, today: string): string | null {
  if (!ISO_DATE.test(closure.from) || !ISO_DATE.test(closure.until)) return 'Choose both dates.';
  if (closure.until < closure.from) return 'The reopening date must be on or after the first closed day.';
  if (closure.until < today) return 'That closure has already ended.';
  const days = (Date.parse(closure.until) - Date.parse(closure.from)) / 86_400_000;
  if (days > MAX_CLOSURE_DAYS) {
    return `A temporary closure can last at most ${MAX_CLOSURE_DAYS} days. For longer, ask us to pause the listing.`;
  }
  if (closure.note !== null && closure.note.length > 140) return 'Keep the note under 140 characters.';
  return null;
}

export function closureState(closure: TemporaryClosure | null, today: string): 'none' | 'upcoming' | 'active' | 'ended' {
  if (closure === null) return 'none';
  if (closure.until < today) return 'ended';
  if (closure.from > today) return 'upcoming';
  return 'active';
}

// --- What the reviewer sees (A07) ------------------------------------------

/**
 * The evidence summary A07 reads, keyed by its five checks. It describes
 * what was supplied; it never claims anything was confirmed.
 */
export function evidenceSummary(
  listing: OwnerListing,
  files: ReadonlyArray<{ evidenceKind: string | null; originalName: string }>,
): Record<'ownership' | 'address' | 'businessType' | 'hours' | 'contact', string> {
  const named = (kind: EvidenceKind): string => {
    const matching = files.filter((file) => file.evidenceKind === kind).map((file) => file.originalName);
    return matching.length === 0 ? 'nothing uploaded' : `uploaded ${matching.join(', ')}`;
  };
  const open = DAYS.filter((day) => listing.hours[day] != null).length;

  return {
    ownership: `Declared by ${listing.ownerName ?? 'nobody named'}; registration ${named('registration')}`,
    address: `${[listing.addressLine, listing.locality, listing.pin].filter(Boolean).join(', ')}; address proof ${named('address_proof')}`,
    businessType: `Declared as ${listing.category ?? 'no category'}`,
    hours: `Declared by the owner for ${open} day${open === 1 ? '' : 's'} a week`,
    contact: `${listing.phone ?? 'No phone'}; not yet verified by callback`,
  };
}
