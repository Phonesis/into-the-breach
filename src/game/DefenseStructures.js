import { sampleTerrainHeight } from '../world/Terrain.js';
import {
  createDefenseMesh,
  setDefenseHpVisual,
  setDefenseSelected,
} from '../visual/DefenseMeshes.js';
import { wrapDefenseTarget } from './DefenseTarget.js';
import {
  DEFENSE_TYPES,
  DEFENSE_UPGRADES,
  MINE_VEHICLE_TYPES,
  getBarrageDefForTier,
  getMaxBarrageTier,
  getArtilleryPitCount,
  getBarrageCooldownForEntries,
  TD_MAX_ARTILLERY_PITS,
} from '../data/towerDefense.js';
import { spawnShellExplosion, spawnMuzzleFlash } from '../effects/CombatEffects.js';
import { spawnExplosion } from '../effects/CombatEffects.js';
import { addExplosionCrater } from '../world/TerrainDamage.js';
import { sounds } from '../audio/SoundManager.js';
import { getStructureDamageMultiplier } from './StructureDamage.js';

const ARMOR_TYPES = new Set(['tank', 'superHeavyTank', 'armoredCar']);

const MORTAR_SOUND_BY_FACTION = {
  germany: 'mortar_germany',
  usa: 'mortar_usa',
  uk: 'mortar_uk',
  russia: 'mortar_russia',
};

function disposeMeshTree(mesh) {
  if (!mesh) return;
  mesh.traverse((c) => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      if (c.material.map) c.material.map.dispose();
      c.material.dispose();
    }
  });
}

export class DefenseStructureManager {
  constructor({
    scene,
    mapDef,
    getEnemyUnits,
    getTerrainMesh,
    onChange,
    factionId = 'germany',
    factionAccent = 0xc9a227,
  }) {
    this.scene = scene;
    this.mapDef = mapDef;
    this.getEnemyUnits = getEnemyUnits;
    this.getTerrainMesh = getTerrainMesh ?? (() => null);
    this.onChange = onChange;
    this.factionId = factionId;
    this.factionAccent = factionAccent;
    this.entries = [];
    this.pendingType = null;
    this.barrageCooldown = 0;
    this.barragePending = false;
    this.selectedId = null;
    this._front = { x: 1, z: 0 };
  }

  setFrontlineAxis(fl, playerBase) {
    const dx = fl.x - playerBase.x;
    const dz = fl.z - playerBase.z;
    const len = Math.hypot(dx, dz) || 1;
    this._front = { x: dx / len, z: dz / len };
    this._fl = fl;
    this._playerBase = playerBase;
  }

  /** Y rotation so emplacement +Z local faces toward the frontline (enemy). */
  _placementFacingYaw() {
    return Math.atan2(this._front.x, this._front.z);
  }

  getSelected() {
    if (!this.selectedId) return null;
    return this.entries.find((e) => e.id === this.selectedId && !e.destroyed) ?? null;
  }

  selectEntry(entry, { keepPending = false } = {}) {
    if (entry?.destroyed) return;
    this.selectedId = entry?.id ?? null;
    for (const e of this.entries) {
      setDefenseSelected(e.mesh, e.id === this.selectedId);
    }
    if (!keepPending) {
      this.pendingType = null;
      this.barragePending = false;
    }
    this.onChange?.();
  }

