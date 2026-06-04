/** Looping baked diesel / track engine audio for moving vehicles. */

const ENGINE_TYPES = new Set(['tank', 'superHeavyTank', 'armoredCar', 'artillery']);

const BUFFER_KEYS = {
  tank: 'engine_tank',
  superHeavyTank: 'engine_tank',
  armoredCar: 'engine_armored_car',
  artillery: 'engine_artillery',
};

const PROFILES = {
  superHeavyTank: {
    rateMin: 0.66,
    rateMax: 0.92,
    vol: 0.44,
    filterMin: 180,
    filterMax: 820,
    exhaustGain: 0.3,
  },
  tank: {
    rateMin: 0.82,
    rateMax: 1.22,
    vol: 0.42,
    filterMin: 280,
    filterMax: 1400,
    exhaustGain: 0.35,
  },
  armoredCar: {
    rateMin: 0.88,
    rateMax: 1.35,
    vol: 0.36,
    filterMin: 420,
    filterMax: 2200,
    exhaustGain: 0.28,
  },
  artillery: {
    rateMin: 0.78,
    rateMax: 1.12,
    vol: 0.32,
    filterMin: 220,
    filterMax: 900,
    exhaustGain: 0.3,
  },
};

const MAX_VOICES = 12;
const MOVE_SPEED_THRESHOLD = 0.35;
const FADE_SEC = 0.28;
const IDLE_TAIL_SEC = 0.22;

function distToListener(unit, listener) {
  const dx = unit.position.x - listener.x;
  const dz = unit.position.z - listener.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function calcPan(wx, listenerX) {
  const dx = wx - listenerX;
  return Math.max(-1, Math.min(1, dx / 50));
}

function distanceGain(dist) {
  return Math.max(0.1, Math.min(1, 1.08 - dist / 72));
}

class EngineVoice {
  constructor(ctx, dryBus, wetBus, type, buffers) {
    this.ctx = ctx;
    this.type = type;
    this.profile = PROFILES[type] ?? PROFILES.tank;
    this.stopping = false;
    this.buffers = buffers;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.panner = ctx.createStereoPanner();
    this.panner.connect(this.master);
    this.master.connect(dryBus);

    const mainBuf = buffers.main;
    if (!mainBuf) return;

    this.mainFilter = ctx.createBiquadFilter();
    this.mainFilter.type = 'lowpass';
    this.mainFilter.frequency.value = 900;
    this.mainFilter.Q.value = 0.65;

    this.mainSrc = ctx.createBufferSource();
    this.mainSrc.buffer = mainBuf;
    this.mainSrc.loop = true;
    this.mainSrc.connect(this.mainFilter);
    this.mainFilter.connect(this.panner);

    this.exhaustSrc = null;
    this.exhaustGain = null;
    if (buffers.exhaust) {
      this.exhaustFilter = ctx.createBiquadFilter();
      this.exhaustFilter.type = 'bandpass';
      this.exhaustFilter.frequency.value = 240;
      this.exhaustFilter.Q.value = 0.5;
      this.exhaustGain = ctx.createGain();
      this.exhaustGain.gain.value = 0;
      this.exhaustSrc = ctx.createBufferSource();
      this.exhaustSrc.buffer = buffers.exhaust;
      this.exhaustSrc.loop = true;
      this.exhaustSrc.connect(this.exhaustFilter);
      this.exhaustFilter.connect(this.exhaustGain);
      this.exhaustGain.connect(this.panner);
    }

    this.wetSend = ctx.createGain();
    this.wetSend.gain.value = 0.12;
    this.mainFilter.connect(this.wetSend);
    this.wetSend.connect(wetBus);

    this.mainSrc.start();
    this.exhaustSrc?.start();
  }

  setThrottle(throttle, worldPos, listener, muted) {
    if (!this.mainSrc) return;
    const t = this.ctx.currentTime;
    const p = this.profile;
    const rateMin = p.rateMin ?? 0.8;
    const rateMax = p.rateMax ?? 1.15;
    const filtMin = p.filterMin ?? 260;
    const filtMax = p.filterMax ?? 1300;
    const exhaustGain = p.exhaustGain ?? 0.32;
    const rate = rateMin + (rateMax - rateMin) * throttle;
    this.mainSrc.playbackRate.setTargetAtTime(rate, t, 0.1);
    if (this.exhaustSrc) {
      this.exhaustSrc.playbackRate.setTargetAtTime(rate * 1.05, t, 0.1);
    }

    const filt = filtMin + (filtMax - filtMin) * throttle;
    this.mainFilter.frequency.setTargetAtTime(filt, t, 0.12);
    if (this.exhaustGain) {
      this.exhaustGain.gain.setTargetAtTime(exhaustGain * (0.4 + throttle * 0.7), t, 0.1);
      this.exhaustFilter.frequency.setTargetAtTime(180 + throttle * 380, t, 0.1);
    }

    const dist = distToListener({ position: worldPos }, listener);
    const vol = muted ? 0 : (p.vol ?? 0.4) * distanceGain(dist) * (0.28 + throttle * 0.82);
    this.master.gain.setTargetAtTime(vol, t, 0.08);
    this.panner.pan.setTargetAtTime(calcPan(worldPos.x, listener.x), t, 0.06);
    this.wetSend.gain.setTargetAtTime(0.08 + throttle * 0.1, t, 0.1);
  }

  fadeOut() {
    if (this.stopping) return;
    this.stopping = true;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0, t, FADE_SEC);
    setTimeout(() => this.dispose(), (FADE_SEC + 0.08) * 1000);
  }

  dispose() {
    try {
      this.mainSrc?.stop();
      this.exhaustSrc?.stop();
    } catch {
      /* already stopped */
    }
    const nodes = [
      this.master,
      this.panner,
      this.mainFilter,
      this.mainSrc,
      this.exhaustFilter,
      this.exhaustGain,
      this.exhaustSrc,
      this.wetSend,
    ];
    for (const n of nodes) {
      try {
        n?.disconnect();
      } catch {
        /* */
      }
    }
  }
}

