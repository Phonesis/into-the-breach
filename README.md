# Into the Breach

A browser-based real-time strategy game set in the European theater of World War II. Built with **Three.js** and **Vite**. Command infantry, machine-gun teams, snipers, mortars, armored cars, tanks, super-heavy armor, and artillery across historical maps; capture supply points; queue reinforcements at your headquarters; and call in air and artillery fire support.

Open **Field Manual** from the title screen or during a battle for a illustrated in-game guide (unit icons, control reference, faction armor table).

## Quick start

**Requirements:** Node.js 18+ (for npm).

```bash
npm install
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`). Choose a game mode, faction, and map from the main menu.

Optional — regenerate procedural gunfire SFX (used when present under `public/sounds/`):

```bash
npm run bake-sounds
```

Faction selection shows country flags from `public/flags/`. Battle SFX unlock after your first click (browser audio policy).

Production build:

```bash
npm run build
npm run preview
```

---

## Game modes

| Mode | Description |
|------|-------------|
| **Campaign** | Full skirmish vs AI with difficulty selection. Longer-paced battles. Win by destroying the enemy HQ or eliminating their army when they cannot reinforce. |
| **Clear Defenses** | Enemy dug in across the map — **no enemy HQ**. Destroy every defender. Opening ceasefire; your force stages behind your HQ. |
| **Training Ground** | No AI — practice orders, production, fire missions, and fire support. Destroy the passive **Practice Target HQ**. |
| **Assault & Defend** | Scenario on a fixed frontline. Pick **Attack** or **Defend** after choosing the mode. |

### Campaign

- Opponent faction mirrors your pick (e.g. USA vs Germany).
- **Difficulty:** Easy, Medium, or Hard — adjusts enemy damage, income, army size, and AI aggression.
- **Pacing:** Higher unit HP, lower damage, slower HQ/capture income, longer build times, larger opening armies, and slower AI reinforcement (see `src/data/campaignPace.js`).
- AI produces units, captures points, and attacks.
- Starting armies: 5× infantry, MG, mortar, 2× tank, artillery (enemy scaled by difficulty + campaign army mult).

**Victory:** Enemy HQ destroyed, or enemy eliminated (no field units and cannot reinforce).

**Defeat:** Your HQ destroyed, or you are eliminated (no units, empty build queue, and cannot afford reinforcements while your HQ still generates income you can use to recover).

### Clear Defenses

- No enemy HQ or enemy production.
- Defenders placed at capture points, forward lines, and map center; they hold position and do not retreat.
- **10 s** opening ceasefire — defenders do not fire so your staged army is not wiped on deploy.
- Player army spawns ~20 m behind your HQ.
- **160** starting supplies; standard HQ/capture income.
- **Victory:** All defenders destroyed. **Defeat:** Your HQ falls, or your army is wiped with no way to rebuild.

### Training Ground

- No `updateAI` — enemy does not move, produce, or fight back.
- All capture points start **neutral**.
- **200** starting supplies, **5**/sec passive HQ income.
- **Victory:** Destroy the practice HQ.
- Surrender button reads **Leave Training** (same flow as defeat → Main Menu).

### Assault & Defend

Pick **Attack** or **Defend** in the menu. Central **frontline** capture point (★ in HUD); flank points stay neutral for supplies.

| Side | Spawn | Starting army (approx.) | Starting supplies |
|------|--------|-------------------------|-------------------|
| **Defender** | West base (`playerBase`) | 3 inf, MG, mortar, 1 tank, arty | 160 (player if defending) |
| **Attacker** | East base (`enemyBase`) | 4 inf, MG, mortar, 2 tanks, arty | 160 (player if attacking) |

- Frontline starts **owned by the defender** (100% capture progress).
- **3 second** grace period before elimination / hold / timeout checks.

**Attacker wins if any of:** holds frontline **45 s** continuously; destroys defender HQ; eliminates defenders when they cannot reinforce.

**Defender wins if any of:** survives **8 minutes**; destroys attacker HQ; eliminates assault force when they cannot reinforce.

---

## Factions & units

Three playable factions, each with **eight** buildable unit types. Ranges in the HUD use **meters** (`rangeMeters`); combat uses world-space range with distance falloff.

| Type | Role | Supply cost | Build time (s) |
|------|------|-------------|----------------|
| Infantry | Riflemen + squad automatic weapon | 50 | 8 |
| Machine gun | Fixed MG team, sustained fire | 65 | 10 |
| Sniper | Long-range precision eliminations | 72 | 11 |
| Mortar | High-angle infantry support | 75 | 12 |
| Armored car | Fast MG-armed recon / fire support | 88 | 13 |
| Tank | Medium armored breakthrough | 120 | 18 |
| Super heavy tank | Slow, very tough breakthrough armor | 255–265 | 27–29 |
| Artillery | Long-range bombardment | 90 | 14 |

Campaign multiplies build times by **~1.65×**.

### Super heavy tanks (by faction)

| Faction | Unit | Notes |
|---------|------|--------|
| Germany | Tiger I Ausf. E (8.8 cm) | Highest HP; slowest |
| United States | M26 Pershing (90 mm) | Late-war heavy |
| United Kingdom | Black Prince (17-pdr) | Super-heavy infantry tank |

