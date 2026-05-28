import * as THREE from "three";
import { getCarPreset, PLAYER_START } from "./config.js";
import { clamp, damp, makeBox } from "./utils.js";
import { createPlayerCarAsset } from "./PlayerCarAsset.js";

function shapeAxis(value, softness = 0.48) {
  const magnitude = Math.abs(value);
  return Math.sign(value) * magnitude * (softness + (1 - softness) * magnitude);
}

export class PlayerCar {
  constructor(scene, startPose = PLAYER_START) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = "PlayerCar";
    this.speed = 0;
    this.speedMagnitude = 0;
    this.yaw = startPose.yaw;
    this.yawVelocity = 0;
    this.slip = 0;
    this.slipAngle = 0;
    this.steerVisual = 0;
    this.steerInput = 0;
    this.throttleInput = 0;
    this.brakeInput = 0;
    this.handbrakeInput = 0;
    this.lateralSpeed = 0;
    this.longitudinalAcceleration = 0;
    this.lateralG = 0;
    this.bodyPitch = 0;
    this.bodyRoll = 0;
    this.activePresetId = null;
    this.activePresetKey = "";
    this.activePreset = getCarPreset();
    this.position = new THREE.Vector3(0, 0, 0);
    this.previousPosition = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.startPose = { ...startPose };

