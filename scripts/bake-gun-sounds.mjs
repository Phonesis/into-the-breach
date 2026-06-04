/**
 * Bakes realistic gunfire WAV samples (PCM) for the game.
 * Run: node scripts/bake-gun-sounds.mjs
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

function crack(duration, vol) {
  const len = Math.floor(duration * SR);
  const out = new Float32Array(len);
  const e = envAR(len, 0.001, duration * 0.6, 2.5);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    out[i] = noise() * e[i] * vol * Math.exp(-t * 120);
  }
  return out;
}

function makeRifle() {
  const len = Math.floor(0.35 * SR);
  const e = envAR(len, 0.002, 0.28, 1.8);
  const st = [0, 0, 0, 0, 0, 0];
  const body = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const n = pinkNoise(st);
    const thump = Math.sin(2 * Math.PI * 90 * t) * Math.exp(-t * 35) * 0.5;
    body[i] = (n * 0.7 + thump) * e[i];
  }
  return mix(crack(0.08, 1.2), body);
}

function makeMg() {
  const shots = [];
  for (let s = 0; s < 5; s++) {
    const shot = makeRifle();
    const offset = Math.floor(s * 0.085 * SR);
    const total = offset + shot.length;
    const buf = new Float32Array(total);
    for (let i = 0; i < shot.length; i++) buf[offset + i] = shot[i] * (0.85 + Math.random() * 0.15);
    shots.push(buf);
  }
  return mix(...shots);
}

function makeTank() {
  const len = Math.floor(0.9 * SR);
  const e = envAR(len, 0.004, 0.75, 1.2);
  const st = [0, 0, 0, 0, 0, 0];
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const n = pinkNoise(st);
    const boom =
      Math.sin(2 * Math.PI * 45 * t) * Math.exp(-t * 8) * 0.9 +
      Math.sin(2 * Math.PI * 110 * t) * Math.exp(-t * 18) * 0.35;
    const blast = bandpassNoise(0.15, 80, 1200, 1)[Math.min(i, Math.floor(0.15 * SR) - 1)] || 0;
    out[i] = (n * 0.5 + boom + blast * 0.4) * e[i];
  }
  return mix(crack(0.12, 0.8), out);
}

function makeArtillery() {
  const len = Math.floor(1.4 * SR);
  const e = envAR(len, 0.008, 1.2, 0.9);
  const st = [0, 0, 0, 0, 0, 0];
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const n = pinkNoise(st);
    const rumble =
      Math.sin(2 * Math.PI * 28 * t) * Math.exp(-t * 4) * 1.1 +
      Math.sin(2 * Math.PI * 55 * t) * Math.exp(-t * 7) * 0.5;
    out[i] = (n * 0.35 + rumble) * e[i];
  }
  const tail = bandpassNoise(0.5, 40, 300, 0.6);
  return mix(out, tail);
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
  const len = Math.floor(1.2 * SR);
  const e = envAR(len, 0.01, 1, 0.85);
  const st = [0, 0, 0, 0, 0, 0];
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const n = pinkNoise(st);
    const boom = Math.sin(2 * Math.PI * 35 * t) * Math.exp(-t * 3.5);
    out[i] = (n * 0.6 + boom) * e[i];
  }
  return out;
}

writeWav('rifle.wav', makeRifle());
writeWav('mg.wav', makeMg());
writeWav('tank.wav', makeTank());
writeWav('artillery.wav', makeArtillery());
writeWav('impact.wav', makeImpact());
writeWav('explosion.wav', makeExplosion());
console.log('Done — samples in public/sounds/');