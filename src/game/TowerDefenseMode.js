import { Unit } from '../units/Unit.js';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { repositionFrontlineVisual } from '../world/Frontline.js';
import { getFrontlineDef } from './AssaultMode.js';
import {
  TD_PREPARE_TIME,
  TD_PREPARE_TIME_BETWEEN,
  TD_WAVES_TO_WIN,
  TD_BREACH_MARGIN,
  TD_KILL_REWARD,
  TD_WAVE_CLEAR_BONUS,
  TD_FRONTLINE_RETREAT_STEP,
  TD_MIN_FRONTLINE_FROM_HQ,
  TD_FRONTLINE_SHIFT_COOLDOWN,
  TD_PLAYER_FRONTLINE_MARGIN,
  isTdHqDefenseStyle,
} from '../data/towerDefense.js';

const PLAYER = 'player';
const ENEMY = 'enemy';

const SECTOR_LABELS = ['Left flank', 'Left sector', 'Center', 'Right sector', 'Right flank'];

/** How wide and multi-pronged assaults become as waves climb (ramps up after ~wave 10). */
export function getWaveAssaultProfile(wave) {
  if (wave <= 2) {
    return {
      sectorCount: 1,
      sectionSpread: 0.14,
      flankSpread: 5,
      depthBase: 22,
      depthVar: 8,
      maxFlankAngle: 0.18,
    };
  }
  if (wave <= 5) {
    return {
      sectorCount: 2,
      sectionSpread: 0.3,
      flankSpread: 12,
      depthBase: 25,
      depthVar: 10,
      maxFlankAngle: 0.38,
    };
  }
  if (wave <= 8) {
    return {
      sectorCount: 3,
      sectionSpread: 0.5,
      flankSpread: 20,
      depthBase: 28,
      depthVar: 12,
      maxFlankAngle: 0.58,
    };
  }
  if (wave <= 11) {
    return {
      sectorCount: 4,
      sectionSpread: 0.7,
      flankSpread: 28,
      depthBase: 32,
      depthVar: 14,
      maxFlankAngle: 0.78,
    };
  }

  const extra = Math.min(wave - 12, 10);
  return {
    sectorCount: 5,
    sectionSpread: 0.9,
    flankSpread: 34 + extra * 2.5,
    depthBase: 36 + extra * 1.2,
    depthVar: 16 + extra * 0.8,
    maxFlankAngle: 1.05 + extra * 0.05,
  };
}

function pickWaveAssaultSectors(wave) {
  const profile = getWaveAssaultProfile(wave);
  const sectors = [];
  for (let i = 0; i < profile.sectorCount; i++) {
    const along =
      profile.sectorCount === 1 ? 0 : (i / (profile.sectorCount - 1) - 0.5) * 2;
    const labelIdx =
      profile.sectorCount === 1
        ? 2
        : Math.round((i / Math.max(1, profile.sectorCount - 1)) * (SECTOR_LABELS.length - 1));
    sectors.push({
      id: i,
      label: SECTOR_LABELS[labelIdx],
      along,
      flankSign: i % 2 === 0 ? -1 : 1,
    });
  }

  for (let i = sectors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [sectors[i], sectors[j]] = [sectors[j], sectors[i]];
  }

  return { profile, sectors };
}

function formatAssaultBrief({ sectors }) {
  if (!sectors?.length) return null;
  if (sectors.length === 1) return 'Assault axis: center of the frontline';
  const names = [...new Set(sectors.map((s) => s.label))];
  if (names.length <= 2) return `Assault sectors: ${names.join(' · ')}`;
  return `Multi-sector assault — ${names.join(' · ')}`;
}

/** Effective frontline — mutable in HQ Defense when the line retreats. */
export function getTdFrontlineDef(game) {
  const td = game?.towerDefense;
  if (td && isTdHqDefenseStyle(td)) {
    const baseFl = getFrontlineDef(game.mapDef);
    return {
      x: td.frontlineX ?? baseFl.x,
      z: td.frontlineZ ?? baseFl.z,
      name: baseFl.name ?? 'Frontline',
    };
  }
  return getFrontlineDef(game.mapDef);
}

