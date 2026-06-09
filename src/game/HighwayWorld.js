import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { LANES, REMODEL_STORAGE_KEY, ROAD_WIDTH } from "./config.js";
import { clamp, makeBox, makeCanvasTexture } from "./utils.js";
import { bakeBoxPieces } from "./mapformat/MapBaker.js";
import { buildMapDocument, parseMapDocument, MAP_DOCUMENT_VERSION } from "./mapformat/MapDocument.js";
import { deserializeBakedChunk, buildBakedMapDocument } from "./mapformat/MapBakedSerialize.js";

const ROAD_HALF_WIDTH = ROAD_WIDTH * 0.5;
const TWO_LANE_LANE_WIDTH = 4.6;
const LANE_TRANSITION_LENGTH = 150;
const RAIL_OFFSET = ROAD_HALF_WIDTH + 1.15;
const TWO_PI = Math.PI * 2;
const ROAD_SAMPLE_COUNT = 560;
const ROAD_RIBBON_SEGMENTS = 960;
const ROAD_DETAIL_CHUNK_LENGTH = 1200;
const CITY_DETAIL_CHUNK_LENGTH = 900;
const CITY_NEAR_DETAIL_CHUNK_LENGTH = 650;
const REMODEL_CREATED_GROUP = "RemodelCreatedPieces";
const REMODEL_HITBOX_GROUP = "RemodelHitboxTemplates";
// Play Mode runtime output: created pieces merged into chunked static geometry.
const BAKED_MAP_GROUP = "BakedMapPieces";
const REMODEL_ROOT_NAMES = new Set([
  "StaticHighwayLoop",
  "FixedRoadsideCityscape",
  "RoadsideCityInfrastructure",
  "ShutokuExpresswaySigns",
  "FixedHighwayTunnels",
  "SpawnServiceLot",
  "GarageDoor",
  REMODEL_CREATED_GROUP,
  REMODEL_HITBOX_GROUP,
]);
const MIN_REMODEL_DIMENSION = 0.01;
const GUARDRAIL_SEGMENT_LENGTH = 18.8;
const JUNCTION_OPENING_HALF_LENGTH = 54;
const JUNCTION_BRANCH_CLEARANCE = 48;
const JUNCTION_ATTACHMENT_MAX_DISTANCE = 165;
const JUNCTION_TRAFFIC_WINDOW = 84;
const GUARDRAIL_MODEL = {
  upper: { width: 0.18, height: 0.18, depth: GUARDRAIL_SEGMENT_LENGTH, y: 0.88 },
  lower: { width: 0.14, height: 0.16, depth: GUARDRAIL_SEGMENT_LENGTH, y: 0.48 },
  post: { width: 0.22, height: 1.18, depth: 0.22, y: 0.56 },
  reflector: { width: 0.06, height: 0.18, depth: 0.5, y: 0.86, inset: 0.13 },
};
const SHUTOKU_BARRIER_MODEL = {
  base: { width: 0.82, height: 0.55, y: 0.275 },
  wall: { width: 0.46, height: 2.34, y: 1.72 },
};
const SIDEWALK_EDGE_WALL_MODEL = {
  width: 0.62,
  height: 0.78,
  y: 0.39,
  length: 15.6,
  lateralOffset: ROAD_HALF_WIDTH + 5.49,
};
const HITBOX_TEMPLATES = [];

function normalizeRoadBarrierType(value) {
  const key = String(value ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  return key === "guardrail" ? "guardrail" : "barrier";
}

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
  { id: "shutokuSpire", width: 22, depth: 20, height: 168, color: 0x56636c, roof: 0x20272d, floors: 39, columns: 7 },
  { id: "megaOffice", width: 34, depth: 28, height: 142, color: 0x64717a, roof: 0x252d33, floors: 32, columns: 9 },
];

const CITY_BUILDING_PLACEMENTS = [
  { s: -180, side: 1, type: "warehouse", scale: 0.86, setback: 10, yaw: -0.04, forward: 10 },
  { s: -124, side: -1, type: "parking", scale: 0.76, setback: 8, yaw: 0.03, forward: -12 },
  { s: 118, side: 1, type: "corner", scale: 0.82, setback: 9, yaw: 0.06, forward: -8 },
  { s: 186, side: -1, type: "mall", scale: 0.74, setback: 10, yaw: -0.05, forward: 14 },
  { s: 720, side: 1, type: "slab", scale: 1.0, setback: 12, yaw: 0.03 },
  { s: 1440, side: -1, type: "office", scale: 0.92, setback: 16, yaw: -0.05 },
  { s: 1740, side: 1, type: "shutokuSpire", scale: 0.98, setback: 46, yaw: 0.02, forward: 18 },
  { s: 2180, side: 1, type: "warehouse", scale: 1.04, setback: 18, yaw: 0.0 },
  { s: 3160, side: -1, type: "corner", scale: 0.96, setback: 12, yaw: 0.08 },
  { s: 4520, side: 1, type: "thinTower", scale: 0.9, setback: 19, yaw: -0.04 },
  { s: 5620, side: -1, type: "mall", scale: 0.88, setback: 20, yaw: 0.04 },
  { s: 7040, side: 1, type: "stepped", scale: 0.98, setback: 13, yaw: -0.07 },
  { s: 8420, side: -1, type: "concreteTower", scale: 0.86, setback: 18, yaw: 0.02 },
  { s: 9060, side: 1, type: "megaOffice", scale: 1.05, setback: 52, yaw: -0.03, forward: -22 },
  { s: 9800, side: 1, type: "twin", scale: 0.96, setback: 16, yaw: 0.06 },
  { s: 11180, side: -1, type: "parking", scale: 1.02, setback: 16, yaw: -0.03 },
  { s: 12620, side: 1, type: "office", scale: 1.06, setback: 18, yaw: 0.0 },
  { s: 13980, side: -1, type: "slab", scale: 0.94, setback: 13, yaw: 0.07 },
  { s: 15440, side: 1, type: "corner", scale: 1.04, setback: 12, yaw: -0.02 },
  { s: 16140, side: -1, type: "shutokuSpire", scale: 1.12, setback: 58, yaw: 0.04, forward: 24 },
  { s: 16820, side: -1, type: "warehouse", scale: 0.92, setback: 21, yaw: 0.03 },
  { s: 18160, side: 1, type: "concreteTower", scale: 0.82, setback: 19, yaw: -0.06 },
  { s: 19420, side: -1, type: "thinTower", scale: 1.0, setback: 17, yaw: 0.04 },
  { s: 20760, side: 1, type: "mall", scale: 0.94, setback: 22, yaw: -0.03 },
  { s: 22140, side: -1, type: "twin", scale: 0.9, setback: 15, yaw: 0.02 },
  { s: 22960, side: 1, type: "megaOffice", scale: 0.96, setback: 48, yaw: 0.06, forward: 16 },
  { s: 23820, side: 1, type: "parking", scale: 0.92, setback: 14, yaw: 0.07 },
  { s: 25280, side: -1, type: "stepped", scale: 1.08, setback: 13, yaw: -0.08 },
  { s: 26860, side: 1, type: "slab", scale: 0.88, setback: 15, yaw: 0.03 },
  { s: 28220, side: -1, type: "office", scale: 0.98, setback: 18, yaw: -0.01 },
  { s: 29680, side: 1, type: "warehouse", scale: 0.86, setback: 23, yaw: 0.05 },
  { s: 30320, side: -1, type: "shutokuSpire", scale: 0.9, setback: 54, yaw: -0.02, forward: -18 },
  { s: 31120, side: -1, type: "corner", scale: 0.9, setback: 14, yaw: -0.04 },
  { s: 32640, side: 1, type: "thinTower", scale: 0.88, setback: 20, yaw: 0.08 },
  { s: 34180, side: -1, type: "mall", scale: 1.0, setback: 21, yaw: 0.0 },
  { s: 35720, side: 1, type: "stepped", scale: 0.92, setback: 14, yaw: -0.05 },
  { s: 37280, side: -1, type: "concreteTower", scale: 0.92, setback: 20, yaw: 0.03 },
  { s: 37980, side: 1, type: "megaOffice", scale: 1.14, setback: 58, yaw: -0.05, forward: 20 },
  { s: 38860, side: 1, type: "twin", scale: 1.04, setback: 16, yaw: -0.02 },
  { s: 40240, side: -1, type: "parking", scale: 0.94, setback: 15, yaw: 0.05 },
  { s: 41820, side: 1, type: "office", scale: 0.9, setback: 19, yaw: -0.08 },
  { s: 43360, side: -1, type: "slab", scale: 1.08, setback: 12, yaw: 0.01 },
  { s: 44820, side: 1, type: "corner", scale: 0.98, setback: 14, yaw: 0.04 },
  { s: 45540, side: -1, type: "shutokuSpire", scale: 1.02, setback: 50, yaw: 0.03, forward: 26 },
  { s: 46360, side: -1, type: "warehouse", scale: 1.0, setback: 22, yaw: -0.02 },
  { s: 47980, side: 1, type: "concreteTower", scale: 0.8, setback: 20, yaw: 0.06 },
  { s: 49360, side: -1, type: "thinTower", scale: 0.94, setback: 18, yaw: -0.03 },
  { s: 50840, side: 1, type: "mall", scale: 0.9, setback: 23, yaw: 0.02 },
  { s: 52360, side: -1, type: "twin", scale: 0.96, setback: 16, yaw: -0.05 },
  { s: 53180, side: 1, type: "megaOffice", scale: 0.92, setback: 52, yaw: 0.01, forward: -20 },
  { s: 53880, side: 1, type: "parking", scale: 1.02, setback: 15, yaw: 0.04 },
  { s: 55260, side: -1, type: "stepped", scale: 0.96, setback: 13, yaw: -0.01 },
];

const CITY_FACADE_PALETTE = [
  0x596064,
  0x62666a,
  0x687985,
  0x6d7174,
  0x737f8d,
  0x777d7c,
  0x808486,
  0x7b8587,
  0x878475,
  0x8a8077,
  0x8f928c,
  0x8d8172,
  0x6f6d67,
];
const CITY_BLOCK_ROWS = [
  { spacing: 18, lateral: 9, lateralJitter: 1.0, forwardJitter: 6, height: [28, 74], width: [15, 32], depth: [18, 34], skip: 0.0, serviceClearance: 54 },
  { spacing: 25, lateral: 17, lateralJitter: 2.8, forwardJitter: 9, height: [36, 98], width: [18, 40], depth: [20, 40], skip: 0.0, serviceClearance: 76 },
  { spacing: 34, lateral: 32, lateralJitter: 5, forwardJitter: 12, height: [48, 128], width: [21, 50], depth: [24, 48], skip: 0.0, serviceClearance: 104 },
  { spacing: 46, lateral: 52, lateralJitter: 8, forwardJitter: 16, height: [60, 158], width: [25, 60], depth: [28, 56], skip: 0.0, serviceClearance: 138 },
  { spacing: 62, lateral: 80, lateralJitter: 12, forwardJitter: 21, height: [72, 190], width: [29, 70], depth: [32, 66], skip: 0.0, serviceClearance: 178 },
  { spacing: 80, lateral: 114, lateralJitter: 16, forwardJitter: 25, height: [86, 214], width: [31, 78], depth: [36, 74], skip: 0.0, serviceClearance: 226 },
  { spacing: 104, lateral: 154, lateralJitter: 22, forwardJitter: 30, height: [100, 238], width: [35, 88], depth: [40, 84], skip: 0.002, serviceClearance: 284 },
  { spacing: 134, lateral: 204, lateralJitter: 30, forwardJitter: 36, height: [120, 270], width: [42, 102], depth: [46, 96], skip: 0.004, serviceClearance: 352 },
  { spacing: 170, lateral: 278, lateralJitter: 38, forwardJitter: 44, height: [144, 292], width: [52, 122], depth: [55, 110], skip: 0.006, serviceClearance: 424 },
  { spacing: 218, lateral: 394, lateralJitter: 52, forwardJitter: 57, height: [184, 354], width: [68, 154], depth: [70, 140], skip: 0.008, serviceClearance: 520 },
  { spacing: 278, lateral: 560, lateralJitter: 72, forwardJitter: 73, height: [224, 416], width: [84, 184], depth: [85, 170], skip: 0.012, serviceClearance: 634 },
  { spacing: 350, lateral: 790, lateralJitter: 96, forwardJitter: 94, height: [266, 498], width: [104, 224], depth: [100, 200], skip: 0.016, serviceClearance: 780 },
];
const CITY_MANUAL_CLEARANCE = 34;
const CITY_DISTRICT_HALF_WIDTH = 1880;
const CITY_GROUND_ELEVATION = -10;
const CITY_RELATIVE_ELEVATION = -10;
const CITY_MOUNTAIN_INNER_LATERAL = 1580;
const CITY_MOUNTAIN_OUTER_LATERAL = 1840;
const ROAD_SURFACE_ELEVATION = 0.055;
const ROAD_SHOULDER_ELEVATION = 0.035;
const ROAD_MARKING_ELEVATION = 0.115;
const ROAD_TEXT_MARKING_ELEVATION = ROAD_MARKING_ELEVATION + 0.018;
const HIGHWAY_DECK_ELEVATION = -0.26;
const HIGHWAY_SUPPORT_INTERVAL = 260;
const CITY_BUILDING_HEIGHT_SCALE = 1.44;
const CITY_STREETLIGHT_INTERVAL = 68;
const CITY_STREETLIGHT_POLE_OFFSET = ROAD_HALF_WIDTH + 2.65;
const ROADSIDE_SIGN_OFFSET = ROAD_HALF_WIDTH + 4.8;
const JAPANESE_BILLBOARD_ADS = [
  { title: "ラーメン", brand: "湾岸食堂", sub: "24時間営業", bg: "#c93a2e", fg: "#fff6dc", accent: "#ffd957" },
  { title: "中古車", brand: "東京AUTO", sub: "高価買取", bg: "#f1c232", fg: "#1d2024", accent: "#e23b2f" },
  { title: "カラオケ", brand: "NEON BOX", sub: "朝5時まで", bg: "#7b2bd1", fg: "#ffffff", accent: "#29d4ff" },
  { title: "珈琲", brand: "喫茶ミナト", sub: "モーニング", bg: "#214d40", fg: "#fff3d2", accent: "#d8a64b" },
  { title: "タイヤ館", brand: "首都高サービス", sub: "点検無料", bg: "#1e5f9b", fg: "#ffffff", accent: "#ffdd55" },
  { title: "ホテル", brand: "銀座ステイ", sub: "空室あり", bg: "#202833", fg: "#f5e8c8", accent: "#ef476f" },
  { title: "ゲーム", brand: "秋葉原電遊", sub: "新作入荷", bg: "#0b7a75", fg: "#ffffff", accent: "#ffba08" },
  { title: "寿司", brand: "築地一番", sub: "本日特価", bg: "#eeeeee", fg: "#21252b", accent: "#d62828" },
  { title: "PIT", brand: "WANGAN SERVICE", sub: "OIL CHECK", bg: "#31363f", fg: "#f2f5f7", accent: "#ff8c2a" },
  { title: "AKIBA", brand: "ELECTRO MART", sub: "MIDNIGHT SALE", bg: "#114b8b", fg: "#ffffff", accent: "#76f0ff" },
  { title: "DRUG", brand: "SAKURA STORE", sub: "OPEN DAILY", bg: "#f6f0e6", fg: "#26302d", accent: "#2f9e44" },
  { title: "GYUDON", brand: "EXPRESS BOWL", sub: "EXTRA RICE", bg: "#8f2b20", fg: "#fff4d8", accent: "#ffcc33" },
  { title: "NIGHT", brand: "BAY LOUNGE", sub: "OPEN 20:00", bg: "#141824", fg: "#f8f4ff", accent: "#c35cff" },
  { title: "PARK", brand: "CITY PARK", sub: "30 MIN FREE", bg: "#2e6f8e", fg: "#ffffff", accent: "#f7d046" },
  { title: "VINYL", brand: "SHIBUYA RECORDS", sub: "NEW ARRIVALS", bg: "#111111", fg: "#f4f0df", accent: "#ff4057" },
  { title: "24H", brand: "MIDNIGHT MART", sub: "HOT COFFEE", bg: "#ffffff", fg: "#1f252b", accent: "#1e88e5" },
  { title: "猫カフェ", brand: "NEKO LOUNGE", sub: "SOFT DRINKS", bg: "#ff8fb3", fg: "#24141c", accent: "#fff2a8" },
  { title: "弁当", brand: "駅前BENTO", sub: "できたて", bg: "#f06445", fg: "#fff9e8", accent: "#2a9d8f" },
  { title: "温泉", brand: "月見の湯", sub: "深夜2時まで", bg: "#235789", fg: "#f7f4ea", accent: "#f2bb05" },
  { title: "ガチャ", brand: "CAPSULE ZONE", sub: "RARE TOYS", bg: "#7dd3fc", fg: "#152238", accent: "#f72585" },
  { title: "焼肉", brand: "炭火横丁", sub: "食べ放題", bg: "#2b1712", fg: "#fff3d0", accent: "#ff6b35" },
  { title: "花屋", brand: "SAKURA FLORIST", sub: "本日配達", bg: "#e9f5db", fg: "#223322", accent: "#d1495b" },
  { title: "映画", brand: "TOKYO CINEMA", sub: "LATE SHOW", bg: "#0d1b2a", fg: "#f5f0e6", accent: "#e0a100" },
  { title: "ゲーム", brand: "PIXEL ARCADE", sub: "NEW CABINETS", bg: "#3a0ca3", fg: "#ffffff", accent: "#4cc9f0" },
  { title: "薬局", brand: "みどり薬局", sub: "24時間受付", bg: "#ffffff", fg: "#183b2d", accent: "#43aa8b" },
  { title: "たい焼き", brand: "銀座甘味", sub: "焼きたて", bg: "#ffd166", fg: "#2b2520", accent: "#ef476f" },
  { title: "ラジオ", brand: "BAY FM 88", sub: "CITY POP", bg: "#073b4c", fg: "#eefaff", accent: "#06d6a0" },
  { title: "写真", brand: "PHOTO BOOTH", sub: "証明写真", bg: "#f8f9fa", fg: "#1f2d3d", accent: "#4361ee" },
  { title: "温泉", brand: "月見の湯", sub: "深夜営業", bg: "#165a72", fg: "#fff7de", accent: "#f5c542" },
  { title: "味噌", brand: "北の麺", sub: "辛口ラーメン", bg: "#b8202f", fg: "#fff7df", accent: "#ffcf33" },
  { title: "銭湯", brand: "富士の湯", sub: "朝6時から", bg: "#f4efe2", fg: "#1e2b33", accent: "#2b77c2" },
  { title: "推し", brand: "LIVE HOUSE 88", sub: "今夜公演", bg: "#ff4fa3", fg: "#fff9ff", accent: "#7df9ff" },
  { title: "玩具", brand: "ガチャ星", sub: "新作入荷", bg: "#ffe066", fg: "#20222a", accent: "#3b82f6" },
  { title: "そば", brand: "江戸スタンド", sub: "天ぷらセット", bg: "#243b2f", fg: "#f7f0d8", accent: "#d9a441" },
  { title: "漫画", brand: "神田ブックス", sub: "中古フロア", bg: "#ffffff", fg: "#17191d", accent: "#e63946" },
  { title: "配車", brand: "東京無線", sub: "今すぐ呼出", bg: "#111827", fg: "#f8fafc", accent: "#22c55e" },
  { title: "クレープ", brand: "原宿小町", sub: "いちご増量", bg: "#ffd6e7", fg: "#331525", accent: "#ff7a00" },
  { title: "酒場", brand: "湾岸横丁", sub: "飲み放題", bg: "#2a1e1a", fg: "#fff1d6", accent: "#f97316" },
];
const DEFAULT_LANE_DASH_LENGTH = 1.7;
const DEFAULT_LANE_DASH_SPACING = 5.4;
const ROAD_SIGN_PLACEMENTS = [
  { s: 420, type: "side", side: 1, title: "首都高速", route: "C1", lines: ["銀座 2km", "新橋 4km"] },
  { s: 1120, type: "gantry", title: "都心環状線", route: "C1", lines: ["渋谷", "霞が関", "羽田"] },
  { s: 2180, type: "side", side: -1, title: "湾岸線", route: "B", lines: ["台場 3km", "横浜 28km"] },
  { s: 3560, type: "gantry", title: "分岐", route: "JCT", lines: ["新宿", "池袋", "上野"] },
  { s: 4920, type: "side", side: 1, title: "出口", route: "出口 04", lines: ["芝公園", "右車線"] },
  { s: 7420, type: "gantry", title: "首都高速道路", route: "Route 3", lines: ["渋谷", "用賀", "東名"] },
  { s: 9140, type: "side", side: -1, title: "中央環状線", route: "C2", lines: ["大橋 1km", "中野長者橋"] },
  { s: 11860, type: "gantry", title: "空港方面", route: "1", lines: ["浜崎橋", "羽田空港", "湾岸線"] },
  { s: 14620, type: "side", side: 1, title: "速度注意", route: "50", lines: ["カーブ連続", "車間注意"] },
  { s: 17140, type: "gantry", title: "江戸橋 JCT", route: "JCT", lines: ["箱崎", "向島", "京橋"] },
  { s: 20680, type: "side", side: -1, title: "出口", route: "出口 09", lines: ["銀座", "次の出口"] },
  { s: 24440, type: "gantry", title: "湾岸線", route: "B", lines: ["有明", "葛西", "千葉"] },
  { s: 28920, type: "side", side: 1, title: "首都高速", route: "C1", lines: ["神田橋", "竹橋"] },
  { s: 33560, type: "gantry", title: "都心方面", route: "C1", lines: ["飯倉", "六本木", "目黒"] },
  { s: 38120, type: "side", side: -1, title: "PA", route: "休憩", lines: ["辰巳 PA", "800m"] },
  { s: 43100, type: "gantry", title: "環状線", route: "C2", lines: ["板橋", "王子", "川口"] },
  { s: 48680, type: "side", side: 1, title: "出口", route: "出口 12", lines: ["汐留", "右出口"] },
  { s: 53240, type: "gantry", title: "首都高速", route: "C1", lines: ["日本橋", "上野", "浅草"] },
];

const ADDITIONAL_ROAD_SIGN_PLACEMENTS = [
  { s: 820, type: "side", side: -1, theme: "route", title: "環状線", route: "C1", lines: ["都心方面", "左車線"] },
  { s: 2860, type: "side", side: 1, theme: "warning", title: "合流注意", route: "注意", lines: ["左から合流", "車間注意"] },
  { s: 6420, type: "side", side: -1, theme: "pa", title: "PA", route: "休憩", lines: ["箱崎 PA", "1.2km"] },
  { s: 10320, type: "side", side: 1, theme: "warning", title: "急カーブ", route: "50", lines: ["速度注意", "追突注意"] },
  { s: 18880, type: "side", side: 1, theme: "route", title: "八重洲線", route: "Y", lines: ["東京駅", "神田橋"] },
  { s: 26640, type: "side", side: -1, theme: "warning", title: "車線変更注意", route: "注意", lines: ["分岐 500m", "右へ"] },
  { s: 31240, type: "side", side: -1, theme: "pa", title: "非常駐車帯", route: "SOS", lines: ["300m", "緊急電話"] },
  { s: 40620, type: "side", side: 1, theme: "warning", title: "渋滞注意", route: "情報", lines: ["この先", "低速車あり"] },
  { s: 51260, type: "side", side: -1, theme: "route", title: "深川線", route: "9", lines: ["木場", "辰巳 JCT"] },
];

const ROAD_SURFACE_MARKINGS = [
  { s: 760, lane: 1, text: "銀座", subtext: "出口", arrow: "straight" },
  { s: 1480, lane: 2, text: "右車線", subtext: "渋谷", arrow: "right" },
  { s: 2440, lane: 0, text: "合流注意", subtext: "速度注意", arrow: "left" },
  { s: 4320, lane: 2, text: "芝公園", subtext: "出口 04", arrow: "right" },
  { s: 7020, lane: 1, text: "首都高", subtext: "C1", arrow: "straight" },
  { s: 8880, lane: 0, text: "大橋", subtext: "C2", arrow: "left" },
  { s: 11620, lane: 2, text: "羽田空港", subtext: "湾岸線", arrow: "right" },
  { s: 14460, lane: 1, text: "速度注意", subtext: "急カーブ", arrow: "straight" },
  { s: 16920, lane: 0, text: "箱崎", subtext: "左分岐", arrow: "left" },
  { s: 20480, lane: 2, text: "銀座", subtext: "出口 09", arrow: "right" },
  { s: 24200, lane: 1, text: "有明", subtext: "湾岸線", arrow: "straight" },
  { s: 28800, lane: 0, text: "神田橋", subtext: "竹橋", arrow: "left" },
  { s: 33340, lane: 2, text: "六本木", subtext: "目黒", arrow: "right" },
  { s: 37940, lane: 0, text: "辰巳 PA", subtext: "800m", arrow: "left" },
  { s: 42900, lane: 1, text: "板橋", subtext: "C2", arrow: "straight" },
  { s: 48480, lane: 2, text: "汐留", subtext: "出口 12", arrow: "right" },
  { s: 53020, lane: 1, text: "日本橋", subtext: "上野", arrow: "straight" },
];

const TUNNEL_RUNS = [
  { start: 6040, length: 920, name: "North Gallery" },
  { start: 12120, length: 2240, name: "Central Grand Gallery" },
  { start: 22660, length: 1380, name: "Hill Tunnel" },
  { start: 30240, length: 2760, name: "Harbor Grand Gallery" },
  { start: 39920, length: 760, name: "West Gallery" },
  { start: 51080, length: 1120, name: "South Long Gallery" },
];
const TUNNEL_BARRIER_MODES = ["both", "right", "left", "guardrail", "both", "left", "right"];
const TUNNEL_MODULE_LENGTH = 18;
const TUNNEL_WALL_TOP_STRIP_RATIO = 0.2;
const DEFAULT_ROUTE_SCALE = 6.5;
const DEFAULT_ROUTE_CONTROL_POINTS = [
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
].map(([x, z]) => ({ x: x * DEFAULT_ROUTE_SCALE, z: z * DEFAULT_ROUTE_SCALE }));
const GRAPHICS_PROFILES = [
  { shadowSize: 0, anisotropy: 1, roadLightStep: 12, chunkRange: 720, roadLightRange: 360 },
  { shadowSize: 0, anisotropy: 1, roadLightStep: 7, chunkRange: 920, roadLightRange: 500 },
  { shadowSize: 0, anisotropy: 2, roadLightStep: 4, chunkRange: 1120, roadLightRange: 620 },
];

