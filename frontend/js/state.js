/**
 * ============================================================================
 * SYLLORA SHARED WORKSPACE STATE LAYER
 * ============================================================================
 * Strongly typed entities, deterministic demo fixtures, versioned storage,
 * and reactive subscription listeners. All dashboard counts derive from state.
 */

const STORAGE_KEY = 'syllora_workspace_state_v1';

// Initial Pristine Fixtures
const SEED_DATA = {
  course: {
    id: 'cs301',
    code: 'CS301',
    name: 'Operating Systems',
    term: 'Fall 2026',
    instructor: 'Prof. A. Subramanian',
    totalUnits: 6
  },
  documents: [
    {
      id: 'doc-1',
      title: 'Operating System Concepts (Ch. 8: Deadlocks)',
      filename: 'Silberschatz_OS_Deadlocks_Ch8.pdf',
      author: 'Silberschatz, Galvin & Gagne',
      pageCount: 4,
      fileSize: '5.5 KB',
      uploadedAt: '2026-10-02',
      status: 'indexed', // 'indexed' | 'local_preview'
      isBookmarked: true,
      hasComparison: true,
      comparisonDocId: 'doc-4'
    },
    {
      id: 'doc-2',
      title: 'Modern Operating Systems (Ch. 6 Excerpt)',
      filename: 'Tanenbaum_MOS_Deadlocks_Excerpt.pdf',
      author: 'Andrew S. Tanenbaum',
      pageCount: 3,
      fileSize: '3.6 KB',
      uploadedAt: '2026-10-04',
      status: 'indexed',
      isBookmarked: false
    },
    {
      id: 'doc-3',
      title: 'CS301 Lecture Slides: Concurrency & Deadlocks',
      filename: 'Lecture_Slides_Week6_Concurrency.pdf',
      author: 'Dept. of Computer Science',
      pageCount: 5,
      fileSize: '5.0 KB',
      uploadedAt: '2026-10-08',
      status: 'indexed',
      isBookmarked: false
    },
    {
      id: 'doc-4',
      title: 'Operating System Concepts (10th Ed. Revised Ch. 8)',
      filename: 'Silberschatz_OS_Deadlocks_Ch8_v2.pdf',
      author: 'Silberschatz, Galvin & Gagne',
      pageCount: 4,
      fileSize: '4.4 KB',
      uploadedAt: '2026-10-10',
      status: 'indexed',
      isBookmarked: false,
      isComparisonOnly: true
    }
  ],
  passages: [
    {
      id: 'pass-1',
      documentId: 'doc-1',
      documentTitle: 'Silberschatz (Ch. 8)',
      pageNumber: 2,
      sectionTitle: '8.2 Deadlock Characterization: The Four Coffman Conditions',
      quote: 'A deadlock situation can arise if and only if the following four conditions hold simultaneously: 1. Mutual Exclusion, 2. Hold and Wait, 3. No Preemption, 4. Circular Wait.',
      topicId: 'top-1'
    },
    {
      id: 'pass-2',
      documentId: 'doc-1',
      documentTitle: 'Silberschatz (Ch. 8)',
      pageNumber: 3,
      sectionTitle: '8.3 Resource-Allocation Graphs & Deadlock vs Starvation',
      quote: 'A deadlock occurs when every process in a set is waiting for an event that only another process in the set can cause. In contrast, starvation (indefinite postponement) occurs when a runnable process is perpetually denied access because resources are continuously allocated to higher-priority processes.',
      topicId: 'top-3'
    },
    {
      id: 'pass-3',
      documentId: 'doc-1',
      documentTitle: 'Silberschatz (Ch. 8)',
      pageNumber: 4,
      sectionTitle: "8.4 Deadlock Avoidance & Banker's Algorithm",
      quote: "The Banker's Algorithm ensures the system never enters an unsafe state. A state is safe if the system can allocate resources to each process (up to its maximum) in some specified order without deadlocking. Safety invariant: Allocation + Need <= Max resources.",
      topicId: 'top-5'
    },
    {
      id: 'pass-4',
      documentId: 'doc-2',
      documentTitle: 'Tanenbaum (Ch. 6 Excerpt)',
      pageNumber: 2,
      sectionTitle: '6.2 The Dining Philosophers Problem & Circular Wait',
      quote: 'Deadlock requires circular wait across non-preemptible resources; breaking the cycle prevents deadlocks completely. Consider five philosophers: if each picks up the left chopstick simultaneously, circular waiting causes total halt.',
      topicId: 'top-1'
    },
    {
      id: 'pass-5',
      documentId: 'doc-3',
      documentTitle: 'CS301 Lecture Slides',
      pageNumber: 3,
      sectionTitle: 'Slide 3: Summary of the Four Coffman Conditions',
      quote: 'Remember the acronym M-H-N-C: Mutual Exclusion, Hold and Wait, No Preemption, Circular Wait. ALL 4 conditions MUST be simultaneously true for deadlock to manifest.',
      topicId: 'top-1'
    },
    {
      id: 'pass-6',
      documentId: 'doc-3',
      documentTitle: 'CS301 Lecture Slides',
      pageNumber: 5,
      sectionTitle: 'Slide 5: Starvation Mitigation via Aging',
      quote: 'Aging gradually increases the priority of processes that wait in the system for a long time, ensuring low-priority runnable threads eventually execute.',
      topicId: 'top-3'
    }
  ],
  topics: [
    {
      id: 'top-1',
      title: 'Deadlock Characterization (Coffman Conditions)',
      unit: 'Unit 3: Concurrency Control',
      evidenceStatus: 'Evidence found', // 'Evidence found' | 'Limited evidence' | 'No matching evidence found'
      understandingStatus: 'Review needed', // 'Not assessed' | 'Needs practice' | 'Review needed'
      matchedPassageIds: ['pass-1', 'pass-4', 'pass-5'],
      prerequisites: ['top-2']
    },
    {
      id: 'top-2',
      title: 'Mutual Exclusion & Critical Sections',
      unit: 'Unit 2: Synchronization Primitives',
      evidenceStatus: 'Evidence found',
      understandingStatus: 'Not assessed',
      matchedPassageIds: ['pass-1'],
      prerequisites: []
    },
    {
      id: 'top-3',
      title: 'Deadlock vs Starvation',
      unit: 'Unit 3: Concurrency Control',
      evidenceStatus: 'Evidence found',
      understandingStatus: 'Needs practice',
      matchedPassageIds: ['pass-2', 'pass-6'],
      prerequisites: ['top-1']
    },
    {
      id: 'top-4',
      title: 'Resource-Allocation Graphs & Cycle Detection',
      unit: 'Unit 3: Concurrency Control',
      evidenceStatus: 'Evidence found',
      understandingStatus: 'Needs practice',
      matchedPassageIds: ['pass-2'],
      prerequisites: ['top-1']
    },
    {
      id: 'top-5',
      title: "Banker's Algorithm & Safe States",
      unit: 'Unit 4: Deadlock Avoidance',
      evidenceStatus: 'Evidence found',
      understandingStatus: 'Not assessed',
      matchedPassageIds: ['pass-3'],
      prerequisites: ['top-4']
    },
    {
      id: 'top-6',
      title: 'Deadlock Detection & Recovery Strategies',
      unit: 'Unit 4: Deadlock Avoidance',
      evidenceStatus: 'Evidence found',
      understandingStatus: 'Not assessed',
      matchedPassageIds: ['pass-4'],
      prerequisites: ['top-1']
    },
    {
      id: 'top-7',
      title: 'Paging & Memory Allocation',
      unit: 'Unit 5: Memory Management',
      evidenceStatus: 'Limited evidence',
      understandingStatus: 'Needs practice',
      matchedPassageIds: [],
      prerequisites: []
    },
    {
      id: 'top-8',
      title: 'Segmentation vs Paging Trade-offs',
      unit: 'Unit 5: Memory Management',
      evidenceStatus: 'Limited evidence',
      understandingStatus: 'Not assessed',
      matchedPassageIds: [],
      prerequisites: ['top-7']
    },
    {
      id: 'top-9',
      title: 'Thrashing & Working Set Model',
      unit: 'Unit 6: Virtual Memory',
      evidenceStatus: 'No matching evidence found',
      understandingStatus: 'Not assessed',
      matchedPassageIds: [],
      prerequisites: ['top-7']
    },
    {
      id: 'top-10',
      title: 'Distributed Deadlock Detection',
      unit: 'Unit 6: Virtual Memory',
      evidenceStatus: 'No matching evidence found',
      understandingStatus: 'Not assessed',
      matchedPassageIds: [],
      prerequisites: ['top-5']
    }
  ],
  misconceptions: [
    {
      id: 'misc-1',
      topicId: 'top-3',
      topicTitle: 'Deadlock vs Starvation',
      observedIssue: 'Conflating circular wait with priority starvation',
      originalExplanation: 'Deadlock and starvation are basically the same thing because both make threads stop running forever.',
      feedback: 'Deadlock requires a cyclic dependency where no thread can make progress without external intervention. Starvation is indefinite postponement caused by priority scheduling where higher-priority tasks continue executing.',
      sourceCitations: [
        { documentTitle: 'Silberschatz (Ch. 8)', pageNumber: 3, quote: 'A deadlock occurs when every process in a set is waiting for an event only another process can cause. Starvation is postponement due to priority bias.' }
      ],
      status: 'Review needed', // 'Open' | 'Improving' | 'Review needed' | 'Student-marked complete'
      attemptsCount: 2,
      lastAttemptDate: '2 days ago'
    },
    {
      id: 'misc-2',
      topicId: 'top-1',
      topicTitle: 'Deadlock Characterization',
      observedIssue: 'Assuming single-unit resource cycles only cause potential deadlock',
      originalExplanation: 'Even if each resource only has 1 instance, a cycle in the resource allocation graph does not guarantee a deadlock.',
      feedback: 'If every resource type has exactly one instance, then a cycle in the resource allocation graph is a necessary AND sufficient condition for deadlock (guaranteed deadlock). Cycles only indicate potential deadlock when multiple instances exist.',
      sourceCitations: [
        { documentTitle: 'Silberschatz (Ch. 8)', pageNumber: 3, quote: 'If each resource type has only one instance, then a cycle implies deadlock.' }
      ],
      status: 'Open',
      attemptsCount: 1,
      lastAttemptDate: 'Yesterday'
    }
  ],
  revisionTasks: [
    {
      id: 'task-1',
      topicId: 'top-3',
      title: 'Review Starvation vs Deadlock Distinction',
      estimatedMinutes: 25,
      priority: 'high', // 'high' | 'medium' | 'low'
      completed: false,
      scheduledDate: 'Today',
      reason: 'Target open misconception #1 before midterm',
      pastPaperQuestionId: 'CS301-2024-Q3'
    },
    {
      id: 'task-2',
      topicId: 'top-1',
      title: 'Practice Coffman Condition Scenarios',
      estimatedMinutes: 30,
      priority: 'high',
      completed: false,
      scheduledDate: 'Today',
      reason: 'Topic marked: Review needed',
      pastPaperQuestionId: 'CS301-2023-Q5'
    },
    {
      id: 'task-3',
      topicId: 'top-4',
      title: 'Resource Allocation Graph Cycle Workouts',
      estimatedMinutes: 20,
      priority: 'medium',
      completed: false,
      scheduledDate: 'Tomorrow',
      reason: 'Topic marked: Needs practice',
      pastPaperQuestionId: 'CS301-2024-Q3'
    },
    {
      id: 'task-4',
      topicId: 'top-7',
      title: 'Upload / Review Paging Reference Materials',
      estimatedMinutes: 35,
      priority: 'medium',
      completed: false,
      scheduledDate: 'Nov 14',
      reason: 'Topic has limited evidence in materials',
      pastPaperQuestionId: null
    },
    {
      id: 'task-5',
      topicId: 'top-5',
      title: "Banker's Algorithm Safety Vector Simulation",
      estimatedMinutes: 40,
      priority: 'low',
      completed: true,
      scheduledDate: 'Completed',
      reason: 'Routine syllabus coverage',
      pastPaperQuestionId: 'CS301-2022-Q2'
    }
  ],
  pastPaperQuestions: [
    {
      id: 'CS301-2024-Q3',
      year: 2024,
      semester: 'Spring',
      questionText: 'Differentiate between Deadlock and Starvation with respect to operating system scheduler behavior. Draw a resource-allocation graph with 3 processes demonstrating circular wait. (8 Marks)',
      topicId: 'top-3',
      topicTitle: 'Deadlock vs Starvation',
      frequencyBadge: 'Appeared in 4 of last 5 semester exams',
      frequencyCount: 4,
      citationPassageId: 'pass-2'
    },
    {
      id: 'CS301-2023-Q5',
      year: 2023,
      semester: 'Fall',
      questionText: 'State and explain the four Coffman conditions necessary for deadlock. Explain how eliminating circular wait through resource ordering prevents deadlock. (6 Marks)',
      topicId: 'top-1',
      topicTitle: 'Deadlock Characterization',
      frequencyBadge: 'Core fundamental question (100% syllabus occurrence)',
      frequencyCount: 5,
      citationPassageId: 'pass-1'
    },
    {
      id: 'CS301-2022-Q2',
      year: 2022,
      semester: 'Spring',
      questionText: "Given 5 processes and 3 resource types A, B, C, execute the Banker's Algorithm safety check. Determine if state <Allocation, Max, Available> is safe. (10 Marks)",
      topicId: 'top-5',
      topicTitle: "Banker's Algorithm & Safe States",
      frequencyBadge: 'Appeared in 3 of last 5 semester exams',
      frequencyCount: 3,
      citationPassageId: 'pass-3'
    }
  ],
  understandingAttempts: [
    {
      id: 'att-1',
      topicId: 'top-3',
      topicTitle: 'Deadlock vs Starvation',
      timestamp: '2026-10-11T14:20:00Z',
      userExplanation: 'Deadlock and starvation are basically the same thing because both make threads stop running forever.',
      score: 1, // out of 3
      rubric: {
        conceptualAccuracy: 'Needs correction: conflates cyclic blocked dependency with priority starvation.',
        essentialPoints: 'Missed circular wait; missed scheduling postponement distinction.',
        reasoning: 'Superficial comparison based only on symptom of thread waiting.'
      },
      missingPoints: [
        'Failed to state that deadlock involves cyclic waiting among processes holding resources.',
        'Failed to mention that starvation occurs when runnable threads are postponed due to unfair priority scheduling.'
      ],
      possibleMisconceptions: [
        'Believing thread waiting always means the system is in deadlock.'
      ],
      revised: false
    }
  ],
  bookmarks: [
    { id: 'bm-1', targetType: 'document', targetId: 'doc-1', createdAt: '2026-10-02' },
    { id: 'bm-2', targetType: 'passage', targetId: 'pass-2', createdAt: '2026-10-11' }
  ]
};

