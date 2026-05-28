import * as THREE from "three";
import { createPlayerCarAsset } from "./PlayerCarAsset.js";

const THUMBNAIL_WIDTH = 224;
const THUMBNAIL_HEIGHT = 136;

const thumbnailCache = new Map();
const pendingResolvers = new Map();
const renderQueue = [];
let processing = false;
let rig = null;

function makeRig() {
  const canvas = document.createElement("canvas");
  canvas.width = THUMBNAIL_WIDTH;
  canvas.height = THUMBNAIL_HEIGHT;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(1);
  renderer.setSize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x111517, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111517);

  const camera = new THREE.OrthographicCamera(-4.7, 4.7, 2.85, -2.85, 0.1, 42);
  camera.position.set(5.7, 3.15, 6.4);
  camera.lookAt(0, 0.75, 0);

  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x2f3638,
    roughness: 0.86,
    metalness: 0.04,
    flatShading: true,
  });
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x252b2d,
    roughness: 0.82,
    metalness: 0.02,
    flatShading: true,
  });
  const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0xd2a642 });
  const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xffd98c });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 9), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  scene.add(floor);

  const backWall = new THREE.Mesh(new THREE.BoxGeometry(12, 4.4, 0.16), wallMaterial);
  backWall.position.set(0, 2.1, -3.85);
  scene.add(backWall);

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.16, 4.4, 9), wallMaterial);
  leftWall.position.set(-5.25, 2.1, 0.32);
  scene.add(leftWall);

  for (const z of [-1.8, 0.1, 2.0]) {
    const bayLine = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 1.45), stripeMaterial);
    bayLine.position.set(-2.5, 0.025, z);
    scene.add(bayLine);
  }

  for (const x of [-2.3, 0, 2.3]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.08, 0.34), lightMaterial);
    panel.position.set(x, 3.78, -0.85);
    scene.add(panel);

    const light = new THREE.PointLight(0xffdda0, 1.55, 8.5, 1.9);
    light.position.set(x, 3.35, -0.65);
    scene.add(light);
  }

  const ambient = new THREE.HemisphereLight(0xe5f4ff, 0x1a1f20, 1.9);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffefd1, 1.65);
  key.position.set(4.2, 5.2, 4.8);
  scene.add(key);

  return { renderer, scene, camera };
}

function getRig() {
  if (!rig) {
    rig = makeRig();
  }
  return rig;
}

function centerAsset(asset) {
  asset.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(asset);
  const center = new THREE.Vector3();
  box.getCenter(center);
  asset.position.x -= center.x;
  asset.position.z -= center.z;
  asset.position.y -= box.min.y;
  asset.rotation.y = -0.58;
}

function disposeAssetMaterials(asset) {
  asset.traverse((child) => {
    if (!child.isMesh || !child.material) {
      return;
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      material.dispose?.();
    }
  });
}

function renderThumbnail(preset) {
  const { renderer, scene, camera } = getRig();
  const asset = createPlayerCarAsset(preset);
  centerAsset(asset);
  scene.add(asset);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/jpeg", 0.84);
  scene.remove(asset);
  disposeAssetMaterials(asset);
  return url;
}

function processNext() {
  const preset = renderQueue.shift();
  if (!preset) {
    processing = false;
    return;
  }

  const cacheKey = getThumbnailCacheKey(preset);
  const resolvers = pendingResolvers.get(cacheKey) ?? [];
  pendingResolvers.delete(cacheKey);

  let url = "";
  try {
    url = renderThumbnail(preset);
  } catch (error) {
    console.warn(`Unable to render car thumbnail for ${preset.id}.`, error);
  }

  thumbnailCache.set(cacheKey, url);
  for (const resolve of resolvers) {
    resolve(url);
  }

  window.requestAnimationFrame(processNext);
}

function scheduleQueue() {
  if (processing) {
    return;
  }

  processing = true;
  window.requestAnimationFrame(processNext);
}

function getThumbnailCacheKey(preset) {
  return `${preset.id}:${preset.color ?? ""}:${preset.secondaryColor ?? ""}`;
}

export function getCarThumbnailUrl(preset) {
  const cacheKey = getThumbnailCacheKey(preset);
  const cached = thumbnailCache.get(cacheKey);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  return new Promise((resolve) => {
    const resolvers = pendingResolvers.get(cacheKey);
    if (resolvers) {
      resolvers.push(resolve);
      return;
    }

    pendingResolvers.set(cacheKey, [resolve]);
    renderQueue.push(preset);
    scheduleQueue();
  });
}
