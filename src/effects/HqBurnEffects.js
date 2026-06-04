import * as THREE from 'three';
import {
  createFlameMaterial,
  createSmokeMaterial,
  createEmberPointsMaterial,
} from './FireTextures.js';

const active = new Map();
const _camPos = new THREE.Vector3();
const _scorchColor = new THREE.Color(0x1a1008);
const _burnColor = new THREE.Color(0x3d1810);

/** 0 = intact, 1 = destroyed — fire/smoke scale with this. */
export function getHqBurnIntensity(hq) {
  if (!hq || hq.maxHp <= 0) return 0;
  if (hq.dead) return 1;
  const lost = 1 - hq.hp / hq.maxHp;
  return Math.min(1, lost * 1.15);
}

function disposeBurn(fx) {
  if (!fx) return;
  if (fx.light?.parent) fx.light.parent.remove(fx.light);
  if (fx.group?.parent) fx.group.parent.remove(fx.group);
  fx.geometries?.forEach((g) => g.dispose());
  fx.materials?.forEach((m) => m.dispose());
}

export function clearHqBurnEffects() {
  for (const fx of active.values()) disposeBurn(fx);
  active.clear();
}

export function removeHqBurn(hq) {
  const fx = active.get(hq);
  if (fx) {
    disposeBurn(fx);
    active.delete(hq);
  }
  hq.burnFx = null;
}

function createBurnGroup() {
  const group = new THREE.Group();
  group.name = 'hqBurn';
  const geos = [];
  const mats = [];
  const flames = [];
  const smoke = [];

  for (let i = 0; i < 8; i++) {
    const geo = new THREE.PlaneGeometry(1.35, 2.35);
    const mat = createFlameMaterial(i);
    mat.opacity = 0;
    const flame = new THREE.Mesh(geo, mat);
    flame.position.set(
      (i % 4) * 1.6 - 2.4,
      1.2 + (i % 3) * 0.8,
      Math.floor(i / 4) * 2.2 - 1.1
    );
    flame.userData.baseY = flame.position.y;
    flame.userData.wobble = i * 0.7;
    flame.userData.slot = i;
    group.add(flame);
    flames.push(flame);
    geos.push(geo);
    mats.push(mat);
  }

  for (let i = 0; i < 4; i++) {
    const smokeGeo = new THREE.PlaneGeometry(2.4 + i * 0.5, 2.4 + i * 0.5);
    const smokeMat = createSmokeMaterial(i < 2);
    smokeMat.opacity = 0;
    const puff = new THREE.Mesh(smokeGeo, smokeMat);
    puff.position.set((i - 1.5) * 1.1, 3.2 + i * 0.7, (i % 2) * 1.4 - 0.7);
    puff.userData.baseScale = puff.scale.clone();
    group.add(puff);
    smoke.push(puff);
    geos.push(smokeGeo);
    mats.push(smokeMat);
  }

  const emberGeo = new THREE.BufferGeometry();
  const n = 18;
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 4;
    positions[i * 3 + 1] = 1 + Math.random() * 2.5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 4;
  }
  emberGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const emberMat = createEmberPointsMaterial();
  emberMat.opacity = 0;
  const embers = new THREE.Points(emberGeo, emberMat);
  group.add(embers);
  geos.push(emberGeo);
  mats.push(emberMat);

  const light = new THREE.PointLight(0xff6622, 0, 22, 1.8);
  light.position.set(0, 2.2, 0);
  group.add(light);

  return { group, flames, smoke, embers, emberGeo, emberMat, light, geos, mats, phase: 0 };
}

