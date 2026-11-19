/*
 * Échelles et mesures. Une échelle de page = nombre de mètres réels par point PDF.
 * Unités d'affichage : 'm', 'mm', 'ft' (pieds-pouces).
 */
(function () {
  'use strict';
  const IN = 0.0254, FT = 0.3048, PT_IN = 1 / 72;

  // Échelles prédéfinies : mètres réels par point papier
  const PRESETS = [
    { label: '1/16" = 1\'-0"', mpp: (PT_IN * 16 * FT) / 1 },
    { label: '3/32" = 1\'-0"', mpp: (PT_IN * (32 / 3)) * FT },
    { label: '1/8" = 1\'-0"', mpp: PT_IN * 8 * FT },
    { label: '3/16" = 1\'-0"', mpp: PT_IN * (16 / 3) * FT },
    { label: '1/4" = 1\'-0"', mpp: PT_IN * 4 * FT },
    { label: '3/8" = 1\'-0"', mpp: PT_IN * (8 / 3) * FT },
    { label: '1/2" = 1\'-0"', mpp: PT_IN * 2 * FT },
    { label: '1" = 1\'-0"', mpp: PT_IN * FT },
    { label: '1:20', mpp: PT_IN * IN * 20 },
    { label: '1:50', mpp: PT_IN * IN * 50 },
    { label: '1:75', mpp: PT_IN * IN * 75 },
    { label: '1:100', mpp: PT_IN * IN * 100 },
    { label: '1:200', mpp: PT_IN * IN * 200 },
    { label: '1:250', mpp: PT_IN * IN * 250 },
    { label: '1:500', mpp: PT_IN * IN * 500 },
  ];

  /*
   * Interprète une longueur saisie : "10 m", "3500 mm", "12'-6\"", "12' 6", "12.5 ft", "150 in", "25'".
   * Retourne {meters, unit} ou null.
   */
  function parseLength(str) {
    if (!str) return null;
    const s = String(str).trim().toLowerCase().replace(',', '.').replace(/[’′]/g, "'").replace(/[”″]/g, '"');
    let m;
    if ((m = s.match(/^(-?\d+(?:\.\d+)?)\s*'\s*-?\s*(\d+(?:\.\d+)?)?\s*(?:"|in)?$/))) {
      const ft = parseFloat(m[1]), inch = m[2] ? parseFloat(m[2]) : 0;
      return { meters: ft * FT + inch * IN, unit: 'ft' };
    }
    if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(mm|cm|m|ft|pi|in|po|"|')?$/))) {
      const v = parseFloat(m[1]);
      switch (m[2]) {
        case 'mm': return { meters: v / 1000, unit: 'mm' };
        case 'cm': return { meters: v / 100, unit: 'm' };
        case 'ft': case 'pi': case "'": return { meters: v * FT, unit: 'ft' };
        case 'in': case 'po': case '"': return { meters: v * IN, unit: 'ft' };
        default: return { meters: v, unit: 'm' };
      }
    }
    return null;
  }

  function fmtLength(meters, unit) {
    if (!isFinite(meters)) return '';
    if (unit === 'mm') return `${Math.round(meters * 1000)} mm`;
    if (unit === 'ft') {
      let totalIn = meters / IN;
      let ft = Math.floor(totalIn / 12);
      let inch = Math.round(totalIn - ft * 12);
      if (inch === 12) { ft += 1; inch = 0; }
      return `${ft}'-${inch}"`;
    }
    return `${meters.toFixed(2).replace('.', ',')} m`;
  }

  function fmtArea(m2, unit) {
    if (unit === 'ft') return `${Math.round(m2 / (FT * FT)).toLocaleString('fr-CA')} pi²`;
    return `${m2.toFixed(2).replace('.', ',')} m²`;
  }

  function polyLength(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return L;
  }
  function polyArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a) / 2;
  }

  window.LP = window.LP || {};
  Object.assign(window.LP, { SCALE_PRESETS: PRESETS, parseLength, fmtLength, fmtArea, polyLength, polyArea });
})();
