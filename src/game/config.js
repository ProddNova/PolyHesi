export const LANE_WIDTH = 4;
export const LANES = [-LANE_WIDTH, 0, LANE_WIDTH];
export const ROAD_WIDTH = 14;
export const ROAD_LIMIT = 5.65;
export const PLAYER_START = {
  x: -55,
  z: -56,
  yaw: 0,
};
export const STARTER_CAR_ID = "JapanLegendaryDrifter";
export const PROGRESS_VERSION = 4;

function formatTimeOfDay(value) {
  const normalized = ((Number(value) % 24) + 24) % 24;
  const totalMinutes = Math.round(normalized * 60) % 1440;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export const DEFAULT_SETTINGS = {
  carPreset: STARTER_CAR_ID,
  maxSpeedKmh: 285,
  trafficEnabled: true,
  trafficDensity: 150,
  trafficSpeedKmh: 118,
  cameraFov: 64,
  dayNightCycle: true,
  timeOfDay: 18.25,
  dayNightSpeed: 18,
  renderScale: 1,
  nightBrightness: 1,
  roadLightIntensity: 1,
  handling: 0.85,
  brakePower: 1,
  powerMultiplier: 1,
  gripMultiplier: 1,
  weightMultiplier: 1,
  noClip: false,
  noClipSpeedKmh: 101,
  noClipBoostSpeedKmh: 331,
  hitboxMode: false,
  remodelMode: false,
  remodelSnapToGrid: false,
  remodelGridSize: 0.25,
};

const PSX_MODEL_IDS = [
  "JapanSportCoupe",
  "AmericanEagle",
  "AmericanMuscle",
  "AmericanSportSedan",
  "AmericanSuperSedan",
  "AutobahnRacer",
  "CuteMonster",
  "ElectricHyperCar",
  "EnglishLightSportcar",
  "GermanBandit",
  "GermanHypercar",
  "GermanOldBandit",
  "GermanRetroHypercar",
  "GermanRetroSportCar",
  "GermanSmallCoupe",
  "GermanSmallFighter",
  "GermanSportCar",
  "GermanSportLegend",
  "GermanSportWagen",
  "GermanV8Supercar",
  "Ital80sSupercar",
  "ItalHypercar16.4",
  "ItalHyperCarLimitedEdition",
  "ItalRareSupercar",
  "Japan4WDStreetRacer",
  "JapanDrifter",
  "JapanKeiCar",
  "JapanLegend",
  "JapanLegendaryDrifter",
  "JapanRallyFox",
  "JapanRallyLegacy",
  "JapanRallyLegendCoupe",
  "JapanRotaryCoupe",
  "JapanSedan",
  "JapanSmallCoupe",
  "JapanSmallFighter",
  "JapanSmallFWDCoupe",
  "JapanSportCoupeTrackEdition",
  "JapanTuner",
  "KoreanHatch",
  "LightHypercar",
  "ModernRallyCar",
  "NextGenGodzilla",
  "PoliceInterceptorEstate",
  "RoyalMotorsport",
  "RoyalRacingCar",
  "RoyalSportCar",
  "RoyalSportCarLimitedEdition",
  "ScandinavianHypercar",
];

export const PLAYER_CAR_IDS = [
  "AmericanMuscle",
  "AmericanSportSedan",
  "AmericanSuperSedan",
  "AutobahnRacer",
  "EnglishLightSportcar",
  "GermanHypercar",
  "GermanOldBandit",
  "GermanRetroSportCar",
  "GermanSmallCoupe",
  "GermanSmallFighter",
  "GermanSportCar",
  "GermanSportWagen",
  "GermanV8Supercar",
  "ItalRareSupercar",
  "Japan4WDStreetRacer",
  "JapanDrifter",
  "JapanLegend",
  "JapanLegendaryDrifter",
  "JapanRallyLegendCoupe",
  "JapanRotaryCoupe",
  "JapanSmallCoupe",
  "JapanSmallFighter",
  "JapanSmallFWDCoupe",
  "JapanSportCoupeTrackEdition",
  "JapanTuner",
];

export const TRAFFIC_CAR_IDS = ["JapanRallyLegacy", "JapanSedan", "KoreanHatch"];
export const DEFAULT_VEHICLE_RIG_TUNE = Object.freeze({
  rideHeight: 0,
  frontWheelOffsetX: 0,
  frontWheelOffsetY: 0,
  frontWheelOffsetZ: 0,
  rearWheelOffsetX: 0,
  rearWheelOffsetY: 0,
  rearWheelOffsetZ: 0,
  wheelScale: 1,
  bodyOffsetY: 0,
  bodyOffsetZ: 0,
});

const PAINT_COLORS = [
  0xb43f38, 0xd6ad3d, 0x596064, 0x2f4a5f, 0x30a78f, 0xd4d1c8,
  0x463f5b, 0x222529, 0xa7b7bd, 0x2d6a78, 0x8e2f29, 0xe9e2cf,
];

const SECONDARY_COLORS = [0x171a1e, 0x111416, 0x141619, 0x101316, 0x20242a];

function labelFromModelId(id) {
  return id
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyModel(id) {
  const key = id.toLowerCase();
  if (key.includes("kei") || key.includes("hatch") || key.includes("small")) {
    return { length: 4.05, width: 1.78, speed: 0.92, accel: 10.8, grip: 0.54, steer: 0.62 };
  }
  if (key.includes("suv") || key.includes("estate") || key.includes("wagen")) {
    return { length: 5.1, width: 2.02, speed: 1.02, accel: 11.2, grip: 0.48, steer: 0.52 };
  }
  if (key.includes("hyper") || key.includes("super") || key.includes("limited")) {
    return { length: 4.78, width: 2.04, speed: 1.24, accel: 16.2, grip: 0.34, steer: 0.48 };
  }
  if (key.includes("rally") || key.includes("drift") || key.includes("tuner")) {
    return { length: 4.42, width: 1.9, speed: 1.06, accel: 13.2, grip: 0.58, steer: 0.66 };
  }
  if (key.includes("sedan") || key.includes("muscle") || key.includes("eagle")) {
    return { length: 4.92, width: 1.96, speed: 1.08, accel: 12.4, grip: 0.5, steer: 0.54 };
  }
  return { length: 4.55, width: 1.9, speed: 1.04, accel: 12.2, grip: 0.48, steer: 0.56 };
}

function createPsxPreset(id, index) {
  const profile = classifyModel(id);
  const speedBias = 1 + (index % 5) * 0.012;
  const basePrice = Math.round(
    (180 + profile.accel * 22 + profile.speed * 260 + index * 6) / 10,
  ) * 10;
  return {
    id,
    psxModel: id,
    label: labelFromModelId(id),
    price: id === STARTER_CAR_ID ? 0 : basePrice,
    seller: "PSXStyleCars",
    condition: "asset folder",
    mileage: "showroom",
    color: PAINT_COLORS[index % PAINT_COLORS.length],
    secondaryColor: SECONDARY_COLORS[index % SECONDARY_COLORS.length],
    maxSpeedScale: profile.speed * speedBias,
    acceleration: profile.accel,
    brakeForce: profile.speed > 1.15 ? 19.6 : 17.2,
    reverseForce: 7.4,
    coastDrag: profile.speed > 1.15 ? 0.031 : 0.038,
    throttleDrag: profile.speed > 1.15 ? 0.009 : 0.012,
    aeroDrag: profile.speed > 1.15 ? 0.00028 : 0.00035,
    steerRise: profile.steer > 0.6 ? 4.6 : 3.7,
    steerReturn: profile.steer > 0.6 ? 7.4 : 6.8,
    lowSpeedSteer: profile.steer,
    highSpeedSteer: profile.steer * 0.088,
    yawScale: profile.steer * 0.75,
    yawLowLimit: profile.steer * 1.9,
    yawHighLimit: profile.steer * 0.68,
    gripLoss: profile.grip,
    bodyLength: profile.length,
    bodyWidth: profile.width,
    bodyHeight: 0.68,
    cabinLength: profile.length * 0.34,
    cabinOffset: -0.24,
    inGamePlayer: PLAYER_CAR_IDS.includes(id),
    trafficEligible: TRAFFIC_CAR_IDS.includes(id),
    vehicleRig: { ...DEFAULT_VEHICLE_RIG_TUNE },
  };
}

export const CAR_PRESETS = PSX_MODEL_IDS.map(createPsxPreset);

export function getCarPreset(id) {
  return CAR_PRESETS.find((preset) => preset.id === id) ?? CAR_PRESETS[0];
}

const AUCTION_COLORS = [
  { name: "Rosso corsa", color: 0xb43f38, secondaryColor: 0x171a1e },
  { name: "Giallo sodio", color: 0xd6ad3d, secondaryColor: 0x111416 },
  { name: "Grafite", color: 0x596064, secondaryColor: 0x141619 },
  { name: "Blu notte", color: 0x2f4a5f, secondaryColor: 0x101316 },
  { name: "Verde acqua", color: 0x30a78f, secondaryColor: 0x20242a },
  { name: "Bianco perla", color: 0xd4d1c8, secondaryColor: 0x171a1e },
  { name: "Viola midnight", color: 0x463f5b, secondaryColor: 0x111416 },
  { name: "Nero ossidiana", color: 0x222529, secondaryColor: 0x141619 },
  { name: "Argento metallo", color: 0xa7b7bd, secondaryColor: 0x101316 },
  { name: "Blu petrolio", color: 0x2d6a78, secondaryColor: 0x20242a },
  { name: "Rosso mattone", color: 0x8e2f29, secondaryColor: 0x171a1e },
  { name: "Crema oldschool", color: 0xe9e2cf, secondaryColor: 0x111416 },
];

const AUCTION_TRANSMISSIONS = [
  "Manuale 5 marce",
  "Manuale 6 marce",
  "Automatico 6 rapporti",
  "Doppia frizione",
  "Sequenziale corto",
];

const AUCTION_ENGINES = [
  "1.6 turbo benzina",
  "2.0 aspirato",
  "2.0 turbo",
  "2.5 turbo",
  "3.0 sei cilindri",
  "V8 aspirato",
];

const AUCTION_CONDITIONS = [
  "tagliandi misti",
  "vernice vissuta",
  "interni buoni",
  "meccanica pronta",
  "progetto leggero",
  "ex trackday",
];

const AUCTION_SELLERS = [
  "NightRunner Auctions",
  "Dockside Imports",
  "Neon Lot Milano",
  "Private Seller",
  "Hillside Garage",
  "Midnight Fleet",
];

const AUCTION_LOCATIONS = [
  "Milano est",
  "Bergamo",
  "Monza",
  "Torino sud",
  "Verona",
  "Bologna",
];

function formatKilometers(value) {
  return `${Math.round(value).toLocaleString("it-IT")} km`;
}

function createCarAuctionListing(preset, carIndex, variantIndex) {
  const seed = carIndex * 17 + variantIndex * 31;
  const color = AUCTION_COLORS[seed % AUCTION_COLORS.length];
  const mileageKm = 18000 + ((seed * 13873) % 184000) + variantIndex * 2400;
  const mileageFactor = Math.max(0.62, 1.08 - mileageKm / 360000);
  const transmission = AUCTION_TRANSMISSIONS[(seed + carIndex) % AUCTION_TRANSMISSIONS.length];
  const engine = AUCTION_ENGINES[(seed + Math.floor(preset.maxSpeedScale * 10)) % AUCTION_ENGINES.length];
  const condition = AUCTION_CONDITIONS[(seed + variantIndex) % AUCTION_CONDITIONS.length];
  const seller = AUCTION_SELLERS[(seed + 2) % AUCTION_SELLERS.length];
  const basePrice = Math.max(preset.price, 420);
  const colorPremium = color.name.includes("Nero") || color.name.includes("Bianco") ? 1.08 : 1;
  const manualPremium = transmission.includes("Manuale") ? 1.07 : 0.98;
  const price = Math.round((basePrice * mileageFactor * colorPremium * manualPremium + variantIndex * 140) / 10) * 10;

  return {
    id: `lot-${preset.id}-${variantIndex + 1}`,
    lot: `NR-${String(carIndex + 1).padStart(2, "0")}${variantIndex + 1}`,
    carId: preset.id,
    label: preset.label,
    seller,
    condition,
    mileageKm,
    mileage: formatKilometers(mileageKm),
    color: color.color,
    colorName: color.name,
    secondaryColor: color.secondaryColor,
    transmission,
    engine,
    location: AUCTION_LOCATIONS[seed % AUCTION_LOCATIONS.length],
    endsIn: `${2 + ((seed + 3) % 9)}h ${10 + ((seed * 7) % 49)}m`,
    bids: 3 + ((seed * 5) % 24),
    price,
  };
}

export const CAR_AUCTION_LISTINGS = CAR_PRESETS
  .filter((preset) => preset.inGamePlayer)
  .flatMap((preset, index) => {
    const listingCount = index % 4 === 0 ? 3 : 2;
    return Array.from({ length: listingCount }, (_item, variantIndex) =>
      createCarAuctionListing(preset, index, variantIndex),
    );
  });

export const STARTER_VEHICLE_ID = `starter-${STARTER_CAR_ID}`;

export function createStarterVehicle() {
  const preset = getCarPreset(STARTER_CAR_ID);
  return {
    id: STARTER_VEHICLE_ID,
    carId: STARTER_CAR_ID,
    label: preset.label,
    sourceListingId: null,
    purchasePrice: 0,
    seller: "Garage",
    condition: "prima auto",
    mileageKm: 92000,
    mileage: formatKilometers(92000),
    color: preset.color,
    colorName: "Rosso garage",
    secondaryColor: preset.secondaryColor,
    transmission: "Manuale 5 marce",
    engine: "2.0 turbo",
  };
}

export function createVehicleFromListing(listing) {
  return {
    id: `owned-${listing.id}`,
    carId: listing.carId,
    label: listing.label,
    sourceListingId: listing.id,
    purchasePrice: listing.price,
    seller: listing.seller,
    condition: listing.condition,
    mileageKm: listing.mileageKm,
    mileage: listing.mileage,
    color: listing.color,
    colorName: listing.colorName,
    secondaryColor: listing.secondaryColor,
    transmission: listing.transmission,
    engine: listing.engine,
  };
}

export function getVehiclePreset(vehicle) {
  const preset = getCarPreset(vehicle?.carId ?? vehicle?.id ?? STARTER_CAR_ID);
  return {
    ...preset,
    id: vehicle?.id ?? preset.id,
    carId: preset.id,
    label: preset.label,
    color: vehicle?.color ?? preset.color,
    secondaryColor: vehicle?.secondaryColor ?? preset.secondaryColor,
  };
}

export function sanitizeVehicleRigTune(raw = {}) {
  const finite = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const legacyWheelOffsetX = finite(raw.wheelOffsetX, DEFAULT_VEHICLE_RIG_TUNE.frontWheelOffsetX);
  const legacyWheelOffsetY = finite(raw.wheelOffsetY, DEFAULT_VEHICLE_RIG_TUNE.frontWheelOffsetY);
  const legacyWheelOffsetZ = finite(raw.wheelOffsetZ, DEFAULT_VEHICLE_RIG_TUNE.frontWheelOffsetZ);
  return {
    rideHeight: finite(raw.rideHeight, DEFAULT_VEHICLE_RIG_TUNE.rideHeight),
    frontWheelOffsetX: finite(raw.frontWheelOffsetX, legacyWheelOffsetX),
    frontWheelOffsetY: finite(raw.frontWheelOffsetY, legacyWheelOffsetY),
    frontWheelOffsetZ: finite(raw.frontWheelOffsetZ, legacyWheelOffsetZ),
    rearWheelOffsetX: finite(raw.rearWheelOffsetX, legacyWheelOffsetX),
    rearWheelOffsetY: finite(raw.rearWheelOffsetY, legacyWheelOffsetY),
    rearWheelOffsetZ: finite(raw.rearWheelOffsetZ, legacyWheelOffsetZ),
    wheelScale: Math.max(0.4, Math.min(2.2, finite(raw.wheelScale, DEFAULT_VEHICLE_RIG_TUNE.wheelScale))),
    bodyOffsetY: finite(raw.bodyOffsetY, DEFAULT_VEHICLE_RIG_TUNE.bodyOffsetY),
    bodyOffsetZ: finite(raw.bodyOffsetZ, DEFAULT_VEHICLE_RIG_TUNE.bodyOffsetZ),
  };
}

export function isActivePsxCarPreset(preset) {
  return Boolean(preset && preset.enabled !== false && (preset.inGamePlayer || preset.trafficEligible));
}

export const PARTS_CATALOG = [
  {
    id: "air_filter_kmn",
    category: "Aspirazione",
    app: "PartDock",
    brand: "K-MN",
    label: "Filtro aria sportivo",
    detail: "Pannello lavabile per motori stock",
    baseCost: 260,
    maxLevel: 1,
    effects: { maxSpeedKmh: 4, powerMultiplier: 0.018 },
  },
  {
    id: "exhaust_remus_street",
    category: "Scarico",
    app: "PartDock",
    brand: "Remus",
    label: "Catback inox street",
    detail: "Scarico completo omologato pista",
    baseCost: 420,
    maxLevel: 1,
    effects: { maxSpeedKmh: 7, powerMultiplier: 0.024 },
  },
  {
    id: "turbo_ihi_stage1",
    category: "Turbo",
    app: "TurboSwap",
    brand: "IHI",
    label: "Turbina maggiorata Stage 1",
    detail: "Rigenerata, spool rapido",
    baseCost: 720,
    maxLevel: 1,
    effects: { maxSpeedKmh: 9, powerMultiplier: 0.078 },
  },
  {
    id: "turbo_garrett_gtx",
    category: "Turbo",
    app: "TurboSwap",
    brand: "Garrett",
    label: "Turbina GTX usata",
    detail: "Costa di piu, spinge piu in alto",
    baseCost: 1180,
    maxLevel: 1,
    effects: { maxSpeedKmh: 15, powerMultiplier: 0.126 },
  },
  {
    id: "ecu_nightflash",
    category: "Elettronica",
    app: "ECUCloud",
    brand: "NightFlash",
    label: "Mappa ECU 98 ottani",
    detail: "Boost e limitatore piu aggressivi",
    baseCost: 540,
    maxLevel: 1,
    effects: { maxSpeedKmh: 10, powerMultiplier: 0.045 },
  },
  {
    id: "spacers_hr_12",
    category: "Assetto",
    app: "SuspensionLab",
    brand: "H&R",
    label: "Distanziali 12 mm",
    detail: "Carreggiata piu larga, sterzo piu pieno",
    baseCost: 210,
    maxLevel: 1,
    effects: { handling: 0.035, gripMultiplier: 0.018 },
  },
  {
    id: "coilovers_bilstein_b14",
    category: "Assetto",
    app: "SuspensionLab",
    brand: "Bilstein",
    label: "Assetto B14 coilover",
    detail: "Regolabile, buono su strada",
    baseCost: 620,
    maxLevel: 1,
    effects: { handling: 0.09, gripMultiplier: 0.035 },
  },
  {
    id: "coilovers_kw_v3",
    category: "Assetto",
    app: "SuspensionLab",
    brand: "KW",
    label: "Assetto V3 inox",
    detail: "Piu caro, piu stabile nei curvoni",
    baseCost: 980,
    maxLevel: 1,
    effects: { handling: 0.135, gripMultiplier: 0.06 },
  },
  {
    id: "tires_advan_semislick",
    category: "Gomme",
    app: "TyreCart",
    brand: "Advan",
    label: "Semi slick 200TW",
    detail: "Grip serio, durata discutibile",
    baseCost: 430,
    maxLevel: 1,
    effects: { handling: 0.04, gripMultiplier: 0.13 },
  },
  {
    id: "brakes_brembo_big",
    category: "Freni",
    app: "BrakeStop",
    brand: "Brembo",
    label: "Kit freni maggiorato",
    detail: "Dischi grandi e pastiglie sportive",
    baseCost: 690,
    maxLevel: 1,
    effects: { brakePower: 0.18 },
  },
  {
    id: "seats_sparco_bucket",
    category: "Peso",
    app: "Junkyard",
    brand: "Sparco",
    label: "Sedili bucket leggeri",
    detail: "Meno peso, piu risposta",
    baseCost: 510,
    maxLevel: 1,
    effects: { handling: 0.026, weightMultiplier: 0.05 },
  },
  {
    id: "flywheel_exedy_light",
    category: "Trasmissione",
    app: "ClutchMart",
    brand: "Exedy",
    label: "Volano alleggerito",
    detail: "Sale di giri piu in fretta",
    baseCost: 460,
    maxLevel: 1,
    effects: { powerMultiplier: 0.026, weightMultiplier: 0.025 },
  },
];

export const DEV_STORAGE_KEY = "polyhesi.devSettings.v1";
export const REMODEL_STORAGE_KEY = "polyhesi.remodelMap.v1";

export const PHYSICS_SETTING_KEYS = [
  "maxSpeedKmh",
  "handling",
  "powerMultiplier",
  "gripMultiplier",
  "brakePower",
  "weightMultiplier",
];

export const SETTING_DEFS = [
  { key: "maxSpeedKmh", format: (value) => `${Math.round(value)}` },
  { key: "trafficDensity", format: (value) => `${Math.round(value)}` },
  { key: "trafficSpeedKmh", format: (value) => `${Math.round(value)}` },
  { key: "cameraFov", format: (value) => `${Math.round(value)}` },
  { key: "timeOfDay", format: formatTimeOfDay },
  { key: "dayNightSpeed", format: (value) => `${Math.round(value)} min/s` },
  { key: "renderScale", format: (value) => `${Number(value).toFixed(2)}x` },
  { key: "nightBrightness", format: (value) => `${Number(value).toFixed(2)}x` },
  { key: "roadLightIntensity", format: (value) => `${Number(value).toFixed(2)}x` },
  { key: "handling", format: (value) => Number(value).toFixed(2) },
  { key: "powerMultiplier", format: (value) => `${Number(value).toFixed(2)}x` },
  { key: "gripMultiplier", format: (value) => `${Number(value).toFixed(2)}x` },
  { key: "brakePower", format: (value) => `${Number(value).toFixed(2)}x` },
  { key: "weightMultiplier", format: (value) => `${Number(value).toFixed(2)}x` },
  { key: "noClipSpeedKmh", format: (value) => `${Math.round(value)}` },
  { key: "noClipBoostSpeedKmh", format: (value) => `${Math.round(value)}` },
  { key: "remodelGridSize", format: (value) => `${Number(value).toFixed(2)}` },
];
