/*
 * Tableau des luminaires (données par type / étiquette) et circuits / zones de contrôle.
 *  - Onglet « Tableau » : fabricant, modèle, W, lm, tension, K, montage, remarques par type ;
 *    quantités et puissance totales ; tableau plaçable sur la feuille (annotation « schedule »,
 *    recalculée automatiquement et exportée dans le PDF).
 *  - Onglet « Circuits » : charge par circuit, zones de contrôle (avertit si aucun dispositif),
 *    coloration du plan par circuit / zone / type, étiquettes de circuit sous les luminaires.
 */
(function () {
  'use strict';
  const LP = window.LP;
  const app = LP.app;
  const { S, env, $, esc } = app;

  const FIELDS = [
    { k: 'desc', label: 'Description', ph: 'ex. Encastré DEL 6 po' },
    { k: 'mfr', label: 'Fabricant', ph: 'ex. Lithonia' },
    { k: 'model', label: 'Modèle', ph: 'Numéro de catalogue' },
    { k: 'watts', label: 'Puissance (W)', num: true },
    { k: 'lumens', label: 'Flux (lm)', num: true },
    { k: 'volts', label: 'Tension', ph: 'ex. 120-347 V' },
    { k: 'cct', label: 'Temp. couleur', ph: 'ex. 3500 K' },
    { k: 'mount', label: 'Montage', ph: 'ex. Encastré T-bar' },
    { k: 'notes', label: 'Remarques', ph: '' },
  ];
  const COLS = {
    tag: { label: 'Type', align: 'center' },
    desc: { label: 'Description', max: 28 },
    mfr: { label: 'Fabricant', max: 16 },
    model: { label: 'Modèle', max: 26 },
    watts: { label: 'W', align: 'right' },
    lumens: { label: 'lm', align: 'right' },
    volts: { label: 'Tension' },
    cct: { label: 'K' },
    mount: { label: 'Montage', max: 18 },
    notes: { label: 'Remarques', max: 26 },
    qty: { label: 'Qté', align: 'right' },
    wtot: { label: 'W total', align: 'right' },
  };
  const DEFAULT_COLS = ['tag', 'desc', 'mfr', 'model', 'watts', 'qty', 'wtot'];

  const SC = { types: {}, onlyPlaced: false };
  const VIEW = { colorBy: '', showCircuit: false };
  env.ext = env.ext || {};

  const natural = (a, b) => String(a).localeCompare(String(b), 'fr', { numeric: true, sensitivity: 'base' });
  // Nombres lisibles et compatibles avec les polices PDF standard (espace ordinaire)
  const fmtN = (n) => (Math.round(n * 10) / 10).toLocaleString('fr-CA').replace(/[  ]/g, ' ');

  /* ---------------- Données ---------------- */
  function symbols() { return S.annots.filter((a) => a.type === 'symbol'); }
  function countsByTag(page) {
    const m = new Map();
    for (const a of symbols()) {
      if (page && a.page !== page) continue;
      const t = (a.tag || '').trim();
      if (!t) continue;
      if (!m.has(t)) m.set(t, { qty: 0, names: new Set() });
      const e = m.get(t);
      e.qty++;
      e.names.add(a.sym.name);
    }
    return m;
  }
  function allTags() {
    const set = new Set(Object.keys(SC.types));
    for (const t of countsByTag().keys()) set.add(t);
    if (!SC.onlyPlaced) for (const s of S.library) if (s.tag && s.tag.trim() && (s.cat || '').toLowerCase().includes('lumin')) set.add(s.tag.trim());
    return [...set].sort(natural);
  }
  function typeOf(tag) { return SC.types[tag] || {}; }
  function watts(tag) { const w = parseFloat(String(typeOf(tag).watts || '').replace(',', '.')); return isFinite(w) ? w : 0; }

  // Données d'un tableau placé (appelé à chaque dessin et à l'export PDF)
  env.ext.scheduleData = (a) => {
    const cols = (a.cols && a.cols.length ? a.cols : DEFAULT_COLS).filter((k) => COLS[k]);
    const counts = countsByTag(a.scope === 'page' ? a.page : null);
    const tags = [...counts.keys()].concat(a.includeUnplaced ? Object.keys(SC.types).filter((t) => !counts.has(t)) : []).sort(natural);
    let totQ = 0, totW = 0;
    const rows = tags.map((t) => {
      const ty = typeOf(t), q = counts.has(t) ? counts.get(t).qty : 0, w = watts(t);
      totQ += q; totW += q * w;
      return cols.map((k) => {
        switch (k) {
          case 'tag': return t;
          case 'qty': return String(q);
          case 'wtot': return w ? fmtN(q * w) : '';
          case 'watts': return w ? fmtN(w) : '';
          case 'lumens': return ty.lumens ? fmtN(parseFloat(ty.lumens) || 0) : '';
          case 'desc': return ty.desc || (counts.has(t) ? [...counts.get(t).names][0] : '');
          default: return ty[k] || '';
        }
      });
    });
    return {
      title: a.title != null ? a.title : 'TABLEAU DES LUMINAIRES',
      cols: cols.map((k) => COLS[k]),
      rows,
      foot: `Total : ${totQ} luminaire(s)${totW ? ` — ${fmtN(totW)} W` : ''}${a.scope === 'page' ? ' (cette feuille)' : ''}`,
    };
  };

  /* ---------------- Onglet Tableau ---------------- */
  const open = new Set();
  let deferred = false;
  function renderSchedule() {
    const box = $('#tab-schedule');
    if (!box) return;
    // Pas de reconstruction pendant la saisie (le focus serait perdu) : reporté à la sortie du panneau
    if (box.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName)) {
      if (!deferred) {
        deferred = true;
        box.addEventListener('focusout', function f(e) {
          if (box.contains(e.relatedTarget)) return;
          box.removeEventListener('focusout', f);
          deferred = false;
          setTimeout(renderSchedule, 0);
        });
      }
      return;
    }
    const counts = countsByTag(), pageCounts = countsByTag(S.pageNum);
    const tags = allTags();
    let totQ = 0, totW = 0;
    for (const [t, e] of counts) { totQ += e.qty; totW += e.qty * watts(t); }
    let h = `<div class="sch-total"><div><b>${totQ}</b><small>luminaires</small></div><div><b>${totW ? fmtN(totW) : '—'}</b><small>W installés</small></div><div><b>${tags.length}</b><small>types</small></div></div>
      <div class="row"><button id="schPlace" class="primary">${LP.icon('schedule')}Placer sur la feuille</button><button id="schCsv">${LP.icon('csv')}CSV</button></div>
      <label class="inline sch-opt"><input type="checkbox" id="schOnly" ${SC.onlyPlaced ? 'checked' : ''}> Seulement les types placés sur le plan</label>
      <p class="hint">Les types correspondent aux <b>étiquettes</b> des symboles (A, B1…). Les quantités se mettent à jour automatiquement, y compris dans le tableau placé sur la feuille.</p>`;
    if (!tags.length) h += '<p class="hint">Aucun type pour l\'instant : placez des luminaires étiquetés, ou ajoutez un type ci-dessous.</p>';
    for (const t of tags) {
      const ty = typeOf(t), c = counts.get(t), q = c ? c.qty : 0, pq = pageCounts.get(t) ? pageCounts.get(t).qty : 0, w = watts(t);
      const isOpen = open.has(t);
      h += `<div class="sch-card${isOpen ? ' open' : ''}" data-tag="${esc(t)}">
        <div class="sch-head"><span class="sch-tag">${esc(t)}</span>
          <span class="sch-desc">${esc(ty.desc || (c ? [...c.names][0] : 'Sans description'))}${ty.mfr || ty.model ? `<small>${esc([ty.mfr, ty.model].filter(Boolean).join(' · '))}</small>` : ''}</span>
          <span class="sch-q" title="Quantité totale (cette feuille)">${q}<small>${pq} ici</small></span>
          <span class="sch-w" title="Puissance totale">${w ? fmtN(q * w) + ' W' : '—'}</span></div>
        <div class="sch-body">${isOpen ? FIELDS.map((f) => `<label>${f.label}<input type="${f.num ? 'number' : 'text'}" ${f.num ? 'step="any" min="0"' : ''} data-f="${f.k}" value="${esc(ty[f.k] || '')}" placeholder="${esc(f.ph || '')}"></label>`).join('') +
          `<div class="row"><button data-del="${esc(t)}" class="danger">${LP.icon('trash')}Effacer les données du type</button></div>` : ''}</div>
      </div>`;
    }
    h += `<div class="row sch-add"><input type="text" id="schNew" placeholder="Nouveau type (ex. L3)"><button id="schAdd">${LP.icon('plus')}Ajouter</button></div>`;
    box.innerHTML = h;

    box.querySelector('#schPlace').onclick = placeSchedule;
    box.querySelector('#schCsv').onclick = exportCsv;
    box.querySelector('#schOnly').onchange = (e) => { SC.onlyPlaced = e.target.checked; persist(); renderSchedule(); };
    box.querySelectorAll('.sch-head').forEach((hd) => hd.addEventListener('click', () => {
      const t = hd.parentElement.dataset.tag;
      if (open.has(t)) open.delete(t); else open.add(t);
      renderSchedule();
      if (open.has(t)) { const i = box.querySelector(`.sch-card[data-tag="${CSS.escape(t)}"] input`); if (i) i.focus(); }
    }));
    box.querySelectorAll('.sch-card input[data-f]').forEach((inp) => inp.addEventListener('change', () => {
      const t = inp.closest('.sch-card').dataset.tag;
      const ty = SC.types[t] = SC.types[t] || {};
      const v = inp.value.trim();
      if (v) ty[inp.dataset.f] = v; else delete ty[inp.dataset.f];
      // Mise à jour de l'en-tête de la carte sans reconstruire les champs
      const card = inp.closest('.sch-card');
      if (inp.dataset.f === 'desc' || inp.dataset.f === 'mfr' || inp.dataset.f === 'model') {
        card.querySelector('.sch-desc').innerHTML = `${esc(ty.desc || 'Sans description')}${ty.mfr || ty.model ? `<small>${esc([ty.mfr, ty.model].filter(Boolean).join(' · '))}</small>` : ''}`;
      }
      persist();
      app.drawOverlay();
    }));
    box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
      if (!confirm(`Effacer les données du type ${b.dataset.del} ? (les symboles placés sont conservés)`)) return;
      delete SC.types[b.dataset.del];
      persist(); renderSchedule(); app.drawOverlay();
    }));
    const add = () => {
      const t = box.querySelector('#schNew').value.trim();
      if (!t) return;
      SC.types[t] = SC.types[t] || {};
      open.add(t);
      persist(); renderSchedule();
    };
    box.querySelector('#schAdd').onclick = add;
    box.querySelector('#schNew').onkeydown = (e) => { if (e.key === 'Enter') add(); };
  }
  function persist() { app.changed(); }

  function placeSchedule() {
    if (!S.pdf) { app.toast("Ouvrez d'abord un PDF"); return; }
    // Coin supérieur gauche de la zone visible, ramené à l'intérieur de la feuille
    const q = app.toPage(40, 40);
    const p = [Math.max(q[0], 40), Math.max(q[1], 40)];
    const a = app.newAnnot('schedule', [p]);
    a.fs = 7; // taille de texte usuelle sur un plan (modifiable dans les propriétés)
    a.scope = 'all';
    a.cols = DEFAULT_COLS.slice();
    a.title = 'TABLEAU DES LUMINAIRES';
    a.style = { stroke: '#1b1f24', width: 0.5, opacity: 1 };
    app.addAnnots([a]);
    S.sel = new Set([a.id]);
    app.setTool('select');
    S.sel = new Set([a.id]);
    app.refreshProps();
    app.drawOverlay();
    app.toast('Tableau placé : déplacez-le avec la souris ; réglages dans le panneau de droite', 6000);
  }

  // Propriétés d'un tableau placé
  app.hooks.props.push((target) => {
    if (target.length !== 1 || target[0].type !== 'schedule') return null;
    const a = target[0];
    const cols = a.cols && a.cols.length ? a.cols : DEFAULT_COLS;
    const html = `<label>Titre <input type="text" data-sc="title" value="${esc(a.title != null ? a.title : 'TABLEAU DES LUMINAIRES')}"></label>
      <label>Portée <select data-sc="scope"><option value="all" ${a.scope !== 'page' ? 'selected' : ''}>Tout le projet</option><option value="page" ${a.scope === 'page' ? 'selected' : ''}>Cette feuille seulement</option></select></label>
      <label>Police (pt) <input type="number" data-sc="fs" min="3" max="24" step="0.5" value="${a.fs || 7}"></label>
      <label class="inline"><input type="checkbox" data-sc="includeUnplaced" ${a.includeUnplaced ? 'checked' : ''}> Inclure les types non placés</label>
      <h3>Colonnes</h3>
      <div class="sch-cols">${Object.entries(COLS).map(([k, c]) => `<label class="inline"><input type="checkbox" data-col="${k}" ${cols.includes(k) ? 'checked' : ''}> ${c.label}</label>`).join('')}</div>
      <p class="hint">Le tableau se recalcule automatiquement et s'exporte dans le PDF (une seule marque « Tableau des luminaires » dans Bluebeam).</p>
      <div class="row"><button data-act-sc="del" class="danger">${LP.icon('trash')}Supprimer</button></div>`;
    return {
      html,
      bind(box) {
        box.querySelectorAll('[data-sc]').forEach((el) => el.addEventListener('change', () => {
          app.pushUndo();
          const k = el.dataset.sc;
          a[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Math.max(3, parseFloat(el.value) || 7) : el.value;
          app.changed();
        }));
        box.querySelectorAll('[data-col]').forEach((el) => el.addEventListener('change', () => {
          app.pushUndo();
          const order = Object.keys(COLS);
          const set = new Set(a.cols && a.cols.length ? a.cols : DEFAULT_COLS);
          if (el.checked) set.add(el.dataset.col); else set.delete(el.dataset.col);
          a.cols = order.filter((k) => set.has(k));
          app.changed();
        }));
        box.querySelector('[data-act-sc=del]').onclick = () => { app.pushUndo(); S.annots = S.annots.filter((x) => x !== a); S.sel.clear(); app.changed(); app.refreshProps(); };
      },
    };
  });

  function csvRows(rows) {
    rows.push([]);
    rows.push(['TABLEAU DES LUMINAIRES']);
    rows.push(['Type', ...FIELDS.map((f) => f.label), 'Quantité', 'W total']);
    const counts = countsByTag();
    for (const t of allTags()) {
      const ty = typeOf(t), q = counts.has(t) ? counts.get(t).qty : 0;
      rows.push([t, ...FIELDS.map((f) => ty[f.k] || ''), q, watts(t) ? String(Math.round(q * watts(t) * 10) / 10).replace('.', ',') : '']);
    }
    rows.push([]);
    rows.push(['CHARGE PAR CIRCUIT']);
    rows.push(['Circuit', 'Luminaires', 'W']);
    for (const c of circuitStats()) rows.push([c.name || '(non assigné)', c.qty, String(Math.round(c.w * 10) / 10).replace('.', ',')]);
  }
  app.hooks.csv.push(csvRows);
  async function exportCsv() {
    const rows = [];
    csvRows(rows);
    const csv = '﻿' + rows.map((r) => r.map((v) => { const s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');
    await LP.saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), (S.fileName || 'plan').replace(/\.pdf$/i, '') + '_tableau-luminaires.csv',
      { types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }] });
  }

  /* ---------------- Circuits et zones ---------------- */
  const PALETTE = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#0d9488', '#9333ea', '#ca8a04', '#4f46e5', '#be123c', '#15803d'];
  const colorMap = new Map();
  function colorFor(v) {
    if (!v) return '#9aa3ae';
    if (!colorMap.has(v)) {
      // Attribution stable : ordre naturel des valeurs du projet
      const vals = [...new Set(symbols().map((a) => a[VIEW.colorBy === 'tag' ? 'tag' : VIEW.colorBy]).filter(Boolean))].sort(natural);
      vals.forEach((x, i) => colorMap.set(x, PALETTE[i % PALETTE.length]));
      if (!colorMap.has(v)) colorMap.set(v, PALETTE[colorMap.size % PALETTE.length]);
    }
    return colorMap.get(v);
  }
  env.ext.symColor = (a) => {
    if (!VIEW.colorBy) return null;
    return colorFor(VIEW.colorBy === 'tag' ? a.tag : a[VIEW.colorBy]);
  };
  const isControl = (a) => LP.isControlSym(a.sym);

  function circuitStats() {
    const m = new Map();
    for (const a of symbols()) {
      if (isControl(a)) continue;
      const k = a.circuit || '';
      if (!m.has(k)) m.set(k, { name: k, qty: 0, w: 0, tags: new Map() });
      const e = m.get(k);
      e.qty++; e.w += watts(a.tag);
      if (a.tag) e.tags.set(a.tag, (e.tags.get(a.tag) || 0) + 1);
    }
    return [...m.values()].sort((x, y) => (x.name ? 0 : 1) - (y.name ? 0 : 1) || natural(x.name, y.name));
  }
  function zoneStats() {
    const m = new Map();
    for (const a of symbols()) {
      if (!a.zone) continue;
      if (!m.has(a.zone)) m.set(a.zone, { name: a.zone, fixtures: 0, controls: 0, pages: new Set() });
      const e = m.get(a.zone);
      if (isControl(a)) e.controls++; else e.fixtures++;
      e.pages.add(a.page);
    }
    return [...m.values()].sort((x, y) => natural(x.name, y.name));
  }
  function renderCircuits() {
    const box = $('#tab-circuits');
    if (!box) return;
    colorMap.clear();
    const cs = circuitStats(), zs = zoneStats();
    const noW = !Object.values(SC.types).some((t) => parseFloat(t.watts));
    let h = `<label class="sch-colorby">Colorer le plan <select id="ccColor">
        <option value="" ${!VIEW.colorBy ? 'selected' : ''}>Couleurs normales</option>
        <option value="circuit" ${VIEW.colorBy === 'circuit' ? 'selected' : ''}>Par circuit</option>
        <option value="zone" ${VIEW.colorBy === 'zone' ? 'selected' : ''}>Par zone de contrôle</option>
        <option value="tag" ${VIEW.colorBy === 'tag' ? 'selected' : ''}>Par type</option></select></label>
      <label class="inline sch-opt"><input type="checkbox" id="ccShow" ${VIEW.showCircuit ? 'checked' : ''}> Inscrire le circuit sous chaque luminaire</label>
      <p class="hint">Assignez circuit et zone dans le panneau <b>Propriétés</b> (sélection multiple possible : rectangle ou Maj+clic). Couleurs et inscriptions apparaissent aussi dans le PDF exporté.</p>
      <h3>Charge par circuit</h3>`;
    if (!cs.length) h += '<p class="hint">Aucun luminaire placé.</p>';
    else {
      h += `<table class="cc-table"><thead><tr><th></th><th>Circuit</th><th class="num">Lum.</th><th class="num">W</th></tr></thead><tbody>`;
      for (const c of cs) {
        h += `<tr data-circ="${esc(c.name)}" title="${[...c.tags].map(([t, n]) => `${n} × ${t}`).join(', ')}"><td><span class="sw" style="background:${VIEW.colorBy === 'circuit' ? colorFor(c.name) : 'transparent'}"></span></td>
          <td>${c.name ? esc(c.name) : '<i>non assigné</i>'}</td><td class="num">${c.qty}</td><td class="num">${c.w ? fmtN(c.w) : '—'}</td></tr>`;
      }
      h += '</tbody></table>';
      if (noW) h += '<p class="hint">Les watts viennent de l\'onglet <b>Tableau</b> (puissance par type).</p>';
    }
    h += '<h3>Zones de contrôle</h3>';
    if (!zs.length) h += '<p class="hint">Aucune zone assignée.</p>';
    else {
      h += `<table class="cc-table"><thead><tr><th></th><th>Zone</th><th class="num">Lum.</th><th class="num">Contrôles</th></tr></thead><tbody>`;
      for (const z of zs) {
        const warn = z.fixtures && !z.controls;
        h += `<tr data-zone="${esc(z.name)}" class="${warn ? 'warn' : ''}" title="${warn ? 'Aucun détecteur, interrupteur ou gradateur dans cette zone' : ''}"><td><span class="sw" style="background:${VIEW.colorBy === 'zone' ? colorFor(z.name) : 'transparent'}"></span></td>
          <td>${esc(z.name)}${warn ? ' <span class="warn-badge">⚠ sans contrôle</span>' : ''}</td><td class="num">${z.fixtures}</td><td class="num">${z.controls}</td></tr>`;
      }
      h += '</tbody></table><p class="hint">Un dispositif de contrôle = symbole dont la catégorie ou le nom évoque un contrôle (détecteur, interrupteur, gradateur, capteur).</p>';
    }
    box.innerHTML = h;
    box.querySelector('#ccColor').onchange = (e) => setColorBy(e.target.value);
    box.querySelector('#ccShow').onchange = (e) => setShowCircuit(e.target.checked);
    // Clic sur une ligne : sélectionne ces luminaires sur la feuille courante
    box.querySelectorAll('tr[data-circ], tr[data-zone]').forEach((tr) => tr.addEventListener('click', () => {
      const k = tr.dataset.circ != null ? 'circuit' : 'zone';
      const v = tr.dataset.circ != null ? tr.dataset.circ : tr.dataset.zone;
      const list = symbols().filter((a) => (a[k] || '') === v);
      const here = list.filter((a) => a.page === S.pageNum);
      if (!here.length && list.length) { app.goPage(list[0].page).then(() => selectList(list.filter((a) => a.page === list[0].page))); return; }
      selectList(here);
    }));
  }
  function selectList(list) {
    S.sel = new Set(list.map((a) => a.id));
    app.setTool('select');
    S.sel = new Set(list.map((a) => a.id));
    app.refreshProps(); app.drawOverlay();
    app.toast(`${list.length} luminaire(s) sélectionné(s) sur cette feuille`);
  }
  function setColorBy(v) {
    VIEW.colorBy = v;
    colorMap.clear();
    const sel = $('#colorBy'); if (sel) sel.value = v;
    LP.store.set('viewColorBy', v);
    app.drawOverlay(); renderCircuits();
  }
  function setShowCircuit(v) {
    VIEW.showCircuit = v;
    env.ext.showCircuit = v;
    const b = $('#btnShowCircuit'); if (b) b.classList.toggle('active', v);
    LP.store.set('viewShowCircuit', v);
    app.drawOverlay(); renderCircuits();
  }

  /* ---------------- Projet ---------------- */
  app.hooks.save.push((ext) => { ext.schedule = { types: SC.types, onlyPlaced: SC.onlyPlaced }; });
  app.hooks.load.push((ext) => {
    SC.types = (ext.schedule && ext.schedule.types) || {};
    SC.onlyPlaced = !!(ext.schedule && ext.schedule.onlyPlaced);
    renderSchedule(); renderCircuits();
  });
  app.hooks.open.push(() => { if (!S.annots.length) { SC.types = SC.types || {}; } renderSchedule(); renderCircuits(); });
  app.hooks.panels.push(() => { renderSchedule(); renderCircuits(); });

  // Ruban
  const cb = $('#colorBy');
  if (cb) cb.onchange = (e) => setColorBy(e.target.value);
  const bs = $('#btnShowCircuit');
  if (bs) bs.onclick = () => setShowCircuit(!VIEW.showCircuit);
  const bp = $('#btnPlaceSchedule');
  if (bp) bp.onclick = placeSchedule;
  (async () => {
    const c = await LP.store.get('viewColorBy');
    if (c) setColorBy(c);
    if (await LP.store.get('viewShowCircuit')) setShowCircuit(true);
    renderSchedule(); renderCircuits();
  })();

  const css = document.createElement('style');
  css.textContent = `
    .sch-total { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 10px; }
    .sch-total div { background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px; padding: 8px; text-align: center; }
    .sch-total b { display: block; font-size: 17px; font-variant-numeric: tabular-nums; }
    .sch-total small { color: var(--muted); font-size: 11px; }
    .sch-opt { margin: 2px 0 6px; font-size: 12px; }
    .sch-card { border: 1px solid var(--border); border-radius: 7px; margin-bottom: 6px; background: var(--panel); overflow: hidden; }
    .sch-card.open { border-color: var(--accent); box-shadow: var(--shadow); }
    .sch-head { display: grid; grid-template-columns: 38px 1fr auto auto; gap: 8px; align-items: center; padding: 6px 8px; cursor: pointer; }
    .sch-head:hover { background: var(--panel-2); }
    .sch-tag { font-weight: 700; background: var(--accent-soft); color: var(--accent); border-radius: 5px; text-align: center; padding: 3px 0; overflow: hidden; text-overflow: ellipsis; }
    .sch-desc { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; }
    .sch-desc small { display: block; color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; }
    .sch-q { text-align: right; font-weight: 650; font-variant-numeric: tabular-nums; }
    .sch-q small { display: block; font-weight: 400; color: var(--muted); font-size: 10.5px; }
    .sch-w { text-align: right; font-size: 12px; color: var(--muted); min-width: 52px; font-variant-numeric: tabular-nums; }
    .sch-body { display: none; padding: 4px 10px 8px; border-top: 1px solid var(--border); background: var(--panel-2); }
    .sch-card.open .sch-body { display: block; }
    .sch-body label { display: grid; grid-template-columns: 96px 1fr; gap: 6px; align-items: center; margin: 5px 0; font-size: 12px; }
    .sch-add input { flex: 1; }
    .sch-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; }
    .sch-colorby { display: grid; grid-template-columns: 110px 1fr; gap: 8px; align-items: center; margin-bottom: 6px; }
    .cc-table tr[data-circ], .cc-table tr[data-zone] { cursor: pointer; }
    .cc-table tr:hover td { background: var(--panel-2); }
    .cc-table .sw { display: inline-block; width: 11px; height: 11px; border-radius: 3px; }
    .cc-table tr.warn td { color: var(--warn); }
    .warn-badge { font-size: 10.5px; background: #fff4e5; color: #9a5300; border: 1px solid #f5c98a; border-radius: 4px; padding: 0 4px; white-space: nowrap; }
  `;
  document.head.appendChild(css);
})();
