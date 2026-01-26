from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import cache
from .mapping import auto_map_system, prepare_targets
from .oem_client import OEMClient
from .storage import get_enterprise_manager, get_site_config, load_enterprise_managers, upsert_site_config
from .utils import ensure_required_tags


class TargetItem(BaseModel):
    id: str
    name: str
    typeName: str
    tags: dict[str, str] | None = None
    dg_role: str | None = None
    listener_name: str | None = None
    machine_name: str | None = None


class PrepareTargetsRequest(BaseModel):
    endpointName: str
    targets: list[TargetItem]


class AutoMapRequest(BaseModel):
    endpointName: str
    rootName: str
    rootType: str


class SaveConfigRequest(BaseModel):
    endpointName: str
    targets: list[TargetItem] = Field(default_factory=list)


app = FastAPI(title="OEM Ingest Config Builder")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    cache.init_db()


@app.get("/api/enterprise-managers")
def list_enterprise_managers() -> list[dict[str, Any]]:
    managers = load_enterprise_managers()
    sanitized = []
    for item in managers:
        sanitized.append(
            {
                "site": item.get("site"),
                "endpoint": item.get("endpoint"),
                "name": item.get("name"),
            }
        )
    return sanitized


@app.get("/api/targets/cache-info")
def cache_info(endpointName: str) -> dict[str, Any]:
    return {
        "count": cache.count_targets(endpointName),
        "lastRefresh": cache.get_last_refresh(endpointName),
    }


@app.post("/api/targets/refresh")
def refresh_targets(endpointName: str) -> dict[str, Any]:
    manager = get_enterprise_manager(endpointName)
    if not manager:
        raise HTTPException(status_code=404, detail="Endpoint nao encontrado")

    client = OEMClient(
        endpoint=manager.get("endpoint"),
        user=manager.get("user"),
        password=manager.get("password"),
        verify_ssl=bool(manager.get("verify_ssl", False)),
    )

    try:
        raw_items = client.get_all_targets()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Erro ao consultar OEM: {exc}")

    normalized: list[dict[str, Any]] = []
    for item in raw_items:
        normalized.append(
            {
                "id": item.get("targetId") or item.get("id"),
                "name": item.get("name"),
                "typeName": item.get("type") or item.get("typeName"),
                "displayName": item.get("displayName") or item.get("name"),
            }
        )

    cache.clear_targets(endpointName)
    cache.upsert_targets(endpointName, normalized)

    return {"count": len(normalized)}


@app.get("/api/targets/search")
def search_targets(
    endpointName: str,
    q: str | None = None,
    types: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    type_filters = [t.strip() for t in types.split(",")] if types else None
    results = cache.search_targets(endpointName, q or "", type_filters, limit=limit)
    return results


@app.get("/api/targets/properties")
def get_target_properties(endpointName: str, targetId: str) -> dict[str, Any]:
    manager = get_enterprise_manager(endpointName)
    if not manager:
        raise HTTPException(status_code=404, detail="Endpoint nao encontrado")

    client = OEMClient(
        endpoint=manager.get("endpoint"),
        user=manager.get("user"),
        password=manager.get("password"),
        verify_ssl=bool(manager.get("verify_ssl", False)),
    )

    try:
        data = client.get_target_properties(targetId)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Erro ao consultar propriedades: {exc}")

    return data


@app.post("/api/targets/prepare")
def prepare_targets_endpoint(payload: PrepareTargetsRequest) -> dict[str, Any]:
    manager = get_enterprise_manager(payload.endpointName)
    if not manager:
        raise HTTPException(status_code=404, detail="Endpoint nao encontrado")

    cached_targets = cache.get_all_targets(payload.endpointName)
    client = OEMClient(
        endpoint=manager.get("endpoint"),
        user=manager.get("user"),
        password=manager.get("password"),
        verify_ssl=bool(manager.get("verify_ssl", False)),
    )

    prepared = prepare_targets(cached_targets, [t.model_dump() for t in payload.targets], client)
    return {"targets": prepared}


@app.post("/api/targets/auto-map")
def auto_map(payload: AutoMapRequest) -> dict[str, Any]:
    manager = get_enterprise_manager(payload.endpointName)
    if not manager:
        raise HTTPException(status_code=404, detail="Endpoint nao encontrado")

    cached_targets = cache.get_all_targets(payload.endpointName)
    root_exists = any(
        t for t in cached_targets if t.get("name") == payload.rootName and t.get("typeName") == payload.rootType
    )
    if not root_exists:
        raise HTTPException(status_code=404, detail="Target raiz nao encontrado no cache")

    client = OEMClient(
        endpoint=manager.get("endpoint"),
        user=manager.get("user"),
        password=manager.get("password"),
        verify_ssl=bool(manager.get("verify_ssl", False)),
    )

    mapped = auto_map_system(cached_targets, payload.rootName, payload.rootType, client)
    return {"targets": mapped}


@app.get("/api/config/targets")
def load_config(endpointName: str) -> dict[str, Any]:
    site = get_site_config(endpointName)
    if not site:
        manager = get_enterprise_manager(endpointName) or {}
        site = {
            "site": manager.get("site"),
            "endpoint": manager.get("endpoint"),
            "name": endpointName,
            "targets": [],
        }
    return site


@app.post("/api/config/targets")
def save_config(payload: SaveConfigRequest) -> dict[str, Any]:
    if not get_enterprise_manager(payload.endpointName):
        raise HTTPException(status_code=404, detail="Endpoint nao encontrado")

    targets = [t.model_dump() for t in payload.targets]
    for target in targets:
        ensure_required_tags(target)
    site = upsert_site_config(payload.endpointName, targets)
    return site
