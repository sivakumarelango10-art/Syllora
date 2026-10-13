/**
 * ============================================================================
 * ACCESSIBLE MODALS & TOAST NOTIFICATIONS MANAGER
 * ============================================================================
 * Accessible modal dialogs with focus trapping, Escape dismissal, backdrop
 * click dismissal, explicit body scroll locking, and focus restoration.
 */

export const Toast = {
  show(message, type = 'info', duration = 3000) {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    toast.setAttribute('role', 'status');

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 10l4 4L16 6"/></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="8"/><line x1="10" y1="6" x2="10" y2="10"/><circle cx="10" cy="14" r="0.5"/></svg>';
    } else {
      iconSvg = '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="8"/><line x1="10" y1="10" x2="10" y2="14"/><circle cx="10" cy="7" r="0.5"/></svg>';
    }

    toast.innerHTML = `
      <div class="toast-icon">${iconSvg}</div>
      <div class="toast-message">${message}</div>
      <button type="button" class="toast-close-btn" aria-label="Close notification">&times;</button>
    `;

    const closeBtn = toast.querySelector('.toast-close-btn');
    closeBtn.addEventListener('click', () => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 200);
    });

    container.appendChild(toast);

    setTimeout(() => {
      if (toast.isConnected) {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 200);
      }
    }, duration);
  }
};

// Global stack counter to prevent premature body scroll unlocking across nested modals and PDF readers
let openOverlayCount = 0;

export function lockBodyScroll() {
  openOverlayCount++;
  document.body.classList.add('modal-open');
}

export function unlockBodyScroll() {
  openOverlayCount = Math.max(0, openOverlayCount - 1);
  if (openOverlayCount === 0) {
    document.body.classList.remove('modal-open');
  }
}

export const Modal = {
  activeModal: null,
  previousFocus: null,
  keyHandler: null,

  open(title, contentHtml, onConfirm = null, confirmText = 'Confirm', confirmStyle = 'primary') {
    this.close();

    this.previousFocus = document.activeElement;

    // Lock body scrolling safely using stack manager
    lockBodyScroll();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'activeModalOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'modalDialogTitle');

    overlay.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <h3 id="modalDialogTitle" class="modal-title">${title}</h3>
          <button type="button" class="modal-close-btn" id="modalCloseBtn" aria-label="Close dialog">&times;</button>
        </div>
        <div class="modal-body">
          ${contentHtml}
        </div>
        ${onConfirm ? `
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="modalCancelBtn">Cancel</button>
          <button type="button" class="btn btn-${confirmStyle}" id="modalConfirmBtn">${confirmText}</button>
        </div>
        ` : ''}
      </div>
    `;

    document.body.appendChild(overlay);
    this.activeModal = overlay;

    const closeBtn = overlay.querySelector('#modalCloseBtn');
    const cancelBtn = overlay.querySelector('#modalCancelBtn');
    const confirmBtn = overlay.querySelector('#modalConfirmBtn');

    closeBtn.addEventListener('click', () => this.close());
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.close());
    if (confirmBtn && onConfirm) {
      confirmBtn.addEventListener('click', async () => {
        try {
          confirmBtn.disabled = true;
          confirmBtn.setAttribute('aria-busy', 'true');
          const outcome = await onConfirm();
          // If onConfirm explicitly returns false (e.g. validation failure), keep dialog open
          if (outcome !== false) {
            this.close();
          }
        } catch (err) {
          console.error('[Modal] Confirm action failed:', err);
        } finally {
          if (confirmBtn && confirmBtn.isConnected) {
            confirmBtn.disabled = false;
            confirmBtn.removeAttribute('aria-busy');
          }
        }
      });
    }

    // Keyboard navigation (Escape to close, Tab to trap focus)
    this.keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
        return;
      }

      if (e.key === 'Tab') {
        const focusable = overlay.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener('keydown', this.keyHandler);

    // Click outside backdrop
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.close();
      }
    });

    // Initial focus
    setTimeout(() => {
      const initialInput = overlay.querySelector('input:not([type="hidden"]), select, textarea');
      if (initialInput) {
        initialInput.focus();
      } else if (confirmBtn) {
        confirmBtn.focus();
      } else if (closeBtn) {
        closeBtn.focus();
      }
    }, 50);

    return overlay;
  },

  close() {
    if (this.activeModal) {
      this.activeModal.remove();
      this.activeModal = null;

      // Clean up body scroll lock safely
      unlockBodyScroll();

      if (this.keyHandler) {
        window.removeEventListener('keydown', this.keyHandler);
        this.keyHandler = null;
      }
      if (this.previousFocus && typeof this.previousFocus.focus === 'function') {
        this.previousFocus.focus();
      }
    }
  }
};
