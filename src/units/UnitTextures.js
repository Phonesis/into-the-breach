import * as THREE from 'three';
import { publicUrl } from '../lib/publicUrl.js';
import { markSharedResource, registerBattleSceneCleanup } from '../world/SceneDispose.js';

const FACTIONS = ['germany', 'usa', 'uk', 'russia', 'japan'];

const TEXTURE_PATHS = {
  vehicle: {
    germany: 'textures/units/vehicles/germany-camo.jpg',
    usa: 'textures/units/vehicles/usa-camo.jpg',
    uk: 'textures/units/vehicles/uk-camo.jpg',
    russia: 'textures/units/vehicles/russia-camo.jpg',
  },
  infantry: {
    germany: 'textures/units/infantry/germany-uniform.jpg',
    usa: 'textures/units/infantry/usa-uniform.jpg',
    uk: 'textures/units/infantry/uk-uniform.jpg',
    russia: 'textures/units/infantry/russia-uniform.jpg',
  },
  ghillie: 'textures/units/infantry/sniper-ghillie.jpg',
};

const VEHICLE_TYPES = new Set([
  'tank',
  'tankDestroyer',
  'superHeavyTank',
  'armoredCar',
  'truck',
  'artillery',
  'antiTankGun',
]);

const INFANTRY_TYPES = new Set([
  'radioOperator',
  'infantry',
  'paratrooper',
  'machineGun',
  'mortar',
  'sniper',
  'medic',
  'engineer',
  'commander',
]);

const cache = new Map();
const infantryMatCache = new Map();
let loader = null;
let preloadPromise = null;
let fabricNormalMap = null;
let vehicleSurfaceBumpMap = null;
let vehicleSurfaceRoughnessMap = null;
let sharedInfantryGlobals = null;
const surfaceMapCache = new Map();
const vehicleMaterialCache = new Map();
// Keep just the most recent theatre's five CPU paint sheets across matches.
// GPU wrappers are battle-owned; stable uniforms and small surface maps are
// session-owned. Replaying the same map does not redraw the large canvases.
const vehicleCamoCanvasCache = new Map();
let activeVehicleTheatre = 'normandy';
export function getActiveVehicleTheatre() { return activeVehicleTheatre; }
let proceduralVehicleTexturesReady = false;

