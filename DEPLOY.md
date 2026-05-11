# Pubblicare Tap Trail V2 su GitHub Pages

## Procedura passo passo

### 1. Crea un nuovo repository su GitHub
- Vai su [github.com/new](https://github.com/new)
- Nome consigliato: `taptrail-v2` (o quello che preferisci)
- Visibilità: **Public** (richiesto per GitHub Pages gratuito)
- NON inizializzare con README/license/.gitignore (li hai già nel pacchetto)
- Crea il repository

### 2. Carica i file
Hai due opzioni:

**Opzione A — Drag & Drop dal browser (più semplice):**
1. Sulla pagina del repo appena creato, clicca su **"uploading an existing file"** (sotto "Quick setup")
2. Estrai lo zip `taptrail_v2.zip` in una cartella
3. **Apri quella cartella** e trascina **tutti i contenuti** (NON la cartella `taptrail_v2/` stessa, ma il suo contenuto: `index.html`, `src/`, `assets/`, ecc.) sulla pagina GitHub
4. Scrivi un commit message tipo "Initial upload"
5. Clicca **"Commit changes"**

**Opzione B — Da terminale (se hai Git installato):**
```bash
cd taptrail_v2
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TUO_USERNAME/taptrail-v2.git
git push -u origin main
```

### 3. Attiva GitHub Pages
1. Sul repo, vai su **Settings** (tab in alto a destra)
2. Nel menu a sinistra, clicca su **Pages**
3. Sotto "Source", seleziona:
   - **Branch**: `main`
   - **Folder**: `/ (root)`
4. Clicca **Save**
5. Aspetta 1-2 minuti, poi ricarica la pagina

In alto vedrai un box verde con il link:
```
https://TUO_USERNAME.github.io/taptrail-v2/
```

### 4. Verifica
Apri quel link nel browser. Dovresti vedere il menu di Tap Trail!

## File necessari per GitHub Pages

Tutti i file dello zip sono necessari. La struttura completa è:
```
taptrail_v2/
├── index.html              ← entry point del sito
├── .nojekyll               ← dice a GitHub di non processare con Jekyll
├── src/                    ← tutto il codice JavaScript
├── assets/                 ← sprite, logo, immagini
├── tracks/                 ← file GPX dei percorsi
├── docs/                   ← documentazione (opzionale ma non rompe nulla)
└── tools/                  ← strumenti dev (opzionale)
```

**Non rimuovere `.nojekyll`** — è un file vuoto ma fondamentale: senza di esso GitHub Pages applica Jekyll e potrebbe ignorare alcuni file (specialmente quelli in cartelle con underscore).

## Aggiornare il gioco in futuro

Quando ti consegno una nuova versione:
- Trascina i nuovi file sulla pagina del repo (sostituisce automaticamente)
- Oppure da terminale: `git add . && git commit -m "Update" && git push`
- GitHub Pages rilegge tutto in 1-2 minuti

## Dominio personalizzato (opzionale)

Se vuoi usare un dominio tuo (es. `taptrail.it`):
1. Nel repo, crea un file chiamato `CNAME` con dentro il dominio
2. Sul tuo registrar (es. Aruba, GoDaddy) aggiungi un record DNS:
   - Tipo `CNAME`: punta a `TUO_USERNAME.github.io`
3. Su GitHub Pages settings, conferma il dominio

## Note importanti

- **HTTPS automatico**: GitHub Pages serve sempre su HTTPS, va benissimo per il gioco
- **Mobile**: il sito funziona da qualunque smartphone/tablet
- **Audio**: alcuni browser bloccano l'audio fino al primo tap dell'utente — è normale, parte appena tocchi lo schermo
- **Cache**: dopo un aggiornamento ricorda di fare `Ctrl+F5` (PC) o swipe-down per refresh (mobile) per forzare il reload
