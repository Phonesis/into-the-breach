/** Spatial fighter fly-by — faction engine loops with approach peak and recede. */

const DOPPLER_STRENGTH = 0.0072;
const EXHAUST_RATE_BIAS = 0.84;
const EXHAUST_DOPPLER_MAX = 1.12;

/** Extra path before / after the visual start so engines approach and fade out. */
const DEFAULT_LEAD_UNITS = 52;
const DEFAULT_TRAIL_UNITS = 68;

/** Per-faction mix — light touch so ElevenLabs masters keep natural piston tone. */
const FACTION_ENGINE_PROFILE = {
  germany: {
    // Bf 109 DB 605 — harsh inverted V
    mainGain: 1.02,
    exhaustGain: 0.55,
    propGain: 0.42,
    mainRate: 1.0,
    exhaustRate: 0.92,
    propRate: 0.97,
    lowpassBase: 320,
    bodyBoost: 5.5,
  },
  usa: {
    // P-51 Packard Merlin
    mainGain: 1.0,
    exhaustGain: 0.5,
    propGain: 0.48,
    mainRate: 0.98,
    exhaustRate: 0.9,
    propRate: 0.96,
    lowpassBase: 340,
    bodyBoost: 5.0,
  },
  uk: {
    // Spitfire RR Merlin
    mainGain: 1.0,
    exhaustGain: 0.52,
    propGain: 0.5,
    mainRate: 1.0,
    exhaustRate: 0.91,
    propRate: 0.98,
    lowpassBase: 350,
    bodyBoost: 4.8,
  },
  russia: {
    // Il-2 AM-38
    mainGain: 1.04,
    exhaustGain: 0.58,
    propGain: 0.4,
    mainRate: 0.95,
    exhaustRate: 0.88,
    propRate: 0.94,
    lowpassBase: 300,
    bodyBoost: 5.8,
  },
  japan: {
    // A6M Sakae radial
    mainGain: 1.02,
    exhaustGain: 0.56,
    propGain: 0.44,
    mainRate: 0.98,
    exhaustRate: 0.9,
    propRate: 0.96,
    lowpassBase: 330,
    bodyBoost: 5.4,
  },
};

/**
 * Multi-engine troop transports.
 * Keep body, but open the filter and prop layer so the pass reads as engines
 * + props — not a muted glider whoosh.
 */
const TRANSPORT_ENGINE_PROFILE = {
  germany: {
    // Ju 52 trimotor — match good C-47 mix weight, slightly denser
    mainGain: 1.16,
    exhaustGain: 0.68,
    propGain: 0.78,
    mainRate: 0.94,
    exhaustRate: 0.88,
    propRate: 0.97,
    lowpassBase: 440,
    bodyBoost: 6.2,
  },
  usa: {
    // C-47 twin radial
    mainGain: 1.16,
    exhaustGain: 0.66,
    propGain: 0.74,
    mainRate: 0.95,
    exhaustRate: 0.88,
    propRate: 0.97,
    lowpassBase: 440,
    bodyBoost: 6.2,
  },
  uk: {
    // Dakota
    mainGain: 1.16,
    exhaustGain: 0.66,
    propGain: 0.76,
    mainRate: 0.95,
    exhaustRate: 0.89,
    propRate: 0.98,
    lowpassBase: 450,
    bodyBoost: 6.0,
  },
  russia: {
    // Li-2
    mainGain: 1.18,
    exhaustGain: 0.72,
    propGain: 0.7,
    mainRate: 0.93,
    exhaustRate: 0.86,
    propRate: 0.95,
    lowpassBase: 400,
    bodyBoost: 6.8,
  },
  japan: {
    // L2D twin radial — same family as C-47 / USA mix
    mainGain: 1.16,
    exhaustGain: 0.66,
    propGain: 0.76,
    mainRate: 0.95,
    exhaustRate: 0.88,
    propRate: 0.98,
    lowpassBase: 440,
    bodyBoost: 6.2,
  },
};

