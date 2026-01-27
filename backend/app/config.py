from __future__ import annotations

from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
CACHE_ROOT = ROOT_DIR / "backend" / "conf"
TARGETS_YAML = CACHE_ROOT / "targets.yaml"
ENTERPRISE_MANAGERS_FILE = CACHE_ROOT / "enterprise_manager_urls"
CACHE_DB = ROOT_DIR / "backend" / "data" / "oem_cache.db"
OEM_CLIENT_TTL_SECONDS = 300
