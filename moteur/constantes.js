// Constantes et valeurs de réglage de Brassins (version table : pose d'ouvriers, clients en cartes, prix partagés).
// Tout ce qui s'équilibre est ici : pas de nombre magique dans les règles.
// Valeurs issues de 3 000 parties simulées (docs/conception-table.md), à corriger en jouant.

export const SAISONS = ['printemps', 'ete', 'automne', 'hiver'];
export const ANNEES = 3;
export const NB_SAISONS = ANNEES * SAISONS.length; // durée maximale
export const FIN_REP = 30;                          // la partie s'arrête à la fin de la saison où un joueur atteint cette réputation

export const RES = ['malt', 'houb'];
export const STYLES = ['blonde', 'ipa', 'stout', 'garde'];
export const ITEMS = [...RES, ...STYLES, 'argent'];

// Recette d'un style : matières, saisons de fermentation, prix de base au Marché, réputation chez un client
export const RECETTES = {
  blonde: { malt: 2, houb: 1, ferm: 1, prix: 3, rep: 1 },
  ipa:    { malt: 2, houb: 2, ferm: 2, prix: 5, rep: 2 },
  stout:  { malt: 3, houb: 1, ferm: 2, prix: 6, rep: 3, exige: 'touraille' },
  garde:  { malt: 4, houb: 1, ferm: 3, prix: 7, rep: 4 },
};
export const REP_PREMIERE = 1;          // réputation la première fois qu'on brasse un style
export const CUVE = [2, 3];             // unités par brassin selon la cuve
export const DE_BRASSAGE = { rate: 1, cuvee: 6 }; // 1 : une unité en moins ; 6 : une de plus

// Cases du plateau. Les cases `multi` accueillent tout le monde ; `tournee` a une place par joueur.
// Récolte par saison (printemps, été, automne, hiver) pour les champs et houblonnières.
const CAP = 2; // ouvriers par champ ou houblonnière (le deuxième récolte un de moins)
export const CASES = {
  champA: { nom: "Champ d'orge", res: 'malt', recolte: [3, 4, 4, 0], cap: CAP, moins: 1 },
  champB: { nom: "Champ d'orge", res: 'malt', recolte: [3, 4, 4, 0], cap: CAP, moins: 1 },
  houbA:  { nom: 'Houblonnière', res: 'houb', recolte: [2, 2, 4, 0], cap: CAP, moins: 1 },
  houbB:  { nom: 'Houblonnière', res: 'houb', recolte: [2, 2, 4, 0], cap: CAP, moins: 1 },
  marcheMat: { nom: 'Marché aux matières' },
  tournee: { nom: 'Tournée', multi: true },
  marcheBieres: { nom: 'Marché aux bières', multi: true },
  chantier: { nom: 'Chantier', multi: true },
};
export const ACHAT = { malt: 2, houb: 2 };
export const ACHAT_MAX = 3;               // matières par passage au Marché

// Marché aux bières
export const PRIX_PLANCHER = 1;
export const PRIX_PLAFOND = 7;
export const PRIX_REMONTEE = 1;           // par saison, vers le prix de base
export const DEMANDE_BONUS = 2;           // au Marché, pour un style en demande
export const DEMANDE_REP = 1;             // chez un client, pour un style en demande
export const DEMANDE = { printemps: ['blonde', 'ipa'], ete: ['blonde', 'ipa'], automne: ['stout', 'ipa'], hiver: ['stout', 'garde'] };

