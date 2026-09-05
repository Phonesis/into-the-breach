# Into the Breach

A browser-based World War II real-time tactics game built with **Three.js** and **Vite**. Command a historically grounded combined-arms force across European, North African, Eastern Front, Far East, and Berlin theaters. Capture vital ground, build or reinforce your army, use fieldworks and fire support, and adapt to an enemy that changes its plan as the battle develops.

The title screen includes an illustrated **Field Manual** with the in-game controls, unit cards, faction equipment tables, and detailed battlefield rules. A persistent **Achievements** cabinet records medals, service ribbons, and superior-command commendations earned across operations.

## Quick start

**Requirements:** Node.js 18 or newer.

```bash
npm install
npm run dev
```

Open the URL printed by Vite, usually `http://localhost:5173`, then choose an operation, command, and theater.

Build and preview the production bundle locally:

```bash
npm run build
npm run preview
```

Browser audio is unlocked after the first click. Menu music plays on the title screen and stops when the operation begins.

## GitHub Pages

The project is configured as a GitHub project site at:

**https://phonesis.github.io/into-the-breach/**

The workflow in `.github/workflows/deploy-pages.yml` runs `npm run build:pages` and publishes `dist/` through GitHub Pages. Set the repository name in `vite.config.js` if the project is hosted under a different path.

```bash
npm run build:pages
npm run preview:pages
```

`preview:pages` serves the build with the `/into-the-breach/` base path.

## Audio and asset tools

Common asset generation commands:

```bash
npm run bake-sounds
npm run bake-engines
npm run bake-infantry-death
npm run bake-unit-select
npm run bake-unit-under-fire
npm run generate-menu-music
npm run generate-end-music
npm run generate-vehicle-svgs
```

The ElevenLabs scripts generate faction-specific rifles, machine guns, tank and anti-tank guns, artillery, aircraft, radio, commander, retreat, under-fire, and vehicle-crew audio. They require an environment variable and `ffmpeg`:

```bash
export ELEVENLABS_API_KEY=sk_...
npm run bake-elevenlabs-sfx
npm run bake-elevenlabs-sfx -- --force
npm run bake-elevenlabs-sfx -- --only explosion,rifle,mg
```

Additional focused bakes are listed in `package.json`, including `bake-elevenlabs-faction-rifles`, `bake-elevenlabs-tank-cannons`, `bake-elevenlabs-at-guns`, `bake-elevenlabs-artillery`, `bake-elevenlabs-aircraft`, `bake-elevenlabs-commander-orders`, and `bake-elevenlabs-retreat`. Keep `ELEVENLABS_API_KEY` in the environment; never commit it.

Generated audio is used from `public/sounds/` and music from `public/music/`. The license notes beside the supplied audio assets describe their permitted use.

## Operations

Choose an operation from **New Operation**, then select your faction and theater. The current operation names are:

| Operation | Rules |
|---|---|
| **Frontline Command** | The main skirmish against adaptive enemy AI. Use one **Central Command** HQ or, on a Large theater, **Forward Bases** with production depots and captured-sector expansion. Capture zones are enabled by default but can be disabled in theater setup for a pure force-on-force HQ battle. |
| **Combat Training** | A live-fire practice battle with no enemy AI. Train units, capture neutral sectors, test orders, and attack a passive practice HQ. |
| **Breakthrough** | A role-based assault or defensive battle on Medium or Large battlefields. Capture and hold the central frontline, or hold it until the timer expires. |
| **Fortified Line** | Assault prepared defenses or command the garrison. There are no HQs or capture-point economy; both sides receive timed reinforcement groups. |
| **Hold the Line** | Tower Defence with a choice of wave duration and defensive doctrine: build emplacements or raise a mobile HQ force. |
| **Force-on-Force** | A pure field engagement with no HQ, capture points, production, or reinforcements. Deploy a custom force or a preset battle group, then destroy the opposing force. |

### Frontline Command

