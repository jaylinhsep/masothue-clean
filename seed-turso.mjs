import readline from 'readline';
import { db } from './database.mjs';
import { MasothueCrawler } from './crawler.mjs';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = (query) => new Promise(resolve => rl.question(query, resolve));

// Danh sách từ khóa ngành nghề phổ biến để tự động nạp dữ liệu SEO
const DEFAULT_KEYWORDS = [
  'vượng phát',
  'thịnh vượng',
  'bất động sản',
  'xây dựng',
  'thương mại',
  'vận tải',
  'logistics',
  'công nghệ thông tin',
  'dịch vụ du lịch',
  'xuất nhập khẩu',
  'nội thất',
  'dược phẩm',
  'thực phẩm',
  'tư vấn đầu tư',
  'năng lượng',
  'truyền thông',
  'quảng cáo',
  'cơ khí',
  'may mặc',
  'giáo dục'
];

import fs from 'fs';

async function main() {
  console.log('\n=============================================================');
  console.log('   TOOL NẠP DỮ LIỆU DOANH NGHIỆP LÊN TURSO CLOUD (SEO SEEDER)  ');
  console.log('=============================================================\n');

  // Load .env if exists
  if (fs.existsSync('.env')) {
    const envContent = fs.readFileSync('.env', 'utf-8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        value = value.trim().replace(/^['"](.*)['"]$/, '$1');
        process.env[key] = value;
      }
    }
  }

  // Validate & normalize Turso URL if token was pasted by accident
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_DATABASE_URL.startsWith('eyJ')) {
    if (!process.env.TURSO_AUTH_TOKEN) {
      process.env.TURSO_AUTH_TOKEN = process.env.TURSO_DATABASE_URL;
    }
    process.env.TURSO_DATABASE_URL = 'libsql://masothue-db-ravinpham.aws-ap-northeast-1.turso.io';
  }

  // If still not configured for Turso
  if (!process.env.TURSO_DATABASE_URL && !process.env.TURSO_DATABA) {
    console.log('⚠️ CHÚ Ý: Chưa thấy cấu hình Turso Cloud trên máy tính này.');
    console.log('Để dữ liệu nạp từ máy tính tự động xuất hiện trên web mst0.com:');
    const ans = await ask('Bạn có muốn kết nối thẳng tới Turso Cloud không? (Y/n): ');
    if (ans.trim().toLowerCase() !== 'n') {
      const defaultUrl = 'libsql://masothue-db-ravinpham.aws-ap-northeast-1.turso.io';
      const inputUrl = await ask(`Turso URL [Bấm Enter để dùng: ${defaultUrl}]: `);
      const url = inputUrl.trim() || defaultUrl;
      const token = await ask('Turso Auth Token (chuỗi ey...): ');
      if (token.trim()) {
        fs.writeFileSync('.env', `TURSO_DATABASE_URL=${url}\nTURSO_AUTH_TOKEN=${token.trim()}\n`, 'utf-8');
        process.env.TURSO_DATABASE_URL = url;
        process.env.TURSO_AUTH_TOKEN = token.trim();
        console.log('✓ Đã lưu cấu hình vào .env thành công!\n');
      }
    }
  }

  await db.init();
  const crawler = new MasothueCrawler();

  console.log(`[Trạng thái DB] Đang kết nối tới: ${db.isTurso ? '☁️ Turso Cloud 5GB' : '💻 SQLite Cục Bộ'}`);
  const statsBefore = await db.getStats();
  console.log(`[Số lượng hiện tại] Đang có: ${statsBefore.total} doanh nghiệp trong Database\n`);

  console.log('Chọn chế độ nạp:');
  console.log('1. Tự động nạp theo 20 nhóm ngành nghề lớn (Hơn 400 doanh nghiệp)');
  console.log('2. Nhập từ khóa tùy chọn (ví dụ: vượng phát, fpt, quận 1, hà nội...)');
  
  const choice = await ask('\nNhập lựa chọn của bạn (1 hoặc 2) [Mặc định 1]: ');
  
  let keywords = [];
  if (choice.trim() === '2') {
    const custom = await ask('Nhập từ khóa bạn muốn cào nạp: ');
    if (custom.trim()) {
      keywords = [custom.trim()];
    } else {
      keywords = DEFAULT_KEYWORDS;
    }
  } else {
    keywords = DEFAULT_KEYWORDS;
  }

  console.log(`\n🚀 Bắt đầu cào và nạp dữ liệu cho ${keywords.length} từ khóa...\n`);
  let totalSaved = 0;

  for (let i = 0; i < keywords.length; i++) {
    const kw = keywords[i];
    console.log(`\n[${i + 1}/${keywords.length}] Đang tìm kiếm từ khóa: "${kw}"...`);
    
    try {
      const res = await crawler.search(kw, 'auto', 1);
      if (res && res.items && res.items.length > 0) {
        console.log(`   -> Tìm thấy ${res.items.length} công ty. Đang lưu vào Database...`);
        for (const item of res.items) {
          try {
            // Lấy chi tiết hoặc dùng VietQR để lấy thông tin đầy đủ nhất
            let detailData = null;
            if (item.taxId) {
              detailData = await crawler.getFromVietQR(item.taxId);
            }
            if (!detailData && item.url) {
              const dRes = await crawler.getDetail(item.url);
              if (dRes.success) detailData = dRes.data;
            }

            if (detailData) {
              await db.saveCompany(detailData);
              totalSaved++;
              process.stdout.write(`   ✓ Đã lưu: ${detailData.name.slice(0, 45)}... (MST: ${detailData.taxId})\n`);
            }
          } catch (e) {
            // ignore item error
          }
        }
      } else {
        console.log(`   -> Không tìm thấy kết quả cho "${kw}".`);
      }
    } catch (err) {
      console.log(`   -> Lỗi khi cào từ khóa "${kw}": ${err.message}`);
    }

    // Nghỉ nhẹ 1 giây giữa các từ khóa để tránh spam
    await new Promise(r => setTimeout(r, 1000));
  }

  const statsAfter = await db.getStats();
  console.log('\n=============================================================');
  console.log(`🎉 HOÀN TẤT NẠP DỮ LIỆU!`);
  console.log(`   - Số doanh nghiệp mới vừa lưu: +${totalSaved}`);
  console.log(`   - Tổng số doanh nghiệp trong Database: ${statsAfter.total}`);
  console.log(`   - Dữ liệu đã lập tức có mặt trên web mst0.com và sitemap.xml!`);
  console.log('=============================================================\n');

  rl.close();
}

main().catch(err => {
  console.error('Lỗi chạy seeder:', err);
  rl.close();
});
