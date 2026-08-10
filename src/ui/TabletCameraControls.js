import { isTabletModeEnabled } from '../lib/tabletDetect.js';

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
    this._drag = null;
    this._boundBlur = () => {
      this._endDrag();
      this.clear();
    };
    this._onMountPointerDown = this._beginDrag.bind(this);
    this._onMountPointerMove = this._moveDrag.bind(this);
    this._onMountPointerUp = this._endDrag.bind(this);
    this._onWindowResize = () => this._clampPosition();

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

    this.mount.addEventListener('pointerdown', this._onMountPointerDown);
    this.mount.addEventListener('pointermove', this._onMountPointerMove);
    this.mount.addEventListener('pointerup', this._onMountPointerUp);
    this.mount.addEventListener('pointercancel', this._onMountPointerUp);
    window.addEventListener('blur', this._boundBlur);
    window.addEventListener('resize', this._onWindowResize);
  }

  _beginDrag(e) {
    const isNonPrimaryMouseButton = e.button != null && e.button !== 0 && e.pointerType !== 'touch';
    if (!this.visible || !e.isPrimary || isNonPrimaryMouseButton) return;
    if (e.target.closest?.('button, input, select, textarea, a')) return;

    const rect = this.mount.getBoundingClientRect();
    this.mount.style.left = `${rect.left}px`;
    this.mount.style.top = `${rect.top}px`;
    this.mount.style.right = 'auto';
    this.mount.style.bottom = 'auto';
    this._drag = {
      pointerId: e.pointerId,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
    this.mount.classList.add('is-dragging');
    try {
      this.mount.setPointerCapture(e.pointerId);
    } catch {
      /* Safari may reject capture on an element during gesture handoff */
    }
    e.preventDefault();
    e.stopPropagation();
  }

  _moveDrag(e) {
    if (!this._drag || e.pointerId !== this._drag.pointerId) return;
    const x = e.clientX - this._drag.offsetX;
    const y = e.clientY - this._drag.offsetY;
    this._setClampedPosition(x, y);
    e.preventDefault();
    e.stopPropagation();
  }

  _endDrag(e) {
    if (!this._drag) return;
    if (e?.pointerId != null && e.pointerId !== this._drag.pointerId) return;
    const pointerId = this._drag.pointerId;
    this._drag = null;
    this.mount.classList.remove('is-dragging');
    try {
      if (this.mount.hasPointerCapture?.(pointerId)) this.mount.releasePointerCapture(pointerId);
    } catch {
      /* ignore */
    }
  }

  _setClampedPosition(x, y) {
    const rect = this.mount.getBoundingClientRect();
    const margin = 8;
    const maxX = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxY = Math.max(margin, window.innerHeight - rect.height - margin);
    this.mount.style.left = `${Math.max(margin, Math.min(maxX, x))}px`;
    this.mount.style.top = `${Math.max(margin, Math.min(maxY, y))}px`;
  }

  _clampPosition() {
    if (!this.visible || !this.mount.style.left || !this.mount.style.top) return;
    const rect = this.mount.getBoundingClientRect();
    this._setClampedPosition(rect.left, rect.top);
  }

  shouldEnable() {
    return isTabletModeEnabled();
  }

  setVisible(on) {
    this.visible = !!on;
    if (!this.mount) return;
    if (!this.visible) this._endDrag();
    this.mount.classList.toggle('hidden', !this.visible);
    if (this.visible) this._clampPosition();
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
    this._endDrag();
    this.mount?.removeEventListener('pointerdown', this._onMountPointerDown);
    this.mount?.removeEventListener('pointermove', this._onMountPointerMove);
    this.mount?.removeEventListener('pointerup', this._onMountPointerUp);
    this.mount?.removeEventListener('pointercancel', this._onMountPointerUp);
    window.removeEventListener('blur', this._boundBlur);
    window.removeEventListener('resize', this._onWindowResize);
    this.clear();
  }
}
