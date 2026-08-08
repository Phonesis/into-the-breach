import * as THREE from 'three';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { Unit } from '../units/Unit.js';
import { grantEliteStatus } from '../game/EliteBehavior.js';
import { getParatrooperDef } from '../data/paratroopers.js';

const activeDrops = [];
const groundedChutes = [];

let _canopyTex = null;
let _groundedTex = null;

function disposeParachuteTextures() {
  _canopyTex?.dispose();
  _groundedTex?.dispose();
  _canopyTex = null;
  _groundedTex = null;
}

function disposeMaterial(mat) {
  if (!mat) return;
  mat.map = null;
  mat.dispose();
}

/** Radial gore pattern for open canopy (viewed from below). */
function getCanopyTexture() {
  if (_canopyTex) return _canopyTex;

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.47;

  const base = ctx.createRadialGradient(cx, cy, radius * 0.08, cx, cy, radius);
  base.addColorStop(0, '#9aa48a');
  base.addColorStop(0.45, '#727a62');
  base.addColorStop(0.82, '#5a6248');
  base.addColorStop(1, '#3e4434');
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  const gores = 18;
  for (let i = 0; i < gores; i++) {
    const a0 = (i / gores) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / gores) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, a0, a1);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 248, 220, 0.1)' : 'rgba(18, 22, 14, 0.14)';
    ctx.fill();

    ctx.strokeStyle = 'rgba(28, 32, 22, 0.55)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a0) * radius, cy + Math.sin(a0) * radius);
    ctx.stroke();
  }

  for (let ring = 0; ring < 5; ring++) {
    const rr = radius * (0.28 + ring * 0.14);
    ctx.strokeStyle = `rgba(40, 44, 32, ${0.12 + ring * 0.04})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (let i = 0; i < 5200; i++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.sqrt(Math.random()) * radius;
    const px = cx + Math.cos(ang) * dist;
    const py = cy + Math.sin(ang) * dist;
    ctx.fillStyle =
      Math.random() > 0.5 ? 'rgba(255, 255, 235, 0.045)' : 'rgba(0, 0, 0, 0.06)';
    ctx.fillRect(px, py, 1.5, 0.8);
  }

  const ventR = radius * 0.1;
  ctx.fillStyle = '#2e3228';
  ctx.beginPath();
  ctx.arc(cx, cy, ventR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(12, 14, 10, 0.75)';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(70, 74, 58, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, ventR * 1.35, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(45, 48, 36, 0.9)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.94, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(20, 22, 16, 0.65)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.99, 0, Math.PI * 2);
  ctx.stroke();

  _canopyTex = new THREE.CanvasTexture(canvas);
  _canopyTex.colorSpace = THREE.SRGBColorSpace;
  _canopyTex.anisotropy = 4;
  return _canopyTex;
}

/** Crumpled fabric for grounded parachutes. */
function getGroundedTexture() {
  if (_groundedTex) return _groundedTex;

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;

  ctx.fillStyle = '#5c6550';
  ctx.fillRect(0, 0, size, size);

  for (let f = 0; f < 14; f++) {
    const fx = cx + (Math.random() - 0.5) * size * 0.55;
    const fy = cy + (Math.random() - 0.5) * size * 0.55;
    const fr = 40 + Math.random() * 90;
    const fold = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
    fold.addColorStop(0, 'rgba(255, 248, 220, 0.14)');
    fold.addColorStop(0.45, 'rgba(35, 40, 28, 0.22)');
    fold.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = fold;
    ctx.beginPath();
    ctx.ellipse(fx, fy, fr, fr * (0.55 + Math.random() * 0.35), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 9; i++) {
    const ang = Math.random() * Math.PI * 2;
    const len = 80 + Math.random() * 160;
    const x0 = cx + (Math.random() - 0.5) * 120;
    const y0 = cy + (Math.random() - 0.5) * 120;
    const grad = ctx.createLinearGradient(x0, y0, x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
    grad.addColorStop(0, 'rgba(90, 98, 72, 0.5)');
    grad.addColorStop(0.5, 'rgba(40, 44, 32, 0.35)');
    grad.addColorStop(1, 'rgba(110, 118, 92, 0.25)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 6 + Math.random() * 10;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(
      x0 + Math.cos(ang + 0.4) * len * 0.5,
      y0 + Math.sin(ang + 0.4) * len * 0.5,
      x0 + Math.cos(ang) * len,
      y0 + Math.sin(ang) * len
    );
    ctx.stroke();
  }

  for (let i = 0; i < 3000; i++) {
    const px = Math.random() * size;
    const py = Math.random() * size;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,230,0.05)' : 'rgba(0,0,0,0.07)';
    ctx.fillRect(px, py, 2, 1);
  }

  const edge = ctx.createRadialGradient(cx, cy, size * 0.2, cx, cy, size * 0.5);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(0.75, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(18,20,14,0.45)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, size, size);

  _groundedTex = new THREE.CanvasTexture(canvas);
  _groundedTex.colorSpace = THREE.SRGBColorSpace;
  _groundedTex.wrapS = THREE.RepeatWrapping;
  _groundedTex.wrapT = THREE.RepeatWrapping;
  return _groundedTex;
}

function createCanopyMaterial({ grounded = false } = {}) {
  const tex = grounded ? getGroundedTexture() : getCanopyTexture();
  return new THREE.MeshStandardMaterial({
    map: tex,
    color: grounded ? 0xbcbcac : 0xffffff,
    roughness: 0.92,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
}

function createParachuteRig(scene, unit) {
  const group = new THREE.Group();
  group.name = 'parachuteDrop';

  const canopyMat = createCanopyMaterial();
  const materials = [canopyMat];
  const geometries = [];

  const canopyGeo = new THREE.SphereGeometry(2.2, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  geometries.push(canopyGeo);
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.rotation.x = Math.PI;
  group.add(canopy);

  const edgeGeo = new THREE.TorusGeometry(2.05, 0.09, 8, 28);
  geometries.push(edgeGeo);
  const edge = new THREE.Mesh(edgeGeo, canopyMat);
  edge.rotation.x = Math.PI / 2;
  edge.position.y = -0.04;
  group.add(edge);

  const ventGeo = new THREE.RingGeometry(0.14, 0.34, 16);
  geometries.push(ventGeo);
  const ventMat = new THREE.MeshStandardMaterial({
    color: 0x2a2e24,
    roughness: 0.98,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  materials.push(ventMat);
  const vent = new THREE.Mesh(ventGeo, ventMat);
  vent.rotation.x = -Math.PI / 2;
  vent.position.y = 0.05;
  group.add(vent);

  const lineMat = new THREE.MeshStandardMaterial({ color: 0x3d3830, roughness: 0.95 });
  materials.push(lineMat);
  const lineCount = 12;
  for (let i = 0; i < lineCount; i++) {
    const a = (i / lineCount) * Math.PI * 2;
    const lineGeo = new THREE.CylinderGeometry(0.01, 0.01, 2.95, 4);
    geometries.push(lineGeo);
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.position.set(Math.sin(a) * 1.02, -1.48, Math.cos(a) * 1.02);
    group.add(line);
  }

  const harnessGeo = new THREE.TorusGeometry(0.42, 0.045, 6, 16);
  geometries.push(harnessGeo);
  const harness = new THREE.Mesh(harnessGeo, lineMat);
  harness.rotation.x = Math.PI / 2;
  harness.position.y = -2.85;
  group.add(harness);

  if (unit.mesh.parent) unit.mesh.parent.remove(unit.mesh);
  unit.mesh.position.set(0, -3.25, 0);
  unit.mesh.rotation.set(0, 0, 0);
  group.add(unit.mesh);

  scene.add(group);
  return { group, geometries, materials };
}

function createGroundedParachute(scene, mapDef, x, z) {
  const y = sampleTerrainHeight(x, z, mapDef);
  const group = new THREE.Group();
  group.name = 'groundedParachute';

  const canopyMat = createCanopyMaterial({ grounded: true });
  canopyMat.transparent = true;
  canopyMat.opacity = 0.94;

  const canopyGeo = new THREE.CircleGeometry(2.6, 24);
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.rotation.x = -Math.PI / 2;
  canopy.rotation.z = Math.random() * Math.PI * 2;
  canopy.scale.set(0.75 + Math.random() * 0.35, 1, 0.8 + Math.random() * 0.3);
  canopy.position.y = 0.09;
  group.add(canopy);

  const materials = [canopyMat];
  const geometries = [canopyGeo];

  const bundleGeo = new THREE.SphereGeometry(0.28, 8, 6);
  geometries.push(bundleGeo);
  const bundleMat = new THREE.MeshStandardMaterial({ color: 0x4a5040, roughness: 0.96 });
  materials.push(bundleMat);
  const bundle = new THREE.Mesh(bundleGeo, bundleMat);
  bundle.scale.set(1.2, 0.45, 1.1);
  bundle.position.y = 0.14;
  group.add(bundle);

  for (let i = 0; i < 7; i++) {
    const lineGeo = new THREE.BoxGeometry(0.05, 0.02, 0.45 + Math.random() * 1.1);
    geometries.push(lineGeo);
    const lineMat = new THREE.MeshStandardMaterial({ color: 0x4a4438, roughness: 0.96 });
    materials.push(lineMat);
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.position.set((Math.random() - 0.5) * 2.6, 0.04, (Math.random() - 0.5) * 2.6);
    line.rotation.y = Math.random() * Math.PI;
    group.add(line);
  }

  group.position.set(x, y, z);
  scene.add(group);
  groundedChutes.push({ group, geometries, materials });
}

function disposeRig(rig) {
  rig?.geometries?.forEach((g) => g.dispose());
  rig?.materials?.forEach((m) => disposeMaterial(m));
}

function cleanupDrop(drop, scene) {
  if (drop.jumpGroup?.parent) scene.remove(drop.jumpGroup);
  drop.jumpGroup = null;
  if (drop.rig?.group?.parent) scene.remove(drop.rig.group);
  disposeRig(drop.rig);
}

function landParatrooper(drop, scene, mapDef) {
  const unit = drop.unit;
  unit._dropping = false;

  const groundY = sampleTerrainHeight(drop.x, drop.z, mapDef);
  if (drop.rig?.group && unit.mesh?.parent === drop.rig.group) {
    drop.rig.group.remove(unit.mesh);
  }
  scene.add(unit.mesh);
  unit.mesh.position.set(drop.x, groundY, drop.z);
  unit.mesh.rotation.set(0, 0, 0);
  unit.position.x = drop.x;
  unit.position.z = drop.z;
  unit.position.y = groundY;

  createGroundedParachute(
    scene,
    mapDef,
    drop.x + (Math.random() - 0.5) * 1.8,
    drop.z + (Math.random() - 0.5) * 1.8
  );

  if (drop.rig?.group?.parent) scene.remove(drop.rig.group);
  disposeRig(drop.rig);
}

function landingScatter(tx, tz, index, count, dropRadius) {
  const angle = (index / Math.max(1, count)) * Math.PI * 2 + Math.random() * 0.45;
  const r = Math.sqrt(Math.random()) * dropRadius * 0.88;
  return {
    x: tx + Math.cos(angle) * r,
    z: tz + Math.sin(angle) * r,
  };
}

/**
 * Instant full-canopy drop (legacy / no transport). Squads appear under open chutes.
 */
export function spawnParatrooperSquad(game, tx, tz, opts = {}) {
  const faction = opts.faction ?? game.playerFaction;
  const team = opts.team ?? 'player';
  const def = opts.def ?? getParatrooperDef(faction?.id);
  const count = opts.squadCount ?? 5;
  const dropRadius = opts.dropRadius ?? 11;
  const dropHeight = opts.dropHeight ?? 48;
  const descentRate = opts.descentRate ?? 12;

  for (let i = 0; i < count; i++) {
    const { x, z } = landingScatter(tx, tz, i, count, dropRadius);
    const groundY = sampleTerrainHeight(x, z, game.mapDef);

    const unit = new Unit({
      def,
      faction,
      team,
      position: { x, z },
      scene: game.scene,
    });
    unit._mapDef = game.mapDef;
    unit._dropping = true;
    grantEliteStatus(unit);

    const rig = createParachuteRig(game.scene, unit);
    activeDrops.push({
      phase: 'canopy',
      unit,
      x,
      z,
      altitude: dropHeight,
      descentRate: descentRate * (0.9 + Math.random() * 0.18),
      swayPhase: Math.random() * Math.PI * 2,
      rig,
    });
    rig.group.position.set(x, groundY + dropHeight, z);
    game.units.push(unit);
  }
  game._rebuildUnitCaches?.();
}

/**
 * One squad exits the transport door, freefalls briefly, then opens a chute
 * and drifts to a scatter landing near the drop zone.
 *
 * @param {object} opts
 * @param {{x:number,y:number,z:number}} opts.exit — world door position
 * @param {number} opts.landX
 * @param {number} opts.landZ
 * @param {number} [opts.velX] — plane horizontal velocity at exit
 * @param {number} [opts.velZ]
 */
export function spawnParatrooperExit(game, opts = {}) {
  const faction = opts.faction ?? game.playerFaction;
  const team = opts.team ?? 'player';
  const def = opts.def ?? getParatrooperDef(faction?.id);
  const exit = opts.exit ?? { x: 0, y: 40, z: 0 };
  const landX = opts.landX ?? exit.x;
  const landZ = opts.landZ ?? exit.z;
  const velX = opts.velX ?? 0;
  const velZ = opts.velZ ?? 0;
  const freefallTime = opts.freefallTime ?? 0.7 + Math.random() * 0.3;
  const descentRate = opts.descentRate ?? 8.2;

  const unit = new Unit({
    def,
    faction,
    team,
    position: { x: landX, z: landZ },
    scene: game.scene,
  });
  unit._mapDef = game.mapDef;
  unit._dropping = true;
  grantEliteStatus(unit);

  // During freefall the squad hangs in a simple jump group (no canopy yet)
  const jumpGroup = new THREE.Group();
  jumpGroup.name = 'paratrooperExit';
  if (unit.mesh.parent) unit.mesh.parent.remove(unit.mesh);
  unit.mesh.position.set(0, 0, 0);
  unit.mesh.rotation.set(0.35, 0, 0.08);
  jumpGroup.add(unit.mesh);
  jumpGroup.position.set(exit.x, exit.y, exit.z);
  game.scene.add(jumpGroup);

  const groundY = sampleTerrainHeight(landX, landZ, game.mapDef);
  const altitude = Math.max(8, exit.y - groundY);

  activeDrops.push({
    phase: 'freefall',
    unit,
    // Horizontal state (lerps toward landing during freefall + canopy)
    x: exit.x,
    z: exit.z,
    landX,
    landZ,
    velX: velX * 0.55 + (landX - exit.x) * 0.08,
    velZ: velZ * 0.55 + (landZ - exit.z) * 0.08,
    altitude,
    freefallLeft: freefallTime,
    descentRate: descentRate * (0.9 + Math.random() * 0.18),
    swayPhase: Math.random() * Math.PI * 2,
    rig: { group: jumpGroup, geometries: [], materials: [] },
    jumpGroup,
  });

  game.units.push(unit);
  game._rebuildUnitCaches?.();
  return unit;
}

function deployCanopy(drop, scene, mapDef) {
  const unit = drop.unit;
  if (drop.jumpGroup) {
    drop.jumpGroup.remove(unit.mesh);
    if (drop.jumpGroup.parent) scene.remove(drop.jumpGroup);
    drop.jumpGroup = null;
  }
  const rig = createParachuteRig(scene, unit);
  drop.rig = rig;
  drop.phase = 'canopy';
  // Kill most of the plane speed once the silk opens
  drop.velX *= 0.22;
  drop.velZ *= 0.22;
  const groundY = sampleTerrainHeight(drop.x, drop.z, mapDef);
  rig.group.position.set(drop.x, groundY + drop.altitude, drop.z);
}

export function updateParachuteDrops(dt, scene, mapDef) {
  for (let i = activeDrops.length - 1; i >= 0; i--) {
    const drop = activeDrops[i];
    const unit = drop.unit;

    if (unit.dead || !unit.mesh) {
      if (drop.jumpGroup?.parent) scene.remove(drop.jumpGroup);
      cleanupDrop(drop, scene);
      activeDrops.splice(i, 1);
      continue;
    }

    if (drop.phase === 'freefall') {
      drop.freefallLeft -= dt;
      // Brief exit fall — still faster than canopy, but not a brick
      drop.altitude -= (drop.descentRate * 1.65 + 3.5) * dt;
      drop.x += drop.velX * dt;
      drop.z += drop.velZ * dt;
      // Soft pull toward landing scatter while still in freefall
      drop.x += (drop.landX - drop.x) * Math.min(1, dt * 0.55);
      drop.z += (drop.landZ - drop.z) * Math.min(1, dt * 0.55);
      drop.velX *= 1 - Math.min(0.5, dt * 0.35);
      drop.velZ *= 1 - Math.min(0.5, dt * 0.35);

      const groundY = sampleTerrainHeight(drop.x, drop.z, mapDef);
      const y = groundY + Math.max(0, drop.altitude);
      drop.rig.group.position.set(drop.x, y, drop.z);
      drop.rig.group.rotation.x = 0.4;
      drop.rig.group.rotation.z = Math.sin(drop.freefallLeft * 9) * 0.12;
      drop.rig.group.rotation.y += dt * 0.8;

      if (drop.freefallLeft <= 0 || drop.altitude < 18) {
        deployCanopy(drop, scene, mapDef);
      }
      continue;
    }

    // Canopy descent
    drop.altitude -= drop.descentRate * dt;
    drop.swayPhase += dt * 1.4;
    if (drop.landX != null) {
      drop.x += (drop.landX - drop.x) * Math.min(1, dt * 0.65);
      drop.z += (drop.landZ - drop.z) * Math.min(1, dt * 0.65);
      drop.x += (drop.velX ?? 0) * dt;
      drop.z += (drop.velZ ?? 0) * dt;
      if (drop.velX != null) {
        drop.velX *= 1 - Math.min(0.8, dt * 1.2);
        drop.velZ *= 1 - Math.min(0.8, dt * 1.2);
      }
    }
    const swayX = Math.sin(drop.swayPhase) * 0.6;
    const swayZ = Math.cos(drop.swayPhase * 0.88) * 0.5;
    const groundY = sampleTerrainHeight(drop.x, drop.z, mapDef);
    const y = groundY + Math.max(0, drop.altitude);

    drop.rig.group.position.set(drop.x + swayX, y, drop.z + swayZ);
    drop.rig.group.rotation.y += dt * 0.14;

    if (drop.altitude <= 0.7) {
      landParatrooper(drop, scene, mapDef);
      activeDrops.splice(i, 1);
    }
  }
}

export function clearActiveParachuteDrops(scene) {
  while (activeDrops.length) {
    const drop = activeDrops.pop();
    if (drop.unit && !drop.unit.dead) {
      drop.unit._dropping = false;
      if (drop.unit.mesh && !drop.unit.mesh.parent) scene?.add(drop.unit.mesh);
    }
    cleanupDrop(drop, scene);
  }
}

export function clearParachuteEffects(scene) {
  clearActiveParachuteDrops(scene);
  while (groundedChutes.length) {
    const ch = groundedChutes.pop();
    if (ch.group?.parent) scene.remove(ch.group);
    ch.geometries?.forEach((g) => g.dispose());
    ch.materials?.forEach((m) => disposeMaterial(m));
  }
  if (activeDrops.length === 0 && groundedChutes.length === 0) {
    disposeParachuteTextures();
  }
}