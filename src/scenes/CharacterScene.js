// src/scenes/CharacterScene.js
// Selezione del personaggio: genere e colore maglia, con anteprima sprite animata.

import { drawText, drawTextCentered, drawTextShadow } from '../ui/PixelFont.js';
import { RunnerSprite } from '../entities/RunnerSprite.js';
import { drawLogo, drawAtrsBackground } from '../ui/Branding.js';
import { GameState } from '../core/Game.js';
import { loadTrack } from '../core/Track.js';
import { loadChampionship, saveChampionship } from '../systems/Championship.js';

// Colori disponibili (italiano, coerenti con SHIRT_COLORS in RunnerSprite.js).
// Il vecchio codice profili usa termini inglesi: il RunnerSprite li mappa
// automaticamente, quindi nessuna migrazione necessaria.
const COLORS = ['rosso', 'blu', 'verde', 'giallo', 'bianco'];

export class CharacterScene {
  constructor(game, payload) {
    this.game = game;
    // Compatibilità: il payload può contenere `trackData` (oggetto già caricato)
    // OPPURE `trackFile` (path al JSON da caricare).
    this.track = payload && payload.trackData ? payload.trackData : null;
    this.trackFile = payload && payload.trackFile ? payload.trackFile : null;
    // Metadati ATRS (passati dalle nuove scene)
    this.eventId = payload && payload.eventId || null;
    this.eventName = payload && payload.eventName || null;
    this.eventLogo = payload && payload.eventLogo || null;
    this.scoreBonus = payload && typeof payload.scoreBonus === 'number' ? payload.scoreBonus : 0;
    this.placeholder = payload && payload.placeholder || false;
    this.trackName = payload && payload.trackName || null;
    this.trackLabel = payload && payload.trackLabel || null;
    this.mode = payload && payload.mode || 'single';  // 'single' | 'championship'

    if (!this.track && this.trackFile) {
      // Carica il JSON track in modo asincrono
      this._loadTrack(this.trackFile);
    }
    if (!this.track && !this.trackFile) {
      console.error('CharacterScene: track mancante nel payload', payload);
    }

    // dal profilo
    this.gender = game.profile.gender || 'male';
    this.shirtColor = game.profile.shirtColor || 'rosso';
    // Migrazione automatica termini inglesi → italiano:
    const ALIAS = { red: 'rosso', blue: 'blu', green: 'verde',
                    yellow: 'giallo', white: 'bianco', black: 'blu' };
    if (ALIAS[this.shirtColor]) this.shirtColor = ALIAS[this.shirtColor];
    if (!COLORS.includes(this.shirtColor)) {
      this.shirtColor = 'rosso';
    }
    this.name = game.profile.name || 'RUNNER';

    this.preview = new RunnerSprite(this.gender, this.shirtColor);
    this.t = 0;

    this._handleKey = (e) => {
      if (e.code === 'KeyM') { this.gender = 'male'; this._refresh(); }
      else if (e.code === 'KeyF') { this.gender = 'female'; this._refresh(); }
      else if (e.code === 'ArrowLeft') this._cycleColor(-1);
      else if (e.code === 'ArrowRight') this._cycleColor(1);
      else if (e.code === 'Enter') this._start();
      else if (e.code === 'Escape') this._goBack();
    };
    window.addEventListener('keydown', this._handleKey);
  }

  _goBack() {
    if (this.mode === 'championship') {
      this.game.changeState(GameState.CHAMPIONSHIP_HUB);
    } else if (this.eventId) {
      // venivamo da EventSelect / DistanceSelect
      this.game.changeState(GameState.EVENT_SELECT, { mode: 'single' });
    } else {
      this.game.changeState(GameState.TRACK_SELECT);
    }
  }

  async _loadTrack(file) {
    try {
      this.track = await loadTrack('tracks/' + file);
    } catch (e) {
      console.error('Errore caricamento track:', e);
    }
  }

  exit() {
    window.removeEventListener('keydown', this._handleKey);
  }

  _refresh() {
    this.preview.setGenderShirt(this.gender, this.shirtColor);
    this.game.audio.beep(640, 0.05);
  }

  _cycleColor(d) {
    const i = COLORS.indexOf(this.shirtColor);
    this.shirtColor = COLORS[(i + d + COLORS.length) % COLORS.length];
    this._refresh();
  }

  _start() {
    if (!this.track) {
      this.game.audio.beep(220, 0.10, 'sawtooth');
      return;
    }
    this.game.profile.gender = this.gender;
    this.game.profile.shirtColor = this.shirtColor;
    this.game.profile.name = this.name;
    this.game.storage.saveProfile(this.game.profile);

    const character = { gender: this.gender, shirtColor: this.shirtColor, name: this.name };

    // Modalità campionato: salva il personaggio nello stato (locked per tutta la stagione)
    if (this.mode === 'championship') {
      const cs = loadChampionship();
      cs.character = character;
      saveChampionship(cs);
    }

    this.game.audio.beep(880, 0.1);
    this.game.changeState(GameState.RACE, {
      trackData: this.track,
      character,
      eventId: this.eventId,
      eventName: this.eventName,
      eventLogo: this.eventLogo,
      scoreBonus: this.scoreBonus,
      placeholder: this.placeholder,
      trackName: this.trackName,
      trackLabel: this.trackLabel,
      mode: this.mode,
    });
  }

