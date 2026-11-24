/* FantasyTeam · Reglas de puntuación, formatos y formaciones.
   Lógica pura (sin DOM): funciona en el navegador (window.FTScoring) y en Node (require). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FTScoring = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const POSITIONS = ['POR', 'DEF', 'MED', 'DEL'];
  const POS_LABEL = { POR: 'Portero', DEF: 'Defensa', MED: 'Centrocampista', DEL: 'Delantero' };
  const POS_PLURAL = { POR: 'porteros', DEF: 'defensas', MED: 'centrocampistas', DEL: 'delanteros' };

  const RULES = {
    played: 2,
    goal: { DEL: 4, MED: 5, DEF: 6, POR: 6 },
    assist: 3,
    cleanSheet: 4,
    mvp: 3,
    yellow: -1,
    red: -3,
  };

  const FORMATS = {
    F5: { label: 'Fútbol 5', starters: 5, bench: 2, formations: ['2-1-1', '1-2-1', '1-1-2'] },
    F7: { label: 'Fútbol 7', starters: 7, bench: 3, formations: ['3-2-1', '2-3-1', '3-1-2', '2-2-2'] },
    F11: { label: 'Fútbol 11', starters: 11, bench: 4, formations: ['4-4-2', '4-3-3', '3-5-2', '3-4-3', '5-3-2', '4-5-1'] },
  };

  function parseFormation(str) {
    const [d, m, f] = String(str || '').split('-').map(Number);
    return { POR: 1, DEF: d || 0, MED: m || 0, DEL: f || 0 };
  }

  /** Claves de hueco en orden POR → DEF → MED → DEL, p. ej. ["POR-0","DEF-0",...]. */
  function slotKeys(formation) {
    const f = parseFormation(formation);
    const keys = [];
    POSITIONS.forEach((pos) => {
      for (let i = 0; i < f[pos]; i++) keys.push(pos + '-' + i);
    });
    return keys;
  }

  function squadMax(format) {
    const f = FORMATS[format] || FORMATS.F7;
    return f.starters + f.bench;
  }

  const int = (v, min, max) => {
    const n = Math.trunc(Number(v) || 0);
    return Math.min(max, Math.max(min, n));
  };

  /** Puntos de un jugador en un partido, con el desglose de cada concepto. */
  function scorePlayer(pos, s) {
    s = s || {};
    const items = [];
    const minutes = int(s.minutes, 0, 130);
    const goals = int(s.goals, 0, 20);
    const assists = int(s.assists, 0, 20);
    const yellow = int(s.yellow, 0, 2);
    const played = minutes > 0;

    if (played) items.push({ label: `Jugó el partido (${minutes}')`, pts: RULES.played });
    if (goals) items.push({ label: goals === 1 ? 'Gol' : `${goals} goles`, pts: goals * (RULES.goal[pos] || RULES.goal.DEL) });
    if (assists) items.push({ label: assists === 1 ? 'Asistencia' : `${assists} asistencias`, pts: assists * RULES.assist });
    if (played && s.cleanSheet && (pos === 'POR' || pos === 'DEF')) items.push({ label: 'Portería a cero', pts: RULES.cleanSheet });
    if (s.mvp) items.push({ label: 'MVP del partido', pts: RULES.mvp });
    if (yellow) items.push({ label: yellow === 1 ? 'Tarjeta amarilla' : '2 tarjetas amarillas', pts: yellow * RULES.yellow });
    if (s.red) items.push({ label: 'Tarjeta roja', pts: RULES.red });

    return { total: items.reduce((a, i) => a + i.pts, 0), items };
  }

  /** Reparte jugadores en los huecos de una formación respetando su posición. */
  function assignSlots(formation, pids, posOf) {
    const f = parseFormation(formation);
    const counters = { POR: 0, DEF: 0, MED: 0, DEL: 0 };
    const slots = {};
    const leftovers = [];
    (pids || []).forEach((pid) => {
      const pos = posOf(pid);
      if (!pos) return;
      if (counters[pos] < f[pos]) slots[pos + '-' + counters[pos]++] = pid;
      else leftovers.push(pid);
    });
    return { slots, leftovers };
  }

  /** Puntos de un mánager en una jornada a partir de la alineación congelada. Capitán x2. */
  function lineupPoints(lineup, stats) {
    if (!lineup) return null;
    stats = stats || {};
    const rows = (lineup.starters || []).map((pid) => {
      const st = stats[pid];
      const base = st ? scorePlayer(st.pos, st).total : 0;
      const captain = pid === lineup.captainId;
      return { pid, played: !!st, base, captain, pts: captain ? base * 2 : base };
    });
    return { rows, total: rows.reduce((a, r) => a + r.pts, 0) };
  }

  return { POSITIONS, POS_LABEL, POS_PLURAL, RULES, FORMATS, parseFormation, slotKeys, squadMax, scorePlayer, assignSlots, lineupPoints };
});
