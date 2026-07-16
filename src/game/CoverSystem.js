import * as THREE from 'three';
import { removeCoverMarker, syncCoverMarker } from '../visual/CoverMarkers.js';
import {
  BUNKER_GARRISON_COVER_MULT,
  getGarrisonCoverMultiplier,
  isUnitGarrisoned,
} from './BunkerGarrison.js';
import { getTrenchCoverMultiplier, isUnitInTrench } from './InfantryTrench.js';

/** Infantry / MG cover — reduces incoming damage while near cover sites. */

export const COVER_TYPES = {
  heavy: {
    radius: 5.5,
    mult: 0.12,
    label: 'Heavy cover',
    shortLabel: 'Heavy',
    detail: 'Bunkers & hard shelter — up to ~88% less damage',
  },
  medium: {
    radius: 4,
    mult: 0.28,
    label: 'Medium cover',
    shortLabel: 'Medium',
    detail: 'Hedges & walls — up to ~72% less damage',
  },
  light: {
    radius: 2.8,
    mult: 0.45,
    label: 'Light cover',
    shortLabel: 'Light',
    detail: 'Fighting pits & scrub — up to ~55% less damage',
  },
  trench: {
    radius: 3.6,
    mult: 0.3,
    label: 'Trench',
    shortLabel: 'Trench',
    detail: 'Dug fighting trench — ~70% less damage',
  },
  garrison: {
    radius: 0,
    mult: BUNKER_GARRISON_COVER_MULT,
    label: 'Inside building',
    shortLabel: 'Inside',
    detail: 'Garrisoned in a bunker or shelter — ~88% less damage',
  },
};

export function formatCoverReduction(mult) {
  return Math.round((1 - mult) * 100);
}

export function getCoverStatus(unit) {
  if (!unit || unit.dead || !COVER_UNIT_TYPES.has(unit.def?.type)) {
    return { inCover: false };
  }

  // Garrisoned troops are inside a building — always report that clearly
  if (isUnitGarrisoned(unit)) {
    const mult = BUNKER_GARRISON_COVER_MULT;
    const reduction = formatCoverReduction(mult);
    return {
      inCover: true,
      garrisoned: true,
      unitName: unit.name,
      label: 'Inside building',
      shortLabel: 'Inside',
      tier: 'heavy',
      mult,
      reduction,
      detail: COVER_TYPES.garrison.detail,
      note: 'Garrisoned — order a move to leave the building. Heavy cover while inside.',
    };
  }

  if (isUnitInTrench(unit)) {
    const mult = getTrenchCoverMultiplier(unit);
    const reduction = formatCoverReduction(mult);
    return {
      inCover: true,
      garrisoned: false,
      inTrench: true,
      unitName: unit.name,
      label: 'In trench',
      shortLabel: 'Trench',
      tier: 'trench',
      mult,
      reduction,
      detail: COVER_TYPES.trench.detail,
      note: 'Dug in — order a move to leave the trench.',
    };
  }

  const mult = unit.coverMult ?? 1;
  const inCover = unit.inCover && mult < 0.95;
  if (!inCover) return { inCover: false };
  const reduction = formatCoverReduction(mult);
  const tier = unit.coverTier ?? 'medium';
  const meta = COVER_TYPES[tier] ?? COVER_TYPES.medium;
  return {
    inCover: true,
    garrisoned: false,
    unitName: unit.name,
    label: unit.coverLabel ?? meta.label,
    shortLabel: meta.shortLabel,
    tier,
    mult,
    reduction,
    detail: meta.detail,
    note: 'Protection lasts while this unit stays in cover. Destroy the scenery or move away to lose the bonus.',
  };
}

const COVER_UNIT_TYPES = new Set([
  'infantry',
  'paratrooper',
  'machineGun',
  'sniper',
  'medic',
  'engineer',
  'vehicleCrew',
]);

const WRECK_COVER_TYPES = new Set([
  'tank',
  'superHeavyTank',
  'armoredCar',
  'artillery',
  'antiTankGun',
]);

const STATIONARY_VEHICLE_COVER_TYPES = new Set([
  'tank',
  'superHeavyTank',
  'armoredCar',
]);

const LIVING_VEHICLE_COVER_PREFIX = 'living-vehicle:';

function vehicleCoverProfile(type) {
  if (type === 'superHeavyTank') return { tier: 'heavy', radius: 5.8 };
  if (type === 'tank') return { tier: 'heavy', radius: 5.1 };
  return { tier: 'medium', radius: 4.2 };
}

export class CoverSystem {
  constructor(zones = []) {
    this.zones = zones.map((z) => ({
      x: z.x,
      z: z.z,
      radius: z.radius ?? COVER_TYPES[z.type ?? 'medium'].radius,
      mult: z.mult ?? COVER_TYPES[z.type ?? 'medium'].mult,
      type: z.type ?? 'medium',
      label: z.label ?? null,
      sourceId: z.sourceId ?? null,
    }));
  }

