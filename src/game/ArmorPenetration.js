const ARMORED_TYPES = new Set(['armoredCar', 'tank', 'tankDestroyer', 'superHeavyTank']);
const DIRECT_SHELL_TYPES = new Set(['antiTankGun', 'tank', 'tankDestroyer', 'superHeavyTank']);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Relative protection profiles. These are deliberately model-specific: the
// number represents useful battlefield protection, not simply maximum plate
// thickness, so slope and open fighting compartments are included.
const ARMOR_PROFILES = {
  'Sd.Kfz. 222': { armor: 0.42, frontSlope: 1.02, openTop: true },
  'M8 Greyhound': { armor: 0.46, frontSlope: 1.04, openTop: true },
  'BA-64': { armor: 0.4, frontSlope: 1.1 },
  'Daimler AC': { armor: 0.48, frontSlope: 1.04 },
  'Panzer IV Ausf. H': { armor: 0.96, frontSlope: 1.03 },
  Jagdpanther: { armor: 1.14, frontSlope: 1.24 },
  'Tiger I Ausf. E': { armor: 1.27, frontSlope: 1.02 },
  'M4 Sherman': { armor: 0.9, frontSlope: 1.13 },
  'M10 Wolverine': { armor: 0.67, frontSlope: 1.13, openTop: true },
  'M26 Pershing': { armor: 1.2, frontSlope: 1.12 },
  'Churchill Mk IV': { armor: 1.17, frontSlope: 1.02 },
  'Achilles IIC': { armor: 0.68, frontSlope: 1.13, openTop: true },
  'Black Prince': { armor: 1.4, frontSlope: 1.02 },
  'T-34-85': { armor: 0.96, frontSlope: 1.2 },
  'SU-100': { armor: 1.06, frontSlope: 1.23 },
  'IS-2': { armor: 1.31, frontSlope: 1.12 },
  'Type 92 Chiyoda': { armor: 0.38, frontSlope: 1.02, openTop: true },
  'Shinhoto Chi-Ha': { armor: 0.72, frontSlope: 1.08 },
  'Type 1 Ho-Ni I': { armor: 0.68, frontSlope: 1.04, openTop: true },
  // Chi-Nu fills the super-heavy roster slot but is a late-war medium tank.
  'Type 3 Chi-Nu': { armor: 0.9, frontSlope: 1.08 },
};

const DEFAULT_ARMOR = {
  armoredCar: { armor: 0.45, frontSlope: 1.04 },
  tank: { armor: 1, frontSlope: 1.08 },
  tankDestroyer: { armor: 0.95, frontSlope: 1.14 },
  superHeavyTank: { armor: 1.32, frontSlope: 1.06 },
};

const GUN_PROFILES = {
  '7.5 cm Pak 40': 1.17,
  '57 mm Gun M1': 0.93,
  'QF 6-pounder': 0.98,
  'ZIS-3': 0.96,
  'Panzer IV Ausf. H': 1.01,
  Jagdpanther: 1.39,
  'Tiger I Ausf. E': 1.19,
  'M4 Sherman': 0.88,
  'M10 Wolverine': 1.08,
  'M26 Pershing': 1.22,
  'Churchill Mk IV': 0.86,
  'Achilles IIC': 1.31,
  'Black Prince': 1.31,
  'T-34-85': 1.06,
  'SU-100': 1.34,
  'IS-2': 1.34,
  'Type 1 47 mm AT Gun': 0.82,
  'Shinhoto Chi-Ha': 0.84,
  'Type 1 Ho-Ni I': 1.04,
  'Type 3 Chi-Nu': 1.06,
};

const DEFAULT_GUN_POWER = {
  antiTankGun: 1.03,
  tank: 0.98,
  tankDestroyer: 1.22,
  superHeavyTank: 1.27,
};

function getHorizontalFacing(target) {
  const yaw = target.mesh?.rotation?.y ?? 0;
  return {
    forwardX: Math.sin(yaw),
    forwardZ: Math.cos(yaw),
    rightX: Math.cos(yaw),
    rightZ: -Math.sin(yaw),
  };
}

export function getArmorAspect(attacker, target) {
  const dx = attacker.position.x - target.position.x;
  const dz = attacker.position.z - target.position.z;
  const length = Math.max(0.001, Math.hypot(dx, dz));
  const x = dx / length;
  const z = dz / length;
  const facing = getHorizontalFacing(target);
  const forwardDot = x * facing.forwardX + z * facing.forwardZ;
  const sideDot = x * facing.rightX + z * facing.rightZ;

  let aspect;
  let plateAlignment;
  if (Math.abs(forwardDot) >= Math.abs(sideDot)) {
    aspect = forwardDot >= 0 ? 'front' : 'rear';
    plateAlignment = Math.abs(forwardDot);
  } else {
    aspect = 'side';
    plateAlignment = Math.abs(sideDot);
  }
  return {
    aspect,
    angleDeg: Math.round((Math.acos(clamp(plateAlignment, 0, 1)) * 180) / Math.PI),
    plateAlignment,
  };
}

