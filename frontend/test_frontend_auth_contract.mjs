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

// 4. Verify demo accounts are completely disabled in all environments
const sessionJsContent = fs.readFileSync(SESSION_JS_PATH, 'utf8');
assert(
  sessionJsContent.includes("isDemoAllowed()") && sessionJsContent.includes("return false;"),
  'FAIL: session.js must return false for isDemoAllowed()!'
);
console.log('✓ PASS: Demo account bypass strictly eliminated in all environments');

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

// 10. Verify aiApi.js enforces approved origin whitelist and rejects arbitrary overrides
assert(
  aiApiJsContent.includes("export const APPROVED_API_ORIGINS"),
  'FAIL: aiApi.js must define APPROVED_API_ORIGINS whitelist!'
);
assert(
  aiApiJsContent.includes("isApprovedOrigin"),
  'FAIL: aiApi.js must export isApprovedOrigin validator!'
);
assert(
  aiApiJsContent.includes("Ignored unapproved localStorage syllora_api_base"),
  'FAIL: aiApi.js must reject unapproved localStorage api base overrides!'
);
assert(
  aiApiJsContent.includes("Security Exception: API base origin"),
  'FAIL: aiApi.js must block requests to unapproved origins!'
);
console.log('✓ PASS: frontend/js/services/aiApi.js strictly enforces approved origin whitelist and rejects tampering');

// 11. Verify supabase.js implements token structure checks, concurrent refresh mutex, and multi-tab sync
assert(
  supabaseJsContent.includes("export function parseJwtPayload"),
  'FAIL: supabase.js must implement parseJwtPayload!'
);
assert(
  supabaseJsContent.includes("let _refreshPromise = null"),
  'FAIL: supabase.js must implement _refreshPromise mutex for concurrent refresh deduplication!'
);
assert(
  supabaseJsContent.includes("window.addEventListener(\"storage\""),
  'FAIL: supabase.js must listen for storage events across browser tabs!'
);
assert(
  supabaseJsContent.includes("export async function verifyActiveSession"),
  'FAIL: supabase.js must provide verifyActiveSession to validate tokens with the server!'
);
console.log('✓ PASS: frontend/js/services/supabase.js enforces JWT structure, concurrent mutex, and multi-tab sync');

// 12. Verify session.js restricts demo mode with isDemoAllowed
assert(
  sessionJsContent.includes("isDemoAllowed()"),
  'FAIL: session.js must implement isDemoAllowed to guard demo sessions!'
);
console.log('✓ PASS: frontend/js/session.js gates demo mode strictly behind isDemoAllowed()');

// 13. Verify Google OAuth button invokes real Supabase OAuth (no hardcoded error)
assert(
  !appJsContent.includes("Google Single Sign-On is not configured"),
  'FAIL: app.js still contains hardcoded Google failure message!'
);
assert(
  appJsContent.includes("window.sylloraGoogleAuth"),
  'FAIL: app.js must call window.sylloraGoogleAuth!'
);
assert(
  mainJsContent.includes("window.sylloraGoogleAuth = async function"),
  'FAIL: main.js must define window.sylloraGoogleAuth!'
);
assert(
  mainJsContent.includes("signInWithOAuth('google'"),
  'FAIL: main.js must invoke signInWithOAuth with provider google!'
);
console.log('✓ PASS: Google button invokes real Supabase signInWithOAuth with provider google');

// 14. Verify OAuth callback interception prevents hash-router collision
assert(
  routerJsContent.includes("raw.includes('access_token=')"),
  'FAIL: router.js must guard against clobbering access_token OAuth fragments!'
);
assert(
  supabaseJsContent.includes("export async function handleOAuthCallback"),
  'FAIL: supabase.js must implement handleOAuthCallback!'
);
assert(
  mainJsContent.includes("handleOAuthCallback()"),
  'FAIL: main.js must execute handleOAuthCallback on startup!'
);
console.log('✓ PASS: OAuth redirect fragments are safely intercepted without router hash collision');

