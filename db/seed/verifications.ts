import type { SeedSql } from './types';
import type { PlaceIds } from './places';
import { PLACES } from './places';
import type { UserKey } from './users';

/**
 * Hidden-gem verifications. PRD Part II §17 asks for 10-20 approved hidden
 * gems; the seed also leaves one under review and one expired so Screens A02,
 * A03 and the expiry rule have genuine material rather than a happy path only.
 *
 * Each checklist covers the nine content groups Screen T11 requires.
 */

type ChecklistSeed = {
  accessAndRoad: string;
  mobileNetwork: string;
  operatingDaylight: string;
  weatherSeason: string;
  emergencyAccess: string;
  nearestMedical: string;
  capacityEnvironment: string;
  permitsCulture: string;
  limitations: string[];
};

const CHECKLISTS: Record<string, ChecklistSeed> = {
  'mukurthi-trail': {
    accessAndRoad: 'Tar road to Upper Bhavani, then a forest track. Four-wheel drive advised after rain.',
    mobileNetwork: 'No reliable coverage beyond the check post. Assume you are out of contact for the whole walk.',
    operatingDaylight: 'Gates open 07:00 and close 15:00. Walkers must be back at the check post before closing.',
    weatherSeason: 'Closed during the south-west monsoon and on days with a fire-risk warning.',
    emergencyAccess: 'Nearest vehicle access point is the check post. Evacuation on foot would take over two hours.',
    nearestMedical: 'Primary Health Centre, Pykara, roughly 38 km by road.',
    capacityEnvironment: 'Daily visitor cap set by the Wildlife Warden. Grassland is fire-sensitive and slow to recover.',
    permitsCulture: 'Permit required in advance. No open flames, no plastic, no drones.',
    limitations: [
      'Mobile coverage is unavailable for the entire walk. Download your trip pack before leaving.',
      'Sustained walking over uneven grassland. Not suitable for limited mobility.',
      'Entry is refused without a permit obtained in advance.',
    ],
  },
  'avalanche-lake': {
    accessAndRoad: 'Narrow forest road from Emerald with passing places. Private vehicles restricted past the gate.',
    mobileNetwork: 'Patchy coverage near the gate, none at the lake.',
    operatingDaylight: 'Entry 08:00 to 16:00. The valley loses light early.',
    weatherSeason: 'Road is prone to landslip between June and September.',
    emergencyAccess: 'Forest department vehicles are the only reliable transport past the gate.',
    nearestMedical: 'Primary Health Centre, Pykara, roughly 30 km.',
    capacityEnvironment: 'Shola regeneration area. Stay on the road and do not enter the plantation.',
    permitsCulture: 'Entry ticket and vehicle permit issued at the gate.',
    limitations: [
      'Mobile coverage becomes unreliable during the final stretch of road.',
      'Private vehicles are not allowed past the forest gate.',
    ],
  },
  'emerald-lake-village': {
    accessAndRoad: 'Tar road throughout, with a short gravel section near the shoreline.',
    mobileNetwork: 'Usable coverage in the village, weak at the reservoir edge.',
    operatingDaylight: 'Open through daylight hours. Best light for birding is before 09:00.',
    weatherSeason: 'Shoreline path floods in heavy rain.',
    emergencyAccess: 'Village road is passable by ambulance.',
    nearestMedical: 'Primary Health Centre, Pykara, roughly 18 km.',
    capacityEnvironment: 'Working village. Parking is limited to the marked area.',
    permitsCulture: 'No permit needed. Ask before photographing residents or homes.',
    limitations: ['The shoreline path becomes muddy and slippery after rain.'],
  },
  'sandynalla-viewpoint': {
    accessAndRoad: 'Estate road with a gravel final two kilometres. Low-clearance cars will struggle after rain.',
    mobileNetwork: 'Coverage becomes unreliable during the final 2 km.',
    operatingDaylight: 'Daylight only. There is no lighting and the track is unlit.',
    weatherSeason: 'The track is not maintained during the monsoon.',
    emergencyAccess: 'Nearest metalled road is 2 km away. Vehicle recovery would be slow.',
    nearestMedical: 'Government Headquarters Hospital, Ooty, roughly 14 km.',
    capacityEnvironment: 'Small informal parking area for about four vehicles.',
    permitsCulture: 'Estate land. Stay on the track and do not enter the tea sections.',
    limitations: [
      'Mobile coverage becomes unreliable during the final 2 km. Download your trip pack before leaving.',
      'The final approach is an unmade track and is not suitable for low-clearance vehicles.',
      'There is no lighting. Do not plan to return after dark.',
    ],
  },
  'droog-fort-trail': {
    accessAndRoad: 'Road to the trailhead at Nadugani, then a 4 km footpath.',
    mobileNetwork: 'Intermittent along the ridge, none in the ravine.',
    operatingDaylight: 'Start before 09:00 to return in daylight.',
    weatherSeason: 'The path is slippery and leech-prone through the monsoon.',
    emergencyAccess: 'Stretcher evacuation only from the upper section.',
    nearestMedical: 'Lawley Hospital, Coonoor, roughly 16 km.',
    capacityEnvironment: 'Narrow path through shola. Walk single file and do not cut corners.',
    permitsCulture: 'No permit, but a local guide is strongly advised. The fort ruin is unprotected.',
    limitations: [
      'Steep, unmarked sections. A local guide is strongly advised.',
      'Leeches are common between June and September.',
    ],
  },
  'nilgiri-toda-settlement': {
    accessAndRoad: 'Tar road to within 200 m of the hamlet.',
    mobileNetwork: 'Reliable coverage.',
    operatingDaylight: 'Visits by prior arrangement between 09:30 and 16:00, not on Sundays.',
    weatherSeason: 'No seasonal restriction.',
    emergencyAccess: 'Ambulance access to the road head.',
    nearestMedical: 'Lawley Hospital, Coonoor, roughly 8 km.',
    capacityEnvironment: 'A living settlement, not a display. Groups are limited to six.',
    permitsCulture: 'Visits must be arranged in advance with the community. Ask before photographing anyone or any home.',
    limitations: [
      'This is a living settlement. Visits must be arranged in advance and may be declined.',
      'Photography of people and homes requires explicit consent.',
    ],
  },
  'hidden-valley-tea-walk': {
    accessAndRoad: 'Estate road, then marked footpaths through working sections.',
    mobileNetwork: 'Usable along most of the route.',
    operatingDaylight: 'Daylight hours. Sections are sprayed on notified days and closed then.',
    weatherSeason: 'Paths are slippery after rain.',
    emergencyAccess: 'Estate vehicles can reach most of the route.',
    nearestMedical: 'Lawley Hospital, Coonoor, roughly 10 km.',
    capacityEnvironment: 'Working farmland. Do not pick leaf or enter closed sections.',
    permitsCulture: 'Walk with estate permission. Gates must be left as found.',
    limitations: ['Sections close without notice on spraying days.'],
  },
  'nirar-dam-road': {
    accessAndRoad: 'Metalled estate road throughout.',
    mobileNetwork: 'Weak and intermittent across the plateau.',
    operatingDaylight: 'Best between 06:00 and 10:00. Wildlife movement is highest at first light.',
    weatherSeason: 'Fog reduces visibility sharply in the early morning through the wet months.',
    emergencyAccess: 'Estate and forest vehicles pass regularly during working hours.',
    nearestMedical: 'Government Hospital, Valparai, roughly 9 km.',
    capacityEnvironment: 'Lion-tailed macaque habitat. Remain in the vehicle and keep noise down.',
    permitsCulture: 'No permit. Feeding animals is an offence.',
    limitations: [
      'Viewing is from the vehicle only. Do not leave food or approach animals.',
      'Mobile coverage is weak across the plateau.',
    ],
  },
  'chinnakallar-falls': {
    accessAndRoad: 'Estate roads with a rough final kilometre.',
    mobileNetwork: 'No coverage at the falls.',
    operatingDaylight: 'Open 09:00 to 16:00 when conditions allow.',
    weatherSeason: 'One of the wettest pockets in the region. Access is restricted during heavy rain.',
    emergencyAccess: 'Nearest vehicle access is the estate road head.',
    nearestMedical: 'Government Hospital, Valparai, roughly 20 km.',
    capacityEnvironment: 'Rock surfaces are permanently wet and slippery.',
    permitsCulture: 'Entry ticket at the gate. Bathing is not permitted in high flow.',
    limitations: [
      'Access is restricted during heavy rainfall and landslide warnings.',
      'Rock surfaces stay wet and slippery even in dry weather.',
      'There is no mobile coverage at the falls.',
    ],
  },
  'grass-hills-viewpoint': {
    accessAndRoad: 'Forest road, permit-controlled. Gate closed outside notified hours.',
    mobileNetwork: 'No coverage beyond the gate.',
    operatingDaylight: 'Entry 07:00 to 14:00, closed Mondays.',
    weatherSeason: 'Closed during the monsoon and on fire-risk days.',
    emergencyAccess: 'Forest department escort accompanies permitted vehicles.',
    nearestMedical: 'Government Hospital, Valparai, roughly 28 km.',
    capacityEnvironment: 'Daily vehicle quota. Shola-grassland mosaic is highly fire-sensitive.',
    permitsCulture: 'Permit must be arranged in advance with the range office.',
    limitations: [
      'Daily visitor numbers are capped. Permits must be arranged in advance.',
      'No mobile coverage beyond the gate.',
      'Closed on Mondays and during the monsoon.',
    ],
  },
  'koolangal-river-walk': {
    accessAndRoad: 'Short walk from the estate road, no vehicle access to the river.',
    mobileNetwork: 'Weak but usable.',
    operatingDaylight: 'Daylight hours.',
    weatherSeason: 'River level rises quickly after rain upstream.',
    emergencyAccess: 'Road head is within 300 m.',
    nearestMedical: 'Government Hospital, Valparai, roughly 4 km.',
    capacityEnvironment: 'Used by residents. Keep the riverbank clear and quiet.',
    permitsCulture: 'No permit. This is a local space rather than a visitor attraction.',
    limitations: ['River level can rise quickly after rain upstream.'],
  },
  'vaidehi-falls': {
    accessAndRoad: 'Road to Narasipuram, then a 1.5 km forest walk.',
    mobileNetwork: 'Coverage drops on the approach walk.',
    operatingDaylight: 'Entry 08:00 to 16:30.',
    weatherSeason: 'Seasonal fall. Little or no water outside the wet months.',
    emergencyAccess: 'Foot evacuation to the road head.',
    nearestMedical: 'Coimbatore Medical College Hospital, roughly 32 km.',
    capacityEnvironment: 'Elephant movement area. Do not visit at dusk.',
    permitsCulture: 'Entry ticket at the check post.',
    limitations: [
      'This is a seasonal fall with little water outside the wet months.',
      'Elephant movement area. Do not stay past late afternoon.',
    ],
  },
  'vov-textile-mill-walk': {
    accessAndRoad: 'City streets throughout, level but with uneven pavements.',
    mobileNetwork: 'Full coverage.',
    operatingDaylight: 'Walks run 08:00 to 11:00, not on Sundays.',
    weatherSeason: 'Runs year round. Hot between March and May.',
    emergencyAccess: 'Full city access throughout.',
    nearestMedical: 'Coimbatore Medical College Hospital, roughly 3 km.',
    capacityEnvironment: 'Groups limited to twelve. Some mills are private and viewed from outside.',
    permitsCulture: 'Ask before photographing workers. Several sites do not allow interior photography.',
    limitations: ['Pavements are uneven in places.', 'Several mills are viewed from the street only.'],
  },
  'ukkadam-market-walk': {
    accessAndRoad: 'City road access. The market floor is wet and uneven.',
    mobileNetwork: 'Full coverage.',
    operatingDaylight: 'Trading runs 05:00 to 08:00. Later visits see the clean-up, not the market.',
    weatherSeason: 'Year round.',
    emergencyAccess: 'Full city access.',
    nearestMedical: 'Coimbatore Medical College Hospital, roughly 4 km.',
    capacityEnvironment: 'A working wholesale market. Keep clear of loading lanes.',
    permitsCulture: 'Ask traders before photographing them or their stalls.',
    limitations: [
      'The market floor is wet and uneven underfoot.',
      'Crowded during trading hours, with vehicles loading throughout.',
    ],
  },
  'black-thunder-road-craft': {
    accessAndRoad: 'Roadside access on the Mettupalayam road.',
    mobileNetwork: 'Full coverage.',
    operatingDaylight: 'Working hours 09:00 to 17:00, closed Sundays.',
    weatherSeason: 'Firing is suspended in heavy rain.',
    emergencyAccess: 'Full road access.',
    nearestMedical: 'Coimbatore Medical College Hospital, roughly 11 km.',
    capacityEnvironment: 'A working yard with open kilns. Keep children close.',
    permitsCulture: 'Ask before photographing potters at work.',
    limitations: ['This is a working yard with open kilns and hot surfaces.'],
  },
  'kurudi-malai-sunrise': {
    accessAndRoad: 'Road to the base, then a 40-minute climb on a rough path.',
    mobileNetwork: 'Weak at the summit.',
    operatingDaylight: 'Climb before dawn, descend by 09:00.',
    weatherSeason: 'Path is slippery after rain.',
    emergencyAccess: 'Foot evacuation only from the upper path.',
    nearestMedical: 'Coimbatore Medical College Hospital, roughly 18 km.',
    capacityEnvironment: 'Unmanaged site with no facilities. Carry water and carry waste out.',
    permitsCulture: 'No permit. Respect the small shrine at the summit.',
    limitations: [
      'There are no facilities, lighting or water at any point on the route.',
      'The path is rough and is climbed in the dark for sunrise.',
    ],
  },
};

