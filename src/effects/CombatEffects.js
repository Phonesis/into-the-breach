import * as THREE from 'three';
import {
  getEarthSprayTexture,
  getEmberTexture,
  getFlameTexture,
  getSmokeTexture,
} from './FireTextures.js';

const MAX_EFFECTS = 64;
// Leave room for impacts even during dense MG/tracer exchanges. Destruction
// effects are gameplay feedback and must not disappear because routine muzzle
// smoke happened to fill the shared transient pool first.
const EXPLOSION_RESERVED_SLOTS = 8;
const MAX_LAYERED_EXPLOSIONS = 8;
const ROUTINE_EFFECT_LIMIT = MAX_EFFECTS - EXPLOSION_RESERVED_SLOTS;
const EXPLOSION_EVICTABLE_TYPES = new Set([
  'tracerBullet',
  'smoke',
  'flash',
  'armorRicochet',
  'tankMuzzle',
  'collapseDust',
  'smokeShellImpact',
]);
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
  return active.length + slots <= ROUTINE_EFFECT_LIMIT;
}

function disposeActiveAt(index) {
  if (index < 0 || index >= active.length) return;
  disposeEffect(active[index]);
  active.splice(index, 1);
}

/**
 * Guarantee that a visible impact can spawn under combat load. At most eight
 * layered blasts remain alive simultaneously; a newer detonation replaces the
 * oldest fading one instead of stacking enough transparent sprites to hitch.
 */
