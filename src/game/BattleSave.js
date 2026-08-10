import { FACTIONS } from '../data/factions.js';
import { MAPS } from '../data/maps.js';
import { GAME_MODES } from '../data/gameModes.js';
import { AIRBORNE_CLOUD_COVER_SECONDS } from '../data/fireSupport.js';
import { BASE_BUILDING_TYPES } from '../data/baseBuildings.js';
import { DEFENSE_TYPES, isTdHqDefenseStyle } from '../data/towerDefense.js';
import { getTdFrontlineDef } from './TowerDefenseMode.js';
import { repositionFrontlineVisual } from '../world/Frontline.js';
import { spawnUnitAt } from './Spawner.js';
import { setUnitNextId } from '../units/Unit.js';
import {
  setBaseBuildingNextId,
  peekBaseBuildingNextId,
} from './BaseBuildingManager.js';
import {
  setEngineerSiteNextId,
  peekEngineerSiteNextId,
} from './EngineerSandbags.js';
import { exportAIState, importAIState } from './AI.js';
import { CLEARANCE_ATTACK_PLANS } from './ClearanceMode.js';
import { restoreTankRiderLinks } from './TankRiders.js';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { restoreTerrainDamage, serializeTerrainDamage } from '../world/TerrainDamage.js';
import { createSandbagEmplacementGroup } from '../world/SandbagEmplacement.js';
import {
  createBaseBuildingMesh,
  createCampaignBunkerMesh,
  setBaseBuildingHpVisual,
} from '../visual/BaseBuildingMeshes.js';
import {
  createBaseBuildingConstructionVisual,
  updateBaseBuildingConstructionVisual,
} from '../visual/BaseBuildingConstruction.js';
import {
  createDefenseMesh,
  setDefenseHpVisual,
  setDefenseAmmoVisual,
  setDefenseSelected,
} from '../visual/DefenseMeshes.js';
import { wrapBaseBuildingTarget } from './BaseBuildingTarget.js';
import { wrapDefenseTarget } from './DefenseTarget.js';
import { createSmokeShellTarget } from './Targeting.js';
import { getLastStandTactic } from '../data/lastStandTactics.js';
import { syncUnitFieldIcon } from '../visual/UnitFieldIcons.js';
import { syncRankMarkers } from './EliteBehavior.js';
import {
  applyUnitDeathVisual,
  applyVehicleWreckCrushVisual,
  updateSquadCasualtyVisual,
} from '../units/UnitMeshes.js';
import { FIELD_BUILD_TYPES } from './EngineerSandbags.js';
import {
  applyTrenchVisual,
  peekTrenchNextId,
  setTrenchNextId,
} from './InfantryTrench.js';
import {
  peekMedicTentNextId,
  setMedicTentNextId,
} from './MedicFieldHospital.js';
import { alignTrenchGroupToTerrain, createTrenchGroup } from '../world/TrenchMesh.js';
import { createFieldTentMesh } from '../visual/FieldTentMesh.js';
import * as THREE from 'three';

export const SAVE_VERSION = 1;
export const STORAGE_KEY = 'ww2-rts-battle-saves';
const MAX_SAVES = 12;

function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getUnitTypeKey(faction, unit) {
  if (!faction?.units || !unit?.def) return unit?.def?.type ?? 'infantry';
  for (const [key, def] of Object.entries(faction.units)) {
    if (def === unit.def) return key;
  }
  for (const [key, def] of Object.entries(faction.units)) {
    if (def.type === unit.def.type && def.name === unit.def.name) return key;
  }
  return unit.def.type;
}

function serializeTargetRef(target) {
  if (!target) return null;
  if (target.isSmokeShell) {
    return {
      kind: 'smoke',
      x: target.position?.x ?? target.x,
      z: target.position?.z ?? target.z,
    };
  }
  if (target.isGround) {
    return {
      kind: 'ground',
      x: target.position?.x ?? target.x,
      z: target.position?.z ?? target.z,
    };
  }
  if (target.isDefense && target.entry) {
    return { kind: 'defense', id: target.entry.id };
  }
  if (target.isBaseBuilding && target.entry) {
    return { kind: 'structure', id: target.entry.id };
  }
  if (target.isScenery && target.entry) {
    return {
      kind: 'scenery',
      mapKey: target.entry.mapKey ?? null,
      x: target.entry.x,
      z: target.entry.z,
      sceneryKind: target.entry.kind,
    };
  }
  if (target.def !== undefined && target.id != null) {
    return { kind: 'unit', id: target.id };
  }
  if (target.team && target.hp !== undefined && !target.def && !target.isScenery) {
    return { kind: 'hq', team: target.team };
  }
  return null;
}

function resolveTargetRef(game, ref, unitById) {
  if (!ref) return null;
  switch (ref.kind) {
    case 'ground':
      return {
        isGround: true,
        dead: false,
        team: null,
        position: { x: ref.x, z: ref.z, y: 0 },
        mesh: { position: { x: ref.x, z: ref.z, y: 0 } },
        takeDamage() {},
      };
    case 'smoke':
      return createSmokeShellTarget(ref.x, ref.z);
    case 'unit':
      return unitById.get(ref.id) ?? null;
    case 'hq':
      return game.hqs.find((h) => h.team === ref.team && !h.dead) ?? null;
    case 'defense':
      return game.defenses?.entries.find((e) => e.id === ref.id && !e.destroyed) ?? null;
    case 'structure': {
      const base = game.baseBuildings?.getEntryById(ref.id);
      if (base) return wrapBaseBuildingTarget(base, game.baseBuildings);
      const field = game.engineerSandbags?.getEntryById(ref.id);
      if (field) return wrapBaseBuildingTarget(field, game.engineerSandbags);
      return null;
    }
    case 'scenery': {
      if (ref.mapKey) {
        const keyed = game.scenery?.objects.find(
          (o) => !o.destroyed && o.mapKey === ref.mapKey
        );
        if (keyed?._attackTarget && !keyed._attackTarget.dead) return keyed._attackTarget;
      }
      const tol = 0.6;
      const obj = game.scenery?.objects.find(
        (o) =>
          !o.destroyed &&
          o.kind === ref.sceneryKind &&
          Math.abs(o.x - ref.x) < tol &&
          Math.abs(o.z - ref.z) < tol
      );
      return obj?._attackTarget && !obj._attackTarget.dead ? obj._attackTarget : null;
    }
    default:
      return null;
  }
}

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { saves: [] };
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.saves)) return parsed;
    if (Array.isArray(parsed)) return { saves: parsed };
    return { saves: [] };
  } catch {
    return { saves: [] };
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch (err) {
    console.error('Failed to write battle saves:', err);
    return false;
  }
}

export function listBattleSaves() {
  return readStore()
    .saves.filter((s) => s?.id && s?.session?.factionId && s?.session?.mapId)
    .map((s) => ({
      id: s.id,
      savedAt: s.savedAt,
      label: s.label,
      factionId: s.session.factionId,
      mapId: s.session.mapId,
      gameMode: s.session.gameMode,
      matchTime: s.matchTime ?? 0,
    }))
    .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
}

export function deleteBattleSave(id) {
  const store = readStore();
  store.saves = store.saves.filter((s) => s.id !== id);
  writeStore(store);
}

export function loadBattleSaveData(id) {
  const entry = readStore().saves.find((s) => s.id === id);
  if (!entry || entry.version !== SAVE_VERSION) return null;
  return entry;
}

function buildSaveLabel(game) {
  const faction = game.playerFaction?.name ?? 'Unknown';
  const map = game.mapDef?.name ?? 'Unknown';
  const mode = GAME_MODES[game.gameMode]?.name ?? game.gameMode;
  return `${faction} — ${map} — ${mode} (${formatElapsed(game.matchTime)})`;
}

