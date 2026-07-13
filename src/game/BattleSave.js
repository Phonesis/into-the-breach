import { FACTIONS } from '../data/factions.js';
import { MAPS } from '../data/maps.js';
import { GAME_MODES } from '../data/gameModes.js';
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
import { updateSquadCasualtyVisual } from '../units/UnitMeshes.js';
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
import { createTrenchGroup } from '../world/TrenchMesh.js';
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
    if (u.dead) continue;
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
      selected: u.selected,
      veteran: u.veteran,
      elite: u.elite,
      killCount: u.killCount ?? 0,
      retreating: u.retreating,
      surrendered: u.surrendered,
      _garrisonBunkerId: u._garrisonBunkerId ?? null,
      _garrisonBunkerMapKey:
        game.scenery?.objects.find((obj) => obj.id === u._garrisonBunkerId)?.mapKey ?? null,
      _mountedOnTankId: u._mountedOnTankId ?? null,
      _pendingMountTankId: u._pendingMountTankId ?? null,
      _tankRiderIds: u._tankRiderIds?.length ? [...u._tankRiderIds] : null,
      _sandbagSite: u._sandbagSite ?? null,
      _trenchId: u._trenchId ?? null,
      _trenchDigSite: u._trenchDigSite ?? null,
      _medicTentSite: u._medicTentSite ?? null,
      attackCooldown: u.attackCooldown ?? 0,
      mgCooldown: u.mgCooldown ?? 0,
      moveTarget: u.moveTarget ? { x: u.moveTarget.x, z: u.moveTarget.z } : null,
      _movePath: u._movePath?.map((p) => ({ x: p.x, z: p.z })) ?? null,
      _userMoveOrder: !!u._userMoveOrder,
      _chasingAttack: !!u._chasingAttack,
      manualFireMission: !!u._manualFireMission,
      attackOrderRef: serializeTargetRef(u.attackOrder),
      targetRef: serializeTargetRef(u.target),
      defensiveHold: u.defensiveHold ? { ...u.defensiveHold } : null,
      lastStandRole: u.lastStandRole ?? null,
      lastStandEchelon: u.lastStandEchelon ?? null,
      lastStandStance: u.lastStandStance ?? null,
    });
  }

  const sessionOptions = { ...(game.lastSession?.options ?? {}) };
  delete sessionOptions.restoreSnapshot;

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
    },
    generalOrders: {
      cooldowns: { ...game.generalOrders.cooldowns },
      active: game.generalOrders.active
        ? { type: game.generalOrders.active.type, remaining: game.generalOrders.active.remaining }
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
      game.scenery.destroyObject(obj, { effects: false });
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
    if (obj) game.scenery.destroyObject(obj);
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
    marker: null,
  };
  const visual = createBaseBuildingConstructionVisual({ def, team: site.team });
  visual.position.set(site.x, site.y, site.z);
  visual.rotation.y = manager._facingYaw(site.team, site.x, site.z);
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
  mesh.rotation.y = manager._facingYaw(data.team, data.x, data.z);
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
    _attackTarget: null,
  };
  const mesh = createCampaignBunkerMesh(manager._factionId(data.team));
  mesh.position.set(data.x, data.y, data.z);
  mesh.rotation.y = manager._facingYaw(data.team, data.x, data.z);
  manager.game.scene.add(mesh);
  entry.mesh = mesh;
  const ratio = data.maxHp > 0 ? data.hp / data.maxHp : 1;
  const accent = data.team === 'player' ? 0x5a9fd4 : 0xf87171;
  setBaseBuildingHpVisual(mesh, ratio, accent);
  manager.fieldBunkers.push(entry);
  wrapBaseBuildingTarget(entry, manager);
  return entry;
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
    mesh.position.set(trenchData.x, trenchData.y, trenchData.z);
    mesh.rotation.y = trenchData.rotationY ?? 0;
    game.scene.add(mesh);
    manager.trenches.push({
      id: trenchData.id,
      team: trenchData.team,
      x: trenchData.x,
      z: trenchData.z,
      y: trenchData.y,
      destroyed: false,
      garrison: [...(trenchData.garrison ?? [])],
      mesh,
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
  game.fireSupport.pending = null;
  game.fireSupport.clearPreview();
  game.generalOrders.cooldowns = {
    ...Object.fromEntries(
      Object.keys(game.generalOrders.cooldowns).map((id) => [id, 0])
    ),
    ...snapshot.generalOrders?.cooldowns,
  };
  game.generalOrders.active = snapshot.generalOrders?.active
    ? { ...snapshot.generalOrders.active }
    : null;
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
    });
    unit.id = uData.id;
    unit.hp = uData.hp;
    unit.maxHp = uData.maxHp;
    unit.selected = false;
    unit.veteran = !!uData.veteran;
    unit.elite = !!uData.elite;
    unit.killCount = uData.killCount ?? 0;
    unit.retreating = !!uData.retreating;
    unit.surrendered = !!uData.surrendered;
    unit._garrisonBunkerId = null;
    unit._mountedOnTankId = null;
    unit._pendingMountTankId = null;
    unit._tankRiderIds = uData._tankRiderIds ? [...uData._tankRiderIds] : null;
    unit._sandbagSite = uData._sandbagSite ?? null;
    unit._trenchId = null;
    unit._trenchDigSite = uData._trenchDigSite ?? null;
    unit._medicTentSite = uData._medicTentSite ?? null;
    unit.attackCooldown = uData.attackCooldown ?? 0;
    unit.mgCooldown = uData.mgCooldown ?? 0;
    unit._userMoveOrder = !!uData._userMoveOrder;
    unit._chasingAttack = !!uData._chasingAttack;
    unit.defensiveHold = uData.defensiveHold ? { ...uData.defensiveHold } : null;
    unit.lastStandRole = uData.lastStandRole ?? null;
    unit.lastStandEchelon = uData.lastStandEchelon ?? null;
    unit.lastStandStance = uData.lastStandStance ?? null;
    unit.position.y = uData.y ?? sampleTerrainHeight(uData.x, uData.z, game.mapDef);
    if (unit.mesh) unit.mesh.rotation.y = uData.yaw ?? 0;
    updateSquadCasualtyVisual(unit);
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