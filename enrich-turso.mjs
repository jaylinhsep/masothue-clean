import fs from 'fs';
import { db } from './database.mjs';
import { MasothueCrawler } from './crawler.mjs';

// Auto-load .env
if (fs.existsSync('.env')) {
  const content = fs.readFileSync('.env', 'utf-8');
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = (m[2] || '').trim().replace(/^['"](.*)['"]$/, '$1');
    }
  }
}

async function main() {
  console.log('\n=============================================================');
  console.log('   TOOL BỔ SUNG CHI TIẾT ĐẦY ĐỦ DOANH NGHIỆP (DATA ENRICHER) ');
  console.log('   Cập nhật: Người đại diện, SĐT, Ngày HĐ, Cơ quan thuế...   ');
  console.log('=============================================================\n');

  await db.init();
  console.log(`[DB] Đang kết nối tới: ${db.isTurso ? '☁️ Turso Cloud 5GB' : '💻 Local SQLite'}`);

  // Query companies that are missing phone, startDate, or managedBy
  const res = await db.client.execute(`
    SELECT taxId, name, slug FROM companies 
    WHERE phone IS NULL OR phone = '' 
       OR data NOT LIKE '%startDate%'
       OR data NOT LIKE '%managedBy%'
    ORDER BY updatedAt ASC
  `);

  const pending = res.rows;
  console.log(`[Tổng số] Phát hiện ${pending.length} công ty cần nạp đầy đủ thông tin chi tiết.\n`);

  if (pending.length === 0) {
    console.log('🎉 Tuyệt vời! Tất cả công ty trong cơ sở dữ liệu đã có đầy đủ thông tin.');
    process.exit(0);
  }

  const crawler = new MasothueCrawler();
  let updatedCount = 0;
  let failCount = 0;

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];
    const path = item.slug ? `/${item.slug}` : `/${item.taxId}`;
    const progress = `[${i + 1}/${pending.length}]`;

    process.stdout.write(`${progress} Đang nạp: ${item.name.slice(0, 40)} (MST: ${item.taxId})... `);

    try {
      const detail = await crawler.getDetail(path);
      if (detail.success && detail.data) {
        // Save enriched company to Turso Cloud
        await db.saveCompany(detail.data);
        updatedCount++;
        console.log(`✓ XONG!`);
        if (detail.data.representative || detail.data.managedBy) {
          console.log(`       -> Đại diện: ${detail.data.representative || 'N/A'} | Ngày HĐ: ${detail.data.startDate || 'N/A'} | Thuế: ${detail.data.managedBy || 'N/A'}`);
        }
      } else {
        failCount++;
        console.log(`⚠️ Không tìm thấy trang chi tiết.`);
      }
    } catch (err) {
      failCount++;
      console.log(`❌ Lỗi: ${err.message}`);
    }

    // Nghỉ nhẹ 600ms giữa các công ty để giữ kết nối mượt mà
    await new Promise(r => setTimeout(r, 600));
  }

  console.log('\n=============================================================');
  console.log(`🎉 HOÀN THÀNH BỔ SUNG DỮ LIỆU!`);
  console.log(`   - Cập nhật thành công: ${updatedCount} công ty`);
  console.log(`   - Bỏ qua / Không tìm thấy: ${failCount} công ty`);
  console.log('=============================================================\n');
}

main().catch(console.error);
