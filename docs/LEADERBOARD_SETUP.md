# Setup Backend Leaderboard ATRS 2026

Pattern: **Google Apps Script + Google Sheet** (lo stesso usato in Pepper Drop).
Niente server da pagare, niente Firebase, niente token nel client.
Un account Google e 5 minuti.

---

## Passo 1 — Crea il foglio

1. Vai su https://drive.google.com → Nuovo → Google Foglio.
2. Chiamalo qualcosa come "ATRS 2026 Leaderboard".
3. Copia l'**ID del foglio** dalla URL del browser. È la parte tra `/d/` e `/edit`:
   ```
   https://docs.google.com/spreadsheets/d/AbCdEfGh1234567890XYZ/edit
                                          ^^^^^^^^^^^^^^^^^^^^^^^^
                                          questo è l'ID
   ```
4. Tienilo da parte: lo incolli al Passo 2.

Il foglio resta vuoto. Le intestazioni le crea da solo lo script al primo POST.

---

## Passo 2 — Crea l'Apps Script

1. Vai su https://script.google.com → **Nuovo progetto**.
2. Cancella tutto il contenuto di `Code.gs`.
3. Apri `docs/leaderboard_apps_script.gs` (in questo repo) e
   **incolla tutto** dentro `Code.gs`.
4. In cima al file, sostituisci `'INCOLLA-QUI-LID-DEL-TUO-GOOGLE-SHEET'`
   con l'ID che hai copiato al Passo 1.
5. Salva (icona disco o `Ctrl+S`). Dai un nome al progetto se chiede:
   *"ATRS Leaderboard Backend"*.

---

## Passo 3 — Test che il foglio sia raggiungibile

1. In alto, dropdown delle funzioni → seleziona `testSetup`.
2. Premi **Esegui**.
3. La prima volta Google chiede l'autorizzazione: "Verifica autorizzazioni" →
   scegli il tuo account → "Avanzate" → "Vai su ATRS Leaderboard Backend (non sicuro)" → "Consenti".
   *Non sicuro* è solo perché lo script non è verificato da Google: è codice tuo,
   non c'è nulla di pericoloso.
4. Torna nello script: tab "Log d'esecuzione" deve mostrare:
   `Sheet OK: leaderboard, rows=1`
5. Apri il foglio: deve apparire un tab `leaderboard` con la riga di header
   (ts, clientId, player, board, ...).

Se vedi questo, il backend funziona già lato server. Manca solo esporlo come URL.

---

## Passo 4 — Distribuisci come Web App

1. In alto a destra: **Distribuisci** → **Nuova distribuzione**.
2. Icona ingranaggio accanto a "Tipo selezione" → **App web**.
3. Compila:
   - **Descrizione**: `ATRS Leaderboard v1`
   - **Esegui come**: *Te stesso*
   - **Chi ha accesso**: **Chiunque** (anche anonimo)
4. Premi **Distribuisci**.
5. Google ti dà un URL del tipo:
   ```
   https://script.google.com/macros/s/AKfycbxXXXXXXXXX/exec
   ```
   **Copialo**. È l'endpoint pubblico.

> ⚠️ Ogni volta che modifichi il codice e vuoi mandare le modifiche live,
> devi fare **Distribuisci → Gestisci distribuzioni → matita** e creare
> una *nuova versione*. L'URL resta lo stesso.

---

## Passo 5 — Attiva il client

1. Apri `src/config.js` nel progetto Tap Trail.
2. Sostituisci la stringa vuota con l'URL appena copiato:
   ```js
   export const LEADERBOARD_URL = 'https://script.google.com/macros/s/AKfyc.../exec';
   ```
3. Ricarica il gioco. Fine.

Adesso quando chiudi un Campionato e premi **INVIA ONLINE**, lo score finale
viene scritto sul tuo foglio. La schermata Classifica mostra una tab
**ONLINE** con la top-N pescata in tempo reale.

---

## Modalità offline-only

Se lasci `LEADERBOARD_URL = ''` (default), il gioco gira senza fare alcuna
chiamata di rete. I bottoni "INVIA ONLINE" sono visibili ma mostrano
*BACKEND NON CONFIGURATO*. La classifica locale (localStorage) funziona
sempre.

---

## Cosa succede se la rete cade durante un submit

Il client mette l'entry in coda (`localStorage`, max 50). Al prossimo
`submit` o `fetchTop` riuscito, le entries in coda vengono inviate prima
del nuovo submit. La UI mostra "OFFLINE - IN CODA (N)" quando ci sono
entries pendenti.

---

## Schema dati nel foglio

Il backend scrive una riga per submit. Le colonne:

| col | nome | esempio |
|-----|------|---------|
| A | ts | 2026-05-10T15:23:45 (timestamp server) |
| B | clientId | tt2-1a2b3c4d (per dedupe) |
| C | player | MARIO |
| D | board | championship / voltigno-19k / ... |
| E | mode | single / championship |
| F | eventId | voltigno |
| G | trackId | voltigno-19k |
| H | timeSec | 1284.55 |
| I | score | 487 |
| J | distanceKm | 19 |
| K | gainM | 1230 |
| L | finalStamina | 42 |
| M | date | 2026-05-10T15:23:42.000Z (client-side) |
| N | extras | JSON libero per future estensioni |

Il GET di un board ritorna **un'entry per giocatore** (la migliore per
score, tie-break tempo asc). Quindi se Mario corre Voltigno-19K dieci
volte, in classifica appare una sola volta col suo PB.

---

## Troubleshooting

**"BACKEND NON CONFIGURATO" anche dopo aver impostato l'URL**
→ assicurati di aver salvato `src/config.js` e ricaricato la pagina (Ctrl+F5).

**POST/GET ritornano errore CORS**
→ shouldn't happen: lo script POSTa con `application/x-www-form-urlencoded`
che è una "simple request" CORS-safe. Se succede, vuol dire che qualcosa
nell'URL è sbagliato (es. hai copiato l'URL dello *script* invece di quello
del *Web App* deploy). Verifica che finisca con `/exec`, non `/edit`.

**"Errore di autorizzazione" al deploy**
→ è normale la prima volta. "Avanzate → Vai su ... (non sicuro)" → Consenti.
Non c'è alternativa: Apps Script richiede l'autorizzazione esplicita
del proprietario per accedere al Sheet.

**Il foglio non si popola**
→ apri "Log d'esecuzione" nell'editor Apps Script: ogni POST lascia un log.
Se vedi errori, il messaggio è descrittivo.

**Voglio resettare la classifica**
→ apri il Sheet, seleziona tutte le righe da 2 in giù, Elimina. Le intestazioni
le ricrea da solo lo script al prossimo submit.
