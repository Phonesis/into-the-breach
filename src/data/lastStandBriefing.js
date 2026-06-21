const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MAP_CONTEXT = {
  normandy: {
    year: 1944,
    month: 6,
    dayMin: 8,
    dayMax: 28,
    operations: [
      'Operation Cobra Spearhead',
      'Hedgerow Breakthrough',
      'Saint-Lô Counterstroke',
      'Cotentin Meeting Engagement',
    ],
    weather: ['Overcast with low cloud', 'Intermittent drizzle', 'Hazy morning, clearing by noon', 'Ground fog lifting by 0900'],
    terrain:
      'The bocage limits fields of fire and channels armor onto sunken lanes. Hedgerows provide natural infantry cover.',
  },
  northAfrica: {
    year: 1942,
    month: 10,
    dayMin: 23,
    dayMax: 31,
    operations: [
      'Operation Lightfoot Probe',
      'Ruweisat Ridge Clash',
      'Desert Meeting Engagement',
      'Tel el Eisa Skirmish',
    ],
    weather: ['Clear and hot', 'Dust haze on the horizon', 'Strong afternoon shamal wind', 'Cool dawn, rising heat by midday'],
    terrain:
      'Open desert offers long sight lines but little cover. Escarpments and wadis break up approach routes.',
  },
  easternFront: {
    year: 1943,
    month: 7,
    dayMin: 5,
    dayMax: 18,
    operations: [
      'Prokhorovka Meeting Engagement',
      'Orel Salient Probe',
      'Steppe Counterattack',
      'Belgorod Road Clash',
    ],
    weather: ['Dry and dusty', 'Thunderstorms on the northern horizon', 'Heavy morning dew', 'Clear steppe skies'],
    terrain:
      'Rolling steppe allows armor room to maneuver. Treelines and ravines offer ambush positions for anti-tank guns.',
  },
  italy: {
    year: 1944,
    month: 1,
    dayMin: 12,
    dayMax: 28,
    operations: [
      'Liri Valley Probe',
      'Cassino Approach Fight',
      'Gustav Line Skirmish',
      'Rapido Meeting Engagement',
    ],
    weather: ['Cold rain', 'Low cloud over the hills', 'Misty valley floor', 'Brief snow flurries on the heights'],
    terrain:
      'Steep hills and river valleys restrict tank movement. Infantry and artillery dominate the approaches.',
  },
};

const HOURS = ['0430', '0615', '0930', '1145', '1415', '1630', '1820'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDay(ctx) {
  const day = ctx.dayMin + Math.floor(Math.random() * (ctx.dayMax - ctx.dayMin + 1));
  return `${day} ${MONTH_NAMES[ctx.month - 1]} ${ctx.year}`;
}

function formatForces(faction) {
  return faction?.name ?? 'Unknown forces';
}

/**
 * @param {{ mapDef: object, playerFaction: object, enemyFaction: object, tactic: object }} params
 */
export function buildLastStandBriefing({ mapDef, playerFaction, enemyFaction, tactic }) {
  const ctx = MAP_CONTEXT[mapDef?.id] ?? {
    year: 1944,
    month: 6,
    dayMin: 1,
    dayMax: 28,
    operations: ['Meeting Engagement'],
    weather: ['Variable conditions'],
    terrain: mapDef?.subtitle ?? 'Contested ground.',
  };

  const date = randomDay(ctx);
  const time = `${pick(HOURS)} hours`;
  const operation = pick(ctx.operations);
  const frontName = mapDef?.frontline?.name ?? mapDef?.name ?? 'the front';
  const playerName = formatForces(playerFaction);
  const enemyName = formatForces(enemyFaction);

  return {
    operation,
    date,
    time,
    location: mapDef?.name ?? 'Unknown sector',
    front: frontName,
    weather: pick(ctx.weather),
    terrain: ctx.terrain,
    situation: `${playerName} and ${enemyName} have made contact near <strong>${frontName}</strong> during <strong>${operation}</strong>. Both commanders have committed their available battle groups — there will be no further reinforcements from corps reserve.`,
    enemyIntel: tactic?.briefing?.intel ?? 'Enemy intentions remain unclear.',
    enemySignal: tactic?.briefing?.signal ?? 'Maintain observation and be ready to adapt.',
    enemyPlan: tactic?.name ?? 'Unknown',
    objective:
      'Destroy all enemy combat elements. Ammunition and medical supplies are finite — every casualty is permanent.',
  };
}