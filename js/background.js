/* ============================================================
   OSINT Data Collector — Background Service Worker
   Handles cross-context messaging for crawl coordination
   ============================================================ */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Pass-through messages between popup and content scripts if needed
  // (Currently content.js and popup.js communicate directly via chrome.tabs API)
  return false;
});
