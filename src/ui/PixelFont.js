// src/ui/PixelFont.js
// Font bitmap pixel-art 5x7 — un glifo per char.
// Disegno via fillRect 1x1 per tenere il look "vero pixel".
// Solo maiuscolo + numeri + punteggiatura essenziale.

const GLYPHS = {
  ' ': [
    '     ',
    '     ',
    '     ',
    '     ',
    '     ',
    '     ',
    '     ',
  ],
  'A': ['.XXX.','X...X','X...X','XXXXX','X...X','X...X','X...X'],
  'B': ['XXXX.','X...X','X...X','XXXX.','X...X','X...X','XXXX.'],
  'C': ['.XXX.','X...X','X....','X....','X....','X...X','.XXX.'],
  'D': ['XXXX.','X...X','X...X','X...X','X...X','X...X','XXXX.'],
  'E': ['XXXXX','X....','X....','XXXX.','X....','X....','XXXXX'],
  'F': ['XXXXX','X....','X....','XXXX.','X....','X....','X....'],
  'G': ['.XXX.','X...X','X....','X.XXX','X...X','X...X','.XXX.'],
  'H': ['X...X','X...X','X...X','XXXXX','X...X','X...X','X...X'],
  'I': ['XXXXX','..X..','..X..','..X..','..X..','..X..','XXXXX'],
  'J': ['XXXXX','...X.','...X.','...X.','...X.','X..X.','.XX..'],
  'K': ['X...X','X..X.','X.X..','XX...','X.X..','X..X.','X...X'],
  'L': ['X....','X....','X....','X....','X....','X....','XXXXX'],
  'M': ['X...X','XX.XX','X.X.X','X...X','X...X','X...X','X...X'],
  'N': ['X...X','XX..X','X.X.X','X..XX','X...X','X...X','X...X'],
  'O': ['.XXX.','X...X','X...X','X...X','X...X','X...X','.XXX.'],
  'P': ['XXXX.','X...X','X...X','XXXX.','X....','X....','X....'],
  'Q': ['.XXX.','X...X','X...X','X...X','X.X.X','X..X.','.XX.X'],
  'R': ['XXXX.','X...X','X...X','XXXX.','X.X..','X..X.','X...X'],
  'S': ['.XXXX','X....','X....','.XXX.','....X','....X','XXXX.'],
  'T': ['XXXXX','..X..','..X..','..X..','..X..','..X..','..X..'],
  'U': ['X...X','X...X','X...X','X...X','X...X','X...X','.XXX.'],
  'V': ['X...X','X...X','X...X','X...X','X...X','.X.X.','..X..'],
  'W': ['X...X','X...X','X...X','X...X','X.X.X','XX.XX','X...X'],
  'X': ['X...X','X...X','.X.X.','..X..','.X.X.','X...X','X...X'],
  'Y': ['X...X','X...X','.X.X.','..X..','..X..','..X..','..X..'],
  'Z': ['XXXXX','....X','...X.','..X..','.X...','X....','XXXXX'],
  '0': ['.XXX.','X...X','X..XX','X.X.X','XX..X','X...X','.XXX.'],
  '1': ['..X..','.XX..','..X..','..X..','..X..','..X..','.XXX.'],
  '2': ['.XXX.','X...X','....X','...X.','..X..','.X...','XXXXX'],
  '3': ['XXXX.','....X','....X','.XXX.','....X','....X','XXXX.'],
  '4': ['...X.','..XX.','.X.X.','X..X.','XXXXX','...X.','...X.'],
  '5': ['XXXXX','X....','X....','XXXX.','....X','....X','XXXX.'],
  '6': ['.XXX.','X....','X....','XXXX.','X...X','X...X','.XXX.'],
  '7': ['XXXXX','....X','...X.','..X..','.X...','.X...','.X...'],
  '8': ['.XXX.','X...X','X...X','.XXX.','X...X','X...X','.XXX.'],
  '9': ['.XXX.','X...X','X...X','.XXXX','....X','....X','.XXX.'],
  '.': ['.....','.....','.....','.....','.....','.....','..X..'],
  ',': ['.....','.....','.....','.....','.....','..X..','.X...'],
  ':': ['.....','..X..','.....','.....','.....','..X..','.....'],
  '!': ['..X..','..X..','..X..','..X..','..X..','.....','..X..'],
  '?': ['.XXX.','X...X','....X','...X.','..X..','.....','..X..'],
  '-': ['.....','.....','.....','XXXXX','.....','.....','.....'],
  '/': ['....X','....X','...X.','..X..','.X...','X....','X....'],
  "'": ['..X..','..X..','..X..','.....','.....','.....','.....'],
  '%': ['XX..X','XX.X.','...X.','..X..','.X...','X.XX.','X.XX.'],
  '+': ['.....','..X..','..X..','XXXXX','..X..','..X..','.....'],
  '(': ['...X.','..X..','.X...','.X...','.X...','..X..','...X.'],
  ')': ['.X...','..X..','...X.','...X.','...X.','..X..','.X...'],
  '°': ['.XX..','X..X.','X..X.','.XX..','.....','.....','.....'],
  '<': ['.....','...X.','..X..','.X...','..X..','...X.','.....'],
  '>': ['.....','.X...','..X..','...X.','..X..','.X...','.....'],
  '*': ['.....','X.X.X','.XXX.','XXXXX','.XXX.','X.X.X','.....'],
  '#': ['.X.X.','XXXXX','.X.X.','.X.X.','XXXXX','.X.X.','.....'],
  '=': ['.....','.....','XXXXX','.....','XXXXX','.....','.....'],
  '[': ['.XXX.','.X...','.X...','.X...','.X...','.X...','.XXX.'],
  ']': ['.XXX.','...X.','...X.','...X.','...X.','...X.','.XXX.'],
  '_': ['.....','.....','.....','.....','.....','.....','XXXXX'],
  '|': ['..X..','..X..','..X..','..X..','..X..','..X..','..X..'],
  // em-dash (lungo) — usato in messaggi tipo "— vai al riepilogo —"
  '—': ['.....','.....','.....','XXXXX','.....','.....','.....'],
  // triangolo destro (puntatore menu)
  '►': ['XX...','XXX..','XXXX.','XXXXX','XXXX.','XXX..','XX...'],
  // chiocciola
  '@': ['.XXX.','X...X','X.XXX','X.X.X','X.XXX','X....','.XXX.'],
};

