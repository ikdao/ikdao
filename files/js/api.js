// Ikdao API JS script
// ZERO ONE Self License - 01SL
// Hemang Tewari

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { Accept: 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return await res.json();
}

// ---- Mapping utils ----
function mapSingle(data, prefix) {
  if (!data) return null;
  return Object.fromEntries(
    Object.entries(data)
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, v]) => [k.slice(prefix.length), v])
  );
}

function mapList(list, prefix) {
  if (!Array.isArray(list)) return [];
  return list.map(item => mapSingle(item, prefix));
}

// ---- Core API layer ----
export const api = {
  me: {
    async get() {
      const res = await fetchJson('https://ikdao.org/rest/i/me');
      return res?.data || {};
    },
    async patch(updates) {
      const res = await fetchJson('https://ikdao.org/rest/i/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      return res?.data || {};
    },
  },

  it: {
    async get(id) {
      const res = await fetchJson(`https://ikdao.org/rest/i/it?id=${encodeURIComponent(id)}`);
      return mapSingle(res, 'it.') || res;
    },
    async list(ids) {
      if (!Array.isArray(ids)) ids = String(ids).split(',').filter(Boolean);
      const query = ids.join(',');
      const res = await fetchJson(`https://ikdao.org/rest/i/its?id=${encodeURIComponent(query)}`);
      return mapList(res, 'its.');
    },
  },

  u: {
    async get(id) {
      const res = await fetchJson(`https://ikdao.org/rest/i/u?id=${encodeURIComponent(id)}`);
      return mapSingle(res, 'u.') || res;
    },
    async list(ids) {
      if (!Array.isArray(ids)) ids = String(ids).split(',').filter(Boolean);
      const query = ids.join(',');
      const res = await fetchJson(`https://ikdao.org/rest/i/us?id=${encodeURIComponent(query)}`);
      return mapList(res, 'us.');
    },
  },
};

// ---- Extend for itx and we if available ----
if (!api.itx) {
  api.itx = {
    async list(query) {
      const res = await fetchJson(`https://ikdao.org/rest/i/itx?q=${encodeURIComponent(query)}`);
      return res?.data || [];
    },
  };
}

if (!api.we) {
  api.we = {
    async list(query) {
      const res = await fetchJson(`https://ikdao.org/rest/i/we?q=${encodeURIComponent(query)}`);
      return res?.data || [];
    },
  };
}


// Reactive store & DOM sync


// ---- Reactive store with HYP fallback ----
export const me = window.HYP?.a({}) || (() => {
  let state = {};
  const subs = [];
  return {
    get: () => state,
    set: v => { state = v; subs.forEach(fn => fn(state)); },
    subscribe: fn => subs.push(fn),
  };
})();

// ---- Helpers ----

function parseValues(val) {
  if (!val) return [];
  return String(val)
    .split(/[-,]/)
    .map(s => s.trim())
    .filter(s => s !== '');
}

function setElValue(el, val) {
  const prefix = el.dataset.prefix || '';
  const finalVal = val ? prefix + val : '';

  if (el.dataset.attr) {
    // Set specified attributes
    el.dataset.attr.split(',').forEach(attr => {
      const attrName = attr.trim();
      if (attrName) el.setAttribute(attrName, finalVal);
    });

    const isDisplayAttr = ['href', 'src'].some(a => 
      el.dataset.attr.split(',').map(s => s.trim()).includes(a)
    );
    
    const isEmptyText = el.textContent.trim() === '';
    const hasNoChildren = el.children.length === 0;
    const canHaveText = !['IMG', 'INPUT', 'TEXTAREA', 'SELECT', 'BR', 'HR', 'META', 'LINK'].includes(el.tagName);

    if (isDisplayAttr && isEmptyText && hasNoChildren && canHaveText) {
      el.textContent = val ?? '';
    }

    return;
  }

  // Handle form controls
  if (el.type === 'checkbox') {
    el.checked = !!val && val !== '0' && val !== 'false';
  } else if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
    el.value = val ?? '';
  } else {
    // Plain text/content elements
    el.textContent = val ?? '';
  }
}