Frontline Command is the longer-paced standard battle. Both sides begin with a radio operator and an infantry squad. Standard mode uses tougher units, reduced damage, slower income, longer production times, and a **30-living-unit limit** so that a battle can develop instead of snowballing immediately.

Choose one command structure on the theater screen:

- **Central Command** — one HQ trains every buildable unit type. Reinforcements appear in a ring around the HQ.
- **Forward Bases** — available on **Large** theaters only. Start with a radio operator and infantry squad, then construct an Infantry Garrison, Field Hospital, Ordnance Yard, Motor Pool, or Infantry Bunker at the HQ or a sector you control. Completed structures unlock and spawn their own unit categories; damaged vehicles can repair at a Motor Pool.

Theater setup keeps **Capture zones** on by default. Turn them off for a pure force-on-force operation: the three sector objectives, sector income, and capture-focused AI are removed, while HQ income, reinforcements, and HQ/army-elimination victory remain. Forward Bases can still construct around the HQ, but cannot expand from captured sectors when zones are disabled.

The opening **quiet sector** lasts about 32 seconds in Frontline Command. Combat fire, reinforcement queues, and base construction are held during the staging period, while move orders remain available inside the HQ staging ring. Click **Launch Battle Now** to begin immediately.

### Combat Training

Combat Training has no enemy AI. The passive practice HQ gives you a safe target while you learn selection, movement, capture points, production, manual fire, construction, fire support, and the Field Manual. Capture points begin neutral, and the HUD button reads **Leave Training** instead of Surrender.

### Breakthrough

Choose **Lead the Assault** or **Hold the Sector**. The central frontline begins under the defender’s control and the two flank sectors are neutral. The attacker wins by holding the frontline for **45 seconds**, destroying the defender HQ, or eliminating the assault force when it cannot recover. The defender wins by surviving **8 minutes**, destroying the assault HQ, or eliminating the assault force.

### Fortified Line

Choose **Assault the Position** or **Command the Garrison**. The map contains prepared defenses rather than headquarters or capture points. The assault force must clear every defender; the garrison must hold the line or destroy the attackers.

Both sides receive automatic reinforcement groups every **180 seconds** at their rear assembly area. Choose a package size before deployment:

| Size | Package |
|---|---|
| **Small** | Two units |
| **Medium** | Three to four units |
| **Large** | Five to six units |

The **15-minute assault deadline** is enabled by default. With the deadline enabled, the attacker must clear the position before the clock expires and the garrison wins by holding until the deadline. Disable it for an open-ended battle; a complete force wipe still ends the operation immediately.

### Hold the Line

Hold the Line offers two choices in each of two setup panels:

- **Battle Duration:** **Decisive Defence** ends after **12 waves**; **Lasting Defence** continues with escalating waves until defeat.
- **Defensive Doctrine:** **Prepared Positions** starts with **82 defence points** and a commander, bodyguards, and radio operator. Spend points on bunkers, MG nests, mortar pits, AT guns, mines, wire, tank traps, and artillery pits. **Mobile Defence** starts with supplies and an HQ, lets you train any unit type, and moves the frontline toward the HQ when attackers remain across it for 10 seconds.

Prepared Positions loses when the frontline is breached or the HQ falls. Mobile Defence loses when the HQ falls; clearing all 12 waves still wins Decisive Defence. Waves have preparation periods, and **Start Wave Now** skips the current preparation countdown. Enemy waves can include radio operators and call the same off-map support system.

### Force-on-Force

Force-on-Force has two deployment styles:

- **Manual Deployment** — spend a **2,000-supply** budget to place units anywhere valid on the battlefield. The AI matches your unit count with its own composition and selects a battle plan such as an armored thrust, defensive belt, infantry assault, flanking hook, reconnaissance push, fire preparation, or general advance.
- **Preset Battle Group** — automatically deploy a mirrored combined-arms roster in front, support, and reserve echelons. Choose **Small** (~24 units per side), **Medium** (~38, default), or **Large** (~68). Large is unavailable on Berlin and other dense urban maps. A field briefing presents the theater, weather, and enemy plan before combat.

