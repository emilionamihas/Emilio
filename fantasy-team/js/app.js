/* FantasyTeam · Interfaz (vanilla JS, sin dependencias). */
(function () {
  'use strict';

  const SC = window.FTScoring;
  const Store = window.FTStore;
  const { POSITIONS, POS_LABEL, POS_PLURAL, FORMATS, RULES } = SC;

  // Aviso: en una app sin servidor esta clave viaja en el código del navegador.
  const ADMIN_PASSWORD = 'secretteam';
  // Valor de mercado con el que entra quien se registra; el admin lo ajusta luego.
  const NEW_PLAYER_VALUE = 6;

  let S = Store.load();
  let session = Store.loadSession();
  const ui = {
    adminTab: 'liga',
    mgrTab: 'equipo',
    marketPos: 'ALL',
    marketQuery: '',
    adminPos: 'ALL',
    mdView: null,
    mdDraft: null,
    expanded: null,
    sheet: null,
    sheetOpened: false,
  };

  /* ───────────── utilidades ───────────── */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r1 = Store.r1;
  const fmtM = (n) => `${r1(n).toLocaleString('es-ES', { maximumFractionDigits: 1 })}M`;
  const fmtPts = (n) => (n > 0 ? '+' + n : String(n));
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso);
    return isNaN(d) ? '' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const fmtTs = (ts) => (ts ? new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '');
  const int = (v, min, max) => Math.min(max, Math.max(min, Math.trunc(Number(v) || 0)));
  const posOrder = (p) => POSITIONS.indexOf(p);

  const getPlayer = (id) => S.players.find((p) => p.id === id);
  const getManager = (id) => S.managers.find((m) => m.id === id);
  const me = () => (session && session.role === 'manager' ? getManager(session.managerId) : null);
  const sortedMDs = () => [...S.matchdays].sort((a, b) => a.number - b.number);
  const lastMD = () => { const l = sortedMDs(); return l[l.length - 1] || null; };
  const shortName = (p) => p.nickname || p.name.split(' ').slice(-1)[0];
  const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const starters = (m) => SC.slotKeys(m.formation).map((k) => m.slots[k]).filter(Boolean);
  const squadValue = (m) => r1(m.squad.reduce((a, id) => a + ((getPlayer(id) || {}).value || 0), 0));
  const ownersCount = (pid) => S.managers.filter((m) => m.squad.includes(pid)).length;

  const linkedPlayer = (m) => (m && m.playerId ? getPlayer(m.playerId) : null);
  const linkedPos = (m) => { const p = linkedPlayer(m); return p ? ` · ${p.pos}` : ''; };

  function persist() {
    if (!Store.save(S)) toast('No se pudieron guardar los cambios en este dispositivo', 'error');
  }
  function commit(msg, type) {
    persist();
    render();
    if (msg) toast(msg, type || 'success');
  }

  /* ───────────── cálculos ───────────── */
  function mdManagerPoints(md, mid) {
    return SC.lineupPoints(md.lineups && md.lineups[mid], md.stats);
  }

  function standings() {
    const mds = sortedMDs();
    const last = mds[mds.length - 1];
    const rows = S.managers.map((m) => {
      let total = 0;
      mds.forEach((md) => { const r = mdManagerPoints(md, m.id); if (r) total += r.total; });
      const lr = last ? mdManagerPoints(last, m.id) : null;
      return { m, total, last: lr ? lr.total : null };
    });
    rows.sort((a, b) => b.total - a.total || (b.last == null ? -1e9 : b.last) - (a.last == null ? -1e9 : a.last) || a.m.teamName.localeCompare(b.m.teamName));
    rows.forEach((r, i) => { r.rank = i > 0 && rows[i - 1].total === r.total ? rows[i - 1].rank : i + 1; });
    return rows;
  }

  function playerPoints(pid) {
    const mds = sortedMDs();
    let total = 0;
    let last = null;
    mds.forEach((md, i) => {
      const st = md.stats[pid];
      const p = st ? SC.scorePlayer(st.pos, st).total : 0;
      total += p;
      if (i === mds.length - 1) last = st ? p : null;
    });
    return { total, last };
  }

  function relayout(m, formation) {
    const current = starters(m);
    const { slots } = SC.assignSlots(formation, current, (id) => (getPlayer(id) || {}).pos);
    m.formation = formation;
    m.slots = slots;
    if (m.captainId && !Object.values(slots).includes(m.captainId)) m.captainId = null;
  }

  /** Quita de las alineaciones a jugadores que ya no están en la plantilla o no encajan en su hueco. */
  function sanitizeManager(m) {
    m.squad = m.squad.filter((id) => getPlayer(id));
    Object.keys(m.slots).forEach((k) => {
      const p = getPlayer(m.slots[k]);
      if (!p || !m.squad.includes(p.id) || p.pos !== k.split('-')[0]) delete m.slots[k];
    });
    if (m.captainId && !Object.values(m.slots).includes(m.captainId)) m.captainId = null;
  }

  /* ───────────── iconos ───────────── */
  const ICONS = {
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    shirt: '<path d="M20.4 6.6 16 4a4 4 0 0 1-8 0L3.6 6.6a1 1 0 0 0-.5 1.2l1.2 3.6a1 1 0 0 0 1.2.6L7 11.5V20a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-8.5l1.5.5a1 1 0 0 0 1.2-.6l1.2-3.6a1 1 0 0 0-.5-1.2z"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6"/>',
    trophy: '<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-6A8 8 0 1 1 21 12z"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    alert: '<path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18v.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    ball: '<circle cx="12" cy="12" r="9"/><path d="m12 7 4 3-1.5 4.5h-5L8 10z"/>',
    whistle: '<circle cx="9" cy="14" r="5"/><path d="M13 11h8v4h-6M9 9V5"/>',
    bench: '<path d="M4 10h16M6 10v8M18 10v8M4 14h16"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  };
  const icon = (n, cls) => `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

  function logo(size) {
    return `<svg class="logo" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 2.5 43 8.8v14.5C43 35 34.6 42.6 24 45.5 13.4 42.6 5 35 5 23.3V8.8z" fill="#10b981"/>
      <path d="M24 2.5 43 8.8v14.5C43 35 34.6 42.6 24 45.5z" fill="#059669"/>
      <circle cx="24" cy="23" r="11" fill="#f8fafc"/>
      <path d="m24 17.6 5 3.6-1.9 5.9h-6.2l-1.9-5.9z" fill="#0f172a"/>
      <path d="M24 17.6V12.2M29 21.2l5-1.7M27.1 27.1l3 4.2M20.9 27.1l-3 4.2M19 21.2l-5-1.7" stroke="#0f172a" stroke-width="1.7" stroke-linecap="round"/>
    </svg>`;
  }

  const shirtSvg = () => `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M17 5 6 10.5 2.5 21l7 3 2-4.5V44h25V19.5l2 4.5 7-3L42 10.5 31 5c-.8 3.5-3.6 6-7 6s-6.2-2.5-7-6z" fill="currentColor" stroke="rgba(0,0,0,.35)" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  const posBadge = (pos) => `<span class="pos pos-${pos}">${pos}</span>`;
  const avatar = (p, pos) => `<span class="avatar pos-bg-${pos || p.pos}">${esc(initials(p.name))}</span>`;
  const statusTag = (p) => (p.status === 'injured' ? `<span class="tag tag-danger">${icon('alert')}Lesionado</span>` : '');

  /* ───────────── notificaciones y diálogos ───────────── */
  function toast(msg, type) {
    type = type || 'success';
    const root = $('#toasts');
    // Como máximo 2 avisos a la vez, para que fichar en ráfaga no tape la pantalla.
    const live = root.querySelectorAll('.toast:not(.leaving)');
    for (let i = 0; i < live.length - 1; i++) {
      live[i].classList.add('leaving');
      live[i].classList.remove('show');
      setTimeout(() => live[i].remove(), 250);
    }
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `${icon(type === 'error' ? 'alert' : type === 'info' ? 'info' : 'check')}<span>${esc(msg)}</span>`;
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3000);
  }

  function confirmDialog(opts) {
    const { title, text, ok = 'Confirmar', danger = false, checkbox = null } = opts;
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'modal-backdrop';
      wrap.innerHTML = `<div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="cd-title">
        <h3 id="cd-title">${esc(title)}</h3>
        <p>${esc(text)}</p>
        ${checkbox ? `<label class="check"><input type="checkbox" id="cd-check"><span>${esc(checkbox)}</span></label>` : ''}
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-r="0">Cancelar</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-r="1">${esc(ok)}</button>
        </div></div>`;
      const close = (v) => {
        const chk = wrap.querySelector('#cd-check');
        wrap.remove();
        document.removeEventListener('keydown', onKey);
        resolve(checkbox ? (v ? { checked: !!(chk && chk.checked) } : false) : v);
      };
      const onKey = (e) => { if (e.key === 'Escape') close(false); };
      wrap.addEventListener('click', (e) => {
        const b = e.target.closest('[data-r]');
        if (b) close(b.dataset.r === '1');
        else if (e.target === wrap) close(false);
      });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(wrap);
      requestAnimationFrame(() => { wrap.classList.add('show'); wrap.querySelector('[data-r="1"]').focus(); });
    });
  }

  function openSheet(sheet) {
    ui.sheet = sheet;
    ui.sheetOpened = true;
    renderOverlay();
  }
  function closeSheet() {
    ui.sheet = null;
    renderOverlay();
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* se intenta el método alternativo */ }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  function appUrl() {
    if (window.FT_EMBEDDED) return '';
    return /^https?:/.test(location.protocol) ? location.origin + location.pathname : '';
  }

  function inviteMessage() {
    const L = S.league;
    const url = appUrl();
    return `¡Hola! Te invito a nuestra liga privada "${L.name}" en FantasyTeam.\n\n` +
      `Entra en FantasyTeam${url ? ` (${url})` : ''}, ve a "Acceso para mánagers", pon tu nombre y tu posición y usa este código de liga:\n\n` +
      `${L.code}\n\n` +
      `Empiezas con ${fmtM(L.budget)} para fichar a los jugadores del equipo y armar tu ${FORMATS[L.format].label}. Nos vemos en la clasificación.`;
  }

  /* ───────────── piezas comunes ───────────── */
  function topbar(right) {
    return `<header class="topbar"><div class="topbar-inner">
      <div class="brand">${logo(30)}<span>Fantasy<b>Team</b></span></div>
      <div class="topbar-right">${right}</div></div></header>`;
  }

  function bottomNav(items, active, action) {
    return `<nav class="bottom-nav" aria-label="Secciones">${items.map(([id, label, ic]) =>
      `<button type="button" class="${id === active ? 'active' : ''}" data-action="${action}" data-tab="${id}" ${id === active ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></button>`).join('')}</nav>`;
  }

  const stat = (label, value, sub, cls) => `<div class="stat ${cls || ''}"><small>${label}</small><b>${value}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
  const emptyState = (ic, title, text, extra) => `<div class="empty">${icon(ic)}<h3>${title}</h3><p>${text}</p>${extra || ''}</div>`;
  const radio = (name, value, label, checked) => `<label class="seg-opt"><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''}><span>${label}</span></label>`;

  function rulesCard() {
    return `<section class="card">
      <div class="card-head"><h2>Sistema de puntuación</h2></div>
      <ul class="rules">
        <li><span>Jugar el partido</span><b class="pos-pts">+${RULES.played}</b></li>
        <li><span>Gol de delantero</span><b class="pos-pts">+${RULES.goal.DEL}</b></li>
        <li><span>Gol de centrocampista</span><b class="pos-pts">+${RULES.goal.MED}</b></li>
        <li><span>Gol de defensa o portero</span><b class="pos-pts">+${RULES.goal.DEF}</b></li>
        <li><span>Asistencia</span><b class="pos-pts">+${RULES.assist}</b></li>
        <li><span>Portería a cero (POR/DEF)</span><b class="pos-pts">+${RULES.cleanSheet}</b></li>
        <li><span>MVP del partido</span><b class="pos-pts">+${RULES.mvp}</b></li>
        <li><span>Tarjeta amarilla</span><b class="neg-pts">${RULES.yellow}</b></li>
        <li><span>Tarjeta roja</span><b class="neg-pts">${RULES.red}</b></li>
        <li><span>Capitán</span><b class="gold-pts">x2</b></li>
      </ul></section>`;
  }

  function formatPicker(selected) {
    return `<div class="format-grid">${Object.entries(FORMATS).map(([k, f]) => `
      <label class="format-opt"><input type="radio" name="format" value="${k}" ${k === selected ? 'checked' : ''}>
        <span><b>${f.label}</b><small>${f.starters} titulares · ${f.bench} suplentes</small></span></label>`).join('')}</div>`;
  }

  /* ───────────── pantalla de inicio ───────────── */
  function viewLanding() {
    const L = S.league;
    return `${topbar(`<button type="button" class="btn btn-ghost btn-sm admin-link" data-action="open-admin">${icon('lock')}<span>Panel Admin</span></button>`)}
    <main class="page landing">
      <section class="hero">
        <div class="hero-logo">${logo(88)}</div>
        <h1>Fantasy<span>Team</span></h1>
        <p>La liga fantasy privada de tu equipo. Ficha a tus compañeros, arma tu once y pelea por el primer puesto cada jornada.</p>
        ${L ? `<div class="league-pill">${icon('trophy')}<span>${esc(L.name)}</span></div>` : ''}
      </section>

      <section class="card join-card">
        <div class="card-head"><h2>Acceso para mánagers</h2></div>
        <p class="muted">Entra o regístrate con el código de liga que te pasó el administrador.</p>
        <form id="join-form" class="form" autocomplete="off" novalidate>
          <label>Código de acceso de liga
            <input class="input code-input" name="code" required placeholder="FT-XXXXXX" autocapitalize="characters" spellcheck="false" maxlength="12"></label>
          <label>Tu nombre y apellido
            <input class="input" name="username" required maxlength="40" placeholder="p. ej. Carlos Vega" autocomplete="name"></label>
          <fieldset><legend>Tu posición en el equipo</legend>
            <div class="seg">${POSITIONS.map((pos) => radio('pos', pos, pos, false)).join('')}</div>
            <small class="muted field-help">Entras también como jugador del mercado: tus compañeros podrán ficharte.</small></fieldset>
          <label>Nombre de tu equipo
            <input class="input" name="teamName" required maxlength="28" placeholder="p. ej. Los Galácticos"></label>
          <button class="btn btn-primary btn-block btn-lg" type="submit">${icon('ball')}Entrar a la liga</button>
        </form>
        ${L && L.isDemo ? `<div class="hint">${icon('info')}<div>Hay una liga de ejemplo cargada. Toca el código <button type="button" class="code-chip" data-action="fill-demo">${esc(L.code)}</button> para entrar como <b>Carlos Vega</b> (Los Galácticos), o regístrate con tu nombre y tu posición.</div></div>` : ''}
        ${!L ? `<div class="hint hint-warn">${icon('alert')}<div>Todavía no hay ninguna liga creada en este dispositivo. El administrador debe crearla desde el Panel Admin.</div></div>` : ''}
      </section>

      <section class="features">
        <div>${icon('cart')}<b>Ficha</b><span>Gestiona tu presupuesto en el mercado</span></div>
        <div>${icon('shirt')}<b>Alinea</b><span>Elige formación y capitán</span></div>
        <div>${icon('trophy')}<b>Compite</b><span>Suma puntos cada jornada</span></div>
      </section>
    </main>`;
  }

  /* ───────────── vista mánager ───────────── */
  function viewManager() {
    const m = me();
    const tabs = [['equipo', 'Mi equipo', 'shirt'], ['mercado', 'Mercado', 'cart'], ['ranking', 'Ranking', 'trophy'], ['jornadas', 'Jornadas', 'calendar']];
    const views = { equipo: mgrTeam, mercado: mgrMarket, ranking: viewRanking, jornadas: viewMatchdays };
    const body = (views[ui.mgrTab] || mgrTeam)(m);
    return topbar(`<div class="who"><b>${esc(m.teamName)}</b><small>${esc(m.username)}</small></div>
        <button type="button" class="icon-btn" data-action="logout" aria-label="Cerrar sesión" title="Cerrar sesión">${icon('logout')}</button>`) +
      `<main class="page">${body}</main>` + bottomNav(tabs, ui.mgrTab, 'mgr-tab');
  }

  function mgrTeam(m) {
    const L = S.league;
    const max = SC.squadMax(L.format);
    const st = standings();
    const mine = st.find((r) => r.m.id === m.id) || { total: 0, rank: '–', last: null };
    const lmd = lastMD();
    const fNeeded = FORMATS[L.format].starters;
    const nStart = starters(m).length;
    const formations = FORMATS[L.format].formations;
    const lineupSet = new Set(Object.values(m.slots));

    const warnings = [];
    if (nStart < fNeeded) warnings.push(`Te faltan ${fNeeded - nStart} titular${fNeeded - nStart === 1 ? '' : 'es'} por alinear.`);
    if (!m.captainId && nStart) warnings.push('Elige un capitán: sus puntos valen el doble.');

    const squad = m.squad.map(getPlayer).filter(Boolean).sort((a, b) => posOrder(a.pos) - posOrder(b.pos) || b.value - a.value);

    const myP = linkedPlayer(m);
    const myCard = myP ? `<section class="me-card">
        ${avatar(myP)}
        <div class="li-main"><small>Tu ficha como jugador</small><b>${esc(myP.name)} ${posBadge(myP.pos)} ${statusTag(myP)}</b>
          <small>${fmtM(myP.value)} · ${playerPoints(myP.id).total} pts · en ${ownersCount(myP.id)} equipo${ownersCount(myP.id) === 1 ? '' : 's'}${m.squad.includes(myP.id) ? ' (incluido el tuyo)' : ''}</small></div>
      </section>` : '';
    return `${myCard}
    <section class="stats-grid">
      ${stat('Presupuesto', fmtM(m.money), 'disponible', 'accent')}
      ${stat('Plantilla', `${m.squad.length}/${max}`, `valor ${fmtM(squadValue(m))}`)}
      ${stat('Puntos', mine.total, `${mine.rank}º de ${st.length}`)}
      ${stat('Última jornada', mine.last == null ? '–' : mine.last, lmd ? `J${lmd.number} vs ${esc(lmd.opponent)}` : 'sin jornadas')}
    </section>

    <div class="team-layout">
      <section class="card">
        <div class="card-head"><h2>Alineación</h2><span class="muted small">${FORMATS[L.format].label}</span></div>
        <div class="chips scroll-x" role="group" aria-label="Formación">${formations.map((f) =>
          `<button type="button" class="chip ${m.formation === f ? 'active' : ''}" data-action="formation" data-f="${f}">${f}</button>`).join('')}</div>
        ${pitch(m)}
        ${warnings.length ? `<div class="hint hint-warn">${icon('alert')}<div>${warnings.join('<br>')}</div></div>` : `<p class="muted small center">Toca un jugador para cambiarlo o nombrarlo capitán. El capitán (C) puntúa doble.</p>`}
      </section>

      <section class="card">
        <div class="card-head"><h2>Mi plantilla</h2><button type="button" class="btn btn-sm btn-ghost" data-action="mgr-tab" data-tab="mercado">${icon('cart')}Mercado</button></div>
        ${squad.length ? `<div class="list">${squad.map((p) => {
          const inXI = lineupSet.has(p.id);
          const cap = m.captainId === p.id;
          const pp = playerPoints(p.id);
          return `<div class="row-item">
            ${avatar(p)}
            <div class="li-main"><b>${esc(p.name)} ${cap ? '<span class="tag tag-gold">C</span>' : ''}</b>
              <small>${posBadge(p.pos)} ${inXI ? '<span class="tag tag-em">Titular</span>' : '<span class="tag">Suplente</span>'} ${statusTag(p)} · ${pp.total} pts</small></div>
            <div class="li-side">
              ${!inXI ? `<button type="button" class="btn btn-xs btn-ghost" data-action="auto-place" data-pid="${p.id}">Alinear</button>` : ''}
              <button type="button" class="btn btn-xs btn-outline-danger" data-action="sell" data-pid="${p.id}">Vender ${fmtM(p.value)}</button>
            </div></div>`;
        }).join('')}</div>` : emptyState('cart', 'Tu plantilla está vacía', `Tienes ${fmtM(m.money)} para fichar hasta ${max} jugadores.`, `<button type="button" class="btn btn-primary" data-action="mgr-tab" data-tab="mercado">Ir al mercado</button>`)}
      </section>
    </div>`;
  }

  function pitch(m) {
    const f = SC.parseFormation(m.formation);
    const rows = ['DEL', 'MED', 'DEF', 'POR'].filter((pos) => f[pos] > 0);
    return `<div class="pitch">
      <div class="pitch-lines" aria-hidden="true"><i class="pl-mid"></i><i class="pl-circle"></i><i class="pl-box pl-top"></i><i class="pl-box pl-bottom"></i></div>
      ${rows.map((pos) => `<div class="pitch-row">${Array.from({ length: f[pos] }, (_, i) => slotHtml(m, `${pos}-${i}`, pos)).join('')}</div>`).join('')}
    </div>`;
  }

  function slotHtml(m, key, pos) {
    const pid = m.slots[key];
    const p = pid && getPlayer(pid);
    if (!p) {
      return `<button type="button" class="slot is-empty" data-action="slot" data-slot="${key}" aria-label="Elegir ${POS_LABEL[pos]}">
        <span class="shirt-empty">${icon('plus')}</span><span class="slot-name">${pos}</span></button>`;
    }
    const cap = m.captainId === pid;
    const pp = playerPoints(pid);
    return `<button type="button" class="slot pos-c-${pos}" data-action="slot" data-slot="${key}" aria-label="${esc(p.name)}${cap ? ', capitán' : ''}">
      <span class="shirt">${shirtSvg()}<em>${esc(initials(p.name))}</em>${cap ? '<span class="cap">C</span>' : ''}${p.status === 'injured' ? `<span class="inj" title="Lesionado">+</span>` : ''}</span>
      <span class="slot-name">${esc(shortName(p))}</span>
      <span class="slot-sub">${pp.total} pts</span></button>`;
  }

  function sheetSlot() {
    const m = me();
    if (!m) return null;
    const key = ui.sheet.key;
    const pos = key.split('-')[0];
    const pid = m.slots[key];
    const p = pid && getPlayer(pid);
    const inLineup = new Set(Object.values(m.slots));
    const bench = m.squad.map(getPlayer).filter((x) => x && x.pos === pos && !inLineup.has(x.id));
    const cap = p && m.captainId === p.id;

    let html = `<h3>${p ? 'Titular' : 'Elegir'} · ${POS_LABEL[pos]}</h3>`;
    if (p) {
      const pp = playerPoints(p.id);
      html += `<div class="sheet-player">${avatar(p)}<div><b>${esc(p.name)}</b><small>${p.nickname ? `“${esc(p.nickname)}” · ` : ''}${fmtM(p.value)} · ${pp.total} pts ${statusTag(p)}</small></div></div>
        <div class="btn-row">
          <button type="button" class="btn ${cap ? 'btn-gold' : 'btn-ghost'}" data-action="captain" data-pid="${p.id}">${icon('star')}${cap ? 'Es tu capitán' : 'Nombrar capitán'}</button>
          <button type="button" class="btn btn-ghost" data-action="unslot" data-slot="${key}">${icon('bench')}Al banquillo</button>
        </div>`;
    }
    html += `<h4>${p ? 'Cambiar por' : 'Suplentes disponibles'}</h4>`;
    html += bench.length
      ? `<div class="list">${bench.map((b) => `<button type="button" class="row-item clickable" data-action="assign" data-slot="${key}" data-pid="${b.id}">
          ${avatar(b)}<div class="li-main"><b>${esc(b.name)}</b><small>${b.nickname ? `“${esc(b.nickname)}” · ` : ''}${playerPoints(b.id).total} pts ${statusTag(b)}</small></div>
          <span class="btn btn-xs btn-primary">Alinear</span></button>`).join('')}</div>`
      : `<div class="empty-mini"><p>No tienes ${POS_PLURAL[pos]} en el banquillo.</p>
          <button type="button" class="btn btn-sm btn-primary" data-action="go-market" data-pos="${pos}">${icon('cart')}Fichar ${POS_PLURAL[pos]}</button></div>`;
    return html;
  }

  function mgrMarket(m) {
    const max = SC.squadMax(S.league.format);
    return `<section class="card market-head">
      <div class="mh-stats">
        <div><small>Presupuesto</small><b class="money">${fmtM(m.money)}</b></div>
        <div><small>Plantilla</small><b>${m.squad.length}/${max}</b></div>
      </div>
      <label class="search">${icon('search')}<input id="market-search" type="search" placeholder="Buscar por nombre o apodo" value="${esc(ui.marketQuery)}" aria-label="Buscar jugador"></label>
      <div class="chips" role="group" aria-label="Filtrar por posición">${['ALL', ...POSITIONS].map((p) =>
        `<button type="button" class="chip ${ui.marketPos === p ? 'active' : ''}" data-action="market-pos" data-pos="${p}">${p === 'ALL' ? 'Todos' : p}</button>`).join('')}</div>
    </section>
    <div id="market-list" class="cards">${marketList(m)}</div>`;
  }

  function marketList(m) {
    const max = SC.squadMax(S.league.format);
    const q = ui.marketQuery.trim().toLowerCase();
    const list = S.players
      .filter((p) => ui.marketPos === 'ALL' || p.pos === ui.marketPos)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.nickname || '').toLowerCase().includes(q))
      .sort((a, b) => posOrder(a.pos) - posOrder(b.pos) || b.value - a.value);
    if (!S.players.length) return emptyState('users', 'Mercado vacío', 'El administrador aún no ha cargado jugadores.');
    if (!list.length) return emptyState('search', 'Sin resultados', 'Prueba con otro nombre o posición.');
    return list.map((p) => {
      const owned = m.squad.includes(p.id);
      const pp = playerPoints(p.id);
      const owners = ownersCount(p.id);
      let btn;
      if (owned) btn = `<button type="button" class="btn btn-sm btn-outline-danger" data-action="sell" data-pid="${p.id}">Vender</button>`;
      else if (p.status === 'injured') btn = `<button type="button" class="btn btn-sm" disabled>Lesionado</button>`;
      else if (m.squad.length >= max) btn = `<button type="button" class="btn btn-sm" disabled>Plantilla llena</button>`;
      else if (m.money + 1e-9 < p.value) btn = `<button type="button" class="btn btn-sm" disabled>Sin saldo</button>`;
      else btn = `<button type="button" class="btn btn-sm btn-primary" data-action="buy" data-pid="${p.id}">Fichar</button>`;
      return `<article class="pcard ${owned ? 'owned' : ''}">
        ${avatar(p)}
        <div class="pc-main">
          <div class="pc-name">${esc(p.name)}</div>
          <div class="pc-sub">${posBadge(p.pos)}${p.nickname ? `<span>“${esc(p.nickname)}”</span>` : ''}${statusTag(p)}${owned ? '<span class="tag tag-em">En tu equipo</span>' : ''}</div>
          <div class="pc-meta">${pp.total} pts · última ${pp.last == null ? '–' : pp.last} · en ${owners} equipo${owners === 1 ? '' : 's'}</div>
        </div>
        <div class="pc-side"><b class="price">${fmtM(p.value)}</b>${btn}</div>
      </article>`;
    }).join('');
  }

  function viewRanking(m) {
    const st = standings();
    const last = lastMD();
    if (!st.length) return emptyState('trophy', 'Aún no hay mánagers', 'Comparte el código de la liga para que se unan.');
    const podium = st.length >= 3 ? `<div class="podium">${[st[1], st[0], st[2]].map((r, i) => `
        <div class="pod pod-${[2, 1, 3][i]} ${m && r.m.id === m.id ? 'me' : ''}">
          <div class="pod-badge">${[2, 1, 3][i]}</div>
          <b>${esc(r.m.teamName)}</b><small>${esc(r.m.username)}</small>
          <div class="pod-bar"><span>${r.total}</span><small>pts</small></div>
        </div>`).join('')}</div>` : '';
    return `<section class="card">
      <div class="card-head"><h2>Clasificación</h2><span class="live">${icon('refresh')}En vivo</span></div>
      <p class="muted small">${esc(S.league.name)}${last ? ` · tras la jornada ${last.number} vs ${esc(last.opponent)}` : ' · aún no se ha jugado ninguna jornada'}</p>
      ${podium}
      <div class="table" role="table">
        <div class="tr th" role="row"><span>#</span><span>Equipo</span><span class="num">Últ.</span><span class="num">Total</span></div>
        ${st.map((r) => `<div class="tr ${m && r.m.id === m.id ? 'me' : ''}" role="row">
          <span class="rank r-${r.rank}">${r.rank}</span>
          <span class="team"><b>${esc(r.m.teamName)}</b><small>${esc(r.m.username)}</small></span>
          <span class="num muted">${r.last == null ? '–' : r.last}</span>
          <span class="num total">${r.total}</span></div>`).join('')}
      </div></section>`;
  }

  function viewMatchdays(m) {
    const mds = sortedMDs();
    if (!mds.length) return emptyState('calendar', 'Sin jornadas todavía', 'Cuando el administrador cargue el primer partido verás aquí los puntos.') + rulesCard();
    const sel = mds.find((x) => x.id === ui.mdView) || mds[mds.length - 1];
    const nameOf = (pid) => (sel.stats[pid] && sel.stats[pid].name) || (getPlayer(pid) || {}).name || 'Jugador eliminado';
    const posOf = (pid) => (sel.stats[pid] && sel.stats[pid].pos) || (getPlayer(pid) || {}).pos || 'MED';

    const mine = m ? mdManagerPoints(sel, m.id) : null;
    const mdRank = S.managers.map((x) => ({ m: x, r: mdManagerPoints(sel, x.id) })).filter((x) => x.r).sort((a, b) => b.r.total - a.r.total);
    const scored = Object.entries(sel.stats).map(([pid, st]) => ({ pid, st, res: SC.scorePlayer(st.pos, st) })).sort((a, b) => b.res.total - a.res.total);

    return `
    <div class="chips scroll-x" role="group" aria-label="Jornada">${mds.map((x) => `<button type="button" class="chip ${x.id === sel.id ? 'active' : ''}" data-action="md-view" data-id="${x.id}">J${x.number}</button>`).join('')}</div>

    <section class="card match-card">
      <small>Jornada ${sel.number} · ${fmtDate(sel.date)}</small>
      <div class="scoreline"><span>Nosotros</span><b>${sel.scoreFor == null ? '–' : sel.scoreFor} <i>:</i> ${sel.scoreAgainst == null ? '–' : sel.scoreAgainst}</b><span>${esc(sel.opponent || 'Rival')}</span></div>
    </section>

    ${m ? `<section class="card">
      <div class="card-head"><h2>Tu once en la J${sel.number}</h2>${mine ? `<span class="big-pts">${mine.total} pts</span>` : ''}</div>
      ${mine ? `<div class="list">${mine.rows.map((r) => `<div class="row-item">
          ${avatar({ name: nameOf(r.pid) }, posOf(r.pid))}
          <div class="li-main"><b>${esc(nameOf(r.pid))} ${r.captain ? '<span class="tag tag-gold">C x2</span>' : ''}</b><small>${posBadge(posOf(r.pid))} ${r.played ? '' : '<span class="muted">No convocado</span>'}</small></div>
          <b class="pts ${r.pts < 0 ? 'neg' : ''}">${r.pts}</b></div>`).join('')}</div>`
        : `<p class="muted">No tenías alineación registrada cuando se cargó esta jornada.</p>`}
    </section>` : ''}

    <section class="card">
      <div class="card-head"><h2>Ranking de la jornada</h2></div>
      ${mdRank.length ? `<div class="table">${mdRank.map((x, i) => `<div class="tr ${m && x.m.id === m.id ? 'me' : ''}">
        <span class="rank r-${i + 1}">${i + 1}</span><span class="team"><b>${esc(x.m.teamName)}</b><small>${esc(x.m.username)}</small></span><span></span><span class="num total">${x.r.total}</span></div>`).join('')}</div>`
        : '<p class="muted">Ningún mánager tenía alineación en esta jornada.</p>'}
    </section>

    <section class="card">
      <div class="card-head"><h2>Puntos por jugador</h2><span class="muted small">Toca para ver el detalle</span></div>
      <div class="list">${scored.map(({ pid, st, res }) => {
        const open = ui.expanded === sel.id + pid;
        return `<button type="button" class="row-item clickable ${open ? 'open' : ''}" data-action="expand" data-key="${sel.id + pid}" aria-expanded="${open}">
          ${avatar({ name: st.name }, st.pos)}
          <div class="li-main"><b>${esc(st.name)}</b><small>${posBadge(st.pos)} ${statIcons(st)}</small>
            ${open ? `<ul class="breakdown">${res.items.length ? res.items.map((it) => `<li><span>${esc(it.label)}</span><b class="${it.pts < 0 ? 'neg-pts' : 'pos-pts'}">${fmtPts(it.pts)}</b></li>`).join('') : '<li><span>No jugó</span><b>0</b></li>'}</ul>` : ''}
          </div>
          <b class="pts ${res.total < 0 ? 'neg' : ''}">${res.total}</b></button>`;
      }).join('')}</div>
    </section>
    ${rulesCard()}`;
  }

  function statIcons(st) {
    const out = [`<span class="si">${st.minutes}'</span>`];
    if (st.goals) out.push(`<span class="si si-g">${icon('ball')}${st.goals}</span>`);
    if (st.assists) out.push(`<span class="si">A${st.assists}</span>`);
    if (st.cleanSheet && (st.pos === 'POR' || st.pos === 'DEF') && st.minutes > 0) out.push('<span class="si">PC</span>');
    if (st.mvp) out.push(`<span class="si si-mvp">${icon('star')}MVP</span>`);
    if (st.yellow) out.push(`<span class="card-y" title="Amarilla"></span>`.repeat(st.yellow));
    if (st.red) out.push('<span class="card-r" title="Roja"></span>');
    return out.join('');
  }

  /* ───────────── vista administrador ───────────── */
  function viewAdmin() {
    const tabs = [['liga', 'Liga', 'sliders'], ['jugadores', 'Jugadores', 'users'], ['jornadas', 'Jornadas', 'calendar'], ['managers', 'Mánagers', 'trophy']];
    const views = { liga: adminLeague, jugadores: adminPlayers, jornadas: adminMatchdays, managers: adminManagers };
    const editing = ui.adminTab === 'jornadas' && ui.mdDraft;
    return topbar(`<span class="badge-admin">${icon('lock')}Admin</span>
        <button type="button" class="icon-btn" data-action="logout" aria-label="Salir del panel" title="Salir del panel">${icon('logout')}</button>`) +
      `<main class="page ${editing ? 'with-savebar' : ''}">${(views[ui.adminTab] || adminLeague)()}</main>` +
      (editing ? '' : bottomNav(tabs, ui.adminTab, 'admin-tab'));
  }

  function adminLeague() {
    const L = S.league;
    const danger = `<section class="card danger-zone">
      <div class="card-head"><h2>Zona de riesgo</h2></div>
      <div class="btn-stack">
        <button type="button" class="btn btn-danger" data-action="reset-league">${icon('trash')}Reiniciar liga desde cero</button>
        <button type="button" class="btn btn-ghost" data-action="load-demo">${icon('refresh')}Cargar liga de ejemplo</button>
      </div></section>`;
    const backup = `<section class="card">
      <div class="card-head"><h2>Copia de seguridad</h2></div>
      <p class="muted small">Los datos viven solo en este navegador. Descarga una copia para no perderlos o para pasarlos a otro dispositivo.</p>
      <div class="btn-row">
        <button type="button" class="btn btn-ghost" data-action="export">${icon('download')}Exportar</button>
        <label class="btn btn-ghost file-btn">${icon('upload')}Importar<input type="file" id="import-file" accept="application/json,.json" hidden></label>
      </div></section>`;

    if (!L) {
      return `<section class="card">
        <div class="card-head"><h2>Crear liga</h2></div>
        <p class="muted">Configura tu torneo en FantasyTeam. Al crearlo se genera el código de invitación para tus compañeros.</p>
        <form id="league-form" class="form">
          <label>Nombre del torneo<input class="input" name="name" required maxlength="40" placeholder="p. ej. Liga de los Jueves"></label>
          <label>Presupuesto inicial por mánager (millones)<input class="input" name="budget" type="number" min="10" max="1000" step="0.5" value="100" required></label>
          <fieldset><legend>Formato de alineación</legend>${formatPicker('F7')}</fieldset>
          <button class="btn btn-primary btn-block btn-lg" type="submit">${icon('trophy')}Crear liga y generar código</button>
        </form></section>${backup}${danger}`;
    }

    const lmd = lastMD();
    return `
    <section class="card invite-card">
      <div class="card-head"><h2>Código de invitación</h2>${L.isDemo ? '<span class="tag">Demo</span>' : ''}</div>
      <div class="code-display" aria-label="Código de liga">${esc(L.code)}</div>
      <div class="btn-row">
        <button type="button" class="btn btn-primary" data-action="copy-invite">${icon('copy')}Copiar invitación</button>
        <a class="btn btn-whatsapp" href="https://wa.me/?text=${encodeURIComponent(inviteMessage())}" target="_blank" rel="noopener">${icon('chat')}WhatsApp</a>
      </div>
      <button type="button" class="btn btn-link" data-action="new-code">${icon('refresh')}Generar un código nuevo</button>
    </section>

    <section class="stats-grid">
      ${stat('Jugadores', S.players.length, ((n) => `${n} lesionado${n === 1 ? '' : 's'}`)(S.players.filter((p) => p.status === 'injured').length))}
      ${stat('Mánagers', S.managers.length, 'registrados')}
      ${stat('Jornadas', S.matchdays.length, lmd ? `última: J${lmd.number}` : 'ninguna')}
      ${stat('Formato', FORMATS[L.format].label, `${fmtM(L.budget)} por mánager`)}
    </section>

    <section class="card">
      <div class="card-head"><h2>Configuración de la liga</h2></div>
      <form id="league-form" class="form">
        <label>Nombre del torneo<input class="input" name="name" required maxlength="40" value="${esc(L.name)}"></label>
        <label>Presupuesto inicial por mánager (millones)<input class="input" name="budget" type="number" min="10" max="1000" step="0.5" value="${L.budget}" required>
          <small class="muted">Si lo cambias, la diferencia se suma o resta al saldo de todos los mánagers.</small></label>
        <fieldset><legend>Formato de alineación</legend>${formatPicker(L.format)}</fieldset>
        <button class="btn btn-primary btn-block" type="submit">${icon('check')}Guardar cambios</button>
      </form>
    </section>
    ${backup}${danger}`;
  }

  function adminPlayers() {
    const list = S.players
      .filter((p) => ui.adminPos === 'ALL' || p.pos === ui.adminPos)
      .sort((a, b) => posOrder(a.pos) - posOrder(b.pos) || a.name.localeCompare(b.name));
    return `<section class="card">
      <div class="card-head"><h2>Jugadores <span class="count">${S.players.length}</span></h2>
        <button type="button" class="btn btn-sm btn-primary" data-action="new-player">${icon('plus')}Nuevo</button></div>
      <div class="chips">${['ALL', ...POSITIONS].map((p) => `<button type="button" class="chip ${ui.adminPos === p ? 'active' : ''}" data-action="admin-pos" data-pos="${p}">${p === 'ALL' ? 'Todos' : p}</button>`).join('')}</div>
    </section>
    <div class="cards">${list.length ? list.map((p) => {
      const pp = playerPoints(p.id);
      return `<article class="pcard">
        ${avatar(p)}
        <div class="pc-main">
          <div class="pc-name">${esc(p.name)}</div>
          <div class="pc-sub">${posBadge(p.pos)}${p.nickname ? `<span>“${esc(p.nickname)}”</span>` : ''}${S.managers.some((m) => m.playerId === p.id) ? '<span class="tag tag-em">Mánager</span>' : ''}${p.selfRegistered ? '<span class="tag tag-gold">Revisar valor</span>' : ''}</div>
          <div class="pc-meta">${fmtM(p.value)} · ${pp.total} pts · en ${ownersCount(p.id)} equipos</div>
        </div>
        <div class="pc-side">
          <button type="button" class="status-toggle ${p.status}" data-action="toggle-status" data-pid="${p.id}" title="Cambiar estado">${p.status === 'injured' ? 'Lesionado' : 'Disponible'}</button>
          <div class="icon-row">
            <button type="button" class="icon-btn sm" data-action="edit-player" data-pid="${p.id}" aria-label="Editar ${esc(p.name)}">${icon('edit')}</button>
            <button type="button" class="icon-btn sm danger" data-action="delete-player" data-pid="${p.id}" aria-label="Eliminar ${esc(p.name)}">${icon('trash')}</button>
          </div>
        </div></article>`;
    }).join('') : emptyState('users', 'Sin jugadores', 'Añade a los futbolistas de tu equipo para abrir el mercado.', `<button type="button" class="btn btn-primary" data-action="new-player">${icon('plus')}Añadir jugador</button>`)}</div>`;
  }

  function sheetPlayer() {
    const p = ui.sheet.id ? getPlayer(ui.sheet.id) : null;
    return `<h3>${p ? 'Editar jugador' : 'Nuevo jugador'}</h3>
    <form id="player-form" class="form">
      <label>Nombre completo<input class="input" name="name" required maxlength="40" value="${esc(p ? p.name : '')}"></label>
      <label>Apodo<input class="input" name="nickname" maxlength="20" value="${esc(p ? p.nickname : '')}" placeholder="Opcional"></label>
      <fieldset><legend>Posición</legend><div class="seg">${POSITIONS.map((pos) => radio('pos', pos, pos, (p ? p.pos : 'MED') === pos)).join('')}</div></fieldset>
      <label>Valor de mercado (millones)<input class="input" name="value" type="number" min="0.5" max="200" step="0.5" required value="${p ? p.value : 5}"></label>
      <fieldset><legend>Estado</legend><div class="seg">${radio('status', 'available', 'Disponible', !p || p.status !== 'injured')}${radio('status', 'injured', 'Lesionado', p && p.status === 'injured')}</div></fieldset>
      <div class="btn-row">
        <button type="button" class="btn btn-ghost" data-action="close-sheet">Cancelar</button>
        <button type="submit" class="btn btn-primary">${p ? 'Guardar cambios' : 'Crear jugador'}</button>
      </div>
    </form>`;
  }

  function adminMatchdays() {
    if (ui.mdDraft) return mdForm();
    const mds = sortedMDs().reverse();
    return `<section class="card">
      <div class="card-head"><h2>Jornadas <span class="count">${mds.length}</span></h2>
        <button type="button" class="btn btn-sm btn-primary" data-action="new-md" ${S.players.length ? '' : 'disabled'}>${icon('plus')}Nueva</button></div>
      <p class="muted small">Al guardar una jornada nueva se congelan las alineaciones y capitanes actuales de todos los mánagers. Cárgala justo después del partido.</p>
    </section>
    <div class="cards">${mds.length ? mds.map((md) => {
      const top = Object.entries(md.stats).map(([pid, st]) => ({ st, pts: SC.scorePlayer(st.pos, st).total })).sort((a, b) => b.pts - a.pts)[0];
      const called = Object.keys(md.stats).length;
      return `<article class="md-card">
        <div class="md-num">J${md.number}</div>
        <div class="pc-main">
          <div class="pc-name">vs ${esc(md.opponent || 'Rival')} <span class="score">${md.scoreFor == null ? '' : `${md.scoreFor}-${md.scoreAgainst}`}</span></div>
          <div class="pc-meta">${fmtDate(md.date)} · ${called} convocados${top ? ` · mejor: ${esc(top.st.name)} (${top.pts})` : ''}</div>
        </div>
        <div class="icon-row">
          <button type="button" class="icon-btn sm" data-action="edit-md" data-id="${md.id}" aria-label="Editar jornada ${md.number}">${icon('edit')}</button>
          <button type="button" class="icon-btn sm danger" data-action="delete-md" data-id="${md.id}" aria-label="Eliminar jornada ${md.number}">${icon('trash')}</button>
        </div></article>`;
    }).join('') : emptyState('calendar', 'Sin jornadas', S.players.length ? 'Registra el primer partido para repartir puntos.' : 'Primero añade jugadores en la pestaña Jugadores.')}</div>`;
  }

  function newDraft(md) {
    const nextNum = S.matchdays.reduce((a, x) => Math.max(a, x.number), 0) + 1;
    const blank = () => ({ called: false, minutes: 90, goals: 0, assists: 0, cleanSheet: false, yellow: 0, red: false, mvp: false });
    const fromStat = (st) => ({ called: true, minutes: st.minutes, goals: st.goals, assists: st.assists, cleanSheet: !!st.cleanSheet, yellow: st.yellow, red: !!st.red, mvp: !!st.mvp });
    const rows = [];
    const seen = new Set();
    [...S.players].sort((a, b) => posOrder(a.pos) - posOrder(b.pos) || a.name.localeCompare(b.name)).forEach((p) => {
      const st = md && md.stats[p.id];
      rows.push({ pid: p.id, name: p.name, pos: st ? st.pos : p.pos, status: p.status, deleted: false, s: st ? fromStat(st) : blank() });
      seen.add(p.id);
    });
    if (md) {
      Object.entries(md.stats).forEach(([pid, st]) => {
        if (!seen.has(pid)) rows.push({ pid, name: st.name, pos: st.pos, status: 'available', deleted: true, s: fromStat(st) });
      });
    }
    return {
      id: md ? md.id : null,
      number: md ? md.number : nextNum,
      opponent: md ? md.opponent : '',
      date: md ? md.date : todayISO(),
      scoreFor: md && md.scoreFor != null ? md.scoreFor : '',
      scoreAgainst: md && md.scoreAgainst != null ? md.scoreAgainst : '',
      rows,
    };
  }

  function mdForm() {
    const d = ui.mdDraft;
    const nCalled = d.rows.filter((r) => r.s.called).length;
    return `<section class="card">
      <div class="card-head"><h2>${d.id ? `Editar jornada ${esc(d.number)}` : 'Nueva jornada'}</h2></div>
      <div class="form grid-2">
        <label>Nº de jornada<input class="input" type="number" min="1" max="99" value="${esc(d.number)}" data-md-meta="number"></label>
        <label>Fecha<input class="input" type="date" value="${esc(d.date)}" data-md-meta="date"></label>
        <label class="span-2">Rival<input class="input" maxlength="30" value="${esc(d.opponent)}" placeholder="Nombre del rival" data-md-meta="opponent"></label>
        <label>Goles a favor<input class="input" type="number" min="0" max="50" inputmode="numeric" value="${esc(d.scoreFor)}" data-md-meta="scoreFor"></label>
        <label>Goles en contra<input class="input" type="number" min="0" max="50" inputmode="numeric" value="${esc(d.scoreAgainst)}" data-md-meta="scoreAgainst"></label>
      </div>
      <p class="muted small">Si pones 0 goles en contra se marca automáticamente la portería a cero a porteros y defensas.</p>
    </section>
    <div class="md-toolbar">
      <span class="muted small">Convocados: <b id="md-count">${nCalled}</b></span>
      <div class="btn-row">
        <button type="button" class="btn btn-xs btn-ghost" data-action="md-all" data-v="1">Convocar a todos</button>
        <button type="button" class="btn btn-xs btn-ghost" data-action="md-all" data-v="0">Ninguno</button>
      </div>
    </div>
    <div class="md-list">${d.rows.map(mdRowHtml).join('')}</div>
    <div class="savebar">
      <button type="button" class="btn btn-ghost" data-action="md-cancel">Cancelar</button>
      <button type="button" class="btn btn-primary" data-action="md-save">${icon('check')}Guardar jornada</button>
    </div>`;
  }

  function mdRowHtml(row) {
    const s = row.s;
    const pts = s.called ? SC.scorePlayer(row.pos, s).total : 0;
    const stepper = (field, label, v, max) => `<div class="stepper"><span>${label}</span><div>
      <button type="button" data-action="md-step" data-pid="${row.pid}" data-field="${field}" data-d="-1" ${v <= 0 ? 'disabled' : ''} aria-label="Menos ${label}">−</button>
      <b>${v}</b>
      <button type="button" data-action="md-step" data-pid="${row.pid}" data-field="${field}" data-d="1" ${v >= max ? 'disabled' : ''} aria-label="Más ${label}">+</button></div></div>`;
    const flag = (field, label, on, cls) => `<button type="button" class="flag ${on ? 'on' : ''} ${cls || ''}" data-action="md-flag" data-pid="${row.pid}" data-field="${field}" aria-pressed="${on}">${label}</button>`;
    return `<div class="md-row ${s.called ? 'called' : ''}" data-row="${row.pid}">
      <button type="button" class="md-head" data-action="md-toggle" data-pid="${row.pid}" aria-pressed="${s.called}">
        <span class="tick">${s.called ? icon('check') : ''}</span>
        ${avatar({ name: row.name }, row.pos)}
        <span class="md-name"><b>${esc(row.name)}</b><small>${posBadge(row.pos)}${row.status === 'injured' ? '<span class="tag tag-danger">Lesionado</span>' : ''}${row.deleted ? '<span class="tag">Eliminado</span>' : ''}</small></span>
        <span class="pts-badge ${pts < 0 ? 'neg' : ''}" data-pts>${s.called ? fmtPts(pts) : '—'}</span>
      </button>
      ${s.called ? `<div class="md-body">
        <label class="mini">Minutos<input type="number" min="0" max="130" inputmode="numeric" value="${s.minutes}" data-md-field="minutes" data-pid="${row.pid}"></label>
        ${stepper('goals', 'Goles', s.goals, 20)}
        ${stepper('assists', 'Asistencias', s.assists, 20)}
        ${stepper('yellow', 'Amarillas', s.yellow, 2)}
        <div class="flags">
          ${row.pos === 'POR' || row.pos === 'DEF' ? flag('cleanSheet', 'Portería a 0', s.cleanSheet) : ''}
          ${flag('red', 'Roja', s.red, 'flag-red')}
          ${flag('mvp', 'MVP', s.mvp, 'flag-gold')}
        </div>
      </div>` : ''}
    </div>`;
  }

  function refreshMdRow(pid) {
    const row = ui.mdDraft.rows.find((r) => r.pid === pid);
    const el = document.querySelector(`.md-row[data-row="${CSS.escape(pid)}"]`);
    if (row && el) el.outerHTML = mdRowHtml(row);
    const c = $('#md-count');
    if (c) c.textContent = ui.mdDraft.rows.filter((r) => r.s.called).length;
  }

  function adminManagers() {
    if (!S.league) return emptyState('trophy', 'Crea primero la liga', 'Los mánagers se registran con el código de la liga.');
    const st = standings();
    return `<section class="card">
      <div class="card-head"><h2>Mánagers <span class="count">${st.length}</span></h2></div>
      ${st.length ? `<div class="list">${st.map((r) => `<div class="row-item">
        <span class="rank r-${r.rank}">${r.rank}</span>
        <div class="li-main"><b>${esc(r.m.teamName)}</b><small>${esc(r.m.username)}${linkedPos(r.m)} · desde ${fmtTs(r.m.joinedAt)} · ${r.m.squad.length} jugadores · ${fmtM(r.m.money)} libres</small></div>
        <b class="pts">${r.total}</b>
        <button type="button" class="icon-btn sm danger" data-action="kick" data-id="${r.m.id}" aria-label="Expulsar a ${esc(r.m.username)}" title="Expulsar">${icon('ban')}</button>
      </div>`).join('')}</div>` : emptyState('users', 'Nadie se ha unido aún', 'Comparte el código desde la pestaña Liga.', `<button type="button" class="btn btn-primary" data-action="admin-tab" data-tab="liga">Ver código</button>`)}
    </section>
    ${S.banned.length ? `<section class="card">
      <div class="card-head"><h2>Expulsados</h2></div>
      <p class="muted small">No pueden volver a entrar con el código mientras estén en esta lista.</p>
      <div class="list">${S.banned.map((u) => `<div class="row-item"><div class="li-main"><b>${esc(u)}</b></div>
        <button type="button" class="btn btn-xs btn-ghost" data-action="unban" data-u="${esc(u)}">Readmitir</button></div>`).join('')}</div>
    </section>` : ''}`;
  }

  function sheetAdminLogin() {
    return `<h3>${icon('lock')}Panel Admin</h3>
      <p class="muted">Introduce la contraseña de administrador para gestionar la liga.</p>
      <form id="admin-form" class="form">
        <label>Contraseña<input class="input" type="password" name="password" required autocomplete="current-password" id="admin-pass"></label>
        <div class="btn-row">
          <button type="button" class="btn btn-ghost" data-action="close-sheet">Cancelar</button>
          <button type="submit" class="btn btn-primary">Entrar</button>
        </div>
      </form>`;
  }

  /* ───────────── render ───────────── */
  function validateSession() {
    if (session && session.role === 'manager' && (!S.league || !getManager(session.managerId))) {
      session = null;
      Store.clearSession();
      setTimeout(() => toast('Tu sesión ya no es válida. Vuelve a entrar con el código de la liga.', 'info'), 50);
    }
  }

  function render() {
    validateSession();
    const app = $('#app');
    let html;
    if (!session) html = viewLanding();
    else if (session.role === 'admin') html = viewAdmin();
    else html = viewManager();
    app.innerHTML = html;
    document.body.dataset.role = session ? session.role : 'guest';
    document.title = S.league ? `FantasyTeam · ${S.league.name}` : 'FantasyTeam';
    renderOverlay();
  }

  function renderOverlay() {
    const root = $('#overlay-root');
    const makers = { slot: sheetSlot, player: sheetPlayer, 'admin-login': sheetAdminLogin };
    const html = ui.sheet && makers[ui.sheet.type] ? makers[ui.sheet.type]() : null;
    if (html == null) {
      ui.sheet = null;
      root.innerHTML = '';
      document.body.classList.remove('no-scroll');
      return;
    }
    const animate = ui.sheetOpened;
    ui.sheetOpened = false;
    root.innerHTML = `<div class="sheet-backdrop ${animate ? 'animate' : ''}" data-action="close-sheet">
      <div class="sheet" data-action="noop" role="dialog" aria-modal="true">
        <button type="button" class="icon-btn sheet-close" data-action="close-sheet" aria-label="Cerrar">${icon('x')}</button>
        ${html}</div></div>`;
    document.body.classList.add('no-scroll');
    if (animate) {
      const first = root.querySelector('input:not([type=hidden]):not([type=radio])');
      if (first) setTimeout(() => first.focus(), 60);
    }
  }

  /* ───────────── acciones ───────────── */
  function logout() {
    session = null;
    Store.clearSession();
    ui.mdDraft = null;
    ui.sheet = null;
    render();
    toast('Sesión cerrada', 'info');
  }

  function buy(pid) {
    const m = me();
    const p = getPlayer(pid);
    if (!m || !p) return;
    const max = SC.squadMax(S.league.format);
    if (m.squad.includes(pid)) return toast('Ya está en tu plantilla', 'info');
    if (p.status === 'injured') return toast(`${p.name} está lesionado y no se puede fichar`, 'error');
    if (m.squad.length >= max) return toast(`Plantilla llena (${max} jugadores). Vende a alguien primero.`, 'error');
    if (m.money + 1e-9 < p.value) return toast(`Te faltan ${fmtM(p.value - m.money)} para fichar a ${p.name}`, 'error');
    m.money = r1(m.money - p.value);
    m.squad.push(pid);
    const free = SC.slotKeys(m.formation).find((k) => k.startsWith(p.pos + '-') && !m.slots[k]);
    if (free) m.slots[free] = pid;
    commit(`Fichaste a ${p.name} por ${fmtM(p.value)}${free ? ' y ya está en tu once' : ''}`);
  }

  async function sell(pid) {
    const m = me();
    const p = getPlayer(pid);
    if (!m || !p || !m.squad.includes(pid)) return;
    const ok = await confirmDialog({ title: `Vender a ${p.name}`, text: `Recibirás ${fmtM(p.value)}, su valor de mercado actual, y saldrá de tu alineación.`, ok: 'Vender', danger: true });
    if (!ok) return;
    m.money = r1(m.money + p.value);
    m.squad = m.squad.filter((x) => x !== pid);
    Object.keys(m.slots).forEach((k) => { if (m.slots[k] === pid) delete m.slots[k]; });
    if (m.captainId === pid) m.captainId = null;
    ui.sheet = null;
    commit(`Vendiste a ${p.name} por ${fmtM(p.value)}`);
  }

  async function exportData() {
    const json = JSON.stringify(S, null, 2);
    const filename = `fantasyteam-${todayISO()}.json`;
    if (window.claude && window.claude.use) {
      try {
        const dl = await window.claude.use('downloads');
        if (dl) {
          await dl.save({ filename, data: json });
          return toast('Copia de seguridad descargada');
        }
      } catch (e) {
        return toast('No se descargó la copia', 'info');
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast('Copia de seguridad descargada');
  }

  async function importData(file) {
    try {
      const data = Store.normalize(JSON.parse(await file.text()));
      const ok = await confirmDialog({ title: 'Importar copia', text: `Se reemplazarán todos los datos actuales por los de "${file.name}" (${data.players.length} jugadores, ${data.managers.length} mánagers, ${data.matchdays.length} jornadas).`, ok: 'Importar', danger: true });
      if (!ok) return;
      S = data;
      commit('Datos importados correctamente');
    } catch (e) {
      toast('El archivo no es una copia válida de FantasyTeam', 'error');
    }
  }

  const actions = {
    noop() {},
    'close-sheet': closeSheet,
    'open-admin': () => openSheet({ type: 'admin-login' }),
    'fill-demo'() {
      const f = $('#join-form');
      f.code.value = S.league.code;
      f.username.value = 'Carlos Vega';
      f.teamName.value = 'Los Galácticos';
      const r = f.querySelector('input[name=pos][value=DEL]');
      if (r) r.checked = true;
    },
    logout,

    'mgr-tab'(el) { ui.mgrTab = el.dataset.tab; render(); window.scrollTo(0, 0); },
    'admin-tab'(el) { ui.adminTab = el.dataset.tab; render(); window.scrollTo(0, 0); },

    formation(el) {
      const m = me();
      relayout(m, el.dataset.f);
      commit(`Formación ${el.dataset.f}`, 'info');
    },
    slot(el) { openSheet({ type: 'slot', key: el.dataset.slot }); },
    assign(el) {
      const m = me();
      const pid = el.dataset.pid;
      Object.keys(m.slots).forEach((k) => { if (m.slots[k] === pid) delete m.slots[k]; });
      m.slots[el.dataset.slot] = pid;
      ui.sheet = null;
      commit(`${getPlayer(pid).name} entra en el once`);
    },
    unslot(el) {
      const m = me();
      const pid = m.slots[el.dataset.slot];
      delete m.slots[el.dataset.slot];
      if (m.captainId === pid) m.captainId = null;
      ui.sheet = null;
      commit(`${getPlayer(pid).name} pasa al banquillo`, 'info');
    },
    captain(el) {
      const m = me();
      const p = getPlayer(el.dataset.pid);
      m.captainId = m.captainId === p.id ? null : p.id;
      ui.sheet = null;
      commit(m.captainId ? `${p.name} es tu capitán (x2)` : 'Has quitado la capitanía', m.captainId ? 'success' : 'info');
    },
    'auto-place'(el) {
      const m = me();
      const p = getPlayer(el.dataset.pid);
      const free = SC.slotKeys(m.formation).find((k) => k.startsWith(p.pos + '-') && !m.slots[k]);
      if (!free) return toast(`No hay hueco libre de ${p.pos} en tu formación. Toca a un titular para cambiarlo.`, 'info');
      m.slots[free] = p.id;
      commit(`${p.name} entra en el once`);
    },
    'go-market'(el) {
      ui.sheet = null;
      ui.mgrTab = 'mercado';
      ui.marketPos = el.dataset.pos;
      ui.marketQuery = '';
      render();
      window.scrollTo(0, 0);
    },
    'market-pos'(el) { ui.marketPos = el.dataset.pos; render(); },
    buy(el) { buy(el.dataset.pid); },
    sell(el) { sell(el.dataset.pid); },
    'md-view'(el) { ui.mdView = el.dataset.id; ui.expanded = null; render(); },
    expand(el) { ui.expanded = ui.expanded === el.dataset.key ? null : el.dataset.key; render(); },

    // admin · liga
    async 'copy-invite'() {
      const ok = await copyText(inviteMessage());
      toast(ok ? 'Invitación copiada. Pégala en WhatsApp.' : 'No se pudo copiar. Mantén pulsado el código para copiarlo.', ok ? 'success' : 'error');
    },
    async 'new-code'() {
      const ok = await confirmDialog({ title: 'Generar código nuevo', text: 'El código actual dejará de servir para entrar. Los mánagers ya registrados siguen en la liga.', ok: 'Generar' });
      if (!ok) return;
      S.league.code = Store.genCode();
      commit(`Nuevo código: ${S.league.code}`);
    },
    async 'reset-league'() {
      const res = await confirmDialog({ title: 'Reiniciar liga desde cero', text: 'Se borrarán la liga, los mánagers, las jornadas y los puntos. Esta acción no se puede deshacer.', ok: 'Borrar todo', danger: true, checkbox: 'Conservar la base de datos de jugadores' });
      if (!res) return;
      const keep = res.checked ? S.players : [];
      S = Store.empty();
      S.players = keep;
      ui.adminTab = 'liga';
      commit('Liga reiniciada. Crea tu nueva liga.', 'info');
    },
    async 'load-demo'() {
      const ok = await confirmDialog({ title: 'Cargar liga de ejemplo', text: 'Se reemplazarán todos los datos actuales por la liga demo (12 jugadores, 3 mánagers y 1 jornada).', ok: 'Cargar demo', danger: true });
      if (!ok) return;
      S = Store.seed();
      commit('Liga de ejemplo cargada');
    },
    export: exportData,

    // admin · jugadores
    'admin-pos'(el) { ui.adminPos = el.dataset.pos; render(); },
    'new-player': () => openSheet({ type: 'player', id: null }),
    'edit-player': (el) => openSheet({ type: 'player', id: el.dataset.pid }),
    'toggle-status'(el) {
      const p = getPlayer(el.dataset.pid);
      p.status = p.status === 'injured' ? 'available' : 'injured';
      commit(`${p.name}: ${p.status === 'injured' ? 'lesionado' : 'disponible'}`, 'info');
    },
    async 'delete-player'(el) {
      const p = getPlayer(el.dataset.pid);
      const owners = S.managers.filter((m) => m.squad.includes(p.id));
      const ok = await confirmDialog({
        title: `Eliminar a ${p.name}`,
        text: owners.length
          ? `Está en ${owners.length} plantilla${owners.length === 1 ? '' : 's'}: saldrá de ellas y se devolverán ${fmtM(p.value)} a cada mánager. Sus puntos en jornadas pasadas se conservan.`
          : 'Sus puntos en jornadas pasadas se conservan en el historial.',
        ok: 'Eliminar', danger: true,
      });
      if (!ok) return;
      owners.forEach((m) => { m.money = r1(m.money + p.value); });
      S.players = S.players.filter((x) => x.id !== p.id);
      S.managers.forEach(sanitizeManager);
      commit(`${p.name} eliminado${owners.length ? ` (reembolso a ${owners.length} mánager${owners.length === 1 ? '' : 's'})` : ''}`);
    },

    // admin · jornadas
    'new-md'() { ui.mdDraft = newDraft(null); render(); window.scrollTo(0, 0); },
    'edit-md'(el) { ui.mdDraft = newDraft(S.matchdays.find((x) => x.id === el.dataset.id)); render(); window.scrollTo(0, 0); },
    async 'delete-md'(el) {
      const md = S.matchdays.find((x) => x.id === el.dataset.id);
      const ok = await confirmDialog({ title: `Eliminar jornada ${md.number}`, text: 'Se restarán de la clasificación todos los puntos de esta jornada.', ok: 'Eliminar', danger: true });
      if (!ok) return;
      S.matchdays = S.matchdays.filter((x) => x.id !== md.id);
      commit(`Jornada ${md.number} eliminada`);
    },
    async 'md-cancel'() {
      const ok = await confirmDialog({ title: 'Descartar cambios', text: 'Los datos de esta jornada que no hayas guardado se perderán.', ok: 'Descartar', danger: true });
      if (!ok) return;
      ui.mdDraft = null;
      render();
    },
    'md-toggle'(el) {
      const row = ui.mdDraft.rows.find((r) => r.pid === el.dataset.pid);
      row.s.called = !row.s.called;
      if (row.s.called && (row.pos === 'POR' || row.pos === 'DEF') && String(ui.mdDraft.scoreAgainst) === '0') row.s.cleanSheet = true;
      if (!row.s.called) row.s.mvp = false;
      refreshMdRow(row.pid);
    },
    'md-all'(el) {
      const on = el.dataset.v === '1';
      ui.mdDraft.rows.forEach((r) => {
        if (on && r.status === 'injured' && !r.s.called) return;
        r.s.called = on;
        if (!on) r.s.mvp = false;
        if (on && (r.pos === 'POR' || r.pos === 'DEF') && String(ui.mdDraft.scoreAgainst) === '0') r.s.cleanSheet = true;
      });
      render();
      if (on && ui.mdDraft.rows.some((r) => r.status === 'injured')) toast('Los lesionados no se convocan automáticamente', 'info');
    },
    'md-step'(el) {
      const row = ui.mdDraft.rows.find((r) => r.pid === el.dataset.pid);
      const f = el.dataset.field;
      const max = f === 'yellow' ? 2 : 20;
      row.s[f] = int(row.s[f] + Number(el.dataset.d), 0, max);
      refreshMdRow(row.pid);
    },
    'md-flag'(el) {
      const row = ui.mdDraft.rows.find((r) => r.pid === el.dataset.pid);
      const f = el.dataset.field;
      row.s[f] = !row.s[f];
      if (f === 'mvp' && row.s.mvp) {
        ui.mdDraft.rows.forEach((r) => { if (r !== row && r.s.mvp) { r.s.mvp = false; refreshMdRow(r.pid); } });
      }
      refreshMdRow(row.pid);
    },
    'md-save'() {
      const d = ui.mdDraft;
      const called = d.rows.filter((r) => r.s.called);
      const num = parseInt(d.number, 10);
      if (!num || num < 1) return toast('Indica un número de jornada válido', 'error');
      if (S.matchdays.some((x) => x.number === num && x.id !== d.id)) return toast(`Ya existe la jornada ${num}`, 'error');
      if (!called.length) return toast('Marca al menos un jugador convocado', 'error');
      const sf = d.scoreFor === '' ? null : int(d.scoreFor, 0, 50);
      const sa = d.scoreAgainst === '' ? null : int(d.scoreAgainst, 0, 50);
      const stats = {};
      called.forEach((r) => {
        const s = r.s;
        stats[r.pid] = {
          minutes: int(s.minutes, 0, 130), goals: int(s.goals, 0, 20), assists: int(s.assists, 0, 20),
          cleanSheet: !!s.cleanSheet && (r.pos === 'POR' || r.pos === 'DEF'),
          yellow: int(s.yellow, 0, 2), red: !!s.red, mvp: !!s.mvp, pos: r.pos, name: r.name,
        };
      });
      const meta = { number: num, opponent: String(d.opponent || '').trim() || 'Rival', date: d.date || todayISO(), scoreFor: sf, scoreAgainst: sa, stats };
      if (d.id) {
        Object.assign(S.matchdays.find((x) => x.id === d.id), meta, { updatedAt: Date.now() });
      } else {
        const lineups = {};
        S.managers.forEach((m) => { lineups[m.id] = Store.snapshotLineup(m); });
        S.matchdays.push(Object.assign({ id: Store.uid('md'), lineups, createdAt: Date.now() }, meta));
      }
      ui.mdDraft = null;
      commit(`Jornada ${num} guardada. Clasificación actualizada.`);
      window.scrollTo(0, 0);
    },

    // admin · mánagers
    async kick(el) {
      const m = getManager(el.dataset.id);
      const ok = await confirmDialog({ title: `Expulsar a ${m.username}`, text: `Se eliminará el equipo "${m.teamName}" de la liga y no podrá volver a entrar con ese nombre. Su ficha de jugador se mantiene en el mercado.`, ok: 'Expulsar', danger: true });
      if (!ok) return;
      S.managers = S.managers.filter((x) => x.id !== m.id);
      if (!S.banned.some((b) => b.toLowerCase() === m.username.toLowerCase())) S.banned.push(m.username);
      commit(`${m.username} ha sido expulsado`);
    },
    unban(el) {
      S.banned = S.banned.filter((u) => u !== el.dataset.u);
      commit(`${el.dataset.u} puede volver a entrar`, 'info');
    },
  };

  /* ───────────── formularios ───────────── */
  const forms = {
    'join-form'(f) {
      const code = f.code.value.trim().toUpperCase().replace(/\s+/g, '');
      const username = f.username.value.trim().replace(/\s+/g, ' ');
      const pos = (f.querySelector('input[name=pos]:checked') || {}).value;
      const teamName = f.teamName.value.trim().replace(/\s+/g, ' ');
      const deny = (msg) => { toast(msg, 'error'); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); };
      if (!code || !username || !teamName) return deny('Completa el código, tu nombre y el nombre de tu equipo');
      if (!S.league) return deny('No hay ninguna liga creada en este dispositivo');
      if (code !== S.league.code) return deny('Código de liga no válido. Acceso denegado.');
      if (username.length < 3) return deny('Escribe tu nombre (al menos 3 letras)');
      const lower = username.toLowerCase();
      if (S.banned.some((b) => b.toLowerCase() === lower)) return deny('Fuiste expulsado de esta liga. Habla con el administrador.');

      const existing = S.managers.find((m) => m.username.toLowerCase() === lower);
      if (existing) {
        if (existing.teamName.toLowerCase() !== teamName.toLowerCase()) return deny('Ese nombre ya está registrado con otro equipo');
        session = { role: 'manager', managerId: existing.id };
        Store.saveSession(session);
        ui.mgrTab = 'equipo';
        render();
        return toast(`Bienvenido de nuevo, ${existing.username.split(' ')[0]}`);
      }
      if (!POSITIONS.includes(pos)) return deny('Elige tu posición en el equipo');
      if (S.managers.some((m) => m.teamName.toLowerCase() === teamName.toLowerCase())) return deny('Ya hay un equipo con ese nombre');

      // Cada participante es también un futbolista del mercado.
      let player = S.players.find((p) => p.name.toLowerCase() === lower);
      let created = false;
      if (!player) {
        player = { id: Store.uid('p'), name: username, nickname: '', pos, value: NEW_PLAYER_VALUE, status: 'available', createdAt: Date.now(), selfRegistered: true };
        S.players.push(player);
        created = true;
      }
      const m = {
        id: Store.uid('m'), username, teamName, playerId: player.id, joinedAt: Date.now(),
        money: r1(S.league.budget), squad: [], formation: FORMATS[S.league.format].formations[0], slots: {}, captainId: null,
      };
      S.managers.push(m);
      session = { role: 'manager', managerId: m.id };
      Store.saveSession(session);
      ui.mgrTab = 'mercado';
      ui.marketPos = 'ALL';
      commit(created
        ? `¡${teamName} ya está en la liga! Entras al mercado como ${POS_LABEL[pos].toLowerCase()} (${fmtM(player.value)}). Tienes ${fmtM(m.money)} para fichar.`
        : `¡${teamName} ya está en la liga! Ya figurabas en la plantilla como ${player.pos}. Tienes ${fmtM(m.money)} para fichar.`);
    },
    'admin-form'(f) {
      if (f.password.value === ADMIN_PASSWORD) {
        session = { role: 'admin' };
        Store.saveSession(session);
        ui.sheet = null;
        ui.adminTab = 'liga';
        render();
        toast('Panel de administración desbloqueado');
      } else {
        f.password.value = '';
        f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
        toast('Contraseña incorrecta', 'error');
      }
    },
    async 'league-form'(f) {
      const name = f.name.value.trim();
      const budget = r1(f.budget.value);
      const format = (f.querySelector('input[name=format]:checked') || {}).value || 'F7';
      if (!name) return toast('Ponle un nombre al torneo', 'error');
      if (!(budget >= 10)) return toast('El presupuesto mínimo es 10M', 'error');

      if (!S.league) {
        S.league = { name, budget, format, code: Store.genCode(), isDemo: false, createdAt: Date.now() };
        S.managers.forEach((m) => relayout(m, FORMATS[format].formations[0]));
        return commit(`Liga "${name}" creada. Comparte el código ${S.league.code}`);
      }
      const L = S.league;
      if (format !== L.format) {
        const ok = await confirmDialog({ title: `Cambiar a ${FORMATS[format].label}`, text: 'Las alineaciones de todos los mánagers se reajustarán a la formación por defecto del nuevo formato. Las plantillas y las jornadas pasadas no cambian.', ok: 'Cambiar formato' });
        if (!ok) return;
        S.managers.forEach((m) => relayout(m, FORMATS[format].formations[0]));
      }
      const delta = r1(budget - L.budget);
      if (delta) S.managers.forEach((m) => { m.money = r1(m.money + delta); });
      Object.assign(L, { name, budget, format });
      commit(`Configuración guardada${delta ? ` (${delta > 0 ? '+' : ''}${fmtM(delta)} a cada mánager)` : ''}`);
    },
    'player-form'(f) {
      const name = f.name.value.trim().replace(/\s+/g, ' ');
      const nickname = f.nickname.value.trim();
      const pos = (f.querySelector('input[name=pos]:checked') || {}).value;
      const value = r1(f.value.value);
      const status = (f.querySelector('input[name=status]:checked') || {}).value || 'available';
      if (!name) return toast('El nombre es obligatorio', 'error');
      if (!POSITIONS.includes(pos)) return toast('Elige una posición', 'error');
      if (!(value > 0)) return toast('El valor debe ser mayor que 0', 'error');
      const id = ui.sheet && ui.sheet.id;
      if (id) {
        const p = getPlayer(id);
        const posChanged = p.pos !== pos;
        Object.assign(p, { name, nickname, pos, value, status, selfRegistered: false });
        if (posChanged) S.managers.forEach(sanitizeManager);
        ui.sheet = null;
        commit(`${name} actualizado${posChanged ? '. Ha salido de las alineaciones por el cambio de posición.' : ''}`);
      } else {
        S.players.push({ id: Store.uid('p'), name, nickname, pos, value, status, createdAt: Date.now() });
        ui.sheet = null;
        commit(`${name} añadido a la plantilla real`);
      }
    },
  };

  /* ───────────── eventos ───────────── */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    // "noop" solo frena el cierre de la hoja al tocar dentro; no debe bloquear envíos de formularios.
    if (!el || el.disabled || el.dataset.action === 'noop') return;
    const fn = actions[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    fn(el, e);
  });

  document.addEventListener('submit', (e) => {
    const fn = forms[e.target.id];
    if (!fn) return;
    e.preventDefault();
    fn(e.target);
  });

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'market-search') {
      ui.marketQuery = t.value;
      const m = me();
      const list = $('#market-list');
      if (m && list) list.innerHTML = marketList(m);
      return;
    }
    if (!ui.mdDraft) return;
    if (t.dataset.mdMeta) {
      ui.mdDraft[t.dataset.mdMeta] = t.value;
      return;
    }
    if (t.dataset.mdField) {
      const row = ui.mdDraft.rows.find((r) => r.pid === t.dataset.pid);
      row.s[t.dataset.mdField] = t.value === '' ? 0 : int(t.value, 0, 130);
      const badge = t.closest('.md-row').querySelector('[data-pts]');
      const pts = SC.scorePlayer(row.pos, row.s).total;
      badge.textContent = fmtPts(pts);
      badge.classList.toggle('neg', pts < 0);
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'import-file' && t.files && t.files[0]) {
      importData(t.files[0]);
      t.value = '';
      return;
    }
    if (ui.mdDraft && t.dataset.mdMeta === 'scoreAgainst' && t.value !== '') {
      const zero = Number(t.value) === 0;
      ui.mdDraft.rows.forEach((r) => {
        if ((r.pos === 'POR' || r.pos === 'DEF') && r.s.called) {
          r.s.cleanSheet = zero;
          refreshMdRow(r.pid);
        }
      });
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.sheet && !document.querySelector('.modal-backdrop')) closeSheet();
  });

  // Mantiene la clasificación y el mercado al día si la liga cambia en otra pestaña.
  window.addEventListener('storage', (e) => {
    if (e.key !== Store.KEY) return;
    S = Store.load();
    if (ui.mdDraft) return; // no pisar un formulario a medio rellenar
    render();
  });

  render();
})();
