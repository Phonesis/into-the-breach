/** In-game Field Manual — rendered into the guide overlay / menu screen. */

import { FACTION_LIST } from './factions.js';
import { getUnitIconMarkup } from '../ui/unitIcons.js';

export const GAME_GUIDE_SECTIONS = [
  {
    id: 'goal',
    title: 'Your objective',
    body: [
      'Hold your headquarters (HQ), earn supplies, train reinforcements, and defeat the enemy.',
      'Most modes: win by destroying the enemy HQ or eliminating their army when they cannot reinforce. Lose if your HQ falls, or you cannot rebuild after a total wipe (see Reinforcements).',
    ],
    callout:
      'Use the <strong>Forces</strong> panel (left) or drag on the battlefield to select units. The top-right <strong>Surrender</strong> button ends the battle as a defeat and returns you to the main menu.',
  },
  {
    id: 'modes',
    title: 'Game modes',
    body: [
      '<strong>Campaign</strong> — Full skirmish vs AI on any map. Pick Easy, Medium, or Hard. Longer-paced fights: tougher units, slower damage, slower income/production, larger opening armies (includes an anti-tank gun).',
      '<strong>Clear Defenses</strong> — Dug-in defenders across the map; <em>no enemy HQ</em>. Destroy every defender (includes dug-in AT guns). Your army stages behind your HQ; defenders hold fire ~10 s at start.',
      '<strong>Training Ground</strong> — No enemy AI. Practice orders, capture, production, fire missions, and fire support vs a passive practice HQ. Button reads <strong>Leave Training</strong> instead of Surrender.',
      '<strong>Assault &amp; Defend</strong> — Attack or Defend. Central frontline (★) must be seized or held. Both sides field anti-tank guns; defenders start with an extra AT piece. Attackers can also win by destroying the defender HQ or wiping defenders; defenders win by surviving 8 minutes, destroying the assault HQ, or eliminating the assault when they cannot reinforce.',
      '<strong>Tower Defence</strong> — No player army. Hold the frontline against 12 escalating waves. Spend <strong>defense points</strong> on bunkers, MG nests, AT guns, <strong>AT mines</strong> (vehicles only), barbed wire, and artillery pits. Emplacements <strong>take damage</strong> and can be <strong>upgraded</strong> (select with LMB → Upgrade) to heavier bunkers, .50 cal, 88 mm, razor wire, or 155 mm pits. Guns fire automatically; barrage needs an artillery pit. Lose if the line is breached or your HQ falls.',
      '<strong>Last Stand</strong> — <strong>2,000</strong> deployment supplies per side. Pick units and <strong>LMB</strong> anywhere on the map to place them; the enemy deploys in parallel. <strong>Begin Battle</strong> when ready. No HQ, capture points, reinforcements, or fire support. Win by destroying every enemy unit; lose if your army is wiped out.',
    ],
  },
  {
    id: 'controls',
    title: 'Controls',
    controls: [
      ['LMB', 'Select unit or HQ'],
      ['LMB drag', 'Box-select on the battlefield'],
      ['RMB', 'Move to ground, or attack enemy under cursor'],
      ['Shift + LMB', 'Fire at open ground or cover (trees, hedges, bunkers) — all combat units in range'],
      ['Esc', 'Cancel fire-support targeting, active unit fire missions, Last Stand placement, or pending TD build'],
      ['WASD / arrows', 'Pan camera · wheel zoom'],
      ['Forces list', 'Click a unit row to select; Shift-click to add'],
      ['Engage target', 'Confirm attack on highlighted enemy (selection panel)'],
      ['Launch Battle Now', 'Skip quiet-sector staging (countdown banner)'],
      ['Surrender', 'Quit battle — counts as defeat, then Main Menu'],
      ['Strafe / Barrage', 'Arm fire support → LMB on map · Esc cancels'],
    ],
  },
  {
    id: 'economy',
    title: 'Supplies & capture points',
    body: [
      'Supplies pay for reinforcements (top HUD). Your HQ generates passive income every second; each captured flank point adds more.',
      'Three capture zones per map (not used in Last Stand or Tower Defence). In Assault, the center frontline starts with the defender; flanks are neutral.',
      '<strong>Map size</strong> on the theater screen: <strong>Small</strong> (1×), <strong>Medium</strong> (1.75×, default), or <strong>Large</strong> (2.5×). Larger maps scale bases, capture points, and staging rings.',
      '<strong>Quiet sector</strong> (~32 s in Campaign / Assault): no combat fire; all units stay inside the HQ staging ring. Click <strong>Launch Battle Now</strong> on the banner when ready. Clear Defenses uses a shorter ~10 s ceasefire for your side only.',
      'Up to <strong>four</strong> units queued at your HQ. Reinforcements spawn in a ring around the HQ when their timer finishes.',
      'Campaign uses slower income and ~1.65× longer build times so battles develop gradually.',
    ],
  },
  {
    id: 'reinforcements',
    title: 'Reinforcements & defeat',
    body: [
      'Losing every unit on the field does <em>not</em> end the battle if your HQ stands and you can still reinforce (queue, affordable build, or income).',
      'Eliminated when your HQ is destroyed, or you have no units, empty queue, and cannot afford any unit with no income to recover.',
      'The enemy follows the same rule in Campaign and Assault: wipe their army only sticks if their HQ is gone or they cannot produce.',
      'Enemy AI uses the same HQ production system — new units appear around the enemy HQ when builds complete.',
    ],
  },
  {
    id: 'combat',
    title: 'Combat',
    body: [
      'LMB on an enemy (with units selected) issues an attack. Hover highlights valid targets; use <strong>Engage target</strong> or LMB on the highlighted enemy.',
      '<strong>Shift + LMB</strong> orders manual fire for selected combat units in range: click <strong>cover</strong> (trees, hedges, bunkers) to destroy it, or <strong>open ground</strong> for a fire mission. Works for every fighting unit — infantry, tanks, AT guns, and artillery. A red reticle appears on the cursor while Shift is held. <strong>RMB move</strong> or <strong>Esc</strong> cancels active fire missions.',
      'Idle units auto-fire on enemies in range. Damage falls off with distance.',
      'Tanks and <strong>super heavy tanks</strong> carry a <strong>coax machine gun</strong> (~520 m) alongside the main gun — effective vs infantry and soft targets; tanks close on soft targets and use the coax instead of wasting main-gun rounds. Rifles and MGs cannot damage tanks — use AT guns, mortars, tank guns, or artillery. Super heavies are slower, tougher, and hit harder. <strong>Anti-tank guns</strong> (~700 m) excel vs tanks and armored cars but are weak vs infantry. Mortars, tank guns, and artillery are strong anti-armor.',
      'Armored cars take partial small-arms damage (~32%) but die quickly to snipers, mortars, and tank guns.',
      'Damaged units may <strong>retreat</strong> toward their HQ (RETREAT tag) and stop attacking until safe. <strong>Medics</strong> nearby reduce retreat chance and slowly heal infantry, MG, mortar, and sniper teams — a <strong>green cross</strong> floats above units being healed. <strong>Engineers</strong> repair nearby vehicles and steady panicked tank and gun crews — a <strong>spanner</strong> icon shows while a vehicle is being repaired. Defenders in Clear Defenses do not retreat.',
      'Destroyed units leave wrecks on the field: <strong>burning tanks</strong>, fallen infantry squads, knocked-out vehicles. Cover and retreat markers disappear on death.',
      'Small-arms tracers only; tanks and artillery use impact VFX. Heavy fire can scar terrain (craters).',
    ],
  },
  {
    id: 'cover',
    title: 'Cover',
    body: [
      'Infantry and machine-gun teams only. Tanks, super heavies, anti-tank guns, mortars, and artillery ignore cover bonuses.',
      '<strong>Heavy</strong> ~22% damage taken (~78% reduction) — bunkers, sandbags.',
      '<strong>Medium</strong> ~38% — hedges, stone walls.',
      '<strong>Light</strong> ~55% — fighting pits, scrub.',
      'Bonus only while the unit stays in the zone. Use <strong>Shift + LMB</strong> on scenery to destroy cover objects. Selected infantry/MG show an <strong>IN COVER</strong> tag, foot ring, and % on the selection panel.',
    ],
  },
  {
    id: 'firesupport',
    title: 'Fire support',
    body: [
      'Off-map strikes from the HUD — no friendly fire on your units or HQ.',
      '<strong>Strafing run</strong> (~72 s cooldown) — Fighter pass with spatial fly-by audio and MG bursts along your line.',
      '<strong>Artillery barrage</strong> (~95 s cooldown) — Shell warnings, then clustered impacts.',
      'Click Strafe or Barrage, then LMB on valid ground. Esc cancels targeting. Not available in Last Stand or Tower Defence.',
    ],
  },
  {
    id: 'units',
    title: 'Unit roster',
    intro:
      'Eleven unit types per faction (historical names differ). Icons match the Forces panel. Costs are supplies; build times are base seconds (longer in Campaign).',
    units: true,
  },
  {
    id: 'difficulty',
    title: 'AI difficulty',
    body: [
      '<strong>Easy</strong> — Weaker enemy damage, fewer resources, slower AI production and attacks.',
      '<strong>Medium</strong> — Balanced default.',
      '<strong>Hard</strong> — Stronger firepower, faster AI, more aggressive captures and pushes.',
      'Campaign pacing stacks on top of your difficulty choice for longer matches. Clear Defenses uses difficulty for defender strength; Training has no AI difficulty.',
    ],
  },
];

