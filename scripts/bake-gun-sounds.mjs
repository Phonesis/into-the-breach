/**
 * Bakes realistic gunfire WAV samples (PCM) for the game.
 * Run: npm run bake-sounds
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
  console.log('wrote', name);
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

function envAR(len, attack, release, curve = 1) {
  const e = new Float32Array(len);
  const aS = Math.floor(attack * SR);
  const rS = Math.floor(release * SR);
  for (let i = 0; i < len; i++) {
    if (i < aS) e[i] = Math.pow(i / aS, 0.4);
    else e[i] = Math.pow(Math.max(0, 1 - (i - aS) / rS), curve);
  }
  return e;
}

function mix(...layers) {
  const len = Math.max(...layers.map((l) => l.length));
  const out = new Float32Array(len);
  for (const layer of layers) {
    for (let i = 0; i < layer.length; i++) out[i] += layer[i];
  }
  let peak = 0;
  for (let i = 0; i < len; i++) {
    peak = Math.max(peak, Math.abs(out[i]));
  }
  const g = 0.92 / (peak || 1);
  for (let i = 0; i < len; i++) out[i] *= g;
  return out;
}

function bandpassNoise(duration, low, high, vol) {
  const len = Math.floor(duration * SR);
  const out = new Float32Array(len);
  const st = [0, 0, 0, 0, 0, 0];
  let lp = 0;
  let hp = 0;
  const aLow = Math.exp((-2 * Math.PI * low) / SR);
  const aHigh = Math.exp((-2 * Math.PI * high) / SR);
  for (let i = 0; i < len; i++) {
    const n = pinkNoise(st);
    lp = aLow * lp + (1 - aLow) * n;
    const bright = n - lp;
    hp = aHigh * hp + (1 - aHigh) * bright;
    out[i] = hp * vol;
  }
  return out;
}

function crack(duration, vol, decay = 120) {
  const len = Math.floor(duration * SR);
  const out = new Float32Array(len);
  const e = envAR(len, 0.001, duration * 0.6, 2.5);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    out[i] = noise() * e[i] * vol * Math.exp(-t * decay);
  }
  return out;
}

function makeRifle({
  duration = 0.35,
  thumpHz = 90,
  thumpVol = 0.5,
  crackVol = 1.2,
  bodyVol = 0.7,
  crackDecay = 120,
  noiseMix = 0.7,
} = {}) {
  const len = Math.floor(duration * SR);
  const e = envAR(len, 0.002, duration * 0.8, 1.8);
  const st = [0, 0, 0, 0, 0, 0];
  const body = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const n = pinkNoise(st);
    const thump = Math.sin(2 * Math.PI * thumpHz * t) * Math.exp(-t * 35) * thumpVol;
    body[i] = (n * noiseMix + thump) * e[i] * bodyVol;
  }
  return mix(crack(0.08, crackVol, crackDecay), body);
}

function makeMgBurst({
  shots = 5,
  gap = 0.085,
  shotScale = 1,
  rifleOpts = {},
  tail = 0,
} = {}) {
  const shotsArr = [];
  for (let s = 0; s < shots; s++) {
    const shot = makeRifle(rifleOpts);
    const offset = Math.floor(s * gap * SR);
    const total = offset + shot.length + Math.floor(tail * SR);
    const buf = new Float32Array(total);
    const gain = shotScale * (0.85 + Math.random() * 0.15);
    for (let i = 0; i < shot.length; i++) buf[offset + i] = shot[i] * gain;
    shotsArr.push(buf);
  }
  return mix(...shotsArr);
}

function makeTank({
  duration = 0.9,
  boomLow = 45,
  boomMid = 110,
  boomLowVol = 0.9,
  boomMidVol = 0.35,
  crackVol = 0.8,
  noiseVol = 0.5,
} = {}) {
  const len = Math.floor(duration * SR);
  const e = envAR(len, 0.004, duration * 0.85, 1.2);
  const st = [0, 0, 0, 0, 0, 0];
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const n = pinkNoise(st);
    const boom =
      Math.sin(2 * Math.PI * boomLow * t) * Math.exp(-t * 8) * boomLowVol +
      Math.sin(2 * Math.PI * boomMid * t) * Math.exp(-t * 18) * boomMidVol;
    const blast = bandpassNoise(0.15, 80, 1200, 1)[Math.min(i, Math.floor(0.15 * SR) - 1)] || 0;
    out[i] = (n * noiseVol + boom + blast * 0.4) * e[i];
  }
  return mix(crack(0.12, crackVol), out);
}

function makeArtillery({
  duration = 1.4,
  rumbleLow = 28,
  rumbleMid = 55,
  tailHigh = 300,
} = {}) {
  const len = Math.floor(duration * SR);
  const e = envAR(len, 0.008, duration * 0.86, 0.9);
  const st = [0, 0, 0, 0, 0, 0];
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const n = pinkNoise(st);
    const rumble =
      Math.sin(2 * Math.PI * rumbleLow * t) * Math.exp(-t * 4) * 1.1 +
      Math.sin(2 * Math.PI * rumbleMid * t) * Math.exp(-t * 7) * 0.5;
    out[i] = (n * 0.35 + rumble) * e[i];
  }
  const tail = bandpassNoise(0.5, 40, tailHigh, 0.6);
  return mix(out, tail);
}

function makeMortar({ duration = 0.55, pop = 65 } = {}) {
  const len = Math.floor(duration * SR);
  const e = envAR(len, 0.003, duration * 0.75, 1.1);
  const st = [0, 0, 0, 0, 0, 0];
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const n = pinkNoise(st);
    const thump = Math.sin(2 * Math.PI * pop * t) * Math.exp(-t * 14) * 0.85;
    out[i] = (n * 0.55 + thump) * e[i];
  }
  return mix(crack(0.06, 0.65, 90), out);
}

function makeImpact() {
  const len = Math.floor(0.5 * SR);
  const e = envAR(len, 0.003, 0.45, 1);
  const st = [0, 0, 0, 0, 0, 0];
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    out[i] = pinkNoise(st) * e[i] * Math.exp(-t * 6);
  }
  return out;
}

function makeExplosion() {
  const duration = 1.75;
  const len = Math.floor(duration * SR);
  const e = envAR(len, 0.014, duration * 0.94, 0.72);
  const st = [0, 0, 0, 0, 0, 0];
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const n = pinkNoise(st);
    const sub = Math.sin(2 * Math.PI * 18 * t) * Math.exp(-t * 1.9) * 1.4;
    const thump = Math.sin(2 * Math.PI * 32 * t) * Math.exp(-t * 2.6) * 1.05;
    const low = Math.sin(2 * Math.PI * 52 * t) * Math.exp(-t * 3.4) * 0.72;
    const body = Math.sin(2 * Math.PI * 88 * t) * Math.exp(-t * 5.5) * 0.22;
    out[i] = (n * 0.18 + sub + thump + low + body) * e[i];
  }
  const bassTail = bandpassNoise(0.85, 18, 140, 0.95);
  const blast = bandpassNoise(0.22, 60, 900, 0.55);
  return mix(crack(0.12, 0.5, 55), out, bassTail, blast);
}

function softClip(x) {
  return Math.tanh(x * 1.28);
}

function seamlessLoop(samples, crossfadeSec = 0.05) {
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

function exhaustPulse(phase) {
  const p = phase % 1;
  return Math.exp(-p * 22) * 0.95 + Math.exp(-p * 7) * 0.35;
}

function bladePulse(phase) {
  const p = phase % 1;
  const hit = Math.pow(Math.max(0, Math.cos(p * Math.PI * 2)), 9);
  const swish = Math.pow(Math.max(0, 1 - Math.abs(p - 0.5) * 3.2), 5) * 0.42;
  return hit * 0.78 + swish;
}

/** Seamless Merlin cruise loop — spatial pass / Doppler handled at runtime. */
function bakeMerlinMain({
  duration = 2.75,
  crankHz = 40.5,
  cylinders = 6,
  propBlades = 3,
} = {}) {
  const len = Math.floor(duration * SR);
  const out = new Float32Array(len);
  const st = [0, 0, 0, 0, 0, 0];
  const firingHz = crankHz * cylinders;
  const bladeHz = crankHz * propBlades;
  let lpBody = 0;
  let lpRumble = 0;

  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const wob = Math.sin(t * 2.15) * 0.03 + Math.sin(t * 5.7) * 0.015;

    let motor = 0;
    const harmonics = [
      [1, 0.42],
      [2, 0.24],
      [3, 0.15],
      [4.03, 0.1],
      [5.08, 0.06],
      [6.12, 0.04],
    ];
    for (const [ratio, gain] of harmonics) {
      motor += Math.sin(2 * Math.PI * crankHz * ratio * t + wob * ratio) * gain;
    }

    const bankA = exhaustPulse(t * firingHz);
    const bankB = exhaustPulse(t * firingHz + 0.5);
    const stacks = bankA * 0.58 + bankB * 0.54;

    const pn = pinkNoise(st);
    lpBody += 0.11 * (pn - lpBody);
    const body = lpBody * stacks * 0.62;

    const blade = bladePulse(t * bladeHz);
    const propMod = 0.58 + blade * 0.42;
    motor = softClip(motor * propMod * 0.72);

    lpRumble += 0.04 * (pn - lpRumble);
    const rumble =
      Math.sin(2 * Math.PI * crankHz * 0.5 * t) * 0.28 +
      Math.sin(2 * Math.PI * crankHz * 0.75 * t) * 0.16 +
      lpRumble * 0.18;

    out[i] = motor + body + rumble + pn * stacks * 0.08;
  }

  return seamlessLoop(out);
}

