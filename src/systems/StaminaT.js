// src/systems/StaminaT.js
// Stamina semplificata per la fase T&F. Sostituisce concettualmente il vecchio
// Stamina.js (che resta congelato come archeologia). Modello:
//
// Stamina = 0..100. Decresce nel tempo, recupera rallentando o ai ristori.
//
// CONSUMO (per secondo), sommando i contributi:
//   - Base costante:               -1.2 / s
//   - Bonus velocità (vai forte):  se speedNorm > 0.70, fino a -2.0 / s al massimo
//   - Salita:                       se slope > 0.03, -3.5 * slope (es. 10% → -0.35 extra)
//   - Discesa:                      se slope < -0.03, +2.0 * |slope| (recupero in discesa)
//   - Tap rate molto basso:         se tapHz < 0.5, RECUPERO +5 / s (camminata = riposo)
//
// CLAMP: stamina ∈ [0, 100]. Mai negativa.
//
// PENALITÀ ESAURIMENTO: se stamina == 0, applica speedMultiplier() = 0.5 finché
// non risale sopra 10 (effetto "muro del maratoneta"). Sopra 10, multiplier = 1.

const BASE_DRAIN          = 1.6;    // era 1.2 — consumo lento ma più sensibile
const FAST_THRESHOLD      = 0.50;   // era 0.55 — entra in "fast" prima
const FAST_DRAIN_MAX      = 5.0;    // era 4.0 — sprint più impegnativo
const SLOPE_UP_FACTOR     = 4.5;    // era 3.5 — la salita morde di più
const SLOPE_DOWN_FACTOR   = 2.0;
const LOW_TAP_THRESHOLD   = 0.5;
const REST_RECOVERY_RATE  = 5.0;
const REFRESHMENT_BOOST   = 35;
const EXHAUSTION_THRESHOLD_LOW  = 0;
const EXHAUSTION_THRESHOLD_HIGH = 10;
const EXHAUSTED_MULTIPLIER = 0.5;

export class StaminaT {
  constructor() {
    this.stamina = 100;
    this.exhausted = false;
    // tracciamento per HUD
    this.lastDrainRate = 0;
    this.lastFlash = 0;   // timer flash visivo dopo ristoro (s)
  }

  /** Aggiorna lo stato della stamina.
   *  @param dt       delta tempo in secondi
   *  @param tapHz    frequenza tap (Hz)
   *  @param speedNorm velocità normalizzata 0..1
   *  @param slope    pendenza istantanea (-1..+1) */
  update(dt, { tapHz = 0, speedNorm = 0, slope = 0 } = {}) {
    let drainRate = 0;

    // Recupero "camminata": se sotto soglia di tap, recupero netto
    if (tapHz < LOW_TAP_THRESHOLD) {
      drainRate = -REST_RECOVERY_RATE;
    } else {
      // Base + bonus velocità
      drainRate = BASE_DRAIN;
      if (speedNorm > FAST_THRESHOLD) {
        const t = (speedNorm - FAST_THRESHOLD) / (1 - FAST_THRESHOLD);
        drainRate += FAST_DRAIN_MAX * Math.min(1, t);
      }
      // Pendenza
      if (slope > 0.03) {
        drainRate += SLOPE_UP_FACTOR * slope;
      } else if (slope < -0.03) {
        drainRate -= SLOPE_DOWN_FACTOR * Math.abs(slope);
      }
    }

    this.lastDrainRate = drainRate;
    this.stamina = Math.max(0, Math.min(100, this.stamina - drainRate * dt));

    // Stato esaurimento (hysteresis: scatta a 0, esce sopra 10)
    if (!this.exhausted && this.stamina <= EXHAUSTION_THRESHOLD_LOW) {
      this.exhausted = true;
    } else if (this.exhausted && this.stamina > EXHAUSTION_THRESHOLD_HIGH) {
      this.exhausted = false;
    }

    // Flash dopo ristoro decay
    if (this.lastFlash > 0) this.lastFlash -= dt;
  }

  /** Da chiamare quando il giocatore preleva un ristoro: boost +35. */
  takeRefreshment() {
    this.stamina = Math.min(100, this.stamina + REFRESHMENT_BOOST);
    this.lastFlash = 1.0;  // 1 secondo di flash visivo
  }

  /** Moltiplicatore di velocità per la fisica. 1 normale, 0.5 se esausto. */
  speedMultiplier() {
    return this.exhausted ? EXHAUSTED_MULTIPLIER : 1.0;
  }

  /** Stamina normalizzata 0..1 per la barra HUD. */
  get normalized() {
    return this.stamina / 100;
  }

  reset() {
    this.stamina = 100;
    this.exhausted = false;
    this.lastDrainRate = 0;
    this.lastFlash = 0;
  }
}
