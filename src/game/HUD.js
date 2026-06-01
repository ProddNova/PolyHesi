import * as THREE from "three";
import {
  CAR_AUCTION_LISTINGS,
  CAR_PRESETS,
  DEFAULT_VEHICLE_RIG_TUNE,
  PARTS_CATALOG,
  SETTING_DEFS,
  WHEEL_MODEL_OPTIONS,
  getCarPreset,
  getVehiclePreset,
  sanitizeVehicleRigTune,
} from "./config.js";
import { getCarThumbnailUrl } from "./CarThumbnailRenderer.js";

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;
const PERFORMANCE_LABELS = {
  maxSpeedKmh: "Vmax",
  powerMultiplier: "Power",
  handling: "Handling",
  gripMultiplier: "Grip",
  brakePower: "Freni",
  weightMultiplier: "Peso",
};

function formatColorSwatch(color) {
  return `#${Number(color ?? 0).toString(16).padStart(6, "0")}`;
}

function formatPartEffects(part) {
  return Object.entries(part.effects ?? {})
    .filter(([_key, value]) => Number(value) > 0)
    .map(([key, value]) => {
      const label = PERFORMANCE_LABELS[key] ?? key;
      const amount = key === "maxSpeedKmh"
        ? `+${Math.round(value)} km/h`
        : `+${Number(value).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}`;
      return `${label} ${amount}`;
    })
    .join(" / ");
}

export class HUD {
  constructor(
    settings,
    onSettingsChange,
    onRestart,
    onUpgrade,
    onCarMarket,
    onCloseMarket,
    onOwnedCarSelect,
    onUpgradeInstall,
    onCloseGarageManager,
    onSettingsSave,
    onSettingsReset,
    onRemodelChange,
    onRemodelSave,
    onRemodelReset,
    onRemodelCreate,
    onRemodelDelete,
    onRemodelClose,
    onRemodelUndo,
    onRemodelCopy,
    onRemodelPaste,
    onRemodelPsxCarSelect,
    onRemodelPsxRigChange,
    onRemodelPsxRigSave,
    onMapTeleport,
    onRemodelRouteChange,
    onRemodelRouteSave,
    onRemodelRouteReset,
  ) {
    this.settings = settings;
    this.onSettingsChange = onSettingsChange;
    this.onRestart = onRestart;
    this.onUpgrade = onUpgrade;
    this.onCarMarket = onCarMarket;
    this.onCloseMarket = onCloseMarket;
    this.onOwnedCarSelect = onOwnedCarSelect;
    this.onUpgradeInstall = onUpgradeInstall;
    this.onCloseGarageManager = onCloseGarageManager;
    this.onSettingsSave = onSettingsSave;
    this.onSettingsReset = onSettingsReset;
    this.onRemodelChange = onRemodelChange;
    this.onRemodelSave = onRemodelSave;
    this.onRemodelReset = onRemodelReset;
    this.onRemodelCreate = onRemodelCreate;
    this.onRemodelDelete = onRemodelDelete;
    this.onRemodelClose = onRemodelClose;
    this.onRemodelUndo = onRemodelUndo;
    this.onRemodelCopy = onRemodelCopy;
    this.onRemodelPaste = onRemodelPaste;
    this.onRemodelPsxCarSelect = onRemodelPsxCarSelect;
    this.onRemodelPsxRigChange = onRemodelPsxRigChange;
    this.onRemodelPsxRigSave = onRemodelPsxRigSave;
    this.onMapTeleport = onMapTeleport;
    this.onRemodelRouteChange = onRemodelRouteChange;
    this.onRemodelRouteSave = onRemodelRouteSave;
    this.onRemodelRouteReset = onRemodelRouteReset;
    this.nearMissUntil = 0;
    this.marketSite = "cars";
    this.ownedCarsSignature = "";
    this.installedUpgradeSignature = "";
    this.isAdmin = false;

    this.nodes = {
      shell: document.querySelector(".hud-shell"),
      speed: document.querySelector("#speedValue"),
      score: document.querySelector("#scoreValue"),
      coins: document.querySelector("#coinValue"),
      combo: document.querySelector("#comboValue"),
      nearMiss: document.querySelector("#nearMissValue"),
      hits: document.querySelector("#hitValue"),
      nearMissToast: document.querySelector("#nearMissToast"),
      nearMissLabel: document.querySelector("#nearMissToast span"),
      nearMissPoints: document.querySelector("#nearMissPoints"),
      fps: document.querySelector("#fpsValue"),
      devPanel: document.querySelector(".dev-panel"),
      devTabs: [...document.querySelectorAll("[data-dev-tab]")],
      devPages: [...document.querySelectorAll("[data-dev-page]")],
      saveDevSettings: document.querySelector("#saveDevSettings"),
      resetDevSettings: document.querySelector("#resetDevSettings"),
      crashOverlay: document.querySelector("#crashOverlay"),
      finalScore: document.querySelector("#finalScoreValue"),
      restart: document.querySelector("#restartButton"),
      playerSettingsButton: document.querySelector("#playerSettingsButton"),
      playerSettingsOverlay: document.querySelector("#playerSettingsOverlay"),
      playerSettingsClose: document.querySelector("#playerSettingsCloseButton"),
      carPreset: document.querySelector("#carPreset"),
      carPresetOut: document.querySelector("#carPresetOut"),
      trafficEnabled: document.querySelector("#trafficEnabled"),
      trafficEnabledOut: document.querySelector("#trafficEnabledOut"),
      dayNightCycle: document.querySelector("#dayNightCycle"),
      dayNightCycleOut: document.querySelector("#dayNightCycleOut"),
      noClip: document.querySelector("#noClip"),
      noClipOut: document.querySelector("#noClipOut"),
      noClipReadout: document.querySelector("#noClipReadout"),
      noClipCoords: document.querySelector("#noClipCoords"),
      noClipAngles: document.querySelector("#noClipAngles"),
      remodelMode: document.querySelector("#remodelMode"),
      remodelModeOut: document.querySelector("#remodelModeOut"),
      remodelModeWrap: document.querySelector("#remodelModeWrap"),
      remodelSnapToGrid: document.querySelector("#remodelSnapToGrid"),
      remodelSnapToGridOut: document.querySelector("#remodelSnapToGridOut"),
      hitboxMode: document.querySelector("#hitboxMode"),
      hitboxModeOut: document.querySelector("#hitboxModeOut"),
      remodelToolbox: document.querySelector("#remodelToolbox"),
      remodelCreate: document.querySelector("#remodelCreateButton"),
      remodelDelete: document.querySelector("#remodelDeleteButton"),
      remodelUndo: document.querySelector("#remodelUndoButton"),
      remodelCopy: document.querySelector("#remodelCopyButton"),
      remodelPaste: document.querySelector("#remodelPasteButton"),
      remodelStripe: document.querySelector("#remodelStripeButton"),
      remodelGuardrail: document.querySelector("#remodelGuardrailButton"),
      remodelPanel: document.querySelector("#remodelPanel"),
      remodelGeneralGroup: document.querySelector("#remodelGeneralGroup"),
      remodelTitle: document.querySelector("#remodelTitle"),
      remodelTargetMeta: document.querySelector("#remodelTargetMeta"),
      remodelStatus: document.querySelector("#remodelStatus"),
      remodelSave: document.querySelector("#remodelSaveButton"),
      remodelReset: document.querySelector("#remodelResetButton"),
      remodelClose: document.querySelector("#remodelCloseButton"),
      remodelInputs: {
        posX: document.querySelector("#remodelPosX"),
        posY: document.querySelector("#remodelPosY"),
        posZ: document.querySelector("#remodelPosZ"),
        sizeX: document.querySelector("#remodelSizeX"),
        sizeY: document.querySelector("#remodelSizeY"),
        sizeZ: document.querySelector("#remodelSizeZ"),
        rotX: document.querySelector("#remodelRotX"),
        rotY: document.querySelector("#remodelRotY"),
        rotZ: document.querySelector("#remodelRotZ"),
        color: document.querySelector("#remodelColor"),
      },
      remodelPsxCarSelect: document.querySelector("#remodelPsxCarSelect"),
      remodelPsxRigGroup: document.querySelector("#remodelPsxRigGroup"),
      remodelPsxSaveButton: document.querySelector("#remodelPsxSaveButton"),
      remodelPsxInputs: {
        rideHeight: document.querySelector("#remodelPsxRideHeight"),
        wheelModel: document.querySelector("#remodelPsxWheelModel"),
        wheelColor: document.querySelector("#remodelPsxWheelColor"),
        bodyColor: document.querySelector("#remodelPsxBodyColor"),
        frontWheelOffsetX: document.querySelector("#remodelPsxFrontWheelOffsetX"),
        frontWheelOffsetY: document.querySelector("#remodelPsxFrontWheelOffsetY"),
        frontWheelOffsetZ: document.querySelector("#remodelPsxFrontWheelOffsetZ"),
        rearWheelOffsetX: document.querySelector("#remodelPsxRearWheelOffsetX"),
        rearWheelOffsetY: document.querySelector("#remodelPsxRearWheelOffsetY"),
        rearWheelOffsetZ: document.querySelector("#remodelPsxRearWheelOffsetZ"),
        wheelScale: document.querySelector("#remodelPsxWheelScale"),
        bodyOffsetY: document.querySelector("#remodelPsxBodyOffsetY"),
        bodyOffsetZ: document.querySelector("#remodelPsxBodyOffsetZ"),
      },
      mapOverlay: document.querySelector("#mapOverlay"),
      miniMapCanvas: document.querySelector("#miniMapCanvas"),
      remodelMapToolbar: document.querySelector("#remodelMapToolbar"),
      remodelMapToolButtons: [...document.querySelectorAll("[data-remodel-map-tool]")],
      remodelMapAdd: document.querySelector("#remodelMapAddButton"),
      remodelMapDelete: document.querySelector("#remodelMapDeleteButton"),
      remodelMapSave: document.querySelector("#remodelMapSaveButton"),
      remodelMapReset: document.querySelector("#remodelMapResetButton"),
      remodelHoverLabel: document.querySelector("#remodelHoverLabel"),
      remodelReticle: document.querySelector("#remodelReticle"),
      interactionPrompt: document.querySelector("#interactionPrompt"),
      interactionKey: document.querySelector("#interactionKey"),
      interactionText: document.querySelector("#interactionText"),
      marketOverlay: document.querySelector("#marketOverlay"),
      marketClose: document.querySelector("#marketCloseButton"),
      marketCoins: document.querySelector("#marketCoinValue"),
      marketTabs: [...document.querySelectorAll("[data-market-tab]")],
      marketPages: [...document.querySelectorAll("[data-market-page]")],
      marketAddress: document.querySelector("#marketAddress"),
      marketSearchQuery: document.querySelector("#marketSearchQuery"),
      marketLogo: document.querySelector("#marketLogo"),
      marketCarCount: document.querySelector("#marketCarCount"),
      partsGrid: document.querySelector("#partsGrid"),
      upgradeButtons: [],
      upgradeInfo: new Map(),
      carShopList: document.querySelector("#carShopList"),
      garageOverlay: document.querySelector("#garageOverlay"),
      garageClose: document.querySelector("#garageCloseButton"),
      ownedCarList: document.querySelector("#ownedCarList"),
      installedUpgradeList: document.querySelector("#installedUpgradeList"),
    };
    this.mapContext = this.nodes.miniMapCanvas?.getContext("2d") ?? null;
    this.mapVisible = false;
    this.mapBounds = null;
    this.mapView = {
      zoom: 1,
      panX: 0,
      panZ: 0,
    };
    this.mapPanDrag = null;
    this.lastMapWorld = null;
    this.remodelMapMode = false;
    this.remodelMapTool = "route";
    this.remodelRouteProfile = null;
    this.remodelMapSelection = null;
    this.remodelMapDrag = null;
    this.devPanelVisible = false;
    this.setDevPanelVisible(false);

    document.querySelector("#restartButton").addEventListener("click", () => this.onRestart());
    document.querySelector("#overlayRestartButton").addEventListener("click", () => this.onRestart());
    this.nodes.playerSettingsButton?.addEventListener("click", () => this.setPlayerSettingsVisible(true));
    this.nodes.playerSettingsClose?.addEventListener("click", () => this.setPlayerSettingsVisible(false));
    this.nodes.marketClose?.addEventListener("click", () => this.onCloseMarket?.());
    this.nodes.garageClose?.addEventListener("click", () => this.onCloseGarageManager?.());
    this.nodes.saveDevSettings?.addEventListener("click", () => this.onSettingsSave?.());
    this.nodes.resetDevSettings?.addEventListener("click", () => this.onSettingsReset?.());
    this.nodes.remodelSave?.addEventListener("click", () => this.onRemodelSave?.());
    this.nodes.remodelReset?.addEventListener("click", () => this.onRemodelReset?.());
    this.nodes.remodelCreate?.addEventListener("click", () => this.onRemodelCreate?.());
    this.nodes.remodelDelete?.addEventListener("click", () => this.onRemodelDelete?.());
    this.nodes.remodelUndo?.addEventListener("click", () => this.onRemodelUndo?.());
    this.nodes.remodelCopy?.addEventListener("click", () => this.onRemodelCopy?.());
    this.nodes.remodelPaste?.addEventListener("click", () => this.onRemodelPaste?.());
    this.nodes.remodelStripe?.addEventListener("click", () => this.onRemodelCreate?.("stripe"));
    this.nodes.remodelGuardrail?.addEventListener("click", () => this.onRemodelCreate?.("guardrail"));
    this.nodes.remodelClose?.addEventListener("click", () => this.onRemodelClose?.());
    this.nodes.remodelPsxCarSelect?.addEventListener("change", () => this.onRemodelPsxCarSelect?.(this.nodes.remodelPsxCarSelect.value));
    this.nodes.remodelPsxSaveButton?.addEventListener("click", () => this.onRemodelPsxRigSave?.());
    this.nodes.miniMapCanvas?.addEventListener("pointerdown", (event) => this.handleMapPointerDown(event));
    this.nodes.miniMapCanvas?.addEventListener("pointermove", (event) => this.handleMapPointerMove(event));
    this.nodes.miniMapCanvas?.addEventListener("pointerup", (event) => this.handleMapPointerUp(event));
    this.nodes.miniMapCanvas?.addEventListener("pointercancel", (event) => this.handleMapPointerUp(event));
    this.nodes.miniMapCanvas?.addEventListener("wheel", (event) => this.handleMapWheel(event), { passive: false });
    this.nodes.miniMapCanvas?.addEventListener("contextmenu", (event) => {
      if (this.mapVisible) {
        event.preventDefault();
      }
    });
    for (const button of this.nodes.remodelMapToolButtons ?? []) {
      button.addEventListener("click", () => this.setRemodelMapTool(button.dataset.remodelMapTool));
    }
    this.nodes.remodelMapAdd?.addEventListener("click", () => this.addRemodelMapFeature());
    this.nodes.remodelMapDelete?.addEventListener("click", () => this.deleteSelectedRemodelMapFeature());
    this.nodes.remodelMapSave?.addEventListener("click", () => this.onRemodelRouteSave?.());
    this.nodes.remodelMapReset?.addEventListener("click", () => {
      const profile = this.onRemodelRouteReset?.();
      if (profile) {
        this.setRemodelRouteProfile(profile);
      }
    });
    this.syncRemodelMapToolbar();
    this.populateRemodelWheelModels();
    for (const input of Object.values(this.nodes.remodelInputs)) {
      input?.addEventListener("input", () => this.onRemodelChange?.(this.readRemodelState()));
      if (input?.type !== "number") {
        continue;
      }
      input?.addEventListener("wheel", (event) => this.handleRemodelInputWheel(
        event,
        input,
        () => this.onRemodelChange?.(this.readRemodelState()),
      ), {
        passive: false,
      });
    }
    for (const tab of this.nodes.devTabs) {
      tab.addEventListener("click", () => this.setDevTab(tab.dataset.devTab));
    }
    for (const tab of this.nodes.marketTabs) {
      tab.addEventListener("click", () => this.setMarketSite(tab.dataset.marketTab));
    }
    for (const input of Object.values(this.nodes.remodelPsxInputs ?? {})) {
      input?.addEventListener("input", () => this.onRemodelPsxRigChange?.(this.readRemodelPsxRigState()));
      if (input?.type !== "number") {
        continue;
      }
      input?.addEventListener("wheel", (event) => this.handleRemodelInputWheel(
        event,
        input,
        () => this.onRemodelPsxRigChange?.(this.readRemodelPsxRigState()),
      ), {
        passive: false,
      });
    }
    this.buildPartsShop();
    for (const button of this.nodes.upgradeButtons) {
      button.addEventListener("click", () => this.onUpgrade?.(button.dataset.upgrade));
    }
    this.bindSettings();
    this.bindPlayerSettings();
    this.buildCarShop();
    this.setMarketSite("cars");
  }