  pickAt(x, z, maxDist = 4) {
    let best = null;
    let bestD = maxDist;
    for (const e of this.entries) {
      if (e.destroyed) continue;
      const d = Math.hypot(x - e.x, z - e.z);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  arm(typeId) {
    const def = DEFENSE_TYPES[typeId];
    if (!def || typeof def.cost !== 'number' || def.cost <= 0) return false;
    if (this.pendingType === typeId) {
      this.pendingType = null;
      return true;
    }
    if (typeId === 'artillery' && this.isArtilleryPitCapReached()) return false;
    this.pendingType = typeId;
    this.barragePending = false;
    this.selectEntry(null, { keepPending: true });
    return true;
  }

  armBarrage() {
    const hasArtillery = this.entries.some(
      (e) => !e.destroyed && (e.typeId === 'artillery' || e.typeId === 'artilleryHeavy')
    );
    if (!hasArtillery || this.barrageCooldown > 0) return false;
    if (this.barragePending) {
      this.barragePending = false;
      return true;
    }
    this.barragePending = true;
    this.pendingType = null;
    this.selectEntry(null, { keepPending: true });
    return true;
  }

  cancelPending() {
    this.pendingType = null;
    this.barragePending = false;
  }

  /** Player side of frontline (toward HQ). + = past line toward enemy. */
  _alongFront(x, z) {
    return (x - this._fl.x) * this._front.x + (z - this._fl.z) * this._front.z;
  }

  canPlaceAt(x, z) {
    if (!this.mapDef || !this._fl) return false;
    const half = this.mapDef.size * 0.5 - 5;
    if (Math.abs(x) > half || Math.abs(z) > half) return false;

    const along = this._alongFront(x, z);
    if (along > 6) return false;

    const distFl = Math.hypot(x - this._fl.x, z - this._fl.z);
    if (distFl > this.mapDef.size * 0.48) return false;

    for (const e of this.entries) {
      if (e.destroyed) continue;
      if (Math.hypot(x - e.x, z - e.z) < e.minSpacing) return false;
    }
    return true;
  }

  isArtilleryPitCapReached() {
    return getArtilleryPitCount(this.entries) >= TD_MAX_ARTILLERY_PITS;
  }

  getEffectiveBarrageCooldown() {
    return getBarrageCooldownForEntries(this.entries);
  }

  getPlacementRejectReason(x, z, typeId = null) {
    if (typeId === 'artillery' && this.isArtilleryPitCapReached()) {
      return `Maximum ${TD_MAX_ARTILLERY_PITS} artillery pits`;
    }
    if (!this.mapDef || !this._fl) return 'Frontline not ready';
    const half = this.mapDef.size * 0.5 - 5;
    if (Math.abs(x) > half || Math.abs(z) > half) return 'Outside the map';
    if (this._alongFront(x, z) > 6) return 'Place on your side of the frontline';
    if (Math.hypot(x - this._fl.x, z - this._fl.z) > this.mapDef.size * 0.48) {
      return 'Too far from the frontline';
    }
    for (const e of this.entries) {
      if (e.destroyed) continue;
      if (Math.hypot(x - e.x, z - e.z) < e.minSpacing) return 'Too close to another emplacement';
    }
    return null;
  }

  _attachEntry(typeId, x, z) {
    const def = DEFENSE_TYPES[typeId];
    const y = sampleTerrainHeight(x, z, this.mapDef);
    const mesh = createDefenseMesh(typeId, this.factionAccent, this.factionId);
    mesh.position.set(x, y, z);
    mesh.userData.defenseEntry = null;
    mesh.rotation.y = this._placementFacingYaw();
    this.scene.add(mesh);

    const entry = {
      id: `def-${this.entries.length + 1}`,
      typeId,
      def: { ...def },
      x,
      z,
      hp: def.hp,
      maxHp: def.hp,
      mesh,
      destroyed: false,
      attackCooldown: 0,
      radius:
        typeId === 'mine'
          ? def.triggerRadius
          : typeId === 'barbedWire' || typeId === 'razorWire'
            ? def.slowRadius
            : 3.2,
      minSpacing:
        typeId === 'mine'
          ? 2.8
          : typeId === 'barbedWire' || typeId === 'razorWire'
            ? 3.5
            : 5.5,
      manager: this,
      _attackTarget: null,
    };
    mesh.userData.defenseEntry = entry;
    this.entries.push(entry);
    return entry;
  }

  tryPlace(typeId, x, z, spend) {
    const def = DEFENSE_TYPES[typeId];
    if (!def || typeof def.cost !== 'number' || def.cost <= 0) return false;
    if (typeId === 'artillery' && this.isArtilleryPitCapReached()) return false;
    if (!this.canPlaceAt(x, z)) return false;
    if (!spend(def.cost)) return false;

    this._attachEntry(typeId, x, z);
    this.pendingType = null;
    this.onChange?.();
    sounds.play('produce');
    return true;
  }

  tryUpgrade(spend) {
    const entry = this.getSelected();
    if (!entry) return false;
    const path = DEFENSE_UPGRADES[entry.typeId];
    if (!path) return false;
    const nextDef = DEFENSE_TYPES[path.next];
    if (!nextDef || !spend(path.cost)) return false;

    const hpRatio = entry.hp / entry.maxHp;
    entry.typeId = path.next;
    entry.def = { ...nextDef };
    entry.maxHp = nextDef.hp;
    entry.hp = Math.max(1, Math.floor(nextDef.hp * Math.max(0.35, hpRatio)));
    entry._attackTarget = null;

    if (entry.mesh?.parent) {
      const rot = entry.mesh.rotation.y;
      this.scene.remove(entry.mesh);
      disposeMeshTree(entry.mesh);
      const y = sampleTerrainHeight(entry.x, entry.z, this.mapDef);
      entry.mesh = createDefenseMesh(entry.typeId, this.factionAccent, this.factionId);
      entry.mesh.position.set(entry.x, y, entry.z);
      entry.mesh.rotation.y = rot;
      entry.mesh.userData.defenseEntry = entry;
      this.scene.add(entry.mesh);
      setDefenseSelected(entry.mesh, true);
    }

    setDefenseHpVisual(entry.mesh, entry.hp / entry.maxHp);
    this.onChange?.();
    sounds.play('capture');
    return true;
  }

  tryBarrage(x, z) {
    if (!this.barragePending || this.barrageCooldown > 0) return false;
    const half = this.mapDef.size * 0.5 - 4;
    if (Math.abs(x) > half || Math.abs(z) > half) return false;
    const toFl = (x - this._fl.x) * this._front.x + (z - this._fl.z) * this._front.z;
    if (toFl < 2) return false;

    const tier = getMaxBarrageTier(this.entries);
    const barrage = getBarrageDefForTier(tier);
    const enemies = this.getEnemyUnits();
    for (const u of enemies) {
      if (u.dead) continue;
      const d = Math.hypot(u.position.x - x, u.position.z - z);
      if (d <= barrage.radius) {
        const fall = Math.max(0.5, 1 - d / barrage.radius);
        u.takeDamage(barrage.damage * fall);
      }
    }
    const y = sampleTerrainHeight(x, z, this.mapDef);
    spawnShellExplosion(this.scene, { x, y: y + 1, z }, 'heavy');
    addExplosionCrater(this.scene, this.mapDef, x, z, 'heavy', this.getTerrainMesh());
    sounds.playWeapon('howitzer_105', { x, z }, { rate: 0.8, volume: 0.9 });
    sounds.playImpact('shell', { x, z }, 0.35);
    this.barrageCooldown = getBarrageCooldownForEntries(this.entries);
    this.barragePending = false;
    this.onChange?.();
    return true;
  }

  getAttackTargets() {
    const out = [];
    for (const e of this.entries) {
      if (e.destroyed || e.typeId === 'mine') continue;
      const t = wrapDefenseTarget(e);
      if (t) out.push(t);
    }
    return out;
  }

  getWireSlowAt(x, z) {
    let mult = 1;
    for (const e of this.entries) {
      if (e.destroyed || (e.typeId !== 'barbedWire' && e.typeId !== 'razorWire')) continue;
      const d = Math.hypot(x - e.x, z - e.z);
      if (d <= e.def.slowRadius) {
        mult = Math.min(mult, e.def.slowMult);
      }
    }
    return mult;
  }

  destroyEntry(entry) {
    entry.destroyed = true;
    entry.hp = 0;
    if (this.selectedId === entry.id) this.selectedId = null;
    if (entry.mesh?.parent) {
      this.scene.remove(entry.mesh);
      entry.mesh.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });
      entry.mesh = null;
    }
    if (entry._attackTarget) entry._attackTarget.dead = true;
    entry._attackTarget = null;
    this.onChange?.();
  }

