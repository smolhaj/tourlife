# Tour Life

A golf career simulator in the spirit of ZenGM's Basketball GM. You start as a
20-to-22-year-old amateur with a set of clubs and no status anywhere, and you
play until you decide to stop — usually somewhere in your fifties, with a bank
balance and a major count that are entirely your fault.

A full career runs about 10–15 minutes if you use the sim controls, or a whole
evening if you pick every event by hand.

Pure client-side React + Vite. No backend, no APIs, no accounts. Saves live in
`localStorage`; careers export and import as JSON.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in /dist
npm run preview  # serve the built site
```

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds on every push to `main` and publishes
`/dist` via GitHub Pages. It passes `enablement: true` to `configure-pages`, so
it turns Pages on and points it at the workflow by itself — no manual setup.

If your org blocks the workflow token from changing Pages settings, the action
will fail with *"Get Pages site failed"*. In that case set **Settings → Pages →
Source → GitHub Actions** by hand once and re-run the workflow. Watch for that
error specifically: while Pages is set to *Deploy from a branch* the site serves
the repository root, so visitors get the unbuilt `index.html` and a 404 on
`/src/main.jsx` rather than the game.

The Vite `base` is `./`, so the same bundle works from a user page, a project
page, or a `file://` open.

## How the game works

### The five things you are

Six rated attributes, grouped the way golfers talk about them, plus a mental
rating that mostly matters when it is Sunday and the tournament is a major:

| Rating | Peaks around | Starts declining |
| --- | --- | --- |
| Driving Distance | 26 | 29 |
| Driving Accuracy | 30 | 35 |
| Iron Play | 30 | 34 |
| Short Game | 32 | 37 |
| Putting | 31 | 36 |
| Consistency | 34 | 41 |
| Mental | 38 | 46 |

Each attribute has a soft ceiling that shifts a little while you are young.
Development is driven by age, your offseason training focus, coaching quality,
career mileage, and whatever injuries you are carrying. Overall peaks in the
low thirties and declines from there — a physio slows the physical side of it,
mental work barely notices.

**Consistency** is variance, not skill: it controls how wide your scoring
distribution is. Paired with playstyle (five settings from *Point-and-shoot*
to *Send it*), it decides whether you are the player who never blows up or the
player who wins six times and misses twenty cuts.

### Tournaments

One roll per event, but the roll is a whole field. Every entrant gets a
72-hole score built from their rating on that course archetype, current form,
fatigue, playstyle edge, and a gaussian draw scaled by their consistency and
the course setup. Scores are sorted, positions assigned (with ties), the cut
falls where it falls, and the payout curve pays out.

Eight course archetypes — links, bombers' paradise, tight and tree-lined,
resort birdie-fest, championship brute and so on — weight the attributes
differently, so a long, wild driver eats up one week and drowns the next.

### Circuits

| Circuit | Events | Purses | Notes |
| --- | --- | --- | --- |
| Amateur & Regional | 18 | none | Where everyone starts |
| Emerging Circuit | 26 | ~$1M | Open entry — you can always tee it up somewhere |
| Asian Circuit | 24 | ~$2M | Its own order of merit |
| International Tour | 40 | ~$4M | Global schedule, brutal travel |
| Domestic Tour | 40 | ~$9M | Deepest fields, biggest cheques |
| Major Championships | 4 | ~$20M | Weeks 11, 19, 26 and 33 |
| Senior Circuit | 26 | ~$3M | 50+, no cuts, three senior majors |

Status is earned: money-list retention, graduation from the development tour,
two-year winner's exemptions, a five-year exemption for winning a major, and
Q-School every offseason if none of that worked. World top 60 gets you into
the majors. Playing across circuits in consecutive weeks costs extra fatigue.

### Money

Prize money is gross. Your caddie takes 10% of a win (7% of a top ten, 5%
otherwise), your agent takes their cut, and tax takes 31% of what is left —
you keep roughly 55–60%. Then there are travel costs per start, staff
salaries, and a lifestyle you chose.

Endorsements are the other half of the income and follow the world ranking
closely. Deals carry ranking clauses; fall outside one two years running and
the sponsor walks. You can push for more at the negotiating table, and
sometimes the offer disappears instead.

