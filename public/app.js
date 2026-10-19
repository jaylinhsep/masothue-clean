// --- State Management ---
const state = {
  currentQuery: '',
  currentType: 'auto',
  currentPage: 1,
  maxPage: 1,
  activeDetail: null,
  history: JSON.parse(localStorage.getItem('mst_history') || '[]'),
  bookmarks: JSON.parse(localStorage.getItem('mst_bookmarks') || '[]'),
  theme: localStorage.getItem('mst_theme') || 'light'
};

// --- DOM Elements ---
const el = {
  searchForm: document.getElementById('search-form'),
  searchInput: document.getElementById('search-input'),
  searchType: document.getElementById('search-type'),
  btnClearInput: document.getElementById('btn-clear-input'),
  btnSearch: document.getElementById('btn-search'),
  btnSpinner: document.querySelector('.btn-spinner'),
  btnText: document.querySelector('.btn-text'),
  
  welcomeSection: document.getElementById('welcome-section'),
  resultsSection: document.getElementById('results-section'),
  resultsTitle: document.getElementById('results-title'),
  resultsCount: document.getElementById('results-count'),
  resultsGrid: document.getElementById('results-grid'),
  
  paginationContainer: document.getElementById('pagination-container'),
  btnPrevPage: document.getElementById('btn-prev-page'),
  btnNextPage: document.getElementById('btn-next-page'),
  pageNumbers: document.getElementById('page-numbers'),
  
  loadingState: document.getElementById('loading-state'),
  errorState: document.getElementById('error-state'),
  errorTitle: document.getElementById('error-title'),
  errorMessage: document.getElementById('error-message'),
  btnRetry: document.getElementById('btn-retry'),
  
  // Detail Modal
  detailModal: document.getElementById('detail-modal'),
  btnCloseModal: document.getElementById('btn-close-modal'),
  detailStatusBadge: document.getElementById('detail-status-badge'),
  detailTypeBadge: document.getElementById('detail-type-badge'),
  detailName: document.getElementById('detail-name'),
  detailSubnames: document.getElementById('detail-subnames'),
  detailTaxId: document.getElementById('detail-taxid'),
  btnCopyMst: document.getElementById('btn-copy-mst'),
  detailLastUpdated: document.getElementById('detail-last-updated'),
  detailAddress: document.getElementById('detail-address'),
  detailTaxAddressBox: document.getElementById('detail-tax-address-box'),
  detailTaxAddress: document.getElementById('detail-tax-address'),
  detailRepresentative: document.getElementById('detail-representative'),
  detailRepNote: document.getElementById('detail-rep-note'),
  detailPhone: document.getElementById('detail-phone'),
  detailStartDate: document.getElementById('detail-startdate'),
  detailManagedBy: document.getElementById('detail-managedby'),
  detailType: document.getElementById('detail-type'),
  detailMainIndustry: document.getElementById('detail-main-industry'),
  
  industriesSection: document.getElementById('industries-section'),
  industriesCount: document.getElementById('industries-count'),
  filterIndustriesInput: document.getElementById('filter-industries-input'),
  industriesTbody: document.getElementById('industries-tbody'),
  
  btnCopySummary: document.getElementById('btn-copy-summary'),
  btnToggleBookmarkDetail: document.getElementById('btn-toggle-bookmark-detail'),
  bookmarkDetailLabel: document.getElementById('bookmark-detail-label'),
  btnExportJson: document.getElementById('btn-export-json'),
  btnOpenSource: document.getElementById('btn-open-source'),
  
  // History & Bookmarks
  btnOpenHistory: document.getElementById('btn-open-history'),
  drawerHistory: document.getElementById('drawer-history'),
  btnCloseHistory: document.getElementById('btn-close-history'),
  historyList: document.getElementById('history-list'),
  btnClearHistory: document.getElementById('btn-clear-history'),
  
  btnOpenBookmarks: document.getElementById('btn-open-bookmarks'),
  drawerBookmarks: document.getElementById('drawer-bookmarks'),
  btnCloseBookmarks: document.getElementById('btn-close-bookmarks'),
  bookmarksList: document.getElementById('bookmarks-list'),
  btnClearBookmarks: document.getElementById('btn-clear-bookmarks'),
  bookmarkCount: document.getElementById('bookmark-count'),
  
  // Theme
  btnThemeToggle: document.getElementById('btn-theme-toggle'),
  themeIconMoon: document.getElementById('theme-icon-moon'),
  themeIconSun: document.getElementById('theme-icon-sun'),
  
  toastContainer: document.getElementById('toast-container')
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(state.theme);
  updateBookmarkCount();
  setupEventListeners();
  
  // Check URL query parameters
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q');
  const type = params.get('type') || 'auto';
  if (q) {
    el.searchInput.value = q;
    el.searchType.value = type;
    executeSearch(q, type, 1);
  } else {
    loadRecentCompanies();
  }
});

