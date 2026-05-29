import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

import headlightTextureUrl from "../../PSXStyleCars-DevEdition/body/JapanSportCoupe/MaterialsAndTextures/texture1.png?url";
import taillightTextureUrl from "../../PSXStyleCars-DevEdition/body/JapanSportCoupe/MaterialsAndTextures/texture2.png?url";

const bodyObjModules = import.meta.glob("../../PSXStyleCars-DevEdition/body/*/*.obj", {
  eager: true,
  import: "default",
  query: "?raw",
});

const WHEEL_NATIVE_RADIUS = 0.270532;
const WHEEL_PREFAB_SCALE = 0.86;
const BODY_VISUAL_SCALE = 1.18;
const GROUND_CLEARANCE = 0.045;
const CHASSIS_DROP_RATIO = 0.48;
const FRONT_WHEEL_FROM_FRONT = 0.19;
const REAR_WHEEL_FROM_REAR = 0.23;

const objLoader = new OBJLoader();
const textureLoader = new THREE.TextureLoader();
const bodyTemplates = new Map();
const textureCache = new Map();
const tireGeometry = new THREE.CylinderGeometry(1, 1, 1, 14);
tireGeometry.rotateZ(Math.PI / 2);
const rimGeometry = new THREE.CylinderGeometry(1, 1, 1, 10);
rimGeometry.rotateZ(Math.PI / 2);
const hubGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
hubGeometry.rotateZ(Math.PI / 2);

function getTexture(url) {
  if (!textureCache.has(url)) {
    const texture = textureLoader.load(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipmapNearestFilter;
    texture.anisotropy = 1;
    textureCache.set(url, texture);
  }

  return textureCache.get(url);
}

function getBodyTemplate(modelId = "JapanSportCoupe") {
  const key = findBodyObjKey(modelId);
  if (!key) {
    throw new Error(`Missing PSX body model: ${modelId}`);
  }

  if (!bodyTemplates.has(key)) {
    const template = objLoader.parse(removeObjLineElements(bodyObjModules[key]));
    template.name = `${modelId}BodyTemplate`;
    prepareTemplate(template);
    template.userData.nativeBounds = measureObject(template);
    bodyTemplates.set(key, template);
  }

  return bodyTemplates.get(key);
}

function findBodyObjKey(modelId) {
  const normalizedId = String(modelId).replaceAll("\\", "/").toLowerCase();
  const folderNeedle = `/body/${normalizedId}/`;
  for (const key of Object.keys(bodyObjModules)) {
    const normalizedKey = key.replaceAll("\\", "/").toLowerCase();
    if (normalizedKey.includes(folderNeedle)) {
      return key;
    }
  }

  return null;
}

function removeObjLineElements(objSource) {
  return objSource
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("l "))
    .join("\n");
}

function prepareTemplate(object) {
  object.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    child.geometry.computeVertexNormals();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        material.transparent = false;
        material.opacity = 1;
        material.depthWrite = true;
        material.side = THREE.DoubleSide;
      }
    }
  });
}

function measureObject(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  return {
    min: box.min.clone(),
    max: box.max.clone(),
    size,
    center,
    length: Math.max(size.z, 0.001),
    width: Math.max(size.x, 0.001),
    height: Math.max(size.y, 0.001),
  };
}

function createBodyMaterials(preset) {
  const body = new THREE.MeshStandardMaterial({
    name: "psxBodyPaint",
    color: preset.color,
    roughness: 0.56,
    metalness: 0.18,
    flatShading: true,
  });
  const glass = new THREE.MeshStandardMaterial({
    name: "psxGlass",
    color: preset.secondaryColor,
    roughness: 0.3,
    metalness: 0.18,
    flatShading: true,
  });
  const trim = new THREE.MeshStandardMaterial({
    name: "psxTrim",
    color: 0x0b0d10,
    roughness: 0.78,
    metalness: 0.08,
    flatShading: true,
  });
  const headlight = new THREE.MeshStandardMaterial({
    name: "psxHeadlightTexture",
    color: 0xffffff,
    map: getTexture(headlightTextureUrl),
    emissive: 0x2f2616,
    emissiveIntensity: 0.28,
    roughness: 0.42,
    metalness: 0.04,
    flatShading: true,
  });
  const taillight = new THREE.MeshStandardMaterial({
    name: "psxTaillightTexture",
    color: 0xffddd8,
    map: getTexture(taillightTextureUrl),
    emissive: 0x5e0705,
    emissiveIntensity: 0.38,
    roughness: 0.45,
    metalness: 0.02,
    flatShading: true,
  });

  return new Map([
    ["Material", glass],
    ["Material.001", body],
    ["Material.002", glass],
    ["Material.003", trim],
    ["Material.004", headlight],
    ["Material.005", taillight],
    ["Material.006", trim],
    ["Material.007", trim],
  ]);
}

