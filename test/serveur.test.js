import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from '../serveur/node_modules/ws/index.js';
import { demarrerServeur } from '../serveur/serveur.js';
import { botAction, TEST_CONFIG } from './aide.js';

const ORIGIN = 'http://test.local';
const quiet = () => {};

// Client de test : envoie avec un numéro de référence, attend la réponse, garde la dernière vue reçue
function connect(port, origin = ORIGIN) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin });
    const c = { ws, vue: null, refus: [], waiters: [], n: 0 };
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.t === 'partie') c.vue = m;
      if (m.t === 'refus' && !m.ref) c.refus.push(m.error);
      c.waiters = c.waiters.filter((w) => !w(m));
    });
    c.send = (obj) => new Promise((res) => {
      const ref = ++c.n;
      c.waiters.push((m) => (m.ref === ref ? (res(m), true) : false));
      ws.send(JSON.stringify({ ...obj, ref }));
    });
    c.until = (pred, ms = 20000) => new Promise((res, rej) => {
      if (c.vue && pred(c.vue)) return res(c.vue);
      const timer = setTimeout(() => rej(new Error('attente trop longue')), ms);
      c.waiters.push((m) => (m.t === 'partie' && pred(m) ? (clearTimeout(timer), res(m), false) : false));
    });
    c.close = () => ws.close();
    ws.on('open', () => resolve(c));
    ws.on('unexpected-response', (_, r) => reject(new Error(`HTTP ${r.statusCode}`)));
    ws.on('error', reject);
  });
}

// Fait jouer un client avec le bot jusqu'à la fin de partie. Un refus sur une vue périmée (l'autre joueur ou
// l'IA a joué entre-temps) est normal : on le note et on attend la vue suivante.
async function botLoop(c, ctl) {
  c.refusVus = [];
  while (!ctl.stop) {
    const v = c.vue;
    if (v?.statut === 'fini') return;
    const a = v?.view && botAction(v.view, v.siege);
    if (a && v.view.waiting.includes(v.siege)) {
      const seq = v.view.seq;
      const r = await c.send({ t: 'action', action: a });
      if (r.t === 'ok') c.actions = (c.actions || 0) + 1;
      else c.refusVus.push(`${a.type} : ${r.error}`);
      await c.until((x) => x.view.seq > seq || x.statut === 'fini', 2000).catch(() => {});
    } else await new Promise((r) => setTimeout(r, 10));
  }
}
// Échoue si la partie n'avance plus pendant `ms`
async function watchdog(c, ctl, ms = 15000) {
  let seq = -1, at = Date.now();
  while (!ctl.stop) {
    await new Promise((r) => setTimeout(r, 200));
    if (c.vue?.statut === 'fini') return;
    const s = c.vue?.view?.seq ?? -1;
    if (s !== seq) { seq = s; at = Date.now(); continue; }
    if (Date.now() - at > ms) {
      const v = c.vue.view;
      throw new Error(`partie figée : ${JSON.stringify({ phase: v.phase, cur: v.cur, waiting: v.waiting, pending: v.pending, trade: v.trade, rolled: v.rolled, sieges: c.vue.sieges })}`);
    }
  }
}

