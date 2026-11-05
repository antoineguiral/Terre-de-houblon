# Brassins — note de conception de la version table

*2 à 4 joueurs, 12 saisons (3 ans), 45 à 60 minutes. Écrite avant le code, avec une simulation Python (`simulation-table.py`) ; le moteur de `moteur/` la suit, et `outils/simulation.js` la rejoue avec la vraie IA. Les règles pour les joueurs sont dans `regles.md`, et le prototype à imprimer (plateau, cartes, fiches) dans `prototype/brassins-prototype.pdf`.*

La première version de Brassins, sur plateau hexagonal, est gardée sur la branche `brassins-hex` : trop lourde (7 recettes, 5 matières, routes de tournée), pas transposable sur table, et chacun y jouait dans son coin. Cette version repart de ce constat : un plateau commun de pose d'ouvriers, des clients en cartes, des prix partagés.

## Le principe

Chacun tient une brasserie. À chaque saison, on envoie ses ouvriers sur le plateau commun : récolter, acheter, brasser, livrer. Une case ne reçoit qu'un ouvrier par saison, donc ce que tu prends, l'autre ne l'a pas. Les clients sont des cartes en file commune : livrer, c'est prendre la carte. La brasserie la plus réputée au bout de trois ans l'emporte.

## Dans la boîte

- **1 plateau** : 10 cases d'action, la file des clients (5 emplacements), 4 pistes de prix (une par style), la piste de réputation, la piste des 12 saisons.
- **2 dés de saison** (météo et événement), 1 dé de brassage, et la table des événements imprimée sur le plateau.
- **40 cartes Client** (bars, caves, festivals).
- **4 plateaux Brasserie** : 4 emplacements de fermenteur (2 ouverts au départ), la cuve, 6 cases d'équipement.
- **Pions** : 3 ouvriers par joueur (2 au départ), 1 marqueur de réputation par joueur, 4 marqueurs de prix, 1 marqueur de premier joueur.
- **Jetons** : Malt, Houblon (cubes de 2 couleurs), Argent (pièces 1 et 5), bière en 4 couleurs (une par style), 4 dés de fermentation.
- **4 tuiles Recette** et **5 tuiles Équipement** par joueur.

Deux matières, quatre styles, une monnaie. C'est tout.

## Les recettes

| Style | Malt | Houblon | Fermentation | Prix de base | Réputation | Condition |
|---|---|---|---|---|---|---|
| Blonde | 2 | 1 | 1 saison | 3 | 1 | – |
| IPA | 2 | 2 | 2 saisons | 5 | 2 | – |
| Stout | 3 | 1 | 2 saisons | 6 | 3 | Touraille |
| Bière de garde | 4 | 1 | 3 saisons | 7 | 4 | – |

Un brassin donne 2 unités (3 avec la grande cuve). Les extensions (sours aux fruits, lambics, bières de Noël) ajoutent une tuile Recette et, s'il le faut, une matière.

## Le plateau : les cases d'action

Une case pleine = un ouvrier par saison, premier arrivé, premier servi. Les cases en pointillé (Marché aux bières, Chantier) accueillent tout le monde.

| Case | Ce qu'on y fait |
|---|---|
| **Champ d'orge** (×2, identiques) | Malt : 3 au printemps, 4 en été et en automne, fermé l'hiver |
| **Houblonnière** (×2, identiques) | Houblon : 2 au printemps et en été, 4 en automne, fermé l'hiver |
| **Marché aux matières** | acheter jusqu'à 3 matières : Malt 2, Houblon 2 |
| **Tournée** (une place par joueur) | livrer 1 client de la file ; le premier posé choisit en premier |
| **Marché aux bières** | vendre autant d'unités qu'on veut au prix de la piste |
| **Chantier** | acheter 1 équipement |

Brasser ne demande pas d'ouvrier : à tout moment de son tour, si on a la recette et un fermenteur libre, on brasse, et on lance le **dé de brassage** : 1 = brassin raté, 1 unité en moins ; 6 = cuvée exceptionnelle, 1 unité en plus. La météo de la carte Saison modifie les champs et les houblonnières.

