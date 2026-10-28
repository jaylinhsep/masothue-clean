import * as cheerio from 'cheerio';
import { gotScraping } from 'got-scraping';
import { db } from './database.mjs';

export class MasothueCrawler {
  constructor() {
    this.baseUrl = 'https://masothue.com';
    this.token = null;
    this.tokenTime = 0;
    // In-memory cache for search & details (15 minutes TTL)
    this.cache = new Map();
    this.cacheTtl = 15 * 60 * 1000;
  }

  async ensureSession(forceFresh = false) {
    if (!forceFresh && this.token && (Date.now() - this.tokenTime < 10 * 60 * 1000)) {
      return this.token;
    }

    try {
      const tokenRes = await gotScraping.post(`${this.baseUrl}/Ajax/Token`, {
        headers: {
          'referer': `${this.baseUrl}/`,
          'origin': this.baseUrl,
          'x-requested-with': 'XMLHttpRequest',
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body: 'r=' + Math.random().toString(36).substring(7),
        timeout: { request: 3000 }
      });

      // Capture and persist session cookies (PHPSESSID) for subsequent Ajax/Search requests
      const rawCookies = tokenRes.headers['set-cookie'];
      if (rawCookies) {
        const cookieArr = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
        this.sessionCookie = cookieArr.map(c => c.split(';')[0]).join('; ');
      }

      const tokenData = JSON.parse(tokenRes.body);
      if (tokenData && tokenData.success && tokenData.token) {
        this.token = tokenData.token;
        this.tokenTime = Date.now();
        return this.token;
      }
    } catch (err) {
      console.warn('[Crawler] ensureSession error:', err.message);
    }
    return null;
  }

  getCache(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() - item.time > this.cacheTtl) {
      this.cache.delete(key);
      return null;
    }
    return item.data;
  }

  setCache(key, data) {
    this.cache.set(key, { data, time: Date.now() });
    if (this.cache.size > 500) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
  }

  slugify(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // --- Official VietQR Business API (Direct from Cục Thuế / gdt.gov.vn) ---
  async getFromVietQR(taxId, retries = 1) {
    const cleanId = (taxId || '').trim();
    if (!cleanId || !/^\d{10}(-\d{3})?$/.test(cleanId)) return null;

    try {
      const res = await fetch(`https://api.vietqr.io/v2/business/${encodeURIComponent(cleanId)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (res.status === 429) {
        if (retries > 0) {
          const retryAfter = Math.min(parseInt(res.headers.get('retry-after'), 10) || 1, 2);
          await new Promise(r => setTimeout(r, retryAfter * 1000));
          return this.getFromVietQR(taxId, retries - 1);
        }
        return { isRateLimited: true, retryAfter: 60 };
      }
      if (!res.ok) return null;
      const json = await res.json();
      if (json && json.code === '00' && json.data) {
        const d = json.data;
        if (!d.id || !d.name) return null;
        const slug = `${d.id}-${this.slugify(d.name)}`;
        const company = {
          name: d.name,
          slug,
          url: `/mst/${slug}`,
          taxId: d.id,
          taxAddress: d.address || '',
          address: d.address || '',
          status: d.status || 'Đang hoạt động',
          isStatusActive: !d.status || d.status.includes('hoạt động'),
          internationalName: d.internationalName || '',
          shortName: d.shortName || '',
          representative: '',
          representativeNote: '',
          phone: '',
          startDate: '',
          managedBy: 'Cơ quan Thuế',
          type: 'Doanh nghiệp',
          mainIndustry: db.detectIndustry(d.name),
          lastUpdated: new Date().toLocaleDateString('vi-VN'),
          industries: []
        };
        return company;
      }
    } catch (e) {
      console.warn('[VietQR error]', e.message);
    }
    return null;
  }

  // --- Official Google Custom Search API Fallback ---
  async searchViaGoogle(query) {
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_KEY;
    const cx = process.env.GOOGLE_SEARCH_CX || process.env.GOOGLE_CX || process.env.SEARCH_ENGINE_ID || process.env.GOOGLE_SEARCH_ENGINE_ID;

    if (!apiKey || !cx) {
      return null;
    }

    try {
      const searchUrl = new URL('https://www.googleapis.com/customsearch/v1');
      searchUrl.searchParams.set('key', apiKey.trim());
      searchUrl.searchParams.set('cx', cx.trim());
      searchUrl.searchParams.set('q', query.trim());
      searchUrl.searchParams.set('num', '10');

      const res = await fetch(searchUrl.toString(), {
        headers: { 'Accept': 'application/json' }
      });

      if (!res.ok) {
        console.warn(`[Google Search] API HTTP ${res.status}:`, await res.text());
        return null;
      }

      let data = await res.json();
      if (!data.items || data.items.length === 0) {
        // Fallback 1B: Try query + ' mã số thuế' in case CSE searches full web
        const searchUrl2 = new URL('https://www.googleapis.com/customsearch/v1');
        searchUrl2.searchParams.set('key', apiKey.trim());
        searchUrl2.searchParams.set('cx', cx.trim());
        searchUrl2.searchParams.set('q', `${query.trim()} mã số thuế`);
        searchUrl2.searchParams.set('num', '10');
        try {
          const res2 = await fetch(searchUrl2.toString(), { headers: { 'Accept': 'application/json' } });
          if (res2.ok) {
            const data2 = await res2.json();
            if (data2.items && data2.items.length > 0) {
              data = data2;
            }
          }
        } catch (e) {}
      }

      if (!data.items || data.items.length === 0) {
        return null;
      }

      const items = [];
      const seenTax = new Set();
      for (const item of data.items) {
        const link = item.link || '';
        const fullText = `${item.title || ''} ${item.snippet || ''} ${link}`;
        const taxMatch = fullText.match(/\b(0[1-9]\d{8}|[1-9]\d{9})(?:-\d{3})?\b/);
        if (taxMatch) {
          const taxId = taxMatch[1];
          if (seenTax.has(taxId)) continue;
          seenTax.add(taxId);

          let cleanName = (item.title || '')
            .replace(/-\s*MaSoThue.*$/i, '')
            .replace(/-\s*Mã số thuế.*$/i, '')
            .replace(/-\s*Thông tin doanh nghiệp.*$/i, '')
            .replace(/^\d{10}(-\d{3})?\s*[-–—:]\s*/, '')
            .trim();

          let rep = '';
          const repMatch = (item.snippet || '').match(/(?:Đại diện pháp luật|Người đại diện|Đại diện)[:\s]+([^·,–\n\-]+)/i);
          if (repMatch) rep = repMatch[1].trim();

          let address = '';
          if (item.snippet) {
            const addrMatch = item.snippet.match(/(?:Địa chỉ|Địa chỉ thuế|Trụ sở)[:\s]+([^·\n]+)/i);
            if (addrMatch) {
              address = addrMatch[1].trim();
            } else {
              const snipParts = item.snippet.split(' - ');
              if (snipParts.length >= 2) {
                address = snipParts.slice(1).join(' - ').replace(/\s+/g, ' ').trim();
              } else {
                address = item.snippet.replace(/\s+/g, ' ').trim();
              }
            }
          }

          const slug = `${taxId}-${this.slugify(cleanName)}`;
          items.push({
            name: cleanName,
            slug,
            url: `/mst/${slug}`,
            taxId,
            representative: rep,
            address: address || 'Toàn quốc',
            province: db.extractProvince(address || ''),
            status: 'Đang hoạt động'
          });
        }
      }

      if (items.length === 0) return null;

      // Enhance top matches with official government data from VietQR & save to DB!
      for (let i = 0; i < Math.min(items.length, 3); i++) {
        try {
          const v = await this.getFromVietQR(items[i].taxId);
          if (v && v.taxId && v.name) {
            items[i].name = v.name;
            items[i].address = v.address || items[i].address;
            items[i].status = v.status || items[i].status;
            if (items[i].representative) {
              v.representative = items[i].representative;
            }
            await db.saveCompany(v);
          } else {
            await db.saveCompany(items[i]);
          }
        } catch (e) {}
      }

      return {
        success: true,
        isDirect: items.length === 1,
        fromGoogle: true,
        items,
        currentPage: 1,
        maxPage: 1,
        totalFound: items.length
      };
    } catch (err) {
      console.warn('[Google Search Error]', err.message);
      return null;
    }
  }

  // --- Brave Search API (2,000 Free Searches/Month Forever) ---
  async searchViaBrave(query) {
    const apiKey = (process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY || '').trim();
    if (!apiKey || !query || !query.trim()) return null;

    try {
      const searchUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query.trim() + ' mã số thuế')}&country=vn&search_lang=vi&count=10`;
      const res = await fetch(searchUrl, {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey
        }
      });
      if (!res.ok) {
        console.warn(`[Brave Search API] HTTP ${res.status}`);
        return null;
      }
      const data = await res.json();
      if (!data.web || !data.web.results || data.web.results.length === 0) return null;

      const items = [];
      const seen = new Set();
      for (const item of data.web.results) {
        const fullText = `${item.title || ''} ${item.description || ''} ${item.url || ''}`;
        const taxMatch = fullText.match(/\b(0[1-9]\d{8}|[1-9]\d{9})(?:-\d{3})?\b/);
        if (!taxMatch) continue;
        const taxId = taxMatch[1];
        if (seen.has(taxId)) continue;
        seen.add(taxId);

        let cleanName = (item.title || '')
          .replace(/-\s*MaSoThue.*$/i, '')
          .replace(/-\s*Mã số thuế.*$/i, '')
          .replace(/^\d{10}(-\d{3})?\s*[-–—:]\s*/, '')
          .trim();

        const slug = `${taxId}-${this.slugify(cleanName)}`;
        const comp = {
          name: cleanName,
          slug,
          url: `/mst/${slug}`,
          taxId,
          representative: '',
          address: item.description || 'Đang cập nhật',
          province: db.extractProvince(item.description || ''),
          status: 'Đang hoạt động'
        };
        items.push(comp);
      }

      for (let i = 0; i < Math.min(items.length, 3); i++) {
        try {
          const v = await this.getFromVietQR(items[i].taxId);
          if (v && v.taxId && v.name) {
            items[i].name = v.name;
            items[i].address = v.address || items[i].address;
            items[i].status = v.status || items[i].status;
            await db.saveCompany(v);
          } else {
            await db.saveCompany(items[i]);
          }
        } catch (e) {}
      }

      if (items.length > 0) {
        return {
          success: true,
          isDirect: items.length === 1,
          fromBrave: true,
          items,
          currentPage: 1,
          maxPage: 1,
          totalFound: items.length
        };
      }
    } catch (err) {
      console.warn('[Brave Search Error]', err.message);
    }
    return null;
  }

  // --- DoanhNghiep.Biz Fallback (100% Free, Domestic VN, Has Representative & Phone, Zero Cloudflare Block) ---
  async getFromDoanhNghiepBiz(taxId) {
    const cleanId = (taxId || '').trim();
    if (!cleanId || !/^\d{10}(-\d{3})?$/.test(cleanId)) return null;

    try {
      const res = await gotScraping({
        url: `https://doanhnghiep.biz/${cleanId}`,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
          'Referer': 'https://doanhnghiep.biz/'
        },
        timeout: { request: 4000 }
      });

      if (res.statusCode !== 200 || !res.body) return null;

      const $ = cheerio.load(res.body);
      const title = $('h5, h1, title').first().text().trim();
      if (!title || res.body.includes('Không tìm thấy')) return null;

      const info = {
        taxId: cleanId,
        name: '',
        representative: '',
        phone: '',
        address: '',
        startDate: '',
        status: '',
        type: '',
        mainIndustry: '',
        shortName: ''
      };

      $('table tr').each((_, tr) => {
        const $tr = $(tr);
        const firstTd = $tr.find('td, th').first().text().trim();
        const lastTd = $tr.find('td, th').last().text().trim();

        if (firstTd.includes('Số ĐKKD') || firstTd.includes('MST')) {
          info.taxId = lastTd || cleanId;
        } else if (firstTd.includes('Tên giao dịch')) {
          info.shortName = lastTd;
        } else if (firstTd.includes('Người đại diện')) {
          let rep = lastTd;
          if (rep.includes('Ngoài ra')) {
            rep = rep.split('Ngoài ra')[0].trim();
          }
          info.representative = rep;
        } else if (firstTd.includes('Điện thoại')) {
          info.phone = lastTd.replace(/Ẩn số điện thoại/i, '').replace(/Hiện số điện thoại/i, '').trim();
        } else if (firstTd.includes('Địa chỉ')) {
          info.address = lastTd;
        } else if (firstTd.includes('Ngày hoạt động') || firstTd.includes('Ngày cấp')) {
          if (!info.startDate) info.startDate = lastTd;
        } else if (firstTd.includes('Tình trạng')) {
          info.status = lastTd;
        } else if (firstTd.includes('Loại hình DN')) {
          info.type = lastTd;
        } else if (firstTd.includes('Ngành nghề KD')) {
          info.mainIndustry = lastTd;
        }
      });

      const nameEl = $('th[itemprop="name"], h5').first().text().trim();
      if (nameEl) {
        info.name = nameEl.replace(/^\d{10}(-\d{3})?\s*-\s*/, '').trim();
      }

      return (info.representative || info.phone || info.name) ? info : null;
    } catch (err) {
      console.warn('[doanhnghiep.biz Error]:', err.message);
      return null;
    }
  }

