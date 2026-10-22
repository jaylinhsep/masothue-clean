import express from 'express';
import path from 'path';
import fs from 'fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'url';
import { gotScraping } from 'got-scraping';
import { MasothueCrawler } from './crawler.mjs';
import { db, VIETNAM_PROVINCES, TOP_INDUSTRIES } from './database.mjs';
import { seoRenderer } from './seoRenderer.mjs';
import { indexNowService } from './indexnow.mjs';

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

// --- IN-MEMORY CACHE FOR ULTRA-FAST SSR (<5ms) ---
const pageCache = new Map();
const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCachedPage(key) {
  const item = pageCache.get(key);
  if (!item) return null;
  if (Date.now() - item.time > item.ttl) {
    pageCache.delete(key);
    return null;
  }
  return item.html;
}

function setCachedPage(key, html, ttl = DEFAULT_TTL_MS) {
  if (pageCache.size > 3000) {
    const oldestKey = pageCache.keys().next().value;
    pageCache.delete(oldestKey);
  }
  pageCache.set(key, { html, time: Date.now(), ttl });
}

// Fast Native Gzip Compression Middleware (reduces payload by 80%)
app.use((req, res, next) => {
  const acceptEncoding = req.headers['accept-encoding'] || '';
  if (!acceptEncoding.includes('gzip')) return next();

  const originalSend = res.send;
  res.send = function (body) {
    if (typeof body === 'string' && body.length > 1024) {
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
      }
      try {
        const compressed = zlib.gzipSync(Buffer.from(body, 'utf-8'));
        return res.end(compressed);
      } catch (e) {
        return originalSend.apply(this, arguments);
      }
    }
    return originalSend.apply(this, arguments);
  };
  next();
});

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

// ==========================================
// 2B. SEO SILO & HUB DIRECTORY ROUTES
// ==========================================

// Hub 1: Danh bạ 34 Tỉnh Thành Mới (Nghị quyết 202/2025/QH15)
app.get('/tinh-thanh', async (req, res) => {
  try {
    const cacheKey = 'hub:provinces:index';
    const cached = getCachedPage(cacheKey);
    if (cached) return res.send(cached);

    const stats = await db.getProvinceStats();
    const html = seoRenderer.renderProvincesIndexPage(stats, req.headers.host);
    setCachedPage(cacheKey, html, 30 * 60 * 1000); // 30 mins
    res.send(html);
  } catch (err) {
    console.error('[Hub Provinces Error]:', err);
    res.status(500).send('Lỗi máy chủ khi tải danh bạ tỉnh thành.');
  }
});

// Hub 1b: Chi tiết Tỉnh Thành
app.get('/tinh-thanh/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    let prov = VIETNAM_PROVINCES.find(p => p.slug === slug);
    if (!prov) {
      // Check if it's an old merged province slug -> 301 redirect to new unit
      const mergedProv = VIETNAM_PROVINCES.find(p => p.oldSlugs && p.oldSlugs.includes(slug));
      if (mergedProv) {
        return res.redirect(301, `/tinh-thanh/${mergedProv.slug}`);
      }
      return res.redirect('/tinh-thanh');
    }

    const page = parseInt(req.query.page, 10) || 1;
    const cacheKey = `hub:province:${slug}:${page}`;
    const cached = getCachedPage(cacheKey);
    if (cached) return res.send(cached);

    const data = await db.getCompaniesByProvincePaginated(prov.name, page, 24);
    const html = seoRenderer.renderProvinceDetailPage(prov, data, req.headers.host);
    setCachedPage(cacheKey, html, 10 * 60 * 1000); // 10 mins
    res.send(html);
  } catch (err) {
    console.error('[Hub Province Detail Error]:', err);
    res.status(500).send('Lỗi máy chủ khi tải danh bạ tỉnh thành.');
  }
});

