/*
 * Nouvelle révision d'un jeu de plans :
 *  1. correspondance des feuilles (nom de feuille, sinon numéro de page) ;
 *  2. comparaison visuelle ancienne / nouvelle feuille → zones modifiées ;
 *  3. ouverture de la nouvelle révision avec les annotations reportées
 *     (+ nuages de révision facultatifs sur les zones modifiées).
 * Tout est calculé localement (rendu pdf.js des deux versions).
 */
(function () {
  'use strict';
  const LP = window.LP;
  const app = LP.app;
  const { S, $, esc } = app;

  const REV = { from: '', to: '', date: null, boxes: {}, show: true, list: [], idx: -1 };

  /* ---------------- Comparaison d'images ---------------- */
  const MAXPX = 1600;
  async function renderInk(doc, n, W, H) {
    const page = await doc.getPage(n);
    const v1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(W / v1.width, H / v1.height) });
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    await page.render({ canvasContext: g, viewport: vp, annotationMode: window.pdfjsLib.AnnotationMode.DISABLE }).promise;
    const d = g.getImageData(0, 0, W, H).data;
    const ink = new Uint8Array(W * H);
    for (let i = 0, j = 0; j < ink.length; i += 4, j++) ink[j] = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) < 190 ? 1 : 0;
    return ink;
  }
  // Dilatation (max sur un carré de rayon r), séparable
  function dilate(src, W, H, r) {
    const tmp = new Uint8Array(src.length), out = new Uint8Array(src.length);
    for (let y = 0; y < H; y++) {
      let run = 0;
      const row = y * W;
      for (let x = 0; x < W + r; x++) {
        if (x < W && src[row + x]) run = 2 * r + 1; else if (run) run--;
        const t = x - r;
        if (t >= 0 && t < W && run) tmp[row + t] = 1;
      }
    }
    for (let x = 0; x < W; x++) {
      let run = 0;
      for (let y = 0; y < H + r; y++) {
        if (y < H && tmp[y * W + x]) run = 2 * r + 1; else if (run) run--;
        const t = y - r;
        if (t >= 0 && t < H && run) out[t * W + x] = 1;
      }
    }
    return out;
  }
  // Zones modifiées en coordonnées normalisées (0…1) : [{x, y, w, h, n}]
  async function diffPages(docA, a, docB, b) {
    const pa = await docA.getPage(a), pb = await docB.getPage(b);
    const va = pa.getViewport({ scale: 1 }), vb = pb.getViewport({ scale: 1 });
    const k = MAXPX / Math.max(va.width, va.height);
    const W = Math.round(va.width * k), H = Math.round(va.height * k);
    const A = await renderInk(docA, a, W, H), B = await renderInk(docB, b, W, H);
    const Ad = dilate(A, W, H, 2), Bd = dilate(B, W, H, 2);
    const CELL = 12, cw = Math.ceil(W / CELL), ch = Math.ceil(H / CELL);
    const cnt = new Uint16Array(cw * ch);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if ((A[i] && !Bd[i]) || (B[i] && !Ad[i])) cnt[((y / CELL) | 0) * cw + ((x / CELL) | 0)]++;
    }
    const on = new Uint8Array(cw * ch);
    for (let i = 0; i < on.length; i++) on[i] = cnt[i] >= 4 ? 1 : 0;
    // Regroupement des cellules voisines (tolérance d'une cellule)
    const seen = new Uint8Array(on.length), boxes = [];
    for (let i = 0; i < on.length; i++) {
      if (!on[i] || seen[i]) continue;
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, tot = 0;
      const st = [i]; seen[i] = 1;
      while (st.length) {
        const j = st.pop(), cx = j % cw, cy = (j / cw) | 0;
        x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy); tot += cnt[j];
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
          const q = ny * cw + nx;
          if (on[q] && !seen[q]) { seen[q] = 1; st.push(q); }
        }
      }
      if (tot < 30) continue; // bruit (anticrénelage, déplacement d'un pixel)
      boxes.push({ x: (x0 * CELL) / W, y: (y0 * CELL) / H, w: ((x1 - x0 + 1) * CELL) / W, h: ((y1 - y0 + 1) * CELL) / H, n: tot });
    }
    // Fusion des boîtes qui se chevauchent
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < boxes.length && !merged; i++) for (let j = i + 1; j < boxes.length; j++) {
        const p = boxes[i], q = boxes[j], m = 0.004;
        if (p.x - m < q.x + q.w && q.x - m < p.x + p.w && p.y - m < q.y + q.h && q.y - m < p.y + p.h) {
          const x = Math.min(p.x, q.x), y = Math.min(p.y, q.y);
          boxes[i] = { x, y, w: Math.max(p.x + p.w, q.x + q.w) - x, h: Math.max(p.y + p.h, q.y + q.h) - y, n: p.n + q.n };
          boxes.splice(j, 1); merged = true; break;
        }
      }
    }
    const sameSize = Math.abs(va.width - vb.width) < 1 && Math.abs(va.height - vb.height) < 1;
    return { boxes: boxes.sort((p, q) => p.y - q.y || p.x - q.x), sameSize, ratio: [vb.width / va.width, vb.height / va.height] };
  }

  /* ---------------- Boîte de dialogue ---------------- */
  let dlg = null;
  function ensureDialog() {
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.id = 'revDialog';
    document.body.appendChild(dlg);
    return dlg;
  }
  const label = (labels, n) => { const l = labels && labels[n - 1]; return l && l !== String(n) ? `${l} (p.${n})` : `Page ${n}`; };

  async function start() {
    if (!S.pdf) { app.toast("Ouvrez d'abord le PDF de la révision précédente"); return; }
    let file, handle = null;
    if (window.showOpenFilePicker) {
      try {
        [handle] = await window.showOpenFilePicker({ types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }], id: 'lumiplan-rev', ...(S.pdfHandle ? { startIn: S.pdfHandle } : {}) });
        file = await handle.getFile();
      } catch (e) { if (e.name === 'AbortError') return; }
    }
    if (!file) {
      file = await new Promise((res) => { const i = $('#fileRev'); i.onchange = () => { const f = i.files[0]; i.value = ''; res(f); }; i.click(); });
      if (!file) return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    let newDoc;
    try { newDoc = await window.pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise; } catch (e) { alert('PDF illisible : ' + e.message); return; }
    const newLabels = await newDoc.getPageLabels().catch(() => null);
    const annotated = new Map();
    for (const a of S.annots) if (a.type !== 'calibrate') annotated.set(a.page, (annotated.get(a.page) || 0) + 1);
    // Correspondance automatique : nom de feuille identique, sinon même numéro
    const auto = (n) => {
      const l = S.pageLabels && S.pageLabels[n - 1];
      if (l && newLabels) { const j = newLabels.indexOf(l); if (j >= 0) return j + 1; }
      return n <= newDoc.numPages ? n : 0;
    };
    const d = ensureDialog();
    const opts = (sel) => `<option value="0">— ne pas reporter —</option>` + Array.from({ length: newDoc.numPages }, (_, i) => `<option value="${i + 1}" ${sel === i + 1 ? 'selected' : ''}>${esc(label(newLabels, i + 1))}</option>`).join('');
    const rows = Array.from({ length: S.numPages }, (_, i) => i + 1).map((n) => `<tr class="${annotated.has(n) ? '' : 'muted'}"><td>${esc(label(S.pageLabels, n))}</td><td class="num">${annotated.get(n) || ''}</td><td><select data-old="${n}">${opts(auto(n))}</select></td></tr>`).join('');
    d.innerHTML = `<h2>Nouvelle révision</h2>
      <p class="hint">Les annotations de <b>${esc(S.fileName)}</b> seront reportées sur <b>${esc(file.name)}</b> (${newDoc.numPages} pages). Vérifiez la correspondance des feuilles.</p>
      <div class="rev-table"><table><thead><tr><th>Feuille actuelle</th><th class="num">Annot.</th><th>Feuille de la révision</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="rev-opts">
        <label class="inline"><input type="checkbox" id="revCompare" checked> Comparer les feuilles et repérer les zones modifiées</label>
        <label class="inline"><input type="checkbox" id="revAll"> Comparer aussi les feuilles sans annotation (plus long)</label>
        <label class="inline"><input type="checkbox" id="revClouds"> Ajouter un nuage de révision sur chaque zone modifiée</label>
        <label class="inline"><input type="checkbox" id="revOthers" checked> Reporter les commentaires des autres participants</label>
      </div>
      <p class="hint" id="revProg"></p>
      <div class="dlg-buttons"><button id="revCancel">Annuler</button><button id="revGo" class="primary">Reporter et comparer</button></div>`;
    d.showModal();
    d.querySelector('#revCancel').onclick = async () => { d.close(); await newDoc.destroy().catch(() => {}); };
    d.querySelector('#revGo').onclick = async () => {
      const map = new Map();
      d.querySelectorAll('select[data-old]').forEach((s) => { if (+s.value) map.set(+s.dataset.old, +s.value); });
      const o = { compare: d.querySelector('#revCompare').checked, all: d.querySelector('#revAll').checked, clouds: d.querySelector('#revClouds').checked, others: d.querySelector('#revOthers').checked };
      d.querySelector('#revGo').disabled = true;
      try { await run(map, o, newDoc, bytes, file.name, handle, (m) => { d.querySelector('#revProg').textContent = m; }); d.close(); }
      catch (e) { console.error(e); alert('Échec : ' + e.message); d.querySelector('#revGo').disabled = false; }
    };
  }

  async function run(map, o, newDoc, bytes, name, handle, prog) {
    // 1. Comparaison (avant de quitter l'ancienne révision)
    const boxes = {}, ratios = {};
    let warnSize = 0;
    if (o.compare) {
      const pairs = [...map].filter(([p]) => o.all || S.annots.some((a) => a.page === p));
      let k = 0;
      for (const [p, q] of pairs) {
        prog(`Comparaison des feuilles… ${++k}/${pairs.length}`);
        const r = await diffPages(S.pdf, p, newDoc, q);
        boxes[q] = r.boxes;
        if (!r.sameSize) warnSize++;
      }
    }
    for (const [p, q] of map) {
      const va = (await S.pdf.getPage(p)).getViewport({ scale: 1 }), vb = (await newDoc.getPage(q)).getViewport({ scale: 1 });
      ratios[p] = [vb.width / va.width, vb.height / va.height, vb.width, vb.height];
      if (Math.abs(va.width - vb.width) > 1 || Math.abs(va.height - vb.height) > 1) warnSize = Math.max(warnSize, 1);
    }
    // 2. Annotations reportées (copies indépendantes, sans lien vers l'ancien PDF)
    prog('Report des annotations…');
    const moved = [];
    const idMap = new Map();
    for (const a of S.annots) {
      if (!map.has(a.page) || a.type === 'calibrate') continue;
      if (a.src && !o.others) continue;
      const c = JSON.parse(JSON.stringify(a));
      delete c.src; delete c.srcStamp;
      (c.replies || []).forEach((r) => { delete r.src; delete r.srcText; });
      c.id = LP.uid();
      idMap.set(a.id, c.id);
      c.page = map.get(a.page);
      const [rx, ry] = ratios[a.page];
      if (Math.abs(rx - 1) > 1e-3 || Math.abs(ry - 1) > 1e-3) c.pts = c.pts.map((q) => [q[0] * rx, q[1] * ry]);
      moved.push(c);
    }
    // Câbles : reliés aux copies reportées (ceux dont une extrémité n'est pas reportée sont abandonnés)
    for (let i = moved.length - 1; i >= 0; i--) {
      const c = moved[i];
      if (c.type === 'door') { if (idMap.has(c.room)) c.room = idMap.get(c.room); else moved.splice(i, 1); continue; }
      if (c.type !== 'cable') continue;
      if (idMap.has(c.from) && idMap.has(c.to)) { c.from = idMap.get(c.from); c.to = idMap.get(c.to); } else moved.splice(i, 1);
    }
    const scales = {};
    for (const [p, q] of map) if (S.scales[p]) {
      const sc = Object.assign({}, S.scales[p]);
      const [rx] = ratios[p];
      if (Math.abs(rx - 1) > 1e-3) { sc.mpp = sc.mpp / rx; sc.label = 'Calibrée'; } // même dessin, imprimé à une autre taille
      scales[q] = sc;
    }
    const extData = {};
    app.hooks.save.forEach((f) => f(extData));
    const fromName = S.fileName;
    // 3. Ouverture de la révision (le document de comparaison est libéré après : le moteur PDF est partagé)
    prog('Ouverture de la révision…');
    S.pdfHandle = handle;
    await app.openPdfBytes(bytes, name, {
      transfer(St) {
        St.annots = St.annots.concat(moved);
        St.scales = scales;
        app.hooks.load.forEach((f) => f(extData)); // tableau des luminaires, etc.
      },
    });
    await newDoc.destroy().catch(() => {});
    // Zones modifiées : coordonnées de page de la nouvelle révision
    REV.from = fromName; REV.to = name; REV.date = new Date().toISOString(); REV.boxes = {};
    for (const [q, list] of Object.entries(boxes)) {
      const vp = (await S.pdf.getPage(+q)).getViewport({ scale: 1 });
      REV.boxes[q] = list.map((b) => ({ x: b.x * vp.width, y: b.y * vp.height, w: b.w * vp.width, h: b.h * vp.height }));
    }
    REV.show = true;
    buildList();
    let clouds = 0;
    if (o.clouds) {
      const list = [];
      for (const [q, bs] of Object.entries(REV.boxes)) for (const b of bs) {
        const c = app.newAnnot('cloud', [[b.x - 6, b.y - 6], [b.x + b.w + 6, b.y + b.h + 6]]);
        c.page = +q;
        c.style = Object.assign({}, c.style, { stroke: '#c026d3', width: 1.5, arc: 12 });
        c.comment = `Modification détectée (${fromName} → ${name})`;
        list.push(c);
      }
      if (list.length) { app.addAnnots(list); clouds = list.length; }
    }
    S.sel.clear();
    app.changed();
    app.refreshProps();
    renderBox(); setToggle(); app.drawOverlay();
    const nz = REV.list.length;
    app.toast(`${moved.length} annotation(s) reportée(s)${o.compare ? ` · ${nz} zone(s) modifiée(s)` : ''}${clouds ? ` · ${clouds} nuage(s)` : ''} — enregistrez le projet de cette révision (Ctrl+S)`, 9000);
    if (warnSize) alert('Certaines feuilles n\'ont pas la même taille dans la nouvelle révision : les annotations ont été mises à l\'échelle proportionnellement. Vérifiez leur position sur ces feuilles.');
    if (nz) goDiff(0);
  }

  /* ---------------- Navigation dans les zones modifiées ---------------- */
  function buildList() {
    REV.list = [];
    for (const [q, bs] of Object.entries(REV.boxes)) bs.forEach((b, i) => REV.list.push({ page: +q, b, i }));
    REV.list.sort((x, y) => x.page - y.page || x.b.y - y.b.y);
    REV.idx = -1;
  }
  async function goDiff(i) {
    if (!REV.list.length) { app.toast('Aucune zone modifiée repérée'); return; }
    REV.idx = (i + REV.list.length) % REV.list.length;
    const { page, b } = REV.list[REV.idx];
    if (!REV.show) { REV.show = true; setToggle(); }
    if (page !== S.pageNum) await app.goPage(page);
    const v = app.view();
    const zoom = Math.max(0.2, Math.min(4, (v.w * 0.6) / Math.max(b.w, 20), (v.h * 0.6) / Math.max(b.h, 20)));
    app.centerOn(b.x + b.w / 2, b.y + b.h / 2, zoom);
    app.toast(`Zone modifiée ${REV.idx + 1} / ${REV.list.length}`);
    renderBox();
  }
  function setToggle() { const t = $('#btnDiffToggle'); if (t) t.classList.toggle('active', REV.show && REV.list.length > 0); }

  app.hooks.overlay.push((ctx) => {
    if (!REV.show) return;
    const bs = REV.boxes[S.pageNum];
    if (!bs || !bs.length) return;
    ctx.save();
    const cur = REV.idx >= 0 && REV.list[REV.idx] && REV.list[REV.idx].page === S.pageNum ? REV.list[REV.idx].b : null;
    for (const b of bs) {
      const m = 4 / S.zoom;
      ctx.fillStyle = 'rgba(192, 38, 211, .10)';
      ctx.fillRect(b.x - m, b.y - m, b.w + 2 * m, b.h + 2 * m);
      ctx.strokeStyle = b === cur ? '#a21caf' : 'rgba(192, 38, 211, .85)';
      ctx.lineWidth = (b === cur ? 2.5 : 1.3) / S.zoom;
      ctx.setLineDash(b === cur ? [] : [6 / S.zoom, 4 / S.zoom]);
      ctx.strokeRect(b.x - m, b.y - m, b.w + 2 * m, b.h + 2 * m);
    }
    ctx.restore();
  });

  /* ---------------- Onglet Pages : résumé ---------------- */
  function renderBox() {
    const box = $('#revisionBox');
    if (!box) return;
    if (!REV.from) { box.innerHTML = `<div class="rev-empty"><button id="revStart2">${LP.icon('revision')}Nouvelle révision…</button><p class="hint">Reporte vos annotations sur la révision suivante du jeu de plans et repère ce qui a changé.</p></div>`; box.querySelector('#revStart2').onclick = start; return; }
    const per = Object.entries(REV.boxes).filter(([, bs]) => bs.length).sort((a, b) => a[0] - b[0]);
    box.innerHTML = `<h3>Révision</h3>
      <div class="rev-sum"><div><small>De</small> ${esc(REV.from)}</div><div><small>À</small> ${esc(REV.to)}</div>
      <div><b>${REV.list.length}</b> zone(s) modifiée(s) sur <b>${per.length}</b> feuille(s)</div></div>
      <div class="row"><button id="revPrev">${LP.icon('prev')}Précédente</button><button id="revNext">Suivante${LP.icon('next')}</button></div>
      ${per.map(([q, bs]) => `<div class="item rev-pg" data-p="${q}"><span>${esc(label(S.pageLabels, +q))}</span><span class="meta">${bs.length} zone(s)</span></div>`).join('')}
      <div class="row"><button id="revClear" class="danger">${LP.icon('close')}Effacer le repérage</button></div>`;
    box.querySelector('#revPrev').onclick = () => goDiff(REV.idx - 1);
    box.querySelector('#revNext').onclick = () => goDiff(REV.idx + 1);
    box.querySelectorAll('.rev-pg').forEach((d) => d.onclick = () => { const i = REV.list.findIndex((r) => r.page === +d.dataset.p); goDiff(i); });
    box.querySelector('#revClear').onclick = () => {
      if (!confirm('Effacer le repérage des zones modifiées ? (les nuages ajoutés restent)')) return;
      Object.assign(REV, { from: '', to: '', boxes: {}, list: [], idx: -1 });
      app.changed(); renderBox(); setToggle(); app.drawOverlay();
    };
  }

  /* ---------------- Projet ---------------- */
  app.hooks.save.push((ext) => { if (REV.from) ext.revision = { from: REV.from, to: REV.to, date: REV.date, boxes: REV.boxes }; });
  app.hooks.load.push((ext) => {
    const r = ext.revision;
    Object.assign(REV, r ? { from: r.from, to: r.to, date: r.date, boxes: r.boxes || {} } : { from: '', to: '', boxes: {} });
    buildList(); renderBox(); setToggle(); app.drawOverlay();
  });
  app.hooks.open.push(() => { if (!REV._keep) { /* nouveau document : le projet chargé fournit le repérage */ } renderBox(); setToggle(); });

  const bR = $('#btnRevision'); if (bR) bR.onclick = start;
  const bT = $('#btnDiffToggle'); if (bT) bT.onclick = () => { if (!REV.list.length) { app.toast('Aucune zone modifiée : utilisez « Nouvelle révision »'); return; } REV.show = !REV.show; setToggle(); app.drawOverlay(); };
  const bP = $('#btnDiffPrev'); if (bP) bP.onclick = () => goDiff(REV.idx - 1);
  const bN = $('#btnDiffNext'); if (bN) bN.onclick = () => goDiff(REV.idx + 1);
  renderBox();

  const css = document.createElement('style');
  css.textContent = `
    #revDialog { width: min(720px, calc(100vw - 40px)); }
    .rev-table { max-height: 46vh; overflow: auto; border: 1px solid var(--border); border-radius: 8px; margin: 10px 0; }
    .rev-table table td, .rev-table table th { padding: 5px 8px; }
    .rev-table thead th { position: sticky; top: 0; background: var(--panel-2); }
    .rev-table tr.muted td:first-child { color: var(--muted); }
    .rev-table select { width: 100%; min-height: 0; height: 26px; }
    .rev-opts { display: grid; gap: 6px; margin: 8px 0; }
    .rev-empty { border: 1px dashed var(--border-strong); border-radius: 8px; padding: 10px; margin-bottom: 6px; }
    .rev-empty button { width: 100%; }
    .rev-sum { background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; display: grid; gap: 3px; font-size: 12px; }
    .rev-sum small { color: var(--muted); display: inline-block; width: 22px; }
    .rev-pg { padding: 6px 8px; border-radius: 5px; cursor: pointer; display: flex; justify-content: space-between; }
    .rev-pg:hover { background: var(--panel-2); }
  `;
  document.head.appendChild(css);

  LP.revision = { diffPages, state: REV, start, goDiff };
})();
