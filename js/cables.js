/*
 * Câblage : liaisons entre composantes (symboles) par type de câble, longueurs approximatives,
 * hauteurs de montage.
 *  - Outil « Câble » (W) : clic sur une composante, puis sur la suivante (chaînage).
 *  - Au plus 3 types de câbles différents par composante.
 *  - Longueur ≈ (longueur de la courbe sur le plan + différence de hauteur des extrémités
 *    + raccordement à chaque extrémité) × (1 + réserve).
 */
(function () {
  'use strict';
  const LP = window.LP;
  const app = LP.app;
  const { S, env, $, esc } = app;
  env.ext = env.ext || {};

  // Couleur + motif de trait distincts (lisibles aussi en noir et blanc), en multiples de l'épaisseur
  const TYPES = [
    { k: '120V', label: '120 V', color: '#1b1f24', width: 1.1, dash: [] },
    { k: '0-10V', label: '0-10 V', color: '#7c3aed', width: 0.8, dash: [5, 2.5] },
    { k: 'CAT5e', label: 'CAT5e', color: '#2563eb', width: 0.8, dash: [6, 2, 1, 2] },
    { k: 'DMX', label: 'DMX', color: '#ea580c', width: 0.9, dash: [] },
    { k: '12V', label: '12 V', color: '#16a34a', width: 0.8, dash: [1, 2] },
    { k: '24V', label: '24 V', color: '#0d9488', width: 0.8, dash: [3, 2] },
    { k: '48V', label: '48 V', color: '#a16207', width: 0.8, dash: [8, 3] },
    { k: 'LAN', label: 'LAN', color: '#0891b2', width: 0.8, dash: [6, 2, 1, 2, 1, 2] },
  ];
  const TYPE = Object.fromEntries(TYPES.map((t) => [t.k, t]));
  const MAX_TYPES = 3;
  const FT = 0.3048;

  // Réglages enregistrés avec le projet
  const CFG = { reserve: 10, allowance: 1 * FT };
  const VIEW = { labels: true, lengths: false, height: false, type: 'DMX' };

  /* ---------------- Accès rapide aux annotations ---------------- */
  let cacheRef = null, cacheLen = -1, cacheMap = new Map();
  function byId(id) {
    if (cacheRef !== S.annots || cacheLen !== S.annots.length) {
      cacheMap = new Map(S.annots.map((a) => [a.id, a]));
      cacheRef = S.annots; cacheLen = S.annots.length;
    }
    const a = cacheMap.get(id);
    return a && a.type === 'symbol' ? a : null;
  }
  const cables = () => S.annots.filter((a) => a.type === 'cable');
  const pairKey = (a) => (String(a.from) < String(a.to) ? a.from + '|' + a.to : a.to + '|' + a.from);
  // Rang du câble parmi ceux qui relient les mêmes composantes (0, 1, 2…)
  // Rang stable : ordre de création (un nouveau câble ne déplace pas les existants)
  function cableLane(a) {
    const k = pairKey(a);
    const key = (c) => `${c.created || ''}|${c.id}`;
    const me = key(a);
    let i = 0;
    for (const c of S.annots) if (c !== a && c.type === 'cable' && c.page === a.page && pairKey(c) === k && key(c) < me) i++;
    return i;
  }
  function typesOf(sym, except) {
    const set = new Set();
    for (const c of cables()) if (c !== except && (c.from === sym.id || c.to === sym.id)) set.add(c.ctype);
    return set;
  }

  /* ---------------- Longueurs ---------------- */
  // Hauteur d'un luminaire ; null pour un contrôle d'éclairage (pas de hauteur de montage)
  const mh = (a) => (!a || LP.isControlSym(a.sym) ? null : a.mh != null ? a.mh : env.ext.defaultHeight || 3.048);
  function lengthOf(a) {
    const sc = env.scaleFor(a.page);
    if (!sc) return null;
    const g = LP.cableGeom(a, env);
    const A = byId(a.from), B = byId(a.to);
    const plan = g.len * sc.mpp;
    // Différence de hauteur : seulement entre deux luminaires
    const hA = mh(A), hB = mh(B);
    const dh = hA != null && hB != null ? Math.abs(hA - hB) : 0;
    const total = (plan + dh + 2 * CFG.allowance) * (1 + CFG.reserve / 100);
    return { plan, dh, total };
  }
  function fmtLen(m) {
    if (m == null) return '—';
    if (S.unit === 'ft') {
      const ft = m / FT;
      return ft >= 10 ? `${Math.round(ft)}'` : LP.fmtDim(m, 'ft', false);
    }
    return `${(Math.round(m * 10) / 10).toString().replace('.', ',')} m`;
  }

  /* ---------------- Fonctions de dessin fournies au moteur ---------------- */
  Object.assign(env.ext, {
    byId,
    cableLane,
    cableStyle: (k) => TYPE[k] || TYPES[0],
    cableLabel(a, long) {
      const t = TYPE[a.ctype] ? TYPE[a.ctype].label : String(a.ctype || '');
      if (!(long || VIEW.lengths)) return t;
      const L = lengthOf(a);
      return L ? `${t} · ${fmtLen(L.total)}` : t;
    },
    cableLabels: VIEW.labels,
    showHeight: VIEW.height,
    defaultHeight: 10 * FT,
  });

  /* ---------------- Outil de tracé ---------------- */
  let start = null, hoverP = null;
  function symbolAt(p) {
    const tol = 6 / S.zoom;
    for (let i = S.annots.length - 1; i >= 0; i--) {
      const a = S.annots[i];
      if (a.type === 'symbol' && a.page === S.pageNum && LP.hitAnnotation(a, p[0], p[1], tol)) return a;
    }
    return null;
  }
  const symName = (a) => (a ? `${a.sym.name}${a.tag ? ' [' + a.tag + ']' : ''}` : '—');
  app.hooks.tool.cable = {
    down(p, e) {
      if (e.button !== 0) return;
      const sym = symbolAt(p);
      if (!sym) { app.toast('Cliquez sur une composante (symbole) pour la relier'); return; }
      if (!start) { start = sym; app.toast(`Départ : ${symName(sym)} — cliquez la composante suivante`, 5000); app.drawOverlay(); app.refreshProps(); return; }
      if (sym === start) return;
      const t = VIEW.type;
      for (const s of [start, sym]) {
        const ts = typesOf(s);
        if (!ts.has(t) && ts.size >= MAX_TYPES) {
          alert(`« ${symName(s)} » a déjà ${MAX_TYPES} types de câbles (${[...ts].join(', ')}).\nMaximum : ${MAX_TYPES} types par composante.`);
          return;
        }
      }
      const c = app.newAnnot('cable', [start.pts[0].slice(), sym.pts[0].slice()]);
      c.ctype = t; c.from = start.id; c.to = sym.id;
      c.style = { width: 1, opacity: 1 };
      app.pushUndo();
      app.insertLayer(c); // sous les symboles, au-dessus des locaux
      app.changed();
      start = sym; // chaînage
      const L = lengthOf(c);
      app.toast(`${TYPE[t].label} : ${symName(c.from && byId(c.from))} → ${symName(sym)}${L ? ' ≈ ' + fmtLen(L.total) : ''} — cliquez la suivante ou Échap`, 6000);
    },
    move(p) { hoverP = p; if (start) app.drawOverlay(); },
    cancel() { start = null; hoverP = null; },
  };
  // Panneau de droite quand l'outil Câble est actif
  app.hooks.toolProps.cable = () => ({
    html: `<label>Type <select id="cbTypeP">${TYPES.map((t) => `<option value="${t.k}" ${t.k === VIEW.type ? 'selected' : ''}>${t.label}</option>`).join('')}</select></label>
      <p class="hint">${start ? `Départ : <b>${esc(symName(start))}</b>. Cliquez la composante suivante ; Échap pour terminer le chaînage.` : 'Cliquez une composante (symbole), puis la suivante. Le tracé continue en chaîne d\'une composante à l\'autre.'}</p>
      <p class="hint">Au plus ${MAX_TYPES} types de câbles par composante. Plusieurs câbles entre deux mêmes composantes sont écartés automatiquement ; la courbure se règle dans les propriétés du câble.</p>
      <div class="cb-legend">${TYPES.map((t) => `<div><svg width="44" height="10"><line x1="2" y1="5" x2="42" y2="5" stroke="${t.color}" stroke-width="${t.width * 1.8}" stroke-dasharray="${t.dash.map((d) => d * t.width * 1.8).join(' ')}"/></svg>${t.label}</div>`).join('')}</div>`,
    bind(box) { box.querySelector('#cbTypeP').onchange = (e) => { VIEW.type = e.target.value; const s = $('#cableType'); if (s) s.value = VIEW.type; setView('type', VIEW.type); }; },
  });
  app.hooks.key.push((e, inField) => {
    if (!inField && e.key === 'Escape' && start) { start = null; app.drawOverlay(); app.toast('Chaînage terminé'); return true; }
    return false;
  });
  app.hooks.overlay.push((ctx) => {
    if (S.tool !== 'cable' || !start || start.page !== S.pageNum) return;
    const st = TYPE[VIEW.type];
    ctx.save();
    ctx.strokeStyle = st.color; ctx.lineWidth = 2 / S.zoom;
    const [x, y] = start.pts[0];
    ctx.beginPath(); ctx.arc(x, y, 10 / S.zoom, 0, Math.PI * 2); ctx.stroke();
    if (hoverP) {
      const dx = hoverP[0] - x, dy = hoverP[1] - y, L = Math.hypot(dx, dy) || 1;
      const qx = (x + hoverP[0]) / 2 - (dy / L) * L * 0.24, qy = (y + hoverP[1]) / 2 + (dx / L) * L * 0.24;
      ctx.setLineDash([6 / S.zoom, 4 / S.zoom]);
      ctx.lineWidth = 1.4 / S.zoom;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(qx, qy, hoverP[0], hoverP[1]); ctx.stroke();
    }
    ctx.restore();
  });

  /* ---------------- Propriétés ---------------- */
  // Symboles : câbles reliés (information)
  app.hooks.propsExtra.push((target) => {
    if (target.length !== 1) return '';
    const s = target[0];
    const counts = new Map();
    for (const c of cables()) if (c.from === s.id || c.to === s.id) counts.set(c.ctype, (counts.get(c.ctype) || 0) + 1);
    if (!counts.size) return '';
    return `<p class="hint">Câbles : ${[...counts].map(([k, n]) => `<b style="color:${TYPE[k] ? TYPE[k].color : 'inherit'}">${esc(TYPE[k] ? TYPE[k].label : k)}</b> ×${n}`).join(', ')} <span title="Maximum ${MAX_TYPES} types par composante">(${counts.size}/${MAX_TYPES} types)</span></p>`;
  });
  // Câbles sélectionnés : panneau dédié
  app.hooks.props.push((target) => {
    if (!target.length || target.some((a) => a.type !== 'cable')) return null;
    const a = target[0], one = target.length === 1;
    const L = one ? lengthOf(a) : null;
    let tot = 0, unknown = 0;
    for (const c of target) { const l = lengthOf(c); if (l) tot += l.total; else unknown++; }
    const html = `
      ${one ? `<p class="hint"><b>${esc(symName(byId(a.from)))}</b><br>→ <b>${esc(symName(byId(a.to)))}</b></p>` : `<p class="hint">${target.length} câbles sélectionnés</p>`}
      <label>Type <select data-cb="ctype">${TYPES.map((t) => `<option value="${t.k}" ${target.every((c) => c.ctype === t.k) ? 'selected' : ''}>${t.label}</option>`).join('')}</select></label>
      ${one ? `<label>Courbure <input type="range" data-cb="bend" min="-3" max="3" step="0.25" value="${a.bend != null ? a.bend : 1}"></label>` : ''}
      <label>Épaisseur × <input type="number" data-cb="w" min="0.25" max="5" step="0.25" value="${(a.style && a.style.width) || 1}"></label>
      <h3>Longueur approximative</h3>
      ${one ? (L ? `<table class="cb-len"><tr><td>Sur le plan</td><td class="num">${fmtLen(L.plan)}</td></tr>
          <tr><td>Différence de hauteur</td><td class="num">${mh(byId(a.from)) == null || mh(byId(a.to)) == null ? '— (contrôle)' : fmtLen(L.dh)}</td></tr>
          <tr><td>Raccordements (2 ×)</td><td class="num">${fmtLen(2 * CFG.allowance)}</td></tr>
          <tr><td>Réserve</td><td class="num">${CFG.reserve} %</td></tr>
          <tr class="tot"><td>Total</td><td class="num">${fmtLen(L.total)}</td></tr></table>`
        : '<p class="hint">Page non calibrée : longueur inconnue.</p>')
      : `<p class="hint"><b>${fmtLen(tot)}</b>${unknown ? ` (+ ${unknown} sur page non calibrée)` : ''}</p>`}
      ${one ? `<label class="full"><span>Commentaire</span><textarea data-cb="comment">${esc(a.comment || '')}</textarea></label>` : ''}
      <div class="row"><button data-cb-act="del" class="danger">${LP.icon('trash')}Supprimer</button></div>`;
    return {
      html,
      bind(box) {
        box.querySelectorAll('[data-cb]').forEach((el) => el.addEventListener(el.type === 'range' ? 'input' : 'change', () => {
          const k = el.dataset.cb;
          if (k === 'ctype') {
            for (const c of target) for (const s of [byId(c.from), byId(c.to)]) {
              if (!s) continue;
              const ts = typesOf(s, c);
              if (!ts.has(el.value) && ts.size >= MAX_TYPES) { alert(`« ${symName(s)} » a déjà ${MAX_TYPES} types de câbles : changement refusé.`); app.refreshProps(); return; }
            }
          }
          if (el.type !== 'range') app.pushUndo();
          for (const c of target) {
            if (k === 'ctype') c.ctype = el.value;
            else if (k === 'bend') c.bend = parseFloat(el.value);
            else if (k === 'w') c.style = Object.assign({}, c.style, { width: Math.max(0.25, parseFloat(el.value) || 1) });
            else if (k === 'comment') c.comment = el.value;
          }
          if (el.type === 'range') app.drawOverlay(); else { app.changed(); app.refreshProps(); }
        }));
        const r = box.querySelector('[data-cb=bend]');
        if (r) r.addEventListener('change', () => { app.pushUndo(); app.changed(); app.refreshProps(); });
        box.querySelector('[data-cb-act=del]').onclick = () => { app.pushUndo(); const ids = new Set(target.map((c) => c.id)); S.annots = S.annots.filter((x) => !ids.has(x.id)); S.sel.clear(); app.changed(); app.refreshProps(); };
      },
    };
  });

  /* ---------------- Onglet Câbles ---------------- */
  function stats() {
    const m = new Map(TYPES.map((t) => [t.k, { t, runs: 0, total: 0, unknown: 0 }]));
    for (const c of cables()) {
      const e = m.get(c.ctype) || m.get('120V');
      e.runs++;
      const L = lengthOf(c);
      if (L) e.total += L.total; else e.unknown++;
    }
    return [...m.values()].filter((e) => e.runs);
  }
  function render() {
    const box = $('#tab-cables');
    if (!box) return;
    if (box.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName)) return;
    const st = stats();
    const all = cables();
    const orphans = all.filter((c) => !byId(c.from) || !byId(c.to)).length;
    let h = `<div class="row"><button id="cbTool" class="primary">${LP.icon('cable')}Tracer un câble (W)</button></div>
      <h3>Longueurs par type</h3>`;
    if (!st.length) h += '<p class="hint">Aucun câble. Choisissez le type dans le ruban <b>Câblage</b>, puis cliquez une composante et la suivante.</p>';
    else {
      h += `<table class="cb-table"><thead><tr><th>Type</th><th class="num">Liens</th><th class="num">Longueur</th></tr></thead><tbody>`;
      let grand = 0;
      for (const e of st) {
        grand += e.total;
        h += `<tr data-type="${e.t.k}"><td><span class="cb-sw" style="border-color:${e.t.color};border-style:${e.t.dash.length ? 'dashed' : 'solid'}"></span>${e.t.label}</td><td class="num">${e.runs}</td><td class="num"><b>${fmtLen(e.total)}</b>${e.unknown ? `<small> +${e.unknown} ?</small>` : ''}</td></tr>`;
      }
      h += `</tbody></table><p class="hint">Longueurs approximatives, réserve et raccordements compris.${st.some((e) => e.unknown) ? ' « ? » : câbles sur une page non calibrée.' : ''}</p>`;
    }
    if (orphans) h += `<p class="hint" style="color:var(--danger)">${orphans} câble(s) dont une extrémité n'existe plus (point rouge sur le plan).</p>`;
    h += `<h3>Calcul</h3>
      <label class="cb-set">Réserve (%) <input type="number" id="cbRes" min="0" max="100" step="1" value="${CFG.reserve}"></label>
      <label class="cb-set">Raccordement / extrémité <input type="text" id="cbAllow" value="${esc(LP.fmtDim(CFG.allowance, S.unit, false))}"></label>
      <label class="cb-set">Hauteur par défaut <input type="text" id="cbDefH" value="${esc(LP.fmtDim(env.ext.defaultHeight, S.unit, false))}" title="Hauteur de montage donnée aux luminaires posés (pas aux contrôles)"></label>
      <p class="hint">Longueur ≈ (courbe sur le plan + différence de hauteur de montage entre deux luminaires + 2 × raccordement) × (1 + réserve). Les contrôles d'éclairage n'ont pas de hauteur : vers un contrôle, seul le raccordement s'ajoute. Estimation pour la soumission, pas un relevé de chantier.</p>
      <h3>Affichage</h3>
      <label class="inline"><input type="checkbox" id="cbLbl" ${VIEW.labels ? 'checked' : ''}> Type inscrit sur chaque câble</label>
      <label class="inline"><input type="checkbox" id="cbLen" ${VIEW.lengths ? 'checked' : ''}> Ajouter la longueur à l'étiquette</label>
      <label class="inline"><input type="checkbox" id="cbH" ${VIEW.height ? 'checked' : ''}> Hauteur de montage sous les luminaires</label>
      <h3>Légende</h3><div class="cb-legend">${TYPES.map((t) => `<div><svg width="44" height="10"><line x1="2" y1="5" x2="42" y2="5" stroke="${t.color}" stroke-width="${t.width * 1.8}" stroke-dasharray="${t.dash.map((d) => d * t.width * 1.8).join(' ')}"/></svg>${t.label}</div>`).join('')}</div>`;
    if (all.length) {
      h += '<h3>Liens (feuille courante)</h3>';
      const here = all.filter((c) => c.page === S.pageNum);
      h += here.length ? here.map((c) => { const L = lengthOf(c); return `<div class="item cb-run" data-id="${c.id}"><span style="color:${(TYPE[c.ctype] || TYPES[0]).color};font-weight:600">${esc((TYPE[c.ctype] || {}).label || c.ctype)}</span> <span>${esc(symName(byId(c.from)))} → ${esc(symName(byId(c.to)))}</span><span class="meta">${L ? fmtLen(L.total) : '—'}</span></div>`; }).join('') : '<p class="hint">Aucun lien sur cette feuille.</p>';
    }
    box.innerHTML = h;
    box.querySelector('#cbTool').onclick = () => app.setTool('cable');
    const num = (el, f) => el.addEventListener('change', f);
    num(box.querySelector('#cbRes'), (e) => { CFG.reserve = Math.max(0, parseFloat(e.target.value) || 0); app.changed(); });
    num(box.querySelector('#cbAllow'), (e) => {
      const m = LP.parseDim(e.target.value, S.unit, false);
      if (!(m >= 0)) { alert('Longueur non reconnue'); return render(); }
      CFG.allowance = m; app.changed();
    });
    num(box.querySelector('#cbDefH'), (e) => {
      const m = LP.parseDim(e.target.value, S.unit, false);
      if (!(m >= 0)) { alert('Hauteur non reconnue'); return render(); }
      env.ext.defaultHeight = m; LP.store.set('defaultHeight', m); app.toast(`Hauteur par défaut : ${LP.fmtDim(m, S.unit, false)}`);
    });
    box.querySelector('#cbLbl').onchange = (e) => setView('labels', e.target.checked);
    box.querySelector('#cbLen').onchange = (e) => setView('lengths', e.target.checked);
    box.querySelector('#cbH').onchange = (e) => setView('height', e.target.checked);
    box.querySelectorAll('.cb-run').forEach((d) => d.onclick = () => { app.setTool('select'); S.sel = new Set([d.dataset.id]); app.refreshProps(); app.drawOverlay(); });
    box.querySelectorAll('tr[data-type]').forEach((tr) => tr.onclick = () => {
      const ids = cables().filter((c) => c.ctype === tr.dataset.type && c.page === S.pageNum).map((c) => c.id);
      app.setTool('select'); S.sel = new Set(ids); app.refreshProps(); app.drawOverlay();
      app.toast(`${ids.length} câble(s) ${TYPE[tr.dataset.type].label} sélectionné(s) sur cette feuille`);
    });
  }
  function setView(k, v) {
    VIEW[k] = v;
    env.ext.cableLabels = VIEW.labels;
    env.ext.showHeight = VIEW.height;
    LP.store.set('cableView', { labels: VIEW.labels, lengths: VIEW.lengths, height: VIEW.height, type: VIEW.type });
    const bl = $('#btnCableLabels'); if (bl) bl.classList.toggle('active', VIEW.labels);
    const bh = $('#btnShowHeight'); if (bh) bh.classList.toggle('active', VIEW.height);
    app.drawOverlay(); render();
  }

  /* ---------------- CSV, projet ---------------- */
  app.hooks.csv.push((rows) => {
    rows.push([]);
    rows.push(['CÂBLAGE (longueurs approximatives)']);
    rows.push([`Réserve ${CFG.reserve} %`, `Raccordement par extrémité ${LP.fmtDim(CFG.allowance, S.unit, false)}`]);
    rows.push(['Type', 'Liens', 'Longueur totale (m)', 'Longueur totale (pi)']);
    for (const e of stats()) rows.push([e.t.label, e.runs, String(Math.round(e.total * 10) / 10).replace('.', ','), String(Math.round(e.total / FT)).replace('.', ','), e.unknown ? `${e.unknown} sur page non calibrée` : '']);
    rows.push([]);
    rows.push(['Page', 'Type', 'De', 'Hauteur de', 'À', 'Hauteur à', 'Sur le plan (m)', 'Total (m)', 'Total (pi)']);
    for (const c of cables().sort((x, y) => x.page - y.page)) {
      const A = byId(c.from), B = byId(c.to), L = lengthOf(c);
      const fh = (x) => (mh(x) == null ? '(contrôle)' : LP.fmtDim(mh(x), S.unit, false));
      rows.push([c.page, (TYPE[c.ctype] || {}).label || c.ctype, symName(A), fh(A), symName(B), fh(B),
        L ? String(Math.round(L.plan * 10) / 10).replace('.', ',') : '', L ? String(Math.round(L.total * 10) / 10).replace('.', ',') : '', L ? Math.round(L.total / FT) : '']);
    }
  });
  app.hooks.save.push((ext) => { ext.cables = { reserve: CFG.reserve, allowance: CFG.allowance }; });
  app.hooks.load.push((ext) => {
    if (ext.cables) { CFG.reserve = ext.cables.reserve != null ? ext.cables.reserve : 10; CFG.allowance = ext.cables.allowance != null ? ext.cables.allowance : FT; }
    render();
  });
  app.hooks.panels.push(render);
  app.hooks.open.push(render);
  app.hooks.page.push(() => { start = null; render(); });

  // Ruban
  const sel = $('#cableType');
  if (sel) sel.onchange = (e) => { VIEW.type = e.target.value; setView('type', e.target.value); if (S.tool !== 'cable') app.setTool('cable'); };
  const bl = $('#btnCableLabels'); if (bl) bl.onclick = () => setView('labels', !VIEW.labels);
  const bh = $('#btnShowHeight'); if (bh) bh.onclick = () => setView('height', !VIEW.height);
  (async () => {
    const v = await LP.store.get('cableView');
    if (v) Object.assign(VIEW, v);
    if (sel) sel.value = VIEW.type;
    const dh = await LP.store.get('defaultHeight');
    if (dh != null) env.ext.defaultHeight = dh;
    setView('labels', VIEW.labels);
  })();

  const css = document.createElement('style');
  css.textContent = `
    .cb-table tr[data-type] { cursor: pointer; }
    .cb-table tr:hover td { background: var(--panel-2); }
    .cb-sw { display: inline-block; width: 18px; height: 0; border-top-width: 3px; vertical-align: middle; margin-right: 6px; }
    .cb-set { display: grid; grid-template-columns: 1fr 96px; gap: 8px; align-items: center; margin-bottom: 6px; font-size: 12px; }
    .cb-legend { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 8px; font-size: 12px; }
    .cb-legend div { display: flex; align-items: center; gap: 6px; }
    .cb-legend svg { background: #fff; border-radius: 3px; }
    .cb-run { display: grid !important; grid-template-columns: auto 1fr auto; gap: 6px; padding: 5px 6px; border-radius: 5px; cursor: pointer; font-size: 12px; }
    .cb-run:hover { background: var(--panel-2); }
    .cb-len td { padding: 3px 4px; }
    .cb-len tr.tot td { font-weight: 700; border-top: 2px solid var(--border-strong); }
    .tabs button { font-size: 11px; }
  `;
  document.head.appendChild(css);
  LP.cables = { TYPES, lengthOf, CFG, VIEW };
})();
