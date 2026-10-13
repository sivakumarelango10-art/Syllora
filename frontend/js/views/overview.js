/**
 * ============================================================================
 * VIEW: OVERVIEW DASHBOARD
 * ============================================================================
 * Rebuilt to match "Syllora Academic Study Dashboard(1).png":
 * - Dynamic time-based greeting & active course context
 * - 4 Summary Metric Cards with circular tinted icons
 * - Row 1: "Your syllabus, at a glance" table (2:1 split) beside
 *          pale teal "Check your understanding" card with open-book illustration
 * - Row 2: "Recent study materials" with PDF badges beside "Continue learning"
 * - Row 3: Full-width "Ask your materials" composer spanning 100% width
 */

import { workspaceStore } from '../state.js';
import { sessionAdapter } from '../session.js';
import { router } from '../router.js';
import { PdfReader } from '../components/pdfViewer.js';
import { Toast } from '../components/modal.js';
import { openUploadModal } from './materials.js';
import { sylloraApi } from '../services/aiApi.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderOverview(container) {
  const state = workspaceStore.getState();
  const stats = workspaceStore.getStats();
  const user = sessionAdapter.getUser() || { name: 'Student' };
  const firstName = (user.name || 'Student').split(' ')[0];

  // Dynamic time-of-day greeting
  const now = new Date();
  const hour = now.getHours();
  let timeGreeting = 'Good morning';
  if (hour >= 12 && hour < 17) {
    timeGreeting = 'Good afternoon';
  } else if (hour >= 17) {
    timeGreeting = 'Good evening';
  }

  // Top/Relevant Topics for the Syllabus at a glance preview
  const previewTopics = (state.topics || []).slice(0, 4);

  // Recent study materials (up to 3)
  const recentDocs = (state.documents || []).filter(d => !d.isComparisonOnly).slice(0, 3);

  // Active misconception for Continue Learning
  const activeMisconception = (state.misconceptions || []).find(m => m.status !== 'Student-marked complete');
  let continueSourceDocName = '';
  if (activeMisconception && activeMisconception.sourceCitations && activeMisconception.sourceCitations.length > 0) {
    continueSourceDocName = activeMisconception.sourceCitations[0].documentTitle || '';
  }

  const courseDisplayName = state.course ? state.course.name : 'No course selected';

  container.innerHTML = `
    <div class="view-overview-page">
      
      <!-- Top Greeting Row -->
      <section class="overview-greeting-banner">
        <div class="greeting-text-col">
          <h1 class="overview-greeting-title">${timeGreeting}, ${escapeHtml(firstName)}</h1>
          <p class="overview-greeting-subtitle">Find what you need. Understand what you learn.</p>
        </div>

        <div class="overview-header-actions">
          <button type="button" class="btn btn-primary overview-btn-upload" id="overviewUploadBtn">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M10 3v10m-4-4l4-4 4 4M3 15h14"/>
            </svg>
            Upload materials
          </button>

          <button type="button" class="course-badge-btn" id="overviewCourseBtn" aria-label="Course selection: ${escapeHtml(courseDisplayName)}">
            <span class="course-badge-icon">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
            </span>
            <span>${escapeHtml(courseDisplayName)}</span>
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M6 8l4 4 4-4"/>
            </svg>
          </button>
        </div>
      </section>

      <!-- 4 Summary Metric Cards Row -->
      <section class="overview-summary-grid">
        
        <!-- Metric 1: Study materials -->
        <div class="summary-stat-card" id="cardStudyMaterials" role="button" tabindex="0">
          <div class="stat-card-icon-wrap teal">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          </div>
          <div class="stat-card-content">
            <span class="stat-card-label">Study materials</span>
            <span class="stat-card-number">${stats.totalDocs}</span>
            <span class="stat-card-sub">Documents in your library</span>
          </div>
        </div>

        <!-- Metric 2: Topics with evidence -->
        <div class="summary-stat-card" id="cardTopicsEvidence" role="button" tabindex="0">
          <div class="stat-card-icon-wrap teal">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <line x1="18" y1="20" x2="18" y2="10"/>
              <line x1="12" y1="20" x2="12" y2="4"/>
              <line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
          </div>
          <div class="stat-card-content">
            <span class="stat-card-label">Topics with evidence</span>
            <span class="stat-card-number">${stats.topicsWithEvidenceCount} / ${stats.totalTopics}</span>
            <span class="stat-card-sub">Topics found in your materials</span>
          </div>
        </div>

        <!-- Metric 3: Needs practice -->
        <div class="summary-stat-card" id="cardNeedsPractice" role="button" tabindex="0">
          <div class="stat-card-icon-wrap amber">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
              <path d="M6 12v5c3 3 9 3 12 0v-5"/>
            </svg>
          </div>
          <div class="stat-card-content">
            <span class="stat-card-label">Needs practice</span>
            <span class="stat-card-number">${stats.needsPracticeCount}</span>
            <span class="stat-card-sub">Topics to focus on</span>
          </div>
        </div>

        <!-- Metric 4: Open misconceptions -->
        <div class="summary-stat-card" id="cardOpenMisconceptions" role="button" tabindex="0">
          <div class="stat-card-icon-wrap coral">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div class="stat-card-content">
            <span class="stat-card-label">Open misconceptions</span>
            <span class="stat-card-number">${stats.openMisconceptionsCount}</span>
            <span class="stat-card-sub">Potential gaps to resolve</span>
          </div>
        </div>

      </section>

      <!-- Main Dashboard Rows -->
      <div class="overview-dashboard-rows">
        
        <!-- Row 1: Your syllabus at a glance (2/3) + Check your understanding (1/3) -->
        <section class="overview-row-1">
          
          <!-- Syllabus Preview Card -->
          <div class="card syllabus-preview-card">
            <div class="card-header-row">
              <div class="card-title-with-icon">
                <span class="title-icon teal">
                  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/>
                  </svg>
                </span>
                <h3>Your syllabus, at a glance</h3>
              </div>
              <a href="#/app/syllabus" class="overview-link-action" id="linkViewSyllabus">
                View syllabus &rarr;
              </a>
            </div>

            <div class="syllabus-preview-table-wrap">
              <table class="syllabus-preview-table">
                <thead>
                  <tr>
                    <th scope="col">Topic</th>
                    <th scope="col">Material evidence</th>
                    <th scope="col">Understanding</th>
                    <th scope="col" aria-label="Action"></th>
                  </tr>
                </thead>
                <tbody>
                  ${previewTopics.length > 0 ? previewTopics.map(t => {
                    let evPill = 'pill-gray';
                    let evLabel = t.evidenceStatus;
                    if (t.evidenceStatus === 'Evidence found') {
                      evPill = 'pill-green';
                      evLabel = '✓ Evidence found';
                    } else if (t.evidenceStatus === 'Limited evidence') {
                      evPill = 'pill-amber';
                      evLabel = '⚠ Limited evidence';
                    } else {
                      evPill = 'pill-gray';
                      evLabel = '⊖ No match found';
                    }

                    let undPill = 'pill-gray';
                    let undLabel = t.understandingStatus;
                    if (t.understandingStatus === 'Needs practice') {
                      undPill = 'pill-amber';
                      undLabel = '🎓 Needs practice';
                    } else if (t.understandingStatus === 'Review needed') {
                      undPill = 'pill-coral';
                      undLabel = '⚠ Review needed';
                    } else {
                      undPill = 'pill-gray';
                      undLabel = '⊖ Not assessed';
                    }

                    return `
                      <tr class="overview-topic-row" data-topic-id="${t.id}" tabindex="0" role="link">
                        <td class="topic-title-cell">${escapeHtml(t.title)}</td>
                        <td><span class="pill-badge ${evPill}">${evLabel}</span></td>
                        <td><span class="pill-badge ${undPill}">${undLabel}</span></td>
                        <td class="text-right">
                          <span class="table-row-chevron">&rsaquo;</span>
                        </td>
                      </tr>
                    `;
                  }).join('') : `
                    <tr>
                      <td colspan="4" style="text-align: center; padding: 24px; color: #64748B;">
                        No syllabus topics yet. <a href="#/app/syllabus" class="link-action-teal">Create a topic</a> to start tracking your syllabus.
                      </td>
                    </tr>
                  `}
                </tbody>
              </table>
            </div>

            <div class="syllabus-footnote">
              Material coverage and understanding are tracked separately.
            </div>
          </div>

          <!-- Check Your Understanding Card (Reference Pale Teal Card) -->
          <div class="card check-understanding-banner-card">
            
            <!-- Open-Book Line Illustration in Top Right -->
            <div class="understanding-card-illustration" aria-hidden="true">
              <svg viewBox="0 0 100 80" width="100%" height="100%" fill="none" stroke="#006B6B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <!-- Book Spine and Covers -->
                <path d="M 50 18 Q 28 8 10 16 L 10 66 Q 30 58 50 68 Q 70 58 90 66 L 90 16 Q 72 8 50 18 Z" fill="#E6F6F3" stroke="#006B6B"/>
                <line x1="50" y1="18" x2="50" y2="68"/>
                <!-- Page Lines Left -->
                <line x1="20" y1="28" x2="42" y2="28" stroke="#008080" stroke-width="1.8"/>
                <line x1="20" y1="36" x2="42" y2="36" stroke="#008080" stroke-width="1.8"/>
                <line x1="20" y1="44" x2="36" y2="44" stroke="#008080" stroke-width="1.8"/>
                <!-- Page Lines Right -->
                <line x1="58" y1="28" x2="80" y2="28" stroke="#008080" stroke-width="1.8"/>
                <line x1="58" y1="36" x2="80" y2="36" stroke="#008080" stroke-width="1.8"/>
                <line x1="58" y1="44" x2="74" y2="44" stroke="#008080" stroke-width="1.8"/>
              </svg>
            </div>

            <div class="understanding-card-top-content">
              <h3 class="understanding-card-title">Check your understanding</h3>
              <p class="understanding-card-sub">Explain a concept in your own words.</p>

              ${state.topics && state.topics.length > 0 ? `
                <span class="try-example-label">Try an example:</span>
                <button type="button" class="try-example-pill-btn" id="overviewExampleCheckBtn" data-topic-id="${state.topics[0].id}">
                  <span class="example-icon">
                    <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
                      <path d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7.414A2 2 0 0017.414 6L13.586 2.172A2 2 0 0012.172 2H4z"/>
                    </svg>
                  </span>
                  <span class="example-text">${escapeHtml(state.topics[0].title)}</span>
                  <span class="example-chevron">&rsaquo;</span>
                </button>
              ` : `
                <p class="text-xs text-muted mt-2">Add topics in Syllabus Map to check understanding.</p>
              `}
            </div>

            <button type="button" class="btn btn-primary overview-start-check-btn" id="overviewStartCheckBtn">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">
                <polygon points="6 4 16 10 6 16"/>
              </svg>
              Start a check
            </button>

          </div>

        </section>

        <!-- Row 2: Recent study materials (~3/5) + Continue learning (~2/5) -->
        <section class="overview-row-2">
          
          <!-- Recent Study Materials Card -->
          <div class="card recent-materials-preview-card">
            <div class="card-header-row">
              <div class="card-title-with-icon">
                <span class="title-icon teal">
                  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                  </svg>
                </span>
                <h3>Recent study materials</h3>
              </div>
              <a href="#/app/materials" class="overview-link-action" id="linkViewAllMaterials">
                View all &rarr;
              </a>
            </div>

            <div class="recent-docs-stack">
              ${recentDocs.length > 0 ? recentDocs.map(doc => {
                const pageLabel = doc.pageCount ? `PDF • ${doc.pageCount} pages` : 'PDF • Page count unavailable';
                return `
                  <div class="recent-doc-row" data-doc-id="${doc.id}">
                    <div class="doc-pdf-badge-icon" aria-label="PDF Document">PDF</div>
                    <div class="doc-info-col">
                      <span class="doc-item-title" title="${escapeHtml(doc.filename || doc.title)}">
                        ${escapeHtml(doc.filename || doc.title)}
                      </span>
                      <span class="doc-item-meta">${pageLabel}</span>
                    </div>
                    <span class="pill-badge pill-green">✓ Ready</span>
                    <button type="button" class="doc-open-chevron-btn" data-doc-id="${doc.id}" aria-label="Open ${escapeHtml(doc.title)}">
                      &rsaquo;
                    </button>
                  </div>
                `;
              }).join('') : `
                <div class="recent-docs-empty" style="text-align: center; padding: 24px 16px; color: #64748B;">
                  <p style="margin-bottom: 12px; font-size: 14px;">No study materials uploaded yet.</p>
                  <button type="button" class="btn btn-outline btn-sm" id="overviewEmptyUploadBtn">Upload a PDF</button>
                </div>
              `}
            </div>
          </div>

          <!-- Continue Learning Card -->
          <div class="card continue-learning-panel-card">
            <div class="card-header-row">
              <div class="card-title-with-icon">
                <span class="title-icon teal">
                  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                  </svg>
                </span>
                <h3>Continue learning</h3>
              </div>
              <button type="button" class="icon-link-btn" id="continueLearningChevronBtn" aria-label="Go to misconceptions">
                &rsaquo;
              </button>
            </div>

            ${activeMisconception ? `
              <div class="continue-learning-body">
                <span class="pill-badge pill-amber-subtle">⚠ Possible misconception</span>
                <h4 class="continue-learning-title">${escapeHtml(activeMisconception.topicTitle)}</h4>
                <p class="continue-learning-desc">${escapeHtml(activeMisconception.observedIssue || 'Review the distinction, then try a new scenario.')}</p>

                <div class="continue-learning-meta-row">
                  <span class="source-chip" title="${escapeHtml(continueSourceDocName)}">
                    <span class="chip-icon">📄</span>
                    ${escapeHtml(continueSourceDocName)}
                  </span>
                  <button type="button" class="link-action-teal" id="continueLearningActionBtn" data-topic-id="${activeMisconception.topicId}">
                    Review &amp; practise &rarr;
                  </button>
                </div>
              </div>
            ` : `
              <div class="continue-learning-empty">
                <p class="text-sm text-muted">All tracked concepts are currently solid. Pick a topic from your syllabus to check your understanding.</p>
                <a href="#/app/understanding" class="link-action-teal">Practice a topic &rarr;</a>
              </div>
            `}
          </div>

        </section>

        <!-- Row 3: Full Width "Ask your materials" Composer -->
        <section class="overview-row-3">
          <div class="card overview-ask-composer-card">
            <div class="ask-composer-header">
              <div class="ask-header-left">
                <span class="chat-icon-teal" aria-hidden="true">
                  <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor">
                    <path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clip-rule="evenodd"/>
                  </svg>
                </span>
                <h3>Ask your materials</h3>
              </div>
              <span class="ask-header-sub">Answers link back to your study materials.</span>
            </div>

            <div class="ask-composer-input-row">
              <input type="text" id="overviewAskInput" class="ask-composer-input" placeholder="Ask a question about your selected sources..." autocomplete="off">
              <button type="button" class="ask-composer-send-btn" id="overviewAskBtn" aria-label="Send question to Ask Syllora">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              </button>
            </div>
          </div>
        </section>

      </div>

    </div>
  `;

  bindEvents();

  function bindEvents() {
    // Upload materials button
    const uploadBtn = container.querySelector('#overviewUploadBtn');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => {
        openUploadModal(() => renderOverview(container));
      });
    }

    const emptyUploadBtn = container.querySelector('#overviewEmptyUploadBtn');
    if (emptyUploadBtn) {
      emptyUploadBtn.addEventListener('click', () => {
        openUploadModal(() => renderOverview(container));
      });
    }

    // Course selector button
    const courseBtn = container.querySelector('#overviewCourseBtn');
    if (courseBtn) {
      courseBtn.addEventListener('click', () => {
        router.navigate('/app/syllabus');
      });
    }

    // Summary Card Navigation
    const cardMaterials = container.querySelector('#cardStudyMaterials');
    const cardEvidence = container.querySelector('#cardTopicsEvidence');
    const cardPractice = container.querySelector('#cardNeedsPractice');
    const cardMisconceptions = container.querySelector('#cardOpenMisconceptions');

    if (cardMaterials) cardMaterials.addEventListener('click', () => router.navigate('/app/materials'));
    if (cardEvidence) cardEvidence.addEventListener('click', () => router.navigate('/app/syllabus'));
    if (cardPractice) cardPractice.addEventListener('click', () => router.navigate('/app/understanding'));
    if (cardMisconceptions) cardMisconceptions.addEventListener('click', () => router.navigate('/app/misconceptions'));

    // Topic row clicks in Syllabus at a glance
    container.querySelectorAll('.overview-topic-row').forEach(row => {
      const topicId = row.getAttribute('data-topic-id');
      row.addEventListener('click', () => {
        router.navigate('/app/understanding', { topic: topicId });
      });
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          router.navigate('/app/understanding', { topic: topicId });
        }
      });
    });

    // Check Understanding example card
    const exampleCheckBtn = container.querySelector('#overviewExampleCheckBtn');
    if (exampleCheckBtn) {
      exampleCheckBtn.addEventListener('click', () => {
        router.navigate('/app/understanding', { topic: 'top-3' });
      });
    }

    // Start a check button
    const startCheckBtn = container.querySelector('#overviewStartCheckBtn');
    if (startCheckBtn) {
      startCheckBtn.addEventListener('click', () => {
        router.navigate('/app/understanding');
      });
    }

    // Recent materials document open
    container.querySelectorAll('.doc-open-chevron-btn, .recent-doc-row').forEach(el => {
      el.addEventListener('click', (e) => {
        const docId = el.getAttribute('data-doc-id');
        if (docId) {
          PdfReader.open(docId, 1);
        }
      });
    });

    // Continue learning buttons
    const continueActionBtn = container.querySelector('#continueLearningActionBtn');
    const continueChevronBtn = container.querySelector('#continueLearningChevronBtn');

    if (continueActionBtn) {
      continueActionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const topicId = continueActionBtn.getAttribute('data-topic-id') || 'top-3';
        router.navigate('/app/understanding', { topic: topicId });
      });
    }

    if (continueChevronBtn) {
      continueChevronBtn.addEventListener('click', () => {
        router.navigate('/app/misconceptions');
      });
    }

    // Ask Composer Submission
    const askInput = container.querySelector('#overviewAskInput');
    const askBtn = container.querySelector('#overviewAskBtn');

    const handleAskSubmit = () => {
      const q = askInput.value.trim();
      if (q) {
        router.navigate('/app/ask', { q });
      } else {
        askInput.focus();
        Toast.show('Please enter a question to ask your materials.', 'info');
      }
    };

    if (askBtn) askBtn.addEventListener('click', handleAskSubmit);
    if (askInput) {
      askInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAskSubmit();
        }
      });
    }

    // Hydrate live backend metrics asynchronously without blocking UI render
    sylloraApi.getDashboardSummary()
      .then(summary => {
        if (!container.isConnected) return;
        const matNum = container.querySelector('#cardStudyMaterials .stat-card-number');
        const evNum = container.querySelector('#cardTopicsEvidence .stat-card-number');
        const miscNum = container.querySelector('#cardOpenMisconceptions .stat-card-number');
        if (matNum && typeof summary.total_documents === 'number') {
          matNum.textContent = String(summary.total_documents);
        }
        if (evNum && typeof summary.topics_with_evidence === 'number' && typeof summary.total_topics === 'number') {
          evNum.textContent = `${summary.topics_with_evidence} / ${summary.total_topics}`;
        }
        if (miscNum && typeof summary.open_misconceptions === 'number') {
          miscNum.textContent = String(summary.open_misconceptions);
        }
      })
      .catch(err => {
        console.debug('[Overview] Live dashboard summary unavailable:', err);
      });
  }
}
