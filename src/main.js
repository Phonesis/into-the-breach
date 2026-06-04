import { Game } from './game/Game.js';
import { UIManager } from './ui/UIManager.js';
import { sounds } from './audio/SoundManager.js';

const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');

let game = null;
let audioPrimed = false;

function primeAudio() {
  if (audioPrimed) return;
  audioPrimed = true;
  sounds.unlock();
}

uiRoot.addEventListener('pointerdown', () => primeAudio(), { once: true });

const ui = new UIManager(uiRoot, {
  onMenuVisible() {
    primeAudio();
  },
  onStartGame(factionId, mapId, gameMode, options = {}) {
    if (!game) {
      game = new Game({ canvas, ui });
      wireSelectBox(canvas, ui);
    }
    game.startGame(factionId, mapId, gameMode, options);
  },
  onReturnMenu() {
    if (game) game.stopGame();
    ui.hideHUD();
  },
  onReplay() {
    game?.replay();
  },
  onConfirmTarget() {
    game?.confirmTargetAttack();
  },
  onProduce(unitType) {
    game?.tryProduce(unitType);
  },
  onFireSupport(type) {
    game?.armFireSupport(type);
  },
  onSelectUnit(unitId, additive) {
    game?.selectPlayerUnitById(unitId, additive);
  },
  onLaunchBattleNow() {
    game?.launchBattleNow();
  },
  onSurrender() {
    game?.surrender();
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