function reserveLayeredExplosionSlot() {
  let layeredCount = 0;
  let oldestLayeredIndex = -1;
  let oldestElapsed = -1;
  for (let i = 0; i < active.length; i++) {
    const fx = active[i];
    if (fx.type !== 'layeredExplosion') continue;
    layeredCount++;
    if ((fx.elapsed ?? 0) > oldestElapsed) {
      oldestElapsed = fx.elapsed ?? 0;
      oldestLayeredIndex = i;
    }
  }

  if (layeredCount >= MAX_LAYERED_EXPLOSIONS) {
    disposeActiveAt(oldestLayeredIndex);
  }

  while (active.length >= MAX_EFFECTS) {
    const routineIndex = active.findIndex((fx) =>
      EXPLOSION_EVICTABLE_TYPES.has(fx.type)
    );
    if (routineIndex >= 0) {
      disposeActiveAt(routineIndex);
      continue;
    }

    const fadingExplosionIndex = active.findIndex(
      (fx) => fx.type === 'layeredExplosion'
    );
    if (fadingExplosionIndex < 0) return false;
    disposeActiveAt(fadingExplosionIndex);
  }
  return true;
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

function updateExplosionPoints(points, velocities, gravity, dt) {
  if (!points || !velocities?.length) return;
  const position = points.geometry.attributes.position;
  const values = position.array;
  for (let i = 0; i < position.count; i++) {
    const velocity = velocities[i];
    const offset = i * 3;
    velocity.y -= gravity * dt;
    values[offset] += velocity.x * dt;
    values[offset + 1] = Math.max(0.04, values[offset + 1] + velocity.y * dt);
    values[offset + 2] += velocity.z * dt;
    if (values[offset + 1] <= 0.041) {
      velocity.x *= Math.max(0, 1 - dt * 7);
      velocity.z *= Math.max(0, 1 - dt * 7);
      velocity.y = Math.max(0, velocity.y * -0.16);
    }
  }
  position.needsUpdate = true;
}

function updateLayeredExplosion(fx, dt) {
  fx.elapsed += dt;
  const elapsed = fx.elapsed;

  const flashT = THREE.MathUtils.clamp(elapsed / fx.flashDuration, 0, 1);
  const flashFade = (1 - flashT) * (1 - flashT);
  fx.flashMaterial.opacity = flashFade;
  fx.flash.scale.setScalar(fx.flashScale * (1 + flashT * 1.8));
  fx.flash.visible = flashFade > 0.01;
  fx.light.intensity = fx.lightIntensity * flashFade;

  const fireT = THREE.MathUtils.clamp(elapsed / fx.fireDuration, 0, 1);
  const fireFade = Math.pow(1 - fireT, 1.25);
  fx.hotMaterial.opacity = fireFade * fx.fireOpacity;
  fx.fireMaterial.opacity = fireFade * 0.86 * fx.fireOpacity;
  for (const fire of fx.fireSprites) {
    fire.sprite.position.addScaledVector(fire.velocity, dt);
    const scale = fire.baseScale * (1 + fireT * fire.growth);
    fire.sprite.scale.set(scale, scale * (1.02 + fire.stretch), 1);
    fire.sprite.visible = fireFade > 0.015;
  }

  const smokeT = THREE.MathUtils.clamp(
    (elapsed - fx.smokeDelay) / fx.smokeDuration,
    0,
    1
  );
  const smokeIn = THREE.MathUtils.smoothstep(smokeT, 0, 0.12);
  const smokeOut = 1 - THREE.MathUtils.smoothstep(smokeT, 0.56, 1);
  for (const smokeLayer of fx.smokeMaterials) {
    smokeLayer.material.opacity = smokeLayer.opacity * smokeIn * smokeOut;
  }
  for (const smoke of fx.smokeSprites) {
    smoke.velocity.multiplyScalar(Math.max(0, 1 - dt * 0.72));
    smoke.sprite.position.addScaledVector(smoke.velocity, dt);
    smoke.sprite.position.y += dt * smoke.rise;
    const scale = smoke.baseScale * (1 + smokeT * smoke.growth);
    smoke.sprite.scale.set(scale * smoke.widen, scale, 1);
  }

  const dustT = THREE.MathUtils.clamp(elapsed / fx.dustDuration, 0, 1);
  const dustFade = (1 - dustT) * (1 - dustT);
  fx.dustMaterial.opacity = fx.dustOpacity * dustFade;
  for (const dust of fx.dustSprites) {
    dust.velocity.multiplyScalar(Math.max(0, 1 - dt * 1.8));
    dust.sprite.position.addScaledVector(dust.velocity, dt);
    const scale = dust.baseScale * (1 + dustT * dust.growth);
    dust.sprite.scale.set(scale * dust.widen, scale * 0.48, 1);
  }

  const earthT = THREE.MathUtils.clamp(elapsed / fx.earthDuration, 0, 1);
  const earthIn = THREE.MathUtils.smoothstep(earthT, 0, 0.06);
  const earthOut = 1 - THREE.MathUtils.smoothstep(earthT, 0.48, 1);
  for (const earthLayer of fx.earthMaterials) {
    earthLayer.material.opacity = earthLayer.opacity * earthIn * earthOut;
  }
  for (const earth of fx.earthSprites) {
    earth.velocity.y -= dt * fx.scale * earth.gravity;
    earth.sprite.position.addScaledVector(earth.velocity, dt);
    if (earth.sprite.position.y < fx.scale * 0.025) {
      earth.sprite.position.y = fx.scale * 0.025;
      earth.velocity.y = Math.max(0, earth.velocity.y * -0.08);
      earth.velocity.x *= Math.max(0, 1 - dt * 6);
      earth.velocity.z *= Math.max(0, 1 - dt * 6);
    }
    const scale = earth.baseScale * (1 + earthT * earth.growth);
    earth.sprite.scale.set(scale * earth.width, scale * earth.height, 1);
  }

  updateExplosionPoints(fx.sparks, fx.sparkVelocities, 9.5, dt);
  updateExplosionPoints(fx.debris, fx.debrisVelocities, 13.5, dt);
  fx.sparkMaterial.opacity = Math.pow(
    1 - THREE.MathUtils.clamp(elapsed / fx.sparkDuration, 0, 1),
    1.4
  );
  fx.debrisMaterial.opacity =
    0.8 * (1 - THREE.MathUtils.smoothstep(elapsed, fx.lifeDuration * 0.62, fx.lifeDuration));
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

    if (fx.type === 'handGrenade') {
      const t = Math.min(1, 1 - fx.life / fx.maxLife);
      fx.mesh.position.lerpVectors(fx.from, fx.to, t);
      fx.mesh.position.y += Math.sin(t * Math.PI) * fx.arcHeight;
      fx.mesh.rotation.x += dt * 11;
      fx.mesh.rotation.z += dt * 8;
      if (t >= 1 && !fx.impacted) {
        fx.impacted = true;
        spawnExplosion(fx.scene, fx.to);
        fx.onImpact?.();
      }
    } else if (fx.type === 'smoke') {
      fx.mesh.scale.multiplyScalar(1 + dt * 2.5);
      fx.material.opacity = Math.max(0, fx.material.opacity - dt * 1.8);
      fx.mesh.position.y += dt * 0.8;
    } else if (fx.type === 'collapseDust') {
      const fade = Math.max(0, fx.life / fx.maxLife);
      for (const puff of fx.puffs) {
        puff.velocity.multiplyScalar(Math.max(0, 1 - dt * 1.4));
        puff.mesh.position.addScaledVector(puff.velocity, dt);
        puff.mesh.position.y += dt * puff.rise;
        puff.mesh.scale.multiplyScalar(1 + dt * puff.growth);
        puff.material.opacity = puff.opacity * fade * fade;
      }
      fx.ring.scale.multiplyScalar(1 + dt * 2.2);
      fx.ringMaterial.opacity = 0.28 * fade * fade;
    } else if (fx.type === 'smokeShellImpact') {
      fx.elapsed += dt;
      const t = THREE.MathUtils.clamp(fx.elapsed / fx.maxLife, 0, 1);
      const appear = THREE.MathUtils.smoothstep(t, 0, 0.08);
      const fade = 1 - THREE.MathUtils.smoothstep(t, 0.46, 1);
      for (const puff of fx.puffs) {
        puff.velocity.multiplyScalar(Math.max(0, 1 - dt * 1.15));
        puff.sprite.position.addScaledVector(puff.velocity, dt);
        puff.sprite.position.y += dt * puff.rise;
        const grow = 1 + t * puff.growth;
        puff.sprite.scale.set(
          puff.baseScale * puff.width * grow,
          puff.baseScale * grow,
          1
        );
        puff.material.opacity = puff.opacity * appear * fade;
        puff.material.rotation += dt * puff.rotationSpeed;
      }
      updateExplosionPoints(fx.debris, fx.debrisVelocities, 14.5, dt);
      fx.debrisMaterial.opacity = 0.72 * (1 - THREE.MathUtils.smoothstep(t, 0.52, 1));
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
    } else if (fx.type === 'layeredExplosion') {
      updateLayeredExplosion(fx, dt);
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
    } else if (fx.type === 'armorRicochet') {
      const fade = Math.max(0, fx.life / fx.maxLife);
      for (const particle of fx.particles) {
        particle.velocity.y -= 11 * dt;
        particle.mesh.position.addScaledVector(particle.velocity, dt);
        particle.mesh.material.opacity = fade;
      }
    }

    if (fx.life <= 0) {
      disposeEffect(fx);
      active.splice(i, 1);
    }
  }
}

