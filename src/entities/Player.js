import * as THREE from 'three';

const DEFAULT_SPEED = 12;
const DEFAULT_ACCELERATION = 42;
const DEFAULT_DRAG = 14;
const AIM_HEIGHT_OFFSET = 1.2;

export class Player {
  constructor({ scene, assetManager, input }) {
    if (!scene) {
      throw new Error('Player requiert une scène Three.js.');
    }
    if (!assetManager) {
      throw new Error('Player requiert un gestionnaire de ressources.');
    }
    if (!input) {
      throw new Error('Player requiert un gestionnaire d’entrées.');
    }

    this.scene = scene;
    this.assetManager = assetManager;
    this.input = input;

    this.group = new THREE.Group();
    this.group.name = 'PlayerRoot';
    this.group.position.set(0, 0, 0);

    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;

    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.lookDirection = new THREE.Vector3(0, 0, 1);
    this.targetQuaternion = new THREE.Quaternion();

    this.speed = DEFAULT_SPEED;
    this.acceleration = DEFAULT_ACCELERATION;
    this.drag = DEFAULT_DRAG;

    this.aimTarget = new THREE.Vector3();
    this.weaponMount = new THREE.Object3D();
    this.weaponMount.position.set(0, AIM_HEIGHT_OFFSET, 0.6);
    this.group.add(this.weaponMount);

    this.state = {
      isMoving: false,
    };
  }

  async init({ modelPath = 'assets/models/player.glb' } = {}) {
    this.scene.add(this.group);

    try {
      const asset = await this.assetManager.loadGLTF(modelPath, {
        cacheKey: 'player',
        center: true,
        centerAxis: 'y',
      });

      this.model = asset.scene;
      this.model.name = 'PlayerModel';
      this.group.add(this.model);

      if (asset.animations && asset.animations.length > 0) {
        this.mixer = new THREE.AnimationMixer(this.model);
        asset.animations.forEach((clip) => {
          const name = clip.name.toLowerCase();
          if (name.includes('idle')) this.actions.idle = this.mixer.clipAction(clip);
          if (name.includes('run') || name.includes('walk')) this.actions.run = this.mixer.clipAction(clip);
          if (name.includes('shoot') || name.includes('fire')) this.actions.shoot = this.mixer.clipAction(clip);
        });

        if (!this.actions.idle && asset.animations.length > 0) {
          this.actions.idle = this.mixer.clipAction(asset.animations[0]);
        }

        this._playAction('idle');
      }
    } catch (error) {
      console.warn(
        'Impossible de charger le modèle du joueur. Un avatar holographique temporaire sera utilisé.',
        error,
      );
      this.model = this._createFallbackModel();
      this.group.add(this.model);
    }
  }

  update(delta, context = {}) {
    if (context.movementLocked) {
      this.velocity.x = 0;
      this.velocity.z = 0;
      this.state.isMoving = false;
    } else {
      this._updateMovement(delta);
    }

    this._updateAim(context.aimPoint);
    this._updateAnimation(delta);
  }

  _updateMovement(delta) {
    const axis = this.input.getAxis();
    this.direction.set(axis.x, 0, axis.z);

    if (this.direction.lengthSq() > 0) {
      this.direction.normalize();
      this.velocity.x += this.direction.x * this.acceleration * delta;
      this.velocity.z += this.direction.z * this.acceleration * delta;
      this.state.isMoving = true;
    } else {
      this.state.isMoving = this.velocity.lengthSq() > 0.0001;
    }

    const speed = this.velocity.length();
    const maxSpeed = this.speed;
    if (speed > maxSpeed) {
      this.velocity.multiplyScalar(maxSpeed / speed);
    }

    const dragFactor = Math.max(1 - this.drag * delta, 0);
    this.velocity.x *= dragFactor;
    this.velocity.z *= dragFactor;

    this.group.position.addScaledVector(this.velocity, delta);

    const elevationTarget = Math.max(0, this.group.position.y);
    this.group.position.y = THREE.MathUtils.lerp(this.group.position.y, elevationTarget, 0.2);
  }

  _updateAim(aimPoint) {
    if (!aimPoint) {
      return;
    }

    this.aimTarget.copy(aimPoint);
    this.aimTarget.y += AIM_HEIGHT_OFFSET * 0.5;

    this.lookDirection.subVectors(aimPoint, this.group.position);
    this.lookDirection.y = 0;

    if (this.lookDirection.lengthSq() < 0.0001) {
      return;
    }

    this.lookDirection.normalize();
    this.targetQuaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.lookDirection);
    this.group.quaternion.slerp(this.targetQuaternion, 0.18);
  }

  _updateAnimation(delta) {
    if (this.mixer) {
      this.mixer.update(delta);

      if (this.state.isMoving) {
        this._playAction('run');
      } else {
        this._playAction('idle');
      }
    } else if (this.model) {
      this.model.rotation.y += delta * 0.35;
      const pulsation = 1 + Math.sin(performance.now() * 0.002) * 0.05;
      this.model.scale.setScalar(0.95 * pulsation);
    }
  }

  _playAction(actionName) {
    if (!this.actions[actionName]) {
      return;
    }

    if (this.currentAction === this.actions[actionName]) {
      return;
    }

    const nextAction = this.actions[actionName];
    nextAction.reset();
    nextAction.fadeIn(0.16);
    nextAction.play();

    if (this.currentAction) {
      this.currentAction.fadeOut(0.18);
    }

    this.currentAction = nextAction;
  }

  _createFallbackModel() {
    const root = new THREE.Group();

    const bodyMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x8e9dff,
      emissive: 0x4c6dff,
      emissiveIntensity: 0.9,
      roughness: 0.18,
      metalness: 0.65,
      transmission: 0.45,
      thickness: 0.6,
      opacity: 0.92,
      transparent: true,
      clearcoat: 0.6,
      clearcoatRoughness: 0.15,
    });

    const profile = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.4, 0.0),
      new THREE.Vector2(0.65, 0.4),
      new THREE.Vector2(0.52, 1.2),
      new THREE.Vector2(0.4, 1.8),
      new THREE.Vector2(0.32, 2.4),
      new THREE.Vector2(0.15, 3.1),
      new THREE.Vector2(0.05, 3.6),
    ];

    const bodyGeometry = new THREE.LatheGeometry(profile, 48);
    bodyGeometry.translate(0, 0, 0);
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    root.add(body);

    const haloGeometry = new THREE.TorusGeometry(0.9, 0.05, 24, 64);
    const haloMaterial = new THREE.MeshBasicMaterial({
      color: 0xaed2ff,
      transparent: true,
      opacity: 0.65,
    });
    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    halo.position.y = 3.8;
    halo.rotation.x = Math.PI / 2;
    root.add(halo);

    const accentMaterial = new THREE.MeshStandardMaterial({
      color: 0xff8abf,
      emissive: 0xff3ea5,
      emissiveIntensity: 1.4,
      roughness: 0.3,
      metalness: 0.5,
    });
    const accentGeometry = new THREE.SphereGeometry(0.35, 32, 32);
    const accent = new THREE.Mesh(accentGeometry, accentMaterial);
    accent.position.set(0, 2.25, 0.55);
    root.add(accent);

    const glow = new THREE.PointLight(0x6686ff, 0.9, 18, 2.2);
    glow.position.set(0, 2.2, 0.35);
    root.add(glow);

    root.scale.setScalar(0.6);
    root.position.y = 0;

    return root;
  }
}
