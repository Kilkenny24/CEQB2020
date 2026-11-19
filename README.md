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
| Annotations | Ligne, flèche, rectangle, ellipse, **nuage de révision**, polyligne, polygone, main levée, surligneur, texte, **bulle (callout)** |
| Mesures | **Calibration** (K) sur une cote connue ou échelles prédéfinies (1/8" = 1'-0", 1:100…), longueur, longueur de polyligne, aire — en pi-po, m ou mm |
| Éclairage | Bibliothèque de **symboles** (encastrés, 2×4, 2×2, réglettes, linéaires, appliques, wall pack, rail, sortie, bloc d'urgence, détecteurs, interrupteurs, gradateurs, photocellule, panneau de contrôle) avec **étiquette de type** (A, B1…) |
| Décompte | Comptage automatique par symbole + type, par page et total ; quantités mesurées |
| Propriétés | Couleur, remplissage, épaisseur, opacité, trait, police, commentaire, auteur, dates |
| Édition | Sélection multiple (Maj, rectangle), déplacement, poignées, Alt+glisser = dupliquer, copier/coller, annuler/rétablir |

### Créer vos propres icônes

**+ Nouveau symbole** (ou ✎ / ⧉ sur un symbole existant) :

- choisissez une forme (cercle, carré, 2×4, linéaire, hexagone, losange, cercle + texte, etc.) **ou importez une image PNG/JPG** (icône de fabricant, pictogramme maison) ;
- donnez un nom, une catégorie (ex. le nom du projet), une étiquette de type, une couleur et une taille en points ;
- en modifiant un symbole, l'option *Mettre à jour les symboles déjà placés* propage le changement sur le plan.

La bibliothèque est conservée dans le navigateur. **Exporter biblio.** produit un fichier `.json` à partager avec vos collègues ou à
réimporter sur un autre poste.

## Enregistrer

| Bouton | Résultat |
|---|---|
| **Enregistrer** (Ctrl+S) | Fichier projet `*.lumiplan.json` : annotations éditables, échelles, symboles utilisés. Le PDF reste intact. |
| **Projet + PDF** | Un seul fichier `*.lumiplan-complet.json` qui contient aussi le PDF (pratique pour archiver / envoyer). |
| **PDF annoté** | Copie du PDF avec les annotations **aplaties** (dessinées dans la page) — lisible partout, y compris Bluebeam et Acrobat. |
| **CSV** | Décompte par type et par page + liste complète, prêt pour Excel (séparateur `;`, UTF-8). |

Une **sauvegarde automatique** est faite en continu dans le navigateur ; à la réouverture du même PDF, LumiPlan propose de la restaurer.
Elle ne remplace pas le fichier projet (vider le cache du navigateur l'efface).

## Limites connues (à lire avant de l'utiliser en production)

- **Les annotations exportées sont aplaties**, pas des annotations PDF natives : elles ne sont *pas* modifiables ni comptées dans la
  liste de marques de Bluebeam/Acrobat. Pour les modifier, rouvrez le fichier projet dans LumiPlan.
- Les annotations Bluebeam existantes dans un PDF sont affichées, mais **ne sont pas importées** comme annotations modifiables.
- Les PDF protégés par mot de passe / chiffrés peuvent s'afficher mais l'export peut échouer.
- Texte exporté en Helvetica standard : les caractères hors Windows-1252 (rares en français) sont remplacés par `?`.
- Pas d'accrochage (snap) aux objets du PDF, pas de calques, pas de comparaison de révisions, pas de sessions multi-utilisateurs.
- Ouvert en `file://`, pdf.js tourne sans Web Worker : l'ouverture d'un très gros plan peut figer l'interface quelques secondes.
  Servi par un petit serveur web local, le rendu passe dans un worker.

## Raccourcis

`V` sélection · `H` main · `S` symbole · `L` ligne · `A` flèche · `R` rectangle · `E` ellipse · `C` nuage · `P` polyligne · `G` polygone ·
`F` main levée · `I` surligneur · `T` texte · `Q` bulle · `K` calibrer · `M` longueur · `N` longueur polyligne · `B` aire ·
`Entrée`/double-clic = terminer · `Échap` = annuler · `Suppr` · `Ctrl+Z/Y/C/V/D/S/O` · `[` `]` pivoter les symboles · flèches = déplacer.

## Structure

```
index.html          interface
css/app.css         styles
js/renderer.js      moteur de dessin commun écran (Canvas) / export (PDF)
js/symbols.js       formes et bibliothèque de symboles d'éclairage
js/annotations.js   dessin, sélection et description des annotations
js/measure.js       échelles, unités, longueurs et aires
js/exporter.js      export PDF (pdf-lib)
js/storage.js       IndexedDB, enregistrement de fichiers
js/app.js           visionneuse, outils, panneaux, fichiers
vendor/             pdf.js et pdf-lib (licences incluses)
```

Le même code de dessin sert à l'écran et à l'export PDF : ce que vous voyez est ce qui est exporté.
