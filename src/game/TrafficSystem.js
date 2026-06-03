import * as THREE from "three";
import { LANES, TRAFFIC_CAR_IDS, getCarPreset } from "./config.js";
import { createTrafficCarAsset, warmTrafficCarAsset } from "./PlayerCarAsset.js";
import { choice, clamp, damp, dampAngle, makeBox, rand } from "./utils.js";

const TRAFFIC_COLORS = [
  0xb8b4a8,
  0xd6d3c8,
  0x4c5459,
  0x273c4d,
  0x7d2520,
  0x4d594c,
  0xd6ad3d,
  0x30a78f,
  0x2d6a78,
  0x8e2f29,
  0xe9e2cf,
  0x222529,
];
const ACTIVE_AHEAD = 760;
const ACTIVE_BEHIND = 180;
const RECYCLE_AHEAD = 860;
const RECYCLE_BEHIND = 300;
const SAFE_FRONT_SPAWN = 135;
const SAFE_BACK_SPAWN = 85;
const DENSITY_TO_ACTIVE_CARS = 0.145;
const MIN_ACTIVE_CARS = 12;
const MAX_ACTIVE_CARS = 72;
const NIGHT_TRAFFIC_BOOST = 1.24;
const GRAPHICS_TRAFFIC_LIMITS = [
  { min: 5, max: 18 },
  { min: 8, max: 34 },
  { min: MIN_ACTIVE_CARS, max: MAX_ACTIVE_CARS },
];
const LANE_CHANGE_SIGNAL_LEAD = 1.15;
const LANE_CHANGE_SIGNAL_HOLD = 0.55;
const LANE_CHANGE_FINISH_EPSILON = 0.16;
const LANE_CHANGE_RESPONSE_CAR = 0.58;
const LANE_CHANGE_RESPONSE_TRUCK = 0.42;
const JUNCTION_TAKE_CHANCE_PER_SECOND = 0.34;
// How far ahead a car looks for its lane closing, so it merges early with a gap
// instead of being snapped sideways into another car at the pinch point.
const LANE_CLOSURE_LOOKAHEAD = 95;
const MERGE_YIELD_FACTOR = 0.6;
const TRAFFIC_INDICATOR_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xffb21a });
const TRAFFIC_DENSITY_ADJUST_INTERVAL = 0.18;

export class TrafficSystem {
  constructor(scene, world, options = {}) {
    this.scene = scene;
    this.world = world;
    this.getVehicleRigForCar = options.getVehicleRigForCar ?? (() => ({}));
    this.cars = [];
    this.nextId = 1;
    this.activeTarget = 0;
    this.densityAdjustTimer = 0;
    this.boundsRevision = 0;
  }

  prewarm(settings = {}) {
    for (const modelId of TRAFFIC_CAR_IDS) {
      warmTrafficCarAsset(this.getTrafficPreset(modelId, this.pickTrafficColor()));
    }

    const warmCount = Math.min(this.getActiveTarget(settings), TRAFFIC_CAR_IDS.length * 2);
    for (let i = this.cars.length; i < warmCount; i += 1) {
      const car = this.createVehicle();
      car.group.visible = false;
      this.scene.add(car.group);
      this.cars.push(car);
    }
  }