/** Brief hot-metal spray for a shell that glances or fails to penetrate armor. */
export function spawnArmorRicochet(scene, pos, shotFrom = null) {
  if (!scene || !canSpawnEffect()) return false;
  const group = new THREE.Group();
  group.position.copy(toVec3(pos));
  scene.add(group);

  const away = new THREE.Vector3(
    pos.x - (shotFrom?.x ?? pos.x - 1),
    0,
    pos.z - (shotFrom?.z ?? pos.z)
  );
  if (away.lengthSq() < 0.01) away.set(1, 0, 0);
  away.normalize();
  const geo = new THREE.SphereGeometry(0.075, 4, 3);
  const materials = [];
  const particles = [];
  for (let i = 0; i < 9; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: i < 3 ? 0xffffff : 0xffa51f,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const spark = new THREE.Mesh(geo, mat);
    group.add(spark);
    materials.push(mat);
    particles.push({
      mesh: spark,
      velocity: new THREE.Vector3(
        away.x * (2.5 + Math.random() * 4) + (Math.random() - 0.5) * 5,
        2.2 + Math.random() * 5,
        away.z * (2.5 + Math.random() * 4) + (Math.random() - 0.5) * 5
      ),
    });
  }
  registerEffect({
    type: 'armorRicochet',
    group,
    particles,
    geometries: [geo],
    materials,
    life: 0.42,
    maxLife: 0.42,
  });
  return true;
}

/** Visible close-range infantry grenade with a short ballistic arc. */
export function spawnHandGrenade(scene, from, to, onImpact = null) {
  if (!scene || !canSpawnEffect()) {
    onImpact?.();
    return false;
  }

  const start = toVec3(from).clone();
  const end = toVec3(to).clone();
  const distance = start.distanceTo(end);
  const duration = THREE.MathUtils.clamp(0.42 + distance * 0.035, 0.5, 0.82);

  const geo = new THREE.SphereGeometry(0.105, 7, 6);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x38442b,
    roughness: 0.82,
    metalness: 0.18,
  });
  const grenade = new THREE.Mesh(geo, mat);
  grenade.scale.set(0.82, 1.15, 0.82);
  grenade.position.copy(start);
  grenade.castShadow = true;
  scene.add(grenade);

  registerEffect({
    type: 'handGrenade',
    scene,
    mesh: grenade,
    from: start,
    to: end,
    arcHeight: Math.max(1.25, distance * 0.22),
    onImpact,
    impacted: false,
    geometries: [geo],
    materials: [mat],
    life: duration,
    maxLife: duration,
  });
  return true;
}

const CANNON_MUZZLE_TYPES = new Set(['tank', 'tankDestroyer', 'superHeavyTank', 'antiTankGun', 'artillery']);

function isCannonMuzzle(weaponType) {
  return CANNON_MUZZLE_TYPES.has(weaponType);
}

/**
 * Big muzzle fire + smoke for tank / super-heavy / AT gun main guns.
 * Directional fire jet along the shot axis + expanding smoke cloud.
 */
