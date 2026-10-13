/**
 * ============================================================================
 * SYLLORA APPLICATION BOOTSTRAPPER & ROUTE ORCHESTRATOR
 * ============================================================================
 * Connects login submit completion to the workspace router, manages AppShell,
 * preserves view inputs, prevents focus scroll clipping, handles offline banner,
 * error boundaries, and renders all primary routes (/app/*) in strictly LIGHT MODE.
 */

import { router } from './router.js';
import { sessionAdapter } from './session.js';
import { AppShell } from './components/shell.js';
import { Toast } from './components/modal.js';

// Import Views
import { renderOverview } from './views/overview.js';
import { renderMaterials } from './views/materials.js';
import { renderAsk } from './views/ask.js';
import { renderSyllabus } from './views/syllabus.js';
import { renderUnderstanding } from './views/understanding.js';
import { renderMisconceptions } from './views/misconceptions.js';
import { renderRevision } from './views/revision.js';
import { renderSettings } from './views/settings.js';
import { renderNotFound } from './views/notFound.js';

// DOM Containers
const loginStage = document.getElementById('loginStage');
const workspaceContainer = document.getElementById('workspaceContainer');
let appShell = null;

// Register Routes
router.register('/app/overview', renderOverview);
router.register('/app/materials', renderMaterials);
router.register('/app/ask', renderAsk);
router.register('/app/syllabus', renderSyllabus);
router.register('/app/understanding', renderUnderstanding);
router.register('/app/misconceptions', renderMisconceptions);
router.register('/app/revision', renderRevision);
router.register('/app/settings', renderSettings);
router.register('/app/404', renderNotFound);

// Track active view cleanup hook for cancelling timers, observers, and async work
let currentViewCleanup = null;

// Application Error Recovery View
function renderAppErrorRecovery(mountPoint, path, error) {
  mountPoint.innerHTML = `
    <div class="view-recovery-container" style="padding: 40px 24px; max-width: 680px; margin: 40px auto;">
      <div class="card" style="padding: 32px; border-radius: 14px; text-align: center; border: 1px solid #E2E8EE;">
        <div style="width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 50%; background: #FEF3F2; display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#E11D48" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h2 style="font-size: 22px; font-weight: 700; color: #14212B; margin-bottom: 8px;">We encountered an unexpected error</h2>
        <p style="font-size: 14px; color: #5F6F82; margin-bottom: 24px; line-height: 1.5;">
          The requested view could not be rendered. Your study drafts and notes are safely stored in your browser session.
        </p>
        <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
          <button type="button" class="btn btn-secondary" id="recoveryOverviewBtn">Back to Overview</button>
          <button type="button" class="btn btn-primary" id="recoveryRetryBtn">Retry View</button>
        </div>
      </div>
    </div>
  `;
  const retryBtn = mountPoint.querySelector('#recoveryRetryBtn');
  const backBtn = mountPoint.querySelector('#recoveryOverviewBtn');
  if (retryBtn) retryBtn.addEventListener('click', () => router.handleRouting());
  if (backBtn) backBtn.addEventListener('click', () => router.navigate('/app/overview'));
}

// Non-blocking Offline Banner
function setupOfflineBanner() {
  let banner = document.getElementById('sylloraOfflineBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'sylloraOfflineBanner';
    banner.className = 'syllora-offline-banner';
    banner.style.cssText = 'display: none; position: sticky; top: 0; left: 0; right: 0; z-index: 100; background: #FFFBEB; border-bottom: 1px solid #FDE68A; color: #92400E; padding: 10px 16px; text-align: center; font-size: 13.5px; font-weight: 500;';
    banner.innerHTML = `
      <span><strong>Offline Notice:</strong> You are currently offline. Locally available study materials, cached PDFs, and saved notes remain accessible.</span>
    `;
    document.body.prepend(banner);
  }

  const updateStatus = () => {
    if (navigator.onLine) {
      banner.style.display = 'none';
    } else {
      banner.style.display = 'block';
    }
  };

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  updateStatus();
}

