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

/** Any combat unit that can receive a Shift+LMB manual fire order. */
export function canManualFireOrder(unit) {
  if (!unit?.def) return false;
  if (unit.def.nonCombat || unit.def.damage <= 0) return false;
  if (unit.def.type === 'medic' || unit.def.type === 'engineer') return false;
  return true;
}

/** @deprecated use canManualFireOrder */
export function canGroundFire(unit) {
  return canManualFireOrder(unit);
}

/**
 * @param {{ fireSupportPending?: boolean, shiftHeld?: boolean, hasManualFireSelection?: boolean }} state
 * @returns {string} Inline cursor for canvas, or '' to use stylesheet default.
 */
export function resolveBattleCursor({
  fireSupportPending = false,
  shiftHeld = false,
  hasManualFireSelection = false,
} = {}) {
  if (fireSupportPending) return 'crosshair';
  if (shiftHeld && hasManualFireSelection) return CURSOR_GROUND_FIRE;
  return '';
}