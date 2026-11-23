/*
 * Génère une bibliothèque LumiPlan de symboles d'éclairage d'urgence (symboles composés),
 * d'après la légende fournie. Chaque symbole est dessiné dans un repère W × H (unités libres,
 * y vers le bas), puis normalisé (-0,5…0,5) au format de l'Atelier.
 */
const fs = require('fs');
const IN = 0.0254;
const K = 0.5522847498;

function sym(id, name, Lin, Win, W, H, draw, extra = {}) {
  const prims = [];
  const nx = (x) => x / W - 0.5, ny = (y) => y / H - 0.5, nr = (r) => r / Math.min(W, H);
  let k = 0;
  const key = () => `${id}-${k++}`;
  const P = {
    line(x1, y1, x2, y2, w = 0.6) { prims.push({ k: key(), t: 'line', pts: [[nx(x1), ny(y1)], [nx(x2), ny(y2)]], stroke: 'sym', fill: 'none', width: w, dash: 'solid' }); },
    rect(x1, y1, x2, y2, w = 0.6, fill = 'none') { prims.push({ k: key(), t: 'rect', pts: [[nx(x1), ny(y1)], [nx(x2), ny(y2)]], stroke: 'sym', fill, width: w, dash: 'solid' }); },
    circle(cx, cy, r, w = 0.6, fill = 'none', stroke = 'sym') { prims.push({ k: key(), t: 'circle', c: [nx(cx), ny(cy)], r: nr(r), stroke, fill, width: w, dash: 'solid' }); },
    poly(pts, closed, w = 0.6, fill = 'none', stroke = 'sym') { prims.push({ k: key(), t: 'poly', pts: pts.map(([x, y]) => [nx(x), ny(y)]), closed, stroke, fill, width: w, dash: 'solid' }); },
    path(segs, w = 0.4, fill = 'sym', stroke = 'sym') {
      prims.push({ k: key(), t: 'path', segs: segs.map((g) => (g[0] === 'Z' ? g : [g[0], ...g.slice(1).map((v, i) => (i % 2 ? ny(v) : nx(v)))])), stroke, fill, width: w, dash: 'solid' });
    },
    text(x, y, str, size, bold = true) { prims.push({ k: key(), t: 'text', p: [nx(x), ny(y)], text: str, size: size / Math.min(W, H), bold, align: 'center', stroke: 'sym', width: 1 }); },
  };
  draw(P);
  return Object.assign({
    id: 'u-urg-' + id, name, cat: 'Urgence', tag: '', color: '#007a33', fill: 'none', inner: '',
    shape: 'custom', round: false, mode: 'paper', dimL: Lin * IN, dimW: Win * IN, prims, builtin: false, atelier: true,
  }, extra);
}

