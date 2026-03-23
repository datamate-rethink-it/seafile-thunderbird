/**
 * Popup for inserting Seafile file links into compose emails.
 */

/**
 * Escape a string for safe insertion into HTML.
 */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Generate a cryptographically secure random integer in [0, max).
 */
function secureRandomInt(max) {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % max;
}

const loadingEl = document.getElementById("loading");
const notConfiguredEl = document.getElementById("notConfigured");
const browseView = document.getElementById("browseView");
const detailView = document.getElementById("detailView");
const repoSelectEl = document.getElementById("repoSelect");
const fileListEl = document.getElementById("fileList");
const currentPathEl = document.getElementById("currentPath");
const statusEl = document.getElementById("status");

// Detail view elements
const backBtn = document.getElementById("backBtn");
const selectedFileIcon = document.getElementById("selectedFileIcon");
const selectedFileName = document.getElementById("selectedFileName");
const selectedFileSize = document.getElementById("selectedFileSize");
const existingLinkBar = document.getElementById("existingLinkBar");
const useExistingBtn = document.getElementById("useExistingBtn");
const deleteExistingBtn = document.getElementById("deleteExistingBtn");
const linkOptions = document.getElementById("linkOptions");
const linkPasswordInput = document.getElementById("linkPassword");
const linkExpireDaysInput = document.getElementById("linkExpireDays");
const generatePasswordBtn = document.getElementById("generatePasswordBtn");
const showPasswordInEmailInput = document.getElementById("showPasswordInEmail");
const showPasswordLabel = document.getElementById("showPasswordLabel");
const insertBtn = document.getElementById("insertBtn");

let currentPath = "/";
let currentRepoId = null;
let accountConfig = null;
let composeTabId = null;

// State for the selected file
let selectedFilePath = null;
let selectedFileObj = null;
let existingLink = null;

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
function showStatus(message, type) {
  const cls = type === "error" ? "error" : type === "info" ? "info" : "success";
  statusEl.textContent = message;
  statusEl.className = `status ${cls}`;
}

function clearStatus() {
  statusEl.className = "status";
}

/**
 * Show the browse view.
 */
function showBrowseView() {
  detailView.classList.remove("active");
  browseView.style.display = "block";
  clearStatus();
  selectedFilePath = null;
  existingLink = null;
}

/**
 * Show the detail view for a selected file.
 */
async function showDetailView(file, filePath) {
  selectedFilePath = filePath;
  selectedFileObj = file;
  existingLink = null;

  // Populate file info
  selectedFileIcon.innerHTML = getFileIcon(file.name);
  selectedFileName.textContent = file.name;
  selectedFileSize.textContent = formatSize(file.size);

  // Pre-fill defaults from config
  if (!accountConfig.skipLinkOptions) {
    linkPasswordInput.value = accountConfig.sharePassword || "";
    linkExpireDaysInput.value = accountConfig.shareExpireDays || 0;
    showPasswordInEmailInput.checked = accountConfig.showPasswordInEmail !== false;
    updatePasswordCheckboxVisibility();
  }

  // Switch views
  browseView.style.display = "none";
  detailView.classList.add("active");
  clearStatus();

  // If skipLinkOptions is set, insert directly
  if (accountConfig.skipLinkOptions) {
    await doInsert(accountConfig.sharePassword, accountConfig.shareExpireDays || 0, null, accountConfig.showPasswordInEmail !== false);
    return;
  }

  // Check for existing share links
  existingLinkBar.classList.remove("visible");
  linkOptions.style.display = "block";

  try {
    const result = await sendMessage("checkExistingLink", {
      repoId: currentRepoId,
      path: filePath,
    });
    if (result.links && result.links.length > 0) {
      existingLink = result.links[0];
      existingLinkBar.classList.add("visible");
      linkOptions.style.display = "none";
    }
  } catch (e) {
    // Ignore - just show create form
    console.error("Failed to check existing links:", e);
  }
}

/**
 * Insert a link into the compose email.
 */
async function doInsert(password, expireDays, linkUrl, showPassword) {
  insertBtn.disabled = true;
  clearStatus();
  const fileName = selectedFilePath.split("/").pop();
  const fileSize = selectedFileObj ? formatSize(selectedFileObj.size) : null;

  try {
    // Create share link if no URL provided
    if (!linkUrl) {
      const shareResult = await sendMessage("createFileLink", {
        repoId: currentRepoId,
        path: selectedFilePath,
        password: password || undefined,
        expireDays: expireDays || undefined,
      });
      linkUrl = shareResult.link;
    }

    // Insert into compose
    await sendMessage("insertLinkIntoCompose", {
      link: linkUrl,
      fileName,
      fileSize,
      password: password || "",
      showPasswordInEmail: !!showPassword,
      expireDays: expireDays || 0,
      tabId: composeTabId,
    });

    showStatus(browser.i18n.getMessage("linkInserted") || "Link inserted!", "success");

    // Return to browse after short delay
    setTimeout(() => showBrowseView(), 1200);
  } catch (e) {
    showStatus(`Error: ${e.message}`, "error");
    insertBtn.disabled = false;
    console.error("Failed to insert link:", e);
  }
}

/**
 * Navigate to a folder and load its contents (folders + files).
 */
