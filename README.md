# Tap Trail V2 — Abruzzo Trail Edition

Side-scroller pixel-art di trail running. Riedizione in vera pixel art (stile *Monkey Island 2*) del Tap Trail V1, con simulazione realistica di stamina, frequenza cardiaca, idratazione, cadenza, ghost del PB, meteo dinamico, e architettura estensibile per aggiungere nuove gare via GPX.

Prima gara inclusa: **L'Alba dei Marsi 21K** (686 punti GPX reali).

---

## Avvio rapido

⚠️ **Non aprire `index.html` con doppio click**: il gioco usa `fetch()` per caricare i tracks JSON, e i browser bloccano `fetch()` su `file://`. Serve un server locale.

### Opzione 1 — Python (incluso quasi ovunque)

```bash
cd taptrail_v2
python3 -m http.server 8080
```

Poi apri `http://localhost:8080` nel browser.

### Opzione 2 — Node

```bash
npx serve taptrail_v2 -p 8080
```

### Opzione 3 — Live Server (VS Code)

Apri la cartella in VS Code, installa l'estensione *Live Server*, click destro su `index.html` → "Open with Live Server".

---

## Comandi di gioco

| Azione                | Tasto / Input                          |
|-----------------------|----------------------------------------|
| Tap (corri)           | **Spazio** / click / tocco sullo schermo |
| Conferma menu         | **Invio**                              |
| Indietro / pausa      | **Esc**                                |
| Cambia genere         | **M** (uomo) / **F** (donna)           |
| Cambia colore maglia  | **← / →**                              |
| Cambia gara           | **↑ / ↓** in selezione gara            |

Sui dispositivi mobili tutto è cliccabile/toccabile. Funziona ottimamente su tablet e telefoni in landscape.

---

## Strategia di gameplay

Non è "più tappi più vai forte". Il sistema premia il **ritmo regolare** in una **finestra di cadenza ottimale** (~165 spm). Quando entri in *flow*:

- la barra `FLOW` lampeggia verde-oro
- spendi meno stamina a parità di velocità
- guadagni un piccolo bonus di velocità

Se invece martelli a cadenza altissima:

- la frequenza cardiaca schizza in zona rossa
- la stamina cala più velocemente
- rischi i **crampi** (blocco totale di 2.5 secondi)

I **ristori** lungo il percorso (bandierine bianche/rosse + banchetto blu) ti restituiscono idratazione e stamina, ma **devi rallentare** per "prenderli" (cadenza < 80 spm).

Le **salite** sono punitive (consumo aumenta col quadrato della pendenza). Le **discese** spingono ma non gratis: la stamina si recupera meno rispetto al passo.

Il **ghost del tuo PB** appare in semitrasparenza sul tracciato e nella minimappa: è la silhouette del tuo miglior tempo precedente. Bonus motivazionale da videogioco anni '90.

---

## Aggiungere una nuova gara da GPX

Hai un file GPX di un'altra gara dell'Abruzzo Trail Running Series? Si aggiunge in 3 passi.

### 1. Converti il GPX in JSON

```bash
python3 tools/gpx2track.py /percorso/a/tua-gara.gpx \
  -o tracks/trail-maiella-30k.json \
  --id trail-maiella-30k \
  --name "Trail della Maiella 30K" \
  --location "Maiella" \
  --difficulty difficile \
  --description "Saliscendi spettacolare nel cuore della Maiella" \
  --palette day_alpine
```

Lo script:
- legge il GPX (qualsiasi schema standard `<trkpt lat="" lon=""><ele>`)
- semplifica a max 800 punti (puoi cambiare con `--max-points`)
- calcola distanza reale haversine e dislivello positivo cumulato
- scrive un JSON pronto

### 2. Registra la track nel manifest

Apri `tracks/manifest.json` e aggiungi (o sostituisci un placeholder con) un'entry:

```json
{
  "id": "trail-maiella-30k",
  "file": "trail-maiella-30k.json",
  "name": "Trail della Maiella 30K",
  "location": "Maiella",
  "distance_km": 30.5,
  "elevation_gain_m": 1450,
  "difficulty": "difficile",
  "unlocked": true,
  "order": 2
}
```

