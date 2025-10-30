import * as THREE from 'three';

const DEFAULT_ATTACK_COOLDOWN = 1.2;
const DEFAULT_ATTACK_RANGE = 1.8;

export class Enemy {
  constructor({ scene, assetManager, config }) {
    if (!scene) {
      throw new Error('Enemy requiert une scène Three.js.');
    }

    this.scene = scene;
    this.assetManager = assetManager;
    this.config = {
      id: 'grunt',
      modelPath: 'assets/models/enemies/grunt.glb',
      maxHealth: 50,
      speed: 6,
      damage: 10,
      attackRange: DEFAULT_ATTACK_RANGE,
      attackCooldown: DEFAULT_ATTACK_COOLDOWN,
      reward: 50,
      scale: 1,
      ...config,
    };

    this.group = new THREE.Group();
    this.group.name = `Enemy_${this.config.id}`;
    this.group.position.copy(this.config.spawnPosition ?? new THREE.Vector3());

    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;

    this.health = this.config.maxHealth;
    this.isAlive = true;
    this.timeSinceLastAttack = 0;

    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.lookTarget = new THREE.Vector3();
    this.targetQuaternion = new THREE.Quaternion();
    this.lookMatrix = new THREE.Matrix4();
    this.upVector = new THREE.Vector3(0, 1, 0);

    this.boundingRadius = 1.2 * this.config.scale;
    this.height = 2.6 * this.config.scale;
  }

  async init() {
    this.scene.add(this.group);

    try {
      const asset = await this.assetManager.loadGLTF(this.config.modelPath, {
        cacheKey: this.config.id,
        center: true,
        centerAxis: 'y',
      });

      this.model = asset.scene;
      this.model.name = `EnemyModel_${this.config.id}`;
      this.model.scale.setScalar(this.config.scale);
      this.group.add(this.model);

      if (asset.animations && asset.animations.length > 0) {
        this.mixer = new THREE.AnimationMixer(this.model);
        asset.animations.forEach((clip) => {
          const name = clip.name.toLowerCase();
          if (name.includes('idle')) this.actions.idle = this.mixer.clipAction(clip);
          if (name.includes('run') || name.includes('move')) this.actions.run = this.mixer.clipAction(clip);
          if (name.includes('attack') || name.includes('hit')) this.actions.attack = this.mixer.clipAction(clip);
          if (name.includes('die') || name.includes('death')) this.actions.die = this.mixer.clipAction(clip);
        });

        if (!this.actions.idle && asset.animations.length > 0) {
          this.actions.idle = this.mixer.clipAction(asset.animations[0]);
        }

        this._playAction('idle');
      }

      const box = new THREE.Box3().setFromObject(this.model);
      const size = new THREE.Vector3();
      box.getSize(size);
      this.boundingRadius = Math.max(size.x, size.z) * 0.35;
      this.height = size.y;
    } catch (error) {
      console.warn(
        `Impossible de charger le modèle pour l’ennemi ${this.config.id}. Utilisation d’une silhouette alternative.`,
        error,
      );
      this.model = this._createFallbackModel();
      this.model.scale.setScalar(this.config.scale);
      this.group.add(this.model);
    }
  }

  update(delta, context = {}) {
    if (!this.isAlive) {
      if (this.mixer) {
        this.mixer.update(delta);
      }
      return;
    }

    const { playerPosition, onAttack } = context;
    if (!playerPosition) {
      return;
    }
    this.timeSinceLastAttack += delta;

    this.direction.subVectors(playerPosition, this.group.position);
    const distance = this.direction.length();

    if (distance > 0.0001) {
      this.direction.normalize();
    }

    if (distance > this.config.attackRange) {
      const moveDistance = this.config.speed * delta;
      this.group.position.addScaledVector(this.direction, moveDistance);
      this._playAction('run');
    } else {
      this._playAction('attack');
      if (this.timeSinceLastAttack >= this.config.attackCooldown) {
        this.timeSinceLastAttack = 0;
        onAttack?.(this);
      }
    }

    this.lookTarget.copy(playerPosition);
    this.lookTarget.y = this.group.position.y;

    this.lookMatrix.lookAt(this.group.position, this.lookTarget, this.upVector);
    this.targetQuaternion.setFromRotationMatrix(this.lookMatrix);
    this.group.quaternion.slerp(this.targetQuaternion, 0.18);

    if (this.mixer) {
      this.mixer.update(delta);
    } else if (this.model) {
      this.model.rotation.y += delta * 0.5;
    }
  }

  takeDamage(amount) {
    if (!this.isAlive) {
      return false;
    }

    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.isAlive = false;
      this._playAction('die');
      return true;
    }

    return false;
  }

  dispose() {
    if (this.group && this.group.parent) {
      this.group.parent.remove(this.group);
    }

    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.model);
    }

    this.group.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => material.dispose?.());
        } else {
          child.material?.dispose?.();
        }
      }
      if (child.isLight) {
        child.dispose?.();
      }
    });
  }

  _playAction(name) {
    if (!this.actions[name]) {
      return;
    }

    if (this.currentAction === this.actions[name]) {
      return;
    }

    const next = this.actions[name];
    next.reset();
    next.fadeIn(0.2);
    next.play();

    if (this.currentAction) {
      this.currentAction.fadeOut(0.22);
    }

    this.currentAction = next;
  }

  _createFallbackModel() {
    const group = new THREE.Group();

    const material = new THREE.MeshStandardMaterial({
      color: 0xff5670,
      emissive: 0xff204e,
      emissiveIntensity: 1.2,
      roughness: 0.45,
      metalness: 0.6,
    });

    const bodyGeometry = new THREE.DodecahedronGeometry(0.8, 1);
    const body = new THREE.Mesh(bodyGeometry, material);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const crownGeometry = new THREE.TorusKnotGeometry(0.6, 0.15, 80, 12, 2, 3);
    const crownMaterial = new THREE.MeshBasicMaterial({ color: 0xff9aa6 });
    const crown = new THREE.Mesh(crownGeometry, crownMaterial);
    crown.position.y = 1.1;
    group.add(crown);

    const glow = new THREE.PointLight(0xff385f, 1, 14, 2.1);
    glow.position.set(0, 0.6, 0);
    group.add(glow);

    group.scale.setScalar(0.95);

    return group;
  }
}
