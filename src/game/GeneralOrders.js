import {
  GENERAL_ORDER_COOLDOWN_SEC,
  GENERAL_ORDER_DURATION_SEC,
  GENERAL_ORDER_LIST,
  HOLD_GROUND_RETREAT_MULT,
} from '../data/generalOrders.js';
import { startRetreat, clearRetreat, resolveRetreatHq } from './RetreatBehavior.js';

const PLAYER = 'player';
const HQ_REACHED_DIST = 18;

function makeCooldowns() {
  return Object.fromEntries(GENERAL_ORDER_LIST.map((o) => [o.id, 0]));
}

function canReceiveOrder(unit) {
  if (!unit || unit.dead || unit.team !== PLAYER) return false;
  if (unit.surrendered || unit._captureExit || unit._dropping) return false;
  return true;
}

/** Player HQ, or Clear Defenses starting/staging zone when there is no HQ. */
function playerHq(game) {
  return resolveRetreatHq(
    { team: PLAYER },
    game.hqs,
    { clearance: game.clearance, mapDef: game.mapDef }
  );
}

function distToHq(unit, hq) {
  const dx = unit.position.x - hq.position.x;
  const dz = unit.position.z - hq.position.z;
  return Math.hypot(dx, dz);
}

export class GeneralOrdersManager {
  constructor(game) {
    this.game = game;
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

  isReady(type) {
    return (this.cooldowns[type] ?? 0) <= 0 && !this.active;
  }

  getCooldownRemaining(type) {
    return Math.max(0, this.cooldowns[type] ?? 0);
  }

  issue(type) {
    if (!GENERAL_ORDER_LIST.some((o) => o.id === type)) return false;
    if (this.active?.type === type) return this.cancelActive();
    if (!this.isReady(type)) return false;
    if (!this.game.running || this.game.gameOver) return false;

    const hq = playerHq(this.game);
    if (!hq) return false;

    if (type === 'fullRetreat') {
      this._applyFullRetreat(hq);
    }

    this.active = { type, remaining: GENERAL_ORDER_DURATION_SEC };
    this.cooldowns[type] = GENERAL_ORDER_COOLDOWN_SEC;
    return true;
  }

  cancelActive() {
    if (!this.active) return false;
    const type = this.active.type;
    this.active = null;
    if (type === 'fullRetreat') this._clearCommanderRetreats();
    return true;
  }

  update(dt) {
    for (const id of Object.keys(this.cooldowns)) {
      if (this.cooldowns[id] > 0) this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);
    }

    if (!this.active) return;

    this.active.remaining -= dt;
    if (this.active.type === 'fullRetreat') {
      const hq = playerHq(this.game);
      if (hq) this._enforceFullRetreat(hq);
    }

    if (this.active.remaining <= 0) {
      this.active = null;
    }
  }

  _playerUnits() {
    return this.game._playerAlive ?? this.game.units.filter((u) => u.team === PLAYER && !u.dead);
  }

  _applyFullRetreat(hq) {
    const pathOpts = {
      mapDef: this.game.mapDef,
      scenery: this.game.scenery,
      // The HQ commander speaks first; one throttled unit withdrawal call follows.
      voiceDelay: 2.2,
    };
    for (const unit of this._playerUnits()) {
      if (!canReceiveOrder(unit)) continue;
      if (distToHq(unit, hq) < HQ_REACHED_DIST) continue;
      startRetreat(unit, hq, pathOpts);
    }
  }

  _clearCommanderRetreats() {
    for (const unit of this._playerUnits()) {
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
    for (const unit of this._playerUnits()) {
      if (!canReceiveOrder(unit)) continue;
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
  if (!manager?.active || unit.team !== PLAYER) return 1;
  if (manager.active.type === 'holdGround') return HOLD_GROUND_RETREAT_MULT;
  return 1;
}