/** Axis from player HQ → enemy HQ; perpendicular spans the frontline. */
export function getTdFrontlineBasis(game) {
  const fl = getTdFrontlineDef(game);
  const pb = game.mapDef.playerBase;
  const eb = game.mapDef.enemyBase;
  const axisX = eb.x - pb.x;
  const axisZ = eb.z - pb.z;
  const len = Math.hypot(axisX, axisZ) || 1;
  const enemyDirX = axisX / len;
  const enemyDirZ = axisZ / len;
  return {
    fl,
    pb,
    eb,
    enemyDirX,
    enemyDirZ,
    perpX: -enemyDirZ,
    perpZ: enemyDirX,
    lineLen: game.mapDef.size * 0.72,
  };
}

/** + = past the line toward enemy territory (HQ → frontline axis). */
export function alongTdFrontTowardEnemy(x, z, game) {
  const { fl, pb } = getTdFrontlineBasis(game);
  const fx = fl.x - pb.x;
  const fz = fl.z - pb.z;
  const flen = Math.hypot(fx, fz) || 1;
  return ((x - fl.x) * fx) / flen + ((z - fl.z) * fz) / flen;
}

export function clampToPlayerSideOfFrontline(x, z, game, margin = TD_PLAYER_FRONTLINE_MARGIN) {
  const { fl, pb } = getTdFrontlineBasis(game);
  const fx = fl.x - pb.x;
  const fz = fl.z - pb.z;
  const flen = Math.hypot(fx, fz) || 1;
  const nx = fx / flen;
  const nz = fz / flen;
  const along = (x - fl.x) * nx + (z - fl.z) * nz;
  if (along <= margin) return { x, z };
  return {
    x: x - nx * (along - margin),
    z: z - nz * (along - margin),
  };
}

export function retreatTowerDefenseFrontline(game) {
  const td = game.towerDefense;
  if (!td || !isTdHqDefenseStyle(td)) return false;

  const pb = game.mapDef.playerBase;
  const fl = { x: td.frontlineX, z: td.frontlineZ };
  const dx = pb.x - fl.x;
  const dz = pb.z - fl.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= TD_MIN_FRONTLINE_FROM_HQ) return false;

  const step = Math.min(TD_FRONTLINE_RETREAT_STEP, dist - TD_MIN_FRONTLINE_FROM_HQ);
  td.frontlineX = fl.x + (dx / dist) * step;
  td.frontlineZ = fl.z + (dz / dist) * step;
  td.frontlineShifts = (td.frontlineShifts ?? 0) + 1;

  repositionFrontlineVisual(game.mapDef, game.scene, getTdFrontlineDef(game), game.showFrontline);
  game.defenses?.setFrontlineAxis?.(getTdFrontlineDef(game), pb);
  return true;
}

export function updateHqDefenseFrontlineRetreat(game, dt) {
  const td = game.towerDefense;
  if (!td || !isTdHqDefenseStyle(td)) return;

  td.frontlineShiftCooldown = Math.max(0, (td.frontlineShiftCooldown ?? 0) - dt);
  if (td.frontlineShiftCooldown > 0) return;

  const { fl, pb } = getTdFrontlineBasis(game);
  const toPlayerX = pb.x - fl.x;
  const toPlayerZ = pb.z - fl.z;

  let breached = false;
  for (const u of game._enemyAlive) {
    const vx = u.position.x - fl.x;
    const vz = u.position.z - fl.z;
    if (vx * toPlayerX + vz * toPlayerZ > 0) {
      breached = true;
      break;
    }
  }

  if (breached && retreatTowerDefenseFrontline(game)) {
    td.frontlineShiftCooldown = TD_FRONTLINE_SHIFT_COOLDOWN;
  }
}

