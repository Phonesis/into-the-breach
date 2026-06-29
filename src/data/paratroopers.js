/** Elite airborne AT teams called in via fire support — faction-specific launchers. */

const BASE = {
  type: 'paratrooper',
  hp: 98,
  damage: 22,
  smallArmsDamage: 14,
  mgDamage: 11,
  range: 40,
  rangeMeters: 400,
  speed: 4.6,
  attackSpeed: 1.25,
  atAttackSpeed: 0.22,
  usesMG: true,
  antiArmor: true,
  antiArmorMult: 1.44,
  softMult: 0.58,
  nonCombat: false,
};

export const PARATROOPER_DEFS = {
  germany: {
    ...BASE,
    name: 'Fallschirmjäger AT',
    designation: 'Fallschirmjäger — Panzerfaust 60',
    description: 'Elite paratroopers — Kar98k/LMG fire vs infantry, Panzerfaust vs armor.',
    weaponSound: 'at_75_germany',
    caliber: 60,
  },
  usa: {
    ...BASE,
    name: 'Airborne Bazooka',
    designation: 'U.S. Airborne — M1A1 Bazooka team',
    description: 'Elite paratroopers — M1 Garand/BAR vs infantry, bazooka vs armor.',
    weaponSound: 'at_57_usa',
    caliber: 60,
  },
  uk: {
    ...BASE,
    name: 'Airborne PIAT',
    designation: 'British Airborne — PIAT section',
    description: 'Elite paratroopers — Lee-Enfield/Bren vs infantry, PIAT vs armor.',
    weaponSound: 'at_57_uk',
    caliber: 76,
  },
  russia: {
    ...BASE,
    name: 'Airborne AT',
    designation: 'Red Army airborne — RPG-43 AT team',
    description: 'Elite paratroopers — rifles/LMG vs infantry, RPG-43 vs armor.',
    weaponSound: 'at_76_russia',
    caliber: 76,
  },
};

export function getParatrooperDef(factionId = 'usa') {
  return PARATROOPER_DEFS[factionId] ?? PARATROOPER_DEFS.usa;
}