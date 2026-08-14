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
const RETREAT_SLOT_COUNT_PER_RING = 10;
const RETREAT_SLOT_BASE_RADIUS = 12;
const RETREAT_SLOT_RING_SPACING = 5.25;
const RETREAT_SLOT_MIN_SEPARATION = 3.8;

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

function compareUnitIds(a, b) {
  const aId = Number(a?.id);
  const bId = Number(b?.id);
  if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) {
    return aId - bId;
  }
  return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
}

function rallySlotRadius(unit) {
  const type = unit?.def?.type;
  if (type === 'superHeavyTank') return 3.2;
  if (
    type === 'tank' ||
    type === 'tankDestroyer' ||
    type === 'armoredCar'
  ) return 2.6;
  if (type === 'artillery' || type === 'antiTankGun') return 2.2;
  return 1.25;
}

function clampRallyPoint(game, x, z) {
  const half = Math.max(4, (game?.mapDef?.size ?? 120) * 0.5 - 8);
  return {
    x: clamp(x, -half, half),
    z: clamp(z, -half, half),
  };
}

function isRallyPointUsable(unit, point, used, game) {
  const scenery = game?.scenery;
  if (
    scenery?.isMovementBlocked?.(
      point.x,
      point.z,
      rallySlotRadius(unit)
    )
  ) {
    return false;
  }
  return !used.some(
    (other) =>
      Math.hypot(point.x - other.x, point.z - other.z) <
      RETREAT_SLOT_MIN_SEPARATION
  );
}

function buildRetreatRallySlot(unit, hq, index, count, used, game) {
  const ring = Math.floor(index / RETREAT_SLOT_COUNT_PER_RING);
  const ringIndex = index % RETREAT_SLOT_COUNT_PER_RING;
  const ringCount = Math.min(
    RETREAT_SLOT_COUNT_PER_RING,
    Math.max(1, count - ring * RETREAT_SLOT_COUNT_PER_RING)
  );
  const baseRadius =
    RETREAT_SLOT_BASE_RADIUS + Math.min(7, Math.sqrt(Math.max(1, count)) * 1.55);
  const radius = baseRadius + ring * RETREAT_SLOT_RING_SPACING;
  const baseAngle =
    -Math.PI * 0.5 +
    ((ringIndex + (ring % 2 ? 0.5 : 0)) / ringCount) * Math.PI * 2;

  for (let attempt = 0; attempt < 14; attempt++) {
    const direction = attempt === 0
      ? 0
      : Math.ceil(attempt / 2) * 0.16 * (attempt % 2 ? 1 : -1);
    const radial = attempt > 8 ? (attempt - 8) * 1.8 : 0;
    const point = clampRallyPoint(
      game,
      hq.position.x + Math.cos(baseAngle + direction) * (radius + radial),
      hq.position.z + Math.sin(baseAngle + direction) * (radius + radial)
    );
    if (isRallyPointUsable(unit, point, used, game)) return point;
  }

  // A blocked rally ring is unusual (mostly dense urban maps). Keep the slot
  // deterministic and let the ordinary building-aware path find the final
  // approach rather than collapsing every unit onto the HQ centre.
  return clampRallyPoint(
    game,
    hq.position.x + Math.cos(baseAngle) * radius,
    hq.position.z + Math.sin(baseAngle) * radius
  );
}

export class GeneralOrdersManager {
  constructor(game, ownerTeam = PLAYER) {
    this.game = game;
    this.ownerTeam = ownerTeam;
    this.cooldowns = makeCooldowns();
    this.active = null;
    this._retreatOrderSerial = 0;
    this._fullRetreatOrderId = null;
    this._fullRetreatSlots = null;
  }

