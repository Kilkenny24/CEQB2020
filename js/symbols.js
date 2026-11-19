/*
 * Bibliothèque de symboles d'éclairage.
 *
 * Dimensions en unités réelles (stockées en mètres) :
 *   - mode 'real'  : à l'échelle du plan (longueur × largeur réelles, ou diamètre)
 *                    → converti en points avec l'échelle de la page ;
 *   - mode 'paper' : taille fixe sur la feuille imprimée (ex. 3/16") pour les
 *                    symboles schématiques (détecteurs, interrupteurs…).
 * dimL = longueur (ou diamètre pour les formes rondes), dimW = largeur.
 *
 * Chaque forme se dessine centrée sur (0,0), en points, avec w × h, y vers le bas.
 */
(function () {
  'use strict';
  const K = 0.5522847498;
  const IN = 0.0254, FT = 0.3048;
  const PT_PER_M = 72 / IN;

  // Demi-ellipse : de (-rx, base) à (rx, base), sommet à base - ry
  function halfEllipse(R, rx, ry, base) {
    R.moveTo(-rx, base);
    R.curveTo(-rx, base - ry * K, -rx * K, base - ry, 0, base - ry);
    R.curveTo(rx * K, base - ry, rx, base - ry * K, rx, base);
    R.closePath();
  }
  function innerText(R, s, w, h, k = 0.8) {
    const t = (s.inner || '').trim();
    if (!t) return;
    let size = Math.min(w, h) * 0.42;
    let tw = R.measure(t, size, true);
    if (tw > w * k) { size *= (w * k) / tw; tw = R.measure(t, size, true); }
    R.text(t, -tw / 2, size * 0.36, size, s.color, true);
  }

  // round : une seule dimension (diamètre) ; aspect : largeur / longueur par défaut
  const SHAPES = {
    circle: { label: 'Cercle', round: true, aspect: 1,
      draw(R, s, w, h) { R.beginPath(); R.ellipsePath(0, 0, w / 2, h / 2); R.paint(s.fill, true); } },
    downlight: { label: 'Encastré (cercle + croix)', round: true, aspect: 1,
      draw(R, s, w, h) {
        R.beginPath(); R.ellipsePath(0, 0, w / 2, h / 2); R.paint(s.fill, true);
        const a = w * 0.35, b = h * 0.35;
        R.beginPath(); R.moveTo(-a, -b); R.lineTo(a, b); R.moveTo(a, -b); R.lineTo(-a, b); R.stroke();
      } },
    pendant: { label: 'Suspendu (cercle + point)', round: true, aspect: 1,
      draw(R, s, w, h) {
        R.beginPath(); R.ellipsePath(0, 0, w / 2, h / 2); R.paint(s.fill, true);
        R.setFill(s.color); R.beginPath(); R.ellipsePath(0, 0, w * 0.16, h * 0.16); R.fill();
      } },
    square: { label: 'Carré (2×2)', aspect: 1,
      draw(R, s, w, h) {
        R.beginPath(); R.rectPath(-w / 2, -h / 2, w, h); R.paint(s.fill, true);
        R.beginPath(); R.moveTo(-w / 2, -h / 2); R.lineTo(w / 2, h / 2); R.stroke();
      } },
    rect: { label: 'Rectangle (2×4)', aspect: 0.5,
      draw(R, s, w, h) {
        R.beginPath(); R.rectPath(-w / 2, -h / 2, w, h); R.paint(s.fill, true);
        R.beginPath(); R.moveTo(-w / 2, -h / 2); R.lineTo(w / 2, h / 2); R.stroke();
      } },
    strip: { label: 'Réglette (1×4)', aspect: 0.25,
      draw(R, s, w, h) {
        R.beginPath(); R.rectPath(-w / 2, -h / 2, w, h); R.paint(s.fill, true);
        R.beginPath(); R.moveTo(-w / 2, 0); R.lineTo(w / 2, 0); R.stroke();
      } },
    linear: { label: 'Linéaire (pleine)', aspect: 0.06,
      draw(R, s, w, h) { R.setFill(s.color); R.beginPath(); R.rectPath(-w / 2, -h / 2, w, h); R.fillStroke(); } },
    sconce: { label: 'Applique murale', aspect: 0.6,
      draw(R, s, w, h) {
        R.beginPath(); R.moveTo(-w / 2, h / 2); R.lineTo(w / 2, h / 2); R.stroke();
        R.beginPath(); halfEllipse(R, w * 0.35, h, h / 2); R.paint(s.fill, true);
      } },
    wallpack: { label: 'Wall pack / extérieur', aspect: 0.6,
      draw(R, s, w, h) {
        R.beginPath(); R.moveTo(-w / 2, h / 2); R.lineTo(w / 2, h / 2); R.stroke();
        R.setFill(s.color); R.beginPath(); R.polyPath([[-w * 0.3, h / 2], [-w * 0.15, -h / 2], [w * 0.15, -h / 2], [w * 0.3, h / 2]], true); R.fillStroke();
      } },
    track: { label: 'Rail + projecteurs', aspect: 0.2,
      draw(R, s, w, h) {
        R.beginPath(); R.moveTo(-w / 2, 0); R.lineTo(w / 2, 0); R.stroke();
        const r = h / 2;
        for (const x of [-w * 0.33, 0, w * 0.33]) { R.beginPath(); R.ellipsePath(x, 0, r, r); R.paint(s.fill || '#ffffff', true); }
      } },
    exit: { label: 'Enseigne de sortie', round: true, aspect: 1,
      draw(R, s, w, h) {
        const rx = w / 2, ry = h / 2;
        R.beginPath(); R.ellipsePath(0, 0, rx, ry); R.paint(s.fill, true);
        R.setFill(s.color);
        R.beginPath(); R.moveTo(0, 0); R.lineTo(0, -ry); R.curveTo(rx * K, -ry, rx, -ry * K, rx, 0); R.closePath(); R.fill();
        R.beginPath(); R.moveTo(0, 0); R.lineTo(0, ry); R.curveTo(-rx * K, ry, -rx, ry * K, -rx, 0); R.closePath(); R.fill();
      } },
    emergency: { label: "Bloc d'urgence (2 têtes)", aspect: 0.6,
      draw(R, s, w, h) {
        R.beginPath(); R.rectPath(-w * 0.4, 0, w * 0.8, h / 2); R.paint(s.fill, true);
        R.setFill(s.color);
        R.beginPath(); R.polyPath([[-w * 0.3, 0], [-w * 0.5, -h / 2], [-w * 0.1, -h / 2]], true); R.fillStroke();
        R.beginPath(); R.polyPath([[w * 0.3, 0], [w * 0.1, -h / 2], [w * 0.5, -h / 2]], true); R.fillStroke();
      } },
    remotehead: { label: "Tête d'urgence déportée", aspect: 0.5,
      draw(R, s, w, h) {
        R.setFill(s.color);
        R.beginPath(); R.polyPath([[0, h / 2], [-w / 2, -h / 2], [-w * 0.1, -h / 2]], true); R.fillStroke();
        R.beginPath(); R.polyPath([[0, h / 2], [w * 0.1, -h / 2], [w / 2, -h / 2]], true); R.fillStroke();
      } },
    triangle: { label: 'Triangle', aspect: 0.87,
      draw(R, s, w, h) { R.beginPath(); R.polyPath([[0, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], true); R.paint(s.fill, true); } },
    diamond: { label: 'Losange', aspect: 1,
      draw(R, s, w, h) { R.beginPath(); R.polyPath([[0, -h / 2], [w / 2, 0], [0, h / 2], [-w / 2, 0]], true); R.paint(s.fill, true); } },
    hexagon: { label: 'Hexagone', aspect: 0.87,
      draw(R, s, w, h) {
        const p = [];
        for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i; p.push([(w / 2) * Math.cos(a), (h / 2) * Math.sin(a) / 0.866]); }
        R.beginPath(); R.polyPath(p, true); R.paint(s.fill, true);
      } },
    circletext: { label: 'Cercle + texte (détecteur…)', round: true, aspect: 1,
      draw(R, s, w, h) { R.beginPath(); R.ellipsePath(0, 0, w / 2, h / 2); R.paint(s.fill, true); innerText(R, s, w, h); } },
    halfcircletext: { label: 'Demi-cercle + texte (mural)', aspect: 0.6,
      draw(R, s, w, h) {
        R.beginPath(); R.moveTo(-w / 2, h / 2); R.lineTo(w / 2, h / 2); R.stroke();
        R.beginPath(); halfEllipse(R, w * 0.45, h, h / 2); R.paint(s.fill, true);
        R.save(); R.transform(1, 0, 0, 1, 0, h * 0.13); innerText(R, s, w * 0.75, h * 1.2, 0.8); R.restore();
      } },
    recttext: { label: 'Rectangle + texte (panneau…)', aspect: 0.5,
      draw(R, s, w, h) { R.beginPath(); R.rectPath(-w / 2, -h / 2, w, h); R.paint(s.fill, true); innerText(R, s, w, h * 2.2, 0.9); } },
    text: { label: 'Texte seul ($, $D…)', round: true, aspect: 1,
      draw(R, s, w, h) { innerText(R, s, w, h, 1); } },
    image: { label: 'Image importée (PNG/JPG)', aspect: 1,
      draw(R, s, w, h) { R.image(s.id, -w / 2, -h / 2, w, h); } },
  };

  function shapeOf(sym) { return SHAPES[sym.shape] || SHAPES.circle; }
  function isRound(sym) { return !!shapeOf(sym).round; }

  /*
   * Taille d'un symbole placé, en points de page.
   * inst : annotation (dimensions propres éventuelles) ; scale : {mpp} de la page ou null.
   * Retourne { w, h, provisional } — provisional = à l'échelle mais page non calibrée.
   */
  function symbolSize(sym, inst, scale) {
    inst = inst || {};
    // Anciennes données : taille en points (avant les dimensions réelles)
    if (inst.dimL == null && inst.size != null) {
      const a = sym.shape === 'image' ? 1 / (sym.imgAspect || 1) : shapeOf(sym).aspect;
      return { w: inst.size, h: inst.size * Math.min(a, 1), provisional: false };
    }
    const d = migrateSym(sym);
    const mode = inst.mode || d.mode;
    const L = inst.dimL != null ? inst.dimL : d.dimL;
    const W = isRound(d) ? L : (inst.dimW != null ? inst.dimW : d.dimW);
    if (mode === 'real') {
      if (scale && scale.mpp) return { w: L / scale.mpp, h: W / scale.mpp, provisional: false };
      // Page non calibrée : taille provisoire lisible, proportions conservées
      const m = Math.max(L, W) || 1;
      return { w: (24 * L) / m, h: (24 * W) / m, provisional: true };
    }
    return { w: L * PT_PER_M, h: W * PT_PER_M, provisional: false };
  }

  // Convertit une ancienne définition (size en pt) vers des dimensions papier
  function migrateSym(sym) {
    if (sym.dimL != null && sym.mode) return sym;
    const size = sym.size || 16;
    const a = sym.shape === 'image' ? 1 / (sym.imgAspect || 1) : shapeOf(sym).aspect;
    sym.mode = 'paper';
    sym.dimL = size / PT_PER_M;
    sym.dimW = (size * Math.min(a, 1)) / PT_PER_M;
    return sym;
  }

  /*
   * Dessine un symbole. o = {x, y, w, h, rot, showTag, tag, lineWidth, opacity, provisional}
   */
  function drawSymbol(R, sym, o) {
    const shape = shapeOf(sym);
    const w = Math.max(o.w || 1, 0.1), h = Math.max(o.h || 1, 0.1);
    const rad = ((o.rot || 0) * Math.PI) / 180;
    const c = Math.cos(rad), sn = Math.sin(rad);
    const style = {
      color: sym.color || '#d00000',
      fill: sym.fill && sym.fill !== 'none' ? sym.fill : null,
      inner: sym.inner || '',
      id: sym.id,
    };
    R.save();
    if (o.opacity != null && o.opacity < 1) R.setAlpha(o.opacity);
    R.transform(c, sn, -sn, c, o.x, o.y);
    R.setStroke(style.color);
    if (style.fill) R.setFill(style.fill);
    R.setDash([]);
    // Trait : jamais plus épais que le quart du symbole (petits luminaires à l'échelle)
    R.setLineWidth(Math.min(o.lineWidth || 1, Math.min(w, h) / 4));
    shape.draw(R, style, w, h);
    if (o.provisional) {
      // Page non calibrée : cadre pointillé orange pour signaler la taille provisoire
      R.setStroke('#ff7a00'); R.setLineWidth(0.6); R.setDash([2, 2]);
      R.beginPath(); R.rectPath(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4); R.stroke();
    }
    R.restore();

    const tag = (o.tag != null ? o.tag : sym.tag) || '';
    if (o.showTag !== false && tag) {
      const ts = tagSize(w, h);
      const ext = Math.abs((w / 2) * c) + Math.abs((h / 2) * sn);
      const exty = Math.abs((w / 2) * sn) + Math.abs((h / 2) * c);
      R.save();
      if (o.opacity != null && o.opacity < 1) R.setAlpha(o.opacity);
      R.text(tag, o.x + ext + ts * 0.2, o.y - exty * 0.4, ts, style.color, true);
      R.restore();
    }
  }
  function tagSize(w, h) { return Math.max(5, Math.min(Math.max(w, h) * 0.5, 9)); }

  /* ---------- Formatage / saisie des dimensions ---------- */
  function frac(v, den) {
    let whole = Math.floor(v + 1e-9);
    let n = Math.round((v - whole) * den);
    if (n === den) { whole++; n = 0; }
    if (!n) return { whole, f: '' };
    let d = den;
    while (n % 2 === 0 && d % 2 === 0) { n /= 2; d /= 2; }
    return { whole, f: `${n}/${d}` };
  }
  /*
   * Affiche une dimension. unit : 'ft' (pi-po), 'mm' ou 'm'. paper : taille sur feuille.
   */
  function fmtDim(meters, unit, paper) {
    if (meters == null || !isFinite(meters)) return '';
    if (unit === 'ft') {
      const inches = meters / IN;
      if (paper || inches < 12) {
        const { whole, f } = frac(inches, paper ? 64 : 16);
        return whole ? `${whole}${f ? ' ' + f : ''}"` : `${f || 0}"`;
      }
      let ft = Math.floor(inches / 12 + 1e-9);
      const r = frac(inches - ft * 12, 16);
      let wi = r.whole;
      if (wi >= 12) { ft++; wi -= 12; }
      return `${ft}'-${wi}${r.f ? ' ' + r.f : ''}"`;
    }
    if (unit === 'm' && !paper) return `${(meters).toFixed(3).replace('.', ',')} m`;
    const mm = meters * 1000;
    return `${(Math.round(mm * 10) / 10).toString().replace('.', ',')} mm`;
  }
  /*
   * Lit une dimension saisie. Sans unité : pouces si unit = 'ft', sinon mm (ou m si unit = 'm' et non papier).
   */
  function parseDim(str, unit, paper) {
    const s = String(str || '').trim();
    if (!s) return null;
    if (/^\d+([.,]\d+)?$/.test(s) || /^\d+\s+\d+\/\d+$/.test(s) || /^\d+\/\d+$/.test(s)) {
      const v = LP.parseLength(s + (unit === 'ft' ? '"' : unit === 'm' && !paper ? ' m' : ' mm'));
      return v ? v.meters : null;
    }
    const v = LP.parseLength(s);
    return v ? v.meters : null;
  }

  // Bibliothèque par défaut — luminaires à l'échelle, symboles schématiques sur papier
  const D = (o) => Object.assign({ builtin: true, inner: '', tag: '' }, o);
  const DEFAULTS = [
    D({ id: 'b-downlight', name: 'Encastré (downlight)', cat: 'Luminaires', shape: 'downlight', tag: 'A', color: '#d00000', fill: '#ffffff', mode: 'real', dimL: 6 * IN, dimW: 6 * IN }),
    D({ id: 'b-pendant', name: 'Suspendu', cat: 'Luminaires', shape: 'pendant', tag: 'B', color: '#d00000', fill: '#ffffff', mode: 'real', dimL: 12 * IN, dimW: 12 * IN }),
    D({ id: 'b-troffer24', name: 'Encastré 2×4', cat: 'Luminaires', shape: 'rect', tag: 'C', color: '#d00000', fill: '#ffffff', mode: 'real', dimL: 4 * FT, dimW: 2 * FT }),
    D({ id: 'b-troffer22', name: 'Encastré 2×2', cat: 'Luminaires', shape: 'square', tag: 'D', color: '#d00000', fill: '#ffffff', mode: 'real', dimL: 2 * FT, dimW: 2 * FT }),
    D({ id: 'b-strip', name: 'Réglette 1×4', cat: 'Luminaires', shape: 'strip', tag: 'E', color: '#d00000', fill: '#ffffff', mode: 'real', dimL: 4 * FT, dimW: 1 * FT }),
    D({ id: 'b-linear', name: 'Linéaire DEL', cat: 'Luminaires', shape: 'linear', tag: 'F', color: '#d00000', fill: 'none', mode: 'real', dimL: 4 * FT, dimW: 3 * IN }),
    D({ id: 'b-sconce', name: 'Applique murale', cat: 'Luminaires', shape: 'sconce', tag: 'G', color: '#d00000', fill: '#ffffff', mode: 'real', dimL: 12 * IN, dimW: 6 * IN }),
    D({ id: 'b-wallpack', name: 'Wall pack extérieur', cat: 'Luminaires', shape: 'wallpack', tag: 'H', color: '#d00000', fill: 'none', mode: 'real', dimL: 14 * IN, dimW: 9 * IN }),
    D({ id: 'b-track', name: 'Rail + projecteurs', cat: 'Luminaires', shape: 'track', tag: 'J', color: '#d00000', fill: '#ffffff', mode: 'real', dimL: 8 * FT, dimW: 6 * IN }),
    D({ id: 'b-exit', name: 'Enseigne de sortie', cat: 'Urgence', shape: 'exit', tag: 'X', color: '#007a33', fill: '#ffffff', mode: 'paper', dimL: IN / 4, dimW: IN / 4 }),
    D({ id: 'b-bu', name: "Bloc d'urgence", cat: 'Urgence', shape: 'emergency', tag: 'BU', color: '#007a33', fill: '#ffffff', mode: 'paper', dimL: (3 / 8) * IN, dimW: IN / 4 }),
    D({ id: 'b-rh', name: "Tête d'urgence", cat: 'Urgence', shape: 'remotehead', tag: 'TD', color: '#007a33', fill: 'none', mode: 'paper', dimL: IN / 4, dimW: IN / 8 }),
    D({ id: 'b-os', name: 'Détecteur plafond', cat: 'Contrôles', shape: 'circletext', inner: 'DO', color: '#0050c8', fill: '#ffffff', mode: 'paper', dimL: IN / 4, dimW: IN / 4 }),
    D({ id: 'b-osw', name: 'Détecteur mural', cat: 'Contrôles', shape: 'halfcircletext', inner: 'DO', color: '#0050c8', fill: '#ffffff', mode: 'paper', dimL: IN / 4, dimW: (3 / 16) * IN }),
    D({ id: 'b-sw', name: 'Interrupteur', cat: 'Contrôles', shape: 'text', inner: '$', color: '#0050c8', fill: 'none', mode: 'paper', dimL: IN / 4, dimW: IN / 4 }),
    D({ id: 'b-dim', name: 'Gradateur', cat: 'Contrôles', shape: 'text', inner: '$D', color: '#0050c8', fill: 'none', mode: 'paper', dimL: (5 / 16) * IN, dimW: (5 / 16) * IN }),
    D({ id: 'b-pc', name: 'Photocellule', cat: 'Contrôles', shape: 'circletext', inner: 'PC', color: '#0050c8', fill: '#ffffff', mode: 'paper', dimL: IN / 4, dimW: IN / 4 }),
    D({ id: 'b-dl', name: 'Capteur lumière du jour', cat: 'Contrôles', shape: 'circletext', inner: 'LJ', color: '#0050c8', fill: '#ffffff', mode: 'paper', dimL: IN / 4, dimW: IN / 4 }),
    D({ id: 'b-lcp', name: "Panneau de contrôle d'éclairage", cat: 'Contrôles', shape: 'recttext', inner: 'PCE', color: '#0050c8', fill: '#ffffff', mode: 'paper', dimL: IN / 2, dimW: IN / 4 }),
  ];

  window.LP = window.LP || {};
  const LP = window.LP;
  Object.assign(LP, { SHAPES, DEFAULT_SYMBOLS: DEFAULTS, drawSymbol, symbolSize, migrateSym, isRound, tagSize, fmtDim, parseDim, PT_PER_M });
})();
