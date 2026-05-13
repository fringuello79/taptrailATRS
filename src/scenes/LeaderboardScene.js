// src/scenes/LeaderboardScene.js
// Vista classifiche: due tab.
//   LOCALE  → record salvati su localStorage, divisi per track (tutte le distanze).
//   ONLINE  → classifica Campionato ATRS via backend (Google Apps Script).
//             Solo se LEADERBOARD_URL è configurato; altrimenti messaggio
//             "BACKEND NON CONFIGURATO. VEDI docs/LEADERBOARD_SETUP.md".
//
// Estensione futura: la tab ONLINE può ciclare anche i board per singola gara
// (board=trackId). Per ora mostra solo il Campionato, che è il più interessante
// e si carica in 1 chiamata. Le entries delle singole gare vengono scritte
// comunque sul Sheet (auto-submit da ResultsScene), pronte per il futuro.

import { drawText, drawTextCentered, drawTextShadow } from '../ui/PixelFont.js';
import { drawLogo } from '../ui/Branding.js';
import { GameState } from '../core/Game.js';
import { leaderboard } from '../systems/Leaderboard.js';

export class LeaderboardScene {
  constructor(game) {
    this.game = game;
    this.records = game.storage.loadRecords();
    // Estraggo TUTTE le distanze da events
    this.tracks = [];
    const events = game.manifest.events || [];
    for (const ev of events) {
      for (const dist of (ev.distances || [])) {
        this.tracks.push({
          id: dist.id,
          name: `${ev.name} ${dist.label}`,
          eventLogo: ev.logo,
          unlocked: !dist.placeholder,  // disponibile solo se ha GPX vero
        });
      }
    }

    // Tab attiva: 'local' | 'online'. Default = local (offline-friendly).
    this.tab = 'local';

    // Stato fetch online
    this.onlineEntries = null;       // null = non ancora caricato; [] = vuoto; [...] = popolato
    this.onlineLoading = false;
    this.onlineError = null;
    this.onlineBoard = 'championship';

    this._handleKey = (e) => {
      if (e.code === 'Escape') this.game.changeState(GameState.MENU);
      else if (e.code === 'Enter') this.game.changeState(GameState.MENU);
      else if (e.code === 'Tab') {
        e.preventDefault();
        this._switchTab(this.tab === 'local' ? 'online' : 'local');
      }
    };
    window.addEventListener('keydown', this._handleKey);
  }

  exit() {
    window.removeEventListener('keydown', this._handleKey);
  }

  /** Cambia tab. Se vado su online e non ho ancora caricato, lancio fetch. */
  _switchTab(newTab) {
    if (newTab === this.tab) return;
    this.tab = newTab;
    if (newTab === 'online' && this.onlineEntries === null && !this.onlineLoading) {
      this._loadOnline();
    }
  }

  _loadOnline() {
    if (!leaderboard.isAvailable()) {
      this.onlineEntries = [];
      this.onlineError = 'BACKEND NON CONFIGURATO';
      return;
    }
    this.onlineLoading = true;
    this.onlineError = null;
    leaderboard.fetchTop(this.onlineBoard, 10).then(entries => {
      this.onlineEntries = entries;
      this.onlineLoading = false;
      if (entries.length === 0 && leaderboard.lastError) {
        this.onlineError = leaderboard.lastError;
      }
    }).catch(err => {
      this.onlineLoading = false;
      this.onlineEntries = [];
      this.onlineError = err.message || String(err);
    });
  }

