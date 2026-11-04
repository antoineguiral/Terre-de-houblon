// Constantes et valeurs de réglage de Brassins, partagées par le moteur, l'IA, le navigateur et le serveur.
// Tout ce qui s'équilibre est ici : pas de nombre magique dans les règles.

export const SAISONS = ['printemps', 'ete', 'automne', 'hiver'];
export const ANNEES = 3;
export const NB_SAISONS = ANNEES * SAISONS.length;

export const RES = ['malt', 'houb', 'lev', 'eau', 'torr'];
export const STYLES = ['blonde', 'blanche', 'ipa', 'ambree', 'stout', 'lager', 'garde'];
export const FONCES = ['ambree', 'stout', 'lager', 'garde'];
// Tout ce qui peut s'échanger entre joueurs
export const ITEMS = [...RES, ...STYLES, 'argent'];

// Recette d'un style : matières, saisons de fermentation, prix de base au Marché, réputation chez un client
export const RECETTES = {
  blonde:  { malt: 2, houb: 1, lev: 1, eau: 1, torr: 0, ferm: 1, prix: 3, rep: 1 },
  blanche: { malt: 1, houb: 1, lev: 1, eau: 2, torr: 0, ferm: 1, prix: 3, rep: 1 },
  ipa:     { malt: 2, houb: 3, lev: 1, eau: 1, torr: 0, ferm: 2, prix: 5, rep: 2 },
  ambree:  { malt: 2, houb: 1, lev: 1, eau: 1, torr: 1, ferm: 2, prix: 4, rep: 3 },
  stout:   { malt: 1, houb: 1, lev: 1, eau: 1, torr: 2, ferm: 2, prix: 6, rep: 3 },
  lager:   { malt: 2, houb: 1, lev: 1, eau: 2, torr: 0, ferm: 2, prix: 4, rep: 3, exige: 'froide' },
  garde:   { malt: 3, houb: 1, lev: 1, eau: 1, torr: 1, ferm: 3, prix: 7, rep: 4 },
};
export const REP_PREMIERE = 1; // réputation la première fois qu'on brasse un style

// Production d'une case voisine par saison (printemps, été, automne, hiver)
export const TERROIRS = ['orge', 'houb', 'source'];
export const PRODUCTION = { orge: [0, 3, 2, 0], houb: [0, 2, 3, 0], source: [3, 0, 2, 1] };
export const PRODUIT = { orge: 'malt', houb: 'houb', source: 'eau' };
export const PUITS = 1;        // Eau par saison, chaque brasserie
export const LABO_LEV = 1;     // Levure par saison avec le Labo
export const LABO_HOUB = 1;    // Houblon par saison avec le Labo
export const LEV_REPIQUAGE = 1; // Levure récupérée à la fin de chaque fermentation

// Plateau : 19 cases, dont le Bourg au centre et 3 villages sur l'anneau extérieur
export const TUILES = ['orge', 'orge', 'orge', 'orge', 'orge', 'orge', 'houb', 'houb', 'houb', 'houb', 'houb', 'source', 'source', 'source', 'source'];
export const NB_VILLAGES = 3;

// Marché
export const ACHAT = { malt: 2, houb: 2, lev: 3, eau: 1, torr: 5 };
export const PRIX_PLANCHER = 1;
export const PRIX_REMONTEE = 1;   // par saison, vers le prix de base
export const DEMANDE_BONUS = 2;   // sur le prix du Marché pour un style en demande
export const DEMANDE_REP = 1;     // réputation en plus chez un client pour un style en demande

// Clients (le Bourg et les villages sont sur la carte, les foires sur la côte)
export const CLIENTS = {
  bar:   { cap: 3, bonus: 1 },                    // Bar du Bourg : tous styles
  cave:  { cap: 2, bonus: 3 },                    // Cave du Bourg : styles foncés seulement
  village: { cap: 2, bonus: 0, malus: -1 },       // bars de village : deux styles préférés
  foire: { cap: 4, bonus: 2, rep: 1 },            // foires : pendant leur saison seulement
};
// Saison de chaque foire, dans l'ordre des 6 directions
export const FOIRES = [
  { id: 'foire0', saison: 1, nom: 'Fête de la bière' },
  { id: 'foire1', saison: 1, nom: 'Fête des moissons' },
  { id: 'foire2', saison: 2, nom: "Foire d'automne" },
  { id: 'foire3', saison: 3, nom: 'Marché de Noël' },
  { id: 'foire4', saison: 3, nom: 'Fête de la Saint-Vincent' },
  { id: 'foire5', saison: 0, nom: 'Festival de printemps' },
];
export const TOURNEE_COUT = 2;         // Argent par case de distance
export const TOURNEE_COUT_CAMION = 1;
export const TOURNEE_GRATUITE_DIST = 2; // au départ, un client à 2 cases ou moins
export const LIVRAISON_PAR_CLIENT = 1;  // unités par client et par saison
export const LIVRAISON_CAMION = 2;

