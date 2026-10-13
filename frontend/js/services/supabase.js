/**
 * ============================================================================
 * SYLLORA SUPABASE CLIENT SERVICE
 * ============================================================================
 * Official Supabase integration for Syllora's Vanilla JavaScript architecture.
 * Supports authentication, session management, and owner-scoped queries.
 *
 * Configured with project: https://lgiarosqejiaejizrxdu.supabase.co
 */

export const SUPABASE_CONFIG = {
  url: "https://lgiarosqejiaejizrxdu.supabase.co",
  publishableKey: "sb_publishable_AasSK22U-NcZhWk4e-7VAA_FFAUyQIU",
  storageBucket: "syllora-study-pdfs",
  sessionStorageKey: "syllora_supabase_session",
};

let _supabaseClient = null;
const _authListeners = new Set();

/**
 * Initialize or retrieve official Supabase client instance
 */
export async function getSupabase() {
  if (_supabaseClient) {
    return _supabaseClient;
  }

  // 1. Check if Supabase is already available globally (e.g. from script tag)
  if (typeof window !== "undefined" && window.supabase && window.supabase.createClient) {
    _supabaseClient = window.supabase.createClient(
      SUPABASE_CONFIG.url,
      SUPABASE_CONFIG.publishableKey,
      {
        auth: {
          persistSession: true,
          storageKey: SUPABASE_CONFIG.sessionStorageKey,
          autoRefreshToken: true,
        },
      }
    );
    return _supabaseClient;
  }

  // 2. Dynamic import via ESM CDN
  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    _supabaseClient = createClient(
      SUPABASE_CONFIG.url,
      SUPABASE_CONFIG.publishableKey,
      {
        auth: {
          persistSession: true,
          storageKey: SUPABASE_CONFIG.sessionStorageKey,
          autoRefreshToken: true,
        },
      }
    );
    return _supabaseClient;
  } catch (err) {
    console.warn("[Syllora Supabase] CDN module unavailable, using native REST fallback:", err);
  }

  // 3. Resilient native REST client fallback (zero external dependencies)
  _supabaseClient = createNativeSupabaseRestClient();
  return _supabaseClient;
}

/**
 * Retrieve active JWT token for backend requests
 * @returns {string|null}
 */
export function getAuthToken() {
  try {
    const raw = localStorage.getItem(SUPABASE_CONFIG.sessionStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.access_token || parsed?.currentSession?.access_token || null;
  } catch {
    return null;
  }
}

/**
 * Retrieve active Supabase user object or null
 */
export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(SUPABASE_CONFIG.sessionStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.user || parsed?.currentSession?.user || null;
  } catch {
    return null;
  }
}

/**
 * Sign in with email and password using Supabase Auth
 */
export async function signInWithPassword(email, password) {
  const client = await getSupabase();
  return await client.auth.signInWithPassword({ email, password });
}

/**
 * Sign up a new user using Supabase Auth
 */
export async function signUp(email, password, options = {}) {
  const client = await getSupabase();
  return await client.auth.signUp({ email, password, options });
}

/**
 * Sign out active Supabase session
 */
export async function signOut() {
  const client = await getSupabase();
  localStorage.removeItem(SUPABASE_CONFIG.sessionStorageKey);
  const result = await client.auth.signOut();
  _notifyAuthListeners("SIGNED_OUT", null);
  return result;
}

/**
 * Refresh current Supabase session using stored refresh token
 */
export async function refreshSession() {
  const client = await getSupabase();
  if (client && client.auth && typeof client.auth.refreshSession === "function") {
    try {
      const { data, error } = await client.auth.refreshSession();
      if (!error && data?.session) {
        localStorage.setItem(SUPABASE_CONFIG.sessionStorageKey, JSON.stringify(data.session));
        _notifyAuthListeners("TOKEN_REFRESHED", data.session);
        return data.session;
      }
    } catch (e) {
      console.warn("[Syllora Supabase] client.auth.refreshSession failed:", e);
    }
  }

  // Native REST fallback for refresh_token grant
  try {
    const raw = localStorage.getItem(SUPABASE_CONFIG.sessionStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const refreshToken = parsed.refresh_token || parsed.currentSession?.refresh_token;
    if (!refreshToken) return null;

    const res = await fetch(`${SUPABASE_CONFIG.url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_CONFIG.publishableKey,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.access_token) {
      localStorage.setItem(SUPABASE_CONFIG.sessionStorageKey, JSON.stringify(data));
      _notifyAuthListeners("TOKEN_REFRESHED", data);
      return data;
    }
  } catch (err) {
    console.warn("[Syllora Supabase] REST refresh failed:", err);
  }
  return null;
}

/**
 * Register a listener for authentication state transitions
 */
export function onAuthStateChange(callback) {
  _authListeners.add(callback);
  return () => _authListeners.delete(callback);
}

function _notifyAuthListeners(event, session) {
  _authListeners.forEach((fn) => {
    try {
      fn(event, session);
    } catch (e) {
      console.error("[Syllora Supabase] Listener error:", e);
    }
  });
}

/**
 * Lightweight, zero-dependency REST client fallback for Supabase
 */
function createNativeSupabaseRestClient() {
  const baseUrl = SUPABASE_CONFIG.url;
  const key = SUPABASE_CONFIG.publishableKey;

  return {
    auth: {
      async getSession() {
        const token = getAuthToken();
        const user = getCurrentUser();
        return { data: { session: token ? { access_token: token, user } : null }, error: null };
      },
      async getUser() {
        return { data: { user: getCurrentUser() }, error: null };
      },
      async signInWithPassword({ email, password }) {
        try {
          const res = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: key,
            },
            body: JSON.stringify({ email, password }),
          });
          const data = await res.json();
          if (!res.ok) {
            return { data: null, error: new Error(data.error_description || data.msg || "Authentication failed") };
          }
          localStorage.setItem(SUPABASE_CONFIG.sessionStorageKey, JSON.stringify(data));
          _notifyAuthListeners("SIGNED_IN", data);
          return { data, error: null };
        } catch (err) {
          return { data: null, error: err };
        }
      },
      async signUp({ email, password, options = {} }) {
        try {
          const res = await fetch(`${baseUrl}/auth/v1/signup`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: key,
            },
            body: JSON.stringify({ email, password, data: options.data || {} }),
          });
          const data = await res.json();
          if (!res.ok) {
            return { data: null, error: new Error(data.error_description || data.msg || "Sign up failed") };
          }
          if (data.access_token) {
            localStorage.setItem(SUPABASE_CONFIG.sessionStorageKey, JSON.stringify(data));
          }
          return { data, error: null };
        } catch (err) {
          return { data: null, error: err };
        }
      },
      async signOut() {
        const token = getAuthToken();
        if (token) {
          try {
            await fetch(`${baseUrl}/auth/v1/logout`, {
              method: "POST",
              headers: {
                apikey: key,
                Authorization: `Bearer ${token}`,
              },
            });
          } catch {}
        }
        localStorage.removeItem(SUPABASE_CONFIG.sessionStorageKey);
        return { error: null };
      },
    },
    from(table) {
      return {
        async select(columns = "*") {
          const token = getAuthToken();
          const headers = { apikey: key };
          if (token) headers["Authorization"] = `Bearer ${token}`;
          const res = await fetch(`${baseUrl}/rest/v1/${table}?select=${encodeURIComponent(columns)}`, { headers });
          const data = await res.json();
          return { data: res.ok ? data : null, error: res.ok ? null : data };
        },
      };
    },
  };
}
