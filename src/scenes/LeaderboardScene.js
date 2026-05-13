// src/scenes/LeaderboardScene.js
// Classifiche. 3 viste principali:
//   LOCALE      → tuoi record personali (PB) — usati anche per il ghost
//   GARE        → hub con le 13 gare e il leader corrente di ognuna
//                  cliccando su una gara → sotto-pagina con classifica dettagliata
//   CAMPIONATO  → classifica generale ATRS (totale punti + bonus 5/6, 6/6)

import { drawText, drawTextCentered, drawTextShadow } from '../ui/PixelFont.js';
import { GameState } from '../core/Game.js';
import { leaderboard } from '../systems/Leaderboard.js';

const VIEWS = ['races', 'championship'];
const VIEW_LABELS = {
  races: 'GARE',
  championship: 'CAMPIONATO',
};

export class LeaderboardScene {
  constructor(game) {
    this.game = game;

    // Lista delle gare nell'ordine del manifest (eventi + distanze)
    this.tracks = [];
    const events = game.manifest.events || [];
    for (const ev of events) {
      for (const dist of (ev.distances || [])) {
        this.tracks.push({
          id: dist.id,
          name: `${ev.name} ${dist.label}`,
          shortName: ev.name,
          distLabel: dist.label,
          unlocked: !dist.placeholder,
        });
      }
    }

    this.view = 'races';        // vista corrente: 'races' | 'championship'
    this.detailTrackId = null;  // se non null → siamo nel dettaglio di una gara

    // Cache delle classifiche online (per chiave)
    this.onlineData = {};       // chiave → array
    this.onlineLoading = {};    // chiave → bool
    this.onlineError = {};      // chiave → string|null

    // Records locali — ricaricati a enter() per essere sempre freschi
    this.records = game.storage.loadRecords();

    // Scroll della lista (per liste lunghe)
    this.scrollOffset = 0;

    this._handleKey = (e) => {
      if (e.code === 'Escape') {
        // Se siamo in dettaglio gara, torna alla hub. Altrimenti vai al menu.
        if (this.detailTrackId) {
          this.detailTrackId = null;
        } else {
          this.game.changeState(GameState.MENU);
        }
      } else if (e.code === 'Enter') {
        this.game.changeState(GameState.MENU);
      } else if (e.code === 'Tab') {
        e.preventDefault();
        // Tab cicla le 3 viste, ma esce dal dettaglio
        this.detailTrackId = null;
        this._cycleView(e.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener('keydown', this._handleKey);
  }

  enter() {
    // Ricarico i record locali ogni volta (così aggiornamenti recenti
    // dopo una gara appena finita sono visibili)
    this.records = this.game.storage.loadRecords();
  }

  exit() {
    window.removeEventListener('keydown', this._handleKey);
  }

  _cycleView(dir) {
    const i = VIEWS.indexOf(this.view);
    this._setView(VIEWS[(i + dir + VIEWS.length) % VIEWS.length]);
  }

  _setView(v) {
    if (v === this.view) return;
    this.view = v;
    this.detailTrackId = null;
    this.scrollOffset = 0;
    if (v === 'championship') {
      this._ensureChampionshipLoaded();
    } else if (v === 'races') {
      this._ensureRacesHubLoaded();
    }
  }

  _ensureChampionshipLoaded() {
    const key = 'championship';
    if (this.onlineData[key] !== undefined || this.onlineLoading[key]) return;
    this.onlineLoading[key] = true;
    leaderboard.fetchChampionship('', 30).then(entries => {
      this.onlineData[key] = entries;
      this.onlineLoading[key] = false;
    }).catch(err => {
      this.onlineLoading[key] = false;
      this.onlineData[key] = [];
      this.onlineError[key] = err.message || String(err);
    });
  }

  /** Per la hub gare: per ogni track preload del leader (top 1).
   *  In realtà chiediamo top 5 al server così la cache è già pronta se
   *  l'utente apre il dettaglio. */
  _ensureRacesHubLoaded() {
    for (const t of this.tracks) {
      if (!t.unlocked) continue;
      const key = 'top|' + t.id;
      if (this.onlineData[key] !== undefined || this.onlineLoading[key]) continue;
      this.onlineLoading[key] = true;
      leaderboard.fetchTop(t.id, 20).then(entries => {
        this.onlineData[key] = entries;
        this.onlineLoading[key] = false;
      }).catch(err => {
        this.onlineLoading[key] = false;
        this.onlineData[key] = [];
        this.onlineError[key] = err.message || String(err);
      });
    }
  }

  _openDetail(trackId) {
    this.detailTrackId = trackId;
    this.scrollOffset = 0;
    // Carica già al ensureRacesHub, ma forzo se assente
    const key = 'top|' + trackId;
    if (this.onlineData[key] === undefined && !this.onlineLoading[key]) {
      this.onlineLoading[key] = true;
      leaderboard.fetchTop(trackId, 30).then(entries => {
        this.onlineData[key] = entries;
        this.onlineLoading[key] = false;
      }).catch(err => {
        this.onlineLoading[key] = false;
        this.onlineData[key] = [];
        this.onlineError[key] = err.message || String(err);
      });
    }
  }

  _refreshCurrent() {
    if (this.view === 'championship') {
      delete this.onlineData['championship'];
      delete this.onlineError['championship'];
      this._ensureChampionshipLoaded();
    } else if (this.view === 'races') {
      if (this.detailTrackId) {
        const key = 'top|' + this.detailTrackId;
        delete this.onlineData[key];
        delete this.onlineError[key];
        this._openDetail(this.detailTrackId);
      } else {
        // Reset di tutte le entries della hub
        for (const t of this.tracks) {
          delete this.onlineData['top|' + t.id];
          delete this.onlineError['top|' + t.id];
        }
        this._ensureRacesHubLoaded();
      }
    }
  }

  update(dt) {
    const W = this.game.virtualW;
    const H = this.game.virtualH;
    for (const c of this.game.input.menuClicks) {
      // Back: torna al menu (se in dettaglio, torna alla hub)
      if (c.x < 40 && c.y < 24) {
        if (this.detailTrackId) {
          this.detailTrackId = null;
        } else {
          this.game.changeState(GameState.MENU);
        }
        return;
      }
      // Tab buttons in alto a destra (3 tab, 80px ognuno)
      const tabW = 80, tabH = 18, tabY = 4, tabGap = 2;
      const totalW = VIEWS.length * tabW + (VIEWS.length - 1) * tabGap;
      const startX = W - totalW - 4;
      for (let i = 0; i < VIEWS.length; i++) {
        const tx = startX + i * (tabW + tabGap);
        if (c.x >= tx && c.x < tx + tabW && c.y >= tabY && c.y < tabY + tabH) {
          this._setView(VIEWS[i]);
          this.game.audio.beep(660, 0.05);
          return;
        }
      }
      // Refresh button (in basso a destra)
      if (c.x >= W - 70 && c.x < W - 4 && c.y >= H - 22 && c.y < H - 4) {
        this._refreshCurrent();
        this.game.audio.beep(880, 0.05);
        return;
      }
      // Click su gara nella hub (solo se view=races senza detail)
      if (this.view === 'races' && !this.detailTrackId) {
        const hit = this._hitHubRow(c.x, c.y);
        if (hit !== null) {
          this._openDetail(this.tracks[hit].id);
          this.game.audio.beep(880, 0.05);
          return;
        }
      }
    }
  }

  /** Hit-test sulle righe della hub. Ritorna index della track o null. */
  _hitHubRow(x, y) {
    const startY = 40;
    const rowH = 18;
    const W = this.game.virtualW;
    if (x < 14 || x > W - 14) return null;
    if (y < startY) return null;
    // Trovo l'indice considerando lo scroll
    const idx = Math.floor((y - startY) / rowH) + this.scrollOffset;
    if (idx < 0 || idx >= this.tracks.length) return null;
    if (!this.tracks[idx].unlocked) return null;
    return idx;
  }

  render(ctx) {
    const W = this.game.virtualW;
    const H = this.game.virtualH;
    ctx.fillStyle = '#0E0E1A';
    ctx.fillRect(0, 0, W, H);

    drawTextShadow(ctx, '< BACK', 8, 8, '#FFFFFF', '#000', 1);
    drawTextCentered(ctx, 'CLASSIFICHE', W / 2, 8, '#FFD700', 2);

    // Tab buttons (in alto a destra)
    const tabW = 80, tabH = 18, tabY = 4, tabGap = 2;
    const totalW = VIEWS.length * tabW + (VIEWS.length - 1) * tabGap;
    const startX = W - totalW - 4;
    for (let i = 0; i < VIEWS.length; i++) {
      const v = VIEWS[i];
      const tx = startX + i * (tabW + tabGap);
      const active = (this.view === v);
      ctx.fillStyle = active ? '#FFD700' : '#1a1a2e';
      ctx.fillRect(tx, tabY, tabW, tabH);
      ctx.strokeStyle = active ? '#FFFFFF' : '#444466';
      ctx.lineWidth = 1;
      ctx.strokeRect(tx + 0.5, tabY + 0.5, tabW - 1, tabH - 1);
      drawTextCentered(ctx, VIEW_LABELS[v], tx + tabW / 2, tabY + 5,
                       active ? '#000000' : '#AAAACC', 1);
    }

    // Render body
    if (this.view === 'championship') this._renderChampionship(ctx);
    else if (this.view === 'races') {
      if (this.detailTrackId)         this._renderRaceDetail(ctx);
      else                            this._renderRacesHub(ctx);
    }

    // Refresh button (sempre, sono tutte viste online)
    {
      const rbX = W - 70, rbY = H - 22, rbW = 66, rbH = 18;
      ctx.fillStyle = '#1F4FA8';
      ctx.fillRect(rbX, rbY, rbW, rbH);
      ctx.strokeStyle = '#88BBFF';
      ctx.strokeRect(rbX + 0.5, rbY + 0.5, rbW - 1, rbH - 1);
      drawTextCentered(ctx, 'REFRESH', rbX + rbW / 2, rbY + 6, '#FFFFFF', 1);
    }
  }

  // ============================================================
  // VISTA CAMPIONATO
  // ============================================================
  _renderChampionship(ctx) {
    const W = this.game.virtualW;
    const key = 'championship';
    drawTextCentered(ctx, 'CLASSIFICA GENERALE ATRS 2026',
                     W / 2, 30, '#88BBFF', 1);

    const entries = this.onlineData[key];
    const startY = 50;

    if (this._renderLoadingOrError(ctx, key, startY)) return;
    if (!entries || entries.length === 0) {
      drawTextCentered(ctx, 'NESSUNA ENTRY ANCORA', W / 2, startY + 30, '#888888', 2);
      drawTextCentered(ctx, 'Gioca una gara per essere il primo!',
                       W / 2, startY + 60, '#FFFFFF', 1);
      return;
    }

    // Header (colonne per CAMPIONATO: focus su PUNTI)
    const cx = { rank: 14, name: 42, gender: 212, races: 236, bonus: 286, total: 360, fin: 440 };
    drawText(ctx, '#',         cx.rank,   startY, '#FFD700', 1);
    drawText(ctx, 'GIOCATORE', cx.name,   startY, '#FFD700', 1);
    drawText(ctx, 'S',         cx.gender, startY, '#FFD700', 1);
    drawText(ctx, 'GARE',      cx.races,  startY, '#FFD700', 1);
    drawText(ctx, 'BONUS',     cx.bonus,  startY, '#FFD700', 1);
    drawText(ctx, 'TOTALE',    cx.total,  startY, '#FFD700', 1);
    drawText(ctx, 'FIN',       cx.fin,    startY, '#FFD700', 1);
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(12, startY + 10, W - 24, 1);

    const myName = (this.game.profile.name || 'RUNNER').toUpperCase();
    const maxRows = Math.min(18, entries.length);
    for (let i = 0; i < maxRows; i++) {
      const e = entries[i];
      const ry = startY + 16 + i * 14;
      const isMine = (e.player || '').toUpperCase() === myName;
      const col = isMine ? '#FFD700' : '#FFFFFF';
      drawText(ctx, `${e.position}.`, cx.rank, ry, '#FFD700', 1);
      drawText(ctx, (e.player || '?').toUpperCase().substring(0, 14),
               cx.name, ry, col, 1);
      drawText(ctx, e.gender || '-', cx.gender, ry, '#AAAACC', 1);
      drawText(ctx, `${e.eventsCompleted}/6`, cx.races, ry, '#88FFCC', 1);
      drawText(ctx, e.bonusPartecipazione > 0 ? `+${e.bonusPartecipazione}` : '-',
               cx.bonus, ry, '#FF9933', 1);
      drawText(ctx, `${e.totalPoints}`, cx.total, ry, col, 1);
      drawText(ctx, e.finisher ? '*' : '-',
               cx.fin + 6, ry, e.finisher ? '#FFD700' : '#666688', 1);
    }
  }

  // ============================================================
  // VISTA GARE (HUB)
  // ============================================================
  _renderRacesHub(ctx) {
    const W = this.game.virtualW;
    drawTextCentered(ctx, 'CLICCA SU UNA GARA PER LA CLASSIFICA',
                     W / 2, 28, '#88BBFF', 1);

    const startY = 40;
    const rowH = 18;
    let drawn = 0;
    for (const t of this.tracks) {
      const ry = startY + drawn * rowH;
      const key = 'top|' + t.id;
      const entries = this.onlineData[key];
      const leader = entries && entries.length > 0 ? entries[0] : null;

      // Sfondo riga (alterno per leggibilità)
      ctx.fillStyle = drawn % 2 === 0 ? '#15152a' : '#1a1a30';
      ctx.fillRect(14, ry - 2, W - 28, rowH);

      // Nome gara
      const nameCol = t.unlocked ? '#FFFFFF' : '#555566';
      drawText(ctx, t.name.toUpperCase().substring(0, 32),
               20, ry + 3, nameCol, 1);

      if (!t.unlocked) {
        drawText(ctx, 'PROSSIMAMENTE', W - 110, ry + 3, '#555566', 1);
      } else if (this.onlineLoading[key]) {
        drawText(ctx, '...', W - 30, ry + 3, '#888888', 1);
      } else if (leader) {
        // Leader: nome + tempo
        const leadName = (leader.player || '?').toUpperCase().substring(0, 12);
        drawText(ctx, '1°', W - 200, ry + 3, '#FFD700', 1);
        drawText(ctx, leadName, W - 180, ry + 3, '#FFD700', 1);
        drawText(ctx, fmtTime(leader.timeSec || 0, 3),
                 W - 80, ry + 3, '#FFFFFF', 1);
      } else {
        drawText(ctx, 'NESSUNA ENTRY', W - 110, ry + 3, '#666666', 1);
      }
      drawn++;
    }
  }

  // ============================================================
  // VISTA GARE (DETTAGLIO singola gara)
  // ============================================================
  _renderRaceDetail(ctx) {
    const W = this.game.virtualW;
    const t = this.tracks.find(t => t.id === this.detailTrackId);
    if (!t) return;
    const key = 'top|' + t.id;

    // Titolo gara
    drawTextCentered(ctx, t.name.toUpperCase(), W / 2, 30, '#FFD700', 1);
    drawTextCentered(ctx, '(ORDINATO PER TEMPO MIGLIORE)',
                     W / 2, 40, '#888888', 1);

    const startY = 56;
    const entries = this.onlineData[key];
    if (this._renderLoadingOrError(ctx, key, startY)) return;
    if (!entries || entries.length === 0) {
      drawTextCentered(ctx, 'NESSUNA ENTRY ANCORA', W / 2, startY + 30, '#888888', 2);
      drawTextCentered(ctx, 'Gioca questa gara per essere il primo!',
                       W / 2, startY + 60, '#FFFFFF', 1);
      return;
    }

    // Header — focus su TEMPO + DATA, punti in fondo come riferimento
    const cx = { rank: 14, name: 42, gender: 168, time: 192, date: 282, points: 380 };
    drawText(ctx, '#',         cx.rank,   startY, '#FFD700', 1);
    drawText(ctx, 'GIOCATORE', cx.name,   startY, '#FFD700', 1);
    drawText(ctx, 'S',         cx.gender, startY, '#FFD700', 1);
    drawText(ctx, 'TEMPO',     cx.time,   startY, '#FFD700', 1);
    drawText(ctx, 'DATA',      cx.date,   startY, '#FFD700', 1);
    drawText(ctx, 'PT',        cx.points, startY, '#FFD700', 1);
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(12, startY + 10, W - 24, 1);

    const myName = (this.game.profile.name || 'RUNNER').toUpperCase();
    const maxRows = Math.min(18, entries.length);
    for (let i = 0; i < maxRows; i++) {
      const e = entries[i];
      const ry = startY + 16 + i * 14;
      const isMine = (e.player || '').toUpperCase() === myName;
      const col = isMine ? '#FFD700' : '#FFFFFF';
      drawText(ctx, `${e.position}.`, cx.rank, ry, '#FFD700', 1);
      drawText(ctx, (e.player || '?').toUpperCase().substring(0, 11),
               cx.name, ry, col, 1);
      drawText(ctx, e.gender || '-', cx.gender, ry, '#AAAACC', 1);
      drawText(ctx, fmtTime(e.timeSec || 0, 3), cx.time, ry, col, 1);
      // Data formato DD/MM HH:MM
      drawText(ctx, fmtDate(e.ts), cx.date, ry, '#88BBFF', 1);
      drawText(ctx, `${e.points}`, cx.points, ry, col, 1);
    }
  }

  // ============================================================
  // HELPER
  // ============================================================
  _renderLoadingOrError(ctx, key, startY) {
    const W = this.game.virtualW;
    if (this.onlineLoading[key]) {
      drawTextCentered(ctx, 'CARICAMENTO...', W / 2, startY + 40, '#88BBFF', 2);
      return true;
    }
    if (this.onlineData[key] === undefined) {
      // forza load
      if (key === 'championship') this._ensureChampionshipLoaded();
      else if (key.startsWith('top|')) {
        const trackId = key.substring(4);
        this._openDetail(trackId);
      }
      drawTextCentered(ctx, 'CARICAMENTO...', W / 2, startY + 40, '#88BBFF', 2);
      return true;
    }
    return false;
  }
}

/** Formatta secondi come "M:SS.mmm" con N decimali. */
function fmtTime(sec, decimals = 2) {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  if (m > 0) {
    return `${m}:${s.toFixed(decimals).padStart(decimals + 3, '0')}`;
  }
  return `${s.toFixed(decimals)}s`;
}

/** Formatta timestamp ISO (es. "2026-05-12T14:23:01.000Z") come "DD/MM HH:MM" */
function fmtDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm} ${hh}:${mi}`;
  } catch (e) { return ''; }
}
