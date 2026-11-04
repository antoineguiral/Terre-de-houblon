// Textes du jeu : noms, cartes, et rédaction du journal selon le joueur qui lit.

import { RES, STYLES, ITEMS, SAISONS, CARTE, FOIRES, AMELIORATIONS, NIVEAUX } from '../moteur/index.js';

export const RN = { malt: 'Malt', houb: 'Houblon', lev: 'Levure', eau: 'Eau', torr: 'Malt torréfié', argent: 'Argent' };
export const RI = { malt: 'M', houb: 'H', lev: 'L', eau: 'E', torr: 'T', argent: '€' };
export const SN = { blonde: 'Blonde', blanche: 'Blanche', ipa: 'IPA', ambree: 'Ambrée', stout: 'Stout', lager: 'Lager', garde: 'Bière de garde' };
export const SI = { blonde: 'Bl', blanche: 'Bc', ipa: 'IPA', ambree: 'Am', stout: 'St', lager: 'La', garde: 'Ga' };
export const TILE = { orge: "Champ d'orge", houb: 'Houblonnière', source: 'Source', bourg: 'Le Bourg', village: 'Village' };
export const SAISON_NOM = { printemps: 'Printemps', ete: 'Été', automne: 'Automne', hiver: 'Hiver' };
export const EVT = {
  contamination: { nom: 'Contamination', court: 'Contamination', txt: 'Sans Labo, un brassin en cours perd 1 unité.' },
  canicule: { nom: 'Canicule', court: 'Canicule', txt: 'Sans Chambre froide, un brassin en cours perd 1 unité.' },
  concours: { nom: 'Concours régional', court: 'Concours', txt: 'Chacun présente 1 unité : le meilleur gagne 5 Réputation, le deuxième 2.' },
  douanes: { nom: 'Contrôle des douanes', court: 'Douanes', txt: '1 Argent par tranche de 3 unités en stock.' },
  fete: { nom: 'Fête au village', court: 'Fête', txt: 'Les bars de village achètent deux fois plus.' },
};
export const nomItem = (k) => RN[k] ?? SN[k];
export const nomClient = (view, c) => (c === 'bar' ? 'Bar du Bourg' : c === 'cave' ? 'Cave du Bourg' : c.startsWith('village') ? `Bar du village ${'ABC'[+c.slice(7)]}` : FOIRES[+c.slice(5)].nom);
export const nomSaison = (t) => `${SAISON_NOM[SAISONS[t % 4]]} an ${Math.floor(t / 4) + 1}`;
export const nomNiveau = (n) => NIVEAUX[n]?.nom ?? n;
export const meteoTexte = (m) => {
  if (!m) return 'Météo ordinaire';
  const [t, v] = Object.entries(m)[0];
  const nom = { orge: "champs d'orge", houb: 'houblonnières', source: 'sources' }[t];
  return v === 'zero' ? `Les ${nom} ne produisent pas` : `${nom[0].toUpperCase() + nom.slice(1)} ${v > 0 ? '+' : ''}${v}`;
};

export const fmt = (o) => ITEMS.filter((k) => o?.[k]).map((k) => `${o[k]} ${nomItem(k)}`).join(', ');
export const fmtRes = (o) => RES.filter((k) => o?.[k]).map((k) => `${o[k]} ${RN[k]}`).join(', ');

