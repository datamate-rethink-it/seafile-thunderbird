/**
 * Shared utility functions for Seafile for Thunderbird.
 * Loaded by background.js, management.js, and both popup scripts.
 */

/**
 * Escape a string for safe insertion into HTML.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/**
 * Generate a cryptographically secure random integer in [0, max).
 * @param {number} max
 * @returns {number}
 */
function secureRandomInt(max) {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % max;
}

/**
 * Generate a random password (crypto-safe).
 * Ensures at least one lowercase, uppercase, digit, and special character.
 * First and last characters are alphanumeric (for double-click selection).
 * @param {number} length - Password length (default 12)
 * @returns {string}
 */
function generatePassword(length = 12) {
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
  for (let i = required.length; i < length; i++) {
    rest.push(all[secureRandomInt(all.length)]);
  }
  // Combine and shuffle
  const result = [...required, ...rest];
  for (let i = result.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  // Ensure first and last chars are alphanumeric (for double-click selection)
  const alnum = lower + upper + digits;
  result[0] = alnum[secureRandomInt(alnum.length)];
  result[result.length - 1] = alnum[secureRandomInt(alnum.length)];
  // Make sure we still have at least one special char
  const hasSpecial = result.some(c => special.includes(c));
  if (!hasSpecial) {
    const pos = 1 + secureRandomInt(result.length - 2);
    result[pos] = special[secureRandomInt(special.length)];
  }
  return result.join("");
}

/**
 * Format file size for display.
 * @param {number} bytes
 * @returns {string}
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Apply i18n translations to all elements with data-i18n attributes.
 * Supports data-i18n (textContent), data-i18n-empty (dataset.empty),
 * and data-i18n-placeholder (placeholder).
 */
function applyI18n() {
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const msg = browser.i18n.getMessage(el.getAttribute("data-i18n"));
    if (msg) el.textContent = msg;
  }
  for (const el of document.querySelectorAll("[data-i18n-empty]")) {
    const msg = browser.i18n.getMessage(el.dataset.i18nEmpty);
    if (msg) el.dataset.empty = msg;
  }
  for (const el of document.querySelectorAll("[data-i18n-placeholder]")) {
    const msg = browser.i18n.getMessage(el.dataset.i18nPlaceholder);
    if (msg) el.placeholder = msg;
  }
}

/**
 * Extract hostname from a URL for display.
 * @param {string} url
 * @returns {string}
 */
function getHostLabel(url) {
  try { return new URL(url).hostname; } catch { return url; }
}
