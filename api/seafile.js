/**
 * Seafile API client for Thunderbird CloudFile integration.
 */
class SeafileAPI {

  /**
   * Authenticate with username/password and get an API token.
   * @param {string} server - Seafile server URL (e.g. "https://cloud.seafile.com")
   * @param {string} username
   * @param {string} password
   * @param {string} [otp] - Optional 2FA/TOTP code
   * @returns {Promise<string>} API token
   */
  async getToken(server, username, password, otp) {
    const headers = { "Content-Type": "application/x-www-form-urlencoded" };
    if (otp) {
      headers["X-SEAFILE-OTP"] = otp;
    }
    const resp = await fetch(`${server}/api2/auth-token/`, {
      method: "POST",
      headers,
      body: new URLSearchParams({ username, password }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error(`Auth failed (${resp.status}):`, text);
      throw new Error(`Authentication failed (${resp.status})`);
    }
    const data = await resp.json();
    return data.token;
  }

  /**
   * Get server info (features, version, etc.).
   * @param {string} server
   * @returns {Promise<Object>}
   */
  async getServerInfo(server) {
    const resp = await fetch(`${server}/api2/server-info/`);
    if (!resp.ok) {
      throw new Error(`Failed to get server info (${resp.status})`);
    }
    return await resp.json();
  }

  /**
   * Request a client SSO login link.
   * @param {string} server
   * @returns {Promise<Object>} Object with { link } property
   */
  async createSSOLink(server) {
    const resp = await fetch(`${server}/api2/client-sso-link/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        shib_platform: "thunderbird-extension",
        shib_device_name: "Thunderbird",
      }),
    });
    if (!resp.ok) {
      throw new Error(`Failed to create SSO link (${resp.status})`);
    }
    return await resp.json();
  }

  /**
   * Poll SSO login status.
   * @param {string} server
   * @param {string} ssoToken - Token from createSSOLink
   * @returns {Promise<Object>} { status: "waiting"|"success"|"error", username?, apiToken? }
   */
  async checkSSOStatus(server, ssoToken) {
    const resp = await fetch(`${server}/api2/client-sso-link/${ssoToken}/`);
    if (!resp.ok) {
      throw new Error(`Failed to check SSO status (${resp.status})`);
    }
    return await resp.json();
  }

  /**
   * Get account info (display name, contact email, usage, etc.).
   * @param {string} server
   * @param {string} token
   * @returns {Promise<Object>} Account info with name, email, contact_email, usage, total
   */
  async getAccountInfo(server, token) {
    const resp = await fetch(`${server}/api2/account/info/`, {
      headers: { Authorization: `Token ${token}` },
    });
    if (!resp.ok) {
      throw new Error(`Failed to get account info (${resp.status})`);
    }
    return await resp.json();
  }

  /**
   * List all accessible libraries/repos.
   * @param {string} server
   * @param {string} token
   * @returns {Promise<Array>} List of repos with id, name, size, etc.
   */
  async listRepos(server, token) {
    const resp = await fetch(`${server}/api/v2.1/repos/`, {
      headers: { Authorization: `Token ${token}` },
    });
    if (!resp.ok) {
      throw new Error(`Failed to list libraries (${resp.status})`);
    }
    const data = await resp.json();
    return data.repos || data;
  }

  /**
   * Get an upload link for a given repo and target directory.
   * @param {string} server
   * @param {string} token
   * @param {string} repoId
   * @param {string} [parentDir="/"] - Target directory (upload token is bound to this path)
   * @returns {Promise<string>} Upload URL
   */
  async getUploadLink(server, token, repoId, parentDir = "/") {
    const params = new URLSearchParams({ p: parentDir });
    const resp = await fetch(`${server}/api2/repos/${repoId}/upload-link/?${params}`, {
      headers: { Authorization: `Token ${token}` },
    });
    if (!resp.ok) {
      throw new Error(`Failed to get upload link (${resp.status})`);
    }
    const link = await resp.json();
    // API returns the link as a plain string (with quotes)
    return typeof link === "string" ? link : link.upload_link || link;
  }

  /**
   * Upload a file to Seafile.
   * @param {string} uploadLink - Upload URL from getUploadLink()
   * @param {string} token
   * @param {File|Blob} file - File data
   * @param {string} fileName - Name of the file
   * @param {string} parentDir - Target directory (e.g. "/Thunderbird-Attachments")
   * @param {AbortSignal} [signal] - Optional abort signal
   * @returns {Promise<Object>} Upload result with name, id, size
   */
  async uploadFile(uploadLink, token, file, fileName, parentDir, signal, replace = true) {
    const formData = new FormData();
    formData.append("file", file, fileName);
    formData.append("parent_dir", parentDir);
    formData.append("replace", replace ? "1" : "0");

    const url = uploadLink.endsWith("?ret-json=1")
      ? uploadLink
      : `${uploadLink}?ret-json=1`;

    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Token ${token}` },
      body: formData,
      signal,
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error(`Upload failed (${resp.status}):`, text);
      throw new Error(`File upload failed (${resp.status})`);
    }
    const data = await resp.json();
    // Response is an array of uploaded files
    return Array.isArray(data) ? data[0] : data;
  }

  /**
   * Create a share/download link for a file.
   * @param {string} server
   * @param {string} token
   * @param {string} repoId
   * @param {string} path - File path within the repo
   * @param {Object} [options]
   * @param {string} [options.password] - Optional password protection
   * @param {number} [options.expireDays] - Optional expiry in days
   * @returns {Promise<Object>} Share link object with link property
   */
  /**
   * Get existing share links for a file.
   * @param {string} server
   * @param {string} token
   * @param {string} repoId
   * @param {string} path - File path within the repo
   * @returns {Promise<Array>} Array of existing share link objects
   */
  async getShareLinks(server, token, repoId, path) {
    const params = new URLSearchParams({ repo_id: repoId, path });
    const resp = await fetch(`${server}/api/v2.1/share-links/?${params}`, {
      headers: { Authorization: `Token ${token}` },
    });
    if (!resp.ok) {
      return [];
    }
    return await resp.json();
  }

  async createShareLink(server, token, repoId, path, options = {}) {
    const body = { repo_id: repoId, path };
    if (options.password) {
      body.password = options.password;
    }
    if (options.expireDays) {
      body.expire_days = options.expireDays;
    }

    const resp = await fetch(`${server}/api/v2.1/share-links/`, {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error(`Share link failed (${resp.status}):`, text);
      throw new Error(`Failed to create share link (${resp.status})`);
    }
    return await resp.json();
  }

  /**
   * Delete a share link.
   * @param {string} server
   * @param {string} token
   * @param {string} linkToken - The share link token (from share link URL)
   */
  async deleteShareLink(server, token, linkToken) {
    const resp = await fetch(`${server}/api/v2.1/share-links/${linkToken}/`, {
      method: "DELETE",
      headers: { Authorization: `Token ${token}` },
    });
    if (!resp.ok && resp.status !== 404) {
      throw new Error(`Failed to delete share link (${resp.status})`);
    }
  }

  /**
   * Delete a file from a repo.
   * @param {string} server
   * @param {string} token
   * @param {string} repoId
   * @param {string} path - File path within the repo
   */
  async deleteFile(server, token, repoId, path) {
    const resp = await fetch(
      `${server}/api2/repos/${repoId}/file/?p=${encodeURIComponent(path)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Token ${token}` },
      }
    );
    if (!resp.ok && resp.status !== 404) {
      throw new Error(`Failed to delete file (${resp.status})`);
    }
  }

