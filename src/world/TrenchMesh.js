import * as THREE from 'three';
import { createCamoMaterial, getInfantryUniformTexture, getVehicleCamoTexture } from '../units/UnitTextures.js';
import { sampleTerrainHeight, sampleTerrainMeshHeight } from './Terrain.js';

const MAX_TRENCH_TILT = 0.65;
const TRENCH_SURFACE_CLEARANCE = 0.08;
export const TRENCH_PIT_DEPTH = 0.46;
/** Seat the crouched root just above the deformed pit floor. */
export const TRENCH_OCCUPANT_SURFACE_OFFSET = 0.1;

/**
 * Seat a trench into the local terrain while keeping its visible earthworks
 * above the rendered ground. The map can change height quickly across a
 * four-metre trench, so a single rigid box otherwise gets occluded on one
 * side of the position.
 */
export function alignTrenchGroupToTerrain(group, x, z, yaw, mapDef, terrainMesh = null) {
  if (!group) return;
  const length = group.userData.trenchLength ?? 4.2;
  const width = group.userData.trenchWidth ?? 2.4;
  const sample = mapDef
    ? terrainMesh
      ? (sampleX, sampleZ) => sampleTerrainMeshHeight(terrainMesh, sampleX, sampleZ, mapDef)
      : (sampleX, sampleZ) => sampleTerrainHeight(sampleX, sampleZ, mapDef)
    : () => 0;
  const center = sample(x, z);
  const forwardRadius = Math.max(0.65, width * 0.42);
  const rightRadius = Math.max(1.1, length * 0.43);
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  const front = mapDef
    ? sample(x + forwardX * forwardRadius, z + forwardZ * forwardRadius)
    : center;
  const back = mapDef
    ? sample(x - forwardX * forwardRadius, z - forwardZ * forwardRadius)
    : center;
  const right = mapDef
    ? sample(x + rightX * rightRadius, z + rightZ * rightRadius)
    : center;
  const left = mapDef
    ? sample(x - rightX * rightRadius, z - rightZ * rightRadius)
    : center;

  group.position.set(x, center, z);
  group.userData.trenchYaw = yaw;

  if (!mapDef) {
    group.rotation.set(0, yaw, 0);
    return;
  }

  // Build an orthonormal basis from the trench's forward/right axes. Applying
  // pitch and roll as world Euler angles becomes visibly wrong once the
  // trench is rotated diagonally across a slope.
  const up = new THREE.Vector3(0, 1, 0);
  const forward = new THREE.Vector3(forwardX, 0, forwardZ);
  const rightAxis = new THREE.Vector3(rightX, 0, rightZ);
  const forwardSlope = THREE.MathUtils.clamp(
    (front - back) / (forwardRadius * 2),
    -Math.tan(MAX_TRENCH_TILT),
    Math.tan(MAX_TRENCH_TILT)
  );
  const rightSlope = THREE.MathUtils.clamp(
    (right - left) / (rightRadius * 2),
    -Math.tan(MAX_TRENCH_TILT),
    Math.tan(MAX_TRENCH_TILT)
  );
  const terrainNormal = new THREE.Vector3()
    .copy(up)
    .addScaledVector(forward, -forwardSlope)
    .addScaledVector(rightAxis, -rightSlope)
    .normalize();
  const terrainRight = new THREE.Vector3()
    .copy(rightAxis)
    .addScaledVector(up, rightSlope)
    .normalize();
  const terrainForward = new THREE.Vector3()
    .crossVectors(terrainRight, terrainNormal)
    .normalize();
  const orientation = new THREE.Matrix4().makeBasis(
    terrainRight,
    terrainNormal,
    terrainForward
  );
  group.quaternion.setFromRotationMatrix(orientation);
  group.userData.terrainPitch = -Math.atan(forwardSlope);
  group.userData.terrainRoll = Math.atan(rightSlope);

  conformTrenchGeometryToTerrain(group, sample);
}