// --- Load Recent Companies from Database (SEO Freshness Feed) ---
async function loadRecentCompanies() {
  const grid = document.getElementById('recent-grid');
  const countEl = document.getElementById('db-total-count');
  if (!grid) return;

  try {
    const [recentRes, statsRes] = await Promise.all([
      fetch('/api/recent').then(r => r.json()).catch(() => ({ success: false })),
      fetch('/api/stats').then(r => r.json()).catch(() => ({ success: false }))
    ]);

    if (statsRes.success && countEl) {
      countEl.textContent = `Tổng cộng: ${statsRes.total} doanh nghiệp đã lập chỉ mục`;
    }

    if (recentRes.success && recentRes.items && recentRes.items.length > 0) {
      grid.innerHTML = recentRes.items.map(item => `
        <div class="feature-card" style="padding: 16px; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px;">
              <span class="badge-mst"># ${escapeHtml(item.taxId)}</span>
              <span class="status-badge status-active" style="font-size: 0.72rem; padding: 2px 6px;">${escapeHtml(item.province || 'Toàn quốc')}</span>
            </div>
            <a href="/mst/${escapeHtml(item.slug)}" class="company-title-link" style="font-size: 0.95rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 8px;">
              ${escapeHtml(item.name)}
            </a>
            ${item.representative ? `<div style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 4px;">👤 ${escapeHtml(item.representative)}</div>` : ''}
          </div>
          <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
            <a href="/mst/${escapeHtml(item.slug)}" class="btn-card-detail" style="text-decoration: none; padding: 4px 10px; font-size: 0.78rem;">
              Xem trang SEO →
            </a>
            <button class="btn-copy-small" onclick="copyToClipboard('${escapeHtml(item.taxId)}', 'Đã sao chép MST')">Copy MST</button>
          </div>
        </div>
      `).join('');
    } else {
      grid.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem; grid-column: 1 / -1;">Chưa có doanh nghiệp nào. Hãy gõ tìm kiếm để tự động lưu vào cơ sở dữ liệu!</p>';
    }
  } catch (err) {
    console.error('Lỗi tải recent companies:', err);
  }
}

// --- Event Listeners ---
function setupEventListeners() {
  // Search form submit
  el.searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = el.searchInput.value.trim();
    const type = el.searchType.value;
    if (q) {
      executeSearch(q, type, 1);
    }
  });

  // Input clear button
  el.searchInput.addEventListener('input', () => {
    el.btnClearInput.classList.toggle('hidden', !el.searchInput.value);
  });

  el.btnClearInput.addEventListener('click', () => {
    el.searchInput.value = '';
    el.btnClearInput.classList.add('hidden');
    el.searchInput.focus();
  });

  // Quick suggestion chips
  document.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.dataset.query;
      el.searchInput.value = q;
      el.btnClearInput.classList.remove('hidden');
      executeSearch(q, 'auto', 1);
    });
  });

  // Pagination
  el.btnPrevPage.addEventListener('click', () => {
    if (state.currentPage > 1) {
      executeSearch(state.currentQuery, state.currentType, state.currentPage - 1);
    }
  });

  el.btnNextPage.addEventListener('click', () => {
    if (state.currentPage < state.maxPage) {
      executeSearch(state.currentQuery, state.currentType, state.currentPage + 1);
    }
  });

  // Retry on error
  el.btnRetry.addEventListener('click', () => {
    if (state.currentQuery) {
      executeSearch(state.currentQuery, state.currentType, state.currentPage);
    }
  });

  // Modal actions
  el.btnCloseModal.addEventListener('click', closeModal);
  el.detailModal.addEventListener('click', (e) => {
    if (e.target === el.detailModal) closeModal();
  });

  el.btnCopyMst.addEventListener('click', () => {
    if (state.activeDetail?.taxId) {
      copyToClipboard(state.activeDetail.taxId, 'Đã sao chép mã số thuế');
    }
  });

  el.btnCopySummary.addEventListener('click', copySummary);
  el.btnExportJson.addEventListener('click', exportJson);
  el.btnToggleBookmarkDetail.addEventListener('click', toggleBookmarkActiveDetail);

  // Filter industries table
  el.filterIndustriesInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    filterIndustriesTable(term);
  });

  // Drawers
  el.btnOpenHistory.addEventListener('click', openHistoryDrawer);
  el.btnCloseHistory.addEventListener('click', closeHistoryDrawer);
  el.drawerHistory.addEventListener('click', (e) => {
    if (e.target === el.drawerHistory) closeHistoryDrawer();
  });
  el.btnClearHistory.addEventListener('click', clearHistory);

  el.btnOpenBookmarks.addEventListener('click', openBookmarksDrawer);
  el.btnCloseBookmarks.addEventListener('click', closeBookmarksDrawer);
  el.drawerBookmarks.addEventListener('click', (e) => {
    if (e.target === el.drawerBookmarks) closeBookmarksDrawer();
  });
  el.btnClearBookmarks.addEventListener('click', clearBookmarks);

  // Theme Toggle
  el.btnThemeToggle.addEventListener('click', toggleTheme);

  // Global Key shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      closeHistoryDrawer();
      closeBookmarksDrawer();
    }
    // Press '/' to focus search input if not in another input
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
      e.preventDefault();
      el.searchInput.focus();
    }
  });
}

// --- Search Handler ---
async function executeSearch(query, type = 'auto', page = 1) {
  const q = query.trim();
  if (!q) return;

  state.currentQuery = q;
  state.currentType = type;
  state.currentPage = page;

  // Update browser URL without reload
  const newUrl = `${window.location.pathname}?q=${encodeURIComponent(q)}&type=${type}`;
  window.history.pushState({ q, type, page }, '', newUrl);

  // Save to history
  saveToHistory(q, type);

  // UI state: loading
  setLoading(true);
  hideAllViews();
  el.loadingState.classList.remove('hidden');

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=${type}&page=${page}`);
    const data = await res.json();

    setLoading(false);
    el.loadingState.classList.add('hidden');

    if (!data.success) {
      showError('Không tìm thấy kết quả', data.message || 'Vui lòng kiểm tra lại từ khóa tìm kiếm.');
      return;
    }

    // Direct match (Exact tax code or single match found)
    if (data.isDirect && data.detail) {
      renderResults(data.items, 1, 1);
      const firstCard = el.resultsGrid.querySelector('.company-card');
      if (firstCard) {
        data.items[0].detail = data.detail;
        toggleCardAccordion(firstCard, data.items[0], true);
      }
      return;
    }

    // List of results
    if (data.items && data.items.length > 0) {
      renderResults(data.items, data.currentPage, data.maxPage);
    } else {
      showError('Không tìm thấy doanh nghiệp', 'Thử tìm với tên đầy đủ hơn hoặc sử dụng Mã Số Thuế chính xác.');
    }
  } catch (err) {
    setLoading(false);
    el.loadingState.classList.add('hidden');
    showError('Lỗi kết nối', 'Không thể kết nối đến máy chủ lấy dữ liệu. Vui lòng kiểm tra mạng hoặc thử lại.');
    console.error(err);
  }
}

// --- Render Search Results ---
function renderResults(items, currentPage, maxPage) {
  state.currentPage = currentPage;
  state.maxPage = maxPage;

  el.resultsTitle.textContent = `Kết quả tìm kiếm cho "${state.currentQuery}"`;
  el.resultsCount.textContent = `Tìm thấy ${items.length} doanh nghiệp phù hợp • Bấm vào công ty để sổ thông tin chi tiết`;

  el.resultsGrid.innerHTML = '';
  items.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'company-card';
    card.id = `company-card-${index}`;
    
    const isSaved = state.bookmarks.some(b => b.taxId === item.taxId || b.url === item.url);

    card.innerHTML = `
      <div class="card-header-bar" onclick="toggleCardAccordion(document.getElementById('company-card-${index}'), ${escapeHtml(JSON.stringify(item))})">
        <div>
          <h3 class="company-title-link">
            ${escapeHtml(item.name)}
          </h3>
          <div class="card-badges" style="margin-top: 6px;">
            ${item.taxId ? `
              <span class="badge-mst" title="Bấm để sao chép MST" onclick="event.stopPropagation(); copyToClipboard('${item.taxId}', 'Đã sao chép MST: ${item.taxId}')">
                <span># ${escapeHtml(item.taxId)}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                </svg>
              </span>
            ` : ''}
          </div>
        </div>

        <div style="display: flex; gap: 8px; align-items: center; flex-shrink: 0;">
          <button class="btn-card-save" onclick="event.stopPropagation(); toggleBookmarkItem(${escapeHtml(JSON.stringify(item))}, this)">
            ${isSaved ? '★ Đã lưu' : '☆ Lưu'}
          </button>
          <button class="btn-toggle-expand" title="Bấm để sổ thông tin công ty">
            <span>Sổ thông tin</span>
            <span class="arrow-icon">▼</span>
          </button>
        </div>
      </div>

      <div class="card-info-rows" onclick="toggleCardAccordion(document.getElementById('company-card-${index}'), ${escapeHtml(JSON.stringify(item))})">
        ${item.representative ? `
          <div class="info-item">
            <span>👤</span>
            <div>Đại diện: <strong>${escapeHtml(item.representative)}</strong></div>
          </div>
        ` : ''}
        ${item.address ? `
          <div class="info-item">
            <span>📍</span>
            <div>${escapeHtml(item.address)}</div>
          </div>
        ` : ''}
      </div>

      <!-- Accordion Expandable Content ("Sổ thông tin") -->
      <div class="card-accordion-body"></div>
    `;

    el.resultsGrid.appendChild(card);

    if (item.autoExpand) {
      setTimeout(() => {
        toggleCardAccordion(card, item, true);
      }, 50);
    }
  });

  // Render pagination
  renderPagination(currentPage, maxPage);

  el.resultsSection.classList.remove('hidden');
  window.scrollTo({ top: 320, behavior: 'smooth' });
}

