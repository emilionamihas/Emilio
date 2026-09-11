/* =========================================================
   ASCEND & CONNECT (A&C) — servidor
   Node puro (sin dependencias externas): sirve la API REST
   y los archivos estáticos del frontend desde un solo proceso.
   ========================================================= */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const store = require("./store");
const { listJobs } = require("./jobs");

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, "..");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let size = 0;
    const MAX_BYTES = 200 * 1024; // 200KB, de sobra para un formulario de perfil

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        reject(Object.assign(new Error("Cuerpo demasiado grande"), { status: 413 }));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(Object.assign(new Error("JSON inválido"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(req, res, pathname) {
  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, "");
  const filePath = path.join(ROOT, safePath === "/" ? "index.html" : safePath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Prohibido");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Fallback: si no es un archivo conocido, servir index.html (SPA-friendly)
      fs.readFile(path.join(ROOT, "index.html"), (err2, indexData) => {
        if (err2) {
          res.writeHead(404);
          return res.end("No encontrado");
        }
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
  const parts = url.pathname.split("/").filter(Boolean); // ["api", "profiles", ":id", ...]

  try {
    // GET /api/jobs
    if (parts[1] === "jobs" && req.method === "GET") {
      const jobs = listJobs({
        area: url.searchParams.get("area") || "",
        modalidad: url.searchParams.get("modalidad") || "",
        exclusivo: url.searchParams.get("exclusivo") || ""
      });
      return sendJson(res, 200, { jobs });
    }

    // POST /api/profiles
    if (parts[1] === "profiles" && parts.length === 2 && req.method === "POST") {
      const body = await readBody(req);
      if (!body.fullName || !body.university || !body.career || !body.gradYear) {
        return sendJson(res, 400, { error: "Faltan campos obligatorios (nombre, universidad, carrera, año de graduación)." });
      }
      const profile = store.createProfile(body);
      return sendJson(res, 201, { profile });
    }

    // GET /api/profiles/:id
    if (parts[1] === "profiles" && parts.length === 3 && req.method === "GET") {
      const profile = store.getProfile(parts[2]);
      if (!profile) return sendJson(res, 404, { error: "Perfil no encontrado." });
      return sendJson(res, 200, { profile });
    }

    // PUT /api/profiles/:id
    if (parts[1] === "profiles" && parts.length === 3 && req.method === "PUT") {
      const body = await readBody(req);
      const profile = store.updateProfile(parts[2], body);
      if (!profile) return sendJson(res, 404, { error: "Perfil no encontrado." });
      return sendJson(res, 200, { profile });
    }

    // POST /api/profiles/:id/redeem
    if (parts[1] === "profiles" && parts[3] === "redeem" && req.method === "POST") {
      const body = await readBody(req);
      const result = store.redeemPromoCode(parts[2], body.code);
      if (!result.ok) return sendJson(res, result.status, { error: result.message });
      return sendJson(res, 200, { profile: result.profile });
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

  if (req.method !== "GET") {
    res.writeHead(405);
    return res.end("Método no permitido");
  }

  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`ASCEND & CONNECT escuchando en http://localhost:${PORT}`);
});
