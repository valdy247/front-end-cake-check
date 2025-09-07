// Simple SPA state
const S = {
  token: localStorage.getItem('cc_token') || null,
  user: null,
  products: [],
  selected: [], // {id, name, unit, pricePerUnit, qty, qtyUnit}
  lang: localStorage.getItem('cc_lang') || 'es',
};

const I18N = {
  es: { add: 'Añadir', search: 'Buscar', delete: 'Eliminar', view: 'Ver', loading: 'Cargando' },
  en: { add: 'Add', search: 'Search', delete: 'Delete', view: 'View', loading: 'Loading' },
};
const t = (k) => (I18N[S.lang] && I18N[S.lang][k]) || k;

const fmt = (n) => (Math.round(n * 100) / 100).toFixed(2);
function fmtUnit(n) {
  if (!isFinite(n)) return '0.00';
  const abs = Math.abs(n);
  const decimals = abs < 0.01 ? 6 : 2;
  const m = Math.pow(10, decimals);
  return (Math.round(n * m) / m).toFixed(decimals);
}

function showView(id) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showPanel(id) {
  document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}),
    },
    ...opts,
  });
  if (!res.ok) {
    let msg = 'Error API';
    try { msg = (await res.json()).error || msg; } catch (_) { try { msg = await res.text(); } catch (_) {} }
    throw new Error(msg);
  }
  if (res.status === 204) return {};
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}

// Splash
document.getElementById('btn-enter')?.addEventListener('click', () => showView('view-auth'));

// Auth
document.getElementById('form-login')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') }) });
    S.token = data.token; localStorage.setItem('cc_token', S.token); S.user = data.user;
    document.getElementById('auth-msg').textContent = '';
    await enterPortal();
  } catch (err) {
    document.getElementById('auth-msg').textContent = err.message;
  }
});

document.getElementById('form-signup')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api('/api/signup', { method: 'POST', body: JSON.stringify({ name: fd.get('name'), email: fd.get('email'), password: fd.get('password') }) });
    document.getElementById('auth-msg').textContent = 'Cuenta creada, ahora inicia sesión';
  } catch (err) {
    document.getElementById('auth-msg').textContent = err.message;
  }
});

// Drawer
const drawer = document.getElementById('drawer');
document.getElementById('btn-menu')?.addEventListener('click', (e) => { e.stopPropagation(); drawer.classList.add('open'); document.body.classList.add('drawer-open'); });
drawer?.querySelector('.drawer-close')?.addEventListener('click', () => { drawer.classList.remove('open'); document.body.classList.remove('drawer-open'); });
drawer?.addEventListener('click', async (e) => {
  const a = e.target.closest('a.navlink'); if (!a) return; e.preventDefault();
  drawer.classList.remove('open'); document.body.classList.remove('drawer-open');
  const hash = a.getAttribute('href').slice(1);
  if (hash === 'recipes') showPanel('panel-recipes');
  if (hash === 'calculator') { showPanel('panel-calculator'); document.getElementById('search-results').innerHTML = ''; }
  if (hash === 'add-product') { showPanel('panel-add-product'); await loadCustomProducts(); }
  if (hash === 'comunidad') { showPanel('panel-comunidad'); await loadPosts(); maybeScrollToPostFromHash(); }
  if (hash === 'logout') {
    try { await api('/api/logout', { method: 'POST' }); } catch (_) {}
    localStorage.removeItem('cc_token'); S.token = null; S.user = null; showView('view-auth');
  }
});

// Click fuera para cerrar drawer/detalle receta
document.addEventListener('click', (e) => {
  if (drawer && drawer.classList.contains('open')) {
    const clickedInDrawer = e.target.closest('#drawer');
    const clickedMenuBtn = e.target.closest('#btn-menu');
    if (!clickedInDrawer && !clickedMenuBtn) { drawer.classList.remove('open'); document.body.classList.remove('drawer-open'); }
  }
  const detail = document.getElementById('recipe-detail');
  if (detail && !detail.classList.contains('hidden')) {
    if (!e.target.closest('#recipe-detail')) { detail.classList.add('hidden'); detail.innerHTML = ''; }
  }
});

