from __future__ import annotations

from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
CACHE_ROOT = BACKEND_DIR / "conf"
TARGETS_YAML = CACHE_ROOT / "targets.yaml"
ENTERPRISE_MANAGERS_FILE = CACHE_ROOT / "enterprise_manager_urls"
CACHE_DB = BACKEND_DIR / "data" / "oem_cache.db"
OEM_CLIENT_TTL_SECONDS = 300
