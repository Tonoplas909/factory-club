# Chantier Orbital

Jeu d'automatisation 2D en vue du dessus, jouable dans le navigateur. Tu extrais des ressources, tu les transformes dans une usine que tu construis case par case, puis tu livres les pièces au **Port** pour assembler une **station spatiale**. Pas de chronomètre, pas d'échec : on optimise, on regarde la station grandir.

- Une seule partie continue, sans remise à zéro entre les étapes (16 étapes, soit bien plus d'une heure de jeu (estimation), puis des extensions sans fin).
- Pixel art généré par code dans l'esprit de Mindustry (métal biseauté, contour sombre, accent jaune), aucune image à télécharger, sauvegarde automatique, fonctionne à la souris, au clavier et au tactile (tablette).

## Technologie choisie

**JavaScript pur + Canvas 2D, sans dépendance ni compilation.**
Le jeu est une grille de quelques milliers de cases avec quelques centaines de bâtiments : un `canvas` 2D suffit largement (rendu limité à la zone visible, sprites pré-dessinés). Phaser ou PixiJS apporteraient du poids et une étape de build pour un besoin que le navigateur couvre déjà. Les scripts sont chargés en classique (pas de modules ES), donc `index.html` marche même en double-clic.

## Lancer le jeu en local

Le plus simple : **double-clique sur `index.html`**.

Si ton navigateur bloque le stockage local en `file://`, lance un petit serveur statique depuis ce dossier, par exemple :

```powershell
python -m http.server 8000
```

puis ouvre <http://localhost:8000>.

## Publier sur GitHub Pages

1. Crée un dépôt GitHub et pousse le contenu de ce dossier à la racine (la branche `main`).
   ```powershell
   git init
   git add .
   git commit -m "Chantier Orbital"
   git branch -M main
   git remote add origin https://github.com/Tonoplas909/factory-club.git
   git push -u origin main
   ```
2. Sur GitHub : **Settings → Pages**.
3. Dans **Build and deployment**, choisis **Source : Deploy from a branch**, branche **main**, dossier **/ (root)**, puis **Save**.
4. Après une minute environ, le jeu est en ligne sur `https://<ton-compte>.github.io/<ton-depot>/`.

Aucune étape de build : le site est statique. Les chemins sont relatifs, donc il fonctionne aussi dans un sous-dossier.

À chaque mise en ligne, augmente le numéro `?v=` des scripts et de la feuille de style dans `index.html` : un navigateur ne mélange alors jamais des fichiers de deux versions (ce qui pourrait abîmer une sauvegarde pendant une migration). Avant de migrer une ancienne sauvegarde, le jeu en garde aussi une copie intacte dans le navigateur (`chantier-orbital-save-v1-backup-rev<N>`).

## Comment jouer

| Action | Commande |
| --- | --- |
| Utiliser l'outil actif | Clic gauche |
| Poser plusieurs éléments | Glisser : ligne droite depuis le point de départ (les convoyeurs sur un seul axe) |
| Réglages en lot | Sélectionne plusieurs bâtiments : l'onglet Infos propose une recette (ou un filtre) par type de bâtiment, appliquée à tous ceux de la sélection d'un coup |
| Souterrains | Pendant la pose, une ligne pointillée montre la sortie (ou l'entrée) à laquelle la pièce va se relier ; sans partenaire à portée, ses 5 cases de portée sont marquées en rouge |
| Convoyeurs en L | Ctrl + glisser : jusqu'au curseur sur les deux axes, en sautant les bâtiments déjà posés sur le chemin |
| Convoyeurs à main levée | Alt + glisser : les convoyeurs suivent le tracé de la souris |
| Construire par-dessus des convoyeurs | Poser le bâtiment dessus : convoyeurs, séparateurs et souterrains sont remplacés et remboursés (annulable) |
| Désélectionner le bâtiment en cours de pose | Clic droit |
| Supprimer (remboursement intégral) | Clic droit (glisser) ou outil Supprimer (`X`) : un rectangle rouge supprime tout ce qu'il touche |
| Tourner / tourner à l'envers | `R` / `Maj+R` (la pièce à poser, le collage ou le bâtiment inspecté) |
| Supprimer la sélection ou le bâtiment visé | `Suppr` |
| Ressources et recettes (popup) | `I`, bouton « Recettes » de la barre d'outils, ou menu ☰ |
| Outils | `V` Inspecter · `E` Sélection · `X` Supprimer · `1`…`9`, `0` bâtiments |
| Copier / couper / coller une disposition | `Ctrl+C` / `Ctrl+X` / `Ctrl+V` (`R` tourne le collage) |
| Annuler / rétablir | `Ctrl+Z` / `Ctrl+Y` |
| Bulles d'infos | Survoler une ressource, un bâtiment de la palette, un bouton ou un gisement : nom, prix, et toutes les cadences (objets/s des convoyeurs, recettes des machines, extraction des foreuses) avec les recherches en cours |
| Sélection | Ctrl + clic gauche : glisser = rectangle (il disparaît au relâchement, les bâtiments restent sélectionnés), clic = ajouter / retirer un bâtiment. Un clic simple sur un bâtiment non sélectionné ou dans le vide désélectionne tout |
| Déplacer la caméra | Clic molette + glisser (avec n'importe quel outil), Espace + glisser, glisser en mode Inspecter, flèches, WASD / ZQSD |
| Relier deux catapultes magnétiques | Inspecter la catapulte de départ → **Choisir la cible** → clic sur la catapulte d'arrivée (`Échap` ou clic droit pour annuler) |
| Enchaîner les recherches | Onglet Recherche : **+ File d'attente** ; la suivante démarre seule à la fin de la recherche en cours |
| Zoom | Molette, `+` / `-` |
| Tablette | Un doigt = outil actif · deux doigts = déplacer et pincer pour zoomer |

Boucle de jeu :

1. **Foreuse** sur un gisement → **convoyeurs** → **Fonderie** (lingots, briques, verre) → **Atelier** (plaques, engrenages, fils, circuits…).
2. Vends le surplus au **Comptoir de vente** (prix fixes) pour acheter des machines. Le Port revend aussi tout ce dont la station n'a pas besoin.
3. Amène des objets à un **Laboratoire** pour terminer des recherches (nouvelles machines, recettes, bonus de vitesse). Les recherches se mettent en **file d'attente**, et les laboratoires gardent en **réserve** tout ce qui servira à une recherche future : un convoyeur mélangé ne bloque plus un laboratoire, et annuler une recherche ne perd rien (ses objets retournent dans la réserve).
4. Livre les pièces demandées au **Port** : chaque étape termine une partie visible de la station.

Voyants des machines : vert = en production, orange = attend des matières, rouge = sortie bloquée. La flèche jaune indique la sortie.

Le panneau **Production** sert à trouver les goulots :

- pour chaque objet, ce qui a été **produit**, **utilisé** (machines, laboratoires, station) et **vendu** pendant la dernière minute ; un objet plus utilisé que produit s'affiche en rouge (ses stocks fondent) ;
- **Machines par recette** : combien de machines de chaque recette produisent, attendent ou sont bloquées, et quelles matières **manquent** à celles qui attendent.

La **Catapulte magnétique** (recherche *Catapultes magnétiques*) relie deux points éloignés de la carte : une catapulte reliée charge depuis n'importe quel côté et tire des salves par-dessus tout le reste vers une autre catapulte (48 cases au plus) ; une catapulte sans cible reçoit et sort les objets par sa flèche. On peut les chaîner pour traverser la carte (les boucles sont refusées). Copier-coller une paire garde la liaison.

## Cadences (équilibrage)

Toutes les cadences de base sont **deux fois plus lentes** qu'à la première version, mais les ratios restent des petits nombres entiers : chaque étape se cale sur la suivante.

- **Foreuse** : 0,5 minerai/s à pleine couverture (0,125 par case), soit 2 fonderies. **Foreuse lourde** : 2/s, soit 8 fonderies.
- **Fonderie** : 0,25 objet/s (fer, cuivre, titane, pierre, sable). **Atelier** : plaque 0,25/s (1 fonderie), engrenage 0,125/s (1 fonderie), fil 0,5/s (1 fonderie), circuit 0,25/s (1 atelier de fil + 1 de plaques), batterie 0,125/s (1 fonderie de cuivre + 1 atelier de plaques).
- **Haut-fourneau** : acier, silicium ou alliage 0,125/s (1 fonderie + 0,125 charbon/s).
- **Fabrique orbitale** : coque et processeur 0,125/s ; panneau, kit, propulseur et réservoir 0,0625/s. **Chantier spatial** (4×4) : cœur 0,0625/s, sonde 0,031/s.
- **Convoyeur de base** : environ 4,8 objets/s, **rapide** : environ 9,7/s, **blindé** : environ 14,5/s (ils ne sont jamais le goulot).
- **Catapulte magnétique** : 4 objets/s (salves de 8 toutes les 2 s, quelle que soit la recherche), soit 8 foreuses ou 2 foreuses lourdes ; portée 48 cases, stock 32 objets.
- Les améliorations *Automatisation I à IV* (+25 % chacune sur les machines) et *Forage I à IV* (+25 % chacune sur les foreuses) rendent progressivement les cadences d'origine. Elles vont par paires, donc le ratio foreuse / machines ne change pas. *Entrepôts* porte les coffres à 900 objets.

## Logistique avancée

- **Porte de débordement** (*Aiguillages II*) : entrée par l'arrière, tout sort devant ; quand devant est bloqué, le surplus part à gauche et à droite. Idéal pour remplir une ligne en priorité et envoyer le reste au Comptoir.
- **Porte de sous-débit** (*Aiguillages II*) : l'inverse, les côtés d'abord, devant seulement quand ils sont pleins.
- **Croisement** (*Aiguillages II*) : deux lignes se croisent sans se mélanger, chaque objet ressort en face de son entrée.
- **Trieur inversé** (*Tri avancé*) : l'objet choisi dans Infos sort sur les côtés, tout le reste continue tout droit.
- **Extracteur** (*Tri avancé*) : collé (dos ou côtés) à un coffre, une machine, une foreuse ou une catapulte réceptrice, il en tire 10 objets/s (filtre possible dans Infos) et les sort par sa flèche.
- **Convoyeur blindé** (*Convoyeurs blindés*, après le titane) : rails en titane, 14,5 objets/s, trois fois le convoyeur de base.
- Séparateurs, fusions, portes, croisements et coffres passent 15 objets/s : ils ne freinent jamais un convoyeur blindé.

## Progression

- 16 étapes de station (armature, cabine, réseau, coque, quai, ailes, module scientifique, anneau, antenne, radiateurs, propulseurs, soute, réacteur, bouclier, serre, mise en orbite), puis des extensions sans fin.
- Une carte de 480×320 cases : le Port est au centre, les gisements proches suffisent pour démarrer, les autres sont éparpillés sur toute la carte (le titane le plus loin), avec un grand anneau extérieur plus riche (gisements plus gros, beaucoup de titane). Les anciennes parties sont recentrées automatiquement, leurs gisements gardent exactement la même forme, et une copie de la sauvegarde d'avant est gardée dans le navigateur. Dézoom jusqu'à voir toute la carte.
- **Vue isométrique en voxels** (par défaut) : la carte est vue en diagonale, en losanges, et tout est fait de petits cubes en relief (« pixels 3D ») — bâtiments animés, gisements, objets sur les convoyeurs, ouvriers. Un bâtiment haut devient transparent quand la souris passe derrière lui, et on peut cliquer sur sa silhouette pour l'inspecter. `Tab` (ou le bouton « Vue ») revient à la vue de dessus, pratique pour les grands plans de convoyeurs ; le choix est retenu.
- **Ouvriers** : un bâtiment posé n'apparaît plus tout de suite, c'est un chantier (payé à la pose, remboursé si on l'annule ou le supprime). Un petit ouvrier à jetpack part du Port, vole en ligne droite jusqu'au chantier le plus proche (8 cases/s), le construit puis enchaîne sur le suivant : 0,2 s pour un convoyeur, 0,75 s pour une foreuse, 1 s pour une fonderie… jusqu'à 6 s pour un Chantier spatial. On démarre avec 3 ouvriers ; l'onglet Station en recrute d'autres (2 500 ¢, puis le double à chaque recrue, 12 au plus). Le compteur en haut indique combien travaillent et combien de chantiers attendent.
- **Terrain à acheter** : la carte est découpée en parcelles de 16×16 cases. On démarre avec les 3×3 parcelles autour du Port (les 5 minerais de base, pas de titane). Un clic sur une parcelle assombrie qui touche ton terrain l'achète, après confirmation : 400 ¢ la première, puis 25 % de plus à chaque achat (≈ 3 700 ¢ la 10e, 35 000 ¢ la 20e, 320 000 ¢ la 30e). La bulle de survol donne le prix et les gisements de la parcelle ; on ne construit que sur son terrain. Les anciennes parties gardent gratuitement toutes les parcelles où elles avaient déjà construit.
- 28 recherches (dont les *Catapultes magnétiques* pour les gisements lointains), avec une chaîne **titane** (minerai bleu clair, loin du Port) : lingot de titane, alliage, batterie, processeur, réservoir, puis le **Chantier spatial** pour les cœurs de réacteur et les sondes profondes.
- Les parties enregistrées avec l'ancienne station à 8 étapes sont converties automatiquement au chargement.

Changer la recette d'une machine ne perd rien : ce que la nouvelle recette utilise reste en stock, le reste (et les ingrédients d'une fabrication en cours) ressort par la sortie. Un coffre tampon débite 15 objets/s, plus qu'un convoyeur blindé (14,5/s), donc il ne freine jamais une ligne.

Pour ne jamais déborder : un coffre tampon lisse les pics, un Comptoir de vente absorbe tout, et le Port revend le surplus. Le panneau **Infos** d'une machine affiche sa cadence exacte et le ratio « alimente N fonderies » pour les foreuses.

## Sauvegarde

- **Automatique** dans le navigateur (`localStorage`) toutes les 15 secondes, au changement d'onglet et à la fermeture.
- **Exporter / importer** une partie sous forme de fichier `.json` depuis le menu ☰.
- Format versionné (`rev`, actuellement 4 : réserve des laboratoires et file de recherche) : les parties plus anciennes se chargent toujours, avec une réserve et une file vides.

## Structure du projet

```
index.html          page unique et ordre de chargement des scripts
css/style.css       interface (thème sombre, adaptée tablette)
js/util.js          utilitaires : aléatoire à graine, bruit, couleurs, DOM, événements
js/config.js        données : objets, recettes, bâtiments, arbre de recherche, étapes de la station
js/world.js         grille stricte, gisements, règles de placement, sérialisation
js/state.js         état de jeu, argent, recherche, étapes, sauvegarde/export/import
js/sim.js           simulation : convoyeurs, séparateurs, fusions, souterrains, coffres, machines
js/history.js       annuler / rétablir (toute modification passe par ici)
js/sprites.js       pixel art procédural : objets, bâtiments, convoyeurs animés, terrain
js/station.js       dessin de la station à partir de l'avancement
js/render.js        rendu canvas de la vue de dessus (zone visible seulement, tuiles entières pour garder les pixels nets)
js/voxel.js         modèles en voxels (pixels 3D) : bâtiments, convoyeurs, objets, ouvriers, sol
js/iso.js           rendu isométrique (sol en morceaux mis en cache, ordre de dessin, sélection par silhouette)
js/input.js         souris, tactile, clavier, glisser-poser, sélection, copier-coller
js/ui.js            palette, barre d'outils, panneaux (station, recherche, production, infos), dialogues
js/main.js          démarrage et boucle principale (simulation à pas fixe de 60 Hz)
```

## Notes pour modifier l'équilibrage

Tout est dans `js/config.js` : prix de vente (`ITEMS`), recettes et durées (`RECIPES`), coûts et cadences (`BUILDINGS`), coûts de recherche (`TECHS`), et quantités demandées pour la station (`PHASES`, plus la génération des extensions dans `getPhase`).

Convention des directions dans tout le code : `0` Est, `1` Sud, `2` Ouest, `3` Nord.