// Language switch
document.getElementById('btn-lang-es')?.addEventListener('click', () => { S.lang = 'es'; localStorage.setItem('cc_lang','es'); setLangButtons(); refreshTexts(); });
document.getElementById('btn-lang-en')?.addEventListener('click', () => { S.lang = 'en'; localStorage.setItem('cc_lang','en'); setLangButtons(); refreshTexts(); });

function setLangButtons() {
  const esBtn = document.getElementById('btn-lang-es');
  const enBtn = document.getElementById('btn-lang-en');
  if (esBtn && enBtn) { esBtn.classList.toggle('active', S.lang==='es'); enBtn.classList.toggle('active', S.lang==='en'); }
}

function refreshTexts() {
  // Search button
  const sb = document.getElementById('search-btn'); if (sb) sb.textContent = t('search');
  // Re-render current results and selected
  renderProducts();
  renderSelected();
  // Static labels/titles if present
  const map = {
    'i18n-splash-subtitle': { es: 'Tu asistente de costos dulces', en: 'Your sweet cost assistant' },
    'i18n-login-title': { es: 'Accede a tu cuenta', en: 'Sign in to your account' },
    'i18n-signup-title': { es: 'Crea una cuenta', en: 'Create an account' },
    'i18n-login-btn': { es: 'Iniciar sesión', en: 'Sign in' },
    'i18n-signup-btn': { es: 'Registrarme', en: 'Sign up' },
    'i18n-recipes-title': { es: 'Recetas populares', en: 'Popular recipes' },
    'i18n-calc-title': { es: 'Calculadora de costos', en: 'Cost calculator' },
    'i18n-selected-title': { es: 'Ingredientes seleccionados', en: 'Selected ingredients' },
    'label-total-cost': { es: 'Costo total:', en: 'Total cost:' },
    'label-final-price': { es: 'Precio sugerido (x3):', en: 'Suggested price (x3):' },
    'i18n-addp-title': { es: 'Agregar producto personalizado', en: 'Add custom product' },
    'i18n-addp-hint': { es: 'Ejemplos: kg = precio por kilo; g = precio por gramo; l = por litro; ml = por mililitro; unidad = por pieza.', en: 'Examples: kg = price per kilogram; g = per gram; l = per liter; ml = per milliliter; unidad = per piece.' },
    'i18n-custom-title': { es: 'Mis productos personalizados', en: 'My custom products' },
  };
  Object.entries(map).forEach(([id, dict]) => { const el = document.getElementById(id); if (el) el.textContent = dict[S.lang] || el.textContent; });
  // Drawer links if present
  const navMap = {
    'i18n-nav-recipes': { es: 'Recetas', en: 'Recipes' },
    'i18n-nav-calculator': { es: 'Calculadora', en: 'Calculator' },
    'i18n-nav-custom': { es: 'Producto personalizado', en: 'Custom product' },
    'i18n-nav-logout': { es: 'Cerrar sesión', en: 'Sign out' },
  };
  Object.entries(navMap).forEach(([id, dict]) => { const el = document.getElementById(id); if (el) el.textContent = dict[S.lang] || el.textContent; });
}

async function enterPortal() {
  try {
    const me = await api('/api/me');
    S.user = me; document.getElementById('user-name').textContent = me.name || me.email;
  } catch (_) { localStorage.removeItem('cc_token'); S.token = null; showView('view-auth'); return; }
  showView('view-portal');
  await loadProducts();
  await loadRecipes();
  recalcTotals();
}

async function loadProducts() {
  const list = await api('/api/products');
  S.products = list;
}

async function loadRecipes() {
  const ul = document.getElementById('recipes-list');
  ul.innerHTML = `<li>${t('loading')}...</li>`;
  const recipes = await api('/api/recipes');
  ul.innerHTML = '';
  for (const r of recipes) {
    const li = document.createElement('li');
    const time = r.time || '';
    li.innerHTML = `
      <div class="recipe-item" data-recipe-id="${r.id}" style="display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:pointer">
        <div>
          <div style="font-weight:600">${r.name}</div>
          <div class="badges"><span class="badge badge-time">${time}</span></div>
        </div>
      </div>`;
    ul.appendChild(li);
  }
  ul.addEventListener('click', async (e) => {
    const item = e.target.closest('.recipe-item'); if (!item) return;
    e.preventDefault(); e.stopPropagation();
    const id = item.getAttribute('data-recipe-id');
    const li = item.closest('li');
    const box = document.getElementById('recipe-detail');
    // Toggle: if same open, close
    if (S.openRecipeId === id && box && !box.classList.contains('hidden')) {
      box.classList.add('hidden'); box.innerHTML = ''; S.openRecipeId = null; return;
    }
    S.openRecipeId = id;
    if (box) {
      box.innerHTML = `<div class="hint">${t('loading')}...</div>`;
      li.after(box);
    }
    try { const detail = await api('/api/recipes/' + id); showRecipe(detail); } catch (err) { console.error(err); }
  });
}

