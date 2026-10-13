"""Diagram Retrieval Service (F11): PDF figure extraction, caption indexing, and visual search."""
from __future__ import annotations

import fitz
import os
import uuid
from pathlib import Path
from typing import Any

from app.repositories.academic_repository import get_academic_repository
from app.rag.store import UPLOAD_DIR

FIGURES_DIR = UPLOAD_DIR / "figures"


class FigureService:
    def __init__(self) -> None:
        self.repo = get_academic_repository()
        FIGURES_DIR.mkdir(parents=True, exist_ok=True)

    def extract_figures_from_pdf(
        self,
        user_id: str,
        document_id: str,
        pdf_bytes: bytes,
    ) -> list[dict[str, Any]]:
        """Extracts embedded diagram images from uploaded PDF and captures surrounding text captions."""
        user_fig_dir = FIGURES_DIR / user_id
        user_fig_dir.mkdir(parents=True, exist_ok=True)

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        saved_figures: list[dict[str, Any]] = []

        for page_idx in range(len(doc)):
            page = doc[page_idx]
            image_list = page.get_images(full=True)

            if not image_list:
                continue

            # Get surrounding page text for caption
            page_text = page.get_text("text").strip()
            # Extract first 2 lines or text around "Figure", "Fig", "Diagram"
            fig_caption = "Diagram"
            caption_match = [
                line.strip()
                for line in page_text.splitlines()
                if any(w in line.lower() for w in ("figure", "fig.", "diagram", "architecture", "flowchart", "schematic"))
            ]
            if caption_match:
                fig_caption = caption_match[0][:150]
            elif page_text:
                fig_caption = page_text.splitlines()[0][:100]

            for img_info in image_list[:3]:  # Limit to 3 diagrams per page
                xref = img_info[0]
                base_image = doc.extract_image(xref)
                image_bytes = base_image["image"]
                image_ext = base_image["ext"]

                # Filter out tiny icon images (less than 3KB)
                if len(image_bytes) < 3000:
                    continue

                fig_id = str(uuid.uuid4())
                fig_filename = f"{fig_id}.{image_ext}"
                fig_filepath = user_fig_dir / fig_filename

                with open(fig_filepath, "wb") as f:
                    f.write(image_bytes)

                fig_record = self.repo.save_figure_asset(
                    user_id=user_id,
                    document_id=document_id,
                    page_number=page_idx + 1,
                    caption=fig_caption,
                    storage_path=str(fig_filepath),
                    relevance_tags=fig_caption.lower(),
                )
                saved_figures.append(fig_record)

        doc.close()
        return saved_figures

    def search_figures(
        self,
        user_id: str,
        query: str,
        document_id: str | None = None,
        limit: int = 4,
    ) -> list[dict[str, Any]]:
        """Searches indexed figures based on visual query terms."""
        all_figures = self.repo.list_figure_assets(user_id=user_id, document_id=document_id)
        if not all_figures:
            return []

        query_words = set(query.casefold().split())
        visual_intent_words = {"diagram", "figure", "architecture", "flowchart", "sketch", "graph", "schematic", "draw", "circuit", "model"}

        scored_figures = []
        for fig in all_figures:
            caption = (fig.get("caption") or "").casefold()
            tags = (fig.get("relevance_tags") or "").casefold()
            text_pool = f"{caption} {tags}"

            # Compute score based on matching terms
            score = 0.0
            for qw in query_words:
                if qw in text_pool:
                    score += 0.3
            if any(vi in query.casefold() for vi in visual_intent_words):
                score += 0.2

            if score > 0 or len(scored_figures) < 2:
                scored_figures.append({
                    "id": fig["id"],
                    "document_id": fig["document_id"],
                    "page_number": fig["page_number"],
                    "caption": fig["caption"],
                    "image_url": f"/api/v1/figures/{fig['id']}/image",
                    "relevance_score": round(score, 2),
                })

        scored_figures.sort(key=lambda x: x["relevance_score"], reverse=True)
        return scored_figures[:limit]

    def get_figure_bytes(self, user_id: str, figure_id: str) -> tuple[bytes, str] | None:
        """Retrieves raw figure image bytes safely scoped to authenticated user."""
        all_figures = self.repo.list_figure_assets(user_id=user_id)
        match = next((f for f in all_figures if f["id"] == figure_id), None)
        if not match:
            return None

        file_path = Path(match["storage_path"])
        if not file_path.is_file():
            return None

        ext = file_path.suffix.lstrip(".").lower()
        media_type = f"image/{ext}" if ext in ("png", "jpeg", "jpg", "webp") else "image/png"
        return file_path.read_bytes(), media_type


_FIGURE_SERVICE = None


def get_figure_service() -> FigureService:
    global _FIGURE_SERVICE
    if _FIGURE_SERVICE is None:
        _FIGURE_SERVICE = FigureService()
    return _FIGURE_SERVICE
