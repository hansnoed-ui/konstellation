# Auswahlmathematik und gespeicherte Daten

Algorithmusversion `konstellation/1`. Implementierung: `public/core/seed.js`, `public/core/pipeline.js`.

## 1. Normalisierung der Eingabe

- **Name:** Unicode-NFC; jede Folge von Leerraum (inkl. geschützten Leerzeichen, Tabulatoren, Zeilenumbrüchen) wird ein Leerzeichen; aussen gekürzt; nicht leer; höchstens 120 Zeichen. Gross-/Kleinschreibung bleibt erhalten. Anzeigename und normalisierte Form werden beide gespeichert.
- **Koordinaten:** Breite −90…90 (sonst Fehler), Länge wird auf −180…<180 gefaltet. Beide als Text mit genau sechs Nachkommastellen (`toFixed(6)`, «-0.000000» → «0.000000»). Diese Texte gehen in S0 ein; `lat`/`lon` als Zahl werden daneben gespeichert.
- **Zeit:** `new Date().toISOString()` genau einmal, vor jeder Netz- oder Dateioperation. Muss dem Muster `YYYY-MM-DDTHH:MM:SS.mmmZ` entsprechen. Zeitquelle: Serveruhr (Node) oder Gerätezeit (Browser); steht im Protokoll.

## 2. Kanonische Serialisierung

An RFC 8785 (JCS) angelehnt: Objektschlüssel nach UTF-16-Codeeinheiten sortiert, keine Leerzeichen, Zeichenketten als JSON-Strings, Zahlen in ECMAScript-Darstellung (nur endliche Zahlen, −0 wird 0), `null` explizit. `undefined` ist ein Fehler, damit fehlende Werte nie still verschwinden.

## 3. Startwerte

```
S0 = SHA-256( kanonisch({ algorithm:"konstellation/1", stage:"S0", name, lat:"47.376900", lon:"8.541700", query_time_utc }) )
S1 = SHA-256( kanonisch({ algorithm:"konstellation/1", stage:"S1", s0:S0, weather:W, astro:A }) )
```

`W` (verwendeter Wetterdatensatz, nur wissenschaftliche Inhalte): `source`, `data_kind`, `data_time_utc`, `provided_lat`, `provided_lon`, `location_id` (Archiv), `values` (sechs Werte, fehlend = null), `units`.
`A` (verwendeter Katalogeintrag): `catalog`, `id`, `record` (alle gespeicherten Katalogfelder).

Nicht in S1: Abrufzeitpunkt, Antwortlatenz, Rohantwort, Rückfallebene, Reihenfolge der Abfragen, Cache-Zeiten, jev-Antworten. Der Test «Reihenfolge/Geschwindigkeit der Antworten und Abrufzeit beeinflussen S1 nicht» prüft das.

## 4. Ziehung eines Index

Für Strom `(seed, label)` und Menge der Grösse `n`:

```
k = 0, 1, 2, …
u = BigInt( erste 16 Hexzeichen von SHA-256( seed + "|" + label + "|" + k ) )   // 64 Bit
akzeptiert, wenn u < floor(2^64 / n) · n;  Index = u mod n;  sonst k+1
```

Verwerfungsverfahren ohne Modulo-Verzerrung; Zähler `k` steht im Protokoll. Ströme: `astro` aus S0; `image`, `text-work`, `text-passage` aus S1.

Mengen sind die nach `id` sortierten `items` des jeweiligen Manifests (UTF-16-Reihenfolge, von `publishManifest` erzwungen). Die Manifestversion ist `SHA-256(kanonisch(items))`.

## 5. Reihenfolge im Ablauf

1. Zeit erfassen, Eingabe normalisieren, Manifeste laden (Versionen binden).
2. S0.
3. Stufe A: Wetter beschaffen (Live → Cache → Archiv) und Astronomie ziehen – unabhängig, Reihenfolge ohne Einfluss.
4. S1.
5. Stufe B: Bild und Werk zuerst online (`online/1`, unten), bei Ausfall je einzeln aus dem Bestand (mit Ersatzregel: Datei beschädigt / Stellen-Datei fehlt); dann die Stelle.
6. Protokoll schreiben.

