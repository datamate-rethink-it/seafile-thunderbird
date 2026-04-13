/**
 * Popup for saving email attachments to Seafile.
 */

const loadingEl = document.getElementById("loading");
const noAttachmentsEl = document.getElementById("noAttachments");
const notConfiguredEl = document.getElementById("notConfigured");
const contentEl = document.getElementById("content");
const attachmentListEl = document.getElementById("attachmentList");
const repoSelectEl = document.getElementById("repoSelect");
const folderListEl = document.getElementById("folderList");
const currentPathEl = document.getElementById("currentPath");
const selectAllEl = document.getElementById("selectAll");
const saveBtn = document.getElementById("saveBtn");
const saveStatus = document.getElementById("saveStatus");
const accountSelectorEl = document.getElementById("accountSelector");
const accountSelectEl = document.getElementById("accountSelect");

let messageId = null;
let attachments = [];
let currentPath = "/";
let currentRepoId = null;
let accountConfig = null;
let currentAccountId = null;

const LAST_ACCOUNT_KEY = "lastAccountId_save";
const LAST_REPO_KEY = "lastSaveRepoId";
const LAST_PATH_KEY = "lastSavePath";
const resetDefaultsEl = document.getElementById("resetDefaults");

/**
 * Send a message to the background script.
 */
async function sendMessage(action, data = {}) {
  const response = await browser.runtime.sendMessage({ action, ...data });
  if (response && response.error) {
    throw new Error(response.error);
  }
  return response;
}

/**
 * Show a status message.
 */
function showStatus(message, isError) {
  saveStatus.textContent = message;
  saveStatus.className = `status ${isError ? "error" : "success"}`;
}

/**
 * Render the attachment list.
 */
/**
 * Generate a fallback filename for attachments without a name.
 * @param {Object} att - Attachment object with contentType and partName
 * @returns {string} Fallback filename
 */
function fallbackFileName(att) {
  const extMap = {
    "text/plain": ".txt", "text/html": ".html", "text/csv": ".csv",
    "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp",
    "application/pdf": ".pdf", "application/zip": ".zip",
    "application/octet-stream": ".bin",
  };
  const ext = extMap[att.contentType] || "";
  return `attachment-${att.partName.replace(/\./g, "-")}${ext}`;
}

function renderAttachments() {
  attachmentListEl.innerHTML = "";
  for (const att of attachments) {
    // Generate fallback name for attachments without a filename
    if (!att.name || att.name.trim() === "") {
      att.name = fallbackFileName(att);
    }
    if (!att.customName) att.customName = att.name;

    const li = document.createElement("li");
    const resetSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;
    li.innerHTML = `
      <input type="checkbox" class="att-checkbox" data-part="${escapeHtml(att.partName)}" checked>
      <span class="att-name${att.customName !== att.name ? ' renamed' : ''}" contenteditable="true" data-part="${escapeHtml(att.partName)}" title="${escapeHtml(att.name)}">${escapeHtml(att.customName)}</span>
      <span class="att-reset${att.customName !== att.name ? ' visible' : ''}" title="${escapeHtml(browser.i18n.getMessage("resetFileName") || "Reset to original name")}">${resetSvg}</span>
      <span class="att-size">${formatSize(att.size)}</span>
      <span class="att-status" data-part-status="${escapeHtml(att.partName)}"></span>
    `;
    li.querySelector(".att-checkbox").addEventListener("change", syncSelectAll);

    // Rename support
    const nameEl = li.querySelector(".att-name");
    const resetEl = li.querySelector(".att-reset");

    function updateRenamed(isRenamed) {
      nameEl.classList.toggle("renamed", isRenamed);
      resetEl.classList.toggle("visible", isRenamed);
    }

    nameEl.addEventListener("focus", () => {
      const text = nameEl.textContent;
      const dotIndex = text.lastIndexOf(".");
      if (dotIndex > 0) {
        const range = document.createRange();
        const sel = window.getSelection();
        range.setStart(nameEl.firstChild, 0);
        range.setEnd(nameEl.firstChild, dotIndex);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
    nameEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); nameEl.blur(); }
      if (e.key === "Escape") { att.customName = att.name; nameEl.textContent = att.name; updateRenamed(false); nameEl.blur(); }
    });
    nameEl.addEventListener("blur", () => {
      const newName = nameEl.textContent.trim();
      if (newName && newName !== att.name) {
        att.customName = newName;
        updateRenamed(true);
      } else {
        att.customName = att.name;
        nameEl.textContent = att.name;
        updateRenamed(false);
      }
    });
    resetEl.addEventListener("click", () => {
      att.customName = att.name;
      nameEl.textContent = att.name;
      updateRenamed(false);
    });

    attachmentListEl.appendChild(li);
  }
}

/**
 * Sync the "Select all" checkbox with individual checkboxes.
 */