// Une entrée du journal → une ou plusieurs lignes { txt, p } (p = joueur pour la pastille de couleur)
export function logLines(e, view) {
  const me = view.me, P = view.players;
  const tu = (i) => me === i;
  const name = (i) => (tu(i) ? 'Tu' : P[i].name);
  const v2 = (i, a, b) => `${name(i)} ${tu(i) ? a : b}`;
  switch (e.k) {
    case 'start': return [{ txt: me === null ? 'Nouvelle partie.' : 'Nouvelle partie. Chacun pose sa brasserie, le dernier à jouer choisit en premier.', p: me }];
    case 'placer': return [{ txt: `${v2(e.p, 'installes', 'installe')} sa brasserie${tu(e.p) ? '' : ''}.`.replace('Tu installes sa', 'Tu installes ta'), p: e.p }];
    case 'tournee': return [{ txt: e.cout ? `${v2(e.p, 'ouvres', 'ouvre')} une tournée vers ${nomClient(view, e.client)} (${e.cout} Argent).` : `${v2(e.p, 'ouvres', 'ouvre')} une tournée vers ${nomClient(view, e.client)}.`, p: e.p }];
    case 'saison': {
      const c = CARTE[e.carte];
      const out = [{ txt: `${nomSaison(e.saison)} : ${c.nom}. ${meteoTexte(c.meteo)}. En demande : ${c.demande.map((s) => SN[s]).join(' et ')}.`, p: null }];
      e.finis.forEach((f) => {
        if (f.collab === undefined) return out.push({ txt: `${tu(f.p) ? 'Ta' : P[f.p].name + ' : sa'} ${SN[f.st]} est prête (${f.u} unités).`, p: f.p });
        if (tu(f.p)) return out.push({ txt: `Ta ${SN[f.st]} en collab avec ${P[f.collab].name} est prête : ${f.u} unités pour toi, ${f.part} pour ${P[f.collab].name}.`, p: f.p });
        if (tu(f.collab)) return out.push({ txt: `La ${SN[f.st]} en collab chez ${P[f.p].name} est prête : ${f.part} unité${f.part > 1 ? 's' : ''} pour toi.`, p: f.p });
        return out.push({ txt: `La ${SN[f.st]} en collab de ${P[f.p].name} et ${P[f.collab].name} est prête.`, p: f.p });
      });
      const g = e.gains.find((x) => x.p === me);
      if (g) out.push({ txt: `Tu reçois ${fmtRes(g.res) || 'rien'}.`, p: me });
      return out;
    }
    case 'douanes': { const m = e.paie.find((x) => x.p === me); return [{ txt: `Contrôle des douanes${m?.n ? ` : tu paies ${m.n} Argent` : ''}.`, p: null }]; }
    case 'fete': return [{ txt: 'Fête au village : les bars de village achètent deux fois plus cette saison.', p: null }];
    case 'evenement': return [{ txt: `${EVT[e.evt].nom} : ${EVT[e.evt].txt}`, p: null }];
    case 'perte': return [{ txt: `${tu(e.p) ? 'Ta' : P[e.p].name + ' : sa'} ${SN[e.style]} perd 1 unité (${EVT[e.evt].nom.toLowerCase()}).`, p: e.p }];
    case 'presente': return [{ txt: `${v2(e.p, 'présentes', 'présente')} une ${SN[e.style]} au concours.`, p: e.p }];
    case 'concours': return e.gains.filter((g) => g.rep).map((g) => ({ txt: `Concours : ${tu(g.p) ? 'tu gagnes' : P[g.p].name + ' gagne'} ${g.rep} Réputation avec sa ${SN[g.st]}.`, p: g.p }));
    case 'ordre': return tu(e.ordre[0]) ? [{ txt: 'Tu joues en premier cette saison.', p: me }] : [{ txt: `${P[e.ordre[0]].name} joue en premier cette saison.`, p: e.ordre[0] }];
    case 'brasser': return [{ txt: `${v2(e.p, 'brasses', 'brasse')} une ${SN[e.style]} (${e.u} unités, prête dans ${e.ferm} saison${e.ferm > 1 ? 's' : ''})${e.premiere ? ', +1 Réputation pour la première' : ''}.`, p: e.p }];
    case 'torrefier': return [{ txt: `${v2(e.p, 'torréfies', 'torréfie')} du malt.`, p: e.p }];
    case 'acheter': return [{ txt: `${v2(e.p, 'achètes', 'achète')} ${e.n} ${RN[e.r]} au Marché${tu(e.p) ? ` (${e.cout} Argent)` : ''}.`, p: e.p }];
    case 'vendre': return [{ txt: `${v2(e.p, 'vends', 'vend')} ${e.n} ${SN[e.style]} au Marché (${e.gain} Argent).`, p: e.p }];
    case 'livrer': return [{ txt: `${v2(e.p, 'livres', 'livre')} une ${SN[e.style]} à ${nomClient(view, e.client)} : ${e.argent} Argent${e.rep ? `, ${e.rep} Réputation` : ''}.`, p: e.p }];
    case 'salle': return [{ txt: `${v2(e.p, 'sers', 'sert')} une ${SN[e.style]} à la Salle de dégustation (${e.gain} Argent).`, p: e.p }];
    case 'salleRep': return [{ txt: `${tu(e.p) ? 'Ta' : P[e.p].name + ' : sa'} Salle de dégustation rapporte ${e.n} Réputation.`, p: e.p }];
    case 'ameliorer': return [{ txt: `${v2(e.p, "t'équipes", "s'équipe")} : ${AMELIORATIONS[e.u].nom}.`, p: e.p }];
    case 'tradeOffer': return [{ txt: `${v2(e.p, 'proposes', 'propose')} ${fmt(e.give)} contre ${fmt(e.get)}.`, p: e.p }];
    case 'collabOffer':
      if (tu(e.with)) return [{ txt: `${P[e.p].name} te propose une collab : une ${SN[e.style]} brassée chez lui.`, p: e.p }];
      return [{ txt: `${v2(e.p, 'proposes', 'propose')} une collab à ${P[e.with].name} : une ${SN[e.style]} brassée chez ${tu(e.p) ? 'toi' : 'lui'}.`, p: e.p }];
    case 'collab': {
      const quand = `${e.u} unités, prête dans ${e.ferm} saison${e.ferm > 1 ? 's' : ''}`;
      const prem = e.premiere.length ? `, +1 de plus pour un style nouveau (${e.premiere.map((i) => (tu(i) ? 'toi' : P[i].name)).join(', ')})` : '';
      const txt = tu(e.p) ? `Tu brasses une ${SN[e.style]} en collab avec ${P[e.with].name}, chez toi (${quand}) : +1 Réputation chacun${prem}.`
        : tu(e.with) ? `Tu brasses une ${SN[e.style]} en collab avec ${P[e.p].name}, chez lui (${quand}) : +1 Réputation chacun${prem}.`
        : `${P[e.p].name} et ${P[e.with].name} brassent une ${SN[e.style]} en collab, chez ${P[e.p].name} (${quand}) : +1 Réputation chacun${prem}.`;
      return [{ txt, p: e.p }];
    }
    case 'tradeResp':
      if (!tu(e.p) && !tu(e.from)) return [];
      if (e.collab) {
        if (tu(e.p)) return [{ txt: { accept: `Tu acceptes la collab de ${P[e.from].name}.`, refuse: `Tu refuses la collab de ${P[e.from].name}.`, counter: `Tu proposes une autre répartition à ${P[e.from].name}.` }[e.s], p: e.p }];
        if (e.lacking) return [{ txt: `${P[e.p].name} n'a plus les matières de la collab.`, p: e.p }];
        return [{ txt: { accept: `${P[e.p].name} accepte ta collab.`, refuse: `${P[e.p].name} refuse ta collab.`, counter: `${P[e.p].name} propose une autre répartition pour la collab.` }[e.s], p: e.p }];
      }
      if (tu(e.p)) return [{ txt: { accept: `Tu acceptes l'offre de ${P[e.from].name}.`, refuse: `Tu refuses l'offre de ${P[e.from].name}.`, counter: `Tu fais une contre-proposition à ${P[e.from].name}.` }[e.s], p: e.p }];
      if (e.lacking) return [{ txt: `${P[e.p].name} n'a plus ce qui était demandé.`, p: e.p }];
      return [{ txt: { accept: `${P[e.p].name} accepte ton offre.`, refuse: `${P[e.p].name} refuse ton offre.`, counter: `${P[e.p].name} te fait une contre-proposition : ${fmt(e.give)} contre ${fmt(e.get)}.` }[e.s], p: e.p }];
    case 'tradeDone': return [{ txt: `${v2(e.p, 'échanges', 'échange')} ${fmt(e.give)} contre ${fmt(e.get)} avec ${tu(e.with) ? 'toi' : P[e.with].name}.`, p: e.p }];
    case 'tradeClosed': return tu(e.p) && e.why === 'cancel' ? [{ txt: 'Ta proposition ne trouve pas preneur.', p: e.p }] : [];
    case 'endTurn': return tu(e.p) ? [{ txt: 'Tu passes la main.', p: e.p }] : [];
    case 'fin': return [{ txt: tu(e.p) ? 'Trois ans ont passé : ta brasserie est la plus réputée du terroir !' : `Trois ans ont passé : ${P[e.p].name} est la brasserie la plus réputée du terroir.`, p: e.p }];
    default: return [];
  }
}
