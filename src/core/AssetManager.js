import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

export class AssetManager {
  constructor(loadingManager = new THREE.LoadingManager()) {
    this.manager = loadingManager;

    this.gltfLoader = new GLTFLoader(this.manager);
    this.dracoLoader = new DRACOLoader(this.manager);
    this.dracoLoader.setDecoderConfig({ type: 'js' });
    this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    this.gltfLoader.setDRACOLoader(this.dracoLoader);

    this.textureLoader = new THREE.TextureLoader(this.manager);

    this.cache = new Map();
  }

  async loadGLTF(path, options = {}) {
    const cacheKey = this._buildCacheKey('gltf', path, options.cacheKey);

    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      return {
        scene: clone(cached.scene),
        animations: cached.animations,
        userData: cached.userData,
      };
    }

    const asset = await this.gltfLoader.loadAsync(path);

    if (options.center && asset.scene) {
      this._centerGLTF(asset.scene, options.centerAxis ?? 'y');
    }

    if (options.castShadow ?? true) {
      asset.scene?.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            child.material.side = THREE.FrontSide;
          }
        }
      });
    }

    const payload = {
      scene: asset.scene,
      animations: asset.animations ?? [],
      userData: asset.userData ?? {},
    };

    this.cache.set(cacheKey, payload);

    return {
      scene: clone(asset.scene),
      animations: asset.animations ?? [],
      userData: asset.userData ?? {},
    };
  }

  async loadTexture(path, options = {}) {
    const cacheKey = this._buildCacheKey('texture', path, options.cacheKey);

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const texture = await this.textureLoader.loadAsync(path);

    if (options.encoding === 'srgb') {
      texture.encoding = THREE.sRGBEncoding;
    }

    if (options.wrap === 'repeat') {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    }

    this.cache.set(cacheKey, texture);

    return texture;
  }

  clearCache() {
    this.cache.clear();
  }

  dispose() {
    this.clearCache();
    this.dracoLoader.dispose();
  }

  _centerGLTF(root, axis = 'y') {
    const box = new THREE.Box3().setFromObject(root);
    const center = new THREE.Vector3();
    box.getCenter(center);

    switch (axis) {
      case 'xyz':
        root.position.sub(center);
        break;
      case 'xy':
        root.position.x -= center.x;
        root.position.y -= center.y;
        break;
      case 'xz':
        root.position.x -= center.x;
        root.position.z -= center.z;
        break;
      case 'yz':
        root.position.y -= center.y;
        root.position.z -= center.z;
        break;
      case 'x':
        root.position.x -= center.x;
        break;
      case 'y':
        root.position.y -= center.y;
        break;
      case 'z':
        root.position.z -= center.z;
        break;
      default:
        break;
    }
  }

  _buildCacheKey(type, path, customKey) {
    return `${type}:${path}${customKey ? `:${customKey}` : ''}`;
  }
}
