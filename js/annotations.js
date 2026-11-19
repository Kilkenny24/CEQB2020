/*
 * Modèle, dessin et sélection des annotations.
 * a = { id, page, type, pts:[[x,y]...], style:{stroke, fill, width, opacity, dash, fontSize},
 *       text, comment, author, created, modified, sym, tag, size, rot, showTag }
 */
(function () {
  'use strict';
  const LP = window.LP;

  const TYPE_LABELS = {
    line: 'Ligne', arrow: 'Flèche', rect: 'Rectangle', highlight: 'Surligneur', ellipse: 'Ellipse',
    cloud: 'Nuage de révision', polyline: 'Polyligne', polygon: 'Polygone', ink: 'Main levée',
    text: 'Texte', callout: 'Bulle (callout)', symbol: 'Symbole', length: 'Longueur',
    polylength: 'Longueur (polyligne)', area: 'Aire', calibrate: 'Calibration',
  };

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function dashFor(style) {
    const w = Math.max(style.width || 1, 0.5);
    if (style.dash === 'dash') return [w * 4, w * 3];
    if (style.dash === 'dot') return [0.001, w * 2.5];
    return [];
  }

  function wrapText(R, text, maxW, size) {
    const out = [];
    for (const para of String(text || '').split('\n')) {
      const words = para.split(/\s+/);
      let line = '';
      for (const w of words) {
        const t = line ? line + ' ' + w : w;
        if (line && R.measure(t, size) > maxW) { out.push(line); line = w; } else line = t;
      }
      out.push(line);
    }
    return out;
  }

  function drawLabel(R, str, x, y, size, color) {
    const w = R.measure(str, size, true);
    const pad = size * 0.25;
    R.save();
    R.setAlpha(1);
    R.setFill('#ffffff');
    R.beginPath(); R.rectPath(x - w / 2 - pad, y - size - pad / 2, w + 2 * pad, size + pad * 1.5); R.fill();
    R.text(str, x - w / 2, y - size * 0.15, size, color, true);
    R.restore();
  }

  function arrowHead(R, x1, y1, x2, y2, w, color) {
    const L = Math.max(w * 4, 6), W = L * 0.45;
    const d = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ux = (x2 - x1) / d, uy = (y2 - y1) / d;
    R.setFill(color);
    R.setDash([]);
    R.beginPath();
    R.moveTo(x2, y2);
    R.lineTo(x2 - ux * L - uy * W, y2 - uy * L + ux * W);
    R.lineTo(x2 - ux * L + uy * W, y2 - uy * L - ux * W);
    R.closePath();
    R.fillStroke();
  }

  function norm(p, q) {
    return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1])];
  }

  function cloudPath(R, x, y, w, h, arc) {
    const corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    R.moveTo(x, y);
    for (let i = 0; i < 4; i++) {
      const p = corners[i], q = corners[(i + 1) % 4];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const n = Math.max(1, Math.round(len / arc));
      const ux = (q[0] - p[0]) / len || 0, uy = (q[1] - p[1]) / len || 0;
      const nx = uy, ny = -ux; // normale extérieure (parcours horaire, y vers le bas)
      for (let k = 0; k < n; k++) {
        const a0 = [p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n];
        const a1 = [p[0] + ((q[0] - p[0]) * (k + 1)) / n, p[1] + ((q[1] - p[1]) * (k + 1)) / n];
        R.semiArc(a0[0], a0[1], a1[0], a1[1], nx, ny);
      }
    }
    R.closePath();
  }

  function centroid(pts) {
    let x = 0, y = 0;
    for (const p of pts) { x += p[0]; y += p[1]; }
    return [x / pts.length, y / pts.length];
  }

  function calloutAnchor(a) {
    const [tip, p, q] = a.pts;
    const [x, y, w, h] = norm(p, q);
    const cx = x + w / 2, cy = y + h / 2;
    const cand = [[x, cy], [x + w, cy], [cx, y], [cx, y + h]];
    let best = cand[0], bd = Infinity;
    for (const c of cand) { const d = Math.hypot(c[0] - tip[0], c[1] - tip[1]); if (d < bd) { bd = d; best = c; } }
    return best;
  }

  /*
   * env = { scaleFor(page) -> {mpp, unit} | null }
   */
  function draw(R, a, env) {
    const s = a.style || {};
    const color = s.stroke || '#d00000';
    const fill = s.fill && s.fill !== 'none' ? s.fill : null;
    const lw = s.width != null ? s.width : 1;
    const pts = a.pts;

    if (a.type === 'symbol') {
      LP.drawSymbol(R, a.sym, { x: pts[0][0], y: pts[0][1], size: a.size, rot: a.rot, tag: a.tag, showTag: a.showTag, lineWidth: lw, opacity: s.opacity });
      return;
    }

    R.save();
    if (s.opacity != null && s.opacity < 1) R.setAlpha(s.opacity);
    R.setStroke(color);
    if (fill) R.setFill(fill);
    R.setLineWidth(Math.max(lw, 0.01));
    R.setDash(dashFor(s));
    const stroke = lw > 0;

    switch (a.type) {
      case 'line':
      case 'arrow':
      case 'calibrate':
      case 'length': {
        const [p, q] = pts;
        R.beginPath(); R.moveTo(p[0], p[1]); R.lineTo(q[0], q[1]); R.stroke();
        if (a.type === 'arrow') arrowHead(R, p[0], p[1], q[0], q[1], lw, color);
        if (a.type === 'length' || a.type === 'calibrate') {
          const d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
          const nx = -(q[1] - p[1]) / d, ny = (q[0] - p[0]) / d, t = Math.max(lw * 4, 5);
          R.setDash([]);
          R.beginPath();
          R.moveTo(p[0] - nx * t, p[1] - ny * t); R.lineTo(p[0] + nx * t, p[1] + ny * t);
          R.moveTo(q[0] - nx * t, q[1] - ny * t); R.lineTo(q[0] + nx * t, q[1] + ny * t);
          R.stroke();
          const sc = env && env.scaleFor(a.page);
          const lbl = a.type === 'calibrate' ? 'Calibration' : sc ? LP.fmtLength(d * sc.mpp, sc.unit) : `${d.toFixed(1)} pt (non calibré)`;
          drawLabel(R, lbl, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2 - t, s.fontSize || 9, color);
        }
        break;
      }
      case 'rect':
      case 'highlight': {
        const [x, y, w, h] = norm(pts[0], pts[1]);
        R.beginPath(); R.rectPath(x, y, w, h); R.paint(fill, stroke);
        break;
      }
      case 'ellipse': {
        const [x, y, w, h] = norm(pts[0], pts[1]);
        R.beginPath(); R.ellipsePath(x + w / 2, y + h / 2, w / 2, h / 2); R.paint(fill, stroke);
        break;
      }
      case 'cloud': {
        const [x, y, w, h] = norm(pts[0], pts[1]);
        R.beginPath(); cloudPath(R, x, y, w, h, s.arc || 14); R.paint(fill, stroke);
        break;
      }
      case 'polyline':
      case 'ink':
      case 'polylength': {
        R.beginPath(); R.polyPath(pts, false); R.stroke();
        if (a.type === 'polylength' && pts.length > 1) {
          const sc = env && env.scaleFor(a.page);
          const L = LP.polyLength(pts);
          const lbl = sc ? LP.fmtLength(L * sc.mpp, sc.unit) : `${L.toFixed(1)} pt (non calibré)`;
          const last = pts[pts.length - 1];
          drawLabel(R, lbl, last[0], last[1] - 6, s.fontSize || 9, color);
        }
        break;
      }
      case 'polygon':
      case 'area': {
        R.beginPath(); R.polyPath(pts, true); R.paint(fill, stroke);
        if (a.type === 'area' && pts.length > 2) {
          const sc = env && env.scaleFor(a.page);
          const A = LP.polyArea(pts);
          const lbl = sc ? LP.fmtArea(A * sc.mpp * sc.mpp, sc.unit) : `${A.toFixed(0)} pt² (non calibré)`;
          const c = centroid(pts);
          drawLabel(R, lbl, c[0], c[1], s.fontSize || 9, color);
        }
        break;
      }
      case 'text':
      case 'callout': {
        const box = a.type === 'callout' ? [pts[1], pts[2]] : [pts[0], pts[1]];
        const [x, y, w, h] = norm(box[0], box[1]);
        if (a.type === 'callout') {
          const an = calloutAnchor(a);
          R.beginPath(); R.moveTo(an[0], an[1]); R.lineTo(pts[0][0], pts[0][1]); R.stroke();
          arrowHead(R, an[0], an[1], pts[0][0], pts[0][1], Math.max(lw, 0.6), color);
        }
        R.setDash(dashFor(s));
        R.beginPath(); R.rectPath(x, y, w, h); R.paint(fill, stroke);
        const fs = s.fontSize || 10;
        const pad = fs * 0.35;
        const lines = wrapText(R, a.text || '', Math.max(w - 2 * pad, fs), fs);
        const tc = s.textColor || color;
        lines.forEach((ln, i) => {
          const ty = y + pad + fs * (i + 1) * 1.15 - fs * 0.2;
          if (ty <= y + h + fs * 0.1 || i === 0) R.text(ln, x + pad, ty, fs, tc, false);
        });
        break;
      }
    }
    R.restore();
  }

  /* -------- Géométrie : sélection -------- */
  function distSeg(px, py, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L2 = dx * dx + dy * dy;
    let t = L2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
  }
  function inPoly(x, y, pts) {
    let ins = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
  }

  function hit(a, x, y, tol) {
    const p = a.pts;
    const filled = a.style && a.style.fill && a.style.fill !== 'none';
    switch (a.type) {
      case 'symbol': {
        const box = LP.shapeBox(a.sym);
        const sz = a.size || a.sym.size;
        const r = (-(a.rot || 0) * Math.PI) / 180;
        const dx = x - p[0][0], dy = y - p[0][1];
        const lx = dx * Math.cos(r) - dy * Math.sin(r), ly = dx * Math.sin(r) + dy * Math.cos(r);
        return Math.abs(lx) <= (box[0] * sz) / 2 + tol && Math.abs(ly) <= Math.max((box[1] * sz) / 2, sz * 0.2) + tol;
      }
      case 'line': case 'arrow': case 'length': case 'calibrate':
        return distSeg(x, y, p[0], p[1]) <= tol;
      case 'polyline': case 'ink': case 'polylength':
        for (let i = 1; i < p.length; i++) if (distSeg(x, y, p[i - 1], p[i]) <= tol) return true;
        return false;
      case 'polygon': case 'area': {
        for (let i = 0; i < p.length; i++) if (distSeg(x, y, p[i], p[(i + 1) % p.length]) <= tol) return true;
        return (filled || a.type === 'area') && inPoly(x, y, p);
      }
      case 'ellipse': {
        const [bx, by, w, h] = norm(p[0], p[1]);
        const rx = w / 2, ry = h / 2, cx = bx + rx, cy = by + ry;
        const v = Math.hypot((x - cx) / (rx || 1), (y - cy) / (ry || 1));
        if (filled) return v <= 1 + tol / Math.max(rx, ry, 1);
        return Math.abs(v - 1) * Math.min(rx, ry) <= tol + 1;
      }
      case 'text': case 'callout': case 'rect': case 'highlight': case 'cloud': {
        const box = a.type === 'callout' ? [p[1], p[2]] : [p[0], p[1]];
        const [bx, by, w, h] = norm(box[0], box[1]);
        if (a.type === 'callout' && distSeg(x, y, p[0], calloutAnchor(a)) <= tol) return true;
        const inside = x >= bx - tol && x <= bx + w + tol && y >= by - tol && y <= by + h + tol;
        if (!inside) return false;
        if (filled || a.type === 'text' || a.type === 'callout' || a.type === 'highlight') return true;
        return x <= bx + tol || x >= bx + w - tol || y <= by + tol || y >= by + h - tol;
      }
    }
    return false;
  }

  function bbox(a) {
    if (a.type === 'symbol') {
      const sz = a.size || a.sym.size;
      return [a.pts[0][0] - sz / 2, a.pts[0][1] - sz / 2, sz, sz];
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of a.pts) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
    return [x0, y0, x1 - x0, y1 - y0];
  }

  // Résumé texte (liste d'annotations / CSV)
  function describe(a, env) {
    const sc = env && env.scaleFor(a.page);
    switch (a.type) {
      case 'symbol': return `${a.sym.name}${a.tag ? ' [' + a.tag + ']' : ''}`;
      case 'length': {
        const d = Math.hypot(a.pts[1][0] - a.pts[0][0], a.pts[1][1] - a.pts[0][1]);
        return sc ? LP.fmtLength(d * sc.mpp, sc.unit) : 'non calibré';
      }
      case 'polylength': return sc ? LP.fmtLength(LP.polyLength(a.pts) * sc.mpp, sc.unit) : 'non calibré';
      case 'area': return sc ? LP.fmtArea(LP.polyArea(a.pts) * sc.mpp * sc.mpp, sc.unit) : 'non calibré';
      case 'text': case 'callout': return (a.text || '').slice(0, 60);
    }
    return a.comment || '';
  }

  // Valeur numérique (m ou m²) pour les exports
  function quantity(a, env) {
    const sc = env && env.scaleFor(a.page);
    if (!sc) return null;
    if (a.type === 'length') return Math.hypot(a.pts[1][0] - a.pts[0][0], a.pts[1][1] - a.pts[0][1]) * sc.mpp;
    if (a.type === 'polylength') return LP.polyLength(a.pts) * sc.mpp;
    if (a.type === 'area') return LP.polyArea(a.pts) * sc.mpp * sc.mpp;
    return null;
  }

  Object.assign(LP, { TYPE_LABELS, uid, drawAnnotation: draw, hitAnnotation: hit, bboxAnnotation: bbox, describeAnnotation: describe, quantityAnnotation: quantity });
})();