describe('serveur WebSocket', () => {
  let dir, srv;
  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'tdh-'));
    srv = await demarrerServeur({ config: { ...TEST_CONFIG, port: 0, db: join(dir, 'parties.sqlite') }, log: quiet });
  });
  after(async () => { await srv?.fermer(); rmSync(dir, { recursive: true, force: true }); });

  test('origine non autorisée refusée', async () => {
    await assert.rejects(connect(srv.port, 'https://ailleurs.example'), /403/);
  });

  test('santé', async () => {
    const r = await fetch(`http://127.0.0.1:${srv.port}/sante`, { headers: { origin: ORIGIN } });
    assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
    assert.equal((await r.json()).ok, true);
  });

  test('jeton inconnu', async () => {
    const c = await connect(srv.port);
    const r = await c.send({ t: 'hello', jeton: 'nimporte' });
    assert.equal(r.code, 'jeton');
    c.close();
  });

  test('partie complète à deux humains et deux IA, chacun ne voit que sa main', async () => {
    const a = await connect(srv.port), b = await connect(srv.port);
    const pa = await a.send({ t: 'creer', nom: 'Brasserie A', humains: 2, mode: 'direct', delai: 600 });
    assert.equal(pa.t, 'place');
    await a.until((v) => v.statut === 'salle');
    assert.equal((await b.send({ t: 'rejoindre', code: pa.code.toLowerCase(), nom: 'Brasserie A' })).t, 'refus');
    const pb = await b.send({ t: 'rejoindre', code: pa.code, nom: 'Brasserie B' });
    assert.equal(pb.siege, 1);
    assert.equal((await b.send({ t: 'demarrer' })).t, 'refus');
    await a.until((v) => v.sieges[1].nom === 'Brasserie B' && v.sieges[1].connecte);
    assert.equal((await a.send({ t: 'demarrer' })).t, 'ok');
    await b.until((v) => v.statut === 'jeu');
    const v = b.vue.view;
    assert.equal(v.players[0].res, null);
    assert.ok(v.players[1].res);
    assert.equal(v.seed, undefined);
    const ctl = { stop: false };
    try {
      await Promise.race([Promise.all([botLoop(a, ctl), botLoop(b, ctl)]), watchdog(a, ctl)]);
      await a.until((x) => x.statut === 'fini', 5000);
    } finally { ctl.stop = true; }
    assert.equal(a.vue.view.phase, 'over');
    assert.ok(a.vue.view.turn > 20, `partie trop courte (${a.vue.view.turn} tours)`);
    assert.ok(a.actions > 20 && b.actions > 20, `les deux humains ont joué (${a.actions} et ${b.actions} actions)`);
    assert.ok(a.vue.view.players.every((p) => p.res), 'tout est révélé à la fin');
    assert.deepEqual(a.refus, []);
    const refus = [...a.refusVus, ...b.refusVus];
    assert.ok(refus.length <= 5, `trop de refus : ${refus.join(' | ')}`);
    console.log(`  partie réseau : ${a.vue.view.turn} tours, ${a.actions} + ${b.actions} actions humaines, ${refus.length} refus sur vue périmée (${refus.join(' | ')}), gagnant ${a.vue.view.players[a.vue.view.winner].name}`);
    a.close(); b.close();
  });

  test('mes parties : celles où c’est mon tour', async () => {
    const a = await connect(srv.port);
    const p = await a.send({ t: 'creer', nom: 'Solitaire', humains: 1, mode: 'differe' });
    await a.send({ t: 'demarrer' });
    await a.until((v) => v.statut === 'jeu' && v.view.waiting.includes(0));
    const r = await a.send({ t: 'mesparties', jetons: [p.jeton, 'inconnu'] });
    assert.equal(r.parties.length, 1);
    assert.equal(r.parties[0].aMoi, true);
    assert.equal(r.parties[0].code, p.code);
    a.close();
  });

  test('un redémarrage du serveur ne perd rien', async () => {
    const a = await connect(srv.port);
    const p = await a.send({ t: 'creer', nom: 'Tenace', humains: 2, mode: 'differe' });
    await a.send({ t: 'demarrer' });
    await a.until((v) => v.statut === 'jeu' && v.view.waiting.includes(0));
    const before = a.vue.view;
    a.close();
    await srv.fermer();
    srv = await demarrerServeur({ config: { ...TEST_CONFIG, port: 0, db: join(dir, 'parties.sqlite') }, log: quiet });
    const c = await connect(srv.port);
    assert.equal((await c.send({ t: 'hello', jeton: p.jeton })).t, 'ok');
    const v = await c.until((x) => x.code === p.code);
    assert.deepEqual(v.view, before);
    // Reconnexion depuis un « autre appareil » : même jeton, même place
    const d = await connect(srv.port);
    await d.send({ t: 'hello', jeton: p.jeton });
    const vd = await d.until((x) => x.code === p.code);
    assert.equal(vd.siege, 0);
    c.close(); d.close();
  });
});
