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
  rateJitterForProfile,
  volumeJitterForProfile,
  resolveWeaponProfile,
  mgProfileForFaction,
  smgProfileForFaction,
  SFX_MASTERS_ONLY,
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

/** Extra one-shot pools (ElevenLabs extras) — loaded into arrays for random pick. */
const EXPLOSION_SAMPLE_FILES_FULL = [
  'explosion.wav',
  'explosion-b.wav',
  'explosion-c.wav',
  'explosion-d.wav',
  'explosion-e.wav',
  'explosion-f.wav',
  'explosion-g.wav',
  'explosion-h.wav',
  'explosion-i.wav',
];
const IMPACT_SAMPLE_FILES_FULL = [
  'impact.wav',
  'impact-b.wav',
  'impact-c.wav',
  'impact-d.wav',
  'impact-e.wav',
];
const ATMOS_SAMPLE_FILES_FULL = ['battle-atmos.wav', 'battle-atmos-close.wav'];
const RADIO_STATIC_FILES = ['radio-static-a.wav', 'radio-static-b.wav', 'radio-static-c.wav'];

// TEMP originals-only: keep all EL gens; pitch-clone filter only applies to weapons
const EXPLOSION_SAMPLE_FILES = EXPLOSION_SAMPLE_FILES_FULL;
const IMPACT_SAMPLE_FILES = IMPACT_SAMPLE_FILES_FULL;
const ATMOS_SAMPLE_FILES = ATMOS_SAMPLE_FILES_FULL;

const INFANTRY_DEATH_COUNT = 8;
const INFANTRY_DEATH_FACTIONS = {
  default: { prefix: 'infantry-death', factions: new Set(['usa', 'uk']) },
  germany: { prefix: 'infantry-death-germany', factions: new Set(['germany']) },
  russia: { prefix: 'infantry-death-russia', factions: new Set(['russia']) },
};
const INFANTRY_TYPES = new Set([
  'infantry',
  'paratrooper',
  'machineGun',
  'sniper',
  'medic',
  'engineer',
  'mortar',
  'vehicleCrew',
]);

const UNIT_SELECT_COUNT = 6;
const UNIT_SELECT_FACTIONS = ['usa', 'uk', 'germany', 'russia'];
const UNIT_UNDERFIRE_COUNT = 12;
const UNIT_UNDERFIRE_FACTIONS = ['usa', 'uk', 'germany', 'russia'];
/** Fire-support + general-order commander radio lines (baked edge-tts). */
const COMMANDER_ORDER_KINDS = [
  'strafe',
  'barrage',
  'creepingBarrage',
  'airborneDrop',
  'fullRetreat',
  'holdGround',
];
const COMMANDER_ORDER_FACTIONS = ['usa', 'uk', 'germany', 'russia'];

function infantryDeathVoiceKey(factionId) {
  if (factionId === 'germany') return 'germany';
  if (factionId === 'russia') return 'russia';
  return 'default';
}

function unitSelectVoiceKey(factionId) {
  const id = String(factionId ?? '').toLowerCase();
  if (id === 'germany' || id === 'russia' || id === 'uk' || id === 'usa') {
    return id;
  }
  return 'usa';
}

