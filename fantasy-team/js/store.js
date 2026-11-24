/* FantasyTeam · Persistencia y datos de ejemplo.
   Toda la lectura/escritura de datos pasa por este módulo. Para llevar la liga a un
   backend compartido (Supabase, Firebase...) basta con reimplementar load/save aquí. */
(function (root) {
  'use strict';
  const { FORMATS, assignSlots, slotKeys } = root.FTScoring;

  const KEY = 'fantasyteam:data:v2';
  const SESSION_KEY = 'fantasyteam:session:v2';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function genCode() {
    const bytes = new Uint8Array(6);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(bytes);
    else for (let i = 0; i < 6; i++) bytes[i] = Math.floor(Math.random() * 256);
    let s = '';
    bytes.forEach((b) => (s += CODE_CHARS[b % CODE_CHARS.length]));
    return 'FT-' + s;
  }

  function isoDaysAgo(days) {
    const d = new Date(Date.now() - days * 86400000);
    return d.toISOString().slice(0, 10);
  }

  function empty() {
    return { version: 1, league: null, players: [], managers: [], matchdays: [], banned: [] };
  }

  /** Congela la alineación titular actual de un mánager (se guarda dentro de cada jornada). */
  function snapshotLineup(m) {
    const starters = slotKeys(m.formation).map((k) => m.slots[k]).filter(Boolean);
    return {
      formation: m.formation,
      starters,
      captainId: starters.includes(m.captainId) ? m.captainId : null,
      teamName: m.teamName,
    };
  }

  // [id, nombre, apodo, posición, valor (M), estado]
  const SEED_PLAYERS = [
    ['p01', 'Martín Ríos', 'El Muro', 'POR', 8, 'available'],
    ['p02', 'Diego Salas', 'Gato', 'POR', 6, 'available'],
    ['p03', 'Andrés Molina', 'Toro', 'DEF', 9, 'available'],
    ['p04', 'Javier Paredes', 'Jefe', 'DEF', 8, 'available'],
    ['p05', 'Luis Cárdenas', 'Flaco', 'DEF', 7, 'available'],
    ['p06', 'Pablo Ortega', 'Rulo', 'DEF', 6.5, 'injured'],
    ['p07', 'Sergio Navarro', 'Maestro', 'MED', 12, 'available'],
    ['p08', 'Hugo Benítez', 'Motor', 'MED', 10, 'available'],
    ['p09', 'Iván Castro', 'Pibe', 'MED', 8.5, 'available'],
    ['p10', 'Carlos Vega', 'Killer', 'DEL', 14, 'available'],
    ['p11', 'Mateo Herrera', 'Rayo', 'DEL', 11, 'available'],
    ['p12', 'Nicolás Fuentes', 'Tanque', 'DEL', 9, 'available'],
  ];

  // Estadísticas de la jornada 1 simulada (victoria 3-1).
  const SEED_STATS = {
    p01: { minutes: 90 },
    p02: { minutes: 0 },
    p03: { minutes: 90, goals: 1, yellow: 1 },
    p04: { minutes: 90 },
    p05: { minutes: 70, assists: 1 },
    p07: { minutes: 90, assists: 1, mvp: true },
    p08: { minutes: 80, yellow: 1 },
    p09: { minutes: 30 },
    p10: { minutes: 90, goals: 2 },
    p11: { minutes: 60, assists: 1 },
    p12: { minutes: 20 },
  };

  function seed() {
    const now = Date.now();
    const budget = 100;
    const players = SEED_PLAYERS.map(([id, name, nickname, pos, value, status]) => ({ id, name, nickname, pos, value, status, createdAt: now }));
    const byId = Object.fromEntries(players.map((p) => [p.id, p]));
    const posOf = (id) => byId[id] && byId[id].pos;

    // Cada mánager es también un jugador de la plantilla (playerId).
    const mk = (id, playerId, teamName, squad, formation, starters, captainId, daysAgo) => {
      const cost = squad.reduce((a, pid) => a + byId[pid].value, 0);
      return {
        id, username: byId[playerId].name, playerId, teamName,
        joinedAt: now - daysAgo * 86400000,
        money: r1(budget - cost),
        squad, formation,
        slots: assignSlots(formation, starters, posOf).slots,
        captainId,
      };
    };

    const managers = [
      mk('m_demo1', 'p10', 'Los Galácticos', ['p01', 'p03', 'p04', 'p05', 'p07', 'p08', 'p10', 'p11'], '3-2-1', ['p01', 'p03', 'p04', 'p05', 'p07', 'p08', 'p10'], 'p10', 12),
      mk('m_demo2', 'p07', 'Atlético Barrio', ['p02', 'p03', 'p05', 'p07', 'p09', 'p10', 'p12'], '2-2-2', ['p02', 'p03', 'p05', 'p07', 'p09', 'p10', 'p12'], 'p07', 11),
      mk('m_demo3', 'p01', 'Real Sofá', ['p01', 'p04', 'p05', 'p06', 'p08', 'p09', 'p11', 'p12'], '3-1-2', ['p01', 'p04', 'p05', 'p06', 'p08', 'p11', 'p12'], 'p11', 10),
    ];

    const stats = {};
    Object.entries(SEED_STATS).forEach(([pid, s]) => {
      stats[pid] = {
        minutes: s.minutes || 0, goals: s.goals || 0, assists: s.assists || 0,
        cleanSheet: !!s.cleanSheet, yellow: s.yellow || 0, red: !!s.red, mvp: !!s.mvp,
        pos: byId[pid].pos, name: byId[pid].name,
      };
    });

    const lineups = {};
    managers.forEach((m) => (lineups[m.id] = snapshotLineup(m)));

    return {
      version: 1,
      league: { name: 'Liga FantasyTeam Demo', budget, format: 'F7', code: genCode(), isDemo: true, createdAt: now },
      players,
      managers,
      matchdays: [{
        id: 'md_demo1', number: 1, opponent: 'Deportivo Norte', date: isoDaysAgo(7),
        scoreFor: 3, scoreAgainst: 1, stats, lineups, createdAt: now,
      }],
      banned: [],
    };
  }

  /** Asegura que un objeto cargado (localStorage o copia importada) tenga la forma esperada. */
  function normalize(d) {
    if (!d || typeof d !== 'object') throw new Error('Formato no válido');
    const base = empty();
    const out = {
      version: 1,
      league: d.league && typeof d.league === 'object' ? d.league : null,
      players: Array.isArray(d.players) ? d.players : base.players,
      managers: Array.isArray(d.managers) ? d.managers : base.managers,
      matchdays: Array.isArray(d.matchdays) ? d.matchdays : base.matchdays,
      banned: Array.isArray(d.banned) ? d.banned : base.banned,
    };
    if (out.league && !FORMATS[out.league.format]) out.league.format = 'F7';
    out.managers.forEach((m) => {
      m.squad = Array.isArray(m.squad) ? m.squad : [];
      m.slots = m.slots && typeof m.slots === 'object' ? m.slots : {};
      m.money = r1(m.money);
      if (!m.formation) m.formation = FORMATS[(out.league && out.league.format) || 'F7'].formations[0];
    });
    out.matchdays.forEach((md) => {
      md.stats = md.stats || {};
      md.lineups = md.lineups || {};
    });
    return out;
  }

  function load() {
    try {
      const raw = root.localStorage.getItem(KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) {
      console.warn('FantasyTeam: no se pudieron leer los datos guardados', e);
    }
    const s = seed();
    save(s);
    return s;
  }

  function save(data) {
    try {
      root.localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('FantasyTeam: no se pudo guardar', e);
      return false;
    }
  }

  function loadSession() {
    try {
      return JSON.parse(root.localStorage.getItem(SESSION_KEY)) || null;
    } catch (e) {
      return null;
    }
  }
  function saveSession(s) {
    try { root.localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) { /* sin persistencia */ }
  }
  function clearSession() {
    try { root.localStorage.removeItem(SESSION_KEY); } catch (e) { /* sin persistencia */ }
  }

  root.FTStore = { KEY, SESSION_KEY, uid, genCode, empty, seed, normalize, load, save, loadSession, saveSession, clearSession, snapshotLineup, r1 };
})(typeof window !== 'undefined' ? window : globalThis);
