/** Enemy battle plans for Battle Simulation (preset and manual) — varied combined-arms behavior. */

export const LAST_STAND_TACTICS = {
  armoredThrust: {
    id: 'armoredThrust',
    name: 'Armored Thrust',
    weight: 18,
    briefing: {
      intel:
        'Aerial reconnaissance reports enemy armor massing on the axis of advance. Tank companies appear to be forming for a central breakthrough, with towed anti-tank guns screening the flanks.',
      signal: 'Expect a massed armored push supported by infantry following the lead elements.',
    },
    stances: { line: 0.78, support: 0.88, arty: 0.94, recon: 0.18, armor: 0.12 },
    ai: {
      armorMode: 'center',
      armorFlankSpread: 12,
      lineFollowArmorMult: 1,
      infantryAdvanceMult: 0.55,
      openingHold: 16,
      probeDelay: 4,
      probeCommit: 0.24,
      attackCommitStart: 0.4,
      attackCommitStep: 0.2,
      reserveRatio: 0.28,
    },
  },
  defensiveBelt: {
    id: 'defensiveBelt',
    name: 'Defensive Belt',
    weight: 15,
    briefing: {
      intel:
        'Enemy forces are digging in along a prepared line. Mortar and artillery positions are registered on our approach routes; armor is held in reserve behind the main belt.',
      signal: 'Expect a stubborn defensive fight — probe for weak points before committing reserves.',
    },
    stances: { line: 0.9, support: 0.92, arty: 0.96, recon: 0.55, armor: 0.72 },
    ai: {
      armorMode: 'hold',
      armorFlankSpread: 8,
      lineFollowArmorMult: 0.35,
      infantryAdvanceMult: 0.25,
      openingHold: 26,
      probeDelay: 10,
      probeCommit: 0.18,
      attackCommitStart: 0.32,
      attackCommitStep: 0.12,
      reserveRatio: 0.42,
    },
  },
  infantryAssault: {
    id: 'infantryAssault',
    name: 'Infantry Assault',
    weight: 18,
    briefing: {
      intel:
        'Enemy rifle companies and machine-gun teams are forming for a coordinated foot assault with tanks held as fire support. The infantry are expected to bound with MGs rather than charge unsupported.',
      signal: 'Expect infantry and MG teams advancing under armor and mortar fire — keep anti-tank guns mobile but prioritize breaking up the combined assault.',
    },
    stances: { line: 0.22, support: 0.72, arty: 0.82, recon: 0.45, armor: 0.78 },
    ai: {
      armorMode: 'hold',
      armorFlankSpread: 10,
      lineFollowArmorMult: 0.85,
      infantryAdvanceMult: 0.7,
      openingHold: 14,
      probeDelay: 2,
      probeCommit: 0.22,
      attackCommitStart: 0.5,
      attackCommitStep: 0.18,
      reserveRatio: 0.26,
    },
  },
  flankingHook: {
    id: 'flankingHook',
    name: 'Flanking Hook',
    weight: 15,
    briefing: {
      intel:
        'Intercepted radio traffic suggests a wide envelopment. Reconnaissance elements are scouting our open flank while the center remains thinly held.',
      signal: 'Watch both flanks — enemy armor may attempt a hook around our line while fires fix the front.',
    },
    stances: { line: 0.74, support: 0.86, arty: 0.9, recon: 0.14, armor: 0.15 },
    ai: {
      armorMode: 'flank',
      armorFlankSpread: 30,
      lineFollowArmorMult: 0.65,
      infantryAdvanceMult: 0.5,
      openingHold: 18,
      probeDelay: 6,
      probeCommit: 0.22,
      attackCommitStart: 0.38,
      attackCommitStep: 0.18,
      reserveRatio: 0.3,
    },
  },
  reconnaissancePush: {
    id: 'reconnaissancePush',
    name: 'Reconnaissance Push',
    weight: 12,
    briefing: {
      intel:
        'Enemy armored cars and light reconnaissance units are pushing forward aggressively to locate our positions. Heavier armor is trailing the screen by several kilometers.',
      signal: 'Expect a cautious advance — recon first, then armor exploitation if contact is made.',
    },
    stances: { line: 0.8, support: 0.85, arty: 0.9, recon: 0.08, armor: 0.38 },
    ai: {
      armorMode: 'followRecon',
      armorFlankSpread: 16,
      lineFollowArmorMult: 0.5,
      infantryAdvanceMult: 0.45,
      openingHold: 10,
      probeDelay: 0,
      probeCommit: 0.34,
      attackCommitStart: 0.36,
      attackCommitStep: 0.16,
      reserveRatio: 0.32,
    },
  },
  firePreparation: {
    id: 'firePreparation',
    name: 'Fire Preparation',
    weight: 12,
    briefing: {
      intel:
        'Sound ranging places enemy mortar and artillery batteries registering on our sector. Infantry are holding in defilade while fires soften our positions.',
      signal: 'Expect a prolonged bombardment followed by a measured advance under smoke and HE.',
    },
    stances: { line: 0.62, support: 0.8, arty: 0.78, recon: 0.4, armor: 0.55 },
    ai: {
      armorMode: 'center',
      armorFlankSpread: 10,
      lineFollowArmorMult: 0.75,
      infantryAdvanceMult: 0.85,
      openingHold: 28,
      probeDelay: 8,
      probeCommit: 0.2,
      attackCommitStart: 0.38,
      attackCommitStep: 0.16,
      reserveRatio: 0.34,
    },
  },
  generalAdvance: {
    id: 'generalAdvance',
    name: 'General Advance',
    weight: 10,
    briefing: {
      intel:
        'Enemy command appears to be coordinating a broad front advance — all arms moving together rather than a single schwerpunkt. No obvious weak point yet.',
      signal: 'Expect steady pressure across the entire line — hold cohesion and trade ground carefully.',
    },
    stances: { line: 0.42, support: 0.58, arty: 0.68, recon: 0.28, armor: 0.32 },
    ai: {
      armorMode: 'center',
      armorFlankSpread: 20,
      lineFollowArmorMult: 0.9,
      infantryAdvanceMult: 1.15,
      openingHold: 18,
      probeDelay: 4,
      probeCommit: 0.28,
      attackCommitStart: 0.44,
      attackCommitStep: 0.2,
      reserveRatio: 0.26,
    },
  },
};

export const LAST_STAND_TACTIC_LIST = Object.values(LAST_STAND_TACTICS);

export function pickLastStandTactic() {
  let total = 0;
  for (const t of LAST_STAND_TACTIC_LIST) total += t.weight ?? 1;
  let roll = Math.random() * total;
  for (const t of LAST_STAND_TACTIC_LIST) {
    roll -= t.weight ?? 1;
    if (roll <= 0) return t;
  }
  return LAST_STAND_TACTIC_LIST[0];
}

export function getLastStandTactic(id) {
  return LAST_STAND_TACTICS[id] ?? LAST_STAND_TACTICS.armoredThrust;
}