export function captureBattleSave(game, { id = null } = {}) {
  const unitSnapshots = [];
  let maxUnitId = 0;
  for (const u of game.units) {
    // Dead units are still battlefield state: their meshes may be visible as
    // corpses or wrecks and wrecks can provide cover. Only omit debris that has
    // already been disposed by the runtime cleanup budget.
    if (u.dead && !u.mesh?.parent) continue;
    maxUnitId = Math.max(maxUnitId, u.id);
    const faction = u.team === 'player' ? game.playerFaction : game.enemyFaction;
    unitSnapshots.push({
      id: u.id,
      unitType: getUnitTypeKey(faction, u),
      team: u.team,
      x: u.position.x,
      z: u.position.z,
      y: u.position.y,
      yaw: u.mesh?.rotation?.y ?? 0,
      hp: u.hp,
      maxHp: u.maxHp,
      dead: !!u.dead,
      deathCause: u._deathCause ?? null,
      deathAt: u._deathAt ?? null,
      commanderRearAnchor: u._commanderRearAnchor
        ? { ...u._commanderRearAnchor }
        : null,
      commanderDeathHandled: !!u._commanderDeathHandled,
      preWreckYaw: u._preWreckYaw ?? null,
      corpseTimeLeft: u.corpseTimeLeft ?? 0,
      wreckTimeLeft: u.wreckTimeLeft ?? 0,
      recoverableWreck: !!u._recoverableWreck,
      wreckRepairProgress: u._wreckRepairProgress ?? 0,
      wreckImpactCount: u._wreckImpactCount ?? 0,
      wreckRunOverCount: u._wreckRunOverCount ?? 0,
      wreckRunOverDamage: u._wreckRunOverDamage ?? 0,
      wreckReducedToRubble: !!u._wreckReducedToRubble,
      wreckCrushed: !!u._wreckCrushed,
      mobilityDamaged: !!u._mobilityDamaged,
      mobilityDamageKind: u._mobilityDamageKind ?? null,
      mobilityRepairProgress: u._mobilityRepairProgress ?? 0,
      crewBailedOut: !!u._crewBailedOut,
      crewless: !!u._crewless,
      replacementCrewUnitId: u._replacementCrewUnitId ?? null,
      replacementCrewVehicleId: u._replacementCrewVehicleId ?? null,
      embeddedCrewCount: u._embeddedCrewCount ?? 0,
      lossRecorded: !!u._lossRecorded,
      selected: u.selected,
      veteran: u.veteran,
      elite: u.elite,
      killCount: u.killCount ?? 0,
      retreating: u.retreating,
      // A crew partway through its bailout is committed to surrender. Loading
      // resumes it safely on the ground with the surrender state applied.
      surrendered: u.surrendered || !!u._surrenderAfterBailout,
      _garrisonBunkerId: u._garrisonBunkerId ?? null,
      _garrisonBunkerMapKey:
        game.scenery?.objects.find((obj) => obj.id === u._garrisonBunkerId)?.mapKey ?? null,
      _mountedOnTankId: u._mountedOnTankId ?? null,
      _pendingMountTankId: u._pendingMountTankId ?? null,
      _pendingReplacementCrew: !!u._pendingReplacementCrew,
      _tankRiderIds: u._tankRiderIds?.length ? [...u._tankRiderIds] : null,
      _sandbagSite: u._sandbagSite ?? null,
      _trenchId: u._trenchId ?? null,
      _trenchDigSite: u._trenchDigSite ?? null,
      _medicTentSite: u._medicTentSite ?? null,
      attackCooldown: u.attackCooldown ?? 0,
      mgCooldown: u.mgCooldown ?? 0,
      grenadeCooldown: u.grenadeCooldown ?? 0,
      smokeShellCooldown: u.smokeShellCooldown ?? 0,
      binocularActive: u._binocularActive ?? 0,
      binocularCooldown: u._binocularCooldown ?? 0,
      moveTarget: u.moveTarget ? { x: u.moveTarget.x, z: u.moveTarget.z } : null,
      _movePath: u._movePath?.map((p) => ({ x: p.x, z: p.z })) ?? null,
      _userMoveOrder: !!u._userMoveOrder,
      _reverseMoveOrder: !!u._reverseMoveOrder,
      _chasingAttack: !!u._chasingAttack,
      engagementStance: u.engagementStance === 'pursue' ? 'pursue' : 'hold',
      autoFire: !!u.autoFire,
      stancePursuitOrder: !!u._stancePursuitOrder,
      stanceBoundAttackOrder: !!u._stanceBoundAttackOrder,
      manualFireMission: !!u._manualFireMission,
      attackOrderRef: serializeTargetRef(u.attackOrder),
      targetRef: serializeTargetRef(u.target),
      defensiveHold: u.defensiveHold ? { ...u.defensiveHold } : null,
      lastStandRole: u.lastStandRole ?? null,
      lastStandEchelon: u.lastStandEchelon ?? null,
      lastStandStance: u.lastStandStance ?? null,
      clearanceProbe: u._clearanceProbe ? { ...u._clearanceProbe } : null,
      clearanceAttackRole: u.clearanceAttackRole ?? null,
    });
  }

  const sessionOptions = { ...(game.lastSession?.options ?? {}) };
  delete sessionOptions.restoreSnapshot;
  if (game.clearance) {
    sessionOptions.clearanceRole = game.clearanceRole ?? 'attack';
    sessionOptions.clearanceTimeLimitEnabled = game.clearanceTimeLimitEnabled !== false;
    if (game.clearanceAttackPlan?.id) {
      sessionOptions.clearanceAttackPlanId = game.clearanceAttackPlan.id;
    }
  }

  const snapshot = {
    version: SAVE_VERSION,
    id: id ?? `save-${Date.now()}`,
    savedAt: new Date().toISOString(),
    label: buildSaveLabel(game),
    session: {
      factionId: game.lastSession?.factionId ?? game.playerFaction?.id,
      mapId: game.lastSession?.mapId ?? game.mapDef?.id,
      gameMode: game.gameMode,
      options: sessionOptions,
    },
    matchTime: game.matchTime,
    clearanceRole: game.clearanceRole ?? null,
    clearanceAttackPlanId: game.clearanceAttackPlan?.id ?? null,
    clearanceOperational: game.clearanceOperational
      ? {
          ...game.clearanceOperational,
          anchor: game.clearanceOperational.anchor
            ? { ...game.clearanceOperational.anchor }
            : null,
          lastCenter: game.clearanceOperational.lastCenter
            ? { ...game.clearanceOperational.lastCenter }
            : null,
        }
      : null,
    clearanceReinforcements: game.clearanceReinforcements
      ? { ...game.clearanceReinforcements }
      : null,
    paused: game.paused,
    autoBuildMode: !!game.autoBuildMode,
    resources: { ...game.resources },
    camera: {
      targetX: game.cameraTarget.x,
      targetZ: game.cameraTarget.z,
      zoom: game.zoom,
      yaw: game.cameraYaw,
    },
    unitNextId: maxUnitId + 1,
    ai: exportAIState(),
    production: {
      queues: {
        player: game.production.queues.player.map((j) => ({
          unitType: j.unitType,
          remaining: j.remaining,
        })),
        enemy: game.production.queues.enemy.map((j) => ({
          unitType: j.unitType,
          remaining: j.remaining,
        })),
      },
      spawnAngle: { ...game.production._spawnAngle },
    },
    fireSupport: {
      cooldowns: { ...game.fireSupport.cooldowns },
      airborneUsesLeft: game.fireSupport.airborneUsesLeft,
      airborneCloudCoverRemaining: game.fireSupport.airborneCloudCoverRemaining,
    },
    enemyFireSupport: {
      cooldowns: { ...game.enemyFireSupport?.cooldowns },
      airborneUsesLeft: game.enemyFireSupport?.airborneUsesLeft,
      airborneCloudCoverRemaining: game.enemyFireSupport?.airborneCloudCoverRemaining,
    },
    generalOrders: {
      cooldowns: { ...game.generalOrders.cooldowns },
      active: game.generalOrders.active
        ? {
            type: game.generalOrders.active.type,
            remaining: game.generalOrders.active.remaining,
            forced: !!game.generalOrders.active.forced,
          }
        : null,
    },
    enemyGeneralOrders: {
      cooldowns: { ...game.enemyGeneralOrders?.cooldowns },
      active: game.enemyGeneralOrders?.active
          ? {
            type: game.enemyGeneralOrders.active.type,
            remaining: game.enemyGeneralOrders.active.remaining,
            forced: !!game.enemyGeneralOrders.active.forced,
          }
        : null,
    },
    smokeScreens: game.smokeScreens?.serialize?.() ?? [],
    battleStats: {
      losses: game.battleStats.losses,
      prisonersTaken: game.battleStats.prisonersTaken,
      defenseLosses: game.battleStats.defenseLosses,
      hqLost: { ...game.battleStats.hqLost },
    },
    hqs: game.hqs.map((h) => ({
      team: h.team,
      hp: h.hp,
      maxHp: h.maxHp,
      dead: h.dead,
      selected: h.selected,
    })),
    capturePoints: game.capturePoints.map((cp) => ({
      id: cp.id,
      owner: cp.owner,
      progress: cp.progress,
      isFrontline: cp.isFrontline,
    })),
    units: unitSnapshots,
    assault: game.assault ? { ...game.assault, frontlineCpId: game.assault.frontlineCp?.id } : null,
    towerDefense:
      game.towerDefense && typeof game.towerDefense === 'object'
        ? { ...game.towerDefense }
        : null,
    lastStand: game.lastStand
      ? {
          phase: game.lastStand.phase,
          deployMode: game.lastStand.deployMode,
          supplies: { ...game.lastStand.supplies },
          pendingType: game.lastStand.pendingType,
          enemyDeployTimer: game.lastStand.enemyDeployTimer,
          enemyTacticId: game.lastStand.enemyTactic?.id ?? game.lastStand.enemyTacticId ?? null,
          flankSide: game.lastStand.flankSide ?? 1,
          briefingShown: game.lastStand.briefingShown ?? game.lastStand.phase !== 'deploy',
          enemyOperational: game.lastStand.enemyOperational
            ? {
                ...game.lastStand.enemyOperational,
                anchor: game.lastStand.enemyOperational.anchor
                  ? { ...game.lastStand.enemyOperational.anchor }
                  : null,
                lastCenter: game.lastStand.enemyOperational.lastCenter
                  ? { ...game.lastStand.enemyOperational.lastCenter }
                  : null,
              }
            : null,
        }
      : null,
    defenses: game.defenses
      ? {
          barrageCooldown: game.defenses.barrageCooldown,
          selectedId: game.defenses.selectedId,
          entries: game.defenses.entries
            .filter((e) => !e.destroyed)
            .map((e) => ({
              id: e.id,
              typeId: e.typeId,
              x: e.x,
              z: e.z,
              hp: e.hp,
              maxHp: e.maxHp,
              ammo: e.ammo,
              maxAmmo: e.maxAmmo,
            })),
        }
      : null,
    baseBuildings: game.baseBuildings?.active
      ? {
          pendingType: game.baseBuildings.pendingType,
          enemyBuildTimer: game.baseBuildings._enemyBuildTimer,
          nextId: peekBaseBuildingNextId(),
          sites: game.baseBuildings.sites.map((s) => ({
            id: s.id,
            typeId: s.typeId,
            team: s.team,
            x: s.x,
            z: s.z,
            y: s.y,
            progress: s.progress,
            rotationY: s.rotationY,
          })),
          entries: game.baseBuildings.entries.map((e) => ({
            id: e.id,
            typeId: e.typeId,
            team: e.team,
            x: e.x,
            z: e.z,
            y: e.y,
            hp: e.hp,
            maxHp: e.maxHp,
            destroyed: !!e.destroyed,
            garrison: e.destroyed ? [] : [...(e.garrison ?? [])],
            engineerBuilt: !!e.engineerBuilt,
            rotationY: e.mesh?.rotation?.y ?? 0,
          })),
        }
      : null,
    engineerSandbags: {
      pendingType: game.engineerSandbags?.pendingType ?? null,
      nextSiteId: peekEngineerSiteNextId(),
      builtPositions: (game.engineerSandbags?._builtPositions ?? []).map((p) => ({ ...p })),
      sites: (game.engineerSandbags?.sites ?? []).map((s) => ({
        id: s.id,
        buildType: s.buildType,
        team: s.team,
        x: s.x,
        z: s.z,
        y: s.y,
        progress: s.progress,
        engineerId: s.engineerId,
        rotationY: s.rotationY,
        aiDefensiveFieldwork: !!s._aiDefensiveFieldwork,
        aiFieldworkMode: s._aiFieldworkMode ?? null,
      })),
      fieldBunkers: (game.engineerSandbags?.fieldBunkers ?? [])
        .filter((e) => !e.destroyed)
        .map((e) => ({
          id: e.id,
          team: e.team,
          x: e.x,
          z: e.z,
          y: e.y,
          hp: e.hp,
          maxHp: e.maxHp,
          garrison: [...(e.garrison ?? [])],
          rotationY: e.mesh?.rotation?.y ?? 0,
          aiDefensiveFieldwork: !!e._aiDefensiveFieldwork,
          aiFieldworkMode: e._aiFieldworkMode ?? null,
        })),
      mines: (game.engineerSandbags?.mines ?? []).map((mine) => ({
        id: mine.id,
        team: mine.team,
        x: mine.x,
        z: mine.z,
        y: mine.y,
        damage: mine.damage,
        triggerRadius: mine.triggerRadius,
        rotationY: mine.mesh?.rotation?.y ?? 0,
        aiDefensiveFieldwork: !!mine._aiDefensiveFieldwork,
        aiFieldworkMode: mine._aiFieldworkMode ?? null,
      })),
      engineerScenery: [],
    },
    infantryTrenches: game.infantryTrenches
      ? {
          pending: !!game.infantryTrenches.pending,
          nextId: peekTrenchNextId(),
          sites: game.infantryTrenches.sites.map((s) => ({
            id: s.id,
            x: s.x,
            z: s.z,
            y: s.y,
            team: s.team,
            diggerId: s.diggerId,
            progress: s.progress,
            rotationY: s.rotationY,
            aiDefensiveTrench: !!s._aiDefensiveTrench,
            aiTrenchMode: s._aiTrenchMode ?? null,
          })),
          trenches: game.infantryTrenches.trenches
            .filter((t) => !t.destroyed)
            .map((t) => ({
              id: t.id,
              team: t.team,
              x: t.x,
              z: t.z,
              y: t.y,
              garrison: [...(t.garrison ?? [])],
              rotationY: t.mesh?.rotation?.y ?? 0,
              aiDefensiveTrench: !!t._aiDefensiveTrench,
              aiTrenchMode: t._aiTrenchMode ?? null,
            })),
        }
      : null,
    medicFieldHospitals: game.medicFieldHospitals
      ? {
          pending: !!game.medicFieldHospitals.pending,
          nextId: peekMedicTentNextId(),
          sites: game.medicFieldHospitals.sites.map((s) => ({
            id: s.id,
            x: s.x,
            z: s.z,
            y: s.y,
            team: s.team,
            medicId: s.medicId,
            progress: s.progress,
            aiDefensiveHospital: !!s._aiDefensiveHospital,
            aiHospitalMode: s._aiHospitalMode ?? null,
          })),
          tents: game.medicFieldHospitals.tents
            .filter((t) => !t.destroyed)
            .map((t) => ({
              id: t.id,
              team: t.team,
              x: t.x,
              z: t.z,
              y: t.y,
              hp: t.hp,
              maxHp: t.maxHp,
              healRange: t.healRange,
              healPerSec: t.healPerSec,
              rotationY: t.mesh?.rotation?.y ?? 0,
              aiDefensiveHospital: !!t._aiDefensiveHospital,
              aiHospitalMode: t._aiHospitalMode ?? null,
            })),
        }
      : null,
    mapScenery: [],
    terrainDamage: serializeTerrainDamage(),
    sceneryDestroyed: [],
    selectedHqTeam: game.selectedHq?.team ?? null,
    selectedBaseBuildingId: game.selectedBaseBuilding?.id ?? null,
  };

  if (game.assault?.frontlineCp) {
    snapshot.assault.frontlineCpId = game.assault.frontlineCp.id;
    delete snapshot.assault.frontlineCp;
  }

  if (game.towerDefense) {
    delete snapshot.towerDefense.assaultProfile;
    delete snapshot.towerDefense.assaultSectors;
    delete snapshot.towerDefense.assaultBrief;
  }

  if (game.scenery) {
    snapshot.mapScenery = game.scenery.objects
      .filter((obj) => obj.source === 'map')
      .map((obj) => ({
        mapKey: obj.mapKey,
        x: obj.x,
        z: obj.z,
        y: obj.group?.position?.y ?? 0,
        kind: obj.kind,
        hp: obj.hp,
        maxHp: obj.maxHp,
        destroyed: !!obj.destroyed,
        coverType: obj.coverType,
        coverRadius: obj.coverRadius,
        garrison: obj.garrison ? [...obj.garrison] : null,
        garrisonTeam: obj.garrisonTeam ?? null,
        rotationY: obj.group?.rotation?.y ?? 0,
        scale: obj.group?.scale?.x ?? 1,
      }));
    snapshot.sceneryDestroyed = snapshot.mapScenery
      .filter((obj) => obj.destroyed)
      .map(({ x, z, kind, mapKey }) => ({ x, z, sceneryKind: kind, mapKey }));
  }

  for (const pos of game.engineerSandbags?._builtPositions ?? []) {
    if (pos.buildType !== 'sandbags') continue;
    const preset = FIELD_BUILD_TYPES.sandbags;
    snapshot.engineerSandbags.engineerScenery.push({
      x: pos.x,
      z: pos.z,
      sceneryKind: 'bunker',
      coverType: preset.coverType,
      coverRadius: preset.coverRadius,
      hp: preset.hp,
      buildType: pos.buildType,
      team: pos.team,
      rotationY: pos.rotationY,
    });
  }

  return snapshot;
}

