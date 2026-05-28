import compression from "compression";
import dotenv from "dotenv";
import express from "express";
import { MongoClient } from "mongodb";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CAR_PRESETS, DEFAULT_SETTINGS, PARTS_CATALOG } from "../src/game/config.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const INDEX_HTML = path.join(DIST_DIR, "index.html");

const isProduction = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT) || 10000;
const HOST = process.env.HOST || "0.0.0.0";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const SESSION_SECRET = process.env.SESSION_SECRET || "polyhesi-local-dev-secret";
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "polyhesi";

if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is required in production.");
}

if (isProduction && !MONGODB_URI) {
  throw new Error("MONGODB_URI is required in production.");
}

const SEEDED_ACCOUNTS = [
  {
    username: "nova",
    displayName: "Nova",
    role: "admin",
    passwordEnv: "ADMIN_PASSWORD",
    passwordHash:
      "scrypt$nPTDkK-bGtsNrSgna80SbA$WsPfCW-EL4uVvX9FxAWwpeMKmY1gPmvlIGk0SC8SBdB1CRfcoaUnodgiUTDAq7Mcwuz_b0IYW9ZgNNIcRcfmVQ",
  },
  {
    username: "test",
    displayName: "Test",
    role: "player",
    passwordEnv: "TEST_PASSWORD",
    passwordHash:
      "scrypt$hzSR-8Bz-NKKjKBW6Z2dRA$bZcbigSA6Z4tFiIaxQ3NjrjxnbvqVhcnh4pvSEMqUACuzlJfj7ifORGN47uHFtvwhbfkYwtRNnjEkwXh8nCd3Q",
  },
];

const CAR_IDS = new Set(CAR_PRESETS.map((car) => car.id));
const PARTS_BY_ID = new Map(PARTS_CATALOG.map((part) => [part.id, part]));

function normalizeUsername(username) {
  return String(username ?? "").trim().toLowerCase();
}

