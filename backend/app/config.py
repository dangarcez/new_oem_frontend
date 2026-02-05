from __future__ import annotations

import os
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
CACHE_ROOT = BACKEND_DIR / "conf"
TARGETS_YAML = CACHE_ROOT / "targets.yaml"
ENTERPRISE_MANAGERS_FILE = CACHE_ROOT / "enterprise_manager_urls"
METRICS_YAML = CACHE_ROOT / "metrics.yaml"
CACHE_DB = BACKEND_DIR / "data" / "oem_cache.db"
OEM_CLIENT_TTL_SECONDS = 300
BACKEND_RATE_LIMIT_MAX = int(os.getenv("BACKEND_RATE_LIMIT_MAX", "60"))
BACKEND_RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("BACKEND_RATE_LIMIT_WINDOW_SECONDS", "60"))
