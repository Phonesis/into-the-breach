import { isTabletLikeDevice } from '../lib/tabletDetect.js';

const ACTIONS = [
  'panForward',
  'panBack',
  'panLeft',
  'panRight',
  'rotateLeft',
  'rotateRight',
  'zoomIn',
  'zoomOut',
];

function emptyInput() {
  return {
    panForward: false,
    panBack: false,
    panLeft: false,
    panRight: false,
    rotateLeft: false,
    rotateRight: false,
    zoomIn: false,
    zoomOut: false,
  };
}

export class TabletCameraControls {
  constructor(root) {
    this.root = root;
    this.mount = root.querySelector('#tablet-camera');
    this.input = emptyInput();
    this.visible = false;
    this._boundBlur = () => this.clear();

    if (!this.mount) return;

    for (const btn of this.mount.querySelectorAll('[data-cam]')) {
      const action = btn.dataset.cam;
      if (!ACTIONS.includes(action)) continue;

      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.setPointerCapture(e.pointerId);
        this.input[action] = true;
        btn.classList.add('is-active');
      });

      const release = (e) => {
        if (e.pointerId != null && btn.hasPointerCapture?.(e.pointerId)) {
          btn.releasePointerCapture(e.pointerId);
        }
        this.input[action] = false;
        btn.classList.remove('is-active');
      };

      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('lostpointercapture', () => {
        this.input[action] = false;
        btn.classList.remove('is-active');
      });
    }

    window.addEventListener('blur', this._boundBlur);
  }

  shouldEnable() {
    return isTabletLikeDevice();
  }

  setVisible(on) {
    this.visible = !!on;
    if (!this.mount) return;
    this.mount.classList.toggle('hidden', !this.visible);
    if (!this.visible) this.clear();
  }

  getInput() {
    return this.input;
  }

  clear() {
    for (const key of ACTIONS) this.input[key] = false;
    if (!this.mount) return;
    for (const btn of this.mount.querySelectorAll('[data-cam]')) {
      btn.classList.remove('is-active');
    }
  }

  dispose() {
    window.removeEventListener('blur', this._boundBlur);
    this.clear();
  }
}