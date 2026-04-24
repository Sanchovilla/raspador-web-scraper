/* ============================================================
   Raspador — Web Scraper  |  Content Script  v2.1
   Fix: Pick Next / Pick Row use chrome.storage relay instead
        of runtime.sendMessage (popup is closed during pick)
   ============================================================ */

(function () {
  'use strict';

  let picking = false;
  let pickingNext = false;

  // ---- Highlight overlay ----
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: '2147483646',
    background: 'rgba(232,84,26,0.15)',
    border: '2px solid rgba(232,84,26,0.9)',
    borderRadius: '3px',
    transition: 'all 0.07s',
    display: 'none',
    boxSizing: 'border-box',
  });
  document.body.appendChild(overlay);

  // ---- Tooltip label shown during picking ----
  const tooltip = document.createElement('div');
  Object.assign(tooltip.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: '2147483647',
    background: '#e8541a',
    color: '#fff',
    fontSize: '11px',
    fontFamily: 'system-ui, sans-serif',
    fontWeight: '600',
    padding: '3px 8px',
    borderRadius: '3px',
    display: 'none',
    whiteSpace: 'nowrap',
    letterSpacing: '0.02em',
  });
  document.body.appendChild(tooltip);

  function positionOverlay(el) {
    const r = el.getBoundingClientRect();
    Object.assign(overlay.style, {
      top:     (r.top  + window.scrollY) + 'px',
      left:    (r.left + window.scrollX) + 'px',
      width:   r.width  + 'px',
      height:  r.height + 'px',
      display: 'block',
    });
    // Position tooltip above the element
    const tipTop = Math.max(0, r.top + window.scrollY - 26);
    Object.assign(tooltip.style, {
      top:  tipTop + 'px',
      left: (r.left + window.scrollX) + 'px',
      display: 'block',
    });
  }

  function hideOverlay() {
    overlay.style.display = 'none';
    tooltip.style.display = 'none';
  }

  // ---- Heuristic scoring ----
  function scoreElements(elements) {
    if (!elements || elements.length < 2) return 0;
    let score = 0;
    if (elements.length >= 5)  score += 20;
    if (elements.length >= 10) score += 20;
    if (elements.length >= 20) score += 10;
    const sample = Array.from(elements).slice(0, 5);
    const textLengths = sample.map(el => el.textContent.trim().length);
    const avgLen = textLengths.reduce((a, b) => a + b, 0) / textLengths.length;
    if (avgLen > 20) score += 15;
    if (avgLen > 60) score += 15;
    const childCounts = sample.map(el => el.children.length);
    const maxC = Math.max(...childCounts);
    const minC = Math.min(...childCounts);
    if (maxC > 0 && (maxC - minC) <= 2) score += 20;
    return Math.min(score, 100);
  }

  function detectCandidates() {
    const candidates = [];
    const seen = new Set();

    function addCandidate(c) {
      if (seen.has(c.selector)) return;
      seen.add(c.selector);
      candidates.push(c);
    }

    // 1. HTML tables
    document.querySelectorAll('table').forEach((table, i) => {
      const rows = table.querySelectorAll('tbody tr, tr');
      if (rows.length < 1) return;
      const score = scoreElements(rows);
      addCandidate({
        type: 'table',
        label: `table[${i}]${table.id ? '#'+table.id : ''}${table.className ? '.'+String(table.className).trim().split(/\s+/)[0] : ''}`,
        selector: getCssSelector(table),
        score: score + 10,
        rowCount: rows.length,
      });
    });

    // 2. Repeated sibling patterns
    const repeatSelectors = [
      'ul > li', 'ol > li',
      '.result', '.results > *', '.item', '.card', '.record',
      '[class*="result-item"]', '[class*="-row"]', '[class*="list-item"]',
      '[class*="entry"]', '[class*="listing"]', '.hit', '.search-result',
      'tbody tr', 'dl > dt', '.data-row',
    ];

    repeatSelectors.forEach(sel => {
      try {
        const els = document.querySelectorAll(sel);
        if (els.length < 2) return;
        const parents = new Set(Array.from(els).map(e => e.parentElement));
        parents.forEach(parent => {
          if (!parent) return;
          let children;
          try { children = Array.from(parent.querySelectorAll(':scope > *')).filter(c => c.matches(sel)); }
          catch { return; }
          if (children.length < 2) return;
          const score = scoreElements(children);
          if (score < 20) return;
          const parentSel = getCssSelector(parent);
          const childTag = children[0].tagName.toLowerCase();
          const rowSel = parentSel + ' > ' + childTag;
          addCandidate({
            type: 'list',
            label: `${sel} (${children.length} rows)`,
            selector: rowSel,
            score,
            rowCount: children.length,
          });
        });
      } catch {}
    });

    // 3. Any parent with 4+ same-tag children
    ['div', 'article', 'section', 'tr', 'li', 'span'].forEach(tag => {
      const parents = new Set();
      document.querySelectorAll(tag).forEach(el => { if (el.parentElement) parents.add(el.parentElement); });
      parents.forEach(parent => {
        const sameChildren = Array.from(parent.children).filter(c => c.tagName.toLowerCase() === tag);
        if (sameChildren.length < 4) return;
        const score = scoreElements(sameChildren);
        if (score < 30) return;
        const parentSel = getCssSelector(parent);
        const rowSel = parentSel + ' > ' + tag;
        addCandidate({
          type: 'generic',
          label: `${parentSel} > ${tag} (${sameChildren.length})`,
          selector: rowSel,
          score,
          rowCount: sameChildren.length,
        });
      });
    });

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, 15);
  }

  // ---- Data extraction ----
  function extractFromCandidate(candidateInfo) {
    const { type, selector } = candidateInfo;
    if (type === 'table') {
      const table = document.querySelector(selector);
      if (!table) return [];
      return extractTable(table);
    }
    const rows = safeQSA(selector);
    if (!rows.length) return [];
    const fieldMap = inferFields(rows[0]);
    return rows.map(row => {
      const obj = {};
      fieldMap.forEach(field => {
        let el;
        if (field.selector) { try { el = row.querySelector(field.selector); } catch {} }
        else { el = row; }
        if (el) {
          obj[field.key] = cellText(el);
          const link = (el.tagName === 'A') ? el : el.querySelector('a');
          if (link && link.href && !link.href.startsWith('javascript')) {
            obj[field.key + '_url'] = link.href;
          }
        }
      });
      return obj;
    }).filter(o => Object.keys(o).length > 0);
  }

  function extractTable(table) {
    const thead = table.querySelector('thead tr');
    let headers = null;
    if (thead) {
      headers = Array.from(thead.querySelectorAll('th, td')).map((th, i) => {
        const t = th.textContent.trim();
        return t || `col_${i}`;
      });
    }
    const dataRows = Array.from(table.querySelectorAll('tbody tr, tr')).filter(tr => {
      if (thead && tr.closest('thead')) return false;
      return tr.querySelectorAll('td').length > 0;
    });
    return dataRows.map(tr => {
      const cells = Array.from(tr.querySelectorAll('td, th'));
      const obj = {};
      cells.forEach((cell, ci) => {
        const key = headers ? (headers[ci] || `col_${ci}`) : `col_${ci}`;
        obj[key] = cellText(cell);
        const link = cell.querySelector('a');
        if (link && link.href && !link.href.startsWith('javascript')) {
          obj[key + '_url'] = link.href;
        }
      });
      return obj;
    }).filter(o => Object.keys(o).length > 0);
  }

  // ---- XPath extraction ----
  function evaluateXPath(xpath, contextNode) {
    try {
      const result = document.evaluate(xpath, contextNode, null, XPathResult.STRING_TYPE, null);
      return result.stringValue.trim();
    } catch { return ''; }
  }

  function applyXPathColumns(rows, xpathCols, selector) {
    if (!xpathCols || !xpathCols.length) return rows;
    const rowEls = safeQSA(selector);
    return rows.map((row, i) => {
      const el = rowEls[i];
      if (!el) return row;
      const enriched = { ...row };
      xpathCols.forEach(col => {
        if (col.name && col.xpath) enriched[col.name] = evaluateXPath(col.xpath, el);
      });
      return enriched;
    });
  }

  // ---- Field inference ----
  function inferFields(sampleEl) {
    const fields = [];
    const seen = new Set();
    const subEls = sampleEl.querySelectorAll('[class], h1, h2, h3, h4, p, span, td, th, a, time, strong, em, div');
    if (!subEls.length) { fields.push({ key: 'text', selector: null }); return fields; }
    subEls.forEach(el => {
      const key = fieldKey(el);
      if (seen.has(key)) return;
      seen.add(key);
      const sel = getRelativeSelector(sampleEl, el);
      if (sel) fields.push({ key, selector: sel });
    });
    return fields.slice(0, 25);
  }

  function fieldKey(el) {
    if (el.className && typeof el.className === 'string') {
      const cls = el.className.trim().split(/\s+/)[0];
      if (cls && /^[a-zA-Z]/.test(cls)) return cls.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
    }
    if (el.id) return el.id.substring(0, 50);
    const aria = el.getAttribute && el.getAttribute('aria-label');
    if (aria) return aria.replace(/\s+/g, '_').substring(0, 50);
    return el.tagName.toLowerCase() + '_' + Array.from(el.parentElement?.children || []).indexOf(el);
  }

  function getRelativeSelector(ancestor, descendant) {
    if (ancestor === descendant) return null;
    if (descendant.id) {
      try { if (ancestor.querySelector('#' + CSS.escape(descendant.id)) === descendant) return '#' + CSS.escape(descendant.id); } catch {}
    }
    if (descendant.className && typeof descendant.className === 'string') {
      const cls = '.' + descendant.className.trim().split(/\s+/).map(c => CSS.escape(c)).join('.');
      try { if (ancestor.querySelector(cls) === descendant) return cls; } catch {}
    }
    const tag = descendant.tagName.toLowerCase();
    const siblings = Array.from(descendant.parentElement?.querySelectorAll(':scope > ' + tag) || []);
    const idx = siblings.indexOf(descendant);
    if (idx >= 0) return tag + ':nth-of-type(' + (idx + 1) + ')';
    return null;
  }

  // ---- Next button finder ----
  function findNextButton(selector) {
    if (selector) {
      try { const el = document.querySelector(selector); if (el && isVisible(el)) return el; } catch {}
      try {
        const result = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        if (result.singleNodeValue && isVisible(result.singleNodeValue)) return result.singleNodeValue;
      } catch {}
    }
    const patterns = [/\bnext\b/i, /›/, /»/, /→/, /\bforward\b/i, /\b>\s*$/];
    const candidates = Array.from(document.querySelectorAll('a, button, [role="button"]'));
    for (const p of patterns) {
      const match = candidates.find(el => {
        const text  = el.textContent.trim();
        const label = el.getAttribute('aria-label') || '';
        const title = el.getAttribute('title') || '';
        return (p.test(text) || p.test(label) || p.test(title)) && isVisible(el) && !el.disabled;
      });
      if (match) return match;
    }
    return null;
  }

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = window.getComputedStyle(el);
    return r.width > 0 && r.height > 0
      && s.display !== 'none'
      && s.visibility !== 'hidden'
      && parseFloat(s.opacity) > 0
      && !el.disabled;
  }

  // ---- CSS Selector generator ----
  function getCssSelector(el) {
    if (el === document.body) return 'body';
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    let current = el;
    while (current && current !== document.body && parts.length < 6) {
      let sel = current.tagName.toLowerCase();
      if (current.id) { sel = '#' + CSS.escape(current.id); parts.unshift(sel); break; }
      if (current.className && typeof current.className === 'string') {
        const cls = current.className.trim().split(/\s+/).filter(c => /^[a-zA-Z_-]/.test(c)).slice(0, 2);
        if (cls.length) { try { sel += '.' + cls.map(c => CSS.escape(c)).join('.'); } catch {} }
      }
      const siblings = Array.from(current.parentElement?.children || []).filter(c => c.tagName === current.tagName);
      if (siblings.length > 1) sel += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
      parts.unshift(sel);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  function safeQSA(selector) {
    try { return Array.from(document.querySelectorAll(selector)); } catch { return []; }
  }

  function cellText(el) {
    return el.textContent.replace(/\s+/g, ' ').trim();
  }

  // ---- Storage relay helpers ----
  // Used for Pick Next / Pick Row because the popup closes itself before
  // runtime.sendMessage can be delivered back. We write results to storage
  // and the popup reads them on next open.
  function storageWrite(key, value) {
    try { chrome.storage.local.set({ [key]: value }); } catch {}
  }

  // ---- Message handler ----
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.action) {

      case 'detect': {
        const candidates = detectCandidates();
        sendResponse({ candidates: candidates.map(c => ({
          label: c.label, selector: c.selector,
          score: c.score, rowCount: c.rowCount, type: c.type,
        }))});
        break;
      }

      case 'extract': {
        const { type, selector } = msg.candidate;
        let rows = extractFromCandidate({ type, selector });
        if (msg.xpathCols && msg.xpathCols.length) {
          rows = applyXPathColumns(rows, msg.xpathCols, selector);
        }
        sendResponse({ rows });
        break;
      }

      case 'extractAndCheckNext': {
        const { candidateSelector, candidateType, nextSel, xpathCols } = msg;
        let rows = extractFromCandidate({ type: candidateType, selector: candidateSelector });
        if (xpathCols && xpathCols.length) {
          rows = applyXPathColumns(rows, xpathCols, candidateSelector);
        }
        const nextBtn = findNextButton(nextSel);
        sendResponse({ rows, hasNext: !!nextBtn });
        break;
      }

      case 'clickNext': {
        const btn = findNextButton(msg.selector);
        if (btn) {
          btn.scrollIntoView({ behavior: 'instant', block: 'center' });
          btn.click();
          sendResponse({ ok: true, text: btn.textContent.trim().substring(0, 60) });
        } else {
          sendResponse({ ok: false });
        }
        break;
      }

      case 'checkNextExists': {
        const btn = findNextButton(msg.selector);
        sendResponse({ exists: !!btn, text: btn ? btn.textContent.trim().substring(0, 60) : '' });
        break;
      }

      case 'startPickElement': {
        picking = true; pickingNext = false;
        document.body.style.cursor = 'crosshair';
        tooltip.textContent = 'Click a repeating row element';
        sendResponse({ ok: true });
        break;
      }

      case 'startPickNext': {
        pickingNext = true; picking = false;
        document.body.style.cursor = 'crosshair';
        tooltip.textContent = 'Click the Next button';
        sendResponse({ ok: true });
        break;
      }

      case 'cancelPick': {
        picking = false; pickingNext = false;
        document.body.style.cursor = '';
        hideOverlay();
        sendResponse({ ok: true });
        break;
      }

      case 'evaluateXPath': {
        try {
          const result = document.evaluate(msg.xpath, document, null, XPathResult.STRING_TYPE, null);
          sendResponse({ value: result.stringValue });
        } catch (e) { sendResponse({ error: e.message }); }
        break;
      }

      default:
        sendResponse({ error: 'unknown action' });
    }
    return true;
  });

  // ---- Mouse listeners ----
  document.addEventListener('mouseover', e => {
    if (!picking && !pickingNext) return;
    if (e.target === overlay || e.target === tooltip) return;
    positionOverlay(e.target);
  });

  document.addEventListener('mouseout', e => {
    if (!picking && !pickingNext) return;
    if (e.relatedTarget !== overlay && e.relatedTarget !== tooltip) hideOverlay();
  });

  document.addEventListener('click', e => {
    if (!picking && !pickingNext) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.target;
    const selector = getCssSelector(el);

    if (pickingNext) {
      pickingNext = false;
      document.body.style.cursor = '';
      hideOverlay();

      // ---- FIX: write result to storage so popup can read it on next open ----
      storageWrite('raspador_picked_next', {
        selector,
        tagName: el.tagName,
        text: el.textContent.trim().substring(0, 80),
        timestamp: Date.now(),
      });

      // Show brief confirmation on the page
      showPageToast(`✓ Next button captured: "${el.textContent.trim().substring(0, 40)}"`);

    } else if (picking) {
      picking = false;
      document.body.style.cursor = '';
      hideOverlay();

      const parent = el.parentElement;
      const tag = el.tagName.toLowerCase();
      const parentSel = parent ? getCssSelector(parent) : selector;
      const rowSel = parentSel + ' > ' + tag;
      const rows = extractFromCandidate({ type: 'list', selector: rowSel });
      const count = parent ? Array.from(parent.children).filter(c => c.tagName.toLowerCase() === tag).length : 1;

      // ---- FIX: write result to storage ----
      storageWrite('raspador_picked_element', {
        selector: rowSel,
        rowCount: count,
        rows,
        timestamp: Date.now(),
      });

      showPageToast(`✓ Row element captured — ${count} rows found. Re-open Raspador.`);
    }
  }, true);

  // ---- On-page toast (shown while popup is closed) ----
  function showPageToast(message) {
    const toast = document.createElement('div');
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: '2147483647',
      background: '#e8541a',
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '13px',
      fontWeight: '600',
      padding: '10px 16px',
      borderRadius: '6px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      transition: 'opacity 0.4s',
      maxWidth: '320px',
      lineHeight: '1.4',
    });
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; }, 2800);
    setTimeout(() => { toast.remove(); }, 3300);
  }

})();
