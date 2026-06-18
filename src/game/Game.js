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
  isClearanceMode,
  isTowerDefenseMode,
  isLastStandMode,
  LAST_STAND_SUPPLIES,
  TD_STARTING_POINTS,
  CLEARANCE_STARTING_RESOURCES,
  getProducibleUnits,
} from '../data/gameModes.js';
import {
  createLastStandState,
  updateLastStandEnemyDeploy,
  flushEnemyDeployment,
  assignLastStandEnemyStances,
  assignLastStandPresetStances,
  deployLastStandPresetForces,
  isLastStandPresetForce,
  checkLastStandVictory,
  isLastStandDeployPhase,
  tryPlacePlayerUnit,
} from './LastStandMode.js';
import { isLastStandPresetDeployMode } from '../data/lastStandForces.js';
import {
  createTowerDefenseState,
  startNextWave,
  skipTowerDefensePrepare,
  updateTowerDefenseMode,
  updateTowerDefenseEnemyAI,
  checkTowerDefenseBreach,
  checkTowerDefenseVictory,
  rewardTowerDefenseKill,
} from './TowerDefenseMode.js';
import { DefenseStructureManager } from './DefenseStructures.js';
import { getFrontlineDef } from './AssaultMode.js';
import {
  spawnClearanceDefenders,
  setupClearanceCapturePoints,
  checkClearanceVictory,
  getClearancePlayerSpawnBase,
  CLEARANCE_CEASEFIRE_TIME,
} from './ClearanceMode.js';
import { updateRetreatState, removeRetreatMarker } from './RetreatBehavior.js';
import { updateMedicHealing } from './MedicBehavior.js';
import { updateHospitalHealing } from './HospitalBehavior.js';
import { updateMotorPoolHealing } from './MotorPoolBehavior.js';
import { updateEngineerHealing } from './EngineerBehavior.js';
import { EngineerSandbagManager } from './EngineerSandbags.js';
import { BaseBuildingManager } from './BaseBuildingManager.js';
import { getGarrisonBunkerSources, updateBunkerGarrison } from './BunkerGarrison.js';
import {
  isBaseBuildingCampaign,
  getPlayerProductionUnitTypes,
  getSpawnBuildingForUnit,
} from '../data/baseBuildings.js';
import { removeCoverMarker } from '../visual/CoverMarkers.js';
import {
  preloadUnitFieldIcons,
  syncPlayerFieldIcons,
  syncUnitFieldIcon,
} from '../visual/UnitFieldIcons.js';
import { syncHealMarkers } from '../visual/HealMarkers.js';
import { syncDamageSmoke, updateDamageSmoke } from '../visual/DamageSmoke.js';
import { syncUnitHealthBars } from '../visual/UnitHealthBars.js';
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
import { isTabletLikeDevice } from '../lib/tabletDetect.js';
import { CoverSystem } from './CoverSystem.js';
import { MAPS, buildMapDef } from '../data/maps.js';
import { getDeployRadius, formatMapHudLabel } from '../data/mapSizes.js';
import { getDifficulty, DEFAULT_DIFFICULTY } from '../data/difficulty.js';
import {
  isCampaignMode,
  CAMPAIGN_BALANCE,
  applyCampaignUnitHp,
  getCampaignDifficulty,
} from '../data/campaignPace.js';
import { teamIsEliminated, estimateTeamIncomePerSec } from './EliminationRules.js';
import { buildTerrain, sampleTerrainHeight } from '../world/Terrain.js';
import {
  disposeBattleScene,
  queueMeshDispose,
  flushDisposeQueueSync,
} from '../world/SceneDispose.js';
import { DestructibleScenery } from '../world/DestructibleScenery.js';
import {
  spawnTankWreckFire,
  updateWreckEffects,
  clearWreckEffects,
  removeWreckEffect,
} from '../effects/WreckEffects.js';
import { clearHqBurnEffects, updateHqBurnEffects } from '../effects/HqBurnEffects.js';
import {
  setupRenderer,
  setupSceneEnvironment,
  setupLighting,
  updateLightingForTarget,
  updateSkyForCamera,
} from '../world/SceneSetup.js';
import { applySceneEnvironment } from '../world/EnvironmentMap.js';

import {
  spawnExplosion,
  spawnShellExplosion,
  spawnSmokePuff,
  updateCombatEffects,
  clearCombatEffects,
} from '../effects/CombatEffects.js';
import { RangeRingManager } from '../visual/RangeRings.js';
import { TargetIndicators } from '../visual/TargetIndicators.js';
import { addExplosionCrater, clearTerrainDamage, flushTerrainNormals } from '../world/TerrainDamage.js';
import { spawnArmy } from './Spawner.js';
import { updateCombat, updateMovement, tickUnitCooldowns } from './Combat.js';
import { updateAI, resetAI } from './AI.js';
import { containTeamsToDeployZone, clampPointToHqZone } from './OpeningDeployZone.js';
import { createDeployZoneRings, disposeDeployZoneRings } from '../visual/DeployZoneRing.js';
import { RTSController } from '../input/RTSController.js';
import { canManualFireOrder, resolveBattleCursor } from '../input/BattleCursor.js';
import { isActiveManualFireMission } from './Targeting.js';
import { HQ } from './HQ.js';
import { createCapturePoints } from './CapturePoint.js';
import { ProductionManager } from './Production.js';
import { BattleStats } from './BattleStats.js';
import {
  sounds,
  resolveWeaponProfile,
  mgProfileForFaction,
  isInfantryUnitType,
} from '../audio/SoundManager.js';
import { isTankType } from '../units/VehicleTypes.js';
import { snapUnitYaw } from '../units/VehicleRotation.js';
import {
  applyUnitDeathVisual,
  unitHasCorpseLinger,
  updateDetachedCorpseFalls,
  clearDetachedCorpseFalls,
} from '../units/UnitMeshes.js';
import { FireSupportManager } from './FireSupport.js';
import {
  updateFireSupportEffects,
  clearFireSupportEffects,
} from '../effects/FireSupportEffects.js';
import {
  captureBattleSave,
  applyBattleSave,
  writeBattleSave,
  loadBattleSaveData,
  deleteBattleSave,
} from './BattleSave.js';

