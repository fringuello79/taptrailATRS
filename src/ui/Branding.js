// src/ui/Branding.js
// Carica i loghi della serie ATRS e delle gare. Definisce i colori brand.

export const BrandColors = {
  navyDark:   '#001a4d',  // blu navy ATRS scuro
  navy:       '#003080',  // blu navy ATRS principale
  navyLight:  '#0040a0',  // blu navy chiaro
  green:      '#00A040',  // verde ATRS
  greenDark:  '#108040',  // verde Alba
  greenLight: '#3FD070',  // verde acceso
  white:      '#F0F0F0',  // bianco/avorio
  whitePure:  '#FFFFFF',
  greyDark:   '#303030',  // grigio antracite Alba
  greyMid:    '#606060',
  black:      '#000000',
};

class LogoCache {
  constructor() {
    this.cache = new Map();
    this.loading = new Map();
  }

  /** Avvia caricamento; ritorna immagine se già pronta, null altrimenti. */
  get(path) {
    if (this.cache.has(path)) return this.cache.get(path);
    if (!this.loading.has(path)) {
      const img = new Image();
      this.loading.set(path, img);
      img.onload = () => {
        this.cache.set(path, img);
        this.loading.delete(path);
      };
      img.onerror = () => {
        this.loading.delete(path);
      };
      img.src = path;
    }
    return null;
  }

  /** Pre-carica una lista di percorsi. */
  preload(paths) {
    for (const p of paths) this.get(p);
  }
}

export const logoCache = new LogoCache();

/** Disegna un logo a (x,y) con larghezza w, mantenendo aspect ratio. */
export function drawLogo(ctx, path, x, y, w) {
  const img = logoCache.get(path);
  if (!img) return false;
  const aspect = img.height / img.width;
  const h = w * aspect;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, x, y, w, h);
  return true;
}

/** Disegna lo sfondo branded ATRS COMPLETO:
 *  Tinta navy + topografia + banner+sponsor in basso */
export function drawAtrsBackground(ctx, W, H, opts = {}) {
  const showSponsor = opts.showSponsor !== false;
  const showTopography = opts.showTopography !== false;

  // Sfondo blu navy
  ctx.fillStyle = '#0a2050';
  ctx.fillRect(0, 0, W, H);

  // Sottile gradient verticale
  ctx.fillStyle = 'rgba(0, 30, 100, 0.4)';
  for (let y = 0; y < H; y += 2) {
    ctx.fillRect(0, y, W, 1);
  }

  // Topografia
  if (showTopography) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      const baseY = (i * 60 + 40) % H;
      ctx.moveTo(0, baseY);
      for (let x = 0; x < W; x += 8) {
        const yo = Math.sin((x + i * 50) * 0.02) * 18;
        ctx.lineTo(x, baseY + yo);
      }
      ctx.stroke();
    }
  }

  // Banner + sponsor
  drawAtrsBanner(ctx, W, H, { showSponsor });
}

/** Disegna SOLO il banner verde+blu a montagne in basso + sponsor FUGA/KAILAS.
 *  Da usare quando vuoi sovrapporre il banner a uno sfondo già disegnato (es. MenuScene). */
