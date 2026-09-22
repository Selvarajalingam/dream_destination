# Analytics data dictionary

Written for: anyone adding, reading or auditing a Dream Destination analytics
event. Satisfies PRD backlog E14-S06.

The source of truth is `src/modules/analytics/domain/events.ts`. A test fails
if an event exists there without an entry here, so this file cannot drift.

## Rules every event follows

| Rule | How it is enforced |
|---|---|
| No raw chat, precise location, medical details or document content | Every property is an enum, bounded number, boolean or UUID. There is no free-text property, and a test fails if one is added. |
| Tied to a session, not a person | `user_id` is always written as `NULL`. Events carry the session id only. |
| Schema is versioned | Each row stores `schema_version`, currently `1`. |
| Simulated data is separable | Each row stores `is_demo`. No dashboard query mixes the two. |
| Unknown data is refused, not stripped | An unexpected property rejects the whole event, which is logged, so a caller's mistake surfaces instead of silently thinning the data. |
| Analytics never breaks a request | Insert failures are logged and dropped. The traveller's request still succeeds. |

**Owner:** product analytics, with the platform team owning the catalogue file.
**Retention:** 13 months, aggregated where possible (PRD Part II §12.3).
**Prohibited:** any property holding text a person typed, coordinates, contact
details, health or accessibility needs, or document content.

## Events

### Product funnel (E14-S02)

| Event | Recorded when | Properties | Where |
|---|---|---|---|
| `brief_started` | First message in Dream AI | `mode`: `llm` \| `deterministic` | Server, brief parse |
| `brief_completed` | The brief has everything needed to plan | `mode`; `clarifications`: count | Server, brief parse |
| `shortlist_viewed` | Destinations are compared | `optionCount`: count | Server, recommendations |
| `dream_score_opened` | "Why this matches" is opened | `destinationId`: UUID | Browser, shortlist |
| `itinerary_generated` | A plan is built | `tripId`; `days`; `itemCount` | Server, itinerary generation |
| `budget_edited` | The budget is changed | `tripId`; `change`: `total` \| `reserve` \| `style` \| `lock` | Reserved; not yet emitted |
| `offline_pack_saved` | An offline pack finishes saving | `tripId`; `outcome`: `saved` \| `partial` | Browser, offline pack |
| `trip_mode_started` | Trip Mode is opened | `tripId` | Server, Trip Mode page |
| `trip_completed` | A trip is marked complete | `tripId` | Reserved; not yet emitted |

### Crowd shifts (E14-S04)

| Event | Recorded when | Properties | Where |
|---|---|---|---|
| `crowd_alternative_offered` | A heavy-crowd warning appears on a planned stop | `tripId`; `placeId` | Server, itinerary page |
| `crowd_alternative_accepted` | The traveller acts on that warning | `tripId`; `placeId` | Browser, itinerary |

### Trust and discovery

| Event | Recorded when | Properties | Where |
|---|---|---|---|
| `hidden_gem_viewed` | A hidden gem's page is opened | `placeId` | Server, place page |
| `help_opened` | Nearby Help is opened | `source`: `navigation` \| `trip_mode` \| `place`; `msToOpen`: optional duration | Server, help page |

### Local impact (E14-S03)

| Event | Recorded when | Properties | Where |
|---|---|---|---|
| `business_impression` | A business is shown in a list | `businessId`; `category`; `surface`: `home` \| `destination` \| `itinerary` | Server, destination page |
| `business_detail_viewed` | A business's page is opened | `businessId`; `category` | Server, business page |
| `business_directions` | Directions to a business are opened | `businessId`; `category` | Browser, business page |
| `business_contact` | A business is called | `businessId`; `category` | Browser, business page |
| `business_itinerary_add` | A business is added to a plan | `businessId`; `category` | Reserved; not yet emitted |

`category` is one of: restaurant, homestay, artisan, guide, cafe, farm,
transport, shop.

## What the dashboard computes

- **Qualified trips** — distinct sessions reaching `itinerary_generated`.
- **Funnel conversion** — distinct sessions at each stage, as a share of the
  previous stage and of the first.
- **Off-peak shifts** — `crowd_alternative_accepted` over `crowd_alternative_offered`.
- **Distribution fairness** — Gini coefficient across every active business,
  counting those with no actions as zero, plus the share of actions taken by
  the top fifth. Leaving zeros out would make three businesses sharing all the
  attention look perfectly equal.

Actions are directions, contacts and itinerary additions. None of them is a
confirmed sale, and the dashboard does not describe them as one.
