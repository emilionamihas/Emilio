/* =========================================================
   ASCEND & CONNECT (A&C)
   Lógica de la plataforma: navegación, empleos, perfil,
   códigos premium y vista de reclutador.
   Persistencia local (localStorage) para simular backend.
   ========================================================= */

(function () {
  "use strict";

  const STORAGE_KEY = "ac_profile_v1";

  const VALID_PROMO_CODES = ["AC2026", "A&CVIP", "PREMIUM2026"];

  const JOBS = [
    {
      title: "Analista de Datos Jr.",
      company: "Nimbus Analytics",
      area: "tecnologia",
      modalidad: "remoto",
      exclusivo: true,
      location: "Remoto · LATAM",
      tags: ["SQL", "Excel", "Power BI"],
      desc: "Programa de inducción de 3 meses para egresados de carreras afines a datos, estadística o ingeniería."
    },
    {
      title: "Desarrollador Frontend Trainee",
      company: "Vertex Software",
      area: "tecnologia",
      modalidad: "hibrido",
      exclusivo: true,
      location: "Ciudad de México",
      tags: ["HTML/CSS", "JavaScript", "React"],
      desc: "Buscamos primera experiencia laboral. Mentoría técnica y plan de carrera desde el día uno."
    },
    {
      title: "Coordinador de Marketing Digital",
      company: "Brisa Studio",
      area: "marketing",
      modalidad: "remoto",
      exclusivo: false,
      location: "Remoto",
      tags: ["Redes sociales", "Copywriting", "Analytics"],
      desc: "Apoyo en estrategia de contenido para marcas emergentes. Se valora portafolio."
    },
    {
      title: "Analista Contable Jr.",
      company: "Grupo Andina",
      area: "finanzas",
      modalidad: "presencial",
      exclusivo: true,
      location: "Bogotá",
      tags: ["Excel", "NIIF", "Conciliaciones"],
      desc: "Vacante pensada para recién egresados de Contaduría o Finanzas. Capacitación interna incluida.",
    },
    {
      title: "Diseñador/a UX/UI Jr.",
      company: "Estudio Norte",
      area: "diseno",
      modalidad: "hibrido",
      exclusivo: true,
      location: "Guadalajara",
      tags: ["Figma", "Prototipado", "Investigación de usuarios"],
      desc: "Únete a un equipo de producto que valora ideas frescas y perspectivas nuevas."
    },
    {
      title: "Ejecutivo/a de Atención al Cliente",
      company: "Puerto Claro",
      area: "ventas",
      modalidad: "presencial",
      exclusivo: false,
      location: "Lima",
      tags: ["Comunicación", "CRM", "Ventas"],
      desc: "Primer empleo formal con contrato y prestaciones desde el ingreso."
    },
    {
      title: "Ingeniero/a de Procesos Jr.",
      company: "Manufacturas del Sur",
      area: "ingenieria",
      modalidad: "presencial",
      exclusivo: true,
      location: "Monterrey",
      tags: ["Lean", "Excel", "AutoCAD"],
      desc: "Programa de rotación por distintas áreas de planta durante el primer año."
    },
    {
      title: "Product Marketing Trainee",
      company: "Halo Tech",
      area: "marketing",
      modalidad: "remoto",
      exclusivo: true,
      location: "Remoto · Latam",
      tags: ["Storytelling", "Growth", "Datos"],
      desc: "Aprenderás a lanzar productos digitales junto a un equipo senior de marketing."
    },
    {
      title: "Asistente de Finanzas Corporativas",
      company: "Cumbre Capital",
      area: "finanzas",
      modalidad: "hibrido",
      exclusivo: false,
      location: "Ciudad de Panamá",
      tags: ["Modelado financiero", "Excel avanzado"],
      desc: "Apoyo directo al equipo de tesorería. Ideal para egresados de Economía o Finanzas."
    }
  ];

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

  function normalizePromoCode(raw) {
    return (raw || "").trim().toUpperCase().replace(/\s+/g, "");
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

  /* ---------------------------------------------------------
     Perfil (persistencia en localStorage)
  --------------------------------------------------------- */
  function loadProfile() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn("No se pudo leer el perfil guardado", err);
      return null;
    }
  }

  function saveProfile(profile) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }

  function getProfile() {
    return loadProfile() || {
      fullName: "",
      address: "",
      university: "",
      career: "",
      gradYear: "",
      cvLink: "",
      skills: "",
      bio: "",
      premium: false,
      promoCode: ""
    };
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
  function renderJobs() {
    const area = $("#filterArea").value;
    const modalidad = $("#filterModalidad").value;
    const soloExclusivo = $("#filterExclusivo").checked;
    const profile = getProfile();

    let list = JOBS.filter((job) => {
      if (area && job.area !== area) return false;
      if (modalidad && job.modalidad !== modalidad) return false;
      if (soloExclusivo && !job.exclusivo) return false;
      return true;
    });

    // Si el usuario tiene Pase Premium, sus ofertas exclusivas relevantes se priorizan primero.
    if (profile.premium) {
      list = [...list].sort((a, b) => Number(b.exclusivo) - Number(a.exclusivo));
    }

    const grid = $("#jobsGrid");
    $("#jobsCount").textContent = `${list.length} oferta${list.length === 1 ? "" : "s"} encontrada${list.length === 1 ? "" : "s"}`;

    if (list.length === 0) {
      grid.innerHTML = `<div class="empty-state">No encontramos ofertas con esos filtros. Prueba ajustando el área o la modalidad.</div>`;
      return;
    }

    grid.innerHTML = list.map((job) => `
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

  function labelModalidad(mod) {
    return { remoto: "Remoto", presencial: "Presencial", hibrido: "Híbrido" }[mod] || mod;
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
    if (!profile.fullName) {
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
    const profile = getProfile();
    fillProfileForm(profile);
    renderMiniCard(profile);

    $("#profileForm").addEventListener("submit", (e) => {
      e.preventDefault();

      const fullName = $("#fullName").value.trim();
      const university = $("#university").value.trim();
      const career = $("#career").value.trim();
      const gradYear = $("#gradYear").value.trim();

      const status = $("#profileStatus");

      if (!fullName || !university || !career || !gradYear) {
        status.textContent = "Completa los campos obligatorios (*) antes de guardar.";
        status.classList.add("is-error");
        return;
      }

      const current = getProfile();
      const updated = {
        ...current,
        fullName,
        address: $("#address").value.trim(),
        university,
        career,
        gradYear,
        cvLink: $("#cvLink").value.trim(),
        skills: $("#skills").value.trim(),
        bio: $("#bio").value.trim()
      };

      saveProfile(updated);
      status.classList.remove("is-error");
      status.textContent = "Perfil guardado correctamente.";
      renderMiniCard(updated);
      showToast("Tu perfil se guardó correctamente.");
    });
  }

  /* ---------------------------------------------------------
     Sistema de códigos premium
  --------------------------------------------------------- */
  function renderPremiumStatus(profile) {
    const box = $("#premiumStatusBox");
    if (profile.premium) {
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
    const profile = getProfile();
    renderPremiumStatus(profile);

    $("#promoForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("#promoCode");
      const status = $("#promoStatus");
      const code = normalizePromoCode(input.value);

      if (!code) {
        status.textContent = "Ingresa un código para canjear.";
        status.classList.add("is-error");
        return;
      }

      const isValid = VALID_PROMO_CODES.some((valid) => normalizePromoCode(valid) === code);

      if (!isValid) {
        status.textContent = "Ese código no es válido o ya expiró.";
        status.classList.add("is-error");
        return;
      }

      const current = getProfile();
      if (!current.fullName) {
        status.classList.add("is-error");
        status.textContent = "Primero completa tu perfil de egresado para activar el Pase Premium.";
        return;
      }

      const updated = { ...current, premium: true, promoCode: code };
      saveProfile(updated);

      status.classList.remove("is-error");
      status.textContent = "¡Código canjeado! Tu perfil ahora es Destacado.";
      input.value = "";
      renderPremiumStatus(updated);
      renderMiniCard(updated);
      showToast("Pase Premium activado. Tu perfil ahora es Destacado.");
    });
  }

  /* ---------------------------------------------------------
     Vista previa para reclutadores
  --------------------------------------------------------- */
  function renderRecruiterView() {
    const profile = getProfile();
    const container = $("#recruiterView");

    if (!profile.fullName) {
      container.innerHTML = `<p class="empty-state">Todavía no hay un perfil guardado. Ve a "Mi perfil" para crear el tuyo y mira cómo lo verían las empresas.</p>`;
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
  document.addEventListener("DOMContentLoaded", () => {
    initRouting();
    initMobileNav();
    initJobFilters();
    initProfileForm();
    initPromoForm();
    renderJobs();
  });
})();
