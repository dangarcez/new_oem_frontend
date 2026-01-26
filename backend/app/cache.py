from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from .config import CACHE_DB


def _connect() -> sqlite3.Connection:
    CACHE_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(CACHE_DB)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = _connect()
    with conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS targets (
                endpoint_name TEXT NOT NULL,
                target_id TEXT NOT NULL,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                display_name TEXT,
                PRIMARY KEY (endpoint_name, target_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS meta (
                endpoint_name TEXT PRIMARY KEY,
                last_refresh TEXT
            )
            """
        )
    conn.close()


def upsert_targets(endpoint_name: str, items: list[dict[str, Any]]) -> int:
    conn = _connect()
    with conn:
        conn.executemany(
            """
            INSERT INTO targets (endpoint_name, target_id, name, type, display_name)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(endpoint_name, target_id) DO UPDATE SET
                name=excluded.name,
                type=excluded.type,
                display_name=excluded.display_name
            """,
            [
                (
                    endpoint_name,
                    item.get("id"),
                    item.get("name"),
                    item.get("typeName"),
                    item.get("displayName"),
                )
                for item in items
            ],
        )
        conn.execute(
            "INSERT OR REPLACE INTO meta(endpoint_name, last_refresh) VALUES (?, datetime('now'))",
            (endpoint_name,),
        )
    conn.close()
    return len(items)


def clear_targets(endpoint_name: str) -> None:
    conn = _connect()
    with conn:
        conn.execute("DELETE FROM targets WHERE endpoint_name = ?", (endpoint_name,))
    conn.close()


def get_target_by_id(endpoint_name: str, target_id: str) -> dict[str, Any] | None:
    conn = _connect()
    row = conn.execute(
        "SELECT target_id, name, type, display_name FROM targets WHERE endpoint_name = ? AND target_id = ?",
        (endpoint_name, target_id),
    ).fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row["target_id"],
        "name": row["name"],
        "typeName": row["type"],
        "displayName": row["display_name"],
    }


def get_all_targets(endpoint_name: str) -> list[dict[str, Any]]:
    conn = _connect()
    rows = conn.execute(
        "SELECT target_id, name, type, display_name FROM targets WHERE endpoint_name = ?",
        (endpoint_name,),
    ).fetchall()
    conn.close()
    return [
        {
            "id": row["target_id"],
            "name": row["name"],
            "typeName": row["type"],
            "displayName": row["display_name"],
        }
        for row in rows
    ]


def count_targets(endpoint_name: str) -> int:
    conn = _connect()
    row = conn.execute(
        "SELECT COUNT(*) as total FROM targets WHERE endpoint_name = ?",
        (endpoint_name,),
    ).fetchone()
    conn.close()
    return int(row["total"]) if row else 0


def get_last_refresh(endpoint_name: str) -> str | None:
    conn = _connect()
    row = conn.execute(
        "SELECT last_refresh FROM meta WHERE endpoint_name = ?",
        (endpoint_name,),
    ).fetchone()
    conn.close()
    return row["last_refresh"] if row else None


def search_targets(
    endpoint_name: str,
    query: str | None,
    type_filters: list[str] | None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    conn = _connect()
    params: list[Any] = [endpoint_name]
    where = ["endpoint_name = ?"]

    if query:
        where.append("LOWER(name) LIKE ?")
        params.append(f"%{query.lower()}%")
    if type_filters:
        placeholders = ",".join("?" for _ in type_filters)
        where.append(f"type IN ({placeholders})")
        params.extend(type_filters)

    sql = (
        "SELECT target_id, name, type, display_name FROM targets"
        f" WHERE {' AND '.join(where)}"
        " ORDER BY name ASC"
        " LIMIT ?"
    )
    params.append(limit)
    rows = conn.execute(sql, params).fetchall()
    conn.close()

    return [
        {
            "id": row["target_id"],
            "name": row["name"],
            "typeName": row["type"],
            "displayName": row["display_name"],
        }
        for row in rows
    ]