  bindSettings() {
    if (this.nodes.carPreset) {
      for (const preset of CAR_PRESETS) {
        const option = document.createElement("option");
        option.value = preset.id;
        option.textContent = preset.inGamePlayer ? preset.label : `${preset.label} [NON USATA IN GAME]`;
        this.nodes.carPreset.appendChild(option);
      }
      this.nodes.carPreset.value = this.settings.carPreset;
      this.nodes.carPresetOut.value = getCarPreset(this.settings.carPreset).label;
      this.nodes.carPreset.addEventListener("change", () => {
        this.settings.carPreset = this.nodes.carPreset.value;
        this.nodes.carPresetOut.value = getCarPreset(this.settings.carPreset).label;
        this.onSettingsChange(this.settings, "carPreset");
      });
    }

    for (const def of SETTING_DEFS) {
      const input = document.querySelector(`#${def.key}`);
      const output = document.querySelector(`#${def.key}Out`);
      if (!input || !output) {
        continue;
      }

      input.value = this.settings[def.key];
      output.value = def.format(this.settings[def.key]);
      input.addEventListener("input", () => {
        const value = Number(input.value);
        this.settings[def.key] = value;
        this.updateSettingValue(def.key, value);
        this.onSettingsChange(this.settings, def.key);
      });
    }

    this.bindBooleanSetting("trafficEnabled");
    this.bindBooleanSetting("dayNightCycle");
    this.bindBooleanSetting("noClip");
    this.bindBooleanSetting("remodelMode");
    this.bindBooleanSetting("remodelSnapToGrid");
    this.bindBooleanSetting("hitboxMode");
    this.bindBooleanSetting("ultraGraphics");
    this.setRemodelAvailable(Boolean(this.settings.noClip));
  }

  bindBooleanSetting(key) {
    const input = this.nodes[key] ?? document.querySelector(`#${key}`);
    const output = this.nodes[`${key}Out`] ?? document.querySelector(`#${key}Out`);
    if (!input) {
      return;
    }

    const syncLabel = () => {
      if (output) {
        output.value = input.checked ? "On" : "Off";
      }
    };
    input.checked = this.settings[key] !== false;
    syncLabel();
    input.addEventListener("change", () => {
      this.settings[key] = input.checked;
      syncLabel();
      this.onSettingsChange(this.settings, key);
    });
  }

