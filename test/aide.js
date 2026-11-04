// Outils communs aux tests du serveur.

import { legalActions } from '../moteur/index.js';
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

// Joueur automatique qui ne voit que sa vue : refuse les échanges, brasse et livre ce qu'il peut, sinon passe
export function botAction(view, me) {
  const L = legalActions(view, me);
  const has = (type) => L.find((a) => a.type === type);
  if (has('respondTrade') && view.trade?.from !== me) return { type: 'respondTrade', accept: false };
  const pl = has('placer'); if (pl) return { type: 'placer', hex: pl.targets[0] };
  const tf = has('tournee'); if (tf?.free) return { type: 'tournee', client: tf.targets[0].client };
  const ev = has('evenement'); if (ev) return { type: 'evenement', ferm: ev.targets[0] };
  const cc = has('concours'); if (cc) return { type: 'concours', style: cc.styles[0] };
  if (view.trade?.from === me) return { type: 'cancelTrade' };
  const liv = has('livrer'); if (liv) return { type: 'livrer', client: liv.targets[0].client, style: liv.targets[0].styles[0] };
  const br = has('brasser'); if (br) return { type: 'brasser', style: br.styles[0] };
  if (has('endTurn')) return { type: 'endTurn' };
  const v = has('vendre'); if (v) return { type: 'vendre', style: v.styles[0], n: 1 };
  return null;
}
