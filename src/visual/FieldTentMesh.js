import * as THREE from 'three';
import { createCamoMaterial, getInfantryUniformTexture, getVehicleCamoTexture } from '../units/UnitTextures.js';

/**
 * Compact field hospital tent (medic-deployed).
 */
export function createFieldTentMesh(factionId = null) {
  const g = new THREE.Group();
  g.name = 'medicFieldTent';

  const vehicleCamo = factionId ? getVehicleCamoTexture(factionId) : null;
  const infantryCamo = factionId ? getInfantryUniformTexture(factionId) : null;
  const fabric = infantryCamo ?? vehicleCamo;

  const canvas = createCamoMaterial(0xd8d2bd, fabric, [2.1, 1.5], { rough: 0.94 });
  const canvasDark = createCamoMaterial(0x9f9a86, fabric, [1.7, 1.3], { rough: 0.96 });
  const pole = new THREE.MeshStandardMaterial({ color: 0x5a4a32, roughness: 0.9, metalness: 0.1 });
  const crossWhite = new THREE.MeshStandardMaterial({ color: 0xf1eee2, roughness: 0.86, side: THREE.DoubleSide });
  const crossRed = new THREE.MeshStandardMaterial({ color: 0xb51f2f, roughness: 0.75, side: THREE.DoubleSide });
  const sandbag = createCamoMaterial(0x7a6a4a, fabric, [1.4, 1.1], { rough: 0.96 });
  const wood = createCamoMaterial(0x6b5037, fabric, [1.1, 0.8], { rough: 0.96 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x4e514b, roughness: 0.72, metalness: 0.25 });

  const floor = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.08, 4.4), canvasDark);
  floor.position.y = 0.04;
  floor.receiveShadow = true;
  g.add(floor);

  const addCylinderBetween = (start, end, radius, material, name) => {
    const a = new THREE.Vector3(start.x, start.y, start.z);
    const b = new THREE.Vector3(end.x, end.y, end.z);
    const delta = b.clone().sub(a);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 1.08, delta.length(), 7),
      material
    );
    mesh.name = name;
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };

  const ridgeY = 2.15;
  const eaveX = 1.65;
  const frontZ = 1.82;
  const backZ = -1.82;
  const roofLength = 3.72;

  for (const side of [-1, 1]) {
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      side * eaveX, 0.28, backZ,
      0, ridgeY, backZ,
      0, ridgeY, frontZ,
      side * eaveX, 0.28, frontZ,
    ]);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    const roof = new THREE.Mesh(geometry, canvas);
    roof.name = side < 0 ? 'leftCanvasSide' : 'rightCanvasSide';
    roof.castShadow = true;
    roof.receiveShadow = true;
    g.add(roof);
  }

  addCylinderBetween({ x: 0, y: ridgeY, z: backZ }, { x: 0, y: ridgeY, z: frontZ }, 0.055, pole, 'ridgePole');
  for (const z of [backZ, frontZ]) {
    addCylinderBetween({ x: -eaveX, y: 0.28, z }, { x: 0, y: ridgeY, z }, 0.045, pole, 'framePole');
    addCylinderBetween({ x: eaveX, y: 0.28, z }, { x: 0, y: ridgeY, z }, 0.045, pole, 'framePole');
  }

  const addEndWall = (z, material) => {
    const shape = new THREE.Shape();
    shape.moveTo(-eaveX, 0.3);
    shape.lineTo(0, ridgeY);
    shape.lineTo(eaveX, 0.3);
    shape.closePath();
    const end = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
    end.position.z = z;
    end.castShadow = true;
    end.receiveShadow = true;
    g.add(end);
    return end;
  };

  addEndWall(backZ, canvasDark);
  addEndWall(frontZ + 0.015, canvasDark);

  const addMedicalCross = (z, outward) => {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.9, 0.025), crossWhite);
    sign.position.set(0, 1.05, z);
    g.add(sign);
    const cv = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.04), crossRed);
    cv.position.set(0, 1.05, z + outward * 0.03);
    g.add(cv);
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.18, 0.04), crossRed);
    ch.position.set(0, 1.05, z + outward * 0.03);
    g.add(ch);
  };

  addMedicalCross(frontZ + 0.035, 1);
  addMedicalCross(backZ - 0.035, -1);

  const flap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.28, 0.82), canvas);
  flap.position.set(0, 0.82, frontZ + 0.055);
  flap.castShadow = true;
  g.add(flap);

  for (const z of [frontZ + 0.18, backZ - 0.18]) {
    for (const x of [-1.55, 1.55]) {
      const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.58, 4, 8), sandbag);
      bag.position.set(x, 0.23, z);
      bag.rotation.z = Math.PI / 2;
      bag.castShadow = true;
      bag.receiveShadow = true;
      g.add(bag);
    }
  }

  const table = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.08, 0.5), wood);
  table.position.set(1.15, 0.62, 0.18);
  table.castShadow = true;
  g.add(table);
  for (const x of [0.78, 1.52]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.62, 6), wood);
    leg.position.set(x, 0.31, 0.18);
    leg.castShadow = true;
    g.add(leg);
  }
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.42, 0.48), wood);
  crate.position.set(-1.08, 0.25, 0.3);
  crate.castShadow = true;
  g.add(crate);
  const stretcher = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.07, 0.42), canvasDark);
  stretcher.position.set(-0.65, 0.55, -0.75);
  stretcher.castShadow = true;
  g.add(stretcher);
  for (const x of [-1.12, -0.18]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.5, 6), metal);
    leg.position.set(x, 0.28, -0.75);
    leg.castShadow = true;
    g.add(leg);
  }

  const rope = new THREE.LineBasicMaterial({ color: 0x4d4436, transparent: true, opacity: 0.75 });
  for (const side of [-1, 1]) {
    const points = [
      new THREE.Vector3(0, ridgeY, side * frontZ),
      new THREE.Vector3(side * 2.15, 0.05, side * (frontZ + 0.55)),
    ];
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), rope);
    line.name = 'guyRope';
    g.add(line);
  }

  // Soft heal aura ring (visual only)
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.4, 3.7, 40),
    new THREE.MeshBasicMaterial({
      color: 0x6bcf7a,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  ring.renderOrder = 5;
  ring.name = 'healRing';
  g.add(ring);

  return g;
}