  addZone(x, z, type = 'medium', radiusOverride = null) {
    const t = COVER_TYPES[type] ?? COVER_TYPES.medium;
    this.zones.push({
      x,
      z,
      radius: radiusOverride ?? t.radius,
      mult: t.mult,
      type,
    });
  }

  addSourceZone(sourceId, x, z, type = 'medium', radiusOverride = null, label = null) {
    if (sourceId == null) return;
    const t = COVER_TYPES[type] ?? COVER_TYPES.medium;
    const existing = this.zones.find((zone) => zone.sourceId === sourceId);
    const values = {
      x,
      z,
      radius: radiusOverride ?? t.radius,
      mult: t.mult,
      type,
      label,
      sourceId,
    };
    if (existing) Object.assign(existing, values);
    else this.zones.push(values);
  }

  removeSourceZone(sourceId) {
    this.zones = this.zones.filter((zone) => zone.sourceId !== sourceId);
  }

  removeZoneAt(x, zPos, matchRadius = 4) {
    this.zones = this.zones.filter(
      (zone) => zone.sourceId != null || Math.hypot(zone.x - x, zone.z - zPos) > matchRadius
    );
  }

  syncStationaryVehicleCover(units) {
    const activeSources = new Set();
    for (const unit of units ?? []) {
      if (
        unit?.dead ||
        unit?._dropping ||
        unit?.moveTarget ||
        !STATIONARY_VEHICLE_COVER_TYPES.has(unit?.def?.type)
      ) continue;
      const sourceId = `${LIVING_VEHICLE_COVER_PREFIX}${unit.id}`;
      const { tier, radius } = vehicleCoverProfile(unit.def.type);
      activeSources.add(sourceId);
      this.addSourceZone(
        sourceId,
        unit.position.x,
        unit.position.z,
        tier,
        radius,
        'Stationary vehicle'
      );
    }
    this.zones = this.zones.filter(
      (zone) =>
        !zone.sourceId?.startsWith(LIVING_VEHICLE_COVER_PREFIX) ||
        activeSources.has(zone.sourceId)
    );
  }

  /** @returns {{ mult: number, label: string | null }} */
  getCoverForUnit(unit, attacker = null) {
    if (!unit || unit.dead || !COVER_UNIT_TYPES.has(unit.def?.type)) {
      return { mult: 1, label: null };
    }

    let bestMult = 1;
    let bestLabel = null;
    let bestTier = null;

    for (const zone of this.zones) {
      const dx = unit.position.x - zone.x;
      const dz = unit.position.z - zone.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > zone.radius) continue;
      if (attacker?.position && zone.type !== 'trench' && d > 0.65) {
        const attackDx = attacker.position.x - unit.position.x;
        const attackDz = attacker.position.z - unit.position.z;
        const attackLen = Math.hypot(attackDx, attackDz);
        if (attackLen > 0.01) {
          // Cover must lie generally between the target and incoming fire.
          // Shots from the flank or rear bypass this zone completely.
          const coverDx = zone.x - unit.position.x;
          const coverDz = zone.z - unit.position.z;
          const facing =
            (coverDx * attackDx + coverDz * attackDz) /
            (Math.max(d, 0.001) * attackLen);
          if (facing < 0.34) continue;
        }
      }
      const edge = 1 - d / zone.radius;
      // Full protection close behind the object, tapering smoothly toward the
      // edge of its cover footprint. The old curve never approached the stated
      // tier value, making even heavy cover feel weak in actual combat.
      const blend = 1 - (1 - zone.mult) * Math.sqrt(Math.max(0, edge));
      if (blend < bestMult) {
        bestMult = blend;
        bestTier = zone.type;
        bestLabel = zone.label ?? COVER_TYPES[zone.type]?.label ?? 'Cover';
      }
    }

