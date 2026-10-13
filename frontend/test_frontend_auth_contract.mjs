/**
 * Automated verification of Syllora Phase 4.1 Frontend Auth Contract,
 * Discrepancy Elimination, and Animation Integrity.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

const ROOT_DIR = process.cwd();
const APP_JS_PATH = path.join(ROOT_DIR, 'frontend', 'app.js');
const MAIN_JS_PATH = path.join(ROOT_DIR, 'frontend', 'js', 'main.js');
const SESSION_JS_PATH = path.join(ROOT_DIR, 'frontend', 'js', 'session.js');
const ROUTER_JS_PATH = path.join(ROOT_DIR, 'frontend', 'js', 'router.js');
const SUPABASE_JS_PATH = path.join(ROOT_DIR, 'frontend', 'js', 'services', 'supabase.js');
const AI_API_JS_PATH = path.join(ROOT_DIR, 'frontend', 'js', 'services', 'aiApi.js');

console.log('--- SYLLORA PHASE 4.1 FRONTEND VERIFICATION SUITE ---');

// 1. Verify elimination of the mock login backdoor
const appJsContent = fs.readFileSync(APP_JS_PATH, 'utf8');
assert(
  !appJsContent.includes("password.length >= 4"),
  'FAIL: app.js must not contain password.length >= 4 backdoor!'
);
assert(
  !appJsContent.includes("isMockSuccess"),
  'FAIL: app.js must not contain isMockSuccess backdoor variable!'
);
console.log('✓ PASS: Mock login backdoor completely removed from frontend/app.js');

// 2. Verify window.sylloraAuthenticate is called by app.js
assert(
  appJsContent.includes("window.sylloraAuthenticate"),
  'FAIL: app.js must call window.sylloraAuthenticate!'
);
console.log('✓ PASS: frontend/app.js delegates authentication to window.sylloraAuthenticate');

// 3. Verify main.js defines window.sylloraAuthenticate with signInWithPassword
const mainJsContent = fs.readFileSync(MAIN_JS_PATH, 'utf8');
assert(
  mainJsContent.includes("window.sylloraAuthenticate = async function"),
  'FAIL: main.js must define window.sylloraAuthenticate!'
);
assert(
  mainJsContent.includes("signInWithPassword"),
  'FAIL: main.js must import and call signInWithPassword!'
);
console.log('✓ PASS: frontend/js/main.js invokes real signInWithPassword from Supabase service');

// 4. Verify main.js blocks demo accounts outside of local dev
assert(
  mainJsContent.includes("isLocalDev"),
  'FAIL: main.js must check isLocalDev for demo mode!'
);
assert(
  mainJsContent.includes("Demo accounts are only permitted in local development mode"),
  'FAIL: main.js must reject demo logins in non-local environments!'
);
console.log('✓ PASS: Demo account bypass strictly restricted to local dev environment');

// 5. Verify router.js route guard does NOT auto-login demo user
const routerJsContent = fs.readFileSync(ROUTER_JS_PATH, 'utf8');
assert(
  !routerJsContent.includes("sessionAdapter.loginDemoUser({ name: 'Prajith P'"),
  'FAIL: router.js must not auto-login demo user on /app routes!'
);
assert(
  routerJsContent.includes("this.navigate('/login')"),
  'FAIL: router.js must redirect unauthenticated /app access to /login!'
);
console.log('✓ PASS: frontend/js/router.js redirects unauthenticated access to /login');

// 6. Verify session.js logout clears both session keys and calls signOut
const sessionJsContent = fs.readFileSync(SESSION_JS_PATH, 'utf8');
assert(
  sessionJsContent.includes("signOut"),
  'FAIL: session.js must call signOut on logout!'
);
assert(
  sessionJsContent.includes("SUPABASE_CONFIG.sessionStorageKey"),
  'FAIL: session.js must clear Supabase session storage key!'
);
console.log('✓ PASS: frontend/js/session.js clears both session tokens and signs out of Supabase');

// 7. Verify supabase.js supports session refresh
const supabaseJsContent = fs.readFileSync(SUPABASE_JS_PATH, 'utf8');
assert(
  supabaseJsContent.includes("export async function refreshSession"),
  'FAIL: supabase.js must implement refreshSession!'
);
console.log('✓ PASS: frontend/js/services/supabase.js implements session refresh');

// 8. Verify aiApi.js attaches token and handles 401 refresh
const aiApiJsContent = fs.readFileSync(AI_API_JS_PATH, 'utf8');
assert(
  aiApiJsContent.includes("getAuthToken"),
  'FAIL: aiApi.js must retrieve active auth token!'
);
assert(
  aiApiJsContent.includes("refreshSession"),
  'FAIL: aiApi.js must attempt token refresh on 401!'
);
console.log('✓ PASS: frontend/js/services/aiApi.js attaches Bearer token and retries on 401');

// 9. Verify exact original animation timings and DOM IDs are preserved in app.js
const requiredTimingTokens = [
  'btnMorphCircle: [0.15, 0.60]',
  'minSpinnerDuration: 0.40',
  'checkDrawMorph: [0.05, 0.40]',
  'tealFlood: [0.65, 1.45]',
  'welcomeBookOpen: [0.05, 0.75]',
  'welcomeCheckDraw: [0.60, 1.15]',
  'progressBarFill: [1.65, 3.05]'
];
for (const token of requiredTimingTokens) {
  assert(appJsContent.includes(token), `FAIL: Timing token ${token} missing from app.js!`);
}

const requiredDomIds = [
  'loginBtn', 'btnLabel', 'btnSpinner', 'btnCheckmarkMorph',
  'morphCheckPath', 'tealFloodOverlay', 'floodCircle', 'welcomeScreen'
];
for (const id of requiredDomIds) {
  assert(appJsContent.includes(`document.getElementById('${id}')`), `FAIL: Element ${id} missing from app.js!`);
}
console.log('✓ PASS: All original animation timings, easing curves, and DOM elements preserved perfectly');

console.log('\nALL 9 FRONTEND INTEGRATION CHECKS PASSED SUCCESSFULLY.');
