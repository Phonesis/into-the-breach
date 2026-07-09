/** In-game Field Manual — rendered into the guide overlay / menu screen. */

import { FACTION_LIST } from './factions.js';
import { PARATROOPER_DEFS } from './paratroopers.js';
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
      '<strong>Standard</strong> — Full skirmish vs AI on any map. Pick Easy, Medium, or Hard. On the theater screen choose <strong>Classic</strong> (single HQ — all unit types from headquarters) or <strong>Base Building</strong> (<strong>Large map only</strong> — build an <strong>Infantry Garrison</strong> and depots from HQ; train units at completed structures; expand at <strong>captured sectors</strong>). Both styles start <strong>each side</strong> with a <strong>single infantry squad</strong> only. Longer-paced fights: tougher units, slower damage, slower income/production.',
      '<strong>Clear Defenses</strong> — Dug-in defenders across the map; <em>no HQ on either side</em>. You deploy a <strong>fixed attack force</strong> — <strong>no reinforcements</strong> and no supply economy. Destroy every defender (includes dug-in AT guns). Your force stages in the rear assembly area; defenders hold fire ~10 s at start. <strong>Lose if every attacker is wiped out</strong>.',
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
      ['RMB', 'Move to ground, attack enemy under cursor, or mount infantry on a friendly tank'],
      ['RMB (infantry → tank)', 'With only foot troops selected, RMB a friendly tank to ride on the hull (2 riders per tank, 3 on super heavies)'],
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
      ['Fire support', 'Strafe, Barrage, Creep, or Airborne → LMB on map · Esc cancels'],
      ['General Orders', 'HUD panel below Fire Support — Full Retreat, Hold Ground (3 min cooldown each, 30 s effect), and Seek Cover toggle'],
      ['Auto Build', 'Reinforcements panel (Standard only) — toggle to automatically fill the HQ queue with a balanced combined-arms mix'],
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
      'Three capture zones per map (not used in Battle Simulation or Tower Defence). In <strong>Standard</strong>, all three start <strong>neutral</strong> — fight to secure the flanks for extra supplies. In Assault, the center frontline starts with the defender; flanks are neutral.',
      '<strong>Map size</strong> on the theater screen: <strong>Small</strong> (tight, close-quarters), <strong>Medium</strong> (default — expanded maneuver room), or <strong>Large</strong> (grand theater with long flanks). Larger maps scale bases, capture points, and deploy rings.',
      '<strong>Quiet sector</strong> (~32 s in Standard / Assault): no combat fire; both sides stay inside the HQ staging ring. <strong>Neither side</strong> can queue reinforcements or build base structures (in-progress construction pauses) until battle begins. Move orders only reposition troops in a <strong>tight ring around your HQ</strong> — not toward capture points (captures are frozen until launch). Click <strong>Launch Battle Now</strong> when ready (or wait for the timer). <strong>Clear Defenses</strong> uses a shorter ~10 s ceasefire: your force stays in the <strong>assembly ring</strong> (no player HQ); defenders hold fire until you launch or the timer ends.',
      'In <strong>Classic</strong> Standard each side begins with one infantry squad at HQ — train the rest from the Reinforcements panel as supplies accrue (the AI does the same from its HQ).',
      'Up to <strong>four</strong> units queued at your HQ. Reinforcements spawn in a ring around the HQ when their timer finishes (or at the depot that unlocked them in Base Building mode).',
      '<strong>Auto Build</strong> (Standard — Classic and Base Building): toggle in the Reinforcements panel header. When <strong>On</strong>, the game keeps the queue full (up to four slots) with a realistic combined-arms mix — infantry backbone, MG and mortar support, AT, armor, artillery, medics, and engineers — weighted by what you already have on the field and what you can afford. You can still click unit buttons to queue manually; auto build only fills empty slots. <strong>Off by default in Base Building</strong> so you can afford depots first; Classic remembers its own setting separately. Restored with saved games. Not available in Training, Assault, Tower Defence, or Battle Simulation.',
      'Standard mode uses slower income and ~1.65× longer build times so battles develop gradually.',
    ],
  },
  {
    id: 'base-building',
    title: 'Standard — Base Building',
    body: [
      'Choose <strong>Base Building</strong> on the theater screen (<strong>Standard</strong> on a <strong>Large</strong> map only). Each side starts with a <strong>single infantry squad</strong> at HQ. Click your <strong>HQ</strong> and use <strong>Base Construction</strong> to place structures — build an <strong>Infantry Garrison</strong> first to train more rifle squads. Click a completed <strong>garrison or depot</strong> on the map to open that building\'s unit menu (e.g. Motor Pool → tanks).',
      '<strong>Infantry Garrison</strong> (130 supplies, ~38 s) — click when built to train <strong>infantry squads</strong>; new units spawn at the garrison. Max 1 per base. Destroying the enemy garrison stops their rifle production.',
      '<strong>Field Hospital</strong> (185 supplies, ~42 s) — click when built to train <strong>medics</strong>. Max 2 per base.',
      '<strong>Ordnance Yard</strong> (220 supplies, ~48 s) — click when built to train <strong>MG teams</strong>, <strong>mortars</strong>, <strong>AT guns</strong>, and <strong>artillery</strong>. Max 1.',
      '<strong>Motor Pool</strong> (260 supplies, ~55 s) — click when built to train <strong>engineers</strong>, <strong>snipers</strong>, <strong>armored cars</strong>, <strong>tanks</strong>, and <strong>super heavies</strong>. Max 1. Damaged <strong>vehicles</strong> (tanks, cars, guns, artillery) within ~14 m slowly repair here, like infantry at a field hospital.',
      '<strong>Infantry Bunker</strong> (95 supplies, ~28 s) — no production; garrisons up to <strong>2</strong> foot troops (infantry, MG, sniper, medic). Move units onto a completed bunker to enter — they gain <strong>heavy cover</strong> and can fire out. Max 6 bunkers.',
      'Open the <strong>Base Construction</strong> panel (bottom HUD), pick a structure, then <strong>LMB</strong> the map in the build ring around your <strong>HQ</strong> or any <strong>capture sector you control</strong> — secure flanks to erect forward depots and bunkers. During <strong>quiet sector</strong> neither side may start or progress base construction — launch battle first. Structures cost supplies upfront and take time to finish once the battle is underway. Enemy AI expands the same way at HQ and sectors it holds.',
      'Units spawn at the structure you selected when queuing them. Engineers can erect <strong>field bunkers</strong> (no supply cost) that garrison troops like HQ-built bunkers — sandbags are disabled in this mode.',
      '<strong>Auto Build</strong> works here too: once depots are online it queues from every unlocked building (not only the one you last clicked), spawning at the correct depot automatically.',
      'Enemy depots and bunkers can be attacked like any other target — click to order fire, or let units auto-acquire in range. Destroyed structures leave <strong>rubble and scorched foundations</strong> on the map; you can rebuild nearby (destroyed buildings no longer count toward caps).',
    ],
  },
  {
    id: 'reinforcements',
    title: 'Reinforcements & defeat',
    body: [
      'Losing every unit on the field does <em>not</em> end the battle if your HQ stands and you can still reinforce (queue, affordable build, or income). <strong>Clear Defenses</strong> is an exception — fixed force, no queue; lose when every attacker is gone.',
      'Eliminated when your HQ is destroyed, or you have no units, empty queue, and cannot afford any unit with no income to recover.',
      'The enemy follows the same rule in Standard and Assault: wipe their army only sticks if their HQ is gone or they cannot produce.',
      'In <strong>Classic</strong>, enemy AI trains from its HQ — new units appear around headquarters when builds complete. In <strong>Base Building</strong>, the AI builds structures at HQ and captured sectors and spawns at the matching depot or garrison.',
    ],
  },
  {
    id: 'combat',
    title: 'Combat',
    body: [
      'LMB on an enemy (with units selected) issues an attack. Hover highlights valid targets; use <strong>Engage target</strong> or LMB on the highlighted enemy. Click the <strong>enemy HQ</strong> directly, or click the ground within ~18 m of it — units in range fire on the headquarters until it is destroyed (enemy defeat). RMB near the HQ also issues an attack order instead of a move.',
      '<strong>Shift + LMB</strong> orders manual fire for selected combat units in range: click <strong>cover</strong> (trees, hedges, bunkers) to destroy it, or <strong>open ground</strong> for a fire mission. Works for every fighting unit — infantry, tanks, AT guns, and artillery. A red reticle appears on the cursor while Shift is held. <strong>RMB move</strong> or <strong>Esc</strong> cancels active fire missions.',
      '<strong>Smoke shells</strong> (artillery counter to AT guns): select artillery → <strong>Smoke shell</strong> button or <strong>Alt+Shift+LMB</strong> on open ground. The howitzer fires one smoke round; a grey cloud lasts <strong>60 seconds</strong> (~200 m wide). Enemies firing through the screen have no clear line of sight — about <strong>82% of shots miss</strong> (blind fire). Advance infantry or tanks under the smoke to close on towed guns.',
      'Idle units auto-fire on enemies in range. Damage falls off with distance.',
      'Tanks and <strong>super heavy tanks</strong> carry a <strong>coax machine gun</strong> (~520 m) alongside the main gun — effective vs infantry and soft targets; tanks close on soft targets and use the coax instead of wasting main-gun rounds. Rifles and MGs cannot damage tanks — use AT guns, mortars, tank guns, or artillery. Super heavies are slower, tougher, and hit harder. <strong>Anti-tank guns</strong> (~600 m) are dangerous vs armor at medium range but reload slowly, fall off at long range, and are very weak vs infantry — close under smoke or swarm with riflemen. Mortars, tank guns, and artillery are strong anti-armor.',
      '<strong>Tank riders:</strong> Select <strong>foot troops only</strong> (infantry, paratrooper, MG, sniper, medic, engineer) and <strong>RMB</strong> a friendly <strong>tank</strong> or <strong>super heavy</strong> to mount the rear deck — up to <strong>2</strong> riders on a medium tank, <strong>3</strong> on a super heavy. Riders are visible on the hull, can fire while mounted, and move with the tank. Select a <strong>stationary</strong> tank with riders and press <strong>Dismount infantry</strong> in the selection panel to bail them out. If the tank comes under fire, riders <strong>auto-dismount</strong> beside the vehicle. Order a rider to move elsewhere to dismount individually.',
      'Armored cars take partial small-arms damage (~32%) but die quickly to snipers, mortars, and tank guns.',
      'Damaged units may <strong>retreat</strong> toward their HQ (RETREAT tag) and stop attacking until safe. <strong>Medics</strong> nearby reduce retreat chance and slowly heal infantry, MG, mortar, and sniper teams — a <strong>green cross</strong> floats above units being healed. <strong>Engineers</strong> repair nearby vehicles, steady panicked tank and gun crews, and — when within ~16 m of a damaged <strong>HQ</strong> — restore headquarters HP (spanner icon on the engineer and HQ). Vehicles below half HP trail <strong>black engine smoke</strong> until repaired. Defenders in Clear Defenses do not retreat. Use <strong>General Orders</strong> (see below) to pull everyone back or stiffen the line during a push.',
      '<strong>Surrender:</strong> Foot troops and gun crews cut off from allies while taking fire may <strong>surrender</strong> (SURRENDER banner). They hold position, stop shooting, and are ignored by fire. Move a <strong>friendly within ~11 m</strong> to <strong>liberate</strong> them; let an <strong>enemy within ~11 m</strong> <strong>capture</strong> them — captured troops march off the map and count as casualties. Tanks, armored cars, and artillery never surrender. Dug-in Clear Defenses defenders never surrender.',
      '<strong>Veteran &amp; Elite:</strong> <strong>1 enemy kill</strong> promotes a unit to <strong>veteran</strong> (~9% more damage, steadier under fire, modest morale pressure on foes). <strong>3 kills</strong> upgrades them to <strong>elite</strong> (~18% damage, much less likely to retreat, stronger morale shock). Enemies hit by or fighting near veterans/elites are more likely to <strong>retreat or surrender</strong>. Rank persists on that unit; newly spawned reinforcements start fresh.',
      '<strong>Engineer field works:</strong> Select an engineer → <strong>Build sandbags</strong> or <strong>Build bunker</strong> → LMB within ~24 m. The engineer moves to the site and erects the position. <strong>Sandbags</strong> (~11 s) are quick heavy-cover fighting pits. <strong>Bunkers</strong> (~28 s) are sturdier emplacements that <strong>garrison foot troops</strong> (infantry, MG, sniper, medic) — move a squad onto the completed bunker to enter. Garrisoned units take heavy-cover reduction and can fire out; order a move to exit. In <strong>Base Building</strong> mode engineers can only build bunkers (max 6 per base, shared with HQ bunkers). Not available in Tower Defence. Esc cancels placement.',
      '<strong>Standard bunkers:</strong> Engineer field bunkers in <strong>Classic</strong> Standard, or <strong>Infantry Bunkers</strong> from Base Construction (95 supplies) in Base Building — place near HQ or a sector you hold. Garrison up to <strong>2</strong> foot troops each. Move units onto the bunker to enter; order a move away to exit.',
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
      '<strong>Seek Cover</strong> (General Orders panel) — toggle <strong>On</strong> so infantry, MG, sniper, medic, and engineer <strong>move orders</strong> route to the nearest cover near your click (hedges, pits, sandbags, bunkers) instead of open ground. Tanks and other vehicles still go where you click. Preference is saved in the browser.',
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
      '<strong>Airborne drop</strong> (~118 s cooldown) — A transport passes overhead; <strong>five elite paratrooper squads</strong> (four men each) descend by parachute on your target zone. They are <strong>not</strong> built from HQ — only called this way. On landing they fight with <strong>rifles and squad LMG</strong> vs infantry and <strong>anti-tank launchers</strong> (Panzerfaust, bazooka, PIAT, RPG-43, etc. by nation) vs tanks and armored cars. AT shots reload slowly (~4.5 s).',
      'Click a strike type, then LMB on valid ground. Esc cancels targeting. Not available in Tower Defence (Emplacements) or during Battle Simulation deployment; available in Tower Defence HQ Defense.',
    ],
  },
  {
    id: 'generalorders',
    title: 'General orders',
    body: [
      'Command-wide orders from the <strong>General Orders</strong> HUD panel (below Fire Support, collapsible like that panel). One order active at a time; each button has a <strong>3-minute cooldown</strong> and the effect lasts <strong>30 seconds</strong>. Either order can be <strong>cancelled early</strong> — click the same button again (it reads <strong>Cancel Retreat</strong> or <strong>Cancel Hold</strong>) or press <strong>Esc</strong>.',
      '<strong>Full Retreat</strong> — Every friendly unit is ordered to withdraw toward your HQ immediately. For the full 30 s, any unit not yet at HQ is kept retreating (overrides manual move orders until cancelled or the timer ends). Cancelling stops the withdrawal and troops accept new orders. Use when a push fails or the line must fall back in one motion.',
      '<strong>Hold Ground</strong> — Troops are ordered to stand firm. Panic-retreat chance is greatly reduced for 30 s but <strong>not eliminated</strong> — battered or isolated units can still break. Cancel if the situation changes and you need normal morale again. Use before a major advance so riflemen and gun crews stay on the objective.',
      '<strong>Seek Cover</strong> — Persistent toggle (no cooldown). When <strong>On</strong>, right-click move orders for cover-capable foot troops snap to the nearest cover zone near the destination. When <strong>Off</strong>, units move to the ground you clicked. Does not affect tanks, guns, or artillery. Saved between sessions.',
      'Cooldown orders (Retreat / Hold) are not available in Tower Defence (Emplacements) or during Battle Simulation deployment; <strong>Seek Cover</strong> is available in any mode with move orders. Retreat and Hold are available in Tower Defence HQ Defense, Standard, Assault, Clear Defenses, Training, and Last Stand.',
    ],
  },
  {
    id: 'units',
    title: 'Unit roster',
    intro:
      'Eleven buildable unit types per faction (historical names differ). <strong>Airborne paratroopers</strong> are fire-support only (see Fire support). Icons match the Forces panel. Costs are supplies; build times are base seconds (longer in Standard).',
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
  {
    type: 'paratrooper',
    name: 'Airborne AT team',
    cost: 'Fire support',
    build: '—',
    range: '~400 m',
    desc: 'Elite paratroopers from Airborne Drop only — rifles/LMG vs soft targets; faction AT launcher vs armor. Cannot be trained at HQ.',
    tags: ['Fire support', 'Anti-armor', 'Dual weapon'],
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

function renderFactionParatrooperTable() {
  const rows = FACTION_LIST.map((f) => {
    const para = PARATROOPER_DEFS[f.id];
    if (!para) return '';
    return `
      <tr>
        <td><img class="guide-faction-flag" src="${escapeHtml(f.flag)}" alt="" width="28" height="18" loading="lazy" /> ${escapeHtml(f.name)}</td>
        <td>${escapeHtml(para.designation)}</td>
        <td>${para.rangeMeters ?? para.range * 10} m</td>
      </tr>
    `;
  }).join('');
  return `
    <div class="guide-faction-block">
      <h4 class="guide-subhead">Faction airborne teams (fire support only)</h4>
      <table class="guide-table guide-faction-table">
        <thead><tr><th>Nation</th><th>Designation</th><th>Combat range</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="guide-table-note">Dropped via <strong>Airborne</strong> fire support — five squads per call.</p>
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
    parts.push(renderFactionParatrooperTable());
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