// src/scenes/WorldRenderer.js
// Rendering "Monkey Island 2 style": pixel art ricca, generata a runtime.
//
// Principi guida:
// 1) DITHERING OVUNQUE: gradient cielo, ombre montagne, sfumature terreno - tutto con Bayer 4x4
// 2) PALETTE LIMITATA MA SATURA: 5-6 colori per oggetto, scelti per contrasto
// 3) OUTLINE SCURE 1px: tutto ha contorno nero o quasi-nero - leggibilità chirurgica
// 4) BANDEGGI ORIZZONTALI: il terreno è disegnato a fasce di profondità con colori distinti
// 5) DETTAGLI EMERGENTI: alberi singoli scenici, pietre, fiori sparsi, animaletti -
//    rompono la monotonia procedurale con elementi "disegnati a mano"
// 6) AMBIENT OCCLUSION: ombre più scure dove gli oggetti incontrano il terreno

const RUNNER_X_RATIO = 0.32;

// --- RNG seeded ---
function seededRand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
function hashAt(wx, baseSeed) {
  return ((wx * 374761393) ^ baseSeed) >>> 0;
}

// --- Bayer 4x4 e 8x8 per dithering ---
const BAYER4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5],
];
const BAYER8 = [
  [ 0, 32,  8, 40,  2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44,  4, 36, 14, 46,  6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [ 3, 35, 11, 43,  1, 33,  9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47,  7, 39, 13, 45,  5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [255, 255, 255];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Dithering tra colore A e colore B con probabilità Bayer8. */
function ditherMix(ctx, x, y, w, h, colorA, colorB, mixRatio) {
  const rgbA = hexToRgb(colorA);
  const rgbB = hexToRgb(colorB);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const bayer = BAYER8[(y + py) & 7][(x + px) & 7] / 64;
      const useB = bayer < mixRatio;
      const c = useB ? rgbB : rgbA;
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.fillRect(x + px, y + py, 1, 1);
    }
  }
}

/** Cielo dithered cached. */
function paintDitheredGradient(ctx, w, h, stops) {
  const data = ctx.createImageData(w, h);
  const buf = data.data;
  for (let y = 0; y < h; y++) {
    const t = y / Math.max(1, h - 1);
    let lo = stops[0], hi = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i][0] && t <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break; }
    }
    const segT = (t - lo[0]) / Math.max(0.0001, hi[0] - lo[0]);
    const r = lo[1][0] + (hi[1][0] - lo[1][0]) * segT;
    const g = lo[1][1] + (hi[1][1] - lo[1][1]) * segT;
    const b = lo[1][2] + (hi[1][2] - lo[1][2]) * segT;
    for (let x = 0; x < w; x++) {
      const off = (BAYER8[y & 7][x & 7] / 64 - 0.5) * 12;
      const idx = (y * w + x) * 4;
      buf[idx]     = Math.max(0, Math.min(255, r + off));
      buf[idx + 1] = Math.max(0, Math.min(255, g + off));
      buf[idx + 2] = Math.max(0, Math.min(255, b + off));
      buf[idx + 3] = 255;
    }
  }
  ctx.putImageData(data, 0, 0);
}

/** Ovale pixel-art. */
function drawPixelOval(ctx, cx, cy, w, h) {
  const halfW = w / 2;
  const halfH = h / 2;
  for (let y = -Math.floor(halfH); y <= Math.floor(halfH); y++) {
    const dy = y / Math.max(1, halfH);
    const k = Math.sqrt(Math.max(0, 1 - dy * dy));
    const xw = Math.floor(halfW * k);
    if (xw <= 0) continue;
    ctx.fillRect(Math.floor(cx - xw), Math.floor(cy + y), xw * 2 + 1, 1);
  }
}

/** Catena di montagne "incassate": riempie da sé verso il basso fino al groundY,
 * così copre completamente quello che sta dietro. È il modo giusto di
 * stratificare un parallasse in pixel art (LucasArts MI2 docet). */