function syncSelectAll() {
  const checkboxes = attachmentListEl.querySelectorAll(".att-checkbox:not(:disabled)");
  const allChecked = [...checkboxes].every(cb => cb.checked);
  selectAllEl.checked = allChecked;
}

/**
 * Load libraries into the dropdown.
 */
async function loadRepos() {
  const repos = await sendMessage("listRepos", { accountId: currentAccountId });

  repoSelectEl.innerHTML = "";
  for (const repo of repos) {
    const option = document.createElement("option");
    option.value = repo.repo_id || repo.id;
    option.textContent = repo.repo_name || repo.name;
    repoSelectEl.appendChild(option);
  }

  // Pre-select: saveRepoId > repoId (upload library) as fallback
  const defaultRepoId = accountConfig.saveRepoId || accountConfig.repoId;
  if (defaultRepoId) {
    repoSelectEl.value = defaultRepoId;
  }
  currentRepoId = repoSelectEl.value;
}

/**
 * Navigate to a folder and load its subdirectories.
 */
async function navigateToFolder(path) {
  currentPath = path;
  currentPathEl.querySelector(".path-text").textContent = path;
  folderFilterInput.value = "";

  // Dim the list while loading
  folderListEl.classList.add("loading");

  try {
    const dirs = await sendMessage("listDir", { path, repoId: currentRepoId, accountId: currentAccountId });

    const fragment = document.createDocumentFragment();

    if (path !== "/") {
      const parentLi = document.createElement("li");
      const parentPath = path.substring(0, path.lastIndexOf("/")) || "/";
      parentLi.innerHTML = `<span class="folder-icon">${FILE_ICONS.folderUp}</span> ..`;
      parentLi.addEventListener("click", () => navigateToFolder(parentPath));
      fragment.appendChild(parentLi);
    }

    for (const dir of dirs) {
      const li = document.createElement("li");
      const dirPath = path === "/" ? `/${dir.name}` : `${path}/${dir.name}`;
      li.innerHTML = `<span class="folder-icon">${FILE_ICONS.folder}</span> ${escapeHtml(dir.name)}`;
      li.addEventListener("click", () => navigateToFolder(dirPath));
      fragment.appendChild(li);
    }

    folderListEl.replaceChildren(fragment);
    // Remember last used path
    await browser.storage.local.set({ [LAST_PATH_KEY]: currentPath });
    updateResetLink();
  } catch (e) {
    console.error("Failed to list directory:", e);
  } finally {
    folderListEl.classList.remove("loading");
  }
}

/**
 * Handle library change.
 */
repoSelectEl.addEventListener("change", () => {
  currentRepoId = repoSelectEl.value;
  browser.storage.local.set({ [LAST_REPO_KEY]: currentRepoId });
  navigateToFolder("/");
});

const folderPicker = document.getElementById("folderPicker");
const folderFilterInput = document.getElementById("folderFilter");

/**
 * Filter the folder list by name.
 */
folderFilterInput.addEventListener("input", () => {
  const query = folderFilterInput.value.toLowerCase().trim();
  for (const li of folderListEl.children) {
    const text = li.textContent.trim().toLowerCase();
    if (text === "..") {
      li.style.display = "";
      continue;
    }
    li.style.display = text.includes(query) ? "" : "none";
  }
});

/**
 * Reset to configured defaults.
 */
resetDefaultsEl.addEventListener("click", async (e) => {
  e.preventDefault();
  const defaultRepoId = accountConfig.saveRepoId || accountConfig.repoId;
  const defaultPath = accountConfig.savePath || "/";
  if (defaultRepoId) {
    repoSelectEl.value = defaultRepoId;
    currentRepoId = defaultRepoId;
  }
  await browser.storage.local.remove([LAST_REPO_KEY, LAST_PATH_KEY]);
  await navigateToFolder(defaultPath);
});

/**
 * Handle select-all checkbox.
 */
selectAllEl.addEventListener("change", () => {
  const checkboxes = attachmentListEl.querySelectorAll(".att-checkbox");
  for (const cb of checkboxes) {
    cb.checked = selectAllEl.checked;
  }
});

/**
 * Handle save button click.
 */
