import type { Sql } from 'postgres';
import type { DestinationKey } from './destinations';
import type { SourceKey } from './sources';

/**
 * Attractions and hidden gems across the pilot geography. PRD Part II §17
 * asks for 25-50 attractions and 10-20 hidden gems.
 *
 * Opening hours are stored as a seven-day map of [open, close] in local time,
 * with null meaning closed that day, so the itinerary conflict detector has
 * something real to check against.
 */

export type PlaceKey = string;

type Hours = Partial<Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', [string, string] | null>>;

const daily = (open: string, close: string): Hours => ({
  mon: [open, close], tue: [open, close], wed: [open, close],
  thu: [open, close], fri: [open, close], sat: [open, close], sun: [open, close],
});

const closedOn = (day: keyof Hours, open: string, close: string): Hours => ({
  ...daily(open, close),
  [day]: null,
});

type PlaceSeed = {
  slug: string;
  name: string;
  destination: DestinationKey;
  category: string;
  description: string;
  lat: number;
  lng: number;
  hours: Hours;
  visitMinutes: number;
  priceLowInr: number;
  priceHighInr: number;
  accessibility: {
    stepFreeEntry: boolean;
    lowWalking: boolean;
    accessibleToilet: boolean;
    note?: string;
  };
  isHiddenGem?: boolean;
  /** Which source backs this record's hours, price and access fields. */
  source: SourceKey;
  /** A known seasonal or weather closure, surfaced as a T09 conflict. */
  closureNote?: string;
};

