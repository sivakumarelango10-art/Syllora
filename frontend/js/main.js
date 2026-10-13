/**
 * ============================================================================
 * SYLLORA APPLICATION BOOTSTRAPPER & ROUTE ORCHESTRATOR
 * ============================================================================
 * Connects login submit completion to the workspace router, manages AppShell,
 * and renders all primary routes (/app/*) in strictly LIGHT MODE.
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

// Route Change Listener
router.subscribe((path, params, viewHandler) => {
  if (path.startsWith('/app')) {
    // Switch to Workspace Container
    if (loginStage) loginStage.style.display = 'none';
    if (workspaceContainer) workspaceContainer.style.display = 'block';

    // Initialize AppShell if not already rendered
    if (!appShell) {
      appShell = new AppShell('workspaceContainer');
    }
    appShell.render(path);

    // Mount view inside #workspaceViewMount
    const mountPoint = document.getElementById('workspaceViewMount');
    if (mountPoint && viewHandler) {
      viewHandler(mountPoint, params);
      mountPoint.focus();
    }
  } else {
    // Switch to Login Stage
    if (workspaceContainer) workspaceContainer.style.display = 'none';
    if (loginStage) loginStage.style.display = 'flex';
  }
});

// Listener for user profile updates to refresh shell
window.addEventListener('syllora_user_updated', () => {
  if (appShell && router.getCurrentPath().startsWith('/app')) {
    appShell.render(router.getCurrentPath());
  }
});

// Global hook to transition from login into workspace
window.sylloraEnterWorkspace = function () {
  sessionAdapter.loginDemoUser({ name: 'Prajith P', email: 'demo@syllora.com' });
  router.navigate('/app/overview');
};

// Initial routing evaluation after all routes are registered
router.handleRouting();

