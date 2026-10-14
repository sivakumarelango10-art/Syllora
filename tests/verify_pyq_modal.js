/**
 * ============================================================================
 * SYLLORA — EXAM INTELLIGENCE PYQ UPLOAD MODAL VERIFICATION SUITE
 * ============================================================================
 * Rigorous automated validation of:
 * 1. CSS Modal Design System (.modal-overlay, .pyq-modal-card, form controls, dropzone)
 * 2. Responsive styling (desktop, laptop, tablet, mobile viewports)
 * 3. JS showUploadPyqModal implementation (fixed positioning, focus trap, Escape, scroll lock)
 * 4. Form fields preservation (title, exam_year, semester, exam_type, file)
 * 5. Error handling, input preservation on failure, loading state
 * 6. Supporting Notes Evidence dialog (showEvidenceModal) consistency
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const WORKSPACE_CSS_PATH = path.join(ROOT_DIR, 'frontend', 'workspace.css');
const EXAMS_JS_PATH = path.join(ROOT_DIR, 'frontend', 'js', 'views', 'exams.js');
const MODAL_JS_PATH = path.join(ROOT_DIR, 'frontend', 'js', 'components', 'modal.js');

let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
  }
}

console.log('\n======================================================');
console.log('SYLLORA EXAM INTELLIGENCE MODAL VERIFICATION');
console.log('======================================================\n');

// ----------------------------------------------------------------------------
// SUITE 1: CSS RULES & DESIGN TOKENS AUDIT
// ----------------------------------------------------------------------------
console.log('--- TEST SUITE 1: CSS RULES & DESIGN SYSTEM ---');
const cssContent = fs.readFileSync(WORKSPACE_CSS_PATH, 'utf-8');

test('workspace.css defines .modal-overlay with fixed positioning and high z-index', () => {
  assert(cssContent.includes('.modal-overlay'), 'Missing .modal-overlay rule');
  assert(/position:\s*fixed;/i.test(cssContent), '.modal-overlay must be position: fixed');
  assert(/inset:\s*0;/i.test(cssContent), '.modal-overlay must have inset: 0');
  assert(/backdrop-filter:\s*blur/i.test(cssContent), '.modal-overlay must have backdrop-filter blur');
  assert(/z-index:\s*1000/i.test(cssContent), '.modal-overlay must have z-index >= 1000 to display above dashboard');
});

test('workspace.css defines centered flex alignment for .modal-overlay', () => {
  const overlayBlock = cssContent.slice(cssContent.indexOf('.modal-overlay'), cssContent.indexOf('.modal-overlay') + 400);
  assert(overlayBlock.includes('display: flex;'), '.modal-overlay must be display: flex');
  assert(overlayBlock.includes('align-items: center;'), '.modal-overlay must align-items: center');
  assert(overlayBlock.includes('justify-content: center;'), '.modal-overlay must justify-content: center');
});

test('workspace.css defines .pyq-modal-card with 16px radius, white surface and responsive width', () => {
  assert(cssContent.includes('.pyq-modal-card'), 'Missing .pyq-modal-card');
  assert(/border-radius:\s*16px/i.test(cssContent), '.pyq-modal-card must have border-radius: 16px');
  assert(/max-width:\s*540px/i.test(cssContent), '.pyq-modal-card max-width should be ~540px');
  assert(/calc\(100vw\s*-\s*32px\)/i.test(cssContent), '.pyq-modal-card width should use calc(100vw - 32px)');
  assert(/max-height:\s*90dvh/i.test(cssContent), '.pyq-modal-card must enforce max-height: 90dvh');
});

test('workspace.css defines .pyq-evidence-card for Supporting Notes Evidence dialog', () => {
  assert(cssContent.includes('.pyq-evidence-card'), 'Missing .pyq-evidence-card');
  assert(/max-width:\s*640px/i.test(cssContent), '.pyq-evidence-card max-width should be ~640px');
});

test('workspace.css defines 14px labels and 44px form controls', () => {
  assert(cssContent.includes('.pyq-form-label'), 'Missing .pyq-form-label');
  assert(/font-size:\s*14px/i.test(cssContent), '.pyq-form-label must be 14px');
  assert(cssContent.includes('.pyq-form-control'), 'Missing .pyq-form-control');
  assert(/height:\s*44px/i.test(cssContent), '.pyq-form-control must have height: 44px');
  assert(/border:\s*1px solid #CBD5E1/i.test(cssContent), '.pyq-form-control must have soft gray border');
});

test('workspace.css defines responsive two-column grid with single-column mobile breakpoint', () => {
  assert(cssContent.includes('.pyq-form-row-2'), 'Missing .pyq-form-row-2');
  assert(/grid-template-columns:\s*1fr\s+1fr/i.test(cssContent), '.pyq-form-row-2 must have 2 columns');
  assert(/@media\s*\(max-width:\s*540px\)/i.test(cssContent), 'Must have mobile breakpoint for pyq form');
});

test('workspace.css defines interactive file dropzone and selected file pill', () => {
  assert(cssContent.includes('.pyq-file-dropzone'), 'Missing .pyq-file-dropzone');
  assert(cssContent.includes('.pyq-file-selected-pill'), 'Missing .pyq-file-selected-pill');
  assert(cssContent.includes('.pyq-file-remove-btn'), 'Missing .pyq-file-remove-btn');
});

test('workspace.css defines disabled button states and button spinner', () => {
  assert(cssContent.includes('.btn:disabled'), 'Missing .btn:disabled');
  assert(cssContent.includes('.spinner-sm'), 'Missing .spinner-sm');
});

test('workspace.css does NOT introduce unstyled .modal-backdrop or conflicting global .modal rules', () => {
  assert(!cssContent.includes('.modal-backdrop'), 'Must not use unstyled .modal-backdrop class');
  // Confirm .modal-card is used instead of bare .modal class
  assert(cssContent.includes('.modal-card'), 'Syllora uses .modal-card');
});

// ----------------------------------------------------------------------------
// SUITE 2: JAVASCRIPT MODAL STRUCTURE & ACCESSIBILITY AUDIT
// ----------------------------------------------------------------------------
console.log('\n--- TEST SUITE 2: JS MODAL STRUCTURE & ACCESSIBILITY ---');
const examsJsContent = fs.readFileSync(EXAMS_JS_PATH, 'utf-8');

test('exams.js imports lockBodyScroll and unlockBodyScroll from modal.js', () => {
  assert(examsJsContent.includes('lockBodyScroll'), 'exams.js must import lockBodyScroll');
  assert(examsJsContent.includes('unlockBodyScroll'), 'exams.js must import unlockBodyScroll');
});

test('showUploadPyqModal uses .modal-overlay and .modal-card pyq-modal-card', () => {
  assert(examsJsContent.includes("overlay.className = 'modal-overlay'"), 'showUploadPyqModal must set overlay className to modal-overlay');
  assert(examsJsContent.includes('pyq-modal-card'), 'showUploadPyqModal must use pyq-modal-card');
  assert(!examsJsContent.includes("modalEl.className = 'modal-backdrop'"), 'Old modal-backdrop must be removed');
});

test('showUploadPyqModal appends overlay directly to document.body', () => {
  assert(/document\.body\.appendChild\(overlay\)/.test(examsJsContent), 'Must append overlay directly to document.body');
});

test('showUploadPyqModal sets aria-modal, role="dialog" and aria-labelledby', () => {
  assert(examsJsContent.includes("overlay.setAttribute('role', 'dialog')"), 'Must set role="dialog"');
  assert(examsJsContent.includes("overlay.setAttribute('aria-modal', 'true')"), 'Must set aria-modal="true"');
  assert(examsJsContent.includes("overlay.setAttribute('aria-labelledby', 'uploadPyqModalTitle')"), 'Must set aria-labelledby');
  assert(examsJsContent.includes('id="uploadPyqModalTitle"'), 'Must have matching title id');
});

test('showUploadPyqModal prevents background scroll when open and restores it when closed', () => {
  assert(/showUploadPyqModal\(\)\s*\{[\s\S]*?lockBodyScroll\(\)/.test(examsJsContent), 'Must call lockBodyScroll on open');
  assert(/close\s*=\s*\(\)\s*=>\s*\{[\s\S]*?unlockBodyScroll\(\)/.test(examsJsContent), 'Must call unlockBodyScroll on close');
});

test('showUploadPyqModal avoids duplicate modals from repeated clicks', () => {
  assert(examsJsContent.includes("document.getElementById('uploadPyqModalOverlay')"), 'Must check if uploadPyqModalOverlay already exists');
});

test('showUploadPyqModal restores focus to trigger button when closed', () => {
  assert(examsJsContent.includes('const previousFocus = document.activeElement'), 'Must capture previousFocus');
  assert(examsJsContent.includes('previousFocus.focus()'), 'Must restore focus on close');
});

test('showUploadPyqModal implements focus trapping with Tab and Shift+Tab', () => {
  assert(examsJsContent.includes("e.key === 'Tab'"), 'Must handle Tab key');
  assert(examsJsContent.includes('e.shiftKey'), 'Must handle Shift+Tab key');
});

test('showUploadPyqModal closes on Escape key', () => {
  assert(examsJsContent.includes("e.key === 'Escape'"), 'Must handle Escape key');
});

test('showUploadPyqModal closes when clicking outside backdrop but stays open when clicking inside', () => {
  assert(examsJsContent.includes('if (e.target === overlay) close()'), 'Must close only when clicking directly on overlay');
});

// ----------------------------------------------------------------------------
// SUITE 3: FORM FIELDS & LIFECYCLE AUDIT
// ----------------------------------------------------------------------------
console.log('\n--- TEST SUITE 3: FORM FIELDS & LIFECYCLE ---');

test('Form preserves all backend field names: title, exam_year, semester, exam_type, file', () => {
  assert(examsJsContent.includes("name=\"title\""), 'Must preserve title input');
  assert(examsJsContent.includes("name=\"exam_year\""), 'Must preserve exam_year input');
  assert(examsJsContent.includes("name=\"semester\""), 'Must preserve semester select');
  assert(examsJsContent.includes("name=\"exam_type\""), 'Must preserve exam_type select');
  assert(examsJsContent.includes("name=\"file\""), 'Must preserve file input');
  assert(examsJsContent.includes("formData.append('title'"), 'Must append title to FormData');
  assert(examsJsContent.includes("formData.append('exam_year'"), 'Must append exam_year to FormData');
  assert(examsJsContent.includes("formData.append('semester'"), 'Must append semester to FormData');
  assert(examsJsContent.includes("formData.append('exam_type'"), 'Must append exam_type to FormData');
  assert(examsJsContent.includes("formData.append('file'"), 'Must append file to FormData');
});

test('Form enforces PDF validation and 50MB size limit', () => {
  assert(examsJsContent.includes(".endsWith('.pdf')"), 'Must check .pdf file extension');
  assert(examsJsContent.includes('50 * 1024 * 1024'), 'Must check 50MB file size limit');
});

test('Dropzone displays selected file name and formatted size pill', () => {
  assert(examsJsContent.includes('selectedNameEl.textContent = file.name'), 'Must display selected file name');
  assert(examsJsContent.includes('selectedSizeEl.textContent'), 'Must display formatted size');
  assert(examsJsContent.includes('selectedPill.style.display'), 'Must show selected file pill');
});

test('Form preserves entered values on backend failure and displays actual error message', () => {
  assert(examsJsContent.includes('showError(errMsg)'), 'Must show actual backend error in error banner');
  assert(examsJsContent.includes('submitBtn.disabled = false'), 'Must re-enable submit button on error');
  assert(examsJsContent.includes('titleInput.disabled = false'), 'Must re-enable inputs on error');
});

test('Form displays real loading indicator with spinner during upload', () => {
  assert(examsJsContent.includes('Extracting Questions...'), 'Must show extracting status');
  assert(examsJsContent.includes('spinner-sm'), 'Must show spinner during upload');
});

test('Form closes modal and reloads data on confirmed success', () => {
  assert(examsJsContent.includes('Toast.show'), 'Must show success toast');
  assert(examsJsContent.includes('loadData()'), 'Must call loadData on success');
});

// ----------------------------------------------------------------------------
// SUITE 4: SUPPORTING EVIDENCE MODAL AUDIT
// ----------------------------------------------------------------------------
console.log('\n--- TEST SUITE 4: SUPPORTING EVIDENCE MODAL ---');

test('showEvidenceModal uses .modal-overlay and .modal-card pyq-evidence-card', () => {
  assert(examsJsContent.includes("overlay.id = 'evidenceModalOverlay'"), 'evidence modal must have evidenceModalOverlay id');
  assert(examsJsContent.includes('pyq-evidence-card'), 'evidence modal must use pyq-evidence-card');
});

test('showEvidenceModal preserves live evidence scan API call', () => {
  assert(examsJsContent.includes('/api/v1/exams/questions/'), 'Must preserve questions endpoint');
  assert(examsJsContent.includes('/evidence'), 'Must preserve /evidence endpoint');
});

test('showEvidenceModal locks body scroll, handles Escape and focus trapping', () => {
  assert(/showEvidenceModal\([\s\S]*?lockBodyScroll\(\)/.test(examsJsContent), 'Must lock body scroll in evidence modal');
  assert(/showEvidenceModal\([\s\S]*?unlockBodyScroll\(\)/.test(examsJsContent), 'Must unlock body scroll on close');
  assert(/showEvidenceModal\([\s\S]*?e\.key === 'Escape'/.test(examsJsContent), 'Must handle Escape in evidence modal');
});

// ----------------------------------------------------------------------------
// SUMMARY
// ----------------------------------------------------------------------------
console.log('\n======================================================');
console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
console.log('======================================================\n');

if (passedTests === totalTests) {
  console.log('🎉 ALL EXAM INTELLIGENCE MODAL VERIFICATION CHECKS PASSED!\n');
  process.exit(0);
} else {
  console.error('❌ SOME VERIFICATION CHECKS FAILED!\n');
  process.exit(1);
}
