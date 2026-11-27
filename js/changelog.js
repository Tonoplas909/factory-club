/*
 * changelog.js — the history of the game's updates, newest first. After an update, the first reload
 * shows the entries the player has not seen yet (see main.js); the menu shows the whole history.
 * To publish an update: add an entry at the top with the next `v`.
 */
(function (CO) {
  'use strict';
  CO.CHANGELOG = [
    { v: 7, date: '27 novembre 2026', title: 'Un nouveau monde : Kéora', items: [
      'Les 8 extensions de la station terminées, la station est complète : une flèche ▶ au-dessus de son image (onglet Station) emmène sur Kéora, avec une petite transition. La flèche ◀ ramène sur la Terre.',
      'Kéora a sa propre carte : cobalt, lithium, quartz, soufre, roche volcanique et iridium, lacs d’ammoniac et poches de méthane liquide.',
      'De nouveaux objets et de nouvelles machines : foreuse à plasma, forge à induction, atelier de précision, four à plasma, synthétiseur, forge stellaire, réacteur chimique, générateur au soufre, turbine à ammoniac…',
      'Un arbre de recherche propre à Kéora et un portail stellaire en 12 étapes à construire.',
      'Chaque planète garde son usine, ses terrains et son avancement ; celle que tu quittes est en pause. Ton argent, tes ouvriers et tes recherches te suivent.'
    ] },
    { v: 6, date: '25 novembre 2026', title: 'La grande mise à jour', items: [
      'Énergie : foreuses et machines ont besoin de courant. Le Port fournit 150 kW autour de lui ; poteaux, pylônes, générateur thermique (charbon) et centrale solaire pour le reste.',
      'Fluides : lacs et nappes de pétrole, tuyaux, pompe à eau, cuve, centrale à vapeur (400 kW), puits de pétrole et raffinerie (plastique, carburant).',
      'Améliorations : niveaux II et III pour foreuses, machines, pompes et générateurs.',
      'Contrats du Port : des commandes à durée limitée, bien payées (onglet Station).',
      'Drones logistiques : port de drones, coffres d’envoi et de demande.',
      'Programme orbital : pas de tir, fusées, satellites et missions à bonus permanents, jusqu’à Mars.',
      'Plans de construction (onglet Plans, miroir F) et fantômes : sans assez de crédits, ce que tu poses est construit quand l’argent arrive.',
      'Minicarte (touche M) et courbes de production sur 1 min, 10 min et 1 h.'
    ] },
    { v: 5, date: '25 novembre 2026', title: 'Logistique avancée', items: [
      'Portes de débordement et de sous-débit, croisement, trieur inversé, extracteur, convoyeur blindé.',
      'Carte doublée : 480×320 cases, avec un anneau extérieur riche en titane.',
      'Aperçu de la liaison des convoyeurs souterrains avant de les poser.',
      'Recettes et filtres réglables d’un coup sur toute une sélection.',
      'Contrôles : clic molette pour la caméra, Ctrl + clic gauche pour sélectionner.'
    ] },
    { v: 4, date: '25 novembre 2026', title: 'Terrains, ouvriers et vue isométrique', items: [
      'Terrains à acheter, de plus en plus chers : la carte commence petite.',
      'Ouvriers bâtisseurs : chaque bâtiment est un chantier qu’un ouvrier vient construire.',
      'Vue isométrique en voxels (Tab pour revenir à la vue de dessus).',
      'Nouveaux tracés de convoyeurs : ligne droite, en L avec Ctrl, à main levée avec Alt.'
    ] },
    { v: 3, date: '24 novembre 2026', title: 'Nouveau style et file de recherche', items: [
      'Interface façon Mindustry, compacte en 1024×768.',
      'File d’attente de recherche et réserve des laboratoires.',
      'Catapulte magnétique, panneau Production, bulles d’infos détaillées.',
      'Changer de recette ne perd plus le stock ; coffres à 10 objets/s.'
    ] },
    { v: 2, date: '18 novembre 2026', title: 'Progression étendue', items: [
      'Station en 16 étapes, chaîne du titane, Chantier spatial.',
      'Carte 240×160, popup Ressources et recettes (touche I).',
      'Rééquilibrage des cadences et panneau Infos refait.'
    ] },
    { v: 1, date: '18 novembre 2026', title: 'Première version', items: [
      'Foreuses, convoyeurs, fonderies, ateliers, laboratoires et la station à livrer au Port.'
    ] }
  ];
  CO.GAME_VERSION = CO.CHANGELOG[0].v;

  const KEY = 'chantier-orbital-seen-version';
  /** Last game version whose changelog the player has seen (null if never recorded). */
  CO.seenVersion = function () {
    try { const v = parseInt(localStorage.getItem(KEY), 10); return isFinite(v) ? v : null; } catch (e) { return null; }
  };
  CO.markVersionSeen = function () { try { localStorage.setItem(KEY, String(CO.GAME_VERSION)); } catch (e) { /* ignore */ } };
})(window.CO = window.CO || {});