// Hub 2: Danh bạ Ngành Nghề
app.get('/nganh-nghe', async (req, res) => {
  try {
    const cacheKey = 'hub:industries:index';
    const cached = getCachedPage(cacheKey);
    if (cached) return res.send(cached);

    const stats = await db.getTopIndustriesWithCounts();
    const html = seoRenderer.renderIndustriesIndexPage(stats, req.headers.host);
    setCachedPage(cacheKey, html, 30 * 60 * 1000); // 30 mins
    res.send(html);
  } catch (err) {
    console.error('[Hub Industries Error]:', err);
    res.status(500).send('Lỗi máy chủ khi tải danh bạ ngành nghề.');
  }
});

// Hub 2b: Chi tiết Ngành Nghề
app.get('/nganh-nghe/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    let ind = TOP_INDUSTRIES.find(i => i.slug === slug || i.code === slug);
    if (!ind) {
      const codeMatch = slug.match(/^(\d{4})/);
      if (codeMatch) {
        ind = { code: codeMatch[1], name: `Ngành nghề mã ${codeMatch[1]}`, slug };
      } else {
        ind = { code: slug, name: `Ngành ${slug}`, slug };
      }
    }

    const page = parseInt(req.query.page, 10) || 1;
    const cacheKey = `hub:industry:${ind.code}:${page}`;
    const cached = getCachedPage(cacheKey);
    if (cached) return res.send(cached);

    const data = await db.getCompaniesByIndustryPaginated(ind.code, page, 24);
    const html = seoRenderer.renderIndustryDetailPage(ind, data, req.headers.host);
    setCachedPage(cacheKey, html, 10 * 60 * 1000); // 10 mins
    res.send(html);
  } catch (err) {
    console.error('[Hub Industry Detail Error]:', err);
    res.status(500).send('Lỗi máy chủ khi tải ngành nghề.');
  }
});

// Hub 3: Doanh nghiệp Mới Thành Lập / Cập Nhật Gần Đây
app.get('/doanh-nghiep-moi', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const cacheKey = `hub:recent:page:${page}`;
    const cached = getCachedPage(cacheKey);
    if (cached) return res.send(cached);

    const data = await db.getRecentCompaniesPaginated(page, 24);
    const html = seoRenderer.renderRecentCompaniesPage(data, req.headers.host);
    setCachedPage(cacheKey, html, 2 * 60 * 1000); // 2 mins cache
    res.send(html);
  } catch (err) {
    console.error('[Hub Recent Error]:', err);
    res.status(500).send('Lỗi máy chủ khi tải doanh nghiệp mới.');
  }
});

