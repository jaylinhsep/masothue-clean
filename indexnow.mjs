import fs from 'fs';
import path from 'path';

export class IndexNowService {
  constructor(options = {}) {
    this.key = options.key || process.env.INDEXNOW_KEY || '4d8b671a53e944f2b988f01b7a2d3e5a';
    this.host = options.host || process.env.INDEXNOW_HOST || 'mst0.com';
    this.keyLocation = `https://${this.host}/${this.key}.txt`;
    this.queue = new Set();
    this.timer = null;
    this.batchDelayMs = options.batchDelayMs || 15000; // Debounce 15s
    this.maxBatchSize = options.maxBatchSize || 100;
    this.history = [];
    this.totalSubmitted = 0;
    this.lastSubmitted = null;
    this.enabled = process.env.INDEXNOW_ENABLED !== 'false';
  }

  // Add a URL to queue
  queueUrl(url) {
    if (!this.enabled || !url) return;
    let fullUrl = url;
    if (!fullUrl.startsWith('http')) {
      fullUrl = `https://${this.host}/${url.replace(/^\/+/, '')}`;
    }
    this.queue.add(fullUrl);

    // If queue is full, flush immediately
    if (this.queue.size >= this.maxBatchSize) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.batchDelayMs);
    }
  }

  // Convenience helper for company slug
  queueCompany(slug) {
    if (!slug) return;
    const clean = slug.replace(/^\/?(mst\/)?/, '');
    this.queueUrl(`https://${this.host}/${clean}`);
  }

  // Flush queued URLs to IndexNow
  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.queue.size === 0) return;

    const urls = Array.from(this.queue).slice(0, this.maxBatchSize);
    for (const u of urls) {
      this.queue.delete(u);
    }

    await this.submitUrls(urls);
  }

  // Direct submission of URLs
  async submitUrls(urls = []) {
    if (!urls || urls.length === 0) return { success: false, count: 0, message: 'Danh sách URL trống' };

    const payload = {
      host: this.host,
      key: this.key,
      keyLocation: this.keyLocation,
      urlList: urls
    };

    const record = {
      timestamp: new Date().toISOString(),
      count: urls.length,
      sampleUrls: urls.slice(0, 3),
      status: 'pending'
    };

    try {
      // IndexNow API standard endpoint (Bing & all search engines share this)
      const res = await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify(payload)
      });

      // 200 = Success, 202 = Accepted
      const isOk = res.status === 200 || res.status === 202;
      record.statusCode = res.status;
      record.status = isOk ? 'success' : 'failed';
      
      let resText = '';
      try { resText = await res.text(); } catch (e) {}
      record.response = resText || (isOk ? 'Accepted' : `HTTP ${res.status}`);

      if (isOk) {
        this.totalSubmitted += urls.length;
        this.lastSubmitted = record.timestamp;
        console.log(`[IndexNow] Đã gửi ${urls.length} URLs tới api.indexnow.org (Status: ${res.status})`);
      } else {
        console.warn(`[IndexNow] Gửi ${urls.length} URLs thất bại (Status: ${res.status}): ${resText}`);
      }

      this.history.unshift(record);
      if (this.history.length > 50) this.history.pop();

      return { success: isOk, statusCode: res.status, count: urls.length, record };
    } catch (err) {
      record.status = 'error';
      record.error = err.message;
      this.history.unshift(record);
      if (this.history.length > 50) this.history.pop();
      console.error('[IndexNow] Lỗi kết nối:', err.message);
      return { success: false, error: err.message, count: urls.length };
    }
  }

  // Submit top recent companies from database
  async submitRecentFromDb(db, limit = 50) {
    if (!db) return { success: false, message: 'Database không sẵn sàng' };
    const recent = await db.getRecentCompanies(limit);
    if (!recent || recent.length === 0) return { success: false, message: 'Chưa có công ty nào trong DB' };

    const urls = [
      `https://${this.host}/tinh-thanh`,
      `https://${this.host}/nganh-nghe`,
      `https://${this.host}/doanh-nghiep-moi`,
      ...recent.map(r => `https://${this.host}/${r.slug.replace(/^\/?(mst\/)?/, '')}`)
    ];

    return await this.submitUrls(urls);
  }

  // Ping Google and Bing sitemaps
  async pingSitemaps() {
    const sitemapUrl = `https://${this.host}/sitemap.xml`;
    const results = {};

    try {
      const gRes = await fetch(`https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`);
      results.google = { status: gRes.status };
    } catch (e) {
      results.google = { error: e.message };
    }

    try {
      const bRes = await fetch(`https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`);
      results.bing = { status: bRes.status };
    } catch (e) {
      results.bing = { error: e.message };
    }

    return results;
  }

  getStatus() {
    return {
      enabled: this.enabled,
      host: this.host,
      key: this.key,
      keyLocation: this.keyLocation,
      queueSize: this.queue.size,
      totalSubmitted: this.totalSubmitted,
      lastSubmitted: this.lastSubmitted,
      recentBatches: this.history.slice(0, 10)
    };
  }
}

export const indexNowService = new IndexNowService();
