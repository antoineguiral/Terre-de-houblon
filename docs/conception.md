# Brassins : conception et règles de référence

Document de conception écrit avant le code, avec les résultats de la première campagne de simulation (`simulation-initiale.py`, Python). Les règles implémentées dans `moteur/` suivent ce document, à une différence près : au lieu de perdre les unités en trop, on ne peut pas finir son tour avec plus de 6 unités en stock.


## Contexte

Ce dépôt est un fork de `antoineguiral/Terre-de-houblon`, dans sa version multijoueur. Commence par lire le code pour comprendre ce qui existe : un moteur de jeu pur en JS (état sérialisable, `applyAction`, `viewFor`, IA), un serveur Node en WebSocket qui fait l'arbitre et persiste les parties, un client sur GitHub Pages, un mode solo sans serveur, des parties en direct et en différé avec notifications, un déploiement sur mon serveur OVH documenté dans `DEPLOIEMENT.md`.

**Garde toute cette architecture. Remplace les règles.** Terres de Houblon était une transposition de Catane dans l'univers de la brasserie : collecte de ressources aux dés, bâtiments sur les sommets, voleur sur le 7, route la plus longue. Brassins doit être un jeu à part entière, de production et de vente, où l'on brasse des recettes, où la fermentation prend du temps, et où l'on vend sur un marché qui bouge. Je suis brasseur, et je veux un jeu qui n'aurait pu être conçu que par un brasseur.

Garde l'identité visuelle actuelle (palette cuivre et bois, typographies, plateau SVG hexagonal), le ton des textes en français, et les fonctions déjà acquises : solo contre l'ordinateur, création de partie avec code, places tenues par l'IA, reprise après coupure, direct et différé.

Toutes les valeurs numériques ci-dessous sont des **valeurs de départ**. Elles sortent d'une première campagne de simulation (voir « Équilibrage », et le fichier `simulation/brassins.py` fourni avec ce document), qui a déjà corrigé les défauts les plus gros. Elles restent à affiner par simulation avec une vraie IA, et je veux qu'elles soient centralisées dans un seul fichier de constantes, pour qu'on puisse les ajuster sans toucher au moteur.

## Les règles

### Vue d'ensemble

2 à 4 brasseries, chacune tenue par un joueur ou par l'ordinateur. La partie dure **3 ans de 4 saisons, soit 12 tours**. À chaque saison, les terroirs produisent, puis chacun achète, brasse, fait fermenter, livre et agrandit sa brasserie. À la fin du troisième hiver, la brasserie qui a le plus de **réputation** gagne.

### Le plateau

Une carte hexagonale de 19 cases (rayon 2), entourée de 6 foires sur la côte.

- **Le Bourg**, au centre. Il abrite le Marché et deux clients, le Bar du Bourg et la Cave du Bourg.
- **3 Villages**, placés sur l'anneau extérieur, espacés. Chacun abrite un client, le bar du village.
- **15 terroirs** répartis au hasard sur les cases restantes : 6 Champs d'orge, 5 Houblonnières, 4 Sources.
- **6 Foires** sur la côte, une par direction, chacune liée à une saison : Fête de la bière (Été), Fête des moissons (Été), Foire d'automne (Automne), Marché de Noël (Hiver), Fête de la Saint-Vincent (Hiver), Festival de printemps (Printemps). Une foire n'achète que pendant sa saison.

**Chaque joueur a une seule brasserie**, posée au début sur une case terroir libre, n'importe laquelle. La case de la brasserie **continue de produire** pour son propriétaire et pour les brasseries voisines, et les 6 cases voisines l'approvisionnent aussi. Pas de règle de distance entre brasseries : deux brasseries peuvent être voisines, elles partagent alors les cases communes sans se gêner. Le placement se fait dans l'ordre inverse de l'ordre de jeu du premier tour.

