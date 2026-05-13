// src/systems/Input.js
// Input alternato T&F: ←/→ alternati, touch split sinistra/destra.
//
// API pubblica:
//   - input.tapPressed     edge: true SOLO se l'ultimo tap è stato VALIDO (lato corretto)
//   - input.tapHeld        true se almeno un tasto/dito è premuto
//   - input.lastTapTime    timestamp ultimo tap valido (ms, performance.now)
//   - input.nextSide       'L' o 'R': qual è il prossimo lato da premere
//   - input.lastSide       'L' o 'R' o null: ultimo lato premuto correttamente
//   - input.getTapRateHz() frequenza tap validi su finestra mobile 1.5s
//   - input.getCadenceSpm() = getTapRateHz() * 60
//   - input.getRhythmStability() 0..1, regolarità del ritmo
//   - input.endFrame() reset edge-events a fine frame
//   - input.resetCadence() pulizia history
//   - input.crampReleasePressed   edge C (per uscita crampi, retrocompat)
//   - input.refreshmentPress      edge R (retrocompat - non usato in fase T&F)
//
// LOGICA ALTERNANZA:
// Il "prossimo lato richiesto" comincia indifferente (L), poi alterna automaticamente.
// Tap sul lato SBAGLIATO: ignorato (non incrementa tapHistory, non scatta tapPressed).
// Tap sul lato GIUSTO: valido → tapPressed, history, alterna nextSide.
// Eccezione: il PRIMO tap della gara è valido qualunque sia il lato.
//
// INPUT TASTIERA:
//   ← (ArrowLeft, KeyA) → lato L
//   → (ArrowRight, KeyD) → lato R
//   Space → equivale a "lato successivo richiesto" (modalità monotasto fallback)
//
// INPUT TOUCH/MOUSE:
//   tocco/click nella metà sinistra del canvas → lato L
//   tocco/click nella metà destra del canvas → lato R
//   Supporta multi-touch (puoi tenere giù un dito e tappare con l'altro)

export class Input {
  constructor(canvas) {
    this.canvas = canvas;

    // Stato edge/held
    this.tapPressed = false;
    this.tapHeld = false;

    // Stato alternanza
    this.nextSide = 'L';      // prossimo lato richiesto
    this.lastSide = null;     // ultimo lato premuto correttamente
    this.firstTapDone = false; // primo tap è "libero"

    // Storia tap validi (per cadenza/stabilità)
    this.tapHistory = [];
    this.maxHistory = 12;
    this.lastTapTime = 0;

    // Edge events retrocompat
    this.crampReleasePressed = false;
    this.refreshmentPress = false;

    // Click "menu" (mouse-up/touch-down) per UI/scene di menu
    this.menuClicks = [];

    // Tracking di che lati sono attualmente premuti (per tapHeld)
    this._heldKeys = new Set();    // 'L','R' da tastiera
    this._heldTouches = new Map(); // touch identifier → 'L'/'R'
    this._mouseHeld = null;        // 'L' o 'R' se mouse premuto

    // Zone tap speciali (rect in coord canvas virtuali) → triggera azione e
    // NON contano come tap di corsa. RaceScene le usa per il pulsante bicchiere.
    // Formato: this._tapZones = [{name, x, y, w, h}]
    // Le azioni triggerate finiscono in this.zoneActions[name] = true (edge).
    this._tapZones = [];
    this.zoneActions = {};

    this._bindEvents();
  }

  /** Imposta zone speciali tap. Chiamare da RaceScene quando vuole un pulsante.
   *  zones = [{name:'water', x:300, y:8, w:32, h:32}, ...] */
  setTapZones(zones) {
    this._tapZones = zones || [];
  }

  /** Converte coord client → coord canvas virtuali, e verifica se il tap cade
   *  in una zona speciale. Ritorna il nome della zona o null. */
  _zoneFromCoord(clientX, clientY) {
    if (this._tapZones.length === 0) return null;
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const cx = (clientX - rect.left) * scaleX;
    const cy = (clientY - rect.top) * scaleY;
    for (const z of this._tapZones) {
      if (cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h) {
        return z.name;
      }
    }
    return null;
  }