  onDamaged(entry) {
    setDefenseHpVisual(entry.mesh, entry.hp / entry.maxHp);
    if (entry._attackTarget) {
      entry._attackTarget.dead = entry.destroyed;
    }
    this.onChange?.();
  }

  _updateMines(dt, enemies) {
    for (const entry of this.entries) {
      if (entry.destroyed || entry.typeId !== 'mine') continue;
      for (const u of enemies) {
        if (!MINE_VEHICLE_TYPES.has(u.def.type)) continue;
        const d = Math.hypot(u.position.x - entry.x, u.position.z - entry.z);
        if (d > entry.def.triggerRadius) continue;
        const y = sampleTerrainHeight(entry.x, entry.z, this.mapDef);
        spawnExplosion(this.scene, { x: entry.x, y: y + 0.5, z: entry.z });
        addExplosionCrater(this.scene, this.mapDef, entry.x, entry.z, 'light', this.getTerrainMesh());
        sounds.play('explosion');
        u.takeDamage(entry.def.damage);
        this.destroyEntry(entry);
        break;
      }
    }
  }

  _fireWeapon(entry, target, bestD, scene, mapDef) {
    const def = entry.def;
    const isArmor = ARMOR_TYPES.has(target.def.type);
    let damage = def.damage;
    if (def.antiArmor) {
      damage *= isArmor ? (def.antiArmorMult ?? 1.2) : (def.softMult ?? 0.35);
    } else if (def.weaponType === 'mortar' && ARMOR_TYPES.has(target.def.type)) {
      damage *= 0.55;
    } else if (def.softMult && !ARMOR_TYPES.has(target.def.type)) {
      damage *= def.softMult;
    }
    const falloff = Math.max(0.65, 1 - (bestD / def.range) * 0.28);
    damage *= falloff * (0.88 + Math.random() * 0.22);

    target.takeDamage(damage);
    entry.attackCooldown = 1 / def.attackSpeed;

    const dx = target.position.x - entry.x;
    const dz = target.position.z - entry.z;
    entry.mesh.rotation.y = Math.atan2(dx, dz);

    if (scene && mapDef) {
      const fromY = sampleTerrainHeight(entry.x, entry.z, mapDef) + 1.2;
      const toY = sampleTerrainHeight(target.position.x, target.position.z, mapDef) + 1;
      const from = { x: entry.x, y: fromY, z: entry.z };
      const to = { x: target.position.x, y: toY, z: target.position.z };
      const wType = def.weaponType ?? (def.weaponSound === 'tank_75' ? 'tank' : 'machineGun');
      if (wType === 'mortar') {
        spawnShellExplosion(scene, to, 'medium');
      } else {
        spawnMuzzleFlash(scene, from, to, wType);
      }
    }

    if (def.weaponSound === 'mg') {
      sounds.playWeapon('mg', { x: entry.x, z: entry.z }, { volume: 0.62 });
    } else if (def.weaponSound === 'tank_75') {
      sounds.playWeapon('tank_75', { x: entry.x, z: entry.z }, { volume: 0.72 });
    } else if (def.weaponType === 'mortar' || def.weaponSound === 'mortar') {
      const profile = MORTAR_SOUND_BY_FACTION[this.factionId] ?? 'mortar_germany';
      sounds.playWeapon(profile, { x: entry.x, z: entry.z }, { volume: 0.7 });
    }
  }

