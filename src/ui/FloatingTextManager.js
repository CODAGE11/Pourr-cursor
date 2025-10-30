import * as THREE from 'three';

export class FloatingTextManager {
  constructor() {
    this.container = document.getElementById('floating-text-container');
    this.pool = [];
    this.active = new Map();
    this.tempVector = new THREE.Vector3();
  }

  spawnFromWorldPosition(worldPosition, camera, { text, color = '#ffffff', duration = 1200 }) {
    if (!this.container || !worldPosition || !camera) {
      return;
    }

    const element = this._getElement();
    element.textContent = text;
    element.style.color = color;

    this.tempVector.copy(worldPosition).project(camera);

    const x = (this.tempVector.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this.tempVector.y * 0.5 + 0.5) * window.innerHeight;

    element.style.left = `${x}px`;
    element.style.top = `${y}px`;

    element.classList.remove('floating-text');
    // Force reflow to restart animation when reusing elements.
    // eslint-disable-next-line no-unused-expressions
    element.offsetWidth;
    element.classList.add('floating-text');

    this.container.appendChild(element);

    const timeout = window.setTimeout(() => {
      this._recycleElement(element);
    }, duration);

    this.active.set(element, timeout);
  }

  clear() {
    this.active.forEach((timeout, element) => {
      window.clearTimeout(timeout);
      this._recycleElement(element);
    });
    this.active.clear();
  }

  _getElement() {
    if (this.pool.length > 0) {
      return this.pool.pop();
    }

    const div = document.createElement('div');
    return div;
  }

  _recycleElement(element) {
    if (!element) return;
    const timeout = this.active.get(element);
    if (timeout) {
      window.clearTimeout(timeout);
      this.active.delete(element);
    }
    if (element.parentElement) {
      element.parentElement.removeChild(element);
    }
    element.classList.remove('floating-text');
    this.pool.push(element);
  }
}
