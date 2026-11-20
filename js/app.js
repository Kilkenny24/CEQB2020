/*
 * LumiPlan — application principale : visionneuse, outils, panneaux, fichiers.
 */
(function () {
  'use strict';
  const LP = window.LP;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const pdfjsLib = window.pdfjsLib;

  /* ======================= État ======================= */
  const S = {
    pdf: null, pdfBytes: null, cleanBytes: null, native: null, fileName: '', fingerprint: '', numPages: 0, pageLabels: null,
    pageNum: 1, page: null, vp: null, // pdf.js page + viewport échelle 1
    zoom: 1, pan: { x: 0, y: 0 },
    annots: [], sel: new Set(),
    tool: 'select', prevTool: 'select',
    scales: {}, unit: 'ft',
    library: [], images: {}, imgEls: {},
    currentSym: null,
    undo: [], redo: [], dirty: false,
    projHandle: null, clipboard: [],
    author: '',
  };

  const DEFAULT_STYLE = {
    line: { stroke: '#d00000', width: 1.5, opacity: 1, dash: 'solid' },
    arrow: { stroke: '#d00000', width: 1.5, opacity: 1, dash: 'solid' },
    rect: { stroke: '#d00000', fill: 'none', width: 1.5, opacity: 1, dash: 'solid' },
    ellipse: { stroke: '#d00000', fill: 'none', width: 1.5, opacity: 1, dash: 'solid' },
    cloud: { stroke: '#d00000', fill: 'none', width: 1.5, opacity: 1, dash: 'solid', arc: 14 },
    polyline: { stroke: '#d00000', width: 1.5, opacity: 1, dash: 'solid' },
    polygon: { stroke: '#d00000', fill: 'none', width: 1.5, opacity: 1, dash: 'solid' },
    ink: { stroke: '#d00000', width: 2, opacity: 1, dash: 'solid' },
    highlight: { stroke: '#ffd400', fill: '#ffeb3b', width: 0, opacity: 0.4, dash: 'solid' },
    text: { stroke: '#d00000', textColor: '#d00000', fill: 'none', width: 0, opacity: 1, dash: 'solid', fontSize: 12 },
    callout: { stroke: '#d00000', textColor: '#d00000', fill: '#ffffff', width: 1, opacity: 1, dash: 'solid', fontSize: 10 },
    symbol: { width: 1, opacity: 1 },
    length: { stroke: '#0050c8', width: 1, opacity: 1, dash: 'solid', fontSize: 9 },
    polylength: { stroke: '#0050c8', width: 1.5, opacity: 1, dash: 'solid', fontSize: 9 },
    area: { stroke: '#0050c8', fill: '#4f8df5', width: 1, opacity: 0.35, dash: 'solid', fontSize: 9 },
    calibrate: { stroke: '#ff7a00', width: 1, opacity: 1, dash: 'dash', fontSize: 9 },
    note: { stroke: '#ffd400', width: 1, opacity: 1, dash: 'solid' },
    markup: { stroke: '#ffeb3b', width: 1, opacity: 0.4, dash: 'solid' },
  };
  let defaults = JSON.parse(JSON.stringify(DEFAULT_STYLE));
  const symDefaults = { rot: 0, showTag: true };

  const TOOLS = [
    { id: 'select', key: 'v', label: 'Sélection', icon: '<path d="M5 3l12 8-5 1.5L15 19l-2.5 1-3-6.5L5 17z"/>' },
    { id: 'pan', key: 'h', label: 'Main', icon: '<path d="M8 12V5a1.5 1.5 0 013 0v6M11 10V3.5a1.5 1.5 0 013 0V10M14 10V5a1.5 1.5 0 013 0v8c0 4-2.5 7-6.5 7S5 17 4 14l-1.5-3a1.4 1.4 0 012.4-1.4L8 13"/>' },
    'sep',
    { id: 'symbol', key: 's', label: 'Symbole', icon: '<circle cx="12" cy="12" r="6"/><path d="M8 8l8 8M16 8l-8 8"/>' },
    'sep',
    { id: 'line', key: 'l', label: 'Ligne', icon: '<path d="M4 20L20 4"/>' },
    { id: 'arrow', key: 'a', label: 'Flèche', icon: '<path d="M4 20L19 5M11 5h8v8"/>' },
    { id: 'rect', key: 'r', label: 'Rectangle', icon: '<rect x="4" y="6" width="16" height="12" rx="1"/>' },
    { id: 'ellipse', key: 'e', label: 'Ellipse', icon: '<ellipse cx="12" cy="12" rx="8" ry="6"/>' },
    { id: 'cloud', key: 'c', label: 'Nuage', icon: '<path d="M6 8a2 2 0 014 0 2 2 0 014 0 2 2 0 014 0 2 2 0 010 4 2 2 0 010 4 2 2 0 01-4 0 2 2 0 01-4 0 2 2 0 01-4 0 2 2 0 010-4 2 2 0 010-4z"/>' },
    { id: 'polyline', key: 'p', label: 'Polyligne', icon: '<path d="M3 18l5-9 5 6 8-10"/>' },
    { id: 'polygon', key: 'g', label: 'Polygone', icon: '<path d="M5 19l-2-8 8-7 9 5-3 10z"/>' },
    { id: 'ink', key: 'f', label: 'Main levée', icon: '<path d="M3 17c3-6 5-8 7-5s3 4 5 0 4-6 6-4"/>' },
    { id: 'highlight', key: 'i', label: 'Surligneur', icon: '<path d="M4 20h7M14 4l6 6-8 8H6v-6z"/>' },
    { id: 'text', key: 't', label: 'Texte', icon: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>' },
    { id: 'callout', key: 'q', label: 'Bulle', icon: '<rect x="9" y="3" width="12" height="9" rx="1"/><path d="M9 10L3 20"/>' },
    { id: 'note', key: 'o', label: 'Note', icon: '<path d="M4 4h16v11H11l-5 5v-5H4z"/><path d="M8 8h8M8 11h6"/>' },
    'sep',
    { id: 'calibrate', key: 'k', label: 'Calibrer', icon: '<path d="M3 16l13-13 5 5L8 21z"/><path d="M7 12l2 2M10 9l2 2M13 6l2 2"/>' },
    { id: 'length', key: 'm', label: 'Longueur', icon: '<path d="M4 12h16M4 8v8M20 8v8"/>' },
    { id: 'polylength', key: 'n', label: 'Long. poly', icon: '<path d="M3 18l6-10 6 7 6-9"/><circle cx="3" cy="18" r="1"/><circle cx="21" cy="6" r="1"/>' },
    { id: 'area', key: 'b', label: 'Aire', icon: '<path d="M4 18l2-12 13 2-2 10z"/><path d="M8 14l3-3M11 15l4-4"/>' },
  ];
  const TWO_POINT = new Set(['line', 'arrow', 'rect', 'ellipse', 'cloud', 'highlight', 'text', 'length', 'calibrate']);
  const MULTI_POINT = new Set(['polyline', 'polygon', 'polylength', 'area']);

  const env = { scaleFor: (p) => S.scales[p] || null, unit: () => S.unit };
  LP.env = env;

  /* ======================= DOM ======================= */
  const viewer = $('#viewer');
  const base = $('#baseCanvas');
  const over = $('#overlayCanvas');
  const bctx = base.getContext('2d');
  const octx = over.getContext('2d');
  const editor = $('#textEditor');
  let dpr = window.devicePixelRatio || 1;
  let vw = 0, vh = 0;

  function toast(msg, ms = 2500) {
    const el = $('#statusMsg');
    el.textContent = msg;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (el.textContent = ''), ms);
  }

  /* ======================= pdf.js ======================= */
  let workerReady = null;
  function setupPdfWorker() {
    if (workerReady) return workerReady;
    if (location.protocol === 'file:' && window.PDFJS_WORKER_SOURCE) {
      // En file://, un Worker ne peut pas charger un fichier : on le démarre
      // depuis un Blob contenant le code du worker (rendu hors du fil principal).
      try {
        const url = URL.createObjectURL(new Blob([window.PDFJS_WORKER_SOURCE], { type: 'text/javascript' }));
        pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(url);
        workerReady = Promise.resolve();
        return workerReady;
      } catch (e) { console.warn('Worker Blob impossible, repli sur le fil principal', e); }
    }
    if (location.protocol === 'file:') {
      // Repli : worker exécuté dans la page (mode « fake worker » de pdf.js).
      workerReady = new Promise((res, rej) => {
        const sc = document.createElement('script');
        sc.src = 'vendor/pdfjs/pdf.worker.min.js';
        sc.onload = res;
        sc.onerror = rej;
        document.head.appendChild(sc);
      });
    } else {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
      workerReady = Promise.resolve();
    }
    return workerReady;
  }

  async function sha256(bytes) {
    try {
      const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      return Array.from(h.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
    } catch (e) { return null; }
  }

  async function openPdfBytes(bytes, name) {
    await setupPdfWorker();
    toast('Lecture des annotations existantes…', 60000);
    let native;
    try { native = await LP.readNative(bytes); } catch (e) {
      console.warn('Lecture des annotations natives impossible', e);
      native = { failed: true, pages: new Map(), importedRefs: new Set(), cleanBytes: bytes };
    }
    // pdf.js affiche la copie « propre » : les annotations importées sont
    // redessinées par LumiPlan (donc sélectionnables et modifiables)
    const copy = native.cleanBytes.slice(); // pdf.js détache le tampon reçu
    let pdf;
    try {
      pdf = await pdfjsLib.getDocument({
        data: copy,
        isEvalSupported: false, // durcissement sécurité (CVE-2024-4367)
        standardFontDataUrl: location.protocol === 'file:' ? undefined : 'vendor/pdfjs/standard_fonts/',
      }).promise;
    } catch (e) {
      alert("Impossible d'ouvrir ce PDF : " + e.message);
      toast('');
      return false;
    }
    if (S.pdf) S.pdf.destroy();
    S.pdf = pdf;
    S.pdfBytes = bytes;
    S.cleanBytes = native.cleanBytes;
    S.native = native;
    S.fileName = name;
    S.fingerprint = (await sha256(bytes)) || (pdf.fingerprints && pdf.fingerprints[0]) || name;
    S.numPages = pdf.numPages;
    S.pageLabels = await pdf.getPageLabels().catch(() => null);
    S.annots = await importNative(pdf, native);
    S.sel.clear();
    S.scales = {};
    S.undo = []; S.redo = [];
    S.projHandle = null;
    S.dirty = false;
    previewCache.clear();
    $('#dropHint').style.display = 'none';
    document.title = `${name} — LumiPlan`;
    await goPage(1, true);
    if (native.encrypted) toast('PDF protégé : annotations existantes non modifiables', 8000);
    else if (native.failed) toast('Annotations existantes illisibles : affichées sans être modifiables', 8000);
    else toast(S.annots.length ? `${S.annots.length} annotation(s) existante(s) importée(s) — modifiables` : 'PDF ouvert', 5000);

    // Projet en attente (ouvert avant le PDF) ou sauvegarde automatique
    if (pendingProject) {
      const p = pendingProject; pendingProject = null;
      applyProject(p, true);
    } else {
      const auto = await LP.store.get('auto:' + S.fingerprint);
      if (auto && auto.annots && auto.annots.length && LP.annotsDiffer(auto.annots, S.annots)) {
        if (confirm(`${auto.annots.length} annotation(s) enregistrée(s) automatiquement pour ce PDF le ${new Date(auto.saved).toLocaleString('fr-CA')}.\n\nLes restaurer ?`)) {
          applyProject(auto, true);
        }
      }
    }
    refreshPanels();
    return true;
  }

  // Convertit les annotations lues dans le PDF en annotations LumiPlan
  async function importNative(pdf, native) {
    const out = [];
    for (const [pageNum, entries] of native.pages) {
      const page = await pdf.getPage(pageNum);
      const vp = page.getViewport({ scale: 1 });
      const P = (x, y) => vp.convertToViewportPoint(x, y);
      for (const e of entries) {
        try { const a = LP.nativeToModel(e, pageNum, P); if (a) out.push(a); } catch (err) { console.warn('Annotation ignorée', e, err); }
      }
    }
    return out;
  }
  LP.annotsDiffer = (x, y) => JSON.stringify(x.map(LP.annotStamp)) !== JSON.stringify(y.map(LP.annotStamp));

  /* ======================= Rendu de la page ======================= */
  const previewCache = new Map(); // page -> {canvas, scale}
  let hi = null; // {canvas, zoom, pan, page}
  let hiTask = null, hiTimer = null;

  async function goPage(n, fit) {
    if (!S.pdf) return;
    n = Math.max(1, Math.min(S.numPages, n | 0));
    commitText();
    finishMulti(true);
    S.pageNum = n;
    S.page = await S.pdf.getPage(n);
    S.vp = S.page.getViewport({ scale: 1 });
    S.sel.clear();
    hi = null;
    const sameSize = goPage.lastSize && Math.abs(goPage.lastSize[0] - S.vp.width) < 1 && Math.abs(goPage.lastSize[1] - S.vp.height) < 1;
    if (fit || !goPage.visited || !sameSize) fitPage();
    goPage.lastSize = [S.vp.width, S.vp.height];
    goPage.visited = true;
    $('#pageInput').value = S.pageLabels ? S.pageLabels[n - 1] || n : n;
    $('#pageCount').textContent = `/ ${S.numPages}`;
    updateScaleUI();
    drawBase();
    ensurePreview(n).then(() => n === S.pageNum && drawBase());
    scheduleHi();
    drawOverlay();
    refreshPanels();
  }

  async function ensurePreview(n) {
    if (previewCache.has(n)) return previewCache.get(n);
    const page = n === S.pageNum ? S.page : await S.pdf.getPage(n);
    const v1 = page.getViewport({ scale: 1 });
    const scale = Math.min(3000 / Math.max(v1.width, v1.height), 3);
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    const entry = { canvas: c, scale, ready: false, promise: null };
    previewCache.set(n, entry);
    entry.promise = page.render({ canvasContext: c.getContext('2d'), viewport: vp, background: '#ffffff' }).promise
      .then(() => { entry.ready = true; })
      .catch(() => previewCache.delete(n));
    if (previewCache.size > 4) previewCache.delete(previewCache.keys().next().value);
    await entry.promise;
    return entry;
  }

  function scheduleHi() {
    clearTimeout(hiTimer);
    if (hiTask) { hiTask.cancel(); hiTask = null; }
    hiTimer = setTimeout(renderHi, 140);
  }

  async function renderHi() {
    if (!S.page) return;
    const zoom = S.zoom, pan = { ...S.pan }, n = S.pageNum;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(vw * dpr)); c.height = Math.max(1, Math.round(vh * dpr));
    const vp = S.page.getViewport({ scale: zoom * dpr, offsetX: pan.x * dpr, offsetY: pan.y * dpr });
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    const task = S.page.render({ canvasContext: ctx, viewport: vp });
    hiTask = task;
    try {
      await task.promise;
      if (n !== S.pageNum) return;
      hi = { canvas: c, zoom, pan, page: n };
      drawBase();
    } catch (e) { /* rendu annulé */ }
    finally { if (hiTask === task) hiTask = null; }
  }

  function drawBase() {
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.fillStyle = getComputedStyle(viewer).backgroundColor;
    bctx.fillRect(0, 0, base.width, base.height);
    if (!S.vp) return;
    const w = S.vp.width, h = S.vp.height;
    // Ombre + feuille blanche
    bctx.setTransform(dpr * S.zoom, 0, 0, dpr * S.zoom, dpr * S.pan.x, dpr * S.pan.y);
    bctx.shadowColor = 'rgba(0,0,0,.4)'; bctx.shadowBlur = 12 * dpr;
    bctx.fillStyle = '#fff';
    bctx.fillRect(0, 0, w, h);
    bctx.shadowBlur = 0;
    const pv = previewCache.get(S.pageNum);
    if (pv && pv.ready) {
      const k = (S.zoom * dpr) / pv.scale;
      bctx.setTransform(k, 0, 0, k, dpr * S.pan.x, dpr * S.pan.y);
      bctx.drawImage(pv.canvas, 0, 0);
    }
    if (hi && hi.page === S.pageNum) {
      const k = S.zoom / hi.zoom;
      bctx.setTransform(k, 0, 0, k, dpr * (S.pan.x - hi.pan.x * k), dpr * (S.pan.y - hi.pan.y * k));
      // Ne dessine que la partie de la page (évite le fond blanc hors page)
      bctx.save();
      bctx.beginPath();
      const x0 = (hi.pan.x) * dpr, y0 = (hi.pan.y) * dpr;
      bctx.rect(x0, y0, w * hi.zoom * dpr, h * hi.zoom * dpr);
      bctx.clip();
      bctx.drawImage(hi.canvas, 0, 0);
      bctx.restore();
    }
  }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    const r = viewer.getBoundingClientRect();
    vw = r.width; vh = r.height;
    for (const c of [base, over]) {
      c.width = Math.round(vw * dpr); c.height = Math.round(vh * dpr);
      c.style.width = vw + 'px'; c.style.height = vh + 'px';
    }
    drawBase(); drawOverlay(); scheduleHi();
  }

  function fitPage() {
    if (!S.vp) return;
    const m = 20;
    S.zoom = Math.min((vw - 2 * m) / S.vp.width, (vh - 2 * m) / S.vp.height);
    S.pan.x = (vw - S.vp.width * S.zoom) / 2;
    S.pan.y = (vh - S.vp.height * S.zoom) / 2;
    updateZoomLabel();
  }

  function zoomAt(f, sx, sy) {
    const nz = Math.max(0.05, Math.min(64, S.zoom * f));
    const k = nz / S.zoom;
    S.pan.x = sx - (sx - S.pan.x) * k;
    S.pan.y = sy - (sy - S.pan.y) * k;
    S.zoom = nz;
    updateZoomLabel();
    viewChanged();
  }
  function viewChanged() { drawBase(); drawOverlay(); scheduleHi(); positionEditor(); }
  function updateZoomLabel() { $('#zoomLabel').textContent = Math.round(S.zoom * 100) + ' %'; }

  const toPage = (sx, sy) => [(sx - S.pan.x) / S.zoom, (sy - S.pan.y) / S.zoom];
  const toScreen = (x, y) => [x * S.zoom + S.pan.x, y * S.zoom + S.pan.y];

  /* ======================= Overlay ======================= */
  let overlayQueued = false;
  function drawOverlay() {
    if (overlayQueued) return;
    overlayQueued = true;
    requestAnimationFrame(() => { overlayQueued = false; paintOverlay(); });
  }

  function paintOverlay() {
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, over.width, over.height);
    if (!S.vp) return;
    octx.setTransform(dpr * S.zoom, 0, 0, dpr * S.zoom, dpr * S.pan.x, dpr * S.pan.y);
    const R = new LP.CanvasRenderer(octx, S.imgEls);
    const list = S.annots.filter((a) => a.page === S.pageNum);
    for (const a of list) {
      if (editing && editing.id === a.id) {
        // Pendant l'édition, le texte est affiché par le textarea
        const tmp = Object.assign({}, a, { text: '' });
        LP.drawAnnotation(R, tmp, env);
      } else LP.drawAnnotation(R, a, env);
    }
    if (drawing) LP.drawAnnotation(R, drawing, env);
    if (drawing && MULTI_POINT.has(drawing.type) && hover) {
      const last = drawing.pts[drawing.pts.length - 1];
      octx.save();
      octx.strokeStyle = drawing.style.stroke; octx.lineWidth = 1 / S.zoom; octx.setLineDash([4 / S.zoom, 3 / S.zoom]);
      octx.beginPath(); octx.moveTo(last[0], last[1]); octx.lineTo(hover[0], hover[1]); octx.stroke();
      octx.restore();
    }
    // Aperçu du symbole sous le curseur
    if (S.tool === 'symbol' && S.currentSym && hover && !drag) {
      const sz = LP.symbolSize(S.currentSym, null, env.scaleFor(S.pageNum));
      octx.save(); octx.globalAlpha = 0.55;
      LP.drawSymbol(R, S.currentSym, { x: hover[0], y: hover[1], w: sz.w, h: sz.h, provisional: sz.provisional, rot: symDefaults.rot, showTag: symDefaults.showTag, lineWidth: defaults.symbol.width });
      octx.restore();
    }
    // Pose par glisser : longueur et orientation suivent la souris
    if (drag && drag.kind === 'symdrag') {
      const r = symDragResult(drag);
      if (r) {
        const sz = LP.symbolSize(S.currentSym, { dimL: r.dimL }, env.scaleFor(S.pageNum));
        octx.save(); octx.globalAlpha = 0.7;
        LP.drawSymbol(R, S.currentSym, { x: r.center[0], y: r.center[1], w: sz.w, h: sz.h, rot: r.rot, showTag: false, lineWidth: defaults.symbol.width });
        octx.restore();
        const fs = 12 / S.zoom;
        octx.save();
        octx.font = `bold ${fs}px Helvetica, Arial, sans-serif`;
        const t = r.label, tw = octx.measureText(t).width;
        const lx = drag.cur[0] + 10 / S.zoom, ly = drag.cur[1] - 10 / S.zoom;
        octx.fillStyle = 'rgba(255,255,255,.9)'; octx.fillRect(lx - 3 / S.zoom, ly - fs, tw + 6 / S.zoom, fs * 1.3);
        octx.fillStyle = '#1f6feb'; octx.fillText(t, lx, ly);
        octx.restore();
      }
    }
    // Sélection
    const hr = 4 / S.zoom;
    octx.lineWidth = 1 / S.zoom;
    for (const a of list) {
      if (!S.sel.has(a.id)) continue;
      const [x, y, w, h] = LP.bboxAnnotation(a);
      const m = 3 / S.zoom;
      octx.strokeStyle = '#1f6feb';
      octx.setLineDash([4 / S.zoom, 3 / S.zoom]);
      octx.strokeRect(x - m, y - m, w + 2 * m, h + 2 * m);
      octx.setLineDash([]);
      if (S.sel.size === 1 && !['symbol', 'ink', 'note', 'markup'].includes(a.type)) {
        for (const p of a.pts) {
          octx.fillStyle = '#fff'; octx.strokeStyle = '#1f6feb';
          octx.fillRect(p[0] - hr, p[1] - hr, 2 * hr, 2 * hr);
          octx.strokeRect(p[0] - hr, p[1] - hr, 2 * hr, 2 * hr);
        }
      }
    }
    if (drag && drag.kind === 'box') {
      const [x, y] = drag.start, [x2, y2] = drag.cur;
      octx.fillStyle = 'rgba(31,111,235,.08)'; octx.strokeStyle = '#1f6feb';
      octx.fillRect(Math.min(x, x2), Math.min(y, y2), Math.abs(x2 - x), Math.abs(y2 - y));
      octx.strokeRect(Math.min(x, x2), Math.min(y, y2), Math.abs(x2 - x), Math.abs(y2 - y));
    }
  }

  /* ======================= Historique ======================= */
  function snapshot() { return JSON.stringify({ a: S.annots, s: S.scales }); }
  function pushUndo(snap) {
    S.undo.push(snap || snapshot());
    if (S.undo.length > 150) S.undo.shift();
    S.redo = [];
    changed();
  }
  function restoreSnap(sn) {
    const o = JSON.parse(sn);
    S.annots = o.a; S.scales = o.s || {};
    const ids = new Set(S.annots.map((a) => a.id));
    for (const id of [...S.sel]) if (!ids.has(id)) S.sel.delete(id);
    updateScaleUI();
    changed();
  }
  function undo() { if (!S.undo.length) return; S.redo.push(snapshot()); restoreSnap(S.undo.pop()); }
  function redo() { if (!S.redo.length) return; S.undo.push(snapshot()); restoreSnap(S.redo.pop()); }

  let autoTimer = null;
  function changed() {
    S.dirty = true;
    drawOverlay();
    refreshPanelsSoon();
    clearTimeout(autoTimer);
    autoTimer = setTimeout(autosave, 1200);
  }
  async function autosave() {
    if (!S.fingerprint) return;
    await LP.store.set('auto:' + S.fingerprint, Object.assign(buildProject(false), { saved: Date.now() }));
  }

  /* ======================= Création d'annotations ======================= */
  function newAnnot(type, pts) {
    const now = new Date().toISOString();
    return {
      id: LP.uid(), page: S.pageNum, type, pts,
      style: Object.assign({}, defaults[type] || defaults.line),
      text: '', comment: '', author: S.author, created: now, modified: now,
    };
  }

  function placeSymbol(p, opt = {}) {
    const sym = S.currentSym;
    if (!sym) { toast('Choisissez un symbole dans la bibliothèque'); return; }
    LP.migrateSym(sym);
    if (sym.mode === 'real' && !env.scaleFor(S.pageNum)) {
      toast("Page non calibrée : taille provisoire (cadre orange). Calibrez (K) ou choisissez l'échelle en bas.", 6000);
    }
    const a = newAnnot('symbol', [p]);
    a.sym = symSnapshot(sym);
    a.mode = sym.mode;
    a.dimL = opt.dimL != null ? opt.dimL : sym.dimL;
    a.dimW = sym.dimW;
    a.rot = opt.rot != null ? opt.rot : symDefaults.rot;
    a.tag = sym.tag || '';
    a.showTag = symDefaults.showTag;
    pushUndo();
    S.annots.push(a);
    changed();
  }
  /*
   * Pose par glisser (formes allongées) : la longueur suit la souris, arrondie
   * au pouce (pi-po) ou au 10 mm (à l'échelle) ; 1/16" ou 1 mm sur papier.
   */
  function symDragResult(d) {
    const sym = S.currentSym;
    if (!sym || LP.isRound(LP.migrateSym(sym))) return null;
    const dx = d.cur[0] - d.start[0], dy = d.cur[1] - d.start[1];
    const distPt = Math.hypot(dx, dy);
    if (distPt * S.zoom < 8) return null;
    const sc = env.scaleFor(S.pageNum);
    const paper = sym.mode !== 'real';
    if (!paper && !sc) return null;
    const IN = 0.0254;
    const step = S.unit === 'ft' ? (paper ? IN / 16 : IN) : (paper ? 0.001 : 0.01);
    let meters = paper ? distPt / LP.PT_PER_M : distPt * sc.mpp;
    meters = Math.max(step, Math.round(meters / step) * step);
    const lenPt = paper ? meters * LP.PT_PER_M : meters / sc.mpp;
    const ux = dx / distPt, uy = dy / distPt;
    return {
      dimL: meters,
      rot: (Math.atan2(dy, dx) * 180) / Math.PI,
      center: [d.start[0] + (ux * lenPt) / 2, d.start[1] + (uy * lenPt) / 2],
      label: LP.fmtDim(meters, S.unit, paper),
    };
  }

  function symSnapshot(sym) {
    const c = Object.assign({}, sym);
    delete c.img; // l'image est stockée une seule fois dans S.images
    return c;
  }

  /* ======================= Interaction souris ======================= */
  let drag = null;      // opération de glisser en cours
  let drawing = null;   // annotation en cours de création
  let hover = null;     // position page du curseur
  let spaceDown = false;
  let editing = null;   // annotation dont le texte est en édition

  function evPos(e) {
    const r = over.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  function tol() { return 5 / S.zoom; }

  function constrain(p0, p, type) {
    if (['rect', 'ellipse', 'cloud', 'highlight', 'text'].includes(type)) {
      const dx = p[0] - p0[0], dy = p[1] - p0[1], m = Math.max(Math.abs(dx), Math.abs(dy));
      return [p0[0] + Math.sign(dx || 1) * m, p0[1] + Math.sign(dy || 1) * m];
    }
    const dx = p[0] - p0[0], dy = p[1] - p0[1];
    const L = Math.hypot(dx, dy);
    const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
    return [p0[0] + L * Math.cos(ang), p0[1] + L * Math.sin(ang)];
  }

  function topHit(x, y) {
    const t = tol();
    for (let i = S.annots.length - 1; i >= 0; i--) {
      const a = S.annots[i];
      if (a.page === S.pageNum && LP.hitAnnotation(a, x, y, t)) return a;
    }
    return null;
  }
  function handleHit(x, y) {
    if (S.sel.size !== 1) return null;
    const a = S.annots.find((q) => S.sel.has(q.id));
    if (!a || a.page !== S.pageNum || ['symbol', 'ink', 'note', 'markup'].includes(a.type)) return null;
    const r = 6 / S.zoom;
    for (let i = 0; i < a.pts.length; i++) if (Math.abs(a.pts[i][0] - x) <= r && Math.abs(a.pts[i][1] - y) <= r) return { a, i };
    return null;
  }

  over.addEventListener('pointerdown', (e) => {
    if (!S.vp) return;
    viewer.focus();
    if (editing) commitText();
    const [sx, sy] = evPos(e);
    const p = toPage(sx, sy);
    over.setPointerCapture(e.pointerId);

    if (e.button === 1 || (e.button === 0 && (spaceDown || S.tool === 'pan'))) {
      drag = { kind: 'pan', sx, sy, pan: { ...S.pan } };
      over.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }
    if (e.button === 2) {
      // Clic droit : termine la polyligne en cours ou revient à la sélection
      if (drawing && MULTI_POINT.has(drawing.type)) finishMulti();
      else if (S.tool !== 'select') setTool('select');
      return;
    }
    if (e.button !== 0) return;

    const tool = S.tool;
    if (tool === 'select') {
      const h = handleHit(...p);
      if (h) { drag = { kind: 'handle', a: h.a, i: h.i, snap: snapshot(), moved: false }; return; }
      const a = topHit(...p);
      if (a) {
        if (e.shiftKey || e.ctrlKey) {
          if (S.sel.has(a.id)) S.sel.delete(a.id); else S.sel.add(a.id);
        } else if (!S.sel.has(a.id)) { S.sel.clear(); S.sel.add(a.id); }
        drag = { kind: 'move', last: p, snap: snapshot(), moved: false, alt: e.altKey };
        refreshProps(); drawOverlay(); highlightList();
        return;
      }
      if (!e.shiftKey) S.sel.clear();
      drag = { kind: 'box', start: p, cur: p, add: e.shiftKey };
      refreshProps(); drawOverlay(); highlightList();
      return;
    }
    if (tool === 'symbol') { drag = { kind: 'symdrag', start: p, cur: p }; return; }
    if (tool === 'note') {
      const a = newAnnot('note', [[p[0], p[1] - LP.NOTE_SIZE]]);
      a.replies = [];
      pushUndo();
      S.annots.push(a);
      setTool('select');
      S.sel.add(a.id);
      changed(); refreshProps();
      const ta = document.querySelector('#props textarea[data-k=comment]');
      if (ta) ta.focus();
      return;
    }
    if (tool === 'ink') {
      drawing = newAnnot('ink', [p]);
      drag = { kind: 'ink' };
      return;
    }
    if (tool === 'callout') {
      drawing = newAnnot('callout', [p, p, p]);
      drag = { kind: 'callout', start: p };
      return;
    }
    if (TWO_POINT.has(tool)) {
      drawing = newAnnot(tool, [p, p]);
      drag = { kind: 'two', start: p };
      return;
    }
    if (MULTI_POINT.has(tool)) {
      let q = p;
      if (drawing && e.shiftKey) q = constrain(drawing.pts[drawing.pts.length - 1], p, 'line');
      if (!drawing) drawing = newAnnot(tool, [q]);
      else {
        const last = drawing.pts[drawing.pts.length - 1];
        if (Math.hypot(last[0] - q[0], last[1] - q[1]) * S.zoom > 2) drawing.pts.push(q);
      }
      drawOverlay();
    }
  });

  over.addEventListener('pointermove', (e) => {
    if (!S.vp) return;
    const [sx, sy] = evPos(e);
    const p = toPage(sx, sy);
    hover = p;
    updatePosStatus(p);
    if (!drag) {
      updateCursor(p);
      if ((S.tool === 'symbol' && S.currentSym) || (drawing && MULTI_POINT.has(drawing.type))) {
        if (drawing && e.shiftKey) hover = constrain(drawing.pts[drawing.pts.length - 1], p, 'line');
        drawOverlay();
      }
      return;
    }
    switch (drag.kind) {
      case 'pan':
        S.pan.x = drag.pan.x + (sx - drag.sx);
        S.pan.y = drag.pan.y + (sy - drag.sy);
        viewChanged();
        break;
      case 'move': {
        const dx = p[0] - drag.last[0], dy = p[1] - drag.last[1];
        if (!drag.moved) {
          if (Math.hypot(dx, dy) * S.zoom < 3) return;
          drag.moved = true;
          if (drag.alt) {
            // Alt + glisser = duplique
            const copies = S.annots.filter((a) => S.sel.has(a.id)).map(cloneAnnot);
            S.annots.push(...copies);
            S.sel = new Set(copies.map((c) => c.id));
          }
        }
        for (const a of S.annots) if (S.sel.has(a.id)) for (const q of a.pts) { q[0] += dx; q[1] += dy; }
        drag.last = p;
        drawOverlay();
        break;
      }
      case 'handle': {
        drag.moved = true;
        let q = p;
        if (e.shiftKey && drag.a.pts.length === 2) q = constrain(drag.a.pts[1 - drag.i], p, drag.a.type);
        drag.a.pts[drag.i] = q;
        drawOverlay();
        break;
      }
      case 'box':
        drag.cur = p; drawOverlay(); break;
      case 'symdrag':
        drag.cur = e.shiftKey ? constrain(drag.start, p, 'line') : p;
        drawOverlay(); break;
      case 'two':
        drawing.pts[1] = e.shiftKey ? constrain(drag.start, p, drawing.type) : p;
        drawOverlay(); break;
      case 'callout':
        drawing.pts[1] = p;
        drawing.pts[2] = [p[0] + 140, p[1] + 36];
        drawOverlay(); break;
      case 'ink': {
        const last = drawing.pts[drawing.pts.length - 1];
        if (Math.hypot(last[0] - p[0], last[1] - p[1]) * S.zoom > 1.5) { drawing.pts.push(p); drawOverlay(); }
        break;
      }
    }
  });

  over.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    over.style.cursor = '';
    switch (d.kind) {
      case 'pan': updateCursor(hover); break;
      case 'move':
      case 'handle':
        if (d.moved) { pushUndo(d.snap); touch(); }
        break;
      case 'symdrag': {
        const r = symDragResult(d);
        if (r) placeSymbol(r.center, { dimL: r.dimL, rot: Math.round(r.rot * 10) / 10 });
        else placeSymbol(d.start);
        break;
      }
      case 'box': {
        const [x0, y0] = d.start, [x1, y1] = d.cur;
        const bx = Math.min(x0, x1), by = Math.min(y0, y1), bw = Math.abs(x1 - x0), bh = Math.abs(y1 - y0);
        if (bw * S.zoom > 3 || bh * S.zoom > 3) {
          for (const a of S.annots) {
            if (a.page !== S.pageNum) continue;
            const [x, y, w, h] = LP.bboxAnnotation(a);
            if (x >= bx && y >= by && x + w <= bx + bw && y + h <= by + bh) S.sel.add(a.id);
          }
        }
        refreshProps(); highlightList(); drawOverlay();
        break;
      }
      case 'two': finishTwo(); break;
      case 'callout': {
        const a = drawing;
        const len = Math.hypot(a.pts[1][0] - a.pts[0][0], a.pts[1][1] - a.pts[0][1]);
        if (len * S.zoom < 4) { a.pts[1] = [a.pts[0][0] + 30, a.pts[0][1] - 40]; }
        const w = 140, h = 36;
        a.pts[2] = [a.pts[1][0] + w, a.pts[1][1] + h];
        commitDrawing(a);
        startTextEdit(a);
        break;
      }
      case 'ink':
        if (drawing.pts.length > 1) commitDrawing(drawing); else { drawing = null; drawOverlay(); }
        break;
    }
  });

  over.addEventListener('dblclick', (e) => {
    if (drawing && MULTI_POINT.has(drawing.type)) {
      // Le 2e clic du double-clic a ajouté un point en double : on le retire
      if (drawing.pts.length > 2) drawing.pts.pop();
      finishMulti();
      return;
    }
    if (S.tool !== 'select') return;
    const p = toPage(...evPos(e));
    const a = topHit(...p);
    if (!a) return;
    if (a.type === 'text' || a.type === 'callout') startTextEdit(a);
    else if (a.type === 'symbol') {
      const t = prompt('Étiquette (type de luminaire) :', a.tag || '');
      if (t != null) { pushUndo(); a.tag = t; touch(a); changed(); refreshProps(); }
    } else {
      const t = prompt('Commentaire :', a.comment || '');
      if (t != null) { pushUndo(); a.comment = t; touch(a); changed(); refreshProps(); }
    }
  });

  over.addEventListener('contextmenu', (e) => e.preventDefault());
  over.addEventListener('pointerleave', () => { hover = null; drawOverlay(); });

  viewer.addEventListener('wheel', (e) => {
    if (!S.vp) return;
    e.preventDefault();
    const [sx, sy] = evPos(e);
    if (e.shiftKey) { S.pan.x -= e.deltaY; viewChanged(); return; }
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    zoomAt(Math.pow(1.0018, -dy), sx, sy);
  }, { passive: false });

  function touch(a) {
    const now = new Date().toISOString();
    if (a) a.modified = now;
    else for (const q of S.annots) if (S.sel.has(q.id)) q.modified = now;
  }

  function finishTwo() {
    const a = drawing;
    const [p, q] = a.pts;
    const small = Math.hypot(q[0] - p[0], q[1] - p[1]) * S.zoom < 4;
    if (a.type === 'text') {
      if (small) a.pts[1] = [p[0] + 160, p[1] + 30];
      commitDrawing(a);
      startTextEdit(a);
      return;
    }
    if (small) { drawing = null; drawOverlay(); return; }
    if (a.type === 'calibrate') {
      drawing = null;
      calibrate(a);
      return;
    }
    commitDrawing(a);
  }

  function finishMulti(cancel) {
    if (!drawing || !MULTI_POINT.has(drawing.type)) return;
    const a = drawing;
    const min = a.type === 'polygon' || a.type === 'area' ? 3 : 2;
    if (cancel || a.pts.length < min) { drawing = null; drawOverlay(); return; }
    commitDrawing(a);
  }

  function commitDrawing(a) {
    drawing = null;
    pushUndo();
    S.annots.push(a);
    S.sel.clear();
    if (S.tool === 'select') S.sel.add(a.id);
    changed();
    refreshProps();
  }

  function calibrate(line) {
    const [p, q] = line.pts;
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const cur = S.scales[S.pageNum];
    const hint = cur ? ` (actuel : ${LP.fmtLength(d * cur.mpp, cur.unit)})` : '';
    const v = prompt(`Longueur réelle de la ligne tracée${hint}\nEx. : 10' ; 12'-6" ; 3,5 m ; 3500 mm`, '');
    if (v == null) { drawOverlay(); return; }
    const r = LP.parseLength(v);
    if (!r || r.meters <= 0) { alert('Longueur non reconnue.'); drawOverlay(); return; }
    pushUndo();
    S.scales[S.pageNum] = { mpp: r.meters / d, unit: r.unit === 'mm' ? 'mm' : r.unit, label: 'Calibrée' };
    S.unit = S.scales[S.pageNum].unit;
    updateScaleUI();
    changed();
    toast('Échelle calibrée pour la page ' + S.pageNum);
    setTool('length');
  }

  /* ======================= Édition de texte ======================= */
  function startTextEdit(a) {
    editing = a;
    editor.value = a.text || '';
    editor.style.display = 'block';
    positionEditor();
    drawOverlay();
    editing.snap = snapshot();
    editor.focus();
    editor.select();
    // Second essai au cas où le navigateur redonne le focus au canevas
    setTimeout(() => { if (editing === a && document.activeElement !== editor) editor.focus(); }, 0);
  }
  function positionEditor() {
    if (!editing) return;
    const a = editing;
    const box = a.type === 'callout' ? [a.pts[1], a.pts[2]] : [a.pts[0], a.pts[1]];
    const [x0, y0] = toScreen(Math.min(box[0][0], box[1][0]), Math.min(box[0][1], box[1][1]));
    const [x1, y1] = toScreen(Math.max(box[0][0], box[1][0]), Math.max(box[0][1], box[1][1]));
    const fs = (a.style.fontSize || 10) * S.zoom;
    Object.assign(editor.style, {
      left: x0 + 'px', top: y0 + 'px', width: Math.max(x1 - x0, 40) + 'px', height: Math.max(y1 - y0, fs * 1.6) + 'px',
      fontSize: fs + 'px', color: a.style.textColor || a.style.stroke, padding: (a.style.fontSize || 10) * 0.35 * S.zoom + 'px',
    });
  }
  function commitText() {
    if (!editing) return;
    const a = editing;
    const snap = a.snap; delete a.snap;
    editing = null;
    if (document.activeElement === editor) viewer.focus();
    editor.style.display = 'none';
    if (editor.value !== a.text) {
      S.undo.push(snap);
      a.text = editor.value;
      touch(a);
      // Agrandit la boîte si le texte dépasse
      autoGrow(a);
      changed();
    }
    drawOverlay();
    refreshProps();
  }
  function autoGrow(a) {
    const R = new LP.CanvasRenderer(octx);
    const i0 = a.type === 'callout' ? 1 : 0;
    const p = a.pts[i0], q = a.pts[i0 + 1];
    const fs = a.style.fontSize || 10;
    const w = Math.abs(q[0] - p[0]);
    let lines = 0;
    for (const para of (a.text || '').split('\n')) {
      let line = '';
      lines++;
      for (const word of para.split(/\s+/)) {
        const t = line ? line + ' ' + word : word;
        if (line && R.measure(t, fs) > w - fs * 0.7) { lines++; line = word; } else line = t;
      }
    }
    const need = lines * fs * 1.15 + fs * 0.7;
    const top = Math.min(p[1], q[1]);
    if (Math.abs(q[1] - p[1]) < need) { if (q[1] >= p[1]) q[1] = top + need; else p[1] = top + need; }
  }
  editor.addEventListener('keydown', (e) => {
    if (!editing) return;
    e.stopPropagation();
    if (e.key === 'Escape') { editor.value = editing ? editing.text : ''; commitText(); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commitText();
  });
  editor.addEventListener('blur', () => commitText());

  /* ======================= Clavier ======================= */
  window.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const inField = tag === 'input' || tag === 'textarea' || tag === 'select';
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(e.shiftKey); return; }
    if (ctrl && e.key.toLowerCase() === 'o') { e.preventDefault(); $('#filePdf').click(); return; }
    if (inField) return;
    if (ctrl) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
      else if (k === 'c') copySel();
      else if (k === 'v') paste();
      else if (k === 'd') { e.preventDefault(); copySel(); paste(); }
      else if (k === 'a') { e.preventDefault(); S.annots.forEach((a) => a.page === S.pageNum && S.sel.add(a.id)); refreshProps(); drawOverlay(); }
      return;
    }
    if (e.key === ' ') { spaceDown = true; over.style.cursor = 'grab'; e.preventDefault(); return; }
    if (e.key === 'Escape') {
      if (drawing) { drawing = null; drawOverlay(); }
      else if (S.tool !== 'select') setTool('select');
      else { S.sel.clear(); refreshProps(); drawOverlay(); }
      return;
    }
    if (e.key === 'Enter' && drawing) { finishMulti(); return; }
    if (e.key === 'Backspace' && drawing && MULTI_POINT.has(drawing.type)) {
      drawing.pts.pop(); if (!drawing.pts.length) drawing = null; drawOverlay(); e.preventDefault(); return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel.size) { deleteSel(); e.preventDefault(); return; }
    if (e.key === 'PageDown') { goPage(S.pageNum + 1); return; }
    if (e.key === 'PageUp') { goPage(S.pageNum - 1); return; }
    if (e.key === '+' || e.key === '=') { zoomAt(1.25, vw / 2, vh / 2); return; }
    if (e.key === '-') { zoomAt(0.8, vw / 2, vh / 2); return; }
    if (e.key === '0') { fitPage(); viewChanged(); return; }
    if (e.key.startsWith('Arrow') && S.sel.size) {
      const st = (e.shiftKey ? 10 : 1);
      const dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0;
      const dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
      pushUndo();
      for (const a of S.annots) if (S.sel.has(a.id)) for (const q of a.pts) { q[0] += dx; q[1] += dy; }
      touch(); changed(); e.preventDefault();
      return;
    }
    if (e.key === '[' || e.key === ']') {
      const d = e.key === ']' ? 15 : -15;
      const syms = S.annots.filter((a) => S.sel.has(a.id) && a.type === 'symbol');
      if (syms.length) { pushUndo(); syms.forEach((a) => (a.rot = ((a.rot || 0) + d + 360) % 360)); touch(); changed(); refreshProps(); }
      else if (S.tool === 'symbol') { symDefaults.rot = (symDefaults.rot + d + 360) % 360; drawOverlay(); refreshProps(); }
      return;
    }
    const t = TOOLS.find((x) => x !== 'sep' && x.key === e.key.toLowerCase());
    if (t && !e.altKey) setTool(t.id);
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === ' ') { spaceDown = false; updateCursor(hover); }
  });

  function deleteSel() {
    pushUndo();
    S.annots = S.annots.filter((a) => !S.sel.has(a.id));
    S.sel.clear();
    changed(); refreshProps();
  }
  // Copie indépendante : nouvel identifiant, sans lien vers l'objet PDF d'origine ni ses réponses
  function cloneAnnot(src) {
    const a = JSON.parse(JSON.stringify(src));
    a.id = LP.uid();
    delete a.src; delete a.srcStamp;
    a.replies = [];
    a.author = S.author;
    return a;
  }

  function copySel() {
    S.clipboard = S.annots.filter((a) => S.sel.has(a.id)).map((a) => JSON.parse(JSON.stringify(a)));
    if (S.clipboard.length) toast(`${S.clipboard.length} annotation(s) copiée(s)`);
  }
  function paste() {
    if (!S.clipboard.length) return;
    pushUndo();
    const samePage = S.clipboard.every((a) => a.page === S.pageNum);
    const off = samePage ? 12 : 0;
    S.sel.clear();
    for (const c of S.clipboard) {
      const a = cloneAnnot(c);
      a.page = S.pageNum;
      a.pts.forEach((q) => { q[0] += off; q[1] += off; });
      a.created = a.modified = new Date().toISOString();
      S.annots.push(a); S.sel.add(a.id);
    }
    S.clipboard.forEach((c) => { c.pts.forEach((q) => { q[0] += off; q[1] += off; }); c.page = S.pageNum; });
    changed(); refreshProps();
  }

  function updateCursor(p) {
    if (spaceDown || S.tool === 'pan') { over.style.cursor = 'grab'; return; }
    if (S.tool === 'select' && p) {
      over.style.cursor = handleHit(...p) ? 'crosshair' : topHit(...p) ? 'move' : 'default';
      return;
    }
    over.style.cursor = S.tool === 'symbol' || S.tool === 'note' ? 'copy' : 'crosshair';
  }

  function updatePosStatus(p) {
    const sc = env.scaleFor(S.pageNum);
    if (sc) {
      $('#statusPos').textContent = `x ${LP.fmtLength(p[0] * sc.mpp, sc.unit)}   y ${LP.fmtLength(p[1] * sc.mpp, sc.unit)}`;
    } else $('#statusPos').textContent = `x ${p[0].toFixed(0)} pt   y ${p[1].toFixed(0)} pt`;
  }

  /* ======================= Outils ======================= */
  function buildToolbar() {
    const nav = $('#tools');
    nav.innerHTML = '';
    for (const t of TOOLS) {
      if (t === 'sep') { const s = document.createElement('span'); s.className = 'sep'; nav.appendChild(s); continue; }
      const b = document.createElement('button');
      b.dataset.tool = t.id;
      b.title = `${t.label} (${t.key.toUpperCase()})`;
      b.innerHTML = `<svg viewBox="0 0 24 24">${t.icon}</svg><span class="lbl">${t.label}</span>`;
      b.addEventListener('click', () => setTool(t.id));
      nav.appendChild(b);
    }
  }
  function setTool(id) {
    commitText();
    if (drawing && MULTI_POINT.has(drawing.type)) finishMulti();
    drawing = null;
    S.tool = id;
    if (id !== 'select') { S.sel.clear(); }
    $$('#tools button').forEach((b) => b.classList.toggle('active', b.dataset.tool === id));
    const t = TOOLS.find((x) => x.id === id);
    const hints = {
      select: 'Cliquer pour sélectionner, glisser pour déplacer, Alt+glisser pour dupliquer',
      symbol: 'Cliquer pour placer le symbole. [ ] pour pivoter. Échap pour terminer',
      polyline: 'Cliquer pour ajouter des points ; double-clic ou Entrée pour terminer',
      polygon: 'Cliquer pour ajouter des points ; double-clic ou Entrée pour terminer',
      polylength: 'Cliquer pour ajouter des points ; double-clic ou Entrée pour terminer',
      area: 'Cliquer pour ajouter des sommets ; double-clic ou Entrée pour terminer',
      calibrate: 'Tracer une ligne sur une cote connue, puis saisir sa longueur réelle',
      callout: 'Glisser de la pointe vers l\'emplacement du texte',
      note: 'Cliquer pour placer une note (commentaire), puis écrire dans le panneau de droite',
    };
    $('#statusTool').textContent = `${t ? t.label : ''} — ${hints[id] || 'Glisser pour dessiner (Maj = contraindre)'}`;
    updateCursor(hover);
    refreshProps();
    drawOverlay();
    renderSymbolList();
  }

  /* ======================= Propriétés ======================= */
  const SWATCHES = ['#d00000', '#ff7a00', '#ffd400', '#007a33', '#0050c8', '#7a2cc9', '#000000', '#7f7f7f', '#ffffff'];

  function refreshProps() {
    const box = $('#props');
    const sel = S.annots.filter((a) => S.sel.has(a.id));
    let target, title, isDefaults = false;
    if (sel.length) {
      target = sel;
      const types = new Set(sel.map((a) => a.type));
      title = sel.length === 1 ? LP.TYPE_LABELS[sel[0].type] : `${sel.length} annotations`;
      if (types.size > 1) title += ' (mixte)';
    } else if (S.tool !== 'select' && S.tool !== 'pan') {
      isDefaults = true;
      title = `Par défaut : ${LP.TYPE_LABELS[S.tool] || S.tool}`;
    } else {
      $('#propTitle').textContent = 'Propriétés';
      box.innerHTML = `<p class="hint">Sélectionnez une annotation ou un outil pour modifier ses propriétés.</p>
        <p class="hint"><b>Astuce éclairage :</b> calibrez l'échelle (K), puis placez vos luminaires avec l'outil Symbole (S). Le décompte par type s'affiche dans l'onglet <i>Annotations</i> et s'exporte en CSV.</p>`;
      return;
    }
    $('#propTitle').textContent = title;
    const first = isDefaults ? null : target[0];
    const type = isDefaults ? S.tool : first.type;
    const st = isDefaults ? (defaults[type] || {}) : first.style;
    const types = isDefaults ? new Set([type]) : new Set(target.map((a) => a.type));
    const allSym = [...types].every((t) => t === 'symbol');
    const anyText = [...types].some((t) => t === 'text' || t === 'callout');
    const hasFill = [...types].some((t) => ['rect', 'ellipse', 'cloud', 'polygon', 'area', 'text', 'callout', 'highlight'].includes(t));
    const hasFont = [...types].some((t) => ['text', 'callout', 'length', 'polylength', 'area'].includes(t));

    let h = '';
    if (allSym) {
      const sym = isDefaults ? S.currentSym : first.sym;
      const tagVal = isDefaults ? (S.currentSym ? S.currentSym.tag : '') : first.tag;
      const dsym = sym ? LP.migrateSym(sym) : null;
      const legacy = !isDefaults && first.dimL == null && first.size != null;
      const mode = isDefaults ? (dsym && dsym.mode) : (first.mode || (legacy ? 'paper' : dsym.mode));
      const sz = !isDefaults ? LP.symbolSize(first.sym, first, env.scaleFor(first.page)) : null;
      const dimL = isDefaults ? dsym && dsym.dimL : (legacy ? sz.w / LP.PT_PER_M : (first.dimL != null ? first.dimL : dsym.dimL));
      const dimW = isDefaults ? dsym && dsym.dimW : (legacy ? sz.h / LP.PT_PER_M : (first.dimW != null ? first.dimW : dsym.dimW));
      const round = dsym && LP.isRound(dsym);
      const paper = mode !== 'real';
      const rotVal = isDefaults ? symDefaults.rot : first.rot || 0;
      const show = isDefaults ? symDefaults.showTag : first.showTag !== false;
      h += `<p class="hint">${sym ? esc(sym.name) : 'Aucun symbole choisi'}</p>`;
      if (!isDefaults) h += `<label>Étiquette <input type="text" data-k="tag" value="${esc(tagVal || '')}"></label>`;
      const ph = S.unit === 'ft' ? (paper ? 'ex. 1/4"' : `ex. 4' ou 48"`) : (paper ? 'ex. 6 mm' : 'ex. 1200 mm');
      h += `<label>Dimension <select data-k="mode">
              <option value="real" ${!paper ? 'selected' : ''}>À l'échelle réelle</option>
              <option value="paper" ${paper ? 'selected' : ''}>Taille sur papier</option></select></label>
            <label>${round ? 'Diamètre' : 'Longueur'} <input type="text" data-k="dimL" placeholder="${esc(ph)}" value="${esc(LP.fmtDim(dimL, S.unit, paper))}"></label>
            ${round ? '' : `<label>Largeur <input type="text" data-k="dimW" placeholder="${esc(ph)}" value="${esc(LP.fmtDim(dimW, S.unit, paper))}"></label>`}
            <p class="hint">${paper ? 'Taille fixe sur la feuille imprimée, quelle que soit l\'échelle.'
              : (env.scaleFor(isDefaults ? S.pageNum : first.page) ? 'Converti selon l\'échelle de la page.'
                : '<b style="color:#c25e00">Page non calibrée</b> : taille provisoire. Calibrez (K) ou choisissez l\'échelle en bas.')}
              ${!round && isDefaults ? '<br>Astuce : cliquer-glisser pour poser à la longueur voulue.' : ''}</p>
            <label>Rotation (°) <input type="number" data-k="rot" step="15" value="${rotVal}"></label>
            <label class="inline"><input type="checkbox" data-k="showTag" ${show ? 'checked' : ''}> Afficher l'étiquette</label>`;
      if (!isDefaults) h += `<label>Opacité <input type="number" data-k="style.opacity" min="0.1" max="1" step="0.1" value="${st.opacity ?? 1}"></label>`;
    } else {
      h += colorField('Couleur', 'style.stroke', st.stroke || '#d00000');
      if (anyText) h += colorField('Couleur texte', 'style.textColor', st.textColor || st.stroke || '#d00000');
      if (hasFill) {
        const none = !st.fill || st.fill === 'none';
        h += `<label>Remplissage <span class="color-row"><input type="color" data-k="style.fill" value="${none ? '#ffffff' : st.fill}" ${none ? 'disabled' : ''}>
              <label class="inline"><input type="checkbox" data-k="nofill" ${none ? 'checked' : ''}> aucun</label></span></label>`;
      }
      h += `<label>Épaisseur (pt) <input type="number" data-k="style.width" min="0" max="50" step="0.25" value="${st.width ?? 1}"></label>
            <label>Opacité <input type="number" data-k="style.opacity" min="0.05" max="1" step="0.05" value="${st.opacity ?? 1}"></label>
            <label>Trait <select data-k="style.dash">
              <option value="solid" ${st.dash === 'solid' || !st.dash ? 'selected' : ''}>Plein</option>
              <option value="dash" ${st.dash === 'dash' ? 'selected' : ''}>Tirets</option>
              <option value="dot" ${st.dash === 'dot' ? 'selected' : ''}>Pointillé</option></select></label>`;
      if (types.has('cloud')) h += `<label>Taille arcs <input type="number" data-k="style.arc" min="3" max="100" step="1" value="${st.arc || 14}"></label>`;
      if (hasFont) h += `<label>Police (pt) <input type="number" data-k="style.fontSize" min="4" max="144" step="1" value="${st.fontSize || 10}"></label>`;
      if (!isDefaults && anyText && target.length === 1) h += `<label class="full"><span>Texte</span><textarea data-k="text">${esc(first.text || '')}</textarea></label>`;
    }
    if (!isDefaults) {
      if (target.length === 1) {
        h += `<label class="full"><span>Commentaire</span><textarea data-k="comment" placeholder="Note, statut, question…">${esc(first.comment || '')}</textarea></label>`;
        const desc = LP.describeAnnotation(first, env);
        h += `<p class="hint">${desc && !['text', 'callout', 'note'].includes(first.type) ? '<b>' + esc(desc) + '</b><br>' : ''}Auteur : <b>${esc(first.author || '—')}</b><br>Modifié : ${fmtDate(first.modified)}${first.src ? '<br><i>Annotation d\'origine du PDF</i>' : ''}</p>`;
        h += `<div class="thread"><h3>Réponses (${(first.replies || []).length})</h3>`;
        (first.replies || []).forEach((r, i) => {
          h += `<div class="reply"><div class="rh"><b>${esc(r.author || '—')}</b> <small>${fmtDate(r.modified || r.created)}</small>${r.state ? ` <small class="state">${esc(r.state)}</small>` : ''}<button data-rdel="${i}" title="Supprimer la réponse">✕</button></div>
            <textarea data-r="${i}">${esc(r.text || '')}</textarea></div>`;
        });
        h += `<textarea id="newReply" placeholder="Écrire une réponse…"></textarea><div class="row"><button id="btnReply" class="primary">Répondre</button></div></div>`;
      }
      h += `<div class="row"><button data-act="front">Premier plan</button><button data-act="back">Arrière-plan</button><button data-act="del">Supprimer</button></div>`;
      if (!allSym) h += `<div class="row"><button data-act="setdef">Définir comme style par défaut</button></div>`;
    }
    box.innerHTML = h;

    // Événements
    box.querySelectorAll('[data-k]').forEach((el) => {
      const k = el.dataset.k;
      const evt = el.tagName === 'TEXTAREA' || el.type === 'text' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        let v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? parseFloat(el.value) : el.value;
        if (el.type === 'number' && !isFinite(v)) return;
        applyProp(k, v, target, isDefaults, el);
      });
    });
    if (!isDefaults && target.length === 1) {
      const a = target[0];
      box.querySelectorAll('textarea[data-r]').forEach((ta) => ta.addEventListener('change', () => {
        const r = a.replies[+ta.dataset.r];
        pushUndo();
        r.text = ta.value; r.modified = new Date().toISOString();
        changed();
      }));
      box.querySelectorAll('[data-rdel]').forEach((b) => b.addEventListener('click', () => {
        if (!confirm('Supprimer cette réponse ?')) return;
        pushUndo();
        a.replies.splice(+b.dataset.rdel, 1);
        changed(); refreshProps();
      }));
      const btn = box.querySelector('#btnReply');
      if (btn) btn.addEventListener('click', () => {
        const t = box.querySelector('#newReply').value.trim();
        if (!t) return;
        if (!S.author && !confirm("Aucun nom d'auteur n'est défini (en haut à droite). Répondre quand même ?")) return;
        pushUndo();
        const now = new Date().toISOString();
        (a.replies = a.replies || []).push({ id: LP.uid(), author: S.author, text: t, created: now, modified: now });
        changed(); refreshProps();
      });
    }
    box.querySelectorAll('.swatches span').forEach((sp) => sp.addEventListener('click', () => {
      applyProp(sp.parentElement.dataset.k, sp.dataset.c, target, isDefaults);
      refreshProps();
    }));
    box.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
      const act = b.dataset.act;
      if (act === 'del') deleteSel();
      if (act === 'front' || act === 'back') {
        pushUndo();
        const moving = S.annots.filter((a) => S.sel.has(a.id));
        const rest = S.annots.filter((a) => !S.sel.has(a.id));
        S.annots = act === 'front' ? rest.concat(moving) : moving.concat(rest);
        changed();
      }
      if (act === 'setdef') {
        for (const a of target) defaults[a.type] = Object.assign({}, a.style);
        saveDefaults();
        toast('Style par défaut mis à jour');
      }
    }));
  }

  function fmtDate(iso) { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleString('fr-CA'); }

  function colorField(label, k, v) {
    return `<label>${label} <input type="color" data-k="${k}" value="${v}"></label>
      <div class="swatches" data-k="${k}">${SWATCHES.map((c) => `<span data-c="${c}" style="background:${c}"></span>`).join('')}</div>`;
  }

  let propSnapTimer = null, propSnap = null;
  function applyProp(k, v, target, isDefaults, el) {
    if (isDefaults) {
      if (S.tool === 'symbol') {
        if (k === 'rot') symDefaults.rot = v;
        else if (k === 'showTag') symDefaults.showTag = v;
        else if (S.currentSym && (k === 'mode' || k === 'dimL' || k === 'dimW')) {
          const sym = LP.migrateSym(S.currentSym);
          if (!setSymDim(sym, k, v, env.scaleFor(S.pageNum), null)) return;
          saveLibrary(); renderSymbolList(); refreshProps();
        }
        drawOverlay();
        return;
      }
      const d = defaults[S.tool] || (defaults[S.tool] = {});
      if (k === 'nofill') { d.fill = v ? 'none' : '#ffffff'; refreshProps(); }
      else if (k.startsWith('style.')) d[k.slice(6)] = v;
      saveDefaults();
      return;
    }
    // Regroupe les modifications rapides (curseur, couleur) en une seule étape d'annulation
    if (!propSnap) propSnap = snapshot();
    clearTimeout(propSnapTimer);
    propSnapTimer = setTimeout(() => { pushUndo(propSnap); propSnap = null; }, 600);
    if (k === 'mode' || k === 'dimL' || k === 'dimW') {
      const snap = snapshot();
      let ok = true;
      for (const a of target) {
        if (a.type !== 'symbol') continue;
        if (!setSymDim(a, k, v, env.scaleFor(a.page), a.sym)) { ok = false; break; }
        touch(a);
      }
      if (ok) pushUndo(snap); else restoreSnap(snap);
      refreshProps(); drawOverlay(); refreshPanelsSoon();
      return;
    }
    for (const a of target) {
      if (k === 'nofill') {
        a.style.fill = v ? 'none' : a.style.fill && a.style.fill !== 'none' ? a.style.fill : '#ffffff';
      } else if (k.startsWith('style.')) a.style[k.slice(6)] = v;
      else a[k] = v;
      touch(a);
    }
    if (k === 'nofill') refreshProps();
    if (k === 'text') target.forEach(autoGrow);
    drawOverlay();
    refreshPanelsSoon();
    S.dirty = true;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(autosave, 1200);
  }

  /*
   * Modifie mode / longueur / largeur d'un symbole (définition de bibliothèque
   * si sym = null, sinon annotation placée). Retourne false si la saisie est invalide.
   */
  function setSymDim(o, k, v, scale, sym) {
    const def = LP.migrateSym(sym || o);
    // Anciennes annotations (taille en points) : on passe en dimensions papier
    if (sym && o.dimL == null && o.size != null) {
      const sz = LP.symbolSize(sym, o, scale);
      o.mode = 'paper'; o.dimL = sz.w / LP.PT_PER_M; o.dimW = sz.h / LP.PT_PER_M; delete o.size;
    }
    const mode = o.mode || def.mode;
    if (k === 'mode') {
      if (v === mode) return true;
      // Conserve la taille visible actuelle en changeant de mode
      const sz = LP.symbolSize(def, sym ? o : null, scale);
      if (v === 'real' && scale && !sz.provisional) { o.dimL = sz.w * scale.mpp; o.dimW = sz.h * scale.mpp; }
      else if (v === 'paper' && !sz.provisional) { o.dimL = sz.w / LP.PT_PER_M; o.dimW = sz.h / LP.PT_PER_M; }
      o.mode = v;
      return true;
    }
    const m = LP.parseDim(v, S.unit, mode !== 'real');
    if (m == null || !(m > 0)) { alert(`Dimension non reconnue : « ${v} »\nExemples : 4'  48"  2'-6 1/2"  1/4"  1200 mm  0,6 m`); return false; }
    if (sym && o.mode == null) o.mode = mode;
    if (k === 'dimL') { if (sym && o.dimW == null) o.dimW = def.dimW; o.dimL = m; if (LP.isRound(def)) o.dimW = m; }
    else { if (sym && o.dimL == null) o.dimL = def.dimL; o.dimW = m; }
    return true;
  }

  function saveDefaults() { LP.store.set('defaults', defaults); }

  /* ======================= Bibliothèque de symboles ======================= */
  async function loadLibrary() {
    const u = await LP.store.get('unit');
    if (u) S.unit = u;
    const lib = await LP.store.get('library');
    S.library = lib && lib.length ? lib : JSON.parse(JSON.stringify(LP.DEFAULT_SYMBOLS));
    // Migration : anciens symboles en points → dimensions réelles / papier
    let migrated = false;
    S.library = S.library.map((s) => {
      if (s.dimL != null && s.mode) return s;
      migrated = true;
      const def = s.builtin && LP.DEFAULT_SYMBOLS.find((d) => d.id === s.id);
      return def ? JSON.parse(JSON.stringify(def)) : LP.migrateSym(s);
    });
    if (migrated) await LP.store.set('library', S.library);
    collapsedCats = new Set((await LP.store.get('collapsedCats')) || []);
    const imgs = await LP.store.get('libImages');
    S.images = Object.assign({}, imgs || {});
    loadImageEls();
    S.currentSym = S.library[0] || null;
    const d = await LP.store.get('defaults');
    if (d) defaults = Object.assign(JSON.parse(JSON.stringify(DEFAULT_STYLE)), d);
    S.author = (await LP.store.get('author')) || '';
    $('#authorInput').value = S.author;
  }
  function saveLibrary() {
    LP.store.set('library', S.library);
    const used = {};
    for (const s of S.library) for (const id of LP.symImageIds(s)) if (S.images[id]) used[id] = S.images[id];
    LP.store.set('libImages', used);
  }
  function loadImageEls() {
    for (const [id, url] of Object.entries(S.images)) {
      if (S.imgEls[id] && S.imgEls[id].src === url) continue;
      const img = new Image();
      img.onload = () => { drawOverlay(); renderSymbolList(); };
      img.src = url;
      S.imgEls[id] = img;
    }
  }

  function symThumb(sym, w = 40, h = 32) {
    const c = document.createElement('canvas');
    c.width = w * 2; c.height = h * 2;
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
    const [sw, sh] = fitSym(sym, w - 6, h - 6);
    const R = new LP.CanvasRenderer(ctx, S.imgEls);
    LP.drawSymbol(R, sym, { x: w / 2, y: h / 2, w: sw, h: sh, rot: 0, showTag: false, lineWidth: 1 });
    return c;
  }
  // Proportions réelles du symbole, ajustées dans une boîte maxW × maxH
  function fitSym(sym, maxW, maxH) {
    const d = LP.migrateSym(sym);
    const L = d.dimL || 1, W = LP.isRound(d) ? L : (d.dimW || L);
    const k = Math.min(maxW / L, maxH / W);
    return [L * k, Math.max(W * k, 1.5)];
  }

  /* ----- Organisation de la bibliothèque (glisser-déposer) ----- */
  const catOf = (s) => s.cat || 'Divers';
  let collapsedCats = new Set();
  let dragSym = null; // { type: 'sym', id } ou { type: 'cat', cat }

  // Déplace un symbole avant / après un autre ; il prend la catégorie de la cible
  function moveSymNear(id, targetId, after) {
    if (id === targetId) return;
    const i = S.library.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [sym] = S.library.splice(i, 1);
    let j = S.library.findIndex((x) => x.id === targetId);
    if (j < 0) { S.library.splice(i, 0, sym); return; }
    sym.cat = catOf(S.library[j]);
    S.library.splice(after ? j + 1 : j, 0, sym);
  }
  // Déplace un symbole à la fin d'une catégorie (existante ou nouvelle)
  function moveSymToCat(id, cat) {
    const i = S.library.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [sym] = S.library.splice(i, 1);
    sym.cat = cat;
    let last = -1;
    S.library.forEach((x, k) => { if (catOf(x) === cat) last = k; });
    S.library.splice(last >= 0 ? last + 1 : S.library.length, 0, sym);
    collapsedCats.delete(cat);
  }
  // Déplace toute une catégorie avant (ou après) une autre
  function moveCat(cat, targetCat, after) {
    if (cat === targetCat) return;
    const block = S.library.filter((x) => catOf(x) === cat);
    const rest = S.library.filter((x) => catOf(x) !== cat);
    let j;
    if (after) { j = -1; rest.forEach((x, k) => { if (catOf(x) === targetCat) j = k; }); j += 1; }
    else j = rest.findIndex((x) => catOf(x) === targetCat);
    if (j < 0) j = rest.length;
    rest.splice(j, 0, ...block);
    S.library = rest;
  }
  // Monter / descendre d'un cran (boutons ▲ ▼) ; franchit les limites de catégorie
  function stepSym(id, dir) {
    const i = S.library.findIndex((x) => x.id === id);
    const sym = S.library[i];
    const cats = [...new Set(S.library.map(catOf))];
    const same = S.library.map((x, k) => [x, k]).filter(([x]) => catOf(x) === catOf(sym)).map(([, k]) => k);
    const pos = same.indexOf(i);
    if (dir < 0 && pos > 0) moveSymNear(id, S.library[same[pos - 1]].id, false);
    else if (dir > 0 && pos < same.length - 1) moveSymNear(id, S.library[same[pos + 1]].id, true);
    else {
      // Passe dans la catégorie voisine
      const ci = cats.indexOf(catOf(sym)) + dir;
      if (ci < 0 || ci >= cats.length) return;
      const target = cats[ci];
      const members = S.library.filter((x) => catOf(x) === target);
      if (dir < 0) moveSymNear(id, members[members.length - 1].id, true);
      else moveSymNear(id, members[0].id, false);
    }
  }
  function libChanged() { saveLibrary(); renderSymbolList(); }
  function clearDropMarks() { $$('#symbolList .drop-before, #symbolList .drop-after, #symbolList .drop-into').forEach((e) => e.classList.remove('drop-before', 'drop-after', 'drop-into')); }

  function renderSymbolList() {
    const list = $('#symbolList');
    const f = ($('#symFilter').value || '').toLowerCase();
    list.innerHTML = '';
    const cats = {};
    for (const s of S.library) {
      if (f && !(`${s.name} ${s.tag} ${s.cat} ${s.inner}`.toLowerCase().includes(f))) continue;
      (cats[catOf(s)] = cats[catOf(s)] || []).push(s);
    }
    for (const [cat, syms] of Object.entries(cats)) {
      const collapsed = collapsedCats.has(cat) && !f;
      const h = document.createElement('div');
      h.className = 'sym-cat';
      h.draggable = true;
      h.dataset.cat = cat;
      h.title = 'Glisser pour déplacer la catégorie · double-clic pour renommer · clic pour replier';
      h.innerHTML = `<span class="tw">${collapsed ? '▸' : '▾'}</span><span class="cn">${esc(cat)}</span><span class="cc">${syms.length}</span>`;
      h.addEventListener('click', () => { if (collapsedCats.has(cat)) collapsedCats.delete(cat); else collapsedCats.add(cat); LP.store.set('collapsedCats', [...collapsedCats]); renderSymbolList(); });
      h.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const n = prompt('Renommer la catégorie :', cat);
        if (!n || !n.trim() || n.trim() === cat) return;
        const nn = n.trim();
        // Fusionne si la catégorie existe déjà
        S.library.forEach((x) => { if (catOf(x) === cat) x.cat = nn; });
        if (collapsedCats.delete(cat)) collapsedCats.add(nn);
        libChanged();
      });
      h.addEventListener('dragstart', (e) => { dragSym = { type: 'cat', cat }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', cat); });
      h.addEventListener('dragover', (e) => {
        if (!dragSym) return;
        e.preventDefault();
        clearDropMarks();
        if (dragSym.type === 'sym') h.classList.add('drop-into');
        else { const r = h.getBoundingClientRect(); h.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after'); }
      });
      h.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!dragSym) return;
        if (dragSym.type === 'sym') moveSymToCat(dragSym.id, cat);
        else moveCat(dragSym.cat, cat, h.classList.contains('drop-after'));
        dragSym = null; clearDropMarks(); libChanged();
      });
      list.appendChild(h);
      if (collapsed) continue;
      for (const s of syms) {
        const it = document.createElement('div');
        it.className = 'sym-item' + (S.currentSym && S.currentSym.id === s.id && S.tool === 'symbol' ? ' active' : '');
        it.draggable = true;
        it.dataset.id = s.id;
        it.appendChild(symThumb(s));
        const nm = document.createElement('div'); nm.className = 'nm';
        const dd = LP.migrateSym(s);
        const dimTxt = LP.isRound(dd) ? `Ø ${LP.fmtDim(dd.dimL, S.unit, dd.mode !== 'real')}`
          : `${LP.fmtDim(dd.dimL, S.unit, dd.mode !== 'real')} × ${LP.fmtDim(dd.dimW, S.unit, dd.mode !== 'real')}`;
        nm.innerHTML = `${esc(s.name)}${s.tag ? ` <small>[${esc(s.tag)}]</small>` : ''}<br><small>${esc(dimTxt)}${dd.mode !== 'real' ? ' papier' : ''}</small>`;
        it.appendChild(nm);
        const acts = document.createElement('div'); acts.className = 'acts';
        acts.innerHTML = '<button data-a="up" title="Monter">▲</button><button data-a="down" title="Descendre">▼</button><button data-a="edit" title="Modifier">✎</button><button data-a="dup" title="Dupliquer (nouveau type)">⧉</button><button data-a="del" title="Supprimer">✕</button>';
        it.appendChild(acts);
        it.addEventListener('dragstart', (e) => { dragSym = { type: 'sym', id: s.id }; it.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', s.id); });
        it.addEventListener('dragend', () => { it.classList.remove('dragging'); dragSym = null; clearDropMarks(); });
        it.addEventListener('dragover', (e) => {
          if (!dragSym) return;
          e.preventDefault();
          clearDropMarks();
          const r = it.getBoundingClientRect();
          it.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
        });
        it.addEventListener('drop', (e) => {
          e.preventDefault();
          if (!dragSym) return;
          const after = it.classList.contains('drop-after');
          if (dragSym.type === 'sym') moveSymNear(dragSym.id, s.id, after);
          else moveCat(dragSym.cat, catOf(s), after);
          dragSym = null; clearDropMarks(); libChanged();
        });
        it.addEventListener('click', (e) => {
          const a = e.target.dataset && e.target.dataset.a;
          if (a === 'up' || a === 'down') { stepSym(s.id, a === 'up' ? -1 : 1); return libChanged(); }
          if (a === 'edit') return openSymbolDialog(s);
          if (a === 'dup') {
            const c = Object.assign({}, s, { id: 'u-' + LP.uid(), name: s.name + ' (copie)', builtin: false });
            if (S.images[s.id]) S.images[c.id] = S.images[s.id];
            loadImageEls();
            return openSymbolDialog(c, true);
          }
          if (a === 'del') {
            if (confirm(`Supprimer « ${s.name} » de la bibliothèque ?\n(Les symboles déjà placés sont conservés.)`)) {
              S.library = S.library.filter((x) => x !== s);
              if (S.currentSym === s) S.currentSym = S.library[0] || null;
              saveLibrary(); renderSymbolList();
            }
            return;
          }
          S.currentSym = s;
          setTool('symbol');
        });
        list.appendChild(it);
      }
    }
    // Zone de dépôt : nouvelle catégorie
    const nz = document.createElement('div');
    nz.className = 'sym-newcat';
    nz.textContent = '＋ Déposer ici pour créer une catégorie';
    nz.addEventListener('dragover', (e) => { if (dragSym && dragSym.type === 'sym') { e.preventDefault(); nz.classList.add('drop-into'); } });
    nz.addEventListener('dragleave', () => nz.classList.remove('drop-into'));
    nz.addEventListener('drop', (e) => {
      e.preventDefault();
      nz.classList.remove('drop-into');
      if (!dragSym || dragSym.type !== 'sym') return;
      const id = dragSym.id; dragSym = null;
      const n = prompt('Nom de la nouvelle catégorie (ex. nom du projet) :', '');
      if (!n || !n.trim()) return;
      moveSymToCat(id, n.trim());
      libChanged();
    });
    list.appendChild(nz);
  }

  /* ----- Éditeur de symbole ----- */
  const dlg = $('#symDialog');
  const form = $('#symForm');
  let dlgSym = null, dlgIsNew = false, dlgImg = null, dlgOld = null;

  function openSymbolDialog(sym, isNew) {
    dlgIsNew = !sym || !!isNew;
    dlgSym = sym ? Object.assign({}, sym) : {
      id: 'u-' + LP.uid(), name: '', cat: 'Luminaires', shape: 'rect', inner: '', tag: '', color: '#d00000', fill: '#ffffff',
      mode: 'real', dimL: S.unit === 'ft' ? 4 * 0.3048 : 1.2, dimW: S.unit === 'ft' ? 2 * 0.3048 : 0.6,
    };
    LP.migrateSym(dlgSym);
    dlgImg = S.images[dlgSym.id] || null;
    $('#symDialogTitle').textContent = dlgIsNew ? 'Nouveau symbole' : 'Modifier le symbole';
    const shapeSel = form.elements.shape;
    // « Composé » : seulement pour un symbole déjà dessiné dans l'Atelier
    shapeSel.innerHTML = Object.entries(LP.SHAPES).filter(([k]) => k !== 'custom' || dlgSym.shape === 'custom')
      .map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
    $('#catList').innerHTML = [...new Set(S.library.map((s) => s.cat))].map((c) => `<option value="${esc(c)}">`).join('');
    const F = form.elements;
    F.name.value = dlgSym.name; F.cat.value = dlgSym.cat || ''; F.shape.value = dlgSym.shape;
    F.inner.value = dlgSym.inner || ''; F.tag.value = dlgSym.tag || ''; F.color.value = dlgSym.color;
    const none = !dlgSym.fill || dlgSym.fill === 'none';
    F.fill.value = none ? '#ffffff' : dlgSym.fill; F.nofill.checked = none;
    F.mode.value = dlgSym.mode;
    F.dimL.value = LP.fmtDim(dlgSym.dimL, S.unit, dlgSym.mode !== 'real');
    F.dimW.value = LP.fmtDim(dlgSym.dimW, S.unit, dlgSym.mode !== 'real');
    F.img.value = '';
    dlgOld = { mode: dlgSym.mode, dimL: dlgSym.dimL, dimW: dlgSym.dimW, tag: dlgSym.tag };
    form.querySelector('.upd').style.display = dlgIsNew ? 'none' : '';
    updateDlg();
    dlg.showModal();
  }
  function readDlg() {
    const F = form.elements;
    Object.assign(dlgSym, {
      name: F.name.value.trim(), cat: F.cat.value.trim() || 'Divers', shape: F.shape.value,
      inner: F.inner.value, tag: F.tag.value.trim(), color: F.color.value,
      fill: F.nofill.checked ? 'none' : F.fill.value, mode: F.mode.value,
    });
    const paper = dlgSym.mode !== 'real';
    for (const k of ['dimL', 'dimW']) {
      const m = LP.parseDim(F[k].value, S.unit, paper);
      F[k].setCustomValidity(m > 0 ? '' : 'Dimension non reconnue');
      if (m > 0) dlgSym[k] = m;
    }
    if (LP.isRound(dlgSym)) dlgSym.dimW = dlgSym.dimL;
  }
  function updateDlg() {
    readDlg();
    const isImg = dlgSym.shape === 'image';
    form.querySelectorAll('.img-only').forEach((e) => (e.style.display = isImg ? '' : 'none'));
    form.querySelectorAll('.no-img').forEach((e) => (e.style.display = isImg ? 'none' : ''));
    const round = LP.isRound(dlgSym);
    form.querySelector('.dimL-lbl').textContent = round ? 'Diamètre' : 'Longueur';
    form.querySelector('.dimW-row').style.display = round ? 'none' : '';
    const paper = dlgSym.mode !== 'real';
    const ph = S.unit === 'ft' ? (paper ? '1/4"' : `4'  ou  48"`) : (paper ? '6 mm' : '1200 mm');
    form.elements.dimL.placeholder = form.elements.dimW.placeholder = ph;
    const c = $('#symPreview');
    const ctx = c.getContext('2d');
    c.width = 400; c.height = 400;
    ctx.scale(2, 2);
    ctx.clearRect(0, 0, 200, 200);
    // Grille légère
    ctx.strokeStyle = '#eef0f3';
    for (let i = 0; i <= 200; i += 20) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 200); ctx.moveTo(0, i); ctx.lineTo(200, i); ctx.stroke(); }
    const imgs = Object.assign({}, S.imgEls);
    if (dlgImg) {
      if (!updateDlg.el || updateDlg.el.src !== dlgImg) { updateDlg.el = new Image(); updateDlg.el.onload = updateDlg; updateDlg.el.src = dlgImg; }
      imgs[dlgSym.id] = updateDlg.el;
    }
    const R = new LP.CanvasRenderer(ctx, imgs);
    const [sw, sh] = fitSym(dlgSym, 130, 130);
    LP.drawSymbol(R, dlgSym, { x: 90, y: 100, w: sw, h: sh, showTag: true, lineWidth: 1.5 });
    ctx.fillStyle = '#6b7280'; ctx.font = '11px sans-serif';
    const dt = round ? `Ø ${LP.fmtDim(dlgSym.dimL, S.unit, paper)}` : `${LP.fmtDim(dlgSym.dimL, S.unit, paper)} × ${LP.fmtDim(dlgSym.dimW, S.unit, paper)}`;
    ctx.fillText(`${dt} ${paper ? 'sur papier' : 'réels'}`, 6, 194);
  }
  form.addEventListener('input', updateDlg);
  form.elements.img.addEventListener('change', async () => {
    const f = form.elements.img.files[0];
    if (!f) return;
    if (f.size > 2e6) { alert('Image trop lourde (max 2 Mo). Utilisez un PNG simple.'); return; }
    dlgImg = await LP.readFile(f, 'dataurl');
    const im = new Image();
    im.onload = () => {
      dlgSym.imgAspect = im.naturalWidth / im.naturalHeight;
      // Largeur proportionnelle à l'image
      form.elements.dimW.value = LP.fmtDim(dlgSym.dimL / dlgSym.imgAspect, S.unit, dlgSym.mode !== 'real');
      updateDlg();
    };
    im.src = dlgImg;
  });
  dlg.addEventListener('close', () => {
    if (dlg.returnValue !== 'ok') return;
    readDlg();
    if (!dlgSym.name) { alert('Nom requis.'); return; }
    if (!form.elements.dimL.checkValidity() || (!LP.isRound(dlgSym) && !form.elements.dimW.checkValidity())) {
      alert("Dimension non reconnue. Exemples : 4'  48\"  2'-6 1/2\"  1/4\"  1200 mm"); return;
    }
    if (dlgSym.shape === 'image') {
      if (!dlgImg) { alert('Choisissez une image.'); return; }
      S.images[dlgSym.id] = dlgImg;
      loadImageEls();
    }
    dlgSym.builtin = false;
    const idx = S.library.findIndex((s) => s.id === dlgSym.id);
    if (idx >= 0) {
      const old = S.library[idx];
      S.library[idx] = dlgSym;
      if (form.elements.updatePlaced.checked) {
        const placed = S.annots.filter((a) => a.type === 'symbol' && a.sym.id === dlgSym.id);
        if (placed.length) {
          pushUndo();
          for (const a of placed) {
            if ((a.tag || '') === (old.tag || '')) a.tag = dlgSym.tag;
            // Les instances aux dimensions d'origine suivent les nouvelles dimensions
            const sameDims = (a.dimL == null && a.size == null) || (a.mode === dlgOld.mode && a.dimL === dlgOld.dimL && a.dimW === dlgOld.dimW);
            if (sameDims) { delete a.size; a.mode = dlgSym.mode; a.dimL = dlgSym.dimL; a.dimW = dlgSym.dimW; }
            a.sym = symSnapshot(dlgSym);
            touch(a);
          }
          changed();
          toast(`${placed.length} symbole(s) placé(s) mis à jour`);
        }
      }
    } else S.library.push(dlgSym);
    S.currentSym = dlgSym;
    saveLibrary();
    renderSymbolList();
    setTool('symbol');
  });

  /* ======================= Panneaux ======================= */
  let panelTimer = null;
  function refreshPanelsSoon() { clearTimeout(panelTimer); panelTimer = setTimeout(refreshPanels, 150); }
  function refreshPanels() {
    renderCounts();
    renderAnnotList();
    renderPageList();
  }

  function symDims(a) {
    const mode = a.mode || (a.sym && a.sym.mode);
    return mode === 'real' ? LP.symDimText(a) : '';
  }
  function symKey(a) { return `${a.sym.id}|${a.tag || ''}|${symDims(a)}`; }

  function computeCounts() {
    const m = new Map();
    for (const a of S.annots) {
      if (a.type !== 'symbol') continue;
      const k = symKey(a);
      if (!m.has(k)) m.set(k, { name: a.sym.name + (symDims(a) ? ` (${symDims(a)})` : ''), tag: a.tag || '', color: a.sym.color, page: 0, total: 0, pages: {} });
      const e = m.get(k);
      e.total++;
      e.pages[a.page] = (e.pages[a.page] || 0) + 1;
      if (a.page === S.pageNum) e.page++;
    }
    return [...m.values()].sort((x, y) => (x.tag || '~').localeCompare(y.tag || '~', 'fr', { numeric: true }) || x.name.localeCompare(y.name));
  }
  function computeQty() {
    const m = new Map();
    for (const a of S.annots) {
      const q = LP.quantityAnnotation(a, env);
      if (q == null) continue;
      const sc = env.scaleFor(a.page);
      const key = a.type + '|' + (a.comment || '');
      if (!m.has(key)) m.set(key, { type: a.type, label: (LP.TYPE_LABELS[a.type]) + (a.comment ? ' — ' + a.comment : ''), page: 0, total: 0, unit: sc.unit });
      const e = m.get(key);
      e.total += q;
      if (a.page === S.pageNum) e.page += q;
    }
    return [...m.values()];
  }
  function fmtQty(e, v) { return e.type === 'area' ? LP.fmtArea(v, e.unit) : LP.fmtLength(v, e.unit); }

  function renderCounts() {
    const tb = $('#countTable tbody');
    const rows = computeCounts();
    tb.innerHTML = rows.length ? rows.map((r) => `<tr><td><span style="color:${r.color}">■</span> ${esc(r.name)}</td><td>${esc(r.tag)}</td><td>${r.page}</td><td><b>${r.total}</b></td></tr>`).join('')
      : '<tr><td colspan="4" class="hint">Aucun symbole placé</td></tr>';
    const qb = $('#qtyTable tbody');
    const q = computeQty();
    qb.innerHTML = q.length ? q.map((e) => `<tr><td>${esc(e.label)}</td><td>${e.page ? fmtQty(e, e.page) : '–'}</td><td><b>${fmtQty(e, e.total)}</b></td></tr>`).join('')
      : '<tr><td colspan="3" class="hint">Aucune mesure (calibrez l\'échelle puis utilisez M, N ou B)</td></tr>';
  }

  function renderAnnotList() {
    const box = $('#annotList');
    const all = $('#listScope').value === 'all';
    const authSel = $('#authorFilter');
    const authors = [...new Set(S.annots.map((a) => a.author || ''))].sort();
    const curA = authSel.value;
    authSel.innerHTML = '<option value="*">Tous les auteurs</option>' + authors.map((x) => `<option value="${esc(x)}">${esc(x || '(sans auteur)')}</option>`).join('');
    authSel.value = authors.includes(curA) ? curA : '*';
    const fa = authSel.value;
    const list = S.annots.filter((a) => (all || a.page === S.pageNum) && (fa === '*' || (a.author || '') === fa));
    if (!list.length) { box.innerHTML = '<p class="hint">Aucune annotation</p>'; return; }
    const MAX = 500;
    box.innerHTML = list.slice(0, MAX).map((a) => {
      const col = a.type === 'symbol' ? a.sym.color : a.style.stroke;
      const desc = LP.describeAnnotation(a, env);
      return `<div class="item${S.sel.has(a.id) ? ' sel' : ''}" data-id="${a.id}"><span class="dot" style="background:${col}"></span>
        <div>${esc(LP.TYPE_LABELS[a.type])}${desc && desc !== a.comment ? ' — ' + esc(desc) : ''}${a.comment ? '<br><span class="meta">' + esc(a.comment) + '</span>' : ''}</div>
        <span class="meta">p.${a.page}</span><span></span><span class="meta">${esc(a.author || '')}${(a.replies || []).length ? ' · 💬 ' + a.replies.length : ''}</span></div>`;
    }).join('') + (list.length > MAX ? `<p class="hint">… ${list.length - MAX} autres</p>` : '');
    box.querySelectorAll('.item').forEach((el) => el.addEventListener('click', async () => {
      const a = S.annots.find((x) => x.id === el.dataset.id);
      if (!a) return;
      if (S.tool !== 'select') setTool('select');
      if (a.page !== S.pageNum) await goPage(a.page);
      S.sel.clear(); S.sel.add(a.id);
      const [x, y, w, h] = LP.bboxAnnotation(a);
      const [sx, sy] = toScreen(x + w / 2, y + h / 2);
      if (sx < 0 || sy < 0 || sx > vw || sy > vh) { S.pan.x += vw / 2 - sx; S.pan.y += vh / 2 - sy; viewChanged(); }
      refreshProps(); drawOverlay(); highlightList();
    }));
  }
  function highlightList() {
    $$('#annotList .item').forEach((el) => el.classList.toggle('sel', S.sel.has(el.dataset.id)));
  }

  function renderPageList() {
    const box = $('#pageList');
    if (!S.pdf) { box.innerHTML = ''; return; }
    const counts = {};
    for (const a of S.annots) counts[a.page] = (counts[a.page] || 0) + 1;
    let h = '';
    for (let i = 1; i <= S.numPages; i++) {
      const lbl = S.pageLabels ? S.pageLabels[i - 1] : '';
      const sc = S.scales[i] ? ' · ' + (S.scales[i].label || 'échelle') : '';
      h += `<div class="item${i === S.pageNum ? ' cur' : ''}" data-p="${i}"><span>Page ${i}${lbl && lbl !== String(i) ? ' (' + esc(lbl) + ')' : ''}<small class="meta">${esc(sc)}</small></span><span class="meta">${counts[i] || ''}</span></div>`;
    }
    box.innerHTML = h;
    box.querySelectorAll('.item').forEach((el) => el.addEventListener('click', () => goPage(+el.dataset.p)));
  }

  /* ======================= Échelle ======================= */
  function updateScaleUI() {
    const sel = $('#scaleSelect');
    const cur = S.scales[S.pageNum];
    let h = '<option value="">Non calibrée</option>';
    LP.SCALE_PRESETS.forEach((p, i) => { h += `<option value="${i}">${p.label}</option>`; });
    if (cur && cur.label === 'Calibrée') h += '<option value="cal" selected>Calibrée manuellement</option>';
    sel.innerHTML = h;
    if (cur && cur.label !== 'Calibrée') {
      const i = LP.SCALE_PRESETS.findIndex((p) => p.label === cur.label);
      sel.value = i >= 0 ? String(i) : '';
    } else if (!cur) sel.value = '';
    $('#unitSelect').value = cur ? cur.unit : S.unit;
  }
  $('#scaleSelect').addEventListener('change', (e) => {
    const v = e.target.value;
    if (v === 'cal') return;
    pushUndo();
    if (v === '') delete S.scales[S.pageNum];
    else {
      const p = LP.SCALE_PRESETS[+v];
      const unit = p.label.includes('"') ? 'ft' : (S.unit === 'ft' ? 'mm' : S.unit);
      S.scales[S.pageNum] = { mpp: p.mpp, unit, label: p.label };
      S.unit = unit;
    }
    updateScaleUI(); changed(); renderSymbolList(); refreshProps();
  });
  $('#unitSelect').addEventListener('change', (e) => {
    S.unit = e.target.value;
    LP.store.set('unit', S.unit);
    for (const k of Object.keys(S.scales)) S.scales[k].unit = S.unit;
    changed(); renderSymbolList(); refreshProps();
  });
  $('#btnScaleAll').addEventListener('click', () => {
    const cur = S.scales[S.pageNum];
    if (!cur) { alert("Cette page n'a pas d'échelle."); return; }
    if (!confirm(`Appliquer l'échelle « ${cur.label} » aux ${S.numPages} pages ?`)) return;
    pushUndo();
    for (let i = 1; i <= S.numPages; i++) S.scales[i] = Object.assign({}, cur);
    changed(); toast('Échelle appliquée à toutes les pages');
  });

  /* ======================= Projet (fichiers) ======================= */
  let pendingProject = null;

  function buildProject(withPdf) {
    const usedImg = {};
    for (const a of S.annots) if (a.type === 'symbol') for (const id of LP.symImageIds(a.sym)) if (S.images[id]) usedImg[id] = S.images[id];
    const p = {
      format: 'lumiplan-project', version: 1,
      pdf: { name: S.fileName, fingerprint: S.fingerprint, numPages: S.numPages },
      modified: new Date().toISOString(),
      scales: S.scales, unit: S.unit,
      annots: S.annots, images: usedImg,
      deletedSrc: deletedSrc(),
      library: S.library,
    };
    if (withPdf && S.pdfBytes) p.pdfData = LP.bytesToBase64(S.pdfBytes);
    return p;
  }

  function applyProject(p, silent) {
    const incoming = (p.annots || []).filter((a) => a && a.pts && a.type);
    // Sécurité : une annotation d'origine du PDF absente du projet (projet plus
    // ancien que l'import) est conservée, pour ne jamais effacer le commentaire
    // d'un autre participant par accident.
    const known = new Set(incoming.filter((a) => a.src).map((a) => a.src.ref));
    const deleted = new Set(p.deletedSrc || []);
    const keepImported = S.annots.filter((a) => a.src && !known.has(a.src.ref) && !deleted.has(a.src.ref));
    S.annots = keepImported.concat(incoming);
    S.scales = p.scales || {};
    if (p.unit) S.unit = p.unit;
    Object.assign(S.images, p.images || {});
    loadImageEls();
    // Ajoute à la bibliothèque les symboles du projet inconnus localement
    if (p.library) {
      let added = 0;
      for (const s of p.library) if (!S.library.some((x) => x.id === s.id)) { S.library.push(s); added++; }
      if (added) { saveLibrary(); renderSymbolList(); if (!silent) toast(`${added} symbole(s) ajouté(s) à la bibliothèque`); }
    }
    S.sel.clear(); S.undo = []; S.redo = [];
    S.dirty = false;
    updateScaleUI();
    drawOverlay(); refreshPanels(); refreshProps();
  }

  async function openProjectFile(file) {
    let p;
    try { p = JSON.parse(await LP.readFile(file, 'text')); } catch (e) { alert('Fichier projet invalide.'); return; }
    if (p.format !== 'lumiplan-project') { alert("Ce fichier n'est pas un projet LumiPlan."); return; }
    if (p.pdfData) {
      pendingProject = p;
      await openPdfBytes(LP.base64ToBytes(p.pdfData), p.pdf.name || 'plan.pdf');
      return;
    }
    if (!S.pdf) {
      pendingProject = p;
      toast(`Ouvrez maintenant le PDF « ${p.pdf.name} »`, 6000);
      alert(`Projet chargé. Ouvrez maintenant le PDF correspondant :\n${p.pdf.name}`);
      $('#filePdf').click();
      return;
    }
    if (p.pdf.fingerprint && p.pdf.fingerprint !== S.fingerprint &&
      !confirm(`Ce projet a été créé pour « ${p.pdf.name} », qui semble différent du PDF ouvert.\nCharger quand même ?`)) return;
    if (S.annots.length && !confirm('Remplacer les annotations actuelles par celles du projet ?')) return;
    applyProject(p);
    toast('Projet chargé');
  }

  // Références des annotations d'origine supprimées volontairement
  function deletedSrc() {
    if (!S.native) return [];
    const present = new Set(S.annots.filter((a) => a.src).map((a) => a.src.ref));
    const out = [];
    for (const list of S.native.pages.values()) for (const e of list) if (!present.has(e.ref)) out.push(e.ref);
    return out;
  }

  function baseName() { return (S.fileName || 'plan').replace(/\.pdf$/i, ''); }

  async function saveProject(saveAs, withPdf) {
    if (!S.pdf) { alert("Ouvrez d'abord un PDF."); return; }
    commitText();
    const p = buildProject(withPdf);
    const blob = new Blob([JSON.stringify(p)], { type: 'application/json' });
    const name = baseName() + (withPdf ? '.lumiplan-complet.json' : '.lumiplan.json');
    const handle = await LP.saveBlob(blob, name, {
      handle: saveAs || withPdf ? null : S.projHandle,
      types: [{ description: 'Projet LumiPlan', accept: { 'application/json': ['.json'] } }],
    });
    if (handle && !withPdf) S.projHandle = handle;
    S.dirty = false;
    toast('Projet enregistré');
  }

  async function exportPdfFile(flatten) {
    if (!S.pdf) { alert("Ouvrez d'abord un PDF."); return; }
    commitText();
    if (!flatten && S.native && S.native.encrypted) { alert("Ce PDF est protégé : seules les annotations aplaties peuvent être exportées."); return; }
    toast('Export PDF en cours…', 60000);
    try {
      const prog = (d, n) => toast(`Export… page ${d}/${n}`, 60000);
      const bytes = flatten
        ? await LP.exportPdf(S.cleanBytes || S.pdfBytes, S.pdf, S.annots, S.images, env, prog)
        : await LP.exportNative(S.pdfBytes, S.pdf, S.annots, S.images, env, S.native, prog);
      await LP.saveBlob(new Blob([bytes], { type: 'application/pdf' }), baseName() + (flatten ? '_aplati.pdf' : '_annoté.pdf'), {
        types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
      });
      toast('PDF annoté exporté');
    } catch (e) {
      console.error(e);
      alert("Échec de l'export PDF : " + e.message + (/encrypt/i.test(e.message) ? '\n(Le PDF est protégé.)' : ''));
      toast('');
    }
  }

  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  async function exportCsv() {
    if (!S.pdf) return;
    const rows = [];
    // Excel (fr-CA) : séparateur « ; » et BOM UTF-8
    rows.push(['DÉCOMPTE DES SYMBOLES']);
    const pages = [...new Set(S.annots.filter((a) => a.type === 'symbol').map((a) => a.page))].sort((a, b) => a - b);
    rows.push(['Symbole', 'Type', ...pages.map((p) => 'Page ' + p), 'Total']);
    for (const r of computeCounts()) rows.push([r.name, r.tag, ...pages.map((p) => r.pages[p] || 0), r.total]);
    rows.push([]);
    rows.push(['QUANTITÉS MESURÉES']);
    rows.push(['Mesure', 'Total']);
    for (const e of computeQty()) rows.push([e.label, fmtQty(e, e.total)]);
    rows.push([]);
    rows.push(['LISTE DES ANNOTATIONS']);
    rows.push(['Page', 'Type', 'Description', 'Étiquette', 'Commentaire', 'Valeur (m ou m²)', 'Auteur', 'Créé', 'Modifié', 'Réponses']);
    for (const a of [...S.annots].sort((x, y) => x.page - y.page)) {
      const q = LP.quantityAnnotation(a, env);
      rows.push([a.page, LP.TYPE_LABELS[a.type], LP.describeAnnotation(a, env), a.tag || '', a.comment || '',
        q == null ? '' : q.toFixed(3).replace('.', ','), a.author || '', a.created, a.modified,
        (a.replies || []).map((r) => `${r.author || '?'} : ${r.text}`).join(' | ')]);
    }
    const csv = '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
    await LP.saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), baseName() + '_decompte.csv', {
      types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }],
    });
  }

  /* ======================= Liaisons UI ======================= */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

  async function openPdfFile(file) {
    if (S.dirty && S.annots.length && !confirm('Des modifications non enregistrées seront perdues (une copie automatique existe). Continuer ?')) return;
    const buf = new Uint8Array(await LP.readFile(file));
    await openPdfBytes(buf, file.name);
  }

  function bind() {
    $('#btnOpenPdf').onclick = () => $('#filePdf').click();
    $('#btnOpenProj').onclick = () => $('#fileProj').click();
    $('#btnSaveProj').onclick = () => saveProject(false);
    $('#btnSaveProjAs').onclick = () => saveProject(true);
    $('#btnSaveBundle').onclick = () => saveProject(true, true);
    $('#btnExportPdf').onclick = () => exportPdfFile(false);
    $('#btnExportFlat').onclick = () => exportPdfFile(true);
    $('#authorFilter').onchange = renderAnnotList;
    $('#btnExportCsv').onclick = exportCsv;
    $('#btnUndo').onclick = undo;
    $('#btnRedo').onclick = redo;
    $('#btnPrev').onclick = () => goPage(S.pageNum - 1);
    $('#btnNext').onclick = () => goPage(S.pageNum + 1);
    $('#btnZoomIn').onclick = () => zoomAt(1.25, vw / 2, vh / 2);
    $('#btnZoomOut').onclick = () => zoomAt(0.8, vw / 2, vh / 2);
    $('#btnFit').onclick = () => { fitPage(); viewChanged(); };
    $('#btnHelp').onclick = () => $('#helpDialog').showModal();
    $('#btnNewSymbol').onclick = () => openSymbolDialog(null);
    $('#symFilter').oninput = renderSymbolList;
    $('#listScope').onchange = renderAnnotList;
    $('#authorInput').onchange = (e) => { S.author = e.target.value; LP.store.set('author', S.author); };
    $('#pageInput').onchange = (e) => {
      const v = e.target.value.trim();
      let n = parseInt(v, 10);
      if (S.pageLabels) { const i = S.pageLabels.indexOf(v); if (i >= 0) n = i + 1; }
      goPage(n || S.pageNum);
    };
    $('#filePdf').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openPdfFile(f); };
    $('#fileProj').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openProjectFile(f); };
    $('#btnLibExport').onclick = () => {
      const data = { format: 'lumiplan-library', version: 1, symbols: S.library, images: {} };
      for (const s of S.library) for (const id of LP.symImageIds(s)) if (S.images[id]) data.images[id] = S.images[id];
      LP.saveBlob(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), 'bibliotheque-symboles.lumiplan-lib.json');
    };
    $('#btnLibImport').onclick = () => $('#fileLib').click();
    $('#fileLib').onchange = async (e) => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      try {
        const d = JSON.parse(await LP.readFile(f, 'text'));
        if (d.format !== 'lumiplan-library') throw new Error('format');
        let n = 0;
        for (const s of d.symbols) {
          const i = S.library.findIndex((x) => x.id === s.id);
          if (i >= 0) S.library[i] = s; else S.library.push(s);
          n++;
        }
        Object.assign(S.images, d.images || {});
        loadImageEls(); saveLibrary(); renderSymbolList();
        toast(`${n} symbole(s) importé(s)`);
      } catch (err) { alert('Bibliothèque invalide.'); }
    };
    $('#btnLibReset').onclick = () => {
      if (!confirm('Restaurer la bibliothèque par défaut ? Vos symboles personnalisés seront supprimés (exportez-les avant si besoin).')) return;
      S.library = JSON.parse(JSON.stringify(LP.DEFAULT_SYMBOLS));
      S.currentSym = S.library[0];
      saveLibrary(); renderSymbolList();
    };
    $$('.tabs button').forEach((b) => b.addEventListener('click', () => {
      $$('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
      $$('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
    }));

    // Glisser-déposer
    viewer.addEventListener('dragover', (e) => { e.preventDefault(); viewer.classList.add('dragover'); });
    viewer.addEventListener('dragleave', () => viewer.classList.remove('dragover'));
    viewer.addEventListener('drop', (e) => {
      e.preventDefault(); viewer.classList.remove('dragover');
      const f = e.dataTransfer.files[0];
      if (!f) return;
      if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') openPdfFile(f);
      else if (/\.json$/i.test(f.name)) openProjectFile(f);
    });
    window.addEventListener('beforeunload', (e) => { if (S.dirty) { autosave(); e.preventDefault(); e.returnValue = ''; } });
    new ResizeObserver(resize).observe(viewer);
  }

  // Symboles envoyés par l'Atelier (même navigateur) : rechargement à chaud
  function listenAtelier() {
    try {
      const bc = new BroadcastChannel('lumiplan');
      bc.onmessage = async (e) => {
        if (!e.data || e.data.type !== 'library-updated') return;
        const lib = await LP.store.get('library');
        const imgs = await LP.store.get('libImages');
        if (!lib) return;
        S.library = lib;
        Object.assign(S.images, imgs || {});
        loadImageEls();
        S.currentSym = (S.currentSym && S.library.find((x) => x.id === S.currentSym.id)) || S.library[0] || null;
        renderSymbolList();
        toast(`Bibliothèque mise à jour depuis l'Atelier (${e.data.count || 0} symbole(s))`, 5000);
      };
    } catch (err) { /* BroadcastChannel indisponible : import par fichier */ }
  }

  async function init() {
    buildToolbar();
    bind();
    listenAtelier();
    await loadLibrary();
    renderSymbolList();
    setTool('select');
    resize();
    updateScaleUI();
  }

  // Accès pour les tests / la console
  window.LumiPlan = {
    state: S, openPdfBytes, setTool,
    exportPdf: () => LP.exportPdf(S.cleanBytes || S.pdfBytes, S.pdf, S.annots, S.images, env),
    exportNative: () => LP.exportNative(S.pdfBytes, S.pdf, S.annots, S.images, env, S.native), goPage, buildProject, applyProject };
  init();
})();
