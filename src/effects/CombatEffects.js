import * as THREE from 'three';

const MAX_EFFECTS = 64;
const active = [];
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _shotDir = new THREE.Vector3();

/** Small-arms tracers only — short fixed-length streak (meters), not full shot path. */
const TRACER_PROFILES = {
  infantry: {
    headColor: 0xfff8c0,
    trailColor: 0xffdd44,
    glowColor: 0xff5500,
    headSize: 0.38,
    trailRadius: 0.055,
    glowRadius: 0.09,
    trailLength: 1.0,
    minTravel: 0.06,
    speed: 140,
    trailOpacity: 0.95,
    glowOpacity: 0.45,
    linger: 0.04,
  },
  machineGun: {
    headColor: 0xffff99,
    trailColor: 0xffbb22,
    glowColor: 0xff3300,
    headSize: 0.34,
    trailRadius: 0.05,
    glowRadius: 0.085,
    trailLength: 1.25,
    minTravel: 0.05,
    speed: 160,
    trailOpacity: 0.95,
    glowOpacity: 0.5,
    linger: 0.035,
  },
  armoredCar: {
    headColor: 0xffff99,
    trailColor: 0xffbb22,
    glowColor: 0xff3300,
    headSize: 0.34,
    trailRadius: 0.05,
    glowRadius: 0.085,
    trailLength: 1.2,
    minTravel: 0.05,
    speed: 165,
    trailOpacity: 0.95,
    glowOpacity: 0.48,
    linger: 0.035,
  },
  sniper: {
    headColor: 0xfff0b0,
    trailColor: 0xffcc55,
    glowColor: 0xff6600,
    headSize: 0.42,
    trailRadius: 0.045,
    glowRadius: 0.1,
    trailLength: 1.6,
    minTravel: 0.08,
    speed: 220,
    trailOpacity: 0.98,
    glowOpacity: 0.55,
    linger: 0.05,
  },
  paratrooperAt: {
    headColor: 0xffcc66,
    trailColor: 0xff7722,
    glowColor: 0xff4400,
    headSize: 0.62,
    trailRadius: 0.11,
    glowRadius: 0.17,
    trailLength: 2.4,
    minTravel: 0.14,
    speed: 52,
    trailOpacity: 0.9,
    glowOpacity: 0.52,
    linger: 0.1,
  },
};

const SMALL_ARMS_TRACERS = new Set(['infantry', 'machineGun', 'armoredCar', 'sniper', 'paratrooperAt']);
const activeAtRecoil = [];

const flashTextures = new Map();
const tracerHeadTextures = new Map();

function getFlashTexture(color) {
  const key = color;
  if (flashTextures.has(key)) return flashTextures.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.25, `rgb(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255})`);
  g.addColorStop(0.55, 'rgba(255,120,40,0.45)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(canvas);
  flashTextures.set(key, tex);
  return tex;
}

