import {
  CAR_AUCTION_LISTINGS,
  CAR_PRESETS,
  DEFAULT_VEHICLE_RIG_TUNE,
  PARTS_CATALOG,
  SETTING_DEFS,
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
    this.nearMissUntil = 0;
    this.marketSite = "cars";
    this.ownedCarsSignature = "";
    this.installedUpgradeSignature = "";

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
      remodelPsxSaveButton: document.querySelector("#remodelPsxSaveButton"),
      remodelPsxInputs: {
        rideHeight: document.querySelector("#remodelPsxRideHeight"),
        wheelOffsetX: document.querySelector("#remodelPsxWheelOffsetX"),
        wheelOffsetY: document.querySelector("#remodelPsxWheelOffsetY"),
        wheelOffsetZ: document.querySelector("#remodelPsxWheelOffsetZ"),
        wheelScale: document.querySelector("#remodelPsxWheelScale"),
        bodyOffsetY: document.querySelector("#remodelPsxBodyOffsetY"),
        bodyOffsetZ: document.querySelector("#remodelPsxBodyOffsetZ"),
      },
      mapOverlay: document.querySelector("#mapOverlay"),
      miniMapCanvas: document.querySelector("#miniMapCanvas"),
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
    this.devPanelVisible = false;
    this.setDevPanelVisible(false);

    document.querySelector("#restartButton").addEventListener("click", () => this.onRestart());
    document.querySelector("#overlayRestartButton").addEventListener("click", () => this.onRestart());
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
    for (const input of Object.values(this.nodes.remodelInputs)) {
      input?.addEventListener("input", () => this.onRemodelChange?.(this.readRemodelState()));
      if (input?.type === "color") {
        continue;
      }
      input?.addEventListener("wheel", (event) => this.handleRemodelInputWheel(event, input), {
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
      input?.addEventListener("wheel", (event) => this.handleRemodelInputWheel(event, input), {
        passive: false,
      });
    }
    this.buildPartsShop();
    for (const button of this.nodes.upgradeButtons) {
      button.addEventListener("click", () => this.onUpgrade?.(button.dataset.upgrade));
    }
    this.bindSettings();
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
        output.value = def.format(value);
        this.onSettingsChange(this.settings, def.key);
      });
    }

    this.bindBooleanSetting("trafficEnabled");
    this.bindBooleanSetting("dayNightCycle");
    this.bindBooleanSetting("noClip");
    this.bindBooleanSetting("remodelMode");
    this.bindBooleanSetting("remodelSnapToGrid");
    this.bindBooleanSetting("hitboxMode");
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
      this.setRemodelAvailable(Boolean(this.settings.noClip));
    }
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

  updateSettingValue(key, value) {
    const def = SETTING_DEFS.find((item) => item.key === key);
    const input = document.querySelector(`#${key}`);
    const output = document.querySelector(`#${key}Out`);
    if (!def || !input || !output) {
      return;
    }

    input.value = value;
    output.value = def.format(value);
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

  handleRemodelInputWheel(event, input) {
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
    this.onRemodelChange?.(this.readRemodelState());
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

  writeRemodelPsxRigState(state = DEFAULT_VEHICLE_RIG_TUNE) {
    const tuned = sanitizeVehicleRigTune(state);
    for (const [key, input] of Object.entries(this.nodes.remodelPsxInputs ?? {})) {
      if (!input) {
        continue;
      }
      input.value = Number(tuned[key] ?? 0).toFixed(2);
    }
  }

  readRemodelPsxRigState() {
    const raw = {};
    for (const [key, input] of Object.entries(this.nodes.remodelPsxInputs ?? {})) {
      raw[key] = Number(input?.value);
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

  setMapVisible(visible) {
    this.mapVisible = visible;
    this.nodes.mapOverlay?.classList.toggle("is-active", visible);
  }

  toggleMap() {
    this.setMapVisible(!this.mapVisible);
  }

  updateMiniMap(world, player, traffic) {
    if (!this.mapVisible || !this.mapContext || !world.roadSamples.length) {
      return;
    }

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

    ctx.fillStyle = "rgba(195, 72, 58, 0.82)";
    for (const car of traffic.cars) {
      const point = this.worldToMap(car, width, height);
      ctx.fillRect(point.x - 1.5, point.y - 1.5, 3, 3);
    }

    const playerPoint = this.worldToMap(player.position, width, height);
    ctx.translate(playerPoint.x, playerPoint.y);
    ctx.rotate(-player.yaw);
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
    const padding = 220;
    bounds.minX -= padding;
    bounds.maxX += padding;
    bounds.minZ -= padding;
    bounds.maxZ += padding;
    return bounds;
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

  worldToMap(position, width, height) {
    const bounds = this.mapBounds;
    const spanX = bounds.maxX - bounds.minX;
    const spanZ = bounds.maxZ - bounds.minZ;
    const scale = Math.min((width - 36) / spanX, (height - 36) / spanZ);
    const mapWidth = spanX * scale;
    const mapHeight = spanZ * scale;
    return {
      x: (width - mapWidth) * 0.5 + (position.x - bounds.minX) * scale,
      y: (height - mapHeight) * 0.5 + (position.z - bounds.minZ) * scale,
    };
  }
}
