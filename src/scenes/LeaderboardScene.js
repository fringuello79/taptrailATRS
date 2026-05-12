// src/scenes/LeaderboardScene.js
// Classifiche del gioco. 4 sotto-viste, navigabili con TAB / pulsanti UI:
//
//   LOCALE      → record salvati su localStorage (PB per ghost), una per gara
//   CAMPIONATO  → classifica generale ATRS (totale punti + bonus 5/6, 6/6)
//   PUNTI       → classifica posizionale di una singola gara (punti ATRS)
//   TEMPI       → classifica dei tempi assoluti di una singola gara (tutte le entries)
//
// CAMPIONATO/PUNTI/TEMPI sono ONLINE: chiamano Leaderboard.fetchChampionship /
// fetchTop / fetchTimes. Backend = Google Apps Script.

import { drawText, drawTextCentered, drawTextShadow } from '../ui/PixelFont.js';
import { GameState } from '../core/Game.js';
import { leaderboard } from '../systems/Leaderboard.js';

const VIEWS = ['local', 'championship', 'points', 'times'];
const VIEW_LABELS = {
  local: 'LOCALE',
  championship: 'CAMPIONATO',
  points: 'PUNTI GARA',
  times: 'TEMPI GARA',
};

export class LeaderboardScene {
  constructor(game) {
    this.game = game;
    this.records = game.storage.loadRecords();

    // Lista delle gare (per views 'points' e 'times')
    this.tracks = [];
    const events = game.manifest.events || [];
    for (const ev of events) {
      for (const dist of (ev.distances || [])) {
        this.tracks.push({
          id: dist.id,
          name: `${ev.name} ${dist.label}`,
          eventLogo: ev.logo,
          unlocked: !dist.placeholder,
        });
      }
    }
    this.trackIdx = 0;   // indice gara per views 'points' e 'times'

    // Vista attiva
    this.view = 'local';

    // Cache risultati per ogni vista online
    this.onlineData = {};        // chiave → entries[]
    this.onlineLoading = {};     // chiave → bool
    this.onlineError = {};       // chiave → string|null

    this._handleKey = (e) => {
      if (e.code === 'Escape') this.game.changeState(GameState.MENU);
      else if (e.code === 'Enter') this.game.changeState(GameState.MENU);
      else if (e.code === 'Tab') {
        e.preventDefault();
        this._cycleView(e.shiftKey ? -1 : 1);
      } else if ((this.view === 'points' || this.view === 'times')) {
        if (e.code === 'ArrowLeft') this._changeTrack(-1);
        else if (e.code === 'ArrowRight') this._changeTrack(1);
      }
    };
    window.addEventListener('keydown', this._handleKey);
  }

  exit() {
    window.removeEventListener('keydown', this._handleKey);
  }

  _cycleView(dir) {
    const i = VIEWS.indexOf(this.view);
    const next = VIEWS[(i + dir + VIEWS.length) % VIEWS.length];
    this._setView(next);
  }

  _setView(v) {
    if (v === this.view) return;
    this.view = v;
    this._ensureLoaded();
  }

  _changeTrack(dir) {
    this.trackIdx = (this.trackIdx + dir + this.tracks.length) % this.tracks.length;
    this._ensureLoaded();
  }

  _currentKey() {
    if (this.view === 'championship') return 'championship';
    if (this.view === 'points' || this.view === 'times') {
      const t = this.tracks[this.trackIdx];
      return this.view + '|' + (t ? t.id : '');
    }
    return null;
  }

  _ensureLoaded() {
    const key = this._currentKey();
    if (!key) return;
    if (this.onlineData[key] !== undefined) return;
    if (this.onlineLoading[key]) return;
    this._loadOnline(key);
  }

  _loadOnline(key) {
    if (!leaderboard.isAvailable()) {
      this.onlineData[key] = [];
      this.onlineError[key] = 'BACKEND NON CONFIGURATO';
      return;
    }
    this.onlineLoading[key] = true;
    this.onlineError[key] = null;
    let promise;
    if (this.view === 'championship') {
      promise = leaderboard.fetchChampionship('', 20);
    } else if (this.view === 'points') {
      const t = this.tracks[this.trackIdx];
      promise = leaderboard.fetchTop(t.id, 20);
    } else if (this.view === 'times') {
      const t = this.tracks[this.trackIdx];
      promise = leaderboard.fetchTimes(t.id, 20);
    } else {
      return;
    }
    promise.then(entries => {
      this.onlineData[key] = entries;
      this.onlineLoading[key] = false;
      if (entries.length === 0 && leaderboard.lastError) {
        this.onlineError[key] = leaderboard.lastError;
      }
    }).catch(err => {
      this.onlineLoading[key] = false;
      this.onlineData[key] = [];
      this.onlineError[key] = err.message || String(err);
    });
  }

