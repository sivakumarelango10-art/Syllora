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

export function renderSettings(container) {
  const user = sessionAdapter.getDemoUser() || {
    name: 'Prajith P',
    email: 'demo@syllora.com',
    role: 'CS Undergrad',
    program: 'B.Tech Computer Science & Engineering',
    graduationYear: '2027',
    dailyGoalMinutes: 45,
    notificationsEnabled: true
  };

  const stats = workspaceStore.getStats();

  container.innerHTML = `
    <div class="view-settings-page">
      
      <header class="page-header-row">
        <div class="header-text">
          <h1 class="page-title">Profile & Workspace Settings</h1>
          <p class="page-desc">Manage your demo student profile, daily study targets, and local workspace data.</p>
        </div>
      </header>

      <div class="settings-grid-layout">
        
        <!-- Left: Profile & Preferences Card -->
        <div class="card settings-card">
          <div class="settings-card-header">
            <h3>Student Profile</h3>
            <span class="pill-badge pill-green">Active Demo Session</span>
          </div>

          <form id="profileForm" class="settings-form">
            <div class="form-group">
              <label class="form-label" for="profileNameInput">Full Name:</label>
              <input type="text" id="profileNameInput" class="form-input" value="${user.name}" required>
            </div>

            <div class="form-group">
              <label class="form-label" for="profileEmailInput">Email Address:</label>
              <input type="email" id="profileEmailInput" class="form-input" value="${user.email}" required>
              <span class="text-xs text-muted">Connected to demo-session adapter.</span>
            </div>

            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label" for="profileProgramInput">Academic Program:</label>
                <input type="text" id="profileProgramInput" class="form-input" value="${user.program}">
              </div>

              <div class="form-group">
                <label class="form-label" for="profileGradYearInput">Graduation Year:</label>
                <input type="text" id="profileGradYearInput" class="form-input" value="${user.graduationYear}">
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
            <h3>Workspace Diagnostics & Data Reset</h3>
            <span class="pill-badge pill-gray">Local Storage</span>
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

          <div class="reset-zone-card mb-3">
            <h4>Reset Syllabus Map Only</h4>
            <p class="text-sm text-muted">
              Recalculates topic evidence statuses against active documents and restores default syllabus modules. Preserves all uploaded PDFs, bookmarks, notes, and preferences.
            </p>
            <button type="button" class="btn btn-secondary btn-sm mt-3" id="resetSyllabusBtn">
              Reset Syllabus Topics
            </button>
          </div>

          <div class="reset-zone-card">
            <h4>Reset Workspace to Seed Demo State</h4>
            <p class="text-sm text-muted">
              Restores all sample textbooks, syllabus coverage indicators, misconception issues, and revision schedules back to original factory defaults. Only clears Syllora workspace keys and cached PDF blobs.
            </p>
            <button type="button" class="btn btn-danger btn-sm mt-3" id="resetWorkspaceBtn">
              Reset Demo Workspace Data
            </button>
          </div>
        </div>

      </div>

    </div>
  `;

  // Form submission
  const profileForm = container.querySelector('#profileForm');
  if (profileForm) {
    profileForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = container.querySelector('#profileNameInput').value.trim();
      const email = container.querySelector('#profileEmailInput').value.trim();
      const program = container.querySelector('#profileProgramInput').value.trim();
      const graduationYear = container.querySelector('#profileGradYearInput').value.trim();
      const dailyGoalMinutes = parseInt(container.querySelector('#profileGoalInput').value, 10);

      sessionAdapter.updateProfile({
        name,
        email,
        program,
        graduationYear,
        dailyGoalMinutes,
        avatarText: name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
      });

      Toast.show('Profile information saved.', 'success');
      // Refresh topbar/shell user display
      window.dispatchEvent(new Event('syllora_user_updated'));
    });
  }

  // Reset syllabus only
  const resetSyllabusBtn = container.querySelector('#resetSyllabusBtn');
  if (resetSyllabusBtn) {
    resetSyllabusBtn.addEventListener('click', () => {
      Modal.open(
        'Confirm Syllabus Reset',
        `
          <p>Reset syllabus topics to default curriculum structure?</p>
          <p class="text-muted text-sm mt-2">Uploaded PDFs, stored binaries, drafts, and unrelated study records will NOT be deleted.</p>
        `,
        () => {
          workspaceStore.resetSyllabusData();
          Toast.show('Syllabus topics reset and evidence recalculated against active library.', 'success');
          renderSettings(container);
        },
        'Reset Syllabus',
        'primary'
      );
    });
  }

  // Reset full demo workspace
  const resetBtn = container.querySelector('#resetWorkspaceBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      Modal.open(
        'Confirm Full Workspace Reset',
        `
          <p>Are you sure you want to restore the pristine sample dataset for CS301?</p>
          <p class="text-muted text-sm mt-2">All uploaded PDFs, stored binaries, drafts, and study records will be reset to factory defaults.</p>
        `,
        async () => {
          await workspaceStore.resetWorkspaceData();
          Toast.show('Workspace state reset to pristine fixtures.', 'success');
          renderSettings(container);
        },
        'Confirm Reset',
        'danger'
      );
    });
  }
}
