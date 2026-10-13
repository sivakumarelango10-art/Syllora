/**
 * ============================================================================
 * SYLLORA AUTHENTICATION ENGINE (FRONTEND APPLICATION)
 * Master Specification Implementation:
 * - 100% GPU Compositor Driven via Web Animations API & CSS Keyframes
 * - Pixel-Correct Outlined Vector Kerning (Zero Text/Font Layout Shift)
 * - Circle-Scale Panel Reveal & Teal Flood (Zero Clip-Path Thrash)
 * - Fixed 396x56 contain: strict Button Morph
 * - Synchronized Multi-Track Master Timeline with SPEED Constant
 * ============================================================================
 */

(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // 1. MASTER TIMING SPECIFICATION & EASINGS
  // --------------------------------------------------------------------------
  const SPEED = 1.0; // Scalable constant: 1.0 = standard spec, 0.75 = snappier

  const TIMINGS = Object.freeze({
    // Intro Timeline (seconds from load)
    spineGrow: [0.15, 0.55],
    spineFade: [0.60, 1.00],
    bookOpen: [0.50, 1.35],
    bookFade: [0.50, 0.71],
    checkDraw: [1.30, 2.00],
    wordmarkBase: 1.95,
    wordmarkStagger: 0.07,
    wordmarkDuration: 0.50,
    breathe: [2.40, 3.20],
    logoGlide: [3.20, 4.00],
    panelReveal: [3.85, 4.85],
    colorCrossfade: [3.95, 4.35],
    paperFadeBase: 4.20,
    paperFadeStagger: 0.08,
    paperFadeDuration: 0.70,
    tagline: [4.50, 5.10],
    subtagline: [4.65, 5.25],
    cardEnter: [4.70, 5.40],
    cardStaggerBase: 4.90,
    cardStaggerStep: 0.07,
    cardStaggerDuration: 0.50,
    introTotal: 5.50,

    // Button & Loading (seconds after submit)
    btnLabelFade: [0.15, 0.35],
    btnMorphCircle: [0.15, 0.60],
    spinnerFade: [0.50, 0.65],
    minSpinnerDuration: 0.40,
    mockAuthDuration: 0.60,

    // Success Sequence
    spinnerOut: [0.00, 0.15],
    checkDrawMorph: [0.05, 0.40],
    checkPop: [0.05, 0.45],
    btnBgRestore: [0.00, 0.30],
    tealFlood: [0.65, 1.45],

    // Welcome Screen Sequence (seconds after flood completes)
    welcomeBookOpen: [0.05, 0.75],
    welcomeCheckDraw: [0.60, 1.15],
    welcomeWordmarkBase: 0.95,
    welcomeWordmarkStagger: 0.05,
    welcomeWordmarkDuration: 0.40,
    welcomeTitle: [1.30, 1.80],
    welcomeSub: [1.45, 1.95],
    progressBarFill: [1.65, 3.05]
  });

  // Exact Cubic Bezier Easings
  const EASE_OUT = 'cubic-bezier(0.33, 1, 0.68, 1)';     // easeOutCubic
  const EASE_IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)'; // easeInOutCubic
  const EASE_BACK = 'cubic-bezier(0.34, 1.56, 0.64, 1)';  // easeOutBack overshoot 1.56
  const EASE_IN = 'cubic-bezier(0.55, 0, 0.9, 0.4)';    // accelerating flood
  const LINEAR = 'linear';

  // Safe Session Storage Helpers
  function getSessionStorage(key) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function setSessionStorage(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Ignore incognito quota restrictions
    }
  }

  // --------------------------------------------------------------------------
  // 2. DOM CACHE
  // --------------------------------------------------------------------------
  const appStage = document.getElementById('appStage');
  const brandPanel = document.getElementById('brandPanel');
  const panelRevealCircle = document.getElementById('panelRevealCircle');
  const paperItems = Array.from(document.querySelectorAll('.paper-item'));
  const brandTagline = document.getElementById('brandTagline');
  const brandSubtagline = document.getElementById('brandSubtagline');
  const brandCopyright = document.getElementById('brandCopyright');

  const introLogoRig = document.getElementById('introLogoRig');
  const layerA = document.getElementById('layerA');
  const layerB = document.getElementById('layerB');
  const spine = document.getElementById('spine');
  const pageLeft = document.getElementById('pageLeft');
  const pageRight = document.getElementById('pageRight');
  const checkReveal = document.getElementById('checkReveal');
  const ltrElements = Array.from(document.querySelectorAll('#layerA .ltr'));

  const loginCard = document.getElementById('loginCard');
  const cardStaggerItems = Array.from(document.querySelectorAll('.card-stagger-item'));
  const authForm = document.getElementById('authForm');
  const emailGroup = document.getElementById('emailGroup');
  const emailInput = document.getElementById('emailInput');
  const emailError = document.getElementById('emailError');
  const passwordGroup = document.getElementById('passwordGroup');
  const passwordInput = document.getElementById('passwordInput');
  const passwordError = document.getElementById('passwordError');
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  const eyeIconShow = togglePasswordBtn.querySelector('.eye-icon-show');
  const eyeIconHide = togglePasswordBtn.querySelector('.eye-icon-hide');

  const loginBtn = document.getElementById('loginBtn');
  const btnLabel = document.getElementById('btnLabel');
  const btnSpinner = document.getElementById('btnSpinner');
  const btnCheckmarkMorph = document.getElementById('btnCheckmarkMorph');
  const morphCheckPath = document.getElementById('morphCheckPath');
  const googleBtn = document.getElementById('googleBtn');
  const introSkipHint = document.getElementById('introSkipHint');
  const a11yAnnouncer = document.getElementById('a11yAnnouncer');

  // Flood & Welcome Screen
  const tealFloodOverlay = document.getElementById('tealFloodOverlay');
  const floodCircle = document.getElementById('floodCircle');
  const welcomeScreen = document.getElementById('welcomeScreen');
  const welcomePageLeft = document.getElementById('welcomePageLeft');
  const welcomePageRight = document.getElementById('welcomePageRight');
  const welcomeCheckReveal = document.getElementById('welcomeCheckReveal');
  const welcomeLtrs = Array.from(document.querySelectorAll('#welcomeWordmark .welcome-ltr'));
  const welcomeTitle = document.getElementById('welcomeTitle');
  const welcomeSub = document.getElementById('welcomeSub');
  const welcomeProgressTrack = document.getElementById('welcomeProgressTrack');
  const welcomeProgressFill = document.getElementById('welcomeProgressFill');

  // State Management
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isDirectWorkspaceVisit = window.location.hash.startsWith('#/app');
  const introSeenThisSession = (getSessionStorage('syllora_intro_seen') === 'true') || isDirectWorkspaceVisit;
  let introActive = !introSeenThisSession && !prefersReducedMotion;
  let activeAnimations = [];
  let isSubmitting = false;
  let authTimers = [];

  function setTrackedTimeout(fn, ms) {
    const id = setTimeout(() => {
      authTimers = authTimers.filter((t) => t !== id);
      fn();
    }, ms);
    authTimers.push(id);
    return id;
  }

  function clearAuthTimers() {
    authTimers.forEach((id) => clearTimeout(id));
    authTimers = [];
  }

  // --------------------------------------------------------------------------
  // 3. LAYOUT & PROPORTIONAL GEOMETRY CALCULATIONS
  // --------------------------------------------------------------------------
  function calculatePositions() {
    const isDesktop = window.innerWidth >= 900;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Logo initial center: 50% x, 48% y (logo rig is 620 x 542.5)
    const logoStartX = 0.50 * vw - 310;
    const logoStartY = 0.48 * vh - 271.25;

    // Logo final spot & panel dimensions
    let logoEndX, logoEndY, logoEndScale;
    let panelW, panelH, panelCenterX, panelCenterY;

    if (isDesktop) {
      panelW = vw * 0.5;
      panelH = vh;
      logoEndX = 0.25 * vw - 310;
      logoEndY = 0.38 * vh - 271.25;
      logoEndScale = 0.60; // 372px / 620px = 0.6x
      panelCenterX = 0.50 * panelW;
      panelCenterY = 0.38 * panelH;
    } else {
      panelW = vw;
      panelH = Math.max(260, vh * 0.4);
      logoEndX = 0.50 * vw - 310;
      logoEndY = 0.12 * vh - 271.25;
      logoEndScale = 160 / 620; // 160px on mobile
      panelCenterX = 0.50 * panelW;
      panelCenterY = 0.12 * vh;
    }

    // Panel reveal circle: diameter 2.6x panel diagonal
    const panelDiagonal = Math.hypot(panelW, panelH);
    const circleDiameter = 2.6 * panelDiagonal;

    return {
      isDesktop,
      vw, vh,
      logoStartX, logoStartY,
      logoEndX, logoEndY, logoEndScale,
      panelW, panelH,
      panelCenterX, panelCenterY,
      circleDiameter
    };
  }

  function applyGeometricSetup() {
    const geo = calculatePositions();

    // 1. Initial or resting logo position
    if (introActive) {
      introLogoRig.style.transform = `translate(${geo.logoStartX}px, ${geo.logoStartY}px) scale(1)`;
    } else {
      introLogoRig.style.transform = `translate(${geo.logoEndX}px, ${geo.logoEndY}px) scale(${geo.logoEndScale})`;
    }

    // 2. Panel reveal circle position (centered on logo's final spot)
    panelRevealCircle.style.width = `${geo.circleDiameter}px`;
    panelRevealCircle.style.height = `${geo.circleDiameter}px`;
    panelRevealCircle.style.left = `${geo.panelCenterX - geo.circleDiameter / 2}px`;
    panelRevealCircle.style.top = `${geo.panelCenterY - geo.circleDiameter / 2}px`;

    // 3. Proportional layout for 6 ambient paper cards inside 960x1080 coordinate space
    const scaleX = geo.panelW / 960;
    const scaleY = geo.panelH / 1080;

    paperItems.forEach((item, index) => {
      const left = parseFloat(item.getAttribute('data-left')) * scaleX;
      const top = parseFloat(item.getAttribute('data-top')) * scaleY;
      const w = parseFloat(item.getAttribute('data-w')) * scaleX;
      const h = parseFloat(item.getAttribute('data-h')) * scaleY;
      const rot = parseFloat(item.getAttribute('data-rot'));

      item.style.left = `${left}px`;
      item.style.top = `${top}px`;
      item.style.width = `${w}px`;
      item.style.height = `${h}px`;
      item.style.setProperty('--base-rot', `${rot}deg`);
      item.style.setProperty('--drift-index', `${index}`);
      item.querySelector('.paper-card-inner').style.transform = `rotate(${rot}deg)`;
    });
  }

  // --------------------------------------------------------------------------
  // 4. WEB ANIMATIONS API MASTER TIMELINE (GPU COMPOSITOR DRIVEN)
  // --------------------------------------------------------------------------
  function createAnimation(element, keyframes, options) {
    if (!element) return null;
    element.style.willChange = 'transform, opacity';
    const anim = element.animate(keyframes, {
      ...options,
      fill: 'forwards'
    });

    // Remove will-change layer hint upon completion to prevent blur
    anim.finished.then(() => {
      element.style.willChange = 'auto';
    }).catch(() => {});

    activeAnimations.push(anim);
    return anim;
  }

  function startMasterIntroTimeline() {
    const geo = calculatePositions();
    const t = (sec) => sec * SPEED * 1000;

    // 1. Spine line grows: 0.15 -> 0.55s (scaleY 0 -> 1)
    createAnimation(spine, [
      { transform: 'scaleY(0)' },
      { transform: 'scaleY(1)' }
    ], {
      delay: t(TIMINGS.spineGrow[0]),
      duration: t(TIMINGS.spineGrow[1] - TIMINGS.spineGrow[0]),
      easing: EASE_OUT
    });

    // 2. Spine line fades: 0.60 -> 1.00s (opacity 1 -> 0)
    createAnimation(spine, [
      { opacity: 1 },
      { opacity: 0 }
    ], {
      delay: t(TIMINGS.spineFade[0]),
      duration: t(TIMINGS.spineFade[1] - TIMINGS.spineFade[0]),
      easing: LINEAR
    });

    // 3. Pages open: 0.50 -> 1.35s (scaleX 0 -> 1, scaleY 0.9 -> 1, easeOutBack)
    createAnimation(pageLeft, [
      { transform: 'scaleX(0) scaleY(0.9)', opacity: 0 },
      { transform: 'scaleX(1) scaleY(1)', opacity: 1 }
    ], {
      delay: t(TIMINGS.bookOpen[0]),
      duration: t(TIMINGS.bookOpen[1] - TIMINGS.bookOpen[0]),
      easing: EASE_BACK
    });

    createAnimation(pageRight, [
      { transform: 'scaleX(0) scaleY(0.9)', opacity: 0 },
      { transform: 'scaleX(1) scaleY(1)', opacity: 1 }
    ], {
      delay: t(TIMINGS.bookOpen[0]),
      duration: t(TIMINGS.bookOpen[1] - TIMINGS.bookOpen[0]),
      easing: EASE_BACK
    });

    // 4. Checkmark reveals through stroke mask: 1.30 -> 2.00s (dashoffset 1.02 -> 0)
    createAnimation(checkReveal, [
      { strokeDashoffset: '1.02' },
      { strokeDashoffset: '0' }
    ], {
      delay: t(TIMINGS.checkDraw[0]),
      duration: t(TIMINGS.checkDraw[1] - TIMINGS.checkDraw[0]),
      easing: EASE_IN_OUT
    });

    // 5. Outlined wordmark letters rise: 1.95 + i*0.07 -> +0.50s (opacity 0 -> 1, translateY 40 -> 0)
    ltrElements.forEach((ltr, index) => {
      const delay = TIMINGS.wordmarkBase + index * TIMINGS.wordmarkStagger;
      createAnimation(ltr, [
        { opacity: 0, transform: 'translateY(40px)' },
        { opacity: 1, transform: 'translateY(0px)' }
      ], {
        delay: t(delay),
        duration: t(TIMINGS.wordmarkDuration),
        easing: EASE_OUT
      });
    });

    // 6. Logo breathe: 2.40 -> 3.20s (scale 1 -> 1.03)
    createAnimation(introLogoRig, [
      { transform: `translate(${geo.logoStartX}px, ${geo.logoStartY}px) scale(1)` },
      { transform: `translate(${geo.logoStartX}px, ${geo.logoStartY}px) scale(1.03)` }
    ], {
      delay: t(TIMINGS.breathe[0]),
      duration: t(TIMINGS.breathe[1] - TIMINGS.breathe[0]),
      easing: EASE_OUT
    });

    // 7. Logo glides from center to panel spot: 3.20 -> 4.00s (scale 1.03 -> 0.6)
    createAnimation(introLogoRig, [
      { transform: `translate(${geo.logoStartX}px, ${geo.logoStartY}px) scale(1.03)` },
      { transform: `translate(${geo.logoEndX}px, ${geo.logoEndY}px) scale(${geo.logoEndScale})` }
    ], {
      delay: t(TIMINGS.logoGlide[0]),
      duration: t(TIMINGS.logoGlide[1] - TIMINGS.logoGlide[0]),
      easing: EASE_IN_OUT
    });

    // 8. Panel Reveal Circle: 3.85 -> 4.85s (transform scale 0 -> 1)
    createAnimation(panelRevealCircle, [
      { transform: 'scale(0)' },
      { transform: 'scale(1)' }
    ], {
      delay: t(TIMINGS.panelReveal[0]),
      duration: t(TIMINGS.panelReveal[1] - TIMINGS.panelReveal[0]),
      easing: EASE_OUT
    });

    // 9. Color Crossfade (Layer A -> Layer B): 3.95 -> 4.35s
    createAnimation(layerA, [
      { opacity: 1 },
      { opacity: 0 }
    ], {
      delay: t(TIMINGS.colorCrossfade[0]),
      duration: t(TIMINGS.colorCrossfade[1] - TIMINGS.colorCrossfade[0]),
      easing: EASE_IN_OUT
    });

    createAnimation(layerB, [
      { opacity: 0 },
      { opacity: 1 }
    ], {
      delay: t(TIMINGS.colorCrossfade[0]),
      duration: t(TIMINGS.colorCrossfade[1] - TIMINGS.colorCrossfade[0]),
      easing: EASE_IN_OUT
    });

    // 10. Paper cards fade in: 4.20 + i*0.08 -> +0.70s
    paperItems.forEach((paper, index) => {
      const delay = TIMINGS.paperFadeBase + index * TIMINGS.paperFadeStagger;
      createAnimation(paper, [
        { opacity: 0 },
        { opacity: 1 }
      ], {
        delay: t(delay),
        duration: t(TIMINGS.paperFadeDuration),
        easing: EASE_OUT
      });
    });

    // 11. Tagline: 4.50 -> 5.10s (opacity 0 -> 1, translateY 16px -> 0)
    createAnimation(brandTagline, [
      { opacity: 0, transform: 'translateY(16px)' },
      { opacity: 1, transform: 'translateY(0px)' }
    ], {
      delay: t(TIMINGS.tagline[0]),
      duration: t(TIMINGS.tagline[1] - TIMINGS.tagline[0]),
      easing: EASE_OUT
    });

    // 12. Sub-tagline & Copyright: 4.65 -> 5.25s
    createAnimation(brandSubtagline, [
      { opacity: 0, transform: 'translateY(16px)' },
      { opacity: 1, transform: 'translateY(0px)' }
    ], {
      delay: t(TIMINGS.subtagline[0]),
      duration: t(TIMINGS.subtagline[1] - TIMINGS.subtagline[0]),
      easing: EASE_OUT
    });

    createAnimation(brandCopyright, [
      { opacity: 0, transform: 'translateY(16px)' },
      { opacity: 1, transform: 'translateY(0px)' }
    ], {
      delay: t(TIMINGS.subtagline[0]),
      duration: t(TIMINGS.subtagline[1] - TIMINGS.subtagline[0]),
      easing: EASE_OUT
    });

    // 13. Login card enters: 4.70 -> 5.40s (opacity 0 -> 1, translateY 40px -> 0)
    createAnimation(loginCard, [
      { opacity: 0, transform: 'translateY(40px)' },
      { opacity: 1, transform: 'translateY(0px)' }
    ], {
      delay: t(TIMINGS.cardEnter[0]),
      duration: t(TIMINGS.cardEnter[1] - TIMINGS.cardEnter[0]),
      easing: EASE_OUT
    });

    // 14. Card stagger items: 4.90 + i*0.07 -> +0.50s
    cardStaggerItems.forEach((item, index) => {
      const delay = TIMINGS.cardStaggerBase + index * TIMINGS.cardStaggerStep;
      createAnimation(item, [
        { opacity: 0, transform: 'translateY(14px)' },
        { opacity: 1, transform: 'translateY(0px)' }
      ], {
        delay: t(delay),
        duration: t(TIMINGS.cardStaggerDuration),
        easing: EASE_OUT
      });
    });

    // Complete Intro Sequence
    const totalDurationMs = t(TIMINGS.introTotal);
    setTimeout(() => {
      if (introActive) {
        completeIntro();
      }
    }, totalDurationMs);
  }

  // --------------------------------------------------------------------------
  // 5. INTRO COMPLETION & SKIP ENGINE
  // --------------------------------------------------------------------------
  function completeIntro(options = {}) {
    introActive = false;
    setSessionStorage('syllora_intro_seen', 'true');
    introSkipHint.classList.remove('visible');

    const geo = calculatePositions();

    // Lock resting layout styles
    introLogoRig.style.transform = `translate(${geo.logoEndX}px, ${geo.logoEndY}px) scale(${geo.logoEndScale})`;
    panelRevealCircle.style.transform = 'scale(1)';
    layerA.style.opacity = '0';
    layerB.style.opacity = '1';

    // Settle book & letter elements reliably
    if (checkReveal) checkReveal.style.strokeDashoffset = '0';
    if (pageLeft) {
      pageLeft.style.transform = 'scale(1)';
      pageLeft.style.opacity = '1';
    }
    if (pageRight) {
      pageRight.style.transform = 'scale(1)';
      pageRight.style.opacity = '1';
    }
    ltrElements.forEach((l) => {
      l.style.opacity = '1';
      l.style.transform = 'translateY(0)';
    });

    paperItems.forEach((p) => {
      p.style.opacity = '1';
      p.classList.add('drifting'); // Activate pure CSS compositor ambient keyframes
    });

    brandTagline.style.opacity = '1';
    brandTagline.style.transform = 'translateY(0)';
    brandSubtagline.style.opacity = '1';
    brandSubtagline.style.transform = 'translateY(0)';
    brandCopyright.style.opacity = '1';
    brandCopyright.style.transform = 'translateY(0)';

    if (options.shortFade && !prefersReducedMotion) {
      loginCard.style.transition = 'opacity 300ms ease, transform 300ms ease';
      loginCard.style.opacity = '1';
      loginCard.style.transform = 'translateY(0)';
      setTimeout(() => {
        loginCard.style.transition = '';
      }, 320);
    } else {
      loginCard.style.opacity = '1';
      loginCard.style.transform = 'translateY(0)';
    }

    cardStaggerItems.forEach((item) => {
      item.style.opacity = '1';
      item.style.transform = 'translateY(0)';
    });

    // Focus email input seamlessly (only if on login page)
    setTimeout(() => {
      if (!window.location.hash.startsWith('#/app') && document.activeElement !== passwordInput) {
        emailInput.focus();
      }
    }, 60);
  }

  function resetLoginState() {
    isSubmitting = false;
    clearAuthTimers();

    // Cancel all active Web Animations API instances
    activeAnimations.forEach((anim) => {
      try {
        anim.cancel();
      } catch {}
    });
    activeAnimations = [];

    loginBtn.setAttribute('aria-busy', 'false');
    loginBtn.disabled = false;
    loginBtn.classList.remove('pressed');
    loginBtn.style.transition = '';
    loginBtn.style.width = '';
    loginBtn.style.borderRadius = '';
    loginBtn.style.backgroundColor = '';
    btnLabel.style.opacity = '1';
    btnSpinner.style.display = 'none';
    btnSpinner.style.opacity = '0';
    btnCheckmarkMorph.style.display = 'none';
    btnCheckmarkMorph.style.transform = '';
    morphCheckPath.style.transition = '';
    morphCheckPath.style.strokeDashoffset = '1.02';

    tealFloodOverlay.classList.remove('active');
    floodCircle.style.transform = '';

    welcomeScreen.classList.remove('active');
    welcomePageLeft.style.transition = '';
    welcomePageLeft.style.transform = '';
    welcomePageRight.style.transition = '';
    welcomePageRight.style.transform = '';
    welcomeCheckReveal.style.transition = '';
    welcomeCheckReveal.style.strokeDashoffset = '1.02';
    welcomeLtrs.forEach((ltr) => {
      ltr.style.transition = '';
      ltr.style.opacity = '';
      ltr.style.transform = '';
    });
    welcomeTitle.style.transition = '';
    welcomeTitle.style.opacity = '';
    welcomeTitle.style.transform = '';
    welcomeSub.style.transition = '';
    welcomeSub.style.opacity = '';
    welcomeSub.style.transform = '';
    welcomeProgressTrack.style.transition = '';
    welcomeProgressTrack.style.opacity = '';
    welcomeProgressFill.style.transition = '';
    welcomeProgressFill.style.transform = 'scaleX(0)';

    emailInput.value = '';
    passwordInput.value = '';
    clearFieldError(emailGroup, emailError);
    clearFieldError(passwordGroup, passwordError);

    // Only settle the intro if it was already marked seen this session or already finished
    if (getSessionStorage('syllora_intro_seen') === 'true' || !introActive) {
      completeIntro();
    }
  }
  window.sylloraResetLogin = resetLoginState;

  function skipIntro() {
    if (!introActive) return;
    introActive = false;

    // Cancel all running Web Animations API instances
    activeAnimations.forEach((anim) => {
      try {
        anim.cancel();
      } catch {}
    });
    activeAnimations = [];

    // Smooth 300ms transition to final state
    loginCard.style.transition = 'opacity 300ms ease, transform 300ms ease';
    introLogoRig.style.transition = 'transform 300ms ease';
    panelRevealCircle.style.transition = 'transform 300ms ease';

    completeIntro();

    setTimeout(() => {
      loginCard.style.transition = '';
      introLogoRig.style.transition = '';
      panelRevealCircle.style.transition = '';
    }, 320);
  }

  // --------------------------------------------------------------------------
  // 6. USER INTERACTIONS & FORM VALIDATION
  // --------------------------------------------------------------------------
  function clearFieldError(group, errorEl) {
    group.classList.remove('has-error');
    errorEl.classList.remove('visible');
    errorEl.textContent = '';
  }

  function setFieldError(group, errorEl, message) {
    group.classList.add('has-error');
    errorEl.textContent = message;
    errorEl.classList.add('visible');
  }

  // Instant Button Feedback on pointerdown (First Frame Feedback)
  loginBtn.addEventListener('pointerdown', () => {
    if (!loginBtn.disabled) {
      loginBtn.classList.add('pressed');
    }
  }, { passive: true });

  ['pointerup', 'pointercancel', 'pointerleave'].forEach((evt) => {
    loginBtn.addEventListener(evt, () => {
      loginBtn.classList.remove('pressed');
    }, { passive: true });
  });

  // Password Visibility Toggle
  togglePasswordBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    eyeIconShow.style.display = isPassword ? 'none' : 'block';
    eyeIconHide.style.display = isPassword ? 'block' : 'none';
    togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
  });

  // Typing during intro triggers instant skip while preserving keystrokes
  [emailInput, passwordInput].forEach((input) => {
    input.addEventListener('keydown', () => {
      if (introActive) skipIntro();
    }, { passive: true });
  });

  // Validation on Blur
  emailInput.addEventListener('blur', () => {
    if (emailInput.value && !/\S+@\S+\.\S+/.test(emailInput.value)) {
      setFieldError(emailGroup, emailError, 'Please enter a valid email address.');
    } else {
      clearFieldError(emailGroup, emailError);
    }
  });

  passwordInput.addEventListener('blur', () => {
    if (passwordInput.value && passwordInput.value.length < 6) {
      setFieldError(passwordGroup, passwordError, 'Password must be at least 6 characters.');
    } else {
      clearFieldError(passwordGroup, passwordError);
    }
  });

  // --------------------------------------------------------------------------
  // 7. SUBMIT, LOADING MORPH & SUCCESS ORCHESTRATION
  // --------------------------------------------------------------------------
  authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    let hasError = false;
    if (!email) {
      setFieldError(emailGroup, emailError, 'Email is required.');
      hasError = true;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setFieldError(emailGroup, emailError, 'Please enter a valid email address.');
      hasError = true;
    } else {
      clearFieldError(emailGroup, emailError);
    }

    if (!password) {
      setFieldError(passwordGroup, passwordError, 'Password is required.');
      hasError = true;
    } else {
      clearFieldError(passwordGroup, passwordError);
    }

    if (hasError) {
      triggerErrorShake();
      return;
    }

    startSubmitFlow(email, password);
  });

  function triggerErrorShake() {
    loginCard.classList.remove('shake');
    void loginCard.offsetWidth; // Force reflow
    loginCard.classList.add('shake');
    setTimeout(() => loginCard.classList.remove('shake'), 450);
  }

  function startSubmitFlow(email, password) {
    isSubmitting = true;
    loginBtn.setAttribute('aria-busy', 'true');
    a11yAnnouncer.textContent = 'Logging in...';

    // 0.15 -> 0.35s: Label fades out
    setTrackedTimeout(() => {
      btnLabel.style.opacity = '0';
    }, 150);

    // 0.15 -> 0.60s: Button morphs into 56px circle inside fixed 396x56 contain: strict box
    setTrackedTimeout(() => {
      loginBtn.style.transition = 'width 450ms var(--ease-in-out), border-radius 450ms var(--ease-in-out), background-color 450ms var(--ease-in-out)';
      loginBtn.style.width = '56px';
      loginBtn.style.borderRadius = '28px';
      loginBtn.style.backgroundColor = '#024A48'; // 40% toward teal-dark
    }, 150);

    // 0.50 -> 0.65s: 28px Spinner fades in
    setTrackedTimeout(() => {
      btnSpinner.style.display = 'flex';
      requestAnimationFrame(() => {
        btnSpinner.style.opacity = '1';
      });
    }, 500);

    // Authenticate exclusively via Supabase Auth
    const authStartTime = performance.now();
    const authPromise = (typeof window.sylloraAuthenticate === 'function')
      ? window.sylloraAuthenticate(email, password)
      : Promise.resolve({
          success: false,
          error: 'Authentication service unavailable.'
        });

    authPromise.then((result) => {
      const elapsed = (performance.now() - authStartTime) / 1000;
      const remainingMinSpinner = Math.max(0, (TIMINGS.minSpinnerDuration - elapsed) * 1000);

      setTrackedTimeout(() => {
        if (result && result.success) {
          handleAuthSuccess(result);
        } else {
          handleAuthFailure(result ? result.error : 'Incorrect email or password.');
        }
      }, remainingMinSpinner);
    }).catch((err) => {
      const elapsed = (performance.now() - authStartTime) / 1000;
      const remainingMinSpinner = Math.max(0, (TIMINGS.minSpinnerDuration - elapsed) * 1000);
      setTrackedTimeout(() => {
        handleAuthFailure(err && err.message ? err.message : 'Authentication service unavailable.');
      }, remainingMinSpinner);
    });
  }

  function handleAuthFailure(errorMessage) {
    isSubmitting = false;
    loginBtn.setAttribute('aria-busy', 'false');
    loginBtn.disabled = false;
    const msg = errorMessage || 'Incorrect email or password.';
    a11yAnnouncer.textContent = msg;

    // Hide spinner
    btnSpinner.style.opacity = '0';
    setTrackedTimeout(() => {
      btnSpinner.style.display = 'none';

      // Morph button back to 396px
      loginBtn.style.transition = 'width 400ms var(--ease-in-out), border-radius 400ms var(--ease-in-out), background-color 400ms var(--ease-in-out)';
      loginBtn.style.width = window.innerWidth >= 900 ? '396px' : '100%';
      loginBtn.style.borderRadius = '14px';
      loginBtn.style.backgroundColor = '#03605E';

      setTrackedTimeout(() => {
        btnLabel.style.opacity = '1';
        loginBtn.style.transition = '';
        loginBtn.style.width = '';
      }, 350);
    }, 150);

    // Shake card & show field error
    triggerErrorShake();
    setFieldError(passwordGroup, passwordError, msg);
  }

  let activeAuthResult = null;
  function handleAuthSuccess(result) {
    activeAuthResult = result || null;
    a11yAnnouncer.textContent = 'Login successful!';

    // 0 -> 0.15s: Spinner fades out
    btnSpinner.style.opacity = '0';
    setTrackedTimeout(() => {
      btnSpinner.style.display = 'none';
    }, 150);

    // 0.05 -> 0.40s: White checkmark draws in (path M-8 0.5 L-2.5 6 L8.5 -6)
    setTrackedTimeout(() => {
      btnCheckmarkMorph.style.display = 'block';
      morphCheckPath.style.transition = 'stroke-dashoffset 350ms var(--ease-out)';
      morphCheckPath.style.strokeDashoffset = '0';
    }, 50);

    // 0.05 -> 0.45s: Checkmark pop scale 1 -> 1.12 -> 1
    setTrackedTimeout(() => {
      btnCheckmarkMorph.style.transition = 'transform 200ms ease';
      btnCheckmarkMorph.style.transform = 'scale(1.12)';
      setTrackedTimeout(() => {
        btnCheckmarkMorph.style.transform = 'scale(1)';
      }, 200);
    }, 50);

    // 0 -> 0.30s: Button bg returns to --teal
    loginBtn.style.backgroundColor = '#03605E';

    // 0.65 -> 1.45s: Teal flood: circle centered on button scales 0 -> 1 on GPU compositor
    setTrackedTimeout(() => {
      const btnRect = loginBtn.getBoundingClientRect();
      const btnCenterX = btnRect.left + btnRect.width / 2;
      const btnCenterY = btnRect.top + btnRect.height / 2;

      // Viewport diagonal * 2.2
      const vpDiagonal = Math.hypot(window.innerWidth, window.innerHeight);
      const floodDiameter = 2.2 * vpDiagonal;

      floodCircle.style.width = `${floodDiameter}px`;
      floodCircle.style.height = `${floodDiameter}px`;
      floodCircle.style.left = `${btnCenterX - floodDiameter / 2}px`;
      floodCircle.style.top = `${btnCenterY - floodDiameter / 2}px`;

      tealFloodOverlay.classList.add('active');

      createAnimation(floodCircle, [
        { transform: 'scale(0)' },
        { transform: 'scale(1)' }
      ], {
        duration: 800,
        easing: EASE_IN
      });

      // Start Welcome Screen after flood finishes
      setTrackedTimeout(runWelcomeDashboardSequence, 800);
    }, 650);
  }

  // --------------------------------------------------------------------------
  // 8. WELCOME DASHBOARD SEQUENCE (variant="inverted" Syllora Logo)
  // --------------------------------------------------------------------------
  function runWelcomeDashboardSequence() {
    welcomeScreen.classList.add('active');

    // 0.05 -> 0.75s: Pages open (ease-back)
    setTrackedTimeout(() => {
      welcomePageLeft.style.transition = 'transform 700ms var(--ease-back)';
      welcomePageRight.style.transition = 'transform 700ms var(--ease-back)';
      welcomePageLeft.style.transform = 'scaleX(1)';
      welcomePageRight.style.transform = 'scaleX(1)';
    }, 50);

    // 0.60 -> 1.15s: Checkmark draws (ease-in-out)
    setTrackedTimeout(() => {
      welcomeCheckReveal.style.transition = 'stroke-dashoffset 550ms var(--ease-in-out)';
      welcomeCheckReveal.style.strokeDashoffset = '0';
    }, 600);

    // 0.95 + i*0.05s: Outlined letters rise (each 0.40s, ease-out)
    welcomeLtrs.forEach((ltr, index) => {
      setTrackedTimeout(() => {
        ltr.style.transition = 'opacity 400ms var(--ease-out), transform 400ms var(--ease-out)';
        ltr.style.opacity = '1';
        ltr.style.transform = 'translateY(0px)';
      }, 950 + index * 50);
    });

    // 1.30 -> 1.80s: "Welcome back!" fades in and rises 18px -> 0
    setTrackedTimeout(() => {
      welcomeTitle.style.transition = 'opacity 500ms var(--ease-out), transform 500ms var(--ease-out)';
      welcomeTitle.style.opacity = '1';
      welcomeTitle.style.transform = 'translate(-50%, 0px)';
    }, 1300);

    // 1.45 -> 1.95s: "Taking you to your dashboard…" fades in
    setTrackedTimeout(() => {
      welcomeSub.style.transition = 'opacity 500ms var(--ease-out), transform 500ms var(--ease-out)';
      welcomeSub.style.opacity = '1';
      welcomeSub.style.transform = 'translate(-50%, 0px)';
    }, 1450);

    // 1.45s: Progress track appears
    setTrackedTimeout(() => {
      welcomeProgressTrack.style.transition = 'opacity 300ms ease';
      welcomeProgressTrack.style.opacity = '1';
    }, 1450);

    // 1.65 -> 3.05s: Progress fill animates scaleX(0 -> 1) over 1.40s
    setTrackedTimeout(() => {
      welcomeProgressFill.style.transition = 'transform 1400ms var(--ease-in-out)';
      welcomeProgressFill.style.transform = 'scaleX(1)';

      // On completion
      setTrackedTimeout(() => {
        a11yAnnouncer.textContent = 'Welcome to Syllora Dashboard!';
        console.log('[Syllora Auth] Transitioning to workspace...');
        if (typeof window.sylloraEnterWorkspace === 'function') {
          window.sylloraEnterWorkspace(activeAuthResult);
        }
      }, 1450);
    }, 1650);
  }

  // Google SSO Click Action
  googleBtn.addEventListener('click', () => {
    setFieldError(emailGroup, emailError, 'Google Single Sign-On is not configured. Please sign in with your email and password.');
    triggerErrorShake();
  });

  // Global Skip Listeners (Click, Tap or Keydown)
  ['click', 'keydown', 'touchstart'].forEach((evt) => {
    window.addEventListener(evt, (e) => {
      if (introActive && e.target !== emailInput && e.target !== passwordInput) {
        skipIntro();
      }
    }, { passive: true });
  });

  // Battery / Compositor Optimization: Pause ambient when tab is hidden
  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('tab-hidden', document.hidden);
  });

  // Throttled Window Resize
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (resizeTimer) cancelAnimationFrame(resizeTimer);
    resizeTimer = requestAnimationFrame(() => {
      applyGeometricSetup();
    });
  }, { passive: true });

  // --------------------------------------------------------------------------
  // 9. BOOTSTRAP INITIALIZATION
  // --------------------------------------------------------------------------
  applyGeometricSetup();

  // Pre-load font readiness race condition (Promise.race)
  Promise.race([
    document.fonts ? document.fonts.ready : Promise.resolve(),
    new Promise((resolve) => setTimeout(resolve, 300))
  ]).then(() => {
    if (isDirectWorkspaceVisit) {
      completeIntro();
    } else if (prefersReducedMotion) {
      completeIntro();
    } else if (introSeenThisSession) {
      completeIntro({ shortFade: true });
    } else {
      setTimeout(() => {
        if (introActive) introSkipHint.classList.add('visible');
      }, 1000);

      startMasterIntroTimeline();
    }
  });

})();
