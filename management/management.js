/**
 * Management page for Seafile CloudFile account configuration.
 *
 * This page runs in a limited context - only cloudFile, storage, i18n,
 * runtime and extension APIs are available. For Seafile API calls we
 * use browser.runtime.sendMessage() to communicate with background.js.
 */

const accountId = new URL(location.href).searchParams.get("accountId");

/**
 * Apply i18n translations to all elements with data-i18n attributes.
 */
function applyI18n() {
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const msg = browser.i18n.getMessage(el.getAttribute("data-i18n"));
    if (msg) el.textContent = msg;
  }
}

const serverUrlInput = document.getElementById("serverUrl");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const connectBtn = document.getElementById("connectBtn");
const connectStatus = document.getElementById("connectStatus");
const librarySection = document.getElementById("librarySection");
const repoSelect = document.getElementById("repoSelect");
const uploadPathInput = document.getElementById("uploadPath");
const sharePasswordInput = document.getElementById("sharePassword");
const shareExpireDaysInput = document.getElementById("shareExpireDays");
const saveBtn = document.getElementById("saveBtn");
const saveStatus = document.getElementById("saveStatus");

/**
 * Send a message to the background script and return the response.
 */
async function sendMessage(action, data) {
  const response = await browser.runtime.sendMessage({ action, accountId, ...data });
  if (response && response.error) {
    throw new Error(response.error);
  }
  return response;
}

/**
 * Show a status message.
 */
function showStatus(element, message, isError) {
  element.textContent = message;
  element.className = `status ${isError ? "error" : "success"}`;
}

/**
 * Load saved configuration for this account.
 */
async function loadConfig() {
  const stored = await browser.storage.local.get(accountId);
  const config = stored[accountId];
  if (!config) return;

  serverUrlInput.value = config.serverUrl || "";
  usernameInput.value = config.username || "";
  uploadPathInput.value = config.uploadPath || "/Thunderbird-Attachments";
  sharePasswordInput.value = config.sharePassword || "";
  shareExpireDaysInput.value = config.shareExpireDays || 0;

  if (config.apiToken) {
    // Already connected - try to load repos
    try {
      await loadRepos(config);
      librarySection.classList.add("visible");
      showStatus(connectStatus, "Connected", false);

      // Pre-select saved repo
      if (config.repoId) {
        repoSelect.value = config.repoId;
      }
    } catch (e) {
      // Token might be expired
      showStatus(connectStatus, "Session expired. Please reconnect.", true);
    }
  }
}

/**
 * Populate the library dropdown.
 */
async function loadRepos(config) {
  const repos = await sendMessage("listRepos", {
    serverUrl: config.serverUrl,
    apiToken: config.apiToken,
  });

  // Clear existing options (keep placeholder)
  while (repoSelect.options.length > 1) {
    repoSelect.remove(1);
  }

  for (const repo of repos) {
    const option = document.createElement("option");
    option.value = repo.repo_id || repo.id;
    option.textContent = repo.repo_name || repo.name;
    repoSelect.appendChild(option);
  }
}

/**
 * Handle "Connect" button click.
 */
connectBtn.addEventListener("click", async () => {
  const serverUrl = serverUrlInput.value.trim().replace(/\/+$/, "");
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!serverUrl || !username || !password) {
    showStatus(connectStatus, "Please fill in all fields.", true);
    return;
  }

  connectBtn.disabled = true;
  connectStatus.className = "status";

  try {
    const result = await sendMessage("getToken", { serverUrl, username, password });
    const apiToken = result.token;

    // Save credentials
    const config = { serverUrl, username, password, apiToken };
    await browser.storage.local.set({ [accountId]: config });

    // Load libraries
    await loadRepos(config);
    librarySection.classList.add("visible");
    showStatus(connectStatus, "Connected successfully!", false);
  } catch (e) {
    showStatus(connectStatus, `Connection failed: ${e.message}`, true);
  } finally {
    connectBtn.disabled = false;
  }
});

/**
 * Handle "Save" button click.
 */
saveBtn.addEventListener("click", async () => {
  const repoId = repoSelect.value;
  const repoName = repoSelect.options[repoSelect.selectedIndex]?.textContent || "";
  const uploadPath = uploadPathInput.value.trim() || "/Thunderbird-Attachments";
  const sharePassword = sharePasswordInput.value.trim();
  const shareExpireDays = parseInt(shareExpireDaysInput.value, 10) || 0;

  if (!repoId) {
    showStatus(saveStatus, "Please select a library.", true);
    return;
  }

  saveBtn.disabled = true;

  try {
    // Load existing config and merge
    const stored = await browser.storage.local.get(accountId);
    const config = stored[accountId] || {};
    config.repoId = repoId;
    config.repoName = repoName;
    config.uploadPath = uploadPath;
    config.sharePassword = sharePassword;
    config.shareExpireDays = shareExpireDays;
    await browser.storage.local.set({ [accountId]: config });

    // Mark account as configured
    await browser.cloudFile.updateAccount(accountId, { configured: true });

    showStatus(saveStatus, "Settings saved!", false);
  } catch (e) {
    showStatus(saveStatus, `Failed to save: ${e.message}`, true);
  } finally {
    saveBtn.disabled = false;
  }
});

// Initialize page
applyI18n();
loadConfig();
