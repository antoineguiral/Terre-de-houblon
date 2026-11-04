// Parties IA contre IA en série, avec les indicateurs d'équilibrage :
//   node outils/simulation.js [nombre] [niveau] [joueurs] [graine de départ]
//   npm run simulation -- 200 maitre 4

import { createGame, aiStep, waitingFor, STYLES, AMELIORATIONS, unites, clientKind, NB_SAISONS } from '../moteur/index.js';

const N = +(process.argv[2] ?? 50), NIVEAU = process.argv[3] ?? 'compagnon', NJ = +(process.argv[4] ?? 4), FROM = +(process.argv[5] ?? 1);
const names = ['Brasserie du Moulin', 'La Mousse Noire', 'Les Fûts Joyeux', 'La Cuve Dorée'];

// Joue une partie jusqu'au bout. `journal` reçoit toutes les entrées du journal (l'état n'en garde que les dernières).
export function playOut(seed, { niveau = 'compagnon', n = 4, maxSteps = 30000, journal = null } = {}) {
  let s = createGame({ seed, niveau, players: names.slice(0, n).map((name) => ({ name, ai: true })) });
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
  const scores = [], spreads = [], winsSeat = Array(NJ).fill(0), winsRank = Array(NJ).fill(0), winsFirst = [0, 0];
  const byRank = Array.from({ length: NJ }, () => []);
  const styles = Object.fromEntries(STYLES.map((s) => [s, 0])), upg = Object.fromEntries(Object.keys(AMELIORATIONS).map((u) => [u, 0]));
  const upgWhen = Object.fromEntries(Object.keys(AMELIORATIONS).map((u) => [u, []]));
  const src = { rep: [], diversite: [], argent: [], livraison: 0, concours: 0, premiere: 0, salleRep: 0 };
  const ventes = { client: 0, marche: 0, salle: 0, argentMarche: 0 }, clients = { bar: 0, cave: 0, village: 0, foire: 0 };
  let brassins = 0, fermBusy = 0, fermTotal = 0, achats = 0, tournees = 0, unfinished = 0, pertes = 0, echanges = 0, offres = 0;
  const t0 = Date.now();
  for (let g = FROM; g < FROM + N; g++) {
    const journal = [];
    const { s } = playOut(g, { niveau: NIVEAU, n: NJ, journal });
    if (s.phase !== 'over') { unfinished++; continue; }
    const tot = s.scores.map((x) => x.total);
    scores.push(...tot); spreads.push(Math.max(...tot) - Math.min(...tot));
    winsSeat[s.winner]++;
    // rang de placement : ordre inverse de l'ordre du premier tour, lu dans le journal
    const ordre0 = journal.find((e) => e.k === 'ordre')?.ordre ?? s.players.map((_, i) => i);
    const rank = (pi) => [...ordre0].reverse().indexOf(pi);
    winsRank[rank(s.winner)]++;
    winsFirst[s.winner === ordre0[0] ? 0 : 1]++;
    s.players.forEach((p, i) => {
      byRank[rank(i)].push(tot[i]);
      src.rep.push(s.scores[i].rep); src.diversite.push(s.scores[i].diversite); src.argent.push(s.scores[i].argent);
      p.upg.forEach((u) => upg[u]++);
      upg.ferm += p.nferm - 2;
    });
    for (const e of journal) {
      if (e.k === 'brasser') { styles[e.style]++; brassins++; if (e.premiere) src.premiere++; }
      if (e.k === 'livrer') { ventes.client++; clients[clientKind(e.client)]++; src.livraison += e.rep; }
      if (e.k === 'vendre') { ventes.marche += e.n; ventes.argentMarche += e.gain; }
      if (e.k === 'salle') ventes.salle++;
      if (e.k === 'salleRep') src.salleRep += e.n;
      if (e.k === 'concours') src.concours += e.gains.reduce((n, x) => n + x.rep, 0);
      if (e.k === 'acheter') achats += e.n;
      if (e.k === 'tournee' && e.cout > 0) tournees++;
      if (e.k === 'perte') pertes++;
      if (e.k === 'ameliorer') upgWhen[e.u].push(e.saison + 1);
      if (e.k === 'tradeDone') echanges++;
      if (e.k === 'tradeOffer') offres++;
    }
    // occupation des fermenteurs : saisons-fermenteur occupées (durée des brassins) sur saisons-fermenteur disponibles (approximation : fermenteurs finaux)
    s.players.forEach((p) => { fermTotal += p.nferm * NB_SAISONS; });
    for (const e of journal) if (e.k === 'brasser') fermBusy += e.ferm;
  }
  const P = N * NJ, G = N - unfinished;
  console.log(`${N} parties à ${NJ} (niveau ${NIVEAU}), ${unfinished} non finies, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log(`Score final : moyenne ${f1(mean(scores))}, min ${Math.min(...scores)}, max ${Math.max(...scores)}, écart-type ${f1(sd(scores))} ; écart premier-dernier ${f1(mean(spreads))}`);
  console.log(`Points par joueur : réputation ${f1(mean(src.rep))} (livraisons ${f1(src.livraison / P)}, premières ${f1(src.premiere / P)}, concours ${f1(src.concours / P)}, salle ${f1(src.salleRep / P)}), diversité ${f1(mean(src.diversite))}, argent ${f1(mean(src.argent))}`);
  console.log(`Victoires par siège : ${winsSeat.map((w) => pct(w / G)).join(' / ')} ; par rang de placement (0 = a choisi en premier) : ${winsRank.map((w) => pct(w / G)).join(' / ')} ; premier joueur du tour 1 : ${pct(winsFirst[0] / G)}`);
  console.log(`Score moyen par rang de placement : ${byRank.map((a) => f1(mean(a))).join(' / ')}`);
  console.log(`Brassins par joueur : ${f1(brassins / P)} ; styles : ${STYLES.map((s) => `${s} ${f1(styles[s] / P)}`).join(', ')}`);
  console.log(`Occupation des fermenteurs ${pct(fermBusy / Math.max(1, fermTotal))}`);
  console.log(`Ventes par joueur : clients ${f1(ventes.client / P)} u (${Object.entries(clients).map(([k, v]) => `${k} ${f1(v / P)}`).join(', ')}), marché ${f1(ventes.marche / P)} u à ${f1(ventes.argentMarche / Math.max(1, ventes.marche))}, salle ${f1(ventes.salle / P)} u`);
  console.log(`Achats au marché ${f1(achats / P)} matières ; tournées payantes ${f1(tournees / P)} ; unités perdues aux événements ${f1(pertes / P)} ; offres ${f1(offres / P)}, échanges conclus ${f1(echanges / P)}`);
  console.log(`Améliorations (part des joueurs, saison moyenne d'achat) : ${Object.keys(AMELIORATIONS).map((u) => `${u} ${pct(upg[u] / P)}${upgWhen[u].length ? ` s${f1(mean(upgWhen[u]))}` : ''}`).join(', ')}`);
}
