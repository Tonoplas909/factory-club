# Chantiers 3 à 9 : choix de design faits sans validation

Macalamar a demandé d'enchaîner les chantiers jusqu'au bout sans s'arrêter. Voici les décisions prises
en chemin, à relire et corriger si besoin. Le détail joueur est dans le README.

## 3. Énergie
- Consommateurs : foreuses, machines, laboratoires, catapultes (seulement pour tirer), pompes, port de drones, pas de tir. Convoyeurs et aiguillages n'en ont pas besoin.
- Le Port est une centrale de 150 kW (zone de 6 cases), pour que le tout début reste jouable.
- Réseaux automatiques : zones de couverture + liaison par portée (poteau 7, pylône 18). Pas de câblage manuel.
- Réseau trop chargé : toutes ses machines ralentissent au prorata (pas de coupure brutale).
- Anciennes parties : leurs machines hors de la zone du Port s'arrêtent ; un message l'explique au premier chargement (format de sauvegarde 7).

## 4. Fluides
- Lacs et nappes ajoutés uniquement sur des cases vides : aucun gisement existant ne bouge (vérifié sur 4 graines).
- On peut construire sur l'eau (sinon d'anciennes constructions auraient disparu).
- Pas de pression ni de débit : un réseau de tuyaux est une seule cuve partagée, un seul fluide.
- Les bâtiments ne conduisent pas : ils utilisent chaque réseau qui les touche, sans mélanger.
- Nouveaux objets : plastique et carburant, utilisés par les drones et le programme orbital.

## 5. Améliorations
- Niveaux II et III pour foreuses, machines, pompes et générateurs ; ×1,5 / ×2 en vitesse, ×1,6 / ×2,4 en courant ; prix 2× puis 4× le bâtiment.
- Remboursé à la suppression, annulable, gardé par le copier-coller, les plans et les fantômes.

## 6. Contrats du Port
- Ouverts après la première livraison ; 3 offres, 2 contrats acceptés au plus, renouvelées toutes les 3 minutes.
- Récompense 1,6 à 2,4× le prix de vente ; aucune pénalité en cas d'échec.
- Les livraisons au Port remplissent les contrats avant la station.

## 7. Drones
- Port de drones (4 drones, portée 24, 10 objets par vol), coffres d'envoi et de demande (40 au plus, objet choisi).
- Les drones ne sont pas sauvegardés ; la cargaison en vol est rangée dans le coffre de demande.

## 8. Programme orbital
- La station existante reste l'objectif principal ; le programme vient en plus.
- Pas de tir : 10 modules + 1 charge utile (satellite ou sonde) par fusée ; 5 missions à bonus permanents, puis des missions profondes payées en crédits.
