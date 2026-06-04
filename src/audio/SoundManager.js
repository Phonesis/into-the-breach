/**
 * Gunfire SFX from baked WAV samples + vehicle engine loops + light ambience processing.
 */

import { VehicleEngineAudio } from './VehicleEngineAudio.js';

const SAMPLE_URLS = {
  rifle: '/sounds/rifle.wav',
  mg: '/sounds/mg.wav',
  tank_75: '/sounds/tank.wav',
  tank_57: '/sounds/tank.wav',
  howitzer_105: '/sounds/artillery.wav',
  howitzer_25pdr: '/sounds/artillery.wav',
  impact: '/sounds/impact.wav',
  explosion: '/sounds/explosion.wav',
  engine_tank: '/sounds/engine-tank.wav',
  engine_tank_exhaust: '/sounds/engine-tank-exhaust.wav',
  engine_armored_car: '/sounds/engine-armored-car.wav',
  engine_armored_car_exhaust: '/sounds/engine-armored-car-exhaust.wav',
  engine_artillery: '/sounds/engine-artillery.wav',
  engine_artillery_exhaust: '/sounds/engine-artillery-exhaust.wav',
};

const INFANTRY_DEATH_COUNT = 8;
const INFANTRY_TYPES = new Set(['infantry', 'machineGun', 'sniper']);

/** Per-type gain on top of distance falloff (explosion buffer). */
const EXPLOSION_IMPACT_GAIN = {
  shell: 1.55,
  tank_round: 1.45,
  explosion: 1.5,
};

const EXPLOSION_DIRECT_GAIN = 1.65;

