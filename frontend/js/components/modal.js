/**
 * ============================================================================
 * ACCESSIBLE MODALS & TOAST NOTIFICATIONS MANAGER
 * ============================================================================
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
      <button class="toast-close-btn" aria-label="Close notification">&times;</button>
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

export const Modal = {
  activeModal: null,
  previousFocus: null,

  open(title, contentHtml, onConfirm = null, confirmText = 'Confirm', confirmStyle = 'primary') {
    this.close();

    this.previousFocus = document.activeElement;

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
          <button class="modal-close-btn" id="modalCloseBtn" aria-label="Close dialog">&times;</button>
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

    // Focus close or confirm button
    const closeBtn = overlay.querySelector('#modalCloseBtn');
    const cancelBtn = overlay.querySelector('#modalCancelBtn');
    const confirmBtn = overlay.querySelector('#modalConfirmBtn');

    closeBtn.addEventListener('click', () => this.close());
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.close());
    if (confirmBtn && onConfirm) {
      confirmBtn.addEventListener('click', () => {
        onConfirm();
        this.close();
      });
    }

    // Escape listener
    this.escapeHandler = (e) => {
      if (e.key === 'Escape') {
        this.close();
      }
    };
    window.addEventListener('keydown', this.escapeHandler);

    // Click outside backdrop
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.close();
      }
    });

    setTimeout(() => {
      (confirmBtn || closeBtn).focus();
    }, 50);

    return overlay;
  },

  close() {
    if (this.activeModal) {
      this.activeModal.remove();
      this.activeModal = null;
      if (this.escapeHandler) {
        window.removeEventListener('keydown', this.escapeHandler);
      }
      if (this.previousFocus && this.previousFocus.focus) {
        this.previousFocus.focus();
      }
    }
  }
};
