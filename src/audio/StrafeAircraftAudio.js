/** Spatial fighter fly-by — faction engine loops with approach peak and recede. */

const DOPPLER_STRENGTH = 0.0072;
const EXHAUST_RATE_BIAS = 0.84;
const EXHAUST_DOPPLER_MAX = 1.12;

/** Extra path before / after the visual start so engines approach and fade out. */
const DEFAULT_LEAD_UNITS = 52;
const DEFAULT_TRAIL_UNITS = 68;

/** Per-faction mix so each aircraft's engine character reads differently. */
const FACTION_ENGINE_PROFILE = {
  germany: {
    // Bf 109 DB 605 — harsh, high-rev inverted V
    mainGain: 1.05,
    exhaustGain: 0.62,
    propGain: 0.48,
    mainRate: 1.04,
    exhaustRate: 0.9,
    propRate: 0.98,
    lowpassBase: 260,
    bodyBoost: 8.2,
  },
  usa: {
    // P-51 Packard Merlin — smooth powerful V12
    mainGain: 1.0,
    exhaustGain: 0.52,
    propGain: 0.55,
    mainRate: 0.98,
    exhaustRate: 0.86,
    propRate: 0.96,
    lowpassBase: 280,
    bodyBoost: 7.6,
  },
  uk: {
    // Spitfire RR Merlin — bright, singing exhaust
    mainGain: 1.02,
    exhaustGain: 0.56,
    propGain: 0.58,
    mainRate: 1.01,
    exhaustRate: 0.88,
    propRate: 1.0,
    lowpassBase: 290,
    bodyBoost: 7.2,
  },
  russia: {
    // Il-2 AM-38 — rough, lower growl
    mainGain: 1.08,
    exhaustGain: 0.7,
    propGain: 0.42,
    mainRate: 0.92,
    exhaustRate: 0.8,
    propRate: 0.9,
    lowpassBase: 220,
    bodyBoost: 8.8,
  },
  japan: {
    // A6M Sakae radial — full body continuous roar (match germany weight)
    mainGain: 1.08,
    exhaustGain: 0.68,
    propGain: 0.48,
    mainRate: 0.98,
    exhaustRate: 0.88,
    propRate: 0.96,
    lowpassBase: 255,
    bodyBoost: 8.6,
  },
};

function engineProfile(factionId) {
  return FACTION_ENGINE_PROFILE[factionId] ?? FACTION_ENGINE_PROFILE.germany;
}

function calcPan(wx, listenerX) {
  return Math.max(-1, Math.min(1, (wx - listenerX) / 42));
}

