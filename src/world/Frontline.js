import * as THREE from 'three';
import { sampleTerrainHeight } from './Terrain.js';

/** Trenches and obstacles marking the assault frontline. */
export function buildFrontlineVisual(mapDef, scene) {
  const fl = mapDef.frontline ?? { x: 0, z: 0 };
  const pb = mapDef.playerBase;
  const eb = mapDef.enemyBase;
  const dx = eb.x - pb.x;
  const dz = eb.z - pb.z;
  const len = Math.sqrt(dx * dx + dz * dz) || 1;
  const perpX = -dz / len;
  const perpZ = dx / len;

  const group = new THREE.Group();
  group.name = 'frontlineVisual';
  const y = sampleTerrainHeight(fl.x, fl.z, mapDef);

  const trenchMat = new THREE.MeshStandardMaterial({ color: 0x4a4035, roughness: 0.95 });
  const bagMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.92 });
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x5a5a52, metalness: 0.4, roughness: 0.6 });

  const lineLen = mapDef.size * 0.55;

  for (const side of [-1, 1]) {
    const trench = new THREE.Mesh(new THREE.BoxGeometry(lineLen, 0.9, 2.2), trenchMat);
    trench.position.set(fl.x + perpX * side * 5, y + 0.45, fl.z + perpZ * side * 5);
    trench.rotation.y = Math.atan2(perpX, perpZ);
    trench.castShadow = true;
    trench.receiveShadow = true;
    group.add(trench);

    for (let i = -5; i <= 5; i++) {
      const t = i / 5;
      const px = fl.x + perpX * side * 6 + perpX * t * (lineLen * 0.45);
      const pz = fl.z + perpZ * side * 6 + perpZ * t * (lineLen * 0.45);
      const py = sampleTerrainHeight(px, pz, mapDef);
      const bags = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 1), bagMat);
      bags.position.set(px, py + 0.35, pz);
      bags.rotation.y = Math.atan2(perpX, perpZ) + (Math.random() - 0.5) * 0.2;
      bags.castShadow = true;
      group.add(bags);
    }
  }

  for (let i = -6; i <= 6; i++) {
    const t = i / 6;
    const px = fl.x + perpX * t * (lineLen * 0.48);
    const pz = fl.z + perpZ * t * (lineLen * 0.48);
    const py = sampleTerrainHeight(px, pz, mapDef);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.4, 6), wireMat);
    post.position.set(px, py + 0.7, pz);
    group.add(post);
    if (i % 2 === 0) {
      const wire = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.04, 0.04), wireMat);
      wire.position.set(px + perpX * 0.9, py + 1.1, pz + perpZ * 0.9);
      wire.rotation.y = Math.atan2(perpX, perpZ);
      group.add(wire);
    }
  }

  const banner = makeBanner(fl.name ?? 'Frontline');
  banner.position.set(fl.x, y + 5.5, fl.z);
  group.add(banner);

  scene.add(group);
  return group;
}

function makeBanner(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(40,28,18,0.85)';
  ctx.fillRect(0, 0, 320, 64);
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, 316, 60);
  ctx.fillStyle = '#e8e4dc';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, 160, 40);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
  );
  sprite.scale.set(14, 2.8, 1);
  return sprite;
}

export function disposeFrontlineVisual(scene) {
  const g = scene.getObjectByName('frontlineVisual');
  if (!g) return;
  scene.remove(g);
  g.traverse((c) => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      if (c.material.map) c.material.map.dispose();
      c.material.dispose();
    }
  });
}