# Bericht: Tests, angebundene Quellen, Einschränkungen

Stand 6. November 2026, Version 0.3.0 (Online zuerst; weitere Bilddatenbanken; Astronomie wählbar).

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
| 12 | Online zuerst: Bild und Werk aus simulierten Anbietern (echter HTTP-Server); nicht freigegebene Objekte, ID-Lücken, fremde Rechteangabe, falsche Sprache, defekte Bilddatei → verworfen und ersetzt; Zeitüberschreitung → Rückfall auf Bestand je Fund; Schalter aus → Bestand; Browser-Variante ohne Bilddownload | `test/online.test.js`: 6 Tests bestanden |
| 13 | Live: Server-Modus gegen Met, AIC, Gutenberg (6. 11. 2026): Bild `met-416534` (CC0, lokal geprüft), Werk `gutenberg-41931` Hamsun (70 p. m. a.), 2,8 s gesamt, `verifyRecord` ok, ZIP mit Bilddatei geprüft; statischer Browser-Modus (Playwright, echtes Netz): Bild online vom Met, Text ohne Proxy aus dem Bestand | bestanden |
| 14 | Cleveland (skip-Index, nicht-CC0 verworfen); Astronomie online: Kleinkörper (Nummer = Index + 1), Gaia (random_index), Ausfall → Exoplanet aus dem Bestand mit unveränderter Seed-Form | `test/online.test.js`: bestanden (8 Tests) |
| 15 | Live (6. 11. 2026, Server-Modus): Exoplaneten live über TAP (WASP-3 b, 5,3 s), JPL-Kleinkörper (559930 (2015 EG35), 2,2 s), Cleveland im Bild-Gesamtraum (aic 287 848 + cma 41 806 + met 503 179); Gaia-Archiv am Abend mit «SERVICE ERROR»/Zeitüberschreitung → Rückfall funktioniert; am Vormittag Punktabfrage in < 1 s | bestanden |
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
| Project Gutenberg (RDF + Volltext, Katalog `pg_catalog.csv`) | **Live überprüft** als Online-Anbieter (Text), Katalogindex 79 712 Zeilen, 2 455 deutsche Texte |
| Art Institute of Chicago (public API + IIIF) | **Live überprüft** als Online-Anbieter (Bild) im Server-Modus; braucht einen User-Agent (Cloudflare); aus Headless-Chromium ohne CORS-Antwort → Anbieter wird übersprungen |
| Met Museum Collection API (Live-Ziehung) | **Live überprüft** in Server- und Browser-Modus (CORS vorhanden) |
| Cleveland Museum of Art Open Access API | **Live überprüft** (41 806 CC0-Werke mit Bild, CORS vorhanden) |
| Europeana Search API | Anbieter gebaut, **nicht live geprüft** (API-Schlüssel fehlt) |
| NASA Exoplanet Archive TAP (Live-Ziehung) | **Live überprüft** |
| Gaia DR3 TAP (ESA) | **Live überprüft** (Punktabfrage über `random_index`), später vorübergehend 503 |
| JPL Small-Body Database (`sbdb.api`, `sbdb_query.api`) | **Live überprüft** (896 520 nummerierte Kleinkörper) |
| Internet Archive, Wellcome Collection | geprüft, nicht angebunden: Suche auf 10 000 Treffer begrenzt |
| Rijksmuseum, Wikimedia Commons, Smithsonian API, SIMBAD | geprüft, nicht angebunden (Token-Paging / kein deterministischer Index und 429 / Schlüssel / nicht erreichbar) |
| NOAA ISD (AWS Open Data) | **Live überprüft**, 8 Stationen |
| Natural Earth (GitHub-Spiegel) | **Live überprüft** |
| OpenStreetMap-Kacheln | im Browser bei Bedarf; in der Entwicklungsumgebung gesperrt, daher nur der Rückfall auf die Natural-Earth-Karte getestet |
| jev / TypeSafe | **Live überprüft** im GitHub-Workflow `jev-Pruefung` (6. 11. 2026, Lauf 1, Secret `TYPESAFE_API_KEY`): 60 Stellen gefragt, 0 Fehler, 0 auffällig – siehe unten |

