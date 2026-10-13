/**
 * ============================================================================
 * VIEW: OVERVIEW DASHBOARD
 * ============================================================================
 * Closely follows the reference design:
 * - Personal greeting & exam reminder
 * - Course selector & Upload materials action
 * - 4 Compact Stat Cards (derived from shared state)
 * - Wide Syllabus Coverage & Understanding Table
 * - Pale teal "Check your understanding" Card
 * - Recent Study Materials
 * - "Continue learning" saved issue card
 * - Compact "Ask your materials" input
 */

import { workspaceStore } from '../state.js';
import { router } from '../router.js';
import { PdfReader } from '../components/pdfViewer.js';
import { Modal, Toast } from '../components/modal.js';

export function renderOverview(container) {
  const state = workspaceStore.getState();
  const stats = workspaceStore.getStats();

  const recentDocs = state.documents.filter(d => !d.isComparisonOnly).slice(0, 3);
  const activeMisconception = state.misconceptions[0];

  container.innerHTML = `
    <div class="view-overview-page">
      
      <!-- Top Welcome Banner & Actions -->
      <section class="overview-welcome-banner">
        <div class="welcome-copy">
          <h1 class="welcome-heading">Welcome back, Prajith</h1>
          <p class="welcome-subtext">You have <strong>${stats.needsPracticeCount} topics</strong> needing practice before the CS301 mid-term on Nov 18, 2026.</p>
        </div>

        <div class="welcome-actions">
          <button type="button" class="btn btn-outline" id="quickExamPlanBtn">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="14" height="13" rx="2"/><line x1="13" y1="2" x2="13" y2="5"/><line x1="7" y1="2" x2="7" y2="5"/></svg>
            Revision Plan
          </button>
          <button type="button" class="btn btn-primary" id="overviewUploadBtn">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 3v10m-4-4l4-4 4 4M3 15h14"/></svg>
            Upload materials
          </button>
        </div>
      </section>

      <!-- 4 Compact Stat Cards -->
      <section class="overview-metrics-grid">
        
        <div class="metric-card" id="metricMaterialsCard">
          <div class="metric-header">
            <span class="metric-label">Study materials</span>
            <span class="metric-icon teal">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor"><path d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7.414A2 2 0 0017.414 6L13.586 2.172A2 2 0 0012.172 2H4z"/></svg>
            </span>
          </div>
          <div class="metric-value-row">
            <span class="metric-number">${stats.totalDocs}</span>
            <span class="metric-unit">documents</span>
          </div>
          <div class="metric-footer">
            <span class="text-muted">${stats.indexedDocs} indexed • ${stats.localPreviewDocs} preview</span>
          </div>
        </div>

        <div class="metric-card" id="metricEvidenceCard">
          <div class="metric-header">
            <span class="metric-label">Topics with evidence</span>
            <span class="metric-icon green">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 10l4 4L16 6"/></svg>
            </span>
          </div>
          <div class="metric-value-row">
            <span class="metric-number">${stats.topicsWithEvidenceCount}</span>
            <span class="metric-unit">/ ${stats.totalTopics} topics</span>
          </div>
          <div class="metric-footer">
            <div class="progress-bar-sm">
              <div class="progress-fill-sm" style="width: ${stats.evidenceCoveragePct}%"></div>
            </div>
            <span class="progress-pct">${stats.evidenceCoveragePct}% coverage</span>
          </div>
        </div>

        <div class="metric-card" id="metricPracticeCard">
          <div class="metric-header">
            <span class="metric-label">Needs practice</span>
            <span class="metric-icon amber">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="8"/><line x1="10" y1="6" x2="10" y2="10"/><circle cx="10" cy="14" r="0.5"/></svg>
            </span>
          </div>
          <div class="metric-value-row">
            <span class="metric-number text-amber">${stats.needsPracticeCount}</span>
            <span class="metric-unit">topics</span>
          </div>
          <div class="metric-footer">
            <span class="pill-badge pill-amber">Target for midterm</span>
          </div>
        </div>

        <div class="metric-card" id="metricMisconceptionsCard">
          <div class="metric-header">
            <span class="metric-label">Open misconceptions</span>
            <span class="metric-icon coral">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="8"/><path d="M7 7l6 6M13 7l-6 6"/></svg>
            </span>
          </div>
          <div class="metric-value-row">
            <span class="metric-number text-coral">${stats.openMisconceptionsCount}</span>
            <span class="metric-unit">issues</span>
          </div>
          <div class="metric-footer">
            <span class="pill-badge pill-coral">Action required</span>
          </div>
        </div>

      </section>

      <!-- Main Dashboard Grid: Left Wide Table, Right Assistive Column -->
      <div class="overview-content-layout">
        
        <!-- Left: Wide Syllabus Map Table -->
        <div class="overview-main-left">
          
          <div class="card syllabus-summary-card">
            <div class="card-header-row">
              <div class="header-titles">
                <h2 class="card-title">Syllabus Topic Map</h2>
                <p class="card-sub">Active status for course topics, material evidence, and student understanding.</p>
              </div>
              <a href="#/app/syllabus" class="btn btn-secondary btn-sm">View full map →</a>
            </div>

            <div class="table-responsive">
              <table class="syllabus-table">
                <thead>
                  <tr>
                    <th>TOPIC</th>
                    <th>UNIT</th>
                    <th>MATERIAL EVIDENCE</th>
                    <th>STUDENT UNDERSTANDING</th>
                    <th>MATCHED SOURCES</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  ${state.topics.slice(0, 5).map(topic => {
                    let evPill = 'pill-gray';
                    if (topic.evidenceStatus === 'Evidence found') evPill = 'pill-green';
                    else if (topic.evidenceStatus === 'Limited evidence') evPill = 'pill-amber';

                    let undPill = 'pill-gray';
                    if (topic.understandingStatus === 'Needs practice') undPill = 'pill-amber';
                    else if (topic.understandingStatus === 'Review needed') undPill = 'pill-coral';

                    const passageCount = topic.matchedPassageIds.length;

                    return `
                      <tr>
                        <td class="font-semibold text-main">${topic.title}</td>
                        <td class="text-muted text-sm">${topic.unit}</td>
                        <td><span class="pill-badge ${evPill}">${topic.evidenceStatus}</span></td>
                        <td><span class="pill-badge ${undPill}">${topic.understandingStatus}</span></td>
                        <td>
                          ${passageCount > 0 ? `
                            <button type="button" class="link-btn-source" data-topic-id="${topic.id}">
                              ${passageCount} verified passages
                            </button>
                          ` : '<span class="text-muted text-sm">None</span>'}
                        </td>
                        <td>
                          <button type="button" class="btn btn-secondary btn-xs check-und-btn" data-topic-id="${topic.id}">
                            Check understanding
                          </button>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Compact Ask Your Materials Input -->
          <div class="card ask-materials-bar">
            <div class="ask-bar-icon">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
                <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>
              </svg>
            </div>
            <div class="ask-bar-input-wrap">
              <input type="text" id="overviewAskInput" class="ask-bar-input" placeholder="Ask your course materials a question... e.g. How is deadlock different from starvation?">
            </div>
            <button type="button" class="btn btn-primary" id="overviewAskBtn">
              Ask Syllora
            </button>
          </div>

        </div>

        <!-- Right: Recent Materials, Check Understanding & Continue Learning Cards -->
        <div class="overview-main-right">

          <!-- Pale Teal "Check your understanding" Card -->
          <div class="card pale-teal-card">
            <div class="pale-card-badge">RECOMMENDED FOR YOU</div>
            <h3 class="pale-card-title">Check understanding: Deadlock vs Starvation</h3>
            <p class="pale-card-body">Differentiate the 4 Coffman conditions from indefinite priority postponement with scenario-based practice.</p>
            <button type="button" class="btn btn-primary btn-block" id="startPaleAssessmentBtn">
              Start understanding check →
            </button>
          </div>

          <!-- Continue Learning Card (Saved Misconception) -->
          ${activeMisconception ? `
            <div class="card continue-learning-card">
              <div class="continue-header">
                <span class="continue-tag">CONTINUE LEARNING</span>
                <span class="pill-badge pill-coral">${activeMisconception.status}</span>
              </div>
              <h4 class="continue-title">${activeMisconception.topicTitle}</h4>
              <p class="continue-issue">${activeMisconception.observedIssue}</p>
              <div class="continue-footer">
                <span class="continue-meta">Attempted ${activeMisconception.lastAttemptDate}</span>
                <div class="continue-actions">
                  <button type="button" class="btn btn-secondary btn-xs" id="continueReviewBtn">Review source</button>
                  <button type="button" class="btn btn-primary btn-xs" id="continuePracticeBtn">Practice again</button>
                </div>
              </div>
            </div>
          ` : ''}

          <!-- Recent Study Materials Card -->
          <div class="card recent-materials-card">
            <div class="card-header-row">
              <h3 class="card-title-sm">Recent Study Materials</h3>
              <a href="#/app/materials" class="link-sm">View library</a>
            </div>
            <div class="recent-docs-list">
              ${recentDocs.map(doc => `
                <div class="recent-doc-item">
                  <div class="recent-doc-icon">
                    <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
                      <path d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7.414A2 2 0 0017.414 6L13.586 2.172A2 2 0 0012.172 2H4z"/>
                    </svg>
                  </div>
                  <div class="recent-doc-info">
                    <div class="recent-doc-title">${doc.title}</div>
                    <div class="recent-doc-meta">${doc.pageCount} pages • ${doc.fileSize}</div>
                  </div>
                  <button type="button" class="btn btn-secondary btn-xs open-doc-reader-btn" data-doc-id="${doc.id}">
                    Open
                  </button>
                </div>
              `).join('')}
            </div>
          </div>

        </div>

      </div>

    </div>
  `;

  // --- Bind Event Handlers ---
  const overviewUploadBtn = container.querySelector('#overviewUploadBtn');
  if (overviewUploadBtn) {
    overviewUploadBtn.addEventListener('click', () => {
      router.navigate('/app/materials', { upload: '1' });
    });
  }

  const quickExamPlanBtn = container.querySelector('#quickExamPlanBtn');
  if (quickExamPlanBtn) {
    quickExamPlanBtn.addEventListener('click', () => {
      router.navigate('/app/revision');
    });
  }

  const startPaleAssessmentBtn = container.querySelector('#startPaleAssessmentBtn');
  if (startPaleAssessmentBtn) {
    startPaleAssessmentBtn.addEventListener('click', () => {
      router.navigate('/app/understanding', { topic: 'top-3' });
    });
  }

  const continueReviewBtn = container.querySelector('#continueReviewBtn');
  if (continueReviewBtn) {
    continueReviewBtn.addEventListener('click', () => {
      PdfReader.open('doc-1', 3, 'A deadlock occurs when every process in a set is waiting for an event only another process can cause. Starvation is postponement due to priority bias.', '8.3 Deadlock vs Starvation');
    });
  }

  const continuePracticeBtn = container.querySelector('#continuePracticeBtn');
  if (continuePracticeBtn) {
    continuePracticeBtn.addEventListener('click', () => {
      router.navigate('/app/understanding', { topic: 'top-3' });
    });
  }

  // Open reader buttons
  container.querySelectorAll('.open-doc-reader-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const docId = btn.getAttribute('data-doc-id');
      PdfReader.open(docId, 1);
    });
  });

  // Check understanding buttons in table
  container.querySelectorAll('.check-und-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const topicId = btn.getAttribute('data-topic-id');
      router.navigate('/app/understanding', { topic: topicId });
    });
  });

  // Source passages in table
  container.querySelectorAll('.link-btn-source').forEach(btn => {
    btn.addEventListener('click', () => {
      const topicId = btn.getAttribute('data-topic-id');
      const topic = state.topics.find(t => t.id === topicId);
      if (topic && topic.matchedPassageIds.length > 0) {
        const pass = state.passages.find(p => p.id === topic.matchedPassageIds[0]);
        if (pass) {
          PdfReader.open(pass.documentId, pass.pageNumber, pass.quote, pass.sectionTitle);
        }
      }
    });
  });

  // Ask input submission
  const askInput = container.querySelector('#overviewAskInput');
  const askBtn = container.querySelector('#overviewAskBtn');
  const handleAsk = () => {
    const q = askInput.value.trim();
    if (q) {
      router.navigate('/app/ask', { q });
    } else {
      askInput.focus();
    }
  };

  if (askBtn) askBtn.addEventListener('click', handleAsk);
  if (askInput) {
    askInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleAsk();
    });
  }
}
