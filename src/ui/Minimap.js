// src/ui/Minimap.js
// Minimappa GPX vista dall'alto in alto a destra,
// e profilo altimetrico in basso che mostra "you are here".

import { drawText } from './PixelFont.js';

export class Minimap {
  constructor(virtualW, virtualH) {
    this.W = virtualW;
    this.H = virtualH;
    this.size = 70;
    this.padding = 4;
    this.x = virtualW - this.size - 4;
    this.y = 4;
  }

  drawTrackPath(ctx, track) {
    const x = this.x + this.padding;
    const y = this.y + this.padding;
    const w = this.size - this.padding * 2;
    const h = this.size - this.padding * 2;
    ctx.strokeStyle = '#3CC23C';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < track.minimapPoints.length; i++) {
      const p = track.minimapPoints[i];
      const sx = x + p.x * w;
      const sy = y + p.y * h;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }

  draw(ctx, track, progress, ghostProgress) {
    // box
    ctx.fillStyle = '#0E1420';
    ctx.fillRect(this.x, this.y, this.size, this.size);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x + 0.5, this.y + 0.5, this.size - 1, this.size - 1);

    // tracciato
    this.drawTrackPath(ctx, track);

    // tratto già percorso evidenziato
    const x = this.x + this.padding;
    const y = this.y + this.padding;
    const w = this.size - this.padding * 2;
    const h = this.size - this.padding * 2;
    const passedIdx = Math.floor(progress * (track.minimapPoints.length - 1));
    ctx.strokeStyle = '#FFD700';
    ctx.beginPath();
    for (let i = 0; i <= passedIdx; i++) {
      const p = track.minimapPoints[i];
      const sx = x + p.x * w;
      const sy = y + p.y * h;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();

    // ghost (PB)
    if (ghostProgress !== null && ghostProgress !== undefined) {
      const gp = track.minimapAt(ghostProgress);
      ctx.fillStyle = 'rgba(180,180,255,0.85)';
      ctx.fillRect(x + gp.x * w - 1, y + gp.y * h - 1, 2, 2);
    }

    // pallino runner
    const cur = track.minimapAt(progress);
    const cx = x + cur.x * w;
    const cy = y + cur.y * h;
    ctx.fillStyle = '#FF3030';
    ctx.fillRect(cx - 1, cy - 1, 3, 3);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(cx, cy, 1, 1);

    // start
    const start = track.minimapPoints[0];
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x + start.x * w - 1, y + start.y * h - 1, 2, 2);
  }
}

export class Altimetry {
  constructor(virtualW, virtualH) {
    this.W = virtualW;
    this.H = virtualH;
    this.height = 28;
    this.padding = 4;
    this.x = 4;
    this.y = virtualH - this.height - 4;
    this.width = virtualW - 8;
    this._profileCache = null;
    this._profileTrackId = null;
  }

  _getProfile(track) {
    if (this._profileTrackId !== track.id) {
      this._profileCache = track.altitudeProfile(this.width - this.padding * 2);
      this._profileTrackId = track.id;
    }
    return this._profileCache;
  }

  draw(ctx, track, progress, ghostProgress) {
    // box
    ctx.fillStyle = 'rgba(16,16,24,0.92)';
    ctx.fillRect(this.x, this.y, this.width, this.height);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x + 0.5, this.y + 0.5, this.width - 1, this.height - 1);

    const profile = this._getProfile(track);
    const innerW = profile.length;
    const innerH = this.height - this.padding * 2 - 4;
    const ix = this.x + this.padding;
    const iy = this.y + this.padding + 4;
    const range = track.maxAlt - track.minAlt || 1;

    // riempimento
    ctx.fillStyle = '#5C7A2E';
    for (let i = 0; i < innerW; i++) {
      const norm = (profile[i] - track.minAlt) / range;
      const h = Math.floor(norm * innerH);
      ctx.fillRect(ix + i, iy + (innerH - h), 1, h);
    }
    // bordo superiore evidenziato
    ctx.fillStyle = '#9CCA4E';
    for (let i = 0; i < innerW; i++) {
      const norm = (profile[i] - track.minAlt) / range;
      const h = Math.floor(norm * innerH);
      ctx.fillRect(ix + i, iy + (innerH - h), 1, 1);
    }

    // posizione corrente
    const cx = Math.floor(ix + progress * (innerW - 1));
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(cx, iy - 4, 1, innerH + 4);
    ctx.fillRect(cx - 1, iy - 5, 3, 2);

    // ghost
    if (ghostProgress !== null && ghostProgress !== undefined) {
      const gx = Math.floor(ix + ghostProgress * (innerW - 1));
      ctx.fillStyle = 'rgba(180,180,255,0.7)';
      ctx.fillRect(gx, iy, 1, innerH);
    }

    // label quote (sopra il riquadro per non sovrapporsi al bordo)
    drawText(ctx, `${Math.round(track.minAlt)}M`, this.x + 2, this.y - 9, '#888888', 1);
    drawText(ctx, `D+${Math.round(track.elevationGainM)}M`,
             this.x + this.width - 36, this.y - 9, '#FFD700', 1);
  }
}
