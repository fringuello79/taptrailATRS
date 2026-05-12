// src/systems/Leaderboard.js
// Client per la leaderboard online ATRS 2026.
//
// Il backend (Google Apps Script) calcola i punti server-side secondo regolamento:
//   - action=top         → classifica posizionale ATRS (one-per-player + punti + UTMB)
//   - action=times       → classifica tempi assoluti (multi-entry per atleta)
//   - action=championship → classifica generale (somma punti + bonus 5/6, 6/6)
//
// Submit:
//   - POST body URL-encoded (no preflight CORS, gestito da Apps Script)
//   - inviamo SOLO il tempo (timeSec con decimali), niente score: il server lo calcola
//   - clientId stabile per anti-duplicato (se l'utente clicca due volte)
//
// Robustezza:
//   - Se LEADERBOARD_URL è vuoto, modalità OFFLINE: isAvailable()=false.
//   - Submit in coda (localStorage) se rete fallisce, riprova al prossimo fetch/submit.
//   - Cache GET 30s per ridurre carico.

import {
  LEADERBOARD_URL,
  LEADERBOARD_TOP_N,
  LEADERBOARD_TIMEOUT_MS,
} from '../config.js';

const PENDING_KEY = 'taptrail.leaderboard.pending.v2';
const CACHE_PREFIX = 'taptrail.leaderboard.cache.v2.';
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

async function fetchWithTimeout(url, opts = {}, ms = LEADERBOARD_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

function urlEncode(obj) {
  const parts = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
  }
  return parts.join('&');
}

function loadPending() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
function savePending(arr) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(arr)); }
  catch (e) {}
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (Date.now() - obj.t > CACHE_TTL_MS) return null;
    return obj.data;
  } catch (e) { return null; }
}
function writeCache(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
      t: Date.now(), data,
    }));
  } catch (e) {}
}
function invalidateAllCache() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
    }
  } catch (e) {}
}

export class Leaderboard {
  constructor() {
    this.url = (LEADERBOARD_URL || '').trim();
    this.lastError = null;
  }

  isAvailable() {
    return this.url.length > 0;
  }

  /** ClientId stabile per anti-duplicato (stessa partita = stessa entry). */
  _clientIdFor(entry) {
    const sig = [
      entry.player || '',
      entry.trackId || '',
      Math.round((entry.timeSec || 0) * 1000),   // 3 decimali
      entry.gender || '',
      Date.now() % 100000,   // permette ri-submit DOPO un po' di tempo
    ].join('|');
    return 'tt2-' + fnv1a(sig);
  }

  /** Submit di un risultato gara.
   *  entry: {
   *    player: string,
   *    gender: 'M' | 'F',
   *    trackId: string,
   *    timeSec: number   (tempo della gara con decimali, 3 cifre dopo la virgola)
   *    distanceKm: number,
   *    completed: boolean
   *    mode: 'single' | 'championship'
   *  }
   *  Ritorna { ok, queued, message, duplicate? } */
  async submitScore(entry) {
    if (!this.isAvailable()) {
      return { ok: false, queued: false,
               message: 'BACKEND NON CONFIGURATO' };
    }
    if (!entry.player || !entry.trackId) {
      return { ok: false, queued: false, message: 'PARAMETRI MANCANTI' };
    }

    const clientId = this._clientIdFor(entry);
    const payload = {
      clientId,
      player: entry.player,
      gender: entry.gender || '',
      trackId: entry.trackId,
      // 3 decimali (millisecondi visibili). Il server accetta float.
      timeSec: Math.round((entry.timeSec || 0) * 1000) / 1000,
      distanceKm: entry.distanceKm || 0,
      completed: entry.completed ? 'true' : 'false',
      mode: entry.mode || 'single',
    };

    await this._flushPending();

    try {
      const res = await fetchWithTimeout(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: urlEncode(payload),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!json || (json.ok !== true && !json.duplicate)) {
        throw new Error(json?.error || 'risposta non valida');
      }
      // invalida cache: la prossima fetch sarà fresca
      invalidateAllCache();
      this.lastError = null;
      return {
        ok: true,
        queued: false,
        duplicate: !!json.duplicate,
        message: json.duplicate ? 'GIÀ INVIATO' : 'INVIATO',
      };
    } catch (err) {
      const pending = loadPending();
      pending.push({ ...payload, _queuedAt: Date.now() });
      while (pending.length > 50) pending.shift();
      savePending(pending);
      this.lastError = err.message || String(err);
      return { ok: false, queued: true,
               message: 'OFFLINE - IN CODA (' + pending.length + ')' };
    }
  }

