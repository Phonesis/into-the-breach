/**
 * Faction-specific weapon audio profiles and sample resolution.
 * Multiple WAV files per profile → random pick per shot (with no-immediate-repeat).
 */

import { publicUrl } from '../lib/publicUrl.js';

/**
 * TEMP test mode: only *original* samples (ElevenLabs / baked masters).
 * Includes primary, -b, faction -f/-g extras, shared *-extra-*, SMG a/b/c,
 * explosion/impact variant gens.
 * Excludes offline pitch clones from expand-gun-variety (-c/-d/-e on rifles,
 * MGs, tanks, howitzers, etc.).
 * Set to false to restore the full mix including pitch clones.
 */
export const SFX_MASTERS_ONLY = true;

/**
 * True for original gens; false for offline pitch/EQ clones.
 */
export function isMasterSfxFile(file) {
  const stem = file.replace(/\.wav$/i, '');

  // Shared / extra ElevenLabs one-shots
  if (/-extra/i.test(stem)) return true;
  // Explosion / impact / atmos variant gens (all original EL)
  if (/^(explosion|impact|battle-atmos)/i.test(stem)) return true;

  const m = stem.match(/-([a-z])$/i);
  if (!m) return true; // primary master
  const letter = m[1].toLowerCase();

  // Secondary original master
  if (letter === 'b') return true;
  // Extra original ElevenLabs faction gens
  if (letter === 'f' || letter === 'g') return true;
  // SMG packs: all lettered variants are pure ElevenLabs gens
  if (/^smg/i.test(stem)) return true;
  // Extra original ElevenLabs rifle / MG gens beyond f/g
  if ((letter === 'h' || letter === 'i') && /^(rifle|mg)/i.test(stem)) return true;
  // Sustained full-auto MG concentrations (mg-*-long-a/b, mg-extra-long-*)
  if (/-long/i.test(stem) && /^mg/i.test(stem)) return true;

  // Offline pitch clones: -c / -d / -e on rifles, MGs, tanks, AT, mortars, howitzers
  if (letter === 'c' || letter === 'd' || letter === 'e') return false;

  return true;
}

function filterMasterFiles(files) {
  if (!SFX_MASTERS_ONLY || !files?.length) return files;
  const masters = files.filter(isMasterSfxFile);
  return masters.length ? masters : files;
}

