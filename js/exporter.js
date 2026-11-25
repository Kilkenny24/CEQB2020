/*
 * Export PDF : les annotations sont dessinées (aplaties) dans le contenu des
 * pages avec pdf-lib, en réutilisant exactement le code de dessin de l'écran.
 */
(function () {
  'use strict';
  const LP = window.LP;

  function invert(m) {
    const [a, b, c, d, e, f] = m;
    const det = a * d - b * c;
    return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
  }

  function dataUrlBytes(url) {
    const [head, b64] = url.split(',');
    return { bytes: LP.base64ToBytes(b64), png: /image\/png/.test(head) };
  }

  /*
   * pdfBytes : Uint8Array du PDF d'origine
   * pdfjsDoc : document pdf.js (pour la géométrie des pages)
   * annots   : annotations ; images : {symbolId: dataURL} ; env : {scaleFor}
   */
  async function exportPdf(pdfBytes, pdfjsDoc, annots, images, env, onProgress) {
    const L = window.PDFLib;
    const doc = await L.PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
    const font = await doc.embedFont(L.StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(L.StandardFonts.HelveticaBold);
    const embedded = {}; // symbolId -> PDFImage

    const byPage = new Map();
    for (const a of annots) {
      if (a.type === 'calibrate') continue;
      if (!byPage.has(a.page)) byPage.set(a.page, []);
      byPage.get(a.page).push(a);
    }

    let done = 0;
    for (const [pageNum, list] of byPage) {
      if (pageNum < 1 || pageNum > doc.getPageCount()) continue;
      const page = doc.getPage(pageNum - 1);
      const jsPage = await pdfjsDoc.getPage(pageNum);
      const extra = env.rotation ? env.rotation(pageNum) : 0;
      const vp = jsPage.getViewport({ scale: 1, rotation: (jsPage.rotate + extra) % 360 });
      if (extra) page.setRotation(L.degrees((jsPage.rotate + extra) % 360));
      const inv = invert(vp.transform);

      const gs = new Map();
      const res = {
        font, fontBold, images: {},
        fontName: page.node.newFontDictionary('LPF', font.ref),
        fontBoldName: page.node.newFontDictionary('LPFB', fontBold.ref),
        gsName(a) {
          if (!gs.has(a)) gs.set(a, page.node.newExtGState('GS', doc.context.obj({ Type: 'ExtGState', CA: a, ca: a })));
          return gs.get(a);
        },
      };
      for (const a of list) {
        for (const id of LP.annotImageIds(a)) {
          if (res.images[id] || !images[id]) continue;
          if (!embedded[id]) {
            const { bytes, png } = dataUrlBytes(images[id]);
            embedded[id] = png ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
          }
          res.images[id] = page.node.newXObject('LPIm', embedded[id].ref);
        }
      }

      // Note : pdf-lib isole déjà le contenu existant (q … Q) lors de la
      // normalisation de la page (autoNormalizeCTM), on repart donc d'un état propre.
      page.node.normalize();

      const R = new LP.PdfRenderer(res);
      R.save();
      R.transform(...inv); // repère « page affichée » (y vers le bas) → espace PDF
      for (const a of list) LP.drawAnnotation(R, a, env);
      R.restore();
      page.pushOperators(...R.ops);

      done++;
      if (onProgress) onProgress(done, byPage.size);
    }
    doc.setProducer('LumiPlan');
    doc.setModificationDate(new Date());
    return await doc.save({ useObjectStreams: true });
  }

  LP.exportPdf = exportPdf;
})();
