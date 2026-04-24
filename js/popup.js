/* ============================================================
   Raspador — Web Scraper  |  Popup Script  v2.0
   Features: detection, XPath columns, regex filters,
             session log, per-site saved configs, crawl
   ============================================================ */

'use strict';

// ---- State ----
let allRows     = [];       // full accumulated dataset
let filteredRows = [];      // post-filter view
let candidates  = [];
let currentCand = 0;
let hiddenCols  = new Set();
let xpathCols   = [];       // [{name, xpath}]
let regexFilters = [];      // [{column, pattern, invert}]
let isCrawling  = false;
let crawlPageNum = 1;
let crawlTimer  = null;
let activeTab   = null;
let sessionLog  = [];       // [{time, msg, type, badge}]

// ---- DOM ----
const $ = id => document.getElementById(id);

const rowCountEl   = $('rowCount');
const statusBar    = $('statusBar');
const statusText   = $('statusText');
const pageCountEl  = $('pageCount');
const btnDetect    = $('btnDetect');
const btnPickEl    = $('btnPickElement');
const btnClearData = $('btnClearData');
const candidateRow = $('candidateRow');
const btnPrevCand  = $('btnPrevCand');
const btnNextCand  = $('btnNextCand');
const candName     = $('candName');
const candCount    = $('candCount');
const previewSection = $('previewSection');
const previewHead  = $('previewHead');
const previewBody  = $('previewBody');
const previewNote  = $('previewNote');
const colControls  = $('colControls');
const exportSection = $('exportSection');
const emptyState   = $('emptyState');
const nextSelector = $('nextSelector');
const btnPickNext  = $('btnPickNext');
const nextPreview  = $('nextPreview');
const delayMin     = $('delayMin');
const delayMax     = $('delayMax');
const maxPages     = $('maxPages');
const settleWait   = $('settleWait');
const dedupRows    = $('dedupRows');
const btnStartCrawl = $('btnStartCrawl');
const btnStopCrawl  = $('btnStopCrawl');
const btnExportCSV  = $('btnExportCSV');
const btnCopyClip   = $('btnCopyClip');
const exportInfo    = $('exportInfo');
const xpathList    = $('xpathList');
const btnAddXpath  = $('btnAddXpath');
const filterList   = $('filterList');
const btnAddFilter = $('btnAddFilter');
const btnApplyFilters = $('btnApplyFilters');
const filterCount  = $('filterCount');
const logList      = $('logList');
const btnClearLog  = $('btnClearLog');
const configList   = $('configList');
const configName   = $('configName');
const btnSaveConfigTab = $('btnSaveConfigTab');
const btnSaveConfig    = $('btnSaveConfig');

// ---- Init ----
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  activeTab = tabs[0];
  setStatus('Ready — click Detect to begin');
  loadSavedConfigs();
  checkStoragePicks(); // Read any pending picks from content script storage relay
  // Pre-fill config name suggestion
  try {
    const h = new URL(activeTab.url).hostname.replace('www.', '');
    configName.placeholder = h;
  } catch {}
});