const cache = { it: new Map(), its: new Map(), u: new Map(), us: new Map() };

// ---- Fetch related values (by source) ----
async function fetchRelatedValue(source, idString) {
  if (!idString) return '';
  const ids = parseValues(idString);
  if (!ids.length) return '';

  try {
    switch (source) {
      case 'it': {
        if (cache.it.has(ids[0])) return cache.it.get(ids[0]);
        const it = await api.it.get(ids[0]);
        const name = it?.name || ids[0];
        cache.it.set(ids[0], name);
        return name;
      }
      case 'its': {
        const missing = ids.filter(id => !cache.its.has(id));
        if (missing.length) {
          const fetched = await api.it.list(missing);
          fetched.forEach((item, i) => cache.its.set(missing[i], item?.name || missing[i]));
        }
        return ids.map(id => cache.its.get(id)).filter(Boolean).join(', ');
      }
      case 'u': {
        if (cache.u.has(ids[0])) return cache.u.get(ids[0]);
        const u = await api.u.get(ids[0]);
        const name = u?.fullname || u?.username || ids[0];
        cache.u.set(ids[0], name);
        return name;
      }
      case 'us': {
        const missing = ids.filter(id => !cache.us.has(id));
        if (missing.length) {
          const fetched = await api.u.list(missing);
          fetched.forEach((user, i) => cache.us.set(missing[i], user?.fullname || user?.username || missing[i]));
        }
        return ids.map(id => cache.us.get(id)).filter(Boolean).join(', ');
      }
      default:
        return idString;
    }
  } catch (err) {
    console.error(`Failed to fetch ${source} for ids:`, ids, err);
    return idString;
  }
}

