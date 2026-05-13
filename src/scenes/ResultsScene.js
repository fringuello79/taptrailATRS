// src/scenes/ResultsScene.js
// Schermata risultati ATRS:
// - Modalità Singola: tempo, PB, classifica locale + bottone INVIA ONLINE
// - Modalità Campionato: tempo + dettaglio punteggio (posizione virtuale + bonus + stile),
//   poi navigazione al CHAMPIONSHIP_HUB o CHAMPIONSHIP_FINAL.
//   Auto-submit silenzioso al backend (board=trackId) se il backend è configurato.

import { drawText, drawTextCentered, drawTextShadow } from '../ui/PixelFont.js';
import { drawLogo } from '../ui/Branding.js';
import { GameState } from '../core/Game.js';
import { calculateRaceScore } from '../systems/Scoring.js';
import { loadChampionship, recordRace, saveChampionship } from '../systems/Championship.js';
import { leaderboard } from '../systems/Leaderboard.js';

export class ResultsScene {
  constructor(game, payload) {
    this.game = game;
    this.result = payload.result;
    this.t = 0;
    this.records = game.storage.loadRecords()[this.result.trackId] || [];
    this.mode = this.result.mode || 'single';

    // Stato submit online (singola o auto-submit campionato)
    this.submitStatus = 'idle';   // idle | sending | ok | queued | error | unconfigured
    this.submitMessage = '';

    // Calcolo punteggio ATRS (sia per single che championship — utile da mostrare)
    if (this.result.finished) {
      this.scoring = calculateRaceScore({
        timeSec: this.result.time,
        distanceKm: this.result.distanceKmFull || this.result.distanceKm,
        gainM: this.result.gainMFull || 0,
        scoreBonus: this.result.scoreBonus || 0,
        finalStamina: this.result.finalStamina || 0,
        timeInThresholdRatio: this.result.timeInThresholdRatio || 0,
        hadCramp: this.result.hadCramp || false,
      });
    } else if (this.result.skipped) {
      // mollata: 0 punti
      this.scoring = {
        virtualPos: null, positionPts: 0, styleMul: 0,
        scoreBonus: 0, baseScore: 0, finalScore: 0,
      };
    } else {
      this.scoring = null;
    }

    // Se in modalità campionato, registro la gara
    this.recordedToChampionship = false;
    this.seasonComplete = false;
    if (this.mode === 'championship' && this.result.eventId) {
      this._recordChampionshipResult();
      // Auto-submit silenzioso al backend per la singola gara del campionato
      if (this.result.finished && leaderboard.isAvailable()) {
        this._autoSubmitChampionshipRace();
      }
    }

    this._handleKey = (e) => {
      if (e.code === 'Enter' || e.code === 'Space') this._continue();
      else if (e.code === 'KeyN' && this.mode === 'single') this._askName();
    };
    window.addEventListener('keydown', this._handleKey);
  }

  /** Submit silenzioso (no UI loud) della singola gara del campionato.
   *  Board=trackId. L'utente non aspetta: la classifica per gara si popola
   *  nel tempo. Errori/coda restano nel sistema fallback localStorage. */
  _autoSubmitChampionshipRace() {
    const r = this.result;
    leaderboard.submitScore({
      player: (r.character && r.character.name) || this.game.profile.name || 'RUNNER',
      board: r.trackId,
      mode: 'championship',
      timeSec: r.time,
      score: this.scoring ? this.scoring.finalScore : 0,
      eventId: r.eventId || '',
      trackId: r.trackId,
      distanceKm: r.distanceKmFull || r.distanceKm || 0,
      gainM: r.gainMFull || 0,
      finalStamina: r.finalStamina || 0,
    }).catch(err => {
      // submit silenzioso: niente alert. Il sistema retry-flush ci penserà.
      console.log('[Results] Auto-submit fallito (in coda):', err);
    });
  }


