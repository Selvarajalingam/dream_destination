# Demonstration runbook

Written for: whoever is driving the Smart India Hackathon demonstration.

Everything below uses seeded demonstration data. Say so once at the start; the
interface also labels it on every screen, which is itself worth pointing at.

## Before you start

```bash
npm run setup    # brings up the database, migrates, seeds
npm run dev
```

Reseed immediately before demonstrating. Several fixtures are relative to the
current time — the crowd observation stream has a 90-minute validity window —
so a seed from yesterday will show Unknown where you expect a reading:

```bash
npm run db:seed
```

Check the app is in the state you expect:

```bash
curl -s localhost:3000/api/ready
```

`ai` reads `deterministic` with no API key and `llm` with one. Either is fine to
demonstrate; if asked, the point is that the product does not depend on the
model being reachable.

## The journey, about six minutes

### 1. Home, and asking in plain words

Open <http://localhost:3000> at a phone width. Note that nothing asks for
location, notifications or sign-in.

Type, or paste:

> `4 day family trip from Coimbatore in December within Rs 25,000, nature and heritage, avoid crowds`

Press **Start planning**.

### 2. The structured brief

Every value understood from that sentence is highlighted in the summary panel:
origin, month, days, party, budget, interests, crowd tolerance.

**Worth saying:** nothing here is inferred from data the traveller did not give.
Tap any value to correct it — try changing days to 3 and back — without
retyping the request.

Press **See destinations**.

### 3. Three destinations with real trade-offs

Three options, each with a trip match percentage, an estimated cost range
labelled as an estimate rather than a quote, travel time, a crowd badge, and
one advantage and one trade-off.

**Worth pointing at:** Ooty shows **Heavy crowd** in red with a warning icon
and the text label. Tap **Why?** — it reads *"Set by the local tourism
authority: Local festival procession through the garden road, heavy footfall
expected."* That is an administrator override, and you will create one yourself
later.

### 4. Why it matches

Tap **Why this matches** on any option. The sheet shows all seven scoring
dimensions with the weights the PRD specifies, anything that could not be
compared, and the trade-off.

**Worth saying:** this is computed in application code, never by the model, and
the components, weights, algorithm version and input snapshot are all persisted
so any score shown to a traveller can be reconstructed later. Sponsored
listings never affect it.

### 5. The itinerary

Press **Build my trip** on **Ooty and the Nilgiris**.

A four-day plan appears: real places, times from 09:00 local, travel legs
between stops, entry costs each labelled *Typical price*, and crowd badges.

**Worth pointing at:**

- The budget meter at the top, and that the plan was reduced to fit rather than
  simply reporting an overrun.
- The inline conflicts — a weather closure warning on Doddabetta Peak — each
  with an action, not just a warning.
- A local business inside the plan at the meal slot, not in a sidebar.

### 6. Editing, with locks respected

Tick **Lock** on the first item, then press **Optimize unlocked items**.

The locked item does not move. **Undo** appears and works.

### 7. Map, and its list equivalent

Switch to **Map**. The route and pins render on OpenStreetMap.

**Worth pointing at:** the numbered list below the map. Those are the same
places, reachable by keyboard and screen reader. The PRD requires map pins to
have a list-view equivalent, and this is it.

### 8. Trust, at the decision point

Open any place, then visit **Sandynalla reservoir viewpoint** specifically.

- The **Dream Verified** badge is there. Tap it: verification date, next review,
  reviewer, everything that was checked across nine groups, and a plain
  statement that it is not a guarantee of current conditions.
- Above the "Add to trip" button, before it, sit the known limitations:
  *"Mobile coverage becomes unreliable during the final 2 km. Download your trip
  pack before leaving."*

Now open **Vaidehi Falls**. The badge is **gone** — that verification is past
its review date — but the recorded limitations are still shown, with an
explanation of why the badge is absent.

**Worth saying:** hiding stale information would be worse than showing it with
its age. That principle runs through the product.

Open **Know before you visit** on Mukurthi trail. Every rule names its issuing
authority and when it was last checked. Two rules carry a stale warning on
purpose.

### 8b. Booking, without pretending to book

From the trip, open **Booking options**. Every price carries its currency and
when it was checked; taxes read included, extra or *not stated by the
provider*; cancellation says what the provider said, or that it said nothing.

Press **Open** on one. Note the notice before anything opens: the provider
takes the booking and the payment. Continue, and the sandbox page says plainly
that no booking exists and hands you a reference.

Back on the trip, the row reads **Sent to the provider** — *"Whether you booked
there is not something we can see."* Paste a card number into the reference
field: it is refused. Paste the reference: the row reads **Reference added by
you**. Mark it confirmed and note that it asks where the confirmation came
from, and records that answer.

**Worth saying:** the product never claims to have booked anything, and the
five states in the PRD are the only ones it can be in.

