// Static game data: attributes, circuits, courses, payout curves, catalogues.

export const GAME_VERSION = 5
export const SAVE_KEY = 'tourlife.save.v1'
export const SETTINGS_KEY = 'tourlife.settings.v1'

export const WEEKS_PER_YEAR = 48 // 44 playing weeks + a 4-week offseason block

// ---------------------------------------------------------------- attributes

export const ATTRS = [
  { key: 'power', label: 'Driving Distance', short: 'DST', group: 'Driving' },
  { key: 'accuracy', label: 'Driving Accuracy', short: 'ACC', group: 'Driving' },
  { key: 'irons', label: 'Iron Play', short: 'IRN', group: 'Approach' },
  { key: 'shortGame', label: 'Short Game', short: 'SHG', group: 'Around the green' },
  { key: 'putting', label: 'Putting', short: 'PUT', group: 'Putting' },
  { key: 'consistency', label: 'Consistency', short: 'CON', group: 'Reliability' },
  { key: 'mental', label: 'Mental', short: 'MTL', group: 'Reliability' },
]

export const ATTR_KEYS = ATTRS.map((a) => a.key)

/** Weight of each attribute in the generic "overall" number shown in the UI. */
export const OVERALL_WEIGHTS = {
  power: 0.15,
  accuracy: 0.15,
  irons: 0.21,
  shortGame: 0.15,
  putting: 0.19,
  consistency: 0.09,
  mental: 0.06,
}

// ------------------------------------------------------------------ playstyle

/**
 * `edge` shifts your expected quality; `variance` widens the spread of your
 * scores. Aggression used to carry a positive edge *as well as* more variance,
 * so it was handed a better average score on top of the bigger tail — a free
 * lunch layered on the thing that was supposed to cost something. The edges are
 * near-neutral now, which flattens average finish across all five styles and
 * roughly doubles the spread in missed-cut rate (32% to 41% across the range,
 * against 35% to 39% before). They still sum to about zero, so the strength of
 * the field around you is unchanged.
 *
 * Worth knowing: this does not make the safe styles competitive on wins or
 * money, and no value of `edge` can. Prize money is steeply top-heavy while a
 * missed cut merely pays nothing, so for an above-average player in a full
 * field the tail is worth far more than the misses cost. Aggression is the
 * higher-expectation choice here much as it is in the real game; what the
 * conservative end buys is cuts made and a steadier week-to-week living.
 */
export const PLAYSTYLES = [
  {
    id: 'ultraConservative',
    name: 'Point-and-shoot',
    blurb: 'Fairway finder. You will almost never blow up — and almost never run away with one.',
    variance: 0.74,
    edge: 0.15,
    scramble: 0.06,
    burnout: -0.04,
  },
  {
    id: 'conservative',
    name: 'Conservative',
    blurb: 'Play the percentages. Middle of the green, two putts, move on.',
    variance: 0.87,
    edge: 0.06,
    scramble: 0.03,
    burnout: -0.02,
  },
  {
    id: 'balanced',
    name: 'Balanced',
    blurb: 'Pick your spots. The default tour approach.',
    variance: 1.0,
    edge: 0,
    scramble: 0,
    burnout: 0,
  },
  {
    id: 'aggressive',
    name: 'Aggressive',
    blurb: 'Take on the flag. More wins, more missed cuts.',
    variance: 1.18,
    edge: -0.1,
    scramble: -0.02,
    burnout: 0.03,
  },
  {
    id: 'ultraAggressive',
    name: 'Send it',
    blurb: 'Driver everywhere, flag-hunting, no laying up. Feast or famine.',
    variance: 1.42,
    edge: -0.22,
    scramble: -0.05,
    burnout: 0.06,
  },
]

export function playstyleById(id) {
  return PLAYSTYLES.find((p) => p.id === id) || PLAYSTYLES[2]
}

// ------------------------------------------------------------------- courses

/**
 * Course archetypes. `w` weights sum to 1 and decide which attributes the
 * venue rewards; `variance` scales how much luck the setup allows.
 */