saveBtn.addEventListener("click", async () => {
  const selected = attachmentListEl.querySelectorAll(".att-checkbox:checked");
  if (selected.length === 0) return;

  saveBtn.disabled = true;
  saveStatus.className = "status";
  let errorCount = 0;

  for (const cb of selected) {
    const partName = cb.dataset.part;
    const statusEl = document.querySelector(`[data-part-status="${partName}"]`);
    const att = attachments.find(a => a.partName === partName);
    statusEl.innerHTML = STATUS_ICONS.pending;

    try {
      const fileName = (att.customName || att.name || "").trim();
      if (!fileName || fileName === ".") {
        throw new Error("Invalid filename");
      }
      await sendMessage("uploadAttachment", {
        messageId,
        partName,
        fileName,
        targetDir: currentPath,
        repoId: currentRepoId,
        accountId: currentAccountId,
      });
      statusEl.innerHTML = STATUS_ICONS.success;
      cb.disabled = true;
    } catch (e) {
      statusEl.innerHTML = STATUS_ICONS.error;
      const li = cb.closest("li");
      let errEl = li.querySelector(".att-error");
      if (!errEl) {
        errEl = document.createElement("div");
        errEl.className = "att-error";
        li.appendChild(errEl);
      }
      errEl.textContent = e.message;
      errorCount++;
      console.error(`Failed to upload ${att.name}:`, e);
    }
  }

  if (errorCount === 0) {
    showStatus(browser.i18n.getMessage("saveSuccess") || "All files saved!", false);
  } else {
    showStatus(
      (browser.i18n.getMessage("savePartialError") || "Some files failed to upload."),
      true
    );
  }
  saveBtn.disabled = false;
});

/**
 * Load data for a specific account.
 */
/**
 * Check if current selection differs from defaults and show/hide reset link.
 */
function updateResetLink() {
  const defaultRepoId = accountConfig.saveRepoId || accountConfig.repoId;
  const defaultPath = accountConfig.savePath || "/";
  const differs = currentRepoId !== defaultRepoId || currentPath !== defaultPath;
  resetDefaultsEl.style.display = differs ? "inline" : "none";
}

async function loadForAccount(accountId) {
  currentAccountId = accountId;
  accountConfig = await sendMessage("getAccountConfig", { accountId });
  if (!accountConfig) {
    loadingEl.style.display = "none";
    notConfiguredEl.style.display = "block";
    return;
  }

  await loadRepos();

  // Use last selection if available, otherwise defaults
  const stored = await browser.storage.local.get([LAST_REPO_KEY, LAST_PATH_KEY]);
  const lastRepoId = stored[LAST_REPO_KEY];
  const lastPath = stored[LAST_PATH_KEY];

  if (lastRepoId && repoSelectEl.querySelector(`option[value="${lastRepoId}"]`)) {
    repoSelectEl.value = lastRepoId;
    currentRepoId = lastRepoId;
  }

  currentPath = lastPath || accountConfig.savePath || "/";
  await navigateToFolder(currentPath);
}

/**
 * Handle account switch.
 */
accountSelectEl.addEventListener("change", async () => {
  currentAccountId = accountSelectEl.value;
  await browser.storage.local.set({ [LAST_ACCOUNT_KEY]: currentAccountId });
  // Reset folder state
  currentPath = "/";
  currentRepoId = null;
  repoSelectEl.innerHTML = "";
  folderListEl.innerHTML = "";
  await loadForAccount(currentAccountId);
});

/**
 * Initialize the popup.
 */
async function init() {
  applyI18n();

  try {
    // Get all configured accounts
    const accounts = await sendMessage("getAllConfiguredAccounts");
    if (!accounts || accounts.length === 0) {
      loadingEl.style.display = "none";
      notConfiguredEl.style.display = "block";
      return;
    }

    // Determine which account to use
    const lastUsed = (await browser.storage.local.get(LAST_ACCOUNT_KEY))[LAST_ACCOUNT_KEY];
    const selectedAccountId = accounts.find(a => a.accountId === lastUsed)?.accountId
      || accounts[0].accountId;

    // Show account selector if multiple accounts
    if (accounts.length > 1) {
      accountSelectorEl.style.display = "block";
      for (const acc of accounts) {
        const option = document.createElement("option");
        option.value = acc.accountId;
        const host = getHostLabel(acc.serverUrl);
        option.textContent = acc.displayName
          ? `${acc.displayName} (${host})`
          : `${acc.username} (${host})`;
        accountSelectEl.appendChild(option);
      }
      accountSelectEl.value = selectedAccountId;
    }

    // Get the currently displayed message
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0].id;
    const result = await sendMessage("getDisplayedMessage", { tabId });
    messageId = result.messageId;

    // List attachments
    attachments = await sendMessage("listAttachments", { messageId });
    loadingEl.style.display = "none";

    if (attachments.length === 0) {
      noAttachmentsEl.style.display = "block";
      return;
    }

    // Show content and render attachments
    contentEl.style.display = "block";
    renderAttachments();

    // Load account data
    await loadForAccount(selectedAccountId);
    await browser.storage.local.set({ [LAST_ACCOUNT_KEY]: selectedAccountId });
    folderFilterInput.focus();
  } catch (e) {
    loadingEl.style.display = "none";
    showStatus(`Error: ${e.message}`, true);
    saveStatus.style.display = "block";
    console.error("Popup init error:", e);
  }
}

init();
