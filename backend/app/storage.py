from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from .config import ENTERPRISE_MANAGERS_FILE, METRICS_YAML, TARGETS_YAML
from .utils import ensure_required_tags


def _read_yaml(path: Path) -> Any:
    if not path.exists():
        return []
    content = path.read_text(encoding="utf-8").strip()
    if not content:
        return []
    data = yaml.safe_load(content)
    return data if data is not None else []


def _write_yaml(path: Path, data: Any) -> None:
    path.write_text(
        yaml.safe_dump(data, sort_keys=False, allow_unicode=False),
        encoding="utf-8",
    )


def load_enterprise_managers() -> list[dict[str, Any]]:
    data = _read_yaml(ENTERPRISE_MANAGERS_FILE)
    if not data:
        return []
    if isinstance(data, dict):
        return [data]
    if not isinstance(data, list):
        return []
    return data


def get_enterprise_manager(name: str) -> dict[str, Any] | None:
    for item in load_enterprise_managers():
        if item.get("name") == name:
            return item
    return None


def load_targets_config() -> list[dict[str, Any]]:
    data = _read_yaml(TARGETS_YAML)
    if not data:
        return []
    if isinstance(data, dict):
        return [data]
    if not isinstance(data, list):
        return []
    return data


def get_site_config(endpoint_name: str) -> dict[str, Any] | None:
    for site in load_targets_config():
        if site.get("name") == endpoint_name:
            return site
    return None


def upsert_site_config(endpoint_name: str, targets: list[dict[str, Any]]) -> dict[str, Any]:
    sites = load_targets_config()
    manager = get_enterprise_manager(endpoint_name) or {}
    site_entry = None
    for site in sites:
        if site.get("name") == endpoint_name:
            site_entry = site
            break

    normalized_targets: list[dict[str, Any]] = []
    for target in targets:
        item = {
            "id": target.get("id"),
            "name": target.get("name"),
            "typeName": target.get("typeName"),
        }
        for extra_key in ("dg_role", "listener_name", "machine_name"):
            if target.get(extra_key) is not None:
                item[extra_key] = target.get(extra_key)
        item["tags"] = dict(target.get("tags") or {})
        ensure_required_tags(item)
        normalized_targets.append(item)

    if site_entry is None:
        site_entry = {
            "site": manager.get("site"),
            "endpoint": manager.get("endpoint"),
            "name": endpoint_name,
            "targets": normalized_targets,
        }
        sites.append(site_entry)
    else:
        site_entry["site"] = manager.get("site", site_entry.get("site"))
        site_entry["endpoint"] = manager.get("endpoint", site_entry.get("endpoint"))
        site_entry["name"] = endpoint_name
        site_entry["targets"] = normalized_targets

    _write_yaml(TARGETS_YAML, sites)
    return site_entry


def save_sites_config(sites: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized_sites: list[dict[str, Any]] = []
    for site in sites:
        normalized_targets: list[dict[str, Any]] = []
        for target in site.get("targets") or []:
            item = {
                "id": target.get("id"),
                "name": target.get("name"),
                "typeName": target.get("typeName"),
            }
            for extra_key in ("dg_role", "listener_name", "machine_name"):
                if target.get(extra_key) is not None:
                    item[extra_key] = target.get(extra_key)
            item["tags"] = dict(target.get("tags") or {})
            ensure_required_tags(item)
            normalized_targets.append(item)

        normalized_sites.append(
            {
                "site": site.get("site"),
                "endpoint": site.get("endpoint"),
                "name": site.get("name"),
                "targets": normalized_targets,
            }
        )

    _write_yaml(TARGETS_YAML, normalized_sites)
    return normalized_sites


def load_metrics_config() -> dict[str, list[dict[str, Any]]]:
    data = _read_yaml(METRICS_YAML)
    if not data or not isinstance(data, dict):
        return {}
    return data


def save_metrics_config(metrics: dict[str, list[dict[str, Any]]]) -> dict[str, list[dict[str, Any]]]:
    _write_yaml(METRICS_YAML, metrics)
    return metrics
