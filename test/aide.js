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
  const ev = has('evenement'); if (ev) return { type: 'evenement', ferm: ev.targets[0] };
  const cc = has('concours'); if (cc) return { type: 'concours', style: cc.styles[0] };
  if (view.trade?.from === me) return { type: 'cancelTrade' };
  const br = has('brasser'); if (br) return { type: 'brasser', style: br.styles[0] };
  const po = has('poser');
  if (po) {
    const t = po.targets.find((x) => x.case === 'tournee') ?? po.targets.find((x) => x.case === 'marcheBieres') ?? po.targets.find((x) => x.case !== 'chantier' && x.case !== 'marcheMat') ?? po.targets[0];
    if (t.case === 'tournee') return { type: 'poser', case: 'tournee', client: t.clients[0].id, style: t.clients[0].styles[0] };
    if (t.case === 'marcheBieres') return { type: 'poser', case: 'marcheBieres', ventes: { [t.styles[0]]: 1 } };
    if (t.case === 'marcheMat') return { type: 'poser', case: 'marcheMat', achats: { malt: 1 } };
    if (t.case === 'chantier') return { type: 'poser', case: 'chantier', u: t.targets[0] };
    return { type: 'poser', case: t.case };
  }
  if (has('endTurn')) return { type: 'endTurn' };
  return null;
}
