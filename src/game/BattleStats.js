import { UNIT_TYPE_ORDER } from '../data/gameModes.js';
import { DEFENSE_TYPES } from '../data/towerDefense.js';
import { currentCasualtyCount, personnelPerUnit } from '../data/squadSizes.js';
import {
  computeTeamMaterielCost,
  formatUsd1944,
  MATERIEL_COST_NOTE,
} from '../data/battleEconomics.js';

export const UNIT_LOSS_LABELS = {
  commander: 'Field commander',
  commanderBodyguard: 'Commander bodyguards',
  radioOperator: 'Radio operators',
  infantry: 'Riflemen',
  paratrooper: 'Paratroopers',
  medic: 'Medics',
  engineer: 'Engineers',
  vehicleCrew: 'Vehicle crew',
  truckDriver: 'Truck drivers',
  machineGun: 'MG gunners',
  sniper: 'Snipers',
  mortar: 'Mortar crew',
  antiTankGun: 'AT guns',
  armoredCar: 'Armored cars',
  truck: 'Trucks',
  tank: 'Tanks',
  tankDestroyer: 'Tank destroyers',
  superHeavyTank: 'Top-tier tanks',
  artillery: 'Artillery',
};

const DEFENSE_LOSS_LABELS = Object.fromEntries(
  Object.values(DEFENSE_TYPES).map((d) => [d.id, d.name])
);

const DEFENSE_TYPE_ORDER = [
  'bunker',
  'bunkerHeavy',
  'mgNest',
  'mgNestMk2',
  'mortarNest',
  'mortarNestMk2',
  'atGun',
  'atGun88',
  'barbedWire',
  'razorWire',
  'mine',
  'tankTrap',
  'tankTrapHeavy',
  'artillery',
  'artilleryHeavy',
];

export class BattleStats {
  constructor() {
    this.reset();
  }

  reset() {
    this.losses = { player: {}, enemy: {} };
    this.prisonersTaken = { player: {}, enemy: {} };
    this.defenseLosses = { player: {}, enemy: {} };
    this.hqLost = { player: false, enemy: false };
    this._hqRecorded = {};
  }

  recordUnit(unit) {
    if (!unit?.team || unit._lossRecorded) return;
    unit._lossRecorded = true;
    const type = unit.def?.type ?? 'infantry';
    const bucket = this.losses[unit.team];
    bucket[type] = (bucket[type] ?? 0) + 1;
  }

  /** Prisoners marched off the map by this team (captor side). */
  recordCapture(captorTeam, unit) {
    if (captorTeam !== 'player' && captorTeam !== 'enemy') return;
    if (!unit?.def) return;
    const type = unit.def.type ?? 'infantry';
    const bucket = this.prisonersTaken[captorTeam];
    bucket[type] = (bucket[type] ?? 0) + 1;
  }

  recordDefense(typeId, team = 'player') {
    if (!typeId || (team !== 'player' && team !== 'enemy')) return;
    const bucket = (this.defenseLosses[team] ??= {});
    bucket[typeId] = (bucket[typeId] ?? 0) + 1;
  }

  recordDefenseFromEntries(entries) {
    for (const entry of entries ?? []) {
      if (!entry?.destroyed || entry._lossRecorded) continue;
      entry._lossRecorded = true;
      this.recordDefense(entry.typeId, 'player');
    }
  }

  recordHq(team) {
    if (team !== 'player' && team !== 'enemy') return;
    if (this._hqRecorded?.[team]) return;
    if (!this._hqRecorded) this._hqRecorded = {};
    this._hqRecorded[team] = true;
    this.hqLost[team] = true;
  }

  _currentPartialLosses(team, liveUnits = []) {
    const partial = {};
    for (const unit of liveUnits ?? []) {
      if (!unit || unit.team !== team || unit.dead) continue;
      const count = currentCasualtyCount(unit);
      if (count <= 0) continue;
      const type = unit.def?.type ?? 'infantry';
      partial[type] = (partial[type] ?? 0) + count;
    }
    return partial;
  }

  totalLosses(team, { liveUnits = [] } = {}) {
    const bucket = this.losses[team];
    let total = 0;
    for (const [type, unitCount] of Object.entries(bucket)) {
      total += unitCount * personnelPerUnit(type);
    }
    for (const count of Object.values(this._currentPartialLosses(team, liveUnits))) {
      total += count;
    }
    return total;
  }

  totalDefenseLosses(team = 'player') {
    return Object.values(this.defenseLosses[team] ?? {}).reduce((n, c) => n + c, 0);
  }

  totalCaptures(team) {
    const bucket = this.prisonersTaken[team];
    let total = 0;
    for (const [type, unitCount] of Object.entries(bucket)) {
      total += unitCount * personnelPerUnit(type);
    }
    return total;
  }

  formatTeamCaptures(team) {
    const bucket = this.prisonersTaken[team];
    const lines = [];

    for (const type of UNIT_TYPE_ORDER) {
      const unitCount = bucket[type];
      if (unitCount) {
        lines.push(...this._formatLossLines(type, unitCount));
      }
    }

    for (const [type, unitCount] of Object.entries(bucket)) {
      if (!UNIT_TYPE_ORDER.includes(type)) {
        lines.push(...this._formatLossLines(type, unitCount));
      }
    }

    return lines;
  }

