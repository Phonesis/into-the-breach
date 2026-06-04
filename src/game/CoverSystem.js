import * as THREE from 'three';
import { removeCoverMarker, syncCoverMarker } from '../visual/CoverMarkers.js';

/** Infantry / MG cover — reduces incoming damage while near cover sites. */

export const COVER_TYPES = {
  heavy: {
    radius: 5.5,
    mult: 0.22,
    label: 'Heavy cover',
    shortLabel: 'Heavy',
    detail: 'Bunkers & hard shelter — ~78% less damage',
  },
  medium: {
    radius: 4,
    mult: 0.38,
    label: 'Medium cover',
    shortLabel: 'Medium',
    detail: 'Hedges & walls — ~62% less damage',
  },
  light: {
    radius: 2.8,
    mult: 0.55,
    label: 'Light cover',
    shortLabel: 'Light',
    detail: 'Fighting pits & scrub — ~45% less damage',
  },
};

export function formatCoverReduction(mult) {
  return Math.round((1 - mult) * 100);
}

export function getCoverStatus(unit) {
  if (!unit || unit.dead || !COVER_UNIT_TYPES.has(unit.def?.type)) {
    return { inCover: false };
  }
  const mult = unit.coverMult ?? 1;
  const inCover = unit.inCover && mult < 0.95;
  if (!inCover) return { inCover: false };
  const reduction = formatCoverReduction(mult);
  const tier = unit.coverTier ?? 'medium';
  const meta = COVER_TYPES[tier] ?? COVER_TYPES.medium;
  return {
    inCover: true,
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

const COVER_UNIT_TYPES = new Set(['infantry', 'machineGun', 'sniper']);

export class CoverSystem {
  constructor(zones = []) {
    this.zones = zones.map((z) => ({
      x: z.x,
      z: z.z,
      radius: z.radius ?? COVER_TYPES[z.type ?? 'medium'].radius,
      mult: z.mult ?? COVER_TYPES[z.type ?? 'medium'].mult,
      type: z.type ?? 'medium',
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

  removeZoneAt(x, zPos, matchRadius = 4) {
    this.zones = this.zones.filter(
      (zone) => Math.hypot(zone.x - x, zone.z - zPos) > matchRadius
    );
  }

  /** @returns {{ mult: number, label: string | null }} */
  getCoverForUnit(unit) {
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
      const edge = 1 - d / zone.radius;
      const blend = zone.mult + (1 - zone.mult) * (1 - edge * 0.45);
      if (blend < bestMult) {
        bestMult = blend;
        bestTier = zone.type;
        bestLabel = COVER_TYPES[zone.type]?.label ?? 'Cover';
      }
    }

    return {
      mult: bestMult,
      label: bestMult < 0.95 ? bestLabel : null,
      tier: bestMult < 0.95 ? bestTier : null,
    };
  }

  updateUnits(units) {
    for (const u of units) {
      if (u.dead || !COVER_UNIT_TYPES.has(u.def?.type)) {
        u.inCover = false;
        u.coverMult = 1;
        u.coverLabel = null;
        u.coverTier = null;
        setCoverVisual(u.mesh, false);
        removeCoverMarker(u);
        continue;
      }
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

export function getIncomingDamageMultiplier(target, coverSystem) {
  if (!coverSystem || !target?.def) return 1;
  if (!COVER_UNIT_TYPES.has(target.def.type)) return 1;
  if (target.coverMult != null) return target.coverMult;
  return coverSystem.getCoverForUnit(target).mult;
}

const COVER_RING_COLORS = {
  heavy: 0x5a9fd4,
  medium: 0x6b8cae,
  light: 0x7aa8b8,
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