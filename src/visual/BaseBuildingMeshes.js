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