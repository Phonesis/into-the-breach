import * as THREE from 'three';
import { sampleTerrainHeight } from '../world/Terrain.js';

const RADIUS = 14;
const CAPTURE_SPEED = 0.22;
const FLAG_POLE_TOP = 3.5;
const FLAG_DOWN_ANGLE = Math.PI / 2;
const FLAG_LERP = 10;

const TEAM_COLORS = {
  player: 0x3b82f6,
  enemy: 0xef4444,
  neutral: 0x888888,
};

export class CapturePoint {
  constructor({ def, mapDef, scene }) {
    this.id = def.id;
    this.name = def.name;
    this.x = def.x;
    this.z = def.z;
    this.isFrontline = !!def.frontline;
    this.owner = null;
    this.progress = 0;
    this.capturingTeam = null;
    this._capturePlayed = false;
    this._flagAngle = FLAG_DOWN_ANGLE;
    this._contested = false;
    this._capturePhase = 'idle';

    const y = sampleTerrainHeight(def.x, def.z, mapDef);
    this.group = new THREE.Group();
    this.group.position.set(def.x, y, def.z);

    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(RADIUS * 0.85, RADIUS * 0.85, 0.12, 40),
      new THREE.MeshStandardMaterial({
        color: 0x5a5a52,
        emissive: 0x222222,
        emissiveIntensity: 0.08,
        transparent: true,
        opacity: 0.5,
        roughness: 0.85,
        metalness: 0.08,
      })
    );
    pad.position.y = 0.08;
    pad.name = 'capturePad';
    this.group.add(pad);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(RADIUS * 0.72, RADIUS * 0.84, 56),
      new THREE.MeshStandardMaterial({
        color: 0x888888,
        emissive: 0x444444,
        emissiveIntensity: 0.4,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        roughness: 0.5,
      })
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.2;
    this.group.add(this.ring);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, FLAG_POLE_TOP, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a4035 })
    );
    pole.position.y = FLAG_POLE_TOP / 2;
    this.group.add(pole);

    this.flagPivot = new THREE.Group();
    this.flagPivot.position.y = FLAG_POLE_TOP;
    this.group.add(this.flagPivot);

    this.flag = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 1.1, 2, 1),
      new THREE.MeshStandardMaterial({
        color: 0x888888,
        side: THREE.DoubleSide,
        emissive: 0x444444,
        emissiveIntensity: 0.15,
        roughness: 0.8,
      })
    );
    this.flag.position.set(0.95, -0.55, 0);
    this.flagPivot.add(this.flag);

    const label = this._makeLabel(def.name);
    label.position.set(0, 4.8, 0);
    this.group.add(label);

    scene.add(this.group);
    this._updateVisuals(0);
  }

  _makeLabel(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#e8e4dc';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, 128, 40);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
    );
    sprite.scale.set(8, 2, 1);
    return sprite;
  }

  update(units, dt, onCaptured) {
    let playerCount = 0;
    let enemyCount = 0;

    for (const u of units) {
      if (u.dead) continue;
      const dx = u.position.x - this.x;
      const dz = u.position.z - this.z;
      if (dx * dx + dz * dz <= RADIUS * RADIUS) {
        if (u.team === 'player') playerCount++;
        else enemyCount++;
      }
    }

    let push = 0;
    if (playerCount > enemyCount) push = CAPTURE_SPEED * dt * (1 + (playerCount - enemyCount) * 0.15);
    else if (enemyCount > playerCount) push = -CAPTURE_SPEED * dt * (1 + (enemyCount - playerCount) * 0.15);

    const prevOwner = this.owner;

    if (push > 0) {
      this.capturingTeam = 'player';
      if (this.owner === 'enemy') {
        this.progress = Math.max(0, this.progress - push);
        if (this.progress <= 0) {
          this.owner = null;
          this.progress = 0;
        }
      } else {
        this.progress = Math.min(1, this.progress + push);
        if (this.progress >= 1) this.owner = 'player';
      }
    } else if (push < 0) {
      this.capturingTeam = 'enemy';
      if (this.owner === 'player') {
        this.progress = Math.max(0, this.progress + push);
        if (this.progress <= 0) {
          this.owner = null;
          this.progress = 0;
        }
      } else {
        this.progress = Math.min(1, this.progress - push);
        if (this.progress >= 1) this.owner = 'enemy';
      }
    } else if (this.owner && !this.capturingTeam) {
      this.progress = 1;
    } else if (!this.owner) {
      this.progress = Math.max(0, this.progress - dt * 0.05);
      if (this.progress <= 0.001) this.capturingTeam = null;
    }

    this._contested = this._computeContested();
    this._updateVisuals(dt);

    if (prevOwner !== this.owner && this.owner && onCaptured) {
      onCaptured(this, this.owner);
    }
  }

  _computeContested() {
    if (this.owner && this.capturingTeam && this.capturingTeam !== this.owner) {
      return true;
    }
    if (!this.owner && this.capturingTeam && this.progress > 0.01 && this.progress < 0.995) {
      return true;
    }
    return false;
  }

  /** @returns {{ angle: number, color: number, phase: string }} */
  _computeFlagTarget() {
    const neutral = TEAM_COLORS.neutral;

    if (this.owner && this.capturingTeam && this.capturingTeam !== this.owner) {
      const lowerT = this.owner === 'enemy' && this.capturingTeam === 'player'
        ? 1 - this.progress
        : this.progress < 0.995
          ? 1 - this.progress
          : 0;
      if (lowerT > 0.005) {
        return {
          angle: lowerT * FLAG_DOWN_ANGLE,
          color: TEAM_COLORS[this.owner],
          phase: 'lowering',
        };
      }
    }

    if (!this.owner && this.capturingTeam && this.progress > 0.01 && this.progress < 0.995) {
      if (this.progress < 0.5) {
        return {
          angle: FLAG_DOWN_ANGLE,
          color: neutral,
          phase: 'lowering',
        };
      }
      const raiseT = (this.progress - 0.5) / 0.5;
      return {
        angle: FLAG_DOWN_ANGLE * (1 - raiseT),
        color: TEAM_COLORS[this.capturingTeam] ?? neutral,
        phase: 'raising',
      };
    }

    if (this.owner) {
      return { angle: 0, color: TEAM_COLORS[this.owner], phase: 'held' };
    }

    return { angle: FLAG_DOWN_ANGLE, color: neutral, phase: 'idle' };
  }

  _updateVisuals(dt = 0) {
    const target = this._computeFlagTarget();
    this._capturePhase = target.phase;

    const lerpFactor = dt > 0 ? 1 - Math.exp(-FLAG_LERP * dt) : 1;
    this._flagAngle += (target.angle - this._flagAngle) * lerpFactor;
    this.flagPivot.rotation.x = this._flagAngle;
    this._applyFlagColor(target.color);

    const colors = TEAM_COLORS;
    let col = colors.neutral;
    if (this.owner === 'player') col = colors.player;
    else if (this.owner === 'enemy') col = colors.enemy;
    else if (this.capturingTeam === 'player') col = 0x60a5fa;
    else if (this.capturingTeam === 'enemy') col = 0xf87171;

    this.ring.material.color.setHex(col);
    this.ring.material.emissive.setHex(col);
    const pulse = this._contested ? 0.12 * Math.sin(performance.now() * 0.006) : 0;
    this.ring.material.emissiveIntensity = 0.35 + this.progress * 0.45 + pulse;
    this.ring.material.opacity = this._contested ? 0.7 + this.progress * 0.25 : 0.55 + this.progress * 0.35;

    const pad = this.group.getObjectByName('capturePad');
    if (pad?.material?.emissive) {
      pad.material.opacity = this._contested ? 0.62 : 0.5;
      pad.material.emissive.setHex(col);
      pad.material.emissiveIntensity = this._contested ? 0.25 + pulse : 0.08;
    }
  }

  _applyFlagColor(hex) {
    this.flag.material.color.setHex(hex);
    if (this.flag.material.emissive) {
      this.flag.material.emissive.setHex(hex);
      this.flag.material.emissiveIntensity = this._contested ? 0.35 : 0.2;
    }
  }

  /** HUD helper */
  getCaptureStatus() {
    if (this._contested) {
      const team = this.capturingTeam;
      const pct = Math.round(this.progress * 100);
      if (this._capturePhase === 'lowering' && this.owner) {
        return {
          contested: true,
          label: `Contested — lowering ${this.owner === 'player' ? 'friendly' : 'enemy'} flag`,
          pct,
          team,
          phase: 'lowering',
        };
      }
      if (this._capturePhase === 'raising') {
        return {
          contested: true,
          label: `Capturing — raising ${team === 'player' ? 'friendly' : 'enemy'} flag`,
          pct,
          team,
          phase: 'raising',
        };
      }
      return {
        contested: true,
        label: `Contested — ${pct}%`,
        pct,
        team,
        phase: this._capturePhase,
      };
    }
    if (this.owner === 'player') return { contested: false, label: 'Held (yours)', pct: 100, team: 'player' };
    if (this.owner === 'enemy') return { contested: false, label: 'Held (enemy)', pct: 100, team: 'enemy' };
    return { contested: false, label: 'Neutral', pct: 0, team: null };
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (c.material.map) c.material.map.dispose();
        c.material.dispose();
      }
    });
  }
}

export function createCapturePoints(mapDef, scene) {
  const defs = mapDef.capturePoints ?? [];
  const fl = mapDef.frontline;
  return defs.map((d, i) => {
    const isFrontline =
      d.frontline ||
      (fl && Math.hypot(d.x - fl.x, d.z - fl.z) < 1.5);
    return new CapturePoint({
      def: { ...d, id: d.id ?? `cp-${i}`, frontline: isFrontline },
      mapDef,
      scene,
    });
  });
}