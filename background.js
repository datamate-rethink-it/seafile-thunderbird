/**
 * Background script for Seafile CloudFile provider.
 * Handles file uploads, deletions, and message passing from management page.
 */

const seafile = new SeafileAPI();

/**
 * Escape a string for safe insertion into HTML (no DOM available in background).
 */
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// Track active uploads for abort support: fileId -> AbortController
const activeUploads = new Map();

/**
 * Show a system notification to the user.
 * @param {string} message
 */
function showNotification(message) {
  browser.notifications.create({
    type: "basic",
    title: "Seafile",
    message,
  });
}

/**
 * Get the account configuration from storage.
 * @param {string} accountId
 * @returns {Promise<Object>}
 */
async function getAccountConfig(accountId) {
  const stored = await browser.storage.local.get(accountId);
  const config = stored[accountId];
  if (!config || !config.apiToken) {
    throw new Error(browser.i18n.getMessage("errorNotConnected") || "Seafile account not connected. Please set up your connection in Settings → Composition → Attachments.");
  }
  if (!config.repoId) {
    throw new Error(browser.i18n.getMessage("errorNotConfigured") || "Seafile account not fully configured. Please select a library in Settings → Composition → Attachments.");
  }
  return config;
}

/**
 * Re-authenticate using stored credentials and update the token.
 * @param {string} accountId
 * @param {Object} config
 * @returns {Promise<string>} New API token
 */
async function reAuthenticate(accountId, config) {
  const msg = config.authMethod === "sso"
    ? "Session expired. Please reconnect via SSO in the Seafile account settings."
    : "Session expired. Please reconnect in the Seafile account settings.";
  throw new Error(msg);
}

/**
 * Execute an API call with automatic re-authentication on 401.
 * @param {string} accountId
 * @param {Object} config
 * @param {Function} apiCall - Function that takes config and performs the API call
 * @returns {Promise<*>}
 */
async function withReAuth(accountId, config, apiCall) {
  try {
    return await apiCall(config);
  } catch (e) {
    if (e.message && e.message.includes("401")) {
      await reAuthenticate(accountId, config);
      return await apiCall(config);
    }
    throw e;
  }
}

/**
 * Save file metadata for later deletion.
 * @param {string} accountId
 * @param {number} fileId - Thunderbird's internal file ID
 * @param {Object} metadata - { path, shareLinkToken }
 */
async function saveFileMetadata(accountId, fileId, metadata) {
  const key = `${accountId}_files`;
  const stored = await browser.storage.local.get(key);
  const files = stored[key] || {};
  files[fileId] = metadata;
  await browser.storage.local.set({ [key]: files });
}

/**
 * Get and remove file metadata.
 * @param {string} accountId
 * @param {number} fileId
 * @returns {Promise<Object|null>}
 */
async function popFileMetadata(accountId, fileId) {
  const key = `${accountId}_files`;
  const stored = await browser.storage.local.get(key);
  const files = stored[key] || {};
  const metadata = files[fileId] || null;
  if (metadata) {
    delete files[fileId];
    await browser.storage.local.set({ [key]: files });
  }
  return metadata;
}

/**
 * Ensure the upload directory exists, creating it if necessary.
 */
async function ensureUploadDir(config) {
  const exists = await seafile.dirExists(
    config.serverUrl, config.apiToken, config.repoId, config.uploadPath
  );
  if (!exists) {
    await seafile.createDir(
      config.serverUrl, config.apiToken, config.repoId, config.uploadPath
    );
  }
}

// --- CloudFile Event Handlers ---

/**
 * Handle file upload request from Thunderbird.
 */