  _recordChampionshipResult() {
    const cs = loadChampionship();
    // Idempotenza: se la gara è già stata registrata, non rifaccio (sennò avanzo currentEventIndex 2 volte)
    if (cs.completedEvents && cs.completedEvents[this.result.eventId]) {
      this.recordedToChampionship = true;
      this.seasonComplete = cs.seasonComplete;
      return;
    }
    // Trova la prossima distanza per il bonus carry-stamina
    const events = this.game.manifest.events;
    const nextEventIdx = (cs.currentEventIndex || 0) + 1;
    let nextDistance = null;
    if (nextEventIdx < events.length) {
      const nextEv = events[nextEventIdx];
      nextDistance = nextEv.distances.find(d => d.utmb_category === '20K')
                  || nextEv.distances[0];
    }
    const raceData = {
      distanceId: this.result.trackId,
      timeSec: this.result.time,
      score: this.scoring ? this.scoring.finalScore : 0,
      finalStamina: this.result.finalStamina || 0,
      virtualPos: this.scoring ? this.scoring.virtualPos : null,
      skipped: !!this.result.skipped,
      staminaAtSkip: this.result.staminaAtSkip,
    };
    const newState = recordRace(cs, this.result.eventId, raceData, nextDistance);
    saveChampionship(newState);
    this.recordedToChampionship = true;
    this.seasonComplete = newState.seasonComplete;
  }

  _continue() {
    if (this.mode === 'championship') {
      if (this.seasonComplete) {
        this.game.changeState(GameState.CHAMPIONSHIP_FINAL);
      } else {
        this.game.changeState(GameState.CHAMPIONSHIP_HUB);
      }
    } else {
      this.game.changeState(GameState.MODE_SELECT);
    }
  }

  _askName() {
    const cur = (this.result.character && this.result.character.name) || this.game.profile.name || 'RUNNER';
    const newName = prompt('Inserisci il tuo nome:', cur);
    if (!newName) return;
    const nm = newName.toUpperCase().slice(0, 12);
    this.game.profile.name = nm;
    this.game.storage.saveProfile(this.game.profile);
    const all = this.game.storage.loadRecords();
    const list = all[this.result.trackId] || [];
    for (let i = 0; i < list.length; i++) {
      if (Math.abs(list[i].time - this.result.time) < 0.001) {
        list[i].name = nm;
        break;
      }
    }
    try { localStorage.setItem('taptrail.records.v2', JSON.stringify(all)); }
    catch (e) {}
    this.records = list;
    if (this.result.character) this.result.character.name = nm;
  }

  exit() {
    window.removeEventListener('keydown', this._handleKey);
  }

  update(dt) {
    this.t += dt;
    // Auto-redirect a CHAMPIONSHIP_FINAL dopo 8s se siamo in seasonComplete
    // (failsafe: se per qualche motivo i click non rispondono, l'utente non resta bloccato)
    if (this.mode === 'championship' && this.seasonComplete && !this._autoNavigated) {
      if (this.t > 8) {
        console.log('[ResultsScene] Auto-redirect a CHAMPIONSHIP_FINAL (timeout 8s)');
        this._autoNavigated = true;
        this._continue();
        return;
      }
    }
    // Anche se _btnCoords non è ancora settato (1° frame), processo i click via ESC/Enter
    if (!this._btnCoords) return;
    const { sxN, sxS, sxC, sy, bw, bh } = this._btnCoords;
    for (const c of this.game.input.menuClicks) {
      // padding tolleranza ±4 px su ogni lato per click affidabili
      const inY = c.y >= sy - 4 && c.y < sy + bh + 4;
      if (!inY) continue;
      // bottone NOME (solo single)
      if (this.mode === 'single' && sxN !== undefined &&
          c.x >= sxN - 4 && c.x < sxN + bw + 4) {
        this._askName();
        continue;
      }
      // bottone INVIA ONLINE (solo single + gara completata)
      if (this.mode === 'single' && sxS !== undefined &&
          c.x >= sxS - 4 && c.x < sxS + bw + 4) {
        if (this.submitStatus !== 'sending') this._submitOnline();
        continue;
      }
      // bottone CONTINUA / TROFEO / PROSSIMA GARA
      if (sxC !== undefined && c.x >= sxC - 4 && c.x < sxC + bw + 4) {
        console.log('[ResultsScene] Click su CONTINUA/TROFEO. mode=', this.mode,
                    'seasonComplete=', this.seasonComplete);
        this._continue();
        continue;
      }
      // FALLBACK CAMPIONATO: in modalità champion, qualsiasi click in area Y dei bottoni
      if (this.mode === 'championship') {
        console.log('[ResultsScene] Click fuori bottone in champ → _continue fallback');
        this._continue();
      }
    }
  }

