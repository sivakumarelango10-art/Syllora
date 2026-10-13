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

export function renderUnderstanding(container, queryParams = {}) {
  const state = workspaceStore.getState();
  let selectedTopicId = queryParams.topic || 'top-3'; // default to Deadlock vs Starvation
  let explanationInputText = workspaceStore.getDraft(`und_${selectedTopicId}`) || '';
  let activeEvaluation = null;
  let scenarioAnswer = null; // for scenario 2
  let scenarioSubmitted = false;

  function renderView() {
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

              <h2 class="prompt-question-title">
                ${topic.id === 'top-3' ?
                  'In 2–3 sentences, explain why starvation can occur in an operating system even when zero deadlocks exist.' :
                  `Explain the fundamental requirements and operating system implications of: ${topic.title}.`}
              </h2>

              <p class="prompt-guidance">
                Focus on resource allocation graphs, circular dependencies, and scheduler priority queue behaviors.
              </p>

              <!-- Quick fill sample chips for evaluation testing -->
              <div class="sample-explanation-row">
                <span class="text-xs text-muted">Test sample inputs:</span>
                <button type="button" class="btn-sample-fill fill-incorrect" id="fillIncorrectBtn">
                  Incorrect explanation
                </button>
                <button type="button" class="btn-sample-fill fill-partial" id="fillPartialBtn">
                  Partial explanation
                </button>
                <button type="button" class="btn-sample-fill fill-exemplary" id="fillExemplaryBtn">
                  Exemplary explanation
                </button>
              </div>

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

            <!-- Notice Card -->
            <div class="card demo-eval-notice">
              <h5>Frontend Demonstration Notice</h5>
              <p class="text-xs text-muted">
                Rubric checks run deterministic pattern analysis for the supported Operating Systems modules. Automatic review does not claim official course grading.
              </p>
            </div>

          </div>

        </div>

      </div>
    `;

    bindEvents();
  }

  function evaluateExplanation(text) {
    const lower = text.toLowerCase();

    // Check for Exemplary
    if ((lower.includes('circular') || lower.includes('cyclic')) && lower.includes('starvation') && (lower.includes('priority') || lower.includes('postponement'))) {
      return {
        score: 3,
        headline: 'Exemplary Understanding Demonstrated',
        rubric: {
          conceptualAccuracy: 'Accurately distinguishes circular dependency from scheduling postponement.',
          essentialPoints: 'Identified all key criteria: circular wait, independent progress, priority starvation.',
          reasoning: 'Cohesive, precise explanation linking system state to scheduler behavior.'
        },
        missingPoints: [],
        possibleMisconceptions: []
      };
    }

    // Check for Partial
    if (lower.includes('wait') && (lower.includes('priority') || lower.includes('starvation'))) {
      return {
        score: 2,
        headline: 'Partial Understanding (Missing Formal Conditions)',
        rubric: {
          conceptualAccuracy: 'Recognizes priority scheduling delay, but lacks formal Coffman circular wait criteria.',
          essentialPoints: 'Mentioned thread waiting and priority, missed circular dependency definition.',
          reasoning: 'Adequate intuitive reasoning; needs rigorous operating system terminology.'
        },
        missingPoints: [
          'State that deadlock is a closed cyclic waiting graph where throughput drops to zero.',
          'Explain that in starvation, other non-starving processes continue executing normally.'
        ],
        possibleMisconceptions: [
          'Treating thread latency as equivalent to deadlock.'
        ]
      };
    }

    // Default to Incorrect / Superficial
    return {
      score: 1,
      headline: 'Conceptual Revision Needed',
      rubric: {
        conceptualAccuracy: 'Conflates circular deadlock with scheduling starvation.',
        essentialPoints: 'Missed both circular waiting requirements and priority postponement.',
        reasoning: 'Superficial comparison based only on symptom of thread waiting.'
      },
      missingPoints: [
        'A deadlock requires a cyclic dependency among processes holding resources.',
        'Starvation is indefinite postponement caused by priority scheduling where higher-priority tasks continue executing.'
      ],
      possibleMisconceptions: [
        'Believing thread waiting always means the system is in deadlock.'
      ]
    };
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

    // Quick fill sample buttons
    const fillIncorrect = container.querySelector('#fillIncorrectBtn');
    const fillPartial = container.querySelector('#fillPartialBtn');
    const fillExemplary = container.querySelector('#fillExemplaryBtn');

    if (fillIncorrect) {
      fillIncorrect.addEventListener('click', () => {
        explanationInputText = 'Deadlock and starvation are basically the same thing because both make threads stop running forever.';
        workspaceStore.saveDraft(`und_${selectedTopicId}`, explanationInputText);
        if (textarea) textarea.value = explanationInputText;
        if (charCounter) charCounter.textContent = `${explanationInputText.length} characters`;
      });
    }

    if (fillPartial) {
      fillPartial.addEventListener('click', () => {
        explanationInputText = 'Starvation is when a low-priority thread waits a long time because high-priority threads keep jumping ahead, while deadlock is when threads are waiting on each other.';
        workspaceStore.saveDraft(`und_${selectedTopicId}`, explanationInputText);
        if (textarea) textarea.value = explanationInputText;
        if (charCounter) charCounter.textContent = `${explanationInputText.length} characters`;
      });
    }

    if (fillExemplary) {
      fillExemplary.addEventListener('click', () => {
        explanationInputText = 'Deadlock is a circular waiting state where none of the involved threads can ever proceed because each holds a resource the other needs. Starvation is indefinite postponement where resources are continually being allocated to higher-priority threads, leaving a runnable thread perpetually waiting without circular dependency.';
        workspaceStore.saveDraft(`und_${selectedTopicId}`, explanationInputText);
        if (textarea) textarea.value = explanationInputText;
        if (charCounter) charCounter.textContent = `${explanationInputText.length} characters`;
      });
    }

    // Submit explanation
    const submitBtn = container.querySelector('#submitExplanationBtn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        const text = (textarea ? textarea.value : explanationInputText).trim();
        if (!text) {
          Toast.show('Please enter an explanation before submitting.', 'error');
          textarea.focus();
          return;
        }

        activeEvaluation = evaluateExplanation(text);
        renderView();

        // Scroll evaluation card into view
        setTimeout(() => {
          const evalCard = container.querySelector('#evaluationResultCard');
          if (evalCard) evalCard.scrollIntoView({ behavior: 'smooth' });
        }, 80);
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
      saveNotebookBtn.addEventListener('click', () => {
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
