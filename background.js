/**
 * Background script for Seafile CloudFile provider.
 * Handles file uploads, deletions, and message passing from management page.
 */

const seafile = new SeafileAPI();

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
  if (!config.username || !config.password) {
    const msg = config.authMethod === "sso"
      ? "Session expired. Please reconnect via SSO in the Seafile account settings."
      : "Cannot re-authenticate: no stored credentials.";
    throw new Error(msg);
  }
  try {
    const newToken = await seafile.getToken(config.serverUrl, config.username, config.password);
    config.apiToken = newToken;
    await browser.storage.local.set({ [accountId]: config });
    return newToken;
  } catch (e) {
    if (e.message && e.message.includes("OTP")) {
      throw new Error("Session expired. Please reconnect in the Seafile account settings (2FA code required).");
    }
    throw e;
  }
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

      // 4. Create share link
      const filePath = `${cfg.uploadPath}/${fileInfo.name}`;
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
      await seafile.uploadFile(
        uploadLink, config.apiToken, file, message.fileName, targetDir
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
      return entries.filter(e => e.type === "dir");
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