  update(dt, scene, mapDef) {
    if (this.barrageCooldown > 0) this.barrageCooldown = Math.max(0, this.barrageCooldown - dt);

    const enemies = this.getEnemyUnits().filter((u) => !u.dead);
    this._updateMines(dt, enemies);

    for (const entry of this.entries) {
      if (entry.destroyed || !entry.def.damage) continue;
      entry.attackCooldown -= dt;
      if (entry.attackCooldown > 0) continue;

      let best = null;
      let bestD = Infinity;

      for (const u of enemies) {
        const d = Math.hypot(u.position.x - entry.x, u.position.z - entry.z);
        if (d > entry.def.range) continue;
        if (entry.def.antiArmor && !ARMOR_TYPES.has(u.def.type) && (entry.def.softMult ?? 0) <= 0) {
          continue;
        }
        if (d < bestD) {
          bestD = d;
          best = u;
        }
      }

      if (!best && entry.def.antiArmor && entry.def.softMult > 0) {
        for (const u of enemies) {
          const d = Math.hypot(u.position.x - entry.x, u.position.z - entry.z);
          if (d <= entry.def.range && d < bestD) {
            bestD = d;
            best = u;
          }
        }
      }

      if (!best) continue;
      this._fireWeapon(entry, best, bestD, scene, mapDef);
    }
  }

  clear() {
    for (const e of this.entries) {
      if (e.mesh?.parent) this.scene.remove(e.mesh);
    }
    this.entries = [];
    this.pendingType = null;
    this.barragePending = false;
    this.barrageCooldown = 0;
    this.selectedId = null;
  }

  getPending() {
    if (this.barragePending) return 'barrage';
    return this.pendingType;
  }

  hasArtillery() {
    return this.entries.some(
      (e) => !e.destroyed && (e.typeId === 'artillery' || e.typeId === 'artilleryHeavy')
    );
  }
}

export function getDefenseDamageMultForAttacker(attackerType) {
  return getStructureDamageMultiplier(attackerType);
}