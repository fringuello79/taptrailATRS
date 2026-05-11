// src/ui/HUD.js
// HUD T&F-style:
//   - Pace min/km grande (cuore del feedback velocità)
//   - Barra a QUADRETTI (segmenti pixelati) per la velocità — non barra liscia
//   - Mini-barra STAMINA a quadretti (10 segmenti) sotto la pace
//   - Indicatore prossimo lato richiesto (← o →)
//   - Indicatore consistenza ritmo (piccolo, decorativo)
//   - Pulsante bicchiere d'acqua (in alto al centro) per i ristori su mobile
//   - Timer + distanza (in alto a destra sotto minimap)

import { drawText, drawTextShadow } from './PixelFont.js';

// Colori "ATRS" coerenti col resto del gioco
const COL_BG     = '#101018';
const COL_BORDER = '#FFFFFF';
const COL_PACE   = '#FFD700';     // oro
const COL_PACE_GOOD = '#88FFCC';  // verde quando vai forte
const COL_PACE_BAD  = '#FF8866';  // arancio se molto lento
const COL_TIMER  = '#FFFFFF';
const COL_DIST   = '#FFD700';

// Barra a quadretti: N segmenti che si accendono a soglie progressive.
const BAR_SEGMENTS = 14;
const BAR_SEG_W    = 6;
const BAR_SEG_H    = 8;
const BAR_GAP      = 1;
// Colore dei segmenti accesi: gradiente verde→giallo→rosso (vista da T&F)
const SEG_COLORS = [
  '#33CC33', '#33CC33', '#33CC33', '#33CC33',   // verdi (0-3)
  '#88DD22', '#BBDD22', '#DDDD22',              // gialli (4-6)
  '#DDBB22', '#DDAA22', '#DD8822',              // arancio (7-9)
  '#DD6622', '#DD4422', '#DD2222', '#FF1111',   // rosso (10-13)
];

export class HUD {
  constructor(virtualW, virtualH) {
    this.W = virtualW;
    this.H = virtualH;
    this._blinkPhase = 0;
  }

  /** Disegna la barra a quadretti.
   *  @param value 0..1 (frazione della barra accesa) */
  drawSegmentedBar(ctx, x, y, value) {
    const filled = Math.round(Math.max(0, Math.min(1, value)) * BAR_SEGMENTS);
    for (let i = 0; i < BAR_SEGMENTS; i++) {
      const sx = x + i * (BAR_SEG_W + BAR_GAP);
      // Sfondo del segmento (scuro)
      ctx.fillStyle = '#1a1a26';
      ctx.fillRect(sx, y, BAR_SEG_W, BAR_SEG_H);
      // Bordo segmento
      ctx.fillStyle = '#33334a';
      ctx.fillRect(sx, y, BAR_SEG_W, 1);
      ctx.fillRect(sx, y + BAR_SEG_H - 1, BAR_SEG_W, 1);
      ctx.fillRect(sx, y, 1, BAR_SEG_H);
      ctx.fillRect(sx + BAR_SEG_W - 1, y, 1, BAR_SEG_H);
      // Acceso?
      if (i < filled) {
        const c = SEG_COLORS[i];
        ctx.fillStyle = c;
        ctx.fillRect(sx + 1, y + 1, BAR_SEG_W - 2, BAR_SEG_H - 2);
        // highlight 1 px in alto per dare luce
        ctx.fillStyle = lighten(c);
        ctx.fillRect(sx + 1, y + 1, BAR_SEG_W - 2, 1);
      }
    }
  }

  /** Indicatore prossimo lato richiesto: due frecce, una accesa.
   *  @param side 'L' o 'R'
   *  @param emphasized true se vogliamo evidenziare (es. pulsante) */
  drawSidePrompt(ctx, x, y, side, emphasized = false) {
    const arrowW = 14, arrowH = 14, gap = 6;
    const Lx = x;
    const Rx = x + arrowW + gap;
    const colorOn = emphasized ? '#FFD700' : '#FFFFFF';
    const colorOff = '#444455';
    // Pulse on the active one
    const pulse = emphasized ? (1 + 0.2 * Math.sin(this._blinkPhase * 0.15)) : 1;

    // Freccia sinistra
    this._drawArrow(ctx, Lx, y, arrowW, arrowH,
                    side === 'L' ? colorOn : colorOff,
                    'left', side === 'L' ? pulse : 1);
    // Freccia destra
    this._drawArrow(ctx, Rx, y, arrowW, arrowH,
                    side === 'R' ? colorOn : colorOff,
                    'right', side === 'R' ? pulse : 1);
  }