function publicUser(user) {
  return {
    id: String(user._id ?? user.id),
    username: user.username,
    displayName: user.displayName ?? user.username,
    role: user.role === "admin" ? "admin" : "player",
  };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  const [algorithm, salt, expectedHash] = String(storedHash ?? "").split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHash) {
    return false;
  }

  try {
    const expected = Buffer.from(expectedHash, "base64url");
    const actual = crypto.scryptSync(String(password), salt, expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyToken(token) {
  const [body, signature] = String(token ?? "").split(".");
  if (!body || !signature) {
    return null;
  }

  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload?.sub || !payload?.username || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function createSessionToken(user) {
  const now = Math.floor(Date.now() / 1000);
  return signToken({
    sub: user.id,
    username: user.username,
    role: user.role,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  });
}

function readBearerToken(req) {
  const header = req.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function clampInteger(value, min, max) {
  const next = Math.floor(Number(value));
  if (!Number.isFinite(next)) {
    return min;
  }
  return Math.min(max, Math.max(min, next));
}

function defaultUpgradeLevels() {
  return Object.fromEntries(PARTS_CATALOG.map((part) => [part.id, 0]));
}

function defaultProgress() {
  return {
    version: 1,
    coins: 0,
    bestScore: 0,
    lastScore: 0,
    activeCar: DEFAULT_SETTINGS.carPreset,
    ownedCars: CAR_PRESETS.map((car) => car.id),
    upgrades: defaultUpgradeLevels(),
    installedUpgrades: defaultUpgradeLevels(),
  };
}

function sanitizeProgress(rawProgress) {
  const fallback = defaultProgress();
  const raw = rawProgress && typeof rawProgress === "object" ? rawProgress : {};
  const ownedCars = [
    ...new Set(
      (Array.isArray(raw.ownedCars) ? raw.ownedCars : fallback.ownedCars).filter((id) => CAR_IDS.has(id)),
    ),
  ];

  if (!ownedCars.length) {
    ownedCars.push(DEFAULT_SETTINGS.carPreset);
  }

  const activeCar =
    CAR_IDS.has(raw.activeCar) && ownedCars.includes(raw.activeCar)
      ? raw.activeCar
      : ownedCars.includes(DEFAULT_SETTINGS.carPreset)
        ? DEFAULT_SETTINGS.carPreset
        : ownedCars[0];

  const upgrades = {};
  const installedUpgrades = {};
  for (const [partId, part] of PARTS_BY_ID) {
    const ownedLevel = clampInteger(raw.upgrades?.[partId], 0, part.maxLevel);
    upgrades[partId] = ownedLevel;
    installedUpgrades[partId] = clampInteger(raw.installedUpgrades?.[partId], 0, ownedLevel);
  }

  return {
    version: 1,
    coins: clampInteger(raw.coins, 0, Number.MAX_SAFE_INTEGER),
    bestScore: clampInteger(raw.bestScore, 0, Number.MAX_SAFE_INTEGER),
    lastScore: clampInteger(raw.lastScore, 0, Number.MAX_SAFE_INTEGER),
    activeCar,
    ownedCars,
    upgrades,
    installedUpgrades,
  };
}

async function createStore() {
  if (MONGODB_URI) {
    const client = new MongoClient(MONGODB_URI, { appName: "PolyHesi" });
    await client.connect();
    const db = client.db(MONGODB_DB);
    const users = db.collection("users");
    const saves = db.collection("saves");
    await users.createIndex({ usernameLower: 1 }, { unique: true });
    await saves.createIndex({ userId: 1 }, { unique: true });

    return {
      kind: "mongodb",
      async findUserByUsername(username) {
        return users.findOne({ usernameLower: normalizeUsername(username) });
      },
      async upsertSeedUser(account) {
        const usernameLower = normalizeUsername(account.username);
        const now = new Date();
        await users.updateOne(
          { usernameLower },
          {
            $setOnInsert: { createdAt: now },
            $set: {
              username: account.username,
              usernameLower,
              displayName: account.displayName,
              role: account.role,
              passwordHash: account.passwordHash,
              seeded: true,
              updatedAt: now,
            },
          },
          { upsert: true },
        );
      },
      async getSave(userId) {
        const doc = await saves.findOne({ userId: String(userId) });
        return sanitizeProgress(doc?.progress);
      },
      async saveProgress(userId, progress) {
        const sanitized = sanitizeProgress(progress);
        const now = new Date();
        await saves.updateOne(
          { userId: String(userId) },
          {
            $setOnInsert: { createdAt: now },
            $set: {
              userId: String(userId),
              progress: sanitized,
              updatedAt: now,
            },
          },
          { upsert: true },
        );
        return sanitized;
      },
    };
  }

  console.warn("MONGODB_URI not set. Using in-memory auth/save store for local development only.");
  const users = new Map();
  const saves = new Map();
  return {
    kind: "memory",
    async findUserByUsername(username) {
      return users.get(normalizeUsername(username)) ?? null;
    },
    async upsertSeedUser(account) {
      const usernameLower = normalizeUsername(account.username);
      const existing = users.get(usernameLower);
      users.set(usernameLower, {
        ...(existing ?? {}),
        id: existing?.id ?? `mem_${usernameLower}`,
        username: account.username,
        usernameLower,
        displayName: account.displayName,
        role: account.role,
        passwordHash: account.passwordHash,
        seeded: true,
        updatedAt: new Date().toISOString(),
      });
    },
    async getSave(userId) {
      return sanitizeProgress(saves.get(String(userId)));
    },
    async saveProgress(userId, progress) {
      const sanitized = sanitizeProgress(progress);
      saves.set(String(userId), sanitized);
      return sanitized;
    },
  };
}

async function seedUsers(store) {
  for (const account of SEEDED_ACCOUNTS) {
    const envPassword = process.env[account.passwordEnv];
    await store.upsertSeedUser({
      ...account,
      passwordHash: envPassword ? hashPassword(envPassword) : account.passwordHash,
    });
  }
}

async function main() {
  const store = await createStore();
  await seedUsers(store);

  const app = express();
  app.disable("x-powered-by");
  app.use(compression());
  app.use(express.json({ limit: "256kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, store: store.kind });
  });

  async function requireAuth(req, res, next) {
    const session = verifyToken(readBearerToken(req));
    if (!session) {
      res.status(401).json({ error: "Sessione non valida." });
      return;
    }

    const user = await store.findUserByUsername(session.username);
    const safeUser = user ? publicUser(user) : null;
    if (!safeUser || safeUser.id !== session.sub) {
      res.status(401).json({ error: "Sessione scaduta." });
      return;
    }

    req.user = safeUser;
    next();
  }

  app.post("/api/auth/login", async (req, res) => {
    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password ?? "");
    if (!username || !password) {
      res.status(400).json({ error: "Username e password richiesti." });
      return;
    }

    const user = await store.findUserByUsername(username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: "Credenziali non valide." });
      return;
    }

    const safeUser = publicUser(user);
    res.json({
      token: createSessionToken(safeUser),
      user: safeUser,
      save: await store.getSave(safeUser.id),
    });
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    res.json({
      user: req.user,
      save: await store.getSave(req.user.id),
    });
  });

  app.get("/api/save", requireAuth, async (req, res) => {
    res.json({ save: await store.getSave(req.user.id) });
  });

  app.put("/api/save", requireAuth, async (req, res) => {
    const progress = await store.saveProgress(req.user.id, req.body?.progress);
    res.json({ save: progress });
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Endpoint non trovato." });
  });

  if (isProduction) {
    app.use(express.static(DIST_DIR, { index: false, maxAge: "1y" }));
    app.get(/.*/, (_req, res) => {
      res.sendFile(INDEX_HTML);
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      root: ROOT_DIR,
      appType: "spa",
      server: {
        middlewareMode: true,
        host: "127.0.0.1",
      },
    });
    app.use(vite.middlewares);
  }

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: "Errore server." });
  });

  app.listen(PORT, HOST, () => {
    console.log(`PolyHesi server listening on http://${HOST}:${PORT} (${store.kind})`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
