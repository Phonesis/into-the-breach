import * as THREE from 'three';
import {
  createCamoMaterial,
  getInfantryUniformTexture,
  getVehicleCamoTexture,
} from '../units/UnitTextures.js';
import { buildBunkerFromDesign, resolveDefenseDesign } from './DefenseMeshKit.js';
import { buildDefenseMaterials } from './DefenseMeshes.js';

function matsForFaction(factionId) {
  const vehicleCamo = factionId ? getVehicleCamoTexture(factionId) : null;
  const infantryCamo = factionId ? getInfantryUniformTexture(factionId) : null;
  const fabricCamo = infantryCamo ?? vehicleCamo;
  return {
    wall: createCamoMaterial(0x5a6a5a, vehicleCamo, [3.2, 2.4], { rough: 0.9 }),
    wallDark: createCamoMaterial(0x3a4238, vehicleCamo, [2.8, 2], { rough: 0.94 }),
    roof: createCamoMaterial(0x2e3430, vehicleCamo, [2.4, 1.8], { rough: 0.88 }),
    sandbag: createCamoMaterial(0x8a7a5a, fabricCamo, [2, 1.5], { rough: 0.92 }),
    sandbagAlt: createCamoMaterial(0x6a5a48, fabricCamo, [1.8, 1.4], { rough: 0.94 }),
    steel: createCamoMaterial(0x4a4a48, vehicleCamo, [1.4, 1], { rough: 0.55, metal: 0.35 }),
    wood: createCamoMaterial(0x4a4035, fabricCamo, [1.2, 0.8], { rough: 0.95 }),
    cross: new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.7 }),
    crossRed: new THREE.MeshStandardMaterial({ color: 0xc42b2b, roughness: 0.65 }),
    crate: createCamoMaterial(0x5a4a38, fabricCamo, [1.4, 1], { rough: 0.96 }),
    dark: createCamoMaterial(0x1a1a1a, vehicleCamo, [1.2, 0.9], { rough: 0.6, metal: 0.3 }),
  };
}

function addHitbox(group, radius, y = 2) {
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 4.2, 10),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.name = 'baseBuildingHitbox';
  hit.position.y = y;
  group.add(hit);
}

export function createHospitalMesh(factionId) {
  const g = new THREE.Group();
  g.name = 'base-hospital';
  const MAT = matsForFaction(factionId);

  const base = new THREE.Mesh(new THREE.BoxGeometry(7, 2.4, 5.5), MAT.wall);
  base.position.y = 1.2;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);

  const upper = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.8, 4.2), MAT.wallDark);
  upper.position.y = 2.7;
  upper.castShadow = true;
  g.add(upper);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(6, 0.35, 4.8), MAT.roof);
  roof.position.y = 3.75;
  roof.castShadow = true;
  g.add(roof);

  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.6, 0.12), MAT.cross);
  crossV.position.set(0, 3.1, 2.2);
  g.add(crossV);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 0.12), MAT.crossRed);
  crossH.position.set(0, 3.35, 2.2);
  g.add(crossH);

  for (const [x, z] of [
    [-3.2, 2.2],
    [3.2, 2.2],
  ]) {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.9), MAT.sandbag);
    bag.position.set(x, 0.25, z);
    bag.castShadow = true;
    g.add(bag);
  }

  addHitbox(g, 3.8);
  return g;
}

export function createOrdnanceYardMesh(factionId) {
  const g = new THREE.Group();
  g.name = 'base-ordnance';
  const MAT = matsForFaction(factionId);

  const pad = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.2, 7), MAT.wallDark);
  pad.position.y = 0.1;
  pad.receiveShadow = true;
  g.add(pad);

  const shed = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.2, 3.5), MAT.wall);
  shed.position.set(-1.8, 1.1, 0);
  shed.castShadow = true;
  g.add(shed);

  const shedRoof = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.3, 3.8), MAT.roof);
  shedRoof.position.set(-1.8, 2.35, 0);
  shedRoof.castShadow = true;
  g.add(shedRoof);

  for (let i = 0; i < 4; i++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.7), MAT.crate);
    crate.position.set(2 + i * 0.95, 0.38, -1.5 + (i % 2) * 1.4);
    crate.rotation.y = i * 0.4;
    crate.castShadow = true;
    g.add(crate);
  }

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 2.8, 10), MAT.steel);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(2.2, 0.55, 1.6);
  barrel.castShadow = true;
  g.add(barrel);

  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 1.35 - Math.PI * 0.675;
    const bag = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.48, 0.82),
      i % 2 ? MAT.sandbag : MAT.sandbagAlt
    );
    bag.position.set(Math.sin(t) * 3.8, 0.24, Math.cos(t) * 3.1 + 0.5);
    bag.rotation.y = t;
    bag.castShadow = true;
    g.add(bag);
  }

  addHitbox(g, 4.2);
  return g;
}

