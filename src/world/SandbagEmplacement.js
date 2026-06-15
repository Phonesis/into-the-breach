import * as THREE from 'three';
import { createCamoMaterial, getInfantryUniformTexture, getVehicleCamoTexture } from '../units/UnitTextures.js';

function buildSandbagMaterials(factionId) {
  const vehicleCamo = factionId ? getVehicleCamoTexture(factionId) : null;
  const infantryCamo = factionId ? getInfantryUniformTexture(factionId) : null;
  const fabricCamo = infantryCamo ?? vehicleCamo;
  return {
    bag: createCamoMaterial(0x8a7a5a, fabricCamo, [1.8, 1.4], { rough: 0.92 }),
    bagAlt: createCamoMaterial(0x6a5a48, fabricCamo, [1.6, 1.3], { rough: 0.95 }),
    pit: createCamoMaterial(0x3a3428, fabricCamo, [1.4, 1.1], { rough: 1 }),
  };
}

/** Field-built or map-placed sandbag fighting position (heavy cover). */
export function createSandbagEmplacementGroup({ factionId = null, seed = 0 } = {}) {
  const g = new THREE.Group();
  g.name = 'sandbagEmplacement';
  const MAT = buildSandbagMaterials(factionId);
  const rand = (i) => {
    const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };

  const bags = [
    [0, 0, 0],
    [1.4, 0.5, 0.4],
    [-1.3, 0.4, -0.3],
    [0.5, -1.2, 1.2],
  ];

  for (let i = 0; i < bags.length; i++) {
    const [ox, oz, rot] = bags[i];
    const bag = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.55, 0.85),
      rand(i) > 0.5 ? MAT.bag : MAT.bagAlt
    );
    bag.position.set(ox, 0.28, oz);
    bag.rotation.y = rot;
    bag.castShadow = true;
    bag.receiveShadow = true;
    g.add(bag);
  }

  const pit = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.15, 2.4), MAT.pit);
  pit.position.y = 0.05;
  pit.receiveShadow = true;
  g.add(pit);

  return g;
}