export class VehicleEngineAudio {
  constructor(soundManager) {
    this.sm = soundManager;
    /** @type {Map<number, { voice: EngineVoice, idleUntil: number }>} */
    this.voices = new Map();
  }

  _buffersFor(type) {
    const key = BUFFER_KEYS[type];
    const main = this.sm.buffers[key];
    const exhaust = this.sm.buffers[`${key}_exhaust`];
    if (!main) return null;
    return { main, exhaust: exhaust ?? null };
  }

  clear() {
    for (const entry of this.voices.values()) entry.voice.dispose();
    this.voices.clear();
  }

  _measureSpeed(unit, dt) {
    const px = unit._engineLastX ?? unit.position.x;
    const pz = unit._engineLastZ ?? unit.position.z;
    unit._engineLastX = unit.position.x;
    unit._engineLastZ = unit.position.z;
    if (dt <= 0) return 0;
    return Math.hypot(unit.position.x - px, unit.position.z - pz) / dt;
  }

  update(units, dt, listener) {
    const ctx = this.sm.ctx;
    const dryBus = this.sm.dryBus;
    const wetBus = this.sm.wetBus;
    if (!this.sm.unlocked || !ctx || !dryBus || this.sm.muted) {
      this.clear();
      return;
    }
    if (ctx.state === 'suspended') ctx.resume();

    const now = performance.now();
    const active = [];

    for (const u of units) {
      if (!ENGINE_TYPES.has(u.def?.type) || u.dead) continue;
      if (!this._buffersFor(u.def.type)) continue;

      const speed = this._measureSpeed(u, dt);
      const throttle = Math.min(1, speed / Math.max(u.def.speed * 0.85, 2));
      const entry = this.voices.get(u.id);

      if (speed >= MOVE_SPEED_THRESHOLD) {
        active.push({ unit: u, throttle: Math.max(0.28, throttle) });
        if (entry) entry.idleUntil = now + IDLE_TAIL_SEC * 1000;
      } else if (entry && entry.idleUntil > now) {
        active.push({ unit: u, throttle: 0.24 });
      }
    }

    active.sort(
      (a, b) => distToListener(a.unit, listener) - distToListener(b.unit, listener)
    );
    const audibleIds = new Set(active.slice(0, MAX_VOICES).map((m) => m.unit.id));

    for (const [id, entry] of this.voices) {
      if (!audibleIds.has(id)) {
        entry.voice.fadeOut();
        this.voices.delete(id);
      }
    }

    for (const { unit, throttle } of active.slice(0, MAX_VOICES)) {
      let entry = this.voices.get(unit.id);
      if (!entry) {
        const buffers = this._buffersFor(unit.def.type);
        if (!buffers) continue;
        const voice = new EngineVoice(ctx, dryBus, wetBus, unit.def.type, buffers);
        if (!voice.mainSrc) continue;
        entry = { voice, idleUntil: 0 };
        this.voices.set(unit.id, entry);
      }
      entry.voice.setThrottle(throttle, unit.position, listener, this.sm.muted);
    }
  }
}

export { ENGINE_TYPES };