function showRecipe(r) {
  const box = document.getElementById('recipe-detail');
  const headerBadges = `
    <div class="badges" style="margin:6px 0 10px 0">
      ${r.time ? `<span class="badge badge-time">${r.time}</span>`:''}
    </div>`;
  if (r.full) {
    const yieldHtml = r.yield ? `\nRinde: ${r.yield}` : '';
    const equipHtml = Array.isArray(r.equipment) ? `\nEquipo: ${r.equipment.join(', ')}` : '';
    box.innerHTML = `
      <h3>${r.name}</h3>
      ${headerBadges}
      <div class="hint" style="margin-bottom:6px">${[yieldHtml,equipHtml].filter(Boolean).join(' · ')}</div>
      <div class="recipe-full" style="white-space: pre-line">${r.full}</div>
    `;
  } else {
    let ingHtml = '';
    if (Array.isArray(r.ingredientsGroups)) {
      ingHtml = r.ingredientsGroups.map(g => `
        <div style="margin-top:6px"><strong>${g.title}</strong>
        ${g.items.map(item => `<div>- ${item}</div>`).join('')}</div>`).join('');
    } else if (Array.isArray(r.ingredients)) {
      ingHtml = r.ingredients.map(line => `<div>- ${line}</div>`).join('');
    }
    const stepsHtml = Array.isArray(r.steps) ? `<ol>${r.steps.map(s => `<li>${s}</li>`).join('')}</ol>` : '';
    const notesHtml = r.notes ? `<div class="hint" style="margin-top:8px">${r.notes}</div>` : '';
    const equipHtml = Array.isArray(r.equipment) ? `<div class="hint">Equipo: ${r.equipment.join(', ')}</div>` : '';
    const yieldHtml = r.yield ? `<div class="hint">Rinde: ${r.yield}</div>` : '';
    box.innerHTML = `
      <h3>${r.name}</h3>
      ${headerBadges}
      ${yieldHtml}
      ${equipHtml}
      <h4>Ingredientes</h4>
      <div>${ingHtml}</div>
      ${stepsHtml ? '<h4 style="margin-top:10px">Pasos</h4>':''}
      ${stepsHtml}
      ${notesHtml}
    `;
  }
  box.classList.remove('hidden');
}

