/**
 * ============================================================================
 * VIEW: STUDY MATERIALS LIBRARY & COMPARISON
 * ============================================================================
 * - List and Grid view switching
 * - Search, type/status filtering, and sorting
 * - Drag-and-drop PDF upload dialog with queue & duplicate validation
 * - Clear "LOCAL PREVIEW" labelling for newly added files
 * - Rename, Bookmark, Delete with confirmation
 * - Embedded PDF Document Reader
 * - Bundled Document Update Comparison (Edition 9 vs Edition 10 revised)
 */

import { workspaceStore } from '../state.js';
import { PdfReader } from '../components/pdfViewer.js';
import { Modal, Toast } from '../components/modal.js';
import { savePdfBlob } from '../storage.js';
import { MAX_UPLOAD_BYTES, sylloraApi } from '../services/aiApi.js';

const MAX_UPLOAD_MIB = Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024));

export function renderMaterials(container, queryParams = {}) {
  let viewMode = 'list'; // 'list' | 'grid'
  let searchQuery = '';
  let statusFilter = 'all'; // 'all' | 'indexed' | 'local_preview'
  let sortKey = 'newest'; // 'newest' | 'name' | 'pages'
  let viewActive = true;
  let statusPollTimer = null;

  function hasPendingIndexing() {
    return workspaceStore.getState().documents.some(doc =>
      doc.backendDocument && ['pending', 'processing'].includes(doc.status)
    );
  }

  function scheduleStatusPoll(delay = 4000) {
    if (!viewActive || statusPollTimer !== null || !hasPendingIndexing()) return;
    statusPollTimer = window.setTimeout(async () => {
      statusPollTimer = null;
      if (!viewActive) return;
      try {
        const result = await sylloraApi.listDocuments();
        const serverDocs = Array.isArray(result.documents) ? result.documents : null;
        if (!serverDocs) throw new Error('The study materials response was invalid.');
        for (const serverDoc of serverDocs) {
          const existing = workspaceStore.getState().documents.find(doc => doc.id === serverDoc.id);
          workspaceStore.updateDocument(serverDoc.id, {
            status: serverDoc.index_status || serverDoc.status || 'pending',
            pageCount: Number(serverDoc.page_count) || null,
            backendChunkCount: Number(serverDoc.chunk_count) || 0,
            indexError: serverDoc.index_error || null
          });
          if (!existing) {
            workspaceStore.addDocument({
              id: serverDoc.id,
              title: serverDoc.title || serverDoc.filename,
              filename: serverDoc.filename,
              author: 'Uploaded Document',
              pageCount: Number(serverDoc.page_count) || null,
              fileSize: serverDoc.size_bytes ? `${(serverDoc.size_bytes / 1024).toFixed(1)} KB` : 'Unknown',
              uploadedAt: serverDoc.created_at ? serverDoc.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
              status: serverDoc.index_status || serverDoc.status || 'pending',
              backendDocument: true,
              backendChunkCount: Number(serverDoc.chunk_count) || 0,
              indexError: serverDoc.index_error || null,
              isBookmarked: false
            });
          }
        }
        updateResultsMount();
      } catch (error) {
        console.warn('[Study Materials] Could not refresh processing status:', error);
      }
      scheduleStatusPoll(hasPendingIndexing() ? 8000 : 4000);
    }, delay);
  }

  function statusBadge(doc) {
    if (!doc.backendDocument) {
      return '<span class="pill-badge pill-amber">Local Preview</span>';
    }
    const status = doc.status || 'pending';
    if (status === 'indexed' || status === 'completed') {
      return '<span class="pill-badge pill-green">Ready</span>';
    }
    if (status === 'failed') {
      return '<span class="pill-badge pill-red" title="AI indexing failed">Failed</span>';
    }
    return '<span class="pill-badge pill-amber" title="The PDF is stored and indexing is queued or in progress">Processing</span>';
  }

  function getFilteredDocs() {
    const state = workspaceStore.getState();
    let docs = state.documents.filter(d => !d.isComparisonOnly);

    // Apply filters
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        docs = docs.filter(d => d.title.toLowerCase().includes(q) || d.filename.toLowerCase().includes(q) || d.author.toLowerCase().includes(q));
      }
    }

    if (statusFilter === 'indexed') {
      docs = docs.filter(d => d.status === 'indexed' || d.status === 'completed');
    } else if (statusFilter === 'processing') {
      docs = docs.filter(d => ['pending', 'processing'].includes(d.status));
    } else if (statusFilter === 'failed') {
      docs = docs.filter(d => d.status === 'failed');
    } else if (statusFilter === 'local_preview') {
      docs = docs.filter(d => !d.backendDocument);
    }

    // Apply sorting
    if (sortKey === 'name') {
      docs.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortKey === 'pages') {
      docs.sort((a, b) => (b.pageCount || 0) - (a.pageCount || 0));
    } else {
      docs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    }

    return docs;
  }

  function renderDocsHTML(docs) {
    const totalCount = workspaceStore.getState().documents.filter(d => !d.isComparisonOnly).length;
    if (totalCount === 0) {
      return `
        <div class="card empty-state-box" style="padding: 48px 24px; text-align: center;">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#64748B" stroke-width="1.5" style="margin: 0 auto 16px;">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
          <h3>No study materials uploaded yet</h3>
          <p style="color: var(--color-text-muted); margin-bottom: 20px;">Upload course syllabi, lecture slides, or textbook chapters in PDF format (up to ${MAX_UPLOAD_MIB} MiB per file).</p>
          <button type="button" class="btn btn-primary" id="emptyUploadBtn">Upload your first PDF</button>
        </div>
      `;
    }

    if (docs.length === 0) {
      return `
        <div class="card empty-state-box">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#64748B" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
          <h3>No study materials match your search</h3>
          <p>Try clearing filters or uploading a course PDF to review.</p>
          <button type="button" class="btn btn-secondary btn-sm" id="clearFiltersBtn">Reset Filters</button>
        </div>
      `;
    }

    if (viewMode === 'list') {
      return `
        <div class="card materials-table-card">
          <div class="table-responsive">
            <table class="materials-table">
              <thead>
                <tr>
                  <th width="40"><input type="checkbox" id="selectAllDocsCheckbox" aria-label="Select all documents"></th>
                  <th>DOCUMENT TITLE & FILENAME</th>
                  <th>AUTHOR / SOURCE</th>
                  <th>PAGES</th>
                  <th>FILE SIZE</th>
                  <th>STATUS</th>
                  <th class="text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                ${docs.map(doc => `
                  <tr data-doc-id="${doc.id}">
                    <td><input type="checkbox" class="doc-row-checkbox" value="${doc.id}"></td>
                    <td>
                      <div class="doc-title-cell">
                        <div class="doc-icon-wrap">
                          <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor">
                            <path d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7.414A2 2 0 0017.414 6L13.586 2.172A2 2 0 0012.172 2H4z"/>
                          </svg>
                        </div>
                        <div>
                          <button type="button" class="doc-title-btn open-reader-link" data-doc-id="${doc.id}">${doc.title}</button>
                          <span class="doc-filename-sub">${doc.filename}</span>
                        </div>
                      </div>
                    </td>
                    <td class="text-muted">${doc.author}</td>
                    <td>${typeof doc.pageCount === 'number' && doc.pageCount > 0 ? `${doc.pageCount} pp` : '<span class="text-muted" title="Page count unavailable">Unavailable</span>'}</td>
                    <td class="text-muted">${doc.fileSize}</td>
                    <td>
                      ${statusBadge(doc)}
                    </td>
                    <td class="text-right actions-cell">
                      <button type="button" class="btn btn-secondary btn-xs open-reader-btn" data-doc-id="${doc.id}">
                        Read
                      </button>
                      ${doc.backendDocument && doc.status === 'failed' ? `
                        <button type="button" class="btn btn-secondary btn-xs retry-index-btn" data-doc-id="${doc.id}">Retry</button>
                      ` : ''}
                      <button type="button" class="btn-action-icon bookmark-doc-btn ${doc.isBookmarked ? 'bookmarked' : ''}" data-doc-id="${doc.id}" title="${doc.isBookmarked ? 'Remove bookmark' : 'Bookmark document'}" aria-label="Bookmark">
                        <svg viewBox="0 0 20 20" width="14" height="14" fill="${doc.isBookmarked ? '#0F766E' : 'none'}" stroke="currentColor" stroke-width="2">
                          <path d="M5 3a2 2 0 0 0-2 2v14l7-4 7 4V5a2 2 0 0 0-2-2H5z"/>
                        </svg>
                      </button>
                      <button type="button" class="btn-action-icon rename-doc-btn" data-doc-id="${doc.id}" title="Rename title" aria-label="Rename">
                        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                        </svg>
                      </button>
                      <button type="button" class="btn-action-icon text-danger delete-doc-btn" data-doc-id="${doc.id}" title="Delete document" aria-label="Delete">
                        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M6 7v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7M4 7h12M8 4h4"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    return `
      <div class="materials-grid-layout">
        ${docs.map(doc => `
          <div class="card material-grid-card" data-doc-id="${doc.id}">
            <div class="grid-card-top">
              <div class="doc-icon-wrap lg">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <div class="grid-card-badges">
                ${statusBadge(doc)}
                ${doc.isBookmarked ? `<span class="bookmark-star-badge">★</span>` : ''}
              </div>
            </div>

            <button type="button" class="doc-title-btn grid-doc-title open-reader-link" data-doc-id="${doc.id}">${doc.title}</button>
            <p class="grid-doc-filename">${doc.filename}</p>

            <div class="grid-doc-meta-row">
              <span>${doc.author}</span>
              <span>•</span>
              <span>${typeof doc.pageCount === 'number' && doc.pageCount > 0 ? `${doc.pageCount} pages` : 'Page count unavailable'} • ${doc.fileSize}</span>
            </div>

            <div class="grid-card-footer">
              <button type="button" class="btn btn-secondary btn-xs open-reader-btn" data-doc-id="${doc.id}">
                Open Reader
              </button>
              ${doc.backendDocument && doc.status === 'failed' ? `
                <button type="button" class="btn btn-secondary btn-xs retry-index-btn" data-doc-id="${doc.id}">Retry</button>
              ` : ''}
              <div class="grid-footer-icons">
                <button type="button" class="btn-action-icon bookmark-doc-btn ${doc.isBookmarked ? 'bookmarked' : ''}" data-doc-id="${doc.id}" title="Bookmark" aria-label="Bookmark">
                  ${doc.isBookmarked ? '★' : '☆'}
                </button>
                <button type="button" class="btn-action-icon rename-doc-btn" data-doc-id="${doc.id}" title="Rename" aria-label="Rename">✎</button>
                <button type="button" class="btn-action-icon delete-doc-btn text-danger" data-doc-id="${doc.id}" title="Delete" aria-label="Delete">🗑</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function updateResultsMount() {
    const mount = container.querySelector('#materialsResultsMount');
    if (!mount) return;
    const docs = getFilteredDocs();
    mount.innerHTML = renderDocsHTML(docs);
    bindDocumentActionEvents();

    const emptyBtn = mount.querySelector('#emptyUploadBtn');
    if (emptyBtn) {
      emptyBtn.addEventListener('click', () => openUploadModal(() => {
        renderView();
        scheduleStatusPoll();
      }));
    }

    const clearBtn = mount.querySelector('#clearFiltersBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        searchQuery = '';
        statusFilter = 'all';
        sortKey = 'newest';
        const searchInput = container.querySelector('#materialsSearchInput');
        const statusSelect = container.querySelector('#statusFilterSelect');
        const sortSelect = container.querySelector('#sortSelect');
        if (searchInput) searchInput.value = '';
        if (statusSelect) statusSelect.value = 'all';
        if (sortSelect) sortSelect.value = 'newest';
        updateResultsMount();
      });
    }
  }

  function renderView() {
    const state = workspaceStore.getState();
    const courseDesc = state.course ? ` for ${state.course.name}` : '';

    container.innerHTML = `
      <div class="view-materials-page">
        
        <!-- Header & Action Row -->
        <header class="page-header-row">
          <div class="header-text">
            <h1 class="page-title">Study Materials</h1>
            <p class="page-desc">Academic textbooks, lecture slide packages, and verified course readings${courseDesc}.</p>
          </div>

          <div class="header-buttons">
            <button type="button" class="btn btn-secondary" id="checkConflictsBtn" style="display: inline-flex; align-items: center; gap: 6px;">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Source Conflicts
            </button>
            <button type="button" class="btn btn-secondary" id="compareVersionsBtn">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4v12m12-12v12M8 8h4M8 12h4"/>
              </svg>
              Compare Editions
            </button>
            <button type="button" class="btn btn-primary" id="openUploadModalBtn">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 3v10m-4-4l4-4 4 4M3 15h14"/>
              </svg>
              Upload PDF
            </button>
          </div>
        </header>

        <!-- Filters & Search Toolbar -->
        <div class="materials-toolbar card">
          <div class="toolbar-search">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="8.5" cy="8.5" r="5.5"/><line x1="13" y1="13" x2="18" y2="18"/>
            </svg>
            <input type="text" id="materialsSearchInput" value="${searchQuery}" placeholder="Search materials by title or filename..." class="filter-input" autocomplete="off">
          </div>

          <div class="toolbar-controls">
            <div class="control-group">
              <label class="control-label" for="statusFilterSelect">Status:</label>
              <select id="statusFilterSelect" class="filter-select">
                <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>All Sources</option>
                <option value="indexed" ${statusFilter === 'indexed' ? 'selected' : ''}>Ready</option>
                <option value="processing" ${statusFilter === 'processing' ? 'selected' : ''}>Processing</option>
                <option value="failed" ${statusFilter === 'failed' ? 'selected' : ''}>Failed</option>
                <option value="local_preview" ${statusFilter === 'local_preview' ? 'selected' : ''}>Local Previews</option>
              </select>
            </div>

            <div class="control-group">
              <label class="control-label" for="sortSelect">Sort:</label>
              <select id="sortSelect" class="filter-select">
                <option value="newest" ${sortKey === 'newest' ? 'selected' : ''}>Newest First</option>
                <option value="name" ${sortKey === 'name' ? 'selected' : ''}>Title (A-Z)</option>
                <option value="pages" ${sortKey === 'pages' ? 'selected' : ''}>Page Count</option>
              </select>
            </div>

            <div class="view-switch-btns">
              <button type="button" class="btn-icon-toggle ${viewMode === 'list' ? 'active' : ''}" id="switchListBtn" aria-label="List view" title="List view">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="3" y1="6" x2="17" y2="6"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="14" x2="17" y2="14"/>
                </svg>
              </button>
              <button type="button" class="btn-icon-toggle ${viewMode === 'grid' ? 'active' : ''}" id="switchGridBtn" aria-label="Grid view" title="Grid view">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="5" height="5"/><rect x="12" y="3" width="5" height="5"/><rect x="3" y="12" width="5" height="5"/><rect x="12" y="12" width="5" height="5"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Stable Mount for Document Results -->
        <div id="materialsResultsMount">
          ${renderDocsHTML(getFilteredDocs())}
        </div>

      </div>
    `;

    bindToolbarEvents();
    bindDocumentActionEvents();
  }

  function bindToolbarEvents() {
    const searchInput = container.querySelector('#materialsSearchInput');
    const statusSelect = container.querySelector('#statusFilterSelect');
    const sortSelect = container.querySelector('#sortSelect');
    const switchListBtn = container.querySelector('#switchListBtn');
    const switchGridBtn = container.querySelector('#switchGridBtn');
    const openUploadModalBtn = container.querySelector('#openUploadModalBtn');
    const compareVersionsBtn = container.querySelector('#compareVersionsBtn');
    const checkConflictsBtn = container.querySelector('#checkConflictsBtn');

    if (checkConflictsBtn) {
      checkConflictsBtn.addEventListener('click', async () => {
        checkConflictsBtn.disabled = true;
        checkConflictsBtn.textContent = 'Scanning...';
        try {
          const state = workspaceStore.getState();
          const res = await sylloraApi.listConflicts(state.course?.id || null);
          const conflicts = res.conflicts || [];
          if (conflicts.length === 0) {
            Modal.open(
              'Source Conflict Detector (F12)',
              `
                <div style="padding: 24px; text-align: center;">
                  <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#059669" stroke-width="2" style="margin: 0 auto 12px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  <h3 style="font-size: 17px; font-weight: 700; color: #1E293B;">No Conflicting Passages Found</h3>
                  <p style="color: #64748B; font-size: 13.5px; margin-top: 6px;">All indexed study documents are mutually consistent. When contradictory definitions, formulas, or numbers are identified across different editions or notes, they will appear here with page citations.</p>
                </div>
              `,
              null,
              'Got It'
            );
          } else {
            Modal.open(
              'Source Conflicts Detected (F12)',
              `
                <div style="display: flex; flex-direction: column; gap: 16px; max-height: 480px; overflow-y: auto;">
                  ${conflicts.map((c, i) => `
                    <div style="border: 1px solid #E2E8EE; border-radius: 10px; padding: 14px; background: #FFFFFF;">
                      <div style="font-size: 14px; font-weight: 700; color: #DC2626; margin-bottom: 8px;">
                        Conflict #${i + 1}: ${c.conflict_type || 'Discrepancy'}
                      </div>
                      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 8px;">
                        <div style="background: #F8FAFC; padding: 10px; border-radius: 6px; border-left: 3px solid #03605E;">
                          <div style="font-size: 12px; font-weight: 600; color: #5F6F82; margin-bottom: 4px;">Source A (${c.source_a?.document_title || 'Document'}, p.${c.source_a?.page || '?'})</div>
                          <div style="font-size: 13px; color: #1E293B;">"${c.source_a?.passage || ''}"</div>
                        </div>
                        <div style="background: #F8FAFC; padding: 10px; border-radius: 6px; border-left: 3px solid #E11D48;">
                          <div style="font-size: 12px; font-weight: 600; color: #5F6F82; margin-bottom: 4px;">Source B (${c.source_b?.document_title || 'Document'}, p.${c.source_b?.page || '?'})</div>
                          <div style="font-size: 13px; color: #1E293B;">"${c.source_b?.passage || ''}"</div>
                        </div>
                      </div>
                      <div style="font-size: 12.5px; color: #64748B;">
                        <strong>AI Analysis:</strong> ${c.explanation || ''}
                      </div>
                    </div>
                  `).join('')}
                </div>
              `,
              null,
              'Close'
            );
          }
        } catch (err) {
          Toast.show(`Could not scan conflicts: ${err.message}`, 'error');
        } finally {
          checkConflictsBtn.disabled = false;
          checkConflictsBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Source Conflicts
          `;
        }
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value; // Preserve raw value and spaces!
        updateResultsMount();
      });
    }

    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        statusFilter = e.target.value;
        updateResultsMount();
      });
    }

    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        sortKey = e.target.value;
        updateResultsMount();
      });
    }

    if (switchListBtn && switchGridBtn) {
      switchListBtn.addEventListener('click', () => {
        viewMode = 'list';
        switchListBtn.classList.add('active');
        switchGridBtn.classList.remove('active');
        updateResultsMount();
      });
      switchGridBtn.addEventListener('click', () => {
        viewMode = 'grid';
        switchGridBtn.classList.add('active');
        switchListBtn.classList.remove('active');
        updateResultsMount();
      });
    }

    if (openUploadModalBtn) {
      openUploadModalBtn.addEventListener('click', () => openUploadModal(() => {
        renderView();
        scheduleStatusPoll();
      }));
    }

    if (compareVersionsBtn) {
      compareVersionsBtn.addEventListener('click', openVersionComparisonModal);
    }
  }

  function bindDocumentActionEvents() {
    container.querySelectorAll('.open-reader-btn, .open-reader-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const docId = btn.getAttribute('data-doc-id');
        PdfReader.open(docId, 1);
      });
    });

    container.querySelectorAll('.bookmark-doc-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const docId = btn.getAttribute('data-doc-id');
        workspaceStore.toggleBookmarkDocument(docId);
        Toast.show('Bookmark updated.', 'info');
        updateResultsMount();
      });
    });

    container.querySelectorAll('.rename-doc-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const docId = btn.getAttribute('data-doc-id');
        const doc = workspaceStore.getState().documents.find(d => d.id === docId);
        if (!doc) return;

        Modal.open(
          'Rename Document Title',
          `
            <div class="form-group">
              <label class="form-label" for="renameInput">Display Title:</label>
              <input type="text" id="renameInput" class="form-input" value="${doc.title}">
              <p class="text-muted text-xs mt-1">Filename: ${doc.filename} (Original binary unchanged)</p>
            </div>
          `,
          () => {
            const val = document.getElementById('renameInput').value.trim();
            if (val) {
              workspaceStore.renameDocument(docId, val);
              Toast.show('Document renamed successfully.', 'success');
              updateResultsMount();
            }
          },
          'Save Name'
        );
      });
    });

    container.querySelectorAll('.delete-doc-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const docId = btn.getAttribute('data-doc-id');
        const doc = workspaceStore.getState().documents.find(d => d.id === docId);
        if (!doc) return;

        Modal.open(
          'Confirm Document Deletion',
          `
            <p>Are you sure you want to delete <strong>${doc.title}</strong> (${doc.filename})?</p>
            <p class="text-muted text-sm mt-2">All associated passage citations and references will be safely disconnected to prevent dangling citations.</p>
          `,
          async () => {
            try {
              if (doc.backendDocument) {
                await sylloraApi.deleteDocument(docId);
              }
              workspaceStore.deleteDocument(docId);
              Toast.show('Document removed from the library and AI index.', 'success');
              updateResultsMount();
            } catch (err) {
              Toast.show(`Could not remove the AI-indexed document: ${err.message}`, 'error', 6000);
              return false;
            }
          },
          'Delete Document',
          'danger'
        );
      });
    });

    container.querySelectorAll('.retry-index-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const docId = btn.getAttribute('data-doc-id');
        btn.disabled = true;
        try {
          await sylloraApi.retryDocumentIndex(docId);
          workspaceStore.updateDocument(docId, { status: 'pending', indexError: null });
          Toast.show('AI search preparation restarted.', 'info');
          updateResultsMount();
          scheduleStatusPoll();
        } catch (error) {
          Toast.show(`Could not retry indexing: ${error.message}`, 'error', 6000);
          btn.disabled = false;
        }
      });
    });
  }

  // Initial render
  renderView();

  // Synchronize latest document library from Supabase backend
  workspaceStore.syncWithBackend().then(() => {
    if (!viewActive) return;
    updateResultsMount();
    scheduleStatusPoll();
  }).catch(error => {
    console.warn('[Study Materials] Initial library sync failed:', error);
  });

  // Trigger modal if queryParams has upload flag
  if (queryParams.upload === '1') {
    window.setTimeout(() => {
      if (viewActive) {
        openUploadModal(() => {
          renderView();
          scheduleStatusPoll();
        });
      }
    }, 100);
  }

  return () => {
    viewActive = false;
    if (statusPollTimer !== null) window.clearTimeout(statusPollTimer);
  };
}

