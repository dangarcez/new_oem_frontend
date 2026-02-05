from __future__ import annotations

from typing import Any

from pathlib import Path

import requests

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import cache
from .mapping import auto_map_system, prepare_targets
from .oem_pool import close_all_clients, get_client
from .static import SPAStaticFiles
from .oem_client import gethash #REMOVER DEPOIS DE USUARIO DE SERVICO  
from .storage import (
    get_enterprise_manager,
    get_site_config,
    load_enterprise_managers,
    load_targets_config,
    load_metrics_config,
    save_sites_config,
    save_metrics_config,
    upsert_site_config,
)
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


class SiteConfig(BaseModel):
    site: str | None = None
    endpoint: str | None = None
    name: str
    targets: list[TargetItem] = Field(default_factory=list)


class SaveAllConfigRequest(BaseModel):
    sites: list[SiteConfig] = Field(default_factory=list)


class MetricConfigItem(BaseModel):
    metric_group_name: str
    freq: int


class SaveMetricsRequest(BaseModel):
    metrics: dict[str, list[MetricConfigItem]] = Field(default_factory=dict)


class AvailabilityRequest(BaseModel):
    endpointName: str
    metricGroupName: str
    targetType: str


class MetricGroupsAvailabilityRequest(BaseModel):
    endpointName: str
    targetId: str
    metricGroupNames: list[str] = Field(default_factory=list)


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
    print(gethash())#REMOVER DEPOIS DE USUARIO DE SERVICO  
    cache.init_db()


@app.on_event("shutdown")
def _shutdown() -> None:
    close_all_clients()


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

    client = get_client(manager)

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


@app.get("/api/targets/types")
def list_target_types(endpointName: str) -> list[str]:
    return cache.list_target_types(endpointName)


@app.get("/api/targets/properties")
def get_target_properties(endpointName: str, targetId: str) -> dict[str, Any]:
    manager = get_enterprise_manager(endpointName)
    if not manager:
        raise HTTPException(status_code=404, detail="Endpoint nao encontrado")

    client = get_client(manager)

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
    client = get_client(manager)

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

    client = get_client(manager)

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


@app.get("/api/config/targets/all")
def load_all_configs() -> list[dict[str, Any]]:
    return load_targets_config()


@app.get("/api/config/metrics")
def load_metrics() -> dict[str, Any]:
    return load_metrics_config()


@app.post("/api/config/metrics")
def save_metrics(payload: SaveMetricsRequest) -> dict[str, Any]:
    metrics_dict = {
        target_type: [item.model_dump() for item in items]
        for target_type, items in payload.metrics.items()
    }
    return save_metrics_config(metrics_dict)


@app.post("/api/config/targets")
def save_config(payload: SaveConfigRequest) -> dict[str, Any]:
    if not get_enterprise_manager(payload.endpointName):
        raise HTTPException(status_code=404, detail="Endpoint nao encontrado")

    targets = [t.model_dump() for t in payload.targets]
    for target in targets:
        ensure_required_tags(target)
    site = upsert_site_config(payload.endpointName, targets)
    return site


@app.post("/api/config/targets/all")
def save_all_config(payload: SaveAllConfigRequest) -> list[dict[str, Any]]:
    sites = []
    for site in payload.sites:
        sites.append(
            {
                "site": site.site,
                "endpoint": site.endpoint,
                "name": site.name,
                "targets": [t.model_dump() for t in site.targets],
            }
        )
    return save_sites_config(sites)


@app.get("/api/metrics/metric-groups")
def metric_groups(endpointName: str, targetId: str) -> dict[str, Any]:
    manager = get_enterprise_manager(endpointName)
    if not manager:
        raise HTTPException(status_code=404, detail="Endpoint nao encontrado")
    client = get_client(manager)
    try:
        return client.get_metric_groups(targetId, include_metrics=True)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Erro ao consultar metricas: {exc}")


@app.get("/api/metrics/latest-data")
def latest_metric_data(endpointName: str, targetId: str, metricGroupName: str) -> dict[str, Any]:
    manager = get_enterprise_manager(endpointName)
    if not manager:
        raise HTTPException(status_code=404, detail="Endpoint nao encontrado")
    client = get_client(manager)
    try:
        return client.get_latest_metric_data(targetId, metricGroupName)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Erro ao consultar metricas: {exc}")


@app.get("/api/metrics/metric-group")
def metric_group_details(endpointName: str, targetId: str, metricGroupName: str) -> dict[str, Any]:
    manager = get_enterprise_manager(endpointName)
    if not manager:
        raise HTTPException(status_code=404, detail="Endpoint nao encontrado")
    client = get_client(manager)
    try:
        return client.get_metric_group_details(targetId, metricGroupName)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Erro ao consultar grupo de metricas: {exc}")


def _classify_latest_data(data: dict[str, Any]) -> str:
    count = data.get("count")
    if isinstance(count, int) and count > 0:
        return "disponivel"
    items = data.get("items") or []
    if not items:
        return "sem_dados"
    for item in items:
        metrics = item.get("metrics") or item.get("metricValues") or []
        if metrics:
            for metric in metrics:
                if metric.get("value") is not None:
                    return "disponivel"
        datapoints = item.get("datapoints")
        if datapoints:
            return "disponivel"
    return "sem_dados"


@app.post("/api/metrics/availability")
def metric_availability(payload: AvailabilityRequest) -> dict[str, Any]:
    manager = get_enterprise_manager(payload.endpointName)
    if not manager:
        raise HTTPException(status_code=404, detail="Endpoint nao encontrado")
    site = get_site_config(payload.endpointName)
    targets = (site or {}).get("targets") or []
    filtered_targets = [t for t in targets if t.get("typeName") == payload.targetType]

    client = get_client(manager)
    results = []
    for target in filtered_targets:
        status = "indisponivel"
        try:
            data = client.get_latest_metric_data(target.get("id"), payload.metricGroupName)
            status = _classify_latest_data(data)
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 404:
                status = "indisponivel"
            else:
                status = "indisponivel"
        except Exception:
            status = "indisponivel"
        results.append(
            {
                "id": target.get("id"),
                "name": target.get("name"),
                "typeName": target.get("typeName"),
                "status": status,
            }
        )

    return {
        "metricGroupName": payload.metricGroupName,
        "targetType": payload.targetType,
        "items": results,
    }


@app.post("/api/metrics/availability/target")
def metric_availability_for_target(payload: MetricGroupsAvailabilityRequest) -> dict[str, Any]:
    manager = get_enterprise_manager(payload.endpointName)
    if not manager:
        raise HTTPException(status_code=404, detail="Endpoint nao encontrado")

    client = get_client(manager)
    results = []
    for group_name in payload.metricGroupNames:
        status = "indisponivel"
        try:
            data = client.get_latest_metric_data(payload.targetId, group_name)
            status = _classify_latest_data(data)
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 404:
                status = "indisponivel"
            else:
                status = "indisponivel"
        except Exception:
            status = "indisponivel"
        results.append({"metricGroupName": group_name, "status": status})

    return {"items": results}


FRONTEND_DIR = Path(__file__).resolve().parents[1] / "frontend"
FRONTEND_DIST = FRONTEND_DIR / "dist"
static_dir = FRONTEND_DIST if FRONTEND_DIST.exists() else FRONTEND_DIR
if static_dir.exists():
    app.mount("/", SPAStaticFiles(directory=static_dir, html=True), name="frontend")
