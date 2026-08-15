import * as THREE from 'three';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { refreshHqDamageVisuals, removeHqBurn } from '../effects/HqBurnEffects.js';
import { removeHqRepairMarker } from '../visual/HealMarkers.js';
import {
  getInfantryUniformTexture,
  getVehicleCamoTexture,
} from '../units/UnitTextures.js';
import { createHqBuildingMesh } from '../visual/HqBuildingMeshes.js';

export class HQ {
  constructor({ team, position, mapDef, scene, label, maxHp = 800, faction = null }) {
    this.team = team;
    this.maxHp = maxHp;
    this.hp = this.maxHp;
    this.dead = false;
    this.selected = false;
    this.label = label;
    this.name = label;
    this.mapDef = mapDef;

    const isPlayer = team === 'player';
    const factionId = faction?.id ?? 'germany';
    const vehicleCamo = factionId ? getVehicleCamoTexture(factionId) : null;
    const infantryCamo = factionId ? getInfantryUniformTexture(factionId) : null;

    const building = createHqBuildingMesh({ factionId, vehicleCamo, infantryCamo });
    const group = building.group;

    this._wallMeshes = building.wallMeshes;
    this._roofMesh = building.roofMesh;
    this._bagMeshes = building.bagMeshes;
    this._impactMarks = [];
    this._structureStage = 0;

    const flagMount = building.flagMount ?? {
      x: 2.9,
      z: -1.7,
      baseY: 0.55,
      height: 6.2,
      direction: 1,
    };
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, 5, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a3028 })
    );
    pole.position.set(flagMount.x, flagMount.baseY + flagMount.height * 0.5, flagMount.z);
    pole.scale.y = flagMount.height / 5;
    pole.castShadow = true;
    group.add(pole);

    const flagColor = faction?.accent ?? (isPlayer ? 0x3b82f6 : 0xef4444);
    const flagMat = new THREE.MeshStandardMaterial({
      color: faction?.flag ? 0xffffff : flagColor,
      side: THREE.DoubleSide,
      roughness: 0.9,
      metalness: 0,
      emissive: flagColor,
      emissiveIntensity: faction?.flag ? 0.05 : 0.15,
    });
    const flagWidth = 2.8;
    const flagHeight = 1.6;
    const flagGeometry = new THREE.PlaneGeometry(flagWidth, flagHeight, 8, 4);
    const flagPositions = flagGeometry.attributes.position;
    for (let i = 0; i < flagPositions.count; i += 1) {
      const x = flagPositions.getX(i);
      const y = flagPositions.getY(i);
      const alongCloth = (x + flagWidth * 0.5) / flagWidth;
      const fold = Math.sin(alongCloth * Math.PI * 2.4 + y * 1.6);
      flagPositions.setZ(i, fold * (0.025 + alongCloth * 0.055));
    }
    flagPositions.needsUpdate = true;
    flagGeometry.computeVertexNormals();
    const flag = new THREE.Mesh(flagGeometry, flagMat);
    const flagDirection = flagMount.direction ?? 1;
    flag.position.set(
      flagMount.x + flagDirection * flagWidth * 0.5,
      flagMount.baseY + flagMount.height - flagHeight * 0.5 - 0.12,
      flagMount.z
    );
    flag.scale.x = flagDirection;
    flag.castShadow = true;
    if (faction?.flag) {
      new THREE.TextureLoader().load(faction.flag, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        const imageAspect = tex.image?.width / tex.image?.height;
        if (Number.isFinite(imageAspect) && imageAspect > 0) {
          flag.scale.y = flagWidth / imageAspect / flagHeight;
        }
        flagMat.map = tex;
        flagMat.needsUpdate = true;
      });
    }
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
      new THREE.BoxGeometry(10, 7.4, 10),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    pick.position.y = 3.7;
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
    this._lastDamageAtPerf = performance.now();
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.setSelected(false);
    }
    refreshHqDamageVisuals(this, amount);
  }

  repair(amount) {
    if (this.dead || amount <= 0 || this.hp >= this.maxHp) return false;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    if (this.hp > before) {
      refreshHqDamageVisuals(this, 0);
      return true;
    }
    return false;
  }

  dispose(scene) {
    removeHqBurn(this);
    removeHqRepairMarker(this);
    scene.remove(this.mesh);
    this.mesh.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (c.material.map) c.material.map.dispose();
        c.material.dispose();
      }
    });
  }
}