const THEATRE_CAMO = {
  normandy: {
    germany: { base: '#b49b58', accents: ['#52603b', '#76503a'], pattern: 'mottle' },
    usa: { base: '#4c5634', accents: ['#333a28', '#6a6548'], pattern: 'mottle' },
    uk: { base: '#4e563b', accents: ['#2e3428', '#716748'], pattern: 'mottle' },
    russia: { base: '#53623d', accents: ['#3a472f', '#75684b'], pattern: 'mottle' },
    japan: { base: '#6b663d', accents: ['#464a2c', '#82734b'], pattern: 'mottle' },
  },
  northAfrica: {
    germany: { base: '#b8945d', accents: ['#735f3f', '#d1b77d'], pattern: 'bands' },
    usa: { base: '#8a7b51', accents: ['#4c5235', '#b9a16c'], pattern: 'mottle' },
    uk: { base: '#c4aa72', accents: ['#514b3a', '#8f7650'], pattern: 'bands' },
    russia: { base: '#a18a59', accents: ['#596044', '#c5ab73'], pattern: 'mottle' },
    japan: { base: '#9b8651', accents: ['#5c5634', '#bd9d62'], pattern: 'mottle' },
  },
  easternFront: {
    germany: { base: '#a79558', accents: ['#4e5a39', '#6d4935'], pattern: 'bands' },
    usa: { base: '#4a5435', accents: ['#303828', '#6b6444'], pattern: 'mottle' },
    uk: { base: '#596044', accents: ['#343b2d', '#71644a'], pattern: 'mottle' },
    russia: { base: '#4d5f3a', accents: ['#34452e', '#72664a'], pattern: 'mottle' },
    japan: { base: '#66623c', accents: ['#3d472d', '#81704b'], pattern: 'mottle' },
  },
  italy: {
    germany: { base: '#aa955d', accents: ['#566044', '#75523c'], pattern: 'bands' },
    usa: { base: '#555b3b', accents: ['#373d2d', '#817052'], pattern: 'mottle' },
    uk: { base: '#625f43', accents: ['#3d4332', '#8b7753'], pattern: 'bands' },
    russia: { base: '#596044', accents: ['#39452f', '#806d4d'], pattern: 'mottle' },
    japan: { base: '#716641', accents: ['#42482e', '#8e7750'], pattern: 'mottle' },
  },
  farEast: {
    germany: { base: '#505637', accents: ['#2e3d28', '#716445'], pattern: 'mottle' },
    usa: { base: '#465334', accents: ['#2d3927', '#6c6846'], pattern: 'mottle' },
    uk: { base: '#4d5838', accents: ['#303b2b', '#746848'], pattern: 'mottle' },
    russia: { base: '#4b5937', accents: ['#2f402d', '#746548'], pattern: 'mottle' },
    japan: { base: '#615f39', accents: ['#34432b', '#806d45'], pattern: 'mottle' },
  },
};

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function stringSeed(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createTheatreCamoTexture(theatreId, factionId) {
  if (typeof document === 'undefined') return null;
  const canvasKey = `${theatreId}:${factionId}`;
  const cachedCanvas = vehicleCamoCanvasCache.get(canvasKey);
  if (cachedCanvas) return createTheatreTexture(cachedCanvas);
  const spec = THEATRE_CAMO[theatreId]?.[factionId] ?? THEATRE_CAMO.normandy.germany;
  // Only the active theatre is generated (five faction sheets), so the paint
  // can stay sharp without pre-allocating every theatre at startup.
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const random = seededRandom(stringSeed(`${theatreId}:${factionId}`));

  ctx.fillStyle = spec.base;
  ctx.fillRect(0, 0, size, size);

  // Preserve recognizable factory olive finishes on Allied vehicles, while
  // German/Japanese disruptive coats retain distinct green/brown paint fields.
  // The edges are irregular and softly sprayed rather than translucent blobs.
  const camoStrength = factionId === 'germany' ? 0.9
    : factionId === 'japan' ? 0.84
      : theatreId === 'northAfrica' && factionId === 'uk' ? 0.86 : 0.32;
  ctx.filter = 'blur(2px)';
  for (let i = 0; i < 19; i++) {
    const x = random() * size;
    const y = random() * size;
    const rx = 80 + random() * (spec.pattern === 'bands' ? 175 : 135);
    const ry = 65 + random() * 115;
    const phase = random() * Math.PI * 2;
    const points = Array.from({ length: 16 }, (_, n) => {
      const angle = n / 16 * Math.PI * 2;
      const radius = 0.62 + random() * 0.52;
      return [Math.cos(angle + phase) * rx * radius, Math.sin(angle + phase) * ry * radius];
    });
    ctx.fillStyle = spec.accents[i % spec.accents.length];
    ctx.globalAlpha = camoStrength * (0.88 + random() * 0.12);
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
      if (x + dx + rx < 0 || x + dx - rx > size || y + dy + ry < 0 || y + dy - ry > size) continue;
      ctx.beginPath();
      for (let n = 0; n < points.length; n++) {
        const p = points[n], next = points[(n + 1) % points.length];
        const prev = points[(n + points.length - 1) % points.length];
        if (!n) ctx.moveTo(x + dx + (prev[0] + p[0]) / 2, y + dy + (prev[1] + p[1]) / 2);
        ctx.quadraticCurveTo(x + dx + p[0], y + dy + p[1],
          x + dx + (p[0] + next[0]) / 2, y + dy + (p[1] + next[1]) / 2);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.filter = 'none';

  // Uneven sun-fading and ingrained dust soften the coat at model scale, while
  // the existing small paint chips remain available at close camera distances.
  ctx.globalAlpha = 1;
  for (let i = 0; i < 12; i++) {
    const x = random() * size;
    const y = random() * size;
    const radius = 130 + random() * 240;
    const fade = ctx.createRadialGradient(x, y, 0, x, y, radius);
    const alpha = theatreId === 'northAfrica' ? 0.095 : 0.055;
    fade.addColorStop(0, `rgba(192, 181, 148, ${alpha})`);
    fade.addColorStop(1, 'rgba(192, 181, 148, 0)');
    ctx.fillStyle = fade;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // Fine paint modulation breaks up the uniform digital fill without making
  // the finish noisy at normal RTS camera distances.
  ctx.globalAlpha = 0.055;
  for (let i = 0; i < 9200; i++) {
    const shade = 96 + Math.floor(random() * 100);
    ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
    const s = 0.5 + random() * 1.35;
    ctx.fillRect(random() * size, random() * size, s, s);
  }

  // Dust, faded paint, chips, scratches, and rain streaks give the surfaces a
  // field-used finish. These marks remain crisp enough to read on close zoom.
  ctx.globalAlpha = theatreId === 'northAfrica' ? 0.18 : 0.1;
  ctx.fillStyle = theatreId === 'northAfrica' ? '#e0c48f' : '#b5a47a';
  for (let i = 0; i < 1150; i++) {
    const s = 0.7 + random() * 3.2;
    ctx.fillRect(random() * size, random() * size, s, s * (0.45 + random()));
  }
  ctx.globalAlpha = 0.24;
  ctx.strokeStyle = '#c4b593';
  ctx.lineCap = 'round';
  for (let i = 0; i < 72; i++) {
    const x = random() * size;
    const y = random() * size;
    const len = 9 + random() * 42;
    ctx.lineWidth = 0.7 + random() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (random() - 0.5) * len * 0.35, y + len);
    ctx.stroke();
  }
  // Small exposed primer chips with a lighter broken paint edge. They remain
  // sparse so a vehicle reads as maintained equipment, not uniformly rusty.
  ctx.globalAlpha = 0.48;
  for (let i = 0; i < 110; i++) {
    const x = random() * size;
    const y = random() * size;
    const width = 1.3 + random() * 4;
    const height = 0.8 + random() * 2;
    ctx.fillStyle = '#baaa84';
    ctx.fillRect(x - 0.6, y - 0.6, width + 1.2, height + 1.2);
    ctx.fillStyle = '#423c31';
    ctx.fillRect(x, y, width, height);
  }
  ctx.globalAlpha = 0.17;
  ctx.strokeStyle = '#302e25';
  for (let i = 0; i < 58; i++) {
    const x = random() * size;
    ctx.lineWidth = 1 + random() * 2;
    ctx.beginPath();
    ctx.moveTo(x, random() * size * 0.7);
    ctx.lineTo(x + (random() - 0.5) * 8, size);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  vehicleCamoCanvasCache.set(canvasKey, canvas);
  return createTheatreTexture(canvas);
}

function createTheatreTexture(canvas) {
  const texture = markSharedResource(new THREE.CanvasTexture(canvas));
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.2, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function releaseTheatreResources(keepTheatre = null) {
  for (const [key, texture] of cache) {
    if (!key.startsWith('vehicle:') || key.split(':').length !== 3) continue;
    if (keepTheatre && key.startsWith(`vehicle:${keepTheatre}:`)) continue;
    texture.dispose();
    cache.delete(key);
  }
  for (const [key, material] of vehicleMaterialCache) {
    if (!key.startsWith('canvas:') || key === `canvas:${keepTheatre}`) continue;
    material.dispose();
    vehicleMaterialCache.delete(key);
  }
}

registerBattleSceneCleanup(() => releaseTheatreResources());

function ensureTheatreCamoTextures(theatreId) {
  if (!proceduralVehicleTexturesReady) return;
  for (const factionId of FACTIONS) {
    const key = `vehicle:${theatreId}:${factionId}`;
    if (cache.has(key)) continue;
    const texture = createTheatreCamoTexture(theatreId, factionId);
    if (texture) cache.set(key, texture);
  }
}

export function setActiveVehicleTheatre(theatreId) {
  activeVehicleTheatre = THEATRE_CAMO[theatreId] ? theatreId : 'normandy';
  // Game.startGame selects the theatre after the previous battle is torn down.
  // Also evict the default paint generated by menu preload on the first match.
  releaseTheatreResources(activeVehicleTheatre);
  for (const key of vehicleCamoCanvasCache.keys()) {
    if (!key.startsWith(`${activeVehicleTheatre}:`)) vehicleCamoCanvasCache.delete(key);
  }
  ensureTheatreCamoTextures(activeVehicleTheatre);
}

const FACTION_WEBBING = {
  germany: 0x4a4035,
  usa: 0x5a4a38,
  uk: 0x4a4438,
  russia: 0x3d3830,
  japan: 0x5a4d32,
};

const FACTION_HELMETS = {
  germany: 0x454b40,
  usa: 0x555b38,
  uk: 0x666044,
  russia: 0x50583b,
  japan: 0x6a683f,
};

const FACTION_UNIFORM_COLOR = {
  germany: 0x4b5143,
  usa: 0x52583a,
  uk: 0x5d5940,
  russia: 0x536044,
  japan: 0x6b6842,
};

function configureTexture(tex, repeat) {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return markSharedResource(tex);
}

function loadTexture(path, repeat) {
  if (!loader) loader = new THREE.TextureLoader();
  return new Promise((resolve, reject) => {
    loader.load(publicUrl(path), (tex) => resolve(configureTexture(tex, repeat)), undefined, reject);
  });
}

export function preloadUnitTextures() {
  if (preloadPromise) return preloadPromise;

  const tasks = [];
  for (const faction of FACTIONS) {
    const vehiclePath = TEXTURE_PATHS.vehicle[faction];
    const infantryPath = TEXTURE_PATHS.infantry[faction];
    if (vehiclePath) {
      tasks.push(
        loadTexture(vehiclePath, [2, 1.5]).then((tex) =>
          cache.set(`vehicle:${faction}`, tex)
        )
      );
    }
    if (infantryPath) {
      tasks.push(
        loadTexture(infantryPath, [1.5, 1.5]).then((tex) =>
          cache.set(`infantry:${faction}`, tex)
        )
      );
    }
  }
  tasks.push(loadTexture(TEXTURE_PATHS.ghillie, [2, 2]).then((tex) => cache.set('ghillie', tex)));

  preloadPromise = Promise.all(tasks).then(() => {
    proceduralVehicleTexturesReady = true;
    ensureTheatreCamoTextures(activeVehicleTheatre);
  });
  return preloadPromise;
}

export function getBodyTexture(factionId, unitType) {
  if (INFANTRY_TYPES.has(unitType)) {
    return cache.get(`infantry:${factionId}`) ?? null;
  }
  if (VEHICLE_TYPES.has(unitType)) {
    return (
      cache.get(`vehicle:${activeVehicleTheatre}:${factionId}`) ??
      cache.get(`vehicle:${factionId}`) ??
      null
    );
  }
  return null;
}

export function getVehicleCamoTexture(factionId) {
  return (
    cache.get(`vehicle:${activeVehicleTheatre}:${factionId}`) ??
    cache.get(`vehicle:${factionId}`) ??
    null
  );
}

/**
 * Small, shared, seamless material sheets. Broad variation survives RTS zoom;
 * fine pores and grain resolve as the camera approaches. Data maps stay linear.
 */
function getSurfaceMaps(kind) {
  if (surfaceMapCache.has(kind)) return surfaceMapCache.get(kind);
  const size = 256;
  const bump = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  const color = new Uint8Array(size * size * 4);
  const random = seededRandom(stringSeed(`surface:${kind}`));
  const tau = Math.PI * 2;
  const clampByte = (n) => Math.round(Math.max(0, Math.min(255, n)));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const grain = random() - 0.5;
      const broad = Math.sin(u * tau * 3 + Math.sin(v * tau * 2)) *
        Math.cos(v * tau * 4 + Math.sin(u * tau));
      let height = 128 + grain * 18 + broad * 13;
      let rough = 222 + broad * 19 + grain * 12;
      let shade = 235 + broad * 9 + grain * 8;
      if (kind === 'rubber') {
        // Fine ribs break the highlight without suggesting shiny bare metal.
        const ribs = Math.pow(Math.max(0, Math.cos(u * tau * 32)), 8);
        height = 108 + ribs * 38 + grain * 14;
        rough = 240 + broad * 9;
        shade = 216 + broad * 18 + ribs * 8;
      } else if (kind === 'wood') {
        const rings = Math.sin(u * tau * 12 + Math.sin(v * tau) * 1.6 + Math.sin(u * tau * 3));
        height = 128 + rings * 18 + grain * 10;
        rough = 215 + rings * 12;
        shade = 216 + rings * 25 + broad * 8;
      } else if (kind === 'leather') {
        height = 128 + grain * 46 + broad * 10;
        rough = 216 + broad * 24;
        shade = 222 + broad * 15 + grain * 12;
      } else if (kind === 'fabric') {
        const thread = Math.sin(u * tau * 48) * Math.cos(v * tau * 48);
        height = 128 + thread * 25 + grain * 6;
        rough = 243 + broad * 9;
        shade = 237 + broad * 10 + thread * 5;
      } else if (kind === 'track') {
        const worn = Math.pow(Math.max(0, Math.sin(v * tau * 12)), 8);
        height = 116 + grain * 36 + broad * 20 + worn * 20;
        rough = 218 + broad * 23 - worn * 48;
        shade = 207 + broad * 24 + worn * 24;
      }
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        bump[i + c] = clampByte(height);
        roughness[i + c] = clampByte(rough);
        color[i + c] = clampByte(shade);
      }
      bump[i + 3] = roughness[i + 3] = color[i + 3] = 255;
    }
  }
  const make = (data, isColor = false) => {
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.name = `unit-${kind}-${isColor ? 'color' : data === bump ? 'bump' : 'roughness'}`;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    texture.anisotropy = 8;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    if (isColor) texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return markSharedResource(texture);
  };
  const maps = { bump: make(bump), roughness: make(roughness), color: make(color, true) };
  surfaceMapCache.set(kind, maps);
  return maps;
}

/** Fine cast/rolled steel texture, without repeating arbitrary weld lines. */
export function getVehicleSurfaceBumpMap() {
  return vehicleSurfaceBumpMap ??= getSurfaceMaps('steel').bump;
}

/** Matt paint with broad, subtle variation instead of a uniform plastic gloss. */
export function getVehicleSurfaceRoughnessMap() {
  return vehicleSurfaceRoughnessMap ??= getSurfaceMaps('steel').roughness;
}

export function getVehicleRubberMaterial() {
  if (vehicleMaterialCache.has('rubber')) return vehicleMaterialCache.get('rubber');
  const maps = getSurfaceMaps('rubber');
  const material = new THREE.MeshStandardMaterial({
    color: 0x30312d, map: maps.color, bumpMap: maps.bump, bumpScale: 0.012,
    roughnessMap: maps.roughness, roughness: 1, metalness: 0,
  });
  material.name = 'weathered-tyre-rubber';
  vehicleMaterialCache.set('rubber', material);
  return markSharedResource(material);
}

export function getVehicleTrackMaterial() {
  if (vehicleMaterialCache.has('track')) return vehicleMaterialCache.get('track');
  const maps = getSurfaceMaps('track');
  const material = new THREE.MeshStandardMaterial({
    color: 0x555047, map: maps.color, bumpMap: maps.bump, bumpScale: 0.018,
    roughnessMap: maps.roughness, roughness: 0.92, metalness: 0.42,
  });
  material.name = 'worn-track-steel';
  vehicleMaterialCache.set('track', material);
  return markSharedResource(material);
}

export function getVehicleCanvasMaterial() {
  const key = `canvas:${activeVehicleTheatre}`;
  if (vehicleMaterialCache.has(key)) return vehicleMaterialCache.get(key);
  const maps = getSurfaceMaps('fabric');
  const material = new THREE.MeshStandardMaterial({
    color: activeVehicleTheatre === 'northAfrica' ? 0x978466 : 0x706e50,
    map: maps.color, normalMap: getFabricNormalMap(), normalScale: new THREE.Vector2(0.6, 0.6),
    roughnessMap: maps.roughness, roughness: 1, metalness: 0,
  });
  material.name = 'weathered-canvas';
  vehicleMaterialCache.set(key, material);
  return markSharedResource(material);
}

export function getInfantryUniformTexture(factionId) {
  return cache.get(`infantry:${factionId}`) ?? null;
}

/** MeshStandardMaterial with optional tiled faction camo (clone texture per mesh). */
export function createCamoMaterial(baseColor, camoTex, repeat = [2, 1.5], opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color: camoTex ? 0xffffff : baseColor,
    roughness: opts.rough ?? 0.82,
    metalness: opts.metal ?? 0,
    emissive: 0x000000,
    emissiveIntensity: 0,
  });
  if (camoTex) {
    const tex = camoTex.clone();
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
    mat.map = tex;
  }
  return mat;
}

