import { defineConfig } from "vite";

// Two entry points:
//   * index.html        — the shipped game (loads /maps/current-map.json, no editor)
//   * map-editor/app.html — the dev-only map editor (editorEnabled:true)
//
// The editor + three.js TransformControls reach the bundle only through Game's
// dynamic import("./editor/RemodelOverlay.js"), so Rollup splits them into a lazy
// chunk that the shipped game never downloads.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        editor: "map-editor/app.html",
      },
    },
  },
});