  reset() {
    this.cooldowns = makeCooldowns();
    this.active = null;
    this._retreatOrderSerial = 0;
    this._fullRetreatOrderId = null;
    this._fullRetreatSlots = null;
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
      // A normal order can replace the currently active order. Scenario-
      // forced retreats remain the one case that cannot be interrupted by a
      // different order.
      !this.active?.forced
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

    const previousActive = this.active;
    if (previousActive) this.cancelActive();

    if (type === 'fullRetreat') {
      this._applyFullRetreat(hq, { playVoice: this.ownerTeam !== PLAYER });
    }
    if (type === 'digIn' && this._applyDigIn() === 0) {
      this._restoreActiveOrder(previousActive);
      return false;
    }

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
    // Victory/deadline checks can be evaluated more than once while the end
    // overlay is being prepared. Do not restart the same withdrawal or replay
    // its command acknowledgement.
    if (this.active?.type === 'fullRetreat' && this.active.forced) {
      const existingHq = commandRallyPoint(this.game, this.ownerTeam);
      if (existingHq) this._enforceFullRetreat(existingHq);
      return false;
    }
    const hq = commandRallyPoint(this.game, this.ownerTeam);
    if (!hq) return false;

    if (this.active) this.cancelActive();
    this._applyFullRetreat(hq, { playVoice: false });
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
      if (this.active.type === 'fullRetreat') this._clearCommanderRetreats();
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

  _restoreActiveOrder(order) {
    if (!order) return;
    if (order.type === 'fullRetreat') {
      const hq = commandRallyPoint(this.game, this.ownerTeam);
      if (hq) this._applyFullRetreat(hq, { playVoice: false });
    }
    if (order.type === 'digIn') this._applyDigIn();
    this.active = { ...order };
  }

  _applyFullRetreat(hq, { playVoice = false } = {}) {
    this._beginFullRetreatPlan(hq);
    const pathOpts = {
      mapDef: this.game.mapDef,
      scenery: this.game.scenery,
      // The player command acknowledgement is the single voice for a
      // command-wide retreat. Enemy AI has no click acknowledgement, so it
      // keeps one throttled unit call for audible battlefield feedback.
      playVoice,
    };
    for (const unit of this._teamUnits().sort(compareUnitIds)) {
      if (!canReceiveOrder(unit, this.ownerTeam)) continue;
      startRetreat(unit, hq, {
        ...pathOpts,
        destination: this._getFullRetreatDestination(unit, hq),
        fullRetreatOrderId: this._fullRetreatOrderId,
        retargetActive: true,
      });
    }
  }

  _clearCommanderRetreats() {
    for (const unit of this._teamUnits()) {
      if (
        !unit.retreating &&
        !unit._fullRetreatOrderId &&
        !unit._fullRetreatRallyHold
      ) continue;
      clearRetreat(unit);
      unit.moveTarget = null;
      unit._movePath = null;
      unit._userMoveOrder = false;
    }
    this._fullRetreatOrderId = null;
    this._fullRetreatSlots = null;
  }

  _enforceFullRetreat(hq) {
    this._ensureFullRetreatPlan(hq);
    const pathOpts = {
      mapDef: this.game.mapDef,
      scenery: this.game.scenery,
      playVoice: false,
    };
    for (const unit of this._teamUnits()) {
      if (!canReceiveOrder(unit, this.ownerTeam)) continue;
      // A saved full-retreat rally hold has no in-memory order token yet.
      // Reattach it to the restored active order before deciding whether it
      // needs another move.
      if (unit._fullRetreatRallyHold && !unit._fullRetreatOrderId) {
        unit._fullRetreatOrderId = this._fullRetreatOrderId;
      }
      const destination = this._getFullRetreatDestination(unit, hq);
      const belongsToThisOrder =
        unit._fullRetreatOrderId === this._fullRetreatOrderId;
      if (!unit.retreating && belongsToThisOrder) continue;
      if (!unit.retreating) {
        startRetreat(unit, hq, {
          ...pathOpts,
          destination,
          fullRetreatOrderId: this._fullRetreatOrderId,
          retargetActive: true,
        });
        continue;
      }
      unit.clearAttackOrder?.();
      unit._bunkerEntryId = null;
      // Keep an active detour; re-seed only if the path was lost or this unit
      // was previously in an organic retreat with a different destination.
      if (
        !belongsToThisOrder ||
        (!unit.moveTarget && !unit._movePath?.length)
      ) {
        startRetreat(unit, hq, {
          ...pathOpts,
          destination,
          fullRetreatOrderId: this._fullRetreatOrderId,
          retargetActive: true,
        });
      }
    }
  }

  _beginFullRetreatPlan(hq) {
    this._fullRetreatOrderId =
      `${this.ownerTeam}:full-retreat:${++this._retreatOrderSerial}`;
    this._fullRetreatSlots = new Map();
    const units = this._teamUnits()
      .filter((unit) => canReceiveOrder(unit, this.ownerTeam))
      .sort(compareUnitIds);
    const used = [];
    for (const [index, unit] of units.entries()) {
      const slot = buildRetreatRallySlot(
        unit,
        hq,
        index,
        units.length,
        used,
        this.game
      );
      this._fullRetreatSlots.set(unit.id, slot);
      used.push(slot);
    }
  }

  _ensureFullRetreatPlan(hq) {
    if (!this._fullRetreatOrderId || !this._fullRetreatSlots) {
      this._beginFullRetreatPlan(hq);
    }
  }

  _getFullRetreatDestination(unit, hq) {
    this._ensureFullRetreatPlan(hq);
    let destination = this._fullRetreatSlots.get(unit.id);
    if (!destination) {
      const used = [...this._fullRetreatSlots.values()];
      destination = buildRetreatRallySlot(
        unit,
        hq,
        used.length,
        used.length + 1,
        used,
        this.game
      );
      this._fullRetreatSlots.set(unit.id, destination);
    }
    return { ...destination };
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
