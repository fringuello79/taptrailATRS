// src/scenes/MenuScene.js
// Menu principale ATRS branded: blu navy + verde + bianco.
// Logo ATRS in vista, runner silhouette, montagne stilizzate sullo sfondo.

import { drawText, drawTextCentered, drawTextShadow, textWidth } from '../ui/PixelFont.js';
import { BrandColors, drawLogo, drawAtrsBanner } from '../ui/Branding.js';
import { GameState } from '../core/Game.js';

export class MenuScene {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.buttons = [
      { label: 'GIOCA',                                         action: () => this.game.changeState(GameState.MODE_SELECT) },
      { label: 'CLASSIFICA',                                    action: () => this.game.changeState(GameState.LEADERBOARD) },
      { label: 'PROFILO',                                       action: () => this._editProfile() },
      { label: () => `GHOST: ${this.game.profile.ghostEnabled ? 'ON' : 'OFF'}`, dyn: 'ghost', action: () => this._toggleGhost() },
      { label: () => `AUDIO: ${this.game.audio.muted ? 'OFF' : 'ON'}`,          dyn: 'audio', action: () => this._toggleAudio() },
    ];
  }

  _toggleGhost() {
    this.game.profile.ghostEnabled = !this.game.profile.ghostEnabled;
    this.game.storage.saveProfile(this.game.profile);
    this.game.audio.beep(this.game.profile.ghostEnabled ? 880 : 440, 0.1);
  }

  _editProfile() {
    const cur = this.game.profile.name || 'RUNNER';
    const newName = prompt('Nome del runner:', cur);
    if (newName) {
      this.game.profile.name = newName.toUpperCase().slice(0, 12);
      this.game.storage.saveProfile(this.game.profile);
    }
  }

  _toggleAudio() {
    this.game.audio.muted = !this.game.audio.muted;
    if (!this.game.audio.muted) this.game.audio.beep(880, 0.1);
  }

  update(dt) {
    this.t += dt;
    const W = this.game.virtualW;
    const startY = 100;
    const btnH = 22;
    const btnW = 160;
    const bx = W / 2 + 20;
    for (const click of this.game.input.menuClicks) {
      for (let i = 0; i < this.buttons.length; i++) {
        const by = startY + i * (btnH + 5);
        if (click.x >= bx && click.x <= bx + btnW
            && click.y >= by && click.y <= by + btnH) {
          this.game.audio.beep(700, 0.05);
          this.buttons[i].action();
        }
      }
    }
  }

  _drawMountainSilhouette(ctx, y, color, seed) {
    // catena di montagne in basso, palette in linea con il brand
    const W = this.game.virtualW;
    let s = seed >>> 0;
    const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, this.game.virtualH);
    let x = 0;
    while (x < W + 10) {
      const peak = rng() * 25 + 10;
      x += 18;
      ctx.lineTo(x, y - peak);
    }
    ctx.lineTo(W, this.game.virtualH);
    ctx.closePath();
    ctx.fill();
  }

  render(ctx) {
    const W = this.game.virtualW;
    const H = this.game.virtualH;

    // sfondo: gradiente blu navy ATRS
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, BrandColors.navyDark);
    grad.addColorStop(0.6, BrandColors.navy);
    grad.addColorStop(1, BrandColors.navyLight);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // stelle
    for (let i = 0; i < 50; i++) {
      const x = (i * 73) % W;
      const y = (i * 37) % (H * 0.5);
      const flicker = Math.sin(this.t * 3 + i) > 0.6;
      ctx.fillStyle = flicker ? '#FFFFFF' : '#A0B8E0';
      ctx.fillRect(x, y, 1, 1);
    }

    // bagliore verde a destra
    const sx = W * 0.78;
    const sy = H * 0.4;
    ctx.fillStyle = BrandColors.green;
    ctx.globalAlpha = 0.15;
    for (let r = 36; r > 0; r -= 2) {
      for (let dy = -r; dy <= r; dy++) {
        const dx = Math.floor(Math.sqrt(r * r - dy * dy));
        ctx.fillRect(Math.floor(sx - dx), Math.floor(sy + dy), dx * 2, 1);
      }
    }
    ctx.globalAlpha = 1;

    // catene di montagne stratificate
    this._drawMountainSilhouette(ctx, H * 0.62, '#1a2050', 99);
    this._drawMountainSilhouette(ctx, H * 0.7, '#0e1838', 173);
    this._drawMountainSilhouette(ctx, H * 0.78, '#040818', 251);

    // Banner ATRS in basso (verde+blu a montagne + FUGA/KAILAS sponsor)
    drawAtrsBanner(ctx, W, H);

    // titolo TAP TRAIL grande in alto
    drawTextShadow(ctx, 'TAP TRAIL',
                   W / 2 - textWidth('TAP TRAIL', 5) / 2,
                   18, BrandColors.green, BrandColors.black, 5);
    drawTextCentered(ctx, 'ABRUZZO TRAIL RUN SERIES',
                     W / 2, 70, BrandColors.white, 1);

    // logo ATRS a sinistra, alto e leggibile
    drawLogo(ctx, 'assets/logos/atrs.png', 24, 88, 130);

    // bottoni a destra
    const btnH = 22;
    const btnW = 160;
    const startY = 100;
    for (let i = 0; i < this.buttons.length; i++) {
      const b = this.buttons[i];
      const by = startY + i * (btnH + 5);
      const bx = W / 2 + 20;
      // determino se il bottone è di tipo "toggle" e il suo stato
      const isToggleOn = b.dyn === 'ghost' ? this.game.profile.ghostEnabled
                       : b.dyn === 'audio' ? !this.game.audio.muted
                       : null;
      // colore di sfondo: navy normale, verde scuro se toggle ON, marrone se toggle OFF
      let bgColor = BrandColors.navyDark;
      let edgeColor = BrandColors.green;
      if (isToggleOn === true) { edgeColor = '#3CC23C'; }
      else if (isToggleOn === false) { edgeColor = '#806060'; }
      ctx.fillStyle = bgColor;
      ctx.fillRect(bx, by, btnW, btnH);
      ctx.fillStyle = edgeColor;
      ctx.fillRect(bx, by, 4, btnH);
      ctx.fillRect(bx + btnW - 4, by, 4, btnH);
      ctx.strokeStyle = BrandColors.white;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, btnW - 1, btnH - 1);
      // label: se è una funzione la chiamo per avere lo stato corrente
      const labelText = typeof b.label === 'function' ? b.label() : b.label;
      const textColor = isToggleOn === false ? '#A8A8B0' : BrandColors.white;
      drawTextCentered(ctx, labelText, bx + btnW / 2, by + 7, textColor, 1);
      // pallino indicatore stato a sinistra del bottone
      if (isToggleOn !== null) {
        ctx.fillStyle = isToggleOn ? '#3CFF3C' : '#806060';
        ctx.fillRect(bx + 8, by + 9, 4, 4);
        ctx.fillStyle = '#000';
        ctx.fillRect(bx + 7, by + 8, 1, 6);
        ctx.fillRect(bx + 12, by + 8, 1, 6);
        ctx.fillRect(bx + 8, by + 7, 4, 1);
        ctx.fillRect(bx + 8, by + 13, 4, 1);
      }
    }

    // welcome
    drawTextCentered(ctx, `BENVENUTO ${this.game.profile.name}`,
                     W / 2, H - 28, BrandColors.green, 1);
    drawTextCentered(ctx, `${this.game.profile.totalRaces || 0} GARE  ${(this.game.profile.totalKm || 0).toFixed(1)} KM`,
                     W / 2, H - 16, BrandColors.white, 1);

    // Credit autore in basso a sinistra (piccolo ma leggibile)
    drawTextShadow(ctx, 'BY 997CREATIONS@GMAIL.COM',
                   4, H - 10, '#FFFFFF', '#000000', 1);
  }
}
