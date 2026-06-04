/**
 * Bakes seamless diesel / track engine loops for vehicles.
 * Run: npm run bake-engines
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../public/sounds');
const SR = 44100;

mkdirSync(OUT, { recursive: true });

function writeWav(name, samples) {
  const numSamples = samples.length;
  const buffer = Buffer.alloc(44 + numSamples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SR, 24);
  buffer.writeUInt32LE(SR * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);
  for (let i = 0; i < numSamples; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.floor(v * 32767), 44 + i * 2);
  }
  writeFileSync(join(OUT, name), buffer);
  console.log('wrote', name, `(${(numSamples / SR).toFixed(2)}s)`);
}

function noise() {
  return Math.random() * 2 - 1;
}

function pinkNoise(state) {
  state[0] = 0.99886 * state[0] + noise() * 0.0555179;
  state[1] = 0.99332 * state[1] + noise() * 0.0750759;
  state[2] = 0.969 * state[2] + noise() * 0.153852;
  state[3] = 0.8665 * state[3] + noise() * 0.3104856;
  state[4] = 0.55 * state[4] + noise() * 0.5329522;
  state[5] = -0.7616 * state[5] - noise() * 0.016898;
  return (state[0] + state[1] + state[2] + state[3] + state[4] + state[5] + noise() * 0.5362) * 0.11;
}

function softClip(x) {
  return Math.tanh(x * 1.35);
}

function seamlessLoop(samples, crossfadeSec = 0.06) {
  const xf = Math.floor(crossfadeSec * SR);
  const out = samples.slice();
  for (let i = 0; i < xf; i++) {
    const a = Math.sin((i / xf) * Math.PI * 0.5) ** 2;
    const tail = out.length - xf + i;
    const blend = out[i] * a + out[tail] * (1 - a);
    out[tail] = out[tail] * a + out[i] * (1 - a);
    out[i] = blend;
  }
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = 0.9 / (peak || 1);
  for (let i = 0; i < out.length; i++) out[i] *= g;
  return out;
}

/**
 * Layered diesel: cylinder fund, exhaust puff, track clatter, sub rumble.
 */
function bakeEngineLoop({
  duration = 3.4,
  fundHz = 42,
  fundHarmonics = [1, 2, 3, 4.02, 5.1],
  harmonicGains = [0.55, 0.28, 0.18, 0.12, 0.08],
  exhaustModHz = null,
  trackHz = 9.5,
  trackPairs = 2,
  rumbleHz = 22,
  exhaustVol = 0.42,
  trackVol = 0.38,
  motorVol = 0.5,
  rumbleVol = 0.22,
  wobble = 0.04,
}) {
  const len = Math.floor(duration * SR);
  const out = new Float32Array(len);
  const st = [0, 0, 0, 0, 0, 0];
  const modHz = exhaustModHz ?? fundHz * 0.5;
  let lpExhaust = 0;

  for (let i = 0; i < len; i++) {
    const t = i / SR;

    let motor = 0;
    for (let h = 0; h < fundHarmonics.length; h++) {
      const ratio = fundHarmonics[h];
      const wob = Math.sin(t * (2.1 + h * 0.3)) * wobble;
      motor += Math.sin(2 * Math.PI * fundHz * ratio * t + wob) * harmonicGains[h];
    }
    motor = softClip(motor * motorVol);

    const puff = 0.55 + 0.45 * Math.sin(2 * Math.PI * modHz * t);
    const pn = pinkNoise(st);
    lpExhaust += 0.08 * (pn - lpExhaust);
    const exhaust = (lpExhaust * 0.7 + pn * 0.3) * puff * exhaustVol;

    let track = 0;
    for (let p = 0; p < trackPairs; p++) {
      const offset = p / trackPairs;
      const phase = (t * trackHz + offset) % 1;
      if (phase < 0.06) {
        track += Math.exp(-phase * 55) * trackVol * (0.85 + p * 0.1);
      }
      if (phase > 0.48 && phase < 0.54) {
        track += Math.exp(-(phase - 0.5) * 80) * trackVol * 0.35;
      }
      const grind = phase < 0.2 ? 1 : 0.15;
      track += pn * grind * trackVol * 0.12;
    }

    const rumble =
      Math.sin(2 * Math.PI * rumbleHz * t) * rumbleVol +
      Math.sin(2 * Math.PI * rumbleHz * 1.97 * t) * rumbleVol * 0.35;

    out[i] = motor + exhaust + track + rumble;
  }

  return seamlessLoop(out);
}

/** Higher-band exhaust layer (played quieter on top of main loop). */
function bakeExhaustLayer(baseConfig) {
  return bakeEngineLoop({
    ...baseConfig,
    duration: (baseConfig.duration ?? 3.4) * 0.97,
    motorVol: 0.08,
    trackVol: 0.06,
    rumbleVol: 0.04,
    exhaustVol: (baseConfig.exhaustVol ?? 0.4) * 1.35,
    fundHz: (baseConfig.fundHz ?? 40) * 1.6,
  });
}

const tankCfg = {
  fundHz: 38,
  fundHarmonics: [1, 2, 3, 4.05, 6.2],
  harmonicGains: [0.58, 0.3, 0.2, 0.14, 0.09],
  trackHz: 8.2,
  trackPairs: 2,
  rumbleHz: 19,
  exhaustVol: 0.44,
  trackVol: 0.42,
  motorVol: 0.52,
};

const carCfg = {
  duration: 2.8,
  fundHz: 58,
  fundHarmonics: [1, 2, 3, 4.1],
  harmonicGains: [0.5, 0.26, 0.16, 0.1],
  trackHz: 14,
  trackPairs: 1,
  rumbleHz: 28,
  exhaustVol: 0.36,
  trackVol: 0.28,
  motorVol: 0.46,
  wobble: 0.05,
};

const artyCfg = {
  duration: 4,
  fundHz: 26,
  fundHarmonics: [1, 2, 2.98, 4.2],
  harmonicGains: [0.52, 0.24, 0.14, 0.08],
  trackHz: 5.5,
  trackPairs: 2,
  rumbleHz: 14,
  exhaustVol: 0.38,
  trackVol: 0.35,
  motorVol: 0.48,
  wobble: 0.03,
};

const engines = {
  'engine-tank.wav': bakeEngineLoop(tankCfg),
  'engine-tank-exhaust.wav': bakeExhaustLayer(tankCfg),
  'engine-armored-car.wav': bakeEngineLoop(carCfg),
  'engine-armored-car-exhaust.wav': bakeExhaustLayer(carCfg),
  'engine-artillery.wav': bakeEngineLoop(artyCfg),
  'engine-artillery-exhaust.wav': bakeExhaustLayer(artyCfg),
};

for (const [name, samples] of Object.entries(engines)) {
  writeWav(name, samples);
}