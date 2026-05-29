import * as THREE from "three";
import { LANES, REMODEL_STORAGE_KEY, ROAD_WIDTH } from "./config.js";
import { clamp, makeBox, makeCanvasTexture } from "./utils.js";

const ROAD_HALF_WIDTH = ROAD_WIDTH * 0.5;
const RAIL_OFFSET = ROAD_HALF_WIDTH + 1.15;
const DRIVE_LIMIT = RAIL_OFFSET - 1.1;
const TWO_PI = Math.PI * 2;
const ROAD_SAMPLE_COUNT = 560;
const ROAD_RIBBON_SEGMENTS = 960;
const REMODEL_CREATED_GROUP = "RemodelCreatedPieces";
const REMODEL_HITBOX_GROUP = "RemodelHitboxTemplates";
const REMODEL_ROOT_NAMES = new Set([
  "StaticHighwayLoop",
  "FixedRoadsideCityscape",
  "SpawnServiceLot",
  "GarageDoor",
  REMODEL_CREATED_GROUP,
  REMODEL_HITBOX_GROUP,
]);
const MIN_REMODEL_DIMENSION = 0.01;
const GUARDRAIL_SEGMENT_LENGTH = 18.8;
const GUARDRAIL_MODEL = {
  upper: { width: 0.18, height: 0.18, depth: GUARDRAIL_SEGMENT_LENGTH, y: 0.88 },
  lower: { width: 0.14, height: 0.16, depth: GUARDRAIL_SEGMENT_LENGTH, y: 0.48 },
  post: { width: 0.22, height: 1.18, depth: 0.22, y: 0.56 },
  reflector: { width: 0.06, height: 0.18, depth: 0.5, y: 0.86, inset: 0.13 },
};
const HITBOX_TEMPLATES = [
  {
    id: "hitbox:player",
    label: "Player hitbox",
    position: { x: -63, y: 0.7, z: -88 },
    dimensions: { x: 1.86, y: 1.4, z: 4.25 },
    color: 0x30a78f,
    kind: "car",
  },
  {
    id: "hitbox:traffic-car",
    label: "Traffic car hitbox",
    position: { x: -57, y: 0.7, z: -88 },
    dimensions: { x: 1.9, y: 1.4, z: 4.7 },
    color: 0xd6ad3d,
    kind: "car",
  },
  {
    id: "hitbox:traffic-truck",
    label: "Traffic truck hitbox",
    position: { x: -49, y: 1.15, z: -88 },
    dimensions: { x: 2.55, y: 2.3, z: 11.5 },
    color: 0x596064,
    kind: "truck",
  },
];

const BUILDING_TYPES = [
  { id: "slab", width: 24, depth: 16, height: 42, color: 0x89908b, roof: 0x30343a, floors: 10, columns: 5 },
  { id: "office", width: 17, depth: 17, height: 62, color: 0x687985, roof: 0x263039, floors: 14, columns: 4 },
  { id: "stepped", width: 28, depth: 18, height: 50, color: 0x8a8077, roof: 0x36312d, floors: 11, columns: 5 },
  { id: "warehouse", width: 36, depth: 26, height: 18, color: 0x7b8587, roof: 0x343b40, floors: 3, columns: 6 },
  { id: "corner", width: 27, depth: 24, height: 38, color: 0x878475, roof: 0x2f3330, floors: 9, columns: 4 },
  { id: "thinTower", width: 13, depth: 14, height: 78, color: 0x737f8d, roof: 0x242b33, floors: 17, columns: 3 },
  { id: "mall", width: 40, depth: 22, height: 24, color: 0x8d8172, roof: 0x3a3430, floors: 4, columns: 7 },
  { id: "concreteTower", width: 18, depth: 15, height: 86, color: 0x777d7c, roof: 0x282d2d, floors: 19, columns: 4 },
  { id: "twin", width: 30, depth: 17, height: 58, color: 0x7f8990, roof: 0x293038, floors: 13, columns: 3 },
  { id: "parking", width: 34, depth: 24, height: 30, color: 0x777878, roof: 0x2d3032, floors: 7, columns: 6 },
];

const CITY_BUILDING_PLACEMENTS = [
  { s: -180, side: 1, type: "warehouse", scale: 0.86, setback: 10, yaw: -0.04, forward: 10 },
  { s: -124, side: -1, type: "parking", scale: 0.76, setback: 8, yaw: 0.03, forward: -12 },
  { s: 118, side: 1, type: "corner", scale: 0.82, setback: 9, yaw: 0.06, forward: -8 },
  { s: 186, side: -1, type: "mall", scale: 0.74, setback: 10, yaw: -0.05, forward: 14 },
  { s: 720, side: 1, type: "slab", scale: 1.0, setback: 12, yaw: 0.03 },
  { s: 1440, side: -1, type: "office", scale: 0.92, setback: 16, yaw: -0.05 },
  { s: 2180, side: 1, type: "warehouse", scale: 1.04, setback: 18, yaw: 0.0 },
  { s: 3160, side: -1, type: "corner", scale: 0.96, setback: 12, yaw: 0.08 },
  { s: 4520, side: 1, type: "thinTower", scale: 0.9, setback: 19, yaw: -0.04 },
  { s: 5620, side: -1, type: "mall", scale: 0.88, setback: 20, yaw: 0.04 },
  { s: 7040, side: 1, type: "stepped", scale: 0.98, setback: 13, yaw: -0.07 },
  { s: 8420, side: -1, type: "concreteTower", scale: 0.86, setback: 18, yaw: 0.02 },
  { s: 9800, side: 1, type: "twin", scale: 0.96, setback: 16, yaw: 0.06 },
  { s: 11180, side: -1, type: "parking", scale: 1.02, setback: 16, yaw: -0.03 },
  { s: 12620, side: 1, type: "office", scale: 1.06, setback: 18, yaw: 0.0 },
  { s: 13980, side: -1, type: "slab", scale: 0.94, setback: 13, yaw: 0.07 },
  { s: 15440, side: 1, type: "corner", scale: 1.04, setback: 12, yaw: -0.02 },
  { s: 16820, side: -1, type: "warehouse", scale: 0.92, setback: 21, yaw: 0.03 },
  { s: 18160, side: 1, type: "concreteTower", scale: 0.82, setback: 19, yaw: -0.06 },
  { s: 19420, side: -1, type: "thinTower", scale: 1.0, setback: 17, yaw: 0.04 },
  { s: 20760, side: 1, type: "mall", scale: 0.94, setback: 22, yaw: -0.03 },
  { s: 22140, side: -1, type: "twin", scale: 0.9, setback: 15, yaw: 0.02 },
  { s: 23820, side: 1, type: "parking", scale: 0.92, setback: 14, yaw: 0.07 },
  { s: 25280, side: -1, type: "stepped", scale: 1.08, setback: 13, yaw: -0.08 },
  { s: 26860, side: 1, type: "slab", scale: 0.88, setback: 15, yaw: 0.03 },
  { s: 28220, side: -1, type: "office", scale: 0.98, setback: 18, yaw: -0.01 },
  { s: 29680, side: 1, type: "warehouse", scale: 0.86, setback: 23, yaw: 0.05 },
  { s: 31120, side: -1, type: "corner", scale: 0.9, setback: 14, yaw: -0.04 },
  { s: 32640, side: 1, type: "thinTower", scale: 0.88, setback: 20, yaw: 0.08 },
  { s: 34180, side: -1, type: "mall", scale: 1.0, setback: 21, yaw: 0.0 },
  { s: 35720, side: 1, type: "stepped", scale: 0.92, setback: 14, yaw: -0.05 },
  { s: 37280, side: -1, type: "concreteTower", scale: 0.92, setback: 20, yaw: 0.03 },
  { s: 38860, side: 1, type: "twin", scale: 1.04, setback: 16, yaw: -0.02 },
  { s: 40240, side: -1, type: "parking", scale: 0.94, setback: 15, yaw: 0.05 },
  { s: 41820, side: 1, type: "office", scale: 0.9, setback: 19, yaw: -0.08 },
  { s: 43360, side: -1, type: "slab", scale: 1.08, setback: 12, yaw: 0.01 },
  { s: 44820, side: 1, type: "corner", scale: 0.98, setback: 14, yaw: 0.04 },
  { s: 46360, side: -1, type: "warehouse", scale: 1.0, setback: 22, yaw: -0.02 },
  { s: 47980, side: 1, type: "concreteTower", scale: 0.8, setback: 20, yaw: 0.06 },
  { s: 49360, side: -1, type: "thinTower", scale: 0.94, setback: 18, yaw: -0.03 },
  { s: 50840, side: 1, type: "mall", scale: 0.9, setback: 23, yaw: 0.02 },
  { s: 52360, side: -1, type: "twin", scale: 0.96, setback: 16, yaw: -0.05 },
  { s: 53880, side: 1, type: "parking", scale: 1.02, setback: 15, yaw: 0.04 },
  { s: 55260, side: -1, type: "stepped", scale: 0.96, setback: 13, yaw: -0.01 },
];

const CITY_FACADE_PALETTE = [
  0x596064,
  0x687985,
  0x737f8d,
  0x777d7c,
  0x7b8587,
  0x878475,
  0x8a8077,
  0x8d8172,
];
const CITY_BLOCK_ROWS = [
  { spacing: 36, lateral: 8, lateralJitter: 3, forwardJitter: 13, height: [26, 70], width: [14, 30], depth: [18, 34], skip: 0.0, serviceClearance: 82 },
  { spacing: 50, lateral: 26, lateralJitter: 6, forwardJitter: 18, height: [34, 92], width: [17, 38], depth: [20, 40], skip: 0.0, serviceClearance: 120 },
  { spacing: 68, lateral: 50, lateralJitter: 10, forwardJitter: 24, height: [46, 122], width: [20, 48], depth: [24, 48], skip: 0.0, serviceClearance: 164 },
  { spacing: 92, lateral: 82, lateralJitter: 15, forwardJitter: 31, height: [58, 152], width: [24, 58], depth: [28, 56], skip: 0.003, serviceClearance: 216 },
  { spacing: 122, lateral: 122, lateralJitter: 22, forwardJitter: 40, height: [70, 182], width: [28, 68], depth: [32, 66], skip: 0.006, serviceClearance: 276 },
  { spacing: 158, lateral: 170, lateralJitter: 30, forwardJitter: 49, height: [84, 206], width: [30, 76], depth: [36, 74], skip: 0.01, serviceClearance: 340 },
  { spacing: 204, lateral: 228, lateralJitter: 40, forwardJitter: 58, height: [98, 230], width: [34, 86], depth: [40, 84], skip: 0.014, serviceClearance: 420 },
  { spacing: 262, lateral: 300, lateralJitter: 52, forwardJitter: 70, height: [118, 260], width: [40, 100], depth: [46, 96], skip: 0.018, serviceClearance: 520 },
  { spacing: 330, lateral: 400, lateralJitter: 65, forwardJitter: 85, height: [140, 280], width: [50, 120], depth: [55, 110], skip: 0.022, serviceClearance: 620 },
  { spacing: 420, lateral: 560, lateralJitter: 90, forwardJitter: 110, height: [180, 340], width: [65, 150], depth: [70, 140], skip: 0.028, serviceClearance: 740 },
  { spacing: 540, lateral: 780, lateralJitter: 120, forwardJitter: 140, height: [220, 400], width: [80, 180], depth: [85, 170], skip: 0.034, serviceClearance: 900 },
  { spacing: 680, lateral: 1080, lateralJitter: 160, forwardJitter: 180, height: [260, 480], width: [100, 220], depth: [100, 200], skip: 0.042, serviceClearance: 1100 },
];
const CITY_MANUAL_CLEARANCE = 46;
const CITY_DISTRICT_HALF_WIDTH = 520;
const CITY_SIDEWALK_INTERVAL = 24;
const CITY_STREETLIGHT_INTERVAL = 112;

const TUNNEL_RUNS = [
  { start: 6040, length: 260, name: "North Gallery" },
  { start: 22660, length: 330, name: "Hill Tunnel" },
  { start: 39920, length: 240, name: "West Gallery" },
];
const TUNNEL_MODULE_LENGTH = 18;

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function fract(value) {
  return value - Math.floor(value);
}

function cityNoise(seed) {
  return fract(Math.sin(seed * 12.9898 + 78.233) * 43758.5453);
}

function cityRange(seed, min, max) {
  return min + (max - min) * cityNoise(seed);
}

export class HighwayWorld {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.walkColliders = [];
    this.roadSamples = [];
    this.mapRoutes = [];
    this.branchRoutes = [];
    this.random = seededRandom(1247);
    this.garageDoorClosed = true;
    this.remodelStore = this.loadRemodelStore();
    this.remodelOverrides = { ...this.remodelStore.targets };
    this.remodelDeletedIds = new Set(this.remodelStore.deleted);
    this.remodelCreatedPieces = [...this.remodelStore.created];
    this.remodelTargets = [];
    this.remodelTargetMap = new Map();
    this.remodelCreatedGroup = null;
    this.remodelHitboxGroup = null;
    this.environment = null;

