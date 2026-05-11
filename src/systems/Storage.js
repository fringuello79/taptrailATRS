// src/systems/Storage.js
// Persistenza su localStorage: profilo, record, ghost del PB.

const KEY_PROFILE = 'taptrail.profile.v2';
const KEY_RECORDS = 'taptrail.records.v2';
const KEY_GHOST_PREFIX = 'taptrail.ghost.v2.';
// Wipe key: bumpando questo valore, i record e i ghost vengono cancellati al
// caricamento successivo (per ripartire puliti dopo un cambio di calibrazione).
const KEY_WIPE_VERSION = 'taptrail.wipe.v2';
const CURRENT_WIPE_VERSION = '2026-05-06-stamina-rebalance';

// Eseguo wipe records/ghost se la versione è cambiata
try {
  const last = localStorage.getItem(KEY_WIPE_VERSION);
  if (last !== CURRENT_WIPE_VERSION) {
    // cancella records
    localStorage.removeItem(KEY_RECORDS);
    // cancella tutti i ghost
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(KEY_GHOST_PREFIX)) keysToRemove.push(k);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    localStorage.setItem(KEY_WIPE_VERSION, CURRENT_WIPE_VERSION);
    console.log('[Storage] Wiped records and ghosts (new wipe version)');
  }
} catch (e) { /* localStorage non disponibile, ignore */ }

export class Storage {
  loadProfile() {
    try {
      const raw = localStorage.getItem(KEY_PROFILE);
      if (raw) {
        const p = JSON.parse(raw);
        if (p.ghostEnabled === undefined) p.ghostEnabled = true;
        return p;
      }
    } catch (e) { /* ignore */ }
    return {
      name: 'RUNNER',
      gender: 'male',
      shirtColor: 'red',
      totalRaces: 0,
      totalKm: 0,
      ghostEnabled: true,
    };
  }

  saveProfile(profile) {
    try {
      localStorage.setItem(KEY_PROFILE, JSON.stringify(profile));
    } catch (e) { /* ignore */ }
  }

  loadRecords() {
    try {
      const raw = localStorage.getItem(KEY_RECORDS);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return {}; // { trackId: [{name, time, date, distance, gain}, ...] }
  }

  saveRecord(trackId, record) {
    const all = this.loadRecords();
    if (!all[trackId]) all[trackId] = [];
    all[trackId].push(record);
    all[trackId].sort((a, b) => a.time - b.time);
    all[trackId] = all[trackId].slice(0, 10); // top 10
    try {
      localStorage.setItem(KEY_RECORDS, JSON.stringify(all));
    } catch (e) { /* ignore */ }
    return all[trackId];
  }

  /** Salva il "ghost": serie di {t, progress} campionata ogni N secondi. */
  saveGhost(trackId, samples) {
    try {
      localStorage.setItem(KEY_GHOST_PREFIX + trackId, JSON.stringify(samples));
    } catch (e) { /* ignore */ }
  }

  loadGhost(trackId) {
    try {
      const raw = localStorage.getItem(KEY_GHOST_PREFIX + trackId);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return null;
  }

  getPB(trackId) {
    const all = this.loadRecords();
    const list = all[trackId];
    if (!list || !list.length) return null;
    return list[0];
  }
}