// Number of real PointLights used for the whole road network. We keep this count
// FIXED and just reposition the pool onto the nearest streetlights each update.
// A varying number of visible lights forces three.js to recompile every shader
// in the scene (the stutter/freeze while driving), so the count must never change.
// 20 gives continuous coverage around the car (~10 lamp posts per side) so the
// player is never left in a dark gap; the count is constant regardless of quality.
const ROAD_LIGHT_POOL_SIZE = 20;

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

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function hourDistance(hour, target) {
  return Math.abs(((hour - target + 12) % 24) - 12);
}

export class HighwayWorld {
  constructor(scene, settings = {}, options = {}) {
    this.scene = scene;
    this.colliders = [];
    this.walkColliders = [];
    this.roadSamples = [];
    this.mapRoutes = [];
    this.branchRoutes = [];
    this.random = seededRandom(1247);
    this.garageDoorClosed = true;
    // The shipped game is read-only: it loads a pre-baked runtime map (route
    // profile + visual overrides/deletions + pre-baked decorative chunks) and
    // never instantiates the editor. The dev-only map editor sets editable:true
    // and supplies an editable source store instead. See src/game/editor/.
    this.editable = Boolean(options.editable);
    const initialMap = this.resolveInitialMapData(options);
    this.remodelOverrides = { ...initialMap.overrides };
    this.remodelDeletedIds = new Set(initialMap.deleted);
    this.remodelCreatedPieces = [...initialMap.created];
    this.decorChunksData = initialMap.decorChunks;
    this.routeProfile = this.sanitizeRouteProfile(initialMap.routeProfile);
    this.remodelTargets = [];
    this.remodelTargetMap = new Map();
    this.remodelCreatedGroup = null;
    this.remodelHitboxGroup = null;
    // Editor/Play separation: "editor" keeps individual editable pieces, "play"
    // shows only baked, merged, chunked runtime geometry. See bakeCreatedPieces().
    this.mapMode = "editor";
    this.bakedMapGroup = null;
    this.bakedChunks = [];
    this.bakedMapMaterial = null;
    this.environment = null;
    this.environmentScratch = {
      sky: new THREE.Color(),
      hemi: new THREE.Color(),
      ground: new THREE.Color(),
      light: new THREE.Color(),
      streetlight: new THREE.Color(),
    };
    // Lightweight descriptors (position + intensity), NOT real lights. The actual
    // lighting is done by a small fixed pool that follows the player. See
    // ROAD_LIGHT_POOL_SIZE and updateRoadLightVisibility().
    this.roadLightSlots = [];
    this.roadLightPool = [];
    this.garageLights = [];
    this.ultraGraphics = false;
    this.graphicsQuality = 1;
    this.roadLightStep = GRAPHICS_PROFILES[this.graphicsQuality]?.roadLightStep ?? 2;
    this.roadLightRange = GRAPHICS_PROFILES[this.graphicsQuality]?.roadLightRange ?? 560;
    this.chunkVisibilityRange = GRAPHICS_PROFILES[this.graphicsQuality]?.chunkRange ?? 1180;
    this.cullableChunks = [];
    this.tunnelRuns = this.routeProfile.tunnels.map((run) => ({ ...run }));
    this.setLaneDashSettings(settings, { rebuild: false });

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
    if (this.editable) {
      // Editor Mode: individual editable pieces + hitbox templates, baked on demand.
      this.createHitboxTemplates();
      this.createSavedRemodelPieces();
      this.rebuildRemodelTargets();
      this.applySavedRemodelOverrides();
      this.bakeCreatedPieces();
    } else {
      // Shipped game: resolve override/deletion ids against the generated static
      // pieces (one-time, cheap) and load the pre-baked decorative chunks. No
      // editable meshes, no runtime bake.
      this.rebuildRemodelTargets();
      this.applySavedRemodelOverrides();
      this.loadDecorChunks();
      this.mergeStaticDetailMeshes();
    }
    this.freezeStaticMatrices();
  }

  // Normalize the constructor's initial map data into a single shape, from either
  // a baked runtime map (game) or an editable source store (editor). Pure: never
  // touches localStorage — the editor loads/persists its own working state.
  resolveInitialMapData({ runtimeMap = null, sourceStore = null } = {}) {
    if (sourceStore && typeof sourceStore === "object") {
      return {
        overrides: sourceStore.targets && typeof sourceStore.targets === "object" ? { ...sourceStore.targets } : {},
        deleted: Array.isArray(sourceStore.deleted) ? sourceStore.deleted : [],
        created: Array.isArray(sourceStore.created) ? sourceStore.created : [],
        routeProfile: sourceStore.routeProfile ?? null,
        decorChunks: [],
      };
    }
    if (runtimeMap && typeof runtimeMap === "object") {
      return {
        overrides: runtimeMap.overrides && typeof runtimeMap.overrides === "object" ? { ...runtimeMap.overrides } : {},
        deleted: Array.isArray(runtimeMap.deleted) ? runtimeMap.deleted : [],
        created: [],
        routeProfile: runtimeMap.routeProfile ?? null,
        decorChunks: Array.isArray(runtimeMap.decorChunks) ? runtimeMap.decorChunks : [],
      };
    }
    return { overrides: {}, deleted: [], created: [], routeProfile: null, decorChunks: [] };
  }

  // Build frozen, cullable runtime meshes from the pre-baked decorative chunks
  // shipped in the runtime map. Replaces bakeCreatedPieces() for the shipped game.
  loadDecorChunks() {
    const chunks = this.decorChunksData ?? [];
    if (!chunks.length) {
      return;
    }
    const material = this.getBakedMapMaterial();
    const group = new THREE.Group();
    group.name = BAKED_MAP_GROUP;
    group.userData.remodelIgnore = true;
    for (const data of chunks) {
      const mesh = deserializeBakedChunk(data, material);
      if (!Number.isFinite(mesh.userData.chunkRouteLength) || mesh.userData.chunkRouteLength <= 0) {
        mesh.userData.chunkRouteLength = this.trackLength;
      }
      mesh.updateMatrixWorld(true);
      mesh.matrixAutoUpdate = false;
      mesh.matrixWorldAutoUpdate = false;
      group.add(mesh);
      this.cullableChunks.push(mesh);
      this.bakedChunks.push(mesh);
    }
    this.scene.add(group);
    this.bakedMapGroup = group;
  }

  // The static world (58 km of road + city) is thousands of meshes that never
  // move. By default three.js recomputes every object's world matrix every frame,
  // which is a large CPU cost that is independent of graphics quality. Baking the
  // matrices once and turning off auto-update lets the renderer skip these whole
  // subtrees each frame. Dynamic objects (traffic, player, road-light pool, remodel
  // groups) are added elsewhere and keep updating normally.
  freezeStaticMatrices() {
    for (const name of ["StaticHighwayLoop", "SpawnServiceLot"]) {
      const root = this.scene.getObjectByName(name);
      if (!root) {
        continue;
      }
      root.updateMatrixWorld(true);
      root.traverse((object) => {
        object.matrixAutoUpdate = false;
      });
      root.matrixWorldAutoUpdate = false;
    }
  }

  // Shipped-game-only optimization (the editor keeps individual pieces). The
  // hand-authored dressing — manual buildings, billboards, tunnel modules,
  // expressway signs, the spawn lot — is built from thousands of small meshes.
  // Each one is traversed and frustum-tested by the renderer every frame and
  // becomes its own draw call, which is what makes the game main-thread bound.
  // None of them ever move in the shipped game, so collapse them into one mesh
  // per material (optionally per route chunk, so distance culling still works).
  // Must run AFTER applySavedRemodelOverrides (positions/deletions baked in) and
  // BEFORE freezeStaticMatrices (the merged output gets frozen with the rest).
  mergeStaticDetailMeshes() {
    const highway = this.scene.getObjectByName("StaticHighwayLoop");
    if (!highway) {
      return;
    }

    const removedGeometries = new Set();
    const jobs = [];
    const tunnels = highway.getObjectByName("FixedHighwayTunnels");
    if (tunnels) {
      // Chunked + distance-culled: tunnels hug the road, so far-away sections
      // can vanish entirely; the generous radius keeps long tunnels seamless
      // while driving through them.
      jobs.push({
        roots: [tunnels],
        container: tunnels,
        label: "Tunnels",
        chunkLength: CITY_DETAIL_CHUNK_LENGTH,
        cullRadius: 620,
      });
    }
    const billboards = highway.getObjectByName("JapaneseCityBillboards");
    if (billboards) {
      // One mesh per ad material for the whole map: ~7.5k triangles total, so
      // drawing them all is far cheaper than managing thousands of planes.
      jobs.push({ roots: [billboards], container: billboards, label: "Billboards" });
    }
    const signs = highway.getObjectByName("ShutokuExpresswaySigns");
    if (signs) {
      // Not distance-culled: signs are navigation landmarks (gantries are
      // visible from far away today, keep that).
      jobs.push({
        roots: [signs],
        container: signs,
        label: "Signs",
        chunkLength: CITY_DETAIL_CHUNK_LENGTH,
      });
    }
    const cityscape = highway.getObjectByName("FixedRoadsideCityscape");
    if (cityscape) {
      // Landmark towers stay always-visible (no distance cull) so the skyline
      // does not pop; chunking just keeps frustum culling reasonably granular.
      const buildingRoots = cityscape.children.filter(
        (child) => child.isGroup && child.name.startsWith("Building_"),
      );
      if (buildingRoots.length) {
        jobs.push({
          roots: buildingRoots,
          container: cityscape,
          label: "ManualBuildings",
          chunkLength: CITY_DETAIL_CHUNK_LENGTH,
        });
      }
    }
    const serviceLot = this.scene.getObjectByName("SpawnServiceLot");
    if (serviceLot) {
      // The garage door animates (visibility toggle), so it must stay live.
      jobs.push({
        roots: [serviceLot],
        container: serviceLot,
        label: "SpawnServiceLot",
        exclude: [this.garageDoor],
      });
    }

    for (const job of jobs) {
      this.mergeStaticMeshJob(job, removedGeometries);
    }
    this.disposeOrphanedGeometries(removedGeometries);
    // Re-resolve targets so nothing keeps references to the merged-away meshes
    // (merged output carries remodelIgnore and is skipped).
    this.rebuildRemodelTargets();
  }

