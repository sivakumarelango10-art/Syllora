import { getAuthToken, refreshSession } from "./supabase.js";

/**
 * Strictly approved API origin whitelist.
 * Bearer tokens and sensitive student requests will NEVER be sent to
 * an origin outside this list.
 */
export const APPROVED_API_ORIGINS = [
  "http://127.0.0.1:8000",
  "http://localhost:8000",
  "http://127.0.0.1:3000",
  "http://localhost:3000"
];

/**
 * Determine if a target URL origin is explicitly approved.
 * Rejects arbitrary URLs, protocol-relative URLs, and unapproved external hosts.
 * @param {string} urlString
 * @returns {boolean}
 */
export function isApprovedOrigin(urlString) {
  if (!urlString || typeof urlString !== "string") return false;
  try {
    if (urlString.startsWith("/") && typeof window !== "undefined") {
      urlString = `${window.location.origin}${urlString}`;
    }
    const parsed = new URL(urlString, typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:8000");
    const origin = parsed.origin.toLowerCase();
    
    // Check exact match in approved list
    if (APPROVED_API_ORIGINS.some(allowed => allowed.toLowerCase() === origin)) {
      return true;
    }
    
    // Allow configured runtime PUBLIC_API_BASE_URL if it is HTTPS, not a static host, and not localhost
    if (typeof window !== "undefined" && window.__SYLLORA_CONFIG__?.PUBLIC_API_BASE_URL) {
      try {
        const configuredUrl = new URL(window.__SYLLORA_CONFIG__.PUBLIC_API_BASE_URL);
        const configuredOrigin = configuredUrl.origin.toLowerCase();
        // Do not allow static frontend host (.vercel.app) to be treated as backend API
        if (configuredUrl.hostname.endsWith(".vercel.app")) {
          return false;
        }
        if (configuredOrigin === origin && configuredUrl.protocol === "https:") {
          return true;
        }
      } catch {}
    }

    // Allow same-origin only in local development where Node dev server proxies to backend
    if (typeof window !== "undefined" && window.location.origin.toLowerCase() === origin) {
      const hostname = window.location.hostname.toLowerCase();
      if (hostname === "localhost" || hostname === "127.0.0.1") {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Resolve the active API base URL.
 * Only returns an origin if it is explicitly approved.
 * Rejects unverified localStorage overrides or untrusted window properties.
 * @returns {string}
 */
export function getApiBase() {
  if (typeof window !== "undefined") {
    // 0. Runtime public config injected at build/deployment
    if (window.__SYLLORA_CONFIG__?.PUBLIC_API_BASE_URL) {
      const candidate = window.__SYLLORA_CONFIG__.PUBLIC_API_BASE_URL.replace(/\/+$/, "");
      if (isApprovedOrigin(candidate)) {
        return candidate;
      }
      console.warn("[Syllora Security] Rejected unapproved window.__SYLLORA_CONFIG__.PUBLIC_API_BASE_URL:", candidate);
    }

    // 1. Explicit window property, only if validated against approved list
    if (window.SYLLORA_API_BASE && typeof window.SYLLORA_API_BASE === "string") {
      const candidate = window.SYLLORA_API_BASE.replace(/\/+$/, "");
      if (isApprovedOrigin(candidate)) {
        return candidate;
      }
      console.warn("[Syllora Security] Rejected unapproved window.SYLLORA_API_BASE:", candidate);
    }

    // 2. Local storage override, strictly validated against approved list
    try {
      const stored = localStorage.getItem("syllora_api_base");
      if (stored) {
        const candidate = stored.replace(/\/+$/, "");
        if (isApprovedOrigin(candidate)) {
          return candidate;
        }
        console.warn("[Syllora Security] Ignored unapproved localStorage syllora_api_base:", candidate);
      }
    } catch {}

    // 3. Localhost development environment default
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://127.0.0.1:8000";
    }

    // 4. In hosted production (e.g. .vercel.app), do NOT route API calls to the static frontend origin!
    throw new Error(
      "[Syllora Configuration Error] Backend API endpoint is not configured for production. " +
      "Set PUBLIC_API_BASE_URL to your deployed HTTPS FastAPI host in your deployment settings."
    );
  }

  // Fallback for Node/SSR/test environments
  return "http://127.0.0.1:8000";
}

async function request(path, options = {}) {
  const activeBase = getApiBase();

  // Validate origin before sending any payload or token
  if (!isApprovedOrigin(activeBase)) {
    throw new Error(`Security Exception: API base origin '${activeBase}' is not in the approved whitelist.`);
  }

  const headers = new Headers(options.headers || {});
  let token = getAuthToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response;
  try {
    response = await fetch(`${activeBase}${path}`, {
      ...options,
      headers,
    });
  } catch (netErr) {
    throw new Error(`Network error communicating with API (${activeBase}): ${netErr.message || 'Connection failed'}`);
  }

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
  },

  // F2 Mark-Aware Answers
  generateMarkAnswer(question, marks = 5, documentIds = null) {
    return request("/api/v1/answers/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        marks,
        document_ids: documentIds
      })
    });
  },

  // F3 Source-Grounded Answer Evaluator
  evaluateAnswer(question, studentAnswer, marks = 5, courseId = null, topicId = null, questionId = null) {
    return request("/api/v1/answers/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        student_answer: studentAnswer,
        marks,
        course_id: courseId,
        topic_id: topicId,
        question_id: questionId
      })
    });
  },

  // F4 Proof Mode
  verifyProof(answer, citations = [], messageId = null) {
    return request("/api/v1/answers/verify-proof", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answer,
        citations,
        message_id: messageId
      })
    });
  },

  // F8 Answerability Meter
  checkAnswerability(question, courseId = null, documentIds = null) {
    return request("/api/v1/answers/check-answerability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        course_id: courseId,
        document_ids: documentIds
      })
    });
  },

  // F11 Diagram Retrieval
  searchFigures(query, documentId = null) {
    const q = new URLSearchParams({ query });
    if (documentId) q.append("document_id", documentId);
    return request(`/api/v1/figures/search?${q.toString()}`);
  },

  // F13 Viva Simulator
  startViva(topicTitle, courseId = null, topicId = null) {
    return request("/api/v1/viva/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic_title: topicTitle,
        course_id: courseId,
        topic_id: topicId
      })
    });
  },

  respondViva(sessionId, transcript) {
    return request("/api/v1/viva/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        student_transcript: transcript
      })
    });
  },

  // F9 & F10 Advanced Syllabus & Revision
  getSyllabusCoverage(courseId = null) {
    const q = courseId ? `?course_id=${encodeURIComponent(courseId)}` : "";
    return request(`/api/v1/syllabus/coverage${q}`);
  },

  generateExamRevisionPlan(examDate, dailyMinutes = 45, courseId = null) {
    return request("/api/v1/revision/generate-exam-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exam_date: examDate,
        daily_minutes: dailyMinutes,
        course_id: courseId
      })
    });
  },

  // F6 Semester Library Search
  searchLibrary(query, courseId = null, docTypes = null, limit = 8) {
    return request("/api/v1/library/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        course_id: courseId,
        doc_types: docTypes,
        limit
      })
    });
  },

  // F12 Source Conflicts
  listConflicts(courseId = null, status = null) {
    const params = new URLSearchParams();
    if (courseId) params.append("course_id", courseId);
    if (status) params.append("status", status);
    const q = params.toString() ? `?${params.toString()}` : "";
    return request(`/api/v1/conflicts${q}`);
  }
};

