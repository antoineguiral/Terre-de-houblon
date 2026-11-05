# Brassins

Jeu de gestion de brasserie, par pose d'ouvriers. On récolte, on brasse, on fait fermenter, on livre les clients de la file et on vend au marché, sur un plateau commun où chaque place prise manque aux autres. Trois ans de quatre saisons, et la brasserie la plus réputée l'emporte. Seul contre l'ordinateur, ou à plusieurs, en direct ou en différé. Les règles sont pensées pour tenir sur une table : un plateau A3, trois dés, quarante cartes.

Issu de [Terres de Houblon](https://github.com/antoineguiral/Terre-de-houblon), dont il garde l'architecture (moteur séparé de l'affichage, serveur arbitre, client réseau, déploiement) avec des règles entièrement nouvelles. La première version de Brassins, sur plateau hexagonal, est sur la branche `brassins-hex` ; Terres de Houblon sur la branche `terres-de-houblon`.

## Les règles

- **Le plateau.** 8 cases d'action : deux champs d'orge, deux houblonnières (deux places chacun, le second récolte un de moins, fermés l'hiver), le Marché aux matières, la Tournée (une place par joueur), le Marché aux bières et le Chantier (ouverts à tous).
- **Une saison.** Le premier joueur lance deux dés : la météo (1 : récoltes −1, 6 : +1) et l'événement, lu dans la table de la saison (mildiou, contamination, critique gastronomique, canicule, pénurie, concours, douanes, grève…). Puis chacun à son tour pose un ouvrier et agit aussitôt, jusqu'à ce que tous soient posés. Le premier joueur tourne à chaque saison.
- **Brasser.** 4 styles, de la Blonde (1 saison, 3 Argent, 1 réputation) à la Bière de garde (3 saisons, 7 Argent, 4 réputation), le Stout avec une Touraille. Deux matières : Malt et Houblon. Un brassin donne 2 unités (3 avec la Grande cuve), et un dé : 1 c'est une unité en moins, 6 une de plus. La première fois qu'on brasse un style : +1 réputation.
- **Les clients.** 40 cartes, 5 en file sous les yeux de tous : bars, caves, festivals liés à une saison. Livrer, c'est prendre la carte. Le plus ancien part à chaque fin de saison.
- **Le Marché aux bières.** Une piste de prix par style : chaque unité vendue baisse le prix d'un cran, pour tout le monde ; les prix remontent d'un cran par saison. Deux styles en demande par saison : +2 au Marché, +1 réputation chez un client.
- **S'équiper.** Grande cuve, fermenteurs, Touraille, Embauche, Salle de dégustation.
- **Les échanges.** Une offre par tour aux autres brasseries, en matières, bière ou Argent.
- **Le décompte.** Réputation + diversité (3 styles +2, 4 styles +5) + 1 point par 8 Argent.

Toutes les valeurs sont dans [`moteur/constantes.js`](moteur/constantes.js). Elles sortent de la simulation (voir [`docs/conception-table.md`](docs/conception-table.md)), à affiner en jouant : l'ordre au premier tour garde un léger biais, et l'IPA est le style le moins brassé par l'IA. Les règles pour les joueurs, telles qu'on les expliquerait à table : [`docs/regles.md`](docs/regles.md).

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
- `viewFor(état, joueur)` masque la graine et l'ordre de la pioche des clients (tout le reste est public) ;
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