export function enforcePlayerFrontlineClamp(game) {
  if (!isTdHqDefenseStyle(game.towerDefense)) return;

  for (const unit of game._playerAlive) {
    if (unit.retreating || unit.surrendered || unit._captureExit) continue;
    const clamped = clampToPlayerSideOfFrontline(unit.position.x, unit.position.z, game);
    if (clamped.x !== unit.position.x || clamped.z !== unit.position.z) {
      unit.position.x = clamped.x;
      unit.position.z = clamped.z;
      unit.position.y = sampleTerrainHeight(clamped.x, clamped.z, game.mapDef);
    }
    if (unit.moveTarget) {
      const mt = clampToPlayerSideOfFrontline(unit.moveTarget.x, unit.moveTarget.z, game);
      unit.moveTarget.x = mt.x;
      unit.moveTarget.z = mt.z;
    }
    if (unit._movePath?.length) {
      for (const wp of unit._movePath) {
        const wpClamped = clampToPlayerSideOfFrontline(wp.x, wp.z, game);
        wp.x = wpClamped.x;
        wp.z = wpClamped.z;
      }
    }
  }
}

function alongFront(x, z, basis) {
  return (x - basis.fl.x) * basis.enemyDirX + (z - basis.fl.z) * basis.enemyDirZ;
}

function clampToMap(x, z, mapDef) {
  const half = mapDef.size * 0.46;
  return {
    x: Math.max(-half, Math.min(half, x)),
    z: Math.max(-half, Math.min(half, z)),
  };
}

function computeSpawnForSector(game, sector, profile) {
  const basis = getTdFrontlineBasis(game);
  const mapDef = game.mapDef;
  const { fl, perpX, perpZ, lineLen, enemyDirX, enemyDirZ } = basis;

  const alongT =
    sector.along * profile.sectionSpread * 0.5 * lineLen +
    (Math.random() - 0.5) * profile.sectionSpread * 0.2 * lineLen;
  const targetX = fl.x + perpX * alongT;
  const targetZ = fl.z + perpZ * alongT;

  const flankAngle =
    profile.maxFlankAngle * sector.flankSign * (0.5 + Math.random() * 0.5) +
    (Math.random() - 0.5) * 0.22;
  const depth = profile.depthBase + Math.random() * profile.depthVar;
  const cos = Math.cos(flankAngle);
  const sin = Math.sin(flankAngle);
  const dirX = enemyDirX * cos - enemyDirZ * sin;
  const dirZ = enemyDirX * sin + enemyDirZ * cos;
  const lateral = (Math.random() - 0.5) * profile.flankSpread;

  let x = targetX + dirX * depth + perpX * lateral;
  let z = targetZ + dirZ * depth + perpZ * lateral;

  if (alongFront(x, z, basis) < 14) {
    x = targetX + enemyDirX * (depth * 0.85);
    z = targetZ + enemyDirZ * (depth * 0.85);
  }

  const clamped = clampToMap(x, z, mapDef);
  return {
    x: clamped.x,
    z: clamped.z,
    targetX,
    targetZ,
    sectorLabel: sector.label,
  };
}

/** @returns {{ wave, phase: 'prepare'|'active', phaseTimer, spawnQueue, spawned, totalToSpawn }} */
export function createTowerDefenseState({
  mapDef,
  difficulty,
  waveMode = 'standard',
  style = 'emplacements',
}) {
  const waveMult = difficulty?.enemyArmyMult ?? 1;
  const endless = waveMode === 'endless';
  const fl = getFrontlineDef(mapDef);
  return {
    wave: 0,
    phase: 'prepare',
    phaseTimer: TD_PREPARE_TIME,
    spawnQueue: [],
    spawned: 0,
    totalToSpawn: 0,
    waveMult,
    waveMode,
    style,
    endless,
    wavesCleared: 0,
    killsThisWave: 0,
    breached: false,
    frontlineX: fl.x,
    frontlineZ: fl.z,
    frontlineShifts: 0,
    frontlineShiftCooldown: 0,
    assaultProfile: null,
    assaultSectors: [],
    assaultBrief: null,
  };
}

