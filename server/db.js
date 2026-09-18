/* =========================================================
   ASCEND & CONNECT (A&C) — conexión y esquema de Postgres
   ========================================================= */

const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error("Falta la variable de entorno DATABASE_URL. En Render se completa sola al desplegar el Blueprint (render.yaml); en local, exportala apuntando a tu Postgres.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render exige TLS para su Postgres administrado, pero con un certificado
  // que node no valida por defecto contra su CA; en local (sin sslmode) esto no aplica.
  ssl: process.env.DATABASE_URL.includes("localhost") || process.env.DATABASE_URL.includes("127.0.0.1")
    ? false
    : { rejectUnauthorized: false }
});

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    university TEXT NOT NULL DEFAULT '',
    career TEXT NOT NULL DEFAULT '',
    grad_year TEXT NOT NULL DEFAULT '',
    cv_link TEXT NOT NULL DEFAULT '',
    skills TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '',
    photo TEXT NOT NULL DEFAULT '',
    premium BOOLEAN NOT NULL DEFAULT false,
    promo_code TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company TEXT NOT NULL,
    contact_email TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    location TEXT NOT NULL,
    area TEXT NOT NULL,
    modalidad TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    exclusivo BOOLEAN NOT NULL DEFAULT false,
    tags TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending',
    submitted_by TEXT NOT NULL DEFAULT 'empresa',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    profile_name TEXT NOT NULL DEFAULT '',
    code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    job_title TEXT NOT NULL,
    company TEXT NOT NULL,
    company_email TEXT NOT NULL DEFAULT '',
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    profile_name TEXT NOT NULL DEFAULT '',
    profile_email TEXT NOT NULL DEFAULT '',
    profile_phone TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'nueva',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    UNIQUE (job_id, profile_id)
  );

  CREATE TABLE IF NOT EXISTS saved_candidates (
    profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    profile_name TEXT NOT NULL DEFAULT '',
    profile_email TEXT NOT NULL DEFAULT '',
    profile_phone TEXT NOT NULL DEFAULT '',
    career TEXT NOT NULL DEFAULT '',
    university TEXT NOT NULL DEFAULT '',
    premium BOOLEAN NOT NULL DEFAULT false,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
  );
`;

let ready = null;
function ensureSchema() {
  if (!ready) ready = pool.query(SCHEMA);
  return ready;
}

async function query(text, params) {
  await ensureSchema();
  return pool.query(text, params);
}

module.exports = { pool, query, ensureSchema };
