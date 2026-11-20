# LumiPlan — annotation de plans PDF pour l'éclairage

Application **100 % locale** pour lire des plans PDF, les annoter comme dans Bluebeam et faire le décompte de luminaires.
Aucune installation, aucun serveur, aucun compte, aucune dépendance à un service externe (ni Anthropic, ni cloud) :
les fichiers ne quittent jamais votre poste.

## Démarrer

1. Téléchargez le dossier (ou `git clone`).
2. Double-cliquez sur **`index.html`** — il s'ouvre dans votre navigateur (Chrome ou Edge recommandés).
3. Glissez un PDF dans la fenêtre ou cliquez sur **Ouvrir PDF**.

Fonctionne hors ligne. Les seules bibliothèques utilisées sont incluses dans `vendor/` :
[pdf.js](https://github.com/mozilla/pdf.js) 3.11.174 (Apache 2.0, Mozilla) pour l'affichage et
[pdf-lib](https://github.com/Hopding/pdf-lib) 1.17.1 (MIT) pour l'export.

## Fonctions

| Catégorie | Outils |
|---|---|
| Navigation | Molette = zoom au curseur, Espace/clic-molette/H = déplacer, pages, rendu net à tout niveau de zoom |
| Annotations | Ligne, flèche, rectangle, ellipse, **nuage de révision**, polyligne, polygone, main levée, surligneur, texte, **bulle (callout)**, **note (commentaire)** |
| Collaboration | Les annotations déjà présentes dans le PDF (Bluebeam, Acrobat, Foxit…) sont **importées et modifiables** : auteur, dates, commentaire, **fil de réponses** ; filtre par auteur |
| Mesures | **Calibration** (K) sur une cote connue ou échelles prédéfinies (1/8" = 1'-0", 1:100…), longueur, longueur de polyligne, aire — en pi-po, m ou mm |
| Éclairage | Bibliothèque de **symboles** (encastrés, 2×4, 2×2, réglettes, linéaires, appliques, wall pack, rail, sortie, bloc d'urgence, détecteurs, interrupteurs, gradateurs, photocellule, panneau de contrôle) avec **étiquette de type** (A, B1…) |
| Décompte | Comptage automatique par symbole + type, par page et total ; quantités mesurées |
| Propriétés | Couleur, remplissage, épaisseur, opacité, trait, police, commentaire, auteur, dates |
| Édition | Sélection multiple (Maj, rectangle), déplacement, poignées, Alt+glisser = dupliquer, copier/coller, annuler/rétablir |

### Dimensions des symboles (pi-po ou mm, jamais en points)

Chaque symbole a une **longueur × largeur** (ou un **diamètre** pour les formes rondes) en unités réelles, selon l'un de deux modes :

| Mode | Usage | Exemple |
|---|---|---|
| **À l'échelle réelle** | Luminaires dessinés à l'échelle : la taille suit l'échelle de la page | 2×4 = `4'` × `2'` ; linéaire `1200 mm` × `75 mm` ; downlight Ø `6"` |
| **Taille sur papier** | Symboles schématiques (détecteurs, interrupteurs, sorties) : taille fixe sur la feuille imprimée | détecteur Ø `1/4"` ; interrupteur `6 mm` |

- **Calibrez d'abord la page** (outil K, ou choisissez l'échelle en bas de l'écran). Sur une page non calibrée, les symboles à l'échelle
  s'affichent à une taille provisoire entourée d'un **cadre orange**, et prennent leur vraie taille dès que l'échelle est définie.
- Saisie acceptée : `4'` · `48"` · `2'-6 1/2"` · `1/4"` · `1200 mm` · `0,6 m`. Un nombre sans unité est lu en **pouces** (unités pi-po)
  ou en **mm** (unités mm/m), selon le sélecteur *Unités* en bas de l'écran.
- **Cliquer-glisser** avec un symbole allongé (linéaire, 2×4, rail…) le pose **à la longueur tracée** et dans l'orientation du geste,
  arrondie au pouce ou à 10 mm (Maj = angles de 15°). Un simple clic le pose à sa longueur par défaut.
- Chaque symbole placé peut avoir ses propres dimensions (panneau *Propriétés*) ; le **décompte** sépare les longueurs différentes
  (ex. « Linéaire DEL (4'-0" × 3") » et « (8'-0" × 3") »).

### Créer vos propres icônes

**+ Nouveau symbole** (ou ✎ / ⧉ sur un symbole existant) :

- choisissez une forme (cercle, carré, 2×4, linéaire, hexagone, losange, cercle + texte, etc.) **ou importez une image PNG/JPG** (icône de fabricant, pictogramme maison) ;
- donnez un nom, une catégorie (ex. le nom du projet), une étiquette de type, une couleur, le mode et les dimensions ;
- en modifiant un symbole, l'option *Mettre à jour les symboles déjà placés* propage le changement sur le plan.

### Organiser la bibliothèque

- **Glisser un symbole** vers le haut ou le bas pour le réordonner ; le déposer sur un autre groupe le **change de catégorie**.
- **Glisser un titre de catégorie** pour déplacer tout le groupe.
- Boutons **▲ ▼** au survol d'un symbole (même effet, sans glisser).
- Déposer un symbole sur **« ＋ Déposer ici pour créer une catégorie »** pour créer un nouveau groupe (ex. un projet).
- **Clic** sur une catégorie = replier / déplier ; **double-clic** = renommer (renommer avec un nom existant fusionne les deux groupes).

La bibliothèque est conservée dans le navigateur. **Exporter biblio.** produit un fichier `.json` à partager avec vos collègues ou à
réimporter sur un autre poste.

## Atelier de symboles (`atelier.html`)

Outil compagnon pour dessiner des **symboles avancés** et se bâtir une **banque** réutilisable. Ouvrez `atelier.html`
(double-clic, ou bouton **🎨 Atelier de symboles** dans LumiPlan).

**Dessiner**
- Éléments : ligne, polyligne, polygone, courbe lisse, rectangle, ellipse, cercle (reste rond même si le symbole est
  allongé), arc / secteur, texte. Couleur de trait et de remplissage, épaisseur en points, tirets, opacité, ordre, miroir,
  rotation 90°, duplication, masquage ; grille avec magnétisme ; Maj = angles de 15° / carré.
- Couleur « **du symbole** » : l'élément prend la couleur choisie dans LumiPlan (recolorable). « Couleur fixe » sinon.
- Texte **`{tag}`** : affiche l'étiquette du luminaire (A, B1…) à l'intérieur du symbole.
- Dimensions réelles (à l'échelle ou taille papier) comme dans LumiPlan ; l'éditeur montre les épaisseurs telles qu'elles
  paraîtront sur un plan à l'*échelle de référence* choisie, et l'aperçu montre le symbole sur le plan.

**Importer**
- **Images et photos** (PNG, JPG, WebP, GIF, BMP — bouton, glisser-déposer ou **Ctrl+V** d'une capture d'écran) :
  réduction automatique (256 à 2048 px), **retrait du fond blanc** avec tolérance, rognage des marges, noir et blanc.
  Une image se combine avec des traits et du texte dans le même symbole.
- **SVG** (pictogrammes de fabricants, dessins Illustrator / Inkscape) : chemins avec courbes et arcs, rectangles,
  cercles, ellipses, lignes, polygones, textes ; transformations et styles appliqués.
- **Depuis LumiPlan** : n'importe quel symbole de la bibliothèque, converti en éléments modifiables.
- **Fichier** de banque ou de bibliothèque LumiPlan (`.json`).

**Transférer vers LumiPlan**
- **⇢ Envoyer à LumiPlan / Tout envoyer** : écrit directement dans la bibliothèque de LumiPlan, qui se met à jour
  immédiatement même s'il est déjà ouvert. Fonctionne dans **Chrome et Edge** (même navigateur, même ordinateur).
  Renvoyer un symbole modifié met à jour celui de LumiPlan (même identifiant).
- **⤓ Exporter la banque** : fichier `.json` à importer dans LumiPlan (*Importer biblio.*) — pour Firefox, un autre poste
  ou un collègue.

La banque est conservée dans le navigateur ; exportez-la régulièrement comme sauvegarde.

## Enregistrer

| Bouton | Résultat |
|---|---|
| **Enregistrer** (Ctrl+S) | Fichier projet `*.lumiplan.json` : annotations éditables, échelles, symboles utilisés. Le PDF reste intact. |
| **Projet + PDF** | Un seul fichier `*.lumiplan-complet.json` qui contient aussi le PDF (pratique pour archiver / envoyer). |
| **PDF annoté** | Copie du PDF avec des **annotations PDF natives** : sélectionnables, modifiables et listées dans Bluebeam / Acrobat (auteur, commentaire, réponses). Les symboles deviennent des tampons dont le *Sujet* = nom du symbole + type. |
| **PDF aplati** | Les annotations sont dessinées dans la page (plus modifiables) — pour une émission « finale ». |
| **CSV** | Décompte par type et par page + liste complète, prêt pour Excel (séparateur `;`, UTF-8). |

Une **sauvegarde automatique** est faite en continu dans le navigateur ; à la réouverture du même PDF, LumiPlan propose de la restaurer.
Elle ne remplace pas le fichier projet (vider le cache du navigateur l'efface).

### Annotations des autres participants

À l'ouverture, LumiPlan lit les annotations standard du PDF : rectangles, nuages, ellipses, lignes et flèches, polylignes,
polygones, encre, zones de texte, bulles, notes, surlignage / soulignement / barré, ainsi que leurs **réponses**.
Elles deviennent des annotations LumiPlan ordinaires : on peut les déplacer, modifier leur commentaire, y répondre ou les supprimer.

À l'export **PDF annoté** :
- une annotation importée **non modifiée** est remise **telle quelle** (aucune perte des propriétés propres à Bluebeam : colonnes
  personnalisées, statut, mesures, calques…) ;
- une annotation **modifiée** garde son objet PDF et ses propriétés inconnues ; seuls la géométrie, le style, le texte et
  l'apparence sont réécrits ;
- tout ce que LumiPlan ne gère pas (tampons tiers, liens, champs de formulaire, pièces jointes) reste intact et non modifiable.

## Limites connues (à lire avant de l'utiliser en production)

- **Tests faits avec des PDF générés, pas avec de vrais fichiers Bluebeam.** Le format est standard, mais vérifiez sur un vrai
  dossier de plans avant de vous y fier : ouvrez le PDF exporté dans Bluebeam et comparez.
- Quand vous modifiez une annotation importée, sa mise en forme riche (gras, polices multiples) est remplacée par du texte simple ;
  une mesure Bluebeam modifiée est recalculée par Bluebeam, pas par LumiPlan.
- Les tampons d'autres logiciels sont visibles mais pas modifiables.
- Les PDF protégés par mot de passe / chiffrés : affichage seulement, export « aplati » uniquement.
- La lecture des annotations analyse tout le fichier : sur un très gros jeu de plans (centaines de Mo), l'ouverture prend
  quelques secondes de plus.
- Texte exporté en Helvetica standard : les caractères hors Windows-1252 (rares en français) sont remplacés par `?`.
- Pas d'accrochage (snap) aux objets du PDF, pas de calques, pas de comparaison de révisions, pas de sessions multi-utilisateurs.

## Raccourcis

`V` sélection · `H` main · `S` symbole · `L` ligne · `A` flèche · `R` rectangle · `E` ellipse · `C` nuage · `P` polyligne · `G` polygone ·
`F` main levée · `I` surligneur · `T` texte · `Q` bulle · `O` note · `K` calibrer · `M` longueur · `N` longueur polyligne · `B` aire ·
`Entrée`/double-clic = terminer · `Échap` = annuler · `Suppr` · `Ctrl+Z/Y/C/V/D/S/O` · `[` `]` pivoter les symboles · flèches = déplacer.

## Structure

```
index.html          interface
css/app.css         styles
js/renderer.js      moteur de dessin commun écran (Canvas) / export (PDF)
js/symbols.js       formes et bibliothèque de symboles d'éclairage
js/annotations.js   dessin, sélection et description des annotations
js/measure.js       échelles, unités, longueurs et aires
js/exporter.js      export PDF aplati (pdf-lib)
js/pdfnative.js     import / export des annotations PDF natives (auteurs, réponses)
js/storage.js       IndexedDB, enregistrement de fichiers
js/app.js           visionneuse, outils, panneaux, fichiers
atelier.html        Atelier de symboles (css/atelier.css, js/atelier.js)
vendor/             pdf.js et pdf-lib (licences incluses) ; pdf.worker.src.js = worker pdf.js sous forme
                    de chaîne pour démarrer un Web Worker même en double-cliquant sur index.html
```

Le même code de dessin sert à l'écran et à l'export PDF : ce que vous voyez est ce qui est exporté.
