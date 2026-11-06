// Dessins du matériel de Brassins, en SVG, style « illustration moderne » : plateau imprimé, ouvriers en bois,
// jetons, fûts, cuves, dés, pictogrammes des cartes Client. Aucune image externe : tout est tracé ici, pour
// l'écran comme pour l'impression du prototype.

export const C = {
  creme: '#f4e9d4', creme2: '#eadcc0', encre: '#2b1d14', encre2: '#6b5442', cuivre: '#d38b46', cuivre2: '#b56d2e',
  orge: '#e8b84a', orge2: '#c9952b', ciel: '#bfe0e6', vert: '#6aa84f', vert2: '#4b8a3a', vert3: '#2f6b33',
  brique: '#c8553d', bleu: '#3d7fa6', violet: '#7a3e6a', sarcelle: '#2f8f87', pierre: '#a89580',
};
export const STYLE_COL = { blonde: '#f2c14e', ipa: '#e08a2e', stout: '#3a241a', garde: '#9a4b2a' };
export const SAISON_COL = ['#9fd07f', '#f2c14e', '#d98a3a', '#9cc4dd'];

const g = (tr, inner, attrs = '') => `<g transform="${tr}" ${attrs}>${inner}</g>`;

// Définitions communes à un SVG (ombres, motifs, ouvrier) ; `id` évite les collisions entre plusieurs SVG de la page
export const defs = (id) => `<defs>
  <filter id="${id}-o" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000" flood-opacity=".4"/></filter>
  <filter id="${id}-o2" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="2.5" stdDeviation="2" flood-color="#000" flood-opacity=".45"/></filter>
  <pattern id="${id}-pap" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${C.creme}"/><circle cx="2" cy="3" r=".6" fill="#e2d3b4"/><circle cx="6" cy="6" r=".5" fill="#e6d8bb"/></pattern>
  <symbol id="${id}-ouv" viewBox="-20 -34 40 44"><path d="M-15 9 C -15 -6, -9 -12, -6 -13 L 6 -13 C 9 -12, 15 -6, 15 9 Z"/><circle cx="0" cy="-21" r="9"/><path d="M-11 -27 H11 L8 -33 H-8 Z" opacity=".9"/></symbol>
</defs>`;

// Ouvrier en bois, centré sur (x, y)
export const ouvrier = (id, x, y, col, taille = 34, attrs = '') =>
  `<use href="#${id}-ouv" x="${x - taille / 2}" y="${y - taille * 0.7}" width="${taille}" height="${taille * 1.12}" fill="${col}" stroke="${C.encre}" stroke-width="1.5" filter="url(#${id}-o2)" ${attrs}/>`;

export const cone = (x, y, sc = 1, col = C.vert) => g(`translate(${x},${y}) scale(${sc})`,
  `<path d="M0 -20 C 10 -14, 12 -2, 0 22 C -12 -2, -10 -14, 0 -20 Z" fill="${col}"/><path d="M-8 -8 Q 0 -2 8 -8 M-9 2 Q 0 8 9 2 M-6 11 Q 0 16 6 11" stroke="${C.vert3}" stroke-width="1.6" fill="none"/><path d="M0 -20 Q 6 -30 14 -28" stroke="${C.vert3}" stroke-width="2" fill="none"/>`);

export const fut = (x, y, sc = 1, col = '#b8b8b0') => g(`translate(${x},${y}) scale(${sc})`,
  `<rect x="-14" y="-18" width="28" height="36" rx="6" fill="${col}" stroke="${C.encre}" stroke-width="1.6"/><path d="M-14 -8 H14 M-14 8 H14" stroke="${C.encre}" stroke-width="1.4"/><rect x="-4" y="-22" width="8" height="5" fill="${C.encre2}"/>`);