export function drawAtrsBanner(ctx, W, H, opts = {}) {
  const showSponsor = opts.showSponsor !== false;
  const stripeH = 32;
  const stripeY = H - stripeH;

  function mountainY(x, seedOffset, amplitude) {
    const a = Math.sin((x + seedOffset) * 0.018) * amplitude * 0.55;
    const b = Math.sin((x + seedOffset * 1.7) * 0.045) * amplitude * 0.30;
    const c = Math.sin((x + seedOffset * 0.7) * 0.11) * amplitude * 0.15;
    return a + b + c;
  }

  // Verde scuro (banda principale sx)
  ctx.fillStyle = '#1a8e3a';
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W * 0.48; x += 2) {
    const t = x / (W * 0.48);
    const baseY = stripeY + 4 + t * 24;
    const peakY = baseY + mountainY(x, 0, 8);
    ctx.lineTo(x, peakY);
  }
  ctx.lineTo(W * 0.48, H);
  ctx.closePath();
  ctx.fill();

  // Verde chiaro davanti
  ctx.fillStyle = '#3fc060';
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W * 0.36; x += 2) {
    const t = x / (W * 0.36);
    const baseY = stripeY + 14 + t * 14;
    const peakY = baseY + mountainY(x, 100, 5);
    ctx.lineTo(x, peakY);
  }
  ctx.lineTo(W * 0.36, H);
  ctx.closePath();
  ctx.fill();

  // Blu medio (banda principale dx)
  ctx.fillStyle = '#1a3a90';
  ctx.beginPath();
  ctx.moveTo(W, H);
  for (let x = W; x >= W * 0.38; x -= 2) {
    const t = (W - x) / (W * 0.62);
    const baseY = stripeY + 2 + t * 26;
    const peakY = baseY + mountainY(x, 200, 8);
    ctx.lineTo(x, peakY);
  }
  ctx.lineTo(W * 0.38, H);
  ctx.closePath();
  ctx.fill();

  // Blu scuro davanti
  ctx.fillStyle = '#0d1f5a';
  ctx.beginPath();
  ctx.moveTo(W, H);
  for (let x = W; x >= W * 0.50; x -= 2) {
    const t = (W - x) / (W * 0.50);
    const baseY = stripeY + 14 + t * 14;
    const peakY = baseY + mountainY(x, 300, 5);
    ctx.lineTo(x, peakY);
  }
  ctx.lineTo(W * 0.50, H);
  ctx.closePath();
  ctx.fill();

  // Sponsor FUGA + KAILAS
  if (showSponsor) {
    _drawPixelText(ctx, 'FUGA', W - 56, H - 22, '#FFFFFF', 2);
    _drawPixelText(ctx, 'KAILAS', W - 38, H - 8, '#A0C8FF', 1);
    ctx.fillStyle = '#A0C8FF';
    ctx.fillRect(W - 46, H - 6, 1, 3);
    ctx.fillRect(W - 47, H - 5, 3, 1);
  }
}

/** Mini renderer pixel font 3x5 inline (no dependency PixelFont per evitare circolare).
 *  Supporta solo lettere maiuscole. */
const _MINI_FONT = {
  'A': ['XXX','X.X','XXX','X.X','X.X'],
  'B': ['XX.','X.X','XX.','X.X','XX.'],
  'C': ['XXX','X..','X..','X..','XXX'],
  'D': ['XX.','X.X','X.X','X.X','XX.'],
  'E': ['XXX','X..','XX.','X..','XXX'],
  'F': ['XXX','X..','XX.','X..','X..'],
  'G': ['XXX','X..','X.X','X.X','XXX'],
  'H': ['X.X','X.X','XXX','X.X','X.X'],
  'I': ['XXX','.X.','.X.','.X.','XXX'],
  'K': ['X.X','XX.','X..','XX.','X.X'],
  'L': ['X..','X..','X..','X..','XXX'],
  'M': ['X.X','XXX','XXX','X.X','X.X'],
  'N': ['X.X','XX.','X.X','X.X','X.X'],
  'O': ['XXX','X.X','X.X','X.X','XXX'],
  'P': ['XXX','X.X','XXX','X..','X..'],
  'R': ['XX.','X.X','XX.','X.X','X.X'],
  'S': ['XXX','X..','XXX','..X','XXX'],
  'T': ['XXX','.X.','.X.','.X.','.X.'],
  'U': ['X.X','X.X','X.X','X.X','XXX'],
  ' ': ['...','...','...','...','...'],
};
function _drawPixelText(ctx, str, x, y, color, scale = 1) {
  ctx.fillStyle = color;
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const glyph = _MINI_FONT[ch] || _MINI_FONT[' '];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 3; c++) {
        if (glyph[r][c] === 'X') {
          ctx.fillRect(cx + c * scale, y + r * scale, scale, scale);
        }
      }
    }
    cx += 4 * scale;
  }
}