export function createMotorPoolMesh(factionId) {
  const g = new THREE.Group();
  g.name = 'base-motor-pool';
  const MAT = matsForFaction(factionId);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.18, 6.5), MAT.wallDark);
  floor.position.y = 0.09;
  floor.receiveShadow = true;
  g.add(floor);

  const bay = new THREE.Mesh(new THREE.BoxGeometry(7.5, 3.2, 5.5), MAT.wall);
  bay.position.y = 1.6;
  bay.castShadow = true;
  bay.receiveShadow = true;
  g.add(bay);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(8, 0.4, 6), MAT.roof);
  roof.position.y = 3.35;
  roof.castShadow = true;
  g.add(roof);

  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 0.25), MAT.steel);
  doorFrame.position.set(0, 1.35, 2.85);
  g.add(doorFrame);

  const tracks = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.08, 0.35), MAT.dark);
  tracks.position.set(0, 0.22, 0.8);
  g.add(tracks);
  const tracks2 = tracks.clone();
  tracks2.position.z = -0.8;
  g.add(tracks2);

  const tool = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.4), MAT.wood);
  tool.position.set(3.2, 0.55, -1.8);
  tool.rotation.y = 0.5;
  g.add(tool);

  addHitbox(g, 4.5);
  return g;
}

export function createInfantryGarrisonMesh(factionId) {
  const g = new THREE.Group();
  g.name = 'base-infantry-garrison';
  const MAT = matsForFaction(factionId);

  const base = new THREE.Mesh(new THREE.BoxGeometry(6.5, 2.2, 5), MAT.wall);
  base.position.y = 1.1;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(7, 0.35, 5.4), MAT.roof);
  roof.position.y = 2.35;
  roof.castShadow = true;
  g.add(roof);

  const porch = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.4, 1.2), MAT.wallDark);
  porch.position.set(0, 1.2, 3.1);
  porch.castShadow = true;
  g.add(porch);

  const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2, 0.15), MAT.wood);
  door.position.set(0, 1.05, 3.75);
  g.add(door);

  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.6, 8), MAT.wood);
  flagPole.position.set(-2.6, 1.8, 2.4);
  flagPole.castShadow = true;
  g.add(flagPole);

  const flag = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.05), MAT.crossRed);
  flag.position.set(-2.05, 3.1, 2.4);
  g.add(flag);

  for (const [x, z] of [
    [-3, 2.6],
    [3, 2.6],
    [-3.4, -1.8],
    [3.4, -1.8],
  ]) {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.48, 0.85), MAT.sandbag);
    bag.position.set(x, 0.24, z);
    bag.castShadow = true;
    g.add(bag);
  }

  addHitbox(g, 3.6);
  return g;
}

export function createCampaignBunkerMesh(factionId) {
  const g = new THREE.Group();
  g.name = 'base-bunker';
  const fid = factionId ?? 'germany';
  const MAT = buildDefenseMaterials(fid);
  const design = resolveDefenseDesign(fid, 'bunker');
  buildBunkerFromDesign(g, MAT, design);
  addHitbox(g, design.hitRadius ?? 3.2, 1.8);
  return g;
}

export function createBaseBuildingMesh(typeId, factionId) {
  switch (typeId) {
    case 'hospital':
      return createHospitalMesh(factionId);
    case 'ordnanceYard':
      return createOrdnanceYardMesh(factionId);
    case 'motorPool':
      return createMotorPoolMesh(factionId);
    case 'bunker':
      return createCampaignBunkerMesh(factionId);
    case 'infantryGarrison':
      return createInfantryGarrisonMesh(factionId);
    default:
      return createHospitalMesh(factionId);
  }
}