/** Generic roster card data (faction-specific names shown in faction table). */
export const GUIDE_UNIT_CARDS = [
  {
    type: 'infantry',
    name: 'Infantry',
    cost: 50,
    build: 8,
    range: '400–500 m',
    desc: 'Rifle squads — cheap, flexible, excel in cover.',
    tags: ['Cover', 'Retreat'],
  },
  {
    type: 'medic',
    name: 'Medic',
    cost: 55,
    build: 9,
    range: '—',
    desc: 'Non-combat — heals foot troops within ~14 m; nearby allies retreat less often.',
    tags: ['Heal', 'Support'],
  },
  {
    type: 'engineer',
    name: 'Engineer',
    cost: 62,
    build: 10,
    range: '—',
    desc: 'Non-combat — repairs tanks, guns, and carriers within ~16 m; nearby vehicles retreat less often.',
    tags: ['Repair', 'Support'],
  },
  {
    type: 'machineGun',
    name: 'Machine gun',
    cost: 65,
    build: 10,
    range: '~1,000 m',
    desc: 'Sustained fire; strong defense and ground fire missions.',
    tags: ['Cover', 'Fire mission'],
  },
  {
    type: 'sniper',
    name: 'Sniper',
    cost: 72,
    build: 11,
    range: '~900–1,000 m',
    desc: 'Long-range precision; fragile, deadly vs infantry and cars.',
    tags: ['Cover'],
  },
  {
    type: 'mortar',
    name: 'Mortar',
    cost: 75,
    build: 12,
    range: '~1,800–2,000 m',
    desc: 'High-angle HE; infantry soft targets and light vehicles.',
    tags: ['Fire mission', 'Cratering'],
  },
  {
    type: 'antiTankGun',
    name: 'Anti-tank gun',
    cost: '80–82',
    build: '14–15',
    range: '~700–720 m',
    desc: 'Towed AT gun — bonus damage vs armor, weak vs infantry.',
    tags: ['Anti-armor', 'Hold position'],
  },
  {
    type: 'armoredCar',
    name: 'Armored car',
    cost: 88,
    build: 13,
    range: '~950–1,000 m',
    desc: 'Fast wheeled recon; MG armament; partial armor vs rifles.',
    tags: ['Fire mission', 'Fast'],
  },
  {
    type: 'tank',
    name: 'Tank',
    cost: 120,
    build: 18,
    range: '~1,200–1,500 m',
    desc: 'Main gun plus coax MG (~520 m) for infantry; weak to dedicated anti-tank.',
    tags: ['Fire mission', 'Wreck fire'],
  },
  {
    type: 'superHeavyTank',
    name: 'Super heavy tank',
    cost: '255–265',
    build: '27–29',
    range: '~1,450–1,600 m',
    desc: 'Heavy main gun plus coax MG; slow, very tough — highest supply cost.',
    tags: ['Fire mission', 'Wreck fire', 'Anti-armor'],
  },
  {
    type: 'artillery',
    name: 'Artillery',
    cost: 90,
    build: 14,
    range: '10–12 km',
    desc: 'Long-range bombardment; slow but devastating.',
    tags: ['Fire mission', 'Cratering'],
  },
];

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderUnitCard(entry) {
  const tags = (entry.tags ?? [])
    .map((t) => `<li class="guide-tag">${escapeHtml(t)}</li>`)
    .join('');
  return `
    <article class="guide-unit-card" data-type="${escapeHtml(entry.type)}">
      <div class="guide-unit-icon" aria-hidden="true">${getUnitIconMarkup(entry.type)}</div>
      <h4 class="guide-unit-name">${escapeHtml(entry.name)}</h4>
      <p class="guide-unit-meta">${escapeHtml(String(entry.cost))} supplies · ${escapeHtml(String(entry.build))}s build</p>
      <p class="guide-unit-range">${escapeHtml(entry.range)}</p>
      <p class="guide-unit-desc">${escapeHtml(entry.desc)}</p>
      ${tags ? `<ul class="guide-tag-list">${tags}</ul>` : ''}
    </article>
  `;
}

