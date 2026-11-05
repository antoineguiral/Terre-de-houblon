// Point d'entrée du moteur, identique dans le navigateur (import ES) et dans Node.

export * from './constantes.js';
export {
  VERSION, createGame, applyAction, legalActions, waitingFor, deciders, viewFor,
  saisonIdx, saisonNom, annee, unites, cuveUnites, a, enDemande, prixMarche, caseOuverte, caseLibre, ordre, recolte, peutBrasser,
  valeurLivraison, stylesPour, ameliorationsPossibles, pointsDiversite, score, avoirs, posesPossibles,
} from './regles.js';
export { aiAction, NIVEAUX } from './ia.js';

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
