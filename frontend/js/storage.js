/**
 * ============================================================================
 * SYLLORA BROWSER-LOCAL FILE STORAGE (IndexedDB)
 * ============================================================================
 * Provides persistent browser-local storage for uploaded PDF File/Blob data,
 * keeping large binary payloads strictly separate from serializable state.
 *
 * Responsibilities:
 * - Stores PDF File/Blob in IndexedDB keyed by stable document ID
 * - Manages object URL creation and revocation lifecycles
 * - Handles browser storage failures and missing blobs gracefully
 * - Cleans up blobs upon document deletion or full workspace reset
 */

const DB_NAME = 'SylloraFilesDB';
const DB_VERSION = 1;
const STORE_NAME = 'pdf_blobs';

// Map of active object URLs created for open/previewed documents
const activeObjectUrls = new Map();

/**
 * Open or initialize the Syllora IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
export function openFilesDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this browser.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open files database'));
  });
}

/**
 * Check if IndexedDB is available in the current environment
 * @returns {boolean}
 */
export function isStorageSupported() {
  return typeof window !== 'undefined' && !!window.indexedDB;
}

/**
 * Store a PDF Blob or File in IndexedDB
 * @param {string} docId - Stable document identifier
 * @param {Blob|File} blob - PDF binary data
 * @returns {Promise<void>}
 */
export async function savePdfBlob(docId, blob) {
  if (!isStorageSupported()) {
    console.warn('[Storage] IndexedDB not available; file will only be visible in memory.');
    return;
  }

  try {
    const db = await openFilesDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record = {
        id: docId,
        blob: blob,
        name: blob.name || 'document.pdf',
        type: blob.type || 'application/pdf',
        size: blob.size,
        updatedAt: Date.now()
      };
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Failed to store PDF blob'));
    });
  } catch (err) {
    console.error(`[Storage] Error saving PDF for ${docId}:`, err);
    throw err;
  }
}

/**
 * Retrieve a stored PDF Blob from IndexedDB
 * @param {string} docId - Document ID
 * @returns {Promise<Blob|null>}
 */
export async function getPdfBlob(docId) {
  if (!isStorageSupported()) return null;

  try {
    const db = await openFilesDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(docId);
      req.onsuccess = () => {
        if (req.result && req.result.blob) {
          resolve(req.result.blob);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error || new Error('Failed to retrieve PDF blob'));
    });
  } catch (err) {
    console.warn(`[Storage] Could not retrieve PDF blob for ${docId}:`, err);
    return null;
  }
}

/**
 * Delete a stored PDF Blob from IndexedDB
 * @param {string} docId - Document ID
 * @returns {Promise<void>}
 */
export async function deletePdfBlob(docId) {
  revokeManagedBlobUrl(docId);

  if (!isStorageSupported()) return;

  try {
    const db = await openFilesDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(docId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Failed to delete PDF blob'));
    });
  } catch (err) {
    console.warn(`[Storage] Could not delete PDF blob for ${docId}:`, err);
  }
}

/**
 * Clear all stored PDF blobs (used on explicit workspace reset)
 * @returns {Promise<void>}
 */
export async function clearAllPdfBlobs() {
  // Revoke all active object URLs
  activeObjectUrls.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  });
  activeObjectUrls.clear();

  if (!isStorageSupported()) return;

  try {
    const db = await openFilesDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Failed to clear PDF store'));
    });
  } catch (err) {
    console.warn('[Storage] Could not clear PDF store:', err);
  }
}

/**
 * Get or create an active object URL for a stored document
 * @param {string} docId - Document ID
 * @param {Blob|File} [fallbackBlob] - In-memory blob if already available
 * @returns {Promise<string|null>} Resolves with a usable blob: URL or null
 */
export async function getManagedBlobUrl(docId, fallbackBlob = null) {
  if (activeObjectUrls.has(docId)) {
    return activeObjectUrls.get(docId);
  }

  let blob = fallbackBlob;
  if (!blob) {
    blob = await getPdfBlob(docId);
  }

  if (blob) {
    try {
      const url = URL.createObjectURL(blob);
      activeObjectUrls.set(docId, url);
      return url;
    } catch (err) {
      console.error(`[Storage] URL.createObjectURL failed for ${docId}:`, err);
      return null;
    }
  }

  return null;
}

/**
 * Revoke an active object URL when document is closed or deleted
 * @param {string} docId - Document ID
 */
export function revokeManagedBlobUrl(docId) {
  if (activeObjectUrls.has(docId)) {
    const url = activeObjectUrls.get(docId);
    try {
      URL.revokeObjectURL(url);
    } catch {}
    activeObjectUrls.delete(docId);
  }
}
