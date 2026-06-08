// MapSchema centralizes the two map formats PolyHesi uses:
//
//   * The editable *source* map ("polyhesi.map") — see MapDocument.js. It is what
//     the dev-only map editor opens, edits and re-saves.
//   * The optimized *baked runtime* map ("polyhesi.bakedmap") — what the shipped
//     game loads from /public/maps/current-map.json. It carries the route profile
//     (the game regenerates the base world + colliders from it), the visual
//     overrides/deletions, and pre-baked, merged-by-material decorative chunks.
//
// This module is pure data: no THREE, no DOM. Geometry (de)serialization lives in
// MapBakedSerialize.js so the game runtime never imports the baker.

import { MAP_DOCUMENT_FORMAT, MAP_DOCUMENT_VERSION } from "./MapDocument.js";

export { MAP_DOCUMENT_FORMAT, MAP_DOCUMENT_VERSION };

export const BAKED_MAP_FORMAT = "polyhesi.bakedmap";
export const BAKED_MAP_VERSION = 1;

function sanitizeDecorChunk(chunk) {
  if (!chunk || typeof chunk !== "object") {
    return null;
  }
  const positions = Array.isArray(chunk.positions) ? chunk.positions : null;
  // A chunk needs at least one triangle worth of positions to be drawable.
  if (!positions || positions.length < 9) {
    return null;
  }
  const colors = Array.isArray(chunk.colors) && chunk.colors.length === positions.length ? chunk.colors : null;
  const normals = Array.isArray(chunk.normals) && chunk.normals.length === positions.length ? chunk.normals : null;
  const indices = Array.isArray(chunk.indices) && chunk.indices.length ? chunk.indices : null;
  return {
    key: String(chunk.key ?? "0"),
    centerS: Number.isFinite(chunk.centerS) ? Number(chunk.centerS) : 0,
    radius: Number.isFinite(chunk.radius) ? Number(chunk.radius) : 200,
    routeLength: Number.isFinite(chunk.routeLength) ? Number(chunk.routeLength) : 0,
    positions,
    normals,
    colors,
    indices,
  };
}

// Validate + normalize a baked runtime map (parsed object or JSON string). Throws
// on structurally invalid input. The route profile is passed through untouched and
// re-sanitized by HighwayWorld (which owns the route schema).
export function parseBakedMap(input) {
  let payload = input;
  if (typeof input === "string") {
    payload = JSON.parse(input);
  }
  if (!payload || typeof payload !== "object") {
    throw new Error("Baked map is empty or not an object");
  }
  if (payload.format && payload.format !== BAKED_MAP_FORMAT) {
    throw new Error(`Unsupported baked map format: ${payload.format}`);
  }
  return {
    format: BAKED_MAP_FORMAT,
    version: Number(payload.version) || BAKED_MAP_VERSION,
    routeProfile: payload.routeProfile && typeof payload.routeProfile === "object" ? payload.routeProfile : null,
    overrides: payload.overrides && typeof payload.overrides === "object" ? payload.overrides : {},
    deleted: Array.isArray(payload.deleted) ? payload.deleted.filter((id) => typeof id === "string") : [],
    decorChunks: Array.isArray(payload.decorChunks)
      ? payload.decorChunks.map(sanitizeDecorChunk).filter(Boolean)
      : [],
  };
}
