// src/scenes/RaceScene.js
// La scena principale: il giocatore corre lungo il GPX premendo tap.
// Mette insieme: WorldRenderer, RunnerSprite, Stamina, Weather, HUD, Minimap, Altimetry.

import { WorldRenderer, AmbientPalettes, drawCastle, drawAmphitheater, drawFinishArch, drawStartArch, getEventIdForTrack } from './WorldRenderer.js';
import { RunnerSprite, drawCrampFace } from '../entities/RunnerSprite.js';
import { Stamina } from '../systems/Stamina.js';   // congelato, mantenuto come stub per scoring/compat
import { StaminaT } from '../systems/StaminaT.js';
import { RunPhysics, formatPace, msToMinPerKm, timeScaleForRace } from '../systems/RunPhysics.js';
import { Weather, WeatherPresets } from '../systems/Weather.js';
import { HUD } from '../ui/HUD.js';
import { Minimap, Altimetry } from '../ui/Minimap.js';
import { drawText, drawTextShadow, drawTextCentered } from '../ui/PixelFont.js';
import { drawLogo } from '../ui/Branding.js';
import { GameState } from '../core/Game.js';
import { loadChampionship } from '../systems/Championship.js';

// Distribuzione ristori in base alla distanza della gara:
//   - gare ≤ 30 km → 1 ristoro a metà (50%)
//   - gare > 30 km → 2 ristori (33% e 66%)
function refreshmentsFor(km) {
  if (km <= 30) return [0.50];
  return [0.33, 0.66];
}

export class RaceScene {
  constructor(game, track, character, meta = {}) {
    this.game = game;
    this.track = track;
    this.character = character; // {gender, shirtColor, name}
    // Metadati ATRS (passati dal nuovo flusso)
    this.eventId = meta.eventId || null;
    this.eventName = meta.eventName || null;
    this.eventLogo = meta.eventLogo || null;
    this.scoreBonus = typeof meta.scoreBonus === 'number' ? meta.scoreBonus : 0;
    this.placeholder = !!meta.placeholder;
    this.trackName = meta.trackName || null;
    this.trackLabel = meta.trackLabel || null;
    this.mode = meta.mode || 'single';

    this.world = new WorldRenderer(game.virtualW, game.virtualH);
    this.runner = new RunnerSprite(character.gender, character.shirtColor);

    // FASE 2: Stamina congelata. La istanzio comunque ma forzo i suoi valori a
    // "neutro" così tutto il codice retro-compatibile (HUD, scoring) legge dati
    // sensati senza causare malus al giocatore. In futuro, per riattivare la
    // stamina basta togliere queste sovrascritture.
    this.stamina = new Stamina();
    this.stamina.stamina = 100;
    this.stamina.hydration = 100;
    this.stamina.hr = 130;       // valore "in zona" così il scoring non penalizza
    this.stamina.flow = 0;
    this.stamina.cramp = false;
    // override metodi neutri (non riassegno, sovrascrivo a istanza per evitare side effects)
    this.stamina.update = () => {};
    this.stamina.speedMultiplier = () => 1;
    this.stamina.hrZone = () => 'in';

    // FISICA T&F (cuore del gioco)
    this.physics = new RunPhysics();
    // Scala temporale: comprime la distanza reale del GPX nel target arcade ~30s
    this._timeScale = timeScaleForRace(this.track.distanceKm);

    // Stamina nuova generazione (consumo lento sempre, accelera con sprint/salita,
    // recupera rallentando, ristori ricaricano).
    this.staminaT = new StaminaT();
    // Carry-over stamina nel campionato: la prossima gara parte da dove era rimasta
    // (più un piccolo recupero, gestito da computeCarryStamina in Championship.js)
    if (this.mode === 'championship') {
      const cs = loadChampionship();
      if (typeof cs.carryStamina === 'number' && cs.started) {
        this.staminaT.stamina = cs.carryStamina;
        this.startStamina = cs.carryStamina;
      } else {
        this.startStamina = 100;
      }
    } else {
      this.startStamina = 100;
    }

    // Lista ristori per questa gara (dinamica in base alla distanza)
    this._refreshments = refreshmentsFor(this.track.distanceKm);

    // Coordinate del pulsante bicchiere (in coord canvas virtuali)
    // Posto in alto al centro, fuori dalla pace bar (sx) e minimap (dx)
    this._waterButtonRect = { x: 300, y: 8, w: 32, h: 32 };
    this._waterButtonPress = false;

    // Registro la zona tap dedicata al pulsante: tap in quest'area NON conta
    // come tap di corsa ma triggera zoneActions.water
    game.input.setTapZones([
      { name: 'water', ...this._waterButtonRect },
    ]);
    this.weather = new Weather(track.weather || 'clear_dawn');
    this.hud = new HUD(game.virtualW, game.virtualH);
    this.minimap = new Minimap(game.virtualW, game.virtualH);
    this.altimetry = new Altimetry(game.virtualW, game.virtualH);

    this.palette = AmbientPalettes[track.palette] || AmbientPalettes.dawn_mountains;

    // stato di gara
    this.progress = 0;
    this.timer = 0;
    this.tapCount = 0;
    this.finished = false;
    this.finishedAt = null;
    this.countdown = 3.5; // secondi, "PRONTI...VIA!"
    this.started = false;

    // tracking per Scoring (modalità singola e campionato)
    this.timeInThreshold = 0;  // secondi cumulativi in HR 140-165
    this.hadCramp = false;
    // tasto "SO STRACCHE!" - solo in modalità campionato
    this.skipped = false;
    this.confirmSkip = false;
    this._confirmSkipTimer = 0;

    // ghost del PB (solo se abilitato nel profilo) - solo in modalità single
    if (this.mode === 'single') {
      const pb = game.storage.getPB(track.id);
      this.pb = pb;
      this.ghostEnabled = !!game.profile.ghostEnabled;
      this.ghostSamples = this.ghostEnabled ? (game.storage.loadGhost(track.id) || null) : null;
    } else {
      this.pb = null;
      this.ghostEnabled = false;
      this.ghostSamples = null;
    }
    this.ghostProgress = null;

    // sample buffer per registrare il proprio ghost
    this.mySamples = [];
    this.lastSampleAt = 0;

    // ristori: visitati
    this.visitedRefreshments = new Set();
    this.atRefreshment = false;
    this.refreshmentToast = 0;

    // notifiche ambientali sui km
    this.lastKmAnnouncement = -1;
    this.kmToast = '';
    this.kmToastTimer = 0;

    // input pause / esci
    this._handleEsc = (e) => {
      if (e.code === 'Escape') this._exitToHub();
    };
    window.addEventListener('keydown', this._handleEsc);

    // sound: passi alternati ai tap
    this.lastFootstepAt = 0;
  }

