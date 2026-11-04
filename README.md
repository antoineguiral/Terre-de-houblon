# Brassins

Jeu de gestion de brasserie. On brasse des recettes, on fait fermenter, on livre les bars, les caves et les foires du terroir, on agrandit sa brasserie. Trois ans de quatre saisons, et la brasserie la plus réputée l'emporte. Seul contre l'ordinateur, ou à plusieurs, en direct ou en différé.

Issu de [Terres de Houblon](https://github.com/antoineguiral/Terre-de-houblon), dont il garde l'architecture (moteur séparé de l'affichage, serveur arbitre, client réseau, déploiement) avec des règles entièrement nouvelles.

## Les règles

- **Le plateau.** 19 cases : le Bourg au centre, 3 villages, 15 terroirs (champs d'orge, houblonnières, sources). Chaque joueur pose sa brasserie sur un terroir : sa case et ses six voisines l'approvisionnent. Six foires sur la côte, une par saison ou presque.
- **Les saisons.** 12 saisons. Chaque carte Saison donne la météo, deux styles en demande et parfois un événement (contamination, canicule, concours régional, contrôle des douanes, fête au village). Chaque carte sort une fois sur les trois ans : on sait ce qui peut encore venir.
- **Les matières.** Malt (été, automne), Houblon (surtout automne), Eau (printemps et sources), Levure (récupérée à la fin de chaque fermentation), Malt torréfié (fabriqué à la Touraille).
- **Brasser.** 7 styles, de la Blonde (1 saison, 3 Argent, 1 réputation) à la Bière de garde (3 saisons, 7 Argent, 4 réputation). Un brassin occupe un fermenteur, donne 2 à 4 unités selon la cuve. La première fois qu'on brasse un style : +1 réputation.
- **Vendre.** Au Marché du Bourg, sans limite, mais chaque unité vendue baisse le prix de 1. Aux clients, avec une tournée (2 Argent par case de distance) : ils paient plus et donnent la réputation. Capacité limitée par saison, à prendre dans l'ordre de jeu.
- **S'équiper.** Cuve, fermenteurs, Touraille, Chambre froide, Labo, Camion, Salle de dégustation.
- **L'ordre.** Le moins réputé joue en premier. On ne peut pas finir son tour avec plus de 6 unités en stock.
- **Le décompte.** Réputation + diversité (3 styles +2, 5 styles +5, 7 styles +9) + 1 point par 8 Argent.

Toutes les valeurs sont dans [`moteur/constantes.js`](moteur/constantes.js). Elles sortent d'une première campagne de simulation (voir `docs/`), à affiner en jouant. Les règles pour les joueurs, telles qu'on les expliquerait à table : [`docs/regles.md`](docs/regles.md).

## Jouer en local

Sans dépendance ni étape de construction : `index.html` charge les modules de `client/` et `moteur/`. Il faut servir le dossier (un double-clic sur `index.html` ne charge pas les modules) :

```bash
python3 -m http.server 8642   # puis http://localhost:8642
```

Le mode solo tourne entièrement dans le navigateur, contre 1 à 3 brasseries de niveau Apprenti, Compagnon ou Maître brasseur ; la partie en cours est gardée entre deux visites.

## Moteur de jeu

Toute la logique vit dans `moteur/`, en modules JavaScript purs, sans DOM, utilisables tels quels par le navigateur et par Node (22.13 ou plus récent) :

- `createGame({ seed, players, niveau })` crée un état sérialisable en JSON, générateur aléatoire à graine compris ;
- `applyAction(état, joueur, action)` valide et applique, ou refuse avec une raison (`{ ok: false, error }`), sans jamais modifier l'état reçu ;
- `legalActions(état, joueur)` liste ce que ce joueur peut faire, avec les cibles possibles ;
- `waitingFor(état)` dit de qui on attend une décision : plusieurs joueurs à la fois pour un événement de saison ou les réponses à une offre ;
- `viewFor(état, joueur)` masque la graine et l'ordre des cartes restantes (presque tout le reste est public) ;
- `aiAction(état, joueur)` renvoie la décision de l'IA pour ce joueur, et `aiStep(état)` la joue.

```bash
npm test                              # moteur, salle et serveur (parties complètes IA contre IA comprises)
npm run simulation -- 200 maitre 4    # 200 parties IA contre IA à 4, avec les indicateurs d'équilibrage
```

## Jeu en réseau

Le serveur (`serveur/`) est l'arbitre : il détient l'état, fait tourner les saisons, fait jouer l'ordinateur et envoie à chacun sa vue par WebSocket. Les parties sont gardées dans SQLite après chaque action.

- **Créer** une partie : nom de sa brasserie, nombre de joueurs humains (1 à 4), niveau des IA, rythme (en direct ou en différé) et temps pour jouer. Les places sans joueur sont tenues par l'ordinateur ; une place libre peut être reprise en cours de partie avec le code.
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
