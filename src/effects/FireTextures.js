import * as THREE from 'three';

let flameTexture = null;
let smokeTexture = null;
let emberTexture = null;

function makeCanvas(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

/** Soft radial flame — no hard plane edges when using alphaMap. */
export function getFlameTexture() {
  if (flameTexture) return flameTexture;
  flameTexture = makeCanvas(128, 192, (ctx, w, h) => {
    const cx = w * 0.5;
    const cy = h * 0.62;
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.52);
    g.addColorStop(0, 'rgba(255, 248, 220, 1)');
    g.addColorStop(0.18, 'rgba(255, 200, 80, 0.95)');
    g.addColorStop(0.38, 'rgba(255, 110, 30, 0.75)');
    g.addColorStop(0.58, 'rgba(220, 50, 10, 0.35)');
    g.addColorStop(0.78, 'rgba(120, 20, 0, 0.08)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * 0.46, h * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    const core = ctx.createRadialGradient(cx, cy - h * 0.08, 0, cx, cy, w * 0.22);
    core.addColorStop(0, 'rgba(255, 255, 240, 0.9)');
    core.addColorStop(1, 'rgba(255, 200, 100, 0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.ellipse(cx, cy - h * 0.06, w * 0.18, h * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  return flameTexture;
}

/** Soft smoke puff alpha. */
export function getSmokeTexture() {
  if (smokeTexture) return smokeTexture;
  smokeTexture = makeCanvas(128, 128, (ctx, w, h) => {
    const cx = w * 0.5;
    const cy = h * 0.5;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.5);
    g.addColorStop(0, 'rgba(200, 200, 200, 0.55)');
    g.addColorStop(0.35, 'rgba(120, 120, 120, 0.35)');
    g.addColorStop(0.65, 'rgba(60, 60, 60, 0.12)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  return smokeTexture;
}

export function getEmberTexture() {
  if (emberTexture) return emberTexture;
  emberTexture = makeCanvas(32, 32, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255, 220, 140, 1)');
    g.addColorStop(0.4, 'rgba(255, 140, 40, 0.8)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  return emberTexture;
}

const FLAME_TINTS = [0xff6622, 0xff8833, 0xffaa44, 0xff4400];

export function createFlameMaterial(tintIndex = 0) {
  const map = getFlameTexture();
  return new THREE.MeshBasicMaterial({
    map,
    alphaMap: map,
    color: FLAME_TINTS[tintIndex % FLAME_TINTS.length],
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    alphaTest: 0.02,
  });
}

export function createSmokeMaterial(dark = false) {
  const map = getSmokeTexture();
  return new THREE.MeshBasicMaterial({
    map,
    alphaMap: map,
    color: dark ? 0x1a1a1a : 0x555555,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    alphaTest: 0.03,
  });
}

export function createEmberPointsMaterial() {
  const map = getEmberTexture();
  return new THREE.PointsMaterial({
    map,
    alphaMap: map,
    color: 0xffcc66,
    size: 0.45,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    alphaTest: 0.04,
  });
}