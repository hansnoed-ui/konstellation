<?php
// Textproxy für die statische Fassung auf einem Webspace: Project Gutenberg sendet keine CORS-Kopfzeilen, deshalb
// holt dieser Durchreicher einzelne Metadaten- und Volltextdateien (nur www.gutenberg.org, nur GET, höchstens 6 MB).
// Keine Speicherung, keine Weitergabe von Nutzerdaten (es werden nur die URL-Parameter an gutenberg.org gesendet).
$u = isset($_GET['u']) ? $_GET['u'] : '';
if (!preg_match('#^https://www\.gutenberg\.org/(cache/epub/\d+/pg\d+\.(rdf|txt)|ebooks/\d+\.txt\.utf-8|files/\d+/\d+(-\d+)?\.txt)$#', $u)) { http_response_code(400); header('Content-Type: text/plain; charset=utf-8'); echo 'nur Gutenberg-Metadaten und -Volltexte'; exit; }
$ch = curl_init($u);
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false, CURLOPT_TIMEOUT => 20, CURLOPT_CONNECTTIMEOUT => 6, CURLOPT_USERAGENT => 'KONSTELLATION/0.2 (ornament.cloud; https://github.com/hansnoed-ui/konstellation)', CURLOPT_MAXFILESIZE => 6000000]);
$body = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $type = curl_getinfo($ch, CURLINFO_CONTENT_TYPE); curl_close($ch);
if ($body === false) { http_response_code(502); header('Content-Type: text/plain; charset=utf-8'); echo 'Anbieter nicht erreichbar'; exit; }
http_response_code($code);
header('Content-Type: ' . (substr($u, -4) === '.rdf' ? 'application/rdf+xml; charset=utf-8' : 'text/plain; charset=utf-8'));
header('Cache-Control: public, max-age=86400');
header('X-Content-Type-Options: nosniff');
echo $body;