  reset(settings, focusS = 0) {
    const target = this.getActiveTarget(settings);
    this.activeTarget = target;
    this.densityAdjustTimer = 0;
    while (this.cars.length < target) {
      const car = this.createVehicle();
      car.group.visible = false;
      this.scene.add(car.group);
      this.cars.push(car);
    }
    while (this.cars.length > target) {
      const car = this.cars.pop();
      this.scene.remove(car.group);
      this.disposeObjectMaterials(car.group);
    }

    const openLanes = this.getOpenLanesAtS(focusS);
    const basePerLane = Math.floor(target / openLanes.length);
    let remainder = target % openLanes.length;
    let carIndex = 0;

    for (const lane of openLanes) {
      const laneTarget = basePerLane + (remainder > 0 ? 1 : 0);
      remainder = Math.max(0, remainder - 1);
      const spacing = (ACTIVE_AHEAD + ACTIVE_BEHIND) / Math.max(laneTarget, 1);
      const phase = rand(0, spacing);

      for (let i = 0; i < laneTarget; i += 1) {
        const car = this.cars[carIndex];
        carIndex += 1;
        let offset = -ACTIVE_BEHIND + phase + i * spacing + rand(-spacing * 0.28, spacing * 0.28);
        if (offset > -SAFE_BACK_SPAWN && offset < SAFE_FRONT_SPAWN) {
          offset = SAFE_FRONT_SPAWN + rand(20, 180);
        }
        car.group.visible = true;
        car.s = this.normalizeS(focusS + offset);
        car.route = { type: "main", s: car.s };
        car.lane = lane;
        car.lateralOffset = this.getLaneOffset(car.s, lane);
        car.targetLane = null;
        car.signalTimer = 0;
        car.signalHoldTimer = 0;
        car.signalDirection = 0;
        car.nearMissCooldown = 0;
        car.mergeYield = false;
        car.laneChangeCooldown = rand(0, 3.5);
        car.junctionCooldown = rand(0.5, 5.5);
        car.overtakeArmed = false;
        this.randomizeSpeed(car, settings);
        this.applyFrame(car, 1, true);
      }
    }
  }

  syncDensity(settings, focusS = 0) {
    const target = this.getActiveTarget(settings);
    this.activeTarget = target;

    if (this.cars.length < target) {
      const car = this.createVehicle();
      car.lane = this.pickOpenLane(focusS);
      car.s = this.findOpenSpawnS(car.lane, focusS, "ahead");
      car.route = { type: "main", s: car.s };
      car.lateralOffset = this.getLaneOffset(car.s, car.lane);
      this.randomizeSpeed(car, settings);
      this.scene.add(car.group);
      this.cars.push(car);
      this.applyFrame(car, 1, true);
    }

    if (this.cars.length > target) {
      const car = this.cars.pop();
      this.scene.remove(car.group);
      this.disposeObjectMaterials(car.group);
    }
  }

  update(dt, settings, focusS = 0) {
    const target = this.getActiveTarget(settings);
    this.densityAdjustTimer = Math.max(0, this.densityAdjustTimer - dt);
    if (target !== this.activeTarget || (this.cars.length !== target && this.densityAdjustTimer <= 0)) {
      this.densityAdjustTimer = TRAFFIC_DENSITY_ADJUST_INTERVAL;
      this.syncDensity(settings, focusS);
    }

    for (const car of this.cars) {
      car.nearMissCooldown = Math.max(0, car.nearMissCooldown - dt);
      car.laneChangeCooldown = Math.max(0, car.laneChangeCooldown - dt);
      this.updateLaneChangeSignal(car, dt);
      this.updateSpeed(car, dt, settings);
      this.updateRouteProgress(car, dt);
      if (this.isOutsideActiveWindow(car.s, focusS)) {
        this.recycleCar(car, settings, focusS);
      }
      this.applyFrame(car, dt);
    }
  }

  getActiveTarget(settings) {
    if (settings.trafficEnabled === false) {
      return 0;
    }

    const rawQuality = Number(settings.graphicsQuality);
    const quality = settings.ultraGraphics
      ? 2
      : clamp(Number.isFinite(rawQuality) ? Math.round(rawQuality) : 1, 0, 2);
    const limit = GRAPHICS_TRAFFIC_LIMITS[quality] ?? GRAPHICS_TRAFFIC_LIMITS[1];
    const hour = ((Number(settings.timeOfDay ?? 12) % 24) + 24) % 24;
    const daylight = hour >= 7 && hour <= 18.5
      ? 1
      : hour > 5.5 && hour < 7
        ? (hour - 5.5) / 1.5
        : hour > 18.5 && hour < 20
          ? 1 - (hour - 18.5) / 1.5
          : 0;
    const nightBoost = 1 + (1 - daylight) * (NIGHT_TRAFFIC_BOOST - 1);
    return clamp(
      Math.round(settings.trafficDensity * DENSITY_TO_ACTIVE_CARS * nightBoost),
      limit.min,
      limit.max,
    );
  }

