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
      '<strong>Clear Defenses</strong> — Dug-in defenders across the map; <em>no HQ, capture points, or sector economy</em>. You deploy a <strong>fixed attack force</strong> — <strong>no reinforcements</strong> and no supply economy. Destroy every defender (includes dug-in AT guns). Your force begins in a dispersed, layered rear assembly, outside the opening weapon reach of the initial defenders: infantry screen the front, armor and direct-fire weapons support the shoulders, and indirect-fire assets remain behind. Defenders hold fire ~10 s at start. <strong>Lose if every attacker is wiped out</strong>.',
      'On the <strong>Select Theater</strong> screen, Clear Defenses offers two styles: <strong>Classic</strong> keeps the original fixed-force rules; <strong>Reinforced</strong> gives both sides a small two-unit group every <strong>3 minutes</strong> at their rear assembly area. Packages rotate through infantry with MG, mortar, armor, or anti-tank support, and the top HUD counts down to the next arrival. In Reinforced, the defenders also launch frequent <strong>probing counterattacks</strong>: small mobile detachments leave their positions, pursue the surviving attackers for a limited time, then fall back to their defensive holds if the probe stalls.',
      '<strong>Training Ground</strong> — No enemy AI. Practice orders, capture, production, fire missions, and fire support vs a passive practice HQ. Button reads <strong>Leave Training</strong> instead of Surrender.',
      '<strong>Assault &amp; Defend</strong> — Pick <strong>Attack</strong> or <strong>Defend</strong> after choosing the mode. Central frontline (★) starts with the defender; flanks are neutral. Both sides field anti-tank guns; defenders start with an extra AT piece. The top HUD shows your role, objective, and a <strong>countdown timer</strong>: defenders see <strong>Hold until</strong> (8 minutes); attackers see <strong>Defender reinforcements</strong> counting down the same window. <strong>Attackers</strong> win by capturing the frontline and holding it for <strong>45 seconds</strong>, destroying the defender HQ, or wiping defenders when they cannot reinforce. <strong>Defenders</strong> win if the 8-minute timer expires, the assault HQ is destroyed, or the assault army is eliminated with no way to rebuild.',
      '<strong>Tower Defence</strong> — On the theater screen choose <strong>Wave Mode</strong> (<strong>12 Waves</strong> or <strong>Endless</strong>) and <strong>Defence Style</strong>: <strong>Emplacements</strong> (no player army — start with <strong>82 defense points</strong>, enough for one MG nest and one bunker; earn further points gradually while an assault is active and by destroying enemies, with tougher units worth more; no points accrue during the quiet preparation periods; spend them on bunkers, MG nests, mortar pits, AT guns, mines, wire, and artillery pits) or <strong>HQ Defense</strong> (spawn <strong>any unit type</strong> from your HQ with supplies — your troops <strong>cannot cross the frontline</strong> into enemy territory; if enemies stay past your side of the line for <strong>10 seconds</strong> the <strong>frontline retreats</strong> toward HQ). Assaults hit <strong>sections of the frontline</strong> from different angles; from roughly <strong>wave 10</strong> expect wider <strong>multi-sector flanking</strong>. Emplacement mode: guns fire automatically; <strong>barrage</strong> needs an artillery pit. HQ Defense: strafe/barrage available; earn supplies from HQ income and destroying attackers. Between waves, <strong>Start Wave Now</strong> skips the prepare timer. <strong>Emplacements</strong> — lose if the line is breached (10 s grace) or HQ falls. <strong>HQ Defense</strong> — lose only if HQ is destroyed (12 waves still wins in standard mode).',
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
      ['RMB (construction unit)', 'Move the selected unit; cancels its pending placement or active sandbag, trench, or tent construction'],
      ['Shift + LMB', 'Fire at open ground or cover (trees, hedges, bunkers) — all combat units in range'],
      ['Alt + Shift + LMB', 'One ready selected artillery piece fires smoke at open ground — 45s cooldown; blocks line of sight for 60s'],
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
      'Vehicle finishes include rolled-steel surface wear, while towed guns use faction-specific equipment details. Towed <strong>anti-tank guns</strong> have a visible two-man detachment; <strong>artillery</strong> has a three-man detachment with ready ammunition. Their camouflage follows the selected theater: muted hedgerow colors in <strong>Normandy</strong>, sand and light-stone schemes in <strong>North Africa</strong>, field green and earth tones on the <strong>Eastern Front</strong>, and dusty olive/earth finishes in <strong>Italy</strong>.',
      'Units continuously follow the local terrain height and lean into hills and side-slopes. Vehicles, towed guns, crews, and mounted tank riders stay aligned to the ground instead of being clipped by rising terrain.',
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
      'Losing every unit on the field does <em>not</em> end the battle if your HQ stands and you can still reinforce (queue, affordable build, or income). Both <strong>Clear Defenses</strong> variants have no production queue and lose when every attacker is gone; the Reinforced variant adds its surviving scheduled groups every three minutes.',
      'Eliminated when your HQ is destroyed, or you have no units, empty queue, and cannot afford any unit with no income to recover.',
      'The enemy follows the same rule in Standard and Assault: wipe their army only sticks if their HQ is gone or they cannot produce.',
      'In <strong>Classic</strong>, enemy AI trains from its HQ — new units appear around headquarters when builds complete. In <strong>Base Building</strong>, the AI builds structures at HQ and captured sectors and spawns at the matching depot or garrison.',
      'Enemy AI can call off-map support in Standard, Assault &amp; Defend, and active Battle Simulation, and can construct sandbags, field bunkers, and trenches when it has suitable units. It also moves eligible infantry into buildings and cover.',
    ],
  },
  {
    id: 'combat',
    title: 'Combat',
    body: [
      'LMB on an enemy (with units selected) issues an attack. Hover highlights valid targets; use <strong>Engage target</strong> or LMB on the highlighted enemy. Click the <strong>enemy HQ</strong> directly, or click the ground within ~18 m of it — units in range fire on the headquarters until it is destroyed (enemy defeat). RMB near the HQ also issues an attack order instead of a move.',
      '<strong>Shift + LMB</strong> orders manual fire for selected combat units in range: click <strong>cover</strong> (trees, hedges, bunkers) to destroy it, or <strong>open ground</strong> for a fire mission. Works for every fighting unit — infantry, tanks, AT guns, and artillery. A red reticle appears on the cursor while Shift is held. <strong>RMB move</strong> or <strong>Esc</strong> cancels active fire missions.',
      '<strong>Smoke shells</strong> (artillery counter to AT guns): select artillery → <strong>Smoke shell</strong> button or <strong>Alt+Shift+LMB</strong> on open ground. One ready selected howitzer fires; that gun then needs <strong>45 seconds</strong> to prepare another smoke round. A grey cloud lasts <strong>60 seconds</strong> (~200 m wide). Enemies firing through the screen have no clear line of sight — about <strong>82% of shots miss</strong> (blind fire). Enemy artillery also uses smoke tactically to screen assaults from tanks and AT guns.',
      'Idle combat units automatically acquire and fire at the nearest valid enemy inside weapon range. Their per-unit <strong>engagement stance</strong> controls movement: <strong>Hold Ground</strong> is the default and fires without chasing; <strong>Pursue</strong> follows an enemy that begins fleeing after entering range. Select one or several units and choose the stance in the selection panel. A direct player attack order still tells units to close with that chosen target. Damage falls off with distance. <strong>Infantry, paratroopers, and engineers</strong> use dispersed wedge, staggered-column, line, and echelon formations; squads smoothly reorganize into a different formation when they begin a new movement. Stationary squads automatically go prone while firing, then rise again when ordered to move. Mounted troops and soldiers fighting from trenches keep their appropriate mounted or dug-in stance.',
      'Tanks and <strong>super heavy tanks</strong> carry a <strong>coax machine gun</strong> (~520 m) alongside the main gun — effective vs infantry and soft targets; tanks close on soft targets and use the coax instead of wasting main-gun rounds. Main cannons reload deliberately: medium tanks take about <strong>6.5 s</strong> and heavy tanks about <strong>8.5 s</strong> between shots. Rifle, MG, and sniper bullets cannot damage tanks. However, <strong>infantry, paratroopers, and engineers</strong> that close to within about <strong>80 m</strong> automatically throw a hand grenade for light armor damage, then wait roughly <strong>9.5–11 s</strong> before throwing another. Grenades deal about <strong>12 damage</strong> to standard tanks and reduced damage to super heavies; mounted tank riders cannot throw. Dedicated AT guns, mortars, tank guns, and artillery remain far more effective. Super heavies are slower, tougher, and hit harder. <strong>Anti-tank guns</strong> (~600 m) are dangerous vs armor at medium range but reload slowly, fall off at long range, and are very weak vs infantry — close under smoke or swarm with riflemen. Mortars, tank guns, and artillery are strong anti-armor.',
      '<strong>Armor penetration:</strong> Direct tank and anti-tank shells test the firing gun against the target vehicle\'s historical protection, impact range, armor facing, slope, and horizontal strike angle. Glancing or underpowered hits can <strong>ricochet/deflect for no hull damage</strong>. Side and rear shots are easier to penetrate; rear engine decks, ammunition stowage, turret rings, driver visors, and open fighting compartments are <strong>weak spots</strong> that can cause maximum damage. Jagdpanther and SU-100 frontal slopes are especially effective, while the open-topped M10 and Achilles trade protection for powerful guns. Flank heavy armor instead of trading shots against its front plate.',
      '<strong>Mobility damage:</strong> Shells can break a tank\'s <strong>track</strong> or an armored car\'s <strong>wheel</strong>, especially on side hits. The vehicle becomes completely <strong>immobile</strong> and cancels movement, but can keep firing. Keep a combat engineer within ~16 m until the orange repair status reaches 100%; one engineer needs roughly <strong>9 seconds</strong> at point-blank range. The spanner marker appears while work is underway, and mobility damage persists in saved battles.',
      '<strong>Tank riders:</strong> Select <strong>foot troops only</strong> (infantry, paratrooper, MG, sniper, medic, engineer) and <strong>RMB</strong> a friendly <strong>tank</strong> or <strong>super heavy</strong> to mount the rear deck — up to <strong>2</strong> riders on a medium tank, <strong>3</strong> on a super heavy. Riders are visible on the hull, can fire while mounted, and move with the tank. Select a <strong>stationary</strong> tank with riders and press <strong>Dismount infantry</strong> in the selection panel to bail them out. If the tank comes under fire, riders <strong>auto-dismount</strong> beside the vehicle. Order a rider to move elsewhere to dismount individually.',
      'Armored cars take partial infantry and machine-gun damage (~32%), but sniper rounds cannot damage them. Mortars, anti-tank guns, tank guns, and artillery remain effective.',
      'Damaged units may <strong>retreat</strong> toward their HQ (RETREAT tag) and stop attacking until safe. Troops in <strong>heavy cover</strong> (sandbags, wrecks, and similar hard shelter) are much less likely to panic-retreat; troops fully <strong>inside buildings or bunkers</strong> receive the strongest morale protection, though even they can still break when badly mauled. Dug-in trench troops also stand firmer. <strong>Medics</strong> nearby reduce retreat chance further and slowly heal infantry, MG, mortar, sniper, and bailed vehicle-crew teams — a <strong>green cross</strong> floats above units being healed. <strong>Engineers</strong> repair nearby vehicles and broken running gear, steady panicked tank and gun crews, and — when within ~16 m of a damaged <strong>HQ</strong> — restore headquarters HP (spanner icon on the engineer and repair target). A recoverable vehicle wreck takes roughly <strong>12 seconds</strong> for one close engineer to restart and returns at about <strong>28% HP</strong>, but remains immobile and unable to fire until remanned. Select an <strong>infantry or paratrooper squad</strong> and right-click the repaired tank: two troops become its crew and the remaining squad members ride on the hull. Vehicles below half HP trail <strong>black engine smoke</strong> until repaired. Defenders in Clear Defenses do not retreat. Use <strong>General Orders</strong> (see below) to pull everyone back or stiffen the line during a push.',
      '<strong>Surrender:</strong> Foot troops and gun crews cut off from allies while taking fire may <strong>surrender</strong> (SURRENDER banner). They hold position, stop shooting, and are ignored by fire. Move a <strong>friendly within ~11 m</strong> to <strong>liberate</strong> them; let an <strong>enemy within ~11 m</strong> <strong>capture</strong> them — captured troops march off the map and count as casualties. Tanks, armored cars, and artillery never surrender. Dug-in Clear Defenses defenders never surrender.',
      '<strong>Veteran &amp; Elite:</strong> <strong>1 enemy kill</strong> promotes a unit to <strong>veteran</strong> (~9% more damage, steadier under fire, modest morale pressure on foes), shown by a <strong>bronze roundel and service chevron</strong>. <strong>3 kills</strong> upgrades them to <strong>elite</strong> (~18% damage, much less likely to retreat, stronger morale shock), shown by a distinct <strong>crimson crowned shield</strong>. Enemies hit by or fighting near veterans/elites are more likely to <strong>retreat or surrender</strong>. Rank persists on that unit; newly spawned reinforcements start fresh.',
      '<strong>Engineer field works:</strong> Select an engineer → <strong>Build sandbags</strong> or <strong>Build bunker</strong> → LMB a valid location, then point the yellow facing arrow toward the expected threat and LMB again to confirm. The engineer automatically moves to the site and starts once close enough. <strong>Sandbags</strong> (~11 s) are quick heavy-cover fighting pits. <strong>Bunkers</strong> (~28 s) are sturdier emplacements that <strong>garrison foot troops</strong> (infantry, MG, sniper, medic, engineer) — move a squad onto the completed bunker to enter. Garrisoned units take heavy-cover reduction and can fire out; order a move to exit. A new move order cancels travel or construction. In <strong>Base Building</strong> mode engineers can only build bunkers (max 6 per base, shared with HQ bunkers). Available in all modes including Tower Defence HQ Defense (when you have engineers). Esc cancels either placement step.',
      '<strong>Infantry trenches:</strong> Select infantry, MG, or sniper → <strong>Dig trench</strong> → LMB a valid location, then aim the yellow facing arrow and LMB again. The unit walks there, digs for ~14 s, then drops into the trench (crouched). Other foot troops can move onto a <strong>friendly or empty enemy trench</strong> to dig in for medium-heavy cover; occupied enemy trenches remain contested and cannot be entered. Order a move to leave or cancel digging. Esc cancels placement.',
      '<strong>Medic field hospital tent:</strong> Select a medic → <strong>Field hospital tent</strong> → LMB a valid location. The medic walks to the site before pitching it; after ~16 s the tent is up. <strong>Non-vehicle units</strong> (infantry, MG, sniper, mortar, medics, engineers) within ~12 m slowly heal. A move order during travel or deployment cancels the tent. Max 4 tents per side. Esc cancels placement.',
      '<strong>Standard bunkers:</strong> Engineer field bunkers in <strong>Classic</strong> Standard, or <strong>Infantry Bunkers</strong> from Base Construction (95 supplies) in Base Building — click a site near HQ or a sector you hold, then click the direction the bunker should face. Garrison up to <strong>2</strong> foot troops each. Move units onto a friendly or <strong>empty enemy bunker</strong> to enter; occupied enemy bunkers remain unavailable. Order a move away to exit.',
      'Destroyed units leave wrecks on the field: <strong>burning tanks</strong>, <strong>fallen infantry bodies</strong> (faction camo, prone on the ground), and knocked-out vehicles. Corpses and wrecks that remain on the battlefield are retained in saved games. Vehicle wrecks provide neutral cover to foot troops from <strong>either side</strong>. About <strong>one third</strong> of tank, super-heavy, and armored-car knockouts are recoverable: a smaller explosion and persistent smoke mark the shell-damaged hull, its turret stays in place, and a two-man crew visibly climbs from the hatch to continue fighting with small arms. An engineer can restore the hull even if those crewmen later die; infantry or paratroopers can then reman it. A lethal rear hit has a high chance to trigger a catastrophic ammunition chain reaction; those vehicles produce no survivors and cannot be repaired. During a sustained frame-rate drop, the oldest and most distant bodies are cleared first, followed only if necessary by non-repairable wrecks; repairable hulls are always protected. Cover and retreat markers disappear on death.',
      'Small-arms tracers only; tanks and artillery use impact VFX. Every mortar round produces a visible medium shell explosion where it lands. Heavy fire can scar terrain (craters). <strong>Mortar teams</strong> stow their weapon while moving, deploy it when stationary, turn the elevated tube toward their target, and fire from the actual tube muzzle.',
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
      '<strong>Seek Cover</strong> (General Orders panel) — toggle <strong>On</strong> so infantry, MG, sniper, medic, and engineer <strong>move orders</strong> route to the nearest cover near your click (hedges, pits, sandbags, bunkers) instead of open ground. Tanks and other vehicles still go where you click. Preference is saved in the browser.',
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
      '<strong>Strafing run</strong> (~72 s cooldown) — Fighter pass with spatial fly-by audio and MG bursts along your line.',
      '<strong>Artillery barrage</strong> (~95 s cooldown) — Shell warnings, then clustered impacts.',
      '<strong>Creeping barrage</strong> (~148 s cooldown) — Slower recharge; shells advance in lifts along your attack axis and concentrate maximum fire on the point you click.',
      '<strong>Airborne drop</strong> (~180 s cooldown) — A transport passes overhead; <strong>five elite paratrooper squads</strong> (four men each) descend by parachute on your target zone. Drops cannot target within about <strong>48 m of the opposing HQ</strong>, preventing an immediate HQ assault; Battle Simulation is unaffected when no HQ exists. They are <strong>not</strong> built from HQ — only called this way. On landing they fight with <strong>rifles and squad LMG</strong> vs infantry and <strong>anti-tank launchers</strong> (Panzerfaust, bazooka, PIAT, RPG-43, etc. by nation) vs tanks, tank destroyers, and armored cars. AT shots reload slowly (~4.5 s).',
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
      'Twelve buildable unit types per faction (historical names differ). <strong>Airborne paratroopers</strong> are fire-support only (see Fire support). Icons match the Forces panel. Costs are supplies; build times are base seconds (longer in Standard).',
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
    desc: 'Rifle squads — cheap, flexible, excel in cover; throw hand grenades at tanks and tank destroyers within ~80 m after closing on the target.',
    tags: ['Cover', 'Retreat', 'AT grenade'],
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
    desc: 'Combat engineer squad (4) — rifles and SMGs for self-defence; throws hand grenades at nearby tanks; repairs vehicles and HQ within ~16 m; erects sandbags and bunkers in the field (bunkers only in Base Building).',
    tags: ['Rifle', 'AT grenade', 'Repair', 'Build', 'Support'],
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
    desc: 'Fast wheeled recon; MG armament; partial armor vs rifles. Shell hits can damage wheels.',
    tags: ['Fire mission', 'Fast', 'Repairable wheels'],
  },
  {
    type: 'tank',
    name: 'Tank',
    cost: 120,
    build: 18,
    range: '~1,200–1,500 m',
    desc: 'Main gun plus coax MG (~520 m) for infantry; facing and slope affect protection; tracks can break.',
    tags: ['Fire mission', 'Directional armor', 'Repairable tracks', 'Wreck fire'],
  },
  {
    type: 'tankDestroyer',
    name: 'Tank destroyer',
    cost: '165–190',
    build: '21–23',
    range: '~1,800–2,000 m',
    desc: 'Long-range anti-armor specialist; high penetration, model-specific sloped or open-top protection, and repairable tracks.',
    tags: ['Anti-armor', 'Ambush', 'Directional armor', 'Repairable tracks', 'Wreck fire'],
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
    desc: 'Elite paratroopers from Airborne Drop only — rifles/LMG vs soft targets; faction AT launcher plus hand grenades at close range vs armor. Cannot be trained at HQ.',
    tags: ['Fire support', 'Anti-armor', 'AT grenade', 'Dual weapon'],
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
      <table class="guide-table guide-faction-table">
        <thead><tr><th>Nation</th><th>Medium tank</th><th>Tank destroyer</th><th>Super heavy</th></tr></thead>
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
