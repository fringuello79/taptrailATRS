// src/scenes/ModeSelectScene.js
// Schermata di scelta modalità: Singola Gara vs Campionato ATRS 2026.

import { drawText, drawTextCentered, drawTextShadow } from '../ui/PixelFont.js';
import { drawLogo, drawAtrsBackground } from '../ui/Branding.js';
import { GameState } from '../core/Game.js';
import { loadChampionship } from '../systems/Championship.js';

export class ModeSelectScene {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.championshipState = loadChampionship();
  }

  enter() {}
  exit() {}

  update(dt) {
    this.t += dt;
    const W = this.game.virtualW;
    const H = this.game.virtualH;
    for (const c of this.game.input.menuClicks) {
      // Bottone "Singola Gara" (top)
      if (c.x > W/2 - 100 && c.x < W/2 + 100 && c.y > 110 && c.y < 160) {
        this.game.audio.beep(800, 0.08);
        this.game.changeState(GameState.EVENT_SELECT, { mode: 'single' });
      }
      // Bottone "Campionato" (bottom)
      if (c.x > W/2 - 100 && c.x < W/2 + 100 && c.y > 175 && c.y < 225) {
        this.game.audio.beep(880, 0.08);
        this.game.changeState(GameState.CHAMPIONSHIP_HUB);
      }
      // Back
      if (c.x < 40 && c.y < 24) {
        this.game.changeState(GameState.MENU);
      }
    }
  }

  render(ctx) {
    const W = this.game.virtualW;
    const H = this.game.virtualH;
    drawAtrsBackground(ctx, W, H);

    drawTextShadow(ctx, '< BACK', 8, 8, '#FFFFFF', '#000', 1);
    drawTextCentered(ctx, 'MODALITA DI GIOCO', W / 2, 8, '#FFD700', 2);

    // Logo ATRS in alto a destra (se esiste)
    drawLogo(ctx, 'assets/logos/atrs.png', W - 70, 4, 60);

    // BOTTONE 1: SINGOLA GARA
    const b1y = 110;
    ctx.fillStyle = '#1F4FA8';
    ctx.fillRect(W/2 - 100, b1y, 200, 50);
    ctx.strokeStyle = '#88BBFF';
    ctx.lineWidth = 2;
    ctx.strokeRect(W/2 - 100, b1y, 200, 50);
    drawTextCentered(ctx, 'SINGOLA GARA', W / 2, b1y + 8, '#FFFFFF', 2);
    drawTextCentered(ctx, 'allenamento, prove libere', W / 2, b1y + 30, '#88BBFF', 1);
    drawTextCentered(ctx, 'studia il percorso', W / 2, b1y + 40, '#88BBFF', 1);

    // BOTTONE 2: CAMPIONATO
    const b2y = 175;
    const championStarted = this.championshipState.started;
    const championComplete = this.championshipState.seasonComplete;
    let bgColor = '#2E8B3A';
    let label = 'CAMPIONATO ATRS 2026';
    if (championComplete) {
      bgColor = '#705820';
      label = 'CAMPIONATO COMPLETATO';
    } else if (championStarted) {
      label = 'CONTINUA CAMPIONATO';
    }
    ctx.fillStyle = bgColor;
    ctx.fillRect(W/2 - 100, b2y, 200, 50);
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.strokeRect(W/2 - 100, b2y, 200, 50);
    drawTextCentered(ctx, label, W / 2, b2y + 8, '#FFFFFF', 1);
    if (championStarted && !championComplete) {
      const eventsDone = Object.keys(this.championshipState.completedEvents).length;
      drawTextCentered(ctx, `progresso: ${eventsDone}/6 gare completate`,
                       W / 2, b2y + 22, '#FFEEAA', 1);
      drawTextCentered(ctx, `classifica live nelle classifiche`,
                       W / 2, b2y + 35, '#FFEEAA', 1);
    } else if (!championStarted) {
      drawTextCentered(ctx, '6 eventi, 13 distanze', W / 2, b2y + 22, '#FFEEAA', 1);
      drawTextCentered(ctx, 'classifica online ufficiale', W / 2, b2y + 35, '#FFEEAA', 1);
    } else {
      drawTextCentered(ctx, 'campionato completato!',
                       W / 2, b2y + 22, '#FFEEAA', 1);
      drawTextCentered(ctx, 'vedi la classifica generale',
                       W / 2, b2y + 35, '#FFEEAA', 1);
    }

    // Istruzioni rapide (sopra al nickname)
    const insY = H - 64;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(20, insY, W - 40, 42);
    ctx.strokeStyle = '#88BBFF';
    ctx.lineWidth = 1;
    ctx.strokeRect(20.5, insY + 0.5, W - 41, 41);
    drawTextCentered(ctx, 'COME SI GIOCA', W / 2, insY + 3, '#FFD700', 1);
    drawTextCentered(ctx, 'CORRI ALTERNANDO ← E → SU PC',
                     W / 2, insY + 14, '#FFFFFF', 1);
    drawTextCentered(ctx, 'O I DUE TASTI ROSSI SU MOBILE',
                     W / 2, insY + 24, '#FFFFFF', 1);
    drawTextCentered(ctx, 'PRESS [R] O IL BICCHIERE PER L\'ACQUA',
                     W / 2, insY + 34, '#88FFCC', 1);

    drawTextCentered(ctx, this.game.profile.name.toUpperCase(),
                     W / 2, H - 14, '#88FFCC', 1);
  }
}
