import * as THREE from 'three';
import { distanceBetween } from '../game/Targeting.js';
import { MEDIC_AURA_RANGE } from '../game/MedicBehavior.js';
import {
  ENGINEER_AURA_RANGE,
  isEngineerNearHq,
  isHqBeingRepairedByEngineers,
} from '../game/EngineerBehavior.js';
import { getActiveHospitals, isUnitNearHospital } from '../game/HospitalBehavior.js';
import { getActiveMotorPools, isUnitNearMotorPool } from '../game/MotorPoolBehavior.js';
import { isFootSoldier, isVehicleUnit } from '../units/VehicleTypes.js';

const _tex = { cross: null, spanner: null };

const MARKER_HEIGHT = {
  infantry: 2.55,
  medic: 2.55,
  engineer: 2.55,
  machineGun: 2.65,
  sniper: 2.8,
  mortar: 2.7,
  antiTankGun: 2.9,
  armoredCar: 3.3,
  tank: 4.1,
  superHeavyTank: 4.6,
  artillery: 3.7,
};

function markerYOffset(unit) {
  let y = MARKER_HEIGHT[unit.def?.type] ?? 2.6;
  if (unit.retreating) y += 2.3;
  if (unit.coverMarker?.visible) y += 1.7;
  if (unit.fieldIcon?.visible) y += 1.1;
  return y;
}

function getCrossTexture() {
  if (_tex.cross) return _tex.cross;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(12, 42, 28, 0.9)';
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120, 220, 160, 0.95)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#f2fff6';
  ctx.fillRect(27, 14, 10, 36);
  ctx.fillRect(14, 27, 36, 10);

  _tex.cross = new THREE.CanvasTexture(canvas);
  return _tex.cross;
}

function getSpannerTexture() {
  if (_tex.spanner) return _tex.spanner;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(38, 28, 12, 0.92)';
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 196, 88, 0.95)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.strokeStyle = '#ffd98a';
  ctx.fillStyle = '#ffd98a';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.arc(24, 24, 9, 0.35 * Math.PI, 1.65 * Math.PI);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(30, 30);
  ctx.lineTo(46, 46);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(46, 40);
  ctx.lineTo(52, 46);
  ctx.lineTo(46, 52);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(18, 18);
  ctx.lineTo(12, 12);
  ctx.stroke();

  _tex.spanner = new THREE.CanvasTexture(canvas);
  return _tex.spanner;
}

function canReceiveMedicHeal(ally) {
  if (!ally || ally.dead || ally.hp >= ally.maxHp) return false;
  if (!isFootSoldier(ally.def?.type)) return false;
  if (ally.def?.type === 'medic' || ally.def?.type === 'engineer') return false;
  return true;
}

function canReceiveEngineerHeal(ally) {
  if (!ally || ally.dead || ally.hp >= ally.maxHp) return false;
  return isVehicleUnit(ally.def?.type);
}

function engineerIsWorking(unit, units, hqs) {
  if (!unit || unit.dead || unit.def?.type !== 'engineer') return false;

  for (const ally of units) {
    if (ally.team !== unit.team || ally.id === unit.id) continue;
    if (ally.dead) {
      if (
        ally._recoverableWreck &&
        distanceBetween(unit, ally) <= ENGINEER_AURA_RANGE
      ) {
        return true;
      }
      continue;
    }
    if (!canReceiveEngineerHeal(ally)) continue;
    if (distanceBetween(unit, ally) <= ENGINEER_AURA_RANGE) return true;
  }

  for (const hq of hqs ?? []) {
    if (isEngineerNearHq(unit, hq)) return true;
  }
  return false;
}

