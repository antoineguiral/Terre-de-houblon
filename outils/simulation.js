// Parties IA contre IA en série, avec les indicateurs d'équilibrage :
//   node outils/simulation.js [nombre] [niveau] [joueurs] [graine de départ]
//   npm run simulation -- 500 maitre 4

import { createGame, aiStep, waitingFor, STYLES, AMELIORATIONS, CASES, EVT, NB_SAISONS } from '../moteur/index.js';

const N = +(process.argv[2] ?? 100), NIVEAU = process.argv[3] ?? 'compagnon', NJ = +(process.argv[4] ?? 4), FROM = +(process.argv[5] ?? 1);
const names = ['Brasserie du Moulin', 'La Mousse Noire', 'Les Fûts Joyeux', 'La Cuve Dorée'];

// Joue une partie jusqu'au bout. `journal` reçoit toutes les entrées du journal (l'état n'en garde que les dernières).
export function playOut(seed, { niveau = 'compagnon', n = 4, maxSteps = 10000, journal = null, ordre = 'rotation' } = {}) {
  let s = createGame({ seed, niveau, ordre, players: names.slice(0, n).map((name) => ({ name, ai: true })) });
  let steps = 0, lastI = -1;
  const collect = () => { if (!journal) return; for (const e of s.log) if (e.i > lastI) { journal.push(e); lastI = e.i; } };
  collect();
  while (s.phase !== 'over' && steps < maxSteps) {
    const r = aiStep(s);
    if (!r) throw new Error(`Blocage graine ${seed} : personne ne joue (attendus ${waitingFor(s)}).`);
    s = r.state; steps++;
    collect();
  }
  return { s, steps };
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const pct = (x) => `${Math.round(x * 100)}%`;
const f1 = (x) => x.toFixed(1);

if (import.meta.url === `file://${process.argv[1]}`) {
  const scores = [], spreads = [], winsRank = Array(NJ).fill(0), byRank = Array.from({ length: NJ }, () => []);
  const styles = Object.fromEntries(STYLES.map((s) => [s, 0])), upg = Object.fromEntries(Object.keys(AMELIORATIONS).map((u) => [u, 0]));
  const cases = Object.fromEntries(Object.keys(CASES).map((c) => [c, 0])), evts = {};
  const src = { rep: [], diversite: [], argent: [] };
  let unfinished = 0, clients = 0, partis = 0, vendu = 0, argentMarche = 0, forces = 0, passes = 0, rates = 0, cuvees = 0, echanges = 0, offres = 0, brassins = 0;
  const parKind = {};
  const t0 = Date.now();
  for (let g = FROM; g < FROM + N; g++) {
    const journal = [];
    const { s } = playOut(g, { niveau: NIVEAU, n: NJ, journal });
    if (s.phase !== 'over') { unfinished++; continue; }
    const tot = s.scores.map((x) => x.total);
    scores.push(...tot); spreads.push(Math.max(...tot) - Math.min(...tot));
    const first = journal.find((e) => e.k === 'start').first;
    const rank = (pi) => (pi - first + NJ) % NJ;
    winsRank[rank(s.winner)]++;
    s.players.forEach((p, i) => {
      byRank[rank(i)].push(tot[i]);
      src.rep.push(s.scores[i].rep); src.diversite.push(s.scores[i].diversite); src.argent.push(s.scores[i].argent);
      p.upg.forEach((u) => upg[u]++);
      upg.ferm += p.nferm - 2;
    });
    for (const e of journal) {
      if (e.k === 'brasser') { styles[e.style]++; brassins++; if (e.de === 1) rates++; if (e.de === 6) cuvees++; }
      if (e.k === 'poser') { cases[e.case]++; if (e.case === 'tournee') { clients++; parKind[e.client.kind] = (parKind[e.client.kind] || 0) + 1; } if (e.case === 'marcheBieres') { vendu += Object.values(e.ventes).reduce((x, y) => x + y, 0); argentMarche += e.gain; } }
      if (e.k === 'vendre' && e.force) { forces++; vendu++; argentMarche += e.gain; }
      if (e.k === 'clientParti') partis++;
      if (e.k === 'passe') passes++;
      if (e.k === 'saison' && e.evt) evts[e.evt] = (evts[e.evt] || 0) + 1;
      if (e.k === 'tradeDone') echanges++;
      if (e.k === 'tradeOffer') offres++;
    }
  }
  const P = N * NJ, G = N - unfinished;
  console.log(`${N} parties à ${NJ} (niveau ${NIVEAU}), ${unfinished} non finies, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log(`Score final : moyenne ${f1(mean(scores))}, min ${Math.min(...scores)}, max ${Math.max(...scores)}, écart-type ${f1(sd(scores))} ; écart premier-dernier ${f1(mean(spreads))}`);
  console.log(`Points par joueur : réputation ${f1(mean(src.rep))}, diversité ${f1(mean(src.diversite))}, argent ${f1(mean(src.argent))}`);
  console.log(`Victoires par rang au premier tour (0 = a commencé) : ${winsRank.map((w) => pct(w / G)).join(' / ')} ; score moyen par rang : ${byRank.map((a) => f1(mean(a))).join(' / ')}`);
  console.log(`Brassins par joueur : ${f1(brassins / P)} (${STYLES.map((s) => `${s} ${f1(styles[s] / P)}`).join(', ')}) ; ratés ${f1(rates / P)}, cuvées exceptionnelles ${f1(cuvees / P)}`);
  console.log(`Clients livrés par joueur : ${f1(clients / P)} (${Object.entries(parKind).map(([k, v]) => `${k} ${f1(v / P)}`).join(', ')}) ; clients partis sans être livrés par partie : ${f1(partis / G)}`);
  console.log(`Marché aux bières : ${f1(vendu / P)} u par joueur à ${f1(argentMarche / Math.max(1, vendu))} (dont vendues d'office ${f1(forces / P)}) ; ouvriers perdus ${f1(passes / P)} ; offres ${f1(offres / P)}, échanges ${f1(echanges / P)}`);
  console.log(`Cases (poses par joueur) : ${Object.keys(CASES).map((c) => `${c} ${f1(cases[c] / P)}`).join(', ')}`);
  console.log(`Équipements (part des joueurs) : ${Object.keys(AMELIORATIONS).map((u) => `${u} ${pct(upg[u] / P)}`).join(', ')}`);
  console.log(`Événements par partie : ${Object.entries(evts).sort().map(([k, v]) => `${EVT[k].nom} ${(v / G).toFixed(2)}`).join(', ')}`);
}
