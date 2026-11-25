# LumiPlan — annotation de plans PDF pour l'éclairage

Application **100 % locale** pour lire des plans PDF, les annoter comme dans Bluebeam et faire le décompte de luminaires.
Aucune installation, aucun serveur, aucun compte, aucune dépendance à un service externe (ni Anthropic, ni cloud) :
les fichiers ne quittent jamais votre poste.

## Démarrer

**Le plus simple — versions autonomes (un seul fichier chacune) :** dans le dossier `dist/`, double-cliquez sur
**`LumiPlan.html`** ou **`Atelier.html`**. Ces fichiers contiennent tout (mise en forme, scripts, bibliothèques) :
ils fonctionnent même copiés seuls sur le bureau, sur une clé USB ou envoyés par courriel. Gardez-les dans le même
dossier pour que les liens LumiPlan ↔ Atelier fonctionnent.

**Version à dossiers (développement) :** `index.html` et `atelier.html` à la racine ont besoin des dossiers `css/`, `js/`
et `vendor/` à côté d'eux. **Décompressez d'abord le .zip** (clic droit → *Extraire tout…*) : ouvert directement depuis le
zip, la page s'affiche sans mise en forme — un message l'explique désormais.

Chrome ou Edge recommandés. Glissez un PDF dans la fenêtre ou cliquez sur **Ouvrir PDF**.

