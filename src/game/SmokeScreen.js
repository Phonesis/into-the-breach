import * as THREE from 'three';
import { getSmokeScreenTexture } from '../effects/FireTextures.js';
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
  const mats = [];
  const smokeTex = getSmokeScreenTexture();

  const spots = [
    { ox: 0, oz: 0, sx: 22, sy: 16, y: 3.8, op: 0.82 },
    { ox: -7, oz: 4, sx: 19, sy: 14, y: 4.6, op: 0.76 },
    { ox: 8, oz: -5, sx: 20, sy: 15, y: 4.2, op: 0.78 },
    { ox: -5, oz: -8, sx: 18, sy: 13, y: 3.4, op: 0.74 },
    { ox: 9, oz: 7, sx: 17, sy: 13, y: 5.1, op: 0.72 },
    { ox: -10, oz: -3, sx: 16, sy: 12, y: 3.9, op: 0.7 },
    { ox: 4, oz: 10, sx: 16, sy: 12, y: 4.8, op: 0.7 },
    { ox: -2, oz: 2, sx: 24, sy: 17, y: 2.6, op: 0.68 },
    { ox: 6, oz: 1, sx: 21, sy: 14, y: 2.2, op: 0.66 },
    { ox: -8, oz: 8, sx: 17, sy: 12, y: 5.6, op: 0.64 },
    { ox: 11, oz: -2, sx: 15, sy: 11, y: 3.1, op: 0.62 },
    { ox: 0, oz: -11, sx: 18, sy: 13, y: 2.8, op: 0.65 },
  ];

  for (const spot of spots) {
    const mat = new THREE.SpriteMaterial({
      map: smokeTex,
      color: 0xe8ecef,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(spot.ox, spot.y, spot.oz);
    sprite.scale.set(spot.sx, spot.sy, 1);
    sprite.renderOrder = 12;
    sprite.userData.wobble = Math.random() * Math.PI * 2;
    sprite.userData.baseY = spot.y;
    sprite.userData.baseSx = spot.sx;
    sprite.userData.baseSy = spot.sy;
    sprite.userData.baseOp = spot.op;
    group.add(sprite);
    sprites.push(sprite);
    mats.push(mat);
  }

  scene.add(group);
  return { group, sprites, mats };
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
        color: 0xb8c8dc,
        transparent: true,
        opacity: 0.62,
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
      age: 0,
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
    for (const mat of screen.mats ?? []) mat?.dispose();
    for (const sprite of screen.sprites ?? []) {
      if (!screen.mats?.includes(sprite.material)) sprite.material?.dispose();
    }
  }

  update(dt) {
    for (let i = this.screens.length - 1; i >= 0; i--) {
      const s = this.screens[i];
      s.remaining -= dt;
      s.age = Math.min(2.4, (s.age ?? 2.4) + dt);
      const life = Math.max(0, s.remaining / SMOKE_DURATION);
      const formation = THREE.MathUtils.smootherstep(s.age / 2.4, 0, 1);
      s.phase += dt * 0.55;

      let idx = 0;
      for (const sprite of s.sprites ?? []) {
        const mat = sprite.material;
        if (!mat) continue;
        const pulse = 0.92 + Math.sin(s.phase * 0.9 + sprite.userData.wobble) * 0.08;
        const baseOp = sprite.userData.baseOp ?? 0.7;
        mat.opacity = (0.32 + life * (baseOp - 0.32)) * pulse * formation;
        sprite.position.y =
          sprite.userData.baseY * (0.38 + formation * 0.62) +
          Math.sin(s.phase * 0.7 + idx) * 0.45 * formation +
          (1 - life) * 1.1;
        const sizeMult = (0.34 + formation * 0.66) * (0.92 + life * 0.14);
        sprite.scale.set(
          sprite.userData.baseSx * sizeMult * pulse,
          sprite.userData.baseSy * sizeMult * pulse,
          1
        );
        idx++;
      }

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
        age: 2.4,
        phase: Math.random() * Math.PI * 2,
        ...visual,
      };
      this._nextId = Math.max(this._nextId, screen.id + 1);
      this.screens.push(screen);
    }
  }
}
