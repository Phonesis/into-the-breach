import * as THREE from 'three';
import { createCamoMaterial, getInfantryUniformTexture, getVehicleCamoTexture } from '../units/UnitTextures.js';
import { sampleTerrainHeight, sampleTerrainMeshHeight } from './Terrain.js';

const MAX_TRENCH_TILT = 0.65;
const TRENCH_SURFACE_CLEARANCE = 0.08;

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

/**
 * Simple dug fighting trench — berms + pit floor for infantry cover.
 */
export function createTrenchGroup({ factionId = null, seed = 0, length = 4.2, width = 2.4 } = {}) {
  const g = new THREE.Group();
  g.name = 'infantryTrench';
  g.userData.trenchLength = length;
  g.userData.trenchWidth = width;
  const lengthSegments = Math.max(4, Math.ceil(length / 0.55));
  const widthSegments = Math.max(3, Math.ceil(width / 0.55));

  const vehicleCamo = factionId ? getVehicleCamoTexture(factionId) : null;
  const infantryCamo = factionId ? getInfantryUniformTexture(factionId) : null;
  const fabric = infantryCamo ?? vehicleCamo;
  const dirt = createCamoMaterial(0x4a3c28, fabric, [1.6, 1.2], { rough: 1 });
  const dirtDark = createCamoMaterial(0x2e2618, fabric, [1.4, 1.1], { rough: 1 });
  const lip = createCamoMaterial(0x5a4a32, fabric, [1.5, 1.15], { rough: 0.98 });

  const rand = (i) => {
    const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };

  // Sunken floor
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(length * 0.92, 0.22, width * 0.85, lengthSegments, 1, widthSegments),
    dirtDark
  );
  floor.position.y = -0.12;
  floor.receiveShadow = true;
  g.add(floor);

  // Front and rear berms (facing +Z as "front")
  const bermH = 0.42;
  const front = new THREE.Mesh(
    new THREE.BoxGeometry(length, bermH, 0.55, lengthSegments, 1, 2),
    lip
  );
  front.position.set(0, bermH * 0.35, width * 0.42);
  front.castShadow = true;
  front.receiveShadow = true;
  g.add(front);

  const rear = new THREE.Mesh(
    new THREE.BoxGeometry(length * 0.95, bermH * 0.85, 0.48, lengthSegments, 1, 2),
    dirt
  );
  rear.position.set(0, bermH * 0.28, -width * 0.4);
  rear.castShadow = true;
  rear.receiveShadow = true;
  g.add(rear);

  // Side walls
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, bermH * 0.9, width * 0.75, 2, 1, widthSegments),
      side > 0 ? dirt : lip
    );
    wall.position.set(side * (length * 0.46), bermH * 0.3, 0);
    wall.castShadow = true;
    wall.receiveShadow = true;
    g.add(wall);
  }

  // Loose spoil heaps
  for (let i = 0; i < 4; i++) {
    const heap = new THREE.Mesh(
      new THREE.SphereGeometry(0.28 + rand(i) * 0.12, 6, 5),
      rand(i + 3) > 0.5 ? dirt : lip
    );
    heap.scale.y = 0.55;
    heap.position.set(
      (rand(i + 1) - 0.5) * length * 0.7,
      0.12,
      (rand(i + 2) > 0.5 ? 1 : -1) * (width * 0.55 + rand(i) * 0.2)
    );
    heap.castShadow = true;
    g.add(heap);
  }

  return g;
}
