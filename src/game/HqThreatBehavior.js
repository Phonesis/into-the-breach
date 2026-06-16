import * as THREE from 'three';
import { BATTLE_OPENING_TIME } from '../data/gameModes.js';
import { CLEARANCE_CEASEFIRE_TIME } from './ClearanceMode.js';
import {
  HQ_PRESENCE_WARN_RADIUS,
  HQ_SIEGE_RADIUS,
  HQ_DAMAGE_RECENT_SEC,
  HQ_SIEGE_DPS_BY_TYPE,
  HQ_SIEGE_MODE_MULT,
} from '../data/hqThreat.js';

const PLAYER = 'player';

function siegeModeMult(game) {
  if (game.tutorial) return HQ_SIEGE_MODE_MULT.tutorial;
  if (game.lastStand) return HQ_SIEGE_MODE_MULT.lastStand;
  if (game.towerDefense) return HQ_SIEGE_MODE_MULT.towerDefense;
  if (game.clearance) return HQ_SIEGE_MODE_MULT.clearance;
  if (game.assault) return HQ_SIEGE_MODE_MULT.assault;
  if (game.campaign) return HQ_SIEGE_MODE_MULT.campaign;
  return HQ_SIEGE_MODE_MULT.campaign;
}

function enemySiegeWeight(unit) {
  const type = unit.def?.type;
  return HQ_SIEGE_DPS_BY_TYPE[type] ?? 6;
}

function distToHq(unit, hq) {
  const dx = unit.position.x - hq.position.x;
  const dz = unit.position.z - hq.position.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function ensureDangerRing(hq) {
  if (hq._dangerRing || hq.dead || !hq.mesh) return;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(7.2, 8.4, 56),
    new THREE.MeshBasicMaterial({
      color: 0xff3b30,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.32;
  ring.name = 'hqDangerRing';
  ring.renderOrder = 12;
  hq.mesh.add(ring);
  hq._dangerRing = ring;
}

function syncDangerRing(hq, level, pulse) {
  ensureDangerRing(hq);
  const ring = hq._dangerRing;
  if (!ring) return;
  if (level === 'none') {
    ring.material.opacity = 0;
    return;
  }
  const base = level === 'critical' ? 0.82 : level === 'siege' ? 0.62 : 0.38;
  ring.material.opacity = base + Math.sin(pulse * 5.5) * (level === 'critical' ? 0.18 : 0.1);
  ring.material.color.setHex(level === 'critical' ? 0xff2d20 : 0xff5c4d);
}

/**
 * Evaluate player HQ threat, apply presence siege damage, refresh world alert ring.
 * @returns {null | {
 *   level: 'none' | 'warn' | 'siege' | 'critical',
 *   nearby: number,
 *   sieging: number,
 *   siegeDps: number,
 *   hp: number,
 *   maxHp: number,
 *   hpPct: number,
 *   recentlyDamaged: boolean,
 *   directFire: boolean,
 * }}
 */
export function updatePlayerHqThreat(game, dt) {
  const hq = game.hqs?.find((h) => h.team === PLAYER && !h.dead);
  if (!hq || game.gameOver || isLastStandNoHq(game)) {
    if (hq) syncDangerRing(hq, 'none', game.matchTime ?? 0);
    game._hqThreat = null;
    return null;
  }

  if (isOpeningQuiet(game)) {
    syncDangerRing(hq, 'none', game.matchTime ?? 0);
    game._hqThreat = null;
    return null;
  }

  const enemies = game._enemyAlive ?? [];
  let nearby = 0;
  let sieging = 0;
  let siegeDps = 0;

  for (const u of enemies) {
    if (u.dead || u.surrendered) continue;
    const d = distToHq(u, hq);
    if (d <= HQ_PRESENCE_WARN_RADIUS) nearby += 1;
    if (d <= HQ_SIEGE_RADIUS) {
      sieging += 1;
      const falloff = 1 - (d / HQ_SIEGE_RADIUS) * 0.35;
      siegeDps += enemySiegeWeight(u) * falloff;
    }
  }

  const modeMult = siegeModeMult(game);
  siegeDps *= modeMult;

  if (siegeDps > 0 && modeMult > 0) {
    hq.takeDamage(siegeDps * dt);
    hq._lastPresenceDamageAt = game.matchTime;
  }

  const recentMs = HQ_DAMAGE_RECENT_SEC * 1000;
  const recentlyDamaged =
    performance.now() - (hq._lastDamageAtPerf ?? -999999) <= recentMs ||
    game.matchTime - (hq._lastPresenceDamageAt ?? -999) <= HQ_DAMAGE_RECENT_SEC;

  const directFire = enemies.some((u) => !u.dead && u.attackOrder === hq);

  let level = 'none';
  if (hq.hp / hq.maxHp < 0.35 && (sieging > 0 || recentlyDamaged || directFire)) {
    level = 'critical';
  } else if (sieging > 0 || recentlyDamaged || directFire) {
    level = 'siege';
  } else if (nearby > 0) {
    level = 'warn';
  }

  const hpPct = Math.max(0, Math.round((hq.hp / hq.maxHp) * 100));
  const state = {
    level,
    nearby,
    sieging,
    siegeDps,
    hp: hq.hp,
    maxHp: hq.maxHp,
    hpPct,
    recentlyDamaged,
    directFire,
  };

  syncDangerRing(hq, level, game.matchTime ?? 0);
  game._hqThreat = state;
  return state;
}

function isOpeningQuiet(game) {
  if (game.tutorial || game.lastStand || game.towerDefense) return false;
  const quiet = game.clearance ? CLEARANCE_CEASEFIRE_TIME : BATTLE_OPENING_TIME;
  return game.matchTime < quiet;
}

function isLastStandNoHq(game) {
  return !!game.lastStand;
}