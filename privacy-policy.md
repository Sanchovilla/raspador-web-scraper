# Raspador — Privacy Policy

**Effective date: April 24, 2026**

---

Raspador is a Chrome extension that helps you extract visible content from web pages. This policy explains exactly what data the extension touches, where it goes, and what we do with it (spoiler: nothing, because it never leaves your device).

We've written this in plain English on purpose. You deserve to understand what a tool is doing on your browser without needing a law degree.

---

## The short version

Raspador runs entirely on your device. It has no servers, no backend, no user accounts, and makes zero network requests of its own. It does not collect, transmit, sell, or share any data about you or your browsing — with anyone, ever.

---

## What Raspador reads from web pages

When you use Raspador on a page, it reads **visible text content** from that page — the same text you can see with your own eyes. Technically, it accesses the `textContent` of DOM elements you target with your configured selectors.

Raspador **never** reads or accesses:

- Passwords or authentication credentials
- Browser cookies or session tokens
- Form field values
- Payment card data or financial information
- Any content that isn't visible rendered text on the page

The content script only activates when you explicitly trigger it. It does not run silently in the background, and it does not monitor your browsing activity.

---

## What gets stored, and where

Raspador uses **`chrome.storage.local`** — Chrome's built-in, on-device storage — to save two things:

1. **Scraping configurations** — the column names, CSS selectors, XPath expressions, and filters you set up for specific sites. These are saved so you don't have to reconfigure them every time you visit a page.

2. **Pick relay data** — a temporary CSS selector string written to storage when you use the visual element picker. It is read immediately and cleared right away. It is not retained.

That's it. Nothing else is stored.

`chrome.storage.local` data lives **only on your device**, inside your Chrome profile. Raspador itself has no mechanism to read, access, or retrieve this data remotely.

### A note about Chrome Sync

If you have **Chrome Sync enabled** in your Chrome settings, Google may synchronise your extension storage data across your devices as part of your browser profile. This is a Chrome-level feature that you control — Raspador does not initiate or influence it. If you'd prefer your Raspador configurations not to sync, you can manage Chrome Sync in your browser settings at `chrome://settings/syncSetup`.

---

## How exports work

When you export your scraped data as CSV, JSON, or PDF, the file is saved directly to your **Downloads folder** using Chrome's built-in download API. The file goes from the page to your disk — no upload, no cloud storage, no intermediate server. You own your exports completely.

---

## What we don't do

To be unambiguous:

- **No analytics.** We don't use Google Analytics, Mixpanel, or any other analytics service.
- **No telemetry.** We don't collect crash reports, usage statistics, or performance data.
- **No external API calls.** Raspador makes no network requests on your behalf.
- **No data collection.** We have no database of user data because no user data ever reaches us.
- **No advertising.** We don't serve ads or share data with advertisers.
- **No selling of data.** There is nothing to sell.

---

## Permissions we request and why

Raspador requests only the Chrome permissions it needs to function:

| Permission | Why it's needed |
|---|---|
| `activeTab` | To read content from the tab you're currently working on |
| `storage` | To save your scraping configurations locally |
| `downloads` | To save exported files to your Downloads folder |
| `scripting` | To run the content script that reads page content |

We request access to page content only on tabs where you explicitly activate the extension.

---

## Children's privacy

Raspador is a general-purpose developer tool and is not directed at children under 13. We do not knowingly collect any information from children.

---

## Changes to this policy

If we ever change how Raspador handles data in a meaningful way, we'll update this policy and change the effective date at the top. For a tool with no data collection, we don't anticipate much reason to change it — but we'll be transparent if we do.

---

## Questions?

If you have any questions about this privacy policy or how Raspador works, feel free to reach out:

**Email:** [privacy@raspador.app](mailto:privacy@raspador.app)

We're happy to explain anything in more detail.

---

*Raspador is built to be a tool you can trust. Your data is yours — it stays on your machine, under your control.*