  normalizeS(s) {
    return ((s % this.world.trackLength) + this.world.trackLength) % this.world.trackLength;
  }

  signedDistanceFromFocus(s, focusS) {
    const forward = (s - focusS + this.world.trackLength) % this.world.trackLength;
    return forward > this.world.trackLength * 0.5 ? forward - this.world.trackLength : forward;
  }

  getOpenLanesAtS(s) {
    const lanes = this.world.getOpenLaneIndexesAtDistance?.(s);
    return Array.isArray(lanes) && lanes.length ? lanes : LANES.map((_offset, lane) => lane);
  }

  pickOpenLane(s) {
    return choice(this.getOpenLanesAtS(s));
  }

  isLaneOpen(s, lane) {
    return this.world.isLaneOpenAtDistance?.(s, lane) ?? true;
  }

  getLaneOffset(s, lane) {
    return this.world.getLaneOffsetAtDistance?.(s, lane) ?? LANES[clamp(lane, 0, LANES.length - 1)];
  }

  ensureOpenLane(car) {
    if (this.isLaneOpen(car.s, car.lane)) {
      return;
    }

    const previousOffset = this.getLaneOffset(car.s, car.lane);
    const nextLane = this.world.getNearestOpenLaneIndex?.(car.s, car.lateralOffset ?? previousOffset) ?? this.pickOpenLane(car.s);
    car.lane = nextLane;
    if (car.targetLane !== null && !this.isLaneOpen(car.s, car.targetLane)) {
      car.targetLane = null;
      car.signalTimer = 0;
    }
    car.signalDirection = Math.sign(this.getLaneOffset(car.s, car.lane) - car.lateralOffset);
  }

  isOutsideActiveWindow(s, focusS) {
    const delta = this.signedDistanceFromFocus(s, focusS);
    return delta < -RECYCLE_BEHIND || delta > RECYCLE_AHEAD;
  }

  recycleCar(car, settings, focusS) {
    const delta = this.signedDistanceFromFocus(car.s, focusS);
    const mode = delta < -RECYCLE_BEHIND ? "ahead" : "behind";
    car.lane = this.pickOpenLane(focusS);
    car.s = this.findOpenSpawnS(car.lane, focusS, mode);
    car.route = { type: "main", s: car.s };
    car.lateralOffset = this.getLaneOffset(car.s, car.lane);
    car.nearMissCooldown = 0.5;
    car.overtakeArmed = false;
    car.mergeYield = false;
    car.targetLane = null;
    car.signalTimer = 0;
    car.signalHoldTimer = 0;
    car.signalDirection = 0;
    car.junctionCooldown = rand(1.5, 4.5);
    this.updateIndicators(car, 0);
    this.randomizeAppearance(car);
    this.randomizeSpeed(car, settings);
    this.applyFrame(car, 1, true);
  }

  updateSpeed(car, dt, settings) {
    car.cruiseSpeed = (settings.trafficSpeedKmh / 3.6) * car.speedFactor;
    const blocker = this.findBlocker(car);
    let targetSpeed = car.cruiseSpeed;

    if (blocker) {
      const safeSpeed = Math.max(8, blocker.speed - 2.2);
      targetSpeed = Math.min(targetSpeed, safeSpeed);
      if (car.laneChangeCooldown <= 0 && car.targetLane === null) {
        this.tryLaneChange(car);
      }
    }

    // Yielding to slot into the open lane before a lane closure: ease off so a
    // gap opens up instead of forcing a side-by-side merge into the pinch.
    if (car.mergeYield) {
      targetSpeed = Math.min(targetSpeed, car.cruiseSpeed * MERGE_YIELD_FACTOR);
    }

    car.speed = damp(car.speed, targetSpeed, blocker || car.mergeYield ? 4.2 : 0.9, dt);
  }

