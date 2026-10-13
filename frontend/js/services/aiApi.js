import { getAuthToken, refreshSession } from "./supabase.js";

export function getApiBase() {
  if (typeof window !== "undefined") {
    if (window.SYLLORA_API_BASE) {
      return window.SYLLORA_API_BASE.replace(/\/+$/, "");
    }
    try {
      const stored = localStorage.getItem("syllora_api_base");
      if (stored) return stored.replace(/\/+$/, "");
    } catch {}
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return "http://127.0.0.1:8000";
    }
  }
  return "https://works-demographic-brake-appliances.trycloudflare.com";
}

const API_BASE = "https://works-demographic-brake-appliances.trycloudflare.com";

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  let token = getAuthToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const activeBase = getApiBase();
  let response = await fetch(`${activeBase}${path}`, {
    ...options,
    headers,
  });

  // If 401 Unauthorized, attempt session refresh once without entering an infinite loop
  if (response.status === 401 && token && !options._isRetry) {
    try {
      const refreshedSession = await refreshSession();
      const newToken = refreshedSession?.access_token;
      if (newToken) {
        headers.set("Authorization", `Bearer ${newToken}`);
        const retryOptions = { ...options, _isRetry: true, headers };
        response = await fetch(`${activeBase}${path}`, retryOptions);
      } else {
        console.warn("[Syllora API] Token expired and cannot be refreshed. Clearing session.");
        try {
          localStorage.removeItem("syllora_supabase_session");
        } catch {}
      }
    } catch (err) {
      console.warn("[Syllora API] Session refresh failed on 401:", err);
    }
  }


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
  },

  // Academic Dashboard
  getDashboardSummary() {
    return request("/api/v1/dashboard/summary");
  },

  // Courses & Syllabus
  listCourses() {
    return request("/api/v1/courses");
  },

  createCourse(courseData) {
    return request("/api/v1/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(courseData)
    });
  },

  listTopics(courseId = null) {
    const q = courseId ? `?course_id=${encodeURIComponent(courseId)}` : "";
    return request(`/api/v1/syllabus/topics${q}`);
  },

  createTopic(topicData) {
    return request("/api/v1/syllabus/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(topicData)
    });
  },

  updateTopic(topicId, updates) {
    return request(`/api/v1/syllabus/topics/${encodeURIComponent(topicId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates)
    });
  },

  listTopicEvidence(topicId) {
    return request(`/api/v1/syllabus/topics/${encodeURIComponent(topicId)}/evidence`);
  },

  // Chat & Conversation Persistence
  listChatSessions(courseId = null) {
    const q = courseId ? `?course_id=${encodeURIComponent(courseId)}` : "";
    return request(`/api/v1/chat/sessions${q}`);
  },

  createChatSession(sessionData) {
    return request("/api/v1/chat/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sessionData)
    });
  },

  listChatMessages(sessionId) {
    return request(`/api/v1/chat/sessions/${encodeURIComponent(sessionId)}/messages`);
  },

  // Check Understanding
  generateUnderstandingQuestion(topicId, difficulty = "intermediate") {
    return request("/api/v1/understanding/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic_id: topicId, difficulty })
    });
  },

  evaluateUnderstanding(topicId, question, studentExplanation) {
    return request("/api/v1/understanding/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic_id: topicId,
        question,
        student_explanation: studentExplanation
      })
    });
  },

  listUnderstandingAttempts(topicId = null) {
    const q = topicId ? `?topic_id=${encodeURIComponent(topicId)}` : "";
    return request(`/api/v1/understanding/attempts${q}`);
  },

  // Misconception Notebook
  listMisconceptions(status = null) {
    const q = status ? `?status=${encodeURIComponent(status)}` : "";
    return request(`/api/v1/misconceptions${q}`);
  },

  createMisconception(data) {
    return request("/api/v1/misconceptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
  },

  updateMisconception(id, updates) {
    return request(`/api/v1/misconceptions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates)
    });
  },

  // Revision Planner
  listRevisionTasks(status = null) {
    const q = status ? `?status=${encodeURIComponent(status)}` : "";
    return request(`/api/v1/revision/tasks${q}`);
  },

  createRevisionTask(data) {
    return request("/api/v1/revision/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
  },

  updateRevisionTask(id, updates) {
    return request(`/api/v1/revision/tasks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates)
    });
  },

  generateRevisionPlan(daysAhead = 7) {
    return request("/api/v1/revision/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days_ahead: daysAhead })
    });
  },

  // Profile & Settings
  getSettings() {
    return request("/api/v1/settings");
  },

  updateSettings(data) {
    return request("/api/v1/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
  },

  exportStudentData() {
    return request("/api/v1/settings/export", { method: "POST" });
  },

  getProfile() {
    return request("/api/v1/auth/me");
  },

  updateProfile(data) {
    return request("/api/v1/auth/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
  }
};