function drawMountainRangeFilled(ctx, peakBaseY, fillToY, height, colors, seed, viewLeft, screenW, scale, jitter, withSnow) {
  const step = Math.max(8, Math.floor(28 * scale));
  const startWX = Math.floor((viewLeft - 200) / step) * step;
  const endWX = viewLeft + screenW + 200;

  // genero punti picco
  const peaks = [];
  for (let wx = startWX; wx <= endWX; wx += step) {
    const r = seededRand(hashAt(wx, seed));
    const peakH = r() * height * jitter * 0.85 + height * 0.18;
    const subPeak = (r() - 0.5) * 4;
    const screenX = wx - viewLeft;
    const peakY = peakBaseY + (height - peakH) + subPeak;
    peaks.push({ x: screenX, y: peakY, h: peakH, wx });
  }

  // 1) silhouette principale che riempie fino in fondo (ombra/base scura)
  ctx.beginPath();
  ctx.moveTo(startWX - viewLeft, fillToY);  // parte dal basso sinistro
  ctx.lineTo(peaks[0].x, peaks[0].y);
  for (let i = 1; i < peaks.length; i++) {
    const p0 = peaks[i - 1], p1 = peaks[i];
    const cx = (p0.x + p1.x) / 2;
    const cy = Math.min(p0.y, p1.y) - 2;
    ctx.quadraticCurveTo(cx, cy, p1.x, p1.y);
  }
  ctx.lineTo(endWX - viewLeft, fillToY);  // chiude in basso destro
  ctx.closePath();
  ctx.fillStyle = colors.shadow;
  ctx.fill();

  // 2) "tono medio" = striscia inferiore (più chiara) per dare profondità
  // Disegno un poligono che copre solo la parte sotto le creste, sfumato
  ctx.beginPath();
  ctx.moveTo(startWX - viewLeft, fillToY);
  for (let i = 0; i < peaks.length; i++) {
    const p = peaks[i];
    const offsetY = 10 + ((i * 3) % 6);
    if (i === 0) ctx.lineTo(p.x, p.y + offsetY);
    else {
      const p0 = peaks[i - 1];
      const cx = (p0.x + p.x) / 2;
      const cy = Math.min(p0.y + offsetY, p.y + offsetY) - 1;
      ctx.quadraticCurveTo(cx, cy, p.x, p.y + offsetY);
    }
  }
  ctx.lineTo(endWX - viewLeft, fillToY);
  ctx.closePath();
  ctx.fillStyle = colors.mid;
  ctx.fill();

  // 3) versanti in luce con dithering Bayer (solo dove p0.y < p1.y)
  ctx.fillStyle = colors.light;
  for (let i = 0; i < peaks.length - 1; i++) {
    const p0 = peaks[i], p1 = peaks[i + 1];
    if (p0.y > p1.y + 2) continue;
    const fromX = Math.floor(p0.x);
    const toX = Math.floor((p0.x + p1.x) / 2);
    for (let x = fromX; x < toX; x++) {
      const t = (x - fromX) / Math.max(1, toX - fromX);
      const yLine = p0.y + (p1.y - p0.y) * t;
      for (let y = Math.floor(yLine); y < Math.floor(yLine) + 16; y++) {
        const bayer = BAYER8[y & 7][x & 7] / 64;
        const depth = (y - yLine) / 16;
        if (bayer > depth) {
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  // 4) neve sulle vette (solo se richiesto)
  if (withSnow && colors.snow) {
    for (const p of peaks) {
      if (p.h > height * 0.55) {
        ctx.fillStyle = colors.snow;
        drawPixelOval(ctx, p.x, p.y + 1, 14, 5);
        const r = seededRand(hashAt(p.wx, seed + 99));
        for (let k = 0; k < 4; k++) {
          const sx = p.x + Math.floor((r() - 0.5) * 14);
          const sy = p.y + 4 + Math.floor(r() * 6);
          const sl = 2 + Math.floor(r() * 4);
          ctx.fillRect(sx, sy, 1, sl);
        }
        if (colors.snowShadow) {
          ctx.fillStyle = colors.snowShadow;
          ctx.fillRect(p.x + 1, p.y + 2, 5, 1);
          ctx.fillRect(p.x + 5, p.y + 6, 1, 2);
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(p.x - 2, p.y - 1, 4, 1);
        ctx.fillRect(p.x - 1, p.y - 2, 2, 1);
      }
    }
  }

  // 5) macchie rocciose sui pendii
  for (let i = 0; i < peaks.length - 1; i++) {
    const p = peaks[i];
    const r = seededRand(hashAt(p.wx, seed + 31));
    for (let k = 0; k < 4; k++) {
      if (r() < 0.45) {
        const lx = p.x + Math.floor((r() - 0.5) * 18);
        const ly = p.y + Math.floor(r() * (p.h * 0.5)) + 8;
        ctx.fillStyle = colors.rock || colors.shadow;
        const lh = 2 + Math.floor(r() * 4);
        ctx.fillRect(lx, ly, 1, lh);
        if (r() < 0.6) ctx.fillRect(lx + 1, ly + 1, 1, lh - 1);
      }
    }
  }
}


function drawMountainRangeDetailed(ctx, y0, height, colors, seed, viewLeft, screenW, scale, jitter) {
  const step = Math.max(8, Math.floor(28 * scale));
  const startWX = Math.floor((viewLeft - 200) / step) * step;
  const endWX = viewLeft + screenW + 200;

  const peaks = [];
  for (let wx = startWX; wx <= endWX; wx += step) {
    const r = seededRand(hashAt(wx, seed));
    const peakH = r() * height * jitter * 0.85 + height * 0.18;
    const subPeak = (r() - 0.5) * 4;
    const screenX = wx - viewLeft;
    const peakY = y0 + (height - peakH) + subPeak;
    peaks.push({ x: screenX, y: peakY, h: peakH, wx });
  }

  // 1) silhouette principale (ombra) con curve smussate
  ctx.beginPath();
  ctx.moveTo(startWX - viewLeft, y0 + height);
  ctx.lineTo(peaks[0].x, peaks[0].y);
  for (let i = 1; i < peaks.length; i++) {
    const p0 = peaks[i - 1], p1 = peaks[i];
    const cx = (p0.x + p1.x) / 2;
    const cy = Math.min(p0.y, p1.y) - 2;
    ctx.quadraticCurveTo(cx, cy, p1.x, p1.y);
  }
  ctx.lineTo(endWX - viewLeft, y0 + height);
  ctx.closePath();
  ctx.fillStyle = colors.shadow;
  ctx.fill();

  // 2) tono medio
  ctx.beginPath();
  ctx.moveTo(startWX - viewLeft, y0 + height);
  for (let i = 0; i < peaks.length; i++) {
    const p = peaks[i];
    const offsetY = 8 + ((i * 3) % 5);
    if (i === 0) ctx.lineTo(p.x, p.y + offsetY);
    else {
      const p0 = peaks[i - 1];
      const cx = (p0.x + p.x) / 2;
      const cy = Math.min(p0.y + offsetY, p.y + offsetY) - 1;
      ctx.quadraticCurveTo(cx, cy, p.x, p.y + offsetY);
    }
  }
  ctx.lineTo(endWX - viewLeft, y0 + height);
  ctx.closePath();
  ctx.fillStyle = colors.mid;
  ctx.fill();

  // 3) versanti in luce con dithering Bayer
  const rgbLight = hexToRgb(colors.light);
  ctx.fillStyle = colors.light;
  for (let i = 0; i < peaks.length - 1; i++) {
    const p0 = peaks[i], p1 = peaks[i + 1];
    if (p0.y > p1.y + 2) continue;
    const fromX = Math.floor(p0.x);
    const toX = Math.floor((p0.x + p1.x) / 2);
    for (let x = fromX; x < toX; x++) {
      const t = (x - fromX) / Math.max(1, toX - fromX);
      const yLine = p0.y + (p1.y - p0.y) * t;
      for (let y = Math.floor(yLine); y < Math.floor(yLine) + 14; y++) {
        const bayer = BAYER8[y & 7][x & 7] / 64;
        const depth = (y - yLine) / 14;
        if (bayer > depth) {
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  // 4) neve sulle vette - più ricca
  for (const p of peaks) {
    if (p.h > height * 0.55 && colors.snow) {
      ctx.fillStyle = colors.snow;
      drawPixelOval(ctx, p.x, p.y + 1, 14, 5);
      // strisce nei canaloni
      const r = seededRand(hashAt(p.wx, seed + 99));
      for (let k = 0; k < 4; k++) {
        const sx = p.x + Math.floor((r() - 0.5) * 14);
        const sy = p.y + 4 + Math.floor(r() * 6);
        const sl = 2 + Math.floor(r() * 4);
        ctx.fillRect(sx, sy, 1, sl);
      }
      // ombra azzurrina
      if (colors.snowShadow) {
        ctx.fillStyle = colors.snowShadow;
        ctx.fillRect(p.x + 1, p.y + 2, 5, 1);
        ctx.fillRect(p.x + 5, p.y + 6, 1, 2);
      }
      // highlight bianco puro al picco
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(p.x - 2, p.y - 1, 4, 1);
      ctx.fillRect(p.x - 1, p.y - 2, 2, 1);
    }
  }

  // 5) dettagli rocciosi sui pendii con dithering
  for (let i = 0; i < peaks.length - 1; i++) {
    const p = peaks[i];
    const r = seededRand(hashAt(p.wx, seed + 31));
    for (let k = 0; k < 4; k++) {
      if (r() < 0.55) {
        const lx = p.x + Math.floor((r() - 0.5) * 18);
        const ly = p.y + Math.floor(r() * (p.h * 0.6)) + 8;
        ctx.fillStyle = colors.rock || colors.shadow;
        const lh = 2 + Math.floor(r() * 4);
        ctx.fillRect(lx, ly, 1, lh);
        if (r() < 0.6) ctx.fillRect(lx + 1, ly + 1, 1, lh - 1);
        // light edge
        ctx.fillStyle = colors.light;
        ctx.fillRect(lx, ly, 1, 1);
      }
    }
  }
}

// --- ALBERO DETTAGLIATO MI2 (con tronco testurizzato e chioma a 5 toni) ---
function drawDetailedTree(ctx, x, y, scale, palette, variant) {
  const s = Math.max(1, Math.floor(scale));
  const v = variant || 0;

  // tronco con texture corteccia
  const trunkH = 6 * s;
  const trunkW = 2 * s;
  ctx.fillStyle = palette.barkDark;
  ctx.fillRect(x - trunkW/2, y - trunkH, trunkW, trunkH);
  ctx.fillStyle = palette.barkLight;
  ctx.fillRect(x - trunkW/2, y - trunkH, 1, trunkH);
  // tacche corteccia
  ctx.fillStyle = palette.barkDark;
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(x - trunkW/2, y - trunkH + 1 + i*2*s, 1, 1);
  }

  // ombra base sotto albero
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  drawPixelOval(ctx, x, y, 8 * s, 2 * s);

  // chioma — 5 livelli concentrici per profondità
  const cw = (14 + v * 2) * s;
  const ch = (12 + (v % 2) * 2) * s;
  const cx = x;
  const cy = y - trunkH - ch/2 + 2;

  // outline scura
  ctx.fillStyle = palette.leafOutline;
  drawPixelOval(ctx, cx, cy + 1, cw + 2, ch + 2);

  // base scurissima (parte bassa-destra in ombra)
  ctx.fillStyle = palette.leafShadow || palette.leafDark;
  drawPixelOval(ctx, cx + 1, cy + 1, cw, ch);

  // medio-scuro
  ctx.fillStyle = palette.leafDark;
  drawPixelOval(ctx, cx, cy, cw - 1, ch - 1);

  // medio
  ctx.fillStyle = palette.leafMid;
  drawPixelOval(ctx, cx - 1, cy - 1, cw - 4, ch - 3);

  // chiaro (sopra-sinistra)
  ctx.fillStyle = palette.leafLight;
  drawPixelOval(ctx, cx - 2 * s, cy - 2 * s, cw - 8, ch - 6);

  // foglie singole brillanti (cluster)
  ctx.fillStyle = palette.leafHighlight;
  const r = seededRand((x * 13 + y * 7 + v * 53) >>> 0);
  for (let i = 0; i < 12; i++) {
    const dx = Math.floor((r() - 0.5) * cw);
    const dy = Math.floor((r() - 0.5) * ch);
    if (dx * dx / (cw / 2) ** 2 + dy * dy / (ch / 2) ** 2 < 0.85) {
      ctx.fillRect(Math.floor(cx + dx), Math.floor(cy + dy), s, s);
    }
  }

  // outline 1px scuro nei punti più bassi
  ctx.fillStyle = palette.leafOutline;
  ctx.fillRect(Math.floor(cx - cw/2), Math.floor(cy + ch/2 - 1), Math.floor(cw), 1);
}

// --- CESPUGLIO ricco ---
function drawBush(ctx, x, y, scale, palette) {
  const s = Math.max(1, Math.floor(scale));
  // ombra
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  drawPixelOval(ctx, x, y + 1, 10 * s, 2 * s);
  // outline
  ctx.fillStyle = palette.leafOutline || '#0a1804';
  drawPixelOval(ctx, x, y, 11 * s, 6 * s);
  // base scura
  ctx.fillStyle = palette.bushDark;
  drawPixelOval(ctx, x, y, 9 * s, 5 * s);
  // medio
  ctx.fillStyle = palette.bushMid;
  drawPixelOval(ctx, x - 1 * s, y - 1, 7 * s, 4 * s);
  // luce
  ctx.fillStyle = palette.bushLight;
  drawPixelOval(ctx, x - 2 * s, y - 1, 4 * s, 2 * s);
  // bacche/highlight (per bosco fitto)
  if (palette.bushHighlight) {
    ctx.fillStyle = palette.bushHighlight;
    ctx.fillRect(x - 1, y - 1, 1, 1);
    ctx.fillRect(x + 1, y, 1, 1);
  }
}

// --- CIUFFO ERBA ALTO (3 fili) ---
function drawGrassTuft(ctx, x, y, palette) {
  ctx.fillStyle = palette.grassDark;
  ctx.fillRect(x, y, 1, 3);
  ctx.fillRect(x + 2, y, 1, 3);
  ctx.fillRect(x + 4, y - 1, 1, 4);
  ctx.fillStyle = palette.grassMid;
  ctx.fillRect(x + 1, y - 1, 1, 4);
  ctx.fillRect(x + 3, y - 1, 1, 4);
  ctx.fillStyle = palette.grassLight;
  ctx.fillRect(x + 1, y - 1, 1, 1);
  ctx.fillRect(x + 4, y - 1, 1, 1);
}

// --- FIORE singolo (per dare colore) ---
function drawFlower(ctx, x, y, color) {
  ctx.fillStyle = '#1a4010';
  ctx.fillRect(x + 1, y - 2, 1, 3);
  ctx.fillStyle = color;
  ctx.fillRect(x, y - 2, 1, 1);
  ctx.fillRect(x + 2, y - 2, 1, 1);
  ctx.fillRect(x + 1, y - 3, 1, 1);
  ctx.fillRect(x + 1, y - 1, 1, 1);
  ctx.fillStyle = '#FFFF80';
  ctx.fillRect(x + 1, y - 2, 1, 1);
}

// --- PIETRA grossa con luce/ombra ---
function drawRock(ctx, x, y, w, h, palette) {
  // ombra
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x, y + h, w, 1);
  ctx.fillRect(x + 1, y + h + 1, w - 2, 1);
  // outline
  ctx.fillStyle = '#000';
  ctx.fillRect(x, y, w, h);
  // base
  ctx.fillStyle = palette.rockDark;
  ctx.fillRect(x, y, w - 1, h - 1);
  // mid
  ctx.fillStyle = palette.rockMid;
  ctx.fillRect(x, y, w - 2, Math.max(1, h - 2));
  // highlight in alto
  ctx.fillStyle = palette.rockLight;
  ctx.fillRect(x, y, Math.max(1, w - 3), 1);
  ctx.fillRect(x, y, 1, Math.max(1, h - 3));
}

// --- PIETRONE scenico (più dettagliato, per primo piano) ---
function drawBoulder(ctx, x, y, palette) {
  // ombra ampia
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  drawPixelOval(ctx, x, y + 7, 14, 3);
  // outline
  ctx.fillStyle = '#000';
  drawPixelOval(ctx, x, y, 13, 8);
  // base scura
  ctx.fillStyle = palette.rockDark;
  drawPixelOval(ctx, x, y, 12, 7);
  // medio
  ctx.fillStyle = palette.rockMid;
  drawPixelOval(ctx, x - 1, y - 1, 9, 5);
  // luce
  ctx.fillStyle = palette.rockLight;
  drawPixelOval(ctx, x - 2, y - 2, 5, 2);
  // crepe
  ctx.fillStyle = palette.rockDark;
  ctx.fillRect(x + 2, y - 1, 1, 4);
  ctx.fillRect(x - 3, y + 1, 3, 1);
}

// --- NUVOLA pixel art ricca ---
function drawCloud(ctx, x, y, scale, t) {
  const s = scale;
  const ox = x + (t * 3) % 12;
  // ombra interna
  ctx.fillStyle = '#A8A8B8';
  drawPixelOval(ctx, ox, y + 2, 16 * s, 4 * s);
  // bianco principale
  ctx.fillStyle = '#FFFFFF';
  drawPixelOval(ctx, ox, y, 16 * s, 5 * s);
  drawPixelOval(ctx, ox - 5 * s, y - 1 * s, 9 * s, 4 * s);
  drawPixelOval(ctx, ox + 5 * s, y - 2 * s, 10 * s, 4 * s);
  // luce
  ctx.fillStyle = '#FFFFE8';
  drawPixelOval(ctx, ox - 3 * s, y - 2 * s, 5 * s, 2 * s);
}

// --- ANIMALETTO lontano (cervo silhouette, raro) ---
function drawDistantAnimal(ctx, x, y, color) {
  // mini sagoma cervo 5x4
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 4, 1);     // corpo
  ctx.fillRect(x, y - 1, 1, 1); // testa
  ctx.fillRect(x + 4, y - 1, 1, 1); // coda
  ctx.fillRect(x, y + 1, 1, 2); // gambe
  ctx.fillRect(x + 3, y + 1, 1, 2);
  // corna
  ctx.fillRect(x, y - 2, 1, 1);
}

// === BACKGROUND LAYER LOADER ===
// I 5 layer del set "Free Mountain Backgrounds Pixel Art" di CraftPix (m1).
// Caricati una sola volta in cache. Layer 1=cielo, 2=nuvole, 3=montagna principale,
// 4=colline medie, 5=foreground colline verdi.
const _bgLayers = {};
function _loadBgLayer(n) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { _bgLayers[n] = img; resolve(img); };
    img.onerror = () => { console.warn('Background layer load failed:', n); resolve(null); };
    img.src = `assets/backgrounds/m1/${n}.png`;
  });
}
function _getBgLayer(n) { return _bgLayers[n] || null; }
// Avvio caricamento eager dei 5 layer
for (let i = 1; i <= 5; i++) _loadBgLayer(i);

/** Disegna un'immagine ripetuta orizzontalmente per riempire la viewport.
 * offsetX può essere negativo (scroll). L'immagine viene scalata verticalmente
 * per riempire vh dello schermo se più piccola. */
function _drawTiledLayer(ctx, img, offsetX, offsetY, vw, vh, scaleY = 1) {
  if (!img) return;
  const sw = img.width;
  const sh = img.height;
  // Scala uniforme per coprire vh: ho la dimensione native (576x324),
  // viewport è (640x360 tipico) → fattore ~1.11. Calcolo dynamicamente.
  const sFactor = vh / sh;
  const dw = Math.ceil(sw * sFactor);
  const dh = vh;
  let x = offsetX;
  // Allinea per partire prima di 0 se offset positivo
  while (x > 0) x -= dw;
  ctx.imageSmoothingEnabled = false;
  while (x < vw) {
    ctx.drawImage(img, 0, 0, sw, sh, Math.floor(x), Math.floor(offsetY), dw, dh);
    x += dw;
  }
}

export class WorldRenderer {
  constructor(virtualW, virtualH) {
    this.W = virtualW;
    this.H = virtualH;
    this.groundY = Math.floor(virtualH * 0.74);
    this.altYAmplitude = 38;
    this.worldPxPerKm = 60;
    this._skyCache = null;
    this._skyCacheKey = null;
  }

  trailYAt(track, progress) {
    const alt = track.altitudeAt(progress);
    const range = track.maxAlt - track.minAlt || 1;
    const norm = (alt - track.minAlt) / range;
    return this.groundY - (norm - 0.5) * 2 * this.altYAmplitude;
  }

  worldX(track, progress) {
    return progress * track.distanceKm * this.worldPxPerKm;
  }

  drawSky(ctx, weather) {
    // Lo sfondo m1 di CraftPix include sky + nuvole nei layer 1 e 2.
    // Layer 1 = cielo (gradiente già dipinto), Layer 2 = nuvole rosee.
    // Li disegno qui come "cielo".
    const sky1 = _getBgLayer(1);
    const sky2 = _getBgLayer(2);
    if (!sky1) {
      // fallback se non ancora caricato
      ctx.fillStyle = '#d6dde2';
      ctx.fillRect(0, 0, this.W, this.H);
      return;
    }
    // Layer 1 (cielo): tiled in x, allineato in alto, scala per riempire altezza schermo
    _drawTiledLayer(ctx, sky1, 0, 0, this.W, this.H, 1);
    // Layer 2 (nuvole): scrolling lentissimo per creare movimento atmosferico
    if (sky2) {
      const cloudScrollX = (weather.t * 4) % sky2.width;
      _drawTiledLayer(ctx, sky2, -cloudScrollX, 0, this.W, this.H, 1);
    }

    // Sole/luna addizionale solo per condizioni meteo specifiche (alba/tramonto)
    if (weather.sunColor && (weather.preset === 'clear_dawn' || weather.preset === 'dusk')) {
      const sx = Math.floor(this.W * 0.72);
      const sy = Math.floor(this.H * 0.18 + weather.sunY * 50);
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = weather.sunColor;
      for (let dy = -28; dy <= 28; dy++) {
        const dx = Math.floor(Math.sqrt(28 * 28 - dy * dy));
        ctx.fillRect(sx - dx, sy + dy, dx * 2, 1);
      }
      ctx.globalAlpha = 0.20;
      for (let dy = -20; dy <= 20; dy++) {
        const dx = Math.floor(Math.sqrt(20 * 20 - dy * dy));
        ctx.fillRect(sx - dx, sy + dy, dx * 2, 1);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#f0e4c8';
      for (let dy = -7; dy <= 7; dy++) {
        const dx = Math.floor(Math.sqrt(7 * 7 - dy * dy));
        ctx.fillRect(sx - dx, sy + dy, dx * 2, 1);
      }
      ctx.fillStyle = '#fff8e0';
      ctx.fillRect(sx - 2, sy - 2, 4, 4);
    }

    // stormo di uccelli
    if (['clear_dawn', 'dusk', 'day_clear'].includes(weather.preset)) {
      ctx.fillStyle = 'rgba(11,7,12,0.65)';
      const baseX = (weather.t * 12) % (this.W + 100) - 50;
      for (let i = 0; i < 3; i++) {
        const bx = baseX + i * 12;
        const by = 50 + i * 6 + Math.sin(weather.t * 2 + i) * 2;
        ctx.fillRect(bx, by, 1, 1);
        ctx.fillRect(bx + 1, by - 1, 1, 1);
        ctx.fillRect(bx + 2, by, 1, 1);
        ctx.fillRect(bx + 3, by - 1, 1, 1);
        ctx.fillRect(bx + 4, by, 1, 1);
      }
    }
  }

  drawParallaxLayers(ctx, viewLeft, weather, palette) {
    // I 5 layer di m1 sono:
    // 1 = cielo (già in drawSky)
    // 2 = nuvole (già in drawSky)
    // 3 = montagna principale (parallax molto lento)
    // 4 = colline medie blu/viola (parallax medio)
    // 5 = foreground colline verdi (parallax veloce, va dietro al sentiero)
    const layer3 = _getBgLayer(3);
    const layer4 = _getBgLayer(4);
    const layer5 = _getBgLayer(5);

    if (layer3) {
      const px3 = -(viewLeft * 0.12) % layer3.width;
      _drawTiledLayer(ctx, layer3, px3, 0, this.W, this.H, 1);
    }
    if (layer4) {
      const px4 = -(viewLeft * 0.30) % layer4.width;
      _drawTiledLayer(ctx, layer4, px4, 0, this.W, this.H, 1);
    }
    if (layer5) {
      const px5 = -(viewLeft * 0.55) % layer5.width;
      _drawTiledLayer(ctx, layer5, px5, 0, this.W, this.H, 1);
    }
  }

  _horizonHazeRgb(palette) {
    // ricavo un colore "atmosferico" (chiaro, blando)
    return '180,200,210';
  }

  drawTrail(ctx, track, currentProgress, palette) {
    const runnerScreenX = this.W * RUNNER_X_RATIO;
    const totalWorldPx = track.distanceKm * this.worldPxPerKm;
    const currentWorldX = currentProgress * totalWorldPx;
    const viewLeft = currentWorldX - runnerScreenX;

    const heights = new Array(this.W);
    for (let x = 0; x < this.W; x++) {
      const wx = viewLeft + x;
      const p = Math.max(0, Math.min(1, wx / totalWorldPx));
      heights[x] = this.trailYAt(track, p);
    }

    // === TERRENO MULTIBANDA disegnato a colonne con fillRect (no imageData
    // perché creava scia del runner del frame precedente) ===
    // Strategia: per ogni colonna disegno una sequenza di "blocchi colorati"
    // basati sulla profondità. Ogni blocco è un fillRect verticale.
    const c_grassLight = palette.grassLight || palette.trailGrass;
    const c_grass = palette.trailGrass;
    const c_grassDark = palette.trailGrassDark;
    const c_dirtLight = palette.trailDirtLight;
    const c_dirt = palette.trailDirt;
    const c_dirtDark = palette.trailDirtDark;
    const c_dirtDeep = palette.trailDirtDeep;
    const c_outline = palette.trailGrassOutline || '#1e2c12';
    const c_bandA = palette.trailBandA || c_dirt;

    for (let x = 0; x < this.W; x++) {
      const top = Math.floor(heights[x]);
      // outline
      if (top - 1 >= 0 && top - 1 < this.H) {
        ctx.fillStyle = c_outline;
        ctx.fillRect(x, top - 1, 1, 1);
      }
      // riga 0: erba chiara
      ctx.fillStyle = c_grassLight;
      ctx.fillRect(x, top, 1, 1);
      // riga 1: erba normale
      ctx.fillStyle = c_grass;
      ctx.fillRect(x, top + 1, 1, 1);
      // riga 2: erba scura
      ctx.fillStyle = c_grassDark;
      ctx.fillRect(x, top + 2, 1, 1);
      // righe 3-4: sterrato chiaro dithered
      for (let y = top + 3; y < top + 5 && y < this.H; y++) {
        const bayer = BAYER8[y & 7][x & 7] / 64;
        ctx.fillStyle = bayer < 0.45 ? c_dirtLight : c_dirt;
        ctx.fillRect(x, y, 1, 1);
      }
      // righe 5-9: sterrato medio
      for (let y = top + 5; y < top + 10 && y < this.H; y++) {
        const bayer = BAYER8[y & 7][x & 7] / 64;
        ctx.fillStyle = bayer < 0.4 ? c_dirt : c_dirtDark;
        ctx.fillRect(x, y, 1, 1);
      }
      // righe 10-17: bandeggio orizzontale (strati geologici)
      for (let y = top + 10; y < top + 18 && y < this.H; y++) {
        const bayer = BAYER8[y & 7][x & 7] / 64;
        const bandY = (y >> 1) & 3;
        let c;
        if (bandY === 0) c = bayer < 0.5 ? c_dirt : c_dirtDark;
        else if (bandY === 1) c = c_dirtDark;
        else if (bandY === 2) c = bayer < 0.5 ? c_dirtDark : c_bandA;
        else c = c_bandA;
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }
      // righe 18-27: sterrato profondo
      for (let y = top + 18; y < top + 28 && y < this.H; y++) {
        const bayer = BAYER8[y & 7][x & 7] / 64;
        ctx.fillStyle = bayer < 0.5 ? c_dirtDark : c_dirtDeep;
        ctx.fillRect(x, y, 1, 1);
      }
      // righe oltre: terra fonda piena fino al fondo
      if (top + 28 < this.H) {
        ctx.fillStyle = c_dirtDeep;
        ctx.fillRect(x, top + 28, 1, this.H - (top + 28));
      }
    }

    // === DECORAZIONI sopra il terreno: deterministiche sul mondo ===
    // Strato 1: ciuffi d'erba e fiori (frequenti)
    const decoStep = 9;
    const startWX = Math.floor((viewLeft - 50) / decoStep) * decoStep;
    for (let wx = startWX; wx < viewLeft + this.W + 50; wx += decoStep) {
      const r = seededRand(hashAt(wx, 9911));
      const sx = wx - viewLeft;
      if (sx < -10 || sx >= this.W + 10) continue;
      const px = Math.floor(sx);
      if (px < 0 || px >= this.W) continue;
      const yTop = Math.floor(heights[px]);
      const choice = r();
      if (choice < 0.20) {
        drawGrassTuft(ctx, px - 2, yTop - 1, palette);
      } else if (choice < 0.25) {
        // fiore colorato (raro)
        const flowerColors = ['#FFFFFF', '#FFD850', '#E04050', '#A050E0'];
        drawFlower(ctx, px - 1, yTop - 1, flowerColors[Math.floor(r() * flowerColors.length)]);
      }
    }

    // Strato 2: pietre piccole (medio-frequenti)
    const stoneStep = 18;
    const startSX = Math.floor((viewLeft - 50) / stoneStep) * stoneStep;
    for (let wx = startSX; wx < viewLeft + this.W + 50; wx += stoneStep) {
      const r = seededRand(hashAt(wx, 7733));
      const sx = wx - viewLeft;
      if (sx < -10 || sx >= this.W + 10) continue;
      const px = Math.floor(sx);
      if (px < 0 || px >= this.W) continue;
      const yTop = Math.floor(heights[px]);
      const choice = r();
      if (choice < 0.25) {
        const w = 2 + Math.floor(r() * 3);
        const h = 1 + Math.floor(r() * 2);
        drawRock(ctx, px - Math.floor(w / 2), yTop - h, w, h, palette);
      } else if (choice < 0.30) {
        drawBush(ctx, px, yTop - 1, 0.8, palette);
      }
    }

    // Strato 3: dettagli emergenti scenici (rari, scalano con varianza nel mondo)
    const emergStep = 80;
    const startEX = Math.floor((viewLeft - 100) / emergStep) * emergStep;
    for (let wx = startEX; wx < viewLeft + this.W + 100; wx += emergStep) {
      const r = seededRand(hashAt(wx, 55511));
      const sx = wx - viewLeft;
      if (sx < -30 || sx >= this.W + 30) continue;
      const px = Math.floor(sx);
      const choiceWX = wx; // serve per get heights[px] safe
      if (px < 0 || px >= this.W) continue;
      const yTop = Math.floor(heights[px]);
      const choice = r();
      if (choice < 0.35) {
        // pietrone scenico
        drawBoulder(ctx, px, yTop - 4, palette);
      } else if (choice < 0.55) {
        // alberello in primo piano
        drawDetailedTree(ctx, px, yTop, 1, palette.tree, Math.floor(r() * 3));
      } else if (choice < 0.65) {
        // cespuglio grande
        drawBush(ctx, px, yTop - 2, 1.5, palette);
      }
      // altre 35% niente (riposo visivo)
    }

    return { runnerScreenX, runnerY: heights[Math.floor(runnerScreenX)] };
  }

  drawFog(ctx, fog) {
    if (fog <= 0) return;
    const a = 0.45 * fog;
    ctx.fillStyle = `rgba(220,220,225,${a})`;
    ctx.fillRect(0, 0, this.W, this.groundY + 10);
    ctx.fillStyle = `rgba(220,220,225,${a * 0.6})`;
    for (let y = this.groundY - 30; y < this.groundY + 5; y += 4) {
      ctx.fillRect(0, y, this.W, 2);
    }
  }

  drawRain(ctx, rain, t) {
    if (rain <= 0) return;
    ctx.fillStyle = `rgba(180,200,220,0.7)`;
    const drops = Math.floor(rain * 100);
    for (let i = 0; i < drops; i++) {
      const x = ((i * 73 + t * 240) % this.W);
      const y = ((i * 41 + t * 700) % this.H);
      ctx.fillRect(x, y, 1, 4);
    }
  }
}


// ============================================================================
// CASTELLO DI ALBA FUCENS — RUDERE MEDIEVALE su colle San Nicola
// ============================================================================
// Riferimento: rudere reale del castello di Alba Fucens (XIII secolo, distrutto
// dai terremoti). Una sola torre rimasta in piedi (mezza crollata), mura perimetrali
// basse e diroccate, pietra calcare bianco-beige tipico abruzzese.
// Anchor (x, y) = piede del colle, esattamente sul sentiero.
// ============================================================================

/** Disegna il castello di Alba Fucens (rudere). x,y = piede colle = sentiero. */
export function drawCastle(ctx, x, y) {
  // ===== COLLE SAN NICOLA =====
  // Forma a "panettone": ampia e arrotondata, rivestita di erba.
  // Base 130 px, cima 70 px, altezza 32 px (basso e largo).
  const baseW = 130, topW = 70, hillH = 32;
  for (let layer = 0; layer < hillH; layer++) {
    const layerY = y - layer;
    const t = layer / (hillH - 1);
    const w = baseW + (topW - baseW) * Math.pow(t, 0.55);
    let c;
    if (t < 0.20) c = '#3a4e22';        // ombra base
    else if (t < 0.50) c = '#4e6a2a';   // verde medio
    else if (t < 0.80) c = '#6e8a4a';   // verde chiaro
    else c = '#8eaa5a';                  // luce alta
    ctx.fillStyle = c;
    const half = Math.floor(w / 2);
    ctx.fillRect(Math.floor(x - half), Math.floor(layerY), half * 2, 1);
  }
  // bordi smussati
  ctx.fillStyle = '#3a4e22';
  for (let i = 0; i < 4; i++) {
    const ly = y - i;
    const w = baseW - i * 2;
    const half = Math.floor(w / 2);
    ctx.fillRect(Math.floor(x - half - 1), Math.floor(ly), 1, 1);
    ctx.fillRect(Math.floor(x + half), Math.floor(ly), 1, 1);
  }
  // ombra a terra
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  drawPixelOval(ctx, x, y + 2, baseW + 10, 4);
  // ciuffi erba sparsi
  for (let i = 0; i < 22; i++) {
    const r = seededRand(((x * 13) + i * 37) >>> 0);
    const tx = x - 60 + Math.floor(r() * 120);
    const tlayer = Math.floor(r() * (hillH - 6)) + 3;
    const ty = y - tlayer;
    ctx.fillStyle = '#2c3a16';
    ctx.fillRect(tx, ty, 1, 2);
    ctx.fillStyle = '#5a7a32';
    ctx.fillRect(tx + 1, ty, 1, 1);
  }

  // ===== SENTIERINO che sale al rudere (zigzag chiaro) =====
  ctx.fillStyle = '#a07c54';
  for (let i = 0; i < 16; i++) {
    const sy = y - i * 2;
    const sx = x + 28 - Math.floor(i * 1.7);
    ctx.fillRect(sx, sy, 3, 1);
  }
  for (let i = 0; i < 6; i++) {
    const sy = y - 32 - i;
    const sx = x + 0 + i * 2;
    ctx.fillRect(sx, sy, 3, 1);
  }
  ctx.fillStyle = '#7a5e36';
  for (let i = 0; i < 16; i++) {
    const sy = y - i * 2;
    const sx = x + 28 - Math.floor(i * 1.7);
    ctx.fillRect(sx, sy + 1, 3, 1);
  }

  // ===== RUDERE: torre principale + mura crollate =====
  // Pietra calcare chiara (Alba Fucens è in calcare bianco-beige):
  const STONE_LIGHT = '#d4c8a8';   // pietra alla luce
  const STONE_MID   = '#a89878';   // pietra ombra
  const STONE_DARK  = '#7a6e54';   // pietra ombra profonda
  const STONE_OUTLINE = '#3a3024'; // outline
  const MORTAR = '#5e5240';         // malta tra le pietre

  const cy = y - hillH;  // cima del colle (= base del rudere)
  const cx = x;

  // ===== MURO PERIMETRALE BASSO (rovinato) =====
  // Lato sinistro: pezzo di muro irregolare
  for (let mx = -28; mx <= -10; mx++) {
    const mh = 4 + Math.abs((mx * 17) % 5);
    if (mx === -22 || mx === -16) continue;  // crolli
    ctx.fillStyle = STONE_MID;
    ctx.fillRect(cx + mx, cy - mh, 1, mh);
    if (mx === -28 || mx === -10) {
      ctx.fillStyle = STONE_OUTLINE;
      ctx.fillRect(cx + mx, cy - mh, 1, mh);
    } else if ((mx % 3) === 0) {
      // luce stabile sul filare alto, basata su coordinata WORLD (mx) non SCREEN
      ctx.fillStyle = STONE_LIGHT;
      ctx.fillRect(cx + mx, cy - mh + 1, 1, 1);
    }
    // outline base
    ctx.fillStyle = STONE_OUTLINE;
    ctx.fillRect(cx + mx, cy, 1, 1);
  }
  // Lato destro: pezzo di muro più lungo ma con una grossa breccia
  for (let mx = 12; mx <= 30; mx++) {
    const mh = 5 + Math.abs((mx * 23) % 4);
    if (mx >= 18 && mx <= 22) continue;  // breccia grande
    ctx.fillStyle = STONE_MID;
    ctx.fillRect(cx + mx, cy - mh, 1, mh);
    if (mx === 30 || mx === 12) {
      ctx.fillStyle = STONE_OUTLINE;
      ctx.fillRect(cx + mx, cy - mh, 1, mh);
    } else if ((mx % 3) === 1) {
      ctx.fillStyle = STONE_LIGHT;
      ctx.fillRect(cx + mx, cy - mh + 1, 1, 1);
    }
    ctx.fillStyle = STONE_OUTLINE;
    ctx.fillRect(cx + mx, cy, 1, 1);
  }

  // ===== TORRE PRINCIPALE — quadrata, alta, mezza crollata =====
  // Posizione: leggermente decentrata a sinistra, larga 14 px, alta fino a 32 px
  // Il lato destro è più basso (crollato a metà).
  const tx = cx - 8;        // angolo sx torre
  const tw = 14;             // larghezza
  const tHmax = 32;          // altezza max (lato sx, intatto)
  const tHmin = 16;          // altezza min (lato dx, crollato)

  // Base muro: rettangolo principale con altezza che decresce
  for (let dx = 0; dx < tw; dx++) {
    // altezza per ogni colonna: lineare interpolata + irregolarità
    const t = dx / (tw - 1);
    let h = tHmax - (tHmax - tHmin) * t;
    // crepe e irregolarità nel profilo crollato (lato dx più rovinato)
    if (dx >= 8) {
      h += ((dx * 31 + 17) % 4) - 2;  // -2..+1 px irregolare
    }
    h = Math.floor(h);
    // riempimento pietra
    ctx.fillStyle = STONE_MID;
    ctx.fillRect(tx + dx, cy - h, 1, h);
    // ombra lato destro della torre
    if (dx >= tw - 3) {
      ctx.fillStyle = STONE_DARK;
      ctx.fillRect(tx + dx, cy - h, 1, h);
    }
    // luce lato sinistro
    if (dx <= 1) {
      ctx.fillStyle = STONE_LIGHT;
      ctx.fillRect(tx + dx, cy - h, 1, h);
    }
    // dithering interno disattivato (era dipendente da coordinate schermo
    // → causava puntini in movimento). Lascio solo le 3 sfumature base.
    // OUTLINE in cima
    ctx.fillStyle = STONE_OUTLINE;
    ctx.fillRect(tx + dx, cy - h - 1, 1, 1);
  }
  // outline base
  ctx.fillStyle = STONE_OUTLINE;
  ctx.fillRect(tx, cy, tw, 1);
  ctx.fillRect(tx - 1, cy - tHmax, 1, tHmax);
  ctx.fillRect(tx + tw, cy - tHmin, 1, tHmin);

  // Linee orizzontali (filari di pietre) - ogni 4 px
  ctx.fillStyle = MORTAR;
  for (let py = cy - 4; py >= cy - tHmax; py -= 4) {
    // linea solo dove c'è ancora muro a quella altezza
    for (let dx = 0; dx < tw; dx++) {
      const t = dx / (tw - 1);
      let h = tHmax - (tHmax - tHmin) * t;
      if (dx >= 8) h += ((dx * 31 + 17) % 4) - 2;
      h = Math.floor(h);
      if (cy - py <= h) {
        ctx.fillRect(tx + dx, py, 1, 1);
      }
    }
  }

  // FINESTRA stretta gotica nella torre (alta, sul lato intatto)
  ctx.fillStyle = STONE_OUTLINE;
  ctx.fillRect(tx + 4, cy - 22, 3, 8);
  ctx.fillRect(tx + 5, cy - 23, 1, 1);  // arco superiore

  // PORTONE CROLLATO alla base (arco di pietra sopravvissuto)
  ctx.fillStyle = STONE_OUTLINE;
  ctx.fillRect(tx + 5, cy - 8, 5, 8);    // foro nero del portone
  ctx.fillStyle = '#1a1410';
  ctx.fillRect(tx + 5, cy - 7, 5, 7);
  // arcata di pietra sopra (semicircolare a 5 colonne)
  ctx.fillStyle = STONE_LIGHT;
  ctx.fillRect(tx + 5, cy - 9, 5, 1);
  ctx.fillStyle = STONE_OUTLINE;
  ctx.fillRect(tx + 5, cy - 10, 5, 1);
  ctx.fillRect(tx + 6, cy - 11, 3, 1);
  ctx.fillStyle = STONE_LIGHT;
  ctx.fillRect(tx + 6, cy - 10, 3, 1);

  // PIETRE CROLLATE attorno alla torre (sui prati ai lati)
  ctx.fillStyle = STONE_MID;
  ctx.fillRect(cx - 18, cy - 2, 4, 2);
  ctx.fillRect(cx - 14, cy - 1, 3, 1);
  ctx.fillRect(cx + 8, cy - 2, 4, 2);
  ctx.fillRect(cx + 18, cy - 3, 5, 3);
  ctx.fillStyle = STONE_OUTLINE;
  ctx.fillRect(cx - 18, cy, 4, 1);
  ctx.fillRect(cx + 18, cy, 5, 1);
  ctx.fillStyle = STONE_LIGHT;
  ctx.fillRect(cx - 18, cy - 2, 1, 1);
  ctx.fillRect(cx + 18, cy - 3, 1, 1);

  // Edera piccola sui muri rimasti (verde scuro su pietra)
  ctx.fillStyle = '#3a5a22';
  for (let i = 0; i < 4; i++) {
    const ex = tx + 1 + i * 4;
    const eh = 3 + (i % 2) * 2;
    ctx.fillRect(ex, cy - eh, 1, eh);
  }
  ctx.fillStyle = '#5e8230';
  for (let i = 0; i < 4; i++) {
    const ex = tx + 1 + i * 4;
    const eh = 3 + (i % 2) * 2;
    ctx.fillRect(ex, cy - eh + 1, 1, eh - 1);
  }

  // ===== CARTELLO "KM 11" alla base destra del colle =====
  const signX = x + 50, signY = y - 8;
  ctx.fillStyle = '#3a2c1e';
  ctx.fillRect(signX + 5, signY, 2, 8);  // palo
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(signX, signY - 9, 16, 10); // pannello bianco
  ctx.fillStyle = '#000';
  ctx.fillRect(signX - 1, signY - 9, 1, 10);
  ctx.fillRect(signX + 16, signY - 9, 1, 10);
  ctx.fillRect(signX, signY - 10, 16, 1);
  ctx.fillRect(signX, signY + 1, 16, 1);
  // K
  ctx.fillRect(signX + 1, signY - 7, 1, 6);
  ctx.fillRect(signX + 2, signY - 5, 1, 1);
  ctx.fillRect(signX + 3, signY - 7, 1, 2);
  ctx.fillRect(signX + 3, signY - 4, 1, 2);
  // M
  ctx.fillRect(signX + 5, signY - 7, 1, 6);
  ctx.fillRect(signX + 6, signY - 6, 1, 1);
  ctx.fillRect(signX + 7, signY - 7, 1, 6);
  // 11
  ctx.fillRect(signX + 10, signY - 7, 1, 6);
  ctx.fillRect(signX + 13, signY - 7, 1, 6);
}


// ============================================================================
// ANFITEATRO ROMANO DI ALBA FUCENS
// ============================================================================
// Riferimento: rovina romana del I secolo a.C. Forma OVALE concentrica con
// gradinate (cavea), muro perimetrale basso in pietra calcare, archi alla base
// del lato esterno, vegetazione che cresce sopra le rovine.
// Anchor (x, y) = centro del bordo basso esterno, sul sentiero.
// Il runner passa "attraverso" l'anfiteatro a terra, quindi la parte ANTERIORE
// dell'arena si vede in primo piano e il runner ci passa davanti.
// ============================================================================

/** Disegna l'anfiteatro romano di Alba Fucens.
 * Anchor (x, y) = bordo basso esterno dell'anfiteatro, esattamente sul sentiero.
 * Il monumento si sviluppa INTERAMENTE sopra al sentiero (verso l'alto),
 * così è completamente visibile e non viene tagliato dal sentiero in primo piano. */
export function drawAmphitheater(ctx, x, y) {
  const STONE_LIGHT = '#d4c8a8';
  const STONE_MID   = '#a89878';
  const STONE_DARK  = '#7a6e54';
  const STONE_OUTLINE = '#3a3024';
  const SHADOW_INNER = '#4a3e2a';

  // Dimensioni: ovale largo 90, alto 24 (più piatto).
  // L'ovale si sviluppa SOPRA y (verso l'alto). Centro = y - ovalH/2.
  const ovalW = 90, ovalH = 24;
  const cx = x;
  const cy = y - ovalH / 2;

  // ===== ARENA INTERNA (terra battuta dentro l'ovale) =====
  for (let dy = -ovalH/2; dy <= ovalH/2; dy++) {
    const ty = dy / (ovalH/2);
    const wHalf = Math.floor(ovalW / 2 * Math.sqrt(Math.max(0, 1 - ty * ty)));
    if (wHalf < 2) continue;
    ctx.fillStyle = '#9a8868';
    ctx.fillRect(cx - wHalf + 4, cy + dy, wHalf * 2 - 8, 1);
  }
  // ombra interna sul lato lontano (alto)
  for (let dy = -ovalH/2; dy <= -ovalH/4; dy++) {
    const ty = dy / (ovalH/2);
    const wHalf = Math.floor(ovalW / 2 * Math.sqrt(Math.max(0, 1 - ty * ty)));
    if (wHalf < 4) continue;
    ctx.fillStyle = SHADOW_INNER;
    ctx.fillRect(cx - wHalf + 6, cy + dy, wHalf * 2 - 12, 1);
  }

  // ===== GRADINATE (CAVEA) — 3 anelli concentrici sul lato superiore =====
  const ringColors = [STONE_LIGHT, STONE_MID, STONE_DARK];
  for (let ring = 0; ring < 3; ring++) {
    const rw = ovalW / 2 - 3 - ring * 4;
    const rh = ovalH / 2 - 1 - ring * 2;
    if (rw < 5 || rh < 2) break;
    ctx.fillStyle = ringColors[ring];
    // Solo arco superiore (angle PI..2PI = lato alto)
    for (let angle = Math.PI; angle <= 2 * Math.PI; angle += 0.04) {
      const px = Math.floor(cx + rw * Math.cos(angle));
      const py = Math.floor(cy + rh * Math.sin(angle));
      ctx.fillRect(px, py, 1, 1);
    }
  }

  // ===== MURO PERIMETRALE (parte ANTERIORE = bordo basso ovale) =====
  const wallH = 6;
  for (let dx = -ovalW/2; dx <= ovalW/2; dx++) {
    const t = dx / (ovalW/2);
    if (Math.abs(t) > 1) continue;
    const baseY = Math.floor(cy + (ovalH/2) * Math.sqrt(Math.max(0, 1 - t * t)));
    for (let dy = 0; dy < wallH; dy++) {
      const py = baseY - dy;
      ctx.fillStyle = STONE_MID;
      ctx.fillRect(cx + Math.floor(dx), py, 1, 1);
      if (dy === wallH - 1) {
        ctx.fillStyle = STONE_LIGHT;
        ctx.fillRect(cx + Math.floor(dx), py, 1, 1);
      }
      if (dy === 0) {
        ctx.fillStyle = STONE_DARK;
        ctx.fillRect(cx + Math.floor(dx), py, 1, 1);
      }
    }
    ctx.fillStyle = STONE_OUTLINE;
    ctx.fillRect(cx + Math.floor(dx), baseY + 1, 1, 1);
  }

  // ===== ARCATE (3 archi visibili nel lato anteriore) =====
  for (let i = 0; i < 3; i++) {
    const ax = cx - 24 + i * 24;
    const t = (ax - cx) / (ovalW/2);
    const baseY = Math.floor(cy + (ovalH/2) * Math.sqrt(Math.max(0, 1 - t * t)));
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(ax - 2, baseY - 4, 5, 4);
    ctx.fillStyle = STONE_OUTLINE;
    ctx.fillRect(ax - 2, baseY - 5, 5, 1);
    ctx.fillRect(ax - 1, baseY - 6, 3, 1);
    ctx.fillStyle = STONE_LIGHT;
    ctx.fillRect(ax - 1, baseY - 5, 3, 1);
  }

  // ===== ROVINE: pietre crollate sparse sul sentiero ai lati =====
  ctx.fillStyle = STONE_MID;
  ctx.fillRect(cx - ovalW/2 - 4, y - 2, 4, 2);
  ctx.fillRect(cx + ovalW/2 + 1, y - 3, 5, 3);
  ctx.fillStyle = STONE_OUTLINE;
  ctx.fillRect(cx - ovalW/2 - 4, y, 4, 1);
  ctx.fillRect(cx + ovalW/2 + 1, y, 5, 1);
  ctx.fillStyle = STONE_LIGHT;
  ctx.fillRect(cx - ovalW/2 - 4, y - 2, 1, 1);
  ctx.fillRect(cx + ovalW/2 + 1, y - 3, 1, 1);

  // ===== CARTELLO "KM 16" =====
  const signX = x + 50, signY = y - 8;
  ctx.fillStyle = '#3a2c1e';
  ctx.fillRect(signX + 5, signY, 2, 8);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(signX, signY - 9, 16, 10);
  ctx.fillStyle = '#000';
  ctx.fillRect(signX - 1, signY - 9, 1, 10);
  ctx.fillRect(signX + 16, signY - 9, 1, 10);
  ctx.fillRect(signX, signY - 10, 16, 1);
  ctx.fillRect(signX, signY + 1, 16, 1);
  // K
  ctx.fillRect(signX + 1, signY - 7, 1, 6);
  ctx.fillRect(signX + 2, signY - 5, 1, 1);
  ctx.fillRect(signX + 3, signY - 7, 1, 2);
  ctx.fillRect(signX + 3, signY - 4, 1, 2);
  // M
  ctx.fillRect(signX + 5, signY - 7, 1, 6);
  ctx.fillRect(signX + 6, signY - 6, 1, 1);
  ctx.fillRect(signX + 7, signY - 7, 1, 6);
  // 16
  ctx.fillRect(signX + 10, signY - 7, 1, 6);
  ctx.fillRect(signX + 12, signY - 7, 3, 1);
  ctx.fillRect(signX + 12, signY - 5, 3, 1);
  ctx.fillRect(signX + 12, signY - 2, 3, 1);
  ctx.fillRect(signX + 12, signY - 5, 1, 4);
  ctx.fillRect(signX + 14, signY - 4, 1, 3);
}


/** Arco di partenza. Anchor (x, y) = centro della linea di partenza a terra.
 *  Stile: striscione verde con scritta "VIA!" + bandierine triangolari. */
export function drawStartArch(ctx, x, y, t) {
  // pali laterali
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 24, y - 50, 4, 50);
  ctx.fillRect(x + 20, y - 50, 4, 50);
  ctx.fillStyle = '#5e5e6a';
  ctx.fillRect(x - 23, y - 49, 2, 49);
  ctx.fillRect(x + 21, y - 49, 2, 49);
  // sacchetti base
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 28, y - 4, 12, 4);
  ctx.fillRect(x + 16, y - 4, 12, 4);
  ctx.fillStyle = '#7a6244';
  ctx.fillRect(x - 27, y - 3, 10, 2);
  ctx.fillRect(x + 17, y - 3, 10, 2);

  // striscione verde "VIA!"
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 24, y - 50, 48, 1);
  ctx.fillRect(x - 24, y - 38, 48, 1);
  ctx.fillStyle = '#1A8E3A';
  ctx.fillRect(x - 23, y - 49, 46, 11);
  ctx.fillStyle = '#3FC060';
  ctx.fillRect(x - 23, y - 49, 46, 1);
  ctx.fillStyle = '#0E5020';
  ctx.fillRect(x - 23, y - 39, 46, 1);

  // testo "VIA!" centrato (4 caratteri ~12px)
  ctx.fillStyle = '#FFFFFF';
  const tY = y - 46;
  // V (5x6)
  ctx.fillRect(x - 11, tY, 1, 4); ctx.fillRect(x - 9, tY, 1, 4);
  ctx.fillRect(x - 10, tY + 4, 1, 1);
  // I (1x6)
  ctx.fillRect(x - 6, tY, 1, 6);
  // A (5x6)
  ctx.fillRect(x - 4, tY + 1, 1, 5); ctx.fillRect(x - 2, tY + 1, 1, 5);
  ctx.fillRect(x - 3, tY, 1, 1); ctx.fillRect(x - 3, tY + 3, 1, 1);
  // !
  ctx.fillRect(x + 1, tY, 1, 4); ctx.fillRect(x + 1, tY + 5, 1, 1);

  // bandierine triangolari sopra (verdi + bianche)
  const flagColors = ['#3CC23C', '#FFFFFF', '#1A8E3A', '#FFD700', '#3CC23C', '#FFFFFF'];
  for (let i = 0; i < 6; i++) {
    const fx = x - 20 + i * 8;
    const wave = Math.sin(t * 4 + i * 0.7) * 1;
    const fy = y - 56 + Math.floor(wave);
    ctx.fillStyle = flagColors[i];
    ctx.fillRect(fx, fy, 4, 3);
    ctx.fillRect(fx + 1, fy + 3, 2, 1);
    ctx.fillRect(fx + 2, fy + 4, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillRect(fx, fy - 1, 4, 1);
  }

  // linea di partenza a terra (verde / bianco a strisce)
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#1A8E3A' : '#FFFFFF';
    ctx.fillRect(x - 20 + i * 4, y - 1, 4, 2);
  }
}


/** Arco di traguardo. Anchor (x, y) = centro della linea del traguardo a terra. */
export function drawFinishArch(ctx, x, y, t) {
  // pali laterali (l'arco è alto 50 sopra il sentiero)
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 24, y - 50, 4, 50);
  ctx.fillRect(x + 20, y - 50, 4, 50);
  ctx.fillStyle = '#5e5e6a';
  ctx.fillRect(x - 23, y - 49, 2, 49);
  ctx.fillRect(x + 21, y - 49, 2, 49);
  // base sx/dx (sacchetti di sabbia)
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 28, y - 4, 12, 4);
  ctx.fillRect(x + 16, y - 4, 12, 4);
  ctx.fillStyle = '#7a6244';
  ctx.fillRect(x - 27, y - 3, 10, 2);
  ctx.fillRect(x + 17, y - 3, 10, 2);

  // striscione superiore "ARRIVO" (12 px alto)
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 24, y - 50, 48, 1);
  ctx.fillRect(x - 24, y - 38, 48, 1);
  ctx.fillStyle = '#C8302A';
  ctx.fillRect(x - 23, y - 49, 46, 11);
  ctx.fillStyle = '#E0524A';
  ctx.fillRect(x - 23, y - 49, 46, 1);
  ctx.fillStyle = '#8C1410';
  ctx.fillRect(x - 23, y - 39, 46, 1);

  // testo "ARRIVO" sullo striscione
  ctx.fillStyle = '#FFFFFF';
  const tY = y - 46;
  // A
  ctx.fillRect(x - 18, tY + 1, 1, 5); ctx.fillRect(x - 16, tY + 1, 1, 5);
  ctx.fillRect(x - 17, tY, 1, 1); ctx.fillRect(x - 17, tY + 3, 1, 1);
  // R
  ctx.fillRect(x - 14, tY, 1, 6); ctx.fillRect(x - 13, tY, 1, 1);
  ctx.fillRect(x - 13, tY + 3, 1, 1); ctx.fillRect(x - 12, tY + 1, 1, 2);
  ctx.fillRect(x - 12, tY + 4, 1, 2);
  // R
  ctx.fillRect(x - 10, tY, 1, 6); ctx.fillRect(x - 9, tY, 1, 1);
  ctx.fillRect(x - 9, tY + 3, 1, 1); ctx.fillRect(x - 8, tY + 1, 1, 2);
  ctx.fillRect(x - 8, tY + 4, 1, 2);
  // I
  ctx.fillRect(x - 6, tY, 1, 6);
  // V
  ctx.fillRect(x - 4, tY, 1, 4); ctx.fillRect(x - 2, tY, 1, 4);
  ctx.fillRect(x - 3, tY + 4, 1, 1);
  // O
  ctx.fillRect(x, tY, 1, 6); ctx.fillRect(x + 2, tY, 1, 6);
  ctx.fillRect(x + 1, tY, 1, 1); ctx.fillRect(x + 1, tY + 5, 1, 1);

  // bandierine triangolari sopra
  const flagColors = ['#FFD700', '#3CC23C', '#C8302A', '#FFFFFF', '#1F4FA8', '#FFD700'];
  for (let i = 0; i < 6; i++) {
    const fx = x - 20 + i * 8;
    const wave = Math.sin(t * 4 + i * 0.7) * 1;
    const fy = y - 56 + Math.floor(wave);
    ctx.fillStyle = flagColors[i];
    ctx.fillRect(fx, fy, 4, 3);
    ctx.fillRect(fx + 1, fy + 3, 2, 1);
    ctx.fillRect(fx + 2, fy + 4, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillRect(fx, fy - 1, 4, 1);
  }

  // linea del traguardo a terra (scacchiera bianco/nero) a livello sentiero
  for (let i = 0; i < 10; i++) {
    const lx = x - 25 + i * 5;
    ctx.fillStyle = (i & 1) ? '#FFFFFF' : '#000000';
    ctx.fillRect(lx, y - 1, 5, 3);
  }

  // logo Alba dei Marsi sul lato sx (rosso/verde)
  ctx.fillStyle = '#108040';
  ctx.fillRect(x - 27, y - 17, 6, 9);
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 28, y - 17, 1, 9);
  ctx.fillRect(x - 21, y - 17, 1, 9);
  ctx.fillRect(x - 27, y - 18, 6, 1);
  ctx.fillRect(x - 27, y - 8, 6, 1);
}