function getTracerHeadTexture(color) {
  if (tracerHeadTextures.has(color)) return tracerHeadTextures.get(color);
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, `rgb(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 16);
  const tex = new THREE.CanvasTexture(canvas);
  tracerHeadTextures.set(color, tex);
  return tex;
}

function toVec3(v) {
  if (v?.isVector3) return v;
  return new THREE.Vector3(v.x, v.y ?? 0, v.z);
}

function canSpawnEffect(slots = 1) {
  return active.length + slots <= MAX_EFFECTS;
}

function registerEffect(effect) {
  active.push(effect);
  while (active.length > MAX_EFFECTS) {
    disposeEffect(active.shift());
  }
}

function disposeEffect(effect) {
  if (!effect) return;
  if (effect.mesh?.parent) effect.mesh.parent.remove(effect.mesh);
  if (effect.group?.parent) effect.group.parent.remove(effect.group);
  if (effect.head?.parent) effect.head.parent.remove(effect.head);
  if (effect.trailMesh?.parent) effect.trailMesh.parent.remove(effect.trailMesh);
  if (effect.glowMesh?.parent) effect.glowMesh.parent.remove(effect.glowMesh);
  if (effect.light?.parent) effect.light.parent.remove(effect.light);
  effect.geometries?.forEach((g) => g.dispose());
  effect.materials?.forEach((m) => m.dispose());
}

export function clearCombatEffects() {
  while (active.length) disposeEffect(active.shift());
  activeAtRecoil.length = 0;
}

export function triggerParatrooperAtRecoil(unitMesh) {
  if (!unitMesh) return;
  const lead = unitMesh.children.find((c) => c.userData?.squadIndex === 0);
  const launcher = lead?.userData?.atLauncher;
  if (!launcher?.tube) return;
  activeAtRecoil.push({
    tube: launcher.tube,
    warhead: launcher.warhead,
    t: 0,
    duration: 0.34,
    kick: 0.16,
  });
}

function updateParatrooperAtRecoil(dt) {
  for (let i = activeAtRecoil.length - 1; i >= 0; i--) {
    const r = activeAtRecoil[i];
    r.t += dt;
    const p = Math.min(1, r.t / r.duration);
    const kick = r.kick * Math.sin(p * Math.PI);
    const tube = r.tube;
    const warhead = r.warhead;
    if (tube.userData._baseX === undefined) {
      tube.userData._baseX = tube.position.x;
      tube.userData._baseY = tube.position.y;
      tube.userData._baseZ = tube.position.z;
      tube.userData._baseRotY = tube.rotation.y;
      if (warhead) {
        warhead.userData._baseX = warhead.position.x;
        warhead.userData._baseY = warhead.position.y;
        warhead.userData._baseZ = warhead.position.z;
        warhead.visible = true;
      }
    }
    tube.position.x = tube.userData._baseX - kick;
    tube.position.y = tube.userData._baseY + kick * 0.15;
    tube.rotation.y = tube.userData._baseRotY + kick * 0.35;
    if (warhead) {
      if (p < 0.22) warhead.visible = false;
      else {
        warhead.visible = true;
        warhead.position.x = warhead.userData._baseX - kick * 0.35;
        warhead.position.y = warhead.userData._baseY + kick * 0.1;
        warhead.position.z = warhead.userData._baseZ;
      }
    }
    if (r.t >= r.duration) {
      tube.position.x = tube.userData._baseX;
      tube.position.y = tube.userData._baseY;
      tube.position.z = tube.userData._baseZ;
      tube.rotation.y = tube.userData._baseRotY;
      if (warhead) {
        warhead.visible = true;
        warhead.position.x = warhead.userData._baseX;
        warhead.position.y = warhead.userData._baseY;
        warhead.position.z = warhead.userData._baseZ;
      }
      activeAtRecoil.splice(i, 1);
    }
  }
}

function orientTracerStripe(mesh, from, to, radius) {
  _dir.subVectors(to, from);
  const len = _dir.length();
  if (len < 0.05) {
    mesh.visible = false;
    return;
  }
  _dir.normalize();
  _mid.copy(from).addScaledVector(_dir, len * 0.5);
  mesh.position.copy(_mid);
  mesh.scale.set(radius, len, radius);
  _quat.setFromUnitVectors(_up, _dir);
  mesh.quaternion.copy(_quat);
  mesh.visible = true;
}

function makeTracerStripeMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
}

function placeShortTracerStripe(fx, headT) {
  _shotDir.subVectors(fx._to, fx._from);
  const shotLen = _shotDir.length();
  if (shotLen < 0.05) {
    fx.trailMesh.visible = false;
    fx.glowMesh.visible = false;
    return;
  }
  _shotDir.multiplyScalar(1 / shotLen);

  fx._headPos.lerpVectors(fx._from, fx._to, headT);
  fx._tailPos.copy(fx._headPos).addScaledVector(_shotDir, -fx.trailLength);
  const traveled = fx._headPos.distanceTo(fx._from);
  if (fx._tailPos.distanceTo(fx._headPos) > traveled) {
    fx._tailPos.copy(fx._from);
  }
  fx._glowTailPos.lerpVectors(fx._tailPos, fx._headPos, 0.4);

  fx.head.position.copy(fx._headPos);
  orientTracerStripe(fx.trailMesh, fx._tailPos, fx._headPos, fx.trailRadius);
  orientTracerStripe(fx.glowMesh, fx._glowTailPos, fx._headPos, fx.glowRadius);
}

function updateTracerBullet(fx, dt) {
  if (fx.phase === 'travel') {
    fx.travelT = Math.min(1, fx.travelT + dt / fx.travelDuration);
    placeShortTracerStripe(fx, fx.travelT);

    fx.headMat.opacity = 1;
    fx.trailMat.opacity = fx.trailOpacity;
    fx.glowMat.opacity = fx.glowOpacity;

    if (fx.travelT >= 1) {
      fx.phase = 'linger';
      fx.life = fx.linger;
      fx.maxLife = fx.linger;
    }
    return;
  }

  fx.life -= dt;
  placeShortTracerStripe(fx, 1);
  const fade = Math.max(0, fx.life / fx.linger);
  fx.headMat.opacity = fade;
  fx.trailMat.opacity = fade * fx.trailOpacity;
  fx.glowMat.opacity = fade * fx.glowOpacity;
}

/** Call once per frame from the game loop. */
export function updateCombatEffects(dt) {
  updateParatrooperAtRecoil(dt);
  for (let i = active.length - 1; i >= 0; i--) {
    const fx = active[i];

    if (fx.type === 'tracerBullet') {
      updateTracerBullet(fx, dt);
      if (fx.life <= 0) {
        disposeEffect(fx);
        active.splice(i, 1);
      }
      continue;
    }

    fx.life -= dt;

    if (fx.type === 'smoke') {
      fx.mesh.scale.multiplyScalar(1 + dt * 2.5);
      fx.material.opacity = Math.max(0, fx.material.opacity - dt * 1.8);
      fx.mesh.position.y += dt * 0.8;
    } else if (fx.type === 'tankMuzzle') {
      const t = 1 - fx.life / fx.maxLife;
      // Fire core expands then fades fast
      if (fx.core) {
        const s = (2.4 + t * 2.8) * (fx.scale ?? 1);
        fx.core.scale.set(s, s, 1);
        fx.core.material.opacity = Math.max(0, 1 - t * 2.4);
      }
      if (fx.fire) {
        const s = (3.6 + t * 3.5) * (fx.scale ?? 1);
        fx.fire.scale.set(s, s, 1);
        fx.fire.material.opacity = Math.max(0, 0.95 - t * 2.1);
      }
      for (const jet of fx.jetSprites ?? []) {
        jet.scale.multiplyScalar(1 + dt * 4.5);
        jet.material.opacity = Math.max(0, jet.material.opacity - dt * 4.2);
      }
      if (fx.light) {
        fx.light.intensity = Math.max(0, fx.light.intensity * (1 - dt * 5.5));
      }
      for (const puff of fx.smokePuffs ?? []) {
        puff.mesh.position.x += puff.vx * dt;
        puff.mesh.position.y += puff.vy * dt;
        puff.mesh.position.z += puff.vz * dt;
        puff.mesh.scale.multiplyScalar(1 + dt * 2.8);
        puff.mat.opacity = Math.max(0, puff.mat.opacity - dt * 0.85);
        // Slow horizontal drift as cloud rises
        puff.vx *= 1 - dt * 0.6;
        puff.vz *= 1 - dt * 0.6;
      }
    } else if (fx.type === 'explosion' || fx.type === 'shellExplosion') {
      const grow = fx.type === 'shellExplosion' ? 2.4 : 1.2;
      fx.group.scale.multiplyScalar(1 + dt * grow);
      if (fx.light) fx.light.intensity *= 1 - dt * (fx.type === 'shellExplosion' ? 1.8 : 2.5);
      if (fx.flashMat) fx.flashMat.opacity = Math.max(0, fx.flashMat.opacity - dt * 2.2);
      for (const puff of fx.smokePuffs ?? []) {
        puff.mesh.scale.multiplyScalar(1 + dt * 3.2);
        puff.mat.opacity = Math.max(0, puff.mat.opacity - dt * 1.1);
        puff.mesh.position.y += dt * (fx.tier === 'heavy' ? 2.8 : 2.1);
      }
      fx.group.children.forEach((c) => {
        if (c.material && c !== fx.flashSprite) {
          c.position.y += dt * (fx.tier === 'heavy' ? 1.6 : 1.1);
          c.material.opacity = Math.max(0, c.material.opacity - dt * (fx.type === 'shellExplosion' ? 1.05 : 1.4));
        }
      });
    } else if (fx.type === 'flash') {
      fx.material.opacity = Math.max(0, fx.life / fx.maxLife);
    }

    if (fx.life <= 0) {
      disposeEffect(fx);
      active.splice(i, 1);
    }
  }
}

const CANNON_MUZZLE_TYPES = new Set(['tank', 'superHeavyTank', 'antiTankGun', 'artillery']);

function isCannonMuzzle(weaponType) {
  return CANNON_MUZZLE_TYPES.has(weaponType);
}

/**
 * Big muzzle fire + smoke for tank / super-heavy / AT gun main guns.
 * Directional fire jet along the shot axis + expanding smoke cloud.
 */
function spawnTankMuzzleBlast(scene, pos, toV, weaponType) {
  if (!canSpawnEffect(6)) return;

  const heavy = weaponType === 'superHeavyTank' || weaponType === 'artillery';
  const scale = heavy ? 1.45 : weaponType === 'antiTankGun' ? 0.85 : 1.1;

  _shotDir.set(toV.x - pos.x, (toV.y ?? pos.y) - pos.y, toV.z - pos.z);
  if (_shotDir.lengthSq() < 0.01) _shotDir.set(0, 0, 1);
  else _shotDir.normalize();

  const group = new THREE.Group();
  group.position.copy(pos);
  scene.add(group);

  const geos = [];
  const mats = [];

  // Core white-hot flash
  const coreMat = new THREE.SpriteMaterial({
    map: getFlashTexture(0xfff0c0),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    opacity: 1,
  });
  const core = new THREE.Sprite(coreMat);
  const coreSize = 2.4 * scale;
  core.scale.set(coreSize, coreSize, 1);
  core.renderOrder = 15;
  group.add(core);
  mats.push(coreMat);

  // Outer orange fire ball
  const fireMat = new THREE.SpriteMaterial({
    map: getFlashTexture(0xff6622),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    opacity: 0.95,
  });
  const fire = new THREE.Sprite(fireMat);
  const fireSize = 3.6 * scale;
  fire.scale.set(fireSize, fireSize, 1);
  fire.position.copy(_shotDir).multiplyScalar(0.35 * scale);
  fire.renderOrder = 14;
  group.add(fire);
  mats.push(fireMat);

  // Directional fire jet along barrel (short cones as sprites stacked forward)
  const jetSprites = [];
  for (let i = 0; i < 3; i++) {
    const jetMat = new THREE.SpriteMaterial({
      map: getFlashTexture(i === 0 ? 0xffaa44 : 0xff5500),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      opacity: 0.9 - i * 0.2,
    });
    const jet = new THREE.Sprite(jetMat);
    const s = (1.8 - i * 0.35) * scale;
    jet.scale.set(s, s * 0.85, 1);
    jet.position.copy(_shotDir).multiplyScalar((0.55 + i * 0.55) * scale);
    jet.renderOrder = 14;
    group.add(jet);
    mats.push(jetMat);
    jetSprites.push(jet);
  }

  // Brief dynamic light at the muzzle
  const light = new THREE.PointLight(0xff8833, heavy ? 10 : 7, heavy ? 18 : 14, 1.6);
  light.position.set(0, 0.2, 0);
  group.add(light);

  // Smoke puffs billowing from muzzle (grey + dark)
  const smokePuffs = [];
  const puffCount = heavy ? 5 : 4;
  for (let i = 0; i < puffCount; i++) {
    const sGeo = new THREE.SphereGeometry((0.35 + Math.random() * 0.35) * scale, 6, 6);
    const sMat = new THREE.MeshBasicMaterial({
      color: i % 2 ? 0x666666 : 0x3a3a38,
      transparent: true,
      opacity: 0.48 + Math.random() * 0.12,
      depthWrite: false,
    });
    const puff = new THREE.Mesh(sGeo, sMat);
    const side = new THREE.Vector3(
      (Math.random() - 0.5) * 0.8,
      0.15 + Math.random() * 0.45,
      (Math.random() - 0.5) * 0.8
    );
    // Drift mostly forward + up from the barrel
    puff.position
      .copy(_shotDir)
      .multiplyScalar((0.4 + i * 0.35) * scale)
      .add(side);
    group.add(puff);
    geos.push(sGeo);
    mats.push(sMat);
    smokePuffs.push({
      mesh: puff,
      mat: sMat,
      vx: _shotDir.x * (0.8 + Math.random() * 1.2) + (Math.random() - 0.5) * 0.6,
      vy: 1.1 + Math.random() * 1.4,
      vz: _shotDir.z * (0.8 + Math.random() * 1.2) + (Math.random() - 0.5) * 0.6,
    });
  }

  // Extra free-floating smoke slightly behind/up for lingering cloud
  for (let i = 0; i < 2; i++) {
    const delayed = pos.clone().addScaledVector(_shotDir, 0.2 * scale);
    delayed.y += 0.15;
    spawnSmokePuff(scene, delayed, (0.7 + i * 0.25) * scale);
  }

  const life = heavy ? 0.55 : 0.42;
  registerEffect({
    type: 'tankMuzzle',
    group,
    light,
    core,
    fire,
    jetSprites,
    smokePuffs,
    geometries: geos,
    materials: mats,
    life,
    maxLife: life,
    scale,
  });
}

export function spawnMuzzleFlash(scene, from, to, weaponType = 'rifle', opts = {}) {
  if (!scene) return;

  const fromV = toVec3(from);
  const toV = toVec3(to);
  const pos = fromV.clone();
  if (!opts.exactOrigin) {
    pos.y +=
      weaponType === 'artillery'
        ? 1.4
        : weaponType === 'tank' || weaponType === 'superHeavyTank'
          ? 1.25
          : weaponType === 'antiTankGun'
            ? 1.05
            : weaponType === 'paratrooperAt'
              ? 1.05
              : weaponType === 'mortar'
                ? 0.9
                : 0.85;
  }

  if (SMALL_ARMS_TRACERS.has(weaponType)) {
    spawnBulletTracer(scene, pos, toV, weaponType);
  }

  // Tank / super heavy / AT / artillery — dedicated fire + smoke blast
  if (isCannonMuzzle(weaponType)) {
    spawnTankMuzzleBlast(scene, pos, toV, weaponType);
    return;
  }

  if (!canSpawnEffect()) return;

  const flashColor =
    weaponType === 'mortar'
      ? 0xff6622
      : weaponType === 'paratrooperAt'
        ? 0xff8833
        : weaponType === 'machineGun'
          ? 0xffcc66
          : 0xffdd88;

  const flashSize =
    weaponType === 'mortar'
      ? 0.5
      : weaponType === 'paratrooperAt'
        ? 0.9
        : weaponType === 'machineGun'
          ? 0.32
          : 0.22;

  const mat = new THREE.SpriteMaterial({
    map: getFlashTexture(flashColor),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    opacity: 1,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(flashSize * 2, flashSize * 2, 1);
  sprite.position.copy(pos);
  sprite.renderOrder = 13;
  scene.add(sprite);

  registerEffect({
    type: 'flash',
    mesh: sprite,
    material: mat,
    materials: [mat],
    life: weaponType === 'mortar' ? 0.14 : weaponType === 'paratrooperAt' ? 0.12 : 0.07,
    maxLife: 0.14,
  });

  if (weaponType === 'paratrooperAt') {
    spawnSmokePuff(scene, pos, 0.55);
    const backblast = pos.clone();
    backblast.x -= (toV.x - fromV.x) * 0.04;
    backblast.z -= (toV.z - fromV.z) * 0.04;
    spawnSmokePuff(scene, backblast, 0.42);
  }
}

function spawnBulletTracer(scene, from, to, weaponType) {
  if (!scene) return;
  const tracerSlots = active.filter((e) => e.type === 'tracerBullet').length;
  if (tracerSlots >= 64 || active.length >= MAX_EFFECTS) return;

  const profile = TRACER_PROFILES[weaponType] ?? TRACER_PROFILES.infantry;
  const fromV = from.clone();
  const toV = to.clone();

  const spread = weaponType === 'machineGun' ? 0.35 : 0.18;
  toV.x += (Math.random() - 0.5) * spread;
  toV.z += (Math.random() - 0.5) * spread;
  toV.y += (Math.random() - 0.5) * 0.08;

  const length = fromV.distanceTo(toV);
  if (length < 0.35) return;

  const travelDuration = Math.min(0.22, Math.max(profile.minTravel, length / profile.speed));

  const headMat = new THREE.SpriteMaterial({
    map: getTracerHeadTexture(profile.headColor),
    color: 0xffffff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    opacity: 1,
  });
  const head = new THREE.Sprite(headMat);
  head.scale.set(profile.headSize, profile.headSize * 0.7, 1);
  head.position.copy(fromV);
  head.renderOrder = 20;
  scene.add(head);

  const trailGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
  const trailMat = makeTracerStripeMaterial(profile.trailColor, profile.trailOpacity);
  const trailMesh = new THREE.Mesh(trailGeo, trailMat);
  trailMesh.frustumCulled = false;
  trailMesh.renderOrder = 19;
  scene.add(trailMesh);

  const glowGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
  const glowMat = makeTracerStripeMaterial(profile.glowColor, profile.glowOpacity);
  const glowMesh = new THREE.Mesh(glowGeo, glowMat);
  glowMesh.frustumCulled = false;
  glowMesh.renderOrder = 18;
  scene.add(glowMesh);

  const totalLife = travelDuration + profile.linger;

  registerEffect({
    type: 'tracerBullet',
    head,
    headMat,
    trailMesh,
    glowMesh,
    trailMat,
    glowMat,
    geometries: [trailGeo, glowGeo],
    materials: [headMat, trailMat, glowMat],
    _from: fromV,
    _to: toV,
    _headPos: new THREE.Vector3(),
    _tailPos: new THREE.Vector3(),
    _glowTailPos: new THREE.Vector3(),
    travelT: 0,
    travelDuration,
    trailLength: profile.trailLength,
    trailRadius: profile.trailRadius,
    glowRadius: profile.glowRadius,
    trailOpacity: profile.trailOpacity,
    glowOpacity: profile.glowOpacity,
    phase: 'travel',
    linger: profile.linger,
    life: totalLife,
    maxLife: totalLife,
  });
}

export function spawnSmokePuff(scene, pos, scale) {
  if (!canSpawnEffect()) return;

  const geo = new THREE.SphereGeometry(0.25 * scale, 6, 6);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x777777,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const puff = new THREE.Mesh(geo, mat);
  puff.position.copy(pos);
  puff.position.y += 0.15;
  scene.add(puff);

  registerEffect({
    type: 'smoke',
    mesh: puff,
    material: mat,
    geometries: [geo],
    materials: [mat],
    life: 0.45,
    maxLife: 0.45,
  });
}

export function spawnExplosion(scene, pos) {
  if (!canSpawnEffect()) return;

  const p = toVec3(pos);
  const group = new THREE.Group();
  group.position.copy(p);

  const geos = [];
  const mats = [];

  for (let i = 0; i < 5; i++) {
    const geo = new THREE.SphereGeometry(0.35 + Math.random() * 0.5, 5, 5);
    const mat = new THREE.MeshBasicMaterial({
      color: i % 2 ? 0xff4400 : 0x444444,
      transparent: true,
      opacity: 0.75,
    });
    const part = new THREE.Mesh(geo, mat);
    part.position.set((Math.random() - 0.5) * 1.6, Math.random(), (Math.random() - 0.5) * 1.6);
    group.add(part);
    geos.push(geo);
    mats.push(mat);
  }

  scene.add(group);

  registerEffect({
    type: 'explosion',
    group,
    geometries: geos,
    materials: mats,
    life: 0.55,
    maxLife: 0.55,
  });
}

/**
 * Large shell burst for artillery / mortars (and barrage strikes).
 * @param {'heavy'|'medium'} tier
 */
export function spawnShellExplosion(scene, pos, tier = 'heavy') {
  if (!canSpawnEffect(4)) return;

  const p = toVec3(pos);
  const group = new THREE.Group();
  group.position.copy(p);

  const geos = [];
  const mats = [];
  const heavy = tier === 'heavy';
  const partCount = heavy ? 14 : 9;
  const spread = heavy ? 3.8 : 2.6;
  const baseSize = heavy ? 0.85 : 0.55;

  for (let i = 0; i < partCount; i++) {
    const geo = new THREE.SphereGeometry(baseSize + Math.random() * (heavy ? 1.4 : 0.9), 6, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: i % 3 === 0 ? 0x1a1a1a : i % 3 === 1 ? 0xff5500 : 0xffaa33,
      transparent: true,
      opacity: heavy ? 0.92 : 0.82,
    });
    const part = new THREE.Mesh(geo, mat);
    part.position.set(
      (Math.random() - 0.5) * spread,
      Math.random() * (heavy ? 1.8 : 1.2),
      (Math.random() - 0.5) * spread
    );
    group.add(part);
    geos.push(geo);
    mats.push(mat);
  }

  const ringGeo = new THREE.RingGeometry(0.4, heavy ? 4.2 : 3, 24);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xff6622,
    transparent: true,
    opacity: heavy ? 0.55 : 0.42,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  group.add(ring);
  geos.push(ringGeo);
  mats.push(ringMat);

  const flashMat = new THREE.SpriteMaterial({
    map: getFlashTexture(heavy ? 0xff7722 : 0xff9944),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    opacity: 1,
  });
  const flashSprite = new THREE.Sprite(flashMat);
  const flashScale = heavy ? 9 : 6.5;
  flashSprite.scale.set(flashScale, flashScale, 1);
  flashSprite.position.y = heavy ? 1.2 : 0.85;
  flashSprite.renderOrder = 14;
  group.add(flashSprite);
  mats.push(flashMat);

  const light = new THREE.PointLight(heavy ? 0xffaa55 : 0xff8844, heavy ? 14 : 9, heavy ? 28 : 20);
  light.position.y = 1.5;
  group.add(light);

  const smokePuffs = [];
  const puffCount = heavy ? 5 : 3;
  for (let i = 0; i < puffCount; i++) {
    const sGeo = new THREE.SphereGeometry((heavy ? 0.9 : 0.65) + Math.random() * 0.5, 6, 6);
    const sMat = new THREE.MeshBasicMaterial({
      color: i % 2 ? 0x555555 : 0x333322,
      transparent: true,
      opacity: heavy ? 0.5 : 0.4,
      depthWrite: false,
    });
    const puff = new THREE.Mesh(sGeo, sMat);
    puff.position.set((Math.random() - 0.5) * 2, 0.2 + Math.random() * 0.6, (Math.random() - 0.5) * 2);
    group.add(puff);
    geos.push(sGeo);
    mats.push(sMat);
    smokePuffs.push({ mesh: puff, mat: sMat });
  }

  scene.add(group);

  const life = heavy ? 1.05 : 0.85;
  registerEffect({
    type: 'shellExplosion',
    tier,
    group,
    light,
    flashSprite,
    flashMat,
    smokePuffs,
    geometries: geos,
    materials: mats,
    life,
    maxLife: life,
  });
}

/** Cheaper burst for rapid fire-support hits — no dynamic light, fewer particles. */
export function spawnShellExplosionLite(scene, pos, tier = 'medium') {
  if (!canSpawnEffect()) return;

  const p = toVec3(pos);
  const group = new THREE.Group();
  group.position.copy(p);

  const geos = [];
  const mats = [];
  const heavy = tier === 'heavy';
  const partCount = heavy ? 6 : 4;
  const spread = heavy ? 2.4 : 1.8;
  const baseSize = heavy ? 0.55 : 0.42;

  for (let i = 0; i < partCount; i++) {
    const geo = new THREE.SphereGeometry(baseSize + Math.random() * 0.45, 5, 5);
    const mat = new THREE.MeshBasicMaterial({
      color: i % 2 ? 0xff5500 : 0x333333,
      transparent: true,
      opacity: heavy ? 0.82 : 0.72,
    });
    const part = new THREE.Mesh(geo, mat);
    part.position.set(
      (Math.random() - 0.5) * spread,
      Math.random() * (heavy ? 1.1 : 0.8),
      (Math.random() - 0.5) * spread
    );
    group.add(part);
    geos.push(geo);
    mats.push(mat);
  }

  const flashMat = new THREE.SpriteMaterial({
    map: getFlashTexture(heavy ? 0xff7722 : 0xff9944),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    opacity: 1,
  });
  const flashSprite = new THREE.Sprite(flashMat);
  const flashScale = heavy ? 5.5 : 4.2;
  flashSprite.scale.set(flashScale, flashScale, 1);
  flashSprite.position.y = heavy ? 0.9 : 0.65;
  flashSprite.renderOrder = 14;
  group.add(flashSprite);
  mats.push(flashMat);

  const smokePuffs = [];
  const puffCount = heavy ? 2 : 1;
  for (let i = 0; i < puffCount; i++) {
    const sGeo = new THREE.SphereGeometry(0.55 + Math.random() * 0.25, 5, 5);
    const sMat = new THREE.MeshBasicMaterial({
      color: 0x444444,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    const puff = new THREE.Mesh(sGeo, sMat);
    puff.position.set((Math.random() - 0.5) * 1.2, 0.15 + Math.random() * 0.35, (Math.random() - 0.5) * 1.2);
    group.add(puff);
    geos.push(sGeo);
    mats.push(sMat);
    smokePuffs.push({ mesh: puff, mat: sMat });
  }

  scene.add(group);

  const life = heavy ? 0.72 : 0.58;
  registerEffect({
    type: 'shellExplosion',
    tier: heavy ? 'heavy' : 'medium',
    group,
    flashSprite,
    flashMat,
    smokePuffs,
    geometries: geos,
    materials: mats,
    life,
    maxLife: life,
  });
}