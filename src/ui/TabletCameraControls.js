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
    zoomTap: null,
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

      const press = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.pointerId != null) {
          try {
            btn.setPointerCapture(e.pointerId);
          } catch {
            /* Safari may reject capture on some nodes */
          }
        }
        this.input[action] = true;
        btn.classList.add('is-active');
      };

      const release = (e) => {
        if (e?.pointerId != null && btn.hasPointerCapture?.(e.pointerId)) {
          try {
            btn.releasePointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        }
        this.input[action] = false;
        btn.classList.remove('is-active');
      };

      btn.addEventListener('pointerdown', press);
      btn.addEventListener('touchstart', press, { passive: false });
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('touchend', release);
      btn.addEventListener('touchcancel', release);
      btn.addEventListener('lostpointercapture', () => {
        this.input[action] = false;
        btn.classList.remove('is-active');
      });

      if (action === 'zoomIn' || action === 'zoomOut') {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.input.zoomTap = action;
        });
      }
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
    this.input.zoomTap = null;
    if (!this.mount) return;
    for (const btn of this.mount.querySelectorAll('[data-cam]')) {
      btn.classList.remove('is-active');
    }
  }

  clearZoomTap() {
    this.input.zoomTap = null;
  }

  dispose() {
    window.removeEventListener('blur', this._boundBlur);
    this.clear();
  }
}