// I colori delle MONTAGNE devono essere coerenti col TERRENO (marrone-verde),
// NON blu come il cielo. Le palette atmospheric sfumano dal lontano (più chiaro/azzurrato per
// atmospheric perspective) al vicino (più saturo, verde-marrone).
export const AmbientPalettes = {
  atrs_brand: {
    // === MI2-STYLE PALETTE (campionata dalle reference MI2 esterno) ===
    // Atmospheric perspective forte: il lontano vira al bluastro-grigio del cielo,
    // il vicino è saturo verde-marrone tipo abruzzese.
    farMountain: {
      // Monti lontani: quasi disciolti nel cielo (atmospheric perspective forte)
      light: '#b5c2c5', mid: '#869099', shadow: '#5d6a73',
      snow: '#e6ecf0', snowShadow: '#a8b8c0', rock: '#42505c',
    },
    midMountain: {
      // Catena media: verde-grigio MI2, desaturata
      light: '#7e9270', mid: '#566a4c', shadow: '#384a30',
      snow: null, snowShadow: null, rock: '#28341e',
    },
    bosco: {
      // Bosco vicino: verdi MI2 saturi ma non al massimo (palette esterno MI2)
      // Riferimenti campionati: #3e724c, #56955d, #1b3f3c
      light: '#56955d', mid: '#3e724c', shadow: '#1b3f3c',
      snow: null, rock: '#172629',
    },
    tree: {
      // Albero stile MI2: 5 toni di verde + tronco caldo
      barkDark: '#3a2626', barkLight: '#663024',
      leafShadow: '#172629', leafDark: '#1b3f3c',
      leafMid: '#3e724c', leafLight: '#56955d',
      leafHighlight: '#86b255', leafOutline: '#0c1409',
    },
    // Erba sentiero: verdi MI2 più chiari (#9ebf38, #86b255 da campionatura)
    trailGrass: '#86b255', trailGrassDark: '#56955d',
    trailGrassOutline: '#0c1409',
    // Terra/sterrato: marroni caldi MI2 (#945539, #bf7b4b, #b5a06f da campionatura)
    trailDirt: '#945539', trailDirtLight: '#bf7b4b',
    trailDirtDark: '#663024', trailDirtDeep: '#3a2626',
    trailBandA: '#7a4828', trailBandB: '#52381e',
    // Rocce con palette pittorica MI2
    rockLight: '#b5a06f', rockMid: '#907a72', rockDark: '#625364',
    // Cespugli: stessi verdi del bosco
    bushLight: '#9ebf38', bushMid: '#56955d', bushDark: '#3e724c',
    bushHighlight: '#cbd699',
    // Erba in primo piano: chiari saturi
    grassLight: '#9ebf38', grassMid: '#86b255', grassDark: '#3e724c',
  },

  dawn_mountains: {
    farMountain: {
      light: '#c8a89c', mid: '#9a7e74', shadow: '#5e4a40',
      snow: '#FFE8DC', snowShadow: '#D8B4C8', rock: '#3a2a20',
    },
    midMountain: {
      light: '#7a6c4a', mid: '#544622', shadow: '#322610',
      snow: null, snowShadow: null, rock: '#1a1208',
    },
    bosco: {
      light: '#4A6B30', mid: '#324E22', shadow: '#1A2E14',
      snow: null, rock: '#0E1A08',
    },
    tree: {
      barkDark: '#2A1C10', barkLight: '#4A3220',
      leafShadow: '#0E1E08', leafDark: '#1E3A14',
      leafMid: '#2E5A20', leafLight: '#4A7E2E',
      leafHighlight: '#6FA040', leafOutline: '#0E1E08',
    },
    trailGrass: '#5A7C2E', trailGrassDark: '#3E5820',
    trailGrassOutline: '#1E2C12',
    trailDirt: '#7E5C36', trailDirtLight: '#9A7448',
    trailDirtDark: '#5C4226', trailDirtDeep: '#3E2C18',
    trailBandA: '#6E4E2E', trailBandB: '#52381E',
    rockLight: '#A89878', rockMid: '#7E6E54', rockDark: '#564832',
    bushLight: '#5E8038', bushMid: '#3E5A22', bushDark: '#243814',
    bushHighlight: '#9CC04E',
    grassLight: '#9CC04E', grassMid: '#5E7E2A', grassDark: '#2E4214',
  },

  day_alpine: {
    farMountain: {
      light: '#a8b0a0', mid: '#74807c', shadow: '#48564e',
      snow: '#FFFFFF', snowShadow: '#A8C0D8', rock: '#283024',
    },
    midMountain: {
      light: '#5e7044', mid: '#3e5226', shadow: '#1e3010',
      snow: null, snowShadow: null, rock: '#0e1808',
    },
    bosco: {
      light: '#5E8230', mid: '#3E5E20', shadow: '#1E3010',
      snow: null, rock: '#0E1A08',
    },
    tree: {
      barkDark: '#2A1C10', barkLight: '#503824',
      leafShadow: '#0A2010', leafDark: '#1E3E14',
      leafMid: '#346022', leafLight: '#558A2E',
      leafHighlight: '#7EBA40', leafOutline: '#0E1E08',
    },
    trailGrass: '#6E9230', trailGrassDark: '#4E6A22',
    trailGrassOutline: '#1E2C12',
    trailDirt: '#967040', trailDirtLight: '#B48E58',
    trailDirtDark: '#6E5028', trailDirtDeep: '#4A361A',
    trailBandA: '#806038', trailBandB: '#604224',
    rockLight: '#B8A888', rockMid: '#8E7E60', rockDark: '#605238',
    bushLight: '#6E9238', bushMid: '#4A6A22', bushDark: '#2C4214',
    bushHighlight: '#A8D050',
    grassLight: '#A8D050', grassMid: '#6E9230', grassDark: '#3E5618',
  },

  dusk_forest: {
    farMountain: {
      light: '#88708c', mid: '#5a4868', shadow: '#322240',
      snow: '#F0C8A0', snowShadow: '#A07C6E', rock: '#181024',
    },
    midMountain: {
      light: '#564028', mid: '#382818', shadow: '#1a120a',
      snow: null, snowShadow: null, rock: '#100804',
    },
    bosco: {
      light: '#3A5028', mid: '#243818', shadow: '#0E1808',
      snow: null, rock: '#080A04',
    },
    tree: {
      barkDark: '#1A0E08', barkLight: '#382418',
      leafShadow: '#04100A', leafDark: '#142A10',
      leafMid: '#244218', leafLight: '#386020',
      leafHighlight: '#588A30', leafOutline: '#080E04',
    },
    trailGrass: '#4A6822', trailGrassDark: '#2E4218',
    trailGrassOutline: '#0E1A08',
    trailDirt: '#6E4E2E', trailDirtLight: '#8A6A48',
    trailDirtDark: '#4E3818', trailDirtDeep: '#2E2010',
    trailBandA: '#5C3E22', trailBandB: '#3E2812',
    rockLight: '#806E58', rockMid: '#564636', rockDark: '#382A1E',
    bushLight: '#4E6E28', bushMid: '#324812', bushDark: '#1A2808',
    bushHighlight: '#7AA040',
    grassLight: '#7AA040', grassMid: '#4A6822', grassDark: '#2A3E12',
  },
};
