import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { indexNowService } from './indexnow.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const LOCAL_DB_PATH = path.join(DATA_DIR, 'masothue.db');

export class Database {
  constructor() {
    this.client = null;
    this.isTurso = false;
  }

  async init() {
    // Ensure local data dir exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Auto-load .env if available
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = (m[2] || '').trim().replace(/^['"](.*)['"]$/, '$1');
        }
      }
    }

    let tursoUrl = process.env.TURSO_DATABASE_URL || process.env.TURSO_DATABA || process.env.TURSO_URL;
    let tursoToken = process.env.TURSO_AUTH_TOKEN || process.env.TURSO_TOKEN;

    // Auto-fix if token was accidentally set as URL
    if (tursoUrl && tursoUrl.startsWith('eyJ')) {
      if (!tursoToken) tursoToken = tursoUrl;
      tursoUrl = 'libsql://masothue-db-ravinpham.aws-ap-northeast-1.turso.io';
    }

    if (tursoUrl && tursoToken) {
      console.log(`[DB] Đang kết nối tới Turso Cloud 5GB: ${tursoUrl}`);
      this.client = createClient({
        url: tursoUrl,
        authToken: tursoToken
      });
      this.isTurso = true;
    } else {
      console.log(`[DB] Đang sử dụng SQLite cục bộ: file:${LOCAL_DB_PATH}`);
      this.client = createClient({
        url: `file:${LOCAL_DB_PATH}`
      });
      this.isTurso = false;
    }

