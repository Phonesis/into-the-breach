import * as THREE from 'three';
import { publicUrl } from '../lib/publicUrl.js';

const FACTIONS = ['germany', 'usa', 'uk'];

const TEXTURE_PATHS = {
  vehicle: {
    germany: 'textures/units/vehicles/germany-camo.jpg',
    usa: 'textures/units/vehicles/usa-camo.jpg',
    uk: 'textures/units/vehicles/uk-camo.jpg',
  },
  infantry: {
    germany: 'textures/units/infantry/germany-uniform.jpg',
    usa: 'textures/units/infantry/usa-uniform.jpg',
    uk: 'textures/units/infantry/uk-uniform.jpg',
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

const INFANTRY_TYPES = new Set(['infantry', 'machineGun', 'mortar', 'sniper', 'medic', 'engineer']);

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

export function getGhillieTexture() {
  return cache.get('ghillie') ?? null;
}

export function unitTexturesReady() {
  return cache.size >= FACTIONS.length * 2 + 1;
}