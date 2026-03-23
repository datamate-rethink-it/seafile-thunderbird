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
const otpInput = document.getElementById("otp");
const connectBtn = document.getElementById("connectBtn");
const connectStatus = document.getElementById("connectStatus");
const settingsTabs = document.getElementById("settingsTabs");
const repoSelect = document.getElementById("repoSelect");
const uploadPathEl = document.getElementById("uploadPath");
const uploadFolderList = document.getElementById("uploadFolderList");
const saveRepoSelect = document.getElementById("saveRepoSelect");
const savePathEl = document.getElementById("savePath");
const saveFolderList = document.getElementById("saveFolderList");
const sharePasswordInput = document.getElementById("sharePassword");
const shareExpireDaysInput = document.getElementById("shareExpireDays");
const saveBtn = document.getElementById("saveBtn");
const saveStatus = document.getElementById("saveStatus");

// Current folder picker state
let uploadCurrentPath = "/";
let saveCurrentPath = "/";

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
 * Mark the connect button as successfully connected.
 */
function markConnected() {
  connectBtn.textContent = "\u2714 " + (browser.i18n.getMessage("connected") || "Connected");
  connectBtn.disabled = true;
  connectStatus.className = "status";
}

/**
 * Load folder contents into a folder picker.
 * @param {string} repoId - Library ID
 * @param {string} path - Directory path
 * @param {HTMLElement} pathEl - Element showing current path
 * @param {HTMLElement} listEl - UL element for folder list
 * @param {Function} onNavigate - Called with new path when navigating
 */
async function loadFolderPicker(repoId, path, pathEl, listEl, onNavigate) {
  if (!repoId) return;

  pathEl.textContent = path;
  listEl.innerHTML = "";

  try {
    const dirs = await sendMessage("listDir", { path, repoId });

    if (path !== "/") {
      const parentLi = document.createElement("li");
      const parentPath = path.substring(0, path.lastIndexOf("/")) || "/";
      parentLi.innerHTML = `\u2B06 ..`;
      parentLi.addEventListener("click", () => onNavigate(parentPath));
      listEl.appendChild(parentLi);
    }

    for (const dir of dirs) {
      const li = document.createElement("li");
      const dirPath = path === "/" ? `/${dir.name}` : `${path}/${dir.name}`;
      li.innerHTML = `\uD83D\uDCC1 ${dir.name}`;
      li.addEventListener("click", () => onNavigate(dirPath));
      listEl.appendChild(li);
    }
  } catch (e) {
    console.error("Failed to list directory:", e);
  }
}

/**
 * Navigate the upload folder picker.
 */
function navigateUploadFolder(path) {
  uploadCurrentPath = path;
  const repoId = repoSelect.value;
  loadFolderPicker(repoId, path, uploadPathEl, uploadFolderList, navigateUploadFolder);
}

/**
 * Navigate the save folder picker.
 */
function navigateSaveFolder(path) {
  saveCurrentPath = path;
  const repoId = saveRepoSelect.value || repoSelect.value;
  loadFolderPicker(repoId, path, savePathEl, saveFolderList, navigateSaveFolder);
}

/**
 * Re-enable connect button when credentials change.
 */
for (const input of [serverUrlInput, usernameInput, passwordInput, otpInput]) {
  input.addEventListener("input", () => {
    connectBtn.textContent = browser.i18n.getMessage("connect") || "Connect";
    connectBtn.disabled = false;
    connectStatus.className = "status";
  });
}

/**
 * Reload upload folder picker when library changes.
 */
repoSelect.addEventListener("change", () => {
  uploadCurrentPath = "/";
  navigateUploadFolder("/");
});

/**
 * Reload save folder picker when library changes.
 */
saveRepoSelect.addEventListener("change", () => {
  saveCurrentPath = "/";
  navigateSaveFolder("/");
});

/**
 * Load saved configuration for this account.
 */
