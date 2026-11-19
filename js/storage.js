/*
 * Stockage local (IndexedDB) : bibliothèque de symboles + sauvegarde auto
 * par PDF. Enregistrement / ouverture de fichiers.
 */
(function () {
  'use strict';
  const DB = 'lumiplan', STORE = 'kv';
  let dbp = null;

  function db() {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return dbp;
  }
  async function get(key) {
    try {
      const d = await db();
      return await new Promise((res, rej) => {
        const r = d.transaction(STORE).objectStore(STORE).get(key);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    } catch (e) { console.warn('IndexedDB indisponible', e); return undefined; }
  }
  async function set(key, val) {
    try {
      const d = await db();
      await new Promise((res, rej) => {
        const t = d.transaction(STORE, 'readwrite');
        t.objectStore(STORE).put(val, key);
        t.oncomplete = res;
        t.onerror = () => rej(t.error);
      });
    } catch (e) { console.warn('IndexedDB indisponible', e); }
  }

  // Enregistre un Blob. Si `handle` (File System Access API) est fourni ou
  // obtenu, réécrit le même fichier ; sinon téléchargement classique.
  async function saveBlob(blob, name, opts = {}) {
    if (window.showSaveFilePicker && !opts.forceDownload) {
      try {
        let handle = opts.handle;
        if (!handle) {
          handle = await window.showSaveFilePicker({
            suggestedName: name,
            types: opts.types || [{ description: 'Fichier', accept: { [blob.type || 'application/octet-stream']: ['.' + name.split('.').pop()] } }],
          });
        }
        const w = await handle.createWritable();
        await w.write(blob);
        await w.close();
        return handle;
      } catch (e) {
        if (e.name === 'AbortError') return null;
        console.warn('Sauvegarde directe impossible, téléchargement', e);
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    return null;
  }

  function readFile(file, as) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error);
      if (as === 'text') r.readAsText(file);
      else if (as === 'dataurl') r.readAsDataURL(file);
      else r.readAsArrayBuffer(file);
    });
  }

  function bytesToBase64(bytes) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function base64ToBytes(b64) {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  Object.assign(window.LP, { store: { get, set }, saveBlob, readFile, bytesToBase64, base64ToBytes });
})();
