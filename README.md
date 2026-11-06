# KONSTELLATION

Aus einem Namen, einem frei gewählten Ort und dem Zeitpunkt der Abfrage entsteht in zwei Stufen eine Konstellation:

1. **Stufe A (wissenschaftlich):** ein Wetterdatensatz zum Ort und ein Exoplanet aus dem NASA Exoplanet Archive.
2. **Stufe B (kulturell):** aus der Eingabe **und** den tatsächlich gefundenen wissenschaftlichen Daten werden ein Kunstbild und eine Textstelle gezogen – **standardmässig direkt online** aus grossen offenen Datenbanken (Met Museum ≈ 503 000 Objekte, Art Institute of Chicago ≈ 133 000 Werke, Project Gutenberg ≈ 79 000 Werke); der mitgelieferte Bestand ist nur Rückfall bei Ausfall, Zeitüberschreitung oder fehlender Freigabe.

Alle vier Funde sind echt und mit Herkunfts- und Rechteangaben versehen; Online-Funde werden nur angenommen, wenn der Anbieter die Freigabe maschinenlesbar bestätigt (CC0-Feld bzw. «Public domain in the USA»), und jede Rechteangabe ist im Protokoll belegt und eingeordnet. Die Beziehungen entstehen rein zahlenbasiert (SHA-256); es gibt keine Deutung, keine Persönlichkeitsanalyse und keine astrologische Aussage.

Lokal lauffähig ohne Konto, ohne Cloud-Abonnement, ohne LLM im Durchlauf. Nach der Installation funktioniert der erste Start auch mit gesperrtem Internet über den mitgelieferten Bestand (Schalter «Online zuerst» oder `KONSTELLATION_OFFLINE=1`).

## Schnellstart

Voraussetzung: Node.js 22 oder neuer. Keine npm-Abhängigkeiten (Leaflet liegt unter `public/vendor/`).

```sh
npm start                 # http://127.0.0.1:8787
KONSTELLATION_OFFLINE=1 npm start   # erzwingt Offline-Betrieb (Archivwetter, lokale Ortsliste, Natural-Earth-Karte)
```

Weitere Befehle:

| Befehl | Zweck |
|---|---|
| `npm test` | Kern-, Ablauf- und Adaptertests (ohne Netz, mit simuliertem Anbieter) |
| `node test/ui.e2e.mjs` | Oberfläche in Chromium (Playwright), Desktop und 360 px, Server- und statischer Modus, externes Netz gesperrt |
| `npm run verify` | Prüft den aktiven Bestand (Manifestversionen, Prüfsummen, Dateien, Mindestzahlen) |
| `npm run example -- "Name" 47.37 8.54 "Zürich"` | Konstellation ohne Oberfläche, speichert Protokoll und ZIP-Paket |
| `npm run import:exoplanets` | NASA Exoplanet Archive, Tabelle `pscomppars` über TAP (eine Zeile je Planet) |
| `npm run import:images:met -- [Faktor]` | Met Museum Open Access (nur `isPublicDomain=true`), Stichprobe je Abteilung; Faktor 10 ≈ 400 Bilder |
| `npm run import:images:si -- [Anzahl] [Metadateien]` | Smithsonian Open Access (SAAM, nur CC0-Gemälde mit CC0-Bild) |
| `npm run import:texts:eltec -- [Anzahl Werke]` | ELTeC-deu (deutsche Romane, Textgrundlage TextGrid/DTA); bis 100 Werke, je Autor:in eines |
| `npm run import:weather-archive` | Wetterarchiv: NOAA-ISD-Stationen (echte Messungen) und Open-Meteo-Vergangenheitswerte |
| `npm run import:basemap` | Weltkarte und Ortsliste aus Natural Earth |
| `npm run import:gutenberg-index -- [Sprachen]` | Katalogindex für die Online-Ziehung bei Project Gutenberg (`pg_catalog.csv`): IDs je Sprache und höchste ID; Standard `de` |
| `node tools/build-static.js <ziel> [--ornament]` | Statische Fassung (Oberfläche + Bestand ohne Rohdaten) für einen Webspace; `--ornament` fügt Kopfzeilen für ornament.cloud ein und legt den Durchreicher `proxy.php` bei (Gutenberg und Astronomie-Archive ohne CORS) |
| `node tools/jev-check.js` | Optionale jev-Prüfung des Textbestands (braucht `TYPESAFE_API_KEY`), siehe unten |

