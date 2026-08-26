import { computeTeamMaterielCost } from '../data/battleEconomics.js';

export const WAR_STATS_STORAGE_KEY = 'ww2-rts-war-stats';
export const WAR_STATS_VERSION = 1;

function emptyWarStats() {
  return {
    version: WAR_STATS_VERSION,
    completedOperations: 0,
    factions: {},
  };
}

function safeNonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function getStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function normalizeLossBreakdown(value) {
  const normalized = {};
  if (!value || typeof value !== 'object') return normalized;

  for (const [type, lossStats] of Object.entries(value)) {
    if (!type || !lossStats || typeof lossStats !== 'object') continue;
    const units = safeNonNegativeInteger(lossStats.units);
    const casualties = safeNonNegativeInteger(lossStats.casualties);
    if (!units && !casualties) continue;
    normalized[type] = { units, casualties };
  }
  return normalized;
}

function normalizeFactionStats(value) {
  return {
    unitsKilled: safeNonNegativeInteger(value?.unitsKilled),
    casualties: safeNonNegativeInteger(value?.casualties),
    lossCost: safeNonNegativeInteger(value?.lossCost),
    lossBreakdown: normalizeLossBreakdown(value?.lossBreakdown),
  };
}

function normalizeWarStats(value) {
  const normalized = emptyWarStats();
  if (!value || typeof value !== 'object') return normalized;

  normalized.completedOperations = safeNonNegativeInteger(value.completedOperations);
  if (!value.factions || typeof value.factions !== 'object') return normalized;

  for (const [factionId, factionStats] of Object.entries(value.factions)) {
    if (!factionId || !factionStats || typeof factionStats !== 'object') continue;
    normalized.factions[factionId] = normalizeFactionStats(factionStats);
  }
  return normalized;
}

export function createEmptyWarStats() {
  return emptyWarStats();
}

export function readWarStats() {
  const store = getStorage();
  if (!store) return emptyWarStats();
  try {
    const raw = store.getItem(WAR_STATS_STORAGE_KEY);
    return raw ? normalizeWarStats(JSON.parse(raw)) : emptyWarStats();
  } catch {
    return emptyWarStats();
  }
}

export function writeWarStats(value) {
  const normalized = normalizeWarStats(value);
  const store = getStorage();
  if (!store) return normalized;
  try {
    store.setItem(WAR_STATS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Storage can be unavailable or full; the battle itself must still finish.
  }
  return normalized;
}

function teamLossSummary(battleStats, team, liveUnits = []) {
  const losses = battleStats?.losses?.[team] ?? {};
  const unitLines = typeof battleStats?.formatTeamLosses === 'function'
    ? battleStats.formatTeamLosses(team, { liveUnits })
    : Object.entries(losses).map(([type, unitCount]) => ({ type, unitCount, count: unitCount }));
  let unitsKilled = 0;
  let casualties = 0;
  const lossBreakdown = {};

  for (const line of unitLines) {
    const unitCount = safeNonNegativeInteger(line.unitCount);
    const casualtyCount = safeNonNegativeInteger(line.count);
    if (!unitCount && !casualtyCount) continue;
    unitsKilled += unitCount;
    casualties += casualtyCount;
    if (line.type) {
      const typeStats = (lossBreakdown[line.type] ??= { units: 0, casualties: 0 });
      typeStats.units += unitCount;
      typeStats.casualties += casualtyCount;
    }
  }

  const defenseLines = team === 'player'
    ? Object.entries(battleStats?.defenseLosses?.[team] ?? {})
        .map(([type, count]) => ({ type, count: safeNonNegativeInteger(count) }))
        .filter((line) => line.count > 0)
    : [];

  const lossCost = computeTeamMaterielCost({
    unitLines,
    defenseLines,
    hqLost: battleStats?.hqLost?.[team] === true,
  });

  return { unitsKilled, casualties, lossCost, lossBreakdown };
}

/** Add one finalized battle to the browser-persistent faction record. */
export function recordCompletedBattle({
  playerFactionId,
  enemyFactionId,
  battleStats,
  liveUnits = [],
}) {
  if (!battleStats) return readWarStats();

  const next = readWarStats();
  const teams = [
    ['player', playerFactionId],
    ['enemy', enemyFactionId],
  ];

  for (const [team, factionId] of teams) {
    if (!factionId) continue;
    const faction = (next.factions[factionId] ??= {
      unitsKilled: 0,
      casualties: 0,
      lossCost: 0,
      lossBreakdown: {},
    });
    const summary = teamLossSummary(battleStats, team, liveUnits);
    faction.unitsKilled += summary.unitsKilled;
    faction.casualties = safeNonNegativeInteger(faction.casualties) + summary.casualties;
    faction.lossCost += summary.lossCost;
    faction.lossBreakdown ??= {};
    for (const [type, lossStats] of Object.entries(summary.lossBreakdown)) {
      const accumulated = (faction.lossBreakdown[type] ??= { units: 0, casualties: 0 });
      accumulated.units += lossStats.units;
      accumulated.casualties += lossStats.casualties;
    }
  }

  next.completedOperations += 1;
  return writeWarStats(next);
}
