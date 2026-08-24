import * as THREE from 'three';
import {
  FACTIONS,
  getEnemyFaction,
  STARTING_RESOURCES,
  ENEMY_STARTING_RESOURCES,
  HQ_INCOME_RATE,
  CAPTURE_POINT_INCOME,
} from '../data/factions.js';
import {
  TUTORIAL_STARTING_RESOURCES,
  PRACTICE_TARGET_HQ_HP,
  PRACTICE_TARGET_HQ_DAMAGE_MULT,
  BATTLE_OPENING_TIME,
  ASSAULT_STARTING_RESOURCES,
  ASSAULT_ENEMY_RESOURCES,
  isAssaultMode,
  resolveAssaultMapSize,
  isClearanceMode,
  isReinforcedClearanceMode,
  resolveClearanceReinforcementSize,
  resolveClearanceRole,
  resolveClearanceTimeLimitEnabled,
  isTowerDefenseMode,
  isLastStandMode,
  LAST_STAND_SUPPLIES,
  STANDARD_UNIT_LIMIT,
  TD_STARTING_POINTS,

  getProducibleUnits,
} from '../data/gameModes.js';
import { TD_HQ_DEFENSE_STARTING_SUPPLIES, isTdHqDefenseStyle } from '../data/towerDefense.js';
import {
  createLastStandState,
  updateLastStandEnemyDeploy,
  flushEnemyDeployment,
  assignLastStandEnemyStances,
  assignLastStandPresetStances,
  deployLastStandPresetForces,
  initLastStandPresetEngagement,
  isLastStandPresetForce,
  checkLastStandVictory,
  isLastStandDeployPhase,
  tryPlacePlayerUnit,
  countLastStandCombatUnits,
} from './LastStandMode.js';
import {
  isLastStandPresetDeployMode,
  resolveLastStandPresetSize,
  DEFAULT_LAST_STAND_PRESET_SIZE,
} from '../data/lastStandForces.js';
import {
  createTowerDefenseState,
  startNextWave,
  skipTowerDefensePrepare,
  updateTowerDefenseMode,
  updateTowerDefenseEnemyAI,
  checkTowerDefenseBreach,
  checkTowerDefenseVictory,
  rewardTowerDefenseKill,
  clampToPlayerSideOfFrontline,
  updateHqDefenseFrontlineRetreat,
  enforcePlayerFrontlineClamp,
} from './TowerDefenseMode.js';
import { DefenseStructureManager } from './DefenseStructures.js';
import { getFrontlineDef } from './AssaultMode.js';
import {
  spawnClearanceDefenders,
  checkClearanceVictory,
  getClearanceAttackerSpawnBase,
  getClearanceStagingAnchor,
  CLEARANCE_CEASEFIRE_TIME,
  CLEARANCE_DEFENDER_PREP_TIME,
  CLEARANCE_TIME_LIMIT,
  createClearanceReinforcementState,
  updateClearanceReinforcements,
  updateClearanceCounterattacks,
  pickClearanceAttackPlan,
  roleForClearanceAttackerType,
} from './ClearanceMode.js';
import {
  updateRetreatState,
  removeRetreatMarker,
  resolveRetreatHq,
  syncRetreatMarkers,
} from './RetreatBehavior.js';
import { updateMedicHealing } from './MedicBehavior.js';
import { updateHospitalHealing } from './HospitalBehavior.js';
import { updateMotorPoolHealing } from './MotorPoolBehavior.js';
import { updateEngineerHealing, updateEngineerHqRepair } from './EngineerBehavior.js';
import {
  spawnVehicleCrewBailout,
  updateVehicleBailouts,
} from './VehicleBailout.js';
import {
  ensureFieldCommanders,
  getFieldCommander,
  updateFieldCommanders,
} from './FieldCommander.js';
import { EngineerSandbagManager } from './EngineerSandbags.js';
import {
  InfantryTrenchManager,
  canDigTrenchType,
  updateTrenchVisuals,
} from './InfantryTrench.js';
import { MedicFieldHospitalManager } from './MedicFieldHospital.js';
import { BaseBuildingManager } from './BaseBuildingManager.js';
import { getGarrisonBunkerSources, updateBunkerGarrison } from './BunkerGarrison.js';
import { applyObstaclePath } from './MovePath.js';
import { dismountAllRiders, releaseFromTank, updateTankRiders } from './TankRiders.js';
import {
  isBaseBuildingCampaign,
  getPlayerProductionUnitTypes,
  getSpawnBuildingForUnit,
  canUseBaseBuildingOnMap,
  baseBuildingRequiresLargeMap,
} from '../data/baseBuildings.js';

const DESTROYED_GUN_BLAST_TYPES = new Set(['artillery', 'antiTankGun']);
const UNIT_SELECTION_SHORTCUTS = new Map([
  ['KeyE', { type: 'engineer', label: 'engineer' }],
  ['KeyM', { type: 'medic', label: 'medic' }],
  ['KeyA', { type: 'artillery', label: 'artillery' }],
  ['KeyR', { type: 'radioOperator', label: 'radio operator' }],
]);

function shellCraterTier(def) {
  if (def?.type === 'artillery' || (def?.caliber ?? 0) >= 105) return 'heavy';
  if ((def?.caliber ?? 999) <= 64) return 'light';
  return 'medium';
}

import { removeCoverMarker } from '../visual/CoverMarkers.js';
import { syncMoraleMarkers } from '../visual/MoraleMarkers.js';
import {
  preloadUnitFieldIcons,
  syncPlayerFieldIcons,
  syncUnitFieldIcon,
} from '../visual/UnitFieldIcons.js';
import { syncHealMarkers } from '../visual/HealMarkers.js';
import { getActiveHospitals } from './HospitalBehavior.js';
import { getActiveMotorPools } from './MotorPoolBehavior.js';
import { syncDamageSmoke, updateDamageSmoke } from '../visual/DamageSmoke.js';
import { syncUnitHealthBars } from '../visual/UnitHealthBars.js';
import { setUnitStatusMarkersVisible } from '../visual/UnitStatusVisibility.js';
import { updateSurrenderState, syncSurrenderMarkers } from './SurrenderBehavior.js';
import { updatePlayerHqThreat } from './HqThreatBehavior.js';
import { syncRankMarkers, updateRankMarkers } from './EliteBehavior.js';
import {
  createAssaultState,
  setupAssaultCapturePoints,
  getAssaultSpawnBases,
  updateAssaultTimers,
  checkAssaultVictory,
} from './AssaultMode.js';
import {
  buildFrontlineVisual,
  disposeFrontlineVisual,
  setFrontlineVisible as syncFrontlineVisual,
} from '../world/Frontline.js';
import {
  createCheatKeyBuffer,
  isCheatModeFromUrl,
  shouldIgnoreCheatKeyEvent,
} from './CheatMode.js';
import { buildCoverSites } from '../world/CoverSites.js';
import { isTabletLikeDevice, isTabletModeEnabled } from '../lib/tabletDetect.js';
import {
  CoverSystem,
  addVehicleWreckCover,
  removeVehicleWreckCover,
} from './CoverSystem.js';
import { canSeekCover, getSeekCoverEnabled } from './CoverSeek.js';
import { MAPS, buildMapDef } from '../data/maps.js';
import {
  getDeployRadius,
  getStagingMoveRadius,
  formatMapHudLabel,
  getMapSizeOptions,
  resolveMapSizeId,
} from '../data/mapSizes.js';
import { getDifficulty, DEFAULT_DIFFICULTY } from '../data/difficulty.js';
import {
  isCampaignMode,
  CAMPAIGN_BALANCE,
  applyCampaignUnitHp,
  getCampaignDifficulty,
  spreadCampaignCapturePoints,
} from '../data/campaignPace.js';
import { teamIsEliminated, estimateTeamIncomePerSec } from './EliminationRules.js';
import { buildTerrain, sampleTerrainHeight } from '../world/Terrain.js';
import { isUrbanCanalWater } from '../world/UrbanScenery.js';
import {
  disposeBattleScene,
  queueMeshDispose,
  flushDisposeQueueSync,
} from '../world/SceneDispose.js';
import { DestructibleScenery } from '../world/DestructibleScenery.js';
import {
  spawnTankWreckFire,
  spawnRecoverableWreckSmoke,
  updateWreckEffects,
  clearWreckEffects,
  removeWreckEffect,
} from '../effects/WreckEffects.js';
import {
  scheduleGunAmmoCookOff,
  triggerVehicleKillFx,
  updateVehicleCookOffs,
  clearVehicleCookOffs,
  isArmoredCombatVehicle,
} from '../effects/VehicleDestruction.js';
import { clearHqBurnEffects, updateHqBurnEffects } from '../effects/HqBurnEffects.js';
import {
  setupRenderer,
  setupSceneEnvironment,
  setupLighting,
  updateLightingForTarget,
  updateSkyForCamera,
} from '../world/SceneSetup.js';
import { applySceneEnvironment, disposeEnvironment } from '../world/EnvironmentMap.js';

import {
  spawnExplosion,
  spawnArtilleryExplosion,
  spawnArmorRicochet,
  spawnShellExplosion,
  spawnCollapseDust,
  spawnWaterImpact,
  prewarmImpactLightPrograms,
  updateCombatEffects,
  clearCombatEffects,
} from '../effects/CombatEffects.js';
import {
  spawnShellCasing,
  updateShellCasings,
  clearShellCasings,
} from '../effects/ShellCasings.js';
import { RangeRingManager } from '../visual/RangeRings.js';
import { TargetIndicators } from '../visual/TargetIndicators.js';
import {
  addExplosionCrater,
  clearTerrainDamage,
  flushTerrainNormals,
  prewarmMapCraterTextures,
  prewarmTerrainDamage,
} from '../world/TerrainDamage.js';
import { resolveUnitSpawnPosition, spawnArmy } from './Spawner.js';
import {
  ensureStartingRadioOperators,
  getRadioOperators,
  getRadioOperatorSupportRange,
  getRadioOperatorSupportRelayDestination,
  hasRadioOperator,
  activateRadioBinoculars,
  canUseRadioBinoculars,
  updateRadioOperatorBinoculars,
  canAddRadioOperator,
} from './RadioOperatorBehavior.js';
import {
  updateCombat,
  updateMovement,
  tickUnitCooldowns,
  clearPendingMortarImpacts,
  isSmallArmsFireType,
} from './Combat.js';
import {
  updateAI,
  updateAICommandSystems,
  updateAIOffMapSupport,
  resetAI,
} from './AI.js';
import {
  containTeamsToDeployZone,
  clampPointToHqZone,
  isPlayerStagingPhase,
  isEnemyStagingPhase,
  isBattleStagingPhase,
} from './OpeningDeployZone.js';
import { createDeployZoneRings, disposeDeployZoneRings } from '../visual/DeployZoneRing.js';
import { RTSController } from '../input/RTSController.js';
import {
  canManualFireOrder,
  isSmokeShellReady,
  resolveBattleCursor,
} from '../input/BattleCursor.js';
import { SmokeScreenManager } from './SmokeScreen.js';
import { isActiveManualFireMission } from './Targeting.js';
import { HQ } from './HQ.js';
import { createCapturePoints } from './CapturePoint.js';
import { ProductionManager } from './Production.js';
import { BattleStats } from './BattleStats.js';
import {
  sounds,
  resolveWeaponProfile,
  mgProfileForFaction,
  smgProfileForFaction,
  isInfantryUnitType,
  isVehicleCrewVoiceType,
  isMoveVoiceDue,
  unitVoiceClass,
} from '../audio/SoundManager.js';
import { isTankType } from '../units/VehicleTypes.js';
import { setActiveVehicleTheatre } from '../units/UnitTextures.js';
import { snapUnitYaw } from '../units/VehicleRotation.js';
import {
  applyUnitDeathVisual,
  applyVehicleWreckCrushVisual,
  updateDetachedCorpseFalls,
  clearDetachedCorpseFalls,
} from '../units/UnitMeshes.js';
import { updateInfantryWeaponPose } from '../units/InfantryVisuals.js';
import { FireSupportManager } from './FireSupport.js';
import { GeneralOrdersManager } from './GeneralOrders.js';
import {
  updateFireSupportEffects,
  clearFireSupportEffects,
  prewarmStrikeImpacts,
  prewarmStrafeAircraftAssets,
} from '../effects/FireSupportEffects.js';
import {
  updateParachuteDrops,
  clearParachuteEffects,
  clearActiveParachuteDrops,
} from '../effects/ParachuteEffects.js';
import {
  captureBattleSave,
  applyBattleSave,
  writeBattleSave,
  loadBattleSaveData,
  deleteBattleSave,
} from './BattleSave.js';
import { updateAutoBuild } from './AutoBuild.js';
import { getDebrisRetentionSeconds, readDifficultySetting } from './GameSettings.js';

const PLAYER_TEAM = 'player';
const ENEMY_TEAM = 'enemy';
const LARGE_BATTLE_SIM_PIXEL_RATIO = 1;
const LARGE_BATTLE_SIM_MOVEMENT_STEP = 1 / 30;
const LARGE_BATTLE_SIM_TACTICAL_VISUAL_STEP = 0.1;
const GARAND_CLIP_SIZE = 8;
const GARAND_PING_CHANCE = 0.58;
const TOWER_DEFENSE_AI_STEP = 0.1;

function pickUnitForVoice(units) {
  if (!units?.length) return null;
  const vehicle = units.find((unit) => isVehicleCrewVoiceType(unit?.def?.type));
  if (vehicle) return vehicle;
  const distinctive = units.find((unit) => {
    const voiceClass = unitVoiceClass(unit?.def?.type);
    return voiceClass && voiceClass !== 'infantry';
  });
  if (distinctive) return distinctive;
  return units[Math.floor(Math.random() * units.length)];
}

function pickUnitForMoveVoice(units) {
  if (!units?.length) return null;
  return (
    units.find(
      (unit) => isVehicleCrewVoiceType(unit?.def?.type) && isMoveVoiceDue(unit)
    ) ??
    units.find((unit) => {
      const voiceClass = unitVoiceClass(unit?.def?.type);
      return voiceClass && voiceClass !== 'infantry' && isMoveVoiceDue(unit);
    }) ??
    units.find((unit) => isMoveVoiceDue(unit))
  );
}

export class Game {
  constructor({ canvas, ui }) {
    this.canvas = canvas;
    this.ui = ui;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this._nativePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this._renderPixelRatio = this._nativePixelRatio;
    this.renderer.setPixelRatio(this._renderPixelRatio);
    setupRenderer(this.renderer);

    this.scene = new THREE.Scene();
    applySceneEnvironment(this.scene, this.renderer);
    this.clock = new THREE.Clock();
    this.running = false;
    this.gameOver = false;
    this.paused = false;
    this._endOverlayShown = false;
    this._pendingEnd = null;
    /** @type {{x:number,y:number,z:number,t:number,tier:string,unit?:object,done?:boolean}[]} */
    this._pendingCookOffs = [];
    this._teardownPending = false;
    this._hudUiAccum = 0;
    this._victoryCheckAccum = 0;
    this._captureUiAccum = 0;
    this._selectionUiAccum = 0;
    this._selectionUiKey = '';
    /** After an order, hide the selection info panel but keep units selected. */
    this._selectionPanelDismissed = false;
    /** Keyboard unit shortcuts keep a stable ordered cycle until selection changes. */
    this._unitSelectionCycle = null;
    this._unitSelectionShortcutApplying = false;
    this._highlightedRosterUnitId = null;
    this._healMarkerAccum = 0;
    this._combatBuildingTargets = [];
    this._hoverUiId = '';
    this._coverUiAccum = 0;
    this._terrainMesh = null;
    this._aliveUnits = [];
    this._playerAlive = [];
    this._enemyAlive = [];
    this._combatAccum = 0;
    this._deployUiAccum = 0;
    this._rosterUiAccum = 0;
    this._emptyFieldHandled = false;
    this._tabHidden = false;
    this._rafActive = false;
    this._rendererContextLost = false;
    this._postMatchRenderAccum = 0;
    this._renderPerformance = {
      frameTimeEma: 1 / 60,
      lowFpsFor: 0,
      samples: 0,
      baselineFps: 60,
      highFpsFor: 0,
      qualityCooldown: 0,
    };
    this._devRenderMetrics = import.meta.env.DEV
      ? { lastFrameAt: 0, frameTimeEma: 1 / 60, lastPublishAt: 0 }
      : null;
    this.viewingBattlefield = false;
    this._fireSupportUiAccum = 0;
    this._fieldIconUiAccum = 0;
    this._minimapUiAccum = 0;
    this._unitVisualSyncAccum = 0;
    this._largeBattleMovementAccum = 0;
    this._largeBattleTacticalVisualAccum = 0;
    this._towerDefenseAiAccum = 0;
    this._largeBattleSimulationPerfActive = false;
    this._tabletMode = isTabletModeEnabled();
    this.showUnitFieldIcons = true;
    this.showUnitStatus = true;
    this.seekCoverMode = true;
    this.radioOperatorAutoMove = this.ui?.radioOperatorAutoMove ?? true;
    this.pursueTargetsByDefault = this.ui?.pursueTargetsByDefault ?? false;
    this.artilleryAutoFire = this.ui?.artilleryAutoFire ?? true;
    this.autoBuildMode = false;
    this.showFrontline = true;
    this.showCapturePoints = true;
    this.debrisRetentionSeconds = Infinity;
    this.matchTime = 0;
    this._hqThreat = null;
    this._hqAlertPlayed = false;
    this.mapDef = null;
    this.units = [];
    this.hqs = [];
    this.capturePoints = [];
    this._deployZoneRings = [];
    this.coverSystem = null;
    this.scenery = null;
    this.selectedHq = null;
    this.selectedBaseBuilding = null;
    this.playerFaction = null;
    this.enemyFaction = null;
    this.gameMode = 'campaign';
    this.tutorial = false;
    this.clearance = false;
    this.clearanceRole = 'attack';
    this.clearanceTimeLimitEnabled = true;
    this.clearanceAttackPlan = null;
    this.clearanceOperational = null;
    this.clearanceReinforcements = null;
    this.assault = null;
    this.assaultRole = null;
    this.towerDefense = null;
    this.lastStand = null;
    this.defenses = null;
    this.difficulty = getDifficulty(DEFAULT_DIFFICULTY);
    this.lastSession = null;
    this.activeSaveId = null;
    this.resources = { player: STARTING_RESOURCES, enemy: ENEMY_STARTING_RESOURCES };
    this.battleStats = new BattleStats();

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.5, 500);
    this.cameraTarget = new THREE.Vector3(0, 0, 0);
    this.zoom = 36;
    this.zoomMin = 8;
    this.zoomMax = 100;
    /** Orbit angle around the look target (radians). */
    this.cameraYaw = Math.atan2(-0.52, 0.72);
    this._cameraGroundDirection = new THREE.Vector3();
    this.keys = {};
    this.cheatMode = isCheatModeFromUrl();
    this._cheatKeys = createCheatKeyBuffer();

    this.production = new ProductionManager({
      getFaction: (team) => (team === PLAYER_TEAM ? this.playerFaction : this.enemyFaction),
      getTeam: (team) => team,
      getUnlockedUnits: (team) => this.baseBuildings?.getUnlockedUnits(team),
      getPlayerProductionUnits: (team) => {
        if (team !== PLAYER_TEAM || !isBaseBuildingCampaign(this)) return null;
        return getPlayerProductionUnitTypes(this);
      },
      isProductionBlocked: (team) =>
        this.clearance
          ? true
          : team === PLAYER_TEAM
            ? isPlayerStagingPhase(this)
            : isEnemyStagingPhase(this),
      getUnitLimit: () => (this.gameMode === 'campaign' ? STANDARD_UNIT_LIMIT : null),
      getDeployedUnitCount: (team) =>
        this.units.reduce((count, unit) => {
          if (!unit || unit.dead || unit.team !== team) return count;
          if (unit.surrendered || unit._crewless || unit._captureExit) return count;
          if (unit.def?.type === 'commander') return count;
          return count + 1;
        }, 0),
      getUnits: () => this.units,
      getSpawnPos: (team, unitType) => {
        if (isBaseBuildingCampaign(this)) {
          const need = getSpawnBuildingForUnit(unitType);
          if (
            team === PLAYER_TEAM &&
            need &&
            this.selectedBaseBuilding &&
            !this.selectedBaseBuilding.destroyed &&
            this.selectedBaseBuilding.typeId === need
          ) {
            return {
              x: this.selectedBaseBuilding.x,
              z: this.selectedBaseBuilding.z,
            };
          }
          const fromBuilding = this.baseBuildings?.getSpawnPosition(team, unitType);
          if (fromBuilding) return fromBuilding;
          return null;
        }
        const fromBuilding = this.baseBuildings?.getSpawnPosition(team, unitType);
        if (fromBuilding) return fromBuilding;
        const hq = this.hqs?.find((h) => h.team === team);
        if (hq) {
          const p = hq.position;
          return { x: p.x, z: p.z };
        }
        return team === PLAYER_TEAM ? this.mapDef?.playerBase : this.mapDef?.enemyBase;
      },
      getScene: () => this.scene,
      getMapDef: () => this.mapDef,
      getScenery: () => this.scenery,
      onSpawn: (team, _unitType, unit) => {
        if (this.campaign && unit) applyCampaignUnitHp(unit);
        if (team === PLAYER_TEAM && unit?.def?.type === 'artillery') {
          unit.setAutoFire(this.artilleryAutoFire);
        }
        if (team === PLAYER_TEAM && unit) {
          unit.setEngagementStance(this.pursueTargetsByDefault ? 'pursue' : 'hold');
        }
        if (team === PLAYER_TEAM) {
          sounds.play('spawn');
          syncUnitFieldIcon(unit, this.showUnitFieldIcons);
        }
        this._rebuildUnitCaches();
      },
      onQueueChange: () => this.ui?.updateProduction(this),
    });

    this.rangeRings = new RangeRingManager(this.scene);
    this.targetIndicators = new TargetIndicators(this.scene);

    this.fireSupport = new FireSupportManager(this);
    this.enemyFireSupport = new FireSupportManager(this, ENEMY_TEAM);
    this.generalOrders = new GeneralOrdersManager(this);
    this.enemyGeneralOrders = new GeneralOrdersManager(this, ENEMY_TEAM);
    this.smokeScreens = new SmokeScreenManager(this);
    this.smokeShellTargeting = false;
    this.engineerSandbags = new EngineerSandbagManager(this);
    this.infantryTrenches = new InfantryTrenchManager(this);
    this.medicFieldHospitals = new MedicFieldHospitalManager(this);
    this.baseBuildings = new BaseBuildingManager(this);
    this._directionalPlacement = null;
    this._directionalPlacementMarker = null;
    this.campaignStyle = 'classic';

