import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, applyAction, legalActions, waitingFor, viewFor, aiAction, aiStep,
  vp, TOPO, RES, Z, total, PIPS,
} from '../moteur/index.js';

const NAMES = ['Brasserie du Moulin', 'La Mousse Noire', 'Les Fûts Joyeux', 'La Cuve Dorée'];
const allAi = (seed) => createGame({ seed, players: NAMES.map((name) => ({ name, ai: true })) });
const withHuman = (seed) => createGame({ seed, players: NAMES.map((name, i) => ({ name, ai: i !== 0 })) });

// Fait jouer l'IA à toutes les places jusqu'à la condition donnée
function advance(s, until, isAi = () => true) {
  for (let n = 0; n < 50000 && !until(s); n++) {
    const r = aiStep(s, isAi);
    if (!r) return s;
    s = r.state;
  }
  return s;
}
const afterSetup = (seed) => advance(allAi(seed), (s) => s.phase === 'main');
const ok = (r) => { assert.equal(r.ok, true, r.error); return r.state; };

// Trouve une valeur du générateur qui donne la somme de dés voulue au prochain lancer
function forceDice(s, sum) {
  for (let x = 0; x < 100000; x++) {
    const r = applyAction({ ...s, rng: x }, s.cur, { type: 'roll' });
    if (r.ok && r.state.lastRoll === sum) return { ...s, rng: x };
  }
  throw new Error('somme introuvable');
}

function invariants(s) {
  s.players.forEach((p, i) => {
    RES.forEach((r) => assert.ok(p.res[r] >= 0, `ressource négative (${p.name}, ${r})`));
    const settles = s.verts.filter((v) => v.o === i && v.t === 1).length;
    const cities = s.verts.filter((v) => v.o === i && v.t === 2).length;
    const roads = s.edges.filter((o) => o === i).length;
    assert.equal(p.settles + settles, 5, 'microbrasseries incohérentes');
    assert.equal(p.cities + cities, 4, 'grandes brasseries incohérentes');
    assert.equal(p.roads + roads, 15, 'tournées incohérentes');
  });
  // Deux bâtiments ne sont jamais voisins
  s.verts.forEach((v, i) => { if (v.o !== null) TOPO.verts[i].adj.forEach((a) => assert.equal(s.verts[a].o, null, 'bâtiments voisins')); });
  const dev = s.players.reduce((n, p) => n + p.dev.length + p.knights, 0);
  assert.ok(dev + s.deck.length <= 25);
}

describe('parties complètes IA contre IA', () => {
  const seeds = Array.from({ length: 30 }, (_, i) => `essai-${i}`);
  for (const seed of seeds) {
    test(`graine ${seed} : jusqu'à la victoire, sans action illégale ni blocage`, () => {
      let s = allAi(seed), n = 0;
      while (s.phase !== 'over') {
        assert.ok(n++ < 30000, 'partie trop longue');
        const w = waitingFor(s);
        assert.ok(w.length, 'personne n’est attendu');
        const pi = w.find((i) => aiAction(s, i));
        assert.notEqual(pi, undefined, `blocage : attendus ${w}, aucune décision`);
        const a = aiAction(s, pi);
        const r = applyAction(s, pi, a);
        assert.equal(r.ok, true, `${s.players[pi].name} : ${a.type} refusé (${r.error})`);
        s = r.state;
        if (n % 25 === 0) invariants(s);
      }
      invariants(s);
      assert.ok(vp(s, s.winner, true) >= 10);
      assert.equal(s.log.at(-1).k, 'win');
      assert.equal(s.log.at(-1).p, s.cur, 'la victoire arrive pendant le tour du gagnant');
    });
  }
});

describe('plateau', () => {
  test('19 cases, bonne répartition, 6 et 8 jamais voisins, 9 quais', () => {
    for (let g = 0; g < 50; g++) {
      const s = allAi(g);
      const count = {};
      s.hexes.forEach((h) => { count[h.res] = (count[h.res] || 0) + 1; });
      assert.deepEqual(count, { fut: 4, eau: 3, lev: 4, malt: 4, houb: 3, friche: 1 });
      s.hexes.forEach((h, i) => {
        assert.equal(h.res === 'friche', h.num === 0);
        if (h.num === 6 || h.num === 8) TOPO.hexes[i].near.forEach((j) => assert.ok(![6, 8].includes(s.hexes[j].num)));
      });
      assert.deepEqual([...s.ports].sort(), ['3:1', '3:1', '3:1', '3:1', 'eau', 'fut', 'houb', 'lev', 'malt']);
      assert.equal(s.hexes[s.robber].res, 'friche');
    }
    assert.equal(TOPO.hexes.length, 19);
    assert.equal(TOPO.verts.length, 54);
    assert.equal(TOPO.edges.length, 72);
    assert.equal(PIPS(7), 6);
  });
});

