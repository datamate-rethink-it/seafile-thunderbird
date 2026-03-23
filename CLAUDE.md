# Seafile Thunderbird Add-on - Project Context

## Project Overview

Thunderbird WebExtension (Manifest V3, TB 128+) that integrates Seafile as a CloudFile provider, attachment saver, and file link inserter. Open source (Apache 2.0), built by datamate (Seafile EU partner).

- **Phase 1 (done):** CloudFile provider - upload attachments to Seafile, insert download links
- **Phase 2 (done):** Save received email attachments to Seafile via messageDisplayAction popup
- **Phase 3 (done):** Browse Seafile files and insert as links (composeAction)
- **Phase 4 (in progress):** Publish on ATN

## Current Status (2026-03-23)

All three phases implemented, tested, and security-audited. Version 1.2.1. xpi packaged.

**Completed features:**
- CloudFile Provider: Upload, Share-Link, Rename, Delete, Abort, Reuse uploads
- Share-Link options: Password protection, expiration, password generator, show/hide password in email
- Insert Seafile Link: composeAction popup, file browser with SVG type icons, detail view with per-link options, existing link detection (reuse/recreate), rich email template, cursor-position insert via scripting.executeScript
- Save Attachments: messageDisplayAction popup, attachment list with synced select-all, collapsible folder picker, duplicate handling (rename/overwrite configurable)
- Authentication: Username/password, 2FA (X-SEAFILE-OTP header), SSO (client-sso-via-local-browser polling flow)
- Settings: 3 tabs (Connection/Share/Save), auto-save with visual feedback, collapsible folder pickers, library refresh on tab switch, connected state with disconnect button
- Security: HTML escaping (XSS prevention), crypto.getRandomValues() for passwords, no plaintext password storage, HTTPS warning, generic error messages
- i18n: EN, DE, FR, ZH_CN, ES, RU, PT_BR
- Privacy Policy (PRIVACY.md)
- Screenshots in docs/screenshots/

**Tested against:** seafile-demo.de and local Docker Seafile (127.0.0.1:8080)

**GitHub:** https://github.com/christophdb/seafile-thunderbird (currently private)

## Next Steps (TODO before publishing)

### Before making repo public:
1. **Remove CLAUDE.md and PLANUNG.md** from the public repo (internal notes). Either delete or add to .gitignore.
2. **Check dev/.env.example** — ensure no real credentials
3. **Git history: password exposure** — In early commits, the Seafile password was stored in plaintext in management.js config objects (before the security fix in v1.2.1 that removed password storage). The password is visible in the git history. Options:
   - (a) Change the password on the Seafile server (simplest)
   - (b) Rewrite git history with git filter-branch (complex, changes all commit hashes)
   - Recommendation: Do (a) at minimum. Consider (b) only if the password is sensitive beyond this test setup.

### Publishing steps:
4. **Make repo public** on GitHub
5. **Create GitHub Release** — Tag v1.2.1, attach .xpi as release asset
6. **Submit to ATN** (addons.thunderbird.net):
   - Create account
   - Upload .xpi
   - Provide source code link (GitHub repo)
   - Enter permission justifications (see PRIVACY.md for details)
   - Provide Privacy Policy URL (link to PRIVACY.md on GitHub)
   - Wait for review

### ATN permission justifications needed:
- `<all_urls>`: Seafile server URL is user-configurable, not known at install time
- `scripting`: Used for document.execCommand("insertHTML") to insert share link at cursor position in compose editor — no alternative API exists in Thunderbird
- `compose`: Read compose body format (HTML/plain text) for the plain-text fallback path
- `notifications`: Show system notifications for errors (e.g. unconfigured account on upload attempt)
- `messagesRead`: Access email attachments for the "Save to Seafile" feature
- `storage`: Persist account configuration and settings

## Technical Notes

- Upload-Link needs `?p=/path` parameter, otherwise token only valid for root
- Share-Links for files use `/f/` path (not `/d/`)
- `host_permissions: ["<all_urls>"]` required for fetch; manifest changes require Remove+Reload (not just Reload)
- CloudFile API has no progress callback (open TB bug since 2012)
- `download_expiry_date.timestamp` in templateInfo for expiration display
- `document.execCommand("insertHTML")` is deprecated but is the only way to insert at cursor in TB compose. The compose API (setComposeDetails) replaces the entire body. No browser vendor plans to remove execCommand. See detailed research in commit history.
- SSO uses Seafile's client-sso-via-local-browser flow: POST /api2/client-sso-link/ → open browser → poll GET /api2/client-sso-link/<token>/ every 3s
- 2FA uses X-SEAFILE-OTP header on POST /api2/auth-token/
- Folder picker close-on-outside-click works within the iframe but not for clicks on Thunderbird's surrounding UI (iframe boundary limitation)
- Passwords are NOT stored — only API token persists. Re-auth always prompts user.

## UI/UX Preferences

- Folder picker instead of text input for path selection (prevents typos)
- Collapsible folder pickers (click to open, click outside to close)
- Auto-save instead of manual save button
- Visual feedback: green checkmark SVG on label after save
- Logical grouping in 3 tabs: Connection, Share Attachments, Save Attachments
- Connected state: shows server, user, auth method + red disconnect button
- Input validation at input time, not at save time
- File type icons: Lucide-style SVGs with color accents, shared via icons/file-icons.js
- Status icons: SVG (pending/success/error) instead of emoji
- Password generator: crypto.getRandomValues(), alphanumeric at start/end for double-click selection

## Communication

- Language: German preferred
- User can program (JS/TS experience)
- Welcomes being challenged on ideas when appropriate
- Prefers terse responses, no trailing summaries
- Prefers pragmatic solutions over over-engineering
