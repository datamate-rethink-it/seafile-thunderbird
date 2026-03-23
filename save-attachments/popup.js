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

let messageId = null;
let attachments = [];
let currentPath = "/";
let currentRepoId = null;
let accountConfig = null;

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
 * Format file size for display.
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Apply i18n translations.
 */
function applyI18n() {
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const msg = browser.i18n.getMessage(el.getAttribute("data-i18n"));
    if (msg) el.textContent = msg;
  }
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
function renderAttachments() {
  attachmentListEl.innerHTML = "";
  for (const att of attachments) {
    const li = document.createElement("li");
    li.innerHTML = `
      <input type="checkbox" class="att-checkbox" data-part="${att.partName}" checked>
      <span class="att-name" title="${att.name}">${att.name}</span>
      <span class="att-size">${formatSize(att.size)}</span>
      <span class="att-status" data-part-status="${att.partName}"></span>
    `;
    attachmentListEl.appendChild(li);
  }
}

/**
 * Load libraries into the dropdown.
 */
async function loadRepos() {
  const repos = await sendMessage("listRepos", {
    serverUrl: accountConfig.serverUrl,
    apiToken: accountConfig.apiToken,
  });

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
  currentPathEl.textContent = path;

  folderListEl.innerHTML = "";
  try {
    const dirs = await sendMessage("listDir", { path, repoId: currentRepoId });

    // Add parent directory link if not at root
    if (path !== "/") {
      const parentLi = document.createElement("li");
      const parentPath = path.substring(0, path.lastIndexOf("/")) || "/";
      parentLi.innerHTML = `<span class="folder-icon">${FILE_ICONS.folderUp}</span> ..`;
      parentLi.addEventListener("click", () => navigateToFolder(parentPath));
      folderListEl.appendChild(parentLi);
    }

    for (const dir of dirs) {
      const li = document.createElement("li");
      const dirPath = path === "/" ? `/${dir.name}` : `${path}/${dir.name}`;
      li.innerHTML = `<span class="folder-icon">${FILE_ICONS.folder}</span> ${dir.name}`;
      li.addEventListener("click", () => navigateToFolder(dirPath));
      folderListEl.appendChild(li);
    }
  } catch (e) {
    console.error("Failed to list directory:", e);
  }
}

/**
 * Handle library change.
 */
repoSelectEl.addEventListener("change", () => {
  currentRepoId = repoSelectEl.value;
  navigateToFolder("/");
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
      await sendMessage("uploadAttachment", {
        messageId,
        partName,
        fileName: att.name,
        targetDir: currentPath,
        repoId: currentRepoId,
      });
      statusEl.innerHTML = STATUS_ICONS.success;
      cb.disabled = true;
    } catch (e) {
      statusEl.innerHTML = STATUS_ICONS.error;
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
 * Initialize the popup.
 */
async function init() {
  applyI18n();

  try {
    // Get account config first
    accountConfig = await sendMessage("getAccountConfig");
    if (!accountConfig || accountConfig.error) {
      loadingEl.style.display = "none";
      notConfiguredEl.style.display = "block";
      return;
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

    // Show content
    contentEl.style.display = "block";
    renderAttachments();

    // Load libraries and navigate to default path
    await loadRepos();
    currentPath = accountConfig.savePath || "/";
    await navigateToFolder(currentPath);
  } catch (e) {
    loadingEl.style.display = "none";
    showStatus(`Error: ${e.message}`, true);
    saveStatus.style.display = "block";
    console.error("Popup init error:", e);
  }
}

init();
