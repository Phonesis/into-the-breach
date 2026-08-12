import { FACTION_LIST } from '../data/factions.js';
import { MAP_LIST, MAPS } from '../data/maps.js';
import {
  MAP_SIZE_LIST,
  formatMapHudLabel,
  getMapSizeOptions,
  getDefaultMapSize,
  resolveMapSizeId,
} from '../data/mapSizes.js';
import {
  GAME_MODE_LIST,
  ASSAULT_ROLE_LIST,
  CLEARANCE_REINFORCEMENT_SIZE_LIST,
  DEFAULT_CLEARANCE_REINFORCEMENT_SIZE,
  CLEARANCE_ROLE_LIST,
  DEFAULT_CLEARANCE_ROLE,
  DEFAULT_CLEARANCE_TIME_LIMIT_ENABLED,
  STANDARD_UNIT_LIMIT,
  canUseAssaultMapSize,
  resolveAssaultMapSize,
  getProducibleUnits,
} from '../data/gameModes.js';
import { DIFFICULTY_LIST, DEFAULT_DIFFICULTY } from '../data/difficulty.js';
import { FIRE_SUPPORT_LIST } from '../data/fireSupport.js';
import { GENERAL_ORDER_LIST } from '../data/generalOrders.js';

const GENERAL_ORDER_CANCEL_LABELS = {
  fullRetreat: 'Cancel Retreat',
  holdGround: 'Cancel Hold',
};
import { formatAssaultHud } from '../game/AssaultMode.js';
import { TargetIndicators } from '../visual/TargetIndicators.js';
import { getCoverStatus } from '../game/CoverSystem.js';
import {
  COMMANDER_AURA_RANGE,
  isUnitInspiredByCommander,
} from '../game/CommanderBehavior.js';
import { isUnitGarrisoned } from '../game/BunkerGarrison.js';
import { canDigTrenchType } from '../game/InfantryTrench.js';
import {
  MAX_RADIO_OPERATORS_PER_SIDE,
  canAddRadioOperator,
} from '../game/RadioOperatorBehavior.js';
import {
  canDismountRiders,
  canHostRiders,
  getTankRiderIds,
} from '../game/TankRiders.js';
import { renderGameGuideHtml } from '../data/gameGuide.js';
import { isPlayerStagingPhase } from '../game/OpeningDeployZone.js';
import {
  isSmokeShellReady,
  isSmokeShellTarget,
  SMOKE_SHELL_COOLDOWN_SEC,
} from '../game/Targeting.js';
import {
  DEFENSE_TYPE_LIST,
  DEFENSE_UPGRADES,
  DEFENSE_TYPES,
  TD_MAX_ARTILLERY_PITS,
  TD_WAVE_MODE_LIST,
  TD_STYLE_MODE_LIST,
  getArtilleryPitCount,
  defenseNeedsAmmo,
  getResupplyCost,
  getAmmoRatio,
} from '../data/towerDefense.js';
import { formatTowerDefenseHud } from '../game/TowerDefenseMode.js';
import { isHqBeingRepairedByEngineers } from '../game/EngineerBehavior.js';
import {
  CAMPAIGN_STYLE_LIST,
  BASE_BUILDING_TYPE_LIST,
  BASE_BUILDING_TYPES,
  BASE_BUILDING_MIN_MAP_SIZE,
  canUseBaseBuildingOnMap,
  getSpawnBuildingForUnit,
  getPlayerProductionUnitTypes,
} from '../data/baseBuildings.js';
import { getUnitIconMarkup } from './unitIcons.js';
import { TabletCameraControls } from './TabletCameraControls.js';
import { isTabletLikeDevice, isTabletModeEnabled } from '../lib/tabletDetect.js';
import { publicUrl } from '../lib/publicUrl.js';
import { BattleMinimap } from './Minimap.js';
import {
  DEBRIS_RETENTION_OPTIONS,
  GAME_SETTING_KEYS,
  readBooleanSetting,
  readDifficultySetting,
  readDebrisRetentionIndex,
  resetGameSettings,
  writeBooleanSetting,
  writeDifficultySetting,
  writeDebrisRetentionIndex,
} from '../game/GameSettings.js';
import { listBattleSaves, formatSaveMeta, deleteBattleSave } from '../game/BattleSave.js';
import {
  LAST_STAND_DEPLOY_MODE_LIST,
  LAST_STAND_PRESET_SIZE_LIST,
  DEFAULT_LAST_STAND_PRESET_SIZE,
  canUseLastStandPresetSize,
  resolveLastStandPresetSize,
  countLastStandPresetUnits,
  isLastStandPresetDeployMode,
} from '../data/lastStandForces.js';

const PRODUCE_LABELS = {
  commander: 'CMD',
  radioOperator: 'Radio',
  infantry: 'Inf',
  medic: 'Medic',
  engineer: 'Eng',
  machineGun: 'MG',
  sniper: 'Snp',
  mortar: 'Mrt',
  antiTankGun: 'AT',
  armoredCar: 'AC',
  tank: 'Tk',
  tankDestroyer: 'TD',
  superHeavyTank: 'Top-Tier Armor',
  artillery: 'Arty',
};

function hpPercent(hp, maxHp) {
  return Math.max(0, Math.min(100, Math.round((hp / Math.max(maxHp, 1)) * 100)));
}

function hpTier(pct) {
  if (pct < 30) return 'critical';
  if (pct < 60) return 'warn';
  return 'ok';
}

function hpBarMarkup(hp, maxHp, { showValues = true, compact = false } = {}) {
  const pct = hpPercent(hp, maxHp);
  const tier = hpTier(pct);
  const valueLine = showValues
    ? `<span class="hp-bar-values">${Math.ceil(hp)} / ${maxHp}</span>`
    : '';
  return `
    <div class="hp-bar-wrap${compact ? ' hp-bar-wrap--compact' : ''}">
      <div class="hp-bar-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <span class="hp-bar-fill hp-bar-fill--${tier}" style="width:${pct}%"></span>
      </div>
      ${valueLine}
    </div>
  `;
}

const UNIT_FIELD_ICONS_KEY = GAME_SETTING_KEYS.unitFieldIcons;
const UNIT_STATUS_VISIBLE_KEY = GAME_SETTING_KEYS.unitStatus;
const FRONTLINE_VISIBLE_KEY = GAME_SETTING_KEYS.frontline;
const CAPTURE_POINTS_VISIBLE_KEY = GAME_SETTING_KEYS.capturePoints;
const SEEK_COVER_MODE_KEY = GAME_SETTING_KEYS.seekCover;
// Keep the existing storage key so saved pursuit choices migrate cleanly while
// the Settings control presents the clearer Hold Ground default.
const HOLD_GROUND_KEY = GAME_SETTING_KEYS.pursueTargets;
const ARTILLERY_AUTO_FIRE_KEY = GAME_SETTING_KEYS.artilleryAutoFire;
const AUTO_BUILD_MODE_KEYS = {
  classic: GAME_SETTING_KEYS.autoBuildClassic,
  baseBuilding: GAME_SETTING_KEYS.autoBuildBaseBuilding,
};
const AUTO_BUILD_MODE_KEY_LEGACY = GAME_SETTING_KEYS.autoBuildLegacy;

const LOADING_ART_PATHS = [
  'menu/menu-title.jpg',
  'menu/menu-mode.jpg',
  'menu/menu-assault.jpg',
  'menu/menu-faction.jpg',
  'menu/menu-map.jpg',
  'menu/menu-faction-germany.jpg',
  'menu/menu-faction-usa.jpg',
  'menu/menu-faction-uk.jpg',
  'menu/menu-faction-russia.jpg',
  'menu/menu-faction-japan.jpg',
].map((path) => publicUrl(path));

const LOADING_ART_INTERVAL_MS = 2800;

function getAutoBuildStorageKey(campaignStyle = 'classic') {
  return campaignStyle === 'baseBuilding'
    ? AUTO_BUILD_MODE_KEYS.baseBuilding
    : AUTO_BUILD_MODE_KEYS.classic;
}

function loadAutoBuildPreference(campaignStyle = 'classic') {
  const key = getAutoBuildStorageKey(campaignStyle);
  const stored = localStorage.getItem(key);
  if (stored !== null) return stored === '1';
  if (campaignStyle !== 'baseBuilding') {
    const legacy = localStorage.getItem(AUTO_BUILD_MODE_KEY_LEGACY);
    if (legacy !== null) return legacy === '1';
  }
  return false;
}


const FACTION_ROSTER_LABELS = {
  commander: 'Field commander',
  radioOperator: 'Radio operator',
  infantry: 'Infantry',
  medic: 'Medic section',
  engineer: 'Engineer section',
  machineGun: 'MG team',
  sniper: 'Sniper',
  mortar: 'Mortar',
  antiTankGun: 'AT gun',
  armoredCar: 'Armored car',
  tank: 'Tank',
  tankDestroyer: 'Tank destroyer',
  superHeavyTank: 'Top-Tier Armor',
  artillery: 'Artillery',
};

export class UIManager {
  constructor(root, callbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.selectedFaction = null;
    this.selectedMap = null;
    this.selectedMapSize = 'medium';
    this.selectedGameMode = null;
    this.selectedAssaultRole = null;
    this.selectedClearanceRole = DEFAULT_CLEARANCE_ROLE;
    this.selectedDifficulty = readDifficultySetting();
    this.selectedCampaignStyle = 'classic';
    this.selectedClearanceReinforcementSize = DEFAULT_CLEARANCE_REINFORCEMENT_SIZE;
    this.selectedClearanceTimeLimitEnabled = DEFAULT_CLEARANCE_TIME_LIMIT_ENABLED;
    this.selectedTdWaveMode = 'standard';
    this.selectedTdStyle = 'emplacements';
    this.selectedLastStandDeployMode = 'manual';
    this.selectedLastStandPresetSize = DEFAULT_LAST_STAND_PRESET_SIZE;
    this._hudTowerDefense = false;
    this._productionPanelKey = '';
    this._baseBuildUiKey = '';
    this._hudBaseBuilding = false;
    this._hudStandardCampaign = false;
    this._settingsReturnTarget = 'title';
    this.showUnitFieldIcons = readBooleanSetting(UNIT_FIELD_ICONS_KEY, true);
    this.showUnitStatus = readBooleanSetting(UNIT_STATUS_VISIBLE_KEY, true);
    this.showFrontline = readBooleanSetting(FRONTLINE_VISIBLE_KEY, true);
    this.showCapturePoints = readBooleanSetting(CAPTURE_POINTS_VISIBLE_KEY, true);
    this.seekCoverMode = readBooleanSetting(SEEK_COVER_MODE_KEY, true);
    this.holdGroundByDefault = !readBooleanSetting(HOLD_GROUND_KEY, false);
    this.pursueTargetsByDefault = !this.holdGroundByDefault;
    this.artilleryAutoFire = readBooleanSetting(ARTILLERY_AUTO_FIRE_KEY, true);
    /** When true, all in-battle HUD chrome is hidden (toggle from pause menu). */
    this.hudHidden = false;
    this.autoBuildMode = false;
    this._hudCampaignStyle = 'classic';
    this._hudAutoBuildAvailable = false;
    this._unitRosterHoveredUnitId = null;
    this._unitRosterFocusedUnitId = null;
    this.fireSupportExpanded = false;
    this.generalOrdersExpanded = false;
    this.defenseExpanded = false;
    this.baseBuildExpanded = false;
    this._hudCheatMode = false;
    this._loadingActive = false;
    this._loadingArtIndex = -1;
    this._loadingArtLayerIndex = 0;
    this._loadingArtTimer = null;
    this._preloadLoadingArt();
    this.render();
    this.tabletCamera = new TabletCameraControls(this.root);
    this.minimap = new BattleMinimap(this.root, {
      onPanTo: (x, z) => this.callbacks.onMinimapPan?.(x, z),
      onToggleMinimap: (visible) => {
        this.showMinimap = visible;
      },
    });
    this.showMinimap = this.minimap.visible;
    this._syncFieldIconToggle();
    this._syncUnitStatusToggle();
    this._syncFrontlineToggle();
    this._syncCapturePointToggle();
    this._syncFireSupportCollapse();
    this._syncGeneralOrdersCollapse();
    this._syncDefenseCollapse();
    this._syncBaseBuildCollapse();
    this._syncSettingsControls();
  }

