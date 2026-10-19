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
        body: 'r=' + Math.random().toString(36).substring(7)
      });

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
  async getFromVietQR(taxId) {
    const cleanId = (taxId || '').trim();
    if (!cleanId || !/^\d{10}(-\d{3})?$/.test(cleanId)) return null;

    try {
      const res = await fetch(`https://api.vietqr.io/v2/business/${encodeURIComponent(cleanId)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (!res.ok) return null;
      const json = await res.json();
      if (json && json.code === '00' && json.data) {
        const d = json.data;
        const slug = `${d.id}-${this.slugify(d.name)}`;
        const company = {
          name: d.name,
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
          mainIndustry: 'Kinh doanh tổng hợp',
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

      const data = await res.json();
      if (!data.items || data.items.length === 0) {
        return null;
      }

      const items = [];
      for (const item of data.items) {
        const link = item.link || '';
        const taxMatch = link.match(/(\d{10}(-\d{3})?)/);
        if (taxMatch) {
          const taxId = taxMatch[1];
          let cleanName = (item.title || '')
            .replace(/-\s*MaSoThue/i, '')
            .replace(/^\d{10}(-\d{3})?\s*-\s*/, '')
            .trim();

          let path = link.replace(/https?:\/\/(www\.)?masothue\.com/, '');
          if (!path.startsWith('/')) path = '/' + path;

          let address = '';
          if (item.snippet) {
            const snipParts = item.snippet.split(' - ');
            if (snipParts.length >= 2) {
              address = snipParts.slice(1).join(' - ').replace(/\s+/g, ' ').trim();
            } else {
              address = item.snippet.replace(/\s+/g, ' ').trim();
            }
          }

          items.push({
            name: cleanName,
            url: path,
            taxId,
            representative: '',
            address: address || 'Toàn quốc'
          });
        }
      }

      if (items.length === 0) return null;

      // Enhance the 1st match with official government data from VietQR & save to DB!
      try {
        const firstCompany = await this.getFromVietQR(items[0].taxId);
        if (firstCompany) {
          await db.saveCompany(firstCompany);
          items[0].name = firstCompany.name || items[0].name;
          items[0].address = firstCompany.address || items[0].address;
          items[0].representative = firstCompany.representative || '';
        }
      } catch (e) {}

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

  // --- Serper.dev (Free 2,500 Google Searches) Fallback ---
  async searchViaSerper(query) {
    const serperKey = process.env.SERPER_API_KEY || process.env.SERPER_KEY;
    if (!serperKey) return null;

    try {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': serperKey.trim(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          q: `site:masothue.com ${query.trim()}`,
          gl: 'vn',
          hl: 'vi',
          num: 10
        })
      });

      if (!res.ok) return null;
      const data = await res.json();
      if (!data.organic || data.organic.length === 0) return null;

      const items = [];
      for (const item of data.organic) {
        const link = item.link || '';
        const taxMatch = link.match(/(\d{10}(-\d{3})?)/);
        if (taxMatch) {
          const taxId = taxMatch[1];
          let cleanName = (item.title || '')
            .replace(/-\s*MaSoThue/i, '')
            .replace(/^\d{10}(-\d{3})?\s*-\s*/, '')
            .trim();

          let path = link.replace(/https?:\/\/(www\.)?masothue\.com/, '');
          if (!path.startsWith('/')) path = '/' + path;

          items.push({
            name: cleanName,
            url: path,
            taxId,
            representative: '',
            address: item.snippet || 'Toàn quốc'
          });
        }
      }

      if (items.length === 0) return null;

      try {
        const firstCompany = await this.getFromVietQR(items[0].taxId);
        if (firstCompany) {
          await db.saveCompany(firstCompany);
          items[0].name = firstCompany.name || items[0].name;
          items[0].address = firstCompany.address || items[0].address;
        }
      } catch (e) {}

      return {
        success: true,
        isDirect: items.length === 1,
        fromSerper: true,
        items,
        currentPage: 1,
        maxPage: 1,
        totalFound: items.length
      };
    } catch (e) {
      console.warn('[Serper Error]', e.message);
      return null;
    }
  }

  async search(query, type = 'auto', page = 1) {
    const q = query ? query.trim() : '';
    if (!q) {
      return { success: false, message: 'Vui lòng nhập từ khóa tìm kiếm (Tên công ty, MST, người đại diện)' };
    }

    // 1. Direct Tax Code check via VietQR API (Lightning-fast, cloud-friendly, zero captcha)
    const isPureDigits = /^\d{10}(-\d{3})?$/.test(q);
    if (isPureDigits) {
      const vCompany = await this.getFromVietQR(q);
      if (vCompany) {
        await db.saveCompany(vCompany);
        return {
          success: true,
          isDirect: true,
          directUrl: vCompany.url,
          detail: vCompany,
          items: [{
            name: vCompany.name,
            url: vCompany.url,
            taxId: vCompany.taxId,
            representative: vCompany.representative,
            address: vCompany.address,
            autoExpand: true
          }],
          currentPage: 1,
          maxPage: 1
        };
      }
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

    // 2. Search Masothue using stealth gotScraping (Bypasses Cloudflare JA3 TLS checks)
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
        let ajaxRes = await gotScraping.post(`${this.baseUrl}/Ajax/Search`, {
          headers: {
            'referer': `${this.baseUrl}/`,
            'origin': this.baseUrl,
            'x-requested-with': 'XMLHttpRequest',
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
          },
          body: searchBody.toString()
        });

        ajaxData = JSON.parse(ajaxRes.body);

        // If expired token, retry once
        if (!ajaxData || ajaxData.url === '/') {
          token = await this.ensureSession(true);
          if (token) {
            searchBody.set('token', token);
            ajaxRes = await gotScraping.post(`${this.baseUrl}/Ajax/Search`, {
              headers: {
                'referer': `${this.baseUrl}/`,
                'origin': this.baseUrl,
                'x-requested-with': 'XMLHttpRequest',
                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
              },
              body: searchBody.toString()
            });
            ajaxData = JSON.parse(ajaxRes.body);
          }
        }
      } catch (err) {
        console.warn('[Crawler] gotScraping Ajax/Search error:', err.message);
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

        const pageRes = await gotScraping({
          url: searchUrl,
          headers: {
            'referer': `${this.baseUrl}/`
          }
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

    // --- FALLBACK 1: Search in Indexed Database (Turso Cloud / SQLite) ---
    const dbItems = await db.searchCompanies(q, 20);
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

    // --- FALLBACK 2: Real-time Google Custom Search API ---
    const googleResult = await this.searchViaGoogle(effectiveQ);
    if (googleResult && googleResult.items && googleResult.items.length > 0) {
      this.setCache(cacheKey, googleResult);
      return googleResult;
    }

    // --- FALLBACK 3: Serper.dev Google Search API ---
    const serperResult = await this.searchViaSerper(effectiveQ);
    if (serperResult && serperResult.items && serperResult.items.length > 0) {
      this.setCache(cacheKey, serperResult);
      return serperResult;
    }

    // --- FALLBACK 4: If query contains tax digits, try VietQR ---
    const cleanTaxDigits = q.replace(/\D/g, '');
    if (cleanTaxDigits.length >= 10) {
      const vFallback = await this.getFromVietQR(cleanTaxDigits.slice(0, 10));
      if (vFallback) {
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

    return {
      success: false,
      message: 'Không tìm thấy doanh nghiệp phù hợp. Bạn hãy thử nhập chính xác Mã Số Thuế (10 chữ số) hoặc tên đầy đủ hơn.'
    };
  }

  async getDetail(path) {
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    const cacheKey = `detail:${cleanPath}`;
    const cached = this.getCache(cacheKey);
    if (cached) {
      return { success: true, data: cached, fromCache: true };
    }

    const taxMatch = cleanPath.match(/\/(\d{10}(-\d{3})?)/);
    if (taxMatch) {
      const existingInDb = await db.getCompanyByTaxId(taxMatch[1]);
      if (existingInDb && existingInDb.data) {
        return { success: true, data: existingInDb.data, fromDb: true };
      }
    }

    const url = this.baseUrl + cleanPath;

    try {
      const res = await gotScraping({
        url,
        headers: {
          'referer': `${this.baseUrl}/`
        }
      });

      if (res.statusCode !== 200) {
        if (taxMatch) {
          const vCompany = await this.getFromVietQR(taxMatch[1]);
          if (vCompany) {
            await db.saveCompany(vCompany);
            return { success: true, data: vCompany };
          }
        }
        return { success: false, message: `Không thể tải thông tin doanh nghiệp (HTTP ${res.statusCode}).` };
      }

      const $ = cheerio.load(res.body);

      const name = $('table.table-taxinfo thead th[itemprop="name"]').text().trim() || $('h1').first().text().trim();
      if (!name) {
        if (taxMatch) {
          const vCompany = await this.getFromVietQR(taxMatch[1]);
          if (vCompany) {
            await db.saveCompany(vCompany);
            return { success: true, data: vCompany };
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
          info.phone = textVal;
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

      this.setCache(cacheKey, info);
      return { success: true, data: info };
    } catch (err) {
      console.warn('[Crawler] getDetail error:', err.message);
      if (taxMatch) {
        const vCompany = await this.getFromVietQR(taxMatch[1]);
        if (vCompany) {
          await db.saveCompany(vCompany);
          return { success: true, data: vCompany };
        }
      }
      return { success: false, message: 'Lỗi kết nối khi tải chi tiết doanh nghiệp.' };
    }
  }
}
