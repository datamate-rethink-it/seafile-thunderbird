/**
 * Management page for Seafile CloudFile account configuration.
 *
 * This page runs in a limited context - only cloudFile, storage, i18n,
 * runtime and extension APIs are available. For Seafile API calls we
 * use browser.runtime.sendMessage() to communicate with background.js.
 */

const accountId = new URL(location.href).searchParams.get("accountId");

/**
 * Escape a string for safe insertion into HTML.
 */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Apply i18n translations to all elements with data-i18n attributes.
 */
function applyI18n() {
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const msg = browser.i18n.getMessage(el.getAttribute("data-i18n"));
    if (msg) el.textContent = msg;
  }
}

const loginForm = document.getElementById("loginForm");
const connectedInfo = document.getElementById("connectedInfo");
const connectedServer = document.getElementById("connectedServer");
const connectedUser = document.getElementById("connectedUser");
const connectedMethod = document.getElementById("connectedMethod");
const disconnectBtn = document.getElementById("disconnectBtn");
const serverUrlInput = document.getElementById("serverUrl");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const otpInput = document.getElementById("otp");
const connectBtn = document.getElementById("connectBtn");
const connectStatus = document.getElementById("connectStatus");
const repoSelect = document.getElementById("repoSelect");
const uploadPathEl = document.getElementById("uploadPath");
const uploadFolderList = document.getElementById("uploadFolderList");
const saveRepoSelect = document.getElementById("saveRepoSelect");
const savePathEl = document.getElementById("savePath");
const saveFolderList = document.getElementById("saveFolderList");
const sharePasswordInput = document.getElementById("sharePassword");
const shareExpireDaysInput = document.getElementById("shareExpireDays");
const showPasswordInEmailInput = document.getElementById("showPasswordInEmail");
const skipLinkOptionsInput = document.getElementById("skipLinkOptions");
const saveReplaceExistingInput = document.getElementById("saveReplaceExisting");
const ssoBtn = document.getElementById("ssoBtn");
const ssoStatus = document.getElementById("ssoStatus");
const uploadFolderPicker = document.getElementById("uploadFolderPicker");
const saveFolderPicker = document.getElementById("saveFolderPicker");

// Current folder picker state
let uploadCurrentPath = "/";
let saveCurrentPath = "/";
let ssoPollingInterval = null;

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
 * Show a status message with a close button.
 * @param {HTMLElement} element
 * @param {string} message
 * @param {boolean|string} type - true/"error", false/"success", or "info"
 */
function showStatus(element, message, type) {
  const cls = type === true || type === "error" ? "error" : type === "info" ? "info" : "success";
  element.textContent = message;
  element.className = `status ${cls}`;
  const closeBtn = document.createElement("button");
  closeBtn.className = "close-btn";
  closeBtn.textContent = "\u00D7";
  closeBtn.addEventListener("click", () => { element.className = "status"; });
  element.appendChild(closeBtn);
}

/**
 * Switch to a specific tab.
 * @param {string} tabName - "connection", "sharing", or "saving"
 */
function switchTab(tabName) {
  const tab = document.querySelector(`.tab[data-tab="${tabName}"]`);
  if (tab.classList.contains("disabled")) return;

  document.querySelector(".tab.active").classList.remove("active");
  document.querySelector(".tab-content.active").classList.remove("active");
  tab.classList.add("active");
  document.getElementById(`tab-${tabName}`).classList.add("active");

  // Refresh libraries when switching to a settings tab
  if (tabName === "sharing" || tabName === "saving") {
    refreshRepos();
  }
}

/**
 * Refresh the library dropdowns, preserving current selections.
 */
async function refreshRepos() {
  try {
    const stored = await browser.storage.local.get(accountId);
    const config = stored[accountId];
    if (!config || !config.apiToken) return;

    const prevRepo = repoSelect.value;
    const prevSaveRepo = saveRepoSelect.value;
    await loadRepos(config);

    // Restore selections
    if (prevRepo) repoSelect.value = prevRepo;
    if (prevSaveRepo) saveRepoSelect.value = prevSaveRepo;

    // Reload folder pickers with current paths
    if (repoSelect.value) {
      navigateUploadFolder(uploadCurrentPath);
    }
    if (saveRepoSelect.value || repoSelect.value) {
      navigateSaveFolder(saveCurrentPath);
    }
  } catch (e) {
    console.error("Failed to refresh libraries:", e);
  }
}