  bindPlayerSettings() {
    for (const input of document.querySelectorAll("[data-player-setting]")) {
      const key = input.dataset.playerSetting;
      const output = document.querySelector(`[data-player-setting-out="${key}"]`);
      const def = SETTING_DEFS.find((item) => item.key === key);
      const sync = () => {
        if (input.type === "checkbox") {
          input.checked = this.settings[key] !== false;
          if (output) {
            output.value = input.checked ? "On" : "Off";
          }
          return;
        }
        input.value = this.settings[key];
        if (output) {
          output.value = def?.format ? def.format(this.settings[key]) : String(this.settings[key]);
        }
      };
      sync();
      input.addEventListener(input.type === "checkbox" ? "change" : "input", () => {
        this.settings[key] = input.type === "checkbox" ? input.checked : Number(input.value);
        if (input.type === "checkbox") {
          sync();
        } else {
          this.updateSettingValue(key, this.settings[key]);
        }
        this.onSettingsChange(this.settings, key);
      });
    }
  }

  syncPlayerSettings() {
    for (const input of document.querySelectorAll("[data-player-setting]")) {
      const key = input.dataset.playerSetting;
      const output = document.querySelector(`[data-player-setting-out="${key}"]`);
      const def = SETTING_DEFS.find((item) => item.key === key);
      if (input.type === "checkbox") {
        input.checked = this.settings[key] !== false;
        if (output) {
          output.value = input.checked ? "On" : "Off";
        }
      } else {
        input.value = this.settings[key];
        if (output) {
          output.value = def?.format ? def.format(this.settings[key]) : String(this.settings[key]);
        }
      }
    }
  }

  syncSettings() {
    if (this.nodes.carPreset) {
      this.nodes.carPreset.value = this.settings.carPreset;
      this.nodes.carPresetOut.value = getCarPreset(this.settings.carPreset).label;
    }

    for (const def of SETTING_DEFS) {
      const input = document.querySelector(`#${def.key}`);
      const output = document.querySelector(`#${def.key}Out`);
      if (!input || !output) {
        continue;
      }
      input.value = this.settings[def.key];
      output.value = def.format(this.settings[def.key]);
    }

    if (this.nodes.trafficEnabled) {
      this.syncBooleanSetting("trafficEnabled");
      this.syncBooleanSetting("dayNightCycle");
      this.syncBooleanSetting("noClip");
      this.syncBooleanSetting("remodelMode");
      this.syncBooleanSetting("remodelSnapToGrid");
      this.syncBooleanSetting("hitboxMode");
      this.syncBooleanSetting("ultraGraphics");
      this.setRemodelAvailable(Boolean(this.settings.noClip));
    }
    this.syncPlayerSettings();
  }

  syncBooleanSetting(key) {
    const input = this.nodes[key] ?? document.querySelector(`#${key}`);
    const output = this.nodes[`${key}Out`] ?? document.querySelector(`#${key}Out`);
    if (!input) {
      return;
    }
    input.checked = this.settings[key] !== false;
    if (output) {
      output.value = input.checked ? "On" : "Off";
    }
  }

  updateSettingValue(key, value, options = {}) {
    const def = SETTING_DEFS.find((item) => item.key === key);
    if (!def) {
      if (!options.skipPlayerSync) {
        this.syncPlayerSettings();
      }
      return;
    }

    const input = document.querySelector(`#${key}`);
    const output = document.querySelector(`#${key}Out`);
    if (input) {
      input.value = value;
    }
    if (output) {
      output.value = def.format(value);
    }
    if (!options.skipPlayerSync) {
      this.syncPlayerSettings();
    }
  }

  setRemodelAvailable(available) {
    if (!this.nodes.remodelMode) {
      return;
    }

    this.nodes.remodelMode.disabled = !available;
    this.nodes.remodelModeWrap?.classList.toggle("is-disabled", !available);
  }

  setRemodelReticleVisible(visible) {
    this.nodes.remodelReticle?.classList.toggle("is-active", Boolean(visible));
  }

  setRemodelToolsVisible(visible) {
    this.nodes.remodelToolbox?.classList.toggle("is-active", Boolean(visible));
    if (this.nodes.remodelCreate) {
      this.nodes.remodelCreate.disabled = !visible;
    }
    if (!visible) {
      this.setRemodelDeleteAvailable(false);
    }
  }

  setRemodelDeleteAvailable(available) {
    if (this.nodes.remodelDelete) {
      this.nodes.remodelDelete.disabled = !available;
    }
  }

  setRemodelHover(info = null) {
    const label = this.nodes.remodelHoverLabel;
    if (!label) {
      return;
    }

    if (!info?.target || !info.screen) {
      label.classList.remove("is-active");
      return;
    }

    label.textContent = info.target.label ?? info.target.id ?? "Remodel";
    label.style.left = `${info.screen.x}px`;
    label.style.top = `${info.screen.y}px`;
    label.classList.add("is-active");
  }

  updateNoClipInfo({
    active = false,
    position = { x: 0, y: 0, z: 0 },
    yaw = 0,
    pitch = 0,
    speedKmh = 0,
    baseSpeedKmh = 0,
    boostSpeedKmh = 0,
  } = {}) {
    this.nodes.noClipReadout?.classList.toggle("is-active", active);
    if (!this.nodes.noClipCoords || !this.nodes.noClipAngles) {
      return;
    }

    if (!active) {
      this.nodes.noClipCoords.value = "X 0.00 / Y 0.00 / Z 0.00";
      this.nodes.noClipAngles.textContent = "Yaw 0.0 / Pitch 0.0 / Speed 0";
      return;
    }

    this.nodes.noClipCoords.value =
      `X ${position.x.toFixed(2)} / Y ${position.y.toFixed(2)} / Z ${position.z.toFixed(2)}`;
    this.nodes.noClipAngles.textContent =
      `Yaw ${(yaw * RAD_TO_DEG).toFixed(1)} / ` +
      `Pitch ${(pitch * RAD_TO_DEG).toFixed(1)} / ` +
      `Speed ${Math.round(speedKmh)} (${Math.round(baseSpeedKmh)}/${Math.round(boostSpeedKmh)})`;
  }

  showRemodelEditor(target, state) {
    if (!target || !state) {
      this.hideRemodelEditor();
      return;
    }

    this.nodes.remodelPanel?.classList.add("is-active");
    if (this.nodes.remodelTitle) {
      this.nodes.remodelTitle.textContent = target.label ?? "Remodel";
    }
    if (this.nodes.remodelTargetMeta) {
      this.nodes.remodelTargetMeta.textContent = `${target.group ?? "Map"} / ${target.id}`;
    }
    this.writeRemodelState(state);
    this.setRemodelEditorStatus("Live edit");
    this.setRemodelDeleteAvailable(true);
  }

  hideRemodelEditor() {
    this.nodes.remodelPanel?.classList.remove("is-active");
    this.setRemodelDeleteAvailable(false);
  }

  setRemodelEditorStatus(text = "") {
    if (this.nodes.remodelStatus) {
      this.nodes.remodelStatus.value = text;
    }
  }

  writeRemodelState(state) {
    const inputs = this.nodes.remodelInputs;
    const set = (input, value, decimals = 2) => {
      if (input) {
        input.value = Number(value).toFixed(decimals);
      }
    };

    set(inputs.posX, state.position.x);
    set(inputs.posY, state.position.y);
    set(inputs.posZ, state.position.z);
    set(inputs.sizeX, state.dimensions.x);
    set(inputs.sizeY, state.dimensions.y);
    set(inputs.sizeZ, state.dimensions.z);
    set(inputs.rotX, state.rotation.x * RAD_TO_DEG, 1);
    set(inputs.rotY, state.rotation.y * RAD_TO_DEG, 1);
    set(inputs.rotZ, state.rotation.z * RAD_TO_DEG, 1);
    if (inputs.color) {
      inputs.color.value = /^#[0-9a-f]{6}$/i.test(state.color ?? "") ? state.color : "#78e0c1";
    }
  }

  readRemodelState() {
    const inputs = this.nodes.remodelInputs;
    const read = (input, fallback = 0) => {
      const value = Number(input?.value);
      return Number.isFinite(value) ? value : fallback;
    };

    return {
      position: {
        x: read(inputs.posX),
        y: read(inputs.posY),
        z: read(inputs.posZ),
      },
      dimensions: {
        x: Math.max(0.01, read(inputs.sizeX, 0.01)),
        y: Math.max(0.01, read(inputs.sizeY, 0.01)),
        z: Math.max(0.01, read(inputs.sizeZ, 0.01)),
      },
      rotation: {
        x: read(inputs.rotX) * DEG_TO_RAD,
        y: read(inputs.rotY) * DEG_TO_RAD,
        z: read(inputs.rotZ) * DEG_TO_RAD,
      },
      color: /^#[0-9a-f]{6}$/i.test(inputs.color?.value ?? "") ? inputs.color.value : "#78e0c1",
    };
  }

  handleRemodelInputWheel(event, input, onChange = null) {
    if (!input) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const configuredStep = Number(input.step);
    const step = Math.max(Number.isFinite(configuredStep) && configuredStep > 0 ? configuredStep : 0.25, 0.25);
    const direction = event.deltaY < 0 ? 1 : -1;
    const current = Number(input.value);
    const min = Number(input.min);
    const rawNext = (Number.isFinite(current) ? current : 0) + direction * step;
    const next = Number.isFinite(min) ? Math.max(min, rawNext) : rawNext;
    const decimals = step >= 1 ? 1 : 2;
    input.value = next.toFixed(decimals);
    onChange?.();
  }

