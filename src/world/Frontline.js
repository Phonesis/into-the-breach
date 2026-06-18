import * as THREE from 'three';
import { sampleTerrainHeight } from './Terrain.js';

function frontlineBasis(mapDef) {
  const fl = mapDef.frontline ?? { x: 0, z: 0 };
  const pb = mapDef.playerBase;
  const eb = mapDef.enemyBase;
  const dx = eb.x - pb.x;
  const dz = eb.z - pb.z;
  const len = Math.sqrt(dx * dx + dz * dz) || 1;
  const perpX = -dz / len;
  const perpZ = dx / len;
  return { fl, perpX, perpZ, lineLen: mapDef.size * 0.72 };
}

function buildRedFrontlineLine(mapDef, group) {
  const { fl, perpX, perpZ, lineLen } = frontlineBasis(mapDef);
  const segments = 56;
  const points = [];
  const lift = 0.22;

  for (let i = 0; i <= segments; i++) {
    const t = (i / segments - 0.5) * lineLen;
    const x = fl.x + perpX * t;
    const z = fl.z + perpZ * t;
    const y = sampleTerrainHeight(x, z, mapDef) + lift;
    points.push(new THREE.Vector3(x, y, z));
  }

  const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(
    lineGeo,
    new THREE.LineBasicMaterial({
      color: 0xff2a2a,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    })
  );
  line.name = 'frontlineRedLine';
  line.renderOrder = 12;
  line.frustumCulled = false;
  group.add(line);

  const stripMat = new THREE.MeshBasicMaterial({
    color: 0xff2a2a,
    transparent: true,
    opacity: 0.55,
    depthTest: false,
  });

  for (let i = 0; i < segments; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) continue;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(dist, 0.1, 0.42), stripMat);
    seg.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.04, (a.z + b.z) / 2);
    seg.rotation.y = Math.atan2(dx, dz);
    seg.renderOrder = 11;
    seg.frustumCulled = false;
    group.add(seg);
  }
}

/** Red map overlay marking the battle frontline (Assault & Tower Defence). */
export function buildFrontlineVisual(mapDef, scene) {
  const group = new THREE.Group();
  group.name = 'frontlineVisual';
  buildRedFrontlineLine(mapDef, group);
  scene.add(group);
  return group;
}

export function setFrontlineVisible(scene, visible) {
  const g = scene.getObjectByName('frontlineVisual');
  if (g) g.visible = !!visible;
}

export function disposeFrontlineVisual(scene) {
  const g = scene.getObjectByName('frontlineVisual');
  if (!g) return;
  scene.remove(g);
  g.traverse((c) => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      if (c.material.map) c.material.map.dispose();
      c.material.dispose();
    }
  });
}

/** Move the red frontline overlay when Tower Defence HQ Defense retreats the line. */
export function repositionFrontlineVisual(mapDef, scene, fl, visible = true) {
  disposeFrontlineVisual(scene);
  buildFrontlineVisual({ ...mapDef, frontline: fl }, scene);
  setFrontlineVisible(scene, visible);
}