There is no HQ, capture-point economy, production queue, or reinforcement system in either style. Click **Begin Battle** when deployment is complete. Strafe, bomb, barrage, and other support options become available after deployment, subject to radio range and the opening airborne cloud cover.

## Theaters and scale

| Theater | Historical setting | Battlefield character |
|---|---|---|
| **Normandy** | Operation Overlord, June 1944 | Bocage, hedgerows, farm tracks, and overcast skies |
| **North Africa** | Second Battle of El Alamein, October 1942 | Open desert, escarpments, dunes, and heat haze |
| **Eastern Front** | Battle of Kursk, July 1943 | Rolling steppe, treelines, and summer dust |
| **Italy** | Battle of Monte Cassino, January 1944 | Hill country, olive groves, stone tracks, and mountain mist |
| **Far East** | Guadalcanal, 1942–43 | Dense jungle, muddy tracks, kunai grass, and village clearings |
| **Berlin** | Outer districts, April 1945 | Connected streets, canal bridges, bombed parkland, and intact masonry |

The enemy is selected from the nations that historically fought in the chosen theater. Normandy, Italy, and North Africa pair Germany with the Western Allies; the Eastern Front pairs Germany with the Soviet Union; the Far East pairs Japan with the United States, while a German Far East operation faces the Soviet Union; and Berlin can draw from Germany, the United States, the United Kingdom, or the Soviet Union. The menu shows the resolved matchup before deployment.

Map scale is selected separately where the theater supports it:

| Scale | Use |
|---|---|
| **Small** | Tight engagement zone; the legacy battlefield dimensions |
| **Medium** | Expanded maneuver room; the default |
| **Large** | Grand theater with longer advances and wider flanks |

The scale multipliers are 1×, 1.75×, and 2.5×. Berlin is fixed at Medium. Breakthrough requires Medium or Large, Forward Bases requires Large, and Preset Battle Group Large is disabled on Berlin.

## Factions and units

There are **five playable factions**, each with **13 buildable unit types**. The unit cards in the Field Manual use the same icons as the Forces panel. Costs and ranges are faction-specific; the table gives the current base ranges.

| Unit | Role | Cost | Build | Typical range |
|---|---|---:|---:|---:|
| Radio operator | Signals, observation, and fire-support link | 58 | 10 s | Support 720 m; rifle ~400 m |
| Infantry | Rifle squad with SMGs and a squad LMG | 49–50 | 8 s | 420–500 m |
| Medic | Heals nearby foot troops and deploys field hospitals | 55 | 9 s | Support role |
| Engineer | Repairs, builds fieldworks, and lays AT mines | 62 | 10 s | 380–400 m |
| Machine gun | Sustained defensive fire and ground missions | 64–65 | 10 s | 800–1,000 m |
| Sniper | Long-range precision fire with an observer | 76–78 | 11 s | 800–1,000 m |
| Mortar | High-angle HE support | 74–75 | 12 s | 1,800–2,850 m |
| Anti-tank gun | Towed, slow-reloading direct-fire armor killer | 78–82 | 14–15 s | 700–860 m |
| Armored car | Fast wheeled reconnaissance and MG support | 84–88 | 13 s | 850–1,000 m |
| Tank | Medium armor, main gun, and coaxial MG | 108–120 | 17–18 s | 900–1,500 m |
| Tank destroyer | Long-range anti-armor specialist | 150–190 | 21–23 s | 1,200–2,000 m |
| Top armor tier | Faction’s strongest production tank | 220–265 | 25–29 s | 1,000–1,600 m |
| Artillery | Long-range indirect bombardment | 88–90 | 14 s | 10.5–12 km |

