import * as THREE from "three";
import { LANES } from "./config.js";
import { choice, clamp, damp, makeBox, rand } from "./utils.js";

const TRAFFIC_COLORS = [0xb8b4a8, 0xd6d3c8, 0x4c5459, 0x273c4d, 0x7d2520, 0x4d594c];
const ACTIVE_AHEAD = 760;
const ACTIVE_BEHIND = 180;
const RECYCLE_AHEAD = 860;
const RECYCLE_BEHIND = 300;
const SAFE_FRONT_SPAWN = 135;
const SAFE_BACK_SPAWN = 85;
const DENSITY_TO_ACTIVE_CARS = 0.145;
const MIN_ACTIVE_CARS = 12;
const MAX_ACTIVE_CARS = 72;

function dampAngle(current, target, lambda, dt) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-lambda * dt));
}

export class TrafficSystem {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.cars = [];
    this.nextId = 1;
  }

  reset(settings, focusS = 0) {
    for (const car of this.cars) {
      this.scene.remove(car.group);
    }

    this.cars = [];
    const target = this.getActiveTarget(settings);
    const basePerLane = Math.floor(target / LANES.length);
    let remainder = target % LANES.length;

    for (let lane = 0; lane < LANES.length; lane += 1) {
      const laneTarget = basePerLane + (remainder > 0 ? 1 : 0);
      remainder = Math.max(0, remainder - 1);
      const spacing = (ACTIVE_AHEAD + ACTIVE_BEHIND) / Math.max(laneTarget, 1);
      const phase = rand(0, spacing);

      for (let i = 0; i < laneTarget; i += 1) {
        const car = this.createVehicle();
        let offset = -ACTIVE_BEHIND + phase + i * spacing + rand(-spacing * 0.28, spacing * 0.28);
        if (offset > -SAFE_BACK_SPAWN && offset < SAFE_FRONT_SPAWN) {
          offset = SAFE_FRONT_SPAWN + rand(20, 180);
        }
        car.s = this.normalizeS(focusS + offset);
        car.lane = lane;
        car.lateralOffset = LANES[lane];
        this.randomizeSpeed(car, settings);
        this.scene.add(car.group);
        this.cars.push(car);
        this.applyFrame(car, 1, true);
      }
    }
  }

  syncDensity(settings, focusS = 0) {
    const target = this.getActiveTarget(settings);
    while (this.cars.length < target) {
      const car = this.createVehicle();
      car.lane = Math.floor(rand(0, LANES.length));
      car.s = this.findOpenSpawnS(car.lane, focusS, "ahead");
      car.lateralOffset = LANES[car.lane];
      this.randomizeSpeed(car, settings);
      this.scene.add(car.group);
      this.cars.push(car);
      this.applyFrame(car, 1, true);
    }

    while (this.cars.length > target) {
      const car = this.cars.pop();
      this.scene.remove(car.group);
    }
  }

  update(dt, settings, focusS = 0) {
    if (this.cars.length !== this.getActiveTarget(settings)) {
      this.syncDensity(settings, focusS);
    }

    for (const car of this.cars) {
      car.nearMissCooldown = Math.max(0, car.nearMissCooldown - dt);
      car.laneChangeCooldown = Math.max(0, car.laneChangeCooldown - dt);
      this.updateSpeed(car, dt, settings);
      car.s = (car.s + car.speed * dt) % this.world.trackLength;
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

    return clamp(
      Math.round(settings.trafficDensity * DENSITY_TO_ACTIVE_CARS),
      MIN_ACTIVE_CARS,
      MAX_ACTIVE_CARS,
    );
  }

  normalizeS(s) {
    return ((s % this.world.trackLength) + this.world.trackLength) % this.world.trackLength;
  }

  signedDistanceFromFocus(s, focusS) {
    const forward = (s - focusS + this.world.trackLength) % this.world.trackLength;
    return forward > this.world.trackLength * 0.5 ? forward - this.world.trackLength : forward;
  }

  isOutsideActiveWindow(s, focusS) {
    const delta = this.signedDistanceFromFocus(s, focusS);
    return delta < -RECYCLE_BEHIND || delta > RECYCLE_AHEAD;
  }

  recycleCar(car, settings, focusS) {
    const delta = this.signedDistanceFromFocus(car.s, focusS);
    const mode = delta < -RECYCLE_BEHIND ? "ahead" : "behind";
    car.lane = Math.floor(rand(0, LANES.length));
    car.s = this.findOpenSpawnS(car.lane, focusS, mode);
    car.lateralOffset = LANES[car.lane];
    car.nearMissCooldown = 0.5;
    car.overtakeArmed = false;
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
      if (car.laneChangeCooldown <= 0) {
        this.tryLaneChange(car);
      }
    }

    car.speed = damp(car.speed, targetSpeed, blocker ? 4.2 : 0.9, dt);
  }

  tryLaneChange(car) {
    const candidates = [car.lane - 1, car.lane + 1]
      .filter((lane) => lane >= 0 && lane < LANES.length)
      .sort(() => Math.random() - 0.5);

    for (const lane of candidates) {
      if (this.hasLaneOpening(car, lane)) {
        car.lane = lane;
        car.laneChangeCooldown = rand(4.2, 8.2);
        return true;
      }
    }

    car.laneChangeCooldown = rand(2.2, 4.2);
    return false;
  }

  hasLaneOpening(car, lane) {
    for (const other of this.cars) {
      if (other === car || other.lane !== lane) {
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
    let closest = null;
    let closestDistance = Infinity;

    for (const other of this.cars) {
      if (other === car || other.lane !== car.lane) {
        continue;
      }

      const distance = (other.s - car.s + this.world.trackLength) % this.world.trackLength;
      const carBounds = this.getTrafficBounds(car);
      const otherBounds = this.getTrafficBounds(other);
      const followingDistance = 22 + carBounds.length * 0.7 + otherBounds.length * 0.4;
      if (distance > 0 && distance < followingDistance && distance < closestDistance) {
        closest = other;
        closestDistance = distance;
      }
    }

    return closest;
  }

  getTrafficBounds(car) {
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

  randomizeSpeed(car, settings) {
    car.speedFactor = car.kind === "truck" ? rand(0.68, 0.88) : rand(0.84, 1.16);
    car.cruiseSpeed = (settings.trafficSpeedKmh / 3.6) * car.speedFactor;
    car.speed = car.cruiseSpeed * rand(0.92, 1.04);
  }

  applyFrame(car, dt = 1 / 60, snap = false) {
    const frame = this.world.getFrameAtDistance(car.s);
    const targetOffset = LANES[clamp(car.lane, 0, LANES.length - 1)];
    const laneChangeResponse = car.kind === "truck" ? 0.55 : 0.72;
    car.lateralOffset = snap ? targetOffset : damp(car.lateralOffset, targetOffset, laneChangeResponse, dt);
    const position = this.world.offsetPoint(frame, car.lateralOffset, 0);
    car.x = position.x;
    car.z = position.z;
    car.yaw = frame.yaw;
    car.visualYaw = snap || car.visualYaw === undefined
      ? frame.yaw
      : dampAngle(car.visualYaw, frame.yaw, car.kind === "truck" ? 2.2 : 2.8, dt);
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.visualYaw;
  }

  createVehicle() {
    const isTruck = Math.random() < 0.14;
    const color = choice(TRAFFIC_COLORS);
    const bodyMaterial = new THREE.MeshStandardMaterial({
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
    group.name = isTruck ? "TrafficTruck" : "TrafficCar";
    const bodyLength = isTruck ? rand(9.8, 12.8) : rand(3.95, 4.9);
    const bodyWidth = isTruck ? rand(2.36, 2.56) : rand(1.74, 1.96);

    if (isTruck) {
      group.add(makeBox(bodyWidth, 2.15, bodyLength * 0.62, panelMaterial, new THREE.Vector3(0, 1.54, -bodyLength * 0.12), true));
      group.add(makeBox(bodyWidth * 0.94, 1.55, bodyLength * 0.25, bodyMaterial, new THREE.Vector3(0, 1.18, bodyLength * 0.33), true));
      group.add(makeBox(bodyWidth * 0.72, 0.48, bodyLength * 0.1, glassMaterial, new THREE.Vector3(0, 1.85, bodyLength * 0.43), true));
      group.add(makeBox(bodyWidth * 0.9, 0.2, bodyLength * 0.86, panelMaterial, new THREE.Vector3(0, 0.36, -bodyLength * 0.02), true));
    } else {
      group.add(makeBox(bodyWidth, 0.66, bodyLength, bodyMaterial, new THREE.Vector3(0, 0.66, 0), true));
      group.add(makeBox(bodyWidth * 0.72, 0.48, bodyLength * 0.36, glassMaterial, new THREE.Vector3(0, 1.14, -0.18), true));
      group.add(makeBox(bodyWidth * 0.95, 0.12, 1.25, bodyMaterial, new THREE.Vector3(0, 0.51, bodyLength * 0.28), true));
      group.add(makeBox(bodyWidth * 0.94, 0.16, bodyLength * 0.86, panelMaterial, new THREE.Vector3(0, 0.3, -0.05), true));
    }

    group.add(makeBox(bodyWidth * 0.62, 0.1, 0.08, headlightMaterial, new THREE.Vector3(0, 0.76, bodyLength / 2 + 0.02)));
    group.add(makeBox(bodyWidth * 0.68, 0.11, 0.08, tailMaterial, new THREE.Vector3(0, 0.76, -bodyLength / 2 - 0.02)));

    return {
      id: this.nextId++,
      kind: isTruck ? "truck" : "car",
      group,
      width: bodyWidth,
      length: bodyLength,
      lane: 1,
      lateralOffset: LANES[1],
      s: 0,
      x: 0,
      z: 0,
      yaw: 0,
      visualYaw: 0,
      speed: 0,
      speedFactor: 1,
      cruiseSpeed: 0,
      nearMissCooldown: 0,
      laneChangeCooldown: rand(0, 3.5),
      overtakeArmed: false,
    };
  }
}
