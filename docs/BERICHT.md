# Bericht: Tests, angebundene Quellen, Einschränkungen

Stand 6. November 2026, Version 0.1.0.

## Ausgeführte Tests

| Nr. (Masterprompt) | Test | Ergebnis |
|---|---|---|
| 1 | Eingabe, Zufallsname, freie Ortswahl (Suche, Karte, Koordinaten, Meerespunkt) unabhängig vom Gerätestandort | `test/ui.e2e.mjs`: bestanden (4 Durchläufe) |
| 2 | Zeitpunkt genau einmal erfasst, langsame Abfrage ändert ihn nicht | `test/pipeline.test.js`: bestanden |
| 3 | Konstellation enthält Wetter, Astronomie, ladbares Bild, echte Textstelle | Pipeline- und UI-Test: bestanden |
| 4 | Wetter-/Astronomieänderung ändert S1 | bestanden |
| 5 | Gleiche Daten und Bestände reproduzieren dieselbe Auswahl, unabhängig von Reihenfolge/Geschwindigkeit/Abrufzeit | bestanden (`verifyRecord` rechnet nach) |
| 6 | Timeout, HTTP 429 (mit Retry-After), 500, HTML statt JSON, leere Antwort, defekte Bilddatei → begrenzte, protokollierte Rückfälle | `test/adapter.test.js` (echter HTTP-Simulator) und Pipeline-Test: bestanden; Timeout ≤ 300 ms eingehalten, nach 429 keine Wiederholung, höchstens 2 Versuche |
| 7 | Frischer Start mit gesperrtem Netz: Server, Karte, Ortswahl, Bild, Text benutzbar | UI-Test mit `KONSTELLATION_OFFLINE=1` und blockierten externen Hosts (Server- und statischer Modus): bestanden |
| 8 | jev nicht konfiguriert → Durchlauf vollständig | jev ist im Durchlauf nicht beteiligt; alle Tests laufen ohne Schlüssel |
| 9 | Archivwetter korrekt gekennzeichnet, fehlende Werte null | bestanden (Singapur-Station: Niederschlag teils null) |
| 10 | Gespeicherte Konstellation und ZIP-Paket ohne Anbieterzugriff anzeigbar, Bild/Text stimmen mit Protokoll | UI-Test öffnet gespeicherte Konstellation (S1 identisch) und lädt ZIP; ZIP mit `zipfile.testzip()` geprüft; Prüfsummen im Protokoll |
| 11 | Oberfläche Desktop (1280 px) und Mobil (360 px): kein schwarzes Bildfeld, lesbar, kein horizontales Überlaufen, Karte nicht blockierend | Screenshots `docs/beispiel/oberflaeche-*.png`; Überlaufprüfung im UI-Test |

Zusätzlich: Kern-Tests (kanonische Serialisierung, Normalisierung, S0/S1, Gleichverteilung der Ziehung über 7 000 Seeds), `npm run verify` ohne Befund, Live-Test gegen Open-Meteo (`KONSTELLATION_LIVE_TEST=1`, 6. 11. 2026): Wetter Zürich, Wetter Meerespunkt (0, −30), Ortssuche «Bern» mit mehreren Ländern – bestanden.

## Tatsächlich angebundene Quellen

| Quelle | Status |
|---|---|
| Open-Meteo Forecast (`current`) | **Live überprüft** (Import und Live-Test, 6. 11. 2026) |
| Open-Meteo Geocoding | **Live überprüft** |
| Open-Meteo Historical (archive-api) | Adapter nicht gebaut: beim Import antwortete der Endpunkt mit 429 «Daily API request limit exceeded»; Archiv stattdessen aus NOAA ISD und Forecast `past_days` |
| NASA Exoplanet Archive TAP (`pscomppars`) | **Live überprüft**, 6 464 Einträge importiert |
| Met Museum Collection API + Bilddateien | **Live überprüft**, 40 Bilder |
| Smithsonian Open Access (S3-Metadaten + IDS) | **Live überprüft**, 20 Bilder |
| ELTeC-deu (GitHub) | **Live überprüft**, 30 Werke |
| TextGrid Repository direkt (tg-search, textgridlab.org) | **nicht angebunden** (Host in der Entwicklungsumgebung gesperrt); TextGrid-URIs der Werke sind gespeichert |
| Project Gutenberg | nicht angebunden (optional) |
| NOAA ISD (AWS Open Data) | **Live überprüft**, 8 Stationen |
| Natural Earth (GitHub-Spiegel) | **Live überprüft** |
| OpenStreetMap-Kacheln | im Browser bei Bedarf; in der Entwicklungsumgebung gesperrt, daher nur der Rückfall auf die Natural-Earth-Karte getestet |
| jev / TypeSafe | **implementierter Adapter, nicht getesteter Livezugriff** – siehe unten |

## jev

- Verwendet: nicht im Durchlauf. Vorbereitet: `tools/jev-check.js` (Textstellen-Stichprobe, Frage «Erzähltext / Inhaltsverzeichnis / Vorspann / Fragment», Form `POST /v1/systemone` mit `model`, `state`, `questions` wie in ornament-cloud) und Workflow `jev-pruefung.yml` mit dem Repository-Secret.
- Nicht verwendet: keine ästhetische Vorauswahl, kein Austausch von Treffern, keine Rechteentscheidung.
- Stand: Aus der Entwicklungsumgebung war kein Schlüssel verfügbar; der erste echte Aufruf geschieht im Workflow. Nach dem ersten Lauf liegt der Bericht unter `docs/jev/`.

## Verbleibende Einschränkungen

- Wetter live ist Modellwetter (Open-Meteo), keine Stationsmessung. Rate-Limits von Open-Meteo gelten (600/min, 10 000/Tag, nichtkommerziell).
- Textbestand: nur Prosa, nur Deutsch, 30 Werke. Die Stellenregel ist heuristisch; einzelne Stellen können an Satzstücken beginnen («Satzstück ausserhalb Längenregel» wird verworfen, Teilstücke 40–270 Wörter zugelassen).
- Bildbestand: 60 Bilder in Vorschaugrösse (Met `web-large`, SI `max=1200`), nicht die Originalauflösung.
- Reproduzierbarkeit gilt nur mit identischen Beständen (Manifestversion) und identischen gespeicherten Wetter-/Astronomiedaten; `verifyRecord` meldet abweichende Versionen.
- Die statische Fassung speichert Konstellationen im Browser (localStorage, ca. 50 Einträge); Export sichert sie dauerhaft.
- Beschränkungen der Entwicklungsumgebung: Node-`fetch` brauchte dort `NODE_USE_ENV_PROXY=1`; auf einem normalen Rechner nicht nötig.
