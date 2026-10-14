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
        # Prevent directory traversal while preserving owner subfolder
        clean_parts = [p for p in Path(storage_path).parts if p not in ("..", "/", "\\", ".")]
        resolved = self.upload_dir.joinpath(*clean_parts)
        return resolved

    def save_file(
        self,
        storage_path: str,
        data: bytes,
        content_type: str = "application/pdf",
        auth_token: str | None = None,
    ) -> str:
        target = self._resolve(storage_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return storage_path

    def get_file(self, storage_path: str, auth_token: str | None = None) -> bytes | None:
        target = self._resolve(storage_path)
        if target.is_file():
            return target.read_bytes()
        # Fallback to checking flat filename for legacy local files
        flat_target = self.upload_dir / Path(storage_path).name
        if flat_target.is_file():
            return flat_target.read_bytes()
        return None

    def delete_file(self, storage_path: str, auth_token: str | None = None) -> bool:
        target = self._resolve(storage_path)
        if target.is_file():
            target.unlink(missing_ok=True)
            return True
        flat_target = self.upload_dir / Path(storage_path).name
        if flat_target.is_file():
            flat_target.unlink(missing_ok=True)
            return True
        return False

    def file_exists(self, storage_path: str, auth_token: str | None = None) -> bool:
        target = self._resolve(storage_path)
        if target.is_file():
            return True
        return (self.upload_dir / Path(storage_path).name).is_file()