// Safe State Manager Class
class WorkspaceStore {
  constructor() {
    this.listeners = new Set();
    this.state = this.loadInitialState();
  }

  loadInitialState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.course && parsed.topics) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[Syllora State] Failed to load localStorage, falling back to seed data:', e);
    }
    // Return cloned seed data
    return JSON.parse(JSON.stringify(SEED_DATA));
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('[Syllora State] Storage write failed (quota exceeded or incognito):', e);
    }
    this.notify();
  }

  notify() {
    this.listeners.forEach((listener) => {
      try {
        listener(this.state);
      } catch (err) {
        console.error('[Syllora State] Listener error:', err);
      }
    });
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
    const s = this.state;
    const nonComparisonDocs = s.documents.filter(d => !d.isComparisonOnly);
    const topicsWithEvidence = s.topics.filter(t => t.evidenceStatus === 'Evidence found');
    const needsPractice = s.topics.filter(t => t.understandingStatus === 'Needs practice');
    const openMisconceptions = s.misconceptions.filter(m => m.status !== 'Student-marked complete');
    const pendingTasks = s.revisionTasks.filter(t => !t.completed);

    return {
      totalDocs: nonComparisonDocs.length,
      indexedDocs: nonComparisonDocs.filter(d => d.status === 'indexed').length,
      localPreviewDocs: nonComparisonDocs.filter(d => d.status === 'local_preview').length,
      totalTopics: s.topics.length,
      topicsWithEvidenceCount: topicsWithEvidence.length,
      evidenceCoveragePct: Math.round((topicsWithEvidence.length / s.topics.length) * 100),
      needsPracticeCount: needsPractice.length,
      openMisconceptionsCount: openMisconceptions.length,
      pendingTasksCount: pendingTasks.length,
      totalTasksCount: s.revisionTasks.length
    };
  }

  // --- Document Operations ---
  addDocument(doc) {
    this.state.documents.unshift(doc);
    this.save();
  }

  deleteDocument(docId) {
    this.state.documents = this.state.documents.filter(d => d.id !== docId);
    // Clean up passages to avoid dangling references
    this.state.passages = this.state.passages.filter(p => p.documentId !== docId);
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

  // --- Full Demo Reset ---
  resetWorkspaceData() {
    this.state = JSON.parse(JSON.stringify(SEED_DATA));
    this.save();
  }
}

// Global Singleton Instance
export const workspaceStore = new WorkspaceStore();
