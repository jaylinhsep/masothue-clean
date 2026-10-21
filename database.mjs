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

    // 1. TP Hồ Chí Minh (TP.HCM + Bình Dương + Bà Rịa - Vũng Tàu)
    if (clean.includes('hồ chí minh') || clean.includes('tp.hcm') || clean.includes('tp hcm') || clean.includes('sài gòn') || clean.includes('tphcm') || clean.includes('bình dương') || clean.includes('bà rịa') || clean.includes('vũng tàu')) return 'TP Hồ Chí Minh';

    // 2. Hà Nội
    if (clean.includes('hà nội') || clean.includes('ha noi')) return 'Hà Nội';

    // 3. Hải Phòng (Hải Phòng + Hải Dương)
    if (clean.includes('hải phòng') || clean.includes('hải dương')) return 'Hải Phòng';

    // 4. Đà Nẵng (Đà Nẵng + Quảng Nam)
    if (clean.includes('đà nẵng') || clean.includes('quảng nam')) return 'Đà Nẵng';

    // 5. Cần Thơ (Cần Thơ + Hậu Giang + Sóc Trăng)
    if (clean.includes('cần thơ') || clean.includes('hậu giang') || clean.includes('sóc trăng')) return 'Cần Thơ';

    // 6. Huế (Thừa Thiên Huế)
    if (clean.includes('thừa thiên') || clean.includes('huế')) return 'Huế';

    // 7. Bắc Ninh (Bắc Ninh + Bắc Giang)
    if (clean.includes('bắc ninh') || clean.includes('bắc giang')) return 'Bắc Ninh';

    // 8. Thái Nguyên (Thái Nguyên + Bắc Kạn)
    if (clean.includes('thái nguyên') || clean.includes('bắc kạn') || clean.includes('bắc cạn')) return 'Thái Nguyên';

    // 9. Phú Thọ (Phú Thọ + Vĩnh Phúc + Hòa Bình)
    if (clean.includes('phú thọ') || clean.includes('vĩnh phúc') || clean.includes('hòa bình')) return 'Phú Thọ';

    // 10. Hưng Yên (Hưng Yên + Thái Bình)
    if (clean.includes('hưng yên') || clean.includes('thái bình')) return 'Hưng Yên';

    // 11. Ninh Bình (Ninh Bình + Nam Định + Hà Nam)
    if (clean.includes('ninh bình') || clean.includes('nam định') || clean.includes('hà nam')) return 'Ninh Bình';

    // 12. Tuyên Quang (Tuyên Quang + Hà Giang)
    if (clean.includes('tuyên quang') || clean.includes('hà giang')) return 'Tuyên Quang';

    // 13. Lào Cai (Lào Cai + Yên Bái)
    if (clean.includes('lào cai') || clean.includes('yên bái')) return 'Lào Cai';

    // 14. Quảng Trị (Quảng Trị + Quảng Bình)
    if (clean.includes('quảng trị') || clean.includes('quảng bình')) return 'Quảng Trị';

    // 15. Quảng Ngãi (Quảng Ngãi + Kon Tum)
    if (clean.includes('quảng ngãi') || clean.includes('kon tum')) return 'Quảng Ngãi';

    // 16. Gia Lai (Gia Lai + Bình Định)
    if (clean.includes('gia lai') || clean.includes('bình định')) return 'Gia Lai';

    // 17. Khánh Hòa (Khánh Hòa + Ninh Thuận)
    if (clean.includes('khánh hòa') || clean.includes('ninh thuận')) return 'Khánh Hòa';

    // 18. Đắk Lắk (Đắk Lắk + Phú Yên)
    if (clean.includes('đắk lắk') || clean.includes('dak lak') || clean.includes('phú yên')) return 'Đắk Lắk';

    // 19. Lâm Đồng (Lâm Đồng + Đắk Nông + Bình Thuận)
    if (clean.includes('lâm đồng') || clean.includes('đắk nông') || clean.includes('dak nong') || clean.includes('bình thuận')) return 'Lâm Đồng';

    // 20. Đồng Nai (Đồng Nai + Bình Phước)
    if (clean.includes('đồng nai') || clean.includes('bình phước')) return 'Đồng Nai';

    // 21. Tây Ninh (Tây Ninh + Long An)
    if (clean.includes('tây ninh') || clean.includes('long an')) return 'Tây Ninh';

    // 22. Đồng Tháp (Đồng Tháp + Tiền Giang)
    if (clean.includes('đồng tháp') || clean.includes('tiền giang')) return 'Đồng Tháp';

    // 23. Vĩnh Long (Vĩnh Long + Bến Tre + Trà Vinh)
    if (clean.includes('vĩnh long') || clean.includes('bến tre') || clean.includes('trà vinh')) return 'Vĩnh Long';

    // 24. An Giang (An Giang + Kiên Giang)
    if (clean.includes('an giang') || clean.includes('kiên giang')) return 'An Giang';

    // 25. Cà Mau (Cà Mau + Bạc Liêu)
    if (clean.includes('cà mau') || clean.includes('bạc liêu')) return 'Cà Mau';

    // Các tỉnh giữ nguyên
    if (clean.includes('quảng ninh')) return 'Quảng Ninh';
    if (clean.includes('thanh hóa')) return 'Thanh Hóa';
    if (clean.includes('nghệ an')) return 'Nghệ An';
    if (clean.includes('hà tĩnh')) return 'Hà Tĩnh';
    if (clean.includes('cao bằng')) return 'Cao Bằng';
    if (clean.includes('lạng sơn')) return 'Lạng Sơn';
    if (clean.includes('lai châu')) return 'Lai Châu';
    if (clean.includes('điện biên')) return 'Điện Biên';
    if (clean.includes('sơn la')) return 'Sơn La';

    // Check against all other provinces in VIETNAM_PROVINCES
    for (const p of VIETNAM_PROVINCES) {
      if (clean.includes(p.name.toLowerCase())) return p.name;
      if (p.oldNames) {
        for (const oldN of p.oldNames) {
          if (clean.includes(oldN.toLowerCase())) return p.name;
        }
      }
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
    const raw = query.trim();
    const upper = '%' + raw.toUpperCase() + '%';
    const lower = '%' + raw.toLowerCase() + '%';
    const slugTerm = '%' + this.slugify(raw) + '%';
    const words = raw.split(/\s+/).map(w => this.slugify(w)).filter(Boolean);

    const conditions = [
      'taxId LIKE ?',
      'name LIKE ?',
      'name LIKE ?',
      'representative LIKE ?',
      'slug LIKE ?'
    ];
    const args = ['%' + raw + '%', upper, lower, upper, slugTerm];

    if (words.length > 1) {
      const wordClauses = words.map(() => '(slug LIKE ? OR slug LIKE ? OR slug LIKE ?)').join(' AND ');
      conditions.push('(' + wordClauses + ')');
      words.forEach(w => {
        args.push(`%-${w}-%`, `%-${w}`, `${w}-%`);
      });
    }

    try {
      const sql = `
        SELECT taxId, name, slug, representative, address, status, province, updatedAt,
          CASE 
            WHEN taxId = ? THEN 1
            WHEN name LIKE ? THEN 2
            WHEN slug LIKE ? THEN 3
            ELSE 4 
          END AS relevance
        FROM companies 
        WHERE ${conditions.join(' OR ')} 
        ORDER BY relevance ASC, updatedAt DESC 
        LIMIT ?
      `;
      const res = await this.client.execute({
        sql,
        args: [raw, upper, slugTerm, ...args, limit]
      });
      return (res.rows || []).map(r => ({
        name: r.name,
        slug: r.slug,
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

    const provObj = VIETNAM_PROVINCES.find(x => x.name === province || x.slug === province);
    const names = provObj ? (provObj.oldNames || [provObj.name]) : [province];
    const placeholders = names.map(() => '?').join(', ');

    try {
      const countRes = await this.client.execute({
        sql: `SELECT COUNT(*) as total FROM companies WHERE province IN (${placeholders})`,
        args: names
      });
      const total = Number(countRes.rows[0]?.total || 0);
      const maxPage = Math.max(1, Math.ceil(total / limit));

      const res = await this.client.execute({
        sql: `
          SELECT taxId, name, slug, representative, address, status, province, updatedAt, mainIndustry 
          FROM companies 
          WHERE province IN (${placeholders}) 
          ORDER BY updatedAt DESC 
          LIMIT ? OFFSET ?
        `,
        args: [...names, limit, offset]
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
  // --- 6 THÀNH PHỐ TRỰC THUỘC TRUNG ƯƠNG ---
  {
    name: 'TP Hồ Chí Minh',
    slug: 'tp-ho-chi-minh',
    region: 'Miền Nam',
    isHot: true,
    isCity: true,
    mergedFrom: 'Gồm TP.HCM, Bình Dương, Bà Rịa - Vũng Tàu',
    oldNames: ['TP Hồ Chí Minh', 'Bình Dương', 'Bà Rịa - Vũng Tàu'],
    oldSlugs: ['tp-ho-chi-minh', 'binh-duong', 'ba-ria-vung-tau']
  },
  {
    name: 'Hà Nội',
    slug: 'ha-noi',
    region: 'Miền Bắc',
    isHot: true,
    isCity: true,
    mergedFrom: 'Giữ nguyên đơn vị hành chính',
    oldNames: ['Hà Nội'],
    oldSlugs: ['ha-noi']
  },
  {
    name: 'Hải Phòng',
    slug: 'hai-phong',
    region: 'Miền Bắc',
    isHot: true,
    isCity: true,
    mergedFrom: 'Gồm Hải Phòng, Hải Dương',
    oldNames: ['Hải Phòng', 'Hải Dương'],
    oldSlugs: ['hai-phong', 'hai-duong']
  },
  {
    name: 'Đà Nẵng',
    slug: 'da-nang',
    region: 'Miền Trung',
    isHot: true,
    isCity: true,
    mergedFrom: 'Gồm Đà Nẵng, Quảng Nam',
    oldNames: ['Đà Nẵng', 'Quảng Nam'],
    oldSlugs: ['da-nang', 'quang-nam']
  },
  {
    name: 'Cần Thơ',
    slug: 'can-tho',
    region: 'Miền Tây',
    isHot: true,
    isCity: true,
    mergedFrom: 'Gồm Cần Thơ, Hậu Giang, Sóc Trăng',
    oldNames: ['Cần Thơ', 'Hậu Giang', 'Sóc Trăng'],
    oldSlugs: ['can-tho', 'hau-giang', 'soc-trang']
  },
  {
    name: 'Huế',
    slug: 'hue',
    region: 'Miền Trung',
    isHot: true,
    isCity: true,
    mergedFrom: 'Thành phố Huế trực thuộc Trung ương (trước là Thừa Thiên Huế)',
    oldNames: ['Huế', 'Thừa Thiên Huế'],
    oldSlugs: ['hue', 'thua-thien-hue']
  },

  // --- 28 TỈNH TRỰC THUỘC TRUNG ƯƠNG ---
  // Miền Bắc
  {
    name: 'Bắc Ninh',
    slug: 'bac-ninh',
    region: 'Miền Bắc',
    isHot: true,
    mergedFrom: 'Gồm Bắc Ninh, Bắc Giang',
    oldNames: ['Bắc Ninh', 'Bắc Giang'],
    oldSlugs: ['bac-ninh', 'bac-giang']
  },
  {
    name: 'Quảng Ninh',
    slug: 'quang-ninh',
    region: 'Miền Bắc',
    isHot: true,
    mergedFrom: 'Giữ nguyên đơn vị hành chính',
    oldNames: ['Quảng Ninh'],
    oldSlugs: ['quang-ninh']
  },
  {
    name: 'Thái Nguyên',
    slug: 'thai-nguyen',
    region: 'Miền Bắc',
    mergedFrom: 'Gồm Thái Nguyên, Bắc Kạn',
    oldNames: ['Thái Nguyên', 'Bắc Kạn'],
    oldSlugs: ['thai-nguyen', 'bac-kan']
  },
  {
    name: 'Phú Thọ',
    slug: 'phu-tho',
    region: 'Miền Bắc',
    mergedFrom: 'Gồm Phú Thọ, Vĩnh Phúc, Hòa Bình',
    oldNames: ['Phú Thọ', 'Vĩnh Phúc', 'Hòa Bình'],
    oldSlugs: ['phu-tho', 'vinh-phuc', 'hoa-binh']
  },
  {
    name: 'Hưng Yên',
    slug: 'hung-yen',
    region: 'Miền Bắc',
    mergedFrom: 'Gồm Hưng Yên, Thái Bình',
    oldNames: ['Hưng Yên', 'Thái Bình'],
    oldSlugs: ['hung-yen', 'thai-binh']
  },
  {
    name: 'Ninh Bình',
    slug: 'ninh-binh',
    region: 'Miền Bắc',
    mergedFrom: 'Gồm Ninh Bình, Nam Định, Hà Nam',
    oldNames: ['Ninh Bình', 'Nam Định', 'Hà Nam'],
    oldSlugs: ['ninh-binh', 'nam-dinh', 'ha-nam']
  },
  {
    name: 'Tuyên Quang',
    slug: 'tuyen-quang',
    region: 'Miền Bắc',
    mergedFrom: 'Gồm Tuyên Quang, Hà Giang',
    oldNames: ['Tuyên Quang', 'Hà Giang'],
    oldSlugs: ['tuyen-quang', 'ha-giang']
  },
  {
    name: 'Lào Cai',
    slug: 'lao-cai',
    region: 'Miền Bắc',
    mergedFrom: 'Gồm Lào Cai, Yên Bái',
    oldNames: ['Lào Cai', 'Yên Bái'],
    oldSlugs: ['lao-cai', 'yen-bai']
  },
  {
    name: 'Cao Bằng',
    slug: 'cao-bang',
    region: 'Miền Bắc',
    mergedFrom: 'Giữ nguyên đơn vị hành chính',
    oldNames: ['Cao Bằng'],
    oldSlugs: ['cao-bang']
  },
  {
    name: 'Lạng Sơn',
    slug: 'lang-son',
    region: 'Miền Bắc',
    mergedFrom: 'Giữ nguyên đơn vị hành chính',
    oldNames: ['Lạng Sơn'],
    oldSlugs: ['lang-son']
  },
  {
    name: 'Lai Châu',
    slug: 'lai-chau',
    region: 'Miền Bắc',
    mergedFrom: 'Giữ nguyên đơn vị hành chính',
    oldNames: ['Lai Châu'],
    oldSlugs: ['lai-chau']
  },
  {
    name: 'Điện Biên',
    slug: 'dien-bien',
    region: 'Miền Bắc',
    mergedFrom: 'Giữ nguyên đơn vị hành chính',
    oldNames: ['Điện Biên'],
    oldSlugs: ['dien-bien']
  },
  {
    name: 'Sơn La',
    slug: 'son-la',
    region: 'Miền Bắc',
    mergedFrom: 'Giữ nguyên đơn vị hành chính',
    oldNames: ['Sơn La'],
    oldSlugs: ['son-la']
  },

  // Miền Trung
  {
    name: 'Thanh Hóa',
    slug: 'thanh-hoa',
    region: 'Miền Trung',
    isHot: true,
    mergedFrom: 'Giữ nguyên đơn vị hành chính',
    oldNames: ['Thanh Hóa'],
    oldSlugs: ['thanh-hoa']
  },
  {
    name: 'Nghệ An',
    slug: 'nghe-an',
    region: 'Miền Trung',
    isHot: true,
    mergedFrom: 'Giữ nguyên đơn vị hành chính',
    oldNames: ['Nghệ An'],
    oldSlugs: ['nghe-an']
  },
  {
    name: 'Hà Tĩnh',
    slug: 'ha-tinh',
    region: 'Miền Trung',
    mergedFrom: 'Giữ nguyên đơn vị hành chính',
    oldNames: ['Hà Tĩnh'],
    oldSlugs: ['ha-tinh']
  },
  {
    name: 'Quảng Trị',
    slug: 'quang-tri',
    region: 'Miền Trung',
    mergedFrom: 'Gồm Quảng Trị, Quảng Bình',
    oldNames: ['Quảng Trị', 'Quảng Bình'],
    oldSlugs: ['quang-tri', 'quang-binh']
  },
  {
    name: 'Quảng Ngãi',
    slug: 'quang-ngai',
    region: 'Miền Trung',
    mergedFrom: 'Gồm Quảng Ngãi, Kon Tum',
    oldNames: ['Quảng Ngãi', 'Kon Tum'],
    oldSlugs: ['quang-ngai', 'kon-tum']
  },
  {
    name: 'Gia Lai',
    slug: 'gia-lai',
    region: 'Miền Trung',
    mergedFrom: 'Gồm Gia Lai, Bình Định',
    oldNames: ['Gia Lai', 'Bình Định'],
    oldSlugs: ['gia-lai', 'binh-dinh']
  },
  {
    name: 'Khánh Hòa',
    slug: 'khanh-hoa',
    region: 'Miền Trung',
    isHot: true,
    mergedFrom: 'Gồm Khánh Hòa, Ninh Thuận',
    oldNames: ['Khánh Hòa', 'Ninh Thuận'],
    oldSlugs: ['khanh-hoa', 'ninh-thuan']
  },

  // Tây Nguyên
  {
    name: 'Đắk Lắk',
    slug: 'dak-lak',
    region: 'Tây Nguyên',
    mergedFrom: 'Gồm Đắk Lắk, Phú Yên',
    oldNames: ['Đắk Lắk', 'Phú Yên'],
    oldSlugs: ['dak-lak', 'phu-yen']
  },
  {
    name: 'Lâm Đồng',
    slug: 'lam-dong',
    region: 'Tây Nguyên',
    mergedFrom: 'Gồm Lâm Đồng, Đắk Nông, Bình Thuận',
    oldNames: ['Lâm Đồng', 'Đắk Nông', 'Bình Thuận'],
    oldSlugs: ['lam-dong', 'dak-nong', 'binh-thuan']
  },

  // Miền Nam (Đông Nam Bộ)
  {
    name: 'Đồng Nai',
    slug: 'dong-nai',
    region: 'Miền Nam',
    isHot: true,
    mergedFrom: 'Gồm Đồng Nai, Bình Phước',
    oldNames: ['Đồng Nai', 'Bình Phước'],
    oldSlugs: ['dong-nai', 'binh-phuoc']
  },
  {
    name: 'Tây Ninh',
    slug: 'tay-ninh',
    region: 'Miền Nam',
    mergedFrom: 'Gồm Tây Ninh, Long An',
    oldNames: ['Tây Ninh', 'Long An'],
    oldSlugs: ['tay-ninh', 'long-an']
  },

  // Miền Tây (Đồng bằng sông Cửu Long)
  {
    name: 'Đồng Tháp',
    slug: 'dong-thap',
    region: 'Miền Tây',
    mergedFrom: 'Gồm Đồng Tháp, Tiền Giang',
    oldNames: ['Đồng Tháp', 'Tiền Giang'],
    oldSlugs: ['dong-thap', 'tien-giang']
  },
  {
    name: 'Vĩnh Long',
    slug: 'vinh-long',
    region: 'Miền Tây',
    mergedFrom: 'Gồm Vĩnh Long, Bến Tre, Trà Vinh',
    oldNames: ['Vĩnh Long', 'Bến Tre', 'Trà Vinh'],
    oldSlugs: ['vinh-long', 'ben-tre', 'tra-vinh']
  },
  {
    name: 'An Giang',
    slug: 'an-giang',
    region: 'Miền Tây',
    mergedFrom: 'Gồm An Giang, Kiên Giang',
    oldNames: ['An Giang', 'Kiên Giang'],
    oldSlugs: ['an-giang', 'kien-giang']
  },
  {
    name: 'Cà Mau',
    slug: 'ca-mau',
    region: 'Miền Tây',
    mergedFrom: 'Gồm Cà Mau, Bạc Liêu',
    oldNames: ['Cà Mau', 'Bạc Liêu'],
    oldSlugs: ['ca-mau', 'bac-lieu']
  }
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