  updateRouteProgress(car, dt) {
    car.junctionCooldown = Math.max(0, (car.junctionCooldown ?? 0) - dt);

    if (car.route?.type === "branch") {
      car.route.s += car.speed * dt * (car.route.direction >= 0 ? 1 : -1);
      const exit = this.world.resolveBranchExit?.(car.route);
      if (exit) {
        car.s = this.normalizeS(exit.s + rand(4, 18));
        car.route = { type: "main", s: car.s };
        car.lane = this.pickLaneForJunctionSide(exit.side, exit.s);
        car.targetLane = null;
        car.lateralOffset = this.getLaneOffset(car.s, car.lane);
        car.junctionCooldown = rand(5, 10);
      } else {
        car.s = this.normalizeS(car.s + car.speed * dt);
      }
      return;
    }

    car.s = this.normalizeS(car.s + car.speed * dt);
    car.route = { type: "main", s: car.s };
    this.ensureOpenLane(car);
    this.handleUpcomingLaneClosure(car);
    if (car.junctionCooldown > 0 || car.targetLane !== null || Math.abs(this.getLaneOffset(car.s, car.lane) - car.lateralOffset) > 0.34) {
      return;
    }

    const branchChoice = this.world.findBranchChoiceForMainS?.(car.s, car.lane, Math.random);
    if (!branchChoice || Math.random() > JUNCTION_TAKE_CHANCE_PER_SECOND * dt) {
      return;
    }

    car.route = { type: "branch", ...branchChoice };
    car.targetLane = null;
    car.signalDirection = Math.sign(this.getLaneOffset(car.s, car.lane) || 0);
    car.signalHoldTimer = LANE_CHANGE_SIGNAL_HOLD;
    car.junctionCooldown = rand(6, 12);
  }