  /** Submit esplicito della gara singola al backend.
   *  Board=trackId. UI feedback completo (sending/ok/error/queued/unconfigured). */
  _submitOnline() {
    if (!leaderboard.isAvailable()) {
      this.submitStatus = 'unconfigured';
      this.submitMessage = 'BACKEND NON CONFIGURATO';
      this.game.audio.beep(220, 0.15);
      return;
    }
    const r = this.result;
    if (!r || !r.finished) {
      this.submitStatus = 'error';
      this.submitMessage = 'GARA NON COMPLETATA';
      return;
    }
    this.submitStatus = 'sending';
    this.submitMessage = 'INVIO...';
    this.game.audio.beep(660, 0.10);

    leaderboard.submitScore({
      player: (r.character && r.character.name) || this.game.profile.name || 'RUNNER',
      board: r.trackId,
      mode: 'single',
      timeSec: r.time,
      score: this.scoring ? this.scoring.finalScore : 0,
      eventId: r.eventId || '',
      trackId: r.trackId,
      distanceKm: r.distanceKmFull || r.distanceKm || 0,
      gainM: r.gainMFull || 0,
      finalStamina: r.finalStamina || 0,
    }).then(res => {
      if (res.ok) {
        this.submitStatus = 'ok';
        this.submitMessage = 'INVIATO ✓';
        this.game.audio.beep(880, 0.15);
      } else if (res.queued) {
        this.submitStatus = 'queued';
        this.submitMessage = res.message;
        this.game.audio.beep(330, 0.20);
      } else {
        this.submitStatus = 'error';
        this.submitMessage = res.message || 'ERRORE';
        this.game.audio.beep(220, 0.20);
      }
    }).catch(err => {
      this.submitStatus = 'error';
      this.submitMessage = 'ERRORE: ' + (err.message || err);
      this.game.audio.beep(220, 0.20);
    });
  }

