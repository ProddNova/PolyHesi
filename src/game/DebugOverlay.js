import * as THREE from "three";

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const BOX_EDGES = new THREE.EdgesGeometry(UNIT_BOX);
const AI_ROUTE_POINTS = 8;

function makeLineMaterial(color, opacity = 0.9) {
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
  });
}

function makeFillMaterial(color, opacity = 0.16) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export class DebugOverlay {
  constructor(scene, world) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = "DebugHitboxOverlay";
    this.group.visible = false;
    this.visible = false;
    this.trafficBoxes = [];
    this.aiRoutes = [];

    this.materials = {
      player: makeLineMaterial(0xffffff, 0.96),
      playerFill: makeFillMaterial(0xffffff, 0.14),
      traffic: makeLineMaterial(0xff4d5d, 0.9),
      trafficFill: makeFillMaterial(0xff4d5d, 0.14),
      collider: makeLineMaterial(0xffb000, 0.72),
      colliderFill: makeFillMaterial(0xffb000, 0.08),
      walkCollider: makeLineMaterial(0xb968ff, 0.52),
      walkColliderFill: makeFillMaterial(0xb968ff, 0.07),
      heading: makeLineMaterial(0xffffff, 0.82),
      aiRoute: makeLineMaterial(0xffe56b, 0.92),
    };

    this.staticGroup = new THREE.Group();
    this.dynamicGroup = new THREE.Group();
    this.group.add(this.staticGroup);
    this.group.add(this.dynamicGroup);

    this.playerBox = this.createDebugBox(this.materials.player, this.materials.playerFill);
    this.playerHeading = this.createDynamicLine(2, this.materials.heading);
    this.dynamicGroup.add(this.playerBox);
    this.dynamicGroup.add(this.playerHeading);
    this.buildStaticOverlay(world);
    this.scene.add(this.group);
  }

  setVisible(visible) {
    this.visible = Boolean(visible);
    this.group.visible = this.visible;
  }

  update(player, traffic, world) {
    if (!this.visible) {
      return;
    }

    this.updatePlayerBox(player, world);
    this.updatePlayerHeading(player);
    const cars = traffic?.cars ?? [];
    this.ensureTrafficPools(cars.length);
    for (let i = 0; i < this.trafficBoxes.length; i += 1) {
      const car = cars[i];
      this.trafficBoxes[i].visible = Boolean(car);
      this.aiRoutes[i].visible = Boolean(car);
      if (!car) {
        continue;
      }
      this.updateTrafficBox(this.trafficBoxes[i], car, world);
      this.updateAiRoute(this.aiRoutes[i], car, world);
    }
  }

  buildStaticOverlay(world) {
    this.staticGroup.clear();

    for (const collider of world.colliders ?? []) {
      const box = this.createDebugBox(this.materials.collider, this.materials.colliderFill);
      this.updateBox(box, collider.x, 0.72, collider.z, collider.halfX * 2, 1.44, collider.halfZ * 2, 0);
      this.staticGroup.add(box);
    }

    for (const collider of world.walkColliders ?? []) {
      const box = this.createDebugBox(this.materials.walkCollider, this.materials.walkColliderFill);
      this.updateBox(box, collider.x, 0.92, collider.z, collider.halfX * 2, 1.84, collider.halfZ * 2, 0);
      this.staticGroup.add(box);
    }
  }

  createDebugBox(edgeMaterial, fillMaterial) {
    const group = new THREE.Group();
    const fill = new THREE.Mesh(UNIT_BOX, fillMaterial);
    const edges = new THREE.LineSegments(BOX_EDGES, edgeMaterial);
    fill.renderOrder = 1000;
    edges.renderOrder = 1001;
    group.add(fill);
    group.add(edges);
    return group;
  }

  createAiRouteLine() {
    const line = this.createDynamicLine(AI_ROUTE_POINTS, this.materials.aiRoute);
    line.renderOrder = 1002;
    return line;
  }

  createDynamicLine(pointCount, material) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pointCount * 3), 3));
    const line = new THREE.Line(geometry, this.materials.aiRoute);
    line.material = material;
    return line;
  }

  ensureTrafficPools(count) {
    while (this.trafficBoxes.length < count) {
      const box = this.createDebugBox(this.materials.traffic, this.materials.trafficFill);
      const route = this.createAiRouteLine();
      this.trafficBoxes.push(box);
      this.aiRoutes.push(route);
      this.dynamicGroup.add(box);
      this.dynamicGroup.add(route);
    }
  }

  updatePlayerBox(player, world) {
    const preset = player.activePreset;
    const profile = world.getHitboxProfile("hitbox:player", {
      width: preset.bodyWidth,
      height: 1.72,
      length: preset.bodyLength,
      centerX: 0,
      centerY: 0.86,
      centerZ: 0,
      yawOffset: 0,
    });
    const pose = this.getVehicleHitboxPose(player.position.x, player.position.z, player.yaw, profile);
    this.updateBox(
      this.playerBox,
      pose.x,
      profile.centerY,
      pose.z,
      profile.width,
      profile.height,
      profile.length,
      pose.yaw,
    );
  }

  updatePlayerHeading(player) {
    const position = this.playerHeading.geometry.getAttribute("position");
    const forward = player.getForwardVector();
    position.setXYZ(0, player.position.x, 1.96, player.position.z);
    position.setXYZ(1, player.position.x + forward.x * 10, 1.96, player.position.z + forward.z * 10);
    position.needsUpdate = true;
  }

  updateTrafficBox(box, car, world) {
    const profile = world.getHitboxProfile(
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
    const pose = this.getVehicleHitboxPose(car.x, car.z, car.visualYaw ?? car.yaw, profile);
    this.updateBox(box, pose.x, profile.centerY, pose.z, profile.width, profile.height, profile.length, pose.yaw);
  }

  updateBox(box, x, y, z, width, height, depth, yaw) {
    box.position.set(x, y, z);
    box.rotation.set(0, yaw, 0);
    box.scale.set(width, height, depth);
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

  updateAiRoute(line, car, world) {
    const position = line.geometry.getAttribute("position");
    const step = Math.max(8, car.speed * 0.42);
    for (let i = 0; i < AI_ROUTE_POINTS; i += 1) {
      const frame = world.getLaneFrame(car.s + i * step, car.lane);
      position.setXYZ(i, frame.position.x, 1.1, frame.position.z);
    }
    position.needsUpdate = true;
  }
}
