// src/scenes/ChampionshipFinalScene.js
// Schermata finale del Campionato ATRS 2026.
// Mostra:
// - Riepilogo gara per gara (tempo, punteggio, mollata/completata)
// - Punteggio totale + bonus partecipazione
// - "Trofeo finisher" pixel-art se completate tutte e 6
// - Pulsanti: Invia in classifica online, Nuovo campionato

import { drawText, drawTextCentered, drawTextShadow } from '../ui/PixelFont.js';
import { drawLogo, drawAtrsBackground, logoCache } from '../ui/Branding.js';
import { GameState } from '../core/Game.js';
import { championshipSummary, resetChampionship, loadChampionship } from '../systems/Championship.js';
import { leaderboard } from '../systems/Leaderboard.js';

export class ChampionshipFinalScene {
  constructor(game, payload = {}) {
    this.game = game;
    this.state = payload.state || loadChampionship();
    this.summary = championshipSummary(this.state, this.game.manifest);
    this.t = 0;
    this.confirmReset = false;
    // Submit online: 'idle' | 'sending' | 'ok' | 'queued' | 'error' | 'unconfigured'
    this.submitStatus = 'idle';
    this.submitMessage = '';
  }

  enter() {}
  exit() {}

  update(dt) {
    this.t += dt;
    const W = this.game.virtualW;
    const H = this.game.virtualH;
    for (const c of this.game.input.menuClicks) {
      // back / exit
      if (c.x < 40 && c.y < 24) {
        this.game.changeState(GameState.CHAMPIONSHIP_HUB);
        return;
      }
      // Vedi classifica campionato: naviga a LeaderboardScene (la vista CAMPIONATO
      // mostra la classifica generale, già aggiornata con tutte le gare giocate
      // durante il campionato che sono state inviate automaticamente).
      if (c.x > W/2 - 100 && c.x < W/2 - 4 && c.y > H - 20 && c.y < H - 4) {
        this.game.audio.beep(660, 0.10);
        this.game.changeState(GameState.LEADERBOARD);
        return;
      }
      // Nuovo campionato
      if (c.x > W/2 + 4 && c.x < W/2 + 100 && c.y > H - 20 && c.y < H - 4) {
        if (this.confirmReset) {
          resetChampionship();
          this.game.audio.beep(440, 0.15);
          this.game.changeState(GameState.MODE_SELECT);
        } else {
          this.confirmReset = true;
          setTimeout(() => { this.confirmReset = false; }, 3000);
        }
        return;
      }
    }
  }

  /** Invia il riepilogo del campionato al backend leaderboard.
   *  Board: 'championship'. Time: somma dei tempi delle gare completate.
   *  Score: finalTotal del summary. */
  _submitOnline() {
    if (!leaderboard.isAvailable()) {
      this.submitStatus = 'unconfigured';
      this.submitMessage = 'BACKEND NON CONFIGURATO';
      this.game.audio.beep(220, 0.15);
      return;
    }
    this.submitStatus = 'sending';
    this.submitMessage = 'INVIO...';
    this.game.audio.beep(660, 0.10);

    // Tempo cumulato delle gare completate (mollate non contano).
    const totalTimeSec = this.summary.races.reduce(
      (acc, r) => acc + (r.completed ? (r.timeSec || 0) : 0), 0);

    const entry = {
      player: this.game.profile.name || 'RUNNER',
      board: 'championship',
      mode: 'championship',
      timeSec: totalTimeSec,
      score: this.summary.finalTotal,
      eventId: '',
      trackId: '',
      distanceKm: 0,
      gainM: 0,
      finalStamina: 0,
      extras: {
        finisher: !!this.summary.finisher,
        completedCount: this.summary.completedCount,
        skippedCount: this.summary.skippedCount,
        bonus: this.summary.bonus,
      },
    };

    leaderboard.submitScore(entry).then(res => {
      if (res.ok) {
        this.submitStatus = 'ok';
        this.submitMessage = 'INVIATO ✓';
        this.game.audio.beep(880, 0.15);
      } else if (res.queued) {
        this.submitStatus = 'queued';
        this.submitMessage = res.message;
        this.game.audio.beep(330, 0.20);
      } else {
        this.submitStatus = 'error';
        this.submitMessage = res.message || 'ERRORE';
        this.game.audio.beep(220, 0.20);
      }
    }).catch(err => {
      this.submitStatus = 'error';
      this.submitMessage = 'ERRORE: ' + (err.message || err);
      this.game.audio.beep(220, 0.20);
    });
  }

