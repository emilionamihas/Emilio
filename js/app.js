/* =========================================================
   ASCEND & CONNECT (A&C)
   Lógica de la plataforma: navegación, empleos, perfil,
   códigos premium y vista de reclutador.

   El perfil, el estado premium y el catálogo de empleos viven
   en el backend (server/). El navegador solo guarda el ID del
   perfil actual en localStorage, a modo de sesión simple.
   ========================================================= */

(function () {
  "use strict";

  const SESSION_KEY = "ac_profile_id";

  let currentProfile = null;

  /* ---------------------------------------------------------
     Utilidades
  --------------------------------------------------------- */
  function $(selector, ctx) { return (ctx || document).querySelector(selector); }
  function $all(selector, ctx) { return Array.from((ctx || document).querySelectorAll(selector)); }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getInitials(name) {
    if (!name) return "A&C";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "A&C";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  let toastTimer = null;
  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
  }

  async function api(path, options) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
    let data = {};
    try { data = await res.json(); } catch (err) { /* respuesta sin cuerpo */ }
    if (!res.ok) {
      throw new Error(data.error || `Error de red (${res.status})`);
    }
    return data;
  }

  /* ---------------------------------------------------------
     Sesión de perfil (el ID vive en localStorage, los datos
     reales y el estado premium viven en el servidor)
  --------------------------------------------------------- */
  function getSessionId() {
    return localStorage.getItem(SESSION_KEY);
  }

  function setSessionId(id) {
    localStorage.setItem(SESSION_KEY, id);
  }

  async function loadCurrentProfile() {
    const id = getSessionId();
    if (!id) {
      currentProfile = null;
      return null;
    }
    try {
      const { profile } = await api(`/api/profiles/${id}`);
      currentProfile = profile;
      return profile;
    } catch (err) {
      // El perfil ya no existe (por ejemplo, se reinició la base de datos)
      localStorage.removeItem(SESSION_KEY);
      currentProfile = null;
      return null;
    }
  }

  /* ---------------------------------------------------------
     Navegación entre vistas (SPA con hash sencillo)
  --------------------------------------------------------- */
  const VIEWS = ["empleos", "perfil", "premium", "reclutador"];

  function setActiveView(view) {
    const isHome = !view || view === "inicio";

    $all("[data-view-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.viewPanel !== view;
    });

    const hero = $(".hero");
    if (hero) hero.style.display = isHome ? "" : "none";

    $all(".nav-link").forEach((link) => {
      link.classList.toggle("is-active", link.dataset.view === view);
    });

    closeMobileNav();

    if (view === "reclutador") renderRecruiterView();
    if (view === "empleos") renderJobs();
  }

  function navigateTo(view) {
    if (VIEWS.includes(view)) {
      window.location.hash = view;
    } else {
      window.location.hash = "";
    }
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function initRouting() {
    $all(".nav-link, [data-view]").forEach((el) => {
      el.addEventListener("click", (e) => {
        const view = el.dataset.view;
        if (!view) return;
        e.preventDefault();
        navigateTo(view);
      });
    });

    const initial = window.location.hash.replace("#", "");
    setActiveView(VIEWS.includes(initial) ? initial : "inicio");
  }

  function closeMobileNav() {
    $("#mainNav").classList.remove("is-open");
    $("#burgerBtn").setAttribute("aria-expanded", "false");
  }

  function initMobileNav() {
    const burger = $("#burgerBtn");
    const nav = $("#mainNav");
    burger.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("is-open");
      burger.setAttribute("aria-expanded", String(isOpen));
    });
  }

  /* ---------------------------------------------------------
     Módulo de búsqueda de empleo
  --------------------------------------------------------- */
  function labelModalidad(mod) {
    return { remoto: "Remoto", presencial: "Presencial", hibrido: "Híbrido" }[mod] || mod;
  }

  async function renderJobs() {
    const grid = $("#jobsGrid");
    const area = $("#filterArea").value;
    const modalidad = $("#filterModalidad").value;
    const soloExclusivo = $("#filterExclusivo").checked;

    const params = new URLSearchParams();
    if (area) params.set("area", area);
    if (modalidad) params.set("modalidad", modalidad);
    if (soloExclusivo) params.set("exclusivo", "true");

    let jobs = [];
    try {
      const data = await api(`/api/jobs?${params.toString()}`);
      jobs = data.jobs || [];
    } catch (err) {
      grid.innerHTML = `<div class="empty-state">No se pudieron cargar las ofertas. Intenta de nuevo en unos segundos.</div>`;
      $("#jobsCount").textContent = "0 ofertas encontradas";
      return;
    }

    // Si el usuario tiene Pase Premium, las ofertas exclusivas se priorizan primero.
    if (currentProfile && currentProfile.premium) {
      jobs = [...jobs].sort((a, b) => Number(b.exclusivo) - Number(a.exclusivo));
    }

    $("#jobsCount").textContent = `${jobs.length} oferta${jobs.length === 1 ? "" : "s"} encontrada${jobs.length === 1 ? "" : "s"}`;

    if (jobs.length === 0) {
      grid.innerHTML = `<div class="empty-state">No encontramos ofertas con esos filtros. Prueba ajustando el área o la modalidad.</div>`;
      return;
    }

    grid.innerHTML = jobs.map((job) => `
      <article class="job-card">
        <div class="job-card__top">
          <div>
            <div class="job-card__title">${escapeHtml(job.title)}</div>
            <div class="job-card__company">${escapeHtml(job.company)}</div>
          </div>
          ${job.exclusivo ? '<span class="badge badge--exclusive">Exclusiva egresados</span>' : ""}
        </div>
        <p class="job-card__desc">${escapeHtml(job.desc)}</p>
        <div class="job-card__tags">
          ${job.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
        </div>
        <div class="job-card__footer">
          <span class="job-card__location">${escapeHtml(job.location)} · ${labelModalidad(job.modalidad)}</span>
          <button type="button" class="btn btn--ghost" data-apply="${escapeHtml(job.title)}">Postularme</button>
        </div>
      </article>
    `).join("");

    $all("[data-apply]").forEach((btn) => {
      btn.addEventListener("click", () => {
        showToast(`Postulación enviada a ${btn.dataset.apply}. ¡Éxito!`);
      });
    });
  }

  function initJobFilters() {
    ["#filterArea", "#filterModalidad", "#filterExclusivo"].forEach((sel) => {
      $(sel).addEventListener("change", renderJobs);
    });
  }

  /* ---------------------------------------------------------
     Formulario de perfil
  --------------------------------------------------------- */
  function fillProfileForm(profile) {
    if (!profile) return;
    $("#fullName").value = profile.fullName || "";
    $("#address").value = profile.address || "";
    $("#university").value = profile.university || "";
    $("#career").value = profile.career || "";
    $("#gradYear").value = profile.gradYear || "";
    $("#cvLink").value = profile.cvLink || "";
    $("#skills").value = profile.skills || "";
    $("#bio").value = profile.bio || "";
  }

  function renderMiniCard(profile) {
    const box = $("#profileMiniCard");
    if (!profile || !profile.fullName) {
      box.innerHTML = `<p class="empty-state">Aún no has guardado un perfil.</p>`;
      return;
    }
    box.innerHTML = `
      <div class="mini-card__name">${escapeHtml(profile.fullName)} ${profile.premium ? '<span class="badge badge--premium">Destacado</span>' : ""}</div>
      <div class="mini-card__meta">${escapeHtml(profile.career || "Carrera no especificada")}</div>
      <div class="mini-card__meta">${escapeHtml(profile.university || "")}${profile.gradYear ? " · " + escapeHtml(String(profile.gradYear)) : ""}</div>
    `;
  }

  function initProfileForm() {
    fillProfileForm(currentProfile);
    renderMiniCard(currentProfile);

    $("#profileForm").addEventListener("submit", async (e) => {
      e.preventDefault();

      const fullName = $("#fullName").value.trim();
      const university = $("#university").value.trim();
      const career = $("#career").value.trim();
      const gradYear = $("#gradYear").value.trim();

      const status = $("#profileStatus");

      if (!fullName || !university || !career || !gradYear) {
        status.classList.add("is-error");
        status.textContent = "Completa los campos obligatorios (*) antes de guardar.";
        return;
      }

      const payload = {
        fullName,
        university,
        career,
        gradYear,
        address: $("#address").value.trim(),
        cvLink: $("#cvLink").value.trim(),
        skills: $("#skills").value.trim(),
        bio: $("#bio").value.trim()
      };

      try {
        const id = getSessionId();
        const data = id
          ? await api(`/api/profiles/${id}`, { method: "PUT", body: JSON.stringify(payload) })
          : await api("/api/profiles", { method: "POST", body: JSON.stringify(payload) });

        currentProfile = data.profile;
        setSessionId(currentProfile.id);

        status.classList.remove("is-error");
        status.textContent = "Perfil guardado correctamente.";
        renderMiniCard(currentProfile);
        showToast("Tu perfil se guardó correctamente.");
      } catch (err) {
        status.classList.add("is-error");
        status.textContent = err.message || "No se pudo guardar el perfil.";
      }
    });
  }

  /* ---------------------------------------------------------
     Sistema de códigos premium
  --------------------------------------------------------- */
  function renderPremiumStatus(profile) {
    const box = $("#premiumStatusBox");
    if (profile && profile.premium) {
      box.innerHTML = `
        <span class="badge badge--premium">Perfil Destacado activo</span>
        <p>Código aplicado: <strong>${escapeHtml(profile.promoCode)}</strong>. Tu perfil tiene prioridad en el motor de búsqueda de las empresas.</p>
      `;
    } else {
      box.innerHTML = `
        <span class="badge badge--muted">Perfil estándar</span>
        <p>Canjea un código válido para desbloquear los beneficios premium.</p>
      `;
    }
  }

  function initPromoForm() {
    renderPremiumStatus(currentProfile);

    $("#promoForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = $("#promoCode");
      const status = $("#promoStatus");
      const code = input.value.trim();

      const id = getSessionId();
      if (!id) {
        status.classList.add("is-error");
        status.textContent = "Primero completa tu perfil de egresado para activar el Pase Premium.";
        return;
      }

      if (!code) {
        status.classList.add("is-error");
        status.textContent = "Ingresa un código para canjear.";
        return;
      }

      try {
        // La validación real del código ocurre en el servidor.
        const data = await api(`/api/profiles/${id}/redeem`, {
          method: "POST",
          body: JSON.stringify({ code })
        });
        currentProfile = data.profile;

        status.classList.remove("is-error");
        status.textContent = "¡Código canjeado! Tu perfil ahora es Destacado.";
        input.value = "";
        renderPremiumStatus(currentProfile);
        renderMiniCard(currentProfile);
        showToast("Pase Premium activado. Tu perfil ahora es Destacado.");
      } catch (err) {
        status.classList.add("is-error");
        status.textContent = err.message || "No se pudo canjear el código.";
      }
    });
  }

  /* ---------------------------------------------------------
     Vista previa para reclutadores
  --------------------------------------------------------- */
  async function renderRecruiterView() {
    const container = $("#recruiterView");
    const id = getSessionId();

    if (!id) {
      container.innerHTML = `<p class="empty-state">Todavía no hay un perfil guardado. Ve a "Mi perfil" para crear el tuyo y mira cómo lo verían las empresas.</p>`;
      return;
    }

    let profile;
    try {
      const data = await api(`/api/profiles/${id}`);
      profile = data.profile;
      currentProfile = profile;
    } catch (err) {
      container.innerHTML = `<p class="empty-state">No se pudo cargar tu perfil. Intenta de nuevo.</p>`;
      return;
    }

    const skillsList = (profile.skills || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    container.innerHTML = `
      <div class="recruiter-card">
        <div class="recruiter-card__avatar">${escapeHtml(getInitials(profile.fullName))}</div>
        <div class="recruiter-card__main">
          <div class="recruiter-card__headline">
            <span class="recruiter-card__name">${escapeHtml(profile.fullName)}</span>
            ${profile.premium ? '<span class="badge badge--premium">Perfil Destacado</span>' : ""}
          </div>
          <div class="recruiter-card__role">${escapeHtml(profile.career || "Egresado/a")} ${profile.university ? "· " + escapeHtml(profile.university) : ""}</div>

          <div class="recruiter-card__grid">
            <div class="recruiter-card__field">
              <label>Año de graduación</label>
              <span>${escapeHtml(String(profile.gradYear || "No especificado"))}</span>
            </div>
            <div class="recruiter-card__field">
              <label>Ubicación</label>
              <span>${escapeHtml(profile.address || "No especificada")}</span>
            </div>
            <div class="recruiter-card__field">
              <label>CV / Portafolio</label>
              ${profile.cvLink
                ? `<a href="${escapeHtml(profile.cvLink)}" target="_blank" rel="noopener">Ver enlace</a>`
                : "<span>No proporcionado</span>"}
            </div>
            <div class="recruiter-card__field">
              <label>Prioridad de búsqueda</label>
              <span>${profile.premium ? "Alta (Pase Premium)" : "Estándar"}</span>
            </div>
          </div>

          ${skillsList.length ? `
            <div class="recruiter-card__skills">
              ${skillsList.map((s) => `<span class="tag">${escapeHtml(s)}</span>`).join("")}
            </div>
          ` : ""}

          ${profile.bio ? `<p class="recruiter-card__bio">${escapeHtml(profile.bio)}</p>` : ""}

          <div class="recruiter-card__actions">
            <button type="button" class="btn btn--primary" id="btnContact">Contactar candidato</button>
            <button type="button" class="btn btn--ghost" id="btnSave">Guardar en mis candidatos</button>
          </div>
        </div>
      </div>
    `;

    const contactBtn = $("#btnContact");
    const saveBtn = $("#btnSave");
    if (contactBtn) contactBtn.addEventListener("click", () => showToast(`Se envió una solicitud de contacto a ${profile.fullName}.`));
    if (saveBtn) saveBtn.addEventListener("click", () => showToast(`${profile.fullName} se guardó en tu lista de candidatos.`));
  }

  /* ---------------------------------------------------------
     Init
  --------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", async () => {
    await loadCurrentProfile();
    initRouting();
    initMobileNav();
    initJobFilters();
    initProfileForm();
    initPromoForm();
    renderJobs();
  });
})();