  render(ctx) {
    const W = this.game.virtualW;
    const H = this.game.virtualH;
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#1A0E2E');
    grad.addColorStop(1, '#0A0820');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const r = this.result;

    // Titolo
    if (r.skipped) {
      drawTextCentered(ctx, 'GARA MOLLATA!', W / 2, 14, '#FF6060', 2);
      drawTextCentered(ctx, '(SO STRACCHE)', W / 2, 32, '#FF8080', 1);
    } else if (r.finished) {
      drawTextCentered(ctx, 'TRAGUARDO!', W / 2, 14, '#FFD700', 2);
      if (this.mode === 'single' && r.isPB && r.previousPBtime !== null) {
        const flicker = Math.sin(this.t * 8) > 0;
        drawTextCentered(ctx, 'NUOVO PB!', W / 2, 32,
                         flicker ? '#FFD700' : '#FFFFFF', 1);
      } else if (this.mode === 'single' && r.isPB) {
        drawTextCentered(ctx, 'PRIMO RECORD!', W / 2, 32, '#FFD700', 1);
      }
    } else {
      drawTextCentered(ctx, 'GARA INTERROTTA', W / 2, 14, '#FF6060', 2);
    }

    // Logo evento + nome gara
    if (r.eventLogo) {
      drawLogo(ctx, r.eventLogo, W - 70, 6, 60);
    }
    const titleText = r.trackLabel
      ? `${r.eventName.toUpperCase()} ${r.trackLabel}`
      : r.trackName.toUpperCase();
    drawTextCentered(ctx, titleText, W / 2, 46, '#88BBFF', 1);
    if (this.mode === 'championship') {
      drawTextCentered(ctx, '** CAMPIONATO ATRS **', W / 2, 56, '#FFD700', 1);
    }

    // Box tempo + scoring
    const bx = 12;
    const by = 70;
    const bw = W - 24;
    const bh = 70;
    ctx.fillStyle = '#101018';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

    if (r.skipped) {
      drawText(ctx, 'PUNTEGGIO', bx + 8, by + 6, '#FFD700', 1);
      drawText(ctx, '0 PT', bx + 8, by + 16, '#FF6060', 2);
      drawText(ctx, 'STAMINA AL MOLLA: ' + (r.staminaAtSkip || 0),
               bx + 8, by + 38, '#88BBFF', 1);
      drawText(ctx, 'TEMPO ARRESO: ' + fmtTime(r.time), bx + 8, by + 50, '#88BBFF', 1);
    } else if (r.finished) {
      // Tempo a sx
      drawText(ctx, 'TEMPO', bx + 8, by + 6, '#FFD700', 1);
      drawText(ctx, fmtTime(r.time), bx + 8, by + 16, '#FFFFFF', 2);
      drawText(ctx, `${(r.distanceKmFull || r.distanceKm).toFixed(2)} KM`,
               bx + 8, by + 38, '#88BBFF', 1);
      if (r.gainMFull) {
        drawText(ctx, `${(+r.gainMFull).toFixed(2)} M D+`, bx + 8, by + 48, '#88BBFF', 1);
      }
      // Punteggio a dx
      if (this.scoring) {
        const px = bx + bw - 110;
        drawText(ctx, 'PUNTEGGIO', px, by + 6, '#FFD700', 1);
        drawText(ctx, `${this.scoring.finalScore} PT`, px, by + 14, '#FFD700', 2);
        drawText(ctx, `pos virtuale: ${this.scoring.virtualPos}°`, px, by + 32, '#FFFFFF', 1);
        drawText(ctx, `base ${this.scoring.positionPts}  x${this.scoring.styleMul.toFixed(2)}`,
                 px, by + 42, '#AACCFF', 1);
        if (this.scoring.scoreBonus > 0) {
          drawText(ctx, `+${this.scoring.scoreBonus} UTMB bonus`, px, by + 52, '#88FFCC', 1);
        }
      }
      // confronto PB (solo singola)
      if (this.mode === 'single' && r.previousPBtime) {
        const delta = r.time - r.previousPBtime;
        const sign = delta < 0 ? '-' : '+';
        drawText(ctx, `vs PB ${sign}${fmtTime(Math.abs(delta))}`,
                 bx + 8, by + 60, delta < 0 ? '#3CC23C' : '#FF6060', 1);
      }
    }

    // === Sezione bassa: classifica (singola) o stato campionato ===
    const ly = by + bh + 8;

    if (this.mode === 'championship') {
      // Mostra info post-gara: stamina che porteremo nella prossima
      const cs = loadChampionship();
      if (this.seasonComplete) {
        ctx.fillStyle = '#3a2c1e';
        ctx.fillRect(bx, ly, bw, 38);
        ctx.strokeStyle = '#FFD700';
        ctx.strokeRect(bx + 0.5, ly + 0.5, bw - 1, 37);
        drawTextCentered(ctx, 'CAMPIONATO COMPLETO!', W / 2, ly + 6, '#FFD700', 1);
        drawTextCentered(ctx, `SCORE TOTALE: ${cs.totalScore} PT`,
                         W / 2, ly + 18, '#FFFFFF', 1);
        drawTextCentered(ctx, '— vai al riepilogo —', W / 2, ly + 28, '#88FFCC', 1);
      } else {
        ctx.fillStyle = '#16162A';
        ctx.fillRect(bx, ly, bw, 38);
        ctx.strokeStyle = '#666';
        ctx.strokeRect(bx + 0.5, ly + 0.5, bw - 1, 37);
        drawText(ctx, 'STATO CAMPIONATO:', bx + 6, ly + 4, '#FFD700', 1);
        drawText(ctx, `evento ${cs.currentEventIndex}/6  score ${cs.totalScore}`,
                 bx + 6, ly + 14, '#FFFFFF', 1);
        drawText(ctx, `STAMINA prossima gara: ${cs.carryStamina}`,
                 bx + 6, ly + 24, '#88FFCC', 1);
      }
    } else {
      // Singola: classifica top 6
      drawText(ctx, 'CLASSIFICA', bx, ly, '#FFD700', 1);
      const myName = (r.character && r.character.name) || 'RUNNER';
      const top = this.records.slice(0, 5);
      for (let i = 0; i < top.length; i++) {
        const rec = top[i];
        const ry = ly + 12 + i * 10;
        const isMine = rec.time === r.time && rec.name === myName;
        drawText(ctx, `${i + 1}.`, bx, ry, '#FFD700', 1);
        const nm = (rec.name || 'RUNNER').toString().toUpperCase().padEnd(10, ' ');
        drawText(ctx, nm, bx + 16, ry, isMine ? '#FFD700' : '#FFFFFF', 1);
        drawText(ctx, fmtTime(rec.time), bx + 100, ry,
                 isMine ? '#FFD700' : '#CCCCCC', 1);
      }
    }

    // Bottoni in basso
    const btnH = 18;
    const sy = H - 24;
    let sxN, sxS, sxC;
    if (this.mode === 'single') {
      // Quanti bottoni? NOME + CONTINUA sempre. INVIA solo se la gara è completata.
      const showSubmit = !!this.result.finished;
      if (showSubmit) {
        // 3 bottoni da 90px con gap 6px → totale 282px, centrato su W=640
        const btnW = 90, gap = 6;
        const totalW = btnW * 3 + gap * 2;
        sxN = W/2 - totalW/2;
        sxS = sxN + btnW + gap;
        sxC = sxS + btnW + gap;
        // NOME
        ctx.fillStyle = '#16162A';
        ctx.fillRect(sxN, sy, btnW, btnH);
        ctx.strokeStyle = '#FFFFFF';
        ctx.strokeRect(sxN + 0.5, sy + 0.5, btnW - 1, btnH - 1);
        drawTextCentered(ctx, 'NOME (N)', sxN + btnW / 2, sy + 6, '#FFFFFF', 1);
        // INVIA ONLINE - colore secondo stato submit
        let sendBg = '#1F4FA8', sendLabel = 'INVIA ONLINE';
        if (this.submitStatus === 'sending') { sendBg = '#806020'; sendLabel = 'INVIO...'; }
        else if (this.submitStatus === 'ok') { sendBg = '#2E8B3A'; sendLabel = 'INVIATO ✓'; }
        else if (this.submitStatus === 'queued') { sendBg = '#806020'; sendLabel = 'IN CODA'; }
        else if (this.submitStatus === 'error') { sendBg = '#A03020'; sendLabel = 'ERRORE'; }
        else if (this.submitStatus === 'unconfigured') { sendBg = '#A03020'; sendLabel = 'NO BACKEND'; }
        ctx.fillStyle = sendBg;
        ctx.fillRect(sxS, sy, btnW, btnH);
        ctx.strokeStyle = '#88BBFF';
        ctx.strokeRect(sxS + 0.5, sy + 0.5, btnW - 1, btnH - 1);
        drawTextCentered(ctx, sendLabel, sxS + btnW / 2, sy + 6, '#FFFFFF', 1);
        // CONTINUA
        ctx.fillStyle = '#1F4FA8';
        ctx.fillRect(sxC, sy, btnW, btnH);
        ctx.strokeStyle = '#88BBFF';
        ctx.strokeRect(sxC + 0.5, sy + 0.5, btnW - 1, btnH - 1);
        drawTextCentered(ctx, 'CONTINUA', sxC + btnW / 2, sy + 6, '#FFFFFF', 1);
        // Messaggio di stato submit (sotto i bottoni)
        if (this.submitStatus !== 'idle' && this.submitMessage) {
          const color = (this.submitStatus === 'ok') ? '#88FFCC'
                      : (this.submitStatus === 'queued') ? '#FFD700'
                      : '#FF8080';
          drawTextCentered(ctx, this.submitMessage, W/2, sy - 10, color, 1);
        }
        this._btnCoords = { sxN, sxS, sxC, sy, bw: btnW, bh: btnH };
      } else {
        // Solo 2 bottoni (gara non completata: niente submit)
        const btnW = 100;
        sxN = W/2 - btnW - 4;
        sxC = W/2 + 4;
        ctx.fillStyle = '#16162A';
        ctx.fillRect(sxN, sy, btnW, btnH);
        ctx.strokeStyle = '#FFFFFF';
        ctx.strokeRect(sxN + 0.5, sy + 0.5, btnW - 1, btnH - 1);
        drawTextCentered(ctx, 'NOME (N)', sxN + btnW / 2, sy + 6, '#FFFFFF', 1);
        ctx.fillStyle = '#1F4FA8';
        ctx.fillRect(sxC, sy, btnW, btnH);
        ctx.strokeStyle = '#88BBFF';
        ctx.strokeRect(sxC + 0.5, sy + 0.5, btnW - 1, btnH - 1);
        drawTextCentered(ctx, 'CONTINUA', sxC + btnW / 2, sy + 6, '#FFFFFF', 1);
        this._btnCoords = { sxN, sxS: undefined, sxC, sy, bw: btnW, bh: btnH };
      }
    } else {
      // 1 bottone CONTINUA molto largo (220px) per evitare click misalign
      const bigW = 220;
      sxC = W/2 - bigW/2;
      ctx.fillStyle = this.seasonComplete ? '#FFD700' : '#1F4FA8';
      ctx.fillRect(sxC, sy, bigW, btnH);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.strokeRect(sxC + 0.5, sy + 0.5, bigW - 1, btnH - 1);
      ctx.lineWidth = 1;
      const label = this.seasonComplete ? 'CLICCA QUI: VAI AL TROFEO!' : 'CLICCA QUI: PROSSIMA GARA';
      drawTextCentered(ctx, label, sxC + bigW / 2, sy + 6,
                       this.seasonComplete ? '#000000' : '#FFFFFF', 1);
      // Per il click handler salvo bw del bottone grande
      this._btnCoords = { sxN: undefined, sxS: undefined, sxC, sy, bw: bigW, bh: btnH };
      return;
    }
  }
}

function fmtTime(sec) {
  sec = Math.max(0, sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec * 100) % 100);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
}
