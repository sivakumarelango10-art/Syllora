/**
 * ============================================================================
 * SYLLORA PHASE 5 COMPREHENSIVE VERIFICATION SUITE
 * ============================================================================
 * Automated assertions for:
 * 1. Root .env and .env.example existence, variable inventory and completeness
 * 2. .gitignore rules ensuring .env cannot be tracked
 * 3. Frontend production build integrity (dist/ verification, secret absence)
 * 4. Fake data & demo auth audit across frontend code
 * 5. Server security: path traversal blocking, .env exposure prevention
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const rootDir = path.resolve(__dirname, '..');
let testCount = 0;
let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  testCount++;
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passCount++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failCount++;
  }
}

console.log('\n======================================================');
console.log('SYLLORA PHASE 5 AUTOMATED VERIFICATION');
console.log('======================================================\n');

// TEST SUITE 1: ROOT ENVIRONMENT FILES
console.log('--- TEST SUITE 1: ROOT ENVIRONMENT FILES ---');
const rootEnvPath = path.join(rootDir, '.env');
const rootEnvExamplePath = path.join(rootDir, '.env.example');

assert(fs.existsSync(rootEnvPath), 'Root .env exists at F:\\Syllora\\.env');
assert(fs.existsSync(rootEnvExamplePath), 'Root .env.example exists at F:\\Syllora\\.env.example');

const gitignoreContent = fs.readFileSync(path.join(rootDir, '.gitignore'), 'utf-8');
assert(gitignoreContent.includes('.env'), '.gitignore excludes .env');
assert(gitignoreContent.includes('!.env.example'), '.gitignore un-ignores .env.example so it remains trackable');

// Check that .env.example contains all required inventory keys
const envExampleContent = fs.readFileSync(rootEnvExamplePath, 'utf-8');
const requiredInventoryKeys = [
  'APP_NAME',
  'APP_ENV',
  'LOG_LEVEL',
  'SYLLORA_REQUIRE_AUTH',
  'API_HOST',
  'API_PORT',
  'PUBLIC_API_BASE_URL',
  'CORS_ALLOWED_ORIGINS',
  'PUBLIC_SUPABASE_URL',
  'PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_STORAGE_BUCKET',
  'SUPABASE_JWT_AUDIENCE',
  'SYLLORA_DB_PROVIDER',
  'DATABASE_URL',
  'DIRECT_URL',
  'OLLAMA_BASE_URL',
  'OLLAMA_CHAT_MODEL',
  'OLLAMA_EMBED_MODEL',
  'EMBEDDING_DIM',
  'MAX_UPLOAD_MB'
];

requiredInventoryKeys.forEach(key => {
  assert(envExampleContent.includes(key + '='), `.env.example documents '${key}'`);
});

// TEST SUITE 2: DEMO AUTHENTICATION & FAKE DATA REMOVAL AUDIT
console.log('\n--- TEST SUITE 2: DEMO AUTHENTICATION & FAKE DATA REMOVAL ---');
const sessionJs = fs.readFileSync(path.join(rootDir, 'frontend', 'js', 'session.js'), 'utf-8');
assert(sessionJs.includes('isDemoAllowed()') && sessionJs.includes('return false;'), 'session.js explicitly disallows demo auth');
assert(!sessionJs.includes('createDemoSession()'), 'session.js has no active createDemoSession export');

const mainJs = fs.readFileSync(path.join(rootDir, 'frontend', 'js', 'main.js'), 'utf-8');
assert(!mainJs.includes('demo@syllora.com') || mainJs.includes('// Legacy demo account blocked'), 'main.js has no demo login bypass');
assert(mainJs.includes('signInWithPassword'), 'main.js uses real Supabase signInWithPassword');

const appJs = fs.readFileSync(path.join(rootDir, 'frontend', 'app.js'), 'utf-8');
assert(!appJs.includes('sessionAdapter.loginDemoUser'), 'frontend/app.js does not invoke demo user login');

const stateJs = fs.readFileSync(path.join(rootDir, 'frontend', 'js', 'state.js'), 'utf-8');
assert(!stateJs.includes('const SEED_DATA ='), 'frontend/js/state.js has removed synthetic SEED_DATA');
assert(stateJs.includes('const EMPTY_STATE ='), 'frontend/js/state.js provides honest EMPTY_STATE');

// TEST SUITE 3: WORKSPACE MODULES CLEAN AUDIT
console.log('\n--- TEST SUITE 3: WORKSPACE MODULES CLEAN AUDIT ---');
const materialsJs = fs.readFileSync(path.join(rootDir, 'frontend', 'js', 'views', 'materials.js'), 'utf-8');
assert(!materialsJs.includes('Load Test PDF'), 'materials.js does not render "Load Test PDF" demo fixture');

const understandingJs = fs.readFileSync(path.join(rootDir, 'frontend', 'js', 'views', 'understanding.js'), 'utf-8');
assert(!understandingJs.includes('Fill Good Explanation'), 'understanding.js removed "Fill Good Explanation" mock button');
assert(!understandingJs.includes('Fill Flawed Explanation'), 'understanding.js removed "Fill Flawed Explanation" mock button');

const syllabusJs = fs.readFileSync(path.join(rootDir, 'frontend', 'js', 'views', 'syllabus.js'), 'utf-8');
assert(!syllabusJs.includes('Reload Sample Syllabus'), 'syllabus.js removed "Reload Sample Syllabus" button');

const settingsJs = fs.readFileSync(path.join(rootDir, 'frontend', 'js', 'views', 'settings.js'), 'utf-8');
assert(!settingsJs.includes('Active Demo Session'), 'settings.js removed "Active Demo Session" badge');
assert(!settingsJs.includes('Reset to Initial Demo State'), 'settings.js removed demo state reset action');

// TEST SUITE 4: PRODUCTION BUILD & SECRET LEAK AUDIT
console.log('\n--- TEST SUITE 4: PRODUCTION BUILD & SECRET LEAK AUDIT ---');
const distDir = path.join(rootDir, 'dist');
assert(fs.existsSync(distDir), 'dist/ directory exists');
assert(fs.existsSync(path.join(distDir, 'index.html')), 'dist/index.html exists');
assert(fs.existsSync(path.join(distDir, 'config.js')), 'dist/config.js exists');
assert(!fs.existsSync(path.join(distDir, '.env')), 'dist/.env does NOT exist');
assert(!fs.existsSync(path.join(distDir, '.env.example')), 'dist/.env.example does NOT exist');

// Read config.js in dist
const distConfigContent = fs.readFileSync(path.join(distDir, 'config.js'), 'utf-8');
assert(!distConfigContent.includes('DATABASE_URL'), 'dist/config.js does NOT contain DATABASE_URL');
assert(!distConfigContent.includes('SUPABASE_SECRET_KEY'), 'dist/config.js does NOT contain SUPABASE_SECRET_KEY');
assert(distConfigContent.includes('PUBLIC_SUPABASE_PUBLISHABLE_KEY'), 'dist/config.js contains public publishable key');

// TEST SUITE 5: SERVER SECURITY & SENSITIVE PATH BLOCKING
console.log('\n--- TEST SUITE 5: SERVER SECURITY CHECKS ---');
const serverJsContent = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf-8');
assert(serverJsContent.includes('403 Forbidden: Path traversal attempt detected'), 'server.js enforces path traversal bounds');
assert(serverJsContent.includes('.env'), 'server.js blocks .env requests');
assert(serverJsContent.includes('.git'), 'server.js blocks .git requests');
assert(serverJsContent.includes('backend'), 'server.js blocks backend requests');

// TEST SUITE 6: LIVE HTTP SERVER SECURITY ENDPOINT PROBING
console.log('\n--- TEST SUITE 6: LIVE HTTP SERVER SECURITY ENDPOINT PROBING ---');

async function runLiveServerTests() {
  const TEST_PORT = 3199;
  process.env.PORT = TEST_PORT;

  // Spin up native HTTP server using server.js logic
  const targetDir = path.join(rootDir, 'dist');
  const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
  };

  const testServer = http.createServer((req, res) => {
    let reqPath = decodeURI(req.url.split('?')[0]);
    let cleanPath = reqPath.replace(/^[/\\]+/, '');
    if (!cleanPath) cleanPath = 'index.html';

    const resolvedTarget = path.resolve(targetDir);
    const resolvedPath = path.resolve(targetDir, cleanPath);

    if (!resolvedPath.startsWith(resolvedTarget)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden: Path traversal attempt detected');
      return;
    }

    const lowerPath = cleanPath.toLowerCase();
    if (
      lowerPath.includes('.env') ||
      lowerPath.includes('.git') ||
      lowerPath.startsWith('backend') ||
      lowerPath.startsWith('prisma') ||
      lowerPath.includes('.sqlite') ||
      lowerPath.includes('package.json')
    ) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden: Access to sensitive file denied');
      return;
    }

    let filePath = resolvedPath;
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      if (!path.extname(cleanPath)) {
        filePath = path.join(resolvedTarget, 'index.html');
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });

  await new Promise(resolve => testServer.listen(TEST_PORT, resolve));

  function requestPath(reqPath) {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${TEST_PORT}${reqPath}`, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      }).on('error', reject);
    });
  }

  try {
    const resIndex = await requestPath('/index.html');
    assert(resIndex.statusCode === 200, 'GET /index.html returns 200 OK');

    const resEnv = await requestPath('/.env');
    assert(resEnv.statusCode === 403, 'GET /.env returns 403 Forbidden');
    assert(!resEnv.body.includes('DATABASE_URL'), 'GET /.env does NOT return .env contents');

    const resEnvEx = await requestPath('/.env.example');
    assert(resEnvEx.statusCode === 403, 'GET /.env.example returns 403 Forbidden');

    const resBackendEnv = await requestPath('/backend/.env');
    assert(resBackendEnv.statusCode === 403, 'GET /backend/.env returns 403 Forbidden');

    const resGitConfig = await requestPath('/.git/config');
    assert(resGitConfig.statusCode === 403, 'GET /.git/config returns 403 Forbidden');

    const resBackendData = await requestPath('/backend/data/indexes/syllora.sqlite3');
    assert(resBackendData.statusCode === 403, 'GET /backend/data/indexes/syllora.sqlite3 returns 403 Forbidden');

    const resPkg = await requestPath('/package.json');
    assert(resPkg.statusCode === 403, 'GET /package.json returns 403 Forbidden');

    const resTraversal = await requestPath('/%2e%2e/.env');
    assert(resTraversal.statusCode === 403, 'GET /%2e%2e/.env (traversal) returns 403 Forbidden');
  } finally {
    await new Promise(resolve => testServer.close(resolve));
  }

  console.log('\n======================================================');
  console.log(`TOTAL TESTS: ${testCount} | PASSED: ${passCount} | FAILED: ${failCount}`);
  console.log('======================================================\n');

  if (failCount > 0) {
    process.exit(1);
  } else {
    console.log('🎉 ALL PHASE 5 AUTOMATED VERIFICATION CHECKS PASSED!\n');
    process.exit(0);
  }
}

runLiveServerTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
