/* ─────────────────────────────────────────────────────────────
   NagarVaani — Application Logic
   Features: Auth, Grievance Submission, Translation (MyMemory API),
             Geolocation, Admin Status Management, Dark Mode
───────────────────────────────────────────────────────────── */

'use strict';

// ─── USERS DB (simulate) ───
const USERS = {
  citizen1:  { password: 'pass123',  role: 'citizen', displayName: 'Rahul Sharma' },
  pratham:     { password: 'Pratham@2007', role: 'citizen', displayName: 'Pratham Guram'  },
  ananya:    { password: 'hello99',  role: 'citizen', displayName: 'Ananya Singh' },
  Aushtosh:     { password: 'Aushutosh',role: 'admin',   displayName: 'Admin'},
};
// ─── STATE ───
let currentUser  = null;
let currentRole  = null;
let userLocation = null;
let loginMode    = 'citizen'; // which login form is showing
let allGrievances = JSON.parse(localStorage.getItem('nv_grievances') || '[]');
let currentFilter = 'all';
let currentSearch  = '';

// ─── SAVE ───
function save() {
  localStorage.setItem('nv_grievances', JSON.stringify(allGrievances));
}

// ─── PAGE NAVIGATION ───
const pages = ['homePage', 'loginPage', 'citizenPage', 'adminPage'];
function showPage(id, mode) {
  pages.forEach(p => document.getElementById(p).classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  window.scrollTo(0, 0);

  if (id === 'loginPage') {
    loginMode = mode || 'citizen';
    setupLoginUI(loginMode);
  }
  if (id === 'homePage') updateHeroStats();
}

function setupLoginUI(mode) {
  const icon  = document.getElementById('loginIcon');
  const title = document.getElementById('loginTitle');
  const sub   = document.getElementById('loginSub');
  if (mode === 'admin') {
    icon.textContent  = '🛡️';
    title.textContent = 'Admin Login';
    sub.textContent   = 'Sign in to manage citizen grievances';
  } else {
    icon.textContent  = '🙍';
    title.textContent = 'Citizen Login';
    sub.textContent   = 'Sign in to report issues in your locality';
  }
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
  document.getElementById('loginErr').classList.add('hidden');
}

// ─── AUTH ───
function doLogin() {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  const errEl    = document.getElementById('loginErr');

  const user = USERS[username];
  if (!user || user.password !== password || user.role !== loginMode) {
    errEl.classList.remove('hidden');
    shake(document.querySelector('.login-card'));
    return;
  }
  errEl.classList.add('hidden');
  currentUser = username;
  currentRole = user.role;

  if (user.role === 'admin') {
    showPage('adminPage');
    renderAdmin();
  } else {
    document.getElementById('citizenName').textContent = user.displayName;
    showPage('citizenPage');
    renderMyGrievances();
  }
}

// Allow Enter key on login
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !document.getElementById('loginPage').classList.contains('hidden')) {
    doLogin();
  }
});

function logout() {
  currentUser  = null;
  currentRole  = null;
  userLocation = null;
  document.getElementById('locationStatus').textContent = '📍 Location not added';
  document.getElementById('issueDesc').value = '';
  document.getElementById('issueLocality').value = '';
  document.getElementById('issueCategory').value = '';
  showPage('homePage');
}

// ─── GEOLOCATION ───
// ─── GEOLOCATION & REVERSE GEOCODING ───
function addLocation() {
  const statusEl = document.getElementById('locationStatus');
  const btnEl    = document.querySelector('.btn-location');
  statusEl.textContent = '🔄 Fetching location…';
  btnEl.disabled = true;

  if (!navigator.geolocation) {
    statusEl.textContent = '❌ Geolocation not supported';
    btnEl.disabled = false;
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      userLocation = {
        lat: pos.coords.latitude.toFixed(5),
        lng: pos.coords.longitude.toFixed(5),
        accuracy: Math.round(pos.coords.accuracy),
      };

      statusEl.textContent = '🔄 Resolving address...';

      try {
        // Reverse Geocoding using OpenStreetMap Nominatim API
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLocation.lat}&lon=${userLocation.lng}`);
        const data = await response.json();

        if (data && data.display_name) {
          // Save the formatted address to our location object
          userLocation.address = data.display_name;
          statusEl.textContent = `✅ Location: ${data.display_name}`;
        } else {
          // Fallback if the API doesn't return a display name
          statusEl.textContent = `✅ Location: ${userLocation.lat}, ${userLocation.lng}`;
        }
      } catch (error) {
        console.error("Geocoding failed:", error);
        // Fallback to coordinates if the network request fails
        statusEl.textContent = `✅ Location: ${userLocation.lat}, ${userLocation.lng}`;
      }

      btnEl.textContent = 'Update Location';
      btnEl.disabled = false;
    },
    (err) => {
      statusEl.textContent = '⚠️ Permission denied — location not added';
      btnEl.disabled = false;
    },
    { timeout: 10000 }
  );
}

// ─── TRANSLATION (MyMemory Free API) ───
async function translateToEnglish(text) {
  // Quick check: if text is already predominantly English, skip
  const nonLatin = (text.match(/[^\x00-\x7F]/g) || []).length;
  if (nonLatin / text.length < 0.15) return { translated: text, original: null };

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=hi|en`;
    const res  = await fetch(url);
    const data = await res.json();
    if (data.responseStatus === 200) {
      const translated = data.responseData.translatedText;
      if (translated && translated.toLowerCase() !== text.toLowerCase()) {
        return { translated, original: text };
      }
    }
  } catch (_) {}
  return { translated: text, original: null };
}