function spawnTankMuzzleBlast(scene, pos, toV, weaponType) {
  if (!canSpawnEffect(6)) return;

  const heavy = weaponType === 'tankDestroyer' || weaponType === 'superHeavyTank' || weaponType === 'artillery';
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
        : weaponType === 'tank' || weaponType === 'tankDestroyer' || weaponType === 'superHeavyTank'
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

/** One capped effect for a heavy, ground-hugging building-collapse dust sheet. */
export function spawnCollapseDust(scene, pos, radius = 2.5, direction = null) {
  if (!scene || !canSpawnEffect()) return false;
  const group = new THREE.Group();
  group.position.copy(toVec3(pos));
  const geometry = new THREE.SphereGeometry(1, 7, 5);
  const materials = [];
  const puffs = [];
  const dir = new THREE.Vector3(direction?.x ?? 0, 0, direction?.z ?? 0);
  if (dir.lengthSq() > 0.001) dir.normalize();

  const count = 7;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
    const outward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const material = new THREE.MeshBasicMaterial({
      color: i % 3 === 0 ? 0x9b8b70 : i % 3 === 1 ? 0x776d5c : 0x887c65,
      transparent: true,
      opacity: 0.36 + Math.random() * 0.14,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    const distance = radius * (0.12 + Math.random() * 0.38);
    mesh.position.set(outward.x * distance, 0.2 + Math.random() * 0.26, outward.z * distance);
    mesh.scale.set(
      radius * (0.24 + Math.random() * 0.18),
      radius * (0.12 + Math.random() * 0.09),
      radius * (0.22 + Math.random() * 0.18)
    );
    group.add(mesh);
    materials.push(material);
    puffs.push({
      mesh,
      material,
      opacity: material.opacity,
      velocity: outward
        .multiplyScalar(0.65 + Math.random() * 0.65)
        .addScaledVector(dir, 0.35 + Math.random() * 0.55),
      rise: 0.18 + Math.random() * 0.34,
      growth: 0.65 + Math.random() * 0.55,
    });
  }

  const ringGeometry = new THREE.RingGeometry(radius * 0.22, radius * 0.78, 24);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x8e8169,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  group.add(ring);
  materials.push(ringMaterial);
  scene.add(group);

  const life = 1.05;
  registerEffect({
    type: 'collapseDust',
    group,
    puffs,
    ring,
    ringMaterial,
    geometries: [geometry, ringGeometry],
    materials,
    life,
    maxLife: life,
  });
  return true;
}

const EXPLOSION_PROFILES = {
  small: {
    scale: 0.82,
    fireScale: 1,
    fireCount: 3,
    smokeCount: 4,
    dustCount: 4,
    earthCount: 3,
    sparkCount: 8,
    debrisCount: 12,
    flashDuration: 0.12,
    fireDuration: 0.42,
    smokeDelay: 0.07,
    smokeDuration: 1.35,
    dustDuration: 0.72,
    sparkDuration: 0.62,
    lightIntensity: 5.5,
  },
  liteMedium: {
    scale: 1.02,
    fireScale: 1.08,
    fireCount: 3,
    smokeCount: 5,
    dustCount: 5,
    earthCount: 4,
    sparkCount: 10,
    debrisCount: 18,
    flashDuration: 0.13,
    fireDuration: 0.52,
    smokeDelay: 0.07,
    smokeDuration: 1.55,
    dustDuration: 0.82,
    sparkDuration: 0.68,
    lightIntensity: 7,
  },
  medium: {
    scale: 1.34,
    fireScale: 1.18,
    fireCount: 4,
    smokeCount: 6,
    dustCount: 6,
    earthCount: 5,
    sparkCount: 13,
    debrisCount: 28,
    flashDuration: 0.14,
    fireDuration: 0.64,
    smokeDelay: 0.08,
    smokeDuration: 1.9,
    dustDuration: 0.94,
    sparkDuration: 0.76,
    lightIntensity: 9.5,
  },
  large: {
    scale: 1.72,
    fireScale: 1.22,
    fireCount: 5,
    smokeCount: 7,
    dustCount: 7,
    earthCount: 6,
    sparkCount: 16,
    debrisCount: 38,
    flashDuration: 0.15,
    fireDuration: 0.72,
    smokeDelay: 0.08,
    smokeDuration: 2.15,
    dustDuration: 1.02,
    sparkDuration: 0.84,
    lightIntensity: 12,
  },
  heavy: {
    scale: 2.14,
    fireScale: 1.28,
    fireCount: 5,
    smokeCount: 8,
    dustCount: 8,
    earthCount: 8,
    sparkCount: 19,
    debrisCount: 48,
    flashDuration: 0.16,
    fireDuration: 0.78,
    smokeDelay: 0.08,
    smokeDuration: 2.35,
    dustDuration: 1.08,
    sparkDuration: 0.9,
    lightIntensity: 14,
  },
  artillery: {
    scale: 2.82,
    fireScale: 0.72,
    fireCount: 1,
    fireOpacity: 0.3,
    smokeCount: 4,
    dustCount: 8,
    earthCount: 19,
    sparkCount: 7,
    debrisCount: 96,
    flashDuration: 0.08,
    fireDuration: 0.26,
    smokeDelay: 0.035,
    smokeDuration: 1.9,
    dustDuration: 1.38,
    earthDuration: 1.82,
    sparkDuration: 0.58,
    lightIntensity: 5.5,
    soilDominant: true,
  },
  barrage: {
    scale: 3.16,
    fireScale: 0.76,
    fireCount: 1,
    fireOpacity: 0.34,
    smokeCount: 5,
    dustCount: 9,
    earthCount: 22,
    sparkCount: 8,
    debrisCount: 112,
    flashDuration: 0.085,
    fireDuration: 0.28,
    smokeDelay: 0.035,
    smokeDuration: 2.05,
    dustDuration: 1.48,
    earthDuration: 1.96,
    sparkDuration: 0.62,
    lightIntensity: 6.5,
    soilDominant: true,
  },
  creeping: {
    scale: 3.02,
    fireScale: 0.74,
    fireCount: 1,
    fireOpacity: 0.32,
    smokeCount: 4,
    dustCount: 9,
    earthCount: 21,
    sparkCount: 7,
    debrisCount: 104,
    flashDuration: 0.08,
    fireDuration: 0.27,
    smokeDelay: 0.035,
    smokeDuration: 1.98,
    dustDuration: 1.44,
    earthDuration: 1.9,
    sparkDuration: 0.6,
    lightIntensity: 6,
    soilDominant: true,
  },
};

function createExplosionPointBurst(count, scale, sparks) {
  const positions = new Float32Array(count * 3);
  const velocities = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radial = Math.random() * scale * (sparks ? 0.24 : 0.34);
    positions[i * 3] = Math.cos(angle) * radial;
    positions[i * 3 + 1] = scale * (sparks
      ? 0.12 + Math.random() * 0.34
      : 0.035 + Math.random() * 0.12);
    positions[i * 3 + 2] = Math.sin(angle) * radial;
    const speed = scale * (sparks ? 3.6 + Math.random() * 4.4 : 2.8 + Math.random() * 4.6);
    velocities.push(
      new THREE.Vector3(
        Math.cos(angle) * speed * (0.55 + Math.random() * 0.55),
        scale * (sparks ? 3.6 + Math.random() * 5.2 : 3.6 + Math.random() * 5.6),
        Math.sin(angle) * speed * (0.55 + Math.random() * 0.55)
      )
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    map: getEmberTexture(),
    alphaMap: getEmberTexture(),
    color: sparks ? 0xffb14a : 0x493422,
    size: scale * (sparks ? 0.22 : 0.23),
    sizeAttenuation: true,
    transparent: true,
    opacity: sparks ? 1 : 0.8,
    blending: sparks ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
    alphaTest: 0.025,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, geometry, material, velocities };
}

function spawnLayeredExplosion(scene, pos, profileName = 'medium', scaleMultiplier = 1) {
  if (!scene || !reserveLayeredExplosionSlot()) return false;
  const profile = EXPLOSION_PROFILES[profileName] ?? EXPLOSION_PROFILES.medium;
  const heavyOrdnance = ['large', 'heavy', 'artillery', 'barrage', 'creeping'].includes(profileName);
  const soilDominant = profile.soilDominant === true;
  const scale = profile.scale * THREE.MathUtils.clamp(scaleMultiplier, 0.82, 1.22);
  const group = new THREE.Group();
  group.name = 'layeredExplosion';
  group.userData.explosionProfile = profileName;
  group.position.copy(toVec3(pos));
  const geometries = [];
  const materials = [];

  const flameTexture = getFlameTexture();
  const smokeTexture = getSmokeTexture();
  const hotMaterial = new THREE.SpriteMaterial({
    map: flameTexture,
    color: 0xffe7a3,
    transparent: true,
    opacity: profile.fireOpacity ?? 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });
  const fireMaterial = new THREE.SpriteMaterial({
    map: flameTexture,
    color: 0xff5a16,
    transparent: true,
    opacity: 0.86 * (profile.fireOpacity ?? 1),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });
  materials.push(hotMaterial, fireMaterial);
  const fireSprites = [];
  for (let i = 0; i < profile.fireCount; i++) {
    const sprite = new THREE.Sprite(i % 3 === 0 ? hotMaterial : fireMaterial);
    const angle = (i / profile.fireCount) * Math.PI * 2 + Math.random() * 0.6;
    const radial = scale * Math.random() * 0.42;
    sprite.position.set(
      Math.cos(angle) * radial,
      scale * (0.32 + Math.random() * 0.48),
      Math.sin(angle) * radial
    );
    const baseScale = scale * profile.fireScale * (0.9 + Math.random() * 0.75);
    sprite.scale.set(baseScale, baseScale, 1);
    sprite.name = 'explosionFire';
    sprite.renderOrder = 12;
    group.add(sprite);
    fireSprites.push({
      sprite,
      baseScale,
      growth: 1.1 + Math.random() * 0.9,
      stretch: Math.random() * 0.25,
      velocity: new THREE.Vector3(
        Math.cos(angle) * scale * (0.25 + Math.random() * 0.35),
        scale * (0.85 + Math.random() * 0.7),
        Math.sin(angle) * scale * (0.25 + Math.random() * 0.35)
      ),
    });
  }

  const smokeDarkMaterial = new THREE.SpriteMaterial({
    map: smokeTexture,
    color: soilDominant ? 0x32281f : heavyOrdnance ? 0x262724 : 0x3d3b36,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
  });
  const smokeLightMaterial = new THREE.SpriteMaterial({
    map: smokeTexture,
    color: soilDominant ? 0x67513a : heavyOrdnance ? 0x55544d : 0x69645a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
  });
  const smokeMaterials = [
    {
      material: smokeDarkMaterial,
      opacity: soilDominant ? 0.58 : heavyOrdnance ? 0.72 : 0.62,
    },
    {
      material: smokeLightMaterial,
      opacity: soilDominant ? 0.36 : heavyOrdnance ? 0.5 : 0.44,
    },
  ];
  materials.push(smokeDarkMaterial, smokeLightMaterial);
  const smokeSprites = [];
  for (let i = 0; i < profile.smokeCount; i++) {
    const sprite = new THREE.Sprite(i % 3 === 0 ? smokeLightMaterial : smokeDarkMaterial);
    const angle = (i / profile.smokeCount) * Math.PI * 2 + Math.random() * 0.75;
    const corePuff = i < 2;
    const radial = scale * (corePuff ? 0.06 + Math.random() * 0.2 : 0.28 + Math.random() * 0.82);
    sprite.position.set(
      Math.cos(angle) * radial,
      scale * (corePuff ? 0.38 + i * 0.34 + Math.random() * 0.16 : 0.28 + Math.random() * 0.82),
      Math.sin(angle) * radial
    );
    const baseScale = scale * (corePuff ? 0.54 + Math.random() * 0.3 : 0.42 + Math.random() * 0.38);
    sprite.scale.set(baseScale, baseScale, 1);
    sprite.name = 'explosionSmoke';
    sprite.renderOrder = 8;
    group.add(sprite);
    smokeSprites.push({
      sprite,
      baseScale,
      growth: 1.4 + Math.random() * 0.85,
      widen: 1 + Math.random() * 0.28,
      rise: scale * (0.38 + Math.random() * 0.42),
      velocity: new THREE.Vector3(
        Math.cos(angle) * scale * (0.18 + Math.random() * 0.25),
        scale * (0.12 + Math.random() * 0.2),
        Math.sin(angle) * scale * (0.18 + Math.random() * 0.25)
      ),
    });
  }

  const dustMaterial = new THREE.SpriteMaterial({
    map: smokeTexture,
    color: 0x81725b,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    depthTest: true,
  });
  materials.push(dustMaterial);
  const dustSprites = [];
  for (let i = 0; i < profile.dustCount; i++) {
    const sprite = new THREE.Sprite(dustMaterial);
    const angle = (i / profile.dustCount) * Math.PI * 2 + Math.random() * 0.55;
    const baseScale = scale * (0.75 + Math.random() * 0.55);
    sprite.position.set(Math.cos(angle) * scale * 0.35, scale * 0.16, Math.sin(angle) * scale * 0.35);
    sprite.scale.set(baseScale, baseScale * 0.5, 1);
    sprite.name = 'explosionDust';
    sprite.renderOrder = 7;
    group.add(sprite);
    dustSprites.push({
      sprite,
      baseScale,
      growth: 1.4 + Math.random() * 0.8,
      widen: 1.4 + Math.random() * 0.5,
      velocity: new THREE.Vector3(
        Math.cos(angle) * scale * (1.3 + Math.random() * 0.9),
        scale * (0.08 + Math.random() * 0.12),
        Math.sin(angle) * scale * (1.3 + Math.random() * 0.9)
      ),
    });
  }

  // A shell throws an irregular curtain of earth, not a clean pressure-ring.
  // These narrow, fast-rising plumes sit behind the fireball and make heavier
  // calibres read through displaced soil even after the flash is gone.
  const earthDarkMaterial = new THREE.SpriteMaterial({
    map: getEarthSprayTexture(),
    color: soilDominant ? 0x70492d : 0x4a3828,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
  });
  const earthMidMaterial = new THREE.SpriteMaterial({
    map: getEarthSprayTexture(),
    color: soilDominant ? 0x9b683a : 0x654c35,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
  });
  const earthLightMaterial = new THREE.SpriteMaterial({
    map: getEarthSprayTexture(),
    color: soilDominant ? 0xc1884b : 0x796044,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
  });
  const earthMaterials = [
    { material: earthDarkMaterial, opacity: soilDominant ? 0.72 : heavyOrdnance ? 0.76 : 0.64 },
    { material: earthMidMaterial, opacity: soilDominant ? 0.68 : heavyOrdnance ? 0.68 : 0.56 },
    { material: earthLightMaterial, opacity: soilDominant ? 0.64 : heavyOrdnance ? 0.58 : 0.48 },
  ];
  materials.push(earthDarkMaterial, earthMidMaterial, earthLightMaterial);
  const earthSprites = [];
  const soilLobeRotation = Math.random() * Math.PI * 2;
  const soilLobes = soilDominant
    ? Array.from(
        { length: 7 },
        (_, index) => soilLobeRotation + (index / 7) * Math.PI * 2 + (Math.random() - 0.5) * 0.26
      )
    : null;
  for (let i = 0; i < profile.earthCount; i++) {
    const soilMaterial = i % 4 === 0
      ? earthLightMaterial
      : i % 4 === 2
        ? earthDarkMaterial
        : earthMidMaterial;
    const sprite = new THREE.Sprite(soilDominant ? soilMaterial : i % 3 === 0 ? earthLightMaterial : earthDarkMaterial);
    if (soilDominant) sprite.center.set(0.5, 0.05);
    const angle = soilDominant
      ? soilLobes[i % soilLobes.length] + (Math.random() - 0.5) * 0.62
      : (i / profile.earthCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.72;
    const radial = scale * (soilDominant
      ? 0.02 + Math.random() * 0.11
      : 0.08 + Math.random() * 0.34);
    sprite.position.set(
      Math.cos(angle) * radial,
      scale * (0.05 + Math.random() * 0.1),
      Math.sin(angle) * radial
    );
    const baseScale = scale * (soilDominant
      ? 0.7 + Math.random() * 0.56
      : 0.58 + Math.random() * 0.42);
    const soilSpike = soilDominant && i % 3 === 0;
    sprite.scale.set(
      baseScale * (soilDominant ? 0.26 : 0.48),
      baseScale * (soilDominant ? 1.72 : 1.2),
      1
    );
    sprite.name = 'explosionEarthSpray';
    sprite.renderOrder = 9;
    group.add(sprite);
    earthSprites.push({
      sprite,
      baseScale,
      width: soilDominant
        ? soilSpike ? 0.3 + Math.random() * 0.24 : 0.5 + Math.random() * 0.42
        : 0.42 + Math.random() * 0.24,
      height: soilDominant
        ? soilSpike ? 1.75 + Math.random() * 0.8 : 1.28 + Math.random() * 0.68
        : 1.05 + Math.random() * 0.48,
      growth: soilDominant ? 0.92 + Math.random() * 0.8 : 1.05 + Math.random() * 0.82,
      gravity: soilDominant ? 2.65 + Math.random() * 0.85 : 2.4,
      velocity: new THREE.Vector3(
        Math.cos(angle) * scale * (soilDominant
          ? soilSpike ? 0.75 + Math.random() * 0.75 : 1.45 + Math.random() * 1.2
          : 0.72 + Math.random() * 0.9),
        scale * (soilDominant
          ? soilSpike ? 3.35 + Math.random() * 1.65 : 2.7 + Math.random() * 1.35
          : 1.6 + Math.random() * 1.45),
        Math.sin(angle) * scale * (soilDominant
          ? soilSpike ? 0.75 + Math.random() * 0.75 : 1.45 + Math.random() * 1.2
          : 0.72 + Math.random() * 0.9)
      ),
    });
  }

  const flashMaterial = new THREE.SpriteMaterial({
    map: getFlashTexture(heavyOrdnance ? 0xffb250 : 0xffc06a),
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const flash = new THREE.Sprite(flashMaterial);
  flash.name = 'explosionFlash';
  const flashScale = scale * (soilDominant ? 2.8 : 4.8);
  flash.scale.setScalar(flashScale);
  flash.position.y = scale * 0.62;
  flash.renderOrder = 15;
  group.add(flash);
  materials.push(flashMaterial);

  const sparkBurst = createExplosionPointBurst(profile.sparkCount, scale, true);
  const debrisBurst = createExplosionPointBurst(profile.debrisCount, scale, false);
  sparkBurst.points.name = 'explosionSparks';
  debrisBurst.points.name = 'explosionDebris';
  group.add(sparkBurst.points, debrisBurst.points);
  geometries.push(sparkBurst.geometry, debrisBurst.geometry);
  materials.push(sparkBurst.material, debrisBurst.material);

  const light = new THREE.PointLight(0xff8a3a, profile.lightIntensity, scale * 17, 2);
  light.position.y = scale * 0.82;
  light.castShadow = false;
  group.add(light);
  scene.add(group);

  const lifeDuration = profile.smokeDelay + profile.smokeDuration;
  registerEffect({
    type: 'layeredExplosion',
    profileName,
    group,
    fireSprites,
    hotMaterial,
    fireMaterial,
    fireOpacity: profile.fireOpacity ?? 1,
    smokeSprites,
    smokeMaterials,
    dustSprites,
    dustMaterial,
    dustOpacity: heavyOrdnance ? 0.48 : 0.4,
    earthSprites,
    earthMaterials,
    flash,
    flashMaterial,
    flashScale,
    light,
    lightIntensity: profile.lightIntensity,
    sparks: sparkBurst.points,
    sparkMaterial: sparkBurst.material,
    sparkVelocities: sparkBurst.velocities,
    debris: debrisBurst.points,
    debrisMaterial: debrisBurst.material,
    debrisVelocities: debrisBurst.velocities,
    elapsed: 0,
    flashDuration: profile.flashDuration,
    fireDuration: profile.fireDuration,
    smokeDelay: profile.smokeDelay,
    smokeDuration: profile.smokeDuration,
    dustDuration: profile.dustDuration,
    earthDuration: profile.earthDuration ?? profile.dustDuration * 1.24,
    scale,
    sparkDuration: profile.sparkDuration,
    lifeDuration,
    geometries,
    materials,
    life: lifeDuration,
    maxLife: lifeDuration,
  });
  return true;
}

export function spawnExplosion(scene, pos) {
  return spawnLayeredExplosion(scene, pos, 'small');
}

/**
 * Large shell burst for artillery / mortars (and barrage strikes).
 * @param {'heavy'|'large'|'medium'} tier
 * @param {number|null} caliber — millimetres; used to distinguish shell weight
 */
export function spawnShellExplosion(scene, pos, tier = 'heavy', caliber = null) {
  let profile = tier === 'heavy' ? 'heavy' : tier === 'large' ? 'large' : 'medium';
  if (tier !== 'heavy' && Number.isFinite(caliber)) {
    if (caliber <= 64) profile = 'liteMedium';
    else if (caliber >= 105) profile = 'heavy';
    else if (caliber >= 85) profile = 'large';
  }
  return spawnLayeredExplosion(scene, pos, profile);
}

/** Lower-intensity capped burst for rapid fire-support hits and cook-offs. */
export function spawnShellExplosionLite(scene, pos, tier = 'medium') {
  return spawnLayeredExplosion(scene, pos, tier === 'heavy' ? 'medium' : 'liteMedium');
}

/** Full-size impact used only for guns and scheduled fire support. */
export function spawnArtilleryExplosion(scene, pos, kind = 'artillery', caliber = 105) {
  const profile = ['barrage', 'creeping'].includes(kind) ? kind : 'artillery';
  const caliberScale = Number.isFinite(caliber)
    ? THREE.MathUtils.clamp(Math.pow(caliber / 105, 0.72), 0.88, 1.18)
    : 1;
  return spawnLayeredExplosion(scene, pos, profile, caliberScale);
}

/** Compact canister discharge for a smoke round: dirty-white smoke, dust and
 * a few soil fragments. The persistent screen grows separately around it. */
export function spawnSmokeShellImpact(scene, pos, scale = 1) {
  if (!scene || !canSpawnEffect()) return false;

  const group = new THREE.Group();
  group.name = 'smokeShellImpact';
  group.position.copy(toVec3(pos));
  const puffs = [];
  const materials = [];
  const smokeTexture = getSmokeTexture();
  const count = 8;
  for (let i = 0; i < count; i++) {
    const dirtPuff = i < 2;
    const material = new THREE.SpriteMaterial({
      map: smokeTexture,
      color: dirtPuff
        ? (i === 0 ? 0x74614a : 0x8a765a)
        : (i % 2 === 0 ? 0xc5c8c5 : 0xaeb3b2),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      rotation: Math.random() * Math.PI * 2,
    });
    const sprite = new THREE.Sprite(material);
    const angle = Math.random() * Math.PI * 2;
    const radial = scale * (0.08 + Math.random() * (dirtPuff ? 0.3 : 0.65));
    sprite.position.set(
      Math.cos(angle) * radial,
      scale * (dirtPuff ? 0.08 + Math.random() * 0.18 : 0.18 + Math.random() * 0.5),
      Math.sin(angle) * radial
    );
    const baseScale = scale * (dirtPuff ? 0.52 + Math.random() * 0.32 : 0.72 + Math.random() * 0.5);
    const width = dirtPuff ? 1.35 + Math.random() * 0.35 : 0.82 + Math.random() * 0.42;
    sprite.scale.set(baseScale * width, baseScale, 1);
    sprite.name = dirtPuff ? 'smokeShellDust' : 'smokeShellDischarge';
    sprite.renderOrder = 13;
    group.add(sprite);
    materials.push(material);
    puffs.push({
      sprite,
      material,
      baseScale,
      width,
      growth: dirtPuff ? 1.8 + Math.random() * 0.8 : 1.15 + Math.random() * 0.9,
      opacity: dirtPuff ? 0.42 : 0.5 + Math.random() * 0.12,
      rise: scale * (dirtPuff ? 0.16 + Math.random() * 0.22 : 0.52 + Math.random() * 0.55),
      rotationSpeed: (Math.random() - 0.5) * 0.7,
      velocity: new THREE.Vector3(
        Math.cos(angle) * scale * (dirtPuff ? 1.5 : 0.55 + Math.random() * 0.7),
        scale * (dirtPuff ? 0.1 : 0.18 + Math.random() * 0.22),
        Math.sin(angle) * scale * (dirtPuff ? 1.5 : 0.55 + Math.random() * 0.7)
      ),
    });
  }

  const debrisBurst = createExplosionPointBurst(14, scale * 0.48, false);
  debrisBurst.points.name = 'smokeShellSoilFragments';
  debrisBurst.points.renderOrder = 14;
  group.add(debrisBurst.points);
  materials.push(debrisBurst.material);

  scene.add(group);
  const life = 1.2;
  registerEffect({
    type: 'smokeShellImpact',
    group,
    puffs,
    debris: debrisBurst.points,
    debrisMaterial: debrisBurst.material,
    debrisVelocities: debrisBurst.velocities,
    elapsed: 0,
    geometries: [debrisBurst.geometry],
    materials,
    life,
    maxLife: life,
  });
  return true;
}