    this.controller = new RTSController({
      camera: this.camera,
      domElement: canvas,
      scene: this.scene,
      getUnits: () => this.units,
      getHqs: () => this.hqs,
      getScenery: () => this.scenery,
      getMapDef: () => this.mapDef,
      getTerrainMesh: () => this._terrainMesh,
      getPlayerTeam: () => PLAYER_TEAM,
      getPendingFireSupport: () =>
        this.running && !this.gameOver ? this.fireSupport.pending : null,
      getPendingFireSupportStrike: () =>
        this.running && !this.gameOver ? this.fireSupport.pendingStrike : null,
      getPendingSmokeShell: () =>
        this.running && !this.gameOver ? this.smokeShellTargeting : false,
      getPendingDefensePlacement: () =>
        this.running && !this.gameOver ? this.defenses?.getPending() : null,
      getPendingLastStandDeploy: () =>
        this.running && !this.gameOver && isLastStandDeployPhase(this)
          ? this.lastStand?.pendingType ?? null
          : null,
      getPendingSandbagPlacement: () => this.engineerSandbags?.getPending() ?? null,
      getPendingTrenchPlacement: () => this.infantryTrenches?.getPending() ?? null,
      getPendingMedicTentPlacement: () => this.medicFieldHospitals?.getPending() ?? null,
      getPendingBaseBuildingPlacement: () => this.baseBuildings?.getPending() ?? null,
      getBaseBuildingAttackTargets: () => {
        if (!this.running || this.gameOver || !this.baseBuildings?.active) return [];
        return this.baseBuildings
          .getAttackTargets()
          .filter((t) => t.team !== PLAYER_TEAM && !t.dead);
      },
      getIsTowerDefense: () =>
        isTowerDefenseMode(this.gameMode) &&
        this.running &&
        !this.gameOver &&
        !isTdHqDefenseStyle(this.towerDefense),
      getIsBaseBuildingMode: () => isBaseBuildingCampaign(this),
      pickPlayerBaseBuilding: (raycaster, pointer, camera) =>
        this.baseBuildings?.raycastPlayerEntry(raycaster, pointer, camera) ?? null,
      getDeployZoneActive: () => this._isPlayerDeployZoneActive(),
      getPaused: () => this.paused,
      getShiftHeld: () => !!(this.keys.ShiftLeft || this.keys.ShiftRight),
      clampDeployPoint: (x, z) => this._clampPlayerDeployPoint(x, z),
      onFireSupportTarget: (mode, x, z) => this.handleFireSupportTarget(mode, x, z),
      onSmokeShellTarget: (mode, x, z) => this.handleSmokeShellTarget(mode, x, z),
      onDefensePlacement: (mode, x, z) => this.handleDefensePlacement(mode, x, z),
      onLastStandPlacement: (mode, x, z) => this.handleLastStandPlacement(mode, x, z),
      onSandbagPlacement: (mode, x, z) => this.handleSandbagPlacement(mode, x, z),
      onTrenchPlacement: (mode, x, z) => this.handleTrenchPlacement(mode, x, z),
      onMedicTentPlacement: (mode, x, z) => this.handleMedicTentPlacement(mode, x, z),
      onBaseBuildingPlacement: (mode, x, z) => this.handleBaseBuildingPlacement(mode, x, z),
      onMoveOrder: (selected) => {
        this.cancelPendingConstructionPlacement(selected);
        this._cancelPendingRadioOperatorStrikeForUnits(selected);
      },
      onSelectionChange: (sel, hq = null, baseBuilding = null) => {
        this._cancelPendingRadioOperatorStrikeForUnits(sel);
        // Explicit re-select (click unit / box / HQ) brings the info panel back.
        this._selectionPanelDismissed = false;
        if (!this._unitSelectionShortcutApplying) this._unitSelectionCycle = null;
        this.selectedHq = hq;
        this.selectedBaseBuilding = baseBuilding;
        if (sel.length > 0) {
          sounds.play('select');
          const sample = pickUnitForVoice(sel);
          const factionId = sample?.faction?.id ?? this.playerFaction?.id;
          const pos = sample?.position
            ? { x: sample.position.x, z: sample.position.z }
            : null;
          // Infantry use the squad net; AFVs use a separate crew intercom pack.
          sounds.playUnitSelect(factionId, pos, {
            radio: true,
            unitType: sample?.def?.type,
          });
        } else if (hq || baseBuilding) {
          sounds.play('select');
        }
        this.ui?.updateSelection(sel, this.controller.hoveredTarget, hq, this);
        this.ui?.syncProductionPanel?.(this);
        this._syncUnitRoster();
        this._syncBattleCursor();
      },
      onHoverTarget: (target) => {
        const action = this.controller?.getEligibleVehicleEntrants(target).length > 0;
        this.targetIndicators?.setHoverTarget(target, { action });
        if (this._selectionPanelDismissed) return;
        const sel = this._playerAlive.filter((u) => u.selected);
        if (sel.length === 0) return;
        const hoverId = target
          ? `${target.id ?? ''}:${target.team ?? ''}:${target.dead ? 1 : 0}`
          : '';
        if (hoverId === this._hoverUiId) return;
        this._hoverUiId = hoverId;
        this._selectionUiKey = '';
        this.ui?.updateSelection(sel, target, this.selectedHq, this);
      },
      onOrder: (type, selected) => {
        this._cancelPendingRadioOperatorStrikeForUnits(selected);
        sounds.play('order');
        if (selected?.length && (type === 'attack' || type === 'move')) {
          if (type === 'attack') {
            const sample = pickUnitForVoice(selected);
            const factionId = sample?.faction?.id ?? this.playerFaction?.id;
            const pos = sample?.position
              ? { x: sample.position.x, z: sample.position.z }
              : null;
            sounds.playAttackOrder(factionId, pos, {
              radio: true,
              unitType: sample?.def?.type,
            });
          } else {
            const sample = pickUnitForMoveVoice(selected);
            if (sample) {
              const factionId = sample.faction?.id ?? this.playerFaction?.id;
              const pos = sample.position
                ? { x: sample.position.x, z: sample.position.z }
                : null;
              sounds.playMoveOrder(factionId, pos, {
                unitType: sample.def.type,
                unit: sample,
              });
            }
          }
        }
        // Hide the unit info panel after an order, but keep units selected so
        // follow-up move/attack orders still apply. Clicking a selected unit
        // re-shows the panel via onSelectionChange.
        this._dismissSelectionPanelAfterOrder();
        if (type === 'fire' || type === 'attack' || type === 'smoke' || type === 'move' || type === 'mount') {
          this.ui?.updateFireMissionControls(this._countActiveFireMissions());
          this.ui?.updateSmokeShell(this);
        }
        this._syncBattleCursor();
      },
      onBattleCursorChange: () => this._syncBattleCursor(),
      getCoverSystem: () => this.coverSystem,
      getSeekCoverMode: () => this.seekCoverMode,
      getGarrisonSources: () => this,
    });

    this._placementLayer = document.getElementById('placement-layer');
    this._onPlacementLayerDown = (e) => {
      if (e.button !== 2 || this.paused) return;
      e.preventDefault();
      this.controller.setPointerFromEvent(e);
      this.controller.issueMoveOrAttack();
    };
    this._onPlacementLayerUp = (e) => {
      if (e.button !== 0 || this.paused) return;
      if (this.defenses?.getPending()) {
        this.placeDefenseAtScreen(e.clientX, e.clientY);
        return;
      }
      if (this.engineerSandbags?.getPending()) {
        this.placeSandbagAtScreen(e.clientX, e.clientY);
        return;
      }
      if (this.infantryTrenches?.getPending()) {
        this.placeTrenchAtScreen(e.clientX, e.clientY);
        return;
      }
      if (this.medicFieldHospitals?.getPending()) {
        this.placeMedicTentAtScreen(e.clientX, e.clientY);
        return;
      }
      if (this.baseBuildings?.getPending()) {
        this.placeBaseBuildingAtScreen(e.clientX, e.clientY);
        return;
      }
      if (isLastStandDeployPhase(this) && this.lastStand?.pendingType) {
        this.placeLastStandAtScreen(e.clientX, e.clientY);
      }
    };
    this._onPlacementLayerMove = (e) => {
      if (this.paused || !this._directionalPlacement) return;
      const ground = this._screenToGround(e.clientX, e.clientY);
      if (!ground) return;
      const { kind } = this._directionalPlacement;
      if (kind === 'engineer') this.handleSandbagPlacement('preview', ground.x, ground.z);
      else if (kind === 'trench') this.handleTrenchPlacement('preview', ground.x, ground.z);
      else if (kind === 'base') this.handleBaseBuildingPlacement('preview', ground.x, ground.z);
    };
    this._onPlacementLayerContextMenu = (e) => e.preventDefault();
    this._placementLayer?.addEventListener('pointerdown', this._onPlacementLayerDown);
    this._placementLayer?.addEventListener('pointerup', this._onPlacementLayerUp);
    this._placementLayer?.addEventListener('pointermove', this._onPlacementLayerMove);
    this._placementLayer?.addEventListener('contextmenu', this._onPlacementLayerContextMenu);

