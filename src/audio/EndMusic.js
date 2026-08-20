/**
 * Short faction-specific victory / defeat stingers played when a match ends.
 */

import { publicUrl } from '../lib/publicUrl.js';

const FACTIONS = new Set(['germany', 'usa', 'uk', 'russia', 'japan']);
const FADE_IN_SEC = 0.12;
const FADE_OUT_SEC = 0.35;
const TARGET_GAIN = 0.5;

function normalizeFaction(factionId) {
  const id = String(factionId ?? '').toLowerCase();
  return FACTIONS.has(id) ? id : 'usa';
}

function trackKey(factionId, victory) {
  return `${normalizeFaction(factionId)}-${victory ? 'victory' : 'defeat'}`;
}

function trackUrl(factionId, victory) {
  const faction = normalizeFaction(factionId);
  const outcome = victory ? 'victory' : 'defeat';
  return publicUrl(`music/${outcome}-${faction}.ogg`);
}

export class EndMusic {
  constructor(soundManager) {
    this.sm = soundManager;
    /** @type {Record<string, AudioBuffer>} */
    this.buffers = {};
    /** @type {Record<string, Promise<AudioBuffer|null>>} */
    this._loads = {};
    this.source = null;
    this.gain = null;
    this._playing = false;
    this._currentKey = null;
    this._generation = 0;
  }

  get isPlaying() {
    return this._playing;
  }

  preload(factionId) {
    void this.ensureLoaded(factionId, true);
    void this.ensureLoaded(factionId, false);
  }

  ensureLoaded(factionId, victory) {
    const key = trackKey(factionId, victory);
    if (this.buffers[key]) return Promise.resolve(this.buffers[key]);
    if (!this._loads[key]) this._loads[key] = this._load(key, trackUrl(factionId, victory));
    return this._loads[key];
  }

  async _load(key, url) {
    const ctx = this.sm.ctx;
    if (!ctx) return null;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const ab = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(ab);
      this.buffers[key] = buf;
      return buf;
    } catch {
      return null;
    }
  }

  play(factionId, victory) {
    if (!this.sm.unlocked || !this.sm.ctx || this.sm.muted) return false;
    if (this.sm.ctx.state !== 'running') return false;

    const key = trackKey(factionId, victory);
    if (this._playing && this._currentKey === key) return true;

    const gen = ++this._generation;
    this._stopSource();
    this.ensureLoaded(factionId, victory).then((buffer) => {
      if (gen !== this._generation || this.sm.muted || !this.sm.ctx) return;
      if (!buffer || this.sm.ctx.state !== 'running') {
        this.sm.play(victory ? 'victory' : 'defeat');
        return;
      }
      this._start(buffer, key);
    }).catch(() => {});
    return true;
  }

  _start(buffer, key) {
    const ctx = this.sm.ctx;
    if (!ctx || !buffer) return;

    this.gain = ctx.createGain();
    this.gain.gain.value = 0.001;
    this.gain.connect(this.sm.master);

    this.source = ctx.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = false;
    this.source.connect(this.gain);
    this.source.onended = () => {
      if (this._currentKey === key) this._stopSource();
    };
    this.source.start(0);
    this._playing = true;
    this._currentKey = key;

    const t0 = ctx.currentTime;
    this.gain.gain.setValueAtTime(0.001, t0);
    this.gain.gain.linearRampToValueAtTime(TARGET_GAIN, t0 + FADE_IN_SEC);
  }

  stopImmediate() {
    this._generation += 1;
    this._stopSource();
  }

  fadeOut() {
    if (!this._playing || !this.gain || !this.sm.ctx) {
      this.stopImmediate();
      return;
    }
    const gen = ++this._generation;
    const ctx = this.sm.ctx;
    const t0 = ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t0);
    this.gain.gain.setValueAtTime(this.gain.gain.value, t0);
    this.gain.gain.linearRampToValueAtTime(0.001, t0 + FADE_OUT_SEC);
    setTimeout(() => {
      if (gen === this._generation) this._stopSource();
    }, FADE_OUT_SEC * 1000 + 40);
  }

  _stopSource() {
    try {
      this.source?.stop();
    } catch {
      /* already stopped */
    }
    this.source?.disconnect();
    this.gain?.disconnect();
    this.source = null;
    this.gain = null;
    this._playing = false;
    this._currentKey = null;
  }
}
