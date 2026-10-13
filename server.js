/**
 * ============================================================================
 * SYLLORA LOCAL DEV & PREVIEW SERVER
 * ============================================================================
 * Hardened lightweight HTTP server for local serving and verification.
 * Enforces strict path isolation, forbidden file blocking, and anti-leak guards.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const targetDir = fs.existsSync(path.join(__dirname, 'dist')) 
  ? path.join(__dirname, 'dist') 
  : path.join(__dirname, 'frontend');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg'
};

const server = http.createServer((req, res) => {
  // Normalize and decode URI path
  let reqPath = decodeURI(req.url.split('?')[0]);
  let cleanPath = reqPath.replace(/^[/\\]+/, '');
  if (!cleanPath) cleanPath = 'index.html';

  const resolvedTarget = path.resolve(targetDir);
  const resolvedPath = path.resolve(targetDir, cleanPath);

  // 1. Path traversal guard: must strictly stay within targetDir
  if (!resolvedPath.startsWith(resolvedTarget)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden: Path traversal attempt detected');
    return;
  }

  // 2. Sensitive file blocklist: NEVER serve .env, .git, backend, sqlite, package.json
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

  // 3. Fallback for SPA routing if file not found
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
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Server Error: ${err.code}`);
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN'
    });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`[Syllora Server] Serving ${targetDir} on http://localhost:${PORT}`);
});
