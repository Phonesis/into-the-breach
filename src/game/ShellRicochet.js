import * as THREE from 'three';
import { resolveArmorHit, applyMobilityDamage } from './ArmorPenetration.js';
import { spawnBulletImpact, spawnArmorRicochet } from '../effects/CombatEffects.js';

const shells = [];
const MAX_SHELLS = 24;
const up = new THREE.Vector3(0, 1, 0);
const ray = new THREE.Ray();
const point = new THREE.Vector3();
const box = new THREE.Box3();
const direction = new THREE.Vector3();

/** Reflect the incoming round about the struck hull plate, with a small upward skip. */
export function reflectedShellVelocity(attacker, target, hit) {
  const yaw = target.mesh?.rotation?.y ?? 0;
  const normal = hit.aspect === 'side'
    ? new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
    : new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const incoming = new THREE.Vector3(
    target.position.x - attacker.position.x, 0, target.position.z - attacker.position.z
  ).normalize();
  const reflected = incoming.reflect(normal).normalize().multiplyScalar(30);
  reflected.y = 2.5 + Math.min(45, hit.angleDeg ?? 0) * 0.045;
  return reflected;
}

function removeShell(index) {
  const shell = shells[index];
  if (shell.mesh) {
    shell.mesh.removeFromParent();
    shell.mesh.geometry.dispose();
    shell.mesh.material.dispose();
  }
  shells.splice(index, 1);
}
export function clearShellRicochets() {
  for (let i = shells.length - 1; i >= 0; i--) removeShell(i);
}

export function scheduleShellRicochet({ attacker, target, armorHit, damage, units = [], scenery,
  scene, heightAt = () => 0, onKill, random = Math.random }) {
  // Rockets/HEAT do not leave an intact solid shot. Only a fraction of stopped
  // shells survive as a dangerous ricochet; grazing hits favor survival.
  if (!armorHit?.deflected || !armorHit.impactPosition || shells.length >= MAX_SHELLS ||
      !['tank', 'tankDestroyer', 'superHeavyTank', 'antiTankGun'].includes(attacker.def?.type) ||
      random() > 0.22 + (armorHit.angleDeg ?? 0) / 150) return false;
  const position = new THREE.Vector3().copy(armorHit.impactPosition);
  const velocity = reflectedShellVelocity(attacker, target, armorHit);
  let mesh = null;
  if (scene) {
    mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 0.9, 5),
      new THREE.MeshBasicMaterial({ color: 0xffd99a, toneMapped: false }));
    mesh.name = 'deflectedShell';
    mesh.position.copy(position);
    mesh.quaternion.setFromUnitVectors(up, velocity.clone().normalize());
    scene.add(mesh);
  }
  // Static scenery bounds are collected once, only within the short flight envelope.
  const obstacles = (scenery?.objects ?? []).filter(o => !o.destroyed && o.group &&
    Math.hypot(o.x - position.x, o.z - position.z) < 38 + (o.radius ?? 0))
    .map(entry => ({ entry, bounds: new THREE.Box3().setFromObject(entry.group) }));
  shells.push({ attacker, target, position, velocity, damage: damage * 0.32,
    units, scenery, obstacles, scene, mesh, heightAt, onKill, age: 0 });
  return true;
}

/** Swept segment against a box: prevents tunnelling even at low browser FPS. */
export function segmentBoxHit(from, to, bounds) {
  direction.subVectors(to, from);
  const length = direction.length();
  if (!length) return null;
  ray.set(from, direction.multiplyScalar(1 / length));
  if (bounds.containsPoint(from)) return 0;
  if (!ray.intersectBox(bounds, point)) return null;
  const distance = from.distanceTo(point);
  return distance <= length ? distance / length : null;
}

export function updateShellRicochets(dt) {
  let remaining = Math.min(Math.max(dt, 0), 0.35);
  // Small ballistic steps also catch terrain ridges; collision work only runs
  // for the handful of surviving ricochets, never for every fired round.
  while (remaining > 0) {
    const step = Math.min(remaining, 1 / 30);
    remaining -= step;
    for (let i = shells.length - 1; i >= 0; i--) {
      const s = shells[i];
      const next = s.position.clone().addScaledVector(s.velocity, step);
      next.y -= 4.9 * step * step;
      s.velocity.y -= 9.8 * step;
      s.age += step;
      let fraction = 1, struck = null, sceneryEntry = null;
      const ground = s.heightAt(next.x, next.z) + 0.04;
      let impact = next.y <= ground;
      if (impact) fraction = THREE.MathUtils.clamp((s.position.y - ground) / (s.position.y - next.y), 0, 1);
      for (const unit of s.units) {
        if (unit === s.target || unit.dead || unit.surrendered || unit._mountedOnTankId || unit._mountedOnTruckId || !unit.position) continue;
        const p = unit.position;
        if (Math.hypot(p.x - next.x, p.z - next.z) > 5) continue;
        const type = unit.def?.type;
        const armored = ['tank', 'tankDestroyer', 'superHeavyTank', 'armoredCar'].includes(type);
        const vehicle = armored || ['truck', 'artillery', 'antiTankGun'].includes(type);
        const radius = vehicle ? 1.55 : 0.4;
        const y = p.y ?? unit.mesh?.position?.y ?? s.heightAt(p.x, p.z);
        box.min.set(p.x - radius, y, p.z - radius);
        box.max.set(p.x + radius, y + (armored ? 2.2 : type === 'truck' ? 2.6 : vehicle ? 1.6 : 1.5), p.z + radius);
        const t = segmentBoxHit(s.position, next, box);
        if (t !== null && t <= fraction) { fraction = t; struck = unit; sceneryEntry = null; impact = true; }
      }
      for (const obstacle of s.obstacles) {
        if (obstacle.entry.destroyed) continue;
        const t = segmentBoxHit(s.position, next, obstacle.bounds);
        if (t !== null && t <= fraction) { fraction = t; struck = null; sceneryEntry = obstacle.entry; impact = true; }
      }
      if (impact) {
        const at = s.position.clone().lerp(next, fraction);
        if (struck) {
          const hit = resolveArmorHit({ def: s.attacker.def, position: s.position }, struck,
            { powerScale: 0.32, distance: s.age * 30, weaponRange: 35 });
          if (hit?.mobilityDamaged) applyMobilityDamage(struck, hit.mobilityDamageKind);
          struck.takeDamage(s.damage * (hit?.damageMultiplier ?? 1), {
            explosive: false, impactFrom: s.position.clone(), armorHit: hit,
          });
          if (struck.dead) s.onKill?.(struck);
        } else if (sceneryEntry) {
          s.scenery.damageObject(sceneryEntry, s.damage, {
            weaponType: s.attacker.def.type, explosive: false, impact: at, impactFrom: s.position,
          });
        }
        if (s.scene) {
          if (struck && ['tank', 'tankDestroyer', 'superHeavyTank', 'armoredCar'].includes(struck.def?.type)) spawnArmorRicochet(s.scene, at, s.position);
          else spawnBulletImpact(s.scene, at, { surface: sceneryEntry ? 'stone' : 'soil', scale: 1.3 });
        }
        removeShell(i); // One secondary hit only: no recursive ricochets or HE splash.
      } else if (s.age > 1.15) removeShell(i);
      else {
        s.position.copy(next);
        if (s.mesh) {
          s.mesh.position.copy(next);
          s.mesh.quaternion.setFromUnitVectors(up, direction.copy(s.velocity).normalize());
        }
      }
    }
  }
}