### 3. Ricarica il gioco

La nuova gara compare automaticamente nella schermata "Seleziona gara".

### Palette ambientali disponibili

- `dawn_mountains` — alba marsicana, cielo arancio, monti neve (default)
- `day_alpine` — giorno chiaro, prati, alta montagna
- `dusk_forest` — tramonto in faggeta

Aggiungerne altre: aggiungi un blocco a `AmbientPalettes` in `src/scenes/WorldRenderer.js`.

### Meteo

Il meteo si sceglie in **Seleziona gara** (bottone in alto a destra). Disponibili: alba serena, giorno sereno, nuvoloso, nebbia in quota, tramonto, pioggia leggera. Influenza visibilità, vento (resistenza), e idratazione (caldo).

---

## Struttura del progetto

```
taptrail_v2/
├── index.html              # shell HTML con canvas
├── src/
│   ├── main.js             # entry point: carica manifest, avvia game
│   ├── core/
│   │   ├── Game.js         # gameloop, state machine, gestione scene
│   │   └── Track.js        # GPX → distanze, altimetria, minimappa
│   ├── systems/
│   │   ├── Input.js        # tap unificato + cadenza/ritmo
│   │   ├── Storage.js      # localStorage: profilo, record, ghost
│   │   ├── Stamina.js      # sim fisiologica: stamina/HR/idratazione
│   │   ├── Weather.js      # preset meteo
│   │   └── Audio.js        # SFX procedurali WebAudio (no file audio)
│   ├── entities/
│   │   └── RunnerSprite.js # sprite pixel art generato a runtime, 6 frame
│   ├── scenes/
│   │   ├── MenuScene.js
│   │   ├── TrackSelectScene.js
│   │   ├── CharacterScene.js
│   │   ├── RaceScene.js    # ⭐ il cuore del gioco
│   │   ├── ResultsScene.js
│   │   ├── LeaderboardScene.js
│   │   └── WorldRenderer.js # parallasse + sentiero altimetrico
│   └── ui/
│       ├── PixelFont.js    # font bitmap 5x7 disegnato pixel a pixel
│       ├── HUD.js          # barre stamina/HR/idratazione/flow
│       └── Minimap.js      # minimappa GPX + profilo altimetrico
├── tracks/
│   ├── manifest.json       # elenco delle gare disponibili
│   └── alba-dei-marsi-21k.json  # GPX della prima gara, 686 punti
├── tools/
│   └── gpx2track.py        # convertitore GPX → JSON track
└── docs/
    └── DESIGN.md           # note di design e prossimi passi
```

---

## Perché questo design

Decisioni chiave e motivazione, per ricordartele tra qualche mese:

- **Vera pixel art generata a runtime, non JPG**. Lo sprite del runner viene disegnato pixel per pixel su un canvas off-screen all'avvio della partita, con palette parametrica (5 colori maglia × 2 generi). Così cambiare colore non richiede 10 file PNG e cambiare proporzioni è una modifica al codice, non a Photoshop. Stile MI2: testa grande, tronco corto, occhi grandi, palette limitata.

- **Risoluzione virtuale 480×270 (16:9), scalata via CSS con `image-rendering: pixelated`**. Il canvas interno è sempre 480×270, il browser lo upscala a misura dello schermo lasciando i pixel netti. È il trick standard dei retro-game moderni.

- **Sentiero che segue l'altimetria reale del GPX**. Per ogni colonna dello schermo, calcoliamo a quale `progress` del GPX corrisponde quella x in coordinate-mondo, leggiamo l'altitudine, e disegniamo il terreno a quella Y. Risultato: vedi la salita arrivare. Niente texture statica, niente "sfondo che scorre". È il punto di forza visivo.

- **Modello fisiologico semplice ma sentito**. HR si avvicina a un target con costante di tempo, stamina cala in funzione di HR sopra-soglia × pendenza × idratazione, flow è un bonus per cadenza+ritmo. I numeri sono calibrati a sensazione, non clinici, ma generano dinamiche credibili: salite punitive, recupero in pianura, gestione del rifornimento.

