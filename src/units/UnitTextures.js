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
let sharedInfantryGlobals = null;

const FACTION_WEBBING = {
  germany: 0x4a4035,
  usa: 0x5a4a38,
  uk: 0x4a4438,
  russia: 0x3d3830,
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

  preloadPromise = Promise.all(tasks).then(() => {});
  return preloadPromise;
}

export function getBodyTexture(factionId, unitType) {
  if (INFANTRY_TYPES.has(unitType)) {
    return cache.get(`infantry:${factionId}`) ?? null;
  }
  if (VEHICLE_TYPES.has(unitType)) {
    return cache.get(`vehicle:${factionId}`) ?? null;
  }
  return null;
}

export function getVehicleCamoTexture(factionId) {
  return cache.get(`vehicle:${factionId}`) ?? null;
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
  };
  return sharedInfantryGlobals;
}

/**
 * Cached per-faction infantry materials (shared across all squad soldiers).
 * @returns {{ body, detail, dark, skin, helmetUk, webbing, metal }}
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
    helmetUk: globals.helmetUk,
    webbing: new THREE.MeshStandardMaterial({
      color: FACTION_WEBBING[factionId] ?? 0x4a4035,
      roughness: 0.9,
      metalness: 0.02,
    }),
    metal: globals.metal,
  };

  infantryMatCache.set(factionId, mats);
  return mats;
}

export function unitTexturesReady() {
  return cache.size >= FACTIONS.length * 2 + 1;
}