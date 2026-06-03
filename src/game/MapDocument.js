// MapDocument is the portable, re-openable representation of an editable map.
//
// Editor Mode owns the editable data (overrides on existing pieces, deletions,
// created pieces, and the road route profile). That same data is persisted to
// localStorage for cross-session re-open, but a MapDocument wraps it in a
// versioned, self-describing JSON envelope so a map can also be exported to a
// file and loaded back later or on another machine.

export const MAP_DOCUMENT_FORMAT = "polyhesi.map";
export const MAP_DOCUMENT_VERSION = 1;

function sanitizeStore(store = {}) {
  return {
    targets: store.targets && typeof store.targets === "object" ? store.targets : {},
    deleted: Array.isArray(store.deleted) ? store.deleted.filter((id) => typeof id === "string") : [],
    created: Array.isArray(store.created) ? store.created.filter((piece) => piece?.id && piece?.state) : [],
    routeProfile: store.routeProfile && typeof store.routeProfile === "object" ? store.routeProfile : null,
  };
}

// Wrap an editable-map store ({ targets, deleted, created, routeProfile }) in a
// versioned document envelope ready for JSON.stringify / file download.
export function buildMapDocument(store) {
  const clean = sanitizeStore(store);
  return {
    format: MAP_DOCUMENT_FORMAT,
    version: MAP_DOCUMENT_VERSION,
    savedAt: new Date().toISOString(),
    map: clean,
    stats: {
      overrides: Object.keys(clean.targets).length,
      deleted: clean.deleted.length,
      created: clean.created.length,
      routePoints: Array.isArray(clean.routeProfile?.controlPoints) ? clean.routeProfile.controlPoints.length : 0,
    },
  };
}

// Accepts a parsed document, a JSON string, or a bare store and returns the
// sanitized editable-map store. Throws on structurally invalid input.
export function parseMapDocument(input) {
  let payload = input;
  if (typeof input === "string") {
    payload = JSON.parse(input);
  }
  if (!payload || typeof payload !== "object") {
    throw new Error("Map document is empty or not an object");
  }

  // A wrapped document carries a `map` field; a bare store carries the fields
  // directly. Accept both so older localStorage payloads can be re-imported.
  const store = payload.map && typeof payload.map === "object" ? payload.map : payload;
  if (payload.format && payload.format !== MAP_DOCUMENT_FORMAT) {
    throw new Error(`Unsupported map document format: ${payload.format}`);
  }
  if (!store.targets && !store.created && !store.deleted && !store.routeProfile) {
    throw new Error("Map document contains no recognizable map data");
  }
  return sanitizeStore(store);
}

// Browser helper: trigger a download of the document as a .json file.
export function downloadMapDocument(doc, filename = "polyhesi-map.json") {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Browser helper: read a File (from an <input type="file">) and resolve to the
// sanitized store.
export function readMapDocumentFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(parseMapDocument(String(reader.result ?? "")));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read map file"));
    reader.readAsText(file);
  });
}