  _exitToHub() {
    if (this.mode === 'championship') {
      this.game.changeState(GameState.CHAMPIONSHIP_HUB);
    } else {
      this.game.changeState(GameState.TRACK_SELECT);
    }
  }

  enter() {
    this.game.input.resetCadence();
  }

  exit() {
    window.removeEventListener('keydown', this._handleEsc);
    // Pulisco le zone tap speciali per non interferire con altre scene
    this.game.input.setTapZones([]);
    // Spengo la musica se la scena è interrotta (es. ESC, navigazione esterna).
    // È idempotente quindi è sicuro chiamarla anche se non era partita.
    this.game.audio.stopBackgroundMusic();
  }

  update(dt) {
    // Countdown
    if (!this.started) {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.started = true;
        this.game.audio.gunshot();
        // Avvio musica motivazionale di sottofondo
        this.game.audio.startBackgroundMusic();
      }
      return;
    }
    if (this.finished) {
      this.finishedAt += dt;
      if (this.finishedAt > 2.0 && !this._resultsTriggered) {
        this._resultsTriggered = true;
        this._goToResults();
      }
      return;
    }

    this.timer += dt;
    this.weather.update(dt);

    // input: "tapping" = ho tappato di recente (entro 1.2s), per il modello fisio.
    const input = this.game.input;
    const cadenceSpm = input.getCadenceSpm();
    const rhythm = input.getRhythmStability();
    const tapping = (performance.now() - input.lastTapTime) < 1200 || input.tapHeld;

    // Tap sul pulsante bicchiere mobile (intercettato come zona speciale da Input)
    if (input.zoneActions && input.zoneActions.water) {
      this._waterButtonPress = true;
    }

    // === RISTORI ===
    // Una finestra ±2.5% del progress attorno a ogni ristoro permette il prelievo.
    // Trigger: tasto R (PC) o pulsante "bicchiere d'acqua" mobile.
    // Effetto: +35 stamina, flash visivo, suono.
    this.atRefreshment = false;
    this.approachingRefreshment = null;
    for (const rp of this._refreshments) {
      if (this.visitedRefreshments.has(rp)) continue;
      const dist = rp - this.progress;
      // finestra di approccio: da 1.5% prima a 2.5% dopo
      if (dist > -0.025 && dist < 0.025) {
        this.atRefreshment = true;
        // Prelievo manuale: tasto R o pulsante bicchiere
        if (input.refreshmentPress || this._waterButtonPress) {
          this.visitedRefreshments.add(rp);
          this.refreshmentToast = 2.5;
          this.game.audio.beep(1200, 0.12);
          this.game.audio.beep(1600, 0.12);
          this.staminaT.takeRefreshment();
        }
        if (this.approachingRefreshment === null) {
          this.approachingRefreshment = { rp, dist };
        }
      }
    }
    // reset edge del pulsante bicchiere (consumato in questo frame)
    this._waterButtonPress = false;

    // pendenza locale per il modello (window stretto = simulazione realistica)
    const slope = this.track.slopeAt(this.progress, 50);

