import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createServer } from 'vite';

// Vite's SSR loader supplies the same import.meta.env contract as the app.
// Canvas/image loading are stubs: these checks exercise ownership and timing,
// not image appearance or WebGL frame rate.
const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  appType: 'custom',
});
const originalLoad = THREE.TextureLoader.prototype.load;
const originalDocument = globalThis.document;
const originalIdle = globalThis.requestIdleCallback;
const idleCallbacks = [];
let canvasesCreated = 0;
let paintOperations = 0;
const observeDisposal = (resource) => {
  let count = 0;
  resource.addEventListener('dispose', () => { count++; });
  return () => count;
};
const makeCanvas = () => {
  canvasesCreated++;
  const paint = () => { paintOperations++; };
  const context = {
    fillRect: paint, beginPath: paint, moveTo: paint, lineTo: paint,
    closePath: paint, fill: paint, stroke: paint, ellipse: paint,
    bezierCurveTo: paint, quadraticCurveTo: paint,
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  return { width: 0, height: 0, getContext: () => context };
};

try {
  globalThis.document = { createElement: makeCanvas };
  globalThis.requestIdleCallback = (callback) => { idleCallbacks.push(callback); };
  THREE.TextureLoader.prototype.load = function (_url, onLoad) {
    const texture = new THREE.Texture({ width: 1024, height: 1024 });
    queueMicrotask(() => onLoad(texture));
    return texture;
  };
  const textures = await server.ssrLoadModule('/src/units/UnitTextures.js');
  const disposal = await server.ssrLoadModule('/src/world/SceneDispose.js');
  await textures.preloadUnitTextures();
  assert.equal(textures.unitTexturesReady(), true);

  const factions = ['germany', 'usa', 'uk', 'russia', 'japan'];
  const materials = new Set(factions.flatMap((id) => Object.values(textures.getInfantryMaterials(id))));
  materials.add(textures.getVehicleRubberMaterial());
  materials.add(textures.getVehicleTrackMaterial());
  materials.add(textures.getVehicleCanvasMaterial());
  const liveResources = new Map();
  for (const material of materials) {
    liveResources.set(material, observeDisposal(material));
    for (const value of Object.values(material)) {
      if (value?.isTexture && !liveResources.has(value)) liveResources.set(value, observeDisposal(value));
    }
  }
  const removed = new THREE.Group();
  for (const material of materials) removed.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  disposal.disposeObject3D(removed);
  assert([...liveResources.values()].every((count) => count() === 0),
    'removing a unit must not dispose shared live materials or maps');

  const rubber = textures.getVehicleRubberMaterial();
  const corpseMaterial = rubber.clone();
  const corpseDisposals = observeDisposal(corpseMaterial);
  const corpseGeometry = new THREE.BoxGeometry();
  const corpse = new THREE.Mesh(corpseGeometry, corpseMaterial);
  const corpseGeometryDisposals = observeDisposal(corpseGeometry);
  disposal.disposeObject3D(corpse);
  assert.equal(corpseDisposals(), 1, 'a clone of a cache-owned material must be released');
  assert.equal(corpseGeometryDisposals(), 1);
  assert.equal(liveResources.get(rubber.map)(), 0, 'a corpse clone must retain shared surface maps');

  const privateTexture = rubber.map.clone();
  const privateTextureDisposals = observeDisposal(privateTexture);
  const privateMaterial = corpseMaterial.clone();
  privateMaterial.map = privateTexture;
  privateMaterial.roughnessMap = privateTexture;
  const repeatedGeometry = new THREE.BoxGeometry();
  const repeatedGeometryDisposals = observeDisposal(repeatedGeometry);
  const sharedInObject = new THREE.Group();
  sharedInObject.add(new THREE.Mesh(repeatedGeometry, privateMaterial));
  sharedInObject.add(new THREE.Mesh(repeatedGeometry, [privateMaterial, privateMaterial]));
  disposal.disposeObject3D(sharedInObject);
  assert.equal(privateTextureDisposals(), 1, 'private maps must be disposed once even in several slots');
  assert.equal(repeatedGeometryDisposals(), 1, 'shared geometry within an object must be disposed once');

  const instanced = new THREE.InstancedMesh(new THREE.BoxGeometry(), rubber, 8);
  const instanceDisposals = observeDisposal(instanced);
  disposal.disposeObject3D(instanced);
  assert.equal(instanceDisposals(), 1, 'release instance buffers as well as geometry');

  const sheets = factions.map((id) => textures.getVehicleCamoTexture(id));
  const sheetDisposals = sheets.map(observeDisposal);
  const canvasCount = canvasesCreated;
  const operationsBeforeReplay = paintOperations;
  const lateCorpseMaterial = new THREE.MeshStandardMaterial({
    map: sheets[0], bumpMap: textures.getVehicleSurfaceBumpMap(),
  });
  const lateCorpseDisposals = observeDisposal(lateCorpseMaterial);
  disposal.disposeMeshesIdle([new THREE.Mesh(new THREE.BoxGeometry(), lateCorpseMaterial)]);
  disposal.disposeBattleScene(new THREE.Scene());
  assert(sheetDisposals.every((count) => count() === 1), 'battle teardown releases every theatre sheet');
  assert.equal(textures.unitTexturesReady(), true, 'battle cleanup does not reset permanent preload readiness');
  textures.setActiveVehicleTheatre('normandy');
  assert.equal(canvasesCreated, canvasCount, 'same-theatre replay reuses CPU canvases');
  assert.equal(paintOperations, operationsBeforeReplay, 'same-theatre replay performs no paint regeneration');
  const nextBattleSheet = textures.getVehicleCamoTexture('germany');
  assert.notEqual(nextBattleSheet, sheets[0], 'next battle receives a fresh GPU texture wrapper');
  assert.equal(nextBattleSheet.image, sheets[0].image);
  const nextBattleDisposals = observeDisposal(nextBattleSheet);
  const nextLiveUnit = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({
    map: nextBattleSheet, bumpMap: textures.getVehicleSurfaceBumpMap(),
  }));
  idleCallbacks.shift()({ timeRemaining: () => 50 });
  assert.equal(lateCorpseDisposals(), 1);
  assert.equal(nextBattleDisposals(), 0, 'late cleanup of the old battle cannot evict the new battle sheet');
  assert.equal(sheetDisposals[0](), 1, 'late cleanup does not release the old shared sheet twice');
  assert.equal(liveResources.get(rubber.map)(), 0);
  disposal.disposeObject3D(nextLiveUnit);
  assert.equal(nextBattleDisposals(), 0, 'individual new unit cleanup keeps its current theatre sheet');

  let priorSheets = factions.map((id) => textures.getVehicleCamoTexture(id));
  for (const theatre of ['northAfrica', 'easternFront', 'italy', 'farEast', 'normandy']) {
    const released = priorSheets.map(observeDisposal);
    const previousCanvasCount = canvasesCreated;
    textures.setActiveVehicleTheatre(theatre);
    assert(released.every((count) => count() === 1), 'switching theatre releases every old GPU sheet');
    assert.equal(canvasesCreated - previousCanvasCount, 5, 'only the active theatre is generated');
    priorSheets = factions.map((id) => textures.getVehicleCamoTexture(id));
    assert(priorSheets.every((texture) => texture.image.width === 1024 && texture.image.height === 1024));
  }

  let releasedMeshes = 0;
  const casualties = Array.from({ length: 11 }, () => {
    const geometry = new THREE.BoxGeometry();
    geometry.addEventListener('dispose', () => { releasedMeshes++; });
    return new THREE.Mesh(geometry, rubber);
  });
  disposal.disposeMeshesIdle([...casualties, casualties[0]]);
  idleCallbacks.shift()({ timeRemaining: () => 50 });
  assert.equal(releasedMeshes, 3, 'a long idle deadline still obeys the three-object slice cap');
  idleCallbacks.shift()({ didTimeout: true, timeRemaining: () => 0 });
  assert.equal(releasedMeshes, 4, 'an expired idle deadline makes bounded forward progress');
  while (idleCallbacks.length) idleCallbacks.shift()({ timeRemaining: () => 50 });
  assert.equal(releasedMeshes, 11, 'all casualties are eventually released without duplicate disposal');
  assert.equal(liveResources.get(rubber)(), 0);

  console.log('PASS: 5-faction shared ownership, private corpse/texture clones, deduplicated disposal,');
  console.log('      bounded theatre GPU/CPU caches, same-map canvas reuse, delayed old-battle cleanup,');
  console.log('      and capped/expired idle disposal slices. Paint sheets remain 1024 x 1024.');
} finally {
  THREE.TextureLoader.prototype.load = originalLoad;
  globalThis.document = originalDocument;
  globalThis.requestIdleCallback = originalIdle;
  await server.close();
}