function getHealKind(unit, units, baseBuildings, hqs = null, depotCache = null) {
  if (!unit) return null;

  // Recoverable hulls remain dead units until the restart completes, but need
  // immediate repair feedback just like a damaged living vehicle.
  if (unit.dead) {
    if (!unit._recoverableWreck) return null;
    for (const engineer of units) {
      if (engineer.dead || engineer.team !== unit.team || engineer.def?.type !== 'engineer') {
        continue;
      }
      if (distanceBetween(unit, engineer) <= ENGINEER_AURA_RANGE) return 'engineer';
    }
    return null;
  }

  if (unit.def?.type === 'engineer' && engineerIsWorking(unit, units, hqs)) {
    return 'engineer';
  }

  for (const medic of units) {
    if (medic.dead || medic.team !== unit.team || medic.def?.type !== 'medic') continue;
    if (!canReceiveMedicHeal(unit)) continue;
    if (distanceBetween(unit, medic) <= MEDIC_AURA_RANGE) return 'medic';
  }

  const hospitals = depotCache?.hospitals ?? getActiveHospitals(baseBuildings);
  if (isUnitNearHospital(unit, hospitals)) return 'medic';

  const motorPools = depotCache?.motorPools ?? getActiveMotorPools(baseBuildings);
  if (isUnitNearMotorPool(unit, motorPools)) return 'engineer';

  for (const engineer of units) {
    if (engineer.dead || engineer.team !== unit.team || engineer.def?.type !== 'engineer') continue;
    if (!canReceiveEngineerHeal(unit)) continue;
    if (distanceBetween(unit, engineer) <= ENGINEER_AURA_RANGE) return 'engineer';
  }

  return null;
}

function attachHealMarker(unit, kind) {
  if (!unit.mesh) return;
  const map = kind === 'medic' ? getCrossTexture() : getSpannerTexture();
  const baseScale = kind === 'medic' ? 1.85 : 1.9;

  if (!unit.healMarker) {
    const mat = new THREE.SpriteMaterial({
      map,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.name = 'healMarker';
    sprite.renderOrder = 26;
    unit.mesh.add(sprite);
    unit.healMarker = sprite;
    unit.healMarkerKind = kind;
  } else if (unit.healMarkerKind !== kind) {
    unit.healMarker.material.map = map;
    unit.healMarker.material.needsUpdate = true;
    unit.healMarkerKind = kind;
  }

  unit.healMarker.visible = true;
  unit.healMarker.position.y = markerYOffset(unit);
  const pulse = 1 + Math.sin(performance.now() * 0.008) * 0.08;
  unit.healMarker.scale.set(baseScale * pulse, baseScale * pulse, 1);
}

export function removeHealMarker(unit) {
  const marker = unit.healMarker;
  if (!marker) return;
  if (marker.parent) marker.parent.remove(marker);
  marker.material?.dispose();
  unit.healMarker = null;
  unit.healMarkerKind = null;
}

function attachHqRepairMarker(hq) {
  if (!hq?.mesh) return;
  const map = getSpannerTexture();
  const baseScale = 2.4;

  if (!hq.repairMarker) {
    const mat = new THREE.SpriteMaterial({
      map,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.name = 'hqRepairMarker';
    sprite.renderOrder = 26;
    hq.mesh.add(sprite);
    hq.repairMarker = sprite;
  }

  hq.repairMarker.visible = true;
  hq.repairMarker.position.y = 7.2;
  const pulse = 1 + Math.sin(performance.now() * 0.008) * 0.08;
  hq.repairMarker.scale.set(baseScale * pulse, baseScale * pulse, 1);
}

export function removeHqRepairMarker(hq) {
  const marker = hq?.repairMarker;
  if (!marker) return;
  if (marker.parent) marker.parent.remove(marker);
  marker.material?.dispose();
  hq.repairMarker = null;
}

export function syncHealMarkers(units, baseBuildings = null, hqs = null, depotCache = null) {
  const hospitals = depotCache?.hospitals ?? getActiveHospitals(baseBuildings);
  const motorPools = depotCache?.motorPools ?? getActiveMotorPools(baseBuildings);
  const cache = depotCache ?? { hospitals, motorPools };

  for (const unit of units) {
    if ((unit.dead && !unit._recoverableWreck) || !unit.mesh) {
      removeHealMarker(unit);
      continue;
    }

    const kind = getHealKind(unit, units, baseBuildings, hqs, cache);
    if (!kind) {
      removeHealMarker(unit);
      continue;
    }

    attachHealMarker(unit, kind);
  }

  for (const hq of hqs ?? []) {
    if (hq.dead || !hq.mesh) {
      removeHqRepairMarker(hq);
      continue;
    }
    if (isHqBeingRepairedByEngineers(hq, units)) {
      attachHqRepairMarker(hq);
    } else {
      removeHqRepairMarker(hq);
    }
  }
}