browser.cloudFile.onFileUpload.addListener(async (account, fileInfo, tab) => {
  const config = await getAccountConfig(account.id);
  const abortController = new AbortController();
  activeUploads.set(fileInfo.id, abortController);

  try {
    return await withReAuth(account.id, config, async (cfg) => {
      // 1. Ensure upload directory exists
      await ensureUploadDir(cfg);

      // 2. Get upload link (bound to target directory)
      const uploadLink = await seafile.getUploadLink(
        cfg.serverUrl, cfg.apiToken, cfg.repoId, cfg.uploadPath
      );

      // 3. Upload file
      await seafile.uploadFile(
        uploadLink, cfg.apiToken, fileInfo.data, fileInfo.name,
        cfg.uploadPath, abortController.signal
      );

      // 4. Create share link (delete existing if necessary)
      const filePath = `${cfg.uploadPath}/${fileInfo.name}`;
      const existingLinks = await seafile.getShareLinks(
        cfg.serverUrl, cfg.apiToken, cfg.repoId, filePath
      );
      for (const old of existingLinks) {
        const oldToken = old.token || extractTokenFromUrl(old.link);
        if (oldToken) {
          await seafile.deleteShareLink(cfg.serverUrl, cfg.apiToken, oldToken);
        }
      }
      const shareResult = await seafile.createShareLink(
        cfg.serverUrl, cfg.apiToken, cfg.repoId, filePath,
        { password: cfg.sharePassword, expireDays: cfg.shareExpireDays }
      );

      // 5. Save metadata for later deletion
      const shareLinkToken = shareResult.token || extractTokenFromUrl(shareResult.link);
      await saveFileMetadata(account.id, fileInfo.id, {
        path: filePath,
        shareLinkToken,
      });

      // 6. Build template info for the blue preview box
      const templateInfo = {
        service_name: "Seafile",
        service_url: "https://www.seafile.com",
        download_password_protected: !!cfg.sharePassword,
      };
      if (cfg.shareExpireDays > 0) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + cfg.shareExpireDays);
        templateInfo.download_expiry_date = {
          timestamp: expiryDate.getTime(),
        };
      }

      // 7. Return the download URL to Thunderbird
      return { url: shareResult.link, templateInfo };
    });
  } catch (e) {
    if (abortController.signal.aborted) {
      return { aborted: true };
    }
    showNotification(e.message);
    return { error: true };
  } finally {
    activeUploads.delete(fileInfo.id);
  }
});

/**
 * Handle file deletion request from Thunderbird.
 */
browser.cloudFile.onFileDeleted.addListener(async (account, fileId, tab) => {
  try {
    const config = await getAccountConfig(account.id);
    const metadata = await popFileMetadata(account.id, fileId);
    if (!metadata) return;

    await withReAuth(account.id, config, async (cfg) => {
      // Delete share link first, then the file
      if (metadata.shareLinkToken) {
        await seafile.deleteShareLink(cfg.serverUrl, cfg.apiToken, metadata.shareLinkToken);
      }
      if (metadata.path) {
        await seafile.deleteFile(cfg.serverUrl, cfg.apiToken, cfg.repoId, metadata.path);
      }
    });
  } catch (e) {
    console.error("Seafile: Failed to delete file:", e);
  }
});

/**
 * Handle file rename after upload.
 */
browser.cloudFile.onFileRename.addListener(async (account, fileId, newName, tab) => {
  try {
    const config = await getAccountConfig(account.id);
    const metadata = await popFileMetadata(account.id, fileId);
    if (!metadata) {
      return { error: "File metadata not found." };
    }

    return await withReAuth(account.id, config, async (cfg) => {
      // 1. Rename file on Seafile
      await seafile.renameFile(cfg.serverUrl, cfg.apiToken, cfg.repoId, metadata.path, newName);

      // 2. Delete old share link
      if (metadata.shareLinkToken) {
        await seafile.deleteShareLink(cfg.serverUrl, cfg.apiToken, metadata.shareLinkToken);
      }

      // 3. Create new share link for renamed file
      const dir = metadata.path.substring(0, metadata.path.lastIndexOf("/"));
      const newPath = `${dir}/${newName}`;
      const shareResult = await seafile.createShareLink(
        cfg.serverUrl, cfg.apiToken, cfg.repoId, newPath,
        { password: cfg.sharePassword, expireDays: cfg.shareExpireDays }
      );

      // 4. Save updated metadata
      const shareLinkToken = shareResult.token || extractTokenFromUrl(shareResult.link);
      await saveFileMetadata(account.id, fileId, {
        path: newPath,
        shareLinkToken,
      });

      return { url: shareResult.link };
    });
  } catch (e) {
    return { error: e.message };
  }
});

/**
 * Handle upload abort request.
 */
browser.cloudFile.onFileUploadAbort.addListener((account, fileId, tab) => {
  const controller = activeUploads.get(fileId);
  if (controller) {
    controller.abort();
    activeUploads.delete(fileId);
  }
});

/**
 * Handle account deletion - clean up stored data.
 */
browser.cloudFile.onAccountDeleted.addListener(async (accountId) => {
  await browser.storage.local.remove(accountId);
  await browser.storage.local.remove(`${accountId}_files`);
});

// --- Message Handler for Management Page and Save-Attachments Popup ---

/**
 * Find the first configured CloudFile account.
 * @returns {Promise<Object|null>} Account config or null
 */