// Track previous path to identify when returning from workspace to login
let previousRoutePath = null;

// Route Change Listener
router.subscribe((path, params, viewHandler) => {
  const isReturningFromWorkspace = previousRoutePath && previousRoutePath.startsWith('/app');
  previousRoutePath = path;
  document.documentElement.classList.remove('direct-workspace');

  // Always clean up previous view work (timers, pending requests) before rendering new view
  if (currentViewCleanup && typeof currentViewCleanup === 'function') {
    try {
      currentViewCleanup();
    } catch (err) {
      console.warn('[Syllora Router] View cleanup error:', err);
    }
    currentViewCleanup = null;
  }

  if (path.startsWith('/app')) {
    // Switch document scroll state and mode classes
    document.body.classList.remove('login-mode');
    document.body.classList.add('workspace-mode');

    // Switch to Workspace Container
    if (loginStage) loginStage.style.display = 'none';
    if (workspaceContainer) workspaceContainer.style.display = 'block';

    // Mount AppShell ONCE if not already mounted
    if (!appShell) {
      appShell = new AppShell('workspaceContainer');
      appShell.mount();
    }
    // Update navigation and breadcrumb in place without destroying layout
    appShell.setActivePath(path);

    // Mount view inside #workspaceViewMount with error boundary
    const mountPoint = document.getElementById('workspaceViewMount');
    if (mountPoint && viewHandler) {
      mountPoint.innerHTML = '';
      try {
        const cleanup = viewHandler(mountPoint, params);
        if (typeof cleanup === 'function') {
          currentViewCleanup = cleanup;
        }

        // Manage focus and scrolling intentionally:
        // Use preventScroll to prevent browser from auto-scrolling content under the sticky header
        mountPoint.focus({ preventScroll: true });
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      } catch (err) {
        console.error('[Syllora View Exception]:', err);
        renderAppErrorRecovery(mountPoint, path, err);
      }
    }
  } else {
    // Switch document scroll state to login mode
    document.body.classList.remove('workspace-mode');
    document.body.classList.add('login-mode');

    // Switch to Login Stage
    if (workspaceContainer) workspaceContainer.style.display = 'none';
    if (loginStage) loginStage.style.display = 'flex';

    // Reset login form and overlays ONLY if returning from workspace (e.g. logout)
    if (isReturningFromWorkspace && typeof window.sylloraResetLogin === 'function') {
      window.sylloraResetLogin();
    }
  }
});

// Listener for user profile updates to refresh shell in place without rerendering view
window.addEventListener('syllora_user_updated', () => {
  if (appShell && router.getCurrentPath().startsWith('/app')) {
    appShell.updateUser();
    appShell.updateStats();
  }
});

// Listener for shared state updates to refresh badge counters
window.addEventListener('syllora_state_updated', () => {
  if (appShell && router.getCurrentPath().startsWith('/app')) {
    appShell.updateStats();
  }
});

// Global hook to transition from login into workspace
window.sylloraEnterWorkspace = function () {
  sessionAdapter.loginDemoUser({ name: 'Prajith P', email: 'demo@syllora.com' });
  router.navigate('/app/overview');
};

// Initialize offline detection banner
setupOfflineBanner();

// Dev-only reproduction utilities for verifying error and offline recovery
window.__sylloraDev = {
  simulateOffline: () => {
    const banner = document.getElementById('sylloraOfflineBanner');
    if (banner) banner.style.display = 'block';
    Toast.show('Simulating offline state.', 'warning');
  },
  simulateOnline: () => {
    const banner = document.getElementById('sylloraOfflineBanner');
    if (banner) banner.style.display = 'none';
    Toast.show('Online network connection restored.', 'success');
  },
  simulateError: () => {
    const mountPoint = document.getElementById('workspaceViewMount');
    if (mountPoint) {
      renderAppErrorRecovery(mountPoint, router.getCurrentPath(), new Error('Simulated testing error'));
    }
  }
};

// Initial routing evaluation after all routes are registered
router.handleRouting();