describe('déterminisme et sérialisation', () => {
  test('même graine et mêmes actions → même partie', () => {
    const a = advance(allAi('pareil'), (s) => s.turn >= 20);
    const b = advance(allAi('pareil'), (s) => s.turn >= 20);
    assert.deepEqual(a, b);
  });
  test('un état passé par JSON continue exactement pareil', () => {
    const mid = advance(allAi('json'), (s) => s.turn >= 15);
    const copy = JSON.parse(JSON.stringify(mid));
    assert.deepEqual(copy, mid);
    const end1 = advance(mid, (s) => s.phase === 'over');
    const end2 = advance(copy, (s) => s.phase === 'over');
    assert.deepEqual(end1, end2);
    assert.equal(end1.phase, 'over');
  });
  test("applyAction ne modifie pas l'état reçu", () => {
    const s = afterSetup('pur');
    const before = JSON.stringify(s);
    ok(applyAction(s, s.cur, { type: 'roll' }));
    assert.equal(JSON.stringify(s), before);
  });
});

describe('mise en place', () => {
  test('ordre en serpent et ressources de la 2ᵉ microbrasserie', () => {
    let s = allAi('serpent');
    const order = [];
    while (s.phase === 'setup') {
      if (s.setup.step === 'settle') order.push(s.cur);
      s = aiStep(s).state;
    }
    assert.deepEqual(order, [0, 1, 2, 3, 3, 2, 1, 0]);
    const gains = s.log.filter((e) => e.k === 'setupGain');
    assert.equal(gains.length, 4);
    s.players.forEach((p, i) => assert.equal(total(p.res), total(gains.find((g) => g.p === i).res)));
    gains.forEach((g) => {
      const v = s.log.filter((e) => e.k === 'build' && e.what === 'settle' && e.p === g.p)[1].at;
      const expected = TOPO.verts[v].hexes.filter((h) => s.hexes[h].res !== 'friche').length;
      assert.equal(total(g.res), expected);
    });
    assert.equal(s.cur, 0);
    assert.equal(s.turn, 1);
  });
  test('la tournée de mise en place doit partir de la microbrasserie posée', () => {
    let s = allAi('tournee');
    const v = aiAction(s, 0).at;
    s = ok(applyAction(s, 0, { type: 'build', what: 'settle', at: v }));
    const far = TOPO.edges.findIndex((e) => e.a !== v && e.b !== v);
    assert.equal(applyAction(s, 0, { type: 'build', what: 'road', at: far }).ok, false);
    assert.equal(applyAction(s, 1, { type: 'build', what: 'road', at: TOPO.verts[v].edges[0] }).ok, false);
    ok(applyAction(s, 0, { type: 'build', what: 'road', at: TOPO.verts[v].edges[0] }));
  });
  test('microbrasserie trop proche refusée', () => {
    let s = allAi('proche');
    const v = aiAction(s, 0).at;
    s = ok(applyAction(s, 0, { type: 'build', what: 'settle', at: v }));
    s = ok(applyAction(s, 0, { type: 'build', what: 'road', at: TOPO.verts[v].edges[0] }));
    const r = applyAction(s, 1, { type: 'build', what: 'settle', at: TOPO.verts[v].adj[0] });
    assert.equal(r.ok, false);
    assert.match(r.error, /proche/);
  });
});

