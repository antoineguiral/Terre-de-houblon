// Constantes du jeu, partagées par le moteur, l'IA, le navigateur et le serveur.

export const RES = ['fut', 'eau', 'lev', 'malt', 'houb'];

export const COST = {
  road: { fut: 1, eau: 1 },
  settle: { fut: 1, eau: 1, lev: 1, malt: 1 },
  city: { malt: 2, houb: 3 },
  dev: { lev: 1, malt: 1, houb: 1 },
};

// Composition de la pioche Événement
export const DECK = [
  ...Array(14).fill('knight'),
  ...Array(5).fill('vp'),
  'roads', 'roads', 'plenty', 'plenty', 'mono', 'mono',
];

export const TILES = [
  'fut', 'fut', 'fut', 'fut', 'eau', 'eau', 'eau', 'lev', 'lev', 'lev', 'lev',
  'malt', 'malt', 'malt', 'malt', 'houb', 'houb', 'houb', 'friche',
];
export const NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
export const PORT_TYPES = ['3:1', '3:1', '3:1', '3:1', 'fut', 'eau', 'lev', 'malt', 'houb'];

export const PIECES = { roads: 15, settles: 5, cities: 4 };
export const VP_TO_WIN = 10;
export const LONGEST_MIN = 5;
export const ARMY_MIN = 3;
export const DISCARD_ABOVE = 7;

export const PIPS = (n) => (n ? 6 - Math.abs(7 - n) : 0);

export const Z = () => ({ fut: 0, eau: 0, lev: 0, malt: 0, houb: 0 });
export const total = (res) => RES.reduce((s, r) => s + res[r], 0);
