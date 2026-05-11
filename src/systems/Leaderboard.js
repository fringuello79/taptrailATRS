// src/systems/Leaderboard.js
// Client per la leaderboard online ATRS 2026.
//
// Pattern derivato da "Pepper Drop – Bocca di Fuoco":
//   - Backend è un Google Apps Script Web App (vedi docs/LEADERBOARD_SETUP.md).
//   - GET <URL>?action=top&board=<id>&n=20 → JSON array di entries.
//   - POST <URL> con body application/x-www-form-urlencoded → append a Google Sheet.
//     Usiamo URL-encoded (non JSON) per evitare il preflight CORS che gli
//     Apps Script Web Apps non gestiscono. Stesso trucco di Pepper Drop.
//
// Boards (id stringa che il client passa al backend):
//   - 'championship'      → classifica del campionato (score totale + tempo cumulato)
//   - <track-id>          → classifica della singola gara (es. 'voltigno-19k')
//
// Robustezza:
//   - Se LEADERBOARD_URL è vuoto, modalità OFFLINE: nessuna chiamata, isAvailable()=false.
//   - Submit asincrono con timeout: se la rete fallisce, si salva in coda di re-submit
//     (localStorage) e si ritenta al prossimo submit/fetch.
//   - Idempotenza: ogni submit ha un clientId stabile (player+board+timeSec+score
//     hash) che il backend usa per scartare duplicati se l'utente clicca due volte.
//   - fetchTop ha cache 30s per board (così aprire la classifica più volte non
//     martella il backend).

import {
  LEADERBOARD_URL,
  LEADERBOARD_TOP_N,
  LEADERBOARD_TIMEOUT_MS,
} from '../config.js';

const PENDING_KEY = 'taptrail.leaderboard.pending.v1';
const CACHE_PREFIX = 'taptrail.leaderboard.cache.v1.';
const CACHE_TTL_MS = 30 * 1000;

/** Hash stringa → int 32 bit (FNV-1a). Usata per clientId stabile. */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}

/** fetch con timeout. Lancia eccezione su timeout. */
async function fetchWithTimeout(url, opts = {}, ms = LEADERBOARD_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

/** Encoder URL-form da oggetto (gestisce undefined/null escludendoli). */
function urlEncode(obj) {
  const parts = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
  }
  return parts.join('&');
}

/** Carica/salva le entry pendenti (submit falliti). */
function loadPending() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
function savePending(arr) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(arr)); }
  catch (e) { /* ignore */ }
}

/** Cache GET per board. */
function readCache(board) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + board);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (Date.now() - obj.t > CACHE_TTL_MS) return null;
    return obj.data;
  } catch (e) { return null; }
}
function writeCache(board, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + board, JSON.stringify({
      t: Date.now(), data,
    }));
  } catch (e) { /* ignore */ }
}

export class Leaderboard {
  constructor() {
    this.url = (LEADERBOARD_URL || '').trim();
    this.lastError = null;
  }

  /** True se il backend è configurato (non significa raggiungibile). */
  isAvailable() {
    return this.url.length > 0;
  }

  /** Costruisce un clientId stabile per scartare doppi-submit lato server. */
  _clientIdFor(entry) {
    const sig = [
      entry.player || '',
      entry.board || '',
      Math.round((entry.timeSec || 0) * 100),
      Math.round(entry.score || 0),
      entry.eventId || '',
      entry.trackId || '',
    ].join('|');
    return 'tt2-' + fnv1a(sig);
  }