Frontline Command multiplies base build times by roughly **1.65×**. Commanders, bodyguards, bailed vehicle crews, and paratroopers are strategic or special units rather than normal HQ production choices. Airborne squads arrive through **Airborne Drop** fire support.

### Faction equipment

| Faction | Medium tank | Tank destroyer | Top armor tier | Anti-tank gun |
|---|---|---|---|---|
| **Germany** | Panzer IV Ausf. H | Jagdpanther | Tiger I Ausf. E | 7.5 cm Pak 40 · 720 m |
| **United States** | M4 Sherman | M10 Wolverine | M26 Pershing | 57 mm Gun M1 · 700 m |
| **United Kingdom** | Churchill Mk IV | Achilles IIC | Black Prince | QF 6-pounder · 720 m |
| **Soviet Union** | T-34-85 | SU-100 | IS-2 | ZIS-3 · 720 m |
| **Japan** | Shinhoto Chi-Ha | Type 1 Ho-Ni I | Type 3 Chi-Nu | Type 1 47 mm · 860 m |

Japan’s Type 3 Chi-Nu fills the game’s top armor tier while remaining a historically identified medium tank. Every faction also has its own infantry, MG, mortar, sniper, medic, engineer, radio, armored-car, artillery, and commander identities.

## Controls

| Input | Action |
|---|---|
| **LMB** | Select a unit or HQ; click a highlighted enemy to attack |
| **LMB drag** | Box-select units |
| **RMB** | Move, attack an enemy under the cursor, or mount selected foot troops on a friendly tank |
| **Exit vehicle crew** | Select a stopped operational vehicle and use the selection-panel action to leave an empty hull for your crew, eligible infantry or airborne, or the enemy to reclaim |
| **Shift + LMB** | Manual fire at open ground or cover scenery such as trees, hedges, and bunkers |
| **Alt + Shift + LMB** | Fire a smoke shell from one ready selected artillery piece; 45 s cooldown and 60 s screen |
| **Engage target** | Confirm the highlighted enemy in the selection panel |
| **Ctrl + E / M / A / R** | Select and cycle nearest engineer, medic, artillery, or radio operator |
| **WASD / arrows** | Pan the camera; left/right arrows rotate; mouse wheel or trackpad zooms |
| **Middle-mouse drag** | Hold and drag to tilt the camera like the arrow keys: horizontal movement rotates, vertical movement moves the view forward/back |
| **P** | Pause or resume; camera movement remains available while paused |
| **Esc** | Cancel targeting, fire missions, construction, deployment placement, or pending emplacement builds |
| **Tactical map** | Toggle the bottom-right minimap; click it to pan the main camera |
| **Field icons** | Toggle unit-type icons and world health bars above your forces |
| **Unit status** | Toggle markers such as Inspired, In Cover, Retreating, Surrendered, healing, and repair |
| **Capture circles** | Show or hide capture-zone rings without disabling capture or income |
| **Frontline** | Show or hide the red frontline in Breakthrough and Hold the Line |
| **Save** | Save the current operation in browser storage |
| **Continue Saved Battle** | Resume a saved operation from the title screen |
| **Strafe / Bomb / Barrage / Creep / Airborne** | Arm fire support, then click valid ground; Esc cancels |
| **Full Retreat / Hold Ground / Dig In** | Issue a commander-wide General Order |
| **Start Wave Now** | Skip a Hold the Line preparation period |
| **`?tablet=1`** | Force the tablet interface on a desktop browser |
| **`iddqd` or `?cheat=1`** | Enable cheat mode: unlimited supplies and instant builds |

On phones and tablets, play in **landscape**. The camera pad handles pan, rotation, and zoom; **Target** selects an enemy, **Fire** replaces Shift + LMB, and tapping the battlefield with units selected issues a move or attack order. On a tablet with a keyboard and mouse, disable **Tablet controls** in Settings to use the normal command scheme.

## Settings

Settings are saved in browser storage and apply across operations where relevant:

- **AI difficulty:** Recruit, Regular, or Veteran. Regular is the default; Combat Training has no enemy AI.
- **Battlefield interface:** Tactical map, Field icons, Unit status markers, Capture circles, and Frontline visibility.
- **Unit behaviour:** Seek Cover, Automatic radio positioning, Hold Ground by default, and Artillery auto-fire.
- **Build queue automation:** separate saved Auto Build preferences for the Central Command and Forward Bases structures in Frontline Command.
- **Battlefield Debris Despawn Delay:** 10 seconds, 30 seconds, 1 minute, 2 minutes, 5 minutes, or Permanent. Controls fallen troops, knocked-out vehicles, and spent ammunition; longer retention can reduce frame rate.

## Battlefield systems

### Command, capture, and reinforcement

Most operations use an HQ, supplies, and three capture sectors. Friendly units in a sector change its ownership and add its income. Frontline Command keeps these zones by default, but its theater option can remove them and their income for a pure HQ-focused force-on-force battle. Force-on-Force, Fortified Line, and Hold the Line do not use the ordinary capture-point economy.

The enemy AI produces units, captures ground, chooses attack plans, uses support weapons, builds cover, and regroups into crossfire, echelon, or defense-in-depth positions when a push is damaged. Its medics and engineers withdraw to covered support lines after treating wounded troops, repairing vehicles, restoring recoverable wrecks, or repairing a damaged HQ.

Losing all field units does not always end an HQ operation: a side is eliminated when its HQ is destroyed, or when it has no units, no queued production, and no way to afford or receive another reinforcement. The mode-specific objective always takes precedence.

### Fire support and radio operators

Off-map support has no friendly fire, but every call requires a living, operational radio operator. Each side can field at most **three** radio operators. Support calls also require a clear line of sight to a point within roughly **720 m** of the operator; buildings and smoke can block observation.

| Support | Cooldown | Effect |
|---|---:|---|
| **Air Strafe** | ~72 s | Faction-specific fighter pass with MG fire along the run |
| **Air Bomb** | ~118 s | One heavy GP bomb and crater |
| **Artillery Barrage** | ~95 s | Clustered shell impacts after warning markers |
| **Creeping Barrage** | ~148 s | Shell lifts advance along the attack axis |
| **Airborne Drop** | ~180 s | Five four-person paratrooper squads with faction-specific weapons |

Opening cloud cover grounds airborne operations for the first **five minutes of the battle**. Fortified Line and Force-on-Force allow one Airborne call per side for the whole operation; other modes use the normal cooldown. Drops cannot target within about 48 m of an opposing HQ.

**Automatic radio positioning** is enabled by default. If every radio operator is out of range, an out-of-range click creates a pending strike marker and moves the nearest operator toward a covered relay position. The strike fires when the operator can observe the target. Click the marker, select the operator, or give the operator a manual order to cancel it. Turn the setting off to position operators yourself.

Select a radio operator and press **Binoculars** to extend its observation range to roughly 1,120 m for 45 seconds. Calling an observable support strike ends the scan and applies a three-minute binocular cooldown; an expired scan without a call has no cooldown.

### General Orders

The **General Orders** panel provides **Full Retreat**, **Hold Ground**, and **Dig In**. Each has a three-minute cooldown and a 30-second command window. Orders require a living field commander; the active order can be cancelled early with its button or Esc. They are unavailable in Prepared Positions and during Force-on-Force deployment, but become available after a Force-on-Force battle begins.

- **Full Retreat** keeps units withdrawing toward the HQ or the Fortified Line starting zone.
- **Hold Ground** greatly reduces, but does not remove, automatic panic retreats.
- **Dig In** sends eligible commanders, radio operators, infantry, airborne, MG, and sniper units to dig and occupy trenches facing the enemy.

Vehicle identification uses projected wartime-style markings, including German Balkenkreuze, US stars, British recognition/squadron signs, Soviet tactical numbers and Japanese Army stars. See [vehicle marking schemes and historical exceptions](docs/vehicle-markings.md).

