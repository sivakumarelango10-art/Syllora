/**
 * ============================================================================
 * SYLLORA EXAM INTELLIGENCE VIEW (F1 Past-Paper Intelligence & Exam Practice)
 * ============================================================================
 * Past-paper question extraction, repetition frequency analytics, unit heatmap,
 * marks distribution, note-evidence linking, and active recall practice.
 */

import { router } from '../router.js';
import { workspaceStore } from '../state.js';
import { Toast, Modal } from '../components/modal.js';
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
    const modalEl = document.createElement('div');
    modalEl.className = 'modal-backdrop';
    modalEl.innerHTML = `
      <div class="modal" style="max-width: 650px; width: 90%;">
        <div class="modal-header">
          <h3 class="modal-title">Supporting Notes Evidence</h3>
          <button type="button" class="modal-close" id="closeEvidenceModal">&times;</button>
        </div>
        <div class="modal-body" id="evidenceModalBody">
          <div style="text-align: center; padding: 20px; color: #64748B;">Searching your uploaded study materials...</div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="closeEvidenceBtn">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);

    const close = () => {
      modalEl.remove();
    };
    modalEl.querySelector('#closeEvidenceModal').addEventListener('click', close);
    modalEl.querySelector('#closeEvidenceBtn').addEventListener('click', close);

    try {
      // Trigger live link evidence scan
      const res = await apiFetch(`/api/v1/exams/questions/${encodeURIComponent(questionId)}/evidence`, { method: 'POST' });
      const evidence = res.evidence || [];
      const body = modalEl.querySelector('#evidenceModalBody');

      if (evidence.length === 0) {
        body.innerHTML = `
          <div style="text-align: center; padding: 20px; color: #64748B;">
            <p style="margin-bottom: 8px;">No matching passages found in your uploaded study notes for this question.</p>
            <p style="font-size: 12.5px; color: #94A3B8;">Upload relevant lecture slides or notes in Study Materials to generate page citations.</p>
          </div>
        `;
      } else {
        body.innerHTML = `
          <div style="font-size: 13px; color: #475569; margin-bottom: 12px;">Top verified passages retrieved from your personal study notes:</div>
          <div style="display: flex; flex-direction: column; gap: 10px; max-height: 400px; overflow-y: auto;">
            ${evidence.map((e, idx) => `
              <div style="padding: 12px; background: #F8FAFC; border: 1px solid #E2E8EE; border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                  <span style="font-weight: 600; font-size: 12.5px; color: #03605E;">${escapeHtml(e.document_title || e.filename)}</span>
                  <span class="badge" style="background: #E2E8F0; color: #334155; font-size: 11px;">Page ${e.page_number}</span>
                </div>
                <p style="font-size: 13px; color: #334155; margin: 0; line-height: 1.5; font-style: italic;">"${escapeHtml(e.excerpt)}"</p>
              </div>
            `).join('')}
          </div>
        `;
      }
    } catch (err) {
      modalEl.querySelector('#evidenceModalBody').innerHTML = `<div style="color: #E11D48; text-align: center; padding: 20px;">Failed to retrieve evidence: ${escapeHtml(err.message)}</div>`;
    }
  }

  // Upload PYQ Modal
  function showUploadPyqModal() {
    const modalEl = document.createElement('div');
    modalEl.className = 'modal-backdrop';
    modalEl.innerHTML = `
      <div class="modal" style="max-width: 520px; width: 90%;">
        <div class="modal-header">
          <h3 class="modal-title">Upload Past-Year Question Paper</h3>
          <button type="button" class="modal-close" id="closePyqModal">&times;</button>
        </div>
        <form id="uploadPyqForm">
          <div class="modal-body" style="display: flex; flex-direction: column; gap: 14px;">
            <div>
              <label class="label" style="font-size: 13px; font-weight: 600;">Paper Title / Subject</label>
              <input type="text" name="title" class="input" placeholder="e.g. Operating Systems End-Semester 2024" required style="width: 100%;" />
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div>
                <label class="label" style="font-size: 13px; font-weight: 600;">Exam Year</label>
                <input type="number" name="exam_year" class="input" value="${new Date().getFullYear()}" min="2000" max="2030" required style="width: 100%;" />
              </div>
              <div>
                <label class="label" style="font-size: 13px; font-weight: 600;">Semester</label>
                <select name="semester" class="input" style="width: 100%;">
                  <option value="Spring">Spring</option>
                  <option value="Fall">Fall</option>
                  <option value="Winter">Winter</option>
                  <option value="Summer">Summer</option>
                </select>
              </div>
            </div>
            <div>
              <label class="label" style="font-size: 13px; font-weight: 600;">Exam Type</label>
              <select name="exam_type" class="input" style="width: 100%;">
                <option value="End-Semester">End-Semester</option>
                <option value="Mid-Semester">Mid-Semester</option>
                <option value="Internal">Internal Assessment</option>
                <option value="Model">Model Question Paper</option>
              </select>
            </div>
            <div>
              <label class="label" style="font-size: 13px; font-weight: 600;">Question Paper PDF</label>
              <input type="file" name="file" accept=".pdf" class="input" required style="width: 100%;" />
            </div>
          </div>
          <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px;">
            <button type="button" class="btn btn-secondary" id="cancelPyqBtn">Cancel</button>
            <button type="submit" class="btn btn-primary" id="submitPyqBtn">Upload &amp; Extract</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modalEl);

    const close = () => modalEl.remove();
    modalEl.querySelector('#closePyqModal').addEventListener('click', close);
    modalEl.querySelector('#cancelPyqBtn').addEventListener('click', close);

    const form = modalEl.querySelector('#uploadPyqForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = modalEl.querySelector('#submitPyqBtn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Extracting Questions...';

      const formData = new FormData(form);
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
          throw new Error(errData.detail || 'Failed to upload paper');
        }

        const data = await res.json();
        Toast.success(`Successfully extracted ${data.questions_extracted || 0} questions!`);
        close();
        loadData();
      } catch (err) {
        Toast.error(err.message || 'Error processing question paper PDF');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload & Extract';
      }
    });
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
