import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const root = process.cwd();
const port = Number(process.env.PORT || 3000);

// Load .env.local
const envPath = join(root, '.env.local');
const env = {};
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  });
}
const envScript = `<script>window.__ENV__=${JSON.stringify(env)};</script>`;
const maxPortAttempts = 20;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png'
};

function createAppServer(currentPort) {
  return createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${currentPort}`);
    const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const filePath = normalize(join(root, pathname));

    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    try {
      let body = await readFile(filePath);
      const ct = types[extname(filePath)] || 'application/octet-stream';
      if (ct === types['.html']) {
        body = Buffer.from(body.toString().replace('</head>', envScript + '</head>'));
      }
      res.writeHead(200, {
        'Content-Type': ct,
        'Cache-Control': pathname === '/sw.js' ? 'no-store' : 'no-cache'
      });
      res.end(body);
    } catch {
      let fallback = (await readFile(join(root, 'index.html'))).toString();
      fallback = fallback.replace('</head>', envScript + '</head>');
      res.writeHead(200, {'Content-Type': types['.html']});
      res.end(fallback);
    }
  });
}

function listen(currentPort, attemptsLeft = maxPortAttempts) {
  const server = createAppServer(currentPort);

  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
      const nextPort = currentPort + 1;
      console.log(`Port ${currentPort} already in use, trying ${nextPort}...`);
      listen(nextPort, attemptsLeft - 1);
      return;
    }

    throw error;
  });

  server.listen(currentPort, () => {
    console.log(`Mes Finances: http://localhost:${currentPort}`);
  });
}

listen(port);