    // pendenza MEDIA del tratto per inclinazione visiva del runner (window 200m)
    // con damping temporale → l'omino si inclina in modo dolce, non scatta a ogni asperità
    const slopeForVisual = this.track.slopeAt(this.progress, 200);
    const targetAngle = Math.max(-0.28, Math.min(0.28, -slopeForVisual * 2.8));
    if (this._smoothedSlopeAngle === undefined) this._smoothedSlopeAngle = 0;
    const tau = 0.7;  // tempo di risposta in secondi
    this._smoothedSlopeAngle += (targetAngle - this._smoothedSlopeAngle) * Math.min(1, dt / tau);

    // aggiorna fisiologia
    this.stamina.update(dt, {
      tapping,
      slope,
      cadenceSpm,
      tapHzInstant: this._smoothHz || 0,
      rhythmStability: rhythm,
      temperatureC: this.weather.temperatureC,
      atRefreshment: this.atRefreshment,
      crampReleasePress: input.crampReleasePressed,
    });

    // tracking per Scoring (per moltiplicatore stile)
    if (this.stamina.hr >= 140 && this.stamina.hr <= 165) {
      this.timeInThreshold += dt;
    }
    if (this.stamina.cramp) {
      this.hadCramp = true;
    }

    // === FISICA T&F: velocità da tap rate + pendenza + consistenza ===
    // Sostituisce il vecchio modello con boost-per-tap + curva esponente.
    // Il RunPhysics calcola speedMs (1.67..6.67 m/s = pace 10:00..2:30 min/km)
    // che è la velocità "logica" del runner.
    // Poi moltiplico per _timeScale per compress il GPX a durata arcade ~30s.

    if (input.tapPressed) {
      this.tapCount++;
    }

    // tap rate decade se non si tappa per oltre 0.6s (così il pace torna lento)
    const tapHzInput = input.getTapRateHz();
    const sinceLastTap = (performance.now() - input.lastTapTime) / 1000;
    let effectiveTapHz = tapHzInput;
    if (sinceLastTap > 0.6) {
      // decay esponenziale dell'effettiva quando non si tappa
      effectiveTapHz *= Math.exp(-(sinceLastTap - 0.6) * 1.5);
    }
    if (sinceLastTap > 1.5) effectiveTapHz = 0;

    this.physics.update(dt, {
      tapHz: effectiveTapHz,
      slope: slope,
      stability: rhythm,
    });

    // Aggiorna stamina T&F (consumo lento sempre, accelera con sprint/salita)
    this.staminaT.update(dt, {
      tapHz: effectiveTapHz,
      speedNorm: this.physics.speedNormalized,
      slope: slope,
    });

    // Velocità logica in m/s, mostrata all'utente come pace min/km.
    // Penalità esaurimento: se stamina a zero, la velocità viene dimezzata.
    const speedMs = this.physics.speedMs * this.staminaT.speedMultiplier();

    // Speed factor per animazione sprite (normalizzato 0..1)
    const speedFactor = this.physics.speedNormalized;

    // Avanzamento GPX: usa la time scale per compress nel target arcade
    const distAdvanceM = speedMs * this._timeScale * dt;
    const newProgress = Math.min(1, this.progress + distAdvanceM / this.track.distanceM);
    this.progress = newProgress;

    // Stato sprite in base alla pendenza locale.
    if (!this.finished && !this.skipped) {
      const targetState = (slope > 0.05) ? RunnerSprite.STATE.RUN_SLOW
                                          : RunnerSprite.STATE.RUN_FAST;
      this.runner.setState(targetState);
    }

    // Sprite animation
    this.runner.update(dt, speedFactor);

    // SFX passi al "click" del frame piede a terra (frame 0 e 3)
    const newFootstep = (this.runner.frame === 0 || this.runner.frame === 3);
    if (newFootstep && performance.now() - this.lastFootstepAt > 120) {
      this.game.audio.step(0.5 + speedFactor * 0.5);
      this.lastFootstepAt = performance.now();
    }

    // sample del ghost ogni 1s
    if (this.timer - this.lastSampleAt >= 1) {
      this.lastSampleAt = this.timer;
      this.mySamples.push({ t: this.timer, p: this.progress });
    }