  buildCarShop() {
    if (!this.nodes.carShopList) {
      return;
    }

    this.nodes.carShopList.innerHTML = "";
    for (const listing of CAR_AUCTION_LISTINGS) {
      const button = document.createElement("button");
      button.className = "car-shop-button";
      button.dataset.listingId = listing.id;
      button.dataset.carId = listing.carId;
      button.type = "button";
      button.innerHTML = `
        <span class="car-thumbnail-frame">
          <img class="car-thumbnail" alt="${listing.label}" loading="lazy">
        </span>
        <span class="car-shop-copy">
          <span class="car-shop-lot">${listing.lot} / ${listing.seller}</span>
          <strong>${listing.label}</strong>
          <span class="car-shop-specs">
            <small><i class="car-color-chip" style="background:${formatColorSwatch(listing.color)}"></i>${listing.colorName}</small>
            <small>${listing.mileage}</small>
            <small>${listing.transmission}</small>
            <small>${listing.engine}</small>
          </span>
          <small>${listing.condition} / ${listing.location} / chiude ${listing.endsIn}</small>
        </span>
        <span class="car-shop-action"><b>${listing.price} c</b><small>${listing.bids} offerte</small></span>
      `;
      this.loadCarThumbnail(getVehiclePreset(listing), button.querySelector(".car-thumbnail"));
      button.addEventListener("click", () => this.onCarMarket?.(listing.id));
      this.nodes.carShopList.appendChild(button);
    }
    if (this.nodes.marketCarCount) {
      this.nodes.marketCarCount.textContent = `${CAR_AUCTION_LISTINGS.length} aste`;
    }
  }

  setPlayerSettingsVisible(visible) {
    this.nodes.playerSettingsOverlay?.classList.toggle("is-active", Boolean(visible));
  }

  setRemodelPsxCars(cars = [], selectedCarId = "") {
    const select = this.nodes.remodelPsxCarSelect;
    if (!select) {
      return;
    }
    select.innerHTML = "";
    for (const car of cars) {
      const option = document.createElement("option");
      option.value = car.id;
      option.textContent = car.label ?? car.id;
      select.appendChild(option);
    }
    if (selectedCarId && cars.some((item) => item.id === selectedCarId)) {
      select.value = selectedCarId;
    } else if (cars.length) {
      select.value = cars[0].id;
    }
  }

  setRemodelPsxRigVisible(visible) {
    if (this.nodes.remodelGeneralGroup) {
      this.nodes.remodelGeneralGroup.hidden = Boolean(visible);
    }
    if (this.nodes.remodelPsxRigGroup) {
      this.nodes.remodelPsxRigGroup.hidden = !visible;
    }
  }

  populateRemodelWheelModels() {
    const select = this.nodes.remodelPsxInputs?.wheelModel;
    if (!select) {
      return;
    }
    select.innerHTML = "";
    for (const optionDef of WHEEL_MODEL_OPTIONS) {
      const option = document.createElement("option");
      option.value = optionDef.id;
      option.textContent = optionDef.label;
      select.appendChild(option);
    }
  }

  writeRemodelPsxRigState(state = DEFAULT_VEHICLE_RIG_TUNE) {
    const tuned = sanitizeVehicleRigTune(state);
    for (const [key, input] of Object.entries(this.nodes.remodelPsxInputs ?? {})) {
      if (!input) {
        continue;
      }
      if (input.type === "color") {
        input.value = formatColorSwatch(tuned[key] ?? DEFAULT_VEHICLE_RIG_TUNE[key] ?? 0);
      } else if (input.tagName === "SELECT") {
        input.value = tuned[key] ?? "";
      } else {
        input.value = Number(tuned[key] ?? 0).toFixed(2);
      }
    }
  }

  readRemodelPsxRigState() {
    const raw = {};
    for (const [key, input] of Object.entries(this.nodes.remodelPsxInputs ?? {})) {
      if (input?.type === "color") {
        raw[key] = Number.parseInt(input.value.replace("#", ""), 16);
      } else if (input?.tagName === "SELECT") {
        raw[key] = input.value;
      } else {
        raw[key] = Number(input?.value);
      }
    }
    return sanitizeVehicleRigTune(raw);
  }

  buildPartsShop() {
    if (!this.nodes.partsGrid) {
      return;
    }

    this.nodes.partsGrid.innerHTML = "";
    for (const part of PARTS_CATALOG) {
      const button = document.createElement("button");
      button.className = "upgrade-button";
      button.dataset.upgrade = part.id;
      button.type = "button";
      button.innerHTML = `
        <span class="part-main">
          <span class="part-category">${part.category}</span>
          <strong>${part.brand}</strong>
          <b>${part.label}</b>
          <small>${part.detail}</small>
        </span>
        <span class="part-side">
          <small class="part-effects">${formatPartEffects(part)}</small>
          <small data-upgrade-info="${part.id}">${part.baseCost} coins</small>
        </span>
      `;
      this.nodes.partsGrid.appendChild(button);
    }

    this.nodes.upgradeButtons = [...this.nodes.partsGrid.querySelectorAll(".upgrade-button")];
    this.nodes.upgradeInfo = new Map(
      [...this.nodes.partsGrid.querySelectorAll("[data-upgrade-info]")].map((node) => [
        node.dataset.upgradeInfo,
        node,
      ]),
    );
  }

  loadCarThumbnail(preset, image) {
    if (!image) {
      return;
    }

    getCarThumbnailUrl(preset).then((url) => {
      if (!url || !image.isConnected) {
        return;
      }
      image.src = url;
      image.classList.add("is-loaded");
    });
  }

  update({ speedKmh, score, coins, comboMultiplier, nearMisses, hits, maxHits, fps, crashed, canRestart }) {
    this.nodes.speed.textContent = Math.round(speedKmh);
    this.nodes.score.textContent = Math.floor(score).toLocaleString("en-US");
    this.nodes.coins.textContent = Math.floor(coins).toLocaleString("en-US");
    this.nodes.combo.textContent = `x${comboMultiplier.toFixed(1)}`;
    this.nodes.nearMiss.textContent = nearMisses;
    if (this.nodes.hits) {
      this.nodes.hits.textContent = `${hits}/${maxHits}`;
    }
    this.nodes.fps.textContent = Math.round(fps);

    if (performance.now() > this.nearMissUntil) {
      this.nodes.nearMissToast.classList.remove("is-active");
    }

    this.nodes.crashOverlay.classList.toggle("is-active", crashed);
    this.nodes.restart.classList.toggle("is-hidden", crashed);
    this.nodes.restart.disabled = !canRestart;
    this.nodes.restart.classList.toggle("is-disabled", !canRestart);
    if (crashed) {
      this.nodes.finalScore.textContent = Math.floor(score).toLocaleString("en-US");
    }
  }

  setMode(mode) {
    this.nodes.shell?.classList.toggle("is-garage", mode === "garage");
  }

  setAdminMode(isAdmin) {
    this.isAdmin = Boolean(isAdmin);
    this.nodes.shell?.classList.toggle("is-admin", Boolean(isAdmin));
    if (!isAdmin) {
      this.setDevPanelVisible(false);
    }
  }

  setInteraction(text, key = "E") {
    const active = Boolean(text);
    if (this.nodes.interactionKey) {
      this.nodes.interactionKey.textContent = key;
      this.nodes.interactionKey.hidden = !key;
    }
    this.nodes.interactionText.textContent = text ?? "";
    this.nodes.interactionPrompt?.classList.toggle("is-active", active);
  }

  setMarketVisible(visible) {
    this.nodes.marketOverlay?.classList.toggle("is-active", visible);
  }

  setGarageManagerVisible(visible) {
    this.nodes.garageOverlay?.classList.toggle("is-active", visible);
  }

  setMarketSite(site = "cars") {
    this.marketSite = site;
    this.nodes.marketOverlay?.classList.toggle("is-auction", site === "cars");
    this.nodes.marketOverlay?.classList.toggle("is-parts", site === "parts");
    for (const tab of this.nodes.marketTabs ?? []) {
      tab.classList.toggle("is-active", tab.dataset.marketTab === site);
    }
    for (const page of this.nodes.marketPages ?? []) {
      page.classList.toggle("is-active", page.dataset.marketPage === site);
    }
    if (this.nodes.marketAddress) {
      this.nodes.marketAddress.textContent =
        site === "parts"
          ? "https://partdock.local/autodoc-catalog"
          : "https://nightrunner.auctions/live-lots";
    }
    if (this.nodes.marketSearchQuery) {
      this.nodes.marketSearchQuery.textContent = site === "parts" ? "turbo assetto distanziali freni" : "aste auto usate import street";
    }
    if (this.nodes.marketLogo) {
      this.nodes.marketLogo.textContent = site === "parts" ? "PartDock" : "NightRunner";
    }
  }

