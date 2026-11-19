/*
 * Bibliothèque de symboles d'éclairage.
 * Chaque forme se dessine dans un repère unitaire centré (−0,5…0,5),
 * y vers le bas ; 1 unité = taille du symbole (pt).
 */
(function () {
  'use strict';

  // box : [largeur, hauteur] en fraction de la taille
  const SHAPES = {
    circle: {
      label: 'Cercle', box: [1, 1],
      draw(R, s) { R.beginPath(); R.ellipsePath(0, 0, 0.5, 0.5); R.paint(s.fill, true); },
    },
    downlight: {
      label: 'Encastré (cercle + croix)', box: [1, 1],
      draw(R, s) {
        R.beginPath(); R.ellipsePath(0, 0, 0.5, 0.5); R.paint(s.fill, true);
        R.beginPath(); R.moveTo(-0.35, -0.35); R.lineTo(0.35, 0.35); R.moveTo(0.35, -0.35); R.lineTo(-0.35, 0.35); R.stroke();
      },
    },
    pendant: {
      label: 'Suspendu (cercle + point)', box: [1, 1],
      draw(R, s) {
        R.beginPath(); R.ellipsePath(0, 0, 0.5, 0.5); R.paint(s.fill, true);
        R.setFill(s.color); R.beginPath(); R.ellipsePath(0, 0, 0.16, 0.16); R.fill();
      },
    },
    square: {
      label: 'Carré (2×2)', box: [1, 1],
      draw(R, s) {
        R.beginPath(); R.rectPath(-0.5, -0.5, 1, 1); R.paint(s.fill, true);
        R.beginPath(); R.moveTo(-0.5, -0.5); R.lineTo(0.5, 0.5); R.stroke();
      },
    },
    rect: {
      label: 'Rectangle (2×4)', box: [1, 0.5],
      draw(R, s) {
        R.beginPath(); R.rectPath(-0.5, -0.25, 1, 0.5); R.paint(s.fill, true);
        R.beginPath(); R.moveTo(-0.5, -0.25); R.lineTo(0.5, 0.25); R.stroke();
      },
    },
    strip: {
      label: 'Réglette (1×4)', box: [1, 0.25],
      draw(R, s) {
        R.beginPath(); R.rectPath(-0.5, -0.125, 1, 0.25); R.paint(s.fill, true);
        R.beginPath(); R.moveTo(-0.5, 0); R.lineTo(0.5, 0); R.stroke();
      },
    },
    linear: {
      label: 'Linéaire (pleine)', box: [1, 0.12],
      draw(R, s) { R.setFill(s.color); R.beginPath(); R.rectPath(-0.5, -0.06, 1, 0.12); R.fillStroke(); },
    },
    sconce: {
      label: 'Applique murale', box: [1, 0.6],
      draw(R, s) {
        R.beginPath(); R.moveTo(-0.5, 0.3); R.lineTo(0.5, 0.3); R.stroke();
        R.beginPath(); R.moveTo(-0.35, 0.3); R.semiArc(-0.35, 0.3, 0.35, 0.3, 0, -1); R.closePath(); R.paint(s.fill, true);
      },
    },
    wallpack: {
      label: 'Wall pack / extérieur', box: [1, 0.6],
      draw(R, s) {
        R.beginPath(); R.moveTo(-0.5, 0.3); R.lineTo(0.5, 0.3); R.stroke();
        R.setFill(s.color); R.beginPath(); R.polyPath([[-0.3, 0.3], [-0.15, -0.3], [0.15, -0.3], [0.3, 0.3]], true); R.fillStroke();
      },
    },
    track: {
      label: 'Rail + projecteurs', box: [1, 0.3],
      draw(R, s) {
        R.beginPath(); R.moveTo(-0.5, 0); R.lineTo(0.5, 0); R.stroke();
        for (const x of [-0.33, 0, 0.33]) { R.beginPath(); R.ellipsePath(x, 0, 0.1, 0.1); R.paint(s.fill || '#ffffff', true); }
      },
    },
    exit: {
      label: 'Enseigne de sortie', box: [1, 1],
      draw(R, s) {
        R.beginPath(); R.ellipsePath(0, 0, 0.5, 0.5); R.paint(s.fill, true);
        R.setFill(s.color);
        // Quadrants opposés pleins (convention de plan)
        R.beginPath(); R.moveTo(0, 0); R.lineTo(0, -0.5); R.curveTo(0.276, -0.5, 0.5, -0.276, 0.5, 0); R.closePath(); R.fill();
        R.beginPath(); R.moveTo(0, 0); R.lineTo(0, 0.5); R.curveTo(-0.276, 0.5, -0.5, 0.276, -0.5, 0); R.closePath(); R.fill();
      },
    },
    emergency: {
      label: "Bloc d'urgence (2 têtes)", box: [1, 0.6],
      draw(R, s) {
        R.beginPath(); R.rectPath(-0.4, 0, 0.8, 0.3); R.paint(s.fill, true);
        R.setFill(s.color);
        R.beginPath(); R.polyPath([[-0.3, 0], [-0.5, -0.3], [-0.1, -0.3]], true); R.fillStroke();
        R.beginPath(); R.polyPath([[0.3, 0], [0.1, -0.3], [0.5, -0.3]], true); R.fillStroke();
      },
    },
    remotehead: {
      label: "Tête d'urgence déportée", box: [1, 0.5],
      draw(R, s) {
        R.setFill(s.color);
        R.beginPath(); R.polyPath([[0, 0.25], [-0.5, -0.25], [-0.1, -0.25]], true); R.fillStroke();
        R.beginPath(); R.polyPath([[0, 0.25], [0.1, -0.25], [0.5, -0.25]], true); R.fillStroke();
      },
    },
    triangle: {
      label: 'Triangle', box: [1, 0.87],
      draw(R, s) { R.beginPath(); R.polyPath([[0, -0.435], [0.5, 0.435], [-0.5, 0.435]], true); R.paint(s.fill, true); },
    },
    diamond: {
      label: 'Losange', box: [1, 1],
      draw(R, s) { R.beginPath(); R.polyPath([[0, -0.5], [0.5, 0], [0, 0.5], [-0.5, 0]], true); R.paint(s.fill, true); },
    },
    hexagon: {
      label: 'Hexagone', box: [1, 0.87],
      draw(R, s) {
        const p = [];
        for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i; p.push([0.5 * Math.cos(a), 0.5 * Math.sin(a)]); }
        R.beginPath(); R.polyPath(p, true); R.paint(s.fill, true);
      },
    },
    circletext: {
      label: 'Cercle + texte (détecteur…)', box: [1, 1],
      draw(R, s) { R.beginPath(); R.ellipsePath(0, 0, 0.5, 0.5); R.paint(s.fill, true); innerText(R, s, 0.8); },
    },
    halfcircletext: {
      label: 'Demi-cercle + texte (mural)', box: [1, 0.6],
      draw(R, s) {
        R.beginPath(); R.moveTo(-0.5, 0.3); R.lineTo(0.5, 0.3); R.stroke();
        R.beginPath(); R.moveTo(-0.45, 0.3); R.semiArc(-0.45, 0.3, 0.45, 0.3, 0, -1); R.closePath(); R.paint(s.fill, true);
        R.save(); R.transform(1, 0, 0, 1, 0, 0.08); innerText(R, s, 0.6); R.restore();
      },
    },
    recttext: {
      label: 'Rectangle + texte (panneau…)', box: [1, 0.5],
      draw(R, s) { R.beginPath(); R.rectPath(-0.5, -0.25, 1, 0.5); R.paint(s.fill, true); innerText(R, s, 0.9); },
    },
    text: {
      label: 'Texte seul ($, $D…)', box: [1, 1],
      draw(R, s) { innerText(R, s, 1); },
    },
    image: {
      label: 'Image importée (PNG/JPG)', box: [1, 1],
      draw(R, s) {
        const ar = s.imgAspect || 1;
        const w = ar >= 1 ? 1 : ar, h = ar >= 1 ? 1 / ar : 1;
        R.image(s.id, -w / 2, -h / 2, w, h);
      },
    },
  };

  function innerText(R, s, maxW) {
    const t = (s.inner || '').trim();
    if (!t) return;
    let size = 0.42;
    let w = R.measure(t, size, true);
    if (w > maxW * 0.8) { size *= (maxW * 0.8) / w; w = R.measure(t, size, true); }
    R.text(t, -w / 2, size * 0.36, size, s.color, true);
  }

  function shapeBox(sym) {
    if (sym.shape === 'image') {
      const ar = sym.imgAspect || 1;
      return ar >= 1 ? [1, 1 / ar] : [ar, 1];
    }
    return (SHAPES[sym.shape] || SHAPES.circle).box;
  }

  /*
   * Dessine un symbole. sym = définition, opts = {x, y, size, rot, showTag, tag, lineWidth, opacity}
   */
  function drawSymbol(R, sym, o) {
    const shape = SHAPES[sym.shape] || SHAPES.circle;
    const size = o.size || sym.size || 18;
    const rad = ((o.rot || 0) * Math.PI) / 180;
    const c = Math.cos(rad), sn = Math.sin(rad);
    const style = {
      color: sym.color || '#d00000',
      fill: sym.fill && sym.fill !== 'none' ? sym.fill : null,
      inner: sym.inner || '',
      id: sym.id,
      imgAspect: sym.imgAspect,
    };
    R.save();
    if (o.opacity != null && o.opacity < 1) R.setAlpha(o.opacity);
    R.transform(c * size, sn * size, -sn * size, c * size, o.x, o.y);
    R.setStroke(style.color);
    if (style.fill) R.setFill(style.fill);
    R.setDash([]);
    R.setLineWidth((o.lineWidth || 1) / size);
    // Le remplissage par défaut doit être (re)défini avant chaque paint
    const origPaint = R.paint;
    R.paint = function (fill, stroke) { if (fill) R.setFill(fill); origPaint.call(R, fill, stroke); };
    try { shape.draw(R, style); } finally { R.paint = origPaint; }
    R.restore();

    const tag = (o.tag != null ? o.tag : sym.tag) || '';
    if (o.showTag !== false && tag) {
      const box = shapeBox(sym);
      const ts = Math.max(5, Math.min(size * 0.5, 10));
      // Étiquette à droite / en haut, non tournée
      const rx = (box[0] / 2) * size, ry = (box[1] / 2) * size;
      const ext = Math.abs(rx * c) + Math.abs(ry * sn);
      const exty = Math.abs(rx * sn) + Math.abs(ry * c);
      const tx = o.x + ext + ts * 0.2;
      const ty = o.y - exty * 0.4;
      R.save();
      if (o.opacity != null && o.opacity < 1) R.setAlpha(o.opacity);
      R.text(tag, tx, ty, ts, style.color, true);
      R.restore();
    }
  }

  // Bibliothèque par défaut (normes usuelles de plans d'éclairage)
  const DEFAULTS = [
    { id: 'b-downlight', name: 'Encastré (downlight)', cat: 'Luminaires', shape: 'downlight', tag: 'A', color: '#d00000', fill: '#ffffff', size: 14 },
    { id: 'b-pendant', name: 'Suspendu', cat: 'Luminaires', shape: 'pendant', tag: 'B', color: '#d00000', fill: '#ffffff', size: 14 },
    { id: 'b-troffer24', name: 'Encastré 2×4', cat: 'Luminaires', shape: 'rect', tag: 'C', color: '#d00000', fill: '#ffffff', size: 34 },
    { id: 'b-troffer22', name: 'Encastré 2×2', cat: 'Luminaires', shape: 'square', tag: 'D', color: '#d00000', fill: '#ffffff', size: 17 },
    { id: 'b-strip', name: 'Réglette 1×4', cat: 'Luminaires', shape: 'strip', tag: 'E', color: '#d00000', fill: '#ffffff', size: 34 },
    { id: 'b-linear', name: 'Linéaire DEL', cat: 'Luminaires', shape: 'linear', tag: 'F', color: '#d00000', fill: 'none', size: 40 },
    { id: 'b-sconce', name: 'Applique murale', cat: 'Luminaires', shape: 'sconce', tag: 'G', color: '#d00000', fill: '#ffffff', size: 16 },
    { id: 'b-wallpack', name: 'Wall pack extérieur', cat: 'Luminaires', shape: 'wallpack', tag: 'H', color: '#d00000', fill: 'none', size: 16 },
    { id: 'b-track', name: 'Rail + projecteurs', cat: 'Luminaires', shape: 'track', tag: 'J', color: '#d00000', fill: '#ffffff', size: 36 },
    { id: 'b-exit', name: 'Enseigne de sortie', cat: 'Urgence', shape: 'exit', tag: 'X', color: '#007a33', fill: '#ffffff', size: 14 },
    { id: 'b-bu', name: "Bloc d'urgence", cat: 'Urgence', shape: 'emergency', tag: 'BU', color: '#007a33', fill: '#ffffff', size: 20 },
    { id: 'b-rh', name: "Tête d'urgence", cat: 'Urgence', shape: 'remotehead', tag: 'TD', color: '#007a33', fill: 'none', size: 14 },
    { id: 'b-os', name: 'Détecteur plafond', cat: 'Contrôles', shape: 'circletext', inner: 'DO', tag: '', color: '#0050c8', fill: '#ffffff', size: 14 },
    { id: 'b-osw', name: 'Détecteur mural', cat: 'Contrôles', shape: 'halfcircletext', inner: 'DO', tag: '', color: '#0050c8', fill: '#ffffff', size: 16 },
    { id: 'b-sw', name: 'Interrupteur', cat: 'Contrôles', shape: 'text', inner: '$', tag: '', color: '#0050c8', fill: 'none', size: 14 },
    { id: 'b-dim', name: 'Gradateur', cat: 'Contrôles', shape: 'text', inner: '$D', tag: '', color: '#0050c8', fill: 'none', size: 16 },
    { id: 'b-pc', name: 'Photocellule', cat: 'Contrôles', shape: 'circletext', inner: 'PC', tag: '', color: '#0050c8', fill: '#ffffff', size: 14 },
    { id: 'b-dl', name: 'Capteur lumière du jour', cat: 'Contrôles', shape: 'circletext', inner: 'LJ', tag: '', color: '#0050c8', fill: '#ffffff', size: 14 },
    { id: 'b-lcp', name: "Panneau de contrôle d'éclairage", cat: 'Contrôles', shape: 'recttext', inner: 'PCE', tag: '', color: '#0050c8', fill: '#ffffff', size: 30 },
  ].map((s) => Object.assign({ builtin: true, inner: '' }, s));

  window.LP = window.LP || {};
  Object.assign(window.LP, { SHAPES, DEFAULT_SYMBOLS: DEFAULTS, drawSymbol, shapeBox });
})();
