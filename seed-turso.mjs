import readline from 'readline';
import fs from 'fs';
import { db } from './database.mjs';
import { MasothueCrawler } from './crawler.mjs';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = (query) => new Promise(resolve => rl.question(query, resolve));

// Kho từ khóa phong phú đa ngành nghề
const INDUSTRIES = [
  'bất động sản', 'xây dựng', 'thương mại', 'vận tải', 'logistics',
  'công nghệ thông tin', 'dịch vụ du lịch', 'xuất nhập khẩu', 'nội thất', 'dược phẩm',
  'thực phẩm', 'tư vấn đầu tư', 'năng lượng', 'truyền thông', 'quảng cáo',
  'cơ khí', 'may mặc', 'giáo dục', 'tài chính', 'nông nghiệp',
  'y tế', 'mỹ phẩm', 'bảo hiểm', 'khoáng sản', 'hóa chất',
  'bao bì', 'in ấn', 'nhà hàng', 'khách sạn', 'phần mềm',
  'kiến trúc', 'điện tử', 'thủy sản', 'bảo vệ', 'vệ sinh công nghiệp'
];

// Kho tỉnh thành & địa bàn trọng điểm
const PROVINCES = [
  'Hà Nội', 'TP Hồ Chí Minh', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ',
  'Bình Dương', 'Đồng Nai', 'Bà Rịa Vũng Tàu', 'Long An', 'Bắc Ninh',
  'Quảng Ninh', 'Thanh Hóa', 'Nghệ An', 'Khánh Hòa', 'Lâm Đồng',
  'Thừa Thiên Huế', 'Kiên Giang', 'Bình Định', 'Bình Phước', 'Quảng Nam',
  'Hải Dương', 'Vĩnh Phúc', 'Nam Định', 'Thái Nguyên', 'Bắc Giang'
];

// Từ khóa thương hiệu / phong thủy kinh doanh
const BRAND_TERMS = [
  'vượng phát', 'thịnh vượng', 'phát đạt', 'đại phát', 'hưng thịnh',
  'toàn cầu', 'việt nam', 'đông á', 'á châu', 'phú quý',
  'an bình', 'minh quang', 'tiến phát', 'hòa bình', 'tân phát',
  'sơn hà', 'đại việt', 'phương đông', 'hoàng gia', 'phúc hưng',
  'nam việt', 'bảo an', 'thành công', 'khang thịnh', 'hưng phát',
  'việt nhật', 'việt hàn', 'hải âu', 'kim ngân', 'việt á',
  'sao mai', 'hoàng long', 'phát tiến', 'thiên long', 'đại nam'
];

function shuffleArray(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function getRandomCombination() {
  const ind = INDUSTRIES[Math.floor(Math.random() * INDUSTRIES.length)];
  const prov = PROVINCES[Math.floor(Math.random() * PROVINCES.length)];
  return `${ind} ${prov}`;
}

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
  console.log('1. 🎲 Nạp NGẪU NHIÊN 40 từ khóa (Được xáo trộn hoàn toàn, không lặp lại)');
  console.log('2. ♾️  Chế độ TREO MÁY VÔ TẬN (Ghép ngẫu nhiên Ngành nghề + Tỉnh thành, chạy liên tục)');
  console.log('3. ✍️  Nhập từ khóa tùy chọn (ví dụ: FPT, Viettel, Quận 1, Hà Nội...)');
  
  const choice = await ask('\nNhập lựa chọn của bạn (1, 2 hoặc 3) [Mặc định 1]: ');
  
  let isInfinite = false;
  let keywords = [];

  if (choice.trim() === '2') {
    isInfinite = true;
    console.log('\n⚡ Đã bật CHẾ ĐỘ TREO MÁY VÔ TẬN. Hệ thống sẽ liên tục tạo từ khóa ngẫu nhiên.');
    console.log('   (Bạn có thể bấm Ctrl + C bất cứ lúc nào để dừng lại an toàn)\n');
  } else if (choice.trim() === '3') {
    const custom = await ask('Nhập từ khóa bạn muốn cào nạp (phân cách bằng dấu phẩy nếu nhiều): ');
    if (custom.trim()) {
      keywords = custom.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      keywords = shuffleArray([...INDUSTRIES, ...BRAND_TERMS]).slice(0, 40);
    }
  } else {
    // Chế độ 1: Xáo trộn ngẫu nhiên hoàn toàn
    keywords = shuffleArray([...INDUSTRIES, ...BRAND_TERMS]).slice(0, 40);
  }

  let totalSaved = 0;
  let loopIndex = 0;

  while (true) {
    loopIndex++;
    let kw = '';

    if (isInfinite) {
      kw = getRandomCombination();
    } else {
      if (loopIndex > keywords.length) break;
      kw = keywords[loopIndex - 1];
    }

    const progressLabel = isInfinite ? `[Vòng ${loopIndex}]` : `[${loopIndex}/${keywords.length}]`;
    console.log(`\n${progressLabel} 🔍 Đang tìm kiếm từ khóa: "${kw}"...`);
    
    try {
      const res = await crawler.search(kw, 'auto', 1);
      if (res && res.items && res.items.length > 0) {
        console.log(`   -> Tìm thấy ${res.items.length} công ty. Đang lưu vào Database...`);
        let savedInBatch = 0;
        
        for (const item of res.items) {
          if (!item.taxId) continue;
          try {
            // Lưu trực tiếp thông tin chuẩn xác từ kết quả tìm kiếm (Siêu nhanh & Không lo bị rate limit)
            const companyToSave = {
              taxId: item.taxId,
              name: item.name,
              representative: item.representative || '',
              address: item.address || '',
              status: 'Đang hoạt động'
            };

            const saved = await db.saveCompany(companyToSave);
            if (saved) {
              totalSaved++;
              savedInBatch++;
              process.stdout.write(`   ✓ [${item.taxId}] ${item.name.slice(0, 48)}\n`);
            }
          } catch (itemErr) {
            // Bỏ qua lỗi từng item đơn lẻ
          }
        }
        console.log(`   -> Hoàn tất lưu ${savedInBatch}/${res.items.length} công ty.`);
        // Nghỉ an toàn 2.5 giây giữa các từ khóa
        const safeDelay = 2200 + Math.floor(Math.random() * 800);
        await new Promise(r => setTimeout(r, safeDelay));
      } else {
        console.log(`   -> Tạm thời không có kết quả mới cho "${kw}". Hạ nhiệt 4 giây...`);
        await new Promise(r => setTimeout(r, 4000));
      }
    } catch (err) {
      console.log(`   ⚠️ Lỗi cào từ khóa "${kw}": ${err.message}. Tự động bỏ qua.`);
      await new Promise(r => setTimeout(r, 3000));
    }
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
