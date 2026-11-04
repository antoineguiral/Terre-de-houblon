// IA des brasseries gérées par l'ordinateur : lit l'état et renvoie une action, sans rien modifier.
//
//   aiAction(state, playerId) → action à jouer, ou null s'il n'y a rien à décider pour ce joueur
//                                (ou s'il attend la réponse d'un autre, ex. à son offre d'échange).
//
// Le hasard de l'IA vient d'un générateur dérivé de l'état : la même position donne toujours la même décision.
// L'IA lit l'état complet (mains comprises), comme dans la version d'origine.

import { RES, COST, PIPS, Z, total } from './constantes.js';
import { local, next, shuffle } from './alea.js';
import { TOPO, otherEnd } from './plateau.js';
import {
  validSettle, validRoad, validCity, canAfford, rate, vp, playableDev, portOf, robberVictims,
} from './regles.js';

const settleOK = (s, v) => s.verts[v].o === null && TOPO.verts[v].adj.every((a) => s.verts[a].o === null);
const missing = (res, c) => Object.entries(c).reduce((m, [r, n]) => m + Math.max(0, n - res[r]), 0);
const sumOthers = (s, pi, r) => s.players.reduce((n, q, i) => n + (i === pi ? 0 : q.res[r]), 0);
const isHuman = (s, i) => !s.players[i].ai;

function production(s, pi) {
  const out = new Set();
  s.verts.forEach((v, i) => { if (v.o === pi) TOPO.verts[i].hexes.forEach((h) => out.add(s.hexes[h].res)); });
  return out;
}

export function vScore(s, pi, v, bonusNew) {
  const seen = new Set(), prod = bonusNew ? production(s, pi) : null;
  let n = 0;
  for (const h of TOPO.verts[v].hexes) {
    const t = s.hexes[h];
    if (t.res === 'friche') continue;
    n += PIPS(t.num) * (t.res === 'malt' || t.res === 'houb' ? 1.1 : 1);
    if (!seen.has(t.res)) { seen.add(t.res); n += 0.8; if (prod && !prod.has(t.res)) n += 1.5; }
  }
  const port = portOf(s, v);
  if (port) n += port === '3:1' ? 1 : 0.6;
  return n;
}

function bestSettle(s, pi, setup, rnd) {
  let best = null, bs = -1;
  validSettle(s, pi, setup).forEach((v) => { const n = vScore(s, pi, v, true) + rnd() * 0.4; if (n > bs) { bs = n; best = v; } });
  return best;
}

function setupRoad(s, pi, v, rnd) {
  let best = null, bs = -1;
  TOPO.verts[v].edges.forEach((e) => {
    if (s.edges[e] !== null) return;
    const o = otherEnd(e, v);
    const n = Math.max(0, ...TOPO.verts[o].adj.filter((a) => a !== v && settleOK(s, a)).map((a) => vScore(s, pi, a, true))) + rnd() * 0.3;
    if (n > bs) { bs = n; best = e; }
  });
  return best;
}

// Première tournée à tracer vers le meilleur emplacement libre à 3 tournées au plus.
export function roadTarget(s, pi) {
  const start = new Set();
  s.edges.forEach((o, i) => {
    if (o !== pi) return;
    [TOPO.edges[i].a, TOPO.edges[i].b].forEach((v) => { const ow = s.verts[v].o; if (ow === null || ow === pi) start.add(v); });
  });
  s.verts.forEach((v, i) => { if (v.o === pi) start.add(i); });
  const dist = new Map(), first = new Map(), q = [...start];
  start.forEach((v) => dist.set(v, 0));
  while (q.length) {
    const v = q.shift(), d = dist.get(v);
    if (d >= 3) continue;
    for (const e of TOPO.verts[v].edges) {
      if (s.edges[e] !== null) continue;
      const o = otherEnd(e, v);
      if (dist.has(o)) continue;
      const ow = s.verts[o].o;
      if (ow !== null && ow !== pi) continue;
      dist.set(o, d + 1);
      first.set(o, d === 0 ? e : first.get(v));
      q.push(o);
    }
  }
  let best = null, bs = -1e9;
  dist.forEach((d, v) => { if (d < 1 || !settleOK(s, v)) return; const n = vScore(s, pi, v, true) - d * 2; if (n > bs) { bs = n; best = v; } });
  return best === null ? null : first.get(best);
}

function robberHex(s, pi, rnd) {
  let best = null, bs = -1;
  s.hexes.forEach((h, i) => {
    if (i === s.robber) return;
    let n = 0, mine = false;
    TOPO.hexes[i].verts.forEach((v) => {
      const o = s.verts[v].o;
      if (o === null) return;
      if (o === pi) mine = true;
      else n += s.verts[v].t * PIPS(h.num) * (1 + vp(s, o, false) / 4 + (isHuman(s, o) ? 0.15 : 0));
    });
    if (mine) n -= 100;
    n += rnd() * 0.5;
    if (n > bs) { bs = n; best = i; }
  });
  return best;
}

