import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './database.mjs';
import { MasothueCrawler } from './crawler.mjs';

// Disable IndexNow during mass seeding to avoid cluttering console
process.env.INDEXNOW_ENABLED = 'false';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple .env loader
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  const envContent = fs.readFileSync(envFile, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [k, ...v] = trimmed.split('=');
    if (k && v.length) {
      process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
    }
  }
}

const STATE_FILE = path.join(__dirname, 'worker_state.json');
const MAX_SERPER_PER_DAY = 2400; // Strict daily cap to protect user quota

// Standard Modulo 11 check digit calculation for Vietnam 10-digit Tax Codes
function calculateCheckDigit(nineDigits) {
  if (!nineDigits || nineDigits.length !== 9) return null;
  const weights = [31, 29, 23, 19, 17, 13, 7, 5, 3];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(nineDigits[i], 10) * weights[i];
  }
  const remainder = sum % 11;
  const checkDigit = 10 - remainder;
  return (checkDigit >= 0 && checkDigit <= 9) ? checkDigit.toString() : null;
}

// Get current date formatted in Vietnam timezone (UTC+7)
function getVietnamDate() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const vnTime = new Date(utc + (3600000 * 7));
  return vnTime.toISOString().slice(0, 10);
}

// Default initial state
function getDefaultState() {
  return {
    lastDate: getVietnamDate(),
    serperUsedToday: 0,
    maxSerperPerDay: MAX_SERPER_PER_DAY,
    totalSaved: 0,
    activeRangeIndex: 0,
    ranges: [
      {
        id: 'tphcm-2024-2026',
        name: 'TP. Hồ Chí Minh (Dải mới 2024-2026)',
        current: 31805300,
        end: 31850000,
        province: 'TP Hồ Chí Minh'
      },
      {
        id: 'hanoi-2024-2026',
        name: 'Hà Nội (Dải mới 2024-2026)',
        current: 11000000,
        end: 11050000,
        province: 'Hà Nội'
      },
      {
        id: 'binhduong-2024-2026',
        name: 'Bình Dương (Dải mới 2024-2026)',
        current: 37030000,
        end: 37035000,
        province: 'Bình Dương'
      },
      {
        id: 'danang-2024-2026',
        name: 'Đà Nẵng (Dải mới 2024-2026)',
        current: 40200000,
        end: 40230000,
        province: 'Đà Nẵng'
      }
    ]
  };
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      const today = getVietnamDate();
      if (data.lastDate !== today) {
        console.log(`\n[DATE RESET] Đã bước sang ngày mới (${today}). Reset bộ đếm Serper về 0 / ${MAX_SERPER_PER_DAY}.`);
        data.lastDate = today;
        data.serperUsedToday = 0;
      }
      return data;
    } catch (e) {
      console.warn('[State Load Error, using default]:', e.message);
    }
  }
  const def = getDefaultState();
  saveState(def);
  return def;
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Error saving state]:', e.message);
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runWorker() {
  console.log(`\n======================================================`);
  console.log(`  HỆ THỐNG NẠP DỮ LIỆU TỰ ĐỘNG - MST0.COM`);
  console.log(`  Khóa bảo vệ: Tối đa ${MAX_SERPER_PER_DAY} Serper / ngày`);
  console.log(`  Thuật toán: Modulo 11 + Lọc trước VietQR (Miễn phí 100%)`);
  console.log(`======================================================\n`);

  await db.init();
  const crawler = new MasothueCrawler();
  let state = loadState();

  const serperKey = (process.env.SERPER_API_KEY || process.env.SERPER_KEY || '').trim();
  if (!serperKey) {
    console.log(`⚠️  [CHÚ Ý QUAN TRỌNG VỀ SERPER]`);
    console.log(`    Chưa tìm thấy SERPER_API_KEY trong file .env trên máy tính của bạn.`);
    console.log(`    Worker sẽ tạm thời nạp Tên + Địa chỉ từ VietQR (Miễn phí 100%).`);
    console.log(`    -> Để lấy cả Người đại diện & Chi cục thuế, bạn hãy mở file .env và thêm dòng:`);
    console.log(`       SERPER_API_KEY=key_của_bạn\n`);
  } else {
    console.log(`🔑 [SERPER KEY] Đã nhận diện Serper Key: ${serperKey.slice(0, 8)}... (Khóa an toàn: ${MAX_SERPER_PER_DAY}/ngày)\n`);
  }

  console.log(`[TRẠNG THÁI] Ngày: ${state.lastDate}`);
  console.log(`[TRẠNG THÁI] Đã dùng Serper hôm nay: ${state.serperUsedToday} / ${MAX_SERPER_PER_DAY}`);
  console.log(`[TRẠNG THÁI] Tổng công ty nạp thành công: ${state.totalSaved}\n`);

  let isRunning = true;
  process.on('SIGINT', () => {
    console.log('\n\n[ĐANG TẠM DỪNG] Lưu vị trí hiện tại và thoát an toàn...');
    saveState(state);
    process.exit(0);
  });

  while (isRunning) {
    // Check if new day
    const today = getVietnamDate();
    if (state.lastDate !== today) {
      state.lastDate = today;
      state.serperUsedToday = 0;
      console.log(`\n🌟 Sang ngày mới ${today}. Khởi động lại hạn ngạch Serper (0 / ${MAX_SERPER_PER_DAY})!`);
      saveState(state);
    }

    const currentRange = state.ranges[state.activeRangeIndex];
    if (!currentRange || currentRange.current >= currentRange.end) {
      state.activeRangeIndex = (state.activeRangeIndex + 1) % state.ranges.length;
      console.log(`\n[CHUYỂN DẢI] Chuyển sang: ${state.ranges[state.activeRangeIndex].name}`);
      saveState(state);
      continue;
    }

    const currentNum = currentRange.current;
    currentRange.current++; // Move to next number for next loop

    const nineDigits = String(currentNum).padStart(9, '0');
    const checkDigit = calculateCheckDigit(nineDigits);

    // If invalid modulo 11 combination, skip without calling any API
    if (!checkDigit) {
      continue;
    }

    const taxId = nineDigits + checkDigit;

    // Hiển thị tiến độ quét liên tục theo thời gian thực (không để màn hình bị đứng)
    process.stdout.write(`\r🔍 [Đang quét] MST: ${taxId} | Đã lưu: ${state.totalSaved} | Serper: ${state.serperUsedToday}/${MAX_SERPER_PER_DAY}   `);

    // Check if already in DB
    const existing = await db.getCompanyByTaxId(taxId);
    if (existing && existing.representative && existing.representative.trim().length > 2) {
      // Already complete in DB, skip
      continue;
    }

    // TẦNG 1: Thăm dò VietQR (Miễn phí 100%, không tốn quota Serper)
    let vCompany = null;
    try {
      vCompany = await crawler.getFromVietQR(taxId);
    } catch (e) {
      // Small pause if network hiccups
      await sleep(500);
      continue;
    }

    // Xử lý khi VietQR yêu cầu tạm nghỉ (HTTP 429)
    if (vCompany && vCompany.isRateLimited) {
      const waitSec = Math.min(vCompany.retryAfter || 60, 300);
      console.log(`\n\n⏸️  [VIETQR HẠ NHIỆT] Cổng VietQR đang yêu cầu tạm nghỉ để tránh spam.`);
      for (let s = waitSec; s > 0; s--) {
        process.stdout.write(`\r   ⏳ Tự động tiếp tục sau: ${s} giây... `);
        await sleep(1000);
      }
      process.stdout.write('\r   ✓ Đã hết thời gian chờ! Đang tiếp tục quét...\n\n');
      currentRange.current--; // Không bỏ sót số này
      continue;
    }

    if (!vCompany || !vCompany.name) {
      // Mã số thuế này chưa được cấp hoặc chưa hoạt động
      // Lưu state định kỳ mỗi 5 số
      if (currentNum % 5 === 0) {
        saveState(state);
      }
      // Giãn cách an toàn 2.5s - 3.2s để bảo vệ IP, tuyệt đối không bị VietQR chặn 429
      const safeDelay = Math.floor(Math.random() * 700) + 2500;
      await sleep(safeDelay);
      continue;
    }

    // PHÁT HIỆN DOANH NGHIỆP THẬT!
    console.log(`\n\n🏢 [TÌM THẤY DOANH NGHIỆP] MST: ${taxId}`);
    console.log(`   Tên: ${vCompany.name}`);
    console.log(`   Địa chỉ: ${vCompany.address}`);

    let finalCompany = { ...vCompany };

    // TẦNG 2: Làm giàu qua Serper (nếu có key và còn trong hạn ngạch < 2400/ngày)
    if (serperKey && state.serperUsedToday < MAX_SERPER_PER_DAY) {
      try {
        console.log(`   🔍 Đang lấy Người đại diện & Chi cục thuế qua Serper (Lượt ${state.serperUsedToday + 1}/${MAX_SERPER_PER_DAY})...`);
        const serperInfo = await crawler.enrichViaSerper(taxId, vCompany.name);
        state.serperUsedToday++;

        if (serperInfo) {
          finalCompany = {
            ...finalCompany,
            ...serperInfo,
            managedBy: serperInfo.managedBy || finalCompany.managedBy || 'Cơ quan Thuế'
          };
          console.log(`   ✓ Người đại diện: ${serperInfo.representative || 'Chưa cập nhật'}`);
          if (serperInfo.managedBy) console.log(`   ✓ Quản lý bởi: ${serperInfo.managedBy}`);
          if (serperInfo.phone) console.log(`   ✓ SĐT: ${serperInfo.phone}`);
        } else {
          console.log(`   ℹ️ Serper không tìm thấy thông tin bổ sung, giữ nguyên thông tin gốc.`);
        }
      } catch (err) {
        console.warn(`   ⚠️ Lỗi Serper:`, err.message);
      }
    } else {
      console.log(`   🛑 [ĐÃ CHẠM TRẦN 2.400 SERPER/NGÀY] Lưu thông tin cơ bản để bảo vệ tài khoản Serper!`);
    }

    // TẦNG 3: Lưu vào Turso DB
    try {
      await db.saveCompany(finalCompany);
      state.totalSaved++;
      console.log(`   💾 Đã lưu thành công vào Turso Cloud! (Tổng: ${state.totalSaved})`);
    } catch (e) {
      console.error(`   ❌ Lỗi lưu DB:`, e.message);
    }

    saveState(state);

    // Nghỉ ngơi an toàn 3.5s - 5.0s giữa các công ty thật
    const delay = Math.floor(Math.random() * 1500) + 3500;
    await sleep(delay);
  }
}

runWorker().catch(err => {
  console.error('[Worker Fatal Error]:', err);
});
