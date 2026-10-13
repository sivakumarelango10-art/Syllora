/**
 * ============================================================================
 * SYLLORA PRODUCTION BUILD SCRIPT
 * ============================================================================
 * Zero-external-dependency reproducible build script for Vercel and production.
 * Copies the complete frontend application into dist/ with asset validation.
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'frontend');
const distDir = path.join(__dirname, 'dist');

console.log('[Syllora Build] Starting production build...');

// Clean dist directory
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// Copy directory recursively
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
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

// Verify required build artifacts
const criticalFiles = [
  'index.html',
  'style.css',
  'workspace.css',
  'app.js',
  'logo.svg',
  'js/main.js',
  'js/state.js',
  'js/session.js',
  'js/router.js',
  'assets/docs/Silberschatz_OS_Deadlocks_Ch8.pdf',
  'assets/docs/Tanenbaum_MOS_Deadlocks_Excerpt.pdf',
  'assets/docs/Lecture_Slides_Week6_Concurrency.pdf',
  'assets/docs/Silberschatz_OS_Deadlocks_Ch8_v2.pdf'
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

console.log('[Syllora Build] ✅ Build successful! Production output ready in dist/');