describe('refus avec raison', () => {
  test('hors tour, double lancer, construire sans ressources, fin de tour avant les dés', () => {
    const s = afterSetup('refus');
    assert.match(applyAction(s, 1, { type: 'roll' }).error, /pas ton tour/);
    assert.match(applyAction(s, 0, { type: 'endTurn' }).error, /Lance/);
    const r = ok(applyAction(s, 0, { type: 'roll' }));
    if (r.pending) return;
    assert.match(applyAction(r, 0, { type: 'roll' }).error, /déjà/);
    const poor = structuredClone(r);
    poor.players[0].res = Z();
    assert.match(applyAction(poor, 0, { type: 'buyDev' }).error, /manque/);
    assert.match(applyAction(poor, 0, { type: 'build', what: 'road', at: 0 }).error, /manque/);
    assert.equal(applyAction(s, 0, { type: 'nimporte' }).ok, false);
    assert.equal(applyAction(s, 7, { type: 'roll' }).ok, false);
  });
  test('une carte Événement tirée ce tour-ci ne se joue pas, et une seule carte par tour', () => {
    let s = afterSetup('carte');
    s = forceDice(s, 9);
    s = ok(applyAction(s, 0, { type: 'roll' }));
    s.players[0].res = { fut: 0, eau: 0, lev: 5, malt: 5, houb: 5 };
    s.deck.push('knight');
    s = ok(applyAction(s, 0, { type: 'buyDev' }));
    assert.match(applyAction(s, 0, { type: 'playDev', card: 'knight' }).error, /prochain tour/);
    s.players[0].dev.push({ t: 'plenty', turn: 0 }, { t: 'mono', turn: 0 });
    s = ok(applyAction(s, 0, { type: 'playDev', card: 'plenty', res: { eau: 2 } }));
    assert.equal(s.players[0].res.eau, 2);
    assert.match(applyAction(s, 0, { type: 'playDev', card: 'mono', r: 'eau' }).error, /Une seule/);
    assert.match(applyAction(s, 0, { type: 'playDev', card: 'vp' }).error, /médaille/i);
  });
});

describe('contrôle des douanes', () => {
  test('défausse simultanée de plusieurs joueurs, arrondie à l’inférieur, puis contrôleur et pioche', () => {
    let s = afterSetup('sept');
    s.players[0].res = { fut: 3, eau: 3, lev: 3, malt: 0, houb: 0 }; // 9 → défausse 4
    s.players[2].res = { fut: 2, eau: 2, lev: 2, malt: 2, houb: 3 }; // 11 → défausse 5
    s.players[1].res = { fut: 7, eau: 0, lev: 0, malt: 0, houb: 0 }; // 7 → rien
    s = forceDice(s, 7);
    s = ok(applyAction(s, 0, { type: 'roll' }));
    assert.deepEqual(s.pending.need, { 0: 4, 2: 5 });
    assert.deepEqual(waitingFor(s), [0, 2]);
    assert.match(applyAction(s, 0, { type: 'moveRobber', hex: 0 }).error, /contrôleur/);
    assert.match(applyAction(s, 0, { type: 'discard', res: { fut: 3 } }).error, /exactement 4/);
    assert.match(applyAction(s, 1, { type: 'discard', res: { fut: 3 } }).error, /rien à défausser/);
    s = ok(applyAction(s, 2, { type: 'discard', res: { houb: 3, malt: 2 } }));
    assert.deepEqual(waitingFor(s), [0]);
    s = ok(applyAction(s, 0, { type: 'discard', res: { fut: 2, eau: 2 } }));
    assert.equal(s.pending.type, 'robber');
    assert.equal(total(s.players[0].res), 5);
    assert.equal(total(s.players[2].res), 6);
    assert.match(applyAction(s, 0, { type: 'moveRobber', hex: s.robber }).error, /changer/);
    // Case voisine d'un adversaire qui a des cartes
    const hex = s.hexes.findIndex((_, i) => i !== s.robber && TOPO.hexes[i].verts.some((v) => s.verts[v].o !== null && s.verts[v].o !== 0 && total(s.players[s.verts[v].o].res) > 0));
    const before = total(s.players[0].res);
    s = ok(applyAction(s, 0, { type: 'moveRobber', hex }));
    if (s.pending?.type === 'steal') s = ok(applyAction(s, 0, { type: 'steal', victim: s.pending.victims[0] }));
    assert.equal(total(s.players[0].res), before + 1);
    assert.equal(s.pending, null);
  });
  test('la case du contrôleur ne produit plus', () => {
    let s = afterSetup('bloque');
    const hex = s.hexes.findIndex((h, i) => h.num && TOPO.hexes[i].verts.some((v) => s.verts[v].o !== null));
    s.robber = hex;
    s.players.forEach((p) => { p.res = Z(); });
    s = forceDice(s, s.hexes[hex].num);
    s = ok(applyAction(s, 0, { type: 'roll' }));
    const gotFromHex = s.log.at(-1).gains.some((g) => g.res[s.hexes[hex].res] > 0 && s.hexes.filter((h, i) => i !== hex && h.num === s.hexes[hex].num && h.res === s.hexes[hex].res).length === 0);
    assert.equal(gotFromHex, false);
  });
});

