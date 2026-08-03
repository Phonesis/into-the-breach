import * as THREE from 'three';
import { isUnitGarrisoned } from '../game/BunkerGarrison.js';
import {
  COMMANDER_AURA_RANGE,
  isUnitInspiredByCommander,
} from '../game/CommanderBehavior.js';
import { sampleTerrainHeight } from '../world/Terrain.js';

let inspiredTexture = null;

const MARKER_HEIGHT = {
  commander: 2.85,
  radioOperator: 2.45,
  infantry: 2.45,
  paratrooper: 2.55,
  medic: 2.45,
  engineer: 2.45,
  vehicleCrew: 2.45,
  machineGun: 2.55,
  sniper: 2.7,
  mortar: 2.65,
  antiTankGun: 2.95,
  armoredCar: 3.35,
  tank: 4.15,
  tankDestroyer: 4.15,
  superHeavyTank: 4.65,
  artillery: 3.75,
};

function markerHeight(unit) {
  let y = MARKER_HEIGHT[unit.def?.type] ?? 2.65;
  if (unit.retreating) y += 2.3;
  if (unit.coverMarker?.visible) y += 1.7;
  return y + 1.7;
}

function needsWorldSpaceMarker(unit) {
  return isUnitGarrisoned(unit) && unit.mesh && !unit.mesh.visible && !!unit.mesh.parent;
}

function getInspiredTexture() {
  if (inspiredTexture) return inspiredTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 190;
  canvas.height = 78;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(67, 53, 15, 0.95)';
  ctx.beginPath();
  ctx.roundRect(6, 8, 178, 62, 10);
  ctx.fill();
  ctx.strokeStyle = '#dfbe55';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  ctx.fillStyle = '#ffe9a5';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('INSPIRED', 105, 29);

  ctx.fillStyle = '#ffe7a0';
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText(`Commander · ${COMMANDER_AURA_RANGE} m`, 105, 51);

  ctx.fillStyle = '#f3d46f';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText('✦', 25, 38);

  inspiredTexture = new THREE.CanvasTexture(canvas);
  return inspiredTexture;
}

function updateInspiredMarkerTransform(unit) {
  const marker = unit?.inspiredMarker;
  if (!marker || !unit.mesh) return;

  const worldSpace = needsWorldSpaceMarker(unit);
  const desiredParent = worldSpace ? unit.mesh.parent : unit.mesh;
  if (!desiredParent) return;
  if (marker.parent !== desiredParent) desiredParent.add(marker);

  marker.userData.worldSpace = worldSpace;
  const bob = Math.sin(performance.now() * 0.004 + unit.id * 0.3) * 0.08;
  if (worldSpace) {
    const yBase = unit._mapDef
      ? sampleTerrainHeight(unit.position.x, unit.position.z, unit._mapDef)
      : unit.position.y;
    const slot = unit._garrisonSlotIndex ?? 0;
    marker.position.set(
      unit.position.x + (slot - 0.5) * 0.85,
      yBase + 7.9 + slot * 1.35 + bob,
      unit.position.z
    );
    marker.scale.set(4.4, 1.85, 1);
  } else {
    marker.position.set(0, markerHeight(unit) + bob, 0);
    marker.scale.set(3.8, 1.65, 1);
  }
  marker.visible = true;
}

export function attachMoraleMarker(unit) {
  if (!unit?.mesh) return;

  const map = getInspiredTexture();
  if (!unit.inspiredMarker) {
    const mat = new THREE.SpriteMaterial({
      map,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.name = 'inspiredMarker';
    sprite.renderOrder = 26;
    unit.mesh.add(sprite);
    unit.inspiredMarker = sprite;
  } else if (unit.inspiredMarker.material.map !== map) {
    unit.inspiredMarker.material.map = map;
    unit.inspiredMarker.material.needsUpdate = true;
  }

  updateInspiredMarkerTransform(unit);
}

export function removeMoraleMarker(unit) {
  const marker = unit?.inspiredMarker;
  if (!marker) return;
  if (marker.parent) marker.parent.remove(marker);
  marker.material?.dispose();
  unit.inspiredMarker = null;
}

export function syncMoraleMarkers(units, allUnits = units) {
  for (const unit of units ?? []) {
    if (
      !unit?.mesh ||
      unit.dead ||
      unit.surrendered ||
      unit._captureExit ||
      unit._mountedOnTankId ||
      !isUnitInspiredByCommander(unit, allUnits ?? [])
    ) {
      removeMoraleMarker(unit);
      continue;
    }
    attachMoraleMarker(unit);
  }
}
