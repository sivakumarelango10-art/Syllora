/**
 * Syllora Authentication Engine
 * Handles State, Live Validation, Password Metrics, Google OAuth flow simulation, and Theme Persistence
 */

(function () {
  'use strict';

  // --- DOM Elements ---
  const htmlRoot = document.documentElement;
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const quickDemoBtn = document.getElementById('quickDemoBtn');

  // Tabs
  const tabSignIn = document.getElementById('tabSignIn');
  const tabSignUp = document.getElementById('tabSignUp');

  // Headers & Dynamic Labels
  const formHeaderTitle = document.getElementById('formHeaderTitle');
  const formHeaderSubtitle = document.getElementById('formHeaderSubtitle');
  const submitBtnText = document.getElementById('submitBtnText');
  const footerPromptText = document.getElementById('footerPromptText');
  const switchModeFooterBtn = document.getElementById('switchModeFooterBtn');

  // Form & Inputs
  const authForm = document.getElementById('authForm');
  const fullNameGroup = document.getElementById('fullNameGroup');
  const fullNameInput = document.getElementById('fullNameInput');
  const nameError = document.getElementById('nameError');
  const nameValidationIcon = document.getElementById('nameValidationIcon');

  const emailInput = document.getElementById('emailInput');
  const emailError = document.getElementById('emailError');
  const emailValidationIcon = document.getElementById('emailValidationIcon');

  const passwordInput = document.getElementById('passwordInput');
  const passwordError = document.getElementById('passwordError');
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  const eyeOpenIcon = togglePasswordBtn.querySelector('.eye-open-icon');
  const eyeClosedIcon = togglePasswordBtn.querySelector('.eye-closed-icon');

  const passwordStrengthWidget = document.getElementById('passwordStrengthWidget');
  const strengthFill = document.getElementById('strengthFill');
  const strengthText = document.getElementById('strengthText');

  const rememberMeCheck = document.getElementById('rememberMeCheck');
  const termsCheck = document.getElementById('termsCheck');
  const submitAuthBtn = document.getElementById('submitAuthBtn');
  const googleAuthBtn = document.getElementById('googleAuthBtn');

  // Modal
  const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
  const forgotModal = document.getElementById('forgotModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const resetForm = document.getElementById('resetForm');
  const resetEmailInput = document.getElementById('resetEmailInput');
  const resetEmailError = document.getElementById('resetEmailError');

  // Toast Container
  const toastContainer = document.getElementById('toastContainer');

  // Current State: 'signin' | 'signup'
  let currentMode = 'signin';

  // --------------------------------------------------------------------------
  // 1. Theme Management (Dark / Light with LocalStorage persistence)
  // --------------------------------------------------------------------------
  function initTheme() {
    const savedTheme = localStorage.getItem('syllora_theme') || 'dark';
    htmlRoot.setAttribute('data-theme', savedTheme);
  }

  function toggleTheme() {
    const current = htmlRoot.getAttribute('data-theme') || 'dark';
    const nextTheme = current === 'dark' ? 'light' : 'dark';
    htmlRoot.setAttribute('data-theme', nextTheme);
    localStorage.setItem('syllora_theme', nextTheme);
    showToast(`Switched to ${nextTheme} theme`, 'info');
  }

  themeToggleBtn.addEventListener('click', toggleTheme);

  // --------------------------------------------------------------------------
  // 2. Mode Switcher (Sign In <-> Create Account)
  // --------------------------------------------------------------------------
  function setMode(mode) {
    currentMode = mode;
    htmlRoot.setAttribute('data-mode', mode);

    // Clear existing error states
    clearErrors();

    if (mode === 'signup') {
      tabSignUp.classList.add('active');
      tabSignUp.setAttribute('aria-selected', 'true');
      tabSignIn.classList.remove('active');
      tabSignIn.setAttribute('aria-selected', 'false');

      formHeaderTitle.textContent = 'Create your account';
      formHeaderSubtitle.textContent = 'Join Syllora to access intelligent research, synthesis & notes.';
      submitBtnText.textContent = 'Create Account';
      footerPromptText.textContent = 'Already have an account?';
      switchModeFooterBtn.textContent = 'Sign In';

      // Focus full name if switched to signup
      setTimeout(() => fullNameInput.focus(), 80);
    } else {
      tabSignIn.classList.add('active');
      tabSignIn.setAttribute('aria-selected', 'true');
      tabSignUp.classList.remove('active');
      tabSignUp.setAttribute('aria-selected', 'false');

      formHeaderTitle.textContent = 'Welcome back to Syllora';
      formHeaderSubtitle.textContent = 'Sign in to access your curated library & workspace.';
      submitBtnText.textContent = 'Sign In';
      footerPromptText.textContent = "Don't have an account yet?";
      switchModeFooterBtn.textContent = 'Create an account';

      setTimeout(() => emailInput.focus(), 80);
    }
  }

  tabSignIn.addEventListener('click', () => setMode('signin'));
  tabSignUp.addEventListener('click', () => setMode('signup'));
  switchModeFooterBtn.addEventListener('click', () => {
    setMode(currentMode === 'signin' ? 'signup' : 'signin');
  });

  // --------------------------------------------------------------------------
  // 3. Password Visibility Toggle
  // --------------------------------------------------------------------------
  togglePasswordBtn.addEventListener('click', () => {
    const isPassword = passwordInput.getAttribute('type') === 'password';
    passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
    eyeOpenIcon.style.display = isPassword ? 'none' : 'block';
    eyeClosedIcon.style.display = isPassword ? 'block' : 'none';
    togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
  });

  // --------------------------------------------------------------------------
  // 4. Real-time Password Strength Meter (for Sign Up)
  // --------------------------------------------------------------------------
  passwordInput.addEventListener('input', () => {
    clearFieldError(passwordInput, passwordError);

    if (currentMode !== 'signup') return;

    const val = passwordInput.value;
    if (!val) {
      strengthFill.style.width = '0%';
      strengthFill.style.backgroundColor = 'transparent';
      strengthText.textContent = 'Enter at least 8 characters';
      strengthText.style.color = 'var(--text-muted)';
      return;
    }

    let score = 0;
    if (val.length >= 8) score++;
    if (/[a-z]/.test(val) && /[A-Z]/.test(val)) score++;
    if (/\d/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;

    switch (score) {
      case 1:
        strengthFill.style.width = '25%';
        strengthFill.style.backgroundColor = '#ef4444';
        strengthText.textContent = 'Weak password';
        strengthText.style.color = '#ef4444';
        break;
      case 2:
        strengthFill.style.width = '50%';
        strengthFill.style.backgroundColor = '#f59e0b';
        strengthText.textContent = 'Fair password';
        strengthText.style.color = '#f59e0b';
        break;
      case 3:
        strengthFill.style.width = '75%';
        strengthFill.style.backgroundColor = '#3b82f6';
        strengthText.textContent = 'Good password';
        strengthText.style.color = '#3b82f6';
        break;
      case 4:
        strengthFill.style.width = '100%';
        strengthFill.style.backgroundColor = '#10b981';
        strengthText.textContent = 'Strong password';
        strengthText.style.color = '#10b981';
        break;
      default:
        strengthFill.style.width = '15%';
        strengthFill.style.backgroundColor = '#ef4444';
        strengthText.textContent = 'Too short';
        strengthText.style.color = '#ef4444';
    }
  });

  // --------------------------------------------------------------------------
  // 5. Validation Utilities
  // --------------------------------------------------------------------------
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  function setFieldError(inputEl, errorEl, message) {
    const group = inputEl.closest('.input-field-group');
    if (group) group.classList.add('has-error');
    if (errorEl) errorEl.textContent = message;
  }

  function clearFieldError(inputEl, errorEl) {
    const group = inputEl.closest('.input-field-group');
    if (group) group.classList.remove('has-error');
    if (errorEl) errorEl.textContent = '';
  }

  function clearErrors() {
    clearFieldError(fullNameInput, nameError);
    clearFieldError(emailInput, emailError);
    clearFieldError(passwordInput, passwordError);
  }

  fullNameInput.addEventListener('input', () => {
    clearFieldError(fullNameInput, nameError);
    if (fullNameInput.value.trim().length >= 2) {
      nameValidationIcon.classList.add('valid');
      nameValidationIcon.innerHTML = `
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <polyline points="3 8 7 12 13 4"></polyline>
        </svg>
      `;
    } else {
      nameValidationIcon.classList.remove('valid');
      nameValidationIcon.innerHTML = '';
    }
  });

  emailInput.addEventListener('input', () => {
    clearFieldError(emailInput, emailError);
    if (isValidEmail(emailInput.value)) {
      emailValidationIcon.classList.add('valid');
      emailValidationIcon.innerHTML = `
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <polyline points="3 8 7 12 13 4"></polyline>
        </svg>
      `;
    } else {
      emailValidationIcon.classList.remove('valid');
      emailValidationIcon.innerHTML = '';
    }
  });

  // --------------------------------------------------------------------------
  // 6. Form Submission Handler
  // --------------------------------------------------------------------------
  authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearErrors();

    let hasError = false;

    // Validate Full Name for Sign Up
    if (currentMode === 'signup') {
      const nameVal = fullNameInput.value.trim();
      if (!nameVal) {
        setFieldError(fullNameInput, nameError, 'Please enter your full name.');
        hasError = true;
      } else if (nameVal.length < 2) {
        setFieldError(fullNameInput, nameError, 'Full name must be at least 2 characters.');
        hasError = true;
      }
    }

    // Validate Email
    const emailVal = emailInput.value.trim();
    if (!emailVal) {
      setFieldError(emailInput, emailError, 'Email address is required.');
      hasError = true;
    } else if (!isValidEmail(emailVal)) {
      setFieldError(emailInput, emailError, 'Please enter a valid email address.');
      hasError = true;
    }

    // Validate Password
    const passwordVal = passwordInput.value;
    if (!passwordVal) {
      setFieldError(passwordInput, passwordError, 'Password is required.');
      hasError = true;
    } else if (currentMode === 'signup' && passwordVal.length < 8) {
      setFieldError(passwordInput, passwordError, 'Password must be at least 8 characters.');
      hasError = true;
    }

    // Validate Terms checkbox for Sign Up
    if (currentMode === 'signup' && !termsCheck.checked) {
      showToast('Please accept the Terms & Privacy Policy to continue', 'error');
      hasError = true;
    }

    if (hasError) return;

    // Simulate Network Request with Tactile Loading State
    submitAuthBtn.classList.add('is-loading');
    submitAuthBtn.disabled = true;

    setTimeout(() => {
      submitAuthBtn.classList.remove('is-loading');
      submitAuthBtn.disabled = false;

      if (currentMode === 'signup') {
        const name = fullNameInput.value.trim();
        showToast(`Account created for ${name}! Welcome to Syllora.`, 'success');
      } else {
        showToast(`Welcome back, ${emailVal.split('@')[0]}! Redirecting...`, 'success');
      }
    }, 1100);
  });

  // --------------------------------------------------------------------------
  // 7. Google OAuth Single Sign-On (SSO) Simulation
  // --------------------------------------------------------------------------
  googleAuthBtn.addEventListener('click', () => {
    googleAuthBtn.style.opacity = '0.7';
    googleAuthBtn.style.pointerEvents = 'none';

    showToast('Connecting with Google accounts securely...', 'info');

    setTimeout(() => {
      googleAuthBtn.style.opacity = '1';
      googleAuthBtn.style.pointerEvents = 'auto';

      const mockGoogleName = 'Alex Morgan';
      const mockGoogleEmail = 'alex.morgan@syllora.edu';

      if (currentMode === 'signup') {
        fullNameInput.value = mockGoogleName;
        emailInput.value = mockGoogleEmail;
        passwordInput.value = 'GoogleAuthorized#99';
        termsCheck.checked = true;
        nameValidationIcon.classList.add('valid');
        emailValidationIcon.classList.add('valid');
        showToast(`Google authenticated! Profile linked as ${mockGoogleName}.`, 'success');
      } else {
        emailInput.value = mockGoogleEmail;
        passwordInput.value = '••••••••••••';
        showToast(`Signed in via Google as ${mockGoogleName} (${mockGoogleEmail})`, 'success');
      }
    }, 1200);
  });

  // --------------------------------------------------------------------------
  // 8. Quick Demo Account Autofill
  // --------------------------------------------------------------------------
  quickDemoBtn.addEventListener('click', () => {
    setMode('signin');
    emailInput.value = 'alex.morgan@syllora.edu';
    passwordInput.value = 'Syllora#Scholar2026';
    emailValidationIcon.classList.add('valid');
    emailValidationIcon.innerHTML = `
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <polyline points="3 8 7 12 13 4"></polyline>
      </svg>
    `;
    showToast('Loaded demo credentials for Alex Morgan', 'info');
  });

  // --------------------------------------------------------------------------
  // 9. Forgot Password Modal
  // --------------------------------------------------------------------------
  function openForgotModal() {
    forgotModal.style.display = 'flex';
    resetEmailInput.value = emailInput.value.trim();
    setTimeout(() => resetEmailInput.focus(), 60);
  }

  function closeForgotModal() {
    forgotModal.style.display = 'none';
    clearFieldError(resetEmailInput, resetEmailError);
  }

  forgotPasswordBtn.addEventListener('click', openForgotModal);
  closeModalBtn.addEventListener('click', closeForgotModal);

  // Close modal when clicking backdrop
  forgotModal.addEventListener('click', (e) => {
    if (e.target === forgotModal) closeForgotModal();
  });

  // Escape key closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && forgotModal.style.display === 'flex') {
      closeForgotModal();
    }
  });

  resetForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = resetEmailInput.value.trim();
    if (!val || !isValidEmail(val)) {
      setFieldError(resetEmailInput, resetEmailError, 'Please enter a valid email address.');
      return;
    }

    const resetBtn = resetForm.querySelector('button[type="submit"]');
    resetBtn.disabled = true;
    resetBtn.querySelector('.btn-text').textContent = 'Dispatching link...';

    setTimeout(() => {
      resetBtn.disabled = false;
      resetBtn.querySelector('.btn-text').textContent = 'Send Recovery Link';
      closeForgotModal();
      showToast(`Password reset link dispatched to ${val}! Check your inbox.`, 'success');
    }, 900);
  });

  // --------------------------------------------------------------------------
  // 10. Toast Notification Engine
  // --------------------------------------------------------------------------
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `
        <svg class="toast-item-icon" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
      `;
    } else if (type === 'error') {
      iconSvg = `
        <svg class="toast-item-icon" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      `;
    } else {
      iconSvg = `
        <svg class="toast-item-icon" viewBox="0 0 24 24" fill="none" stroke="#008775" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
      `;
    }

    toast.innerHTML = `
      ${iconSvg}
      <div class="toast-item-content">${message}</div>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(16px)';
      setTimeout(() => toast.remove(), 260);
    }, 4200);
  }

  // Init Theme and Mode on bootstrap
  initTheme();
  setMode('signin');
})();
