import { sampleTerrainHeight } from '../world/Terrain.js';
import { isTankType } from '../units/VehicleTypes.js';

export const MINIMAP_VISIBLE_KEY = 'ww2-rts-minimap-visible';

const TERRAIN_RES = 144;
const PLAYER_TEAM = 'player';

const VEHICLE_TYPES = new Set([
  'tank',
  'superHeavyTank',
  'armoredCar',
  'artillery',
  'antiTankGun',
  'mortar',
]);

const MAX_FIRE_TRACES = 88;
const TRACE_LIFE_DEFAULT = 1.05;

const HEAVY_WEAPONS = new Set(['tank', 'superHeavyTank', 'antiTankGun', 'artillery', 'mortar']);

function traceLifetime(weaponType) {
  if (weaponType === 'artillery') return 1.75;
  if (weaponType === 'mortar' || weaponType === 'antiTankGun') return 1.45;
  if (weaponType === 'tank' || weaponType === 'superHeavyTank') return 1.25;
  if (weaponType === 'machineGun' || weaponType === 'armoredCar') return 0.95;
  return TRACE_LIFE_DEFAULT;
}

function traceLineWidth(weaponType) {
  if (weaponType === 'artillery' || weaponType === 'mortar') return 1.65;
  if (HEAVY_WEAPONS.has(weaponType)) return 1.35;
  if (weaponType === 'machineGun') return 0.75;
  return 0.55;
}

function hexRgb(hex) {
  return {
    r: (hex >> 16) & 255,
    g: (hex >> 8) & 255,
    b: hex & 255,
  };
}