    return {
      mult: bestMult,
      label: bestMult < 0.95 ? bestLabel : null,
      tier: bestMult < 0.95 ? bestTier : null,
    };
  }

  updateUnits(units) {
    this.syncStationaryVehicleCover(units);
    for (const u of units) {
      if (u._mountedOnTankId) {
        u.inCover = false;
        u.coverMult = 1;
        u.coverLabel = null;
        u.coverTier = null;
        u.garrisoned = false;
        setCoverVisual(u.mesh, false);
        removeCoverMarker(u);
        continue;
      }
      if (u.dead || !COVER_UNIT_TYPES.has(u.def?.type)) {
        u.inCover = false;
        u.coverMult = 1;
        u.coverLabel = null;
        u.coverTier = null;
        u.garrisoned = false;
        setCoverVisual(u.mesh, false);
        removeCoverMarker(u);
        continue;
      }

      // Inside bunker / building garrison — treat as heavy building cover
      if (isUnitGarrisoned(u)) {
        u.coverMult = BUNKER_GARRISON_COVER_MULT;
        u.coverLabel = 'Inside building';
        u.coverTier = 'heavy';
        u.inCover = true;
        u.garrisoned = true;
        // Mesh is hidden while garrisoned — no ground cover ring
        setCoverVisual(u.mesh, false);
        syncCoverMarker(u);
        continue;
      }

      if (isUnitInTrench(u)) {
        u.coverMult = getTrenchCoverMultiplier(u);
        u.coverLabel = 'In trench';
        u.coverTier = 'trench';
        u.inCover = true;
        u.garrisoned = false;
        setCoverVisual(u.mesh, true, u.coverMult, 'trench');
        syncCoverMarker(u);
        continue;
      }

      u.garrisoned = false;
      const { mult, label, tier } = this.getCoverForUnit(u);
      u.coverMult = mult;
      u.coverLabel = label;
      u.coverTier = tier;
      u.inCover = mult < 0.95;
      setCoverVisual(u.mesh, u.inCover, mult, tier);
      syncCoverMarker(u);
    }
  }
}

export function addVehicleWreckCover(coverSystem, unit) {
  if (!coverSystem || !unit?.dead || !WRECK_COVER_TYPES.has(unit.def?.type)) return false;
  const type = unit.def.type;
  const { tier, radius } = vehicleCoverProfile(type);
  coverSystem.removeSourceZone(`${LIVING_VEHICLE_COVER_PREFIX}${unit.id}`);
  coverSystem.addSourceZone(`vehicle-wreck:${unit.id}`, unit.position.x, unit.position.z, tier, radius, 'Vehicle wreck');
  unit._wreckCoverRegistered = true;
  return true;
}

export function removeVehicleWreckCover(coverSystem, unit) {
  if (!coverSystem || !unit) return;
  coverSystem.removeSourceZone(`vehicle-wreck:${unit.id}`);
  unit._wreckCoverRegistered = false;
}

export function getIncomingDamageMultiplier(target, coverSystem, attackerOrType = null) {
  if (!coverSystem || !target?.def) return 1;
  if (!COVER_UNIT_TYPES.has(target.def.type)) return 1;
  const attacker = typeof attackerOrType === 'object' ? attackerOrType : null;
  const attackerType = attacker?.def?.type ?? attackerOrType;
  const garrisonMult = getGarrisonCoverMultiplier(target);
  const trenchMult = getTrenchCoverMultiplier(target);
  const directional = attacker
    ? coverSystem.getCoverForUnit(target, attacker)
    : {
        mult: target.coverMult != null ? target.coverMult : coverSystem.getCoverForUnit(target).mult,
        tier: target.coverTier,
      };
  let mult = directional.mult;
  if (garrisonMult < mult) mult = garrisonMult;
  if (trenchMult < mult) mult = trenchMult;

  // Hard cover excels against small arms, but blast and heavy shells wrap
  // around or break through it. Enclosed bunkers and trenches still help, just
  // less decisively than against bullets.
  const explosiveAttack =
    attackerType === 'mortar' ||
    attackerType === 'artillery' ||
    attackerType === 'tank' ||
    attackerType === 'superHeavyTank' ||
    attackerType === 'antiTankGun';
  if (explosiveAttack && mult < 1) {
    const tier = isUnitGarrisoned(target)
      ? 'garrison'
      : isUnitInTrench(target)
        ? 'trench'
        : directional.tier;
    const blastFloor =
      tier === 'garrison' ? 0.3 : tier === 'trench' ? 0.4 : tier === 'heavy' ? 0.42 : tier === 'medium' ? 0.58 : 0.72;
    mult = Math.max(mult, blastFloor);
  }
  if (attackerType === 'sniper' && mult < 1) mult *= 0.65;
  return mult;
}

const COVER_RING_COLORS = {
  heavy: 0x5a9fd4,
  medium: 0x6b8cae,
  light: 0x7aa8b8,
  trench: 0x9a7a3a,
};

export function setCoverVisual(mesh, inCover, mult = 0.5, tier = 'medium') {
  if (!mesh) return;
  let ring = mesh.getObjectByName('coverRing');
  if (!ring && inCover) {
    ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.78, 28),
      new THREE.MeshBasicMaterial({
        color: COVER_RING_COLORS[tier] ?? COVER_RING_COLORS.medium,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    ring.name = 'coverRing';
    ring.renderOrder = 8;
    mesh.add(ring);
  }
  if (ring) {
    ring.visible = inCover;
    if (inCover) {
      ring.material.color.setHex(COVER_RING_COLORS[tier] ?? COVER_RING_COLORS.medium);
      ring.material.opacity = 0.45 + (1 - mult) * 0.4;
    }
  }
}