function createWheelMaterials() {
  const tire = new THREE.MeshStandardMaterial({
    name: "psxTire",
    color: 0x050608,
    roughness: 0.94,
    metalness: 0.02,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const rim = new THREE.MeshStandardMaterial({
    name: "psxRim",
    color: 0x8b9298,
    roughness: 0.38,
    metalness: 0.55,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const hub = new THREE.MeshStandardMaterial({
    name: "psxWheelHub",
    color: 0x545a60,
    roughness: 0.48,
    metalness: 0.42,
    flatShading: true,
    side: THREE.DoubleSide,
  });

  return { tire, rim, hub };
}

function applyMaterials(object, materials) {
  object.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
    const mappedMaterials = sourceMaterials.map((material) => materials.get(material?.name) ?? material);
    child.material = Array.isArray(child.material) ? mappedMaterials : mappedMaterials[0];
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

export function createPlayerCarAsset(preset) {
  const root = new THREE.Group();
  const modelId = preset.psxModel ?? preset.id ?? "JapanSportCoupe";
  root.name = `PSXStyleCars_${modelId}`;

  const rig = preset.vehicleRig ?? {};
  const rideHeight = Number(rig.rideHeight ?? 0);
  const frontWheelOffsetX = Number(rig.frontWheelOffsetX ?? rig.wheelOffsetX ?? 0);
  const frontWheelOffsetY = Number(rig.frontWheelOffsetY ?? rig.wheelOffsetY ?? 0);
  const frontWheelOffsetZ = Number(rig.frontWheelOffsetZ ?? rig.wheelOffsetZ ?? 0);
  const rearWheelOffsetX = Number(rig.rearWheelOffsetX ?? rig.wheelOffsetX ?? 0);
  const rearWheelOffsetY = Number(rig.rearWheelOffsetY ?? rig.wheelOffsetY ?? 0);
  const rearWheelOffsetZ = Number(rig.rearWheelOffsetZ ?? rig.wheelOffsetZ ?? 0);
  const wheelScaleTuned = Math.max(0.4, Math.min(2.2, Number(rig.wheelScale ?? 1)));
  const bodyOffsetY = Number(rig.bodyOffsetY ?? 0);
  const bodyOffsetZ = Number(rig.bodyOffsetZ ?? 0);

  const bodyTemplate = getBodyTemplate(modelId);
  const bodyBounds = bodyTemplate.userData.nativeBounds;
  const scale = (preset.bodyLength * BODY_VISUAL_SCALE) / bodyBounds.length;
  const wheelScale = scale * WHEEL_PREFAB_SCALE * wheelScaleTuned;
  const wheelRadius = WHEEL_NATIVE_RADIUS * wheelScale;
  const bodyGroundY = Math.max(GROUND_CLEARANCE, wheelRadius + GROUND_CLEARANCE - wheelRadius * CHASSIS_DROP_RATIO);
  const lift = bodyGroundY - bodyBounds.min.y * scale + rideHeight + bodyOffsetY;
  const centerX = -bodyBounds.center.x * scale;
  const centerZ = -bodyBounds.center.z * scale + bodyOffsetZ;
  const visualWidth = bodyBounds.width * scale;
  const visualLength = bodyBounds.length * scale;
  const rearZ = (bodyBounds.min.z - bodyBounds.center.z) * scale;
  const frontZ = (bodyBounds.max.z - bodyBounds.center.z) * scale;

  const body = bodyTemplate.clone(true);
  applyMaterials(body, createBodyMaterials(preset));
  body.scale.setScalar(scale);
  body.position.set(centerX, lift, centerZ);
  root.add(body);

  const wheelThickness = wheelRadius * 0.62;
  const wheelX = Math.max(visualWidth * 0.5 - wheelThickness * 0.36, visualWidth * 0.38);
  const frontWheelZ = frontZ - visualLength * FRONT_WHEEL_FROM_FRONT;
  const rearWheelZ = rearZ + visualLength * REAR_WHEEL_FROM_REAR;
  const wheelY = wheelRadius + GROUND_CLEARANCE + rideHeight;
  const wheelPositions = [
    { side: -1, z: frontWheelZ, rotationY: 0, offsetX: frontWheelOffsetX, offsetY: frontWheelOffsetY, offsetZ: frontWheelOffsetZ },
    { side: 1, z: frontWheelZ, rotationY: Math.PI, offsetX: frontWheelOffsetX, offsetY: frontWheelOffsetY, offsetZ: frontWheelOffsetZ },
    { side: -1, z: rearWheelZ, rotationY: 0, offsetX: rearWheelOffsetX, offsetY: rearWheelOffsetY, offsetZ: rearWheelOffsetZ },
    { side: 1, z: rearWheelZ, rotationY: Math.PI, offsetX: rearWheelOffsetX, offsetY: rearWheelOffsetY, offsetZ: rearWheelOffsetZ },
  ];
  const wheelMaterials = createWheelMaterials();
  for (const wheelConfig of wheelPositions) {
    const wheel = new THREE.Group();
    const tire = new THREE.Mesh(tireGeometry, wheelMaterials.tire);
    const rim = new THREE.Mesh(rimGeometry, wheelMaterials.rim);
    const hub = new THREE.Mesh(hubGeometry, wheelMaterials.hub);
    tire.scale.set(wheelThickness, wheelRadius, wheelRadius);
    rim.scale.set(wheelThickness * 1.08, wheelRadius * 0.58, wheelRadius * 0.58);
    hub.scale.set(wheelThickness * 1.18, wheelRadius * 0.26, wheelRadius * 0.26);
    tire.castShadow = true;
    rim.castShadow = true;
    hub.castShadow = true;
    tire.receiveShadow = true;
    rim.receiveShadow = true;
    hub.receiveShadow = true;
    wheel.add(tire);
    wheel.add(rim);
    wheel.add(hub);
    wheel.position.set(
      wheelConfig.side * (wheelX + wheelConfig.offsetX),
      wheelY + wheelConfig.offsetY,
      wheelConfig.z + wheelConfig.offsetZ,
    );
    wheel.rotation.y = wheelConfig.rotationY;
    root.add(wheel);
  }

  root.userData.assetSource = `PSXStyleCars-DevEdition/${modelId}`;
  root.userData.bodyGroundClearance = bodyGroundY;
  return root;
}
