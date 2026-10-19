import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { MasothueCrawler } from './crawler.mjs';
import { db } from './database.mjs';
import { seoRenderer } from './seoRenderer.mjs';

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
      process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
    }
  }
}

const app = express();
const crawler = new MasothueCrawler();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { etag: false, maxAge: 0 }));

// Initialize Database (Turso Cloud 5GB or Local SQLite)
await db.init();

// Preload seed companies if DB is fresh
const currentStats = await db.getStats();
if (currentStats.total === 0) {
  console.log('[SEO] Cơ sở dữ liệu đang trống, bắt đầu nạp sẵn các tập đoàn lớn...');
  const seedTaxIds = ['0100109106', '0101248141', '0300588569', '0101245486'];
  for (const tid of seedTaxIds) {
    try {
      const searchRes = await crawler.search(tid);
      if (searchRes.isDirect && searchRes.detail) {
        await db.saveCompany(searchRes.detail);
        console.log(`[SEO] Đã nạp sẵn: ${searchRes.detail.name} (MST: ${tid})`);
      }
    } catch (e) {
      console.warn(`[SEO] Không thể nạp ${tid}:`, e.message);
    }
  }
}

// ==========================================
// SEO ROUTES (Cho Googlebot và người dùng)
// ==========================================

// 1. Robots.txt
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(seoRenderer.renderRobotsTxt(req.headers.host));
});

// 2. Dynamic XML Sitemap
app.get('/sitemap.xml', async (req, res) => {
  const slugs = await db.getAllSlugs();
  res.type('application/xml');
  res.send(seoRenderer.renderSitemap(slugs, req.headers.host));
});

// 3. SEO Static URL Page: /mst/:slug
app.get('/mst/:slug', async (req, res) => {
  const { slug } = req.params;
  if (!slug) return res.redirect('/');

  try {
    // 1. Check if company already in Database
    let company = (await db.getCompanyBySlug(slug)) || (await db.getCompanyByTaxId(slug));

    // 2. If not in DB, crawl on demand and save to DB
    if (!company) {
      if (/^\d{10}(-\d{3})?$/.test(slug)) {
        const sRes = await crawler.search(slug);
        if (sRes.isDirect && sRes.detail) {
          await db.saveCompany(sRes.detail);
          company = await db.getCompanyByTaxId(slug);
        }
      } else {
        const dRes = await crawler.getDetail(slug);
        if (dRes.success && dRes.data) {
          await db.saveCompany(dRes.data);
          company = (await db.getCompanyBySlug(slug)) || (await db.getCompanyByTaxId(dRes.data.taxId));
        }
      }
    }

    if (!company) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="vi">
        <head>
          <meta charset="UTF-8"><title>Không tìm thấy doanh nghiệp</title>
          <link rel="stylesheet" href="/style.css?v=2">
        </head>
        <body style="text-align: center; padding: 60px 20px;">
          <h2>Không tìm thấy thông tin doanh nghiệp này</h2>
          <p style="color: #64748b; margin: 12px 0 24px;">Doanh nghiệp có thể chưa đăng ký hoặc mã số thuế không chính xác.</p>
          <a href="/" class="btn-primary" style="display: inline-block; text-decoration: none;">Về trang chủ tra cứu</a>
        </body>
        </html>
      `);
    }

    // 3. Find related companies under the same representative
    const related = await db.getRelatedCompaniesByRepresentative(company.representative, company.taxId);

    // 4. Render Server-Side HTML with Schema.org JSON-LD
    const html = seoRenderer.renderCompanyPage(company, related, req.headers.host);
    res.send(html);
  } catch (err) {
    console.error(`[SEO Route Error] /mst/${slug}:`, err);
    res.status(500).send('Lỗi máy chủ khi tải trang.');
  }
});

// ==========================================
// API ROUTES
// ==========================================

// API: Search
app.get('/api/search', async (req, res) => {
  const { q, type = 'auto', page = 1 } = req.query;
  if (!q) {
    return res.status(400).json({ success: false, message: 'Thiếu từ khóa tìm kiếm (q).' });
  }

  try {
    const result = await crawler.search(q, type, parseInt(page, 10) || 1);
    
    // If direct detail was fetched, save to database
    if (result.isDirect && result.detail) {
      await db.saveCompany(result.detail);
    }

    res.json(result);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tra cứu: ' + err.message });
  }
});

// API: Detail
app.get('/api/detail', async (req, res) => {
  const { path: companyPath } = req.query;
  if (!companyPath) {
    return res.status(400).json({ success: false, message: 'Thiếu đường dẫn doanh nghiệp (path).' });
  }

  try {
    // Check DB first
    const fromDb = (await db.getCompanyBySlug(companyPath)) || (await db.getCompanyByTaxId(companyPath));
    if (fromDb && fromDb.data) {
      return res.json({ success: true, data: fromDb.data, fromDb: true });
    }

    // Not in DB -> Crawl & Save
    const result = await crawler.getDetail(companyPath);
    if (result.success && result.data) {
      await db.saveCompany(result.data);
    }
    res.json(result);
  } catch (err) {
    console.error('Detail error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy chi tiết: ' + err.message });
  }
});

// API: Debug Crawler connection
app.get('/api/debug-crawler', async (req, res) => {
  const diag = {};
  try {
    const { gotScraping } = await import('got-scraping');
    
    // Test Token
    try {
      const tokenRes = await gotScraping.post('https://masothue.com/Ajax/Token', {
        headers: {
          'referer': 'https://masothue.com/',
          'origin': 'https://masothue.com',
          'x-requested-with': 'XMLHttpRequest',
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body: 'r=123456',
        throwHttpErrors: false
      });
      diag.tokenStatusCode = tokenRes.statusCode;
      diag.tokenBodyPreview = tokenRes.body.slice(0, 300);
      diag.tokenHeaders = tokenRes.headers;
    } catch (eToken) {
      diag.tokenError = eToken.message;
    }

    // Test Search
    const searchResult = await crawler.search('vượng phát');
    diag.searchResult = searchResult;

    res.json(diag);
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// API: Recent Companies (For Homepage Freshness)
app.get('/api/recent', async (req, res) => {
  const recent = await db.getRecentCompanies(15);
  res.json({ success: true, items: recent });
});

// API: System stats
app.get('/api/stats', async (req, res) => {
  const stats = await db.getStats();
  res.json({ success: true, ...stats, uptime: process.uptime() });
});

// API: Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Fallback to index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server on available port
let port = parseInt(process.env.PORT, 10) || 3000;

function startServer(p) {
  const server = app.listen(p, () => {
    console.log(`\n======================================================`);
    console.log(`  Ứng dụng Tra Cứu Mã Số Thuế Chuẩn SEO (Zero-Ads)`);
    console.log(`  Chế độ Database: ${db.isTurso ? '☁️ Turso Cloud (5GB Miễn Phí)' : '💻 SQLite Cục Bộ'}`);
    console.log(`  Trang chủ:      http://localhost:${p}`);
    console.log(`  Sitemap XML:    http://localhost:${p}/sitemap.xml`);
    console.log(`  Robots.txt:     http://localhost:${p}/robots.txt`);
    console.log(`======================================================\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Cổng ${p} đã bận, thử cổng ${p + 1}...`);
      startServer(p + 1);
    } else {
      console.error('Lỗi khởi động server:', err);
    }
  });
}

startServer(port);
