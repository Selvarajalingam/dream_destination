import type { Sql } from 'postgres';
import type { SourceKey } from './sources';

/**
 * Help facilities for Screen T18. PRD Part II §17 asks for 10-20.
 *
 * Nothing here claims live availability: the offline behaviour in T18 states
 * that cached numbers are shown and that live availability is unknown.
 */

type FacilitySeed = {
  name: string;
  facilityType: 'hospital' | 'pharmacy' | 'police' | 'tourist_assistance' | 'fuel' | 'ev_charging' | 'forest_office';
  lat: number;
  lng: number;
  phone: string;
  alwaysOpen: boolean;
  source: SourceKey;
};

/** National emergency number, shown at the top of Nearby Help. */
export const NATIONAL_EMERGENCY_NUMBER = '112';

export const HELP_FACILITIES: FacilitySeed[] = [
  { name: 'Government Headquarters Hospital, Ooty', facilityType: 'hospital', lat: 11.4088, lng: 76.7011, phone: '+914232442212', alwaysOpen: true, source: 'health_department' },
  { name: 'Lawley Hospital, Coonoor', facilityType: 'hospital', lat: 11.3506, lng: 76.7889, phone: '+914232231252', alwaysOpen: true, source: 'health_department' },
  { name: 'Government Hospital, Valparai', facilityType: 'hospital', lat: 10.3253, lng: 76.9525, phone: '+914253222252', alwaysOpen: true, source: 'health_department' },
  { name: 'Coimbatore Medical College Hospital', facilityType: 'hospital', lat: 11.0069, lng: 76.9422, phone: '+914222301393', alwaysOpen: true, source: 'health_department' },
  { name: 'Primary Health Centre, Pykara', facilityType: 'hospital', lat: 11.4611, lng: 76.5678, phone: '+914232251100', alwaysOpen: false, source: 'health_department' },
  { name: 'Nilgiris Medical Store, Ooty', facilityType: 'pharmacy', lat: 11.4098, lng: 76.6961, phone: '+914232443311', alwaysOpen: false, source: 'health_department' },
  { name: 'Coonoor Pharmacy, Bedford', facilityType: 'pharmacy', lat: 11.3533, lng: 76.7947, phone: '+914232232244', alwaysOpen: false, source: 'health_department' },
  { name: 'Valparai Medicals', facilityType: 'pharmacy', lat: 10.3269, lng: 76.9544, phone: '+914253223366', alwaysOpen: false, source: 'health_department' },
  { name: 'Gandhipuram Pharmacy, Coimbatore', facilityType: 'pharmacy', lat: 11.0175, lng: 76.9664, phone: '+914222522244', alwaysOpen: true, source: 'health_department' },
  { name: 'Ooty Town Police Station', facilityType: 'police', lat: 11.4114, lng: 76.6947, phone: '+914232443100', alwaysOpen: true, source: 'police_department' },
  { name: 'Coonoor Police Station', facilityType: 'police', lat: 11.3544, lng: 76.7953, phone: '+914232231100', alwaysOpen: true, source: 'police_department' },
  { name: 'Valparai Police Station', facilityType: 'police', lat: 10.3261, lng: 76.9531, phone: '+914253222100', alwaysOpen: true, source: 'police_department' },
  { name: 'Race Course Police Station, Coimbatore', facilityType: 'police', lat: 11.0033, lng: 76.9708, phone: '+914222222100', alwaysOpen: true, source: 'police_department' },
  { name: 'Tourist Information Centre, Ooty', facilityType: 'tourist_assistance', lat: 11.4079, lng: 76.6964, phone: '+914232443977', alwaysOpen: false, source: 'district_tourism' },
  { name: 'Tourist Information Centre, Coimbatore', facilityType: 'tourist_assistance', lat: 11.0022, lng: 76.9661, phone: '+914222302311', alwaysOpen: false, source: 'district_tourism' },
  { name: 'Forest Range Office, Valparai', facilityType: 'forest_office', lat: 10.3247, lng: 76.9511, phone: '+914253222444', alwaysOpen: false, source: 'forest_department' },
  { name: 'Forest Range Office, Mukurthi', facilityType: 'forest_office', lat: 11.2211, lng: 76.5211, phone: '+914232444555', alwaysOpen: false, source: 'forest_department' },
  { name: 'Fuel Station, Ghat Road Km 18', facilityType: 'fuel', lat: 11.3778, lng: 76.7419, phone: '+914232445566', alwaysOpen: true, source: 'district_tourism' },
  { name: 'Fuel Station, Aliyar Junction', facilityType: 'fuel', lat: 10.4889, lng: 76.9689, phone: '+914253224477', alwaysOpen: true, source: 'district_tourism' },
  { name: 'EV Charging Point, Coimbatore Race Course', facilityType: 'ev_charging', lat: 11.0039, lng: 76.9706, phone: '+914222300088', alwaysOpen: true, source: 'municipal_corporation' },
];

export async function seedHelpFacilities(
  tx: Sql,
  sourceIds: Record<SourceKey, string>,
): Promise<void> {
  for (const facility of HELP_FACILITIES) {
    const hours = facility.alwaysOpen
      ? { all: ['00:00', '23:59'], note: 'Reported as staffed around the clock' }
      : { all: ['09:00', '17:00'], note: 'Reported daytime hours; confirm before travelling' };

    await tx`
      INSERT INTO help_facilities (
        name, facility_type, location, contact, operating_hours,
        source_id, verified_at, review_due_at, status
      ) VALUES (
        ${facility.name}, ${facility.facilityType},
        ST_SetSRID(ST_MakePoint(${facility.lng}, ${facility.lat}), 4326)::geography,
        ${tx.json({ phone: facility.phone, emergency: NATIONAL_EMERGENCY_NUMBER })},
        ${tx.json(hours)},
        ${sourceIds[facility.source]},
        now() - interval '9 days',
        now() + interval '45 days',
        'active'
      )
    `;
  }
}