export function getWaveComposition(wave, waveMult = 1, endless = false) {
  const w = wave;
  let m = Math.max(1, waveMult);
  if (endless && w > TD_WAVES_TO_WIN) {
    m *= 1 + (w - TD_WAVES_TO_WIN) * 0.06;
  }
  const slots = [];
  const add = (type, count) => {
    const n = Math.max(0, Math.round(count * m));
    if (n > 0) slots.push({ type, count: n });
  };

  add('infantry', 2 + Math.floor(w * 1.1));
  if (w >= 2) add('machineGun', Math.floor((w - 1) / 2));
  if (w >= 3) add('sniper', w >= 5 ? 1 : 0);
  if (w >= 3) add('mortar', Math.max(1, Math.floor((w - 2) / 2)));
  if (w >= 5) add('armoredCar', Math.floor((w - 4) / 2));
  if (w >= 6) add('tank', Math.floor((w - 5) / 2));
  if (w >= 9) add('superHeavyTank', w >= 11 ? 1 : 0);
  if (w >= 8) add('artillery', w >= 10 ? 1 : 0);

  return slots;
}

function buildSpawnQueue(wave, waveMult, endless = false) {
  const slots = getWaveComposition(wave, waveMult, endless);
  const queue = [];
  for (const slot of slots) {
    for (let i = 0; i < slot.count; i++) {
      queue.push(slot.type);
    }
  }
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  return queue;
}

export function startNextWave(td) {
  td.wave += 1;
  td.phase = 'prepare';
  td.phaseTimer = td.wave === 1 ? TD_PREPARE_TIME : TD_PREPARE_TIME_BETWEEN;
  td.spawnQueue = buildSpawnQueue(td.wave, td.waveMult, td.endless);
  td.spawned = 0;
  td.totalToSpawn = td.spawnQueue.length;
  td.killsThisWave = 0;

  const assault = pickWaveAssaultSectors(td.wave);
  td.assaultProfile = assault.profile;
  td.assaultSectors = assault.sectors;
  td.assaultBrief = formatAssaultBrief(assault);
}

function beginActiveWave(td) {
  td.phase = 'active';
  td.phaseTimer = 0;
  td.spawnTimer = 0;
  td.spawnInterval = Math.max(0.35, 2.8 - td.wave * 0.12);
}

/** End prepare phase early (player override). */
export function skipTowerDefensePrepare(game) {
  const td = game?.towerDefense;
  if (!td || td.phase !== 'prepare' || td.phaseTimer <= 0) return false;
  beginActiveWave(td);
  game.ui?.updateTowerDefense?.(game);
  return true;
}

export function updateTowerDefenseMode(game, dt) {
  const td = game.towerDefense;
  if (!td) return;

  td.phaseTimer -= dt;

  if (td.phase === 'prepare') {
    game.ui?.updateTowerDefense?.(game);
    if (td.phaseTimer <= 0) {
      beginActiveWave(td);
      game.ui?.updateTowerDefense?.(game);
    }
    return;
  }

  if (td.phase === 'active') {
    td.spawnTimer = (td.spawnTimer ?? 0) - dt;
    while (td.spawnTimer <= 0 && td.spawnQueue.length > 0) {
      const type = td.spawnQueue.shift();
      spawnWaveUnit(game, type);
      td.spawned += 1;
      td.spawnTimer += td.spawnInterval;
    }

    const enemiesAlive = game._enemyAlive.length;
    if (td.spawnQueue.length === 0 && enemiesAlive === 0) {
      onWaveCleared(game, td);
    }
  }
}

function spawnWaveUnit(game, type) {
  const def = game.enemyFaction.units[type];
  if (!def) return;

  const td = game.towerDefense;
  const sectors = td?.assaultSectors?.length ? td.assaultSectors : pickWaveAssaultSectors(td?.wave ?? 1).sectors;
  const profile = td?.assaultProfile ?? getWaveAssaultProfile(td?.wave ?? 1);
  const sector = sectors[td?.spawned % sectors.length];
  const spawn = computeSpawnForSector(game, sector, profile);

  const unit = new Unit({
    def,
    faction: game.enemyFaction,
    team: ENEMY,
    position: { x: spawn.x, z: spawn.z },
    scene: game.scene,
  });
  unit._mapDef = game.mapDef;
  unit._tdAttacker = true;
  unit._tdFrontlineTarget = { x: spawn.targetX, z: spawn.targetZ };
  unit._tdSpawnSector = spawn.sectorLabel;
  unit.position.y = sampleTerrainHeight(spawn.x, spawn.z, game.mapDef);
  game.units.push(unit);
  game._rebuildUnitCaches();
}

