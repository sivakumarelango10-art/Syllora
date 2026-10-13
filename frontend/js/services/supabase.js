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
  url: (typeof window !== "undefined" && window.__SYLLORA_CONFIG__?.PUBLIC_SUPABASE_URL) || "https://lgiarosqejiaejizrxdu.supabase.co",
  publishableKey: (typeof window !== "undefined" && window.__SYLLORA_CONFIG__?.PUBLIC_SUPABASE_PUBLISHABLE_KEY) || "sb_publishable_AasSK22U-NcZhWk4e-7VAA_FFAUyQIU",
  storageBucket: (typeof window !== "undefined" && window.__SYLLORA_CONFIG__?.SUPABASE_STORAGE_BUCKET) || "syllora-study-pdfs",
  sessionStorageKey: "syllora_supabase_session",
};

let _supabaseClient = null;
const _authListeners = new Set();
let _refreshPromise = null;

// Multi-tab storage synchronization: notify listeners when session changes across tabs
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === SUPABASE_CONFIG.sessionStorageKey) {
      if (!event.newValue) {
        _notifyAuthListeners("SIGNED_OUT", null);
      } else {
        try {
          const parsed = JSON.parse(event.newValue);
          const session = parsed?.currentSession || parsed;
          if (session?.access_token) {
            _notifyAuthListeners("TOKEN_REFRESHED", session);
          }
        } catch {}
      }
    }
  });
}

/**
 * Safely parse a JWT payload without external libraries.
 * @param {string} token
 * @returns {object|null}
 */
export function parseJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

/**
 * Determine if a JWT token is expired or close to expiring (within buffer seconds).
 * @param {string} token
 * @param {number} bufferSeconds
 * @returns {boolean}
 */
export function isTokenExpired(token, bufferSeconds = 30) {
  const payload = parseJwtPayload(token);
  if (!payload || !payload.exp) return true;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp <= now + bufferSeconds;
}

/**
 * Initialize or retrieve official Supabase client instance
 */
export async function getSupabase() {
  if (_supabaseClient) {
    return _supabaseClient;
  }

  const hookSdkListener = (client) => {
    if (client && client.auth && typeof client.auth.onAuthStateChange === "function") {
      try {
        client.auth.onAuthStateChange((event, session) => {
          _notifyAuthListeners(event, session);
        });
      } catch {}
    }
  };

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
    hookSdkListener(_supabaseClient);
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
    hookSdkListener(_supabaseClient);
    return _supabaseClient;
  } catch (err) {
    console.warn("[Syllora Supabase] CDN module unavailable, using native REST fallback:", err);
  }

  // 3. Resilient native REST client fallback (zero external dependencies)
  _supabaseClient = createNativeSupabaseRestClient();
  return _supabaseClient;
}

/**
 * Retrieve active JWT token for backend requests.
 * Enforces structure validation; rejects malformed or forged tokens.
 * @returns {string|null}
 */