// ─── SUBMIT GRIEVANCE ───
async function submitGrievance() {
  const category = document.getElementById('issueCategory').value;
  const locality = document.getElementById('issueLocality').value.trim();
  const desc     = document.getElementById('issueDesc').value.trim();
  const btn      = document.getElementById('submitBtn');
  const btnText  = document.getElementById('submitBtnText');

  if (!category) { alert('Please select an issue category.'); return; }
  if (!desc)     { alert('Please describe your issue.'); return; }

  // Disable button, show loading
  btn.disabled    = true;
  btnText.textContent = '⏳ Translating & submitting…';

  const { translated, original } = await translateToEnglish(desc);

  const grievance = {
    id:          Date.now(),
    userId:      currentUser,
    displayName: USERS[currentUser].displayName,
    category,
    locality,
    desc:        translated,
    originalDesc: original,
    location:    userLocation ? { ...userLocation } : null,
    status:      'Registered',
    timestamp:   new Date().toISOString(),
  };

  allGrievances.unshift(grievance);
  save();

  // Reset form
  document.getElementById('issueDesc').value     = '';
  document.getElementById('issueLocality').value = '';
  document.getElementById('issueCategory').value = '';
  userLocation = null;
  document.getElementById('locationStatus').textContent = '📍 Location not added';
  btn.disabled    = false;
  btnText.textContent = 'Submit Grievance';

  // Show toast
  const toast = document.getElementById('successToast');
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 4000);

  renderMyGrievances();
  updateHeroStats();
}

// ─── RENDER CITIZEN GRIEVANCES ───
function renderMyGrievances() {
  const el  = document.getElementById('myGrievancesList');
  const mine = allGrievances.filter(g => g.userId === currentUser);
  if (!mine.length) {
    el.innerHTML = '<p class="empty-state">No grievances filed yet. File one above!</p>';
    return;
  }
  el.innerHTML = mine.map(g => grievanceCard(g, false)).join('');
}

// ─── RENDER ADMIN GRIEVANCES ───
function renderAdmin() {
  updateAdminStats();
  let list = allGrievances;

  if (currentFilter !== 'all') list = list.filter(g => g.status === currentFilter);
  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    list = list.filter(g =>
      g.displayName.toLowerCase().includes(q) ||
      g.desc.toLowerCase().includes(q) ||
      g.category.toLowerCase().includes(q) ||
      (g.locality || '').toLowerCase().includes(q)
    );
  }

  const el = document.getElementById('adminGrievancesList');
  if (!list.length) {
    el.innerHTML = '<p class="empty-state">No grievances found.</p>';
    return;
  }
  el.innerHTML = list.map(g => grievanceCard(g, true)).join('');
}

function updateAdminStats() {
  document.getElementById('adminTotal').textContent = allGrievances.length;
  document.getElementById('adminReg').textContent   = allGrievances.filter(g => g.status === 'Registered').length;
  document.getElementById('adminProg').textContent  = allGrievances.filter(g => g.status === 'In Progress').length;
  document.getElementById('adminRes').textContent   = allGrievances.filter(g => g.status === 'Resolved').length;
}

