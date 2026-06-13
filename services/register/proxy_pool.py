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
