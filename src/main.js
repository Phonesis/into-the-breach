import { Game } from './game/Game.js';
import { UIManager } from './ui/UIManager.js';
import { sounds } from './audio/SoundManager.js';
import { preloadUnitTextures } from './units/UnitTextures.js';

preloadUnitTextures().catch((err) => console.warn('Unit camo textures failed to load:', err));

const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');

let game = null;

function primeAudio() {
  return sounds.unlock();
}

function resumeAudioContext() {
  if (!primeAudio()) return;
  // Resume immediately while the browser still considers this a user gesture.
  // Combat samples continue loading in the background; menu music must not wait
  // for the entire sound library to decode.
  void sounds
    .resumeContext()
    // Autoplay policy can reject a resume attempt; the next user gesture retries it.
    .catch(() => {});
}

function restoreAudioContext() {
  if (!sounds.unlocked) return;
  void sounds.resumeContext().catch(() => {});
}

// Capture gestures before UI handlers start asynchronous work. The click
// fallback covers keyboard/assistive activation that does not emit pointerdown.
window.addEventListener('pointerdown', resumeAudioContext, { capture: true });
window.addEventListener('keydown', resumeAudioContext, { capture: true });
window.addEventListener('click', resumeAudioContext, { capture: true });
window.addEventListener('pageshow', restoreAudioContext);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) restoreAudioContext();
});

const ui = new UIManager(uiRoot, {
  onMenuVisible(visible) {
    if (sounds.inBattle) {
      if (!visible) sounds.setMenuMusicActive(false);
      return;
    }
    sounds.setMenuMusicActive(visible);
  },
  async onStartGame(factionId, mapId, gameMode, options = {}) {
    primeAudio();
    const audioReady = sounds.primeForCombat();
    await preloadUnitTextures();
    await audioReady;
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
  onSaveBattle() {
    game?.saveBattle();
  },
  async onLoadBattle(saveId) {
    primeAudio();
    const audioReady = sounds.primeForCombat();
    await preloadUnitTextures();
    await audioReady;
    sounds.enterBattle();
    if (!game) {
      game = new Game({ canvas, ui });
      wireSelectBox(canvas, ui);
    }
    if (!game.loadBattle(saveId)) {
      ui.showSaveToast?.('Could not load that save.');
      return;
    }
    ui.refreshTitleSaveButton();
  },
  onReplay() {
    game?.replay();
  },
  onViewBattlefield() {
    game?.enterPostMatchView();
  },
  onExitBattlefieldView() {
    game?.exitPostMatchView();
  },
  onConfirmTarget() {
    game?.confirmTargetAttack();
  },
  onSetEngagementStance(stance) {
    game?.setSelectedEngagementStance(stance);
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
  onResupplyDefense() {
    game?.tryResupplyDefense();
  },
  onFireSupport(type) {
    game?.armFireSupport(type);
  },
  onGeneralOrder(type) {
    game?.tryGeneralOrder(type);
  },
  onArmSmokeShell() {
    game?.armSmokeShell();
  },
  onToggleArtilleryAutoFire() {
    game?.toggleSelectedArtilleryAutoFire();
  },
  onArmSandbags() {
    game?.armSandbagBuild();
  },
  onArmBunker() {
    game?.armBunkerBuild();
  },
  onArmMine() {
    game?.armMineBuild();
  },
  onArmTrenchDig() {
    game?.armTrenchDig();
  },
  onUseRadioBinoculars() {
    game?.useRadioBinoculars();
  },
  onArmMedicTent() {
    game?.armMedicTent();
  },
  onArmBaseBuilding(typeId) {
    game?.armBaseBuilding(typeId);
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
  onToggleUnitStatus(enabled) {
    game?.setUnitStatusEnabled(enabled);
  },
  onToggleFrontline(enabled) {
    game?.setShowFrontlineEnabled(enabled);
  },
  onToggleCapturePoints(enabled) {
    game?.setCapturePointsVisible(enabled);
  },
  onToggleSeekCover(enabled) {
    game?.setSeekCoverMode(enabled);
  },
  onToggleAutoBuild(enabled) {
    game?.setAutoBuildMode(enabled);
  },
  onChangeDebrisRetention(seconds) {
    game?.setDebrisRetentionSeconds(seconds);
  },
  onDismountTankRiders() {
    game?.dismountSelectedTankRiders();
  },
  onMinimapPan(x, z) {
    game?.panCameraTo(x, z);
  },
});



function wireSelectBox(canvas, uiManager) {
  const box = uiManager.getSelectBoxEl();
  let start = null;

  canvas.addEventListener('pointerdown', (e) => {
    resumeAudioContext();
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