### Combat, cover, and morale

Combat uses line of sight, directional cover, range falloff, armor facing, slope, and sampled vehicle hit locations. Intact buildings block direct fire; mortars, artillery, and off-map barrages can fire indirectly over distant obstacles. Artillery has a minimum range of roughly 220 m and can fire smoke screens.

- Rifles and MGs cannot damage tanks, tank destroyers, or top-tier armor. Infantry, engineers, and airborne squads can throw close-range anti-tank grenades; dedicated AT guns, tank guns, tank destroyers, and artillery are the primary armor counters.
- Medium and top-tier tanks carry a separate coaxial MG for soft targets while the main cannon reloads. Tracked tanks pivot deliberately and can break tracks; armored cars can lose wheels.
- Some deflected tank and AT-gun shells survive as visible ricochets. They follow a short falling trajectory and can hit nearby units (including friendlies) or scenery with reduced damage and penetration. Each stops at its next impact; rockets do not ricochet.
- Cover is directional. Bunkers, sandbags, wrecks, and occupied trenches provide the strongest protection; hedges and stone walls provide medium cover. The **Seek Cover** setting routes eligible foot troops toward suitable cover on move orders.
- A nearby commander inspires troops within roughly 34 m, reducing automatic retreat and surrender pressure. One kill promotes a unit to Veteran; three kills promote it to Elite. Rank badges persist with the unit.
- Medics heal nearby foot troops and can deploy field hospital tents. Engineers repair vehicles, running gear, recoverable wrecks, and damaged HQs, and can build sandbags, bunkers, and AT mines.

### Trenches, surrender, and captured vehicles

Commanders, radio operators, infantry, airborne, MG teams, and snipers can dig trenches. Other eligible foot troops can occupy a friendly or empty enemy trench; occupied enemy trenches remain contested. Fortified Line garrison units do not retreat or surrender.

Isolated foot troops and gun crews under pressure may surrender. A friendly unit close by liberates them; an enemy close by captures them and marches them off the map. Surrendered units stop firing and are not targeted while surrendering.

Recoverable vehicle knockouts leave an intact, crewless hull. An engineer must restore a destroyed wreck before it can move or fire. Select a stopped operational vehicle and use **Exit vehicle crew** to deliberately leave an empty hull; its crew can re-enter, while infantry or airborne squads from **either side** can reman or capture it. Surviving bailed crews can reclaim their original vehicle. Tank riders can mount friendly tanks and super-heavies, fire from the hull, and bail out under fire.

### Battlefield persistence and reports

Destroyed units leave burning vehicles, fallen infantry, field-gun wrecks, and terrain craters. Wrecks provide neutral cover to foot troops from either side. Vehicle damage produces black engine smoke below 50% HP until repair or destruction. Bodies and wreck retention is controlled in Settings and saved battles retain visible battlefield casualties and wrecks.

The end-of-battle report includes victory or defeat detail, losses by unit type, prisoners captured, estimated 1944 USD materiel cost, and — in Hold the Line — emplacements lost and waves cleared. First-time achievements display an in-battle period notification with tier-specific ElevenLabs ceremonial audio; victory medals exist for every selectable mode and theater, alongside combat, medical, engineering, combined-arms, command, tank-ace, counter-battery, and no-loss operation citations.

## Audio and visual identity

