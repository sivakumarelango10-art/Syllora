/**
 * ============================================================================
 * VIEW: STUDY MATERIALS LIBRARY & COMPARISON
 * ============================================================================
 * - List and Grid view switching
 * - Search, type/status filtering, and sorting
 * - Drag-and-drop 20MB PDF upload dialog with queue & duplicate validation
 * - Clear "LOCAL PREVIEW" labelling for newly added files
 * - Rename, Bookmark, Delete with confirmation
 * - Embedded PDF Document Reader
 * - Bundled Document Update Comparison (Edition 9 vs Edition 10 revised)
 */

import { workspaceStore } from '../state.js';
import { PdfReader } from '../components/pdfViewer.js';
import { Modal, Toast } from '../components/modal.js';
import { savePdfBlob } from '../storage.js';

export function renderMaterials(container, queryParams = {}) {
  let viewMode = 'list'; // 'list' | 'grid'
  let searchQuery = '';
  let statusFilter = 'all'; // 'all' | 'indexed' | 'local_preview'
  let sortKey = 'newest'; // 'newest' | 'name' | 'pages'

  function renderView() {
    const state = workspaceStore.getState();
    let docs = state.documents.filter(d => !d.isComparisonOnly);

    // Apply filters
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      docs = docs.filter(d => d.title.toLowerCase().includes(q) || d.filename.toLowerCase().includes(q) || d.author.toLowerCase().includes(q));
    }

    if (statusFilter !== 'all') {
      docs = docs.filter(d => d.status === statusFilter);
    }

    // Apply sorting
    if (sortKey === 'name') {
      docs.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortKey === 'pages') {
      docs.sort((a, b) => b.pageCount - a.pageCount);
    } else {
      docs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    }

    container.innerHTML = `
      <div class="view-materials-page">
        
        <!-- Header & Action Row -->
        <header class="page-header-row">
          <div class="header-text">
            <h1 class="page-title">Study Materials</h1>
            <p class="page-desc">Academic textbooks, lecture slide packages, and verified course readings for CS301.</p>
          </div>

          <div class="header-buttons">
            <button type="button" class="btn btn-secondary" id="compareVersionsBtn">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4v12m12-12v12M8 8h4M8 12h4"/>
              </svg>
              Compare Editions (v1 vs v2)
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
            <input type="text" id="materialsSearchInput" value="${searchQuery}" placeholder="Search materials by title or filename..." class="filter-input">
          </div>

          <div class="toolbar-controls">
            <div class="control-group">
              <label class="control-label">Status:</label>
              <select id="statusFilterSelect" class="filter-select">
                <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>All Sources</option>
                <option value="indexed" ${statusFilter === 'indexed' ? 'selected' : ''}>Indexed Samples</option>
                <option value="local_preview" ${statusFilter === 'local_preview' ? 'selected' : ''}>Local Previews</option>
              </select>
            </div>

            <div class="control-group">
              <label class="control-label">Sort:</label>
              <select id="sortSelect" class="filter-select">
                <option value="newest" ${sortKey === 'newest' ? 'selected' : ''}>Newest First</option>
                <option value="name" ${sortKey === 'name' ? 'selected' : ''}>Title (A-Z)</option>
                <option value="pages" ${sortKey === 'pages' ? 'selected' : ''}>Page Count</option>
              </select>
            </div>

            <div class="view-switch-btns">
              <button type="button" class="btn-icon-toggle ${viewMode === 'list' ? 'active' : ''}" id="switchListBtn" aria-label="List view">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="3" y1="6" x2="17" y2="6"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="14" x2="17" y2="14"/>
                </svg>
              </button>
              <button type="button" class="btn-icon-toggle ${viewMode === 'grid' ? 'active' : ''}" id="switchGridBtn" aria-label="Grid view">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="5" height="5"/><rect x="12" y="3" width="5" height="5"/><rect x="3" y="12" width="5" height="5"/><rect x="12" y="12" width="5" height="5"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Documents View Container -->
        ${docs.length === 0 ? `
          <div class="card empty-state-box">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#64748B" stroke-width="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            <h3>No study materials match your search</h3>
            <p>Try clearing filters or uploading a course PDF to review.</p>
            <button type="button" class="btn btn-secondary btn-sm" id="clearFiltersBtn">Reset Filters</button>
          </div>
        ` : viewMode === 'list' ? `
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
                        ${doc.status === 'indexed' ? `
                          <span class="pill-badge pill-green">Indexed Sample</span>
                        ` : `
                          <span class="pill-badge pill-amber" title="Newly selected local preview (not semantically indexed)">LOCAL PREVIEW</span>
                        `}
                      </td>
                      <td class="text-right actions-cell">
                        <button type="button" class="btn btn-secondary btn-xs open-reader-btn" data-doc-id="${doc.id}">
                          Read
                        </button>
                        <button type="button" class="btn-action-icon bookmark-doc-btn ${doc.isBookmarked ? 'bookmarked' : ''}" data-doc-id="${doc.id}" title="${doc.isBookmarked ? 'Remove bookmark' : 'Bookmark document'}">
                          <svg viewBox="0 0 20 20" width="14" height="14" fill="${doc.isBookmarked ? '#0F766E' : 'none'}" stroke="currentColor" stroke-width="2">
                            <path d="M5 3a2 2 0 0 0-2 2v14l7-4 7 4V5a2 2 0 0 0-2-2H5z"/>
                          </svg>
                        </button>
                        <button type="button" class="btn-action-icon rename-doc-btn" data-doc-id="${doc.id}" title="Rename title">
                          <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                          </svg>
                        </button>
                        <button type="button" class="btn-action-icon text-danger delete-doc-btn" data-doc-id="${doc.id}" title="Delete document">
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
        ` : `
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
                    ${doc.status === 'indexed' ? `
                      <span class="pill-badge pill-green">Indexed</span>
                    ` : `
                      <span class="pill-badge pill-amber">Local Preview</span>
                    `}
                    ${doc.isBookmarked ? `<span class="bookmark-star-badge">★</span>` : ''}
                  </div>
                </div>

                <h3 class="grid-doc-title">${doc.title}</h3>
                <p class="grid-doc-filename">${doc.filename}</p>

                <div class="grid-doc-meta-row">
                  <span>${doc.author}</span>
                  <span>${typeof doc.pageCount === 'number' && doc.pageCount > 0 ? `${doc.pageCount} pages` : 'Page count unavailable'} • ${doc.fileSize}</span>
                </div>

                <div class="grid-card-footer">
                  <button type="button" class="btn btn-primary btn-sm open-reader-btn" data-doc-id="${doc.id}">
                    Open Reader
                  </button>
                  <div class="grid-footer-icons">
                    <button type="button" class="btn-action-icon rename-doc-btn" data-doc-id="${doc.id}" title="Rename">✎</button>
                    <button type="button" class="btn-action-icon delete-doc-btn text-danger" data-doc-id="${doc.id}" title="Delete">🗑</button>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        `}

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
    const clearFiltersBtn = container.querySelector('#clearFiltersBtn');
    const openUploadModalBtn = container.querySelector('#openUploadModalBtn');
    const compareVersionsBtn = container.querySelector('#compareVersionsBtn');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim();
        renderView();
      });
    }

    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        statusFilter = e.target.value;
        renderView();
      });
    }

    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        sortKey = e.target.value;
        renderView();
      });
    }

    if (switchListBtn) switchListBtn.addEventListener('click', () => { viewMode = 'list'; renderView(); });
    if (switchGridBtn) switchGridBtn.addEventListener('click', () => { viewMode = 'grid'; renderView(); });

    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener('click', () => {
        searchQuery = '';
        statusFilter = 'all';
        sortKey = 'newest';
        renderView();
      });
    }

    if (openUploadModalBtn) {
      openUploadModalBtn.addEventListener('click', () => openUploadModal(renderView));
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
        renderView();
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
              renderView();
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
          () => {
            workspaceStore.deleteDocument(docId);
            Toast.show('Document removed from library.', 'info');
            renderView();
          },
          'Delete Document',
          'danger'
        );
      });
    });
  }

  // Initial render
  renderView();

  // Trigger modal if queryParams has upload flag
  if (queryParams.upload === '1') {
    setTimeout(() => openUploadModal(renderView), 100);
  }
}

export function openUploadModal(onSuccess) {
  let uploadQueue = [];

  const modalContent = `
    <div class="upload-dialog-inner">
      <div class="upload-dropzone" id="modalDropzone">
        <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="#0F766E" stroke-width="1.8">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
        </svg>
        <h4>Drag & Drop academic PDF here</h4>
        <p class="text-muted text-sm">Strictly PDF files up to 20MB per file.</p>
        <input type="file" id="modalFileInput" accept=".pdf,application/pdf" multiple style="display:none;">
        <div class="dropzone-actions mt-2">
          <button type="button" class="btn btn-secondary btn-sm" id="triggerFileSelectBtn">Browse local files</button>
          <button type="button" class="btn btn-secondary btn-sm ml-2" id="testLoadSampleBtn" title="Load sample student PDF for local preview testing">Load Test PDF</button>
        </div>
      </div>

      <div class="upload-validation-banner pill-amber" id="uploadNoticeBanner">
        <strong>Note:</strong> Uploaded files in this frontend demo are added as <em>LOCAL PREVIEWS</em> for page inspection. They are not indexed by backend AI services.
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
    () => {
      if (uploadQueue.length === 0) {
        Toast.show('No valid PDFs in upload queue.', 'error');
        return;
      }

      const savePromises = uploadQueue.map(async (file) => {
        const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        try {
          await savePdfBlob(docId, file);
        } catch (err) {
          console.warn('[Upload] IndexedDB save failed:', err);
        }
        workspaceStore.addDocument({
          id: docId,
          title: file.name.replace(/\.pdf$/i, '').replace(/_/g, ' '),
          filename: file.name,
          author: 'Local Student Upload',
          pageCount: null,
          fileSize: `${(file.size / 1024).toFixed(1)} KB`,
          uploadedAt: new Date().toISOString().split('T')[0],
          status: 'local_preview', // explicit LOCAL PREVIEW labelling
          isBookmarked: false,
          blobFile: file
        });
      });

      Promise.all(savePromises).then(() => {
        Toast.show(`Successfully added ${uploadQueue.length} document(s) as local previews.`, 'success');
        if (typeof onSuccess === 'function') onSuccess();
      });
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

    const testSampleBtn = overlay.querySelector('#testLoadSampleBtn');
    if (testSampleBtn) {
      testSampleBtn.addEventListener('click', async () => {
        try {
          const res = await fetch('assets/docs/Silberschatz_OS_Deadlocks_Ch8.pdf');
          const blob = await res.blob();
          const file = new File([blob], 'student_coursework_sample.pdf', { type: 'application/pdf' });
          handleFiles([file]);
        } catch (e) {
          Toast.show('Failed to load sample: ' + e.message, 'error');
        }
      });
    }

    const handleFiles = (fileList) => {
      const state = workspaceStore.getState();
      const existingNames = new Set(state.documents.map(d => d.filename.toLowerCase()));

      Array.from(fileList).forEach(file => {
        // Validation: PDF Only
        if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
          Toast.show(`"${file.name}" rejected: Only PDF files are supported.`, 'error');
          return;
        }

        // Validation: 20MB limit
        if (file.size > 20 * 1024 * 1024) {
          Toast.show(`"${file.name}" rejected: Exceeds 20MB maximum file size limit.`, 'error');
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
            <span class="queue-doc-meta">${(file.size / 1024).toFixed(1)} KB • Local preview (Page count: Unknown)</span>
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