  updateGarageState({
    coins,
    upgrades,
    installedUpgrades = {},
    costs,
    ownedCars = ["street"],
    ownedVehicles = [],
    activeCar = "street",
    activeVehicleId = "",
  }) {
    const owned = new Set(ownedCars);
    const ownedListings = new Set(ownedVehicles.map((vehicle) => vehicle.sourceListingId).filter(Boolean));
    if (this.nodes.marketCoins) {
      this.nodes.marketCoins.textContent = Math.floor(coins).toLocaleString("en-US");
    }

    for (const part of PARTS_CATALOG) {
      const isOwned = (upgrades[part.id] ?? 0) > 0;
      const isInstalled = (installedUpgrades[part.id] ?? 0) > 0;
      const node = this.nodes.upgradeInfo.get(part.id);
      if (node) {
        node.textContent = isInstalled
          ? "Installato"
          : isOwned
            ? "In garage"
            : `${costs[part.id]} coins`;
      }
    }

    for (const button of this.nodes.upgradeButtons) {
      const key = button.dataset.upgrade;
      const part = PARTS_CATALOG.find((item) => item.id === key);
      if (!part) {
        continue;
      }
      const isOwned = (upgrades[key] ?? 0) > 0;
      const isInstalled = (installedUpgrades[key] ?? 0) > 0;
      button.classList.toggle("is-owned", isOwned);
      button.classList.toggle("is-installed", isInstalled);
      button.disabled = isOwned || coins < costs[key];
    }

    if (this.nodes.carPreset) {
      for (const option of this.nodes.carPreset.options) {
        option.disabled = !owned.has(option.value);
      }
    }

    for (const button of this.nodes.carShopList?.querySelectorAll(".car-shop-button") ?? []) {
      const listing = CAR_AUCTION_LISTINGS.find((item) => item.id === button.dataset.listingId);
      if (!listing) {
        continue;
      }
      const vehicle = ownedVehicles.find((item) => item.sourceListingId === listing.id);
      const isOwned = ownedListings.has(listing.id);
      const isActive = vehicle?.id === activeVehicleId;
      const action = button.querySelector(".car-shop-action");
      button.classList.toggle("is-active", isActive);
      button.classList.toggle("is-owned", isOwned);
      button.disabled = !isOwned && coins < listing.price;
      if (action) {
        action.innerHTML = isActive
          ? "<b>In uso</b><small>garage</small>"
          : isOwned
            ? "<b>Usa</b><small>comprata</small>"
            : `<b>${listing.price} c</b><small>${listing.bids} offerte</small>`;
      }
    }

    this.renderOwnedCarList(ownedVehicles, activeVehicleId);
    this.renderInstalledUpgradeList(upgrades, installedUpgrades);
  }