    this.materials = this.createMaterials();
    this.createRoute();
    this.createEnvironment();
    this.createStaticHighway();
    this.createParkingMeet();
    this.remodelCreatedGroup = new THREE.Group();
    this.remodelCreatedGroup.name = REMODEL_CREATED_GROUP;
    this.scene.add(this.remodelCreatedGroup);
    this.remodelHitboxGroup = new THREE.Group();
    this.remodelHitboxGroup.name = REMODEL_HITBOX_GROUP;
    this.remodelHitboxGroup.visible = false;
    this.scene.add(this.remodelHitboxGroup);
    this.createHitboxTemplates();
    this.createSavedRemodelPieces();
    this.rebuildRemodelTargets();
    this.applySavedRemodelOverrides();
  }

  createMaterials() {
    const asphaltTexture = this.createSurfaceTexture("#2d353d", "#3d4650", "#1b2229", 180);
    asphaltTexture.repeat.set(42, 42);
    const concreteTexture = this.createSurfaceTexture("#3a424b", "#48525d", "#252c34", 120);
    concreteTexture.repeat.set(18, 18);
    const cityGroundTexture = this.createSurfaceTexture("#333b42", "#46515b", "#242b31", 220);
    cityGroundTexture.repeat.set(86, 86);

    const materials = {
      cityGround: new THREE.MeshStandardMaterial({
        color: 0x323a41,
        map: cityGroundTexture,
        roughness: 0.9,
        metalness: 0.02,
        flatShading: true,
        side: THREE.DoubleSide,
      }),
      asphalt: new THREE.MeshStandardMaterial({
        color: 0x343c45,
        map: asphaltTexture,
        roughness: 0.86,
        metalness: 0.02,
        flatShading: true,
        side: THREE.DoubleSide,
      }),
      shoulder: new THREE.MeshStandardMaterial({
        color: 0x293139,
        roughness: 0.9,
        flatShading: true,
        side: THREE.DoubleSide,
      }),
      roadEdge: new THREE.MeshBasicMaterial({ color: 0xc9a455 }),
      lane: new THREE.MeshBasicMaterial({ color: 0xd8d6c9 }),
      rail: new THREE.MeshStandardMaterial({
        color: 0x8f9698,
        roughness: 0.5,
        metalness: 0.32,
        flatShading: true,
      }),
      railDark: new THREE.MeshStandardMaterial({
        color: 0x3a3f42,
        roughness: 0.68,
        metalness: 0.2,
        flatShading: true,
      }),
      concrete: new THREE.MeshStandardMaterial({
        color: 0x3a424a,
        map: concreteTexture,
        roughness: 0.82,
        flatShading: true,
      }),
      curb: new THREE.MeshStandardMaterial({
        color: 0x5c6877,
        roughness: 0.7,
        flatShading: true,
      }),
      reflectorAmber: new THREE.MeshBasicMaterial({ color: 0xd8a64b }),
      reflectorRed: new THREE.MeshBasicMaterial({ color: 0x9d2d24 }),
      buildingWindow: new THREE.MeshBasicMaterial({ color: 0x9fb9c8 }),
      buildingWindowWarm: new THREE.MeshBasicMaterial({ color: 0xd7b45b }),
      buildingGlassDark: new THREE.MeshStandardMaterial({
        color: 0x26323a,
        roughness: 0.42,
        metalness: 0.16,
        flatShading: true,
      }),
      buildingTrim: new THREE.MeshStandardMaterial({
        color: 0x303235,
        roughness: 0.76,
        metalness: 0.04,
        flatShading: true,
      }),
      tunnelConcrete: new THREE.MeshStandardMaterial({
        color: 0x62696d,
        roughness: 0.86,
        metalness: 0.02,
        flatShading: true,
      }),
      tunnelDark: new THREE.MeshStandardMaterial({
        color: 0x1b2024,
        roughness: 0.78,
        flatShading: true,
      }),
      tunnelLight: new THREE.MeshBasicMaterial({ color: 0xffe19a }),
      tunnelWarning: new THREE.MeshBasicMaterial({ color: 0xd2a33d }),
      tunnelSign: new THREE.MeshBasicMaterial({ color: 0x263f57 }),
      streetlightPole: new THREE.MeshStandardMaterial({
        color: 0x25292c,
        roughness: 0.72,
        metalness: 0.18,
        flatShading: true,
      }),
      streetlightGlow: new THREE.MeshBasicMaterial({ color: 0xffd887 }),
      remodelCreated: new THREE.MeshStandardMaterial({
        color: 0x78e0c1,
        roughness: 0.72,
        metalness: 0.05,
        flatShading: true,
      }),
      remodelHitbox: new THREE.MeshBasicMaterial({
        color: 0xff5f7d,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    };

    for (const [name, material] of Object.entries(materials)) {
      material.name = name;
    }

    return materials;
  }

  createSurfaceTexture(base, fleck, dark, count) {
    const texture = makeCanvasTexture((ctx, canvas) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < count; i += 1) {
        ctx.fillStyle = i % 4 === 0 ? dark : fleck;
        ctx.globalAlpha = 0.08 + this.random() * 0.15;
        const x = this.random() * canvas.width;
        const y = this.random() * canvas.height;
        const w = 1 + this.random() * 7;
        const h = 1 + this.random() * 3;
        ctx.fillRect(x, y, w, h);
      }
      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = dark;
      for (let i = 0; i < 16; i += 1) {
        ctx.beginPath();
        ctx.moveTo(this.random() * canvas.width, this.random() * canvas.height);
        ctx.lineTo(this.random() * canvas.width, this.random() * canvas.height);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  createRoute() {
    const routeScale = 6.5;
    const points = [
      [0, 0],
      [0, 900],
      [260, 1700],
      [1150, 2300],
      [2050, 1850],
      [2400, 950],
      [2050, 150],
      [1280, -450],
      [540, -720],
      [0, -650],
    ].map(([x, z]) => new THREE.Vector3(x * routeScale, 0, z * routeScale));

    this.curve = new THREE.CatmullRomCurve3(points, true, "catmullrom", 0.28);
    this.curve.arcLengthDivisions = 4096;
    this.curve.updateArcLengths();
    this.trackLength = this.curve.getLength();

    const mainSamples = [];
    for (let i = 0; i < ROAD_SAMPLE_COUNT; i += 1) {
      const sample = this.getFrameAtDistance((i / ROAD_SAMPLE_COUNT) * this.trackLength);
      mainSamples.push(sample);
      this.roadSamples.push(sample);
    }
    this.mapRoutes.push({ samples: mainSamples, closed: true });
  }

  createBranchRoutes(routeScale) {
    const branchPointSets = [
      [
        [250, 1380],
        [680, 1820],
        [1450, 1930],
        [2010, 1510],
        [2260, 900],
      ],
      [
        [1120, -360],
        [1770, -160],
        [2420, 430],
        [2700, 1180],
        [2360, 1800],
      ],
    ];

    for (const pointSet of branchPointSets) {
      const curve = new THREE.CatmullRomCurve3(
        pointSet.map(([x, z]) => new THREE.Vector3(x * routeScale, 0, z * routeScale)),
        false,
        "catmullrom",
        0.24,
      );
      curve.arcLengthDivisions = 1024;
      curve.updateArcLengths();
      const length = curve.getLength();
      const samples = [];
      for (let i = 0; i <= 220; i += 1) {
        const sample = this.getFrameOnCurve(curve, length, (i / 220) * length, false);
        sample.isBranch = true;
        samples.push(sample);
        this.roadSamples.push(sample);
      }
      this.branchRoutes.push({ curve, length, samples });
      this.mapRoutes.push({ samples, closed: false });
    }
  }

  createEnvironment() {
    this.scene.background = new THREE.Color(0x80c8ff);

    const hemisphere = new THREE.HemisphereLight(0xe5f4ff, 0x1a211a, 1.46);
    this.scene.add(hemisphere);

    const keyLight = new THREE.DirectionalLight(0xfff3d1, 1.22);
    keyLight.position.set(-220, 360, -180);
    this.scene.add(keyLight);

    const fog = new THREE.FogExp2(0x80c8ff, 0.000012);
    this.scene.fog = fog;
    this.environment = {
      hemisphere,
      keyLight,
      fog,
      colors: {
        dawnSky: new THREE.Color(0xc77f69),
        daySky: new THREE.Color(0x80c8ff),
        duskSky: new THREE.Color(0x574876),
        nightSky: new THREE.Color(0x0b1628),
        dayGround: new THREE.Color(0x1a211a),
        nightGround: new THREE.Color(0x0a0d13),
        dayHemi: new THREE.Color(0xe5f4ff),
        nightHemi: new THREE.Color(0x33456d),
        sun: new THREE.Color(0xfff3d1),
        moon: new THREE.Color(0x9eb8ff),
      },
    };
    this.applyEnvironment({ timeOfDay: 18.25 });
  }

  applyEnvironment(settings = {}) {
    if (!this.environment) {
      return;
    }

    const hour = ((Number(settings.timeOfDay ?? 12) % 24) + 24) % 24;
    const daylight = clamp(Math.sin(((hour - 6) / 12) * Math.PI), 0, 1);
    const dawn = clamp(1 - Math.abs(hour - 6) / 2.6, 0, 1);
    const dusk = clamp(1 - Math.abs(hour - 18) / 2.8, 0, 1);
    const twilight = Math.max(dawn, dusk);
    const night = 1 - Math.max(daylight, twilight * 0.58);
    const { hemisphere, keyLight, fog, colors } = this.environment;

    const sky = colors.nightSky.clone().lerp(colors.daySky, daylight);
    if (dawn > 0) {
      sky.lerp(colors.dawnSky, dawn * 0.5);
    }
    if (dusk > 0) {
      sky.lerp(colors.duskSky, dusk * 0.6);
    }
    this.scene.background.copy(sky);
    fog.color.copy(sky);
    fog.density = 0.000012 + night * 0.000032 + twilight * 0.000014;

    hemisphere.color.copy(colors.nightHemi).lerp(colors.dayHemi, daylight);
    hemisphere.groundColor.copy(colors.nightGround).lerp(colors.dayGround, daylight);
    hemisphere.intensity = 0.48 + daylight * 1.04 + twilight * 0.28;

    const sunAngle = ((hour - 6) / 24) * TWO_PI;
    const sunHeight = Math.sin(sunAngle);
    const moonAngle = sunAngle + Math.PI;
    const useMoon = sunHeight < -0.06;
    const lightAngle = useMoon ? moonAngle : sunAngle;
    const lightHeight = Math.max(0.14, Math.abs(Math.sin(lightAngle)));
    const lightRadius = 360;
    keyLight.position.set(
      Math.cos(lightAngle) * -220,
      lightHeight * lightRadius,
      Math.sin(lightAngle) * -220,
    );
    keyLight.color.copy(useMoon ? colors.moon : colors.sun);
    keyLight.intensity = useMoon
      ? 0.34 + night * 0.3
      : 0.18 + daylight * 1.16 + twilight * 0.24;
  }

  createStaticHighway() {
    const highway = new THREE.Group();
    highway.name = "StaticHighwayLoop";
    highway.add(this.createRibbonMesh(CITY_DISTRICT_HALF_WIDTH, -0.08, this.materials.cityGround, ROAD_RIBBON_SEGMENTS));
    highway.add(this.createRibbonMesh(ROAD_HALF_WIDTH + 5.2, 0.0, this.materials.shoulder, ROAD_RIBBON_SEGMENTS));
    highway.add(this.createRibbonMesh(ROAD_HALF_WIDTH, 0.045, this.materials.asphalt, ROAD_RIBBON_SEGMENTS));
    this.addBranchHighways(highway);

    const laneMarkers = [];
    for (const laneOffset of [-2, 2]) {
      for (let s = 9; s < this.trackLength; s += 34) {
        const frame = this.getFrameAtDistance(s);
        laneMarkers.push({
          position: this.offsetPoint(frame, laneOffset, 0.105),
          yaw: frame.yaw,
        });
      }
    }
    highway.add(this.createInstancedBoxes(laneMarkers, 0.13, 0.038, 8.2, this.materials.lane));

    const edgeMarkers = [];
    for (const edgeOffset of [-6.55, 6.55]) {
      for (let s = 0; s < this.trackLength; s += 52) {
        const frame = this.getFrameAtDistance(s);
        edgeMarkers.push({
          position: this.offsetPoint(frame, edgeOffset, 0.11),
          yaw: frame.yaw,
        });
      }
    }
    highway.add(this.createInstancedBoxes(edgeMarkers, 0.14, 0.035, 27, this.materials.roadEdge));

    const guardrails = this.createGuardrailBatch();
    for (let s = 0; s < this.trackLength; s += 18) {
      const frame = this.getFrameAtDistance(s);
      for (const side of [-1, 1]) {
        if (this.isServiceOpening(frame.s, side)) {
          continue;
        }

        this.addGuardrailSegment(highway, frame, side, GUARDRAIL_SEGMENT_LENGTH, guardrails);
      }
    }
    this.flushGuardrailBatch(highway, guardrails, GUARDRAIL_SEGMENT_LENGTH);
    this.createTunnelRuns(highway);
    this.createRoadsideInfrastructure(highway);
    this.createFixedCityscape(highway);

    this.scene.add(highway);
  }

  addBranchHighways(parent) {
    for (const route of this.branchRoutes) {
      parent.add(this.createRibbonMesh(ROAD_HALF_WIDTH + 4.2, 0.0, this.materials.shoulder, 260, route.curve, route.length, false));
      parent.add(this.createRibbonMesh(ROAD_HALF_WIDTH, 0.05, this.materials.asphalt, 260, route.curve, route.length, false));

      for (const laneOffset of [-2, 2]) {
        for (let s = 12; s < route.length - 12; s += 30) {
          const frame = this.getFrameOnCurve(route.curve, route.length, s, false);
          this.addOrientedBox(
            parent,
            0.13,
            0.038,
            8.2,
            this.materials.lane,
            this.offsetPoint(frame, laneOffset, 0.105),
            frame.yaw,
          );
        }
      }

      for (let s = 0; s < route.length; s += 15) {
        const frame = this.getFrameOnCurve(route.curve, route.length, s, false);
        for (const side of [-1, 1]) {
          this.addGuardrailSegment(parent, frame, side, 14.5);
        }
      }
    }
  }

  createRibbonMesh(halfWidth, y, material, segments, curve = this.curve, length = this.trackLength, closed = true) {
    const vertices = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= segments; i += 1) {
      const frame = this.getFrameOnCurve(curve, length, (i / segments) * length, closed);
      const left = this.offsetPoint(frame, -halfWidth, y);
      const right = this.offsetPoint(frame, halfWidth, y);
      vertices.push(left.x, left.y, left.z, right.x, right.y, right.z);
      uvs.push(0, i / segments, 1, i / segments);

      if (i < segments) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    return mesh;
  }

  addGuardrailSegment(parent, frame, side, length = 14.8, batch = null) {
    const upper = this.offsetPoint(frame, RAIL_OFFSET * side, GUARDRAIL_MODEL.upper.y);
    const lower = this.offsetPoint(frame, RAIL_OFFSET * side, GUARDRAIL_MODEL.lower.y);
    const post = this.offsetPoint(frame, RAIL_OFFSET * side, GUARDRAIL_MODEL.post.y);
    const reflector = this.offsetPoint(
      frame,
      side * (RAIL_OFFSET - GUARDRAIL_MODEL.reflector.inset),
      GUARDRAIL_MODEL.reflector.y,
    );

    if (batch) {
      batch.upper.push({ position: upper, yaw: frame.yaw });
      batch.lower.push({ position: lower, yaw: frame.yaw });
      batch.posts.push({ position: post, yaw: frame.yaw });
      if (Math.floor(frame.s / 40.5) % 2 === 0) {
        const target = side < 0 ? batch.amber : batch.red;
        target.push({ position: reflector, yaw: frame.yaw });
      }
      return;
    }

    this.addOrientedBox(parent, GUARDRAIL_MODEL.upper.width, GUARDRAIL_MODEL.upper.height, length, this.materials.rail, upper, frame.yaw);
    this.addOrientedBox(parent, GUARDRAIL_MODEL.lower.width, GUARDRAIL_MODEL.lower.height, length, this.materials.railDark, lower, frame.yaw);
    this.addOrientedBox(
      parent,
      GUARDRAIL_MODEL.post.width,
      GUARDRAIL_MODEL.post.height,
      GUARDRAIL_MODEL.post.depth,
      this.materials.railDark,
      post,
      frame.yaw,
    );

    if (Math.floor(frame.s / 40.5) % 2 === 0) {
      this.addOrientedBox(
        parent,
        GUARDRAIL_MODEL.reflector.width,
        GUARDRAIL_MODEL.reflector.height,
        GUARDRAIL_MODEL.reflector.depth,
        side < 0 ? this.materials.reflectorAmber : this.materials.reflectorRed,
        reflector,
        frame.yaw,
      );
    }
  }

  createParkingMeet() {
    const meet = new THREE.Group();
    meet.name = "SpawnServiceLot";

    const lotCenter = new THREE.Vector3(-62, 0.02, -42);
    const barrierHeight = 1.15;
    const barrierY = barrierHeight * 0.5;
    meet.add(makeBox(86, 0.12, 70, this.materials.concrete, lotCenter));
    meet.add(makeBox(24, 0.13, 54, this.materials.asphalt, new THREE.Vector3(-11.5, 0.045, -28)));
    meet.add(makeBox(34, 0.12, 18, this.materials.asphalt, new THREE.Vector3(-6, 0.055, -4)));

    for (const z of [-77.2, -6.8]) {
      meet.add(makeBox(82, barrierHeight, 1.05, this.materials.curb, new THREE.Vector3(-67, barrierY, z), true));
      meet.add(makeBox(74, 0.06, 0.18, this.materials.roadEdge, new THREE.Vector3(-67, barrierHeight + 0.05, z), true));
    }
    meet.add(makeBox(1.05, barrierHeight, 70, this.materials.curb, new THREE.Vector3(-108.6, barrierY, -42), true));
    meet.add(makeBox(1.05, barrierHeight, 20, this.materials.curb, new THREE.Vector3(-23.5, barrierY, -73), true));
    meet.add(makeBox(1.05, barrierHeight, 13, this.materials.curb, new THREE.Vector3(-23.5, barrierY, -10.5), true));
    meet.add(makeBox(1.25, 1.75, 1.25, this.materials.railDark, new THREE.Vector3(-23.5, 0.88, -62.2), true));
    meet.add(makeBox(1.25, 1.75, 1.25, this.materials.railDark, new THREE.Vector3(-23.5, 0.88, -17.2), true));

    this.addCollider(-67, -77.2, 82, 2.4);
    this.addCollider(-67, -6.8, 82, 2.4);
    this.addCollider(-108.6, -42, 2.4, 70);
    this.addCollider(-23.5, -73, 2.4, 20);
    this.addCollider(-23.5, -10.5, 2.4, 13);

    this.addGarage(meet);
    this.addServiceLotDetails(meet);
    this.scene.add(meet);
  }

  addGarage(parent) {
    const garage = {
      centerX: -91,
      centerZ: -45,
      leftX: -108,
      rightX: -74.05,
      frontZ: -55,
      backZ: -35,
      width: 34.9,
      depth: 20.2,
      wall: 0.72,
      height: 6.4,
    };
    const wall = new THREE.MeshStandardMaterial({
      color: 0x2b3031,
      roughness: 0.76,
      flatShading: true,
    });
    const roof = new THREE.MeshStandardMaterial({
      color: 0x171a1a,
      roughness: 0.7,
      metalness: 0.08,
      flatShading: true,
    });
    const shutter = new THREE.MeshStandardMaterial({
      color: 0x555b5d,
      roughness: 0.74,
      metalness: 0.18,
      flatShading: true,
    });
    const ceilingLight = new THREE.MeshBasicMaterial({ color: 0xffd98c });
    const ceilingLightHousing = new THREE.MeshStandardMaterial({
      color: 0x202426,
      roughness: 0.72,
      metalness: 0.16,
      flatShading: true,
    });
    const deskMaterial = new THREE.MeshStandardMaterial({
      color: 0x5b4532,
      roughness: 0.82,
      flatShading: true,
    });
    const screenMaterial = new THREE.MeshBasicMaterial({ color: 0x9eb8c0 });
    wall.name = "garageWall";
    roof.name = "garageRoof";
    shutter.name = "garageShutter";
    ceilingLight.name = "garageCeilingLight";
    ceilingLightHousing.name = "garageCeilingLightHousing";
    deskMaterial.name = "garageDesk";
    screenMaterial.name = "garageScreen";

    parent.add(makeBox(garage.width, 0.16, garage.depth, this.materials.concrete, new THREE.Vector3(garage.centerX, 0.12, garage.centerZ)));
    parent.add(makeBox(garage.wall, garage.height, garage.depth, wall, new THREE.Vector3(garage.leftX, 3.24, garage.centerZ), true));
    parent.add(makeBox(garage.width, garage.height, garage.wall, wall, new THREE.Vector3(garage.centerX, 3.24, garage.frontZ), true));
    parent.add(makeBox(garage.width, garage.height, garage.wall, wall, new THREE.Vector3(garage.centerX, 3.24, garage.backZ), true));
    parent.add(makeBox(garage.wall, garage.height, 4.78, wall, new THREE.Vector3(garage.rightX, 3.24, -52.6), true));
    parent.add(makeBox(garage.wall, garage.height, 4.78, wall, new THREE.Vector3(garage.rightX, 3.24, -37.4), true));
    parent.add(makeBox(garage.wall, 1.35, 10.9, wall, new THREE.Vector3(garage.rightX, 5.72, garage.centerZ), true));
    parent.add(makeBox(36.3, 0.78, 22.2, roof, new THREE.Vector3(garage.centerX, 6.85, garage.centerZ), true));

    for (const x of [-101.5, -94.6, -87.7, -80.8]) {
      for (const z of [-50.0, -40.0]) {
        parent.add(makeBox(3.8, 0.12, 0.82, ceilingLightHousing, new THREE.Vector3(x, 6.34, z), true));
        parent.add(makeBox(3.25, 0.07, 0.48, ceilingLight, new THREE.Vector3(x, 6.26, z)));
        const light = new THREE.PointLight(0xffdca3, 0.92, 16, 1.9);
        light.position.set(x, 5.8, z);
        parent.add(light);
      }
    }

    for (const [x, z] of [
      [garage.leftX, garage.frontZ],
      [garage.leftX, garage.backZ],
      [garage.rightX, garage.frontZ],
      [garage.rightX, garage.backZ],
    ]) {
      parent.add(makeBox(0.95, 6.55, 0.95, wall, new THREE.Vector3(x, 3.28, z), true));
    }

    this.garageDoor = new THREE.Group();
    this.garageDoor.name = "GarageDoor";
    for (let i = 0; i < 22; i += 1) {
      const y = 0.36 + i * 0.23;
      const depth = i % 2 === 0 ? 10.6 : 10.25;
      this.garageDoor.add(makeBox(0.18, 0.12, depth, shutter, new THREE.Vector3(-74.44, y, garage.centerZ), true));
    }
    this.garageDoor.add(makeBox(0.46, 0.18, 10.8, this.materials.railDark, new THREE.Vector3(-74.48, 0.18, garage.centerZ), true));
    this.garageDoor.add(makeBox(0.46, 0.18, 10.8, this.materials.railDark, new THREE.Vector3(-74.48, 5.28, garage.centerZ), true));
    parent.add(this.garageDoor);
    parent.add(makeBox(0.22, 4.35, 0.22, this.materials.railDark, new THREE.Vector3(-74.52, 2.25, -50.5), true));
    parent.add(makeBox(0.22, 4.35, 0.22, this.materials.railDark, new THREE.Vector3(-74.52, 2.25, -39.5), true));
    parent.add(makeBox(0.3, 0.24, 10.8, this.materials.railDark, new THREE.Vector3(-74.52, 4.42, garage.centerZ), true));

    parent.add(makeBox(6.4, 0.34, 2.0, deskMaterial, new THREE.Vector3(-101.6, 0.92, -52.0), true));
    parent.add(makeBox(0.34, 1.12, 0.34, deskMaterial, new THREE.Vector3(-104.2, 0.48, -52.7), true));
    parent.add(makeBox(0.34, 1.12, 0.34, deskMaterial, new THREE.Vector3(-99.0, 0.48, -52.7), true));
    parent.add(makeBox(2.2, 0.1, 1.24, this.materials.railDark, new THREE.Vector3(-101.6, 1.12, -52.0), true));
    parent.add(makeBox(1.55, 0.72, 0.12, screenMaterial, new THREE.Vector3(-101.6, 1.56, -52.58)));
    parent.add(makeBox(0.18, 0.48, 0.16, this.materials.railDark, new THREE.Vector3(-101.6, 1.3, -52.46), true));

    this.addCollider(garage.leftX, garage.centerZ, 1.4, 21.0);
    this.addCollider(garage.centerX, garage.frontZ, 35.6, 1.4);
    this.addCollider(garage.centerX, garage.backZ, 35.6, 1.4);
    this.addCollider(garage.rightX, -52.6, 1.4, 5.3);
    this.addCollider(garage.rightX, -37.4, 1.4, 5.3);
    this.addCollider(-101.6, -52.0, 6.8, 2.5);

    this.garageInteriorBounds = {
      minX: garage.leftX + garage.wall * 0.5,
      maxX: garage.rightX - garage.wall * 0.5,
      minZ: garage.frontZ + garage.wall * 0.5,
      maxZ: garage.backZ - garage.wall * 0.5,
    };
    this.garageDoorCollider = this.makeCollider(-74.48, garage.centerZ, 1.15, 11.2);
    this.addWalkCollider(garage.leftX, garage.centerZ, 1.35, 21.0);
    this.addWalkCollider(garage.centerX, garage.frontZ, 35.6, 1.35);
    this.addWalkCollider(garage.centerX, garage.backZ, 35.6, 1.35);
    this.addWalkCollider(garage.rightX, -52.6, 1.35, 5.3);
    this.addWalkCollider(garage.rightX, -37.4, 1.35, 5.3);
    this.addWalkCollider(-101.6, -52.0, 7.0, 2.75);
  }

  addServiceLotDetails(parent) {
    parent.add(makeBox(21, 0.04, 0.16, this.materials.lane, new THREE.Vector3(-63, 0.16, -45)));
    parent.add(makeBox(0.18, 0.04, 24, this.materials.reflectorAmber, new THREE.Vector3(-74.6, 0.17, -45)));
    parent.add(makeBox(12, 0.04, 0.16, this.materials.reflectorAmber, new THREE.Vector3(-15.0, 0.17, -25.5)));
    parent.add(makeBox(12, 0.04, 0.16, this.materials.reflectorAmber, new THREE.Vector3(-15.0, 0.17, -54.5)));
  }

  addOrientedBox(parent, width, height, depth, material, position, yaw, castShadow = false) {
    const mesh = makeBox(width, height, depth, material, position, castShadow);
    mesh.rotation.y = yaw;
    parent.add(mesh);
    return mesh;
  }

  createInstancedBoxes(instances, width, height, depth, material, castShadow = false) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, instances.length));
    const dummy = new THREE.Object3D();

    for (let i = 0; i < instances.length; i += 1) {
      const instance = instances[i];
      dummy.position.copy(instance.position);
      dummy.rotation.set(0, instance.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.count = instances.length;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    return mesh;
  }

  createScaledInstancedBoxes(instances, material, castShadow = false, remodelIgnore = true) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, instances.length));
    const dummy = new THREE.Object3D();

    for (let i = 0; i < instances.length; i += 1) {
      const instance = instances[i];
      const scale = instance.scale ?? { x: 1, y: 1, z: 1 };
      dummy.position.copy(instance.position);
      dummy.rotation.set(0, instance.yaw ?? 0, 0);
      dummy.scale.set(scale.x, scale.y, scale.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.count = instances.length;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.userData.remodelIgnore = remodelIgnore;
    mesh.userData.remodelInstances = instances.map((instance) => instance.remodel ?? null);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    return mesh;
  }

  createRoadsideInfrastructure(parent) {
    const details = new THREE.Group();
    details.name = "RoadsideCityInfrastructure";
    details.userData.remodelIgnore = true;

    const sidewalks = [];
    const poles = [];
    const arms = [];
    const lamps = [];

    for (let s = 0; s < this.trackLength; s += CITY_SIDEWALK_INTERVAL) {
      const frame = this.getFrameAtDistance(s);
      for (const side of [-1, 1]) {
        if (this.isCityServiceClearance(frame.s, side)) {
          continue;
        }
        sidewalks.push({
          position: this.offsetPoint(frame, side * (ROAD_HALF_WIDTH + 8.45), 0.09),
          yaw: frame.yaw,
          scale: { x: 3.4, y: 0.055, z: 15.5 },
        });
      }
    }

    for (let s = 36; s < this.trackLength; s += CITY_STREETLIGHT_INTERVAL) {
      const frame = this.getFrameAtDistance(s);
      for (const side of [-1, 1]) {
        if (this.isCityServiceClearance(frame.s, side)) {
          continue;
        }
        const polePosition = this.offsetPoint(frame, side * (ROAD_HALF_WIDTH + 10.2), 3.05);
        const armPosition = this.offsetLocalPoint(polePosition, frame.yaw, -side * 0.76, 0, 5.96);
        const lampPosition = this.offsetLocalPoint(polePosition, frame.yaw, -side * 1.55, 0, 5.88);
        poles.push({
          position: polePosition,
          yaw: frame.yaw,
          scale: { x: 0.14, y: 6.1, z: 0.14 },
        });
        arms.push({
          position: armPosition,
          yaw: frame.yaw,
          scale: { x: 1.62, y: 0.11, z: 0.11 },
        });
        lamps.push({
          position: lampPosition,
          yaw: frame.yaw,
          scale: { x: 0.44, y: 0.16, z: 0.34 },
        });
      }
    }

    details.add(this.createScaledInstancedBoxes(sidewalks, this.materials.concrete));
    details.add(this.createScaledInstancedBoxes(poles, this.materials.streetlightPole));
    details.add(this.createScaledInstancedBoxes(arms, this.materials.streetlightPole));
    details.add(this.createScaledInstancedBoxes(lamps, this.materials.streetlightGlow));
    parent.add(details);
  }
  createHorizonBuildings(parent) {
    const horizonGroup = new THREE.Group();
    horizonGroup.name = "HorizonSkyline";
    const steps = 180;
    const lateral = 1400;
    const height = 320;
    const width = 90;
    const depth = 90;
    const material = new THREE.MeshStandardMaterial({ color: 0x2a3035, roughness: 0.9, flatShading: true });
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const distance = t * this.trackLength;
      const frame = this.getFrameAtDistance(distance);
      const pos = this.offsetPoint(frame, lateral, 0);
      const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
      building.position.set(pos.x, height * 0.5, pos.z);
      building.castShadow = false;
      building.receiveShadow = false;
      horizonGroup.add(building);
    }
    parent.add(horizonGroup);
  }

  createFixedCityscape(parent) {
    const city = new THREE.Group();
    city.name = "FixedRoadsideCityscape";

    this.cityBuildingFootprints = new Map();
    for (const placement of CITY_BUILDING_PLACEMENTS) {
      this.reserveCityFootprint(this.createManualCityFootprint(placement));
    }

    this.createProceduralRoadsideDistrict(city);
    
    this.createHorizonBuildings(city);

    for (const placement of CITY_BUILDING_PLACEMENTS) {
      this.addRoadsideBuilding(city, placement);
    }

    parent.add(city);
    this.cityBuildingFootprints = null;
  }

  createProceduralRoadsideDistrict(parent) {
    const district = new THREE.Group();
    district.name = "FixedDeterministicRoadsideDistrict";

    const bodyBatches = CITY_FACADE_PALETTE.map(() => []);
    const roofs = [];
    const glass = [];
    const warmWindows = [];
    const trim = [];
    const signs = [];

    for (let rowIndex = 0; rowIndex < CITY_BLOCK_ROWS.length; rowIndex += 1) {
      const row = CITY_BLOCK_ROWS[rowIndex];
      for (const side of [-1, 1]) {
        const start = row.spacing * (0.34 + cityNoise(rowIndex * 19.7 + side * 4.3) * 0.42);
        for (let s = start; s < this.trackLength; s += row.spacing) {
          const lotIndex = Math.floor(s / row.spacing);
          const seed = rowIndex * 10000 + lotIndex * 71 + (side > 0 ? 1309 : 2609);
          const shiftedS = (s + cityRange(seed + 0.1, -row.spacing * 0.24, row.spacing * 0.24) + this.trackLength) % this.trackLength;
          if (this.shouldSkipCityBlock(shiftedS, side, rowIndex, seed)) {
            continue;
          }
          this.addProceduralCityBlock({
            bodyBatches,
            roofs,
            glass,
            warmWindows,
            trim,
            signs,
            row,
            rowIndex,
            side,
            s: shiftedS,
            seed,
          });
        }
      }
    }

    for (let i = 0; i < bodyBatches.length; i += 1) {
      district.add(this.createScaledInstancedBoxes(bodyBatches[i], this.makeFacadeMaterial(CITY_FACADE_PALETTE[i], 0.82, 0.04), false, false));
    }
    district.add(this.createScaledInstancedBoxes(roofs, this.materials.buildingTrim, false, false));
    district.add(this.createScaledInstancedBoxes(glass, this.materials.buildingWindow, false, false));
    district.add(this.createScaledInstancedBoxes(warmWindows, this.materials.buildingWindowWarm, false, false));
    district.add(this.createScaledInstancedBoxes(trim, this.materials.buildingGlassDark, false, false));
    district.add(this.createScaledInstancedBoxes(signs, this.materials.tunnelSign, false, false));
    parent.add(district);
  }

  addProceduralCityBlock(batches) {
    const { bodyBatches, roofs, glass, warmWindows, trim, signs, row, rowIndex, side, s, seed } = batches;
    const frame = this.getFrameAtDistance(s);
    const width = cityRange(seed + 1.7, row.width[0], row.width[1]);
    const depth = cityRange(seed + 2.9, row.depth[0], row.depth[1]);
    const height = cityRange(seed + 4.1, row.height[0], row.height[1]) * (rowIndex >= 3 ? 1.08 : 1);
    const lateral = side * (ROAD_HALF_WIDTH + row.lateral + width * 0.5 + cityRange(seed + 5.5, -row.lateralJitter, row.lateralJitter));
    const forward = cityRange(seed + 6.7, -row.forwardJitter, row.forwardJitter);
    const base = this.offsetAlong(frame, lateral, forward, 0);
    const yaw = frame.yaw + cityRange(seed + 7.9, -0.075, 0.075);
    const paletteIndex = Math.floor(cityNoise(seed + 8.3) * CITY_FACADE_PALETTE.length) % CITY_FACADE_PALETTE.length;
    const bodyHeight = height * cityRange(seed + 9.7, 0.88, 1.04);
    const footprint = {
      side,
      s: (s + forward + this.trackLength) % this.trackLength,
      lateral: Math.abs(lateral),
      halfForward: depth * 0.5 + 7 + rowIndex * 0.8,
      halfLateral: width * 0.5 + 4,
    };
    if (!this.reserveCityFootprint(footprint)) {
      return;
    }

    const buildingId = `building:city:${rowIndex}:${side > 0 ? "r" : "l"}:${Math.round(s)}`;
    const buildingLabel = `Building ${rowIndex + 1}.${Math.round(s)}`;
    bodyBatches[paletteIndex].push({
      position: new THREE.Vector3(base.x, bodyHeight * 0.5, base.z),
      yaw,
      scale: { x: width, y: bodyHeight, z: depth },
      remodel: this.makeBuildingRemodelMeta(buildingId, buildingLabel, "body", true),
    });
    roofs.push({
      position: new THREE.Vector3(base.x, bodyHeight + 0.18, base.z),
      yaw,
      scale: { x: width * 1.04, y: 0.36, z: depth * 1.04 },
      remodel: this.makeBuildingRemodelMeta(buildingId, buildingLabel, "roof"),
    });

    const facadeX = -side * (width * 0.5 + 0.07);
    this.addProceduralFacadeDetails({
      glass,
      warmWindows,
      trim,
      base,
      yaw,
      width,
      depth,
      bodyHeight,
      side,
      rowIndex,
      seed,
      facadeX,
      buildingId,
      buildingLabel,
    });

    if (height > 44 && cityNoise(seed + 18.2) > 0.5) {
      const roofDetail = this.offsetLocalPoint(base, yaw, cityRange(seed + 19.1, -width * 0.24, width * 0.24), cityRange(seed + 19.9, -depth * 0.24, depth * 0.24), bodyHeight + 1.05);
      trim.push({
        position: roofDetail,
        yaw,
        scale: { x: width * cityRange(seed + 20.1, 0.16, 0.34), y: cityRange(seed + 21.2, 1.1, 2.4), z: depth * cityRange(seed + 22.3, 0.12, 0.28) },
        remodel: this.makeBuildingRemodelMeta(buildingId, buildingLabel, "trim"),
      });
    }

    trim.push({
      position: this.offsetLocalPoint(base, yaw, facadeX - side * 0.01, 0, bodyHeight * 0.18),
      yaw,
      scale: { x: 0.1, y: 0.18, z: depth * 0.84 },
      remodel: this.makeBuildingRemodelMeta(buildingId, buildingLabel, "trim"),
    });

    if (rowIndex === 0 && cityNoise(seed + 23.6) > 0.52) {
      signs.push({
        position: this.offsetLocalPoint(base, yaw, facadeX - side * 0.05, cityRange(seed + 24.4, -depth * 0.28, depth * 0.28), 3.1),
        yaw,
        scale: { x: 0.16, y: cityRange(seed + 25.1, 0.42, 0.9), z: cityRange(seed + 26.2, 1.6, 4.8) },
        remodel: this.makeBuildingRemodelMeta(buildingId, buildingLabel, "sign"),
      });
    }
  }

  makeBuildingRemodelMeta(groupId, label, part, selectable = false) {
    return {
      remodelCategory: "building",
      remodelGroupId: groupId,
      remodelFixedId: selectable ? groupId : `${groupId}:${part}`,
      remodelLabel: label,
      remodelPart: part,
      remodelSelectable: selectable,
    };
  }

  addProceduralFacadeDetails({
    glass,
    warmWindows,
    trim,
    base,
    yaw,
    depth,
    bodyHeight,
    side,
    rowIndex,
    seed,
    facadeX,
    buildingId,
    buildingLabel,
  }) {
    const groundMargin = cityRange(seed + 11.1, 3.1, 5.4);
    const roofMargin = cityRange(seed + 12.7, 2.0, 4.8);
    const usableHeight = Math.max(4.8, bodyHeight - groundMargin - roofMargin);
    const floorHeight = cityRange(seed + 13.6, 4.4, 6.2);
    const maxRows = rowIndex === 0 ? 7 : 9;
    const rowCount = Math.floor(clamp(usableHeight / (floorHeight * 1.22), 3, maxRows));
    const facadeDepth = depth * cityRange(seed + 14.4, 0.68, 0.92);
    const facadeStartZ = -facadeDepth * 0.5;
    const style = cityNoise(seed + 15.3);

    if (style < 0.56) {
      const bandHeight = cityRange(seed + 16.8, 0.28, 0.54);
      const segmentCount = Math.floor(clamp(facadeDepth / cityRange(seed + 17.2, 5.4, 7.4), 3, rowIndex === 0 ? 5 : 4));
      const segmentDepth = Math.max(0.74, (facadeDepth / segmentCount) * cityRange(seed + 17.6, 0.42, 0.58));
      for (let row = 0; row < rowCount; row += 1) {
        if (cityNoise(seed + row * 5.83 + 17.9) < 0.16) {
          continue;
        }
        const y = groundMargin + (usableHeight * (row + 0.5)) / rowCount;
        for (let segment = 0; segment < segmentCount; segment += 1) {
          if (cityNoise(seed + row * 6.31 + segment * 9.43 + 18.6) < 0.22) {
            continue;
          }
          const z = facadeStartZ + (facadeDepth * (segment + 0.5)) / segmentCount;
          const target = cityNoise(seed + row * 7.17 + segment * 4.91 + 19.4) > 0.86 ? warmWindows : glass;
          target.push({
            position: this.offsetLocalPoint(base, yaw, facadeX - side * 0.015, z, y),
            yaw,
            scale: { x: 0.11, y: bandHeight, z: segmentDepth },
            remodel: this.makeBuildingRemodelMeta(buildingId, buildingLabel, "window"),
          });
        }
      }

      const mullionCount = 1 + Math.floor(cityNoise(seed + 20.2) * 2);
      for (let i = 1; i <= mullionCount; i += 1) {
        const z = facadeStartZ + (facadeDepth * i) / (mullionCount + 1);
        trim.push({
          position: this.offsetLocalPoint(base, yaw, facadeX - side * 0.025, z, groundMargin + usableHeight * 0.5),
          yaw,
          scale: { x: 0.1, y: usableHeight * 0.96, z: 0.08 },
          remodel: this.makeBuildingRemodelMeta(buildingId, buildingLabel, "trim"),
        });
      }
      return;
    }

    const columnCount = Math.floor(clamp(facadeDepth / cityRange(seed + 20.9, 5.6, 7.4), 3, rowIndex === 0 ? 5 : 4));
    const windowDepth = Math.max(0.82, (facadeDepth / columnCount) * cityRange(seed + 21.8, 0.44, 0.62));
    const windowHeight = cityRange(seed + 22.5, 0.38, 0.72);
    for (let row = 0; row < rowCount; row += 1) {
      const y = groundMargin + (usableHeight * (row + 0.5)) / rowCount;
      for (let column = 0; column < columnCount; column += 1) {
        if (cityNoise(seed + row * 8.9 + column * 13.1 + 23.2) < 0.22) {
          continue;
        }
        const z = facadeStartZ + (facadeDepth * (column + 0.5)) / columnCount;
        const target = cityNoise(seed + row * 11.7 + column * 4.3 + 24.1) > 0.86 ? warmWindows : glass;
        target.push({
          position: this.offsetLocalPoint(base, yaw, facadeX - side * 0.015, z, y),
          yaw,
          scale: { x: 0.11, y: windowHeight, z: windowDepth },
          remodel: this.makeBuildingRemodelMeta(buildingId, buildingLabel, "window"),
        });
      }
    }
  }

  shouldSkipCityBlock(s, side, rowIndex, seed) {
    if (this.isCityServiceClearance(s, side, rowIndex)) {
      return true;
    }
    if (rowIndex === 0 && this.isNearManualBuilding(s, side)) {
      return true;
    }
    return cityNoise(seed + 31.4) < CITY_BLOCK_ROWS[rowIndex].skip;
  }

  isNearManualBuilding(s, side) {
    return CITY_BUILDING_PLACEMENTS.some(
      (placement) => placement.side === side && this.loopDistance(s, placement.s) < CITY_MANUAL_CLEARANCE,
    );
  }

  isCityServiceClearance(s, side, rowIndex = 0) {
    if (side >= 0) {
      return false;
    }
    const row = CITY_BLOCK_ROWS[rowIndex] ?? CITY_BLOCK_ROWS[0];
    const clearance = row.serviceClearance ?? 120;
    return s < clearance || s > this.trackLength - clearance;
  }

  loopDistance(a, b) {
    const delta = Math.abs(((a - b) % this.trackLength + this.trackLength) % this.trackLength);
    return Math.min(delta, this.trackLength - delta);
  }

  createManualCityFootprint(placement) {
    const type = BUILDING_TYPES.find((item) => item.id === placement.type) ?? BUILDING_TYPES[0];
    const scale = placement.scale ?? 1;
    const width = type.width * scale;
    const depth = type.depth * scale;
    const lateral = ROAD_HALF_WIDTH + 12 + (placement.setback ?? 14) + width * 0.5;
    return {
      side: placement.side,
      s: (placement.s + (placement.forward ?? 0) + this.trackLength) % this.trackLength,
      lateral: Math.abs(lateral),
      halfForward: depth * 0.5 + 10,
      halfLateral: width * 0.5 + 5,
    };
  }

  reserveCityFootprint(footprint) {
    if (!this.cityBuildingFootprints || !footprint) {
      return true;
    }

    const key = footprint.side > 0 ? "right" : "left";
    const footprints = this.cityBuildingFootprints.get(key) ?? [];
    for (const other of footprints) {
      const forwardOverlap = this.loopDistance(footprint.s, other.s) < footprint.halfForward + other.halfForward;
      const lateralOverlap = Math.abs(footprint.lateral - other.lateral) < footprint.halfLateral + other.halfLateral;
      if (forwardOverlap && lateralOverlap) {
        return false;
      }
    }

    footprints.push(footprint);
    this.cityBuildingFootprints.set(key, footprints);
    return true;
  }

  offsetLocalPoint(origin, yaw, localX, localZ, y = origin.y) {
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    return new THREE.Vector3(
      origin.x + localX * cos + localZ * sin,
      y,
      origin.z - localX * sin + localZ * cos,
    );
  }

  addRoadsideBuilding(parent, placement) {
    const type = BUILDING_TYPES.find((item) => item.id === placement.type) ?? BUILDING_TYPES[0];
    const scale = placement.scale ?? 1;
    const width = type.width * scale;
    const lateral = ROAD_HALF_WIDTH + 12 + (placement.setback ?? 14) + width * 0.5;
    const frame = this.getFrameAtDistance(placement.s);
    const position = this.offsetAlong(frame, lateral * placement.side, placement.forward ?? 0, 0);
    const group = new THREE.Group();
    group.name = `Building_${type.id}_${Math.round(placement.s)}`;
    group.position.copy(position);
    group.rotation.y = frame.yaw + (placement.yaw ?? 0);

    this.buildBuildingType(group, type, scale, placement.side);
    group.traverse((object) => {
      if (object.isMesh) {
        object.userData.remodelIgnore = true;
      }
    });
    parent.add(group);
    parent.add(this.createBuildingRemodelProxy(group, type, placement));
  }

  createBuildingRemodelProxy(group, type, placement) {
    group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(group);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.materials.remodelCreated);
    proxy.name = `RemodelProxy_${group.name}`;
    proxy.position.copy(center);
    proxy.rotation.copy(group.rotation);
    proxy.scale.set(Math.max(size.x, 1), Math.max(size.y, 1), Math.max(size.z, 1));
    proxy.visible = false;
    proxy.userData.remodelFixedId = `building:manual:${placement.side > 0 ? "r" : "l"}:${Math.round(placement.s)}:${type.id}`;
    proxy.userData.remodelLabel = `Building ${type.id} ${Math.round(placement.s)}`;
    proxy.userData.remodelCategory = "building";
    proxy.userData.remodelControlledObject = group;
    return proxy;
  }

  buildBuildingType(group, type, scale, side) {
    const material = this.makeFacadeMaterial(type.color);
    const roofMaterial = this.makeFacadeMaterial(type.roof, 0.82, 0.08);
    const trim = this.materials.buildingTrim;
    const w = type.width * scale;
    const d = type.depth * scale;
    const h = type.height * scale;

    if (type.id === "stepped") {
      this.addLocalBox(group, w, h * 0.64, d, material, 0, h * 0.32, 0);
      this.addLocalBox(group, w * 0.72, h * 0.36, d * 0.72, material, side * w * 0.07, h * 0.82, -d * 0.04);
      this.addLocalBox(group, w * 0.8, 0.5, d * 0.78, roofMaterial, side * w * 0.07, h + 0.25, -d * 0.04);
      this.addFacadeWindows(group, w, h * 0.86, d, type.floors, type.columns, side);
      this.addBalconyBands(group, w, d, h, side, 4);
      return;
    }

    if (type.id === "warehouse") {
      this.addLocalBox(group, w, h, d, material, 0, h * 0.5, 0);
      this.addLocalBox(group, w * 1.04, 0.7, d * 1.05, roofMaterial, 0, h + 0.35, 0);
      this.addLocalBox(group, 0.12, h * 0.46, d * 0.18, this.materials.buildingGlassDark, -side * (w * 0.5 + 0.08), h * 0.34, -d * 0.28);
      this.addLocalBox(group, 0.12, h * 0.46, d * 0.18, this.materials.buildingGlassDark, -side * (w * 0.5 + 0.08), h * 0.34, 0);
      this.addLocalBox(group, 0.12, h * 0.46, d * 0.18, this.materials.buildingGlassDark, -side * (w * 0.5 + 0.08), h * 0.34, d * 0.28);
      this.addLocalBox(group, 0.16, 0.34, d * 0.82, trim, -side * (w * 0.5 + 0.1), h * 0.78, 0);
      return;
    }

    if (type.id === "corner") {
      this.addLocalBox(group, w * 0.62, h, d, material, -side * w * 0.18, h * 0.5, 0);
      this.addLocalBox(group, w, h * 0.72, d * 0.58, material, 0, h * 0.36, side * d * 0.16);
      this.addLocalBox(group, w * 0.72, 0.45, d * 0.88, roofMaterial, -side * w * 0.08, h + 0.22, 0);
      this.addFacadeWindows(group, w, h, d, type.floors, type.columns, side);
      return;
    }

    if (type.id === "thinTower" || type.id === "concreteTower") {
      this.addLocalBox(group, w, h, d, material, 0, h * 0.5, 0);
      this.addLocalBox(group, w * 1.08, 0.6, d * 1.08, roofMaterial, 0, h + 0.3, 0);
      for (const x of [-0.38, 0.38]) {
        this.addLocalBox(group, 0.14, h * 0.94, 0.18, trim, x * w, h * 0.5, -d * 0.5 - 0.08);
      }
      this.addFacadeWindows(group, w, h, d, type.floors, type.columns, side, 0.28);
      this.addLocalBox(group, 0.18, h * 0.12, 0.18, trim, 0, h + 1.15, 0);
      return;
    }

    if (type.id === "mall") {
      this.addLocalBox(group, w, h, d, material, 0, h * 0.5, 0);
      this.addLocalBox(group, w * 1.02, 0.55, d * 1.04, roofMaterial, 0, h + 0.27, 0);
      this.addLocalBox(group, 0.16, 1.4 * scale, d * 0.74, this.materials.buildingGlassDark, -side * (w * 0.5 + 0.09), 2.2 * scale, 0);
      this.addLocalBox(group, 0.2, 0.52 * scale, d * 0.42, this.materials.tunnelSign, -side * (w * 0.5 + 0.12), h * 0.66, 0);
      this.addLocalBox(group, 2.2 * scale, 0.24 * scale, d * 0.7, trim, -side * (w * 0.5 + 1.1 * scale), 3.15 * scale, 0);
      return;
    }

    if (type.id === "twin") {
      this.addLocalBox(group, w * 0.38, h, d, material, -w * 0.26, h * 0.5, 0);
      this.addLocalBox(group, w * 0.38, h * 0.86, d, material, w * 0.26, h * 0.43, 0);
      this.addLocalBox(group, w * 0.5, h * 0.12, d * 0.72, trim, 0, h * 0.58, 0);
      this.addLocalBox(group, w * 0.9, 0.48, d * 0.95, roofMaterial, 0, h + 0.24, 0);
      this.addFacadeWindows(group, w, h, d, type.floors, type.columns + 2, side, 0.24);
      return;
    }

    if (type.id === "parking") {
      this.addLocalBox(group, w, h, d, material, 0, h * 0.5, 0);
      this.addLocalBox(group, w * 1.02, 0.42, d * 1.02, roofMaterial, 0, h + 0.21, 0);
      for (let i = 1; i < type.floors; i += 1) {
        this.addLocalBox(group, 0.12, 0.16, d * 0.86, trim, -side * (w * 0.5 + 0.08), (h / type.floors) * i, 0);
      }
      this.addLocalBox(group, 0.15, h * 0.56, d * 0.2, this.materials.buildingGlassDark, -side * (w * 0.5 + 0.08), h * 0.42, -d * 0.26);
      this.addLocalBox(group, 0.15, h * 0.56, d * 0.2, this.materials.buildingGlassDark, -side * (w * 0.5 + 0.08), h * 0.42, d * 0.26);
      return;
    }

    this.addLocalBox(group, w, h, d, material, 0, h * 0.5, 0);
    this.addLocalBox(group, w * 1.04, 0.52, d * 1.04, roofMaterial, 0, h + 0.26, 0);
    if (type.id === "office") {
      for (const z of [-0.34, -0.12, 0.12, 0.34]) {
        this.addLocalBox(group, 0.13, h * 0.84, 0.08, trim, -side * (w * 0.5 + 0.09), h * 0.51, z * d);
      }
      this.addLocalBox(group, w * 0.82, h * 0.1, d * 0.82, trim, 0, h * 0.48, 0);
    }
    this.addFacadeWindows(group, w, h, d, type.floors, type.columns, side);
  }

  makeFacadeMaterial(color, roughness = 0.78, metalness = 0.04) {
    if (!this.facadeMaterialCache) {
      this.facadeMaterialCache = new Map();
    }
    const key = `${color}:${roughness}:${metalness}`;
    if (!this.facadeMaterialCache.has(key)) {
      const material = new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness,
        flatShading: true,
      });
      material.name = `facade_${Number(color).toString(16)}`;
      this.facadeMaterialCache.set(key, material);
    }
    return this.facadeMaterialCache.get(key);
  }

  addFacadeWindows(group, width, height, depth, floors, columns, side, windowHeight = 0.34) {
    const facadeX = -side * (width * 0.5 + 0.055);
    const usableHeight = Math.max(1, height - 5);
    const usableDepth = depth * 0.72;
    const startZ = -usableDepth * 0.5;
    const rowCount = Math.max(2, Math.floor(floors));
    const columnCount = Math.max(2, Math.floor(columns));
    const windowDepth = Math.max(0.5, usableDepth / (columnCount * 1.75));

    for (let row = 0; row < rowCount; row += 1) {
      const y = 3 + (usableHeight * (row + 0.35)) / rowCount;
      for (let column = 0; column < columnCount; column += 1) {
        const z = startZ + (usableDepth * (column + 0.5)) / columnCount;
        const lit = (row + column) % 5 === 0;
        this.addLocalBox(
          group,
          0.08,
          windowHeight,
          windowDepth,
          lit ? this.materials.buildingWindowWarm : this.materials.buildingWindow,
          facadeX,
          y,
          z,
        );
      }
    }
  }

  addBalconyBands(group, width, depth, height, side, count) {
    for (let i = 1; i <= count; i += 1) {
      this.addLocalBox(
        group,
        0.18,
        0.12,
        depth * 0.82,
        this.materials.buildingTrim,
        -side * (width * 0.5 + 0.12),
        (height * i) / (count + 1),
        0,
      );
    }
  }

  addLocalBox(parent, width, height, depth, material, x, y, z) {
    const mesh = makeBox(width, height, depth, material, new THREE.Vector3(x, y, z), false);
    parent.add(mesh);
    return mesh;
  }

  createTunnelRuns(parent) {
    const tunnels = new THREE.Group();
    tunnels.name = "FixedHighwayTunnels";

    for (const run of TUNNEL_RUNS) {
      const steps = Math.ceil(run.length / TUNNEL_MODULE_LENGTH);
      for (let i = 0; i < steps; i += 1) {
        const segmentLength = Math.min(TUNNEL_MODULE_LENGTH, run.length - i * TUNNEL_MODULE_LENGTH);
        const s = run.start + i * TUNNEL_MODULE_LENGTH + segmentLength * 0.5;
        this.addTunnelModule(tunnels, this.getFrameAtDistance(s), segmentLength, i);
      }
      this.addTunnelPortal(tunnels, this.getFrameAtDistance(run.start), run.name);
      this.addTunnelPortal(tunnels, this.getFrameAtDistance(run.start + run.length), run.name);
    }

    parent.add(tunnels);
  }

  addTunnelModule(parent, frame, length, index) {
    const section = new THREE.Group();
    section.name = `TunnelSection_${index}`;
    section.position.copy(this.offsetPoint(frame, 0, 0));
    section.rotation.y = frame.yaw;

    const wallX = ROAD_HALF_WIDTH + 4.7;
    const wallHeight = 8.4;
    const roofWidth = ROAD_WIDTH + 11.6;
    const wallDepth = length + 0.45;
    this.addLocalBox(section, 0.74, wallHeight, wallDepth, this.materials.tunnelConcrete, -wallX, wallHeight * 0.5, 0);
    this.addLocalBox(section, 0.74, wallHeight, wallDepth, this.materials.tunnelConcrete, wallX, wallHeight * 0.5, 0);
    this.addLocalBox(section, roofWidth, 0.7, wallDepth, this.materials.tunnelConcrete, 0, wallHeight + 0.35, 0);
    this.addLocalBox(section, ROAD_WIDTH + 3.0, 0.16, wallDepth, this.materials.tunnelDark, 0, wallHeight - 0.12, 0);
    this.addLocalBox(section, 0.16, 1.4, wallDepth * 0.92, this.materials.tunnelDark, -ROAD_HALF_WIDTH - 2.15, 1.65, 0);
    this.addLocalBox(section, 0.16, 1.4, wallDepth * 0.92, this.materials.tunnelDark, ROAD_HALF_WIDTH + 2.15, 1.65, 0);

    if (index % 2 === 0) {
      this.addLocalBox(section, 0.18, 0.1, length * 0.46, this.materials.tunnelLight, -3.8, wallHeight - 0.42, 0);
      this.addLocalBox(section, 0.18, 0.1, length * 0.46, this.materials.tunnelLight, 3.8, wallHeight - 0.42, 0);
    }

    parent.add(section);
  }

  addTunnelPortal(parent, frame, label) {
    const portal = new THREE.Group();
    portal.name = label;
    portal.position.copy(this.offsetPoint(frame, 0, 0));
    portal.rotation.y = frame.yaw;

    const width = ROAD_WIDTH + 12.4;
    const pillarX = width * 0.5 - 0.85;
    this.addLocalBox(portal, 1.55, 8.9, 2.55, this.materials.tunnelConcrete, -pillarX, 4.45, 0);
    this.addLocalBox(portal, 1.55, 8.9, 2.55, this.materials.tunnelConcrete, pillarX, 4.45, 0);
    this.addLocalBox(portal, width, 1.25, 2.75, this.materials.tunnelConcrete, 0, 8.8, 0);
    this.addLocalBox(portal, ROAD_WIDTH + 5.0, 0.34, 2.25, this.materials.tunnelDark, 0, 7.82, 0);
    this.addLocalBox(portal, 5.2, 0.44, 0.18, this.materials.tunnelSign, 0, 7.95, -1.38);
    for (const side of [-1, 1]) {
      this.addLocalBox(portal, 0.2, 0.46, 0.18, this.materials.tunnelWarning, side * (ROAD_HALF_WIDTH + 3.45), 1.55, -1.4);
      this.addLocalBox(portal, 0.2, 0.46, 0.18, this.materials.tunnelWarning, side * (ROAD_HALF_WIDTH + 3.45), 3.15, -1.4);
      this.addLocalBox(portal, 0.2, 0.46, 0.18, this.materials.tunnelWarning, side * (ROAD_HALF_WIDTH + 3.45), 4.75, -1.4);
    }

    parent.add(portal);
  }

  createSavedRemodelPieces() {
    if (!this.remodelCreatedGroup) {
      return;
    }

    for (const piece of this.remodelCreatedPieces) {
      if (!piece?.id || !piece.state) {
        continue;
      }
      this.remodelCreatedGroup.add(this.makeCreatedRemodelMesh(piece));
    }
  }

  createHitboxTemplates() {
    if (!this.remodelHitboxGroup) {
      return;
    }

    for (const template of HITBOX_TEMPLATES) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.materials.remodelHitbox);
      mesh.name = template.label;
      mesh.userData.remodelFixedId = template.id;
      mesh.userData.remodelLabel = template.label;
      mesh.userData.remodelCategory = "hitbox";
      mesh.userData.hitboxOrigin = { ...template.position };
      mesh.position.set(template.position.x, template.position.y, template.position.z);
      mesh.scale.set(template.dimensions.x, template.dimensions.y, template.dimensions.z);
      mesh.updateMatrixWorld(true);
      this.remodelHitboxGroup.add(mesh);
      this.remodelHitboxGroup.add(this.createHitboxDummyVisual(template));
    }
  }

  createHitboxDummyVisual(template) {
    const group = new THREE.Group();
    group.name = `${template.label} dummy`;
    group.userData.remodelIgnore = true;
    group.position.set(template.position.x, 0, template.position.z);

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: template.color,
      roughness: 0.62,
      metalness: 0.08,
      flatShading: true,
    });
    const glassMaterial = new THREE.MeshStandardMaterial({
      color: 0x111820,
      roughness: 0.28,
      metalness: 0.12,
      flatShading: true,
    });
    const trimMaterial = new THREE.MeshStandardMaterial({
      color: 0x151719,
      roughness: 0.78,
      flatShading: true,
    });
    bodyMaterial.name = "hitboxDummyBody";
    glassMaterial.name = "hitboxDummyGlass";
    trimMaterial.name = "hitboxDummyTrim";

    const length = template.dimensions.z;
    const width = template.dimensions.x;
    if (template.kind === "truck") {
      group.add(makeBox(width, 1.6, length * 0.62, bodyMaterial, new THREE.Vector3(0, 1.2, -length * 0.12), true));
      group.add(makeBox(width * 0.9, 1.1, length * 0.24, bodyMaterial, new THREE.Vector3(0, 0.92, length * 0.34), true));
      group.add(makeBox(width * 0.72, 0.38, length * 0.08, glassMaterial, new THREE.Vector3(0, 1.44, length * 0.43), true));
    } else {
      group.add(makeBox(width, 0.58, length, bodyMaterial, new THREE.Vector3(0, 0.58, 0), true));
      group.add(makeBox(width * 0.72, 0.44, length * 0.36, glassMaterial, new THREE.Vector3(0, 1.02, -length * 0.06), true));
      group.add(makeBox(width * 0.9, 0.14, length * 0.2, trimMaterial, new THREE.Vector3(0, 0.38, length * 0.38), true));
    }

    for (const x of [-width * 0.48, width * 0.48]) {
      for (const z of [-length * 0.32, length * 0.32]) {
        group.add(makeBox(0.22, 0.34, 0.52, trimMaterial, new THREE.Vector3(x, 0.28, z), true));
      }
    }

    group.traverse((object) => {
      object.userData.remodelIgnore = true;
    });
    return group;
  }

  makeCreatedRemodelMesh(piece) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.materials.remodelCreated.clone());
    mesh.name = piece.label ?? "Created box";
    mesh.userData.remodelCreatedId = piece.id;
    mesh.userData.remodelLabel = piece.label ?? "Created box";
    mesh.castShadow = false;
    mesh.receiveShadow = true;

    const state = this.sanitizeRemodelState(
      piece.state,
      {
        position: { x: 0, y: 1, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        dimensions: { x: 2, y: 1, z: 2 },
      },
    );
    mesh.position.set(state.position.x, state.position.y, state.position.z);
    mesh.rotation.set(state.rotation.x, state.rotation.y, state.rotation.z);
    mesh.scale.set(state.dimensions.x, state.dimensions.y, state.dimensions.z);
    if (state.color && mesh.material?.color) {
      mesh.material.color.set(state.color);
    }
    mesh.updateMatrixWorld(true);
    return mesh;
  }

  rebuildRemodelTargets() {
    this.remodelTargets = [];
    this.remodelTargetMap.clear();

    const linkedInstanceGroups = this.collectRemodelInstanceGroups();
    let meshIndex = 0;
    let instancedIndex = 0;

    this.scene.traverse((object) => {
      if (object.userData?.remodelIgnore) {
        return;
      }
      const rootName = this.getRemodelRootName(object);
      const baseDimensions = this.getBoxGeometryDimensions(object);
      if (!rootName || !baseDimensions) {
        return;
      }

      if (object.isInstancedMesh) {
        const instancedId = instancedIndex;
        instancedIndex += 1;
        for (let instanceId = 0; instanceId < object.count; instanceId += 1) {
          const meta = object.userData?.remodelInstances?.[instanceId] ?? null;
          if (meta?.remodelSelectable === false) {
            continue;
          }
          const category = this.getRemodelCategory(object, rootName, meta);
          const id = meta?.remodelFixedId ?? `inst:${instancedId}:${instanceId}`;
          const target = {
            id,
            type: "instance",
            object,
            instanceId,
            baseDimensions: this.cloneDimensions(baseDimensions),
            baseState: this.readInstanceRemodelState(object, instanceId, baseDimensions),
            category,
            linkedInstances: meta?.remodelGroupId ? (linkedInstanceGroups.get(meta.remodelGroupId) ?? []) : null,
            group: rootName,
            label: meta?.remodelLabel ?? `${this.getRemodelCategoryLabel(category)} ${instanceId + 1}`,
          };
          if (this.remodelDeletedIds.has(id)) {
            this.hideRemodelTarget(target);
            continue;
          }
          this.remodelTargets.push(target);
          this.remodelTargetMap.set(target.id, target);
        }
        return;
      }

      if (object.isMesh) {
        const createdId = object.userData?.remodelCreatedId;
        const fixedId = object.userData?.remodelFixedId;
        const category = this.getRemodelCategory(object, rootName);
        const id = createdId ?? fixedId ?? `mesh:${meshIndex}`;
        const target = {
          id,
          type: "mesh",
          object,
          baseDimensions: this.cloneDimensions(baseDimensions),
          baseState: this.readMeshRemodelState(object, baseDimensions),
          category,
          group: rootName,
          label: object.userData?.remodelLabel ?? `${this.getRemodelCategoryLabel(category)} ${meshIndex + 1}`,
        };
        if (!createdId && !fixedId) {
          meshIndex += 1;
        }
        if (this.remodelDeletedIds.has(id)) {
          this.hideRemodelTarget(target);
          return;
        }
        this.remodelTargets.push(target);
        this.remodelTargetMap.set(target.id, target);
      }
    });
  }

  collectRemodelInstanceGroups() {
    const groups = new Map();
    this.scene.traverse((object) => {
      if (!object.isInstancedMesh || object.userData?.remodelIgnore) {
        return;
      }
      const instances = object.userData?.remodelInstances;
      if (!Array.isArray(instances)) {
        return;
      }
      for (let instanceId = 0; instanceId < Math.min(object.count, instances.length); instanceId += 1) {
        const groupId = instances[instanceId]?.remodelGroupId;
        if (!groupId) {
          continue;
        }
        const parts = groups.get(groupId) ?? [];
        parts.push({ object, instanceId });
        groups.set(groupId, parts);
      }
    });
    return groups;
  }

  getRemodelTargets() {
    return this.remodelTargets;
  }

  getRemodelTarget(id) {
    return this.remodelTargetMap.get(id) ?? null;
  }

  createRemodelBox(state = {}) {
    if (!this.remodelCreatedGroup) {
      return null;
    }

    const id = `created:${Date.now().toString(36)}:${Math.floor(Math.random() * 1e6).toString(36)}`;
    const label = `Created box ${this.remodelCreatedPieces.length + 1}`;
    const mesh = this.makeCreatedRemodelMesh({
      id,
      label,
      state: this.sanitizeRemodelState(
        state,
        {
          position: { x: 0, y: 1, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          dimensions: { x: 2, y: 1, z: 2 },
        },
      ),
    });
    this.remodelCreatedGroup.add(mesh);
    this.remodelCreatedPieces.push({ id, label });
    this.rebuildRemodelTargets();

    const target = this.getRemodelTarget(id);
    return target
      ? {
          target,
          state: this.getRemodelTargetState(target),
        }
      : null;
  }

  deleteRemodelTarget(id) {
    const target = this.getRemodelTarget(id);
    if (!target) {
      return null;
    }

    const deleted = {
      id: target.id,
      label: target.label,
      created: target.id.startsWith("created:"),
    };

    if (deleted.created) {
      target.object.parent?.remove(target.object);
      target.object.geometry?.dispose?.();
      this.remodelCreatedPieces = this.remodelCreatedPieces.filter((piece) => piece.id !== target.id);
    } else {
      this.remodelDeletedIds.add(target.id);
      this.hideRemodelTarget(target);
    }

    delete this.remodelOverrides[target.id];
    this.rebuildRemodelTargets();
    return deleted;
  }

  getRemodelTargetState(targetOrId) {
    const target = typeof targetOrId === "string"
      ? this.getRemodelTarget(targetOrId)
      : targetOrId;
    if (!target) {
      return null;
    }

    if (target.type === "instance") {
      return this.readInstanceRemodelState(target.object, target.instanceId, target.baseDimensions);
    }

    return this.readMeshRemodelState(target.object, target.baseDimensions);
  }

  applyRemodelTargetState(id, state, { record = true } = {}) {
    const target = this.getRemodelTarget(id);
    if (!target) {
      return null;
    }

    const sanitized = this.sanitizeRemodelState(state, this.getRemodelTargetState(target) ?? target.baseState);
    if (target.type === "instance") {
      this.writeInstanceRemodelState(target, sanitized);
    } else {
      this.writeMeshRemodelState(target, sanitized);
    }

    if (record) {
      this.remodelOverrides[target.id] = this.cloneState(sanitized);
    }

    return this.cloneState(sanitized);
  }

  resetRemodelTarget(id) {
    const target = this.getRemodelTarget(id);
    if (!target) {
      return null;
    }

    delete this.remodelOverrides[target.id];
    return this.applyRemodelTargetState(target.id, target.baseState, { record: false });
  }

  saveRemodelOverrides() {
    const targets = {};
    for (const [id, state] of Object.entries(this.remodelOverrides)) {
      if (this.remodelTargetMap.has(id) && !id.startsWith("created:") && !id.startsWith("psx:")) {
        targets[id] = this.cloneState(state);
      }
    }

    this.remodelOverrides = targets;
    try {
      window.localStorage.setItem(
        REMODEL_STORAGE_KEY,
        JSON.stringify({
          version: 2,
          savedAt: new Date().toISOString(),
          targets,
          deleted: [...this.remodelDeletedIds],
          created: this.getCreatedRemodelPayload(),
        }),
      );
      return Object.keys(targets).length + this.remodelDeletedIds.size + this.remodelCreatedPieces.length;
    } catch {
      return null;
    }
  }

  loadRemodelStore() {
    try {
      const payload = JSON.parse(window.localStorage.getItem(REMODEL_STORAGE_KEY) ?? "{}");
      if (!payload || typeof payload !== "object") {
        return { targets: {}, deleted: [], created: [] };
      }
      return {
        targets: payload.targets && typeof payload.targets === "object" ? { ...payload.targets } : {},
        deleted: Array.isArray(payload.deleted) ? payload.deleted.filter((id) => typeof id === "string") : [],
        created: Array.isArray(payload.created) ? payload.created.filter((piece) => piece?.id && piece?.state) : [],
      };
    } catch {
      return { targets: {}, deleted: [], created: [] };
    }
  }

  applySavedRemodelOverrides() {
    for (const [id, state] of Object.entries(this.remodelOverrides)) {
      this.applyRemodelTargetState(id, state, { record: false });
    }
  }

  hideRemodelTarget(target) {
    if (!target) {
      return;
    }

    if (target.type === "mesh") {
      target.object.visible = false;
      if (target.object.userData?.remodelControlledObject) {
        target.object.userData.remodelControlledObject.visible = false;
      }
      return;
    }

    const parts = target.linkedInstances?.length
      ? target.linkedInstances
      : [{ object: target.object, instanceId: target.instanceId }];
    for (const part of parts) {
      const baseDimensions = part.object === target.object && part.instanceId === target.instanceId
        ? target.baseDimensions
        : this.getBoxGeometryDimensions(part.object);
      if (!baseDimensions) {
        continue;
      }
      const state = this.readInstanceRemodelState(part.object, part.instanceId, baseDimensions);
      this.writeSingleInstanceRemodelState(part.object, part.instanceId, baseDimensions, {
        ...state,
        dimensions: {
          x: MIN_REMODEL_DIMENSION,
          y: MIN_REMODEL_DIMENSION,
          z: MIN_REMODEL_DIMENSION,
        },
      });
    }
  }

  getCreatedRemodelPayload() {
    const pieces = [];
    for (const object of this.remodelCreatedGroup?.children ?? []) {
      const id = object.userData?.remodelCreatedId;
      if (!id) {
        continue;
      }
      pieces.push({
        id,
        label: object.userData.remodelLabel ?? object.name ?? "Created box",
        state: this.readMeshRemodelState(object, { x: 1, y: 1, z: 1 }),
      });
    }
    this.remodelCreatedPieces = pieces.map((piece) => ({
      id: piece.id,
      label: piece.label,
      state: this.cloneState(piece.state),
    }));
    return pieces;
  }

  getRemodelRootName(object) {
    let cursor = object;
    while (cursor && cursor !== this.scene) {
      if (cursor.userData?.remodelIgnore) {
        return null;
      }
      if (REMODEL_ROOT_NAMES.has(cursor.name)) {
        return cursor.name;
      }
      cursor = cursor.parent;
    }
    return null;
  }

  getBoxGeometryDimensions(object) {
    const params = object.geometry?.parameters;
    const dimensions = {
      x: Number(params?.width),
      y: Number(params?.height),
      z: Number(params?.depth),
    };
    return Number.isFinite(dimensions.x) &&
      Number.isFinite(dimensions.y) &&
      Number.isFinite(dimensions.z) &&
      dimensions.x > 0 &&
      dimensions.y > 0 &&
      dimensions.z > 0
      ? dimensions
      : null;
  }

  getRemodelCategory(object, rootName, meta = null) {
    if (meta?.remodelCategory) {
      return meta.remodelCategory;
    }
    if (object.userData?.remodelCategory === "hitbox" || rootName === REMODEL_HITBOX_GROUP) {
      return "hitbox";
    }
    if (rootName === REMODEL_CREATED_GROUP || object.userData?.remodelCreatedId) {
      return "created";
    }
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    const materialName = material?.name ?? "";
    if (/rail|reflector/i.test(materialName)) {
      return "rail";
    }
    if (/lane|roadEdge|asphalt|shoulder/i.test(materialName)) {
      return "road";
    }
    if (rootName === "GarageDoor" || /^garage/i.test(materialName)) {
      return "garage";
    }
    if (rootName === "SpawnServiceLot") {
      return "service";
    }
    if (rootName === "FixedRoadsideCityscape" || object.userData?.remodelCategory === "building") {
      return "building";
    }
    return "default";
  }

  getRemodelCategoryLabel(category) {
    return {
      rail: "Guard rail",
      road: "Road model",
      garage: "Garage model",
      service: "Service model",
      created: "Created box",
      hitbox: "Hitbox",
      building: "Building",
      default: "Map model",
    }[category] ?? "Map model";
  }

  readMeshRemodelState(object, baseDimensions) {
    return {
      position: {
        x: object.position.x,
        y: object.position.y,
        z: object.position.z,
      },
      rotation: {
        x: object.rotation.x,
        y: object.rotation.y,
        z: object.rotation.z,
      },
      dimensions: {
        x: baseDimensions.x * object.scale.x,
        y: baseDimensions.y * object.scale.y,
        z: baseDimensions.z * object.scale.z,
      },
      color: object.material?.color ? `#${object.material.color.getHexString()}` : "#78e0c1",
    };
  }

  readInstanceRemodelState(object, instanceId, baseDimensions) {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const rotation = new THREE.Euler();

    object.getMatrixAt(instanceId, matrix);
    matrix.decompose(position, quaternion, scale);
    rotation.setFromQuaternion(quaternion);

    return {
      position: {
        x: position.x,
        y: position.y,
        z: position.z,
      },
      rotation: {
        x: rotation.x,
        y: rotation.y,
        z: rotation.z,
      },
      dimensions: {
        x: baseDimensions.x * scale.x,
        y: baseDimensions.y * scale.y,
        z: baseDimensions.z * scale.z,
      },
      color: "#78e0c1",
    };
  }

  writeMeshRemodelState(target, state) {
    const object = target.object;
    const controlledObject = object.userData?.remodelControlledObject;
    const previousPosition = object.position.clone();
    object.position.set(state.position.x, state.position.y, state.position.z);
    object.rotation.set(state.rotation.x, state.rotation.y, state.rotation.z);
    object.scale.set(
      state.dimensions.x / target.baseDimensions.x,
      state.dimensions.y / target.baseDimensions.y,
      state.dimensions.z / target.baseDimensions.z,
    );
    if (state.color && object.material?.color) {
      if (object.material === this.materials.remodelCreated || object.material === this.materials.remodelHitbox) {
        object.material = object.material.clone();
      }
      object.material.color.set(state.color);
    }
    if (controlledObject) {
      controlledObject.position.add(object.position.clone().sub(previousPosition));
      controlledObject.rotation.copy(object.rotation);
      controlledObject.scale.copy(object.scale);
      controlledObject.updateMatrixWorld(true);
    }
    object.updateMatrixWorld(true);
  }

  writeInstanceRemodelState(target, state) {
    const previous = target.linkedInstances?.length
      ? this.readInstanceRemodelState(target.object, target.instanceId, target.baseDimensions)
      : null;
    this.writeSingleInstanceRemodelState(target.object, target.instanceId, target.baseDimensions, state);

    if (!previous || !target.linkedInstances?.length) {
      return;
    }

    const positionDelta = {
      x: state.position.x - previous.position.x,
      y: state.position.y - previous.position.y,
      z: state.position.z - previous.position.z,
    };
    const rotationDelta = {
      x: state.rotation.x - previous.rotation.x,
      y: state.rotation.y - previous.rotation.y,
      z: state.rotation.z - previous.rotation.z,
    };
    const scaleRatio = {
      x: previous.dimensions.x > MIN_REMODEL_DIMENSION ? state.dimensions.x / previous.dimensions.x : 1,
      y: previous.dimensions.y > MIN_REMODEL_DIMENSION ? state.dimensions.y / previous.dimensions.y : 1,
      z: previous.dimensions.z > MIN_REMODEL_DIMENSION ? state.dimensions.z / previous.dimensions.z : 1,
    };
    const unchanged = [positionDelta.x, positionDelta.y, positionDelta.z, rotationDelta.x, rotationDelta.y, rotationDelta.z]
      .every((value) => Math.abs(value) < 0.00001) &&
      [scaleRatio.x, scaleRatio.y, scaleRatio.z].every((value) => Math.abs(value - 1) < 0.00001);
    if (unchanged) {
      return;
    }

    const yawSin = Math.sin(rotationDelta.y);
    const yawCos = Math.cos(rotationDelta.y);
    for (const part of target.linkedInstances) {
      if (part.object === target.object && part.instanceId === target.instanceId) {
        continue;
      }
      const baseDimensions = this.getBoxGeometryDimensions(part.object);
      if (!baseDimensions) {
        continue;
      }
      const partState = this.readInstanceRemodelState(part.object, part.instanceId, baseDimensions);
      const offsetX = (partState.position.x - previous.position.x) * scaleRatio.x;
      const offsetY = (partState.position.y - previous.position.y) * scaleRatio.y;
      const offsetZ = (partState.position.z - previous.position.z) * scaleRatio.z;
      this.writeSingleInstanceRemodelState(part.object, part.instanceId, baseDimensions, {
        ...partState,
        position: {
          x: state.position.x + offsetX * yawCos + offsetZ * yawSin,
          y: state.position.y + offsetY,
          z: state.position.z - offsetX * yawSin + offsetZ * yawCos,
        },
        rotation: {
          x: partState.rotation.x + rotationDelta.x,
          y: partState.rotation.y + rotationDelta.y,
          z: partState.rotation.z + rotationDelta.z,
        },
        dimensions: {
          x: partState.dimensions.x * scaleRatio.x,
          y: partState.dimensions.y * scaleRatio.y,
          z: partState.dimensions.z * scaleRatio.z,
        },
      });
    }
  }

  writeSingleInstanceRemodelState(object, instanceId, baseDimensions, state) {
    const position = new THREE.Vector3(state.position.x, state.position.y, state.position.z);
    const quaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(state.rotation.x, state.rotation.y, state.rotation.z),
    );
    const scale = new THREE.Vector3(
      state.dimensions.x / baseDimensions.x,
      state.dimensions.y / baseDimensions.y,
      state.dimensions.z / baseDimensions.z,
    );
    const matrix = new THREE.Matrix4().compose(position, quaternion, scale);
    object.setMatrixAt(instanceId, matrix);
    object.instanceMatrix.needsUpdate = true;
    object.computeBoundingSphere();
  }

  sanitizeRemodelState(state, fallback) {
    const finite = (value, defaultValue) => {
      const number = Number(value);
      return Number.isFinite(number) ? number : defaultValue;
    };

    return {
      position: {
        x: finite(state?.position?.x, fallback.position.x),
        y: finite(state?.position?.y, fallback.position.y),
        z: finite(state?.position?.z, fallback.position.z),
      },
      rotation: {
        x: finite(state?.rotation?.x, fallback.rotation.x),
        y: finite(state?.rotation?.y, fallback.rotation.y),
        z: finite(state?.rotation?.z, fallback.rotation.z),
      },
      dimensions: {
        x: Math.max(MIN_REMODEL_DIMENSION, finite(state?.dimensions?.x, fallback.dimensions.x)),
        y: Math.max(MIN_REMODEL_DIMENSION, finite(state?.dimensions?.y, fallback.dimensions.y)),
        z: Math.max(MIN_REMODEL_DIMENSION, finite(state?.dimensions?.z, fallback.dimensions.z)),
      },
      color: /^#[0-9a-f]{6}$/i.test(state?.color ?? "") ? state.color : (fallback.color ?? "#78e0c1"),
    };
  }

  cloneDimensions(dimensions) {
    return {
      x: dimensions.x,
      y: dimensions.y,
      z: dimensions.z,
    };
  }

  cloneState(state) {
    return {
      position: {
        x: state.position.x,
        y: state.position.y,
        z: state.position.z,
      },
      rotation: {
        x: state.rotation.x,
        y: state.rotation.y,
        z: state.rotation.z,
      },
      dimensions: {
        x: state.dimensions.x,
        y: state.dimensions.y,
        z: state.dimensions.z,
      },
      color: state.color,
    };
  }

  getHitboxDimensions(id) {
    const profile = this.getHitboxProfile(id);
    return profile
      ? {
          width: profile.width,
          height: profile.height,
          length: profile.length,
        }
      : null;
  }

  getHitboxProfile(id, fallback = null) {
    const target = this.getRemodelTarget(id);
    const state = target ? this.getRemodelTargetState(target) : null;
    if (!state) {
      return fallback ? { ...fallback } : null;
    }

    const origin = target.object.userData?.hitboxOrigin ?? state.position;
    return {
      width: state.dimensions.x,
      height: state.dimensions.y,
      length: state.dimensions.z,
      centerX: state.position.x - origin.x,
      centerY: state.position.y,
      centerZ: state.position.z - origin.z,
      yawOffset: state.rotation.y,
    };
  }

  setHitboxTemplatesVisible(visible) {
    if (this.remodelHitboxGroup) {
      this.remodelHitboxGroup.visible = Boolean(visible);
    }
  }

  createGuardrailBatch() {
    return {
      upper: [],
      lower: [],
      posts: [],
      amber: [],
      red: [],
    };
  }

  flushGuardrailBatch(parent, batch, railLength) {
    parent.add(this.createInstancedBoxes(batch.upper, GUARDRAIL_MODEL.upper.width, GUARDRAIL_MODEL.upper.height, railLength, this.materials.rail));
    parent.add(this.createInstancedBoxes(batch.lower, GUARDRAIL_MODEL.lower.width, GUARDRAIL_MODEL.lower.height, railLength, this.materials.railDark));
    parent.add(this.createInstancedBoxes(batch.posts, GUARDRAIL_MODEL.post.width, GUARDRAIL_MODEL.post.height, GUARDRAIL_MODEL.post.depth, this.materials.railDark));
    parent.add(this.createInstancedBoxes(batch.amber, GUARDRAIL_MODEL.reflector.width, GUARDRAIL_MODEL.reflector.height, GUARDRAIL_MODEL.reflector.depth, this.materials.reflectorAmber));
    parent.add(this.createInstancedBoxes(batch.red, GUARDRAIL_MODEL.reflector.width, GUARDRAIL_MODEL.reflector.height, GUARDRAIL_MODEL.reflector.depth, this.materials.reflectorRed));
  }

  addCollider(x, z, width, depth) {
    this.colliders.push(this.makeCollider(x, z, width, depth));
  }

  addWalkCollider(x, z, width, depth) {
    this.walkColliders.push(this.makeCollider(x, z, width, depth));
  }

  makeCollider(x, z, width, depth) {
    return {
      x,
      z,
      halfX: width * 0.5,
      halfZ: depth * 0.5,
    };
  }

  update() {}

  setGarageDoorOpen(open) {
    this.garageDoorClosed = !open;
    if (this.garageDoor) {
      this.garageDoor.visible = this.garageDoorClosed;
    }
  }

  getFrameAtDistance(distance) {
    return this.getFrameOnCurve(this.curve, this.trackLength, distance, true);
  }

  getFrameOnCurve(curve, length, distance, closed) {
    const routeS = closed ? ((distance % length) + length) % length : clamp(distance, 0, length);
    const t = clamp(routeS / length, 0, 1);
    const center = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const normal = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    return {
      s: routeS,
      center,
      tangent,
      normal,
      yaw: Math.atan2(tangent.x, tangent.z),
    };
  }

  offsetPoint(frame, lateralOffset, y) {
    return new THREE.Vector3(
      frame.center.x + frame.normal.x * lateralOffset,
      y,
      frame.center.z + frame.normal.z * lateralOffset,
    );
  }

  offsetAlong(frame, lateralOffset, forwardOffset, y) {
    return new THREE.Vector3(
      frame.center.x + frame.normal.x * lateralOffset + frame.tangent.x * forwardOffset,
      y,
      frame.center.z + frame.normal.z * lateralOffset + frame.tangent.z * forwardOffset,
    );
  }

  getLaneFrame(distance, laneIndex) {
    const frame = this.getFrameAtDistance(distance);
    const offset = LANES[clamp(laneIndex, 0, LANES.length - 1)];
    const position = this.offsetPoint(frame, offset, 0);
    return {
      ...frame,
      position,
    };
  }

  getNearestRoadInfo(position) {
    let best = null;
    let bestDistanceSq = Infinity;

    for (const sample of this.roadSamples) {
      const dx = position.x - sample.center.x;
      const dz = position.z - sample.center.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        best = this.projectRoadInfo(sample, position, Math.sqrt(distanceSq));
      }
    }

    return best;
  }

  projectRoadInfo(sample, position, distance = null) {
    const dx = position.x - sample.center.x;
    const dz = position.z - sample.center.z;
    return {
      ...sample,
      lateral: dx * sample.normal.x + dz * sample.normal.z,
      forward: dx * sample.tangent.x + dz * sample.tangent.z,
      distance: distance ?? Math.hypot(dx, dz),
    };
  }

  resolvePlayerCollision(player) {
    const p = player.position;
    const inMeet = this.isInMeetArea(p);
    const inDriveway = this.isInDriveway(p);
    const currentRoad = this.getNearestRoadInfo(p);
    let road = currentRoad;
    if ((!road || road.distance >= 22) && player.previousPosition) {
      const previousRoad = this.getNearestRoadInfo(player.previousPosition);
      if (previousRoad && previousRoad.distance < DRIVE_LIMIT + 4) {
        road = this.projectRoadInfo(previousRoad, p);
      }
    }
    const result = {
      hit: false,
      source: null,
      impactSpeed: player.speedMagnitude ?? Math.abs(player.speed),
    };

    if (!inMeet && !inDriveway && road && road.distance < 34) {
      const limit = DRIVE_LIMIT;
      const over = Math.abs(road.lateral) - limit;
      const side = Math.sign(road.lateral || 1);
      if (over > 0 && !this.isEntranceGap(road.s, side)) {
        const normal = {
          x: -road.normal.x * side,
          z: -road.normal.z * side,
        };
        p.x += normal.x * (over + 0.18);
        p.z += normal.z * (over + 0.18);
        if (result.impactSpeed > 5.5) {
          result.hit = true;
          result.source = "Guard rail";
        }
        if (player.applyCollisionResponse) {
          player.applyCollisionResponse(normal, {
            restitution: result.impactSpeed > 18 ? 0.18 : 0.08,
            friction: 0.06,
            minSeparationSpeed: result.impactSpeed > 8 ? 0.45 : 0.15,
          });
        } else if (player.setForwardSpeed) {
          player.setForwardSpeed(player.speed * 0.86, 0.72);
        }
        player.yawVelocity *= 0.62;
        player.slip = Math.max(player.slip ?? 0, result.impactSpeed > 12 ? 0.2 : 0.08);
        player.steerInput *= 0.72;
      }
    }

    for (const collider of this.colliders) {
      if (this.resolveAabb(player, collider)) {
        result.hit = result.hit || result.impactSpeed > 5.5;
        result.source = result.source ?? "Concrete";
      }
    }

    return result.hit ? result : null;
  }

  resolveWalkerCollision(position, extraColliders = []) {
    const radius = 0.44;
    const bounds = this.garageInteriorBounds;
    if (bounds) {
      position.x = clamp(position.x, bounds.minX + radius, bounds.maxX - radius);
      position.z = clamp(position.z, bounds.minZ + radius, bounds.maxZ - radius);
    }

    const colliders = this.garageDoorClosed && this.garageDoorCollider
      ? [...this.walkColliders, this.garageDoorCollider, ...extraColliders]
      : [...this.walkColliders, ...extraColliders];

    for (let pass = 0; pass < 2; pass += 1) {
      for (const collider of colliders) {
        this.resolvePositionAabb(position, collider, radius, radius);
      }
      if (bounds) {
        position.x = clamp(position.x, bounds.minX + radius, bounds.maxX - radius);
        position.z = clamp(position.z, bounds.minZ + radius, bounds.maxZ - radius);
      }
    }
  }

  resolvePositionAabb(position, collider, radiusX, radiusZ) {
    const dx = position.x - collider.x;
    const dz = position.z - collider.z;
    const overlapX = collider.halfX + radiusX - Math.abs(dx);
    const overlapZ = collider.halfZ + radiusZ - Math.abs(dz);

    if (overlapX <= 0 || overlapZ <= 0) {
      return;
    }

    if (overlapX < overlapZ) {
      position.x += Math.sign(dx || 1) * overlapX;
    } else {
      position.z += Math.sign(dz || 1) * overlapZ;
    }
  }

  resolveAabb(player, collider) {
    const radiusX = 1.05;
    const radiusZ = 2.25;
    const dx = player.position.x - collider.x;
    const dz = player.position.z - collider.z;
    const overlapX = collider.halfX + radiusX - Math.abs(dx);
    const overlapZ = collider.halfZ + radiusZ - Math.abs(dz);

    if (overlapX <= 0 || overlapZ <= 0) {
      return false;
    }

    const normal = overlapX < overlapZ
      ? { x: Math.sign(dx || 1), z: 0 }
      : { x: 0, z: Math.sign(dz || 1) };
    if (overlapX < overlapZ) {
      player.position.x += normal.x * overlapX;
    } else {
      player.position.z += normal.z * overlapZ;
    }
    const impactSpeed = player.speedMagnitude ?? Math.abs(player.speed);
    if (player.applyCollisionResponse) {
      player.applyCollisionResponse(normal, {
        restitution: impactSpeed > 14 ? 0.15 : 0.06,
        friction: 0.12,
        minSeparationSpeed: impactSpeed > 6 ? 0.35 : 0.08,
      });
    } else if (player.setForwardSpeed) {
      player.setForwardSpeed(player.speed * 0.78, 0.58);
    }
    player.yawVelocity *= 0.55;
    player.slip = Math.max(player.slip ?? 0, impactSpeed > 10 ? 0.24 : 0.1);
    player.steerInput *= 0.68;
    return true;
  }

  isEntranceGap(s, side = -1) {
    return side < 0 && (s < 95 || s > this.trackLength - 48);
  }

  isServiceOpening(s, side) {
    return side < 0 && (s < 78 || s > this.trackLength - 32);
  }

  isInMeetArea(position) {
    return position.x > -110 && position.x < -16 && position.z > -82 && position.z < -3;
  }

  isInDriveway(position) {
    return position.x > -25 && position.x < 8 && position.z > -64 && position.z < 10;
  }

  isInGarageInterior(position) {
    return position.x > -106 && position.x < -76 && position.z > -54 && position.z < -36;
  }

  getGarageCarPose() {
    return {
      x: -89.2,
      z: -45,
      yaw: Math.PI / 2,
    };
  }

  getGarageWalkPose() {
    return {
      position: new THREE.Vector3(-92.8, 1.92, -46.8),
      yaw: Math.PI / 2,
    };
  }

  getGarageDeskPosition() {
    return new THREE.Vector3(-101.6, 0, -52.0);
  }

  getStartPose() {
    return {
      x: -55,
      z: -56,
      yaw: 0,
    };
  }
}