// Helper: Render company page by slug or taxId
async function handleCompanyPage(req, res, slug) {
  if (!slug) return res.redirect('/');
  const cleanSlug = slug.replace(/^\/?(mst\/)?/, '');

  // 0. Ultra-fast Memory Cache hit (<1ms)
  const cacheKey = `company:${cleanSlug}`;
  const cachedHtml = getCachedPage(cacheKey);
  if (cachedHtml) {
    return res.send(cachedHtml);
  }

  try {
    // 1. Check if company already in Database
    let company = (await db.getCompanyBySlug(cleanSlug)) || (await db.getCompanyByTaxId(cleanSlug));

    // 2. If not in DB, crawl on demand and save to DB
    if (!company) {
      if (/^\d{10}(-\d{3})?$/.test(cleanSlug)) {
        const sRes = await crawler.search(cleanSlug);
        if (sRes.isDirect && sRes.detail) {
          await db.saveCompany(sRes.detail);
          company = await db.getCompanyByTaxId(cleanSlug);
        }
      } else {
        const dRes = await crawler.getDetail('/' + cleanSlug, true);
        if (dRes.success && dRes.data) {
          await db.saveCompany(dRes.data);
          company = (await db.getCompanyBySlug(cleanSlug)) || (await db.getCompanyByTaxId(dRes.data.taxId));
        }
      }
    }

    // 2b. Auto-enrich in background (NON-BLOCKING) so user request is served immediately!
    if (company && company.data && (!company.representative || !company.data.representative || !company.data.managedBy || company.data.managedBy === 'Cơ quan Thuế')) {
      setImmediate(() => {
        crawler.getDetail('/' + (company.slug || cleanSlug), true)
          .then(dRes => {
            if (dRes.success && dRes.data && (dRes.data.representative || dRes.data.managedBy)) {
              db.saveCompany(dRes.data).then(() => {
                pageCache.delete(cacheKey);
              }).catch(() => {});
            }
          })
          .catch(() => {});
      });
    }

    if (!company) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="vi">
        <head>
          <meta charset="UTF-8"><title>Không tìm thấy doanh nghiệp</title>
          <link rel="stylesheet" href="/style.css?v=10">
        </head>
        <body style="text-align: center; padding: 60px 20px; font-family: sans-serif;">
          <h2>Không tìm thấy thông tin doanh nghiệp này</h2>
          <p style="color: #64748b; margin: 12px 0 24px;">Doanh nghiệp có thể chưa đăng ký hoặc mã số thuế không chính xác.</p>
          <a href="/" class="btn-primary" style="display: inline-block; text-decoration: none; padding: 10px 20px; background: #2563eb; color: #fff; border-radius: 6px;">Về trang chủ tra cứu</a>
        </body>
        </html>
      `);
    }

    // 3. Find related companies under representative, province, and industry
    const [relatedRep, relatedProvince, relatedIndustry] = await Promise.all([
      db.getRelatedCompaniesByRepresentative(company.representative, company.taxId),
      db.getRelatedCompaniesByProvince(company.province || (company.data && company.data.province), company.taxId, 6),
      db.getRelatedCompaniesByIndustry(company.mainIndustry || (company.data && company.data.mainIndustry), company.taxId, 6)
    ]);

    // 4. Render Server-Side HTML with Schema.org JSON-LD (Corporation + Breadcrumb + FAQPage)
    const html = seoRenderer.renderCompanyPage(company, {
      byRepresentative: relatedRep,
      byProvince: relatedProvince,
      byIndustry: relatedIndustry
    }, req.headers.host);

    // Cache the rendered page only if complete, or 30s if missing representative
    if (company.representative && company.representative.trim().length > 1) {
      setCachedPage(cacheKey, html, 10 * 60 * 1000);
    } else {
      setCachedPage(cacheKey, html, 30 * 1000);
    }

    res.send(html);
  } catch (err) {
    console.error(`[SEO Route Error] ${slug}:`, err);
    res.status(500).send('Lỗi máy chủ khi tải trang.');
  }
}

// 3. SEO Static URL Page: /mst/:slug
app.get('/mst/:slug', async (req, res) => {
  return handleCompanyPage(req, res, req.params.slug);
});

// 3b. SEO Clean Root Slug Page: /0101245486-tap-doan-vingroup... or /1801818511-001-...
app.get(/^\/(\d{10}.*)/, async (req, res) => {
  return handleCompanyPage(req, res, req.params[0]);
});

// 3c. Dynamic OpenGraph Social Preview Card (SVG)
app.get('/api/og/:taxId', async (req, res) => {
  try {
    const rawId = (req.params.taxId || '').replace(/\.svg$/i, '');
    let company = await db.getCompanyByTaxId(rawId);
    if (!company) {
      company = await db.getCompanyBySlug(rawId);
    }

    const d = company ? (company.data || company) : {
      name: 'Tra Cứu Mã Số Thuế Doanh Nghiệp Toàn Quốc',
      taxId: rawId,
      status: 'Đang hoạt động',
      representative: 'Tổng cục Thuế',
      province: 'Việt Nam'
    };

    const escapeXml = (str) => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };

    const taxId = escapeXml(d.taxId || rawId);
    const rawName = d.name || 'Công ty Doanh nghiệp';
    const truncatedName = escapeXml(rawName.length > 55 ? rawName.slice(0, 52) + '...' : rawName);
    const statusText = escapeXml(d.status || 'Đang hoạt động');
    const representative = escapeXml(d.representative || 'Chưa cập nhật');
    const province = escapeXml(d.province || 'Toàn Quốc');

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b1329" />
      <stop offset="100%" stop-color="#1e293b" />
    </linearGradient>
    <linearGradient id="primaryGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>
  
  <!-- Accent Line -->
  <rect x="0" y="0" width="1200" height="8" fill="url(#primaryGrad)"/>

  <!-- Brand pill -->
  <rect x="80" y="65" width="230" height="42" rx="21" fill="rgba(37,99,235,0.2)" stroke="#3b82f6" stroke-width="1.5"/>
  <text x="195" y="92" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="700" fill="#60a5fa" text-anchor="middle">MST0.COM • TRA CỨU MST</text>

  <!-- Tax ID Highlight -->
  <text x="80" y="175" font-family="monospace, monospace" font-size="24" font-weight="600" fill="#94a3b8">MÃ SỐ THUẾ DOANH NGHIỆP</text>
  <text x="80" y="245" font-family="monospace, monospace" font-size="56" font-weight="800" fill="#38bdf8">${taxId}</text>

  <!-- Company Name -->
  <text x="80" y="330" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="36" font-weight="800" fill="#ffffff">${truncatedName}</text>

  <!-- Status & Representative -->
  <rect x="80" y="380" width="170" height="38" rx="8" fill="rgba(34,197,94,0.15)" stroke="#22c55e" stroke-width="1"/>
  <text x="165" y="405" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="600" fill="#4ade80" text-anchor="middle">● ${statusText}</text>

  <text x="275" y="406" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="600" fill="#cbd5e1">Đại diện: ${representative}</text>

  <!-- Province / Location -->
  <text x="80" y="465" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="500" fill="#94a3b8">📍 Khu vực: ${province}</text>

  <!-- Footer Tagline -->
  <line x1="80" y1="520" x2="1120" y2="520" stroke="#334155" stroke-width="1"/>
  <text x="80" y="565" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="17" font-weight="500" fill="#64748b">Cổng Thông Tin Doanh Nghiệp Việt Nam • Chuẩn Tổng cục Thuế • Không quảng cáo</text>
  <text x="1120" y="565" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="700" fill="#38bdf8" text-anchor="end">mst0.com</text>
</svg>`;

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    res.send(svg);
  } catch (err) {
    res.status(500).send('Error generating OG image');
  }
});