export const COURSE_TYPES = {
  classic: {
    name: 'Classic parkland',
    w: { power: 0.16, accuracy: 0.18, irons: 0.24, shortGame: 0.17, putting: 0.19, consistency: 0.06 },
    variance: 1.0,
  },
  bomber: {
    name: "Bomber's paradise",
    w: { power: 0.31, accuracy: 0.09, irons: 0.21, shortGame: 0.16, putting: 0.17, consistency: 0.06 },
    variance: 1.06,
  },
  precision: {
    name: 'Tight and tree-lined',
    w: { power: 0.08, accuracy: 0.28, irons: 0.27, shortGame: 0.17, putting: 0.14, consistency: 0.06 },
    variance: 0.9,
  },
  links: {
    name: 'Windswept links',
    w: { power: 0.13, accuracy: 0.18, irons: 0.2, shortGame: 0.22, putting: 0.14, consistency: 0.13 },
    variance: 1.22,
  },
  resort: {
    name: 'Resort birdie-fest',
    w: { power: 0.19, accuracy: 0.09, irons: 0.2, shortGame: 0.17, putting: 0.29, consistency: 0.06 },
    variance: 0.95,
  },
  desert: {
    name: 'Desert target golf',
    w: { power: 0.22, accuracy: 0.15, irons: 0.23, shortGame: 0.15, putting: 0.19, consistency: 0.06 },
    variance: 1.0,
  },
  mountain: {
    name: 'Mountain altitude',
    w: { power: 0.25, accuracy: 0.14, irons: 0.22, shortGame: 0.16, putting: 0.17, consistency: 0.06 },
    variance: 1.12,
  },
  brutal: {
    name: 'Championship brute',
    w: { power: 0.18, accuracy: 0.22, irons: 0.24, shortGame: 0.18, putting: 0.12, consistency: 0.06 },
    variance: 0.85,
  },
}

export const COURSE_TYPE_KEYS = Object.keys(COURSE_TYPES)

// ------------------------------------------------------------------ circuits

export const CIRCUITS = {
  amateur: {
    id: 'amateur',
    name: 'Amateur & Regional',
    short: 'AM',
    color: '#8a9a8f',
    prestige: 0.25,
    pointsBase: 4,
    fieldSize: 96,
    cutSize: 60,
    ranking: 'world',
    blurb: 'Mini-tour and regional qualifiers. No real money, but it is where you learn to compete.',
  },
  emerging: {
    id: 'emerging',
    name: 'Emerging Circuit',
    short: 'EMG',
    color: '#6b9ec7',
    prestige: 0.45,
    pointsBase: 16,
    fieldSize: 132,
    cutSize: 65,
    ranking: 'world',
    blurb: 'The development tour. Finish top 25 on the money list and the Domestic Tour comes calling.',
  },
  asian: {
    id: 'asian',
    name: 'Asian Circuit',
    short: 'ASN',
    color: '#d08a4a',
    prestige: 0.55,
    pointsBase: 22,
    fieldSize: 132,
    cutSize: 65,
    ranking: 'asian',
    blurb: 'A proud regional tour with its own order of merit — and its own path into the majors.',
  },
  intl: {
    id: 'intl',
    name: 'International Tour',
    short: 'INT',
    color: '#5fbf9b',
    prestige: 0.78,
    pointsBase: 34,
    fieldSize: 144,
    cutSize: 65,
    ranking: 'world',
    blurb: 'Global schedule, wildly different courses, brutal travel. Second only to the Domestic Tour in money.',
  },
  domestic: {
    id: 'domestic',
    name: 'Domestic Tour',
    short: 'DOM',
    color: '#e0c341',
    prestige: 1.0,
    pointsBase: 48,
    fieldSize: 144,
    cutSize: 65,
    ranking: 'world',
    blurb: 'The biggest purses and the deepest fields in the sport.',
  },
  major: {
    id: 'major',
    name: 'Major Championships',
    short: 'MAJ',
    color: '#e8663c',
    prestige: 1.6,
    pointsBase: 100,
    fieldSize: 156,
    cutSize: 60,
    ranking: 'world',
    blurb: 'Four weeks a year that decide how your career gets described after you stop playing.',
  },
  senior: {
    id: 'senior',
    name: 'Senior Circuit',
    short: 'SEN',
    color: '#a98ac9',
    prestige: 0.6,
    pointsBase: 26,
    fieldSize: 78,
    cutSize: 78, // no cut
    ranking: 'senior',
    blurb: 'Fifty and over. Smaller purses, no cuts, and a locker room full of people who remember your prime.',
  },
}

export const CIRCUIT_ORDER = ['amateur', 'emerging', 'asian', 'intl', 'domestic', 'major', 'senior']

export const SENIOR_AGE = 50

// ------------------------------------------------------------------- payouts

