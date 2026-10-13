/**
 * ============================================================================
 * VIEW: MISCONCEPTION NOTEBOOK
 * ============================================================================
 * Searchable, filterable issue cards capturing student learning gaps,
 * previous attempts, corrective citations, and "Practise again" integrations.
 */

import { workspaceStore } from '../state.js';
import { router } from '../router.js';
import { PdfReader } from '../components/pdfViewer.js';
import { Modal, Toast } from '../components/modal.js';
import { sylloraApi } from '../services/aiApi.js';

export function renderMisconceptions(container) {
  let searchQuery = '';
  let statusFilter = 'all'; // 'all' | 'Open' | 'Review needed' | 'Improving' | 'Student-marked complete'

  function getFilteredIssues() {
    const state = workspaceStore.getState();
    let issues = [...(state.misconceptions || [])];

    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        issues = issues.filter(i => (i.topicTitle || '').toLowerCase().includes(q) || (i.observedIssue || '').toLowerCase().includes(q));
      }
    }

    if (statusFilter !== 'all') {
      issues = issues.filter(i => i.status === statusFilter);
    }

    return issues;
  }

  function renderCardsHTML(issues) {
    const totalCount = (workspaceStore.getState().misconceptions || []).length;
    if (totalCount === 0) {
      return `
        <div class="card empty-state-box" style="padding: 48px 24px; text-align: center;">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#64748B" stroke-width="1.5" style="margin: 0 auto 16px;">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <h3>No misconceptions recorded</h3>
          <p style="color: var(--color-text-muted); margin-bottom: 20px;">When you check your understanding on syllabus topics, any identified reasoning gaps will automatically appear here with corrective source citations.</p>
          <a href="#/app/understanding" class="btn btn-primary">Check Understanding</a>
        </div>
      `;
    }

    if (issues.length === 0) {
      return `
        <div class="card empty-state-box">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#64748B" stroke-width="1.5">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <h3>No misconceptions match filter criteria</h3>
          <p>All matching concepts are currently solid or filtered out.</p>
        </div>
      `;
    }

    return `
      <div class="misconception-cards-grid">
        ${issues.map(item => {
          let badgeClass = 'pill-coral';
          if (item.status === 'Improving') badgeClass = 'pill-amber';
          if (item.status === 'Student-marked complete') badgeClass = 'pill-green';

          return `
            <div class="card misconception-card" data-misc-id="${item.id}">
              <div class="misc-card-header">
                <div class="misc-topic-info">
                  <span class="topic-tag">${item.topicTitle}</span>
                  <h3 class="misc-issue-title">${item.observedIssue}</h3>
                </div>
                <div class="misc-status-wrap">
                  <span class="pill-badge ${badgeClass}">${item.status}</span>
                </div>
              </div>

              <!-- Original Student Explanation Snippet -->
              <div class="misc-section-box">
                <span class="misc-section-label">Original Explanation:</span>
                <p class="misc-orig-quote">"${item.originalExplanation}"</p>
              </div>

              <!-- Corrective Feedback & Academic Citation -->
              <div class="misc-section-box corrective">
                <span class="misc-section-label">Corrective Feedback:</span>
                <p class="misc-feedback-text">${item.feedback}</p>
                ${(item.sourceCitations || []).map(c => `
                  <div class="misc-citation-pill">
                    <span class="cite-doc">${c.documentTitle} • p. ${c.pageNumber}</span>
                    <button type="button" class="btn btn-link btn-xs open-misc-citation-btn" data-doc="doc-1" data-page="${c.pageNumber}" data-quote="${c.quote.replace(/"/g, '&quot;')}">
                      Open source passage →
                    </button>
                  </div>
                `).join('')}
              </div>

              <!-- Footer Controls -->
              <div class="misc-card-footer">
                <div class="attempts-meta">
                  <span>Attempts recorded: <strong>${item.attemptsCount}</strong></span>
                  <span class="text-muted">• ${item.lastAttemptDate}</span>
                </div>

                <div class="misc-card-actions">
                  <button type="button" class="btn btn-secondary btn-sm toggle-complete-btn" data-misc-id="${item.id}">
                    ${item.status === 'Student-marked complete' ? 'Reopen' : 'Mark Complete'}
                  </button>
                  <button type="button" class="btn btn-primary btn-sm practice-again-btn" data-topic-id="${item.topicId}">
                    Practise again
                  </button>
                  <button type="button" class="btn-action-icon text-danger delete-misc-btn" data-misc-id="${item.id}" title="Delete issue" aria-label="Delete issue">
                    🗑
                  </button>
                </div>
              </div>

            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function updateMount() {
    const mount = container.querySelector('#misconceptionsResultsMount');
    if (!mount) return;
    const issues = getFilteredIssues();
    mount.innerHTML = renderCardsHTML(issues);
    bindCardEvents();
  }

  function renderView() {
    const state = workspaceStore.getState();
    const issues = getFilteredIssues();

    container.innerHTML = `
      <div class="view-misconceptions-page">
        
        <header class="page-header-row">
          <div class="header-text">
            <h1 class="page-title">Misconception Notebook</h1>
            <p class="page-desc">Track observed reasoning gaps, corrective source citations, and re-attempt history.</p>
          </div>

          <div class="header-buttons">
            <button type="button" class="btn btn-primary" id="notebookPracticeAllBtn">
              Practice Active Issues →
            </button>
          </div>
        </header>

        <!-- Search and Filter Bar -->
        <div class="card toolbar-bar">
          <div class="toolbar-search">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="8.5" cy="8.5" r="5.5"/><line x1="13" y1="13" x2="18" y2="18"/>
            </svg>
            <input type="text" id="miscSearchInput" value="${searchQuery}" placeholder="Search observed issues or topic..." class="filter-input" autocomplete="off">
          </div>

          <div class="toolbar-controls">
            <div class="control-group">
              <label class="control-label" for="miscStatusSelect">Status:</label>
              <select id="miscStatusSelect" class="filter-select">
                <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>All Statuses (${state.misconceptions.length})</option>
                <option value="Open" ${statusFilter === 'Open' ? 'selected' : ''}>Open</option>
                <option value="Review needed" ${statusFilter === 'Review needed' ? 'selected' : ''}>Review needed</option>
                <option value="Improving" ${statusFilter === 'Improving' ? 'selected' : ''}>Improving</option>
                <option value="Student-marked complete" ${statusFilter === 'Student-marked complete' ? 'selected' : ''}>Completed</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Issue Cards List Mount -->
        <div class="misconceptions-list-container" id="misconceptionsResultsMount">
          ${renderCardsHTML(issues)}
        </div>

      </div>
    `;

    bindToolbarEvents();
    bindCardEvents();
  }

  function bindToolbarEvents() {
    const searchInput = container.querySelector('#miscSearchInput');
    const statusSelect = container.querySelector('#miscStatusSelect');
    const practiceAllBtn = container.querySelector('#notebookPracticeAllBtn');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value; // Preserve raw value and spaces!
        updateMount();
      });
    }

    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        statusFilter = e.target.value;
        updateMount();
      });
    }

    if (practiceAllBtn) {
      practiceAllBtn.addEventListener('click', () => {
        router.navigate('/app/understanding', { topic: 'top-3' });
      });
    }
  }

  function bindCardEvents() {
    // Open citation reader
    container.querySelectorAll('.open-misc-citation-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const docId = btn.getAttribute('data-doc');
        const page = parseInt(btn.getAttribute('data-page'), 10);
        const quote = btn.getAttribute('data-quote');
        PdfReader.open(docId, page, quote, '8.3 Deadlock vs Starvation');
      });
    });

    // Practise again
    container.querySelectorAll('.practice-again-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const topicId = btn.getAttribute('data-topic-id');
        router.navigate('/app/understanding', { topic: topicId });
      });
    });

    // Toggle complete
    container.querySelectorAll('.toggle-complete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const miscId = btn.getAttribute('data-misc-id');
        const item = workspaceStore.getState().misconceptions.find(m => m.id === miscId);
        if (!item) return;

        const nextStatus = item.status === 'Student-marked complete' ? 'Open' : 'Student-marked complete';
        workspaceStore.updateMisconceptionStatus(miscId, nextStatus);
        sylloraApi.updateMisconception(miscId, { status: nextStatus }).catch(e => console.debug('[Misconception] Backend sync deferred:', e));
        Toast.show(nextStatus === 'Student-marked complete' ? 'Issue marked complete.' : 'Issue reopened for review.', 'info');
        updateMount();
      });
    });

    // Delete issue
    container.querySelectorAll('.delete-misc-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const miscId = btn.getAttribute('data-misc-id');
        const item = workspaceStore.getState().misconceptions.find(m => m.id === miscId);
        if (!item) return;

        Modal.open(
          'Delete Misconception Entry',
          `<p>Are you sure you want to delete <strong>${item.observedIssue}</strong>?</p>`,
          () => {
            workspaceStore.deleteMisconception(miscId);
            Toast.show('Misconception deleted.', 'info');
            updateMount();
          },
          'Delete',
          'danger'
        );
      });
    });
  }

  renderView();
}