const VEHICLE_IMPACT_SIZE = {
  armoredCar: { radius: 1.15, height: 1.45 },
  tank: { radius: 1.65, height: 2.05 },
  tankDestroyer: { radius: 1.75, height: 1.78 },
  superHeavyTank: { radius: 1.92, height: 2.3 },
};

function isDedicatedAtGun(attacker) {
  return attacker?.def?.type === 'antiTankGun';
}

/**
 * Sample a point on the struck plate. Criticals are only possible when this
 * point overlaps a vulnerable area; they are not a free-floating damage roll.
 * Towed AT guns aim more carefully, so weak-spot bands are slightly wider.
 */
function classifyImpactArea(profile, aspect, height, lateral, dedicatedAt) {
  let area = height < 0.34 ? 'running gear' : height > 0.72 ? 'upper turret' : 'armor plate';
  let weakSpot = null;
  let criticalChance = 0;
  const ringLo = dedicatedAt ? 0.56 : 0.58;
  const ringHi = dedicatedAt ? 0.71 : 0.69;
  const visorLo = dedicatedAt ? 0.42 : 0.43;
  const visorHi = dedicatedAt ? 0.57 : 0.57;
  const visorLat = dedicatedAt ? 0.46 : 0.42;
  const ammoLo = dedicatedAt ? 0.36 : 0.38;
  const ammoHi = dedicatedAt ? 0.6 : 0.58;
  const rearLo = dedicatedAt ? 0.32 : 0.34;
  const rearHi = dedicatedAt ? 0.6 : 0.58;

  if (profile.openTop && height > 0.7) {
    area = 'open fighting compartment';
    weakSpot = { name: area, multiplier: 2.15 };
    criticalChance = 0.58;
  } else if (height >= ringLo && height <= ringHi) {
    area = 'turret ring';
    weakSpot = { name: area, multiplier: 1.85 };
    criticalChance = aspect === 'front' ? 0.34 : 0.46;
  } else if (aspect === 'front' && height >= visorLo && height <= visorHi && Math.abs(lateral) < visorLat) {
    area = "driver's visor";
    weakSpot = { name: area, multiplier: 1.75 };
    criticalChance = 0.36;
  } else if (aspect === 'side' && height >= ammoLo && height <= ammoHi) {
    area = 'ammunition rack';
    weakSpot = { name: area, multiplier: 2.05 };
    criticalChance = 0.39;
  } else if (aspect === 'rear' && height >= rearLo && height <= rearHi) {
    area = Math.abs(lateral) < 0.5 ? 'engine deck' : 'rear ammunition stowage';
    weakSpot = {
      name: area,
      multiplier: area === 'engine deck' ? 1.9 : 2.05,
    };
    criticalChance = area === 'engine deck' ? 0.48 : 0.55;
  }

  if (dedicatedAt && weakSpot) {
    criticalChance = clamp(criticalChance + 0.24, 0, 0.86);
  }

  return { area, weakSpot, criticalChance, height, lateral };
}

function sampleImpactArea(attacker, target, profile, aspect, random) {
  const size = VEHICLE_IMPACT_SIZE[target.def.type] ?? VEHICLE_IMPACT_SIZE.tank;
  const dedicatedAt = isDedicatedAtGun(attacker);

  const rollPoint = () => {
    // Averaging two rolls keeps most hits around the silhouette centre while
    // still allowing track, roof and outer-plate strikes.
    const lateral = random() + random() - 1;
    const height = 0.16 + (random() + random()) * 0.39;
    return classifyImpactArea(profile, aspect, height, lateral, dedicatedAt);
  };

  let impact = rollPoint();
  // Dedicated AT crews get one extra aimed sample when the first round
  // would have struck plain plate.
  if (dedicatedAt && !impact.weakSpot && random() < 0.22) {
    impact = rollPoint();
  }

  const dx = attacker.position.x - target.position.x;
  const dz = attacker.position.z - target.position.z;
  const len = Math.max(0.001, Math.hypot(dx, dz));
  const towardX = dx / len;
  const towardZ = dz / len;
  const tangentX = towardZ;
  const tangentZ = -towardX;
  const baseY = target.position.y ?? target.mesh?.position?.y ?? 0;
  const position = {
    x: target.position.x + towardX * size.radius + tangentX * impact.lateral * size.radius * 0.72,
    y: baseY + 0.16 + impact.height * size.height,
    z: target.position.z + towardZ * size.radius + tangentZ * impact.lateral * size.radius * 0.72,
  };

  return { ...impact, position };
}

export function isDirectArmorShell(attacker, target, { coax = false, paratrooperAt = false } = {}) {
  if (!attacker?.def || !target?.def || coax) return false;
  return (
    (DIRECT_SHELL_TYPES.has(attacker.def.type) || paratrooperAt) &&
    ARMORED_TYPES.has(target.def.type)
  );
}