Fonctionne hors ligne. Les seules bibliothèques utilisées sont incluses dans `vendor/` :
[pdf.js](https://github.com/mozilla/pdf.js) 3.11.174 (Apache 2.0, Mozilla) pour l'affichage et
[pdf-lib](https://github.com/Hopding/pdf-lib) 1.17.1 (MIT) pour l'export.

## Interface

- **Barre de titre** : document et feuille en cours, **recherche** dans le PDF (Ctrl+F), état de l'enregistrement, auteur,
  thème clair / sombre, Atelier de symboles, aide.
- **Ruban** par groupes : Fichier · Édition · Sélection · Annotation · Mesure · Éclairage · Révision. Sur un écran moins
  large, les outils passent en icônes seules (le nom s'affiche au survol).
- **Panneau de gauche** : Symboles · Liste (décompte, annotations) · Tableau (luminaires) · Circuits · Pages (révision).
- **Panneau de droite** : propriétés de la sélection. **Barre d'état** : échelle, unités, pages, zoom.
- **Écran d'accueil** avec les **documents récents** (Chrome / Edge : un clic rouvre le PDF et son projet).

## Fonctions

| Catégorie | Outils |
|---|---|
| Navigation | Molette = zoom au curseur, Espace/clic-molette/H = déplacer, pages, rendu net à tout niveau de zoom |
| Annotations | Ligne, flèche, rectangle, ellipse, **nuage de révision**, polyligne, polygone, main levée, surligneur, texte, **bulle (callout)**, **note (commentaire)** |
| Collaboration | Les annotations déjà présentes dans le PDF (Bluebeam, Acrobat, Foxit…) sont **importées et modifiables** : auteur, dates, commentaire, **fil de réponses** ; filtre par auteur |
| Mesures | **Calibration** (K) sur une cote connue ou échelles prédéfinies (1/8" = 1'-0", 1:100…), longueur, longueur de polyligne, aire — en pi-po, m ou mm |
| Éclairage | Bibliothèque de **symboles** (encastrés, 2×4, 2×2, réglettes, linéaires, appliques, wall pack, rail, sortie, bloc d'urgence, détecteurs, interrupteurs, gradateurs, photocellule, panneau de contrôle) avec **étiquette de type** (A, B1…) |
| Décompte | Comptage automatique par symbole + type, par page et total ; quantités mesurées |
| Tableau des luminaires | Données par type (fabricant, modèle, W, lm, tension, K, montage, remarques), quantités et puissance ; tableau **placé sur la feuille** et exporté dans le PDF |
| Circuits | Circuit et zone de contrôle par luminaire, charge (W) par circuit, zones sans contrôle signalées, coloration du plan, circuit inscrit sous les luminaires |
| Révisions | Report des annotations sur la révision suivante, repérage des **zones modifiées**, nuages de révision automatiques |
| Échelle | **Lecture automatique** de l'échelle inscrite sur chaque feuille (1/8" = 1'-0", 1:100…) |
| Recherche | Texte du PDF (numéros de locaux, notes, noms de feuilles) avec surlignage |
| Favoris | Symboles sur les touches **1 à 9** (★ dans la bibliothèque) |
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

### Dupliquer et répéter les symboles (réseaux)

Boutons **Dupliquer**, **Réseau grille** et **Réseau esp.** à droite de la barre d'outils (aussi dans le panneau *Propriétés*
quand un symbole est sélectionné). Sans sélection, cliquez le bouton puis le symbole à répéter. Pour un groupe (un luminaire
et son détecteur, par exemple), sélectionnez-le d'abord (Maj+clic ou rectangle), puis cliquez le bouton :

- **⧉ Dupliquer** (ou Ctrl+D, Ctrl+C / Ctrl+V, Alt+glisser).
- **▦ Réseau grille** (*array grid*) : nombre de **colonnes × rangées**, **espacement X / Y** centre à centre en pi-po ou mm
  (`8'`, `8'-6"`, `2400 mm` ; valeur négative = vers la gauche / le haut) et angle. L'original occupe la première cellule.
- **⬚ Réseau espacement** (*array spacing*) : tracez la **pièce** (rectangle) ou, avec **Maj**, une **ligne** (corridor,
  rangée continue), puis répartissez :
  - **par espacement** (ex. 8'-0" c/c) : le nombre est calculé et le groupe est centré (même distance aux deux murs) ;
  - **par nombre** (ex. 4 × 2) : l'espacement est calculé avec un **demi-espacement aux murs**.
  Le panneau affiche le nombre de copies, l'espacement réel et la distance aux murs. Sur une ligne, les symboles peuvent
  s'orienter le long de celle-ci. Le modèle d'origine est retiré (case à cocher pour le conserver).

Un aperçu s'affiche sur le plan pendant le réglage ; **Appliquer** crée les copies (Ctrl+Z pour annuler), **Échap** abandonne.
La page doit être calibrée.

### Créer vos propres icônes

**+ Nouveau symbole** (ou ✎ / ⧉ sur un symbole existant) :

- choisissez une forme (cercle, carré, 2×4, linéaire, hexagone, losange, cercle + texte, etc.) **ou importez une image PNG/JPG** (icône de fabricant, pictogramme maison) ;
- donnez un nom, une catégorie (ex. le nom du projet), une étiquette de type, une couleur, le mode et les dimensions ;
- en modifiant un symbole, l'option *Mettre à jour les symboles déjà placés* propage le changement sur le plan.

### Bibliothèques prêtes à importer (`bibliotheques/`)

- `eclairage-urgence.lumiplan-lib.json` : 17 symboles d'éclairage d'urgence (phares simples / doubles muraux et plafond,
  accumulateurs, indicateurs d'issue simples / doubles, muraux / plafond, avec ou sans flèche), en taille papier, catégorie
  *Urgence*. **Importer** dans l'onglet Symboles ; modifiables dans l'Atelier. Régénérer : `node tools/gen-urgence.js`.
- `appareils-exterieurs.lumiplan-lib.json` : 9 appareils extérieurs (applique murale, cylindre mural, luminaires sur fût
  simple / double / triple / quadruple, bollard, colonne lumineuse en taille papier ; luminaire mural 1' × 2' à l'échelle),
  catégorie *Appareils extérieurs*. Régénérer : `node tools/gen-exterieur.js`.

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

## Tableau des luminaires (onglet *Tableau*)

Chaque **type** correspond à l'**étiquette** des symboles (A, B1…). Cliquez sur un type pour saisir description, fabricant,
modèle, puissance (W), flux (lm), tension, température de couleur, montage et remarques. Les quantités et la puissance totale
se calculent seules.

**Placer sur la feuille** (onglet Tableau ou ruban *Éclairage*) ajoute le tableau à la page : déplacez-le à la souris ;
dans *Propriétés*, choisissez le titre, la portée (projet ou feuille), la taille du texte et les colonnes. Il se met à jour
automatiquement et sort proprement dans le PDF remis aux professionnels (une seule marque « Tableau des luminaires » dans
Bluebeam). Les données sont enregistrées avec le projet et incluses dans le CSV.

## Circuits et zones de contrôle (onglet *Circuits*)

Sélectionnez un ou plusieurs luminaires (rectangle ou Maj+clic) et saisissez **Circuit** (ex. P1-12) et **Zone contrôle**
dans *Propriétés*. L'onglet affiche la **charge par circuit** (W, d'après le tableau des luminaires) et les **zones de contrôle**,
avec un avertissement pour une zone qui contient des luminaires mais aucun détecteur, interrupteur ou gradateur. Un clic sur
une ligne sélectionne ces luminaires. Le plan peut être **coloré par circuit, zone ou type**, et le circuit **inscrit sous chaque
luminaire** (ruban *Éclairage*) ; couleurs et inscriptions apparaissent aussi dans le PDF exporté.

## Petits projets : nouveau plan, locaux, portes, plafonds (ruban *Espace*)

**Nouveau plan** (ruban *Fichier* ou écran d'accueil) : nom du projet, format (Lettre à ARCH E, A3 à A0), orientation,
échelle (1/4" = 1'-0" par défaut), **grille de référence** (1' × 1' avec repère aux 5', 6", 1 m, 0,5 m ou aucune) et nombre de
pages. La feuille est générée avec un cartouche simple et une échelle graphique ; elle est **calibrée d'office**, et LumiPlan
retrouve l'échelle et la grille en rouvrant ce PDF. Enregistrez le projet (Ctrl+S) ; *Exporter* produit le PDF avec vos dessins.

- **Local** (U) : *Rectangle* (2 clics aux coins) ou *Polygone* (clics ; Entrée, double-clic ou clic sur le premier sommet pour
  fermer ; Retour arrière retire un sommet). Les dimensions s'affichent pendant le tracé ; **magnétisme** sur la grille de 1'
  (100 mm en métrique). Murs à l'échelle (6" par défaut), **hauteur de plafond 10'-0"** par défaut ; nom, superficie et hauteur
  inscrits au centre. Les sommets se déplacent avec leurs poignées.
- **Porte** (D) : clic sur un mur ; largeur 3'-0" par défaut ; ouverture vers l'intérieur ou l'extérieur, côté des pentures et
  position réglables (propriétés de la porte).
- **Plafond** (J) : choisissez 2 × 2 ou 2 × 4 dans le ruban, cliquez dans un local : grille centrée et découpée selon la forme
  du local ; orientation (horizontale / verticale) dans les propriétés du local.
- Un **luminaire posé dans un local** prend la hauteur de plafond du local ; en changeant la hauteur d'un local, cochez
  « Appliquer la hauteur aux luminaires du local » pour les mettre à jour.

## Câblage (ruban *Câblage*, onglet *Câbles*)

**Tracer** : choisissez le type dans le ruban (120 V, 0-10 V, CAT5e, DMX, 12 V, 24 V, 48 V, LAN), outil **Câble** (W), cliquez une
composante puis la suivante ; le tracé continue en chaîne (pratique pour le DMX ou le 0-10 V). Échap termine la chaîne.

- Chaque type a sa couleur **et** son motif de trait (lisible en noir et blanc) ; le type peut être inscrit sur le câble, avec sa longueur.
- Les câbles sont **légèrement courbés** ; plusieurs câbles entre les mêmes composantes sont écartés de part et d'autre, et leurs
  étiquettes décalées. La courbure se règle dans les propriétés du câble.
- **Au plus 3 types de câbles par composante** (un 4e type est refusé).
- Les câbles **suivent les symboles** déplacés ; supprimer un symbole supprime ses câbles ; copier un groupe copie les câbles entre
  les copies ; une nouvelle révision reporte aussi les câbles.

**Longueurs approximatives** : (longueur de la courbe sur le plan + différence de hauteur de montage entre deux luminaires
\+ 2 × raccordement) × (1 + réserve). Vers un contrôle d'éclairage (sans hauteur de montage), seul le raccordement s'ajoute.
Réserve (10 %) et raccordement (1') réglables dans l'onglet *Câbles*, qui donne le total par type et la liste des liens ; détail
complet dans le CSV. Estimation pour la soumission, pas un relevé de chantier : le tracé réel (chemins de câbles, descentes,
passages) n'est pas modélisé.

**Hauteur de montage (luminaires seulement)** : chaque luminaire posé reçoit **10'-0"** par défaut (réglable : propriétés de
l'outil Symbole ou onglet *Câbles*) ; modifiable par luminaire ou sélection multiple dans *Propriétés*. Les **contrôles
d'éclairage** (détecteurs, interrupteurs, gradateurs, photocellules, capteurs, panneaux de contrôle) n'ont pas de hauteur ; ils
sont reconnus par la catégorie ou le nom du symbole. Bouton **Hauteurs** : inscrit la hauteur sous chaque luminaire, aussi
dans le PDF exporté.

## Images (photos, logos, captures)

Bouton **Image** (ruban *Annotation*), **glisser-déposer** un fichier sur le plan, ou **Ctrl+V** d'une capture d'écran.
Formats : JPG, PNG, WebP, GIF, BMP (plusieurs fichiers à la fois avec le bouton).

- **Redimensionner** : poignées aux 4 coins, proportions gardées (**Maj** pour déformer). Ou saisir *Largeur / Hauteur*
  dans les propriétés : en pi-po ou mm si la page est calibrée, sinon en pouces sur papier.
- Rotation par 90°, opacité (calque de référence), contour optionnel, *Remplacer l'image…*, premier plan / arrière-plan.
  Une nouvelle image se place au-dessus des annotations : *Arrière-plan* pour la passer dessous.
- Un PDF n'accepte que JPEG et PNG : WebP, GIF, BMP sont **convertis** (photo → JPEG, transparence/dessin → PNG ;
  un GIF animé devient fixe). L'orientation des photos de téléphone (EXIF) est corrigée.
- Les images de plus de **2400 px** sont réduites (réglable : 1600, 4000 px ou taille d'origine, dans les propriétés d'une image).
- Les images sont enregistrées dans le projet et dans le PDF exporté ; un PDF natif rouvert dans LumiPlan les retrouve.
- **HEIC (iPhone)** : non lisible hors ligne ; réglez l'iPhone sur « Le plus compatible » ou convertissez en JPG.
- Pas de recadrage pour l'instant.

## Nouvelle révision (ruban *Révision*)

Avec le PDF de la révision précédente ouvert, **Nouvelle révision** → choisissez le nouveau PDF :

1. les feuilles sont associées par **nom de feuille** (E-101 → E-101, même si l'ordre change), sinon par numéro ; ajustez au besoin ;
2. les feuilles sont **comparées** et les zones modifiées repérées (contour magenta) ; option : **nuage de révision** sur chacune ;
3. la nouvelle révision s'ouvre avec vos annotations, échelles et tableau des luminaires reportés.

Naviguez d'une modification à l'autre avec *Précédente / Suivante* (ruban ou onglet *Pages*). **Enregistrez ensuite le projet de
la nouvelle révision** (Ctrl+S) : celui de l'ancienne révision n'est pas modifié.

## Pivoter les pages

Boutons **⟲ / ⟳** à droite de la navigation des pages (barre du bas), raccourci **Ctrl+Maj+← / →**, ou onglet *Pages*
(page courante ou **toutes les pages**). Rotation par quarts de tour, annulable (Ctrl+Z), enregistrée avec le projet.

- Les annotations suivent le dessin : symboles, locaux, portes, plafonds (orientation 2×4 ajustée), mesures, câbles, nuages.
  Les textes, bulles, notes et le tableau restent **horizontaux** (lisibles) : seul leur emplacement suit le plan.
- L'échelle ne change pas ; la recherche, le magnétisme de la grille et *Nouvelle révision* tiennent compte de la rotation
  (la nouvelle révision est pivotée comme l'ancienne).
- Le PDF exporté (aplati ou natif) est réellement pivoté (`/Rotate`), donc il s'ouvre dans le bon sens dans Bluebeam/Acrobat.

## Échelle automatique et recherche

- À l'ouverture d'une feuille non calibrée, LumiPlan lit l'échelle inscrite (cartouche, titres de vues) et propose de
  l'appliquer ; **Échelle auto** (ruban *Mesure*) le fait pour toutes les feuilles et présente un bilan (feuilles à plusieurs
  échelles et « échelle indiquée » laissées à votre choix). **Vérifiez toujours une cote connue** par feuille (outil Longueur) :
  un PDF peut avoir été produit à une autre taille que celle prévue.
- **Ctrl+F** : recherche dans le texte du PDF (sans tenir compte des accents ni des majuscules) ; Entrée / Maj+Entrée pour passer
  d'un résultat à l'autre. Les plans numérisés (images) ne contiennent pas de texte cherchable.

## Enregistrer

| Bouton | Résultat |
|---|---|
| **Enregistrer** (Ctrl+S) | Fichier projet `*.lumiplan.json` : annotations éditables, échelles, symboles utilisés. Le PDF reste intact. |
| **Projet + PDF** | Un seul fichier `*.lumiplan-complet.json` qui contient aussi le PDF (pratique pour archiver / envoyer). |
| **PDF annoté** | Copie du PDF avec des **annotations PDF natives** : sélectionnables, modifiables et listées dans Bluebeam / Acrobat (auteur, commentaire, réponses). Les symboles deviennent des tampons dont le *Sujet* = nom du symbole + type. |
| **PDF aplati** | Les annotations sont dessinées dans la page (plus modifiables) — pour une émission « finale ». |
| **CSV** | Décompte par type et par page + liste complète, prêt pour Excel (séparateur `;`, UTF-8). |

**Enregistrement automatique dans le fichier projet (Chrome / Edge)** : au premier Ctrl+S, la fenêtre s'ouvre dans le dossier du
PDF ; ensuite, le fichier projet est **réécrit automatiquement** quelques secondes après chaque modification (état affiché dans
la barre de titre). En rouvrant ce PDF (bouton *Ouvrir* ou liste *Récents*), son projet est rechargé automatiquement.

En plus, une copie est conservée en continu dans le navigateur ; elle sert de secours mais ne remplace pas le fichier projet
(vider le cache du navigateur l'efface). Dans Firefox, l'enregistrement se fait par téléchargement (pas de réécriture automatique).

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
- **Comparaison de révisions** : elle compare l'image des feuilles. Si l'architecte a déplacé tout le dessin sur la feuille
  (nouveau cadre, autre marge), presque tout est signalé comme modifié et les annotations reportées sont décalées d'autant :
  vérifiez la première feuille. Les feuilles de taille différente sont mises à l'échelle proportionnellement.
- **Échelle automatique** : seules les échelles écrites en texte sont lues (pas celles dessinées en image ni « échelle graphique »).
- **Circuits** : un « dispositif de contrôle » est reconnu par la catégorie ou le nom du symbole (contrôle, détecteur, interrupteur,
  gradateur, capteur). Renommez vos symboles en conséquence pour que la vérification des zones soit fiable.
- Documents récents, ouverture dans le dossier du PDF et enregistrement automatique : Chrome et Edge seulement.
- Pas d'accrochage (snap) aux objets du PDF, pas de calques, pas de sessions multi-utilisateurs.

## Raccourcis

`V` sélection · `H` main · `S` symbole · `L` ligne · `A` flèche · `R` rectangle · `E` ellipse · `C` nuage · `P` polyligne · `G` polygone ·
`F` main levée · `I` surligneur · `T` texte · `Q` bulle · `O` note · `K` calibrer · `M` longueur · `N` longueur polyligne · `B` aire ·
`Entrée`/double-clic = terminer · `Échap` = annuler · `Suppr` · `Ctrl+Z/Y/C/V/D/S/O` · `Ctrl+F` rechercher · `1`…`9` symboles favoris ·
`W` câble · `U` local · `D` porte · `J` plafond · `[` `]` pivoter les symboles · `Ctrl+Maj+←/→` pivoter la page · `Ctrl+V` coller une capture d'écran comme image · flèches = déplacer.

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
js/app.js           visionneuse, ruban, outils, panneaux, fichiers, enregistrement
js/icons.js         jeu d'icônes vectorielles (LumiPlan et Atelier)
js/schedule.js      tableau des luminaires, circuits et zones de contrôle
js/textsearch.js    recherche de texte et lecture automatique de l'échelle
js/revision.js      nouvelle révision : report des annotations et zones modifiées
js/cables.js        câblage : types, tracé, longueurs, hauteurs de montage
js/space.js         petits projets : nouveau plan quadrillé, locaux, portes, grilles de plafond
atelier.html        Atelier de symboles (css/atelier.css, js/atelier.js)
dist/               versions autonomes (fichier unique) — régénérer avec : node tools/build-autonome.js
tools/              script de construction des versions autonomes
vendor/             pdf.js et pdf-lib (licences incluses) ; pdf.worker.src.js = worker pdf.js sous forme
                    de chaîne pour démarrer un Web Worker même en double-cliquant sur index.html
```

Le même code de dessin sert à l'écran et à l'export PDF : ce que vous voyez est ce qui est exporté.