export class SoundManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.reverb = null;
    this.dryBus = null;
    this.wetBus = null;
    this.buffers = {};
    this.unlocked = false;
    this.muted = false;
    this._loadPromise = null;
    this._lastByType = {};
    this._listener = { x: 0, y: 0, z: 0 };
    this.vehicleEngines = null;
    this.infantryDeathBuffers = [];
  }

  unlock() {
    if (this.unlocked) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._buildGraph();
      this.unlocked = true;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.vehicleEngines = new VehicleEngineAudio(this);
      this._loadPromise = this._loadSamples();
    } catch {
      /* unavailable */
    }
  }

  _buildGraph() {
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;

    this.dryBus = this.ctx.createGain();
    this.dryBus.gain.value = 0.82;
    this.wetBus = this.ctx.createGain();
    this.wetBus.gain.value = 0.35;

    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this._makeReverbImpulse(1.8, 2.2);

    this.dryBus.connect(this.master);
    this.wetBus.connect(this.reverb);
    this.reverb.connect(this.master);
    this.master.connect(this.ctx.destination);
  }

  _makeReverbImpulse(duration, decay) {
    const rate = this.ctx.sampleRate;
    const len = rate * duration;
    const impulse = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return impulse;
  }

  async _loadSamples() {
    const entries = Object.entries(SAMPLE_URLS);
    await Promise.all(
      entries.map(async ([key, url]) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return;
          const ab = await res.arrayBuffer();
          this.buffers[key] = await this.ctx.decodeAudioData(ab);
        } catch {
          /* missing sample */
        }
      })
    );

    const deathLoads = [];
    for (let i = 1; i <= INFANTRY_DEATH_COUNT; i++) {
      const num = String(i).padStart(2, '0');
      deathLoads.push(
        (async () => {
          try {
            const res = await fetch(`/sounds/infantry-death-${num}.wav`);
            if (!res.ok) return;
            const ab = await res.arrayBuffer();
            const buf = await this.ctx.decodeAudioData(ab);
            this.infantryDeathBuffers.push(buf);
          } catch {
            /* missing */
          }
        })()
      );
    }
    await Promise.all(deathLoads);
  }

  setListener(worldX, worldZ) {
    this._listener.x = worldX;
    this._listener.z = worldZ;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
    if (m) this.clearVehicleEngines();
  }

  updateVehicleEngines(units, dt) {
    this.vehicleEngines?.update(units, dt, this._listener);
  }

  clearVehicleEngines() {
    this.vehicleEngines?.clear();
  }

  /** @param {'rifle'|'mg'|'tank_75'|'tank_57'|'howitzer_105'|'howitzer_25pdr'} profile */
  playWeapon(profile, worldPos = null, opts = {}) {
    if (!this.unlocked || !this.ctx || this.muted) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const minGap =
      profile.startsWith('howitzer') ? 280 : profile.startsWith('tank') ? 120 : profile === 'mg' ? 55 : 70;
    const now = performance.now();
    if (now - (this._lastByType[profile] ?? 0) < minGap) return;
    this._lastByType[profile] = now;

    const key = profile.startsWith('tank') ? 'tank_75' : profile.startsWith('howitzer') ? 'howitzer_105' : profile;
    const buf = this.buffers[key];
    if (!buf) return;

    const pan = worldPos ? this._calcPan(worldPos.x, worldPos.z) : 0;
    const dist = worldPos ? this._calcDist(worldPos.x, worldPos.z) : 0;
    const vol = (opts.volume ?? 1) * this._distanceGain(dist);
    const rate = (opts.rate ?? 1) * (0.94 + Math.random() * 0.12);

    this._playBuffer(buf, { pan, vol, rate, wet: profile.startsWith('howitzer') ? 0.5 : 0.28 });
  }

  /** Infantry / MG / sniper casualty — random field yell. */
  playInfantryDeath(worldPos = null) {
    if (!this.unlocked || !this.ctx || this.muted) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const bufs = this.infantryDeathBuffers;
    if (!bufs.length) return;

    const now = performance.now();
    if (now - (this._lastByType._infDeath ?? 0) < 140) return;
    this._lastByType._infDeath = now;

    const buf = bufs[Math.floor(Math.random() * bufs.length)];
    const pan = worldPos ? this._calcPan(worldPos.x, worldPos.z) : 0;
    const dist = worldPos ? this._calcDist(worldPos.x, worldPos.z) : 0;
    const vol = this._distanceGain(dist) * (0.72 + Math.random() * 0.18);

    this._playBuffer(buf, {
      pan,
      vol: vol * 1.08,
      rate: 0.9 + Math.random() * 0.14,
      wet: 0.18,
    });
  }

  playImpact(type, worldPos, delaySec = 0) {
    if (!this.unlocked || !this.ctx || this.muted) return;
    const now = performance.now();
    if (now - (this._lastByType._impact ?? 0) < (type === 'bullet' ? 120 : 80)) return;
    this._lastByType._impact = now;
    const useExplosion =
      type === 'shell' || type === 'tank_round' || type === 'explosion';
    const key = useExplosion ? 'explosion' : 'impact';
    const buf = this.buffers[key];
    if (!buf) return;

    const pan = worldPos ? this._calcPan(worldPos.x, worldPos.z) : 0;
    const dist = worldPos ? this._calcDist(worldPos.x, worldPos.z) : 0;
    const gain = useExplosion
      ? (EXPLOSION_IMPACT_GAIN[type] ?? 1.4)
      : 0.85;
    const vol = this._distanceGain(dist) * gain;

    this._playBuffer(buf, {
      pan,
      vol,
      rate: 0.9 + Math.random() * 0.15,
      wet: useExplosion ? 0.42 : 0.45,
      delay: delaySec,
    });
  }

  play(type) {
    if (!this.unlocked || !this.ctx || this.muted) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    switch (type) {
      case 'select':
        this._beep(640, 0.04, 0.05);
        break;
      case 'order':
        this._beep(380, 0.05, 0.07);
        this._beep(520, 0.04, 0.04, 0.04);
        break;
      case 'explosion':
        if (this.buffers.explosion) {
          this._playBuffer(this.buffers.explosion, {
            vol: EXPLOSION_DIRECT_GAIN,
            wet: 0.4,
            rate: 0.94 + Math.random() * 0.06,
          });
        }
        break;
      case 'capture':
        this._beep(523, 0.07, 0.08);
        this._beep(659, 0.08, 0.06, 0.07);
        break;
      case 'produce':
        this._beep(330, 0.05, 0.07);
        break;
      case 'spawn':
        this._beep(220, 0.08, 0.06);
        break;
      case 'victory':
        [392, 494, 587, 784].forEach((f, i) => this._beep(f, 0.1, 0.07, i * 0.1));
        break;
      case 'defeat':
        [392, 349, 294, 262].forEach((f, i) => this._beep(f, 0.11, 0.07, i * 0.11));
        break;
      default:
        break;
    }
  }

  _playBuffer(buffer, { pan = 0, vol = 1, rate = 1, wet = 0.3, delay = 0 }) {
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;

    const dry = this.ctx.createGain();
    const wetG = this.ctx.createGain();
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;

    dry.gain.value = vol * (1 - wet * 0.5);
    wetG.gain.value = vol * wet;

    src.connect(panner);
    panner.connect(dry);
    panner.connect(wetG);
    dry.connect(this.dryBus);
    wetG.connect(this.wetBus);

    src.start(t0);
    src.stop(t0 + buffer.duration / rate + 0.05);
  }

  _beep(freq, dur, vol, delay = 0) {
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(this.dryBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  _calcPan(wx, wz) {
    const dx = wx - this._listener.x;
    return Math.max(-1, Math.min(1, dx / 50));
  }

  _calcDist(wx, wz) {
    const dx = wx - this._listener.x;
    const dz = wz - this._listener.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  _distanceGain(dist) {
    return Math.max(0.2, Math.min(1, 1.15 - dist / 70));
  }
}

export const sounds = new SoundManager();

export function isInfantryUnitType(type) {
  return INFANTRY_TYPES.has(type);
}

export function weaponProfileForDef(def) {
  if (def.weaponSound === 'mortar') return 'howitzer_105';
  if (def.weaponSound) return def.weaponSound;
  if (def.type === 'mortar') return 'howitzer_105';
  if (def.type === 'machineGun') return 'mg';
  if (def.type === 'artillery') return def.caliber >= 88 ? 'howitzer_105' : 'howitzer_25pdr';
  if (def.type === 'tank' || def.type === 'superHeavyTank') {
    return def.caliber >= 70 ? 'tank_75' : 'tank_57';
  }
  return def.usesMG ? 'mg' : 'rifle';
}