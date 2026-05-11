// src/systems/Weather.js
// Meteo dinamico: cambia palette del cielo, visibilità, vento, temperatura.
// Influenza Stamina (caldo→idratazione, vento contro→sforzo).

export const WeatherPresets = {
  clear_dawn: {
    label: 'alba serena',
    // alba MI2: rosa-arancio sopra, ambra basso, ben dithered
    skyTop: '#a8826e',
    skyMid: '#cea089',
    skyBot: '#e2c0a0',
    sunColor: '#f0d4a0',
    sunY: 0.65,
    fog: 0,
    wind: 0,
    temperatureC: 10,
    rain: 0,
  },
  day_clear: {
    label: 'giorno sereno',
    // giorno MI2 esterno (campionato): bianco-azzurro tenue, non saturo
    skyTop: '#869099',
    skyMid: '#bfbfaa',
    skyBot: '#d6dde2',
    sunColor: '#e8e0c8',
    sunY: 0.15,
    fog: 0,
    wind: 0.1,
    temperatureC: 18,
    rain: 0,
  },
  cloudy: {
    label: 'nuvoloso',
    skyTop: '#625364',
    skyMid: '#907a72',
    skyBot: '#bfbfaa',
    sunColor: null,
    sunY: 0,
    fog: 0.15,
    wind: 0.25,
    temperatureC: 13,
    rain: 0,
  },
  fog_summit: {
    label: 'nebbia in quota',
    skyTop: '#b3ada2',
    skyMid: '#bfbfaa',
    skyBot: '#d6dde2',
    sunColor: null,
    sunY: 0,
    fog: 0.55,
    wind: 0.15,
    temperatureC: 8,
    rain: 0,
  },
  dusk: {
    label: 'tramonto',
    // tramonto MI2: viola scuro alto, malva, ambra basso
    skyTop: '#3b414d',
    skyMid: '#945539',
    skyBot: '#bf7b4b',
    sunColor: '#c8704c',
    sunY: 0.78,
    fog: 0.05,
    wind: 0.1,
    temperatureC: 11,
    rain: 0,
  },
  rain_light: {
    label: 'pioggia leggera',
    skyTop: '#3b414d',
    skyMid: '#625364',
    skyBot: '#907a72',
    sunColor: null,
    sunY: 0,
    fog: 0.25,
    wind: 0.3,
    temperatureC: 9,
    rain: 0.4,
  },
};

export class Weather {
  constructor(preset = 'clear_dawn') {
    this.set(preset);
    this.t = 0;
    // gust dinamico per movimento parallasse
    this.windPhase = 0;
  }

  set(preset) {
    const p = WeatherPresets[preset] || WeatherPresets.clear_dawn;
    this.preset = preset;
    Object.assign(this, p);
  }

  update(dt) {
    this.t += dt;
    this.windPhase += dt * (0.5 + this.wind * 1.5);
  }

  /** Modificatore di sforzo dovuto a vento (0..0.4). */
  windResistance() {
    return this.wind * 0.4;
  }
}
