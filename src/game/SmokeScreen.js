import * as THREE from 'three';
import { getSmokeTexture } from '../effects/FireTextures.js';
import { sampleTerrainHeight } from '../world/Terrain.js';

/** Smoke screen lasts 60 seconds. */
export const SMOKE_DURATION = 60;
/** Ground radius in game meters (~10 m per unit). */
export const SMOKE_RADIUS = 20;
/** Chance a shot misses when LOS crosses smoke (blind fire). */
export const SMOKE_MISS_CHANCE = 0.82;

function segmentIntersectsCircle(ax, az, bx, bz, cx, cz, r) {
  const dx = bx - ax;
  const dz = bz - az;
  const fx = ax - cx;
  const fz = az - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-6) {
    const d2 = fx * fx + fz * fz;
    return d2 <= r * r;
  }
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - r * r;
  let disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  disc = Math.sqrt(disc);
  const inv = 1 / (2 * a);
  const t1 = (-b - disc) * inv;
  const t2 = (-b + disc) * inv;
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1) || (t1 < 0 && t2 > 1);
}

function isPointInCircle(x, z, cx, cz, r) {
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz <= r * r;
}

export function isLosObscuredBySmoke(ax, az, bx, bz, screens) {
  if (!screens?.length) return false;
  for (const s of screens) {
    if (isPointInCircle(bx, bz, s.x, s.z, s.radius)) return true;
    if (segmentIntersectsCircle(ax, az, bx, bz, s.x, s.z, s.radius)) return true;
  }
  return false;
}

function buildSmokeVisual(scene, mapDef, x, z) {
  const group = new THREE.Group();
  const y = sampleTerrainHeight(x, z, mapDef) + 0.35;
  group.position.set(x, y, z);

  const sprites = [];
  const spots = [
    { ox: 0, oz: 0, sx: 14, sy: 9 },
    { ox: -5, oz: 3, sx: 11, sy: 8 },
    { ox: 5, oz: -4, sx: 12, sy: 8.5 },
    { ox: -3, oz: -6, sx: 10, sy: 7.5 },
    { ox: 6, oz: 5, sx: 10.5, sy: 7.8 },
    { ox: -7, oz: -2, sx: 9.5, sy: 7 },
    { ox: 2, oz: 7, sx: 9, sy: 6.8 },
  ];

  for (const spot of spots) {
    const mat = new THREE.SpriteMaterial({
      map: getSmokeTexture(),
      color: 0xc8c8c8,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      depthTest: true,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(spot.ox, 2.2 + Math.random() * 1.2, spot.oz);
    sprite.scale.set(spot.sx, spot.sy, 1);
    sprite.renderOrder = 6;
    sprite.userData.wobble = Math.random() * Math.PI * 2;
    sprite.userData.baseY = sprite.position.y;
    sprite.userData.baseSx = spot.sx;
    sprite.userData.baseSy = spot.sy;
    group.add(sprite);
    sprites.push(sprite);
  }

  const ringGeo = new THREE.RingGeometry(SMOKE_RADIUS * 0.92, SMOKE_RADIUS, 48);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x9aa0a8,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.08;
  group.add(ring);

  scene.add(group);
  return { group, sprites, ring, ringMat };
}

export class SmokeScreenManager {
  constructor(game) {
    this.game = game;
    this.screens = [];
    this._nextId = 1;
    this.preview = null;
    this._previewScale = SMOKE_RADIUS;
  }

  reset() {
    for (const s of this.screens) this._disposeVisual(s);
    this.screens = [];
    this._nextId = 1;
    this.clearPreview();
  }

  getActiveScreens() {
    return this.screens;
  }

  clearPreview() {
    if (this.preview?.parent) {
      this.game.scene.remove(this.preview);
      this.preview.geometry?.dispose();
      this.preview.material?.dispose();
    }
    this.preview = null;
  }

  updatePreview(x, z) {
    if (!this.game.mapDef) return;
    const y = sampleTerrainHeight(x, z, this.game.mapDef) + 0.2;
    if (!this.preview) {
      const geo = new THREE.RingGeometry(0.88, 1, 40);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x9aa8b8,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.preview = new THREE.Mesh(geo, mat);
      this.game.scene.add(this.preview);
    }
    this.preview.position.set(x, y, z);
    this.preview.scale.set(this._previewScale, 1, this._previewScale);
  }

  deploy(x, z, team = 'player') {
    const mapDef = this.game.mapDef;
    if (!mapDef) return null;

    const half = mapDef.size / 2 - 6;
    x = THREE.MathUtils.clamp(x, -half, half);
    z = THREE.MathUtils.clamp(z, -half, half);

    const visual = buildSmokeVisual(this.game.scene, mapDef, x, z);
    const screen = {
      id: this._nextId++,
      x,
      z,
      radius: SMOKE_RADIUS,
      team,
      remaining: SMOKE_DURATION,
      phase: Math.random() * Math.PI * 2,
      ...visual,
    };
    this.screens.push(screen);
    return screen;
  }

  isLosObscured(ax, az, bx, bz) {
    return isLosObscuredBySmoke(ax, az, bx, bz, this.screens);
  }

  _disposeVisual(screen) {
    if (screen.group?.parent) screen.group.parent.remove(screen.group);
    for (const sprite of screen.sprites ?? []) {
      sprite.material?.dispose();
    }
    screen.ring?.geometry?.dispose();
    screen.ringMat?.dispose();
  }

  update(dt) {
    for (let i = this.screens.length - 1; i >= 0; i--) {
      const s = this.screens[i];
      s.remaining -= dt;
      const life = Math.max(0, s.remaining / SMOKE_DURATION);
      s.phase += dt * 0.55;

      let idx = 0;
      for (const sprite of s.sprites ?? []) {
        const mat = sprite.material;
        if (!mat) continue;
        const pulse = 0.94 + Math.sin(s.phase * 0.9 + sprite.userData.wobble) * 0.06;
        mat.opacity = (0.22 + life * 0.38) * pulse;
        sprite.position.y =
          sprite.userData.baseY + Math.sin(s.phase * 0.7 + idx) * 0.35 + (1 - life) * 0.8;
        sprite.scale.set(
          sprite.userData.baseSx * (0.88 + life * 0.18) * pulse,
          sprite.userData.baseSy * (0.88 + life * 0.18) * pulse,
          1
        );
        idx++;
      }
      if (s.ringMat) s.ringMat.opacity = 0.06 + life * 0.12;

      if (s.remaining <= 0) {
        this._disposeVisual(s);
        this.screens.splice(i, 1);
      }
    }
  }

  serialize() {
    return this.screens.map((s) => ({
      id: s.id,
      x: s.x,
      z: s.z,
      team: s.team,
      remaining: s.remaining,
    }));
  }

  restore(entries = []) {
    this.reset();
    for (const e of entries) {
      if (!e || e.remaining <= 0) continue;
      const visual = buildSmokeVisual(this.game.scene, this.game.mapDef, e.x, e.z);
      const screen = {
        id: e.id ?? this._nextId++,
        x: e.x,
        z: e.z,
        radius: SMOKE_RADIUS,
        team: e.team ?? 'player',
        remaining: e.remaining,
        phase: Math.random() * Math.PI * 2,
        ...visual,
      };
      this._nextId = Math.max(this._nextId, screen.id + 1);
      this.screens.push(screen);
    }
  }
}