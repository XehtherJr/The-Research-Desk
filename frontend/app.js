/**
 * app.js — Client-side Controller for Document Discovery Engine V1.
 * Handles SearchPlan presentation, role-grouped result streaming,
 * multi-provider provenance, evidence tags, sorting, filtering, and export.
 */

(function () {
  'use strict';

  // ═══════════ DOM HELPERS & SELECTORS ═══════════
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const dom = {
    // Progress & Stages
    progressBar: $('#top-progress-bar'),
    stagePlan: $('#stage-plan'),
    stageRetrieve: $('#stage-retrieve'),
    stageEval: $('#stage-eval'),
    stageRank: $('#stage-rank'),

    // Search Controls
    form: $('#search-form'),
    input: $('#search-input'),
    clearBtn: $('#search-clear-btn'),
    limitSlider: $('#limit-slider'),
    limitValue: $('#limit-value'),
    searchBtn: $('#search-btn'),
    recentContainer: $('#recent-queries'),
    recentTags: $('#recent-tags'),
    sidebarInquiryList: $('#sidebar-inquiry-list'),
    viewAllInquiries: $('#view-all-inquiries'),
    librarySavedCount: $('#library-saved-count'),
    libraryLaterCount: $('#library-later-count'),
    libraryReadCount: $('#library-read-count'),
    libraryNotesCount: $('#library-notes-count'),
    libraryDownloadsCount: $('#library-downloads-count'),
    libraryView: $('#library-view'),
    libraryViewTitle: $('#library-view-title'),
    libraryViewList: $('#library-view-list'),
    libraryViewClose: $('#library-view-close'),
    librarySearch: $('#library-search'),

    // State Containers
    emptyState: $('#empty-state'),
    loadingState: $('#loading-state'),
    loadingStatusText: $('#loading-status-text'),
    loadingSubtext: $('#loading-subtext'),
    errorState: $('#error-state'),
    errorTitle: $('#error-title'),
    errorMessage: $('#error-message'),
    retryBtn: $('#retry-btn'),
    resultsView: $('#results-view'),

    // SearchPlan Panel
    planPanel: $('#search-plan-panel'),
    planToggleBtn: $('#plan-toggle-btn'),
    planBody: $('#plan-body'),
    planGoal: $('#plan-goal'),
    planIntentPill: $('#plan-intent-pill'),
    planConfidence: $('#plan-confidence'),
    planEvidenceList: $('#plan-evidence-list'),
    planReasoning: $('#plan-reasoning'),
    planJsonToggle: $('#plan-json-toggle'),
    planJsonView: $('#plan-json-view'),
    planJsonCode: $('#plan-json-code'),
    planPolicySummary: $('#plan-policy-summary'),

    // Results Header & Actions
    resultsCount: $('#results-count'),
    resultsTiming: $('#results-timing'),
    sourceProvenance: $('#source-provenance'),
    sortSelect: $('#sort-select'),
    exportCsvBtn: $('#export-csv-btn'),
    exportJsonBtn: $('#export-json-btn'),
    exportBibtexBtn: $('#export-bibtex-btn'),
    exportMarkdownBtn: $('#export-markdown-btn'),
    exportJsonlBtn: $('#export-jsonl-btn'),
    refinementStrip: $('#refinement-strip'),
    refinementChips: $('#refinement-chips'),

    // Role Filter Tabs
    roleTabs: $$('.role-tab'),
    tabCountAll: $('#tab-count-all'),
    tabCountFoundational: $('#tab-count-foundational'),
    tabCountApplied: $('#tab-count-applied'),
    tabCountImplementation: $('#tab-count-implementation'),
    tabCountDataset: $('#tab-count-dataset'),
    tabCountAlternative: $('#tab-count-alternative'),

    // Sidebar Filters
    filtersPanel: $('#filters-panel'),
    filterResetBtn: $('#filter-reset-btn'),
    dateFrom: $('#date-from'),
    dateTo: $('#date-to'),
    filterOA: $('#filter-oa'),
    activeFilterIndicator: $('#active-filter-indicator'),
    clearFiltersLink: $('#clear-filters-link'),
    resetFiltersInlineBtn: $('#reset-filters-inline-btn'),

    // Document Stream & Messages
    documentStream: $('#document-stream'),
    noFilteredMessage: $('#no-filtered-message'),

    // Raw Payload Inspector
    jsonInspector: $('#json-inspector'),
    jsonCode: $('#json-code'),
    copyJsonBtn: $('#copy-json-btn'),

    // Detail Modal
    modalBackdrop: $('#modal-backdrop'),
    modalCard: $('#modal-card'),
    modalCloseBtn: $('#modal-close-btn'),
    modalRolePill: $('#modal-role-pill'),
    modalDocType: $('#modal-doc-type'),
    modalDate: $('#modal-date'),
    modalOA: $('#modal-oa'),
    modalTitle: $('#modal-title'),
    modalAuthors: $('#modal-authors'),
    modalVenue: $('#modal-venue'),
    modalWhyUsefulText: $('#modal-why-useful-text'),
    modalEvidenceList: $('#modal-evidence-list'),
    modalProvenanceChips: $('#modal-provenance-chips'),
    modalAbstractText: $('#modal-abstract-text'),
    modalPreviewSection: $('#modal-preview-section'),
    documentPreview: $('#document-preview'),
    modalFooterActions: $('#modal-footer-actions'),
  };

  // ═══════════ APP STATE ═══════════
  let fullDiscoveryResults = []; // All DiscoveryResult[] from backend
  let filteredResults = [];      // Filtered view
  let lastServerPayload = null;  // Complete response
  let activeSearchPlan = null;   // Active SearchPlan
  let activeRoleOrder = ['foundational', 'applied', 'implementation', 'dataset', 'alternative'];
  let activeRoleTab = 'all';     // Active role tab filter
  let currentSort = 'discovery'; // Sorting key
  let activeQuery = '';

  const STORAGE_RECENT_KEY = 'dde_recent_searches_v1';
  const STORAGE_LIBRARY_KEY = 'research_desk_library_v1';
  const MAX_RECENT_QUERIES = 5;

  // ═══════════ INITIALIZATION ═══════════
  function init() {
    bindEvents();
    renderRecentQueries();
    renderSidebarInquiries();
    updateLibraryCounts();
    $$('[data-library-view]').forEach((button) => button.addEventListener('click', () => showLibraryView(button.dataset.libraryView)));
    dom.libraryViewClose.addEventListener('click', hideLibraryView);
    if (dom.input) dom.input.focus();
  }

  function bindEvents() {
    // Search Form Submission
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

    // Sidebar inquiry shortcuts
    // Retry Button
    dom.retryBtn.addEventListener('click', () => {
      if (activeQuery) dom.input.value = activeQuery;
      dom.form.dispatchEvent(new Event('submit', { cancelable: true }));
    });

    // SearchPlan Banner Collapse/Expand
    dom.planToggleBtn.addEventListener('click', () => {
      const isHidden = dom.planBody.classList.toggle('hidden');
      dom.planToggleBtn.setAttribute('aria-expanded', !isHidden);
      dom.planToggleBtn.textContent = isHidden ? 'Expand Strategy' : 'Collapse Strategy';
    });

    dom.planJsonToggle.addEventListener('click', () => {
      dom.planJsonView.classList.toggle('hidden');
    });

    // Role Tabs
    dom.roleTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        dom.roleTabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        activeRoleTab = tab.dataset.role;
        applyFiltersAndSort();
      });
    });

    // Sorting Dropdown
    dom.sortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value;
      applyFiltersAndSort();
    });

    // Sidebar Filters
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
    dom.exportBibtexBtn.addEventListener('click', exportBibTeX);
    dom.exportMarkdownBtn.addEventListener('click', exportMarkdown);
    dom.exportJsonlBtn.addEventListener('click', exportJSONL);
    dom.librarySearch.addEventListener('input', () => renderLibraryEntries(dom.librarySearch.dataset.view || 'saved'));

    // Copy JSON Payload
    dom.copyJsonBtn.addEventListener('click', copyRawJson);

    // Modal Events
    dom.modalCloseBtn.addEventListener('click', closeModal);
    dom.modalBackdrop.addEventListener('click', (e) => {
      if (e.target === dom.modalBackdrop) closeModal();
    });

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        dom.input.focus();
      }
      if (e.key === 'Escape') {
        if (!dom.modalBackdrop.classList.contains('hidden')) {
          closeModal();
        }
      }
    });
  }

  // ═══════════ SEARCH SUBMIT & PIPELINE ANIMATION ═══════════
  async function handleSearchSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();

    const query = dom.input.value.trim();
    if (!query) {
      dom.input.focus();
      return;
    }

    const limit = parseInt(dom.limitSlider.value, 10) || 20;
    activeQuery = query;
    saveRecentQuery(query);

    // Display Loading State & Stage Indicators
    showState('loading');
    startProgressBar();
    dom.searchBtn.disabled = true;
    animateLoadingStages();

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
      lastServerPayload = data;
      activeSearchPlan = data.searchPlan || null;
      activeRoleOrder = Array.isArray(activeSearchPlan?.roleOrder) && activeSearchPlan.roleOrder.length
        ? activeSearchPlan.roleOrder
        : ['foundational', 'applied', 'implementation', 'dataset', 'alternative'];
      syncRoleTabs();
      fullDiscoveryResults = data.results || [];
      renderRefinementChips(activeSearchPlan, fullDiscoveryResults);

      completeProgressBar();

      if (fullDiscoveryResults.length === 0) {
        const suggestions = data.metadata?.suggestions || ['Try broadening your terms.'];
        const diagnostics = data.metadata?.retrievedCandidates !== undefined
          ? ` ${data.metadata.retrievedCandidates} candidates retrieved; ${data.metadata.rejectedBeforeEvaluation || 0} rejected before evaluation.`
          : '';
        showError('No High-Confidence Documents', suggestions.join(' ') + diagnostics);
        return;
      }

      // Render SearchPlan Banner
      renderSearchPlan(activeSearchPlan);

      // Update Results Header
      const returnedCount = data.metadata?.returnedCount || fullDiscoveryResults.length;
      const totalCandidates = data.metadata?.totalCandidates || returnedCount;
      dom.resultsCount.textContent = `${returnedCount} curated documents (${totalCandidates} evaluated)`;

      const totalMs = data.metadata?.timing?.total_ms || data.duration_ms || 0;
      dom.resultsTiming.textContent = `${totalMs}ms`;

      if (dom.sourceProvenance && data.metadata?.providers && data.metadata.providers.length > 0) {
        dom.sourceProvenance.textContent = `Providers: ${data.metadata.providers.join(' • ')}`;
      }

      // Render Raw JSON Inspector
      dom.jsonCode.textContent = JSON.stringify(data, null, 2);

      // Reset filters and render role tabs & cards
      resetFiltersSilently();
      updateRoleTabCounts();
      applyFiltersAndSort();

      showState('results');
    } catch (err) {
      console.error('[Discovery Error]', err);
      resetProgressBar();
      showError('Discovery Request Failed', err.message || 'Unable to connect to the discovery pipeline service.');
    } finally {
      dom.searchBtn.disabled = false;
    }
  }

  function animateLoadingStages() {
    const stages = [dom.stagePlan, dom.stageRetrieve, dom.stageEval, dom.stageRank];
    stages.forEach((s) => s.classList.remove('active'));
    dom.stagePlan.classList.add('active');

    setTimeout(() => {
      dom.stagePlan.classList.remove('active');
      dom.stageRetrieve.classList.add('active');
    }, 400);

    setTimeout(() => {
      dom.stageRetrieve.classList.remove('active');
      dom.stageEval.classList.add('active');
    }, 1200);

    setTimeout(() => {
      dom.stageEval.classList.remove('active');
      dom.stageRank.classList.add('active');
    }, 2000);
  }

  // ═══════════ SEARCHPLAN PRESENTATION ═══════════
  function renderSearchPlan(plan) {
    if (!plan) {
      dom.planPanel.classList.add('hidden');
      return;
    }

    dom.planPanel.classList.remove('hidden');
    dom.planGoal.textContent = plan.intent?.goal || plan.query;
    dom.planIntentPill.textContent = plan.intent?.type || 'researching';
    dom.planConfidence.textContent = `Confidence: ${Math.round((plan.intent?.confidence || 0.9) * 100)}%`;

    // Evidence Needs
    dom.planEvidenceList.innerHTML = '';
    const needs = plan.evidenceNeeds || [];
    if (needs.length === 0) {
      dom.planEvidenceList.innerHTML = '<li>Methodologies, benchmarks, and technical implementations</li>';
    } else {
      needs.slice(0, 4).forEach((need) => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${escapeHTML(need.type)}:</strong> ${escapeHTML(need.description)}`;
        dom.planEvidenceList.appendChild(li);
      });
    }

    dom.planReasoning.textContent = plan.reasoning || '';
    const analysis = plan.queryAnalysis;
    const policy = plan.searchPolicy;
    if (analysis && policy) {
      const laneNames = policy.lanes.map((lane) => lane.name).join(' • ');
      dom.planPolicySummary.innerHTML = `<span>Domain: <strong>${escapeHTML(analysis.domain.primary)}</strong></span><span>Intent: <strong>${escapeHTML(analysis.intent.type)}</strong></span><span>Lanes: <strong>${escapeHTML(laneNames)}</strong></span>`;
    }
    dom.planJsonCode.textContent = JSON.stringify(plan, null, 2);
  }

  // ═══════════ FILTERING & SORTING ═══════════
  function applyFiltersAndSort() {
    const selectedTypes = new Set($$('input[name="type-filter"]:checked').map((cb) => cb.value));
    const fromYear = parseInt(dom.dateFrom.value, 10) || null;
    const toYear = parseInt(dom.dateTo.value, 10) || null;
    const openAccessOnly = dom.filterOA.checked;

    filteredResults = fullDiscoveryResults.filter((item) => {
      const doc = item.document;
      const role = (item.role || 'applied').toLowerCase();

      // Role Tab Filter
      if (activeRoleTab !== 'all' && role !== activeRoleTab) {
        return false;
      }

      // Document Type Filter
      if (!selectedTypes.has(doc.type)) {
        return false;
      }

      // Publication Year Filter
      const docYear = parseInt((doc.date || doc.metadata?.published || '').slice(0, 4), 10);
      if (fromYear && (!docYear || docYear < fromYear)) return false;
      if (toYear && (!docYear || docYear > toYear)) return false;

      // Open Access Filter
      if (openAccessOnly && !item.accessPath?.openAccess && !doc.metadata?.openAccess) {
        return false;
      }

      return true;
    });

    const isFiltered =
      activeRoleTab !== 'all' ||
      selectedTypes.size < 7 ||
      fromYear !== null ||
      toYear !== null ||
      openAccessOnly;

    dom.activeFilterIndicator.classList.toggle('hidden', !isFiltered);

    // Apply Sorting
    sortResults(filteredResults, currentSort);

    // Render Stream
    renderDiscoveryStream(filteredResults);
  }

  function sortResults(results, sortKey) {
    switch (sortKey) {
      case 'goal-fit':
        results.sort((a, b) => (b.evaluation?.goalFit || 0) - (a.evaluation?.goalFit || 0));
        break;
      case 'relevance':
        results.sort((a, b) => (b.evaluation?.relevance || 0) - (a.evaluation?.relevance || 0));
        break;
      case 'citations':
        results.sort(
          (a, b) => (b.document?.metadata?.citationCount || 0) - (a.document?.metadata?.citationCount || 0)
        );
        break;
      case 'date-newest':
        results.sort((a, b) => (b.document?.date || '').localeCompare(a.document?.date || ''));
        break;
      case 'discovery':
      default:
        results.sort((a, b) => (a.rank || 0) - (b.rank || 0));
        break;
    }
  }

  function updateRoleTabCounts() {
    const counts = { all: fullDiscoveryResults.length, foundational: 0, applied: 0, implementation: 0, dataset: 0, alternative: 0 };

    fullDiscoveryResults.forEach((item) => {
      const r = (item.role || 'applied').toLowerCase();
      if (counts[r] !== undefined) {
        counts[r]++;
      } else {
        counts.applied++;
      }
    });

    dom.tabCountAll.textContent = counts.all;
    dom.tabCountFoundational.textContent = counts.foundational;
    dom.tabCountApplied.textContent = counts.applied;
    dom.tabCountImplementation.textContent = counts.implementation;
    dom.tabCountDataset.textContent = counts.dataset;
    dom.tabCountAlternative.textContent = counts.alternative;
  }

  function syncRoleTabs() {
    const tabContainer = dom.roleTabs[0]?.parentElement;
    if (!tabContainer) return;
    const allTab = dom.roleTabs.find((tab) => tab.dataset.role === 'all');
    const tabsByRole = new Map(dom.roleTabs.map((tab) => [tab.dataset.role, tab]));
    if (allTab) tabContainer.appendChild(allTab);
    activeRoleOrder.forEach((role) => {
      const tab = tabsByRole.get(role);
      if (tab) tabContainer.appendChild(tab);
    });
  }

  function resetFilters() {
    resetFiltersSilently();
    applyFiltersAndSort();
  }

  function resetFiltersSilently() {
    activeRoleTab = 'all';
    dom.roleTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.role === 'all'));
    $$('input[name="type-filter"]').forEach((cb) => (cb.checked = true));
    dom.dateFrom.value = '';
    dom.dateTo.value = '';
    dom.filterOA.checked = false;
    dom.activeFilterIndicator.classList.add('hidden');
  }

  // ═══════════ RENDERING ROLE-ORGANIZED CARDS ═══════════
  function renderDiscoveryStream(results) {
    dom.documentStream.innerHTML = '';

    if (results.length === 0) {
      dom.noFilteredMessage.classList.remove('hidden');
      return;
    }

    dom.noFilteredMessage.classList.add('hidden');

    // If viewing "all", group by research role with section headers
    if (activeRoleTab === 'all') {
      const roleOrder = activeRoleOrder;
      const grouped = {};
      roleOrder.forEach((r) => { grouped[r] = []; });

      results.forEach((item) => {
        const r = (item.role || 'applied').toLowerCase();
        if (grouped[r]) grouped[r].push(item);
        else grouped.applied.push(item);
      });

      const fragment = document.createDocumentFragment();

      roleOrder.forEach((roleKey) => {
        const items = grouped[roleKey];
        if (items && items.length > 0) {
          const section = document.createElement('section');
          section.className = 'role-section-group';

          const header = document.createElement('div');
          header.className = 'role-section-header';
          header.innerHTML = `
            <h3 class="role-section-title">${formatRoleName(roleKey)} (${items.length})</h3>
            <span class="role-section-desc">${getRoleDescription(roleKey)}</span>
          `;
          section.appendChild(header);

          items.forEach((item) => {
            section.appendChild(createDiscoveryCard(item));
          });

          fragment.appendChild(section);
        }
      });

      dom.documentStream.appendChild(fragment);
    } else {
      // Direct stream for single active role
      const fragment = document.createDocumentFragment();
      results.forEach((item) => {
        fragment.appendChild(createDiscoveryCard(item));
      });
      dom.documentStream.appendChild(fragment);
    }
  }

  function createDiscoveryCard(item) {
    const doc = item.document;
    const evalData = item.evaluation || {};
    const card = document.createElement('article');
    card.className = 'document-card';
    card.setAttribute('data-id', doc.id);
    const savedLibrary = getLibrary();
    if ((savedLibrary.read || []).some((entry) => entryId(entry) === doc.id)) card.classList.add('is-read');

    const roleName = formatRoleName(item.role || 'applied');
    const docTypeName = formatDocType(doc.type);
    const isOpenAccess = Boolean(item.accessPath?.openAccess || doc.metadata?.openAccess);
    const oaClass = isOpenAccess ? 'open' : 'closed';
    const oaText = isOpenAccess ? 'Open Access' : 'Subscription';
    const authorsText = formatAuthors(doc.metadata?.authors || doc.authors);
    const venueText = doc.metadata?.venue ? doc.metadata.venue : '';
    const dateText = doc.date || doc.metadata?.published || 'Unknown Date';
    const citations = doc.metadata?.citationCount || 0;

    // Evidence tags list
    const evidenceBadges = (item.evidence || evalData.evidence || []).slice(0, 3).map((ev) => {
      return `<span class="evidence-tag">[${escapeHTML(ev.need || 'evidence')}]</span>`;
    }).join(' ');

    // Provenance tags list
    const provenanceBadges = (item.discoveredVia || ['OpenAlex']).map((src) => {
      return `<span class="provenance-tag">via ${escapeHTML(src)}</span>`;
    }).join(' ');

    card.innerHTML = `
      <div class="card-top-meta">
        <span class="role-pill">${escapeHTML(roleName)}</span>
        <span class="doc-type-badge">${escapeHTML(docTypeName)}</span>
        <span class="doc-year">${escapeHTML(dateText)}</span>
        <span class="doc-oa-badge ${oaClass}">${oaText}</span>
      </div>

      <a href="${escapeHTML(item.accessPath?.url || doc.canonicalUrl || '#')}" target="_blank" rel="noopener noreferrer" class="card-title-link">
        <h3 class="card-title">${escapeHTML(doc.title)}</h3>
      </a>

      <p class="card-authors">${escapeHTML(authorsText)}</p>
      ${venueText ? `<p class="card-venue">${escapeHTML(venueText)}</p>` : ''}

      <!-- Why Useful Box -->
      <div class="why-useful-box">
        <span class="why-useful-label">Why Useful for Goal:</span>
        <p class="why-useful-text">${escapeHTML(item.whyUseful || evalData.explanation || 'Key research publication.')}</p>
      </div>

      ${renderEnrichmentSummary(doc)}
      ${doc.domainCoherence ? `<div class="coherence-line"><b>Domain coherence</b><span>${Math.round(doc.domainCoherence.score * 100)}% • ${escapeHTML(doc.domainCoherence.contextIsRelevant ? 'directly relevant' : 'adjacent evidence')}</span></div>` : ''}

      <!-- Badges Row: Evidence & Provenance -->
      <div class="card-badges-row">
        ${evidenceBadges}
        ${provenanceBadges}
      </div>

      <!-- Abstract preview -->
      <div class="card-abstract-wrap">
        <div class="card-abstract-text" id="abstract-${escapeHTML(doc.id)}">${markdownToHTML(doc.abstract || 'No abstract preview available.')}</div>
        ${doc.abstract && doc.abstract.length > 220 ? `
          <button type="button" class="toggle-abstract-btn" data-target="abstract-${escapeHTML(doc.id)}" aria-expanded="false">
            Read full abstract ↓
          </button>
        ` : ''}
      </div>

      <!-- Footer Metrics & Actions -->
      <div class="card-footer">
        <div class="card-metrics">
          <span>${citations.toLocaleString()} citations</span>
          ${doc.metadata?.doi ? `<span>DOI: ${escapeHTML(doc.metadata.doi)}</span>` : ''}
          ${evalData.goalFit ? `<span>Goal Fit: ${evalData.goalFit}%</span>` : ''}
        </div>

        <div class="card-actions">
          <button type="button" class="card-action-btn review-btn" data-review-label="relevant">Relevant</button>
          <button type="button" class="card-action-btn review-btn" data-review-label="not-relevant">Not relevant</button>
          <button type="button" class="card-action-btn citation-copy-btn">Copy citation</button>
          <button type="button" class="card-action-btn library-action-btn" data-library-action="saved">Save</button>
          <button type="button" class="card-action-btn library-action-btn" data-library-action="later">Read Later</button>
          <button type="button" class="card-action-btn library-action-btn" data-library-action="read">Mark Read</button>
          <button type="button" class="card-action-btn library-action-btn" data-library-action="download">Download</button>
          <a href="${escapeHTML(item.accessPath?.url || doc.canonicalUrl || '#')}" target="_blank" rel="noopener noreferrer" class="card-action-link">
            Direct Source ↗
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

    // The card is the details affordance; controls and links keep their own behavior.
    card.addEventListener('click', (event) => {
      if (!event.target.closest('button, a, input, select, textarea')) openModal(item);
    });

    card.querySelectorAll('.library-action-btn').forEach((button) => {
      button.addEventListener('click', () => handleLibraryAction(button.dataset.libraryAction, item, button));
    });
    card.querySelectorAll('.review-btn').forEach((button) => {
      button.addEventListener('click', () => submitReview(item, button.dataset.reviewLabel, button));
    });
    const citationCopyButton = card.querySelector('.citation-copy-btn');
    citationCopyButton.addEventListener('click', () => navigator.clipboard.writeText(generateAPACitation(doc)).then(() => {
      citationCopyButton.textContent = 'Copied';
      setTimeout(() => { citationCopyButton.textContent = 'Copy citation'; }, 1600);
    }));

    return card;
  }

  async function submitReview(item, label, button) {
    const evaluation = item.evaluation || {};
    try {
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: activeQuery,
          documentId: item.document.id,
          title: item.document.title,
          abstract: item.document.abstract,
          label,
          useful: label === 'relevant',
          relevance: evaluation.relevance || 0,
          goalFit: evaluation.goalFit || 0,
          evidenceQuality: evaluation.evidenceQuality || 0,
          semanticScore: evaluation.semanticScore || item.document.semanticSimilarity || 0,
          coherence: evaluation.domainValidity || Math.round((item.document.domainCoherence?.score || 0) * 100),
        }),
      });
      if (!response.ok) throw new Error('Review could not be saved');
      button.parentElement.querySelectorAll('.review-btn').forEach((candidate) => candidate.classList.remove('selected'));
      button.classList.add('selected');
      button.textContent = 'Recorded';
    } catch (error) {
      button.textContent = 'Retry review';
    }
  }

  // ═══════════ DETAIL MODAL ═══════════
  function openModal(item) {
    const doc = item.document;
    const evalData = item.evaluation || {};

    dom.modalRolePill.textContent = formatRoleName(item.role || 'applied');
    dom.modalDocType.textContent = formatDocType(doc.type);
    dom.modalDate.textContent = doc.date || doc.metadata?.published || 'Unknown';
    dom.modalOA.textContent = item.accessPath?.openAccess ? '✓ Open Access' : 'Subscription';
    dom.modalTitle.textContent = doc.title;
    dom.modalAuthors.textContent = (doc.metadata?.authors || doc.authors || []).join(', ');
    dom.modalVenue.textContent = doc.metadata?.venue ? `Published in: ${doc.metadata.venue}` : '';
    dom.modalWhyUsefulText.textContent = item.whyUseful || evalData.explanation || 'Key domain reference.';
    dom.modalAbstractText.innerHTML = markdownToHTML(doc.abstract || 'No abstract text indexed.');

    // Evidence Findings List
    dom.modalEvidenceList.innerHTML = '';
    const evidenceList = item.evidence || evalData.evidence || [];
    if (evidenceList.length === 0) {
      dom.modalEvidenceList.innerHTML = '<p class="modal-evidence-item">Evaluation completed via metadata relevance and goal matching.</p>';
    } else {
      evidenceList.forEach((ev) => {
        const div = document.createElement('div');
        div.className = 'modal-evidence-item';
        div.innerHTML = `
          <span class="modal-evidence-need">[${escapeHTML(ev.need || 'Evidence')}]</span>
          <p>${escapeHTML(ev.finding || '')}</p>
        `;
        dom.modalEvidenceList.appendChild(div);
      });
    }

    // Provenance Chips
    dom.modalProvenanceChips.innerHTML = '';
    const providers = doc.provenance?.providers || [];
    if (providers.length === 0) {
      dom.modalProvenanceChips.innerHTML = '<span class="provenance-tag">OpenAlex</span>';
    } else {
      providers.forEach((p) => {
        const span = document.createElement('span');
        span.className = 'provenance-tag';
        span.textContent = `${p.provider === 'company' ? 'Company Research: ' + (p.source || 'Institution').toUpperCase() : p.provider.toUpperCase()} (${p.domain || 'primary'})`;
        dom.modalProvenanceChips.appendChild(span);
      });
    }

    // Modal Footer Actions
    const primaryUrl = item.accessPath?.url || doc.canonicalUrl || '#';
    const pdfUrl = doc.access?.pdfUrl || doc.metadata?.openAccessPdf || null;
    const downloadUrl = pdfUrl ? `/api/download?url=${encodeURIComponent(pdfUrl)}&filename=${encodeURIComponent(`${sanitizeFilename(doc.title)}.pdf`)}` : null;
    dom.modalPreviewSection.classList.toggle('hidden', !pdfUrl);
    if (pdfUrl) dom.documentPreview.src = pdfUrl;

    dom.modalFooterActions.innerHTML = `
      <a href="${escapeHTML(primaryUrl)}" target="_blank" rel="noopener noreferrer" class="modal-action-btn">
        Open Landing Page ↗
      </a>
      ${pdfUrl ? `
        <button type="button" class="modal-action-btn" id="modal-preview-btn">Preview here</button>
        <a href="${escapeHTML(downloadUrl)}" download class="modal-action-btn">Download file</a>
      ` : ''}
      <button type="button" class="modal-action-btn-secondary" id="modal-copy-cite-btn">
        Copy Citation (APA)
      </button>
    `;

    const copyBtn = $('#modal-copy-cite-btn');
    const previewBtn = $('#modal-preview-btn');
    if (previewBtn) previewBtn.addEventListener('click', () => dom.modalPreviewSection.classList.toggle('hidden'));
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const citation = generateAPACitation(doc);
        navigator.clipboard.writeText(citation).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy Citation (APA)'; }, 2000);
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
    if (filteredResults.length === 0) return;

    const headers = [
      'Rank',
      'Role',
      'Title',
      'Why Useful',
      'Authors',
      'Date',
      'Type',
      'Discovered Via',
      'Citations',
      'Open Access',
      'URL',
    ];

    const rows = filteredResults.map((item) => {
      const doc = item.document;
      return [
        item.rank || 0,
        `"${(item.role || '').replace(/"/g, '""')}"`,
        `"${(doc.title || '').replace(/"/g, '""')}"`,
        `"${(item.whyUseful || '').replace(/"/g, '""')}"`,
        `"${(doc.metadata?.authors || doc.authors || []).join('; ').replace(/"/g, '""')}"`,
        `"${doc.date || doc.metadata?.published || ''}"`,
        `"${doc.type || ''}"`,
        `"${(item.discoveredVia || []).join(', ')}"`,
        doc.metadata?.citationCount ?? 0,
        item.accessPath?.openAccess ? 'true' : 'false',
        `"${item.accessPath?.url || doc.canonicalUrl || ''}"`,
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadFile(csvContent, `discovery_${sanitizeFilename(activeQuery)}.csv`);
  }

  function exportJSON() {
    if (filteredResults.length === 0) return;

    const exportData = {
      query: activeQuery,
      searchPlan: activeSearchPlan,
      total_curated: filteredResults.length,
      timestamp: new Date().toISOString(),
      results: filteredResults,
    };

    const jsonContent = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
    downloadFile(jsonContent, `discovery_${sanitizeFilename(activeQuery)}.json`);
  }

  function exportJSONL() {
    if (!filteredResults.length) return;
    const content = filteredResults.map((item) => JSON.stringify(item)).join('\n') + '\n';
    downloadFile('data:application/x-ndjson;charset=utf-8,' + encodeURIComponent(content), `discovery_${sanitizeFilename(activeQuery)}.jsonl`);
  }

  function exportMarkdown() {
    if (!filteredResults.length) return;
    const content = `# Research results: ${activeQuery}\n\n${filteredResults.map((item) => `## ${item.document.title}\n\n${item.whyUseful || ''}\n\n${generateAPACitation(item.document)}`).join('\n\n')}`;
    downloadFile('data:text/markdown;charset=utf-8,' + encodeURIComponent(content), `discovery_${sanitizeFilename(activeQuery)}.md`);
  }

  function exportBibTeX() {
    if (!filteredResults.length) return;
    const content = filteredResults.map((item, index) => {
      const doc = item.document;
      const key = `${sanitizeFilename((doc.metadata?.authors || ['source'])[0])}${(doc.date || doc.metadata?.published || 'nd').slice(0, 4)}${index + 1}`;
      return `@article{${key},\n  title = {${doc.title || ''}},\n  author = {${(doc.metadata?.authors || []).join(' and ')}},\n  year = {${(doc.date || doc.metadata?.published || '').slice(0, 4)}},\n  url = {${doc.canonicalUrl || ''}}\n}`;
    }).join('\n\n');
    downloadFile('data:text/plain;charset=utf-8,' + encodeURIComponent(content), `discovery_${sanitizeFilename(activeQuery)}.bib`);
  }

  function copyRawJson() {
    if (!lastServerPayload) return;
    navigator.clipboard.writeText(JSON.stringify(lastServerPayload, null, 2)).then(() => {
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

  // ═══════════ STATE MANAGEMENT ═══════════
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
    setTimeout(() => { dom.progressBar.className = 'top-progress-bar'; }, 350);
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
      renderSidebarInquiries();
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
        const chip = document.createElement('span');
        chip.className = 'recent-query-chip';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'recent-query-open';
        btn.textContent = q;
        btn.addEventListener('click', () => {
          dom.input.value = q;
          dom.clearBtn.classList.remove('hidden');
          dom.form.dispatchEvent(new Event('submit', { cancelable: true }));
        });
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'recent-query-remove';
        removeBtn.setAttribute('aria-label', `Remove recent search: ${q}`);
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', () => removeRecentQuery(q));
        chip.append(btn, removeBtn);
        dom.recentTags.appendChild(chip);
      });

      dom.recentContainer.classList.remove('hidden');
    } catch (e) {
      dom.recentContainer.classList.add('hidden');
    }
  }

  function removeRecentQuery(query) {
    try {
      const recent = JSON.parse(localStorage.getItem(STORAGE_RECENT_KEY) || '[]');
      localStorage.setItem(STORAGE_RECENT_KEY, JSON.stringify(recent.filter((q) => q !== query)));
      renderRecentQueries();
      renderSidebarInquiries();
    } catch (e) {
      console.warn('LocalStorage unavailable:', e);
    }
  }

  function getLibrary() {
    try {
      return { read: [], ...JSON.parse(localStorage.getItem(STORAGE_LIBRARY_KEY) || '{"saved":[],"later":[],"notes":[],"downloads":[]}') };
    } catch (e) {
      return { saved: [], later: [], read: [], notes: [], downloads: [] };
    }
  }

  function updateLibraryCounts() {
    const library = getLibrary();
    dom.librarySavedCount.textContent = library.saved.length;
    dom.libraryLaterCount.textContent = library.later.length;
    dom.libraryReadCount.textContent = (library.read || []).length;
    dom.libraryNotesCount.textContent = library.notes.length;
    dom.libraryDownloadsCount.textContent = library.downloads.length;
  }

  function handleLibraryAction(action, item, button) {
    const library = getLibrary();
    const id = item.document.id;
    const entry = { id, title: item.document.title, abstract: item.document.abstract || '', query: activeQuery, url: item.accessPath?.url || item.document.canonicalUrl || '', text: '' };
    if (action === 'note') {
      const note = window.prompt('Add a note for this document:');
      if (!note || !note.trim()) return;
      entry.text = note.trim();
      library.notes = library.notes.filter((savedEntry) => entryId(savedEntry) !== id);
      library.notes.push(entry);
    } else if (action === 'download') {
      const url = getDownloadUrl(item) || item.accessPath?.url || item.document.canonicalUrl;
      if (url) downloadSourceFile(url, item.document.title);
      if (!library.downloads.some((savedEntry) => entryId(savedEntry) === id)) library.downloads.push(entry);
    } else if (action === 'read') {
      library.read = library.read || [];
      if (!library.read.some((savedEntry) => entryId(savedEntry) === id)) library.read.push(entry);
      button.classList.add('is-active');
      button.textContent = 'Read';
      button.closest('.document-card').classList.add('is-read');
    } else {
      const collection = library[action];
      const index = collection.findIndex((savedEntry) => entryId(savedEntry) === id);
      if (index === -1) collection.push(entry);
      else collection.splice(index, 1);
      button.classList.toggle('is-active', index === -1);
    }
    localStorage.setItem(STORAGE_LIBRARY_KEY, JSON.stringify(library));
    updateLibraryCounts();
    if (action === 'note') button.textContent = 'Note saved';
    if (action === 'download') button.textContent = 'Downloaded';
  }

  function getDownloadUrl(item) {
    return item.document.access?.pdfUrl || item.document.metadata?.openAccessPdf || item.accessPath?.pdfUrl || null;
  }

  async function downloadSourceFile(url, title) {
    const proxyUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(`${sanitizeFilename(title)}.pdf`)}`;
    const link = document.createElement('a');
    link.href = proxyUrl;
    link.download = `${sanitizeFilename(title)}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function entryId(entry) { return typeof entry === 'string' ? entry : entry.id; }

  function showLibraryView(view) {
    const names = { saved: 'Saved Collections', later: 'Read Later', read: 'Already Read', notes: 'Notes', downloads: 'Downloads' };
    const library = getLibrary();
    dom.libraryViewTitle.textContent = names[view] || 'Your Library';
    dom.librarySearch.value = '';
    dom.librarySearch.dataset.view = view;
    renderLibraryEntries(view);
    dom.emptyState.classList.add('hidden');
    dom.resultsView.classList.add('hidden');
    dom.libraryView.classList.remove('hidden');
  }

  function renderLibraryEntries(view) {
    const library = getLibrary();
    const query = (dom.librarySearch.value || '').toLowerCase();
    const entries = (library[view] || []).map((entry) => typeof entry === 'string' ? { id: entry, title: entry } : entry)
      .filter((entry) => window.ResearchDeskFeatures.libraryMatches(entry, query));
    dom.libraryViewList.innerHTML = entries.length ? entries.map((entry) => `<article class="library-entry"><h3>${escapeHTML(entry.title || entry.id)}</h3>${entry.text ? `<p>${escapeHTML(entry.text)}</p>` : ''}${entry.url ? `<a href="${escapeHTML(entry.url)}" target="_blank" rel="noopener noreferrer">Open source ↗</a>` : ''}</article>`).join('') : '<p class="library-empty">Nothing here yet. Save a document from your discovery results to start building this shelf.</p>';
  }

  function renderRefinementChips(plan, results) {
    const terms = window.ResearchDeskFeatures.refinementTerms(plan, results);
    dom.refinementChips.innerHTML = terms.map((term) => `<button type="button" class="refinement-chip" data-term="${escapeHTML(term)}">${escapeHTML(term)}</button>`).join('');
    dom.refinementStrip.classList.toggle('hidden', terms.length === 0);
    dom.refinementChips.querySelectorAll('.refinement-chip').forEach((chip) => chip.addEventListener('click', () => {
      dom.input.value = `${activeQuery} ${chip.dataset.term}`;
      dom.form.dispatchEvent(new Event('submit', { cancelable: true }));
    }));
  }

  function hideLibraryView() {
    dom.libraryView.classList.add('hidden');
    if (fullDiscoveryResults.length) dom.resultsView.classList.remove('hidden');
    else dom.emptyState.classList.remove('hidden');
  }

  function markdownToHTML(markdown) {
    const escaped = escapeHTML(markdown || '');
    return escaped.replace(/^### (.*)$/gm, '<h5>$1</h5>').replace(/^## (.*)$/gm, '<h4>$1</h4>').replace(/^# (.*)$/gm, '<h3>$1</h3>').replace(/^[-*] (.*)$/gm, '<li>$1</li>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').split(/\n\n+/).map((block) => block.startsWith('<h') || block.startsWith('<li>') ? block : `<p>${block.replace(/\n/g, '<br>')}</p>`).join('').replace(/(<li>.*?<\/li>)+/gs, '<ul>$&</ul>');
  }

  function renderEnrichmentSummary(doc) {
    const enriched = doc.enrichedMetadata;
    const citation = doc.citationContext;
    if (!enriched && !citation) return '';
    const methods = (enriched?.methods || []).slice(0, 4).map((method) => `<span class="enrichment-chip">${escapeHTML(method.name)}</span>`).join('');
    const datasets = (enriched?.datasets || []).slice(0, 4).map((dataset) => escapeHTML(dataset.name)).join(' • ');
    const repro = enriched?.reproducibility;
    const momentum = citation?.momentum;
    const context = citation?.contextAnalysis;
    const contextSummary = context?.counts ? Object.entries(context.counts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([label, count]) => `${count} ${label}`).join(' • ') : '';
    return `<div class="enrichment-summary">
      ${methods ? `<div><b>Methods</b><span class="enrichment-chips">${methods}</span></div>` : ''}
      ${datasets ? `<div><b>Datasets</b><span>${datasets}</span></div>` : ''}
      ${repro ? `<div><b>Reproducibility</b><span class="repro-${repro.score}">${repro.score.toUpperCase()}${repro.codeAvailable ? ' • Code' : ''}${repro.dataAvailable ? ' • Data' : ''}</span></div>` : ''}
      ${momentum ? `<div><b>Citation momentum</b><span>${momentum.citesPerYear}/yr • ${momentum.trend}</span></div>` : ''}
      ${contextSummary ? `<div><b>Citation context</b><span>${escapeHTML(contextSummary)}</span></div>` : ''}
    </div>`;
  }

  function renderSidebarInquiries() {
    if (!dom.sidebarInquiryList) return;
    const recent = JSON.parse(localStorage.getItem(STORAGE_RECENT_KEY) || '[]');
    dom.sidebarInquiryList.innerHTML = '';
    if (recent.length === 0) {
      dom.sidebarInquiryList.innerHTML = '<p class="sidebar-empty">Your inquiries will appear here.</p>';
      dom.viewAllInquiries.classList.add('hidden');
      return;
    }
    recent.slice(0, 5).forEach((query, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'inquiry-item';
      button.innerHTML = `<b>${String(index + 1).padStart(2, '0')}</b><span>${escapeHTML(query)}</span>`;
      button.addEventListener('click', () => {
        dom.input.value = query;
        dom.clearBtn.classList.remove('hidden');
        dom.form.dispatchEvent(new Event('submit', { cancelable: true }));
      });
      dom.sidebarInquiryList.appendChild(button);
    });
    dom.viewAllInquiries.classList.toggle('hidden', recent.length <= 5);
  }

  // ═══════════ HELPERS ═══════════
  function formatRoleName(role) {
    switch (role) {
      case 'foundational': return 'Foundational';
      case 'applied': return 'Applied & Methods';
      case 'implementation': return 'Implementation';
      case 'dataset': return 'Data & Assets';
      case 'alternative': return 'Alternative Perspectives';
      default: return 'Applied';
    }
  }

  function getRoleDescription(role) {
    switch (role) {
      case 'foundational': return 'Surveys, theoretical groundings, and landmark frameworks.';
      case 'applied': return 'Empirical architectures, algorithms, and experimental evaluations.';
      case 'implementation': return 'Working codebases, production frameworks, and practical tools.';
      case 'dataset': return 'Evaluation benchmarks, ground truth corpora, and telemetry.';
      case 'alternative': return 'Complementary paradigms and orthogonal methodologies.';
      default: return 'Research publications.';
    }
  }

  function formatDocType(type) {
    switch (type) {
      case 'book': return 'Book / Chapter';
      case 'report': return 'Technical Report';
      case 'dataset': return 'Dataset';
      case 'repository': return 'Code Repository';
      case 'patent': return 'Patent';
      case 'grant': return 'Grant';
      case 'policy_document': return 'Policy Document';
      case 'clinical_trial': return 'Clinical Trial';
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
    const authors = formatAuthors(doc.metadata?.authors || doc.authors);
    const year = doc.date ? doc.date.slice(0, 4) : 'n.d.';
    const title = doc.title;
    const venue = doc.metadata?.venue ? ` ${doc.metadata.venue}.` : '';
    const doi = doc.metadata?.doi ? ` https://doi.org/${doc.metadata.doi}` : (doc.canonicalUrl ? ` ${doc.canonicalUrl}` : '');
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

  document.addEventListener('DOMContentLoaded', init);
})();
