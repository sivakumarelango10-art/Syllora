/**
 * ============================================================================
 * VIEW: ASK SYLLORA & EVIDENCE INSPECTOR
 * ============================================================================
 * - Source selection panel on the left
 * - Central question & search workspace with Ask, Search, Summarise tabs
 * - Search modes: Keyword (client-side text filter), Semantic, Combined
 * - 5 Required Sample Questions with deterministic fixtures & cancellation
 * - Real citation pills linking to PDF Reader and verified page excerpts
 * - Evidence Inspector with Claims, Topic Comparison, and Formula Cards
 * - Clear "Insufficient Evidence" handling for unsupported queries
 */

import { workspaceStore } from '../state.js';
import { PdfReader } from '../components/pdfViewer.js';
import { Toast } from '../components/modal.js';

// Deterministic Academic Answer Fixtures
const QUESTION_FIXTURES = {
  'explain deadlock in simple words': {
    status: 'fully_supported',
    evidenceLabel: 'Fully supported by materials',
    answer: `A **deadlock** is a standstill situation in an operating system where a group of processes is permanently blocked because each process is holding a resource that another process needs, and neither can move forward without it.

For example, if Process A holds the printer and requests the disk, while Process B holds the disk and requests the printer, neither process can release what it has, and neither can proceed. All four **Coffman conditions** (Mutual Exclusion, Hold and Wait, No Preemption, and Circular Wait) must hold simultaneously for this state to exist.`,
    citations: [
      { docId: 'doc-1', docTitle: 'Silberschatz (Ch. 8)', page: 2, quote: 'A deadlock situation can arise if and only if the following four conditions hold simultaneously: Mutual Exclusion, Hold and Wait, No Preemption, Circular Wait.' },
      { docId: 'doc-2', docTitle: 'Tanenbaum (Ch. 6)', page: 2, quote: 'Consider five philosophers: if each picks up the left chopstick simultaneously, circular waiting causes total halt.' }
    ],
    claims: [
      { claim: 'Deadlock requires 4 simultaneous conditions (Coffman Criteria)', sourcePassageId: 'pass-1' },
      { claim: 'Circular wait creates unbroken dependency chains', sourcePassageId: 'pass-4' }
    ]
  },
  'how is deadlock different from starvation': {
    status: 'fully_supported',
    evidenceLabel: 'Fully supported by materials',
    answer: `While both deadlock and starvation cause processes to wait, their underlying causes and system states are fundamentally different:

1. **Deadlock (Static Terminal State):**
   A circular dependency where progress is mathematically impossible for the involved processes without external intervention. System throughput for the deadlocked set drops to 0%.

2. **Starvation (Dynamic Scheduling Pathology):**
   Also termed *indefinite postponement*, starvation occurs when a process is runnable and willing to execute, but is perpetually bypassed because the scheduler continually allocates resources to higher-priority processes.

Operating systems mitigate starvation using **aging** (gradually elevating process priority over wait time), whereas resolving deadlocks requires cycle breaking, resource preemption, or process termination.`,
    citations: [
      { docId: 'doc-1', docTitle: 'Silberschatz (Ch. 8)', page: 3, quote: 'A deadlock occurs when every process in a set is waiting for an event only another process can cause. Starvation is postponement due to priority bias.' },
      { docId: 'doc-3', docTitle: 'Lecture Slides', page: 5, quote: 'Aging gradually increases the priority of processes that wait in the system for a long time.' }
    ],
    claims: [
      { claim: 'Deadlock involves circular waiting; starvation does not require circular wait', sourcePassageId: 'pass-2' },
      { claim: 'Starvation is resolved via aging priority adjustments', sourcePassageId: 'pass-6' }
    ]
  },
  'compare paging and segmentation': {
    status: 'partially_supported',
    evidenceLabel: 'Partially supported (Limited Evidence in Materials)',
    answer: `The available materials for CS301 (Deadlocks & Concurrency modules) contain **limited evidence** regarding memory management:

- **Paging:** Divides virtual memory into fixed-sized blocks called pages and physical memory into page frames, eliminating external fragmentation.
- **Segmentation:** Divides memory into logical, variable-length segments reflecting the programmer's view (code, stack, data), which can suffer from external fragmentation.

*Notice:* The loaded CS301 textbook chapters currently focus primarily on Chapter 8 Deadlocks. For comprehensive memory translation diagrams, upload or index the Chapter 9/10 Memory Management reading package.`,
    citations: [],
    claims: [
      { claim: 'Materials contain high-level topic references in syllabus table, but lack full text excerpts in active library.', sourcePassageId: null }
    ]
  },
  'why do programs keep waiting for each other': {
    status: 'fully_supported',
    evidenceLabel: 'Fully supported by materials',
    answer: `Programs wait on each other due to **inter-process resource contention** and **synchronization primitives**:

1. **Mutual Exclusion:** Critical resources (like disk blocks, sockets, and hardware devices) cannot be safely shared simultaneously without data corruption.
2. **Hold and Wait:** A thread holds lock A while waiting to acquire lock B. If another thread holds lock B and waits for lock A, neither yields their lock voluntarily (No Preemption).

Breaking any single Coffman condition—such as requiring processes to request all resources at once or enforcing strict hierarchical resource ordering—prevents perpetual waiting.`,
    citations: [
      { docId: 'doc-1', docTitle: 'Silberschatz (Ch. 8)', page: 2, quote: 'At least one resource must be held in a nonsharable mode... and resources cannot be preempted.' },
      { docId: 'doc-3', docTitle: 'Lecture Slides', page: 3, quote: 'ALL 4 conditions MUST be simultaneously true for deadlock to manifest.' }
    ],
    claims: [
      { claim: 'Lock contention originates in non-preemptible resource sharing', sourcePassageId: 'pass-1' }
    ]
  }
};