// ---- Refresh all data-self elements ----
async function refreshDomValues(container) {
  const profile = me.get();
  const cache = window.__entityCache || (window.__entityCache = new Map());

  // 🔹 STEP 1: Resolve [data-supply] elements (it/its/u/us)
  const supplyElements = Array.from(container.querySelectorAll('[data-supply]'));
  await Promise.all(supplyElements.map(async el => {
    const key = el.dataset.self;
    const supply = el.dataset.supply;
    if (!key || !supply || !(key in profile)) return;

    const rawValue = profile[key];
    if (!rawValue) {
      setElValue(el, '');
      return;
    }

    const [group, field, indexStr] = supply.split('.');
    if (!['it', 'its', 'u', 'us'].includes(group) || !field) return;

    const isMulti = group === 'its' || group === 'us';
    const ids = isMulti ? parseValues(rawValue) : [rawValue];
    const index = indexStr != null ? parseInt(indexStr, 10) : null;

    if (isMulti && index != null && (index < 0 || index >= ids.length)) {
      setElValue(el, '');
      return;
    }

    const cacheKey = isMulti ? `${group}:${ids.join('-')}` : `${group}:${ids[0]}`;
    let items = cache.get(cacheKey);

    if (!items) {
      try {
        let res;
        if (isMulti) {
          const query = ids.join(',');
          const endpoint = group === 'its' ? 'its' : 'us';
          res = await fetchJson(`https://ikdao.org/rest/i/${endpoint}?id=${encodeURIComponent(query)}`);
          items = Array.isArray(res.data) ? res.data : [];
        } else {
          const endpoint = group === 'it' ? 'it' : 'u';
          res = await fetchJson(`https://ikdao.org/rest/i/${endpoint}?id=${encodeURIComponent(ids[0])}`);
          items = res.data ? [res.data] : [];
        }
        cache.set(cacheKey, items);
      } catch (err) {
        console.error(`Fetch failed for ${cacheKey}:`, err);
        setElValue(el, '–');
        return;
      }
    }

    let value = '';
    if (isMulti) {
      if (index != null) {
        value = items[index]?.[field] ?? '';
      } else {
        value = items.map(item => item?.[field] ?? '').filter(Boolean).join(', ');
      }
    } else {
      value = items[0]?.[field] ?? '';
    }

    setElValue(el, value);
  }));

  // 🔹 STEP 2: Handle legacy [data-source] elements (backward compatible)
  const legacyElements = Array.from(container.querySelectorAll('[data-self]:not([data-supply])'));
  await Promise.all(legacyElements.map(async el => {
    const key = el.dataset.self;
    if (!(key in profile)) return;

    const val = profile[key];
    const source = el.dataset.source;

    // Skip interactive controls
    if (
      el.hasAttribute('syncs') ||
      (el.hasAttribute('sync') && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
    ) {
      return;
    }

    if (source) {
      setElValue(el, 'Loading...');
      const resolved = await fetchRelatedValue(source, val);
      setElValue(el, resolved);
    } else {
      setElValue(el, val);
    }
  }));

  updateSyncsUI();
}
// ---- Sync UI updates ----
function updateSyncsUI() {
  document.querySelectorAll('[syncs]').forEach(el => {
    const key = el.getAttribute('name') || el.dataset.self;
    const value = String(el.dataset.value).trim();
    const arr = parseValues(me.get()[key]);
    el.classList.toggle('active', arr.includes(value));
  });
}

// ---- Handle individual sync input ----
async function handleSyncInput(el) {
  const key = el.getAttribute('name') || el.dataset.self;
  if (!key) return;
  const val = el.type === 'checkbox' ? (el.checked ? 1 : 0) : (el.value || null);

  el.classList.remove('synced', 'error');
  el.classList.add('syncing');

  try {
    const updated = await api.me.patch({ [key]: val });
    me.set(updated);
    el.classList.remove('syncing');
    el.classList.add('synced');
    setTimeout(() => el.classList.remove('synced'), 1000);
    await refreshDomValues(document);
  } catch (err) {
    el.classList.remove('syncing');
    el.classList.add('error');
    console.error('Sync failed:', err);
  }
}

// ---- Handle multi-value syncs ----
async function handleSyncsClick(el) {
  const key = el.getAttribute('name') || el.dataset.self;
  const value = el.dataset.value?.trim();
  if (!key || !value) return;

  const store = me.get();
  const currentRaw = store[key] ?? '';
  let arr = parseValues(currentRaw);

  const valueStr = String(value).trim();
  const isAlreadySelected = arr.includes(valueStr);

  // Toggle value
  const newArr = isAlreadySelected
    ? arr.filter(v => v !== valueStr)
    : [...arr, valueStr];

  const nextValue = newArr.length > 0 ? newArr.join('-') : null;

  const optimisticState = { ...store, [key]: nextValue };
  me.set(optimisticState);

  updateSyncsUI();

  // Visual feedback on clicked button
  el.classList.add('syncing');

  try {
    const serverResponse = await api.me.patch({ [key]: nextValue });

    // ➕ MERGE server response (don’t replace whole state!)
    me.set({ ...me.get(), ...serverResponse });

    el.classList.remove('syncing');
    el.classList.add('synced');
    setTimeout(() => el.classList.remove('synced'), 1000);

  } catch (err) {
    // ➕ REVERT on error
    me.set(store); // restore previous full state
    updateSyncsUI(); // revert UI immediately
    el.classList.remove('syncing');
    el.classList.add('error');
    setTimeout(() => el.classList.remove('error'), 2000);
    console.error('Sync failed:', err);
  }
}
export async function initSync() {
  try {
    const profile = await api.me.get();
    me.set(profile);
    await refreshDomValues(document);
  } catch (err) {
    console.error('Error loading profile:', err);
  }

  // Core sync logic
  document.addEventListener('click', e => {
    if (e.target?.hasAttribute('syncs')) handleSyncsClick(e.target);
  });

  document.addEventListener('change', e => {
    if (e.target?.hasAttribute('sync')) handleSyncInput(e.target);
  });

  me.subscribe(async () => {
    await refreshDomValues(document);
  });

}

