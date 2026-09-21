import type { CrowdBand } from '@/modules/crowd/domain/types';
import type { PriceState } from '@/modules/budgets/domain/types';

export type TripStatus = 'draft' | 'upcoming' | 'active' | 'completed' | 'cancelled';

export type TravelMode = 'car' | 'bus' | 'train' | 'walk' | 'bike';

export type TravelLeg = {
  minutes: number;
  meters: number;
  mode: TravelMode;
};

export type ItemPriceEstimate = {
  expectedMinor: number;
  lowMinor?: number | null;
  highMinor?: number | null;
  priceState: PriceState;
};

export type ItineraryItem = {
  id: string;
  title: string;
  itemType: 'place' | 'business' | 'stay' | 'transport' | 'meal' | 'note';
  placeId: string | null;
  localBusinessId: string | null;
  startsAt: Date | null;
  durationMinutes: number;
  sortOrder: number;
  lockedByUser: boolean;
  travelFromPrevious: TravelLeg;
  priceEstimate: ItemPriceEstimate;
  bookingState: string | null;
  notes: string | null;
  /** Source record ids backing this item's trust-bearing fields. */
  sourceIds?: string[];
};

export type ItineraryDay = {
  id: string;
  dayNumber: number;
  date: Date | null;
  title: string | null;
  items: ItineraryItem[];
};

/** Seven-day opening hours. A missing or null day means closed. */
export type OpeningHours = Partial<
  Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', [string, string] | null>
>;

export type PlaceAccessibility = {
  stepFreeEntry?: boolean;
  lowWalking?: boolean;
  accessibleToilet?: boolean;
};

export type ConflictPlace = {
  id: string;
  name: string;
  openingHours: OpeningHours;
  accessibility: PlaceAccessibility;
  /** A known seasonal or weather closure, if any. */
  closureNote: string | null;
};

export type ConflictCrowd = {
  band: CrowdBand;
  label: string;
  explanation: string;
};

export type ConflictContext = {
  placesById: Record<string, ConflictPlace>;
  crowdByPlaceId: Record<string, ConflictCrowd>;
  constraints: {
    lowWalking?: boolean;
    medicalAccessRequired?: boolean;
  };
  budget: {
    expectedTotalMinor: number;
    /** The declared budget. */
    totalLimitMinor: number;
    /** The declared budget less any reserve held back. */
    spendableMinor: number;
  };
};

/** The six inline warnings PRD Part I T09 requires. */
export type ConflictKind =
  | 'opening_hours'
  | 'excessive_travel'
  | 'crowd_peak'
  | 'budget_overrun'
  | 'weather_closure'
  | 'accessibility_mismatch';

export type Conflict = {
  kind: ConflictKind;
  severity: 'info' | 'warning' | 'blocking';
  /** Plain language, stating what is wrong. */
  message: string;
  /** What the traveler can do about it. */
  suggestedAction: string;
  itemId: string | null;
};

/** Travel time lookup used when rebuilding a day's schedule. */
export type TravelLookup = (
  fromItem: ItineraryItem | null,
  toItem: ItineraryItem,
) => TravelLeg;
