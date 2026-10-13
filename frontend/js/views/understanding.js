/**
 * ============================================================================
 * VIEW: CHECK UNDERSTANDING (ASSESSMENT & RUBRIC FLOW)
 * ============================================================================
 * - Interactive assessment flow with short question & explanation input
 * - Quick test explanation fixtures (Incorrect, Partial, Exemplary)
 * - Deterministic rubric evaluation: Conceptual accuracy, Essential points, Reasoning
 * - Missing points & possible misconceptions
 * - Resubmit / revise workflow
 * - Follow-up scenario 2 (Deadlock vs Starvation printer priority queue)
 * - Save attempt to Misconception Notebook with state persistence
 */

import { workspaceStore } from '../state.js';
import { PdfReader } from '../components/pdfViewer.js';
import { Toast } from '../components/modal.js';
import { sylloraApi } from '../services/aiApi.js';

export function renderUnderstanding(container, queryParams = {}) {
  const state = workspaceStore.getState();
  let selectedTopicId = queryParams.topic || 'top-3'; // default to Deadlock vs Starvation
  let explanationInputText = workspaceStore.getDraft(`und_${selectedTopicId}`) || '';
  let activeEvaluation = null;
  let scenarioAnswer = null; // for scenario 2
  let scenarioSubmitted = false;

  function renderView() {
    if (!state.topics || state.topics.length === 0) {
      container.innerHTML = `
        <div class="view-understanding-page">
          <header class="page-header-row">
            <div class="header-text">
              <h1 class="page-title">Check Your Understanding</h1>
              <p class="page-desc">Explain key concepts in your own words, receive rubric-grounded feedback, and test edge scenarios.</p>
            </div>
          </header>
          <div class="card empty-state-box" style="padding: 48px 24px; text-align: center;">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#64748B" stroke-width="1.5" style="margin: 0 auto 16px;">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <h3>No syllabus topics available</h3>
            <p style="color: var(--color-text-muted); margin-bottom: 20px;">To check your understanding and receive AI-guided rubric feedback, create topics in your Syllabus Map first.</p>
            <a href="#/app/syllabus" class="btn btn-primary">Go to Syllabus Map</a>
          </div>
        </div>
      `;
      return;
    }

    const topic = state.topics.find(t => t.id === selectedTopicId) || state.topics[0];

    container.innerHTML = `
      <div class="view-understanding-page">
        
        <header class="page-header-row">
          <div class="header-text">
            <h1 class="page-title">Check Your Understanding</h1>
            <p class="page-desc">Explain key concepts in your own words, receive rubric-grounded feedback, and test edge scenarios.</p>
          </div>

          <div class="header-buttons">
            <div class="topic-select-wrap">
              <label class="control-label">Topic:</label>
              <select id="understandingTopicSelect" class="filter-select">
                ${state.topics.map(t => `
                  <option value="${t.id}" ${t.id === selectedTopicId ? 'selected' : ''}>
                    ${t.title} (${t.understandingStatus})
                  </option>
                `).join('')}
              </select>
            </div>
          </div>
        </header>

        <div class="understanding-layout-grid">
          
          <!-- Left: Question & Input Workspace -->
          <div class="understanding-left-col">
            
            <div class="card prompt-card">
              <div class="prompt-header">
                <span class="prompt-badge">CONCEPT EXPLANATION CHECK</span>
                <span class="pill-badge pill-amber">${topic.understandingStatus}</span>
              </div>

              <h2 class="prompt-question-title" id="understandingQuestionTitle">
                Explain the fundamental requirements and operating system implications of: ${escapeHtml(topic.title)}.
              </h2>

              <p class="prompt-guidance">
                Explain the concept in your own words. Focus on core mechanisms, trade-offs, and operating system implications.
              </p>

              <!-- Input Area -->
              <div class="explanation-input-wrap">
                <label for="studentExplanationInput" class="form-label">Your Explanation:</label>
                <textarea id="studentExplanationInput" class="form-input explanation-textarea" rows="5" placeholder="Write your explanation here...">${explanationInputText}</textarea>
                <div class="char-count-row">
                  <span class="text-xs text-muted" id="charCounter">0 characters</span>
                  <span class="text-xs text-muted">Input preserved across navigation</span>
                </div>
              </div>

              <div class="prompt-actions-row">
                <button type="button" class="btn btn-secondary" id="clearExplanationBtn">Clear</button>
                <button type="button" class="btn btn-primary" id="submitExplanationBtn">
                  Submit Explanation for Feedback
                </button>
              </div>

            </div>

            <!-- Rubric Feedback Card (shown after evaluation) -->
            ${activeEvaluation ? `
              <div class="card evaluation-result-card" id="evaluationResultCard">
                <div class="eval-header">
                  <div class="eval-score-badge ${activeEvaluation.score >= 3 ? 'score-high' : activeEvaluation.score === 2 ? 'score-mid' : 'score-low'}">
                    Score: ${activeEvaluation.score} / 3
                  </div>
                  <div class="eval-title-wrap">
                    <h3>${activeEvaluation.headline}</h3>
                    <span class="text-xs text-muted">Demo Evaluation • Deterministic Rubric</span>
                  </div>
                </div>

                <!-- Rubric Dimensions -->
                <div class="rubric-grid">
                  <div class="rubric-item">
                    <span class="rubric-label">Conceptual Accuracy:</span>
                    <p class="rubric-desc">${activeEvaluation.rubric.conceptualAccuracy}</p>
                  </div>
                  <div class="rubric-item">
                    <span class="rubric-label">Essential Points:</span>
                    <p class="rubric-desc">${activeEvaluation.rubric.essentialPoints}</p>
                  </div>
                  <div class="rubric-item">
                    <span class="rubric-label">Reasoning Quality:</span>
                    <p class="rubric-desc">${activeEvaluation.rubric.reasoning}</p>
                  </div>
                </div>

                <!-- Missing Points Callout -->
                ${activeEvaluation.missingPoints.length > 0 ? `
                  <div class="missing-points-box">
                    <h5>Key Missing Points:</h5>
                    <ul>
                      ${activeEvaluation.missingPoints.map(mp => `<li>${mp}</li>`).join('')}
                    </ul>
                  </div>
                ` : ''}

                <!-- Supporting Corrective Passage Citation -->
                <div class="corrective-citation-box">
                  <div class="citation-box-header">
                    <span class="pill-badge pill-green">Verified Grounding Passage</span>
                    <strong>Silberschatz (Ch. 8), Page 3</strong>
                  </div>
                  <p class="citation-quote">
                    "A deadlock occurs when every process in a set is waiting for an event only another process can cause. In contrast, starvation is postponement due to priority bias."
                  </p>
                  <button type="button" class="btn btn-secondary btn-xs" id="evalOpenReaderBtn">
                    Inspect in PDF Reader →
                  </button>
                </div>

                <!-- Revision Actions -->
                <div class="eval-footer-actions">
                  <button type="button" class="btn btn-secondary btn-sm" id="reviseAndResubmitBtn">
                    Revise & Resubmit
                  </button>
                  <button type="button" class="btn btn-primary btn-sm" id="saveToNotebookBtn">
                    Save to Misconception Notebook
                  </button>
                </div>

              </div>
            ` : ''}

          </div>

          <!-- Right: Follow-up Scenario 2 Card -->
          <div class="understanding-right-col">
            
            <div class="card scenario-card">
              <div class="scenario-badge">FOLLOW-UP SCENARIO #2</div>
              <h3 class="scenario-title">Printer Priority Queue Test</h3>

              <div class="scenario-body">
                <p>An operating system manages a shared laser printer using a <strong>strict priority queue</strong> without aging.</p>
                <div class="scenario-conditions-box">
                  <div>• <code>Process P_low</code> requests printer at 09:00 AM.</div>
                  <div>• <code>Process P_high_1</code> and <code>Process P_high_2</code> continuously alternate printing jobs for 48 hours.</div>
                  <div>• <code>P_low</code> remains runnable but unserved for 48 hours.</div>
                </div>

                <div class="scenario-question-prompt">
                  <strong>Question: Is Process P_low deadlocked or starving?</strong>
                </div>

                <div class="scenario-radio-group">
                  <label class="scenario-radio-item ${scenarioAnswer === 'deadlock' ? 'selected' : ''}">
                    <input type="radio" name="scenarioAnswer" value="deadlock" ${scenarioAnswer === 'deadlock' ? 'checked' : ''}>
                    <span><strong>Deadlock</strong> (P_low is blocked forever in cyclic waiting)</span>
                  </label>
                  <label class="scenario-radio-item ${scenarioAnswer === 'starvation' ? 'selected' : ''}">
                    <input type="radio" name="scenarioAnswer" value="starvation" ${scenarioAnswer === 'starvation' ? 'checked' : ''}>
                    <span><strong>Starvation</strong> (Indefinite postponement due to priority bias)</span>
                  </label>
                </div>

                <button type="button" class="btn btn-secondary btn-block mt-3" id="submitScenarioBtn" ${!scenarioAnswer ? 'disabled' : ''}>
                  Check Scenario Answer
                </button>

                ${scenarioSubmitted ? `
                  <div class="scenario-result-callout ${scenarioAnswer === 'starvation' ? 'correct' : 'incorrect'}">
                    ${scenarioAnswer === 'starvation' ? `
                      <span class="result-badge-green">✓ Correct: Starvation</span>
                      <p class="result-expl">This is pure starvation. Zero deadlocks exist because <code>P_high_1</code> and <code>P_high_2</code> are actively completing tasks and releasing the printer. There is no circular waiting chain. Introducing <strong>priority aging</strong> guarantees <code>P_low</code> eventually executes.</p>
                    ` : `
                      <span class="result-badge-red">✗ Incorrect: Not Deadlock</span>
                      <p class="result-expl">Deadlock requires a cycle where NO process makes progress. Here, high priority processes are continually executing and releasing the resource. This is an unfair scheduling postponement (Starvation).</p>
                    `}
                  </div>
                ` : ''}

              </div>
            </div>

          </div>

        </div>

      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
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

    // Submit explanation using genuine academic AI service
    const submitBtn = container.querySelector('#submitExplanationBtn');
    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        const text = (textarea ? textarea.value : explanationInputText).trim();
        if (!text) {
          Toast.show('Please enter an explanation before submitting.', 'error');
          if (textarea) textarea.focus();
          return;
        }

        const topic = state.topics.find(t => t.id === selectedTopicId) || state.topics[0];
        const questionEl = container.querySelector('#understandingQuestionTitle');
        const questionText = questionEl ? questionEl.textContent.trim() : `Explain ${topic.title}`;

        submitBtn.disabled = true;
        submitBtn.textContent = 'Evaluating with Syllora AI...';

        try {
          const evalRes = await sylloraApi.evaluateUnderstanding(topic.id, questionText, text);
          activeEvaluation = {
            score: evalRes.score || 1,
            headline: evalRes.score >= 3 ? 'Exemplary Understanding Demonstrated' : evalRes.score === 2 ? 'Partial Understanding (Revisions Recommended)' : 'Conceptual Revision Needed',
            rubric: {
              conceptualAccuracy: evalRes.rubric?.conceptual_accuracy || evalRes.rubric?.conceptualAccuracy || (evalRes.feedback || 'Evaluated against academic rubric.'),
              essentialPoints: evalRes.rubric?.essential_points || evalRes.rubric?.essentialPoints || 'Essential points checked against syllabus.',
              reasoning: evalRes.rubric?.reasoning || 'Evaluated for consistency.'
            },
            missingPoints: evalRes.missing_points || evalRes.missingPoints || [],
            possibleMisconceptions: evalRes.possible_misconceptions || [],
            feedback: evalRes.feedback || ''
          };

          // Record attempt in persistent workspace store
          workspaceStore.addUnderstandingAttempt({
            id: evalRes.attempt_id || `att-${Date.now()}`,
            topicId: topic.id,
            topicTitle: topic.title,
            score: activeEvaluation.score,
            headline: activeEvaluation.headline,
            feedback: activeEvaluation.feedback
          });

          renderView();

          setTimeout(() => {
            const evalCard = container.querySelector('#evaluationResultCard');
            if (evalCard) evalCard.scrollIntoView({ behavior: 'smooth' });
          }, 80);
        } catch (err) {
          Toast.show(`AI evaluation failed: ${err.message || 'Service unavailable'}`, 'error');
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit Explanation for Feedback';
        }
      });
    }

    // Clear explanation
    const clearBtn = container.querySelector('#clearExplanationBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        explanationInputText = '';
        workspaceStore.clearDraft(`und_${selectedTopicId}`);
        activeEvaluation = null;
        if (textarea) textarea.value = '';
        if (charCounter) charCounter.textContent = '0 characters';
        Toast.show('Explanation cleared.', 'info');
      });
    }

    // Open citation reader in evaluation card
    const evalReaderBtn = container.querySelector('#evalOpenReaderBtn');
    if (evalReaderBtn) {
      evalReaderBtn.addEventListener('click', () => {
        PdfReader.open('doc-1', 3, 'A deadlock occurs when every process in a set is waiting for an event only another process can cause. In contrast, starvation is postponement due to priority bias.', '8.3 Deadlock vs Starvation');
      });
    }

    // Revise & resubmit
    const reviseBtn = container.querySelector('#reviseAndResubmitBtn');
    if (reviseBtn) {
      reviseBtn.addEventListener('click', () => {
        activeEvaluation = null;
        renderView();
        const inp = container.querySelector('#studentExplanationInput');
        if (inp) inp.focus();
      });
    }

    // Save to misconception notebook
    const saveNotebookBtn = container.querySelector('#saveToNotebookBtn');
    if (saveNotebookBtn && activeEvaluation) {
      saveNotebookBtn.addEventListener('click', async () => {
        const topic = state.topics.find(t => t.id === selectedTopicId) || state.topics[0];
        workspaceStore.saveAttempt({
          id: `att-${Date.now()}`,
          topicId: topic.id,
          topicTitle: topic.title,
          timestamp: new Date().toISOString(),
          userExplanation: explanationInputText,
          score: activeEvaluation.score,
          rubric: activeEvaluation.rubric,
          missingPoints: activeEvaluation.missingPoints,
          possibleMisconceptions: activeEvaluation.possibleMisconceptions,
          revised: true
        });

        // Also persist to backend asynchronously if online
        try {
          await sylloraApi.createMisconception({
            topic_id: topic.id,
            student_misunderstanding: explanationInputText,
            corrected_concept: activeEvaluation.rubric?.conceptualAccuracy || 'See rubric evaluation',
            status: 'open'
          });
        } catch (apiErr) {
          console.debug('[Understanding] Backend misconception sync deferred or offline:', apiErr);
        }

        Toast.show('Assessment attempt saved to notebook & practice stats updated!', 'success');
      });
    }

    // Radio scenario 2
    container.querySelectorAll('input[name="scenarioAnswer"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        scenarioAnswer = e.target.value;
        scenarioSubmitted = false;
        renderView();
      });
    });

    // Submit scenario
    const submitScenarioBtn = container.querySelector('#submitScenarioBtn');
    if (submitScenarioBtn) {
      submitScenarioBtn.addEventListener('click', () => {
        if (!scenarioAnswer) return;
        scenarioSubmitted = true;
        renderView();
      });
    }
  }

  renderView();
}
