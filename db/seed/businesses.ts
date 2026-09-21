import type { SeedSql } from './types';
import type { UserKey } from './users';

/**
 * Local businesses. PRD Part II §17 asks for 30-50.
 *
 * Two carry sponsored = true so Screen T12 can demonstrate that the organic
 * reason and the sponsored label cannot be confused, and so the Dream Score
 * can be shown to exclude sponsored placement (PRD Part II §9.2).
 *
 * Hours are stored with a last-updated date and are never rendered as an
 * "open now" claim (PRD Part I T12).
 */

type Hours = Partial<Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', [string, string] | null>>;

const daily = (open: string, close: string): Hours => ({
  mon: [open, close], tue: [open, close], wed: [open, close],
  thu: [open, close], fri: [open, close], sat: [open, close], sun: [open, close],
});

const closedOn = (day: keyof Hours, open: string, close: string): Hours => ({
  ...daily(open, close),
  [day]: null,
});

type BusinessSeed = {
  slug: string;
  name: string;
  category: 'restaurant' | 'homestay' | 'artisan' | 'guide' | 'cafe' | 'farm' | 'transport' | 'shop';
  description: string;
  lat: number;
  lng: number;
  priceBand: 1 | 2 | 3 | 4;
  hours: Hours;
  phone: string;
  payments: string[];
  accessibility: { stepFreeEntry: boolean; accessibleToilet: boolean; note?: string };
  sponsored?: boolean;
  owner?: UserKey;
  /** Days since the owner last confirmed these details. */
  updatedDaysAgo: number;
};

