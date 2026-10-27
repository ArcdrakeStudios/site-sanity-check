# Ist meine Website kaputt?

Erkenne häufige Website-Probleme, verstehe die nächsten Schritte und sieh dir maskierte Belege an. Die Oberfläche ist vollständig auf Deutsch und Englisch verfügbar.

[English](README.md) · [Arcdrake](https://arcdrake.com/) · [Weitere Tools](https://tools.arcdrake.com/)

**Version 0.1.0.** [Gehostete Prüfung öffnen](https://tools.arcdrake.com/site-check/?lang=de) oder die lokale Ausgabe auf deinem Computer starten. Eine begrenzte Prüfung öffentlicher Antworten, kein Sicherheitsaudit und keine Sicherheitsgarantie.

## Lokal starten

[Node.js 24 oder neuer](https://nodejs.org/) installieren, den Quellcode herunterladen und entpacken. Im Projektordner ausführen:

```sh
npm start
```

**http://127.0.0.1:43145** öffnen und **Fiktives Beispiel ausprobieren** wählen. Dafür sind weder eine Paketinstallation noch Anfragen an eine echte Website nötig. Mit Strg+C beenden.

Für eine echte Prüfung eine öffentliche Domain oder HTTP(S)-URL eingeben, die du prüfen darfst. Dein Computer kontaktiert die Zielwebsite. Keine privaten/signierten Links, Zugangsdaten oder vertraulichen Kundendaten eingeben.

## Vier Prüfbereiche

- **HTTPS und Erreichbarkeit:** Verbindung, Weiterleitungen, HSTS und beobachtbares Ablaufdatum des Zertifikats.
- **WordPress-Zustand:** mögliche Demo-Inhalte, sichtbare Builder-Shortcodes und Verzeichnislisten. WordPress allein ist kein Fehler.
- **Mögliche Zugangsdaten:** ausgewählte Muster in der Seite und bis zu zwei verlinkten JS/CSS-Dateien derselben Herkunft. Werte werden maskiert, niemals ausprobiert.
- **Platzhalter:** Lorem ipsum und ausgewählte unfertige Vorlagentexte. Beabsichtigte Beispiele können ebenfalls passen.

Jeder Bereich zeigt **Sieht gut aus**, **Handlungsbedarf** oder **Nicht eindeutig**. Hinweise enthalten maskierte URL, Status, Anfragekette, ausgewählte Header und Textauszug. Ein unauffälliges Ergebnis gilt nur für die geprüfte Stichprobe, nicht für die gesamte Website. Angestrebt sind etwa 30 Sekunden; das Netzwerkbudget beträgt 25 Sekunden.

## Gehosteter Datenschutz

Die gehostete Ausgabe sendet deine URL nur auf Anforderung an den isolierten Arcdrake-Scanner. Ziele sehen dessen ausgehende IP. Eingaben und Ergebnisse bleiben im Arbeitsspeicher. Ein täglich wechselnder pseudonymer Client-Schlüssel und der Zielhostname dienen kurzzeitig den Missbrauchsgrenzen. Optionale Aktionssummen brauchen Zustimmung und enthalten niemals URLs oder Ergebnisse. Über **Datenschutzeinstellungen** lässt sich die Zustimmung widerrufen. [Datenschutz](https://tools.arcdrake.com/de/privacy/). Gemeinsame Grenzen: 100 Versuche je UTC-Tag, zehn je Minute und zwei gleichzeitige Prüfungen; zusätzlich gelten Client- und Zielgrenzen. Das fiktive Beispiel verbraucht Kapazität, ruft aber kein Ziel auf.

## Lokaler Datenschutz und gemeinsame Scanner-Grenzen

Der Server ist nur an die Loopback-Adresse deines Computers gebunden. Zielwebsites sehen die Anfragen und deine ausgehende IP-Adresse. DNS nutzt deinen konfigurierten Resolver. Eingaben und Ergebnisse bleiben im Arbeitsspeicher; nur die Sprachwahl wird im Browser gespeichert. Browser, Betriebssystem, DNS-Anbieter und Zielserver können eigene Daten aufbewahren. Keine Konten, Analyse- oder KI-Dienste.

Alle URL-Abfragewerte und erkannte sensible Muster werden in Belegen maskiert. **Kurze oder unbekannte Geheimnisse in URL-Pfaden können dennoch sichtbar bleiben. Keine privaten oder signierten URLs verwenden; Ergebnisse vor dem Teilen prüfen.**

Höchstens sechs GET-Anfragen einschließlich Weiterleitungen, HTTP-Variante und bis zu zwei eigenen Assets; drei Weiterleitungen je Abruf und 256 KiB je Antwort. Nur öffentliche validierte HTTP/HTTPS-Adressen an Standardports. DNS-Antworten und Weiterleitungen werden geprüft, die Zieladresse für die Verbindung festgelegt und TLS-Zertifikate validiert.

Komprimierte Antworten, nicht unterstützte Zeichenkodierungen und per JavaScript erzeugte Inhalte werden nicht untersucht. Schutzseiten, große Antworten oder ausgeschöpfte Budgets können unklare Ergebnisse liefern. Erkennung ist heuristisch; unter anderem können kodierte Texte und Shortcodes mit mehr als 200 Attributzeichen übersehen werden. Kein Crawling, kein Erraten privater Dateien, keine Prüfung von Zugangsdaten, keine Varianten mit/ohne www oder verborgenen Ursprungsservern. Zertifikate beschreiben den antwortenden Server oder das CDN.

`server.mjs` bleibt an Loopback gebunden. Die getrennte gehostete Ausgabe verwendet ein privates Gateway, einen authentifizierten Scanner, dauerhafte Quoten und ein SQLite-basiertes Durable Object auf Cloudflare Workers Free. [Hosting-Architektur](docs/HOSTED.md).

## Entwicklung

```sh
npm ci --ignore-scripts
npx --no-install playwright install chromium
npm test
npm run check
npm run test:browser
```

Unter Linux: `npx --no-install playwright install --with-deps chromium`. Tests verwenden synthetische Daten und lokale HTTP/TLS-Server. Ports 43146 und 43147 freihalten. Browser und Testserver werden geschlossen. Windows/Node 24/Chromium wurden lokal geprüft; die Ubuntu-Konfiguration ist noch kein Nachweis eines erfolgreichen GitHub-CI-Laufs.

Weitere Hinweise auf Englisch: [Beiträge](CONTRIBUTING.md), [private Sicherheitsmeldungen](SECURITY.md), [Architektur](docs/ARCHITECTURE.md), [Drittanbieter](THIRD_PARTY_NOTICES.md). [MIT-Lizenz](LICENSE).

Die gehostete Ausgabe prüft keinen Zertifikatsablauf und keine Zertifikatsketten. Numerische IP-URLs werden nicht unterstützt. Diese Grenzen werden vor der Prüfung und im Ergebnis angezeigt. Kein Container und kein zusätzliches Abonnement erforderlich.
