import * as THREE from 'three';
import { sampleTerrainHeight } from './Terrain.js';

/** Place sandbag fighting positions and return cover zone data. */
export function buildCoverSites(mapDef, scene, scenery = null) {
  const zones = [];
  const size = mapDef.size;
  const bagMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.92 });
  const darkBag = new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 0.95 });

  const addBunker = (x, z, type = 'medium') => {
    const y = sampleTerrainHeight(x, z, mapDef);
    const g = new THREE.Group();
    g.position.set(x, y, z);

    for (const [ox, oz, rot] of [
      [0, 0, 0],
      [1.4, 0.5, 0.4],
      [-1.3, 0.4, -0.3],
      [0.5, -1.2, 1.2],
    ]) {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 0.85), Math.random() > 0.5 ? bagMat : darkBag);
      bag.position.set(ox, 0.28, oz);
      bag.rotation.y = rot;
      bag.castShadow = true;
      bag.receiveShadow = true;
      g.add(bag);
    }

    const pit = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.15, 2.4),
      new THREE.MeshStandardMaterial({ color: 0x3a3428, roughness: 1 })
    );
    pit.position.y = 0.05;
    pit.receiveShadow = true;
    g.add(pit);

    if (scenery) {
      scenery.register(g, { x, z, kind: 'bunker', coverType: type });
    } else {
      scene.add(g);
      zones.push({ x, z, type });
    }
  };

  const count = mapDef.terrain === 'desert' ? 14 : mapDef.terrain === 'bocage' ? 22 : 18;

  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * size * 0.75;
    const z = (Math.random() - 0.5) * size * 0.75;
    if (Math.abs(x) < 10 && Math.abs(z) < 8) continue;
    const t = Math.random() < 0.25 ? 'heavy' : 'medium';
    addBunker(x, z, t);
  }

  if (mapDef.terrain === 'bocage') {
    for (let i = 0; i < 35; i++) {
      const hx = (Math.random() - 0.5) * size * 0.55;
      const hz = (Math.random() - 0.5) * size * 0.55;
      zones.push({ x: hx, z: hz, type: 'heavy' });
    }
  }

  for (let i = 0; i < 25; i++) {
    const x = (Math.random() - 0.5) * size * 0.8;
    const z = (Math.random() - 0.5) * size * 0.8;
    const h = sampleTerrainHeight(x, z, mapDef);
    if (h > 2.5) {
      zones.push({ x, z, type: 'light' });
    }
  }

  const fl = mapDef.frontline ?? { x: 0, z: 0 };
  addBunker(fl.x - 8, fl.z, 'heavy');
  addBunker(fl.x + 8, fl.z, 'heavy');
  addBunker(fl.x, fl.z - 10, 'medium');
  addBunker(fl.x, fl.z + 10, 'medium');

  return zones;
}