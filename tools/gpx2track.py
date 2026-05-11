#!/usr/bin/env python3
"""
gpx2track.py — Converte un file GPX in un track.json compatibile con Tap Trail V2.

Uso:
    python3 gpx2track.py percorso.gpx -o tracks/mia-gara.json \
        --id mia-gara --name "Mia Gara 10K" --series "Abruzzo Trail Running Series"

Il file di output può essere droppato in tracks/ e referenziato dal manifest.json.
"""
import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def parse_gpx(gpx_path: Path):
    """Estrae i trackpoints (lat, lon, alt) da un GPX standard."""
    tree = ET.parse(gpx_path)
    root = tree.getroot()
    # i GPX usano namespace; lo rilevo dal tag root
    ns_match = re.match(r"\{(.+)\}", root.tag)
    ns = {"gpx": ns_match.group(1)} if ns_match else {}

    points = []
    trkpts = root.findall(".//gpx:trkpt", ns) if ns else root.findall(".//trkpt")
    for pt in trkpts:
        lat = float(pt.get("lat"))
        lon = float(pt.get("lon"))
        ele_el = pt.find("gpx:ele", ns) if ns else pt.find("ele")
        alt = float(ele_el.text) if ele_el is not None and ele_el.text else 0.0
        points.append({"lat": lat, "lon": lon, "alt": alt})

    return points


def haversine_m(lat1, lon1, lat2, lon2):
    """Distanza in metri tra due coordinate WGS84."""
    import math
    R = 6371000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def compute_stats(points):
    """Calcola distanza totale e dislivello positivo cumulato."""
    if len(points) < 2:
        return 0.0, 0.0
    total_m = 0.0
    gain_m = 0.0
    for i in range(1, len(points)):
        a, b = points[i - 1], points[i]
        total_m += haversine_m(a["lat"], a["lon"], b["lat"], b["lon"])
        d_alt = b["alt"] - a["alt"]
        if d_alt > 0:
            gain_m += d_alt
    return total_m / 1000.0, gain_m


def simplify(points, max_points=800):
    """Riduce il numero di punti se troppi (sample uniforme), preservando primo e ultimo."""
    if len(points) <= max_points:
        return points
    step = len(points) / max_points
    out = []
    for i in range(max_points):
        out.append(points[int(i * step)])
    if out[-1] != points[-1]:
        out.append(points[-1])
    return out


def main():
    ap = argparse.ArgumentParser(description="Converte GPX in track.json di Tap Trail V2.")
    ap.add_argument("gpx", type=Path, help="File .gpx in input")
    ap.add_argument("-o", "--output", type=Path, required=True, help="File JSON in output")
    ap.add_argument("--id", required=True, help="ID univoco della gara (es: alba-dei-marsi-21k)")
    ap.add_argument("--name", required=True, help='Nome leggibile (es: "L\'Alba dei Marsi 21K")')
    ap.add_argument("--series", default="Abruzzo Trail Running Series", help="Nome del circuito")
    ap.add_argument("--location", default="", help="Località (es: Marsica)")
    ap.add_argument("--difficulty", default="medio",
                    choices=["facile", "medio", "difficile", "molto difficile", "estrema"])
    ap.add_argument("--description", default="", help="Breve descrizione della gara")
    ap.add_argument("--palette", default="dawn_mountains",
                    help="Palette ambientale: dawn_mountains, day_alpine, dusk_forest, night_summit")
    ap.add_argument("--max-points", type=int, default=800,
                    help="Numero massimo di trackpoints (default 800)")
    args = ap.parse_args()

    if not args.gpx.exists():
        print(f"Errore: file non trovato: {args.gpx}", file=sys.stderr)
        sys.exit(1)

    points = parse_gpx(args.gpx)
    if not points:
        print("Errore: nessun trackpoint trovato nel GPX.", file=sys.stderr)
        sys.exit(1)

    print(f"Letti {len(points)} trackpoints dal GPX.")
    points = simplify(points, args.max_points)
    if len(points) < len(parse_gpx(args.gpx)):
        print(f"Semplificati a {len(points)} punti.")

    distance_km, elevation_gain_m = compute_stats(points)
    print(f"Distanza: {distance_km:.2f} km — Dislivello+: {elevation_gain_m:.0f} m")

    track = {
        "id": args.id,
        "name": args.name,
        "series": args.series,
        "location": args.location,
        "distance_km": round(distance_km, 2),
        "elevation_gain_m": round(elevation_gain_m),
        "difficulty": args.difficulty,
        "description": args.description,
        "palette": args.palette,
        "weather_default": "clear_dawn",
        "points": points,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as f:
        json.dump(track, f, ensure_ascii=False, indent=2)

    print(f"Scritto: {args.output}")
    print("Aggiungi una voce in tracks/manifest.json per renderla visibile in gioco.")


if __name__ == "__main__":
    main()