  render(ctx) {
    const W = this.game.virtualW;
    const H = this.game.virtualH;

    // sfondo ATRS branded (blu navy + motivo verde+blu in basso + scritta FUGA)
    drawAtrsBackground(ctx, W, H);

    drawTextShadow(ctx, '< INDIETRO', 8, 8, '#FFFFFF', '#000', 1);
    const title = this.summary.finisher ? 'TROFEO FINISHER!' : 'CAMPIONATO COMPLETATO';
    drawTextCentered(ctx, title, W / 2, 8, '#FFD700', 2);

    // === LATO SINISTRO: tavoletta trofeo (se finisher) ===
    // Riquadro più grande (320x300) per dare risalto al trofeo finisher pixel-art.
    // Lo screen è 640x360: lascio 10px di margine sx, 6px tra trofeo e riepilogo,
    // 10px sotto per i bottoni. Il riepilogo a destra resta largo ~290px.
    const tw = 320, th = 300;
    if (this.summary.finisher) {
      this._drawTrophy(ctx, 10, 28, tw, th);
    } else {
      this._drawSummaryBox(ctx, 10, 28, tw, th);
    }

    // === LATO DESTRO: riepilogo gara per gara ===
    // Trofeo finisce a x=10+320=330, riepilogo parte da lx=336.
    // Larghezza riga = W - lx - 8 = 296 px → ancora ampio per:
    //   nome evento (~130px), tempo (~50px), punteggio (~40px) + bordi
    const lx = 10 + tw + 6;
    const rowW = W - lx - 8;
    drawText(ctx, 'RISULTATI:', lx, 28, '#FFD700', 1);
    for (let i = 0; i < this.summary.races.length; i++) {
      const r = this.summary.races[i];
      const ry = 42 + i * 18;
      ctx.fillStyle = '#1A1A2E';
      ctx.fillRect(lx, ry, rowW, 16);
      ctx.strokeStyle = r.completed ? '#3CC23C' : (r.skipped ? '#806060' : '#444466');
      ctx.lineWidth = 1;
      ctx.strokeRect(lx + 0.5, ry + 0.5, rowW - 1, 15);
      // Numero evento (1..6) a sx
      drawText(ctx, (i + 1) + '.', lx + 4, ry + 4, '#FFD700', 1);
      // Nome evento accorciato (max 18 char, ma con regex più ricco)
      const shortName = r.eventName
        .replace(/^Skyrace del /, '')
        .replace(/^Skyrace /, '')
        .replace(/^L'Alba dei /, '')
        .replace(/^Xterra /, 'XTERRA ')
        .replace(/^Gran Sasso /, 'GRAN SASSO ')
        .toUpperCase();
      drawText(ctx, shortName.substring(0, 22), lx + 16, ry + 4, '#FFFFFF', 1);
      // Tempo o stato — niente più punteggio client (era inattendibile)
      const stateX = lx + rowW - 80;
      if (r.completed) {
        const m = Math.floor(r.timeSec / 60);
        const s = Math.floor(r.timeSec % 60);
        const ms = Math.floor((r.timeSec * 1000) % 1000);
        drawText(ctx,
          `${m}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`,
          stateX, ry + 4, '#88FFCC', 1);
      } else if (r.skipped) {
        drawText(ctx, 'MOLLATA', stateX, ry + 4, '#FF6060', 1);
      } else {
        drawText(ctx, '—', stateX + 30, ry + 4, '#666688', 1);
      }
    }

    // Messaggio motivazionale (sostituisce il box punteggio client inattendibile)
    const sy = 42 + this.summary.races.length * 18 + 6;
    const boxW = rowW;
    const boxH = 36;
    ctx.fillStyle = '#3a2c1e';
    ctx.fillRect(lx, sy, boxW, boxH);
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.strokeRect(lx + 1, sy + 1, boxW - 2, boxH - 2);
    const completedCount = this.summary.races.filter(r => r.completed).length;
    drawTextCentered(ctx, `CAMPIONATO COMPLETATO! ${completedCount}/6 GARE`,
                     lx + boxW / 2, sy + 6, '#FFD700', 1);
    drawTextCentered(ctx, 'VEDI LA CLASSIFICA UFFICIALE',
                     lx + boxW / 2, sy + 20, '#FFFFFF', 1);

    // pulsanti in basso (centrati)
    const by = H - 18;
    // Bottone VEDI CLASSIFICA (porta a LeaderboardScene tab CAMPIONATO)
    ctx.fillStyle = '#1F4FA8';
    ctx.fillRect(W/2 - 100, by, 96, 14);
    drawTextCentered(ctx, 'CLASSIFICA', W/2 - 52, by + 4, '#FFFFFF', 1);

    ctx.fillStyle = this.confirmReset ? '#A03020' : '#2E8B3A';
    ctx.fillRect(W/2 + 4, by, 96, 14);
    drawTextCentered(ctx, this.confirmReset ? 'CONFERMA?' : 'NUOVO CAMP.', W/2 + 52, by + 4, '#FFFFFF', 1);

    // Messaggio sotto i bottoni se c'è uno stato submit non-idle
    if (this.submitStatus !== 'idle' && this.submitMessage) {
      const color = (this.submitStatus === 'ok') ? '#88FFCC'
                  : (this.submitStatus === 'queued') ? '#FFD700'
                  : '#FF8080';
      drawTextCentered(ctx, this.submitMessage, W/2, by - 10, color, 1);
    }
  }


  /** Disegna il trofeo finisher:
   *  - Asset pixel-art trophy_finisher.png (foto pixelizzata del vero trofeo ATRS)
   *    centrato in alto nel riquadro
   *  - Targhetta legno "ATRS 2026 FINISHER" col nome giocatore appoggiata sotto
   *  - Fallback su placeholder se l'asset non è (ancora) caricato */
  _drawTrophy(ctx, x, y, w, h) {
    const trophyImg = logoCache.get('assets/logos/trophy_finisher.png');

    // Targhetta in basso (non sovrapposta all'immagine — l'asset ora è
    // ritagliato e finisce naturalmente, c'è spazio pulito sotto).
    const tagH = 22;
    const tagPadY = 4;
    const tagY = y + h - tagH - tagPadY;
    const imgAreaY = y + 2;
    const imgAreaH = tagY - imgAreaY - 4;

    if (trophyImg) {
      // Ratio-fit: massimizziamo la dimensione mantenendo aspect ratio.
      const aspect = trophyImg.naturalHeight / trophyImg.naturalWidth;
      let dw = w - 4;
      let dh = dw * aspect;
      if (dh > imgAreaH) {
        dh = imgAreaH;
        dw = dh / aspect;
      }
      const dx = x + (w - dw) / 2;
      const dy = imgAreaY + (imgAreaH - dh) / 2;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(trophyImg, Math.floor(dx), Math.floor(dy),
                    Math.floor(dw), Math.floor(dh));

      // Cornice pixel-art doppia: bordo scuro interno, bordo chiaro esterno.
      // Dà al trofeo l'aria di "polaroid" attaccata sulla parete.
      ctx.strokeStyle = '#3a2410';
      ctx.lineWidth = 2;
      ctx.strokeRect(Math.floor(dx) + 1, Math.floor(dy) + 1,
                     Math.floor(dw) - 2, Math.floor(dh) - 2);
      ctx.strokeStyle = '#c08a52';
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.floor(dx) - 1, Math.floor(dy) - 1,
                     Math.floor(dw) + 2, Math.floor(dh) + 2);
    } else {
      // Fallback durante il caricamento immagine
      ctx.fillStyle = '#1A1A2E';
      ctx.fillRect(x, imgAreaY, w, imgAreaH);
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, imgAreaY + 0.5, w - 1, imgAreaH - 1);
      drawTextCentered(ctx, 'CARICAMENTO TROFEO...',
                       x + w / 2, imgAreaY + imgAreaH / 2 - 4,
                       '#88BBFF', 1);
    }