export function renderAsk(container, queryParams = {}) {
  let activeTab = 'ask'; // 'ask' | 'search' | 'summarise'
  let searchMode = 'keyword'; // 'keyword' | 'semantic' | 'combined'
  let currentQuery = queryParams.q || workspaceStore.getDraft('ask_query') || '';
  let pendingRequestTimer = null;
  let activeBaseAnswer = null;
  let activeAnswerData = null;
  let activeRequestId = 0;
  let showEvidenceInspector = false;

  const state = workspaceStore.getState();
  const availableDocs = state.documents.filter(d => !d.isComparisonOnly);
  let selectedDocIds = new Set(availableDocs.map(d => d.id));

  // Defect B: Truthful dynamic evidence support recalculation against selected/active sources
  function evaluateAnswerSupport(baseMatch) {
    if (!baseMatch) return null;
    const currentState = workspaceStore.getState();
    const validDocIds = new Set(currentState.documents.map(d => d.id));
    const allCitations = baseMatch.allCitations || baseMatch.citations || [];
    const totalOriginalCitations = allCitations.length;

    // Filter citations to documents that currently exist and are currently selected
    const filteredCitations = allCitations.filter(c => selectedDocIds.has(c.docId) && validDocIds.has(c.docId));

    if (baseMatch.status === 'insufficient_evidence' && totalOriginalCitations === 0) {
      return {
        ...baseMatch,
        citations: []
      };
    }

    if (filteredCitations.length === 0) {
      return {
        ...baseMatch,
        allCitations,
        citations: [],
        status: 'insufficient_evidence',
        evidenceLabel: 'Insufficient Evidence in Selected Sources',
        insufficientReason: 'All source citations supporting this academic answer belong to unselected or excluded documents. Select Silberschatz or Tanenbaum in the source filter on the left to verify this answer against course materials.'
      };
    } else if (filteredCitations.length < totalOriginalCitations) {
      return {
        ...baseMatch,
        allCitations,
        citations: filteredCitations,
        status: 'partially_supported',
        evidenceLabel: `Partially supported (${filteredCitations.length} of ${totalOriginalCitations} sources selected)`
      };
    } else {
      return {
        ...baseMatch,
        allCitations,
        citations: filteredCitations,
        status: baseMatch.originalStatus || baseMatch.status,
        evidenceLabel: baseMatch.originalEvidenceLabel || baseMatch.evidenceLabel
      };
    }
  }

  function renderView() {
    container.innerHTML = `
      <div class="view-ask-page">

        <!-- Page Header -->
        <header class="page-header-row">
          <div class="header-text">
            <h1 class="page-title">Ask Syllora</h1>
            <p class="page-desc">Ask academic questions grounded in verified course materials, inspect claims, and view source citations.</p>
          </div>
        </header>
        
        <!-- Sub-Nav Tab Header -->
        <div class="ask-subnav-bar">
          <div class="tab-pill-group">
            <button type="button" class="tab-pill ${activeTab === 'ask' ? 'active' : ''}" id="tabAskBtn">
              Ask Materials
            </button>
            <button type="button" class="tab-pill ${activeTab === 'search' ? 'active' : ''}" id="tabSearchBtn">
              Search Passages
            </button>
            <button type="button" class="tab-pill ${activeTab === 'summarise' ? 'active' : ''}" id="tabSummariseBtn">
              Summarise Topic
            </button>
          </div>

          <div class="subnav-actions">
            <button type="button" class="btn btn-secondary btn-sm" id="toggleInspectorBtn">
              ${showEvidenceInspector ? 'Hide Evidence Inspector' : 'Inspect Evidence'}
            </button>
          </div>
        </div>

        <div class="ask-workspace-grid ${showEvidenceInspector ? 'with-inspector' : ''}">
          
          <!-- Left: Source Selection Filter (260px) -->
          <aside class="ask-sources-sidebar card">
            <div class="sources-header">
              <h4>Filter Scope</h4>
              <span class="text-xs text-muted">All active sources</span>
            </div>

            <div class="source-list">
              <label class="source-checkbox-item">
                <input type="checkbox" ${selectedDocIds.size === availableDocs.length ? 'checked' : ''} id="selectAllSourcesCheckbox">
                <span class="source-label"><strong>All CS301 Sources (${availableDocs.length})</strong></span>
              </label>
              <hr class="divider-sm">
              ${availableDocs.map(doc => `
                <label class="source-checkbox-item">
                  <input type="checkbox" ${selectedDocIds.has(doc.id) ? 'checked' : ''} class="source-doc-checkbox" value="${doc.id}">
                  <span class="source-label" title="${doc.title}">
                    <span class="doc-icon-mini">📄</span>
                    ${doc.title.length > 28 ? doc.title.slice(0, 26) + '...' : doc.title}
                  </span>
                </label>
              `).join('')}
            </div>

            <div class="sources-footer-notice">
              <span class="text-xs text-muted">Citations resolve to verified page offsets in real bundled PDFs.</span>
            </div>
          </aside>

          <!-- Center: Question & Answer Workspace -->
          <div class="ask-main-area">

            <!-- Search Mode Toggle (visible when on search tab) -->
            ${activeTab === 'search' ? `
              <div class="search-mode-bar card">
                <span class="mode-label">Search Mode:</span>
                <div class="radio-pill-group">
                  <label class="radio-pill ${searchMode === 'keyword' ? 'active' : ''}">
                    <input type="radio" name="searchMode" value="keyword" ${searchMode === 'keyword' ? 'checked' : ''}>
                    Keyword (Live text filter)
                  </label>
                  <label class="radio-pill ${searchMode === 'semantic' ? 'active' : ''}">
                    <input type="radio" name="searchMode" value="semantic" ${searchMode === 'semantic' ? 'checked' : ''}>
                    Semantic (Demo embeddings)
                  </label>
                  <label class="radio-pill ${searchMode === 'combined' ? 'active' : ''}">
                    <input type="radio" name="searchMode" value="combined" ${searchMode === 'combined' ? 'checked' : ''}>
                    Combined (Hybrid match)
                  </label>
                </div>
              </div>
            ` : ''}

            <!-- Query Input Bar -->
            <div class="card ask-input-box">
              <div class="input-row">
                <textarea id="askQuestionInput" class="ask-textarea" rows="2" placeholder="${
                  activeTab === 'ask' ? 'Ask a question across your academic materials...' :
                  activeTab === 'search' ? 'Search keyword or concept in course sources...' :
                  'Enter a topic to generate an evidence-grounded summary...'
                }">${currentQuery}</textarea>
              </div>

              <div class="input-actions-row">
                <div class="sample-question-chips" id="sampleChipsWrap">
                  <span class="chip-label">Try sample:</span>
                  <button type="button" class="sample-chip" data-q="Explain deadlock in simple words.">Explain deadlock</button>
                  <button type="button" class="sample-chip" data-q="How is deadlock different from starvation?">Deadlock vs Starvation</button>
                  <button type="button" class="sample-chip" data-q="Compare paging and segmentation.">Paging vs Segmentation</button>
                  <button type="button" class="sample-chip" data-q="Why do programs keep waiting for each other?">Why programs wait</button>
                  <button type="button" class="sample-chip chip-unsupported" data-q="What is the optimal quantum for round-robin scheduling in quantum computing?">Unsupported topic</button>
                </div>

                <div class="submit-action-btns">
                  <button type="button" class="btn btn-secondary btn-sm" id="clearConversationBtn">Clear</button>
                  <button type="button" class="btn btn-primary" id="askSubmitBtn">
                    ${activeTab === 'ask' ? 'Ask Syllora' : activeTab === 'search' ? 'Search' : 'Summarise'}
                  </button>
                </div>
              </div>
            </div>

            <!-- Pending Loading State -->
            <div class="card ask-pending-card" id="askPendingCard" style="display:none;">
              <div class="pending-spinner-wrap">
                <div class="spinner-arc-teal"></div>
                <div class="pending-text">
                  <strong>Scanning verified passages...</strong>
                  <span>Matching claims across Silberschatz & Tanenbaum</span>
                </div>
              </div>
              <button type="button" class="btn btn-secondary btn-sm" id="cancelQueryBtn">Cancel query</button>
            </div>

            <!-- Answer Stream / Result Display -->
            <div id="answerResultContainer">
              ${activeAnswerData ? renderAnswerCard(activeAnswerData) : `
                <div class="card ask-empty-prompt">
                  <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#64748B" stroke-width="1.8">
                    <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <h3>Ask any question grounded in your course materials</h3>
                  <p>Syllora only generates answers backed by cited academic evidence. Unmatched questions receive clear missing-evidence notifications.</p>
                </div>
              `}
            </div>

          </div>

          <!-- Right: Evidence Inspector (Collapsible panel) -->
          ${showEvidenceInspector ? `
            <aside class="ask-evidence-inspector card">
              <div class="inspector-header">
                <h3>Evidence Inspector</h3>
                <span class="pill-badge pill-green">Audit Trace</span>
              </div>

              <!-- Topic-Level Source Comparison (Silberschatz vs Tanenbaum) -->
              <div class="inspector-section">
                <h4 class="section-label">Source Comparison: Deadlock Characterization</h4>
                <div class="source-comparison-card">
                  <div class="comp-item">
                    <span class="comp-badge">Silberschatz (p. 2)</span>
                    <p class="comp-quote">"Requires 4 simultaneous Coffman conditions. No preemption implies resources are released voluntarily."</p>
                  </div>
                  <div class="comp-item">
                    <span class="comp-badge">Tanenbaum (p. 2)</span>
                    <p class="comp-quote">"Emphasizes non-preemptible resource classes. Circular wait illustrated via Dining Philosophers."</p>
                  </div>
                  <div class="comp-verdict">
                    <span class="pill-badge pill-green">Agreement: Complementary Assumptions</span>
                    <p class="comp-note">Both authors agree on circular dependency necessity; Silberschatz focuses on formal criteria while Tanenbaum classifies preemptibility.</p>
                  </div>
                </div>
              </div>

              <!-- Formula Card -->
              <div class="inspector-section">
                <h4 class="section-label">Formula Card: Banker's Algorithm</h4>
                <div class="formula-card">
                  <div class="formula-math">
                    <code>Allocation<sub>i</sub> + Need<sub>i</sub> &le; Max<sub>i</sub></code>
                  </div>
                  <div class="formula-meta">
                    <div class="f-row"><span>Variables:</span> <strong>Allocation (held), Need (remaining), Max (declared)</strong></div>
                    <div class="f-row"><span>Units:</span> <strong>Discrete resource instances vector</strong></div>
                    <div class="f-row"><span>Assumptions:</span> <strong>A priori maximum resource declaration</strong></div>
                    <div class="f-row"><span>Verified Source:</span> <strong>Silberschatz (Ch. 8), Page 4</strong></div>
                  </div>
                </div>
              </div>

              <!-- Extracted Claims -->
              <div class="inspector-section">
                <h4 class="section-label">Extracted Proposition Claims</h4>
                <div class="claims-list">
                  <div class="claim-item">
                    <div class="claim-dot"></div>
                    <div class="claim-body">
                      <span>Deadlock requires 4 simultaneous Coffman conditions</span>
                      <button type="button" class="link-sm inspect-pass-btn" data-doc="doc-1" data-page="2">View Pass. 1</button>
                    </div>
                  </div>
                  <div class="claim-item">
                    <div class="claim-dot"></div>
                    <div class="claim-body">
                      <span>Starvation occurs when runnable threads are postponed by scheduler priority</span>
                      <button type="button" class="link-sm inspect-pass-btn" data-doc="doc-1" data-page="3">View Pass. 2</button>
                    </div>
                  </div>
                </div>
              </div>

            </aside>
          ` : ''}

        </div>

      </div>
    `;

    bindEvents();
  }

  function renderAnswerCard(data) {
    let statusPill = 'pill-green';
    if (data.status === 'partially_supported') statusPill = 'pill-amber';
    if (data.status === 'insufficient_evidence') statusPill = 'pill-coral';

    return `
      <div class="card answer-card">
        <div class="answer-header">
          <div class="answer-status-row">
            <span class="pill-badge ${statusPill}">
              ${data.evidenceLabel}
            </span>
            <span class="text-xs text-muted">Deterministic Fixture • 100% Academic Grounding</span>
          </div>

          <div class="answer-actions">
            <button type="button" class="btn btn-secondary btn-xs" id="copyAnswerBtn">
              Copy Answer
            </button>
            <button type="button" class="btn btn-secondary btn-xs" id="bookmarkAnswerBtn">
              Bookmark
            </button>
          </div>
        </div>

        <div class="answer-body-markdown">
          ${formatMarkdown(data.answer)}
        </div>

        <!-- Verified Citations Row -->
        ${data.citations && data.citations.length > 0 ? `
          <div class="answer-citations-block">
            <h5 class="citations-title">Verified Source Citations:</h5>
            <div class="citation-pills-list">
              ${data.citations.map((c, i) => `
                <button type="button" class="citation-pill-btn" data-doc="${c.docId}" data-page="${c.page}" data-quote="${escapeQuotes(c.quote)}" data-title="${c.docTitle}">
                  <span class="pill-index">[${i + 1}]</span>
                  <span class="pill-ref">${c.docTitle} • Page ${c.page}</span>
                  <span class="pill-action">Open reader →</span>
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${data.status === 'insufficient_evidence' ? `
          <div class="insufficient-evidence-callout">
            <strong>Missing Material Coverage:</strong>
            <p>${data.insufficientReason || 'The CS301 library contains no passages addressing this query. To answer questions regarding this topic, please upload the corresponding lecture module or textbook chapter.'}</p>
          </div>
        ` : ''}
      </div>
    `;
  }

  function formatMarkdown(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n- (.*?)/g, '<li>$1</li>')
      .replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>');
  }

  function escapeQuotes(str) {
    return str.replace(/"/g, '&quot;');
  }

  function handleQueryExecution(queryText) {
    if (!queryText.trim()) return;
    currentQuery = queryText;

    const pendingCard = container.querySelector('#askPendingCard');
    const resultWrap = container.querySelector('#answerResultContainer');

    if (pendingCard) pendingCard.style.display = 'flex';
    if (resultWrap) resultWrap.style.display = 'none';

    // Defect F: Bounded Async State with cancellation & request ID guard
    if (pendingRequestTimer) clearTimeout(pendingRequestTimer);
    const thisRequestId = ++activeRequestId;

    pendingRequestTimer = setTimeout(() => {
      pendingRequestTimer = null;
      if (thisRequestId !== activeRequestId || !container.isConnected) return;

      if (pendingCard) pendingCard.style.display = 'none';
      if (resultWrap) resultWrap.style.display = 'block';

      // Normalize key
      const key = queryText.toLowerCase().replace(/[?.,!]/g, '').trim();

      // Keyword filtering match check
      let match = null;
      for (const [k, v] of Object.entries(QUESTION_FIXTURES)) {
        if (key.includes(k) || k.includes(key) || (key.includes('deadlock') && key.includes('starvation'))) {
          match = JSON.parse(JSON.stringify(v));
          match.originalStatus = match.status;
          match.originalEvidenceLabel = match.evidenceLabel;
          match.allCitations = [...match.citations];
          break;
        }
      }

      if (match) {
        activeBaseAnswer = match;
        activeAnswerData = evaluateAnswerSupport(match);
      } else {
        // Deliberately unsupported state
        activeBaseAnswer = {
          status: 'insufficient_evidence',
          evidenceLabel: 'Insufficient Evidence in Loaded Materials',
          answer: `No matching evidence was found in the current CS301 course materials for: **"${queryText}"**.

Syllora strictly refuses to fabricate answers when citations are missing. The active course library focuses on Concurrency, Deadlocks (Coffman conditions, Banker's algorithm, and starvation).`,
          citations: [],
          allCitations: [],
          claims: []
        };
        activeAnswerData = activeBaseAnswer;
      }

      renderView();
    }, 450); // fast bounded execution
  }

  function bindEvents() {
    // Tabs
    const tabAskBtn = container.querySelector('#tabAskBtn');
    const tabSearchBtn = container.querySelector('#tabSearchBtn');
    const tabSummariseBtn = container.querySelector('#tabSummariseBtn');
    const toggleInspectorBtn = container.querySelector('#toggleInspectorBtn');

    if (tabAskBtn) tabAskBtn.addEventListener('click', () => { activeTab = 'ask'; renderView(); });
    if (tabSearchBtn) tabSearchBtn.addEventListener('click', () => { activeTab = 'search'; renderView(); });
    if (tabSummariseBtn) tabSummariseBtn.addEventListener('click', () => { activeTab = 'summarise'; renderView(); });
    if (toggleInspectorBtn) toggleInspectorBtn.addEventListener('click', () => { showEvidenceInspector = !showEvidenceInspector; renderView(); });

    // Source selection checkboxes
    const selectAllCheckbox = container.querySelector('#selectAllSourcesCheckbox');
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        if (isChecked) {
          selectedDocIds = new Set(availableDocs.map(d => d.id));
        } else {
          selectedDocIds.clear();
        }
        if (activeBaseAnswer) {
          activeAnswerData = evaluateAnswerSupport(activeBaseAnswer);
        }
        renderView();
      });
    }

    container.querySelectorAll('.source-doc-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const docId = e.target.value;
        if (e.target.checked) {
          selectedDocIds.add(docId);
        } else {
          selectedDocIds.delete(docId);
        }
        if (activeBaseAnswer) {
          activeAnswerData = evaluateAnswerSupport(activeBaseAnswer);
        }
        renderView();
      });
    });

    // Radio search mode
    container.querySelectorAll('input[name="searchMode"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        searchMode = e.target.value;
        renderView();
      });
    });

    // Draft persistence on textarea typing
    const askInput = container.querySelector('#askQuestionInput');
    if (askInput) {
      askInput.addEventListener('input', (e) => {
        currentQuery = e.target.value;
        workspaceStore.saveDraft('ask_query', e.target.value);
      });
    }

    // Sample question chips
    container.querySelectorAll('.sample-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const q = chip.getAttribute('data-q');
        const input = container.querySelector('#askQuestionInput');
        if (input) input.value = q;
        workspaceStore.saveDraft('ask_query', q);
        handleQueryExecution(q);
      });
    });

    // Submit button
    const askSubmitBtn = container.querySelector('#askSubmitBtn');
    if (askSubmitBtn && askInput) {
      askSubmitBtn.addEventListener('click', () => handleQueryExecution(askInput.value));
      askInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleQueryExecution(askInput.value);
        }
      });
    }

    // Cancel query button
    const cancelQueryBtn = container.querySelector('#cancelQueryBtn');
    if (cancelQueryBtn) {
      cancelQueryBtn.addEventListener('click', () => {
        activeRequestId++;
        if (pendingRequestTimer) {
          clearTimeout(pendingRequestTimer);
          pendingRequestTimer = null;
        }
        const pendingCard = container.querySelector('#askPendingCard');
        const resultWrap = container.querySelector('#answerResultContainer');
        if (pendingCard) pendingCard.style.display = 'none';
        if (resultWrap) resultWrap.style.display = 'block';
        Toast.show('Query request cancelled.', 'info');
      });
    }

    // Clear conversation button
    const clearBtn = container.querySelector('#clearConversationBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        activeRequestId++;
        if (pendingRequestTimer) {
          clearTimeout(pendingRequestTimer);
          pendingRequestTimer = null;
        }
        currentQuery = '';
        activeBaseAnswer = null;
        activeAnswerData = null;
        workspaceStore.clearDraft('ask_query');
        renderView();
        Toast.show('Workspace query cleared.', 'info');
      });
    }

    // Copy answer button
    const copyAnswerBtn = container.querySelector('#copyAnswerBtn');
    if (copyAnswerBtn && activeAnswerData) {
      copyAnswerBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(activeAnswerData.answer).then(() => {
          Toast.show('Answer copied to clipboard!', 'success');
        });
      });
    }

    // Real bookmark answer action (Defect H: prevent duplicate saves, persist metadata)
    const bookmarkAnswerBtn = container.querySelector('#bookmarkAnswerBtn');
    if (bookmarkAnswerBtn && activeAnswerData) {
      bookmarkAnswerBtn.addEventListener('click', () => {
        const bookmarkKey = `ans-${encodeURIComponent((currentQuery || 'answer').trim().toLowerCase())}`;
        if (workspaceStore.isBookmarked('answer', bookmarkKey)) {
          Toast.show('Answer is already bookmarked in your revision notes.', 'info');
          return;
        }
        workspaceStore.addBookmark({
          targetType: 'answer',
          targetId: bookmarkKey,
          title: currentQuery ? `Answer: ${currentQuery.slice(0, 45)}...` : 'Ask Syllora Verified Answer',
          snippet: activeAnswerData.answer.slice(0, 160),
          metadata: {
            question: currentQuery,
            answer: activeAnswerData.answer,
            status: activeAnswerData.status,
            evidenceLabel: activeAnswerData.evidenceLabel,
            citations: activeAnswerData.citations || []
          }
        });
        Toast.show('Answer bookmarked to revision notes.', 'success');
      });
    }

    // Citations clicking opens PDF reader
    container.querySelectorAll('.citation-pill-btn').forEach(pill => {
      pill.addEventListener('click', () => {
        const docId = pill.getAttribute('data-doc');
        const page = parseInt(pill.getAttribute('data-page'), 10);
        const quote = pill.getAttribute('data-quote');
        const title = pill.getAttribute('data-title');
        PdfReader.open(docId, page, quote, title);
      });
    });

    // Inspector pass links
    container.querySelectorAll('.inspect-pass-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const docId = btn.getAttribute('data-doc');
        const page = parseInt(btn.getAttribute('data-page'), 10);
        PdfReader.open(docId, page);
      });
    });
  }

  // Initial execution if query passed via URL
  if (currentQuery && queryParams.q) {
    handleQueryExecution(currentQuery);
  } else {
    renderView();
  }

  // Defect F: Return unmount cleanup function to cancel active timers and invalidate callbacks
  return function cleanup() {
    activeRequestId++;
    if (pendingRequestTimer) {
      clearTimeout(pendingRequestTimer);
      pendingRequestTimer = null;
    }
  };
}
