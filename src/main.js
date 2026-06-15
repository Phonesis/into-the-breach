import { Game } from './game/Game.js';
import { UIManager } from './ui/UIManager.js';
import { sounds } from './audio/SoundManager.js';
import { preloadUnitTextures } from './units/UnitTextures.js';

preloadUnitTextures().catch((err) => console.warn('Unit camo textures failed to load:', err));

const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');

let game = null;
let audioPrimed = false;

function primeAudio() {
  if (audioPrimed) return;
  audioPrimed = true;
  sounds.unlock();
}

function resumeAudioContext() {
  primeAudio();
  const ctx = sounds.ctx;
  if (ctx?.state === 'suspended') ctx.resume();
  if (!sounds.inBattle) sounds.setMenuMusicActive(true);
}

uiRoot.addEventListener('pointerdown', resumeAudioContext, { once: true });
window.addEventListener('keydown', resumeAudioContext, { once: true });

const ui = new UIManager(uiRoot, {
  onMenuVisible(visible) {
    primeAudio();
    if (sounds.inBattle) {
      if (!visible) sounds.setMenuMusicActive(false);
      return;
    }
    sounds.setMenuMusicActive(visible);
  },
  async onStartGame(factionId, mapId, gameMode, options = {}) {
    await preloadUnitTextures();
    sounds.enterBattle();
    if (!game) {
      game = new Game({ canvas, ui });
      wireSelectBox(canvas, ui);
    }
    game.startGame(factionId, mapId, gameMode, options);
  },
  onReturnMenu() {
    if (game) game.stopGame();
    sounds.leaveBattle();
    ui.hideHUD();
  },
  onReplay() {
    game?.replay();
  },
  onConfirmTarget() {
    game?.confirmTargetAttack();
  },
  onTabletTargetMode(on) {
    game?.setTabletTargetMode(on);
  },
  onTabletFireMode(on) {
    game?.setTabletFireMode(on);
  },
  onCancelFireMissions() {
    game?.cancelAllFireMissions();
  },
  onProduce(unitType) {
    game?.tryProduce(unitType);
  },
  onPlaceDefense(typeId) {
    game?.armDefense(typeId);
  },
  onTowerDefenseBarrage() {
    game?.armTowerDefenseBarrage();
  },
  onUpgradeDefense() {
    game?.tryUpgradeDefense();
  },
  onFireSupport(type) {
    game?.armFireSupport(type);
  },
  onArmSandbags() {
    game?.armSandbagBuild();
  },
  onSelectUnit(unitId, additive) {
    game?.selectPlayerUnitById(unitId, additive);
  },
  onLaunchBattleNow() {
    game?.launchBattleNow();
  },
  onSkipTowerDefenseWave() {
    game?.skipTowerDefenseWave();
  },
  onSurrender() {
    game?.surrender();
  },
  onToggleUnitFieldIcons(enabled) {
    game?.setUnitFieldIconsEnabled(enabled);
  },
  onToggleFrontline(enabled) {
    game?.setShowFrontlineEnabled(enabled);
  },
});



function wireSelectBox(canvas, uiManager) {
  const box = uiManager.getSelectBoxEl();
  let start = null;

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !game?.running) return;
    start = { x: e.clientX, y: e.clientY };
    box.style.left = `${e.clientX}px`;
    box.style.top = `${e.clientY}px`;
    box.style.width = '0';
    box.style.height = '0';
    box.classList.remove('active');
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!start || !game?.running) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.sqrt(dx * dx + dy * dy) < 6) return;
    box.classList.add('active');
    const left = Math.min(start.x, e.clientX);
    const top = Math.min(start.y, e.clientY);
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${Math.abs(dx)}px`;
    box.style.height = `${Math.abs(dy)}px`;
  });

  canvas.addEventListener('pointerup', () => {
    start = null;
    box.classList.remove('active');
  });
}

// Right-click orders are handled by RTSController (pointerdown + contextmenu).

resumeAudioContext();