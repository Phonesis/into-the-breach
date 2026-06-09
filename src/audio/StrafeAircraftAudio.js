/** Spatial Spitfire fly-by — layered Merlin loops with Doppler and proximity mixing. */

const DOPPLER_STRENGTH = 0.0058;
const EXHAUST_RATE_BIAS = 0.84;
const EXHAUST_DOPPLER_MAX = 1.1;

function calcPan(wx, listenerX) {
  return Math.max(-1, Math.min(1, (wx - listenerX) / 48));
}

function smoothstep01(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** Loudest at closest point of pass, faint at range. */
function proximityGain(dist) {
  const peakDist = 9;
  const hearDist = 130;

  if (dist <= peakDist) return 1;
  if (dist >= hearDist) return 0.015;

  const t = (dist - peakDist) / (hearDist - peakDist);
  return 0.015 + (1 - smoothstep01(t)) * 0.985;
}

function dopplerRate(radialVel, bias = 1, max = 1.32) {
  const raw = (1 - radialVel * DOPPLER_STRENGTH) * bias;
  return Math.max(0.72, Math.min(max, raw));
}

class FlybyVoice {
  constructor(manager, { x, z, velX, velZ, duration }) {
    const { ctx, dryBus, wetBus, buffers } = manager;
    const mainBuf = buffers?.aircraft_flyby;
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

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0;
    this.panner = ctx.createStereoPanner();

    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 420;
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

    this._addLoop(mainBuf, 1, 'main', t0, offset);
    if (buffers.aircraft_flyby_exhaust) {
      this._addLoop(buffers.aircraft_flyby_exhaust, 0.58, 'exhaust', t0, offset * 1.07);
    }
    if (buffers.aircraft_flyby_prop) {
      this._addLoop(buffers.aircraft_flyby_prop, 0.52, 'prop', t0, offset * 0.93);
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

    src.start(t0, offset);
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
    const fadeIn = Math.min(1, this.life / 0.12);
    const fadeOut =
      this.life > this.maxLife ? Math.max(0, 1 - (this.life - this.maxLife) / 0.35) : 1;
    const vol = proximity * fadeIn * fadeOut;
    const pan = calcPan(this.x, listener.x);

    const relX = listener.x - this.x;
    const relZ = listener.z - this.z;
    const relLen = Math.sqrt(relX * relX + relZ * relZ) || 1;
    const radialVel = -(this.velX * relX + this.velZ * relZ) / relLen;
    const mainRate = dopplerRate(radialVel);
    const exhaustRate = dopplerRate(radialVel, EXHAUST_RATE_BIAS, EXHAUST_DOPPLER_MAX);
    const propRate = dopplerRate(radialVel, 0.94, 1.22);

    const filterHz = 260 + proximity * 4200;
    const exhaustFilterHz = 140 + proximity * 480;
    const bodyBoost = proximity * 7.5;
    const exhaustShelf = 4 + proximity * 3.5;
    const wetMix = 0.42 - proximity * 0.3;

    const propGain = 0.16 + proximity * 0.88;
    const exhaustGain = 0.2 + proximity * 0.42;

    const t = this.ctx.currentTime;
    this.panner.pan.setTargetAtTime(pan, t, 0.035);
    this.master.gain.setTargetAtTime(vol * 1.05, t, 0.05);
    this.wet.gain.setTargetAtTime(vol * wetMix, t, 0.05);
    this.lowpass.frequency.setTargetAtTime(filterHz, t, 0.07);
    this.exhaustLowpass.frequency.setTargetAtTime(exhaustFilterHz, t, 0.08);
    this.exhaustSub.gain.setTargetAtTime(exhaustShelf, t, 0.08);
    this.bodyPeak.gain.setTargetAtTime(bodyBoost, t, 0.07);

    for (const { src, gain, role } of this.sources) {
      if (!src.playbackRate) continue;
      const rate = role === 'exhaust' ? exhaustRate : role === 'prop' ? propRate : mainRate;
      src.playbackRate.setTargetAtTime(rate, t, 0.06);
      if (role === 'main') gain.gain.setTargetAtTime(1, t, 0.06);
      else if (role === 'exhaust') gain.gain.setTargetAtTime(exhaustGain, t, 0.06);
      else if (role === 'prop') gain.gain.setTargetAtTime(propGain, t, 0.06);
    }

    if (this.life >= this.maxLife + 0.4) {
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
    this.master.disconnect();
    this.wet.disconnect();
    this.panner.disconnect();
    this.lowpass.disconnect();
    this.bodyPeak.disconnect();
    this.exhaustLowpass.disconnect();
    this.exhaustSub.disconnect();
  }
}

export class StrafeAircraftAudio {
  constructor(soundManager) {
    this.manager = soundManager;
    this.voices = [];
  }

  startFlyby({ x, z, velX, velZ, duration = 2.5 }) {
    const { ctx, buffers, muted, _loadPromise } = this.manager;
    if (!ctx || muted) return;

    const begin = () => {
      if (!buffers.aircraft_flyby || this.manager.muted) return;
      if (ctx.state === 'suspended') ctx.resume();
      const voice = new FlybyVoice(this.manager, { x, z, velX, velZ, duration });
      if (voice.alive) this.voices.push(voice);
    };

    if (buffers.aircraft_flyby) {
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