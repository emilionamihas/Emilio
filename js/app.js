/* =========================================================
   ASCEND & CONNECT (A&C)
   Frontend: navegación, empleos, perfil, códigos premium,
   postulaciones, candidatos guardados y panel de administración.
   Todo pasa por la API REST del servidor — no hay datos ni
   contraseñas guardados en este archivo.
   ========================================================= */

(function () {
  "use strict";

  const SESSION_KEY = "ac_session_id";
  const PHOTO_SIZE = 220;
  const AREA_LABELS = { tecnologia: "Tecnología & Datos", marketing: "Marketing & Contenido", finanzas: "Finanzas & Administración", diseno: "Diseño & Producto", ventas: "Ventas & Atención al cliente", ingenieria: "Ingeniería & Operaciones" };
  const MODALIDAD_LABELS = { remoto: "Remoto", presencial: "Presencial", hibrido: "Híbrido" };
  const STATUS_LABELS = { pending: "En revisión", approved: "Aprobado", rejected: "Rechazado" };
  const APP_STATUS_LABELS = { nueva: "Nueva", contactada: "Contactada", cerrada: "Cerrada" };
  const APP_STATUS_CLASS = { nueva: "badge--pending", contactada: "badge--muted", cerrada: "badge--approved" };

  const emptyProfile = () => ({ fullName: "", email: "", phone: "", address: "", university: "", career: "", gradYear: "", cvLink: "", skills: "", bio: "", photo: "", premium: false, promoCode: "", updatedAt: "" });

  let sessionId = "";
  let currentProfile = emptyProfile();
  let latestRedemption = null;
  let pendingPhoto = null;
  let appliedJobIds = new Set();
  let savedCandidatesCache = [];
  let isAdmin = false;

  /* ---------------------------------------------------------
     Utilidades
  --------------------------------------------------------- */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $all(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }
  function escapeHtml(str) { if (!str) return ""; return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function getInitials(name) { if (!name) return "A&C"; const parts = name.trim().split(/\s+/).filter(Boolean); if (parts.length === 0) return "A&C"; if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase(); return (parts[0][0] + parts[1][0]).toUpperCase(); }
  function fmtDate(iso) { if (!iso) return ""; try { return new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" }); } catch (e) { return ""; } }
  function errDetail(err) { const d = err && err.message; return d ? ` (${d})` : ""; }

  let toastTimer = null;
  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
  }

  function getOrCreateSessionId() {
    try {
      let id = localStorage.getItem(SESSION_KEY);
      if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)); localStorage.setItem(SESSION_KEY, id); }
      return id;
    } catch (err) { return "session-" + Math.random().toString(16).slice(2); }
  }

  async function api(path, options) {
    const res = await fetch(path, { headers: { "Content-Type": "application/json" }, credentials: "same-origin", ...options });
    let data = {};
    try { data = await res.json(); } catch (err) { /* sin cuerpo */ }
    if (!res.ok) throw new Error(data.error || `Error de red (${res.status})`);
    return data;
  }

  function wireConfirmButton(btn, action) {
    if (!btn) return;
    const original = btn.textContent;
    let armed = false, timer = null;
    btn.addEventListener("click", () => {
      if (!armed) {
        armed = true;
        btn.textContent = "¿Confirmar?";
        timer = setTimeout(() => { armed = false; btn.textContent = original; }, 3000);
      } else {
        clearTimeout(timer);
        action();
      }
    });
  }

  function readAndResizeImage(file, size) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Archivo de imagen inválido."));
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext("2d");
          const minSide = Math.min(img.width, img.height);
          const sx = (img.width - minSide) / 2, sy = (img.height - minSide) / 2;
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
          resolve(canvas.toDataURL("image/jpeg", 0.72));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function initPhotoInput() {
    $("#photoInput").addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) { showToast("La imagen es muy pesada (máx. 8MB)."); e.target.value = ""; return; }
      try {
        const dataUrl = await readAndResizeImage(file, PHOTO_SIZE);
        pendingPhoto = dataUrl;
        const preview = $("#photoPreview");
        preview.src = dataUrl; preview.hidden = false;
      } catch (err) { showToast("No se pudo procesar la imagen."); }
    });
  }

  /* ---------------------------------------------------------
     Perfil
  --------------------------------------------------------- */
  function fillProfileForm(profile) {
    $("#fullName").value = profile.fullName || ""; $("#email").value = profile.email || ""; $("#phone").value = profile.phone || "";
    $("#address").value = profile.address || "";
    $("#university").value = profile.university || ""; $("#career").value = profile.career || "";
    $("#gradYear").value = profile.gradYear || ""; $("#cvLink").value = profile.cvLink || "";
    $("#skills").value = profile.skills || ""; $("#bio").value = profile.bio || "";
    const preview = $("#photoPreview");
    if (profile.photo) { preview.src = profile.photo; preview.hidden = false; } else { preview.src = ""; preview.hidden = true; }
    pendingPhoto = null;
  }

  function renderMiniCard(profile) {
    const box = $("#profileMiniCard");
    if (!profile.fullName) { box.innerHTML = `<p class="empty-state">Aún no has guardado un perfil.</p>`; return; }
    const avatar = profile.photo
      ? `<img src="${profile.photo}" alt="" style="width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0;">`
      : `<div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,var(--emerald-soft),var(--emerald));display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-weight:700;color:var(--text-on-emerald);flex-shrink:0;">${escapeHtml(getInitials(profile.fullName))}</div>`;
    box.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center;">
        ${avatar}
        <div>
          <div class="mini-card__name">${escapeHtml(profile.fullName)} ${profile.premium ? '<span class="badge badge--premium">Destacado</span>' : ""}</div>
          <div class="mini-card__meta">${escapeHtml(profile.career || "Carrera no especificada")}</div>
        </div>
      </div>
      <div class="mini-card__meta">${escapeHtml(profile.university || "")}${profile.gradYear ? " · " + escapeHtml(String(profile.gradYear)) : ""}</div>
    `;
  }

  function renderPremiumStatus(profile) {
    const box = $("#premiumStatusBox");
    box.innerHTML = profile.premium
      ? `<span class="badge badge--premium">Perfil Destacado activo</span><p>Tu perfil tiene prioridad en el motor de búsqueda de las empresas.</p>`
      : `<span class="badge badge--muted">Perfil estándar</span><p>Canjea un código válido para desbloquear los beneficios premium.</p>`;
  }

  async function refreshRedemptionTrack() {
    if (!sessionId || !currentProfile.fullName) { $("#redemptionTrack").hidden = true; return; }
    try {
      const { redemptions } = await api(`/api/redemptions?profileId=${encodeURIComponent(sessionId)}`);
      latestRedemption = redemptions[0] || null;
    } catch (err) { latestRedemption = null; }
    renderRedemptionTrack();
  }

  function renderRedemptionTrack() {
    const track = $("#redemptionTrack");
    const row = $("#redemptionTrackRow");
    if (!latestRedemption) { track.hidden = true; return; }
    track.hidden = false;
    const cls = latestRedemption.status === "approved" ? "badge--approved" : latestRedemption.status === "rejected" ? "badge--rejected" : "badge--pending";
    row.innerHTML = `<span class="badge ${cls}">${STATUS_LABELS[latestRedemption.status] || latestRedemption.status}</span>`;
  }

  async function onProfileChange() {
    fillProfileForm(currentProfile);
    renderMiniCard(currentProfile);
    renderPremiumStatus(currentProfile);
    if (!$("#view-empleos").hidden) renderJobs();
    if (!$("#view-reclutador").hidden) renderRecruiterView();
    refreshRedemptionTrack();
  }

  async function loadCurrentProfile() {
    if (!sessionId) return;
    try {
      const { profile } = await api(`/api/profiles/${sessionId}`);
      currentProfile = { ...emptyProfile(), ...profile };
    } catch (err) {
      currentProfile = emptyProfile();
    }
    onProfileChange();
  }

  function initProfileForm() {
    $("#profileForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fullName = $("#fullName").value.trim(), email = $("#email").value.trim(), university = $("#university").value.trim(), career = $("#career").value.trim(), gradYear = $("#gradYear").value.trim();
      const status = $("#profileStatus"), saveBtn = $("#saveProfileBtn");
      if (!fullName || !email || !university || !career || !gradYear) { status.className = "form-status is-error"; status.textContent = "Completa los campos obligatorios (*) antes de guardar."; return; }

      const payload = {
        id: sessionId, fullName, email, phone: $("#phone").value.trim(), university, career, gradYear,
        address: $("#address").value.trim(), cvLink: $("#cvLink").value.trim(), skills: $("#skills").value.trim(), bio: $("#bio").value.trim(),
        photo: pendingPhoto !== null ? pendingPhoto : (currentProfile.photo || "")
      };

      saveBtn.disabled = true; status.className = "form-status is-saving"; status.textContent = "Guardando…";
      try {
        const data = currentProfile.createdAt
          ? await api(`/api/profiles/${sessionId}`, { method: "PUT", body: JSON.stringify(payload) })
          : await api("/api/profiles", { method: "POST", body: JSON.stringify(payload) });
        currentProfile = data.profile;
        status.className = "form-status"; status.textContent = "Perfil guardado correctamente.";
        renderMiniCard(currentProfile);
        showToast("Tu perfil se guardó correctamente.");
      } catch (err) { status.className = "form-status is-error"; status.textContent = "No se pudo guardar el perfil." + errDetail(err); }
      finally { saveBtn.disabled = false; }
    });
  }

  /* ---------------------------------------------------------
     Códigos premium
  --------------------------------------------------------- */
  function initPromoForm() {
    $("#promoForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = $("#promoCode"); const status = $("#promoStatus");
      const code = input.value.trim();
      if (!sessionId || !currentProfile.fullName) { status.className = "form-status is-error"; status.textContent = "Primero completa tu perfil."; return; }
      if (!code) { status.className = "form-status is-error"; status.textContent = "Ingresa un código."; return; }

      try {
        await api(`/api/profiles/${sessionId}/redeem`, { method: "POST", body: JSON.stringify({ code }) });
        status.className = "form-status"; status.textContent = "Código enviado. Un administrador lo revisará y activará tu Pase Premium.";
        input.value = "";
        showToast("Tu código quedó en revisión.");
        refreshRedemptionTrack();
      } catch (err) { status.className = "form-status is-error"; status.textContent = "No se pudo enviar el código." + errDetail(err); }
    });
  }

  /* ---------------------------------------------------------
     Empleos
  --------------------------------------------------------- */
  function labelModalidad(mod) { return MODALIDAD_LABELS[mod] || mod; }

  async function renderJobs() {
    const grid = $("#jobsGrid");
    const area = $("#filterArea").value, modalidad = $("#filterModalidad").value, soloExclusivo = $("#filterExclusivo").checked;
    const params = new URLSearchParams();
    if (area) params.set("area", area);
    if (modalidad) params.set("modalidad", modalidad);
    if (soloExclusivo) params.set("exclusivo", "true");

    let jobs = [];
    try { jobs = (await api(`/api/jobs?${params.toString()}`)).jobs; }
    catch (err) { grid.innerHTML = `<div class="empty-state">No se pudieron cargar las ofertas.</div>`; $("#jobsCount").textContent = "0 ofertas encontradas"; return; }

    if (currentProfile.premium) jobs = [...jobs].sort((a, b) => Number(b.exclusivo) - Number(a.exclusivo));

    $("#jobsCount").textContent = `${jobs.length} oferta${jobs.length === 1 ? "" : "s"} encontrada${jobs.length === 1 ? "" : "s"}`;

    if (jobs.length === 0) { grid.innerHTML = `<div class="empty-state">Todavía no hay ofertas publicadas.</div>`; return; }

    let appliedSet = new Set();
    if (sessionId) {
      try { appliedSet = new Set((await api(`/api/applications?profileId=${encodeURIComponent(sessionId)}`)).applications.map((a) => a.jobId)); }
      catch (err) { /* si falla, simplemente no se marcan como postuladas */ }
    }
    appliedJobIds = appliedSet;

    grid.innerHTML = jobs.map((job) => `
      <article class="job-card">
        <div class="job-card__top">
          <div><div class="job-card__title">${escapeHtml(job.title)}</div><div class="job-card__company">${escapeHtml(job.company)}</div></div>
          ${job.exclusivo ? '<span class="badge badge--exclusive">Exclusiva egresados</span>' : ""}
        </div>
        <p class="job-card__desc">${escapeHtml(job.desc)}</p>
        <div class="job-card__tags">${(job.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>
        <div class="job-card__footer">
          <span class="job-card__location">${escapeHtml(job.location)} · ${labelModalidad(job.modalidad)}</span>
          ${appliedJobIds.has(job.id)
            ? `<button type="button" class="btn btn--ghost" disabled>Postulado ✓</button>`
            : `<button type="button" class="btn btn--ghost" data-apply-id="${job.id}">Postularme</button>`}
        </div>
      </article>
    `).join("");

    $all("[data-apply-id]").forEach((btn) => btn.addEventListener("click", () => submitApplication(jobs.find((j) => j.id === btn.dataset.applyId))));
  }

  async function submitApplication(job) {
    if (!job) return;
    if (!sessionId || !currentProfile.fullName || !currentProfile.email) { showToast("Completa tu perfil (con correo) antes de postularte."); return; }
    try {
      await api("/api/applications", { method: "POST", body: JSON.stringify({ jobId: job.id, profileId: sessionId }) });
      showToast(`Postulación enviada a ${job.title}. ¡Éxito!`);
      renderJobs();
    } catch (err) { showToast("No se pudo enviar la postulación." + errDetail(err)); }
  }

  function initJobFilters() { ["#filterArea", "#filterModalidad", "#filterExclusivo"].forEach((sel) => $(sel).addEventListener("change", renderJobs)); }

  function initJobPublishForm() {
    $("#jobForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = $("#jobFormStatus"); const btn = $("#jobSubmitBtn");
      const company = $("#jobCompany").value.trim(), contactEmail = $("#jobContact").value.trim(), title = $("#jobTitle").value.trim(), location = $("#jobLocation").value.trim(), area = $("#jobArea").value, modalidad = $("#jobModalidad").value, desc = $("#jobDesc").value.trim();
      if (!company || !contactEmail || !title || !location || !area || !modalidad || !desc) { status.className = "form-status is-error"; status.textContent = "Completa los campos obligatorios (*) antes de enviar."; return; }

      const job = { company, contactEmail, title, location, area, modalidad, desc, exclusivo: $("#jobExclusivo").checked, tags: $("#jobTags").value.split(",").map((t) => t.trim()).filter(Boolean) };
      btn.disabled = true; status.className = "form-status is-saving"; status.textContent = "Enviando…";
      try {
        await api("/api/jobs", { method: "POST", body: JSON.stringify(job) });
        status.className = "form-status"; status.textContent = "¡Listo! Tu oferta quedó enviada a revisión.";
        $("#jobForm").reset();
        showToast("Oferta enviada. Te avisaremos cuando esté publicada.");
      } catch (err) { status.className = "form-status is-error"; status.textContent = "No se pudo enviar la oferta." + errDetail(err); }
      finally { btn.disabled = false; }
    });
  }

  /* ---------------------------------------------------------
     Vista de reclutador + candidatos guardados
  --------------------------------------------------------- */
  function renderRecruiterCard(profile, profileId) {
    const container = $("#recruiterView");
    if (!profile.fullName) { container.innerHTML = `<p class="empty-state">Todavía no hay un perfil guardado. Ve a "Mi perfil" para crear el tuyo y mira cómo lo verían las empresas.</p>`; return; }
    const skillsList = (profile.skills || "").split(",").map((s) => s.trim()).filter(Boolean);
    container.innerHTML = `
      <div class="recruiter-card">
        <div class="recruiter-card__avatar">${profile.photo ? `<img src="${profile.photo}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:20px;">` : escapeHtml(getInitials(profile.fullName))}</div>
        <div class="recruiter-card__main">
          <div class="recruiter-card__headline"><span class="recruiter-card__name">${escapeHtml(profile.fullName)}</span>${profile.premium ? '<span class="badge badge--premium">Perfil Destacado</span>' : ""}</div>
          <div class="recruiter-card__role">${escapeHtml(profile.career || "Egresado/a")} ${profile.university ? "· " + escapeHtml(profile.university) : ""}</div>
          <div class="recruiter-card__grid">
            <div class="recruiter-card__field"><label>Correo</label><span>${escapeHtml(profile.email || "No proporcionado")}</span></div>
            <div class="recruiter-card__field"><label>Teléfono</label><span>${escapeHtml(profile.phone || "No proporcionado")}</span></div>
            <div class="recruiter-card__field"><label>Año de graduación</label><span>${escapeHtml(String(profile.gradYear || "No especificado"))}</span></div>
            <div class="recruiter-card__field"><label>Ubicación</label><span>${escapeHtml(profile.address || "No especificada")}</span></div>
            <div class="recruiter-card__field"><label>CV / Portafolio</label>${profile.cvLink ? `<a href="${escapeHtml(profile.cvLink)}" target="_blank" rel="noopener">Ver enlace</a>` : "<span>No proporcionado</span>"}</div>
            <div class="recruiter-card__field"><label>Prioridad de búsqueda</label><span>${profile.premium ? "Alta (Pase Premium)" : "Estándar"}</span></div>
          </div>
          ${skillsList.length ? `<div class="recruiter-card__skills">${skillsList.map((s) => `<span class="tag">${escapeHtml(s)}</span>`).join("")}</div>` : ""}
          ${profile.bio ? `<p class="recruiter-card__bio">${escapeHtml(profile.bio)}</p>` : ""}
          <div class="recruiter-card__actions"><button type="button" class="btn btn--primary" id="btnContactSave">Contactar y guardar candidato</button></div>
        </div>
      </div>
    `;
    const btn = $("#btnContactSave");
    if (btn) btn.addEventListener("click", () => saveCandidate(profile, profileId));
  }

  function renderRecruiterView() { renderRecruiterCard(currentProfile, sessionId); renderSavedCandidatesList(); }

  async function saveCandidate(profile, id) {
    try {
      await api("/api/saved-candidates", { method: "POST", body: JSON.stringify({ profileId: id }) });
      showToast(`Se contactó y guardó a ${profile.fullName}.`);
      renderSavedCandidatesList();
    } catch (err) { showToast("No se pudo guardar el candidato." + errDetail(err)); }
  }

  async function removeSavedCandidate(id) {
    try { await api(`/api/saved-candidates/${id}`, { method: "DELETE" }); showToast("Se quitó de la lista."); renderSavedCandidatesList(); }
    catch (err) { showToast("No se pudo quitar." + errDetail(err)); }
  }

  async function viewFullCandidate(id) {
    try {
      const { profile } = await api(`/api/profiles/${id}`);
      renderRecruiterCard(profile, id);
      $(".recruiter-frame").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) { showToast("Ese perfil ya no existe."); }
  }

  async function renderSavedCandidatesList() {
    const box = $("#savedCandidatesList");
    if (!box) return;
    let items = [];
    try { items = (await api("/api/saved-candidates")).savedCandidates; } catch (err) { box.innerHTML = `<p class="empty-state">No se pudo cargar la lista.</p>`; return; }
    savedCandidatesCache = items;
    if (items.length === 0) { box.innerHTML = `<p class="empty-state">Todavía no guardaste candidatos.</p>`; return; }
    box.innerHTML = items.map((c) => `
      <div class="admin-row">
        <div class="admin-row__main">
          <div class="admin-row__title">${escapeHtml(c.profileName)} ${c.premium ? '<span class="badge badge--premium">Destacado</span>' : ""}</div>
          <div class="admin-row__meta">${escapeHtml(c.career || "")}${c.university ? " · " + escapeHtml(c.university) : ""}</div>
          <div class="admin-row__meta">Guardado el ${fmtDate(c.savedAt)}</div>
        </div>
        <div class="admin-row__actions">
          <button class="btn btn--ghost btn--sm" data-view-full="${c.profileId}">Ver Perfil</button>
          <button class="btn btn--danger btn--sm" data-remove-saved="${c.profileId}">Quitar</button>
        </div>
      </div>
    `).join("");
    $all("[data-view-full]").forEach((b) => b.addEventListener("click", () => viewFullCandidate(b.dataset.viewFull)));
    $all("[data-remove-saved]").forEach((b) => wireConfirmButton(b, () => removeSavedCandidate(b.dataset.removeSaved)));
  }

  /* ---------------------------------------------------------
     Navegación entre vistas
  --------------------------------------------------------- */
  const PUBLIC_VIEWS = ["empleos", "publicar", "perfil", "premium", "reclutador"];
  const ALL_VIEWS = [...PUBLIC_VIEWS, "admin-login", "admin"];

  async function setActiveView(view) {
    if (view === "admin" && !isAdmin) view = "admin-login";
    const isHome = !ALL_VIEWS.includes(view);
    $all(".view").forEach((panel) => { panel.hidden = panel.id !== "view-" + view; });
    $("#heroSection").style.display = isHome ? "" : "none";
    $all(".nav-link[data-view]").forEach((link) => link.classList.toggle("is-active", link.dataset.view === view));
    closeMobileNav();
    if (view === "reclutador") renderRecruiterView();
    if (view === "empleos") renderJobs();
    if (view === "admin") renderAdminPanels();
  }

  function initRouting() {
    $all("[data-view]").forEach((el) => el.addEventListener("click", () => setActiveView(el.dataset.view)));
    $("#brandHome").addEventListener("click", () => setActiveView("inicio"));
    setActiveView("inicio");
  }

  function closeMobileNav() { $("#mainNav").classList.remove("is-open"); $("#burgerBtn").setAttribute("aria-expanded", "false"); }
  function initMobileNav() {
    const burger = $("#burgerBtn"), nav = $("#mainNav");
    burger.addEventListener("click", () => { const isOpen = nav.classList.toggle("is-open"); burger.setAttribute("aria-expanded", String(isOpen)); });
  }

  /* ---------------------------------------------------------
     Panel de administración
  --------------------------------------------------------- */
  async function checkAdminSession() {
    try { isAdmin = (await api("/api/admin/session")).authenticated; } catch (err) { isAdmin = false; }
  }

  function initAdminGate() {
    $("#adminLoginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const pass = $("#adminPassword").value;
      const status = $("#adminLoginStatus");
      try {
        await api("/api/admin/login", { method: "POST", body: JSON.stringify({ passphrase: pass }) });
        isAdmin = true;
        $("#adminPassword").value = "";
        setActiveView("admin");
      } catch (err) { status.className = "form-status is-error"; status.textContent = err.message || "Contraseña incorrecta."; }
    });

    $("#adminLogoutBtn").addEventListener("click", async () => {
      try { await api("/api/admin/logout", { method: "POST" }); } catch (err) { /* no-op */ }
      isAdmin = false;
      setActiveView("inicio");
    });

    $all(".admin-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        $all(".admin-tab").forEach((t) => t.classList.remove("is-active"));
        $all(".admin-panel").forEach((p) => p.classList.remove("is-active"));
        tab.classList.add("is-active");
        $("#admin-" + tab.dataset.adminTab).classList.add("is-active");
        renderAdminPanels();
      });
    });
  }

  async function decideRedemption(id, approve) {
    try {
      await api(`/api/admin/redemptions/${id}/${approve ? "approve" : "reject"}`, { method: "POST" });
      showToast(approve ? "Canje aprobado. El perfil ya es Destacado." : "Canje rechazado.");
      renderAdminPanels();
      if (id && currentProfile && sessionId) refreshRedemptionTrack();
    } catch (err) { showToast("No se pudo procesar el canje." + errDetail(err)); }
  }
  async function deleteRedemption(id) {
    try { await api(`/api/admin/redemptions/${id}`, { method: "DELETE" }); showToast("Solicitud eliminada."); renderAdminPanels(); }
    catch (err) { showToast("No se pudo eliminar." + errDetail(err)); }
  }

  async function decideJob(id, approve) {
    try { await api(`/api/admin/jobs/${id}/${approve ? "approve" : "reject"}`, { method: "POST" }); showToast(approve ? "Oferta publicada." : "Oferta rechazada."); renderAdminPanels(); }
    catch (err) { showToast("No se pudo procesar la oferta." + errDetail(err)); }
  }
  async function deleteJob(id) {
    try { await api(`/api/admin/jobs/${id}`, { method: "DELETE" }); showToast("Oferta eliminada."); renderAdminPanels(); }
    catch (err) { showToast("No se pudo eliminar." + errDetail(err)); }
  }

  async function decideApplication(id, status) {
    try { await api(`/api/admin/applications/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }); showToast(status === "contactada" ? "Marcada como contactada." : "Postulación cerrada."); renderAdminPanels(); }
    catch (err) { showToast("No se pudo actualizar." + errDetail(err)); }
  }
  async function deleteApplication(id) {
    try { await api(`/api/admin/applications/${id}`, { method: "DELETE" }); showToast("Postulación eliminada."); renderAdminPanels(); }
    catch (err) { showToast("No se pudo eliminar." + errDetail(err)); }
  }

  async function deleteProfile(id) {
    try { await api(`/api/admin/profiles/${id}`, { method: "DELETE" }); showToast("Perfil eliminado."); renderAdminPanels(); }
    catch (err) { showToast("No se pudo eliminar." + errDetail(err)); }
  }

  function renderApplicationsPanel(items) {
    const box = $("#admin-applications");
    $("#countApplications").textContent = items.filter((a) => a.status === "nueva").length || "";
    if (items.length === 0) { box.innerHTML = `<p class="empty-state">Todavía no hay postulaciones.</p>`; return; }
    box.innerHTML = items.map((a) => `
      <div class="admin-row">
        <div class="admin-row__main">
          <div class="admin-row__title">${escapeHtml(a.profileName || "Egresado")} <span class="badge ${APP_STATUS_CLASS[a.status] || "badge--muted"}">${APP_STATUS_LABELS[a.status] || a.status}</span></div>
          <div class="admin-row__meta">Candidato: ${a.profileEmail ? `<a href="mailto:${escapeHtml(a.profileEmail)}" style="text-decoration:underline;color:var(--emerald-mist);">${escapeHtml(a.profileEmail)}</a>` : "—"}${a.profilePhone ? " · " + escapeHtml(a.profilePhone) : ""}</div>
          <div class="admin-row__meta">Puesto: ${escapeHtml(a.jobTitle)} — ${escapeHtml(a.company)}</div>
          <div class="admin-row__meta">Empresa: ${a.companyEmail ? `<a href="mailto:${escapeHtml(a.companyEmail)}" style="text-decoration:underline;color:var(--emerald-mist);">${escapeHtml(a.companyEmail)}</a>` : "sin correo de contacto"}</div>
          <div class="admin-row__meta">Postulado el ${fmtDate(a.createdAt)}</div>
        </div>
        <div class="admin-row__actions">
          ${a.status !== "contactada" && a.status !== "cerrada" ? `<button class="btn btn--ghost btn--sm" data-mark-contacted="${a.id}">Marcar contactado</button>` : ""}
          ${a.status !== "cerrada" ? `<button class="btn btn--primary btn--sm" data-mark-closed="${a.id}">Marcar cerrada</button>` : ""}
          <button class="btn btn--danger btn--sm" data-delete-application="${a.id}">Eliminar</button>
        </div>
      </div>
    `).join("");
    $all("[data-mark-contacted]").forEach((b) => b.addEventListener("click", () => decideApplication(b.dataset.markContacted, "contactada")));
    $all("[data-mark-closed]").forEach((b) => b.addEventListener("click", () => decideApplication(b.dataset.markClosed, "cerrada")));
    $all("[data-delete-application]").forEach((b) => wireConfirmButton(b, () => deleteApplication(b.dataset.deleteApplication)));
  }

  function renderRedemptionsPanel(items) {
    const box = $("#admin-redemptions");
    const pending = items.filter((r) => r.status === "pending");
    $("#countRedemptions").textContent = pending.length || "";
    if (pending.length === 0) { box.innerHTML = `<p class="empty-state">No hay solicitudes de canje pendientes.</p>`; return; }
    box.innerHTML = pending.map((r) => `
      <div class="admin-row">
        <div class="admin-row__main">
          <div class="admin-row__title">${escapeHtml(r.profileName || "Perfil sin nombre")}</div>
          <div class="admin-row__code">${escapeHtml(r.code)}</div>
          <div class="admin-row__meta">Enviado el ${fmtDate(r.createdAt)}</div>
        </div>
        <div class="admin-row__actions">
          <button class="btn btn--primary btn--sm" data-approve-redemption="${r.id}">Aprobar</button>
          <button class="btn btn--danger btn--sm" data-reject-redemption="${r.id}">Rechazar</button>
          <button class="btn btn--danger btn--sm" data-delete-redemption="${r.id}">Eliminar</button>
        </div>
      </div>
    `).join("");
    $all("[data-approve-redemption]").forEach((b) => b.addEventListener("click", () => decideRedemption(b.dataset.approveRedemption, true)));
    $all("[data-reject-redemption]").forEach((b) => b.addEventListener("click", () => decideRedemption(b.dataset.rejectRedemption, false)));
    $all("[data-delete-redemption]").forEach((b) => wireConfirmButton(b, () => deleteRedemption(b.dataset.deleteRedemption)));
  }

  function renderJobsPendingPanel(items) {
    const box = $("#admin-jobsPending");
    const pending = items.filter((j) => j.status === "pending");
    $("#countJobsPending").textContent = pending.length || "";
    if (pending.length === 0) { box.innerHTML = `<p class="empty-state">No hay ofertas esperando revisión.</p>`; return; }
    box.innerHTML = pending.map((j) => `
      <div class="admin-row">
        <div class="admin-row__main">
          <div class="admin-row__title">${escapeHtml(j.title)} — ${escapeHtml(j.company)}</div>
          <div class="admin-row__meta">${escapeHtml(j.location)} · ${MODALIDAD_LABELS[j.modalidad] || j.modalidad} · ${AREA_LABELS[j.area] || j.area}${j.exclusivo ? " · Exclusiva egresados" : ""}</div>
          <div class="admin-row__meta">Contacto: ${escapeHtml(j.contactEmail || "—")}</div>
          <div class="admin-row__meta">${escapeHtml(j.desc || "")}</div>
        </div>
        <div class="admin-row__actions">
          <button class="btn btn--primary btn--sm" data-approve-job="${j.id}">Aprobar</button>
          <button class="btn btn--danger btn--sm" data-reject-job="${j.id}">Rechazar</button>
          <button class="btn btn--danger btn--sm" data-remove-pending-job="${j.id}">Eliminar</button>
        </div>
      </div>
    `).join("");
    $all("[data-approve-job]").forEach((b) => b.addEventListener("click", () => decideJob(b.dataset.approveJob, true)));
    $all("[data-reject-job]").forEach((b) => b.addEventListener("click", () => decideJob(b.dataset.rejectJob, false)));
    $all("[data-remove-pending-job]").forEach((b) => wireConfirmButton(b, () => deleteJob(b.dataset.removePendingJob)));
  }

  function renderJobsLivePanel(items) {
    const box = $("#admin-jobsLive");
    const live = items.filter((j) => j.status === "approved");
    $("#countJobsLive").textContent = live.length || "";
    if (live.length === 0) { box.innerHTML = `<p class="empty-state">Todavía no hay ofertas publicadas.</p>`; return; }
    box.innerHTML = live.map((j) => `
      <div class="admin-row">
        <div class="admin-row__main">
          <div class="admin-row__title">${escapeHtml(j.title)} — ${escapeHtml(j.company)}</div>
          <div class="admin-row__meta">${escapeHtml(j.location)} · ${MODALIDAD_LABELS[j.modalidad] || j.modalidad}${j.exclusivo ? " · Exclusiva egresados" : ""}</div>
        </div>
        <div class="admin-row__actions"><button class="btn btn--danger btn--sm" data-delete-job="${j.id}">Eliminar</button></div>
      </div>
    `).join("");
    $all("[data-delete-job]").forEach((b) => wireConfirmButton(b, () => deleteJob(b.dataset.deleteJob)));
  }

  function renderProfilesPanel(items) {
    const box = $("#admin-profiles");
    $("#countProfiles").textContent = items.length || "";
    if (items.length === 0) { box.innerHTML = `<p class="empty-state">Todavía no hay egresados registrados.</p>`; return; }
    box.innerHTML = items.map((p) => `
      <div class="admin-row">
        ${p.photo ? `<img src="${p.photo}" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0;">` : ""}
        <div class="admin-row__main">
          <div class="admin-row__title">${escapeHtml(p.fullName || "Sin nombre")} ${p.premium ? '<span class="badge badge--premium">Destacado</span>' : ""}</div>
          <div class="admin-row__meta">${escapeHtml(p.career || "")} ${p.university ? "· " + escapeHtml(p.university) : ""} ${p.gradYear ? "· " + escapeHtml(String(p.gradYear)) : ""}</div>
          <div class="admin-row__meta">${escapeHtml(p.email || "")}</div>
          <div class="admin-row__meta">Actualizado ${fmtDate(p.updatedAt)}</div>
        </div>
        <div class="admin-row__actions"><button class="btn btn--danger btn--sm" data-delete-profile="${p.id}">Eliminar</button></div>
      </div>
    `).join("");
    $all("[data-delete-profile]").forEach((b) => wireConfirmButton(b, () => deleteProfile(b.dataset.deleteProfile)));
  }

  async function renderAdminPanels() {
    if (!isAdmin) return;
    try {
      const [{ applications }, { redemptions }, { jobs }, { profiles }] = await Promise.all([
        api("/api/admin/applications"), api("/api/admin/redemptions"), api("/api/admin/jobs"), api("/api/admin/profiles")
      ]);
      renderApplicationsPanel(applications);
      renderRedemptionsPanel(redemptions);
      renderJobsPendingPanel(jobs);
      renderJobsLivePanel(jobs);
      renderProfilesPanel(profiles);
    } catch (err) { showToast("No se pudo cargar el panel." + errDetail(err)); }
  }

  function initAdminJobForm() {
    $("#adminJobForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = $("#adminJobStatus");
      const company = $("#aJobCompany").value.trim(), title = $("#aJobTitle").value.trim(), location = $("#aJobLocation").value.trim(), contactEmail = $("#aJobContact").value.trim(), area = $("#aJobArea").value, modalidad = $("#aJobModalidad").value, desc = $("#aJobDesc").value.trim();
      if (!company || !title || !location || !area || !modalidad || !desc) { status.className = "form-status is-error"; status.textContent = "Completa los campos obligatorios (*)."; return; }
      const job = { company, title, location, contactEmail, area, modalidad, desc, exclusivo: $("#aJobExclusivo").checked, tags: $("#aJobTags").value.split(",").map((t) => t.trim()).filter(Boolean) };
      try {
        await api("/api/admin/jobs", { method: "POST", body: JSON.stringify(job) });
        status.className = "form-status"; status.textContent = "Oferta publicada.";
        $("#adminJobForm").reset();
        showToast("Oferta publicada de inmediato.");
        renderAdminPanels();
      } catch (err) { status.className = "form-status is-error"; status.textContent = "No se pudo publicar la oferta." + errDetail(err); }
    });
  }

  /* ---------------------------------------------------------
     Init
  --------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", async () => {
    sessionId = getOrCreateSessionId();
    initRouting();
    initMobileNav();
    initJobFilters();
    initJobPublishForm();
    initProfileForm();
    initPhotoInput();
    initPromoForm();
    initAdminGate();
    initAdminJobForm();
    await checkAdminSession();
    await loadCurrentProfile();
    renderJobs();
  });
})();