### 9. Offline

Back on the trip, press **Save for offline**. Each resource reports
individually as it saves.

In DevTools, Network → **Offline**. Navigate to **Nearby help**.

The emergency number, the saved contact action and the facility list all still
work. The screen states plainly: *"Live availability is unknown."*

**Worth saying:** crowd and weather are deliberately not in the pack. The
simplest way to never label cached crowd as live is not to carry it.

Turn the network back on.

### 10. Trip Mode

Press **Start Trip Mode**.

The standard navigation is replaced by Next / Map / Alerts / Help. The next
activity is first on the screen with a countdown, and Help is one tap away from
anywhere.

### 11. Operations

Open **/admin/login**, press **Use this account** beside Tourism admin, then **Sign in**. You land on the operations overview.

**Verification queue (A02).** Two items: one under review, one whose approval
has expired. Open the one under review.

**Verification workspace (A03).** The checklist, sources with their dates, the
map link. Try to approve it with no reason — it is refused. Add a reason and
approve.

Open that place as a traveller. The Dream Verified badge is now there.

**Worth saying:** that decision wrote an audit row with the reason and who made
it. A business owner cannot approve their own submission, enforced in the
domain rather than the form.

**Crowd operations (A04).** Pick a place, press **Override**, choose **Heavy
crowd**, and give a reason. Note that the form says the reason is shown to
travellers.

Open that place as a traveller: the band changed, and tapping **Why?** shows
your reason. It expires on its own; overrides never linger.

### 12. A local business owner

Open **/business/login**, press **Use this account** beside Badaga Home
Kitchen, then **Sign in**. This account owns Badaga Home Kitchen, which is live, and two
listings that start in review.

**Dashboard (B05).** Open Badaga Home Kitchen. A traveller report is waiting
for a response; answer it, then find that response in the admin incident screen
(A06). The activity figures are labelled as traveller actions, not sales, and
Saves reads "Not measured" rather than zero.

**Updates (B06).** **Update listing** → set a temporary closure for today. Open
the listing as a traveller: it says it is closed, and it is gone from the
destination's Support Local list. Remove the closure. Then change the name in
the lower form: it asks for a reason and goes to A07 as a change request, and
travellers keep seeing the reviewed name until it is approved.

**Onboarding (B01–B04).** **Register a business**. Switch to தமிழ் and back.
Start a listing; fields save as you type (reload to prove it), and a mistyped
PIN is named without losing the rest. Upload evidence, open the preview, and
send it for review. It then appears in the admin Businesses queue (A07).

**Worth saying:** the preview is the traveller page itself, rendered by the
same component. Evidence files are never shown to travellers and open only as
downloads for the owner and reviewers, and the server reads each file's real
type rather than trusting its name.

## Three failure modes worth showing

The product is designed to degrade rather than break, and showing that is more
convincing than claiming it.

**The assistant is unavailable.** In DevTools, block
`/api/v1/trip-briefs/parse`, then load Dream AI. The trip summary is kept, the
screen says the assistant is not responding, and offers **Search destinations**
— the deterministic path, which reaches the same destinations.

**Crowd data is unavailable.**

```
localhost:3000/api/v1/places/ooty-botanical-garden/crowd?simulate=crowd-outage
```

Returns `unknown`, never `comfortable`. An unavailable feed must not read as a
quiet place.

**Crowd data has expired.**

```
localhost:3000/api/v1/places/doddabetta-peak/crowd?at=2027-09-21T10:00:00.000Z
```

Also `unknown`. Expiry is enforced in the domain and again in SQL.

## If something is not as expected

| Symptom | Cause | Fix |
|---|---|---|
| Crowd reads Unknown everywhere | Seed is stale; observations expired | `npm run db:seed` |
| Ooty does not show Heavy crowd | Override expired after six hours | `npm run db:seed` |
| Offline help is blank | Service worker not yet installed | Load the app once online, then go offline |
| Guest cannot create a second trip | Working as intended: one plan before sign-in | Sign in at /login, or use a private window |
| Port 5433 in use | Another Postgres container | Change the port in `docker-compose.yml` and `.env` together |

## Questions you should expect

**"Is the AI making up the itinerary?"** No. The plan is built deterministically
from the catalog — opening hours, visit durations, travel time and budget. The
model extracts what you asked for and writes the description. Turn off the API
key and the product still works; `/api/ready` will show `deterministic`.

**"Is this real data?"** No, and the product never claims otherwise. Every
source record is typed `seeded_demo`, and each screen carries a
"Demonstration data" label. The issuing authorities named are the real bodies
each record stands in for, so the freshness pattern has something honest to
show.

**"What happens when a traveller has no signal?"** They keep the plan,
addresses, coordinates, emergency numbers and rules. They lose crowd and
weather, and the app says so rather than showing yesterday's reading as today's.
