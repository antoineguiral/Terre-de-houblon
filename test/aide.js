// Outils communs aux tests du serveur.

import { legalActions, RES } from '../moteur/index.js';
import { CONFIG } from '../serveur/config.js';

export const TEST_CONFIG = { ...CONFIG, aiPace: { direct: 0.001, differe: 0.001 }, origins: ['http://test.local'], maxMessagesPerSecond: 1000 };

// Horloge et minuteurs simulés : advance(ms) déclenche dans l'ordre tout ce qui arrive à échéance
export function fakeClock() {
  let t = 1_800_000_000_000, id = 0;
  const q = [];
  return {
    now: () => t,
    setTimeout: (fn, ms) => { const h = { id: ++id, at: t + ms, fn }; q.push(h); return h; },
    clearTimeout: (h) => { const i = q.indexOf(h); if (i >= 0) q.splice(i, 1); },
    advance(ms) {
      const end = t + ms;
      for (let n = 0; n < 1e6; n++) {
        q.sort((a, b) => a.at - b.at || a.id - b.id);
        const h = q[0];
        if (!h || h.at > end) break;
        q.shift();
        t = Math.max(t, h.at);
        h.fn();
      }
      t = end;
    },
    pending: () => q.length,
  };
}

// Joueur automatique qui ne voit que sa vue : refuse les échanges, construit ce qu'il peut, sinon passe
export function botAction(view, me) {
  const L = legalActions(view, me);
  const has = (type, f = () => true) => L.find((a) => a.type === type && f(a));
  if (has('respondTrade') && view.trade?.from !== me) return { type: 'respondTrade', accept: false };
  const d = has('discard');
  if (d) {
    const res = { ...view.players[me].res }, sel = {};
    for (let k = 0; k < d.count; k++) { const r = RES.reduce((a, b) => (res[b] > res[a] ? b : a)); res[r]--; sel[r] = (sel[r] || 0) + 1; }
    return { type: 'discard', res: sel };
  }
  const mr = has('moveRobber'); if (mr) return { type: 'moveRobber', hex: mr.targets[0] };
  const st = has('steal'); if (st) return { type: 'steal', victim: st.targets[0] };
  if (view.trade?.from === me) return { type: 'cancelTrade' };
  if (has('roll')) return { type: 'roll' };
  for (const what of ['settle', 'city', 'road']) {
    const b = has('build', (a) => a.what === what);
    if (b && b.targets.length) return { type: 'build', what, at: b.targets[0] };
  }
  if (has('buyDev')) return { type: 'buyDev' };
  if (has('endTurn')) return { type: 'endTurn' };
  return null;
}
