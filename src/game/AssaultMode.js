import {
  ASSAULT_HOLD_TIME,
  ASSAULT_DEFEND_TIME,
} from '../data/gameModes.js';

const PLAYER = 'player';
const ENEMY = 'enemy';

export function getFrontlineDef(mapDef) {
  return (
    mapDef.frontline ??
    mapDef.capturePoints?.find((c) => c.frontline) ??
    mapDef.capturePoints?.[0] ?? { x: 0, z: 0, name: 'Frontline' }
  );
}

export function findFrontlineCapturePoint(capturePoints, mapDef) {
  const fl = getFrontlineDef(mapDef);
  return (
    capturePoints.find((cp) => cp.isFrontline) ??
    capturePoints.find((cp) => Math.hypot(cp.x - fl.x, cp.z - fl.z) < 2) ??
    capturePoints[0]
  );
}

/** @returns {{ attackerTeam, defenderTeam, playerRole }} */
export function resolveAssaultTeams(playerRole) {
  const playerIsAttacker = playerRole === 'attack';
  return {
    playerRole,
    attackerTeam: playerIsAttacker ? PLAYER : ENEMY,
    defenderTeam: playerIsAttacker ? ENEMY : PLAYER,
  };
}

export function createAssaultState({ playerRole, mapDef, capturePoints }) {
  const teams = resolveAssaultTeams(playerRole);
  const frontlineCp = findFrontlineCapturePoint(capturePoints, mapDef);
  if (frontlineCp) {
    frontlineCp.isFrontline = true;
    frontlineCp.name = getFrontlineDef(mapDef).name ?? frontlineCp.name;
  }

  return {
    ...teams,
    frontlineCp,
    holdTimer: 0,
    matchTimer: 0,
    holdTimeRequired: ASSAULT_HOLD_TIME,
    defendTimeRequired: ASSAULT_DEFEND_TIME,
  };
}

export function setupAssaultCapturePoints(capturePoints, mapDef, defenderTeam) {
  const frontline = findFrontlineCapturePoint(capturePoints, mapDef);
  if (frontline) {
    frontline.isFrontline = true;
    frontline.owner = defenderTeam;
    frontline.progress = 1;
    frontline._updateVisuals?.();
  }

  for (const cp of capturePoints) {
    if (cp === frontline) continue;
    cp.owner = null;
    cp.progress = 0;
    cp._updateVisuals?.();
  }
}

/** Defender deploys from the west base; attackers from the east — frontline sits between. */
export function getAssaultSpawnBases(mapDef) {
  return {
    defenderBase: mapDef.playerBase,
    attackerBase: mapDef.enemyBase,
  };
}

export function updateAssaultTimers(assault, dt) {
  assault.matchTimer += dt;

  const cp = assault.frontlineCp;
  if (cp && cp.owner === assault.attackerTeam) {
    assault.holdTimer += dt;
  } else {
    assault.holdTimer = 0;
  }
}

import { teamIsEliminated } from './EliminationRules.js';

export function checkAssaultVictory(game) {
  const a = game.assault;
  if (!a) return null;

  const playerAlive = game.units.filter((u) => u.team === PLAYER && !u.dead);
  const enemyAlive = game.units.filter((u) => u.team === ENEMY && !u.dead);
  const playerHQ = game.hqs.find((h) => h.team === PLAYER);
  const enemyHQ = game.hqs.find((h) => h.team === ENEMY);

  const playerIsAttacker = a.playerRole === 'attack';
  const attackerHQ = a.attackerTeam === PLAYER ? playerHQ : enemyHQ;
  const defenderHQ = a.defenderTeam === PLAYER ? playerHQ : enemyHQ;
  const attackerAlive = a.attackerTeam === PLAYER ? playerAlive : enemyAlive;
  const defenderAlive = a.defenderTeam === PLAYER ? playerAlive : enemyAlive;

  const flName = a.frontlineCp?.name ?? 'the frontline';

  if (defenderHQ?.dead) {
    return {
      victory: playerIsAttacker,
      detail: playerIsAttacker
        ? 'Defender headquarters overrun — the line has fallen!'
        : 'Your headquarters was destroyed — the assault broke through.',
    };
  }

  if (attackerHQ?.dead) {
    return {
      victory: !playerIsAttacker,
      detail: !playerIsAttacker
        ? 'Attacker headquarters destroyed — the assault collapses!'
        : 'Your assault HQ was destroyed.',
    };
  }

  if (a.matchTimer < 3) return null;

  const attackerTeam = a.attackerTeam;
  const defenderTeam = a.defenderTeam;

  if (teamIsEliminated(attackerTeam, game, attackerAlive.length)) {
    return {
      victory: !playerIsAttacker,
      detail: !playerIsAttacker
        ? 'The assault force has been wiped out — line held!'
        : 'All assault units lost.',
    };
  }

  if (teamIsEliminated(defenderTeam, game, defenderAlive.length)) {
    return {
      victory: playerIsAttacker,
      detail: playerIsAttacker
        ? 'Defender forces eliminated — the frontline is yours!'
        : 'Your garrison was wiped out — the line has fallen.',
    };
  }

  if (a.holdTimer >= a.holdTimeRequired) {
    return {
      victory: playerIsAttacker,
      detail: playerIsAttacker
        ? `Frontline secured at ${flName} — breakthrough complete!`
        : `The enemy held ${flName} long enough — your line has fallen.`,
    };
  }

  if (a.matchTimer >= a.defendTimeRequired) {
    return {
      victory: !playerIsAttacker,
      detail: !playerIsAttacker
        ? `Time expired — ${flName} held. Defence successful!`
        : `Assault timed out — the defenders held ${flName}.`,
    };
  }

  return null;
}

export function formatAssaultHud(assault) {
  const playerIsAttacker = assault.playerRole === 'attack';
  const holdPct = Math.min(100, Math.round((assault.holdTimer / assault.holdTimeRequired) * 100));
  const timeLeft = Math.max(0, Math.ceil(assault.defendTimeRequired - assault.matchTimer));
  const cp = assault.frontlineCp;
  const attackerHolds = cp?.owner === assault.attackerTeam;

  if (playerIsAttacker) {
    return {
      role: 'Attacking',
      objective: attackerHolds
        ? `Hold frontline: ${holdPct}% (${Math.ceil(assault.holdTimeRequired - assault.holdTimer)}s left)`
        : `Capture ${cp?.name ?? 'frontline'} and hold ${assault.holdTimeRequired}s`,
      timer: `Defender reinforcements: ${timeLeft}s`,
      holdPct,
      attackerHolds,
    };
  }

  return {
    role: 'Defending',
    objective: attackerHolds
      ? `Frontline contested — ${holdPct}% enemy hold progress`
      : `Hold ${cp?.name ?? 'frontline'} — repel the assault`,
    timer: `Hold until: ${timeLeft}s`,
    holdPct,
    attackerHolds,
  };
}