/** Twin-stack exhaust crackle (played as a secondary loop). */
function bakeMerlinExhaust({ duration = 2.65, crankHz = 40.5, cylinders = 6 } = {}) {
  const len = Math.floor(duration * SR);
  const out = new Float32Array(len);
  const st = [0, 0, 0, 0, 0, 0];
  const firingHz = crankHz * cylinders;
  let lp = 0;
  let hp = 0;

  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const bankA = exhaustPulse(t * firingHz);
    const bankB = exhaustPulse(t * firingHz + 0.5);
    const stacks = bankA * 0.64 + bankB * 0.6;

    const pn = pinkNoise(st);
    lp += 0.07 * (pn - lp);
    const bright = pn - lp;
    hp += 0.18 * (bright - hp);

    const growl =
      Math.sin(2 * Math.PI * firingHz * t) * 0.14 +
      Math.sin(2 * Math.PI * firingHz * 1.5 * t) * 0.09 +
      Math.sin(2 * Math.PI * firingHz * 2.1 * t) * 0.05;

    out[i] = softClip((hp * stacks * 0.82 + lp * stacks * 0.35 + growl) * 0.95);
  }

  return seamlessLoop(out);
}

/** Propeller bite + airflow (louder when mixed in near the aircraft). */
function bakeMerlinProp({ duration = 2.55, crankHz = 40.5, propBlades = 3 } = {}) {
  const len = Math.floor(duration * SR);
  const out = new Float32Array(len);
  const st = [0, 0, 0, 0, 0, 0];
  const bladeHz = crankHz * propBlades;
  let lp = 0;

  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const blade = bladePulse(t * bladeHz);
    const pn = pinkNoise(st);
    lp += 0.12 * (pn - lp);
    const bite = (pn - lp) * blade * 0.95;
    const aero = lp * (0.22 + blade * 0.55);
    const tip =
      Math.sin(2 * Math.PI * bladeHz * 2 * t) * blade * 0.08 +
      Math.sin(2 * Math.PI * bladeHz * 3 * t) * blade * 0.05;

    out[i] = bite + aero + tip;
  }

  return seamlessLoop(out);
}