  mergeStaticMeshJob(
    { roots, container, label, chunkLength = 0, cullRadius = 0, exclude = [] },
    removedGeometries,
  ) {
    const excluded = new Set(exclude.filter(Boolean));
    const sources = [];
    const collect = (object) => {
      if (!object.visible || excluded.has(object)) {
        return;
      }
      if (object.isMesh && !object.isInstancedMesh && this.isMergeableStaticMesh(object)) {
        sources.push(object);
      }
      for (const child of object.children) {
        collect(child);
      }
    };
    for (const root of roots) {
      root.updateMatrixWorld(true);
      collect(root);
    }
    if (!sources.length) {
      return;
    }

    const scratch = new THREE.Vector3();
    const buckets = new Map();
    for (const mesh of sources) {
      let chunkIndex = 0;
      if (chunkLength > 0) {
        const e = mesh.matrixWorld.elements;
        const info = this.getNearestRoadInfo(scratch.set(e[12], 0, e[14]));
        const s = (((info?.s ?? 0) % this.trackLength) + this.trackLength) % this.trackLength;
        chunkIndex = Math.floor(s / chunkLength);
      }
      const key = `${mesh.material.uuid}|${mesh.castShadow ? 1 : 0}${mesh.receiveShadow ? 1 : 0}|${mesh.renderOrder}|${chunkIndex}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { meshes: [], chunkIndex };
        buckets.set(key, bucket);
      }
      bucket.meshes.push(mesh);
    }

    container.updateMatrixWorld(true);
    const containerInverse = new THREE.Matrix4().copy(container.matrixWorld).invert();
    const output = new THREE.Group();
    output.name = `MergedStaticDetail_${label}`;
    output.userData.remodelIgnore = true;

    let bucketIndex = 0;
    for (const bucket of buckets.values()) {
      if (bucket.meshes.length < 2) {
        continue; // a lone mesh gains nothing from re-baking; keep the original
      }
      const geometries = bucket.meshes.map((mesh) =>
        mesh.geometry.clone().applyMatrix4(mesh.matrixWorld),
      );
      const merged = mergeGeometries(geometries, false);
      for (const geometry of geometries) {
        geometry.dispose();
      }
      if (!merged) {
        continue; // attribute mismatch: keep the originals rather than lose them
      }
      // Bake into container-local space so the output can live under the same
      // (possibly transformed) root and be disposed with it on rebuild.
      merged.applyMatrix4(containerInverse);
      merged.computeBoundingSphere();

      const first = bucket.meshes[0];
      const mesh = new THREE.Mesh(merged, first.material);
      mesh.name = `${output.name}_${bucketIndex++}`;
      mesh.castShadow = first.castShadow;
      mesh.receiveShadow = first.receiveShadow;
      mesh.renderOrder = first.renderOrder;
      mesh.userData.remodelIgnore = true;
      if (chunkLength > 0 && cullRadius > 0) {
        mesh.userData.chunkCenterS = (bucket.chunkIndex + 0.5) * chunkLength;
        mesh.userData.chunkRouteLength = this.trackLength;
        mesh.userData.chunkRadius = Math.max(cullRadius, chunkLength * 0.58);
        mesh.userData.performanceCull = true;
        this.cullableChunks.push(mesh);
      }
      output.add(mesh);

      for (const source of bucket.meshes) {
        removedGeometries.add(source.geometry);
        source.removeFromParent();
      }
    }

    if (output.children.length) {
      container.add(output);
    }
    for (const root of roots) {
      this.pruneEmptyStaticGroups(root, excluded);
      if (root !== container && root.children.length === 0) {
        root.removeFromParent();
      }
    }
  }

  isMergeableStaticMesh(mesh) {
    const geometry = mesh.geometry;
    if (!geometry?.isBufferGeometry || !geometry.index || !mesh.material || Array.isArray(mesh.material)) {
      return false;
    }
    if (geometry.morphAttributes && Object.keys(geometry.morphAttributes).length) {
      return false;
    }
    const attributes = Object.keys(geometry.attributes);
    return (
      attributes.length === 3 &&
      Boolean(geometry.attributes.position && geometry.attributes.normal && geometry.attributes.uv)
    );
  }

  pruneEmptyStaticGroups(root, excluded) {
    let removedAny = true;
    while (removedAny) {
      removedAny = false;
      const empties = [];
      root.traverse((object) => {
        if (object === root || excluded.has(object)) {
          return;
        }
        if (object.isMesh || object.isLight || object.isLine || object.isPoints) {
          return;
        }
        if (object.children.length === 0) {
          empties.push(object);
        }
      });
      for (const empty of empties) {
        empty.removeFromParent();
        removedAny = true;
      }
    }
  }

  // Source geometries may be shared (makeBox caches by size), so only dispose
  // the ones no remaining scene object still renders.
  disposeOrphanedGeometries(candidates) {
    if (!candidates.size) {
      return;
    }
    const used = new Set();
    this.scene.traverse((object) => {
      if (object.geometry) {
        used.add(object.geometry);
      }
    });
    for (const geometry of candidates) {
      if (!used.has(geometry)) {
        geometry.dispose();
      }
    }
  }

  createMaterials() {
    const asphaltTexture = this.createAsphaltTexture();
    // Lower repeat = larger on-screen texels. At 56x the grit averaged into a
    // flat grey blur; ~30x keeps the chunky, dithered PSX texture readable.
    asphaltTexture.repeat.set(30, 30);
    const concreteTexture = this.createSurfaceTexture("#3a424b", "#48525d", "#252c34", 120);
    concreteTexture.repeat.set(18, 18);
    const barrierBaseTexture = this.createSurfaceTexture("#aeb1ad", "#c9cbc6", "#777d78", 150);
    barrierBaseTexture.repeat.set(4, 18);
    const cityGroundTexture = this.createSurfaceTexture("#333b42", "#46515b", "#242b31", 220);
    cityGroundTexture.repeat.set(190, 86);
    const shoulderTexture = this.createSurfaceTexture("#283038", "#353e46", "#171d23", 86);
    shoulderTexture.repeat.set(26, 26);
    const curbTexture = this.createSurfaceTexture("#5c6877", "#707c8b", "#313945", 64);
    curbTexture.repeat.set(10, 10);
    const railTexture = this.createSurfaceTexture("#8f9698", "#adb3b4", "#555b5d", 42);
    railTexture.repeat.set(3, 18);
    const railDarkTexture = this.createSurfaceTexture("#3a3f42", "#4f5558", "#1d2225", 42);
    railDarkTexture.repeat.set(3, 18);
    const trimTexture = this.createSurfaceTexture("#303235", "#44474a", "#191b1e", 58);
    trimTexture.repeat.set(5, 5);
    const tunnelTexture = this.createSurfaceTexture("#62696d", "#787f82", "#363d41", 92);
    tunnelTexture.repeat.set(12, 12);
    const tunnelBrickTexture = this.createTunnelBrickTexture();
    tunnelBrickTexture.repeat.set(1.8, 4.6);
    const tunnelUpperTexture = this.createSurfaceTexture("#aeb2ad", "#c5c8c1", "#858b86", 110);
    tunnelUpperTexture.repeat.set(4, 8);

    const materials = {
      cityGround: new THREE.MeshStandardMaterial({
        color: 0x323a41,
        map: cityGroundTexture,
        roughness: 0.9,
        metalness: 0.02,
        flatShading: true,
        side: THREE.DoubleSide,
      }),
      mountain: new THREE.MeshStandardMaterial({
        color: 0x26333b,
        roughness: 0.96,
        metalness: 0.0,
        flatShading: true,
        side: THREE.DoubleSide,
      }),
      mountainFar: new THREE.MeshStandardMaterial({
        color: 0x1c272e,
        roughness: 0.98,
        metalness: 0.0,
        flatShading: true,
        side: THREE.DoubleSide,
      }),
      // Lambert (diffuse-only) across the road surfaces: removes the wet-plastic
      // specular sheen and gives the dry, matte, vertex-lit PSX/PS2 tarmac look.
      asphalt: new THREE.MeshLambertMaterial({
        color: 0x363d43,
        map: asphaltTexture,
        flatShading: true,
        side: THREE.DoubleSide,
      }),
      shoulder: new THREE.MeshLambertMaterial({
        color: 0x293139,
        map: shoulderTexture,
        flatShading: true,
        side: THREE.DoubleSide,
      }),
      roadEdge: new THREE.MeshBasicMaterial({ color: 0xf2f3ed }),
      lane: new THREE.MeshBasicMaterial({ color: 0xd8d6c9 }),
      roadblock: new THREE.MeshStandardMaterial({
        color: 0xe8741e,
        roughness: 0.72,
        metalness: 0.04,
        flatShading: true,
      }),
      roadblockStripe: new THREE.MeshBasicMaterial({ color: 0xf2efe6 }),
      rail: new THREE.MeshLambertMaterial({
        color: 0x8f9698,
        map: railTexture,
        flatShading: true,
      }),
      railDark: new THREE.MeshLambertMaterial({
        color: 0x3a3f42,
        map: railDarkTexture,
        flatShading: true,
      }),
      shutokuBarrier: new THREE.MeshLambertMaterial({
        color: 0xb7b7b1,
        map: this.createShutokuBarrierTexture(),
        flatShading: true,
      }),
      shutokuBarrierBase: new THREE.MeshLambertMaterial({
        color: 0xb2b4b0,
        map: barrierBaseTexture,
        flatShading: true,
      }),
      sidewalkEdgeWall: new THREE.MeshLambertMaterial({
        color: 0xc8cbc7,
        map: barrierBaseTexture,
        flatShading: true,
      }),
      concrete: new THREE.MeshLambertMaterial({
        color: 0x3a424a,
        map: concreteTexture,
        flatShading: true,
      }),
      curb: new THREE.MeshLambertMaterial({
        color: 0x5c6877,
        map: curbTexture,
        flatShading: true,
      }),
      reflectorAmber: new THREE.MeshBasicMaterial({ color: 0xd8a64b }),
      reflectorRed: new THREE.MeshBasicMaterial({ color: 0x9d2d24 }),
      buildingWindow: new THREE.MeshBasicMaterial({ color: 0x9fb9c8 }),
      buildingWindowWarm: new THREE.MeshBasicMaterial({ color: 0xd7b45b }),
      buildingGlassDark: new THREE.MeshStandardMaterial({
        color: 0x3d474d,
        map: this.createFacadeTexture(0x3d474d, { windows: false, panels: true }),
        roughness: 0.42,
        metalness: 0.16,
        flatShading: true,
      }),
      buildingTrim: new THREE.MeshStandardMaterial({
        color: 0x303235,
        map: trimTexture,
        roughness: 0.76,
        metalness: 0.04,
        flatShading: true,
      }),
      tunnelConcrete: new THREE.MeshStandardMaterial({
        color: 0x62696d,
        map: tunnelTexture,
        roughness: 0.86,
        metalness: 0.02,
        flatShading: true,
      }),
      tunnelBrickLower: new THREE.MeshStandardMaterial({
        color: 0xc0ad78,
        map: tunnelBrickTexture,
        roughness: 0.92,
        metalness: 0.01,
        flatShading: true,
      }),
      tunnelCementUpper: new THREE.MeshStandardMaterial({
        color: 0xb7bab3,
        map: tunnelUpperTexture,
        roughness: 0.9,
        metalness: 0.02,
        flatShading: true,
      }),
      tunnelDark: new THREE.MeshStandardMaterial({
        color: 0x1b2024,
        map: this.createSurfaceTexture("#1b2024", "#242b30", "#080b0e", 48),
        roughness: 0.78,
        flatShading: true,
      }),
      tunnelLight: new THREE.MeshBasicMaterial({ color: 0xffe19a }),
      tunnelWarning: new THREE.MeshBasicMaterial({ color: 0xd23324 }),
      tunnelSign: new THREE.MeshBasicMaterial({ color: 0x263f57 }),
      tunnelElectricalPanel: new THREE.MeshStandardMaterial({
        color: 0x687076,
        roughness: 0.58,
        metalness: 0.18,
        flatShading: true,
      }),
      tunnelEmergencyDoor: new THREE.MeshStandardMaterial({
        color: 0x315f48,
        roughness: 0.74,
        metalness: 0.04,
        flatShading: true,
      }),
      tunnelEmergencySign: this.createTunnelEmergencyMaterial(),
      tunnelExitSign: this.createTunnelExitMaterial(),
      streetlightPole: new THREE.MeshStandardMaterial({
        color: 0x25292c,
        roughness: 0.72,
        metalness: 0.18,
        flatShading: true,
      }),
      streetlightGlow: new THREE.MeshBasicMaterial({ color: 0xfff1d8 }),
      aviationBeacon: new THREE.MeshBasicMaterial({ color: 0xff1717 }),
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
    materials.streetlightGlow.toneMapped = false;
    materials.aviationBeacon.toneMapped = false;

    return materials;
  }

  createSurfaceTexture(base, fleck, dark, count) {
    const texture = makeCanvasTexture((ctx, canvas) => {
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const pixelCount = Math.max(18, Math.floor(count * 0.42));
      for (let i = 0; i < pixelCount; i += 1) {
        ctx.fillStyle = i % 4 === 0 ? dark : fleck;
        ctx.globalAlpha = 0.1 + this.random() * 0.18;
        const x = Math.floor((this.random() * canvas.width) / 4) * 4;
        const y = Math.floor((this.random() * canvas.height) / 4) * 4;
        const w = 4 + Math.floor(this.random() * 5) * 4;
        const h = 4 + Math.floor(this.random() * 2) * 4;
        ctx.fillRect(x, y, w, h);
      }
      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = dark;
      for (let i = 0; i < 8; i += 1) {
        ctx.beginPath();
        ctx.moveTo(Math.floor(this.random() * canvas.width / 8) * 8, Math.floor(this.random() * canvas.height / 8) * 8);
        ctx.lineTo(Math.floor(this.random() * canvas.width / 8) * 8, Math.floor(this.random() * canvas.height / 8) * 8);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  createTunnelBrickTexture() {
    const texture = makeCanvasTexture((ctx, canvas) => {
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#bcae78";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const brickW = 32;
      const brickH = 15;
      for (let y = 0; y < canvas.height; y += brickH) {
        const stagger = Math.floor(y / brickH) % 2 ? brickW * 0.5 : 0;
        for (let x = -brickW; x < canvas.width + brickW; x += brickW) {
          const seed = x * 0.11 + y * 0.37;
          const shade = 0.82 + cityNoise(seed + 4.2) * 0.22;
          ctx.fillStyle = `rgb(${Math.floor(190 * shade)}, ${Math.floor(171 * shade)}, ${Math.floor(111 * shade)})`;
          ctx.fillRect(x + stagger + 1, y + 1, brickW - 2, brickH - 2);
        }
      }

      ctx.fillStyle = "rgba(82, 72, 52, 0.45)";
      for (let y = 0; y < canvas.height; y += brickH) {
        ctx.fillRect(0, y, canvas.width, 2);
      }
      for (let y = 0; y < canvas.height; y += brickH) {
        const stagger = Math.floor(y / brickH) % 2 ? brickW * 0.5 : 0;
        for (let x = -brickW; x < canvas.width + brickW; x += brickW) {
          ctx.fillRect(x + stagger, y, 2, brickH);
        }
      }

      for (let i = 0; i < 120; i += 1) {
        const seed = i * 18.31;
        ctx.globalAlpha = 0.12 + cityNoise(seed + 1.1) * 0.26;
        ctx.fillStyle = cityNoise(seed + 2.2) > 0.35 ? "#5b523d" : "#eadfbb";
        const x = Math.floor(cityNoise(seed + 3.3) * canvas.width);
        const y = Math.floor(cityNoise(seed + 4.4) * canvas.height);
        const w = 3 + Math.floor(cityNoise(seed + 5.5) * 18);
        const h = 2 + Math.floor(cityNoise(seed + 6.6) * 8);
        ctx.fillRect(x, y, w, h);
      }
      ctx.globalAlpha = 1;
    });
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  createTunnelEmergencyMaterial() {
    const texture = makeCanvasTexture((ctx, canvas) => {
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#b51f1b";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#ffe9dc";
      ctx.lineWidth = 8;
      ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
      ctx.fillStyle = "#ffe9dc";
      ctx.font = "bold 42px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("SOS", canvas.width * 0.5, canvas.height * 0.42);
      ctx.font = "bold 22px sans-serif";
      ctx.fillText("EMERGENCY", canvas.width * 0.5, canvas.height * 0.68);
    });
    texture.anisotropy = 1;
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    material.name = "tunnelEmergencySign";
    return material;
  }

  createTunnelExitMaterial() {
    const texture = makeCanvasTexture((ctx, canvas) => {
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#0f8f4a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#d9ffe8";
      ctx.lineWidth = 6;
      ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(46, 34, 28, 42);
      ctx.fillRect(75, 50, 38, 12);
      ctx.beginPath();
      ctx.arc(61, 24, 10, 0, TWO_PI);
      ctx.fill();
      ctx.fillRect(124, 37, 34, 34);
      ctx.fillRect(158, 45, 22, 8);
      ctx.beginPath();
      ctx.moveTo(180, 37);
      ctx.lineTo(210, 49);
      ctx.lineTo(180, 61);
      ctx.closePath();
      ctx.fill();
      ctx.font = "bold 29px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("EXIT", canvas.width * 0.72, canvas.height * 0.72);
    });
    texture.anisotropy = 1;
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    material.name = "tunnelExitSign";
    return material;
  }

  createAsphaltTexture() {
    const texture = makeCanvasTexture((ctx, canvas) => {
      ctx.imageSmoothingEnabled = false;
      // Coarse, high-contrast palette so the surface reads as gritty/rough rather
      // than a smooth flat tarmac. PSX-era textures leaned on a small set of
      // strongly separated tones plus heavy per-pixel dithering.
      const palette = ["#21262b", "#2c333a", "#3b444c", "#171c21", "#4d5760", "#0f1316", "#586470"];
      const stainPalette = ["#0b0e12", "#191e23", "#646d76", "#828b94", "#070a0d"];
      const cell = 4;
      // 4x4 ordered (Bayer) dither matrix, normalised 0..1.
      const bayer = [
        0, 8, 2, 10,
        12, 4, 14, 6,
        3, 11, 1, 9,
        15, 7, 13, 5,
      ];

      ctx.fillStyle = "#23282d";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Base grain: pick a palette tone per cell, then nudge it up/down one index
      // using the Bayer threshold so neighbouring cells stipple together — the
      // classic dithered asphalt grit.
      for (let y = 0; y < canvas.height; y += cell) {
        for (let x = 0; x < canvas.width; x += cell) {
          const n = cityNoise(x * 0.083 + y * 0.151 + 91.7);
          const bx = (x / cell) & 3;
          const by = (y / cell) & 3;
          const threshold = bayer[by * 4 + bx] / 16;
          let idx = Math.floor(n * palette.length);
          if (cityNoise(x * 0.27 + y * 0.21 + 4.6) < threshold) {
            idx = (idx + 1) % palette.length;
          }
          ctx.globalAlpha = 1;
          ctx.fillStyle = palette[idx % palette.length];
          ctx.fillRect(x, y, cell, cell);
        }
      }

      // Patchy tar repairs / oil stains in chunky blocks.
      for (let i = 0; i < 110; i += 1) {
        const seed = i * 19.23;
        const x = Math.floor((cityNoise(seed + 2.1) * canvas.width) / cell) * cell;
        const y = Math.floor((cityNoise(seed + 4.8) * canvas.height) / cell) * cell;
        const w = (1 + Math.floor(cityNoise(seed + 7.3) * 9)) * cell;
        const h = (1 + Math.floor(cityNoise(seed + 9.6) * 3)) * cell;
        ctx.globalAlpha = 0.32 + cityNoise(seed + 12.2) * 0.34;
        ctx.fillStyle = stainPalette[Math.floor(cityNoise(seed + 14.9) * stainPalette.length) % stainPalette.length];
        ctx.fillRect(x, y, w, h);
      }

      // Hairline cracks: jagged dark pixel runs.
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = "#0a0d10";
      for (let i = 0; i < 26; i += 1) {
        const seed = i * 33.7;
        let x = Math.floor((cityNoise(seed + 1.2) * canvas.width) / 8) * 8;
        let y = Math.floor((cityNoise(seed + 5.4) * canvas.height) / 8) * 8;
        const steps = 3 + Math.floor(cityNoise(seed + 8.6) * 6);
        for (let step = 0; step < steps; step += 1) {
          const length = (1 + Math.floor(cityNoise(seed + step * 3.1 + 11.8) * 4)) * cell;
          ctx.fillRect(x, y, length, cell);
          x += length;
          y += (cityNoise(seed + step * 7.4 + 2.6) > 0.5 ? 1 : -1) * cell;
        }
      }

      // Bright aggregate speckle (loose gravel catching light).
      for (let i = 0; i < 150; i += 1) {
        const seed = i * 12.91;
        const x = Math.floor((cityNoise(seed + 3.3) * canvas.width) / cell) * cell;
        const y = Math.floor((cityNoise(seed + 6.7) * canvas.height) / cell) * cell;
        ctx.globalAlpha = 0.3 + cityNoise(seed + 8.1) * 0.4;
        ctx.fillStyle = cityNoise(seed + 2.7) > 0.5 ? "#c6c7be" : "#9aa39c";
        ctx.fillRect(x, y, cell, cell);
      }

      // Faint scanline banding reinforces the low-fi PSX read.
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "#040506";
      for (let y = 0; y < canvas.height; y += 12) {
        ctx.fillRect(0, y, canvas.width, cell);
      }

      ctx.globalAlpha = 1;
    });
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  createShutokuBarrierTexture() {
    const texture = makeCanvasTexture((ctx, canvas) => {
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#b8b8b1";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let band = 1; band < 5; band += 1) {
        const y = Math.round((canvas.height * band) / 5);
        ctx.fillStyle = "rgba(84, 87, 82, 0.38)";
        ctx.fillRect(0, y - 1, canvas.width, 2);
        ctx.fillStyle = "rgba(224, 224, 216, 0.18)";
        ctx.fillRect(0, y + 2, canvas.width, 1);
      }

      for (let column = 1; column < 7; column += 1) {
        const x = Math.round((canvas.width * column) / 7);
        ctx.fillStyle = "rgba(78, 82, 78, 0.34)";
        ctx.fillRect(x - 1, 0, 2, canvas.height);
        ctx.fillStyle = "rgba(220, 221, 214, 0.14)";
        ctx.fillRect(x + 2, 0, 1, canvas.height);
      }

      for (let i = 0; i < 64; i += 1) {
        const n = cityNoise(i * 15.7 + 3.4);
        ctx.globalAlpha = 0.08 + n * 0.15;
        ctx.fillStyle = n > 0.62 ? "#6f736d" : "#d5d5cc";
        const x = Math.floor(cityNoise(i * 4.2 + 8.1) * canvas.width);
        const y = Math.floor(cityNoise(i * 6.6 + 1.7) * canvas.height);
        const w = 4 + Math.floor(cityNoise(i * 2.1 + 9.4) * 18);
        const h = 2 + Math.floor(cityNoise(i * 3.3 + 5.2) * 7);
        ctx.fillRect(x, y, w, h);
      }
      ctx.globalAlpha = 1;
    });
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2.5, 1);
    return texture;
  }

  colorToCss(color) {
    return `#${new THREE.Color(color).getHexString()}`;
  }

  shiftedColorCss(color, lightnessDelta = 0) {
    const next = new THREE.Color(color);
    next.offsetHSL(0, 0, lightnessDelta);
    return `#${next.getHexString()}`;
  }

  createFacadeTexture(color, options = {}) {
    const key = `facade:${Number(color).toString(16)}:${options.windows !== false}:${options.panels !== false}`;
    if (!this.facadeTextureCache) {
      this.facadeTextureCache = new Map();
    }
    if (this.facadeTextureCache.has(key)) {
      return this.facadeTextureCache.get(key);
    }

    const texture = makeCanvasTexture((ctx, canvas) => {
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = this.colorToCss(color);
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const panelA = this.shiftedColorCss(color, 0.08);
      const panelB = this.shiftedColorCss(color, -0.08);
      const line = this.shiftedColorCss(color, -0.16);
      const cell = 16;
      for (let y = 0; y < canvas.height; y += cell) {
        for (let x = 0; x < canvas.width; x += cell) {
          const n = cityNoise(x * 0.37 + y * 0.91 + Number(color) * 0.0001);
          ctx.globalAlpha = 0.24;
          ctx.fillStyle = n > 0.55 ? panelA : panelB;
          ctx.fillRect(x, y, cell, cell);
        }
      }

      if (options.panels !== false) {
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = line;
        ctx.lineWidth = 2;
        for (let x = 0; x <= canvas.width; x += 32) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, canvas.height);
          ctx.stroke();
        }
        for (let y = 0; y <= canvas.height; y += 24) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
          ctx.stroke();
        }
      }

      if (options.windows !== false) {
        for (let y = 10; y < canvas.height - 8; y += 22) {
          for (let x = 9; x < canvas.width - 8; x += 26) {
            const lit = cityNoise(x * 1.7 + y * 2.3 + Number(color) * 0.001) > 0.82;
            ctx.globalAlpha = lit ? 0.34 : 0.16;
            ctx.fillStyle = lit ? "#d7b45b" : "#53626a";
            ctx.fillRect(x, y, 10, 6);
          }
        }
      }

      ctx.globalAlpha = 1;
    });
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    this.facadeTextureCache.set(key, texture);
    return texture;
  }

  getDefaultRouteProfile() {
    return {
      controlPoints: DEFAULT_ROUTE_CONTROL_POINTS.map((point) => ({ ...point })),
      segments: DEFAULT_ROUTE_CONTROL_POINTS.map((_point, index) => ({
        index,
        laneCount: 3,
        closedSide: 1,
        leftBarrier: "barrier",
        rightBarrier: "barrier",
      })),
      branches: [],
      tunnels: TUNNEL_RUNS.map((run) => ({ ...run })),
    };
  }

  sanitizeRoutePoint(point, fallback = { x: 0, z: 0 }) {
    const x = Number(point?.x);
    const z = Number(point?.z);
    return {
      x: Number.isFinite(x) ? x : fallback.x,
      z: Number.isFinite(z) ? z : fallback.z,
    };
  }

  sanitizeTunnelRun(run, index = 0) {
    const trackLength = Math.max(1, this.trackLength || 58000);
    const start = ((Number(run?.start) || 0) % trackLength + trackLength) % trackLength;
    const length = clamp(Number(run?.length) || 600, 90, Math.max(120, trackLength * 0.45));
    const rawName = typeof run?.name === "string" && run.name.trim()
      ? run.name.trim()
      : `Remodel Tunnel ${index + 1}`;
    return {
      start,
      length,
      name: rawName.slice(0, 42),
    };
  }

  sanitizeRouteSegment(segment, index = 0) {
    const laneCount = Number(segment?.laneCount) === 2 ? 2 : 3;
    const closedSide = Number(segment?.closedSide) === -1 ? -1 : 1;
    const leftBarrier = normalizeRoadBarrierType(segment?.leftBarrier);
    const rightBarrier = normalizeRoadBarrierType(segment?.rightBarrier);
    return {
      index,
      laneCount,
      closedSide,
      leftBarrier,
      rightBarrier,
    };
  }

  sanitizeRouteProfile(profile = null) {
    const fallback = this.getDefaultRouteProfile();
    const sourcePoints = Array.isArray(profile?.controlPoints) ? profile.controlPoints : fallback.controlPoints;
    const controlPoints = sourcePoints
      .map((point, index) => this.sanitizeRoutePoint(point, fallback.controlPoints[index] ?? fallback.controlPoints[0]))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z));
    const safePoints = controlPoints.length >= 6
      ? controlPoints.slice(0, 64)
      : fallback.controlPoints.map((point) => ({ ...point }));
    const sourceSegments = Array.isArray(profile?.segments) ? profile.segments : fallback.segments;
    const segments = safePoints.map((_point, index) => this.sanitizeRouteSegment(sourceSegments[index], index));

    const branches = Array.isArray(profile?.branches)
      ? profile.branches
          .map((branch, index) => {
            const points = Array.isArray(branch?.points)
              ? branch.points.map((point) => this.sanitizeRoutePoint(point)).slice(0, 16)
              : [];
            if (points.length < 2) {
              return null;
            }
            return {
              id: typeof branch?.id === "string" && branch.id ? branch.id : `branch:${Date.now().toString(36)}:${index}`,
              points,
            };
          })
          .filter(Boolean)
          .slice(0, 12)
      : fallback.branches.map((branch) => ({
          id: branch.id,
          points: branch.points.map((point) => ({ ...point })),
        }));

    const tunnels = (Array.isArray(profile?.tunnels) ? profile.tunnels : fallback.tunnels)
      .map((run, index) => this.sanitizeTunnelRun(run, index))
      .slice(0, 24);

    return {
      controlPoints: safePoints,
      segments,
      branches,
      tunnels,
    };
  }

  getRemodelRouteProfile() {
    return {
      controlPoints: this.routeProfile.controlPoints.map((point) => ({ ...point })),
      segments: this.routeProfile.segments.map((segment, index) => ({
        index,
        laneCount: segment.laneCount === 2 ? 2 : 3,
        closedSide: segment.closedSide === -1 ? -1 : 1,
        leftBarrier: normalizeRoadBarrierType(segment.leftBarrier),
        rightBarrier: normalizeRoadBarrierType(segment.rightBarrier),
      })),
      branches: this.routeProfile.branches.map((branch) => ({
        id: branch.id,
        points: branch.points.map((point) => ({ ...point })),
      })),
      tunnels: this.tunnelRuns.map((run) => ({ ...run })),
    };
  }

  applyRemodelRouteProfile(profile, { rebuild = true, preserveSpawnSegment = true } = {}) {
    const nextProfile = this.sanitizeRouteProfile(profile);
    if (preserveSpawnSegment) {
      this.preserveSpawnSegmentControlPoints(nextProfile);
    }
    this.routeProfile = nextProfile;
    this.tunnelRuns = this.routeProfile.tunnels.map((run) => ({ ...run }));
    if (rebuild) {
      this.rebuildRoadGeometry();
    }
    return this.getRemodelRouteProfile();
  }

  preserveSpawnSegmentControlPoints(nextProfile) {
    const currentPoints = this.routeProfile?.controlPoints ?? [];
    const currentLockedPoints = this.getSpawnLockedControlPointIndices(this.routeProfile)
      .map((index) => currentPoints[index])
      .filter(Boolean);
    const nextLocked = this.getSpawnLockedControlPointIndices(nextProfile);
    for (const index of nextLocked) {
      const point = nextProfile.controlPoints[index];
      if (!point || !currentLockedPoints.length) {
        continue;
      }
      const replacement = currentLockedPoints
        .map((lockedPoint) => ({
          point: lockedPoint,
          distance: Math.hypot(point.x - lockedPoint.x, point.z - lockedPoint.z),
        }))
        .sort((a, b) => a.distance - b.distance)[0]?.point;
      if (replacement) {
        nextProfile.controlPoints[index] = { ...replacement };
      }
    }
  }

  getSpawnLockedControlPointIndices(profile = this.routeProfile) {
    const points = profile?.controlPoints ?? [];
    const start = this.getStartPose();
    if (!start || points.length < 2) {
      return [];
    }

    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const distance = this.distancePointToRouteSegment2D(start.x, start.z, a, b);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    return [bestIndex, (bestIndex + 1) % points.length];
  }

  distancePointToRouteSegment2D(x, z, a, b) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSq = dx * dx + dz * dz || 1;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSq, 0, 1);
    return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
  }

  rebuildRoadGeometry() {
    const existing = this.scene.getObjectByName("StaticHighwayLoop");
    if (existing) {
      this.scene.remove(existing);
      // Evict the removed loop's chunks from the cull list, or every rebuild
      // leaks the whole previous set into updateChunkVisibility forever.
      const removed = new Set();
      existing.traverse((object) => {
        removed.add(object);
        object.geometry?.dispose?.();
      });
      this.cullableChunks = this.cullableChunks.filter((chunk) => !removed.has(chunk));
    }
    this.roadLightSlots = [];
    for (const light of this.roadLightPool) {
      light.userData.slot = null;
      light.intensity = 0;
    }
    this.createRoute();
    this.createStaticHighway();
    this.rebuildRemodelTargets();
    this.applySavedRemodelOverrides();
    if (!this.editable) {
      this.mergeStaticDetailMeshes();
    }
    this.freezeStaticMatrices();
  }

  createRoute() {
    this.roadSamples = [];
    this.mapRoutes = [];
    this.branchRoutes = [];

    const points = this.routeProfile.controlPoints.map((point) => new THREE.Vector3(point.x, 0, point.z));

    this.curve = new THREE.CatmullRomCurve3(points, true, "catmullrom", 0.28);
    this.curve.arcLengthDivisions = 4096;
    this.curve.updateArcLengths();
    this.trackLength = this.curve.getLength();
    this.rebuildRouteSegmentLengths();

    const mainSamples = [];
    for (let i = 0; i < ROAD_SAMPLE_COUNT; i += 1) {
      const sample = this.getFrameAtDistance((i / ROAD_SAMPLE_COUNT) * this.trackLength);
      sample.routeId = "main";
      sample.isBranch = false;
      mainSamples.push(sample);
      this.roadSamples.push(sample);
    }
    this.mapRoutes.push({ samples: mainSamples, closed: true });
    this.createBranchRoutes();
  }

  rebuildRouteSegmentLengths() {
    const points = this.routeProfile.controlPoints ?? [];
    const lengths = [];
    let total = 0;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const length = Math.max(1, Math.hypot((b?.x ?? 0) - (a?.x ?? 0), (b?.z ?? 0) - (a?.z ?? 0)));
      lengths.push(length);
      total += length;
    }

    const scale = total > 0 ? (this.trackLength || total) / total : 1;
    let cursor = 0;
    this.routeSegmentRanges = lengths.map((length, index) => {
      const start = cursor;
      const scaledLength = length * scale;
      cursor += scaledLength;
      return {
        index,
        start,
        end: cursor,
        length: scaledLength,
        laneCount: this.routeProfile.segments?.[index]?.laneCount === 2 ? 2 : 3,
        closedSide: this.routeProfile.segments?.[index]?.closedSide === -1 ? -1 : 1,
        leftBarrier: normalizeRoadBarrierType(this.routeProfile.segments?.[index]?.leftBarrier),
        rightBarrier: normalizeRoadBarrierType(this.routeProfile.segments?.[index]?.rightBarrier),
      };
    });
  }

  createBranchRoutes() {
    for (const branch of this.routeProfile.branches) {
      if (!branch.points?.length || branch.points.length < 2) {
        continue;
      }
      const adjustedPoints = this.createAdjustedBranchPoints(branch);
      const curve = new THREE.CatmullRomCurve3(
        adjustedPoints,
        false,
        "catmullrom",
        0.24,
      );
      curve.arcLengthDivisions = 1024;
      curve.updateArcLengths();
      const length = curve.getLength();
      const adjustedBranch = {
        ...branch,
        points: adjustedPoints.map((point) => ({ x: point.x, z: point.z })),
      };
      const startAttachment = this.createBranchAttachment(adjustedBranch, curve, length, true);
      const endAttachment = this.createBranchAttachment(adjustedBranch, curve, length, false);
      const samples = [];
      const sampleCount = Math.max(60, Math.min(260, Math.ceil(length / 34)));
      for (let i = 0; i <= sampleCount; i += 1) {
        const sample = this.getFrameOnCurve(curve, length, (i / sampleCount) * length, false);
        sample.isBranch = true;
        sample.routeId = branch.id;
        sample.routeDistance = (i / sampleCount) * length;
        sample.roadHalfWidth = ROAD_HALF_WIDTH;
        sample.laneCount = 3;
        samples.push(sample);
        this.roadSamples.push(sample);
      }
      this.branchRoutes.push({ id: branch.id, curve, length, samples, startAttachment, endAttachment });
      this.mapRoutes.push({ samples, closed: false });
    }
  }

  createAdjustedBranchPoints(branch) {
    const points = branch.points.map((point) => new THREE.Vector3(point.x, 0, point.z));
    if (points.length < 2) {
      return points;
    }

    points[0] = this.getSnappedBranchEndpoint(points[0], points[1], true) ?? points[0];
    const last = points.length - 1;
    points[last] = this.getSnappedBranchEndpoint(points[last], points[last - 1], false) ?? points[last];
    return points;
  }

  getSnappedBranchEndpoint(endpoint, neighbor, atStart = true) {
    const nearest = this.getNearestMainRoadInfo(endpoint);
    if (!nearest || nearest.distance > JUNCTION_ATTACHMENT_MAX_DISTANCE) {
      return null;
    }

    const branchDirection = new THREE.Vector3(neighbor.x - endpoint.x, 0, neighbor.z - endpoint.z);
    if (!atStart) {
      branchDirection.multiplyScalar(-1);
    }
    const sideProjection = branchDirection.dot(nearest.normal);
    const side = Math.sign(Math.abs(nearest.lateral) > 1 ? nearest.lateral : sideProjection) || 1;
    return this.offsetPoint(nearest, side * (ROAD_HALF_WIDTH + 0.6), 0);
  }

  createBranchAttachment(branch, curve, length, atStart = true) {
    const points = branch.points ?? [];
    const endpoint = points[atStart ? 0 : points.length - 1];
    const neighbor = points[atStart ? 1 : points.length - 2];
    if (!endpoint || !neighbor) {
      return null;
    }

    const nearest = this.getNearestMainRoadInfo(new THREE.Vector3(endpoint.x, 0, endpoint.z));
    if (!nearest || nearest.distance > JUNCTION_ATTACHMENT_MAX_DISTANCE) {
      return null;
    }

    const branchDirection = new THREE.Vector3(neighbor.x - endpoint.x, 0, neighbor.z - endpoint.z);
    if (!atStart) {
      branchDirection.multiplyScalar(-1);
    }
    const sideProjection = branchDirection.dot(nearest.normal);
    const side = Math.sign(Math.abs(nearest.lateral) > 1 ? nearest.lateral : sideProjection) || 1;
    return {
      mainS: nearest.s,
      side,
      routeDistance: atStart ? 0 : length,
    };
  }

  createEnvironment() {
    this.scene.background = new THREE.Color(0x80c8ff);

    const hemisphere = new THREE.HemisphereLight(0xe5f4ff, 0x1a211a, 1.26);
    this.scene.add(hemisphere);

    const keyLight = new THREE.DirectionalLight(0xfff3d1, 1.34);
    keyLight.position.set(-220, 360, -180);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 20;
    keyLight.shadow.camera.far = 900;
    keyLight.shadow.camera.left = -180;
    keyLight.shadow.camera.right = 180;
    keyLight.shadow.camera.top = 180;
    keyLight.shadow.camera.bottom = -180;
    this.scene.add(keyLight);

    // Fixed pool of road lights. These are the ONLY real lights for the whole
    // streetlight/tunnel network; they get repositioned onto the nearest emitters
    // each visibility update. Count is constant so shaders never recompile.
    this.roadLightPool = [];
    for (let i = 0; i < ROAD_LIGHT_POOL_SIZE; i += 1) {
      const light = new THREE.PointLight(0xfff1d8, 0, 132, 1.02);
      light.visible = true;
      light.castShadow = false;
      light.userData.slot = null;
      this.scene.add(light);
      this.roadLightPool.push(light);
    }

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
        nightSky: new THREE.Color(0x07101f),
        dayGround: new THREE.Color(0x1a211a),
        nightGround: new THREE.Color(0x0a0d13),
        dayHemi: new THREE.Color(0xe5f4ff),
        nightHemi: new THREE.Color(0x40537b),
        sun: new THREE.Color(0xfff3d1),
        moon: new THREE.Color(0x9eb8ff),
      },
    };
    this.applyEnvironment({ timeOfDay: 18.25 });
  }

  applyEnvironment(settings = {}, dt = 1 / 60) {
    if (!this.environment) {
      return;
    }

    const smooth = clamp(1 - Math.exp(-2.15 * Math.min(dt, 0.18)), 0, 1);
    const hour = ((Number(settings.timeOfDay ?? 12) % 24) + 24) % 24;
    const daylight = smoothstep(5.35, 7.55, hour) * (1 - smoothstep(17.15, 19.55, hour));
    const dawn = 1 - smoothstep(0, 2.7, hourDistance(hour, 6.35));
    const dusk = 1 - smoothstep(0, 3.1, hourDistance(hour, 18.25));
    const twilight = Math.max(dawn, dusk);
    const night = clamp(1 - daylight, 0, 1);
    const lampPower = smoothstep(0.06, 0.46, night);
    const { hemisphere, keyLight, fog, colors } = this.environment;

    const sky = this.environmentScratch.sky.copy(colors.nightSky);
    sky.lerp(dawn > dusk ? colors.dawnSky : colors.duskSky, twilight * 0.68);
    sky.lerp(colors.daySky, daylight);
    this.scene.background.lerp(sky, smooth);
    fog.color.lerp(sky, smooth);
    fog.density = THREE.MathUtils.lerp(
      fog.density,
      (this.ultraGraphics ? 0.0000025 : 0.000009) + night * 0.000007 + twilight * 0.000004,
      smooth,
    );

    const hemiColor = this.environmentScratch.hemi.copy(colors.nightHemi).lerp(colors.dayHemi, daylight);
    const groundColor = this.environmentScratch.ground.copy(colors.nightGround).lerp(colors.dayGround, daylight);
    hemisphere.color.lerp(hemiColor, smooth);
    hemisphere.groundColor.lerp(groundColor, smooth);
    hemisphere.intensity = THREE.MathUtils.lerp(
      hemisphere.intensity,
      0.58 + night * 0.2 + daylight * 1.05 + twilight * 0.32,
      smooth,
    );

    const sunAngle = ((hour - 6) / 24) * TWO_PI;
    const moonAngle = sunAngle + Math.PI;
    const moonBlend = smoothstep(0.34, 0.86, night);
    const lightAngle = THREE.MathUtils.lerp(sunAngle, moonAngle, moonBlend);
    const lightHeight = Math.max(0.14, Math.abs(Math.sin(lightAngle)));
    const lightRadius = 360;
    keyLight.position.set(
      Math.cos(lightAngle) * -220,
      lightHeight * lightRadius,
      Math.sin(lightAngle) * -220,
    );
    const lightColor = this.environmentScratch.light.copy(colors.sun).lerp(colors.moon, moonBlend);
    keyLight.color.lerp(lightColor, smooth);
    keyLight.intensity = THREE.MathUtils.lerp(
      keyLight.intensity,
      THREE.MathUtils.lerp(0.3 + daylight * 1.08 + twilight * 0.3, 0.66 + night * 0.34, moonBlend),
      smooth,
    );
    if (this.materials?.streetlightGlow) {
      this.environmentScratch.streetlight.set(lampPower > 0.02 ? 0xfff1d8 : 0x665f56);
      this.materials.streetlightGlow.color.lerp(this.environmentScratch.streetlight, smooth);
    }
    for (const light of this.roadLightPool) {
      const slot = light.userData.slot;
      const baseIntensity = slot ? slot.baseIntensity ?? 1 : 0;
      const targetIntensity = !slot
        ? 0
        : slot.alwaysOn
          ? baseIntensity * (this.ultraGraphics ? 1.34 : 1.12)
          : lampPower * baseIntensity * (this.ultraGraphics ? 3.1 : 2.45);
      light.intensity = THREE.MathUtils.lerp(
        light.intensity,
        targetIntensity,
        smooth,
      );
    }
    for (const light of this.garageLights) {
      light.intensity = THREE.MathUtils.lerp(
        light.intensity,
        (light.userData.baseIntensity ?? 1) * (0.95 + night * 0.72),
        smooth,
      );
    }
  }

  setUltraGraphics(enabled) {
    this.setGraphicsQuality(this.graphicsQuality, enabled);
  }

  setLaneDashSettings(settings = {}, { rebuild = true } = {}) {
    const length = Number(settings.laneDashLength);
    const spacing = Number(settings.laneDashSpacing);
    this.laneDashLength = clamp(Number.isFinite(length) ? length : DEFAULT_LANE_DASH_LENGTH, 1.2, 10);
    this.laneDashSpacing = clamp(Number.isFinite(spacing) ? spacing : DEFAULT_LANE_DASH_SPACING, 4.2, 30);
    if (rebuild && this.scene?.getObjectByName("StaticHighwayLoop")) {
      this.rebuildRoadGeometry();
    }
  }

  setGraphicsQuality(quality = this.graphicsQuality, ultra = this.ultraGraphics) {
    const rawQuality = Number(quality);
    this.graphicsQuality = clamp(Number.isFinite(rawQuality) ? Math.round(rawQuality) : 1, 0, 2);
    this.ultraGraphics = Boolean(ultra);
    const profile = GRAPHICS_PROFILES[this.graphicsQuality] ?? GRAPHICS_PROFILES[1];
    if (this.environment?.keyLight) {
      const shadowSize = this.ultraGraphics ? 1536 : profile.shadowSize;
      this.environment.keyLight.castShadow = shadowSize > 0;
      if (shadowSize > 0) {
        this.environment.keyLight.shadow.mapSize.set(shadowSize, shadowSize);
        this.environment.keyLight.shadow.needsUpdate = true;
      }
    }
    // Road lights now use a fixed-size pool (ROAD_LIGHT_POOL_SIZE), so quality only
    // controls how far they reach, never how many exist. Keeping the count constant
    // is what prevents the per-frame shader recompiles that caused the freezes.
    this.roadLightRange = this.ultraGraphics ? 980 : profile.roadLightRange;
    this.chunkVisibilityRange = this.ultraGraphics ? 2600 : profile.chunkRange;
    for (const chunk of this.cullableChunks) {
      chunk.visible = true;
    }
    const garageShadowSize = this.ultraGraphics ? 512 : 0;
    for (const light of this.garageLights) {
      light.castShadow = garageShadowSize > 0;
      if (garageShadowSize > 0 && light.shadow?.mapSize) {
        light.shadow.mapSize.set(garageShadowSize, garageShadowSize);
        light.shadow.needsUpdate = true;
      }
    }
    for (const texture of [
      this.materials?.cityGround?.map,
      this.materials?.asphalt?.map,
      this.materials?.shoulder?.map,
      this.materials?.concrete?.map,
      this.materials?.curb?.map,
      this.materials?.rail?.map,
      this.materials?.railDark?.map,
      this.materials?.buildingGlassDark?.map,
      this.materials?.buildingTrim?.map,
      this.materials?.tunnelConcrete?.map,
      this.materials?.tunnelBrickLower?.map,
      this.materials?.tunnelCementUpper?.map,
      this.materials?.tunnelDark?.map,
    ]) {
      if (texture) {
        texture.anisotropy = this.ultraGraphics ? 2 : profile.anisotropy;
        texture.needsUpdate = true;
      }
    }
  }

  createStaticHighway() {
    const highway = new THREE.Group();
    highway.name = "StaticHighwayLoop";
    highway.add(this.createRibbonMesh(CITY_DISTRICT_HALF_WIDTH, CITY_GROUND_ELEVATION, this.materials.cityGround, ROAD_RIBBON_SEGMENTS));
    highway.add(this.createRibbonMesh((s) => this.getRoadLateralBoundsAtDistance(s, 5.8), HIGHWAY_DECK_ELEVATION, this.materials.concrete, ROAD_RIBBON_SEGMENTS));
    highway.add(this.createRibbonMesh((s) => this.getRoadLateralBoundsAtDistance(s, 5.2), ROAD_SHOULDER_ELEVATION, this.materials.shoulder, ROAD_RIBBON_SEGMENTS));
    highway.add(this.createRibbonMesh((s) => this.getRoadLateralBoundsAtDistance(s), ROAD_SURFACE_ELEVATION, this.materials.asphalt, ROAD_RIBBON_SEGMENTS));
    this.createElevatedHighwaySupports(highway);
    this.addBranchHighways(highway);

    const laneMarkers = [];
    for (let s = this.laneDashSpacing * 0.5; s < this.trackLength; s += this.laneDashSpacing) {
      for (const laneOffset of this.getLaneMarkerOffsetsAtDistance(s)) {
        if (this.isJunctionOpeningOnAnySide(s, JUNCTION_OPENING_HALF_LENGTH + 8)) {
          continue;
        }
        const frame = this.getFrameAtDistance(s);
        laneMarkers.push({
          position: this.offsetPoint(frame, laneOffset, ROAD_MARKING_ELEVATION),
          yaw: frame.yaw,
          s,
        });
      }
    }
    highway.add(this.createChunkedInstancedBoxes(laneMarkers, 0.13, 0.038, this.laneDashLength, this.materials.lane));

    const edgeMarkers = [];
    const edgeLineLength = 13.6;
    for (let s = 0; s < this.trackLength; s += 12) {
      const bounds = this.getRoadLateralBoundsAtDistance(s);
      for (const edgeOffset of [bounds.left + 0.45, bounds.right - 0.45]) {
        if (this.isJunctionOpeningForOffset(s, edgeOffset)) {
          continue;
        }
        const frame = this.getFrameAtDistance(s);
        edgeMarkers.push({
          position: this.offsetPoint(frame, edgeOffset, ROAD_MARKING_ELEVATION),
          yaw: frame.yaw,
          s,
        });
      }
    }
    highway.add(this.createChunkedInstancedBoxes(edgeMarkers, 0.14, 0.035, edgeLineLength, this.materials.roadEdge));
    this.createRoadSurfaceMarkings(highway);

    const guardrails = this.createGuardrailBatch();
    for (let s = 0; s < this.trackLength; s += 18) {
      const frame = this.getFrameAtDistance(s);
      for (const side of [-1, 1]) {
        if (this.isServiceOpening(frame.s, side) || this.isJunctionOpening(frame.s, side)) {
          continue;
        }

        this.addGuardrailSegment(highway, frame, side, GUARDRAIL_SEGMENT_LENGTH, guardrails);
      }
    }
    this.flushGuardrailBatch(highway, guardrails, GUARDRAIL_SEGMENT_LENGTH);
    this.createSidewalkEdgeWalls(highway);
    this.createLaneClosureRoadblocks(highway);
    this.createTunnelRuns(highway);
    this.createRoadsideInfrastructure(highway);
    this.createExpresswaySigns(highway);
    this.createFixedCityscape(highway);

    this.scene.add(highway);
  }

  createRoadSurfaceMarkings(parent) {
    const markings = new THREE.Group();
    markings.name = "ShutokuRoadSurfaceMarkings";
    markings.userData.remodelIgnore = true;

    for (const marking of ROAD_SURFACE_MARKINGS) {
      if (this.isJunctionOpeningOnAnySide(marking.s, JUNCTION_OPENING_HALF_LENGTH + 18)) {
        continue;
      }
      if (this.getLaneCountAtDistance(marking.s, { smooth: true }) < 2.5 && marking.lane !== 1) {
        continue;
      }
      const frame = this.getFrameAtDistance(marking.s);
      const laneOffset = this.getLaneOffsetAtDistance(marking.s, marking.lane);
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(3.45, 13.2),
        this.createRoadSurfaceMarkingMaterial(marking),
      );
      panel.name = `RoadMarking_${marking.text}_${Math.round(marking.s)}`;
      panel.position.copy(this.offsetPoint(frame, laneOffset, ROAD_TEXT_MARKING_ELEVATION));
      this.orientRoadSurfacePlane(panel, frame);
      panel.renderOrder = 3;
      panel.receiveShadow = false;
      markings.add(panel);
    }

    parent.add(markings);
  }

  orientRoadSurfacePlane(panel, frame) {
    const xAxis = frame.normal.clone().multiplyScalar(-1).normalize();
    const yAxis = frame.tangent.clone().normalize();
    const zAxis = new THREE.Vector3(0, 1, 0);
    const matrix = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
    panel.quaternion.setFromRotationMatrix(matrix);
  }

  createRoadSurfaceMarkingMaterial(marking) {
    const texture = makeCanvasTexture((ctx, canvas) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width * 0.5, canvas.height * 0.5);
      ctx.rotate(-Math.PI * 0.5);
      ctx.fillStyle = "rgba(242, 246, 238, 0.92)";
      ctx.strokeStyle = "rgba(24, 28, 30, 0.26)";
      ctx.lineWidth = 5;
      ctx.lineJoin = "round";
      this.drawRoadArrow(ctx, marking.arrow ?? "straight", -34, 0);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "900 54px system-ui, sans-serif";
      ctx.strokeText(marking.text, 42, -10);
      ctx.fillText(marking.text, 42, -10);
      ctx.font = "800 32px system-ui, sans-serif";
      ctx.strokeText(marking.subtext ?? "", 42, 42);
      ctx.fillText(marking.subtext ?? "", 42, 42);
      ctx.restore();
    });
    texture.anisotropy = this.ultraGraphics ? 8 : 2;
    return new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      side: THREE.DoubleSide,
    });
  }

  drawRoadArrow(ctx, direction, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(242, 246, 238, 0.92)";
    const sign = direction === "left" ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(-14, 62);
    ctx.lineTo(14, 62);
    ctx.lineTo(14, -18);
    if (direction === "left" || direction === "right") {
      ctx.bezierCurveTo(14, -48, sign * 40, -60, sign * 62, -60);
      ctx.lineTo(sign * 62, -84);
      ctx.lineTo(sign * 104, -44);
      ctx.lineTo(sign * 62, -4);
      ctx.lineTo(sign * 62, -28);
      ctx.bezierCurveTo(sign * 26, -28, -14, -18, -14, 20);
    } else {
      ctx.lineTo(-14, -18);
      ctx.lineTo(-14, -62);
      ctx.lineTo(-38, -62);
      ctx.lineTo(0, -106);
      ctx.lineTo(38, -62);
      ctx.lineTo(14, -62);
      ctx.lineTo(14, 62);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  addBranchHighways(parent) {
    for (const route of this.branchRoutes) {
      parent.add(this.createRibbonMesh(ROAD_HALF_WIDTH + 4.8, HIGHWAY_DECK_ELEVATION, this.materials.concrete, 260, route.curve, route.length, false));
      parent.add(this.createRibbonMesh(ROAD_HALF_WIDTH + 4.2, ROAD_SHOULDER_ELEVATION, this.materials.shoulder, 260, route.curve, route.length, false));
      parent.add(this.createRibbonMesh(ROAD_HALF_WIDTH, ROAD_SURFACE_ELEVATION, this.materials.asphalt, 260, route.curve, route.length, false));
      this.addJunctionFlares(parent, route);

      const branchLaneMarkers = [];
      for (const laneOffset of [-2, 2]) {
        for (let s = this.laneDashSpacing * 0.5; s < route.length - 12; s += this.laneDashSpacing) {
          if (this.isBranchJunctionOpening(route, s)) {
            continue;
          }
          const frame = this.getFrameOnCurve(route.curve, route.length, s, false);
          branchLaneMarkers.push({
            position: this.offsetPoint(frame, laneOffset, ROAD_MARKING_ELEVATION),
            yaw: frame.yaw,
            s,
          });
        }
      }
      parent.add(this.createChunkedInstancedBoxes(branchLaneMarkers, 0.13, 0.038, this.laneDashLength, this.materials.lane, false, route.length));

      const branchGuardrails = this.createGuardrailBatch();
      for (let s = 0; s < route.length; s += 15) {
        const frame = this.getFrameOnCurve(route.curve, route.length, s, false);
        for (const side of [-1, 1]) {
          if (this.isBranchJunctionOpening(route, s)) {
            continue;
          }
          this.addGuardrailSegment(parent, frame, side, 14.5, branchGuardrails);
        }
      }
      this.flushGuardrailBatch(parent, branchGuardrails, 14.5, route.length);
    }
  }

  updateRoadLightVisibility(focusS = 0, viewDistance = 900) {
    const pool = this.roadLightPool;
    if (!pool.length) {
      return;
    }
    const range = Math.min(Math.max(0, viewDistance * 0.9), this.roadLightRange);
    const hasRange = range > 0 && this.trackLength > 0;

    // Find the nearest emitters to the player and bind the (fixed) pool to them.
    // The number of real lights never changes, so no shader recompiles happen.
    const nearest = [];
    if (hasRange) {
      for (const slot of this.roadLightSlots) {
        const distance = this.loopDistance(focusS, slot.s);
        if (distance <= range) {
          nearest.push({ slot, distance });
        }
      }
      // Tunnel lights (alwaysOn) win ties so a tunnel is never left dark when the
      // pool is competing with nearby streetlights; otherwise pick the closest.
      nearest.sort((a, b) => {
        if (a.slot.alwaysOn !== b.slot.alwaysOn) {
          return a.slot.alwaysOn ? -1 : 1;
        }
        return a.distance - b.distance;
      });
      nearest.length = Math.min(nearest.length, pool.length);
      // Sort the chosen emitters by position so each pool light keeps a stable
      // emitter as the player advances (avoids lights visibly jumping around).
      nearest.sort((a, b) => a.slot.s - b.slot.s);
    }

    for (let i = 0; i < pool.length; i += 1) {
      const light = pool[i];
      const entry = nearest[i];
      if (!entry) {
        light.userData.slot = null;
        continue;
      }
      const slot = entry.slot;
      if (light.userData.slot !== slot) {
        light.userData.slot = slot;
        light.position.set(slot.x, slot.y, slot.z);
        light.color.setHex(slot.color);
        light.distance = slot.range;
        light.decay = slot.decay;
      }
    }
  }

  isBranchJunctionOpening(route, s) {
    return (route.startAttachment && s < JUNCTION_BRANCH_CLEARANCE)
      || (route.endAttachment && s > route.length - JUNCTION_BRANCH_CLEARANCE);
  }

  addJunctionFlares(parent, route) {
    for (const attachment of [route.startAttachment, route.endAttachment]) {
      if (!attachment) {
        continue;
      }
      const mainFrame = this.getFrameAtDistance(attachment.mainS);
      const branchFrame = this.getFrameOnCurve(route.curve, route.length, attachment.routeDistance, false);
      const side = attachment.side;
      const branchDir = attachment.routeDistance <= 0 ? 1 : -1;
      const branchNear = this.getFrameOnCurve(
        route.curve,
        route.length,
        attachment.routeDistance + branchDir * Math.min(42, route.length * 0.18),
        false,
      );

      this.addJunctionTransitionDeck(parent, mainFrame, branchFrame, branchNear, side);
      this.addCurvedJunctionGuardrail(parent, mainFrame, branchNear, side);
    }
  }

  addJunctionTransitionDeck(parent, mainFrame, branchFrame, branchNear, side) {
    const mouth = Math.min(JUNCTION_OPENING_HALF_LENGTH * 0.88, Math.max(28, mainFrame.center.distanceTo(branchNear.center) * 0.42));
    const mainBack = this.getFrameAtDistance(mainFrame.s - mouth);
    const mainFront = this.getFrameAtDistance(mainFrame.s + mouth);
    this.addJunctionPatchLayer(parent, mainBack, mainFront, branchFrame, branchNear, ROAD_HALF_WIDTH + 5.4, HIGHWAY_DECK_ELEVATION + 0.035, this.materials.concrete, 1);
    this.addJunctionPatchLayer(parent, mainBack, mainFront, branchFrame, branchNear, ROAD_HALF_WIDTH + 4.8, ROAD_SHOULDER_ELEVATION + 0.018, this.materials.shoulder, 2);
    this.addJunctionPatchLayer(parent, mainBack, mainFront, branchFrame, branchNear, ROAD_HALF_WIDTH + 0.35, ROAD_SURFACE_ELEVATION + 0.022, this.materials.asphalt, 3);
    this.addMergeGuideMarkings(parent, mainFrame, branchNear, side);
  }

  addJunctionPatchLayer(parent, mainBack, mainFront, branchFrame, branchNear, halfWidth, y, material, renderOrder = 0) {
    const candidates = [
      this.offsetPoint(mainBack, -halfWidth, y),
      this.offsetPoint(mainBack, halfWidth, y),
      this.offsetPoint(mainFront, -halfWidth, y),
      this.offsetPoint(mainFront, halfWidth, y),
      this.offsetPoint(branchFrame, -halfWidth, y),
      this.offsetPoint(branchFrame, halfWidth, y),
      this.offsetPoint(branchNear, -halfWidth, y),
      this.offsetPoint(branchNear, halfWidth, y),
    ];
    const hull = this.computeConvexHull2D(candidates);
    if (hull.length < 3) {
      return null;
    }
    const mesh = this.createFlatPolygonMesh(hull, y, material);
    mesh.name = "JunctionBlendPatch";
    mesh.renderOrder = renderOrder;
    parent.add(mesh);
    return mesh;
  }

  addMergeGuideMarkings(parent, mainFrame, branchNear, side) {
    const center = this.offsetPoint(mainFrame, side * (ROAD_HALF_WIDTH * 0.48), ROAD_MARKING_ELEVATION + 0.012);
    const target = this.offsetPoint(branchNear, -side * (ROAD_HALF_WIDTH * 0.44), ROAD_MARKING_ELEVATION + 0.012);
    const dx = target.x - center.x;
    const dz = target.z - center.z;
    const length = Math.max(10, Math.min(32, Math.hypot(dx, dz) * 0.42));
    const yaw = Math.atan2(dx, dz);
    this.addOrientedBox(parent, 0.16, 0.036, length, this.materials.roadEdge, center, yaw);
  }

  createFlatPolygonMesh(points, y, material) {
    const shape = new THREE.Shape([...points].reverse().map((point) => new THREE.Vector2(point.x, point.z)));
    const geometry = new THREE.ShapeGeometry(shape);
    const position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = position.getY(i);
      position.setXYZ(i, x, y, z);
    }
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    return mesh;
  }

  computeConvexHull2D(points) {
    const sorted = points
      .map((point) => ({ x: point.x, y: point.z, source: point }))
      .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
    if (sorted.length <= 3) {
      return sorted.map((point) => point.source);
    }

    const cross = (origin, a, b) =>
      (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
    const lower = [];
    for (const point of sorted) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
        lower.pop();
      }
      lower.push(point);
    }
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      const point = sorted[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
        upper.pop();
      }
      upper.push(point);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper).map((point) => point.source);
  }

  addCurvedJunctionGuardrail(parent, mainFrame, branchFrame, side) {
    const anchorA = this.offsetAlong(mainFrame, side * RAIL_OFFSET, -20, GUARDRAIL_MODEL.upper.y);
    const anchorB = this.offsetPoint(branchFrame, -side * RAIL_OFFSET, GUARDRAIL_MODEL.upper.y);
    const mid = new THREE.Vector3()
      .copy(this.offsetPoint(mainFrame, side * (RAIL_OFFSET + 6.5), GUARDRAIL_MODEL.upper.y))
      .lerp(this.offsetPoint(branchFrame, -side * (RAIL_OFFSET + 3.2), GUARDRAIL_MODEL.upper.y), 0.54);
    const previous = anchorA.clone();
    const steps = 5;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const a = anchorA.clone().lerp(mid, t);
      const b = mid.clone().lerp(anchorB, t);
      const point = a.lerp(b, t);
      const dx = point.x - previous.x;
      const dz = point.z - previous.z;
      const length = Math.max(4, Math.hypot(dx, dz));
      const yaw = Math.atan2(dx, dz);
      this.addOrientedBox(parent, GUARDRAIL_MODEL.upper.width, GUARDRAIL_MODEL.upper.height, length, this.materials.rail, point.clone(), yaw);
      this.addOrientedBox(
        parent,
        GUARDRAIL_MODEL.lower.width,
        GUARDRAIL_MODEL.lower.height,
        length,
        this.materials.railDark,
        new THREE.Vector3(point.x, GUARDRAIL_MODEL.lower.y, point.z),
        yaw,
      );
      previous.copy(point);
    }
  }

  createElevatedHighwaySupports(parent) {
    const supports = new THREE.Group();
    supports.name = "ElevatedHighwaySupports";
    const pillars = [];
    const crossheads = [];
    const pillarHeight = Math.max(0.4, HIGHWAY_DECK_ELEVATION - CITY_GROUND_ELEVATION);
    const pillarY = CITY_GROUND_ELEVATION + pillarHeight * 0.5;

    for (let s = 80; s < this.trackLength; s += HIGHWAY_SUPPORT_INTERVAL) {
      const frame = this.getFrameAtDistance(s);
      crossheads.push({
        position: this.offsetPoint(frame, 0, HIGHWAY_DECK_ELEVATION + 0.1),
        yaw: frame.yaw,
        scale: { x: ROAD_WIDTH + 8.8, y: 0.28, z: 2.4 },
      });

      for (const side of [-1, 1]) {
        pillars.push({
          position: this.offsetPoint(frame, side * (ROAD_HALF_WIDTH + 3.55), pillarY),
          yaw: frame.yaw,
          scale: { x: 0.92, y: pillarHeight, z: 0.92 },
        });
      }
    }

    supports.add(this.createScaledInstancedBoxes(crossheads, this.materials.concrete));
    supports.add(this.createScaledInstancedBoxes(pillars, this.materials.concrete));
    parent.add(supports);
  }

  createRibbonMesh(halfWidth, y, material, segments, curve = this.curve, length = this.trackLength, closed = true) {
    const vertices = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= segments; i += 1) {
      const s = (i / segments) * length;
      const frame = this.getFrameOnCurve(curve, length, s, closed);
      const width = typeof halfWidth === "function" ? halfWidth(frame.s, frame) : halfWidth;
      const bounds = typeof width === "object" && width
        ? width
        : { left: -width, right: width };
      const left = this.offsetPoint(frame, bounds.left, y);
      const right = this.offsetPoint(frame, bounds.right, y);
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
    if (this.shouldUseShutokuBarrier(frame.s, side)) {
      this.addShutokuBarrierSegment(parent, frame, side, length, batch);
      return;
    }

    const railOffset = this.getRailOffsetForFrame(frame, side);
    const upper = this.offsetPoint(frame, railOffset * side, GUARDRAIL_MODEL.upper.y);
    const lower = this.offsetPoint(frame, railOffset * side, GUARDRAIL_MODEL.lower.y);
    const post = this.offsetPoint(frame, railOffset * side, GUARDRAIL_MODEL.post.y);
    const reflector = this.offsetPoint(
      frame,
      side * (railOffset - GUARDRAIL_MODEL.reflector.inset),
      GUARDRAIL_MODEL.reflector.y,
    );

    if (batch) {
      batch.upper.push({ position: upper, yaw: frame.yaw, s: frame.s });
      batch.lower.push({ position: lower, yaw: frame.yaw, s: frame.s });
      batch.posts.push({ position: post, yaw: frame.yaw, s: frame.s });
      if (Math.floor(frame.s / 40.5) % 2 === 0) {
        const target = side < 0 ? batch.amber : batch.red;
        target.push({ position: reflector, yaw: frame.yaw, s: frame.s });
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

  createSidewalkEdgeWalls(parent) {
    const walls = new THREE.Group();
    walls.name = "SidewalkEdgeLowWalls";

    const wallInstances = [];
    const capInstances = [];
    for (let s = 0; s < this.trackLength; s += SIDEWALK_EDGE_WALL_MODEL.length) {
      const frame = this.getFrameAtDistance(s);
      for (const side of [-1, 1]) {
        if (this.isServiceOpening(frame.s, side) || this.isJunctionOpening(frame.s, side)) {
          continue;
        }

        const lateral = side * SIDEWALK_EDGE_WALL_MODEL.lateralOffset;
        wallInstances.push({
          position: this.offsetPoint(frame, lateral, SIDEWALK_EDGE_WALL_MODEL.y),
          yaw: frame.yaw,
          s: frame.s,
          scale: {
            x: SIDEWALK_EDGE_WALL_MODEL.width,
            y: SIDEWALK_EDGE_WALL_MODEL.height,
            z: SIDEWALK_EDGE_WALL_MODEL.length,
          },
          remodel: this.makeInfrastructureRemodelMeta(s, side, "Sidewalk edge low wall"),
        });
        capInstances.push({
          position: this.offsetPoint(frame, lateral, SIDEWALK_EDGE_WALL_MODEL.height + 0.08),
          yaw: frame.yaw,
          s: frame.s,
          scale: {
            x: SIDEWALK_EDGE_WALL_MODEL.width + 0.16,
            y: 0.16,
            z: SIDEWALK_EDGE_WALL_MODEL.length,
          },
          remodel: this.makeInfrastructureRemodelMeta(s, side, "Sidewalk edge low wall cap"),
        });
      }
    }

    walls.add(this.createChunkedScaledInstancedBoxes(wallInstances, this.materials.sidewalkEdgeWall, false, false, this.trackLength, ROAD_DETAIL_CHUNK_LENGTH));
    walls.add(this.createChunkedScaledInstancedBoxes(capInstances, this.materials.shutokuBarrierBase, false, false, this.trackLength, ROAD_DETAIL_CHUNK_LENGTH));
    parent.add(walls);
  }

  shouldUseShutokuBarrier(s, side) {
    if (this.isTunnelDistance(s)) {
      return false;
    }
    return this.getRoadsideBarrierType(s, side) === "barrier";
  }

  getRoadsideBarrierType(s, side) {
    const range = this.getRouteRangeAtDistance(s);
    return side < 0
      ? normalizeRoadBarrierType(range?.leftBarrier)
      : normalizeRoadBarrierType(range?.rightBarrier);
  }

  addShutokuBarrierSegment(parent, frame, side, length, batch = null) {
    const lateral = this.getRailOffsetForFrame(frame, side) * side;
    const wall = {
      position: this.offsetPoint(frame, lateral, SHUTOKU_BARRIER_MODEL.wall.y),
      yaw: frame.yaw,
      s: frame.s,
      scale: {
        x: SHUTOKU_BARRIER_MODEL.wall.width,
        y: SHUTOKU_BARRIER_MODEL.wall.height,
        z: length,
      },
    };
    const base = {
      position: this.offsetPoint(frame, lateral, SHUTOKU_BARRIER_MODEL.base.y),
      yaw: frame.yaw,
      s: frame.s,
      scale: {
        x: SHUTOKU_BARRIER_MODEL.base.width,
        y: SHUTOKU_BARRIER_MODEL.base.height,
        z: length,
      },
    };
    if (batch) {
      batch.shutokuWalls.push(wall);
      batch.shutokuBases.push(base);
      return;
    }

    this.addOrientedBox(parent, wall.scale.x, wall.scale.y, wall.scale.z, this.materials.shutokuBarrier, wall.position, wall.yaw);
    this.addOrientedBox(parent, base.scale.x, base.scale.y, base.scale.z, this.materials.shutokuBarrierBase, base.position, base.yaw);
  }

  isTunnelDistance(s, margin = 0) {
    const trackLength = Math.max(1, this.trackLength || 1);
    const distance = ((s % trackLength) + trackLength) % trackLength;
    return this.tunnelRuns.some((run) => {
      const start = (((Number(run.start) || 0) - margin) % trackLength + trackLength) % trackLength;
      const length = Math.max(0, (Number(run.length) || 0) + margin * 2);
      if (length >= trackLength) {
        return true;
      }
      return (distance - start + trackLength) % trackLength <= length;
    });
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
    this.addSpawnCityBuildings(meet);
    this.addServiceLotDetails(meet);
    this.scene.add(meet);
  }

  addSpawnCityBuildings(parent) {
    const urbanPadMaterial = this.materials.cityGround;
    parent.add(makeBox(172, 0.1, 136, urbanPadMaterial, new THREE.Vector3(-90, -0.045, -102)));
    parent.add(makeBox(126, 0.1, 82, urbanPadMaterial, new THREE.Vector3(-156, -0.045, -34)));
    parent.add(makeBox(132, 0.1, 78, urbanPadMaterial, new THREE.Vector3(-84, -0.045, 42)));
    const placements = [
      { x: -151, z: -45, type: "office", scale: 0.82, yaw: 0.04 },
      { x: -153, z: -94, type: "parking", scale: 0.72, yaw: -0.08 },
      { x: -101, z: -129, type: "corner", scale: 0.8, yaw: 0.02 },
      { x: -51, z: -132, type: "thinTower", scale: 0.74, yaw: -0.05 },
      { x: -14, z: -102, type: "slab", scale: 0.78, yaw: 0.07 },
      { x: -43, z: 40, type: "mall", scale: 0.7, yaw: -0.03 },
      { x: -100, z: 42, type: "stepped", scale: 0.74, yaw: 0.06 },
      { x: -163, z: 18, type: "concreteTower", scale: 0.68, yaw: -0.02 },
      { x: -188, z: -65, type: "thinTower", scale: 0.62, yaw: 0.05 },
      { x: -183, z: -116, type: "slab", scale: 0.66, yaw: -0.04 },
      { x: -132, z: -142, type: "warehouse", scale: 0.64, yaw: 0.03 },
      { x: -64, z: -166, type: "parking", scale: 0.62, yaw: -0.06 },
    ];
    const district = new THREE.Group();
    district.name = "SpawnCityBlocks";

    for (const placement of placements) {
      const type = BUILDING_TYPES.find((item) => item.id === placement.type) ?? BUILDING_TYPES[0];
      const scale = placement.scale ?? 1;
      if (this.isSpawnBuildingInRoad(placement, type, scale)) {
        continue;
      }
      const group = new THREE.Group();
      group.name = `SpawnBuilding_${type.id}_${Math.round(placement.x)}_${Math.round(placement.z)}`;
      group.position.set(placement.x, 0, placement.z);
      group.rotation.y = placement.yaw ?? 0;
      this.buildBuildingType(group, type, scale, placement.x < -62 ? -1 : 1);
      group.traverse((object) => {
        if (object.isMesh) {
          object.userData.remodelIgnore = true;
        }
      });
      district.add(group);
      this.addCollider(placement.x, placement.z, type.width * scale + 3, type.depth * scale + 3);
    }

    parent.add(district);
  }

  isSpawnBuildingInRoad(placement, type, scale) {
    const road = this.getNearestRoadInfo(new THREE.Vector3(placement.x, 0, placement.z));
    if (!road || road.distance > 72) {
      return false;
    }

    const width = type.width * scale;
    const depth = type.depth * scale;
    const clearance = ROAD_HALF_WIDTH + Math.max(width, depth) * 0.5 + 4;
    return Math.abs(road.lateral) < clearance && Math.abs(road.forward) < depth * 0.5 + 18;
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
        const light = new THREE.PointLight(0xffdca3, 6.8, 34, 1.28);
        light.position.set(x, 5.8, z);
        light.castShadow = true;
        light.shadow.mapSize.set(512, 512);
        light.shadow.camera.near = 0.35;
        light.shadow.camera.far = 36;
        light.userData.baseIntensity = 6.8;
        this.garageLights.push(light);
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

  createChunkedInstancedBoxes(instances, width, height, depth, material, castShadow = false, routeLength = this.trackLength, chunkLength = ROAD_DETAIL_CHUNK_LENGTH) {
    if (!instances.length) {
      return new THREE.Group();
    }

    const chunks = this.chunkInstancesByDistance(instances, routeLength, chunkLength);
    if (chunks.length === 1) {
      return this.createInstancedBoxes(chunks[0], width, height, depth, material, castShadow);
    }

    const group = new THREE.Group();
    for (const chunk of chunks) {
      group.add(this.registerCullableChunk(
        this.createInstancedBoxes(chunk, width, height, depth, material, castShadow),
        chunk,
        routeLength,
        chunkLength,
      ));
    }
    return group;
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

  createChunkedScaledInstancedBoxes(instances, material, castShadow = false, remodelIgnore = true, routeLength = this.trackLength, chunkLength = CITY_DETAIL_CHUNK_LENGTH) {
    if (!instances.length) {
      return new THREE.Group();
    }

    const chunks = this.chunkInstancesByDistance(instances, routeLength, chunkLength);
    if (chunks.length === 1) {
      return this.createScaledInstancedBoxes(chunks[0], material, castShadow, remodelIgnore);
    }

    const group = new THREE.Group();
    for (const chunk of chunks) {
      group.add(this.registerCullableChunk(
        this.createScaledInstancedBoxes(chunk, material, castShadow, remodelIgnore),
        chunk,
        routeLength,
        chunkLength,
      ));
    }
    return group;
  }

  registerCullableChunk(object, chunk, routeLength = this.trackLength, chunkLength = ROAD_DETAIL_CHUNK_LENGTH) {
    if (!object || !chunk?.length) {
      return object;
    }

    const safeRouteLength = Math.max(1, routeLength || this.trackLength || 1);
    const isMainRouteChunk = Math.abs(safeRouteLength - this.trackLength) < 1;
    if (!isMainRouteChunk) {
      return object;
    }

    object.userData.chunkCenterS = chunk.centerS ?? 0;
    object.userData.chunkRouteLength = safeRouteLength;
    object.userData.chunkRadius = Math.max(160, chunkLength * 0.58);
    object.userData.performanceCull = true;
    this.cullableChunks.push(object);
    return object;
  }

  updateChunkVisibility(focusS = 0, viewDistance = this.chunkVisibilityRange) {
    if (!this.cullableChunks.length) {
      return;
    }

    const baseRange = this.ultraGraphics
      ? Math.max(this.chunkVisibilityRange, viewDistance * 1.35)
      : Math.min(this.chunkVisibilityRange, Math.max(620, viewDistance * 0.95));
    for (const chunk of this.cullableChunks) {
      const routeLength = chunk.userData.chunkRouteLength ?? this.trackLength;
      const distance = this.loopDistanceOnLength(focusS, chunk.userData.chunkCenterS ?? 0, routeLength);
      const visible = distance <= baseRange + (chunk.userData.chunkRadius ?? 0);
      if (chunk.visible !== visible) {
        chunk.visible = visible;
      }
    }
  }

  chunkInstancesByDistance(instances, routeLength = this.trackLength, chunkLength = ROAD_DETAIL_CHUNK_LENGTH) {
    const length = Math.max(1, routeLength || this.trackLength || 1);
    const chunkSize = Math.max(120, chunkLength);
    const chunkCount = Math.max(1, Math.ceil(length / chunkSize));
    const chunks = Array.from({ length: chunkCount }, () => []);

    for (const instance of instances) {
      const rawS = Number(instance.s);
      const normalizedS = Number.isFinite(rawS)
        ? ((rawS % length) + length) % length
        : 0;
      const index = clamp(Math.floor(normalizedS / chunkSize), 0, chunkCount - 1);
      chunks[index].push(instance);
    }

    return chunks
      .map((chunk, index) => {
        chunk.centerS = (index + 0.5) * chunkSize;
        return chunk;
      })
      .filter((chunk) => chunk.length);
  }

  loopDistanceOnLength(a, b, length = this.trackLength) {
    const safeLength = Math.max(1, length || this.trackLength || 1);
    const distance = Math.abs((((a - b) % safeLength) + safeLength) % safeLength);
    return Math.min(distance, safeLength - distance);
  }

  createRoadsideInfrastructure(parent) {
    const details = new THREE.Group();
    details.name = "RoadsideCityInfrastructure";

    const poles = [];
    const arms = [];
    const heads = [];
    const glowHeads = [];

    for (let s = 36; s < this.trackLength; s += CITY_STREETLIGHT_INTERVAL) {
      const frame = this.getFrameAtDistance(s);
      if (this.isTunnelDistance(frame.s)) {
        continue;
      }
      for (const side of [-1, 1]) {
        if (this.isCityServiceClearance(frame.s, side) || this.isJunctionOpening(frame.s, side)) {
          continue;
        }

        const polePosition = this.offsetPoint(frame, side * CITY_STREETLIGHT_POLE_OFFSET, 3.05);
        const armPosition = this.offsetLocalPoint(polePosition, frame.yaw, -side * 0.78, 0, 5.92);
        const headPosition = this.offsetLocalPoint(polePosition, frame.yaw, -side * 1.55, 0, 5.88);
        const glowPosition = this.offsetLocalPoint(polePosition, frame.yaw, -side * 1.58, 0, 5.72);
        const remodel = this.makeInfrastructureRemodelMeta(s, side, "Road streetlight");
        const base = { yaw: frame.yaw, s, remodel };
        poles.push({
          ...base,
          position: polePosition,
          scale: { x: 0.22, y: 6.1, z: 0.22 },
        });
        arms.push({
          ...base,
          position: armPosition,
          scale: { x: 1.65, y: 0.16, z: 0.16 },
        });
        heads.push({
          ...base,
          position: headPosition,
          scale: { x: 0.74, y: 0.24, z: 0.42 },
        });
        glowHeads.push({
          ...base,
          position: glowPosition,
          scale: { x: 0.42, y: 0.08, z: 0.26 },
        });

        this.roadLightSlots.push({
          s,
          x: glowPosition.x,
          y: glowPosition.y,
          z: glowPosition.z,
          color: 0xfff1d8,
          range: 132,
          decay: 1.02,
          baseIntensity: 15.5,
          alwaysOn: false,
        });
      }
    }

    details.add(this.createChunkedScaledInstancedBoxes(poles, this.materials.streetlightPole, false, false, this.trackLength, CITY_NEAR_DETAIL_CHUNK_LENGTH));
    details.add(this.createChunkedScaledInstancedBoxes(arms, this.materials.streetlightPole, false, false, this.trackLength, CITY_NEAR_DETAIL_CHUNK_LENGTH));
    details.add(this.createChunkedScaledInstancedBoxes(heads, this.materials.railDark, false, false, this.trackLength, CITY_NEAR_DETAIL_CHUNK_LENGTH));
    details.add(this.createChunkedScaledInstancedBoxes(glowHeads, this.materials.streetlightGlow, false, false, this.trackLength, CITY_NEAR_DETAIL_CHUNK_LENGTH));
    parent.add(details);
  }

  makeInfrastructureRemodelMeta(s, side, label) {
    return {
      remodelCategory: "infrastructure",
      remodelFixedId: `streetlight:${Math.round(s)}:${side}:${label.toLowerCase().replaceAll(" ", "-")}`,
      remodelLabel: label,
    };
  }

  createExpresswaySigns(parent) {
    const signs = new THREE.Group();
    signs.name = "ShutokuExpresswaySigns";

    const poleMaterial = this.materials.streetlightPole;
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0xd5dde1,
      roughness: 0.48,
      metalness: 0.22,
      flatShading: true,
    });
    frameMaterial.name = "expresswaySignFrame";

    for (const placement of [...ROAD_SIGN_PLACEMENTS, ...ADDITIONAL_ROAD_SIGN_PLACEMENTS]) {
      const frame = this.getFrameAtDistance(placement.s);
      if (this.isTunnelDistance(frame.s)) {
        this.addTunnelCeilingExpresswaySign(signs, frame, placement, poleMaterial, frameMaterial);
      } else if (placement.type === "gantry") {
        this.addOverheadExpresswaySign(signs, frame, placement, poleMaterial, frameMaterial);
      } else {
        this.addRoadsideExpresswaySign(signs, frame, placement, poleMaterial, frameMaterial);
      }
    }

    parent.add(signs);
  }

  addRoadsideExpresswaySign(parent, frame, placement, poleMaterial, frameMaterial) {
    const side = placement.side ?? 1;
    const group = new THREE.Group();
    group.name = `RoadsideSign_${Math.round(frame.s)}`;
    group.position.copy(this.offsetPoint(frame, side * ROADSIDE_SIGN_OFFSET, 0));
    group.rotation.y = frame.yaw;

    this.addLocalBox(group, 0.28, 5.2, 0.28, poleMaterial, 0, 2.6, 0);
    this.addLocalBox(group, 0.72, 0.28, 0.2, frameMaterial, -side * 0.36, 5.1, 0);
    this.addLocalBox(group, 4.45, 0.22, 0.16, frameMaterial, -side * 2.38, 5.1, 0);
    this.addSignBoard(
      group,
      -side * 3.65,
      5.2,
      -0.12,
      4.7,
      2.55,
      placement,
      Math.PI,
    );

    parent.add(group);
  }

  addTunnelCeilingExpresswaySign(parent, frame, placement, poleMaterial, frameMaterial) {
    const group = new THREE.Group();
    group.name = `TunnelCeilingSign_${Math.round(frame.s)}`;
    group.position.copy(this.offsetPoint(frame, 0, 0));
    group.rotation.y = frame.yaw;

    const ceilingY = 7.85;
    const boardY = 6.62;
    const width = placement.type === "gantry" ? 9.2 : 5.4;
    this.addLocalBox(group, 0.16, ceilingY - boardY + 0.3, 0.16, poleMaterial, -width * 0.42, (ceilingY + boardY) * 0.5, -0.1);
    this.addLocalBox(group, 0.16, ceilingY - boardY + 0.3, 0.16, poleMaterial, width * 0.42, (ceilingY + boardY) * 0.5, -0.1);
    this.addLocalBox(group, width + 0.72, 0.18, 0.18, frameMaterial, 0, ceilingY, -0.1);
    this.addLocalBox(group, width + 0.42, 0.18, 0.14, frameMaterial, 0, boardY + 1.36, -0.1);
    this.addSignBoard(group, 0, boardY, -0.18, width, 2.28, placement, Math.PI);

    parent.add(group);
  }

  addOverheadExpresswaySign(parent, frame, placement, poleMaterial, frameMaterial) {
    const group = new THREE.Group();
    group.name = `OverheadSign_${Math.round(frame.s)}`;
    group.position.copy(this.offsetPoint(frame, 0, 0));
    group.rotation.y = frame.yaw;

    const postX = ROAD_HALF_WIDTH + 5.35;
    const postHeight = 8.35;
    this.addLocalBox(group, 0.42, postHeight, 0.42, poleMaterial, -postX, postHeight * 0.5, 0);
    this.addLocalBox(group, 0.42, postHeight, 0.42, poleMaterial, postX, postHeight * 0.5, 0);
    this.addLocalBox(group, postX * 2 + 0.7, 0.42, 0.42, poleMaterial, 0, postHeight, 0);
    this.addLocalBox(group, 0.16, 2.05, 0.16, frameMaterial, -4.8, postHeight - 0.88, -0.16);
    this.addLocalBox(group, 0.16, 2.05, 0.16, frameMaterial, 4.8, postHeight - 0.88, -0.16);
    this.addSignBoard(group, 0, postHeight - 1.75, -0.24, 10.4, 2.45, placement, Math.PI);

    parent.add(group);
  }

  addSignBoard(parent, x, y, z, width, height, placement, rotationY = 0) {
    const panels = this.getExpresswaySignPanels(placement, width);
    let firstBoard = null;

    // One shared material for every sign backing: a fresh material per panel
    // forced a separate draw/material switch per sign and blocked merging.
    this.signBackingMaterial ??= new THREE.MeshStandardMaterial({
      color: 0x1f2b28,
      roughness: 0.62,
      metalness: 0.05,
      flatShading: true,
      name: "expresswaySignBacking",
    });

    for (const panel of panels) {
      const panelX = x + panel.x;
      const backing = this.addLocalBox(
        parent,
        panel.width + 0.26,
        height + 0.22,
        0.14,
        this.signBackingMaterial,
        panelX,
        y,
        z + 0.03,
      );
      backing.name = "expresswaySignBacking";

      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(panel.width, height),
        this.createExpresswaySignMaterial(panel.placement),
      );
      board.name = "expresswaySignFace";
      board.position.set(panelX, y, z - 0.06);
      board.rotation.y = rotationY;
      board.castShadow = false;
      board.receiveShadow = false;
      parent.add(board);
      firstBoard = firstBoard ?? board;
    }

    return firstBoard;
  }

  getExpresswaySignPanels(placement, width) {
    if (placement.type !== "gantry" || width < 8) {
      return [{ x: 0, width, placement }];
    }

    const variant = Math.floor(cityNoise(placement.s * 0.021 + 7.2) * 5);
    const lineGroups = this.splitSignLines(placement.lines ?? [], variant);
    if (variant === 0) {
      return [{ x: 0, width, placement }];
    }
    if (variant === 1) {
      return [
        { x: -2.75, width: 4.65, placement: this.makePanelPlacement(placement, lineGroups[0], "左") },
        { x: 2.8, width: 4.45, placement: this.makePanelPlacement(placement, lineGroups[1], "右") },
      ];
    }
    if (variant === 2) {
      return [
        { x: -3.55, width: 3.0, placement: this.makePanelPlacement(placement, lineGroups[0], "A") },
        { x: 0, width: 3.0, placement: this.makePanelPlacement(placement, lineGroups[1], "B") },
        { x: 3.55, width: 3.0, placement: this.makePanelPlacement(placement, lineGroups[2], "C") },
      ];
    }
    if (variant === 3) {
      return [{ x: -2.65, width: 4.6, placement: this.makePanelPlacement(placement, lineGroups[0], "左") }];
    }
    return [{ x: 2.65, width: 4.6, placement: this.makePanelPlacement(placement, lineGroups[0], "右") }];
  }

  splitSignLines(lines, variant) {
    if (variant === 2) {
      return [
        [lines[0] ?? "都心"],
        [lines[1] ?? "出口"],
        [lines[2] ?? "方面"],
      ];
    }
    if (variant === 3 || variant === 4) {
      return [[lines[variant === 3 ? 0 : lines.length - 1] ?? lines[0] ?? "出口"]];
    }
    const middle = Math.max(1, Math.ceil(lines.length / 2));
    return [
      lines.slice(0, middle),
      lines.slice(middle).length ? lines.slice(middle) : [lines[0] ?? "方面"],
    ];
  }

  makePanelPlacement(placement, lines, suffix) {
    return {
      ...placement,
      title: placement.title,
      route: suffix ? `${placement.route} ${suffix}` : placement.route,
      lines,
    };
  }

  createExpresswaySignMaterial(placement) {
    const palettes = {
      direction: { background: "#087243", border: "#dfeee6", text: "#ffffff", badge: "#f0f6ef" },
      exit: { background: "#0b6f45", border: "#f3f6e8", text: "#ffffff", badge: "#ffe46a" },
      junction: { background: "#075f78", border: "#e6f4f8", text: "#ffffff", badge: "#ffffff" },
      route: { background: "#154d86", border: "#e7f2ff", text: "#ffffff", badge: "#ffffff" },
      warning: { background: "#d3a51b", border: "#2d2410", text: "#1f1b12", badge: "#1f1b12" },
      pa: { background: "#2f6d9a", border: "#e6f6ff", text: "#ffffff", badge: "#ffffff" },
    };
    const palette = palettes[placement.theme ?? "direction"] ?? palettes.direction;
    const texture = makeCanvasTexture((ctx, canvas) => {
      ctx.fillStyle = palette.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = palette.border;
      ctx.lineWidth = 7;
      ctx.strokeRect(9, 9, canvas.width - 18, canvas.height - 18);
      if (placement.theme === "warning") {
        ctx.fillStyle = "rgba(255, 244, 185, 0.34)";
        ctx.fillRect(16, 16, canvas.width - 32, 34);
      }
      ctx.fillStyle = placement.theme === "warning" ? palette.text : palette.border;
      ctx.font = "bold 22px system-ui, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(placement.title, 20, 31);
      ctx.font = "bold 17px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(placement.route, canvas.width - 76, 31);
      ctx.textAlign = "left";
      ctx.fillStyle = palette.text;
      ctx.font = "bold 23px system-ui, sans-serif";
      const lines = placement.lines ?? [];
      for (let i = 0; i < lines.length; i += 1) {
        ctx.fillText(lines[i], 22, 65 + i * 26);
      }
      ctx.fillStyle = palette.badge;
      ctx.beginPath();
      ctx.moveTo(canvas.width - 34, canvas.height - 27);
      ctx.lineTo(canvas.width - 20, canvas.height - 39);
      ctx.lineTo(canvas.width - 20, canvas.height - 15);
      ctx.closePath();
      ctx.fill();
    });
    texture.anisotropy = this.ultraGraphics ? 8 : 2;
    return new THREE.MeshBasicMaterial({
      map: texture,
      color: 0xffffff,
      side: THREE.DoubleSide,
    });
  }

  createHorizonBuildings(parent) {
    const horizonGroup = new THREE.Group();
    horizonGroup.name = "HorizonSkyline";
    const steps = 180;
    const lateral = 1400;
    const height = 320 * CITY_BUILDING_HEIGHT_SCALE;
    const width = 90;
    const depth = 90;
    const material = new THREE.MeshStandardMaterial({ color: 0x2a3035, roughness: 0.9, flatShading: true });
    const buildings = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const distance = t * this.trackLength;
      const frame = this.getFrameAtDistance(distance);
      const pos = this.offsetPoint(frame, lateral, 0);
      buildings.push({
        position: new THREE.Vector3(pos.x, height * 0.5, pos.z),
        yaw: frame.yaw,
        s: distance,
        scale: { x: width, y: height, z: depth },
      });
    }
    horizonGroup.add(this.createChunkedScaledInstancedBoxes(buildings, material, false, true, this.trackLength, ROAD_DETAIL_CHUNK_LENGTH * 2));
    parent.add(horizonGroup);
  }

  createMountainBackdrop(parent) {
    const mountains = new THREE.Group();
    mountains.name = "DistantMountainBackdrop";

    for (const side of [-1, 1]) {
      mountains.add(this.createMountainRidge(side, CITY_MOUNTAIN_INNER_LATERAL, 42, 150, 62, this.materials.mountain));
      mountains.add(this.createMountainRidge(side, CITY_MOUNTAIN_OUTER_LATERAL, 18, 115, 89, this.materials.mountainFar));
    }

    parent.add(mountains);
  }

  createMountainRidge(side, lateral, baseHeight, peakHeight, seedOffset, material) {
    const segments = 220;
    const vertices = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      const distance = t * this.trackLength;
      const frame = this.getFrameAtDistance(distance);
      const foot = this.offsetPoint(frame, side * lateral, 0);
      const crest = this.offsetPoint(frame, side * lateral, 0);
      const ridgeNoise = cityNoise(seedOffset + i * 1.73);
      const shoulderNoise = cityNoise(seedOffset + i * 0.61 + 14.2);
      crest.y = baseHeight + peakHeight * (0.46 + ridgeNoise * 0.54) + shoulderNoise * 34;

      vertices.push(foot.x, foot.y, foot.z, crest.x, crest.y, crest.z);
      uvs.push(t, 0, t, 1);

      if (i < segments) {
        const a = i * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  }

  createFixedCityscape(parent) {
    const city = new THREE.Group();
    city.name = "FixedRoadsideCityscape";
    city.position.y = CITY_RELATIVE_ELEVATION;

    this.cityBuildingFootprints = new Map();
    for (const placement of CITY_BUILDING_PLACEMENTS) {
      this.reserveCityFootprint(this.createManualCityFootprint(placement));
    }

    this.createProceduralRoadsideDistrict(city);
    this.createMountainBackdrop(city);
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
    const roofBeacons = [];
    const billboardPosts = [];
    const billboardPads = [];
    const billboardGroup = new THREE.Group();
    billboardGroup.name = "JapaneseCityBillboards";
    const billboardPlacements = [];

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
            roofBeacons,
            billboardPosts,
            billboardPads,
            billboardGroup,
            billboardPlacements,
            row,
            rowIndex,
            side,
            s: shiftedS,
            seed,
          });
        }
      }
    }
    this.addDedicatedHighwayBillboards(billboardGroup, billboardPads, billboardPosts, billboardPlacements);

    for (let i = 0; i < bodyBatches.length; i += 1) {
      district.add(this.createChunkedScaledInstancedBoxes(bodyBatches[i], this.makeFacadeMaterial(CITY_FACADE_PALETTE[i], 0.82, 0.04), false, false, this.trackLength, CITY_NEAR_DETAIL_CHUNK_LENGTH));
    }
    district.add(this.createChunkedScaledInstancedBoxes(roofs, this.materials.buildingTrim, false, false, this.trackLength, CITY_NEAR_DETAIL_CHUNK_LENGTH));
    district.add(this.createChunkedScaledInstancedBoxes(glass, this.materials.buildingWindow, false, false, this.trackLength, CITY_NEAR_DETAIL_CHUNK_LENGTH));
    district.add(this.createChunkedScaledInstancedBoxes(warmWindows, this.materials.buildingWindowWarm, false, false, this.trackLength, CITY_NEAR_DETAIL_CHUNK_LENGTH));
    district.add(this.createChunkedScaledInstancedBoxes(trim, this.materials.buildingGlassDark, false, false, this.trackLength, CITY_NEAR_DETAIL_CHUNK_LENGTH));
    district.add(this.createChunkedScaledInstancedBoxes(signs, this.materials.tunnelSign, false, false));
    district.add(this.createChunkedScaledInstancedBoxes(roofBeacons, this.materials.aviationBeacon, false, false));
    district.add(this.createChunkedScaledInstancedBoxes(billboardPads, this.materials.shutokuBarrierBase, false, false, this.trackLength, CITY_NEAR_DETAIL_CHUNK_LENGTH));
    district.add(this.createChunkedScaledInstancedBoxes(billboardPosts, this.materials.railDark, false, false, this.trackLength, CITY_NEAR_DETAIL_CHUNK_LENGTH));
    district.add(billboardGroup);
    parent.add(district);
  }

  addProceduralCityBlock(batches) {
    const {
      bodyBatches,
      roofs,
      glass,
      warmWindows,
      trim,
      signs,
      roofBeacons,
      billboardPosts,
      billboardPads,
      billboardGroup,
      billboardPlacements,
      row,
      rowIndex,
      side,
      s,
      seed,
    } = batches;
    const frame = this.getFrameAtDistance(s);
    let width = cityRange(seed + 1.7, row.width[0], row.width[1]);
    let depth = cityRange(seed + 2.9, row.depth[0], row.depth[1]);
    const footprintStyle = cityNoise(seed + 2.35);
    if (footprintStyle < 0.3) {
      const blockSize = (width + depth) * 0.5;
      width = blockSize * cityRange(seed + 2.42, 0.88, 1.08);
      depth = blockSize * cityRange(seed + 2.51, 0.9, 1.12);
    } else if (footprintStyle < 0.62) {
      width *= cityRange(seed + 2.42, 1.18, 1.58);
      depth *= cityRange(seed + 2.51, 0.68, 0.92);
    } else if (footprintStyle < 0.86) {
      width *= cityRange(seed + 2.42, 0.66, 0.9);
      depth *= cityRange(seed + 2.51, 1.12, 1.52);
    }
    const towerChance = rowIndex >= 4 && cityNoise(seed + 3.35) > 0.82;
    const skylineBoost = towerChance ? cityRange(seed + 3.85, 1.28, rowIndex >= 8 ? 1.82 : 1.58) : 1;
    const height = cityRange(seed + 4.1, row.height[0], row.height[1]) * (rowIndex >= 3 ? 1.08 : 1) * skylineBoost * CITY_BUILDING_HEIGHT_SCALE;
    const lateral = side * (ROAD_HALF_WIDTH + row.lateral + width * 0.5 + cityRange(seed + 5.5, -row.lateralJitter, row.lateralJitter));
    const forward = cityRange(seed + 6.7, -row.forwardJitter, row.forwardJitter);
    const base = this.offsetAlong(frame, lateral, forward, 0);
    const yaw = frame.yaw + cityRange(seed + 7.9, -0.075, 0.075);
    const paletteIndex = Math.floor(cityNoise(seed + 8.3) * CITY_FACADE_PALETTE.length) % CITY_FACADE_PALETTE.length;
    const bodyHeight = height * cityRange(seed + 9.7, towerChance ? 0.96 : 0.88, towerChance ? 1.08 : 1.04);
    if (this.isBuildingNearBranchRoad(base, Math.max(width, depth) * 0.58 + 30 + rowIndex * 1.5)) {
      return;
    }
    const footprint = {
      side,
      s: (s + forward + this.trackLength) % this.trackLength,
      lateral: Math.abs(lateral),
      halfForward: depth * 0.5 + 2.4 + rowIndex * 0.35,
      halfLateral: width * 0.5 + 1.8,
    };
    if (!this.reserveCityFootprint(footprint)) {
      return;
    }

    const buildingId = `building:city:${rowIndex}:${side > 0 ? "r" : "l"}:${Math.round(s)}`;
    const buildingLabel = `Building ${rowIndex + 1}.${Math.round(s)}`;
    bodyBatches[paletteIndex].push({
      position: new THREE.Vector3(base.x, bodyHeight * 0.5, base.z),
      yaw,
      s,
      scale: { x: width, y: bodyHeight, z: depth },
      remodel: this.makeBuildingRemodelMeta(buildingId, buildingLabel, "body", true),
    });
    roofs.push({
      position: new THREE.Vector3(base.x, bodyHeight + 0.18, base.z),
      yaw,
      s,
      scale: { x: width * (towerChance ? 0.92 : 1.04), y: towerChance ? 0.72 : 0.36, z: depth * (towerChance ? 0.92 : 1.04) },
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
      s,
    });

    if (height > 44 && (towerChance || cityNoise(seed + 18.2) > 0.5)) {
      const roofDetail = this.offsetLocalPoint(base, yaw, cityRange(seed + 19.1, -width * 0.24, width * 0.24), cityRange(seed + 19.9, -depth * 0.24, depth * 0.24), bodyHeight + 1.05);
      trim.push({
        position: roofDetail,
        yaw,
        s,
        scale: {
          x: width * cityRange(seed + 20.1, towerChance ? 0.12 : 0.16, towerChance ? 0.24 : 0.34),
          y: cityRange(seed + 21.2, towerChance ? 3.2 : 1.1, towerChance ? 8.6 : 2.4),
          z: depth * cityRange(seed + 22.3, towerChance ? 0.1 : 0.12, towerChance ? 0.22 : 0.28),
        },
        remodel: this.makeBuildingRemodelMeta(buildingId, buildingLabel, "trim"),
      });
    }

    if (bodyHeight > 70 && cityNoise(seed + 31.4) > 0.28) {
      const beaconInset = 1.35;
      const beaconX = Math.max(0.8, width * 0.5 - beaconInset);
      const beaconZ = Math.max(0.8, depth * 0.5 - beaconInset);
      const beaconCorners = [
        [-beaconX, -beaconZ],
        [beaconX, -beaconZ],
        [-beaconX, beaconZ],
        [beaconX, beaconZ],
      ];
      for (const [localX, localZ] of beaconCorners) {
        roofBeacons.push({
          position: this.offsetLocalPoint(base, yaw, localX, localZ, bodyHeight + 1.18),
          yaw,
          s,
          scale: { x: 1.25, y: 0.72, z: 1.25 },
          remodel: this.makeBuildingRemodelMeta(buildingId, buildingLabel, "aviation-beacon"),
        });
      }
    }

    this.addProceduralCityBillboards({
      billboardGroup,
      billboardPads,
      billboardPosts,
      base,
      yaw,
      width,
      depth,
      bodyHeight,
      lateral,
      forward,
      side,
      rowIndex,
      seed,
      s,
      buildingId,
      buildingLabel,
    });
  }

  addDedicatedHighwayBillboards(billboardGroup, billboardPads, billboardPosts, billboardPlacements = []) {
    for (let s = 120; s < this.trackLength; s += 230) {
      for (const side of [-1, 1]) {
        const seed = s * 0.41 + (side > 0 ? 19.7 : 53.2);
        if (this.isCityServiceClearance(s, side) || this.isJunctionOpening(s, side) || cityNoise(seed + 0.8) < 0.18) {
          continue;
        }
        const frame = this.getFrameAtDistance(s + cityRange(seed + 1.2, -34, 34));
        const boardWidth = cityRange(seed + 2.3, 10.5, 28.5);
        const boardHeight = cityRange(seed + 3.4, 4.2, 10.6);
        const postHeight = cityRange(seed + 4.5, 3.9, 8.4);
        const lateral = side * cityRange(seed + 5.6, ROAD_HALF_WIDTH + 12, ROAD_HALF_WIDTH + 34);
        const forward = cityRange(seed + 6.7, -15, 15);
        const yaw = frame.yaw - side * Math.PI * 0.5 + cityRange(seed + 7.8, -0.16, 0.16);
        const base = this.offsetAlong(frame, lateral, forward, 0);
        const padS = (frame.s + forward + this.trackLength) % this.trackLength;
        if (!this.reserveBillboardPlacement(billboardPlacements, padS, side, Math.abs(lateral), 210)) {
          continue;
        }

        billboardPads.push({
          position: this.offsetLocalPoint(base, yaw, 0, 0, 0.04),
          yaw,
          s: padS,
          scale: { x: boardWidth + 2.2, y: 0.1, z: 6.6 },
        });
        for (const postX of [-boardWidth * 0.36, boardWidth * 0.36]) {
          billboardPosts.push({
            position: this.offsetLocalPoint(base, yaw, postX, 0, postHeight * 0.5),
            yaw,
            s: padS,
            scale: { x: 0.28, y: postHeight, z: 0.28 },
          });
        }
        this.addJapaneseBillboardPlane(
          billboardGroup,
          this.offsetLocalPoint(base, yaw, 0, 0, postHeight + boardHeight * 0.52),
          yaw,
          boardWidth,
          boardHeight,
          seed + 8.9,
          `roadside-ad:${Math.round(s)}:${side}`,
          `Roadside billboard ${Math.round(s)}`,
        );
      }
    }
  }

  addProceduralCityBillboards({
    billboardGroup,
    billboardPads,
    billboardPosts,
    billboardPlacements,
    base,
    yaw,
    width,
    depth,
    bodyHeight,
    lateral,
    forward,
    side,
    rowIndex,
    seed,
    s,
    buildingId,
    buildingLabel,
  }) {
    if (!billboardGroup) {
      return;
    }

    const wallNoise = cityNoise(seed + 41.2);
    const wallMega = rowIndex >= 2 && cityNoise(seed + 41.9) > 0.76;
    let placedBuildingAd = false;
    if (rowIndex <= 6 && bodyHeight > 24 && depth > 13 && wallNoise > (wallMega ? 0.72 : 0.8)) {
      const boardWidth = wallMega
        ? clamp(depth * cityRange(seed + 42.1, 1.05, 1.55), 18.0, 42.0)
        : clamp(depth * cityRange(seed + 42.1, 0.68, 1.14), 9.5, 24.0);
      const boardHeight = wallMega
        ? clamp(bodyHeight * cityRange(seed + 43.3, 0.22, 0.34), 10.0, 26.0)
        : clamp(bodyHeight * cityRange(seed + 43.3, 0.15, 0.26), 4.8, 13.5);
      const y = clamp(
        cityRange(seed + 44.4, bodyHeight * 0.34, bodyHeight * 0.78),
        boardHeight * 0.5 + 7.0,
        bodyHeight - boardHeight * 0.5 - 2.0,
      );
      const z = 0;
      const x = -side * (width * 0.5 + 0.13);
      const position = this.offsetLocalPoint(base, yaw, x, z, y);
      const signS = (s + forward + z + this.trackLength) % this.trackLength;
      if (this.reserveBillboardPlacement(billboardPlacements, signS, side, Math.abs(lateral), wallMega ? 150 : 118)) {
        this.addJapaneseBillboardPlane(
          billboardGroup,
          position,
          yaw - side * Math.PI * 0.5,
          boardWidth,
          boardHeight,
          seed + 46.6,
          `${buildingId}:wall-ad`,
          `${buildingLabel} wall billboard`,
        );
        placedBuildingAd = true;
      }
    }

    const roofNoise = cityNoise(seed + 50.8);
    const roofMega = rowIndex >= 1 && cityNoise(seed + 50.1) > 0.7;
    if (!placedBuildingAd && rowIndex <= 7 && bodyHeight > 30 && width > 12 && roofNoise > (roofMega ? 0.78 : 0.84)) {
      const boardWidth = roofMega
        ? clamp(width * cityRange(seed + 51.2, 0.9, 1.35), 20.0, 46.0)
        : clamp(width * cityRange(seed + 51.2, 0.64, 1.04), 12.0, 27.0);
      const boardHeight = roofMega ? cityRange(seed + 52.4, 7.5, 13.0) : cityRange(seed + 52.4, 4.2, 7.6);
      const postHeight = roofMega ? cityRange(seed + 53.6, 6.0, 10.2) : cityRange(seed + 53.6, 3.4, 6.6);
      const localX = cityRange(seed + 54.1, -width * 0.18, width * 0.18);
      const localZ = cityRange(seed + 55.3, -depth * 0.22, depth * 0.22);
      const boardY = bodyHeight + postHeight + boardHeight * 0.52;
      const position = this.offsetLocalPoint(base, yaw, localX, localZ, boardY);
      const signYaw = yaw + cityRange(seed + 56.8, -0.08, 0.08);
      const signS = (s + forward + localZ + this.trackLength) % this.trackLength;
      if (this.reserveBillboardPlacement(billboardPlacements, signS, side, Math.abs(lateral), roofMega ? 180 : 135)) {
        const squareRoofSign = cityNoise(seed + 57.1) > 0.5;
        if (squareRoofSign) {
          const sideLength = clamp(Math.min(boardWidth * 0.56, width * 0.68, depth * 0.68), 7.0, roofMega ? 18.0 : 12.0);
          this.addJapaneseBillboardBox(
            billboardGroup,
            position,
            signYaw,
            sideLength,
            boardHeight,
            seed + 57.5,
            `${buildingId}:roof-box-ad`,
            `${buildingLabel} roof box billboard`,
          );
        } else {
          this.addJapaneseBillboardPlane(
            billboardGroup,
            position,
            signYaw,
            boardWidth,
            boardHeight,
            seed + 57.5,
            `${buildingId}:roof-ad`,
            `${buildingLabel} roof billboard`,
          );

          const postOrigin = this.offsetLocalPoint(base, yaw, localX, localZ, 0);
          for (const postX of [-boardWidth * 0.36, boardWidth * 0.36]) {
            billboardPosts.push({
              position: this.offsetLocalPoint(postOrigin, signYaw, postX, 0, bodyHeight + postHeight * 0.5),
              yaw: signYaw,
              s,
              scale: { x: roofMega ? 0.32 : 0.22, y: postHeight, z: roofMega ? 0.32 : 0.22 },
              remodel: this.makeBuildingRemodelMeta(buildingId, buildingLabel, "roof-billboard-pole"),
            });
          }
        }
        placedBuildingAd = true;
      }
    }

    const groundNoise = cityNoise(seed + 60.9);
    const groundMega = rowIndex >= 1 && cityNoise(seed + 60.2) > 0.72;
    if (!placedBuildingAd && rowIndex <= 5 && width > 15 && groundNoise > (groundMega ? 0.8 : 0.86)) {
      const boardWidth = groundMega ? cityRange(seed + 61.7, 16.0, 30.0) : cityRange(seed + 61.7, 8.5, 16.5);
      const boardHeight = groundMega ? cityRange(seed + 62.1, 6.2, 10.4) : cityRange(seed + 62.1, 3.8, 5.9);
      const postHeight = groundMega ? cityRange(seed + 63.4, 5.2, 8.4) : cityRange(seed + 63.4, 3.1, 5.0);
      const lateralClearance = cityRange(seed + 64.2, groundMega ? 15.0 : 12.0, groundMega ? 24.0 : 19.0);
      const localX = side * (width * 0.5 + lateralClearance);
      const localZ = cityRange(seed + 65.6, -depth * 0.45, depth * 0.45);
      const signS = (s + forward + localZ + this.trackLength) % this.trackLength;
      const signLateral = Math.abs(lateral) + Math.abs(localX);
      const halfForward = boardWidth * 0.5 + 7.5;
      const halfLateral = groundMega ? 9.0 : 6.6;
      const reserved = this.reserveCityFootprint({
        side,
        s: signS,
        lateral: signLateral,
        halfForward,
        halfLateral,
      }) && this.reserveBillboardPlacement(billboardPlacements, signS, side, signLateral, groundMega ? 190 : 145);
      if (reserved) {
        const padPosition = this.offsetLocalPoint(base, yaw, localX, localZ, 0.04);
        billboardPads.push({
          position: padPosition,
          yaw,
          s: signS,
          scale: { x: groundMega ? 9.2 : 6.8, y: 0.1, z: boardWidth + 2.2 },
        });
        for (const postZ of [-boardWidth * 0.34, boardWidth * 0.34]) {
          billboardPosts.push({
            position: this.offsetLocalPoint(base, yaw, localX, localZ + postZ, postHeight * 0.5),
            yaw,
            s: signS,
            scale: { x: groundMega ? 0.34 : 0.24, y: postHeight, z: groundMega ? 0.34 : 0.24 },
          });
        }
        this.addJapaneseBillboardPlane(
          billboardGroup,
          this.offsetLocalPoint(base, yaw, localX, localZ, postHeight + boardHeight * 0.52),
          yaw + cityRange(seed + 66.8, -0.26, 0.26),
          boardWidth,
          boardHeight,
          seed + 67.3,
          `${buildingId}:ground-ad`,
          `${buildingLabel} ground billboard`,
        );
      }
    }
  }

  reserveBillboardPlacement(placements, s, side, lateral, minDistance) {
    if (!Array.isArray(placements)) {
      return true;
    }
    const normalizedS = ((s % this.trackLength) + this.trackLength) % this.trackLength;
    const tooClose = placements.some((placement) => {
      if (placement.side !== side) {
        return false;
      }
      const direct = Math.abs(placement.s - normalizedS);
      const wrapped = this.trackLength - direct;
      const distance = Math.min(direct, wrapped);
      const lateralOverlap = Math.abs((placement.lateral ?? lateral) - lateral) < 90;
      return lateralOverlap && distance < minDistance;
    });
    if (tooClose) {
      return false;
    }
    placements.push({ s: normalizedS, side, lateral });
    return true;
  }

  addJapaneseBillboardBox(parent, position, yaw, sideLength, height, seed, fixedId, label) {
    const halfSide = sideLength * 0.5;
    for (let faceIndex = 0; faceIndex < 4; faceIndex += 1) {
      const faceYaw = yaw + faceIndex * Math.PI * 0.5;
      const facePosition = this.offsetLocalPoint(position, faceYaw, 0, halfSide, position.y);
      this.addJapaneseBillboardPlane(
        parent,
        facePosition,
        faceYaw,
        sideLength,
        height,
        seed + faceIndex * 3.7,
        `${fixedId}:face-${faceIndex}`,
        `${label} face ${faceIndex + 1}`,
      );
    }
  }

  addJapaneseBillboardPlane(parent, position, yaw, width, height, seed, fixedId, label) {
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      this.createJapaneseBillboardMaterial(seed),
    );
    board.name = "JapaneseBillboardFace";
    board.position.copy(position);
    board.rotation.y = yaw;
    board.renderOrder = 2;
    board.castShadow = false;
    board.receiveShadow = false;
    board.userData.remodelCategory = "sign";
    board.userData.remodelFixedId = fixedId;
    board.userData.remodelLabel = label;
    parent.add(board);
    return board;
  }

  createJapaneseBillboardMaterial(seed) {
    if (!this.billboardMaterialCache) {
      this.billboardMaterialCache = new Map();
    }
    const index = Math.floor(cityNoise(seed) * JAPANESE_BILLBOARD_ADS.length) % JAPANESE_BILLBOARD_ADS.length;
    if (this.billboardMaterialCache.has(index)) {
      return this.billboardMaterialCache.get(index);
    }

    const ad = JAPANESE_BILLBOARD_ADS[index];
    const variant = index % 12;
    const texture = makeCanvasTexture((ctx, canvas) => {
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = ad.bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, "rgba(255, 255, 255, 0.2)");
      gradient.addColorStop(0.46, "rgba(255, 255, 255, 0)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 0.2)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "rgba(0, 0, 0, 0.26)";
      ctx.fillRect(0, 0, canvas.width, 20);
      ctx.fillRect(0, canvas.height - 20, canvas.width, 20);
      ctx.fillStyle = ad.accent;
      ctx.fillRect(0, 0, 12, canvas.height);
      ctx.fillRect(canvas.width - 12, 0, 12, canvas.height);
      ctx.strokeStyle = ad.accent;
      ctx.lineWidth = 6;
      ctx.strokeRect(9, 9, canvas.width - 18, canvas.height - 18);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.48)";
      ctx.lineWidth = 2;
      ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);

      if (variant === 1) {
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = ad.accent;
        ctx.lineWidth = 10;
        for (let x = -canvas.width; x < canvas.width * 2; x += 42) {
          ctx.beginPath();
          ctx.moveTo(x, canvas.height);
          ctx.lineTo(x + canvas.height, 0);
          ctx.stroke();
        }
        ctx.restore();
      } else if (variant === 2) {
        ctx.fillStyle = ad.accent;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(0, canvas.height - 44, canvas.width, 24);
        ctx.globalAlpha = 1;
      } else if (variant === 3) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
        ctx.fillRect(0, 0, 74, canvas.height);
        ctx.fillStyle = ad.accent;
        for (let y = 0; y < canvas.height; y += 22) {
          ctx.fillRect(12, y + 6, 38, 10);
        }
      } else if (variant === 4) {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = ad.accent;
        for (let y = 18; y < canvas.height; y += 26) {
          for (let x = 20; x < canvas.width; x += 44) {
            ctx.beginPath();
            ctx.arc(x + (y % 52), y, 7, 0, TWO_PI);
            ctx.fill();
          }
        }
        ctx.restore();
      } else if (variant === 5) {
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = ad.fg;
        ctx.lineWidth = 4;
        for (let y = -20; y < canvas.height + 20; y += 24) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.bezierCurveTo(60, y + 18, 120, y - 18, canvas.width, y + 12);
          ctx.stroke();
        }
        ctx.restore();
      } else if (variant === 6) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = ad.accent;
        for (let x = 0; x < canvas.width; x += 38) {
          ctx.fillRect(x, 0, 18, canvas.height);
        }
        ctx.restore();
      } else if (variant === 7) {
        ctx.save();
        ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
        for (let x = 18; x < canvas.width; x += 42) {
          ctx.fillRect(x, 14, 18, canvas.height - 28);
        }
        ctx.fillStyle = ad.accent;
        for (let x = 32; x < canvas.width; x += 84) {
          ctx.beginPath();
          ctx.arc(x, canvas.height * 0.5, 18, 0, TWO_PI);
          ctx.fill();
        }
        ctx.restore();
      } else if (variant === 8) {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = ad.accent;
        for (let y = 18; y < canvas.height; y += 34) {
          ctx.fillRect(24, y, canvas.width - 48, 12);
        }
        ctx.restore();
      } else if (variant === 9) {
        ctx.save();
        ctx.fillStyle = ad.accent;
        ctx.globalAlpha = 0.88;
        for (let x = 24; x < canvas.width; x += 58) {
          ctx.beginPath();
          ctx.arc(x, 28, 16, 0, TWO_PI);
          ctx.arc(x, canvas.height - 28, 16, 0, TWO_PI);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
      } else if (variant === 10) {
        ctx.save();
        ctx.strokeStyle = ad.accent;
        ctx.lineWidth = 9;
        for (let x = -20; x < canvas.width + 20; x += 34) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x + 28, canvas.height);
          ctx.stroke();
        }
        ctx.restore();
      } else if (variant === 11) {
        ctx.save();
        ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
        ctx.fillRect(canvas.width * 0.12, 22, canvas.width * 0.76, canvas.height - 44);
        ctx.fillStyle = ad.accent;
        ctx.fillRect(canvas.width * 0.14, 30, canvas.width * 0.72, 12);
        ctx.fillRect(canvas.width * 0.14, canvas.height - 42, canvas.width * 0.72, 12);
        ctx.restore();
      }

      ctx.fillStyle = ad.accent;
      ctx.beginPath();
      ctx.arc(canvas.width - 46, 36, 22, 0, TWO_PI);
      ctx.fill();
      ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
      ctx.fillRect(24, 24, 52, 16);
      ctx.fillRect(canvas.width - 82, canvas.height - 38, 60, 14);

      ctx.fillStyle = ad.fg;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "900 50px 'Yu Gothic', 'Meiryo', system-ui, sans-serif";
      ctx.strokeStyle = "rgba(0, 0, 0, 0.44)";
      ctx.lineWidth = 5;
      ctx.strokeText(ad.title, canvas.width * 0.5, 58);
      ctx.fillText(ad.title, canvas.width * 0.5, 58);

      ctx.font = "800 22px 'Yu Gothic', 'Meiryo', system-ui, sans-serif";
      ctx.strokeStyle = "rgba(0, 0, 0, 0.34)";
      ctx.lineWidth = 3;
      ctx.strokeText(ad.brand, canvas.width * 0.5, 94);
      ctx.fillText(ad.brand, canvas.width * 0.5, 94);

      ctx.fillStyle = index % 2 === 0 ? "#ffffff" : "#101419";
      ctx.font = "900 16px 'Yu Gothic', 'Meiryo', system-ui, sans-serif";
      ctx.fillText("広告", canvas.width - 46, 36);
      ctx.fillStyle = ad.fg;
      ctx.font = "700 15px 'Yu Gothic', 'Meiryo', system-ui, sans-serif";
      ctx.fillText(ad.sub, canvas.width * 0.5, 115);

      ctx.save();
      ctx.translate(23, canvas.height * 0.5);
      ctx.rotate(-Math.PI * 0.5);
      ctx.font = "800 13px 'Yu Gothic', 'Meiryo', system-ui, sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.fillText("首都高", 0, 0);
      ctx.restore();

      for (let i = 0; i < 34; i += 1) {
        ctx.globalAlpha = 0.06 + cityNoise(index * 19.7 + i) * 0.1;
        ctx.fillStyle = cityNoise(index * 23.3 + i) > 0.52 ? "#ffffff" : "#000000";
        ctx.fillRect(
          Math.floor(cityNoise(index * 5.1 + i) * canvas.width),
          Math.floor(cityNoise(index * 8.7 + i) * canvas.height),
          2 + Math.floor(cityNoise(index * 12.2 + i) * 8),
          2 + Math.floor(cityNoise(index * 14.6 + i) * 5),
        );
      }
      ctx.globalAlpha = 1;
    });
    texture.anisotropy = this.ultraGraphics ? 8 : 2;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color: 0xffffff,
      side: THREE.DoubleSide,
    });
    material.name = `japaneseBillboard_${index}`;
    this.billboardMaterialCache.set(index, material);
    return material;
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
    s,
  }) {
    const groundMargin = cityRange(seed + 11.1, 3.1, 5.4);
    const roofMargin = cityRange(seed + 12.7, 2.0, 4.8);
    const usableHeight = Math.max(4.8, bodyHeight - groundMargin - roofMargin);
    const floorHeight = cityRange(seed + 13.6, rowIndex >= 4 ? 3.15 : 3.55, rowIndex >= 4 ? 4.25 : 4.8);
    const maxRows = rowIndex === 0 ? 8 : rowIndex >= 5 ? 16 : 12;
    const rowCount = Math.floor(clamp(usableHeight / floorHeight, 3, maxRows));
    const facadeDepth = depth * cityRange(seed + 14.4, 0.78, 0.96);
    const facadeStartZ = -facadeDepth * 0.5;
    const style = cityNoise(seed + 15.3);
    const outageChance = cityRange(seed + 15.9, 0.1, 0.28);
    const warmChance = cityRange(seed + 16.2, 0.12, 0.26);

    if (style < 0.42) {
      const bandHeight = cityRange(seed + 16.8, 0.52, 0.92);
      const segmentCount = Math.floor(clamp(facadeDepth / cityRange(seed + 17.2, 3.2, 5.2), 3, rowIndex === 0 ? 6 : 9));
      const segmentDepth = Math.max(0.58, (facadeDepth / segmentCount) * cityRange(seed + 17.6, 0.48, 0.68));
      for (let row = 0; row < rowCount; row += 1) {
        const y = groundMargin + (usableHeight * (row + 0.5)) / rowCount;
        for (let segment = 0; segment < segmentCount; segment += 1) {
          const z = facadeStartZ + (facadeDepth * (segment + 0.5)) / segmentCount;
          const cellNoise = cityNoise(seed + row * 7.17 + segment * 4.91 + 19.4);
          if (cellNoise < outageChance) {
            continue;
          }
          const target = cellNoise > 1 - warmChance ? warmWindows : glass;
          trim.push({
            position: this.offsetLocalPoint(base, yaw, facadeX - side * 0.006, z, y),
            yaw,
            s,
            scale: { x: 0.08, y: bandHeight + 0.16, z: segmentDepth + 0.18 },
            remodel: this.makeBuildingRemodelMeta(buildingId, buildingLabel, "window-frame"),
          });
          target.push({
            position: this.offsetLocalPoint(base, yaw, facadeX - side * 0.026, z, y),
            yaw,
            s,
            scale: { x: 0.18, y: bandHeight, z: segmentDepth },
            remodel: this.makeBuildingRemodelMeta(buildingId, buildingLabel, "window"),
          });
        }
      }
      return;
    }

    const columnCount = Math.floor(clamp(facadeDepth / cityRange(seed + 20.9, 3.4, 5.6), 3, rowIndex === 0 ? 7 : 10));
    const windowDepth = Math.max(0.62, (facadeDepth / columnCount) * cityRange(seed + 21.8, 0.46, 0.64));
    const windowHeight = cityRange(seed + 22.5, 0.58, 0.98);
    for (let row = 0; row < rowCount; row += 1) {
      const y = groundMargin + (usableHeight * (row + 0.5)) / rowCount;
      for (let column = 0; column < columnCount; column += 1) {
        const z = facadeStartZ + (facadeDepth * (column + 0.5)) / columnCount;
        const cellNoise = cityNoise(seed + row * 11.7 + column * 4.3 + 24.1);
        if (cellNoise < outageChance) {
          continue;
        }
        const target = cellNoise > 1 - warmChance ? warmWindows : glass;
        trim.push({
          position: this.offsetLocalPoint(base, yaw, facadeX - side * 0.006, z, y),
          yaw,
          s,
          scale: { x: 0.08, y: windowHeight + 0.18, z: windowDepth + 0.18 },
          remodel: this.makeBuildingRemodelMeta(buildingId, buildingLabel, "window-frame"),
        });
        target.push({
          position: this.offsetLocalPoint(base, yaw, facadeX - side * 0.026, z, y),
          yaw,
          s,
          scale: { x: 0.18, y: windowHeight, z: windowDepth },
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

  isBuildingNearBranchRoad(position, clearance = 54) {
    if (!this.branchRoutes?.length || !position) {
      return false;
    }
    const clearanceSq = clearance * clearance;
    for (const route of this.branchRoutes) {
      for (const sample of route.samples ?? []) {
        const dx = position.x - sample.center.x;
        const dz = position.z - sample.center.z;
        if (dx * dx + dz * dz < clearanceSq) {
          return true;
        }
      }
    }
    return false;
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
    const depth = type.depth * scale;
    const lateral = ROAD_HALF_WIDTH + 12 + (placement.setback ?? 14) + width * 0.5;
    const frame = this.getFrameAtDistance(placement.s);
    const position = this.offsetAlong(frame, lateral * placement.side, placement.forward ?? 0, 0);
    if (this.isBuildingNearBranchRoad(position, Math.max(width, depth) * 0.58 + 34)) {
      return;
    }
    const group = new THREE.Group();
    group.name = `Building_${type.id}_${Math.round(placement.s)}`;
    group.position.copy(position);
    group.rotation.y = frame.yaw + (placement.yaw ?? 0);

    this.buildBuildingType(group, type, scale, placement.side);
    this.addManualBuildingAviationBeacon(group, type, scale, placement);
    group.traverse((object) => {
      if (object.isMesh) {
        object.userData.remodelIgnore = true;
      }
    });
    parent.add(group);
    parent.add(this.createBuildingRemodelProxy(group, type, placement));
  }

  addManualBuildingAviationBeacon(group, type, scale, placement) {
    const h = type.height * scale * CITY_BUILDING_HEIGHT_SCALE;
    if (h < 70 || cityNoise(placement.s * 0.13 + type.height) <= 0.18) {
      return;
    }
    const w = type.width * scale;
    const d = type.depth * scale;
    const side = placement.side || 1;
    const x = side * w * cityRange(placement.s + 4.2, -0.18, 0.24);
    const z = d * cityRange(placement.s + 7.6, -0.22, 0.22);
    this.addLocalBox(group, 1.25, 0.72, 1.25, this.materials.aviationBeacon, x, h + 1.22, z);
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
    const h = type.height * scale * CITY_BUILDING_HEIGHT_SCALE;

    if (type.id === "stepped") {
      this.addLocalBox(group, w, h * 0.64, d, material, 0, h * 0.32, 0);
      this.addLocalBox(group, w * 0.72, h * 0.36, d * 0.72, material, side * w * 0.07, h * 0.82, -d * 0.04);
      this.addLocalBox(group, w * 0.8, 0.5, d * 0.78, roofMaterial, side * w * 0.07, h + 0.25, -d * 0.04);
      this.addFacadeWindows(group, w, h * 0.86, d, type.floors, type.columns, side);
      return;
    }

    if (type.id === "warehouse") {
      this.addLocalBox(group, w, h, d, material, 0, h * 0.5, 0);
      this.addLocalBox(group, w * 1.04, 0.7, d * 1.05, roofMaterial, 0, h + 0.35, 0);
      this.addFacadeWindows(group, w, h * 0.72, d, 4, Math.max(5, type.columns), side, 1.05);
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
      this.addFacadeWindows(group, w, h, d, type.floors, type.columns, side, 0.28);
      this.addLocalBox(group, 0.18, h * 0.12, 0.18, trim, 0, h + 1.15, 0);
      return;
    }

    if (type.id === "shutokuSpire") {
      this.addLocalBox(group, w, h * 0.82, d, material, 0, h * 0.41, 0);
      this.addLocalBox(group, w * 0.78, h * 0.18, d * 0.82, material, side * w * 0.04, h * 0.91, -d * 0.02);
      this.addLocalBox(group, w * 0.52, h * 0.08, d * 0.54, roofMaterial, side * w * 0.08, h * 1.04, 0);
      this.addFacadeWindows(group, w, h * 0.94, d, type.floors, type.columns, side, 0.42);
      this.addLocalBox(group, 0.16, h * 0.16, 0.16, trim, side * w * 0.08, h * 1.13, 0);
      return;
    }

    if (type.id === "megaOffice") {
      this.addLocalBox(group, w, h, d, material, 0, h * 0.5, 0);
      this.addLocalBox(group, w * 0.7, h * 0.22, d * 0.74, material, -side * w * 0.06, h * 1.08, 0);
      this.addLocalBox(group, w * 1.02, 0.72, d * 1.02, roofMaterial, 0, h + 0.36, 0);
      this.addLocalBox(group, w * 0.72, 0.62, d * 0.78, roofMaterial, -side * w * 0.06, h * 1.19, 0);
      this.addFacadeWindows(group, w, h, d, type.floors, type.columns, side, 0.48);
      return;
    }

    if (type.id === "mall") {
      this.addLocalBox(group, w, h, d, material, 0, h * 0.5, 0);
      this.addLocalBox(group, w * 1.02, 0.55, d * 1.04, roofMaterial, 0, h + 0.27, 0);
      this.addFacadeWindows(group, w, h * 0.62, d, 3, Math.max(6, type.columns), side, 1.12);
      this.addLocalBox(group, 0.2, 0.52 * scale, d * 0.42, this.materials.tunnelSign, -side * (w * 0.5 + 0.12), h * 0.66, 0);
      this.addLocalBox(group, 2.2 * scale, 0.24 * scale, d * 0.7, trim, -side * (w * 0.5 + 1.1 * scale), 3.15 * scale, 0);
      return;
    }

    if (type.id === "twin") {
      this.addLocalBox(group, w * 0.38, h, d, material, -w * 0.26, h * 0.5, 0);
      this.addLocalBox(group, w * 0.38, h * 0.86, d, material, w * 0.26, h * 0.43, 0);
      this.addLocalBox(group, w * 0.9, 0.48, d * 0.95, roofMaterial, 0, h + 0.24, 0);
      this.addFacadeWindows(group, w, h, d, type.floors, type.columns + 2, side, 0.24);
      return;
    }

    if (type.id === "parking") {
      this.addLocalBox(group, w, h, d, material, 0, h * 0.5, 0);
      this.addLocalBox(group, w * 1.02, 0.42, d * 1.02, roofMaterial, 0, h + 0.21, 0);
      this.addLocalBox(group, 0.15, h * 0.56, d * 0.2, this.materials.buildingGlassDark, -side * (w * 0.5 + 0.08), h * 0.42, -d * 0.26);
      this.addLocalBox(group, 0.15, h * 0.56, d * 0.2, this.materials.buildingGlassDark, -side * (w * 0.5 + 0.08), h * 0.42, d * 0.26);
      return;
    }

    this.addLocalBox(group, w, h, d, material, 0, h * 0.5, 0);
    this.addLocalBox(group, w * 1.04, 0.52, d * 1.04, roofMaterial, 0, h + 0.26, 0);
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
        map: this.createFacadeTexture(color),
        roughness,
        metalness,
        flatShading: true,
      });
      material.name = `facade_${Number(color).toString(16)}`;
      this.facadeMaterialCache.set(key, material);
    }
    return this.facadeMaterialCache.get(key);
  }

  addFacadeWindows(group, width, height, depth, floors, columns, side, windowHeight = 0.96) {
    const facadeX = -side * (width * 0.5 + 0.055);
    const usableHeight = Math.max(1, height - 5);
    const usableDepth = depth * 0.82;
    const startZ = -usableDepth * 0.5;
    const rowCount = Math.max(2, Math.floor(floors));
    const columnCount = Math.max(3, Math.floor(columns));
    const windowDepth = Math.max(0.42, usableDepth / (columnCount * 2.35));
    const outageModulo = Math.max(4, Math.floor((rowCount + columnCount) / 6));

    for (let row = 0; row < rowCount; row += 1) {
      const y = 3 + (usableHeight * (row + 0.5)) / rowCount;
      for (let column = 0; column < columnCount; column += 1) {
        const z = startZ + (usableDepth * (column + 0.5)) / columnCount;
        const shadeSeed = row * 13 + column * 7 + Math.floor(width * 3 + depth);
        if (shadeSeed % outageModulo === 1) {
          continue;
        }
        const lit = shadeSeed % 9 === 0 || (row + column) % 11 === 0;
        this.addLocalBox(
          group,
          0.08,
          windowHeight + 0.18,
          windowDepth + 0.28,
          this.materials.buildingGlassDark,
          facadeX - side * 0.006,
          y,
          z,
        );
        this.addLocalBox(
          group,
          0.18,
          windowHeight,
          windowDepth,
          lit ? this.materials.buildingWindowWarm : this.materials.buildingWindow,
          facadeX - side * 0.03,
          y,
          z,
        );
      }
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

    for (const run of this.tunnelRuns) {
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
    const upperWallHeight = wallHeight * TUNNEL_WALL_TOP_STRIP_RATIO;
    const lowerWallHeight = wallHeight - upperWallHeight;
    const roofWidth = ROAD_WIDTH + 11.6;
    const wallDepth = length + 0.45;
    this.addLocalBox(section, 0.74, lowerWallHeight, wallDepth, this.materials.tunnelBrickLower, -wallX, lowerWallHeight * 0.5, 0);
    this.addLocalBox(section, 0.74, lowerWallHeight, wallDepth, this.materials.tunnelBrickLower, wallX, lowerWallHeight * 0.5, 0);
    this.addLocalBox(section, 0.74, upperWallHeight, wallDepth, this.materials.tunnelCementUpper, -wallX, lowerWallHeight + upperWallHeight * 0.5, 0);
    this.addLocalBox(section, 0.74, upperWallHeight, wallDepth, this.materials.tunnelCementUpper, wallX, lowerWallHeight + upperWallHeight * 0.5, 0);
    this.addLocalBox(section, roofWidth, 0.7, wallDepth, this.materials.tunnelConcrete, 0, wallHeight + 0.35, 0);
    this.addLocalBox(section, ROAD_WIDTH + 3.0, 0.16, wallDepth, this.materials.tunnelDark, 0, wallHeight - 0.12, 0);

    if (index % 2 === 0) {
      this.addLocalBox(section, 0.18, 0.1, length * 0.46, this.materials.tunnelLight, -3.8, wallHeight - 0.42, 0);
      this.addLocalBox(section, 0.18, 0.1, length * 0.46, this.materials.tunnelLight, 3.8, wallHeight - 0.42, 0);
      this.addTunnelRoofLight(section, frame, -3.8, wallHeight - 0.58, -length * 0.2);
      this.addTunnelRoofLight(section, frame, 3.8, wallHeight - 0.58, length * 0.2);
    }

    const detailSide = index % 4 < 2 ? -1 : 1;
    const alternateSide = -detailSide;
    const innerX = detailSide * (wallX - 0.43);
    const alternateX = alternateSide * (wallX - 0.43);
    if (index % 11 === 2) {
      this.addLocalBox(section, 0.08, 1.18, 1.45, this.materials.tunnelElectricalPanel, innerX, 2.35, -length * 0.26);
    } else if (index % 17 === 7) {
      this.addLocalBox(section, 0.08, 1.86, 1.2, this.materials.tunnelElectricalPanel, innerX, 3.0, length * 0.24);
    } else if (index % 23 === 13) {
      this.addLocalBox(section, 0.08, 2.36, 2.9, this.materials.tunnelElectricalPanel, innerX, 2.95, 0);
    }
    if (index % 13 === 5) {
      this.addLocalBox(section, 0.08, 0.58, 1.16, this.materials.tunnelEmergencySign, alternateX, 4.95, length * 0.18);
    } else if (index % 19 === 0) {
      this.addLocalBox(section, 0.08, 0.62, 1.38, this.materials.tunnelExitSign, alternateX, 5.72, -length * 0.16);
    }
    if (index % 29 === 11) {
      this.addLocalBox(section, 0.1, 2.35, 1.36, this.materials.tunnelEmergencyDoor, innerX, 1.18, length * 0.08);
      this.addLocalBox(section, 0.11, 0.18, 0.18, this.materials.tunnelWarning, innerX - detailSide * 0.01, 1.28, length * 0.08);
      this.addLocalBox(section, 0.08, 0.44, 1.22, this.materials.tunnelExitSign, innerX, 2.72, length * 0.08);
    }

    parent.add(section);
  }

  addTunnelRoofLight(parent, frame, x, y, z) {
    // x/z arrive as tunnel-local lateral/forward offsets; the road-light pool
    // consumes slot positions in WORLD space, so convert here. Previously the
    // raw local values were stored, dumping the tunnel lights near the world
    // origin and leaving the tunnels pitch black.
    const world = this.offsetAlong(frame, x, z, y);
    this.roadLightSlots.push({
      s: frame.s,
      x: world.x,
      y: world.y,
      z: world.z,
      color: 0xffdda0,
      range: 52,
      decay: 1.18,
      baseIntensity: 12,
      alwaysOn: true,
    });
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

  // ---------------------------------------------------------------------------
  // Editor Mode  <->  Play Mode (bake / unbake)
  //
  // Only the user-created pieces are baked. Existing static map geometry is
  // already instanced + chunked + frozen, and edits to it only rewrite instance
  // matrices, so it carries no per-piece cost. Created boxes, by contrast, were
  // one Mesh each — baking merges them by material into chunked static geometry.
  // Created boxes are visual-only (they register no colliders), so baking changes
  // nothing about driving physics or collision.
  // ---------------------------------------------------------------------------

  setMapMode(mode) {
    if (mode === "editor") {
      if (this.mapMode !== "editor") {
        this.unbakeCreatedPieces();
      }
    } else if (this.mapMode !== "play") {
      this.bakeCreatedPieces();
    }
    return this.mapMode;
  }

  isPlayMode() {
    return this.mapMode === "play";
  }

  getBakedMapMaterial() {
    if (!this.bakedMapMaterial) {
      // Clone the editable-piece material but render per-vertex colours so a whole
      // chunk of differently-tinted boxes draws with a single material. White base
      // colour means the vertex colour is the final colour.
      const material = this.materials.remodelCreated.clone();
      material.name = "bakedMapPieces";
      material.vertexColors = true;
      material.color.set(0xffffff);
      this.bakedMapMaterial = material;
    }
    return this.bakedMapMaterial;
  }

  // Returns [{ id, label, state }] for the current created pieces, reading live
  // editable meshes when present (Editor Mode) and falling back to stored state
  // when they have already been baked away (Play Mode).
  getCreatedPiecesSnapshot() {
    if (this.remodelCreatedGroup?.children?.length) {
      return this.getCreatedRemodelPayload().map((piece) => ({
        id: piece.id,
        label: piece.label,
        state: this.cloneState(piece.state),
      }));
    }
    return this.remodelCreatedPieces.map((piece) => ({
      id: piece.id,
      label: piece.label,
      state: this.cloneState(piece.state ?? piece),
    }));
  }

  bakeCreatedPieces() {
    if (this.bakedMapGroup) {
      this.mapMode = "play";
      return;
    }

    // Snapshot from the live meshes so unsaved Editor Mode edits are reflected.
    const snapshot = this.getCreatedPiecesSnapshot();
    this.remodelCreatedPieces = snapshot.map((piece) => ({
      id: piece.id,
      label: piece.label,
      state: this.cloneState(piece.state),
    }));

    const group = new THREE.Group();
    group.name = BAKED_MAP_GROUP;
    group.userData.remodelIgnore = true;
    this.bakedChunks = [];

    if (snapshot.length) {
      const chunkSize = CITY_DETAIL_CHUNK_LENGTH;
      const scratch = new THREE.Vector3();
      const chunks = bakeBoxPieces(
        snapshot.map((piece) => piece.state),
        {
          material: this.getBakedMapMaterial(),
          getChunkKey: (piece) => {
            // Bucket by route arc-length so baked chunks reuse the existing
            // distance-based culling instead of being one giant mesh.
            const info = this.getNearestRoadInfo(scratch.set(piece.position.x, 0, piece.position.z));
            return Math.floor((info?.s ?? 0) / chunkSize);
          },
        },
      );

      for (const chunk of chunks) {
        const mesh = chunk.mesh;
        mesh.userData.chunkCenterS = (Number(chunk.key) + 0.5) * chunkSize;
        mesh.userData.chunkRouteLength = this.trackLength;
        mesh.userData.chunkRadius = Math.max(160, chunkSize * 0.58);
        mesh.userData.performanceCull = true;
        mesh.updateMatrixWorld(true);
        mesh.matrixAutoUpdate = false;
        mesh.matrixWorldAutoUpdate = false;
        group.add(mesh);
        this.cullableChunks.push(mesh);
        this.bakedChunks.push(mesh);
      }
    }

    this.scene.add(group);
    this.bakedMapGroup = group;

    // Play Mode keeps no individual created meshes in the scene.
    this.disposeCreatedRemodelMeshes();
    this.mapMode = "play";
  }

  unbakeCreatedPieces() {
    if (this.bakedMapGroup) {
      this.scene.remove(this.bakedMapGroup);
      for (const mesh of this.bakedChunks) {
        mesh.geometry?.dispose?.();
      }
      if (this.bakedChunks.length) {
        const baked = new Set(this.bakedChunks);
        this.cullableChunks = this.cullableChunks.filter((chunk) => !baked.has(chunk));
      }
      this.bakedChunks = [];
      this.bakedMapGroup = null;
    }

    // Restore the individual, editable meshes from stored state.
    this.disposeCreatedRemodelMeshes();
    if (this.remodelCreatedGroup) {
      this.remodelCreatedGroup.visible = true;
    }
    this.createSavedRemodelPieces();
    this.mapMode = "editor";
  }

  disposeCreatedRemodelMeshes() {
    if (!this.remodelCreatedGroup) {
      return;
    }
    for (const child of [...this.remodelCreatedGroup.children]) {
      this.remodelCreatedGroup.remove(child);
      child.geometry?.dispose?.();
      if (child.material && child.material !== this.materials.remodelCreated) {
        child.material.dispose?.();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Portable JSON map document (export / import)
  // ---------------------------------------------------------------------------

  collectSavableOverrides() {
    const targets = {};
    for (const [id, state] of Object.entries(this.remodelOverrides)) {
      if (this.remodelTargetMap.has(id) && !id.startsWith("created:") && !id.startsWith("psx:")) {
        targets[id] = this.cloneState(state);
      }
    }
    return targets;
  }

  exportMapDocument() {
    return buildMapDocument({
      targets: this.collectSavableOverrides(),
      deleted: [...this.remodelDeletedIds],
      created: this.getCreatedPiecesSnapshot(),
      routeProfile: this.getRemodelRouteProfile(),
    });
  }

  // Editor-only: produce the optimized baked runtime map the shipped game loads.
  // Bakes the created pieces into merged, chunked geometry (if not already), then
  // serializes route profile + visual overrides/deletions + decorative chunks.
  // Restores editable meshes afterwards so editing can continue.
  exportBakedRuntimeMap() {
    const wasPlayMode = this.mapMode === "play";
    if (!this.bakedMapGroup) {
      this.bakeCreatedPieces();
    }
    const doc = buildBakedMapDocument({
      routeProfile: this.getRemodelRouteProfile(),
      overrides: this.collectSavableOverrides(),
      deleted: [...this.remodelDeletedIds],
      chunkMeshes: this.bakedChunks,
      sourceVersion: MAP_DOCUMENT_VERSION,
    });
    if (!wasPlayMode) {
      this.unbakeCreatedPieces();
    }
    return doc;
  }

  // Load an editable map from a document/JSON string/store. Rebuilds editable
  // pieces, re-applies overrides, persists to localStorage, and re-bakes so Play
  // Mode reflects the imported map. Returns a small summary, or null on failure.
  importMapDocument(input) {
    let store;
    try {
      store = parseMapDocument(input);
    } catch {
      return null;
    }

    const wasPlayMode = this.mapMode === "play";

    // Reset the editable data from the imported store.
    this.remodelOverrides = store.targets && typeof store.targets === "object" ? { ...store.targets } : {};
    this.remodelDeletedIds = new Set(store.deleted);
    this.remodelCreatedPieces = store.created.map((piece) => ({
      id: piece.id,
      label: piece.label,
      state: this.cloneState(piece.state),
    }));

    // Drop any current created geometry (baked or editable) before rebuilding.
    if (this.bakedMapGroup) {
      this.scene.remove(this.bakedMapGroup);
      for (const mesh of this.bakedChunks) {
        mesh.geometry?.dispose?.();
      }
      const baked = new Set(this.bakedChunks);
      this.cullableChunks = this.cullableChunks.filter((chunk) => !baked.has(chunk));
      this.bakedChunks = [];
      this.bakedMapGroup = null;
    }
    this.disposeCreatedRemodelMeshes();
    this.mapMode = "editor";

    const importedProfile = this.sanitizeRouteProfile(store.routeProfile);
    const profileChanged = JSON.stringify(importedProfile) !== JSON.stringify(this.routeProfile);
    if (store.routeProfile && profileChanged) {
      this.applyRemodelRouteProfile(importedProfile, { rebuild: true, preserveSpawnSegment: false });
    }

    this.createSavedRemodelPieces();
    this.rebuildRemodelTargets();
    this.applySavedRemodelOverrides();

    // Persist under the existing key so the import survives a reload.
    try {
      window.localStorage.setItem(
        REMODEL_STORAGE_KEY,
        JSON.stringify({
          version: 3,
          savedAt: new Date().toISOString(),
          targets: this.collectSavableOverrides(),
          deleted: [...this.remodelDeletedIds],
          created: this.getCreatedRemodelPayload(),
          routeProfile: this.getRemodelRouteProfile(),
        }),
      );
    } catch {
      // Non-fatal: the import still applies in-memory for this session.
    }

    if (wasPlayMode) {
      this.bakeCreatedPieces();
    }

    return {
      overrides: Object.keys(this.remodelOverrides).length,
      deleted: this.remodelDeletedIds.size,
      created: this.remodelCreatedPieces.length,
      routeChanged: Boolean(store.routeProfile && profileChanged),
    };
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
          version: 3,
          savedAt: new Date().toISOString(),
          targets,
          deleted: [...this.remodelDeletedIds],
          created: this.getCreatedRemodelPayload(),
          routeProfile: this.getRemodelRouteProfile(),
        }),
      );
      return Object.keys(targets).length +
        this.remodelDeletedIds.size +
        this.remodelCreatedPieces.length +
        this.routeProfile.controlPoints.length +
        this.routeProfile.branches.length +
        this.tunnelRuns.length;
    } catch {
      return null;
    }
  }

  loadRemodelStore() {
    try {
      const payload = JSON.parse(window.localStorage.getItem(REMODEL_STORAGE_KEY) ?? "{}");
      if (!payload || typeof payload !== "object") {
        return { targets: {}, deleted: [], created: [], routeProfile: null };
      }
      return {
        targets: payload.targets && typeof payload.targets === "object" ? { ...payload.targets } : {},
        deleted: Array.isArray(payload.deleted) ? payload.deleted.filter((id) => typeof id === "string") : [],
        created: Array.isArray(payload.created) ? payload.created.filter((piece) => piece?.id && piece?.state) : [],
        routeProfile: payload.routeProfile && typeof payload.routeProfile === "object" ? payload.routeProfile : null,
      };
    } catch {
      return { targets: {}, deleted: [], created: [], routeProfile: null };
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
    // In Play Mode the editable meshes have been baked away, so there are no live
    // children to read; fall back to the stored states instead of wiping them.
    if (!this.remodelCreatedGroup?.children?.length && this.remodelCreatedPieces.length) {
      return this.remodelCreatedPieces
        .filter((piece) => piece?.id && piece?.state)
        .map((piece) => ({
          id: piece.id,
          label: piece.label ?? "Created box",
          state: this.cloneState(piece.state),
        }));
    }

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
    if (rootName === "RoadsideCityInfrastructure" || meta?.remodelCategory === "infrastructure") {
      return "infrastructure";
    }
    if (rootName === "ShutokuExpresswaySigns") {
      return "sign";
    }
    if (rootName === "FixedHighwayTunnels") {
      return "tunnel";
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
      infrastructure: "Infrastructure",
      sign: "Road sign",
      tunnel: "Tunnel",
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
      if (!object.userData?.remodelControlledObjectPoseOnly) {
        controlledObject.scale.copy(object.scale);
      }
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
      shutokuWalls: [],
      shutokuBases: [],
    };
  }

  flushGuardrailBatch(parent, batch, railLength, routeLength = this.trackLength) {
    parent.add(this.createChunkedInstancedBoxes(batch.upper, GUARDRAIL_MODEL.upper.width, GUARDRAIL_MODEL.upper.height, railLength, this.materials.rail, false, routeLength));
    parent.add(this.createChunkedInstancedBoxes(batch.lower, GUARDRAIL_MODEL.lower.width, GUARDRAIL_MODEL.lower.height, railLength, this.materials.railDark, false, routeLength));
    parent.add(this.createChunkedInstancedBoxes(batch.posts, GUARDRAIL_MODEL.post.width, GUARDRAIL_MODEL.post.height, GUARDRAIL_MODEL.post.depth, this.materials.railDark, false, routeLength));
    parent.add(this.createChunkedInstancedBoxes(batch.amber, GUARDRAIL_MODEL.reflector.width, GUARDRAIL_MODEL.reflector.height, GUARDRAIL_MODEL.reflector.depth, this.materials.reflectorAmber, false, routeLength));
    parent.add(this.createChunkedInstancedBoxes(batch.red, GUARDRAIL_MODEL.reflector.width, GUARDRAIL_MODEL.reflector.height, GUARDRAIL_MODEL.reflector.depth, this.materials.reflectorRed, false, routeLength));
    parent.add(this.createChunkedScaledInstancedBoxes(batch.shutokuBases, this.materials.shutokuBarrierBase, false, false, routeLength, ROAD_DETAIL_CHUNK_LENGTH));
    parent.add(this.createChunkedScaledInstancedBoxes(batch.shutokuWalls, this.materials.shutokuBarrier, false, false, routeLength, ROAD_DETAIL_CHUNK_LENGTH));
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

  getFrameAtDistance(distance, target = null) {
    const frame = this.getFrameOnCurve(this.curve, this.trackLength, distance, true, target);
    frame.routeId = "main";
    frame.isBranch = false;
    frame.roadHalfWidth = this.getRoadHalfWidthAtDistance(frame.s);
    frame.roadBounds = this.getRoadLateralBoundsAtDistance(frame.s);
    frame.laneCount = this.getLaneCountAtDistance(frame.s);
    return frame;
  }

  getFrameOnCurve(curve, length, distance, closed, target = null) {
    const routeS = closed ? ((distance % length) + length) % length : clamp(distance, 0, length);
    const t = clamp(routeS / length, 0, 1);
    const frame = target ?? {};
    const center = curve.getPointAt(t, frame.center ?? new THREE.Vector3());
    const tangent = curve.getTangentAt(t, frame.tangent ?? new THREE.Vector3()).normalize();
    const normal = frame.normal ?? new THREE.Vector3();
    normal.set(tangent.z, 0, -tangent.x).normalize();
    frame.s = routeS;
    frame.center = center;
    frame.tangent = tangent;
    frame.normal = normal;
    frame.yaw = Math.atan2(tangent.x, tangent.z);
    return frame;
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
    const offset = this.getLaneOffsetAtDistance(distance, laneIndex);
    const position = this.offsetPoint(frame, offset, 0);
    return {
      ...frame,
      position,
    };
  }

  getRoadHalfWidthAtDistance(distance) {
    const bounds = this.getRoadLateralBoundsAtDistance(distance);
    return Math.max(Math.abs(bounds.left), Math.abs(bounds.right));
  }

  getRouteRangeAtDistance(distance) {
    const ranges = this.routeSegmentRanges ?? [];
    if (!ranges.length || !Number.isFinite(this.trackLength) || this.trackLength <= 0) {
      return null;
    }

    const s = ((distance % this.trackLength) + this.trackLength) % this.trackLength;
    return ranges.find((range) => s >= range.start && s < range.end) ?? ranges[ranges.length - 1];
  }

  // Which lane indices stay open for a given segment.
  // 3 lanes -> [0,1,2]. 2 lanes -> the closed extreme lane is dropped:
  // closedSide > 0 closes the right lane (index 2), closedSide < 0 the left (index 0).
  getOpenLaneIndexesForRange(range) {
    if ((range?.laneCount === 2 ? 2 : 3) !== 2) {
      return [0, 1, 2];
    }
    return (range.closedSide === -1 ? -1 : 1) > 0 ? [0, 1] : [1, 2];
  }

  // Centred lane offset for one lane index inside a segment. In a 2-lane segment
  // the two surviving lanes are re-centred so each car sits in the middle of its
  // half of the (narrower) carriageway; the dropped lane funnels onto the nearest
  // open lane so a stray car heads there smoothly instead of into the barrier.
  laneOffsetForRange(range, laneIndex) {
    const idx = clamp(laneIndex, 0, LANES.length - 1);
    if ((range?.laneCount === 2 ? 2 : 3) !== 2) {
      return LANES[idx];
    }
    const openIdx = this.getOpenLaneIndexesForRange(range);
    const divider = (LANES[openIdx[0]] + LANES[openIdx[1]]) * 0.5;
    const half = TWO_LANE_LANE_WIDTH * 0.5;
    const centred = {
      [openIdx[0]]: divider - half,
      [openIdx[1]]: divider + half,
    };
    // Open lane -> its centred offset; closed lane -> the adjacent open lane (idx 1).
    return centred[idx] ?? centred[1];
  }

  getLaneLayoutForRange(range) {
    const laneCount = range?.laneCount === 2 ? 2 : 3;
    if (laneCount !== 2) {
      return {
        laneCount: 3,
        closedSide: 0,
        laneOffsets: LANES,
        markerOffsets: [-2, 2],
        left: -ROAD_HALF_WIDTH,
        right: ROAD_HALF_WIDTH,
      };
    }

    const closedSide = range?.closedSide === -1 ? -1 : 1;
    const openIdx = this.getOpenLaneIndexesForRange(range);
    const divider = (LANES[openIdx[0]] + LANES[openIdx[1]]) * 0.5;
    // Carriageway hugs the two centred lanes: half-width == one lane width.
    return {
      laneCount: 2,
      closedSide,
      laneOffsets: openIdx.map((idx) => this.laneOffsetForRange(range, idx)),
      markerOffsets: [divider],
      left: divider - TWO_LANE_LANE_WIDTH,
      right: divider + TWO_LANE_LANE_WIDTH,
    };
  }

  getLaneLayoutAtDistance(distance) {
    return this.getLaneLayoutForRange(this.getRouteRangeAtDistance(distance));
  }

  // Blend a per-segment scalar across lane-count seams. u = 0.5 exactly at the seam,
  // decaying to 0 inside the segment, so adjacent segments meet at the midpoint and
  // the value changes monotonically on one side only (no symmetric "funnel").
  blendAcrossSeams(distance, valueForRange) {
    const ranges = this.routeSegmentRanges ?? [];
    const current = this.getRouteRangeAtDistance(distance);
    if (!current || !ranges.length || !Number.isFinite(this.trackLength) || this.trackLength <= 0) {
      return valueForRange(null);
    }
    const count = ranges.length;
    const s = ((distance % this.trackLength) + this.trackLength) % this.trackLength;
    let value = valueForRange(current);
    const previous = ranges[(current.index - 1 + count) % count];
    const next = ranges[(current.index + 1) % count];
    const local = s - current.start;
    const toEnd = current.end - s;

    if (previous && previous.laneCount !== current.laneCount) {
      const win = Math.min(LANE_TRANSITION_LENGTH, current.length * 0.5, previous.length * 0.5);
      if (win > 0 && local < win) {
        const u = 0.5 * (1 - smoothstep(0, win, local));
        value = THREE.MathUtils.lerp(value, valueForRange(previous), u);
      }
    }
    if (next && next.laneCount !== current.laneCount) {
      const win = Math.min(LANE_TRANSITION_LENGTH, current.length * 0.5, next.length * 0.5);
      if (win > 0 && toEnd < win) {
        const u = 0.5 * (1 - smoothstep(0, win, toEnd));
        value = THREE.MathUtils.lerp(value, valueForRange(next), u);
      }
    }
    return value;
  }

  // Single source of truth for the carriageway shape. The lane-count change at a
  // segment seam is blended with a half-window on each side: the road narrows once,
  // monotonically, on one side only (no symmetric "funnel", no bulge at the seam).
  getBlendedRoadLayout(distance) {
    const current = this.getRouteRangeAtDistance(distance);
    if (!current) {
      return { left: -ROAD_HALF_WIDTH, right: ROAD_HALF_WIDTH };
    }
    const left = this.blendAcrossSeams(distance, (range) =>
      range ? this.getLaneLayoutForRange(range).left : -ROAD_HALF_WIDTH);
    const right = this.blendAcrossSeams(distance, (range) =>
      range ? this.getLaneLayoutForRange(range).right : ROAD_HALF_WIDTH);
    return { left, right };
  }

  // Blended, centred lateral offset for a lane index, smooth across transitions.
  getLaneCenterOffset(distance, laneIndex) {
    return this.blendAcrossSeams(distance, (range) =>
      range
        ? this.laneOffsetForRange(range, laneIndex)
        : LANES[clamp(laneIndex, 0, LANES.length - 1)]);
  }

  getLaneOffsetAtDistance(distance, laneIndex) {
    if (this.isLaneOpenAtDistance(distance, laneIndex)) {
      return this.getLaneCenterOffset(distance, laneIndex);
    }
    return this.getNearestOpenLaneOffset(distance, this.getLaneCenterOffset(distance, laneIndex));
  }

  getNearestOpenLaneIndex(distance, lateralOffset = 0) {
    const openLanes = this.getOpenLaneIndexesAtDistance(distance);
    return (
      openLanes
        .slice()
        .sort(
          (a, b) =>
            Math.abs(this.getLaneCenterOffset(distance, a) - lateralOffset) -
            Math.abs(this.getLaneCenterOffset(distance, b) - lateralOffset),
        )[0] ?? 1
    );
  }

  getNearestOpenLaneOffset(distance, lateralOffset = 0) {
    return this.getLaneCenterOffset(distance, this.getNearestOpenLaneIndex(distance, lateralOffset));
  }

  isLaneOpenAtDistance(distance, laneIndex) {
    const range = this.getRouteRangeAtDistance(distance);
    return this.getOpenLaneIndexesForRange(range).includes(
      clamp(laneIndex, 0, LANES.length - 1),
    );
  }

  getOpenLaneIndexesAtDistance(distance) {
    return this.getOpenLaneIndexesForRange(this.getRouteRangeAtDistance(distance));
  }

  getRoadLateralBoundsAtDistance(distance, extra = 0) {
    const layout = this.getBlendedRoadLayout(distance);
    return {
      left: layout.left - extra,
      right: layout.right + extra,
    };
  }

  // Orange striped barriers that physically seal the closing lane at every
  // 3<->2 lane-count change. They sit just inside the (blended) carriageway edge
  // on the side that closes, so they trace the diagonal taper and guide traffic
  // out of the lane that disappears (entry) or appears (exit).
  createLaneClosureRoadblocks(parent) {
    const ranges = this.routeSegmentRanges ?? [];
    if (ranges.length < 2 || !Number.isFinite(this.trackLength) || this.trackLength <= 0) {
      return;
    }

    const STEP = 4.2;
    const BLOCK_W = 0.72;
    const BLOCK_H = 0.66;
    const BLOCK_D = 1.0;
    const baseY = ROAD_SURFACE_ELEVATION;
    const blocks = [];
    const stripes = [];

    for (let i = 0; i < ranges.length; i += 1) {
      const cur = ranges[i];
      const nxt = ranges[(i + 1) % ranges.length];
      if (cur.laneCount === nxt.laneCount) {
        continue;
      }

      const seam = cur.end;
      const twoLane = cur.laneCount === 2 ? cur : nxt;
      const closedSide = twoLane.closedSide === -1 ? -1 : 1; // +1 -> right lane closes
      const win = Math.min(LANE_TRANSITION_LENGTH, cur.length * 0.5, nxt.length * 0.5);
      if (win <= 0) {
        continue;
      }

      for (let offsetS = -win; offsetS <= win + 0.001; offsetS += STEP) {
        const s = (((seam + offsetS) % this.trackLength) + this.trackLength) % this.trackLength;
        const bounds = this.getRoadLateralBoundsAtDistance(s);
        const edge = closedSide > 0 ? bounds.right : bounds.left;
        // Only barrier the pinching part: skip the full-width 3-lane edge so we
        // don't line the whole carriageway, just the diagonal taper + a short seal.
        if (Math.abs(edge) > ROAD_HALF_WIDTH - 0.4) {
          continue;
        }
        const lateral = edge - closedSide * (BLOCK_W * 0.5 + 0.12);
        if (this.isJunctionOpeningForOffset?.(s, lateral)) {
          continue;
        }
        const frame = this.getFrameAtDistance(s);
        blocks.push({ position: this.offsetPoint(frame, lateral, baseY + BLOCK_H * 0.5), yaw: frame.yaw, s });
        stripes.push({ position: this.offsetPoint(frame, lateral, baseY + BLOCK_H + 0.02), yaw: frame.yaw, s });
      }
    }

    if (!blocks.length) {
      return;
    }
    parent.add(this.createChunkedInstancedBoxes(blocks, BLOCK_W, BLOCK_H, BLOCK_D, this.materials.roadblock, true));
    parent.add(this.createChunkedInstancedBoxes(stripes, BLOCK_W + 0.02, 0.12, BLOCK_D + 0.02, this.materials.roadblockStripe, false));
  }

  getLaneCountAtDistance(distance, options = {}) {
    const ranges = this.routeSegmentRanges ?? [];
    if (!ranges.length || !Number.isFinite(this.trackLength) || this.trackLength <= 0) {
      return 3;
    }

    const s = ((distance % this.trackLength) + this.trackLength) % this.trackLength;
    const current = this.getRouteRangeAtDistance(s);
    const currentLaneCount = current?.laneCount === 2 ? 2 : 3;
    if (!options.smooth) {
      return currentLaneCount;
    }

    const index = current.index;
    const previous = ranges[(index - 1 + ranges.length) % ranges.length];
    const next = ranges[(index + 1) % ranges.length];
    let laneCount = currentLaneCount;
    const transition = Math.min(LANE_TRANSITION_LENGTH, Math.max(24, current.length * 0.45));
    const local = s - current.start;

    if (previous && local < transition && previous.laneCount !== currentLaneCount) {
      laneCount = THREE.MathUtils.lerp(previous.laneCount, currentLaneCount, smoothstep(0, transition, local));
    }

    const toEnd = current.end - s;
    if (next && toEnd < transition && next.laneCount !== currentLaneCount) {
      laneCount = THREE.MathUtils.lerp(currentLaneCount, next.laneCount, smoothstep(0, transition, transition - toEnd));
    }

    return laneCount;
  }

  getLaneMarkerOffsetsAtDistance(distance) {
    return this.getLaneLayoutAtDistance(distance).markerOffsets;
  }

  getRailOffsetForFrame(frame, side = 1) {
    const bounds = frame?.roadBounds ?? this.getRoadLateralBoundsAtDistance(frame?.s ?? 0);
    return (side < 0 ? Math.abs(bounds.left) : Math.abs(bounds.right)) + 1.15;
  }

  getDriveLimitForFrame(frame, side = 1) {
    return this.getRailOffsetForFrame(frame, side) - 1.1;
  }

  getNearestMainRoadInfo(position) {
    let best = null;
    let bestDistanceSq = Infinity;

    for (const sample of this.roadSamples) {
      if (sample.isBranch) {
        continue;
      }
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

  getBranchRoute(id) {
    return this.branchRoutes.find((route) => route.id === id) ?? null;
  }

  getBranchFrame(routeOrId, distance, target = null) {
    const route = typeof routeOrId === "string" ? this.getBranchRoute(routeOrId) : routeOrId;
    if (!route) {
      return this.getFrameAtDistance(distance, target);
    }
    const frame = this.getFrameOnCurve(route.curve, route.length, distance, false, target);
    frame.isBranch = true;
    frame.routeId = route.id;
    frame.routeDistance = clamp(distance, 0, route.length);
    frame.roadHalfWidth = ROAD_HALF_WIDTH;
    frame.laneCount = 3;
    return frame;
  }

  getTrafficFrame(routeState = null) {
    if (routeState?.type === "branch") {
      return this.getBranchFrame(routeState.id, routeState.s);
    }
    return this.getFrameAtDistance(routeState?.s ?? 0);
  }

  findBranchChoiceForMainS(s, lane, random = Math.random) {
    const laneOffset = LANES[clamp(lane, 0, LANES.length - 1)];
    const laneSide = Math.sign(laneOffset || 0);
    if (laneSide === 0) {
      return null;
    }

    const candidates = [];
    for (const route of this.branchRoutes) {
      for (const attachmentName of ["startAttachment", "endAttachment"]) {
        const attachment = route[attachmentName];
        if (!attachment || Math.sign(attachment.side) !== laneSide) {
          continue;
        }
        const distance = this.loopDistance(s, attachment.mainS);
        if (distance <= JUNCTION_TRAFFIC_WINDOW) {
          candidates.push({ route, attachment, distance });
        }
      }
    }

    if (!candidates.length) {
      return null;
    }

    candidates.sort((a, b) => a.distance - b.distance);
    const picked = candidates[Math.floor(random() * Math.min(candidates.length, 2))];
    const startAtEnd = picked.attachment.routeDistance > picked.route.length * 0.5;
    return {
      id: picked.route.id,
      s: picked.attachment.routeDistance,
      direction: startAtEnd ? -1 : 1,
    };
  }

  resolveBranchExit(routeState) {
    const route = this.getBranchRoute(routeState?.id);
    if (!route) {
      return null;
    }
    const exitingAtEnd = routeState.direction >= 0
      ? routeState.s >= route.length
      : routeState.s <= 0;
    if (!exitingAtEnd) {
      return null;
    }
    const attachment = routeState.direction >= 0 ? route.endAttachment : route.startAttachment;
    return attachment
      ? { s: attachment.mainS, side: attachment.side }
      : null;
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
    let previousRoad = null;
    let sweptFromRoad = false;
    if ((!road || road.distance >= 22) && player.previousPosition) {
      previousRoad = this.getNearestRoadInfo(player.previousPosition);
      // Generous recovery window: if the player was anywhere near the road last
      // frame, keep treating them as "on the road" so a fast lateral move or a
      // lag-spike (large dt) frame can't tunnel clean through the guardrail.
      if (
        previousRoad &&
        previousRoad.distance < this.getDriveLimitForFrame(previousRoad, Math.sign(previousRoad.lateral || 1)) + 48
      ) {
        road = this.projectRoadInfo(previousRoad, p);
        sweptFromRoad = true;
      }
    }
    const result = {
      hit: false,
      source: null,
      impactSpeed: player.speedMagnitude ?? Math.abs(player.speed),
    };

    if (!previousRoad && player.previousPosition) {
      previousRoad = this.getNearestRoadInfo(player.previousPosition);
    }

    if (!inMeet && !inDriveway && road && (road.distance < 140 || sweptFromRoad)) {
      const side = Math.sign(road.lateral || 1);
      const limit = this.getDriveLimitForFrame(road, side);
      const over = Math.abs(road.lateral) - limit;
      const previousProjection = previousRoad && player.previousPosition
        ? this.projectRoadInfo(previousRoad, player.previousPosition)
        : null;
      const previousLimit = previousProjection ? this.getDriveLimitForFrame(previousProjection, side) : limit;
      const crossedRail = previousProjection
        ? Math.abs(previousProjection.lateral) <= previousLimit + 0.35 &&
          Math.sign(previousProjection.lateral || side) !== -side &&
          Math.abs(road.lateral) > limit
        : false;
      if ((over > 0 || crossedRail) && !this.isEntranceGap(road.s, side) && !this.isJunctionOpening(road.s, side)) {
        const normal = {
          x: -road.normal.x * side,
          z: -road.normal.z * side,
        };
        const correction = Math.max(over, 0) + 0.28;
        p.x += normal.x * correction;
        p.z += normal.z * correction;
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

        // Iterate the push-back so the car is guaranteed to end up inside the
        // rail even after a deep tunnel/overshoot — a single correction can fall
        // short when the lateral overshoot was large.
        for (let pass = 0; pass < 4; pass += 1) {
          const resolvedRoad = this.projectRoadInfo(road, p);
          const stillOver = Math.abs(resolvedRoad.lateral) - limit;
          if (stillOver <= 0.001) {
            break;
          }
          p.x -= road.normal.x * side * stillOver;
          p.z -= road.normal.z * side * stillOver;
        }
        // Kill any remaining outward lateral velocity so it can't immediately
        // tunnel back out on the next frame. `normal` points back toward the
        // road; a negative projection means the car is still heading outward.
        const inwardSpeed = player.velocity.x * normal.x + player.velocity.z * normal.z;
        if (inwardSpeed < 0) {
          player.velocity.x -= normal.x * inwardSpeed;
          player.velocity.z -= normal.z * inwardSpeed;
          if (player.syncLocalSpeeds) {
            player.syncLocalSpeeds();
          }
        }
      }
    }

    const playerColliderHalfX = 1.05;
    const playerColliderHalfZ = 2.25;
    for (const collider of this.colliders) {
      if (
        Math.abs(player.position.x - collider.x) > collider.halfX + playerColliderHalfX ||
        Math.abs(player.position.z - collider.z) > collider.halfZ + playerColliderHalfZ
      ) {
        continue;
      }
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

  isJunctionOpening(s, side) {
    return this.branchRoutes.some((route) => {
      for (const attachment of [route.startAttachment, route.endAttachment]) {
        if (!attachment || Math.sign(attachment.side) !== Math.sign(side)) {
          continue;
        }
        if (this.loopDistance(s, attachment.mainS) <= JUNCTION_OPENING_HALF_LENGTH) {
          return true;
        }
      }
      return false;
    });
  }

  isJunctionOpeningForOffset(s, lateralOffset, extraLength = 0) {
    const side = Math.sign(lateralOffset || 1);
    return this.branchRoutes.some((route) => {
      for (const attachment of [route.startAttachment, route.endAttachment]) {
        if (!attachment || Math.sign(attachment.side) !== side) {
          continue;
        }
        if (this.loopDistance(s, attachment.mainS) <= JUNCTION_OPENING_HALF_LENGTH + extraLength) {
          return true;
        }
      }
      return false;
    });
  }

  isJunctionOpeningOnAnySide(s, halfLength = JUNCTION_OPENING_HALF_LENGTH) {
    return this.branchRoutes.some((route) => {
      for (const attachment of [route.startAttachment, route.endAttachment]) {
        if (attachment && this.loopDistance(s, attachment.mainS) <= halfLength) {
          return true;
        }
      }
      return false;
    });
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
