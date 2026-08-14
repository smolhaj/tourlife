import { CIRCUITS, COURSE_TYPE_KEYS } from './constants.js'

export const PLAYING_WEEKS = 44
export const OFFSEASON_WEEK = PLAYING_WEEKS + 1 // weeks 45..48 are the offseason

export const MAJOR_WEEKS = [11, 19, 26, 33]

const VENUE_FIRST = [
  'Cypress', 'Kettering', 'Blackwater', 'Torrey', 'Ravenswood', 'Silverthorn', 'Harrowgate', 'Bellhaven',
  'Windmere', 'Ashford', 'Copperfield', 'Dunmore', 'Elderbrook', 'Foxglove', 'Grayling', 'Hollowmere',
  'Inverleith', 'Jasperlee', 'Kilmarth', 'Larkspur', 'Mossbank', 'Northgate', 'Oakhurst', 'Pinewild',
  'Quarrystone', 'Redhawk', 'Stonebridge', 'Thistledown', 'Underwood', 'Vermilion', 'Whitesands', 'Yarrow',
  'Amberfield', 'Brackenmoor', 'Carrickmore', 'Driftwood', 'Eaglecrest', 'Fernhollow', 'Glenravel', 'Hartsmere',
]

const VENUE_SECOND = [
  'Downs', 'Bluff', 'Dunes', 'Ridge', 'Links', 'Park', 'National', 'Golf Club', 'Country Club',
  'Head', 'Point', 'Hollow', 'Commons', 'Highlands', 'Meadows', 'Springs', 'Cove', 'Valley',
]

const EVENT_SUFFIX = ['Open', 'Classic', 'Championship', 'Invitational', 'Challenge', 'Cup', 'Masters of Golf']

const CITY = {
  domestic: ['Charlotte', 'Scottsdale', 'Hilton Point', 'Fort Warren', 'Sea Island', 'Napa', 'Memphis', 'Hartford', 'Reno', 'Palm Harbor', 'Silvado', 'Greenbrier'],
  intl: ['Wentworth', 'Dubai', 'Melbourne', 'Johannesburg', 'Barcelona', 'Munich', 'Stockholm', 'Auckland', 'Rio', 'Paris', 'Doha', 'Cape Town'],
  emerging: ['Boise', 'Wichita', 'Chattanooga', 'Springfield', 'Bakersfield', 'Omaha', 'Savannah', 'Tulsa', 'Lubbock', 'Erie'],
  asian: ['Seoul', 'Osaka', 'Bangkok', 'Kuala Lumpur', 'Taipei', 'Manila', 'Shenzhen', 'Delhi', 'Ho Chi Minh City', 'Jakarta'],
  senior: ['Sarasota', 'Tucson', 'Bend', 'Asheville', 'Kohler', 'Newport', 'Boca', 'Traverse City'],
  amateur: ['County Line', 'Riverbend', 'Two Rivers', 'Millfield', 'Coldstream', 'Pine Barrens'],
}

/** The four majors are fixed fixtures with their own character. */
export const MAJORS = [
  {
    id: 'maj_magnolia',
    name: 'The Magnolia Invitational',
    shortName: 'Magnolia',
    venue: 'Magnolia National',
    fixedVenue: true,
    week: MAJOR_WEEKS[0],
    courseType: 'classic',
    difficulty: 1.12,
    basePurse: 20000000,
    fieldSize: 92,
    cutSize: 50,
    blurb: 'Same course every April. Everyone has known the greens since they were fifteen and nobody has solved them.',
  },
  {
    id: 'maj_national',
    name: 'The National Open',
    shortName: 'National Open',
    venue: null,
    week: MAJOR_WEEKS[1],
    courseType: 'brutal',
    difficulty: 1.28,
    basePurse: 21500000,
    fieldSize: 156,
    cutSize: 60,
    blurb: 'Six-inch rough, greens like linoleum. Par is a score worth defending.',
  },
  {
    id: 'maj_links',
    name: 'The Open Links Championship',
    shortName: 'Open Links',
    venue: null,
    week: MAJOR_WEEKS[2],
    courseType: 'links',
    difficulty: 1.18,
    basePurse: 19000000,
    fieldSize: 156,
    cutSize: 65,
    blurb: 'The oldest one. Wind, pot bunkers, and whichever half of the draw got the good weather.',
  },
  {
    id: 'maj_continental',
    name: 'The Continental Championship',
    shortName: 'Continental',
    venue: null,
    week: MAJOR_WEEKS[3],
    courseType: 'bomber',
    difficulty: 1.16,
    basePurse: 20500000,
    fieldSize: 156,
    cutSize: 65,
    blurb: 'The strongest field of the year, on a course long enough to reward it.',
  },
]

