import { UNIT_TYPE_ORDER } from '../data/gameModes.js';
import { DEFENSE_TYPES } from '../data/towerDefense.js';
import { personnelPerUnit } from '../data/squadSizes.js';
import {
  computeTeamMaterielCost,
  formatUsd1944,
  MATERIEL_COST_NOTE,
} from '../data/battleEconomics.js';

export const UNIT_LOSS_LABELS = {
  infantry: 'Riflemen',
  medic: 'Medics',
  engineer: 'Engineers',
  machineGun: 'MG gunners',
  sniper: 'Snipers',
  mortar: 'Mortar crew',
  antiTankGun: 'AT guns',
  armoredCar: 'Armored cars',
  tank: 'Tanks',
  superHeavyTank: 'Super heavy tanks',
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
    this.defenseLosses = { player: {} };
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
    const bucket = this.defenseLosses[team];
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

  totalLosses(team) {
    const bucket = this.losses[team];
    let total = 0;
    for (const [type, unitCount] of Object.entries(bucket)) {
      total += unitCount * personnelPerUnit(type);
    }
    return total;
  }

  totalDefenseLosses(team = 'player') {
    return Object.values(this.defenseLosses[team]).reduce((n, c) => n + c, 0);
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
        lines.push(this._formatLossLine(type, unitCount));
      }
    }

    for (const [type, unitCount] of Object.entries(bucket)) {
      if (!UNIT_TYPE_ORDER.includes(type)) {
        lines.push(this._formatLossLine(type, unitCount));
      }
    }

    return lines;
  }

  formatTeamLosses(team) {
    const bucket = this.losses[team];
    const lines = [];

    for (const type of UNIT_TYPE_ORDER) {
      const unitCount = bucket[type];
      if (unitCount) lines.push(this._formatLossLine(type, unitCount));
    }

    for (const [type, unitCount] of Object.entries(bucket)) {
      if (!UNIT_TYPE_ORDER.includes(type)) {
        lines.push(this._formatLossLine(type, unitCount));
      }
    }

    return lines;
  }

  _formatLossLine(type, unitCount) {
    return {
      type,
      label: UNIT_LOSS_LABELS[type] ?? type,
      count: unitCount * personnelPerUnit(type),
      unitCount,
    };
  }

  formatDefenseLosses(team = 'player') {
    const bucket = this.defenseLosses[team];
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
  }) {
    const playerLines = this.formatTeamLosses('player');
    const enemyLines = this.formatTeamLosses('enemy');
    const playerDefenseLines = this.formatDefenseLosses('player');
    const playerTotal = this.totalLosses('player');
    const enemyTotal = this.totalLosses('enemy');
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
      enemyName: tutorial ? 'Practice target' : enemyName,
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