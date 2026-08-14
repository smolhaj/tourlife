// Name pools by region. Nothing here maps to a real tour professional; the
// pools are ordinary given/family names combined at random.

export const REGIONS = [
  { id: 'usa', name: 'United States', flag: '🇺🇸', weight: 30 },
  { id: 'eng', name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', weight: 8 },
  { id: 'sco', name: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', weight: 4 },
  { id: 'irl', name: 'Ireland', flag: '🇮🇪', weight: 4 },
  { id: 'aus', name: 'Australia', flag: '🇦🇺', weight: 7 },
  { id: 'rsa', name: 'South Africa', flag: '🇿🇦', weight: 5 },
  { id: 'jpn', name: 'Japan', flag: '🇯🇵', weight: 7 },
  { id: 'kor', name: 'South Korea', flag: '🇰🇷', weight: 7 },
  { id: 'esp', name: 'Spain', flag: '🇪🇸', weight: 5 },
  { id: 'swe', name: 'Sweden', flag: '🇸🇪', weight: 4 },
  { id: 'arg', name: 'Argentina', flag: '🇦🇷', weight: 3 },
  { id: 'can', name: 'Canada', flag: '🇨🇦', weight: 4 },
  { id: 'ger', name: 'Germany', flag: '🇩🇪', weight: 3 },
  { id: 'fra', name: 'France', flag: '🇫🇷', weight: 3 },
  { id: 'ind', name: 'India', flag: '🇮🇳', weight: 3 },
  { id: 'tha', name: 'Thailand', flag: '🇹🇭', weight: 3 },
]

const FIRST = {
  western: [
    'Cole', 'Brady', 'Miles', 'Grant', 'Reid', 'Tanner', 'Beau', 'Chase', 'Jack', 'Owen',
    'Wyatt', 'Hudson', 'Levi', 'Bryce', 'Rory', 'Dean', 'Kyle', 'Trent', 'Sawyer', 'Rhett',
    'Jonah', 'Everett', 'Preston', 'Weston', 'Duke', 'Rex', 'Colt', 'Brooks', 'Davis', 'Palmer',
    'Emmett', 'Graham', 'Harrison', 'Spencer', 'Gage', 'Bennett', 'Carson', 'Dalton', 'Foster', 'Knox',
    'Lane', 'Maddox', 'Nash', 'Porter', 'Quinn', 'Sullivan', 'Tate', 'Vaughn', 'Walker', 'Zane',
    'Adrian', 'Blake', 'Calvin', 'Damon', 'Elliot', 'Finley', 'Gideon', 'Hayes', 'Isaac', 'Jasper',
  ],
  britIsles: [
    'Callum', 'Fergus', 'Angus', 'Declan', 'Eoin', 'Niall', 'Padraig', 'Seamus', 'Struan', 'Lachlan',
    'Alistair', 'Gareth', 'Rhys', 'Dylan', 'Iwan', 'Hamish', 'Duncan', 'Malcolm', 'Ewan', 'Ruaridh',
    'Oliver', 'Freddie', 'Toby', 'Rupert', 'Nigel', 'Barnaby', 'Alfie', 'Charlie', 'Reggie', 'Wilf',
  ],
  nordic: [
    'Anton', 'Viktor', 'Emil', 'Mattias', 'Jonas', 'Kristoffer', 'Ludvig', 'Elias', 'Rasmus', 'Niklas',
    'Henrik', 'Gustav', 'Sixten', 'Alvar', 'Sigurd', 'Torbjorn', 'Espen', 'Lasse', 'Mikkel', 'Joakim',
  ],
  iberian: [
    'Alvaro', 'Sergio', 'Nacho', 'Iker', 'Pau', 'Bruno', 'Rafa', 'Diego', 'Javier', 'Mateo',
    'Tomas', 'Nicolas', 'Facundo', 'Emiliano', 'Santiago', 'Joaquin', 'Lucas', 'Andres', 'Gonzalo', 'Ramiro',
  ],
  japanese: [
    'Hideo', 'Kenta', 'Ryo', 'Takumi', 'Sho', 'Yuto', 'Daiki', 'Haruto', 'Kazuki', 'Riku',
    'Souta', 'Naoki', 'Yusuke', 'Takeru', 'Hiroto', 'Masaki', 'Keigo', 'Shun', 'Tatsuya', 'Ren',
  ],
  korean: [
    'Sung-min', 'Ji-hoon', 'Min-jae', 'Dae-hyun', 'Joon-ho', 'Seung-woo', 'Tae-yang', 'Hyun-woo', 'Kyung-hoon', 'Sang-hyuk',
    'Jae-won', 'Do-yoon', 'Eun-seok', 'Ho-jin', 'Woo-jin', 'Yong-su', 'Chan-ho', 'Bo-hyun', 'Si-woo', 'Gun-woo',
  ],
  germanic: [
    'Lukas', 'Maximilian', 'Jonas', 'Fabian', 'Tobias', 'Sebastian', 'Florian', 'Marcel', 'Julius', 'Kai',
  ],
  french: [
    'Julien', 'Mathieu', 'Thibault', 'Romain', 'Clement', 'Baptiste', 'Guillaume', 'Antoine', 'Hugo', 'Loic',
  ],
  indian: [
    'Arjun', 'Rohan', 'Vikram', 'Aditya', 'Karan', 'Siddharth', 'Nikhil', 'Rahul', 'Aryan', 'Kabir',
  ],
  thai: [
    'Chatchai', 'Somchai', 'Naret', 'Pravit', 'Anucha', 'Kittipong', 'Thanawat', 'Nattapong', 'Weerachai', 'Panu',
  ],
}

const LAST = {
  western: [
    'Whitmore', 'Callahan', 'Brennan', 'Kingsley', 'Hollis', 'Devereaux', 'Ashcroft', 'Ramsey', 'Stockton',
    'Larkin', 'Merritt', 'Vance', 'Redding', 'Kilgore', 'Pratt', 'Bannister', 'Hargrove', 'Falkner', 'Winslow',
    'Crowder', 'Dunlap', 'Ellsworth', 'Fairbanks', 'Gentry', 'Halloran', 'Ingram', 'Jessup', 'Kendrick', 'Lockhart',
    'Marsden', 'Northrup', 'Oakes', 'Pemberton', 'Quigley', 'Rowntree', 'Standish', 'Thackeray', 'Underhill', 'Vosburgh',
    'Waverly', 'Yarborough', 'Ziegler', 'Abernathy', 'Bledsoe', 'Cardwell', 'Driscoll', 'Easterbrook', 'Fitzgerald', 'Granger',
    'Hatfield', 'Isley', 'Jarrett', 'Keating', 'Ludlow', 'Mabry', 'Nolan', 'Ogden', 'Prescott', 'Radcliffe',
    'Sheridan', 'Tolliver', 'Ulmer', 'Vandergrift', 'Westbrook', 'Yates', 'Zimmer', 'Bishop', 'Calloway', 'Dempsey',
  ],
  britIsles: [
    'Mackay', 'Fraser', 'Buchanan', 'Kinnear', 'Lockerbie', 'Strachan', 'Torrance', 'Cameron', 'Bruce', 'Sinclair',
    'O’Rourke', 'Maguire', 'Doherty', 'Kavanagh', 'Hennessy', 'Fitzpatrick', 'Loughlin', 'Callanan', 'Devlin', 'Rafferty',
    'Pemberley', 'Fairclough', 'Wainwright', 'Attenborough', 'Cholmondeley', 'Bexley', 'Harcourt', 'Standen', 'Ellingham', 'Marlowe',
  ],
  nordic: [
    'Bergstrom', 'Lindqvist', 'Hedlund', 'Sjoberg', 'Norling', 'Alfredsson', 'Wikstrom', 'Dahlberg', 'Ekstrand', 'Nyquist',
    'Aalborg', 'Halvorsen', 'Kjeldsen', 'Sorheim', 'Mikkelsen', 'Rasmussen', 'Vinge', 'Ostlund', 'Sandvik', 'Brekke',
  ],
  iberian: [
    'Olazabal', 'Del Rio', 'Iglesias', 'Montoya', 'Vargas', 'Serrano', 'Quintana', 'Barrera', 'Escobar', 'Villalobos',
    'Zabala', 'Arrieta', 'Bustamante', 'Cabrera', 'Duarte', 'Espinosa', 'Fuentes', 'Guerrero', 'Herrera', 'Jimenez',
  ],
  japanese: [
    'Tanabe', 'Kurosawa', 'Fujimoto', 'Nakagawa', 'Ishikawa', 'Morimoto', 'Sugiyama', 'Hasegawa', 'Kobayashi', 'Yamashita',
    'Okamoto', 'Shibata', 'Nishimura', 'Takahashi', 'Uchida', 'Miyazaki', 'Aoki', 'Hirano', 'Sakamoto', 'Terada',
  ],
  korean: [
    'Kang', 'Park', 'Lim', 'Shin', 'Yoon', 'Cho', 'Han', 'Bae', 'Seo', 'Nam',
    'Hwang', 'Moon', 'Jang', 'Song', 'Oh', 'Chung', 'Ryu', 'Ahn', 'Koo', 'Jeon',
  ],
  germanic: [
    'Baumgartner', 'Rennweg', 'Schellhorn', 'Krieger', 'Vogelsang', 'Lindemann', 'Hofmann', 'Wenzel', 'Bergmann', 'Reinhardt',
  ],
  french: [
    'Delacroix', 'Beaumont', 'Rochefort', 'Lavoisier', 'Perrin', 'Marchand', 'Chevalier', 'Fontaine', 'Bouchard', 'Renaud',
  ],
  indian: [
    'Chauhan', 'Bhatia', 'Reddy', 'Iyer', 'Malhotra', 'Sandhu', 'Kapoor', 'Nair', 'Grewal', 'Deshpande',
  ],
  thai: [
    'Wongsawat', 'Sirichai', 'Thongchai', 'Rattanakorn', 'Bunnag', 'Chaiyaporn', 'Suwanphan', 'Piriyapong', 'Meechai', 'Kraisorn',
  ],
}

const POOL_BY_REGION = {
  usa: 'western',
  can: 'western',
  aus: 'western',
  rsa: 'western',
  eng: 'britIsles',
  sco: 'britIsles',
  irl: 'britIsles',
  swe: 'nordic',
  esp: 'iberian',
  arg: 'iberian',
  jpn: 'japanese',
  kor: 'korean',
  ger: 'germanic',
  fra: 'french',
  ind: 'indian',
  tha: 'thai',
}

export function regionById(id) {
  return REGIONS.find((r) => r.id === id) || REGIONS[0]
}

export function randomRegion(rng) {
  return rng.pickWeighted(REGIONS, (r) => r.weight)
}

export function makeName(rng, regionId, taken) {
  const pool = POOL_BY_REGION[regionId] || 'western'
  for (let attempt = 0; attempt < 40; attempt++) {
    const first = rng.pick(FIRST[pool])
    const last = rng.pick(LAST[pool])
    const full = `${first} ${last}`
    if (!taken || !taken.has(full)) {
      taken?.add(full)
      return { first, last, full }
    }
  }
  // Fall back to an initial when the pool is exhausted.
  const first = rng.pick(FIRST[pool])
  const last = rng.pick(LAST[pool])
  const mid = String.fromCharCode(65 + rng.int(0, 25))
  const full = `${first} ${mid}. ${last}`
  taken?.add(full)
  return { first, last, full }
}

const NICKNAMES = [
  'The Machine', 'Ice', 'Bomber', 'The Professor', 'Sunday', 'Hurricane', 'The Wall', 'Smooth',
  'The Surgeon', 'Boomer', 'Cool Hand', 'The Metronome', 'Thunder', 'The Closer', 'Silk',
  'The Grinder', 'Radar', 'The Ghost', 'Deadeye', 'Big Cat', 'The Anvil', 'Lightning',
]

export function maybeNickname(rng, p) {
  if (!rng.chance(0.22)) return null
  if (p.ratings.power > 78) return rng.pick(['Bomber', 'Thunder', 'Big Cat', 'Boomer'])
  if (p.ratings.putting > 78) return rng.pick(['Deadeye', 'Silk', 'The Closer', 'Cool Hand'])
  if (p.ratings.consistency > 78) return rng.pick(['The Machine', 'The Metronome', 'The Wall'])
  return rng.pick(NICKNAMES)
}