export function openUploadModal(onSuccess) {
  let uploadQueue = [];
  let isUploading = false;

  const modalContent = `
    <div class="upload-dialog-inner">
      <div class="upload-dropzone" id="modalDropzone">
        <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="#0F766E" stroke-width="1.8">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
        </svg>
        <h4>Drag & Drop academic PDF here</h4>
        <p class="text-muted text-sm">PDF files up to ${MAX_UPLOAD_MIB} MiB per file.</p>
        <input type="file" id="modalFileInput" accept=".pdf,application/pdf" multiple style="display:none;">
        <div class="dropzone-actions mt-2">
          <button type="button" class="btn btn-secondary btn-sm" id="triggerFileSelectBtn">Browse local files</button>
        </div>
      </div>

      <div class="upload-queue-container" id="uploadQueueContainer" style="display:none;">
        <h5 class="queue-heading">Upload Queue</h5>
        <ul class="queue-list" id="queueList"></ul>
      </div>
    </div>
  `;

  const overlay = Modal.open(
    'Upload Study Materials',
    modalContent,
    async () => {
      if (isUploading) return false;
      if (uploadQueue.length === 0) {
        Toast.show('No valid PDFs in upload queue. Please select or drag a PDF first.', 'error');
        return false;
      }

      isUploading = true;
      const results = [];
      const failures = [];

      try {
        await sylloraApi.health();
      } catch (error) {
        isUploading = false;
        Toast.show(
          'AI service is temporarily unreachable. Your files have not been uploaded. Please retry.',
          'error',
          6000
        );
        return false;
      }

      let uploadStatusUnknown = false;
      for (const file of uploadQueue) {
        try {
          const title = file.name.replace(/\.pdf$/i, '').replace(/_/g, ' ');
          let backendDoc;
          try {
            backendDoc = await sylloraApi.uploadDocument(file, title);
          } catch (uploadError) {
            const message = String(uploadError && uploadError.message || '');
            if (uploadError.code === 'API_NETWORK_ERROR') {
              uploadStatusUnknown = true;
              failures.push({ file, error: uploadError });
              break;
            }
            if (!/already been uploaded|HTTP 409|409/i.test(message)) throw uploadError;
            const listing = await sylloraApi.listDocuments();
            const serverDocs = Array.isArray(listing.documents) ? listing.documents : [];
            backendDoc = serverDocs.find(item =>
              String(item.filename || '').toLowerCase() === file.name.toLowerCase()
            );
            if (!backendDoc) throw uploadError;
          }

          let saveResult;
          try {
            saveResult = await savePdfBlob(backendDoc.id, file);
          } catch (storageError) {
            console.warn('[Upload] Browser PDF persistence failed:', storageError);
            saveResult = { success: false, persistent: false, memoryOnly: true };
          }

          const isPersistent = Boolean(saveResult && saveResult.persistent);
          workspaceStore.addDocument({
            id: backendDoc.id,
            title: backendDoc.title || title,
            filename: backendDoc.filename || file.name,
            author: 'Uploaded to Syllora AI',
            pageCount: Number(backendDoc.page_count) || null,
            fileSize: `${((backendDoc.size_bytes ?? file.size) / 1024).toFixed(1)} KB`,
            uploadedAt: new Date().toISOString().split('T')[0],
            status: backendDoc.index_status || backendDoc.status || 'pending',
            backendDocument: true,
            backendChunkCount: Number(backendDoc.chunk_count) || 0,
            indexError: backendDoc.index_error || null,
            embeddingModel: backendDoc.embedding_model || null,
            isPersistent,
            isBookmarked: false,
            blobFile: file
          });
          results.push({ file, isPersistent, backendDoc });
        } catch (err) {
          console.error('[Upload] Could not store PDF:', file.name, err);
          failures.push({ file, error: err });
        }
      }

      if (results.length === 0) {
        const firstFailure = failures[0] && failures[0].error;
        Toast.show(
          uploadStatusUnknown
            ? 'AI service is temporarily unreachable. Upload status could not be confirmed; check Study Materials before retrying.'
            : `No PDF was stored. ${firstFailure ? firstFailure.message : 'Please retry.'}`,
          'error',
          6000
        );
        isUploading = false;
        return false;
      }

      const savedLocally = results.filter(r => r.isPersistent).length;
      const memoryOnly = results.length - savedLocally;
      const stillProcessing = results.some(result =>
        ['pending', 'processing'].includes(
          result.backendDoc.index_status || result.backendDoc.status
        )
      );
      const summary = `${results.length} PDF(s) saved to Study Materials.` +
        (stillProcessing ? ' AI search preparation is in progress.' : ' Ready for AI search.') +
        (failures.length ? ` ${failures.length} upload(s) could not be confirmed.` : '');
      Toast.show(summary, failures.length || uploadStatusUnknown ? 'warning' : 'success', 6000);

      if (typeof onSuccess === 'function') onSuccess();
      return true;
    },
    'Add to Workspace',
    'primary'
  );

    const dropzone = overlay.querySelector('#modalDropzone');
    const fileInput = overlay.querySelector('#modalFileInput');
    const triggerBtn = overlay.querySelector('#triggerFileSelectBtn');
    const queueContainer = overlay.querySelector('#uploadQueueContainer');
    const queueList = overlay.querySelector('#queueList');

    triggerBtn.addEventListener('click', () => fileInput.click());

    const handleFiles = (fileList) => {
      const state = workspaceStore.getState();
      const existingNames = new Set(state.documents.map(d => d.filename.toLowerCase()));

      Array.from(fileList).forEach(file => {
        // Validation: PDF Only
        if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
          Toast.show(`"${file.name}" rejected: Only PDF files are supported.`, 'error');
          return;
        }

        // Enforce the configured private-storage upload ceiling.
        if (file.size > MAX_UPLOAD_BYTES) {
          Toast.show(`"${file.name}" rejected: Exceeds ${MAX_UPLOAD_MIB} MiB maximum file size limit.`, 'error');
          return;
        }

        // Duplicate Check
        if (existingNames.has(file.name.toLowerCase()) || uploadQueue.some(f => f.name.toLowerCase() === file.name.toLowerCase())) {
          Toast.show(`"${file.name}" is already present in workspace library.`, 'error');
          return;
        }

        try {
          file.blobUrl = URL.createObjectURL(file);
        } catch {}
        uploadQueue.push(file);
      });

      renderQueue();
    };

    const renderQueue = () => {
      if (uploadQueue.length === 0) {
        queueContainer.style.display = 'none';
        return;
      }
      queueContainer.style.display = 'block';
      queueList.innerHTML = uploadQueue.map((file, i) => `
        <li class="queue-item">
          <div class="queue-item-info">
            <span class="queue-doc-name">${file.name}</span>
            <span class="queue-doc-meta">${(file.size / 1024).toFixed(1)} KB • Waiting for Syllora AI indexing</span>
          </div>
          <button type="button" class="btn-remove-queue" data-index="${i}" aria-label="Remove">&times;</button>
        </li>
      `).join('');

      queueList.querySelectorAll('.btn-remove-queue').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.getAttribute('data-index'), 10);
          uploadQueue.splice(idx, 1);
          renderQueue();
        });
      });
    };

    fileInput.addEventListener('change', () => handleFiles(fileInput.files));

    // Drag-and-drop events
    ['dragenter', 'dragover'].forEach(ev => {
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        dropzone.classList.add('drag-active');
      });
    });

    ['dragleave', 'drop'].forEach(ev => {
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-active');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files) {
        handleFiles(e.dataTransfer.files);
      }
    });
  }

  // Demo Document-Update Comparison Modal (v1 vs v2)
  function openVersionComparisonModal() {
    Modal.open(
      'Edition Comparison: Silberschatz Chapter 8 (v1 vs v2)',
      `
        <div class="doc-compare-wrapper">
          <p class="text-sm text-muted mb-3">
            Syllora compares verified sample versions to flag changed academic passages and highlight affected saved student notes.
          </p>

          <div class="compare-diff-grid">
            <div class="diff-column before">
              <div class="diff-col-header">
                <span class="version-badge">9th Edition (Base Sample)</span>
                <h4>Silberschatz_OS_Deadlocks_Ch8.pdf</h4>
              </div>
              
              <div class="diff-passage-block">
                <span class="diff-page-tag">Page 2: Coffman Condition #3</span>
                <p class="diff-text old">"3. No Preemption: Resources cannot be forcibly preempted; a resource can be released only voluntarily by the process holding it."</p>
              </div>

              <div class="diff-passage-block">
                <span class="diff-page-tag">Page 3: Starvation Definition</span>
                <p class="diff-text old">"Starvation occurs when a runnable process is perpetually denied access because resources are continuously allocated to higher-priority processes."</p>
              </div>
            </div>

            <div class="diff-column after">
              <div class="diff-col-header">
                <span class="version-badge new">10th Edition (Updated Sample)</span>
                <h4>Silberschatz_OS_Deadlocks_Ch8_v2.pdf</h4>
              </div>

              <div class="diff-passage-block">
                <span class="diff-page-tag">Page 2: Revised Condition #3</span>
                <p class="diff-text new">"3. No Preemption: Resources cannot be preempted; lock release is cooperative only. <mark>Revision note: Non-cooperative thread termination introduces orphan mutex issues in multicore architectures.</mark>"</p>
              </div>

              <div class="diff-passage-block">
                <span class="diff-page-tag">Page 3: Quantitative Metric Added</span>
                <p class="diff-text new">"Starvation is a dynamic performance pathology where system throughput continues normally while specific threads suffer infinite latency. <mark>Empirical benchmarks show starvation occurs 14x more frequently than deadlock in cloud clusters.</mark>"</p>
              </div>
            </div>
          </div>

          <div class="compare-audit-impact">
            <h5>Impact on Student Workspace:</h5>
            <ul>
              <li><strong>Affects Misconception #1:</strong> New benchmark citation clarifies priority starvation vs terminal circular deadlock.</li>
              <li><strong>Affects Topic #1:</strong> New multicore orphan mutex note added to prerequisite study notes.</li>
            </ul>
          </div>
        </div>
      `,
      null,
      'Close Comparison'
    );
  }
