import * as THREE from 'three';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { refreshHqDamageVisuals, removeHqBurn } from '../effects/HqBurnEffects.js';

export class HQ {
  constructor({ team, position, mapDef, scene, label, maxHp = 800 }) {
    this.team = team;
    this.maxHp = maxHp;
    this.hp = this.maxHp;
    this.dead = false;
    this.selected = false;
    this.label = label;
    this.name = label;
    this.mapDef = mapDef;

    const isPlayer = team === 'player';
    const wallColor = isPlayer ? 0x3a5a7a : 0x6a3a3a;
    const roofColor = 0x2a2a2a;
    const sandbag = 0x8a7a5a;

    const group = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({
      color: wallColor,
      roughness: 0.82,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: roofColor,
      roughness: 0.9,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });
    const bagMat = new THREE.MeshStandardMaterial({
      color: sandbag,
      roughness: 0.95,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });

    const base = new THREE.Mesh(new THREE.BoxGeometry(8, 2.2, 8), wallMat);
    base.position.y = 1.1;
    base.castShadow = true;
    base.receiveShadow = true;
    base.userData.baseColor = new THREE.Color(wallColor);
    group.add(base);

    const upper = new THREE.Mesh(new THREE.BoxGeometry(6, 1.5, 6), wallMat);
    upper.position.y = 2.9;
    upper.castShadow = true;
    upper.userData.baseColor = new THREE.Color(wallColor);
    group.add(upper);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.5, 2, 4), roofMat);
    roof.position.y = 4.6;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    roof.userData.baseColor = new THREE.Color(roofColor);
    group.add(roof);

    this._wallMeshes = [base, upper];
    this._roofMesh = roof;
    this._bagMeshes = [];
    this._impactMarks = [];
    this._structureStage = 0;

    for (const [bx, bz] of [
      [-4.2, 0],
      [4.2, 0],
      [0, -4.2],
      [0, 4.2],
    ]) {
      const bags = new THREE.Mesh(new THREE.BoxGeometry(3, 0.9, 1.2), bagMat);
      bags.position.set(bx, 0.45, bz);
      bags.rotation.y = bx === 0 ? 0 : Math.PI / 2;
      bags.castShadow = true;
      bags.userData.baseColor = new THREE.Color(sandbag);
      this._bagMeshes.push(bags);
      group.add(bags);
    }

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, 5, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a3028 })
    );
    pole.position.y = 5;
    group.add(pole);

    const flagColor = isPlayer ? 0x3b82f6 : 0xef4444;
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 1.6, 4, 2),
      new THREE.MeshStandardMaterial({
        color: flagColor,
        side: THREE.DoubleSide,
        roughness: 0.7,
        emissive: flagColor,
        emissiveIntensity: 0.15,
      })
    );
    flag.position.set(1.4, 6.2, 0);
    this._flagMesh = flag;
    group.add(flag);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(5.8, 6.5, 48),
      new THREE.MeshBasicMaterial({
        color: isPlayer ? 0x4ade80 : 0xf87171,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthTest: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.25;
    ring.name = 'hqSelectionRing';
    group.add(ring);

    const pick = new THREE.Mesh(
      new THREE.BoxGeometry(10, 6, 10),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    pick.position.y = 3;
    pick.name = 'hqPickBox';
    group.add(pick);

    const y = sampleTerrainHeight(position.x, position.z, mapDef);
    group.position.set(position.x, y, position.z);
    this.mesh = group;
    this.mesh.userData.hq = this;
    this.scene = scene;
    this.burnFx = null;
    scene.add(group);
  }

  get position() {
    return this.mesh.position;
  }

  setSelected(on) {
    this.selected = on && !this.dead;
    const ring = this.mesh.getObjectByName('hqSelectionRing');
    if (ring) {
      ring.material.opacity = this.selected ? 0.92 : 0;
      ring.material.color.setHex(this.team === 'player' ? 0x4ade80 : 0xf87171);
    }
    if (this.selected) {
      this.mesh.scale.set(1.02, 1.02, 1.02);
    } else {
      this.mesh.scale.set(1, 1, 1);
    }
  }

  takeDamage(amount) {
    if (this.dead) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.setSelected(false);
    }
    refreshHqDamageVisuals(this, amount);
  }

  dispose(scene) {
    removeHqBurn(this);
    scene.remove(this.mesh);
    this.mesh.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
  }
}