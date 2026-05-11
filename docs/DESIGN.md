# DESIGN — Tap Trail V2

Note di design e ragionamenti dietro le scelte. Pensato per ricordarti tra qualche mese (o mesi) perché questo gioco è fatto così, e per orientarti se vorrai estenderlo.

---

## Filosofia di gioco

Tre principi che hanno guidato ogni scelta:

**1. Il GPX è il vero protagonista.** Non è scenografia: è la fisica del gioco. Se la salita è nei dati, devi sentirla nelle gambe (= nella stamina) e vederla negli occhi (= nel sentiero che si alza). Tutto il resto — sprite, parallasse, meteo — è cornice.

**2. Premiare la corsa "vera", non lo spam.** Un runner reale corre regolare in una certa cadenza, gestisce idratazione e ritmo cardiaco, e sa quando rallentare. Il gameplay deve premiare la stessa intelligenza, non il tap-fest. Da qui: flow state, ristori che richiedono di rallentare, crampi.

**3. Pixel art genuina, non finta.** Niente JPG riciclati o sprite "stilizzati a tema". Lo sprite del runner è disegnato pixel per pixel su canvas a runtime. La risoluzione interna è 480×270 e basta. Se sembra retro è perché *è* retro, non perché ha un filtro.

---

## Calibrazione del modello fisiologico

I numeri in `Stamina.js` sono "fenomenologici" (a sensazione), non clinici. Ecco la logica:

### HR target

```
intensity = clamp(cadenceSpm/200, 0, 1) + slope*4 (se positivo) - 30% se discesa
targetHR = 70 + intensity * (maxHr - 70)
```

A 165 spm su pianura → intensity ≈ 0.825 → target ≈ 173 bpm. Un runner medio in soglia.
A 165 spm su salita 10% → intensity ≈ 1.225 (clampata) → target = max HR.

La costante di tempo τ=4s in salita e τ=8s in recupero riproduce la realtà: il cuore sale veloce, scende lento.

### Stamina drain

```
drain = (4 + hrFactor*12) * slopePenalty * hydrationPenalty
hrFactor = max(0, (HR-110)/80)
```

In zona aerobica (HR<140) drain ≈ 4-8/s → 100s di autonomia. Realistico per uno sprint.
In soglia (HR=165) drain ≈ 12/s → 8s di autonomia. Devi alternare.
In salita 10% in soglia: drain ≈ 12 × 1.6 = 19/s → 5s. Brutale, com'è giusto.

### Flow state

`flow = cadenceScore * rhythmStability`. Coefficient of variation tra intervalli di tap → 1 se costante, 0 se caotico. Cadenza ideale 165 spm con tolleranza graduale (perdita lineare, non a soglie).

A flow > 0.5 la stamina recupera attivamente: bonus che incoraggia il "respiro" del passo regolare anche sotto sforzo.

### Crampi

Doppio trigger: stamina = 0 (esaurimento) o idratazione < 5 + tap (disidratazione). Penalità: 2.5s di blocco totale + 1.5s di "recupero forzato". Pesante, ma è quello che succede davvero.

---

## Resa visiva

### Il sentiero altimetrico

Cuore visivo del gioco. Per ogni colonna pixel x dello schermo (480 colonne):

1. Converto x in coordinata-mondo: `worldX = viewLeft + x` (dove `viewLeft = progress*totalWorldPx - runnerScreenX`).
2. Da worldX ricavo il progress GPX: `p = worldX / totalWorldPx`.
3. Da p ricavo l'altitudine reale: `alt = track.altitudeAt(p)`.
4. Normalizzo `(alt - minAlt) / range` e mappo in `groundY ± altYAmplitude` (38 px).

Risultato: il sentiero è il profilo altimetrico ruotato 90° e scrollato. Vedi la salita *arrivare*, non solo subirla. È una feature emersa quasi gratis dalla struttura ma è la più potente del nuovo motore.

`altYAmplitude = 38px` è un compromesso. Più alto = più drammatico ma il personaggio "salta" troppo vs il bordo schermo. Più basso = più leggibile ma piatto. Tunable.

