# Chantier Orbital

Jeu d'automatisation 2D en vue du dessus, jouable dans le navigateur. Tu extrais des ressources, tu les transformes dans une usine que tu construis case par case, puis tu livres les pièces au **Port** pour assembler une **station spatiale**. Pas de chronomètre, pas d'échec : on optimise, on regarde la station grandir.

- Une seule partie continue, sans remise à zéro entre les étapes (16 étapes, soit bien plus d'une heure de jeu (estimation), puis des extensions sans fin).
- Pixel art généré par code (aucune image à télécharger), sauvegarde automatique, fonctionne à la souris, au clavier et au tactile (tablette).

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

## Comment jouer

| Action | Commande |
| --- | --- |
| Utiliser l'outil actif | Clic gauche |
| Poser plusieurs éléments | Glisser (les convoyeurs suivent le tracé, les autres bâtiments se posent en ligne) |
| Construire par-dessus des convoyeurs | Poser le bâtiment dessus : convoyeurs, séparateurs et souterrains sont remplacés et remboursés (annulable) |
| Désélectionner le bâtiment en cours de pose | Clic droit |
| Supprimer (remboursement intégral) | Clic droit (glisser) ou outil Supprimer (`X`) : un rectangle rouge supprime tout ce qu'il touche |
| Tourner / tourner à l'envers | `R` / `Maj+R` |
| Supprimer la sélection ou le bâtiment visé | `Suppr` |
| Ressources et recettes (popup) | `I`, bouton « Recettes » de la barre d'outils, ou menu ☰ |
| Outils | `V` Inspecter · `E` Sélection · `X` Supprimer · `1`…`9`, `0` bâtiments |
| Copier / couper / coller une disposition | `Ctrl+C` / `Ctrl+X` / `Ctrl+V` (`R` tourne le collage) |
| Annuler / rétablir | `Ctrl+Z` / `Ctrl+Y` |
| Déplacer la caméra | Flèches, WASD, ZQSD, ou Espace + glisser (ou glisser en mode Inspecter) |
| Nom d'une ressource | Survoler son icône (menus, recherche, infos, popup des recettes) ou un gisement sur la carte |
| Sélection rapide | Clic molette + glisser : rectangle de sélection, puis retour automatique à l'outil Inspecter |
| Zoom | Molette, `+` / `-` |
| Tablette | Un doigt = outil actif · deux doigts = déplacer et pincer pour zoomer |

Boucle de jeu :

1. **Foreuse** sur un gisement → **convoyeurs** → **Fonderie** (lingots, briques, verre) → **Atelier** (plaques, engrenages, fils, circuits…).
2. Vends le surplus au **Comptoir de vente** (prix fixes) pour acheter des machines. Le Port revend aussi tout ce dont la station n'a pas besoin.
3. Amène des objets à un **Laboratoire** pour terminer des recherches (nouvelles machines, recettes, bonus de vitesse).
4. Livre les pièces demandées au **Port** : chaque étape termine une partie visible de la station.

Voyants des machines : vert = en production, orange = attend des matières, rouge = sortie bloquée. La flèche jaune indique la sortie. Le panneau **Production** donne la cadence de la dernière minute pour repérer les goulots.

## Cadences (équilibrage)

Toutes les cadences de base sont **deux fois plus lentes** qu'à la première version, mais les ratios restent des petits nombres entiers : chaque étape se cale sur la suivante.

- **Foreuse** : 0,5 minerai/s à pleine couverture (0,125 par case), soit 2 fonderies. **Foreuse lourde** : 2/s, soit 8 fonderies.
- **Fonderie** : 0,25 objet/s (fer, cuivre, titane, pierre, sable). **Atelier** : plaque 0,25/s (1 fonderie), engrenage 0,125/s (1 fonderie), fil 0,5/s (1 fonderie), circuit 0,25/s (1 atelier de fil + 1 de plaques), batterie 0,125/s (1 fonderie de cuivre + 1 atelier de plaques).
- **Haut-fourneau** : acier, silicium ou alliage 0,125/s (1 fonderie + 0,125 charbon/s).
- **Fabrique orbitale** : coque et processeur 0,125/s ; panneau, kit, propulseur et réservoir 0,0625/s. **Chantier spatial** (4×4) : cœur 0,0625/s, sonde 0,031/s.
- **Convoyeur de base** : environ 4,8 objets/s, **rapide** : environ 9,7/s (ils ne sont jamais le goulot).
- Les améliorations *Automatisation I à IV* (+25 % chacune sur les machines) et *Forage I à IV* (+25 % chacune sur les foreuses) rendent progressivement les cadences d'origine. Elles vont par paires, donc le ratio foreuse / machines ne change pas. *Entrepôts* porte les coffres à 900 objets.

## Progression

- 16 étapes de station (armature, cabine, réseau, coque, quai, ailes, module scientifique, anneau, antenne, radiateurs, propulseurs, soute, réacteur, bouclier, serre, mise en orbite), puis des extensions sans fin.
- Une carte de 240×160 cases (6 fois plus grande qu'avant) : le Port est au centre, les gisements proches suffisent pour démarrer, les autres sont éparpillés sur toute la carte (le titane le plus loin). Les anciennes parties sont recentrées automatiquement.
- 27 recherches, dont une chaîne **titane** (minerai turquoise, loin du Port) : lingot de titane, alliage, batterie, processeur, réservoir, puis le **Chantier spatial** pour les cœurs de réacteur et les sondes profondes.
- Les parties enregistrées avec l'ancienne station à 8 étapes sont converties automatiquement au chargement.

Pour ne jamais déborder : un coffre tampon lisse les pics, un Comptoir de vente absorbe tout, et le Port revend le surplus. Le panneau **Infos** d'une machine affiche sa cadence exacte et le ratio « alimente N fonderies » pour les foreuses.

## Sauvegarde

- **Automatique** dans le navigateur (`localStorage`) toutes les 15 secondes, au changement d'onglet et à la fermeture.
- **Exporter / importer** une partie sous forme de fichier `.json` depuis le menu ☰.

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
js/render.js        rendu canvas (zone visible seulement, tuiles entières pour garder les pixels nets)
js/input.js         souris, tactile, clavier, glisser-poser, sélection, copier-coller
js/ui.js            palette, barre d'outils, panneaux (station, recherche, production, infos), dialogues
js/main.js          démarrage et boucle principale (simulation à pas fixe de 60 Hz)
```

## Notes pour modifier l'équilibrage

Tout est dans `js/config.js` : prix de vente (`ITEMS`), recettes et durées (`RECIPES`), coûts et cadences (`BUILDINGS`), coûts de recherche (`TECHS`), et quantités demandées pour la station (`PHASES`, plus la génération des extensions dans `getPhase`).

Convention des directions dans tout le code : `0` Est, `1` Sud, `2` Ouest, `3` Nord.