const merlinCfg = { crankHz: 40.5, cylinders: 6, propBlades: 3 };

// Legacy generic fallbacks
writeWav('rifle.wav', makeRifle());
writeWav('mg.wav', makeMgBurst());
writeWav('tank.wav', makeTank());
writeWav('artillery.wav', makeArtillery());
writeWav('impact.wav', makeImpact());
writeWav('explosion.wav', makeExplosion());
writeWav('aircraft-flyby.wav', bakeMerlinMain(merlinCfg));
writeWav('aircraft-flyby-exhaust.wav', bakeMerlinExhaust(merlinCfg));
writeWav('aircraft-flyby-prop.wav', bakeMerlinProp(merlinCfg));

// —— Rifles (Kar98k / M1 Garand / Lee-Enfield) ——
writeWav('rifle-germany.wav', makeRifle({ thumpHz: 95, crackVol: 1.25, crackDecay: 130 }));
writeWav('rifle-germany-b.wav', makeRifle({ thumpHz: 88, crackVol: 1.15, bodyVol: 0.75, duration: 0.32 }));
writeWav('rifle-usa.wav', makeRifle({ thumpHz: 82, crackVol: 1.35, thumpVol: 0.62, crackDecay: 110 }));
writeWav('rifle-usa-b.wav', makeRifle({ thumpHz: 78, crackVol: 1.28, duration: 0.38, noiseMix: 0.65 }));
writeWav('rifle-uk.wav', makeRifle({ thumpHz: 92, crackVol: 1.18, thumpVol: 0.48, bodyVol: 0.78 }));
writeWav('rifle-uk-b.wav', makeRifle({ thumpHz: 98, crackVol: 1.22, duration: 0.33 }));