export const BUSINESSES: BusinessSeed[] = [
  // --- Nilgiris ---
  { slug: 'nilgiri-tea-collective', name: 'Nilgiri Tea Collective', category: 'shop', description: 'Grower-run shop selling single-estate orthodox teas, with tasting by arrangement.', lat: 11.3561, lng: 76.7942, priceBand: 2, hours: closedOn('sun', '09:30', '18:30'), phone: '+914232200101', payments: ['cash', 'upi', 'card'], accessibility: { stepFreeEntry: true, accessibleToilet: false }, sponsored: true, owner: 'owner_tea', updatedDaysAgo: 3 },
  { slug: 'badaga-home-kitchen', name: 'Badaga Home Kitchen', category: 'restaurant', description: 'Family kitchen serving Badaga staples on a fixed daily menu, seating twelve.', lat: 11.3608, lng: 76.7881, priceBand: 1, hours: daily('12:00', '15:00'), phone: '+914232200102', payments: ['cash', 'upi'], accessibility: { stepFreeEntry: false, accessibleToilet: false, note: 'Two steps at the entrance.' }, owner: 'owner_kitchen', updatedDaysAgo: 6 },
  { slug: 'coonoor-bakery-1925', name: 'Coonoor Bakery 1925', category: 'cafe', description: 'Long-running bakery known for varkey biscuits and plum cake.', lat: 11.3528, lng: 76.7961, priceBand: 1, hours: daily('07:30', '20:00'), phone: '+914232200103', payments: ['cash', 'upi'], accessibility: { stepFreeEntry: true, accessibleToilet: false }, updatedDaysAgo: 11 },
  { slug: 'toda-embroidery-centre', name: 'Toda Embroidery Centre', category: 'artisan', description: 'Women’s cooperative producing traditional pukhoor embroidery on hand-loomed cloth.', lat: 11.3689, lng: 76.7733, priceBand: 2, hours: closedOn('sun', '10:00', '17:00'), phone: '+914232200104', payments: ['cash', 'upi'], accessibility: { stepFreeEntry: true, accessibleToilet: false }, updatedDaysAgo: 19 },
  { slug: 'hillside-homestay-coonoor', name: 'Hillside Homestay', category: 'homestay', description: 'Four-room homestay on a tea slope, run by the family that owns the section.', lat: 11.3472, lng: 76.8028, priceBand: 2, hours: daily('00:00', '23:59'), phone: '+914232200105', payments: ['cash', 'upi', 'bank_transfer'], accessibility: { stepFreeEntry: false, accessibleToilet: false }, updatedDaysAgo: 8 },
  { slug: 'nilgiris-birding-guides', name: 'Nilgiris Birding Guides', category: 'guide', description: 'Licensed guides for shola and grassland birding, including Mukurthi permits.', lat: 11.4089, lng: 76.6972, priceBand: 3, hours: daily('05:30', '18:00'), phone: '+914232200106', payments: ['cash', 'upi', 'bank_transfer'], accessibility: { stepFreeEntry: true, accessibleToilet: false }, updatedDaysAgo: 4 },
  { slug: 'ooty-varkey-stall', name: 'Charing Cross Varkey Stall', category: 'shop', description: 'Street stall selling fresh varkey and Nilgiri chocolate.', lat: 11.4107, lng: 76.6953, priceBand: 1, hours: daily('08:00', '21:00'), phone: '+914232200107', payments: ['cash', 'upi'], accessibility: { stepFreeEntry: true, accessibleToilet: false }, updatedDaysAgo: 25 },
  { slug: 'green-valley-organic-farm', name: 'Green Valley Organic Farm', category: 'farm', description: 'Working vegetable farm offering a short walk and a seasonal lunch.', lat: 11.3244, lng: 76.6178, priceBand: 2, hours: closedOn('mon', '09:00', '16:00'), phone: '+914232200108', payments: ['cash', 'upi'], accessibility: { stepFreeEntry: false, accessibleToilet: false }, updatedDaysAgo: 14 },
  { slug: 'ooty-heritage-cab', name: 'Nilgiri Heritage Cabs', category: 'transport', description: 'Driver-owned cabs covering the Nilgiris circuit, with hill-road experience.', lat: 11.4064, lng: 76.6932, priceBand: 2, hours: daily('05:00', '22:00'), phone: '+914232200109', payments: ['cash', 'upi'], accessibility: { stepFreeEntry: true, accessibleToilet: false, note: 'One vehicle takes a folding wheelchair; request when booking.' }, updatedDaysAgo: 2 },
  { slug: 'kotagiri-pottery', name: 'Kotagiri Clay Studio', category: 'artisan', description: 'Small studio throwing and firing local clay, with drop-in sessions at weekends.', lat: 11.4222, lng: 76.8806, priceBand: 2, hours: closedOn('tue', '10:00', '17:30'), phone: '+914232200110', payments: ['cash', 'upi'], accessibility: { stepFreeEntry: true, accessibleToilet: true }, updatedDaysAgo: 22 },
  { slug: 'sholur-millet-kitchen', name: 'Sholur Millet Kitchen', category: 'restaurant', description: 'Millet-based meals cooked to order by a self-help group.', lat: 11.4322, lng: 76.6211, priceBand: 1, hours: daily('11:30', '20:00'), phone: '+914232200111', payments: ['cash', 'upi'], accessibility: { stepFreeEntry: true, accessibleToilet: false }, updatedDaysAgo: 9 },
  { slug: 'nilgiri-honey-house', name: 'Nilgiri Honey House', category: 'shop', description: 'Honey gathered by Kurumba collectors, sold unblended with harvest dates.', lat: 11.3897, lng: 76.7169, priceBand: 2, hours: daily('09:00', '18:00'), phone: '+914232200112', payments: ['cash', 'upi', 'card'], accessibility: { stepFreeEntry: true, accessibleToilet: false }, updatedDaysAgo: 16 },
  { slug: 'estate-bungalow-stay', name: 'Estate Bungalow Stay', category: 'homestay', description: 'Two rooms in a working estate bungalow, with meals cooked by the estate staff.', lat: 11.3311, lng: 76.8133, priceBand: 3, hours: daily('00:00', '23:59'), phone: '+914232200113', payments: ['bank_transfer', 'upi'], accessibility: { stepFreeEntry: true, accessibleToilet: true }, updatedDaysAgo: 7 },
  { slug: 'coonoor-trek-collective', name: 'Coonoor Trek Collective', category: 'guide', description: 'Community guides for the Droog Fort and Hulikal ravine routes.', lat: 11.3539, lng: 76.7925, priceBand: 2, hours: daily('06:00', '17:00'), phone: '+914232200114', payments: ['cash', 'upi'], accessibility: { stepFreeEntry: true, accessibleToilet: false }, updatedDaysAgo: 5 },
  { slug: 'wellington-chai-corner', name: 'Wellington Chai Corner', category: 'cafe', description: 'Roadside tea counter used by estate workers since the 1970s.', lat: 11.3639, lng: 76.7861, priceBand: 1, hours: daily('06:00', '19:00'), phone: '+914232200115', payments: ['cash', 'upi'], accessibility: { stepFreeEntry: true, accessibleToilet: false }, updatedDaysAgo: 31 },

  // --- Valparai and Anamalai ---
  { slug: 'valparai-estate-homestay', name: 'Valparai Estate Homestay', category: 'homestay', description: 'Three rooms on a tea estate with a resident naturalist for early-morning drives.', lat: 10.3283, lng: 76.9522, priceBand: 2, hours: daily('00:00', '23:59'), phone: '+914253200201', payments: ['cash', 'upi', 'bank_transfer'], accessibility: { stepFreeEntry: true, accessibleToilet: false }, updatedDaysAgo: 10 },
  { slug: 'anamalai-naturalist-guides', name: 'Anamalai Naturalist Guides', category: 'guide', description: 'Forest-department-registered naturalists for Grass Hills and plateau routes.', lat: 10.3258, lng: 76.9481, priceBand: 3, hours: daily('05:30', '17:00'), phone: '+914253200202', payments: ['cash', 'bank_transfer'], accessibility: { stepFreeEntry: true, accessibleToilet: false }, updatedDaysAgo: 3 },
  { slug: 'valparai-tea-canteen', name: 'Valparai Tea Canteen', category: 'restaurant', description: 'Estate canteen open to visitors, serving a rotating plate lunch.', lat: 10.3239, lng: 76.9556, priceBand: 1, hours: daily('07:00', '20:00'), phone: '+914253200203', payments: ['cash', 'upi'], accessibility: { stepFreeEntry: true, accessibleToilet: true }, updatedDaysAgo: 13 },
  { slug: 'pollachi-coconut-collective', name: 'Pollachi Coconut Collective', category: 'farm', description: 'Farmer collective running short coconut and jaggery process walks.', lat: 10.6589, lng: 77.0089, priceBand: 1, hours: closedOn('sun', '09:00', '17:00'), phone: '+914259200204', payments: ['cash', 'upi'], accessibility: { stepFreeEntry: true, accessibleToilet: false }, updatedDaysAgo: 18 },
  { slug: 'aliyar-boat-cooperative', name: 'Aliyar Boat Cooperative', category: 'transport', description: 'Licensed boat operators on the Aliyar reservoir, with life jackets provided.', lat: 10.4842, lng: 76.9675, priceBand: 1, hours: daily('09:30', '17:00'), phone: '+914253200205', payments: ['cash', 'upi'], accessibility: { stepFreeEntry: false, accessibleToilet: true }, updatedDaysAgo: 12 },
  { slug: 'valparai-spice-store', name: 'Valparai Spice Store', category: 'shop', description: 'Cardamom, pepper and clove bought directly from plateau smallholders.', lat: 10.3272, lng: 76.9539, priceBand: 2, hours: closedOn('sun', '09:00', '19:00'), phone: '+914253200206', payments: ['cash', 'upi', 'card'], accessibility: { stepFreeEntry: true, accessibleToilet: false }, updatedDaysAgo: 20 },
  { slug: 'monkey-falls-snack-stall', name: 'Monkey Falls Snack Stall', category: 'cafe', description: 'Licensed stall at the falls car park, the only food within six kilometres.', lat: 10.5039, lng: 76.9289, priceBand: 1, hours: daily('09:00', '17:00'), phone: '+914253200207', payments: ['cash', 'upi'], accessibility: { stepFreeEntry: true, accessibleToilet: true }, updatedDaysAgo: 27 },
  { slug: 'sethumadai-craft-group', name: 'Sethumadai Bamboo Craft Group', category: 'artisan', description: 'Bamboo baskets and mats woven by a tribal cooperative at the reserve edge.', lat: 10.5361, lng: 76.9822, priceBand: 1, hours: closedOn('sun', '10:00', '16:30'), phone: '+914253200208', payments: ['cash'], accessibility: { stepFreeEntry: true, accessibleToilet: false }, updatedDaysAgo: 24 },

  // --- Coimbatore city ---
  { slug: 'kovai-tiffin-room', name: 'Kovai Tiffin Room', category: 'restaurant', description: 'Breakfast room serving Kongu-style tiffin since 1968.', lat: 11.0021, lng: 76.9639, priceBand: 1, hours: daily('06:00', '11:30'), phone: '+914222200301', payments: ['cash', 'upi', 'card'], accessibility: { stepFreeEntry: true, accessibleToilet: true }, updatedDaysAgo: 5 },
  { slug: 'annapoorna-heritage', name: 'Race Course Meals Hall', category: 'restaurant', description: 'Banana-leaf meals hall with a fixed lunch service and a vegetarian menu.', lat: 11.0044, lng: 76.9714, priceBand: 2, hours: daily('11:30', '15:30'), phone: '+914222200302', payments: ['cash', 'upi', 'card'], accessibility: { stepFreeEntry: true, accessibleToilet: true }, sponsored: true, updatedDaysAgo: 4 },
  { slug: 'kovai-handloom-society', name: 'Kovai Handloom Society', category: 'artisan', description: 'Weavers’ society selling Kovai Kora cotton direct from the loom.', lat: 10.9989, lng: 76.9583, priceBand: 2, hours: closedOn('sun', '10:00', '19:00'), phone: '+914222200303', payments: ['cash', 'upi', 'card'], accessibility: { stepFreeEntry: true, accessibleToilet: false }, updatedDaysAgo: 15 },
  { slug: 'noyyal-cycle-tours', name: 'Noyyal Cycle Tours', category: 'guide', description: 'Early-morning cycle routes through the old city and along the Noyyal.', lat: 11.0075, lng: 76.9628, priceBand: 2, hours: daily('05:30', '09:30'), phone: '+914222200304', payments: ['upi', 'card'], accessibility: { stepFreeEntry: true, accessibleToilet: false }, updatedDaysAgo: 6 },
  { slug: 'peelamedu-filter-coffee', name: 'Peelamedu Filter Coffee', category: 'cafe', description: 'Counter-service coffee roasted and ground on the premises.', lat: 11.0272, lng: 77.0011, priceBand: 1, hours: daily('06:00', '21:00'), phone: '+914222200305', payments: ['cash', 'upi'], accessibility: { stepFreeEntry: true, accessibleToilet: false }, updatedDaysAgo: 9 },
  { slug: 'gandhipuram-street-food', name: 'Gandhipuram Evening Food Street', category: 'restaurant', description: 'Cluster of licensed evening carts, busiest between seven and ten.', lat: 11.0169, lng: 76.9669, priceBand: 1, hours: daily('17:30', '23:00'), phone: '+914222200306', payments: ['cash', 'upi'], accessibility: { stepFreeEntry: true, accessibleToilet: false, note: 'Crowded pavement seating.' }, updatedDaysAgo: 21 },
  { slug: 'kovai-terracotta-works', name: 'Kovai Terracotta Works', category: 'artisan', description: 'Potters firing roof tiles and garden ware on the Mettupalayam road.', lat: 11.1011, lng: 76.9511, priceBand: 1, hours: closedOn('sun', '09:00', '17:00'), phone: '+914222200307', payments: ['cash', 'upi'], accessibility: { stepFreeEntry: true, accessibleToilet: false }, updatedDaysAgo: 28 },
  { slug: 'siruvani-homestay', name: 'Siruvani Foothills Homestay', category: 'homestay', description: 'Farm stay near the Siruvani road with meals from the kitchen garden.', lat: 10.9442, lng: 76.7031, priceBand: 2, hours: daily('00:00', '23:59'), phone: '+914222200308', payments: ['cash', 'upi', 'bank_transfer'], accessibility: { stepFreeEntry: true, accessibleToilet: true }, updatedDaysAgo: 11 },
  { slug: 'kovai-millet-store', name: 'Kovai Millet Store', category: 'shop', description: 'Kongu-region millets and cold-pressed oils bought from named farms.', lat: 11.0108, lng: 76.9547, priceBand: 2, hours: closedOn('sun', '09:30', '20:00'), phone: '+914222200309', payments: ['cash', 'upi', 'card'], accessibility: { stepFreeEntry: true, accessibleToilet: false }, updatedDaysAgo: 17 },
  { slug: 'perur-flower-market', name: 'Perur Flower Market Stall', category: 'shop', description: 'Morning flower stall beside the temple, supplying jasmine and kanakambaram.', lat: 10.9672, lng: 76.9006, priceBand: 1, hours: daily('05:00', '12:00'), phone: '+914222200310', payments: ['cash', 'upi'], accessibility: { stepFreeEntry: true, accessibleToilet: false }, updatedDaysAgo: 23 },
  { slug: 'kovai-accessible-cabs', name: 'Kovai Accessible Cabs', category: 'transport', description: 'Vehicles with ramp access and trained drivers, bookable a day ahead.', lat: 11.0189, lng: 76.9631, priceBand: 2, hours: daily('06:00', '22:00'), phone: '+914222200311', payments: ['upi', 'card', 'cash'], accessibility: { stepFreeEntry: true, accessibleToilet: false, note: 'Ramp-equipped vehicles; confirm when booking.' }, updatedDaysAgo: 2 },
  { slug: 'vadavalli-book-cafe', name: 'Vadavalli Book Cafe', category: 'cafe', description: 'Quiet cafe with a Tamil and English reading room upstairs.', lat: 11.0231, lng: 76.9017, priceBand: 2, hours: daily('08:00', '22:00'), phone: '+914222200312', payments: ['upi', 'card'], accessibility: { stepFreeEntry: true, accessibleToilet: true, note: 'The reading room is upstairs with no lift.' }, updatedDaysAgo: 8 },
  { slug: 'kurichi-jaggery-unit', name: 'Kurichi Jaggery Unit', category: 'farm', description: 'Small jaggery unit boiling cane between December and March.', lat: 10.9489, lng: 76.9903, priceBand: 1, hours: closedOn('sun', '07:00', '15:00'), phone: '+914222200313', payments: ['cash'], accessibility: { stepFreeEntry: false, accessibleToilet: false }, updatedDaysAgo: 30 },
  { slug: 'singanallur-weavers', name: 'Singanallur Weavers Collective', category: 'artisan', description: 'Powerloom and handloom collective producing cotton towels and dhotis.', lat: 11.0069, lng: 77.0353, priceBand: 1, hours: closedOn('sun', '09:00', '18:00'), phone: '+914222200314', payments: ['cash', 'upi'], accessibility: { stepFreeEntry: true, accessibleToilet: false }, updatedDaysAgo: 26 },
  { slug: 'thudiyalur-nursery', name: 'Thudiyalur Plant Nursery', category: 'shop', description: 'Nursery row supplying native saplings and garden plants.', lat: 11.0833, lng: 76.9333, priceBand: 1, hours: daily('08:00', '18:30'), phone: '+914222200315', payments: ['cash', 'upi'], accessibility: { stepFreeEntry: true, accessibleToilet: false }, updatedDaysAgo: 19 },
];

