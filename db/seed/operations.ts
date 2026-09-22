import type { PlaceIds } from './places';
import type { BusinessIds } from './businesses';
import type { SeedSql } from './types';
import type { UserKey } from './users';

/**
 * Operational fixtures for the admin screens.
 *
 * Without these, A01, A06 and A07 would render empty states on first run, and
 * an empty queue demonstrates nothing. Each record is chosen to exercise a
 * specific rule: a critical incident that should be suspended, one with an
 * owner response, a business awaiting verification, and a sponsorship request
 * that has to be approved separately from its listing.
 */

type IncidentSeed = {
  entityType: 'place' | 'business';
  slug: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  hoursAgo: number;
  ownerResponse?: string;
};

const INCIDENTS: IncidentSeed[] = [
  {
    entityType: 'place',
    slug: 'chinnakallar-falls',
    category: 'safety',
    severity: 'critical',
    description:
      'A section of the approach path has collapsed after rain. The barrier has been pushed aside and visitors are walking round it on the edge.',
    hoursAgo: 2,
  },
  {
    entityType: 'place',
    slug: 'droog-fort-trail',
    category: 'access',
    severity: 'high',
    description:
      'Trail markers past the second stream crossing are missing. Two walkers reported getting lost and returning after dark.',
    hoursAgo: 20,
  },
  {
    entityType: 'business',
    slug: 'wellington-chai-corner',
    category: 'hours',
    severity: 'low',
    description: 'Arrived at 18:00 and the counter was shut, although the listing says it opens until 19:00.',
    hoursAgo: 50,
    ownerResponse:
      'We close an hour early on Mondays for stock delivery. Updating the listed hours now; sorry for the wasted trip.',
  },
  {
    entityType: 'place',
    slug: 'monkey-falls',
    category: 'crowding',
    severity: 'medium',
    description: 'Car park full by 10:00 on a weekday; vehicles are parking on the ghat road bends.',
    hoursAgo: 30,
  },
];

type PendingBusinessSeed = {
  slug: string;
  name: string;
  category: string;
  description: string;
  lat: number;
  lng: number;
  priceBand: 1 | 2 | 3 | 4;
  phone: string;
  owner: UserKey;
  evidence: Record<string, string>;
  requestSponsorship?: boolean;
};

const PENDING_BUSINESSES: PendingBusinessSeed[] = [
  {
    slug: 'kotagiri-spice-trail-homestay',
    name: 'Kotagiri Spice Trail Homestay',
    category: 'homestay',
    description: 'Three-room homestay on a working pepper and cardamom smallholding above Kotagiri.',
    lat: 11.4311,
    lng: 76.8622,
    priceBand: 2,
    phone: '+914266200401',
    owner: 'owner_kitchen',
    evidence: {
      ownership: 'Patta document uploaded',
      address: 'Matches village record; not yet visited',
      businessType: 'Homestay registration pending with district tourism office',
      hours: 'Check-in 12:00, check-out 11:00',
      contact: 'Phone verified by callback',
    },
  },
  {
    slug: 'nilgiri-weavers-studio',
    name: 'Nilgiri Weavers Studio',
    category: 'artisan',
    description: 'Handloom studio producing Toda-inspired shawls, with weaving demonstrations on weekdays.',
    lat: 11.4058,
    lng: 76.7012,
    priceBand: 2,
    phone: '+914232200402',
    owner: 'owner_tea',
    evidence: {
      ownership: 'GST certificate uploaded',
      address: 'Shop frontage photo matches listed address',
      businessType: 'Artisan cooperative membership card uploaded',
      hours: 'Mon–Sat 10:00–18:00',
      contact: 'Phone not yet verified',
    },
    requestSponsorship: true,
  },
  {
    slug: 'ooty-lakeview-cafe',
    name: 'Ooty Lakeview Cafe',
    category: 'cafe',
    description: 'Cafe overlooking the boathouse, serving filter coffee and Nilgiri tea.',
    lat: 11.4029,
    lng: 76.6881,
    priceBand: 2,
    phone: '+914232200403',
    owner: 'owner_kitchen',
    evidence: {
      ownership: 'Lease agreement uploaded; name differs from applicant',
      address: 'Matches municipal trade licence',
      businessType: 'FSSAI food licence uploaded',
      hours: 'Daily 07:00–20:00',
      contact: 'Phone verified by callback',
    },
  },
];

export async function seedOperations(
  tx: SeedSql,
  placeIds: PlaceIds,
  businessIds: BusinessIds,
  userIds: Record<UserKey, string>,
): Promise<void> {
  for (const incident of INCIDENTS) {
    const entityId =
      incident.entityType === 'place' ? placeIds[incident.slug] : businessIds[incident.slug];
    if (entityId === undefined) continue;

    await tx`
      INSERT INTO incident_reports (
        reporter_user_id, entity_type, entity_id, category, severity, description,
        status, created_at, owner_response, owner_responded_at
      ) VALUES (
        ${userIds.traveler}, ${incident.entityType}, ${entityId}, ${incident.category},
        ${incident.severity}, ${incident.description}, 'open',
        now() - make_interval(hours => ${incident.hoursAgo}),
        ${incident.ownerResponse ?? null},
        ${incident.ownerResponse === undefined ? null : tx`now() - make_interval(hours => ${Math.max(1, incident.hoursAgo - 6)})`}
      )
    `;
  }

  for (const business of PENDING_BUSINESSES) {
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO local_businesses (
        owner_user_id, slug, name, category, description, location, address, contact,
        operating_hours, price_band, accessibility, payment_methods, status, sponsored,
        sponsorship_requested_at, last_owner_update_at
      ) VALUES (
        ${userIds[business.owner]}, ${business.slug}, ${business.name}, ${business.category},
        ${business.description},
        ST_SetSRID(ST_MakePoint(${business.lng}, ${business.lat}), 4326)::geography,
        ${tx.json({ state: 'Tamil Nadu', country: 'India' })},
        ${tx.json({ phone: business.phone })},
        ${tx.json({})},
        ${business.priceBand},
        ${tx.json({ stepFreeEntry: false, accessibleToilet: false })},
        ${tx.array(['cash', 'upi'])},
        'pending',
        false,
        ${business.requestSponsorship === true ? tx`now() - interval '1 day'` : null},
        now() - interval '2 days'
      )
      RETURNING id
    `;

    await tx`
      INSERT INTO business_verifications (business_id, status, evidence_summary, created_at)
      VALUES (
        ${row.id}, 'under_review',
        ${tx.json({ ...business.evidence, demonstrationData: true })},
        now() - interval '2 days'
      )
    `;
  }

  // One live sponsorship request against an already-approved listing, so the
  // separation between listing and sponsorship is visible: this business is
  // verified, but its paid placement is still undecided.
  const alreadyListed = businessIds['kovai-millet-store'];
  if (alreadyListed !== undefined) {
    await tx`
      UPDATE local_businesses
      SET sponsorship_requested_at = now() - interval '3 hours'
      WHERE id = ${alreadyListed}
    `;
  }
}
