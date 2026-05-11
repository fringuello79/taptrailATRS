// src/entities/RunnerSprite.js
// Sprite del runner basati su asset AI-generati (illustrazione pixel-art moderna).
//
// === Asset ===
// 40 sprite sheet PNG in assets/sprites/runner/:
//   - 2 gender (M, F)
//   - 5 colori canotta (rosso, blu, verde, giallo, bianco)
//   - 4 stati animazione (run_fast, run_slow, finish, dnf)
//
// Formato file: {gender}_{state}_{color}.png
//   esempio: M_run_fast_rosso.png, F_dnf_blu.png
//
// run_fast: 8 frame in fila orizzontale (ciclo di corsa completo)
// run_slow, finish, dnf: 1 frame singolo statico (placeholder; in futuro
//   se vuoi animarli, basta sostituire i PNG con sheet a più frame e aggiornare SHEET_META)
//
// Sprite ALTI 60 px, larghezza variabile per gender (~47-48 px).
//
// === Per sostituire gli sprite in futuro ===
// Sostituisci i PNG mantenendo:
//   - lo stesso nome file (gender_state_color.png)
//   - dimensione frame compatibile con SHEET_META (altrimenti aggiorna SHEET_META)
//   - frame disposti in fila orizzontale, larghezza uniforme con piccolo padding

const SHEET_META = {
  run_fast: { frames: 8, frame_h: 40 },
  run_slow: { frames: 8, frame_h: 40 },   // stessi frame del run_fast, animati più lentamente
  finish:   { frames: 1, frame_h: 40 },   // frame singolo statico (placeholder)
  dnf:      { frames: 1, frame_h: 40 },   // frame singolo statico (placeholder)
};

// Larghezza frame: leggermente diversa per M e F per via dello stride.
const FRAME_WIDTHS = {
  M: 33,
  F: 32,
};

const COLORS = ['rosso', 'blu', 'verde', 'giallo', 'bianco'];
const COLOR_ALIAS = {
  red: 'rosso', green: 'verde', blue: 'blu',
  yellow: 'giallo', white: 'bianco', black: 'blu',
};

function _validColor(c) {
  if (COLORS.includes(c)) return c;
  if (COLOR_ALIAS[c]) return COLOR_ALIAS[c];
  return 'rosso';
}

function _validGenderInternal(g) {
  return (g === 'female' || g === 'F') ? 'F' : 'M';
}

function loadImage(path) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load ' + path));
    img.src = path;
  });
}

// === Cache sheet ===
// Chiave: "gender_state_color" → HTMLImageElement
const _sheetCache = new Map();
const _loadingPromises = new Map();

function _sheetKey(gender, state, color) {
  return `${gender}_${state}_${color}`;
}

function _sheetPath(gender, state, color) {
  return `assets/sprites/runner/${gender}_${state}_${color}.png`;
}

function _loadSheet(gender, state, color) {
  const key = _sheetKey(gender, state, color);
  if (_sheetCache.has(key)) return Promise.resolve(_sheetCache.get(key));
  if (_loadingPromises.has(key)) return _loadingPromises.get(key);
  const p = loadImage(_sheetPath(gender, state, color))
    .then(img => {
      _sheetCache.set(key, img);
      _loadingPromises.delete(key);
      return img;
    })
    .catch(err => {
      console.warn('[RunnerSprite] sheet load fail:', key, err.message);
      _loadingPromises.delete(key);
      return null;
    });
  _loadingPromises.set(key, p);
  return p;
}

// Pre-caricamento eager dei colori più probabili
function preloadAll() {
  const tasks = [];
  for (const g of ['M', 'F']) {
    for (const c of COLORS) {
      for (const s of Object.keys(SHEET_META)) {
        tasks.push(_loadSheet(g, s, c));
      }
    }
  }
  return Promise.all(tasks);
}
preloadAll();

const SHADOW = 'rgba(11,7,12,0.4)';

export class RunnerSprite {
  /** @param {'male'|'female'} gender
   *  @param {string} shirtColor */
  constructor(gender = 'male', shirtColor = 'rosso') {
    this._gender = _validGenderInternal(gender);
    this.shirtColor = _validColor(shirtColor);
    this.state = 'run_fast';
    this.frame = 0;
    this.t = 0;
    // Frame time base: 8 frame in ~0.6s = 13 fps → un passo ogni 75ms.
    this.frameTime = 0.075;
  }

  get gender() { return this._gender === 'F' ? 'female' : 'male'; }
  set gender(g) { this._gender = _validGenderInternal(g); }

  setGenderShirt(gender, shirtColor) {
    this._gender = _validGenderInternal(gender);
    this.shirtColor = _validColor(shirtColor);
  }

  setState(state) {
    if (this.state === state) return;
    if (!SHEET_META[state]) {
      console.warn('Stato runner non valido:', state);
      return;
    }
    this.state = state;
    this.frame = 0;
    this.t = 0;
  }

  // Retro-compat getters
  get frames() { return SHEET_META[this.state].frames; }
  get frameW() { return FRAME_WIDTHS[this._gender] || 48; }
  get frameH() { return SHEET_META[this.state].frame_h; }

  /** Aggiorna animazione. speedFactor (~0..1) modula la velocità del ciclo
   *  per gli stati di corsa. Stati statici (finish/dnf) non si animano.
   *  run_slow gira a metà velocità rispetto a run_fast (passo da salita). */
  update(dt, speedFactor) {
    if (this.frames <= 1) return;   // statico (finish, dnf)
    let sf = Math.max(0.6, Math.min(2.5, (speedFactor || 0.5) * 1.5 + 0.5));
    if (this.state === 'run_slow') sf *= 0.55;   // passo da salita: più lento
    this.t += dt;
    const cycleTime = this.frameTime / sf;
    while (this.t >= cycleTime) {
      this.frame = (this.frame + 1) % this.frames;
      this.t -= cycleTime;
    }
  }

