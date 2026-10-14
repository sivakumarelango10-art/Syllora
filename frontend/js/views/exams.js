/**
 * ============================================================================
 * SYLLORA EXAM INTELLIGENCE VIEW (F1 Past-Paper Intelligence & Exam Practice)
 * ============================================================================
 * Past-paper question extraction, repetition frequency analytics, unit heatmap,
 * marks distribution, note-evidence linking, and active recall practice.
 */

import { router } from '../router.js';
import { workspaceStore } from '../state.js';
import { Toast, Modal, lockBodyScroll, unlockBodyScroll } from '../components/modal.js';
import { getApiBase } from '../services/aiApi.js';
import { getAuthToken } from '../services/supabase.js';

function escapeHtml(str) {
  if (typeof str !== 'string') return str || '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function apiFetch(endpoint, options = {}) {
  const apiBase = getApiBase();
  const token = getAuthToken();
  const headers = { ...(options.headers || {}) };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await fetch(`${apiBase}${endpoint}`, { ...options, headers });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export function renderExams(mountPoint) {
  mountPoint.innerHTML = `
    <div class="view-header" style="margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px;">
      <div>
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
          <h1 style="font-size: 26px; font-weight: 700; color: #14212B; margin: 0;">Exam Intelligence</h1>
          <span class="badge" style="background: #E6F4F2; color: #03605E; font-weight: 600; padding: 3px 10px; border-radius: 20px; font-size: 12px;">PYQ Analytics</span>
        </div>
        <p style="font-size: 14px; color: #5F6F82; margin: 0;">Analyze previous-year papers, detect repeated exam questions, and link questions to your study notes.</p>
      </div>
      <div style="display: flex; gap: 10px;">
        <button type="button" class="btn btn-secondary" id="openVivaBtn" style="display: inline-flex; align-items: center; gap: 6px;">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
          Viva Practice
        </button>
        <button type="button" class="btn btn-primary" id="uploadPyqBtn" style="display: inline-flex; align-items: center; gap: 6px;">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Upload Past Paper
        </button>
      </div>
    </div>

    <!-- Analytics Metric Cards -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 16px; margin-bottom: 24px;" id="examMetricsContainer">
      <div class="card" style="padding: 18px; border: 1px solid #E2E8EE; border-radius: 12px; background: #FFFFFF;">
        <div style="font-size: 12.5px; font-weight: 600; color: #5F6F82; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Past Papers</div>
        <div style="font-size: 28px; font-weight: 700; color: #14212B;" id="metricTotalPapers">-</div>
        <div style="font-size: 12px; color: #8C9BAE; margin-top: 4px;">Uploaded exam sets</div>
      </div>
      <div class="card" style="padding: 18px; border: 1px solid #E2E8EE; border-radius: 12px; background: #FFFFFF;">
        <div style="font-size: 12.5px; font-weight: 600; color: #5F6F82; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Extracted Questions</div>
        <div style="font-size: 28px; font-weight: 700; color: #14212B;" id="metricTotalQuestions">-</div>
        <div style="font-size: 12px; color: #8C9BAE; margin-top: 4px;">Structured question bank</div>
      </div>
      <div class="card" style="padding: 18px; border: 1px solid #E2E8EE; border-radius: 12px; background: #FFFFFF;">
        <div style="font-size: 12.5px; font-weight: 600; color: #D97706; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Repeated Questions</div>
        <div style="font-size: 28px; font-weight: 700; color: #D97706;" id="metricRepeatedQuestions">-</div>
        <div style="font-size: 12px; color: #8C9BAE; margin-top: 4px;">High recurrence across years</div>
      </div>
      <div class="card" style="padding: 18px; border: 1px solid #E2E8EE; border-radius: 12px; background: #FFFFFF;">
        <div style="font-size: 12.5px; font-weight: 600; color: #03605E; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Notes Evidence Link</div>
        <div style="font-size: 28px; font-weight: 700; color: #03605E;" id="metricNotesCoverage">-</div>
        <div style="font-size: 12px; color: #8C9BAE; margin-top: 4px;">Questions linked to notes</div>
      </div>
    </div>

    <!-- Exam Analytics Tabs & Breakdown -->
    <div class="card" style="padding: 20px; border: 1px solid #E2E8EE; border-radius: 12px; background: #FFFFFF; margin-bottom: 24px;" id="analyticsPanel">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
        <h3 style="font-size: 17px; font-weight: 700; color: #14212B; margin: 0;">Syllabus Unit Distribution &amp; Recurring Topics</h3>
        <span style="font-size: 12px; color: #5F6F82;">Calculated from uploaded previous-year question papers</span>
      </div>
      <div id="unitHeatmapContainer" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 16px;">
        <!-- Heatmap pills populated dynamically -->
      </div>
      <div id="topRecurringTopicsContainer" style="display: flex; flex-wrap: wrap; gap: 8px;">
        <!-- Recurring topic pills -->
      </div>
    </div>

    <!-- Questions Filter & Explorer -->
    <div class="card" style="padding: 20px; border: 1px solid #E2E8EE; border-radius: 12px; background: #FFFFFF;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <h3 style="font-size: 17px; font-weight: 700; color: #14212B; margin: 0;">Past-Paper Questions</h3>
          <span class="badge" id="filteredQuestionsCount" style="background: #F1F5F9; color: #475569; font-size: 12px; padding: 2px 8px; border-radius: 12px;">0</span>
        </div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <select id="filterPaperSelect" class="input" style="padding: 6px 12px; font-size: 13px; border-radius: 8px; border: 1px solid #CBD5E1;">
            <option value="">All Question Papers</option>
          </select>
          <select id="filterMarksSelect" class="input" style="padding: 6px 12px; font-size: 13px; border-radius: 8px; border: 1px solid #CBD5E1;">
            <option value="">All Marks</option>
            <option value="2">2 Marks</option>
            <option value="5">5 Marks</option>
            <option value="10">10 Marks</option>
            <option value="15">15+ Marks</option>
          </select>
        </div>
      </div>

      <!-- Question List Mount -->
      <div id="questionsListContainer" style="display: flex; flex-direction: column; gap: 12px;">
        <div style="text-align: center; padding: 40px; color: #8C9BAE;">Loading past-paper questions...</div>
      </div>
    </div>
  `;

  let papers = [];
  let questions = [];

  async function loadData() {
    try {
      const [papersRes, questionsRes, analyticsRes] = await Promise.all([
        apiFetch('/api/v1/exams/papers'),
        apiFetch('/api/v1/exams/questions'),
        apiFetch('/api/v1/exams/analytics'),
      ]);

      papers = papersRes.papers || [];
      questions = questionsRes.questions || [];

      // Update metrics
      const totalPapersEl = mountPoint.querySelector('#metricTotalPapers');
      const totalQuestionsEl = mountPoint.querySelector('#metricTotalQuestions');
      const repeatedEl = mountPoint.querySelector('#metricRepeatedQuestions');
      const coverageEl = mountPoint.querySelector('#metricNotesCoverage');

      if (totalPapersEl) totalPapersEl.textContent = analyticsRes.total_papers || '0';
      if (totalQuestionsEl) totalQuestionsEl.textContent = analyticsRes.total_questions || '0';
      if (repeatedEl) repeatedEl.textContent = analyticsRes.repeated_questions_count ? `${analyticsRes.repeated_questions_count} High-Yield` : '0';
      if (coverageEl) coverageEl.textContent = `${analyticsRes.notes_coverage_percentage || 0}%`;

      // Render Heatmap
      const heatmapContainer = mountPoint.querySelector('#unitHeatmapContainer');
      if (heatmapContainer) {
        if (!analyticsRes.unit_heatmap || analyticsRes.unit_heatmap.length === 0) {
          heatmapContainer.innerHTML = `<div style="grid-column: 1/-1; color: #8C9BAE; font-size: 13px; text-align: center; padding: 10px;">Upload past papers to visualize syllabus unit question distribution.</div>`;
        } else {
          heatmapContainer.innerHTML = analyticsRes.unit_heatmap.map(u => `
            <div style="background: #F8FAFC; border: 1px solid #E2E8EE; border-radius: 8px; padding: 10px; text-align: center;">
              <div style="font-size: 11px; font-weight: 600; color: #64748B; text-transform: uppercase;">Unit ${u.unit}</div>
              <div style="font-size: 18px; font-weight: 700; color: #03605E; margin: 4px 0;">${u.count} <span style="font-size: 11px; font-weight: 500; color: #64748B;">Q's</span></div>
              <div style="font-size: 11px; color: #64748B;">${u.percentage}% weight</div>
            </div>
          `).join('');
        }
      }

      // Render Recurring Topics
      const recurringContainer = mountPoint.querySelector('#topRecurringTopicsContainer');
      if (recurringContainer && analyticsRes.top_recurring_topics && analyticsRes.top_recurring_topics.length > 0) {
        recurringContainer.innerHTML = `
          <div style="font-size: 12px; font-weight: 600; color: #475569; width: 100%; margin-bottom: 4px;">Top Recurring Exam Concepts:</div>
          ${analyticsRes.top_recurring_topics.map(t => `
            <span class="badge" style="background: #FEF3C7; color: #92400E; border: 1px solid #FDE68A; padding: 4px 10px; border-radius: 16px; font-size: 12px; font-weight: 500;">
              🔥 ${escapeHtml(t.topic)} (${t.frequency}x repeated)
            </span>
          `).join('')}
        `;
      }

      // Populate Paper Filter Select
      const paperSelect = mountPoint.querySelector('#filterPaperSelect');
      if (paperSelect) {
        paperSelect.innerHTML = `<option value="">All Question Papers (${papers.length})</option>` +
          papers.map(p => `<option value="${p.id}">${escapeHtml(p.title)} (${p.exam_year})</option>`).join('');
      }

      renderQuestions();
    } catch (err) {
      console.error('[ExamsView] Failed to load data:', err);
      const listContainer = mountPoint.querySelector('#questionsListContainer');
      if (listContainer) {
        listContainer.innerHTML = `
          <div style="text-align: center; padding: 30px; color: #64748B;">
            <p style="margin-bottom: 12px;">No past papers uploaded yet or unable to reach backend.</p>
            <button type="button" class="btn btn-secondary btn-sm" id="retryExamsBtn">Retry</button>
          </div>
        `;
        const retryBtn = mountPoint.querySelector('#retryExamsBtn');
        if (retryBtn) retryBtn.addEventListener('click', loadData);
      }
    }
  }

  function renderQuestions() {
    const listContainer = mountPoint.querySelector('#questionsListContainer');
    const paperFilter = mountPoint.querySelector('#filterPaperSelect')?.value || '';
    const marksFilter = mountPoint.querySelector('#filterMarksSelect')?.value || '';

    let filtered = questions.filter(q => {
      if (paperFilter && q.exam_paper_id !== paperFilter) return false;
      if (marksFilter) {
        const m = parseInt(marksFilter, 10);
        if (m === 15 && q.marks < 15) return false;
        if (m !== 15 && q.marks !== m) return false;
      }
      return true;
    });

    const countBadge = mountPoint.querySelector('#filteredQuestionsCount');
    if (countBadge) countBadge.textContent = filtered.length;

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; border: 1px dashed #CBD5E1; border-radius: 12px; color: #64748B;">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#94A3B8" stroke-width="1.5" style="margin-bottom: 12px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          <h4 style="font-size: 15px; font-weight: 600; color: #1E293B; margin-bottom: 4px;">No exam questions match filter</h4>
          <p style="font-size: 13px; color: #64748B; margin-bottom: 16px;">Upload past university question papers to extract questions and detect repeat patterns.</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = filtered.map(q => {
      const isRepeated = q.repeat_count > 1;
      const statusColor = q.evidence_status === 'supported' ? '#03605E' : q.evidence_status === 'partial' ? '#D97706' : '#64748B';
      const statusBg = q.evidence_status === 'supported' ? '#E6F4F2' : q.evidence_status === 'partial' ? '#FEF3C7' : '#F1F5F9';
      const statusLabel = q.evidence_status === 'supported' ? 'Notes Evidence Linked' : q.evidence_status === 'partial' ? 'Partial Notes' : 'No Notes Linked';

      return `
        <div class="card" style="padding: 16px; border: 1px solid #E2E8EE; border-radius: 10px; background: #FFFFFF; transition: transform 0.15s ease, box-shadow 0.15s ease;" data-question-id="${q.id}">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span style="font-weight: 700; color: #03605E; font-size: 13.5px;">Q${escapeHtml(q.question_number)}</span>
              <span class="badge" style="background: #F1F5F9; color: #334155; font-size: 11.5px; font-weight: 600;">${q.marks} Marks</span>
              <span class="badge" style="background: #F1F5F9; color: #475569; font-size: 11.5px;">Unit ${q.unit_number || 1}</span>
              <span style="font-size: 11.5px; color: #64748B;">${escapeHtml(q.paper_title || 'Past Paper')} (${q.exam_year || ''})</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              ${isRepeated ? `<span class="badge" style="background: #FEF3C7; color: #92400E; font-weight: 700; font-size: 11.5px; padding: 2px 8px; border-radius: 10px;">🔥 Repeated ${q.repeat_count}x</span>` : ''}
              <span class="badge" style="background: ${statusBg}; color: ${statusColor}; font-weight: 600; font-size: 11px; padding: 2px 8px; border-radius: 10px;">${statusLabel}</span>
            </div>
          </div>
          <p style="font-size: 14px; color: #1E293B; margin: 0 0 12px; line-height: 1.5; font-weight: 500;">${escapeHtml(q.question_text)}</p>
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; border-top: 1px solid #F1F5F9; pt: 10px; padding-top: 8px;">
            <div style="display: flex; gap: 8px;">
              <button type="button" class="btn btn-secondary btn-sm view-evidence-btn" data-id="${q.id}" style="font-size: 12px; padding: 4px 10px;">
                View Notes Evidence
              </button>
              <button type="button" class="btn btn-secondary btn-sm practice-tryfirst-btn" data-id="${q.id}" data-text="${escapeHtml(q.question_text)}" data-marks="${q.marks}" style="font-size: 12px; padding: 4px 10px;">
                Practice (Try First)
              </button>
            </div>
            <div style="display: flex; gap: 8px;">
              <button type="button" class="btn btn-primary btn-sm generate-answer-btn" data-text="${escapeHtml(q.question_text)}" data-marks="${q.marks}" style="font-size: 12px; padding: 4px 10px;">
                Generate ${q.marks}-Mark Answer
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach listeners
    listContainer.querySelectorAll('.generate-answer-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-text');
        const marks = btn.getAttribute('data-marks');
        router.navigate('/app/ask', { q: text, marks: marks });
      });
    });

    listContainer.querySelectorAll('.practice-tryfirst-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-text');
        const marks = btn.getAttribute('data-marks');
        router.navigate('/app/understanding', { tab: 'tryfirst', q: text, marks: marks });
      });
    });

    listContainer.querySelectorAll('.view-evidence-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const qid = btn.getAttribute('data-id');
        showEvidenceModal(qid);
      });
    });
  }

  async function showEvidenceModal(questionId) {
    if (document.getElementById('evidenceModalOverlay')) return;
    const previousFocus = document.activeElement;
    lockBodyScroll();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'evidenceModalOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'evidenceModalTitle');

    overlay.innerHTML = `
      <div class="modal-card pyq-evidence-card">
        <div class="pyq-modal-header">
          <h3 id="evidenceModalTitle" class="pyq-modal-title">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--ws-primary, #006B6B); flex-shrink: 0;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Supporting Notes Evidence
          </h3>
          <button type="button" class="modal-close-btn" id="closeEvidenceModalBtn" aria-label="Close dialog">&times;</button>
        </div>
        <div class="pyq-modal-body" id="evidenceModalBody">
          <div style="text-align: center; padding: 28px 16px; color: var(--ws-text-muted, #64748B);">
            <div class="spinner-sm" style="border-top-color: var(--ws-primary, #006B6B); border-color: rgba(0, 107, 107, 0.2); width: 22px; height: 22px; margin-bottom: 8px;"></div>
            <div>Searching your uploaded study materials...</div>
          </div>
        </div>
        <div class="pyq-modal-footer">
          <button type="button" class="btn btn-secondary" id="closeEvidenceBtn">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => {
      window.removeEventListener('keydown', keydownHandler);
      overlay.remove();
      unlockBodyScroll();
      if (previousFocus && typeof previousFocus.focus === 'function') {
        previousFocus.focus();
      }
    };

    const keydownHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === 'Tab') {
        const focusables = overlay.querySelectorAll(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', keydownHandler);

    const closeBtn = overlay.querySelector('#closeEvidenceModalBtn');
    const footerCloseBtn = overlay.querySelector('#closeEvidenceBtn');

    closeBtn.addEventListener('click', close);
    footerCloseBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    setTimeout(() => {
      closeBtn.focus();
    }, 50);

    try {
      const res = await apiFetch(`/api/v1/exams/questions/${encodeURIComponent(questionId)}/evidence`, { method: 'POST' });
      const evidence = res.evidence || [];
      const body = overlay.querySelector('#evidenceModalBody');

      if (!body) return;

      if (evidence.length === 0) {
        body.innerHTML = `
          <div style="text-align: center; padding: 24px 16px; color: var(--ws-text-muted, #64748B);">
            <p style="margin: 0 0 8px; font-weight: 500; font-size: 14px; color: var(--ws-text-main, #1E293B);">No matching passages found in your uploaded study notes for this question.</p>
            <p style="font-size: 13px; color: #94A3B8; margin: 0;">Upload relevant lecture slides or textbooks in Study Materials to generate verified citations.</p>
          </div>
        `;
      } else {
        body.innerHTML = `
          <div style="font-size: 13.5px; font-weight: 500; color: #475569; margin-bottom: 8px;">Top verified passages retrieved from your personal study notes:</div>
          <div style="display: flex; flex-direction: column; gap: 10px; max-height: 420px; overflow-y: auto; padding-right: 4px;">
            ${evidence.map((e) => `
              <div style="padding: 14px; background: #F8FAFC; border: 1px solid #E2E8EE; border-radius: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; gap: 8px;">
                  <span style="font-weight: 600; font-size: 13px; color: #03605E;">${escapeHtml(e.document_title || e.filename)}</span>
                  <span class="badge" style="background: #E2E8F0; color: #334155; font-size: 11px; padding: 2px 8px; border-radius: 12px; font-weight: 600;">Page ${e.page_number}</span>
                </div>
                <p style="font-size: 13px; color: #334155; margin: 0; line-height: 1.5; font-style: italic;">"${escapeHtml(e.excerpt)}"</p>
              </div>
            `).join('')}
          </div>
        `;
      }
    } catch (err) {
      const body = overlay.querySelector('#evidenceModalBody');
      if (body) {
        body.innerHTML = `<div style="color: #E11D48; text-align: center; padding: 24px; font-size: 13.5px;">Failed to retrieve evidence: ${escapeHtml(err.message)}</div>`;
      }
    }
  }

  // Upload PYQ Modal
  function showUploadPyqModal() {
    if (document.getElementById('uploadPyqModalOverlay')) return;
    const previousFocus = document.activeElement;
    lockBodyScroll();

    let selectedPdfFile = null;
    let isUploading = false;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'uploadPyqModalOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'uploadPyqModalTitle');

    overlay.innerHTML = `
      <div class="modal-card pyq-modal-card">
        <div class="pyq-modal-header">
          <h3 id="uploadPyqModalTitle" class="pyq-modal-title">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--ws-primary, #006B6B); flex-shrink: 0;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            Upload Past-Year Question Paper
          </h3>
          <button type="button" class="modal-close-btn" id="closePyqModalBtn" aria-label="Close dialog">&times;</button>
        </div>
        <form id="uploadPyqForm" novalidate>
          <div class="pyq-modal-body">
            <div class="pyq-form-group">
              <label for="pyqTitleInput" class="pyq-form-label">
                Paper Title / Subject <span class="required-star">*</span>
              </label>
              <input type="text" id="pyqTitleInput" name="title" class="pyq-form-control" placeholder="e.g. Operating Systems End-Semester 2024" required />
            </div>

            <div class="pyq-form-row-2">
              <div class="pyq-form-group">
                <label for="pyqYearInput" class="pyq-form-label">
                  Exam Year <span class="required-star">*</span>
                </label>
                <input type="number" id="pyqYearInput" name="exam_year" class="pyq-form-control" value="${new Date().getFullYear()}" min="2000" max="2035" required />
              </div>
              <div class="pyq-form-group">
                <label for="pyqSemesterInput" class="pyq-form-label">
                  Semester <span class="required-star">*</span>
                </label>
                <select id="pyqSemesterInput" name="semester" class="pyq-form-control">
                  <option value="Spring">Spring</option>
                  <option value="Fall">Fall</option>
                  <option value="Winter">Winter</option>
                  <option value="Summer">Summer</option>
                </select>
              </div>
            </div>

            <div class="pyq-form-group">
              <label for="pyqExamTypeInput" class="pyq-form-label">
                Exam Type <span class="required-star">*</span>
              </label>
              <select id="pyqExamTypeInput" name="exam_type" class="pyq-form-control">
                <option value="End-Semester">End-Semester</option>
                <option value="Mid-Semester">Mid-Semester</option>
                <option value="Internal">Internal Assessment</option>
                <option value="Model">Model Question Paper</option>
              </select>
            </div>

            <div class="pyq-form-group">
              <label class="pyq-form-label">
                Question Paper PDF <span class="required-star">*</span>
              </label>
              <input type="file" id="pyqFileInput" name="file" accept=".pdf,application/pdf" style="display: none;" required />
              
              <div class="pyq-file-dropzone" id="pyqDropzone" role="button" tabindex="0" aria-label="Upload question paper PDF">
                <svg class="pyq-file-dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span class="pyq-file-dropzone-title">Click to browse or drag &amp; drop PDF here</span>
                <span class="pyq-file-dropzone-hint">Strictly PDF files up to 50MB</span>
              </div>

              <div class="pyq-file-selected-pill" id="pyqSelectedFilePill" style="display: none;">
                <div class="pyq-file-selected-info">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="color: #0F766E; flex-shrink: 0;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <span class="pyq-file-selected-name" id="pyqSelectedFileName"></span>
                  <span class="pyq-file-selected-size" id="pyqSelectedFileSize"></span>
                </div>
                <button type="button" class="pyq-file-remove-btn" id="pyqRemoveFileBtn" title="Remove selected file" aria-label="Remove selected file">&times;</button>
              </div>
            </div>

            <div class="pyq-error-banner" id="pyqErrorBanner" style="display: none;" role="alert"></div>
          </div>
          <div class="pyq-modal-footer">
            <button type="button" class="btn btn-secondary" id="cancelPyqBtn">Cancel</button>
            <button type="submit" class="btn btn-primary" id="submitPyqBtn">Upload &amp; Extract</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => {
      if (isUploading) return;
      window.removeEventListener('keydown', keydownHandler);
      overlay.remove();
      unlockBodyScroll();
      if (previousFocus && typeof previousFocus.focus === 'function') {
        previousFocus.focus();
      }
    };

    const keydownHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === 'Tab') {
        const focusables = overlay.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', keydownHandler);

    const closeBtn = overlay.querySelector('#closePyqModalBtn');
    const cancelBtn = overlay.querySelector('#cancelPyqBtn');
    const submitBtn = overlay.querySelector('#submitPyqBtn');
    const form = overlay.querySelector('#uploadPyqForm');
    const titleInput = overlay.querySelector('#pyqTitleInput');
    const yearInput = overlay.querySelector('#pyqYearInput');
    const semesterSelect = overlay.querySelector('#pyqSemesterInput');
    const examTypeSelect = overlay.querySelector('#pyqExamTypeInput');
    const fileInput = overlay.querySelector('#pyqFileInput');
    const dropzone = overlay.querySelector('#pyqDropzone');
    const selectedPill = overlay.querySelector('#pyqSelectedFilePill');
    const selectedNameEl = overlay.querySelector('#pyqSelectedFileName');
    const selectedSizeEl = overlay.querySelector('#pyqSelectedFileSize');
    const removeFileBtn = overlay.querySelector('#pyqRemoveFileBtn');
    const errorBanner = overlay.querySelector('#pyqErrorBanner');

    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    const formatBytes = (bytes) => {
      if (!bytes || bytes <= 0) return '0 B';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const showError = (msg) => {
      errorBanner.innerHTML = `
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0; margin-top: 1px;"><circle cx="10" cy="10" r="8"/><line x1="10" y1="6" x2="10" y2="10"/><circle cx="10" cy="14" r="0.5"/></svg>
        <span>${escapeHtml(msg)}</span>
      `;
      errorBanner.style.display = 'flex';
    };

    const clearError = () => {
      errorBanner.innerHTML = '';
      errorBanner.style.display = 'none';
    };

    const applyFile = (file) => {
      clearError();
      if (!file) return;

      const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
      if (!isPdf) {
        showError('Invalid file format. Please select a PDF question paper.');
        return;
      }

      const maxSize = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSize) {
        showError(`Selected file is ${formatBytes(file.size)}, which exceeds the 50MB upload limit.`);
        return;
      }

      selectedPdfFile = file;
      selectedNameEl.textContent = file.name;
      selectedSizeEl.textContent = `(${formatBytes(file.size)})`;
      selectedPill.style.display = 'flex';
      dropzone.style.display = 'none';

      // Auto-populate Title if currently blank
      if (!titleInput.value.trim()) {
        const autoTitle = file.name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim();
        titleInput.value = autoTitle;
      }
    };

    const clearSelectedFile = () => {
      selectedPdfFile = null;
      fileInput.value = '';
      selectedPill.style.display = 'none';
      dropzone.style.display = 'flex';
    };

    removeFileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearSelectedFile();
    });

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        applyFile(fileInput.files[0]);
      }
    });

    // Drag and drop handlers
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });
    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        applyFile(e.dataTransfer.files[0]);
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError();

      const title = titleInput.value.trim();
      if (!title) {
        showError('Please enter a paper title or subject name.');
        titleInput.focus();
        return;
      }

      const yearVal = parseInt(yearInput.value, 10);
      if (isNaN(yearVal) || yearVal < 2000 || yearVal > 2035) {
        showError('Please enter a valid exam year between 2000 and 2035.');
        yearInput.focus();
        return;
      }

      if (!selectedPdfFile) {
        showError('Please select a question paper PDF to upload.');
        dropzone.focus();
        return;
      }

      isUploading = true;
      submitBtn.disabled = true;
      cancelBtn.disabled = true;
      closeBtn.disabled = true;
      titleInput.disabled = true;
      yearInput.disabled = true;
      semesterSelect.disabled = true;
      examTypeSelect.disabled = true;
      removeFileBtn.style.display = 'none';

      submitBtn.innerHTML = `
        <span class="spinner-sm" style="margin-right: 6px;"></span>
        Extracting Questions...
      `;

      const formData = new FormData();
      formData.append('title', title);
      formData.append('exam_year', yearInput.value.trim());
      formData.append('semester', semesterSelect.value);
      formData.append('exam_type', examTypeSelect.value);
      formData.append('file', selectedPdfFile);

      try {
        const apiBase = getApiBase();
        const token = getAuthToken();
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const res = await fetch(`${apiBase}/api/v1/exams/papers`, {
          method: 'POST',
          headers,
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || `Upload failed (HTTP ${res.status})`);
        }

        const data = await res.json();
        Toast.show(`Successfully extracted ${data.questions_extracted || 0} questions!`, 'success');
        isUploading = false;
        close();
        loadData();
      } catch (err) {
        const errMsg = err.message || 'Error processing question paper PDF';
        showError(errMsg);
        Toast.show(errMsg, 'error');

        // Re-enable form controls without discarding user data
        isUploading = false;
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Upload &amp; Extract';
        cancelBtn.disabled = false;
        closeBtn.disabled = false;
        titleInput.disabled = false;
        yearInput.disabled = false;
        semesterSelect.disabled = false;
        examTypeSelect.disabled = false;
        removeFileBtn.style.display = 'inline-flex';
      }
    });

    // Initial keyboard focus
    setTimeout(() => {
      titleInput.focus();
    }, 60);
  }

  // Event Listeners
  mountPoint.querySelector('#uploadPyqBtn')?.addEventListener('click', showUploadPyqModal);
  mountPoint.querySelector('#filterPaperSelect')?.addEventListener('change', renderQuestions);
  mountPoint.querySelector('#filterMarksSelect')?.addEventListener('change', renderQuestions);

  mountPoint.querySelector('#openVivaBtn')?.addEventListener('click', () => {
    router.navigate('/app/understanding', { tab: 'viva' });
  });

  // Initial load
  loadData();

  return () => {
    // cleanup
  };
}