/** Official-looking payout percentages for positions 1..70. */
/**
 * Share of the purse by finishing place, as a percentage.
 *
 * Two things this table has to get right, and used to get wrong. It must sum
 * to exactly 100 — the old one summed to 101.397, so every tournament ever
 * played quietly paid out 1.4% more than its purse, for the player and for
 * every AI, compounding into career earnings for forty years. And it must be
 * at least as long as the largest cut: the senior tour has no cut and 78
 * places, so with 70 entries whoever finished 71st through 78th made the cut
 * and was paid nothing.
 *
 * The winner's 18% is the recognisable figure and is kept exact; the rest is
 * scaled to make up the remaining 82. Scenario 16 asserts both properties.
 */
export const PAYOUT_PCT = [
  18, 10.5285, 6.6649, 4.733, 3.9603, 3.5015, 3.26, 3.0185, 2.8253, 2.6321,
  2.439, 2.2458, 2.0526, 1.8594, 1.7628, 1.6662, 1.5696, 1.473, 1.3764, 1.2798,
  1.1833, 1.0867, 1.0094, 0.9321, 0.8645, 0.7969, 0.7679, 0.7389, 0.71, 0.681,
  0.652, 0.623, 0.594, 0.5651, 0.5433, 0.5192, 0.495, 0.4709, 0.4492, 0.4298,
  0.4105, 0.3912, 0.3719, 0.3526, 0.3332, 0.3139, 0.2946, 0.2753, 0.2598, 0.2502,
  0.2424, 0.2367, 0.2328, 0.2289, 0.227, 0.2251, 0.2231, 0.2212, 0.2193, 0.2173,
  0.2154, 0.2135, 0.2115, 0.2096, 0.2077, 0.2057, 0.2038, 0.2019, 0.1999, 0.198,
  0.1942, 0.1903, 0.1864, 0.1826, 0.1787, 0.1748, 0.171, 0.1671,
]

/** Ranking-point multiplier by finishing position. */
export function pointsMultiplier(pos) {
  const table = [1, 0.6, 0.4, 0.32, 0.28, 0.24, 0.22, 0.2, 0.18, 0.16]
  if (pos <= 10) return table[pos - 1]
  if (pos > 70) return 0
  return Math.max(0.012, 0.16 * Math.pow(10 / pos, 1.35))
}

// --------------------------------------------------------------------- money

export const TAX_RATE = 0.31 // blended income tax
export const AGENT_FEE = 0.05 // of gross prize money
export const CADDIE_WIN_CUT = 0.1
export const CADDIE_TOP10_CUT = 0.07
export const CADDIE_BASE_CUT = 0.05

export const LIFESTYLES = [
  { id: 'spartan', name: 'Spartan', cost: 45000, blurb: 'Shared rentals, economy seats, cooking your own dinner.', morale: -6, burnout: 0.08 },
  { id: 'modest', name: 'Modest', cost: 110000, blurb: 'Nothing fancy. You bank almost everything.', morale: -2, burnout: 0.03 },
  { id: 'comfortable', name: 'Comfortable', cost: 260000, blurb: 'Decent hotels, a house you actually like, family travels with you.', morale: 3, burnout: -0.03 },
  { id: 'luxury', name: 'Luxury', cost: 720000, blurb: 'Private-ish travel, a chef, a place near the beach.', morale: 7, burnout: -0.07 },
  { id: 'superstar', name: 'Superstar', cost: 2100000, blurb: 'Jet card, entourage, two houses you rarely see.', morale: 10, burnout: -0.1 },
]

export function lifestyleById(id) {
  return LIFESTYLES.find((l) => l.id === id) || LIFESTYLES[1]
}

/** Per-event travel and caddie-expense cost by circuit. */
/**
 * Where a circuit's events physically are.
 *
 * Fatigue used to charge a flat +7 for playing a different circuit to last
 * week, which treated driving from one domestic stop to the next exactly like
 * flying from Florida to Kuala Lumpur. Golf's schedule is the most
 * geographically punishing in professional sport and the cost of it is jet
 * lag, not the airfare — which the game was already charging separately.
 */
export const TRAVEL_ZONE = {
  amateur: 'home',
  emerging: 'home',
  domestic: 'home',
  senior: 'home',
  major: 'home',
  intl: 'intl',
  asian: 'asia',
}

// Keys are the two zone names sorted, which is how zoneGap looks them up.
const ZONE_GAP = {
  'home|intl': 1,
  'asia|home': 1.5,
  'asia|intl': 1,
}

/** How far apart two zones are, 0 (same place) to 1.5 (the long way round). */
export function zoneGap(a, b) {
  if (!a || !b || a === b) return 0
  return ZONE_GAP[[a, b].sort().join('|')] ?? 1
}