export const sac = (x, y, sc = 1, col = C.orge) => g(`translate(${x},${y}) scale(${sc})`,
  `<path d="M-22 30 C -28 6, -18 -14, -8 -18 L 8 -18 C 18 -14, 28 6, 22 30 Z" fill="#e2c493" stroke="${C.encre}" stroke-width="1.8"/><ellipse cx="0" cy="-16" rx="12" ry="5" fill="${col}"/><path d="M-10 -10 h20" stroke="${C.encre2}" stroke-width="2"/>`);

export const pieces = (x, y, n = 3) => g(`translate(${x},${y})`,
  Array.from({ length: n }, (_, k) => `<ellipse cx="0" cy="${-k * 8}" rx="20" ry="8" fill="${C.cuivre}" stroke="${C.encre}" stroke-width="1.5"/>`).join(''));

// Capsule (marqueur de prix)
export const capsule = (x, y, col, r = 13) => `<g>${`<circle cx="${x}" cy="${y}" r="${r}" fill="${col}" stroke="${C.encre}" stroke-width="2"/>`}${Array.from({ length: 12 }, (_, k) => `<circle cx="${x + r * Math.cos(k * Math.PI / 6)}" cy="${y + r * Math.sin(k * Math.PI / 6)}" r="${r * 0.17}" fill="${col}" stroke="${C.encre}" stroke-width="1"/>`).join('')}</g>`;

// Dé, centré
const POS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
export const de = (n, fond = '#f6eadb', point = C.encre, taille = 44, rot = 0) => {
  const h = taille / 2, d = taille * 0.25, r = taille * 0.095;
  return `<svg viewBox="${-h - 4} ${-h - 4} ${taille + 8} ${taille + 8}" width="${taille + 8}" height="${taille + 8}" class="desvg" aria-label="${n || '—'}"><g transform="rotate(${rot})"><rect x="${-h}" y="${-h}" width="${taille}" height="${taille}" rx="${taille * 0.2}" fill="${fond}" stroke="${C.encre}" stroke-width="1.5"/>${(POS[n] ?? []).map(([a, b]) => `<circle cx="${a * d}" cy="${b * d}" r="${r}" fill="${point}"/>`).join('')}</g></svg>`;
};