  /**
   * Create a directory in a repo (used to auto-create upload folder).
   * @param {string} server
   * @param {string} token
   * @param {string} repoId
   * @param {string} path - Directory path to create
   */
  async createDir(server, token, repoId, path) {
    const resp = await fetch(
      `${server}/api2/repos/${repoId}/dir/?p=${encodeURIComponent(path)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ operation: "mkdir" }),
      }
    );
    // 409 = already exists, which is fine
    if (!resp.ok && resp.status !== 409) {
      throw new Error(`Failed to create directory (${resp.status})`);
    }
  }

  /**
   * Rename a file in a repo.
   * @param {string} server
   * @param {string} token
   * @param {string} repoId
   * @param {string} path - Current file path
   * @param {string} newName - New file name (not full path)
   * @returns {Promise<void>}
   */
  async renameFile(server, token, repoId, path, newName) {
    const resp = await fetch(
      `${server}/api2/repos/${repoId}/file/?p=${encodeURIComponent(path)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ operation: "rename", newname: newName }),
      }
    );
    if (!resp.ok) {
      const text = await resp.text();
      console.error(`Rename failed (${resp.status}):`, text);
      throw new Error(`Failed to rename file (${resp.status})`);
    }
  }

  /**
   * Check if a directory exists in a repo.
   * @param {string} server
   * @param {string} token
   * @param {string} repoId
   * @param {string} path
   * @returns {Promise<boolean>}
   */
  /**
   * List directory contents (subdirectories only, for folder navigation).
   * @param {string} server
   * @param {string} token
   * @param {string} repoId
   * @param {string} path - Directory path
   * @returns {Promise<Array>} Array of dir entries with name, type, etc.
   */
  async listDir(server, token, repoId, path = "/") {
    const resp = await fetch(
      `${server}/api2/repos/${repoId}/dir/?p=${encodeURIComponent(path)}`,
      {
        headers: { Authorization: `Token ${token}` },
      }
    );
    if (!resp.ok) {
      throw new Error(`Failed to list directory (${resp.status})`);
    }
    return await resp.json();
  }

  async dirExists(server, token, repoId, path) {
    const resp = await fetch(
      `${server}/api2/repos/${repoId}/dir/?p=${encodeURIComponent(path)}`,
      {
        headers: { Authorization: `Token ${token}` },
      }
    );
    return resp.ok;
  }
}
