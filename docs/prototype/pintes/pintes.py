#!/usr/bin/env python3
"""Le matériel de Brassins à imprimer en 3D : jetons Bière (une silhouette de verre par style, à plat),
pièces d'Argent, ouvriers, pions Brasserie, marqueurs de prix et de saison.

    python3 docs/prototype/pintes/pintes.py

Écrit pintes.scad (les verres, paramétrables dans OpenSCAD), un STL par pièce, des plaques prêtes à
imprimer (une couleur par plaque) et apercu.png. Dépend de trimesh, shapely, mapbox_earcut, matplotlib.

Chaque jeton : la silhouette extrudée (EPAISSEUR), un chanfrein sur le dessus (CHANFREIN), et la
mousse en relief (RELIEF) pour sentir le style au doigt et distinguer le dessus du dessous.
"""
import json, math, os
import numpy as np
import trimesh
from shapely.geometry import Polygon
from shapely.ops import unary_union

ICI = os.path.dirname(os.path.abspath(__file__))
EPAISSEUR = 3.0      # mm
CHANFREIN = 0.7      # mm, retrait du dessus
RELIEF = 0.6         # mm, hauteur de la mousse
HAUTEUR = 28.0       # mm, hauteur d'un verre (largeur ≈ 20)

def arc(cx, cy, r, a0, a1, n=12):
    return [(cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))) for a in np.linspace(a0, a1, n)]

# Silhouettes (x, y) en mm, y vers le haut, base à y = 0. La mousse est un polygone séparé, posé sur le haut du verre.
def blonde():
    """Pinte conique : le verre de bistrot."""
    verre = [(-7, 0), (7, 0), (8, 1), (10, 24), (10, 26), (9, 27), (-9, 27), (-10, 26), (-10, 24), (-8, 1)]
    mousse = [(-10, 22)] + [(x, 25.5 + 1.5 * math.sin(x * 1.1)) for x in np.linspace(-10, 10, 14)] + [(10, 22)]
    return verre, mousse

def ipa():
    """Verre tulipe : ventre rond, col resserré, lèvre évasée."""
    droite = [(5, 0), (5, 1.2), (1.6, 2.2), (1.6, 4), (4, 5), (7.5, 8), (9, 12), (8.4, 16), (6.6, 19), (6.9, 22), (8.6, 25.5), (9.5, 27)]
    verre = droite + [(-x, y) for x, y in reversed(droite)]
    mousse = [(-9.5, 23)] + [(x, 26 + 1.4 * math.sin(x * 1.3 + 1)) for x in np.linspace(-9.5, 9.5, 14)] + [(9.5, 23)]
    return verre, mousse

def stout():
    """Chope à anse : droite, épaisse."""
    from shapely.geometry import Point, box
    corps = box(-8, 0, 6, 27)
    anse = Point(6, 13.5).buffer(7.5).difference(Point(6, 13.5).buffer(4.5)).intersection(box(6, 0, 20, 27))
    verre = unary_union([corps, anse])
    mousse = [(-8, 22)] + [(x, 25.5 + 1.5 * math.sin(x * 1.2 + 2)) for x in np.linspace(-8, 6, 12)] + [(6, 22)]
    return verre, mousse

def garde():
    """Verre à pied, calice : la bière qu'on garde."""
    pied = [(-7, 0), (7, 0), (7, 1.5), (1.8, 2.5), (1.8, 11)]
    bol_d = arc(0, 18, 9, -50, 90, 12)
    bol_g = [(-x, y) for x, y in reversed(bol_d)]
    # le calice est ouvert en haut : on coupe le cercle à y = 27
    bol_d = [(x, min(y, 27)) for x, y in bol_d if y <= 27.5]
    bol_g = [(x, min(y, 27)) for x, y in bol_g if y <= 27.5]
    verre = pied + [(1.8, 11)] + bol_d + [(0, 27)] + bol_g + [(-1.8, 11), (-1.8, 2.5), (-7, 1.5)]
    mousse = [(-9, 22)] + [(x, 25.5 + 1.5 * math.sin(x * 1.4)) for x in np.linspace(-9, 9, 14)] + [(9, 22)]
    return verre, mousse