// ---- Tab switching ----
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    $('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// ---- Storage relay: read Pick results when popup opens ----
// Content script writes picks to storage (popup is closed during pick).
// We check on every popup open and clear after reading.
async function checkStoragePicks() {
  const data = await storageGet('raspador_picked_next');
  if (data && Date.now() - data.timestamp < 60000) {
    await new Promise(r => chrome.storage.local.remove('raspador_picked_next', r));
    nextSelector.value = data.selector;
    nextPreview.textContent = `✓ Next button: "${data.text || data.tagName}" → ${data.selector}`;
    nextPreview.classList.remove('hidden');
    addLog(`Next button set: "${data.text || data.tagName}"`, 'info', data.selector);
    setStatus('Next button selected');
    document.querySelector('[data-tab="crawl"]').click();
  }

  const elData = await storageGet('raspador_picked_element');
  if (elData && Date.now() - elData.timestamp < 60000) {
    await new Promise(r => chrome.storage.local.remove('raspador_picked_element', r));
    candidates.unshift({ label: elData.selector, selector: elData.selector, type: 'list', rowCount: elData.rowCount, score: 100 });
    currentCand = 0;
    mergeRows(elData.rows || []);
    applyFiltersAndUpdate();
    updateCandidateUI();
    showSections();
    addLog(`Picked row element — ${elData.rowCount} rows found`, 'info', elData.rowCount + ' rows');
    setStatus(`Row picked: ${elData.rowCount} rows`);
  }
}

// ---- Detect ----
btnDetect.addEventListener('click', async () => {
  setStatus('Detecting data structures…');
  btnDetect.disabled = true;
  try {
    const res = await msg({ action: 'detect' });
    candidates = res.candidates || [];
    currentCand = 0;
    if (!candidates.length) {
      setStatus('No structured data found — try Pick Row');
      addLog('Detection found no candidates', 'warn');
      btnDetect.disabled = false;
      return;
    }
    updateCandidateUI();
    await extractCurrentCandidate();
    showSections();
    addLog(`Detected ${candidates.length} source(s), top: "${candidates[0].label}"`, 'success', candidates[0].rowCount + ' rows');
    setStatus(`Detected ${candidates.length} source(s) — ${allRows.length} rows`);
  } catch (e) {
    setStatus('Error: could not access page. Try reloading.');
    addLog('Detection error: ' + e.message, 'error');
  }
  btnDetect.disabled = false;
});

// ---- Pick element ----
btnPickEl.addEventListener('click', async () => {
  if (!activeTab) return;
  await sendToContent({ action: 'startPickElement' });
  addLog('Click a repeating row on the page, then re-open Raspador', 'info');
  setStatus('Click a row on the page — then re-open Raspador');
  // Minimize popup so user can click on page
  window.close();
});

// ---- Candidate nav ----
btnPrevCand.addEventListener('click', () => {
  if (!candidates.length) return;
  currentCand = (currentCand - 1 + candidates.length) % candidates.length;
  updateCandidateUI();
  extractCurrentCandidate();
});
btnNextCand.addEventListener('click', () => {
  if (!candidates.length) return;
  currentCand = (currentCand + 1) % candidates.length;
  updateCandidateUI();
  extractCurrentCandidate();
});

// ---- Clear data ----
btnClearData.addEventListener('click', () => {
  allRows = []; filteredRows = [];
  crawlPageNum = 1;
  updatePreview();
  updateRowCount();
  exportInfo.textContent = '';
  addLog('Data cleared', 'info');
  setStatus('Data cleared');
});

// ---- Pick Next button ----
btnPickNext.addEventListener('click', async () => {
  if (!activeTab) return;
  await sendToContent({ action: 'startPickNext' });
  addLog('Click the Next button on the page, then re-open Raspador', 'info');
  setStatus('Click the Next button on the page — then re-open Raspador');
  window.close();
});

// Next selector live check
nextSelector.addEventListener('change', async () => {
  const sel = nextSelector.value.trim();
  if (!sel) { nextPreview.classList.add('hidden'); return; }
  try {
    const res = await msg({ action: 'checkNextExists', selector: sel });
    if (res.exists) {
      nextPreview.textContent = `✓ Found: "${res.text || 'element'}"`;
      nextPreview.classList.remove('hidden');
    } else {
      nextPreview.textContent = '✗ Not found on this page';
      nextPreview.classList.remove('hidden');
    }
  } catch {}
});

// ---- XPath columns ----
btnAddXpath.addEventListener('click', () => {
  addXpathRow();
});

function addXpathRow(name = '', xpath = '') {
  const id = Date.now();
  xpathCols.push({ id, name, xpath });

  const row = document.createElement('div');
  row.className = 'xpath-row';
  row.dataset.id = id;
  row.innerHTML = `
    <input type="text" placeholder="col_name" value="${esc(name)}" class="xpath-name" />
    <input type="text" placeholder=".//span[@class='value']" value="${esc(xpath)}" class="xpath-expr" />
    <button class="row-del" title="Remove">✕</button>
  `;

  row.querySelector('.xpath-name').addEventListener('input', e => {
    const entry = xpathCols.find(x => x.id === id);
    if (entry) entry.name = e.target.value.trim();
  });
  row.querySelector('.xpath-expr').addEventListener('input', e => {
    const entry = xpathCols.find(x => x.id === id);
    if (entry) entry.xpath = e.target.value.trim();
  });
  row.querySelector('.row-del').addEventListener('click', () => {
    xpathCols = xpathCols.filter(x => x.id !== id);
    row.remove();
  });

  xpathList.appendChild(row);
}

// ---- Regex filters ----
btnAddFilter.addEventListener('click', () => addFilterRow());

function addFilterRow(column = '', pattern = '', invert = false) {
  const id = Date.now();
  regexFilters.push({ id, column, pattern, invert });

  const cols = getAllColumns();
  const options = cols.length
    ? cols.map(c => `<option value="${esc(c)}" ${c===column?'selected':''}>${esc(c)}</option>`).join('')
    : `<option value="">— detect data first —</option>`;

  const row = document.createElement('div');
  row.className = 'filter-row';
  row.dataset.id = id;
  row.innerHTML = `
    <select class="filter-col">${options}</select>
    <input type="text" placeholder="regex pattern" value="${esc(pattern)}" class="filter-pat" />
    <label style="font-size:0.7rem;color:var(--text-muted);white-space:nowrap;cursor:pointer;">
      <input type="checkbox" ${invert?'checked':''} class="filter-inv" /> NOT
    </label>
    <button class="row-del" title="Remove">✕</button>
  `;

  row.querySelector('.filter-col').addEventListener('change', e => {
    const f = regexFilters.find(f => f.id === id);
    if (f) f.column = e.target.value;
  });
  row.querySelector('.filter-pat').addEventListener('input', e => {
    const f = regexFilters.find(f => f.id === id);
    if (f) f.pattern = e.target.value;
  });
  row.querySelector('.filter-inv').addEventListener('change', e => {
    const f = regexFilters.find(f => f.id === id);
    if (f) f.invert = e.target.checked;
  });
  row.querySelector('.row-del').addEventListener('click', () => {
    regexFilters = regexFilters.filter(f => f.id !== id);
    row.remove();
  });

  filterList.appendChild(row);
}

btnApplyFilters.addEventListener('click', () => {
  applyFiltersAndUpdate();
});

function applyFiltersAndUpdate() {
  filteredRows = applyFilters(allRows);
  updatePreview();
  updateRowCount();
  const activeFilters = regexFilters.filter(f => f.pattern && f.pattern.trim());
  const removed = allRows.length - filteredRows.length;
  if (activeFilters.length) {
    filterCount.textContent = `${filteredRows.length} / ${allRows.length} rows match`;
    if (removed) addLog(`Filters applied — ${removed} rows excluded`, 'info', filteredRows.length + ' kept');
  } else {
    filterCount.textContent = '';
  }
}

function applyFilters(rows) {
  const activeFilters = regexFilters.filter(f => f.pattern.trim());
  if (!activeFilters.length) return rows;
  return rows.filter(row => {
    return activeFilters.every(f => {
      const val = String(row[f.column] ?? '');
      let match = false;
      try { match = new RegExp(f.pattern, 'i').test(val); } catch { match = val.includes(f.pattern); }
      return f.invert ? !match : match;
    });
  });
}

// ---- Crawl ----
btnStartCrawl.addEventListener('click', () => {
  if (isCrawling) return;
  startCrawl();
});
btnStopCrawl.addEventListener('click', () => stopCrawl('Stopped by user'));

async function startCrawl() {
  isCrawling = true;
  crawlPageNum = 1;
  btnStartCrawl.classList.add('hidden');
  btnStopCrawl.classList.remove('hidden');
  statusBar.classList.add('crawling');

  // Extract page 1 now
  await extractCurrentCandidate(false);
  updatePageCount(1);
  addLog('Crawl started — page 1 extracted', 'success', allRows.length + ' rows');
  setStatus(`<span class="crawling-indicator">●</span> Page 1 complete — ${allRows.length} rows`);

  scheduleCrawlStep();
}

function scheduleCrawlStep() {
  if (!isCrawling) return;
  const mn  = parseFloat(delayMin.value)  || 2;
  const mx  = parseFloat(delayMax.value)  || 5;
  const sw  = parseFloat(settleWait.value) || 1.5;
  const pg  = parseInt(maxPages.value) || 0;
  const delay = (mn + Math.random() * Math.max(0, mx - mn)) * 1000;

  crawlTimer = setTimeout(async () => {
    if (!isCrawling) return;

    if (pg > 0 && crawlPageNum >= pg) {
      stopCrawl(`Page limit reached (${pg} pages)`);
      return;
    }

    // Check if next exists, then click it
    const nextSel = nextSelector.value.trim() || null;
    try {
      const check = await msg({ action: 'checkNextExists', selector: nextSel });
      if (!check.exists) { stopCrawl('No more pages — crawl complete'); return; }

      await msg({ action: 'clickNext', selector: nextSel });
      addLog(`Clicked next — waiting ${sw}s for page to load…`, 'info', `Page ${crawlPageNum + 1}`);

      // Wait for page to settle
      crawlTimer = setTimeout(async () => {
        if (!isCrawling) return;
        crawlPageNum++;
        updatePageCount(crawlPageNum);
        setStatus(`<span class="crawling-indicator">●</span> Page ${crawlPageNum} — ${allRows.length} rows total`);

        const before = allRows.length;
        await extractCurrentCandidate(true);
        const added = allRows.length - before;
        addLog(`Page ${crawlPageNum} extracted`, 'success', `+${added} rows`);

        scheduleCrawlStep();
      }, sw * 1000 + 300);

    } catch (e) {
      stopCrawl('Crawl error: ' + e.message);
    }
  }, delay);
}

function stopCrawl(reason) {
  isCrawling = false;
  if (crawlTimer) { clearTimeout(crawlTimer); crawlTimer = null; }
  btnStartCrawl.classList.remove('hidden');
  btnStopCrawl.classList.add('hidden');
  statusBar.classList.remove('crawling');
  applyFiltersAndUpdate();
  setStatus(reason || 'Crawl complete');
  addLog(reason || 'Crawl complete', 'success', `${allRows.length} total rows, ${crawlPageNum} pages`);
  exportInfo.textContent = `${filteredRows.length} rows across ${crawlPageNum} page(s)`;
}

// ---- Extract current candidate ----
async function extractCurrentCandidate(append = false) {
  if (!candidates.length) return;
  const cand = candidates[currentCand];
  try {
    const activeXpaths = xpathCols.filter(x => x.name && x.xpath);
    const res = await msg({ action: 'extract', candidate: cand, xpathCols: activeXpaths });
    const rows = res.rows || [];
    if (!append) {
      allRows = rows;
    } else {
      const newRows = dedupRows.checked ? dedup(allRows, rows) : rows;
      allRows = allRows.concat(newRows);
    }
    applyFiltersAndUpdate();
    updateRowCount();
  } catch (e) {
    addLog('Extraction error: ' + e.message, 'error');
  }
}

function dedup(existing, newRows) {
  const keys = new Set(existing.map(r => rowKey(r)));
  return newRows.filter(r => {
    const k = rowKey(r);
    if (keys.has(k)) return false;
    keys.add(k);
    return true;
  });
}

function rowKey(r) {
  return JSON.stringify(Object.values(r).slice(0, 4));
}

// ---- Export ----
btnExportCSV.addEventListener('click', () => {
  const rows = filteredRows.length ? filteredRows : allRows;
  if (!rows.length) return;
  const cols = getVisibleCols();
  const csv = buildCSV(rows, cols);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
  const url  = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0,19).replace(/[T:]/g, '-');
  const host = hostnameFromUrl(activeTab?.url || '');
  const filename = `raspador-${host}-${date}.csv`;
  chrome.downloads.download({ url, filename, saveAs: false }, () => {
    exportInfo.textContent = `Saved: ${filename}  (${rows.length} rows, ${cols.length} cols)`;
    addLog(`CSV exported: ${filename}`, 'success', rows.length + ' rows');
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  });
});

