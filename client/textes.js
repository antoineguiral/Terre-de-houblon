// Textes du jeu : noms, cases, événements, et rédaction du journal selon le joueur qui lit.

import { RES, STYLES, ITEMS, SAISONS, CASES, EVT, AMELIORATIONS, NIVEAUX, METEO } from '../moteur/index.js';

export const RN = { malt: 'Malt', houb: 'Houblon', argent: 'Argent' };
export const RI = { malt: 'M', houb: 'H', argent: '€' };
export const SN = { blonde: 'Blonde', ipa: 'IPA', stout: 'Stout', garde: 'Bière de garde' };
export const SI = { blonde: 'Bl', ipa: 'IPA', stout: 'St', garde: 'Ga' };
export const SAISON_NOM = { printemps: 'Printemps', ete: 'Été', automne: 'Automne', hiver: 'Hiver' };
export const KIND = { bar: 'Bar', cave: 'Cave', fest: 'Festival', mairie: 'Mairie' };
export const nomItem = (k) => RN[k] ?? SN[k];
export const nomCase = (c) => CASES[c]?.nom ?? c;
export const nomSaison = (t) => `${SAISON_NOM[SAISONS[t % 4]]} an ${Math.floor(t / 4) + 1}`;
export const nomNiveau = (n) => NIVEAUX[n]?.nom ?? n;
export const meteoTexte = (m) => (METEO[m] === 1 ? 'Belle saison : champs et houblonnières +1' : METEO[m] === -1 ? 'Mauvaise saison : champs et houblonnières −1' : 'Météo ordinaire');
export const fmt = (o) => ITEMS.filter((k) => o?.[k]).map((k) => `${o[k]} ${nomItem(k)}`).join(', ');
export const fmtRes = (o) => RES.filter((k) => o?.[k]).map((k) => `${o[k]} ${RN[k]}`).join(', ');
export const plural = (n, s) => `${n} ${s}${n > 1 ? 's' : ''}`;