/** Follow the local terrain with each earthwork section instead of burying it. */
function conformTrenchGeometryToTerrain(group, sample) {
  const terrainUp = new THREE.Vector3(0, 1, 0).applyQuaternion(group.quaternion);
  if (terrainUp.y <= 0.1) return;

  for (const child of group.children) {
    if (!child.isMesh || !child.geometry?.attributes?.position) continue;

    // Bake the child transform so every subdivided ground-facing vertex can
    // follow the terrain independently while retaining the group orientation.
    child.updateMatrix();
    child.geometry.applyMatrix4(child.matrix);
    child.position.set(0, 0, 0);
    child.rotation.set(0, 0, 0);
    child.scale.set(1, 1, 1);

    const positions = child.geometry.attributes.position;
    const worldBase = new THREE.Vector3();
    const localVertex = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
      localVertex.fromBufferAttribute(positions, i);
      worldBase
        .set(localVertex.x, 0, localVertex.z)
        .applyQuaternion(group.quaternion)
        .add(group.position);
      const groundY = sample(worldBase.x, worldBase.z);
      localVertex.y +=
        (groundY + TRENCH_SURFACE_CLEARANCE - worldBase.y) / terrainUp.y;
      positions.setXYZ(i, localVertex.x, localVertex.y, localVertex.z);
    }
    positions.needsUpdate = true;
    child.geometry.computeVertexNormals();
    child.geometry.computeBoundingBox();
    child.geometry.computeBoundingSphere();
  }

  group.userData.terrainConformed = true;
}

