// Geometry (de)serialization for the baked runtime map.
//
// The editor produces baked decorative chunks as THREE.Mesh objects (via
// bakeBoxPieces in MapBaker.js, then tagged with cull metadata). serialize* turns
// those into plain JSON; deserialize* rebuilds a frozen runtime mesh in the game,
// without ever running the baker at runtime.

import * as THREE from "three";
import { BAKED_MAP_FORMAT, BAKED_MAP_VERSION } from "./MapSchema.js";

// chunkMeshes: array of baked THREE.Mesh (merged, vertex-colored, with the
// chunkCenterS / chunkRadius / chunkRouteLength / bakedChunkKey userData that
// HighwayWorld.bakeCreatedPieces stamps on). Returns plain chunk descriptors.
export function serializeBakedChunks(chunkMeshes = []) {
  const chunks = [];
  for (const mesh of chunkMeshes) {
    const geometry = mesh?.geometry;
    const position = geometry?.attributes?.position;
    if (!position) {
      continue;
    }
    const color = geometry.attributes.color;
    const normal = geometry.attributes.normal;
    chunks.push({
      key: String(mesh.userData?.bakedChunkKey ?? chunks.length),
      centerS: Number(mesh.userData?.chunkCenterS ?? 0),
      radius: Number(mesh.userData?.chunkRadius ?? 200),
      routeLength: Number(mesh.userData?.chunkRouteLength ?? 0),
      positions: Array.from(position.array),
      normals: normal ? Array.from(normal.array) : null,
      colors: color ? Array.from(color.array) : null,
      // The merged geometry is indexed (each box reuses 24 shared vertices via a
      // 36-entry index). Dropping it would render garbage triangles, so persist it.
      indices: geometry.index ? Array.from(geometry.index.array) : null,
    });
  }
  return chunks;
}

// Assemble the full baked runtime map document for export.
export function buildBakedMapDocument({
  routeProfile,
  overrides = {},
  deleted = [],
  chunkMeshes = [],
  sourceVersion = null,
}) {
  return {
    format: BAKED_MAP_FORMAT,
    version: BAKED_MAP_VERSION,
    savedAt: new Date().toISOString(),
    sourceVersion,
    routeProfile: routeProfile ?? null,
    overrides,
    deleted: [...deleted],
    decorChunks: serializeBakedChunks(chunkMeshes),
    // Reserved for a future full-geometry bake of roads/city (see plan).
    future: { worldChunks: null },
  };
}

// Rebuild a single frozen runtime mesh from a serialized chunk descriptor. The
// resulting mesh carries the same cull metadata the runtime expects so it slots
// straight into HighwayWorld's distance/frustum culling.
export function deserializeBakedChunk(chunk, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(chunk.positions, 3));
  if (chunk.normals && chunk.normals.length === chunk.positions.length) {
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(chunk.normals, 3));
  } else {
    geometry.computeVertexNormals();
  }
  if (chunk.colors && chunk.colors.length === chunk.positions.length) {
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(chunk.colors, 3));
  }
  if (chunk.indices && chunk.indices.length) {
    geometry.setIndex(chunk.indices);
  }
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `BakedMapChunk_${chunk.key}`;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.remodelIgnore = true;
  mesh.userData.performanceCull = true;
  mesh.userData.bakedChunkKey = chunk.key;
  mesh.userData.chunkCenterS = chunk.centerS;
  mesh.userData.chunkRadius = chunk.radius;
  mesh.userData.chunkRouteLength = chunk.routeLength;
  return mesh;
}

export { BAKED_MAP_FORMAT, BAKED_MAP_VERSION };
