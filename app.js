/**
 * Syllora Authentication Engine
 * Orchestrates:
 * 1. Client-side input validation (email syntax, password min 8 chars)
 * 2. Mock 1.5s login (demo@syllora.com / password123 succeeds; others trigger gentle shake error)
 * 3. Button morphing: Idle -> Loading Spinner -> Morphing Checkmark
 * 4. Password show/hide visibility toggle
 * 5. Sign In <-> Sign Up mode switching (revealing Full Name for new users)
 * 6. Quick Demo Fill helper
 * 7. Recovery modal and toast notification system
 */

(function () {
  'use strict';

  // --- DOM Elements ---
  const loginForm = document.getElementById('loginForm');
  const loginCard = document.getElementById('loginCard');
  const loginBtn = document.getElementById('loginBtn');
  const btnCaption = document.getElementById('btnCaption');

  const emailFieldWrapper = document.getElementById('emailFieldWrapper');
  const emailInput = document.getElementById('emailInput');
  const emailError = document.getElementById('emailError');

  const passwordFieldWrapper = document.getElementById('passwordFieldWrapper');
  const passwordInput = document.getElementById('passwordInput');
  const passwordError = document.getElementById('passwordError');
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  const eyeShow = togglePasswordBtn.querySelector('.eye-show');
  const eyeHide = togglePasswordBtn.querySelector('.eye-hide');

  const nameFieldWrapper = document.getElementById('nameFieldWrapper');
  const nameInput = document.getElementById('nameInput');
  const nameError = document.getElementById('nameError');

  const formHeading = document.getElementById('formHeading');
  const formSubtext = document.getElementById('formSubtext');
  const toggleModeBtn = document.getElementById('toggleModeBtn');
  const footerPrompt = document.getElementById('footerPrompt');
  const auxRow = document.getElementById('auxRow');

  const btnDemoFill = document.getElementById('btnDemoFill');
  const googleLoginBtn = document.getElementById('googleLoginBtn');

  // Recovery Modal
  const forgotPasswordLink = document.getElementById('forgotPasswordLink');
  const recoveryModal = document.getElementById('recoveryModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const recoveryForm = document.getElementById('recoveryForm');
  const recoveryEmailInput = document.getElementById('recoveryEmailInput');

  // Toast Shelf
  const toastShelf = document.getElementById('toastShelf');

  // State
  let currentMode = 'login'; // 'login' | 'signup'
  let isSubmitting = false;

  // --------------------------------------------------------------------------
  // 1. Validation Utilities
  // --------------------------------------------------------------------------
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  function setFieldError(wrapper, errorEl, message) {
    wrapper.classList.add('is-invalid');
    errorEl.textContent = message;
  }

  function clearFieldError(wrapper, errorEl) {
    wrapper.classList.remove('is-invalid');
    errorEl.textContent = '';
  }

  function clearAllErrors() {
    clearFieldError(emailFieldWrapper, emailError);
    clearFieldError(passwordFieldWrapper, passwordError);
    if (nameFieldWrapper) clearFieldError(nameFieldWrapper, nameError);
  }

  // Clear errors when typing
  emailInput.addEventListener('input', () => clearFieldError(emailFieldWrapper, emailError));
  passwordInput.addEventListener('input', () => clearFieldError(passwordFieldWrapper, passwordError));
  if (nameInput) nameInput.addEventListener('input', () => clearFieldError(nameFieldWrapper, nameError));

  // --------------------------------------------------------------------------
  // 2. Password Visibility Toggle
  // --------------------------------------------------------------------------
  togglePasswordBtn.addEventListener('click', () => {
    const isPassword = passwordInput.getAttribute('type') === 'password';
    passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
    eyeShow.style.display = isPassword ? 'none' : 'block';
    eyeHide.style.display = isPassword ? 'block' : 'none';
    togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    passwordInput.focus();
  });

  // --------------------------------------------------------------------------
  // 3. Mode Toggle (Log In <-> Sign Up with Full Name)
  // --------------------------------------------------------------------------
  toggleModeBtn.addEventListener('click', () => {
    clearAllErrors();
    if (currentMode === 'login') {
      currentMode = 'signup';
      nameFieldWrapper.style.display = 'flex';
      formHeading.textContent = 'Create your account';
      formSubtext.textContent = 'Sign up to start your learning journey';
      btnCaption.textContent = 'Create account';
      footerPrompt.textContent = 'Already have an account?';
      toggleModeBtn.textContent = 'Log in';
      auxRow.style.display = 'none';
      setTimeout(() => nameInput.focus(), 60);
    } else {
      currentMode = 'login';
      nameFieldWrapper.style.display = 'none';
      formHeading.textContent = 'Welcome back';
      formSubtext.textContent = 'Log in to continue learning';
      btnCaption.textContent = 'Log in';
      footerPrompt.textContent = "Don't have an account?";
      toggleModeBtn.textContent = 'Sign up';
      auxRow.style.display = 'flex';
      setTimeout(() => emailInput.focus(), 60);
    }
  });

  // --------------------------------------------------------------------------
  // 4. Quick Demo Fill (demo@syllora.com / password123)
  // --------------------------------------------------------------------------
  btnDemoFill.addEventListener('click', () => {
    if (currentMode === 'signup') {
      // Switch back to login for demo credentials
      toggleModeBtn.click();
    }
    clearAllErrors();
    emailInput.value = 'demo@syllora.com';
    passwordInput.value = 'password123';
    showToast('Demo credentials populated (demo@syllora.com / password123)', 'info');
    emailInput.focus();
  });

  // --------------------------------------------------------------------------
  // 5. Form Submission & Mock Authentication (1.5s timeout)
  // --------------------------------------------------------------------------
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    clearAllErrors();
    let hasValidationFault = false;

    // Validate Full Name if Sign Up
    if (currentMode === 'signup') {
      const nameVal = nameInput.value.trim();
      if (!nameVal) {
        setFieldError(nameFieldWrapper, nameError, 'Please enter your full name.');
        hasValidationFault = true;
      } else if (nameVal.length < 2) {
        setFieldError(nameFieldWrapper, nameError, 'Name must be at least 2 characters.');
        hasValidationFault = true;
      }
    }

    // Validate Email
    const emailVal = emailInput.value.trim();
    if (!emailVal) {
      setFieldError(emailFieldWrapper, emailError, 'Email address is required.');
      hasValidationFault = true;
    } else if (!isValidEmail(emailVal)) {
      setFieldError(emailFieldWrapper, emailError, 'Please enter a valid email format.');
      hasValidationFault = true;
    }

    // Validate Password
    const passwordVal = passwordInput.value;
    if (!passwordVal) {
      setFieldError(passwordFieldWrapper, passwordError, 'Password is required.');
      hasValidationFault = true;
    } else if (passwordVal.length < 8) {
      setFieldError(passwordFieldWrapper, passwordError, 'Password must be at least 8 characters.');
      hasValidationFault = true;
    }

    if (hasValidationFault) {
      triggerErrorShake();
      return;
    }

    // Begin Loading State (Button shrinks into circular spinner)
    isSubmitting = true;
    loginBtn.classList.add('is-loading');
    loginBtn.disabled = true;

    // 1.5s Mock Verification
    setTimeout(() => {
      // If in Sign Up mode, any valid input succeeds!
      // If in Login mode: demo@syllora.com / password123 succeeds; any other shows error!
      const isLoginSuccess = (currentMode === 'login' && emailVal === 'demo@syllora.com' && passwordVal === 'password123') || (currentMode === 'signup');

      if (isLoginSuccess) {
        // --- Success State ---
        // Spinner morphs into white drawing checkmark
        loginBtn.classList.remove('is-loading');
        loginBtn.classList.add('is-success');

        const successMessage = currentMode === 'signup' 
          ? `Account created for ${nameInput.value.trim()}! Welcome to Syllora.` 
          : 'Welcome back! Logged in successfully.';
        
        showToast(successMessage, 'success');

        // Simulate seamless redirect after checkmark draws
        setTimeout(() => {
          document.body.style.transition = 'opacity 500ms ease';
          document.body.style.opacity = '0.4';
          showToast('Redirecting to your course dashboard...', 'info');
          
          setTimeout(() => {
            document.body.style.opacity = '1';
            loginBtn.classList.remove('is-success');
            loginBtn.disabled = false;
            isSubmitting = false;
          }, 1800);
        }, 900);

      } else {
        // --- Error State ---
        loginBtn.classList.remove('is-loading');
        loginBtn.disabled = false;
        isSubmitting = false;

        // Card gentle horizontal shake
        triggerErrorShake();

        // Mark field invalid with clear instruction
        setFieldError(
          passwordFieldWrapper, 
          passwordError, 
          'Invalid credentials. Use demo@syllora.com / password123'
        );
        showToast('Authentication failed. Check credentials and try again.', 'error');
      }
    }, 1500);
  });

  // Card Shake Trigger (3 cycles, 6px)
  function triggerErrorShake() {
    loginCard.classList.remove('has-error-shake');
    // Force DOM reflow so CSS animation can re-trigger
    void loginCard.offsetWidth;
    loginCard.classList.add('has-error-shake');

    setTimeout(() => {
      loginCard.classList.remove('has-error-shake');
    }, 500);
  }

  // --------------------------------------------------------------------------
  // 6. Google Sign-In Simulation
  // --------------------------------------------------------------------------
  googleLoginBtn.addEventListener('click', () => {
    googleLoginBtn.style.opacity = '0.6';
    googleLoginBtn.style.pointerEvents = 'none';
    showToast('Connecting with Google identity services...', 'info');

    setTimeout(() => {
      googleLoginBtn.style.opacity = '1';
      googleLoginBtn.style.pointerEvents = 'auto';

      emailInput.value = 'demo@syllora.com';
      passwordInput.value = 'password123';
      clearAllErrors();
      showToast('Google account verified: demo@syllora.com', 'success');

      // Auto submit with success
      loginForm.dispatchEvent(new Event('submit'));
    }, 1200);
  });

  // --------------------------------------------------------------------------
  // 7. Password Recovery Modal
  // --------------------------------------------------------------------------
  function openModal() {
    recoveryModal.style.display = 'flex';
    recoveryEmailInput.value = emailInput.value.trim();
    setTimeout(() => recoveryEmailInput.focus(), 50);
  }

  function closeModal() {
    recoveryModal.style.display = 'none';
  }

  forgotPasswordLink.addEventListener('click', (e) => {
    e.preventDefault();
    openModal();
  });

  modalCloseBtn.addEventListener('click', closeModal);

  recoveryModal.addEventListener('click', (e) => {
    if (e.target === recoveryModal) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && recoveryModal.style.display === 'flex') {
      closeModal();
    }
  });

  recoveryForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const mail = recoveryEmailInput.value.trim();
    if (!mail || !isValidEmail(mail)) {
      showToast('Please enter a valid email address.', 'error');
      return;
    }
    closeModal();
    showToast(`Password recovery link dispatched to ${mail}`, 'success');
  });

  // --------------------------------------------------------------------------
  // 8. Toast Feedback Engine
  // --------------------------------------------------------------------------
  function showToast(message, type = 'info') {
    const bubble = document.createElement('div');
    bubble.className = `toast-bubble toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `
        <svg viewBox="0 0 20 20" fill="#059669" width="18" height="18">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
        </svg>
      `;
    } else if (type === 'error') {
      iconSvg = `
        <svg viewBox="0 0 20 20" fill="#DC2626" width="18" height="18">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.586 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
        </svg>
      `;
    } else {
      iconSvg = `
        <svg viewBox="0 0 20 20" fill="#03605E" width="18" height="18">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
        </svg>
      `;
    }

    bubble.innerHTML = `
      ${iconSvg}
      <span>${message}</span>
    `;

    toastShelf.appendChild(bubble);

    setTimeout(() => {
      bubble.style.opacity = '0';
      bubble.style.transform = 'translateY(12px)';
      setTimeout(() => bubble.remove(), 260);
    }, 4000);
  }

})();
