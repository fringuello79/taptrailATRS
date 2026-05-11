// src/scenes/DistanceSelectScene.js
// Per eventi con più distanze: scelta upfront di quale correre.
// Mostra distanza in km, dislivello, classificazione UTMB e bonus punteggio.

import { drawText, drawTextCentered, drawTextShadow } from '../ui/PixelFont.js';
import { drawLogo, drawAtrsBackground } from '../ui/Branding.js';
import { GameState } from '../core/Game.js';
import { loadChampionship } from '../systems/Championship.js';

export class DistanceSelectScene {
  constructor(game, payload) {
    this.game = game;
    this.event = payload.event;
    this.mode = payload.mode || 'single';
  }

  enter() {}
  exit() {}

  update(dt) {
    const W = this.game.virtualW;
    const H = this.game.virtualH;
    const dists = this.event.distances || [];

    for (const c of this.game.input.menuClicks) {
      if (c.x < 40 && c.y < 24) {
        // back: torna a EVENT_SELECT (single) o CHAMPIONSHIP_HUB (champ)
        if (this.mode === 'single') {
          this.game.changeState(GameState.EVENT_SELECT, { mode: 'single' });
        } else {
          this.game.changeState(GameState.CHAMPIONSHIP_HUB);
        }
        return;
      }
      for (let i = 0; i < dists.length; i++) {
        const cardY = 64 + i * 56;
        if (c.x > 8 && c.x < W - 8 && c.y > cardY && c.y < cardY + 50) {
          const d = dists[i];
          this.game.audio.beep(820, 0.07);
          const payload = {
            trackFile: d.file,
            trackId: d.id,
            trackName: d.name,
            trackLabel: d.label,
            eventId: this.event.id,
            eventName: this.event.name,
            eventLogo: this.event.logo,
            scoreBonus: d.score_bonus,
            placeholder: d.placeholder,
            mode: this.mode,
          };
          // Se in modalità campionato e character già scelto, vai dritto a RACE
          if (this.mode === 'championship') {
            const champState = loadChampionship();
            if (champState.character) {
              this._launchDirect(payload, champState.character);
              return;
            }
          }
          this.game.changeState(GameState.CHARACTER, payload);
          return;
        }
      }
    }
  }

  async _launchDirect(payload, character) {
    const { loadTrack } = await import('../core/Track.js');
    try {
      const track = await loadTrack('tracks/' + payload.trackFile);
      this.game.changeState(GameState.RACE, {
        trackData: track,
        character,
        ...payload,
      });
    } catch (e) {
      console.error('Errore caricamento track:', e);
      this.game.changeState(GameState.CHARACTER, payload);
    }
  }

  render(ctx) {
    const W = this.game.virtualW;
    const H = this.game.virtualH;
    drawAtrsBackground(ctx, W, H);

    drawTextShadow(ctx, '< BACK', 8, 8, '#FFFFFF', '#000', 1);
    drawTextCentered(ctx, 'SCEGLI LA DISTANZA', W / 2, 8, '#FFD700', 2);

    // header evento
    if (this.event.logo) {
      drawLogo(ctx, this.event.logo, 12, 26, 32);
    }
    drawText(ctx, this.event.name.toUpperCase(), 50, 28, '#FFFFFF', 1);
    drawText(ctx, this.event.location + '  ' + this.event.date, 50, 42, '#88BBFF', 1);

    const dists = this.event.distances || [];
    for (let i = 0; i < dists.length; i++) {
      const d = dists[i];
      const cardY = 64 + i * 56;
      // sfondo card colorato in base al bonus UTMB
      let bg = '#1A2E1A', border = '#88FF88';  // 0 bonus = verde tenue
      if (d.score_bonus === 20) { bg = '#1A2E4E'; border = '#88BBFF'; }   // UTMB 20K = blu
      if (d.score_bonus === 40) { bg = '#4E1A2E'; border = '#FF88BB'; }   // UTMB 50K = viola
      ctx.fillStyle = bg;
      ctx.fillRect(8, cardY, W - 16, 50);
      ctx.strokeStyle = border;
      ctx.lineWidth = 2;
      ctx.strokeRect(9, cardY + 1, W - 18, 48);

      // nome
      drawText(ctx, d.name.toUpperCase() + ' ' + d.label, 16, cardY + 6, '#FFFFFF', 1);
      // dati gara
      drawText(ctx, `${d.distance_km} KM   ${d.elevation_gain_m} M D+`,
               16, cardY + 20, '#FFD700', 1);
      // classificazione ITRA / UTMB
      let utmbLabel = 'GARA CORTA';
      if (d.utmb_category === '20K') utmbLabel = 'UTMB 20K (ITRA ' + d.itra + ')';
      if (d.utmb_category === '50K') utmbLabel = 'UTMB 50K (ITRA ' + d.itra + ')';
      drawText(ctx, utmbLabel, 16, cardY + 32, '#AACCFF', 1);
      // bonus punteggio
      const bonusText = d.score_bonus > 0 ? `+${d.score_bonus} PT` : 'BASE';
      drawText(ctx, 'BONUS: ' + bonusText, W - 80, cardY + 32, '#FFEEAA', 1);
      // placeholder warning
      if (d.placeholder) {
        ctx.fillStyle = '#705820';
        ctx.fillRect(W - 70, cardY + 6, 60, 10);
        drawTextCentered(ctx, '*GPX TEMP', W - 40, cardY + 8, '#FFD700', 1);
      }
    }
  }
}