export function setBaseBuildingHpVisual(mesh, ratio, accent = 0x5a9fd4) {
  if (!mesh) return;
  const wear = 1 - Math.max(0, Math.min(1, ratio));
  mesh.traverse((c) => {
    if (!c.isMesh || !c.material?.color) return;
    if (!c.userData.baseColor) c.userData.baseColor = c.material.color.clone();
    c.material.color.copy(c.userData.baseColor).lerp(new THREE.Color(0x2a2218), wear * 0.55);
  });
  let ring = mesh.getObjectByName('baseDamageRing');
  if (!ring && wear > 0.08) {
    ring = new THREE.Mesh(
      new THREE.RingGeometry(3.2, 3.55, 24),
      new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    ring.name = 'baseDamageRing';
    mesh.add(ring);
  }
  if (ring) {
    ring.visible = wear > 0.08;
    ring.material.opacity = 0.2 + wear * 0.45;
  }
}

/**
 * Permanent rubble pile left after a base structure is destroyed.
 * Scale roughly matches each structure's footprint.
 */
export function createBaseBuildingRubble(typeId, radius = 3.6) {
  const g = new THREE.Group();
  g.name = `base-rubble-${typeId ?? 'generic'}`;
  g.userData.isBaseBuildingRubble = true;

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x4a453d,
    roughness: 0.94,
    metalness: 0.04,
    envMapIntensity: 0.28,
  });
  const timberMat = new THREE.MeshStandardMaterial({
    color: 0x2f241c,
    roughness: 0.9,
    envMapIntensity: 0.22,
  });
  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0x5a5650,
    roughness: 0.92,
    metalness: 0.06,
    envMapIntensity: 0.24,
  });
  const scorchMat = new THREE.MeshStandardMaterial({
    color: 0x17120f,
    roughness: 0.98,
    envMapIntensity: 0.12,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x3a3a38,
    roughness: 0.55,
    metalness: 0.45,
    envMapIntensity: 0.35,
  });

  const r = Math.max(2.4, radius * 0.95);
  const isBunker = typeId === 'bunker';
  const isMotor = typeId === 'motorPool' || typeId === 'ordnanceYard';

  // Scorched pad / foundation
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.88, r * 1.08, 0.28, 14),
    scorchMat
  );
  pad.position.y = 0.06;
  pad.scale.set(1, 1, isBunker ? 0.85 : 0.78);
  pad.receiveShadow = true;
  g.add(pad);

  // Collapsed wall slab
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(r * 1.15, 0.35 + Math.random() * 0.25, r * 0.55),
    isBunker ? concreteMat : timberMat
  );
  wall.position.set((Math.random() - 0.5) * 0.6, 0.28, (Math.random() - 0.5) * 0.5);
  wall.rotation.set(0.15 + Math.random() * 0.25, Math.random() * 0.4, 0.08);
  wall.castShadow = true;
  wall.receiveShadow = true;
  g.add(wall);

  // Partial upright ruin chunk
  const upright = new THREE.Mesh(
    new THREE.BoxGeometry(0.55 + Math.random() * 0.5, 0.9 + Math.random() * 0.7, 0.45),
    isBunker ? concreteMat : stoneMat
  );
  upright.position.set(-r * 0.35, 0.55, r * 0.2);
  upright.rotation.set(0.05, Math.random() * 0.5, 0.12 + Math.random() * 0.2);
  upright.castShadow = true;
  upright.receiveShadow = true;
  g.add(upright);

  const chunkCount = isBunker ? 14 : isMotor ? 13 : 11;
  for (let i = 0; i < chunkCount; i++) {
    const roll = Math.random();
    const mat =
      roll < 0.2 ? steelMat : roll < 0.45 ? timberMat : roll < 0.75 ? stoneMat : concreteMat;
    const chunk = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.3 + Math.random() * 0.95,
        0.16 + Math.random() * 0.48,
        0.28 + Math.random() * 0.9
      ),
      mat
    );
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.sqrt(Math.random()) * r * 0.78;
    chunk.position.set(
      Math.cos(ang) * dist,
      0.18 + Math.random() * 0.35,
      Math.sin(ang) * dist
    );
    chunk.rotation.set(Math.random() * 0.7, Math.random() * Math.PI, Math.random() * 0.45);
    chunk.castShadow = true;
    chunk.receiveShadow = true;
    g.add(chunk);
  }

  // Broken beams / girders for motor pool / ordnance
  if (isMotor) {
    for (let i = 0; i < 3; i++) {
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(1.6 + Math.random() * 1.4, 0.12, 0.18),
        steelMat
      );
      beam.position.set((Math.random() - 0.5) * r * 0.9, 0.2 + Math.random() * 0.25, (Math.random() - 0.5) * r * 0.7);
      beam.rotation.set(0.1, Math.random() * Math.PI, 0.15 + Math.random() * 0.3);
      beam.castShadow = true;
      g.add(beam);
    }
  }

  // Hospital: charred timber + faint red cross fragment
  if (typeId === 'hospital') {
    const cross = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.12, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x6a2020, roughness: 0.85 })
    );
    cross.position.set(0.4, 0.35, 0.2);
    cross.rotation.y = 0.6;
    g.add(cross);
  }

  return g;
}