async function navigateToFolder(path) {
  currentPath = path;
  currentPathEl.textContent = path;
  fileListEl.innerHTML = "";

  try {
    const entries = await sendMessage("listDir", {
      path,
      repoId: currentRepoId,
      includeFiles: true,
    });

    // Parent directory link
    if (path !== "/") {
      const parentLi = document.createElement("li");
      const parentPath = path.substring(0, path.lastIndexOf("/")) || "/";
      parentLi.innerHTML = `<span class="file-icon">${FILE_ICONS.folderUp}</span><span class="file-name">..</span>`;
      parentLi.addEventListener("click", () => navigateToFolder(parentPath));
      fileListEl.appendChild(parentLi);
    }

    // Sort: directories first, then files
    const dirs = entries.filter(e => e.type === "dir");
    const files = entries.filter(e => e.type === "file");

    for (const dir of dirs) {
      const li = document.createElement("li");
      const dirPath = path === "/" ? `/${dir.name}` : `${path}/${dir.name}`;
      li.innerHTML = `
        <span class="file-icon">${FILE_ICONS.folder}</span>
        <span class="file-name">${escapeHtml(dir.name)}</span>
      `;
      li.addEventListener("click", () => navigateToFolder(dirPath));
      fileListEl.appendChild(li);
    }

    for (const file of files) {
      const li = document.createElement("li");
      const filePath = path === "/" ? `/${file.name}` : `${path}/${file.name}`;
      li.innerHTML = `
        <span class="file-icon">${getFileIcon(file.name)}</span>
        <span class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
        <span class="file-size">${formatSize(file.size)}</span>
      `;
      li.addEventListener("click", () => showDetailView(file, filePath));
      fileListEl.appendChild(li);
    }
  } catch (e) {
    console.error("Failed to list directory:", e);
    showStatus(`Error: ${e.message}`, "error");
  }
}

/**
 * Load libraries into the dropdown.
 */
async function loadRepos() {
  const repos = await sendMessage("listRepos");

  repoSelectEl.innerHTML = "";
  const unencrypted = repos.filter(r => !r.encrypted);
  for (const repo of unencrypted) {
    const option = document.createElement("option");
    option.value = repo.repo_id || repo.id;
    option.textContent = repo.repo_name || repo.name;
    repoSelectEl.appendChild(option);
  }

  const defaultRepoId = accountConfig.repoId;
  if (defaultRepoId) {
    repoSelectEl.value = defaultRepoId;
  }
  currentRepoId = repoSelectEl.value;
}

/**
 * Generate a random password (12 chars, mixed case + digits + special).
 */
function generatePassword() {
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const special = "!@#$%&*?";
  const all = lower + upper + digits + special;

  // Ensure at least one of each type
  const required = [
    lower[secureRandomInt(lower.length)],
    upper[secureRandomInt(upper.length)],
    digits[secureRandomInt(digits.length)],
    special[secureRandomInt(special.length)],
  ];
  const rest = [];
  for (let i = required.length; i < 12; i++) {
    rest.push(all[secureRandomInt(all.length)]);
  }
  // Combine and shuffle the middle part, keep alphanumeric at start and end
  const middle = [...required, ...rest];
  for (let i = middle.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [middle[i], middle[j]] = [middle[j], middle[i]];
  }
  // Ensure first and last chars are alphanumeric (for double-click selection)
  const alnum = lower + upper + digits;
  middle[0] = alnum[secureRandomInt(alnum.length)];
  middle[middle.length - 1] = alnum[secureRandomInt(alnum.length)];
  // Make sure we still have at least one special char in the middle
  const hasSpecial = middle.some(c => special.includes(c));
  if (!hasSpecial) {
    const pos = 1 + secureRandomInt(middle.length - 2);
    middle[pos] = special[secureRandomInt(special.length)];
  }
  return middle.join("");
}

// --- Event handlers ---

generatePasswordBtn.addEventListener("click", () => {
  linkPasswordInput.value = generatePassword();
  updatePasswordCheckboxVisibility();
});

linkPasswordInput.addEventListener("input", updatePasswordCheckboxVisibility);

function updatePasswordCheckboxVisibility() {
  showPasswordLabel.style.display = linkPasswordInput.value.trim() ? "flex" : "none";
}

repoSelectEl.addEventListener("change", () => {
  currentRepoId = repoSelectEl.value;
  navigateToFolder("/");
});

backBtn.addEventListener("click", showBrowseView);

insertBtn.addEventListener("click", () => {
  const password = linkPasswordInput.value.trim();
  const expireDays = Math.max(0, parseInt(linkExpireDaysInput.value, 10) || 0);
  const showPassword = showPasswordInEmailInput.checked;
  doInsert(password, expireDays, null, showPassword);
});

useExistingBtn.addEventListener("click", () => {
  if (existingLink) {
    doInsert(null, null, existingLink.link);
  }
});

deleteExistingBtn.addEventListener("click", async () => {
  if (!existingLink) return;
  deleteExistingBtn.disabled = true;
  try {
    const token = existingLink.token || existingLink.link.match(/\/[fd]\/([a-zA-Z0-9]+)\/?/)?.[1];
    if (token) {
      await sendMessage("deleteShareLink", { linkToken: token });
    }
    existingLink = null;
    existingLinkBar.classList.remove("visible");
    linkOptions.style.display = "block";
  } catch (e) {
    showStatus(`Error: ${e.message}`, "error");
  } finally {
    deleteExistingBtn.disabled = false;
  }
});

linkExpireDaysInput.addEventListener("input", () => {
  linkExpireDaysInput.value = linkExpireDaysInput.value.replace(/[^0-9]/g, "");
});

/**
 * Initialize the popup.
 */
async function init() {
  applyI18n();

  try {
    accountConfig = await sendMessage("getAccountConfig");
    if (!accountConfig) {
      loadingEl.style.display = "none";
      notConfiguredEl.style.display = "block";
      return;
    }

    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    composeTabId = tabs[0].id;

    loadingEl.style.display = "none";
    browseView.style.display = "block";

    await loadRepos();
    await navigateToFolder("/");
  } catch (e) {
    loadingEl.style.display = "none";
    showStatus(`Error: ${e.message}`, "error");
    statusEl.style.display = "block";
    console.error("Popup init error:", e);
  }
}

init();
