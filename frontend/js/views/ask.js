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
import { sylloraApi } from '../services/aiApi.js';

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
  // Only PDFs successfully indexed by the local AI backend are sent to RAG.
  const availableDocs = state.documents.filter(d => d.backendDocument && !d.isComparisonOnly);
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
                <span class="source-label"><strong>AI-indexed sources (${availableDocs.length})</strong></span>
              </label>
              <hr class="divider-sm">
              ${availableDocs.length ? availableDocs.map(doc => `
                <label class="source-checkbox-item">
                  <input type="checkbox" ${selectedDocIds.has(doc.id) ? 'checked' : ''} class="source-doc-checkbox" value="${doc.id}">
                  <span class="source-label" title="${doc.title}">
                    <span class="doc-icon-mini">📄</span>
                    ${doc.title.length > 28 ? doc.title.slice(0, 26) + '...' : doc.title}
                  </span>
                </label>
              `).join('') : '<p class="text-xs text-muted">Upload and index a PDF in Study Materials to ask questions.</p>'}
            </div>

            <div class="sources-footer-notice">
              <span class="text-xs text-muted">Only PDFs indexed by your local Syllora AI backend are used for answers.</span>
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
                    Keyword (Indexed passages)
                  </label>
                  <label class="radio-pill ${searchMode === 'semantic' ? 'active' : ''}">
                    <input type="radio" name="searchMode" value="semantic" ${searchMode === 'semantic' ? 'checked' : ''}>
                    Semantic (AI embeddings)
                  </label>
                  <label class="radio-pill ${searchMode === 'combined' ? 'active' : ''}">
                    <input type="radio" name="searchMode" value="combined" ${searchMode === 'combined' ? 'checked' : ''}>
                    Combined (Hybrid search)
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
                  <span>Searching indexed study materials for evidence passages</span>
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
                <span class="pill-badge ${activeAnswerData && activeAnswerData.citations && activeAnswerData.citations.length > 0 ? 'pill-green' : 'pill-gray'}">
                  ${activeAnswerData && activeAnswerData.citations ? activeAnswerData.citations.length + ' Citations' : 'Standby'}
                </span>
              </div>

              ${activeAnswerData && activeAnswerData.citations && activeAnswerData.citations.length > 0 ? `
                <div class="inspector-section">
                  <h4 class="section-label">Retrieved Evidence Passages</h4>
                  <div class="claims-list">
                    ${activeAnswerData.citations.map(c => `
                      <div class="claim-item">
                        <div class="claim-dot"></div>
                        <div class="claim-body">
                          <span><strong>${escapeHtml(c.docTitle)}</strong> (p. ${c.page}): "${escapeHtml(c.quote)}"</span>
                          <button type="button" class="link-sm inspect-pass-btn" data-doc="${escapeQuotes(c.docId)}" data-page="${c.page}">View in PDF</button>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : `
                <div class="inspector-section">
                  <p style="padding: 16px; color: #64748B; font-size: 13px;">No active query citations yet. Ask a question or search passages to inspect verified source excerpts.</p>
                </div>
              `}

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
    if (data.status === 'insufficient_evidence' || data.status === 'error') statusPill = 'pill-coral';

    return `
      <div class="card answer-card">
        <div class="answer-header">
          <div class="answer-status-row">
            <span class="pill-badge ${statusPill}">
              ${data.evidenceLabel}
            </span>
            <span class="text-xs text-muted">Live response from local Syllora AI</span>
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
  const escapeHtml = (value) =>
    String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  function inlineMarkdown(value) {
    let result = escapeHtml(value);
    const codeChunks = [];

    // Preserve inline code while formatting surrounding Markdown.
    result = result.replace(/`([^`]+)`/g, (_, code) => {
      const token = `@@CODE_${codeChunks.length}@@`;
      codeChunks.push(`<code>${code}</code>`);
      return token;
    });

    result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    result = result.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
    result = result.replace(/~~(.+?)~~/g, "<del>$1</del>");

    return result.replace(
      /@@CODE_(\d+)@@/g,
      (_, index) => codeChunks[Number(index)] || ""
    );
  }

  const lines = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n");

  const output = [];

  const isTableSeparator = (line) =>
    /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

  const tableCells = (line) =>
    line.trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());

  const isList = (line) =>
    /^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line);

  const isBlockStart = (index) => {
    const line = lines[index] || "";

    return (
      /^\s{0,3}#{1,6}\s+/.test(line) ||
      /^\s*```/.test(line) ||
      /^\s*>/.test(line) ||
      /^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line) ||
      isList(line) ||
      (
        index + 1 < lines.length &&
        line.includes("|") &&
        isTableSeparator(lines[index + 1])
      )
    );
  };

  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code blocks.
    if (/^\s*```/.test(line)) {
      i++;
      const codeLines = [];

      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }

      if (i < lines.length) i++;

      output.push(
        `<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`
      );
      continue;
    }

    // Markdown tables.
    if (
      i + 1 < lines.length &&
      line.includes("|") &&
      isTableSeparator(lines[i + 1])
    ) {
      const headers = tableCells(line);
      i += 2;

      const rows = [];

      while (
        i < lines.length &&
        lines[i].trim() &&
        lines[i].includes("|")
      ) {
        rows.push(tableCells(lines[i]));
        i++;
      }

      const headerHtml = headers.map(
        (cell) =>
          `<th style="border:1px solid #dbe3ea;padding:8px;text-align:left;">${inlineMarkdown(cell)}</th>`
      ).join("");

      const bodyHtml = rows.map((row) => {
        const cells = headers.map((_, index) => {
          const cell = row[index] || "";
          return `<td style="border:1px solid #dbe3ea;padding:8px;">${inlineMarkdown(cell)}</td>`;
        }).join("");

        return `<tr>${cells}</tr>`;
      }).join("");

      output.push(
        `<div style="overflow-x:auto;margin:12px 0;">` +
        `<table style="border-collapse:collapse;width:100%;">` +
        `<thead><tr>${headerHtml}</tr></thead>` +
        `<tbody>${bodyHtml}</tbody></table></div>`
      );
      continue;
    }

    // Headings.
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);

    if (heading) {
      const level = heading[1].length;
      output.push(
        `<h${level}>${inlineMarkdown(heading[2])}</h${level}>`
      );
      i++;
      continue;
    }

    // Horizontal rule.
    if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
      output.push("<hr>");
      i++;
      continue;
    }

    // Blockquotes.
    if (/^\s*>/.test(line)) {
      const quoteLines = [];

      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }

      output.push(
        `<blockquote>${inlineMarkdown(quoteLines.join(" "))}</blockquote>`
      );
      continue;
    }

    // Ordered and unordered lists.
    if (isList(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const tag = ordered ? "ol" : "ul";
      const items = [];

      while (i < lines.length && isList(lines[i])) {
        const currentOrdered = /^\s*\d+[.)]\s+/.test(lines[i]);

        if (currentOrdered !== ordered) break;

        const item = lines[i].replace(
          ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/,
          ""
        );

        items.push(`<li>${inlineMarkdown(item)}</li>`);
        i++;
      }

      output.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    // Ordinary paragraphs.
    const paragraph = [];

    while (
      i < lines.length &&
      lines[i].trim() &&
      !isBlockStart(i)
    ) {
      paragraph.push(lines[i].trim());
      i++;
    }

    if (paragraph.length) {
      output.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    } else {
      // Safety fallback: always advance to prevent an infinite loop.
      output.push(`<p>${inlineMarkdown(lines[i])}</p>`);
      i++;
    }
  }

  return output.join("\n");
}

  function escapeQuotes(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  async function handleQueryExecution(queryText) {
    const questionText = String(queryText || '').trim();
    if (!questionText) return;
    currentQuery = questionText;
    workspaceStore.saveDraft('ask_query', questionText);

    const pendingCard = container.querySelector('#askPendingCard');
    const resultWrap = container.querySelector('#answerResultContainer');
    if (pendingCard) pendingCard.style.display = 'flex';
    if (resultWrap) resultWrap.style.display = 'none';

    if (pendingRequestTimer) clearTimeout(pendingRequestTimer);
    pendingRequestTimer = null;
    const thisRequestId = ++activeRequestId;
    const documentIds = availableDocs
      .filter(doc => selectedDocIds.has(doc.id))
      .map(doc => doc.id);

    try {
      if (!documentIds.length) {
        throw new Error('No AI-indexed PDFs are selected. Open Study Materials and upload a PDF first.');
      }

      let apiResult;
      if (activeTab === 'search') {
        const searchResult = await sylloraApi.search(questionText, searchMode, documentIds, 5);
        const rows = Array.isArray(searchResult.results) ? searchResult.results : [];
        apiResult = {
          status: rows.length ? 'answered' : 'insufficient_evidence',
          question: questionText,
          answer: rows.length
            ? rows.map((item, index) => `${index + 1}. **${item.title || item.filename || 'Study material'} — Page ${item.page_number || '?'}**\n${item.excerpt || ''}`).join('\n\n')
            : 'No matching passages were found in the selected, AI-indexed study materials.',
          citations: rows.map(item => ({
            document_id: item.document_id,
            filename: item.filename,
            title: item.title,
            page_number: item.page_number,
            excerpt: item.excerpt
          })),
          model: null
        };
      } else {
        const questionForModel = activeTab === 'summarise'
          ? `Summarise this topic using only the uploaded study materials: ${questionText}`
          : questionText;
        apiResult = await sylloraApi.ask(questionForModel, documentIds, 5);
      }

      if (thisRequestId !== activeRequestId || !container.isConnected) return;

      const citations = (Array.isArray(apiResult.citations) ? apiResult.citations : []).map(c => ({
        docId: c.document_id,
        docTitle: c.title || c.filename || 'Study material',
        page: Number(c.page_number) || 1,
        quote: c.excerpt || ''
      }));
      const status = apiResult.status || (citations.length ? 'answered' : 'insufficient_evidence');
      const evidenceLabels = {
        answered: 'Supported by uploaded materials',
        partially_supported: 'Partially supported by uploaded materials',
        insufficient_evidence: 'Insufficient evidence in uploaded materials',
        error: 'AI request failed'
      };

      activeBaseAnswer = {
        status,
        evidenceLabel: evidenceLabels[status] || 'AI-generated result',
        answer: apiResult.answer || (status === 'insufficient_evidence'
          ? 'The uploaded materials do not contain enough evidence to answer this reliably.'
          : 'No answer was returned by the AI backend.'),
        citations,
        allCitations: citations,
        claims: [],
        insufficientReason: status === 'insufficient_evidence' ? 'Upload the relevant lecture notes or textbook section, then ask again.' : '',
        model: apiResult.model || null
      };
      activeAnswerData = activeBaseAnswer;
      renderView();
    } catch (err) {
      if (thisRequestId !== activeRequestId || !container.isConnected) return;
      activeBaseAnswer = {
        status: 'error',
        evidenceLabel: 'AI request failed',
        answer: `Syllora could not complete this request. ${err && err.message ? err.message : 'Check that the local AI backend is running.'}`,
        citations: [],
        allCitations: [],
        claims: []
      };
      activeAnswerData = activeBaseAnswer;
      renderView();
    }
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
