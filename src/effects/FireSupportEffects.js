import * as THREE from 'three';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { spawnShellExplosion } from './CombatEffects.js';

const active = [];

export function clearFireSupportEffects() {
  while (active.length) {
    const fx = active.pop();
    if (fx.group?.parent) fx.group.parent.remove(fx.group);
    fx.geometries?.forEach((g) => g.dispose());
    fx.materials?.forEach((m) => m.dispose());
  }
}

export function updateFireSupportEffects(dt, scene) {
  for (let i = active.length - 1; i >= 0; i--) {
    const fx = active[i];
    fx.life -= dt;

    if (fx.type === 'plane') {
      fx.group.position.x += fx.velX * dt;
      fx.group.position.z += fx.velZ * dt;
      fx.group.position.y = fx.baseY + Math.sin(fx.life * 8) * 0.3;
    } else if (fx.type === 'warning') {
      fx.mesh.scale.setScalar(1 + Math.sin(fx.life * 12) * 0.08);
      fx.material.opacity = 0.35 + Math.sin(fx.life * 10) * 0.2;
    } else if (fx.type === 'scorch') {
      fx.material.opacity = Math.max(0, (fx.life / fx.maxLife) * 0.65);
    }

    if (fx.life <= 0) {
      if (fx.group?.parent) scene.remove(fx.group);
      if (fx.mesh?.parent) scene.remove(fx.mesh);
      fx.geometries?.forEach((g) => g.dispose());
      fx.materials?.forEach((m) => m.dispose());
      active.splice(i, 1);
    }
  }
}

export function spawnStrikeWarning(scene, mapDef, x, z, radius, isBarrage) {
  const y = sampleTerrainHeight(x, z, mapDef) + 0.2;
  const geo = new THREE.RingGeometry(radius * 0.85, radius, 48);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: isBarrage ? 0xff4422 : 0xffaa44,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  scene.add(mesh);

  active.push({
    type: 'warning',
    mesh,
    material: mat,
    geometries: [geo],
    materials: [mat],
    life: isBarrage ? 1.2 : 2,
    maxLife: 2,
  });
}

export function spawnStrafePlane(scene, mapDef, x, z, dirX, dirZ) {
  const y = sampleTerrainHeight(x, z, mapDef) + 22;
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(4.5, 0.5, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x4a5048, metalness: 0.4, roughness: 0.6 })
  );
  const wing = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.08, 5.5),
    new THREE.MeshStandardMaterial({ color: 0x3d4538, metalness: 0.35, roughness: 0.65 })
  );
  wing.position.y = 0.1;
  group.add(body, wing);
  group.position.set(x, y, z);
  group.rotation.y = Math.atan2(dirX, dirZ);
  scene.add(group);

  const speed = 38;
  active.push({
    type: 'plane',
    group,
    velX: dirX * speed,
    velZ: dirZ * speed,
    baseY: y,
    life: 2.5,
    maxLife: 2.5,
  });
}

export function spawnStrikeImpact(scene, mapDef, x, z, heavy = false) {
  const y = sampleTerrainHeight(x, z, mapDef);
  spawnShellExplosion(scene, { x, y: y + 0.5, z }, heavy ? 'heavy' : 'medium');

  const geo = new THREE.RingGeometry(0.5, heavy ? 3.5 : 2, 16);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x1a1410,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
  });
  const scorch = new THREE.Mesh(geo, mat);
  scorch.position.set(x, y + 0.15, z);
  scene.add(scorch);

  active.push({
    type: 'scorch',
    mesh: scorch,
    material: mat,
    geometries: [geo],
    materials: [mat],
    life: 8,
    maxLife: 8,
  });
}