    window.addEventListener('resize', () => this.onResize());
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    if (isTabletLikeDevice()) this._bindPinchZoom(canvas);
    window.addEventListener('keydown', (e) => {
      const selectionShortcut =
        e.ctrlKey && !e.metaKey && !e.altKey && !this._isTextInputFocused(e.target)
          ? UNIT_SELECTION_SHORTCUTS.get(e.code)
          : null;
      if (selectionShortcut && this.running && !this.gameOver) {
        // Keep selection shortcuts discrete so they never feed the held-key
        // camera movement path.
        this.keys[e.code] = false;
        e.preventDefault();
        if (!e.repeat) {
          const selected = this.selectNearestAvailablePlayerUnit(selectionShortcut.type);
          if (!selected) {
            this.ui?.showSaveToast?.(`No available ${selectionShortcut.label} unit.`);
          }
        }
        return;
      }
      this.keys[e.code] = true;
      this._onCheatKeyDown(e);
      if (
        this.running &&
        (e.code === 'ArrowUp' ||
          e.code === 'ArrowDown' ||
          e.code === 'ArrowLeft' ||
          e.code === 'ArrowRight' ||
          ((e.code === 'KeyA' || e.code === 'KeyD') &&
            (this.keys['ShiftLeft'] || this.keys['ShiftRight'])))
      ) {
        e.preventDefault();
      }
      if (e.code === 'Escape' && this.viewingBattlefield) {
        this.exitPostMatchView();
      }
      if (e.code === 'Escape' && this.generalOrders?.isActive()) {
        if (this.generalOrders.cancelActive()) {
          this.ui?.updateGeneralOrders(this.generalOrders);
        }
      }
      if (e.code === 'Escape' && this.fireSupport?.pending) {
        this.fireSupport.cancel();
        this.ui?.updateFireSupport(this.fireSupport);
      }
      if (e.code === 'Escape' && this.smokeShellTargeting) {
        this.cancelSmokeShellTargeting();
      }
      if (e.code === 'Escape' && this._countActiveFireMissions() > 0) {
        this.cancelAllFireMissions();
      }
      if (e.code === 'Escape' && this.defenses?.getPending()) {
        this.defenses.cancelPending();
        this.ui?.updateDefenses(this);
        this._syncPlacementCapture();
        this._syncBattleCursor();
      }
      if (e.code === 'Escape' && this.lastStand?.pendingType) {
        this.lastStand.pendingType = null;
        this.ui?.updateLastStandDeploy(this);
        this._syncPlacementCapture();
        this._syncBattleCursor();
      }
      if (e.code === 'Escape' && this.engineerSandbags?.getPending()) {
        this.engineerSandbags.cancel();
        this.ui?.updateEngineerBuild(this);
        this._syncPlacementCapture();
        this._syncBattleCursor();
      }
      if (e.code === 'Escape' && this.infantryTrenches?.getPending()) {
        this.infantryTrenches.cancel();
        this.ui?.updateInfantryTrench(this);
        this._syncPlacementCapture();
        this._syncBattleCursor();
      }
      if (e.code === 'Escape' && this.medicFieldHospitals?.getPending()) {
        this.medicFieldHospitals.cancel();
        this.ui?.updateMedicTent(this);
        this._syncPlacementCapture();
        this._syncBattleCursor();
      }
      if (e.code === 'Escape' && this.baseBuildings?.getPending()) {
        this.baseBuildings.cancelPending();
        this.ui?.updateBaseBuild(this);
        this._syncPlacementCapture();
        this._syncBattleCursor();
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this._syncBattleCursor();
      if (
        e.code === 'KeyP' &&
        !e.repeat &&
        !this._isTextInputFocused(e.target)
      ) {
        e.preventDefault();
        this.togglePause();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this._syncBattleCursor();
    });

    this.onResize();
    this._bindRendererRecovery();
    this.animate = this.animate.bind(this);
    document.addEventListener('visibilitychange', () => {
      this._tabHidden = document.hidden;
      if (!this._tabHidden && this.mapDef) this._startRenderLoop();
      else if (this._tabHidden) this._stopRenderLoop();
    });
  }

  _startRenderLoop() {
    this._rafActive = true;
    this.clock.getDelta();
    requestAnimationFrame(this.animate);
  }

  _stopRenderLoop() {
    this._rafActive = false;
  }

  /**
   * A GPU reset can leave WebGL alive while the first restored frame uses an
   * incomplete shadow/material state. Re-assert the renderer contract and
   * force the scene resources through Three.js' rebuilt context on restore.
   */
  _bindRendererRecovery() {
    this.canvas.addEventListener('webglcontextlost', (event) => {
      // Three.js also installs a handler, but keeping our own flag prevents
      // the game from treating the lost frame as a valid visual update.
      this._rendererContextLost = true;
      event.preventDefault();
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this._rendererContextLost = false;
      setupRenderer(this.renderer);
      this.renderer.setPixelRatio(this._renderPixelRatio);
      this.onResize();
      // The IBL is a generated render target with no CPU-side pixels to
      // re-upload after a GPU reset; regenerate it before rebuilding materials.
      disposeEnvironment(this.scene);
      applySceneEnvironment(this.scene, this.renderer);

      // Context restoration rebuilds Three.js' program/texture caches. Mark
      // live materials for a clean recompile so a stale shadow/light variant
      // cannot survive the reset as a low-contrast battlefield.
      this.scene.traverse((object) => {
        const materials = Array.isArray(object.material)
          ? object.material
          : object.material
            ? [object.material]
            : [];
        for (const material of materials) {
          material.needsUpdate = true;
          for (const key of ['map', 'alphaMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'bumpMap']) {
            if (material[key]) material[key].needsUpdate = true;
          }
        }
      });
      if (this.lights?.sun) {
        this.lights.sun.castShadow = !this._largeBattleSimulationPerfActive;
        this.lights.sun.shadow.needsUpdate = true;
      }
      this.renderer.shadowMap.needsUpdate = true;
      updateLightingForTarget(this.lights, this.cameraTarget.x, this.cameraTarget.z);
      this._bootstrapBattleView();
    });
  }

  /** Sync canvas size and draw one frame so restores never show a blank battlefield. */
  _bootstrapBattleView() {
    this.onResize();
    if (!this.mapDef) return;
    this._clampCameraTarget();
    this._updateCameraFromTarget();
    updateSkyForCamera(this.scene, this.cameraTarget.x, this.cameraTarget.z);
    updateLightingForTarget(this.lights, this.cameraTarget.x, this.cameraTarget.z);
    this._renderFrame();
  }

  _clampCameraTarget() {
    if (!this.mapDef) return;
    const half = this.mapDef.size / 2 - 5;
    this.cameraTarget.x = THREE.MathUtils.clamp(this.cameraTarget.x, -half, half);
    this.cameraTarget.z = THREE.MathUtils.clamp(this.cameraTarget.z, -half, half);
    this.zoom = THREE.MathUtils.clamp(this.zoom, this.zoomMin, this.zoomMax);
    if (!Number.isFinite(this.cameraYaw)) {
      this.cameraYaw = Math.atan2(-0.52, 0.72);
    }
  }

  onResize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w <= 0 || h <= 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _setRenderPixelRatio(value) {
    const minRatio = Math.min(1, this._nativePixelRatio);
    const next = THREE.MathUtils.clamp(value, minRatio, this._nativePixelRatio);
    if (Math.abs(next - this._renderPixelRatio) < 0.04) return false;
    this._renderPixelRatio = next;
    this.renderer.setPixelRatio(next);
    this.onResize();
    return true;
  }

  _isLargeBattleSimulation() {
    return (
      !!this.lastStand &&
      isLastStandPresetForce(this) &&
      this.lastStand.presetSize === 'large'
    );
  }

  _configureLargeBattleSimulationPerformance() {
    const active = this._isLargeBattleSimulation();
    this._largeBattleSimulationPerfActive = active;
    this._largeBattleMovementAccum = 0;
    this._largeBattleTacticalVisualAccum = 0;
    if (!active) return;

    // The 68-v-68 preset is the only mode that needs this dedicated budget.
    // At its normal wide camera distance, a 1x drawing buffer retains useful
    // battlefield detail without paying the full Retina fill-rate cost.
    this._setRenderPixelRatio(
      Math.min(this._nativePixelRatio, LARGE_BATTLE_SIM_PIXEL_RATIO)
    );
    if (this.lights?.sun) {
      // Scenery plus 136 combined-arms units otherwise requires a second
      // multi-thousand-call scene render every frame. Directional/ambient
      // lighting stays intact; only the dynamic sun shadow pass is omitted.
      this.lights.sun.castShadow = false;
    }
  }

  _bindPinchZoom(canvas) {
    let lastPinchDist = 0;

    const pinchDist = (touches) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };

    canvas.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 2) {
          lastPinchDist = pinchDist(e.touches);
        }
      },
      { passive: true }
    );

    canvas.addEventListener(
      'touchmove',
      (e) => {
        if (!this._tabletMode || (!this.running && !this.viewingBattlefield) || e.touches.length !== 2) return;
        const dist = pinchDist(e.touches);
        if (lastPinchDist > 0) {
          const delta = (lastPinchDist - dist) * 0.045;
          this.zoom = THREE.MathUtils.clamp(this.zoom + delta, this.zoomMin, this.zoomMax);
        }
        lastPinchDist = dist;
        e.preventDefault();
      },
      { passive: false }
    );

    canvas.addEventListener(
      'touchend',
      (e) => {
        if (e.touches.length < 2) lastPinchDist = 0;
      },
      { passive: true }
    );
  }

  onWheel(e) {
    if (!this.running && !this.viewingBattlefield) return;
    e.preventDefault();
    let step;
    if (e.deltaMode === 1) {
      step = e.deltaY * 0.42;
    } else if (e.deltaMode === 2) {
      step = Math.sign(e.deltaY) * 14;
    } else {
      step = e.deltaY * 0.09;
    }
    step = THREE.MathUtils.clamp(step, -12, 12);
    this.zoom = THREE.MathUtils.clamp(this.zoom + step, this.zoomMin, this.zoomMax);
  }

  startGame(factionId, mapId, gameMode = 'campaign', options = {}) {
    // Drop any in-flight mortar bombs before teardown/rebuild so a delayed
    // detonation cannot land in the new match's spawn area.
    clearPendingMortarImpacts();
    sounds.enterBattle();
    sounds.unlock();
    void sounds.primeForCombat();
    const restoreSnapshot = options.restoreSnapshot ?? null;
    this.debrisRetentionSeconds = getDebrisRetentionSeconds();
    this.pursueTargetsByDefault = this.ui?.pursueTargetsByDefault ?? false;
    this.artilleryAutoFire = this.ui?.artilleryAutoFire ?? true;
    const startOptions = { ...options };
    delete startOptions.restoreSnapshot;
    const clearanceTimeLimitEnabled = isClearanceMode(gameMode)
      ? resolveClearanceTimeLimitEnabled(startOptions)
      : false;
    if (isClearanceMode(gameMode)) {
      startOptions.clearanceTimeLimitEnabled = clearanceTimeLimitEnabled;
    }
    this.stopGame();
    if (!restoreSnapshot) this.activeSaveId = null;
    this.lastSession = {
      factionId,
      mapId,
      gameMode,
      options: startOptions,
    };
    this.gameMode = gameMode;
    this.tutorial = gameMode === 'tutorial';
    this.clearance = isClearanceMode(gameMode);
    this.clearanceRole = this.clearance ? resolveClearanceRole(startOptions) : 'attack';
    this.clearanceTimeLimitEnabled = this.clearance ? clearanceTimeLimitEnabled : false;
    this.clearanceAttackPlan = null;
    this.clearanceOperational = null;
    this.clearanceReinforcements = createClearanceReinforcementState(
      isReinforcedClearanceMode(gameMode, startOptions),
      resolveClearanceReinforcementSize(startOptions)
    );
    this.towerDefense = isTowerDefenseMode(gameMode);
    this.lastStand = isLastStandMode(gameMode)
      ? createLastStandState(
          startOptions.lastStandDeployMode ?? 'manual',
          resolveLastStandPresetSize(
            startOptions.lastStandPresetSize ?? DEFAULT_LAST_STAND_PRESET_SIZE,
            // Map id is enough to block Large on Berlin before mapDef is built.
            mapId
          )
        )
      : null;
    this.campaign = isCampaignMode(gameMode);
    let campaignStyle = this.campaign ? (startOptions.campaignStyle ?? 'classic') : 'classic';
    this.assaultRole = startOptions.assaultRole ?? 'defend';
    this.difficulty = getDifficulty(startOptions.difficulty ?? readDifficultySetting());
    this.playerFaction = FACTIONS[factionId];
    // Theater match is mode-agnostic: every operation uses the same historical opponent.
    // Setup may pass a rolled Allied nation (Normandy / Italy / Berlin as Germany).
    this.enemyFaction = getEnemyFaction(factionId, mapId, startOptions.enemyFactionId);
    sounds.preloadEndMusic(factionId);
    let mapSizeId = startOptions.mapSize ?? 'medium';
    if (isAssaultMode(gameMode)) {
      mapSizeId = resolveAssaultMapSize(mapSizeId);
    }
    const mapBase = MAPS[mapId];
    const mapAllowsLarge = getMapSizeOptions(mapBase).includes('large');
    // Forward Bases needs Large. Berlin cannot field Large, so fall back to Central Command.
    if (this.campaign && baseBuildingRequiresLargeMap(campaignStyle)) {
      if (mapAllowsLarge) mapSizeId = 'large';
      else campaignStyle = 'classic';
    }
    mapSizeId = resolveMapSizeId(mapBase, mapSizeId);
    if (campaignStyle === 'baseBuilding' && !canUseBaseBuildingOnMap(mapSizeId)) {
      campaignStyle = 'classic';
    }
    this.campaignStyle = campaignStyle;
    this.mapDef = buildMapDef(mapBase, mapSizeId);
    if (this.campaign) {
      this.mapDef = spreadCampaignCapturePoints(this.mapDef);
    }
    // Clamp preset size after mapDef exists (Berlin / urban cannot field Large).
    if (this.lastStand && isLastStandPresetDeployMode(this.lastStand.deployMode)) {
      this.lastStand.presetSize = resolveLastStandPresetSize(
        this.lastStand.presetSize ?? DEFAULT_LAST_STAND_PRESET_SIZE,
        this.mapDef
      );
    }
    setActiveVehicleTheatre(this.mapDef.id);
    const mapScale = this.mapDef.sizeScale ?? 1;
    this.zoomMax = Math.round(100 * mapScale);
    const assault = isAssaultMode(gameMode);
    const enemyBaseRes = assault ? ASSAULT_ENEMY_RESOURCES : ENEMY_STARTING_RESOURCES;
    this.resources = {
      player: this.lastStand
        ? isLastStandPresetDeployMode(this.lastStand.deployMode)
          ? 0
          : LAST_STAND_SUPPLIES
        : this.tutorial
          ? TUTORIAL_STARTING_RESOURCES
          : this.towerDefense
            ? (startOptions.tdStyle === 'hqDefense'
                ? TD_HQ_DEFENSE_STARTING_SUPPLIES
                : TD_STARTING_POINTS)
            : this.clearance
              ? 0
              : assault
                ? ASSAULT_STARTING_RESOURCES
                : this.campaign
                  ? CAMPAIGN_BALANCE.playerStartingResources
                  : STARTING_RESOURCES,
      enemy: this.lastStand
        ? isLastStandPresetDeployMode(this.lastStand.deployMode)
          ? 0
          : LAST_STAND_SUPPLIES
        : this.tutorial || this.clearance || this.towerDefense
          ? 0
          : Math.floor(
              (this.campaign ? CAMPAIGN_BALANCE.enemyStartingResources : enemyBaseRes) *
                this.difficulty.enemyResourceMult
            ),
    };
    this.production.reset();
    this.production.setBuildTimeMult(this.campaign ? CAMPAIGN_BALANCE.buildTimeMult : 1);
    this.production.setCheatMode(this.cheatMode);
    this.battleStats.reset();
    this._battleStatsFinalized = false;
    this.fireSupport.reset();
    this.enemyFireSupport.reset();
    this.generalOrders.reset();
    this.enemyGeneralOrders.reset();
    this.smokeScreens.reset();
    this.smokeShellTargeting = false;
    this._clearDirectionalPlacement();
    this.engineerSandbags.reset();
    this.infantryTrenches?.reset();
    this.medicFieldHospitals?.reset();
    this.baseBuildings.reset();
    if (isBaseBuildingCampaign(this)) {
      this.baseBuildings.enable();
    }

    setupRenderer(this.renderer);
    this._setRenderPixelRatio(this._nativePixelRatio);
    setupSceneEnvironment(this.scene, this.mapDef, this.renderer);
    this.lights = setupLighting(this.scene, this.mapDef);
    this._configureLargeBattleSimulationPerformance();

    this.scenery = new DestructibleScenery(this.scene, this.mapDef, () => this._terrainMesh);
    this.coverSystem = new CoverSystem([]);
    this.scenery.setCoverSystem(this.coverSystem);
    const terrain = buildTerrain(this.mapDef, this.scene, this.scenery);
    this._terrainMesh = terrain?.ground ?? null;
    prewarmTerrainDamage(this._terrainMesh);
    prewarmMapCraterTextures(this.renderer, this.mapDef);
    // Warm shared artillery textures and shader programs during general setup;
    // exact crater variants are still queued from known impacts during warning.
    prewarmStrikeImpacts(this.renderer, this.mapDef, [], false, this.scene, true);
    prewarmStrafeAircraftAssets(this.renderer, [
      this.playerFaction?.id,
      this.enemyFaction?.id,
    ], this.scene, true);
    const coverZones = buildCoverSites(
      this.mapDef,
      this.scene,
      this.scenery,
      {
        player: this.playerFaction,
        enemy: this.enemyFaction,
      },
      { towerDefense: this.towerDefense }
    );
    for (const zone of coverZones) {
      this.coverSystem.addZone(zone.x, zone.z, zone.type);
    }

    let playerBasePos = this.mapDef.playerBase;
    let enemyBasePos = this.mapDef.enemyBase;
    const playerName = this.playerFaction?.name ?? 'Friendly';
    const enemyName = this.enemyFaction?.name ?? 'Enemy';
    let playerHqLabel = `${playerName} HQ`;
    let enemyHqLabel = this.tutorial ? `Practice Target — ${enemyName}` : `${enemyName} HQ`;

    if (assault) {
      const bases = getAssaultSpawnBases(this.mapDef);
      playerBasePos = this.assaultRole === 'attack' ? bases.attackerBase : bases.defenderBase;
      enemyBasePos = this.assaultRole === 'attack' ? bases.defenderBase : bases.attackerBase;
      playerHqLabel = this.assaultRole === 'attack' ? `${playerName} Assault HQ` : `${playerName} Defensive HQ`;
      enemyHqLabel = this.assaultRole === 'attack' ? `${enemyName} Defensive HQ` : `${enemyName} Assault HQ`;
      buildFrontlineVisual(this.mapDef, this.scene);
    } else if (this.towerDefense) {
      this.assault = null;
      playerHqLabel = `${playerName} Sector HQ`;
      buildFrontlineVisual(this.mapDef, this.scene);
    } else {
      this.assault = null;
    }

    const hqHp = this.campaign ? CAMPAIGN_BALANCE.hqMaxHp : 800;
    this.hqs = [];
    if (!this.lastStand) {
      if (!this.clearance) {
        this.hqs.push(
          new HQ({
            team: PLAYER_TEAM,
            position: playerBasePos,
            mapDef: this.mapDef,
            scene: this.scene,
            label: playerHqLabel,
            maxHp: hqHp,
            faction: this.playerFaction,
          })
        );
      }
      if (!this.clearance && !this.towerDefense) {
        this.hqs.push(
          new HQ({
            team: ENEMY_TEAM,
            position: enemyBasePos,
            mapDef: this.mapDef,
            scene: this.scene,
            label: enemyHqLabel,
            maxHp: this.tutorial ? PRACTICE_TARGET_HQ_HP : hqHp,
            faction: this.enemyFaction,
          })
        );
      }
    }

    this.capturePoints =
      this.lastStand || this.clearance ? [] : createCapturePoints(this.mapDef, this.scene);

    if (assault) {
      this.assault = createAssaultState({
        playerRole: this.assaultRole,
        mapDef: this.mapDef,
        capturePoints: this.capturePoints,
      });
      setupAssaultCapturePoints(this.capturePoints, this.mapDef, this.assault.defenderTeam);
    } else if (this.towerDefense) {
      const tdStyle =
        restoreSnapshot?.towerDefense?.style ?? startOptions.tdStyle ?? 'emplacements';
      const tdHqDefense = tdStyle === 'hqDefense';
      for (const cp of this.capturePoints) {
        cp.owner = null;
        cp.progress = 0;
        cp.group.visible = false;
      }
      if (!restoreSnapshot) {
        this.towerDefense = createTowerDefenseState({
          mapDef: this.mapDef,
          difficulty: this.difficulty,
          waveMode: startOptions.tdWaveMode ?? 'standard',
          style: tdStyle,
        });
        startNextWave(this.towerDefense);
      }
      if (!tdHqDefense) {
        this.defenses = new DefenseStructureManager({
          scene: this.scene,
          mapDef: this.mapDef,
          getEnemyUnits: () => this._enemyAlive,
          getTerrainMesh: () => this._terrainMesh,
          getScenery: () => this.scenery,
          getAllUnits: () => this._aliveUnits,
          getHqs: () => this.hqs,
          getRetreatOptions: () => ({
            generalOrders: {
              player: this.generalOrders,
              enemy: this.enemyGeneralOrders,
            },
            clearance: !!this.clearance,
            clearanceRole: this.clearanceRole,
            mapDef: this.mapDef,
            scenery: this.scenery,
          }),
          factionId: this.playerFaction?.id ?? 'germany',
          factionAccent: this.playerFaction?.accent ?? 0xc9a227,
          onChange: () => {
            this.ui?.updateDefenses(this);
            this._syncPlacementCapture();
          },
          onFireTrace: (shot) => this.ui?.recordMinimapFire?.(shot),
        });
        this.defenses.setFrontlineAxis(
          getFrontlineDef(this.mapDef),
          this.mapDef.playerBase
        );
      }
    } else if (this.tutorial) {
      for (const cp of this.capturePoints) {
        cp.owner = null;
        cp.progress = 0;
      }
    } else if (this.lastStand) {
      for (const cp of this.capturePoints) {
        cp.owner = null;
        cp.progress = 0;
      }
    } else {
      for (const cp of this.capturePoints) {
        cp.owner = null;
        cp.progress = 0;
      }
    }
    for (const cp of this.capturePoints) cp._updateVisuals();

    const playerRoster = assault
      ? this.assaultRole === 'attack'
        ? 'assaultAttack'
        : 'assaultDefend'
      : null;
    const enemyRoster = assault
      ? this.assaultRole === 'attack'
        ? 'assaultDefend'
        : 'assaultAttack'
      : null;

    const playerAttacksClearance = this.clearance && this.clearanceRole !== 'defend';
    const clearanceAttackerBase = this.clearance
      ? getClearanceAttackerSpawnBase(this.mapDef)
      : null;

    const baseBuildingCampaign = this.campaignStyle === 'baseBuilding';
    this.units = [];
    if (
      !restoreSnapshot &&
      !this.towerDefense &&
      !this.lastStand
    ) {
      if (this.clearance && !playerAttacksClearance) {
        // Player defends: dig-in force for player, AI assault from rear assembly.
        this.clearanceAttackPlan = pickClearanceAttackPlan();
        const attackers = spawnArmy({
          faction: this.enemyFaction,
          team: ENEMY_TEAM,
          base: clearanceAttackerBase,
          scene: this.scene,
          offsetSign: 1,
          clearanceSpawn: true,
          mapDef: this.mapDef,
          enemyArmyMult: this.difficulty.enemyArmyMult,
          scenery: this.scenery,
        });
        for (const u of attackers) {
          u.clearanceAttackRole = roleForClearanceAttackerType(u.def?.type);
        }
        this.units.push(...attackers);
        this.units.push(
          ...spawnClearanceDefenders({
            faction: this.playerFaction,
            team: PLAYER_TEAM,
            scene: this.scene,
            mapDef: this.mapDef,
            capturePoints: this.capturePoints,
            enemyArmyMult: 1,
            attackerUnits: attackers,
            scenery: this.scenery,
          })
        );
      } else {
        this.units = spawnArmy({
          faction: this.playerFaction,
          team: PLAYER_TEAM,
          base: clearanceAttackerBase ?? playerBasePos,
          scene: this.scene,
          offsetSign: assault && this.assaultRole === 'attack' ? -1 : 1,
          tutorial: this.tutorial,
          roster: playerRoster,
          clearanceSpawn: this.clearance,
          mapDef: this.mapDef,
          campaign: this.campaign,
          baseBuilding: baseBuildingCampaign,
          scenery: this.scenery,
        });
        if (this.clearance) {
          this.units.push(
            ...spawnClearanceDefenders({
              faction: this.enemyFaction,
              team: ENEMY_TEAM,
              scene: this.scene,
              mapDef: this.mapDef,
              capturePoints: this.capturePoints,
              enemyArmyMult: this.difficulty.enemyArmyMult,
              attackerUnits: this.units,
              scenery: this.scenery,
            })
          );
        }
      }
    }

    if (
      !this.clearance &&
      !this.tutorial &&
      !this.towerDefense &&
      !this.lastStand &&
      !restoreSnapshot
    ) {
      const enemyArmyScale =
        this.difficulty.enemyArmyMult *
        (this.campaign ? CAMPAIGN_BALANCE.enemyArmyMult : 1);
      this.units.push(
        ...spawnArmy({
          faction: this.enemyFaction,
          team: ENEMY_TEAM,
          base: enemyBasePos,
          scene: this.scene,
          offsetSign: assault && this.assaultRole === 'attack' ? 1 : -1,
          roster: enemyRoster,
          enemyArmyMult: enemyArmyScale,
          mapDef: this.mapDef,
          campaign: this.campaign,
          baseBuilding: baseBuildingCampaign,
          scenery: this.scenery,
        })
      );
    }

    if (this.campaign) applyCampaignUnitHp(this.units);

    if (this.lastStand && !restoreSnapshot) {
      if (isLastStandPresetForce(this)) {
        deployLastStandPresetForces(this);
      }
      // Preset: full briefing. Manual: roll a battle plan for like-for-like AI tactics.
      initLastStandPresetEngagement(this);
    }

    for (const u of this.units) {
      u._mapDef = this.mapDef;
      u._terrainMesh = this._terrainMesh;
      u.position.y = sampleTerrainHeight(u.position.x, u.position.z, this.mapDef);
    }
    if (!restoreSnapshot) this._applyArtilleryAutoFireDefault(this.units);

    if (this.lastStand && isLastStandPresetForce(this) && !restoreSnapshot) {
      this._rebuildUnitCaches();
    }

    const camFocus =
      this.clearance && this.clearanceRole === 'defend'
        ? this.mapDef.frontline ?? this.mapDef.enemyBase ?? playerBasePos
        : clearanceAttackerBase ?? playerBasePos;
    const enemyFocus = this.tutorial || this.towerDefense
      ? this.mapDef.enemyBase
      : this.clearance
        ? this.clearanceRole === 'defend'
          ? clearanceAttackerBase ?? playerBasePos
          : this.mapDef.enemyBase
        : enemyBasePos;
    if (restoreSnapshot) {
      if (!applyBattleSave(this, restoreSnapshot)) {
        this.stopGame();
        return false;
      }
      this._clampCameraTarget();
      this._updateCameraFromTarget();
      updateSkyForCamera(this.scene, this.cameraTarget.x, this.cameraTarget.z);
    } else {
      this._setupBattleCamera(camFocus, enemyFocus);
      updateSkyForCamera(this.scene, this.cameraTarget.x, this.cameraTarget.z);
      this._faceUnitsToward(this.units.filter((u) => u.team === PLAYER_TEAM), enemyFocus);
      this._faceUnitsToward(this.units.filter((u) => u.team === ENEMY_TEAM), camFocus);
    }
    this._relocateEmbeddedCrewServedGuns();
    this._rosterKey = '';

    const deployTeams = restoreSnapshot ? this._getDeployZoneTeamsAt(this.matchTime) : this._getDeployZoneTeamsAt(0);
    const deployRadius = getDeployRadius(this.mapDef);
    const stagingMoveRadius = getStagingMoveRadius(this.mapDef);
    if (deployTeams.length) {
      if (!restoreSnapshot) {
        containTeamsToDeployZone(
          this.units,
          this.hqs,
          this.mapDef,
          deployTeams,
          deployRadius,
          stagingMoveRadius
        );
      }
      this._showDeployZoneRings(deployTeams);
    }
    ensureFieldCommanders(this);
    // All modes with a pre-deployed force retain a radio link even when an old
    // save or a custom roster predates the radio-operator unit.
    if (!this.lastStand || isLastStandPresetForce(this)) {
      ensureStartingRadioOperators(
        this,
        this.tutorial ||
          (this.towerDefense && !isTdHqDefenseStyle(this.towerDefense))
          ? [PLAYER_TEAM]
          : [PLAYER_TEAM, ENEMY_TEAM]
      );
    }
    if (!restoreSnapshot) {
      this._applyEngagementStanceDefault(this.units);
    }

    if (!restoreSnapshot) {
      this._clearanceDefenderNextWorksAt = 0;
      resetAI(
        0,
        this.tutorial || this.towerDefense || this.lastStand ? 0 : 5,
        this.clearance && this.clearanceRole !== 'defend' ? 0 : 24
      );
    }
    this.running = true;
    this.gameOver = false;
    if (!restoreSnapshot) {
      this.paused = false;
      this.ui?.setGamePaused(false);
    }
    this._endOverlayShown = false;
    this._pendingEnd = null;
    this._pendingCookOffs = [];
    clearPendingMortarImpacts();
    this._teardownPending = false;
    this.viewingBattlefield = false;
    this._hudUiAccum = 0;
    this._victoryCheckAccum = 0;
    this._captureUiAccum = 0;
    this._coverUiAccum = 0;
    this._fieldIconUiAccum = 0;
    this._minimapUiAccum = 0;
    this._unitVisualSyncAccum = 0;
    this._largeBattleMovementAccum = 0;
    this._largeBattleTacticalVisualAccum = 0;
    this._towerDefenseAiAccum = 0;
    this._selectionUiKey = '';
    this._hoverUiId = '';
    this._combatAccum = 0;
    this._deployUiAccum = 0;
    this._rosterUiAccum = 0;
    this._emptyFieldHandled = false;
    this._renderPerformance.frameTimeEma = 1 / 60;
    this._renderPerformance.lowFpsFor = 0;
    this._renderPerformance.samples = 0;
    this._renderPerformance.baselineFps = 60;
    this._renderPerformance.highFpsFor = 0;
    this._renderPerformance.qualityCooldown = 0;
    this._setRenderPixelRatio(
      this._largeBattleSimulationPerfActive
        ? LARGE_BATTLE_SIM_PIXEL_RATIO
        : this._nativePixelRatio
    );
    if (!restoreSnapshot) {
      this.matchTime = 0;
    }
    this._hqThreat = null;
    this._hqAlertPlayed = false;
    this.controller.enable();
    this._syncBattleCursor();
    this.ui.hideEndOverlay();
    this.ui.showHUD(this.playerFaction, this.mapDef, this.gameMode, {
      enemyFaction: this.enemyFaction,
      assaultRole: this.assaultRole,
      difficulty: this.tutorial ? null : this.difficulty,
      towerDefense: this.towerDefense,
      tdEndless: !!this.towerDefense?.endless,
      tdHqDefense: isTdHqDefenseStyle(this.towerDefense),
      lastStand: !!this.lastStand,
      lastStandPreset: isLastStandPresetForce(this),
      campaignStyle: this.campaignStyle,
      clearanceReinforced: !!this.clearanceReinforcements,
      clearanceReinforcementSize: this.clearanceReinforcements?.size ?? 'small',
      clearanceRole: this.clearanceRole ?? 'attack',
      clearanceTimeLimitEnabled: this.clearanceTimeLimitEnabled,
    });
    this._tabletMode = isTabletModeEnabled();
    this.controller?.setTabletMode(this._tabletMode);
    if (this._tabletMode) {
      this.setTabletTargetMode(true);
    }
    this.showUnitFieldIcons = this.ui.showUnitFieldIcons;
    this.showUnitStatus = this.ui.showUnitStatus !== false;
    this.radioOperatorAutoMove = this.ui.radioOperatorAutoMove ?? true;
    this.pursueTargetsByDefault = this.ui.pursueTargetsByDefault ?? false;
    this.artilleryAutoFire = this.ui.artilleryAutoFire ?? true;
    setUnitStatusMarkersVisible(this.showUnitStatus);
    this.seekCoverMode = this.ui.seekCoverMode;
    this.autoBuildMode = this.ui.syncAutoBuildForCampaign(this.campaignStyle);
    if (this.cheatMode) {
      this.autoBuildMode = false;
      this.ui.setAutoBuildMode(false, this.campaignStyle, { persist: false });
    }
    this.showFrontline = this.ui.showFrontline;
    syncFrontlineVisual(this.scene, this.showFrontline);
    this.showCapturePoints = this.ui.showCapturePoints;
    this.setCapturePointsVisible(this.showCapturePoints);
    if (isBaseBuildingCampaign(this)) {
      const playerHq = this.hqs.find((h) => h.team === PLAYER_TEAM && !h.dead);
      if (playerHq) {
        this.hqs.forEach((h) => h.setSelected(h === playerHq));
        this.selectedHq = playerHq;
        this.selectedBaseBuilding = null;
      }
    }
    this.ui.syncProductionPanel?.(this);
    this.ui.updateProduction(this);
    if (this.autoBuildMode) updateAutoBuild(this);
    this.ui.setCheatHud(this.cheatMode);
    if (this.cheatMode) this.ui.showCheatToast(true);
    this.ui.updateBaseBuild(this);
    this.ui.updateDefenses(this);
    this.ui.updateTowerDefense(this);
    this.ui.updateFireSupport(this.fireSupport);
    this.ui.updateGeneralOrders(this.generalOrders);
    if (this.lastStand) {
      this.ui.updateLastStandDeploy(this);
      if (
        isLastStandPresetForce(this) &&
        !restoreSnapshot &&
        this.lastStand.briefing &&
        !this.lastStand.briefingShown
      ) {
        this.ui.showLastStandBriefing(this.lastStand.briefing, {
          onBegin: () => {
            this.lastStand.briefingShown = true;
            this.ui.hideLastStandBriefing();
            this.launchLastStandBattle();
          },
          onDismiss: () => {
            this.lastStand.briefingShown = true;
            this.ui.hideLastStandBriefing();
            this.ui.updateLastStandDeploy(this);
          },
        });
      }
    } else {
      const deployPhase = this._getDeployPhase();
      this.ui.updateDeployCountdown(deployPhase);
      this.ui.updateBattleOpening(
        deployPhase ? deployPhase.secondsLeft : 0,
        deployPhase
      );
    }
    this._syncDeployZoneVisuals();
    this._syncPlacementCapture();
    this._rebuildUnitCaches();
    this._syncUnitRoster();
    this._updateMinimap();
    if (this.paused) {
      this.ui?.setGamePaused(true, this._buildCurrentBattleReport());
    }
    preloadUnitFieldIcons([...getProducibleUnits(this.playerFaction), 'commander']).then(() => {
      if (this.running) syncPlayerFieldIcons(this._aliveUnits, this.showUnitFieldIcons);
    });
    this._bootstrapBattleView();
    // The first strafe can overlap all eight reserved layered bursts. Install
    // the fixed light pool and compile its live-scene program after every
    // starting object is present, before the render loop begins.
    prewarmImpactLightPrograms(this.renderer, this.scene, this.camera);
    this._startRenderLoop();
    return true;
  }

  _rebuildUnitCaches() {
    const alive = [];
    const player = [];
    const enemy = [];
    let hasFieldCorpses = false;
    for (const u of this.units) {
      // Movement orders can be issued from UI and specialist controllers
      // between simulation ticks. Keep each unit linked to the live fieldwork
      // manager so Unit.moveTo() applies the same friendly-trench clearance as
      // the combat movement/repath path.
      u._infantryTrenches = this.infantryTrenches ?? null;
      if (u.dead) {
        hasFieldCorpses ||= !!u.mesh?.parent;
        continue;
      }
      alive.push(u);
      if (u.team === PLAYER_TEAM) player.push(u);
      else if (u.team === ENEMY_TEAM) enemy.push(u);
    }
    this._aliveUnits = alive;
    this._playerAlive = player;
    this._enemyAlive = enemy;
    this._hasFieldCorpses = hasFieldCorpses;
    if (alive.length > 0) this._emptyFieldHandled = false;
  }

  _renderFrame() {
    if (this._rendererContextLost) return;
    const entryTarget = this.controller?.hoveredTarget ?? null;
    const entrants = this.controller?.getEligibleVehicleEntrants(entryTarget) ?? [];
    this.ui?.updateVehicleEntryAction(
      entryTarget,
      entrants,
      this.camera,
      this.canvas,
      this.running && !this.gameOver && !this.paused
    );
    updateSkyForCamera(this.scene, this.cameraTarget.x, this.cameraTarget.z);
    this.renderer.render(this.scene, this.camera);
    const metrics = this._devRenderMetrics;
    if (metrics) {
      const now = performance.now();
      if (metrics.lastFrameAt > 0) {
        const frameTime = Math.min(0.1, (now - metrics.lastFrameAt) / 1000);
        metrics.frameTimeEma = metrics.frameTimeEma * 0.94 + frameTime * 0.06;
      }
      metrics.lastFrameAt = now;
      if (now - metrics.lastPublishAt >= 500) {
        metrics.lastPublishAt = now;
        const render = this.renderer.info.render;
        this.canvas.dataset.qaRender = JSON.stringify({
          fps: Math.round(1 / Math.max(metrics.frameTimeEma, 1 / 120)),
          calls: render.calls,
          triangles: render.triangles,
          points: render.points,
          lines: render.lines,
        });
        this.canvas.dataset.qaVehicles = JSON.stringify(
          this._playerAlive
            .filter((unit) => isArmoredCombatVehicle(unit.def?.type))
            .map((unit) => ({
              id: unit.id,
              type: unit.def.type,
              x: Number(unit.position.x.toFixed(2)),
              z: Number(unit.position.z.toFixed(2)),
              yaw: Number((unit.mesh?.rotation?.y ?? 0).toFixed(3)),
              targetX: unit.moveTarget ? Number(unit.moveTarget.x.toFixed(2)) : null,
              targetZ: unit.moveTarget ? Number(unit.moveTarget.z.toFixed(2)) : null,
              moving: !!unit.moveTarget,
              pathNodes: unit._movePath?.length ?? 0,
              repaths: unit._pathRepathAttempts ?? 0,
            }))
        );
      }
    }
  }

  _selectionUiKeyFor(selected, hover = null) {
    const hoverKey = hover
      ? `${hover.id ?? ''}:${hover.team ?? ''}:${hover.dead ? 1 : 0}`
      : '';
    const unitKey = selected
      .map(
        (u) =>
          `${u.id}:${Math.ceil(u.hp)}:${u.attackOrder?.isGround ? 'g' : u.attackOrder ? 'a' : '-'}:${u.engagementStance ?? 'hold'}:${u.def?.type === 'artillery' && u.autoFire ? 'af' : '-'}:${u.seekCoverOverride === null || u.seekCoverOverride === undefined ? 'd' : u.seekCoverOverride ? 'on' : 'off'}`
      )
      .join(',');
    return `${unitKey}|${hoverKey}|${this.selectedHq?.id ?? ''}`;
  }

  setSelectedEngagementStance(stance) {
    const next = stance === 'pursue' ? 'pursue' : 'hold';
    const selected = this._playerAlive.filter(
      (u) => u.selected && !u.surrendered && !u.def?.nonCombat && (u.def?.damage ?? 0) > 0
    );
    if (!selected.length) return false;
    for (const unit of selected) unit.setEngagementStance(next);
    sounds.play('order');
    this._selectionUiKey = '';
    this.ui?.updateSelection(selected, this.controller?.hoveredTarget, this.selectedHq, this);
    return true;
  }

  /** Set the per-unit Seek Cover preference for selected applicable troops. */
  setSelectedSeekCoverOverride(value) {
    const next = value === 'on' ? true : value === 'off' ? false : null;
    const selected = this._playerAlive.filter(
      (u) => u.selected && !u.dead
    );
    const eligible = selected.filter((u) => !u.surrendered && canSeekCover(u));
    if (!eligible.length) return false;
    for (const unit of eligible) unit.setSeekCoverOverride(next);
    sounds.play('order');
    this._selectionUiKey = '';
    this.ui?.updateSelection(selected, this.controller?.hoveredTarget, this.selectedHq, this);
    return true;
  }

  /** Toggle Auto-fire on selected player howitzers. */
  toggleSelectedArtilleryAutoFire() {
    const selected = this._playerAlive.filter(
      (u) => u.selected && !u.dead && !u.surrendered && u.def?.type === 'artillery'
    );
    if (!selected.length) return false;
    const allOn = selected.every((u) => u.autoFire);
    const next = !allOn;
    for (const unit of selected) unit.setAutoFire(next);
    sounds.play('order');
    this._selectionUiKey = '';
    this.ui?.updateSelection(selected, this.controller?.hoveredTarget, this.selectedHq, this);
    this.ui?.updateArtilleryAutoFire?.(this);
    return true;
  }

  _maybeUpdateSelectionPanel(selected, dt) {
    if (this._selectionPanelDismissed) {
      // Panel stays empty after orders; drop the flag if selection is gone.
      if (!selected.length && !this.selectedHq) this._selectionPanelDismissed = false;
      return;
    }
    if ((!selected.length && !this.selectedHq) || !this.ui) return;
    const hover = this.controller?.hoveredTarget;
    const key = this._selectionUiKeyFor(selected, hover);
    this._selectionUiAccum += dt;
    if (key === this._selectionUiKey && this._selectionUiAccum < 0.2) return;
    this._selectionUiKey = key;
    this._selectionUiAccum = 0;
    this.ui.updateSelection(selected, hover, this.selectedHq, this);
  }

  _getDeployZoneTeamsAt(time = this.matchTime) {
    if (this.tutorial || this.towerDefense || this.lastStand) return [];
    if (this.clearance) {
      return time < CLEARANCE_CEASEFIRE_TIME ? [PLAYER_TEAM] : [];
    }
    return time < BATTLE_OPENING_TIME ? [PLAYER_TEAM, ENEMY_TEAM] : [];
  }

  _getDeployPhase() {
    if (this.tutorial || this.towerDefense || this.lastStand || !this.running) return null;
    if (
      this.clearance &&
      this.clearanceRole === 'defend' &&
      this.matchTime < CLEARANCE_DEFENDER_PREP_TIME
    ) {
      return {
        secondsLeft: CLEARANCE_DEFENDER_PREP_TIME - this.matchTime,
        total: CLEARANCE_DEFENDER_PREP_TIME,
        title: 'Enemy attack will commence in',
        subtitle: 'Arrange the garrison — the assault begins when the timer expires',
        hint: 'Enemy attack will commence in {seconds}s — arrange the garrison',
        canLaunchEarly: false,
      };
    }
    if (this.clearance && this.matchTime < CLEARANCE_CEASEFIRE_TIME) {
      return {
        secondsLeft: CLEARANCE_CEASEFIRE_TIME - this.matchTime,
        total: CLEARANCE_CEASEFIRE_TIME,
        title: 'Defenders hold fire',
        subtitle: 'Stay inside the blue assembly ring — or launch early when ready',
        canLaunchEarly: true,
      };
    }
    if (!this.clearance && this.matchTime < BATTLE_OPENING_TIME) {
      const assault = !!this.assault;
      return {
        secondsLeft: BATTLE_OPENING_TIME - this.matchTime,
        total: BATTLE_OPENING_TIME,
        title: 'Quiet sector',
        subtitle: assault
          ? this.assaultRole === 'defend'
            ? 'Stay inside your HQ ring — hold the frontline or destroy the assault HQ'
            : 'Stay inside your HQ ring — capture the frontline or destroy the enemy HQ'
          : 'Victory: destroy the enemy headquarters · Stay in your HQ ring — launch when ready',
        canLaunchEarly: true,
      };
    }
    return null;
  }

  _isPlayerDeployZoneActive() {
    return this._getDeployZoneTeamsAt().includes(PLAYER_TEAM);
  }

  _clampPlayerDeployPoint(x, z) {
    if (!this._isPlayerDeployZoneActive()) {
      if (isTdHqDefenseStyle(this.towerDefense)) {
        return clampToPlayerSideOfFrontline(x, z, this);
      }
      return { x, z };
    }
    const hq = this.clearance
      ? getClearanceStagingAnchor(this.mapDef, this.clearanceRole)
      : this.hqs.find((h) => h.team === PLAYER_TEAM && !h.dead);
    return clampPointToHqZone(x, z, hq, getStagingMoveRadius(this.mapDef));
  }

  _syncBattleCursor() {
    if (!this.canvas) return;
    if (!this.running || this.gameOver) {
      this.canvas.style.cursor = '';
      return;
    }
    const shiftHeld =
      this.keys.ShiftLeft ||
      this.keys.ShiftRight ||
      this.controller?.isManualFireModifier?.();
    const selected = this._playerAlive.filter((u) => u.selected);
    const defensePending = !!this.defenses?.getPending();
    const deployPending = !!(this.lastStand?.pendingType && isLastStandDeployPhase(this));
    const sandbagPending = !!this.engineerSandbags?.getPending();
    const trenchPending = !!this.infantryTrenches?.getPending();
    const medicTentPending = !!this.medicFieldHospitals?.getPending();
    const baseBuildPending = !!this.baseBuildings?.getPending();
    this.canvas.style.cursor = resolveBattleCursor({
      fireSupportPending:
        !!this.fireSupport?.pending ||
        defensePending ||
        deployPending ||
        sandbagPending ||
        trenchPending ||
        medicTentPending ||
        baseBuildPending,
      smokeShellPending: !!this.smokeShellTargeting,
      shiftHeld,
      hasManualFireSelection: selected.some(canManualFireOrder),
      hasSmokeShellSelection: selected.some(isSmokeShellReady),
    });
  }

  _showDeployZoneRings(teams) {
    disposeDeployZoneRings(this._deployZoneRings, this.scene);
    const hqs = this.hqs.filter((h) => teams.includes(h.team) && !h.dead);
    const rings = createDeployZoneRings(hqs, this.mapDef, this.scene);
    if (
      this.clearance &&
      teams.includes(PLAYER_TEAM) &&
      !hqs.some((h) => h.team === PLAYER_TEAM)
    ) {
      rings.push(
        ...createDeployZoneRings(
          [getClearanceStagingAnchor(this.mapDef, this.clearanceRole)],
          this.mapDef,
          this.scene
        )
      );
    }
    this._deployZoneRings = rings;
  }

  _syncDeployZoneVisuals() {
    const teams = this._getDeployZoneTeamsAt();
    if (teams.length) {
      if (!this._deployZoneRings.length) this._showDeployZoneRings(teams);
    } else if (this._deployZoneRings.length) {
      disposeDeployZoneRings(this._deployZoneRings, this.scene);
      this._deployZoneRings = [];
    }
  }

  /** End Tower Defence prepare countdown and start the current wave immediately. */
  skipTowerDefenseWave() {
    if (!this.running || this.gameOver || !this.towerDefense) return;
    void sounds.primeForCombat();
    if (!skipTowerDefensePrepare(this)) return;
    sounds.play('order');
    this._syncBattleCursor();
  }

  /** End quiet sector / clearance ceasefire immediately (player override). */
  launchBattleNow() {
    if (!this.running || this.gameOver || this.paused || this.tutorial) return;
    if (this.lastStand) {
      this.launchLastStandBattle();
      return;
    }
    if (!this._getDeployPhase()) return;

    this.matchTime = this.clearance
      ? this.clearanceRole === 'defend'
        ? CLEARANCE_DEFENDER_PREP_TIME
        : CLEARANCE_CEASEFIRE_TIME
      : BATTLE_OPENING_TIME;
    disposeDeployZoneRings(this._deployZoneRings, this.scene);
    this._deployZoneRings = [];
    this.ui?.updateDeployCountdown(null);
    this.ui?.updateBattleOpening(0);
    this.ui?.updateBaseBuild(this);
    this.ui?.updateProduction(this);
    if (this.autoBuildMode) updateAutoBuild(this);
    this._syncBattleCursor();
    sounds.play('order');
  }

  _updateCameraFromTarget() {
    const horizontalDist = this.zoom * 0.89;
    const camOffset = new THREE.Vector3(
      Math.sin(this.cameraYaw) * horizontalDist,
      this.zoom * 0.88,
      Math.cos(this.cameraYaw) * horizontalDist
    );
    this.camera.position.copy(this.cameraTarget).add(camOffset);
    this.camera.lookAt(this.cameraTarget);
  }

  _captureCameraFacing() {
    this.camera.getWorldDirection(this._cameraGroundDirection);
    this._cameraGroundDirection.y = 0;
    if (this._cameraGroundDirection.lengthSq() <= 0.0001) return;
    this._cameraGroundDirection.normalize();
    const yaw = Math.atan2(-this._cameraGroundDirection.x, -this._cameraGroundDirection.z);
    if (Number.isFinite(yaw)) this.cameraYaw = yaw;
  }

  _setupBattleCamera(playerFocus, enemyFocus) {
    const dx = enemyFocus.x - playerFocus.x;
    const dz = enemyFocus.z - playerFocus.z;
    const len = Math.hypot(dx, dz) || 1;
    const dirX = dx / len;
    const dirZ = dz / len;

    this.cameraYaw = Math.atan2(-dirX, -dirZ);
    const mapScale = this.mapDef?.sizeScale ?? 1;
    this.zoom = 24 * Math.sqrt(mapScale);

    this.cameraTarget.set(
      playerFocus.x + dirX * 8,
      0,
      playerFocus.z + dirZ * 8
    );

    this._updateCameraFromTarget();
  }

  _faceUnitsToward(units, target) {
    if (!target) return;
    for (const u of units) {
      if (u.dead) continue;
      if (Number.isFinite(u._clearanceDeploymentYaw)) {
        snapUnitYaw(u, u._clearanceDeploymentYaw);
        continue;
      }
      const dx = target.x - u.position.x;
      const dz = target.z - u.position.z;
      if (dx * dx + dz * dz > 0.04) {
        snapUnitYaw(u, Math.atan2(dx, dz));
      }
    }
  }

  _relocateEmbeddedCrewServedGuns() {
    if (!this.scenery?.getUnitPlacementBlocker || !this.mapDef) return 0;
    let relocated = 0;
    for (const unit of this.units) {
      if (
        unit.dead ||
        (unit.def?.type !== 'antiTankGun' && unit.def?.type !== 'artillery') ||
        !this.scenery.getUnitPlacementBlocker(unit.position.x, unit.position.z, 1.65)
      ) continue;
      const position = resolveUnitSpawnPosition(
        unit.def,
        unit.position.x,
        unit.position.z,
        this.scenery,
        this.mapDef,
        {
          // Breakthrough / Fortified Line can put a team on the opposite map half.
          team: this.clearance || this.assault ? null : unit.team,
          forceAssemblyRear: unit.def?.type === 'artillery',
        }
      );
      if (!position) continue;
      unit.position.x = position.x;
      unit.position.z = position.z;
      unit.position.y = sampleTerrainHeight(position.x, position.z, this.mapDef);
      unit.target = null;
      unit.clearAttackOrder();
      unit.moveTarget = null;
      unit._movePath = null;
      unit._userMoveOrder = false;
      if (unit.defensiveHold) {
        unit.defensiveHold.x = position.x;
        unit.defensiveHold.z = position.z;
      }
      relocated++;
    }
    return relocated;
  }

  _syncUnitRoster() {
    if (!this.ui) return;
    const alive = this.units.filter((u) => u.team === PLAYER_TEAM && !u.dead);
    const selected = alive.filter((u) => u.selected);
    const fingerprint = alive
      .map((u) => `${u.id}:${Math.ceil(u.hp)}:${u.selected ? 1 : 0}`)
      .join('|');
    const selKey = selected.map((u) => u.id).join(',');
    const key = `${fingerprint}#${selKey}`;
    if (key === this._rosterKey) return;
    this._rosterKey = key;
    this.ui.updateUnitRoster(alive, selected);
  }

  setUnitFieldIconsEnabled(enabled) {
    this.showUnitFieldIcons = !!enabled;
    syncPlayerFieldIcons(this._aliveUnits, this.showUnitFieldIcons);
    syncUnitHealthBars(this._aliveUnits, this.showUnitFieldIcons);
  }

  setUnitStatusEnabled(enabled) {
    this.showUnitStatus = !!enabled;
    setUnitStatusMarkersVisible(this.showUnitStatus);
    this.coverSystem?.updateUnits?.(this._aliveUnits);
    syncHealMarkers(this.units, this.baseBuildings, this.hqs);
    syncMoraleMarkers(this._aliveUnits, this.units);
    syncRetreatMarkers(this._aliveUnits);
    syncSurrenderMarkers(this._aliveUnits);
  }

  setSeekCoverMode(enabled) {
    this.seekCoverMode = !!enabled;
    this._selectionUiKey = '';
    const selected = this._playerAlive?.filter((unit) => unit.selected) ?? [];
    if (selected.length) {
      this.ui?.updateSelection(selected, this.controller?.hoveredTarget, this.selectedHq, this);
    }
  }

  setRadioOperatorAutoMove(enabled) {
    this.radioOperatorAutoMove = !!enabled;
    if (!this.radioOperatorAutoMove && this.fireSupport?.hasPendingStrike?.()) {
      this.fireSupport.cancelPendingStrike();
      this.ui?.updateFireSupport?.(this.fireSupport);
      this._syncBattleCursor();
    }
  }

  setPursueTargetsByDefault(enabled) {
    this.pursueTargetsByDefault = !!enabled;
    this._applyEngagementStanceDefault(this.units);
    this._selectionUiKey = '';
    const selected = this._playerAlive?.filter((unit) => unit.selected) ?? [];
    if (selected.length) {
      this.ui?.updateSelection(selected, this.controller?.hoveredTarget, this.selectedHq, this);
    }
  }

  _applyEngagementStanceDefault(units = this.units) {
    const stance = this.pursueTargetsByDefault ? 'pursue' : 'hold';
    for (const unit of units ?? []) {
      if (unit?.team !== PLAYER_TEAM || unit.dead) continue;
      unit.setEngagementStance(stance);
    }
  }

  setArtilleryAutoFire(enabled) {
    this.artilleryAutoFire = !!enabled;
    this._applyArtilleryAutoFireDefault(this.units);
    this._selectionUiKey = '';
    this.ui?.updateArtilleryAutoFire?.(this);
  }

  _applyArtilleryAutoFireDefault(units = this.units) {
    for (const unit of units ?? []) {
      if (unit?.team !== PLAYER_TEAM || unit.dead || unit.def?.type !== 'artillery') continue;
      unit.setAutoFire(this.artilleryAutoFire);
    }
  }

  setAutoBuildMode(enabled) {
    if (this.cheatMode && enabled) return;
    this.autoBuildMode = !!enabled;
    if (this.autoBuildMode && this.running && !this.gameOver) {
      updateAutoBuild(this);
    }
  }

  dismountSelectedTankRiders() {
    const selected = this._playerAlive.filter((u) => u.selected);
    const selectedTanks = selected.filter((unit) =>
      unit._tankRiderIds?.some((id) => id !== unit._replacementCrewUnitId)
    );
    const selectedTankIds = new Set(selectedTanks.map((tank) => tank.id));

    for (const tank of selectedTanks) {
      if (!tank.moveTarget) dismountAllRiders(tank, this.units, this.mapDef);
    }
    for (const rider of selected) {
      if (!rider._mountedOnTankId || rider._replacementCrewVehicleId) continue;
      if (selectedTankIds.has(rider._mountedOnTankId)) continue;
      const tank = this.units.find((unit) => unit.id === rider._mountedOnTankId);
      if (!tank || tank.moveTarget) continue;
      const index = Math.max(0, tank._tankRiderIds?.indexOf(rider.id) ?? 0);
      releaseFromTank(rider, this.units, this.mapDef, index);
    }
    this._selectionUiKey = '';
    const sel = this._playerAlive.filter((u) => u.selected);
    this.ui?.updateSelection(sel, this.controller?.hoveredTarget, this.selectedHq, this);
  }

  setShowFrontlineEnabled(enabled) {
    this.showFrontline = !!enabled;
    syncFrontlineVisual(this.scene, this.showFrontline);
  }

  setCapturePointsVisible(enabled) {
    this.showCapturePoints = !!enabled;
    const visible = this.showCapturePoints && !this.towerDefense;
    for (const capturePoint of this.capturePoints ?? []) {
      capturePoint.group.visible = visible;
    }
  }

  panCameraTo(x, z) {
    if (!this.mapDef) return;
    // Rebuild the orbit from the view the player is already looking through;
    // moving the target must never introduce a new camera angle.
    this._captureCameraFacing();
    const half = this.mapDef.size / 2 - 5;
    this.cameraTarget.x = THREE.MathUtils.clamp(x, -half, half);
    this.cameraTarget.z = THREE.MathUtils.clamp(z, -half, half);
    this._updateCameraFromTarget();
  }

  _isTextInputFocused(target) {
    if (!target || typeof target !== 'object') return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
  }

  togglePause() {
    if (!this.running || this.gameOver) return;
    if (this.paused && this.ui?.isPausedSettingsOpen?.()) {
      this.ui.closePausedSettings();
      return;
    }
    this.setPaused(!this.paused);
  }

  setPaused(paused, { silent = false } = {}) {
    if (!this.running || this.gameOver) return;
    const next = !!paused;
    if (this.paused === next) return;
    this.paused = next;
    if (!silent) {
      this.ui?.setGamePaused(
        this.paused,
        this.paused ? this._buildCurrentBattleReport() : null
      );
    }
    if (this.paused) sounds.clearVehicleEngines();
    this._syncBattleCursor();
  }

  setDebrisRetentionSeconds(seconds) {
    this.debrisRetentionSeconds = Number.isFinite(seconds)
      ? Math.max(10, seconds)
      : Infinity;
  }

  _updateMinimap() {
    if (!this.ui || !this.mapDef || !this.running) return;
    this.ui.updateMinimap({
      mapDef: this.mapDef,
      playerUnits: this._playerAlive,
      enemyUnits: this._enemyAlive,
      hqs: this.hqs,
      camera: {
        x: this.cameraTarget.x,
        z: this.cameraTarget.z,
        zoom: this.zoom,
      },
      highlightedUnitId: this._highlightedRosterUnitId,
    });
  }

  setRosterHighlightedUnit(unitId) {
    const nextId = unitId == null ? null : Number(unitId);
    if (nextId !== null && !Number.isFinite(nextId)) return;
    if (nextId !== null && !this.units.some((unit) => unit.id === nextId && unit.team === PLAYER_TEAM)) {
      return;
    }
    if (nextId === this._highlightedRosterUnitId) return;
    this._highlightedRosterUnitId = nextId;
    this._updateMinimap();
  }

  selectPlayerUnitById(unitId, additive = false) {
    if (!this._unitSelectionShortcutApplying) this._unitSelectionCycle = null;
    const unit = this.units.find(
      (u) => u.id === unitId && u.team === PLAYER_TEAM && !u.dead
    );
    if (!unit) return;

    this._cancelPendingRadioOperatorStrikeForUnits([unit]);

    const teamUnits = this.units.filter((u) => u.team === PLAYER_TEAM);
    if (!additive) {
      teamUnits.forEach((u) => u.setSelected(false));
      this.hqs.forEach((h) => h.setSelected(false));
      this.selectedHq = null;
      this.selectedBaseBuilding = null;
    }
    unit.setSelected(true);
    this.panCameraTo(unit.position.x, unit.position.z);
    this.controller?._notifySelection(teamUnits, null);
  }

  /**
   * Hide the selection info panel after an order without clearing unit selection,
   * so follow-up orders still go to the same units.
   */
  _dismissSelectionPanelAfterOrder() {
    this._selectionPanelDismissed = true;
    this._selectionUiKey = '';
    this._selectionUiAccum = 0;
    this._hoverUiId = '';
    this.hqs?.forEach((h) => {
      if (h.selected) h.setSelected(false);
    });
    this.selectedHq = null;
    this.selectedBaseBuilding = null;
    this.ui?.updateSelection([], null, null, this);
    const teamUnits = this.units.filter((u) => u.team === PLAYER_TEAM);
    const sel = teamUnits.filter((u) => u.selected && !u.dead);
    this.targetIndicators?.update(
      sel,
      this._playerAlive ?? teamUnits.filter((u) => !u.dead)
    );
    this._syncUnitRoster();
  }

  /** Deselect all player units and clear HQ/base selection so the info panel empties. */
  _clearPlayerUnitSelection() {
    this._selectionPanelDismissed = false;
    const teamUnits = this.units.filter((u) => u.team === PLAYER_TEAM);
    for (const u of teamUnits) {
      if (u.selected) u.setSelected(false);
    }
    this.hqs?.forEach((h) => {
      if (h.selected) h.setSelected(false);
    });
    this.selectedHq = null;
    this.selectedBaseBuilding = null;
    this._selectionUiKey = '';
    this.controller?._notifySelection(teamUnits, null, null);
    this.targetIndicators?.update([], this._playerAlive ?? teamUnits.filter((u) => !u.dead));
  }

  /**
   * Select the closest usable support unit to the current tactical context.
   * A current unit selection is the anchor (for example, a damaged tank);
   * otherwise use the centre of the camera view.
   */
  selectNearestAvailablePlayerUnit(unitType) {
    if (!this.running || this.gameOver || !unitType) return null;
    const teamUnits = this.units.filter((unit) => unit.team === PLAYER_TEAM);
    const isAvailable = (unit) =>
      !unit.dead &&
      !unit.surrendered &&
      !unit._captureExit;
    const candidates = teamUnits.filter(
      (unit) => isAvailable(unit) && unit.def?.type === unitType
    );
    if (candidates.length === 0) return null;

    const selected = teamUnits.filter(
      (unit) => isAvailable(unit) && unit.selected
    );

    const cycle = this._unitSelectionCycle;
    const canAdvanceCycle =
      cycle?.type === unitType &&
      cycle.currentId != null &&
      selected.length === 1 &&
      selected[0].id === cycle.currentId &&
      candidates.some((unit) => unit.id === cycle.currentId);

    if (canAdvanceCycle) {
      const availableById = new Map(candidates.map((unit) => [unit.id, unit]));
      const orderedIds = cycle.orderIds.filter((id) => availableById.has(id));
      if (orderedIds.length > 0) {
        const currentIndex = orderedIds.indexOf(cycle.currentId);
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % orderedIds.length : 0;
        const next = availableById.get(orderedIds[nextIndex]);
        if (next) {
          this._unitSelectionCycle = {
            type: unitType,
            orderIds: orderedIds,
            currentId: next.id,
          };
          this._unitSelectionShortcutApplying = true;
          try {
            this.selectPlayerUnitById(next.id, false);
          } finally {
            this._unitSelectionShortcutApplying = false;
          }
          return next;
        }
      }
    }

    let anchorX = this.cameraTarget.x;
    let anchorZ = this.cameraTarget.z;
    if (selected.length > 0) {
      anchorX = selected.reduce((sum, unit) => sum + unit.position.x, 0) / selected.length;
      anchorZ = selected.reduce((sum, unit) => sum + unit.position.z, 0) / selected.length;
    }

    const ordered = [...candidates].sort((a, b) => {
      const distanceA =
        (a.position.x - anchorX) ** 2 +
        (a.position.z - anchorZ) ** 2;
      const distanceB =
        (b.position.x - anchorX) ** 2 +
        (b.position.z - anchorZ) ** 2;
      if (distanceA !== distanceB) return distanceA - distanceB;
      return a.id - b.id;
    });
    const nearest = ordered[0];
    if (!nearest) return null;

    this._unitSelectionCycle = {
      type: unitType,
      orderIds: ordered.map((unit) => unit.id),
      currentId: nearest.id,
    };
    this._unitSelectionShortcutApplying = true;
    try {
      this.selectPlayerUnitById(nearest.id, false);
    } finally {
      this._unitSelectionShortcutApplying = false;
    }
    return nearest;
  }

  replay() {
    const s = this.lastSession;
    if (!s) return;
    this.activeSaveId = null;
    this.startGame(s.factionId, s.mapId, s.gameMode, s.options);
  }

  saveBattle() {
    if (!this.running || this.gameOver) return false;
    try {
      const snapshot = captureBattleSave(this, { id: this.activeSaveId });
      const id = writeBattleSave(snapshot, this.activeSaveId);
      this.activeSaveId = id;
      this.ui?.showSaveToast?.('Battle saved — resume later from the main menu');
      this.ui?.refreshTitleSaveButton?.();
      return true;
    } catch (err) {
      console.error('Battle save failed:', err);
      this.ui?.showSaveToast?.('Could not save — battle state may be too large for this browser.');
      return false;
    }
  }

  loadBattle(saveId) {
    const snapshot = loadBattleSaveData(saveId);
    if (!snapshot?.session) return false;
    const { factionId, mapId, gameMode, options = {} } = snapshot.session;
    if (!FACTIONS[factionId] || !MAPS[mapId]) return false;
    this.activeSaveId = saveId;
    return this.startGame(factionId, mapId, gameMode, { ...options, restoreSnapshot: snapshot });
  }

  /** Player-initiated surrender — counts as a defeat, then Main Menu from the end screen. */
  surrender() {
    if (!this.running || this.gameOver) return;
    const detail = this.tutorial
      ? 'Left the training ground.'
      : 'Your forces surrendered.';
    this.endGame(false, detail);
  }

  confirmTargetAttack() {
    const target = this.controller?.hoveredTarget;
    if (target && this.controller.issueAttackOn(target)) {
      this.controller.clearTabletTargetConfirm();
      // Info panel is dismissed in onOrder; units stay selected for follow-ups.
    }
  }

  issueSelectedVehicleEntry(targetId) {
    if (!this.running || this.gameOver || this.paused) return false;
    const vehicle = this.units.find((unit) => unit.id === targetId) ?? null;
    return this.controller?.issueVehicleEntry(vehicle) ?? false;
  }

  setVehicleEntryActionHovered(hovered) {
    this.controller?.setVehicleEntryActionHovered(hovered);
  }

  setTabletTargetMode(on) {
    this.controller?.setTabletTargetMode(on);
    this.ui?.setTabletTargetMode(on);
  }

  setTabletMode(on) {
    this._tabletMode = !!on;
    this.controller?.setTabletMode(this._tabletMode);
    this.ui?.tabletCamera?.setVisible(this._tabletMode);
    if (this._tabletMode && this.running) {
      this.setTabletTargetMode(true);
    } else if (!this._tabletMode) {
      this.setTabletTargetMode(false);
      this.setTabletFireMode(false);
    }
  }

  setTabletFireMode(on) {
    this.controller?.setTabletFireMode(on);
    this.ui?.setTabletFireMode(on);
    this._syncBattleCursor();
  }

  _countActiveFireMissions() {
    return this._playerAlive.filter((u) => isActiveManualFireMission(u)).length;
  }

  launchLastStandBattle() {
    if (!this.lastStand || this.lastStand.phase !== 'deploy') return false;
    if (countLastStandCombatUnits(this.units, PLAYER_TEAM) === 0) return false;

    if (isLastStandPresetForce(this)) {
      assignLastStandPresetStances(this);
    } else {
      // Match the player's unit count (AI chooses its own mix), then apply the
      // same combined-arms battle plans used by Preset Battle Group.
      flushEnemyDeployment(this);
      assignLastStandEnemyStances(this);
    }
    this._rebuildUnitCaches();
    this.lastStand.phase = 'battle';
    this.lastStand.pendingType = null;
    this.lastStand.supplies.player = 0;
    this.lastStand.supplies.enemy = 0;
    this.resources.player = 0;
    this.resources.enemy = 0;
    this.ui?.updateLastStandDeploy(this);
    this.ui?.updateProduction(this);
    this._syncPlacementCapture();
    this._syncBattleCursor();
    this._faceUnitsToward(
      this.units.filter((u) => u.team === PLAYER_TEAM && !u.dead),
      this.mapDef.enemyBase
    );
    this._faceUnitsToward(
      this.units.filter((u) => u.team === ENEMY_TEAM && !u.dead),
      this.mapDef.playerBase
    );
    sounds.play('order');
    return true;
  }

  handleLastStandPlacement(mode, x, z) {
    if (!this.lastStand || this.lastStand.phase !== 'deploy') return;
    if (mode !== 'place') return;

    const type = this.lastStand.pendingType;
    if (!type) return;

    const result = tryPlacePlayerUnit(this, type, x, z);
    if (!result.ok) {
      if (result.reason === 'radio_cap') {
        this.ui?.showSaveToast?.('Radio net is at capacity (3).');
      } else if (result.reason === 'blocked') {
        this.ui?.showSaveToast?.('Cannot place there.');
      } else if (result.reason === 'no_supplies') {
        this.ui?.showSaveToast?.('Not enough supplies.');
      }
      return;
    }

    this._applyEngagementStanceDefault([result.unit]);
    this._applyArtilleryAutoFireDefault([result.unit]);
    sounds.play('spawn');
    this._rebuildUnitCaches();
    this._syncUnitRoster();
    syncUnitFieldIcon(result.unit, this.showUnitFieldIcons);
    this.resources.player = this.lastStand.supplies.player;
    this.ui?.updateLastStandDeploy(this);
    this.ui?.updateResources(this.resources.player, this.capturePoints, this.cheatMode);
  }

  cancelSmokeShellTargeting() {
    if (!this.smokeShellTargeting) return false;
    this.smokeShellTargeting = false;
    this.smokeScreens?.clearPreview();
    this.ui?.updateSmokeShell(this);
    this._syncBattleCursor();
    return true;
  }

  cancelAllFireMissions() {
    if (!this.running || this.gameOver) return false;
    this.cancelSmokeShellTargeting();

    let cleared = 0;
    for (const u of this.units) {
      if (u.dead || u.team !== PLAYER_TEAM) continue;
      if (u.cancelManualFireMission()) cleared++;
    }

    const sel = this._playerAlive.filter((u) => u.selected);
    this._selectionUiKey = '';
    this.ui?.updateFireMissionControls(this._countActiveFireMissions());
    if (cleared > 0) {
      sounds.play('order');
      this.ui?.updateSelection(sel, this.controller?.hoveredTarget, this.selectedHq, this);
      this.targetIndicators?.update(sel, this._playerAlive);
    }
    return cleared > 0;
  }

  _spawnExplosionCrater(x, z, tier = 'medium') {
    if (!this.scene || !this.mapDef) return;
    if (isUrbanCanalWater(x, z, this.mapDef)) return;
    addExplosionCrater(this.scene, this.mapDef, x, z, tier, this._terrainMesh);
  }

  _handleVehicleWreckCrushed(wreck, vehicle) {
    if (!wreck?.mesh?.parent || wreck._wreckCrushFxDone) return;
    wreck._wreckCrushFxDone = true;

    applyVehicleWreckCrushVisual(wreck);

    sounds.playImpact('shell', { x: wreck.position.x, z: wreck.position.z }, 0.02);
  }

  _handleVehicleWreckImpact(wreck, vehicle, impact = {}) {
    if (!wreck?.mesh?.parent) return;
    const severity = THREE.MathUtils.clamp(impact.speedRatio ?? 0.5, 0.25, 1);
    spawnCollapseDust(
      this.scene,
      {
        x: wreck.position.x,
        y: wreck.position.y + 0.06,
        z: wreck.position.z,
      },
      0.55 + severity * 0.55,
      {
        x: impact.directionX ?? 0,
        z: impact.directionZ ?? 0,
      },
      { includeRing: false }
    );
    const impactPosition = { x: wreck.position.x, z: wreck.position.z };
    sounds.playImpact('impact', impactPosition, 0);
    sounds.playImpact('bullet_metal', impactPosition, 0.015);
  }

  _handleVehicleWreckRunOver(wreck, vehicle, impact = {}) {
    if (!wreck?.mesh?.parent) return;
    applyVehicleWreckCrushVisual(wreck);
    const severity = THREE.MathUtils.clamp(impact.severity ?? 0.12, 0.05, 0.75);
    spawnCollapseDust(
      this.scene,
      {
        x: wreck.position.x,
        y: wreck.position.y + 0.08,
        z: wreck.position.z,
      },
      0.7 + severity * 1.7,
      {
        x: (vehicle?.position?.x ?? wreck.position.x) - wreck.position.x,
        z: (vehicle?.position?.z ?? wreck.position.z) - wreck.position.z,
      },
      { includeRing: false }
    );
    sounds.playImpact(
      'shell',
      { x: wreck.position.x, z: wreck.position.z },
      0.006 + severity * 0.016
    );
  }

  stopGame() {
    this.zoomMax = 100;
    this.running = false;
    this.gameOver = false;
    this.paused = false;
    this.ui?.setGamePaused(false);
    this._endOverlayShown = false;
    this._battleStatsFinalized = false;
    this._pendingEnd = null;
    clearPendingMortarImpacts();
    this._teardownPending = false;
    this._unitSelectionCycle = null;
    this._unitSelectionShortcutApplying = false;
    this._highlightedRosterUnitId = null;
    this.viewingBattlefield = false;
    this.ui?.hideEndOverlay();
    this.ui?.hidePostMatchViewBar();
    this.controller.disable();
    this.canvas.style.cursor = '';
    this.targetIndicators?.clear();
    this.rangeRings.clear();
    clearTerrainDamage(this.scene);
    clearCombatEffects();
    clearShellCasings(this.scene);
    clearWreckEffects();
    clearVehicleCookOffs(this);
    clearDetachedCorpseFalls();
    clearHqBurnEffects();
    this.scenery?.clear();
    this.scenery = null;
    this.selectedHq = null;
    clearFireSupportEffects();
    clearParachuteEffects(this.scene);
    sounds.clearVehicleEngines();
    this.fireSupport?.cancel();
    disposeFrontlineVisual(this.scene);
    disposeDeployZoneRings(this._deployZoneRings, this.scene);
    this.assault = null;
    this.towerDefense = null;
    this.lastStand = null;
    this.defenses?.clear();
    this.defenses = null;
    this.ui?.clearMinimap();
    this.ui?.setPlacementCapture(false);
    this.clearance = false;
    this.clearanceRole = 'attack';
    this.clearanceAttackPlan = null;
    this.clearanceOperational = null;
    this.clearanceReinforcements = null;
    this.campaign = false;
    this.production.setBuildTimeMult(1);
    for (const u of this.units) {
      if (u.mesh?.parent) u.dispose(this.scene);
    }
    for (const h of this.hqs) h.dispose(this.scene);
    for (const cp of this.capturePoints) cp.dispose(this.scene);
    this.units = [];
    this.hqs = [];
    this.capturePoints = [];
    this.coverSystem = null;
    this._terrainMesh = null;
    this._aliveUnits = [];
    this._playerAlive = [];
    this._enemyAlive = [];
    flushDisposeQueueSync(40);
    disposeBattleScene(this.scene);
    this.lights = null;
    this.mapDef = null;
    this._stopRenderLoop();
    this._emptyFieldHandled = false;
    this._combatAccum = 0;
  }

  spendResources(team, amount) {
    if (this.cheatMode && team === PLAYER_TEAM) return true;
    if (this.resources[team] < amount) return false;
    this.resources[team] -= amount;
    return true;
  }

  _onCheatKeyDown(e) {
    if (e.repeat || shouldIgnoreCheatKeyEvent(e)) return;
    if (!this._cheatKeys.feed(e.key)) return;
    this.toggleCheatMode();
  }

  toggleCheatMode() {
    this.cheatMode = !this.cheatMode;
    this.production?.setCheatMode(this.cheatMode);
    if (this.cheatMode) {
      this.autoBuildMode = false;
      this.ui?.setAutoBuildMode(false, this.campaignStyle, { persist: false });
    }
    this.ui?.setCheatHud(this.cheatMode);
    if (this.running) {
      this.ui?.updateProduction(this);
      this.ui?.updateResources(this.resources.player, this.capturePoints, this.cheatMode);
      this.ui?.updateDefenses?.(this);
      this.ui?.showCheatToast(this.cheatMode);
    }
  }

  handleFireSupportTarget(mode, x, z) {
    if (!this.running || this.gameOver || this._isPlayerDeployZoneActive()) return;
    if (mode === 'radio-interact') {
      return this._cancelPendingRadioOperatorStrikeForUnits([x]);
    }
    if (mode === 'pending-interact') {
      if (!this.fireSupport.isPendingStrikeAt?.(x, z)) return false;
      if (!this.fireSupport.cancelPendingStrike()) return false;
      sounds.play('select');
      this.ui?.showSaveToast?.('Pending fire-support strike cancelled');
      this.ui?.updateFireSupport(this.fireSupport);
      this._syncBattleCursor();
      return true;
    }
    if (mode === 'preview') {
      this.fireSupport.updatePreview(x, z);
      return;
    }
    if (mode === 'place') {
      if (this.fireSupport.tryPlaceTarget(x, z)) {
        this.ui?.updateFireSupport(this.fireSupport);
        this._syncBattleCursor();
      } else {
        const half = this.mapDef.size / 2 - 8;
        const targetX = THREE.MathUtils.clamp(x, -half, half);
        const targetZ = THREE.MathUtils.clamp(z, -half, half);
        const airborneTargetConflict =
          this.fireSupport.pending === 'airborneDrop' &&
          !this.fireSupport.isAirborneTargetAllowed(targetX, targetZ);
        if (!airborneTargetConflict) {
          const relay = this._orderRadioOperatorIntoSupportRange(targetX, targetZ);
          if (relay) {
            this.fireSupport.queuePendingStrike(
              this.fireSupport.pending,
              targetX,
              targetZ,
              {
                covered: relay.destination.covered,
                radioId: relay.radio.id,
              }
            );
          }
        }
        this.ui?.updateFireSupport(this.fireSupport);
        this._syncBattleCursor();
      }
    }
  }

  armFireSupport(type) {
    if (!this.running || this.gameOver || this.paused || this._isPlayerDeployZoneActive()) return;
    if (!this.fireSupport.isReady(type) && this.fireSupport.pending !== type) return;
    this.cancelSmokeShellTargeting();
    this.fireSupport.arm(type);
    // Command-net acknowledgement when arming (not when clicking again to cancel arm)
    if (this.fireSupport.pending === type) {
      this._playCommanderOrder(type);
    }
    this._syncBattleCursor();
    this.ui?.updateFireSupport(this.fireSupport);
  }

  tryGeneralOrder(type) {
    if (!this.running || this.gameOver || this.paused || this._isPlayerDeployZoneActive()) return;
    if (!this.generalOrders.issue(type)) return;
    // Command-net acknowledgement when issuing (not when cancelling an active order)
    if (this.generalOrders.getActiveType() === type) {
      this._playCommanderOrder(type);
    }
    this.ui?.updateGeneralOrders(this.generalOrders);
  }

  /** Faction command-net acknowledgement for fire support / general orders. */
  _playCommanderOrder(kind) {
    this._playTeamCommanderOrder(kind, PLAYER_TEAM);
  }

  _playTeamCommanderOrder(kind, team) {
    const faction = team === PLAYER_TEAM ? this.playerFaction : this.enemyFaction;
    const factionId = faction?.id ?? null;
    const radioOperator = getRadioOperators(this.units, team)[0];
    const commander = getFieldCommander(this, team);
    const hq = this.hqs.find((h) => h.team === team && !h.dead);
    const teamUnit = this.units.find((u) => u.team === team && !u.dead);
    const pos = radioOperator?.position
      ?? (!commander?.dead ? commander?.position : null)
      ?? hq?.position
      ?? teamUnit?.position
      ?? (team === PLAYER_TEAM && this.clearance && this.mapDef
        ? getClearanceStagingAnchor(this.mapDef, this.clearanceRole).position
        : this.cameraTarget
          ? { x: this.cameraTarget.x, z: this.cameraTarget.z }
          : null);
    sounds.playCommanderOrder(kind, factionId, pos);
  }

  armSmokeShell() {
    if (!this.running || this.gameOver || this.paused || this._isPlayerDeployZoneActive()) return;
    const artillery = this._playerAlive.filter(
      (u) => u.selected && isSmokeShellReady(u)
    );
    if (artillery.length === 0) return;

    if (this.smokeShellTargeting) {
      this.cancelSmokeShellTargeting();
      return;
    }

    this.fireSupport?.cancel();
    this.smokeShellTargeting = true;
    sounds.play('select');
    this._syncBattleCursor();
    this.ui?.updateSmokeShell(this);
    this.ui?.updateFireSupport(this.fireSupport);
  }

  handleSmokeShellTarget(mode, x, z) {
    if (!this.running || this.gameOver || this._isPlayerDeployZoneActive()) return;
    if (!this.smokeShellTargeting) return;

    if (mode === 'preview') {
      this.smokeScreens.updatePreview(x, z);
      return;
    }

    if (mode !== 'place') return;

    const selected = this._playerAlive.filter(
      (u) => u.selected && isSmokeShellReady(u)
    );
    if (selected.length === 0) return;

    // One mission uses one gun; multi-select no longer produces a simultaneous smoke salvo.
    selected.sort(
      (a, b) =>
        Math.hypot(a.position.x - x, a.position.z - z) -
        Math.hypot(b.position.x - x, b.position.z - z)
    );
    const firingGun = selected[0];
    firingGun.setSmokeShellOrder(x, z);

    this.smokeShellTargeting = false;
    this._clearDirectionalPlacement();
    this.smokeScreens.clearPreview();
    sounds.play('order');
    this.ui?.updateSmokeShell(this);
    this.ui?.updateFireMissionControls(this._countActiveFireMissions());
    this._syncBattleCursor();
    this.ui?.updateSelection(
      [firingGun],
      this.controller?.hoveredTarget,
      this.selectedHq,
      this
    );
  }

  _screenToGround(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return null;
    }
    this.controller.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.controller.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    return this.controller.raycastGround();
  }

  placeDefenseAtScreen(clientX, clientY) {
    if (!this.running || this.gameOver || !this.defenses?.getPending()) return;
    const ground = this._screenToGround(clientX, clientY);
    if (ground) this.handleDefensePlacement('place', ground.x, ground.z);
  }

  placeLastStandAtScreen(clientX, clientY) {
    if (!this.running || this.gameOver || !isLastStandDeployPhase(this) || !this.lastStand?.pendingType) {
      return;
    }
    const ground = this._screenToGround(clientX, clientY);
    if (ground) this.handleLastStandPlacement('place', ground.x, ground.z);
  }

  _syncPlacementCapture() {
    const active =
      (this.running && !this.gameOver && !!this.defenses?.getPending()) ||
      (this.running && !this.gameOver && !!this.engineerSandbags?.getPending()) ||
      (this.running && !this.gameOver && !!this.infantryTrenches?.getPending()) ||
      (this.running && !this.gameOver && !!this.medicFieldHospitals?.getPending()) ||
      (this.running && !this.gameOver && !!this.baseBuildings?.getPending()) ||
      (this.running &&
        !this.gameOver &&
        isLastStandDeployPhase(this) &&
        !!this.lastStand?.pendingType);
    this.ui?.setPlacementCapture(active);
  }

  cancelPendingConstructionPlacement(selected = []) {
    let cancelled = false;
    if (this.engineerSandbags?.getPending()) {
      this.engineerSandbags.cancel();
      this.ui?.updateEngineerBuild(this);
      cancelled = true;
    }
    if (this.infantryTrenches?.getPending()) {
      this.infantryTrenches.cancel();
      this.ui?.updateInfantryTrench(this);
      cancelled = true;
    }
    if (this.medicFieldHospitals?.getPending()) {
      this.medicFieldHospitals.cancel();
      this.ui?.updateMedicTent(this);
      cancelled = true;
    }
    if (this.baseBuildings?.getPending()) {
      this.baseBuildings.cancelPending();
      this.ui?.updateBaseBuild(this);
      cancelled = true;
    }
    for (const unit of selected) {
      const sandbagCancelled = this.engineerSandbags?.cancelForUnit?.(unit);
      const trenchCancelled = this.infantryTrenches?.cancelForUnit?.(unit);
      const medicTentCancelled = this.medicFieldHospitals?.cancelForUnit?.(unit);
      if (sandbagCancelled) this.ui?.updateEngineerBuild(this);
      if (trenchCancelled) this.ui?.updateInfantryTrench(this);
      if (medicTentCancelled) this.ui?.updateMedicTent(this);
      cancelled =
        sandbagCancelled || trenchCancelled || medicTentCancelled || cancelled;
    }
    if (cancelled) {
      this._syncPlacementCapture();
      this._syncBattleCursor();
    }
    return cancelled;
  }

  armEngineerBuild(buildType) {
    if (!this.running || this.gameOver) return;
    const mgr = this.engineerSandbags;
    if (!mgr) return;
    if (buildType === 'sandbags' && !mgr.canBuildSandbags()) return;
    if (buildType === 'bunker' && !mgr.canBuildBunker()) return;
    if (this._isPlayerDeployZoneActive()) return;
    this.infantryTrenches?.cancel?.();
    this.medicFieldHospitals?.cancel?.();
    const hasEngineer = this._playerAlive.some(
      (u) => u.selected && u.def?.type === 'engineer' && !u.dead && !u._sandbagSite
    );
    if (!hasEngineer) return;
    sounds.unlock();
    if (!mgr.arm(buildType)) {
      this.ui?.updateEngineerBuild(this);
      this._syncPlacementCapture();
      this._syncBattleCursor();
      return;
    }
    this.ui?.updateEngineerBuild(this);
    this._syncPlacementCapture();
    this._syncBattleCursor();
  }

  armSandbagBuild() {
    this.armEngineerBuild('sandbags');
  }

  armBunkerBuild() {
    this.armEngineerBuild('bunker');
  }

  armMineBuild() {
    this.armEngineerBuild('mine');
  }

  armTrenchDig() {
    if (!this.running || this.gameOver) return;
    const mgr = this.infantryTrenches;
    if (!mgr?.canUse()) return;
    if (this._isPlayerDeployZoneActive()) return;
    const hasDigger = this._playerAlive.some(
      (u) =>
        u.selected &&
        !u.dead &&
        !u._trenchDigSite &&
        !u._trenchId &&
        canDigTrenchType(u.def?.type)
    );
    if (!hasDigger) return;
    sounds.unlock();
    this.engineerSandbags?.cancel?.();
    this.medicFieldHospitals?.cancel?.();
    if (!mgr.arm()) {
      this.ui?.updateInfantryTrench(this);
      this._syncPlacementCapture();
      this._syncBattleCursor();
      return;
    }
    this.ui?.updateInfantryTrench(this);
    this._syncPlacementCapture();
    this._syncBattleCursor();
  }

  /** Selected radio operators use binoculars to extend fire-support observation range. */
  useRadioBinoculars() {
    if (!this.running || this.gameOver || this.paused) return false;
    if (this._isPlayerDeployZoneActive()) return false;
    const operators = (this._playerAlive ?? this.units).filter(
      (u) => u.selected && canUseRadioBinoculars(u)
    );
    if (!operators.length) return false;
    if (this._cancelPendingRadioOperatorStrikeForUnits(operators)) return false;
    sounds.unlock();
    let used = 0;
    for (const unit of operators) {
      if (activateRadioBinoculars(unit)) used += 1;
    }
    if (used > 0) {
      sounds.play('order');
      this.ui?.updateRadioBinoculars?.(this);
      this.ui?.updateFireSupport?.(this.fireSupport);
      this.ui?.updateSelection?.(
        this._playerAlive?.filter((u) => u.selected) ?? [],
        this.controller?.hoveredTarget,
        this.selectedHq,
        this
      );
    }
    return used > 0;
  }

  _clearDirectionalPlacement(kind = null) {
    if (kind && this._directionalPlacement?.kind !== kind) return;
    const marker = this._directionalPlacementMarker;
    if (marker) {
      if (marker.parent) marker.parent.remove(marker);
      marker.traverse((child) => {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) child.material.forEach((mat) => mat.dispose?.());
        else child.material?.dispose?.();
      });
    }
    this._directionalPlacementMarker = null;
    this._directionalPlacement = null;
  }

  _defaultDirectionalYaw(kind, x, z) {
    if (kind === 'engineer') return this.engineerSandbags?._facingYaw('player', x, z) ?? 0;
    if (kind === 'trench') return this.infantryTrenches?._facingYaw('player', x, z) ?? 0;
    return this.baseBuildings?._facingYaw('player', x, z) ?? 0;
  }

  _beginDirectionalPlacement(kind, type, x, z) {
    this._clearDirectionalPlacement();
    const y = this.mapDef ? sampleTerrainHeight(x, z, this.mapDef) : 0;
    const yaw = this._defaultDirectionalYaw(kind, x, z);
    const marker = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.5, 2.85, 32),
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    marker.add(ring);
    const arrow = new THREE.ArrowHelper(
      new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)),
      new THREE.Vector3(0, 0.3, 0),
      7,
      0xffe36b,
      1.8,
      1.05
    );
    marker.add(arrow);
    marker.position.set(x, y + 0.15, z);
    marker.renderOrder = 12;
    marker.userData.facingArrow = arrow;
    this.scene.add(marker);
    this._directionalPlacementMarker = marker;
    this._directionalPlacement = { kind, type, x, z, yaw };
  }

  _updateDirectionalPlacementFacing(x, z) {
    const placement = this._directionalPlacement;
    if (!placement) return;
    const dx = x - placement.x;
    const dz = z - placement.z;
    if (Math.hypot(dx, dz) < 0.75) return;
    placement.yaw = Math.atan2(dx, dz);
    this._directionalPlacementMarker?.userData?.facingArrow?.setDirection(
      new THREE.Vector3(Math.sin(placement.yaw), 0, Math.cos(placement.yaw))
    );
  }

  _handleDirectionalPlacement(kind, type, mode, x, z, validate, commit) {
    const current = this._directionalPlacement;
    if (mode === 'preview') {
      if (current?.kind === kind && current.type === type) {
        this._updateDirectionalPlacementFacing(x, z);
      }
      return true;
    }
    if (!current || current.kind !== kind || current.type !== type) {
      this._clearDirectionalPlacement();
      const reason = validate(x, z);
      if (reason) return reason;
      this._beginDirectionalPlacement(kind, type, x, z);
      sounds.play('select');
      return true;
    }
    this._updateDirectionalPlacementFacing(x, z);
    const placed = commit(current.x, current.z, current.yaw);
    if (placed) this._clearDirectionalPlacement();
    return placed;
  }

  handleTrenchPlacement(mode, x, z) {
    if (!this.running || this.gameOver || !this.infantryTrenches?.getPending()) return;
    const placed = this._handleDirectionalPlacement(
      'trench',
      'trench',
      mode,
      x,
      z,
      (px, pz) => this.infantryTrenches.getPlacementRejectReason(px, pz, PLAYER_TEAM),
      (px, pz, yaw) => this.infantryTrenches.tryPlace(px, pz, PLAYER_TEAM, yaw)
    );
    if (typeof placed === 'string') this.ui?.showInfantryTrenchHint(placed);
    else if (placed && !this._directionalPlacement && mode !== 'preview') sounds.play('select');
    this.ui?.updateInfantryTrench(this);
    this._syncPlacementCapture();
    this._syncBattleCursor();
  }

  placeTrenchAtScreen(clientX, clientY) {
    if (!this.running || this.gameOver || !this.infantryTrenches?.getPending()) return;
    const ground = this._screenToGround(clientX, clientY);
    if (ground) this.handleTrenchPlacement('place', ground.x, ground.z);
  }

  armMedicTent() {
    if (!this.running || this.gameOver) return;
    const mgr = this.medicFieldHospitals;
    if (!mgr?.canUse()) return;
    if (this._isPlayerDeployZoneActive()) return;
    const hasMedic = this._playerAlive.some(
      (u) =>
        u.selected &&
        !u.dead &&
        u.def?.type === 'medic' &&
        !u._medicTentSite
    );
    if (!hasMedic) return;
    sounds.unlock();
    this.engineerSandbags?.cancel?.();
    this.infantryTrenches?.cancel?.();
    if (!mgr.arm()) {
      this.ui?.updateMedicTent(this);
      this._syncPlacementCapture();
      this._syncBattleCursor();
      return;
    }
    this.ui?.updateMedicTent(this);
    this._syncPlacementCapture();
    this._syncBattleCursor();
  }

  handleMedicTentPlacement(mode, x, z) {
    if (!this.running || this.gameOver || !this.medicFieldHospitals?.getPending()) return;
    if (mode === 'preview') return;
    const placed = this.medicFieldHospitals.tryPlace(x, z, PLAYER_TEAM);
    if (placed) sounds.play('select');
    else {
      const reason = this.medicFieldHospitals.getPlacementRejectReason(x, z, PLAYER_TEAM);
      if (reason) this.ui?.showMedicTentHint(reason);
    }
    this.ui?.updateMedicTent(this);
    this._syncPlacementCapture();
    this._syncBattleCursor();
  }

  placeMedicTentAtScreen(clientX, clientY) {
    if (!this.running || this.gameOver || !this.medicFieldHospitals?.getPending()) return;
    const ground = this._screenToGround(clientX, clientY);
    if (ground) this.handleMedicTentPlacement('place', ground.x, ground.z);
  }

  handleSandbagPlacement(mode, x, z) {
    if (!this.running || this.gameOver || !this.engineerSandbags?.getPending()) return;
    const type = this.engineerSandbags.getPending();
    if (type === 'mine') {
      if (mode === 'preview') return;
      const placed = this.engineerSandbags.tryPlace(x, z, PLAYER_TEAM, 0);
      if (placed) sounds.play('select');
      else {
        const reason = this.engineerSandbags.getPlacementRejectReason(
          x,
          z,
          PLAYER_TEAM,
          type
        );
        if (reason) this.ui?.showEngineerBuildHint(reason);
      }
      this.ui?.updateEngineerBuild(this);
      this._syncPlacementCapture();
      this._syncBattleCursor();
      return;
    }
    const placed = this._handleDirectionalPlacement(
      'engineer',
      type,
      mode,
      x,
      z,
      (px, pz) => this.engineerSandbags.getPlacementRejectReason(px, pz, PLAYER_TEAM, type),
      (px, pz, yaw) => this.engineerSandbags.tryPlace(px, pz, PLAYER_TEAM, yaw)
    );
    if (typeof placed === 'string') this.ui?.showEngineerBuildHint(placed);
    else if (placed && !this._directionalPlacement && mode !== 'preview') sounds.play('select');
    this.ui?.updateEngineerBuild(this);
    this._syncPlacementCapture();
    this._syncBattleCursor();
  }

  placeSandbagAtScreen(clientX, clientY) {
    if (!this.running || this.gameOver || !this.engineerSandbags?.getPending()) return;
    const ground = this._screenToGround(clientX, clientY);
    if (ground) this.handleSandbagPlacement('place', ground.x, ground.z);
  }

  armBaseBuilding(typeId) {
    if (!this.running || this.gameOver || !this.baseBuildings?.active) return;
    if (this._isPlayerDeployZoneActive()) return;
    sounds.unlock();
    if (!this.baseBuildings.arm(typeId)) return;
    this.ui?.updateBaseBuild(this);
    this._syncPlacementCapture();
    this._syncBattleCursor();
  }

  handleBaseBuildingPlacement(mode, x, z) {
    if (!this.running || this.gameOver || !this.baseBuildings?.getPending()) return;
    const type = this.baseBuildings.getPending();
    let placed;
    if (type === 'bunker') {
      placed = this._handleDirectionalPlacement(
        'base',
        type,
        mode,
        x,
        z,
        (px, pz) => this.baseBuildings.getPlacementRejectReason(px, pz, PLAYER_TEAM, type),
        (px, pz, yaw) =>
          this.baseBuildings.tryPlace(
            px,
            pz,
            PLAYER_TEAM,
            (cost) => this.spendResources(PLAYER_TEAM, cost),
            yaw
          )
      );
      if (typeof placed === 'string') this.ui?.showBaseBuildHint?.(placed);
    } else {
      if (mode === 'preview') return;
      placed = this.baseBuildings.tryPlace(x, z, PLAYER_TEAM, (cost) =>
        this.spendResources(PLAYER_TEAM, cost)
      );
    }
    if (placed === true && !this._directionalPlacement) {
      sounds.play('select');
      this.ui.updateResources(this.resources.player, this.capturePoints, this.cheatMode);
    }
    this.ui?.updateBaseBuild(this);
    this._syncPlacementCapture();
    this._syncBattleCursor();
  }

  placeBaseBuildingAtScreen(clientX, clientY) {
    if (!this.running || this.gameOver || !this.baseBuildings?.getPending()) return;
    const ground = this._screenToGround(clientX, clientY);
    if (ground) this.handleBaseBuildingPlacement('place', ground.x, ground.z);
  }

  handleDefensePlacement(mode, x, z) {
    if (!this.running || this.gameOver || !this.defenses) return;
    if (mode === 'preview') return;

    if (mode === 'pick') {
      if (this.defenses.getPending()) return;
      const picked = this.defenses.pickAt(x, z);
      this.defenses.selectEntry(picked);
      this.ui?.updateDefenses(this);
      return;
    }

    const pending = this.defenses.getPending();
    if (pending === 'barrage') {
      if (!hasRadioOperator(this, PLAYER_TEAM)) {
        this.defenses.cancelPending();
        return;
      }
      if (this.defenses.tryBarrage(x, z)) {
        this.ui?.updateDefenses(this);
        this._syncPlacementCapture();
        this._syncBattleCursor();
      }
      return;
    }

    if (pending) {
      const placed = this.defenses.tryPlace(pending, x, z, (cost) =>
        this.spendResources(PLAYER_TEAM, cost)
      );
      if (placed) {
        void sounds.primeForCombat();
        this.ui?.updateDefenses(this);
        this.ui?.updateResources(Math.floor(this.resources.player), this.capturePoints, this.cheatMode);
        this._syncPlacementCapture();
        this._syncBattleCursor();
        return;
      }
      const reason = this.defenses.getPlacementRejectReason(x, z, pending);
      if (reason) this.ui?.showDefensePlacementHint(reason, this);
      this.ui?.updateDefenses(this);
      return;
    }

    const picked = this.defenses.pickAt(x, z);
    if (picked) this.defenses.selectEntry(picked);
    this.ui?.updateDefenses(this);
  }

  _cancelPendingRadioOperatorStrikeForUnits(units = []) {
    if (!this.fireSupport?.hasPendingStrike?.()) return false;
    const touchedRadio = (units ?? []).some(
      (unit) => unit?.team === PLAYER_TEAM && unit?.def?.type === 'radioOperator'
    );
    if (!touchedRadio) return false;

    this.fireSupport.cancelPendingStrike();
    this.ui?.showSaveToast?.('Pending fire-support strike cancelled — radio operator manually tasked');
    this.ui?.updateFireSupport?.(this.fireSupport);
    this._syncBattleCursor();
    return true;
  }

  _resumePendingRadioOperatorStrike(queued) {
    const radio = this.units.find((unit) => unit.id === queued?.radioId);
    if (!radio || radio.dead || radio.moveTarget) return false;
    return !!this._orderRadioOperatorIntoSupportRange(queued.x, queued.z, {
      radioId: queued.radioId,
      silent: true,
    });
  }

  _orderRadioOperatorIntoSupportRange(x, z, { radioId = null, silent = false } = {}) {
    if (!this.radioOperatorAutoMove || !this.fireSupport || !this.mapDef) return false;

    const radios = getRadioOperators(this.units, PLAYER_TEAM).filter(
      (radio) => radioId == null || radio.id === radioId
    );
    if (!radios.length) return false;

    const outOfRange = radios.filter((radio) => {
      const range = getRadioOperatorSupportRange(radio);
      return Math.hypot(radio.position.x - x, radio.position.z - z) > range;
    });
    // Do not pull another operator forward merely because the closest one has
    // a blocked LOS: this convenience order is specifically for a range miss.
    if (outOfRange.length !== radios.length) return false;

    const candidates = outOfRange
      .map((radio) => ({
        radio,
        destination: getRadioOperatorSupportRelayDestination(this, radio, x, z, {
          seekCover: getSeekCoverEnabled(radio, this.seekCoverMode),
        }),
      }))
      .filter((candidate) => candidate.destination)
      .sort(
        (a, b) =>
          Math.hypot(a.radio.position.x - x, a.radio.position.z - z) -
          Math.hypot(b.radio.position.x - x, b.radio.position.z - z)
      );
    const selected = candidates[0];
    if (!selected) return false;

    const { radio, destination } = selected;
    const currentGoal = radio._finalMoveGoal;
    const alreadyOrdered =
      radio._userMoveOrder &&
      radio.moveTarget &&
      currentGoal &&
      Math.hypot(currentGoal.x - destination.x, currentGoal.z - destination.z) <= 2;
    if (!alreadyOrdered) {
      radio.moveTo(
        destination.x,
        destination.z,
        this.mapDef,
        true,
        this.scenery
      );
      if (!silent) sounds.play('order');
    }

    this.fireSupport.targetRejectReason = destination.covered
      ? 'Automatic radio positioning: the nearest radio operator is moving into covered support range.'
      : 'Automatic radio positioning: the nearest radio operator is moving into support range.';
    return selected;
  }

  tryUpgradeDefense() {
    if (!this.running || this.gameOver || !this.defenses) return false;
    const ok = this.defenses.tryUpgrade((cost) => this.spendResources(PLAYER_TEAM, cost));
    if (ok) {
      this.ui?.updateDefenses(this);
      this.ui?.updateResources(Math.floor(this.resources.player), this.capturePoints);
    }
    return ok;
  }

  tryResupplyDefense() {
    if (!this.running || this.gameOver || !this.defenses) return false;
    const ok = this.defenses.tryResupply((cost) => this.spendResources(PLAYER_TEAM, cost));
    if (ok) {
      this.ui?.updateDefenses(this);
      this.ui?.updateResources(Math.floor(this.resources.player), this.capturePoints);
    } else if (this.defenses.getSelected() && !this.defenses.canResupply()) {
      this.ui?.showDefensePlacementHint?.('Emplacement ammo is already full.', this);
    } else {
      const entry = this.defenses.getSelected();
      const cost = entry ? entry.def?.resupplyCost ?? 10 : 0;
      if (entry && Math.floor(this.resources.player) < cost) {
        this.ui?.showDefensePlacementHint?.(`Need ${cost} defense points to resupply.`, this);
      }
    }
    return ok;
  }

  armDefense(typeId) {
    if (!this.running || this.gameOver || !this.defenses) return;
    sounds.unlock();
    void sounds.primeForCombat();
    this.fireSupport?.cancel();
    if (!this.defenses.arm(typeId)) {
      if (typeId === 'artillery' && this.defenses.isArtilleryPitCapReached()) {
        this.ui?.showDefensePlacementHint(
          'Maximum 3 artillery pits — each extra pit shortens barrage cooldown.',
          this
        );
      }
      return;
    }
    this.ui?.updateDefenses(this);
    this._syncPlacementCapture();
    this._syncBattleCursor();
  }

  armTowerDefenseBarrage() {
    if (!this.running || this.gameOver || !this.defenses) return;
    if (!hasRadioOperator(this, PLAYER_TEAM)) return;
    sounds.unlock();
    if (!this.defenses.armBarrage()) return;
    this.ui?.updateDefenses(this);
    this._syncPlacementCapture();
    this._syncBattleCursor();
  }

  tryProduce(unitType) {
    if (!this.running || this.gameOver) return false;
    if (this.clearance) return false;
    if (this.towerDefense && !isTdHqDefenseStyle(this.towerDefense)) return false;

    if (this.paused) return false;
    if (isPlayerStagingPhase(this)) return false;

    if (this.lastStand) {
      if (isLastStandPresetDeployMode(this.lastStand.deployMode)) return false;
      if (this.lastStand.phase !== 'deploy') return false;
      const def = this.playerFaction?.units?.[unitType];
      if (!def) return false;
      if (this.lastStand.pendingType === unitType) {
        this.lastStand.pendingType = null;
        sounds.play('select');
        this.ui?.updateLastStandDeploy(this);
        this.ui?.updateProduction(this);
        this._syncPlacementCapture();
        this._syncBattleCursor();
        return true;
      }
      if (
        unitType === 'radioOperator' &&
        !canAddRadioOperator(this.units, PLAYER_TEAM)
      ) {
        this.ui?.showSaveToast?.('Radio net is at capacity (3).');
        return false;
      }
      if (!this.cheatMode && this.lastStand.supplies.player < def.cost) return false;
      this.lastStand.pendingType = this.lastStand.pendingType === unitType ? null : unitType;
      sounds.play('select');
      this.ui?.updateLastStandDeploy(this);
      this.ui?.updateProduction(this);
      this._syncPlacementCapture();
      this._syncBattleCursor();
      return true;
    }

    const ok = this.production.enqueue(
      PLAYER_TEAM,
      unitType,
      (cost) => this.spendResources(PLAYER_TEAM, cost),
      { resources: this.resources.player }
    );
    if (ok) {
      sounds.play('produce');
      this.ui.updateProduction(this);
      this.ui.updateResources(this.resources.player, this.capturePoints, this.cheatMode);
    }
    return ok;
  }

  tickEconomy(dt) {
    if (this.lastStand || this.clearance) return;
    if (this.towerDefense) {
      if (isTdHqDefenseStyle(this.towerDefense)) {
        this.resources.player += HQ_INCOME_RATE * dt;
      }
      return;
    }
    const hqRate = this.campaign ? CAMPAIGN_BALANCE.hqIncomeRate : HQ_INCOME_RATE;
    const cpRate = this.campaign ? CAMPAIGN_BALANCE.captureIncomeRate : CAPTURE_POINT_INCOME;
    this.resources.player += hqRate * dt;
    if (!this.tutorial) {
      this.resources.enemy += hqRate * dt * this.difficulty.enemyIncomeMult;
    }

    for (const cp of this.capturePoints) {
      if (cp.owner === PLAYER_TEAM) this.resources.player += cpRate * dt;
      if (!this.tutorial && cp.owner === ENEMY_TEAM) {
        this.resources.enemy += cpRate * dt * this.difficulty.enemyIncomeMult;
      }
    }
  }

  updateCapturePoints(dt) {
    if (isBattleStagingPhase(this)) return;
    const alive = this._aliveUnits;
    for (const cp of this.capturePoints) {
      cp.update(alive, dt, (point, owner) => {
        if (owner === PLAYER_TEAM) sounds.play('capture');
      });
    }
    this._captureUiAccum += dt;
    if (this._captureUiAccum >= 0.25) {
      this._captureUiAccum = 0;
      this.ui?.updateCapturePoints(this.capturePoints);
    }
  }

  updateCamera(dt) {
    const panSpeed = 35 * dt;
    const rotateSpeed = 1.65 * dt;
    const dollySpeed = 42 * dt;
    const pad = this.ui?.getTabletCameraInput?.();

    if (this.keys['ArrowLeft'] || pad?.rotateLeft) this.cameraYaw += rotateSpeed;
    if (this.keys['ArrowRight'] || pad?.rotateRight) this.cameraYaw -= rotateSpeed;

    const shiftHeld = this.keys['ShiftLeft'] || this.keys['ShiftRight'];

    let panForward = 0;
    let panRight = 0;
    if (this.keys['KeyW'] || pad?.panForward) panForward += 1;
    if (this.keys['KeyS'] || pad?.panBack) panForward -= 1;
    if (shiftHeld) {
      if (this.keys['KeyA']) this.cameraYaw += rotateSpeed;
      if (this.keys['KeyD']) this.cameraYaw -= rotateSpeed;
    } else {
      if (this.keys['KeyA'] || pad?.panLeft) panRight -= 1;
      if (this.keys['KeyD'] || pad?.panRight) panRight += 1;
    }

    const viewForward = new THREE.Vector3();
    this.camera.getWorldDirection(viewForward);
    viewForward.y = 0;
    if (viewForward.lengthSq() > 0.0001) viewForward.normalize();
    const viewRight = new THREE.Vector3()
      .crossVectors(viewForward, new THREE.Vector3(0, 1, 0))
      .normalize();

    if (this.keys['ArrowUp']) {
      this.cameraTarget.addScaledVector(viewForward, dollySpeed);
    }
    if (this.keys['ArrowDown']) {
      this.cameraTarget.addScaledVector(viewForward, -dollySpeed);
    }

    const zoomRate = 52 * dt;
    if (pad?.zoomTap === 'zoomIn') {
      this.zoom = THREE.MathUtils.clamp(this.zoom - 5.5, this.zoomMin, this.zoomMax);
    } else if (pad?.zoomTap === 'zoomOut') {
      this.zoom = THREE.MathUtils.clamp(this.zoom + 5.5, this.zoomMin, this.zoomMax);
    }
    if (pad?.zoomIn) {
      this.zoom = THREE.MathUtils.clamp(this.zoom - zoomRate, this.zoomMin, this.zoomMax);
    }
    if (pad?.zoomOut) {
      this.zoom = THREE.MathUtils.clamp(this.zoom + zoomRate, this.zoomMin, this.zoomMax);
    }
    this.ui?.clearTabletCameraZoomTap?.();

    this.cameraTarget.addScaledVector(viewForward, panForward * panSpeed);
    this.cameraTarget.addScaledVector(viewRight, panRight * panSpeed);

    const half = this.mapDef ? this.mapDef.size / 2 - 5 : 50;
    this.cameraTarget.x = THREE.MathUtils.clamp(this.cameraTarget.x, -half, half);
    this.cameraTarget.z = THREE.MathUtils.clamp(this.cameraTarget.z, -half, half);

    const z = this.zoom;
    const horizontalDist = z * 0.89;
    const camOffset = new THREE.Vector3(
      Math.sin(this.cameraYaw) * horizontalDist,
      z * 0.9,
      Math.cos(this.cameraYaw) * horizontalDist
    );
    const desiredPos = this.cameraTarget.clone().add(camOffset);
    this.camera.position.lerp(desiredPos, 0.08);
    this.camera.lookAt(this.cameraTarget);
  }

  _countAlive(team) {
    const units = team === PLAYER_TEAM ? this._playerAlive : this._enemyAlive;
    return units.filter((unit) => unit.def?.type !== 'commander').length;
  }

  /** HUD panels — throttled so DOM work does not scale with frame rate. */
  _tickBattleHud() {
    if (!this.ui || this.gameOver) return;

    const playerAlive = this._countAlive(PLAYER_TEAM);
    const enemyAlive = this._countAlive(ENEMY_TEAM);

    const tdHqDefense = isTdHqDefenseStyle(this.towerDefense);
    this.ui.updateArmyStats(playerAlive, enemyAlive, {
      tutorial: this.tutorial,
      assault: this.assault,
      clearance: this.clearance,
      clearanceRole: this.clearanceRole,
      clearanceTimeLimit: CLEARANCE_TIME_LIMIT,
      clearanceTimeLimitEnabled: this.clearanceTimeLimitEnabled,
      clearanceReinforcements: this.clearanceReinforcements,
      matchTime: this.matchTime,
      towerDefense: this.towerDefense,
      tdHqDefense,
      defenseCount: this.defenses?.entries.filter((e) => !e.destroyed).length ?? 0,
      wipeHint: this._getArmyWipeHint(playerAlive),
    });
    const lastStandDeploy = !!(this.lastStand && this.lastStand.phase === 'deploy');
    const hudSupplies = this.lastStand
      ? lastStandDeploy && !isLastStandPresetForce(this)
        ? this.lastStand.supplies.player
        : 0
      : this.resources.player;
    this.ui.updateResources(Math.floor(hudSupplies), this.capturePoints, this.cheatMode, {
      lastStand: !!this.lastStand,
      lastStandDeploy,
      towerDefense: !!this.towerDefense,
      tdHqDefense,
    });
    if (!this.towerDefense) this.ui.updateCapturePoints(this.capturePoints);
    if (!this.towerDefense || tdHqDefense) this.ui.updateProduction(this, { skipResources: true });
    if (this.baseBuildings?.active) this.ui.updateBaseBuild(this);
    if (this.towerDefense && !tdHqDefense) {
      this.ui.updateDefenses(this);
    }
    if (this.towerDefense) {
      this.ui.updateTowerDefense(this);
    }
    if (this.assault) this.ui.updateAssaultHUD(this.assault);
    this.ui.updateFireMissionControls(this._countActiveFireMissions());
    this.ui.updateHqThreat(this._hqThreat);
  }

  checkVictory() {
    if (this.gameOver) return;

    const playerAlive = this._countAlive(PLAYER_TEAM);
    const enemyAlive = this._countAlive(ENEMY_TEAM);
    const enemyHQ = this.hqs.find((h) => h.team === ENEMY_TEAM);
    const playerHQ = this.hqs.find((h) => h.team === PLAYER_TEAM);

    const enemyHQDead = enemyHQ?.dead;
    const playerHQDead = playerHQ?.dead;
    const gracePeriod = this.matchTime < 4;

    if (this.tutorial) {
      if (!gracePeriod && enemyHQDead) {
        this.endGame(
          true,
          'Practice complete! You destroyed the target HQ. Return to the menu to play Frontline Command.'
        );
      }
      return;
    }

    if (this.lastStand) {
      const result = checkLastStandVictory(this);
      if (result) {
        this.endGame(result.victory, result.detail);
      }
      return;
    }

    if (gracePeriod) return;

    if (this.assault) {
      const result = checkAssaultVictory(this);
      if (result) {
        this.endGame(result.victory, result.detail);
      }
      return;
    }

    if (this.clearance) {
      const result = checkClearanceVictory(this);
      if (result) {
        this.endGame(result.victory, result.detail);
      }
      return;
    }

    if (this.towerDefense) {
      const result = checkTowerDefenseVictory(this);
      if (result) {
        this.endGame(result.victory, result.detail);
      }
      return;
    }

    const playerEliminated = teamIsEliminated(PLAYER_TEAM, this, playerAlive);
    const enemyEliminated = teamIsEliminated(ENEMY_TEAM, this, enemyAlive);

    if (enemyHQDead || enemyEliminated) {
      this.endGame(
        true,
        enemyHQDead ? 'Enemy headquarters destroyed!' : 'Enemy forces eliminated!'
      );
    } else if (playerHQDead || playerEliminated) {
      this.endGame(
        false,
        playerHQDead
          ? 'Your headquarters has fallen!'
          : 'Your army was destroyed and reinforcements could not be fielded.'
      );
    }
  }

  _getArmyWipeHint(playerAlive) {
    if (this.tutorial || this.clearance || this.lastStand || playerAlive > 0 || this.gameOver) {
      return null;
    }

    const queue = this.production.getQueue(PLAYER_TEAM).length;
    const res = Math.floor(this.resources.player);
    if (queue > 0) {
      return `Your forces: 0 · ${queue} reinforcement${queue === 1 ? '' : 's'} building`;
    }
    if (
      this.production.canAffordAny(PLAYER_TEAM, this.resources.player, {
        ignoreSelection: this.autoBuildMode,
      })
    ) {
      return this.autoBuildMode
        ? `Your forces: 0 · ${res} supplies — auto build will queue reinforcements`
        : `Your forces: 0 · ${res} supplies — train reinforcements in the panel below`;
    }
    const income = estimateTeamIncomePerSec(PLAYER_TEAM, this);
    if (income > 0) {
      return `Your forces: 0 · ${res} supplies (+${income.toFixed(1)}/s) — waiting to afford reinforcements`;
    }
    return null;
  }

  endGame(victory, detail) {
    if (this.gameOver) return;

    if (victory && this.activeSaveId) {
      deleteBattleSave(this.activeSaveId);
      this.activeSaveId = null;
    }

    this.gameOver = true;
    this.running = false;
    this.viewingBattlefield = false;
    this._postMatchRenderAccum = 0;
    this._pendingEnd = { victory, detail };

    this.controller.disable();
    this.canvas.style.cursor = '';
    this.targetIndicators?.clear();
    this.rangeRings?.clear();
    this.fireSupport?.cancel();
    this.fireSupport?.clearPreview();
    sounds.clearVehicleEngines();
    disposeDeployZoneRings(this._deployZoneRings, this.scene);
    this._deployZoneRings = [];

    for (const u of this.units) {
      u._userMoveOrder = false;
      u.moveTarget = null;
      u._movePath = null;
      if (u.dead) {
        removeCoverMarker(u);
        removeRetreatMarker(u);
      }
    }

    this._showEndOverlayNow(victory, detail);

    requestAnimationFrame(() => {
      if (!this.gameOver) return;
      this._purgeBattlefieldEffects();
      for (const h of this.hqs) {
        if (h.dead) this.battleStats.recordHq(h.team);
      }
      this.ui?.updateEndStats(this._buildEndBattleReport());
      sounds.playEndMusic(victory, this.playerFaction?.id);
    });
  }

  _finalizeBattleStats() {
    if (this._battleStatsFinalized) return;
    this._battleStatsFinalized = true;
    this.recordBattleLosses();
    this.battleStats.recordDefenseFromEntries(this.defenses?.entries);
  }

  _buildBattleStatsReport(options = {}) {
    return this.battleStats.buildReport({
      playerName: this.playerFaction.name,
      enemyName: this.enemyFaction.name,
      tutorial: this.tutorial,
      towerDefense: !!this.towerDefense,
      tdEndless: !!this.towerDefense?.endless,
      tdWavesCleared: this.towerDefense?.wavesCleared ?? 0,
      ...options,
    });
  }

  _buildCurrentBattleReport() {
    this.recordBattleLosses();
    return this._buildBattleStatsReport({ liveUnits: this.units });
  }

  _buildEndBattleReport() {
    this._finalizeBattleStats();
    return this._buildBattleStatsReport();
  }

  _purgeBattlefieldEffects() {
    clearPendingMortarImpacts();
    clearHqBurnEffects();
    clearCombatEffects();
    clearWreckEffects();
    clearVehicleCookOffs(this);
    clearFireSupportEffects();
    clearActiveParachuteDrops(this.scene);
    clearTerrainDamage(this.scene);
    this.fireSupport?.reset();
    this.enemyFireSupport?.reset();
    this.generalOrders?.reset();
    this.enemyGeneralOrders?.reset();
    this.smokeScreens?.reset();
    this.smokeShellTargeting = false;
  }

  /** No live units on the map — skip corpse churn while victory/defeat is resolved. */
  _handleEmptyBattlefield() {
    if (this._aliveUnits.length > 0 || this.gameOver || this._emptyFieldHandled) return;
    this._emptyFieldHandled = true;
  }

  _endOverlayMessage(victory, detail) {
    return `${victory ? this.playerFaction.name + ' victory' : 'Defeat'} at ${this.mapDef.name}. ${detail}`;
  }

  /** Victory/defeat panel — must be synchronous when the match ends. */
  _showEndOverlayNow(victory, detail) {
    if (this._endOverlayShown || !this.ui) return;
    this._endOverlayShown = true;
    this.ui.showEndOverlay(victory, this._endOverlayMessage(victory, detail), null, !!this.lastSession);
  }

  /** Dismiss the results modal and explore the map with camera controls only. */
  enterPostMatchView() {
    if (!this.gameOver || this.viewingBattlefield) return;
    this.viewingBattlefield = true;
    this.setTabletTargetMode(false);
    this.setTabletFireMode(false);
    this.ui.hideEndOverlay({ clearStats: false });
    this.ui.showPostMatchViewBar();
    this._applyPendingDeathVisuals();
    this._postMatchRenderAccum = 0;
  }

  exitPostMatchView() {
    if (!this.gameOver || !this.viewingBattlefield) return;
    this.viewingBattlefield = false;
    this.ui.hidePostMatchViewBar();
    const { victory, detail } = this._pendingEnd ?? { victory: false, detail: '' };
    this.ui.showEndOverlay(
      victory,
      this._endOverlayMessage(victory, detail),
      this._buildEndBattleReport(),
      !!this.lastSession
    );
  }

  _applyPendingDeathVisuals() {
    for (const u of this.units) {
      if (!u.dead || !u.mesh?.parent || u.mesh.userData?.deathVisualApplied) continue;
      applyUnitDeathVisual(u);
      if (isArmoredCombatVehicle(u.def?.type) && u.mesh.userData?.wreckApplied) {
        if (!u._vehicleKillFxDone) {
          triggerVehicleKillFx(this, u, { x: u.position.x, y: u.position.y, z: u.position.z });
        } else if (!u.wreckFire) {
          u.wreckFire = u._recoverableWreck
            ? spawnRecoverableWreckSmoke(this.scene, u.position, u.mesh)
            : spawnTankWreckFire(this.scene, u.position, u.mesh);
        }
      }
    }
    this._rebuildUnitCaches();
  }

  _presentEndScreen(victory, detail) {
    this._pendingEnd = { victory, detail };
    this._showEndOverlayNow(victory, detail);
    this.ui?.updateEndStats(this._buildEndBattleReport());
    sounds.playEndMusic(victory, this.playerFaction?.id);
  }

  recordBattleLosses() {
    for (const u of this.units) {
      if (u.dead) this.battleStats.recordUnit(u);
    }
    for (const h of this.hqs) {
      if (h.dead) this.battleStats.recordHq(h.team);
    }
  }

  _recordMinimapCombatFire({ attacker, def, from, to, coaxFire, paratrooperAtFire }) {
    if (!this.running || this.gameOver || !from || !to) return;
    let weaponType = coaxFire ? 'machineGun' : def?.type ?? 'infantry';
    if (def?.type === 'paratrooper' && !paratrooperAtFire) {
      const useMg = def.usesMG && (attacker._mgVolley ?? 0) % 2 !== 0;
      weaponType = useMg ? 'machineGun' : 'infantry';
    }
    this.ui?.recordMinimapFire?.({
      fromX: from.x,
      fromZ: from.z,
      toX: to.x,
      toZ: to.z,
      team: attacker?.team,
      weaponType,
    });
  }

  onCombatFire({
    attacker,
    target,
    def,
    dist,
    killed,
    targetIsHQ,
    targetIsScenery,
    groundImpact,
    smokeMiss,
    smokeDeployed,
    from,
    to,
    coaxFire,
    paratrooperAtFire,
    handGrenade,
    armorHit,
    mortarLoft,
    mortarImpact,
    artilleryLoft,
    artilleryImpact,
    buildingIntercept,
  }) {
    this._recordMinimapCombatFire({ attacker, def, from, to, coaxFire, paratrooperAtFire });
    const delayedIndirectImpact = mortarImpact || artilleryImpact;
    if (
      !delayedIndirectImpact &&
      !coaxFire &&
      !paratrooperAtFire &&
      (def?.type === 'antiTankGun' || def?.type === 'artillery')
    ) {
      spawnShellCasing(this.scene, attacker);
    }
    const pos = { x: from.x, z: from.z };
    const factionId = attacker?.faction?.id;
    const smallArmsFire = coaxFire || isSmallArmsFireType(def?.type);
    const smallArmsImpactType =
      smallArmsFire && target?.def && isArmoredCombatVehicle(target.def.type)
        ? 'bullet_metal'
        : smallArmsFire && targetIsScenery
          ? 'bullet_structure'
          : smallArmsFire && (target?.isDefense || target?.isBaseBuilding)
            ? 'bullet_structure'
            : smallArmsFire && groundImpact
              ? 'bullet'
              : null;

    if (handGrenade) {
      sounds.playImpact('explosion', { x: to.x, z: to.z }, 0);
      if (killed && target?.def && isArmoredCombatVehicle(target.def.type)) {
        triggerVehicleKillFx(this, target, to);
      }
      return;
    }

    // Delayed HE detonation (mortar / artillery) at the locked aim point.
    if (mortarImpact || artilleryImpact) {
      if (!Number.isFinite(to?.x) || !Number.isFinite(to?.z) || !this.scene || !this.mapDef) {
        return;
      }
      const waterShellImpact = isUrbanCanalWater(to.x, to.z, this.mapDef);
      if (waterShellImpact) {
        const calibreScale = THREE.MathUtils.clamp((def?.caliber ?? 81) / 88, 0.68, 1.85);
        spawnWaterImpact(this.scene, { x: to.x, y: 0.09, z: to.z }, calibreScale);
      } else if (artilleryImpact) {
        spawnArtilleryExplosion(this.scene, to, 'artillery', def?.caliber);
        this._spawnExplosionCrater(to.x, to.z, 'heavy');
      } else {
        spawnShellExplosion(this.scene, to, 'medium', def?.caliber);
        this._spawnExplosionCrater(to.x, to.z, shellCraterTier(def));
      }
      if (artilleryImpact) {
        sounds.playArtilleryImpact({ x: to.x, z: to.z }, { kind: 'artillery', delaySec: 0 });
      } else {
        sounds.playImpact('shell', { x: to.x, z: to.z }, 0);
      }
      return;
    }

    if (coaxFire) {
      sounds.playWeapon(def?.mgWeaponSound ?? mgProfileForFaction(factionId), pos, {
        rate: 0.995 + Math.random() * 0.02,
        volume: 0.82,
      });
      if (smokeMiss) {
        const missDelay = 0.04 + Math.min(dist ?? 0, 520) / 360;
        sounds.playImpact('bullet_whiz', { x: to.x, z: to.z }, missDelay);
        sounds.playImpact('bullet', { x: to.x, z: to.z }, missDelay + 0.06);
        return;
      }
      if (smallArmsImpactType) {
        sounds.playImpact(
          smallArmsImpactType,
          { x: to.x, z: to.z },
          0.03 + (dist ?? 0) / 350
        );
      }
      if (killed && target?.def && isInfantryUnitType(target.def.type)) {
        sounds.playInfantryDeath(
          { x: to.x, z: to.z },
          target.faction?.id,
          { team: target.team }
        );
      } else if (killed && !smallArmsImpactType) {
        sounds.playImpact('bullet', { x: to.x, z: to.z }, 0.03 + dist / 320);
      }
      return;
    }

    let profile = resolveWeaponProfile(def, factionId);
    // Keep base rate near 1.0 — sample pools provide variety; big pitch swings sound fake
    let rate = 0.99 + Math.random() * 0.02;
    let volume = 1;
    if (def.type === 'infantry' || def.type === 'radioOperator' || def.type === 'engineer') {
      // Rifle squads and engineers use a mixed small-arms pool; radio operators
      // carry only their rifle and must never emit an SMG sample.
      attacker._infVolley = (attacker._infVolley ?? 0) + 1;
      const useSmg = def.type !== 'radioOperator' && attacker._infVolley % 3 === 0;
      profile = useSmg ? smgProfileForFaction(factionId) : `rifle_${factionId}`;
      rate = 0.99 + Math.random() * 0.025;
      if (def.type === 'engineer') volume = 0.92;
      if (def.type === 'radioOperator') volume = 0.88;
    } else if (def.type === 'paratrooper' && !paratrooperAtFire) {
      const useMg = def.usesMG && (attacker._mgVolley ?? 0) % 2 !== 0;
      profile = useMg ? mgProfileForFaction(factionId) : `rifle_${factionId}`;
      rate = 0.99 + Math.random() * 0.025;
      volume = 0.88;
    } else if (def.type === 'sniper') {
      rate = 0.99 + Math.random() * 0.02;
      volume = 0.9;
    } else if (def.type === 'machineGun' || def.type === 'armoredCar') {
      rate = 0.99 + Math.random() * 0.025;
    } else if (def.type === 'mortar') {
      rate = 0.985 + Math.random() * 0.03;
      volume = 1.05;
    } else if (
      isTankType(def.type) ||
      def.type === 'antiTankGun' ||
      def.type === 'artillery' ||
      (def.type === 'paratrooper' && paratrooperAtFire)
    ) {
      rate = 0.99 + Math.random() * 0.02;
      volume = def.type === 'paratrooper' ? 0.92 : volume;
    }

    sounds.playWeapon(profile, pos, { rate, volume });

    // U.S. rifle squads carry M1 Garands. Count only their actual rifle shots
    // (the mixed third-volley SMG remains outside the clip) and let a subset of
    // empty-clip transitions add the short en-bloc eject cue after the report.
    if (
      factionId === 'usa' &&
      def?.type === 'infantry' &&
      profile === 'rifle_usa'
    ) {
      attacker._garandRoundsFired = (attacker._garandRoundsFired ?? 0) + 1;
      if (attacker._garandRoundsFired >= GARAND_CLIP_SIZE) {
        attacker._garandRoundsFired = 0;
        if (Math.random() < GARAND_PING_CHANCE) {
          sounds.playGarandPing(pos, { team: attacker.team });
        }
      }
    }

    // A smoke-obscured small-arms shot still gets a passing-round cue and a
    // delayed dust hit at its sampled miss point. Heavy shells retain their
    // existing muzzle-only behavior here.
    if (smokeMiss) {
      if (smallArmsFire) {
        const missDelay = 0.04 + Math.min(dist ?? 0, 520) / 360;
        sounds.playImpact('bullet_whiz', { x: to.x, z: to.z }, missDelay);
        sounds.playImpact('bullet', { x: to.x, z: to.z }, missDelay + 0.06);
      }
      return;
    }

    // Mortar / artillery loft: muzzle report only. Detonation VFX/audio wait for
    // flight and land at the aim point locked when the shell left the tube.
    // Building intercepts still resolve impact VFX below (no loft flag).
    if (mortarLoft || artilleryLoft) {
      return;
    }

    if (isTankType(def.type) || def.type === 'antiTankGun' || (def.type === 'paratrooper' && paratrooperAtFire)) {
      sounds.playImpact(
        armorHit?.deflected ? 'armor_ricochet' : 'tank_round',
        armorHit?.impactPosition ?? { x: to.x, z: to.z },
        0.08 + dist / 180
      );
    } else if (smallArmsImpactType) {
      sounds.playImpact(
        smallArmsImpactType,
        { x: to.x, z: to.z },
        0.03 + (dist ?? 0) / 350
      );
    } else if (killed) {
      if (target?.def && isInfantryUnitType(target.def.type)) {
        sounds.playInfantryDeath(
          { x: to.x, z: to.z },
          target.faction?.id,
          { team: target.team }
        );
      } else {
        sounds.playImpact('bullet', { x: to.x, z: to.z }, 0.03 + dist / 350);
      }
    }

    const targetIsArmored =
      killed && target?.def && isArmoredCombatVehicle(target.def.type);
    const targetIsDestroyedGun =
      killed && target?.def && DESTROYED_GUN_BLAST_TYPES.has(target.def.type);
    const targetKilledByExplosion = target?._deathCause === 'explosion';
    const destroyedGunByShell = targetIsDestroyedGun && targetKilledByExplosion;
    const directShellHitOnInfantry =
      !groundImpact &&
      target?.def &&
      isInfantryUnitType(target.def.type) &&
      (def.type === 'artillery' ||
        def.type === 'mortar' ||
        def.type === 'antiTankGun' ||
        isTankType(def.type) ||
        (def.type === 'paratrooper' && paratrooperAtFire));
    const waterShellImpact =
      groundImpact &&
      isUrbanCanalWater(to.x, to.z, this.mapDef) &&
      (def.type === 'artillery' ||
        def.type === 'mortar' ||
        def.type === 'antiTankGun' ||
        isTankType(def.type) ||
        (def.type === 'paratrooper' && paratrooperAtFire));

    if (armorHit?.deflected && !killed) {
      const ricochetPos = armorHit.impactPosition ?? {
        x: to.x,
        y: this.mapDef ? sampleTerrainHeight(to.x, to.z, this.mapDef) + 1.1 : (to.y ?? 0) + 1.1,
        z: to.z,
      };
      spawnArmorRicochet(this.scene, ricochetPos, from);
    }
    if (armorHit && (attacker?.team === 'player' || target?.team === 'player')) {
      const now = performance.now();
      const important = armorHit.weakSpot || (!killed && (armorHit.mobilityDamaged || armorHit.deflected));
      if (important && now - (this._lastArmorHitToastAt ?? 0) > 700) {
        this._lastArmorHitToastAt = now;
        const vehicleName = target?.name ?? 'Vehicle';
        const message = armorHit.weakSpot
          ? `${vehicleName}: CRITICAL HIT — ${armorHit.weakSpot}`
          : armorHit.mobilityDamaged
            ? `${vehicleName}: ${armorHit.mobilityDamageKind === 'wheel' ? 'wheel damaged' : 'track broken'} — engineer required`
            : `${vehicleName}: shell deflected by ${armorHit.aspect} armor`;
        this.ui?.showSaveToast?.(message);
      }
    }

    if (
      !smokeDeployed &&
      ((killed && targetKilledByExplosion) ||
        directShellHitOnInfantry ||
        targetIsArmored ||
        destroyedGunByShell ||
        (targetIsScenery && !smallArmsFire) ||
        def.type === 'mortar' ||
        (groundImpact &&
          (def.type === 'artillery' ||
            def.type === 'mortar' ||
            def.type === 'antiTankGun' ||
            isTankType(def.type))))
    ) {
      if (waterShellImpact) {
        const waterY = 0.09;
        const calibreScale = THREE.MathUtils.clamp((def.caliber ?? 75) / 88, 0.68, 1.85);
        spawnWaterImpact(this.scene, { x: to.x, y: waterY, z: to.z }, calibreScale);
      } else if (targetIsArmored) {
        triggerVehicleKillFx(this, target, to);
      } else if (destroyedGunByShell) {
        const destroyedGunTier = target.def.type === 'artillery' ? 'heavy' : 'medium';
        spawnShellExplosion(this.scene, to, destroyedGunTier);
        this._spawnExplosionCrater(to.x, to.z, destroyedGunTier);
        scheduleGunAmmoCookOff(this, target, to);
      } else if (def.type === 'artillery') {
        spawnArtilleryExplosion(this.scene, to, 'artillery', def.caliber);
        this._spawnExplosionCrater(to.x, to.z, 'heavy');
      } else if (def.type === 'mortar' || def.type === 'antiTankGun' || isTankType(def.type)) {
        spawnShellExplosion(this.scene, to, 'medium', def.caliber);
        this._spawnExplosionCrater(to.x, to.z, shellCraterTier(def));
      } else {
        spawnExplosion(this.scene, to);
        this._spawnExplosionCrater(to.x, to.z, groundImpact ? 'medium' : 'light');
      }
      if (!targetIsArmored) {
        sounds.playImpact(
          targetIsHQ || targetIsScenery || groundImpact ? 'shell' : 'explosion',
          { x: to.x, z: to.z },
          groundImpact ? 0.12 : 0.03
        );
        if (targetIsHQ || targetIsScenery) sounds.play('explosion');
      }
    }

  }

  animate() {
    if (!this._rafActive) return;
    if (!this.mapDef || this._tabHidden) {
      this._stopRenderLoop();
      return;
    }
    requestAnimationFrame(this.animate);

    const rawFrameDt = Math.min(this.clock.getDelta(), 0.25);
    const dt = Math.min(rawFrameDt, 0.05);
    const viewActive = this.running && !this.gameOver;
    const simActive = viewActive && !this.paused;
    const fieldHasUnits = this._aliveUnits.length > 0;
    const hasCorpses = this._hasFieldCorpses === true;

    if (this.gameOver) {
      if (!this._endOverlayShown && this._pendingEnd) {
        this._presentEndScreen(this._pendingEnd.victory, this._pendingEnd.detail);
      }
      if (this.viewingBattlefield) {
        this.updateCamera(dt);
        updateWreckEffects(dt, this.camera);
        updateVehicleCookOffs(this, dt);
        updateHqBurnEffects(dt, this.camera, this.hqs);
        updateCombatEffects(dt);
        updateShellCasings(dt, this.mapDef, this._terrainMesh);
        updateDetachedCorpseFalls(dt);
        this._renderFrame();
        return;
      }
      // Let the final kill finish visually behind the results panel. Delayed
      // tank magazines and field-gun ammunition would otherwise freeze as soon
      // as the last unit triggered game over.
      updateWreckEffects(dt, this.camera);
      updateVehicleCookOffs(this, dt);
      updateHqBurnEffects(dt, this.camera, this.hqs);
      updateCombatEffects(dt);
      updateShellCasings(dt, this.mapDef, this._terrainMesh);
      updateDetachedCorpseFalls(dt);
      this._postMatchRenderAccum += dt;
      if (this._postMatchRenderAccum < 0.05) return;
      this._postMatchRenderAccum = 0;
      this.updateCamera(dt);
      this._renderFrame();
      return;
    }

    if (simActive) {
        this.ui?.tickMinimapFireTraces(dt);
        this._minimapUiAccum += dt;
        const largeBattle = this._aliveUnits.length > 55;
        const minimapInterval = this.ui?.minimapHasFireTraces?.()
          ? largeBattle ? 0.06 : 0.033
          : largeBattle ? 0.16 : 0.1;
        if (this._minimapUiAccum >= minimapInterval) {
          this._minimapUiAccum = 0;
          this._updateMinimap();
        }

        this.matchTime += dt;
        // Resolve the Fortified Line deadline before the reinforcement cycle
        // also scheduled at 15:00. A defender killed just before the horn stays
        // dead for the decisive check instead of being replaced first.
        if (
          this.clearance &&
          this.clearanceTimeLimitEnabled &&
          this.matchTime >= CLEARANCE_TIME_LIMIT
        ) {
          this._rebuildUnitCaches();
          this.checkVictory();
          if (this.gameOver) {
            this.updateCamera(dt);
            this._renderFrame();
            return;
          }
        }
        const clearanceArrival = updateClearanceReinforcements(this);
        if (clearanceArrival) {
          this._applyEngagementStanceDefault(clearanceArrival.units);
          this._applyArtilleryAutoFireDefault(clearanceArrival.units);
          this._rebuildUnitCaches();
          this._syncUnitRoster();
          this.ui?.showSaveToast?.(
            `Reinforcement cycle ${clearanceArrival.wave}: fresh troops arrived for both sides`
          );
        }
        const clearanceProbe = updateClearanceCounterattacks(this);
        if (clearanceProbe) {
          this.ui?.showSaveToast?.(
            `Enemy probing attack: ${clearanceProbe.units.length} defenders advancing`
          );
        }
        updateDetachedCorpseFalls(dt);
        tickUnitCooldowns(this._aliveUnits, dt);
        updateMedicHealing(this._aliveUnits, dt);
        updateVehicleBailouts(this, dt);
        if (updateEngineerHealing(this.units, dt, this.coverSystem) > 0) this._rebuildUnitCaches();
        updateEngineerHqRepair(this.hqs, this._aliveUnits, dt);
        this.engineerSandbags?.update(dt);
        if (this.engineerSandbags?.sites?.length) {
          this.ui?.updateEngineerBuild(this);
        }
        // Include dead units so a casualty inside a surviving trench is
        // removed from its garrison and leaves the position capturable.
        this.infantryTrenches?.update(dt, this.units);
        if (this.infantryTrenches?.sites?.length) {
          this.ui?.updateInfantryTrench(this);
        }
        this.medicFieldHospitals?.update(dt);
        if (this.medicFieldHospitals?.sites?.length) {
          this.ui?.updateMedicTent(this);
        }
        this.baseBuildings?.update(dt);
        this._healMarkerAccum += dt;
        if (this._healMarkerAccum >= 0.1) {
          const depotDt = this._healMarkerAccum;
          this._healMarkerAccum = 0;
          const depotCache = this.baseBuildings?.active
            ? {
                hospitals: getActiveHospitals(this.baseBuildings),
                motorPools: getActiveMotorPools(this.baseBuildings),
              }
            : null;
          // Include recoverable dead hulls so their repair spanner appears as
          // soon as an engineer begins restarting them.
          syncHealMarkers(this.units, this.baseBuildings, this.hqs, depotCache);
          if (depotCache) {
            updateHospitalHealing(
              this.baseBuildings,
              this._aliveUnits,
              depotDt,
              depotCache.hospitals
            );
            updateMotorPoolHealing(
              this.baseBuildings,
              this._aliveUnits,
              depotDt,
              depotCache.motorPools
            );
          }
        }
        this._unitVisualSyncAccum += dt;
        if (this._unitVisualSyncAccum >= (largeBattle ? 0.2 : 0.1)) {
          this._unitVisualSyncAccum = 0;
          syncDamageSmoke(this._aliveUnits);
          syncUnitHealthBars(this._aliveUnits, this.showUnitFieldIcons);
          syncRetreatMarkers(this._aliveUnits);
          syncSurrenderMarkers(this._aliveUnits);
          syncRankMarkers(this._aliveUnits);
        }
        updateDamageSmoke(this._aliveUnits, dt);
        updateSurrenderState(this, this.units, dt, {
          spawnSurrenderingVehicleCrew: (vehicle) =>
            spawnVehicleCrewBailout(this, vehicle),
        });
        updateRankMarkers(this._aliveUnits);
        this.tickEconomy(dt);
        if (this.lastStand && isLastStandDeployPhase(this)) {
          updateLastStandEnemyDeploy(this, dt);
          this._rebuildUnitCaches();
          this._lastStandUiAccum = (this._lastStandUiAccum ?? 0) + dt;
          if (this._lastStandUiAccum >= 0.15) {
            this._lastStandUiAccum = 0;
            this.ui?.updateLastStandDeploy(this);
            this.ui?.updateResources(
              this.lastStand.supplies.player,
              this.capturePoints,
              this.cheatMode,
              { lastStand: true, lastStandDeploy: true }
            );
          }
        } else if (!this.towerDefense) {
          this.updateCapturePoints(dt);
          this.production.update(dt, this.units);
          updateAutoBuild(this);
        } else {
          updateTowerDefenseMode(this, dt);
          if (isTdHqDefenseStyle(this.towerDefense)) {
            this.production.update(dt, this.units);
            updateHqDefenseFrontlineRetreat(this, dt);
          }
        }

        if (this.assault) {
          updateAssaultTimers(this.assault, dt);
        }

        this._fieldIconUiAccum += dt;
        if (this._fieldIconUiAccum >= 0.12) {
          this._fieldIconUiAccum = 0;
          syncPlayerFieldIcons(this._aliveUnits, this.showUnitFieldIcons);
        }

        if (isLastStandDeployPhase(this)) {
          this.updateCamera(dt);
          updateLightingForTarget(this.lights, this.cameraTarget.x, this.cameraTarget.z);
          this._renderFrame();
          return;
        }

        let movementDt = dt;
        let updateArmyMovement = true;
        if (this._largeBattleSimulationPerfActive) {
          this._largeBattleMovementAccum = Math.min(
            0.1,
            this._largeBattleMovementAccum + dt
          );
          if (this._largeBattleMovementAccum < LARGE_BATTLE_SIM_MOVEMENT_STEP) {
            updateArmyMovement = false;
          } else {
            movementDt = LARGE_BATTLE_SIM_MOVEMENT_STEP;
            this._largeBattleMovementAccum -= LARGE_BATTLE_SIM_MOVEMENT_STEP;
          }
        }
        if (updateArmyMovement) {
          updateMovement(this._aliveUnits, movementDt, this.mapDef, this.hqs, {
            collisionUnits: this.units,
            onVehicleWreckImpact: (wreck, vehicle, impact) =>
              this._handleVehicleWreckImpact(wreck, vehicle, impact),
            onVehicleWreckCrushed: (wreck, vehicle, impact) =>
              this._handleVehicleWreckCrushed(wreck, vehicle, impact),
            onVehicleWreckRunOver: (wreck, vehicle, impact) =>
              this._handleVehicleWreckRunOver(wreck, vehicle, impact),
            terrainMesh: this._terrainMesh,
            getWireSlowMult: this.defenses
              ? (x, z, unit) => this.defenses.getMoveSlowMult(x, z, unit)
              : null,
            scenery: this.scenery,
            clearance: this.clearance,
            infantryTrenches: this.infantryTrenches,
          });
        }
        this.scenery?.update(dt);
        if (
          getGarrisonBunkerSources(this).length > 0 ||
          this.units.some((u) => u._garrisonBunkerId || u._bunkerEntryId)
        ) {
          // Include casualties so a unit killed inside a building is removed
          // from its occupancy roster and cannot leave a stale INSIDE badge.
          updateBunkerGarrison(this.units, this, {
            scenery: this.scenery,
            mapDef: this.mapDef,
            applyObstaclePath,
          });
        }
        for (const u of this._aliveUnits) {
          if (u._trenchId || u._diggingTrench || u.mesh?.userData?.trenchSink) {
            updateTrenchVisuals(u, dt);
          }
        }
        if (
          this._aliveUnits.some(
            (u) => u._mountedOnTankId || u._pendingMountTankId || u._tankRiderIds?.length
          )
        ) {
          // Include dead hosts so surviving riders/replacement crews can be
          // detached cleanly from a newly knocked-out vehicle.
          updateTankRiders(this.units, dt, this.mapDef, this);
        }
        if (isTdHqDefenseStyle(this.towerDefense)) {
          enforcePlayerFrontlineClamp(this);
        }

        const stagingTeams = this._getDeployZoneTeamsAt();
        if (stagingTeams.length) {
          const stagingAnchors = this.clearance
            ? { player: getClearanceStagingAnchor(this.mapDef, this.clearanceRole) }
            : null;
          containTeamsToDeployZone(
            this._aliveUnits,
            this.hqs,
            this.mapDef,
            stagingTeams,
            getDeployRadius(this.mapDef),
            getStagingMoveRadius(this.mapDef),
            stagingAnchors
          );
        }
        this._syncDeployZoneVisuals();
        sounds.setListener(this.cameraTarget.x, this.cameraTarget.z);
        sounds.updateVehicleEngines(this._aliveUnits, dt);
        for (const u of this._aliveUnits) {
          if (u.retreating) {
            const hq = resolveRetreatHq(u, this.hqs, {
              clearance: this.clearance,
              clearanceRole: this.clearanceRole,
              mapDef: this.mapDef,
            });
            updateRetreatState(u, hq, this.mapDef);
          }
        }
        this._coverUiAccum += dt;
        if (this.coverSystem && this._coverUiAccum >= 0.12) {
          this._coverUiAccum = 0;
          this.coverSystem.updateUnits(this._aliveUnits);
          syncMoraleMarkers(this._aliveUnits, this.units);
        }
        const playerSelected = this._playerAlive.filter((u) => u.selected);
        this._maybeUpdateSelectionPanel(playerSelected, dt);
        this._combatAccum += dt;
        const combatStep = this._aliveUnits.length > 55 ? 0.14 : 0.09;
        const hqThreat = updatePlayerHqThreat(this, dt);
        if (hqThreat?.level === 'siege' || hqThreat?.level === 'critical') {
          if (!this._hqAlertPlayed) {
            this._hqAlertPlayed = true;
            sounds.play('hq_alert');
          }
        } else if (hqThreat?.level === 'none') {
          this._hqAlertPlayed = false;
        }

        if (this._combatAccum >= combatStep) {
          const cdt = this._combatAccum;
          this._combatAccum = 0;
          const combatBuildings = this._combatBuildingTargets;
          combatBuildings.length = 0;
          const baseTargets = this.baseBuildings?.getAttackTargets();
          if (baseTargets?.length) {
            for (let i = 0; i < baseTargets.length; i++) combatBuildings.push(baseTargets[i]);
          }
          const sandTargets = this.engineerSandbags?.getAttackTargets();
          if (sandTargets?.length) {
            for (let i = 0; i < sandTargets.length; i++) combatBuildings.push(sandTargets[i]);
          }
          updateCombat(
            this._aliveUnits,
            this.hqs,
            cdt,
            this.scene,
            this.mapDef,
            (ev) => this.onCombatFire(ev),
            { x: this.cameraTarget.x, z: this.cameraTarget.z },
            this.coverSystem,
            this.difficulty.enemyDamageMult,
            this.scenery,
            {
              protectPlayerHq: this.towerDefense && !isTdHqDefenseStyle(this.towerDefense),
              tutorialPassiveNoHq: this.tutorial,
              practiceHqDamageMult: this.tutorial ? PRACTICE_TARGET_HQ_DAMAGE_MULT : 1,
              openingCeasefire:
                !this.tutorial &&
                !this.towerDefense &&
                !this.lastStand &&
                !this.clearance &&
                this.matchTime < BATTLE_OPENING_TIME,
              enemyCeasefire:
                this.clearance &&
                this.clearanceRole === 'defend' &&
                this.matchTime < CLEARANCE_DEFENDER_PREP_TIME,
              prepCeasefire:
                this.clearance &&
                this.clearanceRole === 'defend' &&
                this.matchTime < CLEARANCE_DEFENDER_PREP_TIME,
              paceDamageMult: this.campaign ? CAMPAIGN_BALANCE.damageMult : 1,
              defenseTargets: this.defenses?.getAttackTargets() ?? [],
              baseBuildingTargets: combatBuildings,
              clearance: this.clearance,
              clearanceRole: this.clearanceRole,
              tutorial: this.tutorial,
              towerDefense: this.towerDefense,
              smokeScreens: this.smokeScreens,
              generalOrders: {
                player: this.generalOrders,
                enemy: this.enemyGeneralOrders,
              },
              engineerSandbags: this.engineerSandbags,
              defenses: this.defenses,
              spawnSurrenderingVehicleCrew: (vehicle) =>
                spawnVehicleCrewBailout(this, vehicle),
            }
          );
          this._rebuildUnitCaches();
          updateFieldCommanders(this, dt);
          if (isTdHqDefenseStyle(this.towerDefense)) {
            enforcePlayerFrontlineClamp(this);
          }
        }

        if (updateArmyMovement) {
          for (const u of this._aliveUnits) {
            updateInfantryWeaponPose(u, movementDt);
          }
        }

        if (this.towerDefense && this.defenses) {
          this.defenses.update(dt, this.scene, this.mapDef);
          if (!this.gameOver) {
            const breach = checkTowerDefenseBreach(this, dt);
            if (breach) this.endGame(breach.victory, breach.detail);
          }
        }

        this._hudUiAccum += dt;
        if (this._hudUiAccum >= 0.2) {
          this._hudUiAccum = 0;
          this._tickBattleHud();
        }
        if (!fieldHasUnits) {
          if (!this._emptyFieldHandled) this._handleEmptyBattlefield();
          this._victoryCheckAccum += dt;
          if (this._victoryCheckAccum >= 0.1) {
            this._victoryCheckAccum = 0;
            this._rebuildUnitCaches();
            this.checkVictory();
          }
        } else {
          this._victoryCheckAccum += dt;
          const livingPlayer = this._playerAlive.length;
          const livingEnemy = this._enemyAlive.length;
          if (
            this._victoryCheckAccum >= 0.12 ||
            livingPlayer === 0 ||
            livingEnemy === 0
          ) {
            this._victoryCheckAccum = 0;
            this._rebuildUnitCaches();
            this.checkVictory();
          }
        }
        if (this.gameOver) {
          this.updateCamera(dt);
          this._renderFrame();
          return;
        }

        this.fireSupport.update(dt);
        this.enemyFireSupport.update(dt);
        this.generalOrders.update(dt);
        this.enemyGeneralOrders.update(dt);
        updateRadioOperatorBinoculars(this.units, dt);
        this.smokeScreens.update(dt);
        updateFireSupportEffects(dt, this.scene);
        updateParachuteDrops(dt, this.scene, this.mapDef);
        flushTerrainNormals(this._terrainMesh);

        if (fieldHasUnits || hasCorpses) {
          updateWreckEffects(dt, this.camera);
          updateVehicleCookOffs(this, dt);
          updateHqBurnEffects(dt, this.camera, this.hqs);
          let updateTacticalVisuals = true;
          if (this._largeBattleSimulationPerfActive) {
            this._largeBattleTacticalVisualAccum += dt;
            updateTacticalVisuals =
              this._largeBattleTacticalVisualAccum >=
              LARGE_BATTLE_SIM_TACTICAL_VISUAL_STEP;
            if (updateTacticalVisuals) this._largeBattleTacticalVisualAccum = 0;
          }
          if (updateTacticalVisuals) {
            this.rangeRings.updateForUnits(this._aliveUnits);
            this.targetIndicators.update(playerSelected, this._playerAlive);
          }
          updateCombatEffects(dt);
          updateShellCasings(dt, this.mapDef, this._terrainMesh);
          this._fireSupportUiAccum += dt;
          if (this._fireSupportUiAccum >= 0.15) {
            this._fireSupportUiAccum = 0;
            this.ui?.updateFireSupport(this.fireSupport);
            this.ui?.updateGeneralOrders(this.generalOrders);
          }

          if (this.towerDefense) {
            const enemyStagingPhase = this.towerDefense.phase !== 'active';
            if (!enemyStagingPhase) {
              const supportTargets = [
                ...this._playerAlive,
                ...(this.defenses?.getAttackTargets?.() ?? []),
              ];
              updateAIOffMapSupport(
                this.enemyFireSupport,
                this._playerAlive,
                dt,
                this.difficulty,
                { clearance: false, supportTargets }
              );
            }
            this._towerDefenseAiAccum += dt;
            if (this._towerDefenseAiAccum >= TOWER_DEFENSE_AI_STEP) {
              const towerAiDt = this._towerDefenseAiAccum;
              this._towerDefenseAiAccum = 0;
              updateAICommandSystems({
                game: this,
                enemyUnits: this._enemyAlive,
                playerUnits: this._playerAlive,
                enemyStagingPhase,
              });
              updateTowerDefenseEnemyAI(
                this._enemyAlive,
                this,
                this.defenses,
                towerAiDt
              );
            }
          } else if (!this.tutorial && !isLastStandDeployPhase(this)) {
            updateAI({
              enemyUnits: this._enemyAlive,
              playerUnits: this._playerAlive,
              mapDef: this.mapDef,
              dt,
              capturePoints: this.capturePoints,
              production: this.production,
              enemyResources: this.resources.enemy,
              spendEnemy: (cost) => this.spendResources(ENEMY_TEAM, cost),
              assault: this.assault,
              clearance: this.clearance,
              campaign: this.campaign,
              lastStand: !!this.lastStand && this.lastStand.phase === 'battle',
              lastStandTactic: this.lastStand?.enemyTactic ?? null,
              lastStandFlankSide: this.lastStand?.flankSide ?? 1,
              enemyStagingPhase: isEnemyStagingPhase(this),
              difficulty: this.campaign
                ? getCampaignDifficulty(this.difficulty)
                : this.difficulty,
              enemyFireSupport: this.enemyFireSupport,
              game: this,
            });
          }

          this._deployUiAccum += dt;
          if (this._deployUiAccum >= 0.12 && !this.lastStand) {
            this._deployUiAccum = 0;
            const deployPhase = this._getDeployPhase();
            this.ui?.updateDeployCountdown(deployPhase);
            this.ui?.updateBattleOpening(
              deployPhase ? deployPhase.secondsLeft : 0,
              deployPhase
            );
          }

          this.cleanupDead(dt);
          this._rosterUiAccum += dt;
          const rosterInterval = this._largeBattleSimulationPerfActive ? 0.7 : 0.35;
          if (this._rosterUiAccum >= rosterInterval) {
            this._rosterUiAccum = 0;
            this._syncUnitRoster();
          }
        } else {
          updateHqBurnEffects(dt, this.camera, this.hqs);
          if (hasCorpses) updateWreckEffects(dt, this.camera);
          this.cleanupDead(dt);
        }
        this._updateAdaptiveRenderQuality(rawFrameDt);
      }

    if (viewActive) {
      this.updateCamera(dt);
      updateLightingForTarget(this.lights, this.cameraTarget.x, this.cameraTarget.z);
      this._renderFrame();
    }
  }

  _fadeDestroyedHqs(dt) {
    for (const h of this.hqs) {
      if (!h.dead || !h.mesh?.parent) continue;
      h.mesh.scale.multiplyScalar(0.94);
      h.mesh.position.y -= dt * 0.04;
      if (h.mesh.scale.x < 0.35) h.dispose(this.scene);
    }
  }

  _updateAdaptiveRenderQuality(frameDt) {
    const perf = this._renderPerformance;
    if (!perf || this.paused || this.matchTime < 20) return;

    // Ignore isolated stalls (asset upload, window movement, debugger pauses).
    const sample = Math.min(frameDt, 0.1);
    perf.frameTimeEma = perf.frameTimeEma * 0.94 + sample * 0.06;
    perf.samples += 1;
    perf.qualityCooldown = Math.max(0, perf.qualityCooldown - frameDt);
    const fps = 1 / Math.max(perf.frameTimeEma, 1 / 120);

    // Retina fill-rate and the sun-shadow pass dominate once a battle grows.
    // Reduce only the drawing-buffer resolution; simulation and model detail
    // remain unchanged. Restore sharpness gradually after the field thins out.
    const liveCount = this._aliveUnits.length;
    const loadPixelRatioCap = this._largeBattleSimulationPerfActive
      ? LARGE_BATTLE_SIM_PIXEL_RATIO
      : liveCount >= 68
        ? 1.15
        : liveCount >= 50
          ? 1.35
          : liveCount >= 38
            ? 1.6
            : this._nativePixelRatio;
    let desiredPixelRatio = Math.min(this._nativePixelRatio, loadPixelRatioCap);
    if (desiredPixelRatio < this._renderPixelRatio && perf.qualityCooldown <= 0) {
      if (this._setRenderPixelRatio(desiredPixelRatio)) perf.qualityCooldown = 2;
    }

    if (perf.samples < 90) return;
    if (perf.samples === 90) perf.baselineFps = Math.min(60, Math.max(24, fps));

    // Compare against the device's observed refresh rate so a stable 30 Hz
    // display is not mistaken for degradation.
    const lowThreshold = Math.min(42, perf.baselineFps * 0.72);
    const recoveredThreshold = Math.min(50, perf.baselineFps * 0.86);
    if (fps < lowThreshold) {
      perf.lowFpsFor += frameDt;
    } else if (fps > recoveredThreshold) {
      perf.lowFpsFor = Math.max(0, perf.lowFpsFor - frameDt * 2);
    } else {
      perf.lowFpsFor = Math.max(0, perf.lowFpsFor - frameDt * 0.25);
    }

    if (perf.lowFpsFor >= 1.2) {
      desiredPixelRatio = Math.min(desiredPixelRatio, fps < 26 ? 1 : 1.2);
      if (desiredPixelRatio < this._renderPixelRatio && perf.qualityCooldown <= 0) {
        if (this._setRenderPixelRatio(desiredPixelRatio)) perf.qualityCooldown = 2;
      }
      perf.highFpsFor = 0;
    } else if (fps > recoveredThreshold && liveCount < 50) {
      perf.highFpsFor += frameDt;
      if (perf.highFpsFor >= 6 && perf.qualityCooldown <= 0) {
        const restored = Math.min(desiredPixelRatio, this._renderPixelRatio + 0.25);
        if (this._setRenderPixelRatio(restored)) perf.qualityCooldown = 2;
        perf.highFpsFor = 0;
      }
    } else {
      perf.highFpsFor = 0;
    }

  }

  cleanupDead() {
    if (this.gameOver) return;

    let cachesDirty = false;
    for (const u of this.units) {
      if (!u.dead) continue;
      if (u._deathAt == null) u._deathAt = this.matchTime;
      if (!u._wreckCoverRegistered) addVehicleWreckCover(this.coverSystem, u);
      if (!u._lossRecorded) {
        if (this.towerDefense && u.team === ENEMY_TEAM) rewardTowerDefenseKill(this, u);
        this.battleStats.recordUnit(u);
      }
      if (!u.mesh?.parent) continue;

      if (!u.mesh.userData?.deathVisualApplied) {
        applyUnitDeathVisual(u);
        cachesDirty = true;
        continue;
      }

      if (
        Number.isFinite(this.debrisRetentionSeconds) &&
        this.matchTime - u._deathAt >= this.debrisRetentionSeconds
      ) {
        removeVehicleWreckCover(this.coverSystem, u);
        u.dispose(this.scene);
        cachesDirty = true;
        continue;
      }

      if (isArmoredCombatVehicle(u.def.type) && u.mesh.userData?.wreckApplied) {
        if (!u._vehicleKillFxDone) {
          triggerVehicleKillFx(this, u, {
            x: u.position.x,
            y: u.position.y,
            z: u.position.z,
          });
        } else if (!u.wreckFire) {
          u.wreckFire = u._recoverableWreck
            ? spawnRecoverableWreckSmoke(this.scene, u.position, u.mesh)
            : spawnTankWreckFire(this.scene, u.position, u.mesh);
        }
      }
    }
    if (cachesDirty) this._rebuildUnitCaches();

    for (const h of this.hqs) {
      if (h.dead) this.battleStats.recordHq(h.team);
      if (this.gameOver) continue;
      if (h.dead && h.mesh?.parent) {
        h.mesh.scale.multiplyScalar(0.98);
        h.mesh.position.y -= 0.03;
        if (h.mesh.scale.x < 0.3) h.dispose(this.scene);
      }
    }
  }
}
