# Grundbestand: Herkunft, Rechte, Auswahl

Stand 6. November 2026. Prüfung: `npm run verify`. Versionen (SHA-256 der Manifest-Einträge) stehen in `data/catalog/<bestand>/manifest.json`; jede Version bleibt unter `manifests/` erhalten.

## Exoplaneten – 6 464 Einträge

- Quelle: NASA Exoplanet Archive, Tabelle **Planetary Systems Composite Parameters (`pscomppars`)**, eine Zeile je Planet (keine Übergewichtung durch mehrere Publikationen). Abruf über den dokumentierten TAP-Synchron-Endpunkt `https://exoplanetarchive.ipac.caltech.edu/TAP/sync`, Abfrage im Manifest, Rohdatei unter `raw/` mit Prüfsumme.
- Felder: Name, Wirtsstern, Anzahl Sterne/Planeten, Entdeckungsmethode/-jahr/-einrichtung, Umlaufzeit (Tage), grosse Halbachse (AE), Radius (Erdradien), Masse (Erdmassen, mit Herkunftsangabe Msini/Mass), Exzentrizität, Gleichgewichtstemperatur (K), Spektraltyp, Sterntemperatur/-masse/-radius, Entfernung (pc), RA/Dec (Grad und Sexagesimal), V-Helligkeit, Publikationsdatum. Fehlende Werte sind `null`.
- Rechte: Daten des NASA Exoplanet Archive; Danksagung gemäss Archiv-Hinweis im Manifest. Objektseite: `https://exoplanetarchive.ipac.caltech.edu/overview/<Name>`.

## Bilder – 60 Dateien (JPEG, längste Seite 600–1 200 px)

| Lieferant | Anzahl | Rechte | Auswahlregel |
|---|---|---|---|
| The Metropolitan Museum of Art, Open Access (Collection API) | 40 | nur `isPublicDomain=true` (CC0); Beleg im Manifest (`rights_evidence`) | Abteilungen European Paintings 14, Asian Art 8, Drawings and Prints 8, Photographs 5, Islamic Art 3, Modern Art 2; innerhalb der Abteilung Objekt-IDs nach `SHA-256("konstellation-met-v1:"+id)` sortiert, der Reihe nach geprüft |
| Smithsonian Open Access – Smithsonian American Art Museum (Metadaten aus dem AWS-Open-Data-Bucket, Bild vom IDS-Lieferdienst) | 20 | nur Datensätze mit `metadata_usage.access=CC0` **und** Bild `usage.access=CC0` | Objekttyp «Painting» aus den Metadateien 00–05; Kandidaten nach `SHA-256("konstellation-si-v1:"+record_ID)` sortiert |

Jede Datei wurde nach dem Download auf JPEG/PNG-Magic-Bytes, vollständiges JPEG-Ende, Mindestkante 300 px geprüft; erst dann ins Manifest übernommen. Verworfene Kandidaten stehen unter `rejected` (z. B. `met-453986`: zu klein). Rohmetadaten der Anbieter liegen unter `images/meta/`. Kultureller Schwerpunkt: europäische Malerei, japanische Druckgrafik, amerikanische Malerei des 19. Jahrhunderts. Erweiterung: `npm run import:images:met -- 10` (≈ 400 Bilder), `npm run import:images:si -- 200 40`.

Hinweis: Die Met-Endpunkte `/search` wurden am 1. 10. 2026 abgelöst; der Importer verwendet `/objects?departmentIds=` und `/objects/{id}`.

## Texte – 30 Werke, 30 Autor:innen, 21 753 Stellen

