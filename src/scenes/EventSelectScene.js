// src/scenes/EventSelectScene.js
// Schermata di selezione evento (per modalità Singola).
// Mostra i 6 eventi con logo, data, location, n° distanze.

import { drawText, drawTextCentered, drawTextShadow } from '../ui/PixelFont.js';
import { drawLogo, drawAtrsBackground } from '../ui/Branding.js';
import { GameState } from '../core/Game.js';

export class EventSelectScene {
  constructor(game, payload = {}) {
    this.game = game;
    this.mode = payload.mode || 'single';  // 'single' o 'championship_browse'
    this.scrollY = 0;
  }

  enter() {}
  exit() {}

  update(dt) {
    const W = this.game.virtualW;
    const H = this.game.virtualH;
    const events = this.game.manifest.events || [];

    for (const c of this.game.input.menuClicks) {
      if (c.x < 40 && c.y < 24) {
        this.game.changeState(GameState.MODE_SELECT);
        return;
      }
      // ogni evento è una "card" alta 42px, layout verticale
      for (let i = 0; i < events.length; i++) {
        const cardY = 32 + i * 46;
        if (c.x > 8 && c.x < W - 8 && c.y > cardY && c.y < cardY + 42) {
          const ev = events[i];
          this.game.audio.beep(700, 0.06);
          if (ev.distances.length === 1) {
            // Una sola distanza → vai diretto a CHARACTER
            this._launchRace(ev, ev.distances[0]);
          } else {
            // Più distanze → DISTANCE_SELECT
            this.game.changeState(GameState.DISTANCE_SELECT, {
              mode: this.mode,
              event: ev,
            });
          }
          return;
        }
      }
    }
  }

  _launchRace(event, distance) {
    this.game.changeState(GameState.CHARACTER, {
      trackFile: distance.file,
      trackId: distance.id,
      trackName: distance.name,
      trackLabel: distance.label,
      eventId: event.id,
      eventName: event.name,
      eventLogo: event.logo,
      scoreBonus: distance.score_bonus,
      placeholder: distance.placeholder,
      mode: this.mode,
    });
  }

  render(ctx) {
    const W = this.game.virtualW;
    const H = this.game.virtualH;
    drawAtrsBackground(ctx, W, H);

    drawTextShadow(ctx, '< BACK', 8, 8, '#FFFFFF', '#000', 1);
    drawTextCentered(ctx, 'CALENDARIO ATRS 2026', W / 2, 8, '#FFD700', 2);

    const events = this.game.manifest.events || [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const cardY = 32 + i * 46;
      // sfondo card
      ctx.fillStyle = '#1A1A2E';
      ctx.fillRect(8, cardY, W - 16, 42);
      ctx.strokeStyle = '#444466';
      ctx.lineWidth = 1;
      ctx.strokeRect(8.5, cardY + 0.5, W - 17, 41);
      // logo evento
      if (ev.logo) {
        drawLogo(ctx, ev.logo, 12, cardY + 5, 32);
      }
      // testo
      drawText(ctx, ev.name.toUpperCase(), 50, cardY + 6, '#FFFFFF', 1);
      drawText(ctx, ev.location, 50, cardY + 18, '#88BBFF', 1);
      drawText(ctx, ev.date, W - 80, cardY + 6, '#FFD700', 1);
      // n° distanze
      const ndist = ev.distances.length;
      const distLabel = ndist === 1
        ? `${ev.distances[0].label}`
        : `${ndist} distanze: ${ev.distances.map(d => d.label).join(' / ')}`;
      drawText(ctx, distLabel, 50, cardY + 30, '#AACCFF', 1);
      // numero ordine (1-6)
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(W - 24, cardY + 28, 14, 12);
      drawTextCentered(ctx, String(ev.order), W - 17, cardY + 30, '#000000', 1);
    }
  }
}