btnCopyClip.addEventListener('click', () => {
  const rows = filteredRows.length ? filteredRows : allRows;
  if (!rows.length) return;
  const tsv = buildTSV(rows, getVisibleCols());
  navigator.clipboard.writeText(tsv).then(() => {
    btnCopyClip.textContent = 'Copied!';
    setTimeout(() => { btnCopyClip.textContent = 'Copy TSV'; }, 1600);
    addLog('Copied to clipboard as TSV', 'info', rows.length + ' rows');
  });
});

// ---- Session log ----
function addLog(message, type = 'info', badge = '') {
  const entry = { time: now(), message, type, badge };
  sessionLog.unshift(entry); // newest first
  renderLog();
  // If log tab not visible, flash badge on tab
}

function renderLog() {
  if (!sessionLog.length) {
    logList.innerHTML = '<div class="log-empty">No crawl activity yet.</div>';
    return;
  }
  logList.innerHTML = sessionLog.slice(0, 200).map(e =>
    `<div class="log-entry ${e.type}">
      <span class="log-time">${e.time}</span>
      <span class="log-msg">${esc(e.message)}</span>
      ${e.badge ? `<span class="log-badge">${esc(e.badge)}</span>` : ''}
    </div>`
  ).join('');
}

btnClearLog.addEventListener('click', () => {
  sessionLog = [];
  renderLog();
});

