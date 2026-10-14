"""Abstract base class and typing for database persistence adapters."""
from __future__ import annotations

import abc
import uuid
from typing import Any

# Deterministic default user UUID for local demo prototyping
DEFAULT_DEMO_USER_ID = str(uuid.uuid5(uuid.NAMESPACE_DNS, "demo@syllora.com"))


class DatabaseAdapter(abc.ABC):
    """Abstract interface defining document and chunk persistence operations."""

    @property
    @abc.abstractmethod
    def provider_name(self) -> str:
        """Name of the provider (e.g., 'sqlite', 'postgres')."""
        ...

    @abc.abstractmethod
    def init_db(self) -> None:
        """Initialize required database tables and indexes."""
        ...

    @abc.abstractmethod
    def document_hash_exists(self, sha256: str, user_id: str | None = None) -> bool:
        """Check whether a document with the given SHA-256 hash already exists."""
        ...

    @abc.abstractmethod
    def insert_document(
        self,
        document: dict[str, Any],
        chunks: list[dict[str, Any]],
        pages: list[dict[str, Any]] | None = None,
        user_id: str | None = None,
    ) -> None:
        """Insert document metadata, chunks, and page text atomically."""
        ...

    @abc.abstractmethod
    def update_document_status(
        self,
        document_id: str,
        status: str,
        error: str | None = None,
        user_id: str | None = None,
    ) -> None:
        """Update indexing/processing status and optional error details."""
        ...

    @abc.abstractmethod
    def get_document_pages(
        self, document_id: str, user_id: str | None = None
    ) -> list[dict[str, Any]]:
        """Retrieve all extracted page records for a document."""
        ...

    @abc.abstractmethod
    def list_documents(self, user_id: str | None = None) -> list[dict[str, Any]]:
        """List all study documents ordered by creation time descending."""
        ...

    @abc.abstractmethod
    def get_document(self, document_id: str, user_id: str | None = None) -> dict[str, Any] | None:
        """Retrieve a single document by its unique ID."""
        ...

    @abc.abstractmethod
    def delete_document(self, document_id: str, user_id: str | None = None) -> dict[str, Any] | None:
        """Delete a document and all associated chunks and pages, returning deletion info."""
        ...

    @abc.abstractmethod
    def load_search_chunks(
        self, embedding_model: str, user_id: str | None = None
    ) -> list[dict[str, Any]]:
        """Load all chunk records and embeddings for in-memory hybrid search."""
        ...

    @abc.abstractmethod
    def count_chunks(self, user_id: str | None = None) -> int:
        """Count the total number of indexed passage chunks."""
        ...

    @abc.abstractmethod
    def match_chunks_vector(
        self,
        query_embedding: list[float],
        match_count: int = 5,
        user_id: str | None = None,
        course_id: str | None = None,
        document_ids: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        """Perform vector similarity search (database-native if supported, or fallback)."""
        ...
