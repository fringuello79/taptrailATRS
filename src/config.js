// src/config.js
// Configurazione runtime di Tap Trail V2.
//
// LEADERBOARD_URL:
//   URL del Google Apps Script Web App che fa da backend leaderboard.
//   Lascialo come stringa vuota '' per giocare 100% offline (nessuna chiamata di rete,
//   il bottone "INVIA ONLINE" mostra "BACKEND NON CONFIGURATO").
//
//   Per attivarlo:
//   1. Apri docs/LEADERBOARD_SETUP.md e segui i 5 passi.
//   2. Quando deployi il Web App, Google ti dà un URL del tipo:
//        https://script.google.com/macros/s/AKfycb.../exec
//   3. Incollalo qui sotto al posto della stringa vuota.
//
//   Tip: questa costante è importata SOLO da src/systems/Leaderboard.js.
//   Quindi nessun altro modulo "vede" l'URL e nessun altro fa rete.

export const LEADERBOARD_URL = 'https://script.google.com/macros/s/AKfycbwwKriV26yOnz6Ll_sGRK7tnr-h_xf6fDIPBNfFzJuQBxbTbr75fSRCKEsoY3Qg9eLvBA/exec';

// Limite massimo entries che il client chiede al backend per ogni track/championship.
// Il sheet può tenerne migliaia, qui vediamo solo le top.
export const LEADERBOARD_TOP_N = 20;

// Timeout di rete (ms) per submit/fetch. Sopra questa soglia → fallback offline.
export const LEADERBOARD_TIMEOUT_MS = 8000;
