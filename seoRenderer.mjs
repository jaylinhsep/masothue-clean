import { VIETNAM_PROVINCES, TOP_INDUSTRIES } from './database.mjs';

export class SeoRenderer {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  getProvinceSlug(name) {
    if (!name) return 'toan-quoc';
    const clean = name.toLowerCase().trim();
    const found = VIETNAM_PROVINCES.find(p => p.name.toLowerCase() === clean);
    if (found) return found.slug;
    return clean.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  getIndustrySlug(mainIndustry) {
    if (!mainIndustry) return '4690-ban-buon-tong-hop';
    const m = mainIndustry.match(/Mã:\s*(\d{4})/i);
    if (m) {
      const found = TOP_INDUSTRIES.find(ind => ind.code === m[1]);
      if (found) return found.slug;
      return m[1];
    }
    return '4690-ban-buon-tong-hop';
  }

  renderCommonHeader(activeHub = '', host = 'localhost:3000') {
    return `
    <header class="navbar">
      <div class="nav-container">
        <a href="/" class="brand" style="text-decoration: none;">
          <div class="brand-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 21h18"/><path d="M3 7v14"/><path d="M21 7v14"/>
              <path d="M6 10h2"/><path d="M6 14h2"/><path d="M6 18h2"/>
              <path d="M16 10h2"/><path d="M16 14h2"/><path d="M16 18h2"/>
              <path d="M10 21V3h4v18"/>
            </svg>
          </div>
          <div>
            <span class="brand-title">Mã Số Thuế <span class="clean-badge">Bản Sạch</span></span>
            <span class="brand-subtitle">Tra cứu thông tin công ty • Tốc độ cao • Chuẩn SEO</span>
          </div>
        </a>

        <nav class="hub-nav-menu">
          <a href="/tinh-thanh" class="hub-nav-link ${activeHub === 'tinh-thanh' ? 'active' : ''}">📍 Tỉnh thành</a>
          <a href="/nganh-nghe" class="hub-nav-link ${activeHub === 'nganh-nghe' ? 'active' : ''}">🏭 Ngành nghề</a>
          <a href="/doanh-nghiep-moi" class="hub-nav-link ${activeHub === 'doanh-nghiep-moi' ? 'active' : ''}">⚡ Mới cập nhật</a>
          <a href="/" class="hub-nav-link btn-search-nav">🔍 Tìm kiếm</a>
        </nav>
      </div>
    </header>`;
  }

  renderCommonFooter() {
    return `
    <footer class="footer">
      <div class="footer-container">
        <div class="footer-hub-links">
          <div class="footer-hub-col">
            <h4>Khu vực trọng điểm</h4>
            <div class="footer-links-grid">
              <a href="/tinh-thanh/tp-ho-chi-minh">Doanh nghiệp TP.HCM</a>
              <a href="/tinh-thanh/ha-noi">Doanh nghiệp Hà Nội</a>
              <a href="/tinh-thanh/da-nang">Doanh nghiệp Đà Nẵng</a>
              <a href="/tinh-thanh/binh-duong">Doanh nghiệp Bình Dương</a>
              <a href="/tinh-thanh/dong-nai">Doanh nghiệp Đồng Nai</a>
              <a href="/tinh-thanh/hai-phong">Doanh nghiệp Hải Phòng</a>
            </div>
          </div>
          <div class="footer-hub-col">
            <h4>Ngành nghề phổ biến</h4>
            <div class="footer-links-grid">
              <a href="/nganh-nghe/4690-ban-buon-tong-hop">Bán buôn tổng hợp</a>
              <a href="/nganh-nghe/4100-xay-dung-nha">Xây dựng & Công trình</a>
              <a href="/nganh-nghe/6810-bat-dong-san">Bất động sản & Nhà đất</a>
              <a href="/nganh-nghe/6201-lap-trinh-may-vi-tinh">Lập trình máy vi tính & CNTT</a>
              <a href="/nganh-nghe/4933-van-tai-logistics">Vận tải & Logistics</a>
              <a href="/nganh-nghe/4646-duoc-pham-y-te">Dược phẩm & Y tế</a>
            </div>
          </div>
        </div>
        <p style="margin-top: 24px; border-top: 1px solid var(--border); padding-top: 16px;">
          Tra Cứu Mã Số Thuế Sạch • Dữ liệu công khai từ Cổng thông tin Doanh nghiệp & Tổng cục Thuế
        </p>
        <p class="footer-sub">Hệ thống tối ưu SEO, không quảng cáo, tốc độ tải dưới 0.3s.</p>
      </div>
    </footer>`;
  }