// Search products
document.getElementById('search-btn')?.addEventListener('click', onSearchBtn);
document.getElementById('search-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onSearchBtn(); } });
document.getElementById('search-input')?.addEventListener('input', () => updateAutocomplete());

async function runSearch() {
  const q = document.getElementById('search-input').value.trim();
  const box = document.getElementById('search-results');
  if (!q) { if (box) box.innerHTML = ''; return; }
  const list = await api('/api/products?q=' + encodeURIComponent(q));
  renderProducts(list);
}

let SUG = { list: [], addMode: false };

async function updateAutocomplete() {
  const input = document.getElementById('search-input');
  const box = document.getElementById('autocomplete');
  const btn = document.getElementById('search-btn');
  const term = (input.value || '').trim();
  if (!term) { box.innerHTML = ''; SUG = { list: [], addMode: false }; if (btn) btn.textContent = t('search'); return; }
  const list = await api('/api/products?q=' + encodeURIComponent(term));
  SUG.list = list.slice(0, 8);
  SUG.addMode = SUG.list.length > 0;
  if (btn) btn.textContent = SUG.addMode ? t('add') : t('search');
  box.innerHTML = '';
  SUG.list.forEach(p => {
    const div = document.createElement('div');
    div.className = 'ac-item';
    div.innerHTML = `<div><div>${p.name}</div><div class="meta">${p.unit} · ${fmt(p.pricePerUnit || 0)} por unidad</div></div><button class="primary">${t('add')}</button>`;
    div.querySelector('button').addEventListener('click', () => {
      addSelected(p);
      input.value = '';
      box.innerHTML = '';
      SUG = { list: [], addMode: false };
      if (btn) btn.textContent = t('search');
    });
    box.appendChild(div);
  });
}

async function onSearchBtn() {
  if (SUG.addMode && SUG.list.length > 0) {
    addSelected(SUG.list[0]);
    document.getElementById('search-input').value = '';
    document.getElementById('autocomplete').innerHTML = '';
    SUG = { list: [], addMode: false };
    document.getElementById('search-btn').textContent = t('search');
    return;
  }
  await runSearch();
}

function renderProducts(list) {
  const box = document.getElementById('search-results'); if (!box) return;
  box.innerHTML = '';
  (list || S.products || []).forEach((p) => {
    const div = document.createElement('div');
    div.className = 'result-item';
    div.innerHTML = `<div><strong>${p.name}</strong><div style="color:var(--muted);font-size:12px">${p.unit} · precio por unidad: ${fmtUnit(p.pricePerUnit || 0)}</div></div><button class="primary">${t('add')}</button>`;
    div.querySelector('button').addEventListener('click', () => addSelected(p));
    box.appendChild(div);
  });
}

function addSelected(p) {
  const qtyUnit = p.unit === 'kg' ? 'g' : p.unit === 'l' ? 'ml' : p.unit;
  S.selected.push({ id: p.id, name: p.name, unit: p.unit, pricePerUnit: p.pricePerUnit, qty: 0, qtyUnit });
  renderSelected();
  recalcTotals();
}

function renderSelected() {
  const box = document.getElementById('selected-list');
  box.innerHTML = '';
  S.selected.forEach((it, idx) => {
    const div = document.createElement('div');
    div.className = 'selected-item';
    div.innerHTML = `
      <div><strong>${it.name}</strong><div style="color:var(--muted);font-size:12px">Unidad base: ${it.unit} · Precio base: ${fmtUnit(it.pricePerUnit)}</div></div>
      <input type="number" min="0" step="0.01" value="${it.qty}" />
      <select>
        ${['g','kg','ml','l','unidad','h','$'].map(u => `<option ${it.qtyUnit===u?'selected':''} value="${u}">${u}</option>`).join('')}
      </select>
      <button class="danger">${t('delete')}</button>
    `;
    const [qtyInput, unitSel, delBtn] = [div.children[1], div.children[2], div.children[3]];
    qtyInput.addEventListener('input', () => { it.qty = parseFloat(qtyInput.value || '0'); recalcTotals(); });
    unitSel.addEventListener('change', () => { it.qtyUnit = unitSel.value; recalcTotals(); });
    delBtn.addEventListener('click', () => { S.selected.splice(idx, 1); renderSelected(); recalcTotals(); });
    box.appendChild(div);
  });
}

function convertToBaseUnit(qty, fromUnit, baseUnit) {
  if (fromUnit === baseUnit) return qty;
  if (baseUnit === 'kg') { if (fromUnit === 'g') return qty / 1000; if (fromUnit === 'kg') return qty; }
  if (baseUnit === 'l') { if (fromUnit === 'ml') return qty / 1000; if (fromUnit === 'l') return qty; }
  if (baseUnit === 'unidad') { return qty; }
  if (baseUnit === '$') { return qty; }
  return 0;
}

function recalcTotals() {
  let costBase = 0;
  let costSpecial = 0; // unidad $ sin multiplicador
  S.selected.forEach(it => {
    const qtyBase = convertToBaseUnit(it.qty || 0, it.qtyUnit, it.unit);
    const cost = qtyBase * (it.pricePerUnit || 0);
    if (it.unit === '$') costSpecial += cost; else costBase += cost;
  });
  const total = costBase + costSpecial;
  const suggested = (costBase * 3) + costSpecial;
  document.getElementById('total-cost').textContent = fmt(total);
  document.getElementById('final-price').textContent = fmt(suggested);
}

// Add custom product
document.getElementById('form-add-product')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = { name: fd.get('name').trim(), unit: fd.get('unit'), pricePerUnit: parseFloat(fd.get('pricePerUnit')) };
  const id = fd.get('id');
  try {
    if (id) {
      await api('/api/custom-products/' + id, { method: 'PATCH', body: JSON.stringify(payload) });
      document.getElementById('addp-msg').textContent = 'Producto actualizado: ' + payload.name;
    } else {
      const saved = await api('/api/custom-products', { method: 'POST', body: JSON.stringify(payload) });
      document.getElementById('addp-msg').textContent = 'Producto guardado: ' + saved.name;
    }
    await loadProducts();
    await loadCustomProducts();
    e.target.reset();
    document.getElementById('addp-submit').textContent = 'Guardar';
    document.getElementById('addp-cancel').style.display = 'none';
  } catch (err) {
    document.getElementById('addp-msg').textContent = err.message;
  }
});

