/**
 * Gunfire SFX from baked WAV samples + vehicle engine loops + light ambience processing.
 */

import { VehicleEngineAudio } from './VehicleEngineAudio.js';
import { StrafeAircraftAudio } from './StrafeAircraftAudio.js';
import { MenuMusic } from './MenuMusic.js';
import { EndMusic } from './EndMusic.js';
import { publicUrl } from '../lib/publicUrl.js';
import { isConstrainedMobileAudio } from '../lib/tabletDetect.js';
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
  engine_tank_pivot_tracks: publicUrl('sounds/engine-tank-pivot-tracks.wav'),
  engine_tank_destroyer_germany: publicUrl('sounds/engine-tank-destroyer-germany.wav'),
  engine_tank_destroyer_usa: publicUrl('sounds/engine-tank-destroyer-usa.wav'),
  engine_tank_destroyer_uk: publicUrl('sounds/engine-tank-destroyer-uk.wav'),
  engine_tank_destroyer_russia: publicUrl('sounds/engine-tank-destroyer-russia.wav'),
  engine_tank_destroyer_japan: publicUrl('sounds/engine-tank-destroyer-japan.wav'),
  engine_armored_car: publicUrl('sounds/engine-armored-car.wav'),
  engine_armored_car_exhaust: publicUrl('sounds/engine-armored-car-exhaust.wav'),
  engine_truck: publicUrl('sounds/engine-truck.wav'),
  engine_truck_exhaust: publicUrl('sounds/engine-truck-exhaust.wav'),
  aircraft_flyby: publicUrl('sounds/aircraft-flyby.wav'),
  aircraft_flyby_exhaust: publicUrl('sounds/aircraft-flyby-exhaust.wav'),
  aircraft_flyby_prop: publicUrl('sounds/aircraft-flyby-prop.wav'),
};

// Faction-specific engine beds. Generic loops remain fallback paths while
// these ElevenLabs masters are being added or if a file fails to load.
for (const faction of ['germany', 'usa', 'uk', 'russia', 'japan']) {
  SAMPLE_URLS[`engine_tank_${faction}`] = publicUrl(`sounds/engine-tank-${faction}.wav`);
  SAMPLE_URLS[`engine_tank_${faction}_exhaust`] = publicUrl(
    `sounds/engine-tank-${faction}-exhaust.wav`
  );
  SAMPLE_URLS[`engine_tank_${faction}_pivot_tracks`] = publicUrl(
    `sounds/engine-tank-${faction}-pivot-tracks.wav`
  );
  SAMPLE_URLS[`engine_armored_car_${faction}`] = publicUrl(
    `sounds/engine-armored-car-${faction}.wav`
  );
  SAMPLE_URLS[`engine_armored_car_${faction}_exhaust`] = publicUrl(
    `sounds/engine-armored-car-${faction}-exhaust.wav`
  );
  SAMPLE_URLS[`engine_truck_${faction}`] = publicUrl(`sounds/engine-truck-${faction}.wav`);
  SAMPLE_URLS[`engine_truck_${faction}_exhaust`] = publicUrl(
    `sounds/engine-truck-${faction}-exhaust.wav`
  );
  // Faction fighter engine loops for strafe / bomb fly-bys
  SAMPLE_URLS[`aircraft_flyby_${faction}`] = publicUrl(
    `sounds/aircraft-flyby-${faction}.wav`
  );
  SAMPLE_URLS[`aircraft_flyby_exhaust_${faction}`] = publicUrl(
    `sounds/aircraft-flyby-${faction}-exhaust.wav`
  );
  SAMPLE_URLS[`aircraft_flyby_prop_${faction}`] = publicUrl(
    `sounds/aircraft-flyby-${faction}-prop.wav`
  );
  // Multi-engine troop transports for airborne drops
  SAMPLE_URLS[`aircraft_transport_${faction}`] = publicUrl(
    `sounds/aircraft-transport-${faction}.wav`
  );
  SAMPLE_URLS[`aircraft_transport_exhaust_${faction}`] = publicUrl(
    `sounds/aircraft-transport-${faction}-exhaust.wav`
  );
  SAMPLE_URLS[`aircraft_transport_prop_${faction}`] = publicUrl(
    `sounds/aircraft-transport-${faction}-prop.wav`
  );
}

/** Extra one-shot pools (ElevenLabs extras) — loaded into arrays for random pick. */
const EXPLOSION_SAMPLE_FILES_FULL = [
  'explosion.wav',
  'explosion-b.wav',
  'explosion-c.wav',
  'explosion-d.wav',
  'explosion-e.wav',
  'explosion-j.wav',
  'explosion-k.wav',
  'explosion-f.wav',
  'explosion-g.wav',
  'explosion-h.wav',
  'explosion-i.wav',
];
const MINE_EXPLOSION_FILES = ['mine-explosion-01.wav', 'mine-explosion-02.wav'];
const IMPACT_SAMPLE_FILES_FULL = [
  'impact.wav',
  'impact-b.wav',
  'impact-c.wav',
  'impact-d.wav',
  'impact-e.wav',
  'impact-f.wav',
  'impact-g.wav',
];
const ARMOR_RICOCHET_FILES = Array.from(
  { length: 6 },
  (_, index) => `armor-ricochet-${String(index + 1).padStart(2, '0')}.wav`
);
const BULLET_IMPACT_FILES = Array.from(
  { length: 4 },
  (_, index) => `bullet-impact-dirt-${String(index + 1).padStart(2, '0')}.wav`
);
const BULLET_STRUCTURE_IMPACT_FILES = Array.from(
  { length: 3 },
  (_, index) => `bullet-impact-structure-${String(index + 1).padStart(2, '0')}.wav`
);
const BULLET_METAL_IMPACT_FILES = Array.from(
  { length: 3 },
  (_, index) => `bullet-impact-metal-${String(index + 1).padStart(2, '0')}.wav`
);
const BULLET_WHIZ_FILES = Array.from(
  { length: 4 },
  (_, index) => `bullet-whiz-${String(index + 1).padStart(2, '0')}.wav`
);
const ATMOS_SAMPLE_FILES_FULL = ['battle-atmos.wav', 'battle-atmos-close.wav'];
const ATMOS_SAMPLE_FILES_TABLET = ['battle-atmos-short.wav', 'battle-atmos-close-short.wav'];
/** Looped channel noise under speech (static / crackle / hum beds). */
const RADIO_STATIC_FILES = [
  'radio-static-a.wav',
  'radio-static-b.wav',
  'radio-static-c.wav',
  'radio-static-d.wav',
  'radio-static-e.wav',
  'radio-crackle-bed-a.wav',
  'radio-crackle-bed-b.wav',
  'radio-hum-a.wav',
];
/** Short pre-speak openers (PTT key, squelch, crackle burst) before VO. */
const RADIO_OPEN_FILES = [
  'radio-open-01.wav',
  'radio-open-02.wav',
  'radio-open-03.wav',
  'radio-open-04.wav',
  'radio-open-05.wav',
  'radio-open-06.wav',
  'radio-open-07.wav',
  'radio-open-08.wav',
];
const ARTILLERY_IMPACT_FILES = Array.from(
  { length: 6 },
  (_, index) => `artillery-impact-el-${String(index + 1).padStart(2, '0')}.wav`
);
const FIRE_SUPPORT_SALVO_FILES = {
  barrage: ['barrage-salvo-el-01.wav', 'barrage-salvo-el-02.wav'],
  creepingBarrage: [
    'creeping-barrage-salvo-el-01.wav',
    'creeping-barrage-salvo-el-02.wav',
  ],
};
const BOMB_EXPLOSION_FILES = [
  'bomb-explosion-01.wav',
  'bomb-explosion-02.wav',
  'bomb-explosion-03.wav',
];
/** Occasional US rifle reload cue — M1 Garand en-bloc clip eject. */
const GARAND_PING_FILES = ['m1-garand-ping-el-01.wav'];
const ACHIEVEMENT_FILES = {
  medal: ['achievement-medal.wav'],
  ribbon: ['achievement-ribbon.wav'],
  commendation: ['achievement-commendation.wav'],
};

/** Scenery / structure collapse one-shots (ElevenLabs) by building scale. */
const BUILDING_COLLAPSE_FILES = {
  small: ['building-collapse-small-01.wav', 'building-collapse-small-02.wav'],
  medium: ['building-collapse-medium-01.wav', 'building-collapse-medium-02.wav'],
  large: ['building-collapse-large-01.wav', 'building-collapse-large-02.wav'],
};
const BUILDING_COLLAPSE_GAIN = {
  small: 1.05,
  medium: 1.28,
  large: 1.52,
};