  renderPagination(currentPage, maxPage, baseUrl) {
    if (maxPage <= 1) return '';
    const cleanUrl = baseUrl.split('?')[0];
    
    let html = `<div class="hub-pagination">`;
    if (currentPage > 1) {
      const prevUrl = currentPage === 2 ? cleanUrl : `${cleanUrl}?page=${currentPage - 1}`;
      html += `<a href="${prevUrl}" class="page-link prev-link">← Trang trước</a>`;
    }

    const start = Math.max(1, currentPage - 2);
    const end = Math.min(maxPage, currentPage + 2);

    if (start > 1) {
      html += `<a href="${cleanUrl}" class="page-link">1</a>`;
      if (start > 2) html += `<span class="page-dots">...</span>`;
    }

    for (let p = start; p <= end; p++) {
      if (p === currentPage) {
        html += `<span class="page-link active">${p}</span>`;
      } else {
        const u = p === 1 ? cleanUrl : `${cleanUrl}?page=${p}`;
        html += `<a href="${u}" class="page-link">${p}</a>`;
      }
    }

    if (end < maxPage) {
      if (end < maxPage - 1) html += `<span class="page-dots">...</span>`;
      html += `<a href="${cleanUrl}?page=${maxPage}" class="page-link">${maxPage}</a>`;
    }

    if (currentPage < maxPage) {
      html += `<a href="${cleanUrl}?page=${currentPage + 1}" class="page-link next-link">Trang sau →</a>`;
    }
    html += `</div>`;
    return html;
  }

  // ==========================================
  // 1. HUB: DANH BẠ 63 TỈNH THÀNH (INDEX)
  // ==========================================
  renderProvincesIndexPage(provincesWithCounts = [], host = 'localhost:3000') {
    const domain = `https://${host}`;
    const pageUrl = `${domain}/tinh-thanh`;
    const countMap = {};
    for (const item of provincesWithCounts) {
      countMap[item.province] = item.count;
    }

    const title = `Danh Bạ Doanh Nghiệp 63 Tỉnh Thành Việt Nam | Tra Cứu Mã Số Thuế`;
    const description = `Danh bạ tra cứu mã số thuế doanh nghiệp theo 63 tỉnh thành phố Việt Nam: TP Hồ Chí Minh, Hà Nội, Đà Nẵng, Bình Dương, Đồng Nai... Cập nhật mới nhất, chuẩn SEO, không quảng cáo.`;

    const jsonLd = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "CollectionPage",
          "@id": `${pageUrl}#collection`,
          "name": title,
          "description": description,
          "url": pageUrl
        },
        {
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Trang chủ", "item": domain },
            { "@type": "ListItem", "position": 2, "name": "Danh bạ tỉnh thành", "item": pageUrl }
          ]
        }
      ]
    };

    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escape(title)}</title>
  <meta name="description" content="${this.escape(description)}">
  <link rel="canonical" href="${pageUrl}">
  <link rel="stylesheet" href="/style.css?v=8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="light-theme">
  ${this.renderCommonHeader('tinh-thanh', host)}

  <main class="main-content ssr-main-container">
    <nav aria-label="Breadcrumb" class="ssr-breadcrumb">
      <ol class="ssr-breadcrumb-list">
        <li class="ssr-breadcrumb-item"><a href="/" class="ssr-breadcrumb-link">Trang chủ</a></li>
        <li class="ssr-breadcrumb-sep">/</li>
        <li class="ssr-breadcrumb-item ssr-breadcrumb-item--current" aria-current="page">Danh bạ tỉnh thành</li>
      </ol>
    </nav>

    <div class="hub-hero">
      <h1 class="hub-title">Danh Bạ Doanh Nghiệp 63 Tỉnh Thành</h1>
      <p class="hub-desc">Tra cứu thông tin công ty, người đại diện và mã số thuế phân loại theo địa phương trên toàn quốc.</p>
      
      <div class="hub-search-box">
        <input type="text" id="filter-province-input" class="hub-filter-input" placeholder="🔍 Gõ tên tỉnh thành để lọc nhanh (Hà Nội, Sài Gòn, Đà Nẵng...)" oninput="filterProvinces(this.value)">
      </div>
    </div>

    <!-- Hot provinces grid -->
    <section class="hub-section">
      <h2 class="hub-section-title">⭐ Trung tâm kinh tế trọng điểm</h2>
      <div class="province-cards-grid">
        ${VIETNAM_PROVINCES.filter(p => p.isHot).map(p => {
          const c = countMap[p.name] || 0;
          return `
            <a href="/tinh-thanh/${p.slug}" class="province-card hot-card">
              <div class="prov-card-header">
                <span class="prov-icon">🏢</span>
                <span class="prov-badge">${c > 0 ? `${c} công ty` : 'Tra cứu'}</span>
              </div>
              <h3 class="prov-name">${this.escape(p.name)}</h3>
              <p class="prov-sub">${p.region} • Tra cứu mã số thuế</p>
            </a>
          `;
        }).join('')}
      </div>
    </section>

    <!-- All 63 Provinces grouped by Region -->
    <section class="hub-section">
      <h2 class="hub-section-title">📍 Tất cả các tỉnh thành trên toàn quốc (63 tỉnh thành)</h2>
      <div class="province-all-grid" id="all-provinces-container">
        ${VIETNAM_PROVINCES.map(p => {
          const c = countMap[p.name] || 0;
          return `
            <a href="/tinh-thanh/${p.slug}" class="province-item-link" data-name="${p.name.toLowerCase()}">
              <span class="prov-item-name">${this.escape(p.name)}</span>
              <span class="prov-item-count">${c > 0 ? c : ''}</span>
            </a>
          `;
        }).join('')}
      </div>
    </section>
  </main>

  ${this.renderCommonFooter()}

  <script>
    function filterProvinces(val) {
      const q = val.toLowerCase().trim();
      const items = document.querySelectorAll('#all-provinces-container .province-item-link');
      items.forEach(el => {
        const name = el.getAttribute('data-name') || '';
        el.style.display = name.includes(q) ? 'flex' : 'none';
      });
    }
  </script>
