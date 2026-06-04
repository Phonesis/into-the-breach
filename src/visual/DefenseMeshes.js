import * as THREE from 'three';

const MAT = {
  concrete: new THREE.MeshStandardMaterial({ color: 0x6a6a62, roughness: 0.92 }),
  concreteDark: new THREE.MeshStandardMaterial({ color: 0x4a4a45, roughness: 0.94 }),
  sandbag: new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.9 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x4a4a48, metalness: 0.35, roughness: 0.55 }),
  wire: new THREE.MeshStandardMaterial({ color: 0x5a5a52, metalness: 0.45, roughness: 0.5 }),
  pit: new THREE.MeshStandardMaterial({ color: 0x3a3428, roughness: 0.95 }),
  mine: new THREE.MeshStandardMaterial({ color: 0x3d3830, roughness: 0.98 }),
};

function addPickCollider(group, radius = 3) {
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 4, 8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.name = 'defenseHitbox';
  hit.position.y = 2;
  group.add(hit);
}

export function createDefenseMesh(typeId, accent = 0xc9a227) {
  const g = new THREE.Group();
  g.name = `defense-${typeId}`;

  const accentMat = new THREE.MeshStandardMaterial({
    color: accent,
    roughness: 0.7,
    metalness: 0.2,
  });

  switch (typeId) {
    case 'bunker':
    case 'bunkerHeavy': {
      const heavy = typeId === 'bunkerHeavy';
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(heavy ? 6.5 : 5.5, heavy ? 1.8 : 1.4, heavy ? 5 : 4.2),
        heavy ? MAT.concreteDark : MAT.concrete
      );
      base.position.y = heavy ? 0.9 : 0.7;
      base.castShadow = true;
      g.add(base);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(heavy ? 6 : 5, 0.55, heavy ? 4.5 : 3.8), MAT.sandbag);
      roof.position.y = heavy ? 1.85 : 1.55;
      g.add(roof);
      if (heavy) {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 3.8, 8), MAT.steel);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 1.5, 2.6);
        g.add(barrel);
      } else {
        const slot = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 1.2), accentMat);
        slot.position.set(0, 1.1, 2.3);
        g.add(slot);
      }
      addPickCollider(g, heavy ? 3.8 : 3.2);
      break;
    }
    case 'mgNest':
    case 'mgNestMk2': {
      const mk2 = typeId === 'mgNestMk2';
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(mk2 ? 2.6 : 2.2, mk2 ? 2.8 : 2.4, mk2 ? 1 : 0.8, 10),
        MAT.sandbag
      );
      ring.position.y = mk2 ? 0.5 : 0.4;
      ring.castShadow = true;
      g.add(ring);
      const gun = new THREE.Mesh(
        new THREE.BoxGeometry(mk2 ? 2.4 : 1.8, mk2 ? 0.45 : 0.35, mk2 ? 0.45 : 0.35),
        MAT.steel
      );
      gun.position.set(0, mk2 ? 1.15 : 1, mk2 ? 1.4 : 1.2);
      gun.rotation.x = -0.25;
      g.add(gun);
      addPickCollider(g, 2.8);
      break;
    }
    case 'atGun':
    case 'atGun88': {
      const big = typeId === 'atGun88';
      const shield = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, big ? 2 : 1.6, big ? 3 : 2.4),
        MAT.steel
      );
      shield.position.set(0, big ? 1.1 : 0.9, 0);
      g.add(shield);
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(big ? 0.16 : 0.12, big ? 0.18 : 0.14, big ? 4.2 : 3.2, 8),
        MAT.steel
      );
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, big ? 1.25 : 1.1, big ? 2.2 : 1.8);
      g.add(barrel);
      const carriage = new THREE.Mesh(new THREE.BoxGeometry(big ? 3.4 : 2.8, 0.5, big ? 2 : 1.6), MAT.sandbag);
      carriage.position.y = 0.25;
      g.add(carriage);
      addPickCollider(g, 3);
      break;
    }
    case 'barbedWire':
    case 'razorWire': {
      const wide = typeId === 'razorWire';
      const count = wide ? 4 : 3;
      for (let i = -count; i <= count; i++) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, wide ? 1.4 : 1.2, 6), MAT.wire);
        post.position.set(i * (wide ? 1.2 : 1.4), 0.6, 0);
        g.add(post);
        if (i < count) {
          const wire = new THREE.Mesh(
            new THREE.BoxGeometry(wide ? 1.3 : 1.5, wide ? 0.08 : 0.05, 0.05),
            MAT.wire
          );
          wire.position.set(i * (wide ? 1.2 : 1.4) + 0.6, wide ? 1.05 : 0.95, 0);
          g.add(wire);
        }
      }
      addPickCollider(g, wide ? 4 : 3.5);
      break;
    }
    case 'mine': {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.12, 10), MAT.mine);
      disc.position.y = 0.06;
      g.add(disc);
      const marker = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.35, 0.15), accentMat);
      marker.position.y = 0.2;
      g.add(marker);
      addPickCollider(g, 1.8);
      break;
    }
    case 'artillery':
    case 'artilleryHeavy': {
      const heavy = typeId === 'artilleryHeavy';
      const pit = new THREE.Mesh(
        new THREE.CylinderGeometry(heavy ? 3.4 : 2.8, heavy ? 3.8 : 3.2, 0.65, 12),
        MAT.pit
      );
      pit.position.y = 0.32;
      g.add(pit);
      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(heavy ? 0.22 : 0.18, heavy ? 0.26 : 0.22, heavy ? 4.2 : 3.5, 8),
        MAT.steel
      );
      tube.rotation.x = -0.55;
      tube.position.set(0, heavy ? 1.35 : 1.2, heavy ? 1 : 0.8);
      g.add(tube);
      addPickCollider(g, 3.2);
      break;
    }
    default:
      break;
  }

  g.traverse((c) => {
    if (c.isMesh && c.name !== 'defenseHitbox') {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return g;
}

export function setDefenseHpVisual(mesh, hpRatio) {
  if (!mesh) return;
  const smoke = mesh.getObjectByName('defenseDamage');
  if (hpRatio > 0.4) {
    if (smoke) smoke.visible = false;
    return;
  }
  let s = smoke;
  if (!s) {
    s = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.35 })
    );
    s.name = 'defenseDamage';
    s.position.y = 2;
    mesh.add(s);
  }
  s.visible = true;
  s.scale.setScalar(1 + (1 - hpRatio) * 0.9);
}

export function setDefenseSelected(mesh, selected) {
  if (!mesh) return;
  let ring = mesh.getObjectByName('defenseSelectRing');
  if (!selected) {
    if (ring) ring.visible = false;
    return;
  }
  if (!ring) {
    const geo = new THREE.RingGeometry(2.8, 3.2, 24);
    geo.rotateX(-Math.PI / 2);
    ring = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: 0x5a9fd4,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
      })
    );
    ring.name = 'defenseSelectRing';
    ring.position.y = 0.35;
    mesh.add(ring);
  }
  ring.visible = true;
}