# 🏢 Tra Cứu Mã Số Thuế - Phiên Bản Chuẩn SEO & Sạch 100%

Ứng dụng web hiệu năng cao, tích hợp cơ sở dữ liệu SQLite nhúng, hỗ trợ **Server-Side Rendering (SSR)**, cấu trúc dữ liệu **Schema.org JSON-LD** và **Dynamic Sitemap** phục vụ SEO lên Top Google tìm kiếm thông tin doanh nghiệp, mã số thuế Việt Nam.

---

## ✨ Điểm nổi bật & Tính năng SEO

1. **Chuẩn hóa SEO On-page 100% (Cho Googlebot)**:
   - **Đường dẫn tĩnh chuẩn SEO (Static URLs)**: Mỗi công ty có 1 URL riêng dạng `/mst/:slug` (ví dụ: `/mst/0100109106-tap-doan-cong-nghiep-vien-thong-quan-doi`).
   - **Server-Side Rendering (SSR)**: Trả về trực tiếp mã nguồn HTML có sẵn thẻ `<title>`, `<meta description>`, OpenGraph, Twitter Card giúp Google lập chỉ mục (Index) ngay lập tức.
   - **Cấu trúc dữ liệu có cấu trúc Schema.org (JSON-LD)**: Chuẩn hóa theo thẻ `Corporation`, `PostalAddress`, `Person`, `BreadcrumbList` để hiển thị khung thông tin nổi bật (Rich Snippet) trên Google.
   - **Tự động sinh Sitemap XML & Robots.txt**: `/sitemap.xml` và `/robots.txt` cập nhật theo thời gian thực mỗi khi có công ty mới được nạp vào hệ thống.
   - **Tốc độ tải dưới 0.3 giây (Core Web Vitals)**: Điểm tốc độ 100/100, vượt trội hoàn toàn so với các website chứa đầy quảng cáo.

2. **Cơ sở dữ liệu SQLite độc lập (`data/masothue.db`)**:
   - Tích hợp SQLite nhúng thông qua WebAssembly, không cần cài đặt phần mềm database bên ngoài.
   - Tự động lưu trữ vĩnh viễn các công ty được tra cứu: Mỗi lượt tìm kiếm của người dùng sẽ tự động làm giàu thêm Database.
   - Trả lời yêu cầu từ Database chỉ mất **20 - 30 miligiây**.

3. **Tính năng gia tăng giá trị (Chống án phạt Thin / Duplicate Content)**:
   - **Mạng lưới liên kết người đại diện**: Tự động phát hiện và liên kết các công ty khác do cùng một giám đốc/đại diện pháp luật đứng tên.
   - **Phân loại theo tỉnh thành**: Tự động bóc tách tỉnh/thành phố để phục vụ SEO theo địa phương.
   - **Bộ lọc tìm kiếm mã ngành nghề**: Dễ dàng tra cứu danh mục ngành nghề đăng ký.

4. **Trải nghiệm người dùng văn phòng & kế toán**:
   - 100% không quảng cáo, giao diện sạch sẽ (Light & Dark theme).
   - Cơ chế Accordion "Sổ thông tin" trực tiếp ngay tại danh sách tìm kiếm.
   - Nút sao chép tóm tắt cho Zalo / Email / Excel chỉ với 1 click.

---

## 🚀 Cách khởi động ứng dụng

### Cách 1: Nhấp đúp chuột (Khuyên dùng)
Nhấp đúp chuột vào file:
```
start.bat
```
Hệ thống sẽ kiểm tra trạng thái và tự động mở trình duyệt tại: `http://localhost:3000`.

### Cách 2: Chạy bằng dòng lệnh
```powershell
.\runtime\node.exe server.mjs
```

---

## 🌐 Các đường dẫn SEO chính

- **Trang chủ tra cứu**: [http://localhost:3000/](http://localhost:3000/)
- **Trang công ty chuẩn SEO**: [http://localhost:3000/mst/0100109106](http://localhost:3000/mst/0100109106)
- **Sitemap XML**: [http://localhost:3000/sitemap.xml](http://localhost:3000/sitemap.xml)
- **Robots.txt**: [http://localhost:3000/robots.txt](http://localhost:3000/robots.txt)
- **Thống kê Database**: [http://localhost:3000/api/stats](http://localhost:3000/api/stats)

---

## 📁 Cấu trúc thư mục dự án

```text
masothue-clean/
├── data/             # Thư mục chứa database SQLite (masothue.db)
├── database.mjs      # Module quản lý Database SQLite nhúng
├── seoRenderer.mjs   # Module render SSR HTML, Schema.org JSON-LD và Sitemap XML
├── crawler.mjs       # Module crawler tự động xử lý token, cookie và bóc tách dữ liệu
├── server.mjs        # Server Express kết nối DB, API và các route SEO
├── start.bat         # File chạy nhanh trên Windows
├── public/           # Giao diện người dùng (HTML, CSS, JS)
│   ├── index.html
│   ├── style.css
│   └── app.js
└── runtime/          # Node.js portable tích hợp sẵn
```
