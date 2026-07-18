/** Inline SVG icons for unit roster and reinforcements panel (currentColor inherits panel text). */

const ICONS = {
  infantry: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="16" cy="7.5" r="3.2" fill="currentColor"/>
    <path d="M12 28V14.5l4-2.5 4 2.5V28" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    <path d="M10 20h12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M19 15.5l6-2v1.8l-5 2.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <ellipse cx="16" cy="6.8" rx="3.8" ry="1.2" fill="currentColor" opacity="0.35"/>
  </svg>`,

  paratrooper: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <path d="M6 9c5-4 15-4 20 0-2 3-4 4-10 4s-8-1-10-4z" fill="currentColor" opacity="0.35"/>
    <circle cx="16" cy="8.5" r="3" fill="currentColor"/>
    <path d="M12 27V15l4-2.5 4 2.5V27" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    <path d="M20 16.5l7-1.5v1.6l-6 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="27" cy="15.8" r="1.2" fill="currentColor"/>
  </svg>`,

  machineGun: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <path d="M8 24l2-9M24 24l-2-9M16 24V13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
    <circle cx="16" cy="11" r="1.6" fill="currentColor"/>
    <path d="M11 14.5h10v2H11z" fill="currentColor"/>
    <path d="M21 15.5h7v1.6h-7" fill="currentColor" opacity="0.9"/>
    <rect x="8.5" y="13.8" width="3.5" height="2.8" rx="0.4" fill="currentColor" opacity="0.55"/>
    <circle cx="10" cy="22" r="2.2" fill="currentColor" opacity="0.75"/>
    <circle cx="22" cy="22" r="2.2" fill="currentColor" opacity="0.75"/>
  </svg>`,

  engineer: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="16" cy="8" r="3.2" fill="currentColor"/>
    <path d="M12 28V14.5l4-2.5 4 2.5V28" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    <rect x="17.5" y="16.5" width="6" height="4" rx="0.5" fill="currentColor" opacity="0.55"/>
    <rect x="18.2" y="17.8" width="4.6" height="1.2" fill="#e8e4dc"/>
    <path d="M10 19.5l5-3.5 1.2 1.8-4.2 2.8z" fill="currentColor" opacity="0.75"/>
    <path d="M9.5 18.8h5.8" fill="none" stroke="#e8c040" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="9.8" cy="18.8" r="1.1" fill="none" stroke="#e8c040" stroke-width="1.2"/>
  </svg>`,

  medic: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="16" cy="8" r="3.2" fill="currentColor"/>
    <path d="M12 28V14.5l4-2.5 4 2.5V28" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    <rect x="18" y="16" width="5" height="4.5" rx="0.6" fill="currentColor" opacity="0.55"/>
    <rect x="20.2" y="17.2" width="0.9" height="2.1" fill="#e8e4dc"/>
    <rect x="19.4" y="17.9" width="2.5" height="0.9" fill="#e8e4dc"/>
    <rect x="11.5" y="18.5" width="3.5" height="1.2" rx="0.3" fill="#e8e4dc" opacity="0.85"/>
    <rect x="12.6" y="17.8" width="1.1" height="2.6" fill="#c41e3a"/>
    <rect x="11.9" y="18.5" width="2.5" height="1.1" fill="#c41e3a"/>
  </svg>`,

  sniper: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <ellipse cx="16" cy="22" rx="11" ry="3.5" fill="currentColor" opacity="0.2"/>
    <circle cx="10" cy="14" r="2.8" fill="currentColor"/>
    <path d="M8 24c2-4 4-6 7-6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M12 17.5l14-4.5v2l-11 3.8v6.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="22" cy="13.8" r="1.3" fill="none" stroke="currentColor" stroke-width="1.4"/>
    <path d="M6 20c3 1.5 6 2 10 1.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.55"/>
  </svg>`,

  mortar: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <ellipse cx="16" cy="26" rx="9" ry="2.2" fill="currentColor" opacity="0.35"/>
    <path d="M9 24h14l-1.8-5.5H10.8L9 24z" fill="currentColor" opacity="0.9"/>
    <path d="M14.5 18.5V9.5l3-2.5v11.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M11 22l2.5-4M21 22l-2.5-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="16" cy="8.5" r="1.5" fill="currentColor" opacity="0.7"/>
  </svg>`,

  antiTankGun: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="9" cy="26" r="2.8" fill="currentColor"/>
    <circle cx="23" cy="26" r="2.8" fill="currentColor"/>
    <circle cx="9" cy="26" r="1.1" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.45"/>
    <circle cx="23" cy="26" r="1.1" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.45"/>
    <path d="M7 24.5L4 19l2-1 3.5 6.5M25 24.5l3-5.5-2-1-3.5 6.5" fill="currentColor" opacity="0.75"/>
    <rect x="12.5" y="11" width="3.5" height="14" rx="0.6" fill="currentColor" opacity="0.9"/>
    <rect x="11.8" y="10.2" width="5" height="2" rx="0.4" fill="currentColor" opacity="0.55"/>
    <path d="M16 12.5h13v2.2H16" fill="currentColor"/>
    <rect x="27" y="12.2" width="2.5" height="2.8" rx="0.4" fill="currentColor" opacity="0.7"/>
    <rect x="13.5" y="16.5" width="2" height="5" rx="0.3" fill="currentColor" opacity="0.45"/>
  </svg>`,

  armoredCar: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <path d="M5 17h22l-1.5-4.5H6.5L5 17z" fill="currentColor"/>
    <path d="M7 12.5h18l-1-3H8l-1 3z" fill="currentColor" opacity="0.8"/>
    <circle cx="10" cy="24" r="3" fill="currentColor"/>
    <circle cx="22" cy="24" r="3" fill="currentColor"/>
    <circle cx="10" cy="24" r="1.2" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.4"/>
    <circle cx="22" cy="24" r="1.2" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.4"/>
    <rect x="12" y="8.5" width="8" height="4.5" rx="0.8" fill="currentColor"/>
    <path d="M18 10.5h7v1.8h-7" fill="currentColor" opacity="0.85"/>
    <rect x="13" y="7.8" width="6" height="1.2" rx="0.3" fill="currentColor" opacity="0.5"/>
  </svg>`,

  tank: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <rect x="3" y="17" width="26" height="7.5" rx="1" fill="currentColor"/>
    <rect x="5" y="20" width="3.5" height="5.5" rx="0.5" fill="currentColor" opacity="0.85"/>
    <rect x="23.5" y="20" width="3.5" height="5.5" rx="0.5" fill="currentColor" opacity="0.85"/>
    <circle cx="9" cy="27" r="3" fill="currentColor"/>
    <circle cx="23" cy="27" r="3" fill="currentColor"/>
    <rect x="11" y="9.5" width="10" height="7" rx="1" fill="currentColor"/>
    <path d="M21 12.5h8v2.2H21" fill="currentColor"/>
    <path d="M6 17l3-4.5h14l3 4.5" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.45"/>
  </svg>`,

  tankDestroyer: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <rect x="2.5" y="18" width="27" height="7.5" rx="1" fill="currentColor"/>
    <circle cx="8" cy="27" r="3" fill="currentColor"/>
    <circle cx="24" cy="27" r="3" fill="currentColor"/>
    <path d="M6 18l6-7h11l4 7H6z" fill="currentColor" opacity="0.9"/>
    <path d="M19 12.5h12v2.2H19" fill="currentColor"/>
    <rect x="27.5" y="12" width="3.5" height="3.2" rx="0.4" fill="currentColor" opacity="0.7"/>
  </svg>`,

  superHeavyTank: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <rect x="2" y="17.5" width="28" height="8.5" rx="1" fill="currentColor"/>
    <rect x="4" y="21" width="4" height="6" rx="0.5" fill="currentColor" opacity="0.85"/>
    <rect x="24" y="21" width="4" height="6" rx="0.5" fill="currentColor" opacity="0.85"/>
    <circle cx="8.5" cy="28" r="3.3" fill="currentColor"/>
    <circle cx="23.5" cy="28" r="3.3" fill="currentColor"/>
    <rect x="9" y="7" width="14" height="9.5" rx="1" fill="currentColor"/>
    <path d="M23 10.5h8.5v2.8H23" fill="currentColor"/>
    <rect x="10" y="6" width="12" height="2" rx="0.5" fill="currentColor" opacity="0.5"/>
    <path d="M4 17.5l3.5-5h21l3.5 5" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.4"/>
  </svg>`,

  artillery: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="8.5" cy="26" r="3" fill="currentColor"/>
    <circle cx="23.5" cy="26" r="3" fill="currentColor"/>
    <circle cx="8.5" cy="26" r="1.2" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.4"/>
    <circle cx="23.5" cy="26" r="1.2" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.4"/>
    <path d="M6.5 24.5L3.5 18l2-1 4 7.5M25.5 24.5l3-6.5-2-1-4 7.5" fill="currentColor" opacity="0.75"/>
    <rect x="11" y="15.5" width="4.5" height="10" rx="0.6" fill="currentColor" opacity="0.9"/>
    <path d="M13.5 16.5l10-4.5 2.5 1-9 4.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="23.5" y="10.5" width="3" height="3" rx="0.5" fill="currentColor" opacity="0.65"/>
    <ellipse cx="15" cy="14" rx="2.5" ry="1.5" fill="currentColor" opacity="0.4"/>
  </svg>`,
};

export function getUnitIconMarkup(type) {
  return ICONS[type] ?? ICONS.infantry;
}
