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

  renderCompanyPage(company, relatedCompanies = [], host = 'localhost:3000') {
    const domain = `http://${host}`;
    const pageUrl = `${domain}/mst/${company.slug}`;
    const d = company.data || company;
    
    const isDanger = (d.status || '').toLowerCase().includes('ngừng') || (d.status || '').toLowerCase().includes('đóng mã');
    const statusClass = isDanger ? 'status-danger' : 'status-active';
    const statusText = d.status || 'Đang hoạt động';

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
            {
              "@type": "ListItem",
              "position": 1,
              "name": "Trang chủ",
              "item": domain
            },
            {
              "@type": "ListItem",
              "position": 2,
              "name": "Tra cứu mã số thuế",
              "item": `${domain}/`
            },
            {
              "@type": "ListItem",
              "position": 3,
              "name": d.name,
              "item": pageUrl
            }
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

  <!-- Schema.org JSON-LD -->
  <script type="application/ld+json">
    ${JSON.stringify(jsonLd, null, 2)}
  </script>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css?v=2">
</head>
<body class="light-theme">
  <!-- Toast Container -->
  <div id="toast-container" class="toast-container"></div>

  <!-- Header -->
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

      <div class="nav-actions">
        <a href="/" class="btn-icon" style="text-decoration: none;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <span>Tìm kiếm mới</span>
        </a>
      </div>
    </div>
  </header>

  <main class="main-content" style="max-width: 1000px; margin: 30px auto; padding: 0 20px;">
    <!-- Breadcrumb navigation -->
    <nav aria-label="Breadcrumb" style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 20px;">
      <a href="/" style="color: var(--primary); text-decoration: none;">Trang chủ</a> &rsaquo;
      <span>Tra cứu mã số thuế</span> &rsaquo;
      <span style="color: var(--text-main); font-weight: 600;">${this.escape(d.name)}</span>
    </nav>

    <!-- Main Company Card Container -->
    <div class="company-card" style="box-shadow: var(--shadow-lg); border-color: var(--border);">
      <div style="border-bottom: 1px solid var(--border); padding-bottom: 18px;">
        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
          <span class="status-badge ${statusClass}">${this.escape(statusText)}</span>
          ${d.type ? `<span class="type-badge">${this.escape(d.type)}</span>` : ''}
        </div>
        <h1 style="font-size: 1.65rem; font-weight: 800; line-height: 1.3; color: var(--text-main);">
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
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
          </svg>
          <span>Sao chép tóm tắt</span>
        </button>

        <button class="btn-tool" onclick="window.print()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect width="12" height="8" x="6" y="14"/>
          </svg>
          <span>In / Xuất PDF</span>
        </button>

        <a href="https://masothue.com${this.escape(d.url)}" target="_blank" rel="noopener noreferrer" class="btn-tool link-external">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          <span>Trang gốc</span>
        </a>
      </div>

      <!-- MST Highlight -->
      <div class="mst-highlight-card" style="margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
          <div>
            <div class="mst-label">MÃ SỐ THUẾ</div>
            <div class="mst-value-row">
              <span class="mst-code">${this.escape(d.taxId)}</span>
              <button class="btn-copy-mst" onclick="copyMst('${this.escape(d.taxId)}')">
                <span>Sao chép</span>
              </button>
            </div>
          </div>
          ${d.lastUpdated ? `<div class="mst-updated">${this.escape(d.lastUpdated)}</div>` : ''}
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
            <div class="card-value font-highlight">${this.escape(d.representative || 'Chưa cập nhật')}</div>
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
            <div class="card-value font-mono">${this.escape(d.phone || 'Chưa cập nhật')}</div>
          </div>
        </div>

        <!-- Start Date -->
        <div class="detail-card">
          <div class="card-icon">📅</div>
          <div class="card-content">
            <div class="card-label">Ngày bắt đầu hoạt động</div>
            <div class="card-value font-mono">${this.escape(d.startDate || 'Chưa cập nhật')}</div>
          </div>
        </div>

        <!-- Managed By -->
        <div class="detail-card">
          <div class="card-icon">🏛️</div>
          <div class="card-content">
            <div class="card-label">Cơ quan thuế quản lý</div>
            <div class="card-value">${this.escape(d.managedBy || 'Chưa cập nhật')}</div>
          </div>
        </div>

        <!-- Main Industry -->
        <div class="detail-card full-width">
          <div class="card-icon">⭐</div>
          <div class="card-content">
            <div class="card-label">Ngành nghề kinh doanh chính</div>
            <div class="card-value font-highlight">${this.escape(d.mainIndustry || 'Chưa cập nhật')}</div>
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
              <a href="/mst/${this.escape(rel.slug)}" class="drawer-item" style="text-decoration: none; display: block;">
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

      <!-- Industries Registered Section -->
      ${d.industries && d.industries.length > 0 ? `
        <div class="industries-section" style="margin-top: 28px;">
          <div class="industries-header">
            <h3>Danh sách ngành nghề đã đăng ký (${d.industries.length})</h3>
            <input 
              type="text" 
              class="filter-industries-input" 
              placeholder="🔍 Lọc ngành theo mã hoặc tên..."
              oninput="filterIndustries(this)"
            >
          </div>
          <div class="industries-table-wrapper" style="max-height: 320px;">
            <table class="industries-table">
              <thead>
                <tr>
                  <th style="width: 80px;">Mã ngành</th>
                  <th>Tên ngành nghề / Chi tiết hoạt động</th>
                </tr>
              </thead>
              <tbody id="ssr-industries-tbody">
                ${d.industries.map(ind => `
                  <tr>
                    <td><span class="badge-mst font-mono">${this.escape(ind.code)}</span></td>
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

  <footer class="footer">
    <div class="footer-container">
      <p>Tra Cứu Mã Số Thuế Sạch • Dữ liệu công khai từ Cổng thông tin Đăng ký Quốc gia & masothue.com</p>
      <p class="footer-sub">Hệ thống tối ưu SEO, không quảng cáo, tốc độ tải dưới 0.5s.</p>
    </div>
  </footer>

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

  // XML Sitemap Generator
  renderSitemap(slugs, host = 'localhost:3000') {
    const domain = `http://${host}`;
    const now = new Date().toISOString().split('T')[0];

    const urls = [
      `  <url>\n    <loc>${domain}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`
    ];

    for (const item of slugs) {
      const lastmod = item.updatedAt ? new Date(item.updatedAt).toISOString().split('T')[0] : now;
      urls.push(`  <url>\n    <loc>${domain}/mst/${this.escape(item.slug)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`);
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
  }

  renderRobotsTxt(host = 'localhost:3000') {
    return `User-agent: *
Allow: /

Sitemap: http://${host}/sitemap.xml
`;
  }
}

export const seoRenderer = new SeoRenderer();
