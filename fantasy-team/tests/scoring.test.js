// Ejecutar con: node tests/scoring.test.js
const assert = require('assert');
const path = require('path');
const SC = require('../js/scoring.js');

// Reglas básicas
assert.strictEqual(SC.scorePlayer('DEL', { minutes: 90, goals: 1 }).total, 2 + 4);
assert.strictEqual(SC.scorePlayer('MED', { minutes: 90, goals: 1 }).total, 2 + 5);
assert.strictEqual(SC.scorePlayer('DEF', { minutes: 90, goals: 1 }).total, 2 + 6);
assert.strictEqual(SC.scorePlayer('POR', { minutes: 90, goals: 1 }).total, 2 + 6);
assert.strictEqual(SC.scorePlayer('MED', { minutes: 90, assists: 2 }).total, 2 + 6);
assert.strictEqual(SC.scorePlayer('POR', { minutes: 90, cleanSheet: true }).total, 6);
assert.strictEqual(SC.scorePlayer('DEL', { minutes: 90, cleanSheet: true }).total, 2, 'la portería a cero no puntúa para DEL');
assert.strictEqual(SC.scorePlayer('DEF', { minutes: 0, cleanSheet: true }).total, 0, 'sin jugar no hay portería a cero');
assert.strictEqual(SC.scorePlayer('MED', { minutes: 90, mvp: true }).total, 5);
assert.strictEqual(SC.scorePlayer('MED', { minutes: 90, yellow: 1 }).total, 1);
assert.strictEqual(SC.scorePlayer('MED', { minutes: 90, yellow: 2, red: true }).total, 2 - 2 - 3);
assert.strictEqual(SC.scorePlayer('MED', { minutes: 0 }).total, 0);

// Formaciones
assert.deepStrictEqual(SC.parseFormation('4-3-3'), { POR: 1, DEF: 4, MED: 3, DEL: 3 });
for (const [k, f] of Object.entries(SC.FORMATS)) {
  f.formations.forEach((fm) => assert.strictEqual(SC.slotKeys(fm).length, f.starters, `${k} ${fm}`));
}
const { slots, leftovers } = SC.assignSlots('2-1-1', ['a', 'b', 'c', 'd'], (id) => ({ a: 'DEF', b: 'DEF', c: 'DEF', d: 'POR' }[id]));
assert.deepStrictEqual(slots, { 'DEF-0': 'a', 'DEF-1': 'b', 'POR-0': 'd' });
assert.deepStrictEqual(leftovers, ['c']);

// Capitán x2
const r = SC.lineupPoints({ starters: ['x', 'y'], captainId: 'x' }, { x: { pos: 'DEL', minutes: 90, goals: 1 }, y: { pos: 'MED', minutes: 10 } });
assert.strictEqual(r.total, 12 + 2);

// Datos de ejemplo: totales esperados de la jornada 1
global.window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, crypto: require('crypto').webcrypto, FTScoring: SC };
require(path.join('..', 'js', 'store.js'));
const seed = window.FTStore.seed();
assert.strictEqual(seed.players.length, 12);
assert.strictEqual(seed.matchdays.length, 1);
assert.match(seed.league.code, /^FT-[A-Z2-9]{6}$/);
const md = seed.matchdays[0];
const totals = Object.fromEntries(seed.managers.map((m) => [m.username, SC.lineupPoints(md.lineups[m.id], md.stats).total]));
assert.deepStrictEqual(totals, { carlos: 45, lucia: 42, pedro: 22 });
seed.managers.forEach((m) => assert.ok(m.money >= 0, `${m.username} con saldo negativo`));

console.log('OK: todas las pruebas de puntuación pasan', totals);
