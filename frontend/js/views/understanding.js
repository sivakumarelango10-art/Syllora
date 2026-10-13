/**
 * ============================================================================
 * VIEW: CHECK UNDERSTANDING (ASSESSMENT, EVALUATOR, TRY-FIRST & VIVA SIMULATOR)
 * ============================================================================
 * - Tab 1: Concept Explanation Check (Original rubric evaluation)
 * - Tab 2: Grade Written Answer (F3 Source-Grounded Answer Evaluator with custom marks)
 * - Tab 3: Try-First Mode (F5 Active recall exam practice with hints and model answer reveal)
 * - Tab 4: Viva Oral Simulator (F13 Spoken oral exam practice with live transcripts and follow-ups)
 */

import { workspaceStore } from '../state.js';
import { PdfReader } from '../components/pdfViewer.js';
import { Toast } from '../components/modal.js';
import { sylloraApi } from '../services/aiApi.js';

function escapeHtml(str) {
  if (typeof str !== 'string') return str || '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderUnderstanding(container, queryParams = {}) {
  const state = workspaceStore.getState();
  let activeTab = queryParams.tab || 'concept'; // 'concept' | 'grade' | 'tryfirst' | 'viva'
  let selectedTopicId = queryParams.topic || (state.topics[0] ? state.topics[0].id : 'top-3');
  let explanationInputText = workspaceStore.getDraft(`und_${selectedTopicId}`) || '';
  let activeEvaluation = null;

  // Grade Written Answer state (F3)
  let gradeQuestionText = queryParams.q || 'Explain the concept of deadlock prevention and contrast it with deadlock avoidance.';
  let gradeMarks = queryParams.marks ? parseInt(queryParams.marks, 10) : 5;
  let gradeAnswerText = '';
  let activeGradedResult = null;

  // Try-First Mode state (F5)
  let tryQuestionText = queryParams.q || 'Define paging and explain the role of the Translation Lookaside Buffer (TLB).';
  let tryMarks = queryParams.marks ? parseInt(queryParams.marks, 10) : 5;
  let tryAttemptText = '';
  let tryHintsRevealed = 0;
  let tryResult = null;
  let modelAnswerRevealed = false;

  // Viva Simulator state (F13)
  let vivaSession = null;
  let isListening = false;
  let recognitionInstance = null;
  let vivaTranscriptInput = '';

  function renderView() {
    if (!state.topics || state.topics.length === 0) {
      container.innerHTML = `
        <div class="view-understanding-page">
          <header class="page-header-row">
            <div class="header-text">
              <h1 class="page-title">Check Your Understanding</h1>
              <p class="page-desc">Explain key concepts in your own words, evaluate exam answers, and practice oral vivas.</p>
            </div>
          </header>
          <div class="card empty-state-box" style="padding: 48px 24px; text-align: center; border: 1px solid #E2E8EE; border-radius: 12px; background: #FFFFFF;">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#64748B" stroke-width="1.5" style="margin: 0 auto 16px;">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <h3>No syllabus topics available</h3>
            <p style="color: #64748B; margin-bottom: 20px;">To check your understanding and receive AI-guided rubric feedback, create topics in your Syllabus Map first.</p>
            <a href="#/app/syllabus" class="btn btn-primary">Go to Syllabus Map</a>
          </div>
        </div>
      `;
      return;
    }

    const topic = state.topics.find(t => t.id === selectedTopicId) || state.topics[0];

    container.innerHTML = `
      <div class="view-understanding-page">
        <header class="page-header-row" style="margin-bottom: 20px;">
          <div class="header-text">
            <h1 class="page-title" style="font-size: 26px; font-weight: 700; color: #14212B; margin: 0 0 4px;">Check Understanding &amp; Practice</h1>
            <p class="page-desc" style="font-size: 14px; color: #5F6F82; margin: 0;">Explain concepts in your own words, grade written answers against note rubrics, and practice oral vivas.</p>
          </div>
        </header>

        <!-- Subnav Mode Switcher Tabs -->
        <div class="tab-pill-group" style="margin-bottom: 24px; display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="button" class="tab-pill ${activeTab === 'concept' ? 'active' : ''}" id="tabConceptBtn" style="padding: 8px 16px; font-size: 13px; font-weight: 600; border-radius: 20px; border: 1px solid #CBD5E1; background: ${activeTab === 'concept' ? '#03605E' : '#FFFFFF'}; color: ${activeTab === 'concept' ? '#FFFFFF' : '#475569'}; cursor: pointer;">
            Concept Explanation Check
          </button>
          <button type="button" class="tab-pill ${activeTab === 'grade' ? 'active' : ''}" id="tabGradeBtn" style="padding: 8px 16px; font-size: 13px; font-weight: 600; border-radius: 20px; border: 1px solid #CBD5E1; background: ${activeTab === 'grade' ? '#03605E' : '#FFFFFF'}; color: ${activeTab === 'grade' ? '#FFFFFF' : '#475569'}; cursor: pointer;">
            Grade Written Answer (F3)
          </button>
          <button type="button" class="tab-pill ${activeTab === 'tryfirst' ? 'active' : ''}" id="tabTryFirstBtn" style="padding: 8px 16px; font-size: 13px; font-weight: 600; border-radius: 20px; border: 1px solid #CBD5E1; background: ${activeTab === 'tryfirst' ? '#03605E' : '#FFFFFF'}; color: ${activeTab === 'tryfirst' ? '#FFFFFF' : '#475569'}; cursor: pointer;">
            Try-First Active Recall (F5)
          </button>
          <button type="button" class="tab-pill ${activeTab === 'viva' ? 'active' : ''}" id="tabVivaBtn" style="padding: 8px 16px; font-size: 13px; font-weight: 600; border-radius: 20px; border: 1px solid #CBD5E1; background: ${activeTab === 'viva' ? '#03605E' : '#FFFFFF'}; color: ${activeTab === 'viva' ? '#FFFFFF' : '#475569'}; cursor: pointer;">
            Viva Simulator (F13)
          </button>
        </div>

        ${activeTab === 'concept' ? renderConceptTab(topic) : ''}
        ${activeTab === 'grade' ? renderGradeTab(topic) : ''}
        ${activeTab === 'tryfirst' ? renderTryFirstTab(topic) : ''}
        ${activeTab === 'viva' ? renderVivaTab(topic) : ''}
      </div>
    `;

    bindEvents();
  }

  // TAB 1: Concept Explanation Check
  function renderConceptTab(topic) {
    return `
      <div style="display: grid; grid-template-columns: 1fr; gap: 20px; max-width: 880px;">
        <div class="card" style="padding: 24px; border: 1px solid #E2E8EE; border-radius: 12px; background: #FFFFFF;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <label style="font-size: 13px; font-weight: 600; color: #475569;">Topic:</label>
              <select id="understandingTopicSelect" class="input" style="padding: 6px 12px; font-size: 13px; border-radius: 8px; border: 1px solid #CBD5E1;">
                ${state.topics.map(t => `<option value="${t.id}" ${t.id === selectedTopicId ? 'selected' : ''}>${escapeHtml(t.title)}</option>`).join('')}
              </select>
            </div>
            <span class="badge" style="background: #E6F4F2; color: #03605E; font-weight: 600; font-size: 11.5px;">Rubric Grounded</span>
          </div>

          <h2 id="understandingQuestionTitle" style="font-size: 18px; font-weight: 700; color: #14212B; margin: 0 0 8px;">
            Explain the fundamental requirements and operating system implications of: ${escapeHtml(topic.title)}.
          </h2>
          <p style="font-size: 13.5px; color: #5F6F82; margin: 0 0 16px;">
            Explain the concept in your own words. Focus on core mechanisms, trade-offs, and practical academic applications.
          </p>

          <div style="margin-bottom: 16px;">
            <label class="form-label" style="font-size: 13px; font-weight: 600; margin-bottom: 6px; display: block;">Your Explanation:</label>
            <textarea id="studentExplanationInput" class="input" rows="5" style="width: 100%; padding: 12px; font-size: 14px; border-radius: 8px; border: 1px solid #CBD5E1;" placeholder="Write your explanation here...">${escapeHtml(explanationInputText)}</textarea>
            <div style="display: flex; justify-content: space-between; margin-top: 4px;">
              <span id="charCounter" style="font-size: 12px; color: #8C9BAE;">0 characters</span>
              <span style="font-size: 12px; color: #8C9BAE;">Saved across views</span>
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button type="button" class="btn btn-secondary" id="clearExplanationBtn">Clear</button>
            <button type="button" class="btn btn-primary" id="submitExplanationBtn">Submit for Rubric Feedback</button>
          </div>
        </div>

        ${activeEvaluation ? renderEvaluationResult(activeEvaluation, topic) : ''}
      </div>
    `;
  }

  function renderEvaluationResult(evalData, topic) {
    return `
      <div class="card" id="evaluationResultCard" style="padding: 24px; border: 1px solid #E2E8EE; border-radius: 12px; background: #FFFFFF;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 style="font-size: 18px; font-weight: 700; color: #14212B; margin: 0 0 4px;">${escapeHtml(evalData.headline)}</h3>
            <span style="font-size: 12px; color: #64748B;">Evaluated against course notes using Syllora AI</span>
          </div>
          <div style="background: ${evalData.score >= 3 ? '#E6F4F2' : evalData.score === 2 ? '#FEF3C7' : '#FEE2E2'}; color: ${evalData.score >= 3 ? '#03605E' : evalData.score === 2 ? '#92400E' : '#B91C1C'}; font-weight: 700; font-size: 16px; padding: 6px 14px; border-radius: 20px;">
            Score: ${evalData.score} / 3
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 16px;">
          <div style="background: #F8FAFC; border: 1px solid #E2E8EE; border-radius: 8px; padding: 12px;">
            <span style="font-size: 11.5px; font-weight: 600; color: #64748B; text-transform: uppercase;">Conceptual Accuracy</span>
            <p style="font-size: 13px; color: #334155; margin: 4px 0 0;">${escapeHtml(evalData.rubric.conceptualAccuracy)}</p>
          </div>
          <div style="background: #F8FAFC; border: 1px solid #E2E8EE; border-radius: 8px; padding: 12px;">
            <span style="font-size: 11.5px; font-weight: 600; color: #64748B; text-transform: uppercase;">Essential Points</span>
            <p style="font-size: 13px; color: #334155; margin: 4px 0 0;">${escapeHtml(evalData.rubric.essentialPoints)}</p>
          </div>
          <div style="background: #F8FAFC; border: 1px solid #E2E8EE; border-radius: 8px; padding: 12px;">
            <span style="font-size: 11.5px; font-weight: 600; color: #64748B; text-transform: uppercase;">Reasoning Quality</span>
            <p style="font-size: 13px; color: #334155; margin: 4px 0 0;">${escapeHtml(evalData.rubric.reasoning)}</p>
          </div>
        </div>

        ${evalData.missingPoints.length > 0 ? `
          <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
            <h5 style="font-size: 13px; font-weight: 700; color: #92400E; margin: 0 0 8px;">Key Missing Essential Points:</h5>
            <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #78350F;">
              ${evalData.missingPoints.map(p => `<li>${escapeHtml(p)}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="btn btn-secondary btn-sm" id="reviseAndResubmitBtn">Revise &amp; Resubmit</button>
          <button type="button" class="btn btn-primary btn-sm" id="saveToNotebookBtn">Save to Misconception Notebook</button>
        </div>
      </div>
    `;
  }

  // TAB 2: Grade Written Answer (F3)
  function renderGradeTab(topic) {
    return `
      <div style="display: grid; grid-template-columns: 1fr; gap: 20px; max-width: 880px;">
        <div class="card" style="padding: 24px; border: 1px solid #E2E8EE; border-radius: 12px; background: #FFFFFF;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
            <h3 style="font-size: 18px; font-weight: 700; color: #14212B; margin: 0;">Source-Grounded Answer Evaluator</h3>
            <span class="badge" style="background: #E6F4F2; color: #03605E; font-weight: 600;">Feature F3</span>
          </div>

          <div style="margin-bottom: 14px;">
            <label class="form-label" style="font-size: 13px; font-weight: 600; margin-bottom: 4px; display: block;">Exam Question:</label>
            <input type="text" id="gradeQuestionInput" class="input" style="width: 100%; padding: 10px 12px; font-size: 14px; border-radius: 8px; border: 1px solid #CBD5E1;" value="${escapeHtml(gradeQuestionText)}" />
          </div>

          <div style="display: flex; gap: 12px; margin-bottom: 14px;">
            <div>
              <label class="form-label" style="font-size: 12.5px; font-weight: 600; margin-bottom: 4px; display: block;">Allocated Marks:</label>
              <select id="gradeMarksSelect" class="input" style="padding: 6px 12px; font-size: 13px; border-radius: 8px; border: 1px solid #CBD5E1;">
                <option value="2" ${gradeMarks === 2 ? 'selected' : ''}>2 Marks</option>
                <option value="5" ${gradeMarks === 5 ? 'selected' : ''}>5 Marks</option>
                <option value="10" ${gradeMarks === 10 ? 'selected' : ''}>10 Marks</option>
                <option value="15" ${gradeMarks === 15 ? 'selected' : ''}>15 Marks</option>
              </select>
            </div>
          </div>

          <div style="margin-bottom: 16px;">
            <label class="form-label" style="font-size: 13px; font-weight: 600; margin-bottom: 4px; display: block;">Your Written Answer:</label>
            <textarea id="gradeAnswerInput" class="input" rows="6" style="width: 100%; padding: 12px; font-size: 14px; border-radius: 8px; border: 1px solid #CBD5E1;" placeholder="Paste or type your complete exam answer here...">${escapeHtml(gradeAnswerText)}</textarea>
          </div>

          <div style="display: flex; justify-content: flex-end;">
            <button type="button" class="btn btn-primary" id="submitGradeBtn">Grade My Answer against Notes</button>
          </div>
        </div>

        ${activeGradedResult ? renderGradedFeedbackCard(activeGradedResult) : ''}
      </div>
    `;
  }

  function renderGradedFeedbackCard(res) {
    return `
      <div class="card" style="padding: 24px; border: 1px solid #E2E8EE; border-radius: 12px; background: #FFFFFF;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 style="font-size: 18px; font-weight: 700; color: #14212B; margin: 0 0 4px;">Examiner Evaluation &amp; Mark Band</h3>
            <span style="font-size: 12px; color: #64748B;">Provisional academic score based on verified course evidence</span>
          </div>
          <div style="background: #E6F4F2; color: #03605E; font-weight: 700; font-size: 18px; padding: 8px 16px; border-radius: 20px;">
            ${res.score_awarded} / ${res.max_marks} Marks (${res.percentage}%)
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 16px;">
          <div style="background: #F8FAFC; border: 1px solid #E2E8EE; border-radius: 8px; padding: 10px;">
            <div style="font-size: 11px; font-weight: 600; color: #64748B;">Accuracy: ${res.rubric_breakdown?.conceptual_accuracy || '3.5'}/4.0</div>
          </div>
          <div style="background: #F8FAFC; border: 1px solid #E2E8EE; border-radius: 8px; padding: 10px;">
            <div style="font-size: 11px; font-weight: 600; color: #64748B;">Point Coverage: ${res.rubric_breakdown?.point_coverage || '2.5'}/3.0</div>
          </div>
          <div style="background: #F8FAFC; border: 1px solid #E2E8EE; border-radius: 8px; padding: 10px;">
            <div style="font-size: 11px; font-weight: 600; color: #64748B;">Structure &amp; Depth: ${res.rubric_breakdown?.structure_depth || '1.5'}/2.0</div>
          </div>
        </div>

        ${res.covered_points && res.covered_points.length > 0 ? `
          <div style="margin-bottom: 12px;">
            <h5 style="font-size: 13px; font-weight: 700; color: #03605E; margin: 0 0 6px;">✓ Key Points Covered:</h5>
            <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #334155;">
              ${res.covered_points.map(p => `<li>${escapeHtml(p)}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        ${res.missing_points && res.missing_points.length > 0 ? `
          <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
            <h5 style="font-size: 13px; font-weight: 700; color: #92400E; margin: 0 0 6px;">⚠ Missing Important Points:</h5>
            <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #78350F;">
              ${res.missing_points.map(p => `<li>${escapeHtml(p)}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        <div style="background: #F8FAFC; border: 1px solid #E2E8EE; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
          <h5 style="font-size: 13px; font-weight: 700; color: #1E293B; margin: 0 0 4px;">Examiner Feedback:</h5>
          <p style="font-size: 13px; color: #475569; margin: 0; line-height: 1.5;">${escapeHtml(res.feedback)}</p>
        </div>

        <div style="display: flex; justify-content: flex-end;">
          <button type="button" class="btn btn-secondary btn-sm" id="logToMisconceptionsFromGradeBtn">Log Misconceptions to Notebook</button>
        </div>
      </div>
    `;
  }

  // TAB 3: Try-First Mode (F5)
  function renderTryFirstTab(topic) {
    const hints = [
      "Hint 1: Consider how the operating system separates logical addresses from physical memory frames.",
      "Hint 2: Remember that the TLB serves as an associative hardware cache to avoid double memory access per reference."
    ];

    return `
      <div style="display: grid; grid-template-columns: 1fr; gap: 20px; max-width: 880px;">
        <div class="card" style="padding: 24px; border: 1px solid #E2E8EE; border-radius: 12px; background: #FFFFFF;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="badge" style="background: #FEF3C7; color: #92400E; font-weight: 700; font-size: 12px;">Active Recall</span>
              <span class="badge" style="background: #F1F5F9; color: #334155; font-size: 12px;">${tryMarks} Marks Question</span>
            </div>
            <span style="font-size: 12px; color: #64748B;">Try answering before viewing the AI model answer</span>
          </div>

          <h3 style="font-size: 18px; font-weight: 700; color: #14212B; margin: 0 0 12px; line-height: 1.4;">
            ${escapeHtml(tryQuestionText)}
          </h3>

          <!-- Hints Progressive Disclosure -->
          <div style="margin-bottom: 16px;">
            ${tryHintsRevealed > 0 ? `
              <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 12px; margin-bottom: 10px;">
                ${hints.slice(0, tryHintsRevealed).map(h => `<div style="font-size: 13px; color: #166534; margin-bottom: 4px;">💡 ${escapeHtml(h)}</div>`).join('')}
              </div>
            ` : ''}
            ${tryHintsRevealed < hints.length ? `
              <button type="button" class="btn btn-secondary btn-xs" id="revealNextHintBtn">
                💡 Need a hint? Reveal Hint ${tryHintsRevealed + 1}
              </button>
            ` : ''}
          </div>

          <div style="margin-bottom: 16px;">
            <label class="form-label" style="font-size: 13px; font-weight: 600; margin-bottom: 4px; display: block;">Your Recall Attempt:</label>
            <textarea id="tryAttemptInput" class="input" rows="5" style="width: 100%; padding: 12px; font-size: 14px; border-radius: 8px; border: 1px solid #CBD5E1;" placeholder="Write your recall attempt from memory here...">${escapeHtml(tryAttemptText)}</textarea>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button type="button" class="btn btn-primary" id="submitTryAttemptBtn">Submit Attempt &amp; Compare Model Answer</button>
          </div>
        </div>

        ${tryResult ? renderTryResultCard(tryResult) : ''}
      </div>
    `;
  }

  function renderTryResultCard(res) {
    return `
      <div class="card" style="padding: 24px; border: 1px solid #E2E8EE; border-radius: 12px; background: #FFFFFF;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 style="font-size: 18px; font-weight: 700; color: #14212B; margin: 0;">Your Attempt vs. Notes Evidence</h3>
          <span class="badge" style="background: #E6F4F2; color: #03605E; font-size: 14px; font-weight: 700; padding: 4px 12px; border-radius: 14px;">
            Attempt Score: ${res.score} / ${tryMarks}
          </span>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
          <div style="background: #F8FAFC; border: 1px solid #E2E8EE; border-radius: 8px; padding: 14px;">
            <h5 style="font-size: 13px; font-weight: 700; color: #475569; margin: 0 0 8px;">Your Submitted Attempt:</h5>
            <p style="font-size: 13px; color: #334155; margin: 0; line-height: 1.5; font-style: italic;">"${escapeHtml(tryAttemptText)}"</p>
          </div>
          <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 14px;">
            <h5 style="font-size: 13px; font-weight: 700; color: #166534; margin: 0 0 8px;">Grounded University Key Points:</h5>
            <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #14532D; line-height: 1.5;">
              <li>Paging divides logical memory into equal blocks called pages.</li>
              <li>TLB is an associative hardware cache mapping virtual page numbers to physical frame numbers in one cycle.</li>
              <li>A TLB miss triggers a page table walk in main memory, adding overhead.</li>
            </ul>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="btn btn-primary btn-sm" id="scheduleTryRevisionBtn">Schedule in Revision Planner</button>
        </div>
      </div>
    `;
  }

  // TAB 4: Viva Oral Simulator (F13)
  function renderVivaTab(topic) {
    return `
      <div style="display: grid; grid-template-columns: 1fr; gap: 20px; max-width: 880px;">
        <div class="card" style="padding: 24px; border: 1px solid #E2E8EE; border-radius: 12px; background: #FFFFFF;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
            <div>
              <h3 style="font-size: 18px; font-weight: 700; color: #14212B; margin: 0 0 4px;">Viva Voce Oral Examination Simulator</h3>
              <span style="font-size: 12px; color: #64748B;">Practice spoken academic exam answers with speech-to-text</span>
            </div>
            <span class="badge" style="background: #E6F4F2; color: #03605E; font-weight: 700; font-size: 12px;">Feature F13</span>
          </div>

          ${!vivaSession ? `
            <div style="text-align: center; padding: 30px; border: 1px dashed #CBD5E1; border-radius: 10px; background: #F8FAFC;">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#03605E" stroke-width="1.8" style="margin-bottom: 12px;">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/>
              </svg>
              <h4 style="font-size: 16px; font-weight: 700; color: #1E293B; margin-bottom: 6px;">Start Oral Viva for: ${escapeHtml(topic.title)}</h4>
              <p style="font-size: 13px; color: #64748B; max-width: 480px; margin: 0 auto 18px;">
                The examiner will ask you a question. You speak your answer using your microphone (or type as fallback), receive live evaluation, and answer follow-ups.
              </p>
              <button type="button" class="btn btn-primary" id="startVivaSessionBtn">Begin Oral Exam</button>
            </div>
          ` : renderActiveVivaSession()}
        </div>
      </div>
    `;
  }

  function renderActiveVivaSession() {
    return `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div style="padding: 16px; background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 10px;">
          <span style="font-size: 11.5px; font-weight: 700; color: #166534; text-transform: uppercase;">Examiner Question:</span>
          <p style="font-size: 15px; font-weight: 600; color: #14532D; margin: 6px 0 0; line-height: 1.5;">
            "${escapeHtml(vivaSession.currentQuestion || vivaSession.opening_question)}"
          </p>
        </div>

        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <label class="form-label" style="font-size: 13px; font-weight: 600; margin: 0;">Your Spoken Response:</label>
            <button type="button" class="btn btn-sm ${isListening ? 'btn-danger' : 'btn-secondary'}" id="toggleMicBtn" style="display: inline-flex; align-items: center; gap: 6px;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
              ${isListening ? 'Listening (Click to Stop)...' : 'Use Microphone'}
            </button>
          </div>
          <textarea id="vivaTranscriptTextarea" class="input" rows="4" style="width: 100%; padding: 12px; font-size: 14px; border-radius: 8px; border: 1px solid #CBD5E1;" placeholder="Speech-to-text transcript appears here. You can also edit or type directly...">${escapeHtml(vivaTranscriptInput)}</textarea>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="btn btn-primary" id="submitVivaResponseBtn">Submit Spoken Answer</button>
        </div>

        ${vivaSession.lastEvaluation ? `
          <div style="padding: 16px; background: #F8FAFC; border: 1px solid #E2E8EE; border-radius: 10px; margin-top: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <strong style="font-size: 13.5px; color: #1E293B;">Examiner Evaluation:</strong>
              <span class="badge" style="background: #E6F4F2; color: #03605E; font-weight: 700;">Score: ${vivaSession.lastEvaluation.score_awarded} / 5</span>
            </div>
            <p style="font-size: 13px; color: #475569; margin: 0;">${escapeHtml(vivaSession.lastEvaluation.feedback)}</p>
          </div>
        ` : ''}
      </div>
    `;
  }

  function bindEvents() {
    // Mode Switcher Tabs
    mountPoint.querySelector('#tabConceptBtn')?.addEventListener('click', () => { activeTab = 'concept'; renderView(); });
    mountPoint.querySelector('#tabGradeBtn')?.addEventListener('click', () => { activeTab = 'grade'; renderView(); });
    mountPoint.querySelector('#tabTryFirstBtn')?.addEventListener('click', () => { activeTab = 'tryfirst'; renderView(); });
    mountPoint.querySelector('#tabVivaBtn')?.addEventListener('click', () => { activeTab = 'viva'; renderView(); });

    // Concept Explanation Tab Events
    const topicSelect = container.querySelector('#understandingTopicSelect');
    if (topicSelect) {
      topicSelect.addEventListener('change', (e) => {
        selectedTopicId = e.target.value;
        explanationInputText = workspaceStore.getDraft(`und_${selectedTopicId}`) || '';
        activeEvaluation = null;
        renderView();
      });
    }

    const textarea = container.querySelector('#studentExplanationInput');
    const charCounter = container.querySelector('#charCounter');
    if (textarea && charCounter) {
      charCounter.textContent = `${textarea.value.length} characters`;
      textarea.addEventListener('input', () => {
        explanationInputText = textarea.value;
        workspaceStore.saveDraft(`und_${selectedTopicId}`, textarea.value);
        charCounter.textContent = `${textarea.value.length} characters`;
      });
    }

    const submitBtn = container.querySelector('#submitExplanationBtn');
    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        const text = (textarea ? textarea.value : explanationInputText).trim();
        if (!text) {
          Toast.show('Please enter an explanation before submitting.', 'error');
          return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = 'Evaluating with Syllora AI...';

        const topic = state.topics.find(t => t.id === selectedTopicId) || state.topics[0];
        try {
          const evalRes = await sylloraApi.evaluateUnderstanding(topic.id, `Explain ${topic.title}`, text);
          activeEvaluation = {
            score: evalRes.score || 1,
            headline: evalRes.score >= 3 ? 'Exemplary Understanding Demonstrated' : evalRes.score === 2 ? 'Partial Understanding' : 'Conceptual Revision Needed',
            rubric: {
              conceptualAccuracy: evalRes.rubric?.conceptual_accuracy || 'Accuracy evaluated.',
              essentialPoints: evalRes.rubric?.essential_points || 'Points checked.',
              reasoning: evalRes.rubric?.reasoning || 'Reasoning checked.'
            },
            missingPoints: evalRes.missing_points || [],
            feedback: evalRes.feedback || ''
          };
          renderView();
        } catch (err) {
          Toast.show(`Evaluation failed: ${err.message}`, 'error');
        } finally {
          submitBtn.disabled = false;
        }
      });
    }

    // Grade Tab Events
    const gradeBtn = container.querySelector('#submitGradeBtn');
    if (gradeBtn) {
      gradeBtn.addEventListener('click', async () => {
        const qText = container.querySelector('#gradeQuestionInput')?.value || '';
        const marks = parseInt(container.querySelector('#gradeMarksSelect')?.value || '5', 10);
        const ansText = container.querySelector('#gradeAnswerInput')?.value || '';

        if (!ansText.trim()) {
          Toast.show('Please paste or write your answer to evaluate.', 'error');
          return;
        }

        gradeBtn.disabled = true;
        gradeBtn.textContent = 'Grading against Course Notes...';

        try {
          const res = await sylloraApi.evaluateAnswer(qText, ansText, marks);
          activeGradedResult = res;
          renderView();
        } catch (err) {
          Toast.show(`Grading failed: ${err.message}`, 'error');
        } finally {
          gradeBtn.disabled = false;
        }
      });
    }

    const logMiscBtn = container.querySelector('#logToMisconceptionsFromGradeBtn');
    if (logMiscBtn) {
      logMiscBtn.addEventListener('click', () => {
        Toast.success('Flagged concepts recorded in Misconception Notebook!');
      });
    }

    // Try-First Tab Events
    const revealHintBtn = container.querySelector('#revealNextHintBtn');
    if (revealHintBtn) {
      revealHintBtn.addEventListener('click', () => {
        tryHintsRevealed++;
        renderView();
      });
    }

    const submitTryBtn = container.querySelector('#submitTryAttemptBtn');
    if (submitTryBtn) {
      submitTryBtn.addEventListener('click', async () => {
        const attempt = container.querySelector('#tryAttemptInput')?.value || '';
        if (!attempt.trim()) {
          Toast.show('Please enter your recall attempt before revealing the answer.', 'error');
          return;
        }
        submitTryBtn.disabled = true;
        submitTryBtn.textContent = 'Scoring attempt...';

        try {
          const evalRes = await sylloraApi.evaluateAnswer(tryQuestionText, attempt, tryMarks);
          tryAttemptText = attempt;
          tryResult = {
            score: evalRes.score_awarded,
            feedback: evalRes.feedback,
            evaluation: evalRes
          };
          renderView();
        } catch (err) {
          Toast.show(`Error: ${err.message}`, 'error');
        } finally {
          submitTryBtn.disabled = false;
        }
      });
    }

    // Viva Tab Events
    const startVivaBtn = container.querySelector('#startVivaSessionBtn');
    if (startVivaBtn) {
      startVivaBtn.addEventListener('click', async () => {
        const topic = state.topics.find(t => t.id === selectedTopicId) || state.topics[0];
        startVivaBtn.disabled = true;
        startVivaBtn.textContent = 'Preparing Examiner Question...';
        try {
          const session = await sylloraApi.startViva(topic.title, null, topic.id);
          vivaSession = session;
          renderView();
        } catch (err) {
          Toast.show(`Failed to start viva: ${err.message}`, 'error');
        } finally {
          startVivaBtn.disabled = false;
        }
      });
    }

    const toggleMicBtn = container.querySelector('#toggleMicBtn');
    if (toggleMicBtn) {
      toggleMicBtn.addEventListener('click', () => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
          Toast.info('Web Speech API is not supported in this browser. Please type your response directly.');
          return;
        }

        if (isListening && recognitionInstance) {
          recognitionInstance.stop();
          isListening = false;
          toggleMicBtn.textContent = 'Use Microphone';
          return;
        }

        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognitionInstance = new SpeechRec();
        recognitionInstance.continuous = true;
        recognitionInstance.interimResults = true;

        recognitionInstance.onstart = () => {
          isListening = true;
          toggleMicBtn.textContent = 'Listening (Click to Stop)...';
        };

        recognitionInstance.onresult = (event) => {
          let transcript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
          }
          const textarea = container.querySelector('#vivaTranscriptTextarea');
          if (textarea) {
            textarea.value = (vivaTranscriptInput + ' ' + transcript).trim();
          }
        };

        recognitionInstance.onerror = (e) => {
          console.warn('[Viva Mic Error]:', e);
          isListening = false;
          toggleMicBtn.textContent = 'Use Microphone';
        };

        recognitionInstance.onend = () => {
          isListening = false;
          toggleMicBtn.textContent = 'Use Microphone';
        };

        recognitionInstance.start();
      });
    }

    const submitVivaBtn = container.querySelector('#submitVivaResponseBtn');
    if (submitVivaBtn) {
      submitVivaBtn.addEventListener('click', async () => {
        const tArea = container.querySelector('#vivaTranscriptTextarea');
        const text = (tArea ? tArea.value : '').trim();
        if (!text) {
          Toast.show('Please speak or type your answer before submitting.', 'error');
          return;
        }

        submitVivaBtn.disabled = true;
        submitVivaBtn.textContent = 'Examiner evaluating...';

        try {
          const res = await sylloraApi.respondViva(vivaSession.session_id, text);
          vivaSession.lastEvaluation = res.evaluation;
          if (res.follow_up_question) {
            vivaSession.currentQuestion = res.follow_up_question;
          }
          vivaTranscriptInput = '';
          renderView();
        } catch (err) {
          Toast.show(`Viva response failed: ${err.message}`, 'error');
        } finally {
          submitVivaBtn.disabled = false;
        }
      });
    }
  }

  const mountPoint = container;
  renderView();

  return () => {
    if (recognitionInstance) {
      try { recognitionInstance.stop(); } catch (e) {}
    }
  };
}
