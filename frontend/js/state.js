/**
 * ============================================================================
 * SYLLORA SHARED WORKSPACE STATE LAYER
 * ============================================================================
 * Strongly typed entities, deterministic demo fixtures, versioned storage,
 * and reactive subscription listeners. All dashboard counts derive from state.
 */

import { deletePdfBlob, clearAllPdfBlobs } from './storage.js';
import { sessionAdapter } from './session.js';
import { sylloraApi } from './services/aiApi.js';

const STORAGE_KEY_PREFIX = 'syllora_workspace_state_';
const LEGACY_STORAGE_KEY = 'syllora_workspace_state_v1';

// One-time legacy cleanup: remove any unauthenticated demo state
if (typeof window !== 'undefined') {
  try {
    if (localStorage.getItem(LEGACY_STORAGE_KEY)) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      console.info('[Syllora State] Cleared legacy demo workspace state.');
    }
  } catch (e) {}
}

const EMPTY_STATE = {
  course: null,
  courses: [],
  documents: [],
  passages: [],
  topics: [],
  misconceptions: [],
  revisionTasks: [],
  pastPaperQuestions: [],
  understandingAttempts: [],
  bookmarks: []
};

// Safe State Manager Class
class WorkspaceStore {
  constructor() {
    this.listeners = new Set();
    this.state = this.loadInitialState();
  }

  getStorageKey() {
    const user = sessionAdapter.getUser();
    return (user && user.id) ? `${STORAGE_KEY_PREFIX}${user.id}` : LEGACY_STORAGE_KEY;
  }

