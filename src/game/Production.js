import { Unit } from '../units/Unit.js';
import { sampleTerrainHeight } from '../world/Terrain.js';

const MAX_QUEUE = 4;
const SPAWN_RING_DIST = 11;

export class ProductionManager {
  constructor({ getFaction, getTeam, getSpawnPos, getScene, getMapDef, onSpawn, onQueueChange }) {
    this.getFaction = getFaction;
    this.getTeam = getTeam;
    this.getSpawnPos = getSpawnPos;
    this.getScene = getScene;
    this.getMapDef = getMapDef;
    this.onSpawn = onSpawn;
    this.onQueueChange = onQueueChange;
    this.queues = { player: [], enemy: [] };
    this._spawnAngle = { player: 0, enemy: Math.PI };
    this.buildTimeMult = 1;
  }

  reset() {
    this.queues.player = [];
    this.queues.enemy = [];
    this._spawnAngle = { player: 0, enemy: Math.PI };
    this.buildTimeMult = 1;
  }

  setBuildTimeMult(mult) {
    this.buildTimeMult = mult ?? 1;
  }

  canEnqueue(team, unitType, resources) {
    const faction = this.getFaction(team);
    if (!faction) return false;
    const def = faction.units[unitType];
    if (!def) return false;
    const q = this.queues[team];
    const supply = typeof resources === 'number' ? resources : 0;
    return q.length < MAX_QUEUE && supply >= def.cost;
  }

  canAffordAny(team, resources) {
    const faction = this.getFaction(team);
    if (!faction?.units) return false;
    for (const unitType of Object.keys(faction.units)) {
      if (this.canEnqueue(team, unitType, resources)) return true;
    }
    return false;
  }

  enqueue(team, unitType, spendResources) {
    const faction = this.getFaction(team);
    const def = faction?.units[unitType];
    if (!def || this.queues[team].length >= MAX_QUEUE) return false;
    if (!spendResources(def.cost)) return false;

    this.queues[team].push({
      unitType,
      def,
      remaining: def.buildTime * this.buildTimeMult,
    });
    if (this.onQueueChange) this.onQueueChange(team);
    return true;
  }

  update(dt, unitsArray) {
    if (!unitsArray || !Array.isArray(unitsArray)) return;

    for (const team of ['player', 'enemy']) {
      const q = this.queues[team];
      if (q.length === 0) continue;

      const job = q[0];
      job.remaining -= dt;

      if (job.remaining <= 0) {
        q.shift();
        const unit = this._spawn(team, job.def);
        if (unit) {
          unitsArray.push(unit);
          if (this.onSpawn) this.onSpawn(team, job.unitType, unit);
        }
        if (this.onQueueChange) this.onQueueChange(team);
      }
    }
  }

  _spawn(team, def) {
    const faction = this.getFaction(team);
    const base = this.getSpawnPos(team);
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
    return {
      type: job.unitType,
      def: job.def,
      remaining: Math.max(0, job.remaining),
      total: job.def.buildTime,
    };
  }
}