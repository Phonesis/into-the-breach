import * as THREE from 'three';
import {
  createFlameMaterial,
  createSmokeMaterial,
  createEmberPointsMaterial,
} from './FireTextures.js';

const active = [];
const MAX_WRECK_FIRES = 14;
const _camPos = new THREE.Vector3();

function disposeWreck(fx) {
  if (fx.light?.parent) fx.light.parent.remove(fx.light);
  if (fx.group?.parent) fx.group.parent.remove(fx.group);
  fx.geometries?.forEach((g) => g.dispose());
  fx.materials?.forEach((m) => m.dispose());
}

export function clearWreckEffects() {
  while (active.length) disposeWreck(active.shift());
}

export function spawnTankWreckFire(scene, position, wreckMesh = null) {
  const group = new THREE.Group();
  const y = position.y ?? 0;
  group.position.set(position.x, y, position.z);
  if (wreckMesh) {
    group.rotation.copy(wreckMesh.rotation);
  }

  const geos = [];
  const mats = [];
  const flames = [];

  for (let i = 0; i < 7; i++) {
    const geo = new THREE.PlaneGeometry(1.5 + Math.random() * 1.1, 2.5 + Math.random() * 1.6);
    const mat = createFlameMaterial(i);
    mat.depthTest = false;
    mat.opacity = 0.88;
    const flame = new THREE.Mesh(geo, mat);
    flame.position.set(
      (Math.random() - 0.5) * 2.2,
      0.6 + Math.random() * 1.1,
      (Math.random() - 0.5) * 2.4
    );
    flame.rotation.y = Math.random() * Math.PI;
    flame.userData.baseY = flame.position.y;
    flame.userData.wobble = Math.random() * Math.PI * 2;
    group.add(flame);
    flames.push(flame);
    geos.push(geo);
    mats.push(mat);
  }

  for (let i = 0; i < 3; i++) {
    const smokeGeo = new THREE.PlaneGeometry(2.8 + i * 0.6, 2.8 + i * 0.6);
    const smokeMat = createSmokeMaterial(i === 0);
    smokeMat.depthTest = false;
    smokeMat.opacity = 0.55 - i * 0.1;
    const smoke = new THREE.Mesh(smokeGeo, smokeMat);
    smoke.position.set((Math.random() - 0.5) * 1.2, 2 + i * 0.9, (Math.random() - 0.5) * 1.2);
    smoke.userData.isSmoke = true;
    smoke.scale.set(1.2 + i * 0.3, 1.2 + i * 0.3, 1);
    group.add(smoke);
    geos.push(smokeGeo);
    mats.push(smokeMat);
    flames.push(smoke);
  }

  const emberGeo = new THREE.BufferGeometry();
  const emberCount = 24;
  const positions = new Float32Array(emberCount * 3);
  for (let i = 0; i < emberCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 2.5;
    positions[i * 3 + 1] = 0.5 + Math.random() * 2;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 2.5;
  }
  emberGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const emberMat = createEmberPointsMaterial();
  emberMat.depthTest = false;
  emberMat.opacity = 0.9;
  const embers = new THREE.Points(emberGeo, emberMat);
  group.add(embers);
  geos.push(emberGeo);
  mats.push(emberMat);

  const light = new THREE.PointLight(0xff6622, 2.8, 14, 1.6);
  light.position.set(0, 1.4, 0);
  light.castShadow = false;
  group.add(light);

  scene.add(group);

  const fx = {
    group,
    flames,
    embers,
    emberGeo,
    emberMat,
    light,
    geos,
    mats,
    life: 30,
    maxLife: 30,
    phase: 0,
    wreckMesh,
  };
  active.push(fx);
  while (active.length > MAX_WRECK_FIRES) {
    disposeWreck(active.shift());
  }
  return fx;
}

export function updateWreckEffects(dt, camera = null) {
  if (camera?.position) _camPos.copy(camera.position);

  for (let i = active.length - 1; i >= 0; i--) {
    const fx = active[i];
    fx.life -= dt;
    fx.phase += dt * 4.5;

    if (fx.wreckMesh?.parent) {
      fx.group.position.copy(fx.wreckMesh.position);
      fx.group.rotation.copy(fx.wreckMesh.rotation);
    }

    let flameIdx = 0;
    for (const child of fx.flames) {
      if (!child.material) continue;
      if (child.userData.isSmoke) {
        child.scale.multiplyScalar(1 + dt * 0.22);
        child.material.opacity = Math.max(0, child.material.opacity - dt * 0.06);
        child.position.y += dt * 0.65;
        if (camera) child.lookAt(_camPos);
      } else {
        child.material.opacity = 0.55 + Math.sin(fx.phase + child.userData.wobble) * 0.3;
        child.position.y = child.userData.baseY + Math.sin(fx.phase * 1.2 + flameIdx) * 0.15;
        child.scale.x = 1 + Math.sin(fx.phase * 1.4 + flameIdx) * 0.2;
        child.scale.y = 1 + Math.cos(fx.phase * 1.1) * 0.15;
        if (camera) child.lookAt(_camPos);
        flameIdx++;
      }
    }

    if (fx.emberGeo) {
      const pos = fx.emberGeo.attributes.position;
      for (let p = 0; p < pos.count; p++) {
        pos.setY(p, pos.getY(p) + dt * (1.2 + Math.sin(fx.phase + p) * 0.4));
        if (pos.getY(p) > 4.5) {
          pos.setXYZ(p, (Math.random() - 0.5) * 2.5, 0.4 + Math.random() * 0.5, (Math.random() - 0.5) * 2.5);
        }
      }
      pos.needsUpdate = true;
      fx.emberMat.opacity = 0.5 + Math.sin(fx.phase * 2) * 0.35;
    }

    if (fx.light) {
      fx.light.intensity = 2.2 + Math.sin(fx.phase * 3) * 0.9;
      const fade = Math.min(1, fx.life / 8);
      fx.light.intensity *= fade;
    }

    if (fx.life <= 0) {
      disposeWreck(fx);
      active.splice(i, 1);
    }
  }
}

export function removeWreckEffect(fx) {
  const i = active.indexOf(fx);
  if (i >= 0) {
    disposeWreck(fx);
    active.splice(i, 1);
  } else if (fx) {
    disposeWreck(fx);
  }
}