function unitUnderFireVoiceKey(factionId) {
  const id = String(factionId ?? '').toLowerCase();
  // Only return a language pack that exists — never map DE/RU onto English
  if (id === 'germany' || id === 'russia' || id === 'uk' || id === 'usa') {
    return id;
  }
  // Unknown faction: prefer silence over wrong language (handled by empty buffer check)
  return id || 'usa';
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
    /** @type {AudioBuffer[]} */
    this.explosionBuffers = [];
    /** @type {AudioBuffer[]} */
    this.impactBuffers = [];
    /** @type {AudioBuffer[]} */
    this.atmosBuffers = [];
    /** @type {AudioBuffer[]} */
    this.radioStaticBuffers = [];
    this._atmosSrc = null;
    this._atmosGain = null;
    this._lastExplosionFile = null;
    this._lastImpactFile = null;
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
    /** @type {Record<string, AudioBuffer[]>} */
    this.unitSelectBuffers = { usa: [], uk: [], germany: [], russia: [] };
    /** @type {Record<string, AudioBuffer[]>} */
    this.unitUnderFireBuffers = { usa: [], uk: [], germany: [], russia: [] };
    /**
     * Commander order lines: buffers[faction][kind] = AudioBuffer
     * @type {Record<string, Record<string, AudioBuffer>>}
     */
    this.commanderOrderBuffers = {
      usa: {},
      uk: {},
      germany: {},
      russia: {},
    };
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

  _getSilentPrimeBuffer() {
    if (!this.ctx) return null;
    if (!this._silentPrimeBuf) {
      this._silentPrimeBuf = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
    }
    return this._silentPrimeBuf;
  }

  /** Prime Web Audio graph after a user gesture — inaudible (no weapon SFX on menus). */
  _warmUpNow() {
    if (!this._isRunning() || this._warmedUp) return false;
    const buf = this._getSilentPrimeBuffer();
    if (!buf) return false;
    this._playBuffer(buf, { vol: 0.00001, wet: 0, pan: 0, rate: 1 });
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
    this.master.gain.value = 0.62;

    this.dryBus = this.ctx.createGain();
    this.dryBus.gain.value = 0.88;
    this.wetBus = this.ctx.createGain();
    this.wetBus.gain.value = 0.32;

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

    const selectLoads = [];
    for (const faction of UNIT_SELECT_FACTIONS) {
      for (let i = 1; i <= UNIT_SELECT_COUNT; i++) {
        const num = String(i).padStart(2, '0');
        selectLoads.push(
          (async () => {
            try {
              const res = await fetch(publicUrl(`sounds/unit-select-${faction}-${num}.wav`));
              if (!res.ok) return;
              const ab = await res.arrayBuffer();
              const buf = await this.ctx.decodeAudioData(ab);
              this.unitSelectBuffers[faction].push(buf);
            } catch {
              /* missing */
            }
          })()
        );
      }
    }
    await Promise.all(selectLoads);

    const underFireLoads = [];
    for (const faction of UNIT_UNDERFIRE_FACTIONS) {
      for (let i = 1; i <= UNIT_UNDERFIRE_COUNT; i++) {
        const num = String(i).padStart(2, '0');
        underFireLoads.push(
          (async () => {
            try {
              const res = await fetch(publicUrl(`sounds/unit-underfire-${faction}-${num}.wav`));
              if (!res.ok) return;
              const ab = await res.arrayBuffer();
              const buf = await this.ctx.decodeAudioData(ab);
              this.unitUnderFireBuffers[faction].push(buf);
            } catch {
              /* missing */
            }
          })()
        );
      }
    }
    await Promise.all(underFireLoads);

    const commanderLoads = [];
    for (const faction of COMMANDER_ORDER_FACTIONS) {
      for (const kind of COMMANDER_ORDER_KINDS) {
        commanderLoads.push(
          (async () => {
            try {
              const res = await fetch(publicUrl(`sounds/commander-${faction}-${kind}.wav`));
              if (!res.ok) return;
              const ab = await res.arrayBuffer();
              const buf = await this.ctx.decodeAudioData(ab);
              this.commanderOrderBuffers[faction][kind] = buf;
            } catch {
              /* missing */
            }
          })()
        );
      }
    }
    await Promise.all(commanderLoads);

    const poolLoads = [];
    const loadPool = (files, targetArr) => {
      for (const file of files) {
        poolLoads.push(
          (async () => {
            try {
              const res = await fetch(publicUrl(`sounds/${file}`));
              if (!res.ok) return;
              const ab = await res.arrayBuffer();
              const buf = await this.ctx.decodeAudioData(ab);
              targetArr.push(buf);
            } catch {
              /* missing */
            }
          })()
        );
      }
    };
    this.explosionBuffers = [];
    this.impactBuffers = [];
    this.atmosBuffers = [];
    this.radioStaticBuffers = [];
    loadPool(EXPLOSION_SAMPLE_FILES, this.explosionBuffers);
    loadPool(IMPACT_SAMPLE_FILES, this.impactBuffers);
    loadPool(ATMOS_SAMPLE_FILES, this.atmosBuffers);
    loadPool(RADIO_STATIC_FILES, this.radioStaticBuffers);
    await Promise.all(poolLoads);

    // Keep legacy single-key buffers as first of pool for any code that still uses them
    if (this.explosionBuffers[0]) this.buffers.explosion = this.explosionBuffers[0];
    if (this.impactBuffers[0]) this.buffers.impact = this.impactBuffers[0];

    this._samplesReady = true;
    this._flushPendingPlays();
  }

  _pickFromPool(buffers, lastKey) {
    if (!buffers?.length) return null;
    if (buffers.length === 1) return buffers[0];
    let buf = buffers[Math.floor(Math.random() * buffers.length)];
    // Avoid immediate repeat when possible
    if (buffers.length > 1 && buf === this[lastKey]) {
      const alt = buffers.filter((b) => b !== this[lastKey]);
      if (alt.length) buf = alt[Math.floor(Math.random() * alt.length)];
    }
    this[lastKey] = buf;
    return buf;
  }

  _stopBattleAtmos() {
    try {
      this._atmosSrc?.stop();
    } catch {
      /* already stopped */
    }
    this._atmosSrc?.disconnect?.();
    this._atmosGain?.disconnect?.();
    this._atmosSrc = null;
    this._atmosGain = null;
  }

  /** Looping battlefield bed during combat (under combat one-shots, but clearly audible). */
  _startBattleAtmos() {
    if (!this.ctx || this.muted || !this._isRunning()) return;
    if (this._atmosSrc) return;
    const buf = this.atmosBuffers[Math.floor(Math.random() * this.atmosBuffers.length)];
    if (!buf) return;

    try {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = 0.96 + Math.random() * 0.06;
      const g = this.ctx.createGain();
      // Loud enough to read as a bed; still below weapon/explosion peaks
      g.gain.value = 0.38;
      src.connect(g);
      // Mostly dry with a little space so it sits behind the action
      g.connect(this.dryBus);
      const wetTap = this.ctx.createGain();
      wetTap.gain.value = 0.22;
      g.connect(wetTap);
      wetTap.connect(this.wetBus);
      src.start(0);
      this._atmosSrc = src;
      this._atmosGain = g;
    } catch {
      /* unavailable */
    }
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
    // Extra punch on small arms / MG so baked samples read as loud combat fire
    let typeBoost = 1.35;
    if (profile.startsWith('mortar')) typeBoost = 1.2;
    else if (profile.startsWith('howitzer')) typeBoost = 1.25;
    else if (profile.startsWith('tank') || profile.startsWith('at')) typeBoost = 1.4;
    else if (profile === 'mg' || profile.startsWith('mg_')) typeBoost = 1.38;
    else if (profile === 'smg' || profile.startsWith('smg_')) typeBoost = 1.36;
    else if (profile === 'rifle' || profile.startsWith('rifle_')) typeBoost = 1.42;

    const volJitter = SFX_MASTERS_ONLY ? 0 : volumeJitterForProfile(profile);
    const vol =
      (opts.volume ?? 1) *
      typeBoost *
      (1 - volJitter * 0.5 + Math.random() * volJitter) *
      (opts.nearField ? 1 : this._distanceGain(dist));
    const { min: rateMin, span: rateSpan } = rateJitterForProfile(profile);
    // Masters-only: almost no rate jitter so you hear the raw sample
    const rate = SFX_MASTERS_ONLY
      ? (opts.rate ?? 1) * (0.995 + Math.random() * 0.01)
      : (opts.rate ?? 1) * (rateMin + Math.random() * rateSpan);
    const wetBase =
      profile.startsWith('howitzer') || profile.startsWith('mortar')
        ? 0.38
        : profile.startsWith('tank') || profile.startsWith('at')
          ? 0.28
          : 0.2;
    const wet = SFX_MASTERS_ONLY
      ? wetBase
      : wetBase * (0.85 + Math.random() * 0.3);

    this._lastByType[gapKey] = now;
    this._playBuffer(buf, { pan, vol: Math.min(2.2, vol), rate, wet });
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
      this._warmUpNow();
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
      if (!this._warmedUp) this._warmUpNow();
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
    if (this.master) this.master.gain.value = m ? 0 : 0.62;
    if (m) {
      this.clearVehicleEngines();
      this._stopBattleAtmos();
      this.menuMusic?.stopImmediate();
    } else if (this.inBattle) {
      this._startBattleAtmos();
    }
  }

  /** Call when a match starts — blocks menu theme until leaveBattle(). */
  enterBattle() {
    this.inBattle = true;
    this.menuMusicVisible = false;
    this.menuMusic?.stopImmediate();
    void this.ensureLoaded().then(() => {
      void this._resumeContext().then(() => {
        if (this.inBattle) {
          this._startBattleAudioLock();
          this._startBattleAtmos();
        }
      });
    });
  }

  /** Call when returning to menus (stopGame, main menu). */
  leaveBattle() {
    this.inBattle = false;
    this._stopBattleAudioLock();
    this._stopBattleAtmos();
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

  /**
   * Soft radio static one-shot (legacy / rare use). Prefer `_playRadioVoice`
   * so static is mixed under speech as one transmission, not a second layer.
   */
  playRadioStatic(worldPos = null, opts = {}) {
    if (!this.radioStaticBuffers?.length) return;
    const buf =
      this.radioStaticBuffers[Math.floor(Math.random() * this.radioStaticBuffers.length)];
    if (!buf) return;
    const pan = worldPos ? this._calcPan(worldPos.x, worldPos.z) : 0;
    const dist = worldPos ? this._calcDist(worldPos.x, worldPos.z) : 0;
    const vol =
      Math.min(0.45, this._distanceGain(dist) * (opts.volume ?? 0.28));
    this._playBuffer(buf, {
      pan,
      vol,
      rate: 0.95 + Math.random() * 0.1,
      wet: 0.04,
    });
  }

  /**
   * Faction radio ack when the player selects units ("At the ready, sir!", etc.).
   * Throttled so box-selects don't stack a dozen lines.
   * @param {object} [opts]
   * @param {boolean} [opts.radio] — play as radio net (default true for player)
   */
  playUnitSelect(factionId = null, worldPos = null, opts = {}) {
    this._runWhenReady(() => {
      const key = unitSelectVoiceKey(factionId);
      // Keep language tied to faction — no English fallback for non-English factions
      const bufs = this.unitSelectBuffers[key];
      if (!bufs?.length) return;

      const now = performance.now();
      if (now - (this._lastByType._unitSelect ?? 0) < 420) return;
      this._lastByType._unitSelect = now;

      const buf = bufs[Math.floor(Math.random() * bufs.length)];
      const pan = worldPos ? this._calcPan(worldPos.x, worldPos.z) : 0;
      const dist = worldPos ? this._calcDist(worldPos.x, worldPos.z) : 0;
      const overRadio = opts.radio !== false;
      const vol = Math.min(1.1, this._distanceGain(dist) * 0.95);

      if (overRadio) {
        this._playRadioVoice(buf, {
          pan,
          vol: vol * 0.9,
          rate: 0.97 + Math.random() * 0.06,
          staticLevel: 0.22,
        });
      } else {
        this._playBuffer(buf, {
          pan,
          vol: vol * 0.92,
          rate: 0.97 + Math.random() * 0.06,
          wet: 0.04,
        });
      }
    });
  }

  /**
   * Faction HQ / general radio net when arming fire support or issuing a general order.
   * @param {string} kind — fire support id or general order id
   * @param {string|null} factionId
   * @param {object|null} [worldPos]
   * @param {object} [opts]
   * @param {boolean} [opts.radio] — play as radio net (default true)
   */
  playCommanderOrder(kind, factionId = null, worldPos = null, opts = {}) {
    this._runWhenReady(() => {
      if (!kind || !COMMANDER_ORDER_KINDS.includes(kind)) return;
      const key = unitSelectVoiceKey(factionId);
      const buf = this.commanderOrderBuffers[key]?.[kind];
      if (!buf) return;

      const now = performance.now();
      // Slightly longer throttle than unit select — commander net shouldn't stack
      if (now - (this._lastByType._commanderOrder ?? 0) < 650) return;
      this._lastByType._commanderOrder = now;

      const pan = worldPos ? this._calcPan(worldPos.x, worldPos.z) : 0;
      const dist = worldPos ? this._calcDist(worldPos.x, worldPos.z) : 0;
      const overRadio = opts.radio !== false;
      // Centered command presence — a bit louder than unit acks
      const vol = Math.min(1.18, this._distanceGain(dist) * 1.02);

      if (overRadio) {
        this._playRadioVoice(buf, {
          pan,
          vol: vol * 0.92,
          rate: 0.98 + Math.random() * 0.04,
          staticLevel: 0.24,
          presence: 1.05,
        });
      } else {
        this._playBuffer(buf, {
          pan,
          vol: vol * 0.95,
          rate: 0.98 + Math.random() * 0.04,
          wet: 0.05,
        });
      }
    });
  }

  /**
   * Alarmed under-fire shout when foot troops take hits.
   * Globally throttled so firefights don't become a shout wall.
   * Friendly units sound like radio panic nets; enemy voices are quieter ambient yells.
   * @param {object|null} worldPos
   * @param {string|null} factionId
   * @param {object} [opts]
   * @param {'player'|'enemy'|string} [opts.team]
   * @param {boolean} [opts.radio] — radio net for friendly (default true); enemy stays open-field
   */
  playUnderFire(worldPos = null, factionId = null, opts = {}) {
    this._runWhenReady(() => {
      const key = unitUnderFireVoiceKey(factionId);
      // Never fall back to another language — silent is better than English on German troops
      const bufs = this.unitUnderFireBuffers[key];
      if (!bufs?.length) return;

      const now = performance.now();
      if (now - (this._lastByType._underFire ?? 0) < 900) return;
      this._lastByType._underFire = now;

      const buf = bufs[Math.floor(Math.random() * bufs.length)];
      const pan = worldPos ? this._calcPan(worldPos.x, worldPos.z) : 0;
      const dist = worldPos ? this._calcDist(worldPos.x, worldPos.z) : 0;
      const isEnemy = opts.team === 'enemy';
      const useRadio = !isEnemy && opts.radio !== false;

      if (useRadio) {
        const vol = Math.min(1.2, this._distanceGain(dist) * 1.05);
        this._playRadioVoice(buf, {
          pan,
          vol,
          rate: 0.99 + Math.random() * 0.04,
          staticLevel: 0.2,
          presence: 0.95,
        });
        return;
      }

      // Enemy: quieter battlefield ambient yell (no radio bed)
      const vol = Math.min(0.62, this._distanceGain(dist) * 0.48);
      this._playBuffer(buf, {
        pan,
        vol,
        rate: 0.99 + Math.random() * 0.04,
        wet: 0.28,
      });
    });
  }

  /**
   * Infantry / MG / sniper casualty — random field yell in the unit's language.
   * @param {object} [opts]
   * @param {'player'|'enemy'|string} [opts.team] — enemy death cries stay quieter (ambient)
   */
  playInfantryDeath(worldPos = null, factionId = null, opts = {}) {
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
      const isEnemy = opts.team === 'enemy';
      const vol =
        this._distanceGain(dist) *
        (isEnemy ? 0.38 + Math.random() * 0.1 : 0.72 + Math.random() * 0.18);

      this._playBuffer(buf, {
        pan,
        vol: vol * (isEnemy ? 0.95 : 1.08),
        rate: 0.9 + Math.random() * 0.14,
        wet: isEnemy ? 0.32 : 0.18,
      });
    });
  }

  playImpact(type, worldPos, delaySec = 0) {
    this._runWhenReady(() => {
      const now = performance.now();
      if (now - (this._lastByType._impact ?? 0) < (type === 'bullet' ? 120 : 80)) return;
      const useExplosion =
        type === 'shell' || type === 'tank_round' || type === 'explosion';
      const buf = useExplosion
        ? this._pickFromPool(this.explosionBuffers, '_lastExplosionFile') ??
          this.buffers.explosion
        : this._pickFromPool(this.impactBuffers, '_lastImpactFile') ?? this.buffers.impact;
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
        rate: useExplosion ? 0.88 + Math.random() * 0.12 : 0.9 + Math.random() * 0.14,
        wet: useExplosion ? 0.28 + Math.random() * 0.1 : 0.4,
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
      case 'explosion': {
        const buf =
          this._pickFromPool(this.explosionBuffers, '_lastExplosionFile') ??
          this.buffers.explosion;
        if (buf) {
          this._playBuffer(buf, {
            vol: EXPLOSION_DIRECT_GAIN,
            wet: 0.26 + Math.random() * 0.08,
            rate: 0.86 + Math.random() * 0.12,
          });
        }
        break;
      }
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

  /**
   * Play a voice line as a single radio transmission:
   * speech + quiet channel noise share one pan, filter chain, and envelope.
   * Avoids the "two clips layered" feel of a loud static one-shot under VO.
   *
   * @param {AudioBuffer} buffer
   * @param {object} [opts]
   * @param {number} [opts.pan]
   * @param {number} [opts.vol]
   * @param {number} [opts.rate]
   * @param {number} [opts.staticLevel] — channel noise under speech (0–0.4 typical)
   * @param {number} [opts.presence] — mid boost strength (~1)
   * @param {number} [opts.delay]
   */
  _playRadioVoice(buffer, opts = {}) {
    if (!this.ctx || !buffer) return;

    const pan = opts.pan ?? 0;
    const vol = opts.vol ?? 1;
    const rate = opts.rate ?? 1;
    const staticLevel = Math.max(0, Math.min(0.4, opts.staticLevel ?? 0.22));
    const presence = opts.presence ?? 1;
    const delay = opts.delay ?? 0;

    const t0 = this.ctx.currentTime + delay;
    const voiceDur = buffer.duration / Math.max(0.05, rate);
    // Slight pad so the channel opens/closes around the speech
    const openPad = 0.04;
    const closePad = 0.1;
    const totalDur = voiceDur + openPad + closePad;

    // Mix bus: speech + noise + click sum here, then share one envelope + pan
    const mix = this.ctx.createGain();
    mix.gain.value = 1;

    const master = this.ctx.createGain();
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.linearRampToValueAtTime(vol, t0 + 0.03);
    master.gain.setValueAtTime(vol, t0 + openPad + voiceDur * 0.92);
    master.gain.linearRampToValueAtTime(0.0001, t0 + totalDur);
    mix.connect(master);

    let out = master;
    try {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = pan;
      master.connect(panner);
      out = panner;
    } catch {
      /* no stereo pan */
    }

    // Mild radio chain (voices are already band-limited from bake — keep this light)
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 380;
    hp.Q.value = 0.7;

    const peaking = this.ctx.createBiquadFilter();
    peaking.type = 'peaking';
    peaking.frequency.value = 1450;
    peaking.Q.value = 0.9;
    peaking.gain.value = 2.2 * presence;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3100;
    lp.Q.value = 0.7;

    // Light glue compressor so speech and noise sit as one channel
    let voiceOut = lp;
    try {
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -22;
      comp.knee.value = 12;
      comp.ratio.value = 3.5;
      comp.attack.value = 0.004;
      comp.release.value = 0.12;
      lp.connect(comp);
      voiceOut = comp;
    } catch {
      /* compressor optional */
    }

    hp.connect(peaking);
    peaking.connect(lp);
    voiceOut.connect(mix);

    // Voice
    const voice = this.ctx.createBufferSource();
    voice.buffer = buffer;
    voice.playbackRate.value = rate;
    const voiceG = this.ctx.createGain();
    voiceG.gain.value = 1;
    voice.connect(voiceG);
    voiceG.connect(hp);

    // Quiet channel noise — looped, duration-matched, ducked under speech
    if (staticLevel > 0 && this.radioStaticBuffers?.length) {
      const noiseBuf =
        this.radioStaticBuffers[Math.floor(Math.random() * this.radioStaticBuffers.length)];
      if (noiseBuf) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuf;
        noise.loop = true;
        noise.playbackRate.value = 0.92 + Math.random() * 0.12;

        const noiseHp = this.ctx.createBiquadFilter();
        noiseHp.type = 'highpass';
        noiseHp.frequency.value = 500;
        const noiseLp = this.ctx.createBiquadFilter();
        noiseLp.type = 'lowpass';
        noiseLp.frequency.value = 3400;

        const noiseG = this.ctx.createGain();
        // Open → audible bed under VO → slight rise on close (still under speech)
        // Levels relative to mix (master applies overall vol)
        const bed = staticLevel;
        noiseG.gain.setValueAtTime(0.0001, t0);
        noiseG.gain.linearRampToValueAtTime(bed * 1.35, t0 + 0.02);
        noiseG.gain.linearRampToValueAtTime(bed * 0.85, t0 + openPad + 0.1);
        noiseG.gain.setValueAtTime(bed * 0.85, t0 + openPad + voiceDur * 0.85);
        noiseG.gain.linearRampToValueAtTime(bed * 1.15, t0 + openPad + voiceDur);
        noiseG.gain.linearRampToValueAtTime(0.0001, t0 + totalDur);

        noise.connect(noiseHp);
        noiseHp.connect(noiseLp);
        noiseLp.connect(noiseG);
        noiseG.connect(mix);

        noise.start(t0);
        noise.stop(t0 + totalDur + 0.02);
      }
    }

    // Tiny key-click / squelch so it reads as PTT, not a second sample
    try {
      const clickLen = Math.floor(this.ctx.sampleRate * 0.018);
      const clickBuf = this.ctx.createBuffer(1, clickLen, this.ctx.sampleRate);
      const data = clickBuf.getChannelData(0);
      for (let i = 0; i < clickLen; i++) {
        const t = i / clickLen;
        data[i] = (Math.random() * 2 - 1) * (1 - t) * (1 - t);
      }
      const click = this.ctx.createBufferSource();
      click.buffer = clickBuf;
      const clickF = this.ctx.createBiquadFilter();
      clickF.type = 'bandpass';
      clickF.frequency.value = 1800;
      clickF.Q.value = 0.8;
      const clickG = this.ctx.createGain();
      clickG.gain.value = 0.22;
      click.connect(clickF);
      clickF.connect(clickG);
      clickG.connect(mix);
      click.start(t0);
      click.stop(t0 + 0.025);
    } catch {
      /* ignore */
    }

    // Almost dry — radio is already band-limited; reverb would unglue the mix
    const dry = this.ctx.createGain();
    dry.gain.value = 0.96;
    const wetG = this.ctx.createGain();
    wetG.gain.value = 0.04;
    out.connect(dry);
    out.connect(wetG);
    dry.connect(this.dryBus);
    wetG.connect(this.wetBus);

    voice.start(t0 + openPad * 0.5);
    voice.stop(t0 + openPad + voiceDur + 0.05);
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

export {
  resolveWeaponProfile,
  mgProfileForFaction,
  smgProfileForFaction,
  weaponProfileForDef,
} from './WeaponSounds.js';