## Les clients

Cinq cartes face visible. Chaque carte dit : le style voulu (ou « n'importe lequel »), le nombre d'unités (1 ou 2), ce qu'elle paie en Argent, ce qu'elle rapporte en Réputation.

- **Bars** (la moitié du paquet) : 1 unité, paie le prix de base, 1 à 2 Réputation.
- **Caves** : Stout ou Bière de garde, paie +3, 3 à 4 Réputation.
- **Festivals** : 2 unités d'un style, marqués d'une saison ; livrés pendant cette saison, +2 Réputation.

Livrer, c'est prendre la carte et la poser devant soi ; on complète la file aussitôt. **À la fin de chaque saison, la carte la plus à gauche est défaussée** : les clients n'attendent pas. Si un style est en demande sur la carte Saison, ses clients donnent +1 Réputation.

## Le Marché aux bières

Une piste par style, de 1 à 7, avec le prix de base marqué. Chaque unité vendue descend le marqueur d'un cran, pour tout le monde. À la fin de la saison, chaque marqueur remonte d'un cran vers sa base. Un style en demande se vend +2.

## Les équipements

| Équipement | Coût | Effet |
|---|---|---|
| Grande cuve | 6 | 3 unités par brassin |
| Fermenteur | 4 (deux fois au plus) | un fermenteur de plus |
| Touraille | 4 | permet le Stout |
| Embauche | 7 | un troisième ouvrier |
| Salle de dégustation | 7 | chaque saison, vendre 1 unité au prix de base +1 sans ouvrier ; chaque hiver, +1 Réputation |

## Une saison

1. **Les dés.** Le premier joueur lance le dé météo (1 : champs et houblonnières −1 ; 6 : +1 ; sinon normale) et le dé événement, lu dans la colonne de la saison : 1 et 2 rien, puis quatre événements propres à chaque saison (mildiou, contamination, critique gastronomique, brasseur invité au printemps ; canicule, fête de la bière, pénurie, inspection en été ; belle récolte, commande de la mairie, concours, salon en automne ; grève des transporteurs, douanes, Marché de Noël, fête au village en hiver). Les styles en demande sont fixes par saison : Blonde et IPA au printemps et en été, Stout et IPA en automne, Stout et Garde en hiver.
2. **Les brassins mûrs sortent** des fermenteurs (dé à 0) : bière en stock.
3. **Pose des ouvriers.** Le premier joueur tourne d'un cran à chaque saison, puis vers la gauche. Chacun à son tour pose **un** ouvrier et fait l'action tout de suite, brasse s'il veut, propose un échange s'il veut (matières, bière, Argent, une offre par tour de pose). On continue jusqu'à ce que tous les ouvriers soient posés. Un joueur sans ouvrier passe.
4. **Fin de saison.** Les dés de fermentation baissent de 1. Les prix remontent d'un cran. Le client le plus à gauche est défaussé. On ne peut pas garder plus de 6 unités en stock : le surplus est vendu au Marché, au prix de la piste. Les ouvriers reviennent.

## Mise en place et fin

Départ : 4 Malt, 2 Houblon, 5 Argent, 2 ouvriers, 2 fermenteurs. Cinq clients face visible. Premier joueur tiré au sort ; **le dernier joueur de la première saison commence avec 1 Réputation**.

Après l'hiver de l'an 3 : Réputation + diversité (3 styles brassés +2, les 4 : +5) + 1 point par 8 Argent. La bière restante ne vaut rien. Égalité : le plus riche.

## Ce que ça change par rapport à la version écran

- **L'interaction est à chaque pose** : la grande houblonnière prise, le bon client raflé, le Stout vendu avant toi qui fait chuter ton prix.
- **Trois choses à suivre sur table** : les dés de fermentation, les 4 pistes de prix, la file de clients. Plus aucune carte à lire à part les clients. Le reste est dans les mains des joueurs.
- **Le plateau sert tout le temps**, et il tient sur une feuille A3.
- **Un tour, c'est une décision** : où poser cet ouvrier-là, sachant que les autres regardent la même file de clients.

## Ce que la simulation a tranché (2 000 parties à 4)

- Deux Tournées communes étouffaient le jeu (24 livraisons par partie pour tous) : une place par joueur, le premier posé choisit en premier.
- Marché aux bières et Chantier bloqués empêchaient tout investissement : ils sont ouverts à tous.
- Grand et petit champ, plus un kit de départ au seuil d'une Blonde, donnaient 49 % de victoires au premier joueur de l'an 1 : cases égales, 4 Malt au départ. Résultat 23 / 24 / 25 / 28 % selon le rang au premier tour.
- « Le moins réputé commence » ne corrigeait rien : remplacé par une rotation, plus simple.
- La Levure n'apportait aucune décision (on en a toujours) et le Camion n'était jamais acheté : retirés.
- Les saisons aux dés (500 parties) : 27 / 28 / 23 / 22 % selon le rang, score moyen 36, écart premier-dernier 15 ; chaque événement sort une fois sur deux par partie, la grève et la pénurie ne bloquent personne.
- Le rang au premier tour laissait un écart résiduel (26 / 26 / 26 / 22 % sur 3 000 parties) : toute compensation en matières ou en Argent capitalise et fait basculer l'avantage de l'autre côté ; 1 Réputation au dernier joueur de la première saison donne 25 / 25 / 24,5 / 25,5 %.
- Le dé de brassage (500 parties) : un raté et une cuvée exceptionnelle par joueur et par partie en moyenne, écart-type des scores de 8,3 à 8,6, équilibre inchangé.
- Les quatre styles sont brassés (Blonde 2,1, IPA 0,7, Stout 2,6, Garde 2,5 par joueur et par partie).

## À tester sur table

- Si poser un ouvrier est une vraie décision à chaque fois, et si les joueurs se parlent.
- La file à 5 clients : la moitié des clients pourrissent sans être livrés. Si c'est frustrant, défausser un client sur deux saisons seulement.
- L'IPA reste le style le moins brassé.
- Le rythme d'argent : un équipement toutes les deux saisons environ en milieu de partie.
- La Bière de garde à 3 saisons : est-ce que quelqu'un la brasse en fin de partie ?

## Ce que dit le moteur JavaScript (500 parties à 4, IA Compagnon)

Même jeu, vraie IA, échanges compris (`npm run simulation -- 500 compagnon 4`) :

- Score moyen 41,5 (écart-type 9), écart premier-dernier 14,5. Réputation 27, diversité 4, Argent 11 points.
- Victoires selon le rang au premier tour : 24 / 31 / 19 / 27 %. Le troisième joueur de l'an 1 reste défavorisé, avec cette IA déterministe ; à deux, 46 / 54 % pour le second. À surveiller sur table avant de toucher aux règles.
- 10,6 brassins par joueur : Blonde 2,8, IPA 1,2, Stout 2,7, Garde 3,8. L'IPA reste le style le moins brassé, la Garde le plus : l'IA brasse pour les caves et le décompte, pas pour le marché.
- 6 clients livrés par joueur (bars 3,2, festivals 1,6, caves 1,2) ; 12 clients par partie partent sans être livrés.
- 15 unités par joueur vendues au Marché à 3,6 en moyenne ; 0,2 ouvrier perdu par joueur et par partie ; 1,1 échange conclu.
- Équipements : Grande cuve 100 %, 1,6 fermenteur de plus en moyenne, Embauche 85 %, Touraille 69 %, Salle 44 %.
- Chaque événement sort une fois sur deux par partie.

Les valeurs sont des points de départ. Jouer d'abord ; simuler ensuite si on hésite entre deux réglages (`npm run simulation`, ou `simulation-table.py` pour une variante rapide sans IA).
