# Jetons Bière à imprimer en 3D

Une silhouette de verre par style, à plat, 3 mm d'épaisseur, 20 × 27 mm environ : pinte pour la Blonde, tulipe pour l'IPA, chope pour le Stout, calice pour la Bière de garde. Le dessus a un chanfrein de 0,7 mm et la mousse en relief de 0,6 mm, pour distinguer le dessus du dessous et sentir le style au doigt.

- `pinte-<style>.stl` : un jeton par style.
- `plaque-<style>-24.stl` : 24 jetons d'une même forme, 6 × 4, 156 × 128 mm : une plaque par couleur de filament.
- `plateau-48.stl` : 12 de chaque, par bandes, pour changer de filament entre les styles (ou imprimer en une couleur et peindre la mousse).
- `pintes.scad` : la même chose dans OpenSCAD, pour retoucher les formes, l'épaisseur ou le relief.
- `pintes.py` : génère tout (`python3 docs/prototype/pintes/pintes.py`, dépend de trimesh, shapely, mapbox_earcut, matplotlib).

Impression : 0,2 mm de couche, 3 périmètres, pas de support. Un jeton pèse moins d'un gramme et se fait en deux ou trois minutes ; les 48 tiennent sur un plateau de 160 × 130 mm.
