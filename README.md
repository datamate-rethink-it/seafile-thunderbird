# Seafile for Thunderbird

A Thunderbird extension that integrates [Seafile](https://www.seafile.com) as a CloudFile provider. Large email attachments are automatically uploaded to your Seafile server and replaced with download links. Received attachments can be saved directly to Seafile.

## Features

### Sharing (outgoing)

- **CloudFile integration** — Thunderbird automatically offers to upload attachments exceeding the size threshold (default: 5 MB)
- **Share link creation** — each uploaded file gets a Seafile download link inserted into the email
- **Password protection** — optionally protect share links with a password
- **Link expiration** — set an automatic expiry (in days) for share links
- **File rename support** — renaming an attachment after upload renames the file on Seafile and updates the share link
- **Upload abort** — cancel in-progress uploads from Thunderbird's UI
- **Clean deletion** — removing a cloud attachment deletes both the share link and the file on Seafile

### Saving (incoming)

- **Save attachments to Seafile** — click the Seafile button in the message header to save received attachments
- **Library & folder selection** — choose target library and navigate folders before saving
- **Batch saving** — select multiple attachments at once
- **Per-file status** — visual feedback for each file during upload

### General

- **Auto re-authentication** — expired API tokens are refreshed automatically
- **Folder picker** — browse and select folders visually in settings (no manual path entry)
- **Encrypted library filtering** — encrypted libraries are excluded automatically
- **Tabbed settings** — separate Sharing and Saving configuration
- **Localization** — English and German

## Requirements

- Thunderbird 128 or later
- A Seafile server (any version with stable API v2/v2.1)

## Installation

### From .xpi

Download the latest `.xpi` file from [Releases](https://github.com/christophdb/seafile-thunderbird/releases) and install it via **Add-ons & Themes → gear icon → Install Add-on From File**.

### From source (development)

1. Open Thunderbird
2. Go to **Add-ons & Themes** (`Ctrl+Shift+A`)
3. Click the gear icon → **Debug Add-ons**
4. Click **Load Temporary Add-on...**
5. Select the `manifest.json` file from this repository

## Configuration

After installation, go to **Settings → Composition → Attachments** and click **Add Seafile**.

1. Enter your **Seafile server URL** (e.g. `https://cloud.seafile.com`)
2. Enter your **username/email** and **password**
3. Click **Connect** (or press Enter)
4. **Sharing tab**: Select target library and upload folder, optionally set password and link expiration
5. **Saving tab**: Select default library and folder for saving received attachments
6. Click **Save**

## Usage

### Sharing attachments

When composing an email, add an attachment as usual. If the file exceeds the size threshold, Thunderbird will offer to upload it via Seafile. You can also right-click any attachment and select **Convert to → Seafile**.

The recipient sees a download link in the email body with file name, size, and (if configured) password and expiration info.

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
├── save-attachments/
│   ├── popup.html             # Save attachments popup
│   └── popup.js               # Popup logic (attachment list, folder nav)
├── icons/                     # Seafile logo icons (16/32/64px)
├── _locales/
│   ├── en/messages.json       # English strings
│   └── de/messages.json       # German strings
├── dev/
│   └── docker-compose.yml     # Local Seafile for development
└── LICENSE                    # Apache 2.0
```

## Roadmap

- [ ] Browse and insert existing Seafile files as links
- [ ] Publish on [addons.thunderbird.net](https://addons.thunderbird.net)

## License

[Apache License 2.0](LICENSE)
