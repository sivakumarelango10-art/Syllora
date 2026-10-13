/**
 * ============================================================================
 * VIEW: INTENTIONAL NOT-FOUND (404) VIEW
 * ============================================================================
 */

import { router } from '../router.js';

export function renderNotFound(container) {
  container.innerHTML = `
    <div class="view-not-found-page">
      <div class="card not-found-card">
        <div class="not-found-code">404</div>
        <h2 class="not-found-title">Topic or Workspace Route Not Found</h2>
        <p class="not-found-desc">
          The requested path could not be located in your active CS301 syllabus or navigation structure.
        </p>
        <div class="not-found-actions">
          <button type="button" class="btn btn-secondary" id="goBackBtn">
            ← Go Back
          </button>
          <button type="button" class="btn btn-primary" id="returnOverviewBtn">
            Return to Overview Dashboard
          </button>
        </div>
      </div>
    </div>
  `;

  const goBackBtn = container.querySelector('#goBackBtn');
  const returnOverviewBtn = container.querySelector('#returnOverviewBtn');

  if (goBackBtn) goBackBtn.addEventListener('click', () => window.history.back());
  if (returnOverviewBtn) returnOverviewBtn.addEventListener('click', () => router.navigate('/app/overview'));
}