// ─── GRIEVANCE CARD RENDERER ───
// ─── GRIEVANCE CARD RENDERER ───
function grievanceCard(g, isAdmin) {
  const statusClass = {
    'Registered':  'badge-registered',
    'In Progress': 'badge-in-progress',
    'Resolved':    'badge-resolved',
  }[g.status] || 'badge-registered';

  const statusIcon = {
    'Registered':  '🔵',
    'In Progress': '🟡',
    'Resolved':    '🟢',
  }[g.status] || '🔵';

  // UPDATED: Check for an address first, fallback to coordinates
  const locationHtml = g.location
    ? `<div class="gi-location">📍 ${g.location.address ? escHtml(g.location.address) : `${g.location.lat}, ${g.location.lng}`}</div>`
    : '';

  const originalHtml = g.originalDesc
    ? `<div class="gi-desc-original">Original (Hindi): ${escHtml(g.originalDesc)}</div>`
    : '';

  const adminRow = isAdmin ? `
    <div class="gi-admin-row">
      <span class="gi-user">👤 ${escHtml(g.displayName)} (@${g.userId})</span>
      <button class="status-btn ${g.status === 'Registered' ? 'active-registered' : ''}"
        onclick="setStatus(${g.id}, 'Registered')">🔵 Registered</button>
      <button class="status-btn ${g.status === 'In Progress' ? 'active-in-progress' : ''}"
        onclick="setStatus(${g.id}, 'In Progress')">🟡 In Progress</button>
      <button class="status-btn ${g.status === 'Resolved' ? 'active-resolved' : ''}"
        onclick="setStatus(${g.id}, 'Resolved')">🟢 Resolved</button>
    </div>` : '';

  return `
    <div class="grievance-item" id="gi-${g.id}">
      <div class="gi-header">
        <span class="gi-category">${escHtml(g.category)}</span>
        ${g.locality ? `<span class="gi-locality">📌 ${escHtml(g.locality)}</span>` : ''}
        <span class="status-badge ${statusClass}">${statusIcon} ${g.status}</span>
        <span class="gi-time">${timeAgo(g.timestamp)}</span>
      </div>
      <div class="gi-desc">${escHtml(g.desc)}</div>
      ${originalHtml}
      ${locationHtml}
      ${adminRow}
    </div>`;
}

function escHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

// ─── ADMIN: SET STATUS ───
function setStatus(id, status) {
  const g = allGrievances.find(g => g.id === id);
  if (!g) return;
  g.status = status;
  save();
  renderAdmin();
}

// ─── ADMIN: FILTER ───
function filterGrievances(btn, filter) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentFilter = filter;
  renderAdmin();
}

// ─── ADMIN: SEARCH ───
function searchGrievances(val) {
  currentSearch = val;
  renderAdmin();
}

// ─── HERO STATS ───
function updateHeroStats() {
  animateNumber('heroTotal',    allGrievances.length);
  animateNumber('heroResolved', allGrievances.filter(g => g.status === 'Resolved').length);
  animateNumber('heroProgress', allGrievances.filter(g => g.status === 'In Progress').length);
}

function animateNumber(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let current = 0;
  const step  = Math.max(1, Math.ceil(target / 30));
  const timer = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = current;
    if (current >= target) clearInterval(timer);
  }, 30);
}

// ─── DARK MODE ───
function syncTheme(isDark) {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  localStorage.setItem('nv_theme', isDark ? 'dark' : 'light');
  // Sync all three toggles
  ['themeToggle','themeToggle2','themeToggle3'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = isDark;
  });
}

['themeToggle','themeToggle2','themeToggle3'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', (e) => {
    syncTheme(e.target.checked);
  });
});

// Load saved theme
const savedTheme = localStorage.getItem('nv_theme') || 'light';
syncTheme(savedTheme === 'dark');

// ─── SHAKE ANIMATION ───
function shake(el) {
  el.style.animation = 'none';
  el.offsetHeight; // reflow
  el.style.animation = 'shakeX 0.4s ease';
}

// Inject shake keyframes
const style = document.createElement('style');
style.textContent = `
@keyframes shakeX {
  0%,100% { transform: translateX(0); }
  20%     { transform: translateX(-8px); }
  40%     { transform: translateX(8px); }
  60%     { transform: translateX(-5px); }
  80%     { transform: translateX(5px); }
}`;
document.head.appendChild(style);

// ─── BRAND CLICK → HOME ───
document.querySelector('.nav-brand').addEventListener('click', () => {
  if (currentUser) {
    if (currentRole === 'admin') showPage('adminPage');
    else showPage('citizenPage');
  } else {
    showPage('homePage');
  }
});

// ─── INIT ───
updateHeroStats();