const GLYPH_W = 5;
const GLYPH_H = 7;

export function drawText(ctx, text, x, y, color = '#FFFFFF', scale = 1, spacing = 1) {
  const t = text.toUpperCase();
  ctx.fillStyle = color;
  let cx = x;
  for (const ch of t) {
    const g = GLYPHS[ch] || GLYPHS['?'];
    for (let row = 0; row < GLYPH_H; row++) {
      for (let col = 0; col < GLYPH_W; col++) {
        if (g[row][col] === 'X') {
          ctx.fillRect(cx + col * scale, y + row * scale, scale, scale);
        }
      }
    }
    cx += (GLYPH_W + spacing) * scale;
  }
}

export function drawTextShadow(ctx, text, x, y, color, shadow, scale = 1, spacing = 1) {
  drawText(ctx, text, x + scale, y + scale, shadow, scale, spacing);
  drawText(ctx, text, x, y, color, scale, spacing);
}

export function textWidth(text, scale = 1, spacing = 1) {
  return text.length * (GLYPH_W + spacing) * scale - spacing * scale;
}

export function drawTextCentered(ctx, text, cx, y, color, scale = 1, spacing = 1) {
  drawText(ctx, text, Math.floor(cx - textWidth(text, scale, spacing) / 2), y, color, scale, spacing);
}