// Une entrée du journal → une ou plusieurs lignes { txt, p } (p = joueur pour la pastille de couleur)
export function logLines(e, view) {
  const me = view.me, P = view.players;
  const tu = (i) => me === i;
  const name = (i) => (tu(i) ? 'Tu' : P[i].name);
  const v2 = (i, a, b) => `${name(i)} ${tu(i) ? a : b}`;
  switch (e.k) {
    case 'start': return [{ txt: `Nouvelle partie. ${tu(e.first) ? 'Tu commences' : P[e.first].name + ' commence'} ; ${tu(e.dernier) ? 'tu reçois' : P[e.dernier].name + ' reçoit'} 1 Réputation pour jouer en dernier.`, p: e.first }];
    case 'saison': {
      const out = [{ txt: `${nomSaison(e.saison)} : ${meteoTexte(e.meteo).toLowerCase()}${e.evt ? `. ${EVT[e.evt].nom} : ${EVT[e.evt].txt}` : '.'}`, p: null }];
      e.finis.forEach((f) => out.push({ txt: `${tu(f.p) ? 'Ta' : P[f.p].name + ' : sa'} ${SN[f.st]} est prête (${plural(f.u, 'unité')}).`, p: f.p }));
      return out;
    }
    case 'ordre': return [{ txt: tu(e.first) ? 'Tu poses en premier cette saison.' : `${P[e.first].name} pose en premier cette saison.`, p: e.first }];
    case 'douanes': { const m = e.paie.find((x) => x.p === me); return [{ txt: `Contrôle des douanes${m?.n ? ` : tu paies ${m.n} Argent` : ''}.`, p: null }]; }
    case 'perte': return [{ txt: `${tu(e.p) ? 'Ta' : P[e.p].name + ' : sa'} ${SN[e.style]} perd 1 unité (${EVT[e.evt].nom.toLowerCase()}).`, p: e.p }];
    case 'presente': return [{ txt: `${v2(e.p, 'présentes', 'présente')} une ${SN[e.style]}.`, p: e.p }];
    case 'concours': return e.gains.filter((g) => g.rep).map((g) => ({ txt: `${EVT[e.kind].nom} : ${tu(g.p) ? 'tu gagnes' : P[g.p].name + ' gagne'} ${g.rep} Réputation avec sa ${SN[g.st]}.`, p: g.p }));
    case 'brasser': return [{ txt: `${v2(e.p, 'brasses', 'brasse')} une ${SN[e.style]} : dé ${e.de}${e.de === 1 ? ', brassin raté' : e.de === 6 ? ', cuvée exceptionnelle' : ''}, ${plural(e.u, 'unité')} prête${e.u > 1 ? 's' : ''} dans ${plural(e.ferm, 'saison')}${e.premiere ? ', +1 Réputation pour la première' : ''}.`, p: e.p }];
    case 'poser': {
      const c = e.case;
      if (CASES[c].recolte) return [{ txt: `${v2(e.p, 'récoltes', 'récolte')} ${e.n} ${RN[e.res]} (${nomCase(c)}).`, p: e.p }];
      if (c === 'marcheMat') return [{ txt: `${v2(e.p, 'achètes', 'achète')} ${fmtRes(e.achats)} (${e.cout} Argent).`, p: e.p }];
      if (c === 'tournee') return [{ txt: `${v2(e.p, 'livres', 'livre')} ${e.client.nom} : ${plural(e.client.n, 'unité')} de ${SN[e.style]}, ${e.argent} Argent, ${e.rep} Réputation.`, p: e.p }];
      if (c === 'marcheBieres') return [{ txt: `${v2(e.p, 'vends', 'vend')} ${fmt(e.ventes)} au Marché (${e.gain} Argent).`, p: e.p }];
      if (c === 'chantier') return [{ txt: `${v2(e.p, "t'équipes", "s'équipe")} : ${AMELIORATIONS[e.u].nom}.`, p: e.p }];
      return [];
    }
    case 'vendre': return e.force ? [{ txt: `${tu(e.p) ? 'Ton stock déborde : une' : P[e.p].name + ' : stock trop plein, une'} ${SN[e.style]} est vendue d'office (${e.gain} Argent).`, p: e.p }] : [];
    case 'salle': return [{ txt: `${v2(e.p, 'sers', 'sert')} une ${SN[e.style]} à la Salle de dégustation (${e.gain} Argent).`, p: e.p }];
    case 'salleRep': return [{ txt: `${tu(e.p) ? 'Ta' : P[e.p].name + ' : sa'} Salle de dégustation rapporte ${e.n} Réputation.`, p: e.p }];
    case 'clientParti': return [{ txt: `${e.client.nom} s'est lassé d'attendre et quitte la file.`, p: null }];
    case 'passe': return [{ txt: `${v2(e.p, 'passes', 'passe')} : rien à faire pour cet ouvrier.`, p: e.p }];
    case 'tradeOffer': return [{ txt: `${v2(e.p, 'proposes', 'propose')} ${fmt(e.give)} contre ${fmt(e.get)}.`, p: e.p }];
    case 'tradeResp':
      if (!tu(e.p) && !tu(e.from)) return [];
      if (tu(e.p)) return [{ txt: { accept: `Tu acceptes l'offre de ${P[e.from].name}.`, refuse: `Tu refuses l'offre de ${P[e.from].name}.`, counter: `Tu fais une contre-proposition à ${P[e.from].name}.` }[e.s], p: e.p }];
      if (e.lacking) return [{ txt: `${P[e.p].name} n'a plus ce qui était demandé.`, p: e.p }];
      return [{ txt: { accept: `${P[e.p].name} accepte ton offre.`, refuse: `${P[e.p].name} refuse ton offre.`, counter: `${P[e.p].name} te fait une contre-proposition : ${fmt(e.give)} contre ${fmt(e.get)}.` }[e.s], p: e.p }];
    case 'tradeDone': return [{ txt: `${v2(e.p, 'échanges', 'échange')} ${fmt(e.give)} contre ${fmt(e.get)} avec ${tu(e.with) ? 'toi' : P[e.with].name}.`, p: e.p }];
    case 'tradeClosed': return tu(e.p) && e.why === 'cancel' ? [{ txt: 'Ta proposition ne trouve pas preneur.', p: e.p }] : [];
    case 'endTurn': return [];
    case 'fin': return [{ txt: tu(e.p) ? 'Trois ans ont passé : ta brasserie est la plus réputée du terroir !' : `Trois ans ont passé : ${P[e.p].name} est la brasserie la plus réputée du terroir.`, p: e.p }];
    default: return [];
  }
}
