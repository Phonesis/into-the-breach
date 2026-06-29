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
let loader = null;
let preloadPromise = null;

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

export function unitTexturesReady() {
  return cache.size >= FACTIONS.length * 2 + 1;
}