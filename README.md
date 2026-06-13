# chatgpt2api-proxy-pool

基于 [basketikun/chatgpt2api](https://github.com/basketikun/chatgpt2api) 的增强版本，增加了**代理URL轮询注册**功能。

## ✨ 新增功能

- 📋 注册页面新增「代理列表URL」输入框
- 🔄 从远程 txt 文件自动拉取代理列表
- ⏱️ 可配置自动刷新间隔（秒）
- 🎯 每次注册自动轮询使用不同代理
- 📊 页面实时显示当前正在使用的代理 IP
- 💾 代理配置独立保存，刷新页面不丢失

## 🚀 快速部署

### Docker 方式（推荐）

```bash
# 1. 拉取镜像
docker pull ghcr.io/strongshuai/chatgpt2api-proxy-pool:latest

# 2. 启动容器
docker run -d \
  --name chatgpt2api \
  -p 13000:80 \
  -v /opt/chatgpt2api/data:/app/data \
  ghcr.io/strongshuai/chatgpt2api-proxy-pool:latest

# 3. 访问 http://你的IP:13000 完成初始配置
```

### Docker Compose 方式

```yaml
version: "3.8"
services:
  chatgpt2api:
    image: ghcr.io/strongshuai/chatgpt2api-proxy-pool:latest
    container_name: chatgpt2api
    ports:
      - "13000:80"
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

```bash
docker-compose up -d
```

## 📝 代理 txt 文件格式

每行一个代理，支持以下格式：

```
socks5://ip:port
socks5://user:pass@ip:port
http://ip:port
http://user:pass@ip:port
```

支持的注释（以 `#` 或 `//` 开头的行会被忽略）：

```
# 这是注释
// 这也是注释
socks5://1.2.3.4:1080
```

## 🔧 手动修改指南（基于原版）

如果你想在原版 [basketikun/chatgpt2api](https://github.com/basketikun/chatgpt2api) 的基础上手动添加此功能，请参考以下步骤。

### 修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `services/register/proxy_pool.py` | 新建 | 代理池核心类 |
| `services/register/openai_register.py` | 修改 | worker 中调用代理池 |
| `services/register_service.py` | 修改 | 服务层增加新字段 |
| `api/register.py` | 修改 | API 接受新字段 |
| `web/public/proxy_pool_ui.js` | 新建 | 前端注入脚本 |
| `web/src/app/register/page.tsx` | 修改 | 加载前端脚本 |

---

### 步骤 1：创建 `services/register/proxy_pool.py`

```python
from __future__ import annotations

import threading
import time
from typing import Any

from curl_cffi import requests as _requests


class ProxyPool:
    """Proxy pool with URL fetch + rotation."""

    def __init__(self):
        self._proxies: list[str] = []
        self._index = 0
        self._lock = threading.Lock()
        self._proxy_url: str = ""
        self._refresh_interval: int = 60
        self._last_fetch: float = 0
        self._running = False
        self._thread: threading.Thread | None = None

    @property
    def is_url_mode(self) -> bool:
        return bool(self._proxy_url)

    @property
    def count(self) -> int:
        with self._lock:
            return len(self._proxies)

    def set_from_text(self, text: str) -> None:
        lines = [l.strip() for l in text.replace(",", "\n").splitlines() if l.strip()]
        proxies = [l for l in lines if not l.startswith("#") and not l.startswith("//")]
        with self._lock:
            self._proxies = proxies
            self._index = 0

    def set_url(self, url: str, interval: int = 60) -> None:
        self._proxy_url = url.strip()
        self._refresh_interval = max(10, interval)
        if self._proxy_url:
            self._fetch()
            self._start_refresh()
        else:
            self._stop_refresh()

    def next_proxy(self) -> str:
        with self._lock:
            if not self._proxies:
                return ""
            proxy = self._proxies[self._index % len(self._proxies)]
            self._index += 1
            return proxy

    def _fetch(self) -> None:
        if not self._proxy_url:
            return
        try:
            resp = _requests.get(self._proxy_url, timeout=15, verify=False)
            resp.raise_for_status()
            text = resp.text.strip()
            lines = [l.strip() for l in text.splitlines() if l.strip()]
            proxies = [l for l in lines if not l.startswith("#") and not l.startswith("//")]
            with self._lock:
                self._proxies = proxies
                self._last_fetch = time.time()
            print(f"[ProxyPool] Fetched {len(proxies)} proxies from {self._proxy_url[:50]}")
        except Exception as e:
            print(f"[ProxyPool] Fetch failed: {e}")

    def _start_refresh(self) -> None:
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._refresh_loop, daemon=True, name="proxy-pool")
        self._thread.start()

    def _stop_refresh(self) -> None:
        self._running = False

    def _refresh_loop(self) -> None:
        while self._running:
            time.sleep(self._refresh_interval)
            if self._running and self._proxy_url:
                self._fetch()

    def get_info(self) -> dict:
        with self._lock:
            return {
                "count": len(self._proxies),
                "url": self._proxy_url,
                "refresh_interval": self._refresh_interval,
                "last_fetch": self._last_fetch,
            }


def init_from_config(proxy_value: str, proxy_url: str = "", refresh_interval: int = 60) -> ProxyPool:
    pool = ProxyPool()
    if proxy_url.strip():
        pool.set_url(proxy_url, refresh_interval)
    elif proxy_value.strip():
        lines = [l.strip() for l in proxy_value.replace(",", "\n").splitlines() if l.strip()]
        if len(lines) > 1:
            pool.set_from_text(proxy_value)
    return pool
```

---

### 步骤 2：修改 `services/register/openai_register.py`

**2a.** 在文件顶部 import 区域添加：

```python
from services.register.proxy_pool import ProxyPool, init_from_config
```

**2b.** 在模块级别变量区域添加：

```python
proxy_pool = ProxyPool()
```

**2c.** 添加 `init_proxy_pool` 函数：

```python
def init_proxy_pool(proxy: str, proxy_url: str = "", refresh_interval: int = 60):
    global proxy_pool
    if proxy_url.strip():
        if proxy_pool.is_url_mode and proxy_pool.count > 0:
            proxy_pool.set_url(proxy_url, refresh_interval)
        else:
            proxy_pool = init_from_config(proxy, proxy_url, refresh_interval)
    else:
        pool = init_from_config(proxy, "", refresh_interval)
        if pool.count > 0:
            proxy_pool = pool
        elif not proxy_pool.is_url_mode:
            proxy_pool = pool
```

**2d.** 修改 `worker` 函数，将获取代理的逻辑改为：

```python
def worker(index: int) -> dict:
    start = time.time()
    proxy = proxy_pool.next_proxy()
    if not proxy:
        raw = config.get("proxy", "").strip()
        if raw and "\n" not in raw and "\r" not in raw:
            proxy = raw
    if not proxy:
        step(index, "No proxy available, skipping", "yellow")
        return {"ok": False, "index": index, "error": "no_proxy"}
    with stats_lock:
        stats["current_proxy"] = proxy
    # ... 其余代码不变
```

---

### 步骤 3：修改 `services/register_service.py`

**3a.** 修改 `_default_config()` 函数，添加字段：

```python
def _default_config() -> dict:
    return {
        **openai_register.config,
        "mode": "total",
        "target_quota": 100,
        "target_available": 10,
        "check_interval": 5,
        "enabled": False,
        "proxy_url": "",              # ← 新增
        "proxy_refresh_interval": 60, # ← 新增
        "stats": { ... }
    }
```

**3b.** 修改 `_normalize()` 函数，添加校验：

```python
cfg["proxy_url"] = str(cfg.get("proxy_url") or "").strip()
cfg["proxy_refresh_interval"] = max(10, int(cfg.get("proxy_refresh_interval") or 60))
```

**3c.** 在 RegisterService 类中添加方法：

```python
def _init_proxy_pool(self) -> None:
    proxy = str(self._config.get("proxy") or "").strip()
    proxy_url = str(self._config.get("proxy_url") or "").strip()
    refresh = int(self._config.get("proxy_refresh_interval") or 60)
    openai_register.init_proxy_pool(proxy, proxy_url, refresh)
```

**3d.** 在 `__init__`、`update`、`start` 方法中调用：

```python
self._init_proxy_pool()
```

**3e.** 修改 `get()` 方法，合并运行时的 current_proxy：

```python
def get(self) -> dict:
    with self._lock:
        data = {**self._config, "logs": self._logs[-300:]}
        try:
            running_stats = openai_register.stats
            if running_stats.get("current_proxy"):
                data["stats"]["current_proxy"] = running_stats["current_proxy"]
        except Exception:
            pass
        return json.loads(json.dumps(data, ensure_ascii=False))
```

---

### 步骤 4：修改 `api/register.py`

在 `RegisterConfigRequest` 类中添加：

```python
class RegisterConfigRequest(BaseModel):
    mail: dict | None = None
    proxy: str | None = None
    proxy_url: str | None = None              # ← 新增
    proxy_refresh_interval: int | None = None  # ← 新增
    total: int | None = None
    threads: int | None = None
    mode: str | None = None
    target_quota: int | None = None
    target_available: int | None = None
    check_interval: int | None = None
```

---

### 步骤 5：创建 `web/public/proxy_pool_ui.js`

```javascript
/**
 * Proxy Pool UI v6 — MutationObserver + dedicated save + SSE real-time proxy display
 */
(function() {
  'use strict';

  const LS_KEY = 'chatgpt2api_proxy_pool';
  let injected = false;

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

  async function init() {
    if (injected) return;
    const label = await waitForLabels(20000);
    if (!label) return;
    injected = true;

    const grid = label.closest('.grid');
    if (!grid) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'pp-wrapper';
    wrapper.style.cssText = 'margin-top:8px;padding:12px;background:#fafaf9;border:1px solid #e7e5e4;border-radius:12px;';
    wrapper.innerHTML = `
      <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;">
        <div style="flex:2;min-width:200px;">
          <label style="display:block;font-size:13px;color:#57534e;margin-bottom:6px;font-weight:500;">
            代理列表URL（每行一个代理，自动拉取轮询）
          </label>
          <input type="text" id="pp-url" placeholder="留空则使用上方单个代理"
            style="width:100%;height:40px;border:1px solid #d6d3d1;border-radius:12px;padding:0 14px;font-size:13px;background:white;box-sizing:border-box;outline:none;" />
        </div>
        <div style="flex:0.6;min-width:100px;">
          <label style="display:block;font-size:13px;color:#57534e;margin-bottom:6px;font-weight:500;">
            刷新秒数
          </label>
          <input type="number" id="pp-interval" value="60" min="10"
            style="width:100%;height:40px;border:1px solid #d6d3d1;border-radius:12px;padding:0 14px;font-size:13px;background:white;box-sizing:border-box;outline:none;" />
        </div>
        <div style="flex:0;min-width:100px;">
          <button id="pp-save-btn"
            style="height:40px;padding:0 20px;border-radius:12px;border:1px solid #d6d3d1;background:white;cursor:pointer;font-size:13px;color:#44403c;display:flex;align-items:center;gap:6px;transition:all 0.15s;"
            onmouseover="this.style.background='#f5f5f4'"
            onmouseout="this.style.background='white'">
            💾 保存代理配置
          </button>
        </div>
      </div>
      <div id="pp-status" style="margin-top:8px;font-size:12px;color:#a8a29e;"></div>
      <div id="pp-current" style="margin-top:6px;font-size:14px;color:#57534e;font-weight:600;min-height:22px;"></div>
    `;
    grid.parentNode.insertBefore(wrapper, grid.nextSibling);

    loadFromLocalStorage();

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

    document.getElementById('pp-save-btn').addEventListener('click', () => saveOurConfig(token));
    ['pp-url', 'pp-interval'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', e => {
        if (e.key === 'Enter') saveOurConfig(token);
      });
    });

    startSSE(token);
  }

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
        if (enabled && proxy) {
          if (proxy !== lastProxy) {
            lastProxy = proxy;
            el.innerHTML = '🎯 当前代理：<code style="background:#f5f5f4;padding:3px 10px;border-radius:6px;font-size:13px;border:1px solid #e7e5e4;color:#292524;">' + proxy + '</code>';
          }
        } else if (enabled) {
          el.innerHTML = '<span style="color:#a8a29e;">⏳ 注册运行中，等待分配代理...</span>';
          lastProxy = '';
        } else {
          if (el.textContent) el.textContent = '';
          lastProxy = '';
        }
      } catch {}
    };
  }

  async function saveOurConfig(token) {
    const urlInput = document.getElementById('pp-url');
    const intervalInput = document.getElementById('pp-interval');
    const url = urlInput ? urlInput.value.trim() : '';
    const interval = intervalInput ? parseInt(intervalInput.value) || 60 : 60;
    const btn = document.getElementById('pp-save-btn');
    if (!token) token = await getAuthToken();
    if (!token) { alert('未登录'); return; }
    if (btn) { btn.textContent = '⏳ 保存中...'; btn.disabled = true; }
    saveToLocalStorage(url, interval);
    let cfg = {};
    try {
      const res = await fetch(apiBase() + '/api/register', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json();
      cfg = (data && data.register) || {};
    } catch {}
    const body = {
      mail: cfg.mail || {}, proxy: cfg.proxy || '',
      total: cfg.total || 10, threads: cfg.threads || 2,
      mode: cfg.mode || 'total', target_quota: cfg.target_quota || 100,
      target_available: cfg.target_available || 10, check_interval: cfg.check_interval || 5,
      proxy_url: url, proxy_refresh_interval: interval
    };
    try {
      const res = await fetch(apiBase() + '/api/register', {
        method: 'POST', headers: authHeaders(token), body: JSON.stringify(body)
      });
      const result = await res.json();
      if (result && result.register) {
        updateStatus(result.register.proxy_url || url);
        setFields(url, result.register.proxy_refresh_interval || interval);
      } else { updateStatus(url); }
    } catch { updateStatus(url); }
    if (btn) { btn.textContent = '💾 保存代理配置'; btn.disabled = false; }
  }

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
      el.innerHTML = '<span style="color:#78716c;">单代理模式</span>';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
  } else {
    setTimeout(init, 500);
  }
})();
```

---

### 步骤 6：修改 `web/src/app/register/page.tsx`

在文件顶部添加 import：

```typescript
import Script from "next/script";
```

在 `RegisterPageContent` 函数的 return 中添加：

```tsx
function RegisterPageContent() {
  return (
    <>
      <RegisterDataController />
      <Script src="/proxy_pool_ui.js" strategy="afterInteractive" />
      {/* 其余代码不变 */}
    </>
  );
}
```

---

## ❓ 常见问题

**Q: 修改后容器重启会丢失改动吗？**
A: 会。镜像内的文件在容器重建后会恢复。建议 fork 此仓库后自己构建镜像。

**Q: 代理 txt 文件需要什么格式？**
A: 纯文本，每行一个代理，格式为 `协议://[用户名:密码@]IP:端口`。

**Q: 刷新秒数设多少合适？**
A: 建议 60-300 秒。太频繁会给代理源服务器造成压力，太久可能用到已失效的代理。

**Q: 为什么注册页面没有显示代理URL输入框？**
A: 检查 `proxy_pool_ui.js` 是否在 `web/public/` 目录，以及 `register/page.tsx` 是否引入了 Script 组件。

## 📄 License

MIT License - 基于 [basketikun/chatgpt2api](https://github.com/basketikun/chatgpt2api) 修改
