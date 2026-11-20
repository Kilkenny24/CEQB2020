#!/usr/bin/env node
/*
 * Construit des versions « fichier unique » de LumiPlan et de l'Atelier :
 * CSS, scripts et bibliothèques sont intégrés dans le HTML, qui fonctionne
 * donc seul (même ouvert depuis un zip ou téléchargé isolément).
 *
 *   node tools/build-autonome.js   →   dist/LumiPlan.html, dist/Atelier.html
 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function inline(htmlFile, outName, links) {
  let html = read(htmlFile);
  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => `<style>\n${read(href)}\n</style>`);
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    // « </script » dans le code fermerait la balise : on l'échappe (sans effet sur le JavaScript)
    const js = read(src).replace(/<\/script/gi, '<\\/script');
    return `<script>/* ${src} */\n${js}\n</script>`;
  });
  for (const [from, to] of links) html = html.split(`href="${from}"`).join(`href="${to}"`);
  // Le contrôle « fichiers manquants » n'a pas lieu d'être dans la version autonome
  html = html.replace(/<script id="loadCheck">[\s\S]*?<\/script>/, '');
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist', outName), html);
  console.log(`dist/${outName} : ${(Buffer.byteLength(html) / 1e6).toFixed(2)} Mo`);
}

inline('index.html', 'LumiPlan.html', [['atelier.html', 'Atelier.html']]);
inline('atelier.html', 'Atelier.html', [['index.html', 'LumiPlan.html']]);