describe('bonus et victoire', () => {
  test('dossier comptable : 3 experts minimum, il faut dépasser le détenteur', () => {
    let s = afterSetup('armee');
    s.players[0].dev = Array(4).fill(null).map(() => ({ t: 'knight', turn: 0 }));
    s.players[1].knights = 0;
    const playKnight = (st, pi) => {
      st = ok(applyAction(st, pi, { type: 'playDev', card: 'knight' }));
      const hex = st.hexes.findIndex((_, i) => i !== st.robber);
      st = ok(applyAction(st, pi, { type: 'moveRobber', hex }));
      if (st.pending?.type === 'steal') st = ok(applyAction(st, pi, { type: 'steal', victim: st.pending.victims[0] }));
      return st;
    };
    s.players[0].knights = 2;
    s = playKnight(s, 0);
    assert.equal(s.army, 0);
    s.players[1].knights = 3;
    s.devPlayed = false;
    s.cur = 1;
    s.players[1].dev = [{ t: 'knight', turn: 0 }];
    s.players[1].knights = 2; // passera à 3 : égalité, le détenteur garde
    s = playKnight(s, 1);
    assert.equal(s.army, 0);
  });
  test('plus grand réseau : 5 tournées minimum, coupé par un bâtiment adverse, le détenteur garde en cas d’égalité', () => {
    let s = afterSetup('reseau');
    s.edges = s.edges.map(() => null);
    s.verts = s.verts.map(() => ({ o: null, t: 0 }));
    s.longest = null;
    // Chemin simple de 6 tournées le long du bord d'une case puis de la voisine
    const path = (startV, len, avoid = new Set()) => {
      const edges = [], seenV = new Set([startV]);
      let v = startV;
      while (edges.length < len) {
        const e = TOPO.verts[v].edges.find((x) => !edges.includes(x) && !avoid.has(TOPO.edges[x].a) && !avoid.has(TOPO.edges[x].b) && !seenV.has(TOPO.edges[x].a === v ? TOPO.edges[x].b : TOPO.edges[x].a));
        if (e === undefined) throw new Error('chemin impossible');
        edges.push(e);
        v = TOPO.edges[e].a === v ? TOPO.edges[e].b : TOPO.edges[e].a;
        seenV.add(v);
      }
      return { edges, verts: [...seenV] };
    };
    const a = path(0, 5);
    a.edges.forEach((e) => { s.edges[e] = 0; });
    const avoid = new Set(a.verts.flatMap((v) => [v, ...TOPO.verts[v].adj]));
    const startB = TOPO.verts.findIndex((_, i) => !avoid.has(i));
    const b = path(startB, 5, avoid);
    b.edges.slice(0, 4).forEach((e) => { s.edges[e] = 1; });
    s.verts[a.verts[0]] = { o: 0, t: 1 };
    s.verts[b.verts[0]] = { o: 1, t: 1 };
    // Le joueur 0 pose une microbrasserie à côté : le réseau est recalculé, il prend le bonus
    s.cur = 0; s.rolled = true; s.pending = null; s.trade = null;
    s.players[0].res = { fut: 1, eau: 1, lev: 0, malt: 0, houb: 0 };
    const extra = TOPO.verts[a.verts.at(-1)].edges.find((e) => s.edges[e] === null && !a.verts.includes(TOPO.edges[e].a === a.verts.at(-1) ? TOPO.edges[e].b : TOPO.edges[e].a));
    s = ok(applyAction(s, 0, { type: 'build', what: 'road', at: extra }));
    assert.equal(s.longest, 0);
    // Le joueur 1 arrive à égalité (5) : le détenteur garde
    s.cur = 1; s.players[1].res = { fut: 2, eau: 2, lev: 0, malt: 0, houb: 0 };
    s = ok(applyAction(s, 1, { type: 'build', what: 'road', at: b.edges[4] }));
    assert.equal(s.longest, 0);
    // Une microbrasserie adverse au milieu du réseau du joueur 0 le coupe
    const mid = a.verts[2];
    s.verts[mid] = { o: 2, t: 1 };
    s.cur = 1;
    const more = TOPO.verts[b.verts.at(-1)].edges.find((e) => s.edges[e] === null && !b.verts.includes(TOPO.edges[e].a === b.verts.at(-1) ? TOPO.edges[e].b : TOPO.edges[e].a));
    s = ok(applyAction(s, 1, { type: 'build', what: 'road', at: more }));
    assert.equal(s.longest, 1);
  });
  test('victoire à 10 PV médailles cachées comprises, seulement pendant son propre tour', () => {
    let s = afterSetup('victoire');
    const mine = s.verts.map((v, i) => (v.o === 0 ? i : -1)).filter((i) => i >= 0);
    s.verts[mine[0]].t = 2; // 2 + 1 = 3 PV
    s.army = 0; // 5 PV
    s.players[0].dev = Array(5).fill(null).map(() => ({ t: 'vp', turn: 0 })); // 10 PV cachés
    assert.equal(vp(s, 0, false), 5);
    assert.equal(vp(s, 0, true), 10);
    s.cur = 3; s.rolled = true;
    s = ok(applyAction(s, 3, { type: 'setOffers', on: true }));
    assert.equal(s.phase, 'main', 'pas de victoire pendant le tour d’un autre');
    s = ok(applyAction(s, 3, { type: 'endTurn' }));
    assert.equal(s.phase, 'over');
    assert.equal(s.winner, 0);
    assert.match(applyAction(s, 0, { type: 'roll' }).error, /terminée/);
  });
});

