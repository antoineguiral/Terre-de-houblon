// Textes du jeu : noms, cartes, et rédaction du journal selon le joueur qui lit.

import { RES } from '../moteur/index.js';

export const RN = { fut: 'Fût', eau: 'Eau', lev: 'Levure', malt: 'Malt', houb: 'Houblon' };
export const RI = { fut: 'F', eau: 'E', lev: 'L', malt: 'M', houb: 'H' };
export const TILE = { fut: 'Tonnellerie', eau: 'Source', lev: 'Labo de levures', malt: "Champ d'orge", houb: 'Houblonnière', friche: 'Friche' };
export const DEV = {
  knight: { name: 'Expert-comptable', txt: 'Déplace le contrôleur des douanes et pioche 1 carte chez un voisin.' },
  vp: { name: 'Médaille au concours', txt: '+1 point de réputation, révélé à la victoire.' },
  roads: { name: 'Nouveau camion', txt: 'Pose 2 tournées gratuitement.' },
  plenty: { name: 'Livraison fournisseur', txt: 'Prends 2 ressources au choix.' },
  mono: { name: "Contrat d'exclusivité", txt: "Tous les joueurs te donnent leurs cartes d'une ressource." },
};

export const fmt = (o) => RES.filter((r) => o?.[r]).map((r) => `${o[r]} ${RN[r]}`).join(', ');

// Conjugue selon que le sujet est le lecteur : v(me, p, 'lances', 'lance')
const tu = (me, p) => me === p;

