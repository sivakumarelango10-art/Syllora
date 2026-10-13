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

export const sessionAdapter = {
  /**
   * Determine if the active session is an offline demo session
   * @returns {boolean}
   */
  isDemoSession() {
    if (this.getSupabaseUser()) return false;
    const demo = this._getRawDemoUser();
    return !!(demo && demo.isDemo);
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
      graduationYear: meta.graduation_year || '2027',
      avatarText: initials,
      activeCourseId: 'cs301',
      dailyGoalMinutes: 45,
      notificationsEnabled: true,
      isDemo: false
    };
  },

  /**
   * Internal helper: read raw demo session from localStorage
   */
  _getRawDemoUser() {
    try {
      const data = localStorage.getItem(DEMO_SESSION_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.warn('[SessionAdapter] Storage read error:', e);
    }
    return null;
  },

  /**
   * Get active user: real Supabase student if signed in, demo user if demo mode active
   */
  getUser() {
    const supabaseUser = this.getSupabaseUser();
    if (supabaseUser) {
      return supabaseUser;
    }
    const demo = this._getRawDemoUser();
    if (demo) {
      return { ...demo, isDemo: true };
    }
    return null;
  },

  /**
   * Backward-compatible alias for existing views (e.g. shell, overview, settings)
   */
  getDemoUser() {
    return this.getUser();
  },

  /**
   * Create or update demo session (local dev only)
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
      notificationsEnabled: true,
      isDemo: true
    };

    const sessionUser = { ...defaultUser, ...user, isDemo: true, loggedInAt: new Date().toISOString() };
    try {
      localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(sessionUser));
    } catch (e) {
      console.warn('[SessionAdapter] Storage write error:', e);
    }
    return sessionUser;
  },

  /**
   * Update profile info for active user
   */
  updateProfile(updates) {
    if (this.isDemoSession()) {
      const current = this._getRawDemoUser() || {};
      const updated = { ...current, ...updates };
      try {
        localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(updated));
      } catch (e) {
        console.warn('[SessionAdapter] Storage write error:', e);
      }
      return updated;
    }
    // For real Supabase user, return updated merged user representation
    return { ...this.getSupabaseUser(), ...updates };
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
    // Navigate back to login
    window.location.hash = '#/login';
  },

  /**
   * Check if a verified session or demo user is currently active
   */
  isAuthenticated() {
    // 1. Real Supabase session with token
    const token = getAuthToken();
    if (token && this.getSupabaseUser()) {
      return true;
    }
    // 2. Demo mode active
    const demo = this._getRawDemoUser();
    if (demo && demo.isDemo) {
      return true;
    }
    return false;
  }
};
