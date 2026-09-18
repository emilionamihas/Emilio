/* =========================================================
   ASCEND & CONNECT (A&C) — servidor
   Node + Postgres. Sirve la API REST y los archivos estáticos
   del frontend desde un solo proceso.
   ========================================================= */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const store = require("./store");

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, "..");
const ADMIN_COOKIE = "ac_admin_token";
const MAX_BODY_BYTES = 800 * 1024; // hasta ~800KB, de sobra para una foto de perfil comprimida

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function sendJson(res, status, payload, extraHeaders) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), ...(extraHeaders || {}) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Cuerpo demasiado grande"), { status: 413 }));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (err) { reject(Object.assign(new Error("JSON inválido"), { status: 400 })); }
    });
    req.on("error", reject);
  });
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

function setAdminCookie(req, res, token, maxAgeSeconds) {
  const isHttps = req.socket.encrypted || req.headers["x-forwarded-proto"] === "https";
  const attrs = [`${ADMIN_COOKIE}=${encodeURIComponent(token)}`, "HttpOnly", "Path=/", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`];
  if (isHttps) attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
}

function clearAdminCookie(req, res) {
  setAdminCookie(req, res, "", 0);
}

async function requireAdmin(req, res) {
  const token = parseCookies(req)[ADMIN_COOKIE];
  const ok = await store.isValidAdminSession(token);
  if (!ok) { sendJson(res, 401, { error: "No autenticado como administrador." }); return false; }
  return true;
}

function serveStatic(req, res, pathname) {
  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, "");
  const filePath = path.join(ROOT, safePath === "/" ? "index.html" : safePath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end("Prohibido"); }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(ROOT, "index.html"), (err2, indexData) => {
        if (err2) { res.writeHead(404); return res.end("No encontrado"); }
        res.writeHead(200, { "Content-Type": MIME_TYPES[".html"] });
        res.end(indexData);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]

  try {
    /* ---------- Empleos (público) ---------- */
    if (parts[1] === "jobs" && parts.length === 2 && req.method === "GET") {
      const jobs = await store.listPublicJobs({
        area: url.searchParams.get("area") || "",
        modalidad: url.searchParams.get("modalidad") || "",
        exclusivo: url.searchParams.get("exclusivo") || ""
      });
      return sendJson(res, 200, { jobs });
    }

    if (parts[1] === "jobs" && parts.length === 2 && req.method === "POST") {
      const body = await readBody(req);
      if (!body.company || !body.contactEmail || !body.title || !body.location || !body.area || !body.modalidad || !body.desc) {
        return sendJson(res, 400, { error: "Completa los campos obligatorios de la oferta." });
      }
      const job = await store.createJob(body, { status: "pending", submittedBy: "empresa" });
      return sendJson(res, 201, { job });
    }

    /* ---------- Perfiles (público) ---------- */
    if (parts[1] === "profiles" && parts.length === 2 && req.method === "POST") {
      const body = await readBody(req);
      if (!body.fullName || !body.email || !body.university || !body.career || !body.gradYear) {
        return sendJson(res, 400, { error: "Faltan campos obligatorios (nombre, correo, universidad, carrera, año de graduación)." });
      }
      const profile = await store.createProfile(body);
      return sendJson(res, 201, { profile });
    }

    if (parts[1] === "profiles" && parts.length === 3 && req.method === "GET") {
      const profile = await store.getProfile(parts[2]);
      if (!profile) return sendJson(res, 404, { error: "Perfil no encontrado." });
      return sendJson(res, 200, { profile });
    }

    if (parts[1] === "profiles" && parts.length === 3 && req.method === "PUT") {
      const body = await readBody(req);
      const profile = await store.updateProfile(parts[2], body);
      if (!profile) return sendJson(res, 404, { error: "Perfil no encontrado." });
      return sendJson(res, 200, { profile });
    }

    if (parts[1] === "profiles" && parts[3] === "redeem" && req.method === "POST") {
      const body = await readBody(req);
      const profile = await store.getProfile(parts[2]);
      if (!profile) return sendJson(res, 404, { error: "Perfil no encontrado." });
      if (!profile.fullName) return sendJson(res, 400, { error: "Completa tu perfil antes de canjear un código." });
      const redemption = await store.createRedemption({ profileId: profile.id, profileName: profile.fullName, code: body.code });
      return sendJson(res, 201, { redemption });
    }

    /* ---------- Canje de código: seguimiento del propio egresado ---------- */
    if (parts[1] === "redemptions" && parts.length === 2 && req.method === "GET") {
      const profileId = url.searchParams.get("profileId");
      if (!profileId) return sendJson(res, 400, { error: "Falta profileId." });
      const redemptions = await store.listRedemptionsForProfile(profileId);
      return sendJson(res, 200, { redemptions });
    }

    /* ---------- Postulaciones (público) ---------- */
    if (parts[1] === "applications" && parts.length === 2 && req.method === "GET") {
      const profileId = url.searchParams.get("profileId");
      if (!profileId) return sendJson(res, 400, { error: "Falta profileId." });
      const applications = await store.listApplicationsForProfile(profileId);
      return sendJson(res, 200, { applications });
    }

    if (parts[1] === "applications" && parts.length === 2 && req.method === "POST") {
      const body = await readBody(req);
      const job = await store.getJob(body.jobId);
      const profile = await store.getProfile(body.profileId);
      if (!job || job.status !== "approved") return sendJson(res, 404, { error: "Esa oferta ya no está disponible." });
      if (!profile || !profile.fullName || !profile.email) return sendJson(res, 400, { error: "Completa tu perfil (con correo) antes de postularte." });
      const application = await store.createApplication({ job, profile });
      return sendJson(res, 201, { application });
    }

    /* ---------- Candidatos guardados (público, vista de reclutador) ---------- */
    if (parts[1] === "saved-candidates" && parts.length === 2 && req.method === "GET") {
      const savedCandidates = await store.listSavedCandidates();
      return sendJson(res, 200, { savedCandidates });
    }

    if (parts[1] === "saved-candidates" && parts.length === 2 && req.method === "POST") {
      const body = await readBody(req);
      const profile = await store.getProfile(body.profileId);
      if (!profile || !profile.fullName) return sendJson(res, 404, { error: "Perfil no encontrado." });
      const saved = await store.saveCandidate(profile);
      return sendJson(res, 201, { saved });
    }

    if (parts[1] === "saved-candidates" && parts.length === 3 && req.method === "DELETE") {
      await store.removeSavedCandidate(parts[2]);
      return sendJson(res, 200, { ok: true });
    }

    /* ---------- Administración ---------- */
    if (parts[1] === "admin" && parts[2] === "login" && req.method === "POST") {
      const body = await readBody(req);
      try {
        const token = await store.adminLogin(body.passphrase);
        setAdminCookie(req, res, token, 12 * 60 * 60);
        return sendJson(res, 200, { ok: true });
      } catch (err) {
        return sendJson(res, err.status || 401, { error: err.message });
      }
    }

    if (parts[1] === "admin" && parts[2] === "logout" && req.method === "POST") {
      const token = parseCookies(req)[ADMIN_COOKIE];
      await store.adminLogout(token);
      clearAdminCookie(req, res);
      return sendJson(res, 200, { ok: true });
    }

    if (parts[1] === "admin" && parts[2] === "session" && req.method === "GET") {
      const token = parseCookies(req)[ADMIN_COOKIE];
      return sendJson(res, 200, { authenticated: await store.isValidAdminSession(token) });
    }

    // Todo lo demás bajo /api/admin/ exige sesión válida
    if (parts[1] === "admin") {
      if (!(await requireAdmin(req, res))) return;

      if (parts[2] === "jobs" && parts.length === 3 && req.method === "GET") {
        return sendJson(res, 200, { jobs: await store.listAllJobs() });
      }
      if (parts[2] === "jobs" && parts.length === 3 && req.method === "POST") {
        const body = await readBody(req);
        if (!body.company || !body.title || !body.location || !body.area || !body.modalidad || !body.desc) {
          return sendJson(res, 400, { error: "Completa los campos obligatorios (*)." });
        }
        const job = await store.createJob(body, { status: "approved", submittedBy: "admin" });
        return sendJson(res, 201, { job });
      }
      if (parts[2] === "jobs" && parts[4] === "approve" && req.method === "POST") {
        return sendJson(res, 200, { job: await store.setJobStatus(parts[3], "approved") });
      }
      if (parts[2] === "jobs" && parts[4] === "reject" && req.method === "POST") {
        return sendJson(res, 200, { job: await store.setJobStatus(parts[3], "rejected") });
      }
      if (parts[2] === "jobs" && parts.length === 4 && req.method === "DELETE") {
        await store.deleteJob(parts[3]);
        return sendJson(res, 200, { ok: true });
      }

      if (parts[2] === "redemptions" && parts.length === 3 && req.method === "GET") {
        return sendJson(res, 200, { redemptions: await store.listRedemptions() });
      }
      if (parts[2] === "redemptions" && parts[4] === "approve" && req.method === "POST") {
        return sendJson(res, 200, { redemption: await store.decideRedemption(parts[3], true) });
      }
      if (parts[2] === "redemptions" && parts[4] === "reject" && req.method === "POST") {
        return sendJson(res, 200, { redemption: await store.decideRedemption(parts[3], false) });
      }
      if (parts[2] === "redemptions" && parts.length === 4 && req.method === "DELETE") {
        await store.deleteRedemption(parts[3]);
        return sendJson(res, 200, { ok: true });
      }

      if (parts[2] === "applications" && parts.length === 3 && req.method === "GET") {
        return sendJson(res, 200, { applications: await store.listApplications() });
      }
      if (parts[2] === "applications" && parts[4] === "status" && req.method === "POST") {
        const body = await readBody(req);
        if (!["nueva", "contactada", "cerrada"].includes(body.status)) return sendJson(res, 400, { error: "Estado inválido." });
        return sendJson(res, 200, { application: await store.setApplicationStatus(parts[3], body.status) });
      }
      if (parts[2] === "applications" && parts.length === 4 && req.method === "DELETE") {
        await store.deleteApplication(parts[3]);
        return sendJson(res, 200, { ok: true });
      }

      if (parts[2] === "profiles" && parts.length === 3 && req.method === "GET") {
        return sendJson(res, 200, { profiles: await store.listProfiles() });
      }
      if (parts[2] === "profiles" && parts.length === 4 && req.method === "DELETE") {
        await store.deleteProfile(parts[3]);
        return sendJson(res, 200, { ok: true });
      }

      return sendJson(res, 404, { error: "Ruta de administración no encontrada." });
    }

    return sendJson(res, 404, { error: "Ruta de API no encontrada." });
  } catch (err) {
    return sendJson(res, err.status || 500, { error: err.message || "Error interno del servidor." });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url);
    return;
  }

  if (req.method !== "GET") { res.writeHead(405); return res.end("Método no permitido"); }
  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`ASCEND & CONNECT escuchando en http://localhost:${PORT}`);
});
