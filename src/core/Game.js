import * as THREE from 'three';
import { AssetManager } from './AssetManager.js';
import { InputManager } from './InputManager.js';
import { Player } from '../entities/Player.js';
import { EnemyManager } from '../systems/EnemyManager.js';
import { ProjectileSystem } from '../systems/ProjectileSystem.js';
import { HUDController } from '../ui/HUDController.js';
import { FloatingTextManager } from '../ui/FloatingTextManager.js';

const DEFAULT_CAMERA_HEIGHT = 28;
const DEFAULT_CAMERA_TILT = 18;
const CAMERA_LOOK_HEIGHT = 2.4;
const CAMERA_POSITION_SMOOTHNESS = 6.2;
const CAMERA_LOOK_SMOOTHNESS = 8.5;

export class Game {
  constructor(options = {}) {
    const { container } = options;

    if (!container) {
      throw new Error('Game nécessite un conteneur HTML valide.');
    }

    this.container = container;
    this.canvasParent = container;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x06070d);
    this.scene.fog = new THREE.FogExp2(0x06070d, 0.035);

    this.clock = new THREE.Clock();
    this.isRunning = false;
    this.shouldRender = true;

    this.renderer = null;
    this.camera = null;
    this.world = {
      ground: null,
      environment: null,
    };

    this.loadingManager = new THREE.LoadingManager();
    this.assetManager = new AssetManager(this.loadingManager);
    this.inputManager = new InputManager();
    this.player = null;
    this.enemyManager = null;
    this.projectileSystem = null;
    this.hud = new HUDController();
    this.floatingTextManager = new FloatingTextManager();

    this.score = 0;
    this.isGameOver = false;
    this.elapsedTime = 0;
    this.playerStats = {
      maxHealth: 140,
      health: 140,
      armor: 0,
    };

    this.weaponDefinitions = {
      pistol: {
        id: 'pistol',
        name: 'Pistolet',
        fireRate: 5.5,
        damage: 22,
        projectileSpeed: 62,
        spread: 0.012,
        color: 0xffe5a0,
        maxDistance: 70,
        ammo: Infinity,
      },
    };
    this.currentWeapon = this.weaponDefinitions.pistol;
    this.weaponCooldown = 0;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.aimPoint = new THREE.Vector3(0, 0, 0);
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.cameraOffset = new THREE.Vector3(0, DEFAULT_CAMERA_HEIGHT, DEFAULT_CAMERA_TILT);
    this.cameraDesiredPosition = new THREE.Vector3();
    this.cameraCurrentPosition = new THREE.Vector3();
    this.cameraDesiredLookAt = new THREE.Vector3();
    this.cameraCurrentLookAt = new THREE.Vector3(0, CAMERA_LOOK_HEIGHT, 0);

    this.tmpVector = new THREE.Vector3();
    this.tmpVectorAlt = new THREE.Vector3();
    this.muzzleWorldPosition = new THREE.Vector3();
    this.shotDirection = new THREE.Vector3();
    this.upVector = new THREE.Vector3(0, 1, 0);
    this.spreadQuaternion = new THREE.Quaternion();

    this._boundAnimate = this._animate.bind(this);
    this.loadingManager.onStart = () => {
      document.body.style.cursor = 'progress';
    };
    this.loadingManager.onLoad = () => {
      document.body.style.cursor = 'default';
    };
    this.loadingManager.onError = (url) => {
      console.warn(`Ressource manquante ou corrompue : ${url}`);
    };

