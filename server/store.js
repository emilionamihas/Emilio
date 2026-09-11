/* =========================================================
   ASCEND & CONNECT (A&C) — capa de persistencia
   Almacenamiento simple en un archivo JSON. Suficiente para
   una primera versión con backend real; en producción esto
   se reemplaza por una base de datos (Postgres, Mongo, etc).
   ========================================================= */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const VALID_PROMO_CODES = ["AC2026", "A&CVIP", "PREMIUM2026"];

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ profiles: {} }, null, 2));
  }
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(DB_FILE, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    return { profiles: {} };
  }
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

const PROFILE_FIELDS = [
  "fullName",
  "address",
  "university",
  "career",
  "gradYear",
  "cvLink",
  "skills",
  "bio"
];

function sanitizeInput(data) {
  const clean = {};
  PROFILE_FIELDS.forEach((field) => {
    if (typeof data[field] !== "undefined") {
      clean[field] = String(data[field]).trim().slice(0, 4000);
    }
  });
  return clean;
}

function createProfile(data) {
  const db = readDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const profile = {
    id,
    ...PROFILE_FIELDS.reduce((acc, f) => ({ ...acc, [f]: "" }), {}),
    ...sanitizeInput(data),
    premium: false,
    promoCode: "",
    createdAt: now,
    updatedAt: now
  };
  db.profiles[id] = profile;
  writeDb(db);
  return profile;
}

function getProfile(id) {
  const db = readDb();
  return db.profiles[id] || null;
}

function updateProfile(id, data) {
  const db = readDb();
  const existing = db.profiles[id];
  if (!existing) return null;
  const updated = {
    ...existing,
    ...sanitizeInput(data),
    updatedAt: new Date().toISOString()
  };
  db.profiles[id] = updated;
  writeDb(db);
  return updated;
}

function normalizeCode(raw) {
  return String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
}

function redeemPromoCode(id, code) {
  const db = readDb();
  const profile = db.profiles[id];
  if (!profile) return { ok: false, status: 404, message: "Perfil no encontrado." };
  if (!profile.fullName) {
    return { ok: false, status: 400, message: "Completa tu perfil antes de activar el Pase Premium." };
  }

  const normalized = normalizeCode(code);
  const isValid = VALID_PROMO_CODES.some((valid) => normalizeCode(valid) === normalized);

  if (!isValid) {
    return { ok: false, status: 400, message: "Ese código no es válido o ya expiró." };
  }

  profile.premium = true;
  profile.promoCode = normalized;
  profile.updatedAt = new Date().toISOString();
  db.profiles[id] = profile;
  writeDb(db);

  return { ok: true, profile };
}

module.exports = {
  createProfile,
  getProfile,
  updateProfile,
  redeemPromoCode,
  PROFILE_FIELDS
};