function smoothstep01(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/**
 * Loudest near the closest point of approach; quiet far out.
 * Power curve so approach builds and recede drops off clearly.
 */
function proximityGain(dist) {
  const peakDist = 10;
  const hearDist = 155;

  if (dist <= peakDist) return 1;
  if (dist >= hearDist) return 0.004;

  const t = (dist - peakDist) / (hearDist - peakDist);
  // (1 - smooth)^2 — steeper falloff away from overhead
  const s = 1 - smoothstep01(t);
  return 0.004 + s * s * 0.996;
}

function dopplerRate(radialVel, bias = 1, max = 1.38) {
  const raw = (1 - radialVel * DOPPLER_STRENGTH) * bias;
  return Math.max(0.68, Math.min(max, raw));
}

function pickFactionBuffer(buffers, factionId, baseKey) {
  const id = String(factionId ?? '').toLowerCase();
  const keyed = buffers?.[`${baseKey}_${id}`];
  if (keyed) return keyed;
  return buffers?.[baseKey] ?? null;
}

class FlybyVoice {
  constructor(manager, { x, z, velX, velZ, duration, factionId = 'germany' }) {
    const { ctx, dryBus, wetBus, buffers } = manager;
    const mainBuf = pickFactionBuffer(buffers, factionId, 'aircraft_flyby');
    if (!ctx || !mainBuf) {
      this.alive = false;
      return;
    }

    this.alive = true;
    this.ctx = ctx;
    this.x = x;
    this.z = z;
    this.velX = velX;
    this.velZ = velZ;
    this.life = 0;
    this.maxLife = duration;
    this.sources = [];
    this.profile = engineProfile(factionId);
    this._peakProximity = 0;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0;
    this.panner = ctx.createStereoPanner();

    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 380;
    this.lowpass.Q.value = 0.55;

    this.bodyPeak = ctx.createBiquadFilter();
    this.bodyPeak.type = 'peaking';
    this.bodyPeak.frequency.value = 185;
    this.bodyPeak.Q.value = 1.05;
    this.bodyPeak.gain.value = 0;

    this.exhaustLowpass = ctx.createBiquadFilter();
    this.exhaustLowpass.type = 'lowpass';
    this.exhaustLowpass.frequency.value = 240;
    this.exhaustLowpass.Q.value = 0.65;

    this.exhaustSub = ctx.createBiquadFilter();
    this.exhaustSub.type = 'lowshelf';
    this.exhaustSub.frequency.value = 220;
    this.exhaustSub.gain.value = 5.5;

    this.master.connect(this.panner);
    this.panner.connect(this.lowpass);
    this.lowpass.connect(this.bodyPeak);
    this.bodyPeak.connect(dryBus);
    this.bodyPeak.connect(this.wet);
    this.wet.connect(wetBus);

    const t0 = ctx.currentTime;
    const offset = Math.random() * mainBuf.duration * 0.4;
    const p = this.profile;

    this._addLoop(mainBuf, p.mainGain, 'main', t0, offset);

    const exhaustBuf =
      pickFactionBuffer(buffers, factionId, 'aircraft_flyby_exhaust') ??
      buffers.aircraft_flyby_exhaust;
    if (exhaustBuf) {
      this._addLoop(exhaustBuf, p.exhaustGain, 'exhaust', t0, offset * 1.07);
    }

    const propBuf =
      pickFactionBuffer(buffers, factionId, 'aircraft_flyby_prop') ??
      buffers.aircraft_flyby_prop;
    if (propBuf) {
      this._addLoop(propBuf, p.propGain, 'prop', t0, offset * 0.93);
    }
  }

  _addLoop(buffer, gain, role, t0, offset) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = gain;

    if (role === 'exhaust') {
      src.connect(g);
      g.connect(this.exhaustLowpass);
      this.exhaustLowpass.connect(this.exhaustSub);
      this.exhaustSub.connect(this.master);
    } else {
      src.connect(g);
      g.connect(this.master);
    }

    src.start(t0, offset % Math.max(0.01, buffer.duration));
    this.sources.push({ src, gain: g, role });
  }

  update(dt, listener) {
    if (!this.alive) return false;

    this.life += dt;
    this.x += this.velX * dt;
    this.z += this.velZ * dt;

    const dx = this.x - listener.x;
    const dz = this.z - listener.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const proximity = proximityGain(dist);
    this._peakProximity = Math.max(this._peakProximity, proximity);

    // Soft open so distant approach doesn't click; then pure proximity drives the pass.
    const fadeIn = Math.min(1, this.life / 0.28);
    // After the planned path, keep moving and let distance fade — short safety tail only.
    let pathGate = 1;
    if (this.life > this.maxLife) {
      const over = this.life - this.maxLife;
      pathGate = Math.max(0, 1 - over / 1.35);
    }

    const vol = proximity * fadeIn * pathGate;
    const pan = calcPan(this.x, listener.x);

    // Radial velocity toward listener: approach = positive pitch, recede = lower.
    const relX = listener.x - this.x;
    const relZ = listener.z - this.z;
    const relLen = Math.sqrt(relX * relX + relZ * relZ) || 1;
    const radialVel = -(this.velX * relX + this.velZ * relZ) / relLen;
    const p = this.profile;
    const mainRate = dopplerRate(radialVel, p.mainRate);
    const exhaustRate = dopplerRate(
      radialVel,
      EXHAUST_RATE_BIAS * p.exhaustRate,
      EXHAUST_DOPPLER_MAX
    );
    const propRate = dopplerRate(radialVel, 0.94 * p.propRate, 1.28);

    // Far = muffled; overhead = open and present.
    const filterHz = p.lowpassBase + proximity * 4800;
    const exhaustFilterHz = 130 + proximity * 520;
    const bodyBoost = proximity * p.bodyBoost;
    const exhaustShelf = 3.5 + proximity * 4.2;
    const wetMix = 0.48 - proximity * 0.34;

    // Layers open up as the plane comes in, thin out as it leaves.
    const propGain = (0.12 + proximity * 0.95) * p.propGain;
    const exhaustGain = (0.16 + proximity * 0.5) * p.exhaustGain;
    const mainGain = p.mainGain * (0.55 + proximity * 0.5);

    const t = this.ctx.currentTime;
    // Slightly snappier pan so the pass sweeps L→R / R→L clearly
    this.panner.pan.setTargetAtTime(pan, t, 0.028);
    this.master.gain.setTargetAtTime(vol * 1.12, t, 0.04);
    this.wet.gain.setTargetAtTime(vol * wetMix, t, 0.05);
    this.lowpass.frequency.setTargetAtTime(filterHz, t, 0.06);
    this.exhaustLowpass.frequency.setTargetAtTime(exhaustFilterHz, t, 0.07);
    this.exhaustSub.gain.setTargetAtTime(exhaustShelf, t, 0.07);
    this.bodyPeak.gain.setTargetAtTime(bodyBoost, t, 0.06);

    for (const { src, gain, role } of this.sources) {
      if (!src.playbackRate) continue;
      const rate = role === 'exhaust' ? exhaustRate : role === 'prop' ? propRate : mainRate;
      src.playbackRate.setTargetAtTime(rate, t, 0.05);
      if (role === 'main') gain.gain.setTargetAtTime(mainGain, t, 0.05);
      else if (role === 'exhaust') gain.gain.setTargetAtTime(exhaustGain, t, 0.05);
      else if (role === 'prop') gain.gain.setTargetAtTime(propGain, t, 0.05);
    }

    // End once the planned path is done and we're quiet (or hard time cap).
    const pastPath = this.life >= this.maxLife + 0.15;
    const quiet = proximity < 0.02 && this._peakProximity > 0.15;
    const hardCap = this.life >= this.maxLife + 2.2;
    if ((pastPath && (quiet || pathGate <= 0.02)) || hardCap) {
      this.dispose();
      return false;
    }
    return true;
  }

  dispose() {
    this.alive = false;
    for (const { src } of this.sources) {
      try {
        src.stop();
      } catch {
        /* already ended */
      }
      src.disconnect();
    }
    this.sources = [];
    try {
      this.master.disconnect();
      this.wet.disconnect();
      this.panner.disconnect();
      this.lowpass.disconnect();
      this.bodyPeak.disconnect();
      this.exhaustLowpass.disconnect();
      this.exhaustSub.disconnect();
    } catch {
      /* already disconnected */
    }
  }
}

