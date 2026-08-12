import { spawnUnitAt } from './Spawner.js';

export const LINE_EFFECTIVENESS_TEST_MINE_POSITIONS = [
  { x: 3, z: -13 },
  { x: 3, z: -8 },
  { x: 3, z: -3 },
  { x: 3, z: 2 },
  { x: 3, z: 7 },
  { x: 3, z: 12 },
];

const PLAYER_TEST_LAYOUT = [
  { type: 'infantry', x: -14, z: 18 },
  { type: 'tank', x: -34, z: -10 },
  { type: 'tank', x: -34, z: 0 },
  { type: 'tankDestroyer', x: -34, z: 10 },
  { type: 'armoredCar', x: -34, z: 20 },
];

const ENEMY_TEST_LAYOUT = [{ type: 'infantry', x: 17, z: 18 }];

function spawnLayout(game, faction, team, layout) {
  return layout
    .map(({ type, x, z }) => {
      const def = faction?.units?.[type];
      if (!def) return null;
      return spawnUnitAt({
        def,
        faction,
        team,
        x,
        z,
        scene: game.scene,
        mapDef: game.mapDef,
        scenery: game.scenery,
      });
    })
    .filter(Boolean);
}

/** Spawn the deliberately small force used by the Line Effectiveness Lab. */
export function spawnLineEffectivenessTestForces(game) {
  const playerUnits = spawnLayout(
    game,
    game.playerFaction,
    'player',
    PLAYER_TEST_LAYOUT
  );
  const enemyUnits = spawnLayout(
    game,
    game.enemyFaction,
    'enemy',
    ENEMY_TEST_LAYOUT
  );

  for (const unit of [...playerUnits, ...enemyUnits]) {
    // The range starts quiet. Explicit move/attack orders still wake a unit,
    // but idle units do not auto-fire before the player has chosen a test.
    unit._lineTestPassive = true;
  }

  for (const unit of enemyUnits) {
    unit._lineTestEnemyPosition = true;
    unit._lineTestRetreatOnFire = true;
    unit.defensiveHold = {
      x: unit.position.x,
      z: unit.position.z,
      radius: 4,
    };
  }

  return [...playerUnits, ...enemyUnits];
}

export function seedLineEffectivenessTestMines(game) {
  for (const position of LINE_EFFECTIVENESS_TEST_MINE_POSITIONS) {
    game.engineerSandbags?.addPrelaidMine({
      ...position,
      team: 'enemy',
      rotationY: Math.PI * 0.5,
    });
  }
}