  pickLaneForJunctionSide(side, s = 0) {
    const sign = Math.sign(side || 1);
    const lanes = this.getOpenLanesAtS(s)
      .map((lane) => {
        const offset = this.getLaneOffset(s, lane);
        return { lane, score: Math.sign(offset || 0) === sign ? Math.abs(offset) : -1 };
      })
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score);
    return lanes[0]?.lane ?? Math.floor(LANES.length * 0.5);
  }

  // Anticipate a lane that closes ahead: start an early, gap-checked merge toward
  // the nearest open lane. If no gap exists yet, flag the car to yield (slow down)
  // so a gap opens, instead of waiting for ensureOpenLane to snap it across.
  handleUpcomingLaneClosure(car) {
    if (car.route?.type === "branch") {
      car.mergeYield = false;
      return;
    }

    const aheadS = this.normalizeS(car.s + LANE_CLOSURE_LOOKAHEAD);
    if (this.isLaneOpen(aheadS, car.lane)) {
      car.mergeYield = false;
      return;
    }

    // Our lane disappears ahead. Pick the open lane nearest us and step toward it.
    const openLanes = this.getOpenLanesAtS(aheadS);
    if (!openLanes.length) {
      return;
    }
    const target = openLanes
      .slice()
      .sort((a, b) => Math.abs(a - car.lane) - Math.abs(b - car.lane))[0];
    if (target === car.lane) {
      car.mergeYield = false;
      return;
    }

    const nextLane = car.lane + Math.sign(target - car.lane);
    if (car.targetLane === null && this.isLaneOpen(car.s, nextLane) && this.hasLaneOpening(car, nextLane)) {
      car.targetLane = nextLane;
      car.signalDirection = Math.sign(this.getLaneOffset(car.s, nextLane) - this.getLaneOffset(car.s, car.lane));
      car.signalTimer = Math.min(LANE_CHANGE_SIGNAL_LEAD, 0.5);
      car.laneChangeCooldown = rand(2.5, 4.5);
      car.mergeYield = false;
    } else if (car.targetLane === null) {
      // No gap yet — ease off until one appears (zipper merge).
      car.mergeYield = true;
    }
  }

  tryLaneChange(car) {
    const openLanes = this.getOpenLanesAtS(car.s);
    const candidates = [car.lane - 1, car.lane + 1]
      .filter((lane) => openLanes.includes(lane))
      .sort(() => Math.random() - 0.5);

    for (const lane of candidates) {
      if (this.hasLaneOpening(car, lane)) {
        car.targetLane = lane;
        car.signalDirection = Math.sign(this.getLaneOffset(car.s, lane) - this.getLaneOffset(car.s, car.lane));
        car.signalTimer = LANE_CHANGE_SIGNAL_LEAD;
        car.laneChangeCooldown = rand(4.2, 8.2);
        return true;
      }
    }

    car.laneChangeCooldown = rand(2.2, 4.2);
    return false;
  }

  updateLaneChangeSignal(car, dt) {
    if (car.targetLane !== null) {
      car.signalTimer = Math.max(0, car.signalTimer - dt);
      if (car.signalTimer <= 0) {
        if (this.hasLaneOpening(car, car.targetLane)) {
          car.signalDirection = Math.sign(this.getLaneOffset(car.s, car.targetLane) - this.getLaneOffset(car.s, car.lane));
          car.lane = car.targetLane;
          car.signalHoldTimer = LANE_CHANGE_SIGNAL_HOLD;
        } else {
          car.signalDirection = 0;
          car.laneChangeCooldown = rand(1.4, 2.8);
        }
        car.targetLane = null;
      }
    } else {
      const laneTargetOffset = this.getLaneOffset(car.s, car.lane);
      const laneChangeStillMoving = Math.abs(laneTargetOffset - car.lateralOffset) > LANE_CHANGE_FINISH_EPSILON;
      if (car.signalDirection !== 0 && (laneChangeStillMoving || car.signalHoldTimer > 0)) {
        car.signalHoldTimer = Math.max(0, car.signalHoldTimer - dt);
      } else {
        car.signalDirection = 0;
        car.signalHoldTimer = 0;
      }
    }
    car.signalClock += dt;
  }

  hasLaneOpening(car, lane) {
    if (!this.isLaneOpen(car.s, lane)) {
      return false;
    }

    for (const other of this.cars) {
      if (other === car || other.lane !== lane || this.getRouteKey(other) !== this.getRouteKey(car)) {
        continue;
      }

      const frontGap = (other.s - car.s + this.world.trackLength) % this.world.trackLength;
      const backGap = (car.s - other.s + this.world.trackLength) % this.world.trackLength;
      const carBounds = this.getTrafficBounds(car);
      const otherBounds = this.getTrafficBounds(other);
      if (frontGap < 42 + otherBounds.length * 0.5 || backGap < 30 + carBounds.length * 0.5) {
        return false;
      }
    }

    return true;
  }

  findOpenSpawnS(lane, focusS = 0, mode = "any") {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const offset = this.pickSpawnOffset(mode);
      const s = this.normalizeS(focusS + offset);
      const clear = this.cars.every((other) => {
        if (other.lane !== lane) {
          return true;
        }
        const frontGap = (other.s - s + this.world.trackLength) % this.world.trackLength;
        const backGap = (s - other.s + this.world.trackLength) % this.world.trackLength;
        return frontGap > 48 && backGap > 32;
      });
      if (clear) {
        return s;
      }
    }

    return this.normalizeS(focusS + this.pickSpawnOffset(mode));
  }

  pickSpawnOffset(mode) {
    if (mode === "behind") {
      return rand(-ACTIVE_BEHIND, -SAFE_BACK_SPAWN);
    }
    if (mode === "ahead") {
      return rand(SAFE_FRONT_SPAWN, ACTIVE_AHEAD);
    }
    return Math.random() < 0.76
      ? rand(SAFE_FRONT_SPAWN, ACTIVE_AHEAD)
      : rand(-ACTIVE_BEHIND, -SAFE_BACK_SPAWN);
  }

  findBlocker(car) {
    const routeKey = this.getRouteKey(car);
    let closest = null;
    let closestDistance = Infinity;
    const carBounds = this.getTrafficBounds(car);

    for (const other of this.cars) {
      if (other === car || other.lane !== car.lane || this.getRouteKey(other) !== routeKey) {
        continue;
      }

      const distance = (other.s - car.s + this.world.trackLength) % this.world.trackLength;
      const otherBounds = this.getTrafficBounds(other);
      const followingDistance = 22 + carBounds.length * 0.7 + otherBounds.length * 0.4;
      if (distance > 0 && distance < followingDistance && distance < closestDistance) {
        closest = other;
        closestDistance = distance;
      }
    }

    return closest;
  }

  getRouteKey(car) {
    return car.route?.type === "branch" ? `branch:${car.route.id}` : "main";
  }

  getTrafficBounds(car) {
    const height = car.kind === "truck" ? 2.75 : 1.55;
    const centerY = car.kind === "truck" ? 1.38 : 0.78;
    const key = `${car.kind}:${car.width}:${height}:${car.length}:${centerY}`;
    if (
      car.trafficBounds &&
      car.trafficBoundsKey === key &&
      car.trafficBoundsRevision === this.boundsRevision
    ) {
      return car.trafficBounds;
    }

    car.trafficBoundsKey = key;
    car.trafficBoundsRevision = this.boundsRevision;
    car.trafficBounds = this.world.getHitboxProfile(
      car.kind === "truck" ? "hitbox:traffic-truck" : "hitbox:traffic-car",
      {
        width: car.width,
        height,
        length: car.length,
        centerX: 0,
        centerY,
        centerZ: 0,
        yawOffset: 0,
      },
    );
    return car.trafficBounds;
  }

  invalidateBounds() {
    this.boundsRevision += 1;
    for (const car of this.cars) {
      car.trafficBounds = null;
    }
  }

  randomizeSpeed(car, settings) {
    car.speedFactor = car.kind === "truck" ? rand(0.68, 0.88) : rand(0.84, 1.16);
    car.cruiseSpeed = (settings.trafficSpeedKmh / 3.6) * car.speedFactor;
    car.speed = car.cruiseSpeed * rand(0.92, 1.04);
  }

  pickTrafficColor(previousColor = null) {
    if (TRAFFIC_COLORS.length <= 1) {
      return TRAFFIC_COLORS[0] ?? 0xb8b4a8;
    }

    let color = choice(TRAFFIC_COLORS);
    for (let attempt = 0; attempt < 4 && color === previousColor; attempt += 1) {
      color = choice(TRAFFIC_COLORS);
    }
    return color;
  }

  randomizeAppearance(car) {
    const nextColor = this.pickTrafficColor(car.trafficColor);
    if (nextColor === car.trafficColor) {
      return;
    }

    car.trafficColor = nextColor;
    this.recolorTrafficVisual(car.group, nextColor);
  }

  applyFrame(car, dt = 1 / 60, snap = false) {
    if (car.route?.type !== "branch") {
      this.ensureOpenLane(car);
    }
    const frame = car.route?.type === "branch"
      ? this.world.getBranchFrame?.(car.route.id, car.route.s, car.frameScratch) ?? this.world.getFrameAtDistance(car.s, car.frameScratch)
      : this.world.getFrameAtDistance(car.s, car.frameScratch);
    if (car.route?.type === "branch" && car.route.direction < 0) {
      frame.tangent.multiplyScalar(-1);
      frame.normal.multiplyScalar(-1);
      frame.yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
    }
    const targetOffset = car.route?.type === "branch"
      ? LANES[clamp(car.lane, 0, LANES.length - 1)]
      : this.getLaneOffset(car.s, car.lane);
    const laneChangeResponse = car.kind === "truck" ? LANE_CHANGE_RESPONSE_TRUCK : LANE_CHANGE_RESPONSE_CAR;
    car.lateralOffset = snap ? targetOffset : damp(car.lateralOffset, targetOffset, laneChangeResponse, dt);
    car.x = frame.center.x + frame.normal.x * car.lateralOffset;
    car.z = frame.center.z + frame.normal.z * car.lateralOffset;
    car.yaw = frame.yaw;
    car.visualYaw = snap || car.visualYaw === undefined
      ? frame.yaw
      : dampAngle(car.visualYaw, frame.yaw, car.kind === "truck" ? 2.2 : 2.8, dt);
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.visualYaw;
    this.updateIndicators(car, dt);
  }

  updateIndicators(car, dt) {
    if (!car.indicators) {
      return;
    }

    const activeTargetLane = car.targetLane ?? car.lane;
    const targetOffset = this.getLaneOffset(car.s, activeTargetLane);
    const offsetDelta = targetOffset - car.lateralOffset;
    const signalDirection = car.targetLane !== null
      ? Math.sign(this.getLaneOffset(car.s, car.targetLane) - this.getLaneOffset(car.s, car.lane))
      : car.signalDirection !== 0
        ? car.signalDirection
        : Math.abs(offsetDelta) > 0.22 || car.signalHoldTimer > 0
          ? Math.sign(offsetDelta || (targetOffset - this.getLaneOffset(car.s, car.lane)))
        : 0;
    const blinkOn = signalDirection !== 0 && Math.sin(car.signalClock * Math.PI * 4.2) > -0.1;
    car.indicators.left.forEach((mesh) => {
      mesh.visible = signalDirection < 0 && blinkOn;
    });
    car.indicators.right.forEach((mesh) => {
      mesh.visible = signalDirection > 0 && blinkOn;
    });
  }

  createVehicle() {
    const trafficModel = choice(TRAFFIC_CAR_IDS);
    const trafficColor = this.pickTrafficColor();
    const visual = this.createTrafficVisual(trafficModel, trafficColor);

    return {
      id: this.nextId++,
      trafficModel,
      trafficColor,
      kind: "car",
      group: visual.group,
      width: visual.width,
      length: visual.length,
      lane: 1,
      lateralOffset: LANES[1],
      s: 0,
      route: { type: "main", s: 0 },
      x: 0,
      z: 0,
      yaw: 0,
      visualYaw: 0,
      speed: 0,
      speedFactor: 1,
      cruiseSpeed: 0,
      nearMissCooldown: 0,
      laneChangeCooldown: rand(0, 3.5),
      targetLane: null,
      signalTimer: 0,
      signalHoldTimer: 0,
      signalDirection: 0,
      signalClock: rand(0, 1),
      junctionCooldown: rand(0.5, 5.5),
      indicators: visual.indicators,
      frameScratch: {
        center: new THREE.Vector3(),
        tangent: new THREE.Vector3(),
        normal: new THREE.Vector3(),
      },
      overtakeArmed: false,
      mergeYield: false,
      trafficBounds: null,
      trafficBoundsKey: "",
      trafficBoundsRevision: -1,
    };
  }

  createTrafficVisual(modelId, bodyColor = null) {
    try {
      const preset = this.getTrafficPreset(modelId, bodyColor);
      const group = createTrafficCarAsset(preset);
      group.name = `TrafficPSX_${modelId}`;
      const indicators = this.createIndicatorMeshes(preset.bodyWidth, preset.bodyLength);
      [...indicators.left, ...indicators.right].forEach((mesh) => group.add(mesh));
      return {
        group,
        indicators,
        width: preset.bodyWidth,
        length: preset.bodyLength,
      };
    } catch (error) {
      console.warn(`Unable to build PSX traffic car ${modelId}; using lightweight fallback.`, error);
      return this.createFallbackTrafficVisual(modelId, bodyColor);
    }
  }

  recolorTrafficVisual(group, color) {
    group?.traverse((child) => {
      if (!child.isMesh || !child.material) {
        return;
      }
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if ((material?.name === "psxBodyPaint" || material?.name === "trafficBodyPaint") && material.color) {
          material.color.set(color);
          material.needsUpdate = true;
        }
      }
    });
  }

  getTrafficPreset(modelId, bodyColor = null) {
    const preset = getCarPreset(modelId);
    const rig = this.getVehicleRigForCar(modelId) ?? {};
    const paintColor = bodyColor ?? rig.bodyColor ?? preset.color;
    return {
      ...preset,
      id: modelId,
      carId: modelId,
      color: paintColor,
      wheelModel: rig.wheelModel || preset.wheelModel,
      wheelColor: rig.wheelColor,
      vehicleRig: {
        ...rig,
        bodyColor: paintColor,
      },
    };
  }

  createIndicatorMeshes(bodyWidth, bodyLength) {
    const indicatorInset = bodyWidth * 0.42;
    const frontZ = bodyLength / 2 + 0.05;
    const rearZ = -bodyLength / 2 - 0.05;
    const left = [
      makeBox(0.2, 0.12, 0.1, TRAFFIC_INDICATOR_MATERIAL, new THREE.Vector3(-indicatorInset, 0.78, frontZ)),
      makeBox(0.2, 0.12, 0.1, TRAFFIC_INDICATOR_MATERIAL, new THREE.Vector3(-indicatorInset, 0.78, rearZ)),
    ];
    const right = [
      makeBox(0.2, 0.12, 0.1, TRAFFIC_INDICATOR_MATERIAL, new THREE.Vector3(indicatorInset, 0.78, frontZ)),
      makeBox(0.2, 0.12, 0.1, TRAFFIC_INDICATOR_MATERIAL, new THREE.Vector3(indicatorInset, 0.78, rearZ)),
    ];
    [...left, ...right].forEach((mesh) => {
      mesh.visible = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
    return { left, right };
  }

  createFallbackTrafficVisual(modelId, bodyColor = null) {
    const color = bodyColor ?? choice(TRAFFIC_COLORS);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      name: "trafficBodyPaint",
      color,
      roughness: 0.5,
      metalness: 0.12,
      flatShading: true,
    });
    const panelMaterial = new THREE.MeshStandardMaterial({
      color: 0x41484a,
      roughness: 0.72,
      metalness: 0.08,
      flatShading: true,
    });
    const glassMaterial = new THREE.MeshStandardMaterial({
      color: 0x111820,
      roughness: 0.22,
      metalness: 0.22,
      flatShading: true,
    });
    const headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xffefd0 });
    const tailMaterial = new THREE.MeshBasicMaterial({ color: 0xb42520 });

    const group = new THREE.Group();
    group.name = `TrafficFallback_${modelId}`;
    const bodyLength = rand(3.95, 4.9);
    const bodyWidth = rand(1.74, 1.96);

    group.add(makeBox(bodyWidth, 0.66, bodyLength, bodyMaterial, new THREE.Vector3(0, 0.66, 0), true));
    group.add(makeBox(bodyWidth * 0.72, 0.48, bodyLength * 0.36, glassMaterial, new THREE.Vector3(0, 1.14, -0.18), true));
    group.add(makeBox(bodyWidth * 0.95, 0.12, 1.25, bodyMaterial, new THREE.Vector3(0, 0.51, bodyLength * 0.28), true));
    group.add(makeBox(bodyWidth * 0.94, 0.16, bodyLength * 0.86, panelMaterial, new THREE.Vector3(0, 0.3, -0.05), true));

    group.add(makeBox(bodyWidth * 0.62, 0.1, 0.08, headlightMaterial, new THREE.Vector3(0, 0.76, bodyLength / 2 + 0.02)));
    group.add(makeBox(bodyWidth * 0.68, 0.11, 0.08, tailMaterial, new THREE.Vector3(0, 0.76, -bodyLength / 2 - 0.02)));
    const indicators = this.createIndicatorMeshes(bodyWidth, bodyLength);
    [...indicators.left, ...indicators.right].forEach((mesh) => group.add(mesh));

    return {
      group,
      indicators,
      width: bodyWidth,
      length: bodyLength,
    };
  }

  refreshModel(modelId) {
    for (const car of this.cars) {
      if (car.trafficModel !== modelId) {
        continue;
      }
      const previousGroup = car.group;
      const visual = this.createTrafficVisual(modelId, car.trafficColor);
      car.group = visual.group;
      car.indicators = visual.indicators;
      car.width = visual.width;
      car.length = visual.length;
      car.trafficBounds = null;
      this.scene.remove(previousGroup);
      this.disposeObjectMaterials(previousGroup);
      this.scene.add(car.group);
      this.applyFrame(car, 1, true);
    }
  }

  disposeObjectMaterials(object) {
    object?.traverse((child) => {
      if (!child.isMesh || !child.material) {
        return;
      }
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (material === TRAFFIC_INDICATOR_MATERIAL) {
          continue;
        }
        material?.dispose?.();
      }
    });
  }
}
