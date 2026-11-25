/*
 * Abstraction de dessin commune : le même code de dessin des annotations
 * sert à l'affichage (Canvas 2D) et à l'export PDF (opérateurs pdf-lib).
 * Toutes les coordonnées sont en « unités page » (points PDF, origine en
 * haut à gauche, après rotation de la page), y vers le bas.
 */
(function () {
  'use strict';
  const K = 0.5522847498; // constante Bézier pour approximer un quart de cercle

  function hexToRgb(hex) {
    if (!hex || hex === 'none') return null;
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  // Méthodes partagées construites sur moveTo / curveTo
  const shared = {
    ellipsePath(cx, cy, rx, ry) {
      const ox = rx * K, oy = ry * K;
      this.moveTo(cx - rx, cy);
      this.curveTo(cx - rx, cy - oy, cx - ox, cy - ry, cx, cy - ry);
      this.curveTo(cx + ox, cy - ry, cx + rx, cy - oy, cx + rx, cy);
      this.curveTo(cx + rx, cy + oy, cx + ox, cy + ry, cx, cy + ry);
      this.curveTo(cx - ox, cy + ry, cx - rx, cy + oy, cx - rx, cy);
      this.closePath();
    },
    rectPath(x, y, w, h) {
      this.moveTo(x, y);
      this.lineTo(x + w, y);
      this.lineTo(x + w, y + h);
      this.lineTo(x, y + h);
      this.closePath();
    },
    polyPath(pts, close) {
      if (!pts.length) return;
      this.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) this.lineTo(pts[i][0], pts[i][1]);
      if (close) this.closePath();
    },
    // Demi-cercle de P vers Q, bombé dans la direction de la normale n
    semiArc(px, py, qx, qy, nx, ny) {
      const mx = (px + qx) / 2, my = (py + qy) / 2;
      const r = Math.hypot(qx - px, qy - py) / 2;
      if (r === 0) return;
      const ux = (qx - px) / (2 * r), uy = (qy - py) / (2 * r);
      const tx = mx + nx * r, ty = my + ny * r;
      this.curveTo(px + nx * K * r, py + ny * K * r, tx - ux * K * r, ty - uy * K * r, tx, ty);
      this.curveTo(tx + ux * K * r, ty + uy * K * r, qx + nx * K * r, qy + ny * K * r, qx, qy);
    },
    // Paint selon style : fill/stroke éventuels
    paint(fill, stroke) {
      if (fill) this.setFill(fill);
      if (fill && stroke) this.fillStroke();
      else if (fill) this.fill();
      else if (stroke) this.stroke();
      else this.endPath();
    },
  };

  /* ---------------- Canvas ---------------- */
  class CanvasRenderer {
    constructor(ctx, images) {
      this.ctx = ctx;
      this.images = images || {};
      this.kind = 'canvas';
    }
    save() { this.ctx.save(); }
    restore() { this.ctx.restore(); }
    transform(a, b, c, d, e, f) { this.ctx.transform(a, b, c, d, e, f); }
    setStroke(c) { this.ctx.strokeStyle = c; }
    setFill(c) { this.ctx.fillStyle = c; }
    setLineWidth(w) { this.ctx.lineWidth = w; }
    setDash(arr) { this.ctx.setLineDash(arr || []); }
    setAlpha(a) { this.ctx.globalAlpha = a; }
    beginPath() { this.ctx.beginPath(); }
    moveTo(x, y) { this.ctx.moveTo(x, y); }
    lineTo(x, y) { this.ctx.lineTo(x, y); }
    curveTo(a, b, c, d, e, f) { this.ctx.bezierCurveTo(a, b, c, d, e, f); }
    closePath() { this.ctx.closePath(); }
    stroke() { this.ctx.lineCap = 'round'; this.ctx.lineJoin = 'round'; this.ctx.stroke(); }
    fill() { this.ctx.fill(); }
    fillStroke() { this.fill(); this.stroke(); }
    endPath() {}
    font(size, bold) { return `${bold ? 'bold ' : ''}${size}px Helvetica, Arial, sans-serif`; }
    measure(str, size, bold) {
      this.ctx.font = this.font(size, bold);
      return this.ctx.measureText(str).width;
    }
    text(str, x, y, size, color, bold) {
      this.ctx.font = this.font(size, bold);
      this.ctx.fillStyle = color;
      this.ctx.textBaseline = 'alphabetic';
      this.ctx.fillText(str, x, y);
    }
    hasImage(id) { const img = this.images[id]; return !!(img && img.complete && img.naturalWidth); }
    image(id, x, y, w, h) {
      const img = this.images[id];
      if (img && img.complete && img.naturalWidth) this.ctx.drawImage(img, x, y, w, h);
      else { this.setStroke('#999'); this.setLineWidth(w / 20); this.beginPath(); this.rectPath(x, y, w, h); this.stroke(); }
    }
  }
  Object.assign(CanvasRenderer.prototype, shared);

  /* ---------------- PDF (pdf-lib) ---------------- */
  /*
   * res = { font, fontBold, fontName, fontBoldName, gsName(alpha) -> PDFName, images: {id: PDFName} }
   * Les ressources sont fournies soit par une page (dessin aplati), soit par
   * un Form XObject (apparence /AP d'une annotation native).
   */
  class PdfRenderer {
    constructor(res) {
      const L = window.PDFLib;
      this.L = L;
      this.res = res;
      this.ops = [];
      this.kind = 'pdf';
      this.alpha = 1;
      this.stack = [];
    }
    push(...o) { this.ops.push(...o); }
    save() { this.push(this.L.pushGraphicsState()); this.stack.push(this.alpha); }
    restore() { this.push(this.L.popGraphicsState()); this.alpha = this.stack.pop() ?? 1; }
    transform(a, b, c, d, e, f) { this.push(this.L.concatTransformationMatrix(a, b, c, d, e, f)); }
    setStroke(c) { const r = hexToRgb(c); if (r) this.push(this.L.setStrokingRgbColor(...r)); }
    setFill(c) { const r = hexToRgb(c); if (r) this.push(this.L.setFillingRgbColor(...r)); }
    setLineWidth(w) { this.push(this.L.setLineWidth(w)); }
    setDash(arr) { this.push(this.L.setDashPattern(arr || [], 0)); }
    setAlpha(a) {
      a = Math.round(a * 100) / 100;
      this.alpha = a;
      this.push(this.L.setGraphicsState(this.res.gsName(a)));
    }
    beginPath() {}
    moveTo(x, y) { this.push(this.L.moveTo(x, y)); }
    lineTo(x, y) { this.push(this.L.lineTo(x, y)); }
    curveTo(a, b, c, d, e, f) { this.push(this.L.appendBezierCurve(a, b, c, d, e, f)); }
    closePath() { this.push(this.L.closePath()); }
    stroke() {
      this.push(this.L.setLineCap(this.L.LineCapStyle.Round), this.L.setLineJoin(this.L.LineJoinStyle.Round), this.L.stroke());
    }
    fill() { this.push(this.L.fill()); }
    fillStroke() {
      this.push(this.L.setLineCap(this.L.LineCapStyle.Round), this.L.setLineJoin(this.L.LineJoinStyle.Round), this.L.fillAndStroke());
    }
    endPath() { this.push(this.L.endPath()); }
    fontObj(bold) { return bold ? this.res.fontBold : this.res.font; }
    safe(str, bold) {
      // Helvetica standard = WinAnsi : remplace les caractères non encodables
      const f = this.fontObj(bold);
      let out = '';
      for (const ch of str) {
        try { f.encodeText(ch); out += ch; } catch (e) { out += '?'; }
      }
      return out;
    }
    measure(str, size, bold) { return this.fontObj(bold).widthOfTextAtSize(this.safe(str, bold), size); }
    text(str, x, y, size, color, bold) {
      const f = this.fontObj(bold);
      const name = bold ? this.res.fontBoldName : this.res.fontName;
      const s = this.safe(str, bold);
      this.save();
      this.setFill(color);
      this.push(
        this.L.beginText(),
        this.L.setFontAndSize(name, size),
        // Le repère courant a y vers le bas : on inverse l'axe pour le texte
        this.L.setTextMatrix(1, 0, 0, -1, x, y),
        this.L.showText(f.encodeText(s)),
        this.L.endText(),
      );
      this.restore();
    }
    hasImage(id) { return !!this.res.images[id]; }
    image(id, x, y, w, h) {
      const name = this.res.images[id];
      if (!name) return;
      this.save();
      this.transform(w, 0, 0, -h, x, y + h);
      this.push(this.L.drawObject(name));
      this.restore();
    }
  }
  Object.assign(PdfRenderer.prototype, shared);

  window.LP = window.LP || {};
  Object.assign(window.LP, { CanvasRenderer, PdfRenderer, hexToRgb, RendererShared: shared });
})();
