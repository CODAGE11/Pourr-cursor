import * as THREE from 'three';
import { Enemy } from '../entities/Enemy.js';

const DEFAULT_SPAWN_INTERVAL = 3.2;
const DEFAULT_MAX_ACTIVE = 8;
const DEATH_CLEANUP_DELAY = 1.8;

export class EnemyManager {
  constructor({ scene, assetManager }) {
    this.scene = scene;
    this.assetManager = assetManager;

    this.enemyEntries = [];
    this.elapsed = 0;
    this.spawnTimer = 0;
    this.wave = 1;
    this.spawnInterval = DEFAULT_SPAWN_INTERVAL;
    this.maxActive = DEFAULT_MAX_ACTIVE;
    this.spawnRadius = 28;

    this.enemyDefinitions = {
      grunt: {
        id: 'grunt',
        modelPath: 'assets/models/enemies/grunt.glb',
        maxHealth: 60,
        speed: 5.5,
        damage: 10,
        reward: 60,
        attackRange: 1.9,
        attackCooldown: 1.4,
        scale: 1.05,
      },
      runner: {
        id: 'runner',
        modelPath: 'assets/models/enemies/runner.glb',
        maxHealth: 40,
        speed: 8.5,
        damage: 8,
        reward: 80,
        attackRange: 1.6,
        attackCooldown: 1.0,
        scale: 0.95,
      },
      brute: {
        id: 'brute',
        modelPath: 'assets/models/enemies/brute.glb',
        maxHealth: 140,
        speed: 3.6,
        damage: 18,
        reward: 150,
        attackRange: 2.6,
        attackCooldown: 2.2,
        scale: 1.35,
      },
    };

    this.spawnQueue = [];
    this.waveInProgress = false;

    this.tmpPosition = new THREE.Vector3();
  }

  update(delta, { playerPosition, onPlayerDamaged }) {
    this.elapsed += delta;
    this.spawnTimer += delta;

    this._maybeScheduleNewWave();
    this._handleSpawning(playerPosition);

    for (let i = this.enemyEntries.length - 1; i >= 0; i -= 1) {
      const entry = this.enemyEntries[i];
      const enemy = entry.enemy;

      if (!enemy) {
        this.enemyEntries.splice(i, 1);
        continue;
      }

      if (enemy.isAlive) {
        enemy.update(delta, {
          playerPosition,
          onAttack: (attackingEnemy) => {
            onPlayerDamaged?.(attackingEnemy.config.damage, attackingEnemy);
          },
        });
      } else {
        entry.deathTimer += delta;
        if (entry.deathTimer >= DEATH_CLEANUP_DELAY) {
          enemy.dispose();
          this.enemyEntries.splice(i, 1);
        }
      }
    }
  }

  async spawnEnemy(type, spawnPosition) {
    const definition = this.enemyDefinitions[type];
    if (!definition) {
      console.warn(`Type d’ennemi inconnu : ${type}`);
      return null;
    }

    const enemy = new Enemy({
      scene: this.scene,
      assetManager: this.assetManager,
      config: {
        ...definition,
        spawnPosition: spawnPosition?.clone() ?? this._getRandomSpawnPosition(),
      },
    });

    await enemy.init();

    this.enemyEntries.push({ enemy, deathTimer: 0 });
    return enemy;
  }

  handleProjectileImpact(projectile, damage) {
    let hitEnemy = null;
    let minDistance = Infinity;

    this.enemyEntries.forEach(({ enemy }) => {
      if (!enemy.isAlive) {
        return;
      }

      const distance = enemy.group.position.distanceToSquared(projectile.position);
      if (distance <= enemy.boundingRadius * enemy.boundingRadius) {
        if (distance < minDistance) {
          minDistance = distance;
          hitEnemy = enemy;
        }
      }
    });

    if (!hitEnemy) {
      return null;
    }

    const wasFatal = hitEnemy.takeDamage(damage);
    return {
      enemy: hitEnemy,
      wasFatal,
      reward: wasFatal ? hitEnemy.config.reward : 0,
      damage,
    };
  }

  getAliveEnemies() {
    return this.enemyEntries.filter(({ enemy }) => enemy.isAlive).map(({ enemy }) => enemy);
  }

  reset() {
    this.enemyEntries.forEach(({ enemy }) => enemy.dispose());
    this.enemyEntries = [];
    this.spawnQueue = [];
    this.wave = 1;
    this.spawnTimer = 0;
    this.waveInProgress = false;
  }

  _maybeScheduleNewWave() {
    if (this.waveInProgress) {
      return;
    }

    if (this.enemyEntries.length === 0 && this.spawnQueue.length === 0) {
      this.waveInProgress = true;
      this._enqueueWaveComposition();
      this.spawnTimer = this.spawnInterval;
    }
  }

  _handleSpawning(playerPosition) {
    if (!this.waveInProgress || this.spawnQueue.length === 0) {
      return;
    }

    if (this.spawnTimer < this.spawnInterval) {
      return;
    }

    if (this._countActiveEnemies() >= this.maxActive) {
      return;
    }

    this.spawnTimer = 0;
    const nextType = this.spawnQueue.shift();
    this.spawnEnemy(nextType, this._getSpawnPositionRelativeTo(playerPosition)).catch((error) => {
      console.error('Erreur lors du spawn ennemi :', error);
    });

    if (this.spawnQueue.length === 0) {
      this.wave += 1;
      this.waveInProgress = false;
      this.spawnInterval = Math.max(0.9, this.spawnInterval * 0.92);
      this.maxActive = Math.min(24, this.maxActive + 1);
    }
  }

  _enqueueWaveComposition() {
    const baseCount = 5 + this.wave * 2;
    const composition = [];

    for (let i = 0; i < baseCount; i += 1) {
      composition.push('grunt');
    }

    if (this.wave >= 3) {
      const runnerCount = Math.floor(this.wave / 2);
      for (let i = 0; i < runnerCount; i += 1) {
        composition.push('runner');
      }
    }

    if (this.wave % 4 === 0) {
      const bruteCount = 1 + Math.floor(this.wave / 6);
      for (let i = 0; i < bruteCount; i += 1) {
        composition.push('brute');
      }
    }

    composition.sort(() => Math.random() - 0.5);
    this.spawnQueue.push(...composition);
  }

  _getRandomSpawnPosition() {
    const angle = Math.random() * Math.PI * 2;
    const distance = this.spawnRadius + Math.random() * 12;
    this.tmpPosition.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
    return this.tmpPosition.clone();
  }

  _getSpawnPositionRelativeTo(playerPosition) {
    if (!playerPosition) {
      return this._getRandomSpawnPosition();
    }

    const angle = Math.random() * Math.PI * 2;
    const distance = this.spawnRadius + Math.random() * 10;
    this.tmpPosition
      .set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance)
      .add(playerPosition);

    return this.tmpPosition.clone();
  }

  _countActiveEnemies() {
    return this.enemyEntries.reduce((count, entry) => count + (entry.enemy.isAlive ? 1 : 0), 0);
  }
}
