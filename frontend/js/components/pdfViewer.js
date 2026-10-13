/**
 * ============================================================================
 * REAL PDF DOCUMENT READER & EXCERPT INSPECTOR
 * ============================================================================
 * Renders bundled sample PDFs and local preview blob URLs at exact cited pages
 * with verified excerpt quotes, scroll-lock management, and accessible dismissal.
 */

import { workspaceStore } from '../state.js';
import { Toast, Modal } from './modal.js';
import { getManagedBlobUrl } from '../storage.js';

export const PdfReader = {
  async open(documentId, targetPage = 1, passageQuote = null, sectionTitle = null) {
    const state = workspaceStore.getState();
    const doc = state.documents.find(d => d.id === documentId);
    if (!doc) {
      Toast.show('Document not found in workspace library.', 'error');
      return;
    }

    let effectivePdfSrc = null;

    if (doc.status === 'indexed') {
      // Bundled verified sample PDF
      effectivePdfSrc = `assets/docs/${doc.filename}`;
    } else {
      // Local preview uploaded file — get managed blob URL from IndexedDB or memory
      effectivePdfSrc = await getManagedBlobUrl(doc.id, doc.blobFile || null);
    }

    if (!effectivePdfSrc) {
      Modal.open(
        'Document File Unavailable',
        `
          <div class="missing-file-dialog" style="padding: 6px 0;">
            <p><strong>"${doc.title}"</strong> is a local preview whose file data is no longer available in this browser session.</p>
            <p class="text-muted text-sm mt-2">Browser-local file storage may have been cleared or the file was not persisted. You can remove this reference from your workspace.</p>
          </div>
        `,
        () => {
          workspaceStore.deleteDocument(doc.id);
          Toast.show(`Removed "${doc.title}" from library.`, 'info');
        },
        'Remove from Library',
        'danger'
      );
      return;
    }

    // Lock body scrolling
    document.body.classList.add('modal-open');

    const modal = document.createElement('div');
    modal.className = 'pdf-reader-overlay';
    modal.id = 'activePdfReaderModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', `PDF Reader: ${doc.title}`);

    const pdfUrl = `${effectivePdfSrc}#page=${targetPage}`;

    const isPageCountKnown = typeof doc.pageCount === 'number' && doc.pageCount > 0;
    const pageIndicatorText = isPageCountKnown
      ? `Target Page: <strong>${targetPage}</strong> of ${doc.pageCount}`
      : `Target Page: <strong>${targetPage}</strong> (Page count unavailable)`;

    const metaPillText = isPageCountKnown
      ? `${doc.author} • ${doc.pageCount} pages`
      : `${doc.author} • Page count unavailable`;

    modal.innerHTML = `
      <div class="pdf-reader-frame">
        <header class="pdf-reader-header">
          <div class="pdf-reader-title-area">
            <div class="pdf-doc-badge">
              <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
                <path d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7.414A2 2 0 0017.414 6L13.586 2.172A2 2 0 0012.172 2H4z"/>
              </svg>
              PDF
            </div>
            <h3 class="pdf-title">${doc.title}</h3>
            <span class="pdf-meta-pill">${metaPillText}</span>
          </div>

          <div class="pdf-reader-controls">
            <span class="pdf-page-indicator">${pageIndicatorText}</span>
            <a href="${effectivePdfSrc}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" title="Open PDF in browser tab">
              <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 3h6m0 0v6m0-6L9 11M5 5H4a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-1"/>
              </svg>
              Open Native Tab
            </a>
            <button type="button" class="btn btn-secondary btn-sm" id="copyCitationBtn">
              Copy Citation
            </button>
            <button type="button" class="btn-close-reader" id="closeReaderBtn" aria-label="Close reader">&times;</button>
          </div>
        </header>

        <div class="pdf-reader-body">
          <!-- Left: Real Embedded PDF Stream -->
          <div class="pdf-canvas-wrap">
            <object data="${pdfUrl}" type="application/pdf" class="pdf-embedded-object" width="100%" height="100%">
              <div class="pdf-fallback-notice">
                <p>This browser does not support inline PDF streaming.</p>
                <a href="${effectivePdfSrc}" class="btn btn-primary" target="_blank" rel="noopener">
                  Download / View ${doc.filename}
                </a>
              </div>
            </object>
          </div>

          <!-- Right: Verified Source Excerpt Panel -->
          <aside class="pdf-excerpt-sidebar">
            <div class="excerpt-panel-header">
              <span class="excerpt-badge">Verified Source Citation</span>
              <span class="page-tag">Page ${targetPage}</span>
            </div>

            ${sectionTitle ? `
              <div class="excerpt-section-label">Section Reference</div>
              <h4 class="excerpt-section-title">${sectionTitle}</h4>
            ` : ''}

            <div class="excerpt-quote-box">
              <div class="quote-icon">“</div>
              <p class="quote-text">${passageQuote || (doc.status === 'indexed' ? 'Select a citation from Ask Syllora or Syllabus Map to view verified highlighted excerpt.' : 'This is a local student preview. No automated AI passages have been extracted from this user file.')}</p>
            </div>

            <div class="citation-audit-card">
              <div class="audit-row">
                <span class="audit-label">Source Document:</span>
                <span class="audit-val">${doc.filename}</span>
              </div>
              <div class="audit-row">
                <span class="audit-label">Integrity Status:</span>
                <span class="audit-val audit-verified">${doc.status === 'indexed' ? '✓ Bundled Verified Sample' : 'ℹ Local Student Preview (Unindexed)'}</span>
              </div>
              <div class="audit-row">
                <span class="audit-label">Citation Key:</span>
                <span class="audit-val">${doc.status === 'indexed' ? `${doc.title.split(' ')[0]} p.${targetPage}` : 'Local Upload (No citations)'}</span>
              </div>
            </div>

            <div class="excerpt-footer-action">
              <button type="button" class="btn btn-primary btn-block" id="sidebarCopyQuoteBtn">
                Copy Excerpt Text
              </button>
            </div>
          </aside>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('#closeReaderBtn');
    const copyCitationBtn = modal.querySelector('#copyCitationBtn');
    const sidebarCopyQuoteBtn = modal.querySelector('#sidebarCopyQuoteBtn');

    const handleClose = () => {
      modal.remove();
      document.body.classList.remove('modal-open');
      window.removeEventListener('keydown', keyHandler);
    };

    const keyHandler = (e) => {
      if (e.key === 'Escape') handleClose();
    };

    closeBtn.addEventListener('click', handleClose);
    window.addEventListener('keydown', keyHandler);

    const citationText = `"${passageQuote || doc.title}" — ${doc.title}, Page ${targetPage} (${doc.author})`;

    copyCitationBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(citationText).then(() => {
        Toast.show('Citation copied to clipboard!', 'success');
      });
    });

    if (sidebarCopyQuoteBtn) {
      sidebarCopyQuoteBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(passageQuote || citationText).then(() => {
          Toast.show('Excerpt text copied!', 'success');
        });
      });
    }
  }
};
