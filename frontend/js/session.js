/**
 * ============================================================================
 * SYLLORA UNIFIED SESSION ADAPTER
 * ============================================================================
 * Manages authenticated student sessions and isolated offline demo states.
 * Real users authenticate via Supabase Auth and receive valid JWT bearer tokens.
 * Offline demo sessions are strictly quarantined in local development.
 */

import { signOut, SUPABASE_CONFIG, getCurrentUser, getAuthToken } from './services/supabase.js';

const DEMO_SESSION_KEY = 'syllora_demo_user';

// One-time legacy cleanup: remove any stale demo session to prevent silent demo login
if (typeof window !== 'undefined') {
  try {
    if (localStorage.getItem(DEMO_SESSION_KEY)) {
      localStorage.removeItem(DEMO_SESSION_KEY);
      console.info('[SessionAdapter] Legacy demo session cleared from storage.');
    }
  } catch (e) {}
}

export const sessionAdapter = {
  /**
   * Demo authentication is strictly disabled across development and production
   * @returns {boolean}
   */
  isDemoAllowed() {
    return false;
  },

  /**
   * Determine if the active session is an offline demo session (always false)
   * @returns {boolean}
   */
  isDemoSession() {
    return false;
  },

  /**
   * Retrieve active Supabase user converted to application profile format
   */
  getSupabaseUser() {
    const sbUser = getCurrentUser();
    if (!sbUser) return null;
    const meta = sbUser.user_metadata || {};
    const fullName = meta.full_name || meta.name || (sbUser.email ? sbUser.email.split('@')[0] : 'Student');
    const initials = fullName
      .split(' ')
      .filter(Boolean)
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'ST';

    return {
      id: sbUser.id,
      name: fullName,
      email: sbUser.email,
      role: meta.role || 'Student',
      program: meta.program || 'Academic Studies',
      graduationYear: meta.graduation_year || '',
      avatarText: initials,
      activeCourseId: null,
      dailyGoalMinutes: meta.daily_goal_minutes || 45,
      notificationsEnabled: meta.notifications_enabled ?? true,
      isDemo: false
    };
  },

  /**
   * Get authenticated user
   */
  getUser() {
    return this.getSupabaseUser();
  },

  /**
   * Backward-compatible alias for existing views
   */
  getDemoUser() {
    return this.getUser();
  },

  /**
   * Demo user creation is strictly disabled
   */
  loginDemoUser() {
    console.warn('[SessionAdapter] loginDemoUser is disabled. Use genuine Supabase Auth.');
    return null;
  },

  /**
   * Update profile info for active user
   */
  updateProfile(updates) {
    const user = this.getSupabaseUser();
    if (!user) return null;
    return { ...user, ...updates };
  },

  /**
   * Log out: clears session tokens, notifies Supabase, and returns to login
   */
  logout() {
    try {
      localStorage.removeItem(DEMO_SESSION_KEY);
      localStorage.removeItem(SUPABASE_CONFIG.sessionStorageKey);
    } catch (e) {}
    try {
      signOut();
    } catch (e) {}
    window.location.hash = '#/login';
  },

  /**
   * Check if a verified session is currently active
   */
  isAuthenticated() {
    const token = getAuthToken();
    return Boolean(token && this.getSupabaseUser());
  }
};
