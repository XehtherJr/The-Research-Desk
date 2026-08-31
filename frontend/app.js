/**
 * app.js — Frontend logic for Research Discovery App
 * Handles search, table rendering, sorting, filtering, export, and modal.
 */

(function () {
  'use strict';

  // ═══════════ DOM REFS ═══════════
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    // Search
    form: $('#search-form'),
    input: $('#search-input'),
    clearBtn: $('#search-clear-btn'),
    limitSlider: $('#limit-slider'),
    limitValue: $('#limit-value'),
    searchBtn: $('#search-btn'),

    // Recent
    recentContainer: $('#recent-searches'),
    recentList: $('#recent-list'),

    // States
    emptyState: $('#empty-state'),
    loadingState: $('#loading-state'),
    loadingText: $('#loading-text'),
    errorState: $('#error-state'),
    errorTitle: $('#error-title'),
    errorMessage: $('#error-message'),
    retryBtn: $('#retry-btn'),
    resultsContainer: $('#results-container'),

    // Loading steps
    stepSearch: $('#step-search'),
    stepClassify: $('#step-classify'),
    stepRender: $('#step-render'),

    // Results header
    resultsCount: $('#results-count'),
    resultsTime: $('#results-time'),
    filterBadge: $('#filter-badge'),
    filterBadgeCount: $('#filter-badge-count'),
    filterBadgeClear: $('#filter-badge-clear'),

    // Actions
    exportCsvBtn: $('#export-csv-btn'),
    toggleJsonBtn: $('#toggle-json-btn'),
    newSearchBtn: $('#new-search-btn'),

    // Table
    tbody: $('#results-tbody'),
    noFilteredResults: $('#no-filtered-results'),
    filterResetInline: $('#filter-reset-inline-btn'),

    // Filters
    filterSidebar: $('#filter-sidebar'),
    filterToggle: $('#filter-toggle-btn'),
    filterResetBtn: $('#filter-reset-btn'),
    dateFrom: $('#date-from'),
    dateTo: $('#date-to'),
    filterOA: $('#filter-oa'),

    // JSON
    jsonView: $('#json-view'),
    jsonContent: $('#json-content'),
    jsonCopyBtn: $('#json-copy-btn'),

    // Modal
    modalOverlay: $('#modal-overlay'),
    modal: $('#paper-modal'),
    modalClose: $('#modal-close'),
    modalTitle: $('#modal-title'),
    modalAuthors: $('#modal-authors'),
    modalMeta: $('#modal-meta'),
    modalRelationships: $('#modal-relationships'),
    modalAbstract: $('#modal-abstract'),
    modalLinks: $('#modal-links'),
  };

  // ═══════════ STATE ═══════════
  let currentResults = [];     // Full results from last search
  let filteredResults = [];    // After client-side filtering
  let lastResponse = null;     // Full API response (for JSON view)
  let sortColumn = null;       // Current sort column
  let sortDirection = 'asc';   // 'asc' or 'desc'
  let lastQuery = '';

  const RECENT_KEY = 'rd_recent_searches';
  const MAX_RECENT = 3;

  // ═══════════ INIT ═══════════
  function init() {
    bindEvents();
    loadRecentSearches();
    dom.input.focus();
  }

  function bindEvents() {
    // Search
    dom.form.addEventListener('submit', handleSearch);
    dom.input.addEventListener('input', () => {
      dom.clearBtn.classList.toggle('hidden', dom.input.value.length === 0);
    });
    dom.clearBtn.addEventListener('click', () => {
      dom.input.value = '';
      dom.clearBtn.classList.add('hidden');
      dom.input.focus();
    });
    dom.limitSlider.addEventListener('input', () => {
      dom.limitValue.textContent = dom.limitSlider.value;
    });

    // Retry / New Search
    dom.retryBtn.addEventListener('click', handleSearch);
    dom.newSearchBtn.addEventListener('click', resetToEmpty);

    // Sort headers
    $$('.results-table thead th.sortable').forEach((th) => {
      th.addEventListener('click', () => handleSort(th.dataset.sort));
    });

    // Filters
    $$('.filter-checkbox input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', applyFilters);
    });
    dom.dateFrom.addEventListener('input', applyFilters);
    dom.dateTo.addEventListener('input', applyFilters);
    dom.filterOA.addEventListener('change', applyFilters);
    dom.filterResetBtn.addEventListener('click', resetFilters);
    dom.filterBadgeClear.addEventListener('click', resetFilters);
    dom.filterResetInline.addEventListener('click', resetFilters);

    // Mobile filter toggle
    dom.filterToggle.addEventListener('click', () => {
      dom.filterSidebar.classList.toggle('open');
    });

    // Export & JSON
    dom.exportCsvBtn.addEventListener('click', exportCSV);
    dom.toggleJsonBtn.addEventListener('click', toggleJSON);
    dom.jsonCopyBtn.addEventListener('click', copyJSON);

    // Modal
    dom.modalClose.addEventListener('click', closeModal);
    dom.modalOverlay.addEventListener('click', (e) => {
      if (e.target === dom.modalOverlay) closeModal();
    });

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!dom.modalOverlay.classList.contains('hidden')) {
          closeModal();
        } else if (dom.filterSidebar.classList.contains('open')) {
          dom.filterSidebar.classList.remove('open');
        }
      }
      if (e.key === 'Enter' && document.activeElement === dom.input) {
        e.preventDefault();
        dom.form.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    });
  }

  // ═══════════ SEARCH ═══════════
  async function handleSearch(e) {
    if (e && e.preventDefault) e.preventDefault();

    const query = dom.input.value.trim();
    if (!query) {
      dom.input.focus();
      return;
    }

    const limit = parseInt(dom.limitSlider.value, 10) || 25;
    lastQuery = query;

    // Save to recent
    saveRecentSearch(query);

    // Show loading
    showState('loading');
    setLoadingStep('search');
    dom.searchBtn.disabled = true;

    try {
      // Simulate step progress
      setTimeout(() => setLoadingStep('classify'), 800);

      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error (${response.status})`);
      }

      const data = await response.json();
      setLoadingStep('render');

      // Small delay to show render step
      await new Promise((r) => setTimeout(r, 300));

      lastResponse = data;
      currentResults = data.results || [];

      if (currentResults.length === 0) {
        showError('No papers found', 'Try a broader query or different keywords.');
        return;
      }

      // Reset sort & filters, then render
      sortColumn = null;
      sortDirection = 'asc';
      resetFilters(false);
      applyFilters();
      showState('results');

      // Update meta
      dom.resultsCount.textContent = `${currentResults.length} result${currentResults.length !== 1 ? 's' : ''}`;
      dom.resultsTime.textContent = data.duration_ms ? `${(data.duration_ms / 1000).toFixed(1)}s` : '';
    } catch (err) {
      console.error('Search error:', err);
      showError('Search failed', err.message || 'Please try again.');
    } finally {
      dom.searchBtn.disabled = false;
    }
  }

  // ═══════════ STATE MANAGEMENT ═══════════
  function showState(state) {
    dom.emptyState.classList.toggle('hidden', state !== 'empty');
    dom.loadingState.classList.toggle('hidden', state !== 'loading');
    dom.errorState.classList.toggle('hidden', state !== 'error');
    dom.resultsContainer.classList.toggle('hidden', state !== 'results');
  }

  function showError(title, message) {
    dom.errorTitle.textContent = title;
    dom.errorMessage.textContent = message;
    showState('error');
  }

  function setLoadingStep(step) {
    const steps = ['search', 'classify', 'render'];
    const current = steps.indexOf(step);

    [dom.stepSearch, dom.stepClassify, dom.stepRender].forEach((el, i) => {
      el.classList.remove('active', 'done');
      if (i < current) el.classList.add('done');
      else if (i === current) el.classList.add('active');
    });

    const texts = {
      search: 'Searching papers…',
      classify: 'Detecting relationships…',
      render: 'Building results…',
    };
    dom.loadingText.textContent = texts[step] || 'Loading…';
  }

  function resetToEmpty() {
    dom.input.value = '';
    dom.clearBtn.classList.add('hidden');
    currentResults = [];
    filteredResults = [];
    lastResponse = null;
    dom.jsonView.classList.add('hidden');
    showState('empty');
    dom.input.focus();
  }

  // ═══════════ TABLE RENDERING ═══════════
  function renderTable() {
    dom.tbody.innerHTML = '';

    if (filteredResults.length === 0) {
      dom.noFilteredResults.classList.remove('hidden');
      return;
    }

    dom.noFilteredResults.classList.add('hidden');

    const fragment = document.createDocumentFragment();

    filteredResults.forEach((paper, index) => {
      const tr = document.createElement('tr');
      const relType = paper.relationships?.primary?.type || '';
      tr.setAttribute('data-rel', relType);
      tr.setAttribute('data-index', index.toString());

      tr.addEventListener('click', () => openModal(paper));

      const authorsStr = (paper.authors || []).join(', ');
      const truncAuthors = authorsStr.length > 40
        ? authorsStr.substring(0, 37) + '…'
        : authorsStr;

      const relLabel = formatRelType(relType);
      const confidence = paper.relationships?.primary?.confidence || '';

      tr.innerHTML = `
        <td class="cell-title">${escapeHTML(paper.title)}</td>
        <td class="cell-authors" title="${escapeHTML(authorsStr)}">${escapeHTML(truncAuthors)}</td>
        <td class="cell-date">${escapeHTML(paper.date)}</td>
        <td class="cell-citations">${paper.metadata?.citation_count ?? '—'}</td>
        <td>
          ${relType
            ? `<span class="rel-badge" data-type="${relType}">
                ${relLabel}
                ${confidence ? `<span class="rel-confidence">${confidence}</span>` : ''}
              </span>`
            : '<span class="rel-badge" style="opacity:0.4">—</span>'
          }
        </td>
        <td class="access-icon">${paper.metadata?.open_access ? '🔓' : '🔒'}</td>
      `;

      fragment.appendChild(tr);
    });

    dom.tbody.appendChild(fragment);
  }

  function formatRelType(type) {
    const labels = {
      'conceptually-similar': 'Similar',
      'builds-on': 'Builds on',
      'responds-to': 'Responds to',
      'alternative-method': 'Alternative',
      'explicit-critique': 'Critique',
      'shared-dataset': 'Shared data',
    };
    return labels[type] || type || '—';
  }

  // ═══════════ SORTING ═══════════
  function handleSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }

    // Update indicators
    $$('.sort-indicator').forEach((el) => {
      el.className = 'sort-indicator';
    });
    const activeHeader = $(`.results-table thead th[data-sort="${column}"]`);
    if (activeHeader) {
      activeHeader.querySelector('.sort-indicator').classList.add(sortDirection);
    }

    sortResults();
    renderTable();
  }

  function sortResults() {
    if (!sortColumn) return;

    const dir = sortDirection === 'asc' ? 1 : -1;

    filteredResults.sort((a, b) => {
      let va, vb;

      switch (sortColumn) {
        case 'title':
          va = (a.title || '').toLowerCase();
          vb = (b.title || '').toLowerCase();
          return va < vb ? -dir : va > vb ? dir : 0;
        case 'authors':
          va = (a.authors?.[0] || '').toLowerCase();
          vb = (b.authors?.[0] || '').toLowerCase();
          return va < vb ? -dir : va > vb ? dir : 0;
        case 'date':
          va = parseInt(a.date, 10) || 0;
          vb = parseInt(b.date, 10) || 0;
          return (va - vb) * dir;
        case 'citations':
          va = a.metadata?.citation_count ?? 0;
          vb = b.metadata?.citation_count ?? 0;
          return (va - vb) * dir;
        default:
          return 0;
      }
    });
  }

  // ═══════════ FILTERING ═══════════
  function applyFilters() {
    // Relationship type checkboxes
    const checkedRels = new Set();
    $$('.filter-sidebar .filter-section:first-child input[type="checkbox"]').forEach((cb) => {
      if (cb.checked) checkedRels.add(cb.value);
    });

    // Date range
    const fromYear = parseInt(dom.dateFrom.value, 10) || 0;
    const toYear = parseInt(dom.dateTo.value, 10) || 9999;

    // Open access
    const oaOnly = dom.filterOA.checked;

    filteredResults = currentResults.filter((paper) => {
      // Relationship filter
      const relType = paper.relationships?.primary?.type || '';
      if (relType && !checkedRels.has(relType)) return false;
      // If no relationship but all checkboxes checked, keep it
      if (!relType && checkedRels.size < 6) return false;

      // Date filter
      const year = parseInt(paper.date, 10) || 0;
      if (year && (year < fromYear || year > toYear)) return false;

      // Open access filter
      if (oaOnly && !paper.metadata?.open_access) return false;

      return true;
    });

    // Maintain sort
    sortResults();
    renderTable();
    updateFilterBadge();
  }

  function resetFilters(rerender = true) {
    // Reset checkboxes
    $$('.filter-sidebar .filter-section:first-child input[type="checkbox"]').forEach((cb) => {
      cb.checked = true;
    });
    dom.dateFrom.value = '';
    dom.dateTo.value = '';
    dom.filterOA.checked = false;

    if (rerender) {
      applyFilters();
    }
  }

  function updateFilterBadge() {
    let count = 0;

    // Count unchecked relationship filters
    $$('.filter-sidebar .filter-section:first-child input[type="checkbox"]').forEach((cb) => {
      if (!cb.checked) count++;
    });

    if (dom.dateFrom.value) count++;
    if (dom.dateTo.value) count++;
    if (dom.filterOA.checked) count++;

    dom.filterBadge.classList.toggle('hidden', count === 0);
    dom.filterBadgeCount.textContent = count;
  }

  // ═══════════ MODAL ═══════════
  function openModal(paper) {
    dom.modalTitle.textContent = paper.title || 'Untitled';
    dom.modalAuthors.textContent = (paper.authors || []).join(', ') || 'Unknown';

    // Meta tags
    dom.modalMeta.innerHTML = '';
    const metaTags = [];
    if (paper.date) metaTags.push(paper.date);
    if (paper.metadata?.venue) metaTags.push(paper.metadata.venue);
    if (paper.metadata?.citation_count != null) metaTags.push(`${paper.metadata.citation_count} citations`);
    if (paper.metadata?.open_access) metaTags.push('Open Access');
    if (paper.metadata?.doi) metaTags.push(`DOI: ${paper.metadata.doi}`);

    metaTags.forEach((tag) => {
      const span = document.createElement('span');
      span.className = 'modal-meta-tag';
      span.textContent = tag;
      dom.modalMeta.appendChild(span);
    });

    // Relationships
    dom.modalRelationships.innerHTML = '';
    const primary = paper.relationships?.primary;
    if (primary && primary.type) {
      const div = document.createElement('div');
      div.className = 'modal-rel-item';
      div.innerHTML = `
        <span class="rel-badge" data-type="${primary.type}">
          ${formatRelType(primary.type)}
          <span class="rel-confidence">${primary.confidence || ''}</span>
        </span>
        <p class="modal-rel-evidence">${escapeHTML(primary.evidence || '')}</p>
      `;
      dom.modalRelationships.appendChild(div);
    }

    const secondary = paper.relationships?.secondary || [];
    secondary.forEach((rel) => {
      const div = document.createElement('div');
      div.className = 'modal-rel-item';
      div.innerHTML = `
        <span class="rel-badge" data-type="${rel.type}">
          ${formatRelType(rel.type)}
          <span class="rel-confidence">${rel.confidence || ''}</span>
        </span>
        <p class="modal-rel-evidence">${escapeHTML(rel.evidence || '')}</p>
      `;
      dom.modalRelationships.appendChild(div);
    });

    // Abstract
    dom.modalAbstract.textContent = paper.abstract || 'No abstract available.';

    // Links
    dom.modalLinks.innerHTML = '';
    if (paper.url) {
      const a = document.createElement('a');
      a.className = 'modal-link';
      a.href = paper.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = '📄 View Paper';
      dom.modalLinks.appendChild(a);
    }
    if (paper.metadata?.open_access_pdf) {
      const a = document.createElement('a');
      a.className = 'modal-link';
      a.href = paper.metadata.open_access_pdf;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = '📥 Download PDF';
      dom.modalLinks.appendChild(a);
    }
    if (paper.metadata?.doi) {
      const a = document.createElement('a');
      a.className = 'modal-link';
      a.href = `https://doi.org/${paper.metadata.doi}`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = '🔗 DOI Link';
      dom.modalLinks.appendChild(a);
    }

    dom.modalOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    dom.modalClose.focus();
  }

  function closeModal() {
    dom.modalOverlay.classList.add('hidden');
    document.body.style.overflow = '';
  }

  // ═══════════ CSV EXPORT ═══════════
  function exportCSV() {
    if (filteredResults.length === 0) return;

    const headers = ['Title', 'Authors', 'Date', 'Citations', 'Relationship', 'Confidence', 'Evidence', 'Open Access', 'URL', 'DOI', 'Venue'];
    const rows = filteredResults.map((p) => [
      csvEscape(p.title),
      csvEscape((p.authors || []).join('; ')),
      p.date || '',
      p.metadata?.citation_count ?? '',
      p.relationships?.primary?.type || '',
      p.relationships?.primary?.confidence || '',
      csvEscape(p.relationships?.primary?.evidence || ''),
      p.metadata?.open_access ? 'Yes' : 'No',
      p.url || '',
      p.metadata?.doi || '',
      csvEscape(p.metadata?.venue || ''),
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `research_${lastQuery.replace(/\s+/g, '_').substring(0, 30)}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function csvEscape(str) {
    if (!str) return '';
    if (/[",\n\r]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  // ═══════════ JSON VIEW ═══════════
  function toggleJSON() {
    const isHidden = dom.jsonView.classList.contains('hidden');
    dom.jsonView.classList.toggle('hidden');

    if (isHidden && lastResponse) {
      dom.jsonContent.textContent = JSON.stringify(lastResponse, null, 2);
    }
  }

  function copyJSON() {
    if (!lastResponse) return;
    navigator.clipboard.writeText(JSON.stringify(lastResponse, null, 2)).then(() => {
      const original = dom.jsonCopyBtn.textContent;
      dom.jsonCopyBtn.textContent = 'Copied!';
      setTimeout(() => { dom.jsonCopyBtn.textContent = original; }, 1500);
    });
  }

  // ═══════════ RECENT SEARCHES ═══════════
  function loadRecentSearches() {
    const recent = getRecentSearches();
    if (recent.length === 0) return;

    dom.recentContainer.classList.remove('hidden');
    dom.recentList.innerHTML = '';

    recent.forEach((q) => {
      const chip = document.createElement('button');
      chip.className = 'recent-chip';
      chip.textContent = q;
      chip.addEventListener('click', () => {
        dom.input.value = q;
        dom.clearBtn.classList.remove('hidden');
        dom.form.dispatchEvent(new Event('submit', { cancelable: true }));
      });
      dom.recentList.appendChild(chip);
    });
  }

  function getRecentSearches() {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveRecentSearch(query) {
    let recent = getRecentSearches();
    // Remove if exists, add to front
    recent = recent.filter((q) => q.toLowerCase() !== query.toLowerCase());
    recent.unshift(query);
    recent = recent.slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    loadRecentSearches();
  }

  // ═══════════ UTILS ═══════════
  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ═══════════ BOOT ═══════════
  document.addEventListener('DOMContentLoaded', init);
})();
