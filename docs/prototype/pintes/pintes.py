#!/usr/bin/env python3
"""Jetons Bière à imprimer en 3D : une silhouette de verre par style, à plat, 3 mm d'épaisseur.

    python3 docs/prototype/pintes/pintes.py

Écrit pintes.scad (paramétrable dans OpenSCAD), un STL par style, un STL « plateau » avec 12 pièces
de chaque, et apercu.png. Dépend de trimesh, shapely, mapbox_earcut, matplotlib.

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
        trimesh.util.concatenate(pieces).export(os.path.join(ICI, f'plaque-{st}-24.stl'))
    with open(os.path.join(ICI, 'pintes.scad'), 'w') as f:
        f.write(scad(formes))
    apercu(formes)
    print('écrit : pintes.scad, pinte-*.stl, plateau-48.stl, plaque-*-24.stl, apercu.png')
