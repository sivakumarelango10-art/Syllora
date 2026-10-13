/**
 * ============================================================================
 * SYLLORA APPLICATION BOOTSTRAPPER & ROUTE ORCHESTRATOR
 * ============================================================================
 * Connects login submit completion to the workspace router, manages AppShell,
 * preserves view inputs, prevents focus scroll clipping, and renders all
 * primary routes (/app/*) in strictly LIGHT MODE.
 */

import { router } from './router.js';
import { sessionAdapter } from './session.js';
import { AppShell } from './components/shell.js';

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

// Route Change Listener
router.subscribe((path, params, viewHandler) => {
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

    // Mount view inside #workspaceViewMount
    const mountPoint = document.getElementById('workspaceViewMount');
    if (mountPoint && viewHandler) {
      // Clear mount point and render view
      mountPoint.innerHTML = '';
      const cleanup = viewHandler(mountPoint, params);
      if (typeof cleanup === 'function') {
        currentViewCleanup = cleanup;
      }

      // Manage focus and scrolling intentionally:
      // Use preventScroll to prevent browser from auto-scrolling content under the sticky header
      mountPoint.focus({ preventScroll: true });
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  } else {
    // Switch document scroll state to login mode
    document.body.classList.remove('workspace-mode');
    document.body.classList.add('login-mode');

    // Switch to Login Stage
    if (workspaceContainer) workspaceContainer.style.display = 'none';
    if (loginStage) loginStage.style.display = 'flex';

    // Reset login form and overlays if returning from workspace (e.g. logout)
    if (typeof window.sylloraResetLogin === 'function') {
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

// Initial routing evaluation after all routes are registered
router.handleRouting();