  update(dt) {
    const W = this.game.virtualW;
    for (const c of this.game.input.menuClicks) {
      // Back
      if (c.x < 40 && c.y < 24) {
        this.game.changeState(GameState.MENU);
        return;
      }
      // Tab toggle (in alto a destra)
      // Tab LOCALE: x in [W-180, W-94], y in [4, 22]
      if (c.x >= W - 180 && c.x < W - 94 && c.y >= 4 && c.y < 22) {
        this._switchTab('local');
        this.game.audio.beep(660, 0.05);
        return;
      }
      // Tab ONLINE: x in [W-90, W-4], y in [4, 22]
      if (c.x >= W - 90 && c.x < W - 4 && c.y >= 4 && c.y < 22) {
        this._switchTab('online');
        this.game.audio.beep(660, 0.05);
        return;
      }
      // Refresh button (online tab, in basso a destra)
      if (this.tab === 'online' && c.x >= W - 70 && c.x < W - 4
          && c.y >= 320 && c.y < 340) {
        this.onlineEntries = null;
        this._loadOnline();
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

    // Tab toggle in alto a destra
    this._drawTab(ctx, W - 180, 4, 86, 18, 'LOCALE',  this.tab === 'local');
    this._drawTab(ctx, W -  90, 4, 86, 18, 'ONLINE',  this.tab === 'online');

    if (this.tab === 'local') {
      this._renderLocal(ctx);
    } else {
      this._renderOnline(ctx);
    }

    drawTextCentered(ctx, '(TAB SWITCH | ESC USCITA)', W / 2, H - 10, '#888888', 1);
  }

  _drawTab(ctx, x, y, w, h, label, active) {
    ctx.fillStyle = active ? '#FFD700' : '#1F4FA8';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = active ? '#FFFFFF' : '#88BBFF';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    drawTextCentered(ctx, label, x + w / 2, y + 6,
                     active ? '#000000' : '#FFFFFF', 1);
  }

  _renderLocal(ctx) {
    const W = this.game.virtualW;
    const H = this.game.virtualH;
    let y = 36;
    for (const t of this.tracks) {
      if (!t.unlocked) continue;
      const logoPath = t.eventLogo;
      if (logoPath) {
        drawLogo(ctx, logoPath, 10, y - 6, 22);
        drawText(ctx, t.name.toUpperCase(), 36, y, '#88BBFF', 1);
      } else {
        drawText(ctx, t.name.toUpperCase(), 16, y, '#88BBFF', 1);
      }
      y += 10;
      const rec = this.records[t.id] || [];
      if (rec.length === 0) {
        drawText(ctx, 'NESSUN RECORD ANCORA. CORRI!', 30, y, '#666688', 1);
        y += 12;
      } else {
        for (let i = 0; i < Math.min(5, rec.length); i++) {
          const r = rec[i];
          drawText(ctx, `${i + 1}.`, 30, y, '#FFD700', 1);
          drawText(ctx, r.name.toUpperCase(), 46, y, '#FFFFFF', 1);
          drawText(ctx, fmtTime(r.time), 130, y, '#CCCCCC', 1);
          y += 8;
        }
      }
      y += 6;
      if (y > H - 30) break;
    }
  }

  _renderOnline(ctx) {
    const W = this.game.virtualW;
    const H = this.game.virtualH;

    // Header del board
    drawText(ctx, 'CAMPIONATO ATRS 2026 - TOP 10 ONLINE',
             20, 36, '#FFD700', 1);
    drawText(ctx, '(score finale + tempo cumulato gare completate)',
             20, 48, '#888888', 1);

    // Pending count
    const pending = leaderboard.pendingCount();
    if (pending > 0) {
      drawText(ctx, `*** ${pending} INVII IN CODA (riprovo al refresh)`,
               20, 60, '#FFD700', 1);
    }

    // Body
    const startY = 78;
    if (!leaderboard.isAvailable()) {
      drawTextCentered(ctx, 'BACKEND NON CONFIGURATO', W/2, startY + 30, '#FF6060', 2);
      drawTextCentered(ctx, 'Vedi docs/LEADERBOARD_SETUP.md per attivare la',
                       W/2, startY + 60, '#FFFFFF', 1);
      drawTextCentered(ctx, 'classifica online (5 minuti, gratis).',
                       W/2, startY + 70, '#FFFFFF', 1);
      return;
    }

    if (this.onlineLoading) {
      drawTextCentered(ctx, 'CARICAMENTO...', W/2, startY + 40, '#88BBFF', 2);
      return;
    }

    if (this.onlineEntries === null) {
      // Non ancora richiesto in questo turno: lo lancio
      this._loadOnline();
      drawTextCentered(ctx, 'CARICAMENTO...', W/2, startY + 40, '#88BBFF', 2);
      return;
    }

    if (this.onlineEntries.length === 0) {
      if (this.onlineError) {
        drawTextCentered(ctx, 'ERRORE DI RETE',
                         W/2, startY + 30, '#FF6060', 2);
        drawTextCentered(ctx, this.onlineError.substring(0, 60),
                         W/2, startY + 60, '#FF8080', 1);
        drawTextCentered(ctx, '(prova il refresh in basso a destra)',
                         W/2, startY + 75, '#888888', 1);
      } else {
        drawTextCentered(ctx, 'NESSUN PUNTEGGIO ANCORA',
                         W/2, startY + 30, '#888888', 2);
        drawTextCentered(ctx, 'Sii il primo a finire un campionato!',
                         W/2, startY + 60, '#FFFFFF', 1);
      }
    } else {
      // Header colonne
      const cx = { rank: 28, name: 56, score: 290, time: 380, finisher: 470 };
      drawText(ctx, '#',         cx.rank,     startY, '#FFD700', 1);
      drawText(ctx, 'GIOCATORE', cx.name,     startY, '#FFD700', 1);
      drawText(ctx, 'SCORE',     cx.score,    startY, '#FFD700', 1);
      drawText(ctx, 'TEMPO',     cx.time,     startY, '#FFD700', 1);
      drawText(ctx, 'FIN.',      cx.finisher, startY, '#FFD700', 1);

      // Linea separatore
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(20, startY + 10, W - 40, 1);

      // Entries
      const myName = (this.game.profile.name || 'RUNNER').toUpperCase();
      for (let i = 0; i < Math.min(10, this.onlineEntries.length); i++) {
        const e = this.onlineEntries[i];
        const ry = startY + 16 + i * 12;
        const isMine = (e.player || '').toUpperCase() === myName;
        const col = isMine ? '#FFD700' : '#FFFFFF';
        drawText(ctx, `${i + 1}.`,                       cx.rank,     ry, '#FFD700', 1);
        drawText(ctx, (e.player || '?').toUpperCase().substring(0, 12), cx.name, ry, col, 1);
        drawText(ctx, `${Math.round(e.score || 0)} PT`,  cx.score,    ry, col, 1);
        drawText(ctx, fmtTime(e.timeSec || 0),           cx.time,     ry, col, 1);
        // Finisher? Cerco nel campo extras (JSON serializzato)
        let finisher = false;
        if (e.extras && typeof e.extras === 'string') {
          try { finisher = JSON.parse(e.extras).finisher === true; }
          catch (err) { /* ignore */ }
        } else if (e.extras && e.extras.finisher) {
          finisher = true;
        }
        drawText(ctx, finisher ? '*' : '-', cx.finisher + 8, ry,
                 finisher ? '#FFD700' : '#666688', 1);
      }
    }

    // Refresh button in basso a destra
    const rbX = W - 70, rbY = 320, rbW = 66, rbH = 16;
    ctx.fillStyle = '#1F4FA8';
    ctx.fillRect(rbX, rbY, rbW, rbH);
    ctx.strokeStyle = '#88BBFF';
    ctx.strokeRect(rbX + 0.5, rbY + 0.5, rbW - 1, rbH - 1);
    drawTextCentered(ctx, 'REFRESH', rbX + rbW/2, rbY + 5, '#FFFFFF', 1);
  }
}

function fmtTime(sec) {
  sec = Math.max(0, sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec * 100) % 100);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
}
