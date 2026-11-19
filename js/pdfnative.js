/*
 * Annotations PDF natives (format standard ISO 32000, utilisé par Bluebeam,
 * Acrobat, Foxit…).
 *
 *  - readNative()   : lit les annotations existantes du PDF (avec auteur,
 *                     dates, réponses) et produit une copie « propre » du PDF
 *                     sans ces annotations, que LumiPlan affiche et redessine
 *                     lui-même de façon modifiable.
 *  - toModel()      : convertit une annotation lue en annotation LumiPlan.
 *  - exportNative() : réécrit les annotations comme objets PDF natifs
 *                     (modifiables dans Bluebeam/Acrobat), avec apparence /AP.
 *                     Une annotation importée et non modifiée est remise telle
 *                     quelle (aucune perte des propriétés propres à Bluebeam).
 */
(function () {
  'use strict';
  const LP = window.LP;

  const SUPPORTED = new Set(['Square', 'Circle', 'Line', 'PolyLine', 'Polygon', 'Ink', 'FreeText', 'Text', 'Highlight', 'Underline', 'StrikeOut', 'Squiggly']);
  const ARROWS = new Set(['OpenArrow', 'ClosedArrow', 'ROpenArrow', 'RClosedArrow']);

  /* ---------------- Lecture de valeurs pdf-lib ---------------- */
  function N(s) { return window.PDFLib.PDFName.of(s); }
  function look(ctx, o) { return o instanceof window.PDFLib.PDFRef ? ctx.lookup(o) : o; }
  function num(ctx, o) { o = look(ctx, o); return o && o.asNumber ? o.asNumber() : null; }
  function nums(ctx, o) {
    o = look(ctx, o);
    if (!o || !o.asArray) return null;
    return o.asArray().map((x) => num(ctx, x));
  }
  function txt(ctx, o) {
    o = look(ctx, o);
    if (!o || !o.decodeText) return '';
    try { return o.decodeText(); } catch (e) { return ''; }
  }
  function nm(ctx, o) {
    o = look(ctx, o);
    return o instanceof window.PDFLib.PDFName ? o.decodeText() : null;
  }
  function dt(ctx, o) {
    o = look(ctx, o);
    if (!o || !o.decodeDate) return null;
    try { const d = o.decodeDate(); return isNaN(d) ? null : d.toISOString(); } catch (e) { return null; }
  }
  function refTag(o) { return o instanceof window.PDFLib.PDFRef ? o.tag : null; }
  function tagToRef(tag) {
    const m = /^(\d+) (\d+) R$/.exec(tag || '');
    return m ? window.PDFLib.PDFRef.of(+m[1], +m[2]) : null;
  }

  const hex2 = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  function colorHex(c) {
    if (!c || !c.length) return null;
    if (c.length === 1) return '#' + hex2(c[0]).repeat(3);
    if (c.length === 3) return '#' + c.map(hex2).join('');
    if (c.length === 4) { const k = c[3]; return '#' + [c[0], c[1], c[2]].map((x) => hex2((1 - x) * (1 - k))).join(''); }
    return null;
  }

  function parseDA(da) {
    const r = {};
    if (!da) return r;
    let m;
    if ((m = /([\d.]+)\s+Tf/.exec(da))) r.fontSize = parseFloat(m[1]);
    if ((m = /([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg/.exec(da))) r.textColor = colorHex([+m[1], +m[2], +m[3]]);
    else if ((m = /([\d.]+)\s+g(\s|$)/.exec(da))) r.textColor = colorHex([+m[1]]);
    if ((m = /([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+RG/.exec(da))) r.borderColor = colorHex([+m[1], +m[2], +m[3]]);
    return r;
  }
  function parseDS(ds) {
    const r = {};
    if (!ds) return r;
    let m;
    if ((m = /font-size\s*:\s*([\d.]+)\s*pt/i.exec(ds)) || (m = /font\s*:[^;]*?([\d.]+)\s*pt/i.exec(ds))) r.fontSize = parseFloat(m[1]);
    if ((m = /(?:^|[;\s])color\s*:\s*#([0-9a-f]{6})/i.exec(ds))) r.textColor = '#' + m[1].toLowerCase();
    return r;
  }
  function stripRC(rc) {
    return (rc || '').replace(/<\/p>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
  }

  /* ---------------- Lecture d'une annotation ---------------- */
  function parseAnnot(ctx, d) {
    const subtype = nm(ctx, d.get(N('Subtype')));
    if (!subtype) return null;
    const F = num(ctx, d.get(N('F'))) || 0;
    const e = { subtype, flags: F };
    e.rect = nums(ctx, d.get(N('Rect')));
    e.irt = refTag(d.get(N('IRT')));
    e.rt = nm(ctx, d.get(N('RT'))) || 'R';
    e.popup = refTag(d.get(N('Popup')));
    e.contents = txt(ctx, d.get(N('Contents')));
    e.rc = txt(ctx, d.get(N('RC')));
    e.author = txt(ctx, d.get(N('T')));
    e.subj = txt(ctx, d.get(N('Subj')));
    e.created = dt(ctx, d.get(N('CreationDate')));
    e.modified = dt(ctx, d.get(N('M'))) || e.created;
    e.color = colorHex(nums(ctx, d.get(N('C'))));
    e.ic = colorHex(nums(ctx, d.get(N('IC'))));
    e.ca = num(ctx, d.get(N('CA')));
    e.lpdata = txt(ctx, d.get(N('LPData')));
    e.state = txt(ctx, d.get(N('State')));
    // Bordure
    const bs = look(ctx, d.get(N('BS')));
    e.width = 1;
    if (bs && bs.get) {
      const w = num(ctx, bs.get(N('W')));
      if (w != null) e.width = w;
      if (nm(ctx, bs.get(N('S'))) === 'D') e.dash = nums(ctx, bs.get(N('D'))) || [3];
    } else {
      const b = nums(ctx, d.get(N('Border')));
      if (b && b.length >= 3) e.width = b[2];
    }
    const be = look(ctx, d.get(N('BE')));
    e.cloud = !!(be && be.get && nm(ctx, be.get(N('S'))) === 'C');
    e.rd = nums(ctx, d.get(N('RD')));
    e.L = nums(ctx, d.get(N('L')));
    e.vertices = nums(ctx, d.get(N('Vertices')));
    e.quads = nums(ctx, d.get(N('QuadPoints')));
    e.cl = nums(ctx, d.get(N('CL')));
    e.it = nm(ctx, d.get(N('IT')));
    const le = look(ctx, d.get(N('LE')));
    e.le = le && le.asArray ? le.asArray().map((x) => nm(ctx, x)) : [];
    const ink = look(ctx, d.get(N('InkList')));
    e.ink = ink && ink.asArray ? ink.asArray().map((s) => nums(ctx, s) || []) : null;
    e.da = parseDA(txt(ctx, d.get(N('DA'))));
    e.ds = parseDS(txt(ctx, d.get(N('DS'))));
    return e;
  }

  /*
   * Lit toutes les annotations. Retourne :
   *   { encrypted, cleanBytes, pages: Map(numPage -> [entrée]), importedRefs: Set }
   * Les entrées « réponse » sont rattachées à leur annotation parente (e.replies).
   */
  async function readNative(bytes) {
    const L = window.PDFLib;
    const doc = await L.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, parseSpeed: L.ParseSpeeds.Fastest });
    if (doc.isEncrypted) return { encrypted: true, pages: new Map(), importedRefs: new Set(), cleanBytes: bytes };
    const ctx = doc.context;
    const result = { encrypted: false, pages: new Map(), importedRefs: new Set(), cleanBytes: bytes, count: 0 };
    const docPages = doc.getPages();

    for (let i = 0; i < docPages.length; i++) {
      const page = docPages[i];
      const arr = page.node.lookupMaybe(N('Annots'), L.PDFArray);
      if (!arr || !arr.size()) continue;
      const entries = new Map(); // tag -> entrée
      for (let k = 0; k < arr.size(); k++) {
        const raw = arr.get(k);
        const tag = refTag(raw);
        if (!tag) continue; // annotation directe (rare) : laissée telle quelle
        const d = ctx.lookup(raw);
        if (!(d instanceof L.PDFDict)) continue;
        const e = parseAnnot(ctx, d);
        if (!e) continue;
        e.ref = tag;
        entries.set(tag, e);
      }
      const roots = [];
      const isReply = (e) => e.subtype === 'Text' && e.irt && e.rt !== 'Group';
      for (const e of entries.values()) {
        // Tampons : seulement ceux écrits par LumiPlan (symboles) ; les autres restent natifs
        const ok = SUPPORTED.has(e.subtype) || (e.subtype === 'Stamp' && e.lpdata);
        if (!ok || (e.flags & 2) || isReply(e)) continue;
        if (!e.rect) continue;
        e.replies = [];
        roots.push(e);
      }
      const rootSet = new Map(roots.map((e) => [e.ref, e]));
      // Réponses : on remonte la chaîne IRT jusqu'à une racine importée
      for (const e of entries.values()) {
        if (!isReply(e)) continue;
        let p = e, guard = 0;
        while (p && isReply(p) && guard++ < 50) p = entries.get(p.irt);
        const root = p && rootSet.get(p.ref);
        if (root) root.replies.push(e);
      }
      if (!roots.length) continue;
      const remove = new Set();
      for (const r of roots) {
        remove.add(r.ref); if (r.popup) remove.add(r.popup);
        for (const rp of r.replies) { remove.add(rp.ref); if (rp.popup) remove.add(rp.popup); }
      }
      const keep = arr.asArray().filter((o) => !remove.has(refTag(o)));
      page.node.set(N('Annots'), ctx.obj(keep));
      for (const t of remove) result.importedRefs.add(t);
      result.pages.set(i + 1, roots);
      result.count += roots.length;
    }
    if (result.count) result.cleanBytes = await doc.save({ useObjectStreams: false });
    return result;
  }

  /* ---------------- Conversion vers le modèle LumiPlan ---------------- */
  // Annotation écrite par LumiPlan : restaure les détails (symbole, étiquette, style exact)
  function fromLPData(e, a, page, P) {
    if (!e.lpdata) return false;
    let lp;
    try { lp = JSON.parse(e.lpdata); } catch (err) { return false; }
    if (!lp || !lp.a || !lp.a.type || !Array.isArray(lp.a.pts)) return false;
    const b = lp.a;
    // Si l'objet a été déplacé dans un autre logiciel, on applique le déplacement
    if (lp.rect && e.rect) {
      const c0 = P((lp.rect[0] + lp.rect[2]) / 2, (lp.rect[1] + lp.rect[3]) / 2);
      const c1 = P((e.rect[0] + e.rect[2]) / 2, (e.rect[1] + e.rect[3]) / 2);
      const dx = c1[0] - c0[0], dy = c1[1] - c0[1];
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) b.pts.forEach((q) => { q[0] += dx; q[1] += dy; });
    }
    const contents = e.contents || stripRC(e.rc);
    const id = a.id;
    Object.assign(a, b, { id, page });
    a.author = e.author || b.author;
    a.modified = e.modified || b.modified;
    // Texte / commentaire possiblement modifiés dans un autre logiciel
    if (b.type === 'text' || b.type === 'callout') a.text = contents;
    else if (contents !== lp.auto) a.comment = contents;
    if (e.color && !['symbol', 'text', 'callout'].includes(b.type)) a.style.stroke = e.color;
    return true;
  }

  function stamp(a) {
    return JSON.stringify([a.type, a.pts, a.breaks, a.style, a.text, a.comment, a.tag, a.size, a.mode, a.dimL, a.dimW, a.rot, a.showTag, a.sym && a.sym.id, a.markup]);
  }

  // P(x, y) : espace PDF -> espace page affichée
  function toModel(e, page, P) {
    const corners = (r) => { const p = P(r[0], r[1]), q = P(r[2], r[3]); return [[Math.min(p[0], q[0]), Math.min(p[1], q[1])], [Math.max(p[0], q[0]), Math.max(p[1], q[1])]]; };
    const inner = () => {
      const r = e.rect.slice();
      if (e.rd && e.rd.length === 4) { r[0] += e.rd[0]; r[1] += e.rd[3]; r[2] -= e.rd[2]; r[3] -= e.rd[1]; }
      return corners(r);
    };
    const style = {
      stroke: e.color || '#d00000',
      fill: e.ic || 'none',
      width: e.color ? e.width : 0,
      opacity: e.ca != null ? e.ca : 1,
      dash: e.dash ? 'dash' : 'solid',
    };
    const a = {
      id: LP.uid(), page, pts: [], style, text: '', comment: e.contents || stripRC(e.rc),
      author: e.author, subject: e.subj, created: e.created || new Date().toISOString(), modified: e.modified || e.created || new Date().toISOString(),
    };
    const pairs = (arr) => { const o = []; for (let i = 0; i + 1 < (arr || []).length; i += 2) o.push(P(arr[i], arr[i + 1])); return o; };

    if (!fromLPData(e, a, page, P)) switch (e.subtype) {
      case 'Square':
        a.type = e.cloud ? 'cloud' : 'rect';
        a.pts = inner();
        if (e.cloud) style.arc = 14;
        break;
      case 'Circle':
        a.type = 'ellipse'; a.pts = inner(); break;
      case 'Line': {
        let p = pairs(e.L);
        if (p.length < 2) return null;
        const endArrow = ARROWS.has(e.le[1]), startArrow = ARROWS.has(e.le[0]);
        if (startArrow && !endArrow) p = [p[1], p[0]];
        a.type = startArrow || endArrow ? 'arrow' : 'line';
        a.pts = p;
        break;
      }
      case 'PolyLine':
        a.type = 'polyline'; a.pts = pairs(e.vertices); if (a.pts.length < 2) return null; break;
      case 'Polygon':
        a.type = 'polygon'; a.pts = pairs(e.vertices); if (a.pts.length < 3) return null;
        if (e.cloud) { style.cloud = true; style.arc = 14; }
        break;
      case 'Ink': {
        a.type = 'ink';
        a.breaks = [];
        for (const s of e.ink || []) { if (a.pts.length) a.breaks.push(a.pts.length); a.pts.push(...pairs(s)); }
        if (a.pts.length < 2) return null;
        break;
      }
      case 'FreeText': {
        const f = Object.assign({}, e.da, e.ds);
        a.text = e.contents || stripRC(e.rc);
        a.comment = '';
        style.fontSize = f.fontSize || 10;
        style.textColor = f.textColor || '#000000';
        style.stroke = f.borderColor || e.color || style.textColor;
        style.fill = e.ic || e.color || 'none';
        style.width = e.width || 0;
        if (e.it === 'FreeTextCallout' && e.cl && e.cl.length >= 4) {
          a.type = 'callout';
          const box = inner();
          a.pts = [P(e.cl[0], e.cl[1]), box[0], box[1]];
          style.width = Math.max(style.width, 0.5);
        } else { a.type = 'text'; a.pts = inner(); }
        break;
      }
      case 'Text': {
        a.type = 'note';
        const c = corners(e.rect);
        a.pts = [c[0]];
        style.stroke = e.color || '#ffd400';
        style.width = 1;
        break;
      }
      case 'Highlight': case 'Underline': case 'StrikeOut': case 'Squiggly': {
        a.type = 'markup'; a.markup = e.subtype;
        a.pts = pairs(e.quads);
        if (a.pts.length < 4) { const c = corners(e.rect); a.pts = [c[0], [c[1][0], c[0][1]], [c[0][0], c[1][1]], c[1]]; }
        a.pts = a.pts.slice(0, a.pts.length - (a.pts.length % 4));
        style.stroke = e.color || '#ffeb3b';
        if (e.subtype === 'Highlight' && (e.ca == null || e.ca >= 1)) style.opacity = 0.4;
        break;
      }
      default:
        return null;
    }

    a.replies = (e.replies || []).sort((x, y) => (x.created || '').localeCompare(y.created || '')).map((r) => ({
      id: LP.uid(), author: r.author, text: r.contents || stripRC(r.rc), created: r.created, modified: r.modified,
      state: r.state || '', src: { ref: r.ref, popup: r.popup }, srcText: r.contents || stripRC(r.rc),
    }));
    a.src = { ref: e.ref, popup: e.popup };
    a.srcStamp = stamp(a);
    return a;
  }

  /* ---------------- Écriture ---------------- */
  function invert(m) {
    const [a, b, c, d, e, f] = m;
    const det = a * d - b * c;
    return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
  }
  function pdfDate(iso) {
    const d = iso ? new Date(iso) : new Date();
    const p = (n) => String(n).padStart(2, '0');
    const off = -d.getTimezoneOffset();
    const sg = off >= 0 ? '+' : '-';
    return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${sg}${p(Math.floor(Math.abs(off) / 60))}'${p(Math.abs(off) % 60)}'`;
  }
  function rgb(hex) { const c = LP.hexToRgb(hex); return c ? c.map((v) => Math.round(v * 1000) / 1000) : null; }
  const r3 = (v) => Math.round(v * 1000) / 1000;

  /*
   * Exporte un PDF où les annotations LumiPlan sont des annotations natives.
   * nativeInfo = { importedRefs: Set } (résultat de readNative à l'ouverture)
   */
  async function exportNative(origBytes, pdfjsDoc, annots, images, env, nativeInfo, onProgress) {
    const L = window.PDFLib;
    const doc = await L.PDFDocument.load(origBytes, { ignoreEncryption: true, updateMetadata: false, parseSpeed: L.ParseSpeeds.Fastest });
    if (doc.isEncrypted) throw new Error('PDF chiffré : impossible d\'y écrire des annotations (encrypted)');
    const ctx = doc.context;
    const font = await doc.embedFont(L.StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(L.StandardFonts.HelveticaBold);
    const imgRefs = {};
    for (const a of annots) {
      if (a.type === 'symbol' && a.sym.shape === 'image' && images[a.sym.id] && !imgRefs[a.sym.id]) {
        const [head, b64] = images[a.sym.id].split(',');
        const bytes = LP.base64ToBytes(b64);
        imgRefs[a.sym.id] = (/image\/png/.test(head) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)).ref;
      }
    }
    const imported = (nativeInfo && nativeInfo.importedRefs) || new Set();
    const byPage = new Map();
    for (const a of annots) {
      if (a.type === 'calibrate') continue;
      if (!byPage.has(a.page)) byPage.set(a.page, []);
      byPage.get(a.page).push(a);
    }
    const pages = doc.getPages();
    for (let i = 0; i < pages.length; i++) {
      const pageNum = i + 1;
      const list = byPage.get(pageNum) || [];
      const page = pages[i];
      const arr = page.node.lookupMaybe(N('Annots'), L.PDFArray);
      const had = arr ? arr.asArray() : [];
      const touchesImported = had.some((o) => imported.has(refTag(o)));
      if (!list.length && !touchesImported) continue;

      const keep = had.filter((o) => !imported.has(refTag(o)));
      const vp = (await pdfjsDoc.getPage(pageNum)).getViewport({ scale: 1 });
      const inv = invert(vp.transform);
      const toPdf = (p) => [inv[0] * p[0] + inv[2] * p[1] + inv[4], inv[1] * p[0] + inv[3] * p[1] + inv[5]];
      const W = { doc, ctx, page, inv, toPdf, font, fontBold, imgRefs, env };
      for (const a of list) {
        const ref = writeAnnot(W, a);
        keep.push(ref);
        if (a.src && a.src.popup && ctx.lookup(tagToRef(a.src.popup))) keep.push(tagToRef(a.src.popup));
        for (const r of a.replies || []) {
          const rr = writeReply(W, r, ref, a);
          keep.push(rr);
          if (r.src && r.src.popup && ctx.lookup(tagToRef(r.src.popup))) keep.push(tagToRef(r.src.popup));
        }
      }
      page.node.set(N('Annots'), ctx.obj(keep));
      if (onProgress) onProgress(pageNum, pages.length);
    }
    doc.setModificationDate(new Date());
    return await doc.save({ useObjectStreams: true });
  }

  // Apparence (Form XObject) : dessin LumiPlan exprimé en espace PDF
  function appearance(W, a, rect) {
    const L = window.PDFLib;
    const { ctx } = W;
    const gs = {}, xo = {};
    let gsN = 0;
    const res = {
      font: W.font, fontBold: W.fontBold, fontName: N('LPF'), fontBoldName: N('LPFB'),
      gsName(alpha) {
        const k = String(alpha);
        if (!gs[k]) gs[k] = { name: 'GS' + gsN++, alpha };
        return N(gs[k].name);
      },
      images: {},
    };
    for (const [id, ref] of Object.entries(W.imgRefs)) { res.images[id] = N('Im' + Object.keys(xo).length); xo[res.images[id].decodeText()] = ref; }
    const R = new LP.PdfRenderer(res);
    if (a) {
      R.save();
      R.transform(...W.inv);
      LP.drawAnnotation(R, a, W.env);
      R.restore();
    }
    const ext = {};
    for (const g of Object.values(gs)) ext[g.name] = ctx.obj({ Type: 'ExtGState', CA: g.alpha, ca: g.alpha });
    const resources = ctx.obj({ Font: ctx.obj({ LPF: W.font.ref, LPFB: W.fontBold.ref }), ExtGState: ctx.obj(ext), XObject: ctx.obj(xo) });
    const form = ctx.formXObject(R.ops, { BBox: rect, Matrix: [1, 0, 0, 1, 0, 0], Resources: resources });
    return ctx.register(form);
  }

  function rectOf(W, box) {
    const [x, y, w, h] = box;
    const c = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(W.toPdf);
    return [Math.min(...c.map((p) => p[0])), Math.min(...c.map((p) => p[1])), Math.max(...c.map((p) => p[0])), Math.max(...c.map((p) => p[1]))].map(r3);
  }
  function flat(W, pts) { const o = []; for (const p of pts) { const q = W.toPdf(p); o.push(r3(q[0]), r3(q[1])); } return o; }
  function shapeRD(W, rect, p0, p1) {
    const s = rectOf(W, [Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1]), Math.abs(p1[0] - p0[0]), Math.abs(p1[1] - p0[1])]);
    return [s[0] - rect[0], rect[3] - s[3], rect[2] - s[2], s[1] - rect[1]].map((v) => r3(Math.max(0, v)));
  }

  const SUBTYPE = {
    line: 'Line', arrow: 'Line', length: 'Line', calibrate: 'Line', rect: 'Square', highlight: 'Square', cloud: 'Square',
    ellipse: 'Circle', polyline: 'PolyLine', polylength: 'PolyLine', polygon: 'Polygon', area: 'Polygon', ink: 'Ink',
    text: 'FreeText', callout: 'FreeText', note: 'Text', symbol: 'Stamp',
  };
  // Clés de géométrie / apparence réécrites lorsqu'une annotation importée est modifiée
  const REWRITE = ['AP', 'AS', 'RC', 'DS', 'DA', 'RD', 'L', 'LE', 'Vertices', 'InkList', 'QuadPoints', 'CL', 'IC', 'BE', 'BS', 'Border', 'CA'];

  function writeAnnot(W, a) {
    const L = window.PDFLib;
    const { ctx } = W;
    const unchanged = a.src && a.srcStamp === stamp(a);
    if (unchanged) {
      const ref = tagToRef(a.src.ref);
      if (ref && ctx.lookup(ref)) return ref;
    }
    let d = null, ref = null;
    if (a.src) {
      ref = tagToRef(a.src.ref);
      d = ref && ctx.lookup(ref);
      if (!(d instanceof L.PDFDict)) { d = null; ref = null; }
    }
    const isNew = !d;
    const subtype = a.type === 'markup' ? a.markup : SUBTYPE[a.type];
    if (isNew) {
      d = ctx.obj({ Type: 'Annot', Subtype: subtype, F: a.type === 'note' ? 28 : 4 });
      ref = ctx.register(d);
      d.set(N('P'), W.page.ref);
      d.set(N('NM'), L.PDFHexString.fromText(a.id));
      d.set(N('CreationDate'), L.PDFString.of(pdfDate(a.created)));
    } else {
      for (const k of REWRITE) d.delete(N(k));
    }
    const s = a.style || {};
    const rect = rectOf(W, LP.visualBounds(a));
    const set = (k, v) => d.set(N(k), v);
    const hexT = (t) => L.PDFHexString.fromText(t || '');
    set('Rect', ctx.obj(rect));
    set('M', L.PDFString.of(pdfDate(a.modified)));
    if (a.author) set('T', hexT(a.author));
    const auto = ['length', 'polylength', 'area'].includes(a.type) && !a.comment ? LP.describeAnnotation(a, W.env) : null;
    const contents = a.type === 'text' || a.type === 'callout' ? a.text : (auto != null ? auto : a.comment);
    set('Contents', hexT(contents));
    const subj = a.type === 'symbol' ? `${a.sym.name}${a.tag ? ' - ' + a.tag : ''}` : (a.subject || LP.TYPE_LABELS[a.type]);
    if (isNew || a.type === 'symbol') set('Subj', hexT(subj));
    const col = rgb(a.type === 'symbol' ? a.sym.color : s.stroke);
    if (col) set('C', ctx.obj(col));
    if (s.opacity != null && s.opacity < 1) set('CA', ctx.obj(r3(s.opacity)));
    const bs = { Type: 'Border', W: r3(s.width != null ? s.width : 1), S: s.dash && s.dash !== 'solid' ? 'D' : 'S' };
    if (bs.S === 'D') bs.D = s.dash === 'dot' ? [1, 2] : [4, 3];
    const fillCol = s.fill && s.fill !== 'none' ? rgb(s.fill) : null;

    switch (a.type) {
      case 'line': case 'arrow': case 'length': case 'calibrate':
        set('L', ctx.obj(flat(W, a.pts)));
        set('LE', ctx.obj(['None', a.type === 'arrow' ? 'ClosedArrow' : 'None']));
        if (a.type === 'arrow' && col) set('IC', ctx.obj(col));
        set('BS', ctx.obj(bs));
        break;
      case 'rect': case 'highlight': case 'cloud': case 'ellipse':
        set('RD', ctx.obj(shapeRD(W, rect, a.pts[0], a.pts[1])));
        if (fillCol) set('IC', ctx.obj(fillCol));
        set('BS', ctx.obj(bs));
        if (a.type === 'cloud') set('BE', ctx.obj({ S: 'C', I: 1 }));
        break;
      case 'polyline': case 'polylength': case 'polygon': case 'area':
        set('Vertices', ctx.obj(flat(W, a.pts)));
        if (fillCol) set('IC', ctx.obj(fillCol));
        set('BS', ctx.obj(bs));
        if (a.type === 'polygon' && s.cloud) set('BE', ctx.obj({ S: 'C', I: 1 }));
        break;
      case 'ink': {
        const strokes = [];
        const br = (a.breaks || []).concat([a.pts.length]);
        let st = 0;
        for (const b of br) { if (b > st) strokes.push(flat(W, a.pts.slice(st, b))); st = b; }
        set('InkList', ctx.obj(strokes));
        set('BS', ctx.obj(bs));
        break;
      }
      case 'text': case 'callout': {
        const tc = rgb(s.textColor || s.stroke) || [0, 0, 0];
        const fs = s.fontSize || 10;
        const bc = rgb(s.stroke) || tc;
        set('DA', L.PDFString.of(`/Helv ${fs} Tf ${tc.join(' ')} rg ${bc.join(' ')} RG`));
        set('DS', L.PDFString.of(`font: Helvetica ${fs}pt; color:${s.textColor || s.stroke || '#000000'}`));
        if (fillCol) set('C', ctx.obj(fillCol)); else d.delete(N('C'));
        set('BS', ctx.obj(bs));
        const box = a.type === 'callout' ? [a.pts[1], a.pts[2]] : [a.pts[0], a.pts[1]];
        set('RD', ctx.obj(shapeRD(W, rect, box[0], box[1])));
        if (a.type === 'callout') {
          set('IT', N('FreeTextCallout'));
          const [x0, y0] = [Math.min(box[0][0], box[1][0]), Math.min(box[0][1], box[1][1])];
          const [x1, y1] = [Math.max(box[0][0], box[1][0]), Math.max(box[0][1], box[1][1])];
          const tip = a.pts[0];
          const cand = [[x0, (y0 + y1) / 2], [x1, (y0 + y1) / 2], [(x0 + x1) / 2, y0], [(x0 + x1) / 2, y1]];
          const an = cand.reduce((b, c) => (Math.hypot(c[0] - tip[0], c[1] - tip[1]) < Math.hypot(b[0] - tip[0], b[1] - tip[1]) ? c : b));
          set('CL', ctx.obj(flat(W, [tip, an, an])));
          set('LE', N('ClosedArrow'));
        }
        break;
      }
      case 'note':
        set('Name', N('Comment'));
        break;
      case 'markup':
        set('QuadPoints', ctx.obj(flat(W, a.pts)));
        break;
      case 'symbol':
        set('Name', N('LumiPlanSymbole'));
        break;
    }
    // Données LumiPlan (symbole, étiquette, style exact) pour la réouverture
    const lpa = JSON.parse(JSON.stringify(a));
    delete lpa.src; delete lpa.srcStamp; delete lpa.replies;
    set('LPData', hexT(JSON.stringify({ v: 1, rect, auto, a: lpa })));
    set('AP', ctx.obj({ N: appearance(W, a, rect) }));
    return ref;
  }

  function writeReply(W, r, parentRef, parent) {
    const L = window.PDFLib;
    const { ctx } = W;
    if (r.src) {
      const ref = tagToRef(r.src.ref);
      const d = ref && ctx.lookup(ref);
      if (d instanceof L.PDFDict) {
        if (r.text !== r.srcText) {
          d.set(N('Contents'), L.PDFHexString.fromText(r.text || ''));
          d.delete(N('RC'));
          d.set(N('M'), L.PDFString.of(pdfDate(r.modified)));
        }
        return ref;
      }
    }
    const pr = rectOf(W, LP.bboxAnnotation(parent));
    const rect = [pr[0], pr[3] - 18, pr[0] + 18, pr[3]].map(r3);
    const d = ctx.obj({
      Type: 'Annot', Subtype: 'Text', F: 28, Name: 'Comment', RT: 'R',
      Rect: rect, C: [1, 0.83, 0],
    });
    d.set(N('IRT'), parentRef);
    d.set(N('P'), W.page.ref);
    d.set(N('NM'), L.PDFHexString.fromText(r.id));
    d.set(N('T'), L.PDFHexString.fromText(r.author || ''));
    d.set(N('Contents'), L.PDFHexString.fromText(r.text || ''));
    d.set(N('CreationDate'), L.PDFString.of(pdfDate(r.created)));
    d.set(N('M'), L.PDFString.of(pdfDate(r.modified)));
    d.set(N('Subj'), L.PDFHexString.fromText('Réponse'));
    // Apparence vide : la réponse s'affiche dans la liste des commentaires, pas sur le plan
    d.set(N('AP'), ctx.obj({ N: appearance(W, null, rect) }));
    return ctx.register(d);
  }

  Object.assign(LP, { readNative, nativeToModel: toModel, exportNative, annotStamp: stamp });
})();