// --- Toggle Accordion & Render Full Detail Inline ---
async function toggleCardAccordion(cardEl, item, forceExpand = false) {
  if (!cardEl) return;
  const isExpanded = cardEl.classList.contains('is-expanded');
  const shouldExpand = forceExpand ? true : !isExpanded;

  const btnToggle = cardEl.querySelector('.btn-toggle-expand');
  const accordionBody = cardEl.querySelector('.card-accordion-body');

  if (!shouldExpand) {
    cardEl.classList.remove('is-expanded');
    if (btnToggle) {
      btnToggle.innerHTML = `<span>Sổ thông tin</span> <span class="arrow-icon">▼</span>`;
    }
    return;
  }

  // Expand
  cardEl.classList.add('is-expanded');
  if (btnToggle) {
    btnToggle.innerHTML = `<span>Thu gọn</span> <span class="arrow-icon">▲</span>`;
  }

  // If already loaded, no need to refetch
  if (cardEl.dataset.loaded === 'true') {
    return;
  }

  accordionBody.innerHTML = `
    <div class="inline-loading">
      <div class="btn-spinner" style="border-color: var(--primary); border-top-color: transparent;"></div>
      <span>Đang lấy toàn bộ thông tin chi tiết của doanh nghiệp...</span>
    </div>
  `;

  try {
    let detailData = item.detail || null;
    if (!detailData) {
      const res = await fetch(`/api/detail?path=${encodeURIComponent(item.url)}`);
      const resJson = await res.json();
      if (resJson.success && resJson.data) {
        detailData = resJson.data;
      }
    }

    if (!detailData) {
      accordionBody.innerHTML = `
        <div class="inline-loading" style="color: var(--accent-red);">
          ⚠️ Không thể lấy thông tin chi tiết. Vui lòng thử lại sau.
        </div>
      `;
      return;
    }

    cardEl.dataset.loaded = 'true';
    renderAccordionContent(detailData, accordionBody, item);
  } catch (err) {
    console.error('Error loading detail:', err);
    accordionBody.innerHTML = `
      <div class="inline-loading" style="color: var(--accent-red);">
        ⚠️ Lỗi kết nối khi tải dữ liệu chi tiết.
      </div>
    `;
  }
}

