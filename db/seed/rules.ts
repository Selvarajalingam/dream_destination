import type { SeedSql } from './types';
import type { DestinationKey } from './destinations';
import type { PlaceIds } from './places';
import type { SourceKey } from './sources';

/**
 * Sourced rules for Screen T20, "Know Before You Visit". PRD Part II §17 asks
 * for at least 15.
 *
 * Every rule carries a plain-language summary, an issuing authority, a
 * verified date and a review due date, because PRD Part I T20 requires all of
 * those beside the claim. Two rules are deliberately past their review date so
 * the stale treatment and Screen A05 have real material.
 */

type RuleSeed = {
  category: 'photography' | 'drone' | 'forest' | 'permit' | 'dress_etiquette' | 'waste' | 'operating' | 'wildlife';
  title: string;
  summary: string;
  officialExcerpt: string;
  source: SourceKey;
  /** Attach to a specific place, or to a whole destination. */
  placeSlug?: string;
  destination?: DestinationKey;
  verifiedDaysAgo: number;
  reviewInDays: number;
};

export const RULES: RuleSeed[] = [
  {
    category: 'drone',
    title: 'Drones need prior written permission',
    summary: 'Flying a drone over reserve forest or a protected monument requires written permission in advance. Assume the answer is no unless you hold a permit.',
    officialExcerpt: 'Unmanned aerial vehicles shall not be operated within notified reserve forest areas without prior written authorisation from the competent authority.',
    source: 'forest_department',
    destination: 'ooty',
    verifiedDaysAgo: 14, reviewInDays: 60,
  },
  {
    category: 'forest',
    title: 'Forest entry closes before dusk',
    summary: 'Entry gates to reserve areas close well before sunset and re-open after first light. Plan to be out of the forest by the posted time.',
    officialExcerpt: 'Entry permits are valid between the hours posted at the check post and are not extended after closing time.',
    source: 'forest_department',
    placeSlug: 'mukurthi-trail',
    verifiedDaysAgo: 14, reviewInDays: 60,
  },
  {
    category: 'permit',
    title: 'Mukurthi trekking permits are issued in advance',
    summary: 'Trekking inside Mukurthi National Park needs a permit obtained from the range office beforehand, with a daily cap on visitor numbers.',
    officialExcerpt: 'Trekking permits shall be issued subject to daily carrying capacity limits determined by the Wildlife Warden.',
    source: 'forest_department',
    placeSlug: 'mukurthi-trail',
    verifiedDaysAgo: 14, reviewInDays: 60,
  },
  {
    category: 'permit',
    title: 'Grass Hills entry is capped each day',
    summary: 'Grass Hills inside Anamalai Tiger Reserve admits a limited number of vehicles per day. Book through the range office rather than turning up.',
    officialExcerpt: 'Vehicle entry to the Grass Hills range is restricted to the daily quota notified by the Field Director.',
    source: 'forest_department',
    placeSlug: 'grass-hills-viewpoint',
    verifiedDaysAgo: 14, reviewInDays: 60,
  },
  {
    category: 'wildlife',
    title: 'Do not feed or approach wildlife',
    summary: 'Feeding monkeys, deer or elephants is an offence and makes animals dangerous to the people who live here. Stay in your vehicle when animals are on the road.',
    officialExcerpt: 'Feeding of wild animals within the reserve is prohibited and punishable under the Wild Life (Protection) Act.',
    source: 'forest_department',
    destination: 'valparai',
    verifiedDaysAgo: 14, reviewInDays: 60,
  },
  {
    category: 'wildlife',
    title: 'Give elephants the road',
    summary: 'Elephants cross the plateau roads at dawn and dusk. If you meet one, stop, switch off the engine and reverse slowly when there is space. Do not use the horn.',
    officialExcerpt: 'Motorists shall not obstruct the movement of elephants on notified corridors and shall maintain a minimum distance of fifty metres.',
    source: 'forest_department',
    destination: 'valparai',
    verifiedDaysAgo: 14, reviewInDays: 60,
  },
  {
    category: 'waste',
    title: 'Single-use plastic is banned in the hills',
    summary: 'Carry-bags, bottles and packaging made of single-use plastic are prohibited across the Nilgiris. Carry a refillable bottle and take waste back down with you.',
    officialExcerpt: 'The use, sale and storage of notified single-use plastic items is prohibited within the district.',
    source: 'district_tourism',
    destination: 'ooty',
    verifiedDaysAgo: 9, reviewInDays: 120,
  },
  {
    category: 'waste',
    title: 'Carry your waste out of trail areas',
    summary: 'There are no bins on the trails. Whatever you carry in, carry out, including fruit peel and cigarette ends.',
    officialExcerpt: 'Visitors shall remove all waste generated during the visit from the protected area.',
    source: 'forest_department',
    destination: 'coonoor',
    verifiedDaysAgo: 14, reviewInDays: 90,
  },
  {
    category: 'dress_etiquette',
    title: 'Temple dress and photography etiquette',
    summary: 'Cover shoulders and knees inside temple precincts, remove footwear before the entrance, and do not photograph inside the sanctum.',
    officialExcerpt: 'Photography within the sanctum sanctorum is not permitted. Devotees and visitors shall observe the prescribed dress code.',
    source: 'district_tourism',
    placeSlug: 'marudamalai-temple',
    verifiedDaysAgo: 9, reviewInDays: 120,
  },
  {
    category: 'photography',
    title: 'Ask before photographing people at work or at home',
    summary: 'Estate workers, market traders and residents of Toda hamlets are not an attraction. Ask first, accept no, and do not photograph inside homes.',
    officialExcerpt: 'Visitors are requested to obtain consent before photographing residents and their dwellings.',
    source: 'verified_curator',
    placeSlug: 'nilgiri-toda-settlement',
    verifiedDaysAgo: 30, reviewInDays: 150,
  },
  {
    category: 'photography',
    title: 'Tripods and commercial shoots need permission at monuments',
    summary: 'Handheld photography is generally allowed. Tripods, lighting and any commercial shoot need written permission from the site authority.',
    officialExcerpt: 'Use of tripod, artificial lighting or videography for commercial purposes requires prior permission and payment of the prescribed fee.',
    source: 'archaeological_survey',
    placeSlug: 'perur-pateeswarar-temple',
    // Past its review date on purpose, so T20 shows the stale state.
    verifiedDaysAgo: 400, reviewInDays: -18,
  },
  {
    category: 'operating',
    title: 'Monument hours change on notified holidays',
    summary: 'Protected monuments may close or change hours on notified holidays. Check the notice board at the entrance before planning a visit around it.',
    officialExcerpt: 'Monuments remain closed on days notified by the Circle office.',
    source: 'archaeological_survey',
    placeSlug: 'st-stephens-church',
    // Also deliberately stale.
    verifiedDaysAgo: 400, reviewInDays: -18,
  },
  {
    category: 'operating',
    title: 'Boating stops in high wind',
    summary: 'Boat operations on the lakes and reservoirs are suspended at short notice in high wind or heavy rain. Tickets are refunded at the counter.',
    officialExcerpt: 'Boating operations shall be suspended when wind speed or water conditions are assessed as unsafe by the operator in charge.',
    source: 'district_tourism',
    placeSlug: 'ooty-lake',
    verifiedDaysAgo: 9, reviewInDays: 120,
  },
  {
    category: 'forest',
    title: 'Open fires and smoking are prohibited in grassland',
    summary: 'Shola grassland catches fire easily in the dry months. No open flames, no stoves and no smoking beyond the check post.',
    officialExcerpt: 'Carrying of inflammable material and lighting of fires within the protected area is strictly prohibited.',
    source: 'forest_department',
    placeSlug: 'avalanche-lake',
    verifiedDaysAgo: 14, reviewInDays: 60,
  },
  {
    category: 'operating',
    title: 'Siruvani entry closes on elephant movement alerts',
    summary: 'The Siruvani road is closed at short notice when elephants are moving near the route. Check at the check post on the day.',
    officialExcerpt: 'Entry may be suspended without notice in the interest of visitor safety and wildlife movement.',
    source: 'forest_department',
    placeSlug: 'siruvani-waterfall',
    verifiedDaysAgo: 14, reviewInDays: 60,
  },
  {
    category: 'dress_etiquette',
    title: 'Estate land is private property',
    summary: 'Tea sections are working farmland. Walk only on marked estate paths, do not pick leaf, and leave gates as you found them.',
    officialExcerpt: 'Access to estate sections is permitted only along designated paths with the consent of the estate management.',
    source: 'verified_curator',
    destination: 'coonoor',
    verifiedDaysAgo: 30, reviewInDays: 150,
  },
  {
    category: 'waste',
    title: 'Bathing is restricted at waterfalls in high flow',
    summary: 'Bathing areas close when flow is high. Barriers and red flags mean the water is unsafe even where it looks calm.',
    officialExcerpt: 'Entry into the water is prohibited when the safety flag is displayed by the site attendant.',
    source: 'forest_department',
    placeSlug: 'monkey-falls',
    verifiedDaysAgo: 14, reviewInDays: 60,
  },
  {
    category: 'operating',
    title: 'Market visits are before eight in the morning',
    summary: 'The wholesale market runs at dawn. Arriving later means the trade is over and the lanes are being cleaned.',
    officialExcerpt: 'Wholesale trading hours are between 05:00 and 08:00 as notified by the market committee.',
    source: 'municipal_corporation',
    placeSlug: 'ukkadam-market-walk',
    verifiedDaysAgo: 21, reviewInDays: 90,
  },
];

export async function seedRules(
  tx: SeedSql,
  placeIds: PlaceIds,
  destinationIds: Record<DestinationKey, string>,
  sourceIds: Record<SourceKey, string>,
): Promise<void> {
  for (const rule of RULES) {
    const placeId = rule.placeSlug === undefined ? null : placeIds[rule.placeSlug];
    const destinationId = rule.destination === undefined ? null : destinationIds[rule.destination];

    await tx`
      INSERT INTO rule_content (
        place_id, destination_id, category, title, plain_language_summary,
        official_text_excerpt, source_id, effective_from,
        verified_at, review_due_at, status
      ) VALUES (
        ${placeId}, ${destinationId}, ${rule.category}, ${rule.title}, ${rule.summary},
        ${rule.officialExcerpt}, ${sourceIds[rule.source]},
        (now() - interval '1 year')::date,
        now() - make_interval(days => ${rule.verifiedDaysAgo}),
        now() + make_interval(days => ${rule.reviewInDays}),
        'active'
      )
    `;
  }
}