Importe schreiben Manifeste atomar und versioniert (`data/catalog/<bestand>/manifest.json`, Kopie unter `manifests/<version>.json`). Ein laufender Durchlauf bindet die Manifestversionen zu Beginn; Importe verändern seine Auswahlmenge nicht.

Hinter einem HTTP-Proxy (Umgebungsvariable `HTTPS_PROXY`) braucht Node 22 zusätzlich `NODE_USE_ENV_PROXY=1`.

## Aufbau

```
public/core/      Auswahlkern, Adapter, Paketexport – identisch in Node und im Browser
  canonical.js    kanonische Serialisierung + SHA-256
  seed.js         Normalisierung, S0, S1, verzerrungsfreie Indexziehung
  pipeline.js     Ablauf einer Konstellation, Rückfallreihenfolge, Protokoll, Nachrechnen
  weather.js      Wetterfelder/Einheiten, Open-Meteo-Normalisierung, Archivregel
  openmeteo.js    Live-Wetter und Ortssuche (Zeitlimit, 429/Retry-After, Schutzschalter)
  passages.js     Regel für Textstellen (TEI → Stellen); text-plain.js: Volltext → Stellen (Gutenberg)
  online.js       Online-Ziehung über aneinandergereihte Auswahlräume mehrerer Anbieter, Ersatz, Zeitbudget
  online/         Anbieter: met.js, aic.js (Bilder), gutenberg.js (Werke); online-deps.js baut sie aus der Konfiguration
  package.js, zip.js   portabler ZIP-Export
public/           Oberfläche (index.html, app.js, app.css), browser-deps.js, vendor/leaflet
server/           lokaler Node-Server (index.js), Dateisystem-Abhängigkeiten (deps.js)
importers/        Importwerkzeuge je Quelle
tools/            verify-catalog.js, example-run.js, jev-check.js
data/catalog/     aktiver, geprüfter Bestand (versionierte Manifeste, Dateien, Rohdaten)
data/runtime/     Laufzeitdaten: gespeicherte Konstellationen, Wetter-Cache, Exporte (nicht im Repo)
config/           default.json (Quellen, Zeitlimits, Bestandsorte); local.json überschreibt
docs/             Auswahlmathematik, Bestand, Bericht, Beispielkonstellation
```

Zwei Betriebsarten derselben Oberfläche:

- **Server** (`npm start`): der Ablauf läuft im Node-Prozess, Konstellationen liegen als JSON unter `data/runtime/constellations/`, Export über `/api/constellations/<id>/export.{json,zip}`.
- **Statisch**: `public/` plus `data/catalog/` unter `public/catalog/` (oder ein Symlink) auf einem beliebigen Webserver. Der Ablauf läuft im Browser, Konstellationen werden im Browser gespeichert; `?offline` erzwingt Offline-Betrieb. So lässt sich die App auf einem Webspace ohne Node veröffentlichen.

## Auswahlmathematik (kurz)

Ausführlich in [docs/AUSWAHL.md](docs/AUSWAHL.md).