// Clients : file de 5, le plus ancien part à chaque fin de saison.
// `style` : un style imposé ; `styles` : au choix parmi ceux-là ; ni l'un ni l'autre : n'importe lequel.
export const FILE = 5;
export const FEST_REP = 2;                // festival livré pendant sa saison
export const CRITIQUE_REP = 3;            // premier à livrer une cave sous un critique gastronomique
export const CLIENTS = [
  ...['Le Comptoir', 'Chez Lucette', 'Le Relais', 'Bar des Sports', 'La Terrasse', 'Le Tabac-Presse', 'Café de la Gare', 'Le Petit Bal', 'Le Zinc', 'La Belle Époque'].map((nom) => ({ kind: 'bar', nom, style: null, n: 1, bonus: 0, rep: 1 })),
  ...[['blonde', ['La Guinguette', 'Le Marché couvert', 'Buvette du stade']], ['ipa', ['Le Rock Bar', 'La Cave à bières', 'Le Skate Park']], ['stout', ['Le Pub irlandais', 'La Cheminée', 'Le Club de rugby']], ['garde', ["L'Auberge", "La Table d'hôtes", 'Le Relais de chasse']]]
    .flatMap(([style, noms]) => noms.map((nom) => ({ kind: 'bar', nom, style, n: 1, bonus: 1, rep: 2 }))),
  ...['Cave du Bourg', 'Cave Saint-Front', 'Épicerie fine', 'Cave de la Halle', 'Cave du Château', 'La Vinothèque', 'Le Caviste', 'Cave des Remparts'].map((nom) => ({ kind: 'cave', nom, style: null, styles: ['stout', 'garde'], n: 1, bonus: 3, rep: 3 })),
  ...[[0, 'Festival de printemps', 'blonde'], [0, 'Foire de Pâques', 'blonde'], [0, 'Foire de mai', 'blonde'], [0, 'Fête des plantes', 'ipa'],
    [1, 'Fête de la bière', 'blonde'], [1, 'Feux de la Saint-Jean', 'blonde'], [1, 'Fête des moissons', 'ipa'], [1, 'Bal du 14 juillet', 'ipa'], [1, 'Festival rock', 'ipa'],
    [2, "Foire d'automne", 'stout'], [2, 'Fête des vendanges', 'ipa'], [2, 'Salon des brasseurs', 'garde'], [3, 'Marché de Noël', 'garde'], [3, 'Saint-Vincent', 'stout']]
    .map(([saison, nom, style]) => ({ kind: 'fest', nom, style, n: 2, bonus: 1, rep: 2, saison })),
].map((c, i) => ({ id: i, ...c }));
export const CLIENT_MAIRIE = { kind: 'mairie', nom: 'Commande de la mairie', n: 3, bonus: 2, rep: 4 };

// Objectifs secrets : 2 cartes piochées au départ, on en garde 1, révélée au décompte.
// `test(p, s)` lit les compteurs du joueur (p.cpt) et son état.
export const OBJECTIFS = {
  festivalier: { nom: 'Festivalier', txt: 'Livrer 2 festivals.', pts: 4, test: (p) => p.cpt.fest >= 2 },
  caviste:     { nom: 'Fournisseur des caves', txt: 'Livrer 2 caves.', pts: 4, test: (p) => p.cpt.cave >= 2 },
  bistrotier:  { nom: 'Bistrotier', txt: 'Livrer 4 bars.', pts: 4, test: (p) => p.cpt.bar >= 4 },
  gamme:       { nom: 'Gamme complète', txt: 'Brasser les 4 styles.', pts: 3, test: (p) => p.styles.length >= 4 },
  grande:      { nom: 'Grande brasserie', txt: 'Finir avec 4 fermenteurs et la Grande cuve.', pts: 3, test: (p) => p.nferm >= 4 && p.upg.includes('cuve') },
  medaille:    { nom: 'Médaillé', txt: 'Remporter un concours ou un salon.', pts: 4, test: (p) => p.cpt.medailles >= 1 },
  grossiste:   { nom: 'Grossiste', txt: 'Vendre 10 unités au Marché aux bières.', pts: 4, test: (p) => p.cpt.marche >= 10 },
  officiel:    { nom: 'Fournisseur officiel', txt: 'Livrer la Commande de la mairie.', pts: 5, test: (p) => p.cpt.mairie >= 1 },
  laine:       { nom: 'Bas de laine', txt: 'Finir avec 50 Argent ou plus.', pts: 4, test: (p) => p.argent >= 50 },
  installe:    { nom: 'Belle installation', txt: 'Avoir la Grande cuve, la Salle de dégustation et le Camion.', pts: 6, test: (p) => ['cuve', 'salle', 'camion'].every((u) => p.upg.includes(u)) },
  gardien:     { nom: 'Maître de garde', txt: 'Livrer 4 unités de Bière de garde à des clients.', pts: 4, test: (p) => p.cpt.livre.garde >= 4 },
  varie:       { nom: 'Carte variée', txt: 'Livrer des clients avec 3 styles différents.', pts: 4, test: (p) => STYLES.filter((st) => p.cpt.livre[st] > 0).length >= 3 },
};
export const OBJECTIFS_PIOCHE = 2;        // cartes piochées au départ
export const OBJECTIFS_GARDE = 1;         // cartes gardées

