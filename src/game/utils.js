import * as THREE from "three";

const boxGeometryCache = new Map();

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function damp(current, target, lambda, dt) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function rand(min, max) {
  return min + Math.random() * (max - min);
}

export function choice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export function makeBox(width, height, depth, material, position, castShadow = false) {
  const key = `${width.toFixed(3)}:${height.toFixed(3)}:${depth.toFixed(3)}`;
  let geometry = boxGeometryCache.get(key);
  if (!geometry) {
    geometry = new THREE.BoxGeometry(width, height, depth);
    boxGeometryCache.set(key, geometry);
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

export function makeCanvasTexture(draw) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  draw(context, canvas);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 1;
  return texture;
}