  _drawArrow(ctx, x, y, w, h, color, dir, scale = 1) {
    ctx.fillStyle = color;
    // Triangolo pixelato semplice
    const cy = y + h / 2;
    const tip = (dir === 'left') ? x : x + w - 1;
    const base = (dir === 'left') ? x + w - 1 : x;
    const step = (dir === 'left') ? 1 : -1;
    const maxH = Math.floor((h - 2) / 2);
    for (let i = 0; i <= maxH; i++) {
      const px = tip + i * step;
      const ySpan = Math.round(i * scale);
      ctx.fillRect(px, Math.floor(cy - ySpan), 1, ySpan * 2 + 1);
    }
    // tappo posteriore (linea verticale)
    ctx.fillRect(base, Math.floor(cy - maxH), 1, maxH * 2 + 1);
  }

  /** Mini-barra a quadretti per la stamina (più piccola della pace bar). */
  drawStaminaBar(ctx, x, y, value, flash = 0, exhausted = false) {
    const N = 14;
    const SEG_W = 6;
    const SEG_H = 4;
    const GAP   = 1;
    const filled = Math.round(Math.max(0, Math.min(1, value)) * N);
    // Colori stamina: verde quando piena, giallo a metà, rosso quando bassa
    function staminaColor(v) {
      if (v > 0.6) return '#33CC33';
      if (v > 0.3) return '#DDCC22';
      if (v > 0.1) return '#DD8822';
      return '#FF2222';
    }
    const colorBase = staminaColor(value);
    // Flash dopo ristoro: l'intera barra lampeggia bianca per ~1s
    const flashOn = flash > 0 && Math.floor(flash * 10) % 2 === 0;
    for (let i = 0; i < N; i++) {
      const sx = x + i * (SEG_W + GAP);
      ctx.fillStyle = '#1a1a26';
      ctx.fillRect(sx, y, SEG_W, SEG_H);
      ctx.fillStyle = '#33334a';
      ctx.fillRect(sx, y, SEG_W, 1);
      ctx.fillRect(sx, y + SEG_H - 1, SEG_W, 1);
      if (i < filled) {
        ctx.fillStyle = flashOn ? '#FFFFFF' : colorBase;
        ctx.fillRect(sx + 1, y + 1, SEG_W - 2, SEG_H - 2);
      }
    }
    // Lampeggio rosso "ESAUSTO!" se stamina a 0
    if (exhausted) {
      const blink = Math.floor(this._blinkPhase / 12) % 2 === 0;
      if (blink) {
        ctx.strokeStyle = '#FF2222';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 1, y - 1, (SEG_W + GAP) * N + 1, SEG_H + 2);
      }
    }
  }

  /** Pulsante bicchiere d'acqua per ristoro su mobile.
   *  @param rect {x,y,w,h} area del pulsante (in coord canvas virtuali)
   *  @param atRefreshment true se ristoro disponibile → pulsante "acceso"
   *  @param approachingRefreshment ristoro in approccio (per hint visivo) */
  drawWaterButton(ctx, rect, atRefreshment, approachingRefreshment) {
    const { x, y, w, h } = rect;
    // Stato: spento se non in zona ristoro, lampeggiante se zona attiva
    const blink = Math.floor(this._blinkPhase / 8) % 2 === 0;
    const active = atRefreshment;
    const approaching = !!approachingRefreshment && !atRefreshment;

    // Sfondo del bottone
    ctx.fillStyle = active ? (blink ? '#FFFFAA' : '#88CCFF') : (approaching ? '#445566' : '#222233');
    ctx.fillRect(x, y, w, h);
    // Bordo
    ctx.strokeStyle = active ? '#FFFFFF' : (approaching ? '#88AABB' : '#555566');
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    // Disegno il bicchiere: rettangolo trapezoidale con acqua dentro
    // Coordinate relative al pulsante. Bicchiere occupa la zona centrale.
    const cx = x + w / 2;
    const cy = y + h / 2;
    const bw = 14;   // larghezza top del bicchiere
    const bh = 18;   // altezza
    const bottomW = 10;  // larghezza bottom (più stretto: trapezio)
    const topY = cy - bh / 2;
    const botY = cy + bh / 2;

    // Contorno bicchiere (vetro): linee inclinate sui lati + bottom
    const colorGlass = active ? '#FFFFFF' : '#AABBCC';
    ctx.fillStyle = colorGlass;
    // Lato sinistro (4 px verticali, leggermente inclinati: trapezio)
    for (let i = 0; i < bh; i++) {
      const t = i / (bh - 1);
      const xLeft = Math.round(cx - bw/2 + (bw - bottomW)/2 * t);
      const xRight = Math.round(cx + bw/2 - (bw - bottomW)/2 * t);
      // sinistra
      ctx.fillRect(xLeft, topY + i, 1, 1);
      // destra
      ctx.fillRect(xRight, topY + i, 1, 1);
    }
    // bottom
    ctx.fillRect(Math.round(cx - bottomW/2), botY - 1, bottomW, 1);

    // Acqua dentro: parte inferiore del bicchiere riempita di blu
    const waterColor = active ? '#3399FF' : '#445577';
    const waterTopY = topY + Math.round(bh * 0.35);   // acqua riempie 65% del bicchiere
    ctx.fillStyle = waterColor;
    for (let i = waterTopY - topY; i < bh - 1; i++) {
      const t = i / (bh - 1);
      const xLeft = Math.round(cx - bw/2 + (bw - bottomW)/2 * t) + 1;
      const xRight = Math.round(cx + bw/2 - (bw - bottomW)/2 * t) - 1;
      ctx.fillRect(xLeft, topY + i, xRight - xLeft + 1, 1);
    }
    // Highlight superficie acqua (1 pixel sx più chiaro)
    if (active) {
      ctx.fillStyle = '#AADDFF';
      const xLeft = Math.round(cx - bw/2 + (bw - bottomW)/2 * (waterTopY - topY)/(bh - 1)) + 1;
      ctx.fillRect(xLeft, waterTopY, 3, 1);
    }

    // Label "R" sotto il bottone (per ricordare il tasto PC)
    drawText(ctx, 'R', x + w/2 - 2, y + h + 2,
             active ? '#FFFF80' : '#888899', 1);
  }

  draw(ctx, state) {
    this._blinkPhase += 1;
    const { timer, distanceKm, totalKm,
            speedMs = 0, paceStr = '--:--',
            speedNormalized = 0, stability = 0,
            nextSide = 'L',
            staminaNorm = 1, staminaExhausted = false, staminaFlash = 0,
            atRefreshment = false, approachingRefreshment = null,
            waterButtonRect = null } = state;

    // ========== PANNELLO PRINCIPALE in alto a sinistra ==========
    const panelX = 4, panelY = 4;
    const panelW = (BAR_SEG_W + BAR_GAP) * BAR_SEGMENTS + 8;
    const panelH = 68;   // un po' più alto per la stamina
    ctx.fillStyle = COL_BG;
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = COL_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1);

    // Riga 1: "PACE" label + pace grande
    drawText(ctx, 'PACE', panelX + 4, panelY + 4, COL_PACE, 1);
    // pace grande a destra (scale 2): es. "3:30/KM"
    const paceColor = paceStr === '--:--' ? '#888888'
                    : (speedNormalized > 0.55 ? COL_PACE_GOOD
                    : (speedNormalized < 0.15 ? COL_PACE_BAD : COL_PACE));
    drawTextShadow(ctx, paceStr, panelX + 30, panelY + 3,
                   paceColor, '#000000', 2);
    drawText(ctx, '/KM', panelX + 30 + paceStr.length * 12, panelY + 8,
             '#888888', 1);

    // Riga 2: barra a quadretti PACE
    this.drawSegmentedBar(ctx, panelX + 4, panelY + 19, speedNormalized);

    // Riga 3: barra STAMINA (mini)
    drawText(ctx, 'STAMINA', panelX + 4, panelY + 32, '#88FFCC', 1);
    this.drawStaminaBar(ctx, panelX + 4, panelY + 40, staminaNorm,
                        staminaFlash, staminaExhausted);

    // Riga 4: indicatore prossimo lato + stability indicator
    this.drawSidePrompt(ctx, panelX + 4, panelY + 48, nextSide, true);
    // Stability "•" punti (4 punti, illuminati in base a stability 0..1)
    const stabPts = 4;
    const stabFilled = Math.round(stability * stabPts);
    const stabX = panelX + 48;
    drawText(ctx, 'RITMO', stabX, panelY + 51, '#AAAAAA', 1);
    for (let i = 0; i < stabPts; i++) {
      const dotX = stabX + 24 + i * 5;
      const dotY = panelY + 51;
      ctx.fillStyle = i < stabFilled ? '#88FFCC' : '#333344';
      ctx.fillRect(dotX, dotY, 3, 3);
    }

    // ========== Pulsante bicchiere d'acqua (in alto centro) ==========
    if (waterButtonRect) {
      this.drawWaterButton(ctx, waterButtonRect, atRefreshment, approachingRefreshment);
    }

    // ========== Timer + distanza in alto a destra (sotto minimap) ==========
    const timeStr = formatTime(timer);
    const distStr = `${distanceKm.toFixed(2)} / ${totalKm.toFixed(1)} KM`;
    const infoX = this.W - 88, infoY = 78, infoW = 84, infoH = 22;
    ctx.fillStyle = 'rgba(16,16,24,0.75)';
    ctx.fillRect(infoX, infoY, infoW, infoH);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.strokeRect(infoX + 0.5, infoY + 0.5, infoW - 1, infoH - 1);
    drawTextShadow(ctx, timeStr, infoX + 4, infoY + 3, COL_TIMER, '#000000', 1);
    drawTextShadow(ctx, distStr, infoX + 4, infoY + 13, COL_DIST, '#000000', 1);
  }
}

function lighten(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  const r = Math.min(255, parseInt(m[1], 16) + 60);
  const g = Math.min(255, parseInt(m[2], 16) + 60);
  const b = Math.min(255, parseInt(m[3], 16) + 60);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function formatTime(sec) {
  sec = Math.max(0, sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec * 100) % 100);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
}
