import * as cheerio from 'cheerio';

export class MasothueCrawler {
  constructor() {
    this.baseUrl = 'https://masothue.com';
    this.cookies = new Map([
      ['hm', '1'],
      ['res', '1920x1080']
    ]);
    this.token = null;
    this.tokenTime = 0;
    // In-memory cache for search & details (15 minutes TTL)
    this.cache = new Map();
    this.cacheTtl = 15 * 60 * 1000;
  }

  getCookieHeader() {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  updateCookiesFromHeaders(headers) {
    const setCookie = headers.getSetCookie ? headers.getSetCookie() : [headers.get('set-cookie')].filter(Boolean);
    for (const cookieStr of setCookie) {
      if (!cookieStr) continue;
      const parts = cookieStr.split(';')[0].split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim();
        this.cookies.set(key, val);
      }
    }
  }

  async ensureSession(forceFresh = false) {
    if (!forceFresh && this.token && (Date.now() - this.tokenTime < 10 * 60 * 1000)) {
      return this.token;
    }

    // Step 1: Hit homepage to get initial cookies
    const homeRes = await fetch(this.baseUrl + '/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': this.getCookieHeader()
      }
    });
    this.updateCookiesFromHeaders(homeRes.headers);

    // Step 2: Fetch token
    const tokenRes = await fetch(this.baseUrl + '/Ajax/Token', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': this.getCookieHeader(),
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': this.baseUrl + '/'
      },
      body: 'r=' + Math.random().toString(36).substring(7)
    });
    this.updateCookiesFromHeaders(tokenRes.headers);

    const tokenData = await tokenRes.json();
    if (tokenData && tokenData.success && tokenData.token) {
      this.token = tokenData.token;
      this.tokenTime = Date.now();
      return this.token;
    }
    throw new Error('Không thể lấy session token từ masothue.com');
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
    // Clean old cache entries if > 500
    if (this.cache.size > 500) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
  }

  async search(query, type = 'auto', page = 1) {
    const q = query ? query.trim() : '';
    if (!q) {
      return { success: false, message: 'Vui lòng nhập từ khóa tìm kiếm (Tên công ty, MST, người đại diện)' };
    }

    // Smart query normalization:
    // 1. Expand abbreviation: 'cty ' -> 'công ty '
    let effectiveQ = q.replace(/^cty\s+/i, 'công ty ');
    // 2. If short keyword (< 5 chars) and not purely digits, prepend 'công ty ' to satisfy masothue minimum length
    const isPureDigits = /^\d+$/.test(effectiveQ);
    if (!isPureDigits && effectiveQ.length < 5) {
      effectiveQ = `công ty ${effectiveQ}`;
    }

    const cacheKey = `search:${type}:${effectiveQ}:${page}`;
    const cached = this.getCache(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    let token = await this.ensureSession();

    // Call POST /Ajax/Search
    const searchBody = new URLSearchParams({
      q: effectiveQ,
      type: type || 'auto',
      token,
      'force-search': '1'
    });

    let ajaxRes = await fetch(this.baseUrl + '/Ajax/Search', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': this.getCookieHeader(),
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': this.baseUrl + '/'
      },
      body: searchBody.toString()
    });

    // If failed, try refreshing token once
    let ajaxData = await ajaxRes.json().catch(() => null);
    if (!ajaxData || ajaxData.url === '/') {
      token = await this.ensureSession(true);
      searchBody.set('token', token);
      ajaxRes = await fetch(this.baseUrl + '/Ajax/Search', {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Cookie': this.getCookieHeader(),
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': this.baseUrl + '/'
        },
        body: searchBody.toString()
      });
      ajaxData = await ajaxRes.json().catch(() => null);
    }

    this.updateCookiesFromHeaders(ajaxRes.headers);

    if (!ajaxData || ajaxData.success === 0) {
      return {
        success: false,
        message: ajaxData?.message || 'Không tìm thấy kết quả hoặc từ khóa cần ít nhất 5 ký tự.'
      };
    }

    // Direct match (Redirects straight to company detail page)
    if (ajaxData.url && ajaxData.url !== '/') {
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

    // Multiple matches -> fetch HTML search list
    const searchUrl = new URL(this.baseUrl + '/Search/');
    searchUrl.searchParams.set('q', effectiveQ);
    searchUrl.searchParams.set('type', type);
    searchUrl.searchParams.set('token', token);
    searchUrl.searchParams.set('force-search', '1');
    if (page > 1) {
      searchUrl.searchParams.set('page', page.toString());
    }

    const pageRes = await fetch(searchUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': this.getCookieHeader(),
        'Referer': this.baseUrl + '/'
      }
    });
    this.updateCookiesFromHeaders(pageRes.headers);

    const html = await pageRes.text();
    const $ = cheerio.load(html);

    const items = [];
    $('div.tax-listing > div').each((_, el) => {
      const $el = $(el);
      const titleLink = $el.find('h3 a');
      const name = titleLink.text().trim();
      const url = titleLink.attr('href') || $el.attr('data-prefetch');
      if (!name || !url) return;

      // Extract MST
      let taxId = '';
      const taxMatch = $el.html().match(/Mã số thuế:[^<]*<a[^>]*>([^<]+)<\/a>/i);
      if (taxMatch) {
        taxId = taxMatch[1].trim();
      }

      // Extract Representative
      let representative = '';
      const repMatch = $el.html().match(/Người đại diện:[^<]*<em><a[^>]*>([^<]+)<\/a><\/em>/i);
      if (repMatch) {
        representative = repMatch[1].trim();
      }

      // Extract Address
      const address = $el.find('address').text().replace(/\s+/g, ' ').trim();

      items.push({
        name,
        url,
        taxId,
        representative,
        address
      });
    });

    // Detect max page from pagination
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

  async getDetail(path) {
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    const cacheKey = `detail:${cleanPath}`;
    const cached = this.getCache(cacheKey);
    if (cached) {
      return { success: true, data: cached, fromCache: true };
    }

    const url = this.baseUrl + cleanPath;
    await this.ensureSession();

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': this.getCookieHeader(),
        'Referer': this.baseUrl + '/'
      }
    });
    this.updateCookiesFromHeaders(res.headers);

    const html = await res.text();
    const $ = cheerio.load(html);

    const name = $('table.table-taxinfo thead th[itemprop="name"]').text().trim() || $('h1').first().text().trim();
    if (!name) {
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

      // Remove buttons
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

    // Industries list from table.table
    $('table.table tbody tr').each((_, tr) => {
      const $tr = $(tr);
      const code = $tr.find('td').first().text().trim();
      const nameTd = $tr.find('td').last();
      const rawText = nameTd.text().replace(/\s+/g, ' ').trim();
      if (code && rawText) {
        info.industries.push({
          code,
          name: rawText
        });
      }
    });

    this.setCache(cacheKey, info);
    return {
      success: true,
      data: info
    };
  }
}