// ---- Saved configs ----
async function loadSavedConfigs() {
  const data = await storageGet('raspador_configs') || {};
  renderConfigs(data);
}

function renderConfigs(data) {
  const entries = Object.values(data);
  if (!entries.length) {
    configList.innerHTML = '<div class="config-empty">No saved configs yet.</div>';
    return;
  }
  configList.innerHTML = entries.map(cfg =>
    `<div class="config-entry" data-id="${esc(cfg.id)}">
      <div style="flex:1;min-width:0">
        <div class="config-name">${esc(cfg.name)}</div>
        <div class="config-host">${esc(cfg.host)}</div>
      </div>
      <button class="config-load" data-id="${esc(cfg.id)}">Load</button>
      <button class="config-del" data-id="${esc(cfg.id)}" title="Delete">✕</button>
    </div>`
  ).join('');

  configList.querySelectorAll('.config-load').forEach(btn => {
    btn.addEventListener('click', () => loadConfig(data[btn.dataset.id]));
  });
  configList.querySelectorAll('.config-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      delete data[btn.dataset.id];
      await storageSet('raspador_configs', data);
      renderConfigs(data);
      addLog('Config deleted', 'info');
    });
  });
}

async function saveConfig() {
  const name = configName.value.trim() || hostnameFromUrl(activeTab?.url || 'unknown');
  const host = hostnameFromUrl(activeTab?.url || '');
  const cand = candidates[currentCand] || null;
  const id = Date.now().toString();

  const cfg = {
    id, name, host,
    candidateSelector: cand?.selector || '',
    candidateType:     cand?.type || '',
    nextSelector:      nextSelector.value.trim(),
    delayMin:          delayMin.value,
    delayMax:          delayMax.value,
    maxPages:          maxPages.value,
    settleWait:        settleWait.value,
    xpathCols:         xpathCols.filter(x => x.name && x.xpath).map(x => ({ name: x.name, xpath: x.xpath })),
    regexFilters:      regexFilters.filter(f => f.pattern).map(f => ({ column: f.column, pattern: f.pattern, invert: f.invert })),
    savedAt:           new Date().toISOString(),
  };

  const data = await storageGet('raspador_configs') || {};
  data[id] = cfg;
  await storageSet('raspador_configs', data);
  renderConfigs(data);
  addLog(`Config saved: "${name}"`, 'success');
  setStatus(`Config saved: "${name}"`);
  configName.value = '';
}