// Brasserie
export const FERMENTEURS_DEPART = 2;
export const FERMENTEURS_MAX = 5;
export const CUVE = [2, 3, 4];           // unités par brassin selon le niveau de cuve (0, 1, 2)
export const STOCK_MAX = 6;
export const TOURAILLE_MALT = 2;         // Malt par Malt torréfié
export const TOURAILLE_PAR_SAISON = 1;
export const SALLE_UNITES = 2;           // ventes par saison à la Salle de dégustation
export const SALLE_BONUS = 1;            // sur le prix de base
export const SALLE_REP_HIVER = 1;

export const AMELIORATIONS = {
  cuve2:     { cout: 8,  nom: 'Cuve niveau 2',        txt: '3 unités par brassin.' },
  cuve3:     { cout: 14, nom: 'Cuve niveau 3',        txt: '4 unités par brassin.', exige: 'cuve2' },
  ferm:      { cout: 6,  nom: 'Fermenteur',           txt: 'Un fermenteur de plus, jusqu’à 5.', multiple: true },
  touraille: { cout: 7,  nom: 'Touraille',            txt: 'Une fois par saison, 2 Malt deviennent 1 Malt torréfié.' },
  froide:    { cout: 6,  nom: 'Chambre froide',       txt: 'Permet les Lagers et protège de la canicule.' },
  labo:      { cout: 6,  nom: 'Labo',                 txt: '+1 Levure et +1 Houblon par saison ; protège de la contamination.' },
  camion:    { cout: 8,  nom: 'Camion',               txt: 'Tournées à 1 Argent par case, et 2 unités par client et par saison.' },
  salle:     { cout: 10, nom: 'Salle de dégustation', txt: 'Vend 2 unités par saison au prix de base +1, et rapporte 1 Réputation chaque hiver.' },
};

// Départ
export const DEPART = { res: { malt: 4, houb: 2, lev: 2, eau: 2, torr: 0 }, argent: 6 };

// Pioche des saisons : 3 cartes par saison, une météo, deux styles en demande, parfois un événement
export const CARTES = {
  printemps: [
    { id: 'p_doux',     nom: 'Printemps doux',     meteo: null,                 demande: ['blanche', 'blonde'] },
    { id: 'p_pluvieux', nom: 'Printemps pluvieux', meteo: { source: 1 },        demande: ['blonde', 'lager'] },
    { id: 'p_froid',    nom: 'Printemps froid',    meteo: { source: -1 },       demande: ['ambree', 'stout'], evt: 'contamination' },
  ],
  ete: [
    { id: 'e_bel',      nom: 'Bel été',            meteo: null,                 demande: ['blonde', 'ipa'] },
    { id: 'e_canicule', nom: 'Canicule',           meteo: { source: 'zero' },   demande: ['blanche', 'lager'], evt: 'canicule' },
    { id: 'e_orageux',  nom: 'Été orageux',        meteo: { orge: -1 },         demande: ['ipa', 'blanche'] },
  ],
  automne: [
    { id: 'a_recolte',  nom: 'Belle récolte',      meteo: { houb: 1 },          demande: ['ipa', 'ambree'] },
    { id: 'a_humide',   nom: 'Automne humide',     meteo: null,                 demande: ['ambree', 'stout'], evt: 'concours' },
    { id: 'a_sec',      nom: 'Automne sec',        meteo: { houb: -1 },         demande: ['garde', 'ipa'] },
  ],
  hiver: [
    { id: 'h_tranquille', nom: 'Hiver tranquille', meteo: null,                 demande: ['stout', 'garde'] },
    { id: 'h_rude',     nom: 'Hiver rude',         meteo: { source: -1 },       demande: ['ambree', 'garde'], evt: 'douanes' },
    { id: 'h_fete',     nom: 'Hiver de fête',      meteo: null,                 demande: ['blonde', 'stout'], evt: 'fete' },
  ],
};
export const CARTE = Object.fromEntries(Object.values(CARTES).flat().map((c) => [c.id, c]));

export const CONCOURS = [5, 2];       // réputation du premier et du deuxième
export const DOUANES_PAR = 3;         // 1 Argent par tranche de 3 unités en stock
export const FETE_MULT = 2;           // capacité des villages doublée

// Décompte final
export const DIVERSITE = { 3: 2, 5: 5, 7: 9 };   // styles différents brassés → points
export const ARGENT_PAR_POINT = 8;

export const Z = () => ({ malt: 0, houb: 0, lev: 0, torr: 0, eau: 0 });
export const ZS = () => Object.fromEntries(STYLES.map((s) => [s, 0]));
export const ZI = () => Object.fromEntries(ITEMS.map((k) => [k, 0]));
export const total = (o) => Object.values(o ?? {}).reduce((s, n) => s + n, 0);
