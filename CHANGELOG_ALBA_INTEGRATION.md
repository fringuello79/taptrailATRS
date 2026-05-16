# Tap Trail V2 — Alba dei Marsi Integration (versione finale pulita)

Data: 16 Maggio 2026

## Asset finali installati

```
assets/
├── backgrounds/
│   └── alba_dei_marsi/
│       └── sky.png                    576×324 RGB (DALL-E, alba pixel-art)
└── sprites/
    ├── landmarks/
    │   ├── alba_chiesa.png            50×48 RGBA (pixel-art handdrawn)
    │   ├── alba_castello.png          80×56 RGBA (pixel-art handdrawn)
    │   └── alba_anfiteatro.png        84×32 RGBA (pixel-art handdrawn)
    └── finish/
        └── bdb_alba.png               49×40 RGBA ("Matteo" col boccale BdB)
```

Asset rimossi (vecchio set DALL-E painterly che non era coerente con lo stile pixel-art):
- assets/backgrounds/alba_dei_marsi/mountains.png
- assets/backgrounds/alba_dei_marsi/foreground.png
- assets/sprites/landmarks/hill_ruins_alba.png
- assets/sprites/landmarks/amphitheater_alba.png  (PNG painterly)
- assets/sprites/refresh/ristoro_generic.png

## Render strategy

| Layer            | Sorgente         | Tile     | Parallax | Note                          |
|------------------|------------------|----------|----------|-------------------------------|
| Cielo            | sky.png (Alba)   | NO       | 0.00     | Sostituisce layer 1+2 di m1   |
| Montagna distante| m1/3.png         | sì       | 0.12     | Invariato                     |
| Colline blu mid  | m1/4.png         | sì       | 0.30     | Su cui poggiano i landmark    |
| Landmark Alba    | 3 sprite PNG     | NO       | 0.30     | Mid-slope sul layer 4         |
| Foreground verde | m1/5.png         | sì       | 0.55     | Copre la base dei landmark    |

I landmark sono **renderizzati TRA il layer 4 e il layer 5 di m1**, posizionati al ~40% del versante (mid-slope) della collina blu di sfondo. L'erba verde del primo piano (layer 5) copre naturalmente la base.

## Km dei landmark

| Distanza             | Castello | Chiesa | Anfiteatro |
|----------------------|---------:|-------:|-----------:|
| Alba dei Marsi 12K   |       7  |     8  |          9 |
| Alba dei Marsi 21K   |      12  |    14  |         15 |

## File modificati

### `src/scenes/WorldRenderer.js`
- `_EVENT_ASSET_CONFIG` semplificato: solo sky + 3 landmark + bdbFinish per Alba
- `_ALBA_LANDMARK_KM` config esterna con km per ogni distanza Alba
- `getEventIdForTrack(trackId)` esportato (mapping trackId → eventId)
- `_eventHasSkyOverride()` helper
- `_computeLayer4Profile()` legge una sola volta i pixel del layer 4 m1 per ricavare `topY[x]` e `botY[x]` (profilo silhouette colline blu)
- `drawSky` usa il sky custom per Alba (no-tile)
- `drawParallaxLayers` torna alla versione m1 standard ma chiama `drawAlbaLandmarksOnSlope` tra layer 4 e layer 5
- `drawAlbaLandmarksOnSlope` nuova: per i 3 landmark Alba, calcola posizione X dai km, posizione Y al mid-slope del layer 4, renderizza a scala nativa
- `getEventBdBFinishSprite` rimane per Matteo

Rimosse: `_drawEventParallaxLayers`, `drawDistantLandmarks`, `getEventRistoroSprite`, `_eventHasBackgroundSet`.

### `src/scenes/RaceScene.js`
- Import: `getEventIdForTrack` (già aggiunto in versione precedente)
- Rimossa la chiamata `drawDistantLandmarks` (i landmark sono ora dentro `drawParallaxLayers`)
- `drawCastle` geometrico al km 11: skip per alba (sostituito da `alba_castello.png` al km 12)
- `drawAmphitheater` geometrico al km 16: skip per alba (sostituito da `alba_anfiteatro.png` al km 15)
- Ristori: tornati al rendering geometrico originale (palo + bandiera Croce Rossa + tavolo) per tutti gli eventi
- Matteo (BdB) sprite renderizzato a progress 0.998 (dopo il finish arch). Sprite ora 49×40 invece di 62×50 (scala coerente con runner 26×40)

## Test

Apri `index.html` via local server:

```
cd taptrail_v2 && python3 -m http.server 8000
```

Apri `http://localhost:8000`, seleziona L'Alba dei Marsi 12K o 21K, avvia gara. Atteso:
- Cielo rosa-arancio alba (no parallax orizzontale)
- Montagne m1 invariate (parallax lento)
- Colline blu m1 invariate (parallax medio)
- Ai km specifici (vedi tabella) chiesa, castello, anfiteatro pixel-art poggiati sul fianco delle colline blu
- L'erba verde del primo piano (m1 layer 5) li copre alla base
- Quando taglio il traguardo (progress 0.998), trovo Matteo col boccale di birra qualche metro dopo l'arco arrivo

## Altri eventi

Voltigno, Mammut, Xterra, Gran Sasso, Maglio: invariati, continuano col set CraftPix m1 + funzioni geometriche `drawCastle`/`drawAmphitheater`/sprite ristoro a codice. Le funzioni geometriche sono ancora esportate ma non chiamate per Alba.
