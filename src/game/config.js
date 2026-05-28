export const LANE_WIDTH = 4;
export const LANES = [-LANE_WIDTH, 0, LANE_WIDTH];
export const ROAD_WIDTH = 14;
export const ROAD_LIMIT = 5.65;
export const PLAYER_START = {
  x: -55,
  z: -56,
  yaw: 0,
};

function formatTimeOfDay(value) {
  const normalized = ((Number(value) % 24) + 24) % 24;
  const totalMinutes = Math.round(normalized * 60) % 1440;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export const DEFAULT_SETTINGS = {
  carPreset: "JapanLegend",
  maxSpeedKmh: 285,
  trafficEnabled: true,
  trafficDensity: 150,
  trafficSpeedKmh: 118,
  cameraFov: 64,
  dayNightCycle: true,
  timeOfDay: 18.25,
  dayNightSpeed: 18,
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
  "JapanRallyLegendCoupe",
  "JapanRotaryCoupe",
  "JapanSmallCoupe",
  "JapanSmallFighter",
  "JapanSmallFWDCoupe",
  "JapanSportCoupeTrackEdition",
  "JapanTuner",
];

export const TRAFFIC_CAR_IDS = ["JapanRallyLegacy", "JapanSedan", "KoreanHatch"];

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
  return {
    id,
    psxModel: id,
    label: labelFromModelId(id),
    price: 0,
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
  };
}

export const CAR_PRESETS = PSX_MODEL_IDS.map(createPsxPreset);

export function getCarPreset(id) {
  return CAR_PRESETS.find((preset) => preset.id === id) ?? CAR_PRESETS[0];
}

export const PARTS_CATALOG = [
  {
    id: "engine",
    app: "BoostBay",
    label: "Aspirazione + scarico",
    detail: "Pezzi usati, piu allungo",
    baseCost: 320,
    costStep: 210,
    maxLevel: 5,
  },
  {
    id: "turbo",
    app: "TurboSwap",
    label: "Turbo kit rigenerato",
    detail: "Spinge forte, non chiedere fattura",
    baseCost: 480,
    costStep: 330,
    maxLevel: 4,
  },
  {
    id: "ecu",
    app: "ECUCloud",
    label: "Mappa ECU notturna",
    detail: "Piu boost e limitatore alto",
    baseCost: 390,
    costStep: 260,
    maxLevel: 4,
  },
  {
    id: "tires",
    app: "TyreCart",
    label: "Semi slick usate",
    detail: "Grip extra sui curvoni",
    baseCost: 300,
    costStep: 190,
    maxLevel: 5,
  },
  {
    id: "handling",
    app: "SuspensionLab",
    label: "Assetto coilover",
    detail: "Sterzo piu rapido e stabile",
    baseCost: 280,
    costStep: 180,
    maxLevel: 5,
  },
  {
    id: "brakes",
    app: "BrakeStop",
    label: "Kit freni maggiorato",
    detail: "Meno panico, piu staccata",
    baseCost: 290,
    costStep: 185,
    maxLevel: 5,
  },
  {
    id: "weight",
    app: "Junkyard",
    label: "Alleggerimento interni",
    detail: "Via sedili, via silenzio",
    baseCost: 360,
    costStep: 240,
    maxLevel: 4,
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
  { key: "handling", format: (value) => Number(value).toFixed(2) },
  { key: "powerMultiplier", format: (value) => `${Number(value).toFixed(2)}x` },
  { key: "gripMultiplier", format: (value) => `${Number(value).toFixed(2)}x` },
  { key: "brakePower", format: (value) => `${Number(value).toFixed(2)}x` },
  { key: "weightMultiplier", format: (value) => `${Number(value).toFixed(2)}x` },
  { key: "noClipSpeedKmh", format: (value) => `${Math.round(value)}` },
  { key: "noClipBoostSpeedKmh", format: (value) => `${Math.round(value)}` },
  { key: "remodelGridSize", format: (value) => `${Number(value).toFixed(2)}` },
];