    this.onResize = this.onResize.bind(this);
  }

  async init() {
    this._setupRenderer();
    this._setupCamera();
    this._setupLights();
    this._setupGround();
    await this._setupPlayer();
    this._setupSystems();
    this._snapCameraToPlayer();
    this._refreshHUD();

    window.addEventListener('resize', this.onResize);
    this.onResize();
  }

  start() {
    if (this.isRunning && !this.isGameOver) {
      return;
    }

    this._resetGameState();
    this.clock.start();

    if (!this.isRunning) {
      this.isRunning = true;
      this.renderer.setAnimationLoop(this._boundAnimate);
    }
  }

  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.renderer.setAnimationLoop(null);
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this.onResize);

    if (this.inputManager) {
      this.inputManager.destroy();
    }

    if (this.assetManager) {
      this.assetManager.dispose();
    }

    this.enemyManager?.reset();
    this.projectileSystem?.reset();
    this.floatingTextManager?.clear();

    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement.parentElement) {
        this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
      }
      this.renderer.forceContextLoss();
      this.renderer.domElement = null;
    }

    this.scene.traverse((child) => {
      if (!child.isMesh) return;
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => this._disposeMaterial(material));
      } else if (child.material) {
        this._disposeMaterial(child.material);
      }
    });
  }

  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      precision: 'highp',
    });

    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.renderer.domElement.id = 'game-canvas';
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.inset = '0';

    this.canvasParent.prepend(this.renderer.domElement);
  }

  _setupCamera() {
    const aspect = this._getAspectRatio();
    this.camera = new THREE.PerspectiveCamera(52, aspect, 0.1, 1000);
    this.camera.position.set(0, DEFAULT_CAMERA_HEIGHT, DEFAULT_CAMERA_TILT);
    this.camera.lookAt(new THREE.Vector3(0, 0, 0));

    this.scene.add(this.camera);
  }

  _setupLights() {
    const ambientLight = new THREE.AmbientLight(0x465a78, 0.45);
    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0x9f8bff, 1.0);
    keyLight.position.set(16, 38, 22);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 12;
    keyLight.shadow.camera.far = 120;
    keyLight.shadow.camera.left = -60;
    keyLight.shadow.camera.right = 60;
    keyLight.shadow.camera.top = 60;
    keyLight.shadow.camera.bottom = -60;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x4de0ff, 0.45);
    rimLight.position.set(-20, 26, -24);
    this.scene.add(rimLight);

    const fillLight = new THREE.PointLight(0xff7b7b, 0.8, 120, 2);
    fillLight.position.set(10, 8, 10);
    this.scene.add(fillLight);
  }

  _setupGround() {
    const groundGeometry = new THREE.PlaneGeometry(200, 200, 64, 64);
    groundGeometry.rotateX(-Math.PI / 2);

    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x141722,
      roughness: 0.85,
      metalness: 0.1,
      emissive: new THREE.Color(0x1d2237),
      emissiveIntensity: 0.15,
    });

    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.receiveShadow = true;

    const detailMaterial = new THREE.MeshStandardMaterial({
      color: 0x1c2232,
      roughness: 0.6,
      metalness: 0.4,
      emissive: new THREE.Color(0x0c101b),
      emissiveIntensity: 0.35,
    });

    const detailGeometry = new THREE.CircleGeometry(18, 64);
    detailGeometry.rotateX(-Math.PI / 2);
    const detail = new THREE.Mesh(detailGeometry, detailMaterial);
    detail.castShadow = false;
    detail.receiveShadow = true;

    const group = new THREE.Group();
    group.add(ground);
    group.add(detail);

    this.scene.add(group);
    this.world.ground = group;
  }

  async _setupPlayer() {
    this.player = new Player({
      scene: this.scene,
      assetManager: this.assetManager,
      input: this.inputManager,
    });

    await this.player.init();
  }

  _setupSystems() {
    this.projectileSystem = new ProjectileSystem({ scene: this.scene });
    this.enemyManager = new EnemyManager({
      scene: this.scene,
      assetManager: this.assetManager,
    });
  }

  _resetGameState() {
    this.score = 0;
    this.isGameOver = false;
    this.elapsedTime = 0;
    this.weaponCooldown = 0;

    this.currentWeapon = this.weaponDefinitions.pistol;
    this.playerStats.health = this.playerStats.maxHealth;

    if (this.player) {
      this.player.group.position.set(0, 0, 0);
      this.player.velocity.set(0, 0, 0);
    }

    this.enemyManager?.reset();
    this.projectileSystem?.reset();
    this.floatingTextManager?.clear();

    this._refreshHUD();
    this._snapCameraToPlayer();
  }

  _animate() {
    if (!this.shouldRender) {
      return;
    }

    const delta = this.clock.getDelta();
    this.update(delta);
    this.render();
  }

  update(delta) {
    this.elapsedTime += delta;
    this._updateAimPoint();

    if (this.player) {
      this.player.update(delta, {
        aimPoint: this.aimPoint,
        movementLocked: this.isGameOver,
      });
    }

    if (!this.isGameOver) {
      this._handleWeapons(delta);
    }

    if (this.enemyManager) {
      this.enemyManager.update(delta, {
        playerPosition: this.player?.group.position,
        onPlayerDamaged: this.isGameOver
          ? undefined
          : (damage, enemy) => this._handlePlayerDamage(damage, enemy),
      });
    }

    if (this.projectileSystem) {
      this.projectileSystem.update(delta, this.enemyManager, {
        onEnemyHit: (impact) => this._handleEnemyHit(impact),
      });
    }

    this._updateCamera(delta);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    const aspect = this._getAspectRatio();
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    const { innerWidth, innerHeight } = window;
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  _getAspectRatio() {
    return window.innerWidth / window.innerHeight;
  }

  _updateAimPoint() {
    if (!this.player) {
      return;
    }

    this.pointer.set(
      this.inputManager.mouse.normalizedX,
      this.inputManager.mouse.normalizedY,
    );

    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.raycaster.ray.intersectPlane(this.groundPlane, this.tmpVector)) {
      this.aimPoint.copy(this.tmpVector);
    }
  }

  _updateCamera(delta) {
    if (!this.player) {
      return;
    }

    const playerPosition = this.player.group.position;

    this.cameraDesiredPosition.copy(playerPosition).add(this.cameraOffset);
    this.cameraCurrentPosition.lerp(
      this.cameraDesiredPosition,
      1 - Math.exp(-delta * CAMERA_POSITION_SMOOTHNESS),
    );
    this.camera.position.copy(this.cameraCurrentPosition);

    this.cameraDesiredLookAt.set(
      playerPosition.x,
      playerPosition.y + CAMERA_LOOK_HEIGHT,
      playerPosition.z,
    );

    this.cameraCurrentLookAt.lerp(
      this.cameraDesiredLookAt,
      1 - Math.exp(-delta * CAMERA_LOOK_SMOOTHNESS),
    );
    this.camera.lookAt(this.cameraCurrentLookAt);
  }

  _snapCameraToPlayer() {
    if (!this.player) {
      return;
    }

    const playerPosition = this.player.group.position;
    this.cameraCurrentPosition.copy(playerPosition).add(this.cameraOffset);
    this.camera.position.copy(this.cameraCurrentPosition);

    this.cameraCurrentLookAt.set(
      playerPosition.x,
      playerPosition.y + CAMERA_LOOK_HEIGHT,
      playerPosition.z,
    );
    this.camera.lookAt(this.cameraCurrentLookAt);
  }

  _refreshHUD() {
    this.hud.setScore(this.score);
    this.hud.setHealth(this.playerStats.health, this.playerStats.maxHealth);
    this.hud.setWeapon({
      name: this.currentWeapon.name,
      ammoDisplay: this._getAmmoDisplay(this.currentWeapon),
    });
  }

  _getAmmoDisplay(weapon) {
    if (!weapon) {
      return '—';
    }

    if (weapon.ammo === Infinity) {
      return '∞';
    }

    return `${weapon.ammo}`;
  }

  _handleWeapons(delta) {
    if (!this.currentWeapon || !this.projectileSystem) {
      return;
    }

    this.weaponCooldown = Math.max(0, this.weaponCooldown - delta);

    if (this.inputManager.isShootingPrimary() && this.weaponCooldown <= 0) {
      this._fireCurrentWeapon();
    }
  }

  _fireCurrentWeapon() {
    if (!this.player || !this.currentWeapon) {
      return;
    }

    const weapon = this.currentWeapon;
    this.player.weaponMount.getWorldPosition(this.muzzleWorldPosition);

    this.shotDirection.subVectors(this.aimPoint, this.muzzleWorldPosition);
    this.shotDirection.y = 0;

    if (this.shotDirection.lengthSq() < 0.0001) {
      this.player.group.getWorldDirection(this.shotDirection);
      this.shotDirection.y = 0;
    }

    if (this.shotDirection.lengthSq() < 0.0001) {
      this.shotDirection.set(0, 0, 1);
    }

    this.shotDirection.normalize();

    if (weapon.spread && weapon.spread > 0) {
      const spreadOffset = THREE.MathUtils.randFloatSpread(weapon.spread);
      this.spreadQuaternion.setFromAxisAngle(this.upVector, spreadOffset);
      this.shotDirection.applyQuaternion(this.spreadQuaternion).normalize();
    }

    this.projectileSystem.spawnProjectile({
      position: this.muzzleWorldPosition,
      direction: this.shotDirection,
      speed: weapon.projectileSpeed,
      damage: weapon.damage,
      maxDistance: weapon.maxDistance,
      color: weapon.color,
    });

    this.weaponCooldown = 1 / weapon.fireRate;

    if (weapon.ammo !== Infinity) {
      weapon.ammo = Math.max(0, weapon.ammo - 1);
      this.hud.setWeapon({
        name: weapon.name,
        ammoDisplay: this._getAmmoDisplay(weapon),
      });
    }
  }

  _handleEnemyHit(impact) {
    if (!impact?.enemy) {
      return;
    }

    const { enemy, wasFatal, reward, damage } = impact;

    const impactPosition = this.tmpVector.copy(enemy.group.position);
    impactPosition.y += enemy.height * 0.75;

    const text = wasFatal ? `+${reward}` : `-${Math.round(damage)}`;
    const color = wasFatal ? '#7dffc8' : '#ffe08a';

    this.floatingTextManager.spawnFromWorldPosition(impactPosition, this.camera, {
      text,
      color,
    });

    if (wasFatal && reward > 0) {
      this.score += reward;
      this.hud.setScore(this.score);
    }
  }

  _handlePlayerDamage(damage, enemy) {
    if (this.isGameOver) {
      return;
    }

    const mitigatedDamage = Math.max(1, damage - this.playerStats.armor);
    this.playerStats.health = Math.max(0, this.playerStats.health - mitigatedDamage);
    this.hud.setHealth(this.playerStats.health, this.playerStats.maxHealth);

    const damagePosition = this.tmpVectorAlt.copy(this.player.group.position);
    damagePosition.y += 2.2;
    this.floatingTextManager.spawnFromWorldPosition(damagePosition, this.camera, {
      text: `-${Math.round(mitigatedDamage)}`,
      color: '#ff5a85',
    });

    if (enemy) {
      this._addHitHighlight(enemy);
    }

    if (this.playerStats.health <= 0) {
      this._onPlayerDeath();
    }
  }

  _addHitHighlight(enemy) {
    enemy.group.traverse((child) => {
      if (child.isMesh && child.material && 'emissiveIntensity' in child.material) {
        const initialIntensity = child.material.emissiveIntensity;
        child.material.emissiveIntensity = Math.min(initialIntensity + 0.6, 2.5);
        setTimeout(() => {
          child.material.emissiveIntensity = initialIntensity;
        }, 120);
      }
    });
  }

  _onPlayerDeath() {
    if (this.isGameOver) {
      return;
    }

    this.isGameOver = true;
    this.projectileSystem?.reset();
    this.hud.setHealth(0, this.playerStats.maxHealth);

    const event = new CustomEvent('game:over', {
      detail: {
        score: this.score,
        wavesCleared: Math.max(0, (this.enemyManager?.wave ?? 1) - 1),
        timeSurvived: this.elapsedTime,
      },
    });

    window.dispatchEvent(event);
  }

  _disposeMaterial(material) {
    if (!material) return;
    if (material.map) material.map.dispose();
    if (material.lightMap) material.lightMap.dispose();
    if (material.aoMap) material.aoMap.dispose();
    if (material.emissiveMap) material.emissiveMap.dispose();
    if (material.bumpMap) material.bumpMap.dispose();
    if (material.normalMap) material.normalMap.dispose();
    if (material.displacementMap) material.displacementMap.dispose();
    if (material.roughnessMap) material.roughnessMap.dispose();
    if (material.metalnessMap) material.metalnessMap.dispose();
    if (material.alphaMap) material.alphaMap.dispose();
    if (material.envMap) material.envMap.dispose();
    material.dispose();
  }
}
