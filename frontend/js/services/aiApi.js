const API_BASE = "http://127.0.0.1:8000";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Invalid API response (${response.status}).`);
  }

  if (!response.ok) {
    const message = typeof data.detail === "string"
      ? data.detail
      : JSON.stringify(data.detail || data);

    throw new Error(message || `API request failed (${response.status}).`);
  }

  return data;
}

export const sylloraApi = {
  health() {
    return request("/health");
  },

  ragStatus() {
    return request("/api/v1/rag/status");
  },

  listDocuments() {
    return request("/api/v1/documents");
  },

  uploadDocument(file, title) {
    const form = new FormData();
    form.append("file", file);
    if (title) form.append("title", title);

    return request("/api/v1/documents", {
      method: "POST",
      body: form
    });
  },

  ask(question, documentIds, topK = 5) {
    return request("/api/v1/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        document_ids: documentIds,
        top_k: topK
      })
    });
  },

  search(query, mode = "combined", documentIds = null, limit = 5) {
    return request("/api/v1/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        mode,
        document_ids: documentIds,
        limit
      })
    });
  },

  deleteDocument(documentId) {
    return request(
      `/api/v1/documents/${encodeURIComponent(documentId)}`,
      { method: "DELETE" }
    );
  }
};
