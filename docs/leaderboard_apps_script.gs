// ============================================================================
// Tap Trail V2 - Backend Leaderboard
// Google Apps Script Web App per Abruzzo Trail Run Series 2026.
//
// Pattern derivato da "Pepper Drop": Google Sheet come database, Apps Script
// come API.
//
// COME USARE:
//   1. Vai su https://script.google.com → Nuovo progetto.
//   2. Cancella il contenuto di Code.gs e incolla TUTTO questo file.
//   3. Crea un Google Sheet vuoto. Copia il suo ID dalla URL:
//      https://docs.google.com/spreadsheets/d/COPIA-QUESTA-PARTE/edit
//   4. Nel codice qui sotto, sostituisci SHEET_ID con l'ID del tuo Sheet.
//   5. Distribuisci > Nuova distribuzione > Tipo: App web
//        - Esegui come: Te stesso
//        - Chi ha accesso: CHIUNQUE (anche anonimo)
//      Copia l'URL che ti dà (es. https://script.google.com/macros/s/AKfycb.../exec).
//   6. Incolla l'URL in src/config.js → LEADERBOARD_URL.
//   7. Nessun altro setup. Il foglio si crea da solo al primo POST.
//
// SCHEMA DEL FOGLIO (creato in automatico):
//   ts | clientId | player | board | mode | eventId | trackId
//   timeSec | score | distanceKm | gainM | finalStamina | extras
//
// SICUREZZA:
//   - clientId scarta i doppi-submit della stessa sessione.
//   - Limite 30 char per il nome giocatore + sanitizzazione anti-formula injection
//     (i fogli interpretano testo che inizia con = + - @ come formula).
//   - Nessun delete: tutto storico, basta il GET per leggere top-N.
//
// COSTO:
//   - Apps Script free tier: ~20.000 trigger/giorno. Oltre il margine per qualunque
//     uso amatoriale. Se diventa virale, puoi sempre cappare con un limit.
// ============================================================================

// ---------- CONFIGURA QUESTO ------------------------------------------------
var SHEET_ID = 'INCOLLA-QUI-LID-DEL-TUO-GOOGLE-SHEET';
var SHEET_NAME = 'leaderboard';
// ---------------------------------------------------------------------------

var HEADERS = [
  'ts', 'clientId', 'player', 'board', 'mode',
  'eventId', 'trackId',
  'timeSec', 'score',
  'distanceKm', 'gainM', 'finalStamina',
  'date', 'extras',
];

// ============================================================================
// Endpoint POST: append di una entry.
// ============================================================================
function doPost(e) {
  try {
    var p = e.parameter || {};
    if (p.action !== 'submit') {
      return _json({ ok: false, error: 'action non valida' });
    }
    var player = _sanitizePlayer(p.player || '');
    if (!player)            return _json({ ok: false, error: 'player mancante' });
    if (!p.board)           return _json({ ok: false, error: 'board mancante' });
    if (!p.clientId)        return _json({ ok: false, error: 'clientId mancante' });

    var sheet = _getSheet();

    // Idempotenza: se questo clientId è già presente, ritorno OK senza scrivere.
    if (_clientIdExists(sheet, p.clientId)) {
      return _json({ ok: true, deduped: true });
    }

    var row = [
      new Date(),                                  // ts (server-side)
      String(p.clientId).slice(0, 64),
      player,
      String(p.board).slice(0, 64),
      String(p.mode || 'single').slice(0, 24),
      String(p.eventId || '').slice(0, 64),
      String(p.trackId || '').slice(0, 64),
      _num(p.timeSec),
      _num(p.score),
      _num(p.distanceKm),
      _num(p.gainM),
      _num(p.finalStamina),
      String(p.date || '').slice(0, 32),
      String(p.extras || '').slice(0, 1024),
    ];
    sheet.appendRow(row);
    return _json({ ok: true });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

// ============================================================================
// Endpoint GET: top-N per board.
// Query: ?action=top&board=<id>&n=<N>
// ============================================================================
function doGet(e) {
  try {
    var p = e.parameter || {};
    if (p.action !== 'top') {
      return _json({ ok: false, error: 'action non valida (usa ?action=top)' });
    }
    var board = String(p.board || '');
    if (!board) return _json([]);
    var n = Math.max(1, Math.min(100, parseInt(p.n || '20', 10)));

    var sheet = _getSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return _json([]);   // solo header → vuoto

    var values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
    // Per board sceglgo il MIGLIOR risultato per giocatore (best score, tie-break tempo asc).
    // Per il board 'championship' il "best" è lo score finale del campionato;
    // per i board singoli (trackId), è lo score migliore o tempo migliore.
    var byPlayer = {};
    for (var i = 0; i < values.length; i++) {
      var r = _rowToObj(values[i]);
      if (r.board !== board) continue;
      var key = (r.player || '').toUpperCase();
      var prev = byPlayer[key];
      if (!prev) { byPlayer[key] = r; continue; }
      // miglior entry: score più alto; in pari, tempo più basso.
      if (r.score > prev.score
          || (r.score === prev.score && r.timeSec > 0 && r.timeSec < prev.timeSec)) {
        byPlayer[key] = r;
      }
    }
    var arr = [];
    for (var k in byPlayer) arr.push(byPlayer[k]);
    arr.sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.timeSec === 0 && b.timeSec === 0) return 0;
      if (a.timeSec === 0) return 1;
      if (b.timeSec === 0) return -1;
      return a.timeSec - b.timeSec;
    });
    return _json(arr.slice(0, n));
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

// ============================================================================
// Helpers
// ============================================================================

function _getSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  } else {
    // se è vuoto, crea l'header
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function _clientIdExists(sheet, clientId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  // colonna B = clientId (index 2 in 1-based). Range stretto = veloce.
  var col = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) {
    if (col[i][0] === clientId) return true;
  }
  return false;
}

function _rowToObj(row) {
  return {
    ts:           row[0],
    clientId:     row[1],
    player:       row[2],
    board:        row[3],
    mode:         row[4],
    eventId:      row[5],
    trackId:      row[6],
    timeSec:      Number(row[7]) || 0,
    score:        Number(row[8]) || 0,
    distanceKm:   Number(row[9]) || 0,
    gainM:        Number(row[10]) || 0,
    finalStamina: Number(row[11]) || 0,
    date:         row[12],
    extras:       row[13],
  };
}

function _num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

/** Pulisce il nome giocatore: max 30 char, niente prefissi che Sheets interpreta come
 *  formula (= + - @), niente whitespace ridondante. */
function _sanitizePlayer(name) {
  var s = String(name || '').trim().slice(0, 30);
  if (!s) return '';
  // se inizia con un carattere "formula", lo prefisso con un apostrofo (Sheets-safe)
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// Test rapido (esegui da editor Apps Script: menu Esegui → testSetup):
// ============================================================================
function testSetup() {
  var sheet = _getSheet();
  Logger.log('Sheet OK: ' + sheet.getName() + ', rows=' + sheet.getLastRow());
}
