/** In-game Field Manual — rendered into the guide overlay / menu screen. */

import { FACTION_LIST } from './factions.js';
import { PARATROOPER_DEFS } from './paratroopers.js';
import { getUnitIconMarkup } from '../ui/unitIcons.js';

export const GAME_GUIDE_SECTIONS = [
  {
    id: 'goal',
    title: 'Your objective',
    body: [
      'Your mission is straightforward: hold your headquarters (HQ), secure supplies, train reinforcements, and defeat the enemy. In <strong>every game mode</strong>, the opposing force comes from nations that historically fought in that theater: Western Allies versus Germany in Normandy, Italy, and North Africa; Germany versus the Soviet Union on the Eastern Front and in the Far East; and Japan versus the United States in the Far East.<br><br>As Germany, you may face the United States or the United Kingdom in Normandy and Italy. At Berlin, you may face the United States, the United Kingdom, or the Soviet Union. Combat Training uses your faction’s practice HQ and has no enemy AI. Hold the Line waves and Force-on-Force deployments use the same theater matchup.',
      'In most modes, win by destroying the enemy HQ or eliminating the enemy army when it can no longer reinforce. You lose if your HQ is destroyed or if a total wipe leaves you unable to rebuild (see Reinforcements).<br><br>In Frontline Command, turning off <strong>Capture zones</strong> removes sector objectives and their income, but the HQ and army-elimination victory rules still apply.',
    ],
    callout:
      'Use the <strong>Forces</strong> panel (left) or drag on the battlefield to select units. Each roster row shows an <strong>HP bar</strong> and percentage. The top-right <strong>Surrender</strong> button ends the battle as a defeat and returns you to the main menu.',
  },
  {
    id: 'modes',
    title: 'Game modes',
    body: [
      '<strong>Frontline Command</strong> (Standard) — Full skirmish vs AI on any map. Set Recruit, Regular, or Veteran enemy experience in <strong>Settings</strong> (Regular is the default). On the battlefield screen choose <strong>Central Command</strong> (single HQ — all unit types from headquarters) or <strong>Forward Bases</strong> (<strong>Large map only</strong> — build an <strong>Infantry Garrison</strong> and depots from HQ; train units at completed structures; expand at <strong>captured sectors</strong>). The theater options keep <strong>Capture zones</strong> on by default; turn them off for a pure force-on-force battle with no capture objectives, sector income, or capture-focused AI. Victory remains destroying the enemy HQ or eliminating its army; Forward Bases can still construct around HQ but cannot expand from sectors. Both command structures start <strong>each side</strong> with a <strong>radio operator and infantry squad</strong>; Central Command exposes all unit types from HQ while Forward Bases unlocks them through structures. When forced to regroup, enemy units form rotating crossfire, echelon, or defence-in-depth positions instead of massing at one rally point. Longer-paced fights: tougher units, slower damage, slower income/production.',
      '<strong>Fortified Line</strong> (Clear Defenses) — Dug-in positions across the map; <em>no HQ, capture points, or sector economy</em>. Both the assault group and the garrison open with a combined-arms force that includes a <strong>cargo truck</strong> for troop lifts and towing AT guns or howitzers; later reinforcement packages can bring more. On the battlefield options screen choose <strong>Assault the Position</strong> or <strong>Command the Garrison</strong> alongside reinforcement size and the <strong>15-minute deadline</strong> toggle, which is <strong>on by default</strong>. With the deadline on, the assault must wipe every defender within 15 minutes; if defenders remain when time expires, the attackers lose and receive a mandatory <strong>Full Retreat</strong> order. Turn it off for an open-ended battle. As <strong>Defender</strong>, hold the prepared trench belt until the deadline or destroy the assault force; with no deadline, destroy the assault force. A complete force wipe still loses immediately, before later reinforcement waves can restore the line.',
      'Both sides receive automatic <strong>reinforcement groups every 3 minutes</strong> at their rear assembly (assault packages vs garrison packages match the role). On the <strong>Prepare Battlefield</strong> screen choose package size: <strong>Small</strong> (two units), <strong>Medium</strong> (three to four), or <strong>Large</strong> (five to six). Enemy command repeatedly reassesses surviving strength, damage, local pressure, and fresh arrivals. When you attack, the AI garrison remains <strong>defence-focused</strong>: it preserves prepared positions, conducts controlled fallback into dispersed crossfire, echelon, or defence-in-depth positions when a sector is overwhelmed, and releases limited probing counterattacks only when conditions permit. When you defend, the AI assault remains <strong>attack-focused</strong>: its chosen plan (infantry push, armored thrust, flanking hook, fire preparation, or combined arms) drives renewed assault waves, with the same dispersed regrouping when badly mauled. Both you and the AI can call <strong>off-map fire support</strong> (strafe, barrage, creep, airborne); in this mode each side may use <strong>Airborne only once</strong>, after the opening cloud-cover restriction clears.',
      '<strong>Combat Training</strong> (Training Ground) — No enemy AI. Practice orders, capture, production, fire missions, and fire support vs a passive practice HQ. The opening exercise force includes a cargo truck. Button reads <strong>Leave Training</strong> instead of Surrender.',
      '<strong>Breakthrough</strong> (Assault &amp; Defend) — Available only on <strong>Medium</strong> and <strong>Large</strong> battlefields. Pick <strong>Lead the Assault</strong> or <strong>Hold the Sector</strong> after choosing the operation. Central frontline (★) starts with the defender; flanks are neutral. Both sides field anti-tank guns and a cargo truck; defenders start with an extra AT piece. The top HUD shows your role, objective, and a <strong>countdown timer</strong>: defenders see <strong>Hold until</strong> (8 minutes); attackers see <strong>Defender reinforcements</strong> counting down the same window. <strong>Attackers</strong> win by capturing the frontline and holding it for <strong>45 seconds</strong>, destroying the defender HQ, or wiping defenders when they cannot reinforce. <strong>Defenders</strong> win if the 8-minute timer expires, the assault HQ is destroyed, or the assault army is eliminated with no way to rebuild.',
      '<strong>Hold the Line</strong> (Tower Defence) — On the battlefield screen choose <strong>Battle Duration</strong> (<strong>Decisive Defence</strong> or <strong>Lasting Defence</strong>) and <strong>Defensive Doctrine</strong>: <strong>Prepared Positions</strong> (no trainable player army beyond the field commander, bodyguards, and starting radio operator — start with <strong>82 defense points</strong>, enough for one MG nest and one bunker; earn further points gradually while an assault is active and by destroying enemies, with tougher units worth more; no points accrue during the quiet preparation periods; spend them on bunkers, MG nests, mortar pits, AT guns, mines, wire, and artillery pits) or <strong>Mobile Defence</strong> (spawn <strong>any unit type</strong> from your HQ with supplies — your troops <strong>cannot cross the frontline</strong> into enemy territory; if enemies stay past your side of the line for <strong>10 seconds</strong> the <strong>frontline retreats</strong> toward HQ). Assaults hit <strong>sections of the frontline</strong> from different angles; from roughly <strong>wave 4</strong> enemy cargo trucks join the assault, then armored cars and tanks; from roughly <strong>wave 10</strong> expect wider <strong>multi-sector flanking</strong>. In either doctrine, the normal <strong>Fire Support</strong> options are available while a living radio operator can observe the target. Prepared Positions artillery pits also provide their own ammunition-based <strong>barrage</strong>. Selected enemy waves include a radio operator; while one survives and has a target in range, the attackers can call the same off-map support against troops and emplacements. Mobile Defence earns supplies from HQ income and destroying attackers. Between waves, <strong>Start Wave Now</strong> skips the prepare timer. <strong>Prepared Positions</strong> — lose if the line is breached (10 s grace) or HQ falls. <strong>Mobile Defence</strong> — lose only if HQ is destroyed (12 waves still wins in decisive mode).',
      '<strong>Force-on-Force</strong> (Battle Simulation) — a pure field engagement on the battlefield screen (no HQ, capture points, or supply reinforcements). Two deployment styles:',
      '<strong>Manual Deployment</strong> — <strong>2,000</strong> supplies on <strong>any map</strong> and map size. Pick units and <strong>LMB</strong> to place; the enemy fields the <strong>same number of units</strong> with its own mix. Enemy AI rolls a battle plan (armored thrust, defensive belt, infantry assault, flanking hook, recon push, fire preparation, general advance) that shapes both its composition and how it fights. During battle it repeatedly reassesses surviving strength and local pressure, renewing a push, falling back into dispersed crossfire, echelon, or defence-in-depth positions to regroup, or defending ground it has taken instead of relying on its opening orders alone. <strong>Begin Battle</strong> when ready.',
      '<strong>Preset Battle Group</strong> — Available on <strong>any map</strong> and map size. On the theater screen choose force size: <strong>Small</strong> (~24 units/side), <strong>Medium</strong> (~38/side, default), or <strong>Large</strong> (~68/side). <strong>Large is blocked on Berlin</strong> (and other dense urban maps) for performance — Medium is the maximum there. Both sides auto-deploy the same combined-arms roster in echelons (rifle line, radio/support weapons, armor and trucks in reserve). A <strong>field briefing</strong> (date, location, weather, enemy plan) appears before combat. Enemy AI still picks a battle plan, applies it with the units fielded at that size, and continues the same adaptive command cycle throughout the fight. <strong>Begin Battle</strong> when ready.',
      'No HQ or sector economy in either style. Strafe, air bomb, and artillery fire support unlock once battle begins. Airborne remains grounded by opening cloud cover for the battle’s first <strong>5 minutes</strong>; after conditions clear, each side may use <strong>Airborne only once</strong> in Battle Simulation. Win by destroying every enemy unit; lose if your army is wiped out.',
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
      'The main menu’s <strong>War Stats</strong> page keeps a browser-persistent record of unit formations lost, personnel casualties, estimated loss cost, and losses by unit type for every faction across completed operations.',
      'The main menu’s <strong>Achievements</strong> page keeps a separate permanent service record. Decisive feats earn medals, specialist actions earn service ribbons, and worthwhile field actions can be entered as a positive superior-command report. Rare theatre victories, tank-ace runs, counter-battery work, no-loss operations, and last-reserve wins are all recorded. A period award notice and distinct ceremonial sound play when each achievement is first unlocked.',
    ],
  },
  {
    id: 'controls',
    title: 'Controls',
    intro:
      'Use the mouse to select units and issue orders, keyboard shortcuts to manage specialists and the camera, and HUD buttons for support and battle flow.',
    controls: [
      { type: 'heading', title: 'Select & command' },
      ['LMB', 'Select unit or HQ'],
      ['LMB drag', 'Box-select on the battlefield'],
      ['RMB', 'Move to ground, attack enemy under cursor, or mount infantry on a friendly tank or truck'],
      ['RMB (infantry → tank / truck)', 'With only foot troops selected, RMB a friendly tank to ride the hull (2 on a medium, 3 on a super heavy) or a truck to load the cargo bed (up to 3 units)'],
      ['Exit vehicle crew', 'Select a stopped operational vehicle and leave its crew on the ground; the empty hull can be reclaimed by your crew, eligible infantry or airborne, or the enemy'],
      ['RMB (construction unit)', 'Move the selected unit; cancels its pending placement or active sandbag, trench, or tent construction'],
      ['Shift + LMB', 'Fire at open ground or cover (trees, hedges, bunkers) — all combat units in range'],
      ['Alt + Shift + LMB', 'One ready selected artillery piece fires smoke at open ground — 45s cooldown; blocks line of sight for 60s'],
      { type: 'heading', title: 'Specialist shortcuts' },
      ['Ctrl + E', 'Select the nearest available engineer; press again to cycle through engineers'],
      ['Ctrl + M', 'Select the nearest available medic; press again to cycle through medics'],
      ['Ctrl + A', 'Select the nearest available artillery piece; press again to cycle through artillery'],
      ['Ctrl + R', 'Select the nearest available radio operator; press again to cycle through radio operators'],
      ['Esc', 'Cancel fire-support targeting, active unit fire missions, engineer field-work placement, base building construction, Battle Simulation placement, or pending TD build'],
      { type: 'heading', title: 'Camera & battle flow' },
      ['WASD / arrows', 'Pan camera · left/right arrows rotate · wheel zoom'],
      ['Middle-mouse drag', 'Hold and drag to tilt the camera like the arrow keys · horizontal movement rotates · vertical movement moves the view forward/back'],
      ['P', 'Pause / resume — camera still pans while paused; orders are blocked'],
      { type: 'heading', title: 'Panels & battlefield tools' },
      ['Tactical map', 'Bottom-right minimap — toggle with the header button; green = friendlies, red = enemies; fading yellow/red traces show live fire exchanges; click to pan the main camera (preference saved)'],
      ['Settings', 'Main menu — choose persistent AI difficulty, battlefield toggles, automatic radio positioning, Standard Auto Build, and how long bodies and destroyed vehicles remain'],
      ['Forces list', 'Unit types are grouped; click a row to select, hover/focus to reveal additional units, and Shift-click to add — each row shows HP'],
      ['Field icons toggle', 'Forces panel header — show or hide unit-type icons and floating health bars above your troops (saved between sessions)'],
      ['Unit status toggle', 'Forces panel header — show or hide floating status markers such as INSPIRED, IN COVER, RETREATING, and support/repair markers (saved between sessions)'],
      ['Capture circles toggle', 'Top-left HUD — show or hide capture-zone circles without disabling capture progress (saved between sessions)'],
      ['Engage target', 'Confirm attack on enemy in range (selection panel)'],
      ['Launch Battle Now', 'Skip quiet-sector staging (countdown banner)'],
      ['Start Wave Now', 'Tower Defence — skip prepare countdown and begin the current wave'],
      { type: 'heading', title: 'Support & session actions' },
      ['Save', 'HUD top-right — store battle progress in this browser; resume from <strong>Continue Saved Battle</strong> on the title screen'],
      ['Continue Saved Battle', 'Title screen — resume a saved battle (faction, map, units, supplies, and timer restored)'],
      ['War Stats', 'Main menu — open the dedicated page with cumulative unit losses, personnel casualties, estimated cost, and loss types for every faction (saved in this browser)'],
      ['Achievements', 'Main menu — review persistent medals, service ribbons, and superior-command commendations, including victory awards for every operation type and rare theatre citations'],
      ['Surrender', 'Quit battle — counts as defeat, then Main Menu'],
      ['Fire support', 'Strafe, Bomb, Barrage, Creep, or Airborne → LMB on map · Esc cancels'],
      ['General Orders', 'HUD panel below Fire Support — Full Retreat, Hold Ground, and Dig In (3 min cooldown each, 30 s command window). Orders require a living commander; the enemy AI uses the same command net and loses these orders when its commander dies'],
      ['Auto Build', 'Reinforcements panel (Standard only) — toggle to automatically fill the HQ queue with a balanced combined-arms mix'],
      ['Tablet / touch', 'Phones and tablets play in <strong>landscape only</strong> — rotate if the screen is upright. Camera pad: pan, rotate, zoom · <strong>Target</strong> = tap enemy to highlight, tap again or Engage to attack · <strong>Fire</strong> = tap ground/cover (Shift+LMB) · tap the map with units selected = move/attack · on tablets, use Settings → Tablet controls to switch to the normal keyboard/mouse scheme when a keyboard is connected · <code>?tablet=1</code> forces tablet UI'],
      ['Cheat mode', 'Type <code>iddqd</code> during a battle, or add <code>?cheat=1</code> to the URL before loading — unlimited supplies and instant builds (<code>iddqd</code> toggles off)'],
    ],
  },
  {
    id: 'battlefield-ui',
    title: 'Forces & battlefield UI',
    body: [
      'The <strong>Forces</strong> panel (left) lists every alive friendly unit with a <strong>health bar</strong> and percentage. Click a row to select; Shift-click to add to selection.',
      'Modes that begin with a pre-deployed force provide one faction-specific <strong>field commander</strong> and at least one faction-specific <strong>radio operator</strong> with that force. The officer stands at the centre of a four-man bodyguard group and carries a permanent gold (friendly) or red (enemy) <strong>CMD star</strong> field symbol, also marked with a star on the tactical map. Radio operators carry period backpack sets and aerials, are ordinary buildable one-man combat units, and each side may field up to <strong>three</strong> at once. Manual Battle Simulation deployment lets you choose your own force, while Training only needs the player-side starting link. Enemy AI normally keeps its commander in a protected rear position, but may move to the safe rear edge of the aura when several frontline troops need inspiration; the commander does not count toward normal army-wipe or wave-clear conditions.',
      'The <strong>Field icons</strong> button in the Forces header toggles unit-type icons floating above your troops on the map. Your choice is remembered in the browser.',
      'The <strong>Unit status</strong> button in the Forces header toggles floating status markers such as <strong>INSPIRED</strong>, <strong>IN COVER</strong>, <strong>RETREATING</strong>, <strong>SURRENDERED</strong>, and medic/engineer support feedback. Your choice is remembered in the browser. This does not hide rank badges, selection-panel details, or battlefield effects such as engine smoke.',
      'The small <strong>Capture circles</strong> button at the top-left hides or restores the large capture-zone circles. This is visual only: hidden sectors still capture normally and remain listed in the HUD. The preference is remembered in the browser.',
      'When field icons are <strong>on</strong>, floating <strong>health bars</strong> also appear above damaged units (any team) and above your selected units (even at full HP). Fill color runs green → yellow → red as HP drops; borders tint blue (yours) or red (enemy), gold when selected.',
      'Turning field icons <strong>off</strong> hides both the icons and the world health bars. The Forces roster and bottom <strong>selection panel</strong> still show HP bars and numbers for selected units, groups, and HQ.',
      'Vehicles below <strong>50% HP</strong> (tanks, armored cars, trucks, artillery, towed guns) trail dark <strong>black engine smoke</strong> from the rear until an engineer repairs them or the vehicle is destroyed.',
      'Vehicle finishes include rolled-steel surface wear, while towed guns use faction-specific equipment details. Towed <strong>anti-tank guns</strong> have a visible two-man detachment; <strong>artillery</strong> has a three-man detachment with ready ammunition. Their camouflage follows the selected theater: muted hedgerow colors in <strong>Normandy</strong>, sand and light-stone schemes in <strong>North Africa</strong>, field green and earth tones on the <strong>Eastern Front</strong>, dusty olive/earth finishes in <strong>Italy</strong>, and dark humid greens in the <strong>Far East</strong>.',
      'Units continuously follow the local terrain height and lean into hills and side-slopes. Vehicles, towed guns, crews, and mounted tank riders stay aligned to the ground instead of being clipped by rising terrain.',
      'On <strong>Berlin</strong>, all ground units route along connected streets and around intact buildings rather than attempting to cross masonry. The canal has animated ripples and glints; shells striking water produce spray instead of a ground impact.',
      'Experienced units earn rank badges beside them (always shown, not tied to field icons): <strong>VET</strong> at <strong>1 kill</strong>, upgraded to <strong>ELITE</strong> at <strong>3 kills</strong>.',
      'Isolated foot troops under fire may <strong>surrender</strong>. Move friendlies close to liberate; enemies close to capture prisoners off the map (see Combat).',
      'On phones and tablets (landscape), a <strong>camera pad</strong> appears for pan, rotate, and zoom. Use <strong>Target</strong> to pick enemies (tap twice or press Engage). Use <strong>Fire</strong> to order manual fire at ground or cover (like Shift+LMB). <strong>Tap</strong> the map with units selected to move or attack (replaces right-click). Pinch to zoom.',
      'When your <strong>HQ is under heavy attack</strong>, a red alert banner appears at the top with HP and an alarm — pull units back to defend before the headquarters falls.',
    ],
  },
  {
    id: 'economy',
    title: 'Supplies & capture points',
    body: [
      'Supplies pay for reinforcements (top HUD). Your HQ generates passive income every second; each captured flank point adds more.',
      'Frontline Command uses three capture zones by default; all three start <strong>neutral</strong> and the two flank sectors are spread farther from the central frontline — fight across the wider front for extra supplies. Turn <strong>Capture zones</strong> off in the theater options for a force-on-force battle: all zones and sector income are removed, while HQ income, reinforcements, and HQ/army-elimination victory remain. In Assault, the center frontline starts with the defender; flanks are neutral. Battle Simulation and Tower Defence do not use the ordinary capture-point economy.',
      'Use the top-left <strong>Capture circles</strong> button if the world-space rings obscure the battlefield. Hiding them does not change ownership, capture progress, or income.',
      '<strong>Map size</strong> on the theater screen: <strong>Small</strong> (tight, close-quarters), <strong>Medium</strong> (default — expanded maneuver room), or <strong>Large</strong> (grand theater with long flanks). Larger maps scale bases, capture points, and deploy rings.',
      '<strong>Quiet sector</strong> (~32 s in Standard / Assault): no combat fire; both sides stay inside the HQ staging ring. <strong>Neither side</strong> can queue reinforcements or build base structures (in-progress construction pauses) until battle begins. Move orders only reposition troops in a <strong>tight ring around your HQ</strong> — not toward capture points (captures are frozen until launch). Click <strong>Launch Battle Now</strong> when ready (or wait for the timer). <strong>Clear Defenses starts live immediately</strong>: defenders engage as soon as attackers enter their actual weapon range.',
      'In <strong>Classic</strong> Standard each side begins with a radio operator and one infantry squad at HQ — train the rest from the Reinforcements panel as supplies accrue (the AI does the same from its HQ).',
      'Up to <strong>four</strong> units queued at your HQ. Reinforcements spawn in a ring around the HQ when their timer finishes (or at the depot that unlocked them in Base Building mode).',
      '<strong>Auto Build</strong> (Standard — Classic and Base Building): toggle in the Reinforcements panel header. When <strong>On</strong>, the game keeps the queue full (up to four slots) with a realistic combined-arms mix — infantry backbone, radio operators, MG and mortar support, AT, trucks, armor, artillery, medics, and engineers — weighted by what you already have on the field and what you can afford. You can still click unit buttons to queue manually; auto build only fills empty slots. <strong>Off by default in Base Building</strong> so you can afford depots first; Classic remembers its own setting separately. Restored with saved games. Not available in Training, Assault, Tower Defence, or Battle Simulation.',
      'Standard mode uses slower income and ~1.65× longer build times so battles develop gradually. Each side may deploy up to <strong>30 living units</strong>; losses free space for replacements.',
    ],
  },
  {
    id: 'base-building',
    title: 'Standard — Base Building',
    body: [
      'Choose <strong>Base Building</strong> on the theater screen (<strong>Standard</strong> on a <strong>Large</strong> map only). Each side starts with a <strong>radio operator</strong> and a <strong>single infantry squad</strong> at HQ. Click your <strong>HQ</strong> and use <strong>Base Construction</strong> to place structures — build an <strong>Infantry Garrison</strong> first to train more rifle squads. Click a completed <strong>garrison or depot</strong> on the map to open that building\'s unit menu (e.g. Motor Pool → tanks).',
      '<strong>Infantry Garrison</strong> (130 supplies, ~38 s) — click when built to train <strong>infantry squads or radio operators</strong>; new units spawn at the garrison. Max 1 per base. Destroying the enemy garrison stops their rifle and signals production.',
      '<strong>Field Hospital</strong> (185 supplies, ~42 s) — click when built to train <strong>medics</strong>. Max 2 per base.',
      '<strong>Ordnance Yard</strong> (220 supplies, ~48 s) — click when built to train <strong>MG teams</strong>, <strong>mortars</strong>, <strong>AT guns</strong>, and <strong>artillery</strong>. Max 1.',
      '<strong>Motor Pool</strong> (260 supplies, ~55 s) — click when built to train <strong>engineers</strong>, <strong>snipers</strong>, <strong>armored cars</strong>, <strong>tanks</strong>, and <strong>super heavies</strong>. Max 1. Damaged <strong>vehicles</strong> (tanks, cars, guns, artillery) within ~14 m slowly repair here, like infantry at a field hospital.',
      '<strong>Infantry Bunker</strong> (95 supplies, ~28 s) — no production; garrisons up to <strong>2</strong> foot troops (infantry, radio operator, MG, sniper, medic). Move units onto a completed bunker to enter — they gain <strong>heavy cover</strong> and can fire out. Max 6 bunkers.',
      'Open the <strong>Base Construction</strong> panel (bottom HUD), pick a structure, then <strong>LMB</strong> the map in the build ring around your <strong>HQ</strong> or any <strong>capture sector you control</strong> — secure flanks to erect forward depots and bunkers. If <strong>Capture zones</strong> are disabled, the HQ build ring remains available but there are no sectors to capture or expand from. During <strong>quiet sector</strong> neither side may start or progress base construction — launch battle first. Structures cost supplies upfront and take time to finish once the battle is underway. Enemy AI expands the same way at HQ and sectors it holds when zones are enabled.',
      'Units spawn at the structure you selected when queuing them. Engineers can erect <strong>field bunkers</strong> (no supply cost) that garrison troops like HQ-built bunkers — sandbags are disabled in this mode.',
      '<strong>Auto Build</strong> works here too: once depots are online it queues from every unlocked building (not only the one you last clicked), spawning at the correct depot automatically.',
      'Enemy depots and bunkers can be attacked like any other target — click to order fire, or let units auto-acquire in range. Destroyed structures leave <strong>rubble and scorched foundations</strong> on the map; you can rebuild nearby (destroyed buildings no longer count toward caps).',
    ],
  },
  {
    id: 'reinforcements',
    title: 'Reinforcements & defeat',
    body: [
      'Losing every unit on the field does <em>not</em> end the battle if your HQ stands and you can still reinforce (queue, affordable build, or income). <strong>Clear Defenses</strong> has no production queue and loses when every attacker is gone — unless a scheduled three-minute reinforcement group is still due (those arrivals continue for both sides at the chosen Small / Medium / Large size).',
      'Eliminated when your HQ is destroyed, or you have no units, empty queue, and cannot afford any unit with no income to recover.',
      'The enemy follows the same rule in Standard and Assault: wipe their army only sticks if their HQ is gone or they cannot produce.',
      'In <strong>Classic</strong>, enemy AI trains from its HQ — new units appear around headquarters when builds complete. In <strong>Base Building</strong>, the AI builds structures at HQ and captured sectors and spawns at the matching depot or garrison.',
      'In every active enemy-AI mode — Standard, Assault &amp; Defend, Clear Defenses, active Battle Simulation, and Tower Defence — the enemy can call off-map support and construct sandbags, field bunkers, and trenches when it has suitable units. It also moves eligible infantry into buildings and cover. <strong>Medics</strong> move to heal wounded foot troops, and <strong>engineers</strong> move to repair damaged vehicles, broken tracks/wheels, recoverable wrecks, and a damaged HQ; after treatment, both return to a covered rear support line instead of joining the assault. Training Ground deliberately has no enemy AI.',
    ],
  },
  {
    id: 'combat',
    title: 'Combat',
    body: [
      'LMB on an enemy (with units selected) issues an attack. When an enemy is under the pointer, use <strong>Engage target</strong> or LMB on that enemy. Click the <strong>enemy HQ</strong> directly, or click the ground within ~18 m of it — units in range fire on the headquarters until it is destroyed (enemy defeat). RMB near the HQ also issues an attack order instead of a move.',
      '<strong>Shift + LMB</strong> orders manual fire for selected combat units in range: click <strong>cover</strong> (trees, hedges, bunkers) to destroy it, or <strong>open ground</strong> for a fire mission. Works for every fighting unit — infantry, tanks, AT guns, and artillery. A red reticle appears on the cursor while Shift is held. <strong>RMB move</strong> or <strong>Esc</strong> cancels active fire missions.',
      '<strong>Smoke shells</strong> (artillery counter to AT guns): select artillery → <strong>Smoke shell</strong> button or <strong>Alt+Shift+LMB</strong> on open ground. One ready selected howitzer fires; that gun then needs <strong>45 seconds</strong> to prepare another smoke round. A grey cloud lasts <strong>60 seconds</strong> (~200 m wide). Enemies firing through the screen have no clear line of sight — about <strong>82% of shots miss</strong> (blind fire). Enemy artillery also uses smoke tactically to screen assaults from tanks and AT guns.',
      'Idle combat units automatically acquire and fire at the nearest valid visible enemy inside weapon range. Their per-unit <strong>engagement stance</strong> controls that idle behaviour and how selected targets are followed: <strong>Hold Ground</strong> (default) does not start a chase on its own, but an explicit target order closes to range and then holds position if the target flees; <strong>Pursue</strong> closes on and follows the selected target. Explicit orders keep their target selected through brief line-of-sight breaks. Switching stance applies immediately. Select one or several units and choose the stance in the selection panel. Damage falls off with distance. <strong>Infantry, paratroopers, and engineers</strong> use dispersed wedge, staggered-column, line, and echelon formations; squads smoothly reorganize into a different formation when they begin a new movement. Stationary squads automatically go prone while firing, then rise again when ordered to move. Mounted troops and soldiers fighting from trenches keep their appropriate mounted or dug-in stance.',
      '<strong>Line of sight:</strong> intact buildings stop direct rifle, machine-gun, tank, tank-destroyer, and anti-tank fire. <strong>Artillery</strong> fires high-angle: shells go <strong>over</strong> buildings and other large obstacles that lie beyond the howitzer\'s minimum range (~220 m). A large obstacle <em>inside</em> that min-range ring still blocks the muzzle — the shell strikes it until the structure is destroyed. The Settings page chooses whether player howitzers auto-fire by default; select them to override that choice during a battle. Ordered attack, ground, smoke, and building fire missions always work without auto-fire. Mortars also lob over buildings. Deliberate shots at a distant building land on that façade after flight. Off-map barrages remain fully indirect.',
      'Tanks and <strong>super heavy tanks</strong> carry a <strong>coax machine gun</strong> (~520 m) alongside the main gun — effective vs infantry and soft targets; tanks close on soft targets and use the coax instead of wasting main-gun rounds. Against <strong>enemy tanks and tank destroyers</strong>, crews prioritize the main cannon and use only occasional short coax bursts because machine-gun rounds cannot penetrate the armor. Main cannons reload deliberately: medium tanks take about <strong>6.5 s</strong> and heavy tanks about <strong>8.5 s</strong> between shots. Rifle, MG, and sniper bullets cannot damage tanks. However, <strong>infantry, paratroopers, and engineers</strong> that close to within about <strong>80 m</strong> automatically throw a hand grenade for light armor damage, then wait roughly <strong>9.5–11 s</strong> before throwing another. Grenades deal about <strong>12 damage</strong> to standard tanks and reduced damage to super heavies; mounted tank riders cannot throw. Dedicated AT guns, tank guns, and artillery remain far more effective vs armor; <strong>mortars</strong> are weak against tanks, tank destroyers, and super heavies (high-angle HE). Super heavies are slower, tougher, and hit harder. <strong>Anti-tank guns</strong> (~600 m) are dangerous vs armor at medium range but reload slowly, fall off at long range, and are very weak vs infantry — close under smoke or swarm with riflemen.',
      '<strong>Vehicle handling &amp; gun feedback:</strong> tracked vehicles pivot at a deliberate hull-traverse speed instead of snapping instantly, with track-and-engine audio while turning in place. Towed anti-tank guns and field artillery are moved by their crews and make no engine sound. Accepted attack orders play a faction-specific radio acknowledgement. Tank main guns use heavier cannon reports; anti-tank and artillery pieces visibly eject brass cases that scatter beside the gun and remain on the battlefield. <strong>AT guns and howitzers</strong> only fire while fully stopped; the crew must hand-crank the carriage onto the target before the round goes out — a large traverse takes several seconds. Field howitzers reload slowly (~<strong>11–13.5 s</strong> between shells) as the crew rams and lays each round. Howitzers have a roughly <strong>220 m minimum range</strong> and cannot shell their own immediate position; enemies inside that dead zone are engaged by the crew with faction-specific rifles instead.',
      '<strong>Armor penetration:</strong> Direct tank, anti-tank-gun, and infantry anti-tank shots test the weapon against the target vehicle\'s historical protection, impact range, armor facing, slope, and horizontal strike angle. Glancing or underpowered hits <strong>ricochet with a bright metallic spark shower and no hull damage</strong>. Each hit lands on a sampled part of the vehicle silhouette; penetrations through rear engine decks, ammunition stowage, turret rings, driver visors, and open fighting compartments have a chance to become a high-damage <strong>critical hit</strong>. Towed <strong>anti-tank guns</strong> aim for those weak spots and convert them to criticals more often than tank guns. Low strikes can break tracks or wheels. Jagdpanther and SU-100 frontal slopes are especially effective, while the open-topped M10 and Achilles trade protection for powerful guns. Flank heavy armor instead of trading shots against its front plate.',
      '<strong>Mobility damage:</strong> Shells can break a tank\'s <strong>track</strong> or an armored car\'s <strong>wheel</strong>, especially on side hits. The vehicle becomes completely <strong>immobile</strong> and cancels movement, but can keep firing. Keep a combat engineer within ~16 m until the orange repair status reaches 100%; one engineer needs roughly <strong>9 seconds</strong> at point-blank range. Enemy engineers will make the same repair run, then withdraw behind their main body. The spanner marker appears while work is underway, and mobility damage persists in saved battles.',
      '<strong>Trucks:</strong> Each faction fields a historically grounded cargo truck (Opel Blitz, GMC CCKW, Bedford QLD, ZIS-5, Type 94). They are a normal production vehicle in <strong>every mode</strong> that trains units, and they spawn in opening forces for <strong>Fortified Line</strong>, <strong>Breakthrough</strong>, <strong>Combat Training</strong>, and Force-on-Force presets, plus Hold the Line assault waves. They are <strong>unarmored</strong> — rifles and machine guns damage them — and unarmed; the driver only fights after bailing with a service rifle. Select foot troops and use <strong>Get on</strong> or RMB to load up to <strong>3</strong> units into the cargo bed for fast deployment; stop and press <strong>Disembark riders</strong>, or they bail automatically under fire. Drive a truck next to a friendly <strong>AT gun</strong> or <strong>howitzer</strong> and an <strong>Attach</strong> option appears — the gun slides onto the rear hitch and is towed (the truck is slower with a gun hooked on). Stop and <strong>Detach</strong> to unlimber and fire. A towed gun cannot shoot until unhooked. <strong>Enemy AI uses trucks the same way:</strong> it loads nearby infantry for a lift, hooks idle AT guns and howitzers, drives them toward the fight, then disembarks troops and unlimbers guns <strong>outside rifle and machine-gun range</strong> (~580 m; howitzers further back). Soft-skinned lorries do not close to contact. Fortified Line garrisons keep prepared guns on the belt instead of limbering them.',
      '<strong>Tank riders &amp; captured vehicles:</strong> Select <strong>foot troops only</strong> (infantry, paratrooper, MG, sniper, medic, engineer) and highlight a friendly <strong>tank</strong> or <strong>super heavy</strong>. A green <strong>Get on</strong> button appears above vehicles the selection can ride; click it or RMB the vehicle to mount the rear deck — up to <strong>2</strong> riders on a medium tank, <strong>3</strong> on a super heavy. Riders are visible on the hull, can fire while mounted, and move with the tank. Select a stopped operational vehicle and press <strong>Exit vehicle crew</strong> to deliberately leave an empty hull: its original crew can re-enter, or eligible infantry or airborne from <strong>either side</strong> can take it first. An intact <strong>crewless</strong> tank may also be reclaimed by its own surviving bailed crew, or remanned by <strong>infantry or airborne from either side</strong>; this internal driving/command role uses <strong>Re-enter</strong> or <strong>Get in</strong>. A bailed crew will only re-enter the exact hull it escaped from. Enemy AI follows the same rule and will seize nearby opportunities. Riders ignore individual move orders while mounted. Select either the <strong>vehicle</strong> to disembark everyone aboard or a mounted <strong>rider</strong> to disembark that unit, then press <strong>Disembark rider(s)</strong> after stopping the vehicle; riders also <strong>bail out automatically under fire</strong>. The button is the only manual way to disembark riders.',
      'Armored cars take partial infantry and machine-gun damage (~32%), but sniper rounds cannot damage them. Anti-tank guns, tank guns, and artillery remain effective; mortars deal reduced HE to armored cars and much less to tanks and heavier AFVs.',
      'Damaged units may <strong>retreat</strong> toward their HQ (RETREATING tag) and stop attacking until safe. Troops in <strong>heavy cover</strong> (sandbags, wrecks, and similar hard shelter) are much less likely to panic-retreat; troops fully <strong>inside buildings or bunkers</strong> receive the strongest morale protection, though even they can still break when badly mauled. Dug-in trench troops also stand firmer. <strong>Medics</strong> nearby reduce retreat chance further and slowly heal infantry, MG, mortar, sniper, and bailed vehicle-crew teams — a <strong>green cross</strong> floats above units being healed. A nearby living <strong>field commander</strong> stiffens troops within ~34 m, making automatic retreats and surrender much less likely. Units inside that aura display a gold <strong>INSPIRED</strong> marker above them and an <strong>INSPIRED</strong> status in the selection panel. If the commander dies, automatic retreat and surrender pressure rises sharply across that side; the surviving radio net remains available for support calls. <strong>Engineers</strong> repair nearby vehicles and broken running gear, steady panicked tank and gun crews, and — when within ~16 m of a damaged <strong>HQ</strong> — restore headquarters HP (spanner icon on the engineer and repair target). A recoverable vehicle wreck takes roughly <strong>12 seconds</strong> for one close engineer to restart and returns at about <strong>28% HP</strong>, but remains immobile and unable to fire until remanned. Its surviving bailed crew can right-click and reclaim its original hull; alternatively, select an <strong>infantry or paratrooper squad</strong> and right-click the repaired tank so two troops become its crew and the remaining squad members ride on the hull. Vehicles below half HP trail <strong>black engine smoke</strong> until repaired. Defenders in Clear Defenses do not retreat. Use <strong>General Orders</strong> (see below) to pull everyone back or stiffen the line during a push.',
      '<strong>Surrender:</strong> Foot troops and gun crews cut off from allies while taking fire may <strong>surrender</strong> (SURRENDERED banner). They hold position, stop shooting, and are ignored by fire. <strong>Tank crews can also surrender, but are much less likely to do so:</strong> the crew first climbs from the hatch, leaving an intact crewless vehicle that infantry or airborne from <strong>either side</strong> can seize, then surrenders on the ground. Move a <strong>friendly within ~11 m</strong> to <strong>liberate</strong> surrendered troops; let an <strong>enemy within ~11 m</strong> <strong>capture</strong> them — captured troops march off the map and count as casualties. Armored cars do not surrender. Dug-in Clear Defenses defenders never surrender.',
      '<strong>Veteran &amp; Elite:</strong> <strong>1 enemy kill</strong> promotes a unit to <strong>veteran</strong> (~9% more damage, steadier under fire, modest morale pressure on foes), shown by a <strong>bronze roundel and service chevron</strong>. <strong>3 kills</strong> upgrades them to <strong>elite</strong> (~18% damage, much less likely to retreat, stronger morale shock), shown by a distinct <strong>crimson crowned shield</strong>. Enemies hit by or fighting near veterans/elites are more likely to <strong>retreat or surrender</strong>. Rank persists on that unit; newly spawned reinforcements start fresh.',
      '<strong>Engineer field works:</strong> Select an engineer → <strong>Build sandbags</strong>, <strong>Build bunker</strong>, or <strong>Lay AT mine</strong>. Sandbags and bunkers use two-click location-and-facing placement; mines use one click. The engineer automatically moves to the site and starts once close enough. <strong>Sandbags</strong> (~11 s) are quick heavy-cover fighting pits. <strong>Bunkers</strong> (~28 s) are sturdier emplacements that <strong>garrison foot troops</strong> (commander, infantry, airborne, MG, sniper, medic, engineer) — move a squad onto the completed bunker to enter. <strong>AT mines</strong> (~8 s, maximum 16 per side) detonate beneath enemy vehicles or when struck by an enemy shell, inflicting heavy blast damage, breaking surviving tracks or wheels, and leaving a crater. A shell-triggered mine can also damage vehicles caught beside it. Garrisoned units take heavy-cover reduction and can fire out; order a move to exit. A new move order cancels travel or construction. In <strong>Base Building</strong> mode sandbags are disabled, but engineers can build bunkers and lay mines. Available in all modes including Tower Defence HQ Defense (when you have engineers). Esc cancels placement.',
      '<strong>Infantry trenches:</strong> Select a commander, radio operator, infantry, <strong>airborne</strong>, MG, or sniper → <strong>Dig trench</strong> → LMB a valid location, then aim the yellow facing arrow and LMB again. The unit walks there, digs for ~14 s, then drops into the trench (crouched). Other foot troops can move onto a <strong>friendly or empty enemy trench</strong> to dig in for medium-heavy cover; occupied enemy trenches remain contested and cannot be entered. Order a move to leave or cancel digging. Esc cancels placement.',
      '<strong>Field commander cover:</strong> Commanders can dig and occupy trenches and can enter friendly or empty enemy buildings and bunkers for protection. They retain their morale aura while under cover.',
      '<strong>Medic field hospital tent:</strong> Select a medic → <strong>Field hospital tent</strong> → LMB a valid location. The medic walks to the site before pitching it; after ~16 s the tent is up. <strong>Non-vehicle units</strong> (infantry, MG, sniper, mortar, medics, engineers) within ~12 m slowly heal. A move order during travel or deployment cancels the tent. Max 4 tents per side. Esc cancels placement.',
      '<strong>Standard bunkers:</strong> Engineer field bunkers in <strong>Classic</strong> Standard, or <strong>Infantry Bunkers</strong> from Base Construction (95 supplies) in Base Building — click a site near HQ or a sector you hold, then click the direction the bunker should face. Garrison up to <strong>2</strong> foot troops each, including the field commander. Move units onto a friendly or <strong>empty enemy bunker</strong> to enter; occupied enemy bunkers remain unavailable. Order a move away to exit.',
      'Destroyed units leave wrecks and casualties on the field: <strong>burning tanks</strong>, <strong>fallen infantry bodies</strong> (faction camo, prone on the ground), and knocked-out vehicles. Foot troops killed by large HE (artillery, tank shells, and similar blasts) are thrown bodily by the explosion before landing as corpses — occasional gibs still apply. <strong>Tracked tanks can drive directly over enemy anti-tank guns and field artillery, crushing the operating crew and smashing the carriage; they also grind prone and dug-in enemy troops beneath their tracks.</strong> Use <strong>Settings</strong> on the main menu to retain bodies and destroyed vehicles from 10 seconds up to permanently; longer retention can reduce frame rate. Visible corpses and wrecks are retained in saved games. Vehicle wrecks provide neutral cover to foot troops from <strong>either side</strong> while they remain. About <strong>one third</strong> of tank, super-heavy, and armored-car knockouts are recoverable: a smaller explosion and persistent smoke mark the shell-damaged hull, its turret stays in place, and a two-man crew visibly climbs from the hatch to continue fighting with small arms. An engineer can restore the hull while it remains on the battlefield; the surviving crew can reclaim its own vehicle, or infantry/paratroopers can reman it. A lethal rear hit has a high chance to trigger a catastrophic ammunition chain reaction; those vehicles produce no survivors and cannot be repaired. Cover and retreat markers disappear on death.',
      'Small-arms tracers only; tanks, AT guns, and artillery use shell-impact VFX and calibre-weighted reports. Barrages and creeping barrages begin with distant battery salvos and use heavy shell explosions. <strong>Air bomb</strong> strikes show a freefalling GP bomb and a single large detonation/crater. <strong>Mortar bombs and artillery shells</strong> lock their aim point when fired and land after a short flight — a unit that keeps moving can walk clear of the blast. Heavy fire permanently scars terrain with craters for the rest of the battle. <strong>Mortar teams</strong> stow their weapon while moving, deploy it when stationary, turn the elevated tube toward their target, and fire from the actual tube muzzle with a deliberate reload between bombs.'
    ],
  },
  {
    id: 'cover',
    title: 'Cover',
    body: [
      'Foot troops only, including infantry, paratroopers, machine-gun teams, engineers, snipers, medics, and bailed crews. Tanks, tank destroyers, super heavies, anti-tank guns, mortars, and artillery ignore cover bonuses.',
      '<strong>Heavy</strong> as little as ~12% damage taken (up to ~88% reduction) — bunkers, sandbags, tanks, and other hard shelter. Protection tapers toward the edge of the cover area.',
      '<strong>Medium</strong> as little as ~28% damage taken (up to ~72% reduction) — hedges and stone walls.',
      '<strong>Light</strong> as little as ~45% damage taken (up to ~55% reduction) — fighting pits and scrub. Trenches provide a consistent ~70% reduction while occupied.',
      '<strong>Direction matters:</strong> nearby cover only protects against fire passing through it. Flanking or rear fire bypasses the position. Bunkers and occupied trenches protect more broadly because troops are inside them.',
      '<strong>Weapon matters:</strong> rifles and machine guns are strongly checked by cover, while mortar bombs, tank shells, artillery, and other blast weapons retain more of their damage through or around it.',
      'Bonus only while the unit stays in the zone. <strong>Stationary tanks, tank destroyers, super-heavies, and armored cars</strong> create neutral cover usable by either side; anti-tank guns do not. Living-vehicle cover disappears as soon as that vehicle begins moving. Destroyed vehicle and field-gun wrecks also provide cover. Use <strong>Shift + LMB</strong> on scenery to destroy other cover objects. Selected foot troops show an <strong>IN COVER</strong> tag, foot ring, and % on the selection panel.',
      '<strong>Seek Cover</strong> (Settings → Unit Behaviour) — the saved global default routes commanders, infantry, airborne, engineers, medics, MG teams, mortar crews, radio operators, snipers, and bailed vehicle crews toward nearby cover on <strong>move orders</strong>. Select an applicable unit to change that unit independently: choose <strong>Seek cover</strong> or <strong>Use clicked ground</strong>. Tanks, anti-tank guns, and artillery are unaffected.',
    ],
  },
    {
      id: 'tower-defence',
      title: 'Tower Defence',
      body: [
        'In Tower Defence, players earn emplacement points by eliminating enemies. These points can be spent on various defensive structures to enhance their strategy and fortify their position against waves of attackers.',
      ],
    },
  {
    id: 'firesupport',
    title: 'Fire support',
    body: [
      'Off-map strikes from the HUD — no friendly fire on your units or HQ.',
      '<strong>Radio link required:</strong> fire support no longer depends on the field commander. At least one living radio operator must remain; losing the commander sharply worsens morale but does not silence surviving operators. Each side may field at most <strong>three radio operators</strong> (all modes). Multiple operators can keep support available if one is killed and extend the radio net.',
      '<strong>Strafing run</strong> (~72 s cooldown) — Faction fighter pass with spatial fly-by audio (each nation uses its own engine sound) and MG bursts along your line.',
      '<strong>Air bomb</strong> (~118 s cooldown) — The same faction fighter approaches, releases a large general-purpose bomb, and the bomb detonates on your mark for a single heavy blast and crater. Stronger against clustered troops and structures than a strafe; longer recharge.',
      '<strong>Artillery barrage</strong> (~95 s cooldown) — Shell warnings, then clustered impacts.',
      '<strong>Creeping barrage</strong> (~148 s cooldown) — Slower recharge; shells advance in lifts along your attack axis and concentrate maximum fire on the point you click.',
      '<strong>Airborne drop</strong> (~180 s cooldown) — <strong>Opening cloud cover grounds all airborne operations for the first 5 minutes of every mode, for both player and AI.</strong> The Airborne button shows the weather countdown; Battle Simulation setup time does not count toward it. Once conditions clear, a <strong>faction troop transport</strong> (Ju 52, C-47 / Dakota, Li-2, or L2D) flies a drop run and <strong>five elite paratrooper squads</strong> (four men each) <strong>exit the cargo door</strong>, freefall briefly, then open parachutes onto your target zone. Drops cannot target within about <strong>48 m of the opposing HQ</strong>, preventing an immediate HQ assault; Battle Simulation and Clear Defenses are unaffected when no HQ exists. They are <strong>not</strong> built from HQ — only called this way. On landing they fight with <strong>rifles, SMGs, and squad LMG</strong> vs infantry and <strong>anti-tank launchers</strong> (Panzerfaust, bazooka, PIAT, RPG-43, etc. by nation) vs tanks, tank destroyers, and armored cars. AT shots reload slowly (~4.5 s). In <strong>Clear Defenses</strong> and <strong>Battle Simulation</strong>, each side may call Airborne <strong>only once</strong> for the whole match (button shows Used after the drop).',
      '<strong>Radio range and observation:</strong> strafing runs, air bombs, artillery barrages, creeping barrages, and airborne drops may target only ground within about <strong>72 m of at least one living radio operator</strong> (about <strong>720 m</strong> on the scale markers) and with a clear line of sight from that operator. Buildings between the radio and the aim point, and smoke, can block the call — but you may still call strikes <strong>on top of buildings</strong> (roofs) when the radio can see that structure. The targeting ring turns red outside the radio net, and the enemy AI follows the identical restriction.',
      '<strong>Automatic radio positioning:</strong> the persistent Settings → Unit Behaviour toggle is <strong>on by default</strong>. When every operational radio operator is outside the clicked target’s support range, an out-of-range support click leaves a visible pending-strike marker and orders the nearest operator to a covered position just inside the radio net. The support option is immediately deselected and normal battlefield controls return, so clicking elsewhere does not move or replace the pending target. The strike fires automatically once the operator can observe the target. Click the marker, select the radio operator, or give that operator a manual order to cancel it. Turn the setting off to move a radio operator manually. This convenience order uses the normal <strong>Seek Cover</strong> preference and does not bypass line-of-sight or smoke restrictions.',
      '<strong>Binoculars:</strong> select a radio operator and press <strong>Binoculars</strong> in the selection panel. For up to <strong>45 seconds</strong> that operator’s fire-support observation range extends to about <strong>112 m</strong> (~1120 m). When you <strong>call a fire-support strike</strong> that the scanning operator can observe, the scan ends and that operator cannot raise binoculars again for <strong>3 minutes</strong>. If the scan expires without a call, there is no cooldown. Multiple operators each track their own scan and cooldown. The enemy AI uses the same rules.',
      'Click a strike type, then LMB on valid observed ground. Esc cancels targeting. Not available in Tower Defence (Emplacements) or during Battle Simulation deployment; otherwise available once its mode restrictions and the five-minute cloud-cover period have cleared in Tower Defence HQ Defense, Standard, Assault, Clear Defenses, Battle Simulation, and Training. The enemy AI follows the same weather, radio-link, cooldown, observation, targeting, and per-mode use rules.',
    ],
  },
  {
    id: 'generalorders',
    title: 'General orders',
    body: [
      'Command-wide orders from the <strong>General Orders</strong> HUD panel (below Fire Support, collapsible like that panel). One order active at a time; each button has a <strong>3-minute cooldown</strong> and the effect lasts <strong>30 seconds</strong>. Other ready orders remain available and replace the current order when used. The active order can be <strong>cancelled early</strong> — click its button again (it reads <strong>Cancel Retreat</strong>, <strong>Cancel Hold</strong>, or <strong>Cancel Dig In</strong>) or press <strong>Esc</strong>.',
      '<strong>Field commander required:</strong> if your commander is killed, any active general order is cancelled and Full Retreat / Hold Ground / Dig In remain unavailable for the rest of the battle. The commander itself is not pulled forward by a Full Retreat order.',
      '<strong>Full Retreat</strong> — Every friendly unit is ordered to withdraw toward your HQ immediately. For the full 30 s, any unit not yet at HQ is kept retreating (overrides manual move orders until cancelled or the timer ends). Cancelling stops the withdrawal and troops accept new orders. Use when a push fails or the line must fall back in one motion.',
      '<strong>Hold Ground</strong> — Troops are ordered to stand firm. Panic-retreat chance is greatly reduced for 30 s but <strong>not eliminated</strong> — battered or isolated units can still break. Cancel if the situation changes and you need normal morale again. Use before a major advance so riflemen and gun crews stay on the objective.',
      '<strong>Dig In</strong> — Every currently free commander, radio operator, infantry or airborne squad, MG team, and sniper team attempts to dig a trench at or near its present position. Engineers that cannot dig trenches instead attempt to build sandbags, falling back to a bunker when sandbags are unavailable or cannot be placed. Trenches and field works face the centre of the living enemy force (or the enemy base when no enemy is visible), and each digger automatically occupies its completed trench. Cancelling within the 30 s command window stops unfinished order-created trenches and field works; completed works remain.',
      'Cooldown orders (Retreat / Hold / Dig In) are not available in Tower Defence (Emplacements) or during Battle Simulation deployment. They are available in Tower Defence HQ Defense, Standard, Assault, Clear Defenses, Training, and Last Stand.',
    ],
  },
  {
    id: 'units',
    title: 'Unit roster',
    intro:
      'Fourteen buildable unit types per faction (historical names differ). <strong>Radio operators</strong> are one-man signals units that enable off-map support (max <strong>3 per side</strong>); <strong>Airborne paratroopers</strong> remain fire-support only (see Fire support). Icons match the Forces panel. Costs are supplies; build times are base seconds (longer in Standard).',
    units: true,
  },
  {
    id: 'difficulty',
    title: 'AI difficulty',
    body: [
      '<strong>Recruit</strong> — Weaker enemy damage, fewer resources, slower AI production and attacks.',
      '<strong>Regular</strong> — Balanced field opponent using the full command model.',
      '<strong>Veteran</strong> — Stronger firepower, faster AI, more aggressive captures and pushes.',
      'The Settings choice is saved in this browser and applies across every mode with enemy forces. Standard pacing stacks on top of it for longer matches; Clear Defenses uses it for defender strength. Training has no enemy AI.',
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
    desc: 'Rifle squads armed with service rifles, SMGs, and a squad LMG (Bren, BAR, MG34, DP-27, or Type 96). Cheap, flexible, excel in cover; throw hand grenades at tanks and tank destroyers within ~80 m after closing on the target.',
    tags: ['Cover', 'Retreat', 'AT grenade'],
  },
  {
    type: 'radioOperator',
    name: 'Radio operator',
    cost: 58,
    build: 10,
    range: 'Support ~720 m (binoculars ~1120 m) · rifle ~400 m',
    desc: 'One-man signals unit with a faction-specific backpack radio and rifle-only armament. Enables off-map fire support and airborne calls within ~720 m clear LOS; can raise binoculars for up to 45 s of extended observation (~1120 m); calling support while scanning ends the scan and applies a 3 min binocular cooldown; can dig and occupy trenches. Maximum <strong>three radio operators per side</strong> in every mode; extras extend the net and provide redundancy.',
    tags: ['Signals', 'Rifle', 'Binoculars', 'Trench', 'Fire support', 'Airborne', 'Cap 3/side'],
  },
  {
    type: 'medic',
    name: 'Medic',
    cost: 55,
    build: 9,
    range: '—',
    desc: 'Heals foot troops nearby; can deploy a field hospital tent that heals non-vehicle units in a radius.',
    tags: ['Heal', 'Tent', 'Support'],
  },
  {
    type: 'engineer',
    name: 'Engineer',
    cost: 62,
    build: 10,
    range: '~380 m',
    desc: 'Combat engineer squad (4) — rifles and SMGs for self-defence; throws hand grenades at nearby tanks; repairs vehicles and HQ within ~16 m; erects sandbags and bunkers and lays vehicle-triggered AT mines.',
    tags: ['Rifle', 'AT grenade', 'Repair', 'Build', 'Mines', 'Support'],
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
    name: 'Sniper team',
    cost: 78,
    build: 11,
    range: '~800–1,000 m (solo ~520–650 m)',
    desc: 'Two-man hide: scoped marksman plus observer, both in period concealment (British hessian ghillie, U.S. helmet scrim and burlap, German splinter smock, Soviet amoeba oversuit, or Japanese sedge netting). The spotter carries a service rifle at standard infantry range. If the spotter is killed, the sniper’s effective range drops until the team is restored.',
    tags: ['Cover', 'Team'],
  },
  {
    type: 'mortar',
    name: 'Mortar',
    cost: 75,
    build: 12,
    range: '~1,800–2,850 m',
    desc: 'High-angle HE; infantry soft targets and light vehicles.',
    tags: ['Fire mission', 'Cratering'],
  },
  {
    type: 'antiTankGun',
    name: 'Anti-tank gun',
    cost: '80–82',
    build: '14–15',
    range: '~700–860 m',
    desc: 'Towed AT gun — strong vs armor at medium range; aimed fire is more likely to turn turret-ring, visor, ammo, and engine hits into criticals. Slow reload, weak vs infantry.',
    tags: ['Anti-armor', 'Hold position'],
  },
  {
    type: 'truck',
    name: 'Truck',
    cost: '56–62',
    build: 11,
    range: '—',
    desc: 'Unarmed cargo lorry — load up to 3 foot units in the bed, or hitch an AT gun / howitzer for a tow. Soft-skinned; the driver bails with a rifle. Enemy AI uses trucks for lifts and tows.',
    tags: ['Transport', 'Tow guns', 'Unarmored'],
  },
  {
    type: 'armoredCar',
    name: 'Armored car',
    cost: 88,
    build: 13,
    range: '~850–1,000 m',
    desc: 'Fast wheeled recon; MG armament; partial armor vs rifles. Shell hits can damage wheels.',
    tags: ['Fire mission', 'Fast', 'Repairable wheels'],
  },
  {
    type: 'tank',
    name: 'Tank',
    cost: 120,
    build: 18,
    range: '~900–1,500 m',
    desc: 'Main gun plus coax MG (~520 m) for infantry; facing and slope affect protection; tracks can break.',
    tags: ['Fire mission', 'Directional armor', 'Repairable tracks', 'Wreck fire'],
  },
  {
    type: 'tankDestroyer',
    name: 'Tank destroyer',
    cost: '165–190',
    build: '21–23',
    range: '~1,200–2,000 m',
    desc: 'Long-range anti-armor specialist; high penetration, model-specific sloped or open-top protection, and repairable tracks.',
    tags: ['Anti-armor', 'Ambush', 'Directional armor', 'Repairable tracks', 'Wreck fire'],
  },
  {
    type: 'superHeavyTank',
    name: 'Top-tier armor',
    cost: '220–265',
    build: '25–29',
    range: '~1,000–1,600 m',
    desc: 'Faction’s strongest production tank. Most are heavy designs; Japan fields the late-war Type 3 Chi-Nu medium tank rather than a fictional super-heavy.',
    tags: ['Fire mission', 'Wreck fire', 'Anti-armor'],
  },
  {
    type: 'artillery',
    name: 'Artillery',
    cost: 90,
    build: 14,
    range: '10–12 km',
    desc: 'Long-range bombardment; crews reload ~11–13.5 s between shells.',
    tags: ['Fire mission', 'Cratering', 'Slow reload'],
  },
  {
    type: 'paratrooper',
    name: 'Airborne AT team',
    cost: 'Fire support',
    build: '—',
    range: '~400 m',
    desc: 'Elite paratroopers from Airborne Drop only — rifles/LMG vs soft targets; faction AT launcher plus hand grenades at close range vs armor; can dig and occupy trenches. Cannot be trained at HQ.',
    tags: ['Fire support', 'Anti-armor', 'AT grenade', 'Dual weapon'],
  },
];

const GUIDE_QUICK_STEPS = [
  ['Select', 'Use the Forces panel or drag a box around troops.'],
  ['Command', 'RMB to move or attack · Shift + LMB to fire.'],
  ['Support', 'Keep a radio operator alive for off-map strikes.'],
  ['Hold', 'Use cover, reinforce, and protect your HQ.'],
];

const MODE_NOTE_LABELS = [
  'Frontline Command',
  'Fortified Line',
  'Reinforcements & AI',
  'Combat Training',
  'Breakthrough',
  'Hold the Line',
  'Force-on-Force',
  'Manual deployment',
  'Preset battle group',
  'Victory conditions',
];

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function splitLeadingStrong(markup) {
  const match = String(markup).match(/^\s*<strong>([^<]+)<\/strong>([\s\S]*)$/);
  if (!match) return { title: '', body: String(markup) };
  return {
    title: match[1],
    body: match[2].replace(/^\s*[—–-]\s*/, ''),
  };
}

function plainGuideText(markup) {
  return String(markup)
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function guideExcerpt(markup, maxLength = 112) {
  const text = plainGuideText(markup);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function renderUnitCard(entry) {
  const tags = (entry.tags ?? [])
    .map((t) => `<li class="guide-tag">${escapeHtml(t)}</li>`)
    .join('');
  return `
    <article class="guide-unit-card" data-type="${escapeHtml(entry.type)}">
      <div class="guide-unit-card-head">
        <div class="guide-unit-icon" aria-hidden="true">${getUnitIconMarkup(entry.type)}</div>
        <div>
          <h4 class="guide-unit-name">${escapeHtml(entry.name)}</h4>
          <p class="guide-unit-meta">${escapeHtml(String(entry.cost))} supplies · ${escapeHtml(String(entry.build))}s build</p>
        </div>
      </div>
      <p class="guide-unit-range">${escapeHtml(entry.range)}</p>
      <p class="guide-unit-desc">${entry.desc}</p>
      ${tags ? `<ul class="guide-tag-list">${tags}</ul>` : ''}
    </article>
  `;
}

function renderFactionHeavyTable() {
  const rows = FACTION_LIST.map((f) => {
    const med = f.units.tank;
    const destroyer = f.units.tankDestroyer;
    const heavy = f.units.superHeavyTank;
    if (!med || !destroyer || !heavy) return '';
    return `
      <tr>
        <td><img class="guide-faction-flag" src="${escapeHtml(f.flag)}" alt="" width="28" height="18" loading="lazy" /> ${escapeHtml(f.name)}</td>
        <td>${escapeHtml(med.name)}</td>
        <td>${escapeHtml(destroyer.name)}</td>
        <td>${escapeHtml(heavy.name)}</td>
      </tr>
    `;
  }).join('');
  return `
    <div class="guide-faction-block">
      <h4 class="guide-subhead">Faction armor</h4>
      <div class="guide-table-wrap">
        <table class="guide-table guide-faction-table">
          <thead><tr><th>Nation</th><th>Medium tank</th><th>Tank destroyer</th><th>Top armor tier</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
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
      <div class="guide-table-wrap">
        <table class="guide-table guide-faction-table">
          <thead><tr><th>Nation</th><th>Designation</th><th>Combat range</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="guide-table-note">Dropped via <strong>Airborne</strong> fire support — five squads per call.</p>
    </div>
  `;
}

function renderFactionRadioTable() {
  const rows = FACTION_LIST.map((f) => {
    const radio = f.units.radioOperator;
    if (!radio) return '';
    return `
      <tr>
        <td><img class="guide-faction-flag" src="${escapeHtml(f.flag)}" alt="" width="28" height="18" loading="lazy" /> ${escapeHtml(f.name)}</td>
        <td>${escapeHtml(radio.name)}</td>
        <td>${escapeHtml(radio.designation)}</td>
        <td>${radio.supportRangeMeters ?? radio.supportRange * 10} m</td>
      </tr>
    `;
  }).join('');
  return `
    <div class="guide-faction-block">
      <h4 class="guide-subhead">Faction radio operators</h4>
      <div class="guide-table-wrap">
        <table class="guide-table guide-faction-table">
          <thead><tr><th>Nation</th><th>Role</th><th>Period set</th><th>Support radius</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="guide-table-note">Operators carry their own backpack set and rifle. Build or deploy more than one to keep support available after casualties and to cover separated sectors.</p>
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
        <td>${at.shellReload?.toFixed(1) ?? (1 / at.attackSpeed).toFixed(1)}s</td>
        <td>${at.cost} · ${at.buildTime}s</td>
      </tr>
    `;
  }).join('');
  return `
    <div class="guide-faction-block">
      <h4 class="guide-subhead">Faction anti-tank guns</h4>
      <div class="guide-table-wrap">
        <table class="guide-table guide-faction-table">
          <thead><tr><th>Nation</th><th>Designation</th><th>Range</th><th>Reload</th><th>Cost · build</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="guide-table-note">Towed guns hold position while firing. Strong vs tanks and armored cars; weak vs infantry. Aimed fire is more likely to critically hit turret rings, visors, ammunition, and engine decks.</p>
    </div>
  `;
}

function renderInfoCard(markup, index) {
  const lead = splitLeadingStrong(markup);
  const heading = lead.title ? `<h4>${escapeHtml(lead.title)}</h4>` : '';
  const body = lead.title ? lead.body : markup;
  return `
    <article class="guide-info-card">
      <span class="guide-note-index">Field note ${String(index + 1).padStart(2, '0')}</span>
      ${heading}
      <p>${body}</p>
    </article>
  `;
}

function renderModeCard(markup, index) {
  const lead = splitLeadingStrong(markup);
  const title = lead.title || MODE_NOTE_LABELS[index] || 'Field note';
  const body = lead.title ? lead.body : markup;
  const excerpt = guideExcerpt(lead.title ? lead.body : markup);
  return `
    <details class="guide-mode-card">
      <summary>
        <span class="guide-mode-index">${String(index + 1).padStart(2, '0')}</span>
        <span class="guide-mode-copy">
          <strong>${escapeHtml(title)}</strong>
          <small>${escapeHtml(excerpt)}</small>
        </span>
        <span class="guide-mode-toggle" aria-hidden="true"></span>
      </summary>
      <div class="guide-mode-detail"><p>${body}</p></div>
    </details>
  `;
}

function renderControlCard([key, action]) {
  return `
    <article class="guide-control-card">
      <kbd class="guide-control-key">${escapeHtml(key)}</kbd>
      <p>${action}</p>
    </article>
  `;
}

function renderControlEntry(entry) {
  if (entry?.type === 'heading') {
    return `<h4 class="guide-controls-heading">${escapeHtml(entry.title)}</h4>`;
  }
  return renderControlCard(entry);
}

function renderSection(section, index) {
  const parts = [];

  if (section.intro) {
    parts.push(`
      <div class="guide-intro-card">
        <span class="guide-note-index">At a glance</span>
        <p class="guide-intro">${section.intro}</p>
      </div>
    `);
  }

  if (section.body?.length) {
    if (section.id === 'modes') {
      parts.push(`<div class="guide-mode-grid">${section.body.map(renderModeCard).join('')}</div>`);
    } else {
      parts.push(`<div class="guide-body-grid">${section.body.map(renderInfoCard).join('')}</div>`);
    }
  }

  if (section.callout) {
    parts.push(`<aside class="guide-callout">${section.callout}</aside>`);
  }

  if (section.controls?.length) {
    parts.push(`
      <div class="guide-controls-grid">
        ${section.controls.map(renderControlEntry).join('')}
      </div>
    `);
  }

  if (section.units) {
    parts.push(
      `<div class="guide-unit-grid">${GUIDE_UNIT_CARDS.map(renderUnitCard).join('')}</div>`
    );
    parts.push(renderFactionHeavyTable());
    parts.push(renderFactionAtGunTable());
    parts.push(renderFactionRadioTable());
    parts.push(renderFactionParatrooperTable());
  }

  return `
    <section class="guide-section guide-section--${escapeHtml(section.id)}" id="guide-${section.id}">
      <h3><span class="guide-section-number">${String(index + 1).padStart(2, '0')}</span><span>${escapeHtml(section.title)}</span></h3>
      ${parts.join('')}
    </section>
  `;
}

export function renderGameGuideHtml() {
  const nav = GAME_GUIDE_SECTIONS.map(
    (s, index) =>
      `<a class="guide-nav-link" href="#guide-${s.id}"><span class="guide-nav-index">${String(index + 1).padStart(2, '0')}</span><span>${escapeHtml(s.title)}</span></a>`
  ).join('');

  const quickSteps = GUIDE_QUICK_STEPS.map(
    ([title, detail], index) => `
      <li class="guide-command-step">
        <span class="guide-step-index">${String(index + 1).padStart(2, '0')}</span>
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(detail)}</p>
      </li>
    `
  ).join('');

  return `
    <div class="guide-layout">
      <aside class="guide-rail">
        <span class="guide-rail-label">Contents</span>
        <nav class="guide-nav" aria-label="Field Manual sections">${nav}</nav>
        <div class="guide-rail-tip">
          <span>Field tip</span>
          <p>Open a note to expand the detail. Your reading position stays in this manual.</p>
        </div>
      </aside>
      <main class="guide-main">
        <section class="guide-quickstart" aria-labelledby="guide-quickstart-title">
          <div class="guide-quickstart-heading">
            <span class="guide-note-index">Before contact</span>
            <h3 id="guide-quickstart-title">The command loop</h3>
            <p>Four habits that keep a battle moving in your favour.</p>
          </div>
          <ol class="guide-command-loop">${quickSteps}</ol>
        </section>
        ${GAME_GUIDE_SECTIONS.map(renderSection).join('')}
      </main>
    </div>
  `;
}
