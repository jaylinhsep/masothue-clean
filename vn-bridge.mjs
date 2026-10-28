import express from 'express';
import { MasothueCrawler } from './crawler.mjs';
import { db } from './database.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple .env loader
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  const envContent = fs.readFileSync(envFile, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [k, ...v] = trimmed.split('=');
    if (k && v.length) {
      if (!process.env[k.trim()]) {
        process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
      }
    }
  }
}

const app = express();
const PORT = parseInt(process.env.PORT || '5555', 10);
const BRIDGE_TOKEN = (process.env.VN_BRIDGE_TOKEN || 'mst0-secret-bridge-token').trim();

// Initialize DB (saves directly to Turso Cloud if credentials exist)
db.init().catch(e => console.warn('[DB Init Warning]:', e.message));

const crawler = new MasothueCrawler();

// Security Middleware: Require secret token for all API endpoints
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const token = req.headers['x-bridge-token'] || req.query.token;
  if (!token || token !== BRIDGE_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized: Invalid bridge token' });
  }
  next();
});

// Health check endpoint (for ping and status verification)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    bridge: 'mst0-vn-bridge',
    timestamp: new Date().toISOString(),
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
  });
});

// Real-time On-Demand Search (queries Masothue / Web from domestic VN IP)
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) {
    return res.status(400).json({ success: false, message: 'Missing query parameter q' });
  }

  try {
    console.log(`[VN Bridge] 🔍 Đang tra cứu từ khóa: "${q}"...`);
    const result = await crawler.search(q);
    res.json(result);
  } catch (err) {
    console.error(`[VN Bridge Search Error]:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Real-time On-Demand Detail (crawls full legal rep, phone, tax office from domestic VN IP)
app.get('/api/detail', async (req, res) => {
  const path = (req.query.path || '').trim();
  if (!path) {
    return res.status(400).json({ success: false, message: 'Missing path parameter' });
  }

  try {
    console.log(`[VN Bridge] 📄 Đang tải chi tiết doanh nghiệp: "${path}"...`);
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    const result = await crawler.getDetail(cleanPath, true);
    res.json(result);
  } catch (err) {
    console.error(`[VN Bridge Detail Error]:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`  MST0.COM - VIETNAM PROXY BRIDGE MICROSERVICE`);
  console.log(`  Cổng lắng nghe: http://0.0.0.0:${PORT}`);
  console.log(`  Khóa bảo mật:   ${BRIDGE_TOKEN}`);
  console.log(`  Tài nguyên:     Siêu nhẹ (~30MB RAM, 0% CPU khi rảnh)`);
  console.log(`  An toàn IP:     Tuyệt đối (chỉ chạy khi khách thật tìm)`);
  console.log(`======================================================\n`);
});