### Wetter-Rückfall

- **Live:** Open-Meteo `current` (Temperatur, Wind, Richtung, Druck, Bewölkung, Niederschlag; `cell_selection=nearest`, UTC). Gesamtbudget 5 s, höchstens 2 Versuche; nach 429 (Retry-After beachtet, mind. 60 s), HTTP 4xx oder unerwarteter Antwort keine Wiederholung; nach 3 Verbindungsfehlern in Folge wird der Anbieter 5 Minuten übersprungen. Angefragte und gelieferte Koordinaten werden getrennt gespeichert.
- **Cache:** Treffer, wenn gleiche Koordinaten (2 Nachkommastellen) und Datenzeit höchstens 3 h vor dem Abfragezeitpunkt.
- **Archiv** (`weather-archive/1`): Ort mit kleinster Grosskreisdistanz; darin der Datensatz mit kleinster zyklischer Differenz im Tag des Jahres, dann der UTC-Stunde, dann der jüngste, dann die kleinere id. Fundort, Datenzeit und Entfernung werden angezeigt; Hinweis «nicht das aktuelle Wetter am gewählten Ort».

### Textstellen (`passages/1`)

Nur `<body>`; `<head>`, `<note>`, `<lg>` (Verse) ausgeschlossen. Einheit ist der TEI-Absatz. Ausschluss von Inhaltsverzeichnis-/Verzeichniszeilen, zahlenlastigen Absätzen und Lizenz-/URL-Vermerken (protokolliert pro Werk unter `excluded`). Absätze 80–180 Wörter = eine Stelle; kürzere aufeinanderfolgende Absätze desselben Kapitels werden bis mindestens 80 (höchstens 180) zusammengefasst; längere Absätze an Satzgrenzen in 80–180-Wörter-Stücke geteilt (Teil x/y). Reste unter 40 Wörtern entfallen. Fundstelle: Kapitelnummer, Kapitelüberschrift(en), Absatznummern innerhalb des Kapitels, Teil.

### Online zuerst (`online/1`)

Standardmässig werden Bild und Werk nicht aus dem mitgelieferten Bestand, sondern direkt aus grossen offenen Datenbanken gezogen; der Bestand ist nur Rückfall. Die Ziehung bleibt dieselbe Mathematik:

1. Jeder Anbieter meldet zu Beginn die Grösse seines **Auswahlraums** zum Abfragezeitpunkt samt Abrufzeit: Met Museum = Liste aller Objekt-IDs (≈ 503 000); Art Institute of Chicago = ID-Raum 1 … höchste Werk-ID (≈ 288 000, davon ≈ 133 000 belegt); Project Gutenberg = Werkliste der gewählten Sprache(n) aus dem mitgelieferten Katalogindex (`pg_catalog.csv`, Deutsch ≈ 2 455) oder bei «alle Sprachen» der ID-Raum 1 … höchste ID (≈ 79 900).
2. Die Räume werden in fester Reihenfolge (Anbieter-ID alphabetisch) zu einem **Gesamtraum** n = Σ nᵢ aneinandergereiht. Index = uniformIndex(S1, `image-online`, n) bzw. uniformIndex(S1, `text-online`, n). Der Index fällt in den Raum genau eines Anbieters (Gewichtung automatisch proportional zur Grösse) und wird dort aufgelöst (ID → Metadaten → Datei).
3. Ein Treffer gilt nur, wenn der Anbieter die Freigabe **maschinenlesbar** bestätigt (`isPublicDomain=true`, `is_public_domain=true`, `dcterms:rights = «Public domain in the USA.»` und Typ `Text`) und die Datei bzw. der Volltext ladbar und formal gültig ist (JPEG/PNG vollständig; Gutenberg-Markierungen vorhanden, mindestens 20 Stellen). Alles andere – Lücken im ID-Raum, nicht freigegebene Objekte, bildlose Objekte, fremde Sprache, defekte Dateien, HTTP-Fehler – wird **verworfen und ersetzt**: `image-online#ersatz<i>` bzw. `text-online#ersatz<i>` über denselben Gesamtraum. Jeder Versuch steht mit Anbieter, Index, ID, Ergebnis und Dauer im Protokoll.
4. Zeitbudget (Standard 12 s) und Versuche (Standard 12) sind endlich; danach kommt der betreffende Fund aus dem Bestand (`image` bzw. `text-work` wie bisher). Bild und Text fallen unabhängig voneinander zurück.
5. Die Stelle wird wie beim Bestand mit uniformIndex(S1, `text-passage`, Anzahl Stellen des gezogenen Werks) gezogen; für Gutenberg-Volltexte gilt die Regel `passages-plain/1` (Absätze durch Leerzeilen; Überschriften = Abschnitte; Vers erkannt, Zeilenstruktur erhalten; Längenregel wie `passages/1`).
6. Die Auswahlräume sind **nicht eingefroren** – die Datenbanken wachsen. Eine Online-Ziehung ist über das Protokoll (ID, URL, Prüfsumme der Bilddatei, Wortlaut-Prüfsumme) wiederholbar, aber nicht gegen einen späteren Datenbankstand neu berechenbar; `verifyRecord` meldet das als Hinweis (`notes`), nicht als Fehler.

