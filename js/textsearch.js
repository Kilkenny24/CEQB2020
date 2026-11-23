/*
 * Texte du PDF : recherche (Ctrl+F) et lecture automatique de l'échelle inscrite
 * sur les feuilles (« 1/8" = 1'-0" », « ÉCHELLE 1:100 »…).
 * Le texte est extrait une fois par page (pdf.js) et gardé en mémoire.
 */
(function () {
  'use strict';
  const LP = window.LP;
  const app = LP.app;
  const { S, $, esc } = app;
  const PT_IN = 1 / 72, IN = 0.0254, FT = 0.3048;

  /* ---------------- Index du texte ---------------- */
  let index = new Map(); // page -> [{ str, norm, x, y, w, h, ang }]
  let indexDoc = null;
  const norm = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  async function pageText(n) {
    if (indexDoc !== S.pdf) { index = new Map(); indexDoc = S.pdf; }
    if (index.has(n)) return index.get(n);
    const page = await S.pdf.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const m = window.pdfjsLib.Util.transform(vp.transform, it.transform);
      const h = Math.hypot(m[2], m[3]) || Math.abs(it.height) || 8;
      const ang = Math.atan2(m[1], m[0]);
      items.push({ str: it.str, norm: norm(it.str), x: m[4], y: m[5], w: it.width || h * it.str.length * 0.5, h, ang });
    }
    index.set(n, items);
    return items;
  }

  /* ---------------- Recherche ---------------- */
  const input = $('#searchInput');
  const panel = $('#searchResults');
  let results = [], cur = -1, hl = null, searchSeq = 0;

  async function search(q) {
    const seq = ++searchSeq;
    results = []; cur = -1;
    const nq = norm(q.trim());
    if (!S.pdf || nq.length < 2) { panel.hidden = true; hl = null; app.drawOverlay(); return; }
    panel.hidden = false;
    for (let n = 1; n <= S.numPages; n++) {
      if (seq !== searchSeq) return;
      const items = await pageText(n);
      for (const it of items) {
        let pos = it.norm.indexOf(nq);
        while (pos >= 0 && results.length < 500) {
          results.push({ page: n, it, pos, len: nq.length });
          pos = it.norm.indexOf(nq, pos + nq.length);
        }
      }
      if (n % 5 === 0 || n === S.numPages) render(q, n);
    }
    render(q, S.numPages, true);
  }
  function snippet(r) {
    const s = r.it.str;
    const a = Math.max(0, r.pos - 30), b = Math.min(s.length, r.pos + r.len + 40);
    return `${a ? '…' : ''}${esc(s.slice(a, r.pos))}<mark>${esc(s.slice(r.pos, r.pos + r.len))}</mark>${esc(s.slice(r.pos + r.len, b))}${b < s.length ? '…' : ''}`;
  }
  function pageName(n) {
    const l = S.pageLabels && S.pageLabels[n - 1];
    return l && l !== String(n) ? `${l} · p.${n}` : `Page ${n}`;
  }
  function render(q, upto, done) {
    let h = `<div class="sr-head"><span>${results.length ? `${results.length}${results.length >= 500 ? '+' : ''} résultat(s)` : done ? 'Aucun résultat' : 'Recherche…'}</span><span>${done ? 'Entrée : suivant · Maj+Entrée : précédent' : `${upto}/${S.numPages} pages`}</span></div>`;
    results.slice(0, 300).forEach((r, i) => {
      h += `<div class="sr${i === cur ? ' cur' : ''}" data-i="${i}"><span class="pg">${esc(pageName(r.page))}</span><span>${snippet(r)}</span></div>`;
    });
    panel.innerHTML = h;
    panel.querySelectorAll('.sr').forEach((d) => d.addEventListener('mousedown', (e) => { e.preventDefault(); go(+d.dataset.i); }));
  }
  async function go(i) {
    if (!results.length) return;
    cur = (i + results.length) % results.length;
    const r = results[cur];
    if (r.page !== S.pageNum) await app.goPage(r.page);
    // Boîte du texte trouvé (portion de l'élément de texte)
    const it = r.it, frac0 = r.pos / Math.max(it.str.length, 1), frac1 = (r.pos + r.len) / Math.max(it.str.length, 1);
    hl = { page: r.page, it, f0: frac0, f1: frac1, t: performance.now() };
    const cx = it.x + Math.cos(it.ang) * it.w * (frac0 + frac1) / 2, cy = it.y + Math.sin(it.ang) * it.w * (frac0 + frac1) / 2 - it.h / 2;
    const zoom = Math.max(S.zoom, Math.min(2.5, 18 / it.h));
    app.centerOn(cx, cy, zoom);
    panel.querySelectorAll('.sr').forEach((d) => d.classList.toggle('cur', +d.dataset.i === cur));
    const el = panel.querySelector('.sr.cur'); if (el) el.scrollIntoView({ block: 'nearest' });
    pulse();
  }
  function pulse() {
    let k = 0;
    const tick = () => { app.drawOverlay(); if (++k < 40 && hl) requestAnimationFrame(tick); };
    tick();
  }
  app.hooks.overlay.push((ctx) => {
    if (!hl || hl.page !== S.pageNum) return;
    const it = hl.it;
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.ang);
    const x0 = it.w * hl.f0, x1 = it.w * hl.f1, pad = it.h * 0.25;
    const age = (performance.now() - hl.t) / 1000;
    ctx.fillStyle = 'rgba(255, 214, 0, .45)';
    ctx.fillRect(x0 - pad, -it.h * 1.05 - pad, x1 - x0 + 2 * pad, it.h * 1.35 + 2 * pad);
    if (age < 1.2) {
      ctx.strokeStyle = `rgba(255, 140, 0, ${1 - age / 1.2})`;
      ctx.lineWidth = 2 / S.zoom;
      const g = (1 - age / 1.2) * it.h * 2;
      ctx.strokeRect(x0 - pad - g, -it.h * 1.05 - pad - g, x1 - x0 + 2 * (pad + g), it.h * 1.35 + 2 * (pad + g));
    }
    ctx.restore();
  });

  let t = null;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => search(input.value), 250); });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); if (results.length) go(cur + (e.shiftKey ? -1 : 1)); else search(input.value); }
    if (e.key === 'Escape') { input.value = ''; panel.hidden = true; hl = null; app.drawOverlay(); $('#viewer').focus(); }
  });
  input.addEventListener('focus', () => { if (results.length) panel.hidden = false; });
  input.addEventListener('blur', () => setTimeout(() => { panel.hidden = true; }, 150));
  app.hooks.key.push((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); input.focus(); input.select(); return true; }
    return false;
  });

  /* ---------------- Échelle inscrite sur la feuille ---------------- */
  const METRIC = new Set([2, 5, 10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 2000, 2500, 5000]);
  const num = (t) => {
    t = t.trim();
    let m;
    if ((m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t))) return +m[1] + m[2] / m[3];
    if ((m = /^(\d+)\/(\d+)$/.exec(t))) return m[1] / m[2];
    return parseFloat(t.replace(',', '.'));
  };
  function fracLabel(v) {
    const den = 64;
    let w = Math.floor(v), n = Math.round((v - w) * den), d = den;
    if (n === den) { w++; n = 0; }
    while (n && n % 2 === 0) { n /= 2; d /= 2; }
    return `${w || ''}${w && n ? ' ' : ''}${n ? n + '/' + d : w ? '' : '0'}`;
  }
  // Candidats d'échelle dans le texte d'une page : [{ mpp, label, unit, count }]
  async function detect(n) {
    const items = await pageText(n);
    const text = items.map((i) => i.str).join(' ')
      .replace(/[″”“]/g, '"').replace(/[′’‘´]/g, "'").replace(/[–—−]/g, '-').replace(/''/g, '"').replace(/\s+/g, ' ');
    const found = new Map();
    const add = (mpp, label, unit) => {
      const k = mpp.toPrecision(6);
      if (!found.has(k)) found.set(k, { mpp, label, unit, count: 0 });
      found.get(k).count++;
    };
    // Impérial : 1/8" = 1'-0"   3/16"=1'-0"   1" = 20'   1 1/2" = 1'-0"
    const re = /(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)\s*"\s*=\s*(\d+(?:[.,]\d+)?)\s*'(?:\s*-?\s*(\d+(?:\s+\d+\/\d+|\/\d+|[.,]\d+)?)\s*")?/g;
    let m;
    while ((m = re.exec(text))) {
      const paperIn = num(m[1]);
      const realFt = num(m[2]) + (m[3] ? num(m[3]) / 12 : 0);
      if (!(paperIn > 0) || !(realFt > 0) || realFt / paperIn > 2000) continue;
      const mpp = PT_IN * (realFt / paperIn) * FT;
      const preset = LP.SCALE_PRESETS.find((p) => Math.abs(p.mpp - mpp) / mpp < 1e-3);
      add(mpp, preset ? preset.label : `${fracLabel(paperIn)}" = ${Math.floor(realFt)}'-${fracLabel((realFt % 1) * 12)}"`, 'ft');
    }
    // Métrique : 1:100, 1 : 50
    const rm = /(?:^|[^\d:/])1\s*:\s*(\d{1,4})(?![\d:])/g;
    while ((m = rm.exec(text))) {
      const k = +m[1];
      if (!METRIC.has(k)) continue;
      add(PT_IN * IN * k, `1:${k}`, 'mm');
    }
    const asNoted = /(?:echelle|échelle|scale)\s*:?\s*(?:indiqu|tel qu|as noted|as shown)|sans [ée]chelle|\bn\.?t\.?s\b/i.test(text);
    return { list: [...found.values()].sort((a, b) => b.count - a.count), asNoted };
  }
  function applyScale(n, c) {
    S.scales[n] = { mpp: c.mpp, unit: c.unit === 'mm' ? (S.unit === 'ft' ? 'mm' : S.unit) : 'ft', label: LP.SCALE_PRESETS.some((p) => p.label === c.label) ? c.label : 'Calibrée', detected: c.label };
  }

  /* Bandeau sur une feuille non calibrée */
  const banner = $('#scaleBanner');
  const dismissed = new Set();
  async function checkPage(n) {
    banner.hidden = true;
    if (!S.pdf || S.scales[n] || dismissed.has(S.fingerprint + ':' + n)) return;
    let r;
    try { r = await detect(n); } catch (e) { return; }
    if (n !== S.pageNum || S.scales[n] || !r.list.length) return;
    const many = r.list.length > 1;
    banner.innerHTML = `${LP.icon('autoscale')}<span>${many ? 'Échelles inscrites sur cette feuille :' : 'Échelle inscrite sur cette feuille :'}</span>
      ${many ? `<select id="sbSel">${r.list.map((c, i) => `<option value="${i}">${esc(c.label)} (${c.count}×)</option>`).join('')}</select>` : `<b>${esc(r.list[0].label)}</b>`}
      <button id="sbApply" class="primary">Appliquer</button><button id="sbAll" title="Lire et appliquer l'échelle de chaque feuille">Toutes les feuilles</button>
      <button id="sbClose" title="Ignorer pour cette feuille">${LP.icon('close')}</button>`;
    if (many) banner.title = 'Plusieurs échelles (ex. détails) : choisissez celle du plan principal, puis vérifiez avec une cote connue';
    banner.hidden = false;
    banner.querySelector('#sbApply').onclick = () => {
      const c = r.list[many ? +banner.querySelector('#sbSel').value : 0];
      app.pushUndo();
      applyScale(n, c);
      banner.hidden = true;
      app.updateScaleUI(); app.changed();
      app.toast(`Échelle ${c.label} appliquée — vérifiez-la sur une cote connue (outil Longueur)`, 6000);
    };
    banner.querySelector('#sbAll').onclick = () => { banner.hidden = true; detectAll(); };
    banner.querySelector('#sbClose').onclick = () => { dismissed.add(S.fingerprint + ':' + n); banner.hidden = true; };
  }

  async function detectAll() {
    if (!S.pdf) { app.toast("Ouvrez d'abord un PDF"); return; }
    const done = [], multi = [], none = [], kept = [];
    const before = JSON.stringify(S.scales);
    const snap = { s: JSON.parse(before) };
    for (let n = 1; n <= S.numPages; n++) {
      app.toast(`Lecture des échelles… ${n}/${S.numPages}`, 60000);
      if (S.scales[n]) { kept.push(n); continue; }
      const r = await detect(n);
      if (r.list.length === 1 || (r.list.length > 1 && r.list[0].count >= 2 * r.list[1].count)) { applyScale(n, r.list[0]); done.push(`${pageName(n)} : ${r.list[0].label}${r.list.length > 1 ? ' (autres échelles présentes)' : ''}`); }
      else if (r.list.length > 1) multi.push(`${pageName(n)} : ${r.list.map((c) => c.label).join(', ')}`);
      else none.push(pageName(n) + (r.asNoted ? ' (« échelle indiquée »)' : ''));
    }
    app.toast('');
    if (done.length) {
      // Une seule étape d'annulation pour l'ensemble
      const now = JSON.stringify(S.scales);
      S.scales = snap.s; app.pushUndo(); S.scales = JSON.parse(now);
      app.updateScaleUI(); app.changed();
    }
    banner.hidden = true;
    alert(`Lecture des échelles terminée\n\n` +
      `Appliquées (${done.length}) :\n${done.slice(0, 25).join('\n') || '—'}${done.length > 25 ? '\n…' : ''}\n\n` +
      (multi.length ? `À choisir manuellement, plusieurs échelles (${multi.length}) :\n${multi.slice(0, 15).join('\n')}\n\n` : '') +
      (none.length ? `Aucune échelle lisible (${none.length}) : ${none.slice(0, 20).join(', ')}${none.length > 20 ? '…' : ''}\n\n` : '') +
      (kept.length ? `Déjà calibrées, inchangées : ${kept.length}\n\n` : '') +
      `Important : vérifiez au moins une cote connue par feuille avec l'outil Longueur (M). Un PDF peut être imprimé à une autre taille que celle prévue.`);
  }

  app.hooks.page.push((n) => { checkPage(n); });
  app.hooks.open.push(() => { index = new Map(); indexDoc = S.pdf; results = []; hl = null; input.value = ''; panel.hidden = true; checkPage(S.pageNum); });
  const b = $('#btnAutoScale');
  if (b) b.onclick = detectAll;

  LP.textSearch = { detect, pageText, search, detectAll };
})();
