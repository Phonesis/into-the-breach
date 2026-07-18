import * as THREE from 'three';
import { publicUrl } from '../lib/publicUrl.js';

const FACTIONS = ['germany', 'usa', 'uk', 'russia'];

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
  'artillery',
  'antiTankGun',
]);

const INFANTRY_TYPES = new Set([
  'infantry',
  'paratrooper',
  'machineGun',
  'mortar',
  'sniper',
  'medic',
  'engineer',
]);

const cache = new Map();
const infantryMatCache = new Map();
let loader = null;
let preloadPromise = null;
let fabricNormalMap = null;
let vehicleSurfaceBumpMap = null;
let sharedInfantryGlobals = null;
let activeVehicleTheatre = 'normandy';

const THEATRE_CAMO = {
  normandy: {
    germany: { base: '#b49b58', accents: ['#52603b', '#76503a'], pattern: 'mottle' },
    usa: { base: '#4c5634', accents: ['#333a28', '#6a6548'], pattern: 'mottle' },
    uk: { base: '#4e563b', accents: ['#2e3428', '#716748'], pattern: 'mottle' },
    russia: { base: '#53623d', accents: ['#3a472f', '#75684b'], pattern: 'mottle' },
  },
  northAfrica: {
    germany: { base: '#b8945d', accents: ['#735f3f', '#d1b77d'], pattern: 'bands' },
    usa: { base: '#8a7b51', accents: ['#4c5235', '#b9a16c'], pattern: 'mottle' },
    uk: { base: '#c4aa72', accents: ['#514b3a', '#8f7650'], pattern: 'bands' },
    russia: { base: '#a18a59', accents: ['#596044', '#c5ab73'], pattern: 'mottle' },
  },
  easternFront: {
    germany: { base: '#a79558', accents: ['#4e5a39', '#6d4935'], pattern: 'bands' },
    usa: { base: '#4a5435', accents: ['#303828', '#6b6444'], pattern: 'mottle' },
    uk: { base: '#596044', accents: ['#343b2d', '#71644a'], pattern: 'mottle' },
    russia: { base: '#4d5f3a', accents: ['#34452e', '#72664a'], pattern: 'mottle' },
  },
  italy: {
    germany: { base: '#aa955d', accents: ['#566044', '#75523c'], pattern: 'bands' },
    usa: { base: '#555b3b', accents: ['#373d2d', '#817052'], pattern: 'mottle' },
    uk: { base: '#625f43', accents: ['#3d4332', '#8b7753'], pattern: 'bands' },
    russia: { base: '#596044', accents: ['#39452f', '#806d4d'], pattern: 'mottle' },
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
  const spec = THEATRE_CAMO[theatreId]?.[factionId] ?? THEATRE_CAMO.normandy.germany;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const random = seededRandom(stringSeed(`${theatreId}:${factionId}`));

  ctx.fillStyle = spec.base;
  ctx.fillRect(0, 0, size, size);

  if (spec.pattern === 'bands') {
    ctx.lineCap = 'round';
    ctx.filter = 'blur(3px)';
    for (let i = 0; i < 18; i++) {
      ctx.strokeStyle = spec.accents[i % spec.accents.length];
      ctx.globalAlpha = 0.58 + random() * 0.12;
      ctx.lineWidth = 16 + random() * 24;
      ctx.beginPath();
      ctx.moveTo(-60, random() * size);
      const midY = random() * size;
      ctx.bezierCurveTo(size * 0.2, random() * size, size * 0.68, midY, size + 60, random() * size);
      ctx.stroke();
    }
    ctx.filter = 'none';
  } else {
    ctx.filter = 'blur(4px)';
    for (let i = 0; i < 48; i++) {
      const x = random() * size;
      const y = random() * size;
      const rx = 16 + random() * 52;
      const ry = 10 + random() * 34;
      ctx.fillStyle = spec.accents[i % spec.accents.length];
      ctx.globalAlpha = 0.52 + random() * 0.18;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.filter = 'none';
  }

  // Dust, faded paint, chips, and vertical grime keep the finish matte and field-used.
  ctx.globalAlpha = theatreId === 'northAfrica' ? 0.2 : 0.12;
  ctx.fillStyle = theatreId === 'northAfrica' ? '#e0c48f' : '#b5a47a';
  for (let i = 0; i < 420; i++) {
    const s = 1 + random() * 4;
    ctx.fillRect(random() * size, random() * size, s, s * (0.45 + random()));
  }
  ctx.globalAlpha = 0.1;
  ctx.strokeStyle = '#1f241d';
  for (let i = 0; i < 36; i++) {
    const x = random() * size;
    ctx.lineWidth = 1 + random() * 2;
    ctx.beginPath();
    ctx.moveTo(x, random() * size * 0.7);
    ctx.lineTo(x + (random() - 0.5) * 8, size);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 1.5);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createAllTheatreCamoTextures() {
  for (const theatreId of Object.keys(THEATRE_CAMO)) {
    for (const factionId of FACTIONS) {
      const texture = createTheatreCamoTexture(theatreId, factionId);
      if (texture) cache.set(`vehicle:${theatreId}:${factionId}`, texture);
    }
  }
}

export function setActiveVehicleTheatre(theatreId) {
  activeVehicleTheatre = THEATRE_CAMO[theatreId] ? theatreId : 'normandy';
}

const FACTION_WEBBING = {
  germany: 0x4a4035,
  usa: 0x5a4a38,
  uk: 0x4a4438,
  russia: 0x3d3830,
};

const FACTION_HELMETS = {
  germany: 0x454b40,
  usa: 0x555b38,
  uk: 0x666044,
  russia: 0x50583b,
};

function configureTexture(tex, repeat) {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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
    tasks.push(
      loadTexture(TEXTURE_PATHS.vehicle[faction], [2, 1.5]).then((tex) =>
        cache.set(`vehicle:${faction}`, tex)
      )
    );
    tasks.push(
      loadTexture(TEXTURE_PATHS.infantry[faction], [1.5, 1.5]).then((tex) =>
        cache.set(`infantry:${faction}`, tex)
      )
    );
  }
  tasks.push(loadTexture(TEXTURE_PATHS.ghillie, [2, 2]).then((tex) => cache.set('ghillie', tex)));

  preloadPromise = Promise.all(tasks).then(() => createAllTheatreCamoTextures());
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

/** Fine rolled-steel grain, weld scarring, chips, and accumulated grit. */
export function getVehicleSurfaceBumpMap() {
  if (vehicleSurfaceBumpMap || typeof document === 'undefined') return vehicleSurfaceBumpMap;
  const size = 192;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const random = seededRandom(0x19441945);
  for (let i = 0; i < image.data.length; i += 4) {
    const grain = Math.round(116 + random() * 28 + (random() > 0.985 ? 55 : 0));
    image.data[i] = grain;
    image.data[i + 1] = grain;
    image.data[i + 2] = grain;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  ctx.globalAlpha = 0.38;
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 2;
  for (let y = 24; y < size; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= size; x += 8) ctx.lineTo(x, y + Math.sin(x * 0.42) * 1.2);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3.5, 3.5);
  vehicleSurfaceBumpMap = texture;
  return vehicleSurfaceBumpMap;
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

/** Procedural weave normal — generated once, shared by all infantry uniforms. */
export function getFabricNormalMap() {
  if (fabricNormalMap) return fabricNormalMap;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);

  const weave = (u, v) => {
    const warp = Math.sin(u * Math.PI * 28) * 0.55;
    const weft = Math.sin(v * Math.PI * 28) * 0.55;
    const thread = Math.sin((u + v) * Math.PI * 14) * 0.25;
    return warp + weft + thread;
  };

  const strength = 3.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const dx = (weave(u + 0.004, v) - weave(u - 0.004, v)) * strength;
      const dy = (weave(u, v + 0.004) - weave(u, v - 0.004)) * strength;
      const i = (y * size + x) * 4;
      img.data[i] = Math.min(255, Math.max(0, 128 + dx * 70));
      img.data[i + 1] = Math.min(255, Math.max(0, 128 + dy * 70));
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  fabricNormalMap = new THREE.CanvasTexture(canvas);
  fabricNormalMap.wrapS = THREE.RepeatWrapping;
  fabricNormalMap.wrapT = THREE.RepeatWrapping;
  fabricNormalMap.repeat.set(3, 3);
  return fabricNormalMap;
}

function getSharedInfantryGlobals() {
  if (sharedInfantryGlobals) return sharedInfantryGlobals;
  sharedInfantryGlobals = {
    dark: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.5, roughness: 0.55 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xc8a882, roughness: 0.8, metalness: 0 }),
    helmetUk: new THREE.MeshStandardMaterial({ color: 0x4a4a48, roughness: 0.75, metalness: 0.1 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x6a7078, metalness: 0.72, roughness: 0.45 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x70472d, roughness: 0.8, metalness: 0 }),
    leather: new THREE.MeshStandardMaterial({ color: 0x29251f, roughness: 0.92, metalness: 0 }),
  };
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
    color: uniformTex ? 0xffffff : 0x4a5a38,
    map: uniformTex ?? undefined,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.32, 0.32),
    roughness: 0.86,
    metalness: 0.02,
  });

  const mats = {
    body,
    detail: body,
    dark: globals.dark,
    skin: globals.skin,
    helmet: new THREE.MeshStandardMaterial({
      color: FACTION_HELMETS[factionId] ?? FACTION_HELMETS.germany,
      roughness: 0.78,
      metalness: 0.12,
    }),
    helmetUk: globals.helmetUk,
    webbing: new THREE.MeshStandardMaterial({
      color: FACTION_WEBBING[factionId] ?? 0x4a4035,
      roughness: 0.9,
      metalness: 0.02,
    }),
    metal: globals.metal,
    wood: globals.wood,
    leather: globals.leather,
  };

  infantryMatCache.set(factionId, mats);
  return mats;
}

export function unitTexturesReady() {
  return cache.size >= FACTIONS.length * 2 + 1;
}
