<?php
// Durchreicher für die statische Fassung auf einem Webspace. Project Gutenberg, das NASA Exoplanet Archive (TAP), das ESA-Gaia-Archiv
// (TAP) und die JPL Small-Body Database senden keine CORS-Kopfzeilen, die Cleveland-Open-Access-API nicht zuverlässig; deshalb holt dieses
// Skript einzelne GET-Antworten dieser fünf Hosts (feste URL-Muster, höchstens 6 MB). Keine Speicherung, keine Weitergabe von Nutzerdaten (nur die URL geht an den Anbieter).
$u = isset($_GET['u']) ? $_GET['u'] : '';
$muster = [
  '#^https://www\.gutenberg\.org/(cache/epub/\d+/pg\d+\.(rdf|txt)|ebooks/\d+\.txt\.utf-8|files/\d+/\d+(-\d+)?\.txt)$#',
  '#^https://exoplanetarchive\.ipac\.caltech\.edu/TAP/sync\?query=[A-Za-z0-9%._~!,+*=<>\'()-]+&format=json$#',
  '#^https://gea\.esac\.esa\.int/tap-server/tap/sync\?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY=[A-Za-z0-9%._~!,+*=<>\'()-]+$#',
  '#^https://openaccess-api\.clevelandart\.org/api/artworks/\?cc0=1&has_image=1&limit=1&(fields=id|skip=\d+&fields=[a-z_,]+)$#',
  '#^https://ssd-api\.jpl\.nasa\.gov/(sbdb_query\.api\?fields=spkid&sb-ns=n&limit=1|sbdb\.api\?sstr=\d+&phys-par=1&discovery=1)$#',
];
$ok = false; foreach ($muster as $m) { if (preg_match($m, $u)) { $ok = true; break; } }
if (!$ok) { http_response_code(400); header('Content-Type: text/plain; charset=utf-8'); echo 'nur Gutenberg-Metadaten/-Volltexte und Abfragen an Cleveland Open Access, NASA TAP, Gaia TAP und JPL SBDB'; exit; }
$ch = curl_init($u);
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false, CURLOPT_TIMEOUT => 20, CURLOPT_CONNECTTIMEOUT => 6, CURLOPT_USERAGENT => 'KONSTELLATION/0.3 (ornament.cloud; https://github.com/hansnoed-ui/konstellation)', CURLOPT_MAXFILESIZE => 6000000]);
$body = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $type = curl_getinfo($ch, CURLINFO_CONTENT_TYPE); curl_close($ch);
if ($body === false) { http_response_code(502); header('Content-Type: text/plain; charset=utf-8'); echo 'Anbieter nicht erreichbar'; exit; }
http_response_code($code);
if (strpos($u, 'gutenberg.org') !== false) { header('Content-Type: ' . (substr($u, -4) === '.rdf' ? 'application/rdf+xml; charset=utf-8' : 'text/plain; charset=utf-8')); header('Cache-Control: public, max-age=86400'); }
else { header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store'); }
header('X-Content-Type-Options: nosniff');
echo $body;