/** Profile id → WAV file(s). Multiple files = random variation per shot. */
export const WEAPON_SAMPLE_FILES = {
  rifle: [
    'rifle.wav',
    'rifle-c.wav',
    'rifle-d.wav',
    'rifle-extra-a.wav',
    'rifle-extra-b.wav',
    'rifle-extra-c.wav',
    'rifle-extra-d.wav'],
  /** Squad SMG / automatic — infantry alternate; not full MG-team LMG. */
  smg: ['smg.wav', 'smg-b.wav', 'smg-d.wav', 'smg-e.wav'],
  smg_germany: [
    'smg-germany.wav',
    'smg-germany-b.wav',
    'smg-germany-c.wav',
    'smg-germany-d.wav',
    'smg-germany-e.wav'],
  smg_usa: ['smg-usa.wav', 'smg-usa-b.wav', 'smg-usa-c.wav', 'smg-usa-d.wav', 'smg-usa-e.wav'],
  smg_uk: ['smg-uk.wav', 'smg-uk-b.wav', 'smg-uk-c.wav', 'smg-uk-d.wav', 'smg-uk-e.wav'],
  smg_russia: [
    'smg-russia.wav',
    'smg-russia-b.wav',
    'smg-russia-c.wav',
    'smg-russia-d.wav',
    'smg-russia-e.wav'],
  mg: [
    'mg.wav',
    'mg-c.wav',
    'mg-d.wav',
    'mg-h.wav',
    'mg-i.wav',
    'mg-long-a.wav',
    'mg-long-b.wav',
    'mg-extra-a.wav',
    'mg-extra-b.wav',
    'mg-extra-c.wav',
    'mg-extra-d.wav',
    'mg-extra-long-a.wav',
    'mg-extra-long-b.wav',
  ],
  tank_75: ['tank.wav', 'tank-c.wav', 'tank-d.wav'],
  tank_57: ['tank.wav', 'tank-c.wav', 'tank-d.wav'],
  howitzer_105: ['artillery.wav', 'artillery-c.wav', 'artillery-d.wav'],
  howitzer_25pdr: ['artillery.wav', 'artillery-c.wav', 'artillery-d.wav'],

  rifle_germany: [
    'rifle-germany-el-01.wav',
    'rifle-germany-el-02.wav',
    'rifle-germany-el-03.wav',
    'rifle-germany-el-04.wav',
    'rifle-germany-el-05.wav',
    'rifle-germany-el-06.wav',
  ],
  rifle_usa: [
    'rifle-usa-el-01.wav',
    'rifle-usa-el-02.wav',
    'rifle-usa-el-03.wav',
    'rifle-usa-el-04.wav',
    'rifle-usa-el-05.wav',
    'rifle-usa-el-06.wav',
  ],
  rifle_uk: [
    'rifle-uk-el-01.wav',
    'rifle-uk-el-02.wav',
    'rifle-uk-el-03.wav',
    'rifle-uk-el-04.wav',
    'rifle-uk-el-05.wav',
    'rifle-uk-el-06.wav',
  ],
  rifle_russia: [
    'rifle-russia-el-01.wav',
    'rifle-russia-el-02.wav',
    'rifle-russia-el-03.wav',
    'rifle-russia-el-04.wav',
    'rifle-russia-el-05.wav',
    'rifle-russia-el-06.wav',
  ],

  mg_germany: [
    'mg-germany.wav',
    'mg-germany-b.wav',
    'mg-germany-c.wav',
    'mg-germany-d.wav',
    'mg-germany-e.wav',
    'mg-germany-f.wav',
    'mg-germany-g.wav',
    'mg-germany-h.wav',
    'mg-germany-i.wav',
    'mg-germany-long-a.wav',
    'mg-germany-long-b.wav',
    'mg-extra-a.wav',
    'mg-extra-b.wav',
    'mg-extra-c.wav',
    'mg-extra-d.wav',
    'mg-extra-long-a.wav',
    'mg-extra-long-b.wav',
  ],
  mg_usa: [
    'mg-usa.wav',
    'mg-usa-b.wav',
    'mg-usa-c.wav',
    'mg-usa-d.wav',
    'mg-usa-e.wav',
    'mg-usa-f.wav',
    'mg-usa-g.wav',
    'mg-usa-h.wav',
    'mg-usa-i.wav',
    'mg-usa-long-a.wav',
    'mg-usa-long-b.wav',
    'mg-extra-a.wav',
    'mg-extra-b.wav',
    'mg-extra-c.wav',
    'mg-extra-d.wav',
    'mg-extra-long-a.wav',
    'mg-extra-long-b.wav',
  ],
  mg_uk: [
    'mg-uk.wav',
    'mg-uk-b.wav',
    'mg-uk-c.wav',
    'mg-uk-d.wav',
    'mg-uk-e.wav',
    'mg-uk-f.wav',
    'mg-uk-g.wav',
    'mg-uk-h.wav',
    'mg-uk-i.wav',
    'mg-uk-long-a.wav',
    'mg-uk-long-b.wav',
    'mg-extra-a.wav',
    'mg-extra-b.wav',
    'mg-extra-c.wav',
    'mg-extra-d.wav',
    'mg-extra-long-a.wav',
    'mg-extra-long-b.wav',
  ],
  mg_russia: [
    'mg-russia.wav',
    'mg-russia-b.wav',
    'mg-russia-c.wav',
    'mg-russia-d.wav',
    'mg-russia-e.wav',
    'mg-russia-f.wav',
    'mg-russia-g.wav',
    'mg-russia-h.wav',
    'mg-russia-i.wav',
    'mg-russia-long-a.wav',
    'mg-russia-long-b.wav',
    'mg-extra-a.wav',
    'mg-extra-b.wav',
    'mg-extra-c.wav',
    'mg-extra-d.wav',
    'mg-extra-long-a.wav',
    'mg-extra-long-b.wav',
  ],

  tank_75_germany: [
    'tank-75-germany.wav',
    'tank-75-germany-c.wav',
    'tank-75-germany-d.wav'],
  tank_75_usa: ['tank-75-usa.wav', 'tank-75-usa-c.wav', 'tank-75-usa-d.wav'],
  tank_75_uk: ['tank-75-uk.wav', 'tank-75-uk-c.wav', 'tank-75-uk-d.wav'],
  tank_88_germany: [
    'tank-88-germany.wav',
    'tank-88-germany-c.wav',
    'tank-88-germany-d.wav'],
  tank_90_usa: ['tank-90-usa.wav', 'tank-90-usa-c.wav', 'tank-90-usa-d.wav'],
  tank_17pdr_uk: [
    'tank-17pdr-uk.wav',
    'tank-17pdr-uk-c.wav',
    'tank-17pdr-uk-d.wav'],
  tank_76_russia: [
    'tank-76-russia.wav',
    'tank-76-russia-c.wav',
    'tank-76-russia-d.wav'],
  tank_122_russia: [
    'tank-122-russia.wav',
    'tank-122-russia-c.wav',
    'tank-122-russia-d.wav'],

  td_88_germany: ['td-88-germany.wav'],
  td_76_usa: ['td-76-usa.wav'],
  td_17pdr_uk: ['td-17pdr-uk.wav'],
  td_100_russia: ['td-100-russia.wav'],
  td_mg_germany: ['td-mg-germany.wav'],
  td_mg_usa: ['td-mg-usa.wav'],
  td_mg_uk: ['td-mg-uk.wav'],

  at_75_germany: [
    'at-75-germany.wav',
    'at-75-germany-c.wav',
    'at-75-germany-d.wav'],
  at_57_usa: ['at-57-usa.wav', 'at-57-usa-c.wav', 'at-57-usa-d.wav'],
  at_57_uk: ['at-57-uk.wav', 'at-57-uk-c.wav', 'at-57-uk-d.wav'],
  at_76_russia: ['at-76-russia.wav', 'at-76-russia-c.wav', 'at-76-russia-d.wav'],

  mortar_germany: ['mortar-germany.wav', 'mortar-germany-c.wav', 'mortar-germany-d.wav'],
  mortar_usa: ['mortar-usa.wav', 'mortar-usa-c.wav', 'mortar-usa-d.wav'],
  mortar_uk: ['mortar-uk.wav', 'mortar-uk-c.wav', 'mortar-uk-d.wav'],
  mortar_russia: ['mortar-russia.wav', 'mortar-russia-c.wav', 'mortar-russia-d.wav'],

  howitzer_105_germany: [
    'howitzer-105-germany.wav',
    'howitzer-105-germany-c.wav',
    'howitzer-105-germany-d.wav'],
  howitzer_105_usa: [
    'howitzer-105-usa.wav',
    'howitzer-105-usa-c.wav',
    'howitzer-105-usa-d.wav'],
  howitzer_25pdr_uk: [
    'howitzer-25pdr-uk.wav',
    'howitzer-25pdr-uk-c.wav',
    'howitzer-25pdr-uk-d.wav'],
  howitzer_122_russia: [
    'howitzer-122-russia.wav',
    'howitzer-122-russia-c.wav',
    'howitzer-122-russia-d.wav'],
};

