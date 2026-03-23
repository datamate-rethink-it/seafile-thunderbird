# Seafile for Thunderbird

A Thunderbird extension that integrates [Seafile](https://www.seafile.com) as a CloudFile provider. Large email attachments are automatically uploaded to your Seafile server and replaced with download links. Received attachments can be saved directly to Seafile. Existing files on Seafile can be inserted as share links into emails.

## Features

### Share attachments (outgoing)

- **CloudFile integration** — Thunderbird automatically offers to upload attachments exceeding the size threshold (default: 5 MB)
- **Share link creation** — each uploaded file gets a Seafile download link inserted into the email
- **Password protection** — optionally protect share links with a password
- **Link expiration** — set an automatic expiry (in days) for share links
- **File rename support** — renaming an attachment after upload renames the file on Seafile and updates the share link
- **Upload abort** — cancel in-progress uploads from Thunderbird's UI
- **Clean deletion** — removing a cloud attachment deletes both the share link and the file on Seafile
- **Reuse uploads** — previously uploaded files can be reinserted directly from the Filelink menu
- **Existing link handling** — if a share link already exists for a file, it is automatically replaced

### Insert Seafile links (compose)

- **Browse & insert** — browse your Seafile libraries and folders directly in the compose window
- **File selection** — click a file to select it, then configure link options before inserting
- **File type icons** — color-coded SVG icons for common file types (PDF, images, spreadsheets, archives, audio, video, code, etc.)
- **Password & expiration** — set password and expiration per link, or use defaults from settings
- **Password generator** — generate secure 12-character passwords with one click
- **Show password in email** — choose to display the password in the email or show a "sent separately" hint (configurable per link, default in settings)
- **Existing link detection** — reuse existing share links or delete and recreate
- **Rich email template** — inserted links match the CloudFile template style (file name, size, link URL, Seafile logo)
- **Cursor position insert** — links are inserted at the cursor position without modifying existing email content

### Save attachments (incoming)

- **Save attachments to Seafile** — click the Seafile button in the message header to save received attachments
- **Library & folder selection** — choose target library and navigate folders with a collapsible folder picker
- **Batch saving** — select multiple attachments at once, with synced "Select all" checkbox
- **Per-file status** — visual SVG feedback for each file during upload
- **Duplicate handling** — configurable: rename automatically (default) or overwrite existing files

### Authentication

- **Username & password** — standard Seafile login
- **Two-factor authentication (2FA)** — optional TOTP code field for accounts with 2FA enabled
- **Single Sign-On (SSO)** — login via browser using SAML, OAuth, Keycloak, or any SSO method configured on the server (requires `CLIENT_SSO_VIA_LOCAL_BROWSER = True` in seahub_settings.py)
- **Auto re-authentication** — expired API tokens are refreshed automatically (username/password login)
- **Connection status** — clearly shows server, username, and authentication method (SSO or password)
- **Disconnect** — one-click disconnect with automatic cleanup

### Settings & UI

- **Tabbed settings** — Connection, Share Attachments, Save Attachments
- **Auto-save** — all configuration changes are saved immediately with visual feedback (green checkmark)
- **Collapsible folder picker** — browse and select folders visually (click to expand, click outside to close)
- **Library refresh** — library list refreshes automatically when switching tabs
- **Encrypted library filtering** — encrypted libraries are excluded automatically
- **Error notifications** — system notifications when actions fail (e.g. unconfigured account)
- **Localization** — English, German, French, Chinese, Spanish, Russian, Portuguese (BR)

## Requirements

- Thunderbird 128 or later
- A Seafile server (any version with stable API v2/v2.1)

## Installation

### From .xpi

Install the `.xpi` file via **Add-ons & Themes → gear icon → Install Add-on From File**.

### From source (development)

1. Open Thunderbird
2. Go to **Add-ons & Themes** (`Ctrl+Shift+A`)
3. Click the gear icon → **Debug Add-ons**
4. Click **Load Temporary Add-on...**
5. Select the `manifest.json` file from this repository

## Configuration

After installation, go to **Settings → Composition → Attachments** and click **Add Seafile**.

1. Enter your **Seafile server URL** (e.g. `https://cloud.seafile.com`)
2. Log in using one of two methods:
   - **Username/password**: Enter credentials and optionally a **2FA code**, then click **Connect**
   - **SSO**: Click **Login via SSO** — a browser window opens for authentication. If SSO is not enabled on the server, a hint with the required server configuration is shown.
3. **Share Attachments tab**: Select target library and upload folder, optionally set password and link expiration
4. **Save Attachments tab**: Select default library and folder for saving received attachments

All settings are saved automatically.

## Usage

### Sharing attachments

When composing an email, add an attachment as usual. If the file exceeds the size threshold, Thunderbird will offer to upload it via Seafile. You can also right-click any attachment and select **Convert to → Seafile**.

The recipient sees a download link in the email body with file name, size, and (if configured) password and expiration info.

### Inserting Seafile links

When composing an email, click the **Insert Seafile Link** button in the compose toolbar. Browse your Seafile libraries, select a file, optionally set password and expiration, and click **Insert link into email**. The link is inserted with a styled template showing file name, size, and download URL.

### Saving attachments

When viewing an email with attachments, click the **Save to Seafile** button in the message header toolbar. A popup lets you select which attachments to save, choose a library and folder, and upload them to Seafile.

## Development

A Docker Compose setup is included for local testing with Seafile:

```bash
cd dev
cp .env.example .env  # adjust credentials if needed
docker compose up -d
```

The local Seafile instance will be available at `http://127.0.0.1:8080`.

## Project Structure

```
├── manifest.json              # WebExtension manifest (Manifest V3)
├── background.js              # CloudFile event handlers + message router
├── api/
│   └── seafile.js             # Seafile API client
├── management/
│   ├── management.html        # Account configuration page (tabbed)
│   └── management.js          # Configuration logic + folder picker
├── insert-link/
│   ├── popup.html             # Insert Seafile link popup (compose)
│   └── popup.js               # File browser + link insertion logic
├── save-attachments/
│   ├── popup.html             # Save attachments popup
│   └── popup.js               # Popup logic (attachment list, folder nav)
├── icons/
│   ├── file-icons.js          # Shared SVG file type + status icons
│   └── *.png, *.svg           # Seafile logo icons
├── _locales/                  # Translations (en, de, fr, zh_CN, es, ru, pt_BR)
├── dev/
│   └── docker-compose.yml     # Local Seafile for development
└── LICENSE                    # Apache 2.0
```

## SSO Configuration

To use SSO login, the Seafile server admin must enable client SSO in `seahub_settings.py`:

```python
CLIENT_SSO_VIA_LOCAL_BROWSER = True
```

This allows desktop clients and this extension to authenticate via the system browser. The setting is supported by Seafile Server 7.1+ and works with any SSO method (SAML, OAuth, Keycloak, Shibboleth, etc.).

## Roadmap

- [ ] Publish on [addons.thunderbird.net](https://addons.thunderbird.net)

## License

[Apache License 2.0](LICENSE)