/**
 * Resolve a direct shell against a vehicle. Horizontal impact angle, range,
 * historical model protection and gun performance all affect penetration.
 */
export function resolveArmorHit(
  attacker,
  target,
  { distance = 0, weaponRange = 1, coax = false, paratrooperAt = false, random = Math.random } = {}
) {
  if (!isDirectArmorShell(attacker, target, { coax, paratrooperAt })) return null;

  const profile = ARMOR_PROFILES[target.def.name] ?? DEFAULT_ARMOR[target.def.type];
  const basePower = paratrooperAt
    ? 1.08
    : GUN_PROFILES[attacker.def.name] ?? DEFAULT_GUN_POWER[attacker.def.type] ?? 1;
  const { aspect, angleDeg, plateAlignment } = getArmorAspect(attacker, target);
  const impact = sampleImpactArea(attacker, target, profile, aspect, random);
  const rangeRatio = distance / Math.max(weaponRange, 1);
  const rangePower = 1 - Math.max(0, rangeRatio - 0.3) * 0.19;
  const aspectArmor = aspect === 'front' ? 1.16 : aspect === 'side' ? 0.76 : 0.58;
  const slope = aspect === 'front' ? profile.frontSlope ?? 1 : 1;
  const obliquity = 1 + (1 - plateAlignment) * 0.72;
  const effectiveArmor = profile.armor * aspectArmor * slope * obliquity;
  const penetrationRatio = (basePower * rangePower) / Math.max(0.2, effectiveArmor);

  let penetrationChance = 0.35 + (penetrationRatio - 0.78) * 0.82;
  if (aspect === 'side') penetrationChance += 0.07;
  if (aspect === 'rear') penetrationChance += 0.15;
  if (target.def.type === 'armoredCar') penetrationChance += 0.09;
  if (angleDeg > 28) penetrationChance -= ((angleDeg - 28) / 17) * 0.14;
  penetrationChance = clamp(penetrationChance, 0.07, 0.96);

  const penetrated = random() < penetrationChance;
  let weakSpot = null;
  if (penetrated && impact.weakSpot) {
    const dedicatedAt = isDedicatedAtGun(attacker);
    const overmatchBonus = penetrationRatio > 1.25 ? (dedicatedAt ? 0.12 : 0.08) : 0;
    if (random() < impact.criticalChance + overmatchBonus) weakSpot = impact.weakSpot;
  }

  // Side shots are much more likely to strike running gear. A shell stopped by
  // the main plate may still break a track or wheel without penetrating the hull.
  let mobilityChance =
    impact.area === 'running gear'
      ? penetrated
        ? 0.42
        : 0.68
      : aspect === 'side'
        ? penetrated
          ? 0.07
          : 0.12
        : penetrated
          ? 0.025
          : 0.045;
  if (target.def.type === 'armoredCar') mobilityChance += 0.035;
  const mobilityDamaged = !target._mobilityDamaged && random() < mobilityChance;
  const mobilityDamageKind = target.def.type === 'armoredCar' ? 'wheel' : 'track';

  let damageMultiplier = 0;
  if (penetrated) {
    const aspectDamage = aspect === 'rear' ? 0.18 : aspect === 'side' ? 0.08 : 0;
    damageMultiplier = clamp(0.79 + (penetrationRatio - 0.75) * 0.25 + aspectDamage, 0.72, 1.3);
    if (weakSpot) damageMultiplier *= weakSpot.multiplier;
  } else if (mobilityDamaged) {
    damageMultiplier = 0.14;
  }

  return {
    outcome: weakSpot ? 'weakSpot' : penetrated ? 'penetration' : mobilityDamaged ? 'mobilityHit' : 'ricochet',
    penetrated,
    deflected: !penetrated,
    aspect,
    angleDeg,
    penetrationChance,
    damageMultiplier,
    weakSpot: weakSpot?.name ?? null,
    critical: !!weakSpot,
    impactArea: impact.area,
    impactPosition: impact.position,
    mobilityDamaged,
    mobilityDamageKind,
  };
}

export function applyMobilityDamage(target, kind = null) {
  if (!target || target.dead || target._mobilityDamaged || !ARMORED_TYPES.has(target.def?.type)) {
    return false;
  }
  target._mobilityDamaged = true;
  target._mobilityDamageKind = kind ?? (target.def.type === 'armoredCar' ? 'wheel' : 'track');
  target._mobilityRepairProgress = 0;
  target.moveTarget = null;
  target._movePath = null;
  target._userMoveOrder = false;
  target._chasingAttack = false;
  target._stancePursuitOrder = false;
  return true;
}

export function clearMobilityDamage(target) {
  if (!target?._mobilityDamaged) return false;
  target._mobilityDamaged = false;
  target._mobilityDamageKind = null;
  target._mobilityRepairProgress = 0;
  return true;
}