  _refreshCurrent() {
    const key = this._currentKey();
    if (!key) return;
    delete this.onlineData[key];
    delete this.onlineError[key];
    this._loadOnline(key);
  }

  update(dt) {
    const W = this.game.virtualW;
    const H = this.game.virtualH;
    for (const c of this.game.input.menuClicks) {
      // Back
      if (c.x < 40 && c.y < 24) {
        this.game.changeState(GameState.MENU);
        return;
      }
      // Tab buttons (in alto a destra). Ogni tab è 70px largo, 18 px alto.
      // Layout: 4 tab affiancati partendo da x=W-(4*72+4)
      const tabW = 72, tabH = 18, tabY = 4, tabGap = 2;
      const totalW = VIEWS.length * tabW + (VIEWS.length - 1) * tabGap;
      const startX = W - totalW - 4;
      for (let i = 0; i < VIEWS.length; i++) {
        const tx = startX + i * (tabW + tabGap);
        if (c.x >= tx && c.x < tx + tabW && c.y >= tabY && c.y < tabY + tabH) {
          this._setView(VIEWS[i]);
          this.game.audio.beep(660, 0.05);
          return;
        }
      }
      // Frecce track (solo per points/times)
      if (this.view === 'points' || this.view === 'times') {
        // Sinistra: x in [10, 30], y in [50, 70]
        if (c.x >= 10 && c.x <= 30 && c.y >= 50 && c.y <= 72) {
          this._changeTrack(-1);
          this.game.audio.beep(440, 0.05);
          return;
        }
        // Destra: x in [W-30, W-10], y in [50, 70]
        if (c.x >= W - 30 && c.x <= W - 10 && c.y >= 50 && c.y <= 72) {
          this._changeTrack(1);
          this.game.audio.beep(440, 0.05);
          return;
        }
      }
      // Refresh
      if (c.x >= W - 70 && c.x < W - 4 && c.y >= H - 22 && c.y < H - 4) {
        this._refreshCurrent();
        this.game.audio.beep(880, 0.05);
        return;
      }
    }
  }

  render(ctx) {
    const W = this.game.virtualW;
    const H = this.game.virtualH;
    ctx.fillStyle = '#0E0E1A';
    ctx.fillRect(0, 0, W, H);

    drawTextShadow(ctx, '< BACK', 8, 8, '#FFFFFF', '#000', 1);
    drawTextCentered(ctx, 'CLASSIFICHE', W / 2, 8, '#FFD700', 2);

    // Tab buttons (in alto a destra)
    const tabW = 72, tabH = 18, tabY = 4, tabGap = 2;
    const totalW = VIEWS.length * tabW + (VIEWS.length - 1) * tabGap;
    const startX = W - totalW - 4;
    for (let i = 0; i < VIEWS.length; i++) {
      const v = VIEWS[i];
      const tx = startX + i * (tabW + tabGap);
      const active = (this.view === v);
      ctx.fillStyle = active ? '#FFD700' : '#1a1a2e';
      ctx.fillRect(tx, tabY, tabW, tabH);
      ctx.strokeStyle = active ? '#FFFFFF' : '#444466';
      ctx.lineWidth = 1;
      ctx.strokeRect(tx + 0.5, tabY + 0.5, tabW - 1, tabH - 1);
      drawTextCentered(ctx, VIEW_LABELS[v], tx + tabW / 2, tabY + 5,
                       active ? '#000000' : '#AAAACC', 1);
    }

    // Render body in base alla vista
    if (this.view === 'local') {
      this._renderLocal(ctx);
    } else if (this.view === 'championship') {
      this._renderChampionship(ctx);
    } else if (this.view === 'points') {
      this._renderPointsRace(ctx);
    } else if (this.view === 'times') {
      this._renderTimesRace(ctx);
    }

    // Refresh button (in basso a destra, solo per viste online)
    if (this.view !== 'local') {
      const rbX = W - 70, rbY = H - 22, rbW = 66, rbH = 18;
      ctx.fillStyle = '#1F4FA8';
      ctx.fillRect(rbX, rbY, rbW, rbH);
      ctx.strokeStyle = '#88BBFF';
      ctx.strokeRect(rbX + 0.5, rbY + 0.5, rbW - 1, rbH - 1);
      drawTextCentered(ctx, 'REFRESH', rbX + rbW / 2, rbY + 6, '#FFFFFF', 1);
    }
  }

