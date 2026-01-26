from __future__ import annotations

import urllib.parse
from typing import Any

import requests


class OEMClient:
    def __init__(self, endpoint: str, user: str, password: str, verify_ssl: bool = False):
        self.endpoint = endpoint
        self.user = user
        self.password = password
        self.verify_ssl = verify_ssl
        if not verify_ssl:
            requests.packages.urllib3.disable_warnings()  # type: ignore[attr-defined]

    def _normalize_base(self) -> str:
        base = self.endpoint.rstrip("/")
        if base.endswith("/em/api"):
            return base
        if base.endswith("/em"):
            return f"{base}/api"
        return f"{base}/em/api"

    def _get(self, path: str, params: dict[str, Any] | None = None) -> requests.Response:
        base = self._normalize_base()
        url = f"{base}/{path.lstrip('/')}"
        return requests.get(
            url,
            params=params,
            auth=(self.user, self.password),
            verify=self.verify_ssl,
            timeout=60,
        )

    def get_targets_page(self, page_token: str | None = None, limit: int = 2000) -> dict[str, Any]:
        params: dict[str, Any] = {"limit": limit}
        if page_token:
            params["page"] = page_token
        response = self._get("targets", params=params)
        response.raise_for_status()
        return response.json()

    def get_all_targets(self) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        page_token: str | None = None
        while True:
            data = self.get_targets_page(page_token=page_token)
            items.extend(data.get("items") or [])
            next_href = ((data.get("links") or {}).get("next") or {}).get("href")
            if not next_href:
                break
            parsed = urllib.parse.urlparse(next_href)
            query = urllib.parse.parse_qs(parsed.query)
            page_token = (query.get("page") or [None])[0]
            if not page_token:
                break
        return items

    def get_target_properties(self, target_id: str) -> dict[str, Any]:
        response = self._get(f"targets/{target_id}/properties")
        response.raise_for_status()
        return response.json()