async function getFirstConfiguredAccount() {
  const accounts = await browser.cloudFile.getAllAccounts();
  for (const account of accounts) {
    const stored = await browser.storage.local.get(account.id);
    const config = stored[account.id];
    if (config && config.apiToken && config.repoId) {
      return { accountId: account.id, ...config };
    }
  }
  return null;
}

browser.runtime.onMessage.addListener(async (message) => {
  switch (message.action) {
    case "getToken": {
      const token = await seafile.getToken(
        message.serverUrl, message.username, message.password, message.otp
      );
      return { token };
    }
    case "startSSO": {
      const info = await seafile.getServerInfo(message.serverUrl);
      const features = info.features || [];
      if (!features.includes("client-sso-via-local-browser")) {
        return { ssoUnavailable: true };
      }
      const result = await seafile.createSSOLink(message.serverUrl);
      const match = result.link.match(/\/client-sso\/([^/?]+)/);
      if (!match) {
        throw new Error("Failed to parse SSO token from server response.");
      }
      await browser.windows.openDefaultBrowser(result.link);
      return { ssoToken: match[1] };
    }
    case "checkSSOStatus": {
      const status = await seafile.checkSSOStatus(message.serverUrl, message.ssoToken);
      return {
        status: status.status,
        username: status.username,
        apiToken: status.apiToken || status.api_key,
      };
    }
    case "listRepos": {
      const repos = await seafile.listRepos(message.serverUrl, message.apiToken);
      return repos;
    }
    case "getDisplayedMessage": {
      const messageList = await browser.messageDisplay.getDisplayedMessages(message.tabId);
      if (!messageList || messageList.messages.length === 0) {
        return { error: "No message displayed." };
      }
      return { messageId: messageList.messages[0].id };
    }
    case "listAttachments": {
      const attachments = await browser.messages.listAttachments(message.messageId);
      return attachments.filter(a => a.contentType !== "text/x-moz-deleted");
    }
    case "uploadAttachment": {
      const config = await getFirstConfiguredAccount();
      if (!config) {
        return { error: "No Seafile account configured." };
      }
      const file = await browser.messages.getAttachmentFile(
        message.messageId, message.partName
      );
      const repoId = message.repoId || config.repoId;
      const targetDir = message.targetDir || config.uploadPath;
      // Ensure target directory exists
      const exists = await seafile.dirExists(
        config.serverUrl, config.apiToken, repoId, targetDir
      );
      if (!exists) {
        await seafile.createDir(
          config.serverUrl, config.apiToken, repoId, targetDir
        );
      }
      const uploadLink = await seafile.getUploadLink(
        config.serverUrl, config.apiToken, repoId, targetDir
      );
      const replace = !!config.saveReplaceExisting;
      await seafile.uploadFile(
        uploadLink, config.apiToken, file, message.fileName, targetDir, null, replace
      );
      return { success: true };
    }
    case "getAccountConfig": {
      return await getFirstConfiguredAccount();
    }
    case "listDir": {
      const config = await getFirstConfiguredAccount();
      if (!config) {
        return { error: "No Seafile account configured." };
      }
      const repoId = message.repoId || config.repoId;
      const entries = await seafile.listDir(
        config.serverUrl, config.apiToken, repoId, message.path || "/"
      );
      return message.includeFiles ? entries : entries.filter(e => e.type === "dir");
    }
    case "checkExistingLink": {
      const config = await getFirstConfiguredAccount();
      if (!config) {
        return { error: "No Seafile account configured." };
      }
      const links = await seafile.getShareLinks(
        config.serverUrl, config.apiToken, message.repoId, message.path
      );
      return { links };
    }
    case "createFileLink": {
      const config = await getFirstConfiguredAccount();
      if (!config) {
        return { error: "No Seafile account configured." };
      }
      const shareResult = await seafile.createShareLink(
        config.serverUrl, config.apiToken,
        message.repoId, message.path,
        { password: message.password, expireDays: message.expireDays }
      );
      return shareResult;
    }
    case "deleteShareLink": {
      const config = await getFirstConfiguredAccount();
      if (!config) {
        return { error: "No Seafile account configured." };
      }
      await seafile.deleteShareLink(config.serverUrl, config.apiToken, message.linkToken);
      return { success: true };
    }
    case "insertLinkIntoCompose": {
      const { link, fileName, fileSize, password, showPasswordInEmail, expireDays, tabId } = message;
      const details = await browser.compose.getComposeDetails(tabId);

      if (details.isPlainText) {
        // Plain text: append at end (no scripting available)
        let text = `\n${fileName}: ${link}`;
        if (fileSize) text += `\nSize: ${fileSize}`;
        if (password) {
          text += showPasswordInEmail
            ? `\nPassword: ${password}`
            : `\nPassword protected (password will be sent separately)`;
        }
        if (expireDays) text += `\nExpires in ${expireDays} days`;
        text += "\n";
        const newBody = details.plainTextBody + text;
        await browser.compose.setComposeDetails(tabId, { plainTextBody: newBody });
      } else {
        // HTML: insert at cursor via scripting (preserves existing content)
        const safeLink = escapeHtml(link);
        const safeFileName = escapeHtml(fileName);
        let metaLines = "";
        if (fileSize) metaLines += `Size: ${escapeHtml(fileSize)}<br>`;
        metaLines += `Link: <a href="${safeLink}" style="color:#0060df;">${safeLink}</a>`;
        if (password) {
          metaLines += showPasswordInEmail
            ? `<br>Password: <code style="background:#f0f0f0;padding:2px 6px;border-radius:2px;display:inline-block;user-select:all;">${escapeHtml(password)}</code>`
            : `<br>Password protected (password will be sent separately)`;
        }
        if (expireDays) {
          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + expireDays);
          metaLines += `<br>Expires: ${expiryDate.toLocaleDateString()}`;
        }

        const logoSvg = `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiB2aWV3Qm94PSIxMCAxIDU2IDUyIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0xMy44MDYsMjIuMTYxYzAsLTAuOTIgMC43NDYsLTEuNjU4IDEuNjY3LC0xLjY1OGMwLjQzOSwwIDAuODI5LDAuMTc0IDEuMTI4LDAuNDQ4Yy0wLjAwOCwtMC4xNDkgLTAuMDE3LC0wLjI5IC0wLjAxNywtMC40MzljMCwtMy4wNzYgMi40ODcsLTUuNTY0IDUuNTY0LC01LjU2NGMwLjc5NiwwIDEuNTUsMC4xNjYgMi4yMzksMC40NzNjLTAuMDA4LC0wLjE1OCAtMC4wMTcsLTAuMzE1IC0wLjAxNywtMC40NjRjMCwtNC42MSAzLjczMSwtOC4zNDEgOC4zNDEsLTguMzQxYzQuNTc3LDAgOC4yOTEsMy42OSA4LjM0MSw4LjI1OGMtMS41MDksMS4zMjcgLTIuNzExLDMuMDAxIC0zLjQ4Miw0Ljg5MmMtMS40OTIsLTAuOTI5IC0zLjI1LC0xLjQ4NCAtNS4xMzIsLTEuNDg0Yy0zLjg4LDAtNy4yMywyLjIwNiAtOC43OTcsNS41MzlsLTUuOTQ2LDBsLTIuMjIyLDBjLTAuOTIxLC0wLjAxOCAtMS42NjcsLTAuNzM5IC0xLjY2NywtMS42NlptNDMuOTIsLTQuOTgzYy0yLjA2NSwtMi4wNjUgLTQuOTA5LC0zLjM0MSAtOC4wNTksLTMuMzQxYy01Ljc0NiwwIC0xMC41MDUsNC4yNTQgLTExLjI4NSw5Ljc5MmMtMS40MTgsLTEuODkgLTMuNjgxLC0zLjExOCAtNi4yMjcsLTMuMTE4Yy00LjMwMywwIC03Ljc4NiwzLjQ5MSAtNy43ODYsNy43ODZjMCwxLjI1MiAwLjI5OCwyLjQyOSAwLjgyMSwzLjQ4MmMtMi43MDMsMC41NDcgLTQuNzEsMi42NDUgLTQuNzEsNS4xNDFjMCwyLjkxOSAyLjczNiw1LjI4MiA2LjExOSw1LjI4MmMxLjQ5MiwwIDIuODYxLC0wLjQ2NCAzLjkyMiwtMS4yMzVsMTIuNTEyLC0xMi4zMDVjMS4zODUsLTEuMjY5IDMuMjI1LC0yLjA0IDUuMjQ4LC0yLjA0YzQuMjI5LDAgNy42NywzLjM3NSA3Ljc4Niw3LjU3OGMwLDAgMCwtMC4wMDggLTAuMDA4LC0wLjAwOGMwLjA2NiwxLjI0NCAtMC41OCwyLjQ5NiAtMS43NzQsMy4xODRjLTEuNjY3LDAuOTYyIC0zLjc1NiwwLjQ0OCAtNC42NjgsLTEuMTM2Yy0wLjkyLC0xLjU5MiAtMC4zMTUsLTMuNjU3IDEuMzUyLC00LjYxOGMwLjM5LC0wLjIyNCAwLjc5NiwtMC4zNjUgMS4yMTEsLTAuNDM5Yy0wLjM1NywtMC4wNzUgLTAuNzMsLTAuMTA4IC0xLjExMSwtMC4xMDhjLTMuMDY4LDAgLTUuNTY0LDIuNDg3IC01LjU2NCw1LjU2NGMwLDMuMDc2IDIuNDg3LDUuNTY0IDUuNTY0LDUuNTY0YzAuMTMzLDAgMC4yNzQsLTAuMDA4IDAuNDA2LC0wLjAxN2wtMC4wMDgsLTAuMDE3bDAuMTU4LC0wLjAxN2wxMC45MiwwbDAsMC4wNDFjMy4zNDEsLTAuMTQ5IDYuNSwtMy4yMjUgNi41LC02Ljk3M2MwLC0zLjgzOSAtMy4yODMsLTYuOTczIC03LjEyMiwtNi45NzNjLTAuMDA4LDAgLTAuMDA4LDAgLTAuMDE3LDBjLTAuNjIyLDEuMTExIC0xLjM3NiwxLjc1OCAtMi4yMywyLjQ1NGMwLjg5NSwtMS42MzMgMS40MSwtMy40OTEgMS40MSwtNS40ODFjLTAuMDE5LC0zLjE0MSAtMS4yOTYsLTUuOTc3IC0zLjM2LC04LjA0MloiIHN0eWxlPSJmaWxsOnVybCgjX0xpbmVhcjEpO2ZpbGwtcnVsZTpub256ZXJvOyIvPjxkZWZzPjxsaW5lYXJHcmFkaWVudCBpZD0iX0xpbmVhcjEiIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIwIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgZ3JhZGllbnRUcmFuc2Zvcm09Im1hdHJpeCgyLjE3OTE2ZS0xNSwzNS41ODg0LC0zNS41ODg0LDIuMTc5MTZlLTE1LDQxLjQyMiw2LjYyMDE1KSI+PHN0b3Agb2Zmc2V0PSIwIiBzdHlsZT0ic3RvcC1jb2xvcjojZmFkOTU2O3N0b3Atb3BhY2l0eToxIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdHlsZT0ic3RvcC1jb2xvcjojZmZhMTBmO3N0b3Atb3BhY2l0eToxIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PC9zdmc+`;

        const linkHtml = `<div style="padding:15px;background:#dae3f0;border-radius:4px;font-family:sans-serif;"><div style="font-size:13px;color:#333;margin-bottom:8px;">I've linked a file to this email:</div><div style="background:#fff;border:1px solid #c8cfd6;border-radius:4px;padding:10px 12px;"><table style="width:100%;border-collapse:collapse;"><tr><td style="width:28px;vertical-align:top;padding-right:8px;"><span style="font-size:20px;color:#7b8a99;">&#128206;</span></td><td style="vertical-align:top;font-size:12px;color:#555;"><a href="${safeLink}" style="color:#0060df;font-size:13px;text-decoration:underline;">${safeFileName}</a><br>${metaLines}</td><td style="width:50px;vertical-align:middle;text-align:center;"><img src="${logoSvg}" alt="Seafile" width="28" height="28" style="display:block;margin:0 auto 2px auto;"><div style="font-size:9px;color:#888;">Seafile</div></td></tr></table></div><div style="font-size:11px;color:#555;margin-top:6px;">Learn more about <a href="https://www.seafile.com" style="color:#0060df;">Seafile</a>.</div></div>`;

        // Use scripting.executeScript to insert at cursor without touching existing body
        await browser.scripting.executeScript({
          target: { tabId },
          func: (html) => {
            document.execCommand("insertHTML", false, html);
          },
          args: [linkHtml],
        });
      }
      return { success: true };
    }
    default:
      return { error: `Unknown action: ${message.action}` };
  }
});

/**
 * Extract share link token from a Seafile share URL.
 * e.g. "https://cloud.seafile.com/f/abc123def456/" -> "abc123def456"
 *      "https://cloud.seafile.com/d/abc123def456/" -> "abc123def456"
 */
function extractTokenFromUrl(url) {
  if (!url) return null;
  const match = url.match(/\/[fd]\/([a-zA-Z0-9]+)\/?/);
  return match ? match[1] : null;
}