export function writeBattleSave(snapshot, existingId = null) {
  const store = readStore();
  const id = existingId ?? snapshot.id;
  const entry = { ...snapshot, id, savedAt: new Date().toISOString() };
  const idx = store.saves.findIndex((s) => s.id === id);
  if (idx >= 0) store.saves[idx] = entry;
  else store.saves.unshift(entry);
  store.saves.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  if (store.saves.length > MAX_SAVES) {
    store.saves = store.saves.slice(0, MAX_SAVES);
  }
  if (!writeStore(store)) {
    throw new Error('localStorage write failed');
  }
  return id;
}

function restoreEngineerScenery(game, placements) {
  if (!placements?.length || !game.scenery) return;
  for (const p of placements) {
    const factionId =
      p.team === 'player' ? game.playerFaction?.id : game.enemyFaction?.id;
    const y = sampleTerrainHeight(p.x, p.z, game.mapDef);
    const group = createSandbagEmplacementGroup({
      factionId,
      seed: p.x * 0.17 + p.z * 0.23,
    });
    group.position.set(p.x, y, p.z);
    group.rotation.y = p.rotationY ?? 0;
    game.scenery.register(group, {
      x: p.x,
      z: p.z,
      kind: p.sceneryKind ?? 'bunker',
      coverType: p.coverType,
      coverRadius: p.coverRadius,
      hp: p.hp,
    });
  }
}

