/**
 * ============================================================================
 * SYLLORA FACULTY CONSOLE VIEW (F14 Faculty Mode)
 * ============================================================================
 * Educator portal for question bank management, Bloom's Taxonomy categorization,
 * algorithmic exam paper blueprint generation, and cohort-level weak-topic analytics.
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

export function renderFaculty(mountPoint) {
  let activeTab = 'bank'; // 'bank' | 'blueprint' | 'analytics'
  let bloomFilter = 'all';
  let marksFilter = 'all';

  let questionBank = [];
  let weakTopics = [];
  let blueprintData = null;

  async function loadData() {
    try {
      const state = workspaceStore.getState();
      const courseId = state.course?.id;
      const q = courseId ? `?course_id=${encodeURIComponent(courseId)}` : '';
      
      const [questionsRes, weakRes] = await Promise.allSettled([
        apiFetch(`/api/v1/faculty/questions${q}`),
        apiFetch(`/api/v1/faculty/weak-topics${q}`)
      ]);

      if (questionsRes.status === 'fulfilled') {
        questionBank = questionsRes.value.questions || [];
      }
      if (weakRes.status === 'fulfilled') {
        weakTopics = weakRes.value.weak_topics || [];
      }
    } catch (err) {
      console.warn('[Faculty] Data load deferred:', err);
    }
    renderContent();
  }

  function renderContent() {
    mountPoint.innerHTML = `
      <div class="view-header" style="margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <h1 style="font-size: 26px; font-weight: 700; color: #14212B; margin: 0;">Faculty Exam Console</h1>
            <span class="badge" style="background: #E8F0FE; color: #1A73E8; font-weight: 600; padding: 3px 10px; border-radius: 20px; font-size: 12px;">Educator Mode</span>
          </div>
          <p style="font-size: 14px; color: #5F6F82; margin: 0;">Curate course question banks with Bloom's taxonomy tags, assemble balanced exam blueprints, and inspect aggregated cohort blindspots.</p>
        </div>
        <div style="display: flex; gap: 10px;">
          <button type="button" class="btn btn-primary" id="addQuestionBtn" style="display: inline-flex; align-items: center; gap: 6px;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Question
          </button>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div style="display: flex; gap: 8px; border-bottom: 1px solid #E2E8EE; margin-bottom: 24px; padding-bottom: 8px;">
        <button type="button" class="tab-pill ${activeTab === 'bank' ? 'active' : ''}" id="tabBankBtn" style="padding: 8px 16px; font-size: 13.5px; border-radius: 8px; cursor: pointer;">
          Question Bank (${questionBank.length})
        </button>
        <button type="button" class="tab-pill ${activeTab === 'blueprint' ? 'active' : ''}" id="tabBlueprintBtn" style="padding: 8px 16px; font-size: 13.5px; border-radius: 8px; cursor: pointer;">
          Exam Blueprint Generator
        </button>
        <button type="button" class="tab-pill ${activeTab === 'analytics' ? 'active' : ''}" id="tabAnalyticsBtn" style="padding: 8px 16px; font-size: 13.5px; border-radius: 8px; cursor: pointer;">
          Cohort Blindspot Diagnostics
        </button>
      </div>

      <div id="facultySubViewMount"></div>
    `;

    bindHeaderEvents();
    renderSubView();
  }

  function renderSubView() {
    const mount = mountPoint.querySelector('#facultySubViewMount');
    if (!mount) return;

    if (activeTab === 'bank') {
      renderBankTab(mount);
    } else if (activeTab === 'blueprint') {
      renderBlueprintTab(mount);
    } else {
      renderAnalyticsTab(mount);
    }
  }

  function renderBankTab(mount) {
    let filtered = [...questionBank];
    if (bloomFilter !== 'all') {
      filtered = filtered.filter(q => (q.bloom_taxonomy || '').toLowerCase() === bloomFilter.toLowerCase());
    }
    if (marksFilter !== 'all') {
      filtered = filtered.filter(q => String(q.marks) === marksFilter);
    }

    mount.innerHTML = `
      <div class="card" style="padding: 16px; border: 1px solid #E2E8EE; border-radius: 12px; margin-bottom: 20px; display: flex; gap: 16px; flex-wrap: wrap; align-items: center; justify-content: space-between;">
        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
          <label style="font-size: 13px; font-weight: 600; color: #5F6F82;">Bloom's Taxonomy:</label>
          <select id="bloomFilterSelect" class="filter-select" style="padding: 6px 12px; font-size: 13px; border-radius: 6px; border: 1px solid #CBD5E1;">
            <option value="all" ${bloomFilter === 'all' ? 'selected' : ''}>All Levels</option>
            <option value="remember" ${bloomFilter === 'remember' ? 'selected' : ''}>Remember (Recall)</option>
            <option value="understand" ${bloomFilter === 'understand' ? 'selected' : ''}>Understand (Explain)</option>
            <option value="apply" ${bloomFilter === 'apply' ? 'selected' : ''}>Apply (Execute)</option>
            <option value="analyze" ${bloomFilter === 'analyze' ? 'selected' : ''}>Analyze (Differentiate)</option>
            <option value="evaluate" ${bloomFilter === 'evaluate' ? 'selected' : ''}>Evaluate (Critique)</option>
            <option value="create" ${bloomFilter === 'create' ? 'selected' : ''}>Create (Design)</option>
          </select>

          <label style="font-size: 13px; font-weight: 600; color: #5F6F82; margin-left: 8px;">Marks:</label>
          <select id="marksFilterSelect" class="filter-select" style="padding: 6px 12px; font-size: 13px; border-radius: 6px; border: 1px solid #CBD5E1;">
            <option value="all" ${marksFilter === 'all' ? 'selected' : ''}>All Marks</option>
            <option value="2" ${marksFilter === '2' ? 'selected' : ''}>2 Marks</option>
            <option value="5" ${marksFilter === '5' ? 'selected' : ''}>5 Marks</option>
            <option value="10" ${marksFilter === '10' ? 'selected' : ''}>10 Marks</option>
            <option value="15" ${marksFilter === '15' ? 'selected' : ''}>15+ Marks</option>
          </select>
        </div>

        <div style="font-size: 13px; color: #5F6F82;">
          Showing <strong>${filtered.length}</strong> of ${questionBank.length} questions
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${filtered.length === 0 ? `
          <div class="card empty-state-box" style="padding: 48px 24px; text-align: center; border: 1px solid #E2E8EE; border-radius: 12px;">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#64748B" stroke-width="1.5" style="margin: 0 auto 12px;">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            <h3 style="font-size: 16px; font-weight: 600; color: #1E293B;">No questions match filter</h3>
            <p style="color: #64748B; font-size: 13.5px; margin-bottom: 16px;">Add questions manually or upload past papers to populate the bank.</p>
            <button type="button" class="btn btn-primary" id="emptyAddBtn">+ Add New Question</button>
          </div>
        ` : filtered.map(q => {
          const bloom = q.bloom_taxonomy || 'understand';
          let bloomColor = '#1A73E8';
          let bloomBg = '#E8F0FE';
          if (bloom === 'remember') { bloomColor = '#059669'; bloomBg = '#ECFDF5'; }
          if (bloom === 'apply') { bloomColor = '#D97706'; bloomBg = '#FEF3C7'; }
          if (bloom === 'analyze' || bloom === 'evaluate') { bloomColor = '#7C3AED'; bloomBg = '#EDE9FE'; }
          if (bloom === 'create') { bloomColor = '#DC2626'; bloomBg = '#FEE2E2'; }

          return `
            <div class="card" style="padding: 18px; border: 1px solid #E2E8EE; border-radius: 12px; background: #FFFFFF; display: flex; flex-direction: column; gap: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; gap: 8px; align-items: center;">
                  <span class="badge" style="background: ${bloomBg}; color: ${bloomColor}; font-weight: 600; padding: 2px 8px; border-radius: 6px; font-size: 11.5px; text-transform: uppercase;">
                    ${escapeHtml(bloom)}
                  </span>
                  <span class="badge" style="background: #F1F5F9; color: #475569; font-weight: 600; padding: 2px 8px; border-radius: 6px; font-size: 11.5px;">
                    ${q.marks} Marks
                  </span>
                  <span style="font-size: 12px; color: #64748B;">Unit: <strong>${escapeHtml(q.unit || 'General')}</strong></span>
                </div>
                <div style="font-size: 12px; color: #94A3B8;">
                  ${q.topic_title ? `Topic: ${escapeHtml(q.topic_title)}` : ''}
                </div>
              </div>

              <div style="font-size: 14.5px; color: #1E293B; line-height: 1.5; font-weight: 500;">
                ${escapeHtml(q.question_text)}
              </div>

              ${q.model_answer ? `
                <details style="font-size: 13px; color: #475569; background: #F8FAFC; padding: 8px 12px; border-radius: 6px; border: 1px solid #E2E8EE;">
                  <summary style="cursor: pointer; font-weight: 600; color: #03605E;">View Standard Solution Rubric</summary>
                  <p style="margin-top: 6px; white-space: pre-wrap; line-height: 1.4;">${escapeHtml(q.model_answer)}</p>
                </details>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;

    const bSelect = mount.querySelector('#bloomFilterSelect');
    if (bSelect) {
      bSelect.addEventListener('change', (e) => {
        bloomFilter = e.target.value;
        renderBankTab(mount);
      });
    }

    const mSelect = mount.querySelector('#marksFilterSelect');
    if (mSelect) {
      mSelect.addEventListener('change', (e) => {
        marksFilter = e.target.value;
        renderBankTab(mount);
      });
    }

    const emptyAdd = mount.querySelector('#emptyAddBtn');
    if (emptyAdd) {
      emptyAdd.addEventListener('click', openAddModal);
    }
  }

  function renderBlueprintTab(mount) {
    mount.innerHTML = `
      <div class="card" style="padding: 24px; border: 1px solid #E2E8EE; border-radius: 12px; margin-bottom: 24px; background: #FFFFFF;">
        <h3 style="font-size: 17px; font-weight: 700; color: #1E293B; margin-top: 0; margin-bottom: 8px;">Exam Paper Blueprint Generator</h3>
        <p style="font-size: 13.5px; color: #64748B; margin-bottom: 20px;">Synthesize a balanced examination paper automatically adhering to mark totals, syllabus unit distribution, and cognitive complexity.</p>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 20px;">
          <div>
            <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px;">Total Exam Marks:</label>
            <select id="bpTotalMarks" class="filter-select" style="width: 100%; padding: 8px 12px; border: 1px solid #CBD5E1; border-radius: 8px;">
              <option value="50">50 Marks (Mid-Term Assessment)</option>
              <option value="100" selected>100 Marks (End-Semester Exam)</option>
            </select>
          </div>

          <div>
            <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px;">Part A (Short - 2 Marks):</label>
            <input type="number" id="bpPartACount" value="10" min="0" max="20" style="width: 100%; padding: 8px 12px; border: 1px solid #CBD5E1; border-radius: 8px;">
          </div>

          <div>
            <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px;">Part B (Analytical - 10/16 Marks):</label>
            <input type="number" id="bpPartBCount" value="5" min="1" max="10" style="width: 100%; padding: 8px 12px; border: 1px solid #CBD5E1; border-radius: 8px;">
          </div>
        </div>

        <button type="button" class="btn btn-primary" id="generateBlueprintBtn" style="display: inline-flex; align-items: center; gap: 8px;">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
          Assemble Exam Paper Blueprint
        </button>
      </div>

      <div id="blueprintResultsContainer">
        ${blueprintData ? renderBlueprintResults(blueprintData) : `
          <div class="card empty-state-box" style="padding: 40px; text-align: center; border: 1px solid #E2E8EE; border-radius: 12px;">
            <p style="color: #64748B; font-size: 14px; margin: 0;">Configure parameters above and click <strong>Assemble Exam Paper Blueprint</strong> to synthesize sections.</p>
          </div>
        `}
      </div>
    `;

    const genBtn = mount.querySelector('#generateBlueprintBtn');
    if (genBtn) {
      genBtn.addEventListener('click', async () => {
        genBtn.disabled = true;
        genBtn.textContent = 'Assembling blueprint...';
        try {
          const totalMarks = parseInt(mount.querySelector('#bpTotalMarks').value, 10);
          const partACount = parseInt(mount.querySelector('#bpPartACount').value, 10);
          const partBCount = parseInt(mount.querySelector('#bpPartBCount').value, 10);

          const state = workspaceStore.getState();
          const res = await apiFetch('/api/v1/faculty/generate-blueprint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              course_id: state.course?.id || null,
              total_marks: totalMarks,
              section_config: {
                part_a_questions: partACount,
                part_b_questions: partBCount
              }
            })
          });

          blueprintData = res;
          Toast.show(`Generated ${res.total_marks}-mark balanced blueprint!`, 'success');
          const resMount = mount.querySelector('#blueprintResultsContainer');
          if (resMount) resMount.innerHTML = renderBlueprintResults(res);
        } catch (err) {
          Toast.show(`Blueprint generation failed: ${err.message}`, 'error');
        } finally {
          genBtn.disabled = false;
          genBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            Assemble Exam Paper Blueprint
          `;
        }
      });
    }
  }

  function renderBlueprintResults(data) {
    return `
      <div class="card" style="padding: 24px; border: 1px solid #03605E; border-radius: 12px; background: #FFFFFF; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #E2E8EE; padding-bottom: 12px; margin-bottom: 16px;">
          <div>
            <h3 style="font-size: 18px; font-weight: 700; color: #14212B; margin: 0;">${escapeHtml(data.exam_title || 'Synthesized Exam Paper')}</h3>
            <span style="font-size: 13px; color: #5F6F82;">Total Marks: <strong>${data.total_marks}</strong> • Duration: 3 Hours</span>
          </div>
          <span class="badge" style="background: #E6F4F2; color: #03605E; font-weight: 700; padding: 4px 12px; border-radius: 20px; font-size: 13px;">
            Verified Balanced
          </span>
        </div>

        ${(data.sections || []).map(sec => `
          <div style="margin-bottom: 20px;">
            <div style="background: #F8FAFC; padding: 8px 12px; border-radius: 6px; font-weight: 700; font-size: 14px; color: #1E293B; margin-bottom: 10px;">
              ${escapeHtml(sec.name)} (${sec.instructions || ''})
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${(sec.questions || []).map((q, idx) => `
                <div style="padding: 10px 14px; border: 1px solid #E2E8EE; border-radius: 8px; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                  <div style="font-size: 14px; color: #1E293B; line-height: 1.4;">
                    <strong>Q${idx + 1}.</strong> ${escapeHtml(q.question_text)}
                  </div>
                  <div style="display: flex; gap: 6px; align-items: center; flex-shrink: 0;">
                    <span class="badge" style="background: #F1F5F9; color: #475569; font-weight: 600; font-size: 11.5px; padding: 2px 8px; border-radius: 4px;">
                      [${q.marks}M]
                    </span>
                    <span class="badge" style="background: #E8F0FE; color: #1A73E8; font-size: 11px; padding: 2px 6px; border-radius: 4px;">
                      ${escapeHtml(q.bloom_taxonomy || 'Bloom')}
                    </span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderAnalyticsTab(mount) {
    mount.innerHTML = `
      <div class="card" style="padding: 20px; border: 1px solid #E2E8EE; border-radius: 12px; background: #FFFFFF; margin-bottom: 24px;">
        <h3 style="font-size: 16.5px; font-weight: 700; color: #14212B; margin-top: 0; margin-bottom: 6px;">Course Cohort Diagnostics</h3>
        <p style="font-size: 13.5px; color: #5F6F82; margin-bottom: 16px;">Aggregated weakness distribution and common misconception topics across enrolled students. (Anonymized privacy-first data).</p>

        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${weakTopics.length === 0 ? `
            <div style="text-align: center; padding: 32px; color: #64748B;">
              No significant cohort blindspots detected yet. Student assessment attempts will populate this diagnostic.
            </div>
          ` : weakTopics.map(item => `
            <div style="padding: 14px; border: 1px solid #E2E8EE; border-radius: 10px; background: #FFFFFF; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
              <div>
                <div style="font-size: 14.5px; font-weight: 600; color: #1E293B;">${escapeHtml(item.topic_title || 'Topic')}</div>
                <div style="font-size: 12.5px; color: #64748B;">Unit: ${escapeHtml(item.unit || 'General')} • ${item.misconception_count || 0} Open Student Misconceptions</div>
              </div>
              <div style="display: flex; gap: 12px; align-items: center;">
                <div style="text-align: right;">
                  <div style="font-size: 14px; font-weight: 700; color: ${item.mastery_rate < 50 ? '#DC2626' : '#D97706'};">
                    ${item.mastery_rate !== undefined ? `${item.mastery_rate}% Mastery` : 'Needs Review'}
                  </div>
                  <div style="font-size: 11.5px; color: #94A3B8;">${item.attempts || 0} submissions</div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function bindHeaderEvents() {
    const tabBank = mountPoint.querySelector('#tabBankBtn');
    const tabBlueprint = mountPoint.querySelector('#tabBlueprintBtn');
    const tabAnalytics = mountPoint.querySelector('#tabAnalyticsBtn');
    const addBtn = mountPoint.querySelector('#addQuestionBtn');

    if (tabBank) tabBank.addEventListener('click', () => { activeTab = 'bank'; renderContent(); });
    if (tabBlueprint) tabBlueprint.addEventListener('click', () => { activeTab = 'blueprint'; renderContent(); });
    if (tabAnalytics) tabAnalytics.addEventListener('click', () => { activeTab = 'analytics'; renderContent(); });

    if (addBtn) addBtn.addEventListener('click', openAddModal);
  }

  function openAddModal() {
    Modal.open(
      'Add Question to Faculty Bank',
      `
        <div style="display: flex; flex-direction: column; gap: 14px;">
          <div>
            <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Question Text:</label>
            <textarea id="modalQText" class="form-input" rows="3" placeholder="Enter clear, exam-oriented question text..." style="width: 100%; box-sizing: border-box;"></textarea>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Marks:</label>
              <select id="modalQMarks" class="form-input" style="width: 100%;">
                <option value="2">2 Marks</option>
                <option value="5" selected>5 Marks</option>
                <option value="10">10 Marks</option>
                <option value="16">16 Marks</option>
              </select>
            </div>

            <div>
              <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Bloom's Taxonomy:</label>
              <select id="modalQBloom" class="form-input" style="width: 100%;">
                <option value="remember">Remember (Knowledge)</option>
                <option value="understand" selected>Understand (Comprehension)</option>
                <option value="apply">Apply (Application)</option>
                <option value="analyze">Analyze (Analysis)</option>
                <option value="evaluate">Evaluate (Evaluation)</option>
                <option value="create">Create (Synthesis)</option>
              </select>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Unit / Module:</label>
              <input type="text" id="modalQUnit" class="form-input" placeholder="e.g. Unit 3" style="width: 100%; box-sizing: border-box;">
            </div>
            <div>
              <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Topic Name:</label>
              <input type="text" id="modalQTopic" class="form-input" placeholder="e.g. Memory Management" style="width: 100%; box-sizing: border-box;">
            </div>
          </div>

          <div>
            <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">Standard Rubric / Model Answer (Optional):</label>
            <textarea id="modalQAnswer" class="form-input" rows="2" placeholder="Key expected concepts..." style="width: 100%; box-sizing: border-box;"></textarea>
          </div>
        </div>
      `,
      async () => {
        const text = document.getElementById('modalQText').value.trim();
        const marks = parseInt(document.getElementById('modalQMarks').value, 10);
        const bloom = document.getElementById('modalQBloom').value;
        const unit = document.getElementById('modalQUnit').value.trim() || 'General';
        const topic = document.getElementById('modalQTopic').value.trim() || 'General';
        const modelAns = document.getElementById('modalQAnswer').value.trim();

        if (!text) {
          Toast.show('Question text is required', 'error');
          return;
        }

        try {
          const state = workspaceStore.getState();
          const res = await apiFetch('/api/v1/faculty/questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question_text: text,
              marks,
              bloom_taxonomy: bloom,
              unit,
              topic_title: topic,
              model_answer: modelAns || null,
              course_id: state.course?.id || null
            })
          });

          questionBank.unshift(res.question || {
            id: res.id,
            question_text: text,
            marks,
            bloom_taxonomy: bloom,
            unit,
            topic_title: topic,
            model_answer: modelAns
          });

          Toast.show('Question added to faculty question bank!', 'success');
          renderSubView();
        } catch (err) {
          Toast.show(`Failed to add question: ${err.message}`, 'error');
        }
      },
      'Save to Bank'
    );
  }

  loadData();
}