export const SENIOR_MAJOR_IDS = ['sen_tradition', 'sen_seniorOpen', 'sen_legends']

function venueName(rng, taken) {
  for (let i = 0; i < 30; i++) {
    const n = `${rng.pick(VENUE_FIRST)} ${rng.pick(VENUE_SECOND)}`
    if (!taken.has(n)) {
      taken.add(n)
      return n
    }
  }
  return `${rng.pick(VENUE_FIRST)} ${rng.pick(VENUE_SECOND)} No. ${rng.int(2, 9)}`
}

function eventName(rng, circuit, venue, city, flagship) {
  const roll = rng.next()
  if (flagship) {
    return rng.chance(0.5) ? `The ${city} Championship` : `The ${venue.split(' ')[0]} Invitational`
  }
  if (roll < 0.4) return `The ${city} ${rng.pick(EVENT_SUFFIX)}`
  if (roll < 0.7) return `The ${venue.split(' ')[0]} ${rng.pick(EVENT_SUFFIX)}`
  return `${city} ${rng.pick(EVENT_SUFFIX)}`
}

const CIRCUIT_PURSE = {
  domestic: [8200000, 9500000],
  intl: [3400000, 5200000],
  emerging: [700000, 1100000],
  asian: [1300000, 2400000],
  senior: [2000000, 3200000],
  amateur: [0, 0],
}

const CIRCUIT_COUNT = {
  domestic: 40,
  intl: 40,
  emerging: 26,
  asian: 24,
  senior: 26,
  amateur: 18,
}

/**
 * Setup severity by circuit. Development-tour venues are short and soft and
 * get torn up; the big tours rent out proper championship courses.
 */
const CIRCUIT_DIFFICULTY = {
  domestic: 0,
  intl: 0.02,
  emerging: -0.13,
  asian: -0.05,
  senior: -0.08,
  amateur: -0.17,
}

const CIRCUIT_COURSE_BIAS = {
  domestic: ['classic', 'classic', 'resort', 'bomber', 'desert', 'precision', 'brutal'],
  intl: ['links', 'links', 'classic', 'desert', 'mountain', 'precision', 'resort', 'bomber'],
  emerging: ['resort', 'classic', 'desert', 'bomber', 'precision'],
  asian: ['resort', 'precision', 'classic', 'mountain', 'bomber'],
  senior: ['resort', 'classic', 'precision', 'desert'],
  amateur: ['classic', 'precision', 'resort', 'links'],
}

/**
 * Build the permanent tournament catalogue. These fixtures persist for the
 * whole career so a player can build a history with individual venues.
 */
