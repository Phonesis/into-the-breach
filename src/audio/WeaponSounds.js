/**
 * Faction-specific weapon audio profiles and sample resolution.
 */

import { publicUrl } from '../lib/publicUrl.js';

/** Profile id → WAV file(s). Multiple files = random variation per shot. */
export const WEAPON_SAMPLE_FILES = {
  rifle: ['rifle.wav'],
  mg: ['mg.wav'],
  tank_75: ['tank.wav'],
  tank_57: ['tank.wav'],
  howitzer_105: ['artillery.wav'],
  howitzer_25pdr: ['artillery.wav'],

  rifle_germany: ['rifle-germany.wav', 'rifle-germany-b.wav'],
  rifle_usa: ['rifle-usa.wav', 'rifle-usa-b.wav'],
  rifle_uk: ['rifle-uk.wav', 'rifle-uk-b.wav'],

  mg_germany: ['mg-germany.wav', 'mg-germany-b.wav'],
  mg_usa: ['mg-usa.wav', 'mg-usa-b.wav'],
  mg_uk: ['mg-uk.wav', 'mg-uk-b.wav'],

  tank_75_germany: ['tank-75-germany.wav'],
  tank_75_usa: ['tank-75-usa.wav'],
  tank_75_uk: ['tank-75-uk.wav'],
  tank_88_germany: ['tank-88-germany.wav'],
  tank_90_usa: ['tank-90-usa.wav'],
  tank_17pdr_uk: ['tank-17pdr-uk.wav'],

  at_75_germany: ['at-75-germany.wav'],
  at_57_usa: ['at-57-usa.wav'],
  at_57_uk: ['at-57-uk.wav'],

  mortar_germany: ['mortar-germany.wav'],
  mortar_usa: ['mortar-usa.wav'],
  mortar_uk: ['mortar-uk.wav'],

  howitzer_105_germany: ['howitzer-105-germany.wav'],
  howitzer_105_usa: ['howitzer-105-usa.wav'],
  howitzer_25pdr_uk: ['howitzer-25pdr-uk.wav'],

  rifle_russia: ['rifle-russia.wav', 'rifle-russia-b.wav'],
  mg_russia: ['mg-russia.wav', 'mg-russia-b.wav'],
  tank_76_russia: ['tank-76-russia.wav'],
  tank_122_russia: ['tank-122-russia.wav'],
  at_76_russia: ['at-76-russia.wav'],
  mortar_russia: ['mortar-russia.wav'],
  howitzer_122_russia: ['howitzer-122-russia.wav'],
};

const PROFILE_FALLBACK = {
  rifle_germany: 'rifle',
  rifle_usa: 'rifle',
  rifle_uk: 'rifle',
  mg_germany: 'mg',
  mg_usa: 'mg',
  mg_uk: 'mg',
  tank_75_germany: 'tank_75',
  tank_75_usa: 'tank_75',
  tank_75_uk: 'tank_75',
  tank_88_germany: 'tank_75',
  tank_90_usa: 'tank_75',
  tank_17pdr_uk: 'tank_75',
  at_75_germany: 'tank_75',
  at_57_usa: 'tank_57',
  at_57_uk: 'tank_57',
  mortar_germany: 'howitzer_105',
  mortar_usa: 'howitzer_105',
  mortar_uk: 'howitzer_105',
  howitzer_105_germany: 'howitzer_105',
  howitzer_105_usa: 'howitzer_105',
  howitzer_25pdr_uk: 'howitzer_25pdr',
  rifle_russia: 'rifle',
  mg_russia: 'mg',
  tank_76_russia: 'tank_75',
  tank_122_russia: 'tank_75',
  at_76_russia: 'tank_75',
  mortar_russia: 'howitzer_105',
  howitzer_122_russia: 'howitzer_105',
};

const PROFILE_MIN_GAP_MS = {
  howitzer: 320,
  tank: 130,
  at: 130,
  mortar: 200,
  mg: 52,
  rifle: 68,
};

/** All unique sample URLs to preload. */
export function getAllWeaponSampleUrls() {
  const seen = new Set();
  const urls = [];
  for (const files of Object.values(WEAPON_SAMPLE_FILES)) {
    for (const file of files) {
      if (seen.has(file)) continue;
      seen.add(file);
      urls.push(publicUrl(`sounds/${file}`));
    }
  }
  return urls;
}

