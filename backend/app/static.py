from __future__ import annotations

from pathlib import Path

from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles


class SPAStaticFiles(StaticFiles):
    def __init__(self, directory: str | Path, **kwargs):
        super().__init__(directory=directory, **kwargs)
        self._index = Path(directory) / "index.html"

    async def get_response(self, path: str, scope) -> Response:
        response = await super().get_response(path, scope)
        if response.status_code == 404:
            if self._index.exists():
                return FileResponse(self._index)
        return response
