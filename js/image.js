/*
 * Images insérées sur le plan (photos, logos, captures, détails scannés).
 * Formats : JPG, PNG, WebP, GIF, BMP. Un PDF n'accepte que JPEG et PNG : les autres
 * formats sont convertis à l'import. Les grandes images sont réduites (réglable).
 */
(function () {
  'use strict';
  const LP = window.LP;
  const app = LP.app;
  const { S, env, $, esc, hooks } = app;

  const MAX_OPTIONS = [[1600, '1600 px'], [2400, '2400 px (recommandé)'], [4000, '4000 px'], [0, 'Taille d\'origine']];
  const CFG = { max: 2400 };
  try { const v = localStorage.getItem('lumiplan-img-max'); if (v != null && MAX_OPTIONS.some((o) => o[0] === +v)) CFG.max = +v; } catch (e) { /* stockage indisponible */ }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/webp,image/gif,image/bmp,.jpg,.jpeg,.png,.webp,.gif,.bmp,.heic,.heif';
  input.multiple = true;
  input.hidden = true;
  document.body.appendChild(input);

  /* ---------------- Lecture et conversion ---------------- */
  function hash(str) { // FNV-1a : même image collée deux fois = même entrée, pas de doublon dans le projet
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36) + str.length.toString(36);
  }
  const readDataURL = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });

  // Orientation EXIF d'un JPEG (1 = normale). Le navigateur l'applique à l'affichage, pas le PDF : on réencode si ≠ 1.
  function jpegOrientation(buf) {
    const v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return 1;
    let o = 2;
    while (o + 4 < v.byteLength) {
      const mk = v.getUint16(o), len = v.getUint16(o + 2);
      if (mk === 0xffe1 && v.getUint32(o + 4) === 0x45786966) {
        const t = o + 10, le = v.getUint16(t) === 0x4949;
        const ifd = t + v.getUint32(t + 4, le);
        const n = v.getUint16(ifd, le);
        for (let i = 0; i < n; i++) {
          const e = ifd + 2 + i * 12;
          if (e + 10 > v.byteLength) break;
          if (v.getUint16(e, le) === 0x0112) return v.getUint16(e + 8, le);
        }
        return 1;
      }
      if ((mk & 0xff00) !== 0xff00 || mk === 0xffda) break;
      o += 2 + len;
    }
    return 1;
  }

  async function ingest(file) {
    const name = file.name || 'Image collée';
    if (/\.(heic|heif)$/i.test(name) || /hei[cf]/i.test(file.type)) {
      throw new Error("Les photos HEIC (iPhone) ne sont pas lisibles hors ligne. Convertissez-les en JPG (Réglages › Appareil photo › Formats › « Le plus compatible »), ou faites une capture d'écran.");
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch (e) { URL.revokeObjectURL(url); throw new Error(`Format d'image non reconnu : ${name}`); }
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    const isJpeg = /jpe?g/i.test(file.type) || /\.jpe?g$/i.test(name);
    const isPng = /png/i.test(file.type) || /\.png$/i.test(name);
    const k = CFG.max && Math.max(w0, h0) > CFG.max ? CFG.max / Math.max(w0, h0) : 1;
    let dataUrl = null, w = w0, h = h0, converted = false;
    if (k === 1 && isPng) dataUrl = await readDataURL(file);
    if (k === 1 && isJpeg && jpegOrientation(await file.arrayBuffer()) === 1) dataUrl = await readDataURL(file);
    if (dataUrl) dataUrl = dataUrl.replace(/^data:[^;,]*/, isPng ? 'data:image/png' : 'data:image/jpeg');
    else {
      // Réduction, conversion (WebP, GIF, BMP) ou correction d'orientation : passage par un canevas
      w = Math.max(1, Math.round(w0 * k)); h = Math.max(1, Math.round(h0 * k));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, w, h);
      let alpha = false;
      if (!isJpeg) {
        const d = g.getImageData(0, 0, w, h).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] < 255) { alpha = true; break; }
      }
      // Photos → JPEG ; transparence, dessins et captures (PNG, GIF, BMP) → PNG
      const asPng = alpha || isPng || /gif|bmp/i.test(file.type) || /\.(gif|bmp)$/i.test(name);
      if (!asPng) { const c2 = document.createElement('canvas'); c2.width = w; c2.height = h; const g2 = c2.getContext('2d'); g2.fillStyle = '#fff'; g2.fillRect(0, 0, w, h); g2.drawImage(c, 0, 0); dataUrl = c2.toDataURL('image/jpeg', 0.88); }
      else dataUrl = c.toDataURL('image/png');
      converted = true;
    }
    URL.revokeObjectURL(url);
    const id = 'img-' + hash(dataUrl);
    S.images[id] = dataUrl;
    app.loadImageEls();
    return { id, w, h, w0, h0, name: name.replace(/\.[a-z0-9]+$/i, ''), converted, bytes: Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75) };
  }

  /* ---------------- Pose sur le plan ---------------- */
  function viewCenter() {
    const v = app.view();
    return app.toPage(v.w / 2, v.h / 2);
  }
  function place(info, at, offset) {
    const v = app.view();
    // Taille initiale : environ 35 % de la zone visible, sans dépasser la page
    const maxW = Math.min((v.w * 0.35) / S.zoom, S.vp.width * 0.8), maxH = Math.min((v.h * 0.35) / S.zoom, S.vp.height * 0.8);
    const k = Math.min(maxW / info.w, maxH / info.h);
    const w = info.w * k, h = info.h * k;
    let [cx, cy] = at || viewCenter();
    cx += offset || 0; cy += offset || 0;
    cx = Math.min(Math.max(cx, w / 2), S.vp.width - w / 2);
    cy = Math.min(Math.max(cy, h / 2), S.vp.height - h / 2);
    const a = app.newAnnot('image', [[cx - w / 2, cy - h / 2], [cx + w / 2, cy + h / 2]]);
    a.img = info.id;
    a.aspect = info.w / info.h;
    a.rot = 0;
    a.keepAspect = true;
    a.name = info.name;
    a.px = [info.w, info.h];
    if (info.w !== info.w0) a.pxSrc = [info.w0, info.h0];
    S.annots.push(a);
    return a;
  }
  async function insertFiles(files, at) {
    if (!S.pdf) { app.toast("Ouvrez d'abord un PDF"); return; }
    files = [...files];
    const added = [], errs = [];
    let reduced = 0;
    for (const f of files) {
      try {
        const info = await ingest(f);
        if (!added.length) app.pushUndo();
        added.push(place(info, at, added.length * 18));
        if (info.converted && info.w < info.w0) reduced++;
      } catch (e) { errs.push(e.message); }
    }
    if (errs.length) alert(errs.join('\n\n'));
    if (!added.length) return;
    app.setTool('select');
    S.sel = new Set(added.map((a) => a.id));
    app.changed();
    app.refreshProps();
    app.toast(`${added.length} image(s) insérée(s)${reduced ? ` · ${reduced} réduite(s) à ${CFG.max} px` : ''} — glissez les coins pour redimensionner (Maj : déformer)`, 7000);
  }

  $('#btnImage').addEventListener('click', () => {
    if (!S.pdf) { app.toast("Ouvrez d'abord un PDF"); return; }
    input.value = '';
    input.click();
  });
  let pick = null; // remplacement d'une image : le fichier choisi est rendu à l'appelant
  input.addEventListener('change', () => {
    if (pick) { const p = pick; pick = null; p(input.files[0]); return; }
    if (input.files.length) insertFiles(input.files, null);
  });
  hooks.pasteImage.push((file, at) => { insertFiles([file], at); return true; });

  /* ---------------- Propriétés ---------------- */
  const fmt = (pt, sc) => (sc ? LP.fmtDim(pt * sc.mpp, sc.unit, false) : `${(pt / 72).toFixed(2)} po papier`);
  const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} ko`);
  function boxOf(a) { const c = app.imgCorners(a); return { x: c[0][0], y: c[0][1], w: c[2][0] - c[0][0], h: c[2][1] - c[0][1] }; }

  hooks.propsHead.push((target) => {
    if (!target.length || !target.every((a) => a.type === 'image')) return '';
    const a = target[0], one = target.length === 1;
    const sc = env.scaleFor(a.page);
    const b = boxOf(a);
    const url = S.images[a.img];
    let h = '';
    if (one) {
      h += `<label>Nom <input type="text" data-img="name" value="${esc(a.name || '')}"></label>
        <label>Largeur <input type="text" data-img="w" value="${esc(fmt(b.w, sc))}" title="${sc ? 'Dimension réelle selon l\'échelle de la page' : 'Page non calibrée : taille sur papier en pouces'}"></label>
        <label>Hauteur <input type="text" data-img="h" value="${esc(fmt(b.h, sc))}"></label>`;
    }
    h += `<label class="inline"><input type="checkbox" data-img="keepAspect" ${a.keepAspect !== false ? 'checked' : ''}> Garder les proportions</label>
      <div class="row"><button data-img-act="rotl" title="Pivoter l'image de 90° vers la gauche">${LP.icon('rotl')}90°</button><button data-img-act="rotr" title="Pivoter l'image de 90° vers la droite">${LP.icon('rotr')}90°</button><button data-img-act="ratio" title="Rétablir les proportions d'origine (largeur conservée)">Proportions</button></div>`;
    if (one) {
      h += `<div class="row"><button data-img-act="replace">Remplacer l'image…</button></div>
        <p class="hint">${url ? `${a.px ? `${a.px[0]} × ${a.px[1]} px` : ''}${a.pxSrc ? ` (réduite de ${a.pxSrc[0]} × ${a.pxSrc[1]})` : ''} · ${/image\/png/.test(url) ? 'PNG' : 'JPEG'} · ${kb((url.length - url.indexOf(',')) * 0.75)}`
          : '<b style="color:#c25e00">Image absente de ce projet</b> : utilisez « Remplacer l\'image… ».'}
        ${sc ? '' : '<br>Page non calibrée : tailles en pouces sur papier.'}<br>Coins : redimensionner (Maj = déformer). Opacité &lt; 1 pour un calque de référence.</p>`;
    }
    h += `<label>Taille max. des prochaines images <select data-img="max">${MAX_OPTIONS.map(([v, l]) => `<option value="${v}" ${CFG.max === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
    return h;
  });

  hooks.propsBind.push((box, target) => {
    if (!target.length || !target.every((a) => a.type === 'image')) return;
    const done = () => { app.changed(); app.refreshProps(); };
    box.querySelectorAll('[data-img]').forEach((el) => el.addEventListener('change', () => {
      const k = el.dataset.img;
      if (k === 'max') { CFG.max = +el.value; try { localStorage.setItem('lumiplan-img-max', String(CFG.max)); } catch (e) { /* ignoré */ } return; }
      if (k === 'name') { app.pushUndo(); target[0].name = el.value; return done(); }
      if (k === 'keepAspect') { app.pushUndo(); target.forEach((a) => { a.keepAspect = el.checked; }); return done(); }
      if (k === 'w' || k === 'h') {
        const a = target[0], sc = env.scaleFor(a.page);
        let pt;
        if (sc) { const m = LP.parseDim(el.value, S.unit, false); pt = m > 0 ? m / sc.mpp : NaN; }
        else { const v = parseFloat(String(el.value).replace(',', '.')); pt = v > 0 ? v * 72 : NaN; }
        if (!(pt > 0)) { alert(`Dimension non reconnue : « ${el.value} »`); return app.refreshProps(); }
        app.pushUndo();
        const b = boxOf(a), ar = app.imgAspect(a);
        let w = b.w, h = b.h;
        if (k === 'w') { w = pt; if (a.keepAspect !== false) h = w / ar; } else { h = pt; if (a.keepAspect !== false) w = h * ar; }
        a.pts = [[b.x, b.y], [b.x + w, b.y + h]]; // coin haut-gauche fixe
        return done();
      }
    }));
    box.querySelectorAll('[data-img-act]').forEach((el) => el.addEventListener('click', async () => {
      const act = el.dataset.imgAct;
      if (act === 'replace') {
        input.value = '';
        input.multiple = false;
        const f = await new Promise((res) => { pick = res; input.click(); });
        input.multiple = true;
        if (!f) return;
        try {
          const info = await ingest(f);
          app.pushUndo();
          const a = target[0], b = boxOf(a);
          a.img = info.id; a.aspect = info.w / info.h; a.name = info.name; a.px = [info.w, info.h]; delete a.pxSrc;
          if (info.w !== info.w0) a.pxSrc = [info.w0, info.h0];
          const ar = app.imgAspect(a);
          a.pts = [[b.x, b.y], [b.x + b.w, b.y + b.w / ar]];
          done();
        } catch (e) { alert(e.message); }
        return;
      }
      app.pushUndo();
      for (const a of target) {
        const b = boxOf(a), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        if (act === 'ratio') { const h = b.w / app.imgAspect(a); a.pts = [[b.x, cy - h / 2], [b.x + b.w, cy + h / 2]]; continue; }
        a.rot = ((((a.rot || 0) + (act === 'rotr' ? 90 : -90)) % 360) + 360) % 360;
        a.pts = [[cx - b.h / 2, cy - b.w / 2], [cx + b.h / 2, cy + b.w / 2]]; // la boîte pivote autour de son centre
      }
      done();
    }));
  });

  LP.images = { ingest, insertFiles, CFG };
})();
