import * as THREE from 'three';
import { sampleTerrainHeight } from './Terrain.js';

const craters = [];
const texCache = new Map();
const _pit = new THREE.Color();
const _rim = new THREE.Color();
const _outer = new THREE.Color();
const _vertex = new THREE.Color();

let lastCraterAt = 0;
const terrainNormalsDirty = new WeakMap();

const CRATER_TIERS = {
  heavy: { radius: 4.8, depth: 0.62, heavy: true, minGap: 70 },
  medium: { radius: 3.4, depth: 0.44, heavy: false, minGap: 55 },
  light: { radius: 2.3, depth: 0.28, heavy: false, minGap: 45 },
};

function smoothBowl(t) {
  return t * t * (3 - 2 * t);
}

/** Bowl + raised ejecta lip + outer disturbance (matches aerial crater profile). */
function craterHeightOffset(f, depth) {
  if (f >= 1) return 0;
  const t = 1 - f;
  const bowl = -depth * smoothBowl(t);
  const lip = Math.exp(-((f - 0.68) ** 2) / 0.018) * depth * 0.42;
  const outer = f > 0.82 ? ((1 - f) / 0.18) * depth * 0.07 : 0;
  return bowl + lip + outer;
}

function noise2(x, y, seed) {
  return Math.abs(Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453) % 1;
}

function terrainKind(mapDef) {
  const t = mapDef?.terrain ?? 'bocage';
  if (t === 'desert') return 'desert';
  if (t === 'steppe') return 'steppe';
  if (t === 'hills') return 'hills';
  return 'grass';
}

function craterStyle(mapDef) {
  const kind = terrainKind(mapDef);
  if (kind === 'desert') {
    return {
      kind,
      pit: '#6e4e32',
      wall: '#8a6644',
      rim: '#c9a66e',
      outer: '#b08a5c',
      grass: null,
      streak: '#d4b888',
    };
  }
  if (kind === 'steppe') {
    return {
      kind,
      pit: '#4a3a28',
      wall: '#5c4a34',
      rim: '#8a7450',
      outer: '#6a7a48',
      grass: '#5a6a3a',
      streak: '#7a6a48',
    };
  }
  return {
    kind: 'grass',
    pit: '#3a2e1e',
    wall: '#4a3c28',
    rim: '#6f5a3a',
    outer: '#4a5a32',
    grass: '#4d6b38',
    streak: '#5a4a30',
  };
}

function colorBytes(value) {
  const color = new THREE.Color(value);
  return [color.r * 255, color.g * 255, color.b * 255];
}

