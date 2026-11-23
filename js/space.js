/*
 * Petits projets à main levée :
 *  - Nouveau plan : feuille vierge ou quadrillée (grille de référence), à l'échelle, calibrée d'office ;
 *  - Local (U) : rectangle (2 clics) ou polygone (clics, double-clic / Entrée), murs à l'échelle,
 *    hauteur de plafond 10'-0" par défaut, nom et superficie ;
 *  - Porte (D) : clic sur un mur ; largeur, sens d'ouverture et pentures réglables ;
 *  - Plafond (J) : grille 2 × 2 ou 2 × 4 centrée, découpée selon le local.
 */
(function () {
  'use strict';
  const LP = window.LP;
  const app = LP.app;
  const { S, env, $, esc } = app;
  const FT = 0.3048, IN = 0.0254, PT_IN = 1 / 72;
  env.ext = env.ext || {};

  const CFG = { snap: true, mode: 'rect', ceil: '2x2', height: 10 * FT, wall: 6 * IN, door: 3 * FT };
  const GRID = {}; // page -> { ox, oy, step } (points) pour les feuilles générées

  /* ---------------- Accès aux locaux ---------------- */
  let cRef = null, cLen = -1, cMap = new Map();
  function annById(id) {
    if (cRef !== S.annots || cLen !== S.annots.length) { cMap = new Map(S.annots.map((a) => [a.id, a])); cRef = S.annots; cLen = S.annots.length; }
    return cMap.get(id) || null;
  }
  const rooms = (page) => S.annots.filter((a) => a.type === 'room' && (page == null || a.page === page));
  env.ext.roomById = (id) => { const a = annById(id); return a && a.type === 'room' ? a : null; };
  env.ext.roomAt = (page, p) => {
    const list = rooms(page);
    for (let i = list.length - 1; i >= 0; i--) if (LP.inPoly(p[0], p[1], list[i].pts)) return list[i];
    return null;
  };

  /* ---------------- Magnétisme ---------------- */
  function snap(p) {
    const sc = env.scaleFor(S.pageNum);
    if (!CFG.snap || !sc) return p;
    const g = GRID[S.pageNum];
    const step = g ? g.step : (S.unit === 'ft' ? FT : 0.1) / sc.mpp;
    const ox = g ? g.ox : 0, oy = g ? g.oy : 0;
    return [ox + Math.round((p[0] - ox) / step) * step, oy + Math.round((p[1] - oy) / step) * step];
  }
  const fmtL = (pt) => { const sc = env.scaleFor(S.pageNum); return sc ? LP.fmtDim(pt * sc.mpp, S.unit, false) : `${pt.toFixed(0)} pt`; };

  /* ---------------- Outil Local ---------------- */
  let draft = null, hov = null;
  function nextName() {
    const n = rooms().length + 1;
    return `Local ${n}`;
  }
  function createRoom(pts) {
    const a = app.newAnnot('room', pts.map((q) => [q[0], q[1]]));
    a.name = nextName();
    a.h = CFG.height;
    a.wt = CFG.wall;
    a.ceil = null;
    a.showLabel = true;
    a.style = { stroke: '#3a3f47', width: 1, opacity: 1 };
    app.pushUndo();
    app.insertLayer(a);
    app.changed();
    const sc = env.scaleFor(S.pageNum);
    app.toast(`${a.name} créé${sc ? ' — ' + LP.fmtArea(LP.polyArea(a.pts) * sc.mpp * sc.mpp, S.unit) : ''} · nom, hauteur et plafond dans le panneau de droite (outil Sélection)`, 6000);
    return a;
  }
  function finishPoly() {
    if (!draft || draft.length < 3) { app.toast('Un polygone demande au moins 3 sommets'); return; }
    createRoom(draft);
    draft = null;
    app.drawOverlay();
  }
  app.hooks.tool.room = {
    down(p, e) {
      if (e.button !== 0) return;
      if (!env.scaleFor(S.pageNum)) app.toast('Page non calibrée : murs et superficies seront approximatifs. Calibrez (K) ou utilisez « Nouveau plan ».', 6000);
      const q = snap(p);
      if (CFG.mode === 'rect') {
        if (!draft) { draft = [q]; return; }
        const a = draft[0];
        if (Math.abs(q[0] - a[0]) * S.zoom < 4 || Math.abs(q[1] - a[1]) * S.zoom < 4) { app.toast('Rectangle trop petit'); return; }
        createRoom([a, [q[0], a[1]], q, [a[0], q[1]]]);
        draft = null;
        app.drawOverlay();
        return;
      }
      if (!draft) draft = [];
      if (e.detail >= 2) { finishPoly(); return; }
      const last = draft[draft.length - 1];
      if (draft.length >= 3 && Math.hypot(q[0] - draft[0][0], q[1] - draft[0][1]) * S.zoom < 8) { finishPoly(); return; } // retour au premier sommet
      if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) * S.zoom > 3) draft.push(q);
      app.drawOverlay();
    },
    move(p) { hov = snap(p); app.drawOverlay(); },
    cancel() { draft = null; hov = null; },
  };

  /* ---------------- Outil Porte ---------------- */
  function nearestWall(p) {
    let best = null;
    for (const r of rooms(S.pageNum)) {
      const n = r.pts.length;
      const tol = LP.roomWallPt(r, env) / 2 + 8 / S.zoom;
      for (let i = 0; i < n; i++) {
        const a = r.pts[i], b = r.pts[(i + 1) % n];
        const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
        if (!L2) continue;
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
        const d = Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
        if (d <= tol && (!best || d < best.d)) best = { r, i, t, d, a, b };
      }
    }
    return best;
  }
  app.hooks.tool.door = {
    down(p, e) {
      if (e.button !== 0) return;
      const w = nearestWall(p);
      if (!w) { app.toast("Cliquez sur un mur d'un local"); return; }
      // Position arrondie au pouce (ou 10 mm) le long du mur
      const sc = env.scaleFor(S.pageNum);
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      let t = w.t;
      if (sc && CFG.snap) { const step = (S.unit === 'ft' ? IN : 0.01) / sc.mpp; t = (Math.round((t * L) / step) * step) / L; }
      const d = app.newAnnot('door', [[w.a[0] + (w.b[0] - w.a[0]) * t, w.a[1] + (w.b[1] - w.a[1]) * t]]);
      Object.assign(d, { room: w.r.id, seg: w.i, t, w: CFG.door, swing: 'in', hinge: 'a' });
      d.style = { stroke: '#3a3f47', width: 1, opacity: 1 };
      app.pushUndo();
      app.insertLayer(d);
      app.changed();
      app.toast(`Porte de ${LP.fmtDim(CFG.door, S.unit, false)} ajoutée à « ${w.r.name} » — sens et pentures dans le panneau de droite`, 5000);
    },
    move(p) { hov = p; app.drawOverlay(); },
    cancel() { hov = null; },
  };

  /* ---------------- Outil Plafond ---------------- */
  app.hooks.tool.ceiling = {
    down(p, e) {
      if (e.button !== 0) return;
      const r = env.ext.roomAt(S.pageNum, p);
      if (!r) { app.toast("Cliquez à l'intérieur d'un local"); return; }
      app.pushUndo();
      r.ceil = CFG.ceil ? { type: CFG.ceil, rot: (r.ceil && r.ceil.rot) || 0 } : null;
      app.changed();
      app.toast(CFG.ceil ? `Plafond ${CFG.ceil.replace('x', ' × ')} appliqué à « ${r.name} » (orientation dans le panneau de droite)` : `Plafond retiré de « ${r.name} »`);
    },
    move(p) { hov = p; app.drawOverlay(); },
    cancel() { hov = null; },
  };

  // Aperçus
  app.hooks.overlay.push((ctx) => {
    const z = S.zoom;
    if (S.tool === 'room' && hov) {
      ctx.save();
      ctx.strokeStyle = '#2563eb'; ctx.fillStyle = 'rgba(37,99,235,.07)'; ctx.lineWidth = 1.5 / z; ctx.setLineDash([6 / z, 4 / z]);
      const label = (t, x, y) => {
        ctx.save(); ctx.setLineDash([]); ctx.font = `600 ${12 / z}px system-ui, sans-serif`;
        const w = ctx.measureText(t).width;
        ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillRect(x - w / 2 - 3 / z, y - 11 / z, w + 6 / z, 15 / z);
        ctx.fillStyle = '#1d4ed8'; ctx.fillText(t, x - w / 2, y); ctx.restore();
      };
      if (CFG.mode === 'rect' && draft) {
        const a = draft[0], b = hov;
        ctx.beginPath(); ctx.rect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); ctx.fill(); ctx.stroke();
        label(`${fmtL(Math.abs(b[0] - a[0]))} × ${fmtL(Math.abs(b[1] - a[1]))}`, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      } else if (draft && draft.length) {
        ctx.beginPath(); ctx.moveTo(...draft[0]); for (const q of draft.slice(1)) ctx.lineTo(...q); ctx.lineTo(...hov); ctx.stroke();
        const last = draft[draft.length - 1];
        label(fmtL(Math.hypot(hov[0] - last[0], hov[1] - last[1])), (last[0] + hov[0]) / 2, (last[1] + hov[1]) / 2 - 6 / z);
        ctx.fillStyle = '#2563eb';
        for (const q of draft) ctx.fillRect(q[0] - 3 / z, q[1] - 3 / z, 6 / z, 6 / z);
      }
      // Point d'accrochage
      ctx.setLineDash([]); ctx.strokeStyle = '#2563eb';
      ctx.beginPath(); ctx.moveTo(hov[0] - 6 / z, hov[1]); ctx.lineTo(hov[0] + 6 / z, hov[1]); ctx.moveTo(hov[0], hov[1] - 6 / z); ctx.lineTo(hov[0], hov[1] + 6 / z); ctx.stroke();
      ctx.restore();
    }
    if (S.tool === 'door' && hov) {
      const w = nearestWall(hov);
      if (w) { ctx.save(); ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 3 / z; ctx.beginPath(); ctx.moveTo(...w.a); ctx.lineTo(...w.b); ctx.stroke(); ctx.restore(); }
    }
    if (S.tool === 'ceiling' && hov) {
      const r = env.ext.roomAt(S.pageNum, hov);
      if (r) { ctx.save(); ctx.fillStyle = 'rgba(37,99,235,.08)'; ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2 / z; ctx.beginPath(); ctx.moveTo(...r.pts[0]); for (const q of r.pts.slice(1)) ctx.lineTo(...q); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
    }
  });
  app.hooks.key.push((e, inField) => {
    if (inField || S.tool !== 'room' || !draft) return false;
    if (e.key === 'Enter') { if (CFG.mode === 'poly') finishPoly(); return true; }
    if (e.key === 'Backspace') { draft.pop(); if (!draft.length) draft = null; app.drawOverlay(); e.preventDefault(); return true; }
    if (e.key === 'Escape') { draft = null; app.drawOverlay(); return true; }
    return false;
  });

  /* ---------------- Propriétés ---------------- */
  const dim = (m) => esc(LP.fmtDim(m, S.unit, false));
  app.hooks.props.push((target) => {
    if (!target.length) return null;
    if (target.every((a) => a.type === 'room')) {
      const a = target[0], one = target.length === 1;
      const sc = env.scaleFor(a.page);
      const html = `${one ? `<label>Nom <input type="text" data-rm="name" value="${esc(a.name || '')}"></label>` : `<p class="hint">${target.length} locaux</p>`}
        <label>Hauteur plafond <input type="text" data-rm="h" value="${dim(a.h != null ? a.h : 10 * FT)}" title="Hauteur de plafond ; les luminaires posés dans ce local la reprennent"></label>
        <label>Épaisseur murs <input type="text" data-rm="wt" value="${dim(a.wt != null ? a.wt : 6 * IN)}"></label>
        <label>Plafond <select data-rm="ceil"><option value="" ${!a.ceil ? 'selected' : ''}>Aucun</option><option value="2x2" ${a.ceil && a.ceil.type === '2x2' ? 'selected' : ''}>Grille 2 × 2</option><option value="2x4" ${a.ceil && a.ceil.type === '2x4' ? 'selected' : ''}>Grille 2 × 4</option></select></label>
        ${a.ceil ? `<label>Orientation <select data-rm="rot"><option value="0" ${!a.ceil.rot ? 'selected' : ''}>Horizontale</option><option value="90" ${a.ceil.rot === 90 ? 'selected' : ''}>Verticale (90°)</option></select></label>` : ''}
        <label class="inline"><input type="checkbox" data-rm="showLabel" ${a.showLabel !== false ? 'checked' : ''}> Nom, superficie et hauteur au centre</label>
        <label>Texte (pt) <input type="number" data-rm="fs" min="4" max="30" step="1" value="${a.fs || 8}"></label>
        ${one && sc ? `<p class="hint">Superficie : <b>${LP.fmtArea(LP.polyArea(a.pts) * sc.mpp * sc.mpp, sc.unit)}</b> · périmètre : <b>${LP.fmtDim(LP.polyLength(a.pts.concat([a.pts[0]])) * sc.mpp, sc.unit, false)}</b><br>Les sommets se déplacent avec leurs poignées.</p>` : ''}
        <label class="inline"><input type="checkbox" data-rm="applyLum"> Appliquer la hauteur aux luminaires du local</label>
        <div class="row"><button data-rm-act="del" class="danger">${LP.icon('trash')}Supprimer (avec ses portes)</button></div>`;
      return {
        html,
        bind(box) {
          box.querySelectorAll('[data-rm]').forEach((el) => el.addEventListener('change', () => {
            const k = el.dataset.rm;
            if (k === 'applyLum') return;
            let v = el.type === 'checkbox' ? el.checked : el.value;
            if (k === 'h' || k === 'wt') {
              v = LP.parseDim(el.value, S.unit, false);
              if (!(v > 0)) { alert(`Dimension non reconnue : « ${el.value} »`); app.refreshProps(); return; }
            }
            app.pushUndo();
            for (const r of target) {
              if (k === 'ceil') r.ceil = v ? { type: v, rot: (r.ceil && r.ceil.rot) || 0 } : null;
              else if (k === 'rot') { if (r.ceil) r.ceil.rot = +v; }
              else if (k === 'fs') r.fs = Math.max(4, parseFloat(v) || 8);
              else r[k] = v;
              if (k === 'h' && box.querySelector('[data-rm=applyLum]').checked) {
                for (const s of S.annots) if (s.type === 'symbol' && s.page === r.page && !LP.isControlSym(s.sym) && LP.inPoly(s.pts[0][0], s.pts[0][1], r.pts)) s.mh = v;
              }
            }
            app.changed(); app.refreshProps();
          }));
          box.querySelector('[data-rm-act=del]').onclick = () => {
            app.pushUndo();
            const ids = new Set(target.map((r) => r.id));
            S.annots = S.annots.filter((x) => !ids.has(x.id) && !(x.type === 'door' && ids.has(x.room)));
            S.sel.clear(); app.changed(); app.refreshProps();
          };
        },
      };
    }
    if (target.every((a) => a.type === 'door')) {
      const a = target[0];
      const html = `<label>Largeur <input type="text" data-dr="w" value="${dim(a.w != null ? a.w : 3 * FT)}"></label>
        <label>Ouverture <select data-dr="swing"><option value="in" ${a.swing !== 'out' ? 'selected' : ''}>Vers l'intérieur</option><option value="out" ${a.swing === 'out' ? 'selected' : ''}>Vers l'extérieur</option></select></label>
        <label>Pentures <select data-dr="hinge"><option value="a" ${a.hinge !== 'b' ? 'selected' : ''}>Côté 1</option><option value="b" ${a.hinge === 'b' ? 'selected' : ''}>Côté 2</option></select></label>
        <label>Position <input type="range" data-dr="t" min="0" max="1" step="0.005" value="${a.t}"></label>
        <div class="row"><button data-dr-act="flipS">${LP.icon('redo')}Inverser l'ouverture</button><button data-dr-act="flipH">${LP.icon('undo')}Inverser les pentures</button></div>
        <div class="row"><button data-dr-act="del" class="danger">${LP.icon('trash')}Supprimer</button></div>`;
      return {
        html,
        bind(box) {
          box.querySelectorAll('[data-dr]').forEach((el) => el.addEventListener(el.type === 'range' ? 'input' : 'change', () => {
            const k = el.dataset.dr;
            let v = el.value;
            if (k === 'w') { v = LP.parseDim(el.value, S.unit, false); if (!(v > 0)) { alert('Largeur non reconnue'); return app.refreshProps(); } }
            if (k === 't') v = parseFloat(v);
            if (el.type !== 'range') app.pushUndo();
            for (const d of target) d[k] = v;
            if (el.type === 'range') app.drawOverlay(); else { app.changed(); app.refreshProps(); }
          }));
          const r = box.querySelector('[data-dr=t]'); if (r) r.addEventListener('change', () => { app.pushUndo(); app.changed(); });
          box.querySelector('[data-dr-act=flipS]').onclick = () => { app.pushUndo(); target.forEach((d) => { d.swing = d.swing === 'out' ? 'in' : 'out'; }); app.changed(); app.refreshProps(); };
          box.querySelector('[data-dr-act=flipH]').onclick = () => { app.pushUndo(); target.forEach((d) => { d.hinge = d.hinge === 'b' ? 'a' : 'b'; }); app.changed(); app.refreshProps(); };
          box.querySelector('[data-dr-act=del]').onclick = () => { app.pushUndo(); const ids = new Set(target.map((d) => d.id)); S.annots = S.annots.filter((x) => !ids.has(x.id)); S.sel.clear(); app.changed(); app.refreshProps(); };
        },
      };
    }
    return null;
  });
  // Panneau de l'outil actif
  const toolHelp = {
    room: () => `<label>Forme <select id="spMode"><option value="rect" ${CFG.mode === 'rect' ? 'selected' : ''}>Rectangle (2 clics aux coins)</option><option value="poly" ${CFG.mode === 'poly' ? 'selected' : ''}>Polygone (clics, double-clic pour fermer)</option></select></label>
      <label>Hauteur plafond <input type="text" id="spH" value="${dim(CFG.height)}"></label>
      <label>Épaisseur murs <input type="text" id="spW" value="${dim(CFG.wall)}"></label>
      <label class="inline"><input type="checkbox" id="spSnap" ${CFG.snap ? 'checked' : ''}> Magnétisme (grille de ${S.unit === 'ft' ? "1'" : '100 mm'})</label>
      <p class="hint">Polygone : Entrée ou clic sur le premier sommet pour fermer, Retour arrière pour retirer le dernier sommet, Échap pour annuler. Les dimensions s'affichent pendant le tracé.</p>`,
    door: () => `<label>Largeur <input type="text" id="spD" value="${dim(CFG.door)}"></label><p class="hint">Cliquez sur un mur (surligné en bleu). Sens d'ouverture, pentures et position se règlent ensuite dans les propriétés de la porte.</p>`,
    ceiling: () => `<label>Grille <select id="spC"><option value="2x2" ${CFG.ceil === '2x2' ? 'selected' : ''}>2 × 2</option><option value="2x4" ${CFG.ceil === '2x4' ? 'selected' : ''}>2 × 4</option><option value="" ${!CFG.ceil ? 'selected' : ''}>Aucune (retirer)</option></select></label><p class="hint">Cliquez dans un local : la grille est centrée et découpée selon sa forme. Orientation dans les propriétés du local.</p>`,
  };
  for (const k of Object.keys(toolHelp)) {
    app.hooks.toolProps[k] = () => ({
      html: toolHelp[k](),
      bind(box) {
        const on = (id, f) => { const el = box.querySelector(id); if (el) el.addEventListener('change', f); };
        on('#spMode', (e) => setCfg('mode', e.target.value));
        on('#spSnap', (e) => setCfg('snap', e.target.checked));
        on('#spC', (e) => setCfg('ceil', e.target.value));
        const dimIn = (id, key) => on(id, (e) => { const m = LP.parseDim(e.target.value, S.unit, false); if (!(m > 0)) { alert('Dimension non reconnue'); return app.refreshProps(); } setCfg(key, m); });
        dimIn('#spH', 'height'); dimIn('#spW', 'wall'); dimIn('#spD', 'door');
      },
    });
  }
  function setCfg(k, v) {
    CFG[k] = v;
    if (k === 'mode') { draft = null; const s = $('#roomMode'); if (s) s.value = v; }
    if (k === 'ceil') { const s = $('#ceilType'); if (s) s.value = v; }
    if (k === 'snap') { const b = $('#btnGridSnap'); if (b) b.classList.toggle('active', v); }
    LP.store.set('spaceCfg', CFG);
    app.drawOverlay();
  }

  /* ---------------- Nouveau plan ---------------- */
  const FORMATS = [
    ['Lettre (8½ × 11 po)', 8.5, 11], ['Légal (8½ × 14 po)', 8.5, 14], ['Tabloïd (11 × 17 po)', 11, 17],
    ['ARCH C (18 × 24 po)', 18, 24], ['ARCH D (24 × 36 po)', 24, 36], ['ARCH E1 (30 × 42 po)', 30, 42], ['ARCH E (36 × 48 po)', 36, 48],
    ['A3 (297 × 420 mm)', 11.693, 16.535], ['A2 (420 × 594 mm)', 16.535, 23.386], ['A1 (594 × 841 mm)', 23.386, 33.110], ['A0 (841 × 1189 mm)', 33.110, 46.811],
  ];
  const GRIDS = [['ft1', "1' × 1' (repère aux 5')", FT, 5], ['in6', '6" × 6" (repère au pied)', FT / 2, 2], ['m1', '1 m × 1 m (repère aux 5 m)', 1, 5], ['m05', '0,5 m × 0,5 m (repère au mètre)', 0.5, 2], ['none', 'Aucune (feuille vierge)', 0, 0]];
  let dlg = null;
  function newSheetDialog() {
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'sheetDialog'; document.body.appendChild(dlg); }
    const pi = LP.SCALE_PRESETS.findIndex((p) => p.label === (S.unit === 'ft' ? '1/4" = 1\'-0"' : '1:50'));
    dlg.innerHTML = `<h2>Nouveau plan</h2>
      <div class="sh-grid">
        <label>Nom du projet <input type="text" id="shName" value="Nouveau projet"></label>
        <label>Format <select id="shFmt">${FORMATS.map((f, i) => `<option value="${i}" ${i === 2 ? 'selected' : ''}>${f[0]}</option>`).join('')}</select></label>
        <label>Orientation <select id="shOr"><option value="l" selected>Paysage</option><option value="p">Portrait</option></select></label>
        <label>Échelle <select id="shSc">${LP.SCALE_PRESETS.map((p, i) => `<option value="${i}" ${i === pi ? 'selected' : ''}>${p.label}</option>`).join('')}</select></label>
        <label>Grille de référence <select id="shGrid">${GRIDS.map((g) => `<option value="${g[0]}" ${g[0] === (S.unit === 'ft' ? 'ft1' : 'm1') ? 'selected' : ''}>${g[1]}</option>`).join('')}</select></label>
        <label>Pages <input type="number" id="shPages" min="1" max="20" value="1"></label>
      </div>
      <p class="hint" id="shInfo"></p>
      <div class="dlg-buttons"><button id="shCancel">Annuler</button><button id="shOk" class="primary">Créer le plan</button></div>`;
    const info = () => {
      const f = FORMATS[+dlg.querySelector('#shFmt').value], land = dlg.querySelector('#shOr').value === 'l';
      const wIn = (land ? Math.max(f[1], f[2]) : Math.min(f[1], f[2])) - 1, hIn = (land ? Math.min(f[1], f[2]) : Math.max(f[1], f[2])) - 1.6;
      const mpp = LP.SCALE_PRESETS[+dlg.querySelector('#shSc').value].mpp;
      const u = /"/.test(LP.SCALE_PRESETS[+dlg.querySelector('#shSc').value].label) ? 'ft' : 'm';
      dlg.querySelector('#shInfo').textContent = `Zone de dessin ≈ ${LP.fmtDim(wIn * 72 * mpp, u, false)} × ${LP.fmtDim(hIn * 72 * mpp, u, false)} à cette échelle.`;
    };
    dlg.querySelectorAll('select').forEach((s) => s.addEventListener('change', info));
    info();
    dlg.querySelector('#shCancel').onclick = () => dlg.close();
    dlg.querySelector('#shOk').onclick = async () => {
      const o = {
        name: dlg.querySelector('#shName').value.trim() || 'Nouveau projet',
        fmt: FORMATS[+dlg.querySelector('#shFmt').value], land: dlg.querySelector('#shOr').value === 'l',
        scale: +dlg.querySelector('#shSc').value, grid: GRIDS.find((g) => g[0] === dlg.querySelector('#shGrid').value),
        pages: Math.max(1, Math.min(20, parseInt(dlg.querySelector('#shPages').value, 10) || 1)),
      };
      dlg.close();
      await createSheet(o);
    };
    dlg.showModal();
  }

  async function createSheet(o) {
    if (S.dirty && S.annots.length && !S.projHandle && !confirm('Des modifications non enregistrées seront perdues (une copie automatique existe). Continuer ?')) return;
    const L = window.PDFLib;
    const doc = await L.PDFDocument.create();
    const font = await doc.embedFont(L.StandardFonts.Helvetica);
    const bold = await doc.embedFont(L.StandardFonts.HelveticaBold);
    const wIn = o.land ? Math.max(o.fmt[1], o.fmt[2]) : Math.min(o.fmt[1], o.fmt[2]);
    const hIn = o.land ? Math.min(o.fmt[1], o.fmt[2]) : Math.max(o.fmt[1], o.fmt[2]);
    const W = wIn * 72, H = hIn * 72, M = 36, TB = 44; // marge 1/2 po, bande de titre
    const preset = LP.SCALE_PRESETS[o.scale];
    const mpp = preset.mpp;
    const imperial = /"/.test(preset.label);
    const step = o.grid[2] ? o.grid[2] / mpp : 0; // pas de la grille (pt)
    const date = new Date().toLocaleDateString('fr-CA');
    const gray = (v) => L.rgb(v, v, v);
    for (let n = 1; n <= o.pages; n++) {
      const p = doc.addPage([W, H]);
      const x0 = M, y0 = M + TB, x1 = W - M, y1 = H - M; // zone de dessin (repère PDF, y vers le haut)
      if (step >= 2) {
        // Grille : traits fins, repère plus foncé tous les N pas ; origine en haut à gauche de la zone
        let k = 0;
        for (let x = x0; x <= x1 + 0.01; x += step, k++) p.drawLine({ start: { x, y: y0 }, end: { x, y: y1 }, thickness: k % o.grid[3] ? 0.25 : 0.5, color: k % o.grid[3] ? gray(0.85) : gray(0.7) });
        k = 0;
        for (let y = y1; y >= y0 - 0.01; y -= step, k++) p.drawLine({ start: { x: x0, y }, end: { x: x1, y }, thickness: k % o.grid[3] ? 0.25 : 0.5, color: k % o.grid[3] ? gray(0.85) : gray(0.7) });
      }
      p.drawRectangle({ x: x0, y: M, width: x1 - x0, height: y1 - M, borderWidth: 1, borderColor: gray(0.2) });
      p.drawLine({ start: { x: x0, y: y0 }, end: { x: x1, y: y0 }, thickness: 0.8, color: gray(0.2) });
      p.drawText(o.name, { x: x0 + 10, y: M + 25, size: 12, font: bold, color: gray(0.1) });
      p.drawText(`Feuille ${n} de ${o.pages} · ${date}`, { x: x0 + 10, y: M + 10, size: 8, font, color: gray(0.35) });
      const right = `Échelle : ${preset.label}${o.grid[2] ? `   ·   Grille : ${o.grid[1].split(' (')[0]}` : ''}`;
      p.drawText(right, { x: x1 - 10 - font.widthOfTextAtSize(right, 9), y: M + 18, size: 9, font, color: gray(0.25) });
      // Échelle graphique : 10 pi (ou 5 m)
      const barM = imperial ? 10 * FT : 5, barPt = barM / mpp;
      if (barPt < (x1 - x0) / 3) {
        const bx = x1 - 10 - barPt, by = M + 7;
        for (let i = 0; i < 5; i++) p.drawRectangle({ x: bx + (i * barPt) / 5, y: by, width: barPt / 5, height: 3, color: i % 2 ? L.rgb(1, 1, 1) : gray(0.2), borderColor: gray(0.2), borderWidth: 0.4 });
        const lab = imperial ? "10'" : '5 m';
        p.drawText('0', { x: bx - 2, y: by + 5, size: 6, font, color: gray(0.3) });
        p.drawText(lab, { x: bx + barPt - font.widthOfTextAtSize(lab, 6) / 2, y: by + 5, size: 6, font, color: gray(0.3) });
      }
    }
    // Métadonnées : à la réouverture, LumiPlan retrouve l'échelle et la grille
    doc.setTitle(o.name);
    doc.setCreator('LumiPlan');
    doc.setKeywords([`lumiplan-sheet:${M.toFixed(2)},${M.toFixed(2)},${step.toFixed(5)},${mpp.toPrecision(10)},${o.scale},${imperial ? 'ft' : 'm'}`]);
    const bytes = await doc.save();
    S.pdfHandle = null;
    await app.openPdfBytes(bytes, `${o.name}.pdf`, {
      transfer(St) {
        St.scales = {};
        for (let n = 1; n <= o.pages; n++) St.scales[n] = { mpp, unit: imperial ? 'ft' : (S.unit === 'ft' ? 'mm' : S.unit), label: preset.label };
        if (imperial && St.unit !== 'ft') St.unit = 'ft';
      },
    });
    for (let n = 1; n <= o.pages; n++) GRID[n] = { ox: M, oy: M, step: step || (imperial ? FT : 0.1) / mpp };
    app.updateScaleUI();
    app.setTool('room');
    app.toast(`Plan « ${o.name} » créé à ${preset.label} — tracez un local (U), puis portes (D) et plafond (J). Ctrl+S pour enregistrer le projet ; « Exporter » pour garder le PDF.`, 9000);
  }

  // Feuilles générées par LumiPlan : échelle et grille relues à l'ouverture
  app.hooks.open.push(async () => {
    for (const k of Object.keys(GRID)) delete GRID[k];
    try {
      const md = await S.pdf.getMetadata();
      const kw = (md && md.info && md.info.Keywords) || '';
      const m = /lumiplan-sheet:([\d.]+),([\d.]+),([\d.]+),([\d.eE+-]+),(\d+),(ft|m)/.exec(kw);
      if (!m) return;
      const [ox, oy, step, mpp] = [+m[1], +m[2], +m[3], +m[4]];
      const preset = LP.SCALE_PRESETS[+m[5]];
      for (let n = 1; n <= S.numPages; n++) {
        GRID[n] = { ox, oy, step: step || (m[6] === 'ft' ? FT : 0.1) / mpp };
        if (!S.scales[n]) S.scales[n] = { mpp, unit: m[6] === 'ft' ? 'ft' : (S.unit === 'ft' ? 'mm' : S.unit), label: preset ? preset.label : 'Calibrée' };
      }
      app.updateScaleUI();
      const b = $('#scaleBanner'); if (b) b.hidden = true;
    } catch (e) { /* PDF ordinaire */ }
  });

  /* ---------------- Liaisons ---------------- */
  const bN = $('#btnNewSheet'); if (bN) bN.onclick = newSheetDialog;
  const sN = $('#startNewSheet'); if (sN) sN.onclick = newSheetDialog;
  const rm = $('#roomMode'); if (rm) rm.onchange = (e) => { setCfg('mode', e.target.value); app.setTool('room'); };
  const ct = $('#ceilType'); if (ct) ct.onchange = (e) => { setCfg('ceil', e.target.value); app.setTool('ceiling'); };
  const gs = $('#btnGridSnap'); if (gs) gs.onclick = () => setCfg('snap', !CFG.snap);
  (async () => {
    const c = await LP.store.get('spaceCfg');
    if (c) Object.assign(CFG, c);
    if (rm) rm.value = CFG.mode;
    if (ct) ct.value = CFG.ceil;
    if (gs) gs.classList.toggle('active', CFG.snap);
  })();

  const css = document.createElement('style');
  css.textContent = `
    #sheetDialog { width: min(560px, calc(100vw - 40px)); }
    .sh-grid { display: grid; gap: 8px; }
    .sh-grid label { display: grid; grid-template-columns: 150px 1fr; gap: 10px; align-items: center; }
  `;
  document.head.appendChild(css);
  LP.space = { CFG, GRID, createSheet, snap };
})();
