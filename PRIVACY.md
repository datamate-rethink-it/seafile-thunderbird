# Privacy Policy — Seafile for Thunderbird

## Data Collection

This extension does **not** collect, transmit, or share any personal data with third parties.

## Data Storage

The following data is stored locally in your Thunderbird profile using the WebExtension `browser.storage.local` API:

- **Seafile server URL** — the URL you configure
- **Username / email** — your Seafile account identifier
- **API token** — issued by your Seafile server for authenticated API access
- **Extension settings** — target library, upload folder, share link options (password, expiration), display preferences

Your Seafile **password is not stored**. It is used once to obtain an API token and then discarded. If the token expires, you will be prompted to reconnect.

## Network Communication

This extension communicates **exclusively** with the Seafile server you configure. No data is sent to any other server, including the extension developer's servers, analytics services, or any third party.

API calls are made to your Seafile server for:
- Authentication (login, SSO)
- Listing libraries and directories
- Uploading and downloading files
- Creating, checking, and deleting share links

## Permissions

| Permission | Purpose |
|---|---|
| `storage` | Store account configuration and settings locally |
| `messagesRead` | Access email attachments for the "Save to Seafile" feature |
| `compose` | Read compose body format (HTML/plain text) for link insertion |
| `scripting` | Insert share link HTML at cursor position in compose editor |
| `notifications` | Show error notifications (e.g. unconfigured account) |
| `<all_urls>` | Connect to any user-configured Seafile server URL |

## Open Source

This extension is open source under the [Apache License 2.0](LICENSE). You can review the complete source code at any time.

## Contact

For privacy questions or concerns, please open an issue at:
https://github.com/christophdb/seafile-thunderbird/issues
