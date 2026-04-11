# Seafile for Thunderbird

Thunderbird WebExtension (Manifest V3) that integrates Seafile as a CloudFile provider.
Built by datamate GmbH. Apache 2.0 license.

## Quick Reference

- **Thunderbird** >= 128, **Seafile Server** >= 10.0
- Vanilla JavaScript (ES2020+), no build tools, no dependencies, no TypeScript
- Extension ID: `seafile-filelink@datamate.org`

## Project Structure

```
manifest.json              # WebExtension manifest (Manifest V3)
background.js              # CloudFile event handlers + message router
shared.css                 # Shared styles + CSS custom properties (imported by all HTML files)
api/seafile.js             # Seafile REST API client (SeafileAPI class)
management/                # Account settings page (tabbed: Connection, FileLink, Share Links, Save Attachments)
insert-link/               # Compose toolbar popup: browse Seafile files, insert share links
save-attachments/          # Message display toolbar popup: save received attachments to Seafile
icons/                     # PNG icons + file-icons.js (shared SVG icons for file types + status)
_locales/{en,de,fr,es,pt_BR,ru,zh_CN}/  # i18n translations (WebExtension format)
dev/docker-compose.yml     # Local Seafile instance for development
```

## Architecture

- **background.js** is the central hub: handles CloudFile events and routes `runtime.sendMessage` calls from popups
- **api/seafile.js** contains the `SeafileAPI` class — all Seafile REST API interaction goes through this
- **Popups** (insert-link, save-attachments) and **management** page communicate with background.js via `browser.runtime.sendMessage()`
- **State**: persistent config in `browser.storage.local`, session state in globals, upload tracking in Maps
- **Multi-account**: each account stored under its own `accountId_*` keys

## Build & Development

```bash
# Package as .xpi
zip -r seafile-thunderbird.xpi manifest.json background.js shared.css api/ management/ \
  insert-link/ save-attachments/ icons/ _locales/ LICENSE PRIVACY.md

# Load for development
# Thunderbird → Add-ons & Themes → gear → Debug Add-ons → Load Temporary Add-on → select manifest.json

# Local Seafile for testing
cd dev && cp .env.example .env && docker compose up -d
# → http://127.0.0.1:8080
```

There is no linter, formatter, test suite, or CI pipeline.

## Code Conventions

- **Indentation**: 2 spaces
- **Semicolons**: always
- **Quotes**: double quotes preferred
- **Naming**: camelCase for functions/variables, PascalCase for classes, kebab-case for HTML element IDs
- **JSDoc**: all functions have JSDoc comments with @param/@returns
- **Security**: all user input escaped via `escapeHtml()` before DOM insertion — never use innerHTML with unescaped data
- **Error handling**: try-catch with descriptive messages, auto re-authentication on 401 via `withReAuth()`
- **No modules**: scripts are loaded via manifest `background.scripts` or HTML `<script>` tags, not ES modules

## Design & CSS

**No CSS framework** — no Tailwind, no Bootstrap. All styles are pure custom CSS.

**Shared styles** live in `shared.css` (project root), imported by all three HTML files via `<link rel="stylesheet" href="../shared.css">`. Each HTML file keeps only its page-specific styles in an inline `<style>` tag.

**CSS Custom Properties** are defined in `:root` in `shared.css`. Always use variables for colors, font sizes, border radius, etc. — never hardcode values that are already defined as variables. Key variable groups:
- `--color-primary`, `--color-danger` — action colors
- `--color-text`, `--color-text-secondary`, `--color-text-hint`, `--color-text-disabled` — text hierarchy
- `--color-border`, `--color-border-light`, `--color-border-lighter`, `--color-border-subtle` — border hierarchy
- `--color-bg-input`, `--color-bg-button`, `--color-bg-highlight` — backgrounds
- `--color-success-*`, `--color-error-*`, `--color-info-*` — status colors
- `--font-size-base` (13px), `--font-size-small` (12px), `--font-size-hint` (11px) — typography
- `--radius`, `--focus-shadow`, `--select-arrow` — misc

**Layout**: Flexbox only (no CSS Grid). `box-sizing: border-box` on all elements.