- Quelle: **ELTeC-deu** (European Literary Text Collection, COST Action CA16204), Release 1.0.0, DOI 10.5281/zenodo.4662482, 100 deutsche Romane 1840–1920 in TEI. Texte gemeinfrei, TEI-Auszeichnung CC BY 4.0. Textgrundlage laut `<sourceDesc>` überwiegend die **Digitale Bibliothek von TextGrid** (TextGrid-URI und Link `https://textgridrep.org/textgrid:…` im Manifest), teils Deutsches Textarchiv.
- Bezug: Rohdateien von GitHub `COST-ELTeC/ELTeC-deu` (`level1/DEUxxx.xml`), gespeichert gzip-komprimiert mit Prüfsumme; Stellen-Datei je Werk (`*.passages.json`) mit Prüfsumme und Ausschlussstatistik.
- Auswahl: je Autor:in genau ein Werk (das mit kleinstem `SHA-256("konstellation-eltec-v1:"+Dateiname)`), dann die ersten 30 Autor:innen in derselben Hash-Reihenfolge. Enthalten sind u. a. Fontane, Stifter, Raabe, Freytag, Rilke, Schnitzler, Tieck, Marlitt, Dohm, Boy-Ed, Christ, François, Janitschek, May, Wassermann. `DEU077` (Ellen Olestjerne) trägt in den ELTeC-Metadaten keinen Autorennamen (Franziska zu Reventlow); das Manifest gibt den Metadatenstand wieder.
- Erweiterung auf bis zu 100 Werke: `npm run import:texts:eltec -- 100`. Lyrik (TextGrid «Verse», DTA «Lyrik») ist für einen zweiten Importer vorgesehen (Zeilenstruktur erhalten).

Der direkte TextGrid-Zugriff (`textgridlab.org`) war aus der Entwicklungsumgebung gesperrt; der ELTeC-Weg ist dokumentiert und reproduzierbar.

## Wetterarchiv – 28 Orte, 1 033 Datensätze

| Art | Orte | Inhalt | Rechte |
|---|---|---|---|
| **NOAA Integrated Surface Database (ISD), Global Hourly**, AWS Open Data `noaa-global-hourly-pds` | 9 Flughafenstationen: Zürich, Nairobi, Kapstadt, Sydney, Honolulu, Singapur, Buenos Aires, Mumbai (Tokio-Haneda hatte an den Stichtagen keine SYNOP-Meldungen und wurde verworfen) | echte SYNOP-Beobachtungen (FM-12) an den Stichtagen 15. 1., 15. 4., 15. 7., 15. 8. 2025, stündlich; Temperatur, Wind, Druck, Bewölkung (Okta → %), Niederschlag 1 h; Qualitätscodes 2/3/6/7 → fehlend | NOAA/NCEI, U.S. Government Work |
| **Open-Meteo Forecast API** (`past_days=3`, dreistündlich, nur Stunden vor dem Abruf) | 19 Orte weltweit inkl. Mittelatlantik, Nordpazifik, Südlicher Indischer Ozean, Reykjavík, Nuuk, Ushuaia, Jakarta … (Abruf 6. 11. 2026) | Modelldaten (Best-Match), als solche gekennzeichnet | CC BY 4.0, nichtkommerzielle API-Nutzung |

Rohdaten (ISD-Auszüge als CSV, Open-Meteo-Antworten als JSON) unter `weather-archive/raw/` mit Prüfsummen; für die ISD-Vollständigkeitsprüfung ist auch die Prüfsumme der kompletten Stationsdatei vermerkt.

## Karte, Orte, Namen

- **Natural Earth** (gemeinfrei): Länder 1:110 Mio. (177 Features, Koordinaten auf 3 Nachkommastellen gerundet) und Orte aus `populated_places_simple` 1:10 Mio. (2 700 Orte: Hauptstädte und Bedeutungsrang ≤ 3). Bezug über den offiziellen GitHub-Spiegel `nvkelso/natural-earth-vector`.
- **Leaflet 1.9.4** (BSD-2) lokal unter `public/vendor/leaflet/`.
- **Namenslisten** (`names/names.json`): 60 Vornamen, 56 Familiennamen, für dieses Projekt zusammengestellt.