export function mgProfileForFaction(factionId = 'germany') {
  const id = factionId ?? 'germany';
  if (id === 'usa' || id === 'uk' || id === 'germany' || id === 'russia') return `mg_${id}`;
  return 'mg';
}

export function resolveWeaponProfile(def, factionId = null) {
  if (def?.weaponSound && WEAPON_SAMPLE_FILES[def.weaponSound]) {
    return def.weaponSound;
  }

  const faction = factionId ?? 'germany';

  if (def?.weaponSound === 'mortar' || def?.type === 'mortar') {
    return `mortar_${faction}`;
  }
  if (def?.weaponSound === 'mg' || def?.type === 'machineGun') {
    return mgProfileForFaction(faction);
  }
  if (def?.weaponSound === 'rifle' || def?.type === 'sniper') {
    return `rifle_${faction}`;
  }
  if (def?.type === 'artillery') {
    if (def.weaponSound === 'howitzer_122_russia' || (faction === 'russia' && def.caliber >= 120)) {
      return 'howitzer_122_russia';
    }
    if (def.weaponSound === 'howitzer_25pdr' || (faction === 'uk' && def.caliber === 88)) {
      return 'howitzer_25pdr_uk';
    }
    return `howitzer_105_${faction}`;
  }
  if (def?.type === 'antiTankGun') {
    if (faction === 'russia' || def.weaponSound === 'at_76_russia') return 'at_76_russia';
    if (def.caliber >= 70) return `at_75_${faction}`;
    return faction === 'germany' ? 'at_75_germany' : `at_57_${faction}`;
  }
  if (def?.type === 'superHeavyTank') {
    if (faction === 'russia' || def.weaponSound === 'tank_122_russia') return 'tank_122_russia';
    if (faction === 'germany' || def.caliber >= 88) return 'tank_88_germany';
    if (faction === 'usa' || def.caliber >= 85) return 'tank_90_usa';
    return 'tank_17pdr_uk';
  }
  if (def?.type === 'tank') {
    if (faction === 'russia' || def.weaponSound === 'tank_76_russia') return 'tank_76_russia';
    return `tank_75_${faction}`;
  }
  if (def?.type === 'armoredCar') {
    return mgProfileForFaction(faction);
  }
  if (def?.usesMG) {
    return mgProfileForFaction(faction);
  }
  return `rifle_${faction}`;
}

export function resolveProfileFallback(profile) {
  if (WEAPON_SAMPLE_FILES[profile]) return profile;
  if (PROFILE_FALLBACK[profile]) return PROFILE_FALLBACK[profile];
  if (profile.startsWith('howitzer')) return 'howitzer_105';
  if (profile.startsWith('tank') || profile.startsWith('at')) return 'tank_75';
  if (profile.startsWith('mortar')) return 'howitzer_105';
  if (profile.startsWith('mg')) return 'mg';
  if (profile.startsWith('rifle')) return 'rifle';
  return profile;
}

export function pickSampleFile(profile, buffers) {
  const resolved = resolveProfileFallback(profile);
  const files = WEAPON_SAMPLE_FILES[resolved] ?? WEAPON_SAMPLE_FILES[profile];
  if (!files?.length) return null;

  const available = files.filter((f) => buffers[f.replace(/\.wav$/i, '')]);
  if (!available.length) return null;
  return available[Math.floor(Math.random() * available.length)];
}

export function minGapMsForProfile(profile) {
  if (profile.startsWith('mortar')) return PROFILE_MIN_GAP_MS.mortar;
  if (profile.startsWith('howitzer')) return PROFILE_MIN_GAP_MS.howitzer;
  if (profile.startsWith('tank') || profile.startsWith('at')) return PROFILE_MIN_GAP_MS.tank;
  if (profile === 'mg' || profile.startsWith('mg_')) return PROFILE_MIN_GAP_MS.mg;
  if (profile === 'rifle' || profile.startsWith('rifle_')) return PROFILE_MIN_GAP_MS.rifle;
  return 75;
}

/** @deprecated use resolveWeaponProfile */
export function weaponProfileForDef(def, factionId = null) {
  return resolveWeaponProfile(def, factionId);
}