// Dés de saison. Météo : 1 = champs et houblonnières −1, 6 = +1. Événement : une face, un événement, selon la saison.
export const METEO = { 1: -1, 6: 1 };
export const EVENEMENTS = {
  printemps: { 1: 'cooperative', 2: 'levee', 3: 'mildiou', 4: 'contamination', 5: 'critique', 6: 'invite' },
  ete: { 1: 'touristes', 2: 'terrasses', 3: 'canicule', 4: 'fetePrix', 5: 'penurie', 6: 'inspection' },
  automne: { 1: 'foireVins', 2: 'grandMarche', 3: 'recolte', 4: 'mairie', 5: 'concours', 6: 'salon' },
  hiver: { 1: 'gel', 2: 'bilan', 3: 'greve', 4: 'douanes', 5: 'noel', 6: 'feteVillage' },
};
export const EVT = {
  cooperative: { nom: 'Coopérative', txt: 'Les matières sont à 1 Argent au Marché cette saison.' },
  levee: { nom: 'Belle levée', txt: 'Les champs d’orge produisent 1 de plus cette saison.' },
  touristes: { nom: 'Touristes', txt: '2 clients de plus dans la file.' },
  terrasses: { nom: 'Terrasses', txt: 'Les bars paient 1 Argent de plus par unité cette saison.' },
  foireVins: { nom: 'Foire aux vins', txt: 'Les caves paient 2 Argent de plus par unité cette saison.' },
  grandMarche: { nom: 'Grand marché', txt: 'Les ventes au Marché aux bières ne font pas baisser les prix cette saison.' },
  gel: { nom: 'Gel', txt: 'Les matières sont à 3 Argent au Marché cette saison.' },
  bilan: { nom: 'Bilan de l’année', txt: 'Chacun gagne 1 Réputation par style qu’il a en stock.' },
  mildiou: { nom: 'Mildiou', txt: 'Les houblonnières sont fermées cette saison.' },
  contamination: { nom: 'Contamination', txt: 'Chacun retire 1 unité d’un de ses brassins en cours.' },
  critique: { nom: 'Critique gastronomique', txt: 'Le premier qui livre une cave gagne 3 Réputation de plus.' },
  invite: { nom: 'Brasseur invité', txt: 'Le Stout se brasse sans Touraille cette saison.' },
  canicule: { nom: 'Canicule', txt: 'Chacun retire 1 unité d’un de ses brassins en cours.' },
  fetePrix: { nom: 'Fête de la bière', txt: 'Tous les prix sont majorés de 1 cette saison.' },
  penurie: { nom: 'Pénurie', txt: 'Le Marché aux matières est fermé cette saison.' },
  inspection: { nom: 'Inspection', txt: 'Chaque brassin en cours perd 1 unité.' },
  recolte: { nom: 'Belle récolte', txt: 'Champs et houblonnières +1 cette saison.' },
  mairie: { nom: 'Commande de la mairie', txt: 'Un client spécial rejoint la file : 3 unités, bien payées.' },
  concours: { nom: 'Concours régional', txt: 'Chacun présente 1 unité : le meilleur gagne 5 Réputation, le deuxième 2.' },
  salon: { nom: 'Salon des brasseurs', txt: 'Comme le concours, mais 8 et 3 Réputation.' },
  greve: { nom: 'Grève des transporteurs', txt: 'Pas de Tournée cette saison.' },
  douanes: { nom: 'Contrôle des douanes', txt: '1 Argent par tranche de 3 unités en stock.' },
  noel: { nom: 'Marché de Noël', txt: '2 clients de plus dans la file.' },
  feteVillage: { nom: 'Fête au village', txt: '2 clients de plus dans la file, et tous les prix +1.' },
};
export const CONCOURS = { concours: [5, 2], salon: [8, 3] };
export const DOUANES_PAR = 3;

