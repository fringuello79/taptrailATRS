// src/main.js
// Entry point: carica il manifest delle tracks e avvia il gioco.

import { Game } from './core/Game.js';
import { logoCache } from './ui/Branding.js';

async function bootstrap() {
  const canvas = document.getElementById('gameCanvas');
  const loadingEl = document.getElementById('loading');

  try {
    // precarica i loghi
    logoCache.preload([
      'assets/logos/atrs.png',
      'assets/logos/atrs_shield.png',
      'assets/logos/abruzzo_map.png',
      'assets/logos/alba_marsi.png',
      'assets/logos/voltigno.png',
      'assets/logos/alba_marsi_event.png',
      'assets/logos/mammut.png',
      'assets/logos/xterra.png',
      'assets/logos/gran_sasso.png',
      'assets/logos/maglio.png',
      'assets/logos/trophy_finisher.png',
    ]);

    const manifestRes = await fetch('tracks/manifest.json');
    if (!manifestRes.ok) throw new Error('Impossibile caricare tracks/manifest.json');
    const manifest = await manifestRes.json();

    const game = new Game(canvas, manifest);
    window.__game = game; // utile per debug in console
    game.start();
    if (loadingEl) loadingEl.style.display = 'none';
  } catch (err) {
    console.error(err);
    if (loadingEl) {
      loadingEl.innerHTML = `<div style="color:#f44">Errore di caricamento:<br><pre>${err.message}</pre>` +
        `<br><br>Stai aprendo il file con doppio click? Serve un server locale.<br>` +
        `Esegui in questa cartella:<br><code>python3 -m http.server 8080</code><br>` +
        `e poi apri <code>http://localhost:8080</code></div>`;
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
