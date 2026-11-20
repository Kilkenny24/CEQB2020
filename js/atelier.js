/*
 * Atelier de symboles — éditeur de symboles composés pour LumiPlan.
 *
 * Un symbole composé (shape: 'custom') est une liste d'éléments (prims) en
 * coordonnées normalisées (-0,5…0,5 sur la longueur et la largeur). Il se
 * dessine avec LP.drawPrims, exactement comme dans LumiPlan et ses exports PDF.
 * La banque est conservée dans le navigateur (IndexedDB) et s'exporte au
 * format bibliothèque LumiPlan.
 */
(function () {
  'use strict';
  const LP = window.LP;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const IN = 0.0254, FT = 0.3048;

  /* ======================= État ======================= */
  const A = {
    bank: { symbols: [], images: {} },
    cur: null,          // symbole en cours d'édition (référence dans bank.symbols)
    sel: new Set(),     // identifiants (k) des éléments sélectionnés
    tool: 'select',
    unit: 'ft',
    imgEls: {},
    undo: [], redo: [],
  };

  const TOOLS = [
    { id: 'select', key: 'v', label: 'Sélection', icon: '<path d="M5 3l12 8-5 1.5L15 19l-2.5 1-3-6.5L5 17z"/>' },
    'sep',
    { id: 'line', key: 'l', label: 'Ligne', icon: '<path d="M4 20L20 4"/>' },
    { id: 'poly', key: 'p', label: 'Polyligne', icon: '<path d="M3 18l5-9 5 6 8-10"/>' },
    { id: 'polygon', key: 'g', label: 'Polygone', icon: '<path d="M5 19l-2-8 8-7 9 5-3 10z"/>' },
    { id: 'curve', key: 'b', label: 'Courbe', icon: '<path d="M3 18C6 4 12 4 13 12s6 8 8-6"/>' },
    { id: 'rect', key: 'r', label: 'Rectangle', icon: '<rect x="4" y="6" width="16" height="12" rx="1"/>' },
    { id: 'ellipse', key: 'e', label: 'Ellipse', icon: '<ellipse cx="12" cy="12" rx="9" ry="6"/>' },
    { id: 'circle', key: 'c', label: 'Cercle', icon: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1"/>' },
    { id: 'arc', key: 'a', label: 'Arc', icon: '<path d="M4 16a8 8 0 0116 0"/>' },
    { id: 'text', key: 't', label: 'Texte', icon: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>' },
  ];
  const TYPE_NAMES = { line: 'Ligne', poly: 'Polyligne', rect: 'Rectangle', ellipse: 'Ellipse', circle: 'Cercle', arc: 'Arc', path: 'Courbe', text: 'Texte', image: 'Image' };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function toast(m, ms = 3000) { const e = $('#stMsg'); e.textContent = m; clearTimeout(toast.t); toast.t = setTimeout(() => (e.textContent = ''), ms); }

  /* ======================= Banque ======================= */
  async function loadBank() {
    A.unit = (await LP.store.get('unit')) || 'ft';
    const b = await LP.store.get('atelier-bank');
    if (b && b.symbols) A.bank = b;
    loadImgEls();
  }
  let saveT = null;
  function saveBank() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      // Nettoie les images qui ne sont plus utilisées
      const used = new Set(A.bank.symbols.flatMap((s) => LP.symImageIds(s)));
      for (const id of Object.keys(A.bank.images)) if (!used.has(id)) delete A.bank.images[id];
      LP.store.set('atelier-bank', A.bank);
    }, 300);
  }
  function loadImgEls() {
    for (const [id, url] of Object.entries(A.bank.images)) {
      if (A.imgEls[id] && A.imgEls[id].src === url) continue;
      const im = new Image();
      im.onload = () => { draw(); renderBank(); renderPreview(); };
      im.src = url;
      A.imgEls[id] = im;
    }
  }

  function newSymbol() {
    const metric = A.unit !== 'ft';
    return {
      id: 'a-' + uid(), name: 'Nouveau symbole', cat: 'Atelier', tag: 'A', color: '#d00000', fill: 'none', inner: '',
      shape: 'custom', round: false, mode: 'real',
      dimL: metric ? 1.2 : 4 * FT, dimW: metric ? 0.6 : 2 * FT,
      prims: [], builtin: false, atelier: true,
    };
  }

  function selectSymbol(sym) {
    finishDrawing(true);
    A.cur = sym;
    A.sel.clear();
    A.undo = []; A.redo = [];
    $('#emptyHint').style.display = sym ? 'none' : '';
    renderAll();
  }

  function changed(opts = {}) {
    if (!A.cur) return;
    A.cur.modified = new Date().toISOString();
    saveBank();
    draw();
    renderPreview();
    if (!opts.noProps) renderPrimProps();
    renderLayers();
    renderBankSoon();
  }
  function snapshot() { return JSON.stringify(A.cur); }
  function pushUndo(s) { if (!A.cur) return; A.undo.push(s || snapshot()); if (A.undo.length > 200) A.undo.shift(); A.redo = []; }
  function restore(s) {
    const o = JSON.parse(s);
    const i = A.bank.symbols.indexOf(A.cur);
    Object.keys(A.cur).forEach((k) => delete A.cur[k]);
    Object.assign(A.cur, o);
    if (i < 0) return;
    const ks = new Set(A.cur.prims.map((p) => p.k));
    for (const k of [...A.sel]) if (!ks.has(k)) A.sel.delete(k);
    renderSymProps();
    changed();
  }
  function undo() { if (!A.undo.length) return; A.redo.push(snapshot()); restore(A.undo.pop()); }
  function redo() { if (!A.redo.length) return; A.undo.push(snapshot()); restore(A.redo.pop()); }

  /* ======================= Géométrie de l'éditeur ======================= */
  const cv = $('#ed');
  const ctx = cv.getContext('2d');
  let dpr = 1, VW = 0, VH = 0;
  // Boîte du symbole à l'écran
  const box = { cx: 0, cy: 0, bw: 1, bh: 1, k: 1, wPt: 1, hPt: 1 };

  function refScale() {
    const i = +$('#refScale').value;
    const p = LP.SCALE_PRESETS[i];
    return p ? { mpp: p.mpp, unit: A.unit } : null;
  }
  function layout() {
    const r = $('#stage').getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    VW = r.width; VH = r.height;
    cv.width = Math.round(VW * dpr); cv.height = Math.round(VH * dpr);
    if (!A.cur) return;
    const sz = LP.symbolSize(A.cur, null, refScale());
    box.wPt = sz.w; box.hPt = sz.h;
    const m = 70;
    const k = Math.min((VW - 2 * m) / sz.w, (VH - 2 * m) / sz.h);
    box.k = k; box.bw = sz.w * k; box.bh = sz.h * k;
    box.cx = VW / 2; box.cy = VH / 2;
  }
  const toScr = (x, y) => [box.cx + x * box.bw, box.cy + y * box.bh];
  const toNorm = (sx, sy) => [(sx - box.cx) / box.bw, (sy - box.cy) / box.bh];
  function gridCell() { return Math.min(box.bw, box.bh) / +$('#gridSel').value; }
  function snapScr(sx, sy, force) {
    if (!force && !$('#snapChk').checked) return [sx, sy];
    const c = gridCell();
    return [box.cx + Math.round((sx - box.cx) / c) * c, box.cy + Math.round((sy - box.cy) / c) * c];
  }
  const minDim = () => Math.min(box.bw, box.bh);

  /* ======================= Dessin de l'éditeur ======================= */
  function style() { return { color: A.cur.color, fill: null, tag: A.cur.tag, id: A.cur.id, lw: 1 }; }

  let raf = 0;
  function draw() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); }
  function paint() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, VW, VH);
    if (!A.cur) return;
    layout();
    // Fond, grille et boîte
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(box.cx - box.bw / 2, box.cy - box.bh / 2, box.bw, box.bh);
    const c = gridCell();
    ctx.lineWidth = 1;
    const x0 = box.cx - box.bw / 2 - c * 4, x1 = box.cx + box.bw / 2 + c * 4;
    const y0 = box.cy - box.bh / 2 - c * 4, y1 = box.cy + box.bh / 2 + c * 4;
    for (let i = -200; i <= 200; i++) {
      const x = box.cx + i * c, y = box.cy + i * c;
      ctx.strokeStyle = i === 0 ? '#c9cdd4' : '#eef0f3';
      if (x >= x0 && x <= x1) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); }
      if (y >= y0 && y <= y1) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
    }
    ctx.strokeStyle = '#8a929c';
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(box.cx - box.bw / 2, box.cy - box.bh / 2, box.bw, box.bh);
    ctx.setLineDash([]);
    // Cotes
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px system-ui, sans-serif';
    const paper = A.cur.mode !== 'real';
    const L = LP.fmtDim(A.cur.dimL, A.unit, paper), W = LP.fmtDim(A.cur.round ? A.cur.dimL : A.cur.dimW, A.unit, paper);
    ctx.textAlign = 'center';
    ctx.fillText(`${A.cur.round ? 'Ø ' : ''}${L}${paper ? ' (papier)' : ''}`, box.cx, box.cy - box.bh / 2 - 10);
    ctx.save(); ctx.translate(box.cx - box.bw / 2 - 12, box.cy); ctx.rotate(-Math.PI / 2); ctx.fillText(W, 0, 0); ctx.restore();
    ctx.textAlign = 'start';

    // Symbole, dessiné par le moteur de LumiPlan
    ctx.save();
    ctx.translate(box.cx, box.cy);
    ctx.scale(box.k, box.k);
    const R = new LP.CanvasRenderer(ctx, A.imgEls);
    LP.drawPrims(R, A.cur.prims, style(), box.wPt, box.hPt);
    if (drawing) LP.drawPrims(R, [drawing], style(), box.wPt, box.hPt);
    ctx.restore();

    // Sélection et poignées
    for (const p of A.cur.prims) {
      if (!A.sel.has(p.k)) continue;
      const b = primBoxScr(p);
      ctx.strokeStyle = '#1f6feb'; ctx.setLineDash([4, 3]);
      ctx.strokeRect(b[0] - 3, b[1] - 3, b[2] - b[0] + 6, b[3] - b[1] + 6);
      ctx.setLineDash([]);
    }
    const one = selectedOne();
    if (one) {
      const hs = handles(one);
      if (one.t === 'path') {
        // Lignes de contrôle des courbes
        ctx.strokeStyle = '#9db8ef';
        let last = null;
        for (const g of one.segs) {
          if (g[0] === 'C') {
            const p1 = toScr(g[1], g[2]), p2 = toScr(g[3], g[4]), e = toScr(g[5], g[6]);
            if (last) { ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...p1); ctx.stroke(); }
            ctx.beginPath(); ctx.moveTo(...p2); ctx.lineTo(...e); ctx.stroke();
            last = e;
          } else if (g[0] !== 'Z') last = toScr(g[1], g[2]);
        }
      }
      for (const h of hs) {
        const r = h.ctrl ? 3.5 : 4.5;
        ctx.fillStyle = h.ctrl ? '#e5efff' : '#fff'; ctx.strokeStyle = '#1f6feb';
        ctx.beginPath();
        if (h.round || h.ctrl) ctx.arc(h.x, h.y, r, 0, Math.PI * 2); else ctx.rect(h.x - r, h.y - r, 2 * r, 2 * r);
        ctx.fill(); ctx.stroke();
      }
    }
    if (drag && drag.kind === 'box') {
      const [a, b] = [drag.start, drag.cur];
      ctx.fillStyle = 'rgba(31,111,235,.08)'; ctx.strokeStyle = '#1f6feb';
      ctx.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      ctx.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    }
    // Ligne élastique pour les outils à clics multiples
    if (drawing && hover && (A.tool === 'poly' || A.tool === 'polygon' || A.tool === 'curve')) {
      const pts = drawing._pts || drawing.pts;
      const last = toScr(...pts[pts.length - 1]);
      ctx.strokeStyle = '#1f6feb'; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...hover); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /* ======================= Éléments : géométrie ======================= */
  // Applique fn(point) à tous les points d'un élément (en coordonnées normalisées)
  function eachPoint(p, fn) {
    if (p.pts) p.pts.forEach((q, i) => { p.pts[i] = fn(q); });
    if (p.c) p.c = fn(p.c);
    if (p.p) p.p = fn(p.p);
    if (p.segs) for (const g of p.segs) for (let i = 1; i + 1 < g.length; i += 2) { const r = fn([g[i], g[i + 1]]); g[i] = r[0]; g[i + 1] = r[1]; }
  }
  // Boîte englobante à l'écran : [x0, y0, x1, y1]
  function primBoxScr(p) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (sx, sy) => { x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy); };
    if (p.t === 'circle' || p.t === 'arc') {
      const [cx, cy] = toScr(...p.c), r = p.r * minDim();
      add(cx - r, cy - r); add(cx + r, cy + r);
    } else if (p.t === 'text') {
      const size = (p.size || 0.4) * minDim();
      ctx.font = `${p.bold ? 'bold ' : ''}${size}px Helvetica, Arial, sans-serif`;
      const str = String(p.text || '').replace(/\{tag\}/g, A.cur.tag || '') || ' ';
      const tw = ctx.measureText(str).width;
      const [sx, sy] = toScr(...p.p);
      const xl = sx - (p.align === 'left' ? 0 : p.align === 'right' ? tw : tw / 2);
      add(xl, sy - size * 0.8); add(xl + tw, sy + size * 0.2);
    } else {
      const tmp = clone(p);
      eachPoint(tmp, (q) => { add(...toScr(q[0], q[1])); return q; });
    }
    return [x0, y0, x1, y1];
  }
  function distSeg(px, py, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    let t = L2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
  }
  function inPoly(x, y, pts) {
    let ins = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
  }
  // Points d'un chemin aplati (pour la sélection)
  function flatPath(p) {
    const out = [];
    let cur = null, start = null;
    for (const g of p.segs) {
      if (g[0] === 'M') { cur = toScr(g[1], g[2]); start = cur; out.push([cur]); }
      else if (g[0] === 'L') { cur = toScr(g[1], g[2]); out[out.length - 1].push(cur); }
      else if (g[0] === 'C') {
        const p1 = toScr(g[1], g[2]), p2 = toScr(g[3], g[4]), e = toScr(g[5], g[6]);
        for (let i = 1; i <= 10; i++) {
          const t = i / 10, u = 1 - t;
          out[out.length - 1].push([u * u * u * cur[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * e[0], u * u * u * cur[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * e[1]]);
        }
        cur = e;
      } else if (g[0] === 'Z' && start) { out[out.length - 1].push(start); cur = start; }
    }
    return out;
  }
  function hitPrim(p, sx, sy) {
    const tol = 6;
    const filled = p.fill && p.fill !== 'none';
    switch (p.t) {
      case 'line': return distSeg(sx, sy, toScr(...p.pts[0]), toScr(...p.pts[1])) <= tol;
      case 'poly': {
        const s = p.pts.map((q) => toScr(...q));
        for (let i = 1; i < s.length; i++) if (distSeg(sx, sy, s[i - 1], s[i]) <= tol) return true;
        if (p.closed && distSeg(sx, sy, s[s.length - 1], s[0]) <= tol) return true;
        return p.closed && filled && inPoly(sx, sy, s);
      }
      case 'path': {
        for (const sub of flatPath(p)) {
          for (let i = 1; i < sub.length; i++) if (distSeg(sx, sy, sub[i - 1], sub[i]) <= tol) return true;
          if (filled && inPoly(sx, sy, sub)) return true;
        }
        return false;
      }
      case 'circle': case 'arc': {
        const [cx, cy] = toScr(...p.c), r = p.r * minDim(), d = Math.hypot(sx - cx, sy - cy);
        return Math.abs(d - r) <= tol || (filled && d <= r);
      }
      case 'ellipse': {
        const b = primBoxScr(p), rx = (b[2] - b[0]) / 2 || 1, ry = (b[3] - b[1]) / 2 || 1;
        const v = Math.hypot((sx - (b[0] + rx)) / rx, (sy - (b[1] + ry)) / ry);
        return filled ? v <= 1.05 : Math.abs(v - 1) * Math.min(rx, ry) <= tol;
      }
      case 'rect': {
        const b = primBoxScr(p);
        const inside = sx >= b[0] - tol && sx <= b[2] + tol && sy >= b[1] - tol && sy <= b[3] + tol;
        if (!inside) return false;
        return filled || sx <= b[0] + tol || sx >= b[2] - tol || sy <= b[1] + tol || sy >= b[3] - tol;
      }
      default: {
        const b = primBoxScr(p);
        return sx >= b[0] - tol && sx <= b[2] + tol && sy >= b[1] - tol && sy <= b[3] + tol;
      }
    }
  }
  function topHit(sx, sy) {
    const ps = A.cur.prims;
    for (let i = ps.length - 1; i >= 0; i--) if (!ps[i].hidden && hitPrim(ps[i], sx, sy)) return ps[i];
    return null;
  }
  function selectedOne() {
    if (A.sel.size !== 1) return null;
    return A.cur.prims.find((p) => A.sel.has(p.k)) || null;
  }
  // Poignées : {x, y, set(nx, ny, shift)}
  function handles(p) {
    const H = [];
    const ptH = (arr, i) => { const [x, y] = toScr(...arr[i]); H.push({ x, y, set: (n) => { arr[i] = n; } }); };
    switch (p.t) {
      case 'line': case 'poly': case 'rect': case 'ellipse': p.pts.forEach((q, i) => ptH(p.pts, i)); break;
      case 'image': p.pts.forEach((q, i) => {
        const [x, y] = toScr(...q);
        H.push({ x, y, set: (n, shift) => {
          const o = p.pts[1 - i];
          if (shift || p.keepAspect !== false) {
            // Conserve les proportions de l'image (en points)
            const im = A.imgEls[p.img];
            const ar = im && im.naturalWidth ? im.naturalWidth / im.naturalHeight : 1;
            const dxPt = (n[0] - o[0]) * box.wPt, dyPt = (n[1] - o[1]) * box.hPt;
            const wPt = Math.max(Math.abs(dxPt), Math.abs(dyPt) * ar);
            n = [o[0] + (Math.sign(dxPt || 1) * wPt) / box.wPt, o[1] + (Math.sign(dyPt || 1) * wPt / ar) / box.hPt];
          }
          p.pts[i] = n;
        } });
      }); break;
      case 'text': { const [x, y] = toScr(...p.p); H.push({ x, y, set: (n) => { p.p = n; } }); break; }
      case 'circle': case 'arc': {
        const [cx, cy] = toScr(...p.c), r = p.r * minDim();
        H.push({ x: cx, y: cy, round: true, set: (n) => { p.c = n; } });
        if (p.t === 'circle') H.push({ x: cx + r, y: cy, set: (n) => { const [sx, sy] = toScr(...n); p.r = Math.max(0.005, Math.hypot(sx - cx, sy - cy) / minDim()); } });
        else {
          for (const key of ['a0', 'a1']) {
            const a = (p[key] * Math.PI) / 180;
            H.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), set: (n, shift, raw) => {
              const [sx, sy] = raw;
              let ang = (Math.atan2(sy - cy, sx - cx) * 180) / Math.PI;
              ang = Math.round(ang / (shift ? 1 : 15)) * (shift ? 1 : 15);
              p[key] = (ang + 360) % 360;
              p.r = Math.max(0.005, Math.hypot(sx - cx, sy - cy) / minDim());
            } });
          }
        }
        break;
      }
      case 'path':
        p.segs.forEach((g) => {
          for (let i = 1; i + 1 < g.length; i += 2) {
            const [x, y] = toScr(g[i], g[i + 1]);
            const anchor = g[0] !== 'C' || i === 5;
            H.push({ x, y, ctrl: !anchor, set: (n) => {
              if (anchor && g[0] === 'C') { // déplace aussi le point de contrôle voisin
                const dx = n[0] - g[5], dy = n[1] - g[6];
                g[3] += dx; g[4] += dy;
              }
              g[i] = n[0]; g[i + 1] = n[1];
            } });
          }
        });
        break;
    }
    return H;
  }

  /* ======================= Interaction ======================= */
  let drag = null, drawing = null, hover = null;
  const evPos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  // Épaisseur par défaut proportionnée au symbole (un trait de 1 pt écraserait un petit luminaire à l'échelle)
  function defaultWidth() {
    const m = Math.min(box.wPt, box.hPt);
    return Math.max(0.15, Math.min(1, Math.round((m / 30) * 20) / 20));
  }
  function newPrim(t, extra) {
    const base = { k: uid(), t, stroke: 'sym', fill: 'none', width: defaultWidth(), dash: 'solid' };
    if (t === 'text') { base.stroke = 'sym'; }
    return Object.assign(base, extra);
  }
  // Contrainte Maj : angle par pas de 15° (lignes) ou carré (rectangles, ellipses) — en points réels
  function constrain(a, b, square) {
    const dx = (b[0] - a[0]) * box.wPt, dy = (b[1] - a[1]) * box.hPt;
    if (square) {
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      return [a[0] + (Math.sign(dx || 1) * m) / box.wPt, a[1] + (Math.sign(dy || 1) * m) / box.hPt];
    }
    const L = Math.hypot(dx, dy), ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
    return [a[0] + (L * Math.cos(ang)) / box.wPt, a[1] + (L * Math.sin(ang)) / box.hPt];
  }

  cv.addEventListener('pointerdown', (e) => {
    if (!A.cur || e.button !== 0) { if (e.button === 2) finishDrawing(); return; }
    cv.setPointerCapture(e.pointerId);
    const raw = evPos(e);
    const sp = snapScr(...raw);
    const n = toNorm(...sp);
    const t = A.tool;
    if (t === 'select') {
      const one = selectedOne();
      if (one) {
        const h = handles(one).find((q) => Math.hypot(q.x - raw[0], q.y - raw[1]) <= 7);
        if (h) { drag = { kind: 'handle', h, snap: snapshot(), moved: false }; return; }
      }
      const p = topHit(...raw);
      if (p) {
        if (e.shiftKey) { if (A.sel.has(p.k)) A.sel.delete(p.k); else A.sel.add(p.k); }
        else if (!A.sel.has(p.k)) { A.sel.clear(); A.sel.add(p.k); }
        drag = { kind: 'move', last: n, snap: snapshot(), moved: false, alt: e.altKey };
      } else {
        if (!e.shiftKey) A.sel.clear();
        drag = { kind: 'box', start: raw, cur: raw };
      }
      renderPrimProps(); renderLayers(); draw();
      return;
    }
    if (t === 'text') {
      const txt = prompt('Texte (« {tag} » = étiquette du luminaire, ex. A, B1) :', '{tag}');
      if (txt == null || txt === '') return;
      pushUndo();
      const p = newPrim('text', { p: n, text: txt, size: 0.35, bold: true, align: 'center', width: 1 });
      A.cur.prims.push(p);
      A.sel = new Set([p.k]);
      setTool('select');
      changed();
      return;
    }
    if (t === 'poly' || t === 'polygon' || t === 'curve') {
      if (!drawing) {
        drawing = t === 'curve' ? newPrim('path', { segs: [], _pts: [n] }) : newPrim('poly', { pts: [n], closed: t === 'polygon' });
        if (t === 'curve') drawing.segs = curveSegs(drawing._pts, false);
      } else {
        const pts = drawing._pts || drawing.pts;
        let q = n;
        if (e.shiftKey) q = constrain(pts[pts.length - 1], n);
        const last = toScr(...pts[pts.length - 1]);
        if (Math.hypot(last[0] - sp[0], last[1] - sp[1]) > 2) pts.push(q);
        if (drawing._pts) drawing.segs = curveSegs(drawing._pts, false);
      }
      draw();
      return;
    }
    // Outils par glisser
    const map = { line: 'line', rect: 'rect', ellipse: 'ellipse' };
    if (map[t]) drawing = newPrim(map[t], { pts: [n, n] });
    else if (t === 'circle') drawing = newPrim('circle', { c: n, r: 0.001 });
    else if (t === 'arc') drawing = newPrim('arc', { c: n, r: 0.001, a0: 180, a1: 0 });
    drag = { kind: 'draw', start: n };
    draw();
  });

  cv.addEventListener('pointermove', (e) => {
    if (!A.cur) return;
    const raw = evPos(e);
    const sp = snapScr(...raw);
    const n = toNorm(...sp);
    hover = sp;
    const L = (v) => LP.fmtDim(Math.abs(v), A.unit, A.cur.mode !== 'real');
    const realL = A.cur.dimL, realW = A.cur.round ? A.cur.dimL : A.cur.dimW;
    $('#stPos').textContent = `x ${L(n[0] * realL)}  y ${L(n[1] * realW)}`;
    if (!drag) {
      if (drawing) draw();
      cv.style.cursor = A.tool === 'select' ? (topHit(...raw) ? 'move' : 'default') : 'crosshair';
      return;
    }
    if (drag.kind === 'box') { drag.cur = raw; draw(); return; }
    if (drag.kind === 'move') {
      const dx = n[0] - drag.last[0], dy = n[1] - drag.last[1];
      if (!dx && !dy) return;
      if (!drag.moved && drag.alt) {
        const copies = A.cur.prims.filter((p) => A.sel.has(p.k)).map((p) => Object.assign(clone(p), { k: uid() }));
        A.cur.prims.push(...copies);
        A.sel = new Set(copies.map((c) => c.k));
      }
      drag.moved = true;
      for (const p of A.cur.prims) if (A.sel.has(p.k)) eachPoint(p, (q) => [q[0] + dx, q[1] + dy]);
      drag.last = n;
      draw();
      return;
    }
    if (drag.kind === 'handle') {
      drag.moved = true;
      drag.h.set(n, e.shiftKey, raw);
      draw();
      return;
    }
    if (drag.kind === 'draw' && drawing) {
      const a = drag.start;
      if (drawing.t === 'line') drawing.pts[1] = e.shiftKey ? constrain(a, n) : n;
      else if (drawing.t === 'rect' || drawing.t === 'ellipse') drawing.pts[1] = e.shiftKey ? constrain(a, n, true) : n;
      else if (drawing.t === 'circle' || drawing.t === 'arc') {
        const [cx, cy] = toScr(...a);
        drawing.r = Math.max(0.001, Math.hypot(sp[0] - cx, sp[1] - cy) / minDim());
        if (drawing.t === 'arc') {
          const ang = Math.round(((Math.atan2(sp[1] - cy, sp[0] - cx) * 180) / Math.PI) / 15) * 15;
          drawing.a0 = (ang + 360) % 360; drawing.a1 = (ang + 180) % 360;
        }
      }
      draw();
    }
  });

  cv.addEventListener('pointerup', () => {
    const d = drag; drag = null;
    if (!d) return;
    if (d.kind === 'box') {
      const [a, b] = [d.start, d.cur];
      if (Math.abs(b[0] - a[0]) > 3 || Math.abs(b[1] - a[1]) > 3) {
        const bx = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
        for (const p of A.cur.prims) {
          const q = primBoxScr(p);
          if (q[0] >= bx[0] && q[1] >= bx[1] && q[2] <= bx[2] && q[3] <= bx[3]) A.sel.add(p.k);
        }
      }
      renderPrimProps(); renderLayers(); draw();
      return;
    }
    if ((d.kind === 'move' || d.kind === 'handle') && d.moved) { pushUndo(d.snap); changed(); return; }
    if (d.kind === 'draw' && drawing) {
      const p = drawing; drawing = null;
      const b = primBoxScr(p);
      if (b[2] - b[0] < 3 && b[3] - b[1] < 3) { draw(); return; }
      pushUndo();
      A.cur.prims.push(p);
      A.sel = new Set([p.k]);
      changed();
    }
  });
  cv.addEventListener('dblclick', () => { if (drawing && (A.tool === 'poly' || A.tool === 'polygon' || A.tool === 'curve')) finishDrawing(); });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerleave', () => { hover = null; draw(); });

  // Courbe lisse passant par les points (Catmull-Rom → Bézier)
  function curveSegs(pts, closed) {
    if (!pts.length) return [];
    const segs = [['M', pts[0][0], pts[0][1]]];
    const n = pts.length;
    const P = (i) => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      segs.push(['C', p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]]);
    }
    if (closed) segs.push(['Z']);
    return segs;
  }

  function finishDrawing(cancel) {
    if (!drawing) return;
    const p = drawing; drawing = null;
    if (!cancel) {
      // Le double-clic ajoute un point en double : on le retire
      const pts = p._pts || p.pts;
      if (pts.length > 2) {
        const a = pts[pts.length - 1], b = pts[pts.length - 2];
        if (Math.hypot((a[0] - b[0]) * box.bw, (a[1] - b[1]) * box.bh) < 3) pts.pop();
      }
      const min = p.t === 'poly' && p.closed ? 3 : 2;
      if (pts.length >= min) {
        if (p._pts) { p.segs = curveSegs(p._pts, false); delete p._pts; }
        pushUndo();
        A.cur.prims.push(p);
        A.sel = new Set([p.k]);
        changed();
        return;
      }
    }
    draw();
  }

  /* ======================= Opérations sur la sélection ======================= */
  function selected() { return A.cur ? A.cur.prims.filter((p) => A.sel.has(p.k)) : []; }
  function selCenter(list) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of list) { const b = primBoxScr(p); x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
    return toNorm((x0 + x1) / 2, (y0 + y1) / 2);
  }
  function op(name) {
    const list = selected();
    if (!list.length) return;
    pushUndo();
    const [cx, cy] = selCenter(list);
    for (const p of list) {
      if (name === 'mirrorH') {
        eachPoint(p, (q) => [2 * cx - q[0], q[1]]);
        if (p.t === 'arc') { const a0 = p.a0; p.a0 = (540 - p.a1) % 360; p.a1 = (540 - a0) % 360; }
      } else if (name === 'mirrorV') {
        eachPoint(p, (q) => [q[0], 2 * cy - q[1]]);
        if (p.t === 'arc') { const a0 = p.a0; p.a0 = (360 - p.a1) % 360; p.a1 = (360 - a0) % 360; }
      } else if (name === 'rot90') {
        // Rotation dans l'espace réel (points), pas dans l'espace normalisé
        eachPoint(p, (q) => {
          const dx = (q[0] - cx) * box.wPt, dy = (q[1] - cy) * box.hPt;
          return [cx + -dy / box.wPt, cy + dx / box.hPt];
        });
        if (p.t === 'arc') { p.a0 = (p.a0 + 90) % 360; p.a1 = (p.a1 + 90) % 360; }
      } else if (name === 'dup') {
        // géré plus bas
      }
    }
    if (name === 'dup') {
      const c = Math.min(gridCell() / box.bw, 0.05);
      const copies = list.map((p) => { const q = clone(p); q.k = uid(); eachPoint(q, (v) => [v[0] + c, v[1] + c]); return q; });
      A.cur.prims.push(...copies);
      A.sel = new Set(copies.map((q) => q.k));
    }
    if (name === 'del') { A.cur.prims = A.cur.prims.filter((p) => !A.sel.has(p.k)); A.sel.clear(); }
    if (name === 'front' || name === 'back') {
      const rest = A.cur.prims.filter((p) => !A.sel.has(p.k));
      A.cur.prims = name === 'front' ? rest.concat(list) : list.concat(rest);
    }
    changed();
  }

  /* ======================= Clavier ======================= */
  window.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || $('dialog[open]')) return;
    const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
    if (ctrl && k === 'd') { e.preventDefault(); op('dup'); return; }
    if (ctrl && k === 'a' && A.cur) { e.preventDefault(); A.sel = new Set(A.cur.prims.map((p) => p.k)); renderPrimProps(); renderLayers(); draw(); return; }
    if (ctrl && k === 'n') { e.preventDefault(); $('#btnNew').click(); return; }
    if (ctrl) return;
    if (e.key === 'Escape') { if (drawing) finishDrawing(true); else if (A.tool !== 'select') setTool('select'); else { A.sel.clear(); renderPrimProps(); renderLayers(); draw(); } return; }
    if (e.key === 'Enter' && drawing) { finishDrawing(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && A.sel.size) { e.preventDefault(); op('del'); return; }
    if (e.key.startsWith('Arrow') && A.sel.size) {
      e.preventDefault();
      const st = gridCell() * (e.shiftKey ? 4 : 1) / (e.altKey ? 4 : 1);
      const dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0;
      const dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
      pushUndo();
      for (const p of selected()) eachPoint(p, (q) => [q[0] + dx / box.bw, q[1] + dy / box.bh]);
      changed();
      return;
    }
    const t = TOOLS.find((x) => x !== 'sep' && x.key === k);
    if (t) setTool(t.id);
  });

  /* ======================= Outils ======================= */
  function buildTools() {
    const nav = $('#tools');
    nav.innerHTML = '';
    for (const t of TOOLS) {
      if (t === 'sep') { const s = document.createElement('span'); s.className = 'sep'; nav.appendChild(s); continue; }
      const b = document.createElement('button');
      b.dataset.tool = t.id;
      b.title = `${t.label} (${t.key.toUpperCase()})`;
      b.innerHTML = `<svg viewBox="0 0 24 24">${t.icon}</svg><span class="lbl">${t.label}</span>`;
      b.onclick = () => setTool(t.id);
      nav.appendChild(b);
    }
  }
  const HINTS = {
    select: 'Cliquer pour sélectionner (Maj = ajouter), glisser pour déplacer, Alt+glisser = dupliquer, flèches = déplacer',
    line: 'Glisser pour tracer (Maj = angles de 15°)', rect: 'Glisser (Maj = carré)', ellipse: 'Glisser (Maj = cercle étirable)',
    circle: 'Glisser du centre vers le bord — un cercle reste rond quelles que soient les dimensions du symbole',
    arc: 'Glisser du centre vers le bord, puis ajuster les extrémités avec les poignées',
    poly: 'Cliquer les points ; double-clic ou Entrée pour terminer', polygon: 'Cliquer les sommets ; double-clic ou Entrée pour fermer',
    curve: 'Cliquer les points de passage ; double-clic ou Entrée pour terminer', text: 'Cliquer pour placer un texte ({tag} = étiquette)',
  };
  function setTool(id) {
    finishDrawing();
    A.tool = id;
    $$('#tools button').forEach((b) => b.classList.toggle('active', b.dataset.tool === id));
    $('#stTool').textContent = HINTS[id] || '';
    draw();
  }

  /* ======================= Panneaux ======================= */
  function renderAll() { renderBank(); renderSymProps(); renderPrimProps(); renderLayers(); renderPreview(); draw(); }

  let bankT = null;
  function renderBankSoon() { clearTimeout(bankT); bankT = setTimeout(renderBank, 250); }
  function thumb(sym, w, h) {
    const c = document.createElement('canvas');
    c.width = w * 2; c.height = h * 2;
    const g = c.getContext('2d'); g.scale(2, 2);
    const d = LP.migrateSym(sym);
    const L = d.dimL || 1, W = LP.isRound(d) ? L : d.dimW || L;
    const k = Math.min((w - 6) / L, (h - 6) / W);
    LP.drawSymbol(new LP.CanvasRenderer(g, A.imgEls), sym, { x: w / 2, y: h / 2, w: L * k, h: Math.max(W * k, 1.5), showTag: false, lineWidth: 1, primLineScale: Math.max(0.5, Math.min(L * k, W * k) / 30) });
    return c;
  }
  function renderBank() {
    const list = $('#bankList');
    const f = ($('#bankFilter').value || '').toLowerCase();
    list.innerHTML = '';
    $('#bankCount').textContent = A.bank.symbols.length;
    const cats = {};
    for (const s of A.bank.symbols) {
      if (f && !`${s.name} ${s.cat} ${s.tag}`.toLowerCase().includes(f)) continue;
      (cats[s.cat || 'Divers'] = cats[s.cat || 'Divers'] || []).push(s);
    }
    if (!A.bank.symbols.length) list.innerHTML = '<p class="hint" style="padding:6px">Banque vide. Créez un symbole, importez un fichier ou reprenez des symboles de LumiPlan.</p>';
    for (const [cat, syms] of Object.entries(cats)) {
      const h = document.createElement('div'); h.className = 'bank-cat';
      h.innerHTML = `<span>${esc(cat)}</span><span class="cc">${syms.length}</span>`;
      list.appendChild(h);
      for (const s of syms) {
        const it = document.createElement('div');
        it.className = 'bank-item' + (s === A.cur ? ' active' : '');
        it.appendChild(thumb(s, 44, 34));
        const d = LP.migrateSym(s), paper = d.mode !== 'real';
        const dims = LP.isRound(d) ? `Ø ${LP.fmtDim(d.dimL, A.unit, paper)}` : `${LP.fmtDim(d.dimL, A.unit, paper)} × ${LP.fmtDim(d.dimW, A.unit, paper)}`;
        const nm = document.createElement('div');
        nm.innerHTML = `${esc(s.name)}${s.tag ? ` <small>[${esc(s.tag)}]</small>` : ''}<br><small>${esc(dims)}${paper ? ' papier' : ''}</small>`;
        it.appendChild(nm);
        it.onclick = () => selectSymbol(s);
        list.appendChild(it);
      }
    }
  }

  function renderSymProps() {
    const box2 = $('#symProps');
    const s = A.cur;
    if (!s) { box2.innerHTML = '<p class="hint">Aucun symbole.</p>'; return; }
    const paper = s.mode !== 'real';
    const cats = [...new Set(A.bank.symbols.map((x) => x.cat).filter(Boolean))];
    box2.innerHTML = `
      <label>Nom <input type="text" data-s="name" value="${esc(s.name)}"></label>
      <label>Catégorie <input type="text" data-s="cat" list="catsList" value="${esc(s.cat || '')}"></label>
      <datalist id="catsList">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
      <label>Étiquette <input type="text" data-s="tag" value="${esc(s.tag || '')}" placeholder="ex. A, B1"></label>
      <label>Couleur <input type="color" data-s="color" value="${s.color}"></label>
      <label>Dimension <select data-s="mode">
        <option value="real" ${!paper ? 'selected' : ''}>À l'échelle réelle</option>
        <option value="paper" ${paper ? 'selected' : ''}>Taille sur papier</option></select></label>
      <label class="inline"><input type="checkbox" data-s="round" ${s.round ? 'checked' : ''}> Une seule dimension (diamètre)</label>
      <label>${s.round ? 'Diamètre' : 'Longueur'} <input type="text" data-s="dimL" value="${esc(LP.fmtDim(s.dimL, A.unit, paper))}"></label>
      ${s.round ? '' : `<label>Largeur <input type="text" data-s="dimW" value="${esc(LP.fmtDim(s.dimW, A.unit, paper))}"></label>`}
      <label>Unités <select id="unitSel"><option value="ft" ${A.unit === 'ft' ? 'selected' : ''}>pi-po</option><option value="mm" ${A.unit === 'mm' ? 'selected' : ''}>mm</option><option value="m" ${A.unit === 'm' ? 'selected' : ''}>m</option></select></label>`;
    box2.querySelectorAll('[data-s]').forEach((el) => {
      el.addEventListener('change', () => {
        const key = el.dataset.s;
        const snap = snapshot();
        if (key === 'dimL' || key === 'dimW') {
          const m = LP.parseDim(el.value, A.unit, s.mode !== 'real');
          if (!(m > 0)) { alert(`Dimension non reconnue : « ${el.value} »\nExemples : 4'  48"  2'-6 1/2"  1/4"  1200 mm`); renderSymProps(); return; }
          s[key] = m;
          if (s.round) s.dimW = s.dimL;
        } else if (key === 'round') { s.round = el.checked; if (s.round) s.dimW = s.dimL; }
        else s[key] = el.value;
        pushUndo(snap);
        renderSymProps();
        changed();
      });
    });
    $('#unitSel').onchange = (e) => { A.unit = e.target.value; LP.store.set('unit', A.unit); renderSymProps(); renderBank(); draw(); };
  }

  // Sélecteur de couleur : Symbole / Aucune / Blanc / Personnalisée
  function colorCtl(label, key, v, allowNone) {
    const mode = !v || v === 'none' ? 'none' : v === 'sym' ? 'sym' : 'custom';
    return `<label>${label} <span class="crow"><select data-cm="${key}">
      <option value="sym" ${mode === 'sym' ? 'selected' : ''}>Couleur du symbole</option>
      ${allowNone ? `<option value="none" ${mode === 'none' ? 'selected' : ''}>Aucun</option>` : ''}
      <option value="custom" ${mode === 'custom' ? 'selected' : ''}>Couleur fixe</option></select>
      <input type="color" data-cc="${key}" value="${mode === 'custom' ? v : '#ffffff'}" ${mode === 'custom' ? '' : 'disabled'}></span></label>`;
  }
  function renderPrimProps() {
    const el = $('#primProps');
    const list = selected();
    if (!A.cur || !list.length) {
      el.innerHTML = `<p class="hint">Sélectionnez un élément, ou dessinez avec les outils du haut.<br>
        <b>Astuce :</b> « Couleur du symbole » permet de recolorer le symbole dans LumiPlan ; un texte <code>{tag}</code> affiche le type du luminaire.</p>`;
      return;
    }
    const p = list[0];
    const types = new Set(list.map((q) => q.t));
    const one = list.length === 1;
    let h = `<p class="hint">${one ? TYPE_NAMES[p.t] : list.length + ' éléments'}</p>`;
    if (!types.has('image')) {
      h += colorCtl(types.has('text') && types.size === 1 ? 'Couleur' : 'Trait', 'stroke', p.stroke, !types.has('text'));
      if ([...types].some((t) => ['rect', 'ellipse', 'circle', 'poly', 'path', 'arc'].includes(t))) h += colorCtl('Remplissage', 'fill', p.fill, true);
      if (!(types.size === 1 && types.has('text'))) {
        h += `<label>Épaisseur (pt) <input type="number" data-p="width" min="0.05" max="20" step="0.05" value="${p.width != null ? p.width : 1}"></label>
          <label>Style <select data-p="dash"><option value="solid" ${p.dash === 'solid' || !p.dash ? 'selected' : ''}>Plein</option><option value="dash" ${p.dash === 'dash' ? 'selected' : ''}>Tirets</option><option value="dot" ${p.dash === 'dot' ? 'selected' : ''}>Pointillé</option></select></label>`;
      }
    }
    h += `<label>Opacité <input type="number" data-p="opacity" min="0.05" max="1" step="0.05" value="${p.opacity != null ? p.opacity : 1}"></label>`;
    if (one && p.t === 'poly') h += `<label class="inline"><input type="checkbox" data-p="closed" ${p.closed ? 'checked' : ''}> Fermé</label>`;
    if (one && p.t === 'path') h += `<label class="inline"><input type="checkbox" data-p="closedPath" ${p.segs.some((g) => g[0] === 'Z') ? 'checked' : ''}> Fermé</label>`;
    if (one && p.t === 'arc') h += `<label>Début (°) <input type="number" data-p="a0" step="15" value="${Math.round(p.a0)}"></label>
      <label>Fin (°) <input type="number" data-p="a1" step="15" value="${Math.round(p.a1)}"></label>
      <label class="inline"><input type="checkbox" data-p="pie" ${p.pie ? 'checked' : ''}> Secteur (fermé au centre)</label>`;
    if (one && (p.t === 'circle' || p.t === 'arc')) h += `<label>Rayon (%) <input type="number" data-p="rPct" step="1" min="1" value="${Math.round(p.r * 100)}"></label>`;
    if (one && p.t === 'text') h += `<label>Texte <input type="text" data-p="text" value="${esc(p.text)}"></label>
      <label>Taille (%) <input type="number" data-p="sizePct" min="3" max="300" step="1" value="${Math.round((p.size || 0.4) * 100)}"></label>
      <label class="inline"><input type="checkbox" data-p="bold" ${p.bold ? 'checked' : ''}> Gras</label>
      <label>Alignement <select data-p="align"><option value="center" ${p.align !== 'left' && p.align !== 'right' ? 'selected' : ''}>Centré</option><option value="left" ${p.align === 'left' ? 'selected' : ''}>Gauche</option><option value="right" ${p.align === 'right' ? 'selected' : ''}>Droite</option></select></label>`;
    if (one && p.t === 'image') h += `<label class="inline"><input type="checkbox" data-p="keepAspect" ${p.keepAspect !== false ? 'checked' : ''}> Garder les proportions</label>
      <div class="btns"><button data-op="fitimg">Ajuster à la boîte</button></div>`;
    h += `<div class="btns">
      <button data-op="front" title="Premier plan">⬆ Avant</button><button data-op="back" title="Arrière-plan">⬇ Arrière</button>
      <button data-op="mirrorH" title="Miroir horizontal">⇋ Miroir H</button><button data-op="mirrorV" title="Miroir vertical">⇵ Miroir V</button>
      <button data-op="rot90" title="Rotation de 90°">⟳ 90°</button><button data-op="dup" title="Dupliquer (Ctrl+D)">⧉</button><button data-op="del" title="Supprimer (Suppr)">✕</button></div>`;
    el.innerHTML = h;

    const apply = (fn) => { const snap = snapshot(); for (const q of list) fn(q); pushUndo(snap); changed({ noProps: true }); };
    el.querySelectorAll('[data-cm]').forEach((s) => s.addEventListener('change', () => {
      const key = s.dataset.cm, cc = el.querySelector(`[data-cc=${key}]`);
      cc.disabled = s.value !== 'custom';
      apply((q) => { q[key] = s.value === 'custom' ? cc.value : s.value; });
    }));
    el.querySelectorAll('[data-cc]').forEach((c) => c.addEventListener('input', () => apply((q) => { q[c.dataset.cc] = c.value; })));
    el.querySelectorAll('[data-p]').forEach((inp) => inp.addEventListener('change', () => {
      const key = inp.dataset.p;
      const v = inp.type === 'checkbox' ? inp.checked : inp.type === 'number' ? parseFloat(inp.value) : inp.value;
      if (inp.type === 'number' && !isFinite(v)) return;
      apply((q) => {
        if (key === 'rPct') q.r = Math.max(0.005, v / 100);
        else if (key === 'sizePct') q.size = Math.max(0.03, v / 100);
        else if (key === 'closedPath') { q.segs = q.segs.filter((g) => g[0] !== 'Z'); if (v) q.segs.push(['Z']); }
        else q[key] = v;
      });
    }));
    el.querySelectorAll('[data-op]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.op === 'fitimg') return fitImage(p, true);
      op(b.dataset.op);
    }));
  }

  function renderLayers() {
    const el = $('#layers');
    if (!A.cur || !A.cur.prims.length) { el.innerHTML = '<p class="hint">Aucun élément.</p>'; return; }
    el.innerHTML = '';
    [...A.cur.prims].reverse().forEach((p) => {
      const d = document.createElement('div');
      d.className = 'ly' + (A.sel.has(p.k) ? ' sel' : '') + (p.hidden ? ' hidden' : '');
      const label = p.t === 'text' ? `Texte « ${p.text} »` : TYPE_NAMES[p.t];
      d.innerHTML = `<button data-a="eye" title="Masquer / afficher">${p.hidden ? '◌' : '●'}</button><span>${esc(label)}</span>
        <span><button data-a="up" title="Monter">▲</button><button data-a="down" title="Descendre">▼</button></span>`;
      d.onclick = (e) => {
        const a = e.target.dataset.a;
        const i = A.cur.prims.indexOf(p);
        if (a === 'eye') { pushUndo(); p.hidden = !p.hidden; changed(); return; }
        if (a === 'up' || a === 'down') {
          const j = a === 'up' ? i + 1 : i - 1;
          if (j < 0 || j >= A.cur.prims.length) return;
          pushUndo();
          [A.cur.prims[i], A.cur.prims[j]] = [A.cur.prims[j], A.cur.prims[i]];
          changed();
          return;
        }
        if (e.shiftKey) { if (A.sel.has(p.k)) A.sel.delete(p.k); else A.sel.add(p.k); } else A.sel = new Set([p.k]);
        renderPrimProps(); renderLayers(); draw();
      };
      el.appendChild(d);
    });
  }

  function renderPreview() {
    const t = $('#pvThumb'), g = t.getContext('2d');
    t.width = 160; t.height = 128;
    g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, 80, 64);
    const pl = $('#pvPlan'), q = pl.getContext('2d');
    pl.width = 480; pl.height = 240;
    q.setTransform(2, 0, 0, 2, 0, 0); q.clearRect(0, 0, 240, 120);
    if (!A.cur) return;
    g.drawImage(thumb(A.cur, 80, 64), 0, 0, 80, 64);
    // Taille réelle sur le plan, à l'échelle de référence, zoom 300 %
    const sc = refScale();
    const sz = LP.symbolSize(A.cur, null, sc);
    const z = 3 * (96 / 72);
    q.strokeStyle = '#eef0f3';
    for (let i = 0; i < 240; i += 12) { q.beginPath(); q.moveTo(i, 0); q.lineTo(i, 120); q.stroke(); }
    for (let i = 0; i < 120; i += 12) { q.beginPath(); q.moveTo(0, i); q.lineTo(240, i); q.stroke(); }
    q.save(); q.translate(100, 60); q.scale(z, z);
    LP.drawSymbol(new LP.CanvasRenderer(q, A.imgEls), A.cur, { x: 0, y: 0, w: sz.w, h: sz.h, showTag: true, lineWidth: 1 });
    q.restore();
    const lbl = LP.SCALE_PRESETS[+$('#refScale').value];
    $('#pvPlanLbl').textContent = A.cur.mode === 'real' ? `Sur un plan au ${lbl ? lbl.label : '?'} (zoom 300 %)` : 'Sur le plan (zoom 300 %)';
  }

  /* ======================= Images / photos ======================= */
  let imgSrc = null; // HTMLImageElement source
  async function openImage(file) {
    if (!A.cur) { A.bank.symbols.push(newSymbol()); selectSymbol(A.bank.symbols[A.bank.symbols.length - 1]); }
    if (file.size > 25e6) { alert('Image trop lourde (max 25 Mo).'); return; }
    const url = await LP.readFile(file, 'dataurl');
    imgSrc = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
    $('#imgInfo').textContent = `${file.name} — ${imgSrc.naturalWidth} × ${imgSrc.naturalHeight} px`;
    processImage();
    $('#imgDialog').showModal();
  }
  // Redimensionne, retire le fond blanc, rogne, noir et blanc → {url, w, h}
  function processImage() {
    const max = +$('#imgMax').value;
    const k = Math.min(1, max / Math.max(imgSrc.naturalWidth, imgSrc.naturalHeight));
    const w = Math.max(1, Math.round(imgSrc.naturalWidth * k)), h = Math.max(1, Math.round(imgSrc.naturalHeight * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(imgSrc, 0, 0, w, h);
    const data = g.getImageData(0, 0, w, h);
    const d = data.data;
    const bg = $('#imgBg').checked, tol = +$('#imgTol').value, gray = $('#imgGray').checked;
    let transparent = false;
    for (let i = 0; i < d.length; i += 4) {
      if (gray) { const v = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]); d[i] = d[i + 1] = d[i + 2] = v; }
      if (bg) {
        const dist = 255 * 3 - (d[i] + d[i + 1] + d[i + 2]);
        if (dist <= tol) { d[i + 3] = 0; }
        else if (dist <= tol * 2) d[i + 3] = Math.round((d[i + 3] * (dist - tol)) / tol); // bord adouci
      }
      if (d[i + 3] < 255) transparent = true;
    }
    g.putImageData(data, 0, 0);
    // Rognage des marges vides (transparentes ou blanches)
    let out = c;
    if ($('#imgTrim').checked) {
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const empty = d[i + 3] < 10 || (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245);
        if (!empty) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 >= x0 && y1 >= y0 && (x1 - x0 + 1 < w || y1 - y0 + 1 < h)) {
        out = document.createElement('canvas');
        out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
        out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
      }
    }
    const url = transparent ? out.toDataURL('image/png') : out.toDataURL('image/jpeg', 0.88);
    const pv = $('#imgPreview'), pg = pv.getContext('2d');
    pv.width = 640; pv.height = 640;
    pg.clearRect(0, 0, 640, 640);
    const kk = Math.min(600 / out.width, 600 / out.height);
    pg.drawImage(out, (640 - out.width * kk) / 2, (640 - out.height * kk) / 2, out.width * kk, out.height * kk);
    const kb = (url.length * 3) / 4 / 1024;
    $('#imgInfo').textContent = `${imgSrc.naturalWidth} × ${imgSrc.naturalHeight} px → ${out.width} × ${out.height} px, ${transparent ? 'PNG transparent' : 'JPEG'}, ${kb < 1 ? '< 1' : '≈ ' + Math.round(kb)} Ko`;
    processImage.result = { url, w: out.width, h: out.height };
  }
  ['#imgMax', '#imgBg', '#imgTol', '#imgTrim', '#imgGray'].forEach((s) => $(s).addEventListener('input', processImage));
  $('#imgCancel').onclick = () => $('#imgDialog').close();
  $('#imgOk').onclick = () => {
    const r = processImage.result;
    $('#imgDialog').close();
    if (!r || !A.cur) return;
    const id = 'img-' + uid();
    A.bank.images[id] = r.url;
    loadImgEls();
    pushUndo();
    const p = newPrim('image', { img: id, pts: [[-0.4, -0.4], [0.4, 0.4]], keepAspect: true, stroke: 'none', width: 0 });
    A.cur.prims.push(p);
    A.sel = new Set([p.k]);
    // Ajuste à la boîte en gardant les proportions de l'image
    const im = new Image();
    im.onload = () => { A.imgEls[id] = im; fitImage(p, false); };
    im.src = r.url;
    changed();
    setTool('select');
  };
  function fitImage(p, undoable) {
    const im = A.imgEls[p.img];
    if (!im || !im.naturalWidth) return;
    if (undoable) pushUndo();
    const ar = im.naturalWidth / im.naturalHeight;
    let wPt = box.wPt * 0.9, hPt = wPt / ar;
    if (hPt > box.hPt * 0.9) { hPt = box.hPt * 0.9; wPt = hPt * ar; }
    const hw = wPt / box.wPt / 2, hh = hPt / box.hPt / 2;
    p.pts = [[-hw, -hh], [hw, hh]];
    changed();
  }

  /* ======================= Import SVG ======================= */
  function parseColor(c) {
    if (!c || c === 'none' || c === 'transparent') return 'none';
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c);
    if (!m) return c.startsWith('#') ? c : 'none';
    if (m[4] != null && +m[4] === 0) return 'none';
    return '#' + [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, '0')).join('');
  }
  // Analyse complète de l'attribut d (M L H V C S Q T A Z, absolu et relatif) → segments M/L/C/Z
  function parsePathD(d) {
    const toks = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
    const out = [];
    let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, lcx = null, lcy = null, lqx = null, lqy = null;
    const num = () => parseFloat(toks[i++]);
    const isNum = () => i < toks.length && !/^[a-zA-Z]$/.test(toks[i]);
    while (i < toks.length) {
      if (/^[a-zA-Z]$/.test(toks[i])) cmd = toks[i++];
      const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
      const ox = rel ? x : 0, oy = rel ? y : 0;
      if (C === 'Z') { out.push(['Z']); x = sx; y = sy; lcx = lqx = null; continue; }
      if (!isNum()) { i++; continue; }
      if (C === 'M') { x = ox + num(); y = oy + num(); sx = x; sy = y; out.push(['M', x, y]); cmd = rel ? 'l' : 'L'; lcx = lqx = null; }
      else if (C === 'L') { x = ox + num(); y = oy + num(); out.push(['L', x, y]); lcx = lqx = null; }
      else if (C === 'H') { x = ox + num(); out.push(['L', x, y]); lcx = lqx = null; }
      else if (C === 'V') { y = oy + num(); out.push(['L', x, y]); lcx = lqx = null; }
      else if (C === 'C') {
        const x1 = ox + num(), y1 = oy + num(), x2 = ox + num(), y2 = oy + num(); x = ox + num(); y = oy + num();
        out.push(['C', x1, y1, x2, y2, x, y]); lcx = x2; lcy = y2; lqx = null;
      } else if (C === 'S') {
        const x1 = lcx != null ? 2 * x - lcx : x, y1 = lcy != null ? 2 * y - lcy : y;
        const x2 = ox + num(), y2 = oy + num(); x = ox + num(); y = oy + num();
        out.push(['C', x1, y1, x2, y2, x, y]); lcx = x2; lcy = y2; lqx = null;
      } else if (C === 'Q' || C === 'T') {
        let qx, qy;
        if (C === 'Q') { qx = ox + num(); qy = oy + num(); } else { qx = lqx != null ? 2 * x - lqx : x; qy = lqy != null ? 2 * y - lqy : y; }
        const ex = ox + num(), ey = oy + num();
        out.push(['C', x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey]);
        x = ex; y = ey; lqx = qx; lqy = qy; lcx = null;
      } else if (C === 'A') {
        const rx = Math.abs(num()), ry = Math.abs(num()), rot = num(), large = num(), sweep = num();
        const ex = ox + num(), ey = oy + num();
        out.push(...arcToBeziers(x, y, rx, ry, rot, large, sweep, ex, ey));
        x = ex; y = ey; lcx = lqx = null;
      } else i++;
    }
    return out;
  }
  // Arc elliptique SVG → courbes de Bézier (conversion paramétrique standard)
  function arcToBeziers(x1, y1, rx, ry, phiDeg, fa, fs, x2, y2) {
    if (!rx || !ry) return [['L', x2, y2]];
    const phi = (phiDeg * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
    const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
    const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    const sign = fa === fs ? -1 : 1;
    const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    const co = sign * Math.sqrt(Math.max(0, num / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)));
    const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
    const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
    const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
    let t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
    const n = Math.ceil(Math.abs(dt) / (Math.PI / 2));
    const out = [], step = dt / n, k = (4 / 3) * Math.tan(step / 4);
    const pt = (t) => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
    const der = (t) => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
    for (let i = 0; i < n; i++) {
      const a = t1 + i * step, b = a + step;
      const [ax, ay] = pt(a), [bx, by] = pt(b), [dax, day] = der(a), [dbx, dby] = der(b);
      out.push(['C', ax + k * dax, ay + k * day, bx - k * dbx, by - k * dby, bx, by]);
    }
    return out;
  }

  async function importSvg(file) {
    if (!A.cur) { A.bank.symbols.push(newSymbol()); selectSymbol(A.bank.symbols[A.bank.symbols.length - 1]); }
    const text = await LP.readFile(file, 'text');
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== 'svg') { alert('Fichier SVG invalide.'); return; }
    // Rendu caché pour obtenir styles calculés et transformations
    root.querySelectorAll('script, foreignObject').forEach((n) => n.remove());
    const host = $('#svgSandbox');
    host.innerHTML = '';
    const svg = document.importNode(root, true);
    host.appendChild(svg);
    svg.setAttribute('width', svg.getAttribute('width') || '1000');
    svg.setAttribute('height', svg.getAttribute('height') || '1000');
    const rootM = svg.getScreenCTM();
    const invRoot = rootM ? rootM.inverse() : null;
    const raw = [];
    const els = svg.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon, text');
    for (const el of els) {
      if (el.closest('defs, clipPath, mask, symbol, pattern')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      let m = el.getScreenCTM();
      if (!m || !invRoot) continue;
      m = invRoot.multiply(m);
      const T = (x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
      const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
      const A2 = (n) => parseFloat(el.getAttribute(n) || 0);
      let segs = null;
      const tag = el.nodeName.toLowerCase();
      if (tag === 'path') segs = parsePathD(el.getAttribute('d') || '');
      else if (tag === 'rect') { const x = A2('x'), y = A2('y'), w = A2('width'), h = A2('height'); segs = [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']]; }
      else if (tag === 'circle' || tag === 'ellipse') {
        const cx = A2('cx'), cy = A2('cy'), rx = tag === 'circle' ? A2('r') : A2('rx'), ry = tag === 'circle' ? A2('r') : A2('ry');
        segs = [['M', cx + rx, cy], ...arcToBeziers(cx + rx, cy, rx, ry, 0, 0, 1, cx - rx, cy), ...arcToBeziers(cx - rx, cy, rx, ry, 0, 0, 1, cx + rx, cy), ['Z']];
      } else if (tag === 'line') segs = [['M', A2('x1'), A2('y1')], ['L', A2('x2'), A2('y2')]];
      else if (tag === 'polyline' || tag === 'polygon') {
        const v = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
        segs = [];
        for (let i = 0; i + 1 < v.length; i += 2) segs.push([i ? 'L' : 'M', v[i], v[i + 1]]);
        if (tag === 'polygon') segs.push(['Z']);
      } else if (tag === 'text') {
        const str = el.textContent.trim();
        if (!str) continue;
        const [x, y] = T(A2('x'), A2('y'));
        raw.push({ text: str, x, y, size: parseFloat(cs.fontSize) * scale, bold: +cs.fontWeight >= 600, fill: parseColor(cs.fill) });
        continue;
      }
      if (!segs || !segs.length) continue;
      const tsegs = segs.map((g) => { if (g[0] === 'Z') return g; const r = [g[0]]; for (let i = 1; i < g.length; i += 2) r.push(...T(g[i], g[i + 1])); return r; });
      raw.push({ segs: tsegs, stroke: parseColor(cs.stroke), fill: parseColor(cs.fill), sw: parseFloat(cs.strokeWidth || 1) * scale, op: parseFloat(cs.opacity || 1) });
    }
    host.innerHTML = '';
    if (!raw.length) { alert("Aucun élément dessinable trouvé dans ce SVG."); return; }
    // Boîte englobante → ajustement dans 90 % de la boîte du symbole (proportions conservées)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const r of raw) { if (r.segs) for (const g of r.segs) for (let i = 1; i < g.length; i += 2) add(g[i], g[i + 1]); else add(r.x, r.y); }
    const sw = Math.max(x1 - x0, 1e-6), sh = Math.max(y1 - y0, 1e-6);
    const kPt = Math.min((box.wPt * 0.9) / sw, (box.hPt * 0.9) / sh); // points par unité SVG
    const cxs = (x0 + x1) / 2, cys = (y0 + y1) / 2;
    const N = (x, y) => [((x - cxs) * kPt) / box.wPt, ((y - cys) * kPt) / box.hPt];
    pushUndo();
    const added = [];
    for (const r of raw) {
      if (r.segs) {
        const segs = r.segs.map((g) => { if (g[0] === 'Z') return g; const o = [g[0]]; for (let i = 1; i < g.length; i += 2) o.push(...N(g[i], g[i + 1])); return o; });
        added.push(newPrim('path', { segs, stroke: r.stroke, fill: r.fill, width: Math.max(0.1, Math.round(r.sw * kPt * 100) / 100), opacity: r.op < 1 ? r.op : undefined }));
      } else {
        added.push(newPrim('text', { p: N(r.x, r.y), text: r.text, size: (r.size * kPt) / Math.min(box.wPt, box.hPt), bold: r.bold, align: 'left', stroke: r.fill === 'none' ? 'sym' : r.fill }));
      }
    }
    A.cur.prims.push(...added);
    A.sel = new Set(added.map((p) => p.k));
    changed();
    toast(`${added.length} élément(s) importé(s) du SVG`);
  }

  /* ======================= Conversion des symboles LumiPlan ======================= */
  // Renderer « enregistreur » : transforme le dessin d'une forme standard en éléments modifiables
  class Recorder {
    constructor(w, h, symColor) {
      this.w = w; this.h = h; this.m = [1, 0, 0, 1, 0, 0]; this.stack = [];
      this.st = { stroke: '#000', fill: null, lw: 1, dash: [], alpha: 1 };
      this.segs = []; this.prims = []; this.symColor = symColor;
      this.mc = document.createElement('canvas').getContext('2d');
    }
    P(x, y) { const m = this.m; return [(m[0] * x + m[2] * y + m[4]) / this.w, (m[1] * x + m[3] * y + m[5]) / this.h]; }
    col(c) { return !c ? 'none' : c.toLowerCase() === (this.symColor || '').toLowerCase() ? 'sym' : c; }
    save() { this.stack.push([this.m.slice(), Object.assign({}, this.st)]); }
    restore() { const s = this.stack.pop(); if (s) { this.m = s[0]; this.st = s[1]; } }
    transform(a, b, c, d, e, f) { const m = this.m; this.m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]]; }
    setStroke(c) { this.st.stroke = c; } setFill(c) { this.st.fill = c; } setLineWidth(w) { this.st.lw = w; }
    setDash(d) { this.st.dash = d || []; } setAlpha(a) { this.st.alpha = a; }
    beginPath() { this.segs = []; }
    moveTo(x, y) { this.segs.push(['M', ...this.P(x, y)]); }
    lineTo(x, y) { this.segs.push(['L', ...this.P(x, y)]); }
    curveTo(a, b, c, d, e, f) { this.segs.push(['C', ...this.P(a, b), ...this.P(c, d), ...this.P(e, f)]); }
    closePath() { this.segs.push(['Z']); }
    emit(fill, stroke) {
      if (!this.segs.length) return;
      this.prims.push({ k: uid(), t: 'path', segs: this.segs, stroke: stroke ? this.col(this.st.stroke) : 'none', fill: fill ? this.col(this.st.fill) : 'none',
        width: Math.round(this.st.lw * 100) / 100 || 1, dash: this.st.dash.length ? 'dash' : 'solid', opacity: this.st.alpha < 1 ? this.st.alpha : undefined });
      this.segs = [];
    }
    stroke() { this.emit(false, true); } fill() { this.emit(true, false); } fillStroke() { this.emit(true, true); } endPath() { this.segs = []; }
    measure(str, size, bold) { this.mc.font = `${bold ? 'bold ' : ''}${size}px Helvetica, Arial, sans-serif`; return this.mc.measureText(str).width; }
    text(str, x, y, size, color, bold) {
      const md = Math.min(this.w, this.h);
      const sc = Math.hypot(this.m[0], this.m[1]);
      this.prims.push({ k: uid(), t: 'text', p: this.P(x, y), text: str, size: (size * sc) / md, bold: !!bold, align: 'left', stroke: this.col(color), width: 1 });
    }
    image(id, x, y, w, h) { this.prims.push({ k: uid(), t: 'image', img: id, pts: [this.P(x, y), this.P(x + w, y + h)], stroke: 'none', width: 0, keepAspect: true }); }
  }
  Object.assign(Recorder.prototype, LP.RendererShared);

  function convertToCustom(sym, images) {
    const d = LP.migrateSym(clone(sym));
    const out = Object.assign({}, d, { id: 'a-' + uid(), shape: 'custom', atelier: true, builtin: false, round: LP.isRound(d), inner: '' });
    if (sym.shape === 'custom') { out.prims = clone(sym.prims || []); for (const id of LP.symImageIds(sym)) if (images[id]) A.bank.images[id] = images[id]; return out; }
    // Taille de référence pour l'enregistrement (proportions du symbole)
    const L = d.dimL || 1, W = LP.isRound(d) ? L : d.dimW || L;
    const w = 100, h = (100 * W) / L;
    const R = new Recorder(w, h, d.color);
    R.setStroke(d.color); R.setLineWidth(1);
    const style = { color: d.color, fill: d.fill && d.fill !== 'none' ? d.fill : null, inner: d.inner || '', id: sym.id };
    if (sym.shape === 'image') {
      if (!images[sym.id]) return null;
      const id = 'img-' + uid();
      A.bank.images[id] = images[sym.id];
      R.image(id, -w / 2, -h / 2, w, h);
    } else (LP.SHAPES[d.shape] || LP.SHAPES.circle).draw(R, style, w, h);
    out.prims = R.prims; // points déjà normalisés (dessin centré sur 0, divisé par w et h)
    return out;
  }

  /* ======================= Échanges avec LumiPlan ======================= */
  function exportLib(symbols) {
    const images = {};
    for (const s of symbols) for (const id of LP.symImageIds(s)) if (A.bank.images[id]) images[id] = A.bank.images[id];
    const syms = symbols.map((s) => { const c = clone(s); c.prims = (c.prims || []).map((p) => { const q = Object.assign({}, p); delete q._pts; return q; }); return c; });
    return { format: 'lumiplan-library', version: 1, source: 'atelier', symbols: syms, images };
  }
  async function sendToLumiPlan(symbols) {
    if (!symbols.length) return;
    const data = exportLib(symbols);
    let lib = await LP.store.get('library');
    if (!lib || !lib.length) lib = clone(LP.DEFAULT_SYMBOLS); // LumiPlan jamais ouvert : on garde la bibliothèque par défaut
    let added = 0, updated = 0;
    for (const s of data.symbols) {
      const i = lib.findIndex((x) => x.id === s.id);
      if (i >= 0) { lib[i] = s; updated++; } else { lib.push(s); added++; }
    }
    const imgs = Object.assign({}, (await LP.store.get('libImages')) || {}, data.images);
    await LP.store.set('libImages', imgs);
    await LP.store.set('library', lib);
    try { new BroadcastChannel('lumiplan').postMessage({ type: 'library-updated', count: added + updated }); } catch (e) { /* rien */ }
    toast(`LumiPlan : ${added} ajouté(s), ${updated} mis à jour. (Si LumiPlan est ouvert dans un autre navigateur, utilisez « Exporter la banque ».)`, 7000);
  }

  async function importBankFile(file) {
    let d;
    try { d = JSON.parse(await LP.readFile(file, 'text')); } catch (e) { alert('Fichier invalide.'); return; }
    if (d.format !== 'lumiplan-library' || !Array.isArray(d.symbols)) { alert("Ce fichier n'est pas une bibliothèque LumiPlan / banque de l'Atelier."); return; }
    let n = 0, skipped = 0;
    for (const s of d.symbols) {
      if (s.shape === 'custom') {
        const c = clone(s);
        const i = A.bank.symbols.findIndex((x) => x.id === c.id);
        if (i >= 0) A.bank.symbols[i] = c; else A.bank.symbols.push(c);
        for (const id of LP.symImageIds(c)) if (d.images && d.images[id]) A.bank.images[id] = d.images[id];
        n++;
      } else {
        const c = convertToCustom(s, d.images || {});
        if (c) { A.bank.symbols.push(c); n++; } else skipped++;
      }
    }
    loadImgEls(); saveBank(); renderBank();
    if (!A.cur && A.bank.symbols.length) selectSymbol(A.bank.symbols[0]);
    toast(`${n} symbole(s) importé(s)${skipped ? `, ${skipped} ignoré(s)` : ''}`);
  }

  async function pickFromLumiPlan() {
    let lib = await LP.store.get('library');
    if (!lib || !lib.length) lib = clone(LP.DEFAULT_SYMBOLS);
    const imgs = (await LP.store.get('libImages')) || {};
    for (const [id, url] of Object.entries(imgs)) if (!A.imgEls[id]) { const im = new Image(); im.src = url; A.imgEls[id] = im; }
    const box3 = $('#pickList');
    box3.innerHTML = '';
    lib.forEach((s, i) => {
      const l = document.createElement('label');
      l.innerHTML = `<input type="checkbox" value="${i}">`;
      l.appendChild(thumb(s, 40, 30));
      const t = document.createElement('span');
      t.innerHTML = `${esc(s.name)} <small class="hint">${esc(s.cat || '')}${s.shape === 'custom' ? ' · composé' : ''}</small>`;
      l.appendChild(t);
      box3.appendChild(l);
    });
    const dlg = $('#pickDialog');
    $('#pickAll').onclick = () => box3.querySelectorAll('input').forEach((c) => (c.checked = true));
    $('#pickCancel').onclick = () => dlg.close();
    $('#pickOk').onclick = () => {
      const chosen = [...box3.querySelectorAll('input:checked')].map((c) => lib[+c.value]);
      dlg.close();
      let last = null;
      for (const s of chosen) {
        const c = convertToCustom(s, imgs);
        if (!c) continue;
        c.name = s.shape === 'custom' ? s.name : s.name + ' (modifiable)';
        if (s.shape === 'custom') c.id = s.id; // même identifiant : renvoyer met à jour le symbole dans LumiPlan
        const i = A.bank.symbols.findIndex((x) => x.id === c.id);
        if (i >= 0) A.bank.symbols[i] = c; else A.bank.symbols.push(c);
        last = c;
      }
      loadImgEls(); saveBank();
      if (last) selectSymbol(last); else renderBank();
      toast(`${chosen.length} symbole(s) ajouté(s) à la banque`);
    };
    dlg.showModal();
  }

  /* ======================= Liaisons ======================= */
  function bind() {
    $('#btnNew').onclick = () => { const s = newSymbol(); A.bank.symbols.push(s); saveBank(); selectSymbol(s); setTool('rect'); };
    $('#btnDupSym').onclick = () => {
      if (!A.cur) return;
      const c = clone(A.cur); c.id = 'a-' + uid(); c.name += ' (copie)';
      A.bank.symbols.splice(A.bank.symbols.indexOf(A.cur) + 1, 0, c);
      saveBank(); selectSymbol(c);
    };
    $('#btnDelSym').onclick = () => {
      if (!A.cur || !confirm(`Supprimer « ${A.cur.name} » de la banque ?\n(Il reste dans LumiPlan s'il y a déjà été envoyé.)`)) return;
      const i = A.bank.symbols.indexOf(A.cur);
      A.bank.symbols.splice(i, 1);
      saveBank();
      selectSymbol(A.bank.symbols[Math.min(i, A.bank.symbols.length - 1)] || null);
    };
    $('#btnImportFile').onclick = () => $('#fileBank').click();
    $('#fileBank').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importBankFile(f); };
    $('#btnFromLumi').onclick = pickFromLumiPlan;
    $('#btnSendOne').onclick = () => A.cur && sendToLumiPlan([A.cur]);
    $('#btnSendAll').onclick = () => { if (A.bank.symbols.length && confirm(`Envoyer les ${A.bank.symbols.length} symboles de la banque dans LumiPlan ?`)) sendToLumiPlan(A.bank.symbols); };
    $('#btnExport').onclick = () => {
      if (!A.bank.symbols.length) return;
      LP.saveBlob(new Blob([JSON.stringify(exportLib(A.bank.symbols))], { type: 'application/json' }), 'banque-symboles.lumiplan-lib.json');
    };
    $('#btnUndo').onclick = undo;
    $('#btnRedo').onclick = redo;
    $('#btnImg').onclick = () => $('#fileImg').click();
    $('#fileImg').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openImage(f); };
    $('#btnSvg').onclick = () => $('#fileSvg').click();
    $('#fileSvg').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importSvg(f); };
    $('#btnRecolor').onclick = () => {
      if (!A.cur) return;
      const list = selected().length ? selected() : A.cur.prims;
      pushUndo();
      for (const p of list) { if (p.stroke && p.stroke !== 'none') p.stroke = 'sym'; if (p.fill && p.fill !== 'none' && !/^#fff(fff)?$/i.test(p.fill)) p.fill = 'sym'; }
      changed();
      toast('Couleurs remplacées par la couleur du symbole (le blanc est conservé)');
    };
    $('#bankFilter').oninput = renderBank;
    $('#gridSel').onchange = draw;
    $('#refScale').onchange = () => { renderPreview(); draw(); };
    // Glisser-déposer : image, SVG ou banque
    const stage = $('#stage');
    stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('dragover'); });
    stage.addEventListener('dragleave', () => stage.classList.remove('dragover'));
    stage.addEventListener('drop', (e) => {
      e.preventDefault(); stage.classList.remove('dragover');
      const f = e.dataTransfer.files[0];
      if (!f) return;
      if (/\.svg$/i.test(f.name) || f.type === 'image/svg+xml') importSvg(f);
      else if (/^image\//.test(f.type)) openImage(f);
      else if (/\.json$/i.test(f.name)) importBankFile(f);
    });
    // Coller une image depuis le presse-papiers (capture d'écran, image copiée)
    window.addEventListener('paste', (e) => {
      const item = [...(e.clipboardData || {}).items || []].find((i) => i.type.startsWith('image/'));
      if (item) { e.preventDefault(); openImage(item.getAsFile()); }
    });
    new ResizeObserver(() => draw()).observe($('#stage'));
  }

  async function init() {
    buildTools();
    bind();
    await loadBank();
    const sel = $('#refScale');
    sel.innerHTML = LP.SCALE_PRESETS.map((p, i) => `<option value="${i}">${p.label}</option>`).join('');
    const def = LP.SCALE_PRESETS.findIndex((p) => p.label === (A.unit === 'ft' ? '1/8" = 1\'-0"' : '1:100'));
    sel.value = String(def >= 0 ? def : 0);
    setTool('select');
    selectSymbol(A.bank.symbols[0] || null);
  }

  window.Atelier = { state: A, selectSymbol, sendToLumiPlan, importSvg, openImage, convertToCustom };
  init();
})();
