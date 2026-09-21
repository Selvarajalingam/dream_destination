import type { SeedSql } from './types';

/**
 * Pilot geography: Coimbatore district and The Nilgiris, Tamil Nadu. Chosen
 * because the PRD's own validation task (Part I §14.1) is "a four-day family
 * trip from Coimbatore within ₹25,000".
 *
 * The four destinations are deliberately different from one another so the
 * shortlist (T04) shows real trade-offs rather than three near-identical
 * options: a busy hill town, a quieter valley, a remote wildlife plateau, and
 * an accessible city base.
 */

export type DestinationKey = 'ooty' | 'coonoor' | 'valparai' | 'coimbatore';

type DestinationSeed = {
  key: DestinationKey;
  slug: string;
  name: string;
  district: string;
  summary: string;
  lat: number;
  lng: number;
  themes: string[];
  minimumDays: number;
  maximumDays: number;
  baseCostLowInr: number;
  baseCostHighInr: number;
  /** Month number to a 0-1 suitability value, used by the Dream Score. */
  seasonFitByMonth: Record<number, number>;
};

export const DESTINATIONS: DestinationSeed[] = [
  {
    key: 'ooty',
    slug: 'ooty-nilgiris',
    name: 'Ooty and the Nilgiris',
    district: 'The Nilgiris',
    summary:
      'Tea estates, a colonial-era hill town and high-altitude gardens, about three hours from Coimbatore by road.',
    lat: 11.4102,
    lng: 76.695,
    themes: ['nature', 'heritage', 'hill_station', 'tea', 'gardens'],
    minimumDays: 2,
    maximumDays: 5,
    baseCostLowInr: 9000,
    baseCostHighInr: 22000,
    seasonFitByMonth: { 1: 0.8, 2: 0.85, 3: 0.9, 4: 0.95, 5: 0.9, 6: 0.5, 7: 0.4, 8: 0.45, 9: 0.7, 10: 0.8, 11: 0.85, 12: 0.9 },
  },
  {
    key: 'coonoor',
    slug: 'coonoor-valley',
    name: 'Coonoor Valley',
    district: 'The Nilgiris',
    summary:
      'A quieter Nilgiris base with working tea factories, shorter walking trails and fewer crowds than Ooty.',
    lat: 11.353,
    lng: 76.7959,
    themes: ['nature', 'tea', 'quiet', 'local_food', 'hill_station'],
    minimumDays: 2,
    maximumDays: 4,
    baseCostLowInr: 7500,
    baseCostHighInr: 17000,
    seasonFitByMonth: { 1: 0.85, 2: 0.9, 3: 0.9, 4: 0.9, 5: 0.85, 6: 0.55, 7: 0.45, 8: 0.5, 9: 0.75, 10: 0.85, 11: 0.9, 12: 0.92 },
  },
  {
    key: 'valparai',
    slug: 'valparai-anamalai',
    name: 'Valparai and Anamalai',
    district: 'Coimbatore',
    summary:
      'A rainforest plateau with wildlife corridors, limited mobile coverage and strict forest entry rules.',
    lat: 10.327,
    lng: 76.954,
    themes: ['nature', 'wildlife', 'quiet', 'trekking', 'tea'],
    minimumDays: 2,
    maximumDays: 4,
    baseCostLowInr: 8000,
    baseCostHighInr: 19000,
    seasonFitByMonth: { 1: 0.85, 2: 0.9, 3: 0.85, 4: 0.7, 5: 0.6, 6: 0.3, 7: 0.25, 8: 0.3, 9: 0.6, 10: 0.75, 11: 0.85, 12: 0.88 },
  },
  {
    key: 'coimbatore',
    slug: 'coimbatore-city',
    name: 'Coimbatore City and Surrounds',
    district: 'Coimbatore',
    summary:
      'Temple heritage, textile history and accessible day trips, with the strongest medical access in the pilot region.',
    lat: 11.0168,
    lng: 76.9558,
    themes: ['heritage', 'local_food', 'temples', 'accessible', 'crafts'],
    minimumDays: 1,
    maximumDays: 3,
    baseCostLowInr: 5000,
    baseCostHighInr: 14000,
    seasonFitByMonth: { 1: 0.9, 2: 0.85, 3: 0.7, 4: 0.55, 5: 0.5, 6: 0.6, 7: 0.65, 8: 0.7, 9: 0.75, 10: 0.85, 11: 0.9, 12: 0.92 },
  },
];

/** The demonstration origin. PRD Part I §14.1 task 1. */
export const PILOT_ORIGIN = { label: 'Coimbatore', lat: 11.0168, lng: 76.9558 };

/** Road travel minutes from Coimbatore, used for the time and distance fit. */
export const TRAVEL_MINUTES_FROM_ORIGIN: Record<DestinationKey, number> = {
  ooty: 180,
  coonoor: 150,
  valparai: 195,
  coimbatore: 20,
};

export async function seedDestinations(tx: SeedSql): Promise<Record<DestinationKey, string>> {
  const ids = {} as Record<DestinationKey, string>;

  for (const destination of DESTINATIONS) {
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO destinations (
        slug, name, state_code, district, summary, center, themes,
        minimum_days, maximum_days, base_cost_low_inr, base_cost_high_inr,
        status, published_at
      ) VALUES (
        ${destination.slug}, ${destination.name}, 'TN', ${destination.district},
        ${destination.summary},
        ST_SetSRID(ST_MakePoint(${destination.lng}, ${destination.lat}), 4326)::geography,
        ${tx.array(destination.themes)},
        ${destination.minimumDays}, ${destination.maximumDays},
        ${destination.baseCostLowInr}, ${destination.baseCostHighInr},
        'active', now()
      )
      RETURNING id
    `;
    ids[destination.key] = row.id;
  }

  return ids;
}

export const SEASON_FIT: Record<DestinationKey, Record<number, number>> = Object.fromEntries(
  DESTINATIONS.map((destination) => [destination.key, destination.seasonFitByMonth]),
) as Record<DestinationKey, Record<number, number>>;
