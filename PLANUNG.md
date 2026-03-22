# Seafile for Thunderbird - Planung

## Projektziel

Thunderbird-Erweiterung (WebExtension), die Seafile als CloudFile-Provider integriert.
Große E-Mail-Anhänge werden automatisch zu Seafile hochgeladen und durch Download-Links ersetzt.

## Phase 1: CloudFile Provider (MVP)

### 1.1 Konfiguration / Account-Setup
- [ ] Server-URL Eingabefeld (z.B. `https://cloud.seafile.com`)
- [ ] Login mit Benutzername + Passwort → API-Token holen (`POST /api2/auth-token/`)
- [ ] Token sicher speichern (Thunderbird storage API)
- [ ] Ziel-Bibliothek auswählen (Dropdown mit verfügbaren Libraries)
- [ ] Optional: Ziel-Unterordner wählen

### 1.2 Datei-Upload beim Senden
- [ ] Upload-Link holen (`GET /api2/repos/{repo_id}/upload-link/`)
- [ ] Datei hochladen (`POST /seafhttp/upload-api/{token}?ret-json=1`, multipart/form-data)
- [ ] Share-Link erstellen (`POST /api/v2.1/share-links/`)
- [ ] Download-Link an Thunderbird CloudFile API zurückgeben

### 1.3 Datei-Verwaltung
- [ ] `deleteFile()` implementieren - Datei auf Seafile löschen wenn Anhang entfernt wird
- [ ] Management-URL → öffnet Seafile-Weboberfläche der Ziel-Bibliothek

### 1.4 Optionale Extras (Phase 1)
- [ ] Passwortschutz für Share-Links
- [ ] Ablaufdatum für Share-Links
- [ ] Größenschwelle konfigurierbar

## Phase 2: Empfangene Anhänge speichern (Zukunft)

### 2.1 Kontextmenü-Integration
- [ ] Rechtsklick auf Anhang → "In Seafile speichern"
- [ ] Bibliothek/Ordner-Auswahl-Dialog

### 2.2 Batch-Speicherung
- [ ] Alle Anhänge einer E-Mail auf einmal speichern
- [ ] Fortschrittsanzeige

## Phase 3: Nice-to-Have (Zukunft)

- [ ] 2FA / OAuth-Support
- [ ] Seafile-Dateibrowser im Plugin
- [ ] Drag & Drop aus Seafile in Compose-Fenster
- [ ] Mehrere Seafile-Accounts

## Technische Architektur

```
seafile-thunderbird/
├── manifest.json              # Thunderbird WebExtension Manifest
├── background.js              # CloudFile API Handler (uploadFile, deleteFile)
├── api/
│   ├── seafile-auth.js        # Token-Management (Login, Token-Speicherung)
│   ├── seafile-upload.js      # Upload-Logik (Upload-Link holen, Datei hochladen)
│   └── seafile-share.js       # Share-Link-Erstellung
├── settings/
│   ├── management.html        # Konfigurationsseite (Server, Login, Bibliothek)
│   └── management.js          # Konfigurationslogik
├── icons/                     # Seafile Icons (16px, 32px, 64px)
├── _locales/
│   ├── de/messages.json       # Deutsche Übersetzung
│   └── en/messages.json       # Englische Übersetzung
└── LICENSE                    # Open Source Lizenz
```

## Seafile API Endpunkte

| Aktion | Methode | Endpunkt |
|--------|---------|----------|
| Auth Token holen | POST | `/api2/auth-token/` |
| Libraries auflisten | GET | `/api/v2.1/repos/` |
| Upload-Link holen | GET | `/api2/repos/{repo_id}/upload-link/` |
| Datei hochladen | POST | `/seafhttp/upload-api/{token}?ret-json=1` |
| Share-Link erstellen | POST | `/api/v2.1/share-links/` |
| Share-Link löschen | DELETE | `/api/v2.1/share-links/{token}/` |
| Datei löschen | DELETE | `/api2/repos/{repo_id}/file/?p={path}` |

## Testumgebung

- Lokales Seafile per Docker für API-Tests
- Thunderbird Developer Edition für Plugin-Entwicklung

## Verteilung

- Open Source auf GitHub
- Veröffentlichung auf addons.thunderbird.net (ATN)
- Zusätzlich .xpi-Download auf eigener Webseite
