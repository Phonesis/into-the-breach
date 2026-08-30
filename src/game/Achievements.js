export const ACHIEVEMENT_STORAGE_KEY = 'ww2-rts-achievements';
export const ACHIEVEMENT_VERSION = 1;

export const ACHIEVEMENT_KINDS = {
  medal: { id: 'medal', label: 'Medal' },
  ribbon: { id: 'ribbon', label: 'Service Ribbon' },
  commendation: { id: 'commendation', label: 'Mentioned in Dispatches' },
};

export const ACHIEVEMENTS = [
  {
    id: 'victory-campaign',
    kind: 'medal',
    name: 'Frontline Victory Star',
    citation: 'For winning an operation in Frontline Command.',
    insignia: '★',
    accent: '#d4aa43',
  },
  {
    id: 'victory-assault',
    kind: 'medal',
    name: 'Breakthrough Medal',
    citation: 'For victory while leading or resisting a major breakthrough.',
    insignia: '◆',
    accent: '#c9703d',
  },
  {
    id: 'victory-clearance',
    kind: 'medal',
    name: 'Fortified Line Star',
    citation: 'For taking or holding a prepared defensive sector.',
    insignia: '✦',
    accent: '#899b6c',
  },
  {
    id: 'victory-towerDefense',
    kind: 'medal',
    name: 'Defence of the Line Medal',
    citation: 'For breaking an enemy assault in Hold the Line.',
    insignia: '▼',
    accent: '#6f8f9e',
  },
  {
    id: 'victory-lastStand',
    kind: 'medal',
    name: 'Battle Group Medal',
    citation: 'For destroying the opposing force in Force-on-Force.',
    insignia: '✚',
    accent: '#967a55',
  },
  {
    id: 'victory-tutorial',
    kind: 'ribbon',
    name: 'Combat Training Ribbon',
    citation: 'For completing a victorious live-fire training exercise.',
    insignia: 'Ⅰ',
    accent: '#7f9964',
  },
  {
    id: 'recover-wreck',
    kind: 'medal',
    name: 'Armoured Recovery Cross',
    citation: 'For restoring a knocked-out vehicle to working order with engineers.',
    insignia: '⚙',
    accent: '#a9823e',
  },
  {
    id: 'medic-heal',
    kind: 'ribbon',
    name: 'Field Medical Service Ribbon',
    citation: 'For treating a wounded unit under campaign conditions.',
    insignia: '+',
    accent: '#a95151',
  },
  {
    id: 'field-repair',
    kind: 'ribbon',
    name: 'Field Workshop Ribbon',
    citation: 'For restoring damaged running gear in the field.',
    insignia: '⚒',
    accent: '#a47d48',
  },
  {
    id: 'tank-kill',
    kind: 'medal',
    name: 'Tank Hunter Medal',
    citation: 'For destroying an enemy tank or tank destroyer.',
    insignia: '■',
    accent: '#a67c3d',
  },
  {
    id: 'commander-kill',
    kind: 'medal',
    name: 'Command Disruption Cross',
    citation: 'For eliminating the enemy field commander and breaking their command net.',
    insignia: '✠',
    accent: '#9b5353',
  },
  {
    id: 'destroy-hq',
    kind: 'medal',
    name: 'Headquarters Assault Medal',
    citation: 'For delivering the decisive blow against an enemy headquarters.',
    insignia: '⚑',
    accent: '#b08b40',
  },
  {
    id: 'first-kill',
    kind: 'commendation',
    name: 'First Action Citation',
    citation: 'Mentioned in dispatches for the first confirmed enemy unit destroyed.',
    insignia: '✓',
    accent: '#788b74',
  },
  {
    id: 'artillery-kill',
    kind: 'commendation',
    name: 'Accurate Fire Citation',
    citation: 'Mentioned in dispatches for destroying an enemy with indirect artillery fire.',
    insignia: '•',
    accent: '#8c7350',
  },
  {
    id: 'combined-arms',
    kind: 'ribbon',
    name: 'Combined Arms Ribbon',
    citation: 'For scoring confirmed kills with both foot troops and armoured forces in one battle.',
    insignia: '↔',
    accent: '#71816c',
  },
  {
    id: 'commander-survives',
    kind: 'commendation',
    name: 'Superior’s Commendation',
    citation: 'Commended by superior command for winning with the field commander still operational.',
    insignia: '★',
    accent: '#8b774d',
  },
  {
    id: 'theatre-normandy',
    kind: 'medal',
    name: 'Hedgerow Veteran Star',
    citation: 'For winning an operation in the bocage country of Normandy.',
    insignia: '✦',
    accent: '#71875e',
  },
  {
    id: 'theatre-northAfrica',
    kind: 'medal',
    name: 'Desert Campaign Star',
    citation: 'For winning an operation across the open desert and escarpments.',
    insignia: '☼',
    accent: '#ad8a4c',
  },
  {
    id: 'theatre-easternFront',
    kind: 'medal',
    name: 'Kursk Steel Cross',
    citation: 'For winning an operation on the Eastern Front steppe.',
    insignia: '✚',
    accent: '#748255',
  },
  {
    id: 'theatre-italy',
    kind: 'commendation',
    name: 'Cassino Climber’s Citation',
    citation: 'Mentioned in dispatches for victory in the mountain country of Italy.',
    insignia: '▲',
    accent: '#7a8660',
  },
  {
    id: 'theatre-farEast',
    kind: 'medal',
    name: 'Matanikau Jungle Star',
    citation: 'For winning an operation in the Far East’s jungle and kunai grass.',
    insignia: '❖',
    accent: '#55785b',
  },
  {
    id: 'theatre-berlin',
    kind: 'medal',
    name: 'Berlin Endgame Medal',
    citation: 'For prevailing amid the streets, canals, and ruins of Berlin.',
    insignia: '◆',
    accent: '#8a8172',
  },
  {
    id: 'tank-ace',
    kind: 'medal',
    name: 'Panzer Breaker',
    citation: 'For destroying three enemy tanks or tank destroyers in one operation.',
    insignia: 'Ⅲ',
    accent: '#b07d3f',
  },
  {
    id: 'one-shot-one-kill',
    kind: 'commendation',
    name: 'One Round, One Tank',
    citation: 'Mentioned in dispatches for a single decisive anti-tank-gun round.',
    insignia: '•',
    accent: '#a68550',
  },
  {
    id: 'counter-battery',
    kind: 'ribbon',
    name: 'Counter-Battery Ribbon',
    citation: 'For silencing an enemy gun or artillery piece with indirect fire.',
    insignia: '⇄',
    accent: '#7b876a',
  },
  {
    id: 'decapitation-strike',
    kind: 'medal',
    name: 'Decapitation Strike',
    citation: 'For removing the enemy commander before delivering the final blow at HQ.',
    insignia: '✠',
    accent: '#9b5c4c',
  },
  {
    id: 'all-sectors-held',
    kind: 'ribbon',
    name: 'Whole Front Ribbon',
    citation: 'For ending a capture-point operation with every sector held.',
    insignia: '↔',
    accent: '#657e68',
  },
  {
    id: 'iron-man-operation',
    kind: 'medal',
    name: 'Iron Man Operation',
    citation: 'For winning without losing or surrendering a single friendly unit.',
    insignia: '♜',
    accent: '#9d8148',
  },
  {
    id: 'last-reserves',
    kind: 'commendation',
    name: 'Last Reserves',
    citation: 'Mentioned in dispatches for winning with ten or fewer supplies remaining.',
    insignia: '10',
    accent: '#88765b',
  },
  {
    id: 'silent-battery',
    kind: 'commendation',
    name: 'No Call for Fire',
    citation: 'For winning a Frontline Command or Breakthrough operation without off-map support.',
    insignia: '∅',
    accent: '#718073',
  },
];

