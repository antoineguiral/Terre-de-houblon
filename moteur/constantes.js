// Constantes et valeurs de réglage de Brassins (version table : pose d'ouvriers, clients en cartes, prix partagés).
// Tout ce qui s'équilibre est ici : pas de nombre magique dans les règles.
// Valeurs issues de 3 000 parties simulées (docs/conception-table.md), à corriger en jouant.

export const SAISONS = ['printemps', 'ete', 'automne', 'hiver'];
export const ANNEES = 3;
export const NB_SAISONS = ANNEES * SAISONS.length;

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
  tournee: { nom: 'Tournée', parJoueur: true },
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

// Clients : file de 5, le plus ancien part à chaque fin de saison
export const FILE = 5;
export const FEST_REP = 2;                // festival livré pendant sa saison
export const CRITIQUE_REP = 3;            // premier à livrer une cave sous un critique gastronomique
export const CLIENTS = [
  ...['Le Comptoir', 'Chez Lucette', 'Le Relais', 'Bar des Sports', 'La Terrasse', 'Le Tabac-Presse', 'Café de la Gare', 'Le Petit Bal'].map((nom) => ({ kind: 'bar', nom, style: null, n: 1, bonus: 0, rep: 1 })),
  ...[['blonde', ['La Guinguette', 'Le Marché couvert', 'Buvette du stade']], ['ipa', ['Le Rock Bar', 'La Cave à bières', 'Le Skate Park']], ['stout', ['Le Pub irlandais', 'La Cheminée', 'Le Club de rugby']], ['garde', ["L'Auberge", "La Table d'hôtes", 'Le Relais de chasse']]]
    .flatMap(([style, noms]) => noms.map((nom) => ({ kind: 'bar', nom, style, n: 1, bonus: 1, rep: 2 }))),
  ...['Cave du Bourg', 'Cave Saint-Front', 'Épicerie fine', 'Cave de la Halle'].map((nom) => ({ kind: 'cave', nom, style: 'stout', n: 1, bonus: 3, rep: 3 })),
  ...['Cave du Château', 'La Vinothèque', 'Le Caviste', 'Cave des Remparts'].map((nom) => ({ kind: 'cave', nom, style: 'garde', n: 1, bonus: 3, rep: 4 })),
  ...[[0, 'Festival de printemps', 'blonde'], [0, 'Fête des plantes', 'ipa'], [0, 'Foire de Pâques', 'blonde'], [1, 'Fête de la bière', 'blonde'], [1, 'Fête des moissons', 'ipa'], [1, 'Bal du 14 juillet', 'ipa'],
    [2, "Foire d'automne", 'stout'], [2, 'Fête des vendanges', 'ipa'], [2, 'Salon des brasseurs', 'garde'], [3, 'Marché de Noël', 'garde'], [3, 'Saint-Vincent', 'stout'], [3, 'Fête de la truffe', 'stout']]
    .map(([saison, nom, style]) => ({ kind: 'fest', nom, style, n: 2, bonus: 1, rep: 2, saison })),
].map((c, i) => ({ id: i, ...c }));
export const CLIENT_MAIRIE = { kind: 'mairie', nom: 'Commande de la mairie', n: 3, bonus: 2, rep: 4 };

// Dés de saison. Météo : 1 = champs et houblonnières −1, 6 = +1. Événement : 1 et 2 rien, puis selon la saison.
export const METEO = { 1: -1, 6: 1 };
export const EVENEMENTS = {
  printemps: { 3: 'mildiou', 4: 'contamination', 5: 'critique', 6: 'invite' },
  ete: { 3: 'canicule', 4: 'fetePrix', 5: 'penurie', 6: 'inspection' },
  automne: { 3: 'recolte', 4: 'mairie', 5: 'concours', 6: 'salon' },
  hiver: { 3: 'greve', 4: 'douanes', 5: 'noel', 6: 'feteVillage' },
};
export const EVT = {
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
export const OUVRIERS_DEPART = 2;
export const OUVRIERS_MAX = 3;
export const FERMENTEURS_DEPART = 2;
export const FERMENTEURS_MAX = 4;
export const STOCK_MAX = 6;
export const SALLE_BONUS = 1;             // sur le prix de base
export const SALLE_REP_HIVER = 1;
export const AMELIORATIONS = {
  cuve:      { cout: 6, nom: 'Grande cuve',           txt: '3 unités par brassin.' },
  ferm:      { cout: 4, nom: 'Fermenteur',            txt: 'Un fermenteur de plus, jusqu’à 4.', multiple: true },
  touraille: { cout: 4, nom: 'Touraille',             txt: 'Permet le Stout.' },
  embauche:  { cout: 7, nom: 'Embauche',              txt: 'Un troisième ouvrier.' },
  salle:     { cout: 7, nom: 'Salle de dégustation',  txt: 'Chaque saison, vendre 1 unité au prix de base +1 sans ouvrier ; chaque hiver, +1 Réputation.' },
};

// Départ et compensation
export const DEPART = { res: { malt: 4, houb: 2 }, argent: 5 };
export const REP_DERNIER = 1;             // le dernier joueur de la première saison commence avec 1 Réputation

// Décompte final
export const DIVERSITE = { 3: 2, 4: 5 };
export const ARGENT_PAR_POINT = 8;

export const Z = () => ({ malt: 0, houb: 0 });
export const ZS = () => Object.fromEntries(STYLES.map((s) => [s, 0]));
export const ZI = () => Object.fromEntries(ITEMS.map((k) => [k, 0]));
export const total = (o) => Object.values(o ?? {}).reduce((s, n) => s + n, 0);
