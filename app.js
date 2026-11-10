/* Prove: calendario della band. Nessuna libreria, nessuna richiesta a siti di terzi.
   Parla solo con il database (funzioni band_cal_* su Supabase) passando il codice della band. */
(() => {
  'use strict';

  const CFG = window.BAND_CONFIG || {};
  const PERSONE = ['Checco', 'Sofia', 'Franci', 'Dave', 'Mag'];
  const FORSE = CFG.forse !== false;
  const POLL_MS = 15000;
  const ORIZZONTE_GIORNI = 430;
  const MESI_AVANTI = 12;

  const STATI = {
    si:    { btn: 'Ci sono',   frase: "c'è" },
    forse: { btn: 'Se serve',  frase: "c'è se serve" },
    no:    { btn: 'Non posso', frase: "non c'è" },
  };
  // Icone: Lucide (licenza ISC). Riempite col colore della persona, contorno nel colore del testo.
  const TRACCE = {
    si: '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>',
    forse: '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    no: '<path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/>',
  };
  const icona = (s) => `<svg class="ico ico-${s}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${TRACCE[s]}</svg>`;
  const indice = (p) => PERSONE.indexOf(p);
  const STATI_USATI = FORSE ? ['si', 'forse', 'no'] : ['si', 'no'];

  // ---------- utilità ----------
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const chiave = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const daChiave = (s) => { const [y, m, g] = s.split('-').map(Number); return new Date(y, m - 1, g); };
  const primoDelMese = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
  const maiuscola = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const fmtLungo = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtBreve = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
  const fmtMese = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });
  const fmtOra = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });
  const elenco = (nomi) => nomi.length < 2 ? nomi.join('') : nomi.slice(0, -1).join(', ') + ' e ' + nomi[nomi.length - 1];

  function memoria(nome, valore) {
    try {
      if (valore === undefined) return localStorage.getItem(nome);
      if (valore === null) localStorage.removeItem(nome); else localStorage.setItem(nome, valore);
    } catch (e) { /* memoria del browser bloccata: si va avanti senza ricordare */ }
    return null;
  }
  const normalizzaCodice = (t) => {
    const m = String(t || '').match(/[#&?]c=([A-Za-z0-9]+)/);
    return (m ? m[1] : String(t || '')).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  };

  // ---------- database ----------
  const Api = {
    async rpc(nome, corpo) {
      if (!CFG.url || !CFG.key) throw new Error('config_mancante');
      const intestazioni = { 'Content-Type': 'application/json', apikey: CFG.key };
      if (CFG.key.startsWith('eyJ')) intestazioni.Authorization = 'Bearer ' + CFG.key;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      try {
        const r = await fetch(`${CFG.url}/rest/v1/rpc/${nome}`, {
          method: 'POST', headers: intestazioni, body: JSON.stringify(corpo), signal: ctrl.signal,
        });
        const testo = await r.text();
        let json = null;
        try { json = testo ? JSON.parse(testo) : null; } catch (e) { /* non è JSON */ }
        if (!r.ok) {
          const e = new Error((json && json.message) || 'http_' + r.status);
          e.status = r.status;
          throw e;
        }
        return json;
      } catch (e) {
        if (e.name === 'AbortError') throw new Error('timeout');
        throw e;
      } finally {
        clearTimeout(timer);
      }
    },
    leggi: (codice, dal, al) => Api.rpc('band_cal_leggi', { p_codice: codice, p_dal: dal, p_al: al }),
    imposta: (codice, persona, giorno, stato) =>
      Api.rpc('band_cal_imposta', { p_codice: codice, p_persona: persona, p_giorno: giorno, p_stato: stato }),
  };

  // ---------- stato ----------
  const oggi0 = new Date();
  const S = {
    mese: primoDelMese(oggi0),
    dati: {},             // { 'AAAA-MM-GG': { Checco: 'si', ... } }
    io: PERSONE.includes(memoria('prove.io')) ? memoria('prove.io') : null,
    codice: null,
    sel: null,
    modo: 'guarda',
    pennello: 'si',
    pending: 0,
    ultimoAgg: null,
    errore: null,
  };

  const risposta = (g, p) => (S.dati[g] && S.dati[g][p]) || null;

  function riassunto(g) {
    const r = { si: [], forse: [], no: [], nd: [] };
    PERSONE.forEach((p) => r[risposta(g, p) || 'nd'].push(p));
    return r;
  }

  function applica(g, persona, stato) {
    if (stato) { (S.dati[g] ||= {})[persona] = stato; return; }
    if (S.dati[g]) { delete S.dati[g][persona]; if (!Object.keys(S.dati[g]).length) delete S.dati[g]; }
  }

  // ---------- scrittura e lettura ----------
  async function imposta(g, nuovo) {
    if (!S.io || !S.codice) return;
    const prima = risposta(g, S.io);
    if (prima === nuovo) return;
    applica(g, S.io, nuovo);            // subito a schermo: il database si allinea dopo
    S.pending++;
    render();
    try {
      await Api.imposta(S.codice, S.io, g, nuovo);
    } catch (e) {
      applica(g, S.io, prima);
      avviso(erroreComprensibile(e, 'Non sono riuscito a salvare. Riprova.'));
      if (e.message === 'codice_errato') chiediCodice();
    } finally {
      S.pending--;
      render();
      if (S.pending === 0) sincronizza();
    }
  }

  function erroreComprensibile(e, predefinito) {
    if (e.message === 'giorno_fuori_intervallo') return 'Questo giorno è troppo lontano o già passato.';
    if (e.message === 'codice_errato') return 'Il codice della band non è più valido.';
    return predefinito;
  }

  async function sincronizza() {
    if (S.pending > 0 || !S.codice) return;
    const dal = chiave(primoDelMese(new Date()));
    const al = chiave(new Date(Date.now() + ORIZZONTE_GIORNI * 86400000));
    try {
      const righe = await Api.leggi(S.codice, dal, al);
      if (S.pending > 0) return;        // nel frattempo è partita una scrittura: vale quella
      const nuovo = {};
      for (const r of righe || []) (nuovo[r.giorno] ||= {})[r.persona] = r.stato;
      S.dati = nuovo;
      S.errore = null;
      S.ultimoAgg = new Date();
    } catch (e) {
      S.errore = e.message === 'codice_errato' ? 'codice' : 'rete';
      if (e.message === 'codice_errato') { S.codice = null; memoria('prove.codice', null); chiediCodice(); }
    }
    render();
  }

  // ---------- disegno ----------
  // «Ciao, chi sei?» si chiede una volta, all'inizio; poi in alto a destra resta solo il nome con «Cambia».
  function renderChi() {
    if ($('io-nome')) {
      $('io-nome').innerHTML = S.io ? `<span class="pallino" data-p="${indice(S.io)}"></span><span class="ciao">Ciao </span>${S.io}` : 'Chi sei?';
      $('cambia-io').textContent = S.io ? 'Cambia' : 'Scegli';
    }
    $('chi').innerHTML = PERSONE.map((p, i) => `
      <button type="button" class="persona-btn" role="radio" aria-checked="${S.io === p}" data-persona="${p}" data-p="${i}">
        <span class="pallino" data-p="${i}"></span>${p}
      </button>`).join('');
  }

  function renderMese() {
    const oggi = new Date();
    const prima = primoDelMese(oggi);
    const ultima = new Date(prima.getFullYear(), prima.getMonth() + MESI_AVANTI, 1);
    $('mese-titolo').textContent = maiuscola(fmtMese.format(S.mese));
    $('prec').disabled = S.mese <= prima;
    $('succ').disabled = S.mese >= ultima;
  }

  function pipsHtml(g) {
    return PERSONE.map((p, i) => `<i class="pip s-${risposta(g, p) || 'nd'}" data-p="${i}"></i>`).join('');
  }

  function etichettaGiorno(g) {
    const r = riassunto(g);
    const parti = [];
    if (r.si.length) parti.push(`${elenco(r.si)}: ci sono`);
    if (r.forse.length) parti.push(`${elenco(r.forse)}: se serve`);
    if (r.no.length) parti.push(`${elenco(r.no)}: non ci sono`);
    if (r.nd.length === PERSONE.length) parti.push('nessuna risposta');
    return `${fmtLungo.format(daChiave(g))}. ${parti.join('. ')}`;
  }

  function renderGriglia() {
    const f = document.activeElement;
    const eraFocus = f && f.dataset && f.dataset.g && $('griglia').contains(f) ? f.dataset.g : null;
    const oggiK = chiave(new Date());
    const primo = S.mese;
    const giorni = new Date(primo.getFullYear(), primo.getMonth() + 1, 0).getDate();
    const offset = (primo.getDay() + 6) % 7;                  // lunedì = 0
    let html = '<span class="vuoto"></span>'.repeat(offset);
    for (let n = 1; n <= giorni; n++) {
      const d = new Date(primo.getFullYear(), primo.getMonth(), n);
      const g = chiave(d);
      const r = riassunto(g);
      const passato = g < oggiK;
      const cl = ['giorno'];
      if (d.getDay() === 0 || d.getDay() === 6) cl.push('we');
      if (g === oggiK) cl.push('oggi');
      if (passato) cl.push('passato');
      if (g === S.sel && S.modo === 'guarda') cl.push('sel');
      if (r.si.length === PERSONE.length) cl.push('tutti');
      else if (!r.no.length && !r.nd.length) cl.push('fattibile');
      const mio = S.io ? risposta(g, S.io) : null;
      html += `<button type="button" class="${cl.join(' ')}" data-g="${g}" ${passato ? 'disabled' : ''}
        aria-label="${etichettaGiorno(g)}">
        <span class="num">${n}</span>${mio ? `<span class="mio" data-p="${indice(S.io)}" aria-hidden="true">${icona(mio)}</span>` : ''}
        <span class="pips" aria-hidden="true">${pipsHtml(g)}</span></button>`;
    }
    $('griglia').innerHTML = html;
    if (eraFocus) { const b = $('griglia').querySelector(`[data-g="${eraFocus}"]`); if (b) b.focus(); }
  }

  function descrizioneMancanti(r) {
    const parti = [];
    if (r.no.length) parti.push(`${elenco(r.no)} ${r.no.length > 1 ? 'non possono' : 'non può'}`);
    if (r.forse.length) parti.push(`${elenco(r.forse)} solo se serve`);
    if (r.nd.length) parti.push(`${elenco(r.nd)} ${r.nd.length > 1 ? 'non hanno risposto' : 'non ha risposto'}`);
    return parti.join('; ');
  }

  function renderMigliori() {
    const oggiK = chiave(new Date());
    const fine = chiave(new Date(Date.now() + 150 * 86400000));
    const candidati = Object.keys(S.dati).filter((g) => g >= oggiK && g <= fine).map((g) => {
      const r = riassunto(g);
      return { g, r, vengono: r.si.length + r.forse.length };
    }).filter((x) => x.vengono >= 3);
    candidati.sort((a, b) => b.vengono - a.vengono || b.r.si.length - a.r.si.length || (a.g < b.g ? -1 : 1));
    const top = candidati.slice(0, 5);
    $('migliori').innerHTML = top.length ? top.map(({ g, r }) => {
      const tutti = r.si.length === PERSONE.length;
      const attesi = r.si.length + r.forse.length;
      const titolo = tutti ? 'Ci siete tutti e cinque' : `${attesi} su ${PERSONE.length}`;
      const resto = tutti ? 'Giorno perfetto per le prove.' : descrizioneMancanti(r);
      return `<li><button type="button" class="migliore ${tutti ? 'tutti' : ''}" data-vai="${g}">
        <span class="quando">${fmtBreve.format(daChiave(g))}</span>
        <span class="quanti">${titolo}</span><span class="manca">${resto}</span></button></li>`;
    }).join('') : '<li class="vuoto-msg">Ancora nessun giorno con almeno tre di voi. Segna i tuoi giorni e compariranno qui.</li>';
  }

  function chipsHtml(g) {
    return PERSONE.map((p, i) => {
      const s = risposta(g, p);
      const testo = s ? STATI[s].frase : 'non ha risposto';
      return `<li class="chip st-${s || 'nd'}" data-p="${i}"><span class="pallino" data-p="${i}"></span>${p}
        ${s ? icona(s) : ''}<span class="visually-hidden">: ${testo}</span></li>`;
    }).join('');
  }

  function sintesi(g) {
    const r = riassunto(g);
    if (r.si.length === PERSONE.length) return 'Ci siete tutti e cinque.';
    if (r.nd.length === PERSONE.length) return 'Nessuno ha ancora risposto.';
    const parti = [`${r.si.length} su ${PERSONE.length} ci sono`];
    if (FORSE && r.forse.length) parti.push(`${r.forse.length} se serve`);
    if (r.no.length) parti.push(`${r.no.length} non ${r.no.length > 1 ? 'possono' : 'può'}`);
    return parti.join(', ') + '.';
  }

  function sceltaIdentitaHtml() {
    return `<p class="dock-nota">Chi sei? Tocca il tuo nome.</p><div class="dock-chi">${PERSONE.map((p, i) => `
      <button type="button" class="persona-btn" data-k="chi:${p}" data-azione="chi" data-id="${p}" data-p="${i}">
        <span class="pallino" data-p="${i}"></span>${p}</button>`).join('')}</div>`;
  }

  function bottoniStato(attivo, azione) {
    return `<div class="azioni ${FORSE ? '' : 'due'}" data-p="${indice(S.io)}">${STATI_USATI.map((s) => `
      <button type="button" class="azione" data-k="${azione}:${s}" data-azione="${azione}" data-stato="${s}" aria-pressed="${attivo === s}">
        ${icona(s)}${STATI[s].btn}</button>`).join('')}</div>`;
  }

  function renderDock() {
    const dock = $('dock');
    const f = document.activeElement;
    const eraFocus = f && f.dataset && f.dataset.k && dock.contains(f) ? f.dataset.k : null;
    let html;
    if (S.modo === 'segna') {
      dock.dataset.stato = 'segna';
      html = `<div class="dock-testa"><strong class="dock-data">Segna i giorni</strong></div>`;
      if (!S.io) html += sceltaIdentitaHtml();
      else html += `<p class="dock-sintesi">Come ${S.io}, tocca i giorni nel calendario. Tocca di nuovo un giorno per toglierlo.</p>`
        + bottoniStato(S.pennello, 'pennello')
        + `<button type="button" class="fatto" data-k="fatto" data-azione="fatto">Fatto</button>`;
    } else if (S.sel) {
      dock.dataset.stato = 'giorno';
      const g = S.sel;
      html = `<div class="dock-testa"><strong class="dock-data">${maiuscola(fmtLungo.format(daChiave(g)))}</strong>
        <button type="button" class="dock-chiudi" data-k="chiudi" data-azione="chiudi" aria-label="Chiudi">×</button></div>
        <p class="dock-sintesi" aria-live="polite">${sintesi(g)}</p>
        <ul class="dock-persone">${chipsHtml(g)}</ul>`;
      html += S.io ? bottoniStato(risposta(g, S.io), 'imposta') : sceltaIdentitaHtml();
    } else {
      dock.dataset.stato = 'vuoto';
      html = `<p class="dock-vuoto">Tocca un giorno per vedere chi c'è.</p>`;
    }
    dock.innerHTML = html;
    if (eraFocus) { const b = dock.querySelector(`[data-k="${eraFocus}"]`); if (b) b.focus(); }
    const alt = dock.dataset.stato === 'vuoto' || getComputedStyle(dock).position !== 'fixed' ? 0 : dock.offsetHeight;
    document.documentElement.style.setProperty('--dock-h', alt + 'px');
  }

  function renderPiede() {
    const el = $('stato-rete');
    el.classList.toggle('problema', !!S.errore);
    if (!CFG.url) el.textContent = 'La pagina non è ancora collegata al database.';
    else if (S.errore === 'rete') el.textContent = 'Non riesco a collegarmi: quello che vedi potrebbe non essere aggiornato.';
    else if (S.errore === 'codice') el.textContent = 'Serve il link della band.';
    else if (S.ultimoAgg) el.textContent = `Aggiornato alle ${fmtOra.format(S.ultimoAgg)}.`;
    else el.textContent = 'Carico…';
  }

  function render() {
    renderChi();
    renderMese();
    renderGriglia();
    renderMigliori();
    renderDock();
    renderPiede();
    document.querySelectorAll('.modo button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modo === S.modo)));
  }

  // ---------- avvisi e finestre ----------
  let timerAvviso = null;
  function avviso(testo) {
    const t = $('toast');
    t.textContent = testo;
    t.hidden = false;
    clearTimeout(timerAvviso);
    timerAvviso = setTimeout(() => { t.hidden = true; }, 3500);
  }

  function chiediCodice(errore) {
    const dlg = $('dlg-codice');
    $('errore-codice').hidden = !errore;
    $('errore-codice').textContent = errore || '';
    if (!dlg.open) dlg.showModal();
    $('campo-codice').focus();
  }

  function linkInvito() {
    return `${location.origin}${location.pathname}#c=${S.codice}`;
  }

  // ---------- eventi ----------
  function onGiorno(g) {
    if (S.modo === 'segna') {
      if (!S.io) { chiediChi(); return; }
      imposta(g, risposta(g, S.io) === S.pennello ? null : S.pennello);
      return;
    }
    S.sel = S.sel === g ? null : g;
    render();
  }

  $('griglia').addEventListener('click', (e) => {
    const b = e.target.closest('[data-g]');
    if (b && !b.disabled) onGiorno(b.dataset.g);
  });

  function chiediChi() {
    const d = $('dlg-chi');
    if (d && !d.open && !$('dlg-codice').open) { renderChi(); d.showModal(); }
  }
  if ($('cambia-io')) $('cambia-io').addEventListener('click', chiediChi);
  $('chi').addEventListener('click', (e) => {
    const b = e.target.closest('[data-persona]');
    if (!b) return;
    S.io = b.dataset.persona;
    memoria('prove.io', S.io);
    if ($('dlg-chi') && $('dlg-chi').open) $('dlg-chi').close();
    render();
  });

  $('dock').addEventListener('click', (e) => {
    const b = e.target.closest('[data-azione]');
    if (!b) return;
    const a = b.dataset.azione;
    if (a === 'chi') { S.io = b.dataset.id; memoria('prove.io', S.io); render(); }
    else if (a === 'imposta') { const nuovo = b.dataset.stato; imposta(S.sel, risposta(S.sel, S.io) === nuovo ? null : nuovo); }
    else if (a === 'pennello') { S.pennello = b.dataset.stato; render(); }
    else if (a === 'fatto') { S.modo = 'guarda'; render(); }
    else if (a === 'chiudi') { S.sel = null; render(); }
  });

  document.querySelector('.modo').addEventListener('click', (e) => {
    const b = e.target.closest('[data-modo]');
    if (!b) return;
    S.modo = b.dataset.modo;
    render();
  });

  $('migliori').addEventListener('click', (e) => {
    const b = e.target.closest('[data-vai]');
    if (!b) return;
    const d = daChiave(b.dataset.vai);
    S.mese = primoDelMese(d);
    S.sel = b.dataset.vai;
    S.modo = 'guarda';
    render();
    const cella = $('griglia').querySelector(`[data-g="${b.dataset.vai}"]`);
    if (cella) cella.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  $('prec').addEventListener('click', () => { S.mese = new Date(S.mese.getFullYear(), S.mese.getMonth() - 1, 1); render(); });
  $('succ').addEventListener('click', () => { S.mese = new Date(S.mese.getFullYear(), S.mese.getMonth() + 1, 1); render(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.querySelector('dialog[open]') && S.sel) { S.sel = null; render(); }
  });

  $('info-btn').addEventListener('click', () => $('dlg-info').showModal());
  $('info-chiudi').addEventListener('click', () => $('dlg-info').close());
  $('link-chiudi').addEventListener('click', () => $('dlg-link').close());

  $('invito-btn').addEventListener('click', async () => {
    if (!S.codice) { chiediCodice(); return; }
    const link = linkInvito();
    try {
      await navigator.clipboard.writeText(link);
      avviso('Link copiato. Mandalo a chi deve entrare.');
    } catch (e) {
      $('campo-link').value = link;
      $('dlg-link').showModal();
      $('campo-link').select();
    }
  });


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
      avviso("Non riesco a leggere quello che hai copiato: tieni premuto nel campo qui sotto e scegli «Incolla».");
    }
  });
  $('form-codice').addEventListener('submit', async (e) => {
    e.preventDefault();
    const codice = normalizzaCodice($('campo-codice').value);
    if (!codice) { chiediCodice('Incolla il codice che ti hanno mandato.'); return; }
    try {
      await Api.leggi(codice, chiave(primoDelMese(new Date())), chiave(new Date()));
    } catch (err) {
      chiediCodice(err.message === 'codice_errato'
        ? 'Il codice non è giusto. Controlla di averlo copiato tutto.'
        : 'Non riesco a collegarmi. Riprova tra un attimo.');
      return;
    }
    S.codice = codice;
    memoria('prove.codice', codice);
    $('campo-codice').value = '';
    $('dlg-codice').close();
    sincronizza();
    if (!S.io) chiediChi();
  });
  $('dlg-codice').addEventListener('cancel', (e) => { if (!S.codice) e.preventDefault(); });

  document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizza(); });
  setInterval(() => { if (!document.hidden) sincronizza(); }, POLL_MS);

  // ---------- avvio ----------
  if (!FORSE) document.querySelector('.legenda').classList.add('sx-nascosto');
  const dalLink = normalizzaCodice(location.hash);
  if (dalLink) {
    S.codice = dalLink;
    memoria('prove.codice', dalLink);
    history.replaceState(null, '', location.pathname + location.search);   // il codice non resta nella barra
  } else {
    S.codice = normalizzaCodice(memoria('prove.codice')) || null;
  }
  render();
  if (S.codice) { sincronizza(); if (!S.io) chiediChi(); } else chiediCodice();
})();