  /** Disegna lo sprite. (x, y) = corner top-left.
   *  scale: ingrandimento (default 1 = native). */
  draw(ctx, x, y, scale = 1, opts = {}) {
    const sheet = _sheetCache.get(_sheetKey(this._gender, this.state, this.shirtColor));
    if (!sheet) {
      // ancora in caricamento: provo a triggerare la load (se non già in corso)
      _loadSheet(this._gender, this.state, this.shirtColor);
      return;
    }

    const meta = SHEET_META[this.state];
    const fw = this.frameW;
    const fh = meta.frame_h;
    const sx = this.frame * fw;

    if (opts.shadow !== false) {
      // Ombra ovale piccola, centrata sotto i piedi (più stretta del frame)
      ctx.fillStyle = SHADOW;
      const cx = x + (fw / 2) * scale;
      const cy = y + (fh - 1) * scale;     // appena sotto il bordo basso del frame
      const rw = (fw * 0.30) * scale;       // 30% della larghezza, non tutta
      const rh = Math.max(1, scale * 0.8);  // 1 px (o un pelo di più se scalato)
      for (let dy = -rh; dy <= rh; dy++) {
        const dx = Math.floor(rw * Math.sqrt(Math.max(0, 1 - (dy / rh) ** 2)));
        ctx.fillRect(Math.floor(cx - dx), Math.floor(cy + dy), dx * 2, 1);
      }
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet, sx, 0, fw, fh, x, y, fw * scale, fh * scale);
  }
}

// Esporto le costanti di stato per chi usa RunnerSprite.STATE.RUN_FAST
RunnerSprite.STATE = Object.freeze({
  RUN_SLOW: 'run_slow',
  RUN_FAST: 'run_fast',
  FINISH:   'finish',
  DNF:      'dnf',
});

/** Faccia "cramp" cartoon dolorante (per overlay crampi).
 *  Compatibilità con codice esistente. */
export function drawCrampFace(ctx, x, y, gender, t) {
  const HX = x, HY = y;
  ctx.fillStyle = '#f4cca1';
  ctx.fillRect(HX, HY, 40, 40);
  ctx.fillStyle = '#302c2e';
  ctx.fillRect(HX - 1, HY, 1, 40);
  ctx.fillRect(HX + 40, HY, 1, 40);
  ctx.fillRect(HX, HY - 1, 40, 1);
  ctx.fillRect(HX, HY + 40, 40, 1);

  if (gender === 'female') {
    ctx.fillStyle = '#5a3219';
    ctx.fillRect(HX, HY, 40, 12);
    ctx.fillRect(HX, HY, 4, 24);
    ctx.fillRect(HX + 36, HY, 4, 24);
  } else {
    ctx.fillStyle = '#3c2312';
    ctx.fillRect(HX, HY, 40, 8);
    ctx.fillStyle = '#5a3219';
    ctx.fillRect(HX + 4, HY + 2, 14, 2);
  }

  ctx.fillStyle = '#302c2e';
  ctx.fillRect(HX + 9,  HY + 18, 2, 2);
  ctx.fillRect(HX + 11, HY + 16, 2, 2);
  ctx.fillRect(HX + 13, HY + 18, 2, 2);
  ctx.fillRect(HX + 11, HY + 20, 2, 2);
  ctx.fillRect(HX + 9,  HY + 22, 2, 2);
  ctx.fillRect(HX + 13, HY + 22, 2, 2);
  ctx.fillRect(HX + 25, HY + 18, 2, 2);
  ctx.fillRect(HX + 27, HY + 16, 2, 2);
  ctx.fillRect(HX + 29, HY + 18, 2, 2);
  ctx.fillRect(HX + 27, HY + 20, 2, 2);
  ctx.fillRect(HX + 25, HY + 22, 2, 2);
  ctx.fillRect(HX + 29, HY + 22, 2, 2);

  ctx.fillRect(HX + 6,  HY + 14, 4, 1);
  ctx.fillRect(HX + 10, HY + 13, 4, 1);
  ctx.fillRect(HX + 26, HY + 13, 4, 1);
  ctx.fillRect(HX + 30, HY + 14, 4, 1);

  ctx.fillRect(HX + 12, HY + 28, 16, 1);
  ctx.fillRect(HX + 12, HY + 32, 16, 1);
  ctx.fillRect(HX + 12, HY + 28, 1, 5);
  ctx.fillRect(HX + 27, HY + 28, 1, 5);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(HX + 13, HY + 29, 14, 3);
  ctx.fillStyle = '#302c2e';
  for (let dx = 15; dx < 27; dx += 3) ctx.fillRect(HX + dx, HY + 29, 1, 3);

  const dropOff = Math.floor(t * 6) % 8;
  ctx.fillStyle = '#7898c0';
  ctx.fillRect(HX - 4,  HY + 6 + dropOff, 2, 3);
  ctx.fillRect(HX + 42, HY + 8 + dropOff, 2, 3);

  ctx.fillStyle = '#a83028';
  ctx.fillRect(HX + 10, HY - 12, 2, 6);
  ctx.fillRect(HX + 10, HY - 4,  2, 2);
  ctx.fillRect(HX + 18, HY - 14, 2, 6);
  ctx.fillRect(HX + 18, HY - 6,  2, 2);
  ctx.fillRect(HX + 26, HY - 12, 2, 6);
  ctx.fillRect(HX + 26, HY - 4,  2, 2);
}