  // --- Vietnam VPS Bridge (100% Free, Private, Domestic VN IP, Zero Block) ---
  async searchViaVnBridge(query) {
    const bridgeUrl = (process.env.VN_BRIDGE_URL || '').trim().replace(/\/+$/, '');
    const bridgeToken = (process.env.VN_BRIDGE_TOKEN || process.env.VN_BRIDGE_KEY || '').trim();
    if (!bridgeUrl || !query || !query.trim()) return null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${bridgeUrl}/api/search?q=${encodeURIComponent(query.trim())}`, {
        headers: {
          'x-bridge-token': bridgeToken,
          'Accept': 'application/json'
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        console.warn(`[VN Bridge Search API] HTTP ${res.status}`);
        return null;
      }
      const data = await res.json();
      if (data && data.success && Array.isArray(data.items) && data.items.length > 0) {
        return {
          ...data,
          fromVnBridge: true
        };
      }
    } catch (err) {
      console.warn('[VN Bridge Search Error]', err.message);
    }
    return null;
  }

  async getDetailViaVnBridge(path) {
    const bridgeUrl = (process.env.VN_BRIDGE_URL || '').trim().replace(/\/+$/, '');
    const bridgeToken = (process.env.VN_BRIDGE_TOKEN || process.env.VN_BRIDGE_KEY || '').trim();
    if (!bridgeUrl || !path) return null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);

      const cleanPath = path.startsWith('/') ? path : '/' + path;
      const res = await fetch(`${bridgeUrl}/api/detail?path=${encodeURIComponent(cleanPath)}`, {
        headers: {
          'x-bridge-token': bridgeToken,
          'Accept': 'application/json'
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        console.warn(`[VN Bridge Detail API] HTTP ${res.status}`);
        return null;
      }
      const data = await res.json();
      if (data && data.success && data.data) {
        return {
          ...data,
          fromVnBridge: true
        };
      }
    } catch (err) {
      console.warn('[VN Bridge Detail Error]', err.message);
    }
    return null;
  }

  // --- Tavily Search API (1,000 Free Searches/Month Forever) ---
  async searchViaTavily(query) {
    const apiKey = (process.env.TAVILY_API_KEY || '').trim();
    if (!apiKey || !query || !query.trim()) return null;

    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          api_key: apiKey,
          query: `${query.trim()} mã số thuế`,
          search_depth: 'basic',
          max_results: 10
        })
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.warn(`[Tavily Search API] HTTP ${res.status}: ${errText}`);
        return null;
      }
      const data = await res.json();
      if (!data.results || data.results.length === 0) return null;

      const items = [];
      const seen = new Set();
      for (const item of data.results) {
        const fullText = `${item.title || ''} ${item.content || ''} ${item.url || ''}`;
        const taxMatch = fullText.match(/\b(0[1-9]\d{8}|[1-9]\d{9})(?:-\d{3})?\b/);
        if (!taxMatch) continue;
        const taxId = taxMatch[1];
        if (seen.has(taxId)) continue;
        seen.add(taxId);

        let cleanName = (item.title || '')
          .replace(/-\s*MaSoThue.*$/i, '')
          .replace(/-\s*Mã số thuế.*$/i, '')
          .replace(/^\d{10}(-\d{3})?\s*[-–—:]\s*/, '')
          .replace(/\s*[-–—:]\s*\d{10}(-\d{3})?.*$/, '')
          .trim();

        let rep = '';
        const repMatch = (item.content || '').match(/(?:Người đại diện theo pháp luật|Đại diện theo pháp luật|Người đại diện pháp luật|Đại diện pháp luật|Người đại diện)[:\s,]+([^;·–\n]+)/i);
        if (repMatch) {
          let r = repMatch[1].trim()
            .replace(/^(theo pháp luật|theo uỷ quyền)[\s.:,-]+/i, '')
            .replace(/\s*(Ngoài ra.*|\d{10}.*|Ẩn số điện thoại.*|Chức vụ.*)$/i, '')
            .replace(/^[,\-–\s.:]+|[,\-–\s.:]+$/g, '')
            .trim();
          const isCompanyWord = /(công ty|tnhh|cổ phần|chi nhánh|văn phòng|tập đoàn|doanh nghiệp)/i.test(r);
          if (!isCompanyWord && r.length >= 2 && r.length <= 60 && !r.includes('http')) {
            rep = r;
          }
        }

        let phone = '';
        const phoneMatch = (item.content || '').match(/(?:Điện thoại|SĐT|Phone)[:\s,]+([0-9\s.\-+]{8,15})/i);
        if (phoneMatch) phone = phoneMatch[1].trim();

        const slug = `${taxId}-${this.slugify(cleanName)}`;
        const comp = {
          name: cleanName,
          slug,
          url: `/mst/${slug}`,
          taxId,
          representative: rep,
          phone,
          address: item.content ? item.content.slice(0, 150) : 'Đang cập nhật',
          province: db.extractProvince(item.content || ''),
          status: 'Đang hoạt động'
        };
        items.push(comp);
      }

      // Parallel ultra-fast enrichment for top items (max 1.5s total)
      const enrichPromises = items.slice(0, 5).map(async (item) => {
        try {
          const v = await Promise.race([
            this.getFromVietQR(item.taxId),
            new Promise(r => setTimeout(() => r(null), 1500))
          ]);
          if (v && v.taxId && v.name) {
            item.name = v.name;
            item.address = v.address || item.address;
            item.status = v.status || item.status;
            if (item.representative) v.representative = item.representative;
            if (item.phone) v.phone = item.phone;
            db.saveCompany(v).catch(() => {});
          } else {
            db.saveCompany(item).catch(() => {});
          }
        } catch (e) {
          db.saveCompany(item).catch(() => {});
        }
      });
      await Promise.allSettled(enrichPromises);

      if (items.length > 0) {
        return {
          success: true,
          isDirect: items.length === 1,
          fromTavily: true,
          items,
          currentPage: 1,
          maxPage: 1,
          totalFound: items.length
        };
      }
    } catch (err) {
      console.warn('[Tavily Search Error]', err.message);
    }
    return null;
  }

  // --- Yahoo Search Fallback (100% Free Forever, No Key, Bypasses Cloud Datacenter Blocks) ---
  async searchViaYahoo(query) {
    if (!query || !query.trim()) return null;

    try {
      const searchUrl = `https://search.yahoo.com/search?p=${encodeURIComponent('site:masothue.com ' + query.trim())}`;
      const res = await gotScraping({
        url: searchUrl,
        timeout: { request: 5000 },
        headers: {
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      });
      if (res.statusCode !== 200 || !res.body) return null;

      const $ = cheerio.load(res.body);
      const items = [];
      const seen = new Set();

      $('div.algo, li div.dd').each((_, el) => {
        const $el = $(el);
        const titleLink = $el.find('h3 a, a.compText, a');
        const title = titleLink.first().text().trim();
        const snippet = $el.find('.compText, .compText p, p').text().trim();
        const href = titleLink.first().attr('href') || '';
        const fullText = `${title} ${snippet} ${href}`;

        // Match valid Vietnamese 10-digit tax codes (01-09, 10-64, 80-89)
        const taxMatch = fullText.match(/\b(0[1-9]\d{8}|[1-6]\d{9}|8\d{9})(?:-\d{3})?\b/);
        if (!taxMatch) return;
        const taxId = taxMatch[1];
        if (seen.has(taxId)) return;
        seen.add(taxId);

        let cleanName = title
          .replace(/-\s*MaSoThue.*$/i, '')
          .replace(/-\s*Mã số thuế.*$/i, '')
          .replace(/^\d{10}(-\d{3})?\s*[-–—:]\s*/, '')
          .replace(/\s*[-–—:]\s*\d{10}(-\d{3})?.*$/, '')
          .trim();

        const slug = `${taxId}-${this.slugify(cleanName || query)}`;
        items.push({
          name: cleanName || query,
          slug,
          url: `/mst/${slug}`,
          taxId,
          representative: '',
          phone: '',
          address: snippet ? snippet.slice(0, 150) : 'Đang cập nhật',
          province: db.extractProvince(snippet || ''),
          status: 'Đang hoạt động'
        });
      });

      // Parallel verification with official VietQR (max 1.5s total across all items)
      const enrichPromises = items.slice(0, 6).map(async (item) => {
        try {
          const v = await Promise.race([
            this.getFromVietQR(item.taxId),
            new Promise(r => setTimeout(() => r(null), 1500))
          ]);
          if (v && v.taxId && v.name) {
            if (item.representative) v.representative = item.representative;
            if (item.phone) v.phone = item.phone;
            db.saveCompany(v).catch(() => {});
            return v;
          }
          db.saveCompany(item).catch(() => {});
          return item;
        } catch (e) {
          db.saveCompany(item).catch(() => {});
          return item;
        }
      });
      const validItems = (await Promise.all(enrichPromises)).filter(Boolean);

      if (validItems.length > 0) {
        return {
          success: true,
          isDirect: validItems.length === 1,
          fromYahoo: true,
          items: validItems,
          currentPage: 1,
          maxPage: 1,
          totalFound: validItems.length
        };
      }
    } catch (err) {
      console.warn('[Yahoo Search Error]', err.message);
    }
    return null;
  }

