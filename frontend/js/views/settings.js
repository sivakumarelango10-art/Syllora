/**
 * ============================================================================
 * VIEW: SETTINGS & USER PROFILE (PRAJITH P)
 * ============================================================================
 * - Editable profile information for Prajith P
 * - Study preferences (daily goal, notification alerts)
 * - Safe Demo Workspace Reset with confirmation dialog
 * - Local storage usage statistics
 */

import { sessionAdapter } from '../session.js';
import { workspaceStore } from '../state.js';
import { Toast, Modal } from '../components/modal.js';
import { sylloraApi } from '../services/aiApi.js';

function escapeHtml(str) {
  if (typeof str !== 'string') return str || '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderSettings(container) {
  const user = sessionAdapter.getUser() || {
    name: 'Student',
    email: '',
    role: 'Student',
    program: 'Academic Studies',
    graduationYear: '',
    dailyGoalMinutes: 45,
    notificationsEnabled: true
  };

  const stats = workspaceStore.getStats();

  container.innerHTML = `
    <div class="view-settings-page">
      
      <header class="page-header-row">
        <div class="header-text">
          <h1 class="page-title">Profile & Workspace Settings</h1>
          <p class="page-desc">Manage your student profile, daily study targets, and workspace data.</p>
        </div>
      </header>

      <div class="settings-grid-layout">
        
        <!-- Left: Profile & Preferences Card -->
        <div class="card settings-card">
          <div class="settings-card-header">
            <h3>Student Profile</h3>
            <span class="pill-badge pill-green">Authenticated Student</span>
          </div>

          <form id="profileForm" class="settings-form">
            <div class="form-group">
              <label class="form-label" for="profileNameInput">Full Name:</label>
              <input type="text" id="profileNameInput" class="form-input" value="${escapeHtml(user.name)}" required>
            </div>

            <div class="form-group">
              <label class="form-label" for="profileEmailInput">Email Address:</label>
              <input type="email" id="profileEmailInput" class="form-input" value="${escapeHtml(user.email)}" required readonly style="background-color: #f1f5f9; cursor: not-allowed;">
              <span class="text-xs text-muted">Primary verified account email.</span>
            </div>

            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label" for="profileProgramInput">Academic Program:</label>
                <input type="text" id="profileProgramInput" class="form-input" value="${escapeHtml(user.program || '')}">
              </div>

              <div class="form-group">
                <label class="form-label" for="profileGradYearInput">Graduation Year:</label>
                <input type="text" id="profileGradYearInput" class="form-input" value="${escapeHtml(user.graduationYear || '')}">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="profileGoalInput">Daily Study Target (minutes):</label>
              <input type="number" id="profileGoalInput" class="form-input" value="${user.dailyGoalMinutes || 45}" min="15" max="180">
            </div>

            <div class="settings-form-actions">
              <button type="submit" class="btn btn-primary" id="saveProfileBtn">
                Save Profile Changes
              </button>
            </div>
          </form>
        </div>

        <!-- Right: Workspace Data & Reset Card -->
        <div class="card settings-card">
          <div class="settings-card-header">
            <h3>Workspace Diagnostics</h3>
            <span class="pill-badge pill-gray">Database Backed</span>
          </div>

          <div class="workspace-health-box">
            <div class="health-item">
              <span class="health-label">Course Documents:</span>
              <strong>${stats.totalDocs} PDFs (${stats.indexedDocs} indexed)</strong>
            </div>
            <div class="health-item">
              <span class="health-label">Syllabus Topics:</span>
              <strong>${stats.totalTopics} mapped topics (${stats.evidenceCoveragePct}% coverage)</strong>
            </div>
            <div class="health-item">
              <span class="health-label">Open Misconceptions:</span>
              <strong>${stats.openMisconceptionsCount} active issues</strong>
            </div>
            <div class="health-item">
              <span class="health-label">Revision Tasks:</span>
              <strong>${stats.totalTasksCount} scheduled items</strong>
            </div>
          </div>

          <div class="reset-zone-card mt-3">
            <h4>Clear Local Caches</h4>
            <p class="text-sm text-muted">
              Clears local offline drafts and view caches. Your genuine student profile and database records remain safely preserved on the server.
            </p>
            <button type="button" class="btn btn-secondary btn-sm mt-3" id="clearLocalCachesBtn">
              Clear Local Caches
            </button>
          </div>
        </div>

      </div>

    </div>
  `;

  // Form submission
  const profileForm = container.querySelector('#profileForm');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = container.querySelector('#saveProfileBtn');
      const name = container.querySelector('#profileNameInput').value.trim();
      const email = container.querySelector('#profileEmailInput').value.trim();
      const program = container.querySelector('#profileProgramInput').value.trim();
      const graduationYear = container.querySelector('#profileGradYearInput').value.trim();
      const dailyGoalMinutes = parseInt(container.querySelector('#profileGoalInput').value, 10);

      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
      }

      sessionAdapter.updateProfile({
        name,
        email,
        program,
        graduationYear,
        dailyGoalMinutes,
        avatarText: name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'ST'
      });

      try {
        await sylloraApi.updateProfile({
          full_name: name,
          academic_program: program,
          graduation_year: graduationYear,
          daily_goal_minutes: dailyGoalMinutes
        });
        Toast.show('Profile information saved to server.', 'success');
      } catch (err) {
        console.warn('[Settings] Cloud profile sync notice:', err);
        Toast.show('Profile preferences updated locally.', 'info');
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Profile Changes';
        }
      }

      // Refresh topbar/shell user display
      window.dispatchEvent(new Event('syllora_user_updated'));
    });
  }

  // Clear local caches
  const clearCachesBtn = container.querySelector('#clearLocalCachesBtn');
  if (clearCachesBtn) {
    clearCachesBtn.addEventListener('click', () => {
      Modal.open(
        'Confirm Clear Local Caches',
        `
          <p>Clear locally cached workspace drafts and temporary offline views?</p>
          <p class="text-muted text-sm mt-2">Your real database records, documents, and account credentials will NOT be deleted.</p>
        `,
        async () => {
          const user = sessionAdapter.getUser();
          const userId = user?.id || 'default';
          localStorage.removeItem(`syllora_workspace_state_${userId}`);
          sessionAdapter.cleanupLegacyDemoStorage();
          Toast.show('Local caches cleared. Syncing fresh state from database...', 'info');
          await workspaceStore.syncWithBackend();
          renderSettings(container);
        },
        'Clear Local Caches',
        'primary'
      );
    });
  }
}
