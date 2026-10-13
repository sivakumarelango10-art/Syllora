# Syllora AI Backend — Phase 2 (local RAG)

This phase adds local PDF ingestion, page-aware chunks, upload-time embedding, a SQLite index, keyword/semantic/combined retrieval, and grounded answers with source metadata. It does not change the existing frontend.

## Local prerequisites

- Python 3.11+
- Ollama running on Windows
- Chat model: `syllora-qwen` (or set `OLLAMA_MODEL` to `qwen3:4b`)
- Embedding model: `nomic-embed-text`

Before uploading documents, download the embedding model once:

```powershell
ollama pull nomic-embed-text
```

The API uses Ollama's batched `/api/embed` endpoint if available, with a compatibility fallback for older Ollama versions. Batched ingestion is faster on newer versions.

## Configure and run on Windows

From `F:\Syllora\backend`:

```powershell
# If this terminal will run the server, set your preferred chat model here.
$env:OLLAMA_MODEL = "syllora-qwen"
$env:OLLAMA_EMBED_MODEL = "nomic-embed-text"

.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Keep the server terminal open. API docs: <http://127.0.0.1:8000/docs>.

## API endpoints

- `GET /health`
- `GET /api/v1/llm/status`
- `GET /api/v1/rag/status`
- `POST /api/v1/llm/test` — general model connectivity test only
- `POST /api/v1/documents` — multipart form `file` (PDF), optional `title`; returns only after extraction and embeddings have been persisted
- `GET /api/v1/documents` — list indexed documents
- `DELETE /api/v1/documents/{document_id}` — delete PDF, metadata, chunks and cache entries
- `POST /api/v1/search` — body `{ "query": "deadlock", "mode": "keyword|semantic|combined", "limit": 5 }`
- `POST /api/v1/ask` — body `{ "question": "Explain deadlock", "top_k": 5 }`

For `/api/v1/ask`, the answer is generated from retrieved passages; sources are returned with original PDF page numbers. If retrieval finds no passage above the conservative evidence threshold, the service returns `status: insufficient_evidence` and no citations.

## Storage

By default, the SQLite database is `backend/data/indexes/syllora.sqlite3` and PDF blobs are in `backend/data/uploads/`. Override with `SYLLORA_DB_PATH` and `SYLLORA_UPLOAD_DIR` if needed. Runtime data is gitignored.

The server binds to `127.0.0.1` in these instructions. This prototype has no user authentication/tenant separation yet; keep it local and do not expose it publicly until access control, per-user document isolation, request limits, and deployment configuration have been implemented.
