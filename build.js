/**
 * ============================================================================
 * SYLLORA PRODUCTION BUILD SCRIPT
 * ============================================================================
 * Zero-external-dependency reproducible build script for Vercel and production.
 *
 * Enforces:
 * 1. Root .env / deployment platform environment loading (precedence: process.env > root .env)
 * 2. Strict public variable allowlist (NEVER leaks backend secrets)
 * 3. Safe browser runtime config generation in dist/config.js
 * 4. Recursive asset validation and exclusion of private files
 * 5. Post-build secret leakage audit
 */

const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const srcDir = path.join(rootDir, 'frontend');
const distDir = path.join(rootDir, 'dist');
const rootEnvPath = path.join(rootDir, '.env');

console.log('[Syllora Build] Starting production build...');

// 1. Lightweight root .env parser
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const env = {};
    content.split(/\r?\n/).forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const eqIdx = line.indexOf('=');
      if (eqIdx !== -1) {
        const key = line.substring(0, eqIdx).trim();
        let val = line.substring(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        env[key] = val;
      }
    });
    return env;
  } catch (err) {
    console.warn('[Syllora Build] Warning: Failed to parse .env file:', err.message);
    return {};
  }
}

const fileEnv = parseEnvFile(rootEnvPath);

// Value resolution: process.env (platform) > root .env > fallback
function getEnv(key, fallback = '') {
  if (process.env[key] && process.env[key].trim() !== '') {
    return process.env[key].trim();
  }
  if (fileEnv[key] && fileEnv[key].trim() !== '') {
    return fileEnv[key].trim();
  }
  return fallback;
}

// 2. Strict PUBLIC-ONLY Allowlist
const publicApiBase = getEnv('PUBLIC_API_BASE_URL', getEnv('API_BASE_URL', 'http://127.0.0.1:8000'));
const publicSupabaseUrl = getEnv('PUBLIC_SUPABASE_URL', getEnv('SUPABASE_URL', 'https://lgiarosqejiaejizrxdu.supabase.co'));
const publicSupabaseKey = getEnv('PUBLIC_SUPABASE_PUBLISHABLE_KEY', getEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_AasSK22U-NcZhWk4e-7VAA_FFAUyQIU'));
const publicStorageBucket = getEnv('SUPABASE_STORAGE_BUCKET', 'syllora-study-pdfs');

// Validate public URLs
if (!publicSupabaseUrl || !publicSupabaseUrl.startsWith('http')) {
  console.error('[Syllora Build] ❌ Invalid or missing PUBLIC_SUPABASE_URL.');
  process.exit(1);
}

const publicConfig = {
  PUBLIC_API_BASE_URL: publicApiBase,
  PUBLIC_SUPABASE_URL: publicSupabaseUrl,
  PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicSupabaseKey,
  SUPABASE_STORAGE_BUCKET: publicStorageBucket
};

console.log('[Syllora Build] Public runtime configuration resolved:');
console.log(`  - API Base: ${publicConfig.PUBLIC_API_BASE_URL}`);
console.log(`  - Supabase URL: ${publicConfig.PUBLIC_SUPABASE_URL}`);
console.log(`  - Publishable Key: ${publicConfig.PUBLIC_SUPABASE_PUBLISHABLE_KEY ? '(configured)' : '(empty)'}`);

// 3. Clean dist directory
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// 4. Safe recursive copy excluding dotfiles, environment files, and backend data
const EXCLUDED_PATTERNS = [
  /^\.env/i,
  /^\.git/i,
  /\.sqlite/i,
  /\.pyc?$/i,
  /^backend/i
];

function isExcluded(name) {
  return EXCLUDED_PATTERNS.some(re => re.test(name));
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    if (isExcluded(entry.name)) {
      continue;
    }
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDirSync(srcDir, distDir);

// 5. Generate safe public dist/config.js
const configJsContent = `/**
 * Syllora Public Runtime Configuration (Generated at Build Time)
 * DO NOT EDIT DIRECTLY - Injected from deployment environment variables.
 */
window.__SYLLORA_CONFIG__ = Object.freeze(${JSON.stringify(publicConfig, null, 2)});
`;

fs.writeFileSync(path.join(distDir, 'config.js'), configJsContent, 'utf-8');

// 6. Verify required critical build artifacts
const criticalFiles = [
  'index.html',
  'config.js',
  'style.css',
  'workspace.css',
  'app.js',
  'logo.svg',
  'js/main.js',
  'js/state.js',
  'js/session.js',
  'js/router.js',
  'js/storage.js',
  'js/services/supabase.js',
  'js/services/aiApi.js'
];

let missingCount = 0;
for (const file of criticalFiles) {
  const filePath = path.join(distDir, file);
  if (!fs.existsSync(filePath)) {
    console.error(`[Syllora Build] ❌ Missing expected file: ${file}`);
    missingCount++;
  }
}

if (missingCount > 0) {
  console.error(`[Syllora Build] Build failed with ${missingCount} missing files.`);
  process.exit(1);
}

// 7. Security Leak Verification
console.log('[Syllora Build] Running post-build security leak verification...');

// Collect backend secrets from environment/file that must NEVER appear in dist/
const secretCandidates = [
  getEnv('DATABASE_URL'),
  getEnv('DIRECT_URL'),
  getEnv('SUPABASE_SECRET_KEY')
].filter(s => s && s.length >= 10 && !s.includes('YOUR_'));

let secretLeaked = false;

function scanForLeaks(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(distDir, fullPath);

    if (isExcluded(entry.name)) {
      console.error(`[Syllora Build] ❌ CRITICAL SECURITY ERROR: Forbidden file found in dist/: ${relPath}`);
      secretLeaked = true;
    }

    if (entry.isDirectory()) {
      scanForLeaks(fullPath);
    } else {
      // Check content for secret leaks if text file
      const ext = path.extname(entry.name).toLowerCase();
      if (['.html', '.js', '.css', '.json', '.svg', '.txt'].includes(ext)) {
        const fileContent = fs.readFileSync(fullPath, 'utf-8');
        for (const secret of secretCandidates) {
          if (fileContent.includes(secret)) {
            console.error(`[Syllora Build] ❌ CRITICAL SECURITY ERROR: Secret detected in build asset: ${relPath}`);
            secretLeaked = true;
          }
        }
      }
    }
  }
}

scanForLeaks(distDir);

if (secretLeaked) {
  console.error('[Syllora Build] ❌ Build aborted due to security leak detected.');
  process.exit(1);
}

console.log('[Syllora Build] ✅ Build successful! Production output verified and ready in dist/');