/**
 * Enable the sharing and saving tabs.
 */
function enableSettingsTabs() {
  document.querySelector('.tab[data-tab="sharing"]').classList.remove("disabled");
  document.querySelector('.tab[data-tab="saving"]').classList.remove("disabled");
}

/**
 * Show the connected state with server/user info.
 * @param {Object} config - Account config
 */
function markConnected(config) {
  loginForm.style.display = "none";
  connectedInfo.style.display = "block";
  connectedServer.textContent = config.serverUrl;
  connectedUser.textContent = config.username || "";
  if (config.authMethod === "sso") {
    connectedMethod.textContent = browser.i18n.getMessage("connectedViaSSO") || "Connected via SSO";
  } else {
    connectedMethod.textContent = browser.i18n.getMessage("connectedViaPassword") || "Connected via password";
  }
}

/**
 * Toggle a folder picker open/closed.
 */
function toggleFolderPicker(picker) {
  picker.classList.toggle("open");
}

/**
 * Load folder contents into a folder picker.
 */
async function loadFolderPicker(repoId, path, pathEl, listEl, onNavigate) {
  if (!repoId) return;

  const picker = pathEl.closest(".folder-picker");
  pathEl.querySelector(".path-text").textContent = path;
  listEl.innerHTML = "";

  try {
    const dirs = await sendMessage("listDir", { path, repoId });

    if (path !== "/") {
      const parentLi = document.createElement("li");
      const parentPath = path.substring(0, path.lastIndexOf("/")) || "/";
      parentLi.innerHTML = `<span class="folder-icon">${FILE_ICONS.folderUp}</span> ..`;
      parentLi.addEventListener("click", () => onNavigate(parentPath));
      listEl.appendChild(parentLi);
    }

    for (const dir of dirs) {
      const li = document.createElement("li");
      const dirPath = path === "/" ? `/${dir.name}` : `${path}/${dir.name}`;
      li.innerHTML = `<span class="folder-icon">${FILE_ICONS.folder}</span> ${escapeHtml(dir.name)}`;
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
 * Load saved configuration for this account.
 */
async function loadConfig() {
  const stored = await browser.storage.local.get(accountId);
  const config = stored[accountId];
  if (!config) return;

  serverUrlInput.value = config.serverUrl || "";
  usernameInput.value = config.username || "";
  sharePasswordInput.value = config.sharePassword || "";
  shareExpireDaysInput.value = config.shareExpireDays || 0;
  showPasswordInEmailInput.checked = config.showPasswordInEmail !== false;
  skipLinkOptionsInput.checked = !!config.skipLinkOptions;
  saveReplaceExistingInput.checked = !!config.saveReplaceExisting;

  if (config.apiToken) {
    // Already connected - try to load repos
    try {
      await loadRepos(config);
      enableSettingsTabs();
      markConnected(config);

      // Pre-select saved repos and mark configured
      if (config.repoId) {
        repoSelect.value = config.repoId;
        await browser.cloudFile.updateAccount(accountId, { configured: true });
      }
      if (config.saveRepoId) {
        saveRepoSelect.value = config.saveRepoId;
      }

      // Load folder pickers with saved paths
      uploadCurrentPath = config.uploadPath || "/";
      saveCurrentPath = config.savePath || "/";
      navigateUploadFolder(uploadCurrentPath);
      navigateSaveFolder(saveCurrentPath);

      // Switch to sharing tab
      switchTab("sharing");
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
 * After successful authentication, load repos and switch to sharing tab.
 * @param {Object} config - Account config with serverUrl, apiToken, etc.
 */
async function onConnected(config) {
  await browser.storage.local.set({ [accountId]: config });
  await loadRepos(config);
  enableSettingsTabs();
  markConnected(config);
  switchTab("sharing");
  if (repoSelect.value) {
    navigateUploadFolder("/");
    navigateSaveFolder("/");
  }
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

  // Warn about HTTP connections (except localhost)
  if (serverUrl.startsWith("http://") && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(serverUrl)) {
    showStatus(connectStatus, browser.i18n.getMessage("httpWarning") || "Warning: Connecting over HTTP. Your credentials may be transmitted in plaintext.", "info");
  }

  try {
    const result = await sendMessage("getToken", { serverUrl, username, password, otp });
    const config = { serverUrl, username, apiToken: result.token };
    await onConnected(config);
  } catch (e) {
    showStatus(connectStatus, `Connection failed: ${e.message}`, true);
    connectBtn.textContent = browser.i18n.getMessage("connect") || "Connect";
    connectBtn.disabled = false;
  }
});

/**
 * Handle "Login via SSO" button click.
 */
ssoBtn.addEventListener("click", async () => {
  const serverUrl = serverUrlInput.value.trim().replace(/\/+$/, "");
  if (!serverUrl) {
    showStatus(ssoStatus, browser.i18n.getMessage("ssoEnterUrl") || "Please enter the server URL first.", true);
    return;
  }

  ssoBtn.disabled = true;
  ssoStatus.className = "status";

  // Warn about HTTP connections (except localhost)
  if (serverUrl.startsWith("http://") && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(serverUrl)) {
    showStatus(ssoStatus, browser.i18n.getMessage("httpWarning") || "Warning: Connecting over HTTP. Your credentials may be transmitted in plaintext.", "info");
  }

  try {
    const result = await sendMessage("startSSO", { serverUrl });

    if (result.ssoUnavailable) {
      showStatus(ssoStatus, browser.i18n.getMessage("ssoUnavailable") || "SSO via local browser is not enabled on this server. The admin needs to set CLIENT_SSO_VIA_LOCAL_BROWSER = True in seahub_settings.py.", "info");
      ssoBtn.disabled = false;
      return;
    }

    // Start polling
    showStatus(ssoStatus, browser.i18n.getMessage("ssoWaiting") || "Waiting for authentication in browser...", "info");

    let elapsed = 0;
    ssoPollingInterval = setInterval(async () => {
      elapsed += 3;
      if (elapsed > 300) {
        clearInterval(ssoPollingInterval);
        ssoPollingInterval = null;
        showStatus(ssoStatus, browser.i18n.getMessage("ssoTimeout") || "SSO login timed out. Please try again.", true);
        ssoBtn.disabled = false;
        return;
      }
      try {
        const status = await sendMessage("checkSSOStatus", { serverUrl, ssoToken: result.ssoToken });
        if (status.status === "success" && status.apiToken) {
          clearInterval(ssoPollingInterval);
          ssoPollingInterval = null;
          const config = { serverUrl, username: status.username, apiToken: status.apiToken, authMethod: "sso" };
          await onConnected(config);
          ssoStatus.className = "status";
        } else if (status.status === "error") {
          clearInterval(ssoPollingInterval);
          ssoPollingInterval = null;
          showStatus(ssoStatus, browser.i18n.getMessage("ssoError") || "SSO login failed. Please try again.", true);
          ssoBtn.disabled = false;
        }
      } catch (e) {
        // Polling error - continue trying
        console.error("SSO poll error:", e);
      }
    }, 3000);
  } catch (e) {
    showStatus(ssoStatus, `SSO failed: ${e.message}`, true);
    ssoBtn.disabled = false;
  }
});

/**
 * Auto-save current settings to storage.
 */
/**
 * Show a brief checkmark next to an element to indicate it was saved.
 */
function flashSaved(el) {
  // Find the label for this element (previous sibling or parent)
  const formGroup = el.closest(".form-group") || el.parentElement;
  const label = formGroup.querySelector("label");
  if (!label) return;

  let check = label.querySelector(".save-check");
  if (!check) {
    check = document.createElement("span");
    check.className = "save-check";
    check.innerHTML = STATUS_ICONS.success;
    label.appendChild(check);
  }
  check.classList.add("visible");
  clearTimeout(check._timer);
  check._timer = setTimeout(() => check.classList.remove("visible"), 1500);
}

let autoSaveTimer = null;
let autoSaveSource = null;
function autoSave(sourceEl) {
  autoSaveSource = sourceEl || null;
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    try {
      const stored = await browser.storage.local.get(accountId);
      const config = stored[accountId] || {};

      config.repoId = repoSelect.value;
      config.repoName = repoSelect.options[repoSelect.selectedIndex]?.textContent || "";
      config.uploadPath = uploadCurrentPath;
      config.saveRepoId = saveRepoSelect.value || "";
      config.savePath = saveCurrentPath;
      config.sharePassword = sharePasswordInput.value.trim();
      config.shareExpireDays = Math.max(0, parseInt(shareExpireDaysInput.value, 10) || 0);
      config.showPasswordInEmail = showPasswordInEmailInput.checked;
      config.skipLinkOptions = skipLinkOptionsInput.checked;
      config.saveReplaceExisting = saveReplaceExistingInput.checked;
      await browser.storage.local.set({ [accountId]: config });

      if (config.repoId) {
        await browser.cloudFile.updateAccount(accountId, { configured: true });
      }

      if (autoSaveSource) {
        flashSaved(autoSaveSource);
      }
    } catch (e) {
      console.error("Auto-save failed:", e);
    }
  }, 300);
}

// Auto-save on any settings change
repoSelect.addEventListener("change", () => {
  uploadCurrentPath = "/";
  navigateUploadFolder("/");
  autoSave(repoSelect);
});
saveRepoSelect.addEventListener("change", () => {
  saveCurrentPath = "/";
  navigateSaveFolder("/");
  autoSave(saveRepoSelect);
});
sharePasswordInput.addEventListener("input", () => autoSave(sharePasswordInput));
shareExpireDaysInput.addEventListener("input", () => {
  shareExpireDaysInput.value = shareExpireDaysInput.value.replace(/[^0-9]/g, "");
  autoSave(shareExpireDaysInput);
});
showPasswordInEmailInput.addEventListener("change", () => autoSave(showPasswordInEmailInput.parentElement));
skipLinkOptionsInput.addEventListener("change", () => autoSave(skipLinkOptionsInput.parentElement));
saveReplaceExistingInput.addEventListener("change", () => autoSave(saveReplaceExistingInput.parentElement));

// Disconnect handler
disconnectBtn.addEventListener("click", async () => {
  const stored = await browser.storage.local.get(accountId);
  const config = stored[accountId] || {};

  // Clear auth data but keep server URL
  const serverUrl = config.serverUrl || "";
  await browser.storage.local.set({ [accountId]: { serverUrl } });
  await browser.cloudFile.updateAccount(accountId, { configured: false });

  // Reset UI
  connectedInfo.style.display = "none";
  loginForm.style.display = "block";
  serverUrlInput.value = serverUrl;
  usernameInput.value = "";
  passwordInput.value = "";
  passwordInput.placeholder = "";
  otpInput.value = "";
  connectBtn.textContent = browser.i18n.getMessage("connect") || "Connect";
  connectBtn.disabled = false;
  ssoBtn.disabled = false;
  connectStatus.className = "status";

  // Disable settings tabs
  document.querySelector('.tab[data-tab="sharing"]').classList.add("disabled");
  document.querySelector('.tab[data-tab="saving"]').classList.add("disabled");
  switchTab("connection");
});

// Tab switching
for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
}

// Folder picker toggle — save on close
uploadPathEl.addEventListener("click", () => {
  const wasOpen = uploadFolderPicker.classList.contains("open");
  toggleFolderPicker(uploadFolderPicker);
  if (wasOpen) autoSave(uploadFolderPicker);
});
savePathEl.addEventListener("click", () => {
  const wasOpen = saveFolderPicker.classList.contains("open");
  toggleFolderPicker(saveFolderPicker);
  if (wasOpen) autoSave(saveFolderPicker);
});
function closeOpenPickers(e) {
  if (uploadFolderPicker.classList.contains("open") && !uploadFolderPicker.contains(e.target)) {
    uploadFolderPicker.classList.remove("open");
    autoSave(uploadFolderPicker);
  }
  if (saveFolderPicker.classList.contains("open") && !saveFolderPicker.contains(e.target)) {
    saveFolderPicker.classList.remove("open");
    autoSave(saveFolderPicker);
  }
}
document.addEventListener("mousedown", closeOpenPickers);
document.addEventListener("focusin", closeOpenPickers);
window.addEventListener("blur", () => {
  closeOpenPickers({ target: document.body });
});

// Initialize page
applyI18n();
loadConfig();