  _preloadLoadingArt() {
    if (typeof Image === 'undefined') return;
    this._loadingArtImages = LOADING_ART_PATHS.map((src) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = src;
      return image;
    });
  }

  /** Nation-specific art on the faction picker (hover / selection). */
  updateFactionScreenBg(factionId = null) {
    const screen = this.root.querySelector('#screen-faction');
    if (!screen) return;
    screen.classList.remove('faction-bg-germany', 'faction-bg-usa', 'faction-bg-uk', 'faction-bg-russia', 'faction-bg-japan');
    if (factionId && ['germany', 'usa', 'uk', 'russia', 'japan'].includes(factionId)) {
      screen.classList.add(`faction-bg-${factionId}`);
    }
  }

  render() {
    const tabletModeSetting = isTabletLikeDevice()
      ? `
            <label class="setting-row" for="setting-tablet-mode">
              <span><strong>Tablet controls</strong><small>Use touch camera controls and tablet targeting.</small><span class="setting-detail" id="setting-tablet-mode-detail">Turn this off when a keyboard and mouse are connected to the tablet to use the normal WASD, mouse, and keyboard command scheme. This setting is only available on tablet-class devices.</span></span>
              <input type="checkbox" id="setting-tablet-mode" data-setting="tabletMode" aria-describedby="setting-tablet-mode-detail" />
            </label>`
      : '';
    this.root.innerHTML = `
      <div id="screen-title" class="screen menu-screen title-screen interactive">
        <div class="title-hero">
          <div class="title-block">
            <span class="menu-kicker">World War II · Real-Time Tactics</span>
            <h1><span>Into the</span><span>Breach</span></h1>
            <p>Take command of a historically grounded combined-arms force. Seize vital ground, outmanoeuvre the enemy, and break their ability to fight.</p>
          </div>
          <div class="title-actions title-screen-actions">
            <button class="btn btn-primary interactive" id="btn-start">New Operation</button>
            <button class="btn btn-secondary interactive" id="btn-load-saves">Continue Saved Battle</button>
            <button class="btn btn-secondary interactive" id="btn-settings">Settings</button>
            <button class="btn btn-secondary interactive" id="btn-guide-title">Open Field Manual</button>
            <button class="btn btn-secondary interactive" id="btn-about">Credits &amp; Information</button>
          </div>
          <p class="title-footnote">Plan the operation. Choose your command. Fight the battle.</p>
        </div>
      </div>

      <div id="screen-settings" class="screen menu-screen settings-screen interactive hidden">
        <div class="title-block">
          <span class="menu-kicker">Headquarters Configuration</span>
          <h1>Settings</h1>
          <p>Choose the battlefield defaults used whenever you begin or resume an operation. Changes are saved automatically in this browser.</p>
        </div>
        <div class="settings-panel-shell">
          <div class="panel menu-panel settings-panel">
          <h2>Battlefield Interface</h2>
          <div class="settings-grid">
            <label class="setting-row" for="setting-minimap">
              <span><strong>Tactical map</strong><small>Show the minimap when a battle begins.</small><span class="setting-detail" id="setting-minimap-detail">Displays friendly and enemy contacts, commander markers, capture points, and fading traces from active firefights. Click the map to move the camera instantly; hiding it does not change unit awareness or battlefield rules.</span></span>
              <input type="checkbox" id="setting-minimap" data-setting="minimap" aria-describedby="setting-minimap-detail" />
            </label>
            <label class="setting-row" for="setting-field-icons">
              <span><strong>Field icons</strong><small>Show unit-type icons and health bars above friendly forces.</small><span class="setting-detail" id="setting-field-icons-detail">Adds readable role symbols and health bars above your troops so mixed formations are easier to identify at a glance. This is display-only and does not affect selection, targeting, combat, or enemy visibility.</span></span>
              <input type="checkbox" id="setting-field-icons" data-setting="unitFieldIcons" aria-describedby="setting-field-icons-detail" />
            </label>
            <label class="setting-row" for="setting-unit-status">
              <span><strong>Unit status markers</strong><small>Show Inspired, In Cover, Retreat, and support markers.</small><span class="setting-detail" id="setting-unit-status-detail">Shows tactical states including morale, cover, retreat, surrender, healing, and repairs above units. Turning this off only reduces battlefield labels; the states and their gameplay effects remain active and selection details stay available.</span></span>
              <input type="checkbox" id="setting-unit-status" data-setting="unitStatus" aria-describedby="setting-unit-status-detail" />
            </label>
            <label class="setting-row" for="setting-capture-points">
              <span><strong>Capture circles</strong><small>Show capture-zone circles on the battlefield.</small><span class="setting-detail" id="setting-capture-points-detail">Draws the ground boundary of objectives in modes that use capture zones. Hiding the circles does not disable capturing, ownership changes, income, or victory progress; it only removes the large battlefield rings.</span></span>
              <input type="checkbox" id="setting-capture-points" data-setting="capturePoints" aria-describedby="setting-capture-points-detail" />
            </label>
            <label class="setting-row" for="setting-frontline">
              <span><strong>Frontline</strong><small>Show the red frontline in modes that use it.</small><span class="setting-detail" id="setting-frontline-detail">Displays the sector boundary used in Breakthrough and Hold the Line battles. Hiding it is visual only: deployment limits, defensive territory, breach timers, and frontline movement continue to work normally.</span></span>
              <input type="checkbox" id="setting-frontline" data-setting="frontline" aria-describedby="setting-frontline-detail" />
            </label>
            ${tabletModeSetting}
          </div>

          <h2 class="settings-section-title">Enemy AI</h2>
          <div class="difficulty-setting">
            <div class="difficulty-setting-copy">
              <strong>AI difficulty</strong>
              <small>Regular is the default. This saved choice is used by all battle modes; Combat Training has no enemy AI.</small>
            </div>
            <div class="difficulty-grid settings-difficulty-grid" id="difficulty-grid"></div>
          </div>

          <h2 class="settings-section-title">Unit Behaviour</h2>
          <div class="settings-grid">
            <label class="setting-row" for="setting-seek-cover">
              <span><strong>Seek Cover</strong><small>Route foot-troop move orders toward nearby cover by default.</small><span class="setting-detail" id="setting-seek-cover-detail">Future move orders for infantry, commanders, medics, engineers, MGs, mortars, and snipers will snap to suitable nearby cover. Tanks, armored cars, anti-tank guns, and artillery still move to the exact point ordered.</span></span>
              <input type="checkbox" id="setting-seek-cover" data-setting="seekCover" aria-describedby="setting-seek-cover-detail" />
            </label>
            <label class="setting-row" for="setting-hold-ground">
              <span><strong>Hold Ground by default</strong><small>Choose whether idle units hold ground or chase targets.</small><span class="setting-detail" id="setting-hold-ground-detail">When on, player units that auto-acquire an enemy will hold their firing position and stop chasing after the target leaves engagement range. When off, units pursue targets and close the distance beyond their initial firing position. Explicit attack orders always bind to the selected target; Hold Ground or Pursue determines whether they stop or follow after reaching range. Changing this while paused updates existing player units.</span></span>
              <input type="checkbox" id="setting-hold-ground" data-setting="holdGround" aria-describedby="setting-hold-ground-detail" />
            </label>
            <label class="setting-row" for="setting-artillery-auto-fire">
              <span><strong>Artillery auto-fire</strong><small>Set whether your howitzers acquire targets without an order.</small><span class="setting-detail" id="setting-artillery-auto-fire-detail">Sets the default behavior for player howitzers in every mode. When on, idle batteries search for enemies in range; when off, they wait for attack-unit, ground, building, or smoke missions. Changing this while paused updates existing player howitzers; you can still change selected batteries during a battle. Enemy artillery always auto-fires.</span></span>
              <input type="checkbox" id="setting-artillery-auto-fire" data-setting="artilleryAutoFire" aria-describedby="setting-artillery-auto-fire-detail" />
            </label>
          </div>

          <h2 class="settings-section-title">Build Queue Automation</h2>
          <div class="settings-grid settings-grid--compact">
            <label class="setting-row" for="setting-auto-build-classic">
              <span><strong>Auto Build — Classic</strong><small>Automatically maintain a balanced reinforcement queue.</small><span class="setting-detail" id="setting-auto-build-classic-detail">Available in Standard — Classic battles. It fills open queue slots with a combined-arms mix based on your current force, supplies, and unit cap. You can still add units manually, and enabling cheat mode temporarily disables automation.</span></span>
              <input type="checkbox" id="setting-auto-build-classic" data-setting="autoBuildClassic" aria-describedby="setting-auto-build-classic-detail" />
            </label>
            <label class="setting-row" for="setting-auto-build-base">
              <span><strong>Auto Build — Base Building</strong><small>Enable automatic production after constructing your base.</small><span class="setting-detail" id="setting-auto-build-base-detail">Available in Standard — Base Building battles. Automation uses your unlocked units and working production buildings, but may spend supplies you intended for new structures or upgrades, so leaving it off gives tighter control over early expansion.</span></span>
              <input type="checkbox" id="setting-auto-build-base" data-setting="autoBuildBaseBuilding" aria-describedby="setting-auto-build-base-detail" />
            </label>
          </div>

          <h2 class="settings-section-title">Other</h2>
          <div class="debris-setting">
            <div class="debris-setting-copy">
              <strong>Bodies / Destroyed Vehicle Despawn Delay</strong>
              <small>How long fallen troops and knocked-out vehicles remain before being despawned from map.</small>
            </div>
            <output id="debris-retention-value" for="debris-retention-slider">Permanent</output>
            <input
              type="range"
              id="debris-retention-slider"
              min="0"
              max="${DEBRIS_RETENTION_OPTIONS.length - 1}"
              step="1"
              value="${readDebrisRetentionIndex()}"
              aria-describedby="debris-performance-warning"
            />
            <div class="debris-scale" aria-hidden="true"><span>10 sec</span><span>30 sec</span><span>1 min</span><span>2 min</span><span>5 min</span><span>Permanent</span></div>
            <p class="settings-warning" id="debris-performance-warning"><strong>Performance warning:</strong> Longer retention — especially Permanent — can reduce frame rate as casualties and wrecks accumulate.</p>
          </div>

          <div class="actions">
            <button type="button" class="btn btn-secondary settings-reset-btn" id="btn-reset-settings">Reset All to Defaults</button>
            <button class="btn btn-secondary btn-back interactive" id="btn-back-settings">Return to Headquarters</button>
          </div>
          </div>

          <aside class="settings-info-panel" id="settings-info-panel" aria-live="polite">
            <span class="settings-info-kicker">Setting information</span>
            <strong id="settings-info-title">Highlight a setting</strong>
            <p id="settings-info-text">Hover over or focus a setting to see how it changes the battlefield.</p>
          </aside>
        </div>
      </div>

      <div id="screen-saves" class="screen menu-screen saves-screen interactive hidden">
        <div class="title-block">
          <span class="menu-kicker">Operations Archive</span>
          <h1>Saved Operations</h1>
          <p>Return to a battle in progress. Your field saves remain stored in this browser.</p>
        </div>
        <div class="panel menu-panel saves-panel">
          <h2>Available Field Saves</h2>
          <div class="save-list" id="save-list"></div>
          <p class="save-list-empty hidden" id="save-list-empty">No field saves are available. Use <strong>Save Battle</strong> from the command bar during an engagement.</p>
          <div class="actions">
            <button class="btn btn-secondary btn-back interactive" id="btn-back-saves">Return to Headquarters</button>
          </div>
        </div>
      </div>

      <div id="screen-mode" class="screen menu-screen setup-screen interactive hidden">
        <nav class="menu-progress" aria-label="Operation setup progress">
          <span class="active"><b>01</b> Operation</span><i></i><span><b>02</b> Command</span><i></i><span><b>03</b> Battlefield</span>
        </nav>
        <div class="title-block">
          <span class="menu-kicker">Step 01 · Rules of Engagement</span>
          <h1>Choose Operation</h1>
          <p>Select the mission structure, victory conditions, and command experience you want.</p>
        </div>
        <div class="panel menu-panel">
          <h2>Operational Doctrine</h2>
          <div class="mode-grid" id="mode-grid"></div>
          <div class="actions">
            <button class="btn btn-secondary btn-back interactive" id="btn-back-title">Headquarters</button>
            <button class="btn btn-primary interactive" id="btn-to-faction" disabled>Next: Choose Command</button>
          </div>
        </div>
      </div>

      <div id="screen-assault-role" class="screen menu-screen setup-screen interactive hidden">
        <nav class="menu-progress" aria-label="Operation setup progress">
          <span class="active"><b>01</b> Operation</span><i></i><span><b>02</b> Command</span><i></i><span><b>03</b> Battlefield</span>
        </nav>
        <div class="title-block">
          <span class="menu-kicker">Step 01 · Mission Assignment</span>
          <h1 id="role-screen-title">Choose Your Role</h1>
          <p id="role-screen-blurb">Lead the breakthrough or take command of the defensive line.</p>
        </div>
        <div class="panel menu-panel">
          <h2 id="role-screen-heading">Field Orders</h2>
          <div class="mode-grid" id="role-grid"></div>
          <div class="actions">
            <button class="btn btn-secondary btn-back interactive" id="btn-back-mode-role">Previous</button>
            <button class="btn btn-primary interactive" id="btn-to-faction-role" disabled>Next: Choose Command</button>
          </div>
        </div>
      </div>

      <div id="screen-faction" class="screen menu-screen setup-screen interactive hidden">
        <nav class="menu-progress" aria-label="Operation setup progress">
          <span class="complete"><b>01</b> Operation</span><i class="complete"></i><span class="active"><b>02</b> Command</span><i></i><span><b>03</b> Battlefield</span>
        </nav>
        <div class="title-block">
          <span class="menu-kicker">Step 02 · Field Command</span>
          <h1>Choose Your Command</h1>
          <p>Select a national force, doctrine, and historically grounded unit roster.</p>
        </div>
        <div class="panel menu-panel faction-panel">
          <h2>Field Army</h2>
          <div class="faction-grid" id="faction-grid"></div>
          <div class="actions">
            <button class="btn btn-secondary btn-back interactive" id="btn-back-mode">Previous</button>
            <button class="btn btn-primary interactive" id="btn-to-maps" disabled>Next: Prepare Battlefield</button>
          </div>
        </div>
      </div>

      <div id="screen-map" class="screen menu-screen setup-screen interactive hidden">
        <nav class="menu-progress" aria-label="Operation setup progress">
          <span class="complete"><b>01</b> Operation</span><i class="complete"></i><span class="complete"><b>02</b> Command</span><i class="complete"></i><span class="active"><b>03</b> Battlefield</span>
        </nav>
        <div class="title-block">
          <span class="menu-kicker">Step 03 · Final Briefing</span>
          <h1>Prepare Battlefield</h1>
          <p>Choose the theater, battlefield scale, and mission-specific deployment rules.</p>
        </div>
        <div class="panel menu-panel battlefield-panel">
          <h2>Theater of Operations</h2>
          <div class="map-grid" id="map-grid"></div>
          <div class="map-size-block" id="map-size-block">
            <h2>Battlefield Scale</h2>
            <div class="map-size-grid" id="map-size-grid"></div>
          </div>
          <div class="campaign-style-block hidden" id="campaign-style-block">
            <h2>Command Structure</h2>
            <div class="campaign-style-grid" id="campaign-style-grid"></div>
            <p class="campaign-style-note hidden" id="campaign-style-note">
              Base Building requires a <strong>Large</strong> map.
            </p>
          </div>
          <div class="campaign-style-block hidden" id="clearance-role-block">
            <h2>Mission Role</h2>
            <div class="campaign-style-grid" id="clearance-role-grid"></div>
          </div>
          <div class="campaign-style-block hidden" id="clearance-style-block">
            <h2>Reinforcement Size</h2>
            <div class="campaign-style-grid" id="clearance-style-grid"></div>
          </div>
          <div class="campaign-style-block hidden" id="clearance-time-limit-block">
            <h2>Assault Deadline</h2>
            <label class="setting-row setting-row--always-detail" for="clearance-time-limit-toggle">
              <span>
                <strong>15-minute deadline</strong>
                <small>On by default. End the assault when the clock reaches 15:00.</small>
                <span class="setting-detail" id="clearance-time-limit-detail">With this enabled, attackers must clear every defender before 15 minutes, while the garrison wins by holding until the deadline. Turn it off for an open-ended Fortified Line battle; force elimination still ends the battle.</span>
              </span>
              <input type="checkbox" id="clearance-time-limit-toggle" aria-describedby="clearance-time-limit-detail" />
            </label>
          </div>
          <div class="campaign-style-block hidden" id="td-wave-mode-block">
            <h2>Battle Duration</h2>
            <div class="campaign-style-grid" id="td-wave-mode-grid"></div>
          </div>
          <div class="campaign-style-block hidden" id="td-style-block">
            <h2>Defensive Doctrine</h2>
            <div class="campaign-style-grid" id="td-style-grid"></div>
          </div>
          <div class="campaign-style-block hidden" id="laststand-deploy-block">
            <h2>Deployment Style</h2>
            <div class="campaign-style-grid" id="laststand-deploy-grid"></div>
            <div class="campaign-style-block hidden" id="laststand-preset-size-block">
              <h2>Battle Group Size</h2>
              <div class="campaign-style-grid" id="laststand-preset-size-grid"></div>
              <p class="laststand-deploy-note hidden" id="laststand-deploy-note">
                <strong>Large</strong> is not available on Berlin (performance).
              </p>
            </div>
          </div>
          <div class="actions">
            <button class="btn btn-secondary btn-back interactive" id="btn-back-faction">Previous</button>
            <button class="btn btn-primary btn-deploy interactive" id="btn-launch" disabled>Confirm &amp; Deploy Forces</button>
          </div>
        </div>
      </div>

      <div id="hud" class="hud hidden">
        <div class="hud-top">
          <div>
            <div class="hud-badge" id="hud-faction">—</div>
            <div class="hud-stats" id="hud-map">—</div>
            <div class="tutorial-banner hidden" id="tutorial-banner">Training — no enemy AI</div>
            <div class="assault-banner hidden" id="assault-banner">
              <span class="assault-role" id="assault-role-label">—</span>
              <span class="assault-objective" id="assault-objective">—</span>
              <span class="assault-timer" id="assault-timer">—</span>
            </div>
            <div class="clearance-banner hidden" id="clearance-banner">
              Clear all dug-in defenders — fixed force, no reinforcements
            </div>
            <div class="td-banner hidden" id="td-banner">
              <span class="td-wave" id="td-wave-label">Wave 0 / 12</span>
              <span class="td-phase" id="td-phase-label">Prepare defenses</span>
            </div>
            <button
              type="button"
              class="frontline-toggle interactive hidden"
              id="btn-toggle-frontline"
              title="Show red frontline on the map"
              aria-pressed="true"
            >
              <span class="frontline-toggle-swatch" aria-hidden="true"></span>
              <span class="frontline-toggle-label">Frontline</span>
            </button>
            <button
              type="button"
              class="capture-points-toggle interactive hidden"
              id="btn-toggle-capture-points"
              title="Hide capture point circles"
              aria-label="Hide capture point circles"
              aria-pressed="true"
            >
              <span class="capture-points-toggle-icon" aria-hidden="true"></span>
              <span>Capture circles</span>
            </button>
            <div class="laststand-banner hidden" id="laststand-banner">
              Battle Simulation — deploy your army, then engage. No HQ or reinforcements.
            </div>
          </div>
          <div class="hud-top-right">
            <button
              type="button"
              class="btn-save-hud interactive"
              id="btn-save-battle"
              title="Save battle progress to resume later"
            >
              Save
            </button>
            <button
              type="button"
              class="btn-surrender-hud interactive"
              id="btn-surrender"
              title="Surrender and return to main menu"
            >
              Surrender
            </button>
            <div class="hud-resources">
              <span class="resource-label">Supplies</span>
              <span class="resource-value" id="hud-resources">0</span>
              <span class="hud-cheat-badge hidden" id="hud-cheat-badge" title="Cheat mode (iddqd or ?cheat=1)">CHEAT</span>
            </div>
            <div class="hud-stats" id="hud-army">Army: —</div>
          </div>
        </div>

        <div id="hq-threat-alert" class="hq-threat-alert hidden" aria-live="assertive">
          <div class="hq-threat-alert-card" id="hq-threat-alert-card">
            <p class="hq-threat-alert-title" id="hq-threat-alert-title">Headquarters under attack</p>
            <p class="hq-threat-alert-detail" id="hq-threat-alert-detail">—</p>
            <div class="hq-threat-alert-hp" id="hq-threat-alert-hp"></div>
          </div>
        </div>

        <div id="opening-countdown" class="opening-countdown hidden" aria-live="polite">
          <div class="opening-countdown-card">
            <p class="opening-countdown-title" id="opening-countdown-title">Quiet sector</p>
            <p class="opening-countdown-value" id="opening-countdown-value">32</p>
            <p class="opening-countdown-sub" id="opening-countdown-sub">—</p>
            <div class="opening-countdown-track">
              <div class="opening-countdown-fill" id="opening-countdown-fill"></div>
            </div>
            <button
              type="button"
              class="btn btn-primary opening-countdown-launch interactive hidden"
              id="btn-launch-battle-now"
            >
              Launch Battle Now
            </button>
          </div>
        </div>

        <div id="pause-overlay" class="pause-overlay hidden" aria-hidden="true">
          <div class="pause-overlay-card interactive">
            <p class="pause-overlay-title">Paused</p>
            <p class="pause-overlay-sub">Press <kbd>P</kbd> to resume</p>
            <section
              id="pause-casualty-stats"
              class="pause-overlay-stats"
              aria-labelledby="pause-casualty-stats-title"
              aria-live="polite"
            >
              <h2 id="pause-casualty-stats-title" class="pause-overlay-stats-heading">
                Current casualties
              </h2>
              <div id="pause-casualty-grid" class="pause-overlay-casualty-grid">
                <p class="pause-overlay-empty">No casualties recorded</p>
              </div>
            </section>
            <div class="pause-overlay-actions">
              <div class="pause-overlay-action-group pause-overlay-hud-action">
                <button
                  type="button"
                  class="btn btn-secondary pause-hud-toggle interactive"
                  id="btn-toggle-hud-visibility"
                  aria-pressed="false"
                  title="Hide all on-screen HUD elements (minimap, panels, banners). Press P again to pause and show this menu."
                >
                  Hide HUD
                </button>
                <p class="pause-overlay-hud-hint" id="pause-hud-toggle-hint">
                  Hides minimap, panels, and status banners for a clear view
                </p>
              </div>
              <div class="pause-overlay-action-group pause-overlay-settings-action">
                <button
                  type="button"
                  class="btn btn-secondary pause-settings-btn interactive"
                  id="btn-pause-settings"
                  title="Open persistent battlefield settings while the battle remains paused"
                >
                  Settings
                </button>
              </div>
            </div>
          </div>
        </div>

        <div id="td-wave-countdown" class="td-wave-countdown td-wave-countdown-side hidden" aria-live="polite">
          <div class="td-wave-countdown-card" id="td-wave-countdown-card">
            <p class="td-wave-countdown-title" id="td-wave-countdown-title">Prepare defenses</p>
            <p class="td-wave-countdown-value" id="td-wave-countdown-value">30</p>
            <p class="td-wave-countdown-sub" id="td-wave-countdown-sub">Wave 1 / 12</p>
            <div class="td-wave-countdown-track">
              <div class="td-wave-countdown-fill" id="td-wave-countdown-fill"></div>
            </div>
            <button
              type="button"
              class="btn btn-primary td-wave-countdown-skip interactive"
              id="btn-td-skip-wave-countdown"
            >
              Start Wave Now
            </button>
          </div>
        </div>

        <div id="td-breach-alert" class="td-breach-alert hidden" aria-live="assertive" role="alert">
          <div class="td-breach-alert-card" id="td-breach-alert-card">
            <p class="td-breach-alert-eyebrow">Sector overrun imminent</p>
            <p class="td-breach-alert-title">Clear the frontline</p>
            <p class="td-breach-alert-value" id="td-breach-alert-value">10</p>
            <p class="td-breach-alert-sub" id="td-breach-alert-sub">Enemy past the line — destroy them before time runs out</p>
            <div class="td-breach-alert-track">
              <div class="td-breach-alert-fill" id="td-breach-alert-fill"></div>
            </div>
          </div>
        </div>

        <div class="capture-bar" id="capture-bar"></div>

        <div id="tablet-camera" class="tablet-camera hidden interactive" aria-label="Camera controls">
          <p class="tablet-camera-label">Camera</p>
          <div class="tablet-camera-actions" role="group" aria-label="Battle orders">
            <button
              type="button"
              class="tablet-cam-btn tablet-mode-btn"
              id="btn-tablet-target"
              aria-pressed="false"
              title="Tap an enemy to highlight — tap again or Engage to attack"
            >
              Target
            </button>
            <button
              type="button"
              class="tablet-cam-btn tablet-mode-btn"
              id="btn-tablet-fire"
              aria-pressed="false"
              title="Tap ground or cover to fire (like Shift + click)"
            >
              Fire
            </button>
          </div>
          <div class="tablet-camera-rotate">
            <button type="button" class="tablet-cam-btn" data-cam="rotateLeft" aria-label="Rotate view left">⟲</button>
            <button type="button" class="tablet-cam-btn" data-cam="rotateRight" aria-label="Rotate view right">⟳</button>
          </div>
          <div class="tablet-camera-pad" role="group" aria-label="Pan camera">
            <button type="button" class="tablet-cam-btn pad-up" data-cam="panForward" aria-label="Pan forward">▲</button>
            <button type="button" class="tablet-cam-btn pad-left" data-cam="panLeft" aria-label="Pan left">◀</button>
            <button type="button" class="tablet-cam-btn pad-center" tabindex="-1" aria-hidden="true">◎</button>
            <button type="button" class="tablet-cam-btn pad-right" data-cam="panRight" aria-label="Pan right">▶</button>
            <button type="button" class="tablet-cam-btn pad-down" data-cam="panBack" aria-label="Pan back">▼</button>
          </div>
          <div class="tablet-camera-zoom" role="group" aria-label="Zoom">
            <button type="button" class="tablet-cam-btn" data-cam="zoomIn" aria-label="Zoom in">＋</button>
            <button type="button" class="tablet-cam-btn" data-cam="zoomOut" aria-label="Zoom out">－</button>
          </div>
        </div>

        <div id="battle-minimap" class="battle-minimap interactive" aria-label="Tactical map">
          <div class="battle-minimap-header">
            <span class="battle-minimap-title">Tactical Map</span>
            <button
              type="button"
              class="battle-minimap-toggle interactive"
              id="btn-toggle-minimap"
              title="Hide tactical map"
              aria-pressed="true"
            >
              Hide
            </button>
          </div>
          <canvas id="battle-minimap-canvas" width="168" height="168" aria-label="Battlefield overview"></canvas>
          <p class="battle-minimap-hint">Green — friendly · Red — enemy · Traces show live fire · Click to pan</p>
        </div>
        <button
          type="button"
          class="battle-minimap-show interactive hidden"
          id="btn-show-minimap"
          title="Show tactical map"
          aria-pressed="false"
        >
          Map
        </button>

        <aside class="unit-roster interactive" id="unit-roster" aria-label="Your forces">
          <h3 class="unit-roster-title">Forces</h3>
          <button
            type="button"
            class="unit-roster-toggle interactive"
            id="btn-toggle-field-icons"
            title="Show unit type icons above your forces on the battlefield"
            aria-pressed="true"
          >
            <span class="unit-roster-toggle-icon" aria-hidden="true">${getUnitIconMarkup('infantry')}</span>
            <span class="unit-roster-toggle-label">Field icons</span>
          </button>
          <button
            type="button"
            class="unit-roster-toggle interactive"
            id="btn-toggle-unit-status"
            title="Show unit status markers above your forces on the battlefield"
            aria-pressed="true"
          >
            <span class="unit-roster-toggle-icon unit-roster-status-icon" aria-hidden="true">✦</span>
            <span class="unit-roster-toggle-label">Unit status</span>
          </button>
          <div class="unit-roster-list" id="unit-roster-list"></div>
        </aside>

        <div class="hud-bottom">
          <div class="selection-panel interactive" id="selection-panel">
            <div id="selection-body">
              <h3>No selection</h3>
              <p>Click a unit in Forces or on the battlefield to select.</p>
            </div>
            <div id="selection-cover" class="selection-cover hidden"></div>
            <div id="selection-morale" class="selection-morale hidden"></div>
            <div class="target-offer hidden" id="target-offer">
              <p class="target-offer-label" id="target-offer-label">Enemy in sights</p>
              <button type="button" class="btn btn-target interactive" id="btn-engage-target">Engage target</button>
              <p class="target-offer-hint" id="target-offer-hint">Or left-click the highlighted enemy</p>
            </div>
            <div class="engagement-stance-actions hidden" id="engagement-stance-actions">
              <p class="engagement-stance-label">Engagement stance</p>
              <div class="engagement-stance-buttons">
                <button type="button" class="btn btn-secondary interactive" id="btn-stance-hold">
                  Hold Ground
                </button>
                <button type="button" class="btn btn-secondary interactive" id="btn-stance-pursue">
                  Pursue
                </button>
              </div>
              <p class="engagement-stance-hint" id="engagement-stance-hint">
                Auto-fire at enemies in range without chasing.
              </p>
            </div>
            <div class="fire-mission-actions hidden" id="fire-mission-actions">
              <button type="button" class="btn btn-cancel-fire interactive" id="btn-cancel-fire-missions">
                Cancel fire missions
              </button>
            </div>
            <div class="arty-autofire-actions hidden" id="arty-autofire-actions">
              <button type="button" class="btn btn-secondary interactive" id="btn-arty-autofire">
                Auto-fire: Off
              </button>
              <p class="arty-autofire-hint" id="arty-autofire-hint">
                Off by default — howitzers only fire on ordered missions. Enable to auto-engage enemies in range (shells lob over distant buildings).
              </p>
            </div>
            <div class="smoke-shell-actions hidden" id="smoke-shell-actions">
              <button type="button" class="btn btn-secondary interactive" id="btn-smoke-shell">
                Smoke shell
              </button>
              <p class="smoke-shell-hint" id="smoke-shell-hint">
                Alt+Shift+LMB on ground — 45s cooldown; smoke blocks line of sight for 60s
              </p>
            </div>
            <div class="tank-rider-actions hidden" id="tank-rider-actions">
              <button type="button" class="btn btn-secondary interactive" id="btn-dismount-riders">
                Dismount infantry
              </button>
              <p class="tank-rider-hint" id="tank-rider-hint">
                Riders bail out beside the tank. Under fire they dismount automatically.
              </p>
            </div>
            <div class="engineer-build-actions hidden" id="engineer-build-actions">
              <div class="engineer-build-btns" id="engineer-build-btns">
                <button type="button" class="btn btn-primary interactive" id="btn-build-sandbags">
                  Build sandbags
                </button>
                <button type="button" class="btn btn-secondary interactive" id="btn-build-bunker">
                  Build bunker
                </button>
                <button type="button" class="btn btn-secondary interactive" id="btn-lay-mine">
                  Lay AT mine
                </button>
              </div>
              <p class="engineer-build-hint" id="engineer-build-hint">
                Click a valid map location — the engineer will move there and build. Esc to cancel.
              </p>
            </div>
            <div class="infantry-trench-actions hidden" id="infantry-trench-actions">
              <div class="engineer-build-btns">
                <button type="button" class="btn btn-primary interactive" id="btn-dig-trench">
                  Dig trench
                </button>
              </div>
              <p class="engineer-build-hint" id="infantry-trench-hint">
                Commanders, radio operators, infantry, airborne, MGs, and snipers dig a fighting trench (~14 s).
              </p>
            </div>
            <div class="radio-binocular-actions hidden" id="radio-binocular-actions">
              <div class="engineer-build-btns">
                <button type="button" class="btn btn-primary interactive" id="btn-radio-binoculars">
                  Binoculars
                </button>
              </div>
              <p class="engineer-build-hint" id="radio-binocular-hint">
                Glass the front — extends fire-support observation range for 45 s (3 min cooldown).
              </p>
            </div>
            <div class="medic-tent-actions hidden" id="medic-tent-actions">
              <div class="engineer-build-btns">
                <button type="button" class="btn btn-primary interactive" id="btn-deploy-field-tent">
                  Field hospital tent
                </button>
              </div>
              <p class="engineer-build-hint" id="medic-tent-hint">
                Medic pitches a tent (~16 s). Non-vehicle units heal nearby.
              </p>
            </div>
          </div>
          <div class="production-panel interactive hidden" id="production-panel">
            <div class="production-header">
              <h3>Reinforcements</h3>
              <button
                type="button"
                class="auto-build-toggle interactive hidden"
                id="btn-toggle-auto-build"
                title="Automatically queue a balanced mix of units"
                aria-pressed="false"
              >
                <span class="auto-build-label">Auto Build</span>
                <span class="auto-build-state">Off</span>
              </button>
            </div>
            <div class="produce-btns" id="produce-btns"></div>
            <p class="queue-text" id="queue-text">Queue empty</p>
          </div>
          <div class="defense-panel interactive hidden collapsed" id="defense-panel">
            <div class="defense-header">
              <button
                type="button"
                class="defense-header-toggle interactive"
                id="btn-toggle-defense"
                aria-expanded="false"
                title="Expand defenses panel"
              >
                <span class="defense-title">Defenses</span>
                <span class="defense-chevron" aria-hidden="true">▼</span>
              </button>
            </div>
            <div class="defense-body" id="defense-body">
              <div class="defense-btns" id="defense-btns"></div>
              <p class="defense-selected" id="defense-selected"></p>
              <button type="button" class="btn btn-primary defense-upgrade-btn interactive hidden" id="btn-defense-upgrade">
                Upgrade emplacement
              </button>
              <button type="button" class="btn btn-secondary defense-resupply-btn interactive hidden" id="btn-defense-resupply">
                Resupply ammo
              </button>
              <p class="defense-hint" id="defense-hint">Click a structure, then click behind the frontline to build.</p>
            </div>
          </div>
          <div class="base-build-panel interactive hidden collapsed" id="base-build-panel">
            <div class="base-build-header">
              <button
                type="button"
                class="base-build-header-toggle interactive"
                id="btn-toggle-base-build"
                aria-expanded="false"
                title="Expand base construction panel"
              >
                <span class="base-build-title">Base Construction</span>
                <span class="base-build-chevron" aria-hidden="true">▼</span>
              </button>
            </div>
            <div class="base-build-body" id="base-build-body">
              <div class="base-build-btns" id="base-build-btns"></div>
              <p class="base-build-hint" id="base-build-hint">
                Build near HQ or a sector you control. LMB place · Esc cancel.
              </p>
            </div>
          </div>
          <div class="hud-command-panels">
            <div class="firesupport-panel interactive collapsed" id="firesupport-panel">
              <div class="firesupport-header">
                <button
                  type="button"
                  class="firesupport-header-toggle interactive"
                id="btn-toggle-firesupport"
                aria-expanded="false"
                title="Expand fire support panel"
                >
                  <span class="firesupport-title">Fire Support</span>
                  <span class="firesupport-chevron" aria-hidden="true">▼</span>
                </button>
              </div>
              <div class="firesupport-body" id="firesupport-body">
                <div class="firesupport-btns" id="firesupport-btns"></div>
                <p class="firesupport-hint" id="firesupport-hint">Off-map assets on cooldown</p>
              </div>
            </div>
            <div class="generalorders-panel interactive collapsed" id="generalorders-panel">
              <div class="generalorders-header">
                <button
                  type="button"
                  class="generalorders-header-toggle interactive"
                id="btn-toggle-generalorders"
                aria-expanded="false"
                title="Expand general orders panel"
                >
                  <span class="generalorders-title">General Orders</span>
                  <span class="generalorders-chevron" aria-hidden="true">▼</span>
                </button>
              </div>
              <div class="generalorders-body" id="generalorders-body">
                <div class="generalorders-btns" id="generalorders-btns"></div>
                <p class="generalorders-hint" id="generalorders-hint">Command-wide orders — 3 min cooldown each</p>
              </div>
            </div>
          </div>
          <p class="hud-hint" id="hud-hint">LMB select · Shift+LMB fire at ground or cover · RMB move/attack</p>
          <button type="button" class="btn-guide-hud interactive" id="btn-guide-hud">Field Manual</button>
        </div>
      </div>

      <div id="overlay-about" class="overlay-about hidden interactive" aria-hidden="true">
        <div class="about-box">
          <h2>About</h2>
          <dl class="about-details">
            <div class="about-row">
              <dt>Author</dt>
              <dd><a href="https://github.com/Phonesis" target="_blank" rel="noopener noreferrer">Martin Poole - GitHub Profile</a></dd>
            </div>
            <div class="about-row">
              <dt>Version</dt>
              <dd>1.0</dd>
            </div>
            <div class="about-row">
              <dt>Feedback / bug reports</dt>
              <dd><a href="mailto:martinppoole@gmail.com">martinppoole@gmail.com</a></dd>
            </div>
          </dl>
          <div class="about-actions">
            <button type="button" class="btn btn-secondary interactive" id="btn-about-close">Close</button>
          </div>
        </div>
      </div>

      <div id="overlay-guide" class="overlay-guide hidden interactive">
        <div class="guide-box">
          <h2>Field Manual</h2>
          <p class="guide-lead">How to play Into the Breach — controls, economy, combat, and victory conditions.</p>
          <div class="guide-scroll" id="guide-content"></div>
          <div class="guide-actions">
            <button type="button" class="btn btn-secondary interactive" id="btn-guide-close">Close</button>
          </div>
        </div>
      </div>

      <div id="laststand-briefing-overlay" class="laststand-briefing-overlay hidden interactive" aria-hidden="true">
        <div class="laststand-briefing-box">
          <p class="laststand-briefing-eyebrow" id="laststand-briefing-eyebrow">Field orders</p>
          <h2 class="laststand-briefing-title" id="laststand-briefing-title">—</h2>
          <p class="laststand-briefing-meta" id="laststand-briefing-meta">—</p>
          <div class="laststand-briefing-body" id="laststand-briefing-body"></div>
          <div class="laststand-briefing-actions">
            <button type="button" class="btn btn-secondary interactive" id="btn-laststand-briefing-review">
              Review deployment
            </button>
            <button type="button" class="btn btn-primary interactive" id="btn-laststand-briefing-begin">
              Begin Battle
            </button>
          </div>
        </div>
      </div>

      <div
        id="overlay-surrender-confirm"
        class="surrender-confirm-overlay hidden interactive"
        role="dialog"
        aria-modal="true"
        aria-labelledby="surrender-confirm-title"
        aria-describedby="surrender-confirm-message"
        aria-hidden="true"
      >
        <div class="surrender-confirm-box">
          <p class="surrender-confirm-eyebrow">Command decision</p>
          <h2 id="surrender-confirm-title">Surrender Battle?</h2>
          <p id="surrender-confirm-message">
            This ends the battle as a defeat and opens the battle report.
          </p>
          <div class="surrender-confirm-actions">
            <button type="button" class="btn btn-secondary interactive" id="btn-surrender-cancel">
              Keep Fighting
            </button>
            <button type="button" class="btn btn-danger interactive" id="btn-surrender-confirm">
              Surrender
            </button>
          </div>
        </div>
      </div>

      <div id="overlay-end" class="overlay-msg hidden interactive">
        <div class="box end-box">
          <h2 id="end-title">Victory</h2>
          <p id="end-msg"></p>
          <div id="end-stats" class="end-stats hidden"></div>
          <div class="end-actions">
            <button class="btn btn-secondary interactive" id="btn-view-battlefield">View battlefield</button>
            <button class="btn btn-primary interactive hidden" id="btn-replay">Replay battle</button>
            <button class="btn btn-secondary interactive" id="btn-menu">Main Menu</button>
          </div>
        </div>
      </div>

      <div id="post-match-view-bar" class="post-match-view-bar hidden interactive" role="toolbar" aria-label="Post-battle inspection">
        <p class="post-match-view-hint">Inspecting the battlefield — pan and zoom to explore</p>
        <button type="button" class="btn btn-primary interactive" id="btn-back-to-results">Back to results</button>
      </div>

      <div
        id="battle-loading-screen"
        class="battle-loading-screen hidden interactive"
        role="status"
        aria-live="polite"
        aria-busy="false"
        aria-hidden="true"
      >
        <div class="battle-loading-art" aria-hidden="true">
          <div class="battle-loading-art-layer battle-loading-art-layer--a"></div>
          <div class="battle-loading-art-layer battle-loading-art-layer--b"></div>
        </div>
        <div class="battle-loading-vignette" aria-hidden="true"></div>
        <div class="battle-loading-content">
          <div class="battle-loading-mark" aria-hidden="true"><span></span></div>
          <span class="battle-loading-kicker">Field Operations</span>
          <h2 id="battle-loading-title">Preparing battlefield</h2>
          <p id="battle-loading-detail">Loading terrain, forces, and combat systems…</p>
          <div class="battle-loading-progress" aria-hidden="true"><span></span></div>
          <span class="battle-loading-status">Stand by — deployment is under way</span>
        </div>
      </div>

      <div id="select-box" class="select-box"></div>
      <div id="save-toast" class="save-toast hidden" role="status" aria-live="polite"></div>
    `;

    this.renderModes();
    this.renderAssaultRoles();
    this.renderFactions();
    this.renderMaps();
    this.renderMapSizes();
    this.renderDifficulties();
    const guideEl = this.root.querySelector('#guide-content');
    if (guideEl) guideEl.innerHTML = renderGameGuideHtml();
    this.guideFromMenu = false;
    this.bind();
    this._bindUnitRoster();
    this.refreshTitleSaveButton();
  }

  renderDifficulties() {
    const grid = this.root.querySelector('#difficulty-grid');
    if (!grid) return;
    grid.innerHTML = DIFFICULTY_LIST.map(
      (d) => `
      <button type="button" class="card-btn interactive difficulty-card${d.id === this.selectedDifficulty ? ' selected' : ''}" data-id="${d.id}" aria-pressed="${d.id === this.selectedDifficulty}">
        <span class="name">${d.name}</span>
        <span class="meta">${d.subtitle}</span>
      </button>
    `
    ).join('');
  }

  renderCampaignStyles() {
    const grid = this.root.querySelector('#campaign-style-grid');
    if (!grid) return;
    const onLargeMap = canUseBaseBuildingOnMap(this.selectedMapSize ?? 'medium');
    grid.innerHTML = CAMPAIGN_STYLE_LIST.map((s) => {
      const selected = s.id === this.selectedCampaignStyle;
      let meta = s.subtitle;
      if (s.id === 'baseBuilding' && !onLargeMap) {
        meta = 'Selects Large map automatically · garrison, depots & sector building';
      }
      return `
      <button type="button" class="card-btn interactive campaign-style-card${selected ? ' selected' : ''}" data-id="${s.id}">
        <span class="name">${s.name}</span>
        <span class="meta">${meta}</span>
      </button>
    `;
    }).join('');
  }

  renderClearanceStyles() {
    const grid = this.root.querySelector('#clearance-style-grid');
    if (!grid) return;
    grid.innerHTML = CLEARANCE_REINFORCEMENT_SIZE_LIST.map(
      (size) => `
      <button type="button" class="card-btn interactive campaign-style-card clearance-style-card${size.id === this.selectedClearanceReinforcementSize ? ' selected' : ''}" data-id="${size.id}">
        <span class="name">${size.name}</span>
        <span class="meta">${size.subtitle}</span>
      </button>
    `
    ).join('');
  }

  renderClearanceRoles() {
    const grid = this.root.querySelector('#clearance-role-grid');
    if (!grid) return;
    grid.innerHTML = CLEARANCE_ROLE_LIST.map(
      (role) => `
      <button type="button" class="card-btn interactive campaign-style-card clearance-role-card${role.id === this.selectedClearanceRole ? ' selected' : ''}" data-id="${role.id}">
        <span class="name">${role.name}</span>
        <span class="meta">${role.subtitle}</span>
      </button>
    `
    ).join('');
  }

  updateCampaignStyleMapSizeLock() {
    const lockBaseBuilding =
      this.selectedGameMode === 'campaign' && this.selectedCampaignStyle === 'baseBuilding';
    const note = this.root.querySelector('#campaign-style-note');
    if (note) note.classList.toggle('hidden', !lockBaseBuilding);
    if (lockBaseBuilding && this.selectedMapSize !== BASE_BUILDING_MIN_MAP_SIZE) {
      this.selectedMapSize = BASE_BUILDING_MIN_MAP_SIZE;
    }
    this.renderCampaignStyles();
    this.renderClearanceStyles();
    this.renderMapSizes();
  }

  renderTdWaveModes() {
    const grid = this.root.querySelector('#td-wave-mode-grid');
    if (!grid) return;
    grid.innerHTML = TD_WAVE_MODE_LIST.map(
      (m) => `
      <button type="button" class="card-btn interactive campaign-style-card td-wave-mode-card${m.id === this.selectedTdWaveMode ? ' selected' : ''}" data-id="${m.id}">
        <span class="name">${m.name}</span>
        <span class="meta">${m.subtitle}</span>
      </button>
    `
    ).join('');
  }

  renderTdStyles() {
    const grid = this.root.querySelector('#td-style-grid');
    if (!grid) return;
    grid.innerHTML = TD_STYLE_MODE_LIST.map(
      (m) => `
      <button type="button" class="card-btn interactive campaign-style-card td-style-card${m.id === this.selectedTdStyle ? ' selected' : ''}" data-id="${m.id}">
        <span class="name">${m.name}</span>
        <span class="meta">${m.subtitle}</span>
      </button>
    `
    ).join('');
  }

  renderLastStandDeployModes() {
    const grid = this.root.querySelector('#laststand-deploy-grid');
    if (!grid) return;
    grid.innerHTML = LAST_STAND_DEPLOY_MODE_LIST.map(
      (m) => `
      <button type="button" class="card-btn interactive campaign-style-card laststand-deploy-card${m.id === this.selectedLastStandDeployMode ? ' selected' : ''}" data-id="${m.id}">
        <span class="name">${m.name}</span>
        <span class="meta">${m.subtitle}</span>
      </button>
    `
    ).join('');
    this.renderLastStandPresetSizes();
  }

  renderLastStandPresetSizes() {
    const block = this.root.querySelector('#laststand-preset-size-block');
    const grid = this.root.querySelector('#laststand-preset-size-grid');
    const note = this.root.querySelector('#laststand-deploy-note');
    if (!block || !grid) return;

    const preset =
      this.selectedGameMode === 'lastStand' &&
      isLastStandPresetDeployMode(this.selectedLastStandDeployMode);
    block.classList.toggle('hidden', !preset);
    if (!preset) return;

    const mapId = this.selectedMap;
    const mapDef = mapId ? MAPS[mapId] : null;
    // Clamp selection if Large is blocked for this map.
    this.selectedLastStandPresetSize = resolveLastStandPresetSize(
      this.selectedLastStandPresetSize,
      mapDef ?? mapId
    );
    const largeBlocked = !canUseLastStandPresetSize('large', mapDef ?? mapId);
    if (note) note.classList.toggle('hidden', !largeBlocked);

    grid.innerHTML = LAST_STAND_PRESET_SIZE_LIST.map((size) => {
      const allowed = canUseLastStandPresetSize(size.id, mapDef ?? mapId);
      const selected = size.id === this.selectedLastStandPresetSize;
      const count = countLastStandPresetUnits(mapDef, size.id);
      const meta = !allowed
        ? 'Not available on Berlin / dense urban maps'
        : `${size.subtitle} (~${count}/side)`;
      return `
      <button type="button" class="card-btn interactive campaign-style-card laststand-preset-size-card${selected ? ' selected' : ''}${!allowed ? ' map-size-card--disabled' : ''}" data-id="${size.id}"${!allowed ? ' disabled' : ''}>
        <span class="name">${size.name}</span>
        <span class="meta">${meta}</span>
      </button>
    `;
    }).join('');
  }

  updateLastStandMapSizeLock() {
    // Preset no longer forces Large map size; only re-clamp preset force size.
    this.renderLastStandPresetSizes();
    this.renderMapSizes();
  }

  updateModeSetupPanels() {
    const styleBlock = this.root.querySelector('#campaign-style-block');
    const clearanceRoleBlock = this.root.querySelector('#clearance-role-block');
    const clearanceStyleBlock = this.root.querySelector('#clearance-style-block');
    const clearanceTimeLimitBlock = this.root.querySelector('#clearance-time-limit-block');
    const tdWaveBlock = this.root.querySelector('#td-wave-mode-block');
    const tdStyleBlock = this.root.querySelector('#td-style-block');
    const lastStandBlock = this.root.querySelector('#laststand-deploy-block');
    const isCampaign = this.selectedGameMode === 'campaign';
    const isClearance = this.selectedGameMode === 'clearance';
    const isTowerDefense = this.selectedGameMode === 'towerDefense';
    const isLastStand = this.selectedGameMode === 'lastStand';
    if (styleBlock) styleBlock.classList.toggle('hidden', !isCampaign);
    if (clearanceRoleBlock) clearanceRoleBlock.classList.toggle('hidden', !isClearance);
    if (clearanceStyleBlock) clearanceStyleBlock.classList.toggle('hidden', !isClearance);
    if (clearanceTimeLimitBlock) clearanceTimeLimitBlock.classList.toggle('hidden', !isClearance);
    if (tdWaveBlock) tdWaveBlock.classList.toggle('hidden', !isTowerDefense);
    if (tdStyleBlock) tdStyleBlock.classList.toggle('hidden', !isTowerDefense);
    if (lastStandBlock) lastStandBlock.classList.toggle('hidden', !isLastStand);
    if (isCampaign) {
      this.renderCampaignStyles();
      this.updateCampaignStyleMapSizeLock();
    }
    if (isClearance) {
      this.renderClearanceRoles();
      this.renderClearanceStyles();
    }
    const clearanceTimeLimitToggle = this.root.querySelector('#clearance-time-limit-toggle');
    if (clearanceTimeLimitToggle) {
      clearanceTimeLimitToggle.checked = this.selectedClearanceTimeLimitEnabled;
    }
    if (isTowerDefense) {
      this.renderTdWaveModes();
      this.renderTdStyles();
    }
    if (isLastStand) {
      this.renderLastStandDeployModes();
      this.updateLastStandMapSizeLock();
    } else {
      this.renderMapSizes();
    }
  }

  renderAssaultRoles() {
    const grid = this.root.querySelector('#role-grid');
    if (!grid) return;
    const roles = ASSAULT_ROLE_LIST;
    const selectedId = this.selectedAssaultRole;
    const title = this.root.querySelector('#role-screen-title');
    const blurb = this.root.querySelector('#role-screen-blurb');
    const heading = this.root.querySelector('#role-screen-heading');
    if (title) title.textContent = 'Choose Your Role';
    if (blurb) {
      blurb.textContent =
        'Lead the breakthrough or take command of the defensive line.';
    }
    if (heading) heading.textContent = 'Field Orders';
    grid.innerHTML = roles.map(
      (r, index) => `
      <button class="card-btn interactive role-card${r.id === selectedId ? ' selected' : ''}" data-id="${r.id}">
        <span class="card-index">Order ${String(index + 1).padStart(2, '0')}</span>
        <span class="name">${r.name}</span>
        <span class="meta">${r.subtitle}</span>
      </button>
    `
    ).join('');
    const continueBtn = this.root.querySelector('#btn-to-faction-role');
    if (continueBtn) continueBtn.disabled = !selectedId;
  }

  renderModes() {
    const grid = this.root.querySelector('#mode-grid');
    grid.innerHTML = GAME_MODE_LIST.map(
      (m, index) => `
      <button class="card-btn interactive mode-card" data-id="${m.id}">
        <span class="card-index">Operation ${String(index + 1).padStart(2, '0')}</span>
        <span class="name">${m.name}</span>
        <span class="meta">${m.subtitle}</span>
      </button>
    `
    ).join('');
  }

  renderFactions() {
    const grid = this.root.querySelector('#faction-grid');
    grid.innerHTML = FACTION_LIST.map((f, index) => {
      const roster = getProducibleUnits(f)
        .map((key) => {
          const def = f.units[key];
          const role = FACTION_ROSTER_LABELS[key] ?? key;
          return `<li title="${def.designation}"><span class="unit-role">${role}</span><span class="unit-name">${def.name}</span></li>`;
        })
        .join('');
      return `
      <button class="card-btn interactive faction-card" data-id="${f.id}">
        <img class="faction-flag" src="${f.flag}" alt="" loading="lazy" draggable="false" />
        <span class="card-index">Field Army ${String(index + 1).padStart(2, '0')}</span>
        <span class="name">${f.name}</span>
        <span class="meta">${f.era}</span>
        <span class="units-preview-label">Units</span>
        <ul class="faction-units">${roster}</ul>
      </button>
    `;
    }).join('');
  }

  renderMaps() {
    const grid = this.root.querySelector('#map-grid');
    grid.innerHTML = MAP_LIST.map(
      (m, index) => `
      <button class="card-btn interactive map-card" data-id="${m.id}">
        <span class="card-index">Theater ${String(index + 1).padStart(2, '0')}</span>
        <span class="name">${m.name}</span>
        <span class="meta">${m.subtitle}</span>
        <span class="units-preview">${m.features.join(' · ')}</span>
      </button>
    `
    ).join('');
  }

  renderMapSizes() {
    const grid = this.root.querySelector('#map-size-grid');
    if (!grid) return;
    const lockBaseBuilding =
      this.selectedGameMode === 'campaign' && this.selectedCampaignStyle === 'baseBuilding';
    const mapBase = this.selectedMap ? MAPS[this.selectedMap] : null;
    const mapAllowed = getMapSizeOptions(mapBase);
    if (mapBase) {
      this.selectedMapSize = resolveMapSizeId(mapBase, this.selectedMapSize);
    }
    if (
      this.selectedGameMode === 'assault' &&
      !canUseAssaultMapSize(this.selectedMapSize)
    ) {
      this.selectedMapSize =
        mapAllowed.find((sizeId) => canUseAssaultMapSize(sizeId)) ?? 'medium';
    }
    grid.innerHTML = MAP_SIZE_LIST.map((preset) => {
      const selected = preset.id === this.selectedMapSize;
      const mapBlocks = !mapAllowed.includes(preset.id);
      const assaultBlocks =
        this.selectedGameMode === 'assault' && !canUseAssaultMapSize(preset.id);
      const disabled =
        mapBlocks ||
        assaultBlocks ||
        (lockBaseBuilding && preset.id !== BASE_BUILDING_MIN_MAP_SIZE);
      let meta = preset.subtitle;
      if (mapBlocks) {
        meta =
          mapAllowed.length === 1
            ? `${mapBase?.name ?? 'This map'} is fixed at ${MAP_SIZE_LIST.find((p) => p.id === mapAllowed[0])?.name ?? mapAllowed[0]}`
            : 'Not available on this map';
      } else if (assaultBlocks) {
        meta = 'Breakthrough requires a Medium or Large battlefield';
      } else if (lockBaseBuilding && preset.id !== BASE_BUILDING_MIN_MAP_SIZE) {
        meta = 'Base Building needs a large theater';
      }
      return `
      <button type="button" class="card-btn interactive map-size-card${selected ? ' selected' : ''}${disabled ? ' map-size-card--disabled' : ''}" data-id="${preset.id}"${disabled ? ' disabled' : ''}>
        <span class="name">${preset.name}</span>
        <span class="meta">${meta}</span>
      </button>
    `;
    }).join('');
  }

  bind() {
    const menuScreens = new Set(['title', 'settings', 'mode', 'assault-role', 'faction', 'map', 'saves']);

    const show = (id) => {
      this.root.querySelectorAll('.screen').forEach((el) => el.classList.add('hidden'));
      const el = this.root.querySelector(`#screen-${id}`);
      if (el) el.classList.remove('hidden');
      if (id === 'faction') this.updateFactionScreenBg(this.selectedFaction);
      if (this.callbacks.onMenuVisible) {
        this.callbacks.onMenuVisible(menuScreens.has(id));
      }
    };

    this.root.querySelector('#btn-start').onclick = () => show('mode');
    this.root.querySelector('#btn-settings').onclick = () => {
      this._settingsReturnTarget = 'title';
      this._syncSettingsBackButton();
      this._syncSettingsControls();
      show('settings');
    };
    this.root.querySelector('#btn-back-settings').onclick = () => {
      if (!this.closePausedSettings()) show('title');
    };
    this.root.querySelector('#btn-reset-settings')?.addEventListener('click', () => {
      this.resetAllSettings();
    });
    this.root.querySelector('#btn-pause-settings')?.addEventListener('click', () => {
      this.openPausedSettings();
    });
    this.root.querySelector('#btn-load-saves').onclick = () => {
      this.renderSaveList();
      show('saves');
    };
    this.root.querySelector('#btn-back-saves').onclick = () => show('title');
    this.root.querySelector('#btn-guide-title').onclick = () => this.openGuide(true);
    this.root.querySelectorAll('[data-setting]').forEach((input) => {
      input.addEventListener('change', () => this._setMenuSetting(input.dataset.setting, input.checked));
    });
    this._bindSettingsInfo();
    this.root.querySelector('#debris-retention-slider')?.addEventListener('input', (event) => {
      const index = writeDebrisRetentionIndex(event.currentTarget.value);
      this._syncDebrisRetentionControl(index);
      if (this._settingsReturnTarget === 'pause') {
        this.callbacks.onChangeDebrisRetention?.(DEBRIS_RETENTION_OPTIONS[index].seconds);
      }
    });
    this.root.querySelector('#btn-about')?.addEventListener('click', () => this.openAbout());
    this.root.querySelector('#btn-about-close')?.addEventListener('click', () => this.closeAbout());
    this.root.querySelector('#btn-guide-hud')?.addEventListener('click', () => this.openGuide(false));
    this.root.querySelector('#btn-toggle-field-icons')?.addEventListener('click', () => {
      this.setUnitFieldIconsEnabled(!this.showUnitFieldIcons);
      if (this.callbacks.onToggleUnitFieldIcons) {
        this.callbacks.onToggleUnitFieldIcons(this.showUnitFieldIcons);
      }
    });
    this.root.querySelector('#btn-toggle-unit-status')?.addEventListener('click', () => {
      this.setUnitStatusEnabled(!this.showUnitStatus);
      this.callbacks.onToggleUnitStatus?.(this.showUnitStatus);
    });
    this.root.querySelector('#btn-dismount-riders')?.addEventListener('click', () => {
      this.callbacks.onDismountTankRiders?.();
    });
    this.root.querySelector('#btn-toggle-frontline')?.addEventListener('click', () => {
      this.setFrontlineVisible(!this.showFrontline);
      if (this.callbacks.onToggleFrontline) {
        this.callbacks.onToggleFrontline(this.showFrontline);
      }
    });
    this.root.querySelector('#btn-toggle-capture-points')?.addEventListener('click', () => {
      this.setCapturePointsVisible(!this.showCapturePoints);
      this.callbacks.onToggleCapturePoints?.(this.showCapturePoints);
    });
    this.root.querySelector('#btn-toggle-hud-visibility')?.addEventListener('click', () => {
      this.setHudHidden(!this.hudHidden);
    });
    this.root.querySelector('#btn-toggle-firesupport')?.addEventListener('click', () => {
      this.setFireSupportExpanded(!this.fireSupportExpanded);
    });
    this.root.querySelector('#btn-toggle-generalorders')?.addEventListener('click', () => {
      this.setGeneralOrdersExpanded(!this.generalOrdersExpanded);
    });
    this._onDocumentPointerDown = (e) => this._collapseCommandPanelsOnOutsideClick(e);
    document.addEventListener('pointerdown', this._onDocumentPointerDown, true);
    this.root.querySelector('#btn-toggle-defense')?.addEventListener('click', () => {
      this.setDefenseExpanded(!this.defenseExpanded);
    });
    this.root.querySelector('#btn-toggle-base-build')?.addEventListener('click', () => {
      this.setBaseBuildExpanded(!this.baseBuildExpanded);
    });
    this.root.querySelector('#btn-guide-close').onclick = () => this.closeGuide();
    this.root.querySelector('#btn-back-title').onclick = () => show('title');

    this.root.querySelectorAll('.mode-card').forEach((btn) => {
      btn.onclick = () => {
        this.root.querySelectorAll('.mode-card').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedGameMode = btn.dataset.id;
        if (btn.dataset.id !== 'assault') {
          this.selectedAssaultRole = null;
        }
        if (btn.dataset.id !== 'clearance') {
          this.selectedClearanceRole = DEFAULT_CLEARANCE_ROLE;
        }
        this.root.querySelector('#btn-to-faction').disabled = false;
        this.updateModeSetupPanels();
      };
    });

    this.root.querySelector('#btn-to-faction').onclick = () => {
      if (this.selectedGameMode === 'assault') {
        this.renderAssaultRoles();
        show('assault-role');
      } else show('faction');
    };

    this.root.querySelector('#btn-back-mode-role').onclick = () => show('mode');
    this.root.querySelector('#role-grid')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.role-card');
      if (!btn) return;
      this.root.querySelectorAll('.role-card').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      this.selectedAssaultRole = btn.dataset.id;
      this.root.querySelector('#btn-to-faction-role').disabled = false;
    });
    this.root.querySelector('#btn-to-faction-role').onclick = () => show('faction');
    this.root.querySelector('#btn-back-mode').onclick = () => {
      if (this.selectedGameMode === 'assault') {
        this.renderAssaultRoles();
        show('assault-role');
      } else {
        show('mode');
      }
    };
    this.root.querySelector('#btn-back-faction').onclick = () => show('faction');

    this.root.querySelectorAll('.faction-card').forEach((btn) => {
      btn.addEventListener('mouseenter', () => this.updateFactionScreenBg(btn.dataset.id));
      btn.addEventListener('mouseleave', () => this.updateFactionScreenBg(this.selectedFaction));
      btn.onclick = () => {
        this.root.querySelectorAll('.faction-card').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedFaction = btn.dataset.id;
        this.updateFactionScreenBg(this.selectedFaction);
        this.root.querySelector('#btn-to-maps').disabled = false;
      };
    });

    this.root.querySelector('#btn-to-maps').onclick = () => {
      this.updateModeSetupPanels();
      this.renderMapSizes();
      show('map');
    };

    this.root.querySelector('#map-size-grid')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.map-size-card');
      if (!btn || btn.disabled) return;
      this.root.querySelectorAll('.map-size-card').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      this.selectedMapSize = btn.dataset.id;
      if (
        this.selectedGameMode === 'campaign' &&
        !canUseBaseBuildingOnMap(this.selectedMapSize) &&
        this.selectedCampaignStyle === 'baseBuilding'
      ) {
        this.selectedCampaignStyle = 'classic';
      }
      this.updateCampaignStyleMapSizeLock();
    });

    this.root.querySelector('#difficulty-grid')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.difficulty-card');
      if (!btn) return;
      this.selectedDifficulty = writeDifficultySetting(btn.dataset.id);
      this.renderDifficulties();
    });

    this.root.querySelector('#clearance-style-grid')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.clearance-style-card');
      if (!btn) return;
      this.root.querySelectorAll('.clearance-style-card').forEach((b) => {
        b.classList.remove('selected');
      });
      btn.classList.add('selected');
      this.selectedClearanceReinforcementSize = btn.dataset.id;
    });

    this.root.querySelector('#clearance-role-grid')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.clearance-role-card');
      if (!btn) return;
      this.root.querySelectorAll('.clearance-role-card').forEach((roleBtn) => {
        roleBtn.classList.remove('selected');
      });
      btn.classList.add('selected');
      this.selectedClearanceRole = btn.dataset.id;
    });

    this.root.querySelector('#clearance-time-limit-toggle')?.addEventListener('change', (e) => {
      this.selectedClearanceTimeLimitEnabled = e.currentTarget.checked;
    });

    this.root.querySelector('#campaign-style-grid')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.campaign-style-card');
      if (
        !btn ||
        btn.disabled ||
        btn.classList.contains('td-wave-mode-card') ||
        btn.classList.contains('td-style-card')
      ) {
        return;
      }
      this.root.querySelectorAll('.campaign-style-card').forEach((b) => {
        if (!b.classList.contains('td-wave-mode-card') && !b.classList.contains('td-style-card')) {
          b.classList.remove('selected');
        }
      });
      btn.classList.add('selected');
      this.selectedCampaignStyle = btn.dataset.id;
      if (this.selectedCampaignStyle === 'baseBuilding') {
        this.selectedMapSize = BASE_BUILDING_MIN_MAP_SIZE;
      }
      this.updateCampaignStyleMapSizeLock();
    });

    this.root.querySelector('#td-wave-mode-grid')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.td-wave-mode-card');
      if (!btn) return;
      this.root.querySelectorAll('.td-wave-mode-card').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      this.selectedTdWaveMode = btn.dataset.id;
    });

    this.root.querySelector('#td-style-grid')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.td-style-card');
      if (!btn) return;
      this.root.querySelectorAll('.td-style-card').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      this.selectedTdStyle = btn.dataset.id;
    });

    this.root.querySelector('#laststand-deploy-grid')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.laststand-deploy-card');
      if (!btn) return;
      this.root.querySelectorAll('.laststand-deploy-card').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      this.selectedLastStandDeployMode = btn.dataset.id;
      this.updateLastStandMapSizeLock();
    });

    this.root.querySelector('#laststand-preset-size-grid')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.laststand-preset-size-card');
      if (!btn || btn.disabled) return;
      this.root
        .querySelectorAll('.laststand-preset-size-card')
        .forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      this.selectedLastStandPresetSize = btn.dataset.id;
    });

    this.root.querySelectorAll('.map-card').forEach((btn) => {
      btn.onclick = () => {
        this.root.querySelectorAll('.map-card').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedMap = btn.dataset.id;
        const mapBase = MAPS[this.selectedMap];
        if (mapBase) this.selectedMapSize = getDefaultMapSize(mapBase);
        this.renderMapSizes();
        this.renderLastStandPresetSizes();
        this.root.querySelector('#btn-launch').disabled = false;
      };
    });

    this.root.querySelector('#btn-launch').onclick = () => {
      if (!this.selectedFaction || !this.selectedMap || !this.selectedGameMode) return;
      if (this.selectedGameMode === 'assault' && !this.selectedAssaultRole) return;
      if (this.selectedGameMode === 'clearance' && !this.selectedClearanceRole) return;
      if (this.callbacks.onStartGame) {
        const baseBuildingStyle =
          this.selectedGameMode === 'campaign' &&
          this.selectedCampaignStyle === 'baseBuilding';
        const mapBase = MAPS[this.selectedMap];
        const resolvedMapSize = resolveMapSizeId(
          mapBase,
          this.selectedMapSize ?? 'medium'
        );
        const mapSize = baseBuildingStyle
          ? BASE_BUILDING_MIN_MAP_SIZE
          : this.selectedGameMode === 'assault'
            ? resolveAssaultMapSize(resolvedMapSize)
            : resolvedMapSize;
        const lastStandPreset =
          this.selectedGameMode === 'lastStand' &&
          isLastStandPresetDeployMode(this.selectedLastStandDeployMode);
        void this._runLoadingAction(
          () => this.callbacks.onStartGame(this.selectedFaction, this.selectedMap, this.selectedGameMode, {
            assaultRole: this.selectedAssaultRole ?? 'defend',
            difficulty: this.selectedDifficulty,
            mapSize,
            campaignStyle:
              this.selectedGameMode === 'campaign' ? this.selectedCampaignStyle : undefined,
            clearanceRole:
              this.selectedGameMode === 'clearance' ? this.selectedClearanceRole : undefined,
            clearanceReinforcementSize:
              this.selectedGameMode === 'clearance'
                ? this.selectedClearanceReinforcementSize
                : undefined,
            clearanceTimeLimitEnabled:
              this.selectedGameMode === 'clearance'
                ? this.selectedClearanceTimeLimitEnabled
                : undefined,
            tdWaveMode:
              this.selectedGameMode === 'towerDefense' ? this.selectedTdWaveMode : undefined,
            tdStyle:
              this.selectedGameMode === 'towerDefense' ? this.selectedTdStyle : undefined,
            lastStandDeployMode:
              this.selectedGameMode === 'lastStand' ? this.selectedLastStandDeployMode : undefined,
            lastStandPresetSize: lastStandPreset
              ? resolveLastStandPresetSize(
                  this.selectedLastStandPresetSize,
                  mapBase ?? this.selectedMap
                )
              : undefined,
          }),
          {
            title: 'Deploying operation',
            detail: 'Loading the theater, forces, and combat systems…',
          }
        );
      }
    };

    this.root.querySelector('#btn-menu').onclick = () => {
      this.hideEndOverlay();
      this.hidePostMatchViewBar();
      if (this.callbacks.onReturnMenu) this.callbacks.onReturnMenu();
      this.refreshTitleSaveButton();
      show('title');
    };

    this.root.querySelector('#btn-view-battlefield').onclick = () => {
      if (this.callbacks.onViewBattlefield) this.callbacks.onViewBattlefield();
    };

    this.root.querySelector('#btn-back-to-results').onclick = () => {
      if (this.callbacks.onExitBattlefieldView) this.callbacks.onExitBattlefieldView();
    };

    this.root.querySelector('#btn-replay').onclick = () => {
      this.hideEndOverlay();
      this.hidePostMatchViewBar();
      void this._runLoadingAction(
        () => this.callbacks.onReplay?.(),
        {
          title: 'Replaying operation',
          detail: 'Rebuilding the battlefield and restoring the original command plan…',
        }
      );
    };

    this.root.querySelector('#btn-launch-battle-now')?.addEventListener('click', () => {
      this.callbacks.onLaunchBattleNow?.();
    });

    this._lastStandBriefingHandlers = { onBegin: null, onDismiss: null };
    this.root.querySelector('#btn-laststand-briefing-begin')?.addEventListener('click', () => {
      this._lastStandBriefingHandlers.onBegin?.();
    });
    this.root.querySelector('#btn-laststand-briefing-review')?.addEventListener('click', () => {
      this._lastStandBriefingHandlers.onDismiss?.();
    });

    this.root.querySelector('#btn-td-skip-wave-countdown')?.addEventListener('click', () => {
      this.callbacks.onSkipTowerDefenseWave?.();
    });

    this.root.querySelector('#btn-engage-target').onclick = () => {
      if (this.callbacks.onConfirmTarget) this.callbacks.onConfirmTarget();
    };
    this.root.querySelector('#btn-stance-hold')?.addEventListener('click', () => {
      this.callbacks.onSetEngagementStance?.('hold');
    });
    this.root.querySelector('#btn-stance-pursue')?.addEventListener('click', () => {
      this.callbacks.onSetEngagementStance?.('pursue');
    });
    this.root.querySelector('#btn-arty-autofire')?.addEventListener('click', () => {
      this.callbacks.onToggleArtilleryAutoFire?.();
    });

    this.root.querySelector('#btn-build-sandbags')?.addEventListener('click', () => {
      this.callbacks.onArmSandbags?.();
    });
    this.root.querySelector('#btn-build-bunker')?.addEventListener('click', () => {
      this.callbacks.onArmBunker?.();
    });
    this.root.querySelector('#btn-lay-mine')?.addEventListener('click', () => {
      this.callbacks.onArmMine?.();
    });
    this.root.querySelector('#btn-dig-trench')?.addEventListener('click', () => {
      this.callbacks.onArmTrenchDig?.();
    });
    this.root.querySelector('#btn-radio-binoculars')?.addEventListener('click', () => {
      this.callbacks.onUseRadioBinoculars?.();
    });
    this.root.querySelector('#btn-deploy-field-tent')?.addEventListener('click', () => {
      this.callbacks.onArmMedicTent?.();
    });

    this.root.querySelector('#produce-btns')?.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest?.('.produce-btn');
      if (!btn?.dataset?.type || btn.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onProduce?.(btn.dataset.type);
    });

    this.root.querySelector('#btn-toggle-auto-build')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this._hudCheatMode) return;
      this.setAutoBuildMode(!this.autoBuildMode);
      this.callbacks.onToggleAutoBuild?.(this.autoBuildMode);
    });

    const tabletTargetBtn = this.root.querySelector('#btn-tablet-target');
    const tabletFireBtn = this.root.querySelector('#btn-tablet-fire');
    const stopTabletPointer = (e) => e.stopPropagation();
    for (const btn of [tabletTargetBtn, tabletFireBtn]) {
      btn?.addEventListener('pointerdown', stopTabletPointer);
    }
    tabletTargetBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = !tabletTargetBtn.classList.contains('is-active');
      this.setTabletTargetMode(on);
      if (this.callbacks.onTabletTargetMode) this.callbacks.onTabletTargetMode(on);
    });
    tabletFireBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = !tabletFireBtn.classList.contains('is-active');
      this.setTabletFireMode(on);
      if (this.callbacks.onTabletFireMode) this.callbacks.onTabletFireMode(on);
    });

    const cancelFireBtn = this.root.querySelector('#btn-cancel-fire-missions');
    const stopHudPointer = (e) => e.stopPropagation();
    cancelFireBtn?.addEventListener('pointerdown', stopHudPointer);
    cancelFireBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onCancelFireMissions?.();
    });

    const smokeShellBtn = this.root.querySelector('#btn-smoke-shell');
    smokeShellBtn?.addEventListener('pointerdown', stopHudPointer);
    smokeShellBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.onArmSmokeShell?.();
    });

    this.root.querySelector('#btn-save-battle')?.addEventListener('click', () => {
      this.callbacks.onSaveBattle?.();
    });

    this.root.querySelector('#btn-surrender')?.addEventListener('click', () => {
      this.openSurrenderConfirm();
    });
    this.root.querySelector('#btn-surrender-cancel')?.addEventListener('click', () => {
      this.closeSurrenderConfirm();
    });
    this.root.querySelector('#btn-surrender-confirm')?.addEventListener('click', () => {
      this.closeSurrenderConfirm({ restoreFocus: false });
      this.callbacks.onSurrender?.();
    });
    const surrenderOverlay = this.root.querySelector('#overlay-surrender-confirm');
    surrenderOverlay?.addEventListener('pointerdown', (event) => {
      if (event.target === surrenderOverlay) this.closeSurrenderConfirm();
    });
    surrenderOverlay?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeSurrenderConfirm();
        return;
      }
      if (event.key !== 'Tab') return;
      const buttons = [
        this.root.querySelector('#btn-surrender-cancel'),
        this.root.querySelector('#btn-surrender-confirm'),
      ].filter(Boolean);
      if (buttons.length < 2) return;
      const current = buttons.indexOf(document.activeElement);
      if (event.shiftKey && current <= 0) {
        event.preventDefault();
        buttons[buttons.length - 1].focus();
      } else if (!event.shiftKey && current === buttons.length - 1) {
        event.preventDefault();
        buttons[0].focus();
      }
    });

    if (this.callbacks.onMenuVisible) this.callbacks.onMenuVisible(true);
  }

  openAbout() {
    const overlay = this.root.querySelector('#overlay-about');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
  }

  closeAbout() {
    const overlay = this.root.querySelector('#overlay-about');
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }

  openSurrenderConfirm() {
    const overlay = this.root.querySelector('#overlay-surrender-confirm');
    if (!overlay) return;
    const tutorial = !this.root.querySelector('#tutorial-banner')?.classList.contains('hidden');
    const title = this.root.querySelector('#surrender-confirm-title');
    const message = this.root.querySelector('#surrender-confirm-message');
    const cancel = this.root.querySelector('#btn-surrender-cancel');
    const confirm = this.root.querySelector('#btn-surrender-confirm');

    if (title) title.textContent = tutorial ? 'Leave Training?' : 'Surrender Battle?';
    if (message) {
      message.textContent = tutorial
        ? 'Leave the training ground? Your current practice battle will end and the battle report will open.'
        : 'Surrendering ends this battle as a defeat and opens the battle report.';
    }
    if (cancel) cancel.textContent = tutorial ? 'Continue Training' : 'Keep Fighting';
    if (confirm) confirm.textContent = tutorial ? 'Leave Training' : 'Surrender';

    this._surrenderPreviousFocus = document.activeElement;
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => cancel?.focus());
  }

  closeSurrenderConfirm({ restoreFocus = true } = {}) {
    const overlay = this.root.querySelector('#overlay-surrender-confirm');
    if (!overlay || overlay.classList.contains('hidden')) return;
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    if (restoreFocus && this._surrenderPreviousFocus?.focus) {
      this._surrenderPreviousFocus.focus();
    }
    this._surrenderPreviousFocus = null;
  }

  openGuide(fromMenu = false) {
    this.guideFromMenu = fromMenu;
    const overlay = this.root.querySelector('#overlay-guide');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    overlay.classList.toggle('guide-from-menu', fromMenu);
    if (fromMenu) {
      this.root.querySelectorAll('.screen').forEach((el) => el.classList.add('hidden'));
    }
  }

  closeGuide() {
    const overlay = this.root.querySelector('#overlay-guide');
    if (overlay) overlay.classList.add('hidden');
    if (this.guideFromMenu) {
      this.root.querySelector('#screen-title')?.classList.remove('hidden');
    }
    this.guideFromMenu = false;
  }

  setMinimapMap(mapDef) {
    this.minimap?.setMapDef(mapDef);
  }

  updateMinimap(state) {
    this.minimap?.update(state);
  }

  recordMinimapFire(shot) {
    this.minimap?.recordFireTrace(shot);
  }

  tickMinimapFireTraces(dt) {
    return this.minimap?.tickFireTraces(dt) ?? false;
  }

  minimapHasFireTraces() {
    return this.minimap?.hasFireTraces?.() ?? false;
  }

  clearMinimap() {
    this.minimap?.clear();
  }

  setGamePaused(paused, report = null) {
    const overlay = this.root.querySelector('#pause-overlay');
    const hud = this.root.querySelector('#hud');
    if (paused && report) this.updatePauseStats(report);
    if (overlay) {
      overlay.classList.toggle('hidden', !paused);
      overlay.setAttribute('aria-hidden', paused ? 'false' : 'true');
    }
    hud?.classList.toggle('game-paused', !!paused);
    this._syncHudVisibility();
  }

  updatePauseStats(report) {
    const grid = this.root.querySelector('#pause-casualty-grid');
    if (!grid || !report) return;
    grid.innerHTML = this.renderPauseBattleStats(report);
  }

  renderPauseBattleStats(report) {
    const listRows = (lines) => {
      if (!lines?.length) return '<li class="pause-overlay-empty">No casualties recorded</li>';
      return lines
        .map((line) => {
          const unitCount = Number(line.unitCount) > 0
            ? `<span class="pause-loss-unit-count">${line.unitCount} unit${line.unitCount === 1 ? '' : 's'}</span>`
            : '';
          const casualtyCount = `${line.count} ${line.count === 1 ? 'casualty' : 'casualties'}`;
          return `
            <li>
              <span class="loss-type">${line.label}</span>
              <span class="pause-loss-detail">${unitCount}${unitCount ? '<span class="pause-loss-separator">·</span>' : ''}${casualtyCount}</span>
            </li>
          `;
        })
        .join('');
    };

    const side = (name, lines, total, hqLost, hqLabel) => {
      const hqRow = hqLost
        ? `<li class="loss-hq"><span class="loss-type">${hqLabel}</span><span class="loss-n">Destroyed</span></li>`
        : '';
      return `
        <div class="pause-overlay-casualty-col">
          <h3>${name}</h3>
          <p class="pause-overlay-casualty-total">${total} ${total === 1 ? 'casualty' : 'casualties'}</p>
          <p class="pause-overlay-casualty-subheading">By unit type</p>
          <ul class="pause-overlay-casualty-list">${listRows(lines)}${hqRow}</ul>
        </div>
      `;
    };

    return `
      ${side(
        report.playerName,
        report.playerLines,
        report.playerTotal,
        report.playerHqLost,
        'Headquarters'
      )}
      ${side(
        report.enemyName,
        report.enemyLines,
        report.enemyTotal,
        report.enemyHqLost,
        report.tutorial ? 'Practice HQ' : 'Headquarters'
      )}
    `;
  }

  /**
   * Hide / show all battle HUD chrome (minimap, panels, banners).
   * Pause overlay stays available so the player can unhide or resume with P.
   */
  setHudHidden(hidden) {
    this.hudHidden = !!hidden;
    this._syncHudVisibility();
  }

  _syncHudVisibility() {
    const hud = this.root.querySelector('#hud');
    hud?.classList.toggle('hud-chrome-hidden', !!this.hudHidden);

    const btn = this.root.querySelector('#btn-toggle-hud-visibility');
    if (btn) {
      btn.textContent = this.hudHidden ? 'Show HUD' : 'Hide HUD';
      btn.setAttribute('aria-pressed', this.hudHidden ? 'true' : 'false');
      btn.classList.toggle('is-active', !!this.hudHidden);
      btn.title = this.hudHidden
        ? 'Show all HUD elements again'
        : 'Hide all on-screen HUD elements (minimap, panels, banners)';
    }

    const hint = this.root.querySelector('#pause-hud-toggle-hint');
    if (hint) {
      hint.textContent = this.hudHidden
        ? 'HUD hidden — press P to resume, or Show HUD to restore the interface'
        : 'Hides minimap, panels, and status banners for a clear view';
    }
  }

  refreshTitleSaveButton() {
    const btn = this.root.querySelector('#btn-load-saves');
    if (!btn) return;
    const count = listBattleSaves().length;
    btn.textContent = count > 0 ? `Continue Saved Battle (${count})` : 'Continue Saved Battle';
    btn.title =
      count > 0
        ? `${count} saved battle${count === 1 ? '' : 's'} in this browser`
        : 'No saves yet — use Save in the HUD during a fight';
  }

  renderSaveList() {
    const list = this.root.querySelector('#save-list');
    const empty = this.root.querySelector('#save-list-empty');
    if (!list) return;
    const saves = listBattleSaves();
    this.refreshTitleSaveButton();
    if (empty) empty.classList.toggle('hidden', saves.length > 0);
    if (!saves.length) {
      list.innerHTML = '';
      return;
    }
    list.innerHTML = saves
      .map((save) => {
        const meta = formatSaveMeta(save);
        return `
          <div class="save-card" data-id="${save.id}">
            <div class="save-card-main">
              <span class="save-card-label">${save.label ?? `${meta.faction} — ${meta.map}`}</span>
              <span class="save-card-meta">${meta.mode} · ${meta.elapsed} elapsed · ${meta.when}</span>
            </div>
            <div class="save-card-actions">
              <button type="button" class="btn btn-primary interactive save-load-btn" data-id="${save.id}">Resume</button>
              <button type="button" class="btn btn-secondary interactive save-delete-btn" data-id="${save.id}">Delete</button>
            </div>
          </div>
        `;
      })
      .join('');

    list.querySelectorAll('.save-load-btn').forEach((btn) => {
      btn.onclick = () => {
        void this._runLoadingAction(
          () => this.callbacks.onLoadBattle?.(btn.dataset.id),
          {
            title: 'Resuming operation',
            detail: 'Restoring the battlefield, forces, and command state…',
          }
        );
      };
    });
    list.querySelectorAll('.save-delete-btn').forEach((btn) => {
      btn.onclick = () => {
        deleteBattleSave(btn.dataset.id);
        this.renderSaveList();
      };
    });
  }

  _waitForLoadingPaint() {
    if (typeof requestAnimationFrame !== 'function') {
      return new Promise((resolve) => setTimeout(resolve, 0));
    }
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  async _runLoadingAction(action, copy = {}) {
    if (typeof action !== 'function' || this._loadingActive) return;
    this.showLoadingScreen(copy);
    await this._waitForLoadingPaint();
    try {
      return await action();
    } catch (error) {
      console.error('Battle transition failed:', error);
      this.showSaveToast('Could not prepare the battle. Please try again.');
    } finally {
      this.hideLoadingScreen();
    }
  }

  showLoadingScreen({
    title = 'Preparing battlefield',
    detail = 'Loading terrain, forces, and combat systems…',
  } = {}) {
    const overlay = this.root.querySelector('#battle-loading-screen');
    if (!overlay) return;

    this._loadingActive = true;
    const titleEl = this.root.querySelector('#battle-loading-title');
    const detailEl = this.root.querySelector('#battle-loading-detail');
    if (titleEl) titleEl.textContent = title;
    if (detailEl) detailEl.textContent = detail;

    const layers = [...this.root.querySelectorAll('.battle-loading-art-layer')];
    if (layers.length >= 2 && LOADING_ART_PATHS.length > 0) {
      clearInterval(this._loadingArtTimer);
      this._loadingArtIndex = (this._loadingArtIndex + 1) % LOADING_ART_PATHS.length;
      this._loadingArtLayerIndex = 0;
      layers[0].style.backgroundImage = `url("${LOADING_ART_PATHS[this._loadingArtIndex]}")`;
      layers[1].style.backgroundImage = `url("${LOADING_ART_PATHS[(this._loadingArtIndex + 1) % LOADING_ART_PATHS.length]}")`;
      layers[0].classList.add('is-visible');
      layers[1].classList.remove('is-visible');

      this._loadingArtTimer = setInterval(() => {
        const currentLayer = layers[this._loadingArtLayerIndex];
        const nextLayerIndex = 1 - this._loadingArtLayerIndex;
        const nextLayer = layers[nextLayerIndex];
        this._loadingArtIndex = (this._loadingArtIndex + 1) % LOADING_ART_PATHS.length;
        nextLayer.style.backgroundImage = `url("${LOADING_ART_PATHS[this._loadingArtIndex]}")`;
        nextLayer.classList.add('is-visible');
        currentLayer.classList.remove('is-visible');
        this._loadingArtLayerIndex = nextLayerIndex;
      }, LOADING_ART_INTERVAL_MS);
    }

    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    overlay.setAttribute('aria-busy', 'true');
  }

  hideLoadingScreen() {
    this._loadingActive = false;
    clearInterval(this._loadingArtTimer);
    this._loadingArtTimer = null;
    const overlay = this.root.querySelector('#battle-loading-screen');
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('aria-busy', 'false');
  }

  showSaveToast(message) {
    const toast = this.root.querySelector('#save-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(this._saveToastTimer);
    this._saveToastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 3200);
    this.refreshTitleSaveButton();
  }

  showHUD(faction, mapDef, gameMode = 'campaign', options = {}) {
    this.closeGuide();
    if (this.callbacks.onMenuVisible) this.callbacks.onMenuVisible(false);
    this.root.querySelectorAll('.screen').forEach((el) => el.classList.add('hidden'));
    this.hudHidden = false;
    this.root.querySelector('#hud').classList.remove('hidden');
    this._syncHudVisibility();
    this.root.querySelector('#hud-faction').textContent = faction.name;
    const diffLabel = options.difficulty ? ` · ${options.difficulty.name}` : '';
    this.root.querySelector('#hud-map').textContent = `${formatMapHudLabel(mapDef)}${diffLabel}`;

    const tutorial = gameMode === 'tutorial';
    const assault = gameMode === 'assault';
    const clearance = gameMode === 'clearance' || gameMode === 'clearanceReinforced';
    const clearanceReinforced = clearance && options.clearanceReinforced;
    const clearanceTimeLimitEnabled = clearance && options.clearanceTimeLimitEnabled !== false;
    const towerDefense = gameMode === 'towerDefense' || options.towerDefense;
    const tdHqDefense = towerDefense && (options.tdHqDefense || options.tdStyle === 'hqDefense');
    const lastStand = gameMode === 'lastStand' || options.lastStand;
    const baseBuilding =
      gameMode === 'campaign' && (options.campaignStyle ?? 'classic') === 'baseBuilding';
    this._hudBaseBuilding = baseBuilding;
    this._hudStandardCampaign = gameMode === 'campaign';
    this._hudCampaignStyle = options.campaignStyle ?? 'classic';
    this._hudAutoBuildAvailable = gameMode === 'campaign';
    this._hudLastStand = lastStand;
    this._hudLastStandDeploy = lastStand;
    const banner = this.root.querySelector('#tutorial-banner');
    if (banner) banner.classList.toggle('hidden', !tutorial);

    const assaultBanner = this.root.querySelector('#assault-banner');
    if (assaultBanner) assaultBanner.classList.toggle('hidden', !assault);

    this._hudClearance = clearance;
    const clearanceBanner = this.root.querySelector('#clearance-banner');
    if (clearanceBanner) {
      clearanceBanner.classList.toggle('hidden', !clearance);
      const sizeLabel =
        options.clearanceReinforcementSize === 'large'
          ? 'Large'
          : options.clearanceReinforcementSize === 'medium'
            ? 'Medium'
            : 'Small';
      const roleLabel = options.clearanceRole === 'defend' ? 'Defend' : 'Attack';
      const deadlineLabel = clearanceTimeLimitEnabled ? '15-minute assault' : 'no assault deadline';
      clearanceBanner.textContent = clearanceReinforced
        ? `Fortified Line · ${roleLabel} · ${deadlineLabel} · ${sizeLabel} reinforcements every 3 minutes`
        : `Fortified Line · ${roleLabel} · ${deadlineLabel}`;
    }

    this.root.querySelector('#td-banner')?.classList.toggle('hidden', !towerDefense);
    this._hudTdEndless = !!(towerDefense && options.tdEndless);
    const tdCountdown = this.root.querySelector('#td-wave-countdown');
    tdCountdown?.classList.add('hidden');
    tdCountdown?.classList.toggle('td-wave-countdown-side', !!towerDefense);
    this.hideTdBreachAlert();
    this.root.querySelector('#laststand-banner')?.classList.toggle('hidden', !lastStand);
    this._hudTowerDefense = towerDefense;
    this._hudTdHqDefense = tdHqDefense;
    this._hudHasFrontline = assault || towerDefense;
    this.root.querySelector('#btn-toggle-frontline')?.classList.toggle('hidden', !this._hudHasFrontline);
    this._syncFrontlineToggle();
    const hasCapturePoints =
      !towerDefense &&
      !lastStand &&
      !clearance &&
      (mapDef.capturePoints?.length ?? 0) > 0;
    this.root
      .querySelector('#btn-toggle-capture-points')
      ?.classList.toggle('hidden', !hasCapturePoints);
    this._syncCapturePointToggle();
    const hideFireSupportPanel = lastStand;
    const hideGeneralOrdersPanel = (towerDefense && !tdHqDefense) || lastStand;
    this.root
      .querySelector('#firesupport-panel')
      ?.classList.toggle('hidden', hideFireSupportPanel);
    this.root
      .querySelector('#generalorders-panel')
      ?.classList.toggle('hidden', hideGeneralOrdersPanel);
    this.fireSupportExpanded = false;
    this.generalOrdersExpanded = false;
    this.defenseExpanded = false;
    this.baseBuildExpanded = false;
    this._syncFireSupportCollapse();
    this._syncGeneralOrdersCollapse();
    this._syncDefenseCollapse();
    this._syncBaseBuildCollapse();
    this.root.querySelector('#unit-roster')?.classList.toggle('hidden', towerDefense && !tdHqDefense);
    this.root.querySelector('#defense-panel')?.classList.toggle('hidden', !towerDefense || tdHqDefense);
    this._setProductionPanelVisible(tdHqDefense || (lastStand && !options.lastStandPreset));
    this.root.querySelector('#base-build-panel')?.classList.toggle('hidden', !baseBuilding);
    this.root.querySelector('#capture-bar')?.classList.toggle('hidden', towerDefense || lastStand || clearance);
    this.root.querySelector('.hud-resources')?.classList.toggle('hidden', clearance);
    const prodTitle = this.root.querySelector('#production-panel h3');
    if (prodTitle) prodTitle.textContent = lastStand ? 'Deployment' : 'Reinforcements';
    this.syncAutoBuildForCampaign(this._hudCampaignStyle);

    const surrenderBtn = this.root.querySelector('#btn-surrender');
    if (surrenderBtn) {
      surrenderBtn.textContent = tutorial ? 'Leave Training' : 'Surrender';
      surrenderBtn.title = tutorial
        ? 'Leave practice and return to the main menu'
        : 'Surrender and return to the main menu';
    }

    const tabletOn = this.tabletCamera?.shouldEnable() ?? isTabletLikeDevice();
    this.tabletCamera?.setVisible(tabletOn);
    this.setMinimapMap(mapDef);
    this.minimap?.setVisible(this.showMinimap);

    const hint = this.root.querySelector('#hud-hint');
    if (hint) {
      if (tutorial) {
        this._defaultHudHint =
          'Tutorial: practice vs static HQ — train all unit types, capture neutral points';
      } else if (clearance) {
        this._defaultHudHint =
          options.clearanceRole === 'defend'
            ? clearanceTimeLimitEnabled
              ? 'Fortified Line (Defend): hold for 15 minutes or destroy the assault force · attackers retreat when time expires'
              : 'Fortified Line (Defend): hold the line or destroy the assault force · no deadline'
            : clearanceReinforced
              ? clearanceTimeLimitEnabled
                ? 'Fortified Line (Attack): wipe all defenders within 15 minutes · both sides reinforce every 3 minutes'
                : 'Fortified Line (Attack): wipe all defenders · no deadline · both sides reinforce every 3 minutes'
              : clearanceTimeLimitEnabled
                ? 'Fortified Line (Attack): wipe all defenders within 15 minutes · no HQ or sector economy'
                : 'Fortified Line (Attack): wipe all defenders · no deadline · no HQ or sector economy';
      } else if (assault) {
        this._defaultHudHint =
          'Assault: capture & hold the frontline (45s) · Shift+RMB fire support · Flank points earn supplies';
      } else if (towerDefense && tdHqDefense) {
        this._defaultHudHint = options.tdEndless
          ? 'Tower Defence (HQ Defense · Endless): train any unit at HQ · hold your side of the frontline · lose if HQ falls'
          : 'Tower Defence (HQ Defense): spawn reinforcements from HQ · units cannot cross the frontline · line retreats if enemy stays past it for 10s · lose if HQ falls';
      } else if (towerDefense) {
        this._defaultHudHint = options.tdEndless
          ? 'Tower Defence (Endless): build behind the frontline · survive escalating waves · see how long you last'
          : 'Tower Defence: build behind the frontline · LMB place · Barrage needs an Artillery Pit · hold 12 waves';
      } else if (lastStand && options.lastStandPreset) {
        this._defaultHudHint =
          'Preset battle group: full combined-arms forces deployed · Begin Battle when ready · destroy every enemy unit';
      } else if (lastStand) {
        this._defaultHudHint =
          'Battle Simulation: pick a unit, LMB on the map to place · enemy matches your unit count · Begin Battle when ready';
      } else if (baseBuilding) {
        this._defaultHudHint =
          'Victory: destroy the enemy HQ · Base Construction unlocks armor & artillery · garrison trains infantry';
      } else if (tabletOn) {
        this._defaultHudHint =
          'Victory: destroy the enemy HQ · Tap select · Engage/Fire buttons · Tap map = move/attack';
      } else {
        this._defaultHudHint =
          'Victory: destroy the enemy HQ · WASD pan · wheel zoom · LMB/RMB orders · Shift+LMB fire';
      }
      hint.textContent = this._defaultHudHint;
      if (tabletOn && tutorial) {
        hint.textContent =
          'Tutorial: tap to select · Target/Fire buttons (camera pad) · tap map to move/attack';
      } else if (tabletOn && lastStand && options.lastStandPreset) {
        hint.textContent =
          'Preset battle group deployed · Begin Battle when ready · camera pad (right)';
      } else if (tabletOn && lastStand) {
        hint.textContent =
          'Battle Simulation: tap unit, tap map to place · camera pad (right) · Begin Battle when ready';
      } else if (tabletOn && !hint.textContent.includes('camera pad')) {
        hint.textContent += ' · Camera pad (right)';
      }
      hint.classList.remove('hud-hint-opening');
    }

    if (assault && options.assaultRole) {
      const roleLabel = this.root.querySelector('#assault-role-label');
      if (roleLabel) {
        roleLabel.textContent =
          options.assaultRole === 'attack' ? 'You are attacking' : 'You are defending';
      }
    }

    const btns = this.root.querySelector('#produce-btns');
    if (baseBuilding || clearance) {
      btns.innerHTML = '';
    } else {
      const types = getProducibleUnits(faction);
      btns.innerHTML = types
        .map((type) => {
          const def = faction.units[type];
          const short = PRODUCE_LABELS[type] ?? type;
          return `
        <button class="produce-btn interactive" data-type="${type}" title="${def.name} — ${def.designation}">
          <span class="produce-icon" aria-hidden="true">${getUnitIconMarkup(type)}</span>
          <span class="produce-name">${short}</span>
          <span class="produce-cost">${def.cost}</span>
        </button>
      `;
        })
        .join('');

    }

    this.renderFireSupportButtons();
    this.renderGeneralOrdersButtons();
    this.renderDefenseButtons();
    if (baseBuilding) this.renderBaseBuildButtons();
    this._bindUnitRoster();
    this._syncFieldIconToggle();
    this._syncUnitStatusToggle();
    this._syncSeekCoverToggle();
  }

  setUnitFieldIconsEnabled(on) {
    this.showUnitFieldIcons = !!on;
    writeBooleanSetting(UNIT_FIELD_ICONS_KEY, on);
    this._syncFieldIconToggle();
  }

  setArtilleryAutoFire(on) {
    this.artilleryAutoFire = !!on;
    writeBooleanSetting(ARTILLERY_AUTO_FIRE_KEY, this.artilleryAutoFire);
    this._syncSettingsControls();
  }

  setHoldGroundByDefault(on) {
    this.holdGroundByDefault = !!on;
    this.pursueTargetsByDefault = !this.holdGroundByDefault;
    writeBooleanSetting(HOLD_GROUND_KEY, this.pursueTargetsByDefault);
    this._syncSettingsControls();
  }

  setPursueTargetsByDefault(on) {
    this.setHoldGroundByDefault(!on);
  }

  resetAllSettings() {
    resetGameSettings();
    const defaultDebrisIndex = DEBRIS_RETENTION_OPTIONS.findIndex(
      (option) => option.seconds === 120
    );

    writeBooleanSetting(GAME_SETTING_KEYS.minimap, true);
    writeBooleanSetting(UNIT_FIELD_ICONS_KEY, true);
    writeBooleanSetting(UNIT_STATUS_VISIBLE_KEY, true);
    writeBooleanSetting(FRONTLINE_VISIBLE_KEY, true);
    writeBooleanSetting(CAPTURE_POINTS_VISIBLE_KEY, true);
    writeBooleanSetting(SEEK_COVER_MODE_KEY, true);
    // The legacy storage key stores pursuit, so false means Hold Ground.
    writeBooleanSetting(HOLD_GROUND_KEY, false);
    writeBooleanSetting(ARTILLERY_AUTO_FIRE_KEY, true);
    writeBooleanSetting(AUTO_BUILD_MODE_KEYS.classic, false);
    writeBooleanSetting(AUTO_BUILD_MODE_KEYS.baseBuilding, false);
    this.selectedDifficulty = writeDifficultySetting(DEFAULT_DIFFICULTY);
    writeDebrisRetentionIndex(defaultDebrisIndex);
    if (isTabletLikeDevice()) {
      writeBooleanSetting(GAME_SETTING_KEYS.tabletMode, true);
    }

    this.showMinimap = true;
    this.showUnitFieldIcons = true;
    this.showUnitStatus = true;
    this.showFrontline = true;
    this.showCapturePoints = true;
    this.seekCoverMode = true;
    this.holdGroundByDefault = true;
    this.pursueTargetsByDefault = false;
    this.artilleryAutoFire = true;
    this.autoBuildMode = false;
    this.minimap?.setVisible(true);
    this._syncFieldIconToggle();
    this._syncUnitStatusToggle();
    this._syncFrontlineToggle();
    this._syncCapturePointToggle();
    this._syncSeekCoverToggle();
    this._syncAutoBuildToggle();
    this._syncSettingsControls();

    if (this._settingsReturnTarget !== 'pause') return;
    this.callbacks.onToggleUnitFieldIcons?.(true);
    this.callbacks.onToggleUnitStatus?.(true);
    this.callbacks.onToggleFrontline?.(true);
    this.callbacks.onToggleCapturePoints?.(true);
    this.callbacks.onToggleSeekCover?.(true);
    this.callbacks.onChangePursueTargets?.(false);
    this.callbacks.onChangeArtilleryAutoFire?.(true);
    this.callbacks.onToggleAutoBuild?.(false);
    this.callbacks.onChangeDebrisRetention?.(DEBRIS_RETENTION_OPTIONS[defaultDebrisIndex].seconds);
    if (isTabletLikeDevice()) this.callbacks.onTabletModeChanged?.(true);
  }

  _bindSettingsInfo() {
    const panel = this.root.querySelector('#settings-info-panel');
    const title = this.root.querySelector('#settings-info-title');
    const text = this.root.querySelector('#settings-info-text');
    if (!panel || !title || !text) return;
    const settingsShell = panel.closest('.settings-panel-shell');
    const settingsScreen = this.root.querySelector('#screen-settings');

    const rows = [...this.root.querySelectorAll('#screen-settings .setting-row')]
      .filter((row) => row.querySelector('[data-setting]'));
    let hoveredRow = null;
    let focusedRow = null;
    const renderInfo = () => {
      const row = focusedRow ?? hoveredRow;
      const detail = row?.querySelector('.setting-detail')?.textContent?.trim();
      const heading = row?.querySelector('strong')?.textContent?.trim();
      title.textContent = heading || 'Highlight a setting';
      text.textContent = detail || 'Hover over or focus a setting to see how it changes the battlefield.';
      if (row && settingsShell) {
        const rowRect = row.getBoundingClientRect();
        const shellRect = settingsShell.getBoundingClientRect();
        panel.style.setProperty('--settings-info-top', `${Math.max(0, rowRect.top - shellRect.top)}px`);
      } else {
        panel.style.removeProperty('--settings-info-top');
      }
      panel.classList.toggle('is-active', !!row);
      settingsShell?.classList.toggle('has-info', !!row);
    };

    for (const row of rows) {
      row.addEventListener('mouseenter', () => {
        hoveredRow = row;
        renderInfo();
      });
      row.addEventListener('mouseleave', () => {
        if (hoveredRow === row) hoveredRow = null;
        renderInfo();
      });
      row.addEventListener('focusin', () => {
        focusedRow = row;
        renderInfo();
      });
      row.addEventListener('focusout', (event) => {
        if (!row.contains(event.relatedTarget)) {
          if (focusedRow === row) focusedRow = null;
          renderInfo();
        }
      });
    }
    settingsScreen?.addEventListener('scroll', renderInfo, { passive: true });
    window.addEventListener('resize', renderInfo);
    renderInfo();
  }

  openPausedSettings() {
    const hud = this.root.querySelector('#hud');
    const settings = this.root.querySelector('#screen-settings');
    if (!hud || !settings || hud.classList.contains('hidden')) return;
    this._settingsReturnTarget = 'pause';
    this._syncSettingsBackButton();
    this._syncSettingsControls();
    this.root.querySelectorAll('.screen').forEach((el) => el.classList.add('hidden'));
    hud.classList.add('hidden');
    settings.classList.remove('hidden');
    settings.scrollTop = 0;
  }

  closePausedSettings() {
    if (this._settingsReturnTarget !== 'pause') return false;
    this.root.querySelector('#screen-settings')?.classList.add('hidden');
    this.root.querySelector('#hud')?.classList.remove('hidden');
    this._settingsReturnTarget = 'title';
    this._syncSettingsBackButton();
    return true;
  }

  isPausedSettingsOpen() {
    return (
      this._settingsReturnTarget === 'pause' &&
      !this.root.querySelector('#screen-settings')?.classList.contains('hidden')
    );
  }

  _syncSettingsBackButton() {
    const btn = this.root.querySelector('#btn-back-settings');
    if (btn) {
      btn.textContent = this._settingsReturnTarget === 'pause'
        ? 'Return to Paused Battle'
        : 'Return to Headquarters';
    }
  }

  _setMenuSetting(setting, on) {
    const applyToBattle = this._settingsReturnTarget === 'pause';
    switch (setting) {
      case 'minimap':
        this.minimap?.setVisible(on);
        this.showMinimap = !!on;
        break;
      case 'unitFieldIcons':
        this.setUnitFieldIconsEnabled(on);
        if (applyToBattle) this.callbacks.onToggleUnitFieldIcons?.(this.showUnitFieldIcons);
        break;
      case 'unitStatus':
        this.setUnitStatusEnabled(on);
        if (applyToBattle) this.callbacks.onToggleUnitStatus?.(this.showUnitStatus);
        break;
      case 'frontline':
        this.setFrontlineVisible(on);
        if (applyToBattle) this.callbacks.onToggleFrontline?.(this.showFrontline);
        break;
      case 'capturePoints':
        this.setCapturePointsVisible(on);
        if (applyToBattle) this.callbacks.onToggleCapturePoints?.(this.showCapturePoints);
        break;
      case 'seekCover':
        this.setSeekCoverMode(on);
        if (applyToBattle) this.callbacks.onToggleSeekCover?.(this.seekCoverMode);
        break;
      case 'holdGround':
        this.setHoldGroundByDefault(on);
        if (applyToBattle) this.callbacks.onChangePursueTargets?.(this.pursueTargetsByDefault);
        break;
      case 'artilleryAutoFire':
        this.setArtilleryAutoFire(on);
        if (applyToBattle) this.callbacks.onChangeArtilleryAutoFire?.(this.artilleryAutoFire);
        break;
      case 'tabletMode':
        if (!isTabletLikeDevice()) return;
        writeBooleanSetting(GAME_SETTING_KEYS.tabletMode, on);
        this.tabletCamera?.setVisible(isTabletModeEnabled());
        if (!on) {
          this.setTabletTargetMode(false);
          this.setTabletFireMode(false);
        }
        this.callbacks.onTabletModeChanged?.(isTabletModeEnabled());
        break;
      case 'autoBuildClassic':
        writeBooleanSetting(AUTO_BUILD_MODE_KEYS.classic, on);
        if (this._hudCampaignStyle === 'classic') {
          this.autoBuildMode = !!on;
          this._syncAutoBuildToggle();
          if (applyToBattle && this._hudAutoBuildAvailable) {
            this.callbacks.onToggleAutoBuild?.(this.autoBuildMode);
          }
        }
        break;
      case 'autoBuildBaseBuilding':
        writeBooleanSetting(AUTO_BUILD_MODE_KEYS.baseBuilding, on);
        if (this._hudCampaignStyle === 'baseBuilding') {
          this.autoBuildMode = !!on;
          this._syncAutoBuildToggle();
          if (applyToBattle && this._hudAutoBuildAvailable) {
            this.callbacks.onToggleAutoBuild?.(this.autoBuildMode);
          }
        }
        break;
      default:
        return;
    }
    this._syncSettingsControls();
  }

  _syncSettingsControls() {
    const states = {
      minimap: this.minimap?.visible ?? readBooleanSetting(GAME_SETTING_KEYS.minimap, true),
      unitFieldIcons: this.showUnitFieldIcons,
      unitStatus: this.showUnitStatus,
      frontline: this.showFrontline,
      capturePoints: this.showCapturePoints,
      seekCover: this.seekCoverMode,
      holdGround: this.holdGroundByDefault ?? !readBooleanSetting(HOLD_GROUND_KEY, false),
      artilleryAutoFire: this.artilleryAutoFire ?? readBooleanSetting(ARTILLERY_AUTO_FIRE_KEY, true),
      tabletMode: isTabletModeEnabled(),
      autoBuildClassic: readBooleanSetting(AUTO_BUILD_MODE_KEYS.classic, false),
      autoBuildBaseBuilding: readBooleanSetting(AUTO_BUILD_MODE_KEYS.baseBuilding, false),
    };
    for (const [setting, enabled] of Object.entries(states)) {
      const input = this.root.querySelector(`[data-setting="${setting}"]`);
      if (input) input.checked = !!enabled;
    }
    this._syncDebrisRetentionControl(readDebrisRetentionIndex());
  }

  _syncDebrisRetentionControl(index) {
    const safeIndex = Math.max(
      0,
      Math.min(DEBRIS_RETENTION_OPTIONS.length - 1, Math.round(Number(index) || 0))
    );
    const slider = this.root.querySelector('#debris-retention-slider');
    const output = this.root.querySelector('#debris-retention-value');
    if (slider) slider.value = String(safeIndex);
    if (output) output.textContent = DEBRIS_RETENTION_OPTIONS[safeIndex].label;
  }

  _syncFieldIconToggle() {
    const btn = this.root.querySelector('#btn-toggle-field-icons');
    if (!btn) return;
    btn.classList.toggle('off', !this.showUnitFieldIcons);
    btn.setAttribute('aria-pressed', this.showUnitFieldIcons ? 'true' : 'false');
    btn.title = this.showUnitFieldIcons
      ? 'Hide unit type icons above your forces'
      : 'Show unit type icons above your forces';
  }

  setUnitStatusEnabled(on) {
    this.showUnitStatus = !!on;
    writeBooleanSetting(UNIT_STATUS_VISIBLE_KEY, on);
    this._syncUnitStatusToggle();
  }

  _syncUnitStatusToggle() {
    const btn = this.root.querySelector('#btn-toggle-unit-status');
    if (!btn) return;
    btn.classList.toggle('off', !this.showUnitStatus);
    btn.setAttribute('aria-pressed', this.showUnitStatus ? 'true' : 'false');
    btn.title = this.showUnitStatus
      ? 'Hide unit status markers above your forces'
      : 'Show unit status markers above your forces';
  }

  setSeekCoverMode(on) {
    this.seekCoverMode = !!on;
    writeBooleanSetting(SEEK_COVER_MODE_KEY, on);
    this._syncSeekCoverToggle();
  }

  syncAutoBuildForCampaign(campaignStyle = 'classic') {
    this._hudCampaignStyle = campaignStyle;
    this.autoBuildMode = loadAutoBuildPreference(campaignStyle);
    this._syncAutoBuildToggle();
    return this.autoBuildMode;
  }

  setAutoBuildMode(on, campaignStyle = this._hudCampaignStyle ?? 'classic', options = {}) {
    if (this._hudCheatMode && on) return;
    this.autoBuildMode = !!on;
    if (options.persist !== false) {
      writeBooleanSetting(getAutoBuildStorageKey(campaignStyle), on);
    }
    this._syncAutoBuildToggle();
  }

  _syncAutoBuildToggle() {
    const btn = this.root.querySelector('#btn-toggle-auto-build');
    if (!btn) return;
    const available = this._hudAutoBuildAvailable;
    btn.classList.toggle('hidden', !available);
    if (!available) return;
    const cheatBlocked = this._hudCheatMode;
    btn.disabled = cheatBlocked;
    btn.classList.toggle('auto-build-on', this.autoBuildMode && !cheatBlocked);
    btn.setAttribute('aria-pressed', this.autoBuildMode && !cheatBlocked ? 'true' : 'false');
    if (cheatBlocked) {
      btn.title = 'Auto build disabled while cheat mode is on';
    } else {
      btn.title = this.autoBuildMode
        ? 'Auto build on — queue fills with a balanced mix (click to disable)'
        : 'Auto build off — click to queue infantry, armor, and support automatically';
    }
    const stateEl = btn.querySelector('.auto-build-state');
    if (stateEl) stateEl.textContent = this.autoBuildMode && !cheatBlocked ? 'On' : 'Off';
  }

  _syncSeekCoverToggle() {
    const btn = this.root.querySelector('#btn-toggle-seek-cover');
    if (!btn) return;
    btn.classList.toggle('order-running', this.seekCoverMode);
    btn.setAttribute('aria-pressed', this.seekCoverMode ? 'true' : 'false');
    btn.title = this.seekCoverMode
      ? 'Foot troops and support crews seek nearest cover (click to disable)'
      : 'Move orders go to clicked ground — click to seek cover for foot troops and support crews';
    const stateEl = btn.querySelector('.seek-cover-state');
    if (stateEl) stateEl.textContent = this.seekCoverMode ? 'On' : 'Off';
    this._syncGeneralOrdersHint();
  }

  _syncGeneralOrdersHint() {
    const hint = this.root.querySelector('#generalorders-hint');
    if (!hint) return;
    const base = 'Command-wide orders — each lasts 30s, 3 min cooldown · Esc cancels active order';
    hint.textContent = this.seekCoverMode
      ? `${base} · Seek Cover routes foot troops and support crews to nearby cover`
      : base;
  }

  updateTankRiderActions(units) {
    const panel = this.root.querySelector('#tank-rider-actions');
    const hint = this.root.querySelector('#tank-rider-hint');
    if (!panel) return;

    const tanks = (units ?? []).filter(
      (u) => canHostRiders(u.def?.type) && canDismountRiders(u)
    );
    const riderCount = tanks.reduce((n, t) => n + getTankRiderIds(t).length, 0);
    const show = tanks.length > 0 && riderCount > 0;
    panel.classList.toggle('hidden', !show);
    if (hint && show) {
      hint.textContent =
        riderCount === 1
          ? '1 rider aboard — they will bail out if the tank is hit.'
          : `${riderCount} riders aboard — they bail out automatically if the tank is hit.`;
    }
  }

  setFrontlineVisible(on) {
    this.showFrontline = !!on;
    writeBooleanSetting(FRONTLINE_VISIBLE_KEY, on);
    this._syncFrontlineToggle();
  }

  _syncFrontlineToggle() {
    const btn = this.root.querySelector('#btn-toggle-frontline');
    if (!btn) return;
    btn.classList.toggle('off', !this.showFrontline);
    btn.setAttribute('aria-pressed', this.showFrontline ? 'true' : 'false');
    btn.title = this.showFrontline
      ? 'Hide red frontline on the map'
      : 'Show red frontline on the map';
  }

  setCapturePointsVisible(on) {
    this.showCapturePoints = !!on;
    writeBooleanSetting(CAPTURE_POINTS_VISIBLE_KEY, on);
    this._syncCapturePointToggle();
  }

  _syncCapturePointToggle() {
    const btn = this.root.querySelector('#btn-toggle-capture-points');
    if (!btn) return;
    btn.classList.toggle('off', !this.showCapturePoints);
    btn.setAttribute('aria-pressed', this.showCapturePoints ? 'true' : 'false');
    btn.setAttribute(
      'aria-label',
      this.showCapturePoints ? 'Hide capture point circles' : 'Show capture point circles'
    );
    btn.title = this.showCapturePoints
      ? 'Hide capture point circles'
      : 'Show capture point circles';
  }

  setDefenseExpanded(on) {
    this.defenseExpanded = !!on;
    this._syncDefenseCollapse();
  }

  _syncDefenseCollapse() {
    const panel = this.root.querySelector('#defense-panel');
    const toggle = this.root.querySelector('#btn-toggle-defense');
    if (!panel) return;

    panel.classList.toggle('collapsed', !this.defenseExpanded);
    if (toggle) {
      toggle.setAttribute('aria-expanded', this.defenseExpanded ? 'true' : 'false');
      toggle.title = this.defenseExpanded
        ? 'Collapse defenses panel'
        : 'Expand defenses panel';
    }
  }

  _setProductionPanelVisible(visible) {
    const panel = this.root.querySelector('#production-panel');
    if (!panel) return;
    const tdBlocksProduction = this._hudTowerDefense && !this._hudTdHqDefense;
    const show = this._hudLastStand ? this._hudLastStandDeploy : !tdBlocksProduction && visible;
    panel.classList.toggle('hidden', !show);
  }

  renderDefenseButtons() {
    const wrap = this.root.querySelector('#defense-btns');
    if (!wrap) return;
    wrap.innerHTML = DEFENSE_TYPE_LIST.map(
      (d) => `
      <button type="button" class="defense-btn interactive" data-id="${d.id}" title="${d.subtitle}">
        <span class="defense-name">${d.name}</span>
        <span class="defense-cost">${d.cost}</span>
      </button>
    `
    ).join('');
    wrap.innerHTML += `
      <button type="button" class="defense-btn interactive defense-btn-barrage" data-id="barrage" title="Requires Artillery Pit — click map to strike">
        <span class="defense-name">Barrage</span>
        <span class="defense-cost">CD</span>
      </button>`;
    wrap.querySelectorAll('.defense-btn').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.id;
        if (id === 'barrage') this.callbacks.onTowerDefenseBarrage?.();
        else this.callbacks.onPlaceDefense?.(id);
      };
    });

    const upgradeBtn = this.root.querySelector('#btn-defense-upgrade');
    upgradeBtn?.addEventListener('click', () => this.callbacks.onUpgradeDefense?.());
    const resupplyBtn = this.root.querySelector('#btn-defense-resupply');
    resupplyBtn?.addEventListener('click', () => this.callbacks.onResupplyDefense?.());
  }

  renderBaseBuildButtons() {
    const wrap = this.root.querySelector('#base-build-btns');
    if (!wrap) return;
    wrap.innerHTML = BASE_BUILDING_TYPE_LIST.map(
      (d) => `
      <button type="button" class="base-build-btn interactive" data-id="${d.id}" title="${d.subtitle}">
        <span class="base-build-name">${d.name}</span>
        <span class="base-build-cost">${d.cost}</span>
      </button>
    `
    ).join('');
    wrap.querySelectorAll('.base-build-btn').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.callbacks.onArmBaseBuilding?.(btn.dataset.id);
      };
    });
  }

  showBaseBuildHint(message) {
    const hint = this.root.querySelector('#base-build-hint');
    if (!hint || !message) return;
    hint.textContent = message;
    hint.classList.add('base-build-hint-error');
    clearTimeout(this._baseBuildHintTimer);
    this._baseBuildHintTimer = setTimeout(() => {
      hint.classList.remove('base-build-hint-error');
      if (this._hudBaseBuilding) {
        hint.textContent =
          'Build near HQ or a sector you control. LMB place · Esc cancel.';
      }
    }, 2800);
  }

  _baseBuildUiKeyFor(game) {
    const supplies = Math.floor(game.resources.player);
    const pending = game.baseBuildings.getPending() ?? '';
    const deployActive = game._isPlayerDeployZoneActive?.() ?? false;
    const counts = BASE_BUILDING_TYPE_LIST.map((t) =>
      game.baseBuildings.countType('player', t.id)
    ).join(',');
    const facing = game._directionalPlacement?.kind === 'base' ? 1 : 0;
    return `${supplies}|${pending}|${facing}|${deployActive}|${game.cheatMode}|${counts}`;
  }

  setBaseBuildExpanded(on) {
    this.baseBuildExpanded = !!on;
    this._syncBaseBuildCollapse();
  }

  _syncBaseBuildCollapse() {
    const panel = this.root.querySelector('#base-build-panel');
    const toggle = this.root.querySelector('#btn-toggle-base-build');
    if (!panel) return;

    panel.classList.toggle('collapsed', !this.baseBuildExpanded);
    if (toggle) {
      toggle.setAttribute('aria-expanded', this.baseBuildExpanded ? 'true' : 'false');
      toggle.title = this.baseBuildExpanded
        ? 'Collapse base construction panel'
        : 'Expand base construction panel';
    }
  }

  updateBaseBuild(game) {
    if (!this._hudBaseBuilding || !game?.baseBuildings?.active) return;

    const panel = this.root.querySelector('#base-build-panel');
    const pending = game.baseBuildings.getPending();
    panel?.classList.toggle('placing', !!pending);
    if (pending && !this.baseBuildExpanded) {
      this.setBaseBuildExpanded(true);
    }

    const uiKey = this._baseBuildUiKeyFor(game);
    if (uiKey === this._baseBuildUiKey) return;
    this._baseBuildUiKey = uiKey;

    const supplies = Math.floor(game.resources.player);
    const hint = this.root.querySelector('#base-build-hint');
    const deployActive = game._isPlayerDeployZoneActive?.() ?? false;
    const typeCounts = new Map(
      BASE_BUILDING_TYPE_LIST.map((t) => [t.id, game.baseBuildings.countType('player', t.id)])
    );

    if (hint && !hint.classList.contains('base-build-hint-error')) {
      if (deployActive) {
        hint.textContent =
          'Quiet sector — destroy enemy HQ to win · launch battle before expanding the base';
      } else if (pending) {
        const def = BASE_BUILDING_TYPES[pending];
        hint.textContent = game._directionalPlacement?.kind === 'base'
          ? `Facing ${def?.name ?? pending} — move the arrow toward the threat, then click to confirm. Esc to cancel.`
          : `Placing ${def?.name ?? pending} — click within build range of HQ or a sector you hold. Esc to cancel.`;
      } else {
        hint.textContent =
          'Build near HQ or a sector you control. LMB place · Esc cancel.';
      }
    }

    this.root.querySelectorAll('.base-build-btn').forEach((btn) => {
      const id = btn.dataset.id;
      const def = BASE_BUILDING_TYPES[id];
      if (!def) return;
      const count = typeCounts.get(id) ?? 0;
      const atMax = count >= (def.maxPerTeam ?? 99);
      const canAfford = game.cheatMode || supplies >= def.cost;
      btn.disabled = deployActive || atMax || (!canAfford && pending !== id);
      btn.classList.toggle('selected', pending === id);
      btn.title = atMax
        ? `Maximum ${def.maxPerTeam} per base`
        : `${def.subtitle} — ${def.cost} supplies`;
    });
  }

  setPlacementCapture(active) {
    const layer = document.getElementById('placement-layer');
    if (!layer) return;
    layer.classList.toggle('hidden', !active);
    layer.classList.toggle('active', !!active);
    layer.setAttribute('aria-hidden', active ? 'false' : 'true');
  }

  updateDefenses(game) {
    const isTd = game?.gameMode === 'towerDefense' || !!game?.towerDefense;
    if (!isTd || !game.defenses) return;

    const panel = this.root.querySelector('#defense-panel');
    const pending = game.defenses.getPending();
    if (pending && !this.defenseExpanded) {
      this.setDefenseExpanded(true);
    }
    panel?.classList.toggle('placing', !!pending);

    const pts = Math.floor(game.resources.player);
    const label = this.root.querySelector('.resource-label');
    if (label) label.textContent = 'Defense pts';
    const resEl = this.root.querySelector('#hud-resources');
    if (resEl) resEl.textContent = String(pts);

    const selected = game.defenses.getSelected();
    const selEl = this.root.querySelector('#defense-selected');
    const upgradeBtn = this.root.querySelector('#btn-defense-upgrade');
    const resupplyBtn = this.root.querySelector('#btn-defense-resupply');
    const path = selected ? DEFENSE_UPGRADES[selected.typeId] : null;
    const nextDef = path ? DEFENSE_TYPES[path.next] : null;
    const outOfAmmo = game.defenses.countOutOfAmmo();

    if (selEl) {
      if (selected) {
        const cal = selected.def.caliber ? ` · ${selected.def.caliber} mm` : '';
        const hpPct = Math.round((selected.hp / selected.maxHp) * 100);
        let ammoLine = '';
        if (selected.maxAmmo) {
          const ammoPct = Math.round(getAmmoRatio(selected) * 100);
          ammoLine = ` · Ammo ${selected.ammo ?? 0}/${selected.maxAmmo} (${ammoPct}%)`;
        }
        selEl.textContent = `${selected.def.name}${cal} — ${hpPct}% HP (${selected.hp}/${selected.maxHp})${ammoLine}`;
      } else {
        selEl.textContent = outOfAmmo > 0 ? `${outOfAmmo} emplacement${outOfAmmo === 1 ? '' : 's'} out of ammo` : '';
      }
    }

    if (upgradeBtn) {
      const show = selected && path && nextDef;
      upgradeBtn.classList.toggle('hidden', !show);
      if (show) {
        upgradeBtn.textContent = `Upgrade → ${nextDef.name} (${path.cost} pts)`;
        upgradeBtn.disabled = pts < path.cost;
      }
    }

    if (resupplyBtn) {
      const canResupply = selected && game.defenses.canResupply(selected);
      const show = selected && defenseNeedsAmmo(selected.def);
      resupplyBtn.classList.toggle('hidden', !show);
      if (show) {
        const cost = getResupplyCost(selected);
        resupplyBtn.textContent = canResupply ? `Resupply ammo (${cost} pts)` : 'Ammo full';
        resupplyBtn.disabled = !canResupply || pts < cost;
      }
    }

    const hint = this.root.querySelector('#defense-hint');
    if (hint) {
      if (pending === 'barrage') {
        hint.textContent = 'Barrage armed — click the assault side of the map to strike.';
      } else if (pending) {
        const def = DEFENSE_TYPE_LIST.find((d) => d.id === pending);
        hint.textContent = `Placing ${def?.name ?? pending} — click your side of the frontline. Esc to cancel.`;
      } else if (selected && path) {
        hint.textContent =
          'Selected emplacement — Upgrade or Resupply ammo (costs defense pts). Click elsewhere to deselect.';
      } else if (selected && defenseNeedsAmmo(selected.def)) {
        hint.textContent =
          'Selected gun — Resupply ammo with defense points when magazines run low. Guns stop firing when empty.';
      } else {
        hint.textContent =
          'LMB place on your side of the frontline · LMB emplacement to select · Guns auto-fire but need ammo resupply.';
      }
    }

    this.root.querySelectorAll('.defense-btn').forEach((btn) => {
      const id = btn.dataset.id;
      if (id === 'barrage') {
        const hasPits = game.defenses.hasArtillery();
        const hasAmmo = game.defenses.hasBarrageAmmo();
        const ready = hasPits && hasAmmo && game.defenses.barrageCooldown <= 0;
        const cdMax = game.defenses.getEffectiveBarrageCooldown();
        btn.disabled = !ready && pending !== 'barrage';
        btn.classList.toggle('selected', pending === 'barrage');
        const pitCount = getArtilleryPitCount(game.defenses.entries);
        btn.title = !hasPits
          ? 'Requires Artillery Pit — click map to strike'
          : !hasAmmo
            ? 'Artillery pits need shell resupply — select a pit and Resupply ammo'
            : `Artillery barrage — ${cdMax}s cooldown (${pitCount} pit${pitCount === 1 ? '' : 's'}, uses pit ammo)`;
        const costEl = btn.querySelector('.defense-cost');
        if (costEl) {
          costEl.textContent =
            game.defenses.barrageCooldown > 0
              ? `${Math.ceil(game.defenses.barrageCooldown)}s`
              : `${cdMax}s`;
        }
        return;
      }
      const def = DEFENSE_TYPE_LIST.find((d) => d.id === id);
      const atCap = id === 'artillery' && game.defenses.isArtilleryPitCapReached();
      btn.disabled = !def || pts < def.cost || atCap;
      if (id === 'artillery') {
        const pitCount = getArtilleryPitCount(game.defenses.entries);
        btn.title = atCap
          ? `Maximum ${TD_MAX_ARTILLERY_PITS} artillery pits`
          : `${def.subtitle} (${pitCount}/${TD_MAX_ARTILLERY_PITS})`;
      }
      btn.classList.toggle('selected', pending === id);
    });
  }

  updateTowerDefense(game) {
    const hud = formatTowerDefenseHud(game?.towerDefense);
    if (!hud) return;
    const waveEl = this.root.querySelector('#td-wave-label');
    const phaseEl = this.root.querySelector('#td-phase-label');
    if (waveEl) {
      waveEl.textContent = hud.endless
        ? `Wave ${hud.wave} · Endless`
        : `Wave ${hud.wave} / ${hud.maxWaves}`;
    }
    if (phaseEl) phaseEl.textContent = hud.phaseLabel;

    const countdown = this.root.querySelector('#td-wave-countdown');
    const card = this.root.querySelector('#td-wave-countdown-card');
    const title = this.root.querySelector('#td-wave-countdown-title');
    const value = this.root.querySelector('#td-wave-countdown-value');
    const sub = this.root.querySelector('#td-wave-countdown-sub');
    const fill = this.root.querySelector('#td-wave-countdown-fill');
    const skipBtn = this.root.querySelector('#btn-td-skip-wave-countdown');

    const showCountdown =
      this._hudTowerDefense && hud.phase === 'prepare' && hud.secondsLeft > 0.05;
    countdown?.classList.toggle('hidden', !showCountdown);
    countdown?.classList.toggle('td-wave-countdown-side', !!this._hudTowerDefense);

    if (showCountdown && countdown) {
      const s = Math.max(1, Math.ceil(hud.secondsLeft));
      const pct = Math.min(100, Math.max(0, hud.prepareProgress * 100));
      if (title) title.textContent = hud.countdownTitle;
      if (value) value.textContent = String(s);
      if (sub) sub.textContent = hud.countdownSubtitle;
      if (fill) fill.style.width = `${pct}%`;
      card?.classList.toggle('td-wave-countdown-urgent', s <= 5);
      if (skipBtn) {
        skipBtn.disabled = !this.callbacks.onSkipTowerDefenseWave;
      }
    } else {
      card?.classList.remove('td-wave-countdown-urgent');
    }

    const breachAlert = this.root.querySelector('#td-breach-alert');
    const breachCard = this.root.querySelector('#td-breach-alert-card');
    const breachValue = this.root.querySelector('#td-breach-alert-value');
    const breachFill = this.root.querySelector('#td-breach-alert-fill');
    // Emplacements: sector-lost countdown. HQ Defense: frontline will retreat if breach holds.
    const showBreach =
      !game?.gameOver &&
      this._hudTowerDefense &&
      (hud.breachGraceLeft ?? 0) > 0;
    breachAlert?.classList.toggle('hidden', !showBreach);
    if (showBreach) {
      const left = hud.breachGraceLeft ?? 0;
      const pctLeft = Math.min(100, Math.max(0, (hud.breachGraceProgress ?? 0) * 100));
      if (breachValue) breachValue.textContent = String(left);
      if (breachFill) breachFill.style.width = `${pctLeft}%`;
      breachCard?.classList.toggle('td-breach-alert-critical', left <= 3);
      const eyebrow = breachCard?.querySelector('.td-breach-alert-eyebrow');
      const title = breachCard?.querySelector('.td-breach-alert-title');
      const sub = this.root.querySelector('#td-breach-alert-sub');
      if (hud.hqDefense) {
        if (eyebrow) eyebrow.textContent = 'Frontline under pressure';
        if (title) title.textContent = 'Push them back';
        if (sub) {
          sub.textContent =
            'Enemy past the line — hold them off or the frontline retreats toward HQ';
        }
      } else {
        if (eyebrow) eyebrow.textContent = 'Sector overrun imminent';
        if (title) title.textContent = 'Clear the frontline';
        if (sub) {
          sub.textContent = 'Enemy past the line — destroy them before time runs out';
        }
      }
    } else {
      breachCard?.classList.remove('td-breach-alert-critical');
    }
  }

  _defaultEngineerBuildHint(game) {
    const baseBuilding = game?.baseBuildings?.active ?? false;
    if (baseBuilding) {
      return 'Garrison bunker (~28 s) or AT mine (~8 s) — engineers move to the site before building. Esc to cancel.';
    }
    return 'Sandbags (~11 s), bunkers (~28 s), or AT mines (~8 s) — click a site and the engineer will move there. Esc to cancel.';
  }

  showEngineerBuildHint(message) {
    const hint = this.root.querySelector('#engineer-build-hint');
    if (!hint || !message) return;
    hint.textContent = message;
    hint.classList.add('engineer-build-hint-error');
    clearTimeout(this._engineerBuildHintTimer);
    this._engineerBuildHintTimer = setTimeout(() => {
      hint.classList.remove('engineer-build-hint-error');
      const actions = this.root.querySelector('#engineer-build-actions');
      if (actions && !actions.classList.contains('hidden')) {
        hint.textContent = this._defaultEngineerBuildHint(this._lastEngineerBuildGame);
      }
    }, 3200);
  }

  updateEngineerBuild(game) {
    const panel = this.root.querySelector('#engineer-build-actions');
    const sandbagBtn = this.root.querySelector('#btn-build-sandbags');
    const bunkerBtn = this.root.querySelector('#btn-build-bunker');
    const mineBtn = this.root.querySelector('#btn-lay-mine');
    const hint = this.root.querySelector('#engineer-build-hint');
    if (!panel || !sandbagBtn || !bunkerBtn || !mineBtn) return;

    this._lastEngineerBuildGame = game;
    const mgr = game?.engineerSandbags;
    const canSandbags = mgr?.canBuildSandbags?.() ?? false;
    const canBunker = mgr?.canBuildBunker?.() ?? false;
    const canMine = mgr?.canBuildMine?.() ?? false;
    const selectedEngineers =
      game?.units?.filter(
        (u) =>
          u.selected &&
          u.team === 'player' &&
          !u.dead &&
          !u.surrendered &&
          u.def?.type === 'engineer'
      ) ?? [];
    const freeEngineers = selectedEngineers.filter((u) => !u._sandbagSite);
    const show = (canSandbags || canBunker || canMine) && selectedEngineers.length > 0;

    panel.classList.toggle('hidden', !show);
    sandbagBtn.classList.toggle('hidden', !canSandbags);
    bunkerBtn.classList.toggle('hidden', !canBunker);
    mineBtn.classList.toggle('hidden', !canMine);
    if (!show) {
      this.updateInfantryTrench(game);
      return;
    }

    const pending = mgr?.getPending?.() ?? null;
    sandbagBtn.classList.toggle('btn-armed', pending === 'sandbags');
    bunkerBtn.classList.toggle('btn-armed', pending === 'bunker');
    mineBtn.classList.toggle('btn-armed', pending === 'mine');
    sandbagBtn.textContent = pending === 'sandbags' ? 'Placing sandbags…' : 'Build sandbags';
    bunkerBtn.textContent = pending === 'bunker' ? 'Placing bunker…' : 'Build bunker';
    mineBtn.textContent = pending === 'mine' ? 'Placing mine…' : 'Lay AT mine';

    if (hint && !hint.classList.contains('engineer-build-hint-error')) {
      if (pending) {
        const label =
          pending === 'bunker' ? 'bunker' : pending === 'mine' ? 'AT mine' : 'sandbag position';
        hint.textContent =
          pending === 'mine'
            ? 'Click a valid location — the engineer will move there and lay the AT mine. Esc to cancel.'
            : game._directionalPlacement?.kind === 'engineer'
              ? `Move the facing arrow toward the threat, then click to confirm the ${label}. Esc to cancel.`
              : `Click a valid map location for the ${label}; then choose which direction it faces. Esc to cancel.`;
      } else if (freeEngineers.length === 0) {
        hint.textContent = 'Selected engineer is already building field works.';
      } else {
        hint.textContent = this._defaultEngineerBuildHint(game);
      }
    }
    this.updateInfantryTrench(game);
  }

  showInfantryTrenchHint(message) {
    const hint = this.root.querySelector('#infantry-trench-hint');
    if (!hint || !message) return;
    hint.textContent = message;
    hint.classList.add('engineer-build-hint-error');
    clearTimeout(this._trenchHintTimer);
    this._trenchHintTimer = setTimeout(() => {
      hint.classList.remove('engineer-build-hint-error');
      const game = this._lastEngineerBuildGame;
      if (game) this.updateInfantryTrench(game);
    }, 3200);
  }

  updateInfantryTrench(game) {
    const panel = this.root.querySelector('#infantry-trench-actions');
    const digBtn = this.root.querySelector('#btn-dig-trench');
    const hint = this.root.querySelector('#infantry-trench-hint');
    if (!panel || !digBtn) return;

    this._lastEngineerBuildGame = game;
    const mgr = game?.infantryTrenches;
    const canDig = mgr?.canUse?.() ?? false;
    const diggers =
      game?.units?.filter(
        (u) =>
          u.selected &&
          u.team === 'player' &&
          !u.dead &&
          !u.surrendered &&
          canDigTrenchType(u.def?.type)
      ) ?? [];
    const free = diggers.filter((u) => !u._trenchDigSite && !u._trenchId);
    const show = canDig && diggers.length > 0;

    panel.classList.toggle('hidden', !show);
    if (!show) {
      this.updateRadioBinoculars(game);
      return;
    }

    const pending = !!mgr?.getPending?.();
    digBtn.classList.toggle('btn-armed', pending);
    digBtn.disabled = free.length === 0 && !pending;
    digBtn.textContent = pending ? 'Placing trench…' : 'Dig trench';

    if (hint && !hint.classList.contains('engineer-build-hint-error')) {
      if (pending) {
        hint.textContent = game._directionalPlacement?.kind === 'trench'
          ? 'Move the facing arrow toward the threat, then click to confirm the trench. Esc to cancel.'
          : 'Click a valid map location, then choose which direction the trench faces. Esc to cancel.';
      } else if (free.length === 0) {
        hint.textContent = 'Selected troops are already digging or dug in.';
      } else {
        hint.textContent =
          'Commanders, radio operators, infantry, airborne, MGs, and snipers dig a fighting trench (~14 s). Move onto a trench to dig in for cover.';
      }
    }
    this.updateRadioBinoculars(game);
  }

  updateRadioBinoculars(game) {
    const panel = this.root.querySelector('#radio-binocular-actions');
    const btn = this.root.querySelector('#btn-radio-binoculars');
    const hint = this.root.querySelector('#radio-binocular-hint');
    if (!panel || !btn) return;

    const operators =
      game?.units?.filter(
        (u) =>
          u.selected &&
          u.team === 'player' &&
          !u.dead &&
          !u.surrendered &&
          u.def?.type === 'radioOperator'
      ) ?? [];
    const show = operators.length > 0 && game?.running && !game?.gameOver;
    panel.classList.toggle('hidden', !show);
    if (!show) {
      this.updateMedicTent(game);
      return;
    }

    const ready = operators.filter(
      (u) => (u._binocularActive ?? 0) <= 0 && (u._binocularCooldown ?? 0) <= 0
    );
    const scanning = operators.filter((u) => (u._binocularActive ?? 0) > 0);
    const onCd = operators.filter(
      (u) => (u._binocularActive ?? 0) <= 0 && (u._binocularCooldown ?? 0) > 0
    );

    btn.disabled = ready.length === 0;
    if (scanning.length > 0) {
      const rem = Math.ceil(Math.max(...scanning.map((u) => u._binocularActive ?? 0)));
      btn.textContent = `Scanning… ${rem}s`;
      btn.classList.add('btn-armed');
    } else if (ready.length > 0) {
      btn.textContent = 'Binoculars';
      btn.classList.remove('btn-armed');
    } else {
      const cd = Math.ceil(Math.min(...onCd.map((u) => u._binocularCooldown ?? 0)));
      const m = Math.floor(cd / 60);
      const s = String(cd % 60).padStart(2, '0');
      btn.textContent = `Binoculars ${m}:${s}`;
      btn.classList.remove('btn-armed');
    }

    if (hint) {
      if (scanning.length > 0) {
        hint.textContent =
          'Binoculars raised — observation to ~1120 m. Call fire support now; the scan ends and a 3 min cooldown starts when you do.';
      } else if (ready.length > 0) {
        hint.textContent =
          'Glass the front for up to 45 s of extended fire-support range (~1120 m). Calling support while scanning starts a 3 min cooldown.';
      } else {
        hint.textContent =
          'Binoculars on cooldown — 3 minutes after calling fire support while scanning.';
      }
    }
    this.updateMedicTent(game);
  }

  showMedicTentHint(message) {
    const hint = this.root.querySelector('#medic-tent-hint');
    if (!hint || !message) return;
    hint.textContent = message;
    hint.classList.add('engineer-build-hint-error');
    clearTimeout(this._medicTentHintTimer);
    this._medicTentHintTimer = setTimeout(() => {
      hint.classList.remove('engineer-build-hint-error');
      const game = this._lastEngineerBuildGame;
      if (game) this.updateMedicTent(game);
    }, 3200);
  }

  updateMedicTent(game) {
    const panel = this.root.querySelector('#medic-tent-actions');
    const btn = this.root.querySelector('#btn-deploy-field-tent');
    const hint = this.root.querySelector('#medic-tent-hint');
    if (!panel || !btn) return;

    this._lastEngineerBuildGame = game;
    const mgr = game?.medicFieldHospitals;
    const can = mgr?.canUse?.() ?? false;
    const medics =
      game?.units?.filter(
        (u) =>
          u.selected &&
          u.team === 'player' &&
          !u.dead &&
          !u.surrendered &&
          u.def?.type === 'medic'
      ) ?? [];
    const free = medics.filter((u) => !u._medicTentSite);
    const show = can && medics.length > 0;

    panel.classList.toggle('hidden', !show);
    if (!show) return;

    const pending = !!mgr?.getPending?.();
    btn.classList.toggle('btn-armed', pending);
    btn.disabled = free.length === 0 && !pending;
    btn.textContent = pending ? 'Placing tent…' : 'Field hospital tent';

    if (hint && !hint.classList.contains('engineer-build-hint-error')) {
      if (pending) {
        hint.textContent =
          'Click a valid map location; the medic will move there and pitch the tent. Esc to cancel.';
      } else if (free.length === 0) {
        hint.textContent = 'Selected medic is already setting up a tent.';
      } else {
        hint.textContent =
          'Medic pitches a field hospital tent (~16 s). Infantry and other non-vehicle units heal within ~12 m.';
      }
    }
  }

  showDefensePlacementHint(message, game = null) {
    const hint = this.root.querySelector('#defense-hint');
    if (!hint || !message) return;
    hint.textContent = message;
    hint.classList.add('defense-hint-error');
    clearTimeout(this._defenseHintTimer);
    this._defenseHintTimer = setTimeout(() => {
      hint.classList.remove('defense-hint-error');
      if (game?.towerDefense) this.updateDefenses(game);
    }, 2200);
  }

  _bindUnitRoster() {
    if (this._unitRosterBound) return;
    const roster = this.root.querySelector('#unit-roster');
    const list = this.root.querySelector('#unit-roster-list');
    if (!roster || !list) return;
    this._unitRosterBound = true;

    const handlePick = (e) => {
      const btn = e.target.closest('.unit-roster-item');
      if (!btn || btn.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      const id = Number(btn.dataset.unitId);
      if (!Number.isFinite(id)) return;
      this.callbacks.onSelectUnit?.(id, e.shiftKey);
    };

    const readUnitId = (btn) => {
      const id = Number(btn?.dataset.unitId);
      return Number.isFinite(id) ? id : null;
    };
    const emitRosterHighlight = () => {
      this.callbacks.onHighlightUnit?.(
        this._unitRosterFocusedUnitId ?? this._unitRosterHoveredUnitId
      );
    };

    list.addEventListener('pointerdown', handlePick);
    roster.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.unit-roster-item')) handlePick(e);
    });
    list.addEventListener('pointerover', (e) => {
      const btn = e.target.closest?.('.unit-roster-item');
      if (!btn || !list.contains(btn) || (e.relatedTarget && btn.contains(e.relatedTarget))) return;
      this._unitRosterHoveredUnitId = readUnitId(btn);
      emitRosterHighlight();
    });
    list.addEventListener('pointerout', (e) => {
      const btn = e.target.closest?.('.unit-roster-item');
      if (!btn || !list.contains(btn) || (e.relatedTarget && btn.contains(e.relatedTarget))) return;
      if (this._unitRosterHoveredUnitId === readUnitId(btn)) {
        this._unitRosterHoveredUnitId = null;
        emitRosterHighlight();
      }
    });
    list.addEventListener('focusin', (e) => {
      const btn = e.target.closest?.('.unit-roster-item');
      if (!btn || !list.contains(btn)) return;
      this._unitRosterFocusedUnitId = readUnitId(btn);
      emitRosterHighlight();
    });
    list.addEventListener('focusout', (e) => {
      const btn = e.target.closest?.('.unit-roster-item');
      if (!btn || !list.contains(btn) || (e.relatedTarget && btn.contains(e.relatedTarget))) return;
      if (this._unitRosterFocusedUnitId === readUnitId(btn)) {
        this._unitRosterFocusedUnitId = null;
        emitRosterHighlight();
      }
    });
  }

  updateUnitRoster(units, selectedUnits = []) {
    const list = this.root.querySelector('#unit-roster-list');
    const panel = this.root.querySelector('#unit-roster');
    if (!list || !panel) return;

    const alive = (units ?? []).filter((u) => !u.dead);
    const selectedIds = new Set((selectedUnits ?? []).map((u) => u.id));

    if (alive.length === 0) {
      list.innerHTML = '<p class="unit-roster-empty">No units in the field</p>';
      this._unitRosterHoveredUnitId = null;
      this._unitRosterFocusedUnitId = null;
      this.callbacks.onHighlightUnit?.(null);
      return;
    }

    const sorted = [...alive].sort((a, b) => {
      const ta = a.type ?? '';
      const tb = b.type ?? '';
      if (ta !== tb) return ta.localeCompare(tb);
      return a.id - b.id;
    });

    const groups = [];
    const groupsByType = new Map();
    for (const unit of sorted) {
      const type = unit.type ?? 'infantry';
      let group = groupsByType.get(type);
      if (!group) {
        group = { type, units: [] };
        groupsByType.set(type, group);
        groups.push(group);
      }
      group.units.push(unit);
    }

    const renderItem = (u, groupSize, index, member = false, groupSelected = false) => {
      const short = PRODUCE_LABELS[u.type] ?? u.type;
      const hpPct = hpPercent(u.hp, u.maxHp);
      const tier = hpTier(hpPct);
      const sel = selectedIds.has(u.id) ? ' selected' : '';
      const low = hpPct < 35 ? ' low-hp' : '';
      const role = member ? ' unit-roster-member' : ' unit-roster-group-main';
      const mainSelected = !member && groupSelected && !selectedIds.has(u.id)
        ? ' unit-roster-group-selected'
        : '';
      const count = !member && groupSize > 1
        ? `<span class="unit-roster-count" aria-hidden="true">×${groupSize}</span>`
        : '';
      const memberIndex = member
        ? `<span class="unit-roster-member-index" aria-hidden="true">#${index + 1}</span>`
        : '';
      const ordinal = groupSize > 1 ? `, unit ${index + 1} of ${groupSize}` : '';
      return `
        <button
          type="button"
          class="unit-roster-item${role}${sel}${low}${mainSelected}"
          data-unit-id="${u.id}"
          title="${u.name} — ${u.def?.designation ?? ''}"
          aria-label="${u.name}${ordinal}"
        >
          <span class="unit-roster-icon">${getUnitIconMarkup(u.type)}</span>
          <span class="unit-roster-meta">
            <span class="unit-roster-name">${short}${memberIndex}${count}</span>
            <span class="unit-roster-hp-wrap">
              <span class="unit-roster-hp-bar"><span class="unit-roster-hp-fill unit-roster-hp-fill--${tier}" style="width:${hpPct}%"></span></span>
              <span class="unit-roster-hp">${hpPct}%</span>
            </span>
          </span>
        </button>
      `;
    };

    list.innerHTML = groups
      .map(({ type, units: groupUnits }) => {
        const groupSelected = groupUnits.some((u) => selectedIds.has(u.id));
        const groupExpanded = groupUnits.length > 1 && groupUnits.some(
          (u) => u.id === this._unitRosterHoveredUnitId || u.id === this._unitRosterFocusedUnitId
        );
        const members = groupUnits.length > 1
          ? `
            <div class="unit-roster-group-members" aria-label="Other ${PRODUCE_LABELS[type] ?? type} units">
              ${groupUnits
                .slice(1)
                .map((u, index) => renderItem(u, groupUnits.length, index + 1, true, false))
                .join('')}
            </div>
          `
          : '';
        return `
          <div class="unit-roster-group${groupUnits.length > 1 ? ' has-members' : ''}${groupSelected ? ' has-selected' : ''}${groupExpanded ? ' is-expanded' : ''}" data-unit-type="${type}">
            ${renderItem(groupUnits[0], groupUnits.length, 0, false, groupSelected)}
            ${members}
          </div>
        `;
      })
      .join('');
  }

  _collapseCommandPanelsOnOutsideClick(e) {
    const hud = this.root.querySelector('#hud');
    if (!hud || hud.classList.contains('hidden')) return;

    const fsPanel = this.root.querySelector('#firesupport-panel');
    const goPanel = this.root.querySelector('#generalorders-panel');
    const bbPanel = this.root.querySelector('#base-build-panel');
    if (
      fsPanel?.classList.contains('hidden') &&
      goPanel?.classList.contains('hidden') &&
      bbPanel?.classList.contains('hidden')
    ) {
      return;
    }

    const target = e.target;
    if (!(target instanceof Node)) return;

    if (this.fireSupportExpanded && fsPanel && !fsPanel.contains(target)) {
      this.setFireSupportExpanded(false);
    }
    if (this.generalOrdersExpanded && goPanel && !goPanel.contains(target)) {
      this.setGeneralOrdersExpanded(false);
    }
    if (this.baseBuildExpanded && bbPanel && !bbPanel.contains(target)) {
      this.setBaseBuildExpanded(false);
    }
  }

  setFireSupportExpanded(on) {
    this.fireSupportExpanded = !!on;
    this._syncFireSupportCollapse();
  }

  _syncFireSupportCollapse() {
    const panel = this.root.querySelector('#firesupport-panel');
    const toggle = this.root.querySelector('#btn-toggle-firesupport');
    if (!panel) return;

    panel.classList.toggle('collapsed', !this.fireSupportExpanded);
    if (toggle) {
      toggle.setAttribute('aria-expanded', this.fireSupportExpanded ? 'true' : 'false');
      toggle.title = this.fireSupportExpanded
        ? 'Collapse fire support panel'
        : 'Expand fire support panel';
    }
  }

  renderFireSupportButtons() {
    const wrap = this.root.querySelector('#firesupport-btns');
    if (!wrap) return;
    wrap.innerHTML = FIRE_SUPPORT_LIST.map(
      (fs) => `
      <button type="button" class="firesupport-btn interactive" data-fs="${fs.id}" title="${fs.label}">
        <span class="fs-name">${fs.short}</span>
        <span class="fs-cd" data-cd="${fs.id}">Ready</span>
      </button>
    `
    ).join('');

    wrap.querySelectorAll('.firesupport-btn').forEach((btn) => {
      btn.onclick = () => {
        if (this.callbacks.onFireSupport) this.callbacks.onFireSupport(btn.dataset.fs);
      };
    });
  }

  updateFireSupport(manager) {
    const panel = this.root.querySelector('#firesupport-panel');
    const hint = this.root.querySelector('#firesupport-hint');
    if (!panel || !manager) return;

    const pending = manager.pending ?? null;
    if (pending !== this._lastFireSupportPending) {
      if (pending && !this.fireSupportExpanded) {
        this.setFireSupportExpanded(true);
      }
      this._lastFireSupportPending = pending;
    }

    panel.classList.toggle('targeting', !!manager.pending);
    const commandLink = manager.hasCommandLink?.() !== false;

    for (const fs of FIRE_SUPPORT_LIST) {
      const cdEl = panel.querySelector(`[data-cd="${fs.id}"]`);
      const btn = panel.querySelector(`[data-fs="${fs.id}"]`);
      const rem = manager.getCooldownRemaining(fs.id);
      const airborneSpent =
        fs.id === 'airborneDrop' && manager.isAirborneAvailable && !manager.isAirborneAvailable();
      const airborneCloudCovered =
        fs.id === 'airborneDrop' && manager.isAirborneCloudCovered?.();
      const cloudRemaining = airborneCloudCovered
        ? Math.ceil(manager.getAirborneCloudCoverRemaining?.() ?? 0)
        : 0;
      const ready = manager.isReady(fs.id);
      const armed = manager.pending === fs.id;

      if (cdEl) {
        const cloudMinutes = Math.floor(cloudRemaining / 60);
        const cloudSeconds = String(cloudRemaining % 60).padStart(2, '0');
        cdEl.textContent = !commandLink
          ? 'No Radio'
          : airborneSpent
          ? 'Used'
          : airborneCloudCovered
          ? `Cloud ${cloudMinutes}:${cloudSeconds}`
          : ready
            ? 'Ready'
            : `${Math.ceil(rem)}s`;
      }
      if (btn) {
        btn.disabled = (!ready && !armed) || airborneSpent;
        btn.classList.toggle('armed', armed);
        btn.classList.toggle('on-cooldown', !ready || airborneSpent);
      }
    }

    if (hint) {
      if (!commandLink) {
        hint.textContent = 'No living radio operator — off-map support unavailable';
      } else if (manager.targetRejectReason) {
        hint.textContent = manager.targetRejectReason;
      } else if (manager.pending === 'strafe') {
        hint.textContent = 'Click the map to call fighter strafe (Esc to cancel)';
      } else if (manager.pending === 'airBomb') {
        hint.textContent = 'Click the map to call air bomb drop (Esc to cancel)';
      } else if (manager.pending === 'barrage') {
        hint.textContent = 'Click the map for artillery barrage (Esc to cancel)';
      } else if (manager.pending === 'creepingBarrage') {
        hint.textContent = 'Click the map — creeping barrage lifts toward your target (Esc to cancel)';
      } else if (manager.pending === 'airborneDrop') {
        hint.textContent = 'Click the map to drop elite paratroopers (Esc to cancel)';
      } else if (manager.isAirborneCloudCovered?.()) {
        const remaining = Math.ceil(manager.getAirborneCloudCoverRemaining?.() ?? 0);
        const minutes = Math.floor(remaining / 60);
        const seconds = String(remaining % 60).padStart(2, '0');
        hint.textContent =
          `Airborne grounded by cloud cover — conditions clear in ${minutes}:${seconds} for both sides`;
      } else if (manager.game?.clearance || manager.game?.lastStand) {
        const airLeft = manager.airborneUsesLeft;
        const modeLabel = manager.game?.clearance ? 'Clear Defenses' : 'Battle Simulation';
        hint.textContent =
          airLeft === 0
            ? `Off-map support — Airborne already used (once per side in ${modeLabel})`
            : `Off-map support — Airborne once per side in ${modeLabel}; other assets recharge`;
      } else {
        hint.textContent = 'Call off-map support — each strike has a long cooldown';
      }
    }
  }

  setGeneralOrdersExpanded(on) {
    this.generalOrdersExpanded = !!on;
    this._syncGeneralOrdersCollapse();
  }

  _syncGeneralOrdersCollapse() {
    const panel = this.root.querySelector('#generalorders-panel');
    const toggle = this.root.querySelector('#btn-toggle-generalorders');
    if (!panel) return;

    panel.classList.toggle('collapsed', !this.generalOrdersExpanded);
    if (toggle) {
      toggle.setAttribute('aria-expanded', this.generalOrdersExpanded ? 'true' : 'false');
      toggle.title = this.generalOrdersExpanded
        ? 'Collapse general orders panel'
        : 'Expand general orders panel';
    }
  }

  renderGeneralOrdersButtons() {
    const wrap = this.root.querySelector('#generalorders-btns');
    if (!wrap) return;
    const orderBtns = GENERAL_ORDER_LIST.map(
      (order) => `
      <button type="button" class="generalorders-btn interactive" data-go="${order.id}" title="${order.label}">
        <span class="go-name">${order.short}</span>
        <span class="go-cd" data-cd="${order.id}">Ready</span>
      </button>
    `
    ).join('');
    const seekCoverBtn = `
      <button
        type="button"
        class="generalorders-btn interactive seek-cover-toggle"
        id="btn-toggle-seek-cover"
        title="Move orders seek nearest cover"
        aria-pressed="false"
      >
        <span class="go-name">Seek Cover</span>
        <span class="go-cd seek-cover-state">Off</span>
      </button>
    `;
    wrap.innerHTML = orderBtns + seekCoverBtn;

    wrap.querySelectorAll('.generalorders-btn[data-go]').forEach((btn) => {
      btn.onclick = () => {
        if (this.callbacks.onGeneralOrder) this.callbacks.onGeneralOrder(btn.dataset.go);
      };
    });
    const seekBtn = wrap.querySelector('#btn-toggle-seek-cover');
    if (seekBtn) {
      seekBtn.onclick = () => {
        this.setSeekCoverMode(!this.seekCoverMode);
        if (this.callbacks.onToggleSeekCover) {
          this.callbacks.onToggleSeekCover(this.seekCoverMode);
        }
      };
    }
    this._syncSeekCoverToggle();
  }

  updateGeneralOrders(manager) {
    const panel = this.root.querySelector('#generalorders-panel');
    const hint = this.root.querySelector('#generalorders-hint');
    if (!panel || !manager) return;

    const activeType = manager.getActiveType();
    const activeRem = manager.getActiveRemaining();
    const commandLink = manager.hasCommandLink?.() !== false;

    panel.classList.toggle('order-active', !!activeType);

    for (const order of GENERAL_ORDER_LIST) {
      const cdEl = panel.querySelector(`[data-cd="${order.id}"]`);
      const btn = panel.querySelector(`[data-go="${order.id}"]`);
      const cdRem = manager.getCooldownRemaining(order.id);
      const ready = manager.isReady(order.id);
      const isActive = activeType === order.id;

      if (cdEl) {
        if (!commandLink) {
          cdEl.textContent = 'No CMD';
        } else if (isActive) {
          cdEl.textContent = `${Math.ceil(activeRem)}s`;
        } else if (ready) {
          cdEl.textContent = 'Ready';
        } else {
          cdEl.textContent = `${Math.ceil(cdRem)}s`;
        }
      }
      if (btn) {
        const cancellable = isActive;
        btn.disabled = !ready && !cancellable;
        btn.classList.toggle('order-running', isActive);
        btn.classList.toggle('order-cancellable', cancellable);
        btn.classList.toggle('on-cooldown', !ready && !isActive);
        const nameEl = btn.querySelector('.go-name');
        if (nameEl) {
          nameEl.textContent = cancellable
            ? (GENERAL_ORDER_CANCEL_LABELS[order.id] ?? `Cancel ${order.short}`)
            : order.short;
        }
      }
    }

    if (hint) {
      if (!commandLink) {
        hint.textContent = 'Commander lost — command-wide orders unavailable';
      } else if (activeType === 'fullRetreat') {
        const retreatDest = this._hudClearance ? 'starting zone' : 'HQ';
        hint.textContent = `Full Retreat — units withdrawing to ${retreatDest} (${Math.ceil(activeRem)}s) · click Cancel Retreat or Esc`;
      } else if (activeType === 'holdGround') {
        hint.textContent = `Hold Ground — troops standing firm (${Math.ceil(activeRem)}s) · click Cancel Hold or Esc`;
      } else {
        this._syncGeneralOrdersHint();
      }
    }
  }

  getTabletCameraInput() {
    return this.tabletCamera?.getInput() ?? null;
  }

  clearTabletCameraZoomTap() {
    this.tabletCamera?.clearZoomTap();
  }

  setTabletTargetMode(on) {
    const btn = this.root.querySelector('#btn-tablet-target');
    if (!btn) return;
    btn.classList.toggle('is-active', !!on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  setTabletFireMode(on) {
    const btn = this.root.querySelector('#btn-tablet-fire');
    if (!btn) return;
    btn.classList.toggle('is-active', !!on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  hideHUD() {
    this.hideLoadingScreen();
    this._settingsReturnTarget = 'title';
    this._syncSettingsBackButton();
    this.hudHidden = false;
    this.setGamePaused(false);
    this.hideLastStandBriefing();
    this.closeGuide();
    this.tabletCamera?.setVisible(false);
    this.callbacks.onTabletTargetMode?.(false);
    this.callbacks.onTabletFireMode?.(false);
    this.updateHqThreat(null);
    this.root.querySelector('#hud').classList.add('hidden');
    this.root.querySelector('#hud')?.classList.remove('hud-chrome-hidden');
    this.hideTdBreachAlert();
    const panel = this.root.querySelector('#firesupport-panel');
    if (panel) panel.classList.remove('targeting');
    this.refreshTitleSaveButton();
  }

  updateHqThreat(threat) {
    const banner = this.root.querySelector('#hq-threat-alert');
    const card = this.root.querySelector('#hq-threat-alert-card');
    const title = this.root.querySelector('#hq-threat-alert-title');
    const detail = this.root.querySelector('#hq-threat-alert-detail');
    const hpEl = this.root.querySelector('#hq-threat-alert-hp');
    const app = document.querySelector('#app');
    if (!banner || !title || !detail || !hpEl) return;

    const active = threat && threat.level !== 'none';
    banner.classList.toggle('hidden', !active);
    app?.classList.toggle('hq-under-attack', threat?.level === 'critical' || threat?.level === 'siege');

    if (!active) return;

    card?.classList.toggle('hq-threat-alert-card--critical', threat.level === 'critical');
    card?.classList.toggle('hq-threat-alert-card--warn', threat.level === 'warn');

    if (threat.level === 'critical') {
      title.textContent = 'Headquarters critical';
    } else if (threat.level === 'siege') {
      title.textContent = 'Headquarters under siege';
    } else {
      title.textContent = 'Enemy forces near headquarters';
    }

    const parts = [];
    if (threat.sieging > 0) {
      parts.push(
        `${threat.sieging} enemy unit${threat.sieging === 1 ? '' : 's'} at your HQ`
      );
      if (threat.siegeDps > 0.5) {
        parts.push(`~${Math.round(threat.siegeDps)} HP/s from enemy presence`);
      }
    } else if (threat.nearby > 0) {
      parts.push(`${threat.nearby} hostile unit${threat.nearby === 1 ? '' : 's'} approaching`);
    }
    if (threat.directFire) parts.push('taking direct fire');
    else if (threat.recentlyDamaged && threat.sieging === 0) parts.push('recent hits on HQ');

    detail.textContent = parts.length ? parts.join(' · ') : 'Defend your headquarters';
    hpEl.innerHTML = hpBarMarkup(threat.hp, threat.maxHp, { compact: true });
  }

  updateArmyStats(playerAlive, enemyAlive, opts = {}) {
    const el = this.root.querySelector('#hud-army');
    if (!el) return;

    const tutorial = opts.tutorial === true;
    const clearance = opts.clearance === true;
    const assault = opts.assault ?? null;
    const wipeHint = opts.wipeHint ?? null;

    if (wipeHint) {
      el.textContent = wipeHint;
      el.classList.add('hud-army-wiped');
      return;
    }

    el.classList.remove('hud-army-wiped');
    if (tutorial) {
      el.textContent = `Your forces: ${playerAlive} · Practice mode`;
    } else if (clearance) {
      const playerDefends = opts.clearanceRole === 'defend';
      const forceText = playerDefends
        ? `Garrison: ${playerAlive} · Attackers: ${enemyAlive}`
        : `Assault force: ${playerAlive} · Defenders: ${enemyAlive}`;
      const reinforcement = opts.clearanceReinforcements;
      const deadline = opts.clearanceTimeLimitEnabled !== false;
      let timeText = 'No deadline';
      if (deadline) {
        const timeLeft = Math.max(
          0,
          Math.ceil((opts.clearanceTimeLimit ?? 15 * 60) - (opts.matchTime ?? 0))
        );
        const timeMins = Math.floor(timeLeft / 60);
        const timeSecs = String(timeLeft % 60).padStart(2, '0');
        timeText = `Assault time ${timeMins}:${timeSecs}`;
      }
      if (reinforcement?.enabled) {
        const seconds = Math.max(0, Math.ceil(reinforcement.nextAt - (opts.matchTime ?? 0)));
        const mins = Math.floor(seconds / 60);
        const secs = String(seconds % 60).padStart(2, '0');
        el.textContent = `${forceText} · ${timeText} · Reinforcements ${mins}:${secs}`;
      } else {
        el.textContent = `${forceText} · ${timeText}`;
      }
    } else if (opts.towerDefense && opts.tdHqDefense) {
      el.textContent = `Your forces: ${playerAlive} · Assault force: ${enemyAlive}`;
    } else if (opts.towerDefense) {
      el.textContent = `Assault force: ${enemyAlive} · Defenses: ${opts.defenseCount ?? '—'}`;
    } else if (assault) {
      const you = assault.playerRole === 'attack' ? 'Assault' : 'Garrison';
      const foe = assault.playerRole === 'attack' ? 'Defenders' : 'Attackers';
      el.textContent = `${you}: ${playerAlive} · ${foe}: ${enemyAlive}`;
    } else {
      el.textContent = `Your forces: ${playerAlive} · Enemy: ${enemyAlive}`;
    }
  }

  updateResources(supplies, capturePoints, cheatMode = false) {
    const el = this.root.querySelector('#hud-resources');
    if (el) el.textContent = cheatMode ? '∞' : String(supplies);

    const owned = capturePoints?.filter((p) => p.owner === 'player').length ?? 0;
    const total = capturePoints?.length ?? 0;
    const label = this.root.querySelector('.resource-label');
    if (label) {
      label.textContent = cheatMode
        ? 'Supplies (unlimited)'
        : `Supplies (+${owned}/${total} pts)`;
    }
  }

  setCheatHud(active) {
    this._hudCheatMode = !!active;
    const badge = this.root.querySelector('#hud-cheat-badge');
    if (badge) badge.classList.toggle('hidden', !active);
    this.root.classList.toggle('cheat-mode-active', !!active);
    if (active && this.autoBuildMode) {
      this.setAutoBuildMode(false, this._hudCampaignStyle, { persist: false });
    }
    this._syncAutoBuildToggle();
  }

  showCheatToast(active) {
    const hint = this.root.querySelector('#hud-hint');
    if (!hint) return;
    const prev = hint.dataset.cheatRestore;
    if (active) {
      if (!prev) hint.dataset.cheatRestore = hint.textContent;
      hint.textContent =
        'Cheat mode ON — instant builds, unlimited supplies (iddqd to toggle off, or remove ?cheat=1 from the URL)';
      hint.classList.add('hud-hint-cheat');
    } else {
      hint.textContent = prev || hint.textContent;
      delete hint.dataset.cheatRestore;
      hint.classList.remove('hud-hint-cheat');
    }
  }

  showLastStandBriefing(briefing, { onBegin, onDismiss } = {}) {
    const overlay = this.root.querySelector('#laststand-briefing-overlay');
    if (!overlay || !briefing) return;

    this._lastStandBriefingHandlers.onBegin = onBegin ?? null;
    this._lastStandBriefingHandlers.onDismiss = onDismiss ?? null;

    const title = this.root.querySelector('#laststand-briefing-title');
    const meta = this.root.querySelector('#laststand-briefing-meta');
    const body = this.root.querySelector('#laststand-briefing-body');
    if (title) title.textContent = briefing.operation ?? 'Meeting Engagement';
    if (meta) {
      meta.textContent = `${briefing.location ?? '—'} · ${briefing.date ?? '—'} · ${briefing.time ?? '—'} · ${briefing.weather ?? ''}`;
    }
    if (body) {
      body.innerHTML = `
        <p class="laststand-briefing-lead">${briefing.situation ?? ''}</p>
        <dl class="laststand-briefing-dl">
          <dt>Terrain</dt>
          <dd>${briefing.terrain ?? '—'}</dd>
          <dt>Enemy plan (SIGINT)</dt>
          <dd>${briefing.enemyPlan ?? '—'} — ${briefing.enemyIntel ?? ''}</dd>
          <dt>Expected conduct</dt>
          <dd>${briefing.enemySignal ?? ''}</dd>
          <dt>Your objective</dt>
          <dd>${briefing.objective ?? ''}</dd>
        </dl>
      `;
    }

    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
  }

  hideLastStandBriefing() {
    const overlay = this.root.querySelector('#laststand-briefing-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    this._lastStandBriefingHandlers.onBegin = null;
    this._lastStandBriefingHandlers.onDismiss = null;
  }

  updateLastStandDeploy(game) {
    if (!game?.lastStand) return;

    const preset = isLastStandPresetDeployMode(game.lastStand.deployMode);
    const LAST_STAND_BATTLE_HINT = preset
      ? 'Preset battle group — combined arms clash · destroy all enemy forces to win'
      : 'Battle Simulation — equal unit counts · no reinforcements · wipe out all enemy units to win';

    const banner = this.root.querySelector('#opening-countdown');
    const title = this.root.querySelector('#opening-countdown-title');
    const value = this.root.querySelector('#opening-countdown-value');
    const sub = this.root.querySelector('#opening-countdown-sub');
    const fill = this.root.querySelector('#opening-countdown-fill');
    const launchBtn = this.root.querySelector('#btn-launch-battle-now');
    const qEl = this.root.querySelector('#queue-text');
    const playerCount = game._playerAlive?.length ?? 0;
    const enemyCount = game._enemyAlive?.length ?? 0;
    const supplies = game.cheatMode ? '∞' : game.lastStand.supplies.player;

    if (game.lastStand.phase !== 'deploy') {
      banner?.classList.add('hidden');
      banner?.classList.remove('opening-countdown--manual-deploy');
      launchBtn?.classList.add('hidden');
      this._hudLastStandDeploy = false;
      this._setProductionPanelVisible(false);
      this.root.querySelector('#firesupport-panel')?.classList.remove('hidden');
      this.root.querySelector('#generalorders-panel')?.classList.remove('hidden');
      this._defaultHudHint = LAST_STAND_BATTLE_HINT;
      const hint = this.root.querySelector('#hud-hint');
      if (hint) {
        if (hint.textContent !== LAST_STAND_BATTLE_HINT) {
          hint.textContent = LAST_STAND_BATTLE_HINT;
        }
        hint.classList.remove('hud-hint-opening');
      }
      return;
    }

    this._hudLastStandDeploy = true;
    this._setProductionPanelVisible(!preset);
    this.root.querySelector('#firesupport-panel')?.classList.add('hidden');
    this.root.querySelector('#generalorders-panel')?.classList.add('hidden');
    banner?.classList.toggle('opening-countdown--manual-deploy', !preset);
    banner?.classList.remove('hidden');
    if (title) {
      title.textContent = preset ? 'Battle groups deployed' : 'Deploy your forces';
    }
    if (value) value.textContent = String(playerCount);
    if (sub) {
      if (preset) {
        sub.textContent = `${playerCount} friendly · ${enemyCount} enemy · combined-arms formations on a large theater`;
      } else {
        const plan = game.lastStand.enemyTactic?.name;
        const matchNote =
          enemyCount === playerCount && playerCount > 0
            ? 'enemy matched'
            : `enemy matching (${enemyCount}/${playerCount})`;
        sub.textContent = plan
          ? `${supplies} supplies left · ${matchNote} · enemy plan: ${plan}`
          : `${supplies} supplies left · ${matchNote} · Esc cancels selection`;
      }
    }
    if (fill) fill.style.width = '100%';
    if (launchBtn) {
      launchBtn.textContent = 'Begin Battle';
      launchBtn.classList.remove('hidden');
      const briefingOpen = !!this.root.querySelector('#laststand-briefing-overlay:not(.hidden)');
      launchBtn.disabled =
        playerCount === 0 ||
        !this.callbacks.onLaunchBattleNow ||
        briefingOpen ||
        (preset && !game.lastStand.briefingShown);
    }
    if (qEl) {
      if (preset) {
        const plan = game.lastStand.enemyTactic?.name;
        qEl.textContent = plan
          ? `Preset forces deployed — SIGINT indicates enemy plan: <strong>${plan}</strong>`
          : 'Preset force — rifle line, support weapons, and armor echelons are in position';
      } else {
        const pending = game.lastStand.pendingType;
        const plan = game.lastStand.enemyTactic?.name;
        const forceHint = plan
          ? `Enemy matches your unit count · plan: ${plan}`
          : 'Enemy matches your unit count (chooses its own mix)';
        qEl.textContent = pending
          ? `Placing ${game.playerFaction.units[pending]?.name ?? pending} — click the map · ${forceHint}`
          : `Select a unit type, then click the map · ${forceHint}`;
      }
    }

    const resources = preset ? '—' : game.cheatMode ? '∞' : Math.floor(game.lastStand.supplies.player);
    const resEl = this.root.querySelector('#hud-resources');
    if (resEl) resEl.textContent = String(resources);

    if (!preset) {
      this.root.querySelectorAll('.produce-btn').forEach((btn) => {
        const type = btn.dataset.type;
        const def = game.playerFaction?.units?.[type];
        if (!def) return;
        const radioCap =
          type === 'radioOperator' && !canAddRadioOperator(game.units, 'player');
        const canAfford =
          game.cheatMode || game.lastStand.supplies.player >= def.cost;
        const can = canAfford && !radioCap;
        btn.disabled = !can;
        btn.classList.toggle('armed', game.lastStand.pendingType === type);
        btn.querySelector('.produce-cost').textContent = game.cheatMode ? '—' : String(def.cost);
        if (radioCap) {
          btn.title = `${def.name} — max ${MAX_RADIO_OPERATORS_PER_SIDE} radio operators per side`;
        }
      });
    }

    const hint = this.root.querySelector('#hud-hint');
    if (hint) {
      const deployHint = this._defaultHudHint ?? hint.textContent;
      if (hint.textContent !== deployHint) hint.textContent = deployHint;
      hint.classList.add('hud-hint-opening');
    }
  }

  updateDeployCountdown(phase) {
    if (this._hudLastStand) return;
    const banner = this.root.querySelector('#opening-countdown');
    const title = this.root.querySelector('#opening-countdown-title');
    const value = this.root.querySelector('#opening-countdown-value');
    const sub = this.root.querySelector('#opening-countdown-sub');
    const fill = this.root.querySelector('#opening-countdown-fill');
    const launchBtn = this.root.querySelector('#btn-launch-battle-now');
    if (!banner) return;
    banner.classList.remove('opening-countdown--manual-deploy');

    if (!phase || phase.secondsLeft <= 0.05) {
      banner.classList.add('hidden');
      launchBtn?.classList.add('hidden');
      return;
    }

    const s = Math.max(1, Math.ceil(phase.secondsLeft));
    const pct = Math.min(100, Math.max(0, (phase.secondsLeft / phase.total) * 100));

    banner.classList.remove('hidden');
    if (title) title.textContent = phase.title ?? 'Quiet sector';
    if (value) value.textContent = String(s);
    if (sub) sub.textContent = phase.subtitle ?? '';
    if (fill) fill.style.width = `${pct}%`;
    if (launchBtn) {
      launchBtn.classList.toggle('hidden', phase.canLaunchEarly === false);
      launchBtn.disabled = !this.callbacks.onLaunchBattleNow;
    }
  }

  updateBattleOpening(secondsLeft, phase = null) {
    if (this._hudLastStand) return;
    const hint = this.root.querySelector('#hud-hint');
    if (!hint || !this._defaultHudHint) return;
    if (secondsLeft > 0.5) {
      const s = Math.ceil(secondsLeft);
      hint.textContent = phase?.hint
        ? phase.hint.replace('{seconds}', String(s))
        : this._hudStandardCampaign
          ? `Destroy the enemy HQ to win — staging ${s}s (stay inside your HQ ring)`
          : `Staging only — ${s}s until combat (stay inside HQ ring)`;
      hint.classList.add('hud-hint-opening');
    } else {
      hint.textContent = this._defaultHudHint;
      hint.classList.remove('hud-hint-opening');
    }
  }

  updateCapturePoints(points) {
    const bar = this.root.querySelector('#capture-bar');
    if (!bar || !points?.length) return;

    bar.innerHTML = points
      .map((p) => {
        const status = p.getCaptureStatus?.() ?? {
          contested: false,
          pct: Math.round(p.progress * 100),
          team: p.owner,
          label: p.name,
          phase: 'idle',
        };
        let state =
          p.owner === 'player' ? 'owned-player' : p.owner === 'enemy' ? 'owned-enemy' : 'neutral';
        if (status.contested) {
          state = status.team === 'player' ? 'capturing-player' : 'capturing-enemy';
        }
        const fl = p.isFrontline ? ' cp-frontline' : '';
        const tag = p.isFrontline ? ' ★' : '';
        const pct = status.pct;
        const barFill = status.contested
          ? `<span class="cp-progress-track"><span class="cp-progress-fill ${state}" style="width:${pct}%"></span></span>`
          : '';
        const statusText = status.contested ? status.label : `${pct}%`;
        return `<div class="cp-chip ${state}${fl}" title="${p.name} — ${status.label}">
          <span class="cp-chip-name">${p.name}${tag}</span>
          ${barFill}
          <span class="cp-chip-status">${statusText}</span>
        </div>`;
      })
      .join('');
  }

  _renderCoverBanner(units) {
    const el = this.root.querySelector('#selection-cover');
    if (!el) return;

    const covered = units
      .map((u) => ({ unit: u, cover: getCoverStatus(u) }))
      .filter((x) => x.cover.inCover);

    if (covered.length === 0) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }

    el.classList.remove('hidden');

    if (covered.length === 1) {
      const { unit, cover } = covered[0];
      const inside = !!cover.garrisoned;
      el.className = `selection-cover cover-tier-${inside ? 'garrison' : cover.tier}`;
      el.innerHTML = `
        <div class="cover-banner-inner">
          <span class="cover-banner-icon" aria-hidden="true">${inside ? '⌂' : '⛨'}</span>
          <div class="cover-banner-text">
            <strong class="cover-banner-title">${unit.name} — ${inside ? 'INSIDE BUILDING' : 'IN COVER'}</strong>
            <span class="cover-banner-sub">${cover.label} · ${cover.reduction}% damage reduction</span>
            <span class="cover-banner-detail">${cover.note}</span>
          </div>
        </div>
      `;
      return;
    }

    const insideN = covered.filter((x) => x.cover.garrisoned).length;
    el.className = `selection-cover cover-tier-${insideN > 0 ? 'garrison' : 'mixed'}`;
    const parts = covered.map(({ cover }) =>
      cover.garrisoned
        ? `Inside (${cover.reduction}%)`
        : `${cover.shortLabel} (${cover.reduction}%)`
    );
    el.innerHTML = `
      <div class="cover-banner-inner">
        <span class="cover-banner-icon" aria-hidden="true">${insideN > 0 ? '⌂' : '⛨'}</span>
        <div class="cover-banner-text">
          <strong class="cover-banner-title">${
            insideN === covered.length
              ? `${covered.length} inside buildings`
              : `${covered.length} of ${units.length} in cover${insideN ? ` (${insideN} inside)` : ''}`
          }</strong>
          <span class="cover-banner-detail">${parts.join(' · ')}</span>
        </div>
      </div>
    `;
  }

  _renderMoraleBanner(units, game) {
    const el = this.root.querySelector('#selection-morale');
    if (!el) return;

    const selected = Array.isArray(units) ? units : [];
    const allUnits = game?.units ?? [];
    const inspired = selected.filter((unit) => isUnitInspiredByCommander(unit, allUnits));
    if (inspired.length === 0) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }

    const allInspired = inspired.length === selected.length;
    const title =
      inspired.length === 1
        ? `${inspired[0].name} — INSPIRED`
        : allInspired
          ? `${inspired.length} selected units — INSPIRED`
          : `${inspired.length} of ${selected.length} selected units — INSPIRED`;
    const detail =
      inspired.length === 1
        ? `Within ${COMMANDER_AURA_RANGE} m of a living field commander`
        : `${inspired.length} unit${inspired.length === 1 ? '' : 's'} currently within the commander's ${COMMANDER_AURA_RANGE} m aura`;

    el.className = 'selection-morale inspired';
    el.innerHTML = `
      <div class="morale-banner-inner">
        <span class="morale-banner-icon" aria-hidden="true">✦</span>
        <div class="morale-banner-text">
          <strong class="morale-banner-title">${title}</strong>
          <span class="morale-banner-sub">${detail}</span>
          <span class="morale-banner-detail">Automatic retreat and surrender pressure is greatly reduced while the aura holds.</span>
        </div>
      </div>
    `;
  }

  updateAssaultHUD(assault) {
    if (!assault) return;
    const hud = formatAssaultHud(assault);
    const obj = this.root.querySelector('#assault-objective');
    const timer = this.root.querySelector('#assault-timer');
    if (obj) obj.textContent = hud.objective;
    if (timer) timer.textContent = hud.timer;
  }

  _productionPanelKeyFor(game) {
    if (!this._hudBaseBuilding) return 'classic';
    const types = getPlayerProductionUnitTypes(game) ?? [];
    const entry = game.selectedBaseBuilding;
    return `${entry?.id ?? 'none'}|${types.join(',')}`;
  }

  syncProductionPanel(game) {
    if (!game?.playerFaction || game.lastStand) return;

    const panel = this.root.querySelector('#production-panel');
    const title = panel?.querySelector('h3');
    const btns = this.root.querySelector('#produce-btns');
    if (!panel || !btns) return;

    if (!this._hudBaseBuilding) {
      if (title) title.textContent = 'Reinforcements';
      return;
    }

    const types = getPlayerProductionUnitTypes(game) ?? [];
    const entry = game.selectedBaseBuilding;
    const showPanel = (entry?.def?.spawns?.length ?? 0) > 0;

    this._setProductionPanelVisible(showPanel);
    if (!showPanel) {
      this._productionPanelKey = '';
      return;
    }

    if (title) {
      title.textContent = entry?.def?.name ?? 'Depot';
    }

    const panelKey = this._productionPanelKeyFor(game);
    if (panelKey === this._productionPanelKey) return;
    this._productionPanelKey = panelKey;

    const faction = game.playerFaction;
    btns.innerHTML = types
      .map((type) => {
        const def = faction.units[type];
        if (!def) return '';
        const short = PRODUCE_LABELS[type] ?? type;
        return `
        <button class="produce-btn interactive" data-type="${type}" title="${def.name} — ${def.designation}">
          <span class="produce-icon" aria-hidden="true">${getUnitIconMarkup(type)}</span>
          <span class="produce-name">${short}</span>
          <span class="produce-cost">${def.cost}</span>
        </button>
      `;
      })
      .join('');
  }

  updateProduction(game, options = {}) {
    if (!game?.playerFaction) return;
    if (game.lastStand) {
      this.updateLastStandDeploy(game);
      return;
    }
    if (this._hudBaseBuilding) {
      this.syncProductionPanel(game);
    } else {
      this._productionPanelKey = 'classic';
    }
    const resources = Math.floor(game.resources.player);
    const progress = game.production.getQueueProgress('player');
    const queue = game.production.getQueue('player');

    if (!options.skipResources) {
      this.updateResources(resources, game.capturePoints, game.cheatMode);
    }
    this.setCheatHud(game.cheatMode);

    const staging = isPlayerStagingPhase(game);
    const atUnitLimit = game.production.isAtUnitLimit('player');
    const qEl = this.root.querySelector('#queue-text');
    if (qEl) {
      if (staging) {
        qEl.textContent = this._hudStandardCampaign
          ? 'Quiet sector — launch battle to reinforce · Victory: destroy enemy HQ'
          : 'Quiet sector — launch battle to queue reinforcements';
      } else if (atUnitLimit && queue.length === 0) {
        qEl.textContent = `Unit limit reached — ${STANDARD_UNIT_LIMIT}/${STANDARD_UNIT_LIMIT} deployed`;
      } else if (progress) {
        const pct =
          progress.total <= 0
            ? 100
            : Math.round((1 - progress.remaining / progress.total) * 100);
        const autoHint = this.autoBuildMode && this._hudAutoBuildAvailable;
        const autoNote = autoHint ? ' · auto build' : '';
        qEl.textContent = `Building ${progress.def.name}… ${pct}% (${queue.length} queued${autoNote})`;
      } else if (queue.length > 0) {
        const autoHint = this.autoBuildMode && this._hudAutoBuildAvailable;
        qEl.textContent = autoHint
          ? `${queue.length} in queue · auto build filling slots`
          : `${queue.length} in queue`;
      } else {
        const autoHint = this.autoBuildMode && this._hudAutoBuildAvailable;
        qEl.textContent = autoHint
          ? 'Auto build on — queue will fill when supplies allow'
          : 'Queue empty — click to train';
      }
    }

    const unlocked =
      !this._hudBaseBuilding && game.baseBuildings?.active
        ? game.baseBuildings.getUnlockedUnits('player')
        : null;

    this.root.querySelectorAll('.produce-btn').forEach((btn) => {
      const type = btn.dataset.type;
      const def = game.playerFaction.units[type];
      if (!def) return;
      const locked = unlocked && !unlocked.has(type);
      const radioCap =
        type === 'radioOperator' ? game.production.getRadioOperatorCap?.('player') : null;
      const atRadioCap = !!radioCap?.atCap;
      const can =
        !staging &&
        !locked &&
        !atRadioCap &&
        game.production.canEnqueue('player', type, game.resources.player) &&
        game.running;
      btn.disabled = !can;
      btn.classList.toggle('locked', !!locked);
      btn.querySelector('.produce-cost').textContent = game.cheatMode ? '—' : String(def.cost);
      if (staging) {
        btn.title = `${def.name} — launch battle to begin training`;
      } else if (locked) {
        const buildingId = getSpawnBuildingForUnit(type);
        const buildingName = buildingId ? BASE_BUILDING_TYPES[buildingId]?.name : null;
        btn.title = buildingName
          ? `Requires ${buildingName} — click that structure on the map`
          : `${def.name} — locked until required structure is built`;
      } else if (atRadioCap) {
        btn.title = `${def.name} — max ${MAX_RADIO_OPERATORS_PER_SIDE} radio operators per side`;
      } else if (atUnitLimit) {
        btn.title = `${def.name} — ${STANDARD_UNIT_LIMIT}-unit limit reached`;
      } else {
        btn.title = `${def.name} — ${def.designation}`;
      }
    });
  }

  updateFireMissionControls(activeCount = 0) {
    const wrap = this.root.querySelector('#fire-mission-actions');
    const btn = this.root.querySelector('#btn-cancel-fire-missions');
    if (!wrap || !btn) return;
    const n = Math.max(0, activeCount | 0);
    wrap.classList.toggle('hidden', n === 0);
    btn.textContent = n === 1 ? 'Cancel fire mission' : `Cancel fire missions (${n})`;
  }

  updateArtilleryAutoFire(game = null) {
    const wrap = this.root.querySelector('#arty-autofire-actions');
    const btn = this.root.querySelector('#btn-arty-autofire');
    const hint = this.root.querySelector('#arty-autofire-hint');
    if (!wrap || !btn) return;

    const selected =
      game?._playerAlive?.filter(
        (u) => u.selected && !u.dead && u.def?.type === 'artillery'
      ) ?? [];
    const hasArtillery = selected.length > 0;
    wrap.classList.toggle('hidden', !hasArtillery);
    if (!hasArtillery) return;

    const onCount = selected.filter((u) => u.autoFire).length;
    const allOn = onCount === selected.length;
    const allOff = onCount === 0;
    btn.classList.toggle('armed', allOn);
    btn.setAttribute('aria-pressed', String(allOn));
    btn.textContent = allOn
      ? 'Auto-fire: On'
      : allOff
        ? 'Auto-fire: Off'
        : `Auto-fire: Mixed (${onCount}/${selected.length})`;
    if (hint) {
      hint.textContent = allOn
        ? 'Howitzers auto-engage enemies in range (shells lob over buildings beyond min range). Click to disable.'
        : allOff
          ? 'Auto-fire is off for this selection — only ordered fire missions (attack unit, ground, building, or smoke). Click to enable auto-fire.'
          : 'Selection has mixed auto-fire settings. Click to turn all selected howitzers on.';
    }
  }

  updateSmokeShell(game = null) {
    const wrap = this.root.querySelector('#smoke-shell-actions');
    const btn = this.root.querySelector('#btn-smoke-shell');
    const hint = this.root.querySelector('#smoke-shell-hint');
    if (!wrap || !btn) return;

    const selected =
      game?._playerAlive?.filter(
        (u) => u.selected && !u.dead && u.def?.type === 'artillery'
      ) ?? [];
    const hasArtillery = selected.length > 0;
    const ready = selected.filter(isSmokeShellReady);
    const pendingMission = selected.some((u) => isSmokeShellTarget(u.attackOrder));
    const nextReady = selected.length
      ? Math.min(...selected.map((u) => Math.max(0, u.smokeShellCooldown ?? 0)))
      : 0;
    wrap.classList.toggle('hidden', !hasArtillery);

    const armed = !!game?.smokeShellTargeting;
    btn.classList.toggle('armed', armed);
    btn.disabled = !armed && ready.length === 0;
    btn.classList.toggle('on-cooldown', !armed && hasArtillery && ready.length === 0);
    btn.textContent = armed
      ? 'Cancel smoke shell'
      : ready.length > 0
        ? 'Smoke shell'
        : pendingMission
          ? 'Smoke shell (firing)'
          : `Smoke shell (${Math.ceil(nextReady)}s)`;
    if (hint) {
      hint.textContent = armed
        ? 'Click the map to place smoke (Esc to cancel)'
        : ready.length > 0
          ? `One selected gun fires — ${SMOKE_SHELL_COOLDOWN_SEC}s cooldown; smoke lasts 60s and blocks enemy aim`
          : pendingMission
            ? 'Smoke mission assigned — the cooldown begins when the shell is fired'
            : `Smoke ammunition being prepared — ready in ${Math.ceil(nextReady)}s`;
    }
  }

  updateSelection(units, hoverTarget = null, hq = null, game = null) {
    const body = this.root.querySelector('#selection-body');
    const offer = this.root.querySelector('#target-offer');
    const offerLabel = this.root.querySelector('#target-offer-label');
    if (!body) return;
    this.updateEngagementStance(hq ? [] : units);

    const showProduction = this._hudBaseBuilding
      ? (game?.selectedBaseBuilding?.def?.spawns?.length ?? 0) > 0
      : this._hudLastStand
        ? this._hudLastStandDeploy
        : hq && !hq.dead && hq.team === 'player';
    if (!this._hudBaseBuilding) this._setProductionPanelVisible(showProduction);

    const targetName = hoverTarget && !hoverTarget.dead ? TargetIndicators.getTargetLabel(hoverTarget) : null;
    const tabletOn = this.tabletCamera?.shouldEnable() ?? isTabletLikeDevice();
    const targetHint = this.root.querySelector('#target-offer-hint');
    if (offer) {
      offer.classList.toggle('hidden', !(units.length > 0 && targetName));
      if (offerLabel && targetName) offerLabel.textContent = `Target: ${targetName}`;
    }
    if (targetHint) {
      targetHint.textContent = tabletOn
        ? 'Tap enemy again or press Engage'
        : 'Or left-click the highlighted enemy';
    }

    if (hq && !hq.dead) {
      this._renderCoverBanner([]);
      this._renderMoraleBanner([], game);
      const teamLabel = hq.team === 'player' ? 'Your headquarters' : 'Enemy headquarters';
      const beingRepaired =
        hq.hp < hq.maxHp && isHqBeingRepairedByEngineers(hq, game?.units ?? []);
      const repairHint = beingRepaired
        ? '<p class="hq-selected-hint"><strong>Engineers on site</strong> — structural repairs in progress.</p>'
        : '';
      const trainHint =
        this._hudBaseBuilding && hq.team === 'player'
          ? '<p class="hq-selected-hint">Use <strong>Base Construction</strong> below to place structures near HQ or <strong>captured sectors</strong> — garrison for infantry, depots for other units.</p>'
          : '<p class="hq-selected-hint">HQ selected — issue move orders to units, or attack enemy forces.</p>';
      body.innerHTML = `
        <h3 class="hq-selected-title">${hq.name ?? 'Headquarters'}</h3>
        <p class="hq-selected-meta">${teamLabel}</p>
        ${hpBarMarkup(hq.hp, hq.maxHp)}
        ${repairHint}
        ${trainHint}
      `;
      this.updateEngineerBuild(game);
      this.updateArtilleryAutoFire(game);
      this.updateSmokeShell(game);
      this.updateTankRiderActions([]);
      return;
    }

    const baseEntry = game?.selectedBaseBuilding;
    if (baseEntry && units.length === 0) {
      this._renderCoverBanner([]);
      this._renderMoraleBanner([], game);
      const hpPct = Math.round((baseEntry.hp / Math.max(baseEntry.maxHp, 1)) * 100);
      const garrisonN = baseEntry.garrison?.length ?? 0;
      const cap = baseEntry.def.garrisonCapacity ?? 0;
      let detail = baseEntry.def.subtitle ?? '';
      if (baseEntry.typeId === 'bunker' || baseEntry.def?.garrison) {
        detail =
          garrisonN > 0
            ? `<strong>${garrisonN}/${cap} inside</strong> — troops are garrisoned in this building (heavy cover). Order them to move to leave.`
            : `Garrison ${garrisonN}/${cap} — move foot troops onto the building to enter. Occupants appear as armed lookouts at the windows, with an <strong>INSIDE</strong> marker above the roof.`;
      } else if ((baseEntry.def.spawns?.length ?? 0) > 0) {
        detail = `Train units from this depot using the panel on the right.`;
      }
      body.innerHTML = `
        <h3 class="hq-selected-title">${baseEntry.def.name}</h3>
        <p class="hq-selected-meta">Your structure · ${hpPct}% HP</p>
        ${hpBarMarkup(baseEntry.hp, baseEntry.maxHp)}
        <p class="hq-selected-hint">${detail}</p>
      `;
      this.updateEngineerBuild(game);
      this.updateArtilleryAutoFire(game);
      this.updateSmokeShell(game);
      this.updateTankRiderActions(units);
      return;
    }

    if (units.length === 0) {
      const emptyHint = this._hudBaseBuilding
        ? 'Click HQ to build structures. After your garrison or depots are complete, click them on the map to train units.'
        : 'Click or drag to select units. Click your HQ for status.';
      body.innerHTML = `<h3>No selection</h3><p>${emptyHint}</p>`;
      this._renderCoverBanner([]);
      this._renderMoraleBanner([], game);
      this.updateEngineerBuild(game);
      this.updateArtilleryAutoFire(game);
      this.updateSmokeShell(game);
      this.updateTankRiderActions(units);
      return;
    }

    this._renderCoverBanner(units);
    this._renderMoraleBanner(units, game);

    if (units.length === 1) {
      const u = units[0];
      const maxRangeMeters = u.def.rangeMeters ?? u.def.range * 10;
      const rangeLabel = u.def.minRange
        ? `${u.def.minRangeMeters ?? u.def.minRange * 10}–${maxRangeMeters} m`
        : `${maxRangeMeters} m`;
      const coaxLine = u.def.coaxMG
        ? ` · Coax ${u.def.coaxMG.rangeMeters ?? u.def.coaxMG.range * 10} m / ${u.def.coaxMG.damage} dmg`
        : '';
      const crewSmallArmsLine = u.def.crewSmallArms
        ? ` · Crew rifles ${u.def.crewSmallArms.rangeMeters ?? u.def.crewSmallArms.range * 10} m`
        : '';
      const orderLine = u.attackOrder
        ? u.attackOrder.isSmokeShell
          ? ' · Smoke shell mission'
          : u.attackOrder.isGround || u._manualFireMission
            ? u.attackOrder.isGround
              ? ' · Fire mission'
              : ` · Fire mission on <strong>${TargetIndicators.getTargetLabel(u.attackOrder)}</strong>`
            : ` · Attacking <strong>${TargetIndicators.getTargetLabel(u.attackOrder)}</strong>`
        : '';
      const cover = getCoverStatus(u);
      const inspired = isUnitInspiredByCommander(u, game?.units ?? []);
      const garrisoned = isUnitGarrisoned(u) || !!cover.garrisoned;
      const dig = game?.infantryTrenches?.getDiggerStatus?.(u);
      const engBuild = game?.engineerSandbags?.getEngineerBuildStatus?.(u);
      let coverBlock = '';
      if (garrisoned) {
        coverBlock = `<p class="unit-cover-status in-garrison"><strong>Inside building</strong> — garrisoned with heavy cover (takes only <strong>${Math.round((cover.mult ?? 0.12) * 100)}%</strong> damage). Order a <strong>move</strong> to exit. Armed lookouts remain visible at the windows beneath the green <strong>INSIDE</strong> marker.</p>`;
      } else if (engBuild) {
        coverBlock = `<p class="unit-support-status unit-building-status"><strong>Building ${engBuild.label}</strong> — ${engBuild.pct}% complete — watch the site marker on the map</p>`;
      } else if (dig) {
        coverBlock = `<p class="unit-support-status unit-building-status"><strong>${dig.label}</strong> — ${Math.round(dig.progress * 100)}% complete — watch the dig site marker</p>`;
      } else if (u._trenchId || cover.inTrench) {
        coverBlock = `<p class="unit-cover-status in-cover"><strong>In trench</strong> — dug in with cover (takes only <strong>${Math.round((cover.mult ?? 0.3) * 100)}%</strong> damage). Order a <strong>move</strong> to leave.</p>`;
      } else if (cover.inCover) {
        coverBlock = `<p class="unit-cover-status in-cover"><strong>In cover:</strong> ${cover.label} — takes only <strong>${Math.round(cover.mult * 100)}%</strong> of incoming damage (${cover.reduction}% reduction). Leave cover or destroy the position to lose protection.</p>`;
      } else if (u.def?.type === 'engineer') {
        const fieldWorks = game?.baseBuildings?.active
          ? 'can erect <strong>garrison bunkers</strong> and lay <strong>AT mines</strong> in the field.'
          : 'can erect <strong>sandbags</strong> or <strong>bunkers</strong> and lay <strong>AT mines</strong> — move infantry onto a bunker to garrison inside.';
        coverBlock = `<p class="unit-support-status">Combat engineer squad — rifles/SMGs; repairs vehicles within ~16 m; ${fieldWorks}</p>`;
      } else if (u.def?.type === 'medic') {
        const tent = game?.medicFieldHospitals?.getMedicDeployStatus?.(u);
        const tentLine = tent
          ? `<p class="unit-support-status unit-building-status"><strong>${tent.label}</strong> — ${tent.pct}% complete</p>`
          : '';
        coverBlock = `${tentLine}<p class="unit-support-status">Combat medic — heals nearby infantry; can <strong>deploy a field hospital tent</strong> that heals non-vehicle units in range.</p>`;
      } else if (u.def?.type === 'commander') {
        coverBlock = '<p class="unit-support-status">Field commander — can dig a fighting trench or move into a building/bunker for heavy cover.</p>';
      } else if (u.def?.type === 'radioOperator') {
        const binActive = (u._binocularActive ?? 0) > 0;
        const binCd = u._binocularCooldown ?? 0;
        let binLine = '';
        if (binActive) {
          binLine = ` <strong>Binoculars</strong> raised (${Math.ceil(u._binocularActive)}s) — support to ~1120 m; calling a strike ends the scan (3 min cooldown).`;
        } else if (binCd > 0) {
          const m = Math.floor(binCd / 60);
          const s = String(Math.ceil(binCd % 60)).padStart(2, '0');
          binLine = ` Binoculars ready in <strong>${m}:${s}</strong>.`;
        } else {
          binLine =
            ' Can raise <strong>binoculars</strong> (up to 45 s extended range; 3 min cooldown after calling support while scanning).';
        }
        coverBlock = `<p class="unit-support-status">Signals operator — rifle only; keeps off-map fire support and airborne calls available within ~720 m, with clear line of sight.${binLine} Can dig a fighting trench. Multiple radio operators can cover separate positions.</p>`;
      } else if (
        u.def?.type === 'infantry' ||
        u.def?.type === 'paratrooper' ||
        u.def?.type === 'machineGun' ||
        u.def?.type === 'sniper'
      ) {
        coverBlock =
          '<p class="unit-cover-status exposed"><strong>Exposed</strong> — dig a trench or move into sandbags / hedges for cover.</p>';
      }
      const surrenderBlock = u.surrendered
        ? '<p class="unit-surrender-status"><strong>Surrendered</strong> — move a friendly unit within ~11 m to liberate; enemy contact captures them.</p>'
        : '';
      const moraleBlock = inspired
        ? `<p class="unit-morale-status inspired"><strong>Inspired</strong> — within ${COMMANDER_AURA_RANGE} m of a living field commander; automatic retreat and surrender pressure is greatly reduced.</p>`
        : '';
      const riderN = canHostRiders(u.def?.type) ? getTankRiderIds(u).length : 0;
      const riderBlock =
        u._crewless
          ? '<p class="unit-support-status"><strong>CREWLESS — disabled</strong> — infantry or airborne from either side can capture this operational tank. Select a squad and RMB the vehicle; two troops take control and the rest ride on the hull.</p>'
          : u._replacementCrewUnitId
            ? `<p class="unit-support-status"><strong>Replacement crew aboard</strong> — two troops operate the tank; the remaining squad members ride on the hull${riderN > 1 ? ` with ${riderN - 1} additional rider unit${riderN > 2 ? 's' : ''}` : ''}.</p>`
            : riderN > 0
          ? `<p class="unit-support-status"><strong>${riderN} rider${riderN === 1 ? '' : 's'} aboard</strong> — RMB friendly infantry onto this tank to mount more; dismount when stationary.</p>`
          : canHostRiders(u.def?.type) && u.def?.type !== 'armoredCar'
            ? '<p class="unit-support-status">RMB with infantry selected to mount riders on this tank.</p>'
            : '';
      const mobilityBlock = u._mobilityDamaged
        ? `<p class="unit-support-status unit-mobility-status"><strong>${u._mobilityDamageKind === 'wheel' ? 'WHEEL DAMAGE' : 'BROKEN TRACK'} — IMMOBILE</strong> — keep a combat engineer within ~16 m to repair the running gear (${Math.round((u._mobilityRepairProgress ?? 0) * 100)}%). The weapon remains operational.</p>`
        : '';
      body.innerHTML = `
        <h3>${u.name}${
          garrisoned
            ? ' <span class="cover-tag garrison-tag">INSIDE</span>'
            : cover.inCover
              ? ' <span class="cover-tag">COVER</span>'
              : ''
        }${inspired ? ' <span class="cover-tag inspired-tag">INSPIRED</span>' : ''}${u.surrendered ? ' <span class="cover-tag">SURRENDERED</span>' : ''}${u._mobilityDamaged ? ' <span class="cover-tag">IMMOBILE</span>' : ''}</h3>
        ${hpBarMarkup(u.hp, u.maxHp)}
        <p class="selection-unit-meta">${u.def.designation} · Range ${rangeLabel} · Dmg ${u.def.damage}${coaxLine}${crewSmallArmsLine}${orderLine}</p>
        ${surrenderBlock}
        ${moraleBlock}
        ${mobilityBlock}
        ${riderBlock}
        ${coverBlock}
      `;
      this.updateEngineerBuild(game);
      this.updateArtilleryAutoFire(game);
      this.updateSmokeShell(game);
      this.updateTankRiderActions([u]);
      return;
    }

    this.updateEngineerBuild(game);
    this.updateArtilleryAutoFire(game);
    this.updateSmokeShell(game);
    this.updateTankRiderActions(units);

    const types = {};
    for (const u of units) types[u.type] = (types[u.type] || 0) + 1;
    const summary = Object.entries(types)
      .map(([t, n]) => `${n} ${PRODUCE_LABELS[t] ?? t}`)
      .join(', ');
    const attacking = units.filter((u) => u.attackOrder && !u.attackOrder.isGround && !u.attackOrder.dead);
    const uniqueTargets = [...new Set(attacking.map((u) => TargetIndicators.getTargetLabel(u.attackOrder)))];
    const orderNote =
      uniqueTargets.length === 1
        ? `<p class="selection-orders">Engaging: <strong>${uniqueTargets[0]}</strong></p>`
        : uniqueTargets.length > 1
          ? `<p class="selection-orders">Multiple targets (${uniqueTargets.length})</p>`
          : '';
    const totalHp = units.reduce((sum, u) => sum + u.hp, 0);
    const totalMax = units.reduce((sum, u) => sum + u.maxHp, 0);
    body.innerHTML = `
      <h3>${units.length} units selected</h3>
      ${hpBarMarkup(totalHp, totalMax, { showValues: true })}
      <p>${summary}</p>
      ${orderNote}
    `;
  }

  updateEngagementStance(units = []) {
    const wrap = this.root.querySelector('#engagement-stance-actions');
    const hold = this.root.querySelector('#btn-stance-hold');
    const pursue = this.root.querySelector('#btn-stance-pursue');
    const hint = this.root.querySelector('#engagement-stance-hint');
    if (!wrap || !hold || !pursue) return;

    const eligible = units.filter(
      (u) => !u.dead && !u.surrendered && !u.def?.nonCombat && (u.def?.damage ?? 0) > 0
    );
    wrap.classList.toggle('hidden', eligible.length === 0);
    if (!eligible.length) return;

    const holdCount = eligible.filter((u) => u.engagementStance !== 'pursue').length;
    const pursueCount = eligible.length - holdCount;
    const allHold = holdCount === eligible.length;
    const allPursue = pursueCount === eligible.length;
    hold.classList.toggle('armed', allHold);
    pursue.classList.toggle('armed', allPursue);
    hold.setAttribute('aria-pressed', String(allHold));
    pursue.setAttribute('aria-pressed', String(allPursue));
    if (hint) {
      hint.textContent = allPursue
        ? 'Attack orders close to weapon range and pursue targets that withdraw.'
        : allHold
          ? 'Attack orders close to weapon range, then hold position if the target withdraws.'
          : `Mixed stance — ${holdCount} holding, ${pursueCount} pursuing.`;
    }
  }

  hideTdBreachAlert() {
    const breachAlert = this.root.querySelector('#td-breach-alert');
    const breachCard = this.root.querySelector('#td-breach-alert-card');
    breachAlert?.classList.add('hidden');
    breachCard?.classList.remove('td-breach-alert-critical');
  }

  showEndOverlay(victory, message, report, canReplay = false) {
    const overlay = this.root.querySelector('#overlay-end');
    if (!overlay) return;

    this.hideTdBreachAlert();
    this.root.querySelector('#td-wave-countdown')?.classList.add('hidden');

    const titleEl = this.root.querySelector('#end-title');
    const msgEl = this.root.querySelector('#end-msg');
    const statsEl = this.root.querySelector('#end-stats');
    const replayBtn = this.root.querySelector('#btn-replay');

    overlay.classList.remove('hidden');
    if (titleEl) titleEl.textContent = victory ? 'Victory' : 'Defeat';
    if (msgEl) msgEl.textContent = message;

    if (statsEl && report) {
      this.updateEndStats(report);
    } else if (statsEl) {
      statsEl.classList.remove('hidden');
      statsEl.innerHTML = '<p class="end-stats-loading">Tallying casualties…</p>';
    }

    if (replayBtn) replayBtn.classList.toggle('hidden', !canReplay);
  }

  updateEndStats(report) {
    const statsEl = this.root.querySelector('#end-stats');
    if (!statsEl || !report) return;
    statsEl.classList.remove('hidden');
    statsEl.innerHTML = this.renderBattleReport(report);
  }

  renderBattleReport(report) {
    const listRows = (lines, emptyLabel) =>
      lines.length > 0
        ? lines
            .map(
              (l) =>
                `<li><span class="loss-type">${l.label}</span><span class="loss-n">${l.count}</span></li>`
            )
            .join('')
        : `<li class="loss-none">${emptyLabel}</li>`;

    const col = (
      side,
      {
        unitLines,
        unitTotal,
        defenseLines,
        defenseTotal,
        captureLines,
        captureTotal,
        hqLost,
        hqLabel,
        materielLabel,
        showDefenses = false,
      }
    ) => {
      const unitRows = listRows(unitLines, 'No unit losses');
      const hqRow = hqLost
        ? `<li class="loss-hq"><span class="loss-type">${hqLabel}</span><span class="loss-n">Destroyed</span></li>`
        : '';
      const defenseBlock = showDefenses
        ? `
          <p class="end-stats-subheading">Emplacements lost</p>
          <p class="end-stats-total">${defenseTotal} emplacement${defenseTotal === 1 ? '' : 's'} lost</p>
          <ul class="end-stats-list">${listRows(defenseLines, 'No emplacement losses')}</ul>
        `
        : '';
      const captureBlock =
        captureTotal > 0
          ? `
          <p class="end-stats-subheading">Prisoners taken</p>
          <p class="end-stats-total">${captureTotal} prisoner${captureTotal === 1 ? '' : 's'} captured</p>
          <ul class="end-stats-list">${listRows(captureLines, 'No prisoners taken')}</ul>
        `
          : '';
      return `
        <div class="end-stats-col">
          <h3>${side}</h3>
          <p class="end-stats-subheading">Casualties</p>
          <p class="end-stats-total">${unitTotal} ${unitTotal === 1 ? 'casualty' : 'casualties'}</p>
          <ul class="end-stats-list">${unitRows}${hqRow}</ul>
          ${captureBlock}
          ${defenseBlock}
          <p class="end-stats-materiel">
            <span class="end-stats-materiel-label">Est. materiel cost</span>
            <span class="end-stats-materiel-value">${materielLabel}</span>
          </p>
        </div>
      `;
    };

    const showPlayerDefenses =
      report.towerDefense || (report.playerDefenseTotal ?? 0) > 0;
    const tdEndlessBanner =
      report.tdEndless
        ? `<p class="end-stats-td-endless">Endless Tower Defence — <strong>${report.tdWavesCleared ?? 0}</strong> wave${(report.tdWavesCleared ?? 0) === 1 ? '' : 's'} cleared</p>`
        : '';

    return `
      ${tdEndlessBanner}
      <h3 class="end-stats-heading">Battle casualties</h3>
      <div class="end-stats-grid">
        ${col(report.playerName, {
          unitLines: report.playerLines,
          unitTotal: report.playerTotal,
          defenseLines: report.playerDefenseLines ?? [],
          defenseTotal: report.playerDefenseTotal ?? 0,
          captureLines: report.playerCaptureLines ?? [],
          captureTotal: report.playerCaptureTotal ?? 0,
          hqLost: report.playerHqLost,
          hqLabel: 'Headquarters',
          materielLabel: report.playerMaterielLabel,
          showDefenses: showPlayerDefenses,
        })}
        ${col(report.enemyName, {
          unitLines: report.enemyLines,
          unitTotal: report.enemyTotal,
          defenseLines: [],
          defenseTotal: 0,
          captureLines: report.enemyCaptureLines ?? [],
          captureTotal: report.enemyCaptureTotal ?? 0,
          hqLost: report.enemyHqLost,
          hqLabel: report.tutorial ? 'Practice HQ' : 'Headquarters',
          materielLabel: report.enemyMaterielLabel,
        })}
      </div>
      <p class="end-stats-footnote">${report.materielNote}</p>
    `;
  }

  hideEndOverlay({ clearStats = true } = {}) {
    this.root.querySelector('#overlay-end').classList.add('hidden');
    const statsEl = this.root.querySelector('#end-stats');
    if (!statsEl) return;
    if (clearStats) {
      statsEl.classList.add('hidden');
      statsEl.innerHTML = '';
    }
  }

  showPostMatchViewBar() {
    this.root.querySelector('#hud')?.classList.add('hud-post-match-view');
    this.root.querySelector('#post-match-view-bar')?.classList.remove('hidden');
    const tabletOn = this.tabletCamera?.shouldEnable() ?? isTabletLikeDevice();
    this.tabletCamera?.setVisible(tabletOn);
  }

  hidePostMatchViewBar() {
    this.root.querySelector('#hud')?.classList.remove('hud-post-match-view');
    this.root.querySelector('#post-match-view-bar')?.classList.add('hidden');
  }

  getSelectBoxEl() {
    return this.root.querySelector('#select-box');
  }
}
