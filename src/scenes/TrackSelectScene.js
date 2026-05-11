// src/scenes/TrackSelectScene.js
// Selezione della gara: lista delle tracks dal manifest, con stato unlock,
// distanza e dislivello. La track 1 (Alba dei Marsi) è disponibile, le altre "in arrivo".

import { drawText, drawTextCentered, drawTextShadow } from '../ui/PixelFont.js';
import { BrandColors, drawLogo } from '../ui/Branding.js';
import { GameState } from '../core/Game.js';
import { loadTrack } from '../core/Track.js';

export class TrackSelectScene {
  constructor(game) {
    this.game = game;
    // Compat: il manifest ora usa events[].distances[].
    // Estraggo flat per retrocompat con questa scena legacy.
    const events = game.manifest.events || [];
    if (events.length) {
      this.tracks = [];
      for (const ev of events) {
        for (const d of (ev.distances || [])) {
          this.tracks.push({
            id: d.id,
            file: d.file,
            name: `${ev.name} ${d.label}`,
            location: ev.location,
            distance_km: d.distance_km,
            elevation_gain_m: d.elevation_gain_m,
            difficulty: 'medio',
            unlocked: !d.placeholder,
            order: ev.order,
          });
        }
      }
    } else {
      this.tracks = game.manifest.tracks || [];
    }
    this.selected = 0;
    this.weather = 'clear_dawn';
    this._handleKey = (e) => {
      if (e.code === 'ArrowDown' || e.code === 'KeyJ') this._select(1);
      else if (e.code === 'ArrowUp' || e.code === 'KeyK') this._select(-1);
      else if (e.code === 'Enter') this._confirm();
      else if (e.code === 'Escape') this.game.changeState(GameState.MENU);
    };
    window.addEventListener('keydown', this._handleKey);
  }

  exit() {
    window.removeEventListener('keydown', this._handleKey);
  }

  _select(d) {
    let i = (this.selected + d + this.tracks.length) % this.tracks.length;
    this.selected = i;
    this.game.audio.beep(500, 0.04);
  }

  async _confirm() {
    const t = this.tracks[this.selected];
    if (!t.unlocked || !t.file) {
      this.game.audio.beep(200, 0.15, 'sawtooth');
      return;
    }
    this.game.audio.beep(880, 0.1);
    // carico track e vado a CharacterScene
    try {
      const track = await loadTrack(`tracks/${t.file}`);
      // imposta meteo eventualmente customizzato
      track.weather = this.weather;
      this.game.changeState(GameState.CHARACTER, { trackData: track });
    } catch (e) {
      console.error(e);
      alert('Errore caricamento traccia: ' + e.message);
    }
  }

  update(dt) {
    const W = this.game.virtualW;
    // gestione click sulle righe
    for (const c of this.game.input.menuClicks) {
      const startY = 60;
      const rowH = 28;
      for (let i = 0; i < this.tracks.length; i++) {
        const ry = startY + i * rowH;
        if (c.x > 30 && c.x < W - 30 && c.y > ry && c.y < ry + rowH - 4) {
          this.selected = i;
          this._confirm();
        }
      }
      // bottone meteo in alto a destra
      if (c.x > W - 100 && c.x < W - 8 && c.y > 6 && c.y < 24) {
        this._cycleWeather();
      }
      // back
      if (c.x < 40 && c.y < 24) {
        this.game.changeState(GameState.MENU);
      }
    }
  }

  _cycleWeather() {
    const order = ['clear_dawn', 'day_clear', 'cloudy', 'fog_summit', 'dusk', 'rain_light'];
    const i = order.indexOf(this.weather);
    this.weather = order[(i + 1) % order.length];
    this.game.audio.beep(640, 0.06);
  }

  render(ctx) {
    const W = this.game.virtualW;
    const H = this.game.virtualH;
    // sfondo blu navy
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, BrandColors.navyDark);
    grad.addColorStop(1, BrandColors.navy);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    drawTextShadow(ctx, '< BACK', 8, 8, BrandColors.white, BrandColors.black, 1);
    drawTextCentered(ctx, 'SELEZIONA GARA', W / 2, 8, BrandColors.green, 2);

    // bottone meteo (palette brand)
    ctx.fillStyle = BrandColors.navyDark;
    ctx.fillRect(W - 100, 6, 92, 18);
    ctx.fillStyle = BrandColors.green;
    ctx.fillRect(W - 100, 6, 3, 18);
    ctx.fillRect(W - 11, 6, 3, 18);
    ctx.strokeStyle = BrandColors.white;
    ctx.strokeRect(W - 99.5, 6.5, 91, 17);
    drawTextCentered(ctx, this.weather.replace('_', ' ').toUpperCase(),
                     W - 54, 12, BrandColors.white, 1);

    // Logo Alba dei Marsi (track selezionata, se è L'Alba)
    const sel = this.tracks[this.selected];
    if (sel && sel.id === 'alba-dei-marsi-21k') {
      drawLogo(ctx, 'assets/logos/alba_marsi.png', W - 150, 30, 140);
    }

    drawText(ctx, 'CIRCUITO: ABRUZZO TRAIL RUN SERIES', 30, 36, BrandColors.greenLight, 1);

    const startY = 60;
    const rowH = 26;
    for (let i = 0; i < this.tracks.length; i++) {
      const t = this.tracks[i];
      const ry = startY + i * rowH;
      const isSel = i === this.selected;
      ctx.fillStyle = isSel ? BrandColors.navyLight : BrandColors.navyDark;
      ctx.fillRect(20, ry, W - 140, rowH - 4);
      // bordo verde quando selezionata
      if (isSel) {
        ctx.fillStyle = BrandColors.green;
        ctx.fillRect(20, ry, 3, rowH - 4);
      }
      ctx.strokeStyle = isSel ? BrandColors.green : BrandColors.white;
      ctx.lineWidth = 1;
      ctx.strokeRect(20.5, ry + 0.5, W - 141, rowH - 5);

      // numero
      drawText(ctx, `${i + 1}.`, 28, ry + 4, BrandColors.green, 1);
      const nameColor = t.unlocked ? BrandColors.white : '#7080a0';
      drawText(ctx, t.name.toUpperCase(), 46, ry + 4, nameColor, 1);

      if (t.unlocked) {
        const info = `${t.distance_km} KM   D+${t.elevation_gain_m}M   ${t.difficulty.toUpperCase()}`;
        drawText(ctx, info, 46, ry + 13, BrandColors.greenLight, 1);
      } else {
        drawText(ctx, 'IN ARRIVO - DROP GPX IN tracks/', 46, ry + 13, '#7080a0', 1);
      }

      // status
      if (t.unlocked) {
        ctx.fillStyle = BrandColors.green;
        ctx.fillRect(W - 152, ry + 8, 8, 8);
      } else {
        ctx.fillStyle = '#3a4870';
        ctx.fillRect(W - 152, ry + 8, 8, 8);
        ctx.fillStyle = '#a0b0c8';
        ctx.fillRect(W - 150, ry + 9, 4, 1);
        ctx.fillRect(W - 150, ry + 12, 4, 3);
      }
    }

    drawTextCentered(ctx, '(FRECCE/CLICK SELEZIONA - INVIO CONFERMA)',
                     W / 2, H - 12, BrandColors.greenLight, 1);
  }
}