  update(dt) {
    this.t += dt;
    this.preview.update(dt, 0.6); // anim sempre attiva nell'anteprima
    const W = this.game.virtualW;
    const H = this.game.virtualH;
    for (const c of this.game.input.menuClicks) {
      // M (y 112-132 dopo spostamento per logo)
      if (c.x > 30 && c.x < 130 && c.y > 112 && c.y < 132) {
        this.gender = 'male'; this._refresh();
      }
      // F (y 137-157)
      if (c.x > 30 && c.x < 130 && c.y > 137 && c.y < 157) {
        this.gender = 'female'; this._refresh();
      }
      // colori (y 180-198)
      if (c.y > 180 && c.y < 198) {
        for (let i = 0; i < COLORS.length; i++) {
          const cx = W / 2 - 70 + i * 30;
          if (c.x > cx && c.x < cx + 24) {
            this.shirtColor = COLORS[i];
            this._refresh();
          }
        }
      }
      // start button
      if (c.x > W / 2 - 50 && c.x < W / 2 + 50 && c.y > H - 40 && c.y < H - 20) {
        this._start();
      }
      // back
      if (c.x < 40 && c.y < 24) this.game.changeState(GameState.TRACK_SELECT);
    }
  }

  render(ctx) {
    const W = this.game.virtualW;
    const H = this.game.virtualH;
    drawAtrsBackground(ctx, W, H);

    drawTextShadow(ctx, '< BACK', 8, 8, '#FFFFFF', '#000', 1);
    drawTextCentered(ctx, 'PERSONAGGIO', W / 2, 8, '#FFD700', 2);

    if (this.track || this.eventLogo) {
      // Preferisco eventLogo (passato dal payload nuovo). Fallback: alba_marsi.
      const logoPath = this.eventLogo || (this.track && this.track.id === 'alba-dei-marsi-21k'
        ? 'assets/logos/alba_marsi.png' : null);
      if (logoPath) {
        drawLogo(ctx, logoPath, W / 2 - 35, 22, 70);
      } else if (this.track) {
        drawTextCentered(ctx, `GARA: ${this.track.name.toUpperCase()}`, W / 2, 30, '#88FFCC', 1);
      }
      // Sotto il logo: nome gara + label distanza
      const labelText = this.trackName && this.trackLabel
        ? `${this.trackName.toUpperCase()} ${this.trackLabel}`
        : (this.track ? this.track.name.toUpperCase() : '');
      drawTextCentered(ctx, labelText, W / 2, 92, '#88FFCC', 1);
      // mode badge
      if (this.mode === 'championship') {
        drawTextCentered(ctx, '** CAMPIONATO **', W / 2, 4, '#FFD700', 1);
      }
    }

    // riquadro genere (spostato più in basso per far spazio al logo)
    drawText(ctx, 'GENERE', 30, 100, '#FFD700', 1);
    const genders = [['M', 'male'], ['F', 'female']];
    for (let i = 0; i < genders.length; i++) {
      const [lbl, val] = genders[i];
      const sel = this.gender === val;
      const by = 112 + i * 25;
      ctx.fillStyle = sel ? '#2A2A4E' : '#16162A';
      ctx.fillRect(30, by, 100, 20);
      ctx.strokeStyle = sel ? '#FFD700' : '#666';
      ctx.strokeRect(30.5, by + 0.5, 99, 19);
      drawText(ctx, val.toUpperCase() + ` (${lbl})`, 38, by + 6, '#FFFFFF', 1);
    }

    // colori (spostati anche)
    drawText(ctx, 'MAGLIA', 30, 168, '#FFD700', 1);
    for (let i = 0; i < COLORS.length; i++) {
      const cx = W / 2 - 70 + i * 30;
      const swatch = colorSwatch(COLORS[i]);
      ctx.fillStyle = swatch;
      ctx.fillRect(cx, 180, 24, 18);
      ctx.strokeStyle = this.shirtColor === COLORS[i] ? '#FFD700' : '#000';
      ctx.lineWidth = this.shirtColor === COLORS[i] ? 2 : 1;
      ctx.strokeRect(cx + 0.5, 180.5, 23, 17);
    }
    ctx.lineWidth = 1;

    // anteprima sprite (a destra, leggermente in basso)
    const px = W - 110;
    const py = 100;
    ctx.fillStyle = '#1A1A2E';
    ctx.fillRect(px - 8, py - 8, 96, 96);
    ctx.strokeStyle = '#FFFFFF';
    ctx.strokeRect(px - 7.5, py - 7.5, 95, 95);
    ctx.fillStyle = '#5A7C2E';
    ctx.fillRect(px - 8, py + 79, 96, 9);
    this.preview.draw(ctx, px + 8, py + 4, 2);

    // start
    const sx = W / 2 - 50;
    const sy = H - 40;
    const ready = !!this.track;
    ctx.fillStyle = ready ? '#3CC23C' : '#666666';
    ctx.fillRect(sx, sy, 100, 20);
    ctx.strokeStyle = '#FFFFFF';
    ctx.strokeRect(sx + 0.5, sy + 0.5, 99, 19);
    drawTextCentered(ctx, ready ? 'INIZIA GARA!' : 'CARICAMENTO...',
                     W / 2, sy + 6, '#000000', 1);

    drawTextCentered(ctx, '(M/F GENERE - FRECCE COLORE - INVIO START)',
                     W / 2, H - 12, '#888888', 1);
  }
}

function colorSwatch(c) {
  return ({
    rosso:  '#D73232',  red:    '#D73232',
    blu:    '#3C78DC',  blue:   '#3C78DC',
    verde:  '#37AA4B',  green:  '#37AA4B',
    giallo: '#F0D732',  yellow: '#F0D732',
    bianco: '#F5F5F5',  white:  '#F5F5F5',
  })[c] || '#FFFFFF';
}
