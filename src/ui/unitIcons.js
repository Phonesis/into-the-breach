/** Inline SVG icons for the unit roster (currentColor inherits panel text). */

const ICONS = {
  infantry: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="8" r="4" fill="currentColor"/><path d="M10 28v-8l6-4 6 4v8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
  machineGun: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="10" cy="10" r="3.5" fill="currentColor"/><path d="M8 26V14h4v12M14 18h14v2H14M24 17h6v4h-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  sniper: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="11" cy="9" r="3.5" fill="currentColor"/><path d="M9 26V13l14-5v3l-10 4v11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  mortar: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 24h16l-2-6H10l-2 6z" fill="currentColor" opacity="0.85"/><path d="M14 18V8l4-3v13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  armoredCar: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="5" y="14" width="22" height="8" rx="2" fill="currentColor"/><circle cx="10" cy="24" r="3" fill="currentColor"/><circle cx="22" cy="24" r="3" fill="currentColor"/><path d="M12 14V10h8v4" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
  tank: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="16" width="24" height="9" rx="1.5" fill="currentColor"/><circle cx="9" cy="27" r="3.2" fill="currentColor"/><circle cx="23" cy="27" r="3.2" fill="currentColor"/><rect x="10" y="9" width="12" height="7" rx="1" fill="currentColor"/><path d="M22 12h8v2h-8" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  superHeavyTank: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="2" y="17" width="28" height="10" rx="1.5" fill="currentColor"/><circle cx="8" cy="28" r="3.5" fill="currentColor"/><circle cx="24" cy="28" r="3.5" fill="currentColor"/><rect x="9" y="7" width="14" height="9" rx="1" fill="currentColor"/><path d="M23 11h9v2.5H23" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>`,
  artillery: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="8" cy="26" r="3" fill="currentColor"/><circle cx="24" cy="26" r="3" fill="currentColor"/><path d="M8 23h4l6-14 10 4-4 10H12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
};

export function getUnitIconMarkup(type) {
  return ICONS[type] ?? ICONS.infantry;
}