function loadConfig(cfg) {
  if (cfg.candidateSelector) {
    const existing = candidates.find(c => c.selector === cfg.candidateSelector);
    if (!existing) {
      candidates.unshift({ label: cfg.candidateSelector, selector: cfg.candidateSelector, type: cfg.candidateType || 'list', rowCount: 0, score: 100 });
      currentCand = 0;
      updateCandidateUI();
    }
  }
  if (cfg.nextSelector) {
    nextSelector.value = cfg.nextSelector;
    nextPreview.textContent = `Loaded: ${cfg.nextSelector}`;
    nextPreview.classList.remove('hidden');
  }
  if (cfg.delayMin)   delayMin.value   = cfg.delayMin;
  if (cfg.delayMax)   delayMax.value   = cfg.delayMax;
  if (cfg.maxPages)   maxPages.value   = cfg.maxPages;
  if (cfg.settleWait) settleWait.value = cfg.settleWait;

  // Restore XPath cols
  if (cfg.xpathCols && cfg.xpathCols.length) {
    xpathList.innerHTML = '';
    xpathCols = [];
    cfg.xpathCols.forEach(x => addXpathRow(x.name, x.xpath));
  }
  // Restore regex filters
  if (cfg.regexFilters && cfg.regexFilters.length) {
    filterList.innerHTML = '';
    regexFilters = [];
    cfg.regexFilters.forEach(f => addFilterRow(f.column, f.pattern, f.invert));
  }

  addLog(`Config loaded: "${cfg.name}"`, 'info');
  setStatus(`Config loaded: "${cfg.name}"`);
  // Switch to extract tab
  document.querySelector('[data-tab="extract"]').click();
}

btnSaveConfigTab.addEventListener('click', saveConfig);
btnSaveConfig.addEventListener('click', saveConfig);

// ---- UI helpers ----
function updateCandidateUI() {
  if (!candidates.length) { candidateRow.classList.add('hidden'); return; }
  candidateRow.classList.remove('hidden');
  const cand = candidates[currentCand];
  candName.textContent = cand.label;
  candName.title = cand.selector;
  candCount.textContent = `${currentCand + 1}/${candidates.length}`;
}

function showSections() {
  emptyState.style.display = 'none';
  previewSection.style.display = '';
  exportSection.style.display  = '';
}

