import { Unit } from '../units/Unit.js';
import { sampleTerrainHeight } from '../world/Terrain.js';

const MAX_QUEUE = 4;
const SPAWN_RING_DIST = 11;

export class ProductionManager {
  constructor({
    getFaction,
    getTeam,
    getSpawnPos,
    getScene,
    getMapDef,
    onSpawn,
    onQueueChange,
    getUnlockedUnits = null,
    getPlayerProductionUnits = null,
    isProductionBlocked = null,
    getUnitLimit = null,
    getDeployedUnitCount = null,
  }) {
    this.getFaction = getFaction;
    this.getTeam = getTeam;
    this.getSpawnPos = getSpawnPos;
    this.getUnlockedUnits = getUnlockedUnits;
    this.getPlayerProductionUnits = getPlayerProductionUnits;
    this.isProductionBlocked = isProductionBlocked;
    this.getUnitLimit = getUnitLimit;
    this.getDeployedUnitCount = getDeployedUnitCount;
    this.getScene = getScene;
    this.getMapDef = getMapDef;
    this.onSpawn = onSpawn;
    this.onQueueChange = onQueueChange;
    this.queues = { player: [], enemy: [] };
    this._spawnAngle = { player: 0, enemy: Math.PI };
    this.buildTimeMult = 1;
    this.cheatMode = false;
  }

  reset() {
    this.queues.player = [];
    this.queues.enemy = [];
    this._spawnAngle = { player: 0, enemy: Math.PI };
    this.buildTimeMult = 1;
  }

  setCheatMode(on) {
    this.cheatMode = !!on;
    if (this.cheatMode) {
      for (const job of this.queues.player) job.remaining = 0;
    }
  }

  setBuildTimeMult(mult) {
    this.buildTimeMult = mult ?? 1;
  }

  getUnitCapacity(team) {
    const limit = this.getUnitLimit?.(team);
    if (!Number.isFinite(limit)) return null;
    const deployed = Math.max(0, this.getDeployedUnitCount?.(team) ?? 0);
    const queued = this.queues[team]?.length ?? 0;
    return { limit, deployed, queued, available: Math.max(0, limit - deployed - queued) };
  }

  isAtUnitLimit(team, { includeQueue = true } = {}) {
    const capacity = this.getUnitCapacity(team);
    if (!capacity) return false;
    return capacity.deployed + (includeQueue ? capacity.queued : 0) >= capacity.limit;
  }

  canEnqueue(team, unitType, resources, options = {}) {
    if (this.isProductionBlocked?.(team)) return false;
    const faction = this.getFaction(team);
    if (!faction) return false;
    const def = faction.units[unitType];
    if (!def) return false;
    if (team === 'player' && this.getPlayerProductionUnits && !options.ignoreSelection) {
      const allowed = this.getPlayerProductionUnits(team);
      if (allowed && !allowed.includes(unitType)) return false;
    } else if (team === 'player' && options.ignoreSelection && this.getUnlockedUnits) {
      const unlocked = this.getUnlockedUnits(team);
      if (unlocked && !unlocked.has(unitType)) return false;
    } else if (team !== 'player') {
      const unlocked = this.getUnlockedUnits?.(team);
      if (unlocked && !unlocked.has(unitType)) return false;
    }
    const q = this.queues[team];
    if (q.length >= MAX_QUEUE) return false;
    if (this.isAtUnitLimit(team)) return false;
    if (this.cheatMode && team === 'player') return true;
    const supply = typeof resources === 'number' ? resources : 0;
    return supply >= def.cost;
  }

  canAffordAny(team, resources, options = {}) {
    if (this.cheatMode && team === 'player') {
      return this.queues.player.length < MAX_QUEUE && !this.isAtUnitLimit(team);
    }
    const faction = this.getFaction(team);
    if (!faction?.units) return false;
    let types;
    if (team === 'player' && this.getPlayerProductionUnits && !options.ignoreSelection) {
      const allowed = this.getPlayerProductionUnits(team);
      types = allowed?.length ? allowed.filter((t) => faction.units[t]) : [];
    } else if (team === 'player' && options.ignoreSelection && this.getUnlockedUnits) {
      const unlocked = this.getUnlockedUnits(team);
      types = unlocked
        ? [...unlocked].filter((t) => faction.units[t])
        : Object.keys(faction.units);
    } else {
      const unlocked = this.getUnlockedUnits?.(team);
      types = unlocked
        ? [...unlocked].filter((t) => faction.units[t])
        : Object.keys(faction.units);
    }
    for (const unitType of types) {
      if (this.canEnqueue(team, unitType, resources, options)) return true;
    }
    return false;
  }

  enqueue(team, unitType, spendResources, options = {}) {
    const resources = options.resources;
    if (resources !== undefined && !this.canEnqueue(team, unitType, resources, options)) {
      return false;
    }
    const faction = this.getFaction(team);
    const def = faction?.units[unitType];
    if (!def || this.queues[team].length >= MAX_QUEUE || this.isAtUnitLimit(team)) return false;
    const playerCheat = this.cheatMode && team === 'player';
    if (!playerCheat && !spendResources(def.cost)) return false;

    const buildTime = playerCheat ? 0 : def.buildTime * this.buildTimeMult;
    this.queues[team].push({
      unitType,
      def,
      remaining: buildTime,
    });
    if (this.onQueueChange) this.onQueueChange(team);
    return true;
  }

  update(dt, unitsArray) {
    if (!unitsArray || !Array.isArray(unitsArray)) return;

    for (const team of ['player', 'enemy']) {
      if (this.isProductionBlocked?.(team)) continue;
      if (this.isAtUnitLimit(team, { includeQueue: false })) continue;
      const q = this.queues[team];
      if (q.length === 0) continue;

      const job = q[0];
      job.remaining -= dt;

      if (job.remaining <= 0) {
        q.shift();
        const unit = this._spawn(team, job.def, job.unitType);
        if (unit) {
          unitsArray.push(unit);
          if (this.onSpawn) this.onSpawn(team, job.unitType, unit);
        }
        if (this.onQueueChange) this.onQueueChange(team);
      }
    }
  }

  _spawn(team, def, unitType = def?.type) {
    const faction = this.getFaction(team);
    const base = this.getSpawnPos(team, unitType);
    const mapDef = this.getMapDef();
    const scene = this.getScene();
    if (!faction || !base || !mapDef || !scene) {
      console.warn('Production spawn skipped: missing context', { team, hasFaction: !!faction });
      return null;
    }

    const angle = this._spawnAngle[team];
    this._spawnAngle[team] += 0.85;
    const lane = (this.queues[team]?.length ?? 0) % 4;
    const dist = SPAWN_RING_DIST + lane * 2.5;

    const position = {
      x: base.x + Math.cos(angle) * dist,
      z: base.z + Math.sin(angle) * dist,
    };

    const unit = new Unit({ def, faction, team, position, scene });
    unit._mapDef = mapDef;
    const y = sampleTerrainHeight(unit.position.x, unit.position.z, mapDef);
    unit.position.y = y;

    return unit;
  }

  getQueue(team) {
    return [...this.queues[team]];
  }

  getQueueProgress(team) {
    const q = this.queues[team];
    if (q.length === 0) return null;
    const job = q[0];
    const total =
      this.cheatMode && team === 'player' ? 0 : job.def.buildTime * this.buildTimeMult;
    return {
      type: job.unitType,
      def: job.def,
      remaining: Math.max(0, job.remaining),
      total,
    };
  }
}
