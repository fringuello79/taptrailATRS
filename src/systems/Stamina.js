// src/systems/Stamina.js
// Modello fisiologico semplificato: stamina, frequenza cardiaca (HR),
// idratazione, cadenza ottimale, "flow state" da ritmo regolare.
//
// Tutti i numeri sono calibrati a sensazione, non clinici.

export class Stamina {
  constructor() {
    this.stamina = 100;       // 0..100
    this.hr = 70;             // bpm a riposo
    this.hydration = 100;     // 0..100
    this.flow = 0;            // 0..1, bonus da ritmo costante
    this.cramp = false;       // true se in crampi (penalità grave)
    this.crampTimer = 0;      // sec rimanenti di crampo
    this.recoverDelay = 0;    // sec di blocco quando esaurito
    this.maxHr = 195;
    this.targetHrZone = [140, 165]; // zona cardio "ideale" per trail medio
  }

  /**
   * @param {number} dt - secondi
   * @param {Object} ctx - {tapping, slope, cadenceSpm, rhythmStability,
   *                        weather, temperatureC, atRefreshment}
   */
  update(dt, ctx) {
    const tapping = !!ctx.tapping;
    const slope = ctx.slope || 0;
    // Hz istantaneo del tap (reattivo) o fallback su SPM
    const tapHz = ctx.tapHzInstant !== undefined ? ctx.tapHzInstant : (ctx.cadenceSpm || 0) / 60;
    const cadenceSpm = ctx.cadenceSpm || tapHz * 60;
    const rhythm = ctx.rhythmStability || 0;
    const tempC = ctx.temperatureC ?? 12;
    const atRefreshment = !!ctx.atRefreshment;

    // --- HR: sale rapidamente con frequenza tap, scende rapidamente quando rallenti ---
    // 0 Hz → target HR 70 (riposo)
    // 2 Hz → target HR ~115 (zona aerobica)
    // 3 Hz → target HR ~150 (soglia)
    // 4 Hz → target HR ~180 (anaerobica)
    // === HR: target dipende dalla cadenza, ricalibrato per range esteso (0..12 Hz) ===
    // 0-1 Hz: 70 (riposo)
    // 2 Hz: 95 (camminata)
    // 4 Hz: 130 (corsa lenta)
    // 6 Hz: 160 (corsa media)
    // 8 Hz: 180 (corsa intensa)
    // 10+ Hz: 195 (massimale, drum-roller)
    let intensity = 0;
    if (tapHz > 0.3) {
      // mappa non lineare: arriva al 100% intensity a 10 Hz invece di 5
      intensity = Math.min(1, Math.pow(tapHz / 10, 0.85));
      if (slope > 0) intensity += slope * 4;
      if (slope < 0) intensity *= 0.7;
      intensity = Math.max(0, Math.min(1.3, intensity));
    }
    const targetHr = 70 + intensity * (this.maxHr - 70);
    const isRising = targetHr > this.hr;
    const tau = isRising ? 3 : 1.5;
    this.hr += (targetHr - this.hr) * Math.min(1, dt / tau);

    // --- Stamina ---
    if (this.cramp) {
      if (ctx.crampReleasePress) {
        this.crampTimer = Math.max(0, this.crampTimer - 0.4);
      }
      const hrFactor = Math.max(0.2, (this.hr - 100) / 100);
      this.crampTimer -= dt * (1.0 / hrFactor);
      if (this.crampTimer <= 0) {
        this.cramp = false;
        this.crampTimer = 0;
        this.recoverDelay = 0.8;
        this.stamina = Math.max(this.stamina, 25);
      }
    } else if (this.recoverDelay > 0) {
      this.recoverDelay -= dt;
    } else if (tapping || tapHz > 0.3) {
      // === STAMINA NETTO (drain/recovery come funzione continua) ===
      // PUNTO DI EQUILIBRIO: 5 Hz (alzato da 3 Hz per dare più "spazio sostenibile").
      // Sotto 5 Hz: recuperi (più rallenti, più recuperi)
      // Sopra 5 Hz: bruci (più tappi, più bruci)
      //
      // Curva pensata per essere COMPETITIVA ma BILANCIATA:
      // 0 Hz → +25/sec  (fermo, recupero pieno)
      // 2 Hz → +12/sec  (recuperi rallentando)
      // 3 Hz → +8/sec
      // 4 Hz → +3/sec   (recupero leggero)
      // 5 Hz → 0        (EQUILIBRIO: ritmo gara sostenibile per sempre)
      // 6 Hz → -1.5/sec (drain leggero, ancora sostenibile per minuti)
      // 7 Hz → -3.5/sec (drain medio, sostenibile ~30s)
      // 8 Hz → -6.5/sec (drain forte, ~15s)
      // 10 Hz → -14/sec  (sprint, brucia in ~7s)
      // 12 Hz → -25/sec  (drum-roll, brucia in 4s)
      // 14 Hz → -40/sec  (massimale, insostenibile)
      let staminaRate;
      if (tapHz < 5) {
        // recupero crescente verso il fermo
        staminaRate = Math.pow(5 - tapHz, 1.0) * 5;
      } else {
        // drain crescente con cadenza
        staminaRate = -Math.pow(tapHz - 5, 1.7) * 1.3;
      }

      // === BONUS ZONA SOGLIA HR ===
      // Quando il cuore è in zona "soglia" (140-165 BPM), il corpo è nello sweet spot
      // fisiologico → drain ridotto del 40% (riproduce l'efficienza atletica della
      // frequenza cardiaca cardio-ottimale).
      // Bonus DECRESCE smoothly fuori dalla zona per evitare salti.
      let hrEfficiency = 0;
      if (this.hr >= 140 && this.hr <= 165) {
        hrEfficiency = 0.4;  // 40% bonus al centro della zona
      } else if (this.hr >= 130 && this.hr < 140) {
        hrEfficiency = 0.4 * (this.hr - 130) / 10;  // rampa salita
      } else if (this.hr > 165 && this.hr <= 175) {
        hrEfficiency = 0.4 * (175 - this.hr) / 10;  // rampa discesa
      }
      // Applico solo al drain (rate negativo), non al recovery
      if (staminaRate < 0) {
        staminaRate *= (1 - hrEfficiency);
      }

      // Penalità salita
      const slopePenalty = slope > 0 ? 1 + slope * 4 : 1;
      // Penalità idratazione
      const hydrationPenalty = this.hydration < 30 ? 1.3 : 1;
      if (staminaRate < 0) {
        staminaRate *= slopePenalty * hydrationPenalty;
      }
      this.stamina += staminaRate * dt;

      // Bonus "flow": cadenza in finestra ideale + ritmo stabile
      const idealCad = 165;
      const cadDist = Math.abs(cadenceSpm - idealCad) / idealCad;
      const cadScore = Math.max(0, 1 - cadDist * 2);
      const target = cadScore * rhythm;
      this.flow += (target - this.flow) * Math.min(1, dt * 1.5);
      if (this.flow > 0.5) this.stamina += this.flow * 2 * dt;
    } else {
      // Recupero passivo (smesso del tutto di tappare): potenziato
      const hrEffect = Math.max(0, (140 - this.hr) / 140);
      this.stamina += (15 + hrEffect * 30) * dt;  // fino a +45 stamina/sec a riposo
      this.flow *= Math.exp(-dt * 0.6);
    }

    // --- Idratazione: cala lentamente con sforzo, ancora di più al caldo ---
    if (tapping) {
      const heat = Math.max(0, (tempC - 10) / 25);
      this.hydration -= (0.4 + heat * 1.2) * dt;
    }
    if (atRefreshment) {
      this.hydration = Math.min(100, this.hydration + 30 * dt);
      this.stamina = Math.min(100, this.stamina + 15 * dt);
    }

    // --- Crampi: stamina a zero o idratazione molto bassa per troppo tempo ---
    if (!this.cramp && this.stamina <= 0) {
      this.cramp = true;
      this.crampTimer = 4.0;  // più lungo ma uscibile premendo C
      this.stamina = 0;
    }
    if (this.hydration < 5 && tapping && Math.random() < dt * 0.15) {
      this.cramp = true;
      this.crampTimer = 2.5;
    }

    // Clamp
    this.stamina = Math.max(0, Math.min(100, this.stamina));
    this.hydration = Math.max(0, Math.min(100, this.hydration));
    this.flow = Math.max(0, Math.min(1, this.flow));
  }

  /** Moltiplicatore di velocità derivato dallo stato fisiologico (0..1.2). */
  speedMultiplier() {
    if (this.cramp || this.recoverDelay > 0) return 0;
    let m = 0.7 + (this.stamina / 100) * 0.3;        // 0.7 a stamina 0, 1.0 a 100
    m += this.flow * 0.15;                            // bonus flow
    if (this.hydration < 30) m *= 0.92;               // disidratazione
    if (this.hr > this.maxHr * 0.95) m *= 0.9;        // zona rossa
    return m;
  }

  hrZone() {
    if (this.hr < 110) return 'recupero';
    if (this.hr < 140) return 'aerobica';
    if (this.hr < 165) return 'soglia';
    if (this.hr < 180) return 'anaerobica';
    return 'massimale';
  }
}