export const TRAVEL_COST = {
  amateur: 2200,
  emerging: 4500,
  asian: 9000,
  intl: 12000,
  domestic: 11000,
  major: 15000,
  senior: 8000,
}

// --------------------------------------------------------------------- staff

export const STAFF_ROLES = [
  {
    id: 'coach',
    name: 'Swing Coach',
    blurb: 'Drives long-term rating growth and lets offseason training stick.',
    icon: '🏌',
  },
  {
    id: 'caddie',
    name: 'Caddie',
    blurb: 'Course management on the day: fewer blow-ups, better numbers under pressure.',
    icon: '🎒',
  },
  {
    id: 'physio',
    name: 'Physio / Trainer',
    blurb: 'Cuts injury risk and slows the physical decline after 35.',
    icon: '💪',
  },
  {
    id: 'psych',
    name: 'Sports Psychologist',
    blurb: 'Mental rating, slump resistance, and closing out on Sunday.',
    icon: '🧠',
  },
  {
    id: 'agent',
    name: 'Agent',
    blurb: 'Better sponsorship offers and more of them. Takes a cut of prize money.',
    icon: '💼',
  },
]

/**
 * Staff tiers. `q` is quality 0..1; salary is annual.
 * Effects are applied per-role in staff.js.
 */
export const STAFF_TIERS = [
  { tier: 0, label: 'Journeyman', q: 0.2, salary: { coach: 25000, caddie: 45000, physio: 20000, psych: 15000, agent: 0 } },
  { tier: 1, label: 'Solid', q: 0.42, salary: { coach: 70000, caddie: 80000, physio: 45000, psych: 40000, agent: 0 } },
  { tier: 2, label: 'Well regarded', q: 0.62, salary: { coach: 180000, caddie: 130000, physio: 95000, psych: 90000, agent: 0 } },
  { tier: 3, label: 'Elite', q: 0.8, salary: { coach: 420000, caddie: 200000, physio: 190000, psych: 180000, agent: 0 } },
  { tier: 4, label: 'Legendary', q: 0.95, salary: { coach: 900000, caddie: 320000, physio: 350000, psych: 330000, agent: 0 } },
]

/** Agents charge a percentage of prize money instead of a salary. */
export const AGENT_TIERS = [
  { tier: 0, label: 'Local rep', q: 0.2, cut: 0.03, sponsorMult: 0.8 },
  { tier: 1, label: 'Boutique agency', q: 0.45, cut: 0.05, sponsorMult: 1.0 },
  { tier: 2, label: 'Established firm', q: 0.65, cut: 0.06, sponsorMult: 1.25 },
  { tier: 3, label: 'Power broker', q: 0.85, cut: 0.08, sponsorMult: 1.6 },
  { tier: 4, label: 'Superagent', q: 0.97, cut: 0.1, sponsorMult: 2.1 },
]

// ----------------------------------------------------------------- equipment

export const EQUIP_SLOTS = [
  { id: 'driver', name: 'Driver', attrs: { power: 0.62, accuracy: 0.38 } },
  { id: 'irons', name: 'Irons', attrs: { irons: 1.0 } },
  { id: 'wedges', name: 'Wedges', attrs: { shortGame: 1.0 } },
  { id: 'putter', name: 'Putter', attrs: { putting: 1.0 } },
  { id: 'ball', name: 'Ball', attrs: { power: 0.3, irons: 0.3, shortGame: 0.2, consistency: 0.2 } },
]

export const EQUIP_BRANDS = [
  'Kestrel', 'Vantage', 'Northwind', 'Apex Forge', 'Meridian', 'Tempo Golf', 'Sable', 'Ironwood',
]

/** Max stat swing a full bag of cutting-edge gear is worth. */
export const EQUIP_MAX_BONUS = 3.2

// ---------------------------------------------------------------- sponsors

export const SPONSOR_CATEGORIES = [
  { id: 'apparel', name: 'Apparel', exclusive: true, base: 1.0 },
  { id: 'equipment', name: 'Equipment', exclusive: true, base: 1.15, providesGear: true },
  { id: 'watch', name: 'Watch', exclusive: true, base: 0.55 },
  { id: 'auto', name: 'Automotive', exclusive: true, base: 0.6 },
  { id: 'finance', name: 'Financial', exclusive: true, base: 0.9 },
  { id: 'airline', name: 'Airline', exclusive: true, base: 0.4 },
  { id: 'beverage', name: 'Beverage', exclusive: true, base: 0.45 },
  { id: 'insurance', name: 'Insurance', exclusive: true, base: 0.5 },
  { id: 'tech', name: 'Technology', exclusive: true, base: 0.75 },
  { id: 'resort', name: 'Resort & Travel', exclusive: true, base: 0.35 },
]

