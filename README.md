# Terres de Houblon

Jeu de plateau dans l'univers de la brasserie, inspiré des jeux de colonisation à cases hexagonales. Une partie se joue dans le navigateur, seul contre l'ordinateur ou à plusieurs, en direct ou en différé.

**Jouer :** https://jeu.leperelamer.fr

## Principe

- Les cases produisent Fût, Eau, Levure, Malt et Houblon quand leur numéro sort aux dés.
- On trace des tournées de livraison, on ouvre des microbrasseries (1 point) et on les agrandit en grandes brasseries (2 points).
- Sur un 7, le contrôleur des douanes bloque une case.
- Négoce avec le grossiste ou avec les autres brasseries.
- Premier à 10 points de réputation.

Sans dépendance ni étape de construction : `index.html` charge les modules de `client/` et `moteur/`.

Pour jouer en local, il faut servir le dossier (un double-clic sur `index.html` ne charge pas les modules) :

```bash
python3 -m http.server 8642   # puis http://localhost:8642
```

Le mode solo tourne entièrement dans le navigateur ; la partie en cours est gardée entre deux visites.

## Moteur de jeu

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

## Jeu en réseau

Le serveur (`serveur/`) est l'arbitre : il détient l'état, tire les dés, fait jouer l'ordinateur et envoie à chacun sa vue par WebSocket. Les parties sont gardées dans SQLite après chaque action.

- **Créer** une partie : nom de sa brasserie, nombre de joueurs humains (1 à 4), rythme (en direct ou en différé) et temps pour jouer. Les places sans joueur sont tenues par l'ordinateur ; une place libre peut être reprise en cours de partie avec le code.
- **Rejoindre** avec le code à 5 caractères ou le lien d'invitation (`#rejoindre=CODE`).
- **Reprendre sa place** sur un autre appareil avec son lien personnel (`#p=…`), affiché dans la salle d'attente.
- **Délais** : en direct, l'ordinateur joue la décision en retard, puis tient la place après deux retards de suite, jusqu'au retour du joueur ; en différé, il termine le tour de l'absent. Une offre d'échange reste ouverte jusqu'à la fin du tour du proposant, 45 s au plus en direct et 4 h en différé.

### En local

```bash
cd serveur && npm install && cd ..     # une fois (dépendance : ws)
npm install                            # une fois (Playwright, pour les scénarios navigateur)
AI_PACE=0.3 npm run serveur            # serveur sur localhost:3210 (AI_PACE < 1 : ordinateur plus rapide)
npm run page                           # dans un autre terminal : la page sur http://localhost:8642
npm test                               # moteur, salle et serveur
npm run e2e:solo && npm run e2e:deux   # parties complètes jouées dans Chrome (serveur et page lancés)
```

Mise en production sur le serveur : voir [`DEPLOIEMENT.md`](DEPLOIEMENT.md).
