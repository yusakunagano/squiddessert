import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CommentStore, MAX_TEXT_LENGTH, ValidationError } from './store.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_DIR = join(ROOT, 'public');
const MAX_BODY_BYTES = 16 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export function createApp({ store, config }) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url, store, config);
      } else {
        await serveStatic(req, res, url);
      }
    } catch (err) {
      if (err instanceof ValidationError) {
        sendJson(res, 400, { error: err.message });
      } else {
        console.error(err);
        sendJson(res, 500, { error: 'internal error' });
      }
    }
  });
}

async function handleApi(req, res, url, store, config) {
  const token = req.headers['x-owner-token'] || null;
  const path = url.pathname;

  if (path === '/api/config' && req.method === 'GET') {
    return sendJson(res, 200, {
      mapsApiKey: config.mapsApiKey,
      mapId: config.mapId,
      overlapRadius: store.overlapRadius,
      overlapLimit: store.overlapLimit,
      maxTextLength: MAX_TEXT_LENGTH,
    });
  }

  if (path === '/api/comments' && req.method === 'GET') {
    const p = url.searchParams;
    const keys = ['south', 'west', 'north', 'east'];
    let bounds = null;
    if (keys.every((k) => p.has(k))) {
      bounds = Object.fromEntries(keys.map((k) => [k, Number(p.get(k))]));
      if (Object.values(bounds).some((v) => !Number.isFinite(v))) {
        throw new ValidationError('invalid bounds');
      }
    }
    return sendJson(res, 200, { comments: store.list(bounds, token) });
  }

  if (path === '/api/comments' && req.method === 'POST') {
    const body = await readJson(req);
    return sendJson(res, 201, store.add(body, token));
  }

  const match = path.match(/^\/api\/comments\/([\w-]+)$/);
  if (match && req.method === 'DELETE') {
    const result = store.remove(match[1], token);
    if (result === 'not_found') return sendJson(res, 404, { error: 'not found' });
    if (result === 'forbidden') return sendJson(res, 403, { error: '自分のコメントしか消せません' });
    res.writeHead(204).end();
    return;
  }

  sendJson(res, 404, { error: 'not found' });
}

async function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  const rel = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const file = normalize(join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found');
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new ValidationError('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new ValidationError('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const store = new CommentStore({
    file: process.env.DATA_FILE || join(ROOT, 'data', 'comments.json'),
    overlapRadius: Number(process.env.OVERLAP_RADIUS_M || 30),
    overlapLimit: Number(process.env.OVERLAP_LIMIT || 10),
  });
  const config = {
    mapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
    mapId: process.env.GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
  };
  if (!config.mapsApiKey) {
    console.warn('GOOGLE_MAPS_API_KEY が設定されていません。地図は表示されません。');
  }
  const port = Number(process.env.PORT || 3000);
  createApp({ store, config }).listen(port, () => {
    console.log(`http://localhost:${port}`);
  });
}
