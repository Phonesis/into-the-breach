/**
 * Gunfire SFX from baked WAV samples + vehicle engine loops + light ambience processing.
 */

import { VehicleEngineAudio } from './VehicleEngineAudio.js';
import { StrafeAircraftAudio } from './StrafeAircraftAudio.js';
import { MenuMusic } from './MenuMusic.js';
import { publicUrl } from '../lib/publicUrl.js';
import {
  getAllWeaponSampleUrls,
  pickSampleFile,
  minGapMsForProfile,
  resolveWeaponProfile,
  mgProfileForFaction,
} from './WeaponSounds.js';

const SAMPLE_URLS = {
  impact: publicUrl('sounds/impact.wav'),
  explosion: publicUrl('sounds/explosion.wav'),
  engine_tank: publicUrl('sounds/engine-tank.wav'),
  engine_tank_exhaust: publicUrl('sounds/engine-tank-exhaust.wav'),
  engine_armored_car: publicUrl('sounds/engine-armored-car.wav'),
  engine_armored_car_exhaust: publicUrl('sounds/engine-armored-car-exhaust.wav'),
  engine_artillery: publicUrl('sounds/engine-artillery.wav'),
  engine_artillery_exhaust: publicUrl('sounds/engine-artillery-exhaust.wav'),
  aircraft_flyby: publicUrl('sounds/aircraft-flyby.wav'),
  aircraft_flyby_exhaust: publicUrl('sounds/aircraft-flyby-exhaust.wav'),
  aircraft_flyby_prop: publicUrl('sounds/aircraft-flyby-prop.wav'),
};

const INFANTRY_DEATH_COUNT = 8;
const INFANTRY_DEATH_FACTIONS = {
  default: { prefix: 'infantry-death', factions: new Set(['usa', 'uk']) },
  germany: { prefix: 'infantry-death-germany', factions: new Set(['germany']) },
  russia: { prefix: 'infantry-death-russia', factions: new Set(['russia']) },
};
const INFANTRY_TYPES = new Set(['infantry', 'machineGun', 'sniper', 'medic', 'engineer', 'mortar']);