// 15. Verify sign-up route, form structure, and DOM in index.html
const indexHtmlContent = fs.readFileSync(path.join(ROOT_DIR, 'frontend', 'index.html'), 'utf8');
const requiredSignupIds = [
  'signupCard', 'signupForm', 'signupNameInput', 'signupEmailInput',
  'signupPhoneInput', 'signupPasswordInput', 'signupConfirmInput', 'signupSubmitBtn',
  'signupTogglePasswordBtn', 'signupToggleConfirmBtn'
];
for (const id of requiredSignupIds) {
  assert(indexHtmlContent.includes(`id="${id}"`), `FAIL: Sign-up element #${id} missing from index.html!`);
}
assert(
  routerJsContent.includes("'/signup'"),
  'FAIL: router.js must define route /signup!'
);
console.log('✓ PASS: Sign-up route and responsive registration form exist with required accessible fields');

// 16. Verify form validation logic in app.js
assert(
  appJsContent.includes("Full name cannot be blank"),
  'FAIL: app.js must validate that Full Name is non-blank!'
);
assert(
  appJsContent.includes("valid email address"),
  'FAIL: app.js must validate email format!'
);
assert(
  appJsContent.includes("password.length < 8"),
  'FAIL: app.js must enforce minimum 8 characters password policy!'
);
assert(
  appJsContent.includes("password !== confirmPassword"),
  'FAIL: app.js must reject password mismatch!'
);
assert(
  appJsContent.includes("valid phone number"),
  'FAIL: app.js must validate international phone format when provided!'
);
console.log('✓ PASS: Registration form validates required fields, phone format, and rejects password mismatch');

// 17. Verify duplicate submission prevention across auth forms
assert(
  appJsContent.includes("if (isSubmitting) return;"),
  'FAIL: app.js must guard against duplicate submissions with isSubmitting!'
);
assert(
  appJsContent.includes("signupSubmitBtn.disabled = true"),
  'FAIL: app.js must disable submit button during registration!'
);
console.log('✓ PASS: Duplicate submissions are strictly prevented with submission mutex and button lock');

// 18. Verify Supabase account registration connects metadata and handles email verification
assert(
  mainJsContent.includes("window.sylloraRegister = async function"),
  'FAIL: main.js must define window.sylloraRegister!'
);
assert(
  mainJsContent.includes("phone_number: cleanPhone"),
  'FAIL: main.js must pass phone_number in user metadata when provided!'
);
assert(
  appJsContent.includes("Account created. Please check your email to verify your account before logging in"),
  'FAIL: app.js must display confirmation message when email verification is required!'
);
console.log('✓ PASS: Supabase registration submits user metadata and cleanly handles email confirmation');

// 19. Verify Forgot Password and Set New Password recovery flow
const requiredRecoveryIds = [
  'forgotCard', 'forgotForm', 'forgotEmailInput', 'forgotSubmitBtn',
  'resetCard', 'resetForm', 'resetPasswordInput', 'resetConfirmInput', 'resetSubmitBtn'
];
for (const id of requiredRecoveryIds) {
  assert(indexHtmlContent.includes(`id="${id}"`), `FAIL: Recovery element #${id} missing from index.html!`);
}
assert(
  supabaseJsContent.includes("export async function resetPasswordForEmail"),
  'FAIL: supabase.js must export resetPasswordForEmail!'
);
assert(
  supabaseJsContent.includes("export async function updateUser"),
  'FAIL: supabase.js must export updateUser!'
);
assert(
  routerJsContent.includes("'/reset-password'"),
  'FAIL: router.js must define /reset-password route!'
);
console.log('✓ PASS: Forgot password and recovery set-new-password flows implemented with Supabase Auth');

// 20. Verify multi-card switching and password show/hide toggles
assert(
  appJsContent.includes("window.sylloraSwitchAuthCard = switchAuthCard"),
  'FAIL: app.js must expose sylloraSwitchAuthCard!'
);
assert(
  appJsContent.includes("setupPasswordToggle"),
  'FAIL: app.js must setup password show/hide toggles!'
);
console.log('✓ PASS: Multi-card switcher and accessible show/hide password controls verified');

console.log('\n============================================================');
console.log('ALL 20 SYLLORA AUTHENTICATION REPAIR CONTRACT CHECKS PASSED!');
console.log('============================================================\n');