  renderOwnedCarList(ownedVehicles, activeVehicleId) {
    if (!this.nodes.ownedCarList) {
      return;
    }

    const signature = `${activeVehicleId}|${ownedVehicles.map((vehicle) => vehicle.id).join(",")}`;
    if (signature === this.ownedCarsSignature) {
      return;
    }

    this.ownedCarsSignature = signature;
    this.nodes.ownedCarList.innerHTML = "";
    for (const vehicle of ownedVehicles) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "owned-car-button";
      button.classList.toggle("is-active", activeVehicleId === vehicle.id);
      button.dataset.ownedCarId = vehicle.id;
      button.innerHTML = `
        <span class="car-thumbnail-frame">
          <img class="car-thumbnail" alt="${vehicle.label}" loading="lazy">
        </span>
        <span class="car-shop-copy">
          <strong>${vehicle.label}</strong>
          <small>${vehicle.colorName} / ${vehicle.mileage} / ${vehicle.transmission}</small>
          <small>${vehicle.engine} / ${vehicle.condition}</small>
        </span>
        <span class="car-shop-action">${activeVehicleId === vehicle.id ? "In uso" : "Usa"}</span>
      `;
      this.loadCarThumbnail(getVehiclePreset(vehicle), button.querySelector(".car-thumbnail"));
      button.addEventListener("click", () => this.onOwnedCarSelect?.(vehicle.id));
      this.nodes.ownedCarList.appendChild(button);
    }
  }

  renderInstalledUpgradeList(upgrades, installedUpgrades) {
    if (!this.nodes.installedUpgradeList) {
      return;
    }

    const signature = PARTS_CATALOG.map((part) => {
      const ownedLevel = upgrades[part.id] ?? 0;
      const installedLevel = installedUpgrades[part.id] ?? 0;
      return `${part.id}:${ownedLevel}:${installedLevel}`;
    }).join("|");
    if (signature === this.installedUpgradeSignature) {
      return;
    }

    this.installedUpgradeSignature = signature;
    this.nodes.installedUpgradeList.innerHTML = "";
    const ownedParts = PARTS_CATALOG.filter((part) => (upgrades[part.id] ?? 0) > 0);
    if (!ownedParts.length) {
      const empty = document.createElement("div");
      empty.className = "garage-upgrade-row garage-upgrade-row--empty";
      empty.innerHTML = `
        <span>
          <strong>Nessun pezzo in garage</strong>
          <small>Compra pezzi singoli su PartDock</small>
        </span>
      `;
      this.nodes.installedUpgradeList.appendChild(empty);
      return;
    }

    for (const part of ownedParts) {
      const installedLevel = installedUpgrades[part.id] ?? 0;
      const row = document.createElement("div");
      row.className = "garage-upgrade-row";
      row.innerHTML = `
        <span>
          <strong>${part.brand} ${part.label}</strong>
          <small>${installedLevel > 0 ? "Installato" : "In magazzino"} / ${formatPartEffects(part)}</small>
        </span>
        <span class="garage-upgrade-actions">
          <button data-upgrade-delta="-1" type="button">Smonta</button>
          <button data-upgrade-delta="1" type="button">Monta</button>
        </span>
      `;

      const removeButton = row.querySelector('[data-upgrade-delta="-1"]');
      const installButton = row.querySelector('[data-upgrade-delta="1"]');
      removeButton.disabled = installedLevel <= 0;
      installButton.disabled = installedLevel > 0;
      removeButton.addEventListener("click", () => this.onUpgradeInstall?.(part.id, -1));
      installButton.addEventListener("click", () => this.onUpgradeInstall?.(part.id, 1));
      this.nodes.installedUpgradeList.appendChild(row);
    }
  }

  flashNearMiss(points, label = "Near miss", coins = 0) {
    this.nodes.nearMissLabel.textContent = label;
    this.nodes.nearMissPoints.textContent =
      coins > 0 ? `+${Math.round(points)} / +${Math.round(coins)} coins` : `+${Math.round(points)}`;
    this.nodes.nearMissToast.classList.add("is-active");
    this.nearMissUntil = performance.now() + 720;
  }

  flashNotice(label, detail = "") {
    this.nodes.nearMissLabel.textContent = label;
    this.nodes.nearMissPoints.textContent = detail;
    this.nodes.nearMissToast.classList.add("is-active");
    this.nearMissUntil = performance.now() + 1100;
  }

  setDevPanelVisible(visible) {
    this.devPanelVisible = visible;
    this.nodes.devPanel?.classList.toggle("is-hidden", !visible);
  }

  toggleDevPanel() {
    this.setDevPanelVisible(!this.devPanelVisible);
  }

  setDevTab(tabName = "gameplay") {
    for (const tab of this.nodes.devTabs ?? []) {
      tab.classList.toggle("is-active", tab.dataset.devTab === tabName);
    }
    for (const page of this.nodes.devPages ?? []) {
      page.classList.toggle("is-active", page.dataset.devPage === tabName);
    }
  }

  cloneRemodelRouteProfile(profile = this.remodelRouteProfile) {
    if (!profile) {
      return null;
    }
    return {
      controlPoints: (profile.controlPoints ?? []).map((point) => ({ x: point.x, z: point.z })),
      branches: (profile.branches ?? []).map((branch) => ({
        id: branch.id,
        points: (branch.points ?? []).map((point) => ({ x: point.x, z: point.z })),
      })),
      tunnels: (profile.tunnels ?? []).map((run) => ({ ...run })),
    };
  }

  setRemodelMapMode(active, profile = null) {
    this.remodelMapMode = Boolean(active);
    this.nodes.mapOverlay?.classList.toggle("is-remodel-map", this.remodelMapMode);
    if (profile) {
      this.setRemodelRouteProfile(profile);
    }
    if (!this.remodelMapMode) {
      this.remodelMapSelection = null;
      this.remodelMapDrag = null;
    }
    this.syncRemodelMapToolbar();
  }

  setRemodelRouteProfile(profile) {
    this.remodelRouteProfile = this.cloneRemodelRouteProfile(profile);
    this.remodelMapSelection = null;
    this.mapBounds = null;
    this.mapPanDrag = null;
    this.syncRemodelMapToolbar();
  }

  setRemodelMapTool(tool) {
    if (!["route", "tunnel", "branch"].includes(tool)) {
      return;
    }
    this.remodelMapTool = tool;
    this.remodelMapSelection = null;
    this.syncRemodelMapToolbar();
  }

  syncRemodelMapToolbar() {
    for (const button of this.nodes.remodelMapToolButtons ?? []) {
      button.classList.toggle("is-active", button.dataset.remodelMapTool === this.remodelMapTool);
    }
    if (this.nodes.remodelMapAdd) {
      this.nodes.remodelMapAdd.textContent = this.remodelMapTool === "tunnel"
        ? "Add tunnel"
        : this.remodelMapTool === "branch"
          ? "Add branch"
          : "Add point";
    }
    if (this.nodes.remodelMapDelete) {
      this.nodes.remodelMapDelete.disabled = !this.remodelMapSelection;
    }
  }

  getMapPointer(event) {
    const canvas = this.nodes.miniMapCanvas;
    if (!canvas) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      width: canvas.width,
      height: canvas.height,
    };
  }

  applyRemodelRouteProfile(profile = this.remodelRouteProfile, options = {}) {
    if (!profile) {
      return null;
    }
    const applied = this.onRemodelRouteChange?.(this.cloneRemodelRouteProfile(profile), options);
    if (applied) {
      this.remodelRouteProfile = this.cloneRemodelRouteProfile(applied);
      this.mapBounds = null;
    }
    this.syncRemodelMapToolbar();
    return applied;
  }

  handleRemodelMapPointerDown(event) {
    if (!this.remodelMapMode || !this.remodelRouteProfile || event.button !== 0 || !this.mapBounds) {
      return false;
    }

    const pointer = this.getMapPointer(event);
    if (!pointer) {
      return false;
    }

    const hit = this.pickRemodelMapHandle(pointer.x, pointer.y, pointer.width, pointer.height);
    if (hit) {
      if (this.isRemodelRoutePointLocked(hit)) {
        this.remodelMapSelection = hit;
        this.syncRemodelMapToolbar();
        this.flashNotice?.("Spawn locked", "spawn road points stay fixed");
        event.preventDefault();
        event.stopPropagation();
        return true;
      }
      this.remodelMapSelection = hit;
      this.remodelMapDrag = hit;
      this.nodes.miniMapCanvas?.setPointerCapture?.(event.pointerId);
      this.syncRemodelMapToolbar();
      event.preventDefault();
      event.stopPropagation();
      return true;
    }

    if (this.remodelMapTool === "route") {
      const segment = this.pickRemodelMapSegment(pointer.x, pointer.y, pointer.width, pointer.height, "route");
      if (segment) {
        const world = this.mapToWorld(pointer.x, pointer.y, pointer.width, pointer.height);
        this.remodelRouteProfile.controlPoints.splice(segment.index + 1, 0, world);
        this.remodelMapSelection = { type: "routePoint", index: segment.index + 1 };
        this.applyRemodelRouteProfile();
      }
    } else if (this.remodelMapTool === "tunnel") {
      this.addTunnelAtPointer(pointer);
    } else if (this.remodelMapTool === "branch") {
      const segment = this.pickRemodelMapSegment(pointer.x, pointer.y, pointer.width, pointer.height, "branch");
      if (segment) {
        const branch = this.remodelRouteProfile.branches[segment.branchIndex];
        const world = this.mapToWorld(pointer.x, pointer.y, pointer.width, pointer.height);
        branch.points.splice(segment.index + 1, 0, world);
        this.remodelMapSelection = { type: "branchPoint", branchIndex: segment.branchIndex, index: segment.index + 1 };
        this.applyRemodelRouteProfile();
      } else {
        this.addBranchAtPointer(pointer);
      }
    }

    this.syncRemodelMapToolbar();
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  handleMapPointerMove(event) {
    if (this.handleMapPanPointerMove(event)) {
      return;
    }
    this.handleRemodelMapPointerMove(event);
  }

  handleMapPointerUp(event) {
    if (this.handleMapPanPointerUp(event)) {
      return;
    }
    this.handleRemodelMapPointerUp(event);
  }

  handleMapPanPointerDown(event) {
    if (!this.mapVisible || !this.nodes.miniMapCanvas || !this.mapBounds) {
      return false;
    }
    const shouldPan = event.button === 1 || event.button === 2 || (this.remodelMapMode && event.button === 0 && event.shiftKey);
    if (!shouldPan) {
      return false;
    }
    const pointer = this.getMapPointer(event);
    if (!pointer) {
      return false;
    }
    this.mapPanDrag = {
      pointerId: event.pointerId,
      x: pointer.x,
      y: pointer.y,
      panX: this.mapView.panX,
      panZ: this.mapView.panZ,
      width: pointer.width,
      height: pointer.height,
    };
    this.nodes.miniMapCanvas?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  handleMapPanPointerMove(event) {
    if (!this.mapPanDrag || !this.mapBounds) {
      return false;
    }
    const pointer = this.getMapPointer(event);
    if (!pointer) {
      return false;
    }
    const layout = this.getMapLayout(this.mapPanDrag.width, this.mapPanDrag.height);
    this.mapView.panX = this.mapPanDrag.panX - (pointer.x - this.mapPanDrag.x) / layout.scale;
    this.mapView.panZ = this.mapPanDrag.panZ - (pointer.y - this.mapPanDrag.y) / layout.scale;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  handleMapPanPointerUp(event) {
    if (!this.mapPanDrag) {
      return false;
    }
    this.nodes.miniMapCanvas?.releasePointerCapture?.(event.pointerId);
    this.mapPanDrag = null;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  handleMapWheel(event) {
    if (!this.mapVisible || !this.mapBounds || !this.nodes.miniMapCanvas) {
      return;
    }
    const pointer = this.getMapPointer(event);
    if (!pointer) {
      return;
    }
    const before = this.mapToWorld(pointer.x, pointer.y, pointer.width, pointer.height, { unclamped: true });
    const zoomFactor = Math.exp(-event.deltaY * 0.0012);
    this.mapView.zoom = THREE.MathUtils.clamp(this.mapView.zoom * zoomFactor, 0.22, 7);
    const after = this.mapToWorld(pointer.x, pointer.y, pointer.width, pointer.height, { unclamped: true });
    this.mapView.panX += before.x - after.x;
    this.mapView.panZ += before.z - after.z;
    event.preventDefault();
    event.stopPropagation();
  }

  handleRemodelMapPointerMove(event) {
    if (!this.remodelMapMode || !this.remodelMapDrag || !this.remodelRouteProfile || !this.mapBounds) {
      return;
    }
    const pointer = this.getMapPointer(event);
    if (!pointer) {
      return;
    }
    const worldPoint = this.mapToWorld(pointer.x, pointer.y, pointer.width, pointer.height);
    this.moveRemodelMapHandle(this.remodelMapDrag, worldPoint);
    event.preventDefault();
    event.stopPropagation();
  }

  handleRemodelMapPointerUp(event) {
    if (!this.remodelMapDrag) {
      return;
    }
    this.nodes.miniMapCanvas?.releasePointerCapture?.(event.pointerId);
    this.remodelMapDrag = null;
    this.applyRemodelRouteProfile(undefined, { flash: false });
    event.preventDefault();
    event.stopPropagation();
  }

  moveRemodelMapHandle(handle, worldPoint) {
    if (this.isRemodelRoutePointLocked(handle)) {
      return;
    }
    if (handle.type === "routePoint") {
      const point = this.remodelRouteProfile.controlPoints[handle.index];
      if (point) {
        point.x = worldPoint.x;
        point.z = worldPoint.z;
      }
      return;
    }
    if (handle.type === "branchPoint") {
      const point = this.remodelRouteProfile.branches[handle.branchIndex]?.points?.[handle.index];
      if (point) {
        point.x = worldPoint.x;
        point.z = worldPoint.z;
      }
      return;
    }
    if (handle.type === "tunnelStart" || handle.type === "tunnelEnd") {
      const tunnel = this.remodelRouteProfile.tunnels[handle.index];
      const nearest = this.lastMapWorld?.getNearestRoadInfo?.(new THREE.Vector3(worldPoint.x, 0, worldPoint.z));
      if (!tunnel || !nearest) {
        return;
      }
      const trackLength = Math.max(1, this.lastMapWorld.trackLength ?? 1);
      if (handle.type === "tunnelStart") {
        const end = (tunnel.start + tunnel.length) % trackLength;
        tunnel.start = nearest.s;
        tunnel.length = Math.max(90, this.distanceAlongTrack(nearest.s, end, trackLength));
      } else {
        tunnel.length = Math.max(90, this.distanceAlongTrack(tunnel.start, nearest.s, trackLength));
      }
    }
  }

  distanceAlongTrack(start, end, trackLength) {
    return ((end - start) % trackLength + trackLength) % trackLength;
  }

  addRemodelMapFeature() {
    if (!this.remodelMapMode || !this.remodelRouteProfile || !this.nodes.miniMapCanvas) {
      return;
    }
    const canvas = this.nodes.miniMapCanvas;
    const pointer = { x: canvas.width * 0.5, y: canvas.height * 0.5, width: canvas.width, height: canvas.height };
    if (this.remodelMapTool === "tunnel") {
      this.addTunnelAtPointer(pointer);
    } else if (this.remodelMapTool === "branch") {
      this.addBranchAtPointer(pointer);
    } else {
      const world = this.mapToWorld(pointer.x, pointer.y, pointer.width, pointer.height);
      this.remodelRouteProfile.controlPoints.push(world);
      this.remodelMapSelection = { type: "routePoint", index: this.remodelRouteProfile.controlPoints.length - 1 };
      this.applyRemodelRouteProfile();
    }
  }

  addTunnelAtPointer(pointer) {
    const world = this.mapToWorld(pointer.x, pointer.y, pointer.width, pointer.height);
    const nearest = this.lastMapWorld?.getNearestRoadInfo?.(new THREE.Vector3(world.x, 0, world.z));
    const start = nearest?.s ?? 0;
    const index = this.remodelRouteProfile.tunnels.length;
    this.remodelRouteProfile.tunnels.push({
      start,
      length: 650,
      name: `Remodel Tunnel ${index + 1}`,
    });
    this.remodelMapSelection = { type: "tunnel", index };
    this.applyRemodelRouteProfile();
  }

  addBranchAtPointer(pointer) {
    const world = this.mapToWorld(pointer.x, pointer.y, pointer.width, pointer.height);
    const nearest = this.lastMapWorld?.getNearestRoadInfo?.(new THREE.Vector3(world.x, 0, world.z));
    const frame = nearest ?? { center: new THREE.Vector3(world.x, 0, world.z), normal: new THREE.Vector3(1, 0, 0), tangent: new THREE.Vector3(0, 0, 1) };
    const side = nearest?.lateral && nearest.lateral < 0 ? -1 : 1;
    const base = frame.center;
    const points = [
      { x: base.x, z: base.z },
      { x: base.x + frame.normal.x * side * 180 + frame.tangent.x * 130, z: base.z + frame.normal.z * side * 180 + frame.tangent.z * 130 },
      { x: base.x + frame.normal.x * side * 360 + frame.tangent.x * 360, z: base.z + frame.normal.z * side * 360 + frame.tangent.z * 360 },
    ];
    const branch = {
      id: `branch:${Date.now().toString(36)}:${Math.floor(Math.random() * 1e5).toString(36)}`,
      points,
    };
    this.remodelRouteProfile.branches.push(branch);
    this.remodelMapSelection = { type: "branchPoint", branchIndex: this.remodelRouteProfile.branches.length - 1, index: 1 };
    this.applyRemodelRouteProfile();
  }

  deleteSelectedRemodelMapFeature() {
    const selection = this.remodelMapSelection;
    if (!selection || !this.remodelRouteProfile) {
      return;
    }
    if (this.isRemodelRoutePointLocked(selection)) {
      this.flashNotice?.("Spawn locked", "spawn road points cannot be deleted");
      return;
    }
    if (selection.type === "routePoint" && this.remodelRouteProfile.controlPoints.length > 6) {
      this.remodelRouteProfile.controlPoints.splice(selection.index, 1);
    } else if (selection.type === "branchPoint") {
      const branch = this.remodelRouteProfile.branches[selection.branchIndex];
      if (branch?.points?.length > 2) {
        branch.points.splice(selection.index, 1);
      } else if (branch) {
        this.remodelRouteProfile.branches.splice(selection.branchIndex, 1);
      }
    } else if (selection.type === "branch") {
      this.remodelRouteProfile.branches.splice(selection.branchIndex, 1);
    } else if (selection.type === "tunnel" || selection.type === "tunnelStart" || selection.type === "tunnelEnd") {
      this.remodelRouteProfile.tunnels.splice(selection.index, 1);
    }
    this.remodelMapSelection = null;
    this.applyRemodelRouteProfile();
  }

  pickRemodelMapHandle(x, y, width, height) {
    const hitRadius = 13;
    const routePoints = this.remodelRouteProfile?.controlPoints ?? [];
    for (let i = routePoints.length - 1; i >= 0; i -= 1) {
      const point = this.worldToMap(routePoints[i], width, height);
      if (Math.hypot(point.x - x, point.y - y) <= hitRadius) {
        return { type: "routePoint", index: i };
      }
    }

    for (let branchIndex = (this.remodelRouteProfile?.branches?.length ?? 0) - 1; branchIndex >= 0; branchIndex -= 1) {
      const points = this.remodelRouteProfile.branches[branchIndex].points;
      for (let i = points.length - 1; i >= 0; i -= 1) {
        const point = this.worldToMap(points[i], width, height);
        if (Math.hypot(point.x - x, point.y - y) <= hitRadius) {
          return { type: "branchPoint", branchIndex, index: i };
        }
      }
    }

    if (!this.lastMapWorld) {
      return null;
    }
    for (let i = (this.remodelRouteProfile?.tunnels?.length ?? 0) - 1; i >= 0; i -= 1) {
      const tunnel = this.remodelRouteProfile.tunnels[i];
      const start = this.worldToMap(this.lastMapWorld.getFrameAtDistance(tunnel.start).center, width, height);
      const end = this.worldToMap(this.lastMapWorld.getFrameAtDistance(tunnel.start + tunnel.length).center, width, height);
      if (Math.hypot(start.x - x, start.y - y) <= hitRadius) {
        return { type: "tunnelStart", index: i };
      }
      if (Math.hypot(end.x - x, end.y - y) <= hitRadius) {
        return { type: "tunnelEnd", index: i };
      }
    }
    return null;
  }

  pickRemodelMapSegment(x, y, width, height, kind) {
    let best = null;
    const consider = (points, closed, branchIndex = null) => {
      const limit = closed ? points.length : points.length - 1;
      for (let i = 0; i < limit; i += 1) {
        const a = this.worldToMap(points[i], width, height);
        const b = this.worldToMap(points[(i + 1) % points.length], width, height);
        const distance = this.distanceToSegment2D(x, y, a, b);
        if (distance < 14 && (!best || distance < best.distance)) {
          best = { index: i, branchIndex, distance };
        }
      }
    };
    if (kind === "route") {
      consider(this.remodelRouteProfile.controlPoints, true);
    } else {
      for (let branchIndex = 0; branchIndex < this.remodelRouteProfile.branches.length; branchIndex += 1) {
        consider(this.remodelRouteProfile.branches[branchIndex].points, false, branchIndex);
      }
    }
    return best;
  }

  distanceToSegment2D(x, y, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy || 1;
    const t = THREE.MathUtils.clamp(((x - a.x) * dx + (y - a.y) * dy) / lengthSq, 0, 1);
    return Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
  }

  setMapVisible(visible) {
    this.mapVisible = visible;
    this.nodes.mapOverlay?.classList.toggle("is-active", visible);
    if (!visible) {
      this.setRemodelMapMode(false);
    }
    return this.mapVisible;
  }

  toggleMap() {
    return this.setMapVisible(!this.mapVisible);
  }

  isMapVisible() {
    return this.mapVisible;
  }

  updateMiniMap(world, player, traffic) {
    if (!this.mapVisible || !this.mapContext || !world.roadSamples.length) {
      return;
    }
    this.lastMapWorld = world;

    if (!this.mapBounds) {
      this.mapBounds = this.computeMapBounds(world);
    }

    const ctx = this.mapContext;
    const canvas = this.nodes.miniMapCanvas;
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(8, 11, 13, 0.92)";
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(188, 197, 203, 0.2)";
    ctx.lineWidth = 12;
    this.drawMapRoute(ctx, world, width, height);
    ctx.strokeStyle = "rgba(224, 226, 218, 0.86)";
    ctx.lineWidth = 4;
    this.drawMapRoute(ctx, world, width, height);

    if (this.remodelMapMode) {
      if (!this.remodelRouteProfile) {
        this.setRemodelRouteProfile(world.getRemodelRouteProfile?.());
      }
      this.drawRemodelMapEditor(ctx, world, width, height);
      ctx.restore();
      return;
    }

    if (this.isAdmin) {
      this.drawTunnelMarkers(ctx, world, width, height);
    }

    ctx.fillStyle = "rgba(195, 72, 58, 0.82)";
    for (const car of traffic.cars) {
      const point = this.worldToMap(car, width, height);
      ctx.fillRect(point.x - 1.5, point.y - 1.5, 3, 3);
    }

    const playerPoint = this.worldToMap(player.position, width, height);
    ctx.translate(playerPoint.x, playerPoint.y);
    ctx.rotate(Math.PI - player.yaw);
    ctx.fillStyle = "#f2efe4";
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  handleMapPointerDown(event) {
    if (this.handleMapPanPointerDown(event)) {
      return;
    }

    if (this.handleRemodelMapPointerDown(event)) {
      return;
    }

    if (!this.mapVisible || !this.isAdmin || event.button !== 0 || !this.nodes.miniMapCanvas || !this.mapBounds) {
      return;
    }

    const canvas = this.nodes.miniMapCanvas;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    this.onMapTeleport?.(this.mapToWorld(x, y, canvas.width, canvas.height));
    event.preventDefault();
    event.stopPropagation();
  }

  computeMapBounds(world) {
    const bounds = {
      minX: Infinity,
      maxX: -Infinity,
      minZ: Infinity,
      maxZ: -Infinity,
    };
    for (const sample of world.roadSamples) {
      bounds.minX = Math.min(bounds.minX, sample.center.x);
      bounds.maxX = Math.max(bounds.maxX, sample.center.x);
      bounds.minZ = Math.min(bounds.minZ, sample.center.z);
      bounds.maxZ = Math.max(bounds.maxZ, sample.center.z);
    }
    const profile = this.remodelMapMode ? (this.remodelRouteProfile ?? world.getRemodelRouteProfile?.()) : null;
    for (const point of profile?.controlPoints ?? []) {
      bounds.minX = Math.min(bounds.minX, point.x);
      bounds.maxX = Math.max(bounds.maxX, point.x);
      bounds.minZ = Math.min(bounds.minZ, point.z);
      bounds.maxZ = Math.max(bounds.maxZ, point.z);
    }
    for (const branch of profile?.branches ?? []) {
      for (const point of branch.points ?? []) {
        bounds.minX = Math.min(bounds.minX, point.x);
        bounds.maxX = Math.max(bounds.maxX, point.x);
        bounds.minZ = Math.min(bounds.minZ, point.z);
        bounds.maxZ = Math.max(bounds.maxZ, point.z);
      }
    }
    const padding = 220;
    bounds.minX -= padding;
    bounds.maxX += padding;
    bounds.minZ -= padding;
    bounds.maxZ += padding;
    return bounds;
  }

  getSpawnLockedRoutePointIndices(profile = this.remodelRouteProfile) {
    const points = profile?.controlPoints ?? [];
    const startPose = this.lastMapWorld?.getStartPose?.();
    if (!startPose || points.length < 2) {
      return new Set();
    }

    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const distance = this.distanceToSegment2D(startPose.x, startPose.z, { x: a.x, y: a.z }, { x: b.x, y: b.z });
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }

    return new Set([bestIndex, (bestIndex + 1) % points.length]);
  }

  isRemodelRoutePointLocked(handle) {
    return handle?.type === "routePoint" && this.getSpawnLockedRoutePointIndices().has(handle.index);
  }

  isWorldPointInTunnel(world, point) {
    if (!world || !point) {
      return false;
    }
    const nearest = world.getNearestRoadInfo?.(new THREE.Vector3(point.x, 0, point.z));
    if (!nearest || nearest.isBranch) {
      return false;
    }
    return this.isTrackDistanceInTunnels(nearest.s, this.remodelRouteProfile?.tunnels ?? world.tunnelRuns ?? [], world.trackLength);
  }

  isTrackDistanceInTunnels(s, tunnels, trackLength) {
    if (!Number.isFinite(s) || !Number.isFinite(trackLength) || trackLength <= 0) {
      return false;
    }
    return tunnels.some((tunnel) => {
      const start = ((Number(tunnel.start) || 0) % trackLength + trackLength) % trackLength;
      const length = Math.max(0, Number(tunnel.length) || 0);
      const end = (start + length) % trackLength;
      return length >= trackLength
        || (start <= end ? s >= start && s <= end : s >= start || s <= end);
    });
  }

  drawMapRoute(ctx, world, width, height) {
    const routes = world.mapRoutes?.length ? world.mapRoutes : [{ samples: world.roadSamples, closed: true }];
    for (const route of routes) {
      ctx.beginPath();
      route.samples.forEach((sample, index) => {
        const point = this.worldToMap(sample.center, width, height);
        if (index === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      });
      if (route.closed) {
        ctx.closePath();
      }
      ctx.stroke();
    }
  }

  drawTunnelMarkers(ctx, world, width, height) {
    const tunnels = world.tunnelRuns ?? [];
    if (!tunnels.length) {
      return;
    }

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(120, 224, 193, 0.9)";
    ctx.lineWidth = 7;
    ctx.fillStyle = "rgba(120, 224, 193, 0.95)";
    ctx.font = "700 10px Inter, sans-serif";
    ctx.textBaseline = "middle";

    for (const run of tunnels) {
      const steps = Math.max(8, Math.ceil(run.length / 120));
      ctx.beginPath();
      for (let i = 0; i <= steps; i += 1) {
        const frame = world.getFrameAtDistance(run.start + (run.length * i) / steps);
        const point = this.worldToMap(frame.center, width, height);
        if (i === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      }
      ctx.stroke();

      const start = this.worldToMap(world.getFrameAtDistance(run.start).center, width, height);
      const end = this.worldToMap(world.getFrameAtDistance(run.start + run.length).center, width, height);
      ctx.beginPath();
      ctx.arc(start.x, start.y, 3.5, 0, Math.PI * 2);
      ctx.arc(end.x, end.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(run.name ?? "Tunnel", start.x + 7, start.y);
    }
    ctx.restore();
  }

  drawRemodelMapEditor(ctx, world, width, height) {
    const profile = this.remodelRouteProfile;
    if (!profile) {
      return;
    }

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    this.drawRemodelProfilePath(ctx, profile.controlPoints, true, width, height, {
      stroke: "rgba(120, 224, 193, 0.98)",
      tunnelStroke: "rgba(116, 173, 255, 0.98)",
      width: 3,
      world,
    });
    for (let i = 0; i < profile.branches.length; i += 1) {
      this.drawRemodelProfilePath(ctx, profile.branches[i].points, false, width, height, {
        stroke: "rgba(255, 190, 92, 0.95)",
        tunnelStroke: "rgba(255, 190, 92, 0.95)",
        width: 3,
        world: null,
      });
    }

    ctx.strokeStyle = "rgba(92, 153, 255, 0.92)";
    ctx.lineWidth = 8;
    for (const tunnel of profile.tunnels) {
      ctx.beginPath();
      const steps = Math.max(8, Math.ceil((Number(tunnel.length) || 0) / 140));
      for (let i = 0; i <= steps; i += 1) {
        const frame = world.getFrameAtDistance(tunnel.start + (tunnel.length * i) / steps);
        const point = this.worldToMap(frame.center, width, height);
        if (i === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      }
      ctx.stroke();
    }

    this.drawRemodelMapHandles(ctx, profile, world, width, height);
    this.drawRemodelMapLegend(ctx, width, height);
    ctx.restore();
  }

  drawRemodelProfilePath(ctx, points, closed, width, height, style) {
    if (!points?.length) {
      return;
    }
    ctx.save();
    ctx.lineWidth = style.width;
    const limit = closed ? points.length : points.length - 1;
    for (let i = 0; i < limit; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const midpoint = { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 };
      ctx.strokeStyle = style.world && this.isWorldPointInTunnel(style.world, midpoint)
        ? style.tunnelStroke ?? style.stroke
        : style.stroke;
      const mappedA = this.worldToMap(a, width, height);
      const mappedB = this.worldToMap(b, width, height);
      ctx.beginPath();
      ctx.moveTo(mappedA.x, mappedA.y);
      ctx.lineTo(mappedB.x, mappedB.y);
      ctx.stroke();
    }
    if (points.length === 1) {
      const mapped = this.worldToMap(points[0], width, height);
      ctx.beginPath();
      ctx.arc(mapped.x, mapped.y, 1, 0, Math.PI * 2);
      ctx.fillStyle = style.stroke;
      ctx.fill();
    }
    ctx.restore();
  }

  drawRemodelMapHandles(ctx, profile, world, width, height) {
    const lockedRoutePoints = this.getSpawnLockedRoutePointIndices(profile);
    const drawHandle = (point, color, selected = false, radius = 6, locked = false) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, selected ? radius + 3 : radius, 0, Math.PI * 2);
      ctx.fillStyle = locked ? "#46515b" : selected ? "#ffffff" : color;
      ctx.fill();
      ctx.lineWidth = locked ? 3 : selected ? 3 : 2;
      ctx.strokeStyle = locked ? "#f1d36b" : selected ? color : "rgba(8, 10, 11, 0.86)";
      ctx.stroke();
      if (locked) {
        ctx.beginPath();
        ctx.moveTo(point.x - radius * 0.55, point.y);
        ctx.lineTo(point.x + radius * 0.55, point.y);
        ctx.strokeStyle = "#f1d36b";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    };

    profile.controlPoints.forEach((point, index) => {
      const mapped = this.worldToMap(point, width, height);
      const inTunnel = this.isWorldPointInTunnel(world, point);
      drawHandle(
        mapped,
        inTunnel ? "#74adff" : "#78e0c1",
        this.isRemodelMapSelection("routePoint", { index }),
        inTunnel ? 6.5 : 6,
        lockedRoutePoints.has(index),
      );
    });

    profile.branches.forEach((branch, branchIndex) => {
      branch.points.forEach((point, index) => {
        const mapped = this.worldToMap(point, width, height);
        drawHandle(mapped, "#ffbe5c", this.isRemodelMapSelection("branchPoint", { branchIndex, index }), index === 0 ? 7 : 5);
      });
    });

    profile.tunnels.forEach((tunnel, index) => {
      const start = this.worldToMap(world.getFrameAtDistance(tunnel.start).center, width, height);
      const end = this.worldToMap(world.getFrameAtDistance(tunnel.start + tunnel.length).center, width, height);
      drawHandle(start, "#7ee0ff", this.isRemodelMapSelection("tunnelStart", { index }) || this.isRemodelMapSelection("tunnel", { index }), 5);
      drawHandle(end, "#7ee0ff", this.isRemodelMapSelection("tunnelEnd", { index }), 5);
    });
  }

  isRemodelMapSelection(type, match = {}) {
    const selection = this.remodelMapSelection;
    if (!selection || selection.type !== type) {
      return false;
    }
    return Object.entries(match).every(([key, value]) => selection[key] === value);
  }

  drawRemodelMapLegend(ctx, width, height) {
    ctx.save();
    ctx.fillStyle = "rgba(8, 10, 11, 0.72)";
    ctx.fillRect(20, height - 76, Math.min(520, width - 40), 56);
    ctx.fillStyle = "rgba(242, 239, 228, 0.88)";
    ctx.font = "800 12px Inter, sans-serif";
    ctx.fillText("Remodel map: drag handles. Spawn segment is locked. Wheel zooms, right/middle or Shift-drag pans.", 34, height - 48);
    ctx.fillStyle = "rgba(226, 221, 206, 0.64)";
    ctx.font = "700 10px Inter, sans-serif";
    ctx.fillText("Tunnel handles/segments are blue. Junction click creates/extends branches. Save persists to localStorage.", 34, height - 28);
    ctx.restore();
  }

  worldToMap(position, width, height) {
    const { bounds, mapWidth, mapHeight, offsetX, offsetY, scale } = this.getMapLayout(width, height);
    return {
      x: offsetX + (position.x - bounds.minX) * scale,
      y: offsetY + (position.z - bounds.minZ) * scale,
    };
  }

  mapToWorld(x, y, width, height, options = {}) {
    const { bounds, mapWidth, mapHeight, offsetX, offsetY, scale } = this.getMapLayout(width, height);
    const clampedX = options.unclamped ? x : THREE.MathUtils.clamp(x, offsetX, offsetX + mapWidth);
    const clampedY = options.unclamped ? y : THREE.MathUtils.clamp(y, offsetY, offsetY + mapHeight);
    return {
      x: bounds.minX + (clampedX - offsetX) / scale,
      z: bounds.minZ + (clampedY - offsetY) / scale,
    };
  }

  getMapLayout(width, height) {
    const bounds = this.mapBounds;
    const zoom = THREE.MathUtils.clamp(this.mapView?.zoom ?? 1, 0.22, 7);
    const baseSpanX = Math.max(1, bounds.maxX - bounds.minX);
    const baseSpanZ = Math.max(1, bounds.maxZ - bounds.minZ);
    const centerX = (bounds.minX + bounds.maxX) * 0.5 + (this.mapView?.panX ?? 0);
    const centerZ = (bounds.minZ + bounds.maxZ) * 0.5 + (this.mapView?.panZ ?? 0);
    const spanX = baseSpanX / zoom;
    const spanZ = baseSpanZ / zoom;
    const viewBounds = {
      minX: centerX - spanX * 0.5,
      maxX: centerX + spanX * 0.5,
      minZ: centerZ - spanZ * 0.5,
      maxZ: centerZ + spanZ * 0.5,
    };
    const scale = Math.min((width - 36) / spanX, (height - 36) / spanZ);
    const mapWidth = spanX * scale;
    const mapHeight = spanZ * scale;
    return {
      bounds: viewBounds,
      scale,
      mapWidth,
      mapHeight,
      offsetX: (width - mapWidth) * 0.5,
      offsetY: (height - mapHeight) * 0.5,
    };
  }
}
