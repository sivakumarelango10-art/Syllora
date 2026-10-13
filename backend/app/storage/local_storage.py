"""Local filesystem storage adapter for study PDFs."""
from __future__ import annotations

from pathlib import Path

from app.storage.base import StorageAdapter


class LocalStorageAdapter(StorageAdapter):
    """Stores PDFs on the local filesystem under upload_dir."""

    def __init__(self, upload_dir: Path | str) -> None:
        self.upload_dir = Path(upload_dir)

    @property
    def provider_name(self) -> str:
        return "local"

    def build_path(self, user_id: str, document_id: str) -> str:
        """Local filesystem format: {document_id}.pdf."""
        return f"{document_id}.pdf"

    def _resolve(self, storage_path: str) -> Path:
        # Prevent directory traversal
        clean_name = Path(storage_path).name
        return self.upload_dir / clean_name

    def save_file(self, storage_path: str, data: bytes, content_type: str = "application/pdf") -> str:
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        target = self._resolve(storage_path)
        target.write_bytes(data)
        return target.name

    def get_file(self, storage_path: str) -> bytes | None:
        target = self._resolve(storage_path)
        if target.is_file():
            return target.read_bytes()
        return None

    def delete_file(self, storage_path: str) -> bool:
        target = self._resolve(storage_path)
        if target.is_file():
            target.unlink(missing_ok=True)
            return True
        return False

    def file_exists(self, storage_path: str) -> bool:
        return self._resolve(storage_path).is_file()