const PROFILE_FALLBACK = {
  rifle_germany: 'rifle',
  rifle_usa: 'rifle',
  rifle_uk: 'rifle',
  smg_germany: 'smg',
  smg_usa: 'smg',
  smg_uk: 'smg',
  smg_russia: 'smg',
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
  td_88_germany: 'tank_88_germany',
  td_76_usa: 'tank_75_usa',
  td_17pdr_uk: 'tank_17pdr_uk',
  td_100_russia: 'tank_122_russia',
  td_mg_germany: 'mg_germany',
  td_mg_usa: 'mg_usa',
  td_mg_uk: 'mg_uk',
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
  smg: 58,
  rifle: 68,
};

/**
 * Playback-rate jitter — tiny only (±~1.5–2.5%).
 * Larger swings made AI/offline variants sound fake or metallic.
 */
export function rateJitterForProfile(profile) {
  if (profile.startsWith('howitzer') || profile.startsWith('mortar')) {
    return { min: 0.985, span: 0.03 }; // 0.985–1.015
  }
  if (profile.startsWith('tank') || profile.startsWith('at')) {
    return { min: 0.985, span: 0.03 };
  }
  if (profile === 'mg' || profile.startsWith('mg_')) {
    return { min: 0.98, span: 0.04 }; // 0.98–1.02
  }
  if (profile === 'smg' || profile.startsWith('smg_')) {
    return { min: 0.985, span: 0.035 };
  }
  if (profile === 'rifle' || profile.startsWith('rifle_')) {
    return { min: 0.982, span: 0.036 }; // ~0.982–1.018
  }
  return { min: 0.985, span: 0.03 };
}

/** Volume jitter — light so firefights don't pump. */
export function volumeJitterForProfile(profile) {
  if (profile === 'mg' || profile.startsWith('mg_')) return 0.05;
  if (profile === 'smg' || profile.startsWith('smg_')) return 0.05;
  if (profile === 'rifle' || profile.startsWith('rifle_')) return 0.04;
  return 0.03;
}