function renderAccordionContent(data, container, item) {
  const isDanger = data.status.toLowerCase().includes('ngừng') || data.status.toLowerCase().includes('đóng mã');
  const statusBadgeClass = isDanger ? 'status-danger' : 'status-active';

  const summaryText = [
    `TÊN CÔNG TY: ${data.name}`,
    `MÃ SỐ THUẾ: ${data.taxId}`,
    `TÌNH TRẠNG: ${data.status}`,
    `ĐẠI DIỆN PHÁP LUẬT: ${data.representative}`,
    `ĐIỆN THOẠI: ${data.phone || 'N/A'}`,
    `ĐỊA CHỈ: ${data.address}`,
    data.taxAddress && data.taxAddress !== data.address ? `ĐỊA CHỈ THUẾ: ${data.taxAddress}` : null,
    `NGÀY HOẠT ĐỘNG: ${data.startDate || 'N/A'}`,
    `QUẢN LÝ BỞI: ${data.managedBy || 'N/A'}`,
    `LOẠI HÌNH: ${data.type || 'N/A'}`,
    `NGÀNH NGHỀ CHÍNH: ${data.mainIndustry || 'N/A'}`
  ].filter(Boolean).join('\n');

  container.innerHTML = `
    <!-- Accordion Toolbar -->
    <div class="modal-toolbar" style="border-radius: var(--radius-sm); margin-bottom: 16px;">
      <button class="btn-tool" onclick="copyToClipboard(${escapeHtml(JSON.stringify(summaryText))}, 'Đã sao chép tóm tắt công ty')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
        </svg>
        <span>Sao chép tóm tắt</span>
      </button>

      <button class="btn-tool" onclick="downloadCompanyJson(${escapeHtml(JSON.stringify(data))})">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <span>Xuất JSON</span>
      </button>

      <button class="btn-tool" onclick="openDetailModal(${escapeHtml(JSON.stringify(data))})">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 3 21 3 21 9"/>
          <polyline points="9 21 3 21 3 15"/>
          <line x1="21" y1="3" x2="14" y2="10"/>
          <line x1="3" y1="21" x2="10" y2="14"/>
        </svg>
        <span>Xem toàn màn hình</span>
      </button>

      <a href="https://masothue.com${escapeHtml(data.url)}" target="_blank" rel="noopener noreferrer" class="btn-tool link-external">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
        <span>Trang gốc</span>
      </a>
    </div>

    <!-- Key MST Box -->
    <div class="mst-highlight-card" style="margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <div class="mst-label">MÃ SỐ THUẾ</div>
          <div class="mst-value-row">
            <span class="mst-code">${escapeHtml(data.taxId || 'Chưa cập nhật')}</span>
            <button class="btn-copy-mst" onclick="copyToClipboard('${escapeHtml(data.taxId)}', 'Đã sao chép MST: ${escapeHtml(data.taxId)}')">
              <span>Sao chép</span>
            </button>
          </div>
        </div>
        <div style="text-align: right;">
          <span class="status-badge ${statusBadgeClass}">${escapeHtml(data.status || 'Đang hoạt động')}</span>
          ${data.lastUpdated ? `<div class="mst-updated" style="margin-top: 6px;">${escapeHtml(data.lastUpdated)}</div>` : ''}
        </div>
      </div>
    </div>

    <!-- Info Grid -->
    <div class="detail-grid">
      <!-- Address -->
      <div class="detail-card full-width">
        <div class="card-icon">📍</div>
        <div class="card-content">
          <div class="card-label">Địa chỉ trụ sở</div>
          <div class="card-value">${escapeHtml(data.address || '-')}</div>
          ${data.taxAddress && data.taxAddress !== data.address ? `
            <div class="sub-address">
              <span class="sub-label">Địa chỉ khai thuế:</span>
              <span>${escapeHtml(data.taxAddress)}</span>
            </div>
          ` : ''}
        </div>
        <button class="btn-copy-small" onclick="copyToClipboard('${escapeHtml(data.address)}', 'Đã sao chép địa chỉ')">Sao chép</button>
      </div>

      <!-- Representative -->
      <div class="detail-card">
        <div class="card-icon">👤</div>
        <div class="card-content">
          <div class="card-label">Người đại diện pháp luật</div>
          <div class="card-value font-highlight">${escapeHtml(data.representative || 'Chưa cập nhật')}</div>
          ${data.representativeNote ? `
            <div class="rep-note">${escapeHtml(data.representativeNote)}</div>
          ` : ''}
        </div>
      </div>

      <!-- Phone -->
      <div class="detail-card">
        <div class="card-icon">📞</div>
        <div class="card-content">
          <div class="card-label">Số điện thoại</div>
          <div class="card-value font-mono">${escapeHtml(data.phone || 'Chưa cập nhật')}</div>
        </div>
      </div>

      <!-- Start Date -->
      <div class="detail-card">
        <div class="card-icon">📅</div>
        <div class="card-content">
          <div class="card-label">Ngày bắt đầu hoạt động</div>
          <div class="card-value font-mono">${escapeHtml(data.startDate || 'Chưa cập nhật')}</div>
        </div>
      </div>

      <!-- Managed By -->
      <div class="detail-card">
        <div class="card-icon">🏛️</div>
        <div class="card-content">
          <div class="card-label">Cơ quan thuế quản lý</div>
          <div class="card-value">${escapeHtml(data.managedBy || 'Chưa cập nhật')}</div>
        </div>
      </div>

      <!-- International & Short Name -->
      ${data.internationalName || data.shortName ? `
        <div class="detail-card full-width">
          <div class="card-icon">🌐</div>
          <div class="card-content">
            <div class="card-label">Tên quốc tế / Tên viết tắt</div>
            <div class="card-value">
              ${data.internationalName ? `<div>Quốc tế: <strong>${escapeHtml(data.internationalName)}</strong></div>` : ''}
              ${data.shortName ? `<div>Viết tắt: <strong>${escapeHtml(data.shortName)}</strong></div>` : ''}
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Enterprise Type -->
      <div class="detail-card full-width">
        <div class="card-icon">📑</div>
        <div class="card-content">
          <div class="card-label">Loại hình doanh nghiệp</div>
          <div class="card-value">${escapeHtml(data.type || 'Chưa cập nhật')}</div>
        </div>
      </div>

      <!-- Main Industry -->
      <div class="detail-card full-width">
        <div class="card-icon">⭐</div>
        <div class="card-content">
          <div class="card-label">Ngành nghề kinh doanh chính</div>
          <div class="card-value font-highlight">${escapeHtml(data.mainIndustry || 'Chưa có thông tin ngành chính')}</div>
        </div>
      </div>
    </div>

    <!-- Industries List Table -->
    ${data.industries && data.industries.length > 0 ? `
      <div class="industries-section" style="margin-top: 18px;">
        <div class="industries-header">
          <h4 style="font-size: 0.95rem; font-weight: 700;">Danh sách ngành nghề đã đăng ký (${data.industries.length})</h4>
          <input 
            type="text" 
            class="filter-industries-input" 
            placeholder="🔍 Lọc ngành theo mã hoặc từ khóa..."
            oninput="filterCardIndustries(this, ${escapeHtml(JSON.stringify(data.industries))})"
          >
        </div>
        <div class="industries-table-wrapper" style="max-height: 220px;">
          <table class="industries-table">
            <thead>
              <tr>
                <th style="width: 80px;">Mã</th>
                <th>Tên ngành nghề / Chi tiết hoạt động</th>
              </tr>
            </thead>
            <tbody class="card-industries-tbody">
              ${data.industries.map(ind => `
                <tr>
                  <td><span class="badge-mst font-mono">${escapeHtml(ind.code)}</span></td>
                  <td>${escapeHtml(ind.name)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : ''}
  `;
}

// Function to filter industries inside a card
window.filterCardIndustries = function(inputEl, allIndustries) {
  const term = inputEl.value.toLowerCase().trim();
  const tbody = inputEl.closest('.industries-section').querySelector('.card-industries-tbody');
  const filtered = allIndustries.filter(ind => ind.code.toLowerCase().includes(term) || ind.name.toLowerCase().includes(term));
  tbody.innerHTML = filtered.map(ind => `
    <tr>
      <td><span class="badge-mst font-mono">${escapeHtml(ind.code)}</span></td>
      <td>${escapeHtml(ind.name)}</td>
    </tr>
  `).join('');
};

window.downloadCompanyJson = function(data) {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2));
  const a = document.createElement('a');
  a.setAttribute('href', dataStr);
  a.setAttribute('download', `masothue-${data.taxId || 'company'}.json`);
  document.body.appendChild(a);
  a.click();
  a.remove();
};

function renderPagination(current, max) {
  if (max <= 1) {
    el.paginationContainer.classList.add('hidden');
    return;
  }

  el.paginationContainer.classList.remove('hidden');
  el.btnPrevPage.disabled = current <= 1;
  el.btnNextPage.disabled = current >= max;

  el.pageNumbers.innerHTML = '';
  // Show at most 7 page buttons
  let start = Math.max(1, current - 2);
  let end = Math.min(max, start + 4);
  if (end - start < 4) {
    start = Math.max(1, end - 4);
  }

  for (let p = start; p <= end; p++) {
    const btn = document.createElement('button');
    btn.className = `page-num ${p === current ? 'active' : ''}`;
    btn.textContent = p;
    btn.addEventListener('click', () => {
      executeSearch(state.currentQuery, state.currentType, p);
    });
    el.pageNumbers.appendChild(btn);
  }
}

// --- Detail Fetch & View ---
async function fetchAndShowDetail(path) {
  showToast('Đang tải chi tiết doanh nghiệp...');
  try {
    const res = await fetch(`/api/detail?path=${encodeURIComponent(path)}`);
    const data = await res.json();
    if (data.success && data.data) {
      openDetailModal(data.data);
    } else {
      showToast('Không lấy được thông tin chi tiết: ' + (data.message || 'Lỗi'));
    }
  } catch (err) {
    showToast('Lỗi mạng khi tải chi tiết.');
    console.error(err);
  }
}

function openDetailModal(data) {
  state.activeDetail = data;

  // Status
  const isDanger = data.status.toLowerCase().includes('ngừng') || data.status.toLowerCase().includes('đóng mã');
  el.detailStatusBadge.textContent = data.status || 'Đang hoạt động';
  el.detailStatusBadge.className = `status-badge ${isDanger ? 'status-danger' : 'status-active'}`;

  // Name & Titles
  el.detailName.textContent = data.name;
  let subnamesHtml = '';
  if (data.internationalName) {
    subnamesHtml += `<div>Tên tiếng Anh: <strong>${escapeHtml(data.internationalName)}</strong></div>`;
  }
  if (data.shortName) {
    subnamesHtml += `<div>Tên viết tắt: <strong>${escapeHtml(data.shortName)}</strong></div>`;
  }
  el.detailSubnames.innerHTML = subnamesHtml;

  // Tax ID & Highlight
  el.detailTaxId.textContent = data.taxId || 'Chưa cập nhật';
  el.detailLastUpdated.textContent = data.lastUpdated || '';

  // Address
  el.detailAddress.textContent = data.address || '-';
  if (data.taxAddress && data.taxAddress !== data.address) {
    el.detailTaxAddressBox.classList.remove('hidden');
    el.detailTaxAddress.textContent = data.taxAddress;
  } else {
    el.detailTaxAddressBox.classList.add('hidden');
  }

  // Representative
  el.detailRepresentative.textContent = data.representative || 'Chưa cập nhật';
  if (data.representativeNote) {
    el.detailRepNote.classList.remove('hidden');
    el.detailRepNote.textContent = data.representativeNote;
  } else {
    el.detailRepNote.classList.add('hidden');
  }

  // Phone, Date, Managed By, Type
  el.detailPhone.textContent = data.phone || 'Chưa cập nhật';
  el.detailStartDate.textContent = data.startDate || 'Chưa cập nhật';
  el.detailManagedBy.textContent = data.managedBy || 'Chưa cập nhật';
  el.detailType.textContent = data.type || 'Chưa cập nhật';
  el.detailMainIndustry.textContent = data.mainIndustry || 'Chưa có thông tin';

  // Industries table
  if (data.industries && data.industries.length > 0) {
    el.industriesSection.classList.remove('hidden');
    el.industriesCount.textContent = data.industries.length;
    el.filterIndustriesInput.value = '';
    renderIndustriesTable(data.industries);
  } else {
    el.industriesSection.classList.add('hidden');
  }

  // Source link
  el.btnOpenSource.href = `https://masothue.com${data.url}`;

  // Bookmark button state
  updateDetailBookmarkButton();

  // Show modal
  el.detailModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function renderIndustriesTable(industries) {
  el.industriesTbody.innerHTML = '';
  industries.forEach(ind => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="badge-mst font-mono">${escapeHtml(ind.code)}</span></td>
      <td>${escapeHtml(ind.name)}</td>
    `;
    el.industriesTbody.appendChild(tr);
  });
}

function filterIndustriesTable(term) {
  if (!state.activeDetail || !state.activeDetail.industries) return;
  const filtered = state.activeDetail.industries.filter(ind => 
    ind.code.toLowerCase().includes(term) || ind.name.toLowerCase().includes(term)
  );
  renderIndustriesTable(filtered);
}

function closeModal() {
  el.detailModal.classList.add('hidden');
  document.body.style.overflow = '';
}

// --- Copy & Export ---
function copyDetailField(elementId) {
  const text = document.getElementById(elementId).textContent;
  if (text && text !== '-') {
    copyToClipboard(text, 'Đã sao chép vào bộ nhớ tạm');
  }
}

function copySummary() {
  if (!state.activeDetail) return;
  const d = state.activeDetail;
  const summary = [
    `TÊN CÔNG TY: ${d.name}`,
    `MÃ SỐ THUẾ: ${d.taxId}`,
    `TÌNH TRẠNG: ${d.status}`,
    `ĐẠI DIỆN PHÁP LUẬT: ${d.representative}`,
    `ĐIỆN THOẠI: ${d.phone || 'N/A'}`,
    `ĐỊA CHỈ: ${d.address}`,
    d.taxAddress && d.taxAddress !== d.address ? `ĐỊA CHỈ THUẾ: ${d.taxAddress}` : null,
    `NGÀY HOẠT ĐỘNG: ${d.startDate || 'N/A'}`,
    `QUẢN LÝ BỞI: ${d.managedBy || 'N/A'}`,
    `LOẠI HÌNH: ${d.type || 'N/A'}`,
    `NGÀNH NGHỀ CHÍNH: ${d.mainIndustry || 'N/A'}`
  ].filter(Boolean).join('\n');

  copyToClipboard(summary, 'Đã sao chép tóm tắt công ty');
}

function exportJson() {
  if (!state.activeDetail) return;
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state.activeDetail, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `masothue-${state.activeDetail.taxId || 'company'}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showToast('Đã tải xuống file JSON');
}

// --- Bookmarks & History ---
function updateBookmarkCount() {
  el.bookmarkCount.textContent = state.bookmarks.length;
}

function updateDetailBookmarkButton() {
  if (!state.activeDetail) return;
  const isSaved = state.bookmarks.some(b => b.taxId === state.activeDetail.taxId || b.url === state.activeDetail.url);
  el.bookmarkDetailLabel.textContent = isSaved ? 'Đã lưu (Bấm để bỏ)' : 'Lưu vào danh sách';
}

function toggleBookmarkActiveDetail() {
  if (!state.activeDetail) return;
  const d = state.activeDetail;
  const idx = state.bookmarks.findIndex(b => b.taxId === d.taxId || b.url === d.url);
  if (idx >= 0) {
    state.bookmarks.splice(idx, 1);
    showToast('Đã bỏ lưu doanh nghiệp');
  } else {
    state.bookmarks.unshift({
      name: d.name,
      taxId: d.taxId,
      representative: d.representative,
      address: d.address,
      url: d.url
    });
    showToast('Đã lưu doanh nghiệp thành công');
  }
  localStorage.setItem('mst_bookmarks', JSON.stringify(state.bookmarks));
  updateBookmarkCount();
  updateDetailBookmarkButton();
}

function toggleBookmarkItem(item, buttonEl) {
  const idx = state.bookmarks.findIndex(b => b.taxId === item.taxId || b.url === item.url);
  if (idx >= 0) {
    state.bookmarks.splice(idx, 1);
    buttonEl.textContent = '☆ Lưu';
    showToast('Đã bỏ lưu doanh nghiệp');
  } else {
    state.bookmarks.unshift(item);
    buttonEl.textContent = '★ Đã lưu';
    showToast('Đã lưu vào danh sách');
  }
  localStorage.setItem('mst_bookmarks', JSON.stringify(state.bookmarks));
  updateBookmarkCount();
}

function saveToHistory(query, type) {
  // Remove if exists
  state.history = state.history.filter(h => h.query.toLowerCase() !== query.toLowerCase());
  state.history.unshift({ query, type, time: new Date().toLocaleDateString('vi-VN') });
  if (state.history.length > 25) state.history.pop();
  localStorage.setItem('mst_history', JSON.stringify(state.history));
}

function openHistoryDrawer() {
  el.historyList.innerHTML = '';
  if (state.history.length === 0) {
    el.historyList.innerHTML = '<p class="state-text" style="padding: 20px;">Chưa có lịch sử tra cứu nào.</p>';
  } else {
    state.history.forEach(item => {
      const div = document.createElement('div');
      div.className = 'drawer-item';
      div.innerHTML = `
        <div class="drawer-item-title">${escapeHtml(item.query)}</div>
        <div class="drawer-item-sub">
          <span>${item.type === 'auto' ? 'Tự động' : item.type}</span>
          <span>${item.time}</span>
        </div>
      `;
      div.addEventListener('click', () => {
        closeHistoryDrawer();
        el.searchInput.value = item.query;
        el.searchType.value = item.type || 'auto';
        executeSearch(item.query, item.type || 'auto', 1);
      });
      el.historyList.appendChild(div);
    });
  }
  el.drawerHistory.classList.remove('hidden');
}

function closeHistoryDrawer() {
  el.drawerHistory.classList.add('hidden');
}

function clearHistory() {
  state.history = [];
  localStorage.removeItem('mst_history');
  openHistoryDrawer();
  showToast('Đã xóa toàn bộ lịch sử');
}

function openBookmarksDrawer() {
  el.bookmarksList.innerHTML = '';
  if (state.bookmarks.length === 0) {
    el.bookmarksList.innerHTML = '<p class="state-text" style="padding: 20px;">Chưa có doanh nghiệp nào được lưu.</p>';
  } else {
    state.bookmarks.forEach(item => {
      const div = document.createElement('div');
      div.className = 'drawer-item';
      div.innerHTML = `
        <div class="drawer-item-title">${escapeHtml(item.name)}</div>
        <div class="drawer-item-sub">
          <span>MST: <strong>${escapeHtml(item.taxId || 'N/A')}</strong></span>
          <span>${escapeHtml(item.representative || '')}</span>
        </div>
      `;
      div.addEventListener('click', () => {
        closeBookmarksDrawer();
        fetchAndShowDetail(item.url);
      });
      el.bookmarksList.appendChild(div);
    });
  }
  el.drawerBookmarks.classList.remove('hidden');
}

function closeBookmarksDrawer() {
  el.drawerBookmarks.classList.add('hidden');
}

function clearBookmarks() {
  state.bookmarks = [];
  localStorage.removeItem('mst_bookmarks');
  updateBookmarkCount();
  openBookmarksDrawer();
  showToast('Đã xóa danh sách lưu');
}

// --- Theme Switcher ---
function toggleTheme() {
  const newTheme = state.theme === 'light' ? 'dark' : 'light';
  state.theme = newTheme;
  localStorage.setItem('mst_theme', newTheme);
  applyTheme(newTheme);
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
    document.body.classList.remove('light-theme');
    el.themeIconMoon.classList.add('hidden');
    el.themeIconSun.classList.remove('hidden');
  } else {
    document.body.classList.add('light-theme');
    document.body.classList.remove('dark-theme');
    el.themeIconMoon.classList.remove('hidden');
    el.themeIconSun.classList.add('hidden');
  }
}

// --- Helper Functions ---
function setLoading(isLoading) {
  el.btnSearch.disabled = isLoading;
  el.btnSpinner.classList.toggle('hidden', !isLoading);
  el.btnText.classList.toggle('hidden', isLoading);
}

function hideAllViews() {
  el.welcomeSection.classList.add('hidden');
  el.resultsSection.classList.add('hidden');
  el.errorState.classList.add('hidden');
}

function showError(title, message) {
  hideAllViews();
  el.errorTitle.textContent = title;
  el.errorMessage.textContent = message;
  el.errorState.classList.remove('hidden');
}

function showToast(text, duration = 3000) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>✓</span><span>${escapeHtml(text)}</span>`;
  el.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'all 0.2s';
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

function copyToClipboard(text, successMessage) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMessage || 'Đã sao chép');
    });
  } else {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    showToast(successMessage || 'Đã sao chép');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
