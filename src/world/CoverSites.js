import * as THREE from 'three';
import { sampleTerrainHeight } from './Terrain.js';
import { createCamoMaterial, getInfantryUniformTexture, getVehicleCamoTexture } from '../units/UnitTextures.js';

function factionForPosition(x, z, mapDef, factions) {
  if (!factions?.player) return null;
  const fl = mapDef.frontline;
  const pb = mapDef.playerBase;
  if (!fl || !pb || !factions.enemy) return factions.player;
  const toPlayerX = pb.x - fl.x;
  const toPlayerZ = pb.z - fl.z;
  const along = (x - fl.x) * toPlayerX + (z - fl.z) * toPlayerZ;
  return along >= 0 ? factions.player : factions.enemy;
}

function buildBunkerMaterials(factionId) {
  const vehicleCamo = factionId ? getVehicleCamoTexture(factionId) : null;
  const infantryCamo = factionId ? getInfantryUniformTexture(factionId) : null;
  const fabricCamo = infantryCamo ?? vehicleCamo;
  return {
    bag: createCamoMaterial(0x8a7a5a, fabricCamo, [1.8, 1.4], { rough: 0.92 }),
    bagAlt: createCamoMaterial(0x6a5a48, fabricCamo, [1.6, 1.3], { rough: 0.95 }),
    pit: createCamoMaterial(0x3a3428, fabricCamo, [1.4, 1.1], { rough: 1 }),
  };
}

/** Place sandbag fighting positions and return cover zone data. */
export function buildCoverSites(mapDef, scene, scenery = null, factions = null, options = {}) {
  const zones = [];

  const addBunker = (x, z, type = 'medium') => {
    const y = sampleTerrainHeight(x, z, mapDef);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const sideFaction = factionForPosition(x, z, mapDef, factions);
    const MAT = buildBunkerMaterials(sideFaction);

    for (const [ox, oz, rot] of [
      [0, 0, 0],
      [1.4, 0.5, 0.4],
      [-1.3, 0.4, -0.3],
      [0.5, -1.2, 1.2],
    ]) {
      const bag = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.55, 0.85),
        Math.random() > 0.5 ? MAT.bag : MAT.bagAlt
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

    if (scenery) {
      scenery.register(g, { x, z, kind: 'bunker', coverType: type });
    } else {
      scene.add(g);
      zones.push({ x, z, type });
    }
  };

  const sizeScale = mapDef.sizeScale ?? 1;
  const baseCount = mapDef.terrain === 'desert' ? 14 : mapDef.terrain === 'bocage' ? 22 : 18;
  const count = Math.round(baseCount * sizeScale * (sizeScale > 1 ? 1.1 : 1));

  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * mapDef.size * 0.75;
    const z = (Math.random() - 0.5) * mapDef.size * 0.75;
    if (Math.abs(x) < 10 * sizeScale && Math.abs(z) < 8 * sizeScale) continue;
    const t = Math.random() < 0.25 ? 'heavy' : 'medium';
    addBunker(x, z, t);
  }

  if (mapDef.terrain === 'bocage') {
    for (let i = 0; i < Math.round(35 * sizeScale * (sizeScale > 1 ? 1.1 : 1)); i++) {
      const hx = (Math.random() - 0.5) * mapDef.size * 0.55;
      const hz = (Math.random() - 0.5) * mapDef.size * 0.55;
      zones.push({ x: hx, z: hz, type: 'heavy' });
    }
  }

  for (let i = 0; i < 25; i++) {
    const x = (Math.random() - 0.5) * mapDef.size * 0.8;
    const z = (Math.random() - 0.5) * mapDef.size * 0.8;
    const h = sampleTerrainHeight(x, z, mapDef);
    if (h > 2.5) {
      zones.push({ x, z, type: 'light' });
    }
  }

  if (!options.towerDefense) {
    const fl = mapDef.frontline ?? { x: 0, z: 0 };
    addBunker(fl.x - 8 * sizeScale, fl.z, 'heavy');
    addBunker(fl.x + 8 * sizeScale, fl.z, 'heavy');
    addBunker(fl.x, fl.z - 10 * sizeScale, 'medium');
    addBunker(fl.x, fl.z + 10 * sizeScale, 'medium');
  }

  return zones;
}