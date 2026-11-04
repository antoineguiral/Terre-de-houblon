// Point d'entrée du moteur, identique dans le navigateur (import ES) et dans Node.

export * from './constantes.js';
export { TOPO } from './plateau.js';
export {
  VERSION, createGame, applyAction, legalActions, waitingFor, viewFor,
  vp, rate, roadLen, validSettle, validRoad, validCity, playableDev, canAfford, deckCount, robberVictims,
} from './regles.js';
export { aiAction } from './ia.js';

import { applyAction, waitingFor } from './regles.js';
import { aiAction } from './ia.js';

// Joue une décision IA pour la première place IA attendue. `isAi(i)` dit si la place i est tenue par l'IA.
// Renvoie { state, player, action } ou null si aucune place IA n'a de décision à prendre.
export function aiStep(state, isAi = (i) => state.players[i].ai) {
  for (const pi of waitingFor(state)) {
    if (!isAi(pi)) continue;
    const action = aiAction(state, pi);
    if (!action) continue;
    const r = applyAction(state, pi, action);
    if (!r.ok) throw new Error(`Action IA refusée (${state.players[pi].name}, ${action.type}) : ${r.error}`);
    return { state: r.state, player: pi, action };
  }
  return null;
}