STYLES = {'blonde': blonde, 'ipa': ipa, 'stout': stout, 'garde': garde}
COULEURS_JOUEURS = ['rouge', 'bleu', 'jaune', 'blanc']   # comme en ligne
PIECES = {1: 60, 5: 42, 10: 42}                           # valeurs et quantités (large : jusqu'à 200 Argent par joueur vus en partie)

def texte(t, taille):
    """Un texte en polygones (shapely), centré, pour les reliefs."""
    import matplotlib; matplotlib.use('Agg')
    from matplotlib.textpath import TextPath
    from matplotlib.font_manager import FontProperties
    path = TextPath((0, 0), t, size=taille, prop=FontProperties(family='DejaVu Sans', weight='bold'))
    polys = [Polygon(pts) for pts in path.to_polygons() if len(pts) > 2]
    # les trous (intérieur du 0, du 5…) sont les polygones contenus dans un autre
    ext = [q for q in polys if not any(o is not q and o.contains(q) for o in polys)]
    g = unary_union([q.difference(unary_union([o for o in polys if o is not q and q.contains(o)] or [Polygon()])) for q in ext])
    b = g.bounds
    from shapely.affinity import translate
    return translate(g, -(b[0] + b[2]) / 2, -(b[1] + b[3]) / 2)

def piece(valeur):
    """Pièce ronde de 18 mm, 2,5 mm, la valeur en relief sur le dessus, un bord en relief pour le doigt."""
    from shapely.geometry import Point
    d = Point(0, 0).buffer(9, resolution=32)
    corps = extrude(d, 2.0)
    bord = extrude(d.difference(Point(0, 0).buffer(7.8, resolution=32)), 0.5, 2.0)
    chiffre = extrude(texte(str(valeur), 9 if valeur < 10 else 7.5).buffer(0.15), 0.6, 2.0)
    return trimesh.util.concatenate([corps, bord, chiffre])

def meeple():
    """Ouvrier : silhouette de meeple, 16 mm de haut, 5 mm d'épaisseur, imprimé à plat, se tient debout."""
    droite = [(1.3, 0), (5.2, 0), (5.6, 1.2), (4.2, 5.6), (8.2, 6.6), (8.5, 9.2), (6.6, 9.6), (4.2, 8.6), (3.6, 10.2), (3.2, 11.6), (3.4, 13.2), (2.4, 15.3), (0, 16)]
    pts = droite + [(-x, y) for x, y in reversed(droite[:-1])] + [(0, 1.6)]
    return extrude(Polygon(pts).buffer(0.4, join_style=1).buffer(-0.4, join_style=1), 5.0)

def pion_brasserie():
    """Pion Brasserie pour la piste de réputation : une bouteille, 22 mm, pied de 6 mm, 6 mm d'épaisseur."""
    pts = [(-3.5, 0), (3.5, 0), (3.5, 11), (1.6, 15), (1.6, 20), (2.2, 20), (2.2, 22), (-2.2, 22), (-2.2, 20), (-1.6, 20), (-1.6, 15), (-3.5, 11)]
    return extrude(Polygon(pts).buffer(0.5, join_style=1).buffer(-0.5, join_style=1), 6.0)

def marqueur_prix():
    """Marqueur de prix : un petit fût à plat, 10 × 12 mm, 3 mm, à imprimer dans la couleur du style."""
    pts = [(-4, 0), (4, 0), (5, 2), (5, 10), (4, 12), (-4, 12), (-5, 10), (-5, 2)]
    corps = extrude(Polygon(pts), 2.4)
    cercles = extrude(Polygon([(-5, 3), (5, 3), (5, 4), (-5, 4)]).union(Polygon([(-5, 8), (5, 8), (5, 9), (-5, 9)])), 0.6, 2.4)
    return trimesh.util.concatenate([corps, cercles])

