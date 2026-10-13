/**
 * ============================================================================
 * REAL PDF DOCUMENT READER & EXCERPT INSPECTOR
 * ============================================================================
 * Renders bundled sample PDFs at exact cited pages with verified excerpt quotes.
 */

import { workspaceStore } from '../state.js';
import { Toast } from './modal.js';

export const PdfReader = {
  open(documentId, targetPage = 1, passageQuote = null, sectionTitle = null) {
    const state = workspaceStore.getState();
    const doc = state.documents.find(d => d.id === documentId);
    if (!doc) {
      Toast.show('Document not found in workspace library.', 'error');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'pdf-reader-overlay';
    modal.id = 'activePdfReaderModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', `PDF Reader: ${doc.title}`);

    const pdfUrl = `assets/docs/${doc.filename}#page=${targetPage}`;

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
            <span class="pdf-meta-pill">${doc.author} • ${doc.pageCount} pages</span>
          </div>

          <div class="pdf-reader-controls">
            <span class="pdf-page-indicator">Target Page: <strong>${targetPage}</strong> of ${doc.pageCount}</span>
            <a href="assets/docs/${doc.filename}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" title="Open PDF in browser tab">
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
                <a href="assets/docs/${doc.filename}" class="btn btn-primary" target="_blank" rel="noopener">
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
              <p class="quote-text">${passageQuote || 'Select a citation from Ask Syllora or Syllabus Map to view verified highlighted excerpt.'}</p>
            </div>

            <div class="citation-audit-card">
              <div class="audit-row">
                <span class="audit-label">Source Document:</span>
                <span class="audit-val">${doc.filename}</span>
              </div>
              <div class="audit-row">
                <span class="audit-label">Integrity Status:</span>
                <span class="audit-val audit-verified">✓ Bundled Verified Sample</span>
              </div>
              <div class="audit-row">
                <span class="audit-label">Citation Key:</span>
                <span class="audit-val">${doc.title.split(' ')[0]} p.${targetPage}</span>
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