  // --- Enrich Tax ID via Serper Google Snippet (Bypasses Cloudflare 100%) ---
  async enrichViaSerper(taxId, companyName = '') {
    const rawKeys = process.env.SERPER_API_KEY || process.env.SERPER_KEY || '';
    const serperKeys = rawKeys.split(',').map(k => k.trim()).filter(Boolean);
    if (serperKeys.length === 0 || !taxId) return null;

    for (const key of serperKeys) {
      try {
        const res = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'X-API-KEY': key,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            q: `${taxId} "đại diện"`,
            gl: 'vn',
            hl: 'vi',
            num: 5
          })
        });

        if (res.status === 429 || res.status === 400) {
          continue;
        }
        if (!res.ok) continue;
        let data = await res.json();
        if (!data.organic || data.organic.length === 0) {
          try {
            const fbRes = await fetch('https://google.serper.dev/search', {
              method: 'POST',
              headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
              body: JSON.stringify({ q: taxId, gl: 'vn', hl: 'vi', num: 5 })
            });
            if (fbRes.ok) {
              const fbData = await fbRes.json();
              if (fbData.organic && fbData.organic.length > 0) {
                data = fbData;
              }
            }
          } catch (e) {}
        }
        if (!data.organic || data.organic.length === 0) continue;

      let representative = '';
      let phone = '';
      let startDate = '';
      let managedBy = '';

      for (const item of data.organic) {
        const text = `${item.title || ''} ; ${item.snippet || ''}`;

        if (!representative) {
          const repMatch = text.match(/(?:Người đại diện theo pháp luật|Đại diện theo pháp luật|Người đại diện pháp luật|Đại diện pháp luật|Người đại diện)[:\s,]+([^;·–\n]+)/i);
          if (repMatch) {
            let r = repMatch[1].trim()
              .replace(/^(theo pháp luật|theo uỷ quyền)[\s.:,-]+/i, '')
              .replace(/\s*(Ngoài ra.*|\d{10}.*|Ẩn số điện thoại.*|Chức vụ.*)$/i, '')
              .replace(/^[,\-–\s.:]+|[,\-–\s.:]+$/g, '')
              .trim();
            const isCompanyWord = /(công ty|tnhh|cổ phần|chi nhánh|văn phòng|tập đoàn|doanh nghiệp)/i.test(r);
            if (!isCompanyWord && r.length >= 2 && r.length <= 60 && !r.includes('http') && !r.includes('...')) {
              representative = r;
            }
          }
        }

        if (!phone) {
          const phoneMatch = text.match(/(?:Điện thoại|SĐT|Phone)[:\s,]+([0-9\s.\-+]{8,15})/i);
          if (phoneMatch) phone = phoneMatch[1].trim();
        }

        if (!startDate) {
          const dateMatch = text.match(/(?:Ngày hoạt động|Ngày cấp|Hoạt động từ)[:\s,]+([0-9\-\/]{8,10})/i);
          if (dateMatch) {
            startDate = dateMatch[1].trim();
          } else if (item.date) {
            startDate = item.date;
          }
        }

        if (!managedBy) {
          const managedMatch = text.match(/(?:Quản lý bởi|Cơ quan thuế|Chi cục Thuế|Cục Thuế)[:\s,]*([^;·–\n]+)/i);
          if (managedMatch) {
            let m = managedMatch[0].trim().replace(/^[,\-–\s]+|[,\-–\s]+$/g, '');
            if (m.length >= 4 && m.length <= 80) managedBy = m;
          }
        }
      }

      if (representative || phone || startDate || managedBy) {
        return {
          representative: representative || '',
          phone: phone || '',
          startDate: startDate || '',
          managedBy: managedBy || 'Cơ quan Thuế'
        };
      }
    } catch (err) {
      console.warn('[enrichViaSerper error]', err.message);
    }
  }
  return null;
}

  // --- Enrich Tax ID via Tavily Search (Extracts Representative, Phone, Tax office) ---
  async enrichViaTavily(taxId, companyName = '') {
    const apiKey = (process.env.TAVILY_API_KEY || '').trim();
    if (!apiKey || !taxId) return null;

    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          api_key: apiKey,
          query: `masothue ${taxId} "đại diện"`,
          search_depth: 'basic',
          max_results: 5
        })
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.warn(`[Tavily Enrich API] HTTP ${res.status}: ${errText}`);
        return null;
      }
      const data = await res.json();
      if (!data.results || data.results.length === 0) return null;

      let representative = '';
      let phone = '';
      let startDate = '';
      let managedBy = '';

      for (const item of data.results) {
        const text = `${item.title || ''} ; ${item.content || ''}`;

        if (!representative) {
          const repMatch = text.match(/(?:Người đại diện theo pháp luật|Đại diện theo pháp luật|Người đại diện pháp luật|Đại diện pháp luật|Người đại diện)[:\s,]+([^;·–\n]+)/i);
          if (repMatch) {
            let r = repMatch[1].trim()
              .replace(/^(theo pháp luật|theo uỷ quyền)[\s.:,-]+/i, '')
              .replace(/\s*(Ngoài ra.*|\d{10}.*|Ẩn số điện thoại.*|Chức vụ.*)$/i, '')
              .replace(/^[,\-–\s.:]+|[,\-–\s.:]+$/g, '')
              .trim();
            const isCompanyWord = /(công ty|tnhh|cổ phần|chi nhánh|văn phòng|tập đoàn|doanh nghiệp)/i.test(r);
            if (!isCompanyWord && r.length >= 2 && r.length <= 60 && !r.includes('http') && !r.includes('...')) {
              representative = r;
            }
          }
        }

        if (!phone) {
          const phoneMatch = text.match(/(?:Điện thoại|SĐT|Phone)[:\s,]+([0-9\s.\-+]{8,15})/i);
          if (phoneMatch) phone = phoneMatch[1].trim();
        }

        if (!startDate) {
          const dateMatch = text.match(/(?:Ngày hoạt động|Ngày cấp|Hoạt động từ)[:\s,]+([0-9\-\/]{8,10})/i);
          if (dateMatch) startDate = dateMatch[1].trim();
        }

        if (!managedBy) {
          const managedMatch = text.match(/(?:Quản lý bởi|Cơ quan thuế|Chi cục Thuế|Cục Thuế)[:\s,]*([^;·–\n]+)/i);
          if (managedMatch) {
            let m = managedMatch[0].trim().replace(/^[,\-–\s]+|[,\-–\s]+$/g, '');
            if (m.length >= 4 && m.length <= 80) managedBy = m;
          }
        }
      }

      if (representative || phone || startDate || managedBy) {
        return {
          representative: representative || '',
          phone: phone || '',
          startDate: startDate || '',
          managedBy: managedBy || 'Cơ quan Thuế'
        };
      }
    } catch (e) {
      console.warn('[enrichViaTavily error]', e.message);
    }
    return null;
  }

  // --- Combined Auto-Enricher (Tavily AI -> Serper Google) ---
  async enrichExternal(taxId, companyName = '') {
    // 1. Try Tavily AI (Free 1,000 requests/month)
    const tavily = await this.enrichViaTavily(taxId, companyName);
    if (tavily && (tavily.representative || tavily.phone)) return tavily;

    // 2. Try Serper.dev Google API
    const serper = await this.enrichViaSerper(taxId, companyName);
    if (serper && (serper.representative || serper.phone)) return serper;

    return tavily || serper || null;
  }

  // --- Serper.dev (Free 2,500 Google Searches) Fallback ---
  async searchViaSerper(query) {
    const rawKeys = process.env.SERPER_API_KEY || process.env.SERPER_KEY || '';
    const serperKeys = rawKeys.split(',').map(k => k.trim()).filter(Boolean);
    if (serperKeys.length === 0) return null;

    for (const key of serperKeys) {
      try {
        const res = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'X-API-KEY': key,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            q: `site:masothue.com ${query.trim()}`,
            gl: 'vn',
            hl: 'vi',
            num: 10
          })
        });

        if (res.status === 429 || res.status === 400) {
          continue; // Try next key if out of credits or rate limited
        }
        if (!res.ok) continue;
        let data = await res.json();
        if (!data.organic || data.organic.length === 0) {
          try {
            const fbRes = await fetch('https://google.serper.dev/search', {
              method: 'POST',
              headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
              body: JSON.stringify({ q: query.trim(), gl: 'vn', hl: 'vi', num: 5 })
            });
            if (fbRes.ok) {
              const fbData = await fbRes.json();
              if (fbData.organic && fbData.organic.length > 0) {
                data = fbData;
              }
            }
          } catch (e) {}
        }
        if (!data.organic || data.organic.length === 0) continue;

        const items = [];
        for (const item of data.organic) {
          const link = item.link || '';
          const taxMatch = (link + ' ' + (item.title || '') + ' ' + (item.snippet || '')).match(/(\d{10}(-\d{3})?)/);
          if (taxMatch) {
            const taxId = taxMatch[1];
            let cleanName = (item.title || '')
              .replace(/-\s*MaSoThue.*$/i, '')
              .replace(/-\s*Mã số thuế.*$/i, '')
              .replace(/^\d{10}(-\d{3})?\s*-\s*/, '')
              .trim();

            let rep = '';
            const repMatch = (item.snippet || '').match(/(?:Người đại diện theo pháp luật|Đại diện theo pháp luật|Người đại diện pháp luật|Đại diện pháp luật|Người đại diện)[:\s,]+([^;·–\n]+)/i);
            if (repMatch) {
              let r = repMatch[1].trim()
                .replace(/^(theo pháp luật|theo uỷ quyền)[\s.:,-]+/i, '')
                .replace(/\s*(Ngoài ra.*|\d{10}.*|Ẩn số điện thoại.*|Chức vụ.*)$/i, '')
                .replace(/^[,\-–\s.:]+|[,\-–\s.:]+$/g, '')
                .trim();
              const isCompanyWord = /(công ty|tnhh|cổ phần|chi nhánh|văn phòng|tập đoàn|doanh nghiệp)/i.test(r);
              if (!isCompanyWord && r.length >= 2 && r.length <= 60) {
                rep = r;
              }
            }

            const slug = `${taxId}-${this.slugify(cleanName)}`;
            const comp = {
              name: cleanName,
              slug,
              url: `/mst/${slug}`,
              taxId,
              representative: rep,
              address: item.snippet || 'Toàn quốc',
              province: db.extractProvince(item.snippet || ''),
              status: 'Đang hoạt động'
            };
            items.push(comp);

            // Persist to DB in background
            db.saveCompany(comp).catch(() => {});
          }
        }

        if (items.length > 0) {
          return {
            success: true,
            isDirect: items.length === 1,
            fromSerper: true,
            items,
            currentPage: 1,
            maxPage: 1,
            totalFound: items.length
          };
        }
      } catch (e) {
        console.warn('[Serper Error]', e.message);
      }
    }
    return null;
  }

  // --- DuckDuckGo Web Search Fallback (100% Free, Unlimited, Bypasses Cloudflare) ---
  async searchViaDuckDuckGo(query) {
    if (!query || !query.trim()) return null;
    const cleanQ = query.trim();
    try {
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQ + ' mã số thuế')}`;
      const res = await gotScraping({
        url: searchUrl,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
          'Referer': 'https://html.duckduckgo.com/'
        },
        timeout: { request: 6500 }
      });

      if (res.statusCode !== 200 || !res.body) return null;

      const $ = cheerio.load(res.body);
      const items = [];
      const seenTax = new Set();

      $('.result__body').each((_, el) => {
        const $el = $(el);
        const title = $el.find('.result__title a').text().trim();
        const link = $el.find('.result__title a').attr('href') || '';
        const snippet = $el.find('.result__snippet').text().trim();

        let targetUrl = '';
        const uddgMatch = link.match(/uddg=([^&]+)/);
        if (uddgMatch) {
          try {
            targetUrl = decodeURIComponent(uddgMatch[1]);
          } catch (e) {
            targetUrl = link;
          }
        } else {
          targetUrl = link;
        }

        const fullText = `${title} ${snippet} ${targetUrl}`;
        const taxMatch = fullText.match(/\b(\d{10}(-\d{3})?)\b/);
        if (!taxMatch) return;

        const taxId = taxMatch[1];
        if (seenTax.has(taxId)) return;
        seenTax.add(taxId);

        let cleanName = title
          .replace(/-\s*MaSoThue.*$/i, '')
          .replace(/-\s*Mã số thuế.*$/i, '')
          .replace(/-\s*Thông tin doanh nghiệp.*$/i, '')
          .replace(/-\s*Thư Viện Pháp Luật.*$/i, '')
          .replace(/-\s*CV Work.*$/i, '')
          .replace(/^\d{10}(-\d{3})?\s*[-–—:]\s*/, '')
          .replace(/\s*[-–—:]\s*Mã số\s*\.\.\.?$/i, '')
          .replace(/\s*\.\.\.?$/, '')
          .trim();

        if (cleanName.length < 5) {
          const nameInSnippet = snippet.match(/(?:CÔNG TY|DOANH NGHIỆP|CHI NHÁNH|VĂN PHÒNG ĐẠI DIỆN|HTX|HỢP TÁC XÃ)[^–—\-\.⭐:]+/i);
          if (nameInSnippet) cleanName = nameInSnippet[0].trim();
        }

        let address = '';
        const addrMatch = snippet.match(/(?:Địa chỉ|Trụ sở|địa chỉ tại)[:\s]+([^;·–—\n]+)/i);
        if (addrMatch) {
          address = addrMatch[1].trim();
        } else {
          address = snippet.replace(/.*?\b\d{10}(-\d{3})?\b\s*[-–—:⭐]*\s*/, '').slice(0, 120);
        }

        let rep = '';
        const repMatch = snippet.match(/(?:Người đại diện|Đại diện pháp luật|Đại diện)[:\s]+([^;·–—\n]+)/i);
        if (repMatch) rep = repMatch[1].trim();

        const slug = `${taxId}-${this.slugify(cleanName)}`;
        const comp = {
          name: cleanName,
          slug,
          url: `/mst/${slug}`,
          taxId,
          representative: rep,
          address: address || 'Đang cập nhật',
          province: db.extractProvince(address),
          status: 'Đang hoạt động'
        };
        items.push(comp);
      });

      // Parallel enrichment for top items (max 1.5s total)
      const enrichPromises = items.slice(0, 5).map(async (item) => {
        if (item.name.includes('...') || item.name.length < 15 || !item.address || item.address === 'Đang cập nhật') {
          try {
            const vComp = await Promise.race([
              this.getFromVietQR(item.taxId),
              new Promise(r => setTimeout(() => r(null), 1500))
            ]);
            if (vComp && vComp.name) {
              item.name = vComp.name;
              if (vComp.address) item.address = vComp.address;
              item.province = db.extractProvince(item.address);
              item.status = vComp.status || item.status;
              const newSlug = `${item.taxId}-${this.slugify(vComp.name)}`;
              item.slug = newSlug;
              item.url = `/mst/${newSlug}`;
            }
          } catch (e) {}
        }
        db.saveCompany(item).catch(() => {});
      });
      await Promise.allSettled(enrichPromises);

      if (items.length > 0) {
        return {
          success: true,
          isDirect: items.length === 1,
          fromDuckDuckGo: true,
          items,
          currentPage: 1,
          maxPage: 1,
          totalFound: items.length
        };
      }
    } catch (err) {
      console.warn('[searchViaDuckDuckGo error]:', err.message);
    }
    return null;
  }

  async search(query, type = 'auto', page = 1) {
    const q = query ? query.trim() : '';
    if (!q) {
      return { success: false, message: 'Vui lòng nhập từ khóa tìm kiếm (Tên công ty, MST, người đại diện)' };
    }

    // 1. Direct Tax Code check
    const isPureDigits = /^\d{10}(-\d{3})?$/.test(q);
    if (isPureDigits) {
      // Priority 1: Check Turso Cloud DB first!
      const dbCompany = await db.getCompanyByTaxId(q);
      if (dbCompany && dbCompany.data) {
        const hasRep = (dbCompany.representative && dbCompany.representative.trim()) || 
                       (dbCompany.data.representative && dbCompany.data.representative.trim());
        const hasManaged = dbCompany.data.managedBy && dbCompany.data.managedBy !== 'Cơ quan Thuế';

        // 1A. If already enriched with representative or specific tax office, return immediately (<30ms)!
        if (hasRep || hasManaged) {
          const cleanSlug = (dbCompany.slug || '').replace(/^\/?(mst\/)?/, '');
          const targetUrl = `/${cleanSlug}`;
          return {
            success: true,
            isDirect: true,
            fromDb: true,
            directUrl: targetUrl,
            detail: dbCompany.data,
            items: [{
              name: dbCompany.name,
              url: targetUrl,
              taxId: dbCompany.taxId,
              representative: hasRep || '',
              address: dbCompany.address,
              status: dbCompany.status,
              province: dbCompany.province,
              autoExpand: true
            }],
            currentPage: 1,
            maxPage: 1,
            totalFound: 1
          };
        }

        // 1B. If in DB but INCOMPLETE (missing rep/managedBy), automatically enrich it right now!
        const cleanSlug = (dbCompany.slug || `${dbCompany.taxId}-${this.slugify(dbCompany.name)}`).replace(/^\/?(mst\/)?/, '');
        try {
          const freshDetail = await this.getDetail(`/${cleanSlug}`, true);
          let serperInfo = null;
          if (!freshDetail.success || !freshDetail.data?.representative) {
            serperInfo = await this.enrichExternal(q, dbCompany.name);
          }

          const rep = freshDetail.data?.representative || serperInfo?.representative || '';
          const phone = freshDetail.data?.phone || serperInfo?.phone || '';
          const startDate = freshDetail.data?.startDate || serperInfo?.startDate || '';
          const managedBy = (freshDetail.data?.managedBy && freshDetail.data.managedBy !== 'Cơ quan Thuế') 
            ? freshDetail.data.managedBy 
            : (serperInfo?.managedBy || dbCompany.data?.managedBy || 'Cơ quan Thuế');

          if (rep || (managedBy && managedBy !== 'Cơ quan Thuế')) {
            const enriched = {
              ...dbCompany.data,
              ...(freshDetail.data || {}),
              representative: rep,
              phone: phone || dbCompany.data?.phone || '',
              startDate: startDate || dbCompany.data?.startDate || '',
              managedBy: managedBy
            };
            await db.saveCompany(enriched);
            const targetUrl = `/${cleanSlug}`;
            return {
              success: true,
              isDirect: true,
              directUrl: targetUrl,
              detail: enriched,
              items: [{
                name: enriched.name,
                url: targetUrl,
                taxId: enriched.taxId,
                representative: rep,
                address: enriched.address,
                status: enriched.status || 'Đang hoạt động',
                province: db.extractProvince(enriched.address),
                autoExpand: true
              }],
              currentPage: 1,
              maxPage: 1,
              totalFound: 1
            };
          }
        } catch (e) {
          console.warn('[Auto-Enrich Incomplete DB Company Error]', e.message);
        }
      }

      // Priority 2: Ultra-fast Parallel Retrieval from VietQR + DoanhNghiep.biz (<400ms)
      const [vRes, bizRes] = await Promise.allSettled([
        this.getFromVietQR(q),
        this.getFromDoanhNghiepBiz(q)
      ]);
      const vCompany = vRes.status === 'fulfilled' ? vRes.value : null;
      const bizInfo = bizRes.status === 'fulfilled' ? bizRes.value : null;

      if ((vCompany && vCompany.name) || (bizInfo && (bizInfo.name || bizInfo.representative))) {
        const companyName = vCompany?.name || bizInfo?.name || `Doanh nghiệp MST ${q}`;
        const slug = `${q}-${this.slugify(companyName)}`;
        const enrichedData = {
          name: companyName,
          slug,
          url: `/mst/${slug}`,
          taxId: q,
          taxAddress: vCompany?.address || bizInfo?.address || '',
          address: bizInfo?.address || vCompany?.address || '',
          representative: bizInfo?.representative || vCompany?.representative || '',
          representativeNote: bizInfo?.representativeNote || vCompany?.representativeNote || '',
          phone: bizInfo?.phone || vCompany?.phone || '',
          startDate: bizInfo?.startDate || vCompany?.startDate || '',
          managedBy: (bizInfo?.managedBy && bizInfo.managedBy !== 'Cơ quan Thuế')
            ? bizInfo.managedBy
            : ((vCompany?.managedBy && vCompany.managedBy !== 'Cơ quan Thuế') ? vCompany.managedBy : 'Cơ quan Thuế'),
          status: bizInfo?.status || vCompany?.status || 'Đang hoạt động',
          isStatusActive: true,
          type: bizInfo?.type || vCompany?.type || 'Doanh nghiệp',
          mainIndustry: bizInfo?.mainIndustry || vCompany?.mainIndustry || db.detectIndustry(companyName),
          lastUpdated: new Date().toLocaleDateString('vi-VN'),
          industries: (vCompany?.industries?.length ? vCompany.industries : (bizInfo?.industries || []))
        };

        await db.saveCompany(enrichedData);
        const cleanSlug = slug.replace(/^\/?(mst\/)?/, '');
        const targetUrl = `/${cleanSlug}`;
        return {
          success: true,
          isDirect: true,
          directUrl: targetUrl,
          detail: enrichedData,
          items: [{
            name: enrichedData.name,
            url: targetUrl,
            taxId: enrichedData.taxId,
            representative: enrichedData.representative || '',
            address: enrichedData.address,
            status: enrichedData.status || 'Đang hoạt động',
            province: db.extractProvince(enrichedData.address),
            autoExpand: true
          }],
          currentPage: 1,
          maxPage: 1,
          totalFound: 1
        };
      }
    }

    // 2. Search in Indexed Database (Turso Cloud / SQLite) - Super fast!
    const dbItems = await db.searchCompanies(q, 20);
    const qSlug = this.slugify(q);
    const directNameMatches = (dbItems || []).filter(item => {
      const nSlug = this.slugify(item.name || '');
      return nSlug.includes(qSlug);
    });

    // If we have solid company name matches in DB (at least 2), return immediately (<30ms)!
    if (directNameMatches.length >= 2) {
      return {
        success: true,
        isDirect: dbItems.length === 1,
        fromDb: true,
        items: dbItems,
        currentPage: 1,
        maxPage: 1,
        totalFound: dbItems.length
      };
    }

    // Smart query normalization:
    // Expand abbreviation: 'cty ' -> 'công ty '
    let effectiveQ = q.replace(/^cty\s+/i, 'công ty ');
    if (!/^\d+$/.test(effectiveQ) && effectiveQ.length < 5) {
      effectiveQ = `công ty ${effectiveQ}`;
    }

    const cacheKey = `search:${type}:${effectiveQ}:${page}`;
    const cached = this.getCache(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    // --- Priority 0: Vietnam VPS Bridge (Domestic VN IP, Zero Block, Real-time) ---
    // If VN_BRIDGE_URL is configured (Render Server), IMMEDIATELY query VPS bridge!
    // Never let Render hang 15-30s attempting to scrape masothue.com directly from foreign US IP!
    if (process.env.VN_BRIDGE_URL) {
      const vnResult = await this.searchViaVnBridge(effectiveQ);
      if (vnResult && vnResult.items && vnResult.items.length > 0) {
        if (dbItems && dbItems.length > 0) {
          const seenTax = new Set(vnResult.items.map(i => i.taxId));
          for (const item of dbItems) {
            if (!seenTax.has(item.taxId)) {
              vnResult.items.push(item);
              seenTax.add(item.taxId);
            }
          }
          vnResult.totalFound = vnResult.items.length;
        }
        this.setCache(cacheKey, vnResult);
        return vnResult;
      }

      // Fast-Path for Render: If VN Bridge found nothing, do NOT spend 20s running US scrapers
      if (dbItems && dbItems.length > 0) {
        return {
          success: true,
          isDirect: dbItems.length === 1,
          fromDb: true,
          items: dbItems,
          currentPage: 1,
          maxPage: 1,
          totalFound: dbItems.length
        };
      }

      return {
        success: false,
        message: 'Không tìm thấy doanh nghiệp phù hợp. Bạn hãy thử nhập chính xác Mã Số Thuế (10 chữ số) hoặc tên đầy đủ hơn.'
      };
    }

    // 3. Search Masothue using stealth gotScraping (Runs on VPS with domestic VN IP)
    let token = await this.ensureSession();

    let ajaxData = null;
    if (token) {
      const searchBody = new URLSearchParams({
        q: effectiveQ,
        type: type || 'auto',
        token,
        'force-search': '1'
      });

      try {
        const searchHeaders = {
          'referer': `${this.baseUrl}/`,
          'origin': this.baseUrl,
          'x-requested-with': 'XMLHttpRequest',
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
        };
        if (this.sessionCookie) {
          searchHeaders['cookie'] = this.sessionCookie;
        }

        let ajaxRes = await gotScraping.post(`${this.baseUrl}/Ajax/Search`, {
          headers: searchHeaders,
          body: searchBody.toString(),
          timeout: { request: 3000 }
        });

        if (ajaxRes.body && ajaxRes.body.trim().startsWith('<')) {
          // Cloudflare temporary challenge page, don't crash JSON.parse
          ajaxData = null;
        } else {
          try {
            ajaxData = JSON.parse(ajaxRes.body);
          } catch (e) {
            ajaxData = null;
          }
        }

        // If expired token (success !== 1), retry once
        if (!ajaxData || ajaxData.success !== 1) {
          token = await this.ensureSession(true);
          if (token) {
            searchBody.set('token', token);
            const retryHeaders = {
              'referer': `${this.baseUrl}/`,
              'origin': this.baseUrl,
              'x-requested-with': 'XMLHttpRequest',
              'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
            };
            if (this.sessionCookie) {
              retryHeaders['cookie'] = this.sessionCookie;
            }
            ajaxRes = await gotScraping.post(`${this.baseUrl}/Ajax/Search`, {
              headers: retryHeaders,
              body: searchBody.toString(),
              timeout: { request: 3000 }
            });
            if (ajaxRes.body && !ajaxRes.body.trim().startsWith('<')) {
              try {
                ajaxData = JSON.parse(ajaxRes.body);
              } catch (e) {
                ajaxData = null;
              }
            }
          }
        }
      } catch (err) {
        // Suppress expected rate-limit warnings
      }
    }

    // Direct match from Masothue (Redirects straight to company detail page)
    if (ajaxData && ajaxData.url && ajaxData.url !== '/') {
      const detail = await this.getDetail(ajaxData.url);
      const result = {
        success: true,
        isDirect: true,
        directUrl: ajaxData.url,
        detail: detail.success ? detail.data : null,
        items: detail.success ? [{
          name: detail.data.name,
          url: ajaxData.url,
          taxId: detail.data.taxId,
          representative: detail.data.representative,
          address: detail.data.address || detail.data.taxAddress,
          autoExpand: true
        }] : [],
        currentPage: 1,
        maxPage: 1
      };
      this.setCache(cacheKey, result);
      return result;
    }

    // Multiple matches from Masothue -> fetch HTML search list
    if (ajaxData && ajaxData.success === 1 && token) {
      try {
        const searchUrl = `${this.baseUrl}/Search/?q=${encodeURIComponent(effectiveQ)}&type=${type || 'auto'}&token=${token}&force-search=1${page > 1 ? `&page=${page}` : ''}`;

        const searchListHeaders = {
          'referer': `${this.baseUrl}/`
        };
        if (this.sessionCookie) {
          searchListHeaders['cookie'] = this.sessionCookie;
        }

        const pageRes = await gotScraping({
          url: searchUrl,
          headers: searchListHeaders,
          timeout: { request: 3000 }
        });

        const $ = cheerio.load(pageRes.body);

        const items = [];
        $('div.tax-listing > div').each((_, el) => {
          const $el = $(el);
          const titleLink = $el.find('h3 a');
          const name = titleLink.text().trim();
          const url = titleLink.attr('href') || $el.attr('data-prefetch');
          if (!name || !url) return;

          let taxId = '';
          const taxMatch = $el.html().match(/Mã số thuế:[^<]*<a[^>]*>([^<]+)<\/a>/i);
          if (taxMatch) taxId = taxMatch[1].trim();

          let representative = '';
          const repMatch = $el.html().match(/Người đại diện:[^<]*<em><a[^>]*>([^<]+)<\/a><\/em>/i);
          if (repMatch) representative = repMatch[1].trim();

          const address = $el.find('address').text().replace(/\s+/g, ' ').trim();

          items.push({ name, url, taxId, representative, address });
        });

        if (items.length > 0) {
          const totalPages = [1];
          $('ul.page-numbers li a.page-numbers').each((_, el) => {
            const p = parseInt($(el).text().trim(), 10);
            if (!isNaN(p)) totalPages.push(p);
          });
          const maxPage = Math.max(...totalPages);

          const result = {
            success: true,
            isDirect: false,
            items,
            currentPage: page,
            maxPage,
            totalFound: items.length
          };
          this.setCache(cacheKey, result);
          return result;
        }
      } catch (err) {
        console.warn('[Crawler] gotScraping search list error:', err.message);
      }
    }

    // --- Priority 1: Tavily AI Search (1,000 Free searches/month forever, No Credit Card) ---
    const tavilyResult = await this.searchViaTavily(effectiveQ);
    if (tavilyResult && tavilyResult.items && tavilyResult.items.length > 0) {
      if (dbItems && dbItems.length > 0) {
        const seenTax = new Set(tavilyResult.items.map(i => i.taxId));
        for (const item of dbItems) {
          if (!seenTax.has(item.taxId)) {
            tavilyResult.items.push(item);
            seenTax.add(item.taxId);
          }
        }
        tavilyResult.totalFound = tavilyResult.items.length;
      }
      this.setCache(cacheKey, tavilyResult);
      return tavilyResult;
    }

    // --- Priority 2: Yahoo Search Fallback (100% Free Forever, Unlimited, No API Key) ---
    const yahooResult = await this.searchViaYahoo(effectiveQ);
    if (yahooResult && yahooResult.items && yahooResult.items.length > 0) {
      if (dbItems && dbItems.length > 0) {
        const seenTax = new Set(yahooResult.items.map(i => i.taxId));
        for (const item of dbItems) {
          if (!seenTax.has(item.taxId)) {
            yahooResult.items.push(item);
            seenTax.add(item.taxId);
          }
        }
        yahooResult.totalFound = yahooResult.items.length;
      }
      this.setCache(cacheKey, yahooResult);
      return yahooResult;
    }

    // --- Priority 3: Serper.dev Google API (2,500 Free searches) ---
    const serperResult = await this.searchViaSerper(effectiveQ);
    if (serperResult && serperResult.items && serperResult.items.length > 0) {
      if (dbItems && dbItems.length > 0) {
        const seenTax = new Set(serperResult.items.map(i => i.taxId));
        for (const item of dbItems) {
          if (!seenTax.has(item.taxId)) {
            serperResult.items.push(item);
            seenTax.add(item.taxId);
          }
        }
        serperResult.totalFound = serperResult.items.length;
      }
      this.setCache(cacheKey, serperResult);
      return serperResult;
    }

    // --- Priority 3: Google Custom Search API (If older project with access) ---
    const googleResult = await this.searchViaGoogle(effectiveQ);
    if (googleResult && googleResult.items && googleResult.items.length > 0) {
      if (dbItems && dbItems.length > 0) {
        const seenTax = new Set(googleResult.items.map(i => i.taxId));
        for (const item of dbItems) {
          if (!seenTax.has(item.taxId)) {
            googleResult.items.push(item);
            seenTax.add(item.taxId);
          }
        }
        googleResult.totalFound = googleResult.items.length;
      }
      this.setCache(cacheKey, googleResult);
      return googleResult;
    }

    // --- Priority 4: Brave Search API ---
    const braveResult = await this.searchViaBrave(effectiveQ);
    if (braveResult && braveResult.items && braveResult.items.length > 0) {
      this.setCache(cacheKey, braveResult);
      return braveResult;
    }

    // --- Fallback 5: DuckDuckGo Web Search (100% Free, for local / residential IPs) ---
    const ddgResult = await this.searchViaDuckDuckGo(effectiveQ);
    if (ddgResult && ddgResult.items && ddgResult.items.length > 0) {
      this.setCache(cacheKey, ddgResult);
      return ddgResult;
    }

    // --- FALLBACK 6: If query contains tax digits, try VietQR ---
    const cleanTaxDigits = q.replace(/\D/g, '');
    if (cleanTaxDigits.length >= 10) {
      const vFallback = await this.getFromVietQR(cleanTaxDigits.slice(0, 10));
      if (vFallback && vFallback.taxId && vFallback.name) {
        await db.saveCompany(vFallback);
        return {
          success: true,
          isDirect: true,
          directUrl: vFallback.url,
          detail: vFallback,
          items: [{
            name: vFallback.name,
            url: vFallback.url,
            taxId: vFallback.taxId,
            representative: vFallback.representative,
            address: vFallback.address,
            autoExpand: true
          }],
          currentPage: 1,
          maxPage: 1
        };
      }
    }

    // --- FALLBACK 7: Return DB representative matches if external search found nothing ---
    if (dbItems && dbItems.length > 0) {
      return {
        success: true,
        isDirect: false,
        fromDb: true,
        items: dbItems,
        currentPage: 1,
        maxPage: 1,
        totalFound: dbItems.length
      };
    }

    return {
      success: false,
      message: 'Không tìm thấy doanh nghiệp phù hợp. Bạn hãy thử nhập chính xác Mã Số Thuế (10 chữ số) hoặc tên đầy đủ hơn.'
    };
  }

  async getDetail(path, forceFresh = false) {
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    const cacheKey = `detail:${cleanPath}`;
    const cached = this.getCache(cacheKey);
    if (cached && !forceFresh) {
      return { success: true, data: cached, fromCache: true };
    }

    const taxMatch = cleanPath.match(/(\d{10}(-\d{3})?)/);
    let existingInDb = null;
    if (taxMatch) {
      existingInDb = (await db.getCompanyByTaxId(taxMatch[1])) || (await db.getCompanyBySlug(cleanPath));
      if (!forceFresh && existingInDb && existingInDb.data) {
        // If it already has representative or phone or specific tax office, serve instantly from DB!
        if (existingInDb.representative || existingInDb.data.representative || existingInDb.data.phone || (existingInDb.data.managedBy && existingInDb.data.managedBy !== 'Cơ quan Thuế')) {
          return { success: true, data: existingInDb.data, fromDb: true };
        }
      }
    }

    // --- Priority 0: Vietnam VPS Bridge (Domestic VN IP, Zero Block, Real-time) ---
    // If VN_BRIDGE_URL is configured (Render Server), IMMEDIATELY query VPS bridge!
    // Never let Render hang 15-30s attempting to fetch masothue.com directly from foreign US IP!
    if (process.env.VN_BRIDGE_URL) {
      const vnDetail = await this.getDetailViaVnBridge(cleanPath);
      if (vnDetail && vnDetail.success && vnDetail.data) {
        await db.saveCompany(vnDetail.data);
        return vnDetail;
      }
    }

    // Always strip '/mst/' when requesting masothue.com
    const rawMasothuePath = cleanPath.replace(/^\/?(mst\/)?/, '/');
    const url = this.baseUrl + rawMasothuePath;

    try {
      const detailHeaders = {
        'referer': `${this.baseUrl}/`
      };
      if (this.sessionCookie) {
        detailHeaders['cookie'] = this.sessionCookie;
      }

      const res = await gotScraping({
        url,
        headers: detailHeaders,
        timeout: { request: 3000 }
      });

      if (res.statusCode !== 200) {
        if (existingInDb && existingInDb.data && (existingInDb.representative || existingInDb.data.representative)) {
          return { success: true, data: existingInDb.data, fromDb: true };
        }
        if (taxMatch) {
          // Priority fallback: Ultra-fast parallel DoanhNghiepBiz + VietQR (<350ms)
          const [bizRes, vRes] = await Promise.allSettled([
            this.getFromDoanhNghiepBiz(taxMatch[1]),
            this.getFromVietQR(taxMatch[1])
          ]);
          const bizData = bizRes.status === 'fulfilled' ? bizRes.value : null;
          const vCompany = vRes.status === 'fulfilled' ? vRes.value : null;
          if (bizData || vCompany) {
            const finalCompany = {
              name: vCompany?.name || bizData?.name || '',
              slug: cleanPath.replace(/^\//, ''),
              url: cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath,
              taxId: taxMatch[1],
              taxAddress: vCompany?.address || bizData?.address || '',
              address: bizData?.address || vCompany?.address || '',
              status: vCompany?.status || bizData?.status || 'Đang hoạt động',
              isStatusActive: (vCompany?.status || bizData?.status || '').toLowerCase().includes('đang hoạt động'),
              internationalName: vCompany?.internationalName || '',
              shortName: bizData?.shortName || vCompany?.shortName || '',
              representative: bizData?.representative || '',
              representativeNote: '',
              phone: bizData?.phone || '',
              startDate: bizData?.startDate || '',
              managedBy: vCompany?.managedBy || 'Cơ quan Thuế',
              type: bizData?.type || 'Doanh nghiệp',
              mainIndustry: vCompany?.mainIndustry || bizData?.mainIndustry || '',
              lastUpdated: new Date().toLocaleDateString('vi-VN'),
              industries: vCompany?.industries || []
            };
            await db.saveCompany(finalCompany);
            return { success: true, data: finalCompany };
          }
        }
        return { success: false, message: `Không thể tải thông tin doanh nghiệp (HTTP ${res.statusCode}).` };
      }

      const $ = cheerio.load(res.body);

      const name = $('table.table-taxinfo thead th[itemprop="name"]').text().trim() || $('h1').first().text().trim();
      if (!name) {
        if (existingInDb && existingInDb.data && (existingInDb.representative || existingInDb.data.representative)) {
          return { success: true, data: existingInDb.data, fromDb: true };
        }
        if (taxMatch) {
          const [bizRes, vRes] = await Promise.allSettled([
            this.getFromDoanhNghiepBiz(taxMatch[1]),
            this.getFromVietQR(taxMatch[1])
          ]);
          const bizData = bizRes.status === 'fulfilled' ? bizRes.value : null;
          const vCompany = vRes.status === 'fulfilled' ? vRes.value : null;
          if (bizData || vCompany) {
            const finalCompany = {
              name: vCompany?.name || bizData?.name || '',
              slug: cleanPath.replace(/^\//, ''),
              url: cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath,
              taxId: taxMatch[1],
              taxAddress: vCompany?.address || bizData?.address || '',
              address: bizData?.address || vCompany?.address || '',
              status: vCompany?.status || bizData?.status || 'Đang hoạt động',
              isStatusActive: (vCompany?.status || bizData?.status || '').toLowerCase().includes('đang hoạt động'),
              internationalName: vCompany?.internationalName || '',
              shortName: bizData?.shortName || vCompany?.shortName || '',
              representative: bizData?.representative || '',
              representativeNote: '',
              phone: bizData?.phone || '',
              startDate: bizData?.startDate || '',
              managedBy: vCompany?.managedBy || 'Cơ quan Thuế',
              type: bizData?.type || 'Doanh nghiệp',
              mainIndustry: vCompany?.mainIndustry || bizData?.mainIndustry || '',
              lastUpdated: new Date().toLocaleDateString('vi-VN'),
              industries: vCompany?.industries || []
            };
            await db.saveCompany(finalCompany);
            return { success: true, data: finalCompany };
          }
        }
        return { success: false, message: 'Không tìm thấy thông tin doanh nghiệp này.' };
      }

      const info = {
        name,
        url: cleanPath,
        taxId: '',
        taxAddress: '',
        address: '',
        status: '',
        isStatusActive: true,
        internationalName: '',
        shortName: '',
        representative: '',
        representativeNote: '',
        phone: '',
        startDate: '',
        managedBy: '',
        type: '',
        mainIndustry: '',
        lastUpdated: '',
        industries: []
      };

      $('table.table-taxinfo tbody tr').each((_, tr) => {
        const $tr = $(tr);
        const key = $tr.find('td').first().text().replace(/\s+/g, ' ').trim();
        const valTd = $tr.find('td').last();

        valTd.find('button').remove();
        const textVal = valTd.text().replace(/\s+/g, ' ').trim();

        if (key.includes('Mã số thuế')) {
          info.taxId = textVal;
        } else if (key.includes('Địa chỉ Thuế')) {
          info.taxAddress = textVal;
        } else if (key.includes('Địa chỉ')) {
          info.address = textVal;
        } else if (key.includes('Tình trạng')) {
          info.status = textVal;
          info.isStatusActive = textVal.toLowerCase().includes('đang hoạt động');
        } else if (key.includes('Tên quốc tế')) {
          info.internationalName = textVal;
        } else if (key.includes('Tên viết tắt')) {
          info.shortName = textVal;
        } else if (key.includes('Người đại diện')) {
          const repName = valTd.find('span[itemprop="name"]').text().trim() || textVal;
          info.representative = repName;
          if (textVal.includes('Ngoài ra')) {
            const parts = textVal.split('Ngoài ra');
            info.representativeNote = ('Ngoài ra' + parts.slice(1).join('Ngoài ra')).trim();
          }
        } else if (key.includes('Điện thoại')) {
          info.phone = textVal.replace(/Ẩn số điện thoại/i, '').replace(/Hiện số điện thoại/i, '').trim();
        } else if (key.includes('Ngày hoạt động')) {
          info.startDate = textVal;
        } else if (key.includes('Quản lý bởi')) {
          info.managedBy = textVal;
        } else if (key.includes('Loại hình DN')) {
          info.type = textVal;
        } else if (key.includes('Ngành nghề chính')) {
          info.mainIndustry = textVal;
        } else if (textVal.includes('Cập nhật mã số thuế')) {
          info.lastUpdated = textVal;
        }
      });

      $('table.table tbody tr').each((_, tr) => {
        const $tr = $(tr);
        const code = $tr.find('td').first().text().trim();
        const nameTd = $tr.find('td').last();
        const rawText = nameTd.text().replace(/\s+/g, ' ').trim();
        if (code && rawText) {
          info.industries.push({ code, name: rawText });
        }
      });

      // Enrich from DoanhNghiepBiz if representative or phone is missing from Masothue
      if (taxMatch && (!info.representative || !info.phone)) {
        try {
          const bizData = await this.getFromDoanhNghiepBiz(taxMatch[1]);
          if (bizData) {
            if (!info.representative && bizData.representative) info.representative = bizData.representative;
            if (!info.phone && bizData.phone) info.phone = bizData.phone;
            if (!info.startDate && bizData.startDate) info.startDate = bizData.startDate;
            if (!info.type && bizData.type) info.type = bizData.type;
          }
        } catch (e) {}
      }

      this.setCache(cacheKey, info);
      return { success: true, data: info };
    } catch (err) {
      console.warn('[Crawler] getDetail error:', err.message);
      if (existingInDb && existingInDb.data && (existingInDb.representative || existingInDb.data.representative)) {
        return { success: true, data: existingInDb.data, fromDb: true };
      }
      if (taxMatch) {
        const bizData = await this.getFromDoanhNghiepBiz(taxMatch[1]);
        const vCompany = await this.getFromVietQR(taxMatch[1]);
        if (bizData || vCompany) {
          const finalCompany = {
            name: vCompany?.name || bizData?.name || '',
            slug: cleanPath.replace(/^\//, ''),
            url: cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath,
            taxId: taxMatch[1],
            taxAddress: vCompany?.address || bizData?.address || '',
            address: bizData?.address || vCompany?.address || '',
            status: vCompany?.status || bizData?.status || 'Đang hoạt động',
            isStatusActive: (vCompany?.status || bizData?.status || '').toLowerCase().includes('đang hoạt động'),
            internationalName: vCompany?.internationalName || '',
            shortName: bizData?.shortName || vCompany?.shortName || '',
            representative: bizData?.representative || '',
            representativeNote: '',
            phone: bizData?.phone || '',
            startDate: bizData?.startDate || '',
            managedBy: vCompany?.managedBy || 'Cơ quan Thuế',
            type: bizData?.type || 'Doanh nghiệp',
            mainIndustry: vCompany?.mainIndustry || bizData?.mainIndustry || '',
            lastUpdated: new Date().toLocaleDateString('vi-VN'),
            industries: vCompany?.industries || []
          };
          await db.saveCompany(finalCompany);
          return { success: true, data: finalCompany };
        }
      }
      return { success: false, message: 'Lỗi kết nối khi tải chi tiết doanh nghiệp.' };
    }
  }
}
