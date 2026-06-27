/**
 * Proxy Pool UI v7 — MutationObserver + dedicated save + SSE real-time proxy display + Dark Mode
 * Auth key read from IndexedDB (localforage), same as React app.
 */
(function() {
  'use strict';

  const LS_KEY = 'chatgpt2api_proxy_pool';
  let injected = false;

  /* ── Theme detection ── */
  function isDarkMode() {
    return document.documentElement.classList.contains('dark');
  }

  /* ── Inject CSS for theme support ── */
  function injectStyles() {
    if (document.getElementById('pp-theme-styles')) return;
    const style = document.createElement('style');
    style.id = 'pp-theme-styles';
    style.textContent = `
      #pp-wrapper {
        margin-top: 8px;
        padding: 12px;
        background: #fafaf9;
        border: 1px solid #e7e5e4;
        border-radius: 12px;
        transition: background 0.3s, border-color 0.3s;
      }
      .dark #pp-wrapper {
        background: #1c1917;
        border-color: #44403c;
      }
      #pp-wrapper label {
        display: block;
        font-size: 13px;
        color: #57534e;
        margin-bottom: 6px;
        font-weight: 500;
        transition: color 0.3s;
      }
      .dark #pp-wrapper label {
        color: #a8a29e;
      }
      #pp-url, #pp-interval {
        width: 100%;
        height: 40px;
        border: 1px solid #d6d3d1;
        border-radius: 12px;
        padding: 0 14px;
        font-size: 13px;
        background: white;
        color: #1c1917;
        box-sizing: border-box;
        outline: none;
        transition: background 0.3s, border-color 0.3s, color 0.3s;
      }
      .dark #pp-url, .dark #pp-interval {
        background: #292524;
        border-color: #57534e;
        color: #e7e5e4;
      }
      #pp-save-btn {
        height: 40px;
        padding: 0 20px;
        border-radius: 12px;
        border: 1px solid #d6d3d1;
        background: white;
        cursor: pointer;
        font-size: 13px;
        color: #44403c;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: all 0.15s;
      }
      #pp-save-btn:hover {
        background: #f5f5f4;
      }
      .dark #pp-save-btn {
        background: #292524;
        border-color: #57534e;
        color: #e7e5e4;
      }
      .dark #pp-save-btn:hover {
        background: #44403c;
      }
      #pp-status {
        margin-top: 8px;
        font-size: 12px;
        color: #a8a29e;
        transition: color 0.3s;
      }
      .dark #pp-status {
        color: #78716c;
      }
      #pp-current {
        margin-top: 6px;
        font-size: 14px;
        color: #57534e;
        font-weight: 600;
        min-height: 22px;
        transition: color 0.3s;
      }
      .dark #pp-current {
        color: #d6d3d1;
      }
      #pp-current code {
        background: #f5f5f4;
        padding: 3px 10px;
        border-radius: 6px;
        font-size: 13px;
        border: 1px solid #e7e5e4;
        color: #292524;
      }
      .dark #pp-current code {
        background: #44403c;
        border-color: #57534e;
        color: #e7e5e4;
      }
    `;
    document.head.appendChild(style);
  }

  /* ── Auth key from IndexedDB (localforage) ── */
  function getAuthToken() {
    return new Promise(resolve => {
      try {
        const req = indexedDB.open('chatgpt2api');
        req.onsuccess = e => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('auth')) return resolve('');
          const tx = db.transaction('auth', 'readonly');
          const store = tx.objectStore('auth');
          const g = store.get('chatgpt2api_auth_key');
          g.onsuccess = () => resolve(String(g.result || ''));
          g.onerror = () => resolve('');
        };
        req.onerror = () => resolve('');
      } catch { resolve(''); }
    });
  }

  function apiBase() { return window.location.origin; }

  function authHeaders(token) {
    return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
  }

  /* ── DOM helpers ── */
  function waitForLabels(timeout) {
    return new Promise(resolve => {
      function find() {
        for (const l of document.querySelectorAll('label')) {
          if (l.textContent && l.textContent.trim().includes('注册代理')) return l;
        }
        return null;
      }
      const found = find();
      if (found) return resolve(found);
      const obs = new MutationObserver(() => {
        const f = find();
        if (f) { obs.disconnect(); resolve(f); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
    });
  }

  /* ── UI injection ── */
  async function init() {
    if (injected) return;
    const label = await waitForLabels(20000);
    if (!label) return;
    injected = true;

    const grid = label.closest('.grid');
    if (!grid) return;

    // Inject theme-aware CSS
    injectStyles();

    const wrapper = document.createElement('div');
    wrapper.id = 'pp-wrapper';
    wrapper.innerHTML = `
      <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;">
        <div style="flex:2;min-width:200px;">
          <label>代理列表URL（每行一个代理，自动拉取轮询）</label>
          <input type="text" id="pp-url" placeholder="留空则使用上方单个代理" />
        </div>
        <div style="flex:0.6;min-width:100px;">
          <label>刷新秒数</label>
          <input type="number" id="pp-interval" value="60" min="10" />
        </div>
        <div style="flex:0;min-width:100px;">
          <button id="pp-save-btn">💾 保存代理配置</button>
        </div>
      </div>
      <div id="pp-status"></div>
      <div id="pp-current"></div>
    `;
    grid.parentNode.insertBefore(wrapper, grid.nextSibling);

    // Load saved values
    loadFromLocalStorage();

    // Get auth token from IndexedDB and load from server
    const token = await getAuthToken();
    if (token) {
      try {
        const res = await fetch(apiBase() + '/api/register', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        if (data && data.register) {
          const cfg = data.register;
          setFields(cfg.proxy_url || '', cfg.proxy_refresh_interval || 60);
          updateStatus(cfg.proxy_url || '');
          saveToLocalStorage(cfg.proxy_url || '', cfg.proxy_refresh_interval || 60);
        }
      } catch {}
    }

    // Save button
    document.getElementById('pp-save-btn').addEventListener('click', () => saveOurConfig(token));
    ['pp-url', 'pp-interval'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', e => {
        if (e.key === 'Enter') saveOurConfig(token);
      });
    });

    // Start SSE for real-time proxy display
    startSSE(token);
  }

  /* ── SSE real-time display ── */
  function startSSE(token) {
    const el = document.getElementById('pp-current');
    if (!el || !token) return;

    const url = apiBase() + '/api/register/events?token=' + encodeURIComponent(token);
    const es = new EventSource(url);
    let lastProxy = '';

    es.onmessage = e => {
      try {
        const data = JSON.parse(e.data);
        const stats = data.stats || {};
        const proxy = stats.current_proxy || '';
        const enabled = data.enabled || false;
        const running = stats.running || 0;

        if (enabled && proxy) {
          if (proxy !== lastProxy) {
            lastProxy = proxy;
            el.innerHTML = '🎯 当前代理：<code>' + proxy + '</code>';
          }
        } else if (enabled) {
          el.innerHTML = '<span style="color:inherit;opacity:0.6;">⏳ 注册运行中，等待分配代理...</span>';
          lastProxy = '';
        } else {
          if (el.textContent) el.textContent = '';
          lastProxy = '';
        }
      } catch {}
    };

    es.onerror = () => {
      // SSE will auto-reconnect
    };
  }

  /* ── Save ── */
  async function saveOurConfig(token) {
    const urlInput = document.getElementById('pp-url');
    const intervalInput = document.getElementById('pp-interval');
    const url = urlInput ? urlInput.value.trim() : '';
    const interval = intervalInput ? parseInt(intervalInput.value) || 60 : 60;
    const btn = document.getElementById('pp-save-btn');

    if (!token) token = await getAuthToken();
    if (!token) { alert('未登录，请先登录后再保存'); return; }

    if (btn) { btn.textContent = '⏳ 保存中...'; btn.disabled = true; }

    saveToLocalStorage(url, interval);

    // Read current config from server
    let cfg = {};
    try {
      const res = await fetch(apiBase() + '/api/register', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json();
      cfg = (data && data.register) || {};
    } catch {}

    // Build full body
    const body = {
      mail: cfg.mail || {},
      proxy: cfg.proxy || '',
      total: cfg.total || 10,
      threads: cfg.threads || 2,
      mode: cfg.mode || 'total',
      target_quota: cfg.target_quota || 100,
      target_available: cfg.target_available || 10,
      check_interval: cfg.check_interval || 5,
      proxy_url: url,
      proxy_refresh_interval: interval
    };

    try {
      const res = await fetch(apiBase() + '/api/register', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(body)
      });
      const result = await res.json();
      if (result && result.register) {
        updateStatus(result.register.proxy_url || url);
        setFields(url, result.register.proxy_refresh_interval || interval);
      } else {
        updateStatus(url);
      }
    } catch {
      updateStatus(url);
    }

    if (btn) { btn.textContent = '💾 保存代理配置'; btn.disabled = false; }
  }

  /* ── Helpers ── */
  function loadFromLocalStorage() {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      setFields(saved.proxy_url || '', saved.proxy_refresh_interval || 60);
      updateStatus(saved.proxy_url || '');
    } catch {}
  }

  function saveToLocalStorage(url, interval) {
    localStorage.setItem(LS_KEY, JSON.stringify({ proxy_url: url, proxy_refresh_interval: interval }));
  }

  function setFields(url, interval) {
    const u = document.getElementById('pp-url');
    const i = document.getElementById('pp-interval');
    if (u) u.value = url;
    if (i) i.value = interval;
  }

  function updateStatus(url) {
    const el = document.getElementById('pp-status');
    if (!el) return;
    if (url) {
      el.innerHTML = '<span style="color:#16a34a;font-weight:500;">✓ URL模式</span> — ' +
        url.substring(0, 80) + (url.length > 80 ? '...' : '');
    } else {
      el.innerHTML = '<span style="opacity:0.6;">单代理模式</span>';
    }
  }

  /* ── Boot ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
  } else {
    setTimeout(init, 500);
  }
})();