describe('négoce', () => {
  test('grossiste à 4:1, et au taux des quais possédés', () => {
    let s = afterSetup('grossiste');
    s.verts = s.verts.map((v) => (v.o === 0 ? { o: null, t: 0 } : v));
    s = forceDice(s, 9);
    s = ok(applyAction(s, 0, { type: 'roll' }));
    s.players[0].res = { fut: 4, eau: 0, lev: 0, malt: 0, houb: 0 };
    assert.match(applyAction(s, 0, { type: 'bankTrade', give: 'fut', get: 'fut' }).error, /différentes/);
    let t = ok(applyAction(s, 0, { type: 'bankTrade', give: 'fut', get: 'malt' }));
    assert.deepEqual(t.players[0].res, { fut: 0, eau: 0, lev: 0, malt: 1, houb: 0 });
    const port2 = TOPO.ports.findIndex((_, i) => s.ports[i] === 'fut');
    s.verts[TOPO.ports[port2].a] = { o: 0, t: 1 };
    t = ok(applyAction(s, 0, { type: 'bankTrade', give: 'fut', get: 'malt' }));
    assert.equal(t.players[0].res.fut, 2);
  });
  test('offre à tous, acceptation, contre-proposition, conclusion avec un seul', () => {
    let s = createGame({ seed: 'echange', players: NAMES.map((name) => ({ name, ai: false })) });
    s = advance(s, (x) => x.phase === 'main');
    s = forceDice(s, 9);
    s = ok(applyAction(s, 0, { type: 'roll' }));
    s.players[0].res = { fut: 2, eau: 0, lev: 0, malt: 0, houb: 0 };
    s.players[1].res = { fut: 0, eau: 0, lev: 0, malt: 1, houb: 0 };
    s.players[2].res = { fut: 0, eau: 0, lev: 0, malt: 1, houb: 0 };
    s.players[3].res = Z();
    assert.match(applyAction(s, 0, { type: 'proposeTrade', give: { fut: 3 }, get: { malt: 1 } }).error, /pas ces cartes/);
    s = ok(applyAction(s, 0, { type: 'proposeTrade', give: { fut: 1 }, get: { malt: 1 } }));
    assert.deepEqual(s.trade.to, [1, 2, 3]);
    assert.deepEqual(waitingFor(s), [0, 1, 2, 3]);
    assert.match(applyAction(s, 3, { type: 'respondTrade', accept: true }).error, /pas les cartes/);
    s = ok(applyAction(s, 3, { type: 'respondTrade', accept: false }));
    s = ok(applyAction(s, 1, { type: 'respondTrade', accept: true }));
    s = ok(applyAction(s, 2, { type: 'respondTrade', counter: { give: { fut: 2 }, get: { malt: 1 } } }));
    assert.match(applyAction(s, 0, { type: 'concludeTrade', with: 3 }).error, /pas accepté/);
    assert.deepEqual(legalActions(s, 0).find((a) => a.type === 'concludeTrade').targets, [1, 2]);
    s = ok(applyAction(s, 0, { type: 'concludeTrade', with: 2 }));
    assert.deepEqual(s.players[0].res, { fut: 0, eau: 0, lev: 0, malt: 1, houb: 0 });
    assert.deepEqual(s.players[2].res, { fut: 2, eau: 0, lev: 0, malt: 0, houb: 0 });
    assert.equal(s.trade, null);
  });
  test('la fin du tour ferme l’offre ouverte', () => {
    let s = afterSetup('fermeture');
    s = forceDice(s, 9);
    s = ok(applyAction(s, 0, { type: 'roll' }));
    s.players[0].res.fut = 1;
    s = ok(applyAction(s, 0, { type: 'proposeTrade', give: { fut: 1 }, get: { houb: 1 } }));
    s = ok(applyAction(s, 0, { type: 'endTurn' }));
    assert.equal(s.trade, null);
    assert.equal(s.log.at(-2).k, 'tradeClosed');
  });
  test('IA : refuse tout échange avec un joueur à 8 PV ou plus', () => {
    let s = createGame({ seed: 'meneur', players: NAMES.map((name, i) => ({ name, ai: i !== 0 })) });
    s = advance(s, (x) => x.phase === 'main');
    s = forceDice(s, 9);
    s = ok(applyAction(s, 0, { type: 'roll' }));
    s.players[0].res = { fut: 0, eau: 0, lev: 0, malt: 0, houb: 5 };
    s.players.slice(1).forEach((p) => { p.res = { fut: 3, eau: 3, lev: 0, malt: 0, houb: 0 }; });
    // Très généreux : 5 houblons contre 1 fût
    let t = ok(applyAction(s, 0, { type: 'proposeTrade', give: { houb: 5 }, get: { fut: 1 } }));
    const generous = [1, 2, 3].filter((i) => aiAction(t, i).accept).length;
    assert.ok(generous > 0, 'une offre généreuse trouve preneur');
    s.army = 0; s.longest = 0; // 2 + 4 = 6 PV
    s.verts.forEach((v) => { if (v.o === 0) v.t = 2; }); // 4 + 4 = 8 PV
    assert.equal(vp(s, 0, false), 8);
    t = ok(applyAction(s, 0, { type: 'proposeTrade', give: { houb: 5 }, get: { fut: 1 } }));
    [1, 2, 3].forEach((i) => assert.equal(aiAction(t, i).accept, false));
  });
});