function restoreMapScenery(game, sceneryStates) {
  if (!sceneryStates?.length || !game.scenery) return;
  for (const state of sceneryStates) {
    const obj = game.scenery.objects.find(
      (entry) =>
        !entry.destroyed &&
        ((state.mapKey && entry.mapKey === state.mapKey) ||
          (!state.mapKey &&
            entry.kind === state.kind &&
            Math.abs(entry.x - state.x) < 1.2 &&
            Math.abs(entry.z - state.z) < 1.2))
    );
    if (!obj) continue;

    obj.hp = state.hp ?? obj.maxHp;
    obj.maxHp = state.maxHp ?? obj.maxHp;
    obj.x = state.x ?? obj.x;
    obj.z = state.z ?? obj.z;
    obj.coverType = state.coverType ?? obj.coverType;
    obj.coverRadius = state.coverRadius ?? obj.coverRadius;
    obj.garrison = state.garrison ? [...state.garrison] : obj.garrison;
    obj.garrisonTeam = state.garrisonTeam ?? null;
    if (Number.isFinite(state.y)) obj.group.position.y = state.y;
    if (Number.isFinite(state.x)) obj.group.position.x = state.x;
    if (Number.isFinite(state.z)) obj.group.position.z = state.z;
    if (Number.isFinite(state.rotationY)) obj.group.rotation.y = state.rotationY;
    if (Number.isFinite(state.scale)) obj.group.scale.setScalar(state.scale);

    if (state.destroyed) {
      game.scenery.destroyObject(obj, { effects: false, instant: true });
    } else {
      game.scenery._updateDamageVisual(obj);
    }
  }
}

function destroySavedScenery(game, destroyedList) {
  if (!destroyedList?.length || !game.scenery) return;
  for (const ref of destroyedList) {
    const tol = 1.2;
    const obj = game.scenery.objects.find(
      (o) =>
        !o.destroyed &&
        o.kind === ref.sceneryKind &&
        Math.abs(o.x - ref.x) < tol &&
        Math.abs(o.z - ref.z) < tol
    );
    if (obj) game.scenery.destroyObject(obj, { effects: false, instant: true });
  }
}

function restoreBaseBuildingSite(manager, siteData) {
  const def = BASE_BUILDING_TYPES[siteData.typeId];
  if (!def) return;
  const site = {
    id: siteData.id,
    typeId: siteData.typeId,
    def,
    team: siteData.team,
    x: siteData.x,
    z: siteData.z,
    y: siteData.y,
    progress: siteData.progress ?? 0,
    rotationY: siteData.rotationY ?? manager._facingYaw(siteData.team, siteData.x, siteData.z),
    marker: null,
  };
  const visual = createBaseBuildingConstructionVisual({ def, team: site.team });
  visual.position.set(site.x, site.y, site.z);
  visual.rotation.y = site.rotationY;
  manager.game.scene.add(visual);
  site.marker = visual;
  updateBaseBuildingConstructionVisual(visual, site.progress ?? 0, 0);
  manager.sites.push(site);
}

