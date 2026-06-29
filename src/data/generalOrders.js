/** Commander-wide orders issued to all player units. */

export const GENERAL_ORDER_COOLDOWN_SEC = 180;
export const GENERAL_ORDER_DURATION_SEC = 30;

/** Multiplier on panic-retreat chance while Hold Ground is active (not zero). */
export const HOLD_GROUND_RETREAT_MULT = 0.22;

export const GENERAL_ORDER_LIST = [
  {
    id: 'fullRetreat',
    short: 'Full Retreat',
    label: 'All units withdraw to HQ for 30 seconds',
  },
  {
    id: 'holdGround',
    short: 'Hold Ground',
    label: 'Troops stand firm — much less likely to panic-retreat for 30 seconds',
  },
];