/** All unique sample URLs to preload. */
export function getAllWeaponSampleUrls() {
  const seen = new Set();
  const urls = [];
  for (const files of Object.values(WEAPON_SAMPLE_FILES)) {
    for (const file of filterMasterFiles(files)) {
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

/** Squad SMG profile for infantry automatic fire (not MG-team LMG). */
export function smgProfileForFaction(factionId = 'germany') {
  const id = factionId ?? 'germany';
  if (id === 'usa' || id === 'uk' || id === 'germany' || id === 'russia') return `smg_${id}`;
  return 'smg';
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
  if (def?.type === 'antiTankGun' || def?.type === 'paratrooper') {
    if (def.weaponSound && WEAPON_SAMPLE_FILES[def.weaponSound]) return def.weaponSound;
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
  if (def?.type === 'tankDestroyer') {
    if (def.weaponSound && WEAPON_SAMPLE_FILES[def.weaponSound]) return def.weaponSound;
    return faction === 'germany'
      ? 'td_88_germany'
      : faction === 'usa'
        ? 'td_76_usa'
        : faction === 'uk'
          ? 'td_17pdr_uk'
          : 'td_100_russia';
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
  if (profile.startsWith('smg')) return 'smg';
  if (profile.startsWith('mg')) return 'mg';
  if (profile.startsWith('rifle')) return 'rifle';
  return profile;
}

/** Last picked file per profile — avoid back-to-back repeats in firefights. */
const _lastSampleByProfile = new Map();

/**
 * Prefer original masters far more often than pitch-shifted / extra variants.
 *  primary (rifle-germany.wav)  — highest
 *  secondary master (-b)        — high
 *  faction ElevenLabs (f/g)     — occasional
 *  shared extras / c/d/e        — rare spice
 */
export function sampleWeight(file) {
  const stem = file.replace(/\.wav$/i, '');
  // Longer full-auto concentrations — common enough to hear in firefights
  if (/-long/i.test(stem) && /^mg/i.test(stem)) return 2.6;
  if (/-extra-long/i.test(stem)) return 2.2;
  if (/-extra/i.test(stem)) return 1.2;
  const m = stem.match(/-([a-z])$/i);
  if (!m) return 8; // primary master
  const letter = m[1].toLowerCase();
  if (letter === 'b') return 6; // secondary master
  if (/^smg/i.test(stem)) return 5; // all SMG lettered gens are real EL
  if (letter === 'f' || letter === 'g' || letter === 'h' || letter === 'i') return 1.8;
  // c / d / e mild offline variants (rifle/mg)
  return 0.7;
}

function weightedPick(files) {
  let total = 0;
  const weights = files.map((f) => {
    const w = sampleWeight(f);
    total += w;
    return w;
  });
  let r = Math.random() * total;
  for (let i = 0; i < files.length; i++) {
    r -= weights[i];
    if (r <= 0) return files[i];
  }
  return files[files.length - 1];
}

export function pickSampleFile(profile, buffers) {
  const resolved = resolveProfileFallback(profile);
  const files = filterMasterFiles(
    WEAPON_SAMPLE_FILES[resolved] ?? WEAPON_SAMPLE_FILES[profile]
  );
  if (!files?.length) return null;

  const available = files.filter((f) => buffers[f.replace(/\.wav$/i, '')]);
  if (!available.length) return null;
  if (available.length === 1) return available[0];

  const last = _lastSampleByProfile.get(resolved);
  let pool = available;
  if (last && available.length > 1) {
    const without = available.filter((f) => f !== last);
    if (without.length) pool = without;
  }

  // Originals-only: still prefer primary/b over f/g/extra via weights
  const pick = weightedPick(pool);
  _lastSampleByProfile.set(resolved, pick);
  return pick;
}

export function minGapMsForProfile(profile) {
  if (profile.startsWith('mortar')) return PROFILE_MIN_GAP_MS.mortar;
  if (profile.startsWith('howitzer')) return PROFILE_MIN_GAP_MS.howitzer;
  if (profile.startsWith('tank') || profile.startsWith('at')) return PROFILE_MIN_GAP_MS.tank;
  if (profile === 'mg' || profile.startsWith('mg_')) return PROFILE_MIN_GAP_MS.mg;
  if (profile === 'smg' || profile.startsWith('smg_')) return PROFILE_MIN_GAP_MS.smg;
  if (profile === 'rifle' || profile.startsWith('rifle_')) return PROFILE_MIN_GAP_MS.rifle;
  return 75;
}

/** @deprecated use resolveWeaponProfile */
export function weaponProfileForDef(def, factionId = null) {
  return resolveWeaponProfile(def, factionId);
}
