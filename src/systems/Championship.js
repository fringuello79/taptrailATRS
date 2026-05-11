// src/systems/Championship.js
// Gestisce lo stato persistente del Campionato ATRS 2026 di un giocatore.
// Salvato in localStorage. Tracking completo: quale evento è il "prossimo"
// nel calendario, quali sono già stati giocati, punteggi, tempi, stamina di carry-over.

const STORAGE_KEY = 'taptrail.championship.v1';

/** Stato vuoto iniziale per un nuovo campionato. */
function blankState() {
  return {
    started: false,         // true dopo la prima gara
    currentEventIndex: 0,   // indice nell'array events del manifest (0..5)
    completedEvents: {},    // {eventId: {distanceId, timeSec, score, completed: true|false (false=skip)}}
    totalScore: 0,
    carryStamina: 100,      // stamina di partenza per la prossima gara
    seasonComplete: false,
    // Personaggio scelto alla 1ª gara, fisso per tutto il campionato
    character: null,        // {gender, shirtColor, name} o null se ancora da scegliere
  };
}

/** Carica state da localStorage. */
export function loadChampionship() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...blankState(), ...JSON.parse(raw) };
  } catch (e) { /* ignore */ }
  return blankState();
}

/** Salva state in localStorage. */
export function saveChampionship(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) { /* ignore */ }
}

/** Reset completo del campionato (per ricominciare). */
export function resetChampionship() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) { /* ignore */ }
  return blankState();
}

/**
 * Calcola la stamina di partenza per la prossima gara,
 * basata sul risultato della gara appena completata.
 *
 * Regole:
 * - Recovery base tra una gara e l'altra: +30 stamina
 * - Bonus se hai chiuso bene (posizione virtuale ≤ 50): +20 stamina
 * - Cap 100, min 0
 * - Se hai mollato: parti con stamina al momento del molla + 15
 * - Se la prossima è UTMB 50K: +10 bonus extra (preparazione fisica per gara lunga)
 */
export function computeCarryStamina(prevRaceResult, nextDistance) {
  let base;
  if (prevRaceResult.skipped) {
    // Mollato → carry stamina attuale + penalità leggera
    base = (prevRaceResult.staminaAtSkip || 0) + 15;
  } else {
    // Completato → carry finalStamina + recovery
    base = (prevRaceResult.finalStamina || 0) + 30;
    if (prevRaceResult.virtualPos && prevRaceResult.virtualPos <= 50) {
      base += 20;
    }
  }
  // Bonus se prossima gara è UTMB 50K (preparazione lunga)
  if (nextDistance && nextDistance.utmb_category === '50K') {
    base += 10;
  }
  return Math.max(0, Math.min(100, Math.round(base)));
}

/**
 * Registra il risultato di una gara nel campionato.
 * @param {object} state - state corrente
 * @param {string} eventId
 * @param {object} result - { distanceId, timeSec, score, completed, finalStamina, virtualPos, skipped, staminaAtSkip }
 * @param {object} nextDistance - opzionale, per calcolare carry-over
 * @returns nuovo state
 */
export function recordRace(state, eventId, result, nextDistance = null) {
  const newState = { ...state, completedEvents: { ...state.completedEvents } };
  newState.completedEvents[eventId] = {
    distanceId: result.distanceId,
    timeSec: result.timeSec,
    score: result.score || 0,
    completed: !result.skipped,  // true se traguardo, false se mollato
    finalStamina: result.finalStamina || 0,
    virtualPos: result.virtualPos || null,
  };
  newState.totalScore = (state.totalScore || 0) + (result.score || 0);
  newState.started = true;
  // Avanza al prossimo evento
  newState.currentEventIndex = (state.currentEventIndex || 0) + 1;
  // Calcola stamina per la prossima gara
  newState.carryStamina = computeCarryStamina(result, nextDistance);
  // Stagione completa se siamo arrivati a 6
  if (newState.currentEventIndex >= 6) {
    newState.seasonComplete = true;
  }
  return newState;
}

/**
 * Calcola il bonus partecipazione alla fine del campionato.
 * - 5 gare completate (taglio del traguardo): +50
 * - 6 gare completate: +100
 */
export function participationBonus(state) {
  const completed = Object.values(state.completedEvents)
    .filter(e => e.completed).length;
  if (completed >= 6) return 100;
  if (completed >= 5) return 50;
  return 0;
}

/** Riepilogo finale del campionato per la schermata di chiusura. */
export function championshipSummary(state, manifest) {
  const events = manifest.events;
  const summary = {
    races: [],
    totalRaceScore: 0,
    completedCount: 0,
    skippedCount: 0,
    bonus: 0,
    finalTotal: 0,
    finisher: false,  // true se completate tutte e 6
  };
  for (const event of events) {
    const ev = state.completedEvents[event.id];
    if (!ev) {
      summary.races.push({
        eventId: event.id,
        eventName: event.name,
        completed: false,
        skipped: false,
        notPlayed: true,
        score: 0,
      });
      continue;
    }
    const dist = event.distances.find(d => d.id === ev.distanceId);
    summary.races.push({
      eventId: event.id,
      eventName: event.name,
      distanceLabel: dist ? dist.label : ev.distanceId,
      distanceName: dist ? dist.name : '',
      timeSec: ev.timeSec,
      score: ev.score,
      completed: ev.completed,
      skipped: !ev.completed,
      notPlayed: false,
    });
    summary.totalRaceScore += ev.score;
    if (ev.completed) summary.completedCount++;
    else summary.skippedCount++;
  }
  summary.bonus = participationBonus(state);
  summary.finalTotal = summary.totalRaceScore + summary.bonus;
  summary.finisher = summary.completedCount >= 6;
  return summary;
}