// ==========================================
// INDEXNOW PROTOCOL (Instant Search Engine Indexing)
// ==========================================

// Key file verification endpoint (e.g. /4d8b671a53e944f2b988f01b7a2d3e5a.txt)
app.get(/^\/([a-f0-9]{32})\.txt$/, (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(req.params[0]);
});

// IndexNow Status & Monitoring
app.get('/api/indexnow/status', (req, res) => {
  res.json(indexNowService.getStatus());
});

// Trigger Instant Submission of Top N Recent Companies
app.all('/api/indexnow/submit-recent', async (req, res) => {
  const limit = Math.min(100, Math.max(5, parseInt(req.query.limit, 10) || 50));
  const result = await indexNowService.submitRecentFromDb(db, limit);
  res.json(result);
});

// Ping Google & Bing Sitemaps
app.all('/api/indexnow/ping-sitemaps', async (req, res) => {
  const result = await indexNowService.pingSitemaps();
  res.json({ success: true, result });
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
    // 1. Check DB first
    const fromDb = (await db.getCompanyBySlug(companyPath)) || (await db.getCompanyByTaxId(companyPath));
    if (fromDb && fromDb.data) {
      // If it already has rich data, serve instantly!
      if (fromDb.representative || fromDb.data.representative || fromDb.data.phone || (fromDb.data.managedBy && fromDb.data.managedBy !== 'Cơ quan Thuế')) {
        return res.json({ success: true, data: fromDb.data, fromDb: true });
      }
    }

    // 2. Not in DB or incomplete in DB -> Crawl on demand with forceFresh = true
    const cleanPath = companyPath.replace(/^\/?(mst\/)?/, '');
    const result = await crawler.getDetail('/' + cleanPath, true);
    if (result.success && result.data) {
      await db.saveCompany(result.data);
      return res.json(result);
    }

    // Fallback to whatever was in DB if crawling fails
    if (fromDb && fromDb.data) {
      return res.json({ success: true, data: fromDb.data, fromDb: true });
    }

    res.json(result);
  } catch (err) {
    console.error('Detail error:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy chi tiết: ' + err.message });
  }
});