function onWaveCleared(game, td) {
  game.resources.player += TD_WAVE_CLEAR_BONUS + td.wave * 12;
  td.wavesCleared = td.wave;
  game.ui?.updateTowerDefense?.(game);

  if (!td.endless && td.wave >= TD_WAVES_TO_WIN) {
    game.endGame(
      true,
      `All ${TD_WAVES_TO_WIN} assault waves repelled — the frontline holds!`
    );
    return;
  }

  startNextWave(td);
  game.ui?.updateTowerDefense?.(game);
}

function formatEndlessDefeatDetail(td, reason) {
  const n = td?.wavesCleared ?? 0;
  const waveLabel = `${n} wave${n === 1 ? '' : 's'} cleared`;
  if (reason === 'hq') {
    return `Endless mode — ${waveLabel}. Your headquarters was overrun.`;
  }
  return `Endless mode — ${waveLabel}. The frontline was breached.`;
}

export function rewardTowerDefenseKill(game, unit) {
  const td = game.towerDefense;
  if (!td || !unit?.def) return;
  const reward = TD_KILL_REWARD[unit.def.type] ?? 8;
  game.resources.player += reward;
  td.killsThisWave += 1;
}

export function updateTowerDefenseEnemyAI(enemyUnits, game, defenses, dt) {
  const mapDef = game.mapDef;
  const td = game.towerDefense;
  const { fl, pb } = getTdFrontlineBasis(game);
  const advanceX = pb.x - fl.x;
  const advanceZ = pb.z - fl.z;
  const advLen = Math.hypot(advanceX, advanceZ) || 1;
  const ax = advanceX / advLen;
  const az = advanceZ / advLen;

  for (const unit of enemyUnits) {
    if (unit.retreating || unit.surrendered || unit._captureExit) continue;
    if (unit.attackOrder && !unit.attackOrder.dead) continue;

    const toPlayerX = pb.x - fl.x;
    const toPlayerZ = pb.z - fl.z;
    const vx = unit.position.x - fl.x;
    const vz = unit.position.z - fl.z;
    const pastLine = vx * toPlayerX + vz * toPlayerZ > 0;

    if (unit.attackOrder) continue;

    const nearDefense = pickNearestDefenseInRange(unit, defenses);
    if (nearDefense) {
      unit.setAttackOrder(nearDefense);
      continue;
    }

    if (pastLine) {
      unit.clearAttackOrder();
      unit.moveTarget = { x: pb.x + (Math.random() - 0.5) * 6, z: pb.z + (Math.random() - 0.5) * 6 };
    } else {
      unit.clearAttackOrder();
      const target = unit._tdFrontlineTarget;
      const goalX = target?.x ?? fl.x;
      const goalZ = target?.z ?? fl.z;
      unit.moveTarget = {
        x: goalX + ax * (TD_BREACH_MARGIN * 0.5) + (Math.random() - 0.5) * 8,
        z: goalZ + az * (TD_BREACH_MARGIN * 0.5) + (Math.random() - 0.5) * 8,
      };
    }
  }
}

