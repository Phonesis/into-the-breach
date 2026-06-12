import * as THREE from 'three';
import {
  createCamoMaterial,
  getInfantryUniformTexture,
  getVehicleCamoTexture,
} from '../units/UnitTextures.js';
import {
  buildArtilleryPit,
  buildAtEmplacement,
  buildBunkerFromDesign,
  buildMgNestFromDesign,
  buildMortarNestFromDesign,
  buildMineEmplacement,
  buildWireObstacle,
  resolveDefenseDesign,
} from './DefenseMeshKit.js';

function buildDefenseMaterials(factionId) {
  const vehicleCamo = factionId ? getVehicleCamoTexture(factionId) : null;
  const infantryCamo = factionId ? getInfantryUniformTexture(factionId) : null;
  const fabricCamo = infantryCamo ?? vehicleCamo;

  return {
    concrete: createCamoMaterial(0x6a6a62, vehicleCamo, [2.4, 1.8], { rough: 0.92 }),
    concreteDark: createCamoMaterial(0x4a4a45, vehicleCamo, [2.2, 1.6], { rough: 0.94 }),
    sandbag: createCamoMaterial(0x8a7a5a, fabricCamo, [2.2, 1.6], { rough: 0.9 }),
    sandbagAlt: createCamoMaterial(0x6a5a48, fabricCamo, [1.8, 1.4], { rough: 0.93 }),
    earth: createCamoMaterial(0x4a4035, fabricCamo, [2.6, 2], { rough: 0.98 }),
    wood: createCamoMaterial(0x4a4035, fabricCamo, [1.2, 0.8], { rough: 0.95 }),
    steel: createCamoMaterial(0x3a3a38, vehicleCamo, [1.4, 1], { rough: 0.55, metal: 0.38 }),
    wire: new THREE.MeshStandardMaterial({ color: 0x5a5a52, metalness: 0.45, roughness: 0.5 }),
    pit: createCamoMaterial(0x3a3428, fabricCamo, [1.8, 1.4], { rough: 0.95 }),
    mine: createCamoMaterial(0x3d3830, vehicleCamo, [1.6, 1.2], { rough: 0.98 }),
    camoBody: createCamoMaterial(0xffffff, vehicleCamo, [2, 1.5], { rough: 0.72, metal: 0.15 }),
    camoDetail: createCamoMaterial(0xffffff, vehicleCamo, [1.8, 1.4], { rough: 0.65, metal: 0.28 }),
    camoDark: createCamoMaterial(0x252420, vehicleCamo, [1.6, 1.2], { rough: 0.58, metal: 0.32 }),
    dark: createCamoMaterial(0x1a1a1a, vehicleCamo, [1.4, 1], { rough: 0.6, metal: 0.35 }),
  };
}

function addPickCollider(group, radius = 3) {
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 4, 8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.name = 'defenseHitbox';
  hit.position.y = 2;
  group.add(hit);
}

export function createDefenseMesh(typeId, _accent = 0xc9a227, factionId = null) {
  const g = new THREE.Group();
  g.name = `defense-${typeId}`;
  const fid = factionId ?? 'germany';
  const MAT = buildDefenseMaterials(fid);
  const design = resolveDefenseDesign(fid, typeId);

  switch (typeId) {
    case 'bunker':
    case 'bunkerHeavy':
      buildBunkerFromDesign(g, MAT, design);
      addPickCollider(g, design.hitRadius ?? 3.2);
      break;
    case 'mgNest':
    case 'mgNestMk2':
      buildMgNestFromDesign(g, MAT, design);
      addPickCollider(g, design.hitRadius ?? 2.8);
      break;
    case 'mortarNest':
    case 'mortarNestMk2':
      buildMortarNestFromDesign(g, MAT, design);
      addPickCollider(g, design.hitRadius ?? 2.6);
      break;
    case 'atGun':
      buildAtEmplacement(g, MAT, fid, design, false);
      addPickCollider(g, design.hitRadius ?? 3);
      break;
    case 'atGun88':
      buildAtEmplacement(g, MAT, fid, design, true);
      addPickCollider(g, design.hitRadius ?? 3.5);
      break;
    case 'barbedWire':
      buildWireObstacle(g, MAT, design, false);
      addPickCollider(g, design.hitRadius ?? 3.5);
      break;
    case 'razorWire':
      buildWireObstacle(g, MAT, design, true);
      addPickCollider(g, design.hitRadius ?? 4);
      break;
    case 'mine':
      buildMineEmplacement(g, MAT, design);
      addPickCollider(g, design.hitRadius ?? 1.8);
      break;
    case 'artillery':
    case 'artilleryHeavy':
      buildArtilleryPit(g, MAT, fid, design);
      addPickCollider(g, design.hitRadius ?? 3.2);
      break;
    default:
      break;
  }

  g.traverse((c) => {
    if (c.isMesh && c.name !== 'defenseHitbox') {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return g;
}

export function setDefenseHpVisual(mesh, hpRatio) {
  if (!mesh) return;
  const smoke = mesh.getObjectByName('defenseDamage');
  if (hpRatio > 0.4) {
    if (smoke) smoke.visible = false;
    return;
  }
  let s = smoke;
  if (!s) {
    s = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.35 })
    );
    s.name = 'defenseDamage';
    s.position.y = 2;
    mesh.add(s);
  }
  s.visible = true;
  s.scale.setScalar(1 + (1 - hpRatio) * 0.9);
}

export function setDefenseSelected(mesh, selected) {
  if (!mesh) return;
  let ring = mesh.getObjectByName('defenseSelectRing');
  if (!selected) {
    if (ring) ring.visible = false;
    return;
  }
  if (!ring) {
    const geo = new THREE.RingGeometry(2.8, 3.2, 24);
    geo.rotateX(-Math.PI / 2);
    ring = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: 0x5a9fd4,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
      })
    );
    ring.name = 'defenseSelectRing';
    ring.position.y = 0.35;
    mesh.add(ring);
  }
  ring.visible = true;
}