const BY_ID = new Map(ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]));

function getStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function emptyRecord() {
  return { version: ACHIEVEMENT_VERSION, unlocked: {} };
}

function normalizeRecord(value) {
  const record = emptyRecord();
  if (!value || typeof value !== 'object' || !value.unlocked || typeof value.unlocked !== 'object') {
    return record;
  }
  for (const [id, entry] of Object.entries(value.unlocked)) {
    if (!BY_ID.has(id) || !entry || typeof entry !== 'object') continue;
    record.unlocked[id] = {
      unlockedAt: typeof entry.unlockedAt === 'string' ? entry.unlockedAt : null,
      factionId: typeof entry.factionId === 'string' ? entry.factionId : null,
      modeId: typeof entry.modeId === 'string' ? entry.modeId : null,
    };
  }
  return record;
}

export function readAchievements() {
  const store = getStorage();
  if (!store) return emptyRecord();
  try {
    const raw = store.getItem(ACHIEVEMENT_STORAGE_KEY);
    return raw ? normalizeRecord(JSON.parse(raw)) : emptyRecord();
  } catch {
    return emptyRecord();
  }
}

function writeAchievements(value) {
  const normalized = normalizeRecord(value);
  const store = getStorage();
  if (!store) return normalized;
  try {
    store.setItem(ACHIEVEMENT_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Achievement feedback should never interrupt the battle if storage is unavailable.
  }
  return normalized;
}

export function getAchievement(id) {
  return BY_ID.get(id) ?? null;
}

export function unlockAchievement(id, context = {}) {
  const achievement = getAchievement(id);
  if (!achievement) return { achievement: null, newlyUnlocked: false, record: readAchievements() };
  const record = readAchievements();
  if (record.unlocked[id]) return { achievement, newlyUnlocked: false, record };

  record.unlocked[id] = {
    unlockedAt: new Date().toISOString(),
    factionId: context.factionId ?? null,
    modeId: context.modeId ?? null,
  };
  const saved = writeAchievements(record);
  return { achievement, newlyUnlocked: true, record: saved };
}

export function achievementCompletion(record = readAchievements()) {
  const unlocked = ACHIEVEMENTS.filter((achievement) => !!record.unlocked[achievement.id]).length;
  return { unlocked, total: ACHIEVEMENTS.length };
}
