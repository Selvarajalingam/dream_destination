import type { SeedSql } from './types';
import type { PlaceIds } from './places';
import type { SourceKey } from './sources';

/**
 * Destination stories for Screen T19. Each is short enough for the 60-second
 * mode and long enough for the detailed mode. Legends are labelled as legends
 * (PRD Part I T19) rather than presented as fact.
 */

type StorySeed = {
  placeSlug: string;
  contentType: 'fact' | 'community_story' | 'legend' | 'guide';
  title: string;
  shortText: string;
  longText: string;
  source: SourceKey;
};

export const STORIES: StorySeed[] = [
  {
    placeSlug: 'ooty-botanical-garden',
    contentType: 'fact',
    title: 'A garden laid out for a hill station that did not yet exist',
    shortText:
      'The garden was laid out in 1848 by William Graham McIvor, before Ooty had become the summer capital it is remembered as. The terraces follow the natural slope rather than flattening it.',
    longText:
      'When work began in 1848, the Nilgiris were still being surveyed as a sanatorium rather than a hill station. William Graham McIvor, trained at Kew, laid the garden across the natural slope in terraces instead of levelling it, which is why the walk from the lower gate to the Italian garden climbs steadily. The fossilised tree trunk near the upper terrace is around twenty million years old and was moved here from the Nilgiri slopes. The annual flower show, held each May, began as a way of showing what could be grown at this altitude.',
    source: 'district_tourism',
  },
  {
    placeSlug: 'nilgiri-mountain-railway',
    contentType: 'fact',
    title: 'The rack that made the climb possible',
    shortText:
      'Between Kallar and Coonoor the line uses an Abt rack system, with toothed rails the locomotive grips to climb gradients no adhesion railway could manage.',
    longText:
      'The Nilgiri Mountain Railway was proposed in 1854 and did not open to Coonoor until 1899, delayed by the difficulty of the climb. Between Kallar and Coonoor the gradient reaches one in twelve, far beyond what a conventional locomotive can hold, so the line uses an Abt rack system: two toothed rails laid between the running rails, which a pinion under the locomotive engages. The steam locomotive is pushed from below rather than pulling from in front, so that a coupling failure leaves the carriages held on the rack. UNESCO added the line to its World Heritage list in 2005.',
    source: 'transport_corporation',
  },
  {
    placeSlug: 'st-stephens-church',
    contentType: 'fact',
    title: 'Timber carried from Srirangapatna',
    shortText:
      'The beams came from Tipu Sultan’s palace at Srirangapatna, hauled 120 km uphill by elephant after the fall of the kingdom.',
    longText:
      'St Stephen’s was consecrated in 1831, the first church in the Nilgiris. Its timber was salvaged from the Lal Bagh palace of Tipu Sultan at Srirangapatna and carried roughly 120 kilometres to the plateau by elephant. The roof beams, visible from inside, are the same teak. The churchyard holds graves of surveyors and administrators who died young of fevers contracted on the plains, which is part of why the hill station was promoted as a sanatorium in the first place.',
    source: 'archaeological_survey',
  },
  {
    placeSlug: 'nilgiri-toda-settlement',
    contentType: 'community_story',
    title: 'The embroidery is a record, not a decoration',
    shortText:
      'Toda pukhoor embroidery is worked in red and black on white cloth, counted from the reverse. The motifs record clan, occasion and standing.',
    longText:
      'Toda women work pukhoor embroidery from the back of the cloth, counting threads rather than following a drawn design, in red and black wool on white cotton. The motifs are not ornamental: particular patterns belong to particular clans and occasions, and a putkuli shawl worn at a funeral differs from one worn at a naming. The craft received a Geographical Indication in 2013. Visitors are asked to remember that the hamlets are homes. Ask before you photograph anyone, and accept no for an answer.',
    source: 'verified_curator',
  },
  {
    placeSlug: 'doddabetta-peak',
    contentType: 'fact',
    title: 'Where two ranges meet',
    shortText:
      'At 2,637 metres, Doddabetta sits where the Western and Eastern Ghats converge. The name means simply "big mountain" in Kannada.',
    longText:
      'Doddabetta is the highest point in the Nilgiris and the fourth highest in South India. The peak marks roughly where the Western and Eastern Ghats meet, which is why the view takes in such different country in each direction: tea and shola to the west, the drier Moyar valley to the north-east. The shola forest on the slopes is a relict system, growing in the folds where frost does not settle, with grassland on the exposed ground between. That mosaic supports species found nowhere else, including the Nilgiri tahr.',
    source: 'district_tourism',
  },
  {
    placeSlug: 'marudamalai-temple',
    contentType: 'legend',
    title: 'The herb hill (told as a legend)',
    shortText:
      'Local tradition holds that the hill carries medicinal herbs from the Sanjeevani mountain, dropped here by Hanuman. This is a legend rather than a documented account.',
    longText:
      'This account is told locally and is recorded here as a legend, not as history. In the telling, when Hanuman carried the Sanjeevani mountain to Lanka to revive Lakshmana, fragments fell across South India, and one fell on the hill now called Marudamalai. The name is read as maruthuva malai, the hill of medicine, and the herbs growing on its slopes are said to descend from that fall. The temple itself is documented from around the twelfth century, under the Kongu Cholas.',
    source: 'district_tourism',
  },
  {
    placeSlug: 'highfield-tea-factory',
    contentType: 'guide',
    title: 'What to notice in a working tea factory',
    shortText:
      'Watch the withering troughs first. The moisture the leaf loses there decides how the rest of the day will go.',
    longText:
      'Start at the withering troughs. Fresh leaf arrives at around 78 per cent moisture and is blown with air for twelve to eighteen hours until it drops to roughly 60 per cent. Everything downstream depends on getting that right. In the rolling room, the leaf is twisted to break its cells and release the enzymes that drive oxidation, which is the stage often called fermentation although nothing ferments. The oxidising leaf changes colour visibly over the next hour or two. Firing at around 120 degrees then stops the process. Orthodox processing, which is what the Nilgiris are known for, keeps the leaf more intact than the CTC method used for most mass-market tea.',
    source: 'district_tourism',
  },
  {
    placeSlug: 'nirar-dam-road',
    contentType: 'guide',
    title: 'What to notice on the plateau road at first light',
    shortText:
      'Lion-tailed macaques feed in the canopy soon after dawn. Stay in the vehicle, keep the engine off, and let them cross in their own time.',
    longText:
      'The Valparai plateau is a rare case of a working landscape that still carries wildlife corridors. Around a thousand square kilometres of tea and coffee sit between two protected areas, and the rainforest fragments left between the estates hold lion-tailed macaques, one of the most threatened primates in the world. They feed in the canopy soon after dawn, which is why the road is worth driving early. Stay in the vehicle. Do not carry visible food. If a troop is crossing, stop and switch off the engine, and give them as long as they need. Elephants use the same corridors, and the plateau has a warning system precisely because the two overlap.',
    source: 'forest_department',
  },
  {
    placeSlug: 'vov-textile-mill-walk',
    contentType: 'fact',
    title: 'Why the cotton mills came here',
    shortText:
      'Coimbatore grew into a mill town because the Noyyal river, black cotton soil and, after 1932, cheap hydro power from Pykara arrived together.',
    longText:
      'The first mill opened in 1888, but Coimbatore became a textile centre in earnest after 1932, when the Pykara hydroelectric scheme in the Nilgiris brought cheap power to the plains. Black cotton soil in the surrounding districts supplied the raw material, the Noyyal supplied water, and the combination made the city the second-largest textile centre in the country. The mills shaped the street pattern you walk through: worker housing, foundries that supplied the machinery, and the engineering workshops that later turned into the pump and motor industry Coimbatore is known for now.',
    source: 'municipal_corporation',
  },
  {
    placeSlug: 'sandynalla-viewpoint',
    contentType: 'guide',
    title: 'Going quietly to a quiet place',
    shortText:
      'This viewpoint stays quiet because few people know it. Park in the marked area, keep your voice down, and take everything back with you.',
    longText:
      'Sandynalla is not managed as a visitor site. There is no ticket counter, no attendant and no bin, and the reservoir supplies water downstream. The track in crosses estate land, so stay on it and leave the gates as you found them. Come before the light goes: there is no lighting anywhere on the route and mobile coverage drops during the final stretch. If you find others already at the viewpoint, the space is small enough that waiting is kinder than crowding. Take your waste back down with you.',
    source: 'verified_curator',
  },
  {
    placeSlug: 'ukkadam-market-walk',
    contentType: 'community_story',
    title: 'The market runs on trust, before dawn',
    shortText:
      'Trade here is settled by voice and handshake between five and eight in the morning. By nine it is over and the lanes are being washed.',
    longText:
      'Ukkadam is a wholesale market, not a retail one. Produce arrives overnight from Kinathukadavu, Thondamuthur and further out, and the trade is done between five and eight in the morning, largely by voice. Prices move through the hall faster than any board could follow, and much of the settlement runs on standing relationships between commission agents and growers rather than on paper. By nine the lanes are being washed down. If you come, keep out of the loading lanes, and ask before photographing anyone. People here are working, not performing.',
    source: 'municipal_corporation',
  },
  {
    placeSlug: 'emerald-lake-village',
    contentType: 'community_story',
    title: 'A Badaga village beside a reservoir',
    shortText:
      'Emerald is a working Badaga settlement. The reservoir came later, and the village kept farming around it.',
    longText:
      'The Badaga communities of the Nilgiris farm the slopes around Emerald, growing vegetables and, more recently, tea. The reservoir was built to supply the Pykara hydroelectric scheme, and the village adapted around it rather than moving. Early morning is the best time for birds along the shoreline, and it is also when the village is busiest with farm work. Park in the marked area, walk rather than drive through the settlement, and ask before photographing homes or people.',
    source: 'verified_curator',
  },
];

export async function seedStories(
  tx: SeedSql,
  placeIds: PlaceIds,
  sourceIds: Record<SourceKey, string>,
): Promise<void> {
  for (const story of STORIES) {
    const placeId = placeIds[story.placeSlug];
    if (placeId === undefined) continue;

    await tx`
      INSERT INTO story_content (
        place_id, content_type, title, short_text, long_text,
        locale, source_ids, status, reviewed_at
      ) VALUES (
        ${placeId}, ${story.contentType}, ${story.title}, ${story.shortText}, ${story.longText},
        'en-IN', ${tx.array([sourceIds[story.source]])}::uuid[], 'active', now() - interval '20 days'
      )
    `;
  }
}
