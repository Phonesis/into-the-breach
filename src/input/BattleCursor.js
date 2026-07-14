/** 32×32 fire-mission reticle (hotspot center). */
const TARGET_SVG = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="11" fill="none" stroke="#ff5533" stroke-width="2.2" opacity="0.95"/>
  <circle cx="16" cy="16" r="4" fill="none" stroke="#ffdd88" stroke-width="1.6"/>
  <line x1="16" y1="2" x2="16" y2="9" stroke="#ff5533" stroke-width="2.2" stroke-linecap="round"/>
  <line x1="16" y1="23" x2="16" y2="30" stroke="#ff5533" stroke-width="2.2" stroke-linecap="round"/>
  <line x1="2" y1="16" x2="9" y2="16" stroke="#ff5533" stroke-width="2.2" stroke-linecap="round"/>
  <line x1="23" y1="16" x2="30" y2="16" stroke="#ff5533" stroke-width="2.2" stroke-linecap="round"/>
  <circle cx="16" cy="16" r="1.8" fill="#ffdd88"/>
</svg>
`.trim());

export const CURSOR_GROUND_FIRE = `url("data:image/svg+xml,${TARGET_SVG}") 16 16, crosshair`;

/** Smoke-shell placement reticle (grey). */
const SMOKE_TARGET_SVG = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="11" fill="none" stroke="#8a9aaa" stroke-width="2.2" opacity="0.95"/>
  <circle cx="16" cy="16" r="4" fill="none" stroke="#c8d4e0" stroke-width="1.6"/>
  <line x1="16" y1="2" x2="16" y2="9" stroke="#8a9aaa" stroke-width="2.2" stroke-linecap="round"/>
  <line x1="16" y1="23" x2="16" y2="30" stroke="#8a9aaa" stroke-width="2.2" stroke-linecap="round"/>
  <line x1="2" y1="16" x2="9" y2="16" stroke="#8a9aaa" stroke-width="2.2" stroke-linecap="round"/>
  <line x1="23" y1="16" x2="30" y2="16" stroke="#8a9aaa" stroke-width="2.2" stroke-linecap="round"/>
  <circle cx="16" cy="16" r="1.8" fill="#c8d4e0"/>
</svg>
`.trim());

export const CURSOR_SMOKE_SHELL = `url("data:image/svg+xml,${SMOKE_TARGET_SVG}") 16 16, crosshair`;

export function canSmokeShellOrder(unit) {
  return unit?.def?.type === 'artillery' && !unit.dead && !unit.surrendered;
}

export { isSmokeShellReady };

/** Any combat unit that can receive a Shift+LMB manual fire order. */
export function canManualFireOrder(unit) {
  if (!unit?.def) return false;
  if (unit.def.nonCombat || unit.def.damage <= 0) return false;
  if (unit.def.type === 'medic') return false;
  return true;
}

/** @deprecated use canManualFireOrder */
export function canGroundFire(unit) {
  return canManualFireOrder(unit);
}

/**
 * @param {{ fireSupportPending?: boolean, smokeShellPending?: boolean, shiftHeld?: boolean, hasManualFireSelection?: boolean, hasSmokeShellSelection?: boolean }} state
 * @returns {string} Inline cursor for canvas, or '' to use stylesheet default.
 */
export function resolveBattleCursor({
  fireSupportPending = false,
  smokeShellPending = false,
  shiftHeld = false,
  hasManualFireSelection = false,
  hasSmokeShellSelection = false,
} = {}) {
  if (fireSupportPending) return 'crosshair';
  if (smokeShellPending) return CURSOR_SMOKE_SHELL;
  if (shiftHeld && hasSmokeShellSelection) return CURSOR_SMOKE_SHELL;
  if (shiftHeld && hasManualFireSelection) return CURSOR_GROUND_FIRE;
  return '';
}
import { isSmokeShellReady } from '../game/Targeting.js';