export const PLACES: PlaceSeed[] = [
  // --- Ooty and the Nilgiris ---
  {
    slug: 'ooty-botanical-garden',
    name: 'Government Botanical Garden',
    destination: 'ooty',
    category: 'garden',
    description:
      'Terraced garden laid out in 1848 across 22 hectares, with an Italian-style section, a fossil tree trunk and glasshouses.',
    lat: 11.4155, lng: 76.7076,
    hours: daily('07:00', '18:30'),
    visitMinutes: 120, priceLowInr: 30, priceHighInr: 80,
    accessibility: { stepFreeEntry: true, lowWalking: false, accessibleToilet: true, note: 'Paths are paved but the upper terraces are steep.' },
    source: 'district_tourism',
  },
  {
    slug: 'ooty-lake',
    name: 'Ooty Lake',
    destination: 'ooty',
    category: 'lake',
    description: 'Artificial lake created in 1824, now a boating and promenade area at the edge of the town.',
    lat: 11.4022, lng: 76.6869,
    hours: daily('09:00', '18:00'),
    visitMinutes: 75, priceLowInr: 20, priceHighInr: 400,
    accessibility: { stepFreeEntry: true, lowWalking: true, accessibleToilet: true },
    source: 'district_tourism',
  },
  {
    slug: 'doddabetta-peak',
    name: 'Doddabetta Peak',
    destination: 'ooty',
    category: 'viewpoint',
    description: 'The highest point in the Nilgiris at 2,637 m, with a telescope house and views across the plateau.',
    lat: 11.4004, lng: 76.7356,
    hours: daily('07:00', '18:00'),
    visitMinutes: 60, priceLowInr: 15, priceHighInr: 50,
    accessibility: { stepFreeEntry: false, lowWalking: false, accessibleToilet: false, note: 'Steps from the car park to the viewing platform.' },
    source: 'district_tourism',
    closureNote: 'Views are often lost to cloud between June and August.',
  },
  {
    slug: 'rose-garden-ooty',
    name: 'Centenary Rose Park',
    destination: 'ooty',
    category: 'garden',
    description: 'Terraced rose garden holding over 2,000 varieties, laid out on the slopes of Elk Hill.',
    lat: 11.4093, lng: 76.7009,
    hours: daily('08:00', '18:00'),
    visitMinutes: 60, priceLowInr: 30, priceHighInr: 60,
    accessibility: { stepFreeEntry: false, lowWalking: false, accessibleToilet: true, note: 'The garden is built on terraces with steps between levels.' },
    source: 'district_tourism',
  },
  {
    slug: 'nilgiri-mountain-railway',
    name: 'Nilgiri Mountain Railway (Ooty station)',
    destination: 'ooty',
    category: 'heritage_transport',
    description: 'UNESCO-listed metre-gauge rack railway running between Mettupalayam and Ooty since 1908.',
    lat: 11.4064, lng: 76.6932,
    hours: daily('06:00', '18:00'),
    visitMinutes: 90, priceLowInr: 30, priceHighInr: 600,
    accessibility: { stepFreeEntry: false, lowWalking: true, accessibleToilet: true, note: 'Carriage access involves steps; assistance can be requested at the station.' },
    source: 'transport_corporation',
  },
  {
    slug: 'st-stephens-church',
    name: "St Stephen's Church",
    destination: 'ooty',
    category: 'heritage',
    description: 'Built in 1829 with timber carried from Tipu Sultan’s palace at Srirangapatna.',
    lat: 11.4125, lng: 76.6944,
    hours: daily('09:00', '17:00'),
    visitMinutes: 40, priceLowInr: 0, priceHighInr: 0,
    accessibility: { stepFreeEntry: true, lowWalking: true, accessibleToilet: false },
    source: 'archaeological_survey',
  },
  {
    slug: 'tea-museum-ooty',
    name: 'Tea Factory and Museum',
    destination: 'ooty',
    category: 'museum',
    description: 'Working tea factory with a guided view of withering, rolling, fermenting and drying.',
    lat: 11.4276, lng: 76.7255,
    hours: daily('09:00', '18:00'),
    visitMinutes: 60, priceLowInr: 20, priceHighInr: 40,
    accessibility: { stepFreeEntry: true, lowWalking: true, accessibleToilet: true },
    source: 'district_tourism',
  },
  {
    slug: 'pykara-falls',
    name: 'Pykara Falls and Boathouse',
    destination: 'ooty',
    category: 'waterfall',
    description: 'Falls and a reservoir boathouse set within a shola and grassland landscape 19 km from Ooty.',
    lat: 11.4633, lng: 76.5644,
    hours: daily('08:30', '17:30'),
    visitMinutes: 90, priceLowInr: 25, priceHighInr: 350,
    accessibility: { stepFreeEntry: false, lowWalking: false, accessibleToilet: false, note: 'A stepped path leads down to the falls viewpoint.' },
    source: 'forest_department',
    closureNote: 'The falls path can close after heavy rain between June and September.',
  },
  {
    slug: 'mukurthi-trail',
    name: 'Mukurthi National Park trail',
    destination: 'ooty',
    category: 'trek',
    description: 'Permit-controlled grassland and shola trail in Nilgiri tahr habitat, entered from Upper Bhavani.',
    lat: 11.2167, lng: 76.5167,
    hours: closedOn('mon', '07:00', '15:00'),
    visitMinutes: 240, priceLowInr: 150, priceHighInr: 900,
    accessibility: { stepFreeEntry: false, lowWalking: false, accessibleToilet: false, note: 'Sustained walking over uneven grassland. Not suitable for limited mobility.' },
    isHiddenGem: true,
    source: 'forest_department',
    closureNote: 'Closed during the south-west monsoon and on fire-risk days.',
  },
  {
    slug: 'avalanche-lake',
    name: 'Avalanche Lake',
    destination: 'ooty',
    category: 'lake',
    description: 'Reservoir in a shola valley 28 km from Ooty, reached by a forest road with restricted vehicle entry.',
    lat: 11.2833, lng: 76.5667,
    hours: daily('08:00', '16:00'),
    visitMinutes: 150, priceLowInr: 100, priceHighInr: 500,
    accessibility: { stepFreeEntry: false, lowWalking: false, accessibleToilet: false },
    isHiddenGem: true,
    source: 'forest_department',
  },
  {
    slug: 'emerald-lake-village',
    name: 'Emerald Lake and village',
    destination: 'ooty',
    category: 'lake',
    description: 'Quiet reservoir among tea slopes, with a small Badaga village and birding along the shoreline.',
    lat: 11.3186, lng: 76.6117,
    hours: daily('07:00', '18:00'),
    visitMinutes: 90, priceLowInr: 0, priceHighInr: 50,
    accessibility: { stepFreeEntry: true, lowWalking: true, accessibleToilet: false },
    isHiddenGem: true,
    source: 'verified_curator',
  },
  {
    slug: 'sandynalla-viewpoint',
    name: 'Sandynalla reservoir viewpoint',
    destination: 'ooty',
    category: 'viewpoint',
    description: 'Little-visited reservoir viewpoint below Ooty, approached along a gravel estate track.',
    lat: 11.3492, lng: 76.6403,
    hours: daily('07:30', '17:00'),
    visitMinutes: 60, priceLowInr: 0, priceHighInr: 0,
    accessibility: { stepFreeEntry: false, lowWalking: false, accessibleToilet: false, note: 'The final approach is an unmade track.' },
    isHiddenGem: true,
    source: 'verified_curator',
  },

  // --- Coonoor Valley ---
  {
    slug: 'sims-park',
    name: 'Sim’s Park',
    destination: 'coonoor',
    category: 'garden',
    description: 'Botanical park laid out in 1874 on a natural ravine, with over 1,000 plant species.',
    lat: 11.3548, lng: 76.7959,
    hours: daily('08:00', '18:30'),
    visitMinutes: 90, priceLowInr: 30, priceHighInr: 60,
    accessibility: { stepFreeEntry: true, lowWalking: false, accessibleToilet: true, note: 'Built into a ravine; the lower sections involve steps.' },
    source: 'district_tourism',
  },
  {
    slug: 'dolphins-nose',
    name: "Dolphin's Nose viewpoint",
    destination: 'coonoor',
    category: 'viewpoint',
    description: 'Cliff viewpoint over the Catherine Falls gorge and the plains beyond, 12 km from Coonoor.',
    lat: 11.3363, lng: 76.8508,
    hours: daily('07:00', '18:00'),
    visitMinutes: 60, priceLowInr: 10, priceHighInr: 30,
    accessibility: { stepFreeEntry: false, lowWalking: false, accessibleToilet: false },
    source: 'district_tourism',
    closureNote: 'The view is frequently lost to mist in the afternoon.',
  },
  {
    slug: 'lambs-rock',
    name: "Lamb's Rock",
    destination: 'coonoor',
    category: 'viewpoint',
    description: 'Forested viewpoint over the Coimbatore plains, on the road to Dolphin’s Nose.',
    lat: 11.3444, lng: 76.8369,
    hours: daily('07:00', '18:00'),
    visitMinutes: 45, priceLowInr: 10, priceHighInr: 20,
    accessibility: { stepFreeEntry: false, lowWalking: true, accessibleToilet: false },
    source: 'district_tourism',
  },
  {
    slug: 'highfield-tea-factory',
    name: 'Highfield Tea Factory',
    destination: 'coonoor',
    category: 'tea_factory',
    description: 'Working estate factory offering a short guided walk through processing and tasting.',
    lat: 11.3639, lng: 76.7889,
    hours: closedOn('sun', '09:00', '17:30'),
    visitMinutes: 60, priceLowInr: 0, priceHighInr: 100,
    accessibility: { stepFreeEntry: true, lowWalking: true, accessibleToilet: true },
    source: 'district_tourism',
  },
  {
    slug: 'catherine-falls',
    name: 'Catherine Falls',
    destination: 'coonoor',
    category: 'waterfall',
    description: 'Two-stepped fall of about 250 feet, seen from a viewpoint above Kotagiri road.',
    lat: 11.4108, lng: 76.8694,
    hours: daily('08:00', '17:00'),
    visitMinutes: 60, priceLowInr: 0, priceHighInr: 30,
    accessibility: { stepFreeEntry: false, lowWalking: false, accessibleToilet: false },
    source: 'forest_department',
  },
  {
    slug: 'droog-fort-trail',
    name: 'Droog Fort trail',
    destination: 'coonoor',
    category: 'trek',
    description: 'Four-kilometre walk through shola forest to a ruined hill fort used by Tipu Sultan.',
    lat: 11.3167, lng: 76.7667,
    hours: daily('07:00', '15:00'),
    visitMinutes: 210, priceLowInr: 0, priceHighInr: 600,
    accessibility: { stepFreeEntry: false, lowWalking: false, accessibleToilet: false, note: 'Steep, unmarked sections. A local guide is strongly advised.' },
    isHiddenGem: true,
    source: 'verified_curator',
  },
  {
    slug: 'kotagiri-kodanad',
    name: 'Kodanad viewpoint, Kotagiri',
    destination: 'coonoor',
    category: 'viewpoint',
    description: 'Viewpoint where the Moyar valley meets the Nilgiri and Talamalai ranges, with tea slopes below.',
    lat: 11.4747, lng: 76.9022,
    hours: daily('06:30', '18:00'),
    visitMinutes: 60, priceLowInr: 0, priceHighInr: 20,
    accessibility: { stepFreeEntry: true, lowWalking: true, accessibleToilet: false },
    source: 'district_tourism',
  },
  {
    slug: 'nilgiri-toda-settlement',
    name: 'Toda settlement interpretation walk',
    destination: 'coonoor',
    category: 'cultural',
    description: 'Guided visit to a Toda hamlet, with barrel-vaulted houses and embroidery work, by prior arrangement.',
    lat: 11.3694, lng: 76.7722,
    hours: closedOn('sun', '09:30', '16:00'),
    visitMinutes: 90, priceLowInr: 200, priceHighInr: 500,
    accessibility: { stepFreeEntry: false, lowWalking: true, accessibleToilet: false, note: 'Visits are by arrangement and must respect community consent.' },
    isHiddenGem: true,
    source: 'verified_curator',
  },
  {
    slug: 'hidden-valley-tea-walk',
    name: 'Hidden Valley tea estate walk',
    destination: 'coonoor',
    category: 'walk',
    description: 'Estate footpath through working tea sections with views over the Hulikal ravine.',
    lat: 11.3281, lng: 76.8111,
    hours: daily('07:00', '17:00'),
    visitMinutes: 120, priceLowInr: 0, priceHighInr: 300,
    accessibility: { stepFreeEntry: false, lowWalking: false, accessibleToilet: false },
    isHiddenGem: true,
    source: 'verified_curator',
  },

  // --- Valparai and Anamalai ---
  {
    slug: 'aliyar-reservoir',
    name: 'Aliyar Reservoir and park',
    destination: 'valparai',
    category: 'lake',
    description: 'Reservoir at the foot of the Valparai ghat road, with a park, aquarium and boating.',
    lat: 10.4833, lng: 76.9667,
    hours: daily('09:00', '17:30'),
    visitMinutes: 90, priceLowInr: 20, priceHighInr: 200,
    accessibility: { stepFreeEntry: true, lowWalking: true, accessibleToilet: true },
    source: 'district_tourism',
  },
  {
    slug: 'monkey-falls',
    name: 'Monkey Falls',
    destination: 'valparai',
    category: 'waterfall',
    description: 'Roadside fall on the Aliyar to Valparai ghat, inside the Anamalai Tiger Reserve buffer.',
    lat: 10.5033, lng: 76.9283,
    hours: daily('09:00', '17:00'),
    visitMinutes: 60, priceLowInr: 20, priceHighInr: 50,
    accessibility: { stepFreeEntry: false, lowWalking: false, accessibleToilet: true },
    source: 'forest_department',
    closureNote: 'Bathing is closed during high flow in the monsoon months.',
  },
  {
    slug: 'sholayar-dam-view',
    name: 'Sholayar Dam viewpoint',
    destination: 'valparai',
    category: 'viewpoint',
    description: 'One of the deepest dams in Asia, viewed from the Valparai side across rainforest slopes.',
    lat: 10.3167, lng: 76.7833,
    hours: daily('08:00', '17:00'),
    visitMinutes: 60, priceLowInr: 0, priceHighInr: 30,
    accessibility: { stepFreeEntry: true, lowWalking: true, accessibleToilet: false },
    source: 'district_tourism',
  },
  {
    slug: 'nirar-dam-road',
    name: 'Nirar Dam road wildlife drive',
    destination: 'valparai',
    category: 'wildlife',
    description: 'Quiet estate road through lion-tailed macaque habitat, best at first light.',
    lat: 10.3053, lng: 76.9111,
    hours: daily('06:00', '10:00'),
    visitMinutes: 120, priceLowInr: 0, priceHighInr: 0,
    accessibility: { stepFreeEntry: true, lowWalking: true, accessibleToilet: false, note: 'Viewing is from the vehicle. Do not leave food or approach animals.' },
    isHiddenGem: true,
    source: 'forest_department',
  },
  {
    slug: 'balaji-temple-valparai',
    name: 'Balaji Temple, Valparai',
    destination: 'valparai',
    category: 'temple',
    description: 'Hilltop temple among tea estates, with views over the plateau.',
    lat: 10.3364, lng: 76.9533,
    hours: daily('06:00', '12:00'),
    visitMinutes: 45, priceLowInr: 0, priceHighInr: 0,
    accessibility: { stepFreeEntry: false, lowWalking: true, accessibleToilet: false },
    source: 'district_tourism',
  },
  {
    slug: 'chinnakallar-falls',
    name: 'Chinnakallar Falls',
    destination: 'valparai',
    category: 'waterfall',
    description: 'Fall in one of the wettest pockets in the region, 20 km from Valparai through tea estates.',
    lat: 10.3, lng: 76.85,
    hours: daily('09:00', '16:00'),
    visitMinutes: 90, priceLowInr: 0, priceHighInr: 40,
    accessibility: { stepFreeEntry: false, lowWalking: false, accessibleToilet: false },
    isHiddenGem: true,
    source: 'forest_department',
    closureNote: 'Access is restricted during heavy rainfall and landslide warnings.',
  },
  {
    slug: 'grass-hills-viewpoint',
    name: 'Grass Hills approach viewpoint',
    destination: 'valparai',
    category: 'viewpoint',
    description: 'Permit-controlled grassland edge inside Anamalai Tiger Reserve, with restricted daily numbers.',
    lat: 10.2833, lng: 77.0,
    hours: closedOn('mon', '07:00', '14:00'),
    visitMinutes: 180, priceLowInr: 250, priceHighInr: 1200,
    accessibility: { stepFreeEntry: false, lowWalking: false, accessibleToilet: false, note: 'Daily visitor numbers are capped. Permits must be arranged in advance.' },
    isHiddenGem: true,
    source: 'forest_department',
  },
  {
    slug: 'koolangal-river-walk',
    name: 'Koolangal river walk',
    destination: 'valparai',
    category: 'walk',
    description: 'Short riverside walk below the tea estates, popular with residents rather than visitors.',
    lat: 10.3419, lng: 76.9294,
    hours: daily('07:00', '17:00'),
    visitMinutes: 75, priceLowInr: 0, priceHighInr: 0,
    accessibility: { stepFreeEntry: false, lowWalking: false, accessibleToilet: false },
    isHiddenGem: true,
    source: 'verified_curator',
  },

  // --- Coimbatore City and Surrounds ---
  {
    slug: 'marudamalai-temple',
    name: 'Marudamalai Murugan Temple',
    destination: 'coimbatore',
    category: 'temple',
    description: 'Twelfth-century hill temple on the eastern slopes of the Western Ghats, reached by road or steps.',
    lat: 11.0308, lng: 76.8578,
    hours: daily('05:30', '13:00'),
    visitMinutes: 75, priceLowInr: 0, priceHighInr: 100,
    accessibility: { stepFreeEntry: true, lowWalking: true, accessibleToilet: true, note: 'A road and a lift reach the upper level; the stepped route has around 800 steps.' },
    source: 'district_tourism',
  },
  {
    slug: 'perur-pateeswarar-temple',
    name: 'Perur Pateeswarar Temple',
    destination: 'coimbatore',
    category: 'temple',
    description: 'Temple with Kongu-period stone carving and a celebrated golden hall, on the Noyyal river.',
    lat: 10.9667, lng: 76.9,
    hours: daily('06:00', '12:30'),
    visitMinutes: 60, priceLowInr: 0, priceHighInr: 0,
    accessibility: { stepFreeEntry: true, lowWalking: true, accessibleToilet: false },
    source: 'archaeological_survey',
  },
  {
    slug: 'gedee-car-museum',
    name: 'Gedee Car Museum',
    destination: 'coimbatore',
    category: 'museum',
    description: 'Collection of over sixty vehicles tracing automotive engineering from the early twentieth century.',
    lat: 11.0269, lng: 76.9472,
    hours: closedOn('mon', '09:30', '17:30'),
    visitMinutes: 90, priceLowInr: 100, priceHighInr: 200,
    accessibility: { stepFreeEntry: true, lowWalking: true, accessibleToilet: true },
    source: 'municipal_corporation',
  },
  {
    slug: 'vov-textile-mill-walk',
    name: 'Textile mill heritage walk',
    destination: 'coimbatore',
    category: 'heritage_walk',
    description: 'Guided walk through the mill district that gave Coimbatore its cotton-industry history.',
    lat: 11.0018, lng: 76.9629,
    hours: closedOn('sun', '08:00', '11:00'),
    visitMinutes: 120, priceLowInr: 200, priceHighInr: 600,
    accessibility: { stepFreeEntry: true, lowWalking: false, accessibleToilet: false },
    isHiddenGem: true,
    source: 'verified_curator',
  },
  {
    slug: 'siruvani-waterfall',
    name: 'Siruvani Waterfall',
    destination: 'coimbatore',
    category: 'waterfall',
    description: 'Fall inside a reserve forest 37 km west of the city, known for the quality of its water.',
    lat: 10.9333, lng: 76.6667,
    hours: closedOn('tue', '09:00', '16:00'),
    visitMinutes: 120, priceLowInr: 30, priceHighInr: 150,
    accessibility: { stepFreeEntry: false, lowWalking: false, accessibleToilet: false },
    source: 'forest_department',
    closureNote: 'Entry is suspended during elephant movement alerts and heavy rain.',
  },
  {
    slug: 'vaidehi-falls',
    name: 'Vaidehi Falls',
    destination: 'coimbatore',
    category: 'waterfall',
    description: 'Seasonal fall reached by a short forest walk from Narasipuram, quiet on weekdays.',
    lat: 10.9503, lng: 76.7778,
    hours: daily('08:00', '16:30'),
    visitMinutes: 120, priceLowInr: 20, priceHighInr: 60,
    accessibility: { stepFreeEntry: false, lowWalking: false, accessibleToilet: false },
    isHiddenGem: true,
    source: 'forest_department',
  },
  {
    slug: 'black-thunder-road-craft',
    name: 'Mettupalayam road pottery cluster',
    destination: 'coimbatore',
    category: 'crafts',
    description: 'Working potters’ street where terracotta is thrown and fired on site, open to short visits.',
    lat: 11.1, lng: 76.95,
    hours: closedOn('sun', '09:00', '17:00'),
    visitMinutes: 60, priceLowInr: 0, priceHighInr: 300,
    accessibility: { stepFreeEntry: true, lowWalking: true, accessibleToilet: false },
    isHiddenGem: true,
    source: 'verified_curator',
  },
  {
    slug: 'vellingiri-foothills',
    name: 'Vellingiri foothills viewpoint',
    destination: 'coimbatore',
    category: 'viewpoint',
    description: 'Foothill viewpoint below the Vellingiri range, without the full pilgrimage climb.',
    lat: 10.9364, lng: 76.7111,
    hours: daily('06:00', '18:00'),
    visitMinutes: 90, priceLowInr: 0, priceHighInr: 0,
    accessibility: { stepFreeEntry: true, lowWalking: true, accessibleToilet: false },
    source: 'district_tourism',
  },
  {
    slug: 'gass-forest-museum',
    name: 'Gass Forest Museum',
    destination: 'coimbatore',
    category: 'museum',
    description: 'One of the oldest forestry collections in the country, holding timber, fauna and colonial survey records.',
    lat: 11.0181, lng: 76.9497,
    hours: closedOn('sun', '10:00', '17:00'),
    visitMinutes: 75, priceLowInr: 20, priceHighInr: 50,
    accessibility: { stepFreeEntry: true, lowWalking: true, accessibleToilet: true },
    source: 'forest_department',
  },
  {
    slug: 'kovai-kutralam',
    name: 'Kovai Kutralam Falls',
    destination: 'coimbatore',
    category: 'waterfall',
    description: 'Falls on the Siruvani road, busiest at weekends and after rainfall.',
    lat: 10.9667, lng: 76.7167,
    hours: daily('08:30', '16:30'),
    visitMinutes: 90, priceLowInr: 20, priceHighInr: 50,
    accessibility: { stepFreeEntry: false, lowWalking: false, accessibleToilet: true },
    source: 'forest_department',
  },
  {
    slug: 'ukkadam-market-walk',
    name: 'Ukkadam morning market walk',
    destination: 'coimbatore',
    category: 'market',
    description: 'Wholesale produce market at its busiest before eight, with a short guided food route.',
    lat: 10.9917, lng: 76.9556,
    hours: daily('05:00', '11:00'),
    visitMinutes: 90, priceLowInr: 0, priceHighInr: 400,
    accessibility: { stepFreeEntry: true, lowWalking: false, accessibleToilet: false, note: 'Crowded, uneven surfaces underfoot.' },
    isHiddenGem: true,
    source: 'verified_curator',
  },
  {
    slug: 'kurudi-malai-sunrise',
    name: 'Kurudi Malai sunrise point',
    destination: 'coimbatore',
    category: 'viewpoint',
    description: 'Short pre-dawn climb above the plains, known mainly to local walking groups.',
    lat: 11.0797, lng: 76.8222,
    hours: daily('05:00', '09:00'),
    visitMinutes: 90, priceLowInr: 0, priceHighInr: 0,
    accessibility: { stepFreeEntry: false, lowWalking: false, accessibleToilet: false },
    isHiddenGem: true,
    source: 'verified_curator',
  },
];