// Icônes de saison (blanches, sur une pastille de couleur)
export const iconeSaison = (k, x, y) => ({
  0: `<g transform="translate(${x},${y})">${[0, 72, 144, 216, 288].map((a) => `<ellipse rx="3.4" ry="6" transform="rotate(${a}) translate(0,-6)" fill="#fff" opacity=".95"/>`).join('')}<circle r="3" fill="${C.orge}"/></g>`,
  1: `<g transform="translate(${x},${y})"><circle r="6" fill="#fff"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<rect x="-1.2" y="-12" width="2.4" height="4" fill="#fff" transform="rotate(${a})"/>`).join('')}</g>`,
  2: `<g transform="translate(${x},${y}) rotate(-30)"><path d="M0 -10 C 8 -6, 8 6, 0 10 C -8 6, -8 -6, 0 -10 Z" fill="#fff"/><path d="M0 -9 V 12" stroke="${C.encre2}" stroke-width="1.2"/></g>`,
  3: `<g transform="translate(${x},${y})" stroke="#fff" stroke-width="2.2" stroke-linecap="round">${[0, 60, 120].map((a) => `<path d="M0 -10 V10" transform="rotate(${a})"/>`).join('')}</g>`,
}[k]);

/* ---------- illustrations des cases (zone de largeur w, hauteur 128) ---------- */

export function artCase(c, w) {
  if (c.startsWith('champ')) return `<rect width="${w}" height="128" fill="${C.ciel}"/><rect y="70" width="${w}" height="60" fill="${C.orge2}"/><path d="M0 76 Q 70 52 140 70 T ${w} 64 V128 H0 Z" fill="${C.orge}"/>
    <circle cx="${w - 48}" cy="34" r="18" fill="#fff3c4"/>
    ${Array.from({ length: Math.ceil(w / 22) }, (_, i) => { const x = 14 + i * 22, y = 88 + (i % 2) * 6; return `<g transform="translate(${x},${y})"><path d="M0 40 V0" stroke="${C.orge2}" stroke-width="2.4"/>${[0, 8, 16].map((d) => `<ellipse cx="-3.5" cy="${d}" rx="3" ry="5.5" fill="#f7d77a" transform="rotate(-25 -3.5 ${d})"/><ellipse cx="3.5" cy="${d}" rx="3" ry="5.5" fill="#f7d77a" transform="rotate(25 3.5 ${d})"/>`).join('')}</g>`; }).join('')}`;
  if (c.startsWith('houb')) {
    const xs = Array.from({ length: Math.floor(w / 70) + 1 }, (_, i) => 30 + i * 70).filter((x) => x < w);
    return `<rect width="${w}" height="128" fill="#cfe8c0"/><rect y="96" width="${w}" height="40" fill="${C.vert2}"/>
    ${xs.map((x) => `<path d="M${x} 128 V8" stroke="#8a6a48" stroke-width="5"/>`).join('')}<path d="M0 12 H${w}" stroke="#8a6a48" stroke-width="2.5"/>
    ${xs.map((x) => `<path d="M${x} 120 C ${x + 16} 100, ${x - 16} 80, ${x} 60 S ${x + 14} 30, ${x} 14" stroke="${C.vert3}" stroke-width="3" fill="none"/>${[30, 55, 80, 104].map((y, k) => cone(x + (k % 2 ? 9 : -9), y, 0.55)).join('')}`).join('')}`;
  }
  if (c === 'marcheMat') return `<rect width="${w}" height="128" fill="#f6d9b1"/>
    <path d="M10 46 L ${w / 2} 8 L ${w - 10} 46 Z" fill="${C.brique}"/>${Array.from({ length: Math.ceil((w - 20) / 30) }, (_, i) => `<path d="M${10 + i * 30} 46 q 15 14 30 0" fill="${i % 2 ? '#fff' : C.brique}" stroke="${C.encre}" stroke-width="1"/>`).join('')}
    <rect x="24" y="54" width="8" height="74" fill="${C.encre2}"/><rect x="${w - 32}" y="54" width="8" height="74" fill="${C.encre2}"/>
    ${[[w / 2 - 74, C.orge], [w / 2 - 30, '#e9c76b'], [w / 2 + 14, C.vert], [w / 2 + 58, '#7cbf5c']].map(([x, col]) => `<path d="M${x} 126 C ${x - 4} 96, ${x + 4} 84, ${x + 16} 82 C ${x + 28} 84, ${x + 36} 96, ${x + 32} 126 Z" fill="#d6b88a" stroke="${C.encre2}" stroke-width="1.5"/><ellipse cx="${x + 16}" cy="86" rx="13" ry="5" fill="${col}"/>`).join('')}`;
  if (c === 'tournee') return `<rect width="${w}" height="128" fill="${C.ciel}"/><path d="M0 84 Q 80 70 160 82 T ${w} 78 V128 H0Z" fill="#9cc77e"/>
    <path d="M-10 128 C 60 104, 140 116, ${w + 12} 96" stroke="#8b7a68" stroke-width="22" fill="none"/><path d="M-10 128 C 60 104, 140 116, ${w + 12} 96" stroke="#fff" stroke-width="2" stroke-dasharray="10 9" fill="none"/>
    <g transform="translate(${w / 2 - 13},70)"><rect x="0" y="0" width="74" height="34" rx="5" fill="${C.cuivre}" stroke="${C.encre}" stroke-width="2"/><path d="M74 10 H96 L108 24 V34 H74 Z" fill="#f6eadb" stroke="${C.encre}" stroke-width="2"/><rect x="80" y="14" width="14" height="10" fill="${C.ciel}"/>
    ${[18, 92].map((cx) => `<circle cx="${cx}" cy="36" r="9" fill="${C.encre}"/><circle cx="${cx}" cy="36" r="3.5" fill="#ccc"/>`).join('')}${[8, 30, 52].map((x) => `<rect x="${x}" y="-14" width="16" height="16" rx="3" fill="#a0612f" stroke="${C.encre}" stroke-width="1.2"/>`).join('')}</g>`;
  if (c === 'marcheBieres') return `<rect width="${w}" height="128" fill="#f3d38f"/>
    <path d="M0 0 H${w} V30 H0 Z" fill="${C.bleu}"/>${Array.from({ length: Math.ceil(w / 30) }, (_, i) => `<path d="M${i * 30} 30 q 15 14 30 0" fill="${i % 2 ? '#fff' : C.bleu}"/>`).join('')}
    <rect x="${w - 108}" y="48" width="92" height="56" rx="4" fill="${C.encre}"/><path d="M${w - 98} 62 h56 M${w - 98} 76 h48 M${w - 98} 90 h60" stroke="#f6eadb" stroke-width="3" stroke-linecap="round" opacity=".8"/>
    ${fut(40, 104, 1.05)}${fut(78, 104, 1.05, '#c9a26a')}${fut(59, 72, 1.05)}
    <rect x="0" y="122" width="${w}" height="8" fill="#a0612f"/>`;
  if (c === 'chantier') return `<rect width="${w}" height="128" fill="#cfe3ea"/>
    <rect x="40" y="58" width="110" height="70" fill="#e6c9a0" stroke="${C.encre}" stroke-width="2"/>${[0, 1, 2].map((r) => [0, 1, 2, 3].map((k) => `<rect x="${44 + k * 27}" y="${62 + r * 22}" width="24" height="18" fill="none" stroke="${C.brique}" stroke-width="1.5"/>`).join('')).join('')}
    <path d="M${w - 62} 128 V20 M${w - 62} 22 H96 M${w - 62} 22 L${w - 46} 38" stroke="${C.cuivre2}" stroke-width="6" fill="none"/><path d="M110 22 V52" stroke="${C.encre}" stroke-width="2"/><rect x="98" y="52" width="26" height="16" fill="${C.orge}" stroke="${C.encre}" stroke-width="1.5"/>
    <g transform="translate(${w - 36},96) rotate(30)"><rect x="-3" y="-20" width="6" height="34" fill="#8a6a48"/><rect x="-12" y="-28" width="24" height="10" rx="2" fill="#777"/></g>`;
  return `<rect width="${w}" height="128" fill="${C.creme2}"/>`;
}

/* ---------- pictogrammes des cartes Client ---------- */

export const KIND_COL = { bar: C.orge2, cave: C.violet, fest: C.sarcelle };
export const KIND_FOND = { bar: '#f6e3b8', cave: '#ead8de', fest: '#d4ece8' };
export function pictoClient(kind) {
  const p = {
    bar: `<path d="M-14 -20 H14 L10 22 H-10 Z" fill="#f7d77a" stroke="${C.encre}" stroke-width="2"/><path d="M-15 -20 Q -8 -30 0 -22 Q 8 -32 15 -20 Z" fill="#fff" stroke="${C.encre}" stroke-width="1.5"/><path d="M14 -10 h6 a6 6 0 0 1 0 14 h-8" fill="none" stroke="${C.encre}" stroke-width="2.5"/>`,
    cave: `<path d="M-5 -30 H5 V-16 C 12 -12, 12 -6, 12 0 V24 H-12 V0 C -12 -6, -12 -12, -5 -16 Z" fill="#5a2a3a" stroke="${C.encre}" stroke-width="2"/><rect x="-9" y="2" width="18" height="12" fill="#f4e9d4"/>`,
    fest: `<path d="M0 -26 L 26 22 H-26 Z" fill="#f4e9d4" stroke="${C.encre}" stroke-width="2"/><path d="M0 -26 L 10 22 H-10 Z" fill="${C.brique}"/><path d="M0 -26 V-36 L 12 -32 L 0 -28" fill="${C.cuivre}" stroke="${C.encre}" stroke-width="1.2"/>`,
  }[kind] ?? '';
  return `<svg viewBox="-40 -40 80 70" class="picto" aria-hidden="true">${p}</svg>`;
}
export const etoile = (n) => `<svg viewBox="-14 -14 28 28" class="etoile" aria-hidden="true"><path d="M0 -12 L3.5 -4 L12 -3.5 L5.5 2 L7.5 10.5 L0 6 L-7.5 10.5 L-5.5 2 L-12 -3.5 L-3.5 -4 Z" fill="${C.orge}" stroke="${C.encre}" stroke-width="1.3"/><text y="4" text-anchor="middle" font-size="10" font-weight="700" fill="${C.encre}">${n}</text></svg>`;

/* ---------- la brasserie ---------- */

// Cuve de fermentation : niveau de 0 à 1, couleur de la bière
export function cuve(niveau, col, label, sub) {
  const h = 108, lv = Math.round(niveau * (h - 14));
  return `<svg viewBox="-6 -4 86 130" class="cuve" aria-hidden="true">
    <clipPath id="cv${label}${sub}${lv}"><rect x="0" y="0" width="74" height="${h}" rx="28"/></clipPath>
    <rect x="0" y="0" width="74" height="${h}" rx="28" fill="#d9dde0" stroke="${C.encre}" stroke-width="2"/>
    ${lv ? `<rect x="0" y="${h - lv}" width="74" height="${lv}" fill="${col}" clip-path="url(#cv${label}${sub}${lv})"/>` : ''}
    <rect x="10" y="10" width="10" height="${h - 22}" rx="5" fill="#fff" opacity=".55"/>
    <rect x="-4" y="${h - 4}" width="82" height="10" rx="4" fill="${C.encre2}"/>
    <text x="37" y="${h / 2 - 2}" text-anchor="middle" font-size="13" font-weight="700" fill="${col === STYLE_COL.stout && lv > 40 ? '#f6eadb' : C.encre}">${label}</text>
    ${sub ? `<text x="37" y="${h / 2 + 15}" text-anchor="middle" font-size="12" font-weight="600" fill="${col === STYLE_COL.stout && lv > 30 ? '#f6eadb' : C.encre2}">${sub}</text>` : ''}
  </svg>`;
}
export const futSvg = (col) => `<svg viewBox="-16 -24 32 44" class="futsvg" aria-hidden="true">${fut(0, 0, 1, col)}</svg>`;
export const sacSvg = (col = C.orge) => `<svg viewBox="-30 -22 60 56" class="ressvg" aria-hidden="true">${sac(0, 0, 1, col)}</svg>`;
export const coneSvg = () => `<svg viewBox="-20 -32 40 58" class="ressvg" aria-hidden="true">${cone(0, 0, 1.2)}</svg>`;
export const piecesSvg = () => `<svg viewBox="-24 -26 48 38" class="ressvg" aria-hidden="true">${pieces(0, 0, 3)}</svg>`;
export const ouvrierSvg = (col) => `<svg viewBox="-20 -34 40 44" class="ouvsvg" aria-hidden="true"><path d="M-15 9 C -15 -6, -9 -12, -6 -13 L 6 -13 C 9 -12, 15 -6, 15 9 Z" fill="${col}" stroke="${C.encre}" stroke-width="1.5"/><circle cx="0" cy="-21" r="9" fill="${col}" stroke="${C.encre}" stroke-width="1.5"/><path d="M-11 -27 H11 L8 -33 H-8 Z" fill="${col}" stroke="${C.encre}" stroke-width="1.2"/></svg>`;