Everything you do not spend compounds between seasons, which is what makes the
CoastFI milestones on the Money tab a real decision rather than a scoreboard.

### Things going wrong

Twelve setbacks, split between injuries that keep you out (back, wrist, ribs,
knee surgery) and slumps you have to play through (putting yips, a two-way
miss off the tee, burnout). Serious injuries leave permanent damage, which is
what makes a comeback feel like one.

### Sim controls

Sim a week, the next event, forward to the next major, to the offseason, or
jump whole years at a time. Long jumps auto-play your offseasons with sensible
choices — training your weakest attribute, hiring what you can afford, taking
the offers on the table, and building a schedule from what you are eligible
for. Godmode can force-play any event on the calendar, spawn a fifth major,
edit any rating, or rewind.

## Project layout

```
src/game/         the simulation — no React in here at all
  rng.js          seeded PRNG; the whole save is deterministic
  constants.js    circuits, payouts, staff tiers, lifestyles, playstyles
  ratings.js      attributes, age curves, yearly development
  schedule.js     the permanent fixture list and each season's calendar
  world.js        ~700 AI professionals, their careers and retirements
  tournament.js   the field simulation
  eligibility.js  tour cards, exemptions, Q-School, Monday qualifiers
  injuries.js     setbacks and recovery
  finance.js      cheque splits, expenses, financial-independence targets
  sponsors.js     marketability, offers, negotiation, contract clauses
  staff.js        coaches, caddies, physios, psychologists, agents
  narrative.js    highlights, flavour, legacy scoring
  engine.js       game state, the weekly loop, sim commands, godmode
  save.js         localStorage, JSON export/import, undo history
src/components/   the UI
scripts/balance.mjs  headless career harness — `npm run balance`
```

### Tests

`npm test` runs three dependency-free suites (about 45 seconds total, all in
CI). They are deliberately not unit tests: every bug they have caught was
emergent, invisible in any single function.

**`npm run scenarios`** — twelve scenarios that play whole careers and assert what
should always be true. The ladder from amateur to the majors actually connects,
a weak player is never stranded, injuries clear and leave a mark, the same seed
reproduces the same career, saves survive an export/import round trip,
retiring and un-retiring both work, godmode does what it claims, no event ever
has two winners, every circuit is actually reachable, and the money adds up.

**`npm run hostile`** — malformed and truncated save files, saves from older
builds missing fields, every slider at its extreme (NaN ratings, age 1, age
200, a trillion in debt), button-mashing, out-of-order calls, and degenerate
playstyles like never entering an event for thirty years. Nothing may crash,
and the career must stay playable afterwards.

**`npm run fuzz`** — random legal action sequences, tens of thousands of them,
auditing after every single step: no non-finite numbers, ratings in range, the
result log in sync with the career totals, no double-booked weeks, and never a
state where the player has nowhere left to enter.

```bash
npm run fuzz -- --runs 60 --steps 500 --seed 777
```

Everything runs locally with no CI involved. To gate your own pushes on it:

```bash
git config core.hooksPath scripts/hooks
```

That runs `npm test` before every push and aborts on failure (`--no-verify`
overrides). Useful if you would rather not spend CI minutes, or are working
offline.

### The balance harness

`npm run balance` runs whole careers with no browser and prints the shape of
them: outcome spread, the mean age curve, winning scores by circuit, and the
finish distribution across every start.

```bash
npm run balance -- --careers 10 --talent 0.68 --until 46
```

It is how the numbers above were tuned, and it is the fastest way to check
that a change to the model has not quietly broken thirty years of golf.

## Design notes

Nothing in the game refers to a real player, tournament, venue or brand. The
name pools, course names and sponsors are all generated from invented lists.

Balance targets, roughly, over a career from 21 to 46:

| Prospect | Peak overall | Wins | Majors |
| --- | --- | --- | --- |
| Mini-tour long shot | 57–63 | 0–1 | 0 |
| Solid college player | 63–71 | 0–7 | 0–1 |
| Highly touted amateur | 66–81 | 0–23 | 0–2 |
| Generational prospect | 73–89 | 6–79 | 0–9 |

The spread inside each tier is deliberate. Two players with identical talent
should not have the same career, and the one who never quite got there is a
more interesting story than the one who did.
