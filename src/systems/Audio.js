// src/systems/Audio.js
// SFX procedurali con WebAudio API - niente file audio, suoni 8-bit generati al volo.

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  _ensureCtx() {
    if (!this.ctx) {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) this.ctx = new Ctx();
      } catch (e) { /* niente audio */ }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setMuted(m) {
    this.muted = m;
    if (m) this.stopBackgroundMusic();
  }

  /** Click di passo: blip breve a frequenza variabile. */
  step(intensity = 1) {
    if (this.muted) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 220 + Math.random() * 60;
    gain.gain.value = 0.04 * intensity;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.stop(ctx.currentTime + 0.07);
  }

  /** Sparo della pistola del via: rumore bianco breve con bassi profondi.
   *  Combina noise filtrato in highpass per il "crack" + un sub-tono basso. */
  gunshot() {
    if (this.muted) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // --- 1) Rumore bianco breve (il "crack" dello sparo) ---
    const bufferSize = ctx.sampleRate * 0.20;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 800;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.6, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    noise.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.2);

    // --- 2) Sub-tono basso (il "boom" / corpo dello sparo) ---
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.10);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.5, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(oscGain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  beep(freq = 600, dur = 0.08, type = 'square') {
    if (this.muted) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.stop(ctx.currentTime + dur + 0.01);
  }

  /** Fanfara di traguardo: tre note ascendenti. */
  finishFanfare() {
    if (this.muted) return;
    [523, 659, 784].forEach((f, i) => {
      setTimeout(() => this.beep(f, 0.18, 'square'), i * 160);
    });
  }

  /** Battito cardiaco: due colpi sordi a bassa frequenza. */
  heartbeat() {
    if (this.muted) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const playKick = (delay, vol) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, ctx.currentTime + delay);
      osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + delay + 0.1);
      gain.gain.setValueAtTime(vol, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.13);
    };
    playKick(0, 0.15);
    playKick(0.13, 0.10);
  }

  // ---------------------------------------------------------------------------
  // Musica di sottofondo per la gara: loop motivazionale 8-bit a 2 voci.
  // - Bassline pulsante (square grave) che dà il "ritmo del passo"
  // - Melodia in scala maggiore, frase di 8 battute che si ripete
  // Tutto generato schedulando note future sull'AudioContext: una volta partita,
  // la musica scorre sola finché non chiamiamo stopBackgroundMusic().
  //
  // Volume basso (0.05 max) per non coprire SFX e step.
  // ---------------------------------------------------------------------------

  /** Avvia il loop musicale di gara. Idempotente: chiamarla due volte
   *  non sovrappone tracce. */
  startBackgroundMusic() {
    if (this.muted) return;
    if (this._musicScheduler) return;   // già in esecuzione
    const ctx = this._ensureCtx();
    if (!ctx) return;

    // Master gain del modulo musica: separato dagli SFX così posso sfumarlo
    // a fine gara senza toccare gli effetti.
    this._musicMaster = ctx.createGain();
    this._musicMaster.gain.value = 0.55;
    this._musicMaster.connect(ctx.destination);

    // Tempo: 100 BPM (ritmo runner medio). 1 beat = 0.6s. La frase è 16 beat = 9.6s.
    const beatSec = 0.60;
    // Frase melodica (8 battute, 2 note per battuta) in tonalità di Do maggiore.
    // Frequenze in Hz (C5..C6).
    const C5 = 523.25, D5 = 587.33, E5 = 659.25, F5 = 698.46;
    const G5 = 783.99, A5 = 880.00, B5 = 987.77, C6 = 1046.50;
    // Pattern motivazionale: salita/sostegno/risoluzione, 16 ottavi di battuta
    const melody = [
      // Frase A (8 ottavi)
      C5, E5, G5, E5,  C5, E5, G5, A5,
      // Frase B (8 ottavi) - più alta, sensazione di "spinta"
      G5, B5, C6, B5,  G5, F5, E5, G5,
    ];
    // Bassline (8 quartine, 1 nota per quartina) - radici degli accordi
    // C - Am - F - G  (progressione I-vi-IV-V, classica e motivazionale)
    const C3 = 130.81, A2 = 110.00, F2 = 87.31, G2 = 98.00;
    const bass = [C3, C3, A2, A2,  F2, F2, G2, G2];

    // Ottavo = 0.5 beat = 0.3s. La frase melodica dura 16 ottavi = 4.8s, x2 = 9.6s.
    const eighth = beatSec / 2;

    // Stato dello scheduler
    const state = {
      stopped: false,
      // Pre-schedulo le note in finestre da 1 secondo, con anticipo ~0.5s.
      // Così se il browser sospende per un attimo, niente si interrompe.
      nextNoteTime: ctx.currentTime + 0.05,
      currentEighth: 0,
    };
    this._musicState = state;

    // Una funzione che schedulizza una singola nota nell'orchestra
    const scheduleNote = (freq, time, duration, type, gain) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, time);
      // ADSR semplice: attack 5ms, decay verso 0 entro duration
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(gain, time + 0.005);
      g.gain.linearRampToValueAtTime(gain * 0.6, time + duration * 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      osc.connect(g).connect(this._musicMaster);
      osc.start(time);
      osc.stop(time + duration + 0.02);
    };

    // Loop scheduler: ogni 100ms guarda avanti 200ms, schedula le note che cadono
    const tick = () => {
      if (state.stopped) return;
      const aheadHorizon = ctx.currentTime + 0.20;
      while (state.nextNoteTime < aheadHorizon) {
        const i = state.currentEighth;
        const melIdx = i % melody.length;
        const bassIdx = Math.floor(i / 2) % bass.length;
        // Melodia: ottavo, voce square, volume contenuto
        scheduleNote(melody[melIdx], state.nextNoteTime,
                     eighth * 0.85, 'square', 0.06);
        // Bassline: una nota per quartina (ogni 2 ottavi), durata 2 ottavi
        if (i % 2 === 0) {
          scheduleNote(bass[bassIdx], state.nextNoteTime,
                       eighth * 1.7, 'triangle', 0.10);
        }
        state.currentEighth = i + 1;
        state.nextNoteTime += eighth;
      }
    };
    tick();
    this._musicScheduler = setInterval(tick, 100);
  }

  /** Ferma la musica con un breve fade-out (0.4s). */
  stopBackgroundMusic() {
    if (!this._musicScheduler) return;
    clearInterval(this._musicScheduler);
    this._musicScheduler = null;
    if (this._musicState) this._musicState.stopped = true;
    if (this._musicMaster && this.ctx) {
      const t = this.ctx.currentTime;
      this._musicMaster.gain.cancelScheduledValues(t);
      this._musicMaster.gain.setValueAtTime(this._musicMaster.gain.value, t);
      this._musicMaster.gain.linearRampToValueAtTime(0, t + 0.4);
      // disconnect dopo il fade
      const gain = this._musicMaster;
      this._musicMaster = null;
      setTimeout(() => { try { gain.disconnect(); } catch (e) {} }, 600);
    }
  }

  /** Jingle breve dopo la fanfara di traguardo: una rapida cadenza V-I
   *  che "chiude" la frase musicale e dà sensazione di compimento. */
  finishJingle() {
    if (this.muted) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;
    // Note: G5 - C6 - E6 - G6 (arpeggio di Do maggiore in salita)
    // veloci (50 ms tra una e l'altra), poi accordo finale tenuto
    const seq = [
      { f: 783.99, dur: 0.07, type: 'triangle', vol: 0.10, t: 0.00 },
      { f: 1046.50, dur: 0.07, type: 'triangle', vol: 0.10, t: 0.06 },
      { f: 1318.51, dur: 0.07, type: 'triangle', vol: 0.10, t: 0.12 },
      // Accordo finale: tre voci che suonano insieme e tengono
      { f: 523.25, dur: 0.50, type: 'square', vol: 0.08, t: 0.20 },   // C5
      { f: 659.25, dur: 0.50, type: 'square', vol: 0.07, t: 0.20 },   // E5
      { f: 783.99, dur: 0.50, type: 'square', vol: 0.07, t: 0.20 },   // G5
    ];
    const start = ctx.currentTime;
    for (const n of seq) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = n.type;
      osc.frequency.setValueAtTime(n.f, start + n.t);
      g.gain.setValueAtTime(0, start + n.t);
      g.gain.linearRampToValueAtTime(n.vol, start + n.t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, start + n.t + n.dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(start + n.t);
      osc.stop(start + n.t + n.dur + 0.02);
    }
  }
}