## jev

- Verwendet: nicht im Durchlauf. Vorbereitet: `tools/jev-check.js` (Textstellen-Stichprobe, Frage «Erzähltext / Inhaltsverzeichnis / Vorspann / Fragment», Form `POST /v1/systemone` mit `model`, `state`, `questions` wie in ornament-cloud) und Workflow `jev-pruefung.yml` mit dem Repository-Secret.
- Nicht verwendet: keine ästhetische Vorauswahl, kein Austausch von Treffern, keine Rechteentscheidung.
- Stand: Erster echter Lauf am 6. 11. 2026 im Workflow (https://github.com/hansnoed-ui/konstellation/actions/runs/42185537246), Modell `jev-latest`: alle 60 geprüften Stellen als «erzaehltext» eingeschätzt, keine Fehler. Bericht: `docs/jev/jev-textpruefung-2026-11-06.md` (+ JSON mit Wahrscheinlichkeiten je Stelle). Das ist eine Modell-Einschätzung über eine Stichprobe, keine Prüfung des ganzen Bestands.

## Online zuerst (seit 0.2.0)

- Ablauf und Mathematik: [AUSWAHL.md, Abschnitt «Online zuerst»](AUSWAHL.md). Bild und Werk werden über aneinandergereihte Auswahlräume gezogen (Met ≈ 503 000, AIC ≈ 288 000 IDs, Gutenberg 2 455 deutsche Werke bzw. ≈ 79 900 IDs); Rückfall auf den Bestand nach 12 s / 12 Versuchen, je Fund getrennt.
- Rechte: nur maschinenlesbar freigegebene Treffer (`isPublicDomain`, `is_public_domain`, `dcterms:rights`); Gutenberg zusätzlich nach Todesjahr in `public-domain-70pma` / `public-domain-usa` eingeordnet. Beleg je Fund unter `rights_evidence`. Keine Rechtsgarantie, keine jev-Beteiligung.
- Statische Fassung (ornament.cloud): Met/AIC direkt aus dem Browser; Gutenberg über `proxy.php` (nur gutenberg.org, nur GET, 6 MB).
- Nicht angebunden: TextGrid-Suche (`tgsearch` antwortet «No service was found»), DTA-API (liefert HTML) – die TextGrid-Quellenangaben des Bestands bleiben.

## Verbleibende Einschränkungen

- Wetter live ist Modellwetter (Open-Meteo), keine Stationsmessung. Rate-Limits von Open-Meteo gelten (600/min, 10 000/Tag, nichtkommerziell).
- Online-Auswahlräume sind nicht eingefroren: Wiederholbarkeit über das Protokoll (ID/URL/Prüfsummen), keine Neuberechnung gegen einen späteren Datenbankstand. Treffer können Gebrauchsgrafik, Dramen, Sachtexte oder Übersetzungen sein (keine Vorauswahl, gewollt).
- Textbestand (Rückfall): nur Prosa, nur Deutsch, 30 Werke. Die Stellenregel ist heuristisch; einzelne Stellen können an Satzstücken beginnen («Satzstück ausserhalb Längenregel» wird verworfen, Teilstücke 40–270 Wörter zugelassen).
- Bildbestand: 60 Bilder in Vorschaugrösse (Met `web-large`, SI `max=1200`), nicht die Originalauflösung.
- Reproduzierbarkeit gilt nur mit identischen Beständen (Manifestversion) und identischen gespeicherten Wetter-/Astronomiedaten; `verifyRecord` meldet abweichende Versionen.
- Die statische Fassung speichert Konstellationen im Browser (localStorage, ca. 50 Einträge); Export sichert sie dauerhaft.
- Beschränkungen der Entwicklungsumgebung: Node-`fetch` brauchte dort `NODE_USE_ENV_PROXY=1`; auf einem normalen Rechner nicht nötig.