</body>
</html>`;
  }

  // ==========================================
  // 2. HUB: CHI TIẾT TỈNH THÀNH (PAGINATED)
  // ==========================================
  renderProvinceDetailPage(provinceInfo, data, host = 'localhost:3000') {
    const domain = `https://${host}`;
    const pageUrl = `${domain}/tinh-thanh/${provinceInfo.slug}${data.currentPage > 1 ? '?page=' + data.currentPage : ''}`;
    const cleanBaseUrl = `${domain}/tinh-thanh/${provinceInfo.slug}`;

    const title = `Danh Bạ Doanh Nghiệp Tại ${provinceInfo.name} - Tra Cứu Mã Số Thuế (Trang ${data.currentPage})`;
    const description = `Danh sách doanh nghiệp, người đại diện pháp luật và mã số thuế tại ${provinceInfo.name}. Tra cứu thông tin thuế công khai, cập nhật nhanh và không quảng cáo.`;

    const jsonLd = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "CollectionPage",
          "@id": `${pageUrl}#collection`,
          "name": title,
          "description": description,
          "url": pageUrl
        },
        {
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Trang chủ", "item": domain },
            { "@type": "ListItem", "position": 2, "name": "Danh bạ tỉnh thành", "item": `${domain}/tinh-thanh` },
            { "@type": "ListItem", "position": 3, "name": provinceInfo.name, "item": cleanBaseUrl }
          ]
        },
        {
          "@type": "ItemList",
          "itemListElement": data.items.map((it, idx) => ({
            "@type": "ListItem",
            "position": idx + 1,
            "url": `${domain}/${(it.slug || '').replace(/^\/?(mst\/)?/, '')}`,
            "name": it.name
          }))
        }
      ]
    };

    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escape(title)}</title>
  <meta name="description" content="${this.escape(description)}">
  <link rel="canonical" href="${pageUrl}">
  <link rel="stylesheet" href="/style.css?v=8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="light-theme">
  ${this.renderCommonHeader('tinh-thanh', host)}

  <main class="main-content ssr-main-container">
    <nav aria-label="Breadcrumb" class="ssr-breadcrumb">
      <ol class="ssr-breadcrumb-list">
        <li class="ssr-breadcrumb-item"><a href="/" class="ssr-breadcrumb-link">Trang chủ</a></li>
        <li class="ssr-breadcrumb-sep">/</li>
        <li class="ssr-breadcrumb-item"><a href="/tinh-thanh" class="ssr-breadcrumb-link">Danh bạ tỉnh thành</a></li>
        <li class="ssr-breadcrumb-sep">/</li>
        <li class="ssr-breadcrumb-item ssr-breadcrumb-item--current" aria-current="page">${this.escape(provinceInfo.name)}</li>
      </ol>
    </nav>

    <div class="hub-hero">
      <h1 class="hub-title">Doanh Nghiệp Tại ${this.escape(provinceInfo.name)}</h1>
      <p class="hub-desc">Tổng cộng <strong>${data.total}</strong> doanh nghiệp đang hoạt động trên hệ thống dữ liệu tại ${this.escape(provinceInfo.name)}.</p>
    </div>

    <!-- Company Grid -->
    <div class="hub-companies-grid">
      ${data.items.map(it => {
        const cleanSlug = (it.slug || '').replace(/^\/?(mst\/)?/, '');
        return `
          <div class="hub-company-card">
            <div class="hub-card-header">
              <span class="badge-mst font-mono">MST: ${this.escape(it.taxId)}</span>
              <span class="status-badge status-active"><span class="status-dot"></span>Đang hoạt động</span>
            </div>
            <h2 class="hub-company-name">
              <a href="/${cleanSlug}">${this.escape(it.name)}</a>
            </h2>
            <div class="hub-company-meta">
              ${it.representative ? `
                <div class="meta-row">
                  <span class="meta-label">Đại diện:</span>
                  <span class="meta-val font-highlight">${this.escape(it.representative)}</span>
                </div>
              ` : ''}
              <div class="meta-row">
                <span class="meta-label">Địa chỉ:</span>
                <span class="meta-val">${this.escape(it.address)}</span>
              </div>
              ${it.mainIndustry ? `
                <div class="meta-row">
                  <span class="meta-label">Ngành nghề:</span>
                  <span class="meta-val">${this.escape(it.mainIndustry)}</span>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <!-- Pagination -->
    ${this.renderPagination(data.currentPage, data.maxPage, cleanBaseUrl)}

    <!-- Quick Other Provinces -->
    <div class="hub-related-provinces" style="margin-top: 40px; padding: 24px; background: var(--bg-card); border-radius: var(--radius-md); border: 1px solid var(--border);">
      <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 12px;">Xem doanh nghiệp tại các tỉnh thành lân cận:</h3>
      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
        ${VIETNAM_PROVINCES.filter(p => p.slug !== provinceInfo.slug).slice(0, 12).map(p => `
          <a href="/tinh-thanh/${p.slug}" style="text-decoration: none; padding: 6px 12px; background: var(--primary-light); color: var(--primary); border-radius: var(--radius-full); font-size: 0.85rem; font-weight: 600;">${p.name}</a>
        `).join('')}
      </div>
    </div>
  </main>

  ${this.renderCommonFooter()}
</body>
</html>`;
  }

  // ==========================================
  // 3. HUB: DANH BẠ NGÀNH NGHỀ (INDEX)
  // ==========================================
  renderIndustriesIndexPage(industriesWithCounts = [], host = 'localhost:3000') {
    const domain = `https://${host}`;
    const pageUrl = `${domain}/nganh-nghe`;

    const title = `Danh Bạ Doanh Nghiệp Theo Ngành Nghề Kinh Doanh | Tra Cứu Mã Số Thuế`;
    const description = `Tra cứu mã số thuế doanh nghiệp theo ngành nghề: Công nghệ thông tin, Xây dựng, Bất động sản, Vận tải logistics, Dược phẩm... Cập nhật mới nhất, không quảng cáo.`;

    const jsonLd = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "CollectionPage",
          "@id": `${pageUrl}#collection`,
          "name": title,
          "description": description,
          "url": pageUrl
        },
        {
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Trang chủ", "item": domain },
            { "@type": "ListItem", "position": 2, "name": "Danh bạ ngành nghề", "item": pageUrl }
          ]
        }
      ]
    };

    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escape(title)}</title>
  <meta name="description" content="${this.escape(description)}">
  <link rel="canonical" href="${pageUrl}">
  <link rel="stylesheet" href="/style.css?v=8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="light-theme">
  ${this.renderCommonHeader('nganh-nghe', host)}

  <main class="main-content ssr-main-container">
    <nav aria-label="Breadcrumb" class="ssr-breadcrumb">
      <ol class="ssr-breadcrumb-list">
        <li class="ssr-breadcrumb-item"><a href="/" class="ssr-breadcrumb-link">Trang chủ</a></li>
        <li class="ssr-breadcrumb-sep">/</li>
        <li class="ssr-breadcrumb-item ssr-breadcrumb-item--current" aria-current="page">Danh bạ ngành nghề</li>
      </ol>
    </nav>

    <div class="hub-hero">
      <h1 class="hub-title">Danh Bạ Doanh Nghiệp Theo Ngành Nghề</h1>
      <p class="hub-desc">Tra cứu các doanh nghiệp theo hệ thống phân ngành kinh tế Việt Nam (VSIC).</p>
    </div>

    <!-- Industry Cards Grid -->
    <div class="industry-cards-grid">
      ${TOP_INDUSTRIES.map(ind => `
        <a href="/nganh-nghe/${ind.slug}" class="industry-card">
          <div class="ind-icon">${ind.icon || '💼'}</div>
          <div class="ind-content">
            <span class="ind-code font-mono">Mã ngành: ${ind.code}</span>
            <h2 class="ind-name">${this.escape(ind.name)}</h2>
            <p class="ind-sub">Xem danh sách doanh nghiệp →</p>
          </div>
        </a>
      `).join('')}
    </div>
  </main>

  ${this.renderCommonFooter()}
