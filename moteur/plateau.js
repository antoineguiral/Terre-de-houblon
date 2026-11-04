// Topologie du plateau : cases, croisements, bords, emplacements de quais.
// Elle ne dépend d'aucun hasard : elle est calculée une fois et n'est jamais stockée dans l'état.
// L'état ne garde que ce qui varie (ressource et jeton des cases, types de quais, propriétaires).

import { TILES, NUMBERS, PORT_TYPES } from './constantes.js';
import { shuffle } from './alea.js';

export const S = 58;
const SQ = Math.sqrt(3);

function computeTopology() {
  const hexes = [], verts = [], edges = [], vmap = {}, emap = {};
  for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) {
    if (Math.abs(q + r) > 2) continue;
    const x = S * SQ * (q + r / 2), y = S * 1.5 * r, h = { q, r, x, y, verts: [] };
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 30), vx = x + S * Math.cos(a), vy = y + S * Math.sin(a);
      const k = Math.round(vx / 5) + ',' + Math.round(vy / 5);
      if (vmap[k] === undefined) { vmap[k] = verts.length; verts.push({ x: vx, y: vy, hexes: [], adj: [], edges: [], port: null }); }
      verts[vmap[k]].hexes.push(hexes.length);
      h.verts.push(vmap[k]);
    }
    hexes.push(h);
  }
  hexes.forEach((h, hi) => {
    for (let i = 0; i < 6; i++) {
      const a = h.verts[i], b = h.verts[(i + 1) % 6], k = a < b ? a + '-' + b : b + '-' + a;
      if (emap[k] === undefined) {
        emap[k] = edges.length;
        edges.push({ a, b, hexes: [] });
        verts[a].adj.push(b); verts[b].adj.push(a);
        verts[a].edges.push(emap[k]); verts[b].edges.push(emap[k]);
      }
      edges[emap[k]].hexes.push(hi);
    }
  });
  const near = (a, b) => { const dq = a.q - b.q, dr = a.r - b.r; return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 === 1; };
  hexes.forEach((h) => { h.near = hexes.map((o, j) => (near(h, o) ? j : -1)).filter((j) => j >= 0); });
  const mid = (e) => Math.atan2((verts[edges[e].a].y + verts[edges[e].b].y) / 2, (verts[edges[e].a].x + verts[edges[e].b].x) / 2);
  const coast = edges.map((e, i) => i).filter((i) => edges[i].hexes.length === 1).sort((i, j) => mid(i) - mid(j));
  const ports = [];
  for (let i = 0; i < 9; i++) {
    const ei = coast[Math.floor(i * coast.length / 9)], e = edges[ei], h = hexes[e.hexes[0]];
    const mx = (verts[e.a].x + verts[e.b].x) / 2, my = (verts[e.a].y + verts[e.b].y) / 2;
    verts[e.a].port = i; verts[e.b].port = i;
    ports.push({ a: e.a, b: e.b, x: h.x + (mx - h.x) * 1.62, y: h.y + (my - h.y) * 1.62 });
  }
  return { hexes, verts, edges, ports };
}

export const TOPO = computeTopology();

export const otherEnd = (e, v) => (TOPO.edges[e].a === v ? TOPO.edges[e].b : TOPO.edges[e].a);

// Tirage d'un plateau : ressources des cases, jetons (sans 6 ni 8 voisins), types de quais.
export function rollBoard(holder) {
  const tiles = shuffle(holder, [...TILES]);
  const hexes = tiles.map((res) => ({ res, num: 0 }));
  for (let tries = 0; tries < 500; tries++) {
    const nums = shuffle(holder, [...NUMBERS]);
    let k = 0;
    hexes.forEach((h) => { h.num = h.res === 'friche' ? 0 : nums[k++]; });
    const red = hexes.map((h, i) => (h.num === 6 || h.num === 8 ? i : -1)).filter((i) => i >= 0);
    if (!red.some((a) => red.some((b) => a !== b && TOPO.hexes[a].near.includes(b)))) break;
  }
  const ports = shuffle(holder, [...PORT_TYPES]);
  return { hexes, ports };
}