function renderFactionHeavyTable() {
  const rows = FACTION_LIST.map((f) => {
    const med = f.units.tank;
    const heavy = f.units.superHeavyTank;
    if (!med || !heavy) return '';
    return `
      <tr>
        <td><img class="guide-faction-flag" src="${escapeHtml(f.flag)}" alt="" width="28" height="18" loading="lazy" /> ${escapeHtml(f.name)}</td>
        <td>${escapeHtml(med.name)}</td>
        <td>${escapeHtml(heavy.name)}</td>
      </tr>
    `;
  }).join('');
  return `
    <div class="guide-faction-block">
      <h4 class="guide-subhead">Faction armor (medium vs super heavy)</h4>
      <table class="guide-table guide-faction-table">
        <thead><tr><th>Nation</th><th>Medium tank</th><th>Super heavy</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderFactionAtGunTable() {
  const rows = FACTION_LIST.map((f) => {
    const at = f.units.antiTankGun;
    if (!at) return '';
    const range = at.rangeMeters ? `${at.rangeMeters} m` : `${at.range * 10} m`;
    return `
      <tr>
        <td><img class="guide-faction-flag" src="${escapeHtml(f.flag)}" alt="" width="28" height="18" loading="lazy" /> ${escapeHtml(f.name)}</td>
        <td>${escapeHtml(at.name)}</td>
        <td>${escapeHtml(range)}</td>
        <td>${at.cost} · ${at.buildTime}s</td>
      </tr>
    `;
  }).join('');
  return `
    <div class="guide-faction-block">
      <h4 class="guide-subhead">Faction anti-tank guns</h4>
      <table class="guide-table guide-faction-table">
        <thead><tr><th>Nation</th><th>Designation</th><th>Range</th><th>Cost · build</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="guide-table-note">Towed guns hold position while firing. Strong vs tanks and armored cars; weak vs infantry.</p>
    </div>
  `;
}

function renderSection(section) {
  const parts = [];

  if (section.intro) {
    parts.push(`<p class="guide-intro">${section.intro}</p>`);
  }

  if (section.body?.length) {
    parts.push(section.body.map((p) => `<p>${p}</p>`).join(''));
  }

  if (section.callout) {
    parts.push(`<aside class="guide-callout">${section.callout}</aside>`);
  }

  if (section.controls?.length) {
    parts.push(`
      <table class="guide-table guide-controls-table">
        <tbody>
          ${section.controls
            .map(
              ([key, action]) =>
                `<tr><th scope="row">${escapeHtml(key)}</th><td>${action}</td></tr>`
            )
            .join('')}
        </tbody>
      </table>
    `);
  }

  if (section.units) {
    parts.push(
      `<div class="guide-unit-grid">${GUIDE_UNIT_CARDS.map(renderUnitCard).join('')}</div>`
    );
    parts.push(renderFactionHeavyTable());
    parts.push(renderFactionAtGunTable());
  }

  return `
    <section class="guide-section" id="guide-${section.id}">
      <h3>${escapeHtml(section.title)}</h3>
      ${parts.join('')}
    </section>
  `;
}

export function renderGameGuideHtml() {
  const nav = GAME_GUIDE_SECTIONS.map(
    (s) => `<a class="guide-nav-link" href="#guide-${s.id}">${escapeHtml(s.title)}</a>`
  ).join('');

  return `
    <nav class="guide-nav" aria-label="Field Manual sections">${nav}</nav>
    ${GAME_GUIDE_SECTIONS.map(renderSection).join('')}
  `;
}