/** Left under review on purpose, so the A02 queue is not empty. */
const UNDER_REVIEW = ['koolangal-river-walk'];

/** Expired on purpose, so the gate and Screen A05 have a real case. */
const EXPIRED = ['vaidehi-falls'];

export async function seedVerifications(
  tx: SeedSql,
  placeIds: PlaceIds,
  userIds: Record<UserKey, string>,
): Promise<void> {
  const hiddenGems = PLACES.filter((place) => place.isHiddenGem === true);

  for (const place of hiddenGems) {
    const checklist = CHECKLISTS[place.slug];
    if (checklist === undefined) continue;

    const isUnderReview = UNDER_REVIEW.includes(place.slug);
    const status = isUnderReview ? 'under_review' : 'approved';

    // The expired case stays 'approved' in storage with a past expiry date, so
    // the domain gate has to catch it rather than the seed doing it for us.
    const expiryDays = EXPIRED.includes(place.slug) ? -21 : 180;

    const checklistJson = {
      access_and_road: { value: checklist.accessAndRoad, checked: true },
      mobile_network: { value: checklist.mobileNetwork, checked: true },
      operating_daylight: { value: checklist.operatingDaylight, checked: true },
      weather_season: { value: checklist.weatherSeason, checked: true },
      emergency_access: { value: checklist.emergencyAccess, checked: true },
      nearest_medical: { value: checklist.nearestMedical, checked: true },
      capacity_environment: { value: checklist.capacityEnvironment, checked: true },
      permits_culture: { value: checklist.permitsCulture, checked: true },
      reviewer: {
        value: 'District tourism office field check (demonstration record)',
        checked: true,
      },
    };

    await tx`
      INSERT INTO hidden_gem_verifications (
        place_id, status, checklist, known_limitations,
        reviewer_user_id, reviewed_at, expires_at, decision_reason, version
      ) VALUES (
        ${placeIds[place.slug]},
        ${status},
        ${tx.json(checklistJson)},
        ${tx.array(checklist.limitations)},
        ${isUnderReview ? null : userIds.verifier},
        ${isUnderReview ? null : tx`now() - interval '100 days'`},
        now() + make_interval(days => ${expiryDays}),
        ${isUnderReview ? null : 'Demonstration record: field check completed and limitations recorded.'},
        1
      )
    `;
  }
}
