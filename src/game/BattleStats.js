import { UNIT_TYPE_ORDER } from '../data/gameModes.js';

export const UNIT_LOSS_LABELS = {
  infantry: 'Infantry',
  machineGun: 'MG teams',
  sniper: 'Snipers',
  mortar: 'Mortars',
  armoredCar: 'Armored cars',
  tank: 'Tanks',
  superHeavyTank: 'Super heavy tanks',
  artillery: 'Artillery',
};

export class BattleStats {
  constructor() {
    this.reset();
  }

  reset() {
    this.losses = { player: {}, enemy: {} };
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

  recordHq(team) {
    if (team !== 'player' && team !== 'enemy') return;
    if (this._hqRecorded?.[team]) return;
    if (!this._hqRecorded) this._hqRecorded = {};
    this._hqRecorded[team] = true;
    this.hqLost[team] = true;
  }

  totalLosses(team) {
    return Object.values(this.losses[team]).reduce((n, c) => n + c, 0);
  }

  formatTeamLosses(team) {
    const bucket = this.losses[team];
    const lines = [];

    for (const type of UNIT_TYPE_ORDER) {
      const n = bucket[type];
      if (n) lines.push({ type, label: UNIT_LOSS_LABELS[type] ?? type, count: n });
    }

    for (const [type, n] of Object.entries(bucket)) {
      if (!UNIT_TYPE_ORDER.includes(type)) {
        lines.push({ type, label: UNIT_LOSS_LABELS[type] ?? type, count: n });
      }
    }

    return lines;
  }

  buildReport({ playerName, enemyName, tutorial }) {
    const playerLines = this.formatTeamLosses('player');
    const enemyLines = this.formatTeamLosses('enemy');
    const playerTotal = this.totalLosses('player');
    const enemyTotal = this.totalLosses('enemy');

    return {
      playerName,
      enemyName: tutorial ? 'Practice target' : enemyName,
      playerLines,
      enemyLines,
      playerTotal,
      enemyTotal,
      playerHqLost: this.hqLost.player,
      enemyHqLost: this.hqLost.enemy,
      tutorial,
    };
  }
}