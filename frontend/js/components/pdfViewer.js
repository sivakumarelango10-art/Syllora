/**
 * ============================================================================
 * REAL PDF DOCUMENT READER & EXCERPT INSPECTOR
 * ============================================================================
 * Renders bundled sample PDFs and local preview blob URLs at exact cited pages
 * with verified excerpt quotes, scroll-lock management, and accessible dismissal.
 */

import { workspaceStore } from '../state.js';
import { Toast, Modal, lockBodyScroll, unlockBodyScroll } from './modal.js';
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

    if (doc.backendDocument) {
      // User-uploaded PDFs are indexed by the AI backend; open the browser-saved original.
      effectivePdfSrc = await getManagedBlobUrl(doc.id, doc.blobFile || null);
    } else if (doc.status === 'indexed') {
      // Built-in verified sample PDF bundled with the frontend.
      effectivePdfSrc = `assets/docs/${doc.filename}`;
    } else {
      // Local preview uploaded file — get managed blob URL from IndexedDB or memory.
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

    // Save previous active focus for restoration
    const previousFocus = document.activeElement;

    // Lock body scrolling using shared stack manager
    lockBodyScroll();

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

    // Truthful citation claims: Only claim "Verified Source Citation" when document is indexed AND passageQuote is valid
    const isVerifiedCitation = doc.status === 'indexed' && Boolean(passageQuote);
    const badgeLabel = isVerifiedCitation
      ? 'Verified Source Citation'
      : doc.status === 'indexed'
      ? 'Document Reference'
      : 'Local Preview (Unindexed)';

    // Never substitute document title for quotation
    const displayQuoteText = passageQuote
      ? passageQuote
      : doc.status === 'indexed'
      ? 'Select a citation from Ask Syllora or Syllabus Map to view a highlighted passage excerpt.'
      : 'This is a local student preview. No automated AI passages have been extracted from this user file.';

    // Construct truthful citation string: Quote citation if passage exists, else clearly labeled document metadata reference
    const citationText = passageQuote
      ? `"${passageQuote}" — ${doc.title}, Page ${targetPage} (${doc.author})`
      : `${doc.title} (${doc.author}), Page ${targetPage} [Document Reference]`;

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
              ${passageQuote ? 'Copy Citation' : 'Copy Reference'}
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

          <!-- Right: Source Excerpt Panel -->
          <aside class="pdf-excerpt-sidebar">
            <div class="excerpt-panel-header">
              <span class="excerpt-badge ${isVerifiedCitation ? '' : 'pill-gray'}">${badgeLabel}</span>
              <span class="page-tag">Page ${targetPage}</span>
            </div>

            ${sectionTitle ? `
              <div class="excerpt-section-label">Section Reference</div>
              <h4 class="excerpt-section-title">${sectionTitle}</h4>
            ` : ''}

            <div class="excerpt-quote-box">
              <div class="quote-icon">“</div>
              <p class="quote-text">${displayQuoteText}</p>
            </div>

            <div class="citation-audit-card">
              <div class="audit-row">
                <span class="audit-label">Source Document:</span>
                <span class="audit-val">${doc.filename}</span>
              </div>
              <div class="audit-row">
                <span class="audit-label">Integrity Status:</span>
                <span class="audit-val ${doc.status === 'indexed' ? 'audit-verified' : ''}">${doc.backendDocument ? '✓ Uploaded and indexed by Syllora AI' : doc.status === 'indexed' ? '✓ Bundled Verified Sample' : 'ℹ Local Student Preview (Unindexed)'}</span>
              </div>
              <div class="audit-row">
                <span class="audit-label">Citation Key:</span>
                <span class="audit-val">${doc.status === 'indexed' ? `${doc.title.split(' ')[0]} p.${targetPage}` : 'Local Upload (No citations)'}</span>
              </div>
            </div>

            <div class="excerpt-footer-action">
              ${passageQuote ? `
                <button type="button" class="btn btn-primary btn-block" id="sidebarCopyQuoteBtn">
                  Copy Excerpt Text
                </button>
              ` : `
                <button type="button" class="btn btn-secondary btn-block" id="sidebarCopyQuoteBtn">
                  Copy Reference Metadata
                </button>
              `}
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
      unlockBodyScroll();
      window.removeEventListener('keydown', keyHandler);
      if (previousFocus && typeof previousFocus.focus === 'function') {
        previousFocus.focus();
      }
    };

    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
      if (e.key === 'Tab') {
        const focusable = modal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    closeBtn.addEventListener('click', handleClose);
    window.addEventListener('keydown', keyHandler);

    copyCitationBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(citationText)
        .then(() => {
          Toast.show('Citation reference copied to clipboard!', 'success');
        })
        .catch(() => {
          Toast.show('Clipboard permission denied. Please copy manually.', 'error');
        });
    });

    if (sidebarCopyQuoteBtn) {
      sidebarCopyQuoteBtn.addEventListener('click', () => {
        const textToCopy = passageQuote || citationText;
        navigator.clipboard.writeText(textToCopy)
          .then(() => {
            Toast.show(passageQuote ? 'Excerpt quote copied!' : 'Reference metadata copied!', 'success');
          })
          .catch(() => {
            Toast.show('Clipboard permission denied. Please copy manually.', 'error');
          });
      });
    }

    // Set initial focus
    setTimeout(() => {
      if (closeBtn) closeBtn.focus();
    }, 50);
  }
};