const PLAYER_TEAM = 'player';
const ENEMY_TEAM = 'enemy';

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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    setupRenderer(this.renderer);

    this.scene = new THREE.Scene();
    applySceneEnvironment(this.scene, this.renderer);
    this.clock = new THREE.Clock();
    this.running = false;
    this.gameOver = false;
    this.paused = false;
    this._endOverlayShown = false;
    this._pendingEnd = null;
    this._teardownPending = false;
    this._hudUiAccum = 0;
    this._victoryCheckAccum = 0;
    this._captureUiAccum = 0;
    this._selectionUiAccum = 0;
    this._selectionUiKey = '';
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
    this._postMatchRenderAccum = 0;
    this._fireSupportUiAccum = 0;
    this._fieldIconUiAccum = 0;
    this._minimapUiAccum = 0;
    this.showUnitFieldIcons = true;
    this.showFrontline = true;
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
      getSpawnPos: (team, unitType) => {
        if (team === PLAYER_TEAM && isBaseBuildingCampaign(this)) {
          const need = getSpawnBuildingForUnit(unitType);
          if (!need && this.selectedHq && !this.selectedHq.dead) {
            const p = this.selectedHq.position;
            return { x: p.x, z: p.z };
          }
          if (
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
          const fromSelected = this.baseBuildings?.getSpawnPosition(team, unitType);
          if (fromSelected) return fromSelected;
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
      onSpawn: (team, _unitType, unit) => {
        if (this.campaign && unit) applyCampaignUnitHp(unit);
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
    this.engineerSandbags = new EngineerSandbagManager(this);
    this.baseBuildings = new BaseBuildingManager(this);
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
      getPendingDefensePlacement: () =>
        this.running && !this.gameOver ? this.defenses?.getPending() : null,
      getPendingLastStandDeploy: () =>
        this.running && !this.gameOver && isLastStandDeployPhase(this)
          ? this.lastStand?.pendingType ?? null
          : null,
      getPendingSandbagPlacement: () => this.engineerSandbags?.getPending() ?? null,
      getPendingBaseBuildingPlacement: () => this.baseBuildings?.getPending() ?? null,
      getBaseBuildingAttackTargets: () => {
        if (!this.running || this.gameOver || !this.baseBuildings?.active) return [];
        return this.baseBuildings
          .getAttackTargets()
          .filter((t) => t.team !== PLAYER_TEAM && !t.dead);
      },
      getIsTowerDefense: () =>
        isTowerDefenseMode(this.gameMode) && this.running && !this.gameOver,
      getIsBaseBuildingMode: () => isBaseBuildingCampaign(this),
      pickPlayerBaseBuilding: (raycaster, pointer, camera) =>
        this.baseBuildings?.raycastPlayerEntry(raycaster, pointer, camera) ?? null,
      getDeployZoneActive: () => this._isPlayerDeployZoneActive(),
      getPaused: () => this.paused,
      getShiftHeld: () => !!(this.keys.ShiftLeft || this.keys.ShiftRight),
      clampDeployPoint: (x, z) => this._clampPlayerDeployPoint(x, z),
      onFireSupportTarget: (mode, x, z) => this.handleFireSupportTarget(mode, x, z),
      onDefensePlacement: (mode, x, z) => this.handleDefensePlacement(mode, x, z),
      onLastStandPlacement: (mode, x, z) => this.handleLastStandPlacement(mode, x, z),
      onSandbagPlacement: (mode, x, z) => this.handleSandbagPlacement(mode, x, z),
      onBaseBuildingPlacement: (mode, x, z) => this.handleBaseBuildingPlacement(mode, x, z),
      onSelectionChange: (sel, hq = null, baseBuilding = null) => {
        this.selectedHq = hq;
        this.selectedBaseBuilding = baseBuilding;
        if (sel.length > 0 || hq || baseBuilding) sounds.play('select');
        this.ui?.updateSelection(sel, this.controller.hoveredTarget, hq, this);
        this.ui?.syncProductionPanel?.(this);
        this._syncUnitRoster();
        this._syncBattleCursor();
      },
      onHoverTarget: (target) => {
        this.targetIndicators?.setHoverTarget(target);
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
        sounds.play('order');
        if ((type === 'attack' || type === 'fire') && selected?.length) {
          this.ui?.updateSelection(selected, this.controller.hoveredTarget, this.selectedHq, this);
        }
        if (type === 'fire' || type === 'attack' || type === 'move') {
          this._selectionUiKey = '';
          this.ui?.updateFireMissionControls(this._countActiveFireMissions());
        }
        this._syncBattleCursor();
      },
      onBattleCursorChange: () => this._syncBattleCursor(),
    });

    this._placementLayer = document.getElementById('placement-layer');
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
      if (this.baseBuildings?.getPending()) {
        this.placeBaseBuildingAtScreen(e.clientX, e.clientY);
        return;
      }
      if (isLastStandDeployPhase(this) && this.lastStand?.pendingType) {
        this.placeLastStandAtScreen(e.clientX, e.clientY);
      }
    };
    this._placementLayer?.addEventListener('pointerup', this._onPlacementLayerUp);

    window.addEventListener('resize', () => this.onResize());
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    if (isTabletLikeDevice()) this._bindPinchZoom(canvas);
    window.addEventListener('keydown', (e) => {
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
      if (e.code === 'Escape' && this.fireSupport?.pending) {
        this.fireSupport.cancel();
        this.ui?.updateFireSupport(this.fireSupport);
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
        if (!this.running || e.touches.length !== 2) return;
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
    if (!this.running) return;
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
    sounds.enterBattle();
    sounds.unlock();
    const restoreSnapshot = options.restoreSnapshot ?? null;
    const startOptions = { ...options };
    delete startOptions.restoreSnapshot;
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
    this.towerDefense = isTowerDefenseMode(gameMode);
    this.lastStand = isLastStandMode(gameMode)
      ? createLastStandState(startOptions.lastStandDeployMode ?? 'manual')
      : null;
    this.campaign = isCampaignMode(gameMode);
    this.campaignStyle = this.campaign ? (startOptions.campaignStyle ?? 'classic') : 'classic';
    this.assaultRole = startOptions.assaultRole ?? 'defend';
    this.difficulty = getDifficulty(
      this.tutorial ? DEFAULT_DIFFICULTY : (startOptions.difficulty ?? DEFAULT_DIFFICULTY)
    );
    this.playerFaction = FACTIONS[factionId];
    this.enemyFaction = getEnemyFaction(factionId);
    const mapSizeId =
      this.lastStand && isLastStandPresetDeployMode(this.lastStand.deployMode)
        ? 'large'
        : (startOptions.mapSize ?? 'medium');
    this.mapDef = buildMapDef(MAPS[mapId], mapSizeId);
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
            ? TD_STARTING_POINTS
            : this.clearance
              ? CLEARANCE_STARTING_RESOURCES
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
    this.engineerSandbags.reset();
    this.baseBuildings.reset();
    if (this.campaignStyle === 'baseBuilding') {
      this.baseBuildings.enable();
    }

    setupSceneEnvironment(this.scene, this.mapDef, this.renderer);
    this.lights = setupLighting(this.scene);

    this.scenery = new DestructibleScenery(this.scene, this.mapDef, () => this._terrainMesh);
    this.coverSystem = new CoverSystem([]);
    this.scenery.setCoverSystem(this.coverSystem);
    const terrain = buildTerrain(this.mapDef, this.scene, this.scenery);
    this._terrainMesh = terrain?.ground ?? null;
    const coverZones = buildCoverSites(
      this.mapDef,
      this.scene,
      this.scenery,
      {
        player: this.playerFaction?.id,
        enemy: this.enemyFaction?.id,
      },
      { towerDefense: this.towerDefense }
    );
    for (const zone of coverZones) {
      this.coverSystem.addZone(zone.x, zone.z, zone.type);
    }

    let playerBasePos = this.mapDef.playerBase;
    let enemyBasePos = this.mapDef.enemyBase;
    let playerHqLabel = 'Allied HQ';
    let enemyHqLabel = this.tutorial ? 'Practice Target HQ' : 'Enemy HQ';

    if (assault) {
      const bases = getAssaultSpawnBases(this.mapDef);
      playerBasePos = this.assaultRole === 'attack' ? bases.attackerBase : bases.defenderBase;
      enemyBasePos = this.assaultRole === 'attack' ? bases.defenderBase : bases.attackerBase;
      playerHqLabel = this.assaultRole === 'attack' ? 'Assault HQ' : 'Defensive HQ';
      enemyHqLabel = this.assaultRole === 'attack' ? 'Defensive HQ' : 'Assault HQ';
      buildFrontlineVisual(this.mapDef, this.scene);
    } else if (this.towerDefense) {
      this.assault = null;
      playerHqLabel = 'Sector HQ';
      buildFrontlineVisual(this.mapDef, this.scene);
    } else {
      this.assault = null;
    }

    const hqHp = this.campaign ? CAMPAIGN_BALANCE.hqMaxHp : 800;
    this.hqs = [];
    if (!this.lastStand) {
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

    this.capturePoints = createCapturePoints(this.mapDef, this.scene);

    if (this.clearance) {
      setupClearanceCapturePoints(this.capturePoints, this.mapDef);
    } else if (assault) {
      this.assault = createAssaultState({
        playerRole: this.assaultRole,
        mapDef: this.mapDef,
        capturePoints: this.capturePoints,
      });
      setupAssaultCapturePoints(this.capturePoints, this.mapDef, this.assault.defenderTeam);
    } else if (this.towerDefense) {
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
        });
        startNextWave(this.towerDefense);
      }
      this.defenses = new DefenseStructureManager({
        scene: this.scene,
        mapDef: this.mapDef,
        getEnemyUnits: () => this._enemyAlive,
        getTerrainMesh: () => this._terrainMesh,
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
    } else if (this.tutorial) {
      for (const cp of this.capturePoints) {
        cp.owner = null;
        cp.progress = 0;
      }
      if (this.capturePoints[0]) {
        this.capturePoints[0].owner = PLAYER_TEAM;
        this.capturePoints[0].progress = 1;
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
      if (this.capturePoints[0]) {
        this.capturePoints[0].owner = PLAYER_TEAM;
        this.capturePoints[0].progress = 1;
      }
      if (this.capturePoints[1]) {
        this.capturePoints[1].owner = ENEMY_TEAM;
        this.capturePoints[1].progress = 1;
      }
      if (this.capturePoints[2]) {
        this.capturePoints[2].owner = PLAYER_TEAM;
        this.capturePoints[2].progress = 1;
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

    const clearanceSpawnBase = this.clearance
      ? getClearancePlayerSpawnBase(this.mapDef)
      : null;

    const baseBuildingCampaign = this.campaignStyle === 'baseBuilding';
    this.units = restoreSnapshot || this.towerDefense || this.lastStand
      ? []
      : spawnArmy({
          faction: this.playerFaction,
          team: PLAYER_TEAM,
          base: clearanceSpawnBase ?? playerBasePos,
          scene: this.scene,
          offsetSign: assault && this.assaultRole === 'attack' ? -1 : 1,
          tutorial: this.tutorial,
          roster: playerRoster,
          clearanceSpawn: this.clearance,
          mapDef: this.clearance ? this.mapDef : null,
          campaign: this.campaign,
          baseBuilding: baseBuildingCampaign,
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
        })
      );
    } else if (!this.tutorial && !this.towerDefense) {
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
          campaign: this.campaign,
          baseBuilding: baseBuildingCampaign,
        })
      );
    }

    if (this.campaign) applyCampaignUnitHp(this.units);

    if (this.lastStand && isLastStandPresetForce(this) && !restoreSnapshot) {
      deployLastStandPresetForces(this);
    }

    for (const u of this.units) {
      u._mapDef = this.mapDef;
      u.position.y = sampleTerrainHeight(u.position.x, u.position.z, this.mapDef);
    }

    if (this.lastStand && isLastStandPresetForce(this) && !restoreSnapshot) {
      this._rebuildUnitCaches();
    }

    const camFocus = clearanceSpawnBase ?? playerBasePos;
    const enemyFocus = this.tutorial || this.towerDefense
      ? this.mapDef.enemyBase
      : this.clearance
        ? this.mapDef.enemyBase
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
    this._rosterKey = '';

    const deployTeams = restoreSnapshot ? this._getDeployZoneTeamsAt(this.matchTime) : this._getDeployZoneTeamsAt(0);
    const deployRadius = getDeployRadius(this.mapDef);
    if (deployTeams.length) {
      if (!restoreSnapshot) {
        containTeamsToDeployZone(this.units, this.hqs, this.mapDef, deployTeams, deployRadius);
      }
      this._showDeployZoneRings(deployTeams);
    }

    if (!restoreSnapshot) {
      resetAI(0, this.tutorial || this.towerDefense || this.lastStand ? 0 : 5);
    }
    this.running = true;
    this.gameOver = false;
    if (!restoreSnapshot) {
      this.paused = false;
      this.ui?.setGamePaused(false);
    }
    this._endOverlayShown = false;
    this._pendingEnd = null;
    this._teardownPending = false;
    this._hudUiAccum = 0;
    this._victoryCheckAccum = 0;
    this._captureUiAccum = 0;
    this._coverUiAccum = 0;
    this._fieldIconUiAccum = 0;
    this._minimapUiAccum = 0;
    this._selectionUiKey = '';
    this._hoverUiId = '';
    this._combatAccum = 0;
    this._deployUiAccum = 0;
    this._rosterUiAccum = 0;
    this._emptyFieldHandled = false;
    if (!restoreSnapshot) {
      this.matchTime = 0;
    }
    this._hqThreat = null;
    this._hqAlertPlayed = false;
    this.controller.enable();
    this._syncBattleCursor();
    this.ui.hideEndOverlay();
    this.ui.showHUD(this.playerFaction, this.mapDef, this.gameMode, {
      assaultRole: this.assaultRole,
      difficulty: this.tutorial ? null : this.difficulty,
      towerDefense: this.towerDefense,
      tdEndless: !!this.towerDefense?.endless,
      lastStand: !!this.lastStand,
      lastStandPreset: isLastStandPresetForce(this),
      campaignStyle: this.campaignStyle,
    });
    if (isTabletLikeDevice()) {
      this.setTabletTargetMode(true);
    }
    this.showUnitFieldIcons = this.ui.showUnitFieldIcons;
    this.showFrontline = this.ui.showFrontline;
    syncFrontlineVisual(this.scene, this.showFrontline);
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
    this.ui.setCheatHud(this.cheatMode);
    if (this.cheatMode) this.ui.showCheatToast(true);
    this.ui.updateBaseBuild(this);
    this.ui.updateDefenses(this);
    this.ui.updateTowerDefense(this);
    this.ui.updateFireSupport(this.fireSupport);
    if (this.lastStand) {
      this.ui.updateLastStandDeploy(this);
    } else {
      const deployPhase = this._getDeployPhase();
      this.ui.updateDeployCountdown(deployPhase);
      this.ui.updateBattleOpening(deployPhase ? deployPhase.secondsLeft : 0);
    }
    this._syncDeployZoneVisuals();
    this._syncPlacementCapture();
    this._rebuildUnitCaches();
    this._syncUnitRoster();
    this._updateMinimap();
    preloadUnitFieldIcons(getProducibleUnits(this.playerFaction)).then(() => {
      if (this.running) syncPlayerFieldIcons(this._playerAlive, this.showUnitFieldIcons);
    });
    this._bootstrapBattleView();
    this._startRenderLoop();
    return true;
  }

  _rebuildUnitCaches() {
    const alive = [];
    const player = [];
    const enemy = [];
    for (const u of this.units) {
      if (u.dead) continue;
      alive.push(u);
      if (u.team === PLAYER_TEAM) player.push(u);
      else if (u.team === ENEMY_TEAM) enemy.push(u);
    }
    this._aliveUnits = alive;
    this._playerAlive = player;
    this._enemyAlive = enemy;
    if (alive.length > 0) this._emptyFieldHandled = false;
  }

  _renderFrame() {
    updateSkyForCamera(this.scene, this.cameraTarget.x, this.cameraTarget.z);
    this.renderer.render(this.scene, this.camera);
  }

  _selectionUiKeyFor(selected, hover = null) {
    const hoverKey = hover
      ? `${hover.id ?? ''}:${hover.team ?? ''}:${hover.dead ? 1 : 0}`
      : '';
    const unitKey = selected
      .map((u) => `${u.id}:${Math.ceil(u.hp)}:${u.attackOrder?.isGround ? 'g' : u.attackOrder ? 'a' : '-'}`)
      .join(',');
    return `${unitKey}|${hoverKey}|${this.selectedHq?.id ?? ''}`;
  }

  _maybeUpdateSelectionPanel(selected, dt) {
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
    if (this.clearance && this.matchTime < CLEARANCE_CEASEFIRE_TIME) {
      return {
        secondsLeft: CLEARANCE_CEASEFIRE_TIME - this.matchTime,
        total: CLEARANCE_CEASEFIRE_TIME,
        title: 'Defenders hold fire',
        subtitle: 'Stay inside the blue HQ ring — or launch early when ready',
        canLaunchEarly: true,
      };
    }
    if (!this.clearance && this.matchTime < BATTLE_OPENING_TIME) {
      return {
        secondsLeft: BATTLE_OPENING_TIME - this.matchTime,
        total: BATTLE_OPENING_TIME,
        title: 'Quiet sector',
        subtitle: 'Stay inside your HQ ring — or launch early when ready',
        canLaunchEarly: true,
      };
    }
    return null;
  }

  _isPlayerDeployZoneActive() {
    return this._getDeployZoneTeamsAt().includes(PLAYER_TEAM);
  }

  _clampPlayerDeployPoint(x, z) {
    if (!this._isPlayerDeployZoneActive()) return { x, z };
    const hq = this.hqs.find((h) => h.team === PLAYER_TEAM && !h.dead);
    return clampPointToHqZone(x, z, hq, getDeployRadius(this.mapDef));
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
    const baseBuildPending = !!this.baseBuildings?.getPending();
    this.canvas.style.cursor = resolveBattleCursor({
      fireSupportPending:
        !!this.fireSupport?.pending ||
        defensePending ||
        deployPending ||
        sandbagPending ||
        baseBuildPending,
      shiftHeld,
      hasManualFireSelection: selected.some(canManualFireOrder),
    });
  }

  _showDeployZoneRings(teams) {
    disposeDeployZoneRings(this._deployZoneRings, this.scene);
    const hqs = this.hqs.filter((h) => teams.includes(h.team) && !h.dead);
    this._deployZoneRings = createDeployZoneRings(hqs, this.mapDef, this.scene);
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

    this.matchTime = this.clearance ? CLEARANCE_CEASEFIRE_TIME : BATTLE_OPENING_TIME;
    disposeDeployZoneRings(this._deployZoneRings, this.scene);
    this._deployZoneRings = [];
    this.ui?.updateDeployCountdown(null);
    this.ui?.updateBattleOpening(0);
    this.ui?.updateBaseBuild(this);
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
      const dx = target.x - u.position.x;
      const dz = target.z - u.position.z;
      if (dx * dx + dz * dz > 0.04) {
        snapUnitYaw(u, Math.atan2(dx, dz));
      }
    }
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
    syncPlayerFieldIcons(this._playerAlive, this.showUnitFieldIcons);
    syncUnitHealthBars(this._aliveUnits, this.showUnitFieldIcons);
  }

  setShowFrontlineEnabled(enabled) {
    this.showFrontline = !!enabled;
    syncFrontlineVisual(this.scene, this.showFrontline);
  }

  panCameraTo(x, z) {
    if (!this.mapDef) return;
    const half = this.mapDef.size / 2 - 5;
    this.cameraTarget.x = THREE.MathUtils.clamp(x, -half, half);
    this.cameraTarget.z = THREE.MathUtils.clamp(z, -half, half);
  }

  _isTextInputFocused(target) {
    if (!target || typeof target !== 'object') return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
  }

  togglePause() {
    if (!this.running || this.gameOver) return;
    this.paused = !this.paused;
    this.ui?.setGamePaused(this.paused);
    if (this.paused) sounds.clearVehicleEngines();
    this._syncBattleCursor();
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
    });
  }

  selectPlayerUnitById(unitId, additive = false) {
    const unit = this.units.find(
      (u) => u.id === unitId && u.team === PLAYER_TEAM && !u.dead
    );
    if (!unit) return;

    const teamUnits = this.units.filter((u) => u.team === PLAYER_TEAM);
    if (!additive) {
      teamUnits.forEach((u) => u.setSelected(false));
      this.hqs.forEach((h) => h.setSelected(false));
      this.selectedHq = null;
      this.selectedBaseBuilding = null;
    }
    unit.setSelected(true);
    const sel = teamUnits.filter((u) => u.selected && !u.dead);
    this.controller?._notifySelection(teamUnits, null);
  }

  replay() {
    const s = this.lastSession;
    if (!s) return;
    this.activeSaveId = null;
    this.startGame(s.factionId, s.mapId, s.gameMode, s.options);
  }

  saveBattle() {
    if (!this.running || this.gameOver) return false;
    const snapshot = captureBattleSave(this, { id: this.activeSaveId });
    const id = writeBattleSave(snapshot, this.activeSaveId);
    this.activeSaveId = id;
    this.ui?.showSaveToast?.('Battle saved — resume later from the main menu');
    return true;
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
      const sel = this.units.filter((u) => u.team === PLAYER_TEAM && u.selected && !u.dead);
      this.ui?.updateSelection(sel, target, this.selectedHq, this);
    }
  }

  setTabletTargetMode(on) {
    this.controller?.setTabletTargetMode(on);
    this.ui?.setTabletTargetMode(on);
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
    if (this._playerAlive.length === 0) return false;

    if (isLastStandPresetForce(this)) {
      assignLastStandPresetStances(this);
    } else {
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
    if (!result.ok) return;

    sounds.play('spawn');
    this._rebuildUnitCaches();
    this._syncUnitRoster();
    syncUnitFieldIcon(result.unit, this.showUnitFieldIcons);
    this.resources.player = this.lastStand.supplies.player;
    this.ui?.updateLastStandDeploy(this);
    this.ui?.updateResources(this.resources.player, this.capturePoints, this.cheatMode);
  }

  cancelAllFireMissions() {
    if (!this.running || this.gameOver) return false;

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
    addExplosionCrater(this.scene, this.mapDef, x, z, tier, this._terrainMesh);
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
    this._teardownPending = false;
    this.ui?.hideEndOverlay();
    this.controller.disable();
    this.canvas.style.cursor = '';
    this.targetIndicators?.clear();
    this.rangeRings.clear();
    clearTerrainDamage(this.scene);
    clearCombatEffects();
    clearWreckEffects();
    clearDetachedCorpseFalls();
    clearHqBurnEffects();
    this.scenery?.clear();
    this.scenery = null;
    this.selectedHq = null;
    clearFireSupportEffects();
    sounds.clearVehicleEngines();
    this.fireSupport?.clearPreview();
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
    if (mode === 'preview') {
      this.fireSupport.updatePreview(x, z);
      return;
    }
    if (mode === 'place') {
      if (this.fireSupport.tryPlaceTarget(x, z)) {
        this.ui?.updateFireSupport(this.fireSupport);
        this._syncBattleCursor();
      }
    }
  }

  armFireSupport(type) {
    if (!this.running || this.gameOver || this.paused || this._isPlayerDeployZoneActive()) return;
    if (!this.fireSupport.isReady(type) && this.fireSupport.pending !== type) return;
    this.fireSupport.arm(type);
    this._syncBattleCursor();
    this.ui?.updateFireSupport(this.fireSupport);
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
      (this.running && !this.gameOver && !!this.baseBuildings?.getPending()) ||
      (this.running &&
        !this.gameOver &&
        isLastStandDeployPhase(this) &&
        !!this.lastStand?.pendingType);
    this.ui?.setPlacementCapture(active);
  }

  armEngineerBuild(buildType) {
    if (!this.running || this.gameOver) return;
    const mgr = this.engineerSandbags;
    if (!mgr) return;
    if (buildType === 'sandbags' && !mgr.canBuildSandbags()) return;
    if (buildType === 'bunker' && !mgr.canBuildBunker()) return;
    if (this._isPlayerDeployZoneActive()) return;
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

  handleSandbagPlacement(mode, x, z) {
    if (!this.running || this.gameOver || !this.engineerSandbags?.getPending()) return;
    if (mode === 'preview') return;
    const placed = this.engineerSandbags.tryPlace(x, z, PLAYER_TEAM);
    if (placed) sounds.play('select');
    else {
      const reason = this.engineerSandbags.getPlacementRejectReason(x, z, PLAYER_TEAM);
      if (reason) this.ui?.showEngineerBuildHint(reason);
    }
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
    if (mode === 'preview') return;
    const placed = this.baseBuildings.tryPlace(x, z, PLAYER_TEAM, (cost) =>
      this.spendResources(PLAYER_TEAM, cost)
    );
    if (placed) {
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
    sounds.unlock();
    if (!this.defenses.armBarrage()) return;
    this.ui?.updateDefenses(this);
    this._syncPlacementCapture();
    this._syncBattleCursor();
  }

  tryProduce(unitType) {
    if (!this.running || this.gameOver || this.towerDefense) return false;

    if (this.paused) return false;

    if (this.lastStand) {
      if (isLastStandPresetDeployMode(this.lastStand.deployMode)) return false;
      if (this.lastStand.phase !== 'deploy') return false;
      const def = this.playerFaction?.units?.[unitType];
      if (!def) return false;
      if (!this.cheatMode && this.lastStand.supplies.player < def.cost) return false;
      this.lastStand.pendingType = this.lastStand.pendingType === unitType ? null : unitType;
      sounds.play('select');
      this.ui?.updateLastStandDeploy(this);
      this.ui?.updateProduction(this);
      this._syncPlacementCapture();
      this._syncBattleCursor();
      return true;
    }

    const ok = this.production.enqueue(PLAYER_TEAM, unitType, (cost) =>
      this.spendResources(PLAYER_TEAM, cost)
    );
    if (ok) {
      sounds.play('produce');
      this.ui.updateProduction(this);
      this.ui.updateResources(this.resources.player, this.capturePoints, this.cheatMode);
    }
    return ok;
  }

  tickEconomy(dt) {
    if (this.lastStand) return;
    if (this.towerDefense) {
      this.resources.player += 0.4 * dt;
      return;
    }
    const hqRate = this.campaign ? CAMPAIGN_BALANCE.hqIncomeRate : HQ_INCOME_RATE;
    const cpRate = this.campaign ? CAMPAIGN_BALANCE.captureIncomeRate : CAPTURE_POINT_INCOME;
    this.resources.player += hqRate * dt;
    if (!this.tutorial && !this.clearance) {
      this.resources.enemy += hqRate * dt * this.difficulty.enemyIncomeMult;
    }

    for (const cp of this.capturePoints) {
      if (cp.owner === PLAYER_TEAM) this.resources.player += cpRate * dt;
      if (!this.tutorial && !this.clearance && cp.owner === ENEMY_TEAM) {
        this.resources.enemy += cpRate * dt * this.difficulty.enemyIncomeMult;
      }
    }
  }

  updateCapturePoints(dt) {
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

    if (this.keys['ArrowUp'] || pad?.zoomIn) {
      this.cameraTarget.addScaledVector(viewForward, dollySpeed);
    }
    if (this.keys['ArrowDown'] || pad?.zoomOut) {
      this.cameraTarget.addScaledVector(viewForward, -dollySpeed);
    }

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
    return team === PLAYER_TEAM ? this._playerAlive.length : this._enemyAlive.length;
  }

  /** HUD panels — throttled so DOM work does not scale with frame rate. */
  _tickBattleHud() {
    if (!this.ui || this.gameOver) return;

    const playerAlive = this._countAlive(PLAYER_TEAM);
    const enemyAlive = this._countAlive(ENEMY_TEAM);

    this.ui.updateArmyStats(playerAlive, enemyAlive, {
      tutorial: this.tutorial,
      assault: this.assault,
      clearance: this.clearance,
      towerDefense: this.towerDefense,
      defenseCount: this.defenses?.entries.filter((e) => !e.destroyed).length ?? 0,
      wipeHint: this._getArmyWipeHint(playerAlive),
    });
    this.ui.updateResources(Math.floor(this.resources.player), this.capturePoints, this.cheatMode);
    if (!this.towerDefense) this.ui.updateCapturePoints(this.capturePoints);
    if (!this.towerDefense) this.ui.updateProduction(this);
    if (this.baseBuildings?.active) this.ui.updateBaseBuild(this);
    if (this.towerDefense) {
      this.ui.updateDefenses(this);
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
          'Practice complete! You destroyed the target HQ. Return to the menu to play Campaign mode.'
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

    const playerEliminated = teamIsEliminated(PLAYER_TEAM, this, playerAlive.length);
    const enemyEliminated = teamIsEliminated(ENEMY_TEAM, this, enemyAlive.length);

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
    if (this.production.canAffordAny(PLAYER_TEAM, this.resources.player)) {
      return `Your forces: 0 · ${res} supplies — train reinforcements in the panel below`;
    }
    const income = estimateTeamIncomePerSec(PLAYER_TEAM, this);
    if (income > 0) {
      return `Your forces: 0 · ${res} supplies (+${income.toFixed(1)}/s) — waiting to afford reinforcements`;
    }
    return null;
  }

  endGame(victory, detail) {
    if (this.gameOver) return;

    if (this.activeSaveId) {
      deleteBattleSave(this.activeSaveId);
      this.activeSaveId = null;
    }

    this.gameOver = true;
    this.running = false;
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
      sounds.play(victory ? 'victory' : 'defeat');
    });
  }

  _finalizeBattleStats() {
    if (this._battleStatsFinalized) return;
    this._battleStatsFinalized = true;
    this.recordBattleLosses();
    this.battleStats.recordDefenseFromEntries(this.defenses?.entries);
  }

  _buildEndBattleReport() {
    this._finalizeBattleStats();
    return this.battleStats.buildReport({
      playerName: this.playerFaction.name,
      enemyName: this.enemyFaction.name,
      tutorial: this.tutorial,
      towerDefense: !!this.towerDefense,
      tdEndless: !!this.towerDefense?.endless,
      tdWavesCleared: this.towerDefense?.wavesCleared ?? 0,
    });
  }

  _purgeBattlefieldEffects() {
    clearHqBurnEffects();
    clearCombatEffects();
    clearWreckEffects();
    clearFireSupportEffects();
    clearTerrainDamage(this.scene);
    this.fireSupport?.reset();
  }

  /** No live units on the map — skip corpse churn while victory/defeat is resolved. */
  _handleEmptyBattlefield() {
    if (this._aliveUnits.length > 0 || this.gameOver || this._emptyFieldHandled) return;
    this._emptyFieldHandled = true;
  }

  /** Victory/defeat panel — must be synchronous when the match ends. */
  _showEndOverlayNow(victory, detail) {
    if (this._endOverlayShown || !this.ui) return;
    this._endOverlayShown = true;
    const message = `${victory ? this.playerFaction.name + ' victory' : 'Defeat'} at ${this.mapDef.name}. ${detail}`;
    this.ui.showEndOverlay(victory, message, null, !!this.lastSession);
  }

  _presentEndScreen(victory, detail) {
    this._pendingEnd = { victory, detail };
    this._showEndOverlayNow(victory, detail);
    this.ui?.updateEndStats(this._buildEndBattleReport());
  }

  recordBattleLosses() {
    for (const u of this.units) {
      if (u.dead) this.battleStats.recordUnit(u);
    }
    for (const h of this.hqs) {
      if (h.dead) this.battleStats.recordHq(h.team);
    }
  }

  _recordMinimapCombatFire({ attacker, def, from, to, coaxFire }) {
    if (!this.running || this.gameOver || !from || !to) return;
    this.ui?.recordMinimapFire?.({
      fromX: from.x,
      fromZ: from.z,
      toX: to.x,
      toZ: to.z,
      team: attacker?.team,
      weaponType: coaxFire ? 'machineGun' : def?.type ?? 'infantry',
    });
  }

  onCombatFire({ attacker, target, def, dist, killed, targetIsHQ, targetIsScenery, groundImpact, from, to, coaxFire }) {
    this._recordMinimapCombatFire({ attacker, def, from, to, coaxFire });
    const pos = { x: from.x, z: from.z };
    const factionId = attacker.faction?.id;

    if (coaxFire) {
      sounds.playWeapon(mgProfileForFaction(factionId), pos, {
        rate: 1.04 + Math.random() * 0.08,
        volume: 0.82,
      });
      if (killed && target?.def && isInfantryUnitType(target.def.type)) {
        sounds.playInfantryDeath({ x: to.x, z: to.z }, target.faction?.id);
      } else if (killed) {
        sounds.playImpact('bullet', { x: to.x, z: to.z }, 0.03 + dist / 320);
      }
      return;
    }

    let profile = resolveWeaponProfile(def, factionId);
    let rate = 0.94 + Math.random() * 0.1;
    let volume = 1;

    if (def.type === 'infantry') {
      attacker._mgVolley = (attacker._mgVolley ?? 0) + 1;
      const useMg = def.usesMG && attacker._mgVolley % 2 !== 0;
      if (useMg) profile = mgProfileForFaction(factionId);
      rate = useMg ? 1.02 : 0.98 + Math.random() * 0.06;
    } else if (def.type === 'sniper') {
      rate = 0.92 + Math.random() * 0.04;
      volume = 0.9;
    } else if (def.type === 'machineGun' || def.type === 'armoredCar') {
      rate = def.type === 'armoredCar' ? 1.05 + Math.random() * 0.06 : 0.98 + Math.random() * 0.08;
    } else if (def.type === 'mortar') {
      rate = 0.72 + Math.random() * 0.1;
      volume = 0.75;
    } else if (isTankType(def.type) || def.type === 'antiTankGun') {
      rate = 0.96 + Math.random() * 0.08;
    }

    sounds.playWeapon(profile, pos, { rate, volume });

    if (def.type === 'artillery' || def.type === 'mortar') {
      const delay = Math.min(1.1, 0.25 + dist / (def.type === 'mortar' ? 90 : 100));
      sounds.playImpact('shell', { x: to.x, z: to.z }, delay);
    } else if (isTankType(def.type) || def.type === 'antiTankGun') {
      sounds.playImpact('tank_round', { x: to.x, z: to.z }, 0.08 + dist / 180);
    } else if (killed) {
      if (target?.def && isInfantryUnitType(target.def.type)) {
        sounds.playInfantryDeath({ x: to.x, z: to.z }, target.faction?.id);
      } else {
        sounds.playImpact('bullet', { x: to.x, z: to.z }, 0.03 + dist / 350);
      }
    }

    const targetIsTank = killed && target?.def && isTankType(target.def.type);

    if (
      killed ||
      targetIsScenery ||
      (groundImpact &&
        (def.type === 'artillery' ||
          def.type === 'mortar' ||
          def.type === 'antiTankGun' ||
          isTankType(def.type)))
    ) {
      if (targetIsTank) {
        spawnSmokePuff(this.scene, to, 1.1);
        spawnSmokePuff(this.scene, to, 0.75);
        if (target?.mesh?.parent && !target.wreckFire) {
          target.wreckFire = spawnTankWreckFire(this.scene, target.position, target.mesh);
          sounds.play('explosion');
        }
        this._spawnExplosionCrater(to.x, to.z, 'medium');
      } else if (def.type === 'artillery') {
        spawnShellExplosion(this.scene, to, 'heavy');
        this._spawnExplosionCrater(to.x, to.z, 'heavy');
      } else if (def.type === 'mortar' || def.type === 'antiTankGun' || isTankType(def.type)) {
        spawnShellExplosion(this.scene, to, 'medium');
        this._spawnExplosionCrater(to.x, to.z, def.type === 'mortar' ? 'medium' : 'medium');
      } else {
        spawnExplosion(this.scene, to);
        this._spawnExplosionCrater(to.x, to.z, groundImpact ? 'medium' : 'light');
      }
      if (!targetIsTank) {
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

    const dt = Math.min(this.clock.getDelta(), 0.05);
    const viewActive = this.running && !this.gameOver;
    const simActive = viewActive && !this.paused;
    const fieldHasUnits = this._aliveUnits.length > 0;
    const hasCorpses = this.units.some((u) => u.dead && u.mesh?.parent);

    if (this.gameOver) {
      if (!this._endOverlayShown && this._pendingEnd) {
        this._presentEndScreen(this._pendingEnd.victory, this._pendingEnd.detail);
      }
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
        const minimapInterval = this.ui?.minimapHasFireTraces?.() ? 0.033 : 0.1;
        if (this._minimapUiAccum >= minimapInterval) {
          this._minimapUiAccum = 0;
          this._updateMinimap();
        }

        this.matchTime += dt;
        updateDetachedCorpseFalls(dt);
        tickUnitCooldowns(this._aliveUnits, dt);
        updateMedicHealing(this._aliveUnits, dt);
        updateHospitalHealing(this.baseBuildings, this._aliveUnits, dt);
        updateMotorPoolHealing(this.baseBuildings, this._aliveUnits, dt);
        updateEngineerHealing(this._aliveUnits, dt);
        this.engineerSandbags?.update(dt);
        if (this.engineerSandbags?.sites?.length) {
          this.ui?.updateEngineerBuild(this);
        }
        this.baseBuildings?.update(dt);
        if (getGarrisonBunkerSources(this).length > 0) {
          updateBunkerGarrison(this._aliveUnits, this);
        }
        syncHealMarkers(this._aliveUnits, this.baseBuildings);
        syncDamageSmoke(this._aliveUnits);
        updateDamageSmoke(this._aliveUnits, dt);
        syncUnitHealthBars(this._aliveUnits, this.showUnitFieldIcons);
        updateSurrenderState(this, this.units, dt);
        syncSurrenderMarkers(this._aliveUnits);
        syncRankMarkers(this._aliveUnits);
        updateRankMarkers(this._aliveUnits);
        this.tickEconomy(dt);
        if (this.lastStand && isLastStandDeployPhase(this)) {
          updateLastStandEnemyDeploy(this, dt);
          this._rebuildUnitCaches();
          this._lastStandUiAccum = (this._lastStandUiAccum ?? 0) + dt;
          if (this._lastStandUiAccum >= 0.15) {
            this._lastStandUiAccum = 0;
            this.ui?.updateLastStandDeploy(this);
            this.ui?.updateResources(this.lastStand.supplies.player, this.capturePoints, this.cheatMode);
          }
        } else if (!this.towerDefense) {
          this.updateCapturePoints(dt);
          this.production.update(dt, this.units);
        } else {
          updateTowerDefenseMode(this, dt);
        }

        if (this.assault) {
          updateAssaultTimers(this.assault, dt);
        }

        this._fieldIconUiAccum += dt;
        if (this._fieldIconUiAccum >= 0.12) {
          this._fieldIconUiAccum = 0;
          syncPlayerFieldIcons(this._playerAlive, this.showUnitFieldIcons);
        }

        if (isLastStandDeployPhase(this)) {
          this.updateCamera(dt);
          updateLightingForTarget(this.lights, this.cameraTarget.x, this.cameraTarget.z);
          this._renderFrame();
          return;
        }

        updateMovement(this._aliveUnits, dt, this.mapDef, this.hqs, {
          getWireSlowMult: this.defenses
            ? (x, z, unit) => this.defenses.getMoveSlowMult(x, z, unit)
            : null,
        });

        const stagingTeams = this._getDeployZoneTeamsAt();
        if (stagingTeams.length) {
          containTeamsToDeployZone(
            this._aliveUnits,
            this.hqs,
            this.mapDef,
            stagingTeams,
            getDeployRadius(this.mapDef)
          );
        }
        this._syncDeployZoneVisuals();
        sounds.setListener(this.cameraTarget.x, this.cameraTarget.z);
        sounds.updateVehicleEngines(this._aliveUnits, dt);
        for (const u of this._aliveUnits) {
          if (u.retreating) {
            const hq = this.hqs.find((h) => h.team === u.team && !h.dead);
            updateRetreatState(u, hq, this.mapDef);
          }
        }
        this._coverUiAccum += dt;
        if (this.coverSystem && this._coverUiAccum >= 0.12) {
          this._coverUiAccum = 0;
          this.coverSystem.updateUnits(this._aliveUnits);
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

        if (this._aliveUnits.length > 0 && this._combatAccum >= combatStep) {
          const cdt = this._combatAccum;
          this._combatAccum = 0;
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
              protectPlayerHq: this.clearance || this.towerDefense,
              tutorialPassiveNoHq: this.tutorial,
              practiceHqDamageMult: this.tutorial ? PRACTICE_TARGET_HQ_DAMAGE_MULT : 1,
              openingCeasefire:
                !this.tutorial &&
                !this.towerDefense &&
                !this.lastStand &&
                this.matchTime < BATTLE_OPENING_TIME,
              enemyCeasefire: this.clearance && this.matchTime < CLEARANCE_CEASEFIRE_TIME,
              paceDamageMult: this.campaign ? CAMPAIGN_BALANCE.damageMult : 1,
              defenseTargets: this.defenses?.getAttackTargets() ?? [],
              baseBuildingTargets: [
                ...(this.baseBuildings?.getAttackTargets() ?? []),
                ...(this.engineerSandbags?.getAttackTargets() ?? []),
              ],
              clearance: this.clearance,
              tutorial: this.tutorial,
              towerDefense: this.towerDefense,
            }
          );
          this._rebuildUnitCaches();
        }

        if (this.towerDefense && this.defenses) {
          this.defenses.update(dt, this.scene, this.mapDef);
          if (!this.gameOver) {
            const breach = checkTowerDefenseBreach(this);
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
          const livingPlayer = this.units.filter((u) => u.team === PLAYER_TEAM && !u.dead).length;
          const livingEnemy = this.units.filter((u) => u.team === ENEMY_TEAM && !u.dead).length;
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
        updateFireSupportEffects(dt, this.scene);
        flushTerrainNormals(this._terrainMesh);

        if (fieldHasUnits || hasCorpses) {
          updateWreckEffects(dt, this.camera);
          updateHqBurnEffects(dt, this.camera, this.hqs);
          this.rangeRings.updateForUnits(this._aliveUnits);
          this.targetIndicators.update(playerSelected, this._playerAlive);
          updateCombatEffects(dt);
          this._fireSupportUiAccum += dt;
          if (this._fireSupportUiAccum >= 0.15) {
            this._fireSupportUiAccum = 0;
            this.ui?.updateFireSupport(this.fireSupport);
          }

          if (this.towerDefense) {
            updateTowerDefenseEnemyAI(
              this._enemyAlive,
              this.mapDef,
              this.towerDefense,
              this.defenses,
              dt
            );
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
              openingCeasefire:
                !this.lastStand && this.matchTime < BATTLE_OPENING_TIME,
              difficulty: this.campaign
                ? getCampaignDifficulty(this.difficulty)
                : this.difficulty,
            });
          }

          this._deployUiAccum += dt;
          if (this._deployUiAccum >= 0.12 && !this.lastStand) {
            this._deployUiAccum = 0;
            const deployPhase = this._getDeployPhase();
            this.ui?.updateDeployCountdown(deployPhase);
            this.ui?.updateBattleOpening(
              deployPhase ? deployPhase.secondsLeft : 0
            );
          }

          this.cleanupDead(dt);
          this._rosterUiAccum += dt;
          if (this._rosterUiAccum >= 0.35) {
            this._rosterUiAccum = 0;
            this._syncUnitRoster();
          }
        } else {
          updateHqBurnEffects(dt, this.camera, this.hqs);
          if (hasCorpses) updateWreckEffects(dt, this.camera);
          this.cleanupDead(dt);
        }
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

  cleanupDead(dt) {
    if (this.gameOver) return;

    let cachesDirty = false;
    const unitsBefore = this.units.length;

    for (const u of this.units) {
      if (!u.dead) continue;
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

      if (isTankType(u.def.type) && u.mesh.userData?.wreckApplied && !u.wreckFire) {
        u.wreckFire = spawnTankWreckFire(this.scene, u.position, u.mesh);
      }
    }
    this.units = this.units.filter(
      (u) => !u.dead || (unitHasCorpseLinger(u) && u.mesh?.parent)
    );
    if (this.units.length !== unitsBefore) cachesDirty = true;
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