</body>
</html>`;
  }

  // ==========================================
  // 4. HUB: CHI TIẾT NGÀNH NGHỀ (PAGINATED)
  // ==========================================
  renderIndustryDetailPage(industryInfo, data, host = 'localhost:3000') {
    const domain = `https://${host}`;
    const pageUrl = `${domain}/nganh-nghe/${industryInfo.slug}${data.currentPage > 1 ? '?page=' + data.currentPage : ''}`;
    const cleanBaseUrl = `${domain}/nganh-nghe/${industryInfo.slug}`;

    const title = `Doanh Nghiệp Ngành ${industryInfo.name} (Mã: ${industryInfo.code}) | Tra Cứu MST (Trang ${data.currentPage})`;
    const description = `Danh sách các công ty hoạt động trong ngành ${industryInfo.name} (Mã ngành: ${industryInfo.code}). Tra cứu người đại diện, mã số thuế, địa chỉ trụ sở mới nhất.`;

    const jsonLd = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "CollectionPage",
          "@id": `${pageUrl}#collection`,
          "name": title,
          "description": description,
          "url": pageUrl
        },
        {
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Trang chủ", "item": domain },
            { "@type": "ListItem", "position": 2, "name": "Danh bạ ngành nghề", "item": `${domain}/nganh-nghe` },
            { "@type": "ListItem", "position": 3, "name": industryInfo.name, "item": cleanBaseUrl }
          ]
        }
      ]
    };

    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escape(title)}</title>
  <meta name="description" content="${this.escape(description)}">
  <link rel="canonical" href="${pageUrl}">
  <link rel="stylesheet" href="/style.css?v=8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="light-theme">
  ${this.renderCommonHeader('nganh-nghe', host)}

  <main class="main-content ssr-main-container">
    <nav aria-label="Breadcrumb" class="ssr-breadcrumb">
      <ol class="ssr-breadcrumb-list">
        <li class="ssr-breadcrumb-item"><a href="/" class="ssr-breadcrumb-link">Trang chủ</a></li>
        <li class="ssr-breadcrumb-sep">/</li>
        <li class="ssr-breadcrumb-item"><a href="/nganh-nghe" class="ssr-breadcrumb-link">Danh bạ ngành nghề</a></li>
        <li class="ssr-breadcrumb-sep">/</li>
        <li class="ssr-breadcrumb-item ssr-breadcrumb-item--current" aria-current="page">${this.escape(industryInfo.name)}</li>
      </ol>
    </nav>

    <div class="hub-hero">
      <h1 class="hub-title">${this.escape(industryInfo.name)}</h1>
      <p class="hub-desc">Mã ngành tiêu chuẩn: <strong>${industryInfo.code}</strong> • Tìm thấy <strong>${data.total}</strong> công ty đăng ký.</p>
    </div>

    <!-- Company Grid -->
    <div class="hub-companies-grid">
      ${data.items.map(it => {
        const cleanSlug = (it.slug || '').replace(/^\/?(mst\/)?/, '');
        return `
          <div class="hub-company-card">
            <div class="hub-card-header">
              <span class="badge-mst font-mono">MST: ${this.escape(it.taxId)}</span>
              <span class="status-badge status-active"><span class="status-dot"></span>Đang hoạt động</span>
            </div>
            <h2 class="hub-company-name">
              <a href="/${cleanSlug}">${this.escape(it.name)}</a>
            </h2>
            <div class="hub-company-meta">
              ${it.representative ? `
                <div class="meta-row">
                  <span class="meta-label">Đại diện:</span>
                  <span class="meta-val font-highlight">${this.escape(it.representative)}</span>
                </div>
              ` : ''}
              <div class="meta-row">
                <span class="meta-label">Khu vực:</span>
                <span class="meta-val">${this.escape(it.province || it.address)}</span>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <!-- Pagination -->
    ${this.renderPagination(data.currentPage, data.maxPage, cleanBaseUrl)}
  </main>

  ${this.renderCommonFooter()}
</body>
</html>`;
  }

  // ==========================================
  // 5. HUB: DOANH NGHIỆP MỚI THÀNH LẬP / CẬP NHẬT
  // ==========================================
  renderRecentCompaniesPage(data, host = 'localhost:3000') {
    const domain = `https://${host}`;
    const pageUrl = `${domain}/doanh-nghiep-moi${data.currentPage > 1 ? '?page=' + data.currentPage : ''}`;
    const cleanBaseUrl = `${domain}/doanh-nghiep-moi`;

    const title = `Doanh Nghiệp Mới Thành Lập & Cập Nhật Gần Đây | Tra Cứu Mã Số Thuế (Trang ${data.currentPage})`;
    const description = `Danh sách các công ty mới thành lập và vừa cập nhật mã số thuế, người đại diện, số điện thoại mới nhất trên toàn quốc. Tra cứu miễn phí, tốc độ cao.`;

    const jsonLd = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "CollectionPage",
          "@id": `${pageUrl}#collection`,
          "name": title,
          "description": description,
          "url": pageUrl
        },
        {
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Trang chủ", "item": domain },
            { "@type": "ListItem", "position": 2, "name": "Doanh nghiệp mới", "item": cleanBaseUrl }
          ]
        }
      ]
    };

    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escape(title)}</title>
  <meta name="description" content="${this.escape(description)}">
  <link rel="canonical" href="${pageUrl}">
  <link rel="stylesheet" href="/style.css?v=8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="light-theme">
  ${this.renderCommonHeader('doanh-nghiep-moi', host)}

  <main class="main-content ssr-main-container">
    <nav aria-label="Breadcrumb" class="ssr-breadcrumb">
      <ol class="ssr-breadcrumb-list">
        <li class="ssr-breadcrumb-item"><a href="/" class="ssr-breadcrumb-link">Trang chủ</a></li>
        <li class="ssr-breadcrumb-sep">/</li>
        <li class="ssr-breadcrumb-item ssr-breadcrumb-item--current" aria-current="page">Doanh nghiệp mới cập nhật</li>
      </ol>
    </nav>

    <div class="hub-hero">
      <h1 class="hub-title">Doanh Nghiệp Mới Cập Nhật Gần Đây</h1>
      <p class="hub-desc">Cơ sở dữ liệu các công ty vừa đăng ký hoặc được cập nhật thông tin pháp lý mới nhất.</p>
    </div>

    <!-- Company Grid -->
    <div class="hub-companies-grid">
      ${data.items.map(it => {
        const cleanSlug = (it.slug || '').replace(/^\/?(mst\/)?/, '');
        return `
          <div class="hub-company-card">
            <div class="hub-card-header">
              <span class="badge-mst font-mono">MST: ${this.escape(it.taxId)}</span>
              <span class="badge-fresh">⚡ Mới</span>
            </div>
            <h2 class="hub-company-name">
              <a href="/${cleanSlug}">${this.escape(it.name)}</a>
            </h2>
            <div class="hub-company-meta">
              ${it.representative ? `
                <div class="meta-row">
                  <span class="meta-label">Đại diện:</span>
                  <span class="meta-val font-highlight">${this.escape(it.representative)}</span>
                </div>
              ` : ''}
              <div class="meta-row">
                <span class="meta-label">Khu vực:</span>
                <span class="meta-val">${this.escape(it.province || it.address)}</span>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <!-- Pagination -->
    ${this.renderPagination(data.currentPage, data.maxPage, cleanBaseUrl)}
  </main>

  ${this.renderCommonFooter()}
</body>
</html>`;
  }

  // ==========================================
  // 6. RENDER CHI TIẾT CÔNG TY (SSR COMPANY DETAIL)
  // ==========================================
  renderCompanyPage(company, relatedCompanies = [], host = 'localhost:3000') {
    const domain = `https://${host}`;
    const cleanSlug = (company.slug || '').replace(/^\/?(mst\/)?/, '');
    const pageUrl = `${domain}/${cleanSlug}`;
    const d = company.data || company;
    
    const s = (d.status || '').toLowerCase().trim();
    let statusClass = 'status-active';
    let statusText = d.status || 'Đang hoạt động';
    if (s.includes('không hoạt động') || s.includes('ngừng') || s.includes('đóng mã') || s.includes('giải thể') || s.includes('khoá') || s.includes('bỏ trốn') || s.includes('phá sản')) {
      statusClass = 'status-danger';
    } else if (s.includes('tạm ngừng') || s.includes('chờ') || s.includes('chưa')) {
      statusClass = 'status-warning';
    }

    const provinceName = d.province || 'Toàn Quốc';
    const provinceSlug = this.getProvinceSlug(provinceName);
    const industrySlug = this.getIndustrySlug(d.mainIndustry);

    const pageTitle = `Mã số thuế ${d.taxId} - ${d.name} | Tra Cứu Doanh Nghiệp`;
    const metaDescription = `Tra cứu thông tin mã số thuế ${d.taxId} của ${d.name}. Đại diện: ${d.representative || 'N/A'}. Địa chỉ: ${d.address || d.taxAddress}. Tình trạng: ${statusText}.`;

    // Schema.org JSON-LD (Corporation + Breadcrumb)
    const jsonLd = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Corporation",
          "@id": `${pageUrl}#corporation`,
          "name": d.name,
          "alternateName": d.internationalName || d.shortName || undefined,
          "taxID": d.taxId,
          "telephone": d.phone || undefined,
          "address": {
            "@type": "PostalAddress",
            "streetAddress": d.address || d.taxAddress || '',
            "addressCountry": "VN"
          },
          "alumni": d.representative ? {
            "@type": "Person",
            "name": d.representative
          } : undefined
        },
        {
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Trang chủ", "item": domain },
            { "@type": "ListItem", "position": 2, "name": "Danh bạ tỉnh thành", "item": `${domain}/tinh-thanh` },
            { "@type": "ListItem", "position": 3, "name": provinceName, "item": `${domain}/tinh-thanh/${provinceSlug}` },
            { "@type": "ListItem", "position": 4, "name": d.name, "item": pageUrl }
          ]
        }
      ]
    };

    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escape(pageTitle)}</title>
  <meta name="description" content="${this.escape(metaDescription)}">
  <link rel="canonical" href="${pageUrl}">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220%22%20width=%2232%22%20height=%2232%22><text y=%2224%22 font-size=%2224%22>🏢</text></svg>">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="business.business">
  <meta property="og:title" content="${this.escape(pageTitle)}">
  <meta property="og:description" content="${this.escape(metaDescription)}">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:site_name" content="Tra Cứu Mã Số Thuế">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${this.escape(pageTitle)}">
  <meta name="twitter:description" content="${this.escape(metaDescription)}">

  <!-- Schema.org JSON-LD Structured Data -->
  <script type="application/ld+json">
    ${JSON.stringify(jsonLd)}
  </script>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css?v=8">
