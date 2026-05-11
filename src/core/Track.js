// src/core/Track.js
// Gestisce un tracciato GPX: distanze cumulate (haversine reali in metri),
// interpolazione di altitudine e posizione lat/lon lungo il percorso,
// proiezione 2D normalizzata per la minimappa.

const EARTH_R = 6371000;

function toRad(d) { return d * Math.PI / 180; }

function haversineM(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

export class Track {
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.location = data.location || '';
    this.description = data.description || '';
    this.palette = data.palette || 'dawn_mountains';
    this.weather = data.weather_default || 'clear_dawn';
    this.points = data.points; // [{lat, lon, alt}, ...]

    this._buildIndex();
    this._buildMinimap();
  }

  _buildIndex() {
    // Distanza cumulata in metri per ogni vertice
    this.cum = new Float64Array(this.points.length);
    this.cum[0] = 0;
    let totalGain = 0;
    let totalLoss = 0;
    let minAlt = this.points[0].alt;
    let maxAlt = this.points[0].alt;
    for (let i = 1; i < this.points.length; i++) {
      const seg = haversineM(this.points[i - 1], this.points[i]);
      this.cum[i] = this.cum[i - 1] + seg;
      const dAlt = this.points[i].alt - this.points[i - 1].alt;
      if (dAlt > 0) totalGain += dAlt;
      else totalLoss += -dAlt;
      if (this.points[i].alt < minAlt) minAlt = this.points[i].alt;
      if (this.points[i].alt > maxAlt) maxAlt = this.points[i].alt;
    }
    this.distanceM = this.cum[this.cum.length - 1];
    this.distanceKm = this.distanceM / 1000;
    this.elevationGainM = totalGain;
    this.elevationLossM = totalLoss;
    this.minAlt = minAlt;
    this.maxAlt = maxAlt;
  }

  _buildMinimap() {
    // Proiezione equirettangolare semplice in coordinate normalizzate 0..1
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const p of this.points) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;
    }
    const cosLat = Math.cos(toRad((minLat + maxLat) / 2));
    const spanLat = maxLat - minLat;
    const spanLonScaled = (maxLon - minLon) * cosLat;
    const span = Math.max(spanLat, spanLonScaled) || 1;
    // centro
    const cLat = (minLat + maxLat) / 2;
    const cLon = (minLon + maxLon) / 2;
    this.minimapPoints = this.points.map((p) => {
      const x = 0.5 + ((p.lon - cLon) * cosLat) / span;
      const y = 0.5 - (p.lat - cLat) / span; // Y invertito (canvas)
      return { x, y };
    });
  }

  /** Da progresso normalizzato 0..1 → indice frazionario sul tracciato. */
  _progressToIndex(progress) {
    const target = Math.max(0, Math.min(1, progress)) * this.distanceM;
    // ricerca binaria sulla cum[]
    let lo = 0, hi = this.cum.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= target) lo = mid;
      else hi = mid;
    }
    const segLen = this.cum[hi] - this.cum[lo];
    const t = segLen > 0 ? (target - this.cum[lo]) / segLen : 0;
    return { i0: lo, i1: hi, t };
  }

  altitudeAt(progress) {
    const { i0, i1, t } = this._progressToIndex(progress);
    return this.points[i0].alt + (this.points[i1].alt - this.points[i0].alt) * t;
  }

  positionAt(progress) {
    const { i0, i1, t } = this._progressToIndex(progress);
    const a = this.points[i0], b = this.points[i1];
    return {
      lat: a.lat + (b.lat - a.lat) * t,
      lon: a.lon + (b.lon - a.lon) * t,
      alt: a.alt + (b.alt - a.alt) * t,
    };
  }

  minimapAt(progress) {
    const { i0, i1, t } = this._progressToIndex(progress);
    const a = this.minimapPoints[i0], b = this.minimapPoints[i1];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  /** Pendenza locale (m alt / m distanza) intorno al progresso, finestra adattiva. */
  slopeAt(progress, windowM = 30) {
    const total = this.distanceM;
    const halfW = windowM / 2;
    const pBack = Math.max(0, progress - halfW / total);
    const pFwd = Math.min(1, progress + halfW / total);
    const altBack = this.altitudeAt(pBack);
    const altFwd = this.altitudeAt(pFwd);
    const distM = (pFwd - pBack) * total;
    if (distM <= 0) return 0;
    return (altFwd - altBack) / distM; // es: 0.10 = 10% salita
  }

  /** Profilo altimetrico campionato uniformemente, per disegnare il grafico. */
  altitudeProfile(samples = 200) {
    const out = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      out[i] = this.altitudeAt(i / (samples - 1));
    }
    return out;
  }
}

/** Carica un track JSON dal manifest (fetch via path relativo). */
export async function loadTrack(filePath) {
  const res = await fetch(filePath);
  if (!res.ok) throw new Error(`Errore caricamento track: ${filePath}`);
  const data = await res.json();
  return new Track(data);
}