- **Zeit:** einmal beim Klick, ISO-8601 UTC mit Millisekunden (Gerätezeit bzw. Serveruhr). Abfrage-, Daten- und Abrufzeitpunkt werden getrennt gespeichert.
- **S0** = SHA-256 der kanonischen Form von `{algorithm, stage:"S0", name (NFC, Leerraum normalisiert), lat, lon (6 Nachkommastellen als Text), query_time_utc}`.
- **Astronomie:** Index aus dem Strom `S0|astro`, gleichverteilt über die sortierte Planetenliste.
- **Wetter:** aktueller Open-Meteo-Abruf (gesamt ≤ 5 s, ≤ 2 Versuche, keine Wiederholung nach 429) → Cache (≤ 3 h alt) → Archiv (nächster Ort, dann nächster Tag im Jahr und nächste Stunde).
- **S1** = SHA-256 der kanonischen Form von `{algorithm, stage:"S1", s0, weather (verwendete Werte, Einheiten, Datenzeit, gelieferte Koordinaten), astro (verwendeter Katalogeintrag)}`. Abrufzeiten, Latenzen, Rohantworten und Protokolldaten gehen nicht ein.
- **Online zuerst (Standard):** Die Auswahlräume der Anbieter (Met: alle Objekt-IDs; AIC: ID-Raum bis zur höchsten Werk-ID; Gutenberg: Werkliste der gewählten Sprache aus dem Katalogindex, bei «alle Sprachen» der ganze ID-Raum) werden zu einem Gesamtraum aneinandergereiht; Index aus `S1|image-online` bzw. `S1|text-online`. Nicht freigegebene, bildlose, fremdsprachige oder nicht ladbare Treffer und Lücken im ID-Raum werden mit `…#ersatz<i>` neu gezogen; höchstens 12 Versuche und 12 s, sonst Bestand. Bild und Text fallen unabhängig zurück.
- **Bestand (Rückfall):** Strom `S1|image` über die sortierte Bildmenge. Strom `S1|text-work` über die sortierten Werke.
- **Stelle:** in beiden Fällen `S1|text-passage` über die Stellen des gezogenen Werks (lange Bücher werden nicht bevorzugt).
- **Ziehung:** `u` = erste 8 Bytes von `SHA-256(seed|label|k)`, akzeptiert falls `u < floor(2^64/n)·n`, Index `u mod n`; sonst `k+1`. Keine Modulo-Verzerrung, keine ungesäten Zufallsaufrufe im Kern.
- **Ersatz:** ein lokal beschädigter Eintrag (Prüfsumme/Format) wird entfernt und mit Label `image#ersatz1` usw. nachgezogen; jeder Ersatz steht im Protokoll.

Gleichverteilung gilt für den konkreten Auswahlraum zum Abfragezeitpunkt (Online-Räume wachsen und sind nicht eingefroren), nicht für alle Werke oder Daten weltweit. Online-Funde sind über das Protokoll (ID, URL, Prüfsummen) wiederholbar, aber nicht gegen einen späteren Datenbankstand neu berechenbar.

## Gespeicherte Daten und Wiederholbarkeit

Jede Konstellation ist ein JSON-Protokoll (`konstellation-record/1`) mit Anzeigename und normalisierter Eingabe, Koordinaten, eingefrorenem Zeitpunkt, Algorithmusversion, S0/S1 samt kanonischen Eingaben, allen Ziehungen (Label, n, Index, Zähler), den verwendeten wissenschaftlichen Werten mit Einheiten, Datenzeiten und Herkunft, Rohantwort bzw. Rohdatenauszug, Quelle/ID/URL/Abrufdatum/Rechte/Datei/Prüfsumme der kulturellen Funde, genauer Fundstelle, Manifestversionen, Rückfallebene und technischem Verlauf. Wissenschaftliche Inhalte, die S1 beeinflussen, stehen getrennt unter `used_for_seed`.

`verifyRecord` rechnet S0, S1 und alle Ziehungen gegen die geladenen Bestände nach und meldet abweichende Bestandsversionen. Eine gespeicherte Konstellation lässt sich ohne Onlineabfrage öffnen; der ZIP-Export (Protokoll, Bild, Textstelle, `anzeige.html`) genügt zum erneuten Anzeigen. Eine vollständige Neuauswahl braucht zusätzlich die referenzierten Manifestversionen.