function engineProfile(factionId, kind = 'fighter') {
  if (kind === 'transport') {
    return TRANSPORT_ENGINE_PROFILE[factionId] ?? TRANSPORT_ENGINE_PROFILE.germany;
  }
  return FACTION_ENGINE_PROFILE[factionId] ?? FACTION_ENGINE_PROFILE.germany;
}

function pickTransportOrFighterBuffer(buffers, factionId, baseKey, kind) {
  if (kind === 'transport') {
    const transportKey = baseKey.replace('aircraft_flyby', 'aircraft_transport');
    const t = pickFactionBuffer(buffers, factionId, transportKey);
    if (t) return t;
    // Fallback: generic transport then fighter
    if (buffers?.[transportKey]) return buffers[transportKey];
  }
  return pickFactionBuffer(buffers, factionId, baseKey);
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
  constructor(manager, { x, z, velX, velZ, duration, factionId = 'germany', kind = 'fighter' }) {
    const { ctx, dryBus, wetBus, buffers } = manager;
    const mainBuf = pickTransportOrFighterBuffer(buffers, factionId, 'aircraft_flyby', kind);
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
    this.kind = kind;
    this.profile = engineProfile(factionId, kind);
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
      pickTransportOrFighterBuffer(buffers, factionId, 'aircraft_flyby_exhaust', kind) ??
      buffers.aircraft_flyby_exhaust;
    if (exhaustBuf) {
      // Transports: keep all layers phase-locked so mismatched loop wraps
      // don't cause a mid-pass “cut out” when prop/exhaust recycle first.
      const exOff = kind === 'transport' ? offset : offset * 1.07;
      this._addLoop(exhaustBuf, p.exhaustGain, 'exhaust', t0, exOff);
    }

    const propBuf =
      pickTransportOrFighterBuffer(buffers, factionId, 'aircraft_flyby_prop', kind) ??
      buffers.aircraft_flyby_prop;
    if (propBuf) {
      const propOff = kind === 'transport' ? offset : offset * 0.93;
      this._addLoop(propBuf, p.propGain, 'prop', t0, propOff);
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
    // Transports open wider so engine/prop mids aren't lost under the lowpass.
    const isTransport = this.kind === 'transport';
    const filterOpen = isTransport ? 6200 : 4800;
    const filterHz = p.lowpassBase + proximity * filterOpen;
    const exhaustFilterHz = (isTransport ? 180 : 130) + proximity * (isTransport ? 900 : 520);
    const bodyBoost = proximity * p.bodyBoost;
    const exhaustShelf = 3.5 + proximity * 4.2;
    const wetMix = 0.48 - proximity * 0.34;

    // Layers open up as the plane comes in, thin out as it leaves.
    // Transports keep prop thrash audible on the pass (not just distant rumble).
    const propOpen = isTransport ? 0.35 + proximity * 0.9 : 0.12 + proximity * 0.95;
    const propGain = propOpen * p.propGain;
    const exhaustGain = (0.16 + proximity * 0.5) * p.exhaustGain;
    const mainGain = p.mainGain * (0.55 + proximity * 0.5);
    const masterBoost = isTransport ? 1.35 : 1.12;

    const t = this.ctx.currentTime;
    // Slightly snappier pan so the pass sweeps L→R / R→L clearly
    this.panner.pan.setTargetAtTime(pan, t, 0.028);
    this.master.gain.setTargetAtTime(vol * masterBoost, t, 0.04);
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
    kind = 'fighter',
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
        pickTransportOrFighterBuffer(buffers, factionId, 'aircraft_flyby', kind) ??
        buffers.aircraft_flyby;
      if (!main || this.manager.muted) return;
      if (ctx.state === 'suspended') void this.manager.resumeContext();
      const voice = new FlybyVoice(this.manager, {
        x: startX,
        z: startZ,
        velX,
        velZ,
        duration: audioDuration,
        factionId,
        kind,
      });
      if (voice.alive) this.voices.push(voice);
    };

    const main =
      pickTransportOrFighterBuffer(buffers, factionId, 'aircraft_flyby', kind) ??
      buffers.aircraft_flyby;
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