(Les simulations ont montré que la règle « pas voisine d'une autre brasserie ni d'un village » est inapplicable sur 19 cases, et qu'une case de brasserie qui ne produit plus condamne le dernier à se placer. Ne pas les réintroduire.)

### Les ressources

Quatre matières : **Malt**, **Houblon**, **Levure**, **Eau**. Une matière dérivée : **Malt torréfié**, fabriqué à la brasserie. Et de l'**Argent**.

Production par case voisine, selon la saison :

| Terroir | Printemps | Été | Automne | Hiver |
|---|---|---|---|---|
| Champ d'orge → Malt | 0 | 3 | 2 | 0 |
| Houblonnière → Houblon | 0 | 2 | 3 | 0 |
| Source → Eau | 3 | 0 | 2 | 1 |

En plus, chaque brasserie a un puits : **+1 Eau par saison**. La levure ne pousse pas dans les champs : on la récupère en fin de fermentation (voir plus bas), on l'achète au Marché, ou on l'entretient au Labo.

Pas de limite de main pour les matières. Le **stock de bière** est limité à **6 unités**, vérifié **à la fin du tour du joueur** : ce qui dépasse à ce moment-là est perdu. Les brassins qui arrivent en stock au début de la saison peuvent donc dépasser la limite, à charge pour le joueur de vendre pendant son tour.

### Les recettes

Brasser, c'est choisir un style, payer la recette et occuper un fermenteur libre. Chaque brassin produit un nombre d'**unités** qui dépend de la cuve (2 au départ). La fermentation dure un nombre de saisons selon le style. Quand elle se termine, les unités vont en stock et le joueur **récupère 1 Levure** (repiquage).

| Style | Malt | Houblon | Levure | Eau | Malt torréfié | Fermentation | Prix de base au Marché | Réputation client |
|---|---|---|---|---|---|---|---|---|
| Blonde | 2 | 1 | 1 | 1 | 0 | 1 saison | 3 | 1 |
| Blanche | 1 | 1 | 1 | 2 | 0 | 1 | 3 | 1 |
| IPA | 2 | 3 | 1 | 1 | 0 | 2 | 5 | 2 |
| Ambrée | 2 | 1 | 1 | 1 | 1 | 2 | 4 | 3 |
| Stout | 1 | 1 | 1 | 1 | 2 | 2 | 6 | 3 |
| Lager | 2 | 1 | 1 | 2 | 0 | 2 | 4 | 3 |
| Bière de garde | 3 | 1 | 1 | 1 | 1 | 3 | 7 | 4 |

La Lager exige une Chambre froide. Le Malt torréfié vient d'une Touraille ou du Marché.

**La première fois qu'un joueur brasse un style, il gagne 1 Réputation.**

### La fermentation

- Chaque brasserie commence avec **2 fermenteurs**, maximum 5.
- Un brassin occupe un fermenteur pendant toute sa fermentation. Les fermentations avancent d'une saison **à la fin de chaque tour**, pour tout le monde en même temps.
- Un brassin terminé passe en stock au début de la saison suivante, et libère le fermenteur.
- Une Blonde brassée au Printemps est donc en stock à l'Été, une Bière de garde brassée au Printemps est en stock en Hiver.

### La brasserie et ses améliorations

Les améliorations s'achètent en Argent, une fois chacune sauf indication, à n'importe quel moment de son tour.

| Amélioration | Coût | Effet |
|---|---|---|
| Cuve niveau 2 | 8 | 3 unités par brassin |
| Cuve niveau 3 | 14 | 4 unités par brassin (exige niveau 2) |
| Fermenteur supplémentaire | 6 chacun | +1 fermenteur, jusqu'à 5 |
| Touraille | 7 | Une fois par saison, transformer 2 Malt en 1 Malt torréfié |
| Chambre froide | 6 | Permet les Lagers ; protège de la Canicule |
| Labo | 6 | +1 Levure et +1 Houblon par saison (une culture de levure, un séchoir à houblon) ; protège de la Contamination |
| Camion | 8 | Les tournées coûtent 1 Argent par case au lieu de 2 ; livraison de 2 unités par client et par saison au lieu de 1 |
| Salle de dégustation | 10 | Vend jusqu'à 2 unités par saison au prix de base +1, sans client ni tournée, et rapporte 1 Réputation à chaque Hiver |

(Supprimés après simulation parce que personne ne les achetait : Puits profond, Touraille niveau 2, Cave.)

### Le Marché

Le Marché, au Bourg, est accessible à tous sans tournée.

**Achat de matières**, à prix fixe : Malt 2, Houblon 2, Levure 3, Eau 1, Malt torréfié 5.

**Vente de bière**, en quantité illimitée, au **prix courant** du style. Chaque style a un prix courant qui part de son prix de base. À chaque unité vendue, le prix courant du style **baisse de 1** (plancher 1). À la fin de chaque saison, chaque prix courant **remonte de 1** vers son prix de base, sans le dépasser. Quand la carte Saison met un style **en demande**, son prix courant est majoré de 2 pendant la saison.

Vendre au Marché rapporte de l'Argent, jamais de Réputation.

### Les clients et les tournées

Les clients sont sur la carte : Bar du Bourg, Cave du Bourg, les 3 bars de village, les 6 foires.

Pour livrer un client, il faut d'abord **ouvrir une tournée** vers lui : coût unique de **2 Argent par case de distance** entre sa brasserie et le client (1 avec le Camion). Au début de la partie, chaque joueur ouvre gratuitement une tournée vers un client à 2 cases ou moins.

Une fois la tournée ouverte, on peut livrer ce client à chaque saison, dans la limite de sa capacité et de la sienne (1 unité par client et par saison, 2 avec le Camion). Une livraison rapporte l'Argent du client et la **Réputation du style** (dernière colonne du tableau des recettes), avec **+1 Réputation si le style est en demande** cette saison.

| Client | Capacité par saison (tous joueurs) | Paie | Particularité |
|---|---|---|---|
| Bar du Bourg | 3 | Prix de base +1 | Tous styles |
| Cave du Bourg | 2 | Prix de base +3 | Ambrée, Stout, Lager, Bière de garde seulement |
| Bar de village (×3) | 2 | Prix de base | Deux styles préférés tirés au sort au début de la partie ; les autres styles paient le prix de base −1 et rapportent 0 Réputation |
| Foire (×6) | 4 | Prix de base +2 | Seulement pendant sa saison ; +1 Réputation par livraison |

La capacité d'un client se consomme dans l'ordre de jeu de la saison. **Le premier joueur de chaque saison est celui qui a le moins de Réputation** (égalité : le moins d'Argent, puis au hasard), puis on tourne vers la gauche à partir de lui.

(Ne pas remplacer par une rotation simple « le premier joueur passe à gauche » : à 4 joueurs et 4 saisons, chacun jouerait toujours premier dans la même saison, et celui qui a l'Hiver gagne une partie sur deux. Mesuré en simulation.)

### La pioche des saisons

12 cartes, 3 par saison. Au début de chaque année, on mélange les 3 cartes de chaque saison et on en révèle une par saison, dans l'ordre Printemps, Été, Automne, Hiver. Sur 3 ans, chaque carte sort exactement une fois : les joueurs savent ce qui reste possible.

Chaque carte indique :

- une **météo** qui modifie la production de la saison ;
- deux **styles en demande** (prix du Marché +2, +1 Réputation chez les clients) ;
- parfois un **événement**.

Les 12 cartes :

| Saison | Carte | Météo | En demande | Événement |
|---|---|---|---|---|
| Printemps | Printemps doux | aucune | Blanche, Blonde | — |
| Printemps | Printemps pluvieux | Sources +1 | Blonde, Lager | — |
| Printemps | Printemps froid | Sources −1 | Ambrée, Stout | **Contamination** : chaque joueur sans Labo choisit un fermenteur occupé, le brassin perd 1 unité |
| Été | Bel été | aucune | Blonde, IPA | — |
| Été | Canicule | Sources 0 | Blanche, Lager | **Canicule** : chaque joueur sans Chambre froide perd 1 unité sur un brassin en cours, à son choix |
| Été | Été orageux | Champs d'orge −1 | IPA, Blanche | — |
| Automne | Belle récolte | Houblonnières +1 | IPA, Ambrée | — |
| Automne | Automne humide | aucune | Ambrée, Stout | **Concours régional** : chaque joueur présente 1 unité de son stock, qui est consommée. Score = Réputation client du style, +1 si en demande. Le meilleur gagne 5 Réputation, le deuxième 2. Égalité : chacun prend le lot |
| Automne | Automne sec | Houblonnières −1 | Bière de garde, IPA | — |
| Hiver | Hiver tranquille | aucune | Stout, Bière de garde | — |
| Hiver | Hiver rude | Sources −1 | Ambrée, Bière de garde | **Contrôle des douanes** : chacun paie 1 Argent par tranche de 3 unités en stock |
| Hiver | Hiver de fête | aucune | Blonde, Stout | **Fête au village** : la capacité des 3 bars de village est doublée cette saison |

La production ne descend jamais sous 0 par case.

### Déroulé d'une saison

1. **Saison.** On révèle la carte. Chaque brasserie reçoit la production de ses cases voisines, modifiée par la météo, plus son puits et son Labo. Les brassins terminés passent en stock et rendent 1 Levure. L'événement s'applique.
2. **Tour des joueurs**, dans l'ordre à partir du premier joueur. Pendant son tour, un joueur fait autant d'actions qu'il veut, dans l'ordre qu'il veut : acheter ou vendre au Marché, torréfier, brasser, ouvrir une tournée, livrer, améliorer sa brasserie, proposer un échange. Puis il passe.
3. **Fin de saison.** Les fermentations avancent d'une saison. Les prix du Marché remontent de 1 vers leur base. Le premier joueur de la saison suivante est désigné (le moins réputé).

À la fin du tour de chaque joueur, son stock est ramené à 6 unités, les unités en trop sont perdues. L'interface doit le prévenir avant qu'il termine son tour avec un stock qui dépasse.

### Les échanges entre joueurs

Repris du jeu actuel : une proposition envoyée à tous, chacun accepte, refuse ou contre-propose, le proposant choisit avec qui conclure. On peut y mettre des matières, des unités de bière et de l'Argent. Les règles de délai en différé restent celles déjà en place.

### Mise en place

Chaque joueur commence avec 4 Malt, 2 Houblon, 2 Levure, 2 Eau, 6 Argent, 2 fermenteurs, une cuve de niveau 1, un stock de 6 unités, et une tournée gratuite vers un client à 2 cases ou moins. Le premier joueur de la première saison est tiré au sort.

### Fin de partie et décompte

Après le tour de l'Hiver de l'an 3 :

- la Réputation accumulée ;
- **+ bonus de diversité** selon le nombre de styles différents brassés dans la partie : 3 styles +2, 5 styles +5, 7 styles +9 ;
- **+ 1 point par 8 Argent**, arrondi à l'inférieur. La bière invendue ne vaut rien.

En cas d'égalité, le plus d'Argent l'emporte, puis le plus d'unités en stock.

## Ce que j'attends

### Moteur

- Un nouveau moteur pur, selon les mêmes principes que l'actuel : état JSON, générateur aléatoire à graine dans l'état, `applyAction` qui valide ou refuse avec une raison, liste des actions légales, `viewFor` qui masque ce qu'un joueur ne doit pas voir. Ici, presque tout est public : les matières, le stock, les fermenteurs et les améliorations des autres sont visibles. Seules la pioche des saisons restante et la graine sont cachées.
- Les décisions simultanées (Contamination, Canicule, Concours) sont des décisions en attente pour chaque joueur concerné, comme la défausse l'était.
- Toutes les constantes (tableaux ci-dessus, coûts, capacités) dans un seul fichier.
- Tests : règles unitaires et parties complètes IA contre IA sur plusieurs graines, jusqu'au décompte, sans action illégale ni blocage.

### IA

Une IA à réécrire entièrement. Elle doit raisonner sur un horizon de quelques saisons : ce que ses cases vont produire, quels styles seront en demande parmi les cartes restantes, quand ses fermenteurs se libèrent, et ce qu'une amélioration lui rapporte d'ici la fin de partie. Une évaluation d'état avec recherche à faible profondeur suffit. Elle doit savoir négocier avec les mêmes principes que l'actuelle. Je veux trois niveaux, au moins pour le solo : Apprenti, Compagnon, Maître brasseur.

### Équilibrage

Les règles ci-dessus ont déjà été passées au simulateur `simulation/brassins.py` (Python, IA gloutonne à trois profils, sans échanges entre joueurs). Mets ce fichier dans le dépôt tel quel, comme témoin. État mesuré sur 200 parties à 4 joueurs :

- score moyen 102, écart-type 20, écart premier-dernier 41 ;
- victoires par siège 27 / 26 / 26 / 20 %, premier joueur de la partie 20 % ;
- 18 brassins par joueur, fermenteurs occupés 86 % du temps ;
- styles : IPA 5,2, Blanche 3,9, Blonde 3,3, Lager 2,0, Stout 1,9, Bière de garde 1,1, Ambrée 1,0 ;
- ventes : clients 32 unités, Marché 17, Salle 6 ;
- points : livraisons 70, Argent 15, premières 6, diversité 6, Concours 4, Salle 2 ;
- toutes les améliorations restantes sont achetées par 31 % (Chambre froide) à 100 % des joueurs.

Points connus qui restent à régler avec une meilleure IA : l'IPA reste le style le plus brassé (28 %), l'Ambrée est en retrait, et le profil « vend tout au Marché » gagne un peu plus souvent (29 %) que le profil « attend ses clients » (19 %). À 2 joueurs, le second à se placer gagne 59 %, à voir si c'est la Réputation de départ égale (le premier joueur du tour 1 est tiré au sort) ou l'emplacement.

Deux leviers à manier avec précaution, mesurés : l'Argent de départ (+6 Argent à un joueur le fait gagner 42 % des parties, +12 le fait gagner 86 %) et le nombre de fermenteurs de départ (3 au lieu de 2 laisse les fermenteurs vides faute de matières).

Avant de me livrer la première version jouable, refais tourner des milliers de parties avec ta propre IA et mesure les mêmes indicateurs. Un style ou une amélioration que personne ne prend jamais est un défaut de réglage. Propose-moi des ajustements de constantes chiffrés avec les résultats, et attends mon accord avant de les appliquer. Mets tes scripts de simulation dans le dépôt à côté du témoin.

### Client

- Même identité visuelle. Le plateau hexagonal reste le centre de l'écran. La brasserie de chaque joueur se lit sur une fiche : fermenteurs avec les brassins en cours et leur compte à rebours, stock par style, améliorations acquises.
- Le Marché doit être lisible d'un coup d'œil : les 7 styles, prix courant, prix de base, styles en demande.
- Un calendrier des 12 saisons avec les cartes déjà révélées et celles encore possibles.
- Une page de règles dans le jeu, rédigée à partir de ce document.
- Textes en français, dans le ton actuel.

### Déploiement

Ce jeu tourne à côté de Terres de Houblon sur le même serveur OVH, sous un autre sous-domaine que je te donnerai, avec son propre service et sa propre base. Mets à jour `DEPLOIEMENT.md`.

## Façon de travailler

- Avant de toucher au serveur ou à ce qui est en production, montre-moi les commandes et attends mon accord.
- Commence par lire le code existant et me poser tes questions sur les règles : là où ce document est ambigu ou incomplet, dis-le-moi plutôt que de décider seul. Pour l'équilibrage, en revanche, propose.
- Avance par étapes testables, dans cet ordre : moteur et tests, simulation et premier équilibrage, solo jouable, multijoueur, déploiement. Fais-moi tester à chaque étape.
- Commits clairs au fil de l'eau. Ne mentionne nulle part Catane ni aucun jeu existant, ni dans le code, ni dans le README, ni dans la description du dépôt.
