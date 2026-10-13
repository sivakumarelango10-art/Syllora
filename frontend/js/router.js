/**
 * ============================================================================
 * SYLLORA CLIENT-SIDE ROUTER
 * ============================================================================
 * Hash-based SPA routing with Back/Forward history support, direct bookmarking,
 * route parameters, route protection, and intentional 404 view handling.
 */

import { sessionAdapter } from './session.js';

class Router {
  constructor() {
    this.routes = new Map();
    this.currentRoute = null;
    this.currentParams = {};
    this.lastRenderedKey = null;
    this.routeListeners = new Set();

    window.addEventListener('hashchange', () => this.handleRouting());
    window.addEventListener('load', () => this.handleRouting());
  }

  register(path, viewHandler) {
    this.routes.set(path, viewHandler);
  }

  subscribe(listener) {
    this.routeListeners.add(listener);
    return () => this.routeListeners.delete(listener);
  }

  navigate(path, params = {}) {
    let hash = `#${path}`;
    const query = new URLSearchParams(params).toString();
    if (query) {
      hash += `?${query}`;
    }
    if (window.location.hash === hash) {
      // If hash is identical, still ensure route handler fires once if needed
      this.handleRouting(true);
    } else {
      window.location.hash = hash;
    }
  }

  getCurrentPath() {
    const raw = window.location.hash.slice(1) || '/login';
    // Guard against treating Supabase OAuth redirect fragments as 404 paths
    if (raw.includes('access_token=') || raw.includes('error=')) {
      return '/oauth-callback';
    }
    const [path] = raw.split('?');
    let clean = path.startsWith('/') ? path : `/${path}`;
    if (clean.length > 1 && clean.endsWith('/')) {
      clean = clean.slice(0, -1);
    }
    return clean;
  }

  getQueryParams() {
    const raw = window.location.hash.slice(1) || '';
    const [, queryString] = raw.split('?');
    if (!queryString) return {};
    const params = {};
    new URLSearchParams(queryString).forEach((val, key) => {
      params[key] = val;
    });
    return params;
  }

  updateDocumentTitle(path) {
    const titles = {
      '/app/overview': 'Syllora — Overview',
      '/app/materials': 'Syllora — Study Materials',
      '/app/ask': 'Syllora — Ask Syllora',
      '/app/exams': 'Syllora — Exam Intelligence',
      '/app/syllabus': 'Syllora — Syllabus Map',
      '/app/understanding': 'Syllora — Check Understanding',
      '/app/misconceptions': 'Syllora — Misconception Notebook',
      '/app/revision': 'Syllora — Revision Planner',
      '/app/faculty': 'Syllora — Faculty Console',
      '/app/settings': 'Syllora — Settings',
      '/login': 'Syllora — Log In | Your syllabus, simplified.',
      '/signup': 'Syllora — Create Account | Your syllabus, simplified.',
      '/forgot': 'Syllora — Reset Password | Your syllabus, simplified.',
      '/reset-password': 'Syllora — Set New Password | Your syllabus, simplified.'
    };
    document.title = titles[path] || 'Syllora — Academic Study Assistant';
  }

  handleRouting(force = false) {
    let path = this.getCurrentPath();
    const queryParams = this.getQueryParams();

    // If OAuth callback fragment detected, let auth handler process tokens
    if (path === '/oauth-callback') {
      return;
    }

    // If root or empty, default to #/login unless session already active
    if (path === '/' || path === '') {
      if (sessionAdapter.isAuthenticated()) {
        this.navigate('/app/overview');
        return;
      } else {
        path = '/login';
      }
    }

    // Redirect already authenticated users away from auth cards to workspace
    if ((path === '/login' || path === '/signup' || path === '/forgot') && sessionAdapter.isAuthenticated()) {
      this.navigate('/app/overview');
      return;
    }

    // Workspace Route Guard: redirect unauthenticated access to login
    if (path.startsWith('/app')) {
      if (!sessionAdapter.isAuthenticated()) {
        this.navigate('/login');
        return;
      }
    }

    const queryKey = new URLSearchParams(queryParams).toString();
    const routeKey = `${path}?${queryKey}`;

    // Deduplicate identical sequential calls unless forced
    if (!force && this.lastRenderedKey === routeKey) {
      return;
    }

    this.currentRoute = path;
    this.currentParams = queryParams;
    this.lastRenderedKey = routeKey;

    this.updateDocumentTitle(path);

    const handler = this.routes.get(path) || this.routes.get('/app/404');

    this.routeListeners.forEach((listener) => {
      try {
        listener(path, queryParams, handler);
      } catch (err) {
        console.error('[Router] Error in route listener:', err);
      }
    });
  }
}

export const router = new Router();