## Online-Quellen und Rechte

| Anbieter | Auswahlraum | Freigabeprüfung | Rechteeinordnung im Protokoll |
|---|---|---|---|
| The Metropolitan Museum of Art, Collection API | alle Objekt-IDs (≈ 503 000) | `isPublicDomain=true` | `cc0` (Met Open Access) |
| Art Institute of Chicago, public API + IIIF | ID-Raum bis zur höchsten ID (≈ 288 000; ≈ 133 000 Werke) | `is_public_domain=true` | `cc0` (AIC Open Access); Cloudflare kann automatisierte Zugriffe abweisen – dann wird der Anbieter übersprungen |
| Cleveland Museum of Art, Open Access API | alle Werke mit `cc0=1&has_image=1` (≈ 41 800), direkt über `skip` adressierbar | `share_license_status=CC0` | `cc0` |
| Europeana Search API (nur mit kostenlosem API-Schlüssel: `config/local.json` → `online.keys.europeana`, Umgebungsvariable `EUROPEANA_API_KEY` oder auf dem Webspace `keys.js` mit `window.KONSTELLATION_KEYS`) | Bilder mit `reusability=open` und Mediendatei, adressiert über `start` | `edmRights` ∈ CC0 / Public Domain Mark / CC BY / CC BY-SA | `cc0`, `pdm`, `cc-by`, `cc-by-sa` (Namensnennung wird angezeigt) |

**Astronomie (Stufe A, wählbar):** Standard bleibt der Exoplanetenbestand. Auf Wunsch (`astro_source`) wird das Himmelsobjekt online gezogen, Index aus `S0|astro-online`; der verwendete Datensatz geht wie bisher in S1 ein.

| Archiv | Auswahlraum | Zugriff |
|---|---|---|
| NASA Exoplanet Archive, `pscomppars` live (TAP) | alle Planeten, Namensliste sortiert (≈ 6 500) | Zeile des gezogenen Planeten |
| Gaia DR3 (ESA Gaia Archive, TAP) | `random_index` 0 … 1 811 709 770 (eingefrorene Veröffentlichung, 1,8 Mrd. Quellen) | `where random_index = <Index>` |
| JPL Small-Body Database | nummerierte Asteroiden und Kometen 1 … Anzahl (≈ 896 500, `sbdb_query` count) | `sbdb.api?sstr=<Nummer>` |

Geprüft und **nicht** angebunden: Internet Archive und Wellcome Collection (Suche auf 10 000 Treffer begrenzt, kein gleichverteilter Zugriff), Rijksmuseum (nur Token-Paging), Wikimedia Commons (Zufall nur serverseitig, kein deterministischer Index, Ratenbegrenzung), Smithsonian Open Access API (Schlüssel, Tiefe der Paginierung unklar), SIMBAD (TAP aus der Entwicklungsumgebung nicht erreichbar).
| Project Gutenberg (RDF-Metadaten + UTF-8-Volltext) | Werke der gewählten Sprache laut `pg_catalog.csv` (Deutsch ≈ 2 455) oder ID-Raum (≈ 79 900) | `dcterms:rights = «Public domain in the USA.»`, Typ `Text` | `public-domain-70pma`, wenn alle Urheber:innen laut Todesjahr seit > 70 Jahren tot sind (CH/EU), sonst `public-domain-usa` (ausserhalb der USA unter Vorbehalt) |

