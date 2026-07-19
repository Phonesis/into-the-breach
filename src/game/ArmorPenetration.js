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

function resolveWeakSpot(profile, aspect, random) {
  if (profile.openTop && random < 0.32) {
    return { name: 'open fighting compartment', multiplier: 2.15 };
  }
  if (aspect === 'rear') {
    return random < 0.55
      ? { name: 'engine deck', multiplier: 1.9 }
      : { name: 'rear ammunition stowage', multiplier: 2.05 };
  }
  if (aspect === 'side') {
    return random < 0.58
      ? { name: 'ammunition rack', multiplier: 2.05 }
      : { name: 'turret ring', multiplier: 1.8 };
  }
  return random < 0.56
    ? { name: "driver's visor", multiplier: 1.75 }
    : { name: 'turret ring', multiplier: 1.85 };
}

export function isDirectArmorShell(attacker, target, { coax = false, paratrooperAt = false } = {}) {
  if (!attacker?.def || !target?.def || coax || paratrooperAt) return false;
  return DIRECT_SHELL_TYPES.has(attacker.def.type) && ARMORED_TYPES.has(target.def.type);
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
  const basePower = GUN_PROFILES[attacker.def.name] ?? DEFAULT_GUN_POWER[attacker.def.type] ?? 1;
  const { aspect, angleDeg, plateAlignment } = getArmorAspect(attacker, target);
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
  if (penetrated) {
    let weakSpotChance = aspect === 'rear' ? 0.19 : aspect === 'side' ? 0.105 : 0.055;
    if (profile.openTop) weakSpotChance += 0.055;
    if (penetrationRatio > 1.25) weakSpotChance += 0.045;
    if (random() < weakSpotChance) weakSpot = resolveWeakSpot(profile, aspect, random());
  }

  // Side shots are much more likely to strike running gear. A shell stopped by
  // the main plate may still break a track or wheel without penetrating the hull.
  let mobilityChance = aspect === 'side' ? (penetrated ? 0.14 : 0.23) : penetrated ? 0.045 : 0.075;
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