export function createFixtures(rng) {
  const takenVenues = new Set(['Magnolia National'])
  const fixtures = []
  const nonMajorWeeks = []
  for (let w = 1; w <= PLAYING_WEEKS; w++) {
    if (!MAJOR_WEEKS.includes(w)) nonMajorWeeks.push(w)
  }

  for (const major of MAJORS) {
    fixtures.push({
      ...major,
      circuit: 'major',
      flagship: true,
      isMajor: true,
      rotating: !major.fixedVenue,
      venuePool: major.fixedVenue
        ? [major.venue]
        : Array.from({ length: 6 }, () => venueName(rng, takenVenues)),
    })
  }

  for (const cid of ['domestic', 'intl', 'emerging', 'asian', 'senior', 'amateur']) {
    const count = CIRCUIT_COUNT[cid]
    const weeks = rng.shuffle(nonMajorWeeks).slice(0, Math.min(count, nonMajorWeeks.length))
    const cities = CITY[cid]
    const [pLo, pHi] = CIRCUIT_PURSE[cid]
    const flagshipIdx = new Set(rng.shuffle(weeks.map((_, i) => i)).slice(0, cid === 'amateur' ? 1 : 4))
    weeks.sort((a, b) => a - b)
    weeks.forEach((week, i) => {
      const venue = venueName(rng, takenVenues)
      const city = cities[i % cities.length]
      const flagship = flagshipIdx.has(i)
      const courseType = rng.pick(CIRCUIT_COURSE_BIAS[cid] || COURSE_TYPE_KEYS)
      const purse = Math.round(rng.float(pLo, pHi) * (flagship ? 2.1 : 1) * 1000) / 1000
      fixtures.push({
        id: `${cid}_${i}`,
        circuit: cid,
        name: eventName(rng, cid, venue, city, flagship),
        venue,
        city,
        week,
        courseType: COURSE_TYPE_KEYS.includes(courseType) ? courseType : 'classic',
        difficulty:
          Math.round(
            (0.86 + rng.next() * 0.34 + (flagship ? 0.06 : 0) + (CIRCUIT_DIFFICULTY[cid] || 0)) * 100,
          ) / 100,
        basePurse: Math.round(purse),
        fieldSize: CIRCUITS[cid].fieldSize,
        cutSize: CIRCUITS[cid].cutSize,
        flagship,
        isMajor: false,
      })
    })
  }

  // Three senior majors, promoted from the ordinary senior schedule.
  const seniorEvents = fixtures.filter((f) => f.circuit === 'senior')
  const promoted = rng.shuffle(seniorEvents).slice(0, 3)
  const seniorMajorNames = ['The Tradition', 'The Senior Open', 'The Legends Championship']
  promoted.forEach((ev, i) => {
    ev.id = SENIOR_MAJOR_IDS[i]
    ev.name = seniorMajorNames[i]
    ev.flagship = true
    ev.seniorMajor = true
    ev.basePurse = Math.round(ev.basePurse * 1.6)
    ev.difficulty = Math.min(1.3, ev.difficulty + 0.08)
  })

  return fixtures
}

/** Purse inflation, ~3.4% a year compounding from the career's first season. */
export function inflation(yearsElapsed) {
  return Math.pow(1.022, yearsElapsed)
}

/**
 * Materialise one season's schedule from the permanent fixtures.
 * Rotating majors pick a venue; purses inflate; a few venues rotate weeks so
 * two seasons never feel identical.
 */
export function buildSeason(fixtures, yearsElapsed, rng) {
  const infl = inflation(yearsElapsed)
  return fixtures.map((f) => {
    const purse = Math.round((f.basePurse * infl) / 10000) * 10000
    let venue = f.venue
    if (f.rotating) venue = f.venuePool[yearsElapsed % f.venuePool.length]
    // Small yearly setup drift keeps a course from being solved forever.
    const difficulty = Math.round((f.difficulty + rng.gauss(0, 0.03)) * 100) / 100
    return {
      id: f.id,
      circuit: f.circuit,
      name: f.name,
      shortName: f.shortName || f.name,
      venue,
      city: f.city,
      week: f.week,
      courseType: f.courseType,
      difficulty: Math.max(0.8, Math.min(1.45, difficulty)),
      purse,
      fieldSize: f.fieldSize,
      cutSize: f.cutSize,
      flagship: !!f.flagship,
      isMajor: !!f.isMajor,
      seniorMajor: !!f.seniorMajor,
      blurb: f.blurb,
    }
  })
}

export function eventsInWeek(season, week) {
  return season.filter((e) => e.week === week)
}

export function isOffseasonWeek(week) {
  return week > PLAYING_WEEKS
}
