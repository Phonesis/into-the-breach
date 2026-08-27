const ARTILLERY_THREAT_LINGER_SEC = 1.25;
const MAX_TRACKED_ARTILLERY_STRIKES = 32;

let nextArtilleryStrikeId = 1;

function finitePoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.z)
    ? { x: point.x, z: point.z }
    : null;
}

function gameClock(game) {
  return Number.isFinite(game?.matchTime) ? game.matchTime : 0;
}

/**
 * Register an incoming support-fire warning for AI reactions. The data is
 * transient: it describes impacts already on the way and is not save state.
 */
export function registerIncomingArtilleryStrike(
  game,
  {
    ownerTeam = 'player',
    kind = 'artillery',
    sourceId = null,
    center = null,
    alertRadius = 0,
    targetId = null,
    targetWasStationary = false,
    impacts = [],
  } = {}
) {
  if (!game) return null;

  const now = gameClock(game);
  const normalizedImpacts = impacts
    .map((impact) => {
      const point = finitePoint(impact);
      if (!point) return null;
      const impactAt = Number.isFinite(impact.impactAt)
        ? impact.impactAt
        : now + Math.max(0, impact.impactIn ?? 0);
      if (!Number.isFinite(impactAt)) return null;
      return {
        ...point,
        impactAt,
        radius: Number.isFinite(impact.radius) ? Math.max(0, impact.radius) : 0,
      };
    })
    .filter(Boolean);
  if (!normalizedImpacts.length) return null;

  if (!Array.isArray(game._incomingArtilleryStrikes)) {
    game._incomingArtilleryStrikes = [];
  }

  const strikeCenter = finitePoint(center) ?? normalizedImpacts[0];
  const lastImpactAt = normalizedImpacts.reduce(
    (latest, impact) => Math.max(latest, impact.impactAt),
    now
  );
  const strike = {
    id: `artillery-strike-${nextArtilleryStrikeId++}`,
    ownerTeam,
    kind,
    sourceId,
    center: strikeCenter,
    alertRadius: Number.isFinite(alertRadius) ? Math.max(0, alertRadius) : 0,
    targetId,
    targetWasStationary: !!targetWasStationary,
    impacts: normalizedImpacts,
    expiresAt: lastImpactAt + ARTILLERY_THREAT_LINGER_SEC,
  };

  game._incomingArtilleryStrikes.push(strike);
  if (game._incomingArtilleryStrikes.length > MAX_TRACKED_ARTILLERY_STRIKES) {
    game._incomingArtilleryStrikes.splice(
      0,
      game._incomingArtilleryStrikes.length - MAX_TRACKED_ARTILLERY_STRIKES
    );
  }
  return strike.id;
}

export function getActiveIncomingArtilleryStrikes(game, ownerTeam = 'player') {
  const strikes = Array.isArray(game?._incomingArtilleryStrikes)
    ? game._incomingArtilleryStrikes
    : [];
  const now = gameClock(game);
  const active = strikes.filter((strike) => strike?.expiresAt > now);
  if (game && active.length !== strikes.length) {
    game._incomingArtilleryStrikes = active;
  }
  return active.filter((strike) => strike.ownerTeam === ownerTeam);
}

export function clearIncomingArtilleryStrikes(game) {
  if (game) game._incomingArtilleryStrikes = [];
}