// TEMP originals-only: keep all EL gens; pitch-clone filter only applies to weapons
const EXPLOSION_SAMPLE_FILES = EXPLOSION_SAMPLE_FILES_FULL;
const IMPACT_SAMPLE_FILES = IMPACT_SAMPLE_FILES_FULL;
const ATMOS_SAMPLE_FILES = ATMOS_SAMPLE_FILES_FULL;

const INFANTRY_DEATH_COUNT = 8;
const INFANTRY_DEATH_FACTIONS = {
  default: { prefix: 'infantry-death', factions: new Set() },
  usa: { prefix: 'infantry-death-usa', factions: new Set(['usa']) },
  uk: { prefix: 'infantry-death-uk', factions: new Set(['uk']) },
  germany: { prefix: 'infantry-death-germany', factions: new Set(['germany']) },
  russia: { prefix: 'infantry-death-russia', factions: new Set(['russia']) },
  japan: { prefix: 'infantry-death-japan', factions: new Set(['japan']) },
};
const INFANTRY_TYPES = new Set([
  'radioOperator',
  'infantry',
  'paratrooper',
  'machineGun',
  'sniper',
  'medic',
  'engineer',
  'mortar',
  'vehicleCrew',
  'truckDriver',
]);

const UNIT_SELECT_COUNT = 6;
const UNIT_SELECT_FACTIONS = ['usa', 'uk', 'germany', 'russia', 'japan'];
const UNIT_UNDERFIRE_COUNT = 12;
const UNIT_UNDERFIRE_FACTIONS = ['usa', 'uk', 'germany', 'russia', 'japan'];
const UNIT_RETREAT_COUNT = 6;
const UNIT_RETREAT_FACTIONS = ['usa', 'uk', 'germany', 'russia', 'japan'];
const UNIT_ATTACK_COUNT = 4;
const UNIT_ATTACK_FACTIONS = ['usa', 'uk', 'germany', 'russia', 'japan'];
const VEHICLE_CREW_VOICE_TYPES = new Set([
  'tank',
  'tankDestroyer',
  'superHeavyTank',
  'armoredCar',
  'truck',
]);
const VEHICLE_CREW_FACTIONS = ['usa', 'uk', 'germany', 'russia', 'japan'];
const VEHICLE_SELECT_COUNT = 4;
const VEHICLE_ATTACK_COUNT = 4;
const VEHICLE_MOVE_COUNT = 4;
const VEHICLE_RETREAT_COUNT = 4;
const VEHICLE_UNDERFIRE_COUNT = 6;
const TRUCK_SELECT_COUNT = 4;
const TRUCK_ATTACK_COUNT = 3;
const TRUCK_MOVE_COUNT = 4;
const TRUCK_RETREAT_COUNT = 4;
const TRUCK_UNDERFIRE_COUNT = 4;
/** After the first move ack, keep that unit quiet for a random stretch. */
const VEHICLE_MOVE_VOICE_GAP_MIN_MS = 14000;
const VEHICLE_MOVE_VOICE_GAP_MAX_MS = 28000;
const UNIT_CLASS_VOICE_TYPES = [
  'infantry',
  'machineGun',
  'mortar',
  'sniper',
  'antiTankGun',
  'artillery',
  'medic',
  'engineer',
  'commander',
  'radioOperator',
];
const UNIT_CLASS_VOICE_TYPE_SET = new Set(UNIT_CLASS_VOICE_TYPES);
const UNIT_CLASS_VOICE_KINDS = ['select', 'move', 'attack', 'retreat'];
const UNIT_CLASS_VOICE_COUNT = 3;
const UNIT_INFANTRY_MOVE_COUNT = 4;
/** Fire-support + general-order commander radio lines (baked edge-tts). */
const COMMANDER_ORDER_KINDS = [
  'strafe',
  'airBomb',
  'barrage',
  'creepingBarrage',
  'airborneDrop',
  'fullRetreat',
  'holdGround',
  'digIn',
  'lostCommander',
];
const COMMANDER_ORDER_FACTIONS = ['usa', 'uk', 'germany', 'russia', 'japan'];
const GENERAL_ORDER_VOICE_KINDS = ['fullRetreat', 'holdGround', 'digIn'];
const GENERAL_ORDER_VOICE_VARIANTS = 2;

function infantryDeathVoiceKey(factionId) {
  if (factionId === 'usa') return 'usa';
  if (factionId === 'uk') return 'uk';
  if (factionId === 'germany') return 'germany';
  if (factionId === 'russia') return 'russia';
  if (factionId === 'japan') return 'japan';
  return 'default';
}

function unitSelectVoiceKey(factionId) {
  const id = String(factionId ?? '').toLowerCase();
  if (id === 'germany' || id === 'russia' || id === 'uk' || id === 'usa' || id === 'japan') {
    return id;
  }
  return 'usa';
}

export function isVehicleCrewVoiceType(type) {
  return VEHICLE_CREW_VOICE_TYPES.has(type);
}

export function unitVoiceClass(type) {
  if (type === 'paratrooper' || type === 'vehicleCrew' || type === 'truckDriver') return 'infantry';
  if (UNIT_CLASS_VOICE_TYPE_SET.has(type)) return type;
  return null;
}

function unitHasMoveVoice(type) {
  return isVehicleCrewVoiceType(type) || !!unitVoiceClass(type);
}

/** True until this unit has spoken a move ack, then only after its quiet window. */
export function isMoveVoiceDue(unit, now = performance.now()) {
  if (!unit || !unitHasMoveVoice(unit.def?.type)) return false;
  return now >= (unit._moveVoiceReadyAt ?? unit._vehicleMoveVoiceReadyAt ?? 0);
}

/** @deprecated use isMoveVoiceDue — kept for callers that still import the old name */
export function isVehicleMoveVoiceDue(unit, now = performance.now()) {
  return isMoveVoiceDue(unit, now);
}

function nextVehicleMoveVoiceReadyAt(now) {
  return (
    now +
    VEHICLE_MOVE_VOICE_GAP_MIN_MS +
    Math.random() * (VEHICLE_MOVE_VOICE_GAP_MAX_MS - VEHICLE_MOVE_VOICE_GAP_MIN_MS)
  );
}

function emptyFactionVoiceMap() {
  return { usa: [], uk: [], germany: [], russia: [], japan: [] };
}

function emptyUnitClassVoiceBuffers() {
  const buffers = {};
  for (const kind of UNIT_CLASS_VOICE_KINDS) {
    buffers[kind] = {};
    for (const unitClass of UNIT_CLASS_VOICE_TYPES) {
      buffers[kind][unitClass] = emptyFactionVoiceMap();
    }
  }
  return buffers;
}