</head>
<body class="light-theme">
  <!-- Toast Container -->
  <div id="toast-container" class="toast-container"></div>

  ${this.renderCommonHeader('', host)}

  <main class="main-content ssr-main-container">
    <!-- Breadcrumb navigation (Enhanced SILO) -->
    <nav aria-label="Breadcrumb" class="ssr-breadcrumb">
      <ol class="ssr-breadcrumb-list">
        <li class="ssr-breadcrumb-item">
          <a href="/" class="ssr-breadcrumb-link">
            <span>Trang chủ</span>
          </a>
        </li>
        <li class="ssr-breadcrumb-sep">/</li>
        <li class="ssr-breadcrumb-item">
          <a href="/tinh-thanh" class="ssr-breadcrumb-link">Tỉnh thành</a>
        </li>
        <li class="ssr-breadcrumb-sep">/</li>
        <li class="ssr-breadcrumb-item">
          <a href="/tinh-thanh/${provinceSlug}" class="ssr-breadcrumb-link">${this.escape(provinceName)}</a>
        </li>
        <li class="ssr-breadcrumb-sep">/</li>
        <li class="ssr-breadcrumb-item ssr-breadcrumb-item--current" aria-current="page">
          <span class="ssr-breadcrumb-current" title="${this.escape(d.name)}">${this.escape(d.name)}</span>
        </li>
      </ol>
    </nav>

    <!-- Quick Search on SSR Page -->
    <div class="ssr-search-wrapper">
      <form action="/" method="GET" class="ssr-search-form" onsubmit="const val = document.getElementById('ssr-search-input').value.trim(); if(val) window.location.href='/?q=' + encodeURIComponent(val); return false;">
        <input 
          type="text" 
          id="ssr-search-input" 
          class="ssr-search-input" 
          placeholder="🔍 Tìm kiếm công ty khác hoặc mã số thuế mới..." 
          autocomplete="off"
        >
        <button type="submit" class="ssr-btn-search">
          <span>Tra cứu</span>
        </button>
      </form>
    </div>

    <!-- Main Company Card Container -->
    <div class="company-card" style="box-shadow: var(--shadow-lg); border-color: var(--border);">
      <div style="border-bottom: 1px solid var(--border); padding-bottom: 18px;">
        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap;">
          <span class="status-badge ${statusClass}">
            <span class="status-dot"></span>
            <span>${this.escape(statusText)}</span>
          </span>
          ${d.type ? `<span class="type-badge">${this.escape(d.type)}</span>` : ''}
          <a href="/tinh-thanh/${provinceSlug}" class="badge-silo-link" title="Xem tất cả doanh nghiệp tại ${this.escape(provinceName)}">📍 ${this.escape(provinceName)}</a>
        </div>
        <h1 class="ssr-company-title" style="font-size: 1.65rem; font-weight: 800; line-height: 1.3; color: var(--text-main);">
          ${this.escape(d.name)}
        </h1>
        ${d.internationalName || d.shortName ? `
          <div style="font-size: 0.9rem; color: var(--text-muted); margin-top: 6px;">
            ${d.internationalName ? `<div>Tên tiếng Anh: <strong>${this.escape(d.internationalName)}</strong></div>` : ''}
            ${d.shortName ? `<div>Tên viết tắt: <strong>${this.escape(d.shortName)}</strong></div>` : ''}
          </div>
        ` : ''}
      </div>

      <!-- Toolbar -->
      <div class="modal-toolbar" style="margin: 10px 0 16px; border-radius: var(--radius-sm);">
        <button class="btn-tool" onclick="copySummaryText()">
          <span>Sao chép tóm tắt</span>
        </button>
        <button class="btn-tool" onclick="window.print()">
          <span>In / Xuất PDF</span>
        </button>
        <button class="btn-tool" onclick="copyShareUrl()">
          <span>Sao chép link chia sẻ</span>
        </button>
      </div>

      <!-- MST Highlight -->
      <div class="mst-highlight-card" style="margin-bottom: 20px;">
        <div class="mst-card-header">
          <span class="mst-label">MÃ SỐ THUẾ</span>
          ${d.lastUpdated ? `<span class="mst-updated">Cập nhật: ${this.escape(d.lastUpdated)}</span>` : ''}
        </div>
        <div class="mst-value-row">
          <span class="mst-code">${this.escape(d.taxId)}</span>
          <button class="btn-copy-mst" onclick="copyMst('${this.escape(d.taxId)}')">
            <span>Sao chép</span>
          </button>
        </div>
      </div>

      <!-- Information Grid -->
      <div class="detail-grid">
        <!-- Address -->
        <div class="detail-card full-width">
          <div class="card-icon">📍</div>
          <div class="card-content">
            <div class="card-label">Địa chỉ trụ sở chính</div>
            <div class="card-value">${this.escape(d.address || '-')}</div>
            ${d.taxAddress && d.taxAddress !== d.address ? `
              <div class="sub-address">
                <span class="sub-label">Địa chỉ khai báo thuế:</span>
                <span>${this.escape(d.taxAddress)}</span>
              </div>
            ` : ''}
          </div>
          <button class="btn-copy-small" onclick="copyField('${this.escape(d.address)}')">Sao chép</button>
        </div>

        <!-- Representative -->
        <div class="detail-card">
          <div class="card-icon">👤</div>
          <div class="card-content">
            <div class="card-label">Người đại diện pháp luật</div>
            <div class="card-value font-highlight">${d.representative ? this.escape(d.representative) : `<span class="val-empty">Chưa cập nhật</span>`}</div>
            ${d.representativeNote ? `
              <div class="rep-note">${this.escape(d.representativeNote)}</div>
            ` : ''}
          </div>
        </div>

        <!-- Phone -->
        <div class="detail-card">
          <div class="card-icon">📞</div>
          <div class="card-content">
            <div class="card-label">Số điện thoại</div>
            <div class="card-value">${d.phone ? `<span class="font-mono">${this.escape(d.phone)}</span>` : `<span class="val-empty">Chưa cập nhật</span>`}</div>
          </div>
        </div>

        <!-- Start Date -->
        <div class="detail-card">
          <div class="card-icon">📅</div>
          <div class="card-content">
            <div class="card-label">Ngày bắt đầu hoạt động</div>
            <div class="card-value">${d.startDate ? `<span class="font-mono">${this.escape(d.startDate)}</span>` : `<span class="val-empty">Chưa cập nhật</span>`}</div>
          </div>
        </div>

        <!-- Managed By -->
        <div class="detail-card">
          <div class="card-icon">🏛️</div>
          <div class="card-content">
            <div class="card-label">Cơ quan thuế quản lý</div>
            <div class="card-value">${d.managedBy ? this.escape(d.managedBy) : `<span class="val-empty">Chưa cập nhật</span>`}</div>
          </div>
        </div>

        <!-- Main Industry (With Active SILO Link) -->
        <div class="detail-card full-width">
          <div class="card-icon">⭐</div>
          <div class="card-content">
            <div class="card-label">Ngành nghề kinh doanh chính</div>
            <div class="card-value font-highlight">
              <a href="/nganh-nghe/${industrySlug}" class="industry-silo-link" title="Xem các doanh nghiệp cùng ngành nghề">
                ${this.escape(d.mainIndustry || 'Chưa cập nhật')} →
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- Unique Value-Add: Related Companies under same Representative -->
      ${relatedCompanies && relatedCompanies.length > 0 ? `
        <div style="margin-top: 28px; border-top: 1px solid var(--border); padding-top: 20px;">
          <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
            <span>🌐 Doanh nghiệp liên quan cùng người đại diện (${relatedCompanies.length})</span>
          </h3>
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${relatedCompanies.map(rel => `
              <a href="/${this.escape(rel.slug)}" class="drawer-item" style="text-decoration: none; display: block;">
                <div class="drawer-item-title">${this.escape(rel.name)}</div>
                <div class="drawer-item-sub">
                  <span>MST: <strong>${this.escape(rel.taxId)}</strong></span>
                  <span>${this.escape(rel.province || '')} • ${this.escape(rel.status || '')}</span>
                </div>
              </a>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Industries Table -->
      ${d.industries && d.industries.length > 0 ? `
        <div class="ssr-industries-box" style="margin-top: 28px; border-top: 1px solid var(--border); padding-top: 20px;">
          <div class="industries-header">
            <h3>Danh sách ngành nghề đã đăng ký (${d.industries.length})</h3>
            <input 
              type="text" 
              class="filter-industries-input" 
              placeholder="🔍 Lọc ngành nghề..."
              oninput="filterIndustries(this)"
            >
          </div>
          <div class="industries-table-wrapper" style="max-height: 380px;">
            <table class="industries-table">
              <thead>
                <tr>
                  <th style="width: 100px;">Mã ngành</th>
                  <th>Tên ngành nghề / Chi tiết hoạt động</th>
                </tr>
              </thead>
              <tbody id="ssr-industries-tbody">
                ${d.industries.map(ind => `
                  <tr>
                    <td><a href="/nganh-nghe/${ind.code}" class="badge-mst font-mono" style="text-decoration:none;">${this.escape(ind.code)}</a></td>
                    <td>${this.escape(ind.name)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}
    </div>
  </main>

  ${this.renderCommonFooter()}

  <script>
    const companySummary = ${JSON.stringify(`TÊN CÔNG TY: ${d.name}
MÃ SỐ THUẾ: ${d.taxId}
TÌNH TRẠNG: ${statusText}
ĐẠI DIỆN PHÁP LUẬT: ${d.representative || 'N/A'}
ĐIỆN THOẠI: ${d.phone || 'N/A'}
ĐỊA CHỈ: ${d.address || d.taxAddress}
NGÀY HOẠT ĐỘNG: ${d.startDate || 'N/A'}
QUẢN LÝ BỞI: ${d.managedBy || 'N/A'}
NGÀNH NGHỀ CHÍNH: ${d.mainIndustry || 'N/A'}`)};

    function showToast(text) {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.innerHTML = '<span>✓</span><span>' + text + '</span>';
      container.appendChild(toast);
      setTimeout(() => toast.remove(), 2500);
    }

    function copyToClipboard(text, msg) {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => showToast(msg || 'Đã sao chép'));
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        showToast(msg || 'Đã sao chép');
      }
    }

    function copyMst(mst) {
      copyToClipboard(mst, 'Đã sao chép MST: ' + mst);
    }

    function copyField(text) {
      copyToClipboard(text, 'Đã sao chép vào bộ nhớ tạm');
    }

    function copySummaryText() {
      copyToClipboard(companySummary, 'Đã sao chép tóm tắt công ty');
    }

    function copyShareUrl() {
      copyToClipboard(window.location.href, 'Đã sao chép liên kết chia sẻ');
    }

    function filterIndustries(input) {
      const term = input.value.toLowerCase().trim();
      const rows = document.querySelectorAll('#ssr-industries-tbody tr');
      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
      });
    }
  </script>
