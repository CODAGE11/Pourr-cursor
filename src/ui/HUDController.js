export class HUDController {
  constructor() {
    this.scoreElement = document.getElementById('score');
    this.healthBarFill = document.getElementById('health-fill');
    this.weaponNameElement = document.getElementById('weapon-name');
    this.ammoCountElement = document.getElementById('ammo-count');

    this.currentScore = 0;
    this.maxHealth = 100;
    this.currentHealth = 100;
    this.weaponName = 'Pistolet';
    this.ammoDisplay = '∞';
  }

  setScore(score) {
    this.currentScore = Math.max(0, Math.floor(score));
    if (this.scoreElement) {
      this.scoreElement.textContent = this.currentScore.toString();
    }
  }

  setHealth(current, max) {
    this.currentHealth = Math.max(0, current);
    this.maxHealth = Math.max(1, max);

    if (this.healthBarFill) {
      const ratio = Math.min(1, this.currentHealth / this.maxHealth);
      this.healthBarFill.style.width = `${ratio * 100}%`;

      if (ratio > 0.6) {
        this.healthBarFill.style.background = 'linear-gradient(90deg, #7b5cff 0%, #9f7bff 100%)';
      } else if (ratio > 0.3) {
        this.healthBarFill.style.background = 'linear-gradient(90deg, #ffaa5c 0%, #ff8d60 100%)';
      } else {
        this.healthBarFill.style.background = 'linear-gradient(90deg, #ff5678 0%, #ff2f5a 100%)';
      }
    }
  }

  setWeapon({ name, ammoDisplay }) {
    if (name) {
      this.weaponName = name;
      if (this.weaponNameElement) {
        this.weaponNameElement.textContent = name;
      }
    }

    if (typeof ammoDisplay !== 'undefined') {
      this.ammoDisplay = ammoDisplay;
      if (this.ammoCountElement) {
        this.ammoCountElement.textContent = ammoDisplay;
      }
    }
  }
}