### Germany (Wehrmacht) — other units

| Unit | Designation | Game range (m) |
|------|-------------|----------------|
| Grenadier Squad | Kar98k + squad LMG | 420 |
| MG 42 Team | MG 42 | 1,000 |
| 8 cm Granatwerfer | 8 cm mortar | 1,900 |
| Panzer IV Ausf. H | 7.5 cm KwK 40 | 1,500 |
| leFH 18/40 | 10.5 cm howitzer | 10,500 |
| Sd.Kfz. 222 | Armored car | 950 |

### United States — other units

| Unit | Designation | Game range (m) |
|------|-------------|----------------|
| Rifle Squad | M1 Garand / BAR | 500 |
| Browning MG Team | M1919A4 | 1,000 |
| M2 Mortar Squad | 60 mm M2 | 1,800 |
| M4 Sherman | 75 mm M3 | 1,400 |
| M101 Howitzer | 105 mm M2A1 | 11,000 |
| M8 Greyhound | Armored car | 1,000 |

### United Kingdom — other units

| Unit | Designation | Game range (m) |
|------|-------------|----------------|
| Rifle Section | Lee–Enfield / Bren | 450 |
| Vickers MG Team | Vickers .303 | 950 |
| 3-inch Mortar Team | ML 3-inch | 2,000 |
| Churchill Mk IV | 75 mm QF | 1,200 |
| 25-pounder Gun | QF 25-pdr | 12,000 |
| Daimler AC | Armored car | 980 |

**Selection:** LMB on a unit, drag a **box** on the ground, or click a row in the **Forces** panel (left). Shift-click adds to selection. Tanks use an invisible pick sphere. Selected units show a **range ring** and stats (designation, HP, range, cover % for infantry/MG).

---

## Controls

| Input | Action |
|-------|--------|
| **LMB** | Select unit / HQ |
| **LMB drag** | Box-select multiple units |
| **RMB** | Move to ground, or **attack** enemy unit/HQ under cursor |
| **Shift + LMB** | **Fire mission** on open ground (in range) — red reticle while Shift held |
| **Alt + click** | Attack trees, hedges, bunkers (cover scenery) |
| **WASD / arrows** | Pan camera |
| **Mouse wheel / trackpad** | Zoom |
| **Forces panel** | Click to select; Shift-click to add |
| **Engage target** | Confirm attack on highlighted enemy (selection panel) |
| **Launch Battle Now** | Skip quiet-sector staging (countdown banner) |
| **Surrender** | End battle as defeat → casualty screen → **Main Menu** |
| **Production buttons** | Queue unit at your HQ (when HQ is alive) |
| **Strafe / Barrage** | Arm fire support, then **LMB** on map; **Esc** cancels targeting |

**Fire mission** units: machine gun, mortar, armored car, tank, **super heavy tank**, artillery. **RMB move** cancels an active fire mission.

---

## Economy & capture points

| Mode | Player start | Enemy start | HQ income (/sec) | Per captured point (/sec) |
|------|--------------|-------------|------------------|---------------------------|
| Campaign | 150 | 110 × difficulty | 2.1 | 4.2 |
| Training | 200 | — | 5 | 6 |
| Assault | 160 | 140 | 3 | 6 |
| Clear Defenses | 160 | — | 3 | 6 |

Each map has **three** capture points (Assault: frontline pre-held by defender, flanks neutral). Stand friendly units in a zone to flip ownership; income stacks per point held.

**Quiet sector:** ~**32 s** in Campaign / Assault — no combat fire; units must stay inside the HQ staging ring. **Launch Battle Now** on the banner skips the wait. Clear Defenses: **10 s** ceasefire for your staged forces.

**Production:** Up to **4** queued items per HQ. New units spawn in a ring around your HQ. Reinforcements spawned mid-battle receive campaign HP scaling in Campaign mode.

**Elimination rule:** Wiping all field units does **not** end the battle if that side’s HQ is intact and they still have units building, can afford a build, or (in modes with income) can recover via supplies. See `src/game/EliminationRules.js`.

---

## Combat

- **Explicit attack orders:** RMB on an enemy unit or HQ; or **Engage target** when hovering a highlighted enemy.
- **Move:** RMB on open ground (clears attack order and fire missions).
- **Fire mission:** **Shift + LMB** on open ground for bombardment-capable units (see controls).
- **Defensive fire:** Units engage enemies in range when idle or while executing orders in range.
- **Range falloff:** Damage scales with distance inside max range.
- **Difficulty:** Enemy damage multiplier varies by Easy / Medium / Hard; Campaign also applies a global damage multiplier (~0.58).
- **Armor:** Tanks and **super heavies** resist rifles/MGs (~20%); **armored cars** take partial small-arms damage (~32%). Snipers, mortars, and tank guns are effective anti-armor.
- **Retreat:** Damaged units may fall back to their HQ (**RETREAT** marker) and stop attacking until safe. Clear Defenses defenders do not retreat.
- **Casualties:** Destroyed units leave **wrecks** — burning tanks, fallen infantry, knocked-out vehicles. Cover and retreat markers are cleared on death.
- **Tracers:** Short streaks for infantry/MG only; tanks and artillery use impact VFX without bullet tracers.

