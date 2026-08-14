/**
 * Shared HE blast data used by damage application and casualty visuals.
 *
 * The game world is deliberately readable rather than a strict metre scale,
 * so these are gameplay radii. The important distinction is that a shell's
 * damage radius is much larger than the small near-detonation band capable of
 * lifting a body from the ground.
 */
const BLAST_DEFAULTS = {
  artillery: { caliber: 105, radius: 8.5, impulseScale: 1 },
  mortar: { caliber: 81, radius: 6.5, impulseScale: 0.9 },
  tank: { caliber: 75, radius: 4, impulseScale: 0.82 },
  tankDestroyer: { caliber: 88, radius: 4.5, impulseScale: 0.9 },
  superHeavyTank: { caliber: 105, radius: 5.2, impulseScale: 1.04 },
  antiTankGun: { caliber: 75, radius: 3.6, impulseScale: 0.72 },
  paratrooperAt: { caliber: 57, radius: 3.1, impulseScale: 0.68 },
  airBomb: { caliber: 250, radius: 9.5, impulseScale: 1.28 },
  handGrenade: { caliber: 0, radius: 1.8, impulseScale: 0.48 },
};

function finitePositive(value) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function caliberScale(caliber) {
  if (!Number.isFinite(caliber) || caliber <= 0) return 0.82;
  return Math.min(1.65, Math.max(0.72, Math.pow(caliber / 75, 0.22)));
}

/**
 * Return the fields accepted by Unit.takeDamage for an HE event.
 *
 * launchRadius is intentionally capped: a large artillery damage footprint
 * should not turn every casualty at the edge of the footprint into a ragdoll.
 */
export function getBlastProfile({
  weaponType = 'artillery',
  caliber = null,
  radius = null,
  launchRadius = null,
  knockdownRadius = null,
  impulseScale = null,
} = {}) {
  const base = BLAST_DEFAULTS[weaponType] ?? BLAST_DEFAULTS.artillery;
  const resolvedCaliber = finitePositive(caliber) ?? base.caliber;
  const resolvedRadius = finitePositive(radius) ?? base.radius;
  const scale = caliberScale(resolvedCaliber);

  return {
    blastRadius: resolvedRadius,
    blastCaliber: resolvedCaliber,
    blastLaunchRadius:
      finitePositive(launchRadius) ?? Math.min(resolvedRadius * 0.46, 2.7 * scale),
    blastKnockdownRadius:
      finitePositive(knockdownRadius) ?? Math.min(resolvedRadius * 0.82, 5.5 * scale),
    blastImpulseScale: Math.min(
      1.5,
      Math.max(0.25, finitePositive(impulseScale) ?? base.impulseScale)
    ),
    blastWeaponType: weaponType,
  };
}

export function getBlastCaliberScale(caliber) {
  return caliberScale(caliber);
}
