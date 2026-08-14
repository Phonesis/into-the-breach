import {
  GENERAL_ORDER_COOLDOWN_SEC,
  GENERAL_ORDER_DURATION_SEC,
  GENERAL_ORDER_LIST,
  HOLD_GROUND_RETREAT_MULT,
} from '../data/generalOrders.js';
import { startRetreat, clearRetreat, resolveRetreatHq } from './RetreatBehavior.js';
import { isCommanderAlive } from './FieldCommander.js';
import { getClearanceStagingAnchor } from './ClearanceMode.js';

const PLAYER = 'player';
const ENEMY = 'enemy';
const HQ_REACHED_DIST = 18;

function makeCooldowns() {
  return Object.fromEntries(GENERAL_ORDER_LIST.map((o) => [o.id, 0]));
}

function canReceiveOrder(unit, ownerTeam) {
  if (!unit || unit.dead || unit.team !== ownerTeam) return false;
  if (unit.def?.type === 'commander') return false;
  if (unit.surrendered || unit._captureExit || unit._dropping) return false;
  return true;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Enemy Clear Defenses has no HQ, so mirror the player's rally rules. */
function enemyClearanceRallyPoint(game) {
  const mapDef = game.mapDef;
  const playerRole = game.clearanceRole ?? 'attack';

  // When the player attacks, the enemy is the prepared defender and rallies
  // just behind its side of the defensive belt.
  if (playerRole === 'attack') {
    const anchor = getClearanceStagingAnchor(mapDef, 'defend');
    return { team: ENEMY, dead: false, position: { ...anchor.position } };
  }

  // When the player defends, the enemy is the assault force. Its rear assembly
  // is the enemy base pulled away from the player, matching the player's
  // attacker assembly on the opposite side of the map.
  const playerBase = mapDef.playerBase ?? { x: 0, z: 0 };
  const enemyBase = mapDef.enemyBase ?? { x: 0, z: 0 };
  let dx = enemyBase.x - playerBase.x;
  let dz = enemyBase.z - playerBase.z;
  const length = Math.hypot(dx, dz) || 1;
  dx /= length;
  dz /= length;
  const half = (mapDef.size ?? 120) * 0.5 - 6;
  return {
    team: ENEMY,
    dead: false,
    position: {
      x: clamp(enemyBase.x + dx * 24, -half, half),
      z: clamp(enemyBase.z + dz * 24, -half, half),
    },
  };
}

/** Team HQ, or that team's Clear Defenses starting/staging zone. */
function commandRallyPoint(game, ownerTeam) {
  if (game.clearance && game.mapDef) {
    if (ownerTeam === ENEMY) return enemyClearanceRallyPoint(game);
    return getClearanceStagingAnchor(game.mapDef, game.clearanceRole ?? 'attack');
  }
  return resolveRetreatHq(
    { team: ownerTeam },
    game.hqs,
    {
      mapDef: game.mapDef,
    }
  );
}

function distToHq(unit, hq) {
  const dx = unit.position.x - hq.position.x;
  const dz = unit.position.z - hq.position.z;
  return Math.hypot(dx, dz);
}

export class GeneralOrdersManager {
  constructor(game, ownerTeam = PLAYER) {
    this.game = game;
    this.ownerTeam = ownerTeam;
    this.cooldowns = makeCooldowns();
    this.active = null;
  }

  reset() {
    this.cooldowns = makeCooldowns();
    this.active = null;
  }

  isActive() {
    return !!this.active;
  }

  getActiveType() {
    return this.active?.type ?? null;
  }

  getActiveRemaining() {
    return Math.max(0, this.active?.remaining ?? 0);
  }

  hasCommandLink() {
    return isCommanderAlive(this.game, this.ownerTeam);
  }

  isReady(type) {
    return (
      this.hasCommandLink() &&
      (this.cooldowns[type] ?? 0) <= 0 &&
      !this.active
    );
  }

  getCooldownRemaining(type) {
    return Math.max(0, this.cooldowns[type] ?? 0);
  }

  issue(type) {
    if (!GENERAL_ORDER_LIST.some((o) => o.id === type)) return false;
    if (!this.hasCommandLink()) {
      if (this.active) this.cancelActive();
      return false;
    }
    if (this.active?.type === type) return this.cancelActive();
    if (!this.isReady(type)) return false;
    if (!this.game.running || this.game.gameOver) return false;

    const hq = commandRallyPoint(this.game, this.ownerTeam);
    if (type === 'fullRetreat' && !hq) return false;

    if (type === 'fullRetreat') {
      this._applyFullRetreat(hq);
    }
    if (type === 'digIn' && this._applyDigIn() === 0) return false;

    this.active = { type, remaining: GENERAL_ORDER_DURATION_SEC };
    this.cooldowns[type] = GENERAL_ORDER_COOLDOWN_SEC;
    return true;
  }

  /**
   * Scenario-enforced withdrawal. Unlike a discretionary order, a deadline
   * retreat cannot be blocked by a dead commander, cooldown, or another order.
   */
  forceFullRetreat() {
    if (!this.game.running || this.game.gameOver) return false;
    const hq = commandRallyPoint(this.game, this.ownerTeam);
    if (!hq) return false;

    if (this.active) this.cancelActive();
    this._applyFullRetreat(hq);
    this.active = {
      type: 'fullRetreat',
      remaining: GENERAL_ORDER_DURATION_SEC,
      forced: true,
    };
    this.cooldowns.fullRetreat = Math.max(
      this.cooldowns.fullRetreat ?? 0,
      GENERAL_ORDER_COOLDOWN_SEC
    );
    return true;
  }

  cancelActive() {
    if (!this.active) return false;
    const type = this.active.type;
    this.active = null;
    if (type === 'fullRetreat') this._clearCommanderRetreats();
    if (type === 'digIn') {
      this.game.infantryTrenches?.cancelGeneralOrderDigIn?.(this.ownerTeam);
    }
    return true;
  }

  update(dt) {
    for (const id of Object.keys(this.cooldowns)) {
      if (this.cooldowns[id] > 0) this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);
    }

    if (!this.active) return;

    // Losing the commander immediately ends discretionary command-wide orders.
    // Scenario-forced withdrawals are the exception: the deadline order must
    // still reach the assault force after its field commander has been lost.
    if (!this.active.forced && !this.hasCommandLink()) {
      this.cancelActive();
      return;
    }

    this.active.remaining -= dt;
    if (this.active.type === 'fullRetreat') {
      const hq = commandRallyPoint(this.game, this.ownerTeam);
      if (hq) this._enforceFullRetreat(hq);
    }

    if (this.active.remaining <= 0) {
      this.active = null;
    }
  }

  _teamUnits() {
    const cache = this.ownerTeam === PLAYER ? this.game._playerAlive : this.game._enemyAlive;
    return cache ?? this.game.units.filter((u) => u.team === this.ownerTeam && !u.dead);
  }

  _enemyFocus() {
    const enemyTeam = this.ownerTeam === PLAYER ? ENEMY : PLAYER;
    const cache = enemyTeam === PLAYER ? this.game._playerAlive : this.game._enemyAlive;
    const enemies = (cache ?? this.game.units).filter(
      (unit) => unit.team === enemyTeam && !unit.dead && !unit.surrendered
    );
    if (enemies.length) {
      const total = enemies.reduce(
        (sum, unit) => ({ x: sum.x + unit.position.x, z: sum.z + unit.position.z }),
        { x: 0, z: 0 }
      );
      return { x: total.x / enemies.length, z: total.z / enemies.length };
    }
    return this.ownerTeam === PLAYER
      ? this.game.mapDef?.enemyBase ?? null
      : this.game.mapDef?.playerBase ?? null;
  }

  _applyDigIn() {
    return this.game.infantryTrenches?.orderTeamDigIn?.(
      this.ownerTeam,
      this._teamUnits(),
      this._enemyFocus()
    ) ?? 0;
  }

  _applyFullRetreat(hq) {
    const pathOpts = {
      mapDef: this.game.mapDef,
      scenery: this.game.scenery,
      // The HQ commander speaks first; one throttled unit withdrawal call follows.
      voiceDelay: 2.2,
    };
    for (const unit of this._teamUnits()) {
      if (!canReceiveOrder(unit, this.ownerTeam)) continue;
      if (distToHq(unit, hq) < HQ_REACHED_DIST) continue;
      startRetreat(unit, hq, pathOpts);
    }
  }

  _clearCommanderRetreats() {
    for (const unit of this._teamUnits()) {
      if (!unit.retreating) continue;
      clearRetreat(unit);
      unit.moveTarget = null;
      unit._movePath = null;
      unit._userMoveOrder = false;
    }
  }

  _enforceFullRetreat(hq) {
    const pathOpts = {
      mapDef: this.game.mapDef,
      scenery: this.game.scenery,
      voiceDelay: 2.2,
    };
    for (const unit of this._teamUnits()) {
      if (!canReceiveOrder(unit, this.ownerTeam)) continue;
      if (distToHq(unit, hq) < HQ_REACHED_DIST) continue;
      if (!unit.retreating) {
        startRetreat(unit, hq, pathOpts);
        continue;
      }
      unit.clearAttackOrder?.();
      unit._bunkerEntryId = null;
      // Keep an active detour; only re-seed if the path was lost.
      if (!unit.moveTarget && !unit._movePath?.length) {
        startRetreat(unit, hq, pathOpts);
      }
    }
  }
}

export function getCommanderRetreatMultiplier(unit, manager) {
  if (!manager) return 1;

  // Combat may pass the player and enemy managers together. Keep accepting a
  // single manager for older callers and tests.
  const selected = manager.ownerTeam
    ? manager.ownerTeam === unit.team
      ? manager
      : null
    : manager[unit.team] ?? manager[unit.team === PLAYER ? 'player' : 'enemy']
      ?? (unit.team === PLAYER ? manager : null);
  if (!selected?.active) return 1;
  if (selected.active.type === 'holdGround') return HOLD_GROUND_RETREAT_MULT;
  return 1;
}
