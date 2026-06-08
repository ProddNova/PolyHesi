// Dev-only map editor bootstrap.
//
// Reuses the full game (Game with editorEnabled:true) so all existing remodel
// tooling — overlay gizmo, route editor, piece create/delete, PSX rig tuner — is
// available without duplicating any logic. The editor edits a *source* map and
// exports two artifacts:
//   * Save source        -> the re-openable editable JSON (polyhesi.map)
//   * Export current-map  -> the optimized baked runtime map the game loads
//
// The editor never talks to the server: it has no auth client, and its working
// state lives in localStorage (the same key the game no longer reads).

import { Game } from "../src/game/Game.js";
import { REMODEL_STORAGE_KEY } from "../src/game/config.js";
import "../src/styles.css";

const ADMIN_SESSION = { username: "editor", displayName: "Map Editor", role: "admin" };

const statusOutput = document.querySelector("#editorStatus");
function setStatus(text) {
  if (statusOutput) {
    statusOutput.textContent = text;
  }
}

// Load the editable working map (overrides / deletions / created pieces / route)
// straight from localStorage so the editor opens exactly where it was left off.
function loadSourceStore() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(REMODEL_STORAGE_KEY) ?? "{}");
    if (!raw || typeof raw !== "object") {
      return null;
    }
    return {
      targets: raw.targets && typeof raw.targets === "object" ? raw.targets : {},
      deleted: Array.isArray(raw.deleted) ? raw.deleted : [],
      created: Array.isArray(raw.created) ? raw.created : [],
      routeProfile: raw.routeProfile && typeof raw.routeProfile === "object" ? raw.routeProfile : null,
    };
  } catch {
    return null;
  }
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const root = document.querySelector("#game-root");

const game = new Game(root, {
  authClient: null,
  session: ADMIN_SESSION,
  progress: {},
  editorEnabled: true,
  sourceStore: loadSourceStore(),
});
window.__polyhesi = game;
game.start();

// Once the lazily-loaded editor overlay is wired, drop into no-clip + remodel so
// the user can edit immediately.
game.editorReady
  .then(() => {
    game.setNoClipMode(true, { flash: false });
    game.setRemodelMode(true);
    setStatus("Edit mode — fly with WASD, Y toggles");
  })
  .catch((error) => {
    console.error("Failed to initialize editor.", error);
    setStatus("Editor failed to load (see console)");
  });

// Save source: download the re-openable editable map document.
document.querySelector("#editorSaveSource")?.addEventListener("click", async () => {
  game.world.saveRemodelOverrides?.();
  const doc = game.world.exportMapDocument?.();
  if (!doc) {
    setStatus("Nothing to save");
    return;
  }
  const { downloadMapDocument } = await import("../src/game/mapformat/MapDocument.js");
  downloadMapDocument(doc, "polyhesi-map-source.json");
  setStatus(`Saved source (${doc.stats?.created ?? 0} pieces)`);
});

// Export baked: download the optimized runtime map the game loads.
document.querySelector("#editorExportBaked")?.addEventListener("click", () => {
  const doc = game.world.exportBakedRuntimeMap?.();
  if (!doc) {
    setStatus("Export failed");
    return;
  }
  downloadJson(doc, "current-map.json");
  setStatus(`Exported current-map.json (${doc.decorChunks?.length ?? 0} chunks)`);
});

// Import source: open a previously saved editable map document.
document.querySelector("#editorImportFile")?.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  const summary = await game.loadRemodelMapFromFile(file);
  event.target.value = "";
  setStatus(summary ? `Imported (${summary.created} pieces)` : "Import failed");
});