function paintCraterTexture(mapDef, seed, heavy) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size * 0.5;
  const cy = size * 0.5;
  const style = craterStyle(mapDef);
  const palette = {
    pit: colorBytes(style.pit),
    wall: colorBytes(style.wall),
    rim: colorBytes(style.rim),
    outer: colorBytes(style.outer),
    grass: colorBytes(style.grass ?? style.outer),
    streak: colorBytes(style.streak),
  };
  const image = ctx.createImageData(size, size);
  const pixels = image.data;

  // Write the crater into one ImageData buffer. The previous implementation
  // issued tens of thousands of fillRect calls and constructed THREE.Color
  // objects inside this loop, causing a visible hitch the first time a new
  // crater texture variant was needed during an explosion.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1.02) continue;

      const n = noise2(x * 0.08, y * 0.08, seed);
      const n2 = noise2(x * 0.19, y * 0.15, seed + 11);
      const angle = Math.atan2(dy, dx);
      const streak = 0.5 + 0.5 * Math.sin(angle * (style.kind === 'desert' ? 7 : 5) + n * 4);

      let colorA = palette.pit;
      let colorB = palette.pit;
      let colorMix = 0;
      let alpha = 0;

      if (dist < 0.22) {
        alpha = 0.94 + n * 0.04;
      } else if (dist < 0.38) {
        colorA = palette.pit;
        colorB = palette.wall;
        colorMix = (dist - 0.22) / 0.16;
        alpha = 0.9 + n2 * 0.05;
      } else if (dist < 0.56) {
        colorA = palette.wall;
        colorB = palette.rim;
        colorMix = (dist - 0.38) / 0.18;
        alpha = 0.88 + n * 0.06;
      } else if (dist < 0.78) {
        const t = (dist - 0.56) / 0.22;
        colorA = palette.rim;
        if (style.kind === 'desert') {
          colorB = palette.outer;
          colorMix = t * 0.65;
          alpha = (0.72 - t * 0.35) * (0.55 + streak * 0.45);
        } else {
          colorB = palette.grass;
          colorMix = t;
          alpha = 0.65 - t * 0.28;
        }
      } else {
        const t = (dist - 0.78) / 0.24;
        colorA = palette.outer;
        if (style.kind === 'desert') {
          colorB = palette.streak;
          colorMix = streak * 0.5;
          alpha = (0.38 - t * 0.34) * (0.4 + streak * 0.35);
        } else {
          colorB = palette.grass;
          colorMix = 0.35 + t * 0.4;
          alpha = (0.42 - t * 0.38) * (0.55 + n * 0.25);
        }
      }

      let red = colorA[0] + (colorB[0] - colorA[0]) * colorMix;
      let green = colorA[1] + (colorB[1] - colorA[1]) * colorMix;
      let blue = colorA[2] + (colorB[2] - colorA[2]) * colorMix;

      if (style.kind !== 'desert' && dist > 0.48 && dist < 0.9 && n2 > 0.62) {
        red += (palette.grass[0] - red) * 0.35;
        green += (palette.grass[1] - green) * 0.35;
        blue += (palette.grass[2] - blue) * 0.35;
      }

      if (heavy && dist > 0.34 && dist < 0.72 && n > 0.7) {
        alpha = Math.min(1, alpha + 0.08);
      }

      const edgeFade = dist > 0.88 ? Math.max(0, 1 - (dist - 0.88) / 0.14) : 1;
      alpha *= edgeFade;
      if (alpha < 0.03) continue;

      const offset = (y * size + x) * 4;
      pixels[offset] = Math.round(red);
      pixels[offset + 1] = Math.round(green);
      pixels[offset + 2] = Math.round(blue);
      pixels[offset + 3] = Math.round(Math.min(1, alpha) * 255);
    }
  }
  ctx.putImageData(image, 0, 0);

  if (style.kind === 'desert') {
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < (heavy ? 16 : 10); i++) {
      const ang = (i / 10) * Math.PI * 2 + seed * 0.1;
      const len = size * (0.34 + (i % 4) * 0.06);
      const x0 = cx + Math.cos(ang) * size * 0.2;
      const y0 = cy + Math.sin(ang) * size * 0.2;
      const x1 = cx + Math.cos(ang) * len;
      const y1 = cy + Math.sin(ang) * len;
      ctx.strokeStyle = `rgba(212,184,136,${0.08 + (i % 3) * 0.04})`;
      ctx.lineWidth = 2 + (i % 2);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < (heavy ? 14 : 9); i++) {
      const ang = (i / 9) * Math.PI * 2 + seed;
      const rad = size * (0.28 + (i % 3) * 0.05);
      ctx.fillStyle = `rgba(70,58,36,${0.06 + (i % 2) * 0.05})`;
      ctx.beginPath();
      ctx.ellipse(
        cx + Math.cos(ang) * rad,
        cy + Math.sin(ang) * rad,
        3 + (i % 3),
        2 + (i % 2),
        ang,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function getCraterTexture(mapDef, x, z, heavy) {
  const bucket = Math.floor(x * 0.7) ^ Math.floor(z * 0.7);
  const key = `${mapDef?.id ?? 'map'}:${terrainKind(mapDef)}:${heavy ? 'h' : 'm'}:${bucket % 5}`;
  if (!texCache.has(key)) {
    texCache.set(key, paintCraterTexture(mapDef, key.length * 17 + bucket, heavy));
  }
  return texCache.get(key);
}

function deformVertexAt(pos, colors, i, x, z, r, r2, depth, style) {
  const vx = pos.getX(i);
  const vz = pos.getZ(i);
  const dx = vx - x;
  const dz = vz - z;
  const d2 = dx * dx + dz * dz;
  if (d2 > r2) return false;

  const f = Math.sqrt(d2) / r;
  pos.setY(i, pos.getY(i) + craterHeightOffset(f, depth));

  if (colors) {
    _vertex.setRGB(colors.getX(i), colors.getY(i), colors.getZ(i));
    if (f < 0.35) {
      _vertex.lerp(_pit.set(style.pit), 0.55 * (1 - f / 0.35));
    } else if (f < 0.62) {
      _vertex.lerp(_rim.set(style.rim), 0.28 * (1 - (f - 0.35) / 0.27));
    } else if (f < 0.9 && style.kind !== 'desert') {
      _vertex.lerp(_outer.set(style.grass ?? style.outer), 0.12 * (1 - (f - 0.62) / 0.28));
    }
    colors.setXYZ(i, _vertex.r, _vertex.g, _vertex.b);
  }

  return true;
}

function deformTerrainAt(terrainMesh, mapDef, x, z, radius, depth) {
  if (!terrainMesh?.geometry || depth <= 0) return;
  const geo = terrainMesh.geometry;
  const pos = geo.attributes.position;
  const colors = geo.attributes.color;
  const r = radius * 1.05;
  const r2 = r * r;
  const style = craterStyle(mapDef);
  let changed = false;

  const params = geo.parameters;
  if (params?.width != null && params.widthSegments != null) {
    const wSeg = params.widthSegments;
    const hSeg = params.heightSegments;
    const cols = wSeg + 1;
    const halfW = params.width * 0.5;
    const halfH = params.height * 0.5;
    const segW = params.width / wSeg;
    const segH = params.height / hSeg;
    const ixMin = Math.max(0, Math.floor((x - r + halfW) / segW) - 1);
    const ixMax = Math.min(wSeg, Math.ceil((x + r + halfW) / segW) + 1);
    const iyMin = Math.max(0, Math.floor((-z - r + halfH) / segH) - 1);
    const iyMax = Math.min(hSeg, Math.ceil((-z + r + halfH) / segH) + 1);

    for (let iy = iyMin; iy <= iyMax; iy++) {
      const base = iy * cols;
      for (let ix = ixMin; ix <= ixMax; ix++) {
        if (deformVertexAt(pos, colors, base + ix, x, z, r, r2, depth, style)) {
          changed = true;
        }
      }
    }
  } else {
    for (let i = 0; i < pos.count; i++) {
      if (deformVertexAt(pos, colors, i, x, z, r, r2, depth, style)) {
        changed = true;
      }
    }
  }

  if (changed) {
    pos.needsUpdate = true;
    if (colors) colors.needsUpdate = true;
    terrainNormalsDirty.set(terrainMesh, true);
  }
}

/** Recompute terrain normals at most once per frame after batched crater deformations. */
export function flushTerrainNormals(terrainMesh) {
  if (!terrainMesh?.geometry || !terrainNormalsDirty.get(terrainMesh)) return;
  terrainMesh.geometry.computeVertexNormals();
  terrainNormalsDirty.delete(terrainMesh);
}

function addCraterDecal(scene, mapDef, x, z, y, radius, heavy) {
  const tex = getCraterTexture(mapDef, x, z, heavy);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.04,
    roughness: 0.97,
    metalness: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });

  const decal = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.05, 40), mat);
  decal.rotation.x = -Math.PI / 2;
  decal.position.set(x, y + 0.045, z);
  decal.receiveShadow = true;
  scene.add(decal);

  return [decal];
}