def marqueur_saison():
    """Marqueur de saison : un disque de 14 mm avec un houblon en relief, à poser sur le calendrier."""
    from shapely.geometry import Point
    d = Point(0, 0).buffer(7, resolution=32)
    cone = Polygon([(0, 5), (3, 2.5), (3.5, -1), (2, -4.5), (0, -5.5), (-2, -4.5), (-3.5, -1), (-3, 2.5)])
    return trimesh.util.concatenate([extrude(d, 2.4), extrude(cone, 0.6, 2.4)])

def grille(mesh, n, cols, pas_x, pas_y):
    out = []
    for i in range(n):
        c = mesh.copy(); c.apply_translation(((i % cols) * pas_x, (i // cols) * pas_y, 0)); out.append(c)
    return trimesh.util.concatenate(out)

def poly(p):
    return Polygon(p) if isinstance(p, list) else p

def extrude(g, h, z=0):
    parts = g.geoms if g.geom_type == 'MultiPolygon' else [g]
    out = []
    for q in parts:
        if q.is_empty or q.area < 0.5: continue
        e = trimesh.creation.extrude_polygon(q, h); e.apply_translation((0, 0, z)); out.append(e)
    return trimesh.util.concatenate(out)

def jeton(style):
    verre, mousse = STYLES[style]()
    v = poly(verre).buffer(0)
    m = poly(mousse).intersection(v.buffer(0.01))
    base = extrude(v, EPAISSEUR - CHANFREIN)
    haut = extrude(v.buffer(-CHANFREIN, join_style=2), CHANFREIN, EPAISSEUR - CHANFREIN)
    relief = extrude(m.buffer(-CHANFREIN, join_style=2), RELIEF, EPAISSEUR)
    return trimesh.util.concatenate([base, haut, relief]), v, m

def scad(formes):
    """Le même objet en OpenSCAD, pour qui veut retoucher les formes à la main."""
    out = ['// Jetons Bière de Brassins : une silhouette de verre par style, à plat. Généré par pintes.py, modifiable à la main.',
           f'epaisseur = {EPAISSEUR}; chanfrein = {CHANFREIN}; relief = {RELIEF};', 'style = "blonde"; // blonde, ipa, stout, garde', '']
    for st, (v, m) in formes.items():
        pts = lambda g: json.dumps([[round(x, 2), round(y, 2)] for x, y in list(g.exterior.coords)[:-1]])
        if v.geom_type == 'Polygon':
            out.append(f'module verre_{st}() {{ polygon({pts(v)}); }}')
        else:
            out.append(f'module verre_{st}() {{ union() {{ ' + ' '.join(f'polygon({pts(g)});' for g in v.geoms) + ' } }')
        out.append(f'module mousse_{st}() {{ polygon({pts(m)}); }}')
    out += ['', 'module jeton(st) {',
            '  linear_extrude(epaisseur - chanfrein) verre(st);',
            '  translate([0, 0, epaisseur - chanfrein]) linear_extrude(chanfrein) offset(delta = -chanfrein) verre(st);',
            '  translate([0, 0, epaisseur]) linear_extrude(relief) offset(delta = -chanfrein) mousse(st);',
            '}',
            'module verre(st) { if (st == "blonde") verre_blonde(); else if (st == "ipa") verre_ipa(); else if (st == "stout") verre_stout(); else verre_garde(); }',
            'module mousse(st) { if (st == "blonde") mousse_blonde(); else if (st == "ipa") mousse_ipa(); else if (st == "stout") mousse_stout(); else mousse_garde(); }',
            '', 'jeton(style);', '']
    return '\n'.join(out)

def apercu(formes):
    import matplotlib; matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import PathPatch
    from matplotlib.path import Path
    def MP(g, **kw):
        verts, codes = [], []
        for ring in [g.exterior, *g.interiors]:
            pts = list(ring.coords); verts += pts; codes += [Path.MOVETO] + [Path.LINETO] * (len(pts) - 1)
        return PathPatch(Path(verts, codes), **kw)
    COL = {'blonde': '#e8c15a', 'ipa': '#d98b3a', 'stout': '#2b1b14', 'garde': '#8a4b2a'}
    NOM = {'blonde': 'Blonde · pinte', 'ipa': 'IPA · tulipe', 'stout': 'Stout · chope', 'garde': 'Garde · calice'}
    fig, axes = plt.subplots(1, 4, figsize=(10, 3.4))
    for ax, (st, (v, m)) in zip(axes, formes.items()):
        for g in (v.geoms if v.geom_type == 'MultiPolygon' else [v]):
            ax.add_patch(MP(g, facecolor=COL[st], edgecolor='#2b1b14', lw=1.5))
        for g in (m.geoms if m.geom_type == 'MultiPolygon' else [m]):
            ax.add_patch(MP(g, facecolor='#f6eadb', edgecolor='#2b1b14', lw=1))
        ax.set_xlim(-16, 16); ax.set_ylim(-2, 30); ax.set_aspect('equal'); ax.axis('off'); ax.set_title(NOM[st], fontsize=10)
    fig.suptitle(f'Jetons Bière, vue de dessus · {EPAISSEUR} mm, mousse en relief de {RELIEF} mm', fontsize=10)
    fig.tight_layout(); fig.savefig(os.path.join(ICI, 'apercu.png'), dpi=150)

if __name__ == '__main__':
    formes, plateau = {}, []
    for k, st in enumerate(STYLES):
        mesh, v, m = jeton(st)
        formes[st] = (v, m)
        mesh.export(os.path.join(ICI, f'pinte-{st}.stl'))
        # plateau : 12 pièces par style, deux rangées de 6, un style par bande (changement de filament entre les bandes)
        for i in range(12):
            c = mesh.copy(); c.apply_translation(((i % 6) * 26, k * 64 + (i // 6) * 32, 0)); plateau.append(c)
    trimesh.util.concatenate(plateau).export(os.path.join(ICI, 'plateau-48.stl'))
    # une plaque de 24 par forme (6 × 4), 156 × 128 mm : une couleur de filament par plaque
    for st in STYLES:
        mesh, _, _ = jeton(st)
        pieces = []
        for i in range(24):
            c = mesh.copy(); c.apply_translation(((i % 6) * 26, (i // 6) * 32, 0)); pieces.append(c)
        fut = marqueur_prix(); fut.apply_translation((0, -24, 0)); pieces.append(fut)   # le marqueur de prix du style, même couleur
        trimesh.util.concatenate(pieces).export(os.path.join(ICI, f'plaque-{st}-24.stl'))
    # pièces : une plaque par valeur, 42 par plaque (7 × 6, 147 × 126 mm), deux pour les 1
    for val, n in PIECES.items():
        m = piece(val); m.export(os.path.join(ICI, f'piece-{val}.stl'))
        for k in range(math.ceil(n / 42)):
            grille(m, min(42, n - 42 * k), 7, 21, 21).export(os.path.join(ICI, f'plaque-pieces-{val}{chr(97 + k) if n > 42 else ""}.stl'))
    # ouvriers et pion Brasserie : une plaque par couleur de joueur (3 ouvriers + 1 pion), identique pour les quatre
    me, pb = meeple(), pion_brasserie()
    me.export(os.path.join(ICI, 'ouvrier.stl')); pb.export(os.path.join(ICI, 'pion-brasserie.stl'))
    joueur = grille(me, 3, 3, 20, 0)
    bouteille = pb.copy(); bouteille.apply_translation((62, 0, 0))
    trimesh.util.concatenate([joueur, bouteille]).export(os.path.join(ICI, 'plaque-joueur.stl'))
    # marqueurs : un fût de prix par style (à ajouter sur la plaque du style), un marqueur de saison
    marqueur_prix().export(os.path.join(ICI, 'marqueur-prix.stl'))
    marqueur_saison().export(os.path.join(ICI, 'marqueur-saison.stl'))
    with open(os.path.join(ICI, 'pintes.scad'), 'w') as f:
        f.write(scad(formes))
    apercu(formes)
    print('écrit : pintes.scad, pinte-*.stl, plateau-48.stl, plaque-*-24.stl, piece-*.stl, plaque-pieces-*.stl, ouvrier.stl, pion-brasserie.stl, plaque-joueur.stl, marqueur-prix.stl, marqueur-saison.stl, apercu.png')
