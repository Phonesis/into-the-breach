import { Unit } from '../units/Unit.js';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { getFrontlineDef } from './AssaultMode.js';
import {
  TD_PREPARE_TIME,
  TD_PREPARE_TIME_BETWEEN,
  TD_WAVES_TO_WIN,
  TD_BREACH_MARGIN,
  TD_KILL_REWARD,
  TD_WAVE_CLEAR_BONUS,
} from '../data/towerDefense.js';

const PLAYER = 'player';
const ENEMY = 'enemy';

/** @returns {{ wave, phase: 'prepare'|'active', phaseTimer, spawnQueue, spawned, totalToSpawn }} */
export function createTowerDefenseState({ mapDef, difficulty, waveMode = 'standard' }) {
  const waveMult = difficulty?.enemyArmyMult ?? 1;
  const endless = waveMode === 'endless';
  return {
    wave: 0,
    phase: 'prepare',
    phaseTimer: TD_PREPARE_TIME,
    spawnQueue: [],
    spawned: 0,
    totalToSpawn: 0,
    waveMult,
    waveMode,
    endless,
    wavesCleared: 0,
    killsThisWave: 0,
    breached: false,
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
  const base = game.mapDef.enemyBase;
  const fl = getFrontlineDef(game.mapDef);
  const spread = 14 + Math.random() * 10;
  const angle = (Math.random() - 0.5) * 0.8;
  const x = base.x + Math.cos(angle) * spread * 0.3;
  const z = base.z + Math.sin(angle) * spread;

  const unit = new Unit({
    def,
    faction: game.enemyFaction,
    team: ENEMY,
    position: { x, z },
    scene: game.scene,
  });
  unit._mapDef = game.mapDef;
  unit._tdAttacker = true;
  unit.position.y = sampleTerrainHeight(x, z, game.mapDef);
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

export function updateTowerDefenseEnemyAI(enemyUnits, mapDef, td, defenses, dt) {
  const fl = getFrontlineDef(mapDef);
  const pb = mapDef.playerBase;
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
      unit.moveTarget = {
        x: fl.x + ax * (TD_BREACH_MARGIN * 0.5) + (Math.random() - 0.5) * 10,
        z: fl.z + az * (TD_BREACH_MARGIN * 0.5) + (Math.random() - 0.5) * 10,
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
  if (!td || td.breached) return null;

  const fl = getFrontlineDef(game.mapDef);
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
  const secondsLeft = Math.max(0, td.phaseTimer);
  const prepareTotal =
    td.wave <= 1 ? TD_PREPARE_TIME : TD_PREPARE_TIME_BETWEEN;
  const phaseLabel =
    td.phase === 'prepare'
      ? `Prepare defenses — ${Math.ceil(secondsLeft)}s`
      : `Wave ${td.wave} — ${td.spawned}/${td.totalToSpawn} deployed`;
  const countdownTitle =
    td.phase === 'prepare'
      ? td.wave <= 1
        ? 'Assault incoming'
        : 'Next wave'
      : '';
  const countdownSubtitle =
    td.phase === 'prepare'
      ? td.endless
        ? `Wave ${td.wave} — endless assault`
        : `Wave ${td.wave} of ${TD_WAVES_TO_WIN} — fortify the frontline`
      : '';
  return {
    wave: td.wave,
    maxWaves: td.endless ? null : TD_WAVES_TO_WIN,
    endless: !!td.endless,
    wavesCleared: td.wavesCleared ?? 0,
    phase: td.phase,
    phaseLabel,
    phaseTimer: secondsLeft,
    secondsLeft,
    prepareTotal,
    prepareProgress: prepareTotal > 0 ? secondsLeft / prepareTotal : 0,
    countdownTitle,
    countdownSubtitle,
  };
}