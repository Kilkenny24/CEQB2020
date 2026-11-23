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
    note: 'Note (commentaire)', markup: 'Annotation de texte', schedule: 'Tableau des luminaires', cable: 'Câble',
  };
  const MARKUP_LABELS = { Highlight: 'Surlignage', Underline: 'Soulignement', StrikeOut: 'Barré', Squiggly: 'Ondulé' };
  const NOTE_SIZE = 18;

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
    cloudPoly(R, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], arc);
  }
  // Nuage de révision le long d'un polygone quelconque (arcs vers l'extérieur)
  function cloudPoly(R, corners, arc) {
    let area = 0;
    for (let i = 0; i < corners.length; i++) {
      const p = corners[i], q = corners[(i + 1) % corners.length];
      area += p[0] * q[1] - q[0] * p[1];
    }
    const sg = area >= 0 ? 1 : -1;
    R.moveTo(corners[0][0], corners[0][1]);
    for (let i = 0; i < corners.length; i++) {
      const p = corners[i], q = corners[(i + 1) % corners.length];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (!len) continue;
      const n = Math.max(1, Math.round(len / arc));
      const ux = (q[0] - p[0]) / len, uy = (q[1] - p[1]) / len;
      const nx = sg * uy, ny = -sg * ux; // normale extérieure (y vers le bas)
      for (let k = 0; k < n; k++) {
        const a0 = [p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n];
        const a1 = [p[0] + ((q[0] - p[0]) * (k + 1)) / n, p[1] + ((q[1] - p[1]) * (k + 1)) / n];
        R.semiArc(a0[0], a0[1], a1[0], a1[1], nx, ny);
      }
    }
    R.closePath();
  }

  // Encre : a.breaks = indices où commence un nouveau trait
  function strokes(a) {
    if (!a.breaks || !a.breaks.length) return [a.pts];
    const out = [];
    let start = 0;
    for (const b of a.breaks.concat([a.pts.length])) { if (b > start) out.push(a.pts.slice(start, b)); start = b; }
    return out;
  }

  function noteIcon(R, x, y, color) {
    const s = NOTE_SIZE;
    R.save();
    R.setStroke('#5a4a00');
    R.setLineWidth(0.8);
    R.setDash([]);
    R.beginPath();
    R.moveTo(x, y); R.lineTo(x + s, y); R.lineTo(x + s, y + s * 0.72);
    R.lineTo(x + s * 0.45, y + s * 0.72); R.lineTo(x + s * 0.2, y + s); R.lineTo(x + s * 0.25, y + s * 0.72);
    R.lineTo(x, y + s * 0.72); R.closePath();
    R.paint(color || '#ffd400', true);
    R.beginPath();
    for (let i = 1; i <= 3; i++) { R.moveTo(x + s * 0.18, y + s * 0.18 * i); R.lineTo(x + s * 0.82, y + s * 0.18 * i); }
    R.stroke();
    R.restore();
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
      const sz = LP.symbolSize(a.sym, a, env && env.scaleFor(a.page));
      // Coloration par circuit / zone / type (module Circuits)
      const ov = env && env.ext && env.ext.symColor ? env.ext.symColor(a) : null;
      const sym = ov ? Object.assign({}, a.sym, { color: ov }) : a.sym;
      LP.drawSymbol(R, sym, { x: pts[0][0], y: pts[0][1], w: sz.w, h: sz.h, provisional: sz.provisional && R.kind === 'canvas', rot: a.rot, tag: a.tag, showTag: a.showTag, lineWidth: lw, opacity: s.opacity });
      // Inscriptions sous le symbole : circuit, hauteur de montage
      const under = [];
      if (env && env.ext && env.ext.showCircuit && a.circuit) under.push(String(a.circuit));
      if (env && env.ext && env.ext.showHeight) under.push('H ' + LP.fmtDim(a.mh != null ? a.mh : (env.ext.defaultHeight || 3.048), env.unit ? env.unit() : 'ft', false));
      if (under.length) {
        const fs = Math.max(4.5, Math.min(Math.max(sz.w, sz.h) * 0.45, 7));
        const r = ((a.rot || 0) * Math.PI) / 180;
        const ey = Math.abs((sz.w / 2) * Math.sin(r)) + Math.abs((sz.h / 2) * Math.cos(r));
        R.save();
        under.forEach((t, i) => {
          const w = R.measure(t, fs, false);
          R.text(t, pts[0][0] - w / 2, pts[0][1] + ey + fs * (1.05 + i * 1.15), fs, ov || '#333333', false);
        });
        R.restore();
      }
      return;
    }
    if (a.type === 'cable') {
      drawCable(R, a, env);
      return;
    }
    if (a.type === 'schedule') {
      drawSchedule(R, a, env);
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
      case 'ink':
        R.beginPath();
        for (const st of strokes(a)) R.polyPath(st, false);
        R.stroke();
        break;
      case 'note':
        noteIcon(R, pts[0][0], pts[0][1], s.stroke);
        break;
      case 'markup': {
        R.setDash([]);
        for (let i = 0; i + 3 < pts.length; i += 4) {
          const [tl, tr, bl, br] = pts.slice(i, i + 4);
          if (a.markup === 'Highlight') {
            R.beginPath(); R.polyPath([tl, tr, br, bl], true); R.paint(color, false);
          } else {
            const t = a.markup === 'StrikeOut' ? 0.5 : 0.92;
            const h = Math.hypot(bl[0] - tl[0], bl[1] - tl[1]);
            R.setLineWidth(Math.max(h * 0.07, 0.5));
            if (a.markup === 'Squiggly') R.setDash([h * 0.15, h * 0.1]);
            R.beginPath();
            R.moveTo(tl[0] + (bl[0] - tl[0]) * t, tl[1] + (bl[1] - tl[1]) * t);
            R.lineTo(tr[0] + (br[0] - tr[0]) * t, tr[1] + (br[1] - tr[1]) * t);
            R.stroke();
          }
        }
        break;
      }
      case 'polyline':
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
        R.beginPath();
        if (s.cloud && a.type === 'polygon') cloudPoly(R, pts, s.arc || 14); else R.polyPath(pts, true);
        R.paint(fill, stroke);
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
        const sz = symSize(a);
        const r = (-(a.rot || 0) * Math.PI) / 180;
        const dx = x - p[0][0], dy = y - p[0][1];
        const lx = dx * Math.cos(r) - dy * Math.sin(r), ly = dx * Math.sin(r) + dy * Math.cos(r);
        return Math.abs(lx) <= sz.w / 2 + tol && Math.abs(ly) <= Math.max(sz.h / 2, 2) + tol;
      }
      case 'line': case 'arrow': case 'length': case 'calibrate':
        return distSeg(x, y, p[0], p[1]) <= tol;
      case 'polyline': case 'polylength':
        for (let i = 1; i < p.length; i++) if (distSeg(x, y, p[i - 1], p[i]) <= tol) return true;
        return false;
      case 'ink':
        for (const st of strokes(a)) for (let i = 1; i < st.length; i++) if (distSeg(x, y, st[i - 1], st[i]) <= tol + (a.style.width || 1) / 2) return true;
        return false;
      case 'note':
        return x >= p[0][0] - tol && x <= p[0][0] + NOTE_SIZE + tol && y >= p[0][1] - tol && y <= p[0][1] + NOTE_SIZE + tol;
      case 'schedule': {
        const [bx, by, bw, bh] = bbox(a);
        return x >= bx - tol && x <= bx + bw + tol && y >= by - tol && y <= by + bh + tol;
      }
      case 'cable': {
        const g = cableGeom(a, LP.env);
        for (let i = 1; i < g.pts.length; i++) if (distSeg(x, y, g.pts[i - 1], g.pts[i]) <= tol + 1) return true;
        return false;
      }
      case 'markup':
        for (let i = 0; i + 3 < p.length; i += 4) if (inPoly(x, y, [p[i], p[i + 1], p[i + 3], p[i + 2]])) return true;
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

  /*
   * Câble entre deux composantes : courbe de Bézier légère. Plusieurs câbles entre les
   * mêmes composantes sont répartis de part et d'autre, de plus en plus écartés.
   * Les extrémités suivent les symboles reliés (a.from / a.to).
   */
  function cableGeom(a, env) {
    const ext = (env && env.ext) || {};
    const A = ext.byId ? ext.byId(a.from) : null, B = ext.byId ? ext.byId(a.to) : null;
    const p0 = A ? A.pts[0] : a.pts[0], p1 = B ? B.pts[0] : a.pts[1];
    a.pts = [[p0[0], p0[1]], [p1[0], p1[1]]];
    const lane = ext.cableLane ? ext.cableLane(a) : 0;
    // Sens de référence commun à la paire (indépendant de l'ordre de tracé)
    const flip = String(a.from) > String(a.to) ? -1 : 1;
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy) || 1;
    const nx = (-dy / L) * flip, ny = (dx / L) * flip;
    const o = (lane % 2 ? -1 : 1) * 0.12 * (1 + Math.floor(lane / 2)) * (a.bend != null ? a.bend : 1);
    const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    const q = [mx + nx * 2 * o * L, my + ny * 2 * o * L];
    const c1 = [p0[0] + (2 / 3) * (q[0] - p0[0]), p0[1] + (2 / 3) * (q[1] - p0[1])];
    const c2 = [p1[0] + (2 / 3) * (q[0] - p1[0]), p1[1] + (2 / 3) * (q[1] - p1[1])];
    const pts = [];
    let len = 0;
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, u = 1 - t;
      const p = [u * u * p0[0] + 2 * u * t * q[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * q[1] + t * t * p1[1]];
      if (i) len += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      pts.push(p);
    }
    // Étiquette décalée le long de la courbe selon le rang (évite les chevauchements entre câbles voisins)
    const tl = 0.5 + (lane % 2 ? -1 : 1) * 0.14 * Math.ceil(lane / 2);
    const lbl = pts[Math.max(2, Math.min(22, Math.round(tl * 24)))];
    return { p0, p1, q, c1, c2, pts, len, mid: pts[12], lbl, orphan: !A || !B };
  }
  function drawCable(R, a, env) {
    const g = cableGeom(a, env);
    const ext = (env && env.ext) || {};
    const st = ext.cableStyle ? ext.cableStyle(a.ctype) : { color: '#333333', width: 0.8, dash: [] };
    const w = st.width * (a.style && a.style.width ? a.style.width : 1);
    R.save();
    if (a.style && a.style.opacity != null && a.style.opacity < 1) R.setAlpha(a.style.opacity);
    R.setStroke(st.color);
    R.setLineWidth(w);
    R.setDash((st.dash || []).map((d) => d * w));
    R.beginPath();
    R.moveTo(g.p0[0], g.p0[1]);
    R.curveTo(g.c1[0], g.c1[1], g.c2[0], g.c2[1], g.p1[0], g.p1[1]);
    R.stroke();
    R.setDash([]);
    if (g.orphan) { // extrémité dont le symbole a disparu
      R.setFill('#c2341b'); R.beginPath(); R.ellipsePath(g.p1[0], g.p1[1], 2, 2); R.fill();
    }
    if (ext.cableLabels) {
      let t = ext.cableLabel ? ext.cableLabel(a) : String(a.ctype || '');
      const fs = 4.5;
      const tw = R.measure(t, fs, true), pad = 1;
      R.setFill('#ffffff');
      R.beginPath(); R.rectPath(g.lbl[0] - tw / 2 - pad, g.lbl[1] - fs * 0.85 - pad, tw + 2 * pad, fs * 1.15 + pad); R.fill();
      R.text(t, g.lbl[0] - tw / 2, g.lbl[1], fs, st.color, true);
    }
    R.restore();
  }

  /*
   * Tableau des luminaires placé sur la feuille. Contenu fourni par le module
   * Tableau (env.ext.scheduleData) : { title, cols:[{label, align}], rows:[[...]], foot }.
   * Recalculé à chaque dessin : il suit automatiquement les quantités et les données.
   */
  let measureCtx = null;
  function canvasMeasure(t, size, bold) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = `${bold ? 'bold ' : ''}${size}px Helvetica, Arial, sans-serif`;
    return measureCtx.measureText(t).width;
  }
  function scheduleLayout(a, env, R) {
    const data = env && env.ext && env.ext.scheduleData ? env.ext.scheduleData(a) : { title: 'TABLEAU DES LUMINAIRES', cols: [{ label: 'Type' }], rows: [] };
    const fs = a.fs || 7;
    const pad = fs * 0.55, rh = fs * 1.75;
    const meas = (t, b) => (R ? R.measure(String(t), fs, b) : canvasMeasure(String(t), fs, b));
    const widths = data.cols.map((c, i) => {
      let w = meas(c.label, true);
      for (const r of data.rows) w = Math.max(w, meas(r[i] == null ? '' : r[i], false));
      return Math.min(w + 2 * pad, c.max ? c.max * fs : Infinity);
    });
    const tableW = widths.reduce((x, y) => x + y, 0);
    const titleH = data.title ? fs * 2.3 : 0;
    const w = Math.max(tableW, data.title ? meas(data.title, true) * 1.3 + 2 * pad : 0);
    const h = titleH + rh * (data.rows.length + 1) + (data.foot ? rh : 0);
    return { data, fs, pad, rh, widths, titleH, w, h };
  }
  function clip(R, t, maxW, fs, bold) {
    t = String(t == null ? '' : t);
    if (R.measure(t, fs, bold) <= maxW + fs * 0.05) return t; // tolérance d'arrondi des mesures
    while (t.length > 1 && R.measure(t + '…', fs, bold) > maxW) t = t.slice(0, -1);
    return t + '…';
  }
  function drawSchedule(R, a, env) {
    const L = scheduleLayout(a, env, R);
    const [x0, y0] = a.pts[0];
    const { fs, pad, rh, widths, titleH, data } = L;
    const W = L.w;
    const ink = a.color || '#1b1f24';
    R.save();
    R.setDash([]);
    // Fond blanc pour la lisibilité sur le plan
    R.setFill('#ffffff');
    R.beginPath(); R.rectPath(x0, y0, W, L.h); R.fill();
    if (data.title) R.text(data.title, x0 + pad, y0 + fs * 1.55, fs * 1.15, ink, true);
    let y = y0 + titleH;
    // En-tête
    R.setFill('#e9ecf1');
    R.beginPath(); R.rectPath(x0, y, W, rh); R.fill();
    const colX = [];
    let cx = x0;
    for (const w of widths) { colX.push(cx); cx += w; }
    const extra = W - (cx - x0);
    if (extra > 0 && widths.length) widths[widths.length - 1] += extra; // dernière colonne élargie au titre
    const cell = (txt, i, yy, bold) => {
      const w = widths[i] - 2 * pad;
      const t = clip(R, txt, w, fs, bold);
      const tw = R.measure(t, fs, bold);
      const al = data.cols[i].align;
      const tx = al === 'right' ? colX[i] + widths[i] - pad - tw : al === 'center' ? colX[i] + (widths[i] - tw) / 2 : colX[i] + pad;
      R.text(t, tx, yy + rh / 2 + fs * 0.35, fs, ink, bold);
    };
    data.cols.forEach((c, i) => cell(c.label, i, y, true));
    y += rh;
    data.rows.forEach((r, ri) => {
      if (ri % 2 === 1) { R.setFill('#f6f7f9'); R.beginPath(); R.rectPath(x0, y, W, rh); R.fill(); }
      r.forEach((v, i) => cell(v, i, y, false));
      y += rh;
    });
    if (data.foot) {
      R.setFill('#e9ecf1'); R.beginPath(); R.rectPath(x0, y, W, rh); R.fill();
      R.text(data.foot, x0 + pad, y + rh / 2 + fs * 0.35, fs, ink, true);
      y += rh;
    }
    // Quadrillage
    R.setStroke(ink); R.setLineWidth(Math.max(fs * 0.06, 0.3));
    R.beginPath(); R.rectPath(x0, y0, W, L.h); R.stroke();
    R.setLineWidth(Math.max(fs * 0.04, 0.2));
    R.beginPath();
    for (let k = 0, yy = y0 + titleH; k <= data.rows.length + 1 + (data.foot ? 1 : 0); k++, yy += rh) { R.moveTo(x0, yy); R.lineTo(x0 + W, yy); }
    const bodyBottom = y0 + titleH + rh * (data.rows.length + 1);
    for (let i = 1; i < colX.length; i++) { R.moveTo(colX[i], y0 + titleH); R.lineTo(colX[i], bodyBottom); }
    R.stroke();
    R.restore();
  }

  // Taille d'un symbole placé, selon l'échelle de sa page (LP.env fourni par l'application)
  function symSize(a) {
    return LP.symbolSize(a.sym, a, LP.env ? LP.env.scaleFor(a.page) : null);
  }

  function bbox(a) {
    if (a.type === 'note') return [a.pts[0][0], a.pts[0][1], NOTE_SIZE, NOTE_SIZE];
    if (a.type === 'schedule') { const L = scheduleLayout(a, LP.env, null); return [a.pts[0][0], a.pts[0][1], L.w, L.h]; }
    if (a.type === 'cable') {
      const g = cableGeom(a, LP.env);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of g.pts) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
      return [x0, y0, x1 - x0, y1 - y0];
    }
    if (a.type === 'symbol') {
      // Emprise du rectangle tourné
      const sz = symSize(a);
      const r = ((a.rot || 0) * Math.PI) / 180;
      const ex = Math.abs((sz.w / 2) * Math.cos(r)) + Math.abs((sz.h / 2) * Math.sin(r));
      const ey = Math.abs((sz.w / 2) * Math.sin(r)) + Math.abs((sz.h / 2) * Math.cos(r));
      return [a.pts[0][0] - ex, a.pts[0][1] - ey, 2 * ex, 2 * ey];
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of a.pts) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
    return [x0, y0, x1 - x0, y1 - y0];
  }

  /*
   * Emprise visuelle (traits, étiquettes, têtes de flèche compris) — sert
   * de /Rect et de /BBox pour les annotations PDF natives.
   */
  function visualBounds(a) {
    const s = a.style || {};
    const lw = s.width || 1;
    let [x, y, w, h] = bbox(a);
    let m = lw * 2 + 2;
    if (a.type === 'symbol') {
      const sz = symSize(a);
      const ts = LP.tagSize(sz.w, sz.h);
      const tagLen = ((a.tag != null ? a.tag : a.sym.tag) || '').length;
      const circ = 22; // circuit et hauteur inscrits sous le luminaire
      return [x - lw - 1 - circ, y - ts - lw - 1, w + tagLen * ts * 0.8 + ts + 2 * lw + 2 + 2 * circ, h + ts * 2 + 2 * lw + 2 + circ];
    }
    if (a.type === 'arrow' || a.type === 'callout') m += Math.max(lw * 4, 6);
    if (a.type === 'cloud' || (a.type === 'polygon' && s.cloud)) m += (s.arc || 14) * 0.6;
    if (['length', 'calibrate', 'polylength', 'area'].includes(a.type)) m += (s.fontSize || 9) * 7;
    if (a.type === 'cable') m += 30; // étiquette du câble
    return [x - m, y - m, w + 2 * m, h + 2 * m];
  }

  // Résumé texte (liste d'annotations / CSV)
  function describe(a, env) {
    const sc = env && env.scaleFor(a.page);
    switch (a.type) {
      case 'symbol': return `${a.sym.name}${a.tag ? ' [' + a.tag + ']' : ''}${symDimText(a) ? ' — ' + symDimText(a) : ''}`;
      case 'length': {
        const d = Math.hypot(a.pts[1][0] - a.pts[0][0], a.pts[1][1] - a.pts[0][1]);
        return sc ? LP.fmtLength(d * sc.mpp, sc.unit) : 'non calibré';
      }
      case 'polylength': return sc ? LP.fmtLength(LP.polyLength(a.pts) * sc.mpp, sc.unit) : 'non calibré';
      case 'area': return sc ? LP.fmtArea(LP.polyArea(a.pts) * sc.mpp * sc.mpp, sc.unit) : 'non calibré';
      case 'text': case 'callout': return (a.text || '').slice(0, 60);
      case 'note': return (a.comment || '').slice(0, 60);
      case 'schedule': return a.scope === 'page' ? 'page courante' : 'tout le projet';
      case 'cable': return LP.env && LP.env.ext && LP.env.ext.cableLabel ? LP.env.ext.cableLabel(a, true) : String(a.ctype || '');
      case 'markup': return MARKUP_LABELS[a.markup] || a.markup;
    }
    return a.comment || '';
  }

  // Dimensions d'un symbole placé, en texte (ex. 4'-0" × 2'-0", Ø 6")
  function symDimText(a, unit) {
    const sym = LP.migrateSym(a.sym);
    if (a.dimL == null && a.size != null) return '';
    const mode = a.mode || sym.mode;
    const L = a.dimL != null ? a.dimL : sym.dimL;
    const W = a.dimW != null ? a.dimW : sym.dimW;
    unit = unit || (LP.env && LP.env.unit ? LP.env.unit() : 'ft');
    const paper = mode === 'paper';
    const t = LP.isRound(sym) ? `Ø ${LP.fmtDim(L, unit, paper)}` : `${LP.fmtDim(L, unit, paper)} × ${LP.fmtDim(W, unit, paper)}`;
    return paper ? t + ' (papier)' : t;
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

  Object.assign(LP, { cableGeom, symDimText, TYPE_LABELS, MARKUP_LABELS, NOTE_SIZE, visualBounds, uid, drawAnnotation: draw, hitAnnotation: hit, bboxAnnotation: bbox, describeAnnotation: describe, quantityAnnotation: quantity });
})();