// API: Debug Raw Google CSE
app.get('/api/debug-google', async (req, res) => {
  try {
    const apiKey = (process.env.GOOGLE_SEARCH_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_KEY || '').trim();
    const cx = (process.env.GOOGLE_SEARCH_CX || process.env.GOOGLE_CX || process.env.SEARCH_ENGINE_ID || process.env.GOOGLE_SEARCH_ENGINE_ID || '').trim();
    const q = req.query.q || 'thái anh';

    if (!apiKey || !cx) {
      return res.json({ error: 'Missing apiKey or cx', hasKey: Boolean(apiKey), hasCx: Boolean(cx) });
    }

    const searchUrl = new URL('https://www.googleapis.com/customsearch/v1');
    searchUrl.searchParams.set('key', apiKey);
    searchUrl.searchParams.set('cx', cx);
    searchUrl.searchParams.set('q', q);
    searchUrl.searchParams.set('num', '10');

    const response = await fetch(searchUrl.toString(), {
      headers: { 'Accept': 'application/json' }
    });

    const status = response.status;
    const body = await response.json();
    res.json({ status, query: q, totalResults: body.searchInformation?.totalResults, itemsCount: body.items?.length || 0, error: body.error, raw: body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Debug Crawler connection
app.get('/api/debug-crawler', async (req, res) => {
  const diag = {};
  try {
    const apiKey = (process.env.GOOGLE_SEARCH_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_KEY || '').trim();
    const cx = (process.env.GOOGLE_SEARCH_CX || process.env.GOOGLE_CX || process.env.SEARCH_ENGINE_ID || process.env.GOOGLE_SEARCH_ENGINE_ID || '').trim();

    const serperKey = (process.env.SERPER_API_KEY || process.env.SERPER_KEY || '').trim();
    diag.hasSerperKey = Boolean(serperKey);
    diag.serperKeyPrefix = serperKey ? serperKey.slice(0, 6) + '...' : null;

    diag.hasGoogleKey = Boolean(apiKey);
    diag.hasGoogleCx = Boolean(cx);
    diag.keyPrefix = apiKey ? apiKey.slice(0, 6) + '...' : null;
    diag.cxPreview = cx ? cx.slice(0, 8) + '...' : null;

    const braveKey = (process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY || '').trim();
    const tavilyKey = (process.env.TAVILY_API_KEY || '').trim();
    diag.hasBraveKey = Boolean(braveKey);
    diag.hasTavilyKey = Boolean(tavilyKey);

    // List all non-sensitive environment variable names to diagnose configuration
    diag.envKeyNames = Object.keys(process.env).filter(k => 
      !k.startsWith('npm_') && !k.startsWith('PATH') && !k.startsWith('LS_') && !k.startsWith('NODE_')
    );

    const testQ = req.query.q || 'thái anh';
    diag.testQuery = testQ;

    // Test Google Search API if configured
    if (apiKey && cx) {
      try {
        const t0 = Date.now();
        const testUrl = new URL('https://www.googleapis.com/customsearch/v1');
        testUrl.searchParams.set('key', apiKey);
        testUrl.searchParams.set('cx', cx);
        testUrl.searchParams.set('q', testQ);
        testUrl.searchParams.set('num', '5');

        const gHttpRes = await fetch(testUrl.toString(), { headers: { 'Accept': 'application/json' } });
        const gStatus = gHttpRes.status;
        const gJson = await gHttpRes.json();

        diag.googleSearchTest = {
          time: Date.now() - t0,
          httpStatus: gStatus,
          error: gJson.error || null,
          totalResults: gJson.searchInformation?.totalResults || '0',
          itemsCount: gJson.items?.length || 0,
          sampleTitles: (gJson.items || []).map(i => i.title).slice(0, 3)
        };
      } catch (err) {
        diag.googleSearchTest = { error: err.message };
      }
    }

    // Test Provider 1: DuckDuckGo HTML
    try {
      const t0 = Date.now();
      const r1 = await gotScraping({
        url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(testQ + ' mã số thuế')}`,
        timeout: { request: 3000 }
      });
      diag.ddgHtml = { status: r1.statusCode, time: Date.now() - t0, len: r1.body.length };
    } catch (e) {
      diag.ddgHtml = { error: e.message };
    }

    // Test Provider 2: DuckDuckGo Lite (POST form)
    try {
      const t0 = Date.now();
      const r2 = await gotScraping({
        url: 'https://lite.duckduckgo.com/lite/',
        method: 'POST',
        form: { q: testQ + ' mã số thuế' },
        timeout: { request: 3000 }
      });
      diag.ddgLite = { status: r2.statusCode, time: Date.now() - t0, len: r2.body.length, preview: r2.body.slice(0, 300) };
    } catch (e) {
      diag.ddgLite = { error: e.message };
    }

    // Test Provider 3: Bing
    try {
      const t0 = Date.now();
      const r3 = await gotScraping({
        url: `https://www.bing.com/search?q=${encodeURIComponent(testQ + ' mã số thuế')}&setmkt=vi-VN&setlang=vi`,
        timeout: { request: 4000 }
      });
      const bMsts = [...r3.body.matchAll(/\b(0[1-9]\d{8}|[1-9]\d{9})(?:-\d{3})?\b/g)].map(m => m[0]);
      diag.bing = { status: r3.statusCode, time: Date.now() - t0, len: r3.body.length, msts: [...new Set(bMsts)].slice(0, 5) };
    } catch (e) {
      diag.bing = { error: e.message };
    }

    // Test Provider 4: Yahoo
    try {
      const t0 = Date.now();
      const r4 = await gotScraping({
        url: `https://search.yahoo.com/search?p=${encodeURIComponent(testQ + ' mã số thuế')}`,
        timeout: { request: 4000 }
      });
      const yMsts = [...r4.body.matchAll(/\b(0[1-9]\d{8}|[1-9]\d{9})(?:-\d{3})?\b/g)].map(m => m[0]);
      diag.yahoo = { status: r4.statusCode, time: Date.now() - t0, len: r4.body.length, msts: [...new Set(yMsts)].slice(0, 5) };
    } catch (e) {
      diag.yahoo = { error: e.message };
    }

    // Test Provider 5: Google Mobile HTML
    try {
      const t0 = Date.now();
      const r5 = await gotScraping({
        url: `https://www.google.com/search?q=${encodeURIComponent(testQ + ' mã số thuế')}&hl=vi&gl=vn`,
        timeout: { request: 4000 }
      });
      const gMsts = [...r5.body.matchAll(/\b(0[1-9]\d{8}|[1-9]\d{9})(?:-\d{3})?\b/g)].map(m => m[0]);
      diag.google = { status: r5.statusCode, time: Date.now() - t0, len: r5.body.length, msts: [...new Set(gMsts)].slice(0, 5) };
    } catch (e) {
      diag.google = { error: e.message };
    }

    res.json(diag);
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// API: Debug Serper Google API directly
app.get('/api/debug-serper', async (req, res) => {
  const q = req.query.q || '0318052916';
  const rawQuery = req.query.raw ? q : (req.query.mode === 'all' ? q : `site:masothue.com ${q.trim()}`);
  const serperKey = (process.env.SERPER_API_KEY || process.env.SERPER_KEY || '').trim();
  if (!serperKey) {
    return res.json({ success: false, message: 'SERPER_API_KEY is not set in process.env!' });
  }

  try {
    const apiRes = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': serperKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: rawQuery,
        gl: 'vn',
        hl: 'vi',
        num: 5
      })
    });

    const data = await apiRes.json();
    res.json({
      success: apiRes.ok,
      httpStatus: apiRes.status,
      queryUsed: rawQuery,
      organic: data.organic || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Debug Masothue Crawler connectivity on Cloud
app.get('/api/debug-crawl', async (req, res) => {
  const testPath = req.query.path || '/0108269207-cong-ty-co-phan-be-group';
  const url = 'https://masothue.com' + (testPath.startsWith('/') ? testPath : '/' + testPath);
  try {
    const r = await gotScraping({
      url,
      headers: { 'referer': 'https://masothue.com/' }
    });
    res.json({
      success: true,
      statusCode: r.statusCode,
      bodyLength: r.body.length,
      title: r.body.match(/<title>(.*?)<\/title>/i)?.[1] || null,
      hasRepresentative: r.body.includes('Người đại diện') || r.body.includes('Đại diện pháp luật'),
      snippet: r.body.slice(0, 400)
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
      statusCode: err.response?.statusCode,
      body: err.response?.body ? err.response.body.slice(0, 500) : null
    });
  }
});

// API: Test Cloud Connectivity to alternative sources
app.get('/api/test-sources', async (req, res) => {
  const taxId = req.query.taxId || '0108269207';
  const targets = [
    { name: 'vietqr', url: `https://api.vietqr.io/v2/business/${taxId}` },
    { name: 'masothue_direct', url: `https://masothue.com/${taxId}` },
    { name: 'trangvang', url: `https://trangvangvietnam.com/tag.asp?key=${taxId}` },
    { name: 'thuvienphapluat', url: `https://thuvienphapluat.vn/doanh-nghiep/tim-kiem?q=${taxId}` },
    { name: 'duckduckgo', url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent('site:masothue.com "' + taxId + '"')}` }
  ];

  const results = [];
  for (const t of targets) {
    try {
      const r = await gotScraping({
        url: t.url,
        headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: { request: 5000 }
      });
      results.push({
        name: t.name,
        status: r.statusCode,
        length: r.body.length,
        title: r.body.match(/<title>(.*?)<\/title>/i)?.[1] || null,
        hasRep: r.body.includes('Người đại diện') || r.body.includes('Đại diện pháp luật') || r.body.includes('Đại diện')
      });
    } catch (e) {
      results.push({ name: t.name, error: e.message, status: e.response?.statusCode });
    }
  }
  res.json({ success: true, results });
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
    console.log(`  Ứng dụng Tra Cứu Mã Số Thuế (Zero-Ads)`);
    console.log(`  Chế độ Database: ${db.isTurso ? '☁️ Turso Cloud (5GB Miễn Phí)' : '💻 SQLite Cục Bộ'}`);
    console.log(`  Trang chủ:      http://localhost:${p}`);
    console.log(`  Sitemap XML:    http://localhost:${p}/sitemap.xml`);
    console.log(`  Robots.txt:     http://localhost:${p}/robots.txt`);
    console.log(`  IndexNow Key:   https://mst0.com/${indexNowService.key}.txt`);
    console.log(`======================================================\n`);

    // On startup: notify IndexNow with recent companies and hubs (in background)
    setTimeout(async () => {
      try {
        console.log('[IndexNow] Đang kích hoạt thông báo tự động tới công cụ tìm kiếm...');
        await indexNowService.submitRecentFromDb(db, 30);
        await indexNowService.pingSitemaps();
      } catch (e) {
        console.warn('[IndexNow] Startup notification skipped:', e.message);
      }
    }, 12000);
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