// Une entrée du journal → une ou plusieurs lignes { txt, p } (p = joueur pour la pastille de couleur)
export function logLines(e, view) {
  const me = view.me, P = view.players;
  const name = (i) => (tu(me, i) ? 'Tu' : P[i].name);
  const v2 = (i, a, b) => `${name(i)} ${tu(me, i) ? a : b}`;
  const hexName = (h) => (view.hexes[h].res === 'friche' ? 'la friche' : `${TILE[view.hexes[h].res]} (${view.hexes[h].num})`);
  switch (e.k) {
    case 'start': return [{ txt: me === null ? 'Nouvelle partie.' : 'Nouvelle partie. Place tes deux premières microbrasseries.', p: me }];
    case 'season': return [{ txt: tu(me, 0) ? 'La saison commence. À toi de lancer les dés.' : `La saison commence. ${P[0].name} lance les dés en premier.`, p: 0 }];
    case 'setupGain': return [{ txt: `${v2(e.p, 'démarres', 'démarre')} avec ${fmt(e.res) || 'rien'}.`, p: e.p }];
    case 'build':
      if (e.free && view.phase === 'setup') return [];
      if (e.free || (e.what === 'road' && e.free)) return [{ txt: `${v2(e.p, 'poses', 'pose')} une tournée gratuite.`, p: e.p }];
      if (e.what === 'road') return [{ txt: tu(me, e.p) ? 'Tu ouvres une nouvelle tournée.' : `${P[e.p].name} ouvre une tournée.`, p: e.p }];
      if (e.what === 'settle') return [{ txt: `${v2(e.p, 'ouvres', 'ouvre')} une microbrasserie.`, p: e.p }];
      return [{ txt: tu(me, e.p) ? 'Tu agrandis une microbrasserie en grande brasserie.' : `${P[e.p].name} agrandit une microbrasserie.`, p: e.p }];
    case 'roll': return [{ txt: `${v2(e.p, 'lances', 'lance')} ${e.d[0]} + ${e.d[1]} = ${e.d[0] + e.d[1]}.`, p: e.p }];
    case 'produce':
      if (!e.gains.length) return [{ txt: 'Personne ne produit sur ce lancer.', p: null }];
      return e.gains.map((g) => ({ txt: `${tu(me, g.p) ? 'Tu reçois' : P[g.p].name + ' reçoit'} ${fmt(g.res)}.`, p: g.p }));
    case 'seven': return [{ txt: 'Contrôle des douanes !', p: e.p }];
    case 'discard': return [{ txt: `${v2(e.p, 'défausses', 'défausse')} ${e.n} cartes${e.res && tu(me, e.p) ? ` (${fmt(e.res)})` : ''}.`, p: e.p }];
    case 'robber': return [{ txt: `${v2(e.p, 'envoies', 'envoie')} le contrôleur sur ${hexName(e.hex)}.`, p: e.p }];
    case 'steal':
      if (tu(me, e.p)) return [{ txt: `Tu pioches 1 ${RN[e.r]} chez ${P[e.v].name}.`, p: e.p }];
      if (tu(me, e.v)) return [{ txt: `${P[e.p].name} te pioche 1 ${RN[e.r]}.`, p: e.p }];
      return [{ txt: `${P[e.p].name} pioche 1 carte chez ${P[e.v].name}.`, p: e.p }];
    case 'buyDev': return [{ txt: tu(me, e.p) ? `Tu tires « ${DEV[e.t].name} ».` : `${P[e.p].name} tire une carte Événement.`, p: e.p }];
    case 'playDev': return [{ txt: `${tu(me, e.p) ? 'Tu joues' : P[e.p].name + ' joue'} « ${DEV[e.t].name} ».`, p: e.p }];
    case 'plenty': return [{ txt: `${tu(me, e.p) ? 'Tu reçois' : P[e.p].name + ' reçoit'} ${fmt(e.res)}.`, p: e.p }];
    case 'mono': return [{ txt: `${tu(me, e.p) ? 'Tu récupères' : P[e.p].name + ' récupère'} ${e.n} ${RN[e.r]}.`, p: e.p }];
    case 'longest': return [{ txt: `${v2(e.p, 'prends', 'prend')} le plus grand réseau de livraison (${e.len} tournées).`, p: e.p }];
    case 'army': return [{ txt: `${v2(e.p, 'décroches', 'décroche')} le meilleur dossier comptable.`, p: e.p }];
    case 'bank': return [{ txt: `${v2(e.p, 'échanges', 'échange')} ${e.n} ${RN[e.give]} contre 1 ${RN[e.get]}.`, p: e.p }];
    case 'tradeOffer': return [{ txt: `${v2(e.p, 'proposes', 'propose')} ${fmt(e.give)} contre ${fmt(e.get)}.`, p: e.p }];
    case 'tradeResp':
      if (!tu(me, e.p) && !tu(me, e.from)) return [];
      if (tu(me, e.p)) return [{ txt: { accept: `Tu acceptes l'offre de ${P[e.from].name}.`, refuse: `Tu refuses l'offre de ${P[e.from].name}.`, counter: `Tu fais une contre-proposition à ${P[e.from].name}.` }[e.s], p: e.p }];
      if (e.lacking) return [{ txt: `${P[e.p].name} n'a plus les cartes demandées.`, p: e.p }];
      return [{ txt: { accept: `${P[e.p].name} accepte ton offre.`, refuse: `${P[e.p].name} refuse ton offre.`, counter: `${P[e.p].name} te fait une contre-proposition : ${fmt(e.give)} contre ${fmt(e.get)}.` }[e.s], p: e.p }];
    case 'tradeDone': return [{ txt: `${v2(e.p, 'échanges', 'échange')} ${fmt(e.give)} contre ${fmt(e.get)} avec ${tu(me, e.with) ? 'toi' : P[e.with].name}.`, p: e.p }];
    case 'tradeClosed': return tu(me, e.p) && e.why === 'cancel' ? [{ txt: 'Ta proposition ne trouve pas preneur.', p: e.p }] : [];
    case 'endTurn': return tu(me, e.p) ? [{ txt: 'Tu passes la main.', p: e.p }] : [];
    case 'win': return [{ txt: tu(me, e.p) ? 'Tu remportes la saison !' : `${P[e.p].name} remporte la saison.`, p: e.p }];
    default: return [];
  }
}
