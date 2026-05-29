import * as THREE from "three";
import {
  CAR_AUCTION_LISTINGS,
  CAR_PRESETS,
  DEFAULT_VEHICLE_RIG_TUNE,
  DEFAULT_SETTINGS,
  DEV_STORAGE_KEY,
  PLAYER_CAR_IDS,
  PARTS_CATALOG,
  PHYSICS_SETTING_KEYS,
  PROGRESS_VERSION,
  SETTING_DEFS,
  createStarterVehicle,
  createVehicleFromListing,
  sanitizeVehicleRigTune,
  getVehiclePreset,
} from "./config.js";
import { AudioSystem } from "./AudioSystem.js";
import { DebugOverlay } from "./DebugOverlay.js";
import { HighwayWorld } from "./HighwayWorld.js";
import { HUD } from "./HUD.js";
import { InputController } from "./Input.js";
import { PlayerCar } from "./PlayerCar.js";
import { createPlayerCarAsset } from "./PlayerCarAsset.js";
import { RemodelOverlay } from "./RemodelOverlay.js";
import { TrafficSystem } from "./TrafficSystem.js";
import { clamp, damp } from "./utils.js";

const WALKER_EYE_HEIGHT = 1.92;
const DAMAGE_INVULNERABILITY_SECONDS = 5;
const IMPACT_RECOVERY_SECONDS = 0.1;
const CAMERA_MODES = ["hood", "roof", "chaseClose", "chaseFar", "cinematic"];
const GARAGE_PSX_CAR_TARGET_ID = "psx:garage-player-car";
const REMODEL_PRESETS = {
  stripe: {
    position: { x: 0, y: 0.08, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    dimensions: { x: 0.18, y: 0.05, z: 8 },
  },
  guardrail: {
    position: { x: 0, y: 0.88, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    dimensions: { x: 0.18, y: 0.18, z: 18.8 },
  },
};
const SAVE_DEBOUNCE_MS = 1800;
const SAVE_RETRY_MS = 8000;
const LEGACY_PART_MIGRATION = {
  engine: ["air_filter_kmn", "exhaust_remus_street"],
  turbo: ["turbo_ihi_stage1", "turbo_garrett_gtx"],
  ecu: ["ecu_nightflash"],
  tires: ["tires_advan_semislick"],
  handling: ["spacers_hr_12", "coilovers_bilstein_b14", "coilovers_kw_v3"],
  brakes: ["brakes_brembo_big"],
  weight: ["seats_sparco_bucket"],
};

function clampSaveInteger(value, min, max) {
  const next = Math.floor(Number(value));
  if (!Number.isFinite(next)) {
    return min;
  }
  return Math.min(max, Math.max(min, next));
}

export class Game {
  constructor(root, options = {}) {
    this.root = root;
    this.authClient = options.authClient ?? null;
    this.session = options.session ?? null;
    this.isAdmin = this.session?.role === "admin";
    this.onSaveStatus = options.onSaveStatus ?? (() => {});
    this.progressDirty = false;
    this.progressSaveTimer = null;
    this.progressSaveInFlight = null;
    this.settings = this.loadSavedSettings();
    if (!this.isAdmin) {
      this.settings.noClip = false;
      this.settings.remodelMode = false;
      this.settings.hitboxMode = false;
    }
    this.clock = new THREE.Clock();
    this.score = 0;
    this.bestScore = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.nearMisses = 0;
    this.crashed = false;
    this.maxHits = 3;
    this.hitCount = 0;
    this.hitCooldown = 0;
    this.hitRecoveryTimer = 0;
    this.invulnerableTimer = 0;
    this.cameraShake = 0;
    this.fps = 60;
    this.cameraYawOffset = 0;
    this.cameraPitchOffset = 0;
    this.cameraInputTimer = 0;
    this.cameraLookAt = new THREE.Vector3();
    this.cameraLookAtInitialized = false;
    this.cameraMode = "hood";
    this.cameraModeIndex = 0;
    this.remodelClipboard = null;
    this.remodelUndoStack = [];
    this.vehicleRigOverrides = {};
    this.selectedRemodelPsxCarId = null;
    this.remodelPsxLineupGroup = null;
    this.mode = "garage";
    this.coins = 0;
    this.coinAccumulator = 0;
    this.basePerformance = {
      maxSpeedKmh: this.settings.maxSpeedKmh,
      handling: this.settings.handling,
      brakePower: this.settings.brakePower,
      powerMultiplier: this.settings.powerMultiplier,
      gripMultiplier: this.settings.gripMultiplier,
      weightMultiplier: this.settings.weightMultiplier,
    };
    this.upgrades = Object.fromEntries(PARTS_CATALOG.map((part) => [part.id, 0]));
    this.installedUpgrades = Object.fromEntries(PARTS_CATALOG.map((part) => [part.id, 0]));
    this.ownedVehicles = [createStarterVehicle()];
    this.activeVehicleId = this.ownedVehicles[0].id;
    this.ownedCars = new Set(this.ownedVehicles.map((vehicle) => vehicle.carId));
    this.applySavedProgress(options.progress);
    this.marketOpen = false;
    this.garageManagerOpen = false;
    this.walker = {
      position: new THREE.Vector3(-100.5, WALKER_EYE_HEIGHT, -47.8),
      yaw: Math.PI / 2,
      pitch: 0,
    };
    this.noClipRig = {
      active: false,
      position: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
    };
    this.noClipCurrentSpeedKmh = 0;
    this.audio = new AudioSystem();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      this.settings.cameraFov,
      window.innerWidth / window.innerHeight,
      0.1,
      900,
    );
    this.camera.position.set(0, 5.2, -12);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;
    this.root.appendChild(this.renderer.domElement);

    this.input = new InputController(this.renderer.domElement);
    this.world = new HighwayWorld(this.scene);
    this.player = new PlayerCar(this.scene, this.world.getStartPose());
    this.player.setCarPreset(this.getActiveVehiclePreset());
    this.garagePsxRemodelTarget = null;
    this.createGaragePsxRemodelTarget();
    this.traffic = new TrafficSystem(this.scene, this.world);
    this.debugOverlay = new DebugOverlay(this.scene, this.world);
    this.remodelOverlay = new RemodelOverlay(
      this.scene,
      this.world,
      this.camera,
      this.renderer.domElement,
      (target, state) => this.handleRemodelSelection(target, state),
    );
    this.input.shouldRequestPointerLock = (event) => {
      if (!this.settings.remodelMode) {
        return true;
      }

      return !event.shiftKey && event.target === this.renderer.domElement;
    };
    this.input.shouldStartCameraDrag = (event) => {
      if (!this.settings.remodelMode) {
        return true;
      }

      const target = event.target;
      const isUi =
        target instanceof Element &&
        target.closest(
          ".remodel-panel, .remodel-toolbox, .dev-panel, input, button, select, textarea"
        );

      return !event.shiftKey && !isUi && event.target === this.renderer.domElement;
    };
    this.input.shouldUsePointerLook = (event) => {
      if (!this.settings.remodelMode || event.shiftKey) {
        return false;
      }

      const target = event.target;
      const isUi =
        target instanceof Element &&
        target.closest(
          ".remodel-panel, .remodel-toolbox, .dev-panel, input, button, select, textarea"
        );

      return !isUi && event.target === this.renderer.domElement && !this.remodelOverlay?.isTransformDragging();
    };
    this.remodelOverlay.beforeTransform = () => this.captureSelectedRemodelUndo();
    this.renderer.domElement.addEventListener(
      "pointerdown",
      (event) => this.handleRemodelPointerDown(event),
      { capture: true },
    );
    this.hud = new HUD(
      this.settings,
      (_settings, changedKey) => this.handleSettingsChanged(changedKey),
      () => this.requestRestart(),
      (upgrade) => this.buyUpgrade(upgrade),
      (carId) => this.handleCarMarket(carId),
      () => this.closeMarket(),
      (carId) => this.selectOwnedCar(carId),
      (upgrade, delta) => this.adjustInstalledUpgrade(upgrade, delta),
      () => this.closeGarageManager(),
      () => this.saveDevSettings(),
      () => this.resetDevSettings(),
      (state) => this.updateSelectedRemodelTarget(state),
      () => this.saveRemodelMap(),
      () => this.resetSelectedRemodelTarget(),
      (preset) => this.createRemodelTarget(preset),
      () => this.deleteSelectedRemodelTarget(),
      () => this.closeRemodelEditor(),
      () => this.undoRemodel(),
      () => this.copyRemodelTarget(),
      () => this.pasteRemodelTarget(),
      (carId) => this.selectRemodelPsxCar(carId),
      (state) => this.updateSelectedPsxCarRig(state),
      () => this.saveSelectedPsxCarRig(),
    );
    this.initializeRemodelPsxCars();
    this.hud.setAdminMode(this.isAdmin);
    this.hud.setRemodelAvailable(this.settings.noClip);
    this.setRemodelMode(this.settings.remodelMode);
    this.buildRemodelPsxLineup();
    this.updateRemodelPsxLineupVisibility();
    this.setSaveStatus(this.authClient ? "pronto" : "");

    this.world.update();
    this.traffic.reset(this.settings);
    this.enterGarageMode(true);

    window.addEventListener("resize", () => this.resize());
    window.addEventListener("beforeunload", () => {
      this.flushProgressSave({ force: true, keepalive: true });
    });
  }

  start() {
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  tick() {
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 1 / 30);
    const inputState = this.input.getState();
    const interact = this.input.consumeInteract();
    const garageMenuToggle = this.input.consumeGarageMenuToggle();
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    this.hitRecoveryTimer = Math.max(0, this.hitRecoveryTimer - dt);
    this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);
    this.player.setInvulnerable(this.invulnerableTimer > 0, performance.now() * 0.001);

    if (
      interact ||
      garageMenuToggle ||
      inputState.throttle ||
      inputState.brake ||
      inputState.steer !== 0 ||
      inputState.walkForward !== 0 ||
      inputState.walkStrafe !== 0
    ) {
      this.audio.ensure();
    }

    if (this.input.consumeRestart()) {
      this.requestRestart();
    }
    if (this.input.consumeCameraModeToggle()) {
      this.setCameraMode((this.cameraModeIndex + 1) % CAMERA_MODES.length);
    }
    const cameraViewSelection = this.input.consumeCameraViewSelection();
    if (cameraViewSelection) {
      this.setCameraMode(cameraViewSelection - 1);
    }
    if (this.input.consumeMapToggle()) {
      this.hud.toggleMap();
    }
    if (this.input.consumeDevPanelToggle()) {
      if (this.isAdmin) {
        this.hud.toggleDevPanel();
      } else {
        this.hud.flashNotice("Admin", "accesso riservato");
      }
    }
    if (this.input.consumeNoClipToggle()) {
      if (this.isAdmin) {
        this.setNoClipMode(!this.settings.noClip);
      } else {
        this.hud.flashNotice("Admin", "accesso riservato");
      }
    }
    if (this.input.consumeRemodelToggle()) {
      if (this.isAdmin) {
        this.toggleRemodelShortcut();
      } else {
        this.hud.flashNotice("Admin", "accesso riservato");
      }
    }

    if (this.settings.noClip) {
      if (this.settings.remodelMode && inputState.shiftHeld) {
        this.input.releasePointerLock();
      }
      this.updateNoClip(dt, inputState);
    } else if (this.mode === "garage") {
      this.updateGarage(dt, inputState, interact, garageMenuToggle);
    } else {
      this.updateDriving(dt, inputState, interact);
    }

    this.world.update();
    if (this.mode === "driving") {
      const playerRoad = this.world.getNearestRoadInfo(this.player.position);
      this.traffic.update(dt, this.settings, playerRoad?.s ?? 0);
      if (!this.settings.noClip) {
        this.updateScoring(dt, playerRoad);
      }
    }
    if (this.settings.noClip) {
      this.updateNoClipCamera();
    } else {
      this.updateCamera(dt, inputState);
    }
    this.updateDayNight(dt);
    this.updateRemodelHover();
    this.updateHud(rawDt);
    this.audio.update(dt, {
      speedKmh: this.getPlayerSpeed() * 3.6,
      throttle: inputState.throttle,
      driving: this.mode === "driving",
    });
    this.debugOverlay.setVisible(this.settings.hitboxMode);
    this.debugOverlay.update(this.player, this.traffic, this.world);

    this.renderer.render(this.scene, this.camera);
  }

  updateNoClip(dt, inputState) {
    if (!this.noClipRig.active) {
      this.enterNoClip();
    }

    this.noClipRig.yaw += inputState.cameraDragDelta * 0.0026;
    this.noClipRig.pitch = clamp(
      this.noClipRig.pitch - inputState.cameraPitchDelta * 0.0024,
      -1.35,
      1.35,
    );

    const pitchScale = Math.cos(this.noClipRig.pitch);
    const forward = new THREE.Vector3(
      Math.sin(this.noClipRig.yaw) * pitchScale,
      Math.sin(this.noClipRig.pitch),
      Math.cos(this.noClipRig.yaw) * pitchScale,
    );
    const right = new THREE.Vector3(Math.cos(this.noClipRig.yaw), 0, -Math.sin(this.noClipRig.yaw));
    const move = new THREE.Vector3();
    move.addScaledVector(forward, inputState.walkForward);
    move.addScaledVector(right, inputState.walkStrafe);
    move.y += inputState.noClipVertical ?? 0;

    this.noClipCurrentSpeedKmh = 0;
    if (move.lengthSq() > 0.001) {
      const speedKmh = inputState.noClipBoost
        ? this.settings.noClipBoostSpeedKmh
        : this.settings.noClipSpeedKmh;
      const speed = Math.max(0, speedKmh) / 3.6;
      move.normalize().multiplyScalar(speed * dt);
      this.noClipRig.position.add(move);
      this.noClipCurrentSpeedKmh = speedKmh;
    }

    this.noClipRig.position.y = Math.max(0.45, this.noClipRig.position.y);
    this.syncPlayerToNoClip();
    this.hud.setInteraction(null);
  }

  enterNoClip() {
    this.noClipRig.active = true;
    this.noClipRig.position.copy(this.camera.position);
    if (this.mode === "garage") {
      this.noClipRig.position.copy(this.walker.position);
      this.noClipRig.yaw = this.walker.yaw;
      this.noClipRig.pitch = this.walker.pitch ?? 0;
    } else {
      this.noClipRig.yaw = this.player.yaw + this.cameraYawOffset * 0.34;
      this.noClipRig.pitch = this.cameraPitchOffset;
    }
    this.player.stop?.();
    this.syncPlayerToNoClip();
  }

  exitNoClip() {
    if (!this.noClipRig.active) {
      return;
    }

    this.noClipRig.active = false;
    if (this.mode === "garage") {
      this.walker.position.set(this.noClipRig.position.x, WALKER_EYE_HEIGHT, this.noClipRig.position.z);
      this.walker.yaw = this.noClipRig.yaw;
      this.walker.pitch = clamp(this.noClipRig.pitch, -0.68, 0.64);
      this.world.resolveWalkerCollision(this.walker.position, this.getGarageWalkColliders());
      return;
    }

    this.player.position.set(this.noClipRig.position.x, 0, this.noClipRig.position.z);
    this.player.yaw = this.noClipRig.yaw;
    this.player.stop?.();
    this.player.applyTransform?.(0, 1 / 60);
    this.cameraLookAtInitialized = false;
  }

  syncPlayerToNoClip() {
    if (this.mode === "garage") {
      this.walker.position.copy(this.noClipRig.position);
      this.walker.yaw = this.noClipRig.yaw;
      this.walker.pitch = this.noClipRig.pitch;
      return;
    }

    this.player.position.set(this.noClipRig.position.x, 0, this.noClipRig.position.z);
    this.player.yaw = this.noClipRig.yaw;
    this.player.stop?.();
    this.player.applyTransform?.(0, 1 / 60);
  }

  updateDriving(dt, inputState, interact) {
    this.player.update(dt, inputState, this.settings, this.hitRecoveryTimer > 0);
    if (!this.settings.noClip) {
      const collision = this.world.resolvePlayerCollision(this.player);
      if (collision?.hit) {
        this.registerHit(collision.source ?? "Impact");
      }
    }

    const canExitToGarage =
      this.world.isInGarageInterior(this.player.position) && this.getPlayerSpeed() < 2.5;
    this.hud.setInteraction(canExitToGarage ? "Entra nel garage" : null);
    if (interact && canExitToGarage) {
      this.enterGarageMode(false);
    }
  }

  updateGarage(dt, inputState, interact, garageMenuToggle) {
    if (this.isGaragePsxCarEditorActive()) {
      this.applyRemodelPsxPreviewCar();
    } else {
      this.player.setCarPreset(this.getActiveVehiclePreset());
    }

    if (this.marketOpen) {
      this.hud.setInteraction("Chiudi browser");
      if (interact) {
        this.closeMarket();
      }
      return;
    }

    if (this.garageManagerOpen) {
      this.hud.setInteraction("Chiudi gestione auto");
      if (interact || garageMenuToggle) {
        this.closeGarageManager();
      }
      return;
    }

    this.updateWalker(dt, inputState);

    const carDistance = this.distance2D(this.walker.position, this.world.getGarageCarPose());
    const deskDistance = this.distance2D(this.walker.position, this.world.getGarageDeskPosition());
    const nearCar = carDistance < 4.4;
    const nearDesk = deskDistance < 3.6;

    if (nearCar && garageMenuToggle) {
      this.openGarageManager();
      return;
    }

    if (nearDesk) {
      this.hud.setInteraction("Apri browser garage");
      if (interact) {
        this.openMarket();
      }
      return;
    }

    if (nearCar) {
      this.hud.setInteraction("Entra in auto / G garage");
      if (interact) {
        this.enterDrivingMode();
      }
      return;
    }

    this.hud.setInteraction(null);
  }

  updateWalker(dt, inputState) {
    this.walker.yaw += inputState.cameraDragDelta * 0.0026;
    this.walker.pitch = clamp(
      this.walker.pitch - inputState.cameraPitchDelta * 0.0024,
      -0.68,
      0.64,
    );
    const forward = new THREE.Vector3(Math.sin(this.walker.yaw), 0, Math.cos(this.walker.yaw));
    const right = new THREE.Vector3(Math.cos(this.walker.yaw), 0, -Math.sin(this.walker.yaw));
    const move = new THREE.Vector3();
    move.addScaledVector(forward, inputState.walkForward);
    move.addScaledVector(right, inputState.walkStrafe);
    if (move.lengthSq() > 0.01) {
      move.normalize().multiplyScalar(4.0 * dt);
      this.walker.position.add(move);
    }

    this.walker.position.y = WALKER_EYE_HEIGHT;
    if (!this.settings.noClip) {
      this.world.resolveWalkerCollision(this.walker.position, this.getGarageWalkColliders());
    }
  }

  getGarageWalkColliders() {
    const preset = this.player.activePreset;
    const carPose = this.world.getGarageCarPose();
    return [
      {
        x: carPose.x,
        z: carPose.z,
        halfX: preset.bodyLength * 0.5 + 0.42,
        halfZ: preset.bodyWidth * 0.5 + 0.42,
      },
    ];
  }

  updateScoring(dt, playerRoad = this.world.getNearestRoadInfo(this.player.position)) {
    const canScore = this.hitRecoveryTimer <= 0 && this.invulnerableTimer <= 0;
    if (canScore) {
      const speedMps = this.getPlayerSpeed();
      const speedKmh = speedMps * 3.6;
      const speedRatio = clamp(speedKmh / 300, 0, 1);
      this.score += speedMps * dt * (0.7 + this.combo * 0.12 + speedRatio * 0.5);
      this.coinAccumulator +=
        speedMps * dt * (0.0022 + this.combo * 0.00055) +
        speedRatio * dt * (0.035 + this.combo * 0.012);
      if (this.coinAccumulator >= 1) {
        const earned = Math.floor(this.coinAccumulator);
        this.coinAccumulator -= earned;
        this.coins += earned;
        this.markProgressDirty();
      }
    }

    this.comboTimer -= dt;
    if (this.comboTimer <= 0) {
      this.combo = 0;
    }

    for (const car of this.traffic.cars) {
      const dx = car.x - this.player.position.x;
      const dz = car.z - this.player.position.z;
      const distance = Math.hypot(dx, dz);
      const trafficHitbox = this.getTrafficHitboxProfile(car);

      const trafficCollision = !this.settings.noClip && this.intersectsTraffic(car);
      if (trafficCollision) {
        this.resolveTrafficImpact(car);
        if (this.invulnerableTimer <= 0 && this.hitCooldown <= 0) {
          this.registerHit(car.kind === "truck" ? "Truck impact" : "Traffic hit");
          return;
        }
      }

      const playerVelocity = this.player.getVelocityVector?.() ?? {
        x: this.player.getForwardVector().x * this.player.speed,
        z: this.player.getForwardVector().z * this.player.speed,
      };
      const trafficVelocity = {
        x: Math.sin(car.yaw) * car.speed,
        z: Math.cos(car.yaw) * car.speed,
      };
      const relativeSpeed = Math.hypot(
        playerVelocity.x - trafficVelocity.x,
        playerVelocity.z - trafficVelocity.z,
      );
      const nearMissDistance = 3.2 + trafficHitbox.width * 0.5;
      if (
        !this.crashed &&
        canScore &&
        car.nearMissCooldown <= 0 &&
        distance < nearMissDistance &&
        distance > 1.35 + trafficHitbox.width * 0.45 &&
        relativeSpeed > 12 &&
        this.getPlayerSpeed() > 14
      ) {
        this.registerNearMiss(car, distance);
      }

      if (canScore && playerRoad && this.getPlayerSpeed() > 14) {
        this.updateOvertakeState(car, playerRoad.s);
      }
    }
  }

  registerNearMiss(car, lateralGap) {
    const speedKmh = this.getPlayerSpeed() * 3.6;
    const danger = clamp((4.4 - lateralGap) / 2.25, 0, 1);
    this.combo = clamp(this.combo + 1, 1, 14);
    this.comboTimer = 4.8;
    this.nearMisses += 1;

    const points = Math.round((80 + speedKmh * 0.85 + danger * 180) * (1 + this.combo * 0.16));
    const coins = Math.round(2 + danger * 5 + this.combo * 0.9);
    this.score += points;
    this.coins += coins;
    this.markProgressDirty();
    this.cameraShake = Math.max(this.cameraShake, 0.18 + danger * 0.2);
    car.nearMissCooldown = 2.4;
    this.hud.flashNearMiss(points, "Near miss", coins);
    this.audio.nearMiss();
  }

  updateOvertakeState(car, playerS) {
    const trackLength = this.world.trackLength;
    const ahead = (car.s - playerS + trackLength) % trackLength;

    if (ahead > 8 && ahead < 72) {
      car.overtakeArmed = true;
      return;
    }

    if (car.overtakeArmed && ahead > trackLength - 24) {
      this.registerOvertake(car);
      car.overtakeArmed = false;
      return;
    }

    if (ahead > 130 && ahead < trackLength - 80) {
      car.overtakeArmed = false;
    }
  }

  registerOvertake(car) {
    const speedKmh = this.getPlayerSpeed() * 3.6;
    const relativeSpeed = clamp((speedKmh - car.speed * 3.6) / 120, 0, 1);
    this.combo = clamp(this.combo + 1, 1, 14);
    this.comboTimer = 4.5;

    const points = Math.round((55 + speedKmh * 0.48 + relativeSpeed * 120) * (1 + this.combo * 0.12));
    const coins = Math.round(1 + relativeSpeed * 4 + this.combo * 0.45);
    this.score += points;
    this.coins += coins;
    this.markProgressDirty();
    this.hud.flashNearMiss(points, "Sorpasso", coins);
    this.audio.coin();
  }

  resolveTrafficImpact(car) {
    const collision = this.getTrafficCollision(car);
    if (!collision) {
      return;
    }

    this.player.position.x += collision.normalX * (collision.depth + 0.08);
    this.player.position.z += collision.normalZ * (collision.depth + 0.08);
    const trafficVelocityX = Math.sin(car.yaw) * car.speed;
    const trafficVelocityZ = Math.cos(car.yaw) * car.speed;
    if (this.player.applyCollisionResponse) {
      this.player.applyCollisionResponse(
        { x: collision.normalX, z: collision.normalZ },
        {
          restitution: car.kind === "truck" ? 0.06 : 0.12,
          friction: car.kind === "truck" ? 0.18 : 0.1,
          minSeparationSpeed: car.kind === "truck" ? 0.18 : 0.28,
          surfaceVelocityX: trafficVelocityX,
          surfaceVelocityZ: trafficVelocityZ,
        },
      );
    } else if (this.player.setForwardSpeed) {
      this.player.setForwardSpeed(Math.max(0, this.player.speed * 0.72), 0.58);
    }
    this.player.yawVelocity *= 0.72;
    this.player.slip = Math.max(this.player.slip, car.kind === "truck" ? 0.34 : 0.24);
  }

  registerHit(source = "Impact") {
    if (this.hitCooldown > 0 || this.invulnerableTimer > 0) {
      return;
    }

    this.hitCount += 1;
    this.hitCooldown = 0.18;
    this.hitRecoveryTimer = IMPACT_RECOVERY_SECONDS;
    this.invulnerableTimer = DAMAGE_INVULNERABILITY_SECONDS;
    this.combo = 0;
    this.comboTimer = 0;
    this.crashed = false;
    this.cameraShake = Math.max(this.cameraShake, 0.68);
    this.audio.crash();

    const remaining = this.maxHits - this.hitCount;
    if (remaining <= 0) {
      const clearedScore = Math.floor(this.score);
      this.resetRunScore();
      this.hud.flashNotice("Score reset", `${clearedScore.toLocaleString("en-US")} wiped`);
      return;
    }

    this.hud.flashNotice(source, `${remaining} hit${remaining === 1 ? "" : "s"} left`);
  }

  crash() {
    this.registerHit("Impact");
  }

  resetRunScore() {
    if (this.updateBestScore()) {
      this.markProgressDirty({ immediate: true });
    }
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.nearMisses = 0;
    this.coinAccumulator = 0;
    this.hitCount = 0;
  }

  canRestart() {
    return this.mode === "garage" || this.getPlayerSpeed() < 0.8;
  }

  requestRestart() {
    if (!this.canRestart()) {
      this.hud.flashNotice("Restart locked", "stop the car first");
      return;
    }

    this.restart();
  }

  restart() {
    this.resetRunScore();
    this.crashed = false;
    this.hitCooldown = 0;
    this.hitRecoveryTimer = 0;
    this.invulnerableTimer = 0;
    this.player.setInvulnerable(false);
    this.cameraShake = 0;
    this.cameraYawOffset = 0;
    this.cameraPitchOffset = 0;
    this.cameraInputTimer = 0;
    this.cameraLookAtInitialized = false;
    this.setCameraMode(0);
    this.closeMarket();
    this.closeGarageManager();
    this.enterGarageMode(true);
    this.world.update();
    this.traffic.reset(this.settings);
  }

  enterGarageMode(resetCar) {
    this.mode = "garage";
    this.cameraMode = "hood";
    this.cameraPitchOffset = 0;
    this.cameraLookAtInitialized = false;
    this.crashed = false;
    this.invulnerableTimer = 0;
    this.player.setInvulnerable(false);
    this.hud.setMode("garage");
    this.hud.setMapVisible(false);
    this.world.setGarageDoorOpen(false);
    if (resetCar) {
      this.player.reset(this.world.getGarageCarPose());
    } else {
      const offset = this.localPlayerPoint(-1.6, WALKER_EYE_HEIGHT, -2.7);
      this.walker.position.set(
        offset.x,
        WALKER_EYE_HEIGHT,
        offset.z,
      );
      this.walker.yaw = this.player.yaw;
      this.walker.pitch = 0;
      this.player.stop?.();
      if (!this.player.stop) {
        this.player.speed = 0;
      }
      if (!this.settings.noClip) {
        this.world.resolveWalkerCollision(this.walker.position, this.getGarageWalkColliders());
      }
    }
    if (resetCar) {
      const pose = this.world.getGarageWalkPose();
      this.walker.position.copy(pose.position);
      this.walker.yaw = pose.yaw;
      this.walker.pitch = 0;
      if (!this.settings.noClip) {
        this.world.resolveWalkerCollision(this.walker.position, this.getGarageWalkColliders());
      }
    }
  }

  enterDrivingMode() {
    this.mode = "driving";
    this.setCameraMode(0);
    this.cameraPitchOffset = 0;
    this.cameraLookAtInitialized = false;
    this.marketOpen = false;
    this.garageManagerOpen = false;
    this.player.setInvulnerable(false);
    this.hud.setMode("driving");
    this.hud.setMarketVisible(false);
    this.hud.setGarageManagerVisible(false);
    this.hud.setInteraction(null);
    this.world.setGarageDoorOpen(true);
    this.player.reset(this.world.getGarageCarPose());
    const playerRoad = this.world.getNearestRoadInfo(this.player.position);
    this.traffic.reset(this.settings, playerRoad?.s ?? 0);
  }

  openMarket() {
    this.marketOpen = true;
    this.garageManagerOpen = false;
    this.input.releasePointerLock();
    this.hud.setGarageManagerVisible(false);
    this.hud.setMarketVisible(true);
  }

  closeMarket() {
    this.marketOpen = false;
    this.hud?.setMarketVisible(false);
  }

  openGarageManager() {
    this.garageManagerOpen = true;
    this.input.releasePointerLock();
    this.hud.setGarageManagerVisible(true);
  }

  closeGarageManager() {
    this.garageManagerOpen = false;
    this.hud?.setGarageManagerVisible(false);
  }

  refreshOwnedCarSet() {
    this.ownedCars = new Set(this.ownedVehicles.map((vehicle) => vehicle.carId));
  }

  getActiveVehicle() {
    const active = this.ownedVehicles.find((vehicle) => vehicle.id === this.activeVehicleId);
    if (active) {
      return active;
    }

    const fallback = this.ownedVehicles[0] ?? createStarterVehicle();
    this.activeVehicleId = fallback.id;
    if (!this.ownedVehicles.length) {
      this.ownedVehicles.push(fallback);
      this.refreshOwnedCarSet();
    }
    return fallback;
  }

  getActiveVehiclePreset() {
    return this.applyVehicleRigToPreset(getVehiclePreset(this.getActiveVehicle()));
  }

  syncActiveVehicleToSettings() {
    const vehicle = this.getActiveVehicle();
    this.settings.carPreset = vehicle.carId;
    this.settings.activeVehiclePreset = this.applyVehicleRigToPreset(getVehiclePreset(vehicle));
  }

  applyVehicleRigToPreset(preset) {
    if (!preset?.carId) {
      return preset;
    }
    return {
      ...preset,
      vehicleRig: this.getVehicleRigForCar(preset.carId),
    };
  }

  getVehicleRigForCar(carId) {
    return sanitizeVehicleRigTune({
      ...DEFAULT_VEHICLE_RIG_TUNE,
      ...(this.vehicleRigOverrides?.[carId] ?? {}),
    });
  }

  initializeRemodelPsxCars() {
    const cars = this.getRemodelPsxCarPresets()
      .map((preset) => ({
        id: preset.id,
        label: `${preset.label}${preset.trafficEligible ? " [traffic]" : ""}${PLAYER_CAR_IDS.includes(preset.id) ? " [player]" : ""}`,
      }));
    this.selectedRemodelPsxCarId = cars.find((car) => car.id === this.getActiveVehicle()?.carId)?.id ?? cars[0]?.id ?? null;
    this.hud?.setRemodelPsxCars(cars, this.selectedRemodelPsxCarId ?? "");
    if (this.selectedRemodelPsxCarId) {
      this.hud?.writeRemodelPsxRigState(this.getVehicleRigForCar(this.selectedRemodelPsxCarId));
    }
    this.updateGaragePsxRemodelTarget({ rebuildOverlay: false });
    this.buildRemodelPsxLineup();
    this.updateRemodelPsxLineupVisibility();
    this.updateRemodelPsxLineupSelection();
    this.hud?.setRemodelPsxRigVisible(false);
  }

  selectRemodelPsxCar(carId) {
    if (!carId || !this.getRemodelPsxCarPresets().some((preset) => preset.id === carId)) {
      return;
    }
    this.selectedRemodelPsxCarId = carId;
    this.hud?.writeRemodelPsxRigState(this.getVehicleRigForCar(carId));
    this.applyRemodelPsxPreviewCar();
    this.updateGaragePsxRemodelTarget();
    this.updateRemodelPsxLineupSelection();
  }

  syncRemodelPsxRigEditor() {
    const cars = this.getRemodelPsxCarPresets().map((preset) => ({
      id: preset.id,
      label: `${preset.label}${preset.trafficEligible ? " [traffic]" : ""}${PLAYER_CAR_IDS.includes(preset.id) ? " [player]" : ""}`,
    }));
    if (!cars.some((car) => car.id === this.selectedRemodelPsxCarId)) {
      this.selectedRemodelPsxCarId = cars.find((car) => car.id === this.getActiveVehicle()?.carId)?.id ?? cars[0]?.id ?? null;
    }
    this.hud?.setRemodelPsxCars(cars, this.selectedRemodelPsxCarId ?? "");
    if (this.selectedRemodelPsxCarId) {
      this.hud?.writeRemodelPsxRigState(this.getVehicleRigForCar(this.selectedRemodelPsxCarId));
      this.applyRemodelPsxPreviewCar();
      this.updateGaragePsxRemodelTarget({ rebuildOverlay: false });
    }
  }

  syncRemodelPsxRigToActiveCar() {
    const activeCarId = this.getActiveVehicle()?.carId ?? null;
    if (!activeCarId || !this.getRemodelPsxCarPresets().some((preset) => preset.id === activeCarId)) {
      return;
    }
    this.selectedRemodelPsxCarId = activeCarId;
    this.hud?.setRemodelPsxCars(
      this.getRemodelPsxCarPresets().map((preset) => ({
        id: preset.id,
        label: `${preset.label}${preset.trafficEligible ? " [traffic]" : ""}${PLAYER_CAR_IDS.includes(preset.id) ? " [player]" : ""}`,
      })),
      activeCarId,
    );
    this.hud?.writeRemodelPsxRigState(this.getVehicleRigForCar(activeCarId));
    this.updateGaragePsxRemodelTarget();
    this.updateRemodelPsxLineupSelection();
  }

  shouldShowRemodelPsxRigForTarget(target) {
    return Boolean(this.mode === "garage" && target?.id === GARAGE_PSX_CAR_TARGET_ID);
  }

  updateRemodelPsxRigVisibility(target) {
    const visible = this.shouldShowRemodelPsxRigForTarget(target);
    this.hud?.setRemodelPsxRigVisible(visible);
    if (visible) {
      this.syncRemodelPsxRigEditor();
    }
  }

  updateSelectedPsxCarRig(state) {
    if (!this.selectedRemodelPsxCarId) {
      return;
    }
    this.vehicleRigOverrides[this.selectedRemodelPsxCarId] = sanitizeVehicleRigTune(state);
    if (this.getActiveVehicle()?.carId === this.selectedRemodelPsxCarId) {
      this.syncActiveVehicleToSettings();
      this.player.setCarPreset(this.getActiveVehiclePreset());
    } else if (this.isGaragePsxCarEditorActive()) {
      this.applyRemodelPsxPreviewCar();
    }
    this.updateGaragePsxRemodelTarget();
    this.buildRemodelPsxLineup();
    this.updateRemodelPsxLineupVisibility();
    this.hud?.setRemodelEditorStatus("PSX rig live");
  }

  saveSelectedPsxCarRig() {
    if (!this.selectedRemodelPsxCarId) {
      return;
    }
    this.vehicleRigOverrides[this.selectedRemodelPsxCarId] = this.getVehicleRigForCar(this.selectedRemodelPsxCarId);
    this.markProgressDirty({ immediate: true });
    this.hud?.setRemodelEditorStatus("PSX rig saved");
    this.hud?.flashNotice("PSX rig", "saved to config");
  }

  buildRemodelPsxLineup() {
    if (!this.scene) {
      return;
    }
    if (this.remodelPsxLineupGroup) {
      this.scene.remove(this.remodelPsxLineupGroup);
    }
    const group = new THREE.Group();
    group.name = "RemodelPsxLineup";

    const anchorState = this.world.getRemodelTargetState("hitbox:traffic-car");
    const startX = (anchorState?.position?.x ?? -57) + 8;
    const baseZ = anchorState?.position?.z ?? -88;
    const yaw = anchorState?.rotation?.y ?? 0;
    const spacing = 5.1;
    const cars = this.getRemodelPsxCarPresets();
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    for (let index = 0; index < cars.length; index += 1) {
      const preset = this.getRemodelPsxPreviewPreset(cars[index].id);
      const carAsset = createPlayerCarAsset(preset);
      const laneOffset = spacing * index;
      const posX = startX + right.x * laneOffset + forward.x * 0.8;
      const posZ = baseZ + right.z * laneOffset + forward.z * 0.8;
      carAsset.position.set(posX, 0, posZ);
      carAsset.rotation.y = yaw;
      carAsset.userData.remodelPsxCarId = preset.id;
      group.add(carAsset);
    }
    this.scene.add(group);
    this.remodelPsxLineupGroup = group;
    this.updateRemodelPsxLineupSelection();
  }

  updateRemodelPsxLineupVisibility() {
    if (!this.remodelPsxLineupGroup) {
      return;
    }
    this.remodelPsxLineupGroup.visible = Boolean(this.settings.hitboxMode);
    this.updateRemodelPsxLineupSelection();
  }

  getRemodelPsxCarPresets() {
    return CAR_PRESETS.filter((preset) => preset.inGamePlayer);
  }

  getRemodelPsxPreviewPreset(carId = this.selectedRemodelPsxCarId) {
    const preset = CAR_PRESETS.find((item) => item.id === carId) ?? CAR_PRESETS[0];
    return this.applyVehicleRigToPreset({ ...preset, carId: preset.id });
  }

  applyRemodelPsxPreviewCar() {
    if (!this.selectedRemodelPsxCarId) {
      return;
    }
    this.player.setCarPreset(this.getRemodelPsxPreviewPreset(this.selectedRemodelPsxCarId));
  }

  isGaragePsxCarEditorActive() {
    return Boolean(
      this.mode === "garage" &&
      this.settings.remodelMode &&
      this.remodelOverlay?.getSelectedTarget?.()?.id === GARAGE_PSX_CAR_TARGET_ID
    );
  }

  createGaragePsxRemodelTarget() {
    if (!this.world?.remodelHitboxGroup) {
      return;
    }
    const material = this.world.materials.remodelHitbox.clone();
    material.opacity = 0.16;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    mesh.name = "Garage PSX player car";
    mesh.userData.remodelFixedId = GARAGE_PSX_CAR_TARGET_ID;
    mesh.userData.remodelLabel = "Garage PSX car";
    mesh.userData.remodelCategory = "hitbox";
    this.world.remodelHitboxGroup.add(mesh);
    this.garagePsxRemodelTarget = mesh;
    this.updateGaragePsxRemodelTarget({ rebuildOverlay: false });
    this.world.rebuildRemodelTargets();
  }

  updateGaragePsxRemodelTarget({ rebuildOverlay = true } = {}) {
    if (!this.garagePsxRemodelTarget) {
      return;
    }
    const preset = this.getRemodelPsxPreviewPreset(this.selectedRemodelPsxCarId ?? this.getActiveVehicle()?.carId);
    const pose = this.world.getGarageCarPose();
    const height = Math.max(1.35, (preset.bodyHeight ?? 0.68) + 0.9);
    this.garagePsxRemodelTarget.position.set(pose.x, height * 0.5, pose.z);
    this.garagePsxRemodelTarget.rotation.set(0, pose.yaw, 0);
    this.garagePsxRemodelTarget.scale.set(
      Math.max(1.2, preset.bodyWidth ?? 1.9),
      height,
      Math.max(3.2, preset.bodyLength ?? 4.4),
    );
    this.garagePsxRemodelTarget.updateMatrixWorld(true);
    if (rebuildOverlay) {
      this.world.rebuildRemodelTargets();
      if (this.remodelOverlay?.visible) {
        this.remodelOverlay.refresh(this.remodelOverlay.getSelectedTarget?.()?.id);
      }
    }
  }

  updateRemodelPsxLineupSelection() {
    if (!this.remodelPsxLineupGroup) {
      return;
    }

    const selectedId = this.selectedRemodelPsxCarId ?? this.getActiveVehicle()?.carId ?? null;
    for (const child of this.remodelPsxLineupGroup.children ?? []) {
      if (!child?.userData) {
        continue;
      }
      child.visible = child.userData.remodelPsxCarId === selectedId;
    }
  }

  selectFirstOwnedVehicleForCar(carId) {
    const vehicle = this.ownedVehicles.find((item) => item.carId === carId);
    if (vehicle) {
      this.selectOwnedCar(vehicle.id);
      return true;
    }
    this.syncActiveVehicleToSettings();
    this.hud.syncSettings?.();
    return false;
  }

  getUpgradeCosts() {
    return Object.fromEntries(
      PARTS_CATALOG.map((part) => [
        part.id,
        part.baseCost,
      ]),
    );
  }

  buyUpgrade(upgrade) {
    const costs = this.getUpgradeCosts();
    const part = PARTS_CATALOG.find((item) => item.id === upgrade);
    if (!part || !costs[upgrade] || this.upgrades[upgrade] >= part.maxLevel || this.coins < costs[upgrade]) {
      return;
    }

    this.coins -= costs[upgrade];
    this.upgrades[upgrade] = 1;
    this.installedUpgrades[upgrade] = 1;
    this.applyInstalledUpgrades();
    this.hud.syncSettings?.();
    this.markProgressDirty({ immediate: true });
    this.audio.upgrade();
  }

  adjustInstalledUpgrade(upgrade, delta) {
    const part = PARTS_CATALOG.find((item) => item.id === upgrade);
    if (!part || delta === 0) {
      return;
    }

    const ownedLevel = this.upgrades[upgrade] ?? 0;
    const installedLevel = this.installedUpgrades[upgrade] ?? 0;
    const nextLevel = clamp(installedLevel + Math.sign(delta), 0, ownedLevel);
    if (nextLevel === installedLevel) {
      return;
    }

    this.installedUpgrades[upgrade] = nextLevel;
    this.applyInstalledUpgrades();
    this.hud.syncSettings?.();
    this.markProgressDirty({ immediate: true });
    this.audio.upgrade();
  }

  applyInstalledUpgrades() {
    const totals = {
      maxSpeedKmh: 0,
      powerMultiplier: 0,
      handling: 0,
      gripMultiplier: 0,
      brakePower: 0,
      weightMultiplier: 0,
    };

    for (const part of PARTS_CATALOG) {
      if ((this.installedUpgrades[part.id] ?? 0) <= 0) {
        continue;
      }
      for (const [key, value] of Object.entries(part.effects ?? {})) {
        totals[key] = (totals[key] ?? 0) + Number(value || 0);
      }
    }

    this.settings.maxSpeedKmh = Math.min(
      460,
      this.basePerformance.maxSpeedKmh + totals.maxSpeedKmh,
    );
    this.settings.powerMultiplier = Math.min(
      1.48,
      this.basePerformance.powerMultiplier + totals.powerMultiplier,
    );
    this.settings.handling = Math.min(
      1.8,
      this.basePerformance.handling + totals.handling,
    );
    this.settings.gripMultiplier = Math.min(
      1.55,
      this.basePerformance.gripMultiplier + totals.gripMultiplier,
    );
    this.settings.brakePower = Math.min(
      1.52,
      this.basePerformance.brakePower + totals.brakePower,
    );
    this.settings.weightMultiplier = Math.min(
      1.24,
      this.basePerformance.weightMultiplier + totals.weightMultiplier,
    );
  }

  handleCarMarket(listingId) {
    const listing = CAR_AUCTION_LISTINGS.find((item) => item.id === listingId);
    if (!listing) {
      return;
    }

    const ownedVehicle = this.ownedVehicles.find((vehicle) => vehicle.sourceListingId === listing.id);
    if (ownedVehicle) {
      this.selectOwnedCar(ownedVehicle.id);
      return;
    }

    const price = listing.price ?? 0;
    if (this.coins < price) {
      return;
    }

    this.coins -= price;
    const vehicle = createVehicleFromListing(listing);
    this.ownedVehicles.push(vehicle);
    this.refreshOwnedCarSet();
    this.selectOwnedCar(vehicle.id);
    this.markProgressDirty({ immediate: true });
    this.audio.upgrade();
  }

  selectOwnedCar(vehicleId) {
    const vehicle = this.ownedVehicles.find((item) => item.id === vehicleId);
    if (!vehicle) {
      return;
    }

    this.activeVehicleId = vehicle.id;
    this.syncActiveVehicleToSettings();
    this.player.setCarPreset(this.getActiveVehiclePreset());
    this.syncRemodelPsxRigToActiveCar();
    this.hud.syncSettings?.();
    this.markProgressDirty({ immediate: true });
  }

  setCameraMode(index) {
    this.cameraModeIndex = ((index % CAMERA_MODES.length) + CAMERA_MODES.length) % CAMERA_MODES.length;
    this.cameraMode = CAMERA_MODES[this.cameraModeIndex];
    this.cameraYawOffset = 0;
    this.cameraPitchOffset = 0;
    this.cameraInputTimer = 0;
    this.cameraLookAtInitialized = false;
    this.hud?.flashNotice("Camera", `${this.cameraModeIndex + 1} / ${this.cameraMode}`);
  }

  intersectsTraffic(car) {
    return Boolean(this.getTrafficCollision(car));
  }

  getTrafficCollision(car) {
    const preset = this.player.activePreset;
    const playerProfile = this.world.getHitboxProfile("hitbox:player", {
      width: preset.bodyWidth,
      height: 1.72,
      length: preset.bodyLength * 0.98,
      centerX: 0,
      centerY: 0.86,
      centerZ: 0,
      yawOffset: 0,
    });
    const trafficProfile = this.getTrafficHitboxProfile(car);
    const playerPose = this.getVehicleHitboxPose(
      this.player.position.x,
      this.player.position.z,
      this.player.yaw,
      playerProfile,
    );
    const trafficPose = this.getVehicleHitboxPose(car.x, car.z, car.yaw, trafficProfile);
    const playerHalfWidth = playerProfile.width * 0.5;
    const playerHalfLength = playerProfile.length * 0.5;
    const trafficHalfWidth = trafficProfile.width * 0.5;
    const trafficHalfLength = trafficProfile.length * 0.5;
    const playerRightX = Math.cos(playerPose.yaw);
    const playerRightZ = -Math.sin(playerPose.yaw);
    const playerForwardX = Math.sin(playerPose.yaw);
    const playerForwardZ = Math.cos(playerPose.yaw);
    const trafficRightX = Math.cos(trafficPose.yaw);
    const trafficRightZ = -Math.sin(trafficPose.yaw);
    const trafficForwardX = Math.sin(trafficPose.yaw);
    const trafficForwardZ = Math.cos(trafficPose.yaw);
    const deltaX = trafficPose.x - playerPose.x;
    const deltaZ = trafficPose.z - playerPose.z;
    const axes = [
      [playerRightX, playerRightZ],
      [playerForwardX, playerForwardZ],
      [trafficRightX, trafficRightZ],
      [trafficForwardX, trafficForwardZ],
    ];
    let bestOverlap = Infinity;
    let bestNormalX = 0;
    let bestNormalZ = 0;

    for (const [axisX, axisZ] of axes) {
      const playerProjection =
        playerHalfWidth * Math.abs(axisX * playerRightX + axisZ * playerRightZ) +
        playerHalfLength * Math.abs(axisX * playerForwardX + axisZ * playerForwardZ);
      const trafficProjection =
        trafficHalfWidth * Math.abs(axisX * trafficRightX + axisZ * trafficRightZ) +
        trafficHalfLength * Math.abs(axisX * trafficForwardX + axisZ * trafficForwardZ);
      const centerDistance = deltaX * axisX + deltaZ * axisZ;
      const overlap = playerProjection + trafficProjection - Math.abs(centerDistance);
      if (overlap <= 0) {
        return null;
      }
      if (overlap < bestOverlap) {
        bestOverlap = overlap;
        const direction = centerDistance >= 0 ? -1 : 1;
        bestNormalX = axisX * direction;
        bestNormalZ = axisZ * direction;
      }
    }

    return {
      depth: bestOverlap,
      normalX: bestNormalX,
      normalZ: bestNormalZ,
      playerProfile,
      trafficProfile,
      playerPose,
      trafficPose,
    };
  }

  getTrafficHitboxProfile(car) {
    return this.world.getHitboxProfile(
      car.kind === "truck" ? "hitbox:traffic-truck" : "hitbox:traffic-car",
      {
        width: car.width,
        height: car.kind === "truck" ? 2.75 : 1.55,
        length: car.length,
        centerX: 0,
        centerY: car.kind === "truck" ? 1.38 : 0.78,
        centerZ: 0,
        yawOffset: 0,
      },
    );
  }

  getVehicleHitboxPose(x, z, yaw, profile) {
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    return {
      x: x + rightX * (profile.centerX ?? 0) + forwardX * (profile.centerZ ?? 0),
      z: z + rightZ * (profile.centerX ?? 0) + forwardZ * (profile.centerZ ?? 0),
      yaw: yaw + (profile.yawOffset ?? 0),
    };
  }

  updateCamera(dt, inputState) {
    const cameraInput =
      inputState.cameraTurn * 2.35 * dt + inputState.cameraDragDelta * 0.0026;
    if (Math.abs(cameraInput) > 0.0001) {
      this.cameraYawOffset += cameraInput;
      this.cameraInputTimer = 2.8;
    } else {
      this.cameraInputTimer -= dt;
      if (this.cameraInputTimer <= 0 && this.cameraMode !== "hood" && this.cameraMode !== "roof") {
        this.cameraYawOffset = damp(this.cameraYawOffset, 0, 1.75, dt);
      }
    }
    this.cameraPitchOffset = clamp(
      this.cameraPitchOffset - inputState.cameraPitchDelta * 0.0024,
      -0.62,
      0.58,
    );

    const playerSpeed = this.player.speedMagnitude ?? Math.abs(this.player.speed);
    const speedRatio = clamp(playerSpeed / (this.settings.maxSpeedKmh / 3.6), 0, 1);
    if (this.mode === "garage") {
      this.updateGarageCamera();
      return;
    }

    if (this.cameraMode === "hood" || this.cameraMode === "roof") {
      this.updateFirstPersonCamera(dt, speedRatio, this.cameraMode);
      return;
    }
    if (this.cameraMode === "cinematic") {
      this.updateCinematicCamera(dt, speedRatio);
      return;
    }

    const cameraRig =
      this.cameraMode === "chaseClose"
        ? { back: 8.2, backSpeed: 3.2, height: 3.4, heightSpeed: 0.7 }
        : { back: 17.2, backSpeed: 7.5, height: 7.1, heightSpeed: 1.7 };

    const forward = this.player.getForwardVector();
    const right = this.player.getRightVector?.() ?? { x: Math.cos(this.player.yaw), z: -Math.sin(this.player.yaw) };
    const velocity = this.player.getVelocityVector?.() ?? {
      x: forward.x * this.player.speed,
      z: forward.z * this.player.speed,
    };
    const velocityLength = Math.hypot(velocity.x, velocity.z);
    const velocityForward =
      velocityLength > 1
        ? { x: velocity.x / velocityLength, z: velocity.z / velocityLength }
        : forward;
    const slideRatio = clamp((this.player.lateralSpeed ?? 0) / Math.max(playerSpeed, 8), -0.42, 0.42);
    const cameraBack = cameraRig.back + speedRatio * cameraRig.backSpeed + (this.player.slip ?? 0) * 1.15;
    const cameraHeight = cameraRig.height + speedRatio * cameraRig.heightSpeed + (this.player.slip ?? 0) * 0.22;
    const cameraYaw =
      this.player.yaw +
      Math.PI +
      this.cameraYawOffset +
      slideRatio * 0.34 -
      clamp(this.player.yawVelocity, -0.8, 0.8) * 0.08;
    const desired = new THREE.Vector3(
      this.player.position.x + Math.sin(cameraYaw) * cameraBack,
      this.player.position.y + cameraHeight,
      this.player.position.z + Math.cos(cameraYaw) * cameraBack,
    );

    const followResponse = THREE.MathUtils.lerp(6.2, 4.2, speedRatio);
    this.camera.position.lerp(desired, 1 - Math.exp(-followResponse * dt));

    const slipLookBlend = clamp((this.player.slip ?? 0) * 0.46, 0, 0.46);
    const lookDir = new THREE.Vector3(
      THREE.MathUtils.lerp(forward.x, velocityForward.x, slipLookBlend),
      0,
      THREE.MathUtils.lerp(forward.z, velocityForward.z, slipLookBlend),
    ).normalize();
    const lookAt = new THREE.Vector3(
      this.player.position.x +
        lookDir.x * (7 + speedRatio * 10.8) +
        right.x * clamp((this.player.lateralSpeed ?? 0) * 0.075, -2.2, 2.2),
      1.25 + speedRatio * 0.4,
      this.player.position.z +
        lookDir.z * (7 + speedRatio * 10.8) +
        right.z * clamp((this.player.lateralSpeed ?? 0) * 0.075, -2.2, 2.2),
    );
    if (!this.cameraLookAtInitialized || this.cameraLookAt.distanceToSquared(lookAt) > 7200) {
      this.cameraLookAt.copy(lookAt);
      this.cameraLookAtInitialized = true;
    } else {
      this.cameraLookAt.lerp(lookAt, 1 - Math.exp(-8.5 * dt));
    }

    if (this.cameraShake > 0.001) {
      const shake = this.cameraShake * 0.12;
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
      this.cameraShake = damp(this.cameraShake, 0, 5.8, dt);
    }
    if ((this.player.slip ?? 0) > 0.34 && playerSpeed > 26) {
      const tireShake = (this.player.slip - 0.34) * 0.018;
      this.camera.position.x += (Math.random() - 0.5) * tireShake;
      this.camera.position.y += (Math.random() - 0.5) * tireShake;
    }

    this.camera.lookAt(this.cameraLookAt);
    const targetFov = this.settings.cameraFov + speedRatio * 5.2 + (this.player.slip ?? 0) * 1.1;
    this.camera.fov = damp(this.camera.fov, targetFov, 4.5, dt);
    this.camera.updateProjectionMatrix();
  }

  updateFirstPersonCamera(dt, speedRatio, variant = "hood") {
    const lateralSpeed = this.player.lateralSpeed ?? 0;
    const playerSpeed = this.player.speedMagnitude ?? Math.abs(this.player.speed);
    const preset = this.player.activePreset;
    const localEye =
      variant === "roof"
        ? this.localPlayerPoint(
            clamp(-lateralSpeed * 0.012, -0.09, 0.09),
            1.92 + preset.bodyHeight * 0.26,
            -preset.bodyLength * 0.12,
          )
        : this.localPlayerPoint(
            clamp(-lateralSpeed * 0.01, -0.08, 0.08),
            1.12 + clamp(Math.abs(this.player.longitudinalAcceleration ?? 0) * 0.0016, 0, 0.035),
            preset.bodyLength * 0.31,
          );
    const slipLook = clamp(lateralSpeed / Math.max(playerSpeed, 12), -0.18, 0.18);
    const lookYaw = this.player.yaw + this.cameraYawOffset * 0.34 + slipLook * 0.22;
    const pitch = this.cameraPitchOffset;
    const pitchScale = Math.cos(pitch);
    const lookForward = {
      x: Math.sin(lookYaw) * pitchScale,
      y: Math.sin(pitch),
      z: Math.cos(lookYaw) * pitchScale,
    };
    const lookAt = new THREE.Vector3(
      localEye.x + lookForward.x * 34,
      localEye.y + lookForward.y * 34,
      localEye.z + lookForward.z * 34,
    );

    this.camera.position.copy(localEye);
    if (this.cameraShake > 0.001) {
      const shake = this.cameraShake * 0.055;
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
      this.cameraShake = damp(this.cameraShake, 0, 6.4, dt);
    }
    if ((this.player.slip ?? 0) > 0.38 && playerSpeed > 24) {
      const tireShake = (this.player.slip - 0.38) * 0.01;
      this.camera.position.x += (Math.random() - 0.5) * tireShake;
      this.camera.position.y += (Math.random() - 0.5) * tireShake;
    }

    this.camera.lookAt(lookAt);
    this.cameraLookAtInitialized = false;
    const targetFov = this.settings.cameraFov + 1 + speedRatio * 1.4;
    this.camera.fov = damp(this.camera.fov, targetFov, 5.8, dt);
    this.camera.updateProjectionMatrix();
  }

  updateCinematicCamera(dt, speedRatio) {
    const time = performance.now() * 0.001;
    const forward = this.player.getForwardVector();
    const right = this.player.getRightVector?.() ?? { x: Math.cos(this.player.yaw), z: -Math.sin(this.player.yaw) };
    const side = Math.sin(time * 0.42) > 0 ? 1 : -1;
    const orbit = Math.sin(time * 0.28) * 0.35;
    const desired = new THREE.Vector3(
      this.player.position.x - forward.x * (14 + speedRatio * 8) + right.x * side * (8.5 + orbit * 3),
      4.8 + speedRatio * 2.4 + Math.sin(time * 0.7) * 0.45,
      this.player.position.z - forward.z * (14 + speedRatio * 8) + right.z * side * (8.5 + orbit * 3),
    );
    this.camera.position.lerp(desired, 1 - Math.exp(-2.2 * dt));
    const lookAt = new THREE.Vector3(
      this.player.position.x + forward.x * (8 + speedRatio * 10),
      1.2 + speedRatio * 0.8,
      this.player.position.z + forward.z * (8 + speedRatio * 10),
    );
    this.camera.lookAt(lookAt);
    this.cameraLookAtInitialized = false;
    const targetFov = this.settings.cameraFov + 4 + speedRatio * 7;
    this.camera.fov = damp(this.camera.fov, targetFov, 3.4, dt);
    this.camera.updateProjectionMatrix();
  }

  updateGarageCamera() {
    const pitch = this.walker.pitch ?? 0;
    const pitchScale = Math.cos(pitch);
    const lookForward = {
      x: Math.sin(this.walker.yaw) * pitchScale,
      y: Math.sin(pitch),
      z: Math.cos(this.walker.yaw) * pitchScale,
    };
    this.camera.position.copy(this.walker.position);
    this.camera.lookAt(
      this.walker.position.x + lookForward.x * 12,
      this.walker.position.y + lookForward.y * 12,
      this.walker.position.z + lookForward.z * 12,
    );
    this.cameraLookAtInitialized = false;
    this.camera.fov = damp(this.camera.fov, 62, 6, 1 / 60);
    this.camera.updateProjectionMatrix();
  }

  updateNoClipCamera() {
    const pitch = this.noClipRig.pitch ?? 0;
    const pitchScale = Math.cos(pitch);
    const lookForward = {
      x: Math.sin(this.noClipRig.yaw) * pitchScale,
      y: Math.sin(pitch),
      z: Math.cos(this.noClipRig.yaw) * pitchScale,
    };
    this.camera.position.copy(this.noClipRig.position);
    this.camera.lookAt(
      this.noClipRig.position.x + lookForward.x * 32,
      this.noClipRig.position.y + lookForward.y * 32,
      this.noClipRig.position.z + lookForward.z * 32,
    );
    this.cameraLookAtInitialized = false;
    this.camera.fov = damp(this.camera.fov, this.settings.cameraFov + 4, 7.5, 1 / 60);
    this.camera.updateProjectionMatrix();
  }

  updateRemodelHover() {
    if (!this.settings.noClip || !this.settings.remodelMode) {
      this.hud?.setRemodelHover(null);
      return;
    }

    this.camera.updateMatrixWorld(true);
    const hoverInfo = this.remodelOverlay.updateHover(this.camera, this.renderer.domElement);
    this.hud?.setRemodelHover(hoverInfo);
  }

  localPlayerPoint(localX, localY, localZ) {
    const yaw = this.player.yaw;
    const right = {
      x: Math.cos(yaw),
      z: -Math.sin(yaw),
    };
    const forward = this.player.getForwardVector();
    return new THREE.Vector3(
      this.player.position.x + right.x * localX + forward.x * localZ,
      localY,
      this.player.position.z + right.z * localX + forward.z * localZ,
    );
  }

  updateHud(rawDt) {
    this.fps = damp(this.fps, 1 / Math.max(rawDt, 0.0001), 2.5, Math.min(rawDt, 0.1));
    this.hud.update({
      speedKmh: this.getPlayerSpeed() * 3.6,
      score: this.score,
      coins: this.coins,
      comboMultiplier: 1 + this.combo * 0.16,
      nearMisses: this.nearMisses,
      hits: this.hitCount,
      maxHits: this.maxHits,
      fps: this.fps,
      crashed: this.crashed,
      canRestart: this.canRestart(),
    });
    this.hud.updateGarageState({
      coins: this.coins,
      upgrades: this.upgrades,
      installedUpgrades: this.installedUpgrades,
      costs: this.getUpgradeCosts(),
      ownedCars: [...this.ownedCars],
      ownedVehicles: this.ownedVehicles,
      activeCar: this.settings.carPreset,
      activeVehicleId: this.activeVehicleId,
    });
    this.hud.updateNoClipInfo({
      active: this.settings.noClip,
      position: this.settings.noClip
        ? this.noClipRig.position
        : this.mode === "garage"
          ? this.walker.position
          : this.player.position,
      yaw: this.settings.noClip
        ? this.noClipRig.yaw
        : this.mode === "garage"
          ? this.walker.yaw
          : this.player.yaw,
      pitch: this.settings.noClip
        ? this.noClipRig.pitch
        : this.mode === "garage"
          ? this.walker.pitch
          : this.cameraPitchOffset,
      speedKmh: this.noClipCurrentSpeedKmh,
      baseSpeedKmh: this.settings.noClipSpeedKmh,
      boostSpeedKmh: this.settings.noClipBoostSpeedKmh,
    });
    this.hud.updateMiniMap(this.world, this.player, this.traffic);
  }

  updateDayNight(dt) {
    if (this.settings.dayNightCycle) {
      const speedMinutesPerSecond = Math.max(0, Number(this.settings.dayNightSpeed) || 0);
      this.settings.timeOfDay = (this.settings.timeOfDay + (dt * speedMinutesPerSecond) / 60) % 24;
      this.hud.updateSettingValue?.("timeOfDay", this.settings.timeOfDay);
    }
    this.world.applyEnvironment?.(this.settings);
  }

  applySavedProgress(progress = {}) {
    const saved = this.normalizeProgress(progress);
    this.coins = saved.coins;
    this.bestScore = saved.bestScore;
    this.upgrades = saved.upgrades;
    this.installedUpgrades = saved.installedUpgrades;
    this.vehicleRigOverrides = saved.vehicleRigOverrides;
    this.ownedVehicles = saved.ownedVehicles;
    this.activeVehicleId = saved.activeVehicleId;
    this.refreshOwnedCarSet();
    this.syncActiveVehicleToSettings();
    this.applyInstalledUpgrades();
  }

  normalizeProgress(progress = {}) {
    const raw = progress && typeof progress === "object" ? progress : {};
    const carIds = new Set(CAR_PRESETS.map((preset) => preset.id));
    const listings = new Map(CAR_AUCTION_LISTINGS.map((listing) => [listing.id, listing]));
    const legacyOwnedCars = [
      ...new Set(
        (Array.isArray(raw.ownedCars) ? raw.ownedCars : [DEFAULT_SETTINGS.carPreset])
          .filter((id) => carIds.has(id)),
      ),
    ];
    const isLegacyFullGarage =
      clampSaveInteger(raw.version, 0, PROGRESS_VERSION) < PROGRESS_VERSION &&
      legacyOwnedCars.length === CAR_PRESETS.length;
    if (isLegacyFullGarage) {
      legacyOwnedCars.splice(0, legacyOwnedCars.length, DEFAULT_SETTINGS.carPreset);
    }

    const sanitizeVehicle = (vehicle, index) => {
      const listing = listings.get(vehicle?.sourceListingId);
      const carId = carIds.has(vehicle?.carId)
        ? vehicle.carId
        : listing?.carId;
      if (!carId) {
        return null;
      }

      const preset = CAR_PRESETS.find((item) => item.id === carId);
      const color = Number.isFinite(Number(vehicle?.color))
        ? Number(vehicle.color)
        : listing?.color ?? preset.color;
      const secondaryColor = Number.isFinite(Number(vehicle?.secondaryColor))
        ? Number(vehicle.secondaryColor)
        : listing?.secondaryColor ?? preset.secondaryColor;
      const mileageKm = clampSaveInteger(vehicle?.mileageKm ?? listing?.mileageKm ?? 0, 0, 999999);
      const id = typeof vehicle?.id === "string" && vehicle.id.trim()
        ? vehicle.id.trim()
        : listing
          ? `owned-${listing.id}`
          : `legacy-${carId}-${index}`;

      return {
        id,
        carId,
        label: preset.label,
        sourceListingId: listing?.id ?? (typeof vehicle?.sourceListingId === "string" ? vehicle.sourceListingId : null),
        purchasePrice: clampSaveInteger(vehicle?.purchasePrice ?? listing?.price ?? preset.price, 0, Number.MAX_SAFE_INTEGER),
        seller: String(vehicle?.seller ?? listing?.seller ?? "Garage"),
        condition: String(vehicle?.condition ?? listing?.condition ?? "usata"),
        mileageKm,
        mileage: typeof vehicle?.mileage === "string" ? vehicle.mileage : `${mileageKm.toLocaleString("it-IT")} km`,
        color,
        colorName: String(vehicle?.colorName ?? listing?.colorName ?? "Factory"),
        secondaryColor,
        transmission: String(vehicle?.transmission ?? listing?.transmission ?? "Manuale"),
        engine: String(vehicle?.engine ?? listing?.engine ?? "stock"),
      };
    };

    const createLegacyVehicle = (carId, index) => {
      if (carId === DEFAULT_SETTINGS.carPreset && index === 0) {
        return createStarterVehicle();
      }
      const preset = CAR_PRESETS.find((item) => item.id === carId);
      return {
        id: `legacy-${carId}-${index}`,
        carId,
        label: preset.label,
        sourceListingId: null,
        purchasePrice: preset.price ?? 0,
        seller: "Garage salvato",
        condition: "salvataggio precedente",
        mileageKm: 0,
        mileage: "km non registrati",
        color: preset.color,
        colorName: "Factory",
        secondaryColor: preset.secondaryColor,
        transmission: "Manuale",
        engine: "stock",
      };
    };

    let ownedVehicles = Array.isArray(raw.ownedVehicles)
      ? raw.ownedVehicles.map(sanitizeVehicle).filter(Boolean)
      : legacyOwnedCars.map(createLegacyVehicle);

    const seenVehicleIds = new Set();
    ownedVehicles = ownedVehicles.map((vehicle, index) => {
      if (!seenVehicleIds.has(vehicle.id)) {
        seenVehicleIds.add(vehicle.id);
        return vehicle;
      }
      const uniqueVehicle = { ...vehicle, id: `${vehicle.id}-${index}` };
      seenVehicleIds.add(uniqueVehicle.id);
      return uniqueVehicle;
    });

    if (!ownedVehicles.length) {
      ownedVehicles.push(createStarterVehicle());
    }

    const activeVehicle =
      ownedVehicles.find((vehicle) => vehicle.id === raw.activeVehicleId) ??
      ownedVehicles.find((vehicle) => vehicle.carId === raw.activeCar) ??
      ownedVehicles.find((vehicle) => vehicle.carId === DEFAULT_SETTINGS.carPreset) ??
      ownedVehicles[0];

    const legacyOwnedPartIds = new Set();
    const legacyInstalledPartIds = new Set();
    for (const [legacyId, migratedIds] of Object.entries(LEGACY_PART_MIGRATION)) {
      const ownedCount = clampSaveInteger(raw.upgrades?.[legacyId], 0, migratedIds.length);
      const installedCount = clampSaveInteger(raw.installedUpgrades?.[legacyId], 0, ownedCount);
      for (let index = 0; index < ownedCount; index += 1) {
        legacyOwnedPartIds.add(migratedIds[index]);
      }
      for (let index = 0; index < installedCount; index += 1) {
        legacyInstalledPartIds.add(migratedIds[index]);
      }
    }

    const upgrades = {};
    const installedUpgrades = {};
    for (const part of PARTS_CATALOG) {
      const ownedLevel = isLegacyFullGarage
        ? 0
        : clampSaveInteger(raw.upgrades?.[part.id] ?? (legacyOwnedPartIds.has(part.id) ? 1 : 0), 0, part.maxLevel);
      upgrades[part.id] = ownedLevel;
      installedUpgrades[part.id] = clampSaveInteger(
        raw.installedUpgrades?.[part.id] ?? (legacyInstalledPartIds.has(part.id) ? 1 : 0),
        0,
        ownedLevel,
      );
    }

    return {
      coins: isLegacyFullGarage ? 0 : clampSaveInteger(raw.coins, 0, Number.MAX_SAFE_INTEGER),
      bestScore: isLegacyFullGarage ? 0 : clampSaveInteger(raw.bestScore, 0, Number.MAX_SAFE_INTEGER),
      activeVehicleId: activeVehicle.id,
      ownedVehicles,
      upgrades,
      installedUpgrades,
      vehicleRigOverrides: Object.fromEntries(
        Object.entries(raw.vehicleRigOverrides ?? {})
          .filter(([carId]) => carIds.has(carId))
          .map(([carId, tune]) => [carId, sanitizeVehicleRigTune(tune)]),
      ),
    };
  }

  getProgressSnapshot() {
    this.updateBestScore();
    return {
      version: PROGRESS_VERSION,
      coins: Math.max(0, Math.floor(this.coins)),
      bestScore: Math.max(0, Math.floor(this.bestScore)),
      lastScore: Math.max(0, Math.floor(this.score)),
      activeCar: this.getActiveVehicle().carId,
      activeVehicleId: this.activeVehicleId,
      ownedCars: [...this.ownedCars],
      ownedVehicles: this.ownedVehicles.map((vehicle) => ({ ...vehicle })),
      upgrades: { ...this.upgrades },
      installedUpgrades: { ...this.installedUpgrades },
      vehicleRigOverrides: { ...this.vehicleRigOverrides },
    };
  }

  updateBestScore() {
    const score = Math.max(0, Math.floor(this.score));
    if (score <= this.bestScore) {
      return false;
    }

    this.bestScore = score;
    return true;
  }

  markProgressDirty({ immediate = false } = {}) {
    if (!this.authClient) {
      return;
    }

    this.progressDirty = true;
    this.setSaveStatus("salvando");
    if (immediate) {
      this.flushProgressSave({ force: true });
      return;
    }

    if (!this.progressSaveTimer) {
      this.progressSaveTimer = window.setTimeout(() => this.flushProgressSave(), SAVE_DEBOUNCE_MS);
    }
  }

  async flushProgressSave({ force = false, keepalive = false } = {}) {
    if (!this.authClient) {
      return null;
    }

    if (this.progressSaveTimer) {
      window.clearTimeout(this.progressSaveTimer);
      this.progressSaveTimer = null;
    }

    if (!force && !this.progressDirty) {
      return null;
    }

    if (this.progressSaveInFlight) {
      return this.progressSaveInFlight;
    }

    const snapshot = this.getProgressSnapshot();
    this.progressDirty = false;
    this.setSaveStatus("salvando");
    this.progressSaveInFlight = this.authClient
      .saveGameState(snapshot, { keepalive })
      .then(() => {
        this.setSaveStatus("salvato");
        return snapshot;
      })
      .catch((error) => {
        this.progressDirty = true;
        this.setSaveStatus("errore");
        if (!keepalive) {
          this.progressSaveTimer = window.setTimeout(() => this.flushProgressSave(), SAVE_RETRY_MS);
        }
        console.warn("Unable to save game progress.", error);
        return null;
      })
      .finally(() => {
        this.progressSaveInFlight = null;
        if (this.progressDirty && !this.progressSaveTimer && !keepalive) {
          this.progressSaveTimer = window.setTimeout(() => this.flushProgressSave(), SAVE_DEBOUNCE_MS);
        }
      });

    return this.progressSaveInFlight;
  }

  setSaveStatus(status) {
    this.onSaveStatus?.(status);
  }

  loadSavedSettings() {
    const settings = { ...DEFAULT_SETTINGS };
    try {
      const saved = JSON.parse(window.localStorage.getItem(DEV_STORAGE_KEY) ?? "{}");
      if (!saved || typeof saved !== "object") {
        return settings;
      }

      for (const def of SETTING_DEFS) {
        if (Number.isFinite(Number(saved[def.key]))) {
          settings[def.key] = Number(saved[def.key]);
        }
      }

      for (const key of ["trafficEnabled", "dayNightCycle", "noClip", "hitboxMode", "remodelMode", "remodelSnapToGrid"]) {
        if (typeof saved[key] === "boolean") {
          settings[key] = saved[key];
        }
      }

      if (CAR_PRESETS.some((preset) => preset.id === saved.carPreset)) {
        settings.carPreset = saved.carPreset;
      }
    } catch {
      return settings;
    }

    if (!settings.noClip) {
      settings.remodelMode = false;
    }

    return settings;
  }

  saveDevSettings() {
    if (!this.isAdmin) {
      this.hud.flashNotice("Admin", "accesso riservato");
      return;
    }

    const payload = {
      carPreset: this.settings.carPreset,
      trafficEnabled: this.settings.trafficEnabled,
      dayNightCycle: this.settings.dayNightCycle,
      noClip: this.settings.noClip,
      hitboxMode: this.settings.hitboxMode,
      remodelMode: this.settings.remodelMode,
      remodelSnapToGrid: this.settings.remodelSnapToGrid,
    };
    for (const def of SETTING_DEFS) {
      payload[def.key] = this.settings[def.key];
    }

    try {
      window.localStorage.setItem(DEV_STORAGE_KEY, JSON.stringify(payload));
      this.hud.flashNotice("Dev saved", "loaded next session");
    } catch {
      this.hud.flashNotice("Save failed", "localStorage blocked");
    }
  }

  resetDevSettings() {
    if (!this.isAdmin) {
      this.hud.flashNotice("Admin", "accesso riservato");
      return;
    }

    try {
      window.localStorage.removeItem(DEV_STORAGE_KEY);
    } catch {
      // Reset still works for the running session.
    }

    Object.assign(this.settings, DEFAULT_SETTINGS);
    this.setRemodelMode(false);
    this.exitNoClip();
    for (const key of PHYSICS_SETTING_KEYS) {
      this.basePerformance[key] = this.settings[key];
    }
    this.applyInstalledUpgrades();
    this.syncActiveVehicleToSettings();
    this.player.setCarPreset(this.getActiveVehiclePreset());
    this.hud.syncSettings?.();
    this.handleSettingsChanged();
    this.hud.flashNotice("Dev reset", "defaults restored");
  }

  setNoClipMode(active, { flash = true } = {}) {
    const enabled = Boolean(active);
    this.settings.noClip = enabled;
    if (enabled) {
      if (!this.noClipRig.active) {
        this.enterNoClip();
      }
    } else if (this.noClipRig.active) {
      this.exitNoClip();
    }

    if (!enabled) {
      this.setRemodelMode(false);
    }

    this.hud.setRemodelAvailable(enabled);
    this.hud.syncBooleanSetting?.("noClip");
    this.hud.syncBooleanSetting?.("remodelMode");
    if (flash) {
      this.hud.flashNotice("No clip", enabled ? "enabled" : "disabled");
    }
  }

  toggleRemodelShortcut() {
    const shouldEnable = !this.settings.noClip || !this.settings.remodelMode;
    if (shouldEnable) {
      this.setNoClipMode(true, { flash: false });
      this.setRemodelMode(true);
      this.hud.flashNotice("Remodel", "enabled");
      return;
    }

    this.setRemodelMode(false);
    this.hud.flashNotice("Remodel", "disabled");
  }

  handleSettingsChanged(changedKey = null) {
    if (changedKey === "carPreset") {
      this.selectFirstOwnedVehicleForCar(this.settings.carPreset);
    }

    if (PHYSICS_SETTING_KEYS.includes(changedKey)) {
      this.basePerformance[changedKey] = this.settings[changedKey];
      this.applyInstalledUpgrades();
      this.hud.syncSettings?.();
    }

    if (changedKey === "noClip") {
      this.setNoClipMode(this.settings.noClip);
      this.hud.syncSettings?.();
    }
    if (changedKey === "remodelMode") {
      if (this.settings.remodelMode && !this.settings.noClip) {
        this.setRemodelMode(false);
        this.hud.flashNotice("Remodel", "enable no clip first");
      } else {
        this.setRemodelMode(this.settings.remodelMode);
        this.hud.flashNotice("Remodel", this.settings.remodelMode ? "enabled" : "disabled");
      }
    }
    if (changedKey === "remodelSnapToGrid" || changedKey === "remodelGridSize") {
      this.applyRemodelSnapSettings();
    }
    if (changedKey === "hitboxMode") {
      this.hud.flashNotice("Hitbox mode", this.settings.hitboxMode ? "enabled" : "disabled");
      this.updateRemodelPsxLineupVisibility();
    }

    const playerRoad = this.world.getNearestRoadInfo(this.player.position);
    this.traffic.syncDensity(this.settings, playerRoad?.s ?? 0);
    this.debugOverlay.setVisible(this.settings.hitboxMode);
  }

  setRemodelMode(active) {
    const enabled = Boolean(active && this.settings.noClip);
    this.settings.remodelMode = enabled;
    this.remodelOverlay?.setVisible(enabled);
    this.world?.setHitboxTemplatesVisible(enabled);
    this.applyRemodelSnapSettings();
    this.hud?.setRemodelAvailable(this.settings.noClip);
    this.hud?.setRemodelReticleVisible(enabled);
    this.hud?.setRemodelToolsVisible(enabled);
    this.hud?.setRemodelHover(null);
    if (enabled) {
      this.input.releasePointerLock();
    } else {
      this.hud?.hideRemodelEditor();
      this.hud?.setRemodelPsxRigVisible(false);
      this.player.setCarPreset(this.getActiveVehiclePreset());
    }
    this.hud?.syncBooleanSetting?.("remodelMode");
  }

  handleRemodelPointerDown(event) {
    if (!this.settings.noClip || !this.settings.remodelMode || event.button !== 2) {
      return;
    }

    if (this.remodelOverlay.pickHovered()) {
      event.preventDefault();
    }
  }

  handleRemodelSelection(target, state) {
    if (!target || !state) {
      this.hud?.hideRemodelEditor();
      this.hud?.setRemodelPsxRigVisible(false);
      this.player.setCarPreset(this.getActiveVehiclePreset());
      return;
    }
    this.updateRemodelPsxRigVisibility(target);
    this.hud?.showRemodelEditor(target, state);
    if (target.id === GARAGE_PSX_CAR_TARGET_ID) {
      this.hud?.setRemodelDeleteAvailable?.(false);
    }
  }

  captureSelectedRemodelUndo() {
    const target = this.remodelOverlay.getSelectedTarget?.();
    if (!target) {
      return;
    }
    const state = this.world.getRemodelTargetState(target.id);
    if (!state) {
      return;
    }
    this.remodelUndoStack.push({
      type: "state",
      id: target.id,
      state: this.world.cloneState(state),
      label: target.label,
    });
    this.remodelUndoStack = this.remodelUndoStack.slice(-50);
  }

  updateSelectedRemodelTarget(state) {
    this.captureSelectedRemodelUndo();
    const applied = this.remodelOverlay.applySelectedState(this.applySnapToRemodelState(state));
    if (applied) {
      const target = this.remodelOverlay.getSelectedTarget?.();
      if (target) {
        this.updateRemodelPsxRigVisibility(target);
        this.hud.showRemodelEditor(target, applied);
      }
      this.hud.setRemodelEditorStatus("Live edit");
    }
  }

  createRemodelTarget(preset = null) {
    if (!this.settings.noClip || !this.settings.remodelMode) {
      this.hud.flashNotice("Remodel", "enable remodel first");
      return;
    }

    if (preset === "guardrail") {
      this.createGuardrailRemodelPreset();
      return;
    }

    const pitch = this.noClipRig.pitch ?? 0;
    const pitchScale = Math.cos(pitch);
    const forward = new THREE.Vector3(
      Math.sin(this.noClipRig.yaw) * pitchScale,
      Math.sin(pitch),
      Math.cos(this.noClipRig.yaw) * pitchScale,
    );
    const position = this.noClipRig.position.clone().addScaledVector(forward, 7);
    const presetState = typeof preset === "string" ? REMODEL_PRESETS[preset] : null;
    const result = this.remodelOverlay.createBox(this.applySnapToRemodelState({
      position: {
        x: position.x,
        y: Math.max(0.5, presetState?.position?.y ?? position.y),
        z: position.z,
      },
      rotation: presetState?.rotation
        ? { ...presetState.rotation, y: this.noClipRig.yaw }
        : { x: 0, y: this.noClipRig.yaw, z: 0 },
      dimensions: presetState?.dimensions ?? { x: 2, y: 1, z: 2 },
    }));
    if (!result?.target || !result.state) {
      this.hud.flashNotice("Create failed", "no target made");
      return;
    }

    this.updateRemodelPsxRigVisibility(result.target);
    this.hud.showRemodelEditor(result.target, result.state);
    this.remodelUndoStack.push({ type: "created", id: result.target.id, label: result.target.label });
    this.hud.setRemodelEditorStatus(preset ? `New ${preset}` : "New piece");
    this.hud.flashNotice("Created", result.target.label ?? "new box");
  }

  createGuardrailRemodelPreset() {
    const yaw = this.noClipRig.yaw;
    const pitch = this.noClipRig.pitch ?? 0;
    const pitchScale = Math.cos(pitch);
    const forward = new THREE.Vector3(
      Math.sin(yaw) * pitchScale,
      0,
      Math.cos(yaw) * pitchScale,
    ).normalize();
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const base = this.noClipRig.position.clone().addScaledVector(forward, 7);
    base.y = 0;

    const toWorld = (x, y, z) => ({
      x: base.x + right.x * x + forward.x * z,
      y,
      z: base.z + right.z * x + forward.z * z,
    });
    const railLength = 18.8;
    const pieces = [
      { position: toWorld(0, 0.88, 0), dimensions: { x: 0.18, y: 0.18, z: railLength }, color: "#8f9698" },
      { position: toWorld(0, 0.48, 0), dimensions: { x: 0.14, y: 0.16, z: railLength }, color: "#3a3f42" },
      { position: toWorld(0, 0.56, 0), dimensions: { x: 0.22, y: 1.18, z: 0.22 }, color: "#3a3f42" },
      { position: toWorld(-0.13, 0.86, 0), dimensions: { x: 0.06, y: 0.18, z: 0.5 }, color: "#d8a64b" },
    ];

    let lastResult = null;
    for (const piece of pieces) {
      lastResult = this.remodelOverlay.createBox(this.applySnapToRemodelState({
        position: piece.position,
        rotation: { x: 0, y: yaw, z: 0 },
        dimensions: piece.dimensions,
        color: piece.color,
      }));
      if (lastResult?.target) {
        this.remodelUndoStack.push({ type: "created", id: lastResult.target.id, label: lastResult.target.label });
      }
    }

    if (lastResult?.target && lastResult.state) {
      this.updateRemodelPsxRigVisibility(lastResult.target);
      this.hud.showRemodelEditor(lastResult.target, lastResult.state);
      this.hud.setRemodelEditorStatus("New guardrail");
      this.hud.flashNotice("Created", "guardrail module");
    } else {
      this.hud.flashNotice("Create failed", "no guardrail made");
    }
  }

  deleteSelectedRemodelTarget() {
    const target = this.remodelOverlay.getSelectedTarget?.();
    if (target?.id === GARAGE_PSX_CAR_TARGET_ID) {
      this.hud.flashNotice("PSX rig", "garage car target is fixed");
      return;
    }
    this.captureSelectedRemodelUndo();
    const deleted = this.remodelOverlay.deleteSelected();
    if (!deleted) {
      this.hud.flashNotice("Delete", "select a piece first");
      return;
    }

    this.hud.hideRemodelEditor();
    this.hud.setRemodelPsxRigVisible(false);
    this.hud.flashNotice("Deleted", deleted.label ?? "piece removed");
  }

  applyRemodelSnapSettings() {
    this.remodelOverlay?.setSnap(
      Boolean(this.settings.remodelSnapToGrid),
      this.settings.remodelGridSize,
    );
  }

  applySnapToRemodelState(state) {
    if (!this.settings.remodelSnapToGrid) {
      return state;
    }

    const gridSize = Math.max(0.01, Number(this.settings.remodelGridSize) || 0.25);
    const snap = (value) => Math.round(Number(value) / gridSize) * gridSize;
    return {
      ...state,
      position: {
        x: snap(state.position.x),
        y: snap(state.position.y),
        z: snap(state.position.z),
      },
    };
  }

  saveRemodelMap() {
    const count = this.world.saveRemodelOverrides();
    if (count === null) {
      this.hud.flashNotice("Map save failed", "localStorage blocked");
      this.hud.setRemodelEditorStatus("Save failed");
      return;
    }

    this.hud.flashNotice("Map saved", `${count} edit${count === 1 ? "" : "s"} stored`);
    this.hud.setRemodelEditorStatus("Saved");
  }

  resetSelectedRemodelTarget() {
    this.captureSelectedRemodelUndo();
    const result = this.remodelOverlay.resetSelected();
    if (!result) {
      return;
    }

    this.updateRemodelPsxRigVisibility(result.target);
    this.hud.showRemodelEditor(result.target, result.state);
    this.hud.flashNotice("Model reset", "save map to persist");
  }

  closeRemodelEditor() {
    this.remodelOverlay.clearSelection();
    this.hud.hideRemodelEditor();
    this.hud.setRemodelPsxRigVisible(false);
    this.player.setCarPreset(this.getActiveVehiclePreset());
  }

  copyRemodelTarget() {
    const target = this.remodelOverlay.getSelectedTarget?.();
    const state = target ? this.world.getRemodelTargetState(target.id) : null;
    if (!target || !state) {
      this.hud.flashNotice("Copy", "select a piece first");
      return;
    }

    this.remodelClipboard = this.world.cloneState(state);
    this.hud.flashNotice("Copied", target.label ?? "piece");
  }

  pasteRemodelTarget() {
    if (!this.remodelClipboard) {
      this.hud.flashNotice("Paste", "clipboard empty");
      return;
    }

    const result = this.remodelOverlay.createBox(this.applySnapToRemodelState({
      ...this.world.cloneState(this.remodelClipboard),
      position: {
        x: this.remodelClipboard.position.x + 1.4,
        y: this.remodelClipboard.position.y,
        z: this.remodelClipboard.position.z + 1.4,
      },
    }));
    if (!result?.target) {
      this.hud.flashNotice("Paste failed", "no target made");
      return;
    }

    this.remodelUndoStack.push({ type: "created", id: result.target.id, label: result.target.label });
    this.updateRemodelPsxRigVisibility(result.target);
    this.hud.showRemodelEditor(result.target, result.state);
    this.hud.flashNotice("Pasted", result.target.label ?? "new box");
  }

  undoRemodel() {
    const entry = this.remodelUndoStack.pop();
    if (!entry) {
      this.hud.flashNotice("Undo", "nothing to undo");
      return;
    }

    if (entry.type === "created") {
      if (this.world.getRemodelTarget(entry.id)) {
        this.world.deleteRemodelTarget(entry.id);
        this.remodelOverlay.refresh(null);
      }
      this.hud.hideRemodelEditor();
      this.hud.setRemodelPsxRigVisible(false);
      this.hud.flashNotice("Undo", "creation removed");
      return;
    }

    const applied = this.world.applyRemodelTargetState(entry.id, entry.state);
    this.remodelOverlay.refresh(entry.id);
    const target = this.world.getRemodelTarget(entry.id);
    if (target && applied) {
      this.updateRemodelPsxRigVisibility(target);
      this.hud.showRemodelEditor(target, applied);
    }
    this.hud.flashNotice("Undo", entry.label ?? "state restored");
  }

  distance2D(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }

  getPlayerSpeed() {
    return this.player.speedMagnitude ?? Math.abs(this.player.speed);
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
