// src/systems/RunPhysics.js
// Modello fisico T&F (Track & Field) per Tap Trail.
//
// Sostituisce il vecchio sistema stamina/HR/H2O. Velocità derivata da:
//   - tap rate (frequenza di tap alternati ←/→)
//   - pendenza istantanea del GPX
//   - consistenza del ritmo (penalità su ritmo irregolare, bonus su ritmo costante)
//
// Velocità interna: m/s (semplice e fisica).
// Velocità mostrata all'utente: pace in min/km (convertito da m/s).
//   range: 2:30/km (campione mondiale) → 10:00/km (camminata sostenuta)
//
// ========== FORMULA VELOCITÀ ==========
//
// 1) velocità base da tap rate (m/s):
//    fmax tap rate = 6 Hz (limite umano realistico)
//    a tap_hz = 0 → v_base = 1.67 m/s (= 10 min/km, camminata)
//    a tap_hz = 6 → v_base = 6.67 m/s (= 2:30 min/km, massima)
//    curva: esponenziale "ease-out" con saturazione
//      v_base(tap_hz) = V_MIN + (V_MAX - V_MIN) * (1 - exp(-tap_hz / TAU))
//      con TAU = 2.5  (a 2.5 Hz raggiunge il 63%, a 5 Hz l'86%, a 6+ Hz satura)
//
// 2) modificatore pendenza:
//    pendenza < -8%  (discesa ripida): bonus 1.18 ± random(0.05)
//    pendenza -8..-3%  (discesa media): 1.12
//    pendenza -3..3%  (pianura): 1.00
//    pendenza 3..7%  (salita lieve): 0.85
//    pendenza 7..12% (salita media): 0.70
//    pendenza > 12% (salita ripida): 0.55
//
// 3) modificatore consistenza tap:
//    stability 0..1 (da Input.getRhythmStability)
//    fattore = 0.85 + 0.20 * stability
//    (range 0.85..1.05: penalità se ritmo irregolare, bonus se costante)
//
// velocità finale = v_base * pendenza * consistenza, in m/s.
//
// ========== CALIBRAZIONE TEMPI GARA ==========
// Per ogni distanza km, il tempo "perfetto" di percorrenza è:
//   t_perf(km) = 4.5 + 1.6 * km^0.78   (secondi)
//
// 10K → ~14s, 25K → ~24s, 40K → ~34s.
// Significa velocità media perfetta:
//   v_perf(km) = (km*1000) / t_perf(km)
// es. 10K: 10000/14 = 714 m/s (assurdo nel mondo reale, ma è un GIOCO arcade!)
// È velocità "compressa" T&F-style — il giocatore percepisce il tempo di gara,
// non la distanza reale, e l'unità min/km è SOLO DI DISPLAY (volutamente finta).
//
// Per ottenere t_perf con la formula v_base, il gioco scala internamente m/s
// con un fattore TIME_SCALE in modo che il km del gioco sia molto più breve
// del km reale. Questo fattore è derivato dalla distanza: tracce più lunghe
// hanno scala maggiore così durano comunque 30s circa.

// === COSTANTI MODELLO ===

const V_MIN = 1.67;   // m/s a tap_hz=0  (= 10:00 min/km)
const V_MAX = 6.67;   // m/s a tap_hz=∞ (= 2:30 min/km)
const TAU   = 2.5;    // costante di tempo curva ease-out (1/Hz)

const SLOPE_BANDS = [
  { thr: -0.08, factor: 1.18, jitter: 0.05 },   // discesa ripida
  { thr: -0.03, factor: 1.12, jitter: 0.00 },   // discesa media
  { thr:  0.03, factor: 1.00, jitter: 0.00 },   // pianura
  { thr:  0.07, factor: 0.85, jitter: 0.00 },   // salita lieve
  { thr:  0.12, factor: 0.70, jitter: 0.00 },   // salita media
  { thr:  10.0, factor: 0.55, jitter: 0.00 },   // salita ripida
];

const CONSISTENCY_BASE = 0.85;
const CONSISTENCY_GAIN = 0.20;

// === CONVERSIONI ===

/** m/s → min/km (paceMin). Es. 3.33 m/s → 5 min/km. */
export function msToMinPerKm(ms) {
  if (ms <= 0.01) return 99.99;
  return 1000 / (ms * 60);
}

/** Formatta pace come stringa "M:SS" (minuti:secondi per km). */
export function formatPace(ms) {
  const minPerKm = msToMinPerKm(ms);
  if (minPerKm >= 99) return '--:--';
  const totalSec = minPerKm * 60;
  const mm = Math.floor(totalSec / 60);
  const ss = Math.round(totalSec - mm * 60);
  if (ss === 60) return `${mm + 1}:00`;
  return `${mm}:${ss.toString().padStart(2, '0')}`;
}

/** Min/km range mostrabili nel HUD. */
export const PACE_MIN_MS = V_MAX;   // pace minimo possibile = 2:30/km
export const PACE_MAX_MS = V_MIN;   // pace massimo possibile = 10:00/km

