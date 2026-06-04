/**
 * Looping cinematic menu theme — starts when menu is visible, fades out in battle.
 */

import { publicUrl } from '../lib/publicUrl.js';

const MENU_MUSIC_URL = publicUrl('music/menu-theme.ogg');
const FADE_SEC = 1.4;
const TARGET_GAIN = 0.42;

export class MenuMusic {
  constructor(soundManager) {
    this.sm = soundManager;
    this.buffer = null;
    this.source = null;
    this.gain = null;
    this._loadPromise = null;
    this._wanted = false;
    this._playing = false;
    /** Bumped on stop — stale ensureLoaded callbacks ignore. */
    this._generation = 0;
  }

  ensureLoaded() {
    if (this._loadPromise) return this._loadPromise;
    this._loadPromise = this._load();
    return this._loadPromise;
  }

  async _load() {
    const ctx = this.sm.ctx;
    if (!ctx) return;
    try {
      const res = await fetch(MENU_MUSIC_URL);
      if (!res.ok) return;
      const ab = await res.arrayBuffer();
      this.buffer = await ctx.decodeAudioData(ab);
    } catch {
      /* missing or decode error */
    }
  }

  setMenuActive(active) {
    this._wanted = active;
    if (!active) {
      this.stopImmediate();
      return;
    }
    if (this.sm.inBattle || !this.sm.unlocked || !this.sm.ctx || this.sm.muted) {
      return;
    }
    if (this.sm.ctx.state === 'suspended') this.sm.ctx.resume();
    const gen = this._generation;
    this.ensureLoaded().then(() => {
      if (gen !== this._generation || !this._wanted || this.sm.inBattle) return;
      this._fadeIn();
    });
  }

  _fadeIn() {
    if (this.sm.inBattle || !this._wanted || !this.buffer || !this.sm.ctx) return;
    if (this._playing && this.source) {
      this._rampGain(TARGET_GAIN);
      return;
    }
    this._stopSource();
    const ctx = this.sm.ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0.001;
    this.gain.connect(this.sm.master);

    this.source = ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.loop = true;
    this.source.connect(this.gain);
    this.source.start(0);
    this._playing = true;
    this._rampGain(TARGET_GAIN);
  }

  _fadeOut() {
    if (!this._playing || !this.gain || !this.sm.ctx) {
      this._stopSource();
      return;
    }
    const ctx = this.sm.ctx;
    const t0 = ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t0);
    this.gain.gain.setValueAtTime(this.gain.gain.value, t0);
    this.gain.gain.linearRampToValueAtTime(0.001, t0 + FADE_SEC);
    const src = this.source;
    const gain = this.gain;
    setTimeout(() => {
      if (this.source === src && !this._wanted) this._stopSource();
    }, FADE_SEC * 1000 + 80);
  }

  _rampGain(target) {
    if (!this.gain || !this.sm.ctx) return;
    const t0 = this.sm.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t0);
    this.gain.gain.setValueAtTime(this.gain.gain.value, t0);
    this.gain.gain.linearRampToValueAtTime(target, t0 + FADE_SEC);
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
  }

  stopImmediate() {
    this._wanted = false;
    this._generation += 1;
    this._stopSource();
  }
}