function addImpactMark(hq) {
  if (!hq._wallMeshes?.length) return;
  if (!hq._impactMarks) hq._impactMarks = [];
  if (hq._impactMarks.length >= 20) return;

  const wall = hq._wallMeshes[Math.floor(Math.random() * hq._wallMeshes.length)];
  const isBase = wall === hq._wallMeshes[0];
  const holeMat = new THREE.MeshBasicMaterial({
    color: 0x050403,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  const hole = new THREE.Mesh(
    new THREE.CircleGeometry(0.22 + Math.random() * 0.38, 10),
    holeMat
  );
  hole.position.set(
    (Math.random() - 0.5) * (isBase ? 6.5 : 5),
    (Math.random() - 0.5) * (isBase ? 1.6 : 1.2),
    isBase ? 4.06 : 3.06
  );
  hole.rotation.y = (Math.random() - 0.5) * 0.5;
  wall.add(hole);
  hq._impactMarks.push(hole);

  const scorch = new THREE.Mesh(
    new THREE.CircleGeometry(0.5 + Math.random() * 0.45, 12),
    new THREE.MeshBasicMaterial({
      color: 0x0a0806,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    })
  );
  scorch.position.copy(hole.position);
  scorch.position.z -= 0.02;
  scorch.rotation.copy(hole.rotation);
  wall.add(scorch);
  hq._impactMarks.push(scorch);
}

function applyHqStructureDamage(hq) {
  if (!hq.mesh || hq._structureStage >= 3) return;
  const ratio = hq.hp / hq.maxHp;
  const stage =
    ratio <= 0.25 ? 3 : ratio <= 0.5 ? 2 : ratio <= 0.72 ? 1 : 0;
  if (stage <= hq._structureStage) return;
  hq._structureStage = stage;

  if (stage >= 1 && hq._flagMesh) {
    hq._flagMesh.material.emissiveIntensity = 0.05;
    hq._flagMesh.rotation.z = 0.35;
  }
  if (stage >= 2 && hq._roofMesh) {
    hq._roofMesh.rotation.x += 0.12;
    hq._roofMesh.rotation.z += 0.08;
  }
  if (stage >= 3) {
    if (hq._flagMesh) hq._flagMesh.visible = false;
    if (hq._roofMesh) {
      hq._roofMesh.rotation.x += 0.22;
      hq._roofMesh.position.y -= 0.35;
    }
    for (const bag of hq._bagMeshes ?? []) {
      bag.rotation.z += (Math.random() - 0.5) * 0.4;
      bag.position.y -= 0.08;
    }
  }
}

/** Create or refresh HQ fire from current HP. */
export function syncHqBurn(hq) {
  if (!hq?.mesh) return;
  const intensity = getHqBurnIntensity(hq);
  hq._burnIntensity = intensity;

  if (intensity <= 0.02) {
    removeHqBurn(hq);
    return;
  }

  let fx = active.get(hq);
  if (!fx) {
    fx = createBurnGroup();
    hq.mesh.add(fx.group);
    fx.group.position.set(0, 0, 0);
    active.set(hq, fx);
    hq.burnFx = fx;
  }
  fx.targetIntensity = intensity;
}

export function applyHqDamageLook(hq) {
  if (!hq._wallMeshes?.length) return;
  const t = hq.dead ? 1 : getHqBurnIntensity(hq);

  for (const mesh of hq._wallMeshes) {
    const mat = mesh.material;
    if (!mat?.color || !mesh.userData.baseColor) continue;
    mat.color.copy(mesh.userData.baseColor).lerp(_scorchColor, t * 0.82);
    mat.emissive.copy(_burnColor).multiplyScalar(t * (hq.dead ? 0.55 : 0.42));
    mat.emissiveIntensity = t * (hq.dead ? 0.65 : 0.5);
    mat.roughness = 0.82 + t * 0.12;
  }

  for (const bag of hq._bagMeshes ?? []) {
    const mat = bag.material;
    if (!mat?.color || !bag.userData.baseColor) continue;
    mat.color.copy(bag.userData.baseColor).lerp(_scorchColor, t * 0.7);
  }

  const roof = hq._roofMesh;
  if (roof?.material && roof.userData.baseColor) {
    roof.material.color.copy(roof.userData.baseColor).lerp(_scorchColor, t * 0.65);
    if (roof.material.emissive) {
      roof.material.emissive.copy(_burnColor).multiplyScalar(t * 0.25);
      roof.material.emissiveIntensity = t * 0.35;
    }
  }

  applyHqStructureDamage(hq);
}

export function refreshHqDamageVisuals(hq, damageAmount = 0) {
  if (!hq?.mesh) return;
  if (damageAmount > 0) {
    const marksWanted = Math.min(20, Math.floor((1 - hq.hp / hq.maxHp) * 24) + 1);
    let added = 0;
    while ((hq._impactMarks?.length ?? 0) < marksWanted * 2 && added < 2) {
      addImpactMark(hq);
      added++;
    }
  }
  syncHqBurn(hq);
  applyHqDamageLook(hq);
}

export function updateHqBurnEffects(dt, camera, hqs = []) {
  if (camera?.position) _camPos.copy(camera.position);

  for (const hq of hqs) {
    if (!hq.dead) {
      const intensity = getHqBurnIntensity(hq);
      if (intensity > 0.02 && !active.has(hq)) syncHqBurn(hq);
    }
  }

  for (const [hq, fx] of active) {
    if (!hq.mesh?.parent) {
      disposeBurn(fx);
      active.delete(hq);
      continue;
    }

    fx.phase += dt * (3.5 + (fx.targetIntensity ?? 0) * 2);
    const target = fx.targetIntensity ?? getHqBurnIntensity(hq);
    fx.displayIntensity = THREE.MathUtils.lerp(fx.displayIntensity ?? 0, target, 1 - Math.exp(-6 * dt));
    const i = fx.displayIntensity;

    let flameIdx = 0;
    for (const child of fx.flames) {
      const slotOn = flameIdx < Math.max(1, Math.ceil(i * fx.flames.length));
      const slotI = slotOn ? i * (0.65 + (flameIdx % 3) * 0.12) : 0;
      child.visible = slotOn;
      if (slotOn) {
        child.material.opacity = slotI * (0.5 + Math.sin(fx.phase + child.userData.wobble) * 0.32);
        child.position.y = child.userData.baseY + Math.sin(fx.phase * 1.3 + flameIdx) * 0.2 * i;
        child.scale.set(
          0.5 + slotI * 0.9 + Math.sin(fx.phase * 1.2 + flameIdx) * 0.15,
          0.6 + slotI * 1.1,
          1
        );
        if (camera) child.lookAt(_camPos);
      }
      flameIdx++;
    }

    for (let s = 0; s < fx.smoke.length; s++) {
      const puff = fx.smoke[s];
      const on = i > 0.12 && s < Math.max(1, Math.ceil(i * fx.smoke.length));
      puff.visible = on;
      if (on) {
        const si = i * (0.5 + s * 0.12);
        puff.material.opacity = si * (0.48 + Math.sin(fx.phase * 0.8 + s) * 0.12);
        puff.position.y += dt * (0.35 + si * 0.5);
        const bs = puff.userData.baseScale;
        puff.scale.set(bs.x * (1 + si * 0.55), bs.y * (1 + si * 0.55), 1);
        if (camera) puff.lookAt(_camPos);
        if (puff.position.y > 6 + s) puff.position.y = 3 + s * 0.7;
      }
    }

    if (fx.emberMat) {
      fx.emberMat.opacity = i * (0.55 + Math.sin(fx.phase * 2) * 0.2);
      if (fx.emberGeo && i > 0.08) {
        const pos = fx.emberGeo.attributes.position;
        for (let p = 0; p < pos.count; p++) {
          pos.setY(p, pos.getY(p) + dt * (0.8 + i * 1.2));
          if (pos.getY(p) > 5.5) {
            pos.setXYZ(p, (Math.random() - 0.5) * 4, 1 + Math.random(), (Math.random() - 0.5) * 4);
          }
        }
        pos.needsUpdate = true;
      }
    }

    if (fx.light) {
      fx.light.intensity = i * (2.2 + Math.sin(fx.phase * 3) * 0.7 + (hq.dead ? 1.4 : 0));
      if (hq.dead) fx.light.intensity = Math.max(fx.light.intensity, 3);
    }

    if (hq.dead) {
      fx.targetIntensity = 1;
      fx.displayIntensity = Math.min(1, (fx.displayIntensity ?? 0) + dt * 0.35);
    }
  }
}