    this.buildMesh(this.activePreset);
    scene.add(this.group);
    this.reset(startPose);
  }

  buildMesh(preset = this.activePreset) {
    this.group.clear();
    this.activePreset = preset;
    this.activePresetId = preset.id;

    try {
      this.group.add(createPlayerCarAsset(preset));
      this.addHeadLight(preset.bodyLength);
      return;
    } catch (error) {
      console.warn("Unable to build PSX car asset; using procedural fallback.", error);
    }

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: preset.color,
      roughness: 0.52,
      metalness: 0.18,
      flatShading: true,
    });
    const darkMaterial = new THREE.MeshStandardMaterial({
      color: preset.secondaryColor,
      roughness: 0.34,
      metalness: 0.25,
      flatShading: true,
    });
    const trimMaterial = new THREE.MeshStandardMaterial({
      color: 0x0c0d0f,
      roughness: 0.72,
      metalness: 0.18,
      flatShading: true,
    });
    const tireMaterial = new THREE.MeshStandardMaterial({
      color: 0x08090c,
      roughness: 0.9,
      flatShading: true,
    });
    const wheelMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d3034,
      roughness: 0.46,
      metalness: 0.4,
      flatShading: true,
    });
    const headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xf4ead5 });
    const tailMaterial = new THREE.MeshBasicMaterial({ color: 0xb82522 });

    const length = preset.bodyLength;
    const width = preset.bodyWidth;
    const bodyHeight = preset.bodyHeight;
    const front = length * 0.5;
    const rear = -length * 0.5;

    this.group.add(makeBox(width, bodyHeight, length, bodyMaterial, new THREE.Vector3(0, 0.68, 0), true));
    this.group.add(makeBox(width * 0.82, 0.54, preset.cabinLength, darkMaterial, new THREE.Vector3(0, 1.2, preset.cabinOffset), true));
    this.group.add(makeBox(width * 0.92, 0.16, length * 0.34, bodyMaterial, new THREE.Vector3(0, 0.48, length * 0.29), true));
    this.group.add(makeBox(width * 0.86, 0.14, length * 0.22, bodyMaterial, new THREE.Vector3(0, 0.5, rear + length * 0.13), true));
    this.group.add(makeBox(width * 0.98, 0.18, 0.16, trimMaterial, new THREE.Vector3(0, 0.55, front + 0.02), true));
    this.group.add(makeBox(width * 0.98, 0.18, 0.16, trimMaterial, new THREE.Vector3(0, 0.55, rear - 0.02), true));

    const wheelGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.34, 10);
    wheelGeometry.rotateZ(Math.PI / 2);
    const rimGeometry = new THREE.CylinderGeometry(0.21, 0.21, 0.37, 8);
    rimGeometry.rotateZ(Math.PI / 2);
    const wheelPositions = [
      [-width * 0.56, 0.36, -length * 0.32],
      [width * 0.56, 0.36, -length * 0.32],
      [-width * 0.56, 0.36, length * 0.32],
      [width * 0.56, 0.36, length * 0.32],
    ];
    for (const [x, y, z] of wheelPositions) {
      const wheel = new THREE.Mesh(wheelGeometry, tireMaterial);
      wheel.position.set(x, y, z);
      wheel.castShadow = true;
      this.group.add(wheel);

      const rim = new THREE.Mesh(rimGeometry, wheelMaterial);
      rim.position.set(x + Math.sign(x) * 0.01, y, z);
      rim.castShadow = true;
      this.group.add(rim);
    }

    this.group.add(makeBox(0.44, 0.12, 0.08, headlightMaterial, new THREE.Vector3(-width * 0.28, 0.73, front + 0.05)));
    this.group.add(makeBox(0.44, 0.12, 0.08, headlightMaterial, new THREE.Vector3(width * 0.28, 0.73, front + 0.05)));
    this.group.add(makeBox(0.48, 0.12, 0.08, tailMaterial, new THREE.Vector3(-width * 0.28, 0.72, rear - 0.05)));
    this.group.add(makeBox(0.48, 0.12, 0.08, tailMaterial, new THREE.Vector3(width * 0.28, 0.72, rear - 0.05)));

    if (preset.id === "attack") {
      this.group.add(makeBox(width * 0.9, 0.1, 0.26, trimMaterial, new THREE.Vector3(0, 1.16, rear - 0.2), true));
      this.group.add(makeBox(0.12, 0.46, 0.12, trimMaterial, new THREE.Vector3(-width * 0.36, 0.94, rear - 0.08), true));
      this.group.add(makeBox(0.12, 0.46, 0.12, trimMaterial, new THREE.Vector3(width * 0.36, 0.94, rear - 0.08), true));
    }

    const headLight = new THREE.SpotLight(0xfff0d7, 4.8, 110, Math.PI / 6.2, 0.54, 1.4);
    headLight.position.set(0, 1.02, front - 0.28);
    headLight.target.position.set(0, 0.28, 46);
    this.group.add(headLight);
    this.group.add(headLight.target);
  }

  addHeadLight(length) {
    const front = length * 0.5;
    const headLight = new THREE.SpotLight(0xfff0d7, 4.8, 110, Math.PI / 6.2, 0.54, 1.4);
    headLight.position.set(0, 1.02, front - 0.28);
    headLight.target.position.set(0, 0.28, 46);
    this.group.add(headLight);
    this.group.add(headLight.target);
  }

  setCarPreset(car) {
    const preset = typeof car === "string" || !car ? getCarPreset(car) : car;
    const key = `${preset.id}:${preset.color}:${preset.secondaryColor}`;
    if (key === this.activePresetKey) {
      return;
    }

    this.activePresetKey = key;
    this.buildMesh(preset);
  }

  reset(startPose = this.startPose) {
    this.startPose = { ...startPose };
    this.group.visible = true;
    this.speed = 0;
    this.speedMagnitude = 0;
    this.yawVelocity = 0;
    this.slip = 0;
    this.slipAngle = 0;
    this.steerInput = 0;
    this.steerVisual = 0;
    this.throttleInput = 0;
    this.brakeInput = 0;
    this.handbrakeInput = 0;
    this.lateralSpeed = 0;
    this.longitudinalAcceleration = 0;
    this.lateralG = 0;
    this.bodyPitch = 0;
    this.bodyRoll = 0;
    this.yaw = startPose.yaw;
    this.velocity.set(0, 0, 0);
    this.position.set(startPose.x, 0, startPose.z);
    this.previousPosition.copy(this.position);
    this.group.rotation.set(0, 0, 0);
    this.applyTransform(0, 1 / 60);
  }

  setInvulnerable(active, time = 0) {
    if (!active) {
      this.group.visible = true;
      return;
    }

    this.group.visible = Math.floor(time * 10) % 2 === 0;
  }

  update(dt, input, settings, crashed) {
    this.setCarPreset(settings.activeVehiclePreset ?? settings.carPreset);
    const preset = this.activePreset;
    const maxSpeed = (settings.maxSpeedKmh * preset.maxSpeedScale) / 3.6;
    const maxReverseSpeed = maxSpeed * 0.18;
    const powerMultiplier = settings.powerMultiplier ?? 1;
    const gripMultiplier = settings.gripMultiplier ?? 1;
    const weightMultiplier = settings.weightMultiplier ?? 1;

    if (crashed) {
      this.velocity.multiplyScalar(Math.exp(-2.4 * dt));
      this.syncLocalSpeeds();
      this.yawVelocity = damp(this.yawVelocity, 0, 5.2, dt);
      this.slip = damp(this.slip, 0, 5.8, dt);
      this.slipAngle = damp(this.slipAngle, 0, 5.8, dt);
      this.throttleInput = damp(this.throttleInput, 0, 9, dt);
      this.brakeInput = damp(this.brakeInput, 0, 9, dt);
      this.handbrakeInput = damp(this.handbrakeInput, 0, 9, dt);
      this.longitudinalAcceleration = damp(this.longitudinalAcceleration, 0, 8, dt);
      this.lateralG = damp(this.lateralG, 0, 8, dt);
      this.applyTransform(0, dt);
      return;
    }

    this.syncLocalSpeeds();
    const previousForwardSpeed = this.speed;
    const speedRatio = clamp(this.speedMagnitude / maxSpeed, 0, 1);
    const highSpeedFactor = Math.pow(speedRatio, 1.25);
    const inputSteer = clamp(input.steer ?? 0, -1, 1);
    const counterSteering =
      Math.abs(inputSteer) > 0.01 &&
      Math.sign(inputSteer) !== Math.sign(this.steerInput || this.yawVelocity || this.lateralSpeed || inputSteer);
    const steerRise = THREE.MathUtils.lerp(preset.steerRise * 0.82, preset.steerRise * 0.34, highSpeedFactor);
    const steerReturn = THREE.MathUtils.lerp(preset.steerReturn * 0.92, preset.steerReturn * 0.58, highSpeedFactor);
    const steerLambda =
      inputSteer === 0
        ? steerReturn
        : steerRise * (counterSteering && this.slip > 0.12 ? 1.28 : 1);
    this.steerInput = damp(this.steerInput, inputSteer, steerLambda, dt);
    const shapedSteer = shapeAxis(this.steerInput, THREE.MathUtils.lerp(0.4, 0.58, speedRatio));

    this.throttleInput = damp(
      this.throttleInput,
      input.throttle ? 1 : 0,
      input.throttle ? 3.5 : 8.8,
      dt,
    );
    this.brakeInput = damp(
      this.brakeInput,
      input.brake ? 1 : 0,
      input.brake ? 5.2 : 10.5,
      dt,
    );
    this.handbrakeInput = damp(
      this.handbrakeInput,
      input.handbrake ? 1 : 0,
      input.handbrake ? 4.8 : 8.6,
      dt,
    );

    const throttleAmount = Math.pow(this.throttleInput, 1.28);
    const brakeAmount = Math.pow(this.brakeInput, 1.18);
    const rollingDrag =
      throttleAmount > 0.02 || brakeAmount > 0.02 ? preset.throttleDrag : preset.coastDrag;
    const drivePower =
      preset.acceleration *
      powerMultiplier *
      THREE.MathUtils.lerp(0.96, 1.08, clamp((weightMultiplier - 0.9) / 0.34, 0, 1));
    const brakePower =
      preset.brakeForce *
      (settings.brakePower ?? 1) *
      Math.min(1.2, 0.94 + gripMultiplier * 0.14);
    const tractionControl = clamp(1 - Math.max(0, this.slip - 0.22) * 0.22, 0.78, 1);
    const forward = this.getForwardVector();
    let longitudinalAccel = 0;

    if (throttleAmount > 0.001) {
      if (this.speed < -0.7) {
        longitudinalAccel += brakePower * 0.82 * throttleAmount;
      } else {
        const powerFalloff =
          1 - Math.pow(clamp(Math.max(0, this.speed) / maxSpeed, 0, 0.97), 1.82) * 0.76;
        const launchSoftening = THREE.MathUtils.lerp(0.74, 1, clamp(Math.abs(this.speed) / 16, 0, 1));
        longitudinalAccel +=
          drivePower *
          Math.max(0.16, powerFalloff) *
          throttleAmount *
          tractionControl *
          launchSoftening;
      }
    }

    if (brakeAmount > 0.001) {
      if (this.speed > 0.65) {
        const brakeLoadRelief = 1 - this.handbrakeInput * 0.16;
        longitudinalAccel -= brakePower * brakeAmount * brakeLoadRelief;
      } else if (throttleAmount < 0.04) {
        longitudinalAccel -= preset.reverseForce * brakeAmount * 0.88;
      }
    }

    this.applyVelocityDrag(rollingDrag, preset.aeroDrag, dt);
    this.velocity.x += forward.x * longitudinalAccel * dt;
    this.velocity.z += forward.z * longitudinalAccel * dt;
    this.limitLongitudinalSpeed(maxSpeed, maxReverseSpeed);
    this.syncLocalSpeeds();

    const maxSteerAngle = THREE.MathUtils.lerp(
      preset.lowSpeedSteer,
      preset.highSpeedSteer * 0.68,
      Math.pow(speedRatio, 0.56),
    );
    const wheelBase = THREE.MathUtils.lerp(2.7, 3.18, clamp(preset.bodyLength / 5.2, 0, 1));
    const handlingScale = Math.pow(clamp(settings.handling, 0.55, 1.8), 0.72);
    const steerAngle = shapedSteer * maxSteerAngle * handlingScale;
    const parkingSteerAssist = THREE.MathUtils.lerp(1.45, 1, clamp(Math.abs(this.speed) / 14, 0, 1));
    const highSpeedTurnTaming = THREE.MathUtils.lerp(0.96, 0.52, Math.pow(speedRatio, 1.14));
    const slipYawGrip = clamp(1 - this.slip * 0.34, 0.62, 1);
    const rawYawRate =
      (this.speed / wheelBase) *
      Math.tan(steerAngle) *
      preset.yawScale *
      parkingSteerAssist *
      Math.min(1.28, 0.82 + gripMultiplier * 0.2) *
      highSpeedTurnTaming *
      slipYawGrip;
    const yawLimit =
      THREE.MathUtils.lerp(preset.yawLowLimit, preset.yawHighLimit, Math.pow(speedRatio, 0.7)) *
      highSpeedTurnTaming;
    const yawResponse =
      THREE.MathUtils.lerp(6.2, 2.6, Math.pow(speedRatio, 0.82)) *
      Math.min(1.18, gripMultiplier) *
      THREE.MathUtils.lerp(0.9, 1.08, clamp((weightMultiplier - 0.9) / 0.34, 0, 1));
    this.yawVelocity = damp(
      this.yawVelocity,
      clamp(rawYawRate, -yawLimit, yawLimit),
      yawResponse,
      dt,
    );
    if (this.slip > 0.24 && (inputSteer === 0 || counterSteering)) {
      this.yawVelocity = damp(
        this.yawVelocity,
        clamp(rawYawRate * 0.62, -yawLimit, yawLimit),
        THREE.MathUtils.lerp(1.6, 3.2, speedRatio) * this.slip,
        dt,
      );
    }
    this.yaw += this.yawVelocity * dt;

    this.applyLateralGrip({
      dt,
      preset,
      gripMultiplier,
      brakeAmount,
      throttleAmount,
      speedRatio,
      counterSteering,
    });
    this.limitLongitudinalSpeed(maxSpeed, maxReverseSpeed);
    this.syncLocalSpeeds();

    if (this.slip > 0.02 && this.speedMagnitude > 12) {
      const tireScrub =
        (Math.pow(this.slip, 1.34) * preset.gripLoss * (1.1 + speedRatio * 2.15)) /
        Math.max(0.68, gripMultiplier);
      this.velocity.multiplyScalar(Math.max(0, 1 - tireScrub * dt * 0.22));
      this.syncLocalSpeeds();
    }

    this.longitudinalAcceleration = damp(
      this.longitudinalAcceleration,
      (this.speed - previousForwardSpeed) / Math.max(dt, 0.001),
      7.2,
      dt,
    );
    this.lateralG = damp(
      this.lateralG,
      (this.yawVelocity * this.speedMagnitude) / 9.81,
      5.4,
      dt,
    );

    this.previousPosition.copy(this.position);
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.applyTransform(this.steerInput, dt);
  }

  applyVelocityDrag(rollingDrag, aeroDragCoefficient, dt) {
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed <= 0.001) {
      this.velocity.set(0, 0, 0);
      return;
    }

    const dragAccel = rollingDrag * speed + aeroDragCoefficient * speed * speed;
    const dragDelta = Math.min(speed, dragAccel * dt);
    this.velocity.x -= (this.velocity.x / speed) * dragDelta;
    this.velocity.z -= (this.velocity.z / speed) * dragDelta;
  }

  applyLateralGrip({
    dt,
    preset,
    gripMultiplier,
    brakeAmount,
    throttleAmount,
    speedRatio,
    counterSteering,
  }) {
    this.syncLocalSpeeds();
    const right = this.getRightVector();
    const absForwardSpeed = Math.abs(this.speed);
    const slipAngle = Math.atan2(this.lateralSpeed, Math.max(absForwardSpeed, 4));
    this.slipAngle = damp(this.slipAngle, slipAngle, 10.5, dt);
    const slipDemand = clamp(
      Math.abs(slipAngle) / 0.36 +
        Math.max(0, Math.abs(this.lateralSpeed) - 2.4) / Math.max(18, this.speedMagnitude * 0.95),
      0,
      1.35,
    );
    this.slip = damp(this.slip, slipDemand, slipDemand > this.slip ? 6.8 : 4.4, dt);

    const turnLoad = clamp((Math.abs(this.yawVelocity) * this.speedMagnitude) / 9.81, 0, 2.4);
    const loadGrip =
      clamp(1 - turnLoad * 0.07 - brakeAmount * 0.08 + speedRatio * 0.08, 0.56, 1.1);
    const handbrakeGrip = 1 - this.handbrakeInput * THREE.MathUtils.lerp(0.18, 0.38, speedRatio);
    const slipGrip = THREE.MathUtils.lerp(1, 0.46, clamp((this.slip - 0.18) / 0.78, 0, 1));
    const recoveryGrip = inputRecoveryBoost(counterSteering, this.steerInput, this.lateralSpeed, this.slip);
    const throttleGrip = 1 - throttleAmount * THREE.MathUtils.lerp(0.02, 0.08, speedRatio);
    const gripRate =
      THREE.MathUtils.lerp(12.5, 6.1, Math.pow(speedRatio, 0.68)) *
      Math.min(1.32, 0.82 + gripMultiplier * 0.34) *
      loadGrip *
      handbrakeGrip *
      slipGrip *
      recoveryGrip *
      throttleGrip;
    const desiredLateralAccel = -this.lateralSpeed * gripRate;
    const gripLimit =
      (8.4 + gripMultiplier * 3.2) *
      loadGrip *
      (1 - this.handbrakeInput * 0.24) *
      THREE.MathUtils.lerp(0.88, 1.08, speedRatio);
    const lateralAccel = clamp(desiredLateralAccel, -gripLimit, gripLimit);
    this.velocity.x += right.x * lateralAccel * dt;
    this.velocity.z += right.z * lateralAccel * dt;
  }

  limitLongitudinalSpeed(maxSpeed, maxReverseSpeed) {
    this.syncLocalSpeeds();
    const forward = this.getForwardVector();
    const targetForwardSpeed = clamp(this.speed, -maxReverseSpeed, maxSpeed);
    if (targetForwardSpeed !== this.speed) {
      this.velocity.x += forward.x * (targetForwardSpeed - this.speed);
      this.velocity.z += forward.z * (targetForwardSpeed - this.speed);
    }
  }

  syncLocalSpeeds() {
    const forward = this.getForwardVector();
    const right = this.getRightVector();
    this.speed = this.velocity.x * forward.x + this.velocity.z * forward.z;
    this.lateralSpeed = this.velocity.x * right.x + this.velocity.z * right.z;
    this.speedMagnitude = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.speedMagnitude < 0.025) {
      this.velocity.set(0, 0, 0);
      this.speed = 0;
      this.lateralSpeed = 0;
      this.speedMagnitude = 0;
    }
  }

  applyCollisionResponse(normal, options = {}) {
    const length = Math.hypot(normal.x, normal.z);
    if (length <= 0.0001) {
      return;
    }

    const nx = normal.x / length;
    const nz = normal.z / length;
    const surfaceVelocityX = options.surfaceVelocityX ?? 0;
    const surfaceVelocityZ = options.surfaceVelocityZ ?? 0;
    let adjustedX = this.velocity.x - surfaceVelocityX;
    let adjustedZ = this.velocity.z - surfaceVelocityZ;
    const normalSpeed = adjustedX * nx + adjustedZ * nz;

    if (normalSpeed < 0) {
      const restitution = clamp(options.restitution ?? 0.12, 0, 0.6);
      const minSeparationSpeed = Math.max(0, options.minSeparationSpeed ?? 0);
      const impulse = -(1 + restitution) * normalSpeed + minSeparationSpeed;
      adjustedX += nx * impulse;
      adjustedZ += nz * impulse;
    } else if ((options.minSeparationSpeed ?? 0) > 0) {
      adjustedX += nx * (options.minSeparationSpeed ?? 0);
      adjustedZ += nz * (options.minSeparationSpeed ?? 0);
    }

    const tangentX = -nz;
    const tangentZ = nx;
    const tangentSpeed = adjustedX * tangentX + adjustedZ * tangentZ;
    const outSpeed = adjustedX * nx + adjustedZ * nz;
    const friction = clamp(options.friction ?? 0.08, 0, 0.45);
    adjustedX = tangentX * tangentSpeed * (1 - friction) + nx * outSpeed;
    adjustedZ = tangentZ * tangentSpeed * (1 - friction) + nz * outSpeed;

    this.velocity.x = surfaceVelocityX + adjustedX;
    this.velocity.z = surfaceVelocityZ + adjustedZ;
    this.syncLocalSpeeds();

    const right = this.getRightVector();
    const sideLoad = nx * right.x + nz * right.z;
    this.yawVelocity += clamp(sideLoad * this.speedMagnitude * 0.012, -0.34, 0.34);
    this.slip = Math.max(this.slip, clamp(Math.abs(sideLoad) * 0.34, 0.08, 0.42));
  }

  setForwardSpeed(speed, lateralScale = 0) {
    const forward = this.getForwardVector();
    const right = this.getRightVector();
    const lateralSpeed = this.lateralSpeed * lateralScale;
    this.velocity.set(
      forward.x * speed + right.x * lateralSpeed,
      0,
      forward.z * speed + right.z * lateralSpeed,
    );
    this.syncLocalSpeeds();
  }

  stop() {
    this.velocity.set(0, 0, 0);
    this.speed = 0;
    this.speedMagnitude = 0;
    this.lateralSpeed = 0;
    this.yawVelocity = 0;
    this.slip = 0;
    this.slipAngle = 0;
    this.throttleInput = 0;
    this.brakeInput = 0;
    this.handbrakeInput = 0;
  }

  getForwardVector() {
    return {
      x: Math.sin(this.yaw),
      z: Math.cos(this.yaw),
    };
  }

  getRightVector() {
    return {
      x: Math.cos(this.yaw),
      z: -Math.sin(this.yaw),
    };
  }

  getVelocityVector() {
    return {
      x: this.velocity.x,
      z: this.velocity.z,
    };
  }

  applyTransform(steer = 0, dt = 1 / 60) {
    const speedLean = clamp(this.speedMagnitude / 42, 0, 1);
    this.steerVisual = damp(this.steerVisual, steer, 9.4, dt);
    this.bodyPitch = damp(
      this.bodyPitch,
      clamp(-this.longitudinalAcceleration * 0.0042, -0.035, 0.04),
      7.5,
      dt,
    );
    this.bodyRoll = damp(
      this.bodyRoll,
      clamp(
        -this.steerVisual * 0.021 * speedLean -
          this.lateralG * 0.018 * speedLean -
          this.slipAngle * 0.045,
        -0.072,
        0.072,
      ),
      8.2,
      dt,
    );
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
    this.group.rotation.x = this.bodyPitch;
    this.group.rotation.z = this.bodyRoll - clamp(this.yawVelocity, -0.8, 0.8) * 0.012 * speedLean;
  }
}

function inputRecoveryBoost(counterSteering, steerInput, lateralSpeed, slip) {
  if (slip < 0.12) {
    return 1;
  }

  const handsOff = Math.abs(steerInput) < 0.08;
  const steerIntoRecovery =
    Math.abs(lateralSpeed) > 0.4 && Math.sign(steerInput) !== Math.sign(lateralSpeed);
  return handsOff || counterSteering || steerIntoRecovery ? 1.24 : 1;
}