- Faction-specific rifles, MGs, tank guns, AT guns, mortars, howitzers, radio acknowledgements, commander orders, retreat calls, under-fire shouts, and death effects.
- Vehicle engine and exhaust loops for tanks, tank destroyers, super-heavies, armored cars, and artillery, with dedicated track audio for stationary tank pivots.
- Spatial fighter and transport fly-bys for strafing, bombing, and airborne operations.
- Menu and end-of-battle music, pooled muzzle flashes and impacts, shell casings, craters, wreck fire, smoke, parachutes, and faction-specific unit/vehicle meshes.
- Detailed terrain surfaces across all six theaters, with matching surface relief and roughness, stones, dry grass, leaf litter, and wind-shaped sand. Restrained earth colours, irregular foliage, curved palm leaves, and outdoor light give the battlefield a more natural appearance.
- Shaped tank track belts with exposed road wheels, bevelled armor edges, raised hatch lids and handles, engine-deck grilles, rounded tyres, irregular camouflage, and distinct weathered paint, steel, rubber, canvas, leather, wood, and uniform fabric finishes.
- Browser rendering batches rigid vehicle fittings and foliage, reuses surface textures, and spreads casualty cleanup across short idle slices. Articulated guns, wreck deformation, texture resolution, and shadow resolution are retained.
- Theater-specific vehicle camouflage and historically named faction equipment. Vehicle SVG silhouettes are generated into `public/vehicles/svg/` from the proportions in `src/units/vehicleDesigns.js`.

## Project structure

```text
src/
  main.js                 # Application boot and menu → battle lifecycle
  data/
    factions.js           # Faction rosters, costs, ranges, and equipment
    maps.js               # Theaters, matchups, bases, and capture points
    mapSizes.js           # Small / Medium / Large scale presets
    gameModes.js          # Operation and setup rules
    gameGuide.js          # Field Manual content and unit cards
    baseBuildings.js      # Forward Bases structures and production unlocks
    towerDefense.js       # Hold the Line waves, doctrines, and emplacements
    fireSupport.js        # Off-map support definitions and cooldowns
    generalOrders.js      # Commander-wide orders
    lastStandForces.js    # Force-on-Force deployment and preset rosters
    lastStandTactics.js   # Adaptive Force-on-Force battle plans
  game/
    Game.js               # Main loop, modes, victory, saving, and resources
    AI.js / StandardAI.js # Enemy production, movement, support, and regrouping
    Combat.js             # Targeting, damage, armor, and weapon behavior
    ClearanceMode.js      # Fortified Line roles, reinforcements, and victory
    TowerDefenseMode.js   # Hold the Line wave state and frontline behavior
    LastStandMode.js      # Force-on-Force deployment and battle transition
    FireSupport.js        # Radio validation and strike execution
    InfantryTrench.js     # Trench placement, occupation, and cover
    TankRiders.js         # Mounting, dismounting, bailout, and remanning
    BattleSave.js         # Browser save/restore state
    BattleStats.js        # Battle reports and casualty economics
  units/                  # Unit behavior, meshes, textures, and vehicle design
  ui/                     # Menus, HUD, Field Manual, minimap, and tablet UI
  audio/                  # Sound manager, weapon profiles, music, and fly-bys
  effects/                # Combat, fire-support, destruction, and renderer FX
  visual/                 # Health bars, field icons, markers, buildings, and defenses
  world/                  # Terrain, maps, scenery, cover, trenches, and urban layouts
scripts/                  # Audio, music, vehicle SVG, and verification helpers
public/                   # Flags, sounds, music, vehicle references, and generated art
electron/                 # Optional native macOS desktop wrapper
```

## macOS desktop edition

The optional Electron wrapper packages the Vite game in a native macOS window without duplicating the game source. See [`electron/README.md`](electron/README.md) for the full workflow.

```bash
cd electron
npm install
npm start
```

Build an unsigned local DMG and ZIP, or a universal Apple Silicon/Intel package:

```bash
npm run dist:mac
npm run dist:mac:universal
```

Artifacts are written to `electron/release/`. Public distribution should add Developer ID signing and notarization.

## Tech stack and license

- **Three.js** for WebGL rendering, terrain, lighting, shadows, and effects
- **Vite** for development, bundling, preview, and GitHub Pages output
- No backend; the game is single-player and stores settings/saves in browser storage

Private prototype — adjust the license and distribution terms as required for your use.
