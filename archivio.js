/* Archivio dei brani della band (App Antifragile).
   Il foglio è una lista di righe: {t:'riga', testo, acc:[{c: colonna, n: nome}]}, {t:'sez', testo}, {t:'vuota'}.
   Ogni accordo è legato a una COLONNA del testo: se si scrive prima di lui, si sposta insieme alla sua parola.
   Due modi:
     - nell'app (sito della band): i dati stanno nel database della band, protetti dal codice del link;
     - prova sul Mac (prototipi/archivio, con window.ARCHIVIO_PROVA): tutto resta nel browser, con l'audio vero.
   Ogni modifica si può annullare e ogni versione resta nello storico. */
(() => {
  'use strict';

  const PERSONE = ['Checco', 'Sofia', 'Franci', 'Dave', 'Mag'];
  const LOCALE = !!window.ARCHIVIO_PROVA;
  const CFG = window.BAND_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mem = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    raw(k, v) {
      try {
        if (v === undefined) return localStorage.getItem(k);
        if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
      } catch (e) { /* memoria del browser bloccata */ }
      return null;
    },
  };
  let _n = 0;
  const nid = () => 'r' + Date.now().toString(36) + (_n++).toString(36);
  const clona = (o) => JSON.parse(JSON.stringify(o));
  const fmtTempo = (t) => { t = Math.max(0, Math.round(t || 0)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };

  // ---------------- Accordi ----------------
  const RADICE = '(DO|RE|MI|FA|SOL|LA|SI|[A-G])([#b♯♭]?)';
  const SUFFISSO = '((?:maj|min|dim|aug|sus|add|m|M|[0-9]|[#b+°ø()\\-])*)';
  const BASSO = '(?:\\/(DO|RE|MI|FA|SOL|LA|SI|[A-G])([#b♯♭]?))?';
  const RE_ACC = new RegExp('^' + RADICE + SUFFISSO + BASSO + '$');
  const eAccordo = (p) => RE_ACC.test(p) || /^(N\.?C\.?|\(?x\d+\)?)$/i.test(p);
  function rigaDiAccordi(r) {
    const p = r.trim().split(/\s+/).filter(Boolean);
    const veri = p.filter((x) => !/^[-|/.]+$/.test(x));
    if (!veri.length) return false;
    const n = veri.filter(eAccordo).length;
    return n >= 1 && n / veri.length >= 0.6;
  }
  const ITA = ['DO', 'DO#', 'RE', 'RE#', 'MI', 'FA', 'FA#', 'SOL', 'SOL#', 'LA', 'LA#', 'SI'];
  const ITA_B = ['DO', 'REb', 'RE', 'MIb', 'MI', 'FA', 'SOLb', 'SOL', 'LAb', 'LA', 'SIb', 'SI'];
  const ENG = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const ENG_B = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const SEMI = { DO: 0, RE: 2, MI: 4, FA: 5, SOL: 7, LA: 9, SI: 11, C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const altezza = (r, a) => (SEMI[r] + (a === '#' || a === '♯' ? 1 : a === 'b' || a === '♭' ? -1 : 0) + 12) % 12;
  const nomeNota = (n, sis, bem) => (sis === 'ita' ? (bem ? ITA_B : ITA) : (bem ? ENG_B : ENG))[((n % 12) + 12) % 12];
  function traduci(nome, semi, sistema) {
    if (!semi && sistema === 'orig') return nome;
    const m = nome.match(RE_ACC);
    if (!m) return nome;
    const sis = sistema === 'orig' ? (/^(DO|RE|MI|FA|SOL|LA|SI)$/.test(m[1]) ? 'ita' : 'eng') : sistema;
    const bem = (a) => a === 'b' || a === '♭';
    let s = nomeNota(altezza(m[1], m[2]) + semi, sis, bem(m[2])) + m[3];
    if (m[4]) s += '/' + nomeNota(altezza(m[4], m[5]) + semi, sis, bem(m[5]));
    return s;
  }

  // ---------------- Testo <-> foglio ----------------
  function daTesto(txt, vecchio) {
    const usati = new Set();
    const riusa = (testo) => {
      if (!vecchio) return nid();
      const r = vecchio.find((x) => x.t === 'riga' && x.testo === testo && !usati.has(x.id));
      if (r) { usati.add(r.id); return r.id; }
      return nid();
    };
    const L = String(txt).replace(/\r/g, '').replace(/^﻿/, '').split('\n');
    const out = [];
    for (let i = 0; i < L.length; i++) {
      const r = L[i].replace(/ /g, ' ');
      if (!r.trim()) { if (out.length && out[out.length - 1].t !== 'vuota') out.push({ id: nid(), t: 'vuota' }); continue; }
      const m = r.trim().match(/^\[(.+)\]$/);
      if (m) { out.push({ id: nid(), t: 'sez', testo: m[1].trim() }); continue; }
      if (/^[A-ZÀ-Ý][A-ZÀ-Ý '’]{1,30}$/.test(r.trim()) && !rigaDiAccordi(r)) { out.push({ id: nid(), t: 'sez', testo: r.trim() }); continue; }
      if (rigaDiAccordi(r)) {
        const acc = [];
        r.replace(/\S+/g, (tok, pos) => { acc.push({ c: pos, n: tok }); return tok; });
        const nx = L[i + 1];
        if (nx !== undefined && nx.trim() && !rigaDiAccordi(nx) && !/^\s*\[.+\]\s*$/.test(nx)) {
          const testo = nx.replace(/ /g, ' ').replace(/\s+$/, '');
          out.push({ id: riusa(testo), t: 'riga', testo, acc });
          i++;
        } else {
          out.push({ id: riusa(''), t: 'riga', testo: '', acc });
        }
        continue;
      }
      const testo = r.replace(/\s+$/, '');
      out.push({ id: riusa(testo), t: 'riga', testo, acc: [] });
    }
    while (out.length && out[out.length - 1].t === 'vuota') out.pop();
    return out;
  }
  const ordina = (acc) => acc.sort((a, b) => a.c - b.c);
  function lineaAccordi(acc) {
    let s = '';
    ordina(acc.slice()).forEach((a) => { let c = a.c; if (s.length && c < s.length + 1) c = s.length + 1; s = s.padEnd(c) + a.n; });
    return s;
  }
  function aTesto(m) {
    return m.map((x) => {
      if (x.t === 'vuota') return '';
      if (x.t === 'sez') return '[' + x.testo + ']';
      if (!x.acc.length) return x.testo;
      return x.testo ? lineaAccordi(x.acc) + '\n' + x.testo : lineaAccordi(x.acc);
    }).join('\n');
  }
  function sistemaSovrapposizioni(acc) {
    ordina(acc);
    for (let k = 1; k < acc.length; k++) {
      const min = acc[k - 1].c + acc[k - 1].n.length + 1;
      if (acc[k].c < min) acc[k].c = min;
    }
    acc.forEach((a) => { if (a.c < 0) a.c = 0; });
  }

  // ---------------- Database (solo nell'app) ----------------
  let codice = null;
  const Api = {
    async rpc(nome, corpo) {
      if (!CFG.url || !CFG.key) throw new Error('config_mancante');
      const h = { 'Content-Type': 'application/json', apikey: CFG.key };
      if (CFG.key.startsWith('eyJ')) h.Authorization = 'Bearer ' + CFG.key;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      try {
        const r = await fetch(`${CFG.url}/rest/v1/rpc/${nome}`, { method: 'POST', headers: h, body: JSON.stringify(corpo), signal: ctrl.signal });
        const testo = await r.text();
        let json = null;
        try { json = testo ? JSON.parse(testo) : null; } catch (e) { /* non JSON */ }
        if (!r.ok) { const e = new Error((json && json.message) || 'http_' + r.status); e.status = r.status; throw e; }
        return json;
      } catch (e) {
        if (e.name === 'AbortError') throw new Error('timeout');
        throw e;
      } finally { clearTimeout(timer); }
    },
    elenco: () => Api.rpc('band_arch_leggi', { p_codice: codice, p_brano: null }),
    leggi: (b) => Api.rpc('band_arch_leggi', { p_codice: codice, p_brano: b }),
    stato: (b) => Api.rpc('band_arch_stato', { p_codice: codice, p_brano: b }),
    salva: (b, chi, foglio, base, nota) => Api.rpc('band_arch_salva', { p_codice: codice, p_brano: b, p_chi: chi, p_foglio: foglio, p_base: base, p_nota: nota || null }),
    appunto: (b, a) => Api.rpc('band_arch_appunto', { p_codice: codice, p_brano: b, p_appunto: a }),
    personali: (b, persona, dati) => Api.rpc('band_arch_personali', { p_codice: codice, p_brano: b, p_persona: persona, p_dati: dati }),
  };
  const normalizzaCodice = (t) => {
    const m = String(t || '').match(/[#&?]c=([A-Za-z0-9]+)/);
    return (m ? m[1] : String(t || '')).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  };

  // ---------------- Stato ----------------
  let S = null;            // { brano, modello, versioni, appunti, personali, versione }
  let brano = null;        // { id, titolo, autore, info }
  let io = PERSONE.includes(mem.raw('prove.io')) ? mem.raw('prove.io') : null;
  const vista = Object.assign({ sistema: 'orig', semi: 0, fs: window.innerWidth < 600 ? 14 : 18, mostraMiei: true, modoAcc: 'tutti' }, mem.get('archivio.vista', {}));
  const vistaCambiata = () => vista.sistema !== 'orig' || vista.semi !== 0;
  const disp = (n) => traduci(n, vista.semi, vista.sistema);
  const trova = (id) => S.modello.find((x) => x.id === id);
  const indice = (id) => S.modello.findIndex((x) => x.id === id);
  const chiaveLocale = () => 'archivio.prova.' + brano.id;
  const miei = () => (io && S.personali[io]) || null;
  const mioDi = (x) => { const m = miei(); return m && m[x.id] && Array.isArray(m[x.id].acc) ? m[x.id].acc : null; };
  // gli accordi che si VEDONO in una riga (i miei, se ne ho e li voglio vedere)
  const accVisti = (x) => (vista.mostraMiei && mioDi(x)) || x.acc;
  // gli accordi che si CAMBIANO: quelli di tutti, oppure i miei (copiati da quelli di tutti la prima volta)
  const persDaSalvare = new Set();
  function accDaCambiare(x) {
    if (vista.modoAcc !== 'mio' || !io) return x.acc;
    persDaSalvare.add(io);
    if (!S.personali[io]) S.personali[io] = {};
    if (!S.personali[io][x.id]) S.personali[io][x.id] = { acc: clona(x.acc) };
    vista.mostraMiei = true;
    return S.personali[io][x.id].acc;
  }
  // applica la stessa trasformazione agli accordi di tutti e a quelli personali di ogni musicista
  function perTuttiGliAccordi(x, fn) {
    fn(x.acc, null);
    Object.keys(S.personali).forEach((p) => { const r = S.personali[p] && S.personali[p][x.id]; if (r && Array.isArray(r.acc)) { persDaSalvare.add(p); fn(r.acc, p); } });
  }

  // ---------------- Salvataggio, versioni, annulla ----------------
  let tSalva = null;
  let tPers = null;
  const statoSalvato = (testo, problema) => {
    const el = $('salvato');
    el.textContent = testo;
    el.classList.toggle('in-corso', !!problema);
  };
  const oraBreve = () => new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

  // --- prova sul Mac: tutto nel browser ---
  function salvaLocale() {
    const ok = mem.set(chiaveLocale(), S);
    statoSalvato(ok ? 'Salvato alle ' + oraBreve() : 'NON salvato: la memoria del browser non risponde', !ok);
  }
  function segnaVersioneLocale(nota) {
    const ora = new Date();
    const ultima = S.versioni[S.versioni.length - 1];
    const chi = io || 'Senza nome';
    if (nota || !ultima || ultima.fissa || ultima.nota || ultima.chi !== chi || ora - new Date(ultima.quando) > 3 * 60 * 1000) {
      S.versioni.push({ quando: ora.toISOString(), chi, nota: nota || null, modello: clona(S.modello) });
      if (S.versioni.length > 150) S.versioni.splice(2, 1);
    } else {
      ultima.modello = clona(S.modello);
      ultima.quando = ora.toISOString();
    }
  }

  // --- nell'app: database della band, con una coda sul telefono se manca la rete ---
  let daSalvare = false;
  let notaDaSalvare = null;
  let inVolo = false;
  const chiaveCoda = () => 'archivio.coda.' + brano.id;
  async function salvaRemoto() {
    if (inVolo) { clearTimeout(tSalva); tSalva = setTimeout(salvaRemoto, 400); return; }
    if (!daSalvare) return;
    inVolo = true;
    daSalvare = false;
    const nota = notaDaSalvare;
    notaDaSalvare = null;
    const foglio = clona(S.modello);
    try {
      const r = await Api.salva(brano.id, io || 'Senza nome', foglio, S.versione, nota);
      if (r && r.ok) {
        S.versione = r.versione;
        if (!daSalvare) { mem.raw(chiaveCoda(), null); statoSalvato('Salvato per tutti alle ' + oraBreve()); }
      } else if (r && r.conflitto) {
        mem.raw(chiaveCoda(), null);
        daSalvare = false;
        S.modello = r.foglio;
        S.versione = r.versione;
        passato.length = 0; futuro.length = 0; aggiornaAnnulla();
        rendiFoglio();
        toast('Nel frattempo ' + (r.aggiornato_da || 'qualcuno') + ' ha cambiato il brano: ora vedi la sua versione. La tua è salvata nelle Versioni.');
        statoSalvato('Aggiornato con le modifiche di ' + (r.aggiornato_da || 'un altro'));
      }
    } catch (e) {
      if (e.message === 'codice_errato') { chiediCodice(); return; }
      daSalvare = true;
      if (nota && !notaDaSalvare) notaDaSalvare = nota;
      statoSalvato('Non salvato: senza rete, riprovo tra poco (resta su questo telefono)', true);
      clearTimeout(tSalva);
      tSalva = setTimeout(salvaRemoto, 8000);
    } finally {
      inVolo = false;
      if (daSalvare) { clearTimeout(tSalva); tSalva = setTimeout(salvaRemoto, 600); }
    }
  }
  async function salvaPersonaliRemoto() {
    const chi = [...persDaSalvare];
    if (!chi.length) return;
    persDaSalvare.clear();
    const falliti = [];
    for (const p of chi) {
      try { await Api.personali(brano.id, p, S.personali[p] || {}); }
      catch (e) { falliti.push(p); }
    }
    tPers = null;
    if (falliti.length) {
      falliti.forEach((p) => persDaSalvare.add(p));
      statoSalvato('Accordi personali non salvati: senza rete, riprovo tra poco', true);
      tPers = setTimeout(salvaPersonaliRemoto, 8000);
    } else if (!daSalvare && !inVolo) statoSalvato('Salvato alle ' + oraBreve());
  }

  // chiamata dopo OGNI modifica del foglio
  function cambiato(nota, personali) {
    if (LOCALE) {
      if (!personali) segnaVersioneLocale(nota);
      statoSalvato('Salvo…', true);
      clearTimeout(tSalva);
      tSalva = setTimeout(salvaLocale, 250);
      return;
    }
    if (personali) {
      statoSalvato('Salvo i tuoi accordi…', true);
      clearTimeout(tPers);
      tPers = setTimeout(salvaPersonaliRemoto, 700);
      return;
    }
    daSalvare = true;
    if (nota) notaDaSalvare = nota;
    mem.raw(chiaveCoda(), JSON.stringify({ foglio: S.modello, base: S.versione, nota: notaDaSalvare }));
    statoSalvato('Salvo…', true);
    clearTimeout(tSalva);
    tSalva = setTimeout(salvaRemoto, 700);
  }
  const cambiatoAccordi = () => cambiato(null, vista.modoAcc === 'mio' && !!io);

  const passato = [];
  const futuro = [];
  let gruppo = null;
  let tGruppo = 0;
  const foto = () => JSON.stringify({ m: S.modello, p: S.personali });
  function primaDiCambiare(g) {
    const ora = Date.now();
    if (g && g === gruppo && ora - tGruppo < 1500) { tGruppo = ora; return; }
    passato.push(foto());
    if (passato.length > 300) passato.shift();
    futuro.length = 0;
    gruppo = g || null;
    tGruppo = ora;
    aggiornaAnnulla();
  }
  function ripristina(f) {
    const prima = JSON.stringify(S.personali);
    const o = JSON.parse(f);
    S.modello = o.m;
    S.personali = o.p;
    gruppo = null;
    rendiFoglio(); cambiato();
    if (JSON.stringify(S.personali) !== prima) {
      const vecchie = JSON.parse(prima);
      new Set([...Object.keys(vecchie), ...Object.keys(S.personali)]).forEach((p) => {
        if (JSON.stringify(vecchie[p] || {}) !== JSON.stringify(S.personali[p] || {})) persDaSalvare.add(p);
      });
      cambiato(null, true);
    }
    aggiornaAnnulla(); rendiAppunti();
  }
  function annulla() { if (!passato.length) return; futuro.push(foto()); ripristina(passato.pop()); }
  function rifai() { if (!futuro.length) return; passato.push(foto()); ripristina(futuro.pop()); }
  function aggiornaAnnulla() {
    $('annulla').disabled = !passato.length;
    $('rifai').disabled = !futuro.length;
  }

  // ---------------- Chi sei ----------------
  // «Ciao, chi sei?» si chiede una volta, all'inizio; poi in alto resta solo il nome con «Cambia».
  function rendiChi() {
    $('chi').innerHTML = PERSONE.map((p, i) => `
      <button type="button" class="persona-btn" role="radio" data-p="${i}" aria-checked="${p === io}">
        <span class="pallino"></span>${esc(p)}</button>`).join('');
    $('io-nome').innerHTML = io ? `<span class="pallino" data-p="${PERSONE.indexOf(io)}"></span><span class="ciao">Ciao </span>${esc(io)}` : 'Chi sei?';
    $('cambia-io').textContent = io ? 'Cambia' : 'Scegli';
  }
  function chiediChi() {
    rendiChi();
    if (!$('dlg-chi').open && !$('dlg-codice').open) $('dlg-chi').showModal();
  }
  $('cambia-io').addEventListener('click', chiediChi);
  $('chi').addEventListener('click', (e) => {
    const b = e.target.closest('.persona-btn');
    if (!b) return;
    io = PERSONE[+b.dataset.p];
    mem.raw('prove.io', io);
    rendiChi();
    if ($('dlg-chi').open) $('dlg-chi').close();
    rendiModoAcc();
    if (S) rendiFoglio();
  });

  // ---------------- Elenco brani ----------------
  let elencoBrani = [];
  function rendiElenco() {
    const q = $('cerca').value.trim().toLowerCase();
    const lista = elencoBrani.filter((b) => !q || b.titolo.toLowerCase().includes(q));
    $('brani').innerHTML = lista.map((b) => `
      <li><button type="button" class="brano-voce" data-brano="${esc(b.id)}" aria-current="${brano && b.id === brano.id}"><b>${esc(b.titolo)}</b><small>di ${esc(b.autore || '…')}</small></button></li>`).join('') ||
      '<li class="vuoto-msg">Nessun brano con questo nome.</li>';
    const d = $('drive');
    if (d) {
      d.innerHTML = (LOCALE ? window.ARCHIVIO_PROVA.nel_drive : []).filter((b) => !q || b.titolo.toLowerCase().includes(q)).map((b) => `
        <li><a href="${esc(b.drive)}" target="_blank" rel="noopener" title="Apri la cartella nel Drive"><span>${esc(b.titolo)}</span><span>Drive ↗</span></a></li>`).join('');
      d.hidden = !d.innerHTML;
      const t = $('drive-titolo');
      if (t) t.hidden = !d.innerHTML;
    }
  }
  $('cerca').addEventListener('input', rendiElenco);
  $('brani').addEventListener('click', (e) => {
    const b = e.target.closest('[data-brano]');
    if (b && (!brano || b.dataset.brano !== brano.id)) apriBrano(b.dataset.brano);
  });

  // ---------------- Il foglio ----------------
  const foglio = $('foglio');
  let chPx = 10;
  // Con il dito si sceglie prima la riga (un tocco), e solo quella si modifica: così scorrendo non si sposta niente.
  const tocco = () => matchMedia('(pointer: coarse)').matches;
  let rigaScelta = null;
  const modificabile = (id) => !tocco() || id === rigaScelta;
  function scegliRiga(id) {
    const vecchia = rigaScelta;
    rigaScelta = id;
    if (vecchia && vecchia !== id) rirendiRiga(vecchia);
    rirendiRiga(id);
    const x = trova(id);
    if (x && x.t === 'riga') { rigaCorrente = id; aggiornaCollega(); }
  }
  function misuraCh() {
    const m = document.createElement('span');
    m.className = 'misura';
    m.textContent = '0'.repeat(50);
    foglio.appendChild(m);
    chPx = m.getBoundingClientRect().width / 50 || 10;
    m.remove();
  }
  // gli stili di posizione si danno da JavaScript (la pagina non ammette stili scritti dentro l'HTML)
  function applicaStili(root) {
    root.querySelectorAll('[data-left]').forEach((el) => { el.style.left = el.dataset.left + 'ch'; });
    root.querySelectorAll('[data-minw]').forEach((el) => { el.style.minWidth = el.dataset.minw + 'ch'; });
  }
  let saltiSez = new Map();
  function calcolaSalti() {
    saltiSez = new Map();
    if (!LOCALE) return;
    const reg = (brano.info.registrazioni || [])[regAttiva];
    if (!reg) return;
    const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const conta = {};
    const tempi = {};
    (reg.segnaposti || []).forEach((s) => { const k = norm(s.nome); (tempi[k] = tempi[k] || []).push(s.t); });
    S.modello.forEach((x) => {
      if (x.t !== 'sez') return;
      const k = norm(x.testo);
      const n = conta[k] = (conta[k] || 0) + 1;
      if (tempi[k] && tempi[k][n - 1] != null) saltiSez.set(x.id, tempi[k][n - 1]);
    });
  }
  const noteDellaRiga = (id) => S.appunti.filter((a) => a.riga === id && !a.fatto);
  const uguale = (a, acc) => acc.some((b) => b.c === a.c && b.n === a.n);
  function accordiHtml(x) {
    const visti = accVisti(x);
    const personali = visti !== x.acc;
    let fine = -1;
    return visti.map((a, i) => {
      const n = disp(a.n);
      const c = Math.max(a.c, fine + 1);
      fine = c + n.length;
      const mio = personali && !uguale(a, x.acc);
      return `<span class="acc${mio ? ' personale' : ''}" data-i="${i}" data-left="${c}"${mio ? ` data-p="${PERSONE.indexOf(io)}"` : ''} title="${mio ? 'Accordo solo tuo · ' : ''}Clicca per cambiarlo, trascinalo per spostarlo">${esc(n)}</span>`;
    }).join('');
  }
  function larghezza(x) {
    const fine = accVisti(x).reduce((m, a) => Math.max(m, a.c + disp(a.n).length), 0);
    return Math.max(x.testo.length, fine) + 18;
  }
  const MANIGLIA = (lab) => `<button type="button" class="maniglia" aria-haspopup="menu" aria-expanded="false" aria-label="${lab}">⋮</button>`;
  function rendiVoce(x) {
    if (x.t === 'vuota') return `<div class="vuota" data-id="${x.id}">${MANIGLIA('Opzioni dello spazio')}</div>`;
    if (x.t === 'sez') {
      const t = saltiSez.get(x.id);
      const salta = t != null ? `<button type="button" class="sez-salta" data-t="${t}" title="Ascolta da qui">▶ ${fmtTempo(t)}</button>` : '';
      return `<div class="blocco-sez${x.id === rigaScelta ? ' scelta' : ''}" data-id="${x.id}">${MANIGLIA('Opzioni del titolo')}<span class="sez-nome" contenteditable="${modificabile(x.id) ? 'plaintext-only' : 'false'}" spellcheck="false" data-campo="sez">${esc(x.testo)}</span>${salta}</div>`;
    }
    const ind = /^\s*\(/.test(x.testo) ? ' indicazione' : '';
    const note = noteDellaRiga(x.id);
    const mio = vista.mostraMiei && mioDi(x);
    const dots = (note.length || mio) ? `<div class="note-riga">${mio ? `<span class="tag-mio" data-p="${PERSONE.indexOf(io)}" title="In questa riga vedi i tuoi accordi">tuoi</span>` : ''}${note.map((a) => `<button type="button" data-p="${PERSONE.indexOf(a.chi)}" data-nota="${esc(a.id)}" title="Appunto di ${esc(a.chi)}: ${esc(a.testo.slice(0, 60))}"></button>`).join('')}</div>` : '';
    return `<div class="riga${accVisti(x).length ? '' : ' senza-accordi'}${ind}${x.id === rigaScelta ? ' scelta' : ''}" data-id="${x.id}">${MANIGLIA('Opzioni della riga')}
      <div class="corpo-riga" data-minw="${larghezza(x)}">
        <div class="acc-riga">${accordiHtml(x)}</div>
        <div class="testo-riga" contenteditable="${modificabile(x.id) ? 'plaintext-only' : 'false'}" spellcheck="false" data-campo="testo">${esc(x.testo)}</div>
      </div>${dots}</div>`;
  }
  function rendiFoglio() {
    calcolaSalti();
    foglio.classList.toggle('bloccato', vistaCambiata());
    foglio.style.setProperty('--fs', vista.fs + 'px');
    foglio.innerHTML = S.modello.map(rendiVoce).join('');
    applicaStili(foglio);
    misuraCh();
    rendiModoAcc();
  }
  function rirendiRiga(id) {
    const el = foglio.querySelector(`[data-id="${id}"]`);
    const x = trova(id);
    if (!el || !x) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = rendiVoce(x);
    const nuovo = tmp.firstElementChild;
    applicaStili(nuovo);
    el.replaceWith(nuovo);
  }
  function aggiornaAccordiRiga(x) {
    const el = foglio.querySelector(`[data-id="${x.id}"]`);
    if (!el) return;
    const ar = el.querySelector('.acc-riga');
    ar.innerHTML = accordiHtml(x);
    applicaStili(ar);
    el.querySelector('.corpo-riga').style.minWidth = larghezza(x) + 'ch';
    el.classList.toggle('senza-accordi', !accVisti(x).length);
    const vecchie = el.querySelector('.note-riga');
    const tmp = document.createElement('div');
    tmp.innerHTML = rendiVoce(x);
    const nuove = tmp.querySelector('.note-riga');
    if (vecchie) vecchie.remove();
    if (nuove) el.appendChild(nuove);
  }
  const elRiga = (id) => foglio.querySelector(`[data-id="${id}"]`);

  // ---- zoom del testo: due dita sul foglio (o pizzico del trackpad). Gli accordi sono in «ch», crescono con il testo ----
  const scorri = document.querySelector('.foglio-scorri');
  let pinch = null;
  const distanza = (ts) => Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY);
  function grandezza(fs, fine) {
    fs = Math.max(10, Math.min(34, Math.round(fs)));
    if (fs !== vista.fs) { vista.fs = fs; foglio.style.setProperty('--fs', fs + 'px'); aggiornaTestoLibero(); }
    if (fine) { misuraCh(); posizionaPop(); mem.set('archivio.vista', vista); }
  }
  scorri.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      pinch = { d0: distanza(e.touches), fs0: vista.fs };
      if (drag) { drag.el.classList.remove('trascina'); if (drag.acc) drag.acc[drag.i].c = drag.c0; aggiornaAccordiRiga(drag.x); drag = null; }
      chiudiPop();
    }
  }, { passive: true });
  scorri.addEventListener('touchmove', (e) => {
    if (!pinch || e.touches.length !== 2) return;
    e.preventDefault();
    grandezza(pinch.fs0 * distanza(e.touches) / pinch.d0);
  }, { passive: false });
  const finePinch = (e) => { if (pinch && e.touches.length < 2) { pinch = null; grandezza(vista.fs, true); } };
  scorri.addEventListener('touchend', finePinch);
  scorri.addEventListener('touchcancel', finePinch);
  scorri.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;            // pizzico del trackpad del Mac = rotella con Ctrl
    e.preventDefault();
    grandezza(vista.fs * Math.exp(-e.deltaY / 120));
    clearTimeout(scorri._t); scorri._t = setTimeout(() => grandezza(vista.fs, true), 250);
  }, { passive: false });

  // cursore fantasma: dove andrebbe l'accordo nuovo
  const fantasma = document.createElement('span');
  fantasma.className = 'cursore-acc';
  foglio.addEventListener('pointermove', (e) => {
    if (drag || vistaCambiata() || e.pointerType === 'touch') return;
    const r = e.target.closest('.acc-riga');
    if (!r || e.target.closest('.acc')) { fantasma.remove(); return; }
    const c = Math.max(0, Math.floor((e.clientX - r.getBoundingClientRect().left) / chPx));
    fantasma.style.left = c + 'ch';
    if (fantasma.parentNode !== r) r.appendChild(fantasma);
  });
  foglio.addEventListener('pointerleave', () => fantasma.remove());

  // ---- trascinare un accordo ----
  let drag = null;
  foglio.addEventListener('pointerdown', (e) => {
    const a = e.target.closest('.acc');
    if (!a || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (pinch || (e.pointerType !== 'mouse' && !modificabile(a.closest('.riga').dataset.id))) return;  // si scorre, non si sposta
    e.preventDefault();
    const x = trova(a.closest('.riga').dataset.id);
    if (vistaCambiata()) { avvisaVista(); return; }
    const visti = accVisti(x);
    const i = +a.dataset.i;
    const prev = visti[i - 1];
    const next = visti[i + 1];
    drag = {
      el: a, x, i, x0: e.clientX, c0: visti[i].c, mosso: false,
      lo: prev ? prev.c + prev.n.length + 1 : 0,
      hi: next ? next.c - visti[i].n.length - 1 : 400,
    };
    fantasma.remove();
    try { a.setPointerCapture(e.pointerId); } catch (err) { /* senza cattura funziona lo stesso */ }
  });
  foglio.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.mosso && Math.abs(e.clientX - drag.x0) < 5) return;
    if (!drag.mosso) {
      drag.mosso = true;
      primaDiCambiare();
      drag.acc = accDaCambiare(drag.x);   // da qui in poi si muove l'accordo giusto (di tutti o mio)
      drag.el.classList.add('trascina');
      chiudiPop();
    }
    const c = Math.min(drag.hi, Math.max(drag.lo, drag.c0 + Math.round((e.clientX - drag.x0) / chPx)));
    drag.acc[drag.i].c = c;
    drag.el.style.left = c + 'ch';
  });
  const fineDrag = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.el.classList.remove('trascina');
    if (d.mosso) {
      if (d.acc[d.i].c !== d.c0) cambiatoAccordi();
      aggiornaAccordiRiga(d.x);
    } else {
      apriAccordo(d.x, d.i, null);
    }
  };
  foglio.addEventListener('pointerup', fineDrag);
  foglio.addEventListener('pointercancel', fineDrag);

  // ---- clic sopra il testo: accordo nuovo ----
  foglio.addEventListener('click', (e) => {
    const salta = e.target.closest('.sez-salta');
    if (salta) { ascoltaDa(+salta.dataset.t); return; }
    const dot = e.target.closest('[data-nota]');
    if (dot) { evidenziaAppunto(dot.dataset.nota); return; }
    const man = e.target.closest('.maniglia');
    if (man) { apriMenu(man); return; }
    const voce = e.target.closest('.riga, .blocco-sez');
    if (voce && !modificabile(voce.dataset.id)) { scegliRiga(voce.dataset.id); return; }
    if (e.target.closest('.acc')) return;
    const r = e.target.closest('.acc-riga');
    if (!r) return;
    if (vistaCambiata()) { avvisaVista(); return; }
    const x = trova(r.closest('.riga').dataset.id);
    const c = Math.max(0, Math.floor((e.clientX - r.getBoundingClientRect().left) / chPx));
    const visti = accVisti(x);
    const sotto = visti.findIndex((a) => c >= a.c && c < a.c + a.n.length);
    if (sotto >= 0) apriAccordo(x, sotto, null);
    else apriAccordo(x, null, c);
  });

  // ---- finestrella dell'accordo: menu a tendina (nota, tipo, basso) ----
  // Tutte le note con le grafie che si usano davvero, e gli accordi della musica occidentale.
  const NOTE_ITA = ['DO', 'DO#', 'REb', 'RE', 'RE#', 'MIb', 'MI', 'FA', 'FA#', 'SOLb', 'SOL', 'SOL#', 'LAb', 'LA', 'LA#', 'SIb', 'SI'];
  const NOTE_ENG = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];
  const TIPI = [
    ['Accordi di tre note', [['', 'maggiore'], ['m', 'minore'], ['dim', 'diminuito'], ['aug', 'aumentato'], ['sus2', 'sospeso di seconda'], ['sus4', 'sospeso di quarta'], ['5', 'bicordo (power chord)']]],
    ['Settime', [['7', 'settima'], ['maj7', 'settima maggiore'], ['m7', 'minore settima'], ['m(maj7)', 'minore con settima maggiore'], ['m7b5', 'semidiminuito'], ['dim7', 'diminuito settima'], ['7sus4', 'settima sospeso di quarta'], ['7(#5)', 'settima aumentata']]],
    ['Seste', [['6', 'sesta'], ['m6', 'minore sesta'], ['6(9)', 'sesta e nona']]],
    ['Note aggiunte ed estese', [['add9', 'nona aggiunta'], ['madd9', 'minore nona aggiunta'], ['9', 'nona'], ['maj9', 'nona maggiore'], ['m9', 'minore nona'], ['7b9', 'settima e nona bemolle'], ['7#9', 'settima e nona diesis'], ['11', 'undicesima'], ['m11', 'minore undicesima'], ['7#11', 'settima e undicesima diesis'], ['maj7#11', 'settima maggiore e undicesima diesis'], ['13', 'tredicesima'], ['maj13', 'tredicesima maggiore'], ['m13', 'minore tredicesima']]],
  ];
  const TIPI_NOTI = new Set(TIPI.flatMap((g) => g[1].map((t) => t[0])));
  let pop = null;
  function accordiUsati() {
    const conta = new Map();
    S.modello.forEach((x) => x.t === 'riga' && x.acc.forEach((a) => conta.set(a.n, (conta.get(a.n) || 0) + 1)));
    return [...conta.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  }
  function notazioneBrano() {
    let ita = 0, eng = 0;
    S.modello.forEach((x) => x.t === 'riga' && x.acc.forEach((a) => {
      const m = a.n.match(RE_ACC);
      if (m) (/^(DO|RE|MI|FA|SOL|LA|SI)$/.test(m[1]) ? ita++ : eng++);
    }));
    return eng > ita ? 'eng' : 'ita';
  }
  function votoNota(radice, alt, lista) {
    const h = altezza(radice, alt);
    const bem = alt === 'b' || alt === '♭';
    const cand = lista.filter((n) => { const m = n.match(/^(DO|RE|MI|FA|SOL|LA|SI|[A-G])([#b]?)$/); return altezza(m[1], m[2]) === h; });
    return cand.find((n) => n.endsWith('b') === bem) || cand[0];
  }
  function scomponi(nome, lista) {
    const m = String(nome || '').replace(/♯/g, '#').replace(/♭/g, 'b').match(RE_ACC);
    if (!m) return null;
    return { nota: votoNota(m[1], m[2], lista), tipo: m[3], basso: m[4] ? votoNota(m[4], m[5], lista) : '' };
  }
  function chiudiPop() { if (pop) { pop.el.remove(); pop = null; } }
  function posizionaPop() {
    if (!pop) return;
    const rEl = elRiga(pop.x.id);
    if (!rEl) { chiudiPop(); return; }
    const ar = rEl.querySelector('.acc-riga').getBoundingClientRect();
    const visti = accVisti(pop.x);
    const col = pop.i != null && visti[pop.i] ? visti[pop.i].c : pop.c;
    const w = pop.el.offsetWidth;
    const h = pop.el.offsetHeight;
    let left = ar.left + col * chPx - 12;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = ar.top - h - 8;
    if (top < 60) top = ar.bottom + rEl.querySelector('.testo-riga').offsetHeight + 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
    pop.el.style.left = left + 'px';
    pop.el.style.top = top + 'px';
  }
  function apriAccordo(x, i, c) {
    chiudiPop();
    if (vista.modoAcc === 'mio' && !io) { chiediChi(); return; }
    const lista = notazioneBrano() === 'eng' ? NOTE_ENG : NOTE_ITA;
    const visti = accVisti(x);
    const valore = i == null ? '' : visti[i].n;
    const parti = scomponi(valore, lista);
    const libero = i != null && !parti; // es. «N.C.» o «x2»: si tiene com'è
    const tipoExtra = parti && !TIPI_NOTI.has(parti.tipo) ? parti.tipo : null;
    const sugg = accordiUsati().filter((n) => n !== valore).slice(0, 12);
    const perChi = vista.modoAcc === 'mio' && io ? `solo per ${esc(io)}` : 'per tutti';
    const el = document.createElement('div');
    el.className = 'pop';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', i == null ? 'Nuovo accordo' : 'Cambia accordo');
    el.innerHTML = `
      <p class="pop-per">${i == null ? 'Nuovo accordo' : 'Cambia accordo'} · <b>${perChi}</b></p>
      <div class="pop-scelte">
        <label>Nota<select data-campo-acc="nota" aria-label="Nota">
          ${i == null ? '<option value="" selected disabled>scegli…</option>' : ''}
          ${lista.map((n) => `<option value="${n}"${parti && parti.nota === n ? ' selected' : ''}>${n}</option>`).join('')}
        </select></label>
        <label>Tipo<select data-campo-acc="tipo" aria-label="Tipo di accordo"></select></label>
        <label>Basso<select data-campo-acc="basso" aria-label="Basso (rivolto)">
          <option value="">nessuno</option>
          ${lista.map((n) => `<option value="${n}"${parti && parti.basso === n ? ' selected' : ''}>/${n}</option>`).join('')}
        </select></label>
      </div>
      <div class="pop-anteprima" aria-live="polite"><span class="muto">Accordo:</span> <b data-anteprima></b></div>
      ${sugg.length ? `<div class="pop-sugg"><span class="muto">Già nel brano:</span> ${sugg.map((n) => `<button type="button" data-n="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
      <div class="pop-fila">
        ${i == null ? '' : '<button type="button" class="btn piccolo" data-az="sx" title="Sposta a sinistra (Alt+←)">◀</button><button type="button" class="btn piccolo" data-az="dx" title="Sposta a destra (Alt+→)">▶</button><button type="button" class="btn piccolo" data-az="togli">Togli</button>'}
        <button type="button" class="btn piccolo pieno" data-az="ok">${i == null ? 'Metti' : 'Fatto'}</button>
      </div>
      <details class="pop-libero"${libero ? ' open' : ''}><summary>oppure scrivilo tu</summary>
        <input type="text" value="${libero ? esc(valore) : ''}" placeholder="es. N.C. · x2 · (stop)" spellcheck="false" autocomplete="off" aria-label="Accordo scritto a mano">
      </details>
      <p class="pop-nota">Invio conferma · Esc esce${i == null ? '' : ' · Alt+← → lo sposta'}</p>`;
    document.body.appendChild(el);
    pop = { el, x, i, c, fonte: libero ? 'testo' : 'menu' };
    const selNota = el.querySelector('[data-campo-acc="nota"]');
    const selTipo = el.querySelector('[data-campo-acc="tipo"]');
    const selBasso = el.querySelector('[data-campo-acc="basso"]');
    const inp = el.querySelector('.pop-libero input');
    let tipoVoluto = parti ? parti.tipo : '';
    const riempiTipi = () => {
      const r = selNota.value || '…';
      if (selTipo.options.length) tipoVoluto = selTipo.value;
      selTipo.innerHTML = (tipoExtra != null ? `<option value="${esc(tipoExtra)}">${esc(r + tipoExtra)} · come scritto</option>` : '') +
        TIPI.map((g) => `<optgroup label="${g[0]}">${g[1].map((t) => `<option value="${esc(t[0])}">${esc(r + t[0])} · ${t[1]}</option>`).join('')}</optgroup>`).join('');
      selTipo.value = tipoVoluto;
      if (selTipo.selectedIndex < 0) selTipo.value = '';
    };
    const nome = () => {
      if (pop && pop.fonte === 'testo') return inp.value.trim().replace(/\s+/g, '');
      if (!selNota.value) return '';
      return selNota.value + selTipo.value + (selBasso.value ? '/' + selBasso.value : '');
    };
    const anteprima = () => { el.querySelector('[data-anteprima]').textContent = nome() || '—'; };
    pop.nome = nome;
    riempiTipi();
    anteprima();
    posizionaPop();
    const apriTendina = (s) => { s.focus(); try { s.showPicker(); } catch (e) { /* il browser lo apre al tocco */ } };
    selNota.addEventListener('change', () => {
      pop.fonte = 'menu'; riempiTipi(); anteprima();
      if (i == null) apriTendina(selTipo);
    });
    selTipo.addEventListener('change', () => { pop.fonte = 'menu'; anteprima(); });
    selBasso.addEventListener('change', () => { pop.fonte = 'menu'; anteprima(); });
    inp.addEventListener('input', () => { pop.fonte = inp.value.trim() ? 'testo' : 'menu'; anteprima(); });
    el.addEventListener('click', (e) => {
      const s = e.target.closest('[data-n]');
      if (s) { pop.fonte = 'testo'; inp.value = s.dataset.n; conferma(); return; }
      const b = e.target.closest('[data-az]');
      if (!b) return;
      if (b.dataset.az === 'ok') conferma();
      else if (b.dataset.az === 'togli') conferma(true);
      else sposta(b.dataset.az === 'sx' ? -1 : 1);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); chiudiPop(); }
      else if (e.key === 'Enter' && !e.target.closest('button')) { e.preventDefault(); conferma(); }
      else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && pop && pop.i != null) { e.preventDefault(); sposta(e.key === 'ArrowLeft' ? -1 : 1); }
    });
    const touch = matchMedia('(pointer: coarse)').matches;
    if (libero) inp.focus();
    else if (i == null && !touch) apriTendina(selNota);
    else if (!touch) selNota.focus();
  }
  function sposta(dir) {
    if (!pop || pop.i == null) return;
    const { x, i } = pop;
    primaDiCambiare('sposta:' + x.id + ':' + i);
    const acc = accDaCambiare(x);
    const prev = acc[i - 1];
    const next = acc[i + 1];
    const lo = prev ? prev.c + prev.n.length + 1 : 0;
    const hi = next ? next.c - acc[i].n.length - 1 : 400;
    const c = Math.min(hi, Math.max(lo, acc[i].c + dir));
    if (c === acc[i].c) return;
    acc[i].c = c;
    aggiornaAccordiRiga(x);
    cambiatoAccordi();
    posizionaPop();
  }
  function conferma(togli) {
    if (!pop) return;
    const { x, i, c } = pop;
    const v = togli ? '' : pop.nome();
    if (i == null && !v) { toast('Scegli prima la nota'); return; }
    const visti = accVisti(x);
    if (i != null && !togli && v === visti[i].n) { chiudiPop(); return; }
    chiudiPop();
    primaDiCambiare();
    const acc = accDaCambiare(x);
    let nuovo = null;
    if (i == null) { nuovo = { c, n: v }; acc.push(nuovo); }
    else if (!v) acc.splice(i, 1);
    else { acc[i].n = v; nuovo = acc[i]; }
    sistemaSovrapposizioni(acc);
    aggiornaAccordiRiga(x);
    cambiatoAccordi();
    if (nuovo) {
      const k = accVisti(x).indexOf(nuovo);
      const a = elRiga(x.id).querySelector(`.acc[data-i="${k}"]`);
      if (a) a.classList.add('nuovo');
    }
  }
  document.addEventListener('pointerdown', (e) => {
    if (pop && !pop.el.contains(e.target) && !e.target.closest('.acc')) chiudiPop();
    if (menu && !menu.contains(e.target) && !e.target.closest('.maniglia')) chiudiMenu();
  });
  window.addEventListener('resize', () => { misuraCh(); posizionaPop(); });
  document.querySelector('.foglio-scorri').addEventListener('scroll', posizionaPop);
  window.addEventListener('scroll', posizionaPop, { passive: true });

  // ---- scrivere nel testo ----
  function caret(el) {
    const s = getSelection();
    if (!s.rangeCount || !el.contains(s.anchorNode)) return 0;
    const r = s.getRangeAt(0);
    const pre = r.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(r.startContainer, r.startOffset);
    return pre.toString().length;
  }
  const selezioneVuota = () => { const s = getSelection(); return !s.rangeCount || s.getRangeAt(0).collapsed; };
  function metti(id, pos, campo = 'testo') {
    if (tocco() && rigaScelta !== id) { const v = rigaScelta; rigaScelta = id; if (v && elRiga(v)) rirendiRiga(v); rirendiRiga(id); }
    const el = elRiga(id);
    if (!el) return;
    const t = el.querySelector(`[data-campo="${campo}"]`);
    if (!t) return;
    t.focus();
    const s = getSelection();
    const r = document.createRange();
    const n = t.firstChild;
    if (n && n.nodeType === 3) r.setStart(n, Math.min(pos, n.length)); else r.setStart(t, 0);
    r.collapse(true);
    s.removeAllRanges();
    s.addRange(r);
  }
  function applicaTesto(x, nuovo) {
    const vecchio = x.testo;
    if (nuovo === vecchio) return false;
    let p = 0;
    while (p < vecchio.length && p < nuovo.length && vecchio[p] === nuovo[p]) p++;
    let s = 0;
    while (s < vecchio.length - p && s < nuovo.length - p && vecchio[vecchio.length - 1 - s] === nuovo[nuovo.length - 1 - s]) s++;
    const fineV = vecchio.length - s;
    const delta = nuovo.length - vecchio.length;
    perTuttiGliAccordi(x, (acc) => {
      acc.forEach((a) => { if (a.c >= fineV) a.c += delta; else if (a.c > p) a.c = p; });
      sistemaSovrapposizioni(acc);
    });
    x.testo = nuovo;
    return true;
  }
  // spezza (Invio) o riunisce (Canc all'inizio) anche gli accordi personali di ogni musicista
  function dividiPersonali(x, nuova, pos, allaFine) {
    Object.keys(S.personali).forEach((p) => {
      const r = S.personali[p] && S.personali[p][x.id];
      if (!r || !Array.isArray(r.acc)) return;
      persDaSalvare.add(p);
      if (!allaFine) {
        S.personali[p][nuova.id] = { acc: r.acc.filter((a) => a.c >= pos).map((a) => ({ c: a.c - pos, n: a.n })) };
        r.acc = r.acc.filter((a) => a.c < pos);
      }
    });
  }
  function unisciPersonali(sopra, sotto) {
    const L = sopra.testo.length;
    Object.keys(S.personali).forEach((p) => {
      const P = S.personali[p];
      if (!P || (!P[sopra.id] && !P[sotto.id])) return;
      persDaSalvare.add(p);
      const a = P[sopra.id] ? P[sopra.id].acc : clona(sopra.acc);
      const b = (P[sotto.id] ? P[sotto.id].acc : sotto.acc).map((k) => ({ c: k.c + L, n: k.n }));
      P[sopra.id] = { acc: a.concat(b) };
      sistemaSovrapposizioni(P[sopra.id].acc);
      delete P[sotto.id];
    });
  }
  foglio.addEventListener('input', (e) => {
    const t = e.target.closest('[data-campo]');
    if (!t) return;
    const voce = trova(t.closest('[data-id]').dataset.id);
    if (!voce) return;
    if (t.dataset.campo === 'sez') {
      primaDiCambiare('sez:' + voce.id);
      voce.testo = t.textContent.replace(/\s+/g, ' ').trim();
      cambiato();
      return;
    }
    const nuovo = t.textContent.replace(/ /g, ' ').replace(/\n/g, ' ');
    primaDiCambiare('testo:' + voce.id);
    if (applicaTesto(voce, nuovo)) {
      aggiornaAccordiRiga(voce);
      t.closest('.riga').classList.toggle('indicazione', /^\s*\(/.test(voce.testo));
      cambiato();
      if (persDaSalvare.size) cambiato(null, true);
    }
  });
  foglio.addEventListener('focusin', (e) => {
    const t = e.target.closest('[data-campo="testo"]');
    if (t) { rigaCorrente = t.closest('.riga').dataset.id; aggiornaCollega(); }
  });
  foglio.addEventListener('focusout', () => { setTimeout(controllaNovita, 300); });
  function prossimaRiga(i, dir) {
    for (let k = i + dir; k >= 0 && k < S.modello.length; k += dir) if (S.modello[k].t === 'riga') return S.modello[k];
    return null;
  }
  foglio.addEventListener('keydown', (e) => {
    const t = e.target.closest('[data-campo]');
    if (!t) return;
    const voce = trova(t.closest('[data-id]').dataset.id);
    if (t.dataset.campo === 'sez') {
      if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); t.blur(); }
      return;
    }
    const pos = caret(t);
    const i = indice(voce.id);
    if (e.key === 'Enter') {
      e.preventDefault();
      primaDiCambiare();
      const allaFine = pos >= voce.testo.length;
      const nuova = {
        id: nid(), t: 'riga', testo: voce.testo.slice(pos),
        acc: allaFine ? [] : voce.acc.filter((a) => a.c >= pos).map((a) => ({ c: a.c - pos, n: a.n })),
      };
      dividiPersonali(voce, nuova, pos, allaFine);
      if (!allaFine) voce.acc = voce.acc.filter((a) => a.c < pos);
      voce.testo = voce.testo.slice(0, pos);
      S.modello.splice(i + 1, 0, nuova);
      rendiFoglio(); cambiato(); if (persDaSalvare.size) cambiato(null, true); metti(nuova.id, 0);
    } else if (e.key === 'Backspace' && selezioneVuota() && pos === 0) {
      const prec = S.modello[i - 1];
      if (!prec) return;
      e.preventDefault();
      if (prec.t === 'riga') {
        primaDiCambiare();
        const L = prec.testo.length;
        unisciPersonali(prec, voce);
        prec.acc = prec.acc.concat(voce.acc.map((a) => ({ c: a.c + L, n: a.n })));
        sistemaSovrapposizioni(prec.acc);
        prec.testo += voce.testo;
        S.modello.splice(i, 1);
        rendiFoglio(); cambiato(); if (persDaSalvare.size) cambiato(null, true); metti(prec.id, L);
      } else if (prec.t === 'vuota') {
        primaDiCambiare();
        S.modello.splice(i - 1, 1);
        rendiFoglio(); cambiato(); metti(voce.id, 0);
      } else if (!voce.testo && !voce.acc.length) {
        primaDiCambiare();
        S.modello.splice(i, 1);
        rendiFoglio(); cambiato(); metti(prec.id, prec.testo.length, 'sez');
      }
    } else if (e.key === 'Delete' && selezioneVuota() && pos >= voce.testo.length) {
      const succ = S.modello[i + 1];
      if (!succ || succ.t === 'sez') return;
      e.preventDefault();
      primaDiCambiare();
      if (succ.t === 'riga') {
        const L = voce.testo.length;
        unisciPersonali(voce, succ);
        voce.acc = voce.acc.concat(succ.acc.map((a) => ({ c: a.c + L, n: a.n })));
        sistemaSovrapposizioni(voce.acc);
        voce.testo += succ.testo;
      }
      S.modello.splice(i + 1, 1);
      rendiFoglio(); cambiato(); if (persDaSalvare.size) cambiato(null, true); metti(voce.id, pos);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const r = prossimaRiga(i, e.key === 'ArrowUp' ? -1 : 1);
      if (r) { e.preventDefault(); metti(r.id, pos); }
    }
  });
  foglio.addEventListener('paste', (e) => {
    const t = e.target.closest('[data-campo]');
    if (!t) return;
    e.preventDefault();
    const txt = (e.clipboardData.getData('text/plain') || '').replace(/\r/g, '');
    if (t.dataset.campo === 'sez' || !txt.includes('\n')) { document.execCommand('insertText', false, txt.replace(/\n/g, ' ')); return; }
    const voce = trova(t.closest('[data-id]').dataset.id);
    const pos = caret(t);
    primaDiCambiare();
    const dopo = { id: nid(), t: 'riga', testo: voce.testo.slice(pos), acc: voce.acc.filter((a) => a.c >= pos).map((a) => ({ c: a.c - pos, n: a.n })) };
    voce.acc = voce.acc.filter((a) => a.c < pos);
    voce.testo = voce.testo.slice(0, pos);
    const nuove = daTesto(txt);
    const i = indice(voce.id);
    S.modello.splice(i + 1, 0, ...nuove, ...(dopo.testo || dopo.acc.length ? [dopo] : []));
    rendiFoglio(); cambiato();
    toast('Incollate ' + nuove.length + ' righe: gli accordi sulla riga sopra sono stati riconosciuti');
  });

  // ---- menu della riga ----
  let menu = null;
  function chiudiMenu() {
    if (!menu) return;
    const m = foglio.querySelector('.maniglia[aria-expanded="true"]');
    if (m) m.setAttribute('aria-expanded', 'false');
    menu.remove();
    menu = null;
  }
  function apriMenu(man) {
    chiudiMenu(); chiudiPop();
    const id = man.closest('[data-id]').dataset.id;
    const x = trova(id);
    const haMiei = x.t === 'riga' && !!mioDi(x);
    const voci = x.t === 'riga' ? [
      ['sotto', 'Riga nuova sotto'], ['sopra', 'Riga nuova sopra'], ['sez', 'Titolo di sezione sopra'], ['spazio', 'Spazio sopra'],
      ['duplica', 'Duplica la riga'], ...(x.acc.length ? [['senzaacc', 'Togli gli accordi della riga (per tutti)']] : []),
      ...(haMiei ? [['-'], ['miacome', 'Questa riga come per tutti (togli i miei accordi)']] : []),
      ['-'], ['appunto', 'Appunto su questa riga'], ['-'], ['elimina', 'Elimina la riga', 'pericolo'],
    ] : x.t === 'sez' ? [
      ['sotto', 'Riga nuova sotto'], ['spazio', 'Spazio sopra'], ['-'], ['elimina', 'Togli il titolo', 'pericolo'],
    ] : [
      ['qui', 'Riga nuova qui'], ['sezqui', 'Titolo di sezione qui'], ['-'], ['elimina', 'Togli lo spazio', 'pericolo'],
    ];
    menu = document.createElement('div');
    menu.className = 'menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = voci.map((v) => v[0] === '-' ? '<hr>' : `<button type="button" role="menuitem" data-az="${v[0]}" class="${v[2] || ''}">${v[1]}</button>`).join('');
    document.body.appendChild(menu);
    const r = man.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(r.bottom + 4, window.innerHeight - menu.offsetHeight - 8)) + 'px';
    man.setAttribute('aria-expanded', 'true');
    menu.querySelector('button').focus();
    menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { chiudiMenu(); man.focus(); } });
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-az]');
      if (!b) return;
      chiudiMenu();
      azioneRiga(x, b.dataset.az);
    });
  }
  function azioneRiga(x, az) {
    const i = indice(x.id);
    const riga = () => ({ id: nid(), t: 'riga', testo: '', acc: [] });
    if (az === 'appunto') { rigaCorrente = x.id; colRiga = true; aggiornaCollega(); $('appunto-testo').focus(); return; }
    primaDiCambiare();
    if (az === 'miacome') {
      delete S.personali[io][x.id];
      persDaSalvare.add(io);
      rirendiRiga(x.id); cambiato(null, true);
      toast('In questa riga vedi di nuovo gli accordi di tutti', annulla);
      return;
    }
    let fuoco = null;
    if (az === 'sotto') { const r = riga(); S.modello.splice(i + 1, 0, r); fuoco = r.id; }
    else if (az === 'sopra') { const r = riga(); S.modello.splice(i, 0, r); fuoco = r.id; }
    else if (az === 'qui') { const r = riga(); S.modello.splice(i, 1, r); fuoco = r.id; }
    else if (az === 'sez' || az === 'sezqui') {
      const s = { id: nid(), t: 'sez', testo: 'NUOVA SEZIONE' };
      S.modello.splice(i, az === 'sezqui' ? 1 : 0, s);
      rendiFoglio(); cambiato();
      const el = elRiga(s.id).querySelector('.sez-nome');
      el.focus(); getSelection().selectAllChildren(el);
      return;
    }
    else if (az === 'spazio') S.modello.splice(i, 0, { id: nid(), t: 'vuota' });
    else if (az === 'duplica') { const c = clona(x); c.id = nid(); S.modello.splice(i + 1, 0, c); fuoco = c.id; }
    else if (az === 'senzaacc') x.acc = [];
    else if (az === 'elimina') {
      S.modello.splice(i, 1);
      toast(x.t === 'riga' ? 'Riga eliminata' : 'Fatto', annulla);
    }
    rendiFoglio(); cambiato();
    if (fuoco) metti(fuoco, 0);
  }
  $('riga-fondo').addEventListener('click', () => {
    primaDiCambiare();
    const r = { id: nid(), t: 'riga', testo: '', acc: [] };
    S.modello.push(r);
    rendiFoglio(); cambiato(); metti(r.id, 0);
  });

  // ---------------- Per tutti / solo per me ----------------
  function rendiModoAcc() {
    document.querySelectorAll('[data-modo-acc]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modoAcc === vista.modoAcc)));
    const mio = $('modo-mio');
    if (mio) mio.textContent = io ? 'solo per ' + io : 'solo per me';
    const n = S && miei() ? Object.keys(miei()).length : 0;
    const box = $('miei-box');
    if (box) {
      box.hidden = !n;
      $('miei-conta').textContent = n === 1 ? 'Hai 1 riga con accordi tuoi' : `Hai ${n} righe con accordi tuoi`;
      $('miei-mostra').textContent = vista.mostraMiei ? 'Guarda come per tutti' : 'Guarda i miei';
    }
    const sp = $('spiega-modo');
    if (sp) sp.textContent = vista.modoAcc === 'mio'
      ? (io ? `Gli accordi che cambi adesso li vede solo ${io}. Gli altri continuano a vedere quelli di tutti.` : 'Scegli chi sei in alto.')
      : 'Gli accordi che cambi adesso li vedono tutti.';
  }
  document.querySelectorAll('[data-modo-acc]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.modoAcc === 'mio' && !io) { chiediChi(); return; }
    vista.modoAcc = b.dataset.modoAcc;
    if (vista.modoAcc === 'mio') vista.mostraMiei = true;
    mem.set('archivio.vista', vista);
    chiudiPop();
    rendiFoglio();
  }));
  if ($('miei-mostra')) $('miei-mostra').addEventListener('click', () => {
    vista.mostraMiei = !vista.mostraMiei;
    if (!vista.mostraMiei && vista.modoAcc === 'mio') vista.modoAcc = 'tutti';
    mem.set('archivio.vista', vista);
    rendiFoglio();
  });

  // ---------------- Vista: nomi degli accordi, tonalità, grandezza ----------------
  function rendiVista() {
    document.querySelectorAll('[data-sistema]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sistema === vista.sistema)));
    $('tono').textContent = (vista.semi > 0 ? '+' : '') + vista.semi;
    const cambiata = vistaCambiata();
    $('avviso-vista').hidden = !cambiata || modo === 'testo';
    if (cambiata) {
      const parti = [];
      if (vista.semi) parti.push('trasposti di ' + (vista.semi > 0 ? '+' : '') + vista.semi + ' mezzi toni');
      if (vista.sistema !== 'orig') parti.push(vista.sistema === 'ita' ? 'scritti DO RE MI' : 'scritti C D E');
      $('avviso-vista-testo').textContent = 'Stai guardando gli accordi ' + parti.join(' e ') + '. Così non si modificano, per non mescolare due versioni.';
    }
    $('aiuto-foglio').hidden = cambiata || modo === 'testo';
    mem.set('archivio.vista', vista);
  }
  function avvisaVista() { toast('Per scrivere gli accordi torna a «Come scritti» e tonalità 0, oppure salva in questa tonalità'); }
  document.querySelectorAll('[data-sistema]').forEach((b) => b.addEventListener('click', () => { vista.sistema = b.dataset.sistema; chiudiPop(); rendiVista(); rendiFoglio(); }));
  $('tono-su').addEventListener('click', () => { vista.semi = vista.semi >= 11 ? -11 : vista.semi + 1; chiudiPop(); rendiVista(); rendiFoglio(); });
  $('tono-giu').addEventListener('click', () => { vista.semi = vista.semi <= -11 ? 11 : vista.semi - 1; chiudiPop(); rendiVista(); rendiFoglio(); });
  $('font-su').addEventListener('click', () => { vista.fs = Math.min(30, vista.fs + 2); rendiVista(); rendiFoglio(); aggiornaTestoLibero(); });
  $('font-giu').addEventListener('click', () => { vista.fs = Math.max(11, vista.fs - 2); rendiVista(); rendiFoglio(); aggiornaTestoLibero(); });
  $('vista-reset').addEventListener('click', () => { vista.sistema = 'orig'; vista.semi = 0; rendiVista(); rendiFoglio(); });
  $('vista-applica').addEventListener('click', () => {
    primaDiCambiare();
    S.modello.forEach((x) => { if (x.t === 'riga') { x.acc.forEach((a) => { a.n = disp(a.n); }); sistemaSovrapposizioni(x.acc); } });
    vista.sistema = 'orig'; vista.semi = 0;
    rendiVista(); rendiFoglio(); cambiato('Accordi cambiati di tonalità');
    toast('Accordi salvati così, per tutti. Se ci ripensi: Annulla, oppure Versioni');
  });

  // ---------------- Testo libero ----------------
  let modo = 'foglio';
  let tLibero = null;
  function aggiornaTestoLibero() { $('testo-libero').style.fontSize = vista.fs + 'px'; }
  function impostaModo(m) {
    modo = m;
    chiudiPop(); chiudiMenu();
    $('modo-foglio').setAttribute('aria-pressed', String(m === 'foglio'));
    $('modo-testo').setAttribute('aria-pressed', String(m === 'testo'));
    const libero = m === 'testo';
    document.querySelector('.foglio-scorri').hidden = libero;
    $('testo-libero').hidden = !libero;
    $('vista-box').hidden = libero;
    $('modo-acc-box').hidden = libero;
    rendiVista();
    if (libero) { $('testo-libero').value = aTesto(S.modello); aggiornaTestoLibero(); $('testo-libero').focus(); }
    else rendiFoglio();
  }
  $('modo-foglio').addEventListener('click', () => impostaModo('foglio'));
  $('modo-testo').addEventListener('click', () => impostaModo('testo'));
  $('testo-libero').addEventListener('input', () => {
    clearTimeout(tLibero);
    tLibero = setTimeout(() => {
      primaDiCambiare('libero');
      S.modello = daTesto($('testo-libero').value, S.modello);
      cambiato();
    }, 400);
  });

  // ---------------- Versioni ----------------
  const dataBella = (iso) => {
    const d = new Date(String(iso).replace(' ', 'T'));
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  };
  function differenza(a, b) {
    const A = aTesto(a).split('\n');
    const B = aTesto(b).split('\n');
    const piu = B.filter((r) => r.trim() && !A.includes(r)).length;
    const meno = A.filter((r) => r.trim() && !B.includes(r)).length;
    return piu || meno ? `+${piu} −${meno} righe` : 'nessuna differenza nelle righe';
  }
  function rendiVersioni() {
    const v = S.versioni;
    if (!v.length) { $('versioni-elenco').innerHTML = '<li class="vuoto-msg">Nessuna versione ancora.</li>'; $('versioni-anteprima').textContent = ''; return; }
    $('versioni-elenco').innerHTML = v.map((x, k) => ({ x, k })).reverse().map(({ x, k }) => `
      <li class="versione" ${k === v.length - 1 ? 'aria-current="true"' : ''}>
        <b>${esc(x.chi)}</b><small>${esc(dataBella(x.quando))}${k > 0 ? ' · ' + differenza(v[k - 1].modello, x.modello) : ''}</small>
        ${x.nota ? `<small>${esc(x.nota)}</small>` : ''}
        <div class="pop-fila">
          <button type="button" class="btn piccolo" data-guarda="${k}">Guarda</button>
          <button type="button" class="btn piccolo" data-torna="${k}">Torna a questa</button>
        </div>
      </li>`).join('');
    $('versioni-anteprima').textContent = aTesto(v[v.length - 1].modello);
  }
  $('versioni-btn').addEventListener('click', async () => {
    if (!LOCALE) {
      await salvaRemotoSubito();
      try { await caricaBrano(brano.id, true); } catch (e) { toast('Non riesco a leggere le versioni: senza rete?'); }
    }
    rendiVersioni();
    $('versioni').showModal();
  });
  $('versioni-chiudi').addEventListener('click', () => $('versioni').close());
  $('versioni-elenco').addEventListener('click', (e) => {
    const g = e.target.closest('[data-guarda]');
    if (g) { $('versioni-anteprima').textContent = aTesto(S.versioni[+g.dataset.guarda].modello); return; }
    const t = e.target.closest('[data-torna]');
    if (!t) return;
    const v = S.versioni[+t.dataset.torna];
    primaDiCambiare();
    S.modello = clona(v.modello);
    const nota = 'Tornati alla versione di ' + v.chi + ' (' + dataBella(v.quando) + ')';
    if (LOCALE) { segnaVersioneLocale(nota); salvaLocale(); rendiVersioni(); }
    else { cambiato(nota); $('versioni').close(); }
    if (modo === 'testo') $('testo-libero').value = aTesto(S.modello); else rendiFoglio();
    rendiAppunti();
    toast('Tornati a quella versione. Quella di prima resta nell\'elenco');
  });

  $('copia').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(aTesto(S.modello)); toast('Testo e accordi copiati: si incollano in un Doc o in un messaggio'); }
    catch (e) { toast('Non riesco a copiare da qui'); }
  });
  $('annulla').addEventListener('click', annulla);
  $('rifai').addEventListener('click', rifai);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && rigaScelta && !pop && !menu) { const v = rigaScelta; rigaScelta = null; rirendiRiga(v); return; }
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    const campoProprio = e.target.closest && e.target.closest('#appunto-testo, #cerca, #testo-libero, .pop input, #campo-codice');
    if (campoProprio) return;
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); annulla(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); rifai(); }
  });

  // ---------------- Ascolto ----------------
  const audio = $('audio');
  let regAttiva = 0;
  const dataBreve = (d) => new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  const regs = () => (brano && brano.info && brano.info.registrazioni) || [];
  function rendiRegistrazioni() {
    const lista = regs();
    $('ascolta-sez').hidden = !lista.length;
    if (!lista.length) return;
    $('registrazioni').innerHTML = lista.map((r, i) => LOCALE ? `
      <li><button type="button" class="reg" data-reg="${i}" aria-pressed="${i === regAttiva}">
        <b>${esc(r.nome)}</b><small>registrata il ${dataBreve(r.data)} · ${fmtTempo(r.durata)}</small>
        <small class="reg-nota">${esc(r.nota || '')}</small></button></li>` : `
      <li><a class="reg" href="${esc(r.drive)}" target="_blank" rel="noopener">
        <b>${esc(r.nome)} <span class="muto">· ascolta nel Drive ↗</span></b><small>registrata il ${dataBreve(r.data)} · ${fmtTempo(r.durata)}</small>
        <small class="reg-nota">${esc(r.nota || '')}</small>
        ${(r.segnaposti || []).length > 1 ? `<small class="reg-segni">${r.segnaposti.filter((s) => s.t > 0).map((s) => esc(s.nome) + ' ' + fmtTempo(s.t)).join(' · ')}</small>` : ''}</a></li>`).join('');
    audio.hidden = !LOCALE;
    $('segnaposti').hidden = !LOCALE;
    const reg = lista[regAttiva] || lista[0];
    if (LOCALE) $('segnaposti').innerHTML = (reg.segnaposti || []).map((s) => `<button type="button" data-t="${s.t}">${esc(s.nome)} ${fmtTempo(s.t)}</button>`).join('');
    const conVoce = lista.find((r) => (r.trascrizione || []).length);
    const tr = LOCALE ? reg : conVoce;
    $('trascr').hidden = !tr;
    if (tr) {
      $('trascr-di').textContent = LOCALE ? '' : ' nel ' + tr.nome.split(' · ')[0];
      $('trascrizione').innerHTML = (tr.trascrizione || []).length
        ? tr.trascrizione.map((s) => LOCALE ? `<li><button type="button" data-t="${s.t}"><time>${fmtTempo(s.t)}</time><span>${esc(s.testo)}</span></button></li>`
          : `<li><span class="riga-tr"><time>${fmtTempo(s.t)}</time><span>${esc(s.testo)}</span></span></li>`).join('')
        : '<li class="vuoto-msg">Nessuna voce trovata in questa registrazione.</li>';
    }
  }
  function scegliReg(i) {
    if (!LOCALE) return;
    if (i !== regAttiva || !audio.src) { regAttiva = i; audio.src = regs()[i].file; }
    rendiRegistrazioni();
    rendiFoglio();
  }
  function ascoltaDa(t, reg) {
    if (!LOCALE) return;
    if (reg != null && reg !== regAttiva) scegliReg(reg);
    const vai = () => { audio.currentTime = t; audio.play().catch(() => {}); };
    if (audio.readyState >= 1) vai(); else audio.addEventListener('loadedmetadata', vai, { once: true });
  }
  $('registrazioni').addEventListener('click', (e) => { const b = e.target.closest('[data-reg]'); if (b) scegliReg(+b.dataset.reg); });
  $('segnaposti').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) ascoltaDa(+b.dataset.t); });
  $('trascrizione').addEventListener('click', (e) => { const b = e.target.closest('button[data-t]'); if (b) ascoltaDa(+b.dataset.t); });
  audio.addEventListener('error', () => { if (LOCALE && audio.src) toast('Questa registrazione non si apre: il server di prova è acceso?'); });

  // ---------------- Appunti ----------------
  let rigaCorrente = null;
  let colRiga = false;
  let colTempo = false;
  let tempoPreso = null;
  let tempoReg = null;
  let filtro = 'aperti';
  const sintesi = (x) => {
    if (!x) return '';
    const s = x.testo.trim() || lineaAccordi(x.acc).trim() || 'riga vuota';
    return s.length > 28 ? s.slice(0, 27) + '…' : s;
  };
  function aggiornaCollega() {
    if (!S) return;
    const r = rigaCorrente && trova(rigaCorrente);
    const cr = $('col-riga');
    cr.hidden = !r;
    if (r) { cr.textContent = (colRiga ? '✓ ' : '+ ') + 'sulla riga «' + sintesi(r) + '»'; cr.setAttribute('aria-pressed', String(colRiga)); }
    const ct = $('col-tempo');
    const t = colTempo ? tempoPreso : audio.currentTime;
    ct.hidden = !LOCALE || !(t > 0.5);
    if (!ct.hidden) {
      ct.textContent = (colTempo ? '✓ ' : '+ ') + 'al minuto ' + fmtTempo(t) + ' · ' + regs()[colTempo ? tempoReg : regAttiva].nome.split(' · ')[0];
      ct.setAttribute('aria-pressed', String(colTempo));
    }
  }
  $('col-riga').addEventListener('click', () => { colRiga = !colRiga; aggiornaCollega(); });
  $('col-tempo').addEventListener('click', () => {
    colTempo = !colTempo;
    tempoPreso = colTempo ? audio.currentTime : null;
    tempoReg = colTempo ? regAttiva : null;
    aggiornaCollega();
  });
  audio.addEventListener('timeupdate', () => { if (!colTempo) aggiornaCollega(); });
  function quandoFa(iso) {
    const d = new Date(iso);
    const min = Math.round((Date.now() - d) / 60000);
    if (min < 1) return 'adesso';
    if (min < 60) return min + ' min fa';
    return dataBella(iso);
  }
  function rendiAppunti() {
    if (!S) return;
    const lista = S.appunti.filter((a) => filtro === 'tutti' || !a.fatto);
    $('appunti').innerHTML = lista.length ? lista.map((a) => {
      const r = a.riga && trova(a.riga);
      const reg = a.reg != null ? regs()[a.reg] : null;
      return `<li class="appunto${a.fatto ? ' fatto' : ''}" data-p="${PERSONE.indexOf(a.chi)}" data-id="${esc(a.id)}">
        <div class="app-testa"><b>${esc(a.chi)}</b><span>${esc(quandoFa(a.quando))}</span></div>
        <p class="app-testo">${esc(a.testo)}</p>
        ${(a.riga || (reg && a.t != null)) ? `<div class="app-link">
          ${a.riga ? `<button type="button" data-vai-riga="${esc(a.riga)}">${r ? 'riga «' + esc(sintesi(r)) + '»' : 'riga tolta: «' + esc(a.rigaTesto || '') + '»'}</button>` : ''}
          ${reg && a.t != null ? `<button type="button" data-vai-t="${a.t}" data-vai-reg="${a.reg}">▶ ${fmtTempo(a.t)} · ${esc(reg.nome.split(' · ')[0])}</button>` : ''}
        </div>` : ''}
        <div class="app-azioni">
          <button type="button" data-fatto="${esc(a.id)}">${a.fatto ? 'Riapri' : 'Fatto'}</button>
          <button type="button" data-togli="${esc(a.id)}">Togli</button>
        </div></li>`;
    }).join('') : `<li class="vuoto-msg">${filtro === 'aperti' ? 'Nessun appunto da fare.' : 'Ancora nessun appunto.'} Tocca una riga del foglio e scrivi qui: l'appunto resta attaccato a quella riga.</li>`;
  }
  const codaAppunti = () => mem.get('archivio.coda-appunti', []);
  async function mandaAppunto(a) {
    if (LOCALE) { mem.set(chiaveLocale(), S); return; }
    try { await Api.appunto(brano.id, a); }
    catch (e) {
      const q = codaAppunti().filter((x) => x.id !== a.id);
      q.push(Object.assign({ brano: brano.id }, a));
      mem.set('archivio.coda-appunti', q);
      toast('Appunto tenuto su questo telefono: lo mando appena c\'è rete');
    }
  }
  async function svuotaCodaAppunti() {
    const q = codaAppunti();
    if (!q.length || LOCALE) return;
    const resto = [];
    for (const a of q) { try { await Api.appunto(a.brano, a); } catch (e) { resto.push(a); } }
    mem.set('archivio.coda-appunti', resto);
  }
  function aggiungiAppunto() {
    const testo = $('appunto-testo').value.trim();
    if (!testo) return;
    if (!io) { chiediChi(); return; }
    const r = colRiga && rigaCorrente ? trova(rigaCorrente) : null;
    const a = {
      id: nid(), chi: io, testo, quando: new Date().toISOString(),
      riga: r ? r.id : null, rigaTesto: r ? sintesi(r) : null,
      reg: colTempo ? tempoReg : null, t: colTempo ? Math.round(tempoPreso * 10) / 10 : null, fatto: false,
    };
    S.appunti.unshift(a);
    $('appunto-testo').value = '';
    colTempo = false; tempoPreso = null; colRiga = false;
    mandaAppunto(a);
    rendiAppunti(); aggiornaCollega();
    if (r) rirendiRiga(r.id);
  }
  $('nuovo-appunto').addEventListener('submit', (e) => { e.preventDefault(); aggiungiAppunto(); });
  $('appunto-testo').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); aggiungiAppunto(); } });
  document.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => {
    filtro = b.dataset.filtro;
    document.querySelectorAll('[data-filtro]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    rendiAppunti();
  }));
  $('appunti').addEventListener('click', (e) => {
    const vr = e.target.closest('[data-vai-riga]');
    if (vr) {
      const el = elRiga(vr.dataset.vaiRiga);
      if (!el) { toast('Quella riga non c\'è più'); return; }
      if (modo !== 'foglio') impostaModo('foglio');
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.remove('lampeggia'); void el.offsetWidth; el.classList.add('lampeggia');
      return;
    }
    const vt = e.target.closest('[data-vai-t]');
    if (vt) { ascoltaDa(+vt.dataset.vaiT, +vt.dataset.vaiReg); return; }
    const f = e.target.closest('[data-fatto]');
    if (f) {
      const a = S.appunti.find((x) => x.id === f.dataset.fatto);
      a.fatto = !a.fatto;
      mandaAppunto(a); rendiAppunti(); if (a.riga) rirendiRiga(a.riga);
      return;
    }
    const t = e.target.closest('[data-togli]');
    if (t) {
      const k = S.appunti.findIndex((x) => x.id === t.dataset.togli);
      const [via] = S.appunti.splice(k, 1);
      mandaAppunto(Object.assign({}, via, { tolto: true })); rendiAppunti(); if (via.riga) rirendiRiga(via.riga);
      toast('Appunto tolto', () => { S.appunti.splice(k, 0, via); mandaAppunto(Object.assign({}, via, { tolto: false })); rendiAppunti(); if (via.riga) rirendiRiga(via.riga); });
    }
  });
  function evidenziaAppunto(id) {
    const a = S.appunti.find((x) => x.id === id);
    if (a && a.fatto && filtro === 'aperti') filtro = 'tutti';
    rendiAppunti();
    const el = $('appunti').querySelector(`[data-id="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    el.classList.add('evidenziato');
    setTimeout(() => el.classList.remove('evidenziato'), 1800);
  }

  // ---------------- Avvisi in basso ----------------
  let tToast = null;
  function toast(msg, azione) {
    const t = $('toast');
    t.innerHTML = '';
    const s = document.createElement('span');
    s.textContent = msg;
    t.appendChild(s);
    if (azione) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Annulla';
      b.addEventListener('click', () => { t.hidden = true; azione(); });
      t.appendChild(b);
    }
    t.hidden = false;
    clearTimeout(tToast);
    tToast = setTimeout(() => { t.hidden = true; }, azione ? 7000 : 4200);
  }

  // ---------------- Caricamento e aggiornamenti dagli altri ----------------
  function normalizzaVersioni(v) { return (v || []).map((x) => ({ quando: x.quando, chi: x.chi, nota: x.nota, modello: x.foglio })); }
  let firmaAppunti = '';
  let firmaPersonali = '';
  async function caricaBrano(id, soloVersioni) {
    const r = await Api.leggi(id);
    if (soloVersioni) { S.versioni = normalizzaVersioni(r.versioni); return; }
    brano = { id: r.id, titolo: r.titolo, autore: r.autore, info: r.info || {} };
    S = {
      modello: r.foglio, versione: r.versione, versioni: normalizzaVersioni(r.versioni),
      appunti: r.appunti || [], personali: r.personali || {},
    };
  }
  async function apriBrano(id) {
    try {
      await caricaBrano(id);
    } catch (e) {
      if (e.message === 'codice_errato') { chiediCodice(); return; }
      $('stato-rete').textContent = 'Non riesco a caricare il brano: controlla la rete e ricarica la pagina.';
      return;
    }
    // modifiche rimaste su questo telefono (senza rete): si rimandano, e se nel frattempo è cambiato vanno nello storico
    const coda = mem.raw(chiaveCoda());
    if (coda) {
      try {
        const c = JSON.parse(coda);
        if (c && Array.isArray(c.foglio)) {
          const vers = S.versione;
          S.modello = c.foglio; S.versione = c.base; daSalvare = true; notaDaSalvare = c.nota || null;
          if (c.base !== vers) toast('C\'erano modifiche tue non salvate: le salvo (se intanto qualcuno ha cambiato, finiscono nelle Versioni)');
          salvaRemoto();
        }
      } catch (e) { mem.raw(chiaveCoda(), null); }
    }
    passato.length = 0; futuro.length = 0;
    mostraBrano();
    $('stato-rete').textContent = '';
    if (!io) chiediChi();
    try { const s = await Api.stato(brano.id); firmaAppunti = s.appunti; firmaPersonali = s.personali; } catch (e) { /* al prossimo giro */ }
  }
  function mostraBrano() {
    $('titolo').textContent = brano.titolo;
    $('autore').textContent = brano.autore ? 'di ' + brano.autore : '';
    document.title = brano.titolo + ' · Archivio · App Antifragile';
    rendiElenco();
    rendiVista();
    if (LOCALE && regs()[0]) audio.src = regs()[0].file;
    rendiRegistrazioni();
    rendiFoglio();
    rendiAppunti();
    aggiornaAnnulla();
    aggiornaCollega();
    statoSalvato(LOCALE ? 'Prova sul Mac: resta in questo browser' : (S.versione ? 'Aggiornato' : ''));
  }
  const staScrivendo = () => {
    const a = document.activeElement;
    return !!(a && (a.closest && (a.closest('#foglio [data-campo]') || a.closest('#testo-libero') || a.closest('.pop')))) || !!drag || !!pop;
  };
  let tNovita = null;
  async function controllaNovita() {
    if (LOCALE || !S || !brano || document.hidden) return;
    try {
      await svuotaCodaAppunti();
      const s = await Api.stato(brano.id);
      const nuovoFoglio = s.versione !== S.versione && !daSalvare && !inVolo;
      const nuoviAppunti = s.appunti !== firmaAppunti;
      const nuoviPers = s.personali !== firmaPersonali;
      if (!nuovoFoglio && !nuoviAppunti && !nuoviPers) return;
      if (nuovoFoglio && staScrivendo()) return;   // si aspetta che finisca di scrivere
      const r = await Api.leggi(brano.id);
      firmaAppunti = s.appunti; firmaPersonali = s.personali;
      if (nuoviAppunti) { S.appunti = r.appunti || []; rendiAppunti(); }
      if (nuoviPers) {
        const miePendenti = {};
        persDaSalvare.forEach((p) => { miePendenti[p] = S.personali[p]; });
        S.personali = Object.assign({}, r.personali || {}, miePendenti);
      }
      if (nuovoFoglio && !daSalvare && !inVolo) {
        S.modello = r.foglio; S.versione = r.versione; S.versioni = normalizzaVersioni(r.versioni);
        passato.length = 0; futuro.length = 0; aggiornaAnnulla();
        if (r.aggiornato_da && r.aggiornato_da !== io) toast(r.aggiornato_da + ' ha appena cambiato il brano');
        if (modo === 'testo') $('testo-libero').value = aTesto(S.modello);
      }
      if ((nuovoFoglio || nuoviPers || nuoviAppunti) && modo === 'foglio' && !staScrivendo()) {
        const y = window.scrollY;
        rendiFoglio();
        window.scrollTo(0, y);
      }
    } catch (e) {
      if (e.message === 'codice_errato') chiediCodice();
    }
  }
  async function salvaRemotoSubito() {
    if (LOCALE || !daSalvare) return;
    clearTimeout(tSalva);
    await salvaRemoto();
  }
  window.addEventListener('pagehide', () => { if (daSalvare) salvaRemoto(); });

  // ---------------- Codice della band ----------------
  function chiediCodice(errore) {
    codice = null;
    mem.raw('prove.codice', null);
    $('err-codice').hidden = !errore;
    if (errore) $('err-codice').textContent = errore;
    if (!$('dlg-codice').open) $('dlg-codice').showModal();
  }

  // ---- dall'icona sulla schermata Home dell'iPhone il link del gruppo non arriva: si incolla una volta ----
  const dallaHome = () => window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  if ($('spiega-codice') && dallaHome()) {
    $('spiega-codice').textContent = "Hai aperto l'app dall'icona: qui il link del gruppo non arriva da solo. Copia il link della band dal gruppo WhatsApp e tocca «Incolla il link». Basta una volta, poi lo ricorda.";
  }
  if ($('incolla-codice')) $('incolla-codice').addEventListener('click', async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (!t || !t.trim()) throw new Error('vuoto');
      $('campo-codice').value = t.trim();
      $('form-codice').requestSubmit();
    } catch (e) {
      $('campo-codice').focus();
      toast("Non riesco a leggere quello che hai copiato: tieni premuto nel campo qui sotto e scegli «Incolla».");
    }
  });
  $('form-codice').addEventListener('submit', async (e) => {
    e.preventDefault();
    const c = normalizzaCodice($('campo-codice').value);
    if (!c) return;
    codice = c;
    try {
      await entra();
      mem.raw('prove.codice', c);
      $('dlg-codice').close();
      if (!io) chiediChi();
    } catch (err) {
      chiediCodice(err.message === 'codice_errato' ? 'Questo codice non è giusto: copialo dal link della band.' : 'Non riesco a collegarmi: controlla la rete.');
    }
  });
  async function entra() {
    const r = await Api.elenco();
    elencoBrani = r.brani || [];
    if (!elencoBrani.length) { $('stato-rete').textContent = 'Nell\'archivio non c\'è ancora nessun brano.'; rendiElenco(); return; }
    const voluto = new URLSearchParams(location.search).get('brano');
    await apriBrano(elencoBrani.some((b) => b.id === voluto) ? voluto : elencoBrani[0].id);
  }

  // ---------------- Avvio ----------------
  if (window.innerWidth >= 760 || vistaCambiata()) $('vista-box').open = true;
  if (tocco()) $('aiuto-foglio').innerHTML = '<b>Tocca una riga</b> per sceglierla: si modifica solo quella, così scorrendo non sposti niente. Poi tocca sopra una parola per mettere un accordo, tocca un accordo per cambiarlo o <b>trascinalo</b>, tocca il testo per scrivere. <b>Due dita</b> per ingrandire.';
  rendiChi();
  if (LOCALE) {
    const D = window.ARCHIVIO_PROVA;
    const b0 = D.brani[0];
    brano = { id: b0.id, titolo: b0.titolo, autore: b0.autore, info: { registrazioni: b0.registrazioni } };
    elencoBrani = D.brani.map((b) => ({ id: b.id, titolo: b.titolo, autore: b.autore }));
    S = mem.get(chiaveLocale(), null);
    if (!S || !Array.isArray(S.modello)) {
      const base = daTesto(b0.foglio_drive);
      const conSez = daTesto(b0.foglio);
      S = {
        modello: clona(conSez), appunti: [], personali: {},
        versioni: [
          { quando: D.creato, chi: 'Checco · dal Drive', nota: 'Com\'era nel Drive, con gli accordi rimessi sopra la parola giusta', fissa: true, modello: base },
          { quando: D.creato, chi: 'Claude', nota: 'Aggiunti i nomi delle sezioni (Strofa, Ritornello…): sono una proposta', fissa: true, modello: conSez },
        ],
      };
      mem.set(chiaveLocale(), S);
    }
    if (!S.personali) S.personali = {};
    mostraBrano();
    if (!io) chiediChi();
  } else {
    const dalLink = normalizzaCodice(location.hash);
    if (dalLink) { mem.raw('prove.codice', dalLink); history.replaceState(null, '', location.pathname + location.search); }
    codice = normalizzaCodice(mem.raw('prove.codice')) || null;
    if (!codice) chiediCodice();
    else entra().catch((e) => {
      if (e.message === 'codice_errato') chiediCodice('Il codice salvato non vale più: incollalo dal link della band.');
      else $('stato-rete').textContent = 'Non riesco a collegarmi: controlla la rete e ricarica la pagina.';
    });
    setInterval(controllaNovita, 12000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) controllaNovita(); });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(misuraCh);
  window.__archivio = { S: () => S, aTesto, daTesto, traduci, brano: () => brano }; // per le prove
})();