</body>
</html>`;
  }

  // ==========================================
  // 7. XML SITEMAP GENERATOR (INCLUDING HUBS)
  // ==========================================
  renderSitemap(slugs, host = 'localhost:3000') {
    const domain = `https://${host}`;
    const now = new Date().toISOString().split('T')[0];

    const urls = [
      `  <url>\n    <loc>${domain}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,
      `  <url>\n    <loc>${domain}/tinh-thanh</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>`,
      `  <url>\n    <loc>${domain}/nganh-nghe</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>`,
      `  <url>\n    <loc>${domain}/doanh-nghiep-moi</loc>\n    <changefreq>hourly</changefreq>\n    <priority>0.9</priority>\n  </url>`
    ];

    // Add all 63 Provinces
    for (const p of VIETNAM_PROVINCES) {
      urls.push(`  <url>\n    <loc>${domain}/tinh-thanh/${p.slug}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>`);
    }

    // Add Top Industries
    for (const ind of TOP_INDUSTRIES) {
      urls.push(`  <url>\n    <loc>${domain}/nganh-nghe/${ind.slug}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.85</priority>\n  </url>`);
    }

    // Add All Companies
    for (const item of slugs) {
      const lastmod = item.updatedAt ? new Date(item.updatedAt).toISOString().split('T')[0] : now;
      const clean = (item.slug || '').replace(/^\/?(mst\/)?/, '');
      urls.push(`  <url>\n    <loc>${domain}/${this.escape(clean)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`);
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
  }

  renderRobotsTxt(host = 'localhost:3000') {
    return `User-agent: *
Allow: /

Sitemap: https://${host}/sitemap.xml
`;
  }
}

export const seoRenderer = new SeoRenderer();