### Parallasse

Tre layer, rapporti **0.15 / 0.4 / 0.7**. Il numero magico è la distanza percepita: tutto quello sotto 0.5 sembra "lontano". 0.15 dà la sensazione di catena montuosa che si muove appena. 0.7 dà il bosco vicino che scorre quasi a velocità del runner.

Le montagne sono polilinee deterministiche generate via hash della coordinata mondo (`seed = wx * 374761393 ^ baseSeed`). Così sono identiche ogni volta che torni allo stesso punto, ma non si ripetono. Trick standard dei roguelike.

### Sprite procedurale

Stile MI2 esplicito: testa al 31% dell'altezza (8/32 px), occhi 1px, bocca 2px orizzontale, palette di 6-8 colori per personaggio. La cosa più importante è il **contorno nero 1px**: senza, lo sprite si fonde con il fondo e perde leggibilità. Con, sembra "tagliato fuori dallo sfondo" come negli SCUMM game.

Le 6 fasi di animazione coprono un ciclo di corsa: contatto → midstance → toe-off → swing-up → swing-mid → swing-down. Frequenza 4-16 fps in funzione della velocità.

---

## Architettura software

### Scelte non ovvie

**No build step, no framework, ES modules vanilla.** Per progetti < 3000 righe questo è di gran lunga il setup più produttivo: niente `npm install`, niente cache di Vite, niente errori da `.tsx` mal configurato. Il tempo guadagnato in iterazione supera quello "perso" a non avere TypeScript.

**Risoluzione fissa scalata via CSS.** Il canvas è sempre 480×270 (pixel reali). Lo zoom lo fa il browser via `image-rendering: pixelated`. Non disegniamo mai a risoluzione "finale": tutto rimane crisp e i conti sono semplici (non ci sono `dpr` da gestire dentro al rendering del gioco — solo nel resize del canvas elemento).

**Track come oggetto immutabile.** `Track` viene costruito una volta, indicizzato (cum, minimap, range alt), poi è sola lettura. Le interrogazioni sono O(log N) tramite ricerca binaria su `cum[]`. 686 punti × ricerca binaria = ~10 confronti. Gratis a 60 fps.

**Ghost interpolato sul tempo.** Il PB è una serie di `{t, p}` campionata ogni 1s. Alla partita successiva, dato il tempo corrente, interpolo `p`. Vantaggio sul ghost "spaziale" (campionato ogni N metri): vedi davvero "stai battendo il tuo PB" / "stai perdendo". Svantaggio: se il GPX cambia, il ghost diventa inconsistente.

### State machine

```
MENU → TRACK_SELECT → CHARACTER → RACE → RESULTS → MENU
                                       ↘ MENU (Esc)
       LEADERBOARD → MENU
```

Volutamente lineare. Niente menu pause: se vuoi fermarti, Esc → torni a TRACK_SELECT. La gara è veloce (< 30 min), una pausa rovinerebbe il flusso.

---

## Estensibilità: come aggiungere cose

### Una nuova gara
Vedi README, sezione "Aggiungere una nuova gara da GPX". È la cosa più semplice — il sistema è progettato per questo.

### Una nuova palette ambientale
In `src/scenes/WorldRenderer.js`, aggiungi un blocco a `AmbientPalettes`. 8 colori: `farMountain`, `midMountain`, `bosco`, `treeDark`, `treeLight`, `trailDirt`, `trailLight`, `trailGrass`.

### Un nuovo preset meteo
In `src/systems/Weather.js`, aggiungi a `WeatherPresets`. Campi: `skyTop/Mid/Bot`, `sunColor` (o null), `sunY`, `fog` (0..1), `wind` (0..1), `temperatureC`, `rain` (0..1).

### Un avversario AI
Crei una classe `AiRunner` che mantiene il proprio `progress` con una curva di velocità target (es: `f(t) = baseSpeed * (1 - 0.0001*t)` per il diesel che cala). In `RaceScene.update` aggiorni anche lui. Lo disegni in `RaceScene.render` come il ghost ma più solido. Per generare la curva: registra un ghost vero, modificalo, oppure formula parametrica.