// Brasserie
export const OUVRIERS_DEPART = 3;
export const CAMION_LIVRAISONS = 2;       // clients livrés par Tournée avec le Camion
export const FERMENTEURS_DEPART = 2;
export const FERMENTEURS_MAX = 4;
export const STOCK_MAX = 6;
export const SALLE_BONUS = 1;             // sur le prix de base
export const SALLE_REP_HIVER = 1;
export const AMELIORATIONS = {
  cuve:      { cout: 9, nom: 'Grande cuve',           txt: '3 unités par brassin.' },
  ferm:      { cout: 5, nom: 'Fermenteur',            txt: 'Un fermenteur de plus, jusqu’à 4.', multiple: true },
  touraille: { cout: 5, nom: 'Touraille',             txt: 'Permet le Stout.' },
  camion:    { cout: 8, nom: 'Camion',                txt: 'La Tournée livre jusqu’à 2 clients.' },
  salle:     { cout: 10, nom: 'Salle de dégustation', txt: 'Chaque saison, vendre 1 unité au prix de base +1 sans ouvrier ; chaque hiver, +1 Réputation.' },
};

// Cartes Développement : achetées au Chantier (avec l'ouvrier, jusqu'à 2 d'un coup), gardées en main, une jouée par tour.
// `cible` dit ce que l'action `jouer` doit préciser.
export const DEV_PRIX = 6;
export const DEV_PAR_POSE = 2;
export const DEV_EXEMPLAIRES = 2;
export const DEVELOPPEMENTS = {
  monopole:     { nom: 'Monopole', txt: 'Annonce Malt ou Houblon : chaque adversaire t’en donne une carte.', cible: 'res' },
  rachat:       { nom: 'Rachat', txt: 'Prends une unité du stock d’un adversaire, au prix de base du style. Il ne peut pas refuser.', cible: 'stock' },
  controle:     { nom: 'Contrôle', txt: 'Chaque adversaire te donne 1 Argent par tranche de 3 unités en stock (2 au plus).' },
  levureSauvage:{ nom: 'Levure sauvage', txt: 'Chaque adversaire retire 1 unité d’un de ses brassins en cours, à son choix.' },
  reservation:  { nom: 'Réservation', txt: 'Pose la carte sur un client de la file : toi seul peux le livrer, jusqu’à la fin de la saison prochaine.', cible: 'client' },
  levureVive:   { nom: 'Levure vive', txt: 'Un de tes brassins en cours gagne une saison.', cible: 'ferm' },
  saisonnier:   { nom: 'Saisonnier', txt: 'Un ouvrier de plus cette saison.' },
  primeur:      { nom: 'Primeur', txt: 'Ta prochaine vente au Marché aux bières ne fait pas baisser les prix.' },
  coupDeMain:   { nom: 'Coup de main', txt: 'Brasse sans lancer le dé : 3 unités d’office.', cible: 'style' },
  fournisseur:  { nom: 'Fournisseur', txt: 'Achète jusqu’à 3 matières à 1 Argent, sans ouvrier, même si le Marché est pris ou fermé.', cible: 'achats' },
  boucheAOreille:{ nom: 'Bouche-à-oreille', txt: '+2 Réputation.' },
  grandeFoire:  { nom: 'Grande foire', txt: 'Jusqu’à la fin de la saison, les clients te paient 1 Argent de plus par unité.' },
};
export const DEV = { fournisseurPrix: 1, controleMax: 2, controlePar: 3, coupDeMain: 3, boucheAOreille: 2, grandeFoire: 1 };

// Départ et compensation. Les matières sont des cartes en main, cachées aux autres (seul leur nombre se voit).
export const DEPART = { res: { malt: 4, houb: 2 }, argent: 5 };
export const CARTES_MATIERES = { malt: 40, houb: 30 };
export const REP_DERNIER = 1;             // le dernier joueur de la première saison commence avec 1 Réputation

// Décompte final : réputation + objectif secret + Argent
export const ARGENT_PAR_POINT = 10;

export const Z = () => ({ malt: 0, houb: 0 });
export const ZS = () => Object.fromEntries(STYLES.map((s) => [s, 0]));
export const ZI = () => Object.fromEntries(ITEMS.map((k) => [k, 0]));
export const total = (o) => Object.values(o ?? {}).reduce((s, n) => s + n, 0);