// —— Machine guns (MG42 / M1919 / Vickers-Bren) ——
writeWav(
  'mg-germany.wav',
  makeMgBurst({
    shots: 8,
    gap: 0.058,
    rifleOpts: { thumpHz: 105, crackVol: 1.1, bodyVol: 0.55, crackDecay: 140 },
  })
);
writeWav(
  'mg-germany-b.wav',
  makeMgBurst({
    shots: 6,
    gap: 0.062,
    rifleOpts: { thumpHz: 100, crackVol: 1.05, bodyVol: 0.6 },
  })
);
writeWav(
  'mg-usa.wav',
  makeMgBurst({
    shots: 4,
    gap: 0.11,
    rifleOpts: { thumpHz: 75, crackVol: 1.2, thumpVol: 0.45 },
  })
);
writeWav(
  'mg-usa-b.wav',
  makeMgBurst({
    shots: 5,
    gap: 0.095,
    rifleOpts: { thumpHz: 80, crackVol: 1.15, bodyVol: 0.65 },
  })
);
writeWav(
  'mg-uk.wav',
  makeMgBurst({
    shots: 5,
    gap: 0.1,
    rifleOpts: { thumpHz: 86, crackVol: 1.12, thumpVol: 0.52, bodyVol: 0.72 },
  })
);
writeWav(
  'mg-uk-b.wav',
  makeMgBurst({
    shots: 4,
    gap: 0.108,
    rifleOpts: { thumpHz: 90, crackVol: 1.08, duration: 0.36 },
  })
);

// —— Tank & AT guns ——
writeWav('tank-75-germany.wav', makeTank({ boomLow: 42, boomMid: 105, duration: 0.95 }));
writeWav('tank-75-usa.wav', makeTank({ boomLow: 48, boomMid: 118, duration: 0.88, crackVol: 0.75 }));
writeWav('tank-75-uk.wav', makeTank({ boomLow: 46, boomMid: 112, duration: 0.92, noiseVol: 0.45 }));
writeWav('tank-88-germany.wav', makeTank({ boomLow: 34, boomMid: 88, duration: 1.15, boomLowVol: 1.05, crackVol: 0.95 }));
writeWav('tank-90-usa.wav', makeTank({ boomLow: 38, boomMid: 95, duration: 1.05, boomLowVol: 1.0 }));
writeWav('tank-17pdr-uk.wav', makeTank({ boomLow: 40, boomMid: 102, duration: 1.0, boomMidVol: 0.42 }));
writeWav('at-75-germany.wav', makeTank({ boomLow: 44, boomMid: 108, duration: 0.82, crackVol: 0.9 }));
writeWav('at-57-usa.wav', makeTank({ boomLow: 52, boomMid: 125, duration: 0.72, boomLowVol: 0.75, crackVol: 0.85 }));
writeWav('at-57-uk.wav', makeTank({ boomLow: 50, boomMid: 120, duration: 0.74, crackVol: 0.82 }));

// —— Mortars ——
writeWav('mortar-germany.wav', makeMortar({ pop: 58, duration: 0.62 }));
writeWav('mortar-usa.wav', makeMortar({ pop: 72, duration: 0.48 }));
writeWav('mortar-uk.wav', makeMortar({ pop: 62, duration: 0.55 }));

// —— Field artillery ——
writeWav('howitzer-105-germany.wav', makeArtillery({ rumbleLow: 26, rumbleMid: 52, tailHigh: 280 }));
writeWav('howitzer-105-usa.wav', makeArtillery({ rumbleLow: 30, rumbleMid: 58, tailHigh: 320 }));
writeWav('howitzer-25pdr-uk.wav', makeArtillery({ rumbleLow: 32, rumbleMid: 64, tailHigh: 340, duration: 1.25 }));

console.log('Done — samples in public/sounds/');