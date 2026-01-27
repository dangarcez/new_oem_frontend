from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Any

from .config import OEM_CLIENT_TTL_SECONDS
from .oem_client import OEMClient


@dataclass
class _ClientEntry:
    client: OEMClient
    last_used: float


_lock = threading.Lock()
_clients: dict[tuple[str, str, str, bool], _ClientEntry] = {}


def _client_key(manager: dict[str, Any]) -> tuple[str, str, str, bool]:
    return (
        manager.get("endpoint"),
        manager.get("user"),
        manager.get("password"),
        bool(manager.get("verify_ssl", False)),
    )


def _cleanup_locked(now: float) -> None:
    expired_keys = [key for key, entry in _clients.items() if now - entry.last_used > OEM_CLIENT_TTL_SECONDS]
    for key in expired_keys:
        entry = _clients.pop(key, None)
        if entry:
            entry.client.close()


def get_client(manager: dict[str, Any]) -> OEMClient:
    now = time.monotonic()
    key = _client_key(manager)
    with _lock:
        _cleanup_locked(now)
        entry = _clients.get(key)
        if entry:
            entry.last_used = now
            return entry.client

        client = OEMClient(
            endpoint=manager.get("endpoint"),
            user=manager.get("user"),
            password=manager.get("password"),
            verify_ssl=bool(manager.get("verify_ssl", False)),
        )
        _clients[key] = _ClientEntry(client=client, last_used=now)
        return client


def close_all_clients() -> None:
    with _lock:
        for entry in _clients.values():
            entry.client.close()
        _clients.clear()
