/**
 * js/api.js — Shared API helpers, toast, auth utilities
 */

// ─── Backend URL (Render when deployed, localhost when dev) ─────────────────
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? ''
  : 'https://manga-reader-3ize.onrender.com';

// ─── Page base for navigation (handles GitHub Pages subfolder) ───────────────
// On GitHub Pages the app lives at /manga-reader/ so we must prefix all navigation.
// On Render and localhost it lives at / so no prefix needed.
const PAGE_BASE = window.location.hostname === 'caccuoc6-alt.github.io'
  ? '/manga-reader'
  : '';

// ─── JWT token helpers ───────────────────────────────────────────────────────
const TOKEN_KEY = 'sta_jwt'; // SkibidiToiletArchive JWT
function getToken()        { return localStorage.getItem(TOKEN_KEY); }
function setToken(t)       { localStorage.setItem(TOKEN_KEY, t); }
function clearToken()      { localStorage.removeItem(TOKEN_KEY); }

// ─── Base fetch wrapper ─────────────────────────────────────────────────────
const API = {
  async request(method, url, body = null, isFormData = false) {
    const opts = { method, credentials: 'include' };

    // Attach JWT if we have one
    const token = getToken();
    opts.headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    if (body) {
      if (isFormData) {
        opts.body = body; // FormData — let browser set content-type
      } else {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
    }
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
    return data;
  },
  get:    (url)          => API.request('GET',    API_BASE + url),
  post:   (url, body)    => API.request('POST',   API_BASE + url, body),
  delete: (url)          => API.request('DELETE', API_BASE + url),
  upload: (url, formData)=> API.request('POST',   API_BASE + url, formData, true),
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
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span style="font-weight:900;margin-right:8px">${icons[type]}</span> ${message}`;
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
  if (!getToken()) { currentUser = null; return null; }
  try {
    const data = await API.get('/api/auth/me');
    currentUser = data.user;
    return currentUser;
  } catch {
    clearToken();
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
        <a href="./index.html" class="navbar-logo" id="nav-logo">
          <span>SkibidiArchive</span>
        </a>
        <div class="navbar-search">
          <span class="search-icon">🔍</span>
          <input type="text" id="global-search" placeholder="Search manga, author…" autocomplete="off"/>
        </div>
        <div class="navbar-actions">
          <a href="./index.html" class="nav-link ${activePage === 'home' ? 'active' : ''}">Library</a>
          ${isLoggedIn() ? `
            <a href="./upload.html" class="nav-link ${activePage === 'upload' ? 'active' : ''}">Upload</a>
            <a href="./profile.html?id=${currentUser.id}" class="nav-link ${activePage === 'profile' ? 'active' : ''}">Profile</a>
            ${isAdmin() ? `<a href="./admin.html" class="nav-link ${activePage === 'admin' ? 'active' : ''}" style="color:var(--accent-secondary);font-weight:900">⚙ Admin</a>` : ''}
            <div class="user-badge" id="user-menu-btn" style="cursor:pointer" title="Click to change avatar (${currentUser.email})">
              <div class="user-avatar" id="avatar-trigger" style="overflow:hidden">
                ${currentUser.profilePicture 
                  ? `<img src="${currentUser.profilePicture}" style="width:100%;height:100%;object-fit:cover" />`
                  : currentUser.username[0].toUpperCase()
                }
              </div>
              <span>${currentUser.username}</span>
              ${isAdmin() ? '<span style="font-size:0.62rem;background:var(--accent-primary);color:#fff;padding:1px 6px;border-radius:2px;margin-left:6px;font-weight:900">ADMIN</span>' : ''}
            </div>
            <input type="file" id="avatar-input" accept="image/*" style="display:none" />
            <button class="btn btn-ghost btn-sm" id="logout-btn">Logout</button>
          ` : `
            <a href="./login.html" class="btn btn-ghost btn-sm">Login</a>
            <a href="./register.html" class="btn btn-primary btn-sm">Register</a>
          `}
        </div>
      </div>
    </nav>
  `;

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try {
      await API.post('/api/auth/logout');
      clearToken();
      currentUser = null;
      toast.success('Logged out 🌸');
      setTimeout(() => window.location.href = PAGE_BASE + '/index.html', 600);
    } catch { toast.error('Logout failed'); }
  });

  // Avatar Upload
  const avatarTrigger = document.getElementById('avatar-trigger');
  const avatarInput = document.getElementById('avatar-input');
  if (avatarTrigger && avatarInput) {
    avatarTrigger.addEventListener('click', () => avatarInput.click());
    avatarInput.addEventListener('change', async (e) => {
      if (!e.target.files.length) return;
      const fd = new FormData();
      fd.append('avatar', e.target.files[0]);
      toast.success('Uploading profile picture...');
      try {
        const res = await API.upload('/api/auth/profile-picture', fd);
        toast.success(res.message);
        setTimeout(() => window.location.reload(), 800);
      } catch (err) {
        toast.error(err.message || 'Failed to upload profile picture');
      }
    });
  }

  // Search (debounced for home, Enter for other pages)
  const searchInput = document.getElementById('global-search');
  if (searchInput) {
    let timer;
    
    // Auto-filter on input for home page
    searchInput.addEventListener('input', (e) => {
      if (activePage === 'home' && typeof onSearch === 'function') {
        clearTimeout(timer);
        timer = setTimeout(() => {
          onSearch(e.target.value.trim());
        }, 400);
      }
    });

    // Redirect to home on Enter for other pages
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = e.target.value.trim();
        if (activePage !== 'home' && q) {
          window.location.href = PAGE_BASE + `/index.html?search=${encodeURIComponent(q)}`;
        }
      }
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
    <div class="manga-card" onclick="window.location.href=PAGE_BASE+'/reader.html?id=${manga._id}'" role="button" tabindex="0"
         aria-label="Open ${escHtml(manga.title)}" data-id="${manga._id}">
      <div class="manga-card-cover">
        ${coverOrPlaceholder(manga)}
        <div class="manga-card-badge ${statusClass}">${manga.status || 'ongoing'}</div>
        <div class="manga-card-overlay">
          <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();window.location.href=PAGE_BASE+'/reader.html?id=${manga._id}'">
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