function unitUnderFireVoiceKey(factionId) {
  const id = String(factionId ?? '').toLowerCase();
  // Only return a language pack that exists — never map DE/RU onto English
  if (id === 'germany' || id === 'russia' || id === 'uk' || id === 'usa' || id === 'japan') {
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
    this.mineExplosionBuffers = [];
    /** @type {AudioBuffer[]} */
    this.impactBuffers = [];
    /** @type {AudioBuffer[]} */
    this.armorRicochetBuffers = [];
    /** @type {AudioBuffer[]} */
    this.bulletImpactBuffers = [];
    /** @type {AudioBuffer[]} */
    this.bulletStructureImpactBuffers = [];
    /** @type {AudioBuffer[]} */
    this.bulletMetalImpactBuffers = [];
    /** @type {AudioBuffer[]} */
    this.bulletWhizBuffers = [];
    /** @type {AudioBuffer[]} */
    this.atmosBuffers = [];
    /** @type {AudioBuffer[]} */
    this.radioStaticBuffers = [];
    /** @type {AudioBuffer[]} */
    this.radioOpenBuffers = [];
    /** @type {AudioBuffer[]} */
    this.artilleryImpactBuffers = [];
    /** @type {Record<string, AudioBuffer[]>} */
    this.fireSupportSalvoBuffers = { barrage: [], creepingBarrage: [] };
    /** @type {AudioBuffer[]} */
    this.bombExplosionBuffers = [];
    /** @type {AudioBuffer[]} */
    this.garandPingBuffers = [];
    this.achievementBuffers = { medal: [], ribbon: [], commendation: [] };
    /** @type {Record<'small'|'medium'|'large', AudioBuffer[]>} */
    this.buildingCollapseBuffers = { small: [], medium: [], large: [] };
    this._atmosSrc = null;
    this._atmosGain = null;
    this._tabletAtmosAudio = null;
    this._lastExplosionFile = null;
    this._lastMineExplosionFile = null;
    this._lastImpactFile = null;
    this._lastGarandPingFile = null;
    this._lastBuildingCollapseSmall = null;
    this._lastBuildingCollapseMedium = null;
    this._lastBuildingCollapseLarge = null;
    this.unlocked = false;
    this.muted = false;
    this._loadPromise = null;
    this._lastByType = {};
    this._listener = { x: 0, y: 0, z: 0 };
    this.vehicleEngines = null;
    this.strafeAircraft = null;
    this.menuMusic = null;
    this.memorialMusic = null;
    this.endMusic = null;
    this.menuMusicVisible = false;
    this.memorialMusicVisible = false;
    this.inBattle = false;
    this._resumePromise = null;
    this._warmedUp = false;
    this._pendingPlays = [];
    this._maxPendingPlays = 32;
    this._battleLockOsc = null;
    this._battleLockGain = null;
    this._htmlLock = null;
    this._samplesReady = false;
    this._constrainedAudio = isConstrainedMobileAudio();
    this._sampleLoadsActive = 0;
    this._sampleLoadWaiters = [];
    this._coreLoadPromise = null;
    this._resolveCoreLoad = null;
    /** @type {HTMLAudioElement[]} */
    this._htmlPool = [];
    this._htmlPoolBusy = 0;
    /** @type {Record<string, AudioBuffer[]>} */
    this.infantryDeathBuffers = {
      default: [],
      usa: [],
      uk: [],
      germany: [],
      russia: [],
      japan: [],
    };
    /** @type {Record<string, AudioBuffer[]>} */
    this.unitSelectBuffers = { usa: [], uk: [], germany: [], russia: [], japan: [] };
    /** @type {Record<string, AudioBuffer[]>} */
    this.unitUnderFireBuffers = { usa: [], uk: [], germany: [], russia: [], japan: [] };
    /** @type {Record<string, AudioBuffer[]>} */
    this.unitRetreatBuffers = { usa: [], uk: [], germany: [], russia: [], japan: [] };
    /** @type {Record<string, AudioBuffer[]>} */
    this.unitAttackBuffers = { usa: [], uk: [], germany: [], russia: [], japan: [] };
    this.vehicleSelectBuffers = emptyFactionVoiceMap();
    this.vehicleAttackBuffers = emptyFactionVoiceMap();
    this.vehicleMoveBuffers = emptyFactionVoiceMap();
    this.vehicleRetreatBuffers = emptyFactionVoiceMap();
    this.vehicleUnderFireBuffers = emptyFactionVoiceMap();
    this.truckSelectBuffers = emptyFactionVoiceMap();
    this.truckAttackBuffers = emptyFactionVoiceMap();
    this.truckMoveBuffers = emptyFactionVoiceMap();
    this.truckRetreatBuffers = emptyFactionVoiceMap();
    this.truckUnderFireBuffers = emptyFactionVoiceMap();
    this.unitClassVoiceBuffers = emptyUnitClassVoiceBuffers();
    /**
     * Commander order lines: buffers[faction][kind] = AudioBuffer
     * @type {Record<string, Record<string, AudioBuffer>>}
     */
    this.commanderOrderBuffers = {
      usa: {},
      uk: {},
      germany: {},
      russia: {},
      japan: {},
    };
    /** ElevenLabs variants used in preference to the legacy single order line. */
    this.commanderGeneralOrderBuffers = {
      usa: {},
      uk: {},
      germany: {},
      russia: {},
      japan: {},
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
      return true;
    }
    try {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) return false;
      this.ctx = new AudioContextCtor();
      this._buildGraph();
      this.unlocked = true;
      this._warmedUp = false;
      this.vehicleEngines = new VehicleEngineAudio(this);
      this.strafeAircraft = new StrafeAircraftAudio(this);
      this.menuMusic = new MenuMusic(this);
      this.memorialMusic = new MenuMusic(this, {
        url: publicUrl('music/war-stats-theme.ogg'),
        targetGain: 0.34,
        fadeSec: 1.8,
      });
      this.endMusic = new EndMusic(this);
      // Put the small menu theme ahead of the large combat sample batch so a
      // cold cache can start music promptly after the first user gesture.
      this.menuMusic.ensureLoaded();
      this.memorialMusic.ensureLoaded();
      this._coreLoadPromise = new Promise((resolve) => {
        this._resolveCoreLoad = resolve;
      });
      this._loadPromise = this._loadSamples();
      if (!this.inBattle) {
        if (this.memorialMusicVisible) this.memorialMusic.setMenuActive(true);
        else if (this.menuMusicVisible) this.menuMusic.setMenuActive(true);
      }
      return true;
    } catch {
      this.unlocked = false;
      this._loadPromise = null;
      this._resolveCoreLoad?.(false);
      this._coreLoadPromise = null;
      this._resolveCoreLoad = null;
      this._samplesReady = false;
      try {
        this.ctx?.close?.();
      } catch {
        /* unavailable */
      }
      this.ctx = null;
      this.master = null;
      this.reverb = null;
      this.dryBus = null;
      this.wetBus = null;
      this.vehicleEngines = null;
      this.strafeAircraft = null;
      this.menuMusic = null;
      this.memorialMusic = null;
      return false;
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

  async _loadDecodedSample(url) {
    const concurrency = this._constrainedAudio ? 2 : Number.POSITIVE_INFINITY;
    if (this._sampleLoadsActive >= concurrency) {
      await new Promise((resolve) => this._sampleLoadWaiters.push(resolve));
    }
    this._sampleLoadsActive += 1;
    try {
      const res = await fetch(url);
      if (!res.ok || !this.ctx || this.ctx.state === 'closed') return null;
      const ab = await res.arrayBuffer();
      return await this.ctx.decodeAudioData(ab);
    } catch {
      return null;
    } finally {
      this._sampleLoadsActive -= 1;
      this._sampleLoadWaiters.shift()?.();
    }
  }

  async _loadSamples() {
    const entries = Object.entries(SAMPLE_URLS);
    const loadEntries = (items) => Promise.all(
      items.map(async ([key, url]) => {
        try {
          const buf = await this._loadDecodedSample(url);
          if (buf) this.buffers[key] = buf;
        } catch {
          /* missing sample */
        }
      })
    );
    const coreEntries = entries.filter(([key]) => key === 'impact' || key === 'explosion');
    const supplementalEntries = entries.filter(
      ([key]) => key !== 'impact' && key !== 'explosion'
    );
    if (this._constrainedAudio) {
      await loadEntries(coreEntries);
      const atmos = await this._loadDecodedSample(
        publicUrl(`sounds/${ATMOS_SAMPLE_FILES_TABLET[0]}`)
      );
      if (atmos) this.atmosBuffers.push(atmos);
      // The two baseline effects are enough for tablet combat to start while
      // weapon masters, engines, voices, and variants fill in progressively.
      // A short ambience bed is included so iOS has audible battle output as
      // soon as this readiness boundary is crossed.
      this._samplesReady = true;
      this._resolveCoreLoad?.(true);
      this._resolveCoreLoad = null;
      this._flushPendingPlays();
    } else {
      // Desktop intentionally retains the original all-at-once load order.
      await loadEntries(entries);
    }

    const weaponUrls = getAllWeaponSampleUrls();
    await Promise.all(
      weaponUrls.map(async (url) => {
        try {
          const buf = await this._loadDecodedSample(url);
          if (!buf) return;
          const stem = url.split('/').pop().replace(/\.wav$/i, '');
          this.weaponBuffers[stem] = buf;
        } catch {
          /* missing sample */
        }
      })
    );

    if (this._constrainedAudio) await loadEntries(supplementalEntries);

    const deathLoads = [];
    for (const [voiceKey, { prefix }] of Object.entries(INFANTRY_DEATH_FACTIONS)) {
      const count = this._constrainedAudio ? 3 : INFANTRY_DEATH_COUNT;
      for (let i = 1; i <= count; i++) {
        const num = String(i).padStart(2, '0');
        deathLoads.push(
          (async () => {
            try {
              const buf = await this._loadDecodedSample(publicUrl(`sounds/${prefix}-${num}.wav`));
              if (!buf) return;
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
      const count = this._constrainedAudio ? 2 : UNIT_SELECT_COUNT;
      for (let i = 1; i <= count; i++) {
        const num = String(i).padStart(2, '0');
        selectLoads.push(
          (async () => {
            try {
              const buf = await this._loadDecodedSample(publicUrl(`sounds/unit-select-${faction}-${num}.wav`));
              if (!buf) return;
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
      const count = this._constrainedAudio ? 3 : UNIT_UNDERFIRE_COUNT;
      for (let i = 1; i <= count; i++) {
        const num = String(i).padStart(2, '0');
        underFireLoads.push(
          (async () => {
            try {
              const buf = await this._loadDecodedSample(publicUrl(`sounds/unit-underfire-${faction}-${num}.wav`));
              if (!buf) return;
              this.unitUnderFireBuffers[faction].push(buf);
            } catch {
              /* missing */
            }
          })()
        );
      }
    }
    await Promise.all(underFireLoads);

    const retreatLoads = [];
    for (const faction of UNIT_RETREAT_FACTIONS) {
      const count = this._constrainedAudio ? 2 : UNIT_RETREAT_COUNT;
      for (let i = 1; i <= count; i++) {
        const num = String(i).padStart(2, '0');
        retreatLoads.push(
          (async () => {
            try {
              const buf = await this._loadDecodedSample(publicUrl(`sounds/unit-retreat-${faction}-${num}.wav`));
              if (!buf) return;
              this.unitRetreatBuffers[faction].push(buf);
            } catch {
              /* missing */
            }
          })()
        );
      }
    }
    await Promise.all(retreatLoads);

    const attackLoads = [];
    for (const faction of UNIT_ATTACK_FACTIONS) {
      const count = this._constrainedAudio ? 2 : UNIT_ATTACK_COUNT;
      for (let i = 1; i <= count; i++) {
        const num = String(i).padStart(2, '0');
        attackLoads.push(
          (async () => {
            try {
              const buf = await this._loadDecodedSample(publicUrl(`sounds/unit-attack-${faction}-${num}.wav`));
              if (!buf) return;
              this.unitAttackBuffers[faction].push(buf);
            } catch {
              /* missing */
            }
          })()
        );
      }
    }
    await Promise.all(attackLoads);

    const vehicleVoiceLoads = [];
    const loadVehicleVoice = (kind, count, target) => {
      for (const faction of VEHICLE_CREW_FACTIONS) {
        const n = this._constrainedAudio ? Math.min(2, count) : count;
        for (let i = 1; i <= n; i++) {
          const num = String(i).padStart(2, '0');
          vehicleVoiceLoads.push(
            (async () => {
              try {
                const buf = await this._loadDecodedSample(
                  publicUrl(`sounds/vehicle-${kind}-${faction}-${num}.wav`)
                );
                if (!buf) return;
                target[faction].push(buf);
              } catch {
                /* missing */
              }
            })()
          );
        }
      }
    };
    loadVehicleVoice('select', VEHICLE_SELECT_COUNT, this.vehicleSelectBuffers);
    loadVehicleVoice('attack', VEHICLE_ATTACK_COUNT, this.vehicleAttackBuffers);
    loadVehicleVoice('move', VEHICLE_MOVE_COUNT, this.vehicleMoveBuffers);
    loadVehicleVoice('retreat', VEHICLE_RETREAT_COUNT, this.vehicleRetreatBuffers);
    loadVehicleVoice('underfire', VEHICLE_UNDERFIRE_COUNT, this.vehicleUnderFireBuffers);
    await Promise.all(vehicleVoiceLoads);

    const truckVoiceLoads = [];
    const loadTruckVoice = (kind, count, target) => {
      for (const faction of VEHICLE_CREW_FACTIONS) {
        const n = this._constrainedAudio ? Math.min(2, count) : count;
        for (let i = 1; i <= n; i++) {
          const num = String(i).padStart(2, '0');
          truckVoiceLoads.push(
            (async () => {
              try {
                const buf = await this._loadDecodedSample(
                  publicUrl(`sounds/truck-${kind}-${faction}-${num}.wav`)
                );
                if (!buf) return;
                target[faction].push(buf);
              } catch {
                /* missing */
              }
            })()
          );
        }
      }
    };
    loadTruckVoice('select', TRUCK_SELECT_COUNT, this.truckSelectBuffers);
    loadTruckVoice('attack', TRUCK_ATTACK_COUNT, this.truckAttackBuffers);
    loadTruckVoice('move', TRUCK_MOVE_COUNT, this.truckMoveBuffers);
    loadTruckVoice('retreat', TRUCK_RETREAT_COUNT, this.truckRetreatBuffers);
    loadTruckVoice('underfire', TRUCK_UNDERFIRE_COUNT, this.truckUnderFireBuffers);
    await Promise.all(truckVoiceLoads);

    const classVoiceLoads = [];
    for (const unitClass of UNIT_CLASS_VOICE_TYPES) {
      for (const kind of UNIT_CLASS_VOICE_KINDS) {
        if (unitClass === 'infantry' && kind !== 'move') continue;
        const fullCount =
          unitClass === 'infantry' && kind === 'move'
            ? UNIT_INFANTRY_MOVE_COUNT
            : UNIT_CLASS_VOICE_COUNT;
        const count = this._constrainedAudio
          ? unitClass === 'infantry' && kind === 'move'
            ? Math.min(2, fullCount)
            : 0
          : fullCount;
        for (const faction of UNIT_SELECT_FACTIONS) {
          for (let i = 1; i <= count; i++) {
            const num = String(i).padStart(2, '0');
            classVoiceLoads.push(
              (async () => {
                try {
                  const buf = await this._loadDecodedSample(
                    publicUrl(`sounds/unit-${kind}-${unitClass}-${faction}-${num}.wav`)
                  );
                  if (!buf) return;
                  this.unitClassVoiceBuffers[kind][unitClass][faction].push(buf);
                } catch {
                  /* missing */
                }
              })()
            );
          }
        }
      }
    }
    await Promise.all(classVoiceLoads);

    const commanderLoads = [];
    for (const faction of COMMANDER_ORDER_FACTIONS) {
      for (const kind of COMMANDER_ORDER_KINDS) {
        commanderLoads.push(
          (async () => {
            try {
              const buf = await this._loadDecodedSample(publicUrl(`sounds/commander-${faction}-${kind}.wav`));
              if (!buf) return;
              this.commanderOrderBuffers[faction][kind] = buf;
            } catch {
              /* missing */
            }
          })()
        );
      }
    }
    await Promise.all(commanderLoads);

    const generalOrderVoiceLoads = [];
    for (const faction of COMMANDER_ORDER_FACTIONS) {
      for (const kind of GENERAL_ORDER_VOICE_KINDS) {
        this.commanderGeneralOrderBuffers[faction][kind] = [];
        const count = this._constrainedAudio ? 1 : GENERAL_ORDER_VOICE_VARIANTS;
        for (let i = 1; i <= count; i++) {
          const num = String(i).padStart(2, '0');
          generalOrderVoiceLoads.push(
            (async () => {
              try {
                const buf = await this._loadDecodedSample(
                  publicUrl(`sounds/commander-${faction}-${kind}-${num}.wav`)
                );
                if (!buf) return;
                this.commanderGeneralOrderBuffers[faction][kind].push(buf);
              } catch {
                /* missing — legacy single line remains the fallback */
              }
            })()
          );
        }
      }
    }
    await Promise.all(generalOrderVoiceLoads);

    const poolLoads = [];
    const loadPool = (files, targetArr) => {
      for (const file of files) {
        poolLoads.push(
          (async () => {
            try {
              const buf = await this._loadDecodedSample(publicUrl(`sounds/${file}`));
              if (!buf) return;
              targetArr.push(buf);
            } catch {
              /* missing */
            }
          })()
        );
      }
    };
    this.explosionBuffers = [];
    this.mineExplosionBuffers = [];
    this.impactBuffers = [];
    this.armorRicochetBuffers = [];
    this.bulletImpactBuffers = [];
    this.bulletStructureImpactBuffers = [];
    this.bulletMetalImpactBuffers = [];
    this.bulletWhizBuffers = [];
    this.atmosBuffers = [];
    this.radioStaticBuffers = [];
    this.radioOpenBuffers = [];
    this.artilleryImpactBuffers = [];
    this.fireSupportSalvoBuffers = { barrage: [], creepingBarrage: [] };
    this.bombExplosionBuffers = [];
    this.garandPingBuffers = [];
    this.achievementBuffers = { medal: [], ribbon: [], commendation: [] };
    this.buildingCollapseBuffers = { small: [], medium: [], large: [] };
    const limit = (files, tabletCount) => this._constrainedAudio ? files.slice(0, tabletCount) : files;
    loadPool(limit(EXPLOSION_SAMPLE_FILES, 7), this.explosionBuffers);
    loadPool(MINE_EXPLOSION_FILES, this.mineExplosionBuffers);
    loadPool(limit(IMPACT_SAMPLE_FILES, 5), this.impactBuffers);
    loadPool(limit(ARMOR_RICOCHET_FILES, 3), this.armorRicochetBuffers);
    loadPool(BULLET_IMPACT_FILES, this.bulletImpactBuffers);
    loadPool(BULLET_STRUCTURE_IMPACT_FILES, this.bulletStructureImpactBuffers);
    loadPool(BULLET_METAL_IMPACT_FILES, this.bulletMetalImpactBuffers);
    loadPool(BULLET_WHIZ_FILES, this.bulletWhizBuffers);
    loadPool(
      this._constrainedAudio ? ATMOS_SAMPLE_FILES_TABLET.slice(1) : ATMOS_SAMPLE_FILES,
      this.atmosBuffers
    );
    loadPool(RADIO_STATIC_FILES, this.radioStaticBuffers);
    loadPool(RADIO_OPEN_FILES, this.radioOpenBuffers);
    loadPool(ARTILLERY_IMPACT_FILES, this.artilleryImpactBuffers);
    loadPool(BOMB_EXPLOSION_FILES, this.bombExplosionBuffers);
    loadPool(GARAND_PING_FILES, this.garandPingBuffers);
    for (const [kind, files] of Object.entries(ACHIEVEMENT_FILES)) {
      loadPool(files, this.achievementBuffers[kind]);
    }
    for (const [kind, files] of Object.entries(FIRE_SUPPORT_SALVO_FILES)) {
      loadPool(files, this.fireSupportSalvoBuffers[kind]);
    }
    for (const [size, files] of Object.entries(BUILDING_COLLAPSE_FILES)) {
      loadPool(files, this.buildingCollapseBuffers[size]);
    }
    await Promise.all(poolLoads);

    // Keep legacy single-key buffers as first of pool for any code that still uses them
    if (this.explosionBuffers[0]) this.buffers.explosion = this.explosionBuffers[0];
    if (this.impactBuffers[0]) this.buffers.impact = this.impactBuffers[0];

    this._samplesReady = true;
    this._resolveCoreLoad?.(true);
    this._resolveCoreLoad = null;
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

  /**
   * Class-specific pack when present, else generic infantry / AFV crew pools.
   * @param {'select'|'move'|'attack'|'retreat'|'underfire'} kind
   */
  _voicePoolFor(kind, unitType, factionKey) {
    if (unitType === 'truck') {
      const truckPool =
        kind === 'select'
          ? this.truckSelectBuffers[factionKey]
          : kind === 'attack'
            ? this.truckAttackBuffers[factionKey]
            : kind === 'move'
              ? this.truckMoveBuffers[factionKey]
              : kind === 'retreat'
                ? this.truckRetreatBuffers[factionKey]
                : kind === 'underfire'
                  ? this.truckUnderFireBuffers[factionKey]
                  : null;
      if (truckPool?.length) return truckPool;
    }
    if (isVehicleCrewVoiceType(unitType)) {
      if (kind === 'select') return this.vehicleSelectBuffers[factionKey];
      if (kind === 'attack') return this.vehicleAttackBuffers[factionKey];
      if (kind === 'move') return this.vehicleMoveBuffers[factionKey];
      if (kind === 'retreat') return this.vehicleRetreatBuffers[factionKey];
      if (kind === 'underfire') return this.vehicleUnderFireBuffers[factionKey];
    }
    const unitClass = unitVoiceClass(unitType);
    const specific =
      unitClass && this.unitClassVoiceBuffers[kind]?.[unitClass]?.[factionKey];
    if (specific?.length) return specific;
    if (kind === 'move') {
      return this.unitClassVoiceBuffers.move?.infantry?.[factionKey] ?? [];
    }
    if (kind === 'select') return this.unitSelectBuffers[factionKey];
    if (kind === 'attack') return this.unitAttackBuffers[factionKey];
    if (kind === 'retreat') return this.unitRetreatBuffers[factionKey];
    if (kind === 'underfire') return this.unitUnderFireBuffers[factionKey];
    return [];
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
    if (this._tabletAtmosAudio) {
      this._tabletAtmosAudio.pause();
      try {
        this._tabletAtmosAudio.currentTime = 0;
      } catch {
        /* unavailable */
      }
      this._tabletAtmosAudio.volume = 0.34;
    }
  }

  _fadeOutBattleAtmos(sec = 0.7) {
    const duration = Math.max(0.05, sec);
    if (this._atmosGain && this.ctx) {
      const t0 = this.ctx.currentTime;
      this._atmosGain.gain.cancelScheduledValues(t0);
      this._atmosGain.gain.setValueAtTime(this._atmosGain.gain.value, t0);
      this._atmosGain.gain.linearRampToValueAtTime(0.001, t0 + duration);
      const src = this._atmosSrc;
      setTimeout(() => {
        if (this._atmosSrc === src) this._stopBattleAtmos();
      }, duration * 1000 + 40);
    } else if (this._tabletAtmosAudio && !this._tabletAtmosAudio.paused) {
      const audio = this._tabletAtmosAudio;
      const from = audio.volume;
      const tStart = performance.now();
      const tick = () => {
        if (this._tabletAtmosAudio !== audio) return;
        const u = Math.min(1, (performance.now() - tStart) / (duration * 1000));
        audio.volume = Math.max(0, from * (1 - u));
        if (u < 1) requestAnimationFrame(tick);
        else this._stopBattleAtmos();
      };
      requestAnimationFrame(tick);
    } else {
      this._stopBattleAtmos();
    }
  }

  _startTabletAtmosFallback() {
    if (!this._constrainedAudio || this.muted) return false;
    if (!this._tabletAtmosAudio) {
      const audio = new Audio(publicUrl(`sounds/${ATMOS_SAMPLE_FILES_TABLET[0]}`));
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = 0.34;
      audio.playsInline = true;
      audio.setAttribute('playsinline', '');
      this._tabletAtmosAudio = audio;
    }
    try {
      void this._tabletAtmosAudio.play().catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  /** Looping battlefield bed during combat (under combat one-shots, but clearly audible). */
  _startBattleAtmos() {
    if (this._constrainedAudio) {
      this._startTabletAtmosFallback();
      return;
    }
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
    if (!this.ctx || this.ctx.state === 'running') return Promise.resolve(true);
    if (this.ctx.state === 'closed') return Promise.resolve(false);
    if (!this._resumePromise) {
      try {
        // Call resume synchronously before any sample-loading await so a user
        // gesture's transient activation is still available to the browser.
        // Safari can report "interrupted" after tab/app restoration; resume it
        // just like a suspended context.
        const resumeResult = this.ctx.resume();
        this._resumePromise = Promise.resolve(resumeResult)
          .then(() => this._isRunning())
          .catch(() => false)
          .finally(() => {
            this._resumePromise = null;
          });
      } catch {
        this._resumePromise = Promise.resolve(false).finally(() => {
          this._resumePromise = null;
        });
      }
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
    // Tablet audio becomes usable progressively. Desktop retains the original
    // behavior of waiting for the complete sample library.
    if ((this._constrainedAudio && this._samplesReady) || !this._loadPromise) attempt();
    else void this._loadPromise.then(attempt);
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
    else if (profile.startsWith('howitzer')) typeBoost = 1.42;
    else if (profile.startsWith('tank') || profile.startsWith('at')) typeBoost = 1.4;
    else if (profile === 'mg' || profile.startsWith('mg_')) typeBoost = 1.38;
    else if (profile === 'lmg' || profile.startsWith('lmg_')) typeBoost = 1.4;
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
    this._playBuffer(buf, {
      pan,
      vol: Math.min(2.2, vol),
      rate,
      wet,
      delay: opts.delay ?? 0,
    });
    return true;
  }

  /** Wait until weapon/impact samples are decoded (call after unlock before combat). */
  async ensureLoaded() {
    if (!this.unlock()) return false;
    // Start the resume attempt before waiting for the (large) sample batch.
    const resumePromise = this._resumeContext();
    const readyPromise = this._constrainedAudio ? this._coreLoadPromise : this._loadPromise;
    if (readyPromise) await readyPromise;
    await resumePromise;
    return this._isRunning();
  }

  resumeContext() {
    return this._resumeContext().then((result) => {
      if (this._isRunning()) {
        this._flushPendingPlays();
        if (this.inBattle) {
          this._startBattleAudioLock();
          this._startBattleAtmos();
        } else if (this.memorialMusicVisible) {
          this.memorialMusic?.setMenuActive(true);
        } else if (this.menuMusicVisible) {
          this.menuMusic?.setMenuActive(true);
        }
      }
      return result;
    });
  }

  /**
   * iPadOS needs a source started synchronously inside the tap in addition to
   * AudioContext.resume(). Desktop delegates to the established path unchanged.
   */
  resumeFromGesture() {
    if (!this.unlock()) return Promise.resolve(false);
    if (!this._constrainedAudio) return this.resumeContext();
    if (this.ctx && !this.muted) {
      try {
        const src = this.ctx.createBufferSource();
        const gain = this.ctx.createGain();
        src.buffer = this._getSilentPrimeBuffer();
        gain.gain.value = 0.00001;
        src.connect(gain);
        gain.connect(this.master);
        src.start(0);
        src.onended = () => {
          src.disconnect();
          gain.disconnect();
        };
      } catch {
        /* the HTML ambience fallback still retries on the next gesture */
      }
      if (this.inBattle) this._startTabletAtmosFallback();
    }
    return this.resumeContext().then((result) => {
      if (result && !this._warmedUp) this._warmUpNow();
      return result;
    });
  }

  /** Start the iPad media fallback directly from the launch/resume tap. */
  startBattleAudioFromGesture() {
    if (!this._constrainedAudio) return false;
    return this._startTabletAtmosFallback();
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
      this.memorialMusic?.stopImmediate();
      this.endMusic?.stopImmediate();
    } else if (this.inBattle && !this.endMusic?.isPlaying) {
      this._startBattleAtmos();
    } else if (this.memorialMusicVisible) {
      this.memorialMusic?.setMenuActive(true);
    } else if (this.menuMusicVisible) {
      this.menuMusic?.setMenuActive(true);
    }
  }

  /** Call when a match starts — blocks menu theme until leaveBattle(). */
  enterBattle() {
    this.inBattle = true;
    this.menuMusicVisible = false;
    this.memorialMusicVisible = false;
    this.menuMusic?.stopImmediate();
    this.memorialMusic?.stopImmediate();
    this.endMusic?.stopImmediate();
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
    this.endMusic?.fadeOut();
    this._pendingPlays = [];
  }

  preloadEndMusic(factionId) {
    this.endMusic?.preload(factionId);
  }

  /**
   * Faction victory / defeat stinger when a match ends.
   * Fades the battlefield bed so the cue can be heard under the results panel.
   */
  playEndMusic(victory, factionId) {
    this._fadeOutBattleAtmos(0.7);
    this._runWhenReady(() => {
      const started = this.endMusic?.play(factionId, victory);
      if (!started) this.play(victory ? 'victory' : 'defeat');
    }, () => this.play(victory ? 'victory' : 'defeat'));
  }

  setMenuMusicActive(active) {
    if (this.inBattle && active) return;
    this.menuMusicVisible = active;
    if (!active) {
      this.menuMusic?.fadeOut();
      return;
    }
    this.memorialMusicVisible = false;
    this.memorialMusic?.fadeOut();
    this.menuMusic?.setMenuActive(true);
  }

  /** Quiet cemetery lament used only on the War Stats record. */
  setMemorialMusicActive(active) {
    if (this.inBattle && active) return;
    this.memorialMusicVisible = active;
    if (!active) {
      this.memorialMusic?.fadeOut();
      return;
    }
    this.menuMusicVisible = false;
    this.menuMusic?.fadeOut();
    this.memorialMusic?.ensureLoaded();
    this.memorialMusic?.setMenuActive(true);
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

  /** Large aerial bomb detonation (deeper / longer than artillery shelllets). */
  playBombExplosion(worldPos = null) {
    this._runWhenReady(() => {
      const buf =
        this._pickFromPool(this.bombExplosionBuffers, '_lastBombExplosionFile') ??
        this._pickFromPool(this.artilleryImpactBuffers, '_lastArtilleryImpactFile') ??
        this._pickFromPool(this.explosionBuffers, '_lastExplosionFile') ??
        this.buffers.explosion;
      if (!buf) return;
      const pan = worldPos ? this._calcPan(worldPos.x, worldPos.z) : 0;
      const dist = worldPos ? this._calcDist(worldPos.x, worldPos.z) : 0;
      this._playBuffer(buf, {
        pan,
        vol: this._distanceGain(dist) * 1.85,
        rate: 0.88 + Math.random() * 0.08,
        wet: 0.38 + Math.random() * 0.08,
      });
      // Secondary rumble layer from the general explosion pool
      const rumble =
        this._pickFromPool(this.explosionBuffers, '_lastExplosionFile') ?? this.buffers.explosion;
      if (rumble && rumble !== buf) {
        this._playBuffer(rumble, {
          pan: pan * 0.7,
          vol: this._distanceGain(dist) * 0.95,
          rate: 0.78 + Math.random() * 0.06,
          wet: 0.45,
          delay: 0.05,
        });
      }
    });
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
      const bufs = this._voicePoolFor('select', opts.unitType, key);
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

  /** Faction radio acknowledgement after a player attack order is accepted. */
  playAttackOrder(factionId = null, worldPos = null, opts = {}) {
    this._runWhenReady(() => {
      const key = unitUnderFireVoiceKey(factionId);
      const bufs = this._voicePoolFor('attack', opts.unitType, key);
      if (!bufs?.length) return;

      const now = performance.now();
      if (now < (this._attackVoiceBusyUntil ?? 0)) return;
      const buf = this._pickFromPool(bufs, '_lastAttackVoice');
      if (!buf) return;

      const delay =
        now - (this._lastByType._unitSelect ?? 0) < 900
          ? 0.28
          : 0.04;
      const rate = 0.98 + Math.random() * 0.035;
      this._attackVoiceBusyUntil =
        now + delay * 1000 + (buf.duration / rate) * 1000 + 420;

      const pan = worldPos ? this._calcPan(worldPos.x, worldPos.z) : 0;
      const dist = worldPos ? this._calcDist(worldPos.x, worldPos.z) : 0;
      const vol = Math.min(1.16, this._distanceGain(dist) * 1.02);
      this._playRadioVoice(buf, {
        pan,
        vol,
        rate,
        staticLevel: 0.21,
        presence: 1.02,
        delay,
      });
    });
  }

  /**
   * Driver / squad acknowledgement after a player move order.
   * First order on a unit always plays; later orders only after a random
   * quiet window so click-micro does not spam move lines.
   */
  playMoveOrder(factionId = null, worldPos = null, opts = {}) {
    this._runWhenReady(() => {
      const key = unitSelectVoiceKey(factionId);
      const bufs = this._voicePoolFor('move', opts.unitType, key);
      if (!bufs?.length) return;

      const now = performance.now();
      if (opts.unit && !isMoveVoiceDue(opts.unit, now)) return;
      if (now < (this._moveVoiceBusyUntil ?? 0)) return;
      const buf = this._pickFromPool(bufs, '_lastMoveVoice');
      if (!buf) return;
      if (opts.unit) {
        const readyAt = nextVehicleMoveVoiceReadyAt(now);
        opts.unit._moveVoiceReadyAt = readyAt;
        opts.unit._vehicleMoveVoiceReadyAt = readyAt;
      }

      const delay =
        now - (this._lastByType._unitSelect ?? 0) < 900
          ? 0.26
          : 0.04;
      const rate = 0.98 + Math.random() * 0.035;
      this._moveVoiceBusyUntil =
        now + delay * 1000 + (buf.duration / rate) * 1000 + 380;

      const pan = worldPos ? this._calcPan(worldPos.x, worldPos.z) : 0;
      const dist = worldPos ? this._calcDist(worldPos.x, worldPos.z) : 0;
      const vol = Math.min(1.12, this._distanceGain(dist) * 0.98);
      this._playRadioVoice(buf, {
        pan,
        vol,
        rate,
        staticLevel: 0.2,
        presence: 1,
        delay,
      });
    });
  }

  /** @deprecated use playMoveOrder */
  playVehicleMoveOrder(factionId = null, worldPos = null, opts = {}) {
    this.playMoveOrder(factionId, worldPos, opts);
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
      const variants = this.commanderGeneralOrderBuffers[key]?.[kind];
      const buf = variants?.length
        ? variants[Math.floor(Math.random() * variants.length)]
        : this.commanderOrderBuffers[key]?.[kind]
          ?? (kind === 'digIn' ? this.commanderOrderBuffers[key]?.holdGround : null);
      if (!buf) return;

      const now = performance.now();
      const throttleKey =
        kind === 'lostCommander' ? `_commanderLoss-${key}` : '_commanderOrder';
      // Slightly longer throttle than unit select — commander net shouldn't stack
      if (now - (this._lastByType[throttleKey] ?? 0) < 650) return;
      this._lastByType[throttleKey] = now;

      const pan = worldPos ? this._calcPan(worldPos.x, worldPos.z) : 0;
      const dist = worldPos ? this._calcDist(worldPos.x, worldPos.z) : 0;
      const overRadio = opts.radio !== false;
      // Centered command presence — a bit louder than unit acks
      const vol =
        kind === 'lostCommander'
          ? 1.16
          : Math.min(1.18, this._distanceGain(dist) * 1.02);

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
      const bufs = this._voicePoolFor('underfire', opts.unitType, key);
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
   * Faction-specific withdrawal call when a unit first enters retreat state.
   * The retreat transition itself is one-shot; this global throttle also keeps
   * simultaneous morale breaks and full-army withdrawals from becoming a wall
   * of overlapping voices.
   * @param {object|null} worldPos
   * @param {string|null} factionId
   * @param {object} [opts]
   * @param {'player'|'enemy'|string} [opts.team]
   * @param {boolean} [opts.radio] — friendly troops use the radio net by default
   * @param {number} [opts.delay] — seconds before playback (for commander orders)
   */
  playRetreat(worldPos = null, factionId = null, opts = {}) {
    this._runWhenReady(() => {
      const key = unitUnderFireVoiceKey(factionId);
      const bufs = this._voicePoolFor('retreat', opts.unitType, key);
      if (!bufs?.length) return;

      const now = performance.now();
      if (now < (this._retreatVoiceBusyUntil ?? 0)) return;

      const buf = this._pickFromPool(bufs, '_lastRetreatVoice');
      if (!buf) return;
      const pan = worldPos ? this._calcPan(worldPos.x, worldPos.z) : 0;
      const dist = worldPos ? this._calcDist(worldPos.x, worldPos.z) : 0;
      const isEnemy = opts.team === 'enemy';
      const useRadio = !isEnemy && opts.radio !== false;
      const delay = Math.max(0, opts.delay ?? 0);
      const rate = 0.98 + Math.random() * 0.04;
      // Reserve the voice channel through delayed playback and a short tail.
      // This prevents a second break from scheduling over a line not yet heard.
      this._retreatVoiceBusyUntil =
        now + delay * 1000 + (buf.duration / rate) * 1000 + 800;

      if (useRadio) {
        const vol = Math.min(1.22, this._distanceGain(dist) * 1.08);
        this._playRadioVoice(buf, {
          pan,
          vol,
          rate,
          staticLevel: 0.23,
          presence: 1,
          delay,
        });
        return;
      }

      const vol = Math.min(0.68, this._distanceGain(dist) * 0.54);
      this._playBuffer(buf, {
        pan,
        vol,
        rate,
        wet: 0.3,
        delay,
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

  /** Subtle metallic M1 Garand en-bloc clip eject after an occasional reload. */
  playGarandPing(worldPos = null, opts = {}) {
    this._runWhenReady(() => {
      const now = performance.now();
      const minGapMs = opts.minGapMs ?? 220;
      if (now - (this._lastByType._garandPing ?? 0) < minGapMs) return;

      const buf = this._pickFromPool(this.garandPingBuffers, '_lastGarandPingFile');
      if (!buf) return;
      this._lastByType._garandPing = now;

      const pan = worldPos ? this._calcPan(worldPos.x, worldPos.z) : 0;
      const dist = worldPos ? this._calcDist(worldPos.x, worldPos.z) : 0;
      const teamGain = opts.team === 'enemy' ? 0.72 : 1;
      this._playBuffer(buf, {
        pan,
        vol: this._distanceGain(dist) * (opts.volume ?? 0.5) * teamGain,
        rate: 0.97 + Math.random() * 0.06,
        wet: 0.2,
        delay: opts.delaySec ?? 0.04,
      });
    });
  }

  playImpact(type, worldPos, delaySec = 0) {
    this._runWhenReady(() => {
      const now = performance.now();
      const isRicochet = type === 'armor_ricochet';
      const isBulletWhiz = type === 'bullet_whiz';
      const isBulletStructure = type === 'bullet_structure';
      const isBulletMetal = type === 'bullet_metal';
      const isBulletImpact = type === 'bullet';
      const isBulletEffect = isBulletWhiz || isBulletStructure || isBulletMetal || isBulletImpact;
      const cooldownKey = isRicochet
        ? '_armorRicochetImpact'
        : isBulletWhiz
          ? '_bulletWhizImpact'
          : isBulletEffect
            ? '_bulletImpact'
            : '_impact';
      const cooldownMs = isBulletWhiz ? 95 : isBulletImpact ? 120 : isBulletEffect ? 105 : 80;
      if (now - (this._lastByType[cooldownKey] ?? 0) < cooldownMs) return;
      const useExplosion =
        type === 'shell' || type === 'tank_round' || type === 'explosion';
      const pool = isRicochet
        ? this.armorRicochetBuffers
        : isBulletWhiz
          ? this.bulletWhizBuffers
          : isBulletStructure
            ? this.bulletStructureImpactBuffers
            : isBulletMetal
              ? this.bulletMetalImpactBuffers
              : isBulletImpact
                ? this.bulletImpactBuffers
                : null;
      const poolLastKey = isRicochet
        ? '_lastArmorRicochetFile'
        : isBulletWhiz
          ? '_lastBulletWhizFile'
          : isBulletStructure
            ? '_lastBulletStructureImpactFile'
            : isBulletMetal
              ? '_lastBulletMetalImpactFile'
              : '_lastBulletImpactFile';
      let buf = pool ? this._pickFromPool(pool, poolLastKey) : null;
      // New pools are optional assets: retain a useful generic impact while a
      // partial bake is in progress or if a deployment omits one of the WAVs.
      if (!buf && (isBulletStructure || isBulletMetal)) {
        buf = this._pickFromPool(this.bulletImpactBuffers, '_lastBulletImpactFile');
      }
      if (!buf && (isRicochet || isBulletEffect)) {
        buf = this._pickFromPool(this.impactBuffers, '_lastImpactFile') ?? this.buffers.impact;
      }
      if (!buf && useExplosion) {
        buf = this._pickFromPool(this.explosionBuffers, '_lastExplosionFile') ?? this.buffers.explosion;
      }
      if (!buf && !isBulletEffect && !isRicochet) {
        buf = this._pickFromPool(this.impactBuffers, '_lastImpactFile') ?? this.buffers.impact;
      }
      if (!buf) return;
      this._lastByType[cooldownKey] = now;

      const pan = worldPos ? this._calcPan(worldPos.x, worldPos.z) : 0;
      const dist = worldPos ? this._calcDist(worldPos.x, worldPos.z) : 0;
      const gain = isBulletWhiz
        ? 0.52
        : isRicochet
          ? 1.35
          : isBulletMetal
            ? 0.82
            : isBulletStructure
              ? 0.76
              : isBulletImpact
                ? 0.7
                : useExplosion
                  ? (EXPLOSION_IMPACT_GAIN[type] ?? 1.4)
                  : 0.85;
      const vol = this._distanceGain(dist) * gain;

      this._playBuffer(buf, {
        pan,
        vol,
        rate: isBulletWhiz
          ? 0.94 + Math.random() * 0.12
          : isRicochet
            ? 0.94 + Math.random() * 0.1
            : useExplosion
              ? 0.88 + Math.random() * 0.12
              : isBulletEffect
                ? 0.92 + Math.random() * 0.14
                : 0.9 + Math.random() * 0.14,
        wet: isBulletWhiz
          ? 0.16
          : isRicochet
            ? 0.24
            : isBulletMetal
              ? 0.22
              : isBulletEffect
                ? 0.3
                : useExplosion
                  ? 0.28 + Math.random() * 0.1
                  : 0.4,
        delay: delaySec,
      });
    });
  }

  /** Dedicated heavy shell burst used by field guns and fire-support impacts. */
  playArtilleryImpact(worldPos, { kind = 'artillery', delaySec = 0 } = {}) {
    this._runWhenReady(() => {
      const now = performance.now();
      if (now - (this._lastByType._artilleryImpact ?? 0) < 75) return;
      const buf =
        this._pickFromPool(this.artilleryImpactBuffers, '_lastArtilleryImpactFile') ??
        this._pickFromPool(this.explosionBuffers, '_lastExplosionFile') ??
        this.buffers.explosion;
      if (!buf) return;
      this._lastByType._artilleryImpact = now;

      const pan = worldPos ? this._calcPan(worldPos.x, worldPos.z) : 0;
      const dist = worldPos ? this._calcDist(worldPos.x, worldPos.z) : 0;
      const kindGain =
        kind === 'creepingBarrage' ? 1.58 : kind === 'barrage' ? 1.5 : 1.46;
      this._playBuffer(buf, {
        pan,
        vol: this._distanceGain(dist) * kindGain,
        rate: 0.94 + Math.random() * 0.09,
        wet: 0.32 + Math.random() * 0.08,
        delay: delaySec,
      });
    });
  }

  /** Dedicated buried-mine blast, falling back to the general explosion pool. */
  playMineExplosion(worldPos = null) {
    this._runWhenReady(() => {
      const now = performance.now();
      if (now - (this._lastByType._mineExplosion ?? 0) < 80) return;
      const buf =
        this._pickFromPool(this.mineExplosionBuffers, '_lastMineExplosionFile') ??
        this._pickFromPool(this.explosionBuffers, '_lastExplosionFile') ??
        this.buffers.explosion;
      if (!buf) return;
      this._lastByType._mineExplosion = now;

      const pan = worldPos ? this._calcPan(worldPos.x, worldPos.z) : 0;
      const dist = worldPos ? this._calcDist(worldPos.x, worldPos.z) : 0;
      this._playBuffer(buf, {
        pan,
        vol: this._distanceGain(dist) * 1.78,
        rate: 0.9 + Math.random() * 0.1,
        wet: 0.3 + Math.random() * 0.08,
      });
    });
  }

  /** Rolling battery report at the start of a barrage or creeping barrage. */
  playFireSupportSalvo(kind, worldPos = null) {
    this._runWhenReady(() => {
      const pool = this.fireSupportSalvoBuffers[kind];
      const buf = this._pickFromPool(pool, `_last${kind}SalvoFile`);
      if (!buf) return;
      const pan = worldPos ? this._calcPan(worldPos.x, worldPos.z) * 0.35 : 0;
      const dist = worldPos ? this._calcDist(worldPos.x, worldPos.z) : 0;
      const distanceMix = 0.72 + this._distanceGain(dist) * 0.28;
      this._playBuffer(buf, {
        pan,
        vol: distanceMix * (kind === 'creepingBarrage' ? 0.98 : 0.92),
        rate: 0.98 + Math.random() * 0.035,
        wet: 0.42,
      });
    });
  }

  /**
   * Masonry / timber structure collapse (scenery or base buildings).
   * @param {'small'|'medium'|'large'} size
   * @param {{x:number,z:number}|null} [worldPos]
   */
  playBuildingCollapse(size = 'medium', worldPos = null) {
    this._runWhenReady(() => {
      const key = size === 'small' || size === 'large' ? size : 'medium';
      const now = performance.now();
      const minGap = key === 'large' ? 140 : key === 'medium' ? 110 : 90;
      if (now - (this._lastByType._buildingCollapse ?? 0) < minGap) return;

      const pool =
        this.buildingCollapseBuffers[key]?.length
          ? this.buildingCollapseBuffers[key]
          : this.buildingCollapseBuffers.medium?.length
            ? this.buildingCollapseBuffers.medium
            : this.explosionBuffers;
      const lastKey =
        key === 'small'
          ? '_lastBuildingCollapseSmall'
          : key === 'large'
            ? '_lastBuildingCollapseLarge'
            : '_lastBuildingCollapseMedium';
      const buf =
        this._pickFromPool(pool, lastKey) ??
        this._pickFromPool(this.explosionBuffers, '_lastExplosionFile') ??
        this.buffers.explosion;
      if (!buf) return;
      this._lastByType._buildingCollapse = now;

      const pan = worldPos ? this._calcPan(worldPos.x, worldPos.z) : 0;
      const dist = worldPos ? this._calcDist(worldPos.x, worldPos.z) : 0;
      const gain = BUILDING_COLLAPSE_GAIN[key] ?? BUILDING_COLLAPSE_GAIN.medium;
      this._playBuffer(buf, {
        pan,
        vol: this._distanceGain(dist) * gain,
        rate:
          key === 'large'
            ? 0.92 + Math.random() * 0.08
            : key === 'small'
              ? 0.98 + Math.random() * 0.1
              : 0.95 + Math.random() * 0.09,
        wet: key === 'large' ? 0.34 + Math.random() * 0.08 : 0.26 + Math.random() * 0.08,
      });
    });
  }

  /** Period award cue generated for the achievement's presentation tier. */
  playAchievement(kind = 'commendation') {
    this._runWhenReady(() => {
      const key = kind === 'medal' || kind === 'ribbon' ? kind : 'commendation';
      const buffer = this._pickFromPool(
        this.achievementBuffers[key],
        `_lastAchievement${key}`
      );
      if (!buffer) return;
      this._playBuffer(buffer, {
        vol: key === 'medal' ? 0.92 : key === 'ribbon' ? 0.82 : 0.76,
        rate: 1,
        wet: key === 'commendation' ? 0.12 : 0.22,
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
   * pre-speak key/squelch/crackle → speech + quiet channel noise, one pan/envelope.
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

    // Varied pre-speak opener (PTT / squelch / crackle) — longer when we have baked opens
    let openBuf = null;
    let openDur = 0.05;
    if (this.radioOpenBuffers?.length) {
      openBuf =
        this.radioOpenBuffers[Math.floor(Math.random() * this.radioOpenBuffers.length)];
      if (openBuf) {
        // Slight rate jitter for more variety
        openDur = Math.min(0.48, openBuf.duration / (0.94 + Math.random() * 0.12));
      }
    }
    const openPad = Math.max(0.06, openDur * 0.85);
    const closePad = 0.12;
    const totalDur = voiceDur + openPad + closePad;

    // Mix bus: open + speech + noise sum here, then share one envelope + pan
    const mix = this.ctx.createGain();
    mix.gain.value = 1;

    const master = this.ctx.createGain();
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.linearRampToValueAtTime(vol, t0 + 0.025);
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

    // Pre-speak: baked key / squelch / crackle (prefer over synthetic click)
    if (openBuf) {
      try {
        const open = this.ctx.createBufferSource();
        open.buffer = openBuf;
        open.playbackRate.value = 0.94 + Math.random() * 0.12;
        const openHp = this.ctx.createBiquadFilter();
        openHp.type = 'highpass';
        openHp.frequency.value = 280;
        const openLp = this.ctx.createBiquadFilter();
        openLp.type = 'lowpass';
        openLp.frequency.value = 4200;
        const openG = this.ctx.createGain();
        // Audible key-up without overpowering the first word
        openG.gain.setValueAtTime(0.0001, t0);
        openG.gain.linearRampToValueAtTime(0.55 + Math.random() * 0.2, t0 + 0.012);
        openG.gain.linearRampToValueAtTime(0.12, t0 + openPad * 0.85);
        openG.gain.linearRampToValueAtTime(0.0001, t0 + openPad + 0.04);
        open.connect(openHp);
        openHp.connect(openLp);
        openLp.connect(openG);
        openG.connect(mix);
        open.start(t0);
        open.stop(t0 + openPad + 0.06);
      } catch {
        /* ignore */
      }
    } else {
      // Fallback synthetic PTT if open samples missing
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
    }

    // Voice — starts after the open pad
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
        noise.playbackRate.value = 0.9 + Math.random() * 0.16;

        const noiseHp = this.ctx.createBiquadFilter();
        noiseHp.type = 'highpass';
        noiseHp.frequency.value = 450 + Math.random() * 120;
        const noiseLp = this.ctx.createBiquadFilter();
        noiseLp.type = 'lowpass';
        noiseLp.frequency.value = 3000 + Math.random() * 600;

        const noiseG = this.ctx.createGain();
        // Louder on open, settle under VO, slight rise on close
        const bed = staticLevel;
        noiseG.gain.setValueAtTime(0.0001, t0);
        noiseG.gain.linearRampToValueAtTime(bed * 1.55, t0 + 0.018);
        noiseG.gain.linearRampToValueAtTime(bed * 0.82, t0 + openPad + 0.08);
        noiseG.gain.setValueAtTime(bed * 0.82, t0 + openPad + voiceDur * 0.85);
        noiseG.gain.linearRampToValueAtTime(bed * 1.2, t0 + openPad + voiceDur);
        noiseG.gain.linearRampToValueAtTime(0.0001, t0 + totalDur);

        noise.connect(noiseHp);
        noiseHp.connect(noiseLp);
        noiseLp.connect(noiseG);
        noiseG.connect(mix);

        noise.start(t0);
        noise.stop(t0 + totalDur + 0.02);
      }
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

    voice.start(t0 + openPad * 0.72);
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
  lmgProfileForFaction,
  weaponProfileForDef,
} from './WeaponSounds.js';