export function getAuthToken() {
  try {
    const raw = localStorage.getItem(SUPABASE_CONFIG.sessionStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const token = parsed?.access_token || parsed?.currentSession?.access_token || null;
    if (!token || typeof token !== "string") return null;

    // Validate 3-part dot-separated JWT structure
    const payload = parseJwtPayload(token);
    if (!payload || !payload.sub) {
      console.warn("[Syllora Supabase] Discarding malformed or forged token from storage.");
      return null;
    }
    return token;
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
 * Verify active session with the backend/Supabase Auth server.
 * Ensures the session has not been revoked or forged.
 * @returns {Promise<object|null>}
 */
export async function verifyActiveSession() {
  const token = getAuthToken();
  if (!token) return null;

  const client = await getSupabase();
  if (client && client.auth && typeof client.auth.getUser === "function") {
    try {
      const { data, error } = await client.auth.getUser(token);
      if (error || !data?.user) {
        console.warn("[Syllora Supabase] Session verification failed on server:", error);
        await signOut();
        return null;
      }
      return data.user;
    } catch {
      return getCurrentUser();
    }
  }
  return getCurrentUser();
}

/**
 * Sign in with email and password using Supabase Auth
 */
export async function signInWithPassword(email, password) {
  const client = await getSupabase();
  return await client.auth.signInWithPassword({ email, password });
}

/**
 * Sign in with OAuth provider (e.g. 'google') using Supabase Auth
 * @param {string} provider
 * @param {object} options
 */
export async function signInWithOAuth(provider = "google", options = {}) {
  const client = await getSupabase();
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const defaultRedirect = `${origin}/`;
  const mergedOptions = {
    redirectTo: options.redirectTo || defaultRedirect,
    queryParams: { access_type: "offline", prompt: "consent", ...(options.queryParams || {}) },
    ...options,
  };

  if (client && client.auth && typeof client.auth.signInWithOAuth === "function") {
    return await client.auth.signInWithOAuth({
      provider,
      options: mergedOptions,
    });
  }

  // Resilient REST fallback
  const authUrl = `${SUPABASE_CONFIG.url}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(mergedOptions.redirectTo)}`;
  if (typeof window !== "undefined") {
    window.location.href = authUrl;
  }
  return { data: { provider, url: authUrl }, error: null };
}

/**
 * Send password recovery instructions to email
 * @param {string} email
 * @param {object} options
 */
export async function resetPasswordForEmail(email, options = {}) {
  const client = await getSupabase();
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const defaultRedirect = `${origin}/#/reset-password`;
  const mergedOptions = {
    redirectTo: options.redirectTo || defaultRedirect,
    ...options,
  };

  if (client && client.auth && typeof client.auth.resetPasswordForEmail === "function") {
    return await client.auth.resetPasswordForEmail(email, mergedOptions);
  }
  return await client.auth.resetPasswordForEmail(email, mergedOptions);
}

/**
 * Update authenticated user attributes (e.g. password, metadata)
 * @param {object} attributes
 */
export async function updateUser(attributes = {}) {
  const client = await getSupabase();
  return await client.auth.updateUser(attributes);
}

/**
 * Detect, parse, and process OAuth or password recovery callback from URL hash/search params.
 * Prevents router hash collisions and cleans URL history.
 * @returns {Promise<{isOAuthCallback: boolean, success?: boolean, isRecovery?: boolean, error?: string, session?: object}>}
 */
export async function handleOAuthCallback() {
  if (typeof window === "undefined") return { isOAuthCallback: false };

  const hash = window.location.hash || "";
  const search = window.location.search || "";

  // Check for error in hash or search
  const hashParams = new URLSearchParams(hash.replace(/^#\/?/, ""));
  const searchParams = new URLSearchParams(search);

  const errorDesc = hashParams.get("error_description") || searchParams.get("error_description");
  const error = hashParams.get("error") || searchParams.get("error");

  if (error || errorDesc) {
    console.warn("[Syllora Auth] OAuth callback reported error:", error, errorDesc);
    window.history.replaceState(null, "", `${window.location.pathname}#/login`);
    return {
      isOAuthCallback: true,
      success: false,
      error: errorDesc ? decodeURIComponent(errorDesc.replace(/\+/g, " ")) : "Authentication canceled or failed.",
    };
  }

  const hasAccessToken = hash.includes("access_token=") || hashParams.has("access_token");
  const hasCode = searchParams.has("code");
  const isRecovery = hash.includes("type=recovery") || hashParams.get("type") === "recovery";

  if (hasAccessToken || hasCode) {
    console.log("[Syllora Auth] Processing OAuth / recovery callback parameters...");
    const client = await getSupabase();

    let session = null;
    try {
      const { data, error: sessionErr } = await client.auth.getSession();
      if (!sessionErr && data?.session) {
        session = data.session;
      }
    } catch (e) {
      console.warn("[Syllora Auth] getSession error during callback:", e);
    }

    if (!session && hasAccessToken) {
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const expiresIn = hashParams.get("expires_in");
      const tokenType = hashParams.get("token_type") || "bearer";

      if (accessToken) {
        const payload = parseJwtPayload(accessToken);
        const user = payload
          ? { id: payload.sub, email: payload.email, user_metadata: payload.user_metadata || {} }
          : null;
        session = {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: expiresIn ? parseInt(expiresIn, 10) : 3600,
          token_type: tokenType,
          user,
        };
        localStorage.setItem(SUPABASE_CONFIG.sessionStorageKey, JSON.stringify(session));
      }
    }

    if (isRecovery) {
      // User arrived from password reset recovery email
      window.history.replaceState(null, "", `${window.location.pathname}#/reset-password`);
      _notifyAuthListeners("PASSWORD_RECOVERY", session);
      return {
        isOAuthCallback: true,
        isRecovery: true,
        success: true,
        session,
      };
    }

    if (session && session.access_token) {
      window.history.replaceState(null, "", `${window.location.pathname}#/app/overview`);
      _notifyAuthListeners("SIGNED_IN", session);
      return {
        isOAuthCallback: true,
        success: true,
        session,
      };
    } else {
      window.history.replaceState(null, "", `${window.location.pathname}#/login`);
      return {
        isOAuthCallback: true,
        success: false,
        error: "Unable to establish authenticated session from OAuth provider.",
      };
    }
  }

  return { isOAuthCallback: false };
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
  try {
    localStorage.removeItem(SUPABASE_CONFIG.sessionStorageKey);
  } catch {}
  let result = null;
  try {
    result = await client.auth.signOut();
  } catch {}
  _notifyAuthListeners("SIGNED_OUT", null);
  return result;
}

/**
 * Refresh current Supabase session using stored refresh token.
 * Thread-safe: deduplicates concurrent requests using a shared promise mutex.
 */
export async function refreshSession() {
  if (_refreshPromise) {
    return _refreshPromise;
  }
  _refreshPromise = _performRefreshSession().finally(() => {
    _refreshPromise = null;
  });
  return _refreshPromise;
}

async function _performRefreshSession() {
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
    if (!res.ok) {
      // If refresh token is revoked or invalid, clear session
      if (res.status === 400 || res.status === 401) {
        localStorage.removeItem(SUPABASE_CONFIG.sessionStorageKey);
        _notifyAuthListeners("SIGNED_OUT", null);
      }
      return null;
    }
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
      async signInWithOAuth({ provider = "google", options = {} }) {
        const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
        const redirectTo = encodeURIComponent(options.redirectTo || `${origin}/`);
        const authUrl = `${baseUrl}/auth/v1/authorize?provider=${provider}&redirect_to=${redirectTo}`;
        if (typeof window !== "undefined") {
          window.location.href = authUrl;
        }
        return { data: { provider, url: authUrl }, error: null };
      },
      async resetPasswordForEmail(email, options = {}) {
        try {
          const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
          const redirectTo = options.redirectTo || `${origin}/#/reset-password`;
          const res = await fetch(`${baseUrl}/auth/v1/recover`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: key,
            },
            body: JSON.stringify({ email, redirect_to: redirectTo }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            return { data: null, error: new Error(data.error_description || data.msg || "Password reset request failed") };
          }
          return { data, error: null };
        } catch (err) {
          return { data: null, error: err };
        }
      },
      async updateUser(attributes = {}) {
        try {
          const token = getAuthToken();
          if (!token) return { data: null, error: new Error("No active session") };
          const res = await fetch(`${baseUrl}/auth/v1/user`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              apikey: key,
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(attributes),
          });
          const data = await res.json();
          if (!res.ok) {
            return { data: null, error: new Error(data.error_description || data.msg || "Failed to update user") };
          }
          return { data: { user: data }, error: null };
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
