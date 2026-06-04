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
  TD_STARTING_POINTS,
  CLEARANCE_STARTING_RESOURCES,
} from '../data/gameModes.js';
import {
  createTowerDefenseState,
  startNextWave,
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
import { removeCoverMarker } from '../visual/CoverMarkers.js';
import {
  createAssaultState,
  setupAssaultCapturePoints,
  getAssaultSpawnBases,
  updateAssaultTimers,
  checkAssaultVictory,
} from './AssaultMode.js';
import { buildFrontlineVisual, disposeFrontlineVisual } from '../world/Frontline.js';
import { createCheatKeyBuffer, shouldIgnoreCheatKeyEvent } from './CheatMode.js';
import { buildCoverSites } from '../world/CoverSites.js';
import { CoverSystem } from './CoverSystem.js';
import { MAPS } from '../data/maps.js';
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
import { clearTerrainDamage } from '../world/TerrainDamage.js';
import { spawnArmy } from './Spawner.js';
import { updateCombat, updateMovement, tickUnitCooldowns } from './Combat.js';
import { updateAI, resetAI } from './AI.js';
import { containTeamsToDeployZone, clampPointToHqZone } from './OpeningDeployZone.js';
import { createDeployZoneRings, disposeDeployZoneRings } from '../visual/DeployZoneRing.js';
import { RTSController } from '../input/RTSController.js';
import { canGroundFire, resolveBattleCursor } from '../input/BattleCursor.js';
import { HQ } from './HQ.js';
import { createCapturePoints } from './CapturePoint.js';
import { ProductionManager } from './Production.js';
import { BattleStats } from './BattleStats.js';
import { sounds, weaponProfileForDef, isInfantryUnitType } from '../audio/SoundManager.js';
import { isTankType } from '../units/VehicleTypes.js';
import { applyUnitDeathVisual, unitHasCorpseLinger } from '../units/UnitMeshes.js';
import { FireSupportManager } from './FireSupport.js';
import {
  updateFireSupportEffects,
  clearFireSupportEffects,
} from '../effects/FireSupportEffects.js';

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
    this.matchTime = 0;
    this.mapDef = null;
    this.units = [];
    this.hqs = [];
    this.capturePoints = [];
    this._deployZoneRings = [];
    this.coverSystem = null;
    this.scenery = null;
    this.selectedHq = null;
    this.playerFaction = null;
    this.enemyFaction = null;
    this.gameMode = 'campaign';
    this.tutorial = false;
    this.assault = null;
    this.assaultRole = null;
    this.towerDefense = null;
    this.defenses = null;
    this.difficulty = getDifficulty(DEFAULT_DIFFICULTY);
    this.lastSession = null;
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
    this.cheatMode = false;
    this._cheatKeys = createCheatKeyBuffer();

    this.production = new ProductionManager({
      getFaction: (team) => (team === PLAYER_TEAM ? this.playerFaction : this.enemyFaction),
      getTeam: (team) => team,
      getSpawnPos: (team) => {
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
        if (team === PLAYER_TEAM) sounds.play('spawn');
        this._rebuildUnitCaches();
      },
      onQueueChange: () => this.ui?.updateProduction(this),
    });

    this.rangeRings = new RangeRingManager(this.scene);
    this.targetIndicators = new TargetIndicators(this.scene);

    this.fireSupport = new FireSupportManager(this);

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
      getIsTowerDefense: () =>
        isTowerDefenseMode(this.gameMode) && this.running && !this.gameOver,
      getDeployZoneActive: () => this._isPlayerDeployZoneActive(),
      clampDeployPoint: (x, z) => this._clampPlayerDeployPoint(x, z),
      onFireSupportTarget: (mode, x, z) => this.handleFireSupportTarget(mode, x, z),
      onDefensePlacement: (mode, x, z) => this.handleDefensePlacement(mode, x, z),
      onSelectionChange: (sel, hq = null) => {
        this.selectedHq = hq;
        if (sel.length > 0 || hq) sounds.play('select');
        this.ui?.updateSelection(sel, this.controller.hoveredTarget, hq);
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
        this.ui?.updateSelection(sel, target, this.selectedHq);
      },
      onOrder: (type, selected) => {
        sounds.play('order');
        if (type === 'attack' && selected?.length) {
          this.ui?.updateSelection(selected, this.controller.hoveredTarget, this.selectedHq);
        }
        this._syncBattleCursor();
      },
      onBattleCursorChange: () => this._syncBattleCursor(),
    });

    this._placementLayer = document.getElementById('placement-layer');
    this._onPlacementLayerUp = (e) => {
      if (e.button !== 0) return;
      if (!this.defenses?.getPending()) return;
      this.placeDefenseAtScreen(e.clientX, e.clientY);
    };
    this._placementLayer?.addEventListener('pointerup', this._onPlacementLayerUp);

    window.addEventListener('resize', () => this.onResize());
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      this._onCheatKeyDown(e);
      if (
        this.running &&
        (e.code === 'ArrowUp' ||
          e.code === 'ArrowDown' ||
          e.code === 'ArrowLeft' ||
          e.code === 'ArrowRight')
      ) {
        e.preventDefault();
      }
      if (e.code === 'Escape' && this.fireSupport?.pending) {
        this.fireSupport.cancel();
        this.ui?.updateFireSupport(this.fireSupport);
      }
      if (e.code === 'Escape' && this.defenses?.getPending()) {
        this.defenses.cancelPending();
        this.ui?.updateDefenses(this);
        this._syncPlacementCapture();
        this._syncBattleCursor();
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this._syncBattleCursor();
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
    if (this._rafActive) return;
    this._rafActive = true;
    requestAnimationFrame(this.animate);
  }

  _stopRenderLoop() {
    this._rafActive = false;
  }

  onResize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
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
    this.stopGame();
    this.lastSession = {
      factionId,
      mapId,
      gameMode,
      options: { ...options },
    };
    this.gameMode = gameMode;
    this.tutorial = gameMode === 'tutorial';
    this.clearance = isClearanceMode(gameMode);
    this.towerDefense = isTowerDefenseMode(gameMode);
    this.campaign = isCampaignMode(gameMode);
    this.assaultRole = options.assaultRole ?? 'defend';
    this.difficulty = getDifficulty(
      this.tutorial ? DEFAULT_DIFFICULTY : (options.difficulty ?? DEFAULT_DIFFICULTY)
    );
    this.playerFaction = FACTIONS[factionId];
    this.enemyFaction = getEnemyFaction(factionId);
    this.mapDef = MAPS[mapId];
    const assault = isAssaultMode(gameMode);
    const enemyBaseRes = assault ? ASSAULT_ENEMY_RESOURCES : ENEMY_STARTING_RESOURCES;
    this.resources = {
      player: this.tutorial
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
      enemy: this.tutorial || this.clearance || this.towerDefense
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
    this.fireSupport.reset();

    setupSceneEnvironment(this.scene, this.mapDef);
    this.lights = setupLighting(this.scene);

    this.scenery = new DestructibleScenery(this.scene);
    this.coverSystem = new CoverSystem([]);
    this.scenery.setCoverSystem(this.coverSystem);
    const terrain = buildTerrain(this.mapDef, this.scene, this.scenery);
    this._terrainMesh = terrain?.ground ?? null;
    const coverZones = buildCoverSites(this.mapDef, this.scene, this.scenery);
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
    this.hqs = [
      new HQ({
        team: PLAYER_TEAM,
        position: playerBasePos,
        mapDef: this.mapDef,
        scene: this.scene,
        label: playerHqLabel,
        maxHp: hqHp,
      }),
    ];
    if (!this.clearance && !this.towerDefense) {
      this.hqs.push(
        new HQ({
          team: ENEMY_TEAM,
          position: enemyBasePos,
          mapDef: this.mapDef,
          scene: this.scene,
          label: enemyHqLabel,
          maxHp: this.tutorial ? PRACTICE_TARGET_HQ_HP : hqHp,
        })
      );
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
      }
      this.towerDefense = createTowerDefenseState({
        mapDef: this.mapDef,
        difficulty: this.difficulty,
      });
      startNextWave(this.towerDefense);
      this.defenses = new DefenseStructureManager({
        scene: this.scene,
        mapDef: this.mapDef,
        getEnemyUnits: () => this._enemyAlive,
        onChange: () => {
          this.ui?.updateDefenses(this);
          this._syncPlacementCapture();
        },
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

    this.units = this.towerDefense
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
        })
      );
    }

    if (this.campaign) applyCampaignUnitHp(this.units);

    for (const u of this.units) {
      u._mapDef = this.mapDef;
      u.position.y = sampleTerrainHeight(u.position.x, u.position.z, this.mapDef);
    }

    const camFocus = clearanceSpawnBase ?? playerBasePos;
    const enemyFocus = this.tutorial || this.towerDefense
      ? this.mapDef.enemyBase
      : this.clearance
        ? this.mapDef.enemyBase
        : enemyBasePos;
    this._setupBattleCamera(camFocus, enemyFocus);
    this._faceUnitsToward(this.units.filter((u) => u.team === PLAYER_TEAM), enemyFocus);
    this._faceUnitsToward(this.units.filter((u) => u.team === ENEMY_TEAM), camFocus);
    this._rosterKey = '';

    const deployTeams = this._getDeployZoneTeamsAt(0);
    if (deployTeams.length) {
      containTeamsToDeployZone(this.units, this.hqs, this.mapDef, deployTeams);
      this._showDeployZoneRings(deployTeams);
    }

    resetAI(0, this.tutorial || this.towerDefense ? 0 : 5);
    this.running = true;
    this.gameOver = false;
    this._endOverlayShown = false;
    this._pendingEnd = null;
    this._teardownPending = false;
    this._hudUiAccum = 0;
    this._victoryCheckAccum = 0;
    this._captureUiAccum = 0;
    this._coverUiAccum = 0;
    this._selectionUiKey = '';
    this._hoverUiId = '';
    this._combatAccum = 0;
    this._deployUiAccum = 0;
    this._rosterUiAccum = 0;
    this._emptyFieldHandled = false;
    this.matchTime = 0;
    this.controller.enable();
    this._syncBattleCursor();
    this.ui.hideEndOverlay();
    this.ui.showHUD(this.playerFaction, this.mapDef, this.gameMode, {
      assaultRole: this.assaultRole,
      difficulty: this.tutorial ? null : this.difficulty,
      towerDefense: this.towerDefense,
    });
    this.ui.updateProduction(this);
    this.ui.updateDefenses(this);
    this.ui.updateTowerDefense(this);
    this.ui.updateFireSupport(this.fireSupport);
    this.ui.updateDeployCountdown(this._getDeployPhase());
    this._syncPlacementCapture();
    this._rebuildUnitCaches();
    this._syncUnitRoster();
    this._startRenderLoop();
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
    this.renderer.render(this.scene, this.camera);
  }

  _maybeUpdateSelectionPanel(selected, dt) {
    if (!selected.length || !this.ui) return;
    const hover = this.controller?.hoveredTarget;
    const hoverKey = hover
      ? `${hover.id ?? ''}:${hover.team ?? ''}:${hover.dead ? 1 : 0}`
      : '';
    const key = `${selected.map((u) => `${u.id}:${Math.ceil(u.hp)}`).join(',')}|${hoverKey}|${this.selectedHq?.id ?? ''}`;
    this._selectionUiAccum += dt;
    if (key === this._selectionUiKey && this._selectionUiAccum < 0.2) return;
    this._selectionUiKey = key;
    this._selectionUiAccum = 0;
    this.ui.updateSelection(selected, hover, this.selectedHq);
  }

  _getDeployZoneTeamsAt(time = this.matchTime) {
    if (this.tutorial || this.towerDefense) return [];
    if (this.clearance) {
      return time < CLEARANCE_CEASEFIRE_TIME ? [PLAYER_TEAM] : [];
    }
    return time < BATTLE_OPENING_TIME ? [PLAYER_TEAM, ENEMY_TEAM] : [];
  }

  _getDeployPhase() {
    if (this.tutorial || this.towerDefense || !this.running) return null;
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
    return clampPointToHqZone(x, z, hq);
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
      this.controller?.isShiftHeld?.();
    const selected = this._playerAlive.filter((u) => u.selected);
    const defensePending = !!this.defenses?.getPending();
    this.canvas.style.cursor = resolveBattleCursor({
      fireSupportPending: !!this.fireSupport?.pending || defensePending,
      shiftHeld,
      hasGroundFireSelection: selected.some(canGroundFire),
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

  /** End quiet sector / clearance ceasefire immediately (player override). */
  launchBattleNow() {
    if (!this.running || this.gameOver || this.tutorial) return;
    if (!this._getDeployPhase()) return;

    this.matchTime = this.clearance ? CLEARANCE_CEASEFIRE_TIME : BATTLE_OPENING_TIME;
    disposeDeployZoneRings(this._deployZoneRings, this.scene);
    this._deployZoneRings = [];
    this.ui?.updateDeployCountdown(null);
    this.ui?.updateBattleOpening(0);
    this._syncBattleCursor();
    sounds.play('order');
  }

  _setupBattleCamera(playerFocus, enemyFocus) {
    const dx = enemyFocus.x - playerFocus.x;
    const dz = enemyFocus.z - playerFocus.z;
    const len = Math.hypot(dx, dz) || 1;
    const dirX = dx / len;
    const dirZ = dz / len;

    this.cameraYaw = Math.atan2(-dirX, -dirZ);
    this.zoom = 34;

    this.cameraTarget.set(
      playerFocus.x + dirX * 8,
      0,
      playerFocus.z + dirZ * 8
    );

    const horizontalDist = this.zoom * 0.89;
    const camOffset = new THREE.Vector3(
      Math.sin(this.cameraYaw) * horizontalDist,
      this.zoom * 0.88,
      Math.cos(this.cameraYaw) * horizontalDist
    );
    this.camera.position.copy(this.cameraTarget).add(camOffset);
    this.camera.lookAt(this.cameraTarget);
  }

  _faceUnitsToward(units, target) {
    if (!target) return;
    for (const u of units) {
      if (u.dead) continue;
      const dx = target.x - u.position.x;
      const dz = target.z - u.position.z;
      if (dx * dx + dz * dz > 0.04) {
        u.mesh.rotation.y = Math.atan2(dx, dz);
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
    }
    unit.setSelected(true);
    const sel = teamUnits.filter((u) => u.selected && !u.dead);
    this.controller?._notifySelection(teamUnits, null);
  }

  replay() {
    const s = this.lastSession;
    if (!s) return;
    this.startGame(s.factionId, s.mapId, s.gameMode, s.options);
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
      const sel = this.units.filter((u) => u.team === PLAYER_TEAM && u.selected && !u.dead);
      this.ui?.updateSelection(sel, target, this.selectedHq);
    }
  }

  stopGame() {
    this.running = false;
    this.gameOver = false;
    this._endOverlayShown = false;
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
    this.defenses?.clear();
    this.defenses = null;
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
    if (!this.running || this.gameOver || this._isPlayerDeployZoneActive()) return;
    if (!this.fireSupport.isReady(type) && this.fireSupport.pending !== type) return;
    this.fireSupport.arm(type);
    this._syncBattleCursor();
    this.ui?.updateFireSupport(this.fireSupport);
  }

  placeDefenseAtScreen(clientX, clientY) {
    if (!this.running || this.gameOver || !this.defenses?.getPending()) return;
    const rect = this.canvas.getBoundingClientRect();
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return;
    }
    this.controller.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.controller.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    const ground = this.controller.raycastGround();
    if (ground) this.handleDefensePlacement('place', ground.x, ground.z);
  }

  _syncPlacementCapture() {
    const active =
      this.running && !this.gameOver && !!this.defenses?.getPending();
    this.ui?.setPlacementCapture(active);
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
      const reason = this.defenses.getPlacementRejectReason(x, z);
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

  armDefense(typeId) {
    if (!this.running || this.gameOver || !this.defenses) return;
    sounds.unlock();
    this.fireSupport?.cancel();
    this.defenses.arm(typeId);
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

    if (this.keys['ArrowLeft']) this.cameraYaw += rotateSpeed;
    if (this.keys['ArrowRight']) this.cameraYaw -= rotateSpeed;

    let panForward = 0;
    let panRight = 0;
    if (this.keys['KeyW']) panForward -= 1;
    if (this.keys['KeyS']) panForward += 1;
    if (this.keys['KeyA']) panRight -= 1;
    if (this.keys['KeyD']) panRight += 1;

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
    if (this.towerDefense) {
      this.ui.updateDefenses(this);
      this.ui.updateTowerDefense(this);
    }
    if (this.assault) this.ui.updateAssaultHUD(this.assault);
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
    if (this.tutorial || this.clearance || playerAlive > 0 || this.gameOver) return null;

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

  _accelerateCleanupIfPlayerWiped() {
    if (this.units.some((u) => u.team === PLAYER_TEAM && !u.dead)) return;
    for (const u of this.units) {
      if (!u.dead || u.def?.type !== 'tank' || u.wreckTimeLeft <= 0) continue;
      u.wreckTimeLeft = Math.min(u.wreckTimeLeft, 2.5);
    }
  }

  endGame(victory, detail) {
    if (this.gameOver) return;

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
        u.wreckTimeLeft = 0;
        u.corpseTimeLeft = 0;
        removeCoverMarker(u);
        removeRetreatMarker(u);
        if (u.wreckFire) {
          removeWreckEffect(u.wreckFire);
          u.wreckFire = null;
        }
      }
    }

    this._showEndOverlayNow(victory, detail);

    requestAnimationFrame(() => {
      if (!this.gameOver) return;
      this._purgeBattlefieldEffects();
      this._fastCullDeadUnits();
      for (const h of this.hqs) {
        if (h.dead) this.battleStats.recordHq(h.team);
      }
      this.ui?.updateEndStats(
        this.battleStats.buildReport({
          playerName: this.playerFaction.name,
          enemyName: this.enemyFaction.name,
          tutorial: this.tutorial,
        })
      );
      sounds.play(victory ? 'victory' : 'defeat');
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

  /** Drop dead meshes from the scene immediately; dispose GPU assets in idle slices. */
  /** No live units on the map — clear corpses and resolve win/loss without sim churn. */
  _purgeCorpsesWhenFieldEmpty() {
    if (this._aliveUnits.length > 0 || this.gameOver || this._emptyFieldHandled) return;
    this._emptyFieldHandled = true;

    const meshes = [];
    for (const u of this.units) {
      if (!u.dead) continue;
      if (u.wreckFire) {
        removeWreckEffect(u.wreckFire);
        u.wreckFire = null;
      }
      u.wreckTimeLeft = 0;
      u.corpseTimeLeft = 0;
      removeCoverMarker(u);
      removeRetreatMarker(u);
      if (u.mesh?.parent) {
        this.scene.remove(u.mesh);
        meshes.push(u.mesh);
        u.mesh = null;
      }
    }
    if (meshes.length) queueMeshDispose(...meshes);
    if (this.units.some((u) => u.dead)) {
      this.units = this.units.filter((u) => !u.dead);
      this._rebuildUnitCaches();
    }
  }

  _fastCullDeadUnits() {
    if (this._teardownPending) return;
    this._teardownPending = true;

    const meshes = [];
    for (const u of this.units) {
      if (!u.dead) continue;
      if (u.wreckFire) {
        removeWreckEffect(u.wreckFire);
        u.wreckFire = null;
      }
      if (u.mesh?.parent) {
        this.scene.remove(u.mesh);
        meshes.push(u.mesh);
        u.mesh = null;
      }
    }
    this.units = this.units.filter((u) => !u.dead);
    this._rebuildUnitCaches();
    this._syncUnitRoster();
    this._teardownPending = false;
    if (meshes.length) queueMeshDispose(...meshes);
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
    this.ui?.updateEndStats(
      this.battleStats.buildReport({
        playerName: this.playerFaction.name,
        enemyName: this.enemyFaction.name,
        tutorial: this.tutorial,
      })
    );
  }

  recordBattleLosses() {
    for (const u of this.units) {
      if (u.dead) this.battleStats.recordUnit(u);
    }
    for (const h of this.hqs) {
      if (h.dead) this.battleStats.recordHq(h.team);
    }
  }

  onCombatFire({ attacker, target, def, dist, killed, targetIsHQ, targetIsScenery, groundImpact, from, to, coaxFire }) {
    const pos = { x: from.x, z: from.z };

    if (coaxFire) {
      sounds.playWeapon('mg', pos, { rate: 1.04 + Math.random() * 0.08, volume: 0.82 });
      if (killed && target?.def && isInfantryUnitType(target.def.type)) {
        sounds.playInfantryDeath({ x: to.x, z: to.z });
      } else if (killed) {
        sounds.playImpact('bullet', { x: to.x, z: to.z }, 0.03 + dist / 320);
      }
      return;
    }

    if (def.type === 'infantry') {
      attacker._mgVolley = (attacker._mgVolley ?? 0) + 1;
      const useMg = def.usesMG && attacker._mgVolley % 2 !== 0;
      sounds.playWeapon(useMg ? 'mg' : 'rifle', pos, { rate: useMg ? 1.02 : 0.98 + Math.random() * 0.06 });
    } else if (def.type === 'sniper') {
      sounds.playWeapon('rifle', pos, { rate: 0.92 + Math.random() * 0.04, volume: 0.9 });
    } else if (def.type === 'machineGun' || def.type === 'armoredCar') {
      sounds.playWeapon('mg', pos, { rate: def.type === 'armoredCar' ? 1.05 + Math.random() * 0.06 : 0.98 + Math.random() * 0.08 });
    } else if (def.type === 'mortar') {
      sounds.playWeapon('howitzer_105', pos, { rate: 0.72 + Math.random() * 0.1, volume: 0.75 });
    } else {
      sounds.playWeapon(weaponProfileForDef(def), pos, {
        rate:
          isTankType(def.type) || def.type === 'antiTankGun'
            ? 0.96 + Math.random() * 0.08
            : 0.94 + Math.random() * 0.1,
      });
    }

    if (def.type === 'artillery' || def.type === 'mortar') {
      const delay = Math.min(1.1, 0.25 + dist / (def.type === 'mortar' ? 90 : 100));
      sounds.playImpact('shell', { x: to.x, z: to.z }, delay);
    } else if (isTankType(def.type) || def.type === 'antiTankGun') {
      sounds.playImpact('tank_round', { x: to.x, z: to.z }, 0.08 + dist / 180);
    } else if (killed) {
      if (target?.def && isInfantryUnitType(target.def.type)) {
        sounds.playInfantryDeath({ x: to.x, z: to.z });
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
      } else if (def.type === 'artillery') {
        spawnShellExplosion(this.scene, to, 'heavy');
      } else if (def.type === 'mortar' || def.type === 'antiTankGun' || isTankType(def.type)) {
        spawnShellExplosion(this.scene, to, 'medium');
      } else {
        spawnExplosion(this.scene, to);
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
    const simActive = this.running && !this.gameOver;
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
        this.matchTime += dt;
        tickUnitCooldowns(this._aliveUnits, dt);
        this.tickEconomy(dt);
        if (!this.towerDefense) {
          this.updateCapturePoints(dt);
          this.production.update(dt, this.units);
        } else {
          updateTowerDefenseMode(this, dt);
        }

        updateMovement(this._aliveUnits, dt, this.mapDef, this.hqs, {
          getWireSlowMult: this.defenses
            ? (x, z) => this.defenses.getWireSlowAt(x, z)
            : null,
        });

        const stagingTeams = this._getDeployZoneTeamsAt();
        if (stagingTeams.length) {
          containTeamsToDeployZone(this._aliveUnits, this.hqs, this.mapDef, stagingTeams);
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
                !this.tutorial && !this.towerDefense && this.matchTime < BATTLE_OPENING_TIME,
              enemyCeasefire: this.clearance && this.matchTime < CLEARANCE_CEASEFIRE_TIME,
              paceDamageMult: this.campaign ? CAMPAIGN_BALANCE.damageMult : 1,
              defenseTargets: this.defenses?.getAttackTargets() ?? [],
            }
          );
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
          if (!this._emptyFieldHandled) this._purgeCorpsesWhenFieldEmpty();
          this._victoryCheckAccum += dt;
          if (this._victoryCheckAccum >= 0.1) {
            this._victoryCheckAccum = 0;
            this.checkVictory();
          }
        } else {
          this._victoryCheckAccum += dt;
          if (
            this._victoryCheckAccum >= 0.12 ||
            this._playerAlive.length === 0 ||
            this._enemyAlive.length === 0
          ) {
            this._victoryCheckAccum = 0;
            this.checkVictory();
          }
        }
        if (this.gameOver) {
          this.updateCamera(dt);
          this._renderFrame();
          return;
        }

        if (fieldHasUnits || hasCorpses) {
          updateWreckEffects(dt, this.camera);
          updateHqBurnEffects(dt, this.camera, this.hqs);
          this.rangeRings.updateForUnits(this._aliveUnits);
          this.targetIndicators.update(playerSelected, this._playerAlive);
          updateCombatEffects(dt);
          this.fireSupport.update(dt);
          updateFireSupportEffects(dt, this.scene);
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
          } else if (!this.tutorial) {
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
              openingCeasefire: this.matchTime < BATTLE_OPENING_TIME,
              difficulty: this.campaign
                ? getCampaignDifficulty(this.difficulty)
                : this.difficulty,
            });
          }

          this._deployUiAccum += dt;
          if (this._deployUiAccum >= 0.12) {
            this._deployUiAccum = 0;
            const deployPhase = this._getDeployPhase();
            this.ui?.updateDeployCountdown(deployPhase);
            this.ui?.updateBattleOpening(
              deployPhase ? deployPhase.secondsLeft : 0
            );
          }

          this._accelerateCleanupIfPlayerWiped();
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

    if (simActive) {
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

    let deadMeshes = 0;
    let cachesDirty = false;
    const maxDeadMeshes = this.campaign ? 20 : 28;
    const unitsBefore = this.units.length;

    for (const u of this.units) {
      if (!u.dead) continue;
      if (!u._lossRecorded) {
        if (this.towerDefense && u.team === ENEMY_TEAM) rewardTowerDefenseKill(this, u);
        this.battleStats.recordUnit(u);
      }
      if (!u.mesh?.parent) continue;

      deadMeshes++;
      if (deadMeshes > maxDeadMeshes) {
        if (u.wreckFire) removeWreckEffect(u.wreckFire);
        const mesh = u.mesh;
        this.scene.remove(mesh);
        u.mesh = null;
        u.wreckFire = null;
        queueMeshDispose(mesh);
        cachesDirty = true;
        continue;
      }

      if (isTankType(u.def.type) && u.wreckTimeLeft > 0) {
        u.wreckTimeLeft -= dt;
        if (!u.wreckFire) {
          u.wreckFire = spawnTankWreckFire(this.scene, u.position, u.mesh);
        }
        u.mesh.position.y -= dt * 0.012;
        if (u.wreckTimeLeft <= 0) {
          if (u.wreckFire) removeWreckEffect(u.wreckFire);
          u.wreckFire = null;
          const mesh = u.mesh;
          this.scene.remove(mesh);
          u.mesh = null;
          queueMeshDispose(mesh);
          cachesDirty = true;
        }
        continue;
      }

      if ((u.corpseTimeLeft ?? 0) > 0) {
        u.corpseTimeLeft -= dt;
        if (u.corpseTimeLeft <= 0) {
          const mesh = u.mesh;
          this.scene.remove(mesh);
          u.mesh = null;
          queueMeshDispose(mesh);
          cachesDirty = true;
        }
        continue;
      }

      if (!u.mesh.userData?.deathVisualApplied) {
        applyUnitDeathVisual(u);
        continue;
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