Die Einordnung folgt den Metadaten der Anbieter und ist keine Rechtsgarantie; jede Angabe steht mit Feld und Wert unter `rights_evidence`. jev ist an keiner Rechteentscheidung beteiligt. In der statischen Browser-Fassung laden Met und AIC direkt (CORS); Project Gutenberg, das NASA Exoplanet Archive (TAP), das Gaia-Archiv (TAP) und die JPL Small-Body Database senden keine CORS-Kopfzeilen, deshalb braucht der Webspace den kleinen Durchreicher `proxy.php` (fünf Hosts, feste URL-Muster, nur GET; auch Cleveland, dessen API die CORS-Kopfzeile nicht zuverlässig sendet) – ohne ihn kommt der Text aus dem Bestand und die Online-Astronomie ist in der Oberfläche gesperrt. Weitere Datenbanken lassen sich als Anbieter unter `public/core/online/` ergänzen (zwei Funktionen: Grösse des Auswahlraums, Auflösen eines Index).

## Bestand (Rückfall)

Stand und Herkunft in [docs/BESTAND.md](docs/BESTAND.md): 6 464 Exoplaneten (NASA, Abruf 6. 11. 2026), 60 Bilder (40 Met Museum, 20 Smithsonian American Art Museum, alle CC0/Public Domain), 30 Romane von 30 Autor:innen (ELTeC-deu, Textgrundlage TextGrid/DTA, 21 753 Stellen), Wetterarchiv mit 28 Orten (9 NOAA-Stationen mit Stundenmessungen an vier Stichtagen 2025, 19 Open-Meteo-Orte inkl. drei Meerespunkten), Weltkarte (177 Länder) und 2 700 Orte (Natural Earth), Namenslisten.

## jev (TypeSafe)

jev wird **nicht** im Durchlauf verwendet und trifft keine Auswahl. Vorbereitet ist eine eng begrenzte Importprüfung: `tools/jev-check.js` fragt jev für eine deterministische Stichprobe von Textstellen, ob der Abschnitt Erzähltext, Inhaltsverzeichnis, Vorspann oder Fragment ist, und schreibt einen Bericht nach `docs/jev/`. Der Workflow `.github/workflows/jev-pruefung.yml` führt das mit dem Repository-Secret `TYPESAFE_API_KEY` aus. Das Ergebnis ist eine Modell-Einschätzung, keine verifizierte Tatsache und kein Lizenznachweis; es verändert den Bestand nicht. Erster erfolgreicher Lauf: 6. 11. 2026, 60 Stellen, keine auffällig ([docs/jev/](docs/jev/)); Details in [docs/BERICHT.md](docs/BERICHT.md).

## Grenzen

- Wetter: Open-Meteo liefert Modelldaten, keine Stationsmessung; die Archivfunde sind räumlich und zeitlich abweichend und so gekennzeichnet.
- Astronomie: Katalogauswahl, keine Sichtbarkeitsrechnung.
- Texte online: Project Gutenberg enthält auch Dramen, Lyrik, Sachtexte und Übersetzungen; die Volltextregel ist heuristisch (Überschriften, Verserkennung, Inhaltsverzeichnis) und kann einzelne Stellen falsch abgrenzen. Bestand: deutsche Romane 1840–1920 aus ELTeC-deu.
- Astronomie online: Gaia-Quellen sind meist lichtschwache Sterne ohne Namen (nur Kennung und Messwerte); das ESA-Archiv antwortet gelegentlich mit Fehlern oder langsam, dann kommt der Exoplanet aus dem Bestand.
- Bilder online: Met, AIC und Cleveland liefern auch Gebrauchsgrafik, Textilien, Münzen usw.; es gibt keine ästhetische Vorauswahl (gewollt). Im Browser werden Online-Bilder nicht byteweise geprüft (`verified_locally=false`), im Node-Server schon.
- Bilder: Stichprobe aus wenigen Met-Abteilungen und dem SAAM; kultureller Schwerpunkt Europa, Nordamerika, Japan.
- Kartenkacheln kommen von OpenStreetMap (nur bei Bedarf, keine Massenabrufe); ohne Netz die einfache Natural-Earth-Karte.
- Open-Meteo: kostenlos nur für nichtkommerzielle Nutzung; Abrufgrenzen beachten (die Historische API war beim Import bereits am Tageslimit, deshalb nutzt das Archiv die Forecast-API mit `past_days`).