export class StrafeAircraftAudio {
  constructor(soundManager) {
    this.manager = soundManager;
    this.voices = [];
  }

  /**
   * Spatial engine fly-by. Visual callers pass the on-screen start point and
   * visual duration; audio automatically begins further back along the flight
   * path and continues past the visual so you hear approach + recede.
   *
   * @param {object} opts
   * @param {number} opts.x — visual start X
   * @param {number} opts.z — visual start Z
   * @param {number} opts.velX
   * @param {number} opts.velZ
   * @param {number} [opts.duration] — visual fly duration (seconds)
   * @param {string} [opts.factionId]
   * @param {number} [opts.leadUnits] — world units before visual start
   * @param {number} [opts.trailUnits] — world units after visual end
   */
  startFlyby({
    x,
    z,
    velX,
    velZ,
    duration = 2.5,
    factionId = 'germany',
    leadUnits = DEFAULT_LEAD_UNITS,
    trailUnits = DEFAULT_TRAIL_UNITS,
  }) {
    const { ctx, buffers, muted, _loadPromise } = this.manager;
    if (!ctx || muted) return;

    const speed = Math.hypot(velX, velZ) || 38;
    const nx = velX / speed;
    const nz = velZ / speed;
    const startX = x - nx * leadUnits;
    const startZ = z - nz * leadUnits;
    // Visual duration covers the on-screen run; lead/trail extend the path.
    const audioDuration = duration + (leadUnits + trailUnits) / speed;

    const begin = () => {
      const main =
        pickFactionBuffer(buffers, factionId, 'aircraft_flyby') ?? buffers.aircraft_flyby;
      if (!main || this.manager.muted) return;
      if (ctx.state === 'suspended') void this.manager.resumeContext();
      const voice = new FlybyVoice(this.manager, {
        x: startX,
        z: startZ,
        velX,
        velZ,
        duration: audioDuration,
        factionId,
      });
      if (voice.alive) this.voices.push(voice);
    };

    const main =
      pickFactionBuffer(buffers, factionId, 'aircraft_flyby') ?? buffers.aircraft_flyby;
    if (main) {
      begin();
      return;
    }

    _loadPromise?.then(begin).catch(() => {});
  }

  update(dt, listener) {
    if (!this.voices.length) return;
    this.voices = this.voices.filter((v) => v.update(dt, listener));
  }

  clear() {
    for (const v of this.voices) v.dispose();
    this.voices = [];
  }
}