describe('vue filtrée', () => {
  test('cache la main et les cartes des autres, la pioche et la graine', () => {
    let s = withHuman('vue');
    s = advance(s, (x) => x.turn >= 12, () => true);
    const v = viewFor(s, 0);
    assert.equal(v.seed, undefined);
    assert.equal(v.rng, undefined);
    assert.equal(typeof v.deck, 'number');
    assert.deepEqual(v.players[0].res, s.players[0].res);
    for (let i = 1; i < 4; i++) {
      assert.equal(v.players[i].res, null);
      assert.equal(v.players[i].dev, null);
      assert.equal(v.players[i].nres, total(s.players[i].res));
      assert.equal(v.players[i].ndev, s.players[i].dev.length);
      assert.equal(v.players[i].vp, vp(s, i, false));
    }
    const json = JSON.stringify(v);
    assert.ok(!json.includes('"rng"'));
    v.log.forEach((e) => {
      if (e.k === 'steal' && e.p !== 0 && e.v !== 0) assert.equal(e.r, undefined);
      if (e.k === 'buyDev' && e.p !== 0) assert.equal(e.t, undefined);
      if (e.k === 'discard' && e.p !== 0) assert.equal(e.res, undefined);
    });
    const spectator = viewFor(s, null);
    spectator.players.forEach((p) => assert.equal(p.res, null));
  });
  test('tout est révélé à la fin', () => {
    const s = advance(allAi('fin'), (x) => x.phase === 'over');
    viewFor(s, 0).players.forEach((p) => assert.ok(p.res && p.dev));
  });
});

describe('actions légales', () => {
  test('chaque action IA appartient aux gabarits légaux', () => {
    let s = allAi('legal');
    for (let n = 0; n < 3000 && s.phase !== 'over'; n++) {
      const pi = waitingFor(s).find((i) => aiAction(s, i));
      const a = aiAction(s, pi);
      const legal = legalActions(s, pi);
      const match = legal.find((l) => l.type === a.type && (l.what === undefined || l.what === a.what) && (l.card === undefined || l.card === a.card || a.type !== 'playDev'));
      assert.ok(match, `${a.type} absent des actions légales`);
      if (match.targets && a.at !== undefined) assert.ok(match.targets.includes(a.at));
      if (match.targets && a.hex !== undefined) assert.ok(match.targets.includes(a.hex));
      s = ok(applyAction(s, pi, a));
    }
  });
});