  // === RENDER VISTE ===

  _renderLocal(ctx) {
    const W = this.game.virtualW;
    drawTextCentered(ctx, 'RECORD PERSONALI (LOCALI)', W / 2, 36, '#88FFCC', 1);
    const startY = 60;
    const tracks = this.tracks.filter(t => t.unlocked);
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      const ry = startY + i * 14;
      drawText(ctx, t.name.toUpperCase().substring(0, 36),
               20, ry, '#FFFFFF', 1);
      const rec = this.records && this.records[t.id];
      if (rec && rec.time) {
        drawText(ctx, fmtTime(rec.time, 2), W - 80, ry, '#FFD700', 1);
      } else {
        drawText(ctx, '--:--', W - 80, ry, '#666666', 1);
      }
    }
  }

  _renderChampionship(ctx) {
    const W = this.game.virtualW;
    const key = 'championship';
    drawTextCentered(ctx, 'CLASSIFICA CAMPIONATO ATRS 2026',
                     W / 2, 36, '#88BBFF', 1);

    const entries = this.onlineData[key];
    const startY = 60;

    if (this._renderLoadingOrError(ctx, key, startY)) return;
    if (!entries || entries.length === 0) {
      drawTextCentered(ctx, 'NESSUNA ENTRY', W / 2, startY + 30, '#888888', 2);
      drawTextCentered(ctx, 'Gioca una gara per essere il primo!',
                       W / 2, startY + 60, '#FFFFFF', 1);
      return;
    }

    // Header
    drawText(ctx, '#',         20,  startY, '#FFD700', 1);
    drawText(ctx, 'GIOCATORE', 48,  startY, '#FFD700', 1);
    drawText(ctx, 'S',         220, startY, '#FFD700', 1);
    drawText(ctx, 'GARE',      244, startY, '#FFD700', 1);
    drawText(ctx, 'BONUS',     290, startY, '#FFD700', 1);
    drawText(ctx, 'TOTALE',    360, startY, '#FFD700', 1);
    drawText(ctx, 'FIN',       430, startY, '#FFD700', 1);
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(16, startY + 10, W - 32, 1);

    const myName = (this.game.profile.name || 'RUNNER').toUpperCase();
    const maxRows = Math.min(15, entries.length);
    for (let i = 0; i < maxRows; i++) {
      const e = entries[i];
      const ry = startY + 16 + i * 14;
      const isMine = (e.player || '').toUpperCase() === myName;
      const col = isMine ? '#FFD700' : '#FFFFFF';
      drawText(ctx, `${e.position}.`, 20, ry, '#FFD700', 1);
      drawText(ctx, (e.player || '?').toUpperCase().substring(0, 12),
               48, ry, col, 1);
      drawText(ctx, e.gender || '-', 220, ry, '#AAAACC', 1);
      drawText(ctx, `${e.eventsCompleted}/6`, 244, ry, '#88FFCC', 1);
      drawText(ctx, e.bonusPartecipazione > 0 ? `+${e.bonusPartecipazione}` : '-',
               290, ry, '#FF9933', 1);
      drawText(ctx, `${e.totalPoints}`, 360, ry, col, 1);
      drawText(ctx, e.finisher ? '*' : '-',
               436, ry, e.finisher ? '#FFD700' : '#666688', 1);
    }
  }

  _renderPointsRace(ctx) {
    this._renderRaceList(ctx, 'points');
  }

  _renderTimesRace(ctx) {
    this._renderRaceList(ctx, 'times');
  }

  _renderRaceList(ctx, mode) {
    const W = this.game.virtualW;
    const t = this.tracks[this.trackIdx];
    if (!t) return;
    const key = mode + '|' + t.id;

    // Selettore gara con frecce
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(10, 50, W - 20, 22);
    ctx.strokeStyle = '#444466';
    ctx.lineWidth = 1;
    ctx.strokeRect(10.5, 50.5, W - 21, 21);

    // Frecce sx/dx
    drawText(ctx, '<', 16, 56, '#FFD700', 2);
    drawText(ctx, '>', W - 22, 56, '#FFD700', 2);

    const titlePrefix = mode === 'points' ? 'PUNTI: ' : 'TEMPI: ';
    drawTextCentered(ctx, (titlePrefix + t.name).toUpperCase(),
                     W / 2, 57, '#FFFFFF', 1);

    const startY = 84;
    const entries = this.onlineData[key];
    if (this._renderLoadingOrError(ctx, key, startY)) return;
    if (!entries || entries.length === 0) {
      drawTextCentered(ctx, 'NESSUNA ENTRY', W / 2, startY + 30, '#888888', 2);
      drawTextCentered(ctx, 'Gioca questa gara per essere il primo!',
                       W / 2, startY + 60, '#FFFFFF', 1);
      return;
    }

    // Header
    if (mode === 'points') {
      drawText(ctx, '#',         20,  startY, '#FFD700', 1);
      drawText(ctx, 'GIOCATORE', 48,  startY, '#FFD700', 1);
      drawText(ctx, 'S',         200, startY, '#FFD700', 1);
      drawText(ctx, 'TEMPO',     224, startY, '#FFD700', 1);
      drawText(ctx, 'BASE',      304, startY, '#FFD700', 1);
      drawText(ctx, 'UTMB',      354, startY, '#FFD700', 1);
      drawText(ctx, 'TOTALE',    404, startY, '#FFD700', 1);
    } else {
      drawText(ctx, '#',         20,  startY, '#FFD700', 1);
      drawText(ctx, 'GIOCATORE', 48,  startY, '#FFD700', 1);
      drawText(ctx, 'S',         260, startY, '#FFD700', 1);
      drawText(ctx, 'TEMPO',     310, startY, '#FFD700', 1);
    }
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(16, startY + 10, W - 32, 1);

    const myName = (this.game.profile.name || 'RUNNER').toUpperCase();
    const maxRows = Math.min(15, entries.length);
    for (let i = 0; i < maxRows; i++) {
      const e = entries[i];
      const ry = startY + 16 + i * 14;
      const isMine = (e.player || '').toUpperCase() === myName;
      const col = isMine ? '#FFD700' : '#FFFFFF';
      drawText(ctx, `${e.position}.`, 20, ry, '#FFD700', 1);
      drawText(ctx, (e.player || '?').toUpperCase().substring(0, 14),
               48, ry, col, 1);
      if (mode === 'points') {
        drawText(ctx, e.gender || '-', 200, ry, '#AAAACC', 1);
        drawText(ctx, fmtTime(e.timeSec || 0, 3), 224, ry, col, 1);
        drawText(ctx, `${e.basePoints}`, 304, ry, col, 1);
        drawText(ctx, e.utmbBonus > 0 ? `+${e.utmbBonus}` : '-',
                 354, ry, '#FF9933', 1);
        drawText(ctx, `${e.points}`, 404, ry, col, 1);
      } else {
        drawText(ctx, e.gender || '-', 260, ry, '#AAAACC', 1);
        drawText(ctx, fmtTime(e.timeSec || 0, 3), 310, ry, col, 1);
      }
    }
  }

  /** Helper: se in loading o error, rendi e ritorna true. */
  _renderLoadingOrError(ctx, key, startY) {
    const W = this.game.virtualW;
    if (this.onlineLoading[key]) {
      drawTextCentered(ctx, 'CARICAMENTO...', W / 2, startY + 40, '#88BBFF', 2);
      return true;
    }
    if (this.onlineData[key] === undefined) {
      this._loadOnline(key);
      drawTextCentered(ctx, 'CARICAMENTO...', W / 2, startY + 40, '#88BBFF', 2);
      return true;
    }
    if (this.onlineData[key] && this.onlineData[key].length === 0
        && this.onlineError[key]) {
      drawTextCentered(ctx, 'ERRORE DI RETE', W / 2, startY + 30, '#FF6060', 2);
      drawTextCentered(ctx, this.onlineError[key].substring(0, 60),
                       W / 2, startY + 60, '#FF8080', 1);
      return true;
    }
    return false;
  }
}

/** Formatta secondi con N decimali. Default 2 (compatibile col vecchio). */
function fmtTime(sec, decimals = 2) {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  if (m > 0) {
    return `${m}:${s.toFixed(decimals).padStart(decimals + 3, '0')}`;
  }
  return `${s.toFixed(decimals)}s`;
}