function createBermGeometry({ length, innerZ, outerZ, height, seed, rand }) {
  const xSegments = Math.max(8, Math.ceil(length / 0.38));
  const crossSegments = 5;
  const rowSize = crossSegments + 1;
  const positions = [];
  const indices = [];
  const topIndex = (x, z) => x * rowSize + z;
  const direction = Math.sign(outerZ - innerZ) || 1;

  for (let x = 0; x <= xSegments; x++) {
    const t = x / xSegments;
    const xJitter = x === 0 || x === xSegments ? 0 : (rand(seed + x * 13.1) - 0.5) * 0.1;
    const localX = THREE.MathUtils.lerp(-length / 2, length / 2, t) + xJitter;
    const ridgeJitter = (rand(seed + x * 19.7 + 1) - 0.5) * 0.11;
    for (let z = 0; z <= crossSegments; z++) {
      const across = z / crossSegments;
      const edgeJitter =
        across > 0.02 && across < 0.98
          ? (rand(seed + x * 31.3 + z * 7.7 + 2) - 0.5) * 0.045
          : 0;
      const localZ = THREE.MathUtils.lerp(innerZ, outerZ, across) + edgeJitter;
      const crown = Math.pow(Math.sin(Math.PI * across), 0.78);
      const crownVariation = 0.91 + rand(seed + x * 43.9 + z * 11.2 + 3) * 0.17;
      const y =
        0.045 +
        height * crown * crownVariation +
        Math.sin(t * Math.PI * 2.4 + seed) * 0.018 * crown +
        ridgeJitter * Math.pow(Math.sin(Math.PI * across), 2);
      positions.push(localX, Math.max(0.035, y), localZ);
    }
  }

  // Close the exposed edges so the berm reads as a solid bank when viewed
  // from a low angle, while keeping the irregular top surface visible.
  const bottomStart = positions.length / 3;
  for (let x = 0; x <= xSegments; x++) {
    for (let z = 0; z <= crossSegments; z++) {
      const top = (x * rowSize + z) * 3;
      positions.push(positions[top], 0.015, positions[top + 2]);
    }
  }

  for (let x = 0; x < xSegments; x++) {
    for (let z = 0; z < crossSegments; z++) {
      const a = topIndex(x, z);
      const b = topIndex(x + 1, z);
      const c = topIndex(x + 1, z + 1);
      const d = topIndex(x, z + 1);
      if (direction > 0) indices.push(a, d, c, a, c, b);
      else indices.push(a, b, c, a, c, d);
    }
  }

  const bottomIndexAt = (x, z) => bottomStart + topIndex(x, z);
  const addQuad = (a, b, c, d) => indices.push(a, b, c, a, c, d);
  for (let x = 0; x < xSegments; x++) {
    addQuad(topIndex(x, 0), bottomIndexAt(x, 0), bottomIndexAt(x + 1, 0), topIndex(x + 1, 0));
    addQuad(
      topIndex(x, crossSegments),
      topIndex(x + 1, crossSegments),
      bottomIndexAt(x + 1, crossSegments),
      bottomIndexAt(x, crossSegments)
    );
  }
  for (let z = 0; z < crossSegments; z++) {
    addQuad(topIndex(0, z), topIndex(0, z + 1), bottomIndexAt(0, z + 1), bottomIndexAt(0, z));
    addQuad(
      topIndex(xSegments, z),
      bottomIndexAt(xSegments, z),
      bottomIndexAt(xSegments, z + 1),
      topIndex(xSegments, z + 1)
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createCutWallGeometry({ length, z, height, direction, seed, rand }) {
  const segments = Math.max(8, Math.ceil(length / 0.42));
  const levels = 2;
  const positions = [];
  const indices = [];
  const indexAt = (x, y) => x * (levels + 1) + y;
  for (let x = 0; x <= segments; x++) {
    const t = x / segments;
    const xJitter = x === 0 || x === segments ? 0 : (rand(seed + x * 17.4) - 0.5) * 0.07;
    const localX = THREE.MathUtils.lerp(-length / 2, length / 2, t) + xJitter;
    for (let y = 0; y <= levels; y++) {
      const vertical = y / levels;
      const localY = -0.36 + vertical * height + (rand(seed + x * 23.5 + y * 8.1) - 0.5) * 0.035;
      const localZ = z + direction * vertical * 0.065;
      positions.push(localX, localY, localZ);
    }
  }
  for (let x = 0; x < segments; x++) {
    for (let y = 0; y < levels; y++) {
      const a = indexAt(x, y);
      const b = indexAt(x + 1, y);
      const c = indexAt(x + 1, y + 1);
      const d = indexAt(x, y + 1);
      if (direction > 0) indices.push(a, d, c, a, c, b);
      else indices.push(a, b, c, a, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createFloorGeometry({ length, width, seed, rand }) {
  const xSegments = Math.max(8, Math.ceil(length / 0.42));
  const zSegments = 4;
  const positions = [];
  const indices = [];
  const rowSize = zSegments + 1;
  const indexAt = (x, z) => x * rowSize + z;
  for (let x = 0; x <= xSegments; x++) {
    for (let z = 0; z <= zSegments; z++) {
      const tx = x / xSegments;
      const tz = z / zSegments;
      const localX = THREE.MathUtils.lerp(-length / 2, length / 2, tx);
      const localZ = THREE.MathUtils.lerp(-width / 2, width / 2, tz);
      const roughness = (rand(seed + x * 29.1 + z * 5.8) - 0.5) * 0.045;
      positions.push(localX, -0.38 + roughness, localZ);
    }
  }
  for (let x = 0; x < xSegments; x++) {
    for (let z = 0; z < zSegments; z++) {
      const a = indexAt(x, z);
      const b = indexAt(x + 1, z);
      const c = indexAt(x + 1, z + 1);
      const d = indexAt(x, z + 1);
      indices.push(a, d, c, a, c, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addCylinderBetween(group, start, end, radius, material, segments = 7) {
  const a = new THREE.Vector3(start.x, start.y, start.z);
  const b = new THREE.Vector3(end.x, end.y, end.z);
  const delta = b.clone().sub(a);
  const length = delta.length();
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.08, radius, length, segments),
    material
  );
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addTrenchSandbag(group, material, x, y, z, rotation = 0, scale = 1) {
  const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.155, 0.4, 3, 7), material);
  bag.position.set(x, y, z);
  bag.rotation.set(0, rotation, Math.PI / 2);
  bag.scale.set(scale, 1, 0.88 + scale * 0.04);
  bag.castShadow = true;
  bag.receiveShadow = true;
  group.add(bag);
  return bag;
}

/**
 * Detailed dug fighting trench — irregular earthworks, timber revetment,
 * sandbag parapet, and a muddy duckboard floor for infantry cover.
 */
export function createTrenchGroup({ factionId = null, seed = 0, length = 4.2, width = 2.4 } = {}) {
  const g = new THREE.Group();
  g.name = 'infantryTrench';
  g.userData.trenchLength = length;
  g.userData.trenchWidth = width;
  g.userData.trenchDetailed = true;

  const vehicleCamo = factionId ? getVehicleCamoTexture(factionId) : null;
  const infantryCamo = factionId ? getInfantryUniformTexture(factionId) : null;
  const fabric = infantryCamo ?? vehicleCamo;
  // Earth is deliberately independent of faction fabric; the old model used
  // uniform/camo texture on the soil, which made the position look painted.
  const dirt = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 });
  const dirtLight = new THREE.MeshStandardMaterial({ color: 0x765b3d, roughness: 1 });
  const cut = new THREE.MeshStandardMaterial({
    color: 0x35291e,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const mud = new THREE.MeshStandardMaterial({
    color: 0x28231c,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3021, roughness: 0.96 });
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x281b15, roughness: 1 });
  const sandbag = createCamoMaterial(0x8b7654, fabric, [2.2, 1.4], { rough: 0.96 });
  const sandbagAlt = createCamoMaterial(0x6f5b45, fabric, [1.8, 1.2], { rough: 0.98 });

  const rand = (i) => {
    const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };

  const floor = new THREE.Mesh(
    createFloorGeometry({ length: length * 0.9, width: width * 0.72, seed: 11, rand }),
    mud
  );
  floor.receiveShadow = true;
  g.add(floor);

  // The dark cut faces make the excavation read as depth instead of four
  // boxes sitting on top of the ground.
  const frontCut = new THREE.Mesh(
    createCutWallGeometry({
      length: length * 0.9,
      z: width * 0.3,
      height: 0.55,
      direction: -1,
      seed: 31,
      rand,
    }),
    cut
  );
  const rearCut = new THREE.Mesh(
    createCutWallGeometry({
      length: length * 0.88,
      z: -width * 0.3,
      height: 0.48,
      direction: 1,
      seed: 47,
      rand,
    }),
    cut
  );
  for (const wall of [frontCut, rearCut]) {
    wall.castShadow = true;
    wall.receiveShadow = true;
    g.add(wall);
  }

  // Uneven, sloped spoil banks. Each bank has a different profile so the
  // position does not look like a mirrored pair of manufactured blocks.
  const frontBerm = new THREE.Mesh(
    createBermGeometry({
      length,
      innerZ: width * 0.3,
      outerZ: width * 0.62,
      height: 0.58,
      seed: 61,
      rand,
    }),
    dirtLight
  );
  const rearBerm = new THREE.Mesh(
    createBermGeometry({
      length: length * 0.96,
      innerZ: -width * 0.3,
      outerZ: -width * 0.61,
      height: 0.44,
      seed: 83,
      rand,
    }),
    dirt
  );
  for (const berm of [frontBerm, rearBerm]) {
    berm.castShadow = true;
    berm.receiveShadow = true;
    g.add(berm);
  }

  // Short traverses close the ends of the excavation and stop the earthworks
  // reading as two disconnected rails when the camera looks along the line.
  for (const side of [-1, 1]) {
    const traverse = new THREE.Mesh(
      createBermGeometry({
        length: width * 0.96,
        innerZ: -length * 0.08,
        outerZ: length * 0.08,
        height: 0.36,
        seed: 401 + side * 17,
        rand,
      }),
      side < 0 ? dirt : dirtLight
    );
    traverse.position.x = side * length * 0.47;
    traverse.rotation.y = Math.PI / 2;
    traverse.castShadow = true;
    traverse.receiveShadow = true;
    g.add(traverse);
  }

  // Timber revetment in the rear wall: upright stakes and horizontal logs
  // hold the cut earth in place and provide readable close-up detail.
  const rearWallZ = -width * 0.34;
  const postXs = [-0.43, -0.22, 0, 0.22, 0.43].map((t) => t * length);
  for (let i = 0; i < postXs.length; i++) {
    const x = postXs[i] + (rand(101 + i) - 0.5) * 0.08;
    addCylinderBetween(
      g,
      { x, y: -0.35, z: rearWallZ + 0.03 },
      { x: x + (rand(111 + i) - 0.5) * 0.04, y: 0.28, z: rearWallZ - 0.02 },
      0.055 + rand(121 + i) * 0.012,
      wood,
      7
    );
  }
  for (const y of [-0.2, 0.02, 0.2]) {
    addCylinderBetween(
      g,
      { x: -length * 0.46, y, z: rearWallZ + 0.045 },
      { x: length * 0.46, y: y + 0.018, z: rearWallZ + 0.035 },
      0.052,
      y === 0.02 ? wood : woodDark,
      7
    );
  }

  // Sandbags reinforce the enemy-facing parapet. Capsules with small
  // variations avoid the rigid brick pattern of the previous model.
  const bagCount = Math.max(5, Math.round(length / 0.68));
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < bagCount; i++) {
      const t = (i + (row ? 0.5 : 0)) / Math.max(bagCount - 1, 1);
      const x = THREE.MathUtils.lerp(-length * 0.47, length * 0.47, t);
      const z = width * 0.48 + row * 0.18 + (rand(151 + row * 37 + i) - 0.5) * 0.06;
      const y = 0.22 + row * 0.19 + (rand(173 + row * 31 + i) - 0.5) * 0.035;
      const bagScale = 0.9 + rand(191 + row * 29 + i) * 0.18;
      addTrenchSandbag(
        g,
        (row + i) % 3 === 0 ? sandbagAlt : sandbag,
        x,
        y,
        z,
        (rand(211 + row * 23 + i) - 0.5) * 0.12,
        bagScale
      );
    }
  }

  // A few rough boards keep the pit from reading as a perfectly flat black
  // rectangle and give troops a believable dry footing in the mud.
  for (let i = 0; i < 6; i++) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(0.48 + rand(241 + i) * 0.1, 0.075, width * 0.46 + rand(251 + i) * 0.08),
      i % 2 ? wood : woodDark
    );
    plank.position.set(
      THREE.MathUtils.lerp(-length * 0.37, length * 0.37, i / 5),
      -0.31 + rand(261 + i) * 0.025,
      (rand(271 + i) - 0.5) * 0.08
    );
    plank.rotation.y = (rand(281 + i) - 0.5) * 0.06;
    plank.castShadow = true;
    plank.receiveShadow = true;
    g.add(plank);
  }

  // Loose soil clods and a few stakes soften the silhouette at the outside
  // edges and help the trench sit in the surrounding terrain.
  for (let i = 0; i < 8; i++) {
    const outside = rand(301 + i) > 0.42 ? 1 : -1;
    const clump = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.18 + rand(311 + i) * 0.15, 0),
      i % 3 === 0 ? dirtLight : dirt
    );
    clump.position.set(
      (rand(321 + i) - 0.5) * length * 0.95,
      0.08 + rand(331 + i) * 0.09,
      outside * (width * 0.68 + rand(341 + i) * 0.25)
    );
    clump.scale.set(1.25, 0.58 + rand(351 + i) * 0.3, 0.82);
    clump.rotation.set(rand(361 + i) * 0.5, rand(371 + i) * Math.PI, rand(381 + i) * 0.4);
    clump.castShadow = true;
    clump.receiveShadow = true;
    g.add(clump);
  }
  for (const x of [-length * 0.49, length * 0.49]) {
    const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.6, 6), woodDark);
    stake.position.set(x, 0.25, width * 0.66);
    stake.rotation.z = (rand(x * 97) - 0.5) * 0.22;
    stake.castShadow = true;
    g.add(stake);
  }

  return g;
}