export function getGhillieTexture() {
  return cache.get('ghillie') ?? null;
}

const GHILLIE_SPECS = {
  uk: {
    base: '#5a5434',
    accents: ['#3d4a2c', '#6b5a38', '#4a5230', '#7a6a44', '#2e3824'],
    pattern: 'hessian',
  },
  usa: {
    base: '#4c5634',
    accents: ['#3a422c', '#6a6440', '#5a5238', '#2f3626'],
    pattern: 'scrim',
  },
  germany: {
    base: '#5a5238',
    accents: ['#3d4530', '#6b4a32', '#4a5534', '#7a6a48'],
    pattern: 'splinter',
  },
  russia: {
    base: '#6b6840',
    accents: ['#4a5534', '#8a7a4c', '#3d4a30', '#5c5638'],
    pattern: 'amoeba',
  },
  japan: {
    base: '#6b663d',
    accents: ['#4a5230', '#8a7a48', '#3a4528', '#5c5634'],
    pattern: 'sedge',
  },
};

function createFactionGhillieTexture(factionId) {
  if (typeof document === 'undefined') return null;
  const spec = GHILLIE_SPECS[factionId] ?? GHILLIE_SPECS.uk;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const random = seededRandom(stringSeed(`ghillie:${factionId}`));

  ctx.fillStyle = spec.base;
  ctx.fillRect(0, 0, size, size);

  if (spec.pattern === 'splinter') {
    ctx.lineJoin = 'miter';
    for (let i = 0; i < 42; i++) {
      ctx.fillStyle = spec.accents[i % spec.accents.length];
      ctx.globalAlpha = 0.55 + random() * 0.3;
      ctx.beginPath();
      const x = random() * size;
      const y = random() * size;
      ctx.moveTo(x, y);
      ctx.lineTo(x + (random() - 0.35) * 180, y + (random() - 0.5) * 70);
      ctx.lineTo(x + (random() - 0.5) * 90, y + 40 + random() * 110);
      ctx.closePath();
      ctx.fill();
    }
  } else if (spec.pattern === 'amoeba') {
    ctx.filter = 'blur(3px)';
    for (let i = 0; i < 28; i++) {
      ctx.fillStyle = spec.accents[i % spec.accents.length];
      ctx.globalAlpha = 0.5 + random() * 0.28;
      ctx.beginPath();
      ctx.ellipse(
        random() * size,
        random() * size,
        36 + random() * 70,
        22 + random() * 48,
        random() * Math.PI,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.filter = 'none';
  } else if (spec.pattern === 'sedge') {
    ctx.lineCap = 'round';
    for (let i = 0; i < 220; i++) {
      ctx.strokeStyle = spec.accents[i % spec.accents.length];
      ctx.globalAlpha = 0.45 + random() * 0.35;
      ctx.lineWidth = 1.2 + random() * 3.4;
      const x = random() * size;
      const y = random() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + (random() - 0.5) * 18, y - 18, x + (random() - 0.5) * 10, y - 28 - random() * 36);
      ctx.stroke();
    }
  } else if (spec.pattern === 'scrim') {
    ctx.filter = 'blur(1px)';
    for (let i = 0; i < 48; i++) {
      ctx.fillStyle = spec.accents[i % spec.accents.length];
      ctx.globalAlpha = 0.4 + random() * 0.25;
      ctx.fillRect(random() * size, random() * size, 18 + random() * 70, 8 + random() * 22);
    }
    ctx.filter = 'none';
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = '#2a2e22';
    ctx.lineWidth = 2;
    for (let x = 0; x < size; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
    for (let y = 0; y < size; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
  } else {
    ctx.filter = 'blur(1.4px)';
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = spec.accents[i % spec.accents.length];
      ctx.globalAlpha = 0.42 + random() * 0.3;
      const x = random() * size;
      ctx.fillRect(x, 0, 6 + random() * 16, size);
    }
    ctx.filter = 'none';
  }

  ctx.globalAlpha = 0.1;
  for (let i = 0; i < 2400; i++) {
    const shade = 80 + Math.floor(random() * 90);
    ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
    ctx.fillRect(random() * size, random() * size, 1 + random() * 2, 1 + random() * 3);
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.2, 2.2);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return markSharedResource(texture);
}

export function getFactionGhillieTexture(factionId) {
  const key = `ghillie:${factionId}`;
  if (cache.has(key)) return cache.get(key);
  const generated = createFactionGhillieTexture(factionId);
  if (generated) {
    cache.set(key, generated);
    return generated;
  }
  return cache.get('ghillie') ?? null;
}

/** Woven threads and soft cloth creases, shared by uniforms and canvas. */
export function getFabricNormalMap() {
  if (fabricNormalMap) return fabricNormalMap;
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const tau = Math.PI * 2;
  const weave = (u, v) =>
    Math.sin(u * tau * 48) * Math.cos(v * tau * 48) * 0.0007 +
    Math.sin(u * tau * 3 + Math.sin(v * tau) * 0.6) * 0.025 +
    Math.sin(v * tau * 5 + Math.sin(u * tau * 2) * 0.4) * 0.009;
  const epsilon = 1 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const dx = (weave(u + epsilon, v) - weave(u - epsilon, v)) / (2 * epsilon);
      const dy = (weave(u, v + epsilon) - weave(u, v - epsilon)) / (2 * epsilon);
      const length = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      data[i] = Math.round(127.5 - dx / length * 127.5);
      data[i + 1] = Math.round(127.5 - dy / length * 127.5);
      data[i + 2] = Math.round(127.5 + 1 / length * 127.5);
      data[i + 3] = 255;
    }
  }
  fabricNormalMap = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  fabricNormalMap.name = 'woven-cloth-and-creases';
  fabricNormalMap.wrapS = fabricNormalMap.wrapT = THREE.RepeatWrapping;
  fabricNormalMap.repeat.set(1, 1);
  fabricNormalMap.anisotropy = 8;
  fabricNormalMap.minFilter = THREE.LinearMipmapLinearFilter;
  fabricNormalMap.magFilter = THREE.LinearFilter;
  fabricNormalMap.generateMipmaps = true;
  fabricNormalMap.needsUpdate = true;
  return markSharedResource(fabricNormalMap);
}

