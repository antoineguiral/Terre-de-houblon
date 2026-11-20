# Le matériel de Brassins à imprimer en 3D

Tout est généré par `pintes.py` (`python3 docs/prototype/pintes/pintes.py`, dépend de trimesh, shapely, mapbox_earcut, matplotlib). Les verres sont aussi dans `pintes.scad` pour OpenSCAD.

## Jetons Bière
Une silhouette de verre par style, à plat, 3 mm d'épaisseur, 20 × 27 mm : pinte (Blonde), tulipe (IPA), chope (Stout), calice (Bière de garde). Chanfrein de 0,7 mm et mousse en relief de 0,6 mm sur le dessus.
- `pinte-<style>.stl` : un jeton.
- `plaque-<style>-24.stl` : 24 jetons d'une forme plus le marqueur de prix du style, 152 × 123 mm : une plaque par couleur de filament.
- `plateau-48.stl` : 12 de chaque, par bandes, pour une impression en une couleur.

## Pièces
Rondes, 18 mm, 2,5 mm, la valeur en relief et un bord. 60 × 1, 42 × 5, 42 × 10 : large, pour des parties où l'Argent s'accumule.
- `piece-1.stl`, `piece-5.stl`, `piece-10.stl` ; `plaque-pieces-1a.stl`, `plaque-pieces-1b.stl`, `plaque-pieces-5.stl`, `plaque-pieces-10.stl` (42 par plaque, 144 × 123 mm).

## Joueurs
- `ouvrier.stl` : meeple de 16 mm, 5 mm d'épaisseur, imprimé à plat, se tient debout.
- `pion-brasserie.stl` : bouteille de 22 mm pour la piste de réputation, pied de 7 mm.
- `plaque-joueur.stl` : 3 ouvriers + 1 pion, à imprimer quatre fois, une par couleur de joueur (rouge, bleu, jaune, blanc comme en ligne).

## Marqueurs
- `marqueur-prix.stl` : petit fût à plat, 10 × 12 mm ; déjà sur chaque plaque de style.
- `marqueur-saison.stl` : disque de 14 mm avec un cône de houblon en relief, pour le calendrier.

Impression : 0,2 mm de couche, 3 périmètres, pas de support. Les silhouettes fines (pied du calice et de la tulipe, anse de la chope) sont le point à surveiller à la première impression.