  /** Submit di un punteggio. Ritorna { ok, queued, message }.
   *  - ok=true: il backend ha confermato l'append.
   *  - queued=true: la rete ha fallito ma l'entry è in coda per riprovare.
   *  - ok=false, queued=false: backend non configurato (LEADERBOARD_URL vuoto).
   *
   *  entry: {
   *    player:   string  (obbligatorio)
   *    board:    string  (obbligatorio: 'championship' o trackId)
   *    mode:     'single' | 'championship'
   *    timeSec:  number   (tempo della gara o cumulato campionato)
   *    score:    number   (punteggio ATRS)
   *    eventId?: string
   *    trackId?: string
   *    distanceKm?: number
   *    gainM?:   number
   *    finalStamina?: number
   *    extras?:  object   (campi liberi: serializzati come JSON nel payload)
   *  } */
  async submitScore(entry) {
    if (!this.isAvailable()) {
      return { ok: false, queued: false,
               message: 'BACKEND NON CONFIGURATO' };
    }
    if (!entry.player || !entry.board) {
      return { ok: false, queued: false, message: 'PARAMETRI MANCANTI' };
    }

    const clientId = this._clientIdFor(entry);
    const payload = {
      action: 'submit',
      clientId,
      player: entry.player,
      board: entry.board,
      mode: entry.mode || 'single',
      timeSec: Math.round((entry.timeSec || 0) * 100) / 100,
      score: Math.round(entry.score || 0),
      eventId: entry.eventId || '',
      trackId: entry.trackId || '',
      distanceKm: entry.distanceKm || 0,
      gainM: entry.gainM || 0,
      finalStamina: entry.finalStamina || 0,
      date: new Date().toISOString(),
      extras: entry.extras ? JSON.stringify(entry.extras) : '',
    };

    // Provo a inviare. Se ho cose in coda, le invio prima di questa.
    await this._flushPending();

    try {
      const res = await fetchWithTimeout(this.url, {
        method: 'POST',
        // application/x-www-form-urlencoded → "simple request" CORS, niente preflight
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: urlEncode(payload),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!json || json.ok !== true) throw new Error(json?.error || 'risposta non valida');
      // invalidare cache GET di questo board: la prossima fetchTop riprende fresca
      try { localStorage.removeItem(CACHE_PREFIX + entry.board); } catch (e) {}
      this.lastError = null;
      return { ok: true, queued: false, message: 'INVIATO' };
    } catch (err) {
      // metto in coda
      const pending = loadPending();
      pending.push({ ...payload, _queuedAt: Date.now() });
      // limite ragionevole: max 50 entries in coda (cap per non far crescere senza fine)
      while (pending.length > 50) pending.shift();
      savePending(pending);
      this.lastError = err.message || String(err);
      return { ok: false, queued: true,
               message: 'OFFLINE - IN CODA (' + pending.length + ')' };
    }
  }

  /** Fetcha la top-N classifica per un board. Ritorna array (eventualmente []). */
  async fetchTop(board, n = LEADERBOARD_TOP_N) {
    if (!this.isAvailable()) return [];
    const cached = readCache(board);
    if (cached) return cached;
    try {
      const url = this.url
        + (this.url.includes('?') ? '&' : '?')
        + 'action=top&board=' + encodeURIComponent(board)
        + '&n=' + encodeURIComponent(n);
      const res = await fetchWithTimeout(url, { method: 'GET' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!Array.isArray(json)) throw new Error('formato non valido');
      writeCache(board, json);
      this.lastError = null;
      return json;
    } catch (err) {
      this.lastError = err.message || String(err);
      return [];   // graceful: nessun crash dell'UI
    }
  }

  /** Quante entries sono ancora in coda di submit (per UI). */
  pendingCount() {
    return loadPending().length;
  }

  /** Riprova a inviare le entries in coda. Si ferma alla prima che fallisce
   *  (probabile rete ancora down). Ritorna numero di entries effettivamente inviate. */
  async _flushPending() {
    if (!this.isAvailable()) return 0;
    const pending = loadPending();
    if (pending.length === 0) return 0;
    let sent = 0;
    while (pending.length > 0) {
      const item = pending[0];
      // tolgo i campi privati prima di inviare
      const { _queuedAt, ...payload } = item;
      try {
        const res = await fetchWithTimeout(this.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: urlEncode(payload),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        if (!json || json.ok !== true) throw new Error(json?.error || 'risposta non valida');
        pending.shift();
        sent += 1;
      } catch (err) {
        // rete ancora KO: salvo e mi fermo
        savePending(pending);
        return sent;
      }
    }
    savePending(pending);
    return sent;
  }
}

// Singleton: un solo client per tutta l'app (così la cache+coda è condivisa).
export const leaderboard = new Leaderboard();
