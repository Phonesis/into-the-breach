import * as THREE from 'three';
import { sampleTerrainHeight } from './Terrain.js';

const craters = [];
const MAX_CRATERS = 24;

let lastCraterAt = 0;

export function addTerrainCrater(scene, mapDef, x, z, opts = {}) {
  const now = performance.now();
  if (now - lastCraterAt < 120) return null;
  lastCraterAt = now;

  const radius = opts.radius ?? 3.5;
  const heavy = opts.heavy ?? false;
  const y = sampleTerrainHeight(x, z, mapDef);

  const crater = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.35, radius, 20),
    new THREE.MeshStandardMaterial({
      color: heavy ? 0x1a1510 : 0x2a2218,
      roughness: 0.95,
      metalness: 0,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    })
  );
  crater.rotation.x = -Math.PI / 2;
  crater.position.set(x, y + 0.12, z);
  crater.receiveShadow = true;
  scene.add(crater);

  const bowl = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.45, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: 0x1a1410,
      roughness: 1,
      transparent: true,
      opacity: 0.75,
    })
  );
  bowl.position.set(x, y + 0.05, z);
  scene.add(bowl);

  const scorch = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.85, 16),
    new THREE.MeshBasicMaterial({
      color: 0x0a0806,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    })
  );
  scorch.rotation.x = -Math.PI / 2;
  scorch.position.set(x, y + 0.14, z);
  scene.add(scorch);

  const entry = { crater, bowl, scorch, life: 1, scene };
  craters.push(entry);

  while (craters.length > MAX_CRATERS) {
    const old = craters.shift();
    disposeCrater(old);
  }

  return entry;
}

function disposeCrater(entry) {
  if (!entry) return;
  entry.scene.remove(entry.crater);
  entry.scene.remove(entry.bowl);
  entry.scene.remove(entry.scorch);
  entry.crater.geometry.dispose();
  entry.crater.material.dispose();
  entry.bowl.geometry.dispose();
  entry.bowl.material.dispose();
  entry.scorch.geometry.dispose();
  entry.scorch.material.dispose();
}

export function clearTerrainDamage(scene) {
  while (craters.length) {
    disposeCrater(craters.shift());
  }
}