- **Ghost del PB su localStorage**. Ogni secondo campiono `{t, progress}`; salvo l'array al miglior tempo. Alla partita successiva interpolo per disegnare la silhouette al tempo corrente. Mostra anche sulla minimappa.

- **Sistema track plug-and-play**. Il `manifest.json` è la singola fonte di verità. Lo script Python converte qualsiasi GPX in formato compatibile e calcola dislivello/distanza reali. La cartella `tracks/` è agnostica: il gioco non sa cosa sta dentro fino al fetch.

- **No dipendenze esterne**. Solo HTML+CSS+JS vanilla con moduli ES. Niente framework, niente bundler, niente build step. Modifichi un file, ricarichi, vedi. Per un progetto di questa dimensione è di gran lunga la scelta più sostenibile.

- **Audio procedurale**. WebAudio API genera passi/beep/fanfara a runtime. Niente file `.mp3` o `.wav` nel repo. Compromesso: suoni 8-bit puri, ma fedeli all'estetica.

---

## Roadmap suggerita

Prossime feature in ordine di valore:

1. **Avversari AI** — silhouette colorate che corrono con curve di velocità diverse (fondista costante, scattista che parte forte e cala, diesel che recupera nel finale).
2. **Effetti meteo dinamici durante la gara** — passaggio alba→giorno se la gara è abbastanza lunga, nebbia che si alza al passaggio in quota.
3. **Sistema di "obiettivi" per gara** — completala, finisci sotto un certo tempo, prendi tutti i ristori, mantieni HR sotto soglia → sblocca medaglie.
4. **Modalità campionato Abruzzo Trail Running Series** — punteggio cumulativo sulle 6 gare, classifica generale.
5. **Esporta record come "scheda gara"** — generazione PNG con tempo, profilo altimetrico, mappa, da condividere.
6. **Editor GPX visuale in-game** — drag & drop di un .gpx direttamente nella finestra del gioco.

---

## Crediti

Riedizione di **Tap Trail V1** (originale dell'autore, 2025) con riarchitettura completa per V2.

GPX gara: *L'Alba dei Marsi 21K*, gara di trail running della Marsica (Abruzzo), parte dell'Abruzzo Trail Running Series.

Stile grafico ispirato a *The Secret of Monkey Island 2* (LucasArts, 1991) e ai SCUMM-game dell'epoca VGA 256 colori.

---

## Classifica online (opzionale)

Il gioco supporta una classifica online via **Google Apps Script + Google Sheet**
(stesso pattern usato in *Pepper Drop – Bocca di Fuoco*). Setup in 5 minuti, gratis,
nessun server da pagare. Per attivarla:

```bash
docs/LEADERBOARD_SETUP.md
```

Senza configurazione, il gioco è 100% offline (record salvati in `localStorage`,
nessuna chiamata di rete). I bottoni "INVIA ONLINE" mostrano *BACKEND NON CONFIGURATO*
finché non si imposta `LEADERBOARD_URL` in `src/config.js`.

Una volta attivato:
- A fine **Campionato** il bottone *INVIA ONLINE* spedisce score+tempo cumulato.
- A fine **gara singola** un bottone simile spedisce il PB di quella distanza.
- In modalità **Campionato**, ogni gara fatta viene spedita anche in automatico
  (silenziosa, board = trackId).
- Tab *ONLINE* nella schermata Classifiche mostra la top-10 del Campionato.
- Se la rete cade, le entries vengono accodate in `localStorage` e ritentate
  al prossimo submit/fetch riuscito (max 50 in coda).

---

## Credits — Asset grafici

Il gioco utilizza i seguenti asset di artisti pixel-art:

### Sfondi montani (`assets/backgrounds/m1/`)
**Free Mountain Backgrounds Pixel Art** by CraftPix.net
https://craftpix.net/freebies/free-mountain-backgrounds-pixel-art/
Licenza CraftPix Freebies (uso commerciale ammesso, no attribuzione richiesta ma apprezzata)

### Sprite del runner (`assets/sprites/hiker_*.png`)
**Pixelart Adventurer/Hiker** by Chroma Dave
https://chroma-dave.itch.io/pixelart-hiker
"You can use this in any project you would like! Credits are not necessary but are welcomed!"
