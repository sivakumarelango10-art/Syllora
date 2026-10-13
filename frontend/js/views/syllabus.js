/**
 * ============================================================================
 * VIEW: SYLLABUS MAP & CURRICULUM COVERAGE
 * ============================================================================
 * - Full curriculum syllabus table with evidence and understanding indicators
 * - Topic detail inspection with prerequisites and verified passage references
 * - Manual topic addition and editing with "No matching evidence" demonstration
 * - Search and multi-criteria filters
 */

import { workspaceStore } from '../state.js';
import { router } from '../router.js';
import { PdfReader } from '../components/pdfViewer.js';
import { Modal, Toast } from '../components/modal.js';
import { sylloraApi } from '../services/aiApi.js';

export function renderSyllabus(container) {
  let searchQuery = '';
  let evidenceFilter = 'all';
  let understandingFilter = 'all';

  function getFilteredTopics() {
    const state = workspaceStore.getState();
    let topics = [...state.topics];

    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        topics = topics.filter(t => t.title.toLowerCase().includes(q) || t.unit.toLowerCase().includes(q));
      }
    }

    if (evidenceFilter !== 'all') {
      topics = topics.filter(t => t.evidenceStatus === evidenceFilter);
    }

    if (understandingFilter !== 'all') {
      topics = topics.filter(t => t.understandingStatus === understandingFilter);
    }

    return topics;
  }

  function renderTableHTML(topics) {
    const totalCount = workspaceStore.getState().topics.length;
    if (totalCount === 0) {
      return `
        <div class="card empty-state-box" style="padding: 48px 24px; text-align: center;">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#64748B" stroke-width="1.5" style="margin: 0 auto 16px;">
            <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
          </svg>
          <h3>No syllabus topics yet</h3>
          <p style="color: var(--color-text-muted); margin-bottom: 20px;">Map your curriculum topics to track evidence across uploaded study materials and measure student understanding.</p>
          <button type="button" class="btn btn-primary" id="emptyAddTopicBtn">+ Add your first topic</button>
        </div>
      `;
    }

    if (topics.length === 0) {
      return `
        <div class="card empty-state-box">
          <h3>No topics match your filter</h3>
          <p class="text-sm text-muted">Try adjusting search query or filter criteria.</p>
        </div>
      `;
    }

    return `
      <div class="card syllabus-table-card">
        <div class="table-responsive">
          <table class="syllabus-table full">
            <thead>
              <tr>
                <th>TOPIC TITLE</th>
                <th>MODULE / UNIT</th>
                <th>MATERIAL EVIDENCE</th>
                <th>STUDENT UNDERSTANDING</th>
                <th>MATCHED PASSAGES</th>
                <th class="text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              ${topics.map(topic => {
                let evPill = 'pill-gray';
                if (topic.evidenceStatus === 'Evidence found') evPill = 'pill-green';
                else if (topic.evidenceStatus === 'Limited evidence') evPill = 'pill-amber';

                let undPill = 'pill-gray';
                if (topic.understandingStatus === 'Needs practice') undPill = 'pill-amber';
                else if (topic.understandingStatus === 'Review needed') undPill = 'pill-coral';

                const passageCount = topic.matchedPassageIds ? topic.matchedPassageIds.length : 0;

                return `
                  <tr data-topic-id="${topic.id}">
                    <td>
                      <button type="button" class="topic-detail-link" data-topic-id="${topic.id}">
                        ${topic.title}
                      </button>
                    </td>
                    <td class="text-muted text-sm">${topic.unit}</td>
                    <td><span class="pill-badge ${evPill}">${topic.evidenceStatus}</span></td>
                    <td><span class="pill-badge ${undPill}">${topic.understandingStatus}</span></td>
                    <td>
                      ${passageCount > 0 ? `
                        <button type="button" class="btn-link-passage" data-topic-id="${topic.id}">
                          ${passageCount} verified passages
                        </button>
                      ` : `
                        <span class="text-muted text-sm">0 passages</span>
                      `}
                    </td>
                    <td class="text-right actions-cell">
                      <button type="button" class="btn btn-secondary btn-xs check-und-action-btn" data-topic-id="${topic.id}">
                        Check
                      </button>
                      <button type="button" class="btn-action-icon edit-topic-btn" data-topic-id="${topic.id}" title="Edit topic">
                        ✎
                      </button>
                      <button type="button" class="btn-action-icon text-danger delete-topic-btn" data-topic-id="${topic.id}" title="Delete topic">
                        🗑
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function updateTableMount() {
    const mount = container.querySelector('#syllabusResultsMount');
    if (!mount) return;
    const topics = getFilteredTopics();
    mount.innerHTML = renderTableHTML(topics);
    bindTableActionEvents();

    const emptyAddBtn = mount.querySelector('#emptyAddTopicBtn');
    if (emptyAddBtn) {
      emptyAddBtn.addEventListener('click', openAddTopicModal);
    }
  }

  function renderView() {
    const state = workspaceStore.getState();
    const topics = getFilteredTopics();

    container.innerHTML = `
      <div class="view-syllabus-page">
        
        <header class="page-header-row">
          <div class="header-text">
            <h1 class="page-title">Syllabus Map</h1>
            <p class="page-desc">Map course curriculum requirements against available evidence and mastery assessments.</p>
          </div>

          <div class="header-buttons">
            <button type="button" class="btn btn-secondary" id="syncSyllabusBtn">
              Sync with Server
            </button>
            <button type="button" class="btn btn-primary" id="addCustomTopicBtn">
              + Add Custom Topic
            </button>
          </div>
        </header>

        <!-- Filters Toolbar -->
        <div class="card syllabus-toolbar">
          <div class="toolbar-search">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="8.5" cy="8.5" r="5.5"/><line x1="13" y1="13" x2="18" y2="18"/>
            </svg>
            <input type="text" id="syllabusSearchInput" value="${searchQuery}" placeholder="Search topics by title or unit..." class="filter-input" autocomplete="off">
          </div>

          <div class="toolbar-controls">
            <div class="control-group">
              <label class="control-label">Evidence:</label>
              <select id="evidenceFilterSelect" class="filter-select">
                <option value="all" ${evidenceFilter === 'all' ? 'selected' : ''}>All Evidence States</option>
                <option value="Evidence found" ${evidenceFilter === 'Evidence found' ? 'selected' : ''}>Evidence found</option>
                <option value="Limited evidence" ${evidenceFilter === 'Limited evidence' ? 'selected' : ''}>Limited evidence</option>
                <option value="No matching evidence found" ${evidenceFilter === 'No matching evidence found' ? 'selected' : ''}>No matching evidence</option>
              </select>
            </div>

            <div class="control-group">
              <label class="control-label">Understanding:</label>
              <select id="understandingFilterSelect" class="filter-select">
                <option value="all" ${understandingFilter === 'all' ? 'selected' : ''}>All Understanding States</option>
                <option value="Not assessed" ${understandingFilter === 'Not assessed' ? 'selected' : ''}>Not assessed</option>
                <option value="Needs practice" ${understandingFilter === 'Needs practice' ? 'selected' : ''}>Needs practice</option>
                <option value="Review needed" ${understandingFilter === 'Review needed' ? 'selected' : ''}>Review needed</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Syllabus Coverage Summary Cards -->
        <div class="coverage-stats-row">
          <div class="coverage-card card">
            <span class="cov-label">CURRICULUM COVERAGE</span>
            <div class="cov-number">${state.topics.filter(t => t.evidenceStatus === 'Evidence found').length} / ${state.topics.length}</div>
            <span class="text-xs text-muted">Topics mapped to verified sources</span>
          </div>
          <div class="coverage-card card">
            <span class="cov-label">NEEDS PRACTICE</span>
            <div class="cov-number text-amber">${state.topics.filter(t => t.understandingStatus === 'Needs practice').length}</div>
            <span class="text-xs text-muted">Topics with scheduled revisions</span>
          </div>
          <div class="coverage-card card">
            <span class="cov-label">CRITICAL REVIEW</span>
            <div class="cov-number text-coral">${state.topics.filter(t => t.understandingStatus === 'Review needed').length}</div>
            <span class="text-xs text-muted">Topics with open misconceptions</span>
          </div>
        </div>

        <!-- Stable Topics Table Mount -->
        <div id="syllabusResultsMount">
          ${renderTableHTML(topics)}
        </div>

      </div>
    `;

    bindToolbarEvents();
    bindTableActionEvents();
  }

  function bindToolbarEvents() {
    const searchInput = container.querySelector('#syllabusSearchInput');
    const evSelect = container.querySelector('#evidenceFilterSelect');
    const undSelect = container.querySelector('#understandingFilterSelect');
    const addTopicBtn = container.querySelector('#addCustomTopicBtn');
    const reloadBtn = container.querySelector('#loadSampleSyllabusBtn');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value; // Preserve raw value with spaces!
        updateTableMount();
      });
    }

    if (evSelect) {
      evSelect.addEventListener('change', (e) => {
        evidenceFilter = e.target.value;
        updateTableMount();
      });
    }

    if (undSelect) {
      undSelect.addEventListener('change', (e) => {
        understandingFilter = e.target.value;
        updateTableMount();
      });
    }

    if (addTopicBtn) addTopicBtn.addEventListener('click', openAddTopicModal);

    const syncBtn = container.querySelector('#syncSyllabusBtn');
    if (syncBtn) {
      syncBtn.addEventListener('click', async () => {
        syncBtn.disabled = true;
        syncBtn.textContent = 'Syncing...';
        try {
          await workspaceStore.syncWithBackend();
          Toast.show('Syllabus updated from database.', 'success');
          renderView();
        } catch (err) {
          Toast.show(`Sync error: ${err.message}`, 'error');
        } finally {
          syncBtn.disabled = false;
          syncBtn.textContent = 'Sync with Server';
        }
      });
    }
  }

  function bindTableActionEvents() {

    // Detail modal
    container.querySelectorAll('.topic-detail-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const topicId = btn.getAttribute('data-topic-id');
        openTopicDetailModal(topicId);
      });
    });

    // Check understanding CTA
    container.querySelectorAll('.check-und-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const topicId = btn.getAttribute('data-topic-id');
        router.navigate('/app/understanding', { topic: topicId });
      });
    });

    // Passages link
    container.querySelectorAll('.btn-link-passage').forEach(btn => {
      btn.addEventListener('click', () => {
        const topicId = btn.getAttribute('data-topic-id');
        const state = workspaceStore.getState();
        const topic = state.topics.find(t => t.id === topicId);
        if (topic && topic.matchedPassageIds.length > 0) {
          const pass = state.passages.find(p => p.id === topic.matchedPassageIds[0]);
          if (pass) {
            PdfReader.open(pass.documentId, pass.pageNumber, pass.quote, pass.sectionTitle);
          }
        }
      });
    });

    // Edit topic
    container.querySelectorAll('.edit-topic-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const topicId = btn.getAttribute('data-topic-id');
        openEditTopicModal(topicId);
      });
    });

    // Delete topic
    container.querySelectorAll('.delete-topic-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const topicId = btn.getAttribute('data-topic-id');
        const topic = workspaceStore.getState().topics.find(t => t.id === topicId);
        if (!topic) return;

        Modal.open(
          'Delete Topic',
          `<p>Are you sure you want to remove <strong>${topic.title}</strong> from your syllabus map?</p>`,
          () => {
            workspaceStore.deleteTopic(topicId);
            Toast.show('Topic removed.', 'info');
            renderView();
          },
          'Delete',
          'danger'
        );
      });
    });
  }

  function openTopicDetailModal(topicId) {
    const state = workspaceStore.getState();
    const topic = state.topics.find(t => t.id === topicId);
    if (!topic) return;

    const passages = (topic.matchedPassageIds || []).map(pid => state.passages.find(p => p.id === pid)).filter(Boolean);
    const prereqs = (topic.prerequisites || []).map(prId => state.topics.find(t => t.id === prId)).filter(Boolean);

    Modal.open(
      `Topic Detail: ${topic.title}`,
      `
        <div class="topic-detail-wrapper">
          <div class="detail-header-badges mb-3">
            <span class="pill-badge pill-green">${topic.evidenceStatus}</span>
            <span class="pill-badge pill-amber">${topic.understandingStatus}</span>
            <span class="text-sm text-muted">${topic.unit}</span>
          </div>

          <!-- Prerequisites section -->
          ${prereqs.length > 0 ? `
            <div class="detail-section">
              <h5>Curriculum Prerequisites:</h5>
              <div class="prereq-cards-list">
                ${prereqs.map(p => `
                  <div class="prereq-pill">
                    <span>${p.title} (${p.unit})</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Matched Passages section -->
          <div class="detail-section mt-3">
            <h5>Matched Verified Academic Sources (${passages.length}):</h5>
            ${passages.length > 0 ? `
              <div class="detail-passages-list">
                ${passages.map(p => `
                  <div class="detail-passage-card">
                    <div class="pass-header">
                      <strong>${p.documentTitle} • Page ${p.pageNumber}</strong>
                      <span class="text-xs text-muted">${p.sectionTitle}</span>
                    </div>
                    <p class="pass-quote">"${p.quote}"</p>
                    <button type="button" class="btn btn-secondary btn-xs open-pass-reader-btn" data-doc="${p.documentId}" data-page="${p.pageNumber}" data-quote="${p.quote.replace(/"/g, '&quot;')}" data-sec="${p.sectionTitle}">
                      Open in PDF reader →
                    </button>
                  </div>
                `).join('')}
              </div>
            ` : `
              <p class="text-muted text-sm">No matching academic evidence exists in the loaded sample course materials.</p>
            `}
          </div>

          <div class="detail-cta-bar mt-4">
            <button type="button" class="btn btn-primary btn-block" id="startTopicCheckBtn">
              Start Understanding Assessment →
            </button>
          </div>
        </div>
      `,
      null,
      'Close'
    );

    const checkBtn = document.getElementById('startTopicCheckBtn');
    if (checkBtn) {
      checkBtn.addEventListener('click', () => {
        Modal.close();
        router.navigate('/app/understanding', { topic: topicId });
      });
    }

    document.querySelectorAll('.open-pass-reader-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const docId = btn.getAttribute('data-doc');
        const page = parseInt(btn.getAttribute('data-page'), 10);
        const quote = btn.getAttribute('data-quote');
        const sec = btn.getAttribute('data-sec');
        Modal.close();
        PdfReader.open(docId, page, quote, sec);
      });
    });
  }

  function openAddTopicModal() {
    Modal.open(
      'Add Custom Syllabus Topic',
      `
        <div class="form-group">
          <label class="form-label" for="newTopicTitle">Topic Title:</label>
          <input type="text" id="newTopicTitle" class="form-input" placeholder="e.g. Distributed Consensus & Raft">
        </div>
        <div class="form-group">
          <label class="form-label" for="newTopicUnit">Unit / Module:</label>
          <input type="text" id="newTopicUnit" class="form-input" placeholder="e.g. Unit 6: Distributed Coordination">
        </div>
        <div class="alert-box-info text-xs">
          <strong>Evidence status:</strong> New topics initialize as <em>"No matching evidence found"</em> until corresponding study materials are indexed.
        </div>
      `,
      () => {
        const title = document.getElementById('newTopicTitle').value.trim();
        const unit = document.getElementById('newTopicUnit').value.trim();
        if (title) {
          workspaceStore.addTopic({
            id: `top-custom-${Date.now()}`,
            title,
            unit: unit || 'Elective Module',
            evidenceStatus: 'No matching evidence found',
            understandingStatus: 'Not assessed',
            matchedPassageIds: [],
            prerequisites: []
          });
          try {
            sylloraApi.createTopic({
              title,
              description: unit || 'Elective Module',
              coverage_status: 'uncovered'
            }).catch(err => console.debug('[Syllabus] Backend topic sync deferred or offline:', err));
          } catch (err) {
            // non-blocking
          }
          Toast.show('Custom topic added to syllabus map.', 'success');
          renderView();
        }
      },
      'Add Topic'
    );
  }

  function openEditTopicModal(topicId) {
    const topic = workspaceStore.getState().topics.find(t => t.id === topicId);
    if (!topic) return;

    Modal.open(
      'Edit Syllabus Topic',
      `
        <div class="form-group">
          <label class="form-label" for="editTopicTitle">Topic Title:</label>
          <input type="text" id="editTopicTitle" class="form-input" value="${topic.title}">
        </div>
        <div class="form-group">
          <label class="form-label" for="editTopicUnit">Unit:</label>
          <input type="text" id="editTopicUnit" class="form-input" value="${topic.unit}">
        </div>
        <div class="form-group">
          <label class="form-label" for="editTopicStatus">Understanding Status:</label>
          <select id="editTopicStatus" class="form-input">
            <option value="Not assessed" ${topic.understandingStatus === 'Not assessed' ? 'selected' : ''}>Not assessed</option>
            <option value="Needs practice" ${topic.understandingStatus === 'Needs practice' ? 'selected' : ''}>Needs practice</option>
            <option value="Review needed" ${topic.understandingStatus === 'Review needed' ? 'selected' : ''}>Review needed</option>
          </select>
        </div>
      `,
      () => {
        const title = document.getElementById('editTopicTitle').value.trim();
        const unit = document.getElementById('editTopicUnit').value.trim();
        const understandingStatus = document.getElementById('editTopicStatus').value;
        if (title) {
          workspaceStore.updateTopic(topicId, { title, unit, understandingStatus });
          Toast.show('Topic updated.', 'success');
          renderView();
        }
      },
      'Save Changes'
    );
  }

  renderView();
}
