import * as THREE from 'three';
import { getDeployRadius } from '../data/mapSizes.js';
import { sampleTerrainHeight } from '../world/Terrain.js';

const TEAM_RING = {
  player: { color: 0x3b82f6, emissive: 0x1d4ed8 },
  enemy: { color: 0xef4444, emissive: 0xb91c1c },
};

export function createDeployZoneRings(hqs, mapDef, scene) {
  const rings = [];
  for (const hq of hqs) {
    if (hq.dead) continue;
    const palette = TEAM_RING[hq.team] ?? TEAM_RING.player;
    const radius = getDeployRadius(mapDef);
    const y = sampleTerrainHeight(hq.position.x, hq.position.z, mapDef) + 0.18;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.88, radius, 72),
      new THREE.MeshStandardMaterial({
        color: palette.color,
        emissive: palette.emissive,
        emissiveIntensity: 0.55,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(hq.position.x, y, hq.position.z);
    ring.renderOrder = 5;
    ring.name = 'deployZoneRing';
    scene.add(ring);
    rings.push(ring);
  }
  return rings;
}

export function disposeDeployZoneRings(rings, scene) {
  if (!rings?.length) return;
  for (const ring of rings) {
    scene.remove(ring);
    ring.geometry?.dispose();
    ring.material?.dispose();
  }
  rings.length = 0;
}