// src/systems/Scoring.js
// Sistema punteggi ATRS 2026:
// - Posizione virtuale dal tempo gara confrontato con scala calibrata
// - Coefficiente UTMB additivo dal regolamento (0 / +20 / +40)
// - Moltiplicatore stile (0.85x..1.10x) basato su stamina/HR/crampi
//
// Riferimento: regolamento ufficiale Abruzzo Trail Run Series 2026.

/**
 * Pace di riferimento per i 5 percentile, in secondi/km su PIANO,
 * più maggiorazione (s/km) per ogni 100m di dislivello positivo.
 */
const PACE_TIERS = [
  // [posizione, pace_piano_s/km, penalty_per_100m_gain_s/km]
  { pos: 1,   pace: 270, penalty: 50 },   // 4:30/km + 0:50 per 100m
  { pos: 6,   pace: 315, penalty: 60 },   // 5:15/km + 1:00
  { pos: 50,  pace: 420, penalty: 90 },   // 7:00/km + 1:30
  { pos: 100, pace: 570, penalty: 90 },   // 9:30/km + 1:30
  { pos: 200, pace: 750, penalty: 120 },  // 12:30/km + 2:00
];

/** Calcola il tempo "obiettivo" (in secondi) di un percentile su una distanza. */
export function targetTime(percentilePos, distanceKm, gainM) {
  // Trovo i due tier più vicini al percentile
  let lower = PACE_TIERS[0], upper = PACE_TIERS[PACE_TIERS.length - 1];
  for (let i = 0; i < PACE_TIERS.length - 1; i++) {
    if (percentilePos >= PACE_TIERS[i].pos && percentilePos <= PACE_TIERS[i+1].pos) {
      lower = PACE_TIERS[i];
      upper = PACE_TIERS[i+1];
      break;
    }
  }
  // Interpolo linearmente pace e penalty
  const t = (percentilePos - lower.pos) / (upper.pos - lower.pos || 1);
  const pace = lower.pace + (upper.pace - lower.pace) * t;
  const penalty = lower.penalty + (upper.penalty - lower.penalty) * t;
  // tempo totale = pace × km + penalty × (gain/100)
  return pace * distanceKm + penalty * (gainM / 100);
}

/** Determina la posizione virtuale dato il tempo del giocatore. */
export function virtualPosition(playerTimeSec, distanceKm, gainM) {
  // Cerco la posizione tale che targetTime(pos) = playerTimeSec
  // Faccio binary search tra 1 e 250
  let lo = 1, hi = 250;
  // Se più veloce del 1° → pos < 1, ma cap a 1
  if (playerTimeSec <= targetTime(1, distanceKm, gainM)) return 1;
  // Se più lento del 200° → pos = 200+
  if (playerTimeSec >= targetTime(200, distanceKm, gainM)) return 250;
  for (let i = 0; i < 30; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const t = targetTime(mid, distanceKm, gainM);
    if (t < playerTimeSec) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(1, lo);
}

/** Punteggio dalla posizione (regolamento ATRS letterale). */
export function positionScore(pos) {
  if (pos === 1) return 1000;
  if (pos === 2) return 950;
  if (pos === 3) return 910;
  if (pos === 4) return 880;
  if (pos === 5) return 860;
  if (pos === 6) return 850;
  if (pos >= 82) return 100;
  // 7°→81°: -10 per posizione, partendo da 850 al 6°
  // 7° = 840, 8° = 830, ..., 81° = 100
  return 850 - (pos - 6) * 10;
}

/**
 * Moltiplicatore stile basato su qualità della corsa.
 * Range 0.85x..1.10x.
 * - +5% se stamina finale ≥ 30
 * - +5% se >50% del tempo in zona HR soglia (140-165)
 * - -10% se ha avuto crampi
 */
export function styleMultiplier({ finalStamina, timeInThresholdRatio, hadCramp }) {
  let m = 1.0;
  if (finalStamina >= 30) m += 0.05;
  if (timeInThresholdRatio >= 0.5) m += 0.05;
  if (hadCramp) m -= 0.10;
  return Math.max(0.85, Math.min(1.10, m));
}

/**
 * Calcola il punteggio finale di una gara.
 * @param {object} input
 * @param {number} input.timeSec - tempo gara in secondi
 * @param {number} input.distanceKm
 * @param {number} input.gainM
 * @param {number} input.scoreBonus - coefficiente UTMB (0/20/40)
 * @param {number} input.finalStamina
 * @param {number} input.timeInThresholdRatio
 * @param {boolean} input.hadCramp
 * @returns {object} { virtualPos, positionPts, styleMul, scoreBonus, finalScore }
 */
export function calculateRaceScore(input) {
  const virtualPos = virtualPosition(input.timeSec, input.distanceKm, input.gainM);
  const positionPts = positionScore(virtualPos);
  const styleMul = styleMultiplier({
    finalStamina: input.finalStamina || 0,
    timeInThresholdRatio: input.timeInThresholdRatio || 0,
    hadCramp: input.hadCramp || false,
  });
  // Punteggio = (posizione × stile) + coefficiente UTMB additivo
  // Il coefficiente è additivo come da regolamento ATRS letterale.
  const baseScore = positionPts * styleMul;
  const finalScore = Math.round(baseScore + (input.scoreBonus || 0));
  return {
    virtualPos,
    positionPts,
    styleMul,
    scoreBonus: input.scoreBonus || 0,
    baseScore: Math.round(baseScore),
    finalScore,
  };
}