export type BusinessIds = Record<string, string>;

export async function seedBusinesses(
  tx: SeedSql,
  userIds: Record<UserKey, string>,
): Promise<BusinessIds> {
  const ids: BusinessIds = {};

  for (const business of BUSINESSES) {
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO local_businesses (
        owner_user_id, slug, name, category, description, location,
        address, contact, operating_hours, price_band, accessibility,
        payment_methods, status, sponsored, last_owner_update_at
      ) VALUES (
        ${business.owner === undefined ? null : userIds[business.owner]},
        ${business.slug}, ${business.name}, ${business.category}, ${business.description},
        ST_SetSRID(ST_MakePoint(${business.lng}, ${business.lat}), 4326)::geography,
        ${tx.json({ state: 'Tamil Nadu', country: 'India' })},
        ${tx.json({ phone: business.phone })},
        ${tx.json(business.hours)},
        ${business.priceBand},
        ${tx.json(business.accessibility)},
        ${tx.array(business.payments)},
        'active',
        ${business.sponsored ?? false},
        now() - make_interval(days => ${business.updatedDaysAgo})
      )
      RETURNING id
    `;
    ids[business.slug] = row.id;

    // An approved owner verification, so the listing may show owner-verified
    // status. Sponsored placement is approved separately (PRD Part I A07).
    await tx`
      INSERT INTO business_verifications (
        business_id, status, evidence_summary, reviewed_at, expires_at, decision_reason
      ) VALUES (
        ${row.id}, 'approved',
        ${tx.json({ ownership: 'declared', address: 'checked', demonstrationData: true })},
        now() - make_interval(days => ${business.updatedDaysAgo + 10}),
        now() + interval '6 months',
        'Demonstration record: ownership and address confirmed during pilot onboarding.'
      )
    `;
  }

  return ids;
}
