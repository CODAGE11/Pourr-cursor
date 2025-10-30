const MOVEMENT_KEYS = {
  KeyW: 'forward',
  KeyS: 'backward',
  KeyA: 'left',
  KeyD: 'right',
  ArrowUp: 'forward',
  ArrowDown: 'backward',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

export class InputManager {
  constructor() {
    this.movementState = {
      forward: false,
      backward: false,
      left: false,
      right: false,
    };

    this.mouse = {
      x: 0,
      y: 0,
      normalizedX: 0,
      normalizedY: 0,
      buttons: {
        left: false,
        right: false,
      },
      wheelDeltaY: 0,
    };

    this.listeners = [];

    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._handleKeyUp = this._handleKeyUp.bind(this);
    this._handlePointerMove = this._handlePointerMove.bind(this);
    this._handlePointerDown = this._handlePointerDown.bind(this);
    this._handlePointerUp = this._handlePointerUp.bind(this);
    this._handleWheel = this._handleWheel.bind(this);

    this._attachEvents();
  }

  destroy() {
    window.removeEventListener('keydown', this._handleKeyDown);
    window.removeEventListener('keyup', this._handleKeyUp);
    window.removeEventListener('pointermove', this._handlePointerMove);
    window.removeEventListener('pointerdown', this._handlePointerDown);
    window.removeEventListener('pointerup', this._handlePointerUp);
    window.removeEventListener('wheel', this._handleWheel);

    this.listeners = [];
  }

  getAxis() {
    const x = (this.movementState.right ? 1 : 0) - (this.movementState.left ? 1 : 0);
    const z = (this.movementState.forward ? 1 : 0) - (this.movementState.backward ? 1 : 0);
    return { x, z };
  }

  isShootingPrimary() {
    return this.mouse.buttons.left;
  }

  isShootingSecondary() {
    return this.mouse.buttons.right;
  }

  addListener(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    }
  }

  clearWheelDelta() {
    this.mouse.wheelDeltaY = 0;
  }

  _attachEvents() {
    window.addEventListener('keydown', this._handleKeyDown);
    window.addEventListener('keyup', this._handleKeyUp);
    window.addEventListener('pointermove', this._handlePointerMove);
    window.addEventListener('pointerdown', this._handlePointerDown);
    window.addEventListener('pointerup', this._handlePointerUp);
    window.addEventListener('wheel', this._handleWheel, { passive: true });
  }

  _handleKeyDown(event) {
    const action = MOVEMENT_KEYS[event.code];
    if (action) {
      this.movementState[action] = true;
    }

    this._notify({ type: 'keydown', event });
  }

  _handleKeyUp(event) {
    const action = MOVEMENT_KEYS[event.code];
    if (action) {
      this.movementState[action] = false;
    }

    this._notify({ type: 'keyup', event });
  }

  _handlePointerMove(event) {
    this.mouse.x = event.clientX;
    this.mouse.y = event.clientY;
    this.mouse.normalizedX = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.normalizedY = -(event.clientY / window.innerHeight) * 2 + 1;

    this._notify({ type: 'pointermove', event });
  }

  _handlePointerDown(event) {
    if (event.button === 0) {
      this.mouse.buttons.left = true;
    }
    if (event.button === 2) {
      this.mouse.buttons.right = true;
    }

    this._notify({ type: 'pointerdown', event });
  }

  _handlePointerUp(event) {
    if (event.button === 0) {
      this.mouse.buttons.left = false;
    }
    if (event.button === 2) {
      this.mouse.buttons.right = false;
    }

    this._notify({ type: 'pointerup', event });
  }

  _handleWheel(event) {
    this.mouse.wheelDeltaY = event.deltaY;
    this._notify({ type: 'wheel', event });
  }

  _notify(payload) {
    this.listeners.forEach((listener) => listener(payload));
  }
}