  /** Classifica PUNTI ATRS per una gara (one-per-player + punti per posizione). */
  async fetchTop(trackId, n = LEADERBOARD_TOP_N) {
    if (!this.isAvailable() || !trackId) return [];
    const cacheKey = 'top|' + trackId + '|' + n;
    const cached = readCache(cacheKey);
    if (cached) return cached;
    try {
      const url = this.url
        + (this.url.includes('?') ? '&' : '?')
        + 'action=top&trackId=' + encodeURIComponent(trackId)
        + '&n=' + encodeURIComponent(n);
      const res = await fetchWithTimeout(url, { method: 'GET' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!Array.isArray(json)) throw new Error('formato non valido');
      writeCache(cacheKey, json);
      this.lastError = null;
      return json;
    } catch (err) {
      this.lastError = err.message || String(err);
      return [];
    }
  }

  /** Classifica TEMPI assoluti per una gara (tutte le entries, multi-per-atleta). */
  async fetchTimes(trackId, n = LEADERBOARD_TOP_N) {
    if (!this.isAvailable() || !trackId) return [];
    const cacheKey = 'times|' + trackId + '|' + n;
    const cached = readCache(cacheKey);
    if (cached) return cached;
    try {
      const url = this.url
        + (this.url.includes('?') ? '&' : '?')
        + 'action=times&trackId=' + encodeURIComponent(trackId)
        + '&n=' + encodeURIComponent(n);
      const res = await fetchWithTimeout(url, { method: 'GET' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!Array.isArray(json)) throw new Error('formato non valido');
      writeCache(cacheKey, json);
      this.lastError = null;
      return json;
    } catch (err) {
      this.lastError = err.message || String(err);
      return [];
    }
  }

  /** Classifica generale campionato (filtro per genere opzionale). */
  async fetchChampionship(gender = '') {
    if (!this.isAvailable()) return [];
    const cacheKey = 'champ|' + gender;
    const cached = readCache(cacheKey);
    if (cached) return cached;
    try {
      const url = this.url
        + (this.url.includes('?') ? '&' : '?')
        + 'action=championship'
        + (gender ? '&gender=' + encodeURIComponent(gender) : '');
      const res = await fetchWithTimeout(url, { method: 'GET' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!Array.isArray(json)) throw new Error('formato non valido');
      writeCache(cacheKey, json);
      this.lastError = null;
      return json;
    } catch (err) {
      this.lastError = err.message || String(err);
      return [];
    }
  }

  pendingCount() {
    return loadPending().length;
  }

  async _flushPending() {
    if (!this.isAvailable()) return 0;
    const pending = loadPending();
    if (pending.length === 0) return 0;
    let sent = 0;
    while (pending.length > 0) {
      const item = pending[0];
      const { _queuedAt, ...payload } = item;
      try {
        const res = await fetchWithTimeout(this.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: urlEncode(payload),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        if (!json || (json.ok !== true && !json.duplicate)) {
          throw new Error(json?.error || 'risposta non valida');
        }
        pending.shift();
        sent += 1;
      } catch (err) {
        savePending(pending);
        return sent;
      }
    }
    savePending(pending);
    return sent;
  }
}

export const leaderboard = new Leaderboard();
