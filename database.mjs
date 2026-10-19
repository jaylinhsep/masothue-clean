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

  async saveCompany(company) {
    if (!company || !company.taxId || !company.name || !this.client) return false;

    let cleanSlug = company.url ? company.url.replace(/^\//, '') : '';
    if (!cleanSlug) {
      cleanSlug = `${company.taxId}-${this.slugify(company.name)}`;
    }

    const province = this.extractProvince(company.address || company.taxAddress);
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
          company.representative || '',
          company.address || company.taxAddress || '',
          company.status || 'Đang hoạt động',
          province,
          company.type || '',
          company.phone || '',
          company.mainIndustry || '',
          JSON.stringify(company),
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
    const clean = slug.replace(/^\//, '');
    try {
      // 1. Try exact slug
      const res = await this.client.execute({
        sql: 'SELECT * FROM companies WHERE slug = ? LIMIT 1',
        args: [clean]
      });
      if (res.rows && res.rows.length > 0) {
        const row = { ...res.rows[0] };
        row.data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        return row;
      }

      // 2. If slug starts with taxId, e.g. "0100109106"
      const taxMatch = clean.match(/^(\d{10}(-\d{3})?)/);
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
