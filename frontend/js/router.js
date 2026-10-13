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
    window.location.hash = hash;
  }

  getCurrentPath() {
    const raw = window.location.hash.slice(1) || '/login';
    const [path] = raw.split('?');
    return path.startsWith('/') ? path : `/${path}`;
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

  handleRouting() {
    let path = this.getCurrentPath();
    const queryParams = this.getQueryParams();

    // If root or empty, default to #/login unless session already active
    if (path === '/' || path === '') {
      if (sessionAdapter.isAuthenticated()) {
        this.navigate('/app/overview');
        return;
      } else {
        path = '/login';
      }
    }

    // Workspace Route Guard: auto-initialize demo user if visiting /app directly
    if (path.startsWith('/app')) {
      if (!sessionAdapter.isAuthenticated()) {
        // Auto-seed demo session for direct visits per Section 1 requirements
        sessionAdapter.loginDemoUser({ name: 'Prajith P', email: 'demo@syllora.com' });
      }
    }

    this.currentRoute = path;
    this.currentParams = queryParams;

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
