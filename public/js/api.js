/**
 * js/api.js — Shared API helpers, toast, auth utilities
 */

// ─── Base fetch wrapper ─────────────────────────────────────────────────────
const API = {
  async request(method, url, body = null, isFormData = false) {
    const opts = {
      method,
      credentials: 'include',
    };
    if (body) {
      if (isFormData) {
        opts.body = body; // FormData — let browser set content-type
      } else {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify(body);
      }
    }
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
    return data;
  },
  get:    (url)          => API.request('GET',    url),
  post:   (url, body)    => API.request('POST',   url, body),
  delete: (url)          => API.request('DELETE', url),
  upload: (url, formData)=> API.request('POST',   url, formData, true),
};

// ─── Toast Notifications ────────────────────────────────────────────────────
let toastContainer;
function initToasts() {
  toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    toastContainer.id = 'toast-container';
    document.body.appendChild(toastContainer);
  }
}

function showToast(message, type = 'info', duration = 4000) {
  if (!toastContainer) initToasts();
  const icons = { success: '🌸', error: '💔', info: '✨' };
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span style="font-size:1.2rem">${icons[type]}</span> ${message}`;
  toastContainer.appendChild(t);

  setTimeout(() => {
    t.classList.add('removing');
    t.addEventListener('animationend', () => t.remove(), { once: true });
  }, duration);
}

const toast = {
  success: (msg) => showToast(msg, 'success'),
  error:   (msg) => showToast(msg, 'error'),
  info:    (msg) => showToast(msg, 'info'),
};

// ─── Auth State ─────────────────────────────────────────────────────────────
let currentUser = null;

async function loadCurrentUser() {
  try {
    const data = await API.get('/api/auth/me');
    currentUser = data.user;
    return currentUser;
  } catch {
    currentUser = null;
    return null;
  }
}

function isLoggedIn() { return currentUser !== null; }
function isAdmin()    { return currentUser && currentUser.role === 'admin'; }

// ─── Navbar Builder ─────────────────────────────────────────────────────────
async function buildNavbar(activePage = '') {
  await loadCurrentUser();

  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  navbar.innerHTML = `
    <nav class="navbar" role="navigation">
      <div class="navbar-inner">
        <a href="/" class="navbar-logo" id="nav-logo">
          <span class="logo-icon">🌸</span>
          <span>MangaVault</span>
        </a>
        <div class="navbar-search">
          <span class="search-icon">🔍</span>
          <input type="text" id="global-search" placeholder="Search manga, author…" autocomplete="off"/>
        </div>
        <div class="navbar-actions">
          <a href="/" class="nav-link ${activePage === 'home' ? 'active' : ''}">Library</a>
          ${isLoggedIn() ? `
            <a href="/upload.html" class="nav-link ${activePage === 'upload' ? 'active' : ''}">Upload</a>
            <div class="user-badge" id="user-menu-btn" style="cursor:pointer" title="${currentUser.email}">
              <div class="user-avatar">${currentUser.username[0].toUpperCase()}</div>
              <span>${currentUser.username}</span>
              ${isAdmin() ? '<span style="font-size:0.68rem;background:linear-gradient(135deg,#f472b6,#a78bfa);color:#fff;padding:2px 8px;border-radius:99px;margin-left:2px;font-weight:800">✦ ADMIN</span>' : ''}
            </div>
            <button class="btn btn-ghost btn-sm" id="logout-btn">Logout</button>
          ` : `
            <a href="/login.html" class="btn btn-ghost btn-sm">Login</a>
            <a href="/register.html" class="btn btn-primary btn-sm">Register</a>
          `}
        </div>
      </div>
    </nav>
  `;

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try {
      await API.post('/api/auth/logout');
      toast.success('Logged out successfully');
      setTimeout(() => window.location.href = '/', 600);
    } catch { toast.error('Logout failed'); }
  });

  // Search (debounced)
  const searchInput = document.getElementById('global-search');
  if (searchInput) {
    let timer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const q = e.target.value.trim();
        if (activePage === 'home' && typeof onSearch === 'function') {
          onSearch(q);
        } else if (q) {
          window.location.href = `/?search=${encodeURIComponent(q)}`;
        }
      }, 400);
    });
  }
}

// ─── Cover image fallback ────────────────────────────────────────────────────
function coverOrPlaceholder(manga) {
  if (manga.coverImage) {
    return `<img src="${manga.coverImage}" alt="${escHtml(manga.title)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=&quot;manga-card-cover-placeholder&quot;><span>📖</span></div>'" />`;
  }
  return `<div class="manga-card-cover-placeholder"><span>📖</span><small style="font-size:0.6rem;margin-top:4px">No Cover</small></div>`;
}

// ─── Build manga card HTML ────────────────────────────────────────────────────
function mangaCardHTML(manga) {
  const chapters = manga.chapters?.length || 0;
  const statusClass = { ongoing: 'badge-ongoing', completed: 'badge-completed', hiatus: 'badge-hiatus' }[manga.status] || '';
  const avg = manga.rating?.count > 0
    ? (manga.rating.total / manga.rating.count).toFixed(1)
    : '—';

  return `
    <div class="manga-card" onclick="window.location.href='/reader.html?id=${manga._id}'" role="button" tabindex="0"
         aria-label="Open ${escHtml(manga.title)}" data-id="${manga._id}">
      <div class="manga-card-cover">
        ${coverOrPlaceholder(manga)}
        <div class="manga-card-badge ${statusClass}">${manga.status || 'ongoing'}</div>
        <div class="manga-card-overlay">
          <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();window.location.href='/reader.html?id=${manga._id}'">
            ▶ Read Now
          </button>
        </div>
      </div>
      <div class="manga-card-info">
        <div class="manga-card-title">${escHtml(manga.title)}</div>
        <div class="manga-card-meta">${escHtml(manga.author || 'Unknown')} · ⭐ ${avg}</div>
        <div class="manga-card-chapters">${chapters} chapter${chapters !== 1 ? 's' : ''}</div>
      </div>
    </div>
  `;
}

// ─── Escape HTML ─────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Format date ─────────────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ─── Init toasts on load ─────────────────────────────────────────────────────
initToasts();

// ─── Sakura Petal Rain 🌸 ────────────────────────────────────────────────────
(function spawnPetals() {
  const petals = ['🌸', '🌺', '✿', '❀', '🌼'];
  const count  = 12;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('span');
    el.className = 'petal';
    el.textContent = petals[Math.floor(Math.random() * petals.length)];
    el.style.left     = `${Math.random() * 100}vw`;
    el.style.fontSize = `${0.8 + Math.random() * 1.2}rem`;
    el.style.animationDuration  = `${6 + Math.random() * 10}s`;
    el.style.animationDelay     = `${Math.random() * 12}s`;
    el.style.opacity = '0';
    document.body.appendChild(el);
  }
})();
