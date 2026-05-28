const DRIVING_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "KeyA",
  "KeyD",
  "KeyW",
  "KeyS",
  "KeyQ",
  "KeyE",
  "KeyC",
  "KeyG",
  "KeyM",
  "KeyO",
  "KeyT",
  "KeyY",
  "Space",
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "F3",
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
]);

function isEditableTarget(target) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export class InputController {
  constructor(target = window) {
    this.target = target;
    this.keys = new Set();
    this.touchControls = {
      left: false,
      right: false,
      throttle: false,
      brake: false,
      handbrake: false,
    };
    this.touchControlCounts = new Map();
    this.touchPointers = new Map();
    this.restartQueued = false;
    this.cameraModeQueued = false;
    this.cameraViewQueued = null;
    this.mapToggleQueued = false;
    this.devPanelToggleQueued = false;
    this.interactQueued = false;
    this.garageMenuQueued = false;
    this.noClipToggleQueued = false;
    this.remodelToggleQueued = false;
    this.cameraDragDelta = 0;
    this.cameraPitchDelta = 0;
    this.isCameraDragging = false;
    this.lastPointerX = 0;
    this.lastPointerY = 0;
    this.hasPointerPosition = false;
    this.pointerLocked = false;
    this.shouldStartCameraDrag = null;
    this.shouldRequestPointerLock = null;
    this.shouldUsePointerLook = null;

    window.addEventListener("keydown", (event) => this.handleKeyDown(event));
    window.addEventListener("keyup", (event) => this.handleKeyUp(event));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.clearTouchControls();
      this.hasPointerPosition = false;
    });
    this.target.addEventListener("pointerdown", (event) => this.handlePointerDown(event));
    window.addEventListener("pointermove", (event) => this.handlePointerMove(event));
    window.addEventListener("pointerup", () => this.handlePointerUp());
    document.addEventListener("pointerlockchange", () => {
      this.pointerLocked = document.pointerLockElement === this.target;
      this.isCameraDragging = false;
    });
    this.target.addEventListener("contextmenu", (event) => event.preventDefault());
    this.bindTouchControls(document);
  }

  handleKeyDown(event) {
    if (isEditableTarget(event.target)) {
      return;
    }

    if (DRIVING_KEYS.has(event.code)) {
      event.preventDefault();
    }

    if (event.repeat) {
      this.keys.add(event.code);
      return;
    }

    if (event.code === "KeyR") {
      this.restartQueued = true;
    }
    if (event.code === "KeyE") {
      this.interactQueued = true;
    }
    if (event.code === "KeyC") {
      this.cameraModeQueued = true;
    }
    if (/^Digit[1-5]$/.test(event.code)) {
      this.cameraViewQueued = Number(event.code.slice(-1));
    }
    if (event.code === "KeyM") {
      this.mapToggleQueued = true;
    }
    if (event.code === "KeyT") {
      this.noClipToggleQueued = true;
    }
    if (event.code === "KeyY") {
      this.remodelToggleQueued = true;
    }
    if (event.code === "KeyG") {
      this.garageMenuQueued = true;
    }
    if (event.code === "KeyO" || event.code === "F3") {
      this.devPanelToggleQueued = true;
    }

    this.keys.add(event.code);
  }

  handleKeyUp(event) {
    if (isEditableTarget(event.target)) {
      this.keys.delete(event.code);
      return;
    }

    if (DRIVING_KEYS.has(event.code)) {
      event.preventDefault();
    }

    this.keys.delete(event.code);
  }

  bindTouchControls(root) {
    for (const button of root.querySelectorAll("[data-touch-control]")) {
      const control = button.dataset.touchControl;
      button.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
          return;
        }

        event.preventDefault();
        button.setPointerCapture?.(event.pointerId);
        this.touchPointers.set(event.pointerId, { control, button });
        this.setTouchControl(control, true);
      });

      const release = (event) => {
        const active = this.touchPointers.get(event.pointerId);
        if (!active || active.button !== button) {
          return;
        }

        this.touchPointers.delete(event.pointerId);
        this.setTouchControl(active.control, false);
      };

      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("lostpointercapture", release);
    }

    for (const button of root.querySelectorAll("[data-touch-action]")) {
      button.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
          return;
        }

        event.preventDefault();
        this.queueTouchAction(button.dataset.touchAction);
        button.classList.add("is-active");
        window.setTimeout(() => button.classList.remove("is-active"), 130);
      });
    }
  }

  setTouchControl(control, active) {
    if (!Object.prototype.hasOwnProperty.call(this.touchControls, control)) {
      return;
    }

    const count = this.touchControlCounts.get(control) ?? 0;
    const nextCount = active ? count + 1 : Math.max(0, count - 1);
    this.touchControlCounts.set(control, nextCount);
    this.touchControls[control] = nextCount > 0;
    for (const button of document.querySelectorAll(`[data-touch-control="${control}"]`)) {
      button.classList.toggle("is-active", this.touchControls[control]);
    }
  }

  clearTouchControls() {
    this.touchPointers.clear();
    this.touchControlCounts.clear();
    for (const control of Object.keys(this.touchControls)) {
      this.touchControls[control] = false;
    }
    for (const button of document.querySelectorAll("[data-touch-control]")) {
      button.classList.remove("is-active");
    }
  }

  queueTouchAction(action) {
    if (action === "interact") {
      this.interactQueued = true;
    }
    if (action === "garage") {
      this.garageMenuQueued = true;
    }
    if (action === "camera") {
      this.cameraModeQueued = true;
    }
    if (action === "restart") {
      this.restartQueued = true;
    }
    if (action === "map") {
      this.mapToggleQueued = true;
    }
  }

  handlePointerDown(event) {
    if (event.button !== 0 && event.button !== 2) {
      return;
    }

    if (this.shouldStartCameraDrag?.(event) === false) {
      return;
    }

    this.isCameraDragging = true;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.hasPointerPosition = true;
    if (this.shouldRequestPointerLock?.(event) !== false) {
      try {
        const lockRequest = this.target.requestPointerLock?.();
        lockRequest?.catch?.(() => {
          this.pointerLocked = false;
        });
      } catch {
        this.pointerLocked = false;
      }
    }
    if (document.pointerLockElement !== this.target) {
      try {
        this.target.setPointerCapture?.(event.pointerId);
      } catch {
        // Some embedded browsers reject synthetic pointer capture; dragging still works.
      }
    }
  }

  handlePointerMove(event) {
    if (this.pointerLocked) {
      this.cameraDragDelta -= event.movementX ?? 0;
      this.cameraPitchDelta += event.movementY ?? 0;
      return;
    }

    if (this.shouldUsePointerLook?.(event) === true) {
      const movementX = this.hasPointerPosition
        ? event.clientX - this.lastPointerX
        : (event.movementX ?? 0);
      const movementY = this.hasPointerPosition
        ? event.clientY - this.lastPointerY
        : (event.movementY ?? 0);
      this.cameraDragDelta -= movementX;
      this.cameraPitchDelta += movementY;
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
      this.hasPointerPosition = true;
      return;
    }

    if (!this.isCameraDragging) {
      return;
    }

    this.cameraDragDelta -= event.clientX - this.lastPointerX;
    this.cameraPitchDelta += event.clientY - this.lastPointerY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
  }

  handlePointerUp() {
    if (!this.pointerLocked) {
      this.isCameraDragging = false;
    }
  }

  getState() {
    const left = this.keys.has("ArrowLeft") || this.keys.has("KeyA") || this.touchControls.left;
    const right = this.keys.has("ArrowRight") || this.keys.has("KeyD") || this.touchControls.right;
    const throttle = this.keys.has("ArrowUp") || this.keys.has("KeyW") || this.touchControls.throttle;
    const footBrake = this.keys.has("ArrowDown") || this.keys.has("KeyS") || this.touchControls.brake;
    const handbrake = this.keys.has("Space") || this.touchControls.handbrake;
    const brake = footBrake || handbrake;
    const noClipUp = this.keys.has("Space");
    const noClipDown = this.keys.has("ControlLeft") || this.keys.has("ControlRight");
    const noClipBoost = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const cameraLeft = false;
    const cameraRight = false;
    const cameraDragDelta = this.cameraDragDelta;
    const cameraPitchDelta = this.cameraPitchDelta;
    this.cameraDragDelta = 0;
    this.cameraPitchDelta = 0;

    return {
      steer: Number(left) - Number(right),
      walkForward: Number(throttle) - Number(footBrake),
      walkStrafe: Number(left) - Number(right),
      noClipVertical: Number(noClipUp) - Number(noClipDown),
      noClipBoost,
      shiftHeld: noClipBoost,
      throttle,
      brake,
      footBrake,
      handbrake,
      cameraTurn: Number(cameraRight) - Number(cameraLeft),
      cameraDragDelta,
      cameraPitchDelta,
    };
  }

  releasePointerLock() {
    if (document.pointerLockElement === this.target) {
      document.exitPointerLock?.();
    }
    this.pointerLocked = false;
    this.isCameraDragging = false;
  }

  consumeRestart() {
    const queued = this.restartQueued;
    this.restartQueued = false;
    return queued;
  }

  consumeCameraModeToggle() {
    const queued = this.cameraModeQueued;
    this.cameraModeQueued = false;
    return queued;
  }

  consumeCameraViewSelection() {
    const queued = this.cameraViewQueued;
    this.cameraViewQueued = null;
    return queued;
  }

  consumeMapToggle() {
    const queued = this.mapToggleQueued;
    this.mapToggleQueued = false;
    return queued;
  }

  consumeDevPanelToggle() {
    const queued = this.devPanelToggleQueued;
    this.devPanelToggleQueued = false;
    return queued;
  }

  consumeGarageMenuToggle() {
    const queued = this.garageMenuQueued;
    this.garageMenuQueued = false;
    return queued;
  }

  consumeNoClipToggle() {
    const queued = this.noClipToggleQueued;
    this.noClipToggleQueued = false;
    return queued;
  }

  consumeRemodelToggle() {
    const queued = this.remodelToggleQueued;
    this.remodelToggleQueued = false;
    return queued;
  }

  consumeInteract() {
    const queued = this.interactQueued;
    this.interactQueued = false;
    return queued;
  }
}