  _bindEvents() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        this._heldKeys.add('L');
        this._onTap('L');
        e.preventDefault();
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        this._heldKeys.add('R');
        this._onTap('R');
        e.preventDefault();
      } else if (e.code === 'Space') {
        // Space = modalità fallback: si comporta come "lato successivo richiesto"
        // (utile per testare al volo da desktop senza alternare)
        this._heldKeys.add(this.nextSide);
        this._onTap(this.nextSide);
        e.preventDefault();
      } else if (e.code === 'KeyC') {
        this.crampReleasePressed = true;
        e.preventDefault();
      } else if (e.code === 'KeyR') {
        this.refreshmentPress = true;
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        this._heldKeys.delete('L');
        e.preventDefault();
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        this._heldKeys.delete('R');
        e.preventDefault();
      } else if (e.code === 'Space') {
        // rilascio space: lo elimino sia da L che da R (non so quale era)
        this._heldKeys.delete('L');
        this._heldKeys.delete('R');
        e.preventDefault();
      }
    });

    // Mouse: la metà x del canvas decide L/R, salvo zone speciali
    this.canvas.addEventListener('mousedown', (e) => {
      const zone = this._zoneFromCoord(e.clientX, e.clientY);
      if (zone) {
        this.zoneActions[zone] = true;
        this._registerMenuClick(e.clientX, e.clientY);
        return;   // NON conta come tap di corsa
      }
      const side = this._sideFromCoord(e.clientX);
      this._mouseHeld = side;
      this._onTap(side);
      this._registerMenuClick(e.clientX, e.clientY);
    });
    const releaseMouse = () => { this._mouseHeld = null; };
    this.canvas.addEventListener('mouseup', releaseMouse);
    this.canvas.addEventListener('mouseleave', releaseMouse);

    // Touch multi-finger, salvo zone speciali
    this.canvas.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        const zone = this._zoneFromCoord(t.clientX, t.clientY);
        if (zone) {
          this.zoneActions[zone] = true;
          this._registerMenuClick(t.clientX, t.clientY);
          continue;   // NON conta come tap di corsa
        }
        const side = this._sideFromCoord(t.clientX);
        this._heldTouches.set(t.identifier, side);
        this._onTap(side);
        this._registerMenuClick(t.clientX, t.clientY);
      }
      e.preventDefault();
    }, { passive: false });
    this.canvas.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) {
        this._heldTouches.delete(t.identifier);
      }
      e.preventDefault();
    }, { passive: false });
    this.canvas.addEventListener('touchcancel', (e) => {
      for (const t of e.changedTouches) {
        this._heldTouches.delete(t.identifier);
      }
    });
  }

  _sideFromCoord(clientX) {
    const rect = this.canvas.getBoundingClientRect();
    const xRel = clientX - rect.left;
    return (xRel < rect.width / 2) ? 'L' : 'R';
  }

  /** API pubblica per pulsanti UI (es. tasti grossi su mobile verticale).
   *  Innesca un tap programmatico sul lato specificato, rispettando l'alternanza. */
  tapLeft()  { this._onTap('L'); }
  tapRight() { this._onTap('R'); }
  /** Indica se attualmente almeno un pulsante UI è "tenuto premuto" (per held).
   *  Aggiorna manualmente lo stato held da un'azione esterna. */
  setButtonHeld(side, held) {
    if (held) this._heldKeys.add(side);
    else this._heldKeys.delete(side);
    this._updateHeld();
  }

  _onTap(side) {
    // Aggiorna held
    this._updateHeld();

    // Verifica validità del tap (alternanza)
    let valid = false;
    if (!this.firstTapDone) {
      valid = true;
      this.firstTapDone = true;
    } else if (side === this.nextSide) {
      valid = true;
    }

    if (!valid) return;

    // Tap valido: registra
    this.tapPressed = true;
    this.lastSide = side;
    this.nextSide = (side === 'L') ? 'R' : 'L';
    const now = performance.now();
    this.tapHistory.push(now);
    if (this.tapHistory.length > this.maxHistory) this.tapHistory.shift();
    this.lastTapTime = now;
  }

  _updateHeld() {
    this.tapHeld =
      this._heldKeys.size > 0 ||
      this._heldTouches.size > 0 ||
      this._mouseHeld !== null;
  }

  _registerMenuClick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    this.menuClicks.push({
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    });
  }

  /** Frequenza di tap validi su finestra ~1.5s. */
  getTapRateHz() {
    const now = performance.now();
    const win = 1500;
    const recent = this.tapHistory.filter((t) => now - t <= win);
    if (recent.length < 2) return 0;
    const span = (recent[recent.length - 1] - recent[0]) / 1000;
    if (span <= 0) return 0;
    return (recent.length - 1) / span;
  }

  /** Cadenza in passi al minuto (un tap = un appoggio). */
  getCadenceSpm() {
    return this.getTapRateHz() * 60;
  }

  /** Regolarità del ritmo: 0..1 (1 = perfettamente costante). */
  getRhythmStability() {
    const recent = this.tapHistory.slice(-8);
    if (recent.length < 4) return 0;
    const intervals = [];
    for (let i = 1; i < recent.length; i++) intervals.push(recent[i] - recent[i - 1]);
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    if (mean <= 0) return 0;
    const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length;
    const cv = Math.sqrt(variance) / mean;
    return Math.max(0, Math.min(1, 1 - cv));
  }

  /** Resetta la cadenza e l'alternanza (chiamare a inizio gara). */
  resetCadence() {
    this.tapHistory.length = 0;
    this.nextSide = 'L';
    this.lastSide = null;
    this.firstTapDone = false;
    this.lastTapTime = 0;
  }

  /** Da chiamare a fine frame per resettare edge-events. */
  endFrame() {
    this.tapPressed = false;
    this.crampReleasePressed = false;
    this.refreshmentPress = false;
    this.menuClicks.length = 0;
    this.zoneActions = {};
    this._updateHeld();
  }
}