    // === TARGHETTA in basso con nome giocatore ===
    ctx.fillStyle = '#bf9f54';
    ctx.fillRect(x + 8, tagY, w - 16, tagH);
    ctx.strokeStyle = '#3a2410';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 8.5, tagY + 0.5, w - 17, tagH - 1);
    ctx.fillStyle = '#e8c47e';
    ctx.fillRect(x + 9, tagY + 1, w - 18, 1);
    drawTextCentered(ctx, this.game.profile.name.toUpperCase(),
                     x + w / 2, tagY + 4, '#1a1008', 1);
    drawTextCentered(ctx, 'ATRS 2026 FINISHER',
                     x + w / 2, tagY + 14, '#1a1008', 1);
  }

  /** Box riepilogo (se non finisher) */
  _drawSummaryBox(ctx, x, y, w, h) {
    ctx.fillStyle = '#1A1A2E';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    drawTextCentered(ctx, 'STAGIONE', x + w/2, y + 8, '#FFD700', 1);
    drawTextCentered(ctx, 'CONCLUSA', x + w/2, y + 18, '#FFD700', 1);
    drawTextCentered(ctx, 'COMPLETATE', x + w/2, y + 50, '#88FFCC', 1);
    drawTextCentered(ctx, String(this.summary.completedCount) + '/6',
                     x + w/2, y + 64, '#FFFFFF', 2);
    drawTextCentered(ctx, 'MOLLATE', x + w/2, y + 90, '#FF6060', 1);
    drawTextCentered(ctx, String(this.summary.skippedCount) + '/6',
                     x + w/2, y + 104, '#FFFFFF', 2);
    if (this.summary.bonus > 0) {
      drawTextCentered(ctx, 'BONUS', x + w/2, y + 130, '#88FFCC', 1);
      drawTextCentered(ctx, '+' + this.summary.bonus,
                       x + w/2, y + 142, '#FFD700', 2);
    } else {
      drawTextCentered(ctx, 'NIENTE', x + w/2, y + 130, '#888888', 1);
      drawTextCentered(ctx, 'TROFEO', x + w/2, y + 142, '#888888', 1);
    }
  }
}
