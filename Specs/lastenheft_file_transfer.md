# Lastenheft - Web-Applikation für Dateitransfer

## 1. Projektübersicht
**Projektname:** Web-Applikation für großen Dateitransfer  
**Deployment:** On-Premises Installation  
**Zweck:** Sichere Übertragung großer Dateien mit automatischer E-Mail-Benachrichtigung

## 2. Funktionale Anforderungen

### 2.1 Upload-Funktionalität
- Upload großer Dateien auf den Server (konfigurierbare Maximalgröße)
- Fortsetzbare Uploads mit Fortschrittsanzeige
- Bulk-Upload: Mehrere Dateien gleichzeitig hochladbar
- Automatischer E-Mail-Versand mit Download-Link an einen oder mehrere Empfänger
- Modernes Frontend mit Drag & Drop-Unterstützung aus dem Betriebssystem
- Anpassbares E-Mail-Template mit Bearbeitungsmöglichkeit vor Versand
- Vorschau der E-Mail vor dem Absenden
- E-Mail-Adress-Validierung für Empfänger
- Fehlerbehandlung mit GUI- und E-Mail-Benachrichtigung bei Upload-Fehlern
- Benachrichtigung bei E-Mail-Versand-Fehlern
- Warnung bei 90% Kontingent-Auslastung

### 2.2 Download-Funktionalität
- Einmaliger Download-Link pro Empfänger (One-Time-Use)
- Support für mehrere Empfänger pro Datei
- Automatische Löschung der Datei erst nach Download durch alle Empfänger oder Zeitablauf
- Benachrichtigung des Senders bei erfolgreichem Download

### 2.3 Automatische Dateiverwaltung
- Zeitgesteuerte Löschung hochgeladener Dateien
- Konfigurierbare Löschzeit durch Administrator (Standard: 14 Tage)
- Konfigurierbare Löschzeit für E-Mail-Adressen der Empfänger
- Sofort-Löschung-Funktion für Benutzer und Administratoren
- Konfigurierbare maximale Dateigröße durch Administrator
- Whitelist-basierte Dateiformatbeschränkung (Standard: alle Formate deaktiviert)
- Speicherplatz-Monitoring mit Admin-Benachrichtigung

### 2.4 Benutzerauthentifizierung
- Integration mit Active Directory und OpenLDAP
- Gruppenbasierte Zugriffskontrolle
- Nur bestimmte Benutzergruppen können sich einloggen
- Konfigurierbare Benutzergruppen durch Administrator

### 2.5 Frontend-Funktionen (Benutzer)
- Moderne Benutzeroberfläche (Deutsch als Standardsprache)
- Drag & Drop-Upload
- Übersicht der eigenen hochgeladenen Dateien
- Verschiedene Ansichten und Sortieroptionen für eigene Dateien
- Dateivorschau (Bilder, PDFs, etc.)
- Upload-Fortschrittsanzeige
- Fortsetzbare Uploads

### 2.6 Backend-Funktionen (Administrator)
- Administrative Benutzeroberfläche
- Vollständige Übersicht aller im System befindlichen Dateien
- Sortierung nach: Name, Datum, Größe, Benutzer
- Konfiguration der automatischen Löschzeit (Standard: 14 Tage)
- Konfiguration der E-Mail-Adressen-Löschzeit
- Verwaltung der berechtigten Benutzergruppen
- Einstellung der maximalen Dateigröße
- Konfiguration von Upload-Limits pro Benutzer (täglich/monatlich)
- Verwaltung der Dateiformate-Whitelist
- Konfiguration der E-Mail-Templates
- SMTP-Konfiguration
- SSL/TLS-Zertifikats-Konfiguration
- Datenschutzerklärung-Editor
- Speicherplatz-Monitoring und Benachrichtigungseinstellungen
- Audit-Log-Konfiguration (IP-Adressen, Zeitpunkt, Log-Aufbewahrungsdauer, Username, Empfänger-E-Mail)
- Konfigurierbare Logging-Level (Debug, Info, Warning, Error)
- Nutzungsstatistiken (Downloads, Upload-Volumen, etc.)
- Update-Routine für Software-Updates
- Health-Check-Endpoint-Konfiguration