function infantryDeathVoiceKey(factionId) {
  if (factionId === 'germany') return 'germany';
  if (factionId === 'russia') return 'russia';
  return 'default';
}

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
    this.weaponBuffers = {};
    this.unlocked = false;
    this.muted = false;
    this._loadPromise = null;
    this._lastByType = {};
    this._listener = { x: 0, y: 0, z: 0 };
    this.vehicleEngines = null;
    this.strafeAircraft = null;
    this.menuMusic = null;
    this.menuMusicVisible = false;
    this.inBattle = false;
    this._resumePromise = null;
    this._warmedUp = false;
    this._pendingPlays = [];
    this._maxPendingPlays = 32;
    this._battleLockOsc = null;
    this._battleLockGain = null;
    this._htmlLock = null;
    this._samplesReady = false;
    /** @type {HTMLAudioElement[]} */
    this._htmlPool = [];
    this._htmlPoolBusy = 0;
    /** @type {Record<string, AudioBuffer[]>} */
    this.infantryDeathBuffers = { default: [], germany: [], russia: [] };
  }

  _stopBattleAudioLock() {
    try {
      this._battleLockOsc?.stop();
    } catch {
      /* already stopped */
    }
    this._battleLockOsc?.disconnect?.();
    this._battleLockGain?.disconnect?.();
    this._battleLockOsc = null;
    this._battleLockGain = null;

    if (this._htmlLock) {
      this._htmlLock.pause();
      this._htmlLock.removeAttribute('src');
      this._htmlLock.load();
      this._htmlLock = null;
    }
  }

  /** Inaudible loop keeps iOS/Safari from suspending AudioContext during long TD prepare phases. */
  _startBattleAudioLock() {
    if (!this.ctx || this.muted || !this._isRunning()) return false;

    if (!this._battleLockOsc) {
      try {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 1;
        const g = this.ctx.createGain();
        g.gain.value = 0.00001;
        osc.connect(g);
        g.connect(this.master);
        osc.start(0);
        this._battleLockOsc = osc;
        this._battleLockGain = g;
      } catch {
        /* unavailable */
      }
    }

    if (!this._htmlLock) {
      const audio = new Audio(publicUrl('sounds/impact.wav'));
      audio.loop = true;
      audio.volume = 0.001;
      audio.preload = 'auto';
      void audio.play().then(() => {
        this._htmlLock = audio;
      }).catch(() => {});
    }

    return !!this._battleLockOsc || !!this._htmlLock;
  }

  _isRunning() {
    return this.ctx?.state === 'running';
  }

  _flushPendingPlays() {
    if (!this._isRunning() || !this._pendingPlays.length) return;
    const pending = this._pendingPlays.splice(0);
    for (const fn of pending) fn();
  }

  _enqueuePending(fn) {
    this._pendingPlays.push(fn);
    if (this._pendingPlays.length > this._maxPendingPlays) {
      this._pendingPlays.shift();
    }
  }

  _warmUpNow(vol = 0.03) {
    if (!this._isRunning()) return false;
    const buf = this.weaponBuffers.mg ?? this.buffers.impact;
    if (!buf) return false;
    this._playBuffer(buf, { vol, wet: 0, pan: 0, rate: 0.85 });
    this._warmedUp = true;
    return true;
  }

  unlock() {
    if (this.unlocked) {
      this._resumeContext();
      return;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._buildGraph();
      this.unlocked = true;
      this._warmedUp = false;
      this._resumeContext();
      this.vehicleEngines = new VehicleEngineAudio(this);
      this.strafeAircraft = new StrafeAircraftAudio(this);
      this.menuMusic = new MenuMusic(this);
      this._loadPromise = this._loadSamples();
      this.menuMusic.ensureLoaded();
      if (this.menuMusicVisible && !this.inBattle) {
        this.menuMusic.setMenuActive(true);
      }
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

    const weaponUrls = getAllWeaponSampleUrls();
    await Promise.all(
      weaponUrls.map(async (url) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return;
          const ab = await res.arrayBuffer();
          const stem = url.split('/').pop().replace(/\.wav$/i, '');
          this.weaponBuffers[stem] = await this.ctx.decodeAudioData(ab);
        } catch {
          /* missing sample */
        }
      })
    );

    const deathLoads = [];
    for (const [voiceKey, { prefix }] of Object.entries(INFANTRY_DEATH_FACTIONS)) {
      for (let i = 1; i <= INFANTRY_DEATH_COUNT; i++) {
        const num = String(i).padStart(2, '0');
        deathLoads.push(
          (async () => {
            try {
              const res = await fetch(publicUrl(`sounds/${prefix}-${num}.wav`));
              if (!res.ok) return;
              const ab = await res.arrayBuffer();
              const buf = await this.ctx.decodeAudioData(ab);
              this.infantryDeathBuffers[voiceKey].push(buf);
            } catch {
              /* missing */
            }
          })()
        );
      }
    }
    await Promise.all(deathLoads);
    this._samplesReady = true;
    this._flushPendingPlays();
  }

  _resumeContext() {
    if (!this.ctx || this.ctx.state === 'running') return Promise.resolve();
    if (this.ctx.state !== 'suspended') return Promise.resolve();
    if (!this._resumePromise) {
      this._resumePromise = this.ctx.resume().finally(() => {
        this._resumePromise = null;
      });
    }
    return this._resumePromise;
  }

  /** Run callback once samples are decoded and AudioContext is running. */
  _runWhenReady(fn, fallback) {
    if (!this.unlocked || !this.ctx || this.muted) return;
    const attempt = () => {
      if (!this.ctx || this.muted) return;
      if (this._isRunning()) {
        fn();
        return;
      }
      void this._resumeContext().then(() => {
        if (this._isRunning()) {
          fn();
          this._flushPendingPlays();
          return;
        }
        fallback?.();
        this._enqueuePending(fn);
      });
    };
    if (this._loadPromise) void this._loadPromise.then(attempt);
    else attempt();
  }

  _borrowHtmlAudio() {
    const free = this._htmlPool.find((a) => a.paused && !a.ended);
    if (free) return free;
    if (this._htmlPool.length < 8) {
      const audio = new Audio();
      audio.preload = 'auto';
      this._htmlPool.push(audio);
      return audio;
    }
    return new Audio();
  }

  _playWeaponHtml(profile, opts = {}) {
    const sampleFile = pickSampleFile(profile, this.weaponBuffers);
    if (!sampleFile) return false;

    const gapKey = opts.gapKey ?? profile;
    const minGap = opts.minGapMs ?? minGapMsForProfile(profile);
    const now = performance.now();
    if (now - (this._lastByType[gapKey] ?? 0) < minGap) return false;

    try {
      const audio = this._borrowHtmlAudio();
      audio.src = publicUrl(`sounds/${sampleFile}`);
      audio.volume = Math.min(1, (opts.volume ?? 1) * 0.75);
      this._lastByType[gapKey] = now;
      this._htmlPoolBusy += 1;
      void audio.play().catch(() => {}).finally(() => {
        this._htmlPoolBusy = Math.max(0, this._htmlPoolBusy - 1);
      });
      return true;
    } catch {
      return false;
    }
  }

  _playWeaponNow(profile, worldPos = null, opts = {}) {
    const sampleFile = pickSampleFile(profile, this.weaponBuffers);
    if (!sampleFile) return false;
    const buf = this.weaponBuffers[sampleFile.replace(/\.wav$/i, '')];
    if (!buf) return false;

    const gapKey = opts.gapKey ?? profile;
    const minGap = opts.minGapMs ?? minGapMsForProfile(profile);
    const now = performance.now();
    if (now - (this._lastByType[gapKey] ?? 0) < minGap) return false;

    const pan = worldPos ? this._calcPan(worldPos.x, worldPos.z) : 0;
    const dist =
      worldPos && !opts.nearField ? this._calcDist(worldPos.x, worldPos.z) : 0;
    const vol =
      (opts.volume ?? 1) * (opts.nearField ? 1 : this._distanceGain(dist));
    const rate = (opts.rate ?? 1) * (0.94 + Math.random() * 0.12);
    const wet =
      profile.startsWith('howitzer') || profile.startsWith('mortar')
        ? 0.5
        : profile.startsWith('tank') || profile.startsWith('at')
          ? 0.34
          : 0.28;

    this._lastByType[gapKey] = now;
    this._playBuffer(buf, { pan, vol, rate, wet });
    return true;
  }

  /** Wait until weapon/impact samples are decoded (call after unlock before combat). */
  async ensureLoaded() {
    this.unlock();
    if (this._loadPromise) await this._loadPromise;
    await this._resumeContext();
  }

  resumeContext() {
    return this._resumeContext().then((result) => {
      if (this._isRunning()) this._flushPendingPlays();
      return result;
    });
  }

  /** Prime the audio graph after a user gesture so the first combat shot is audible. */
  warmUp() {
    this._runWhenReady(() => {
      if (this._warmedUp) return;
      this._warmUpNow(0.03);
    });
  }

  /**
   * Full combat audio prime — load samples, resume context, warm graph, flush queue.
   * Call on user gestures and right before the first TD wave.
   */
  async primeForCombat() {
    await this.ensureLoaded();
    await this._resumeContext();
    if (this._isRunning()) {
      if (this.inBattle) this._startBattleAudioLock();
      if (!this._warmedUp) this._warmUpNow(0.03);
      this._flushPendingPlays();
    }
    return this._isRunning();
  }

  /**
   * Re-assert battle audio lock during TD prepare countdown.
   */
  keepAlive() {
    if (!this.unlocked || !this.ctx || this.muted || !this.inBattle) return;
    void this._resumeContext().then(() => {
      if (!this._isRunning()) return;
      this._startBattleAudioLock();
    });
  }

  setListener(worldX, worldZ) {
    this._listener.x = worldX;
    this._listener.z = worldZ;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
    if (m) {
      this.clearVehicleEngines();
      this.menuMusic?.stopImmediate();
    }
  }

  /** Call when a match starts — blocks menu theme until leaveBattle(). */
  enterBattle() {
    this.inBattle = true;
    this.menuMusicVisible = false;
    this.menuMusic?.stopImmediate();
    void this.ensureLoaded().then(() => {
      void this._resumeContext().then(() => {
        if (this.inBattle) this._startBattleAudioLock();
      });
    });
  }

  /** Call when returning to menus (stopGame, main menu). */
  leaveBattle() {
    this.inBattle = false;
    this._stopBattleAudioLock();
    this._pendingPlays = [];
  }

  setMenuMusicActive(active) {
    if (this.inBattle && active) return;
    this.menuMusicVisible = active;
    if (!active) {
      this.menuMusic?.stopImmediate();
      return;
    }
    this.menuMusic?.setMenuActive(true);
  }

  updateVehicleEngines(units, dt) {
    this.vehicleEngines?.update(units, dt, this._listener);
    this.strafeAircraft?.update(dt, this._listener);
  }

  clearVehicleEngines() {
    this.vehicleEngines?.clear();
    this.strafeAircraft?.clear();
  }

  startStrafeFlyby(opts) {
    this.strafeAircraft?.startFlyby(opts);
  }

  /** Play a weapon profile (faction-specific ids from WeaponSounds.js). */
  playWeapon(profile, worldPos = null, opts = {}) {
    if (!this.unlocked || !this.ctx || this.muted) return;

    const htmlFallback = () => {
      this._playWeaponHtml(profile, opts);
    };
    const playNow = () => {
      if (!this._playWeaponNow(profile, worldPos, opts)) htmlFallback();
    };

    if (this._samplesReady && this._isRunning()) {
      playNow();
      return;
    }

    this._runWhenReady(playNow, htmlFallback);
  }

  /** Infantry / MG / sniper casualty — random field yell in the unit's language. */
  playInfantryDeath(worldPos = null, factionId = null) {
    this._runWhenReady(() => {
      const voiceKey = infantryDeathVoiceKey(factionId);
      let bufs = this.infantryDeathBuffers[voiceKey];
      if (!bufs?.length) bufs = this.infantryDeathBuffers.default;
      if (!bufs?.length) return;

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
    });
  }

  playImpact(type, worldPos, delaySec = 0) {
    this._runWhenReady(() => {
      const now = performance.now();
      if (now - (this._lastByType._impact ?? 0) < (type === 'bullet' ? 120 : 80)) return;
      const useExplosion =
        type === 'shell' || type === 'tank_round' || type === 'explosion';
      const key = useExplosion ? 'explosion' : 'impact';
      const buf = this.buffers[key];
      if (!buf) return;
      this._lastByType._impact = now;

      const pan = worldPos ? this._calcPan(worldPos.x, worldPos.z) : 0;
      const dist = worldPos ? this._calcDist(worldPos.x, worldPos.z) : 0;
      const gain = useExplosion
        ? (EXPLOSION_IMPACT_GAIN[type] ?? 1.4)
        : 0.85;
      const vol = this._distanceGain(dist) * gain;

      this._playBuffer(buf, {
        pan,
        vol,
        rate: useExplosion ? 0.86 + Math.random() * 0.1 : 0.9 + Math.random() * 0.15,
        wet: useExplosion ? 0.3 : 0.45,
        delay: delaySec,
      });
    });
  }

  play(type) {
    this._runWhenReady(() => {
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
            wet: 0.28,
            rate: 0.86 + Math.random() * 0.08,
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
      case 'hq_alert':
        this._beep(880, 0.09, 0.1);
        this._beep(660, 0.11, 0.09, 0.1);
        this._beep(880, 0.12, 0.08, 0.22);
        break;
      default:
        break;
    }
    });
  }

  _playBuffer(buffer, { pan = 0, vol = 1, rate = 1, wet = 0.3, delay = 0 }) {
    if (!this.ctx || !buffer) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;

    const dry = this.ctx.createGain();
    dry.gain.value = vol * (1 - wet * 0.5);
    const wetG = this.ctx.createGain();
    wetG.gain.value = vol * wet;

    try {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = pan;
      src.connect(panner);
      panner.connect(dry);
      panner.connect(wetG);
    } catch {
      src.connect(dry);
    }

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

export { resolveWeaponProfile, mgProfileForFaction, weaponProfileForDef } from './WeaponSounds.js';