Rechte je Online-Fund (`rights`, `rights_class`, `rights_evidence`): Met und AIC → `cc0` mit dem geprüften API-Feld; Gutenberg → `public-domain-70pma`, wenn alle Urheber:innen laut RDF-Todesjahr seit mehr als 70 Jahren tot sind (Schutzfrist CH/EU abgelaufen), sonst `public-domain-usa` (nur in den USA belegt, ausserhalb unter Vorbehalt). Das ist eine Einordnung nach den Metadaten der Anbieter, keine Rechtsgarantie.

## 6. Protokoll (`konstellation-record/1`)

| Feld | Inhalt |
|---|---|
| `id` | Zeitstempel + erste 8 Hexzeichen von S1 |
| `culture.image_online`, `culture.text_online` | Online-Ziehung: Auswahlräume (Anbieter, Grösse, Abrufzeit), Gesamtgrösse, alle Versuche mit Ergebnis, Dauer; bei Rückfall Fehlergrund |
| `seeds.draws.image_source`, `text_source` | `online` oder `local` |
| `time` | `query_time_utc`, Zeitquelle |
| `input` | Anzeigename, normalisierter Name, Normalisierungsregel, lat/lon (Zahl und Text), Ortsbeschriftung und deren Quelle, `online_first`, `text_languages` |
| `seeds` | S0 und S1 je mit `hex` und `canonical_input`; `draws` für astro, image (Liste inkl. Ersatz), text_work (Liste), text_passage |
| `science.weather` | Ebene, Quelle, Datenart, Datenzeit, Abrufzeit, angefragte/gelieferte Koordinaten, Entfernung, Werte mit Einheiten, Hinweise, Quell-URL, Rohantwort bzw. Rohdatenauszug, `used_for_seed` |
| `science.astro` | id, Katalog, Datensatz, Einheiten, Quell-URL, Katalogabrufdatum, Hinweis, `used_for_seed` |
| `culture.image` | Manifesteintrag: Titel, Urheber:in, Datierung, Technik, Quelle, Quell-URL, Rechte und Beleg, Datei, SHA-256, Masse, Abrufdatum, Rohmetadaten-Datei |
| `culture.text` | Werk (Autor:in, Titel, Erstausgabe, Quelle, TextGrid-URI, Rechte, Namensnennung, TEI-Datei/Prüfsumme, Stellen-Datei/Prüfsumme), Stelle (Nummer, Wortlaut, Wörter, Kapitel, Überschriften, Absätze, Teil, SHA-256), Stellenregel |
| `catalogs` | Manifestversionen und Grössen (inkl. Wetterarchiv bei Archivfund) |
| `rules` | Regeltexte in Kurzform |
| `technical_log` | Schritte mit Ergebnis, Dauer, Fehlern, Ersatzentscheidungen (ohne Einfluss auf S1) |

Keine Zugangstokens in Protokollen oder Exporten (es gibt im Durchlauf keine).
