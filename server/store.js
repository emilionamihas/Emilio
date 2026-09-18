/* =========================================================
   ASCEND & CONNECT (A&C) — capa de datos (Postgres)
   Cada función mapea filas snake_case de la base a objetos
   camelCase que el resto del servidor y el frontend consumen.
   ========================================================= */

const crypto = require("crypto");
const db = require("./db");

const ADMIN_PASSPHRASE = process.env.ADMIN_PASSPHRASE || "ACwork";
const PREMIUM_CODE = "ACVIP";
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

/* ---------------------------------------------------------
   Perfiles
--------------------------------------------------------- */
const PROFILE_FIELDS = ["fullName", "email", "phone", "address", "university", "career", "gradYear", "cvLink", "skills", "bio", "photo"];
const PROFILE_COLUMN = { fullName: "full_name", email: "email", phone: "phone", address: "address", university: "university", career: "career", gradYear: "grad_year", cvLink: "cv_link", skills: "skills", bio: "bio", photo: "photo" };

function rowToProfile(row) {
  if (!row) return null;
  return {
    id: row.id, fullName: row.full_name, email: row.email, phone: row.phone, address: row.address,
    university: row.university, career: row.career, gradYear: row.grad_year, cvLink: row.cv_link,
    skills: row.skills, bio: row.bio, photo: row.photo, premium: row.premium, promoCode: row.promo_code,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function clip(value, max) { return String(value == null ? "" : value).slice(0, max); }

async function createProfile(data) {
  const id = data.id || crypto.randomUUID();
  const { rows } = await db.query(
    `INSERT INTO profiles (id, full_name, email, phone, address, university, career, grad_year, cv_link, skills, bio, photo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (id) DO UPDATE SET
       full_name = EXCLUDED.full_name, email = EXCLUDED.email, phone = EXCLUDED.phone, address = EXCLUDED.address,
       university = EXCLUDED.university, career = EXCLUDED.career, grad_year = EXCLUDED.grad_year, cv_link = EXCLUDED.cv_link,
       skills = EXCLUDED.skills, bio = EXCLUDED.bio, photo = EXCLUDED.photo, updated_at = now()
     RETURNING *`,
    [id, clip(data.fullName, 200), clip(data.email, 200), clip(data.phone, 60), clip(data.address, 200),
     clip(data.university, 200), clip(data.career, 200), clip(data.gradYear, 20), clip(data.cvLink, 500),
     clip(data.skills, 1000), clip(data.bio, 4000), clip(data.photo, 500000)]
  );
  return rowToProfile(rows[0]);
}

async function getProfile(id) {
  const { rows } = await db.query("SELECT * FROM profiles WHERE id = $1", [id]);
  return rowToProfile(rows[0]);
}

async function updateProfile(id, data) {
  const sets = [];
  const values = [];
  let i = 1;
  for (const field of PROFILE_FIELDS) {
    if (typeof data[field] === "undefined") continue;
    sets.push(`${PROFILE_COLUMN[field]} = $${i}`);
    values.push(clip(data[field], field === "bio" ? 4000 : field === "photo" ? 500000 : 1000));
    i++;
  }
  if (sets.length === 0) return getProfile(id);
  sets.push(`updated_at = now()`);
  values.push(id);
  const { rows } = await db.query(`UPDATE profiles SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, values);
  return rowToProfile(rows[0]);
}

async function deleteProfile(id) {
  await db.query("DELETE FROM profiles WHERE id = $1", [id]);
}

async function listProfiles() {
  const { rows } = await db.query("SELECT * FROM profiles ORDER BY updated_at DESC");
  return rows.map(rowToProfile);
}

/* ---------------------------------------------------------
   Empleos
--------------------------------------------------------- */
function rowToJob(row) {
  return {
    id: row.id, company: row.company, contactEmail: row.contact_email, title: row.title, location: row.location,
    area: row.area, modalidad: row.modalidad, desc: row.description, exclusivo: row.exclusivo, tags: row.tags || [],
    status: row.status, submittedBy: row.submitted_by, createdAt: row.created_at, resolvedAt: row.resolved_at
  };
}

async function createJob(data, { status, submittedBy }) {
  const { rows } = await db.query(
    `INSERT INTO jobs (company, contact_email, title, location, area, modalidad, description, exclusivo, tags, status, submitted_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [clip(data.company, 200), clip(data.contactEmail, 200), clip(data.title, 200), clip(data.location, 200),
     clip(data.area, 50), clip(data.modalidad, 50), clip(data.desc, 4000), !!data.exclusivo,
     Array.isArray(data.tags) ? data.tags.slice(0, 20).map((t) => clip(t, 60)) : [], status, submittedBy]
  );
  return rowToJob(rows[0]);
}

async function listPublicJobs({ area, modalidad, exclusivo }) {
  const clauses = ["status = 'approved'"];
  const values = [];
  if (area) { values.push(area); clauses.push(`area = $${values.length}`); }
  if (modalidad) { values.push(modalidad); clauses.push(`modalidad = $${values.length}`); }
  if (exclusivo === "true") clauses.push("exclusivo = true");
  const { rows } = await db.query(`SELECT * FROM jobs WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC`, values);
  return rows.map(rowToJob);
}

async function listAllJobs() {
  const { rows } = await db.query("SELECT * FROM jobs ORDER BY created_at DESC");
  return rows.map(rowToJob);
}

async function getJob(id) {
  const { rows } = await db.query("SELECT * FROM jobs WHERE id = $1", [id]);
  return rowToJob(rows[0]);
}

async function setJobStatus(id, status) {
  const { rows } = await db.query("UPDATE jobs SET status = $1, resolved_at = now() WHERE id = $2 RETURNING *", [status, id]);
  return rowToJob(rows[0]);
}

async function deleteJob(id) {
  await db.query("DELETE FROM jobs WHERE id = $1", [id]);
}

/* ---------------------------------------------------------
   Canjes de código premium (requieren aprobación manual)
--------------------------------------------------------- */
function rowToRedemption(row) {
  return { id: row.id, profileId: row.profile_id, profileName: row.profile_name, code: row.code, status: row.status, createdAt: row.created_at, resolvedAt: row.resolved_at };
}

async function createRedemption({ profileId, profileName, code }) {
  const normalized = String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalized !== PREMIUM_CODE) {
    const err = new Error("Código inválido.");
    err.status = 400;
    throw err;
  }
  const { rows } = await db.query(
    "INSERT INTO redemptions (profile_id, profile_name, code) VALUES ($1,$2,$3) RETURNING *",
    [profileId, clip(profileName, 200), normalized]
  );
  return rowToRedemption(rows[0]);
}

async function listRedemptions() {
  const { rows } = await db.query("SELECT * FROM redemptions ORDER BY created_at DESC");
  return rows.map(rowToRedemption);
}

async function listRedemptionsForProfile(profileId) {
  const { rows } = await db.query("SELECT * FROM redemptions WHERE profile_id = $1 ORDER BY created_at DESC", [profileId]);
  return rows.map(rowToRedemption);
}

async function decideRedemption(id, approve) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "UPDATE redemptions SET status = $1, resolved_at = now() WHERE id = $2 RETURNING *",
      [approve ? "approved" : "rejected", id]
    );
    const redemption = rows[0];
    if (redemption && approve) {
      await client.query("UPDATE profiles SET premium = true, promo_code = $1, updated_at = now() WHERE id = $2", [redemption.code, redemption.profile_id]);
    }
    await client.query("COMMIT");
    return rowToRedemption(redemption);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function deleteRedemption(id) {
  await db.query("DELETE FROM redemptions WHERE id = $1", [id]);
}

/* ---------------------------------------------------------
   Postulaciones
--------------------------------------------------------- */
function rowToApplication(row) {
  return {
    id: row.id, jobId: row.job_id, jobTitle: row.job_title, company: row.company, companyEmail: row.company_email,
    profileId: row.profile_id, profileName: row.profile_name, profileEmail: row.profile_email, profilePhone: row.profile_phone,
    status: row.status, createdAt: row.created_at, resolvedAt: row.resolved_at
  };
}

async function createApplication({ job, profile }) {
  try {
    const { rows } = await db.query(
      `INSERT INTO applications (job_id, job_title, company, company_email, profile_id, profile_name, profile_email, profile_phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [job.id, job.title, job.company, job.contactEmail || "", profile.id, profile.fullName, profile.email, profile.phone || ""]
    );
    return rowToApplication(rows[0]);
  } catch (err) {
    if (err.code === "23505") { // unique_violation: ya se había postulado
      const { rows } = await db.query("SELECT * FROM applications WHERE job_id = $1 AND profile_id = $2", [job.id, profile.id]);
      return rowToApplication(rows[0]);
    }
    throw err;
  }
}

async function listApplicationsForProfile(profileId) {
  const { rows } = await db.query("SELECT * FROM applications WHERE profile_id = $1", [profileId]);
  return rows.map(rowToApplication);
}

async function listApplications() {
  const { rows } = await db.query("SELECT * FROM applications ORDER BY created_at DESC");
  return rows.map(rowToApplication);
}

async function setApplicationStatus(id, status) {
  const { rows } = await db.query("UPDATE applications SET status = $1, resolved_at = now() WHERE id = $2 RETURNING *", [status, id]);
  return rowToApplication(rows[0]);
}

async function deleteApplication(id) {
  await db.query("DELETE FROM applications WHERE id = $1", [id]);
}

/* ---------------------------------------------------------
   Candidatos guardados (vista de reclutador)
--------------------------------------------------------- */
function rowToSavedCandidate(row) {
  return { profileId: row.profile_id, profileName: row.profile_name, profileEmail: row.profile_email, profilePhone: row.profile_phone, career: row.career, university: row.university, premium: row.premium, savedAt: row.saved_at };
}

async function saveCandidate(profile) {
  const { rows } = await db.query(
    `INSERT INTO saved_candidates (profile_id, profile_name, profile_email, profile_phone, career, university, premium, saved_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now())
     ON CONFLICT (profile_id) DO UPDATE SET
       profile_name = EXCLUDED.profile_name, profile_email = EXCLUDED.profile_email, profile_phone = EXCLUDED.profile_phone,
       career = EXCLUDED.career, university = EXCLUDED.university, premium = EXCLUDED.premium, saved_at = now()
     RETURNING *`,
    [profile.id, profile.fullName, profile.email || "", profile.phone || "", profile.career || "", profile.university || "", !!profile.premium]
  );
  return rowToSavedCandidate(rows[0]);
}

async function listSavedCandidates() {
  const { rows } = await db.query("SELECT * FROM saved_candidates ORDER BY saved_at DESC");
  return rows.map(rowToSavedCandidate);
}

async function removeSavedCandidate(profileId) {
  await db.query("DELETE FROM saved_candidates WHERE profile_id = $1", [profileId]);
}

/* ---------------------------------------------------------
   Autenticación del panel de administración
   (contraseña por variable de entorno + sesión en el servidor,
   nunca en el JavaScript del cliente)
--------------------------------------------------------- */
async function adminLogin(passphrase) {
  if (passphrase !== ADMIN_PASSPHRASE) {
    const err = new Error("Contraseña incorrecta.");
    err.status = 401;
    throw err;
  }
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS);
  await db.query("INSERT INTO admin_sessions (token, expires_at) VALUES ($1, $2)", [token, expiresAt]);
  return token;
}

async function adminLogout(token) {
  await db.query("DELETE FROM admin_sessions WHERE token = $1", [token]);
}

async function isValidAdminSession(token) {
  if (!token) return false;
  const { rows } = await db.query("SELECT 1 FROM admin_sessions WHERE token = $1 AND expires_at > now()", [token]);
  return rows.length > 0;
}

module.exports = {
  createProfile, getProfile, updateProfile, deleteProfile, listProfiles,
  createJob, listPublicJobs, listAllJobs, getJob, setJobStatus, deleteJob,
  createRedemption, listRedemptions, listRedemptionsForProfile, decideRedemption, deleteRedemption,
  createApplication, listApplicationsForProfile, listApplications, setApplicationStatus, deleteApplication,
  saveCandidate, listSavedCandidates, removeSavedCandidate,
  adminLogin, adminLogout, isValidAdminSession,
  PREMIUM_CODE
};