function buildTerrainBitmap(mapDef) {
  const canvas = document.createElement('canvas');
  canvas.width = TERRAIN_RES;
  canvas.height = TERRAIN_RES;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(TERRAIN_RES, TERRAIN_RES);
  const c1 = hexRgb(mapDef.groundColor ?? 0x4a6b3a);
  const c2 = hexRgb(mapDef.groundColor2 ?? mapDef.groundColor ?? 0x3d5a32);

  for (let py = 0; py < TERRAIN_RES; py++) {
    for (let px = 0; px < TERRAIN_RES; px++) {
      const x = ((px + 0.5) / TERRAIN_RES - 0.5) * mapDef.size;
      const z = ((py + 0.5) / TERRAIN_RES - 0.5) * mapDef.size;
      const h = sampleTerrainHeight(x, z, mapDef);
      const t = Math.max(0, Math.min(1, (h + 3) / 12));
      const tint = 0.78 + Math.min(1, Math.abs(h) / 6) * 0.14;
      const r = (c1.r + (c2.r - c1.r) * t) * tint;
      const g = (c1.g + (c2.g - c1.g) * t) * tint;
      const b = (c1.b + (c2.b - c1.b) * t) * tint;
      const i = (py * TERRAIN_RES + px) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

function unitDotRadius(unit) {
  const type = unit.def?.type;
  if (!type) return 2.2;
  if (isTankType(type)) return 3.4;
  if (VEHICLE_TYPES.has(type)) return 2.8;
  return 2.2;
}

export class BattleMinimap {
  constructor(root, callbacks = {}) {
    this.root = root;
    this.callbacks = callbacks;
    this.visible = localStorage.getItem(MINIMAP_VISIBLE_KEY) !== '0';
    this.mapDef = null;
    this.terrainBitmap = null;
    this._terrainKey = '';
    this.fireTraces = [];

    this.wrap = root.querySelector('#battle-minimap');
    this.canvas = root.querySelector('#battle-minimap-canvas');
    this.showBtn = root.querySelector('#btn-show-minimap');
    this.toggleBtn = root.querySelector('#btn-toggle-minimap');
    this.ctx = this.canvas?.getContext('2d');

    this.toggleBtn?.addEventListener('click', () => this.setVisible(false));
    this.showBtn?.addEventListener('click', () => this.setVisible(true));
    this.canvas?.addEventListener('click', (e) => this._onCanvasClick(e));

    this._syncVisibility();
  }

  setMapDef(mapDef) {
    if (!mapDef) return;
    const key = `${mapDef.id}:${mapDef.size}:${mapDef.terrain}`;
    if (key === this._terrainKey && this.terrainBitmap) {
      this.mapDef = mapDef;
      return;
    }
    this.mapDef = mapDef;
    this._terrainKey = key;
    this.terrainBitmap = buildTerrainBitmap(mapDef);
  }

  setVisible(on) {
    this.visible = !!on;
    localStorage.setItem(MINIMAP_VISIBLE_KEY, this.visible ? '1' : '0');
    this._syncVisibility();
    this.callbacks.onToggleMinimap?.(this.visible);
  }

  _syncVisibility() {
    this.wrap?.classList.toggle('hidden', !this.visible);
    this.showBtn?.classList.toggle('hidden', this.visible);
    if (this.toggleBtn) {
      this.toggleBtn.textContent = 'Hide';
      this.toggleBtn.setAttribute('aria-pressed', this.visible ? 'true' : 'false');
    }
    if (this.showBtn) {
      this.showBtn.setAttribute('aria-pressed', this.visible ? 'true' : 'false');
    }
  }

  clear() {
    this.mapDef = null;
    this.terrainBitmap = null;
    this._terrainKey = '';
    this.fireTraces = [];
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /**
   * @param {{ fromX: number, fromZ: number, toX: number, toZ: number, team?: string, weaponType?: string }} shot
   */
  recordFireTrace(shot) {
    if (
      shot.fromX == null ||
      shot.fromZ == null ||
      shot.toX == null ||
      shot.toZ == null ||
      !this.mapDef
    ) {
      return;
    }
    const weaponType = shot.weaponType ?? 'infantry';
    this.fireTraces.push({
      x1: shot.fromX,
      z1: shot.fromZ,
      x2: shot.toX,
      z2: shot.toZ,
      team: shot.team ?? 'enemy',
      weaponType,
      age: 0,
      life: traceLifetime(weaponType),
    });
    if (this.fireTraces.length > MAX_FIRE_TRACES) {
      this.fireTraces.splice(0, this.fireTraces.length - MAX_FIRE_TRACES);
    }
  }

  tickFireTraces(dt) {
    if (!this.fireTraces.length) return false;
    for (let i = this.fireTraces.length - 1; i >= 0; i--) {
      this.fireTraces[i].age += dt;
      if (this.fireTraces[i].age >= this.fireTraces[i].life) {
        this.fireTraces.splice(i, 1);
      }
    }
    return this.fireTraces.length > 0;
  }

  hasFireTraces() {
    return this.fireTraces.length > 0;
  }

  worldToCanvas(x, z) {
    const size = this.mapDef.size;
    const w = this.canvas.width;
    const h = this.canvas.height;
    return {
      x: ((x / size) + 0.5) * w,
      y: ((z / size) + 0.5) * h,
    };
  }

  canvasToWorld(px, py) {
    const size = this.mapDef.size;
    const w = this.canvas.width;
    const h = this.canvas.height;
    return {
      x: (px / w - 0.5) * size,
      z: (py / h - 0.5) * size,
    };
  }

  _onCanvasClick(e) {
    if (!this.mapDef || !this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * this.canvas.width;
    const py = ((e.clientY - rect.top) / rect.height) * this.canvas.height;
    const { x, z } = this.canvasToWorld(px, py);
    this.callbacks.onPanTo?.(x, z);
  }

  /**
   * @param {object} state
   * @param {import('../data/maps.js').MAPS[keyof MAPS]} state.mapDef
   * @param {object[]} state.playerUnits
   * @param {object[]} state.enemyUnits
   * @param {object[]} [state.hqs]
   * @param {{ x: number, z: number, zoom: number }} state.camera
   */
  update(state) {
    if (!this.visible || !this.ctx || !this.canvas || !this.mapDef) return;
    if (!this.terrainBitmap) this.setMapDef(this.mapDef);

    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.drawImage(this.terrainBitmap, 0, 0, width, height);

    this._drawBorder();
    this._drawFireTraces();
    this._drawCameraViewport(state.camera);
    this._drawHqs(state.hqs ?? []);
    this._drawUnits(state.playerUnits ?? [], '#4ade80', '#166534');
    this._drawUnits(state.enemyUnits ?? [], '#f87171', '#7f1d1d');
  }

  _drawFireTraces() {
    if (!this.fireTraces.length) return;
    const ctx = this.ctx;

    for (const trace of this.fireTraces) {
      const fade = 1 - trace.age / trace.life;
      if (fade <= 0.02) continue;

      const p1 = this.worldToCanvas(trace.x1, trace.z1);
      const p2 = this.worldToCanvas(trace.x2, trace.z2);
      const friendly = trace.team === PLAYER_TEAM;
      const width = traceLineWidth(trace.weaponType) * (0.55 + fade * 0.45);

      const glowRgb = friendly ? '250, 204, 21' : '248, 113, 113';
      const coreRgb = friendly ? '253, 224, 71' : '252, 165, 165';
      const headRgb = friendly ? '254, 240, 138' : '254, 202, 202';

      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(${glowRgb}, ${fade * 0.32})`;
      ctx.lineWidth = width * 3.2;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      const grad = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
      grad.addColorStop(0, `rgba(${glowRgb}, 0)`);
      grad.addColorStop(0.4, `rgba(${coreRgb}, ${fade * 0.5})`);
      grad.addColorStop(1, `rgba(${headRgb}, ${fade * 0.92})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      ctx.fillStyle = `rgba(${headRgb}, ${fade * 0.88})`;
      ctx.beginPath();
      ctx.arc(p2.x, p2.y, 1 + fade * 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  _drawBorder() {
    const { width, height } = this.canvas;
    this.ctx.strokeStyle = 'rgba(201, 162, 39, 0.45)';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  }

  _drawCameraViewport(camera) {
    if (!camera) return;
    const { x, y } = this.worldToCanvas(camera.x, camera.z);
    const viewHalf = Math.max(10, camera.zoom * 0.62);
    const size = this.mapDef.size;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const rw = (viewHalf / size) * w;
    const rh = (viewHalf / size) * h;

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(200, 220, 255, 0.85)';
    this.ctx.lineWidth = 1.25;
    this.ctx.setLineDash([4, 3]);
    this.ctx.strokeRect(x - rw, y - rh, rw * 2, rh * 2);
    this.ctx.fillStyle = 'rgba(140, 180, 255, 0.08)';
    this.ctx.fillRect(x - rw, y - rh, rw * 2, rh * 2);
    this.ctx.restore();
  }

  _drawHqs(hqs) {
    for (const hq of hqs) {
      if (hq.dead) continue;
      const { x, y } = this.worldToCanvas(hq.position.x, hq.position.z);
      const friendly = hq.team === PLAYER_TEAM;
      this.ctx.beginPath();
      this.ctx.fillStyle = friendly ? '#4ade80' : '#f87171';
      this.ctx.strokeStyle = friendly ? '#14532d' : '#7f1d1d';
      this.ctx.lineWidth = 1.25;
      this.ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
    }
  }

  _drawUnits(units, fill, stroke) {
    for (const unit of units) {
      if (unit.dead) continue;
      const { x, y } = this.worldToCanvas(unit.position.x, unit.position.z);
      const r = unitDotRadius(unit);
      this.ctx.beginPath();
      this.ctx.fillStyle = fill;
      this.ctx.strokeStyle = stroke;
      this.ctx.lineWidth = 1;
      this.ctx.arc(x, y, r, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
    }
  }
}