function restoreBaseBuildingEntry(manager, data) {
  const def = BASE_BUILDING_TYPES[data.typeId];
  if (!def) return null;
  const destroyed = !!data.destroyed;
  const entry = {
    id: data.id,
    typeId: data.typeId,
    def,
    team: data.team,
    x: data.x,
    z: data.z,
    y: data.y,
    hp: destroyed ? 0 : data.hp,
    maxHp: data.maxHp,
    destroyed,
    building: false,
    garrison: destroyed ? [] : [...(data.garrison ?? [])],
    mesh: null,
    rubbleMesh: null,
    manager,
    engineerBuilt: !!data.engineerBuilt,
    _attackTarget: null,
  };

  if (destroyed) {
    manager.entries.push(entry);
    manager.restoreDestroyedRubble(entry);
    return entry;
  }

  const mesh = data.engineerBuilt
    ? createCampaignBunkerMesh(manager.getFactionId(data.team))
    : createBaseBuildingMesh(data.typeId, manager.getFactionId(data.team));
  mesh.position.set(data.x, data.y, data.z);
  mesh.rotation.y = data.rotationY ?? manager._facingYaw(data.team, data.x, data.z);
  manager.game.scene.add(mesh);
  entry.mesh = mesh;
  const ratio = data.maxHp > 0 ? data.hp / data.maxHp : 1;
  const accent = data.team === 'player' ? 0x5a9fd4 : 0xf87171;
  setBaseBuildingHpVisual(mesh, ratio, accent);
  manager.entries.push(entry);
  wrapBaseBuildingTarget(entry, manager);
  return entry;
}

function restoreDefenseEntry(manager, data) {
  const def = DEFENSE_TYPES[data.typeId];
  if (!def) return;
  const y = sampleTerrainHeight(data.x, data.z, manager.mapDef);
  const mesh = createDefenseMesh(data.typeId, manager.factionAccent, manager.factionId);
  mesh.position.set(data.x, y, data.z);
  mesh.rotation.y = manager._placementFacingYaw();
  manager.scene.add(mesh);

  const entry = {
    id: data.id,
    typeId: data.typeId,
    def: { ...def },
    x: data.x,
    z: data.z,
    hp: data.hp,
    maxHp: data.maxHp,
    mesh,
    destroyed: false,
    attackCooldown: 0,
    radius:
      data.typeId === 'mine'
        ? def.triggerRadius
        : data.typeId === 'tankTrap' || data.typeId === 'tankTrapHeavy'
          ? def.trapRadius
          : data.typeId === 'barbedWire' || data.typeId === 'razorWire'
            ? def.slowRadius
            : 3.2,
    minSpacing:
      data.typeId === 'mine'
        ? 2.8
        : data.typeId === 'barbedWire' || data.typeId === 'razorWire'
          ? 3.5
          : data.typeId === 'tankTrap' || data.typeId === 'tankTrapHeavy'
            ? 4.2
            : 5.5,
    manager,
    _attackTarget: null,
  };
  mesh.userData.defenseEntry = entry;
  if (data.maxAmmo != null) {
    entry.maxAmmo = data.maxAmmo;
    entry.ammo = data.ammo ?? data.maxAmmo;
    setDefenseAmmoVisual(mesh, entry.ammo / entry.maxAmmo);
  }
  setDefenseHpVisual(mesh, data.hp / data.maxHp);
  manager.entries.push(entry);
  wrapDefenseTarget(entry);
}