    // Initialize Schema
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS companies (
        taxId TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        representative TEXT,
        address TEXT,
        status TEXT,
        province TEXT,
        type TEXT,
        phone TEXT,
        mainIndustry TEXT,
        data TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
    `);

    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);`);
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);`);
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_companies_rep ON companies(representative);`);
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_companies_province ON companies(province);`);
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_companies_industry ON companies(mainIndustry);`);
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_companies_updated ON companies(updatedAt DESC);`);

    console.log(`[DB] Khởi tạo cơ sở dữ liệu thành công (${this.isTurso ? 'Turso Cloud 5GB' : 'Local SQLite'})`);
    return this;
  }

  extractProvince(address) {
    if (!address) return 'Toàn Quốc';
    const clean = address.toLowerCase();
    if (clean.includes('hà nội') || clean.includes('ha noi')) return 'Hà Nội';
    if (clean.includes('hồ chí minh') || clean.includes('tp.hcm') || clean.includes('tp hcm') || clean.includes('sài gòn') || clean.includes('tphcm')) return 'TP Hồ Chí Minh';
    if (clean.includes('đà nẵng') || clean.includes('da nang')) return 'Đà Nẵng';
    if (clean.includes('hải phòng') || clean.includes('hai phong')) return 'Hải Phòng';
    if (clean.includes('cần thơ') || clean.includes('can tho')) return 'Cần Thơ';
    if (clean.includes('bình dương') || clean.includes('binh duong')) return 'Bình Dương';
    if (clean.includes('đồng nai') || clean.includes('dong nai')) return 'Đồng Nai';
    if (clean.includes('bà rịa') || clean.includes('vũng tàu')) return 'Bà Rịa - Vũng Tàu';
    
    // Check against all other 63 provinces
    for (const p of VIETNAM_PROVINCES) {
      if (clean.includes(p.name.toLowerCase())) return p.name;
    }
    return 'Toàn Quốc';
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

  detectIndustry(name, existingIndustry = '') {
    if (existingIndustry && existingIndustry !== 'Kinh doanh tổng hợp' && existingIndustry.trim().length > 3) {
      return existingIndustry.trim();
    }
    if (!name) return 'Hoạt động kinh doanh thương mại và dịch vụ tổng hợp (Mã: 4690)';
    
    const n = name.toLowerCase();

    // Mapping patterns according to Vietnam Standard Industrial Classification (VSIC)
    if (/\b(bất động sản|địa ốc|land|homes|bds|real estate|nhà đất)\b/.test(n)) {
      return 'Kinh doanh bất động sản, quyền sử dụng đất thuộc chủ sở hữu hoặc đi thuê (Mã: 6810)';
    }
    if (/\b(xây dựng|cons|construction|xây lắp|bê tông|thi công|san lấp)\b/.test(n)) {
      return 'Xây dựng nhà các loại & công trình kỹ thuật dân dụng (Mã: 4100)';
    }
    if (/\b(vận tải|logistics|kho vận|vận chuyển|giao nhận|chuyển phát|container)\b/.test(n)) {
      return 'Vận tải hàng hóa bằng đường bộ, kho bãi và logistics (Mã: 4933)';
    }
    if (/\b(công nghệ|phần mềm|tin học|software|it|tech|digital|lập trình)\b/.test(n)) {
      return 'Lập trình máy vi tính, tư vấn và dịch vụ công nghệ thông tin (Mã: 6201)';
    }
    if (/\b(dược|dược phẩm|thuốc|pharma|medical|thiết bị y tế|y tế|phòng khám|bệnh viện)\b/.test(n)) {
      return 'Bán buôn dược phẩm, dụng cụ và thiết bị y tế (Mã: 4646)';
    }
    if (/\b(thực phẩm|food|bánh kẹo|nước giải khát|đồ uống|chế biến thực phẩm)\b/.test(n)) {
      return 'Chế biến, bảo quản và bán buôn thực phẩm, đồ uống (Mã: 1079)';
    }
    if (/\b(thủy sản|thuỷ sản|hải sản|seafood|tôm|cá|thủy hải sản)\b/.test(n)) {
      return 'Chế biến, bảo quản và nuôi trồng thủy sản (Mã: 1020)';
    }
    if (/\b(nội thất|furniture|gỗ|decor|mộc|trang trí nội thất)\b/.test(n)) {
      return 'Sản xuất và kinh doanh đồ nội thất, trang trí (Mã: 3100)';
    }
    if (/\b(tư vấn đầu tư|đầu tư|investment|tài chính|chứng khoán|quản lý quỹ)\b/.test(n)) {
      return 'Hoạt động tư vấn đầu tư và dịch vụ tài chính (Mã: 6619)';
    }
    if (/\b(năng lượng|điện mặt trời|solar|energy|điện gió|xăng dầu|nhiên liệu)\b/.test(n)) {
      return 'Sản xuất, truyền tải và phân phối điện, năng lượng (Mã: 3511)';
    }
    if (/\b(quảng cáo|truyền thông|media|marketing|sự kiện|event|agency)\b/.test(n)) {
      return 'Quảng cáo, truyền thông và nghiên cứu thị trường (Mã: 7310)';
    }
    if (/\b(cơ khí|kim khí|chế tạo máy|khuôn mẫu|gang thép|nhôm kính)\b/.test(n)) {
      return 'Gia công cơ khí; xử lý và tráng phủ kim loại (Mã: 2592)';
    }
    if (/\b(may mặc|thời trang|dệt may|garment|fashion|da giày)\b/.test(n)) {
      return 'Sản xuất và bán buôn hàng may mặc, giày dép (Mã: 1410)';
    }
    if (/\b(giáo dục|đào tạo|mầm non|trường|academy|education|ngoại ngữ|du học)\b/.test(n)) {
      return 'Giáo dục mầm non, phổ thông và đào tạo nghề (Mã: 8559)';
    }
    if (/\b(du lịch|lữ hành|travel|tour|khách sạn|hotel|resort|lưu trú)\b/.test(n)) {
      return 'Dịch vụ điều hành tour du lịch, lưu trú khách sạn (Mã: 7912)';
    }
    if (/\b(nhà hàng|quán ăn|ẩm thực|restaurant|cafe|coffee|trà sữa)\b/.test(n)) {
      return 'Dịch vụ nhà hàng, dịch vụ ăn uống và giải khát (Mã: 5610)';
    }
    if (/\b(bảo vệ|vệ sĩ|an ninh|security)\b/.test(n)) {
      return 'Dịch vụ bảo vệ và an ninh (Mã: 8010)';
    }
    if (/\b(vệ sinh|môi trường|xử lý rác|nước thải)\b/.test(n)) {
      return 'Vệ sinh công nghiệp và xử lý môi trường (Mã: 8121)';
    }
    if (/\b(sơn|hóa chất|chemical|nhựa|plastic|bao bì|in ấn)\b/.test(n)) {
      return 'Sản xuất hóa chất, sản phẩm từ chất dẻo và bao bì (Mã: 2220)';
    }
    if (/\b(khoáng sản|khai khoáng|than|đá|cát|sỏi|xi măng)\b/.test(n)) {
      return 'Khai thác khoáng sản, vật liệu xây dựng (Mã: 0810)';
    }
    if (/\b(bảo hiểm|insurance)\b/.test(n)) {
      return 'Hoạt động kinh doanh bảo hiểm và môi giới bảo hiểm (Mã: 6511)';
    }
    if (/\b(nông nghiệp|trồng trọt|chăn nuôi|nông sản|phân bón)\b/.test(n)) {
      return 'Trồng trọt, chăn nuôi và chế biến nông sản (Mã: 0111)';
    }
    if (/\b(sữa|dairy|milk)\b/.test(n)) {
      return 'Chế biến sữa và các sản phẩm từ sữa (Mã: 1050)';
    }
    if (/\b(viễn thông|telecom|truyền dẫn|bưu chính)\b/.test(n)) {
      return 'Hoạt động viễn thông có dây và không dây (Mã: 6110)';
    }
    if (/\b(mỹ phẩm|làm đẹp|spa|thẩm mỹ|cosmetic)\b/.test(n)) {
      return 'Bán buôn, bán lẻ mỹ phẩm và dịch vụ làm đẹp (Mã: 4772)';
    }
    if (/\b(xuất nhập khẩu|xnk|import|export)\b/.test(n)) {
      return 'Hoạt động đại lý, xuất nhập khẩu hàng hóa (Mã: 4690)';
    }
    if (/\b(thương mại|dịch vụ|trading|service)\b/.test(n)) {
      return 'Bán buôn, bán lẻ và hoạt động dịch vụ thương mại tổng hợp (Mã: 4690)';
    }

    return 'Hoạt động kinh doanh thương mại và dịch vụ tổng hợp (Mã: 4690)';
  }

  async saveCompany(company) {
    if (!company || !company.taxId || !company.name || !this.client) return false;

    // Clean slug: remove any leading slash and never store 'mst/'
    let cleanSlug = company.url ? company.url.replace(/^\/?(mst\/)?/, '') : '';
    if (!cleanSlug) {
      cleanSlug = `${company.taxId}-${this.slugify(company.name)}`;
    }

    // Fetch existing company from DB to preserve enriched details (never overwrite good data with blank strings!)
    let existingData = {};
    let existingRep = '';
    let existingPhone = '';
    let existingAddr = '';
    try {
      const existing = await this.client.execute({
        sql: 'SELECT representative, phone, address, data FROM companies WHERE taxId = ? LIMIT 1',
        args: [company.taxId]
      });
      if (existing.rows && existing.rows.length > 0) {
        existingRep = existing.rows[0].representative || '';
        existingPhone = existing.rows[0].phone || '';
        existingAddr = existing.rows[0].address || '';
        try {
          existingData = typeof existing.rows[0].data === 'string' ? JSON.parse(existing.rows[0].data) : (existing.rows[0].data || {});
        } catch (e) {}
      }
    } catch (e) {}

    const finalRep = (company.representative && company.representative.trim()) || existingRep || existingData.representative || '';
    const finalPhone = (company.phone && company.phone.trim()) || existingPhone || existingData.phone || '';
    const finalStartDate = (company.startDate && company.startDate.trim()) || existingData.startDate || '';
    const finalManagedBy = (company.managedBy && company.managedBy.trim() && company.managedBy !== 'Cơ quan Thuế') 
      ? company.managedBy 
      : (existingData.managedBy || company.managedBy || 'Cơ quan Thuế');

    const address = company.address || company.taxAddress || existingAddr || existingData.address || '';
    const province = this.extractProvince(address);
    const mainIndustry = this.detectIndustry(company.name, company.mainIndustry || existingData.mainIndustry);
    
    // Auto-populate industries list if empty
    let industries = Array.isArray(company.industries) && company.industries.length > 0 
      ? company.industries 
      : (existingData.industries && existingData.industries.length > 0 ? existingData.industries : []);
      
    if (industries.length === 0 && mainIndustry) {
      const codeMatch = mainIndustry.match(/Mã:\s*(\d+)/);
      const code = codeMatch ? codeMatch[1] : '4690';
      const cleanName = mainIndustry.replace(/\s*\(Mã:[^)]+\)/, '');
      industries = [{ code, name: cleanName, isMain: true }];
    }

    const payload = {
      ...existingData,
      ...company,
      url: `/mst/${cleanSlug}`,
      representative: finalRep,
      phone: finalPhone,
      startDate: finalStartDate,
      managedBy: finalManagedBy,
      address,
      province,
      mainIndustry,
      industries
    };

    const now = Date.now();

    try {
      await this.client.execute({
        sql: `
          INSERT INTO companies (taxId, name, slug, representative, address, status, province, type, phone, mainIndustry, data, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(taxId) DO UPDATE SET
            name = excluded.name,
            slug = excluded.slug,
            representative = excluded.representative,
            address = excluded.address,
            status = excluded.status,
            province = excluded.province,
            type = excluded.type,
            phone = excluded.phone,
            mainIndustry = excluded.mainIndustry,
            data = excluded.data,
            updatedAt = excluded.updatedAt;
        `,
        args: [
          company.taxId,
          company.name,
          cleanSlug,
          finalRep,
          address,
          company.status || existingData.status || 'Đang hoạt động',
          province,
          company.type || existingData.type || '',
          finalPhone,
          mainIndustry,
          JSON.stringify(payload),
          now,
          now
        ]
      });
      if (cleanSlug) {
        indexNowService.queueCompany(cleanSlug);
      }
      return true;
    } catch (err) {
      console.error('[DB] Lỗi lưu công ty:', err);
      return false;
    }
  }

  async getCompanyByTaxId(taxId) {
    if (!taxId || !this.client) return null;
    try {
      const res = await this.client.execute({
        sql: 'SELECT * FROM companies WHERE taxId = ? LIMIT 1',
        args: [taxId.trim()]
      });
      if (res.rows && res.rows.length > 0) {
        const row = { ...res.rows[0] };
        row.data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        return row;
      }
    } catch (err) {
      console.error('[DB] Lỗi getCompanyByTaxId:', err);
    }
    return null;
  }

  async getCompanyBySlug(slug) {
    if (!slug || !this.client) return null;
    const clean = slug.replace(/^\/?(mst\/)?/, '');
    try {
      // 1. Try exact clean slug or with mst/
      const res = await this.client.execute({
        sql: 'SELECT * FROM companies WHERE slug = ? OR slug = ? LIMIT 1',
        args: [clean, `mst/${clean}`]
      });
      if (res.rows && res.rows.length > 0) {
        const row = { ...res.rows[0] };
        row.data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        return row;
      }

      // 2. If slug contains taxId, e.g. "0100109106" or "0100109106-tap-doan..."
      const taxMatch = clean.match(/(\d{10}(-\d{3})?)/);
      if (taxMatch) {
        return await this.getCompanyByTaxId(taxMatch[1]);
      }
    } catch (err) {
      console.error('[DB] Lỗi getCompanyBySlug:', err);
    }
    return null;
  }

  async getRelatedCompaniesByRepresentative(representative, currentTaxId, limit = 10) {
    if (!representative || !this.client || representative.trim().length < 3) return [];
    try {
      const res = await this.client.execute({
        sql: `
          SELECT taxId, name, slug, address, status, province 
          FROM companies 
          WHERE representative = ? AND taxId != ?
          ORDER BY updatedAt DESC 
          LIMIT ?
        `,
        args: [representative.trim(), currentTaxId || '', limit]
      });
      return res.rows || [];
    } catch (err) {
      console.error('[DB] Lỗi getRelatedCompaniesByRepresentative:', err);
      return [];
    }
  }

  async getRelatedCompaniesByProvince(province, currentTaxId, limit = 6) {
    if (!province || !this.client || province === 'Toàn Quốc' || province === 'Khác') return [];
    try {
      const res = await this.client.execute({
        sql: `
          SELECT taxId, name, slug, representative, address, status, province 
          FROM companies 
          WHERE province = ? AND taxId != ?
          ORDER BY updatedAt DESC 
          LIMIT ?
        `,
        args: [province, currentTaxId || '', limit]
      });
      return res.rows || [];
    } catch (err) {
      console.error('[DB] Lỗi getRelatedCompaniesByProvince:', err);
      return [];
    }
  }

  async getRelatedCompaniesByIndustry(mainIndustry, currentTaxId, limit = 6) {
    if (!mainIndustry || !this.client) return [];
    const m = mainIndustry.match(/Mã:\s*(\d{4})/i);
    const code = m ? m[1] : '';
    if (!code) return [];
    try {
      const pattern = `%${code}%`;
      const res = await this.client.execute({
        sql: `
          SELECT taxId, name, slug, representative, address, status, province 
          FROM companies 
          WHERE mainIndustry LIKE ? AND taxId != ?
          ORDER BY updatedAt DESC 
          LIMIT ?
        `,
        args: [pattern, currentTaxId || '', limit]
      });
      return res.rows || [];
    } catch (err) {
      console.error('[DB] Lỗi getRelatedCompaniesByIndustry:', err);
      return [];
    }
  }

  async getRecentCompanies(limit = 20) {
    if (!this.client) return [];
    try {
      const res = await this.client.execute({
        sql: `
          SELECT taxId, name, slug, representative, address, status, province, updatedAt 
          FROM companies 
          ORDER BY updatedAt DESC 
          LIMIT ?
        `,
        args: [limit]
      });
      return res.rows || [];
    } catch (err) {
      console.error('[DB] Lỗi getRecentCompanies:', err);
      return [];
    }
  }

  async getCompaniesByProvince(province, limit = 30) {
    if (!this.client) return [];
    try {
      const res = await this.client.execute({
        sql: `
          SELECT taxId, name, slug, representative, address, status, province, updatedAt 
          FROM companies 
          WHERE province = ? 
          ORDER BY updatedAt DESC 
          LIMIT ?
        `,
        args: [province, limit]
      });
      return res.rows || [];
    } catch (err) {
      console.error('[DB] Lỗi getCompaniesByProvince:', err);
      return [];
    }
  }

  async searchCompanies(query, limit = 20) {
    if (!query || !query.trim() || !this.client) return [];
    const q = `%${query.trim()}%`;
    try {
      const res = await this.client.execute({
        sql: `
          SELECT taxId, name, slug, representative, address, status, province, updatedAt 
          FROM companies 
          WHERE taxId LIKE ? OR name LIKE ? OR representative LIKE ?
          ORDER BY updatedAt DESC 
          LIMIT ?
        `,
        args: [q, q, q, limit]
      });
      return (res.rows || []).map(r => ({
        name: r.name,
        url: `/mst/${r.slug}`,
        taxId: r.taxId,
        representative: r.representative,
        address: r.address,
        status: r.status,
        province: r.province
      }));
    } catch (err) {
      console.error('[DB] Lỗi searchCompanies:', err);
      return [];
    }
  }

  async getAllSlugs(limit = 50000) {
    try {
      const res = await this.client.execute({
        sql: 'SELECT slug, taxId, updatedAt FROM companies ORDER BY updatedAt DESC LIMIT ?',
        args: [limit]
      });
      return res.rows || [];
    } catch (err) {
      console.error('[DB] Lỗi getAllSlugs:', err);
      return [];
    }
  }

  async getProvinceStats() {
    if (!this.client) return [];
    try {
      const res = await this.client.execute(`
        SELECT province, COUNT(*) as count 
        FROM companies 
        WHERE province IS NOT NULL AND province != '' AND province != 'Toàn Quốc'
        GROUP BY province 
        ORDER BY count DESC
      `);
      return res.rows || [];
    } catch (err) {
      console.error('[DB] Lỗi getProvinceStats:', err);
      return [];
    }
  }

  async getCompaniesByProvincePaginated(province, page = 1, limit = 24) {
    if (!this.client) return { items: [], total: 0, maxPage: 1, currentPage: 1 };
    const p = Math.max(1, parseInt(page, 10) || 1);
    const offset = (p - 1) * limit;
    try {
      const countRes = await this.client.execute({
        sql: 'SELECT COUNT(*) as total FROM companies WHERE province = ?',
        args: [province]
      });
      const total = Number(countRes.rows[0]?.total || 0);
      const maxPage = Math.max(1, Math.ceil(total / limit));

      const res = await this.client.execute({
        sql: `
          SELECT taxId, name, slug, representative, address, status, province, updatedAt, mainIndustry 
          FROM companies 
          WHERE province = ? 
          ORDER BY updatedAt DESC 
          LIMIT ? OFFSET ?
        `,
        args: [province, limit, offset]
      });
      return { items: res.rows || [], total, maxPage, currentPage: p };
    } catch (err) {
      console.error('[DB] Lỗi getCompaniesByProvincePaginated:', err);
      return { items: [], total: 0, maxPage: 1, currentPage: 1 };
    }
  }

  async getTopIndustriesWithCounts() {
    if (!this.client) return [];
    try {
      const res = await this.client.execute(`
        SELECT mainIndustry, COUNT(*) as count 
        FROM companies 
        WHERE mainIndustry IS NOT NULL AND mainIndustry != ''
        GROUP BY mainIndustry 
        ORDER BY count DESC 
        LIMIT 30
      `);
      return res.rows || [];
    } catch (err) {
      console.error('[DB] Lỗi getTopIndustriesWithCounts:', err);
      return [];
    }
  }

  async getCompaniesByIndustryPaginated(codeOrKeyword, page = 1, limit = 24) {
    if (!this.client) return { items: [], total: 0, maxPage: 1, currentPage: 1 };
    const p = Math.max(1, parseInt(page, 10) || 1);
    const offset = (p - 1) * limit;
    const pattern = `%${codeOrKeyword}%`;
    try {
      const countRes = await this.client.execute({
        sql: 'SELECT COUNT(*) as total FROM companies WHERE mainIndustry LIKE ? OR data LIKE ?',
        args: [pattern, pattern]
      });
      const total = Number(countRes.rows[0]?.total || 0);
      const maxPage = Math.max(1, Math.ceil(total / limit));

      const res = await this.client.execute({
        sql: `
          SELECT taxId, name, slug, representative, address, status, province, updatedAt, mainIndustry 
          FROM companies 
          WHERE mainIndustry LIKE ? OR data LIKE ?
          ORDER BY updatedAt DESC 
          LIMIT ? OFFSET ?
        `,
        args: [pattern, pattern, limit, offset]
      });
      return { items: res.rows || [], total, maxPage, currentPage: p };
    } catch (err) {
      console.error('[DB] Lỗi getCompaniesByIndustryPaginated:', err);
      return { items: [], total: 0, maxPage: 1, currentPage: 1 };
    }
  }

  async getRecentCompaniesPaginated(page = 1, limit = 24) {
    if (!this.client) return { items: [], total: 0, maxPage: 1, currentPage: 1 };
    const p = Math.max(1, parseInt(page, 10) || 1);
    const offset = (p - 1) * limit;
    try {
      const countRes = await this.client.execute('SELECT COUNT(*) as total FROM companies');
      const total = Number(countRes.rows[0]?.total || 0);
      const maxPage = Math.max(1, Math.ceil(total / limit));

      const res = await this.client.execute({
        sql: `
          SELECT taxId, name, slug, representative, address, status, province, updatedAt, mainIndustry 
          FROM companies 
          ORDER BY updatedAt DESC 
          LIMIT ? OFFSET ?
        `,
        args: [limit, offset]
      });
      return { items: res.rows || [], total, maxPage, currentPage: p };
    } catch (err) {
      console.error('[DB] Lỗi getRecentCompaniesPaginated:', err);
      return { items: [], total: 0, maxPage: 1, currentPage: 1 };
    }
  }

  async getStats() {
    try {
      const res = await this.client.execute('SELECT COUNT(*) as total FROM companies');
      const total = Number(res.rows[0]?.total || 0);
      return { total, isTurso: this.isTurso };
    } catch (err) {
      return { total: 0, isTurso: this.isTurso };
    }
  }
}

export const VIETNAM_PROVINCES = [
  { name: 'TP Hồ Chí Minh', slug: 'tp-ho-chi-minh', region: 'Miền Nam', isHot: true },
  { name: 'Hà Nội', slug: 'ha-noi', region: 'Miền Bắc', isHot: true },
  { name: 'Đà Nẵng', slug: 'da-nang', region: 'Miền Trung', isHot: true },
  { name: 'Bình Dương', slug: 'binh-duong', region: 'Miền Nam', isHot: true },
  { name: 'Đồng Nai', slug: 'dong-nai', region: 'Miền Nam', isHot: true },
  { name: 'Hải Phòng', slug: 'hai-phong', region: 'Miền Bắc', isHot: true },
  { name: 'Cần Thơ', slug: 'can-tho', region: 'Miền Tây', isHot: true },
  { name: 'Bà Rịa - Vũng Tàu', slug: 'ba-ria-vung-tau', region: 'Miền Nam', isHot: true },
  { name: 'Long An', slug: 'long-an', region: 'Miền Tây' },
  { name: 'Bắc Ninh', slug: 'bac-ninh', region: 'Miền Bắc' },
  { name: 'Quảng Ninh', slug: 'quang-ninh', region: 'Miền Bắc' },
  { name: 'Khánh Hòa', slug: 'khanh-hoa', region: 'Miền Trung' },
  { name: 'Thanh Hóa', slug: 'thanh-hoa', region: 'Miền Trung' },
  { name: 'Nghệ An', slug: 'nghe-an', region: 'Miền Trung' },
  { name: 'Thừa Thiên Huế', slug: 'thua-thien-hue', region: 'Miền Trung' },
  { name: 'Lâm Đồng', slug: 'lam-dong', region: 'Tây Nguyên' },
  { name: 'Thái Nguyên', slug: 'thai-nguyen', region: 'Miền Bắc' },
  { name: 'Vĩnh Phúc', slug: 'vinh-phuc', region: 'Miền Bắc' },
  { name: 'Hải Dương', slug: 'hai-duong', region: 'Miền Bắc' },
  { name: 'Hưng Yên', slug: 'hung-yen', region: 'Miền Bắc' },
  { name: 'Bình Định', slug: 'binh-dinh', region: 'Miền Trung' },
  { name: 'Quảng Nam', slug: 'quang-nam', region: 'Miền Trung' },
  { name: 'Quảng Ngãi', slug: 'quang-ngai', region: 'Miền Trung' },
  { name: 'Kiên Giang', slug: 'kien-giang', region: 'Miền Tây' },
  { name: 'Tiền Giang', slug: 'tien-giang', region: 'Miền Tây' },
  { name: 'Bến Tre', slug: 'ben-tre', region: 'Miền Tây' },
  { name: 'Tây Ninh', slug: 'tay-ninh', region: 'Miền Nam' },
  { name: 'Bình Phước', slug: 'binh-phuoc', region: 'Miền Nam' },
  { name: 'Đắk Lắk', slug: 'dak-lak', region: 'Tây Nguyên' },
  { name: 'Gia Lai', slug: 'gia-lai', region: 'Tây Nguyên' },
  { name: 'An Giang', slug: 'an-giang', region: 'Miền Tây' },
  { name: 'Đồng Tháp', slug: 'dong-thap', region: 'Miền Tây' },
  { name: 'Vĩnh Long', slug: 'vinh-long', region: 'Miền Tây' },
  { name: 'Bạc Liêu', slug: 'bac-lieu', region: 'Miền Tây' },
  { name: 'Cà Mau', slug: 'ca-mau', region: 'Miền Tây' },
  { name: 'Sóc Trăng', slug: 'soc-trang', region: 'Miền Tây' },
  { name: 'Trà Vinh', slug: 'tra-vinh', region: 'Miền Tây' },
  { name: 'Hậu Giang', slug: 'hau-giang', region: 'Miền Tây' },
  { name: 'Ninh Thuận', slug: 'ninh-thuan', region: 'Miền Trung' },
  { name: 'Bình Thuận', slug: 'binh-thuan', region: 'Miền Trung' },
  { name: 'Phú Yên', slug: 'phu-yen', region: 'Miền Trung' },
  { name: 'Quảng Bình', slug: 'quang-binh', region: 'Miền Trung' },
  { name: 'Quảng Trị', slug: 'quang-tri', region: 'Miền Trung' },
  { name: 'Hà Tĩnh', slug: 'ha-tinh', region: 'Miền Trung' },
  { name: 'Nam Định', slug: 'nam-dinh', region: 'Miền Bắc' },
  { name: 'Thái Bình', slug: 'thai-binh', region: 'Miền Bắc' },
  { name: 'Ninh Bình', slug: 'ninh-binh', region: 'Miền Bắc' },
  { name: 'Hà Nam', slug: 'ha-nam', region: 'Miền Bắc' },
  { name: 'Bắc Giang', slug: 'bac-giang', region: 'Miền Bắc' },
  { name: 'Phú Thọ', slug: 'phu-tho', region: 'Miền Bắc' },
  { name: 'Hòa Bình', slug: 'hoa-binh', region: 'Miền Bắc' },
  { name: 'Sơn La', slug: 'son-la', region: 'Miền Bắc' },
  { name: 'Lai Châu', slug: 'lai-chau', region: 'Miền Bắc' },
  { name: 'Điện Biên', slug: 'dien-bien', region: 'Miền Bắc' },
  { name: 'Lào Cai', slug: 'lao-cai', region: 'Miền Bắc' },
  { name: 'Yên Bái', slug: 'yen-bai', region: 'Miền Bắc' },
  { name: 'Tuyên Quang', slug: 'tuyen-quang', region: 'Miền Bắc' },
  { name: 'Hà Giang', slug: 'ha-giang', region: 'Miền Bắc' },
  { name: 'Cao Bằng', slug: 'cao-bang', region: 'Miền Bắc' },
  { name: 'Bắc Kạn', slug: 'bac-kan', region: 'Miền Bắc' },
  { name: 'Lạng Sơn', slug: 'lang-son', region: 'Miền Bắc' },
  { name: 'Kon Tum', slug: 'kon-tum', region: 'Tây Nguyên' },
  { name: 'Đắk Nông', slug: 'dak-nong', region: 'Tây Nguyên' }
];

export const TOP_INDUSTRIES = [
  { code: '4690', name: 'Bán buôn tổng hợp & Dịch vụ thương mại', slug: '4690-ban-buon-tong-hop', icon: '🛒' },
  { code: '4100', name: 'Xây dựng nhà & Công trình kỹ thuật', slug: '4100-xay-dung-nha', icon: '🏗️' },
  { code: '6810', name: 'Kinh doanh bất động sản & Nhà đất', slug: '6810-bat-dong-san', icon: '🏢' },
  { code: '6201', name: 'Lập trình máy vi tính & CNTT', slug: '6201-lap-trinh-may-vi-tinh', icon: '💻' },
  { code: '4933', name: 'Vận tải hàng hóa & Logistics', slug: '4933-van-tai-logistics', icon: '🚛' },
  { code: '4646', name: 'Dược phẩm & Thiết bị y tế', slug: '4646-duoc-pham-y-te', icon: '💊' },
  { code: '1079', name: 'Sản xuất và chế biến thực phẩm', slug: '1079-thuc-pham-do-uong', icon: '🍞' },
  { code: '1020', name: 'Chế biến & Nuôi trồng thủy sản', slug: '1020-thuy-hai-san', icon: '🐟' },
  { code: '6619', name: 'Tư vấn đầu tư & Dịch vụ tài chính', slug: '6619-tu-van-dau-tu-tai-chinh', icon: '📈' },
  { code: '6511', name: 'Bảo hiểm và môi giới bảo hiểm', slug: '6511-bao-hiem', icon: '🛡️' },
  { code: '7310', name: 'Quảng cáo, truyền thông & Marketing', slug: '7310-quang-cao-marketing', icon: '📢' },
  { code: '7020', name: 'Tư vấn quản lý & Quản trị kinh doanh', slug: '7020-tu-van-quan-ly', icon: '👔' },
  { code: '5610', name: 'Nhà hàng, quán ăn & Dịch vụ ẩm thực', slug: '5610-nha-hang-an-uong', icon: '🍽️' },
  { code: '1410', name: 'Sản xuất hàng may mặc & Thời trang', slug: '1410-may-mac-thoi-trang', icon: '👗' },
  { code: '2592', name: 'Gia công cơ khí & Kim loại', slug: '2592-gia-cong-co-khi', icon: '⚙️' },
  { code: '8559', name: 'Giáo dục mầm non, phổ thông & Đào tạo', slug: '8559-giao-duc-dao-tao', icon: '🎓' },
  { code: '7912', name: 'Dịch vụ lữ hành, du lịch & Khách sạn', slug: '7912-du-lich-khach-san', icon: '✈️' },
  { code: '3511', name: 'Sản xuất & Phân phối năng lượng, điện', slug: '3511-dien-nang-luong', icon: '⚡' },
  { code: '0111', name: 'Trồng trọt, chăn nuôi & Nông sản', slug: '0111-nong-nghiep-nong-san', icon: '🌾' }
];

export const db = new Database();