  loadInitialState() {
    try {
      const key = this.getStorageKey();
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.documents)) {
          // Normalize documents
          parsed.documents.forEach(d => {
            if (typeof d.pageCount !== 'number' || isNaN(d.pageCount)) {
              d.pageCount = null;
            }
          });
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[Syllora State] Failed to load localStorage:', e);
    }
    return JSON.parse(JSON.stringify(EMPTY_STATE));
  }

  save() {
    try {
      const key = this.getStorageKey();
      // Do not store transient blobUrl strings or File objects in localStorage
      const clone = JSON.parse(JSON.stringify(this.state));
      if (clone.documents) {
        clone.documents.forEach(d => {
          delete d.blobUrl;
          delete d.blobFile;
        });
      }
      localStorage.setItem(key, JSON.stringify(clone));
    } catch (e) {
      console.warn('[Syllora State] Storage write failed (quota exceeded or incognito):', e);
    }
    this.notify();
  }

  async syncWithBackend() {
    if (!sessionAdapter.isAuthenticated()) {
      return;
    }
    try {
      // 1. Fetch real courses from PostgreSQL
      const coursesRes = await sylloraApi.listCourses();
      if (!Array.isArray(coursesRes)) {
        throw new Error('The courses response was invalid.');
      }
      const courses = Array.isArray(coursesRes) ? coursesRes : [];
      this.state.courses = courses;
      if (courses.length > 0) {
        const active = courses[0];
        this.state.course = {
          id: active.id,
          code: active.code || '',
          name: active.title || active.name || '',
          term: active.term || '',
          instructor: active.instructor || '',
          totalUnits: active.total_units || 0
        };
      } else {
        this.state.course = null;
      }

      // 2. Fetch real documents from PostgreSQL & Storage
      const docsRes = await sylloraApi.listDocuments();
      if (!docsRes || (!Array.isArray(docsRes.documents) && !Array.isArray(docsRes))) {
        throw new Error('The study materials response was invalid.');
      }
      const rawDocs = Array.isArray(docsRes.documents) ? docsRes.documents : (Array.isArray(docsRes) ? docsRes : []);
      this.state.documents = rawDocs.map(d => ({
        id: d.id,
        title: d.title || d.filename,
        filename: d.filename,
        author: d.author || 'Uploaded Document',
        pageCount: Number(d.page_count) || null,
        fileSize: d.size_bytes ? `${(d.size_bytes / 1024).toFixed(1)} KB` : 'Unknown',
        uploadedAt: d.created_at ? d.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
        status: d.status || 'indexed',
        backendDocument: true,
        backendChunkCount: Number(d.chunk_count) || 0,
        isBookmarked: false
      }));

      // 3. Fetch real topics from PostgreSQL
      const topicsRes = await sylloraApi.listTopics();
      if (!Array.isArray(topicsRes)) {
        throw new Error('The syllabus topics response was invalid.');
      }
      const rawTopics = Array.isArray(topicsRes) ? topicsRes : [];
      this.state.topics = rawTopics.map(t => ({
        id: t.id,
        title: t.title,
        unit: t.description || 'Module 1',
        evidenceStatus: t.coverage_status === 'covered' ? 'Evidence found' : (t.coverage_status === 'partially_covered' ? 'Limited evidence' : 'No matching evidence found'),
        understandingStatus: t.mastery_score >= 0.75 ? 'Mastered' : (t.mastery_score >= 0.5 ? 'Needs practice' : (t.mastery_score > 0 ? 'Review needed' : 'Not assessed')),
        matchedPassageIds: [],
        prerequisites: []
      }));

      // 4. Fetch real misconceptions from PostgreSQL
      const miscRes = await sylloraApi.listMisconceptions();
      if (!Array.isArray(miscRes)) {
        throw new Error('The misconceptions response was invalid.');
      }
      const rawMisc = Array.isArray(miscRes) ? miscRes : [];
      this.state.misconceptions = rawMisc.map(m => ({
        id: m.id,
        topicId: m.topic_id,
        topicTitle: m.topic_title || 'Syllabus Topic',
        observedIssue: m.title || m.description,
        originalExplanation: m.student_explanation || '',
        feedback: m.correction_guidance || m.feedback || '',
        status: m.status === 'resolved' ? 'Student-marked complete' : (m.status === 'improving' ? 'Improving' : 'Open'),
        sourceCitations: []
      }));

      // 5. Fetch real revision tasks from PostgreSQL
      const revRes = await sylloraApi.listRevisionTasks();
      if (!Array.isArray(revRes)) {
        throw new Error('The revision tasks response was invalid.');
      }
      const rawTasks = Array.isArray(revRes) ? revRes : [];
      this.state.revisionTasks = rawTasks.map(tsk => ({
        id: tsk.id,
        topicId: tsk.topic_id,
        title: tsk.title,
        day: tsk.due_date ? tsk.due_date.split('T')[0] : 'Scheduled',
        estimatedMins: tsk.estimated_minutes || 30,
        priority: tsk.priority >= 4 ? 'high' : (tsk.priority >= 2 ? 'medium' : 'low'),
        completed: tsk.status === 'completed',
        reason: tsk.task_type || 'Curriculum revision'
      }));

      this.save();
    } catch (err) {
      console.warn('[WorkspaceStore] Backend sync failed:', err);
    }
  }

  notify() {
    this.listeners.forEach((listener) => {
      try {
        listener(this.state);
      } catch (err) {
        console.error('[Syllora State] Listener error:', err);
      }
    });
    // Broadcast state change to update navigation and shell counters
    try {
      window.dispatchEvent(new Event('syllora_state_updated'));
    } catch {}
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState() {
    return this.state;
  }

  // Derived Statistics (used across Overview and Navigation)
  getStats() {
    const s = this.state || {};
    const docs = Array.isArray(s.documents) ? s.documents : [];
    const topics = Array.isArray(s.topics) ? s.topics : [];
    const misconceptions = Array.isArray(s.misconceptions) ? s.misconceptions : [];
    const tasks = Array.isArray(s.revisionTasks) ? s.revisionTasks : [];

    const nonComparisonDocs = docs.filter(d => !d.isComparisonOnly);
    const topicsWithEvidence = topics.filter(t => t.evidenceStatus === 'Evidence found');
    const needsPractice = topics.filter(t => t.understandingStatus === 'Needs practice');
    const openMisconceptions = misconceptions.filter(m => m.status !== 'Student-marked complete');
    const pendingTasks = tasks.filter(t => !t.completed);

    return {
      totalDocs: nonComparisonDocs.length,
      indexedDocs: nonComparisonDocs.filter(d => d.status === 'indexed').length,
      localPreviewDocs: nonComparisonDocs.filter(d => d.status === 'local_preview').length,
      totalTopics: topics.length,
      topicsWithEvidenceCount: topicsWithEvidence.length,
      evidenceCoveragePct: topics.length > 0 ? Math.round((topicsWithEvidence.length / topics.length) * 100) : 0,
      needsPracticeCount: needsPractice.length,
      openMisconceptionsCount: openMisconceptions.length,
      pendingTasksCount: pendingTasks.length,
      totalTasksCount: tasks.length
    };
  }

  // --- Document Operations ---
  addDocument(doc) {
    this.state.documents.unshift(doc);
    this.save();
  }

  updateDocument(docId, updates) {
    const doc = this.state.documents.find(d => d.id === docId);
    if (doc) {
      Object.assign(doc, updates);
      this.save();
    }
  }

  deleteDocument(docId) {
    // Delete stored blob in IndexedDB and revoke managed URL
    deletePdfBlob(docId);

    // Remove document
    this.state.documents = this.state.documents.filter(d => d.id !== docId);

    // Clean up passages to avoid dangling references
    const removedPassageIds = new Set(this.state.passages.filter(p => p.documentId === docId).map(p => p.id));
    this.state.passages = this.state.passages.filter(p => p.documentId !== docId);

    // Clean bookmarks pointing to document or removed passages
    this.state.bookmarks = this.state.bookmarks.filter(b => {
      if (b.targetType === 'document' && b.targetId === docId) return false;
      if (b.targetType === 'passage' && removedPassageIds.has(b.targetId)) return false;
      return true;
    });

    // Clean comparison pointers
    this.state.documents.forEach(d => {
      if (d.comparisonDocId === docId) {
        delete d.comparisonDocId;
        d.hasComparison = false;
      }
    });

    // Clean matched passages on syllabus topics
    this.state.topics.forEach(t => {
      if (t.matchedPassageIds) {
        t.matchedPassageIds = t.matchedPassageIds.filter(id => !removedPassageIds.has(id));
        if (t.matchedPassageIds.length === 0 && t.evidenceStatus === 'Evidence found') {
          t.evidenceStatus = 'No matching evidence found';
        }
      }
    });

    this.save();
  }

  renameDocument(docId, newTitle) {
    const doc = this.state.documents.find(d => d.id === docId);
    if (doc) {
      doc.title = newTitle;
      this.save();
    }
  }

  toggleBookmarkDocument(docId) {
    const doc = this.state.documents.find(d => d.id === docId);
    if (doc) {
      doc.isBookmarked = !doc.isBookmarked;
      this.save();
    }
  }

  // --- Topic Operations ---
  addTopic(topic) {
    this.state.topics.push(topic);
    this.save();
  }

  updateTopic(topicId, updates) {
    const topic = this.state.topics.find(t => t.id === topicId);
    if (topic) {
      Object.assign(topic, updates);
      this.save();
    }
  }

  deleteTopic(topicId) {
    this.state.topics = this.state.topics.filter(t => t.id !== topicId);
    this.save();
  }

  // --- Misconceptions Operations ---
  addMisconception(misc) {
    this.state.misconceptions.unshift(misc);
    this.save();
  }

  updateMisconceptionStatus(miscId, newStatus) {
    const misc = this.state.misconceptions.find(m => m.id === miscId);
    if (misc) {
      misc.status = newStatus;
      this.save();
    }
  }

  deleteMisconception(miscId) {
    this.state.misconceptions = this.state.misconceptions.filter(m => m.id !== miscId);
    this.save();
  }

  // --- Understanding Attempt Operations ---
  saveAttempt(attempt) {
    this.state.understandingAttempts.unshift(attempt);
    // Update corresponding topic's understanding status
    const topic = this.state.topics.find(t => t.id === attempt.topicId);
    if (topic) {
      if (attempt.score >= 3) {
        topic.understandingStatus = 'Not assessed'; // mastered/solid
      } else if (attempt.score === 2) {
        topic.understandingStatus = 'Needs practice';
      } else {
        topic.understandingStatus = 'Review needed';
      }
    }
    this.save();
  }

  // --- Revision Task Operations ---
  toggleTaskCompleted(taskId) {
    const task = this.state.revisionTasks.find(t => t.id === taskId);
    if (task) {
      task.completed = !task.completed;
      this.save();
    }
  }

  rescheduleTask(taskId, newDate) {
    const task = this.state.revisionTasks.find(t => t.id === taskId);
    if (task) {
      task.scheduledDate = newDate;
      this.save();
    }
  }

  // --- Bookmarking System ---
  addBookmark({ targetType, targetId, title, snippet, metadata }) {
    if (!this.state.bookmarks) this.state.bookmarks = [];
    const exists = this.state.bookmarks.some(b => b.targetType === targetType && b.targetId === targetId);
    if (!exists) {
      const newBm = {
        id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        targetType, // 'document' | 'passage' | 'answer' | 'topic'
        targetId,
        title: title || 'Untitled Bookmark',
        snippet: snippet || '',
        metadata: metadata || {},
        createdAt: new Date().toISOString()
      };
      this.state.bookmarks.unshift(newBm);
      this.save();
      return newBm;
    }
    return null;
  }

  removeBookmark(id) {
    if (!this.state.bookmarks) return;
    this.state.bookmarks = this.state.bookmarks.filter(b => b.id !== id && b.targetId !== id);
    this.save();
  }

  isBookmarked(targetType, targetId) {
    if (!this.state.bookmarks) return false;
    return this.state.bookmarks.some(b => b.targetType === targetType && b.targetId === targetId);
  }

  // --- Input Draft Persistence ---
  saveDraft(key, text) {
    if (!this.state.drafts) this.state.drafts = {};
    this.state.drafts[key] = text;
    try {
      localStorage.setItem(`syllora_draft_${key}`, text);
    } catch {}
  }

  getDraft(key) {
    if (this.state.drafts && typeof this.state.drafts[key] === 'string') {
      return this.state.drafts[key];
    }
    try {
      return localStorage.getItem(`syllora_draft_${key}`) || '';
    } catch {
      return '';
    }
  }

  clearDraft(key) {
    if (this.state.drafts) {
      delete this.state.drafts[key];
    }
    try {
      localStorage.removeItem(`syllora_draft_${key}`);
    } catch {}
  }

  // --- Clear Local Caches & Resync ---
  // Preserves server state, clears local caches and resets local state to empty
  async resetWorkspaceData() {
    try {
      await clearAllPdfBlobs();
    } catch (err) {
      console.warn('[WorkspaceStore] Error clearing stored PDF blobs:', err);
    }

    // Only clear Syllora-owned local storage caches, preserving active session
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('syllora_') && k !== 'syllora_supabase_session') {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (e) {
      console.warn('[WorkspaceStore] Error clearing syllora localStorage keys:', e);
    }

    this.state = JSON.parse(JSON.stringify(EMPTY_STATE));
    this.save();
    if (sessionAdapter.isAuthenticated()) {
      await this.syncWithBackend();
    }
  }
}

// Global Singleton Instance
export const workspaceStore = new WorkspaceStore();