document.getElementById('addp-cancel')?.addEventListener('click', () => {
  const f = document.getElementById('form-add-product'); f.reset();
  document.getElementsByName('id')[0].value = '';
  document.getElementById('addp-submit').textContent = 'Guardar';
  document.getElementById('addp-cancel').style.display = 'none';
});

async function loadCustomProducts() {
  const list = await api('/api/products');
  const mine = (list || []).filter(p => p.userCustom);
  const box = document.getElementById('custom-list'); if (!box) return;
  box.innerHTML = '';
  mine.forEach(p => {
    const div = document.createElement('div');
    div.className = 'ac-item';
    div.innerHTML = `<div><div>${p.name}</div><div class="meta">${p.unit} · ${fmtUnit(p.pricePerUnit || 0)} por unidad</div></div>
      <div style="display:flex;gap:6px">
        <button class="secondary">Editar</button>
        <button class="danger">${t('delete')}</button>
      </div>`;
    const [btnEdit, btnDel] = div.querySelectorAll('button');
    btnEdit.addEventListener('click', () => {
      const modal = document.getElementById('modal-edit');
      const f = document.getElementById('form-edit-product');
      f.elements.namedItem('id').value = p.id;
      f.elements.namedItem('name').value = p.name;
      f.elements.namedItem('unit').value = p.unit;
      f.elements.namedItem('pricePerUnit').value = p.pricePerUnit;
      modal.classList.remove('hidden');
    });
    btnDel.addEventListener('click', async () => {
      try {
        div.remove();
        try { await api('/api/custom-products/' + p.id, { method: 'DELETE' }); }
        catch (_) { await api('/api/custom-products?id=' + encodeURIComponent(p.id), { method: 'DELETE' }); }
        await loadProducts();
      } catch (err) {
        document.getElementById('addp-msg').textContent = err.message;
        await loadCustomProducts();
      }
    });
    box.appendChild(div);
  });
}

// Edit modal
document.getElementById('editp-cancel')?.addEventListener('click', () => document.getElementById('modal-edit').classList.add('hidden'));
document.getElementById('form-edit-product')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const id = f.elements.namedItem('id').value;
  const payload = { name: f.elements.namedItem('name').value.trim(), unit: f.elements.namedItem('unit').value, pricePerUnit: parseFloat(f.elements.namedItem('pricePerUnit').value) };
  try {
    try { await api('/api/custom-products/' + id, { method: 'PATCH', body: JSON.stringify(payload) }); }
    catch (_) { await api('/api/custom-products?id=' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(payload) }); }
    document.getElementById('modal-edit').classList.add('hidden');
    await loadProducts();
    await loadCustomProducts();
    document.getElementById('addp-msg').textContent = 'Producto actualizado: ' + payload.name;
  } catch (err) {
    document.getElementById('editp-msg').textContent = err.message;
  }
});
document.getElementById('modal-edit')?.addEventListener('click', (e) => { if (e.target.id === 'modal-edit') document.getElementById('modal-edit').classList.add('hidden'); });

// Auto enter if token exists
(async function init() {
  // Set language switch active state
  setLangButtons();
  if (S.token) { try { await enterPortal(); return; } catch (_) {} }
  showView('view-splash');
})();

// Community logic
async function loadPosts() {
  try {
    const list = await api('/api/posts');
    renderPosts(list);
  } catch (err) {
    const box = document.getElementById('posts-list');
    if (box) box.innerHTML = `<li class="hint">${err.message}</li>`;
  }
}

