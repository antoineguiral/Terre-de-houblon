// Parties IA contre IA en série : node outils/simulation.js [nombre] [graine de départ]
import { createGame, aiStep, waitingFor, vp } from '../moteur/index.js';

const N = +(process.argv[2] ?? 20), from = +(process.argv[3] ?? 1);
const names = ['Brasserie du Moulin', 'La Mousse Noire', 'Les Fûts Joyeux', 'La Cuve Dorée'];
export function playOut(seed, maxSteps = 20000) {
  let s = createGame({ seed, players: names.map((name) => ({ name, ai: true })) });
  let steps = 0;
  while (s.phase !== 'over' && steps < maxSteps) {
    const r = aiStep(s);
    if (!r) throw new Error(`Blocage graine ${seed} : personne ne joue (attendus ${waitingFor(s)}).`);
    s = r.state; steps++;
  }
  return { s, steps };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const stats = { turns: [], wins: [0, 0, 0, 0], unfinished: 0 };
  for (let g = from; g < from + N; g++) {
    const { s, steps } = playOut(g);
    if (s.phase !== 'over') { stats.unfinished++; console.log(`graine ${g} : pas finie après ${steps} actions, tour ${s.turn}, PV ${s.players.map((_, i) => vp(s, i, true))}`); continue; }
    stats.turns.push(s.turn); stats.wins[s.winner]++;
  }
  const t = stats.turns.sort((a, b) => a - b);
  console.log(`${N} parties, ${stats.unfinished} non finies. Tours : min ${t[0]}, médiane ${t[t.length >> 1]}, max ${t.at(-1)}. Victoires par place : ${stats.wins}`);
}
