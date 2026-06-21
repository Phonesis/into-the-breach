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
      'Use the <strong>Forces</strong> panel (left) or drag on the battlefield to select units. Each roster row shows an <strong>HP bar</strong> and percentage. The top-right <strong>Surrender</strong> button ends the battle as a defeat and returns you to the main menu.',
  },
  {
    id: 'modes',
    title: 'Game modes',
    body: [
      '<strong>Standard</strong> — Full skirmish vs AI on any map. Pick Easy, Medium, or Hard. On the theater screen choose <strong>Classic</strong> (single HQ — all unit types available) or <strong>Base Building</strong> (C&amp;C-style — construct depots to unlock armor, artillery, and medics). Longer-paced fights: tougher units, slower damage, slower income/production, larger opening armies (includes an anti-tank gun).',
      '<strong>Clear Defenses</strong> — Dug-in defenders across the map; <em>no enemy HQ</em>. Destroy every defender (includes dug-in AT guns). Your army stages behind your HQ; defenders hold fire ~10 s at start.',
      '<strong>Training Ground</strong> — No enemy AI. Practice orders, capture, production, fire missions, and fire support vs a passive practice HQ. Button reads <strong>Leave Training</strong> instead of Surrender.',
      '<strong>Assault &amp; Defend</strong> — Pick <strong>Attack</strong> or <strong>Defend</strong> after choosing the mode. Central frontline (★) starts with the defender; flanks are neutral. Both sides field anti-tank guns; defenders start with an extra AT piece. The top HUD shows your role, objective, and a <strong>countdown timer</strong>: defenders see <strong>Hold until</strong> (8 minutes); attackers see <strong>Defender reinforcements</strong> counting down the same window. <strong>Attackers</strong> win by capturing the frontline and holding it for <strong>45 seconds</strong>, destroying the defender HQ, or wiping defenders when they cannot reinforce. <strong>Defenders</strong> win if the 8-minute timer expires, the assault HQ is destroyed, or the assault army is eliminated with no way to rebuild.',
      '<strong>Tower Defence</strong> — On the theater screen choose <strong>Wave Mode</strong> (<strong>12 Waves</strong> or <strong>Endless</strong>) and <strong>Defence Style</strong>: <strong>Emplacements</strong> (no player army — spend <strong>defense points</strong> on bunkers, MG nests, mortar pits, AT guns, mines, wire, and artillery pits) or <strong>HQ Defense</strong> (spawn <strong>any unit type</strong> from your HQ with supplies — your troops <strong>cannot cross the frontline</strong> into enemy territory; if enemies breach your side the <strong>frontline retreats</strong> toward HQ). Assaults hit <strong>sections of the frontline</strong> from different angles; from roughly <strong>wave 10</strong> expect wider <strong>multi-sector flanking</strong>. Emplacement mode: guns fire automatically; <strong>barrage</strong> needs an artillery pit. HQ Defense: strafe/barrage available; earn supplies from HQ income and destroying attackers. Between waves, <strong>Start Wave Now</strong> skips the prepare timer. <strong>Emplacements</strong> — lose if the line is breached or HQ falls. <strong>HQ Defense</strong> — lose only if HQ is destroyed (12 waves still wins in standard mode).',
      '<strong>Battle Simulation</strong> — two deployment styles on the theater screen:',
      '<strong>Manual Deployment</strong> — <strong>2,000</strong> supplies per side on any map size. Pick units and <strong>LMB</strong> anywhere to place; the enemy deploys in parallel. <strong>Begin Battle</strong> when ready.',
      '<strong>Preset Battle Group</strong> — <strong>Large map only</strong>. Both sides field a full combined-arms force (~68 units each) in realistic echelons: rifle line, mortars/AT/artillery support, armor reserve. A <strong>field briefing</strong> (date, location, weather, enemy plan) appears before combat. Enemy AI picks one of several battle plans each engagement — armored thrust, defensive belt, infantry assault, flanking hook, recon push, fire preparation, or general advance. <strong>Begin Battle</strong> when ready.',
      'No HQ, capture points, or reinforcements in either style. Strafe and barrage unlock once battle begins. Win by destroying every enemy unit; lose if your army is wiped out.',
    ],
  },
  {
    id: 'battle-report',
    title: 'Battle report',
    body: [
      'When a match ends, the victory/defeat screen lists <strong>unit losses</strong> for both sides, broken down by type. If anyone took prisoners, it also shows <strong>prisoners captured</strong> per side (surrendered troops marched off the map).',
      '<strong>Tower Defence</strong> also tallies <strong>emplacements lost</strong> — bunkers, nests, wire, mines, and artillery pits destroyed during the battle. <strong>Endless</strong> Tower Defence shows how many waves you cleared before defeat.',
      'Infantry casualties count as <strong>personnel</strong> (five soldiers per infantry squad) in the totals, not just one vehicle per icon.',
      'Every mode shows an <strong>estimated materiel cost</strong> per side in approximate <strong>1944 USD</strong> (weapons, ammunition loads, vehicles, field construction). Figures are historical approximations for immersion, not exact procurement records.',
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
      ['Alt + Shift + LMB', 'Selected artillery fires a smoke shell at open ground — blocks enemy line of sight for 60s'],
      ['Esc', 'Cancel fire-support targeting, active unit fire missions, engineer field-work placement, base building construction, Battle Simulation placement, or pending TD build'],
      ['WASD / arrows', 'Pan camera · wheel zoom'],
      ['P', 'Pause / resume — camera still pans while paused; orders are blocked'],
      ['Tactical map', 'Bottom-right minimap — toggle with the header button; green = friendlies, red = enemies; fading yellow/red traces show live fire exchanges; click to pan the main camera (preference saved)'],
      ['Forces list', 'Click a unit row to select; Shift-click to add — each row shows an HP bar and %'],
      ['Field icons toggle', 'Forces panel header — show or hide unit-type icons and floating health bars above your troops (saved between sessions)'],
      ['Engage target', 'Confirm attack on highlighted enemy (selection panel)'],
      ['Launch Battle Now', 'Skip quiet-sector staging (countdown banner)'],
      ['Start Wave Now', 'Tower Defence — skip prepare countdown and begin the current wave'],
      ['Save', 'HUD top-right — store battle progress in this browser; resume from <strong>Load Saved Game</strong> on the title screen'],
      ['Load Saved Game', 'Title screen — resume a saved battle (faction, map, units, supplies, and timer restored)'],
      ['Surrender', 'Quit battle — counts as defeat, then Main Menu'],
      ['Strafe / Barrage', 'Arm fire support → LMB on map · Esc cancels'],
      ['Tablet / touch', 'Camera pad: pan, rotate, zoom · <strong>Target</strong> = tap enemy to highlight, tap again or Engage to attack · <strong>Fire</strong> = tap ground/cover (Shift+LMB) · long-press = move/attack · <code>?tablet=1</code> forces tablet UI'],
      ['Cheat mode', 'Type <code>iddqd</code> during a battle, or add <code>?cheat=1</code> to the URL before loading — unlimited supplies and instant builds (<code>iddqd</code> toggles off)'],
    ],
  },
  {
    id: 'battlefield-ui',
    title: 'Forces & battlefield UI',
    body: [
      'The <strong>Forces</strong> panel (left) lists every alive friendly unit with a <strong>health bar</strong> and percentage. Click a row to select; Shift-click to add to selection.',
      'The <strong>Field icons</strong> button in the Forces header toggles unit-type icons floating above your troops on the map. Your choice is remembered in the browser.',
      'When field icons are <strong>on</strong>, floating <strong>health bars</strong> also appear above damaged units (any team) and above your selected units (even at full HP). Fill color runs green → yellow → red as HP drops; borders tint blue (yours) or red (enemy), gold when selected.',
      'Turning field icons <strong>off</strong> hides both the icons and the world health bars. The Forces roster and bottom <strong>selection panel</strong> still show HP bars and numbers for selected units, groups, and HQ.',
      'Vehicles below <strong>50% HP</strong> (tanks, armored cars, artillery, towed guns) trail dark <strong>black engine smoke</strong> from the rear until an engineer repairs them or the vehicle is destroyed.',
      'Experienced units earn rank badges beside them (always shown, not tied to field icons): <strong>VET</strong> at <strong>1 kill</strong>, upgraded to <strong>ELITE</strong> at <strong>3 kills</strong>.',
      'Isolated foot troops under fire may <strong>surrender</strong>. Move friendlies close to liberate; enemies close to capture prisoners off the map (see Combat).',
      'On tablets and phones, a <strong>camera pad</strong> appears at the bottom-right for pan, rotate, and zoom. Use <strong>Target</strong> to pick enemies (tap twice or press Engage). Use <strong>Fire</strong> to order manual fire at ground or cover (like Shift+LMB). <strong>Long-press</strong> the map to move or attack (replaces right-click). Pinch to zoom.',
      'When your <strong>HQ is under heavy attack</strong>, a red alert banner appears at the top with HP and an alarm — pull units back to defend before the headquarters falls.',
    ],
  },
  {
    id: 'economy',
    title: 'Supplies & capture points',
    body: [
      'Supplies pay for reinforcements (top HUD). Your HQ generates passive income every second; each captured flank point adds more.',
      'Three capture zones per map (not used in Battle Simulation or Tower Defence). In Assault, the center frontline starts with the defender; flanks are neutral.',
      '<strong>Map size</strong> on the theater screen: <strong>Small</strong> (tight, close-quarters), <strong>Medium</strong> (default — expanded maneuver room), or <strong>Large</strong> (grand theater with long flanks). Larger maps scale bases, capture points, and deploy rings.',
      '<strong>Quiet sector</strong> (~32 s in Standard / Assault): no combat fire; all units stay inside the HQ staging ring. Click <strong>Launch Battle Now</strong> on the banner when ready. Clear Defenses uses a shorter ~10 s ceasefire for your side only.',
      'Up to <strong>four</strong> units queued at your HQ. Reinforcements spawn in a ring around the HQ when their timer finishes (or at the depot that unlocked them in Base Building mode).',
      'Standard mode uses slower income and ~1.65× longer build times so battles develop gradually.',
    ],
  },
  {
    id: 'base-building',
    title: 'Standard — Base Building',
    body: [
      'Choose <strong>Base Building</strong> on the theater screen (Standard only). Each side starts with a <strong>single infantry squad</strong> only. Click your <strong>HQ</strong> to train <strong>infantry</strong>; click a completed <strong>depot</strong> on the map to open that building\'s unit menu (e.g. Motor Pool → tanks).',
      '<strong>Field Hospital</strong> (185 supplies, ~42 s) — click when built to train <strong>medics</strong>. Max 2 per base.',
      '<strong>Ordnance Yard</strong> (220 supplies, ~48 s) — click when built to train <strong>MG teams</strong>, <strong>mortars</strong>, <strong>AT guns</strong>, and <strong>artillery</strong>. Max 1.',
      '<strong>Motor Pool</strong> (260 supplies, ~55 s) — click when built to train <strong>engineers</strong>, <strong>snipers</strong>, <strong>armored cars</strong>, <strong>tanks</strong>, and <strong>super heavies</strong>. Max 1. Damaged <strong>vehicles</strong> (tanks, cars, guns, artillery) within ~14 m slowly repair here, like infantry at a field hospital.',
      '<strong>Infantry Bunker</strong> (95 supplies, ~28 s) — no production; garrisons up to <strong>2</strong> foot troops (infantry, MG, sniper, medic). Move units onto a completed bunker to enter — they gain <strong>heavy cover</strong> and can fire out. Max 6 bunkers.',
      'Open the <strong>Base Construction</strong> panel (bottom HUD), pick a structure, then <strong>LMB</strong> the map in the ring around your HQ (not during quiet sector). Structures cost supplies upfront and take time to finish. Enemy AI expands its base the same way.',
      'Units spawn at the structure you selected when queuing them. Engineers can erect <strong>field bunkers</strong> (no supply cost) that garrison troops like HQ-built bunkers — sandbags are disabled in this mode.',
      'Enemy depots and bunkers can be attacked like any other target — click to order fire, or let units auto-acquire in range.',
    ],
  },
  {
    id: 'reinforcements',
    title: 'Reinforcements & defeat',
    body: [
      'Losing every unit on the field does <em>not</em> end the battle if your HQ stands and you can still reinforce (queue, affordable build, or income).',
      'Eliminated when your HQ is destroyed, or you have no units, empty queue, and cannot afford any unit with no income to recover.',
      'The enemy follows the same rule in Standard and Assault: wipe their army only sticks if their HQ is gone or they cannot produce.',
      'Enemy AI uses the same HQ production system — new units appear around the enemy HQ when builds complete.',
    ],
  },
  {
    id: 'combat',
    title: 'Combat',
    body: [
      'LMB on an enemy (with units selected) issues an attack. Hover highlights valid targets; use <strong>Engage target</strong> or LMB on the highlighted enemy.',
      '<strong>Shift + LMB</strong> orders manual fire for selected combat units in range: click <strong>cover</strong> (trees, hedges, bunkers) to destroy it, or <strong>open ground</strong> for a fire mission. Works for every fighting unit — infantry, tanks, AT guns, and artillery. A red reticle appears on the cursor while Shift is held. <strong>RMB move</strong> or <strong>Esc</strong> cancels active fire missions.',
      '<strong>Smoke shells</strong> (artillery counter to AT guns): select artillery → <strong>Smoke shell</strong> button or <strong>Alt+Shift+LMB</strong> on open ground. The howitzer fires one smoke round; a grey cloud lasts <strong>60 seconds</strong> (~200 m wide). Enemies firing through the screen have no clear line of sight — about <strong>82% of shots miss</strong> (blind fire). Advance infantry or tanks under the smoke to close on towed guns.',
      'Idle units auto-fire on enemies in range. Damage falls off with distance.',
      'Tanks and <strong>super heavy tanks</strong> carry a <strong>coax machine gun</strong> (~520 m) alongside the main gun — effective vs infantry and soft targets; tanks close on soft targets and use the coax instead of wasting main-gun rounds. Rifles and MGs cannot damage tanks — use AT guns, mortars, tank guns, or artillery. Super heavies are slower, tougher, and hit harder. <strong>Anti-tank guns</strong> (~600 m) are dangerous vs armor at medium range but reload slowly, fall off at long range, and are very weak vs infantry — close under smoke or swarm with riflemen. Mortars, tank guns, and artillery are strong anti-armor.',
      'Armored cars take partial small-arms damage (~32%) but die quickly to snipers, mortars, and tank guns.',
      'Damaged units may <strong>retreat</strong> toward their HQ (RETREAT tag) and stop attacking until safe. <strong>Medics</strong> nearby reduce retreat chance and slowly heal infantry, MG, mortar, and sniper teams — a <strong>green cross</strong> floats above units being healed. <strong>Engineers</strong> repair nearby vehicles, steady panicked tank and gun crews, and — when within ~16 m of a damaged <strong>HQ</strong> — restore headquarters HP (spanner icon on the engineer and HQ). Vehicles below half HP trail <strong>black engine smoke</strong> until repaired. Defenders in Clear Defenses do not retreat.',
      '<strong>Surrender:</strong> Foot troops and gun crews cut off from allies while taking fire may <strong>surrender</strong> (SURRENDER banner). They hold position, stop shooting, and are ignored by fire. Move a <strong>friendly within ~11 m</strong> to <strong>liberate</strong> them; let an <strong>enemy within ~11 m</strong> <strong>capture</strong> them — captured troops march off the map and count as casualties. Tanks, armored cars, and artillery never surrender. Dug-in Clear Defenses defenders never surrender.',
      '<strong>Veteran &amp; Elite:</strong> <strong>1 enemy kill</strong> promotes a unit to <strong>veteran</strong> (~9% more damage, steadier under fire, modest morale pressure on foes). <strong>3 kills</strong> upgrades them to <strong>elite</strong> (~18% damage, much less likely to retreat, stronger morale shock). Enemies hit by or fighting near veterans/elites are more likely to <strong>retreat or surrender</strong>. Rank persists on that unit; newly spawned reinforcements start fresh.',
      '<strong>Engineer field works:</strong> Select an engineer → <strong>Build sandbags</strong> or <strong>Build bunker</strong> → LMB within ~24 m. The engineer moves to the site and erects the position. <strong>Sandbags</strong> (~11 s) are quick heavy-cover fighting pits. <strong>Bunkers</strong> (~28 s) are sturdier emplacements that <strong>garrison foot troops</strong> (infantry, MG, sniper, medic) — move a squad onto the completed bunker to enter. Garrisoned units take heavy-cover reduction and can fire out; order a move to exit. In <strong>Base Building</strong> mode engineers can only build bunkers (max 6 per base, shared with HQ bunkers). Not available in Tower Defence. Esc cancels placement.',
      '<strong>Standard bunkers:</strong> Engineer field bunkers in <strong>Classic</strong> Standard, or <strong>Infantry Bunkers</strong> from HQ (95 supplies) in Base Building, garrison up to <strong>2</strong> foot troops each. Move units onto the bunker to enter; order a move away to exit.',
      'Destroyed units leave permanent wrecks on the field: <strong>burning tanks</strong>, <strong>fallen infantry bodies</strong> (faction camo, prone on the ground), and knocked-out vehicles. Cover and retreat markers disappear on death.',
      'Small-arms tracers only; tanks and artillery use impact VFX. Heavy fire can scar terrain (craters).',
    ],
  },
  {
    id: 'cover',
    title: 'Cover',
    body: [
      'Infantry and machine-gun teams only. Tanks, super heavies, anti-tank guns, mortars, and artillery ignore cover bonuses.',
      '<strong>Heavy</strong> ~22% damage taken (~78% reduction) — bunkers, sandbags (map props and engineer-built emplacements).',
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
      '<strong>Creeping barrage</strong> (~148 s cooldown) — Slower recharge; shells advance in lifts along your attack axis and concentrate maximum fire on the point you click.',
      'Click a strike type, then LMB on valid ground. Esc cancels targeting. Not available in Tower Defence (Emplacements) or during Battle Simulation deployment; available in Tower Defence HQ Defense.',
    ],
  },
  {
    id: 'units',
    title: 'Unit roster',
    intro:
      'Eleven unit types per faction (historical names differ). Icons match the Forces panel. Costs are supplies; build times are base seconds (longer in Standard).',
    units: true,
  },
  {
    id: 'difficulty',
    title: 'AI difficulty',
    body: [
      '<strong>Easy</strong> — Weaker enemy damage, fewer resources, slower AI production and attacks.',
      '<strong>Medium</strong> — Balanced default.',
      '<strong>Hard</strong> — Stronger firepower, faster AI, more aggressive captures and pushes.',
      'Standard pacing stacks on top of your difficulty choice for longer matches. Clear Defenses uses difficulty for defender strength; Training has no AI difficulty.',
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
    desc: 'Non-combat — repairs vehicles and damaged HQ within ~16 m; can erect sandbag pits or bunkers in the field (bunkers only in Base Building).',
    tags: ['Repair', 'Build', 'Support'],
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
    range: '~600–610 m',
    desc: 'Towed AT gun — strong vs armor at medium range; slow reload, weak vs infantry.',
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