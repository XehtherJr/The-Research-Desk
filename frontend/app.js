/**
 * app.js — Client-side Controller for Document Discovery Engine
 * Handles OpenAlex search, state transitions, sorting, multi-attribute filtering,
 * export (CSV/JSON), and document metadata detail modal.
 */

(function () {
  'use strict';

  // ═══════════ DOM ELEMENTS ═══════════
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const dom = {
    // Progress Bar
    progressBar: $('#top-progress-bar'),

    // Search Controls
    form: $('#search-form'),
    input: $('#search-input'),
    clearBtn: $('#search-clear-btn'),
    limitSlider: $('#limit-slider'),
    limitValue: $('#limit-value'),
    searchBtn: $('#search-btn'),
    recentContainer: $('#recent-queries'),
    recentTags: $('#recent-tags'),

    // State Containers
    emptyState: $('#empty-state'),
    loadingState: $('#loading-state'),
    loadingStatusText: $('#loading-status-text'),
    errorState: $('#error-state'),
    errorTitle: $('#error-title'),
    errorMessage: $('#error-message'),
    retryBtn: $('#retry-btn'),
    resultsView: $('#results-view'),

    // Results Header & Actions
    resultsCount: $('#results-count'),
    resultsTiming: $('#results-timing'),
    sortSelect: $('#sort-select'),
    exportCsvBtn: $('#export-csv-btn'),
    exportJsonBtn: $('#export-json-btn'),

    // Filters
    filtersPanel: $('#filters-panel'),
    filterResetBtn: $('#filter-reset-btn'),
    dateFrom: $('#date-from'),
    dateTo: $('#date-to'),
    filterOA: $('#filter-oa'),
    activeFilterIndicator: $('#active-filter-indicator'),
    clearFiltersLink: $('#clear-filters-link'),
    resetFiltersInlineBtn: $('#reset-filters-inline-btn'),

    // Type counts
    countPaper: $('#count-paper'),
    countBook: $('#count-book'),
    countReport: $('#count-report'),
    countDataset: $('#count-dataset'),
    countRepository: $('#count-repository'),

    // Document Stream & Error
    documentStream: $('#document-stream'),
    noFilteredMessage: $('#no-filtered-message'),

    // JSON Inspector
    jsonInspector: $('#json-inspector'),
    jsonCode: $('#json-code'),
    copyJsonBtn: $('#copy-json-btn'),

    // Detail Modal
    modalBackdrop: $('#modal-backdrop'),
    modalCard: $('#modal-card'),
    modalCloseBtn: $('#modal-close-btn'),
    modalDocType: $('#modal-doc-type'),
    modalDate: $('#modal-date'),
    modalOA: $('#modal-oa'),
    modalTitle: $('#modal-title'),
    modalAuthors: $('#modal-authors'),
    modalVenue: $('#modal-venue'),
    modalMetaGrid: $('#modal-meta-grid'),
    modalAbstractText: $('#modal-abstract-text'),
    modalFooterActions: $('#modal-footer-actions'),
  };

  // ═══════════ STATE ═══════════
  let rawDocuments = [];       // Full results from API
  let filteredDocuments = [];  // Filtered & sorted view
  let lastApiResponse = null;  // Complete payload for JSON view
  let currentSort = 'relevance';
  let activeQuery = '';

  const STORAGE_RECENT_KEY = 'dde_recent_searches_v1';
  const MAX_RECENT_QUERIES = 5;

  // ═══════════ INITIALIZATION ═══════════
  function init() {
    bindEvents();
    renderRecentQueries();
    
    // Focus search input on initial load
    if (dom.input) {
      dom.input.focus();
    }
  }

  function bindEvents() {
    // Search Form
    dom.form.addEventListener('submit', handleSearchSubmit);

    dom.input.addEventListener('input', () => {
      dom.clearBtn.classList.toggle('hidden', !dom.input.value.trim());
    });

    dom.clearBtn.addEventListener('click', () => {
      dom.input.value = '';
      dom.clearBtn.classList.add('hidden');
      dom.input.focus();
    });

    dom.limitSlider.addEventListener('input', () => {
      dom.limitValue.textContent = dom.limitSlider.value;
    });

    // Sample Query Clicks
    $$('.sample-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const query = btn.dataset.query;
        if (query) {
          dom.input.value = query;
          dom.clearBtn.classList.remove('hidden');
          dom.form.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      });
    });

    // Retry Button
    dom.retryBtn.addEventListener('click', () => {
      if (activeQuery) {
        dom.input.value = activeQuery;
      }
      dom.form.dispatchEvent(new Event('submit', { cancelable: true }));
    });

    // Sorting
    dom.sortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value;
      applyFiltersAndSort();
    });

    // Filtering
    $$('input[name="type-filter"]').forEach((cb) => {
      cb.addEventListener('change', applyFiltersAndSort);
    });

    dom.dateFrom.addEventListener('input', applyFiltersAndSort);
    dom.dateTo.addEventListener('input', applyFiltersAndSort);
    dom.filterOA.addEventListener('change', applyFiltersAndSort);

    dom.filterResetBtn.addEventListener('click', resetFilters);
    if (dom.clearFiltersLink) dom.clearFiltersLink.addEventListener('click', resetFilters);
    if (dom.resetFiltersInlineBtn) dom.resetFiltersInlineBtn.addEventListener('click', resetFilters);

    // Export Buttons
    dom.exportCsvBtn.addEventListener('click', exportCSV);
    dom.exportJsonBtn.addEventListener('click', exportJSON);

    // Copy Raw JSON
    dom.copyJsonBtn.addEventListener('click', copyRawJson);

    // Modal Events
    dom.modalCloseBtn.addEventListener('click', closeModal);
    dom.modalBackdrop.addEventListener('click', (e) => {
      if (e.target === dom.modalBackdrop) {
        closeModal();
      }
    });

    // Keyboard Navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!dom.modalBackdrop.classList.contains('hidden')) {
          closeModal();
        }
      }
    });
  }

  // ═══════════ SEARCH HANDLER ═══════════
  async function handleSearchSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();

    const query = dom.input.value.trim();
    if (!query) {
      dom.input.focus();
      return;
    }

    const limit = parseInt(dom.limitSlider.value, 10) || 25;
    activeQuery = query;
    saveRecentQuery(query);

    // Set Loading State
    showState('loading');
    startProgressBar();
    dom.searchBtn.disabled = true;

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with status ${response.status}`);
      }

      const data = await response.json();
      lastApiResponse = data;
      rawDocuments = data.results || [];

      completeProgressBar();

      if (rawDocuments.length === 0) {
        showError('No documents found', 'No works matching your query were found in the catalog. Try broadening your terms or checking spelling.');
        return;
      }

      // Update meta information
      dom.resultsCount.textContent = `${data.results_returned} of ${data.total_matches.toLocaleString()} documents found`;
      dom.resultsTiming.textContent = `(${data.duration_ms}ms)`;

      // Populate JSON inspector
      dom.jsonCode.textContent = JSON.stringify(data, null, 2);

      // Reset filters and apply default sort
      resetFiltersSilently();
      updateTypeCounts();
      applyFiltersAndSort();

      showState('results');
    } catch (err) {
      console.error('[Search] Error:', err);
      resetProgressBar();
      showError('Search Request Failed', err.message || 'Unable to connect to the document discovery service.');
    } finally {
      dom.searchBtn.disabled = false;
    }
  }

  // ═══════════ FILTERING & SORTING ═══════════
  function applyFiltersAndSort() {
    const selectedTypes = new Set(
      $$('input[name="type-filter"]:checked').map((cb) => cb.value)
    );

    const fromYear = parseInt(dom.dateFrom.value, 10) || null;
    const toYear = parseInt(dom.dateTo.value, 10) || null;
    const openAccessOnly = dom.filterOA.checked;

    // Filter documents
    filteredDocuments = rawDocuments.filter((doc) => {
      // Type filter
      if (!selectedTypes.has(doc.type)) return false;

      // Year filter
      const docYear = parseInt(doc.date.slice(0, 4), 10);
      if (fromYear && (!docYear || docYear < fromYear)) return false;
      if (toYear && (!docYear || docYear > toYear)) return false;

      // Open access filter
      if (openAccessOnly && !doc.metadata?.openAccess) return false;

      return true;
    });

    // Check if any non-default filter is active
    const isFiltered =
      selectedTypes.size < 5 || fromYear !== null || toYear !== null || openAccessOnly;

    dom.activeFilterIndicator.classList.toggle('hidden', !isFiltered);

    // Apply Sorting
    sortDocuments(filteredDocuments, currentSort);

    // Render cards
    renderDocumentStream(filteredDocuments);
  }

  function sortDocuments(docs, sortKey) {
    switch (sortKey) {
      case 'citations-desc':
        docs.sort((a, b) => (b.metadata?.citationCount || 0) - (a.metadata?.citationCount || 0));
        break;
      case 'date-desc':
        docs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        break;
      case 'date-asc':
        docs.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        break;
      case 'title-asc':
        docs.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        break;
      case 'relevance':
      default:
        // Keep original OpenAlex relevance ranking order
        docs.sort((a, b) => {
          const indexA = rawDocuments.findIndex((item) => item.id === a.id);
          const indexB = rawDocuments.findIndex((item) => item.id === b.id);
          return indexA - indexB;
        });
        break;
    }
  }

  function updateTypeCounts() {
    const counts = { paper: 0, book: 0, report: 0, dataset: 0, repository: 0 };
    rawDocuments.forEach((doc) => {
      if (counts[doc.type] !== undefined) {
        counts[doc.type]++;
      } else {
        counts.paper++;
      }
    });

    dom.countPaper.textContent = counts.paper;
    dom.countBook.textContent = counts.book;
    dom.countReport.textContent = counts.report;
    dom.countDataset.textContent = counts.dataset;
    dom.countRepository.textContent = counts.repository;
  }

  function resetFilters() {
    resetFiltersSilently();
    applyFiltersAndSort();
  }

  function resetFiltersSilently() {
    $$('input[name="type-filter"]').forEach((cb) => (cb.checked = true));
    dom.dateFrom.value = '';
    dom.dateTo.value = '';
    dom.filterOA.checked = false;
    dom.activeFilterIndicator.classList.add('hidden');
  }

  // ═══════════ RENDERING ═══════════
  function renderDocumentStream(docs) {
    dom.documentStream.innerHTML = '';

    if (docs.length === 0) {
      dom.noFilteredMessage.classList.remove('hidden');
      return;
    }

    dom.noFilteredMessage.classList.add('hidden');

    const fragment = document.createDocumentFragment();

    docs.forEach((doc, idx) => {
      const card = createDocumentCard(doc, idx);
      fragment.appendChild(card);
    });

    dom.documentStream.appendChild(fragment);
  }

  function createDocumentCard(doc, index) {
    const card = document.createElement('article');
    card.className = 'document-card';
    card.setAttribute('data-id', doc.id);

    const typeLabel = formatDocType(doc.type);
    const isOpenAccess = Boolean(doc.metadata?.openAccess);
    const oaClass = isOpenAccess ? 'open' : 'closed';
    const oaText = isOpenAccess ? 'Open Access' : 'Subscription';
    const citationCount = doc.metadata?.citationCount ?? 0;
    const authorsText = formatAuthors(doc.authors);
    const venueText = doc.metadata?.venue ? doc.metadata.venue : '';

    card.innerHTML = `
      <div class="card-top-meta">
        <span class="doc-type-badge">${escapeHTML(typeLabel)}</span>
        <span class="doc-year">${escapeHTML(doc.date || 'Unknown Date')}</span>
        <span class="doc-oa-badge ${oaClass}">${oaText}</span>
      </div>

      <a href="${escapeHTML(doc.url || '#')}" target="_blank" rel="noopener noreferrer" class="card-title-link">
        <h3 class="card-title">${escapeHTML(doc.title)}</h3>
      </a>

      <p class="card-authors">${escapeHTML(authorsText)}</p>
      ${venueText ? `<p class="card-venue">${escapeHTML(venueText)}</p>` : ''}

      <div class="card-abstract-wrap">
        <p class="card-abstract-text" id="abstract-${index}">${escapeHTML(doc.abstract)}</p>
        ${doc.abstract && doc.abstract.length > 200 ? `
          <button type="button" class="toggle-abstract-btn" data-target="abstract-${index}" aria-expanded="false">
            Read full abstract ↓
          </button>
        ` : ''}
      </div>

      <div class="card-footer">
        <div class="card-metrics">
          <span>${citationCount.toLocaleString()} citations</span>
          ${doc.metadata?.doi ? `<span>DOI: ${escapeHTML(doc.metadata.doi)}</span>` : ''}
        </div>

        <div class="card-actions">
          <button type="button" class="card-action-btn view-details-btn" data-index="${index}">
            Document Details
          </button>
          <a href="${escapeHTML(doc.url || '#')}" target="_blank" rel="noopener noreferrer" class="card-action-link">
            Source ↗
          </a>
        </div>
      </div>
    `;

    // Toggle Abstract Button
    const toggleBtn = card.querySelector('.toggle-abstract-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const textEl = card.querySelector(`#${toggleBtn.dataset.target}`);
        const isExpanded = textEl.classList.toggle('expanded');
        toggleBtn.setAttribute('aria-expanded', isExpanded);
        toggleBtn.textContent = isExpanded ? 'Collapse abstract ↑' : 'Read full abstract ↓';
      });
    }

    // View Details Button
    const detailsBtn = card.querySelector('.view-details-btn');
    if (detailsBtn) {
      detailsBtn.addEventListener('click', () => openModal(doc));
    }

    return card;
  }

  // ═══════════ DETAIL MODAL ═══════════
  function openModal(doc) {
    dom.modalDocType.textContent = formatDocType(doc.type);
    dom.modalDate.textContent = doc.date || 'Unknown';
    dom.modalOA.textContent = doc.metadata?.openAccess ? '✓ Open Access' : 'Subscription Required';
    dom.modalTitle.textContent = doc.title;
    dom.modalAuthors.textContent = (doc.authors || []).join(', ');
    dom.modalVenue.textContent = doc.metadata?.venue ? `Published in: ${doc.metadata.venue}` : '';
    dom.modalAbstractText.textContent = doc.abstract || 'No abstract text available in index.';

    // Metadata Grid
    dom.modalMetaGrid.innerHTML = `
      <div class="modal-meta-item">
        <span class="modal-meta-label">Citations</span>
        <span class="modal-meta-value">${(doc.metadata?.citationCount || 0).toLocaleString()}</span>
      </div>
      <div class="modal-meta-item">
        <span class="modal-meta-label">Referenced Works</span>
        <span class="modal-meta-value">${doc.metadata?.referencedWorksCount || 0}</span>
      </div>
      <div class="modal-meta-item">
        <span class="modal-meta-label">Catalog ID</span>
        <span class="modal-meta-value">${escapeHTML(doc.id)}</span>
      </div>
      <div class="modal-meta-item">
        <span class="modal-meta-label">DOI</span>
        <span class="modal-meta-value">${doc.metadata?.doi ? escapeHTML(doc.metadata.doi) : 'N/A'}</span>
      </div>
    `;

    // Modal Actions
    dom.modalFooterActions.innerHTML = `
      <a href="${escapeHTML(doc.url || '#')}" target="_blank" rel="noopener noreferrer" class="modal-action-btn">
        Open Landing Page ↗
      </a>
      ${doc.metadata?.openAccessPdf ? `
        <a href="${escapeHTML(doc.metadata.openAccessPdf)}" target="_blank" rel="noopener noreferrer" class="modal-action-btn">
          View Open Access PDF ↗
        </a>
      ` : ''}
      <button type="button" class="modal-action-btn-secondary" id="modal-copy-cite-btn">
        Copy Citation (APA)
      </button>
    `;

    const copyCiteBtn = $('#modal-copy-cite-btn');
    if (copyCiteBtn) {
      copyCiteBtn.addEventListener('click', () => {
        const citation = generateAPACitation(doc);
        navigator.clipboard.writeText(citation).then(() => {
          copyCiteBtn.textContent = 'Copied!';
          setTimeout(() => { copyCiteBtn.textContent = 'Copy Citation (APA)'; }, 2000);
        });
      });
    }

    dom.modalBackdrop.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    dom.modalBackdrop.classList.add('hidden');
    document.body.style.overflow = '';
  }

  // ═══════════ EXPORT (CSV / JSON) ═══════════
  function exportCSV() {
    if (filteredDocuments.length === 0) return;

    const headers = [
      'ID',
      'Title',
      'Authors',
      'Publication Date',
      'Type',
      'Venue',
      'DOI',
      'Citations',
      'Open Access',
      'URL',
    ];

    const rows = filteredDocuments.map((doc) => [
      `"${(doc.id || '').replace(/"/g, '""')}"`,
      `"${(doc.title || '').replace(/"/g, '""')}"`,
      `"${(doc.authors || []).join('; ').replace(/"/g, '""')}"`,
      `"${doc.date || ''}"`,
      `"${doc.type || ''}"`,
      `"${(doc.metadata?.venue || '').replace(/"/g, '""')}"`,
      `"${doc.metadata?.doi || ''}"`,
      doc.metadata?.citationCount ?? 0,
      doc.metadata?.openAccess ? 'true' : 'false',
      `"${doc.url || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadFile(csvContent, `document_discovery_${sanitizeFilename(activeQuery)}.csv`);
  }

  function exportJSON() {
    if (filteredDocuments.length === 0) return;

    const exportData = {
      query: activeQuery,
      total_exported: filteredDocuments.length,
      timestamp: new Date().toISOString(),
      source: 'openalex',
      results: filteredDocuments,
    };

    const jsonContent = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
    downloadFile(jsonContent, `document_discovery_${sanitizeFilename(activeQuery)}.json`);
  }

  function copyRawJson() {
    if (!lastApiResponse) return;
    navigator.clipboard.writeText(JSON.stringify(lastApiResponse, null, 2)).then(() => {
      dom.copyJsonBtn.textContent = 'Copied!';
      setTimeout(() => { dom.copyJsonBtn.textContent = 'Copy Payload'; }, 2000);
    });
  }

  function downloadFile(uriContent, filename) {
    const link = document.createElement('a');
    link.setAttribute('href', uriContent);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ═══════════ STATE DISPLAY MANAGEMENT ═══════════
  function showState(state) {
    dom.emptyState.classList.toggle('hidden', state !== 'empty');
    dom.loadingState.classList.toggle('hidden', state !== 'loading');
    dom.errorState.classList.toggle('hidden', state !== 'error');
    dom.resultsView.classList.toggle('hidden', state !== 'results');
  }

  function showError(title, message) {
    dom.errorTitle.textContent = title;
    dom.errorMessage.textContent = message;
    showState('error');
  }

  function startProgressBar() {
    dom.progressBar.className = 'top-progress-bar active';
  }

  function completeProgressBar() {
    dom.progressBar.className = 'top-progress-bar complete';
    setTimeout(() => {
      dom.progressBar.className = 'top-progress-bar';
    }, 400);
  }

  function resetProgressBar() {
    dom.progressBar.className = 'top-progress-bar';
  }

  // ═══════════ RECENT SEARCHES ═══════════
  function saveRecentQuery(query) {
    try {
      let recent = JSON.parse(localStorage.getItem(STORAGE_RECENT_KEY) || '[]');
      recent = recent.filter((q) => q.toLowerCase() !== query.toLowerCase());
      recent.unshift(query);
      if (recent.length > MAX_RECENT_QUERIES) recent = recent.slice(0, MAX_RECENT_QUERIES);
      localStorage.setItem(STORAGE_RECENT_KEY, JSON.stringify(recent));
      renderRecentQueries();
    } catch (e) {
      console.warn('LocalStorage unavailable:', e);
    }
  }

  function renderRecentQueries() {
    try {
      const recent = JSON.parse(localStorage.getItem(STORAGE_RECENT_KEY) || '[]');
      if (recent.length === 0) {
        dom.recentContainer.classList.add('hidden');
        return;
      }

      dom.recentTags.innerHTML = '';
      recent.forEach((q) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'recent-query-chip';
        btn.textContent = q;
        btn.addEventListener('click', () => {
          dom.input.value = q;
          dom.clearBtn.classList.remove('hidden');
          dom.form.dispatchEvent(new Event('submit', { cancelable: true }));
        });
        dom.recentTags.appendChild(btn);
      });

      dom.recentContainer.classList.remove('hidden');
    } catch (e) {
      dom.recentContainer.classList.add('hidden');
    }
  }

  // ═══════════ HELPERS ═══════════
  function formatDocType(type) {
    switch (type) {
      case 'book': return 'Book / Chapter';
      case 'report': return 'Technical Report';
      case 'dataset': return 'Dataset';
      case 'repository': return 'Code Repository';
      case 'paper':
      default: return 'Research Paper';
    }
  }

  function formatAuthors(authors) {
    if (!authors || authors.length === 0) return 'Unknown Author';
    if (authors.length <= 3) return authors.join(', ');
    return `${authors.slice(0, 3).join(', ')} et al.`;
  }

  function generateAPACitation(doc) {
    const authors = formatAuthors(doc.authors);
    const year = doc.date ? doc.date.slice(0, 4) : 'n.d.';
    const title = doc.title;
    const venue = doc.metadata?.venue ? ` ${doc.metadata.venue}.` : '';
    const doi = doc.metadata?.doi ? ` https://doi.org/${doc.metadata.doi}` : (doc.url ? ` ${doc.url}` : '');
    return `${authors} (${year}). ${title}.${venue}${doi}`;
  }

  function sanitizeFilename(name) {
    return (name || 'export').replace(/[^a-z0-9_-]/gi, '_').toLowerCase().slice(0, 30);
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Initialize application on DOM ready
  document.addEventListener('DOMContentLoaded', init);
})();
