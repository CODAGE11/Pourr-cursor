import * as THREE from 'three';

const DEFAULT_PROJECTILE_LIFETIME = 2.5;

export class ProjectileSystem {
  constructor({ scene }) {
    this.scene = scene;

    this.projectileGeometry = new THREE.SphereGeometry(0.12, 12, 12);
    this.projectileMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff1a8,
      emissive: 0xffc75f,
      emissiveIntensity: 1.6,
      roughness: 0.22,
      metalness: 0.15,
    });

    this.projectiles = [];
    this.pool = [];
  }

  spawnProjectile({ position, direction, speed, damage, maxDistance = 60, color }) {
    const projectile = this._getProjectile();

    projectile.position.copy(position);
    projectile.mesh.position.copy(position);
    projectile.direction.copy(direction).normalize();
    projectile.speed = speed;
    projectile.damage = damage;
    projectile.maxDistance = maxDistance;
    projectile.distanceTravelled = 0;
    projectile.timeToLive = DEFAULT_PROJECTILE_LIFETIME;
    projectile.active = true;

    if (color) {
      projectile.mesh.material.color.set(color);
      projectile.mesh.material.emissive.set(color);
    } else {
      projectile.mesh.material.color.set(0xfff1a8);
      projectile.mesh.material.emissive.set(0xffc75f);
    }

    if (!projectile.mesh.parent) {
      this.scene.add(projectile.mesh);
    }

    this.projectiles.push(projectile);
    return projectile;
  }

  update(delta, enemyManager, callbacks = {}) {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = this.projectiles[i];
      if (!projectile.active) {
        this._deactivateProjectileAtIndex(i);
        continue;
      }

      const travelDistance = projectile.speed * delta;
      projectile.position.addScaledVector(projectile.direction, travelDistance);
      projectile.mesh.position.copy(projectile.position);

      projectile.distanceTravelled += travelDistance;
      projectile.timeToLive -= delta;

      if (projectile.distanceTravelled >= projectile.maxDistance || projectile.timeToLive <= 0) {
        this._deactivateProjectileAtIndex(i);
        continue;
      }

      const impact = enemyManager?.handleProjectileImpact(projectile, projectile.damage);
      if (impact && impact.enemy) {
        callbacks.onEnemyHit?.(impact);
        this._deactivateProjectileAtIndex(i);
      }
    }
  }

  reset() {
    while (this.projectiles.length > 0) {
      this._deactivateProjectileAtIndex(this.projectiles.length - 1);
    }
  }

  _getProjectile() {
    if (this.pool.length > 0) {
      return this.pool.pop();
    }

    const mesh = new THREE.Mesh(this.projectileGeometry, this.projectileMaterial.clone());
    mesh.castShadow = true;

    return {
      mesh,
      position: new THREE.Vector3(),
      direction: new THREE.Vector3(0, 0, 1),
      speed: 40,
      damage: 10,
      maxDistance: 50,
      distanceTravelled: 0,
      timeToLive: DEFAULT_PROJECTILE_LIFETIME,
      active: false,
    };
  }

  _deactivateProjectileAtIndex(index) {
    const projectile = this.projectiles[index];
    if (!projectile) {
      return;
    }

    projectile.active = false;
    projectile.distanceTravelled = 0;
    projectile.timeToLive = 0;

    if (projectile.mesh.parent) {
      projectile.mesh.parent.remove(projectile.mesh);
    }

    this.projectiles.splice(index, 1);
    this.pool.push(projectile);
  }
}