// === CALCOLO VELOCITÀ ===

/** Velocità base in m/s in funzione del tap rate.
 *  @param tapHz frequenza tap validi (Hz, da Input.getTapRateHz)  */
export function vBaseFromTapHz(tapHz) {
  if (tapHz <= 0) return V_MIN;
  const t = Math.min(tapHz, 10);   // hard cap a 10 Hz (paranoia)
  const k = 1 - Math.exp(-t / TAU);
  return V_MIN + (V_MAX - V_MIN) * k;
}

/** Fattore moltiplicativo da pendenza istantanea (-1..+1). */
export function slopeFactor(slope) {
  for (const band of SLOPE_BANDS) {
    if (slope < band.thr) {
      const jitter = band.jitter > 0
        ? (Math.random() * 2 - 1) * band.jitter
        : 0;
      return band.factor + jitter;
    }
  }
  // fallback (non dovrebbe accadere col thr=10 finale)
  return 0.55;
}

/** Fattore moltiplicativo dalla regolarità del ritmo (0..1). */
export function consistencyFactor(stability) {
  const s = Math.max(0, Math.min(1, stability));
  return CONSISTENCY_BASE + CONSISTENCY_GAIN * s;
}

// === STATO PHYSICS (oggetto pulito) ===

/**
 * Stato fisico del runner. Sostituisce concettualmente Stamina.
 * Use:
 *   const phys = new RunPhysics();
 *   phys.update(dt, { tapHz, slope, stability });
 *   const speedMs = phys.speedMs;
 *   const paceStr = phys.paceString;   // "3:45" formato min/km
 */
export class RunPhysics {
  constructor() {
    this.speedMs = V_MIN;         // velocità lineare m/s (smussata)
    this._targetMs = V_MIN;       // target istantaneo (non smussato)
    this.lastTapHz = 0;
    this.lastSlope = 0;
    this.lastStability = 0;
    this.lastSlopeFactor = 1.0;
    this.lastConsistencyFactor = 1.0;
    // Smoothing della velocità per evitare jittering:
    // alpha alto = reazione veloce, alpha basso = molto smussato.
    this.smoothingAlpha = 4.0;   // ~quart di secondo di lag
  }

  /** Aggiorna lo stato fisico.
   *  @param dt delta-time in secondi
   *  @param inp.tapHz frequenza tap validi (Hz)
   *  @param inp.slope pendenza istantanea (-1..+1, es. 0.08 = 8% salita)
   *  @param inp.stability regolarità ritmo 0..1 */
  update(dt, { tapHz = 0, slope = 0, stability = 0 } = {}) {
    this.lastTapHz = tapHz;
    this.lastSlope = slope;
    this.lastStability = stability;
    const vBase = vBaseFromTapHz(tapHz);
    const sf = slopeFactor(slope);
    const cf = consistencyFactor(stability);
    this.lastSlopeFactor = sf;
    this.lastConsistencyFactor = cf;
    this._targetMs = vBase * sf * cf;
    // Smoothing esponenziale verso target
    const k = 1 - Math.exp(-this.smoothingAlpha * dt);
    this.speedMs += (this._targetMs - this.speedMs) * k;
  }

  get paceMinPerKm() {
    return msToMinPerKm(this.speedMs);
  }

  get paceString() {
    return formatPace(this.speedMs);
  }

  /** Posizione normalizzata 0..1 della velocità tra min e max (per HUD bar). */
  get speedNormalized() {
    return Math.max(0, Math.min(1,
      (this.speedMs - V_MIN) / (V_MAX - V_MIN)
    ));
  }

  reset() {
    this.speedMs = V_MIN;
    this._targetMs = V_MIN;
    this.lastTapHz = 0;
    this.lastSlope = 0;
    this.lastStability = 0;
  }
}

// === TIME SCALE PER COMPRESSIONE GARE ===
// Il gioco mostra "km" e pace realistici ma il tempo di gara è arcade-corto.
// time_scale = velocità_apparente / velocità_reale_progresso_GPX
// Esempio: gara 25 km, target ~24s, velocità media perfetta nel mondo gioco
// = velocità tra 2:30/km e 10/km, diciamo 3:30/km = 4.76 m/s.
// Per fare 25 km in 24s servono 25000/24 = 1041 m/s "apparenti" sul percorso.
// time_scale = 1041 / 4.76 ≈ 218.
//
// In pratica nel codice del game-loop il "progress" sul GPX aumenta più velocemente
// della velocità m/s reale. La formula del time scale:

/** Calcola lo scaling temporale per una gara di una certa distanza km
 *  in modo che la durata target sia (4.5 + 1.6 * km^0.78) secondi. */
export function timeScaleForRace(km) {
  const targetSec = 4.5 + 1.6 * Math.pow(km, 0.78);
  // velocità media "tipica giocatore medio" = 4 m/s (~4:10/km)
  const typicalMs = 4.0;
  const realDistance = km * 1000;
  const apparentVelocityNeeded = realDistance / targetSec;
  return apparentVelocityNeeded / typicalMs;
}