**Typography**: System font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`), base `13px`, labels `font-weight: 600` (management only).

**Class naming**: component-based with modifier pattern (e.g. `.status.success`, `.folder-picker.open`, `.tab.active`). Data attributes for state (`data-tab`, `data-empty`).

**Custom form controls**: `select` elements use `appearance: none` with custom SVG background arrow (stored in `--select-arrow`). Focus states use primary border + `var(--focus-shadow)`.

## i18n

- Translation files in `_locales/{lang}/messages.json` using WebExtension i18n format
- HTML uses `data-i18n`, `data-i18n-placeholder`, `data-i18n-title` attributes for automatic translation via `applyI18n()`
- 7 languages: English (primary), German, French, Spanish, Portuguese (BR), Russian, Chinese (Simplified)
- When adding user-visible strings, add keys to all language files

## Message Passing API

Popups communicate with background.js via `browser.runtime.sendMessage({action, ...data})`. Available actions:

### Authentication & Accounts
| Action | Input | Returns |
|--------|-------|---------|
| `getToken` | serverUrl, username, password, otp? | {token} |
| `startSSO` | serverUrl | {ssoToken} or {ssoUnavailable} |
| `checkSSOStatus` | serverUrl, ssoToken | {status, username, apiToken} |
| `getAccountInfo` | serverUrl, apiToken | account info object |
| `getAllConfiguredAccounts` | — | array of {accountId, serverUrl, username, displayName} |
| `getAccountConfig` | accountId? | account config object or null |

### Libraries & Files
| Action | Input | Returns |
|--------|-------|---------|
| `listRepos` | serverUrl, apiToken or accountId | array of repos |
| `listDir` | path, repoId, accountId, includeFiles? | array of entries |
| `checkExistingLink` | repoId, path, accountId | {links} |
| `createFileLink` | repoId, path, password?, expireDays?, accountId | share link object |
| `deleteShareLink` | linkToken, accountId | {success: true} |

### Email Integration
| Action | Input | Returns |
|--------|-------|---------|
| `getDisplayedMessage` | tabId | {messageId} |
| `listAttachments` | messageId | array of attachment objects |
| `uploadAttachment` | messageId, partName, fileName, targetDir, repoId, accountId | {success: true} |
| `insertLinkIntoCompose` | link, fileName, fileSize, password, showPasswordInEmail, expireDays, tabId | {success: true} |

## CloudFile Event Handlers (background.js)

These are registered with Thunderbird's CloudFile API:
- `onFileUpload` — uploads file, creates share link, stores metadata, returns {url, templateInfo}
- `onFileDeleted` — deletes share link + file from metadata
- `onFileRename` — renames file, recreates share link, returns {url}
- `onFileUploadAbort` — aborts active upload via stored AbortController
- `onAccountDeleted` — cleans up stored account data

## SeafileAPI Class (api/seafile.js)

All Seafile server communication goes through this class:

- **Auth**: `getToken()`, `getServerInfo()`, `createSSOLink()`, `checkSSOStatus()`, `getAccountInfo()`
- **Libraries**: `listRepos()`, `listDir()`, `dirExists()`, `createDir()`
- **Files**: `uploadFile()` (with AbortSignal support), `renameFile()`, `deleteFile()`
- **Share links**: `getUploadLink()`, `getShareLinks()`, `createShareLink()`, `deleteShareLink()`

## File Icons (icons/file-icons.js)

Provides `getFileIcon(filename)` which returns an SVG string based on file extension. Maps 50+ extensions to 10 icon types (file, text, image, spreadsheet, presentation, archive, audio, video, code, pdf). Also provides `STATUS_ICONS` (pending, success, error) for upload feedback.

## Key Patterns

- **Re-authentication**: `withReAuth(accountId, config, apiCall)` wraps API calls and retries on 401
- **Password generation**: uses `crypto.getRandomValues()` (WebCrypto API), never Math.random()
- **Upload metadata**: stored per-file via `saveFileMetadata()` / `popFileMetadata()` for later deletion
- **Folder picker**: reusable collapsible tree component loaded via `loadFolderPicker()`
- **Auto-save**: settings changes are debounced (300ms) and saved via `autoSave()` with visual checkmark feedback