function updateRowCount() {
  const display = (filteredRows.length || allRows.length);
  rowCountEl.textContent = display + ' row' + (display !== 1 ? 's' : '');
}

function updatePageCount(n) {
  pageCountEl.textContent = `Page ${n}`;
}

function setStatus(html, isError = false) {
  statusText.innerHTML = html;
  statusBar.classList.toggle('error', isError);
}

function getVisibleCols() {
  const all = getAllColumns();
  return all.filter(c => !hiddenCols.has(c));
}

function getAllColumns() {
  const set = new LinkedSet();
  const source = (filteredRows.length > 0 || regexFilters.some(f => f.pattern)) ? filteredRows : allRows;
  (source.length ? source : allRows).forEach(row => Object.keys(row).forEach(k => set.add(k)));
  return set.toArray();
}

function updatePreview() {
  const rows = filteredRows.length || regexFilters.some(f=>f.pattern) ? filteredRows : allRows;
  const cols = getAllColumns();
  const visible = cols.filter(c => !hiddenCols.has(c));

  previewHead.innerHTML = '<tr>' + cols.map(c =>
    `<th class="${visible.includes(c)?'':'col-hidden'}" title="${esc(c)}">${esc(trunc(c, 22))}</th>`
  ).join('') + '</tr>';

  const previewRows = rows.slice(0, 100);
  previewBody.innerHTML = previewRows.map(row =>
    '<tr>' + cols.map(c =>
      `<td class="${visible.includes(c)?'':'col-hidden'}" title="${esc(String(row[c]||''))}">${esc(trunc(String(row[c]||''), 55))}</td>`
    ).join('') + '</tr>'
  ).join('');

  if (rows.length > 100) previewNote.textContent = `(showing 100 of ${rows.length})`;
  else previewNote.textContent = '';

  // Column chips
  colControls.innerHTML = cols.map(c =>
    `<span class="col-chip ${hiddenCols.has(c)?'':'active'}" data-col="${esc(c)}">${esc(trunc(c, 22))}</span>`
  ).join('');
  colControls.querySelectorAll('.col-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const col = chip.dataset.col;
      if (hiddenCols.has(col)) hiddenCols.delete(col);
      else hiddenCols.add(col);
      updatePreview();
    });
  });
}

// ---- CSV / TSV ----
function buildCSV(rows, cols) {
  const esc = v => {
    const s = String(v ?? '');
    return (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r'))
      ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return cols.map(esc).join(',') + '\r\n'
    + rows.map(r => cols.map(c => esc(r[c] ?? '')).join(',')).join('\r\n');
}

function buildTSV(rows, cols) {
  const esc = v => String(v ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
  return cols.map(esc).join('\t') + '\n'
    + rows.map(r => cols.map(c => esc(r[c] ?? '')).join('\t')).join('\n');
}

// ---- Utilities ----
function msg(data) {
  return new Promise((resolve, reject) => {
    if (!activeTab) { reject(new Error('No active tab')); return; }
    chrome.tabs.sendMessage(activeTab.id, data, res => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(res || {});
    });
  });
}

function mergeRows(newRows) {
  if (!newRows?.length) return;
  const keys = new Set(allRows.map(r => rowKey(r)));
  newRows.forEach(r => {
    const k = rowKey(r);
    if (!keys.has(k)) { allRows.push(r); keys.add(k); }
  });
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function trunc(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function now() {
  return new Date().toTimeString().slice(0, 8);
}

function hostnameFromUrl(url) {
  try {
    const u = new URL(url);
    // Ignore extension URLs and blank pages
    if (u.protocol === 'chrome-extension:' || u.protocol === 'chrome:' || u.href === 'about:blank') return 'local';
    return u.hostname.replace('www.', '').replace(/\./g, '-') || 'page';
  } catch { return 'page'; }
}

function storageGet(key) {
  return new Promise(resolve => chrome.storage.local.get(key, r => resolve(r[key])));
}

function storageSet(key, val) {
  return new Promise(resolve => chrome.storage.local.set({ [key]: val }, resolve));
}

// Insertion-order preserving set
class LinkedSet {
  constructor() { this._map = new Map(); }
  add(k) { if (!this._map.has(k)) this._map.set(k, true); }
  toArray() { return Array.from(this._map.keys()); }
}

function sendToContent(data) {
  return new Promise((resolve, reject) => {
    if (!activeTab) { reject(new Error('No active tab')); return; }
    chrome.tabs.sendMessage(activeTab.id, data, res => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(res || {});
    });
  });
}
