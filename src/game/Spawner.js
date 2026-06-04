import { Unit } from '../units/Unit.js';

const PLAYER_ARMY = [
  { type: 'infantry', count: 3, spread: 6 },
  { type: 'machineGun', count: 1, spread: 5 },
  { type: 'sniper', count: 1, spread: 5 },
  { type: 'mortar', count: 1, spread: 5 },
  { type: 'armoredCar', count: 1, spread: 5 },
  { type: 'antiTankGun', count: 1, spread: 4 },
  { type: 'tank', count: 2, spread: 5 },
  { type: 'artillery', count: 1, spread: 4 },
];

const ENEMY_ARMY = [
  { type: 'infantry', count: 3, spread: 6 },
  { type: 'machineGun', count: 1, spread: 5 },
  { type: 'sniper', count: 1, spread: 5 },
  { type: 'mortar', count: 1, spread: 5 },
  { type: 'armoredCar', count: 1, spread: 5 },
  { type: 'antiTankGun', count: 1, spread: 4 },
  { type: 'tank', count: 1, spread: 5 },
  { type: 'artillery', count: 1, spread: 4 },
];

const ASSAULT_ATTACKER_ARMY = [
  { type: 'infantry', count: 4, spread: 6 },
  { type: 'machineGun', count: 1, spread: 5 },
  { type: 'sniper', count: 1, spread: 5 },
  { type: 'mortar', count: 1, spread: 5 },
  { type: 'armoredCar', count: 1, spread: 5 },
  { type: 'antiTankGun', count: 1, spread: 4 },
  { type: 'tank', count: 2, spread: 5 },
  { type: 'artillery', count: 1, spread: 4 },
];

const ASSAULT_DEFENDER_ARMY = [
  { type: 'infantry', count: 3, spread: 6 },
  { type: 'machineGun', count: 1, spread: 5 },
  { type: 'sniper', count: 1, spread: 5 },
  { type: 'mortar', count: 1, spread: 5 },
  { type: 'armoredCar', count: 1, spread: 5 },
  { type: 'antiTankGun', count: 2, spread: 4 },
  { type: 'tank', count: 1, spread: 5 },
  { type: 'artillery', count: 1, spread: 4 },
];

const TUTORIAL_ARMY = [
  { type: 'infantry', count: 3, spread: 6 },
  { type: 'machineGun', count: 1, spread: 5 },
  { type: 'sniper', count: 1, spread: 5 },
  { type: 'mortar', count: 1, spread: 5 },
  { type: 'armoredCar', count: 1, spread: 5 },
  { type: 'antiTankGun', count: 1, spread: 4 },
  { type: 'tank', count: 1, spread: 5 },
  { type: 'artillery', count: 1, spread: 4 },
];

const CAMPAIGN_PLAYER_ARMY = [
  { type: 'infantry', count: 5, spread: 6 },
  { type: 'machineGun', count: 1, spread: 5 },
  { type: 'sniper', count: 1, spread: 5 },
  { type: 'mortar', count: 1, spread: 5 },
  { type: 'armoredCar', count: 1, spread: 5 },
  { type: 'antiTankGun', count: 1, spread: 4 },
  { type: 'tank', count: 2, spread: 5 },
  { type: 'artillery', count: 1, spread: 4 },
];

const CAMPAIGN_ENEMY_ARMY = [
  { type: 'infantry', count: 5, spread: 6 },
  { type: 'machineGun', count: 1, spread: 5 },
  { type: 'sniper', count: 1, spread: 5 },
  { type: 'mortar', count: 1, spread: 5 },
  { type: 'armoredCar', count: 1, spread: 5 },
  { type: 'antiTankGun', count: 1, spread: 4 },
  { type: 'tank', count: 2, spread: 5 },
  { type: 'artillery', count: 1, spread: 4 },
];

function resolveLayout({ roster, tutorial, team, campaign }) {
  if (Array.isArray(roster)) return roster;
  if (roster === 'assaultAttack') return ASSAULT_ATTACKER_ARMY;
  if (roster === 'assaultDefend') return ASSAULT_DEFENDER_ARMY;
  if (tutorial) return TUTORIAL_ARMY;
  if (campaign) return team === 'enemy' ? CAMPAIGN_ENEMY_ARMY : CAMPAIGN_PLAYER_ARMY;
  return team === 'enemy' ? ENEMY_ARMY : PLAYER_ARMY;
}

function scaleEnemyLayout(layout, armyMult) {
  if (!armyMult || armyMult === 1) return layout;
  return layout
    .map((slot) => ({
      ...slot,
      count: Math.max(1, Math.round(slot.count * armyMult)),
    }))
    .filter((slot) => slot.count > 0);
}

export function spawnArmy({
  faction,
  team,
  base,
  scene,
  offsetSign = 1,
  roster = null,
  tutorial = false,
  enemyArmyMult = 1,
  clearanceSpawn = false,
  mapDef = null,
  campaign = false,
}) {
  let layout = resolveLayout({ roster, tutorial, team, campaign });
  if (team === 'enemy' && !tutorial) {
    layout = scaleEnemyLayout(layout, enemyArmyMult);
  }
  const units = [];
  let row = 0;
  let backAx = 0;
  let backAz = 0;
  if (clearanceSpawn && mapDef?.playerBase && mapDef?.enemyBase) {
    const pb = mapDef.playerBase;
    const eb = mapDef.enemyBase;
    const len = Math.hypot(eb.x - pb.x, eb.z - pb.z) || 1;
    backAx = (pb.x - eb.x) / len;
    backAz = (pb.z - eb.z) / len;
  }

  for (const slot of layout) {
    const def = faction.units[slot.type];
    if (!def) continue;

    for (let i = 0; i < slot.count; i++) {
      const angle = (i / slot.count) * Math.PI * 0.6 - Math.PI * 0.3;
      const dist = slot.spread + (i % 2) * 2;
      let x;
      let z;
      if (clearanceSpawn) {
        const alongBack = 5 + row * 3.2;
        x =
          base.x +
          backAx * alongBack +
          Math.cos(angle) * dist * 0.28;
        z =
          base.z +
          backAz * alongBack +
          Math.sin(angle) * dist +
          (i - slot.count / 2) * 2.2;
      } else {
        x = base.x + Math.cos(angle) * dist * 0.4 + offsetSign * (row * 3 + 2);
        z = base.z + Math.sin(angle) * dist + (i - slot.count / 2) * 2.5;
      }
      if (clearanceSpawn && mapDef) {
        const half = (mapDef.size ?? 120) * 0.5 - 5;
        x = Math.max(-half, Math.min(half, x));
        z = Math.max(-half, Math.min(half, z));
      }
      const position = { x, z };

      units.push(
        new Unit({
          def,
          faction,
          team,
          position,
          scene,
        })
      );
    }
    row++;
  }

  return units;
}