function getSharedInfantryGlobals() {
  if (sharedInfantryGlobals) return sharedInfantryGlobals;
  const steel = getSurfaceMaps('steel');
  const wood = getSurfaceMaps('wood');
  const leather = getSurfaceMaps('leather');
  sharedInfantryGlobals = {
    dark: new THREE.MeshStandardMaterial({ color: 0x252725, metalness: 0.68, roughness: 0.62, roughnessMap: steel.roughness, bumpMap: steel.bump, bumpScale: 0.003 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xc8a882, roughness: 0.8, metalness: 0 }),
    helmetUk: new THREE.MeshStandardMaterial({ color: 0x4a4a48, roughness: 0.94, metalness: 0.08, roughnessMap: steel.roughness, bumpMap: steel.bump, bumpScale: 0.004 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x6a7078, metalness: 0.72, roughness: 0.56, roughnessMap: steel.roughness }),
    wood: new THREE.MeshStandardMaterial({ color: 0x805339, map: wood.color, roughness: 0.9, roughnessMap: wood.roughness, bumpMap: wood.bump, bumpScale: 0.004, metalness: 0 }),
    leather: new THREE.MeshStandardMaterial({ color: 0x3b3329, map: leather.color, roughness: 0.94, roughnessMap: leather.roughness, bumpMap: leather.bump, bumpScale: 0.004, metalness: 0 }),
  };
  Object.values(sharedInfantryGlobals).forEach(markSharedResource);
  return sharedInfantryGlobals;
}

/**
 * Cached per-faction infantry materials (shared across all squad soldiers).
 * @returns {{ body, detail, dark, skin, helmet, helmetUk, webbing, metal, wood, leather }}
 */
export function getInfantryMaterials(factionId) {
  if (infantryMatCache.has(factionId)) return infantryMatCache.get(factionId);

  const uniformTex = cache.get(`infantry:${factionId}`) ?? null;
  const normal = getFabricNormalMap();
  const globals = getSharedInfantryGlobals();

  const body = new THREE.MeshStandardMaterial({
    color: uniformTex ? 0xffffff : (FACTION_UNIFORM_COLOR[factionId] ?? 0x4a5a38),
    // Three.js accepts null for an absent texture; passing undefined emits a
    // material warning when a commander is created before its faction texture
    // has populated the cache (most visible on first-load Far East battles).
    map: uniformTex,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughness: 1,
    roughnessMap: getSurfaceMaps('fabric').roughness,
    metalness: 0,
  });

  const mats = {
    body,
    detail: body,
    dark: globals.dark,
    skin: globals.skin,
    helmet: new THREE.MeshStandardMaterial({
      color: FACTION_HELMETS[factionId] ?? FACTION_HELMETS.germany,
      roughness: 0.96,
      roughnessMap: getVehicleSurfaceRoughnessMap(),
      bumpMap: getVehicleSurfaceBumpMap(),
      bumpScale: 0.004,
      metalness: 0.08,
    }),
    helmetUk: globals.helmetUk,
    webbing: new THREE.MeshStandardMaterial({
      color: FACTION_WEBBING[factionId] ?? 0x4a4035,
      map: getSurfaceMaps('fabric').color,
      bumpMap: getSurfaceMaps('fabric').bump,
      bumpScale: 0.004,
      roughness: 1,
      metalness: 0,
    }),
    metal: globals.metal,
    wood: globals.wood,
    leather: globals.leather,
  };

  infantryMatCache.set(factionId, mats);
  Object.values(mats).forEach(markSharedResource);
  return mats;
}

export function unitTexturesReady() {
  return proceduralVehicleTexturesReady;
}