export function addTerrainCrater(scene, mapDef, x, z, opts = {}) {
  const tier = opts.tier ? CRATER_TIERS[opts.tier] : null;
  const minGap = opts.minGap ?? tier?.minGap ?? 55;
  const now = performance.now();
  if (now - lastCraterAt < minGap) return null;
  lastCraterAt = now;

  const radius = opts.radius ?? tier?.radius ?? 3.5;
  const heavy = opts.heavy ?? tier?.heavy ?? false;
  const y = sampleTerrainHeight(x, z, mapDef);
  const meshes = addCraterDecal(scene, mapDef, x, z, y, radius, heavy);

  const entry = {
    meshes,
    scene,
    kind: 'decal',
    x,
    z,
    radius,
    heavy,
  };
  craters.push(entry);

  return entry;
}

/** Crater + optional terrain mesh depression for explosions. */
export function addExplosionCrater(scene, mapDef, x, z, tier = 'medium', terrainMesh = null, opts = {}) {
  const profile = CRATER_TIERS[tier] ?? CRATER_TIERS.medium;
  const minGap = opts.minGap ?? profile.minGap;
  const now = performance.now();
  if (now - lastCraterAt < minGap) return null;
  lastCraterAt = now;

  const deformTerrain = opts.deformTerrain !== false;
  if (terrainMesh && deformTerrain) {
    deformTerrainAt(terrainMesh, mapDef, x, z, profile.radius, profile.depth);
  }

  const radius = opts.radius ?? profile.radius;
  const heavy = opts.heavy ?? profile.heavy;
  const y = sampleTerrainHeight(x, z, mapDef);
  const meshes = addCraterDecal(scene, mapDef, x, z, y, radius, heavy);

  const entry = {
    meshes,
    scene,
    kind: 'explosion',
    x,
    z,
    tier,
    radius,
    heavy,
    deformTerrain,
  };
  craters.push(entry);

  return entry;
}

export function serializeTerrainDamage() {
  return craters.map((entry) => ({
    kind: entry.kind,
    x: entry.x,
    z: entry.z,
    tier: entry.tier,
    radius: entry.radius,
    heavy: entry.heavy,
    deformTerrain: entry.deformTerrain,
  }));
}

export function restoreTerrainDamage(scene, mapDef, terrainMesh, savedCraters) {
  if (!Array.isArray(savedCraters)) return;
  for (const crater of savedCraters) {
    if (!Number.isFinite(crater?.x) || !Number.isFinite(crater?.z)) continue;
    if (crater.kind === 'decal') {
      addTerrainCrater(scene, mapDef, crater.x, crater.z, {
        minGap: 0,
        radius: crater.radius,
        heavy: crater.heavy,
      });
      continue;
    }
    addExplosionCrater(
      scene,
      mapDef,
      crater.x,
      crater.z,
      crater.tier ?? 'medium',
      terrainMesh,
      {
        minGap: 0,
        radius: crater.radius,
        heavy: crater.heavy,
        deformTerrain: crater.deformTerrain !== false,
      }
    );
  }
}

function disposeCrater(entry) {
  if (!entry) return;
  for (const mesh of entry.meshes ?? []) {
    entry.scene?.remove(mesh);
    mesh.geometry?.dispose();
    // Crater textures are shared by cached terrain/style variants. They are
    // disposed once in clearTerrainDamage, not when an individual decal ages out.
    mesh.material?.dispose();
  }
}

export function clearTerrainDamage() {
  while (craters.length) {
    disposeCrater(craters.shift());
  }
  for (const tex of texCache.values()) tex.dispose();
  texCache.clear();
}