    // calcolo ghost progress dal PB
    if (this.ghostSamples && this.ghostSamples.length > 1) {
      // trovo il ghost al tempo this.timer
      const samples = this.ghostSamples;
      let lo = 0, hi = samples.length - 1;
      if (this.timer >= samples[hi].t) {
        this.ghostProgress = samples[hi].p;
      } else {
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (samples[mid].t <= this.timer) lo = mid;
          else hi = mid;
        }
        const span = samples[hi].t - samples[lo].t;
        const ratio = span > 0 ? (this.timer - samples[lo].t) / span : 0;
        this.ghostProgress = samples[lo].p + (samples[hi].p - samples[lo].p) * ratio;
      }
    }

    // toast km annuncio
    const kmDone = Math.floor(this.progress * this.track.distanceKm);
    if (kmDone > this.lastKmAnnouncement && kmDone < Math.floor(this.track.distanceKm)) {
      this.lastKmAnnouncement = kmDone;
      this.kmToast = `${kmDone} KM`;
      this.kmToastTimer = 1.8;
      this.game.audio.beep(800, 0.06);
    }
    if (this.kmToastTimer > 0) this.kmToastTimer -= dt;
    if (this.refreshmentToast > 0) this.refreshmentToast -= dt;

    // Tasto "SO STRACCHE! NIN CE LA FACC!" - solo in modalità campionato, durante la gara
    if (this.mode === 'championship' && this.started && !this.finished && !this.skipped) {
      const W = this.game.virtualW;
      // pulsante in alto a destra: x da W-86 a W-4, y da 4 a 18 (14 px alto)
      for (const c of this.game.input.menuClicks) {
        if (c.x > W - 86 && c.x < W - 4 && c.y > 4 && c.y < 22) {
          if (this.confirmSkip) {
            // confermato → molla
            this.skipped = true;
            this.finished = true;
            this.finishedAt = 0;
            this.runner.setState(RunnerSprite.STATE.DNF);
            this.game.audio.stopBackgroundMusic();
            this.game.audio.beep(180, 0.25);
          } else {
            this.confirmSkip = true;
            this._confirmSkipTimer = 3.0;  // 3 secondi per confermare
          }
        }
      }
      if (this.confirmSkip) {
        this._confirmSkipTimer -= dt;
        if (this._confirmSkipTimer <= 0) this.confirmSkip = false;
      }
    }

    // fine gara
    if (this.progress >= 1 && !this.finished) {
      this.finished = true;
      this.finishedAt = 0;
      this.runner.setState(RunnerSprite.STATE.FINISH);
      // Spengo la musica e suono fanfara + jingle conclusivo
      this.game.audio.stopBackgroundMusic();
      this.game.audio.finishFanfare();
      // Il jingle parte dopo che la fanfara è stata consumata (~0.7s)
      setTimeout(() => this.game.audio.finishJingle(), 700);
    }
  }

  render(ctx) {
    const W = this.game.virtualW;
    const H = this.game.virtualH;

    // 1. cielo
    this.world.drawSky(ctx, this.weather, this.track.id);

    // 2. parallasse: dipende dalla viewLeft del runner.
    // I landmark dell'Alba dei Marsi (chiesa, castello, anfiteatro) sono renderizzati
    // automaticamente dentro drawParallaxLayers tra il layer 4 e il layer 5 di m1.
    const totalWorldPx = this.track.distanceKm * this.world.worldPxPerKm;
    const runnerScreenX = W * 0.32;
    const viewLeft = this.progress * totalWorldPx - runnerScreenX;
    this.world.drawParallaxLayers(ctx, viewLeft, this.weather, this.palette, this.track.id);

    // 2b. CASTELLO al km 11 - SOLO se l'evento NON è alba (fallback geometrico per altre gare).
    // Quando l'evento è alba, i 3 landmark pixel-art sono già stati renderizzati dentro
    // drawParallaxLayers ai km specifici del percorso.
    const _eventIdForRender = getEventIdForTrack(this.track.id);
    const _hasAlbaLandmarks = _eventIdForRender === 'alba-dei-marsi';
    if (this.track.id === 'alba-dei-marsi-21k' && !_hasAlbaLandmarks) {
      const castleProgress = 11 / 21;
      const cwx = castleProgress * totalWorldPx;
      const csx = cwx - viewLeft;
      if (csx > -100 && csx < W + 100) {
        const cyT = this.world.trailYAt(this.track, castleProgress);
        drawCastle(ctx, Math.floor(csx), Math.floor(cyT) + 6);
      }
    }

    // 3. sentiero in primo piano + restituisce posizione runner
    const trail = this.world.drawTrail(ctx, this.track, this.progress, this.palette);

    // 4. ristori (cartello/banchetto): cerco quelli visibili
    for (const rp of this._refreshments) {
      if (this.visitedRefreshments.has(rp)) continue;
      const wx = rp * totalWorldPx;
      const sx = wx - viewLeft;
      if (sx > -30 && sx < W + 30) {
        const yT = this.world.trailYAt(this.track, rp);
        const dist = rp - this.progress;
        const isNear = Math.abs(dist) < 0.025;
        const flicker = Math.floor(this.timer * 6) % 2 === 0;

        // Bagliore se vicino
        if (isNear) {
          ctx.fillStyle = flicker ? 'rgba(255,255,128,0.4)' : 'rgba(255,255,128,0.2)';
          for (let r = 16; r > 0; r -= 4) {
            for (let dy = -r; dy <= r; dy++) {
              const dx = Math.floor(Math.sqrt(r * r - dy * dy));
              ctx.fillRect(Math.floor(sx - dx), Math.floor(yT - 10 + dy), dx * 2, 1);
            }
          }
        }

        // Rendering inline del ristoro: palo + bandiera Croce Rossa + tavolo con
        // arrosticini (Voltigno) o bottiglie d'acqua (altrove). Stesso stile per tutti gli eventi.
        // palo bandiera (più grosso)
        ctx.fillStyle = '#000';
        ctx.fillRect(sx - 1, yT - 28, 2, 28);
        ctx.fillStyle = '#A0A0A0';
        ctx.fillRect(sx, yT - 28, 1, 28);

        // bandiera grande rossa con croce bianca (visibilissima)
        const wave = Math.sin(this.timer * 3) * 1;
        const flagY = yT - 28 + Math.floor(wave);
        ctx.fillStyle = '#000';
        ctx.fillRect(sx + 1, flagY, 16, 11);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(sx + 2, flagY + 1, 14, 9);
        ctx.fillStyle = '#FF3030';
        // croce rossa stile Croce Rossa
        ctx.fillRect(sx + 7, flagY + 2, 4, 7);
        ctx.fillRect(sx + 4, flagY + 4, 10, 3);

        // banchetto: tavolo blu con bottiglie / arrosticini (Voltigno)
        ctx.fillStyle = '#000';
        ctx.fillRect(sx - 9, yT - 8, 22, 8);
        ctx.fillStyle = '#3060A0';
        ctx.fillRect(sx - 8, yT - 7, 20, 6);
        ctx.fillStyle = '#5080C0';
        ctx.fillRect(sx - 8, yT - 7, 20, 1);
        // gambe del tavolo
        ctx.fillStyle = '#000';
        ctx.fillRect(sx - 8, yT, 1, 4);
        ctx.fillRect(sx + 11, yT, 1, 4);

        // Cibo sul tavolo: arrosticini per le gare di Voltigno, bottiglie d'acqua altrove
        if (this.eventId === 'voltigno') {
          this._drawArrosticini(ctx, sx, yT);
        } else {
          this._drawWaterBottles(ctx, sx, yT);
        }
      }
    }

    // 4b. ARCHI di PARTENZA e ARRIVO (per tutte le gare)
    // Arco di partenza all'inizio (progress = 0.005)
    const startProgress = 0.005;
    const swx = startProgress * totalWorldPx;
    const ssx = swx - viewLeft;
    if (ssx > -60 && ssx < W + 60) {
      const syT = this.world.trailYAt(this.track, startProgress);
      drawStartArch(ctx, Math.floor(ssx), Math.floor(syT), this.timer);
    }
    // Arco di arrivo (progress = 0.99) — mostrato per tutte le gare
    const finishProgress = 0.995;
    const fwx = finishProgress * totalWorldPx;
    const fsx = fwx - viewLeft;
    if (fsx > -60 && fsx < W + 60) {
      const fyT = this.world.trailYAt(this.track, finishProgress);
      drawFinishArch(ctx, Math.floor(fsx), Math.floor(fyT), this.timer);
    }

    // 4b-bis. OMINO BdB ("Matteo") parecchio DOPO l'arco arrivo (solo Alba dei Marsi).
    // Uso un offset FISSO in pixel a destra del finish arch invece di progress,
    // così la distanza è leggibile a schermo indipendentemente dalla lunghezza della gara.
    const bdbSprite = this.world.getEventBdBFinishSprite(this.track.id);
    if (bdbSprite) {
      // finishProgress = 0.995 (già definito sopra), fsx = posizione X arco arrivo a schermo
      const BDB_OFFSET_PX_FROM_ARCH = 70; // px a destra dell'arco arrivo
      const bdbSx = fsx + BDB_OFFSET_PX_FROM_ARCH;
      if (bdbSx > -50 && bdbSx < W + bdbSprite.width + 50) {
        // Trail Y al "punto" dove sta Matteo: leggo il trail a un progress un po' avanti
        // dell'arco arrivo. Conversione offset px -> progress per leggere la quota terreno.
        const bdbProgress = Math.min(0.9999, finishProgress + BDB_OFFSET_PX_FROM_ARCH / totalWorldPx);
        const bdbYT = this.world.trailYAt(this.track, bdbProgress);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(bdbSprite,
          Math.floor(bdbSx),
          Math.floor(bdbYT - bdbSprite.height + 5));
      }
    }

    // 4c. LANDMARK speciali del percorso L'Alba dei Marsi (anfiteatro geometrico).
    // Skip se l'evento è alba — l'anfiteatro pixel-art è già renderizzato in drawAlbaLandmarksOnSlope.
    if (this.track.id === 'alba-dei-marsi-21k' && !_hasAlbaLandmarks) {
      const amphProgress = 16 / 21;
      const awx = amphProgress * totalWorldPx;
      const asx = awx - viewLeft;
      if (asx > -60 && asx < W + 60) {
        const ayT = this.world.trailYAt(this.track, amphProgress);
        drawAmphitheater(ctx, Math.floor(asx), Math.floor(ayT));
      }
    }

    // 5. ghost del PB davanti (silhouette) — visibile fino a progress 1 (traguardo incluso)
    if (this.ghostProgress !== null && this.ghostProgress > 0) {
      const wx = this.ghostProgress * totalWorldPx;
      const sx = wx - viewLeft;
      if (sx > -30 && sx < W + 30) {
        // Ghost: stesse dimensioni dello sprite reale (frameW/H dinamici)
        const ghostScale = 1;
        const ghostH = this.runner.frameH * ghostScale;
        const ghostW = this.runner.frameW * ghostScale;
        const gy = this.world.trailYAt(this.track, this.ghostProgress) - ghostH;
        ctx.globalAlpha = 0.4;
        this.runner.draw(ctx, Math.floor(sx) - ghostW / 2, Math.floor(gy),
                         ghostScale, { shadow: false });
        ctx.globalAlpha = 1;
      }
    }

    // 6. il runner — usa angolo già smussato in update() per non scattare
    if (this._smoothedSlopeAngle === undefined) this._smoothedSlopeAngle = 0;
    const slopeAngle = this._smoothedSlopeAngle;
    const bobAmount = this.runner.frame % 3 === 0 ? -1 : 0;
    // Lo sprite T&F-style ha dimensioni dinamiche (variano con lo state).
    // Scale 2x: ad esempio run_fast = 18×35 → 36×70 sul canvas.
    const SPRITE_SCALE = 1;   // sprite AI-generati già a 60px alti, niente upscale
    const SPRITE_DISP_W = this.runner.frameW * SPRITE_SCALE;
    const SPRITE_DISP_H = this.runner.frameH * SPRITE_SCALE;
    const runnerY = trail.runnerY - SPRITE_DISP_H + bobAmount;
    const rx = Math.floor(trail.runnerScreenX);
    const ry = Math.floor(runnerY);

    if (this.stamina.cramp) {
      const wiggle = Math.sin(this.timer * 18) * 1.2;
      ctx.save();
      ctx.translate(rx + wiggle, ry + SPRITE_DISP_H);  // pivot: piedi
      this.runner.frame = 0;
      this.runner.draw(ctx, -SPRITE_DISP_W / 2, -SPRITE_DISP_H, SPRITE_SCALE);
      ctx.restore();
      const faceX = rx - 20;
      const faceY = ry - 50;
      drawCrampFace(ctx, faceX, faceY, this.character.gender, this.timer);
    } else {
      ctx.save();
      ctx.translate(rx, ry + SPRITE_DISP_H);  // pivot: piedi
      ctx.rotate(slopeAngle);
      this.runner.draw(ctx, -SPRITE_DISP_W / 2, -SPRITE_DISP_H, SPRITE_SCALE);
      ctx.restore();
    }

    // 7. nebbia / pioggia
    this.world.drawFog(ctx, this.weather.fog);
    this.world.drawRain(ctx, this.weather.rain, this.weather.t);

    // 8. HUD (T&F: pace + barra a quadretti + indicatore lato + stamina + bicchiere)
    this.hud.draw(ctx, {
      timer: this.timer,
      distanceKm: this.progress * this.track.distanceKm,
      totalKm: this.track.distanceKm,
      speedMs: this.physics.speedMs,
      paceStr: this.physics.paceString,
      speedNormalized: this.physics.speedNormalized,
      stability: this.game.input.getRhythmStability(),
      nextSide: this.game.input.nextSide,
      staminaNorm: this.staminaT.normalized,
      staminaExhausted: this.staminaT.exhausted,
      staminaFlash: Math.max(0, this.staminaT.lastFlash),
      atRefreshment: this.atRefreshment,
      approachingRefreshment: this.approachingRefreshment,
      waterButtonRect: this._waterButtonRect,
    });

    // 9. minimappa + altimetria
    this.minimap.draw(ctx, this.track, this.progress, this.ghostProgress);
    this.altimetry.draw(ctx, this.track, this.progress, this.ghostProgress);

    // 10. nome track in alto + logo evento ATRS (se in modalità ATRS) + tasto MOLLA
    // Pannello HUD occupa x=4..134, tasto MOLLA da W-86. Spazio per nome gara: x=140..W-90.
    if (this.eventLogo) {
      // logo evento mini (24x24)
      drawLogo(ctx, this.eventLogo, 140, 4, 24);
      const labelTitle = this.trackLabel
        ? `${this.eventName.toUpperCase()} ${this.trackLabel}`
        : this.eventName.toUpperCase();
      drawTextShadow(ctx, labelTitle, 168, 8, '#FFFFFF', '#000000', 1);
      if (this.mode === 'championship') {
        drawTextShadow(ctx, '* CAMPIONATO ATRS *', 168, 18, '#FFD700', '#000000', 1);
      }
    } else {
      drawTextShadow(ctx, this.track.name.toUpperCase(),
                     140, 6, '#FFFFFF', '#000000', 1);
    }

    // Tasto "SO STRACCHE!" — solo in modalità campionato durante la gara
    if (this.mode === 'championship' && this.started && !this.finished && !this.skipped) {
      const bx = W - 86, by = 4, bw = 82, bh = 18;
      ctx.fillStyle = this.confirmSkip ? '#A03020' : '#3a2c1e';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = this.confirmSkip ? '#FFD700' : '#a0846a';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      if (this.confirmSkip) {
        drawTextCentered(ctx, 'CONFERMA?', bx + bw/2, by + 2, '#FFFFFF', 1);
        drawTextCentered(ctx, 'TOCCA ANCORA', bx + bw/2, by + 11, '#FFD700', 1);
      } else {
        drawTextCentered(ctx, 'SO STRACCHE!', bx + bw/2, by + 2, '#FFFFFF', 1);
        drawTextCentered(ctx, 'NIN CE LA FACC', bx + bw/2, by + 11, '#FFD700', 1);
      }
    }

    // 11. countdown overlay con reminder istruzioni
    if (!this.started) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, W, H);
      // Reminder istruzioni in alto (lampeggio discreto)
      const blink = Math.floor(this.timer * 4) % 4 !== 3;
      if (blink) {
        drawTextCentered(ctx, '← →  ALTERNA I TAP  ← →',
                         W / 2, H / 2 - 64, '#FFFF88', 2);
      }
      drawTextCentered(ctx, '[R] O BICCHIERE D\'ACQUA = RISTORO',
                       W / 2, H / 2 - 42, '#88FFCC', 1);
      // Cifra del countdown / VIA
      const c = Math.ceil(this.countdown - 0.5);
      const txt = c > 0 ? String(c) : 'VIA!';
      drawTextCentered(ctx, txt, W / 2, H / 2 - 6, '#FFD700', 4);
    }

    // 12. toast
    if (this.kmToastTimer > 0) {
      drawTextCentered(ctx, this.kmToast, W / 2, H / 2 - 30, '#FFD700', 2);
    }
    if (this.refreshmentToast > 0) {
      // animazione "pop" iniziale
      const scale = this.refreshmentToast > 2.0 ? 2 : 1;
      drawTextCentered(ctx, 'RISTORO PRESO!',
                       W / 2, H / 2 - 30, '#FFFF80', scale);
      drawTextCentered(ctx, '+ STAMINA  + IDRATAZIONE',
                       W / 2, H / 2 - 8, '#88FF88', 1);
    }

    // 12b. banner di avvicinamento al ristoro
    if (this.approachingRefreshment && this.refreshmentToast <= 0) {
      const d = this.approachingRefreshment.dist;
      const distM = Math.abs(d) * this.track.distanceM;
      const flicker = Math.floor(this.timer * 4) % 2 === 0;
      // banner in alto al centro
      const bw = 240, bh = 32;
      const bx = (W - bw) / 2;
      const by = 50;
      ctx.fillStyle = flicker ? 'rgba(60,194,60,0.9)' : 'rgba(40,140,40,0.9)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      if (d > 0.005) {
        // ancora prima del ristoro
        drawTextCentered(ctx, 'RISTORO IN ARRIVO',
                         W / 2, by + 4, '#FFFFFF', 1);
        drawTextCentered(ctx, `${Math.round(distM)} M - RALLENTA O PREMI [R]`,
                         W / 2, by + 16, '#FFFF80', 1);
      } else {
        // dentro la finestra: ora!
        drawTextCentered(ctx, 'RISTORO QUI - PRENDILO!',
                         W / 2, by + 4, '#FFFF00', 1);
        drawTextCentered(ctx, 'RALLENTA IL TAP O PREMI [R]',
                         W / 2, by + 16, '#FFFFFF', 1);
      }
    }

    // 13. fine gara overlay
    if (this.finished) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, W, H);
      drawTextCentered(ctx, 'TRAGUARDO!', W / 2, H / 2 - 12, '#FFD700', 3);
      drawTextCentered(ctx, 'CALCOLO RISULTATI...', W / 2, H / 2 + 14, '#FFFFFF', 1);
    }

    // (Le istruzioni di gioco sono mostrate durante il countdown, vedi sezione 11)
  }

  _goToResults() {
    const result = {
      trackId: this.track.id,
      trackName: this.track.name,
      time: this.timer,
      finished: !this.skipped && this.progress >= 1,
      skipped: this.skipped,
      distanceKm: this.progress * this.track.distanceKm,
      tapCount: this.tapCount,
      isPB: !this.pb || this.timer < this.pb.time,
      previousPBtime: this.pb ? this.pb.time : null,
      character: this.character,
      // metadati ATRS
      eventId: this.eventId,
      eventName: this.eventName,
      eventLogo: this.eventLogo,
      scoreBonus: this.scoreBonus,
      placeholder: this.placeholder,
      trackName: this.trackName || this.track.name,
      trackLabel: this.trackLabel,
      mode: this.mode,
      // distanze ATRS reali per scoring (non da progress che può essere tronco)
      distanceKmFull: this.track.distanceKm,
      gainMFull: this.track.elevationGainM || 0,
      // tracking stile
      finalStamina: Math.round(this.staminaT.stamina),
      timeInThresholdRatio: this.timer > 0 ? this.timeInThreshold / this.timer : 0,
      hadCramp: this.hadCramp,
      staminaAtSkip: this.skipped ? Math.round(this.staminaT.stamina) : null,
    };

    // salva record (solo gare singole completate, non in modalità campionato)
    if (result.finished && this.mode === 'single') {
      this.game.storage.saveRecord(this.track.id, {
        name: this.character.name || 'RUNNER',
        time: this.timer,
        date: new Date().toISOString(),
        distance: this.track.distanceKm,
        gain: this.track.elevationGainM,
        gender: this.character.gender,
      });
      if (result.isPB) {
        // Sample finale al traguardo: garantisce che il ghost arrivi a progress=1
        // (senza questo, l'ultimo sample registrato è il penultimo della corsa
        // e il ghost si fermerebbe prima del traguardo nella prossima partita)
        this.mySamples.push({ t: this.timer, p: 1 });
        this.game.storage.saveGhost(this.track.id, this.mySamples);
      }
      const profile = this.game.profile;
      profile.totalRaces = (profile.totalRaces || 0) + 1;
      profile.totalKm = (profile.totalKm || 0) + this.track.distanceKm;
      this.game.storage.saveProfile(profile);
    }

    this.game.changeState(GameState.RESULTS, { result });
  }

  /** Bottiglie d'acqua azzurre con tappo bianco - ristoro classico */
  _drawWaterBottles(ctx, sx, yT) {
    ctx.fillStyle = '#88CCFF';
    ctx.fillRect(sx - 6, yT - 11, 2, 4);
    ctx.fillRect(sx - 2, yT - 11, 2, 4);
    ctx.fillRect(sx + 2, yT - 11, 2, 4);
    ctx.fillRect(sx + 6, yT - 11, 2, 4);
    // tappi
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(sx - 6, yT - 12, 2, 1);
    ctx.fillRect(sx - 2, yT - 12, 2, 1);
    ctx.fillRect(sx + 2, yT - 12, 2, 1);
    ctx.fillRect(sx + 6, yT - 12, 2, 1);
  }

  /** Arrosticini abruzzesi: 3 spiedini orizzontali con cubetti di carne
   *  rosolata su stecchino di legno. Usati come ristoro nelle gare di Voltigno. */
  _drawArrosticini(ctx, sx, yT) {
    // Tabellino bianco "AC" alle spalle (tagliere/insegna mini)
    // Tre arrosticini sovrapposti su 3 livelli verticali
    // Layout orizzontale: stecchino lungo 14px, 4 cubetti di carne 2x3 con bordo
    // ogni arrosticino: y= yT-13, yT-11, yT-9 (3 file da 2px)
    // Stecchino di legno (pixel chiari, 1px alto)
    const stickColor = '#d6a661';     // legno chiaro
    const stickShadow = '#8b5a2b';    // bordo legno scuro
    const meatColor = '#7a3a1a';      // carne rosolata (marrone-rosso)
    const meatHi = '#a85a2a';         // highlight carne
    const meatLow = '#4a2010';        // ombra carne
    const meatChar = '#2a1008';       // crosticina

    // 3 spiedini, ognuno alto 3px (cubetti) + 1px stecchino sotto
    // Y di ogni stecchino (la linea di legno):
    const yA = yT - 13;
    const yB = yT - 9;
    const yC = yT - 5;  // questo a livello del piano blu del tavolo

    for (const ySticky of [yA, yB]) {
      // Stecchino di legno orizzontale (estremità sporgente a sx e dx)
      ctx.fillStyle = stickColor;
      ctx.fillRect(sx - 9, ySticky + 2, 18, 1);
      ctx.fillStyle = stickShadow;
      ctx.fillRect(sx - 9, ySticky + 3, 18, 1);
      // 4 cubetti di carne sopra lo stecchino
      // Ogni cubetto è 3x2, distanziati di 1 pixel
      for (let i = 0; i < 4; i++) {
        const cx = sx - 7 + i * 4;
        // base carne
        ctx.fillStyle = meatColor;
        ctx.fillRect(cx, ySticky, 3, 2);
        // highlight sopra (lato cotto)
        ctx.fillStyle = meatHi;
        ctx.fillRect(cx, ySticky, 3, 1);
        // crosticina aggressiva al bordo (rotazione fra i cubetti per varietà)
        if ((i + (ySticky & 1)) % 2 === 0) {
          ctx.fillStyle = meatChar;
          ctx.fillRect(cx + 2, ySticky, 1, 1);
        } else {
          ctx.fillStyle = meatLow;
          ctx.fillRect(cx, ySticky + 1, 1, 1);
        }
      }
    }
    // Vapore caldo sopra: piccoli pixel bianchi che svaniscono (animazione discreta)
    const steamPhase = Math.floor(this.timer * 4) % 3;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(sx - 4, yA - 3 - steamPhase, 1, 1);
    ctx.fillRect(sx + 1, yA - 4 - ((steamPhase + 1) % 3), 1, 1);
    ctx.fillRect(sx + 5, yA - 2 - ((steamPhase + 2) % 3), 1, 1);
  }
}