### 2.8 Datenschutz und Compliance
- DSGVO-konforme Datenverarbeitung
- Konfigurierbare Löschfristen für alle personenbezogenen Daten
- Integrierte Datenschutzerklärung (admin-editierbar)
- Sofort-Löschung-Funktionen
- Umfassendes Audit-Logging
### 2.9 Audit und Logging
- Umfassendes Audit-Log für alle Systemaktivitäten
- Konfigurierbare Log-Parameter: IP-Adressen, Zeitpunkt, Username, Empfänger-E-Mail
- Einstellbare Log-Aufbewahrungsdauer
- Konfigurierbare Logging-Level (Debug, Info, Warning, Error)
- Protokollierung von Upload-, Download- und Admin-Aktivitäten

## 3. Nicht-funktionale Anforderungen

### 3.1 Technologie-Stack
- Backend: Node.js
- Frontend: React
- Datenbank: MySQL (primär) oder MS SQL Server
- Betriebssystem: Windows Server und Linux

### 3.2 Deployment und Installation
- On-Premises Installation
- Automatisches Setup/Installer
- Integrierte Update-Routine
- Reverse Proxy-Kompatibilität (nginx, Apache)

### 3.3 Performance und Kapazitäten
- Support für bis zu 100 gleichzeitige Benutzer
- Lokale Festplattenspeicherung auf dem Server
- Systemanforderungen abhängig von Benutzerzahl (zu spezifizieren)

### 3.4 Benutzerfreundlichkeit
- Modernes, intuitives Frontend
- Drag & Drop-Funktionalität
- Mehrsprachigkeit (Start: Deutsch)
- Dateivorschau-Funktionen
- Fortschrittsanzeigen und fortsetzbare Uploads

### 3.5 Sicherheit
- Active Directory und OpenLDAP-Integration
- Gruppenbasierte Zugriffskontrolle
- Einmalige Download-Links pro Empfänger
- Verschlüsselung während der Datenübertragung
- SSL/TLS-Unterstützung mit konfigurierbaren Zertifikaten
- DSGVO-Konformität
- Umfassendes Audit-Logging
- E-Mail-Adress-Validierung

### 3.6 Monitoring und Wartung
- Health-Check-Endpoint für externes Monitoring
- Speicherplatz-Überwachung
- Konfigurierbare Benachrichtigungen
- Fehlerbehandlung und Recovery-Mechanismen

## 4. Konfigurierbare Parameter
- Maximale Dateigröße
- Automatische Löschzeit für Dateien (Standard: 14 Tage)
- Automatische Löschzeit für E-Mail-Adressen
- Upload-Limits pro Benutzer (täglich/monatlich)
- Dateiformate-Whitelist (Standard: alle deaktiviert)
- Berechtigte Benutzergruppen (AD/LDAP)
- E-Mail-Templates
- SMTP-Konfiguration
- SSL/TLS-Zertifikate
- Logging-Level und Audit-Log-Parameter
- Speicherplatz-Warnungen und Benachrichtigungen
- Datenschutzerklärung

## 5. Wartung und Updates
- Backup erfolgt durch Serveradministrator (nicht Teil der Anwendung)
- Wartungsfenster werden bei Bedarf eingerichtet
- Software-Updates über integrierte Admin-Routine

## 6. Offene Punkte / Zu klären
- Genaue Systemanforderungen basierend auf finaler Benutzerzahl
- Lizenzmodell und Support-Konzept
- Detaillierte Installationsanleitung und Systemvoraussetzungen
- Migrationsstrategie von bestehenden File-Transfer-Lösungen (falls vorhanden)