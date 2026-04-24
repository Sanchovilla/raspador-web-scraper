# Raspador — Web Scraper

A Chrome browser extension for extracting structured data from any webpage into CSV. Built for investigative and research workflows.

![Version](https://img.shields.io/badge/version-1.0-orange) ![Manifest](https://img.shields.io/badge/manifest-v3-blue) ![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

- **Auto-detection** — Finds tables, card lists, `<li>` rows, and repeating div structures automatically
- **Pick Row** — Click any element on a page to use it as the repeating row template
- **XPath Column Mapping** — Add custom columns extracted via XPath from each row element
- **Regex Filters** — Filter rows by column value using full JavaScript regex, with NOT invert support
- **Multi-page Crawling** — Auto-clicks the Next button with configurable delays and page limits
- **Pick Next** — Click the pagination button on the page to set it as the crawl target
- **Deduplication** — Skips duplicate rows across pages automatically
- **CSV Export** — UTF-8 with BOM (Excel-compatible), named with hostname and timestamp
- **TSV Copy** — Copy data directly to clipboard for pasting into spreadsheets
- **Saved Configs** — Save and reload full scrape configurations per site (selectors, XPath columns, filters, delays)
- **Session Log** — Timestamped log of every crawl action and extraction event
- **100% Local & Private** — No servers, no accounts, no telemetry. All data stays on your device.

---

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Select the `raspador` folder (the one containing `manifest.json`)

---

## How to Use

### Basic Extraction
1. Navigate to any page with data
2. Click the Raspador icon in your toolbar
3. Click **Detect Data** — it scores and ranks all tables, lists, and card grids on the page
4. Use **‹ ›** to cycle between detected sources
5. Use **Pick Row** to manually click a repeating row if auto-detection misses it

### Column Control (Columns tab)
- Toggle individual columns in/out of your export using the chip buttons
- Add **XPath columns** with a name and XPath expression (e.g. `.//span[@class='case-number']`)
- Add **Regex filters** to keep only rows matching a pattern — supports full JS regex and NOT invert

### Multi-page Crawling (Crawl tab)
1. Click **Pick** next to the Next Button field, then click the Next/→ button on the page
2. Re-open Raspador — the selector is auto-filled
3. Set min/max delay (seconds between page loads)
4. Optionally set a max page limit
5. Click **Start Crawl** — Raspador auto-navigates and accumulates rows across all pages

### Saved Configs (Configs tab)
- Save the full state (selectors, XPath columns, filters, delays) under a name
- Load configs in one click when returning to the same site

---

## Privacy & Technology

Raspador is built entirely from:

| Component | Technology | Origin |
|---|---|---|
| Extension API | Chrome Manifest V3 | Google open specification |
| Content Scripts | Vanilla JavaScript | Written from scratch |
| Popup UI | HTML / CSS / JS | No frameworks, no npm |
| XPath Evaluation | `document.evaluate()` | W3C native browser API |
| Regex Filtering | JS `RegExp` | Native V8 engine |
| CSV Export | `Blob` + `chrome.downloads` | Chrome native download API |
| Config Storage | `chrome.storage.local` | Sandboxed to this extension only |

**No data ever leaves your device.** No network requests are made by the extension itself.

### Permissions
- `activeTab` — Read the page you are currently viewing only
- `scripting` — Inject the content script for detection and extraction
- `downloads` — Save CSV files to your Downloads folder
- `storage` — Store your saved configs locally
- `<all_urls>` — Allow the content script to run on any site you navigate to

---

## License

MIT — free to use, modify, and distribute.
