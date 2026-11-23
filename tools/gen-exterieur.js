/*
 * Bibliothèque LumiPlan : appareils d'éclairage extérieurs (symboles composés).
 *   node tools/gen-exterieur.js  →  bibliotheques/appareils-exterieurs.lumiplan-lib.json
 * Chaque symbole est dessiné dans un repère W × H (y vers le bas), puis normalisé (-0,5…0,5).
 */
const fs = require('fs');
const path = require('path');
const IN = 0.0254, FT = 0.3048, K = 0.5522847498;

function sym(id, name, mode, Lm, Wm, W, H, draw) {
  const prims = [];
  const nx = (x) => x / W - 0.5, ny = (y) => y / H - 0.5, nr = (r) => r / Math.min(W, H);
  let k = 0;
  const key = () => `${id}-${k++}`;
  const P = {
    line(x1, y1, x2, y2, w = 0.6, stroke = 'sym') { prims.push({ k: key(), t: 'line', pts: [[nx(x1), ny(y1)], [nx(x2), ny(y2)]], stroke, fill: 'none', width: w, dash: 'solid' }); },
    rect(x1, y1, x2, y2, w = 0.6, fill = '#ffffff') { prims.push({ k: key(), t: 'rect', pts: [[nx(x1), ny(y1)], [nx(x2), ny(y2)]], stroke: 'sym', fill, width: w, dash: 'solid' }); },
    circle(cx, cy, r, w = 0.6, fill = '#ffffff', stroke = 'sym') { prims.push({ k: key(), t: 'circle', c: [nx(cx), ny(cy)], r: nr(r), stroke, fill, width: w, dash: 'solid' }); },
    poly(pts, closed, w = 0.6, fill = 'none') { prims.push({ k: key(), t: 'poly', pts: pts.map(([x, y]) => [nx(x), ny(y)]), closed, stroke: 'sym', fill, width: w, dash: 'solid' }); },
    path(segs, w = 0.6, fill = 'none', stroke = 'sym') {
      prims.push({ k: key(), t: 'path', segs: segs.map((g) => (g[0] === 'Z' ? g : [g[0], ...g.slice(1).map((v, i) => (i % 2 ? ny(v) : nx(v)))])), stroke, fill, width: w, dash: 'solid' });
    },
  };
  draw(P);
  return {
    id: 'u-ext-' + id, name, cat: 'Appareils extérieurs', tag: '', color: '#d00000', fill: 'none', inner: '',
    shape: 'custom', round: false, mode, dimL: Lm, dimW: Wm, prims, builtin: false, atelier: true,
  };
}
// Demi-disque appuyé sur une droite horizontale (y = base), bombé vers le haut
function halfDisc(P, cx, base, r, w, fill) {
  P.path([['M', cx - r, base], ['C', cx - r, base - r * K, cx - r * K, base - r, cx, base - r], ['C', cx + r * K, base - r, cx + r, base - r * K, cx + r, base], ['Z']], w, fill);
}
// Tête de luminaire sur fût : bras depuis le fût, boîtier rectangulaire (type « shoebox ») orienté selon ang
function poleHead(P, cx, cy, ang, armLen, hl, hw) {
  const a = (ang * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
  const L = (px, py) => [cx + ux * px + vx * py, cy + uy * px + vy * py];
  P.line(...L(0, 0), ...L(armLen, 0), 0.7);
  const q = [L(armLen, -hw / 2), L(armLen + hl, -hw / 2), L(armLen + hl, hw / 2), L(armLen, hw / 2)];
  P.poly(q, true, 0.7, '#ffffff');
  // Ligne de la source (face avant) : distingue le côté éclairant
  P.line(...L(armLen + hl * 0.55, -hw / 2), ...L(armLen + hl * 0.55, hw / 2), 0.5);
}
function pole(P, cx, cy, r) { P.circle(cx, cy, r, 0.7, '#ffffff'); P.circle(cx, cy, r * 0.38, 0.3, 'sym'); }

const S = [];
// 1. Applique murale extérieure : mur + demi-disque, moitié inférieure pleine (protégée / dirigée vers le bas)
S.push(sym('applique', 'Applique murale extérieure', 'paper', (5 / 16) * IN, (3 / 16) * IN, 50, 30, (P) => {
  P.line(4, 26, 46, 26, 1.1);
  halfDisc(P, 25, 26, 17, 0.7, '#ffffff');
  halfDisc(P, 25, 26, 9, 0.3, 'sym');
}));
// 2. Cylindre mural extérieur : mur + tige + cylindre vu en plan (cercle double), flux haut/bas
S.push(sym('cylindre', 'Cylindre mural extérieur', 'paper', (1 / 4) * IN, (1 / 4) * IN, 40, 40, (P) => {
  P.line(4, 35, 36, 35, 1.1);
  P.line(20, 35, 20, 29, 0.7);
  P.circle(20, 17, 12, 0.7, '#ffffff');
  P.circle(20, 17, 6.5, 0.5, '#ffffff');
  P.circle(20, 17, 2.2, 0.3, 'sym');
}));
// 3-6. Luminaires sur fût : fût (cercle) + 1 à 4 têtes
S.push(sym('fut1', 'Luminaire sur fût simple', 'paper', (3 / 8) * IN, (3 / 16) * IN, 60, 30, (P) => {
  pole(P, 10, 15, 6); poleHead(P, 10, 15, 0, 12, 30, 15);
}));
S.push(sym('fut2', 'Luminaire sur fût double', 'paper', (9 / 16) * IN, (3 / 16) * IN, 90, 30, (P) => {
  poleHead(P, 45, 15, 0, 9, 30, 15); poleHead(P, 45, 15, 180, 9, 30, 15); pole(P, 45, 15, 6);
}));
S.push(sym('fut3', 'Luminaire sur fût triple', 'paper', (7 / 16) * IN, (3 / 8) * IN, 70, 60, (P) => {
  const cy = 34;
  poleHead(P, 35, cy, -90, 7, 20, 13); poleHead(P, 35, cy, 30, 7, 20, 13); poleHead(P, 35, cy, 150, 7, 20, 13); pole(P, 35, cy, 5.5);
}));
S.push(sym('fut4', 'Luminaire sur fût quadruple', 'paper', (7 / 16) * IN, (7 / 16) * IN, 70, 70, (P) => {
  for (const a of [0, 90, 180, 270]) poleHead(P, 35, 35, a, 7, 20, 13);
  pole(P, 35, 35, 5.5);
}));
// 7. Bollard : borne vue en plan (cercle épais, source centrale)
S.push(sym('bollard', 'Bollard', 'paper', (3 / 16) * IN, (3 / 16) * IN, 30, 30, (P) => {
  P.circle(15, 15, 12.5, 1.2, '#ffffff');
  P.circle(15, 15, 5.5, 0.3, 'sym');
}));
// 8. Colonne lumineuse : poteau vu en plan, rayonnement sur 360° (huit rayons)
S.push(sym('colonne', 'Colonne lumineuse', 'paper', (1 / 4) * IN, (1 / 4) * IN, 40, 40, (P) => {
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a);
    P.line(20 + c * 11.5, 20 + s * 11.5, 20 + c * 18, 20 + s * 18, 0.6);
  }
  P.circle(20, 20, 9, 0.8, '#ffffff');
  P.rect(16.5, 16.5, 23.5, 23.5, 0.3, 'sym');
}));
// 9. Luminaire mural extérieur 1' × 2' (à l'échelle) : boîtier contre le mur, diagonale de la source
S.push(sym('mural-1x2', 'Luminaire mural extérieur 1\' × 2\'', 'real', 2 * FT, 1 * FT, 100, 50, (P) => {
  P.rect(2, 2, 98, 48, 0.7, '#ffffff');
  P.line(2, 48, 98, 2, 0.5);
  P.line(0, 48, 100, 48, 1.4); // face appuyée au mur
}));

const lib = { format: 'lumiplan-library', version: 1, source: 'appareils-exterieurs', symbols: S, images: {} };
const out = process.argv[2] || path.join(__dirname, '..', 'bibliotheques', 'appareils-exterieurs.lumiplan-lib.json');
fs.writeFileSync(out, JSON.stringify(lib, null, 1));
console.log(S.length + ' symboles → ' + out);