### Un tipo nuovo di evento (es: "passaggio in cresta")
Aggiungi un array `events` al track JSON: `[{progress: 0.45, type: "summit", text: "VETTA!"}]`. In `RaceScene.update` controlli se hai appena passato un evento e triggeri un toast / audio cue.

### Cambiare proporzioni dello sprite
`RunnerSprite.js`. Le costanti chiave sono `frameW=24`, `frameH=32`. Tutta la pixel art è coordinate intere relative a questi. Se cambi 24×32 a 32×40, devi ridisegnare i `phases` delle gambe (le posizioni esatte) ma le altre funzioni si adattano.

---

## Trade-off noti e debiti tecnici

Lista onesta di compromessi che ho fatto, in ordine di "primo da affrontare se vuoi tornarci":

1. **Calibrazione fisiologica generica.** I numeri valgono per un runner medio. Manca un "livello di forma" del giocatore (impostabile nel profilo) che modifichi `maxHr`, `targetHrZone`, drain rates. Aggiunta facile, ma cambia il bilanciamento di tutto: meglio farlo dopo che il gameplay base è solido.

2. **Niente click hover su menu.** La selezione click su menu funziona come "tap = conferma immediata". Per un'app desktop sarebbe meglio hover + click separati. Per mobile va benissimo così. Compromesso accettabile.

3. **Ghost solo "tuo".** Niente ghost di amici, niente leaderboard online. Tutto localStorage. Per un Phase 2 social, il sistema ghost è già nella forma giusta — sarebbe `POST /ghost/{trackId}` + `GET /ghost/{trackId}/top`.

4. **Audio procedurale è limitato.** I beep WebAudio sono abbastanza ma non emozionano. Una traccia chiptune di sottofondo (generata o caricata) farebbe la differenza enorme. Ho lasciato gli hooks in `Audio.js` per estenderlo.

5. **Niente accessibilità.** Niente keyboard-only navigation completa (alcuni menu sì, altri solo click). Niente screen-reader. Niente colori daltonici-friendly per le zone HR. Da affrontare prima di pubblicare seriamente.

6. **Mobile portrait non supportato.** Il gioco è 16:9, in portrait diventa minuscolo. Su tablet va bene. Per phone portrait servirebbe un layout alternativo o un overlay "ruota lo schermo".

7. **Track senza bivi/giri.** Il modello assume un GPX lineare (start → finish). Per gare con anelli o "trionfo finale al traguardo passando in mezzo al pubblico" la minimappa fa cose strane (linee sovrapposte). Nessuna gestione esplicita.

---

## Prossimi passi consigliati (ordine di priorità)

1. **Test sul campo con la gara vera.** Gioca la 21K. Cosa diverte? Cosa frustra? La salita finale del Velino è giusta come pendenza percepita?
2. **Bilancio fine del flow.** Probabilmente è troppo facile entrare/uscire dal flow. Un piccolo decay più aggressivo lo renderebbe più "guadagnato".
3. **Aggiungi 1-2 gare reali.** Il sistema è pronto ma finché c'è solo Alba dei Marsi non si vede quanto è estensibile. Ne basta un'altra per testare.
4. **Avversari AI.** Cambierebbero radicalmente la sensazione: dal "corsa contro me stesso" al "corsa". Qualche curva di velocità preset (5 archetipi) e il gioco raddoppia di profondità.
5. **Audio chiptune di base.** Anche solo una loop di 30 secondi che cambia tonalità in zona rossa farebbe magia.
6. **Sistema obiettivi/medaglie.** Per dare longevità ad ogni singola gara.

---

## Una nota personale

Tap Trail nasce da un'idea semplice: "e se un GPX vero diventasse il livello di un platform?". V1 ha dimostrato che la meccanica funziona. V2 cerca di renderla *bella* — perché un GPX di una gara a cui hai partecipato merita di sembrare un mondo, non un grafico.

Se ti diverte questa è già una vittoria. Se ti diverte abbastanza da volerla mostrare a un altro runner, è successo qualcosa di interessante.

Buone corse.