export type PlaceIds = Record<string, string>;

export async function seedPlaces(
  tx: Sql,
  destinationIds: Record<DestinationKey, string>,
  sourceIds: Record<SourceKey, string>,
): Promise<PlaceIds> {
  const ids: PlaceIds = {};

  for (const place of PLACES) {
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO places (
        destination_id, slug, name, category, description, location,
        address, operating_hours, expected_visit_minutes,
        price_low_inr, price_high_inr, accessibility, is_hidden_gem, status
      ) VALUES (
        ${destinationIds[place.destination]}, ${place.slug}, ${place.name},
        ${place.category}, ${place.description},
        ST_SetSRID(ST_MakePoint(${place.lng}, ${place.lat}), 4326)::geography,
        ${tx.json({ district: place.destination, state: 'Tamil Nadu', country: 'India' })},
        ${tx.json(place.hours)},
        ${place.visitMinutes}, ${place.priceLowInr}, ${place.priceHighInr},
        ${tx.json({ ...place.accessibility, closureNote: place.closureNote ?? null })},
        ${place.isHiddenGem ?? false}, 'active'
      )
      RETURNING id
    `;
    ids[place.slug] = row.id;

    // Tie each trust-bearing field scope to its source, so the UI can show
    // "District Tourism Office · Verified 12 Sep 2026" beside the claim.
    for (const scope of ['hours', 'price', 'access']) {
      await tx`
        INSERT INTO place_sources (place_id, source_id, field_scope)
        VALUES (${row.id}, ${sourceIds[place.source]}, ${scope})
      `;
    }
  }

  return ids;
}