function restoreEngineerSite(manager, siteData) {
  const preset = FIELD_BUILD_TYPES[siteData.buildType];
  if (!preset) return;
  const site = {
    id: siteData.id,
    buildType: siteData.buildType,
    x: siteData.x,
    z: siteData.z,
    y: siteData.y,
    team: siteData.team,
    engineerId: siteData.engineerId,
    progress: siteData.progress ?? 0,
    rotationY: siteData.rotationY ?? manager._facingYaw(siteData.team, siteData.x, siteData.z),
    _aiDefensiveFieldwork: !!siteData.aiDefensiveFieldwork,
    _aiFieldworkMode: siteData.aiFieldworkMode ?? null,
    marker: null,
  };
  const mat = new THREE.MeshBasicMaterial({
    color: preset.markerColor ?? 0xc9a84a,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(preset.markerInner ?? 2.2, preset.markerOuter ?? 2.65, 24),
    mat
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(site.x, site.y + 0.12, site.z);
  ring.renderOrder = 9;
  manager.game.scene.add(ring);
  site.marker = ring;
  manager.sites.push(site);
}

function restoreFieldBunker(manager, data) {
  const def = BASE_BUILDING_TYPES.bunker;
  const entry = {
    id: data.id,
    typeId: 'bunker',
    def,
    team: data.team,
    x: data.x,
    z: data.z,
    y: data.y,
    hp: data.hp,
    maxHp: data.maxHp,
    destroyed: false,
    building: false,
    garrison: [...(data.garrison ?? [])],
    mesh: null,
    manager,
    engineerBuilt: true,
    _aiDefensiveFieldwork: !!data.aiDefensiveFieldwork,
    _aiFieldworkMode: data.aiFieldworkMode ?? null,
    _attackTarget: null,
  };
  const mesh = createCampaignBunkerMesh(manager._factionId(data.team));
  mesh.position.set(data.x, data.y, data.z);
  mesh.rotation.y = data.rotationY ?? manager._facingYaw(data.team, data.x, data.z);
  manager.game.scene.add(mesh);
  entry.mesh = mesh;
  const ratio = data.maxHp > 0 ? data.hp / data.maxHp : 1;
  const accent = data.team === 'player' ? 0x5a9fd4 : 0xf87171;
  setBaseBuildingHpVisual(mesh, ratio, accent);
  manager.fieldBunkers.push(entry);
  wrapBaseBuildingTarget(entry, manager);
  return entry;
}

function restoreEngineerMine(manager, data) {
  const factionId =
    data.team === 'player'
      ? manager.game.playerFaction?.id
      : manager.game.enemyFaction?.id;
  const mesh = createDefenseMesh('mine', 0xc9a227, factionId);
  mesh.position.set(data.x, data.y, data.z);
  mesh.rotation.y = data.rotationY ?? 0;
  manager.game.scene.add(mesh);
  manager.mines.push({
    id: data.id,
    team: data.team,
    x: data.x,
    z: data.z,
    y: data.y,
    damage: data.damage ?? DEFENSE_TYPES.mine.damage,
    triggerRadius: data.triggerRadius ?? DEFENSE_TYPES.mine.triggerRadius,
    mesh,
    _aiDefensiveFieldwork: !!data.aiDefensiveFieldwork,
    _aiFieldworkMode: data.aiFieldworkMode ?? null,
  });
}

function restoreTrenchState(game, data) {
  const manager = game.infantryTrenches;
  if (!manager || !data) return;
  manager.pending = !!data.pending;
  setTrenchNextId(data.nextId ?? 1);

  for (const siteData of data.sites ?? []) {
    const site = {
      id: siteData.id,
      x: siteData.x,
      z: siteData.z,
      y: siteData.y,
      team: siteData.team,
      diggerId: siteData.diggerId,
      progress: siteData.progress ?? 0,
      rotationY:
        siteData.rotationY ?? manager._facingYaw(siteData.team, siteData.x, siteData.z),
      _aiDefensiveTrench: !!siteData.aiDefensiveTrench,
      _aiTrenchMode: siteData.aiTrenchMode ?? null,
      marker: null,
    };
    manager.sites.push(site);
    manager._attachSiteMarker(site);
  }

  for (const trenchData of data.trenches ?? []) {
    const mesh = createTrenchGroup({
      factionId:
        trenchData.team === 'player' ? game.playerFaction?.id : game.enemyFaction?.id,
      seed: trenchData.x * 0.19 + trenchData.z * 0.31,
    });
    const rotationY = trenchData.rotationY ?? 0;
    alignTrenchGroupToTerrain(mesh, trenchData.x, trenchData.z, rotationY, game.mapDef);
    game.scene.add(mesh);
    manager.trenches.push({
      id: trenchData.id,
      team: trenchData.team,
      x: trenchData.x,
      z: trenchData.z,
      y: mesh.position.y,
      destroyed: false,
      garrison: [...(trenchData.garrison ?? [])],
      mesh,
      rotationY,
      _aiDefensiveTrench: !!trenchData.aiDefensiveTrench,
      _aiTrenchMode: trenchData.aiTrenchMode ?? null,
    });
    game.coverSystem?.addZone(trenchData.x, trenchData.z, 'trench', 3.6);
  }
}

function restoreMedicFieldHospitalState(game, data) {
  const manager = game.medicFieldHospitals;
  if (!manager || !data) return;
  manager.pending = !!data.pending;
  setMedicTentNextId(data.nextId ?? 1);

  for (const siteData of data.sites ?? []) {
    const site = {
      id: siteData.id,
      x: siteData.x,
      z: siteData.z,
      y: siteData.y,
      team: siteData.team,
      medicId: siteData.medicId,
      progress: siteData.progress ?? 0,
      _aiDefensiveHospital: !!siteData.aiDefensiveHospital,
      _aiHospitalMode: siteData.aiHospitalMode ?? null,
      marker: null,
    };
    manager.sites.push(site);
    manager._attachSiteMarker(site);
  }

  for (const tentData of data.tents ?? []) {
    const mesh = createFieldTentMesh(
      tentData.team === 'player' ? game.playerFaction?.id : game.enemyFaction?.id
    );
    mesh.position.set(tentData.x, tentData.y, tentData.z);
    mesh.rotation.y = tentData.rotationY ?? 0;
    game.scene.add(mesh);
    manager.tents.push({
      id: tentData.id,
      team: tentData.team,
      x: tentData.x,
      z: tentData.z,
      y: tentData.y,
      hp: tentData.hp,
      maxHp: tentData.maxHp,
      destroyed: false,
      mesh,
      healRange: tentData.healRange,
      healPerSec: tentData.healPerSec,
      _aiDefensiveHospital: !!tentData.aiDefensiveHospital,
      _aiHospitalMode: tentData.aiHospitalMode ?? null,
    });
  }
}

export function applyBattleSave(game, snapshot) {
  if (!snapshot || snapshot.version !== SAVE_VERSION) return false;

  setUnitNextId(snapshot.unitNextId ?? 1);
  if (snapshot.baseBuildings?.nextId) setBaseBuildingNextId(snapshot.baseBuildings.nextId);
  if (snapshot.engineerSandbags?.nextSiteId) {
    setEngineerSiteNextId(snapshot.engineerSandbags.nextSiteId);
  }
  if (snapshot.infantryTrenches?.nextId) setTrenchNextId(snapshot.infantryTrenches.nextId);
  if (snapshot.medicFieldHospitals?.nextId) {
    setMedicTentNextId(snapshot.medicFieldHospitals.nextId);
  }

  game.matchTime = snapshot.matchTime ?? 0;
  if (game.clearance) {
    game.clearanceRole =
      snapshot.clearanceRole ??
      snapshot.session?.options?.clearanceRole ??
      game.clearanceRole ??
      'attack';
    const planId =
      snapshot.clearanceAttackPlanId ?? snapshot.session?.options?.clearanceAttackPlanId;
    if (planId && CLEARANCE_ATTACK_PLANS[planId]) {
      game.clearanceAttackPlan = CLEARANCE_ATTACK_PLANS[planId];
    }
    game.clearanceOperational = snapshot.clearanceOperational
      ? {
          ...snapshot.clearanceOperational,
          anchor: snapshot.clearanceOperational.anchor
            ? { ...snapshot.clearanceOperational.anchor }
            : null,
          lastCenter: snapshot.clearanceOperational.lastCenter
            ? { ...snapshot.clearanceOperational.lastCenter }
            : null,
        }
      : null;
  }
  if (game.clearanceReinforcements) {
    const saved = snapshot.clearanceReinforcements;
    if (saved?.enabled) {
      Object.assign(game.clearanceReinforcements, saved);
    } else {
      const interval = game.clearanceReinforcements.interval ?? 180;
      game.clearanceReinforcements.wave = Math.floor(game.matchTime / interval);
      game.clearanceReinforcements.nextAt =
        (game.clearanceReinforcements.wave + 1) * interval;
    }
  }
  game.paused = !!snapshot.paused;
  game.ui?.setGamePaused(game.paused);
  game.autoBuildMode = !!snapshot.autoBuildMode;
  if (game.cheatMode) {
    game.autoBuildMode = false;
    game.ui?.setAutoBuildMode(false, game.campaignStyle, { persist: false });
  } else {
    game.ui?.setAutoBuildMode(game.autoBuildMode, game.campaignStyle);
  }
  game.resources = { ...snapshot.resources };

  if (snapshot.camera) {
    const tx = Number(snapshot.camera.targetX);
    const tz = Number(snapshot.camera.targetZ);
    if (Number.isFinite(tx) && Number.isFinite(tz)) {
      game.cameraTarget.set(tx, 0, tz);
    }
    const zoom = Number(snapshot.camera.zoom);
    if (Number.isFinite(zoom)) {
      game.zoom = THREE.MathUtils.clamp(zoom, game.zoomMin, game.zoomMax);
    }
    const yaw = Number(snapshot.camera.yaw);
    if (Number.isFinite(yaw)) game.cameraYaw = yaw;
  }

  for (const hData of snapshot.hqs ?? []) {
    const hq = game.hqs.find((h) => h.team === hData.team);
    if (!hq) continue;
    hq.hp = hData.hp;
    hq.maxHp = hData.maxHp;
    hq.dead = hData.dead;
    hq.setSelected(!!hData.selected);
    if (hq.dead && hq.group) hq.group.visible = false;
  }

  for (const cpData of snapshot.capturePoints ?? []) {
    const cp = game.capturePoints.find((c) => c.id === cpData.id);
    if (!cp) continue;
    cp.owner = cpData.owner;
    cp.progress = cpData.progress;
    cp.isFrontline = !!cpData.isFrontline;
    cp._updateVisuals?.();
  }

  if (snapshot.assault) {
    const fl = game.capturePoints.find((c) => c.id === snapshot.assault.frontlineCpId);
    game.assault = {
      ...snapshot.assault,
      frontlineCp: fl ?? game.assault?.frontlineCp,
    };
  }
  if (snapshot.towerDefense) {
    game.towerDefense = { ...snapshot.towerDefense };
    if (isTdHqDefenseStyle(game.towerDefense)) {
      repositionFrontlineVisual(
        game.mapDef,
        game.scene,
        getTdFrontlineDef(game),
        game.showFrontline
      );
    }
  }
  if (snapshot.lastStand) {
    game.lastStand = {
      ...snapshot.lastStand,
      supplies: { ...snapshot.lastStand.supplies },
      enemyOperational: snapshot.lastStand.enemyOperational
        ? {
            ...snapshot.lastStand.enemyOperational,
            anchor: snapshot.lastStand.enemyOperational.anchor
              ? { ...snapshot.lastStand.enemyOperational.anchor }
              : null,
            lastCenter: snapshot.lastStand.enemyOperational.lastCenter
              ? { ...snapshot.lastStand.enemyOperational.lastCenter }
              : null,
          }
        : null,
    };
    if (game.lastStand.enemyTacticId) {
      game.lastStand.enemyTactic = getLastStandTactic(game.lastStand.enemyTacticId);
    }
    if (game.lastStand.briefingShown == null) {
      game.lastStand.briefingShown = game.lastStand.phase !== 'deploy';
    }
  }

  if (snapshot.mapScenery?.length) {
    restoreMapScenery(game, snapshot.mapScenery);
  } else {
    destroySavedScenery(game, snapshot.sceneryDestroyed);
  }
  restoreTerrainDamage(game.scene, game.mapDef, game._terrainMesh, snapshot.terrainDamage);
  restoreEngineerScenery(game, snapshot.engineerSandbags?.engineerScenery);
  restoreTrenchState(game, snapshot.infantryTrenches);
  restoreMedicFieldHospitalState(game, snapshot.medicFieldHospitals);

  if (snapshot.baseBuildings && game.baseBuildings?.active) {
    game.baseBuildings.pendingType = snapshot.baseBuildings.pendingType ?? null;
    game.baseBuildings._enemyBuildTimer = snapshot.baseBuildings.enemyBuildTimer ?? 14;
    for (const site of snapshot.baseBuildings.sites ?? []) {
      restoreBaseBuildingSite(game.baseBuildings, site);
    }
    for (const entry of snapshot.baseBuildings.entries ?? []) {
      restoreBaseBuildingEntry(game.baseBuildings, entry);
    }
  }

  if (snapshot.engineerSandbags) {
    const es = game.engineerSandbags;
    es.pendingType = snapshot.engineerSandbags.pendingType ?? null;
    es._builtPositions = (snapshot.engineerSandbags.builtPositions ?? []).map((p) => ({ ...p }));
    for (const site of snapshot.engineerSandbags.sites ?? []) {
      restoreEngineerSite(es, site);
    }
    for (const bunker of snapshot.engineerSandbags.fieldBunkers ?? []) {
      restoreFieldBunker(es, bunker);
    }
    for (const mine of snapshot.engineerSandbags.mines ?? []) {
      restoreEngineerMine(es, mine);
    }
  }

  if (snapshot.defenses && game.defenses) {
    game.defenses.barrageCooldown = snapshot.defenses.barrageCooldown ?? 0;
    game.defenses.selectedId = snapshot.defenses.selectedId ?? null;
    for (const entry of snapshot.defenses.entries ?? []) {
      restoreDefenseEntry(game.defenses, entry);
    }
    if (game.defenses.selectedId) {
      const sel = game.defenses.entries.find((e) => e.id === game.defenses.selectedId);
      if (sel) setDefenseSelected(sel.mesh, true);
    }
  }

  game.production.queues.player = [];
  game.production.queues.enemy = [];
  for (const team of ['player', 'enemy']) {
    const faction = team === 'player' ? game.playerFaction : game.enemyFaction;
    for (const job of snapshot.production?.queues?.[team] ?? []) {
      const def = faction?.units?.[job.unitType];
      if (!def) continue;
      game.production.queues[team].push({
        unitType: job.unitType,
        def,
        remaining: job.remaining,
      });
    }
  }
  if (snapshot.production?.spawnAngle) {
    game.production._spawnAngle = { ...snapshot.production.spawnAngle };
  }

  game.fireSupport.cooldowns = {
    ...Object.fromEntries(
      Object.keys(game.fireSupport.cooldowns).map((id) => [id, 0])
    ),
    ...snapshot.fireSupport?.cooldowns,
  };
  const legacyCloudCoverRemaining =
    game.lastStand?.phase === 'deploy'
      ? AIRBORNE_CLOUD_COVER_SECONDS
      : Math.max(0, AIRBORNE_CLOUD_COVER_SECONDS - (snapshot.matchTime ?? 0));
  game.fireSupport.airborneCloudCoverRemaining =
    snapshot.fireSupport?.airborneCloudCoverRemaining ?? legacyCloudCoverRemaining;
  if (snapshot.fireSupport?.airborneUsesLeft != null) {
    game.fireSupport.airborneUsesLeft = snapshot.fireSupport.airborneUsesLeft;
  } else if (game.clearance || game.lastStand) {
    game.fireSupport.airborneUsesLeft = 1;
  } else {
    game.fireSupport.airborneUsesLeft = null;
  }
  game.fireSupport.pending = null;
  game.fireSupport.clearPreview();
  if (game.enemyFireSupport) {
    game.enemyFireSupport.cooldowns = {
      ...Object.fromEntries(
        Object.keys(game.enemyFireSupport.cooldowns).map((id) => [id, 0])
      ),
      ...snapshot.enemyFireSupport?.cooldowns,
    };
    game.enemyFireSupport.airborneCloudCoverRemaining =
      snapshot.enemyFireSupport?.airborneCloudCoverRemaining ?? legacyCloudCoverRemaining;
    if (snapshot.enemyFireSupport?.airborneUsesLeft != null) {
      game.enemyFireSupport.airborneUsesLeft = snapshot.enemyFireSupport.airborneUsesLeft;
    } else if (game.clearance || game.lastStand) {
      game.enemyFireSupport.airborneUsesLeft = 1;
    } else {
      game.enemyFireSupport.airborneUsesLeft = null;
    }
    game.enemyFireSupport.pending = null;
    game.enemyFireSupport.clearPreview?.();
  }
  game.generalOrders.cooldowns = {
    ...Object.fromEntries(
      Object.keys(game.generalOrders.cooldowns).map((id) => [id, 0])
    ),
    ...snapshot.generalOrders?.cooldowns,
  };
  game.generalOrders.active = snapshot.generalOrders?.active
    ? { ...snapshot.generalOrders.active }
    : null;
  if (game.enemyGeneralOrders) {
    game.enemyGeneralOrders.cooldowns = {
      ...Object.fromEntries(
        Object.keys(game.enemyGeneralOrders.cooldowns).map((id) => [id, 0])
      ),
      ...snapshot.enemyGeneralOrders?.cooldowns,
    };
    game.enemyGeneralOrders.active = snapshot.enemyGeneralOrders?.active
      ? { ...snapshot.enemyGeneralOrders.active }
      : null;
  }
  game.smokeShellTargeting = false;
  game.smokeScreens?.restore?.(snapshot.smokeScreens ?? []);

  if (snapshot.battleStats) {
    game.battleStats.losses = snapshot.battleStats.losses;
    game.battleStats.prisonersTaken = snapshot.battleStats.prisonersTaken;
    game.battleStats.defenseLosses = snapshot.battleStats.defenseLosses;
    game.battleStats.hqLost = { ...snapshot.battleStats.hqLost };
  }

  game.units = [];
  const unitById = new Map();
  for (const uData of snapshot.units ?? []) {
    const faction = uData.team === 'player' ? game.playerFaction : game.enemyFaction;
    const def = faction?.units?.[uData.unitType];
    if (!def) continue;
    const unit = spawnUnitAt({
      def,
      faction,
      team: uData.team,
      x: uData.x,
      z: uData.z,
      scene: game.scene,
      mapDef: game.mapDef,
      scenery: game.scenery,
    });
    if (!unit) continue;
    unit.id = uData.id;
    unit.hp = uData.hp;
    unit.maxHp = uData.maxHp;
    unit.dead = !!uData.dead;
    unit._deathCause = uData.deathCause ?? null;
    unit._deathAt = uData.deathAt ?? null;
    unit._commanderRearAnchor = uData.commanderRearAnchor
      ? { ...uData.commanderRearAnchor }
      : null;
    unit._commanderDeathHandled = !!uData.commanderDeathHandled;
    unit._recoverableWreck = !!uData.recoverableWreck;
    unit._wreckRepairProgress = uData.wreckRepairProgress ?? 0;
    unit._wreckImpactCount = uData.wreckImpactCount ?? 0;
    unit._wreckRunOverCount = uData.wreckRunOverCount ?? 0;
    unit._wreckRunOverDamage = uData.wreckRunOverDamage ?? Math.min(
      1,
      (uData.wreckRunOverCount ?? 0) * 0.14
    );
    unit._wreckReducedToRubble = !!uData.wreckReducedToRubble;
    unit._wreckCrushed = !!uData.wreckCrushed;
    if (unit._wreckCrushed) unit._recoverableWreck = false;
    unit._mobilityDamaged = !!uData.mobilityDamaged;
    unit._mobilityDamageKind = uData.mobilityDamageKind ?? null;
    unit._mobilityRepairProgress = uData.mobilityRepairProgress ?? 0;
    unit._crewBailedOut = !!uData.crewBailedOut;
    unit._crewless = !!uData.crewless;
    unit._replacementCrewUnitId = uData.replacementCrewUnitId ?? null;
    unit._replacementCrewVehicleId = uData.replacementCrewVehicleId ?? null;
    unit._embeddedCrewCount = uData.embeddedCrewCount ?? 0;
    unit._lossRecorded = !!uData.lossRecorded;
    unit.selected = false;
    unit.veteran = !!uData.veteran;
    unit.elite = !!uData.elite;
    unit.killCount = uData.killCount ?? 0;
    unit.retreating = !!uData.retreating;
    unit.surrendered = !!uData.surrendered;
    unit._garrisonBunkerId = null;
    unit._mountedOnTankId = null;
    unit._pendingMountTankId = null;
    unit._pendingReplacementCrew = !!uData._pendingReplacementCrew;
    unit._tankRiderIds = uData._tankRiderIds ? [...uData._tankRiderIds] : null;
    unit._sandbagSite = uData._sandbagSite ?? null;
    unit._trenchId = null;
    unit._trenchDigSite = uData._trenchDigSite ?? null;
    unit._medicTentSite = uData._medicTentSite ?? null;
    unit.attackCooldown = uData.attackCooldown ?? 0;
    unit.mgCooldown = uData.mgCooldown ?? 0;
    unit.grenadeCooldown = uData.grenadeCooldown ?? 0;
    unit.smokeShellCooldown = uData.smokeShellCooldown ?? 0;
    unit._binocularActive = uData.binocularActive ?? 0;
    unit._binocularCooldown = uData.binocularCooldown ?? 0;
    unit._userMoveOrder = !!uData._userMoveOrder;
    unit._reverseMoveOrder = !!uData._reverseMoveOrder;
    unit._chasingAttack = !!uData._chasingAttack;
    unit.engagementStance = uData.engagementStance === 'pursue' ? 'pursue' : 'hold';
    unit.autoFire = !!uData.autoFire;
    unit._stancePursuitOrder = !!uData.stancePursuitOrder;
    unit._stanceBoundAttackOrder = !!uData.stanceBoundAttackOrder;
    unit.defensiveHold = uData.defensiveHold ? { ...uData.defensiveHold } : null;
    unit.lastStandRole = uData.lastStandRole ?? null;
    unit.lastStandEchelon = uData.lastStandEchelon ?? null;
    unit.lastStandStance = uData.lastStandStance ?? null;
    unit._clearanceProbe = uData.clearanceProbe ? { ...uData.clearanceProbe } : null;
    unit.clearanceAttackRole = uData.clearanceAttackRole ?? null;
    const restoredAtSavedPosition =
      Math.abs(unit.position.x - uData.x) < 0.01 &&
      Math.abs(unit.position.z - uData.z) < 0.01;
    unit.position.y = restoredAtSavedPosition && Number.isFinite(uData.y)
      ? uData.y
      : sampleTerrainHeight(unit.position.x, unit.position.z, game.mapDef);
    if (unit.mesh) unit.mesh.rotation.y = uData.yaw ?? 0;
    if (unit.dead) {
      unit._preWreckYaw = uData.preWreckYaw ?? uData.yaw ?? 0;
      // Rebuild the static death pose without replaying the kill explosion.
      unit._vehicleKillFxDone = true;
      applyUnitDeathVisual(unit);
      if (unit._wreckCrushed) applyVehicleWreckCrushVisual(unit);
      // applyUnitDeathVisual supplies defaults; retain the saved lifetime for
      // modes which age battlefield debris normally.
      unit.corpseTimeLeft = uData.corpseTimeLeft ?? unit.corpseTimeLeft;
      unit.wreckTimeLeft = uData.wreckTimeLeft ?? unit.wreckTimeLeft;
    } else {
      updateSquadCasualtyVisual(unit);
    }
    game.units.push(unit);
    unitById.set(unit.id, unit);
    if (uData.selected) unit.setSelected(true);
  }

  setUnitNextId(
    Math.max(snapshot.unitNextId ?? 1, ...[...unitById.keys()].map((id) => id + 1), 1)
  );

  for (const uData of snapshot.units ?? []) {
    const unit = unitById.get(uData.id);
    if (!unit) continue;
    const attackOrder = resolveTargetRef(game, uData.attackOrderRef, unitById);
    const target = resolveTargetRef(game, uData.targetRef, unitById);
    if (attackOrder) {
      unit.attackOrder = attackOrder;
      unit.target = target ?? attackOrder;
      unit._manualFireMission = !!uData.manualFireMission;
    } else {
      unit._stancePursuitOrder = false;
      unit._stanceBoundAttackOrder = false;
    }
    if (uData.moveTarget) {
      unit.moveTarget = { x: uData.moveTarget.x, z: uData.moveTarget.z };
    }
    if (uData._movePath?.length) {
      unit._movePath = uData._movePath.map((p) => ({ x: p.x, z: p.z }));
    }
  }

  for (const uData of snapshot.units ?? []) {
    if (!uData._garrisonBunkerId) continue;
    const unit = unitById.get(uData.id);
    if (!unit) continue;
    const sceneryBunker = uData._garrisonBunkerMapKey
      ? game.scenery?.objects.find((obj) => obj.mapKey === uData._garrisonBunkerMapKey)
      : null;
    unit._garrisonBunkerId = sceneryBunker?.id ?? uData._garrisonBunkerId;
    unit.clearAttackOrder();
    unit.moveTarget = null;
    unit._movePath = null;
    if (unit.mesh) unit.mesh.visible = false;
  }

  for (const uData of snapshot.units ?? []) {
    if (!uData._trenchId) continue;
    const unit = unitById.get(uData.id);
    const trench = game.infantryTrenches?.getTrenchById(uData._trenchId);
    if (!unit || !trench) continue;
    unit._trenchId = trench.id;
    unit._trenchSlot = trench.garrison.indexOf(unit.id);
    unit.moveTarget = null;
    unit._movePath = null;
    applyTrenchVisual(unit, true);
  }

  for (const uData of snapshot.units ?? []) {
    if (!uData._mountedOnTankId && !uData._pendingMountTankId) continue;
    const unit = unitById.get(uData.id);
    if (!unit) continue;
    unit._mountedOnTankId = uData._mountedOnTankId ?? null;
    unit._pendingMountTankId = uData._pendingMountTankId ?? null;
  }
  restoreTankRiderLinks(game.units, game.mapDef);

  if (snapshot.selectedHqTeam) {
    const hq = game.hqs.find((h) => h.team === snapshot.selectedHqTeam && !h.dead);
    game.selectedHq = hq ?? null;
  } else {
    game.selectedHq = null;
  }
  if (snapshot.selectedBaseBuildingId && game.baseBuildings?.active) {
    game.selectedBaseBuilding =
      game.baseBuildings.getEntryById(snapshot.selectedBaseBuildingId) ?? null;
  } else {
    game.selectedBaseBuilding = null;
  }

  importAIState(snapshot.ai ?? { timer: 0, prodTimer: 5 });

  game.coverSystem?.updateUnits?.(game.units);
  game._rebuildUnitCaches();
  syncRankMarkers(game.units);
  for (const u of game._playerAlive) {
    syncUnitFieldIcon(u, game.showUnitFieldIcons);
  }

  return true;
}

export function formatSaveMeta(save) {
  const faction = FACTIONS[save.factionId]?.name ?? save.factionId ?? '—';
  const map = MAPS[save.mapId]?.name ?? save.mapId ?? '—';
  const mode = GAME_MODES[save.gameMode]?.name ?? save.gameMode ?? '—';
  const when = save.savedAt
    ? new Date(save.savedAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';
  return { faction, map, mode, when, elapsed: formatElapsed(save.matchTime ?? 0) };
}
