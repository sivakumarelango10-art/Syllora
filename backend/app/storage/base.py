"""Storage adapter interface for study document binaries."""
from __future__ import annotations

import abc


class StorageAdapter(abc.ABC):
    """Abstract interface for storing raw study PDFs."""

    @property
    @abc.abstractmethod
    def provider_name(self) -> str:
        """Name of storage provider ('local' or 'supabase')."""
        ...

    @abc.abstractmethod
    def build_path(self, user_id: str, document_id: str) -> str:
        """Construct owner-scoped storage path for the given document."""
        ...

    @abc.abstractmethod
    def save_file(
        self,
        storage_path: str,
        data: bytes,
        content_type: str = "application/pdf",
        auth_token: str | None = None,
    ) -> str:
        """Store file data at storage_path and return confirmed storage path."""
        ...

    @abc.abstractmethod
    def get_file(self, storage_path: str, auth_token: str | None = None) -> bytes | None:
        """Retrieve raw file data or None if not found."""
        ...

    def get_file_bytes(self, storage_path: str, auth_token: str | None = None) -> bytes | None:
        """Alias for get_file for backward compatibility with streaming endpoints."""
        return self.get_file(storage_path, auth_token=auth_token)

    @abc.abstractmethod
    def delete_file(self, storage_path: str, auth_token: str | None = None) -> bool:
        """Delete file at storage_path. Return True if deleted, False if not found."""
        ...

    @abc.abstractmethod
    def file_exists(self, storage_path: str, auth_token: str | None = None) -> bool:
        """Check whether file exists at storage_path."""
        ...
