// Topologie du plateau : 19 cases hexagonales (rayon 2), le Bourg au centre, 6 foires sur la côte.
// Elle ne dépend d'aucun hasard. L'état ne garde que ce qui varie : le terroir de chaque case,
// les cases des villages et les styles qu'ils préfèrent.

import { TUILES, NB_VILLAGES, STYLES, FOIRES } from './constantes.js';
import { shuffle, int } from './alea.js';

export const S = 58;
const SQ = Math.sqrt(3);
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

export const hexDist = (a, b) => { const dq = a.q - b.q, dr = a.r - b.r; return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2; };
const xy = (q, r) => ({ x: S * SQ * (q + r / 2), y: S * 1.5 * r });

function computeTopology() {
  const hexes = [];
  for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) {
    if (Math.abs(q + r) > 2) continue;
    const { x, y } = xy(q, r);
    hexes.push({ q, r, x, y, ring: hexDist({ q, r }, { q: 0, r: 0 }), verts: [] });
  }
  hexes.forEach((h) => {
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 30);
      h.verts.push([h.x + S * Math.cos(a), h.y + S * Math.sin(a)]);
    }
    h.near = hexes.map((o, j) => (hexDist(h, o) === 1 ? j : -1)).filter((j) => j >= 0);
  });
  const centre = hexes.findIndex((h) => h.q === 0 && h.r === 0);
  // Anneau extérieur dans l'ordre angulaire, pour espacer les villages
  const ring2 = hexes.map((h, i) => i).filter((i) => hexes[i].ring === 2).sort((i, j) => Math.atan2(hexes[i].y, hexes[i].x) - Math.atan2(hexes[j].y, hexes[j].x));
  // Foires : une par direction, juste au-delà de la côte
  const foires = FOIRES.map((f, k) => {
    const [dq, dr] = DIRS[k], q = 3 * dq, r = 3 * dr, p = xy(q, r);
    return { ...f, q, r, x: p.x * 0.93, y: p.y * 0.93 };
  });
  return { hexes, centre, ring2, foires };
}

export const TOPO = computeTopology();

// Distance en cases entre une case et un client : indice d'une case du plateau, ou 'foireN' sur la côte
export function distClient(hex, client) {
  const h = TOPO.hexes[hex];
  const c = typeof client === 'string' ? TOPO.foires[+client.slice(5)] : TOPO.hexes[client];
  return hexDist(h, c);
}

// Tirage d'un plateau : villages espacés sur l'anneau extérieur, terroirs mélangés sur le reste,
// deux styles préférés par village.
export function rollBoard(holder) {
  const off = int(holder, 4);
  const villages = Array.from({ length: NB_VILLAGES }, (_, k) => TOPO.ring2[(off + 4 * k) % TOPO.ring2.length]);
  const terroirs = shuffle(holder, [...TUILES]);
  const tiles = TOPO.hexes.map((_, i) => {
    if (i === TOPO.centre) return 'bourg';
    if (villages.includes(i)) return 'village';
    return terroirs.pop();
  });
  const prefs = villages.map(() => shuffle(holder, [...STYLES]).slice(0, 2).sort());
  return { tiles, villages, prefs };
}
