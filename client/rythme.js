// Rythme de l'ordinateur, choisi par le joueur et gardé dans le navigateur :
// lent, normal, rapide, ou pas à pas (l'ordinateur attend un clic pour chaque action).

const KEY = 'brassins-rythme';
export const RYTHMES = {
  lent: { nom: 'Lent', f: 1.6 },
  normal: { nom: 'Normal', f: 1 },
  rapide: { nom: 'Rapide', f: 0.4 },
  pas: { nom: 'Pas à pas', f: 1 },
};

let courant = 'normal';
try { const r = localStorage.getItem(KEY); if (RYTHMES[r]) courant = r; } catch { /* stockage indisponible */ }
const abonnes = new Set();

export const rythme = () => courant;
export const facteur = () => RYTHMES[courant].f;
export function choisirRythme(r) {
  if (!RYTHMES[r] || r === courant) return;
  courant = r;
  try { localStorage.setItem(KEY, r); } catch { /* stockage indisponible */ }
  abonnes.forEach((f) => f(r));
}
export const surRythme = (f) => { abonnes.add(f); return () => abonnes.delete(f); };

// Durée d'affichage d'une bulle (ms), et pause de l'ordinateur après une action (ms), au rythme normal
export const DUREE_BULLE = 1700;
export function pauseApres(action, finDeSaison) {
  const base = action.type === 'poser' ? 1900 : action.type === 'brasser' ? 1400 : action.type === 'endTurn' ? 700 : action.type === 'respondTrade' ? 450 : 1000;
  return (base + (finDeSaison ? 2200 : 0)) * facteur();
}
