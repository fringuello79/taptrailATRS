// src/core/Game.js
// Orchestratore principale: gameloop, state machine, gestione scene.

import { MenuScene } from '../scenes/MenuScene.js';
import { TrackSelectScene } from '../scenes/TrackSelectScene.js';
import { CharacterScene } from '../scenes/CharacterScene.js';
import { RaceScene } from '../scenes/RaceScene.js';
import { ResultsScene } from '../scenes/ResultsScene.js';
import { LeaderboardScene } from '../scenes/LeaderboardScene.js';
import { ModeSelectScene } from '../scenes/ModeSelectScene.js';
import { EventSelectScene } from '../scenes/EventSelectScene.js';
import { DistanceSelectScene } from '../scenes/DistanceSelectScene.js';
import { ChampionshipHubScene } from '../scenes/ChampionshipHubScene.js';
import { ChampionshipFinalScene } from '../scenes/ChampionshipFinalScene.js';
import { Storage } from '../systems/Storage.js';
import { Input } from '../systems/Input.js';
import { Audio } from '../systems/Audio.js';

export const GameState = Object.freeze({
  MENU: 'menu',
  MODE_SELECT: 'mode_select',
  EVENT_SELECT: 'event_select',
  DISTANCE_SELECT: 'distance_select',
  CHAMPIONSHIP_HUB: 'championship_hub',
  CHAMPIONSHIP_FINAL: 'championship_final',
  TRACK_SELECT: 'track_select',
  CHARACTER: 'character',
  RACE: 'race',
  RESULTS: 'results',
  LEADERBOARD: 'leaderboard',
});

export class Game {
  constructor(canvas, manifest) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false; // pixel art crisp
    this.manifest = manifest;
    this.storage = new Storage();
    this.input = new Input(canvas);
    this.audio = new Audio();

    // Profilo giocatore persistito
    this.profile = this.storage.loadProfile();

    this.scene = null;
    this.state = null;
    this.lastTime = 0;
    this.running = false;

    // Risoluzione virtuale (pixel art): 640x360 (16:9), pi&#249; spazio per scena e sentiero
    this.virtualW = 640;
    this.virtualH = 360;
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.changeState(GameState.MENU);
  }

  resize() {
    // usa l'intera viewport disponibile, non il rect del canvas (che è già "shrinkato")
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const targetRatio = this.virtualW / this.virtualH;
    let w = vw;
    let h = w / targetRatio;
    if (h > vh) {
      h = vh;
      w = h * targetRatio;
    }
    this.canvas.width = Math.floor(this.virtualW);
    this.canvas.height = Math.floor(this.virtualH);
    this.canvas.style.width = `${Math.floor(w)}px`;
    this.canvas.style.height = `${Math.floor(h)}px`;
    this.ctx.imageSmoothingEnabled = false;
  }

  start() {
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  stop() {
    this.running = false;
  }

  loop(timestamp) {
    if (!this.running) return;
    let dt = (timestamp - this.lastTime) / 1000;
    if (dt > 0.1) dt = 0.1;
    this.lastTime = timestamp;

    if (this.scene && this.scene.update) this.scene.update(dt);
    if (this.scene && this.scene.render) this.scene.render(this.ctx);

    this.input.endFrame();
    requestAnimationFrame((t) => this.loop(t));
  }

  changeState(newState, payload = {}) {
    try {
      if (this.scene && this.scene.exit) this.scene.exit();
    } catch (e) {
      console.error('Errore in scene.exit:', e);
    }
    this.state = newState;
    try {
      switch (newState) {
        case GameState.MENU:
          this.scene = new MenuScene(this);
          break;
        case GameState.MODE_SELECT:
          this.scene = new ModeSelectScene(this);
          break;
        case GameState.EVENT_SELECT:
          this.scene = new EventSelectScene(this, payload);
          break;
        case GameState.DISTANCE_SELECT:
          this.scene = new DistanceSelectScene(this, payload);
          break;
        case GameState.CHAMPIONSHIP_HUB:
          this.scene = new ChampionshipHubScene(this);
          break;
        case GameState.CHAMPIONSHIP_FINAL:
          this.scene = new ChampionshipFinalScene(this, payload);
          break;
        case GameState.TRACK_SELECT:
          this.scene = new TrackSelectScene(this);
          break;
        case GameState.CHARACTER:
          this.scene = new CharacterScene(this, payload);
          break;
        case GameState.RACE:
          this.scene = new RaceScene(this, payload.trackData, payload.character, payload);
          break;
        case GameState.RESULTS:
          this.scene = new ResultsScene(this, payload);
          break;
        case GameState.LEADERBOARD:
          this.scene = new LeaderboardScene(this);
          break;
      }
      if (this.scene && this.scene.enter) this.scene.enter();
    } catch (e) {
      console.error(`Errore creando la scena ${newState}:`, e);
      this.scene = new MenuScene(this);
      this.state = GameState.MENU;
    }
  }
}
