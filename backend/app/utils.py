from __future__ import annotations

import re
from typing import Any


def short_hostname(hostname: str | None) -> str | None:
    if not hostname:
        return None
    host = hostname.replace("-vip", "")
    host = host.split(".")[0]
    return host


def listener_short_name(hostname: str | None) -> str | None:
    host = short_hostname(hostname)
    if not host:
        return None
    return f"{host}_lstnr"


def tag_target_name(name: str, type_name: str) -> str:
    if type_name == "host":
        return short_hostname(name) or name
    if type_name == "oracle_listener":
        # name usually is LISTENER_<hostname>
        if name.startswith("LISTENER_"):
            base = name[len("LISTENER_") :]
        else:
            base = name
        short = short_hostname(base) or base
        return f"{short}_lstnr"
    return name


def normalize_tags_for_target(target: dict[str, Any]) -> dict[str, str]:
    tags = dict(target.get("tags") or {})
    name = target.get("name") or ""
    type_name = target.get("typeName") or ""
    display_name = tag_target_name(name, type_name)
    tags["target_name"] = display_name
    tags["target_type"] = type_name
    if type_name:
        tags[type_name] = display_name
    return tags


def ensure_required_tags(target: dict[str, Any]) -> None:
    tags = normalize_tags_for_target(target)
    type_name = target.get("typeName") or ""
    if type_name == "oracle_database":
        dg_role = target.get("dg_role")
        if dg_role:
            tags["dg_role"] = dg_role
        machine_name = target.get("machine_name")
        if machine_name:
            short = short_hostname(machine_name)
            if short:
                tags["machine_name"] = short
        listener_name = target.get("listener_name")
        if listener_name:
            short_listener = listener_short_name(listener_name.replace("LISTENER_", ""))
            if short_listener:
                tags["listener_name"] = short_listener
    target["tags"] = tags


def find_property_value(items: list[dict[str, Any]], key: str) -> str | None:
    target_key = key.lower()
    for item in items:
        item_key = str(item.get("id") or item.get("name") or "").lower()
        if item_key == target_key:
            value = item.get("value")
            return str(value) if value is not None else None
    return None


def compile_regex_list(patterns: list[str]) -> list[re.Pattern]:
    return [re.compile(pat) for pat in patterns]
