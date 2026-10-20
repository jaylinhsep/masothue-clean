import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_companies_updated ON companies(updatedAt DESC);`);

    console.log(`[DB] Khởi tạo cơ sở dữ liệu thành công (${this.isTurso ? 'Turso Cloud 5GB' : 'Local SQLite'})`);
    return this;
  }

  extractProvince(address) {
    if (!address) return 'Khác';
    const clean = address.toLowerCase();
    if (clean.includes('hà nội') || clean.includes('ha noi')) return 'Hà Nội';
    if (clean.includes('hồ chí minh') || clean.includes('tp.hcm') || clean.includes('tp hcm') || clean.includes('sài gòn')) return 'TP Hồ Chí Minh';
    if (clean.includes('đà nẵng') || clean.includes('da nang')) return 'Đà Nẵng';
    if (clean.includes('hải phòng') || clean.includes('hai phong')) return 'Hải Phòng';
    if (clean.includes('cần thơ') || clean.includes('can tho')) return 'Cần Thơ';
    if (clean.includes('bình dương') || clean.includes('binh duong')) return 'Bình Dương';
    if (clean.includes('đồng nai') || clean.includes('dong nai')) return 'Đồng Nai';
    if (clean.includes('bà rịa') || clean.includes('vũng tàu')) return 'Bà Rịa - Vũng Tàu';
    if (clean.includes('long an')) return 'Long An';
    if (clean.includes('quảng ninh')) return 'Quảng Ninh';
    if (clean.includes('bắc ninh')) return 'Bắc Ninh';
    if (clean.includes('thái nguyên')) return 'Thái Nguyên';
    if (clean.includes('thanh hóa') || clean.includes('thanh hoa')) return 'Thanh Hóa';
    if (clean.includes('nghệ an') || clean.includes('nghe an')) return 'Nghệ An';
    if (clean.includes('thừa thiên huế') || clean.includes('huế')) return 'Thừa Thiên Huế';
    if (clean.includes('khánh hòa') || clean.includes('nha trang')) return 'Khánh Hòa';
    if (clean.includes('lâm đồng') || clean.includes('đà lạt')) return 'Lâm Đồng';
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

export const db = new Database();
