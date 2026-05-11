// src/scenes/ChampionshipHubScene.js
// HUB del Campionato ATRS 2026.
// Mostra i 6 eventi in ordine cronologico fisso, con stato:
// - DA GIOCARE (solo l'evento corrente, altri locked)
// - COMPLETATA con tempo + punteggio
// - SKIPPATA (mollata, 0 pt)
// In alto: punteggio cumulato e progresso.
// Pulsanti: VAI ALLA GARA (per evento corrente) / RIVEDI RIEPILOGO (a fine campionato) / RESET CAMPIONATO

import { drawText, drawTextCentered, drawTextShadow } from '../ui/PixelFont.js';
import { drawLogo, drawAtrsBackground } from '../ui/Branding.js';
import { GameState } from '../core/Game.js';
import { loadChampionship, resetChampionship, championshipSummary } from '../systems/Championship.js';

export class ChampionshipHubScene {
  constructor(game) {
    this.game = game;
    this.state = loadChampionship();
    this.confirmReset = false;
  }

  enter() {
    // ricarico in caso sia tornato qui dopo una gara
    this.state = loadChampionship();
  }
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
      // pulsante reset (in basso a destra, sopra il banner FUGA)
      if (c.x > W - 100 && c.x < W - 8 && c.y > H - 48 && c.y < H - 32) {
        if (this.confirmReset) {
          resetChampionship();
          this.state = loadChampionship();
          this.confirmReset = false;
          this.game.audio.beep(220, 0.15);
        } else {
          this.confirmReset = true;
          // auto-reset confirm dopo 3 secondi
          setTimeout(() => { this.confirmReset = false; }, 3000);
        }
        return;
      }
      // pulsante "RIVEDI RIEPILOGO" (solo se stagione completa) - bottom center
      if (this.state.seasonComplete && c.x > W/2 - 60 && c.x < W/2 + 60 && c.y > H - 22 && c.y < H - 6) {
        this.game.changeState(GameState.CHAMPIONSHIP_FINAL, { state: this.state });
        return;
      }
      // ogni evento: card alta 30px (densità maggiore di EventSelect per stare in 6 = 180px)
      for (let i = 0; i < events.length; i++) {
        const cardY = 50 + i * 30;
        const isCurrent = i === this.state.currentEventIndex;
        if (c.x > 8 && c.x < W - 8 && c.y > cardY && c.y < cardY + 28) {
          if (isCurrent && !this.state.seasonComplete) {
            // Vai alla gara: scegli distanza
            const ev = events[i];
            this.game.audio.beep(700, 0.07);
            if (ev.distances.length === 1) {
              this._launchRace(ev, ev.distances[0]);
            } else {
              this.game.changeState(GameState.DISTANCE_SELECT, {
                mode: 'championship',
                event: ev,
              });
            }
          }
          return;
        }
      }
    }
  }

  _launchRace(event, distance) {
    const payload = {
      trackFile: distance.file,
      trackId: distance.id,
      trackName: distance.name,
      trackLabel: distance.label,
      eventId: event.id,
      eventName: event.name,
      eventLogo: event.logo,
      scoreBonus: distance.score_bonus,
      placeholder: distance.placeholder,
      mode: 'championship',
    };
    // Se il character è già stato scelto (gara 2+ del campionato), salto CharacterScene
    if (this.state.character) {
      // Carico il track e vado dritto a RACE con character salvato
      this._launchDirectRace(payload);
    } else {
      // Prima gara → CharacterScene normale (per scegliere)
      this.game.changeState(GameState.CHARACTER, payload);
    }
  }

  async _launchDirectRace(payload) {
    // Carica track
    const { loadTrack } = await import('../core/Track.js');
    try {
      const track = await loadTrack('tracks/' + payload.trackFile);
      this.game.changeState(GameState.RACE, {
        trackData: track,
        character: this.state.character,
        ...payload,
      });
    } catch (e) {
      console.error('Errore caricamento track:', e);
      // fallback: vai a CharacterScene
      this.game.changeState(GameState.CHARACTER, payload);
    }
  }

  render(ctx) {
    const W = this.game.virtualW;
    const H = this.game.virtualH;
    drawAtrsBackground(ctx, W, H);

    drawTextShadow(ctx, '< BACK', 8, 8, '#FFFFFF', '#000', 1);
    drawTextCentered(ctx, 'CAMPIONATO ATRS 2026', W / 2, 8, '#FFD700', 2);

    // riga progresso
    const completedCount = Object.values(this.state.completedEvents).filter(e => e.completed).length;
    const skippedCount = Object.values(this.state.completedEvents).filter(e => !e.completed).length;
    const totalDone = completedCount + skippedCount;
    drawTextCentered(ctx,
      `PROGRESSO: ${totalDone}/6 EVENTI   SCORE: ${this.state.totalScore} PT`,
      W / 2, 28, '#88FFCC', 1);
    if (totalDone > 0) {
      drawTextCentered(ctx,
        `(${completedCount} completate, ${skippedCount} mollate)`,
        W / 2, 38, '#888899', 1);
    }

    const events = this.game.manifest.events || [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const cardY = 50 + i * 30;
      const isCurrent = i === this.state.currentEventIndex && !this.state.seasonComplete;
      const isPast = i < this.state.currentEventIndex;
      const isFuture = i > this.state.currentEventIndex;
      const evResult = this.state.completedEvents[ev.id];

      // sfondo card
      let bg = '#16162A', border = '#444466', textColor = '#666688';
      if (isCurrent) {
        bg = '#2E4E1A'; border = '#88FF88'; textColor = '#FFFFFF';
      } else if (isPast && evResult) {
        bg = evResult.completed ? '#1A2E1A' : '#3a1818';
        border = evResult.completed ? '#3CC23C' : '#806060';
        textColor = '#CCCCCC';
      }
      ctx.fillStyle = bg;
      ctx.fillRect(8, cardY, W - 16, 28);
      ctx.strokeStyle = border;
      ctx.lineWidth = isCurrent ? 2 : 1;
      ctx.strokeRect(8.5, cardY + 0.5, W - 17, 27);

      // logo evento
      if (ev.logo) {
        drawLogo(ctx, ev.logo, 10, cardY + 2, 24);
      }
      // nome evento + data (sposto un po' a destra per il logo più grande)
      drawText(ctx, ev.name.toUpperCase(), 38, cardY + 4, textColor, 1);
      drawText(ctx, ev.date, 38, cardY + 16, isCurrent ? '#FFD700' : '#888899', 1);

      // stato
      if (isCurrent) {
        drawText(ctx, '► PROSSIMA GARA', W - 90, cardY + 4, '#FFD700', 1);
        // mostra stamina di partenza
        drawText(ctx, `STA: ${this.state.carryStamina}`,
                 W - 90, cardY + 16, '#88FFCC', 1);
      } else if (isPast && evResult) {
        if (evResult.completed) {
          const m = Math.floor(evResult.timeSec / 60);
          const s = Math.floor(evResult.timeSec % 60);
          const cs = Math.floor((evResult.timeSec * 100) % 100);
          drawText(ctx, `${m}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`,
                   W - 100, cardY + 4, '#3CFF3C', 1);
          drawText(ctx, `${evResult.score} PT`, W - 100, cardY + 16, '#FFD700', 1);
        } else {
          drawText(ctx, 'MOLLATA', W - 80, cardY + 4, '#FF6060', 1);
          drawText(ctx, '0 PT', W - 80, cardY + 16, '#888888', 1);
        }
      } else if (isFuture) {
        drawText(ctx, 'BLOCCATA', W - 80, cardY + 8, '#444466', 1);
      }
    }

    // bottone reset (sempre disponibile, sopra il banner FUGA per non sovrapporsi)
    const resetX = W - 100, resetY = H - 46;
    ctx.fillStyle = this.confirmReset ? '#A03020' : '#3a2c1e';
    ctx.fillRect(resetX, resetY, 92, 14);
    ctx.strokeStyle = this.confirmReset ? '#FF6060' : '#666';
    ctx.lineWidth = 1;
    ctx.strokeRect(resetX + 0.5, resetY + 0.5, 91, 13);
    drawTextCentered(ctx, this.confirmReset ? 'CONFERMA RESET' : 'RESET',
                     resetX + 46, resetY + 4, '#FFFFFF', 1);

    // bottone "RIVEDI RIEPILOGO" se stagione completa
    if (this.state.seasonComplete) {
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(W/2 - 60, H - 20, 120, 14);
      drawTextCentered(ctx, 'VEDI RIEPILOGO', W/2, H - 16, '#000000', 1);
    }
  }
}