async function loadConfig() {
  const stored = await browser.storage.local.get(accountId);
  const config = stored[accountId];
  if (!config) return;

  serverUrlInput.value = config.serverUrl || "";
  usernameInput.value = config.username || "";
  if (config.password) {
    passwordInput.placeholder = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
  }
  sharePasswordInput.value = config.sharePassword || "";
  shareExpireDaysInput.value = config.shareExpireDays || 0;

  if (config.apiToken) {
    // Already connected - try to load repos
    try {
      await loadRepos(config);
      settingsTabs.classList.add("visible");
      markConnected();

      // Pre-select saved repos
      if (config.repoId) {
        repoSelect.value = config.repoId;
      }
      if (config.saveRepoId) {
        saveRepoSelect.value = config.saveRepoId;
      }

      // Load folder pickers with saved paths
      uploadCurrentPath = config.uploadPath || "/";
      saveCurrentPath = config.savePath || "/";
      navigateUploadFolder(uploadCurrentPath);
      navigateSaveFolder(saveCurrentPath);
    } catch (e) {
      // Token might be expired
      showStatus(connectStatus, "Session expired. Please reconnect.", true);
    }
  }
}

/**
 * Populate the library dropdowns.
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
  while (saveRepoSelect.options.length > 1) {
    saveRepoSelect.remove(1);
  }

  const unencrypted = repos.filter(r => !r.encrypted);
  for (const repo of unencrypted) {
    const id = repo.repo_id || repo.id;
    const name = repo.repo_name || repo.name;

    const option = document.createElement("option");
    option.value = id;
    option.textContent = name;
    repoSelect.appendChild(option);

    const saveOption = document.createElement("option");
    saveOption.value = id;
    saveOption.textContent = name;
    saveRepoSelect.appendChild(saveOption);
  }
}

/**
 * Submit connection on Enter key in any connection field.
 */
for (const input of [serverUrlInput, usernameInput, passwordInput, otpInput]) {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !connectBtn.disabled) {
      connectBtn.click();
    }
  });
}

/**
 * Handle "Connect" button click.
 */
connectBtn.addEventListener("click", async () => {
  const serverUrl = serverUrlInput.value.trim().replace(/\/+$/, "");
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const otp = otpInput.value.trim();

  if (!serverUrl || !username || !password) {
    showStatus(connectStatus, "Please fill in all fields.", true);
    return;
  }

  connectBtn.disabled = true;
  connectBtn.textContent = browser.i18n.getMessage("connecting") || "Connecting...";
  connectStatus.className = "status";

  try {
    const result = await sendMessage("getToken", { serverUrl, username, password, otp });
    const apiToken = result.token;

    // Save credentials
    const config = { serverUrl, username, password, apiToken };
    await browser.storage.local.set({ [accountId]: config });

    // Load libraries
    await loadRepos(config);
    settingsTabs.classList.add("visible");
    markConnected();

    // Initialize folder pickers for the first selected library
    if (repoSelect.value) {
      navigateUploadFolder("/");
      navigateSaveFolder("/");
    }
  } catch (e) {
    showStatus(connectStatus, `Connection failed: ${e.message}`, true);
    connectBtn.textContent = browser.i18n.getMessage("connect") || "Connect";
    connectBtn.disabled = false;
  }
});

/**
 * Handle "Save" button click.
 */
saveBtn.addEventListener("click", async () => {
  const repoId = repoSelect.value;
  const repoName = repoSelect.options[repoSelect.selectedIndex]?.textContent || "";
  const uploadPath = uploadCurrentPath;
  const saveRepoId = saveRepoSelect.value || "";
  const savePath = saveCurrentPath;
  const sharePassword = sharePasswordInput.value.trim();
  const shareExpireDays = Math.max(0, parseInt(shareExpireDaysInput.value, 10) || 0);

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
    config.saveRepoId = saveRepoId;
    config.savePath = savePath;
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

// Sanitize expiration input - only allow digits
shareExpireDaysInput.addEventListener("input", () => {
  shareExpireDaysInput.value = shareExpireDaysInput.value.replace(/[^0-9]/g, "");
});

// Tab switching
for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => {
    document.querySelector(".tab.active").classList.remove("active");
    document.querySelector(".tab-content.active").classList.remove("active");
    tab.classList.add("active");
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
    saveStatus.className = "status";
  });
}

// Initialize page
applyI18n();
loadConfig();