function pickNearestDefenseInRange(unit, defenses) {
  const targets = defenses?.getAttackTargets?.() ?? [];
  let best = null;
  let bestD = unit.def.range;
  for (const t of targets) {
    if (t.dead) continue;
    const d = Math.hypot(unit.position.x - t.position.x, unit.position.z - t.position.z);
    if (d <= unit.def.range && d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

/**
 * Enemy has breached when any unit crosses the frontline toward the player HQ.
 * Uses dot(enemy - frontline, playerBase - frontline) > 0.
 */
export function checkTowerDefenseBreach(game) {
  const td = game.towerDefense;
  if (!td || td.breached || isTdHqDefenseStyle(td)) return null;

  const fl = getTdFrontlineDef(game);
  const pb = game.mapDef.playerBase;
  const toPlayerX = pb.x - fl.x;
  const toPlayerZ = pb.z - fl.z;
  const len = Math.hypot(toPlayerX, toPlayerZ) || 1;

  for (const u of game._enemyAlive) {
    const vx = u.position.x - fl.x;
    const vz = u.position.z - fl.z;
    const towardPlayer = (vx * toPlayerX + vz * toPlayerZ) / len;
    if (towardPlayer > TD_BREACH_MARGIN) {
      td.breached = true;
      return {
        victory: false,
        detail: 'Enemy forces breached the frontline — your sector has fallen.',
      };
    }
  }
  return null;
}

export function checkTowerDefenseVictory(game) {
  const td = game.towerDefense;
  const breach = checkTowerDefenseBreach(game);
  if (breach) {
    if (td?.endless) {
      return { victory: false, detail: formatEndlessDefeatDetail(td, 'breach') };
    }
    return breach;
  }

  if (game.matchTime < 2) return null;

  const playerHQ = game.hqs.find((h) => h.team === PLAYER);
  if (playerHQ?.dead) {
    if (td?.endless) {
      return { victory: false, detail: formatEndlessDefeatDetail(td, 'hq') };
    }
    return {
      victory: false,
      detail: 'Your headquarters was overrun.',
    };
  }

  return null;
}

export function formatTowerDefenseHud(td) {
  if (!td) return null;
  const hqDefense = isTdHqDefenseStyle(td);
  const secondsLeft = Math.max(0, td.phaseTimer);
  const prepareTotal =
    td.wave <= 1 ? TD_PREPARE_TIME : TD_PREPARE_TIME_BETWEEN;
  const phaseLabel =
    td.phase === 'prepare'
      ? hqDefense
        ? `Prepare forces — ${Math.ceil(secondsLeft)}s`
        : `Prepare defenses — ${Math.ceil(secondsLeft)}s`
      : `Wave ${td.wave} — ${td.spawned}/${td.totalToSpawn} deployed`;
  const countdownTitle =
    td.phase === 'prepare'
      ? td.wave <= 1
        ? 'Assault incoming'
        : 'Next wave'
      : '';
  const assaultLine = td.assaultBrief ? `${td.assaultBrief}.` : '';
  const retreatNote =
    hqDefense && (td.frontlineShifts ?? 0) > 0
      ? ` · Frontline retreated ${td.frontlineShifts}×`
      : '';
  const countdownSubtitle =
    td.phase === 'prepare'
      ? td.endless
        ? hqDefense
          ? `Wave ${td.wave} — endless assault · train at HQ${retreatNote}${assaultLine ? ` · ${assaultLine}` : ''}`
          : `Wave ${td.wave} — endless assault${assaultLine ? ` · ${assaultLine}` : ''}`
        : hqDefense
          ? `Wave ${td.wave} of ${TD_WAVES_TO_WIN} — deploy reinforcements · hold your side of the line${retreatNote}${assaultLine ? ` · ${assaultLine}` : ''}`
          : `Wave ${td.wave} of ${TD_WAVES_TO_WIN} — fortify the frontline${assaultLine ? ` · ${assaultLine}` : ''}`
      : '';
  return {
    wave: td.wave,
    maxWaves: td.endless ? null : TD_WAVES_TO_WIN,
    endless: !!td.endless,
    hqDefense,
    frontlineShifts: td.frontlineShifts ?? 0,
    wavesCleared: td.wavesCleared ?? 0,
    phase: td.phase,
    phaseLabel,
    phaseTimer: secondsLeft,
    secondsLeft,
    prepareTotal,
    prepareProgress: prepareTotal > 0 ? secondsLeft / prepareTotal : 0,
    countdownTitle,
    countdownSubtitle,
    assaultBrief: td.assaultBrief ?? null,
  };
}