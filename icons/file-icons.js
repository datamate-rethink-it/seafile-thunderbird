/**
 * SVG file type icons (Lucide-style, 24x24 viewBox, stroke-based with color accents).
 * Shared across management, save-attachments, and insert-link popups.
 */

const SVG_ATTRS = 'xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const FILE_BASE = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>';

const FILE_ICONS = {
  folder:    `<svg ${SVG_ATTRS}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" stroke="#e8a735" fill="#fdf6e3"/></svg>`,
  folderUp:  `<svg ${SVG_ATTRS}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" stroke="#e8a735" fill="#fdf6e3"/><polyline points="12 17 12 11" stroke="#e8a735"/><polyline points="9 14 12 11 15 14" stroke="#e8a735"/></svg>`,
  file:      `<svg ${SVG_ATTRS}>${FILE_BASE}</svg>`,
  text:      `<svg ${SVG_ATTRS}>${FILE_BASE}<line x1="16" y1="13" x2="8" y2="13" stroke="#4a90d9"/><line x1="16" y1="17" x2="8" y2="17" stroke="#4a90d9"/><polyline points="10 9 9 9 8 9" stroke="#4a90d9"/></svg>`,
  image:     `<svg ${SVG_ATTRS}>${FILE_BASE}<circle cx="12" cy="15" r="2" stroke="#2ba050"/><path d="M8 21l3.1-3.1a1 1 0 0 1 1.4 0l1 1a1 1 0 0 0 1.4 0L18 15" stroke="#2ba050"/></svg>`,
  spreadsheet: `<svg ${SVG_ATTRS}>${FILE_BASE}<line x1="8" y1="13" x2="16" y2="13" stroke="#1a874a"/><line x1="8" y1="17" x2="16" y2="17" stroke="#1a874a"/><line x1="12" y1="11" x2="12" y2="19" stroke="#1a874a"/></svg>`,
  presentation: `<svg ${SVG_ATTRS}>${FILE_BASE}<rect x="8" y="13" width="3" height="4" stroke="#d35230"/><rect x="13" y="11" width="3" height="6" stroke="#d35230"/></svg>`,
  archive:   `<svg ${SVG_ATTRS}>${FILE_BASE}<line x1="12" y1="10" x2="12" y2="10.01" stroke="#b8860b"/><line x1="12" y1="13" x2="12" y2="13.01" stroke="#b8860b"/><line x1="12" y1="16" x2="12" y2="16.01" stroke="#b8860b"/></svg>`,
  audio:     `<svg ${SVG_ATTRS}>${FILE_BASE}<circle cx="14" cy="16" r="2" stroke="#8b5cf6"/><line x1="16" y1="16" x2="16" y2="11" stroke="#8b5cf6"/><path d="M16 12.5c-1.3-.8-2.7-.8-4 0" stroke="#8b5cf6"/></svg>`,
  video:     `<svg ${SVG_ATTRS}>${FILE_BASE}<polygon points="10 13 15 16 10 19" stroke="#3b82f6" fill="#3b82f6" opacity="0.8"/></svg>`,
  code:      `<svg ${SVG_ATTRS}>${FILE_BASE}<polyline points="8 14 6 16 8 18" stroke="#0d9488"/><polyline points="14 14 16 16 14 18" stroke="#0d9488"/><line x1="11" y1="13" x2="13" y2="19" stroke="#0d9488"/></svg>`,
  pdf:       `<svg ${SVG_ATTRS}>${FILE_BASE}<text x="9" y="19" font-size="7" font-weight="bold" fill="#dc2626" stroke="none" font-family="sans-serif">PDF</text></svg>`,
};

const EXT_TO_ICON = {
  // Images
  png: "image", jpg: "image", jpeg: "image", gif: "image",
  svg: "image", webp: "image", bmp: "image", ico: "image", tiff: "image",
  // PDF
  pdf: "pdf",
  // Documents
  doc: "text", docx: "text", odt: "text", rtf: "text", txt: "text", pages: "text",
  // Spreadsheets
  xls: "spreadsheet", xlsx: "spreadsheet", ods: "spreadsheet", csv: "spreadsheet", numbers: "spreadsheet",
  // Presentations
  ppt: "presentation", pptx: "presentation", odp: "presentation", key: "presentation",
  // Archives
  zip: "archive", rar: "archive", tar: "archive", gz: "archive",
  "7z": "archive", bz2: "archive", xz: "archive",
  // Audio
  mp3: "audio", wav: "audio", ogg: "audio", flac: "audio",
  aac: "audio", wma: "audio", m4a: "audio",
  // Video
  mp4: "video", mkv: "video", avi: "video", mov: "video",
  webm: "video", wmv: "video", flv: "video",
  // Code
  js: "code", ts: "code", py: "code", java: "code", c: "code", cpp: "code",
  h: "code", html: "code", css: "code", json: "code", xml: "code",
  md: "code", sh: "code", rb: "code", go: "code", rs: "code", php: "code",
};

// Status icons (same style, used for progress feedback)
const STATUS_ICONS = {
  pending:  `<svg ${SVG_ATTRS}><circle cx="12" cy="12" r="10" stroke="#999"/><polyline points="12 6 12 12 16 14" stroke="#999"/></svg>`,
  success:  `<svg ${SVG_ATTRS}><circle cx="12" cy="12" r="10" stroke="#2ba050"/><polyline points="8 12 11 15 16 9" stroke="#2ba050"/></svg>`,
  error:    `<svg ${SVG_ATTRS}><circle cx="12" cy="12" r="10" stroke="#dc2626"/><line x1="15" y1="9" x2="9" y2="15" stroke="#dc2626"/><line x1="9" y1="9" x2="15" y2="15" stroke="#dc2626"/></svg>`,
};

/**
 * Get an SVG icon for a file based on its extension.
 * @param {string} name - File name
 * @returns {string} SVG HTML string
 */
function getFileIcon(name) {
  const ext = name.split(".").pop().toLowerCase();
  return FILE_ICONS[EXT_TO_ICON[ext] || "file"];
}
