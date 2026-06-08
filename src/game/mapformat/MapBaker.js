import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// MapBaker turns the individual, editable map pieces from Editor Mode into
// optimized runtime geometry for Play Mode. Each chunk's pieces are merged into a
// single BufferGeometry and the per-piece colour is folded into a per-vertex
// "color" attribute, so a whole chunk renders with ONE material / ONE draw call
// regardless of how many differently-coloured boxes it contains.
//
// This module is intentionally pure: it knows nothing about the world, the scene
// graph or persistence. The caller decides how pieces are bucketed into chunks
// (typically by route arc-length) and supplies the baked material.

const MIN_DIMENSION = 0.01;

const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _color = new THREE.Color();

// A single shared unit cube; every baked piece is a transformed, tinted copy of it.
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

function geometryForPiece(piece) {
  const geometry = UNIT_BOX.clone();

  _position.set(piece.position.x, piece.position.y, piece.position.z);
  _euler.set(piece.rotation.x, piece.rotation.y, piece.rotation.z);
  _quaternion.setFromEuler(_euler);
  _scale.set(
    Math.max(MIN_DIMENSION, piece.dimensions.x),
    Math.max(MIN_DIMENSION, piece.dimensions.y),
    Math.max(MIN_DIMENSION, piece.dimensions.z),
  );
  _matrix.compose(_position, _quaternion, _scale);
  geometry.applyMatrix4(_matrix);

  // THREE.Color.set() stores linear-space components when ColorManagement is on
  // (the default), which is exactly what a vertex-colour attribute expects, so the
  // baked tint matches the live MeshStandardMaterial.color used in Editor Mode.
  _color.set(piece.color ?? "#78e0c1");
  const vertexCount = geometry.attributes.position.count;
  const colors = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i += 1) {
    colors[i * 3] = _color.r;
    colors[i * 3 + 1] = _color.g;
    colors[i * 3 + 2] = _color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// pieces: array of { position, rotation, dimensions, color }
// options.material: the shared baked material (must have vertexColors enabled).
// options.getChunkKey(piece) -> stable key (string|number) grouping pieces into chunks.
// Returns: array of { key, mesh, pieceCount } — one entry per non-empty chunk.
export function bakeBoxPieces(pieces, { material, getChunkKey }) {
  const buckets = new Map();
  for (const piece of pieces) {
    if (!piece?.position || !piece?.rotation || !piece?.dimensions) {
      continue;
    }
    const key = String(getChunkKey ? getChunkKey(piece) : 0);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
    }
    bucket.push(piece);
  }

  const chunks = [];
  for (const [key, bucketPieces] of buckets) {
    const geometries = bucketPieces.map(geometryForPiece);
    let merged;
    if (geometries.length === 1) {
      merged = geometries[0];
    } else {
      merged = mergeGeometries(geometries, false);
      for (const geometry of geometries) {
        geometry.dispose?.();
      }
    }
    if (!merged) {
      continue;
    }
    merged.computeBoundingSphere();

    const mesh = new THREE.Mesh(merged, material);
    mesh.name = `BakedMapChunk_${key}`;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData.bakedChunkKey = key;
    mesh.userData.bakedPieceCount = bucketPieces.length;
    // Baked geometry is static runtime output, never an editor target.
    mesh.userData.remodelIgnore = true;
    chunks.push({ key, mesh, pieceCount: bucketPieces.length });
  }

  return chunks;
}
