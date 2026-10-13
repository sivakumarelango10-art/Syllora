/**
 * ============================================================================
 * SYLLORA DEMO SESSION ADAPTER
 * ============================================================================
 * Manages client-side demo authentication state without saving passwords.
 * Logout clears only Syllora demo-session keys and returns to the login screen.
 */

const USER_SESSION_KEY = 'syllora_demo_user';

export const sessionAdapter = {
  /**
   * Retrieve active demo user or null
   */
  getDemoUser() {
    try {
      const data = localStorage.getItem(USER_SESSION_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.warn('[SessionAdapter] Storage read error:', e);
    }
    return null;
  },

  /**
   * Create or update demo session
   */
  loginDemoUser(user = {}) {
    const defaultUser = {
      name: 'Prajith P',
      email: 'demo@syllora.com',
      role: 'CS Undergrad',
      program: 'B.Tech Computer Science & Engineering',
      graduationYear: '2027',
      avatarText: 'PP',
      activeCourseId: 'cs301',
      dailyGoalMinutes: 45,
      notificationsEnabled: true
    };

    const sessionUser = { ...defaultUser, ...user, loggedInAt: new Date().toISOString() };
    try {
      localStorage.setItem(USER_SESSION_KEY, JSON.stringify(sessionUser));
    } catch (e) {
      console.warn('[SessionAdapter] Storage write error:', e);
    }
    return sessionUser;
  },

  /**
   * Update profile info for active demo user
   */
  updateProfile(updates) {
    const current = this.getDemoUser() || {};
    const updated = { ...current, ...updates };
    try {
      localStorage.setItem(USER_SESSION_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('[SessionAdapter] Storage write error:', e);
    }
    return updated;
  },

  /**
   * Log out: clears ONLY syllora_demo_user without wiping all browser storage
   */
  logout() {
    try {
      localStorage.removeItem(USER_SESSION_KEY);
    } catch (e) {}
    // Navigate back to login
    window.location.hash = '#/login';
  },

  /**
   * Check if a demo user is currently active
   */
  isAuthenticated() {
    return !!this.getDemoUser();
  }
};