  _mergeLossLines(lines) {
    const merged = [];
    const byType = new Map();
    for (const line of lines) {
      const existing = byType.get(line.type);
      if (existing) {
        existing.count += line.count;
        existing.unitCount += Number(line.unitCount) || 0;
        continue;
      }
      const copy = { ...line, unitCount: Number(line.unitCount) || 0 };
      byType.set(line.type, copy);
      merged.push(copy);
    }
    return merged;
  }

  _formatPartialLossLine(type, count) {
    // The commander mesh keeps the officer visible while bodyguards fall, so
    // partial command-group losses are reported as bodyguards. A fully dead
    // commander still uses _formatLossLines() and reports both rows.
    const partialType = type === 'commander' ? 'commanderBodyguard' : type;
    return {
      type: partialType,
      label: UNIT_LOSS_LABELS[partialType] ?? partialType,
      count,
      unitCount: 0,
    };
  }

  formatTeamLosses(team, { liveUnits = [] } = {}) {
    const bucket = this.losses[team];
    const partial = this._currentPartialLosses(team, liveUnits);
    const lines = [];
    const types = [
      ...UNIT_TYPE_ORDER,
      ...Object.keys(bucket),
      ...Object.keys(partial),
    ];
    const seen = new Set();

    for (const type of types) {
      if (seen.has(type)) continue;
      seen.add(type);
      const unitCount = bucket[type];
      if (unitCount) lines.push(...this._formatLossLines(type, unitCount));
      const partialCount = partial[type];
      if (partialCount) lines.push(this._formatPartialLossLine(type, partialCount));
    }

    return this._mergeLossLines(lines);
  }

  _formatLossLine(type, unitCount) {
    return {
      type,
      label: UNIT_LOSS_LABELS[type] ?? type,
      count: unitCount * personnelPerUnit(type),
      unitCount,
    };
  }

  _formatLossLines(type, unitCount) {
    if (type !== 'commander') return [this._formatLossLine(type, unitCount)];
    return [
      {
        type: 'commander',
        label: UNIT_LOSS_LABELS.commander,
        count: unitCount,
        unitCount,
      },
      {
        type: 'commanderBodyguard',
        label: UNIT_LOSS_LABELS.commanderBodyguard,
        count: unitCount * Math.max(0, personnelPerUnit('commander') - 1),
        // The command group is already costed once on the commander row.
        unitCount: 0,
      },
    ];
  }

  formatDefenseLosses(team = 'player') {
    const bucket = this.defenseLosses[team] ?? {};
    const lines = [];

    for (const typeId of DEFENSE_TYPE_ORDER) {
      const n = bucket[typeId];
      if (n) lines.push({ type: typeId, label: DEFENSE_LOSS_LABELS[typeId] ?? typeId, count: n });
    }

    for (const [typeId, n] of Object.entries(bucket)) {
      if (!DEFENSE_TYPE_ORDER.includes(typeId)) {
        lines.push({ type: typeId, label: DEFENSE_LOSS_LABELS[typeId] ?? typeId, count: n });
      }
    }

    return lines;
  }

  buildReport({
    playerName,
    enemyName,
    tutorial,
    towerDefense = false,
    tdEndless = false,
    tdWavesCleared = 0,
    liveUnits = [],
  }) {
    const playerLines = this.formatTeamLosses('player', { liveUnits });
    const enemyLines = this.formatTeamLosses('enemy', { liveUnits });
    const playerDefenseLines = this.formatDefenseLosses('player');
    const playerTotal = this.totalLosses('player', { liveUnits });
    const enemyTotal = this.totalLosses('enemy', { liveUnits });
    const playerDefenseTotal = this.totalDefenseLosses('player');
    const playerCaptureLines = this.formatTeamCaptures('player');
    const enemyCaptureLines = this.formatTeamCaptures('enemy');
    const playerCaptureTotal = this.totalCaptures('player');
    const enemyCaptureTotal = this.totalCaptures('enemy');

    const playerMateriel = computeTeamMaterielCost({
      unitLines: playerLines,
      defenseLines: playerDefenseLines,
      hqLost: this.hqLost.player,
    });
    const enemyMateriel = computeTeamMaterielCost({
      unitLines: enemyLines,
      defenseLines: [],
      hqLost: this.hqLost.enemy,
    });

    return {
      playerName,
      enemyName: tutorial
        ? enemyName
          ? `${enemyName} (practice)`
          : 'Practice target'
        : enemyName,
      playerLines,
      enemyLines,
      playerTotal,
      enemyTotal,
      playerDefenseLines,
      playerDefenseTotal,
      playerCaptureLines,
      enemyCaptureLines,
      playerCaptureTotal,
      enemyCaptureTotal,
      playerHqLost: this.hqLost.player,
      enemyHqLost: this.hqLost.enemy,
      playerMateriel,
      enemyMateriel,
      playerMaterielLabel: formatUsd1944(playerMateriel),
      enemyMaterielLabel: formatUsd1944(enemyMateriel),
      materielNote: MATERIEL_COST_NOTE,
      tutorial,
      towerDefense,
      tdEndless,
      tdWavesCleared,
    };
  }
}
