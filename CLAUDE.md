# Seafile Thunderbird Plugin - Project Context

## Project Overview

Thunderbird WebExtension (Manifest V3, TB 128+) that integrates Seafile as a CloudFile provider and attachment saver. Open source (Apache 2.0), built by datamate (Seafile EU partner).

- **Phase 1 (done):** CloudFile provider - upload attachments to Seafile, insert download links
- **Phase 2 (done):** Save received email attachments to Seafile via messageDisplayAction popup
- **Phase 3 (open):** Browse Seafile files and insert as links (composeAction), publish on ATN

## Current Status (2026-03-22)

Phase 1+2 implemented and tested. .xpi packaged for test distribution.

**Completed features:**
- CloudFile Provider: Upload, Share-Link, Rename, Delete, Abort
- Share-Link options: Password protection, expiration (shown in email preview)
- Save Attachments: messageDisplayAction button, popup with attachment list, library/folder selection
- Settings: Tabs (Sharing/Saving), folder picker, encrypted libraries filtered
- UX: Connect button with status feedback, Enter-submit, input validation, i18n (EN/DE)
- Seafile logo icons (generated from official SVG)

**Tested against:** seafile-demo.de and local Docker Seafile (127.0.0.1:8080)

**GitHub:** https://github.com/christophdb/seafile-thunderbird (private, will go public later)

## Technical Notes

- Upload-Link needs `?p=/path` parameter, otherwise token only valid for root
- Share-Links for files use `/f/` path (not `/d/`)
- `host_permissions: ["<all_urls>"]` required for fetch; manifest changes require Remove+Reload (not just Reload)
- CloudFile API has no progress callback (open TB bug since 2012)
- `download_expiry_date.timestamp` in templateInfo for expiration display

## UI/UX Preferences

- Folder picker instead of text input for path selection (prevents typos)
- Logical grouping in UI (Sharing and Saving are separate concepts)
- Input validation at input time, not at save time
- Remove redundant headings when context is clear from tabs
- Auto-create of folders only makes sense with dynamic paths (e.g. date placeholders)

## Communication

- Language: German preferred
- User can program (JS/TS experience)
- Welcomes being challenged on ideas when appropriate
