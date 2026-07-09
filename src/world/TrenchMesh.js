import * as THREE from 'three';
import { createCamoMaterial, getInfantryUniformTexture, getVehicleCamoTexture } from '../units/UnitTextures.js';

/**
 * Simple dug fighting trench — berms + pit floor for infantry cover.
 */
export function createTrenchGroup({ factionId = null, seed = 0, length = 4.2, width = 2.4 } = {}) {
  const g = new THREE.Group();
  g.name = 'infantryTrench';

  const vehicleCamo = factionId ? getVehicleCamoTexture(factionId) : null;
  const infantryCamo = factionId ? getInfantryUniformTexture(factionId) : null;
  const fabric = infantryCamo ?? vehicleCamo;
  const dirt = createCamoMaterial(0x4a3c28, fabric, [1.6, 1.2], { rough: 1 });
  const dirtDark = createCamoMaterial(0x2e2618, fabric, [1.4, 1.1], { rough: 1 });
  const lip = createCamoMaterial(0x5a4a32, fabric, [1.5, 1.15], { rough: 0.98 });

  const rand = (i) => {
    const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };

  // Sunken floor
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(length * 0.92, 0.22, width * 0.85),
    dirtDark
  );
  floor.position.y = -0.12;
  floor.receiveShadow = true;
  g.add(floor);

  // Front and rear berms (facing +Z as "front")
  const bermH = 0.42;
  const front = new THREE.Mesh(new THREE.BoxGeometry(length, bermH, 0.55), lip);
  front.position.set(0, bermH * 0.35, width * 0.42);
  front.castShadow = true;
  front.receiveShadow = true;
  g.add(front);

  const rear = new THREE.Mesh(new THREE.BoxGeometry(length * 0.95, bermH * 0.85, 0.48), dirt);
  rear.position.set(0, bermH * 0.28, -width * 0.4);
  rear.castShadow = true;
  rear.receiveShadow = true;
  g.add(rear);

  // Side walls
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, bermH * 0.9, width * 0.75),
      side > 0 ? dirt : lip
    );
    wall.position.set(side * (length * 0.46), bermH * 0.3, 0);
    wall.castShadow = true;
    wall.receiveShadow = true;
    g.add(wall);
  }

  // Loose spoil heaps
  for (let i = 0; i < 4; i++) {
    const heap = new THREE.Mesh(
      new THREE.SphereGeometry(0.28 + rand(i) * 0.12, 6, 5),
      rand(i + 3) > 0.5 ? dirt : lip
    );
    heap.scale.y = 0.55;
    heap.position.set(
      (rand(i + 1) - 0.5) * length * 0.7,
      0.12,
      (rand(i + 2) > 0.5 ? 1 : -1) * (width * 0.55 + rand(i) * 0.2)
    );
    heap.castShadow = true;
    g.add(heap);
  }

  return g;
}
