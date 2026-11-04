# Terres de Houblon

Jeu de plateau dans l'univers de la brasserie, inspiré des jeux de colonisation à cases hexagonales. Une partie se joue dans le navigateur, contre trois brasseries gérées par l'ordinateur.

**Jouer :** https://antoineguiral.github.io/Terre-de-houblon/

## Principe

- Les cases produisent Fût, Eau, Levure, Malt et Houblon quand leur numéro sort aux dés.
- On trace des tournées de livraison, on ouvre des microbrasseries (1 point) et on les agrandit en grandes brasseries (2 points).
- Sur un 7, le contrôleur des douanes bloque une case.
- Négoce avec le grossiste ou avec les autres brasseries.
- Premier à 10 points de réputation.

Un seul fichier `index.html`, sans dépendance à installer.

## Moteur de jeu (branche `multijoueur`)

Toute la logique vit dans `moteur/`, en modules JavaScript purs, sans DOM, utilisables tels quels par le navigateur et par Node (22.13 ou plus récent) :

- `createGame({ seed, players })` crée un état sérialisable en JSON, générateur aléatoire à graine compris ;
- `applyAction(état, joueur, action)` valide et applique, ou refuse avec une raison (`{ ok: false, error }`), sans jamais modifier l'état reçu ;
- `legalActions(état, joueur)` liste ce que ce joueur peut faire, avec les emplacements possibles ;
- `waitingFor(état)` dit de qui on attend une décision : plusieurs joueurs à la fois pour une défausse sur un 7 ou les réponses à une offre d'échange ;
- `viewFor(état, joueur)` masque la main et les cartes Événement des autres (seulement leur nombre), la pioche et la graine ;
- `aiAction(état, joueur)` renvoie la décision de l'IA pour ce joueur, et `aiStep(état)` la joue.

```bash
npm test                       # tests du moteur, dont 30 parties complètes IA contre IA
npm run simulation -- 100      # 100 parties IA contre IA, avec statistiques
```