function renderPosts(list) {
  const box = document.getElementById('posts-list');
  if (!box) return;
  box.innerHTML = '';
  (list || []).forEach(p => {
    const li = document.createElement('div');
    li.className = 'post-card';
    li.id = 'post-' + p.id;
    const time = new Date(p.time || Date.now()).toLocaleString();
    const typeLabel = p.type === 'photo' ? 'Foto' : p.type === 'question' ? 'Pregunta' : 'Consejo';
    li.innerHTML = `
      <div class="post-header"><span>${p.author || 'Anónimo'}</span> · <span>${time}</span> · <span>${typeLabel}</span></div>
      ${p.text ? `<div>${escapeHtml(p.text)}</div>` : ''}
      ${p.image ? `<img class="post-image" src="${p.image}" alt="imagen" />` : ''}
      <div class="post-actions">
        <button class="icon btn-like">❤ ${p.likes || 0}</button>
        <button class="icon btn-comment">Comentar</button>
        <button class="icon btn-share">Compartir</button>
      </div>
      <div class="comments"></div>
    `;
    const [btnLike, btnComment, btnShare] = li.querySelectorAll('button');
    btnLike.addEventListener('click', async () => {
      try {
        const res = await api(`/api/posts/${encodeURIComponent(p.id)}/like`, { method: 'POST' });
        btnLike.textContent = `❤ ${res.likes || 0}`;
      } catch (err) { console.error(err); }
    });
    btnComment.addEventListener('click', async () => {
      toggleCommentBox(li, p.id);
    });
    btnShare.addEventListener('click', () => {
      const url = `${location.origin}/#comunidad?post=${encodeURIComponent(p.id)}`;
      navigator.clipboard?.writeText(url).then(() => {
        btnShare.textContent = 'Copiado!';
        setTimeout(() => btnShare.textContent = 'Compartir', 1200);
      }).catch(() => {
        prompt('Copia el enlace:', url);
      });
    });
    box.appendChild(li);
  });
}

function toggleCommentBox(container, postId) {
  const areaId = 'comment-area-' + postId;
  let area = container.querySelector('#' + CSS.escape(areaId));
  if (area) { area.remove(); return; }
  area = document.createElement('div');
  area.id = areaId;
  area.innerHTML = `
    <div style="display:grid; gap:6px; margin-top:6px">
      <textarea rows="2" placeholder="Escribe un comentario" style="resize:vertical; background:#0d1217; border:1px solid var(--border); color:var(--fg); padding:10px 12px; border-radius:8px"></textarea>
      <div style="display:flex; gap:8px">
        <button class="primary">Enviar</button>
        <button class="icon btn-cancel">Cancelar</button>
      </div>
    </div>`;
  const btnSend = area.querySelector('button.primary');
  const btnCancel = area.querySelector('button.btn-cancel');
  btnSend.addEventListener('click', async () => {
    const text = area.querySelector('textarea').value.trim();
    if (!text) return;
    try {
      await api(`/api/posts/${encodeURIComponent(postId)}/comment`, { method: 'POST', body: JSON.stringify({ text }) });
      // Reload posts to refresh counts
      await loadPosts();
    } catch (err) { console.error(err); }
  });
  btnCancel.addEventListener('click', () => area.remove());
  container.appendChild(area);
}

// Post form
document.getElementById('form-post')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const type = f.elements.namedItem('type').value;
  const text = f.elements.namedItem('text').value;
  const file = f.elements.namedItem('image').files[0];
  const msg = document.getElementById('post-msg');
  async function send(image) {
    try {
      const saved = await api('/api/posts', { method: 'POST', body: JSON.stringify({ type, text, image }) });
      msg.textContent = 'Publicado';
      f.reset();
      await loadPosts();
      location.hash = '#comunity?post=' + encodeURIComponent(saved.id);
      maybeScrollToPost(saved.id);
    } catch (err) {
      msg.textContent = err.message;
    }
  }
  if (file) {
    const reader = new FileReader();
    reader.onload = () => send(reader.result);
    reader.onerror = () => send(null);
    reader.readAsDataURL(file);
  } else {
    await send(null);
  }
});

function maybeScrollToPostFromHash() {
  const m = location.hash.match(/post=([^&]+)/);
  if (m) maybeScrollToPost(decodeURIComponent(m[1]));
}
function maybeScrollToPost(id) {
  const el = document.getElementById('post-' + id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
}