/* ---------- Éléments graphiques ---------- */
// Phare d'urgence : tige depuis (x, y) dans la direction ang (degrés), puis tête conique pleine à front arrondi
function head(P, x, y, ang, s = 1, stem = 8) {
  // Phare évasé (cône) : étroit à la tige, large et légèrement bombé à l'avant
  const a = (ang * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
  const L = (px, py) => [x + ux * px + vx * py, y + uy * px + vy * py];
  const b1 = 3.2 * s, b2 = 12 * s, len = 9 * s, bulge = 1.6 * s;
  if (stem > 0) P.line(...L(0, 0), ...L(stem, 0), 0.6);
  const s0 = stem;
  const p1 = L(s0, -b1 / 2), p2 = L(s0 + len, -b2 / 2), p3 = L(s0 + len, b2 / 2), p4 = L(s0, b1 / 2);
  const c1 = L(s0 + len + bulge * 1.3, -b2 / 4), c2 = L(s0 + len + bulge * 1.3, b2 / 4);
  P.path([['M', ...p1], ['L', ...p2], ['C', ...c1, ...c2, ...p3], ['L', ...p4], ['Z']], 0.3);
}
// Indicateur d'issue : cercle avec X, deux quartiers opposés pleins (simple) ou plein avec X blanc (double)
function exitSign(P, cx, cy, r, dbl) {
  const d = r * Math.SQRT1_2;
  if (dbl) {
    P.circle(cx, cy, r, 0.6, 'sym');
    P.line(cx - d, cy - d, cx + d, cy + d, 0.9); P.line(cx + d, cy - d, cx - d, cy + d, 0.9);
    // X blanc par-dessus le disque plein
    const last = (n) => { for (let i = 0; i < n; i++) P._prims ? 0 : 0; };
    last(0);
    return 'white-x';
  }
  // Quartiers haut et bas pleins (secteurs de 90°)
  const wedge = (a0) => {
    const a = (a0 * Math.PI) / 180, b = ((a0 + 90) * Math.PI) / 180, k = (4 / 3) * Math.tan(Math.PI / 8);
    const p0 = [cx + r * Math.cos(a), cy + r * Math.sin(a)], p1 = [cx + r * Math.cos(b), cy + r * Math.sin(b)];
    P.path([['M', cx, cy], ['L', ...p0],
      ['C', p0[0] - k * r * Math.sin(a), p0[1] + k * r * Math.cos(a), p1[0] + k * r * Math.sin(b), p1[1] - k * r * Math.cos(b), ...p1], ['Z']], 0.2);
  };
  wedge(225); wedge(45);
  P.circle(cx, cy, r, 0.6);
  P.line(cx - d, cy - d, cx + d, cy + d, 0.6); P.line(cx + d, cy - d, cx - d, cy + d, 0.6);
  return null;
}
function arrow(P, x1, y1, x2, y2, hs = 5) {
  P.line(x1, y1, x2, y2, 0.6);
  const a = Math.atan2(y2 - y1, x2 - x1), ux = Math.cos(a), uy = Math.sin(a);
  P.poly([[x2 + ux * 1, y2 + uy * 1], [x2 - ux * hs - uy * hs * 0.55, y2 - uy * hs + ux * hs * 0.55], [x2 - ux * hs + uy * hs * 0.55, y2 - uy * hs - ux * hs * 0.55]], true, 0.3, 'sym');
}

/* ---------- Symboles de la légende ---------- */
const S = [];
// Le X blanc des indicateurs « doubles » : lignes blanches ajoutées après le disque plein
function exitDbl(P, cx, cy, r) {
  P.circle(cx, cy, r, 0.6, 'sym');
  const d = r * Math.SQRT1_2;
  P.line(cx - d, cy - d, cx + d, cy + d, 0.9); P.line(cx + d, cy - d, cx - d, cy + d, 0.9);
}
const whiteLast = (s, n) => { s.prims.slice(-n).forEach((p) => { p.stroke = '#ffffff'; }); return s; };

S.push(sym('ph-mur-s', 'Phare urgence simple – mural', 5 / 16, 3 / 16, 50, 30, (P) => {
  P.line(44, 5, 44, 25, 1); head(P, 44, 15, 180, 1, 9);
}));
S.push(sym('ph-mur-d', 'Phare urgence double – mural', 3 / 8, 1 / 4, 60, 40, (P) => {
  P.line(14, 36, 46, 36, 1); P.line(30, 36, 30, 27, 0.6);
  head(P, 30, 27, -150, 1, 5); head(P, 30, 27, -30, 1, 5);
}));
S.push(sym('ph-pla-s', 'Phare urgence simple – plafond', 5 / 16, 3 / 16, 50, 30, (P) => {
  P.circle(42, 15, 4, 0.6, '#ffffff'); head(P, 38, 15, 180, 1, 9);
}));
S.push(sym('ph-pla-d', 'Phare urgence double – plafond', 3 / 8, 3 / 16, 64, 32, (P) => {
  P.circle(32, 18, 4, 0.6, '#ffffff'); head(P, 28, 18, -165, 1, 6); head(P, 36, 18, -15, 1, 6);
}));
S.push(sym('acc', 'Accumulateur éclairage d\'urgence', 3 / 8, 3 / 16, 60, 30, (P) => {
  P.rect(3, 3, 57, 27, 0.8, '#ffffff'); P.text(30, 20.5, 'ACC', 14);
}));
S.push(sym('acc-ph-s', 'Accumulateur + phare simple', 3 / 8, 5 / 16, 60, 50, (P) => {
  P.rect(8, 28, 52, 47, 0.8, '#ffffff'); P.text(30, 42.5, 'ACC', 12);
  P.line(30, 28, 30, 22, 0.6); head(P, 30, 22, -120, 1, 3);
}));
S.push(sym('acc-ph-d', 'Accumulateur + phare double', 3 / 8, 5 / 16, 60, 50, (P) => {
  P.rect(8, 28, 52, 47, 0.8, '#ffffff'); P.text(30, 42.5, 'ACC', 12);
  P.line(30, 28, 30, 22, 0.6); head(P, 30, 22, -145, 1, 3); head(P, 30, 22, -35, 1, 3);
}));
S.push(whiteLast(sym('acc-ph-d-iss', 'Accumulateur + phare double + indicateur d\'issue', 3 / 8, 5 / 16, 70, 50, (P) => {
  P.rect(10, 31, 60, 47, 0.8, '#ffffff'); P.text(35, 43, 'ACC', 9);
  P.line(17, 31, 17, 26, 0.6); head(P, 17, 26, -125, 0.9, 2);
  P.line(53, 31, 53, 26, 0.6); head(P, 53, 26, -55, 0.9, 2);
  P.line(35, 31, 35, 27, 0.6); exitDbl(P, 35, 20, 7);
}), 2));
S.push(whiteLast(sym('iss-mur-acc-ph', 'Indicateur d\'issue mural + accumulateur et phare double', 5 / 16, 5 / 16, 50, 50, (P) => {
  P.line(25, 30, 25, 21, 0.6); head(P, 25, 21, -145, 1, 3); head(P, 25, 21, -35, 1, 3);
  exitDbl(P, 25, 38, 10);
}), 2));
// Indicateurs d'issue : plafond / mural, simple / double, sans / avec flèche
S.push(sym('iss-pla-s', 'Indicateur d\'issue simple – plafond', 3 / 16, 3 / 16, 30, 30, (P) => { exitSign(P, 15, 15, 12, false); }));
S.push(whiteLast(sym('iss-pla-d', 'Indicateur d\'issue double – plafond', 3 / 16, 3 / 16, 30, 30, (P) => { exitDbl(P, 15, 15, 12); }), 2));
S.push(sym('iss-mur-s', 'Indicateur d\'issue simple – mural', 3 / 16, 1 / 4, 30, 40, (P) => {
  exitSign(P, 15, 14, 11, false); P.line(15, 25, 15, 34, 0.6); P.line(6, 34, 24, 34, 1);
}));
S.push(whiteLast(sym('iss-mur-d', 'Indicateur d\'issue double – mural', 3 / 16, 1 / 4, 30, 40, (P) => {
  P.line(15, 25, 15, 34, 0.6); P.line(6, 34, 24, 34, 1); exitDbl(P, 15, 14, 11);
}), 2));
S.push(sym('iss-mur-s-fl', 'Indicateur d\'issue simple – mural, flèche', 3 / 16, 5 / 16, 30, 50, (P) => {
  arrow(P, 5, 6, 25, 6); exitSign(P, 15, 23, 11, false); P.line(15, 34, 15, 43, 0.6); P.line(6, 43, 24, 43, 1);
}));
S.push(whiteLast(sym('iss-mur-d-fl', 'Indicateur d\'issue double – mural, flèches', 5 / 16, 1 / 4, 50, 40, (P) => {
  arrow(P, 6, 26, 6, 6); arrow(P, 44, 26, 44, 6);
  P.line(25, 25, 25, 34, 0.6); P.line(16, 34, 34, 34, 1); exitDbl(P, 25, 14, 11);
}), 2));
S.push(sym('iss-pla-s-fl', 'Indicateur d\'issue simple – plafond, flèche', 3 / 16, 1 / 4, 30, 40, (P) => {
  arrow(P, 5, 6, 25, 6); exitSign(P, 15, 25, 12, false);
}));
S.push(whiteLast(sym('iss-pla-d-fl', 'Indicateur d\'issue double – plafond, flèches', 5 / 16, 3 / 16, 50, 30, (P) => {
  arrow(P, 6, 26, 6, 4); arrow(P, 44, 26, 44, 4); exitDbl(P, 25, 15, 12);
}), 2));

const lib = { format: 'lumiplan-library', version: 1, source: 'legende-urgence', symbols: S, images: {} };
fs.writeFileSync(process.argv[2] || require('path').join(__dirname, '..', 'bibliotheques', 'eclairage-urgence.lumiplan-lib.json'), JSON.stringify(lib, null, 1));
console.log(S.length + ' symboles');
