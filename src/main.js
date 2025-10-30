import { Game } from './core/Game.js';

const container = document.getElementById('app');
const statusOverlay = document.getElementById('status-overlay');
const statusTitle = document.getElementById('status-title');
const statusDescription = document.getElementById('status-description');
const startButton = document.getElementById('start-game');

const game = new Game({ container });

const formatTime = (seconds) => {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${secs}`;
};

const showStatusOverlay = (title, description, options = {}) => {
  if (!statusOverlay || !statusTitle || !statusDescription) {
    return;
  }

  statusTitle.textContent = title;
  statusDescription.textContent = description;
  if (options.buttonLabel && startButton) {
    startButton.textContent = options.buttonLabel;
  }
  statusOverlay.classList.remove('overlay--hidden');
};

const hideStatusOverlay = () => {
  if (!statusOverlay) {
    return;
  }

  statusOverlay.classList.add('overlay--hidden');
};

game
  .init()
  .then(() => {
    showStatusOverlay('Prêt à jouer', 'ZQSD / WASD pour bouger · Souris pour viser · Clic gauche pour tirer', {
      buttonLabel: 'Lancer la partie',
    });

    if (startButton) {
      startButton.addEventListener('click', () => {
        hideStatusOverlay();
        game.start();
      });
    } else {
      game.start();
    }
  })
  .catch((error) => {
    console.error('Échec de l’initialisation du jeu :', error);
    showStatusOverlay(
      'Erreur de chargement',
      'Impossible de démarrer le jeu. Vérifie la console pour plus de détails.',
      { buttonLabel: 'Réessayer' },
    );
  });

window.addEventListener('game:over', (event) => {
  const { score = 0, wavesCleared = 0, timeSurvived = 0 } = event.detail || {};
  const summary = `Score ${score} · Vagues ${wavesCleared} · Temps ${formatTime(timeSurvived)}`;
  showStatusOverlay('Combat terminé', summary, { buttonLabel: 'Rejouer' });
});
