import type { Sql } from 'postgres';

/**
 * Every seeded source carries source_type = 'seeded_demo'. PRD Part II §17
 * requires seeded records to stay identifiable in storage and in the UI, and
 * forbids presenting them as real pilot outcomes.
 *
 * issuing_authority names the real-world body each record stands in for, so
 * the source-and-freshness pattern (PRD Part I §5.7) has something honest to
 * display, while the type makes the demonstration origin unmistakable.
 */

export type SourceKey =
  | 'district_tourism'
  | 'forest_department'
  | 'municipal_corporation'
  | 'health_department'
  | 'police_department'
  | 'transport_corporation'
  | 'archaeological_survey'
  | 'verified_curator'
  | 'owner_declared'
  | 'crowd_sensor'
  | 'crowd_checkin';

type SourceSeed = {
  key: SourceKey;
  name: string;
  issuingAuthority: string;
  sourceUrl: string | null;
  geographyScope: string;
  /** Days before this source is due for review, from the seed date. */
  reviewInDays: number;
  /** Days ago this source was last verified. */
  verifiedDaysAgo: number;
};

const SOURCES: SourceSeed[] = [
  {
    key: 'district_tourism',
    name: 'District Tourism Office listings',
    issuingAuthority: 'District Tourism Office, The Nilgiris (demonstration record)',
    sourceUrl: 'https://example.gov.in/nilgiris-tourism',
    geographyScope: 'The Nilgiris district',
    reviewInDays: 120,
    verifiedDaysAgo: 9,
  },
  {
    key: 'forest_department',
    name: 'Forest Department entry and trekking rules',
    issuingAuthority: 'Tamil Nadu Forest Department (demonstration record)',
    sourceUrl: 'https://example.gov.in/tn-forest-permits',
    geographyScope: 'Nilgiris and Anamalai reserves',
    reviewInDays: 60,
    verifiedDaysAgo: 14,
  },
  {
    key: 'municipal_corporation',
    name: 'Municipal operating hours and civic notices',
    issuingAuthority: 'Coimbatore City Municipal Corporation (demonstration record)',
    sourceUrl: 'https://example.gov.in/ccmc-notices',
    geographyScope: 'Coimbatore district',
    reviewInDays: 90,
    verifiedDaysAgo: 21,
  },
  {
    key: 'health_department',
    name: 'Public health facility directory',
    issuingAuthority: 'Directorate of Public Health, Tamil Nadu (demonstration record)',
    sourceUrl: 'https://example.gov.in/tn-health-facilities',
    geographyScope: 'Coimbatore and The Nilgiris',
    reviewInDays: 45,
    verifiedDaysAgo: 6,
  },
  {
    key: 'police_department',
    name: 'Police station and tourist assistance directory',
    issuingAuthority: 'Tamil Nadu Police (demonstration record)',
    sourceUrl: 'https://example.gov.in/tn-police-directory',
    geographyScope: 'Coimbatore and The Nilgiris',
    reviewInDays: 90,
    verifiedDaysAgo: 11,
  },
  {
    key: 'transport_corporation',
    name: 'State transport timings and fares',
    issuingAuthority: 'Tamil Nadu State Transport Corporation (demonstration record)',
    sourceUrl: 'https://example.gov.in/tnstc-timings',
    geographyScope: 'Western Tamil Nadu',
    reviewInDays: 30,
    verifiedDaysAgo: 4,
  },
  {
    key: 'archaeological_survey',
    name: 'Protected monument notices',
    issuingAuthority: 'Archaeological Survey of India, Chennai Circle (demonstration record)',
    sourceUrl: 'https://example.gov.in/asi-chennai',
    geographyScope: 'Tamil Nadu',
    // Deliberately overdue so Screen T20 and A05 have a genuine stale case.
    reviewInDays: -18,
    verifiedDaysAgo: 400,
  },
  {
    key: 'verified_curator',
    name: 'Curated hidden-gem field notes',
    issuingAuthority: 'Dream Destination verification team (demonstration record)',
    sourceUrl: null,
    geographyScope: 'Pilot region',
    reviewInDays: 150,
    verifiedDaysAgo: 30,
  },
  {
    key: 'owner_declared',
    name: 'Business owner declared details',
    issuingAuthority: 'Listed business owners (demonstration record)',
    sourceUrl: null,
    geographyScope: 'Pilot region',
    reviewInDays: 60,
    verifiedDaysAgo: 17,
  },
  {
    key: 'crowd_sensor',
    name: 'Gate counter feed',
    issuingAuthority: 'Site ticketing counters (demonstration record)',
    sourceUrl: null,
    geographyScope: 'Selected pilot places',
    reviewInDays: 30,
    verifiedDaysAgo: 0,
  },
  {
    key: 'crowd_checkin',
    name: 'Aggregated traveller check-ins',
    issuingAuthority: 'Opt-in Dream Destination travellers (demonstration record)',
    sourceUrl: null,
    geographyScope: 'Pilot region',
    reviewInDays: 30,
    verifiedDaysAgo: 0,
  },
];

export async function seedSources(tx: Sql): Promise<Record<SourceKey, string>> {
  const ids = {} as Record<SourceKey, string>;

  for (const source of SOURCES) {
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO source_records (
        name, source_type, source_url, issuing_authority, geography_scope,
        collected_at, verified_at, review_due_at, metadata
      ) VALUES (
        ${source.name},
        'seeded_demo',
        ${source.sourceUrl},
        ${source.issuingAuthority},
        ${source.geographyScope},
        now() - make_interval(days => ${source.verifiedDaysAgo}),
        now() - make_interval(days => ${source.verifiedDaysAgo}),
        now() + make_interval(days => ${source.reviewInDays}),
        ${tx.json({ seedKey: source.key, demonstrationData: true })}
      )
      RETURNING id
    `;
    ids[source.key] = row.id;
  }

  return ids;
}