export const SPONSOR_BRANDS = {
  apparel: ['Fairway & Co.', 'Linkswear', 'Northpoint', 'Caddyshack Apparel', 'Bogey Free'],
  equipment: ['Kestrel', 'Vantage', 'Northwind', 'Apex Forge', 'Meridian'],
  watch: ['Chronomark', 'Halberd', 'Verre & Fils', 'Ostwald'],
  auto: ['Meridian Motors', 'Arvo', 'Continental Auto', 'Kressler'],
  finance: ['Bramwell Capital', 'Sterling Trust', 'Ardent Financial', 'Halvorsen Bank'],
  airline: ['Skyline Air', 'Transglobal', 'Aurora Airways'],
  beverage: ['Ridgeline Water', 'Volt Energy', 'Copperhead Brewing', 'Grove Juice'],
  insurance: ['Sentinel Mutual', 'Harborlight', 'Everguard'],
  tech: ['Lumen Systems', 'Nodal', 'Arcadia Cloud', 'Quantify'],
  resort: ['Bayhead Resorts', 'Coral Point', 'Highland Estates'],
}

// ------------------------------------------------------------------ training

export const TRAINING_OPTIONS = [
  { id: 'power', name: 'Speed training', attr: 'power', blurb: 'Overspeed sticks and a lot of gym time.', fatigue: 8, injury: 0.03 },
  { id: 'accuracy', name: 'Rebuild the swing', attr: 'accuracy', blurb: 'Fix the two-way miss. Uncomfortable, and it costs you early-season form.', fatigue: 6, injury: 0.01 },
  { id: 'irons', name: 'Iron control block', attr: 'irons', blurb: 'Launch monitor, dispersion charts, thousands of balls.', fatigue: 6, injury: 0.01 },
  { id: 'shortGame', name: 'Short game camp', attr: 'shortGame', blurb: 'Six hours a day inside 60 yards.', fatigue: 4, injury: 0 },
  { id: 'putting', name: 'Putting lab', attr: 'putting', blurb: 'New stroke, new grip, a lot of three-footers.', fatigue: 3, injury: 0 },
  { id: 'consistency', name: 'Course management work', attr: 'consistency', blurb: 'Fewer doubles. Boring, effective.', fatigue: 4, injury: 0 },
  { id: 'mental', name: 'Mental performance block', attr: 'mental', blurb: 'Breathing, routine, and honest conversations.', fatigue: 2, injury: 0 },
  { id: 'rest', name: 'Total rest', attr: null, blurb: 'Do nothing. Heal, reset, see your family.', fatigue: -45, injury: -0.05, healing: 2.2 },
  { id: 'balanced', name: 'Balanced offseason', attr: 'all', blurb: 'A bit of everything. Safe.', fatigue: 4, injury: 0.005 },
  {
    id: 'work',
    name: 'Take winter work',
    attr: null,
    blurb: 'Club pro shop, lessons, corporate days. Pays the bills. Costs you the winter.',
    fatigue: -10,
    injury: -0.01,
    work: true,
  },
]

/**
 * What a winter behind the counter and on the lesson tee is worth. Real money
 * at the bottom of the game, and irrelevant once you are winning — which is
 * exactly why it is the option you take when you cannot afford to practise.
 */
export const WINTER_WORK_PAY = 46_000

// -------------------------------------------------------------------- career

export const CAREER_PHASES = [
  { id: 'amateur', label: 'Amateur', test: (p) => p.status === 'amateur' },
  { id: 'rookie', label: 'Promising rookie', test: (p) => p.proYears <= 1 },
  { id: 'rising', label: 'Rising talent', test: (p) => p.age < 27 },
  { id: 'peak', label: 'Peak years', test: (p) => p.age <= 34 },
  { id: 'prime', label: 'Established veteran', test: (p) => p.age <= 39 },
  { id: 'veteran', label: 'Veteran grinder', test: (p) => p.age < SENIOR_AGE },
  { id: 'senior', label: 'Senior circuit', test: () => true },
]

export const MAJOR_NARRATIVE = [
  { min: 0, label: 'Never won the big one', tone: 'bad' },
  { min: 1, label: 'Major champion', tone: 'good' },
  { min: 2, label: 'Multiple major winner', tone: 'good' },
  { min: 4, label: 'All-time great', tone: 'great' },
  { min: 7, label: 'Legendary', tone: 'great' },
  { min: 11, label: 'Greatest of a generation', tone: 'great' },
]