Heavy hits leave **terrain craters** (capped for performance). Muzzle flashes and impacts are pooled/throttled.

---

## Cover

Infantry and **machine gun** teams only.

| Tier | Damage taken | Reduction | Examples on maps |
|------|--------------|-----------|------------------|
| Heavy | **~22%** | ~78% | Concrete bunkers, sandbag nests |
| Medium | **~38%** | ~62% | Bocage hedges, stone walls |
| Light | **~55%** | ~45% | Fighting pits, shell scrapes |

Bonus applies only while the unit stays in the zone. **Alt + click** to order units to destroy scenery (bunkers, hedges, brush). Selected infantry/MG show an **IN COVER** banner, a foot ring, and exact damage % on the selection panel. Tanks, super heavies, mortars, and artillery ignore cover.

---

## Fire support

One-use tactical strikes (HUD). **No friendly fire** on your own units/HQ.

| Strike | Cooldown | Effect |
|--------|----------|--------|
| **Strafing run** | ~72 s | Fighter passes along the target line; MG bursts |
| **Artillery barrage** | ~95 s | ~14 shells with warning markers, then impacts |

Click **Strafe** or **Barrage** → **LMB** on valid ground → brief warning → strike.

---

## Maps

| Map | Theater | Terrain flavor |
|-----|---------|----------------|
| **Normandy** | France | Bocage, hedgerows, moderate hills |
| **North Africa** | Libya | Desert ridges, dunes, open ground |
| **Eastern Front** | Kursk salient | Rolling steppe, woods, red soil |
| **Italy** | Gothic Line | Apennine hills, olive groves, stone farm tracks |

Units path around **ridges** via terrain waypoints on long move orders.

---

## End of battle

Results overlay includes victory/defeat detail, **casualty breakdown** by unit type, and HQ destroyed flags. **Replay battle** returns to the same faction, map, mode, and difficulty. **Main Menu** from the end screen or after **Surrender** during play.

---

## In-game guide

Content lives in `src/data/gameGuide.js` and is rendered into the **Field Manual** overlay:

- Title screen → **Field Manual**
- During battle → **Field Manual** (bottom HUD)

The manual includes a section nav, control reference table, illustrated **unit cards** (same icons as the Forces panel), per-faction medium vs super-heavy armor table, and sections on objectives, modes, economy, combat, cover, fire support, and difficulty.

---

## Audio

- `SoundManager` plays weapon samples from `public/sounds/` when available.
- Looping **vehicle engine** audio for tanks, super heavies, armored cars, and artillery while moving.
- Spatial pan and distance attenuation from the camera.
- Run `npm run bake-sounds` to regenerate WAVs via `scripts/bake-gun-sounds.mjs`.

---

## Project structure

```
src/
  main.js                 # Boot, menu → game, surrender callback
  data/
    factions.js           # Units, costs, ranges, economy constants
    maps.js               # Map defs, bases, capture points
    gameModes.js          # Mode config & constants
    campaignPace.js       # Campaign balance & AI pacing merge
    gameGuide.js          # Field Manual HTML (sections + unit cards)
    difficulty.js         # Easy / Medium / Hard profiles
    fireSupport.js        # Strafe & barrage parameters
  game/
    Game.js               # Loop, modes, victory, surrender, resources
    Combat.js             # Damage, targeting, armor, defensive fire
    EliminationRules.js   # Army wipe vs HQ/reinforcement defeat
    Production.js         # Build queues & HQ spawn ring
    CapturePoint.js       # Zone capture & income
    AI.js                 # Enemy production & attack
    Spawner.js            # Starting armies & mode rosters
    AssaultMode.js        # Frontline hold timer & win checks
    ClearanceMode.js      # Clear Defenses spawn, armor, victory
    CoverSystem.js        # Infantry/MG damage reduction
    FireSupport.js        # Cooldowns & strike execution
    RetreatBehavior.js    # Damaged-unit fallback to HQ
    BattleStats.js        # End-screen casualty tallies
    MovePath.js           # Ridge-aware movement waypoints
    HQ.js                 # Headquarters entities
  units/
    Unit.js               # Movement, orders, death visuals
    UnitMeshes.js         # Meshes, wreck/corpse looks
    VehicleTypes.js       # Tank types, move tuning
  ui/
    UIManager.js          # Menu, HUD, Field Manual, overlays
    unitIcons.js          # SVG icons for roster & manual
  input/
    RTSController.js      # Select, move, attack, fire missions
    BattleCursor.js       # Shift fire-mission reticle
  audio/
    VehicleEngineAudio.js # Per-type engine loops
  effects/                # Tracers, wrecks, fire support VFX
scripts/
  bake-gun-sounds.mjs
public/sounds/
public/flags/
```

---

## Tech stack

- **Three.js** — WebGL rendering, shadows, fog, environment lighting
- **Vite** — dev server and production bundling
- No backend; single-player in the browser

---

## License

Private / prototype — adjust as needed for your use.