export function aiGoal(s, pi) {
  const p = s.players[pi], o = [];
  if (p.cities > 0 && validCity(s, pi).length) o.push(['city', missing(p.res, COST.city) - 0.5]);
  if (p.settles > 0 && validSettle(s, pi, false).length) o.push(['settle', missing(p.res, COST.settle) - 0.7]);
  else if (p.settles > 0 && p.roads > 0 && roadTarget(s, pi) !== null) o.push(['road', missing(p.res, COST.road) + 0.5]);
  if (s.deck.length) o.push(['dev', missing(p.res, COST.dev) + 1]);
  o.sort((a, b) => a[1] - b[1]);
  return o.length ? o[0][0] : null;
}

function goalsFor(s, pi) {
  const p = s.players[pi], g = [];
  if (p.cities > 0 && validCity(s, pi).length) g.push('city');
  if (p.settles > 0 && validSettle(s, pi, false).length) g.push('settle');
  else if (p.settles > 0 && p.roads > 0 && roadTarget(s, pi) !== null) g.push('road');
  if (s.deck.length) g.push('dev');
  return g;
}
function util(res, goal, goals) {
  let u = 0.35 * total(res);
  if (goal) u -= 2 * missing(res, COST[goal]);
  goals.forEach((g) => { if (g !== goal) u -= 0.5 * missing(res, COST[g]); });
  return u;
}

// pi reçoit `inc` et donne `out` au joueur `from`. Réticente face à 7 PV, refus net à 8 PV et plus.
export function aiAccepts(s, pi, from, inc, out) {
  const p = s.players[pi];
  if (RES.some((r) => p.res[r] < out[r])) return false;
  const lead = vp(s, from, false);
  if (lead >= 8) return false;
  const goal = aiGoal(s, pi), goals = goalsFor(s, pi), after = { ...p.res };
  RES.forEach((r) => { after[r] += inc[r] - out[r]; });
  return util(after, goal, goals) - util(p.res, goal, goals) > (lead >= 7 ? 1.2 : 0.25);
}

function want(s, pi, n, rnd) {
  const p = s.players[pi], sel = Z(), g = aiGoal(s, pi), c = g ? COST[g] : {};
  for (let k = 0; k < n; k++) {
    const r = RES.find((x) => (c[x] || 0) > p.res[x] + sel[x]) || RES[Math.floor(rnd() * 5)];
    sel[r]++;
  }
  return sel;
}

const robberHurts = (s, pi) => TOPO.hexes[s.robber].verts.some((v) => s.verts[v].o === pi);

function respond(s, pi) {
  const t = s.trade;
  if (RES.some((r) => s.players[pi].res[r] < t.get[r])) return { type: 'respondTrade', accept: false };
  if (aiAccepts(s, pi, t.from, t.give, t.get)) return { type: 'respondTrade', accept: true };
  if (isHuman(s, t.from)) {
    const from = s.players[t.from];
    for (const r of RES) {
      if (from.res[r] > t.give[r]) {
        const g = { ...t.give };
        g[r]++;
        if (aiAccepts(s, pi, t.from, g, t.get)) return { type: 'respondTrade', counter: { give: g, get: { ...t.get } } };
      }
    }
  }
  return { type: 'respondTrade', accept: false };
}

// Suite de l'offre ouverte par l'IA : conclure avec le premier qui accepte, sinon annuler quand tout le monde a répondu.
function followOwnTrade(s, pi) {
  const t = s.trade;
  for (const w of t.to) {
    const r = t.resp[w];
    if (!r) continue;
    if (r.s === 'accept' && canAfford(s.players[w].res, t.get)) return { type: 'concludeTrade', with: w };
    if (r.s === 'counter' && canAfford(s.players[pi].res, r.give) && aiAccepts(s, pi, w, r.get, r.give)) return { type: 'concludeTrade', with: w };
  }
  if (t.to.every((w) => t.resp[w])) return { type: 'cancelTrade' };
  return null;
}

function seekTrade(s, pi, cost, rnd) {
  const p = s.players[pi];
  const need = RES.filter((r) => p.res[r] < (cost[r] || 0));
  if (!need.length) return null;
  const spare = RES.filter((r) => p.res[r] > (cost[r] || 0)).sort((a, b) => p.res[b] - p.res[a]);
  if (!spare.length) return null;
  const give = Z(), get = Z();
  give[spare[0]] = 1; get[need[0]] = 1;
  const to = s.players.map((_, i) => i).filter((i) => {
    if (i === pi || !s.players[i].offersOn || s.players[i].res[need[0]] <= 0) return false;
    if (isHuman(s, i)) return s.opts.aiOffersToHumans && vp(s, i, false) < 8;
    return true;
  });
  if (!to.length) return null;
  return { type: 'proposeTrade', give, get, to: shuffle({ rng: Math.floor(rnd() * 2 ** 32) }, to) };
}

function bankTrade(s, pi, cost) {
  const p = s.players[pi];
  const need = RES.filter((r) => p.res[r] < (cost[r] || 0));
  if (!need.length) return null;
  for (const g of RES) {
    const n = rate(s, pi, g);
    if (p.res[g] - (cost[g] || 0) >= n) return { type: 'bankTrade', give: g, get: need[0] };
  }
  return null;
}

const MAX_TURN_ACTIONS = 40;

function mainStep(s, pi, rnd) {
  const p = s.players[pi];
  const pl = s.devPlayed ? [] : playableDev(s, pi);
  if (pl.length) {
    const army = s.army === null ? null : s.players[s.army];
    const c = pl.find((c) => c.t === 'knight' && (robberHurts(s, pi) || (p.knights + 1 >= 3 && s.army !== pi && (army === null || army.knights < p.knights + 1))))
      || pl.find((c) => c.t === 'plenty')
      || pl.find((c) => c.t === 'mono' && RES.some((r) => sumOthers(s, pi, r) >= 3))
      || pl.find((c) => c.t === 'roads' && p.roads > 0 && roadTarget(s, pi) !== null);
    if (c) {
      if (c.t === 'plenty') return { type: 'playDev', card: 'plenty', res: want(s, pi, 2, rnd) };
      if (c.t === 'mono') return { type: 'playDev', card: 'mono', r: RES.reduce((a, b) => (sumOthers(s, pi, b) > sumOthers(s, pi, a) ? b : a)) };
      return { type: 'playDev', card: c.t };
    }
  }
  const cities = validCity(s, pi);
  if (p.cities > 0 && cities.length && canAfford(p.res, COST.city)) {
    return { type: 'build', what: 'city', at: cities.reduce((a, b) => (vScore(s, pi, b) > vScore(s, pi, a) ? b : a)) };
  }
  if (p.settles > 0 && validSettle(s, pi, false).length && canAfford(p.res, COST.settle)) {
    return { type: 'build', what: 'settle', at: bestSettle(s, pi, false, rnd) };
  }
  const goal = aiGoal(s, pi);
  if (goal === 'road' && p.roads > 0 && canAfford(p.res, COST.road)) {
    const e = roadTarget(s, pi);
    if (e !== null) return { type: 'build', what: 'road', at: e };
  }
  if (s.deck.length && canAfford(p.res, COST.dev) && (goal === 'dev' || total(p.res) > 7)) return { type: 'buyDev' };
  if (goal && !s.tradesThisTurn) { const a = seekTrade(s, pi, COST[goal], rnd); if (a) return a; }
  if (goal) { const a = bankTrade(s, pi, COST[goal]); if (a) return a; }
  return { type: 'endTurn' };
}

export function aiAction(s, pi) {
  if (s.phase === 'over') return null;
  const rnd = (() => { const g = local(`${s.rng}:${s.seq}:${pi}`); return () => next(g); })();
  const pend = s.pending, p = s.players[pi];

  if (pend?.type === 'discard' && pend.need[pi] !== undefined) {
    const res = { ...p.res }, sel = Z();
    for (let k = 0; k < pend.need[pi]; k++) { const r = RES.reduce((a, b) => (res[b] > res[a] ? b : a)); res[r]--; sel[r]++; }
    return { type: 'discard', res: sel };
  }
  if (pend && pend.p === pi) {
    if (pend.type === 'robber') return { type: 'moveRobber', hex: robberHex(s, pi, rnd) };
    if (pend.type === 'steal') {
      const score = (i) => vp(s, i, false) + (isHuman(s, i) ? 0.5 : 0);
      return { type: 'steal', victim: pend.victims.reduce((a, b) => (score(b) > score(a) ? b : a)) };
    }
    if (pend.type === 'roads') {
      const valid = validRoad(s, pi), e = roadTarget(s, pi);
      return { type: 'build', what: 'road', at: e !== null && valid.includes(e) ? e : valid[0] };
    }
  }
  if (s.trade && s.trade.to.includes(pi) && !s.trade.resp[pi]) return respond(s, pi);
  if (pend || s.cur !== pi) return null;

  if (s.phase === 'setup') {
    if (s.setup.step === 'settle') return { type: 'build', what: 'settle', at: bestSettle(s, pi, true, rnd) };
    return { type: 'build', what: 'road', at: setupRoad(s, pi, s.setup.last, rnd) };
  }

  if (s.trade?.from === pi) return followOwnTrade(s, pi);
  if (!s.rolled) {
    const kn = s.devPlayed ? null : playableDev(s, pi).find((c) => c.t === 'knight');
    if (kn && robberHurts(s, pi)) return { type: 'playDev', card: 'knight' };
    return { type: 'roll' };
  }
  if (s.turnActions >= MAX_TURN_ACTIONS) return { type: 'endTurn' };
  return mainStep(s, pi, rnd);
}
