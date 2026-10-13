/**
 * ============================================================================
 * SYLLORA AUTHENTICATION ENGINE
 * Exact Timings, Easings, Geometry & 60fps GPU Orchestration
 * ============================================================================
 */

(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // 1. Exact Timings & Easings Specification
  // --------------------------------------------------------------------------
  const TIMINGS = {
    // Intro Timeline (seconds from load)
    spineGrow: [0.15, 0.55],
    spineFade: [0.60, 1.00],
    bookOpen: [0.50, 1.35],
    checkDraw: [1.30, 2.00],
    wordmarkBase: 1.95,
    wordmarkStagger: 0.07,
    wordmarkDuration: 0.50,
    breathe: [2.40, 3.20],
    logoGlide: [3.20, 4.00],
    panelReveal: [3.85, 4.85],
    colorInvert: [3.95, 4.35],
    paperFadeBase: 4.20,
    paperFadeStagger: 0.08,
    paperFadeDuration: 0.70,
    tagline: [4.50, 5.10],
    subtagline: [4.65, 5.25],
    cardEnter: [4.70, 5.40],
    cardStaggerBase: 4.90,
    cardStaggerStep: 0.07,
    cardStaggerDuration: 0.50,
    introTotal: 5.60,

    // Submit & Loading (seconds after click)
    btnLabelFade: [0.15, 0.35],
    btnMorphCircle: [0.15, 0.60],
    spinnerFade: [0.50, 0.65],
    mockAuthDuration: 1.20,

    // Success (seconds after auth success)
    spinnerOut: [0.00, 0.15],
    checkDrawMorph: [0.05, 0.40],
    checkPop: [0.05, 0.45],
    btnBgRestore: [0.00, 0.30],
    tealFlood: [0.65, 1.45],

    // Welcome Screen (seconds after flood completes)
    welcomeBookOpen: [0.05, 0.75],
    welcomeCheckDraw: [0.60, 1.15],
    welcomeWordmarkBase: 0.95,
    welcomeWordmarkStagger: 0.05,
    welcomeWordmarkDuration: 0.40,
    welcomeTitle: [1.30, 1.80],
    welcomeSub: [1.45, 1.95],
    progressBarFill: [1.65, 3.05]
  };

  // Exact Mathematical Easing Curves
  function easeOutCubic(p) {
    return 1 - Math.pow(1 - p, 3);
  }

  function easeInOutCubic(p) {
    return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  }

  function easeOutBack(p) {
    const c1 = 1.70158 * 1.5; // Overshoot 1.5
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
  }

  function easeInFlood(p) {
    return Math.pow(p, 2.2); // p^2.2 acceleration
  }

  function linear(p) {
    return p;
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function interpolate(p, from, to) {
    return from + (to - from) * p;
  }

  function hexToRgb(hex) {
    const bigint = parseInt(hex.replace('#', ''), 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
  }

  function lerpColor(fromHex, toHex, p) {
    const [r1, g1, b1] = hexToRgb(fromHex);
    const [r2, g2, b2] = hexToRgb(toHex);
    const r = Math.round(interpolate(p, r1, r2));
    const g = Math.round(interpolate(p, g1, g2));
    const b = Math.round(interpolate(p, b1, b2));
    return `rgb(${r},${g},${b})`;
  }

  // --------------------------------------------------------------------------
  // 2. DOM Cache
  // --------------------------------------------------------------------------
  const brandPanel = document.getElementById('brandPanel');
  const introLogoRig = document.getElementById('introLogoRig');
  const spine = document.getElementById('spine');
  const pageLeft = document.getElementById('pageLeft');
  const pageRight = document.getElementById('pageRight');
  const checkReveal = document.getElementById('checkReveal');
  const check = document.getElementById('check');
  const wmLetters = Array.from(document.querySelectorAll('#wordmark .wm-letter'));

  const paperItems = Array.from(document.querySelectorAll('.paper-item'));
  const brandTagline = document.getElementById('brandTagline');
  const brandSubtagline = document.getElementById('brandSubtagline');
  const brandCopyright = document.getElementById('brandCopyright');

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

  // Flood & Welcome Screen
  const tealFloodOverlay = document.getElementById('tealFloodOverlay');
  const welcomePageLeft = document.getElementById('welcomePageLeft');
  const welcomePageRight = document.getElementById('welcomePageRight');
  const welcomeCheckReveal = document.getElementById('welcomeCheckReveal');
  const welcomeWmLetters = Array.from(document.querySelectorAll('#welcomeWordmark .welcome-wm-letter'));
  const welcomeTitle = document.getElementById('welcomeTitle');
  const welcomeSub = document.getElementById('welcomeSub');
  const welcomeProgressTrack = document.getElementById('welcomeProgressTrack');
  const welcomeProgressFill = document.getElementById('welcomeProgressFill');
  const a11yAnnouncer = document.getElementById('a11yAnnouncer');

  // State
  let introActive = true;
  let introStartTime = null;
  let ambientActive = false;
  let isSubmitting = false;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasVisitedSession = sessionStorage.getItem('syllora_intro_played') === 'true';

  // --------------------------------------------------------------------------
  // 3. Decorative Paper Shapes Positioning
  // --------------------------------------------------------------------------
  function layoutPaperShapes() {
    const isDesktop = window.innerWidth >= 900;
    const panelWidth = isDesktop ? window.innerWidth * 0.5 : window.innerWidth;
    const panelHeight = isDesktop ? window.innerHeight : window.innerHeight * 0.4;
    const scaleX = panelWidth / 960;
    const scaleY = panelHeight / 1080;

    paperItems.forEach((el) => {
      const left = parseFloat(el.getAttribute('data-left')) * scaleX;
      const top = parseFloat(el.getAttribute('data-top')) * scaleY;
      const w = parseFloat(el.getAttribute('data-w')) * scaleX;
      const h = parseFloat(el.getAttribute('data-h')) * scaleY;
      const rot = parseFloat(el.getAttribute('data-rot'));

      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.dataset.currentRot = rot;
      el.dataset.currentLeft = left;
      el.dataset.currentTop = top;
      el.style.transform = `rotate(${rot}deg)`;
    });
  }

  // --------------------------------------------------------------------------
  // 4. Intro Animation Engine (RequestAnimationFrame Timeline)
  // --------------------------------------------------------------------------
  function getLogoCoordinates() {
    const isDesktop = window.innerWidth >= 900;
    const startX = 0.50 * window.innerWidth - 310;
    const startY = 0.48 * window.innerHeight - 271.25;
    const startScale = 1.0;

    let endX, endY, endScale, panelCenterX, panelCenterY;
    if (isDesktop) {
      endX = 0.25 * window.innerWidth - 310;
      endY = 0.38 * window.innerHeight - 271.25;
      endScale = 0.60;
      panelCenterX = 0.25 * window.innerWidth;
      panelCenterY = 0.38 * window.innerHeight;
    } else {
      endX = 0.50 * window.innerWidth - 310;
      endY = 0.18 * window.innerHeight - 271.25;
      endScale = 0.45;
      panelCenterX = 0.50 * window.innerWidth;
      panelCenterY = 0.18 * window.innerHeight;
    }

    return { startX, startY, startScale, endX, endY, endScale, panelCenterX, panelCenterY };
  }

  function runIntroTimeline(now) {
    if (!introActive) return;
    if (!introStartTime) introStartTime = now;
    const elapsed = (now - introStartTime) / 1000; // in seconds

    const coords = getLogoCoordinates();

    // 0.15 -> 0.55s: Spine line grows (scaleY 0 -> 1, origin center y 586)
    if (elapsed >= TIMINGS.spineGrow[0] && elapsed <= TIMINGS.spineGrow[1]) {
      const p = easeOutCubic((elapsed - TIMINGS.spineGrow[0]) / (TIMINGS.spineGrow[1] - TIMINGS.spineGrow[0]));
      spine.style.transform = `scaleY(${p})`;
    } else if (elapsed > TIMINGS.spineGrow[1]) {
      spine.style.transform = 'scaleY(1)';
    }

    // 0.60 -> 1.00s: Spine fades out
    if (elapsed >= TIMINGS.spineFade[0] && elapsed <= TIMINGS.spineFade[1]) {
      const p = linear((elapsed - TIMINGS.spineFade[0]) / (TIMINGS.spineFade[1] - TIMINGS.spineFade[0]));
      spine.style.opacity = `${1 - p}`;
    } else if (elapsed > TIMINGS.spineFade[1]) {
      spine.style.opacity = '0';
    }

    // 0.50 -> 1.35s: Book opens (scaleX 0 -> 1 with easeOutBack overshoot, scaleY 0.9 -> 1)
    if (elapsed >= TIMINGS.bookOpen[0] && elapsed <= TIMINGS.bookOpen[1]) {
      const p = (elapsed - TIMINGS.bookOpen[0]) / (TIMINGS.bookOpen[1] - TIMINGS.bookOpen[0]);
      const pBack = easeOutBack(p);
      const pCubic = easeOutCubic(p);
      const opacity = clamp(p / 0.25, 0, 1);

      pageLeft.style.transform = `scaleX(${pBack}) scaleY(${interpolate(pCubic, 0.9, 1)})`;
      pageRight.style.transform = `scaleX(${pBack}) scaleY(${interpolate(pCubic, 0.9, 1)})`;
      pageLeft.style.opacity = `${opacity}`;
      pageRight.style.opacity = `${opacity}`;
    } else if (elapsed > TIMINGS.bookOpen[1]) {
      pageLeft.style.transform = 'scaleX(1) scaleY(1)';
      pageRight.style.transform = 'scaleX(1) scaleY(1)';
      pageLeft.style.opacity = '1';
      pageRight.style.opacity = '1';
    }

    // 1.30 -> 2.00s: Checkmark draws in (stroke-dashoffset 1.02 -> 0)
    if (elapsed >= TIMINGS.checkDraw[0] && elapsed <= TIMINGS.checkDraw[1]) {
      const p = easeInOutCubic((elapsed - TIMINGS.checkDraw[0]) / (TIMINGS.checkDraw[1] - TIMINGS.checkDraw[0]));
      const dash = interpolate(p, 1.02, 0);
      checkReveal.style.strokeDashoffset = `${dash}`;
    } else if (elapsed > TIMINGS.checkDraw[1]) {
      checkReveal.style.strokeDashoffset = '0';
    }

    // 1.95 + i*0.07 -> +0.50s: Wordmark letters rise one by one
    wmLetters.forEach((letter, i) => {
      const start = TIMINGS.wordmarkBase + i * TIMINGS.wordmarkStagger;
      const end = start + TIMINGS.wordmarkDuration;
      if (elapsed >= start && elapsed <= end) {
        const p = easeOutCubic((elapsed - start) / (end - start));
        letter.style.opacity = `${p}`;
        letter.style.transform = `translateY(${interpolate(p, 40, 0)}px)`;
      } else if (elapsed > end) {
        letter.style.opacity = '1';
        letter.style.transform = 'translateY(0px)';
      }
    });

    // 2.40 -> 3.20s: Gentle "breathe" (scale 1.00 -> 1.03)
    let currentLogoScale = coords.startScale;
    let currentLogoX = coords.startX;
    let currentLogoY = coords.startY;

    if (elapsed >= TIMINGS.breathe[0] && elapsed <= TIMINGS.breathe[1]) {
      const p = easeOutCubic((elapsed - TIMINGS.breathe[0]) / (TIMINGS.breathe[1] - TIMINGS.breathe[0]));
      currentLogoScale = interpolate(p, 1.00, 1.03);
    } else if (elapsed > TIMINGS.breathe[1] && elapsed < TIMINGS.logoGlide[0]) {
      currentLogoScale = 1.03;
    }

    // 3.20 -> 4.00s: Logo glides to left panel (scale 1.03 -> 0.60, position center -> left panel)
    if (elapsed >= TIMINGS.logoGlide[0] && elapsed <= TIMINGS.logoGlide[1]) {
      const p = easeInOutCubic((elapsed - TIMINGS.logoGlide[0]) / (TIMINGS.logoGlide[1] - TIMINGS.logoGlide[0]));
      currentLogoX = interpolate(p, coords.startX, coords.endX);
      currentLogoY = interpolate(p, coords.startY, coords.endY);
      currentLogoScale = interpolate(p, 1.03, coords.endScale);
    } else if (elapsed > TIMINGS.logoGlide[1]) {
      currentLogoX = coords.endX;
      currentLogoY = coords.endY;
      currentLogoScale = coords.endScale;
    }

    introLogoRig.style.transform = `translate(${currentLogoX}px, ${currentLogoY}px) scale(${currentLogoScale})`;

    // 3.85 -> 4.85s: Teal panel reveals as a circle (R 0 -> 1250px)
    if (elapsed >= TIMINGS.panelReveal[0] && elapsed <= TIMINGS.panelReveal[1]) {
      const p = easeOutCubic((elapsed - TIMINGS.panelReveal[0]) / (TIMINGS.panelReveal[1] - TIMINGS.panelReveal[0]));
      const radius = interpolate(p, 0, 1250);
      brandPanel.style.clipPath = `circle(${radius}px at ${coords.panelCenterX}px ${coords.panelCenterY}px)`;
    } else if (elapsed > TIMINGS.panelReveal[1]) {
      brandPanel.style.clipPath = `circle(1250px at ${coords.panelCenterX}px ${coords.panelCenterY}px)`;
    }

    // 3.95 -> 4.35s: Logo colors invert
    // pages #03605E -> #FFFFFF; checkmark fill #FAFAF8 -> #03605E; wordmark #22272B -> #FFFFFF
    if (elapsed >= TIMINGS.colorInvert[0] && elapsed <= TIMINGS.colorInvert[1]) {
      const p = easeInOutCubic((elapsed - TIMINGS.colorInvert[0]) / (TIMINGS.colorInvert[1] - TIMINGS.colorInvert[0]));
      const pageColor = lerpColor('#03605E', '#FFFFFF', p);
      const checkColor = lerpColor('#FAFAF8', '#03605E', p);
      const wmColor = lerpColor('#22272B', '#FFFFFF', p);

      pageLeft.style.fill = pageColor;
      pageRight.style.fill = pageColor;
      check.style.fill = checkColor;
      wmLetters.forEach((l) => (l.style.fill = wmColor));
    } else if (elapsed > TIMINGS.colorInvert[1]) {
      pageLeft.style.fill = '#FFFFFF';
      pageRight.style.fill = '#FFFFFF';
      check.style.fill = '#03605E';
      wmLetters.forEach((l) => (l.style.fill = '#FFFFFF'));
    }

    // 4.20 + i*0.08 -> +0.70s: Paper shapes fade in (opacity 0 -> 1)
    paperItems.forEach((paper, i) => {
      const start = TIMINGS.paperFadeBase + i * TIMINGS.paperFadeStagger;
      const end = start + TIMINGS.paperFadeDuration;
      if (elapsed >= start && elapsed <= end) {
        const p = easeOutCubic((elapsed - start) / (end - start));
        paper.style.opacity = `${p}`;
      } else if (elapsed > end) {
        paper.style.opacity = '1';
      }
    });

    // 4.50 -> 5.10s: Tagline
    if (elapsed >= TIMINGS.tagline[0] && elapsed <= TIMINGS.tagline[1]) {
      const p = easeOutCubic((elapsed - TIMINGS.tagline[0]) / (TIMINGS.tagline[1] - TIMINGS.tagline[0]));
      brandTagline.style.opacity = `${p}`;
      brandTagline.style.transform = `translateY(${interpolate(p, 16, 0)}px)`;
    } else if (elapsed > TIMINGS.tagline[1]) {
      brandTagline.style.opacity = '1';
      brandTagline.style.transform = 'translateY(0px)';
    }

    // 4.65 -> 5.25s: Sub-tagline + copyright
    if (elapsed >= TIMINGS.subtagline[0] && elapsed <= TIMINGS.subtagline[1]) {
      const p = easeOutCubic((elapsed - TIMINGS.subtagline[0]) / (TIMINGS.subtagline[1] - TIMINGS.subtagline[0]));
      brandSubtagline.style.opacity = `${p}`;
      brandSubtagline.style.transform = `translateY(${interpolate(p, 16, 0)}px)`;
      brandCopyright.style.opacity = `${p}`;
      brandCopyright.style.transform = `translateY(${interpolate(p, 16, 0)}px)`;
    } else if (elapsed > TIMINGS.subtagline[1]) {
      brandSubtagline.style.opacity = '1';
      brandSubtagline.style.transform = 'translateY(0px)';
      brandCopyright.style.opacity = '1';
      brandCopyright.style.transform = 'translateY(0px)';
    }

    // 4.70 -> 5.40s: Card enters (opacity 0 -> 1, translateY 40px -> 0)
    if (elapsed >= TIMINGS.cardEnter[0] && elapsed <= TIMINGS.cardEnter[1]) {
      const p = easeOutCubic((elapsed - TIMINGS.cardEnter[0]) / (TIMINGS.cardEnter[1] - TIMINGS.cardEnter[0]));
      loginCard.style.opacity = `${p}`;
      loginCard.style.transform = `translateY(${interpolate(p, 40, 0)}px)`;
    } else if (elapsed > TIMINGS.cardEnter[1]) {
      loginCard.style.opacity = '1';
      loginCard.style.transform = 'translateY(0px)';
    }

    // 4.90 + i*0.07 -> +0.50s: Card items stagger in
    cardStaggerItems.forEach((item, i) => {
      const start = TIMINGS.cardStaggerBase + i * TIMINGS.cardStaggerStep;
      const end = start + TIMINGS.cardStaggerDuration;
      if (elapsed >= start && elapsed <= end) {
        const p = easeOutCubic((elapsed - start) / (end - start));
        item.style.opacity = `${p}`;
        item.style.transform = `translateY(${interpolate(p, 14, 0)}px)`;
      } else if (elapsed > end) {
        item.style.opacity = '1';
        item.style.transform = 'translateY(0px)';
      }
    });

    // Check completion of intro
    if (elapsed >= TIMINGS.introTotal) {
      finishIntro();
      return;
    }

    requestAnimationFrame(runIntroTimeline);
  }

  // Finalize Intro State
  function finishIntro() {
    introActive = false;
    sessionStorage.setItem('syllora_intro_played', 'true');
    introSkipHint.classList.remove('visible');

    // Force final positions and properties
    const coords = getLogoCoordinates();
    introLogoRig.style.transform = `translate(${coords.endX}px, ${coords.endY}px) scale(${coords.endScale})`;
    brandPanel.style.clipPath = `circle(1250px at ${coords.panelCenterX}px ${coords.panelCenterY}px)`;

    spine.style.opacity = '0';
    pageLeft.style.transform = 'scaleX(1) scaleY(1)';
    pageRight.style.transform = 'scaleX(1) scaleY(1)';
    pageLeft.style.opacity = '1';
    pageRight.style.opacity = '1';
    pageLeft.style.fill = '#FFFFFF';
    pageRight.style.fill = '#FFFFFF';
    check.style.fill = '#03605E';
    checkReveal.style.strokeDashoffset = '0';

    wmLetters.forEach((l) => {
      l.style.opacity = '1';
      l.style.transform = 'translateY(0px)';
      l.style.fill = '#FFFFFF';
    });

    paperItems.forEach((p) => (p.style.opacity = '1'));
    brandTagline.style.opacity = '1';
    brandTagline.style.transform = 'translateY(0px)';
    brandSubtagline.style.opacity = '1';
    brandSubtagline.style.transform = 'translateY(0px)';
    brandCopyright.style.opacity = '1';
    brandCopyright.style.transform = 'translateY(0px)';

    loginCard.style.opacity = '1';
    loginCard.style.transform = 'translateY(0px)';
    cardStaggerItems.forEach((item) => {
      item.style.opacity = '1';
      item.style.transform = 'translateY(0px)';
    });

    // Start ambient papers drift loop
    ambientActive = true;
    requestAnimationFrame(runAmbientPapersLoop);

    // Focus email input automatically
    setTimeout(() => emailInput.focus(), 80);
  }

  // Skip straight to final state over 300ms
  function skipIntro() {
    if (!introActive) return;
    introActive = false;
    introSkipHint.classList.remove('visible');

    // Smooth 300ms transition to final state
    document.body.style.transition = 'opacity 300ms var(--ease-out-cubic)';
    document.body.style.opacity = '0.9';

    setTimeout(() => {
      finishIntro();
      document.body.style.opacity = '1';
      setTimeout(() => (document.body.style.transition = ''), 320);
    }, 150);
  }

  // --------------------------------------------------------------------------
  // 5. Ambient Loop for Decorative Papers
  // rotate = base + 6° * sin(time*0.5 + i*1.7)
  // translateY = 14px * sin(time*0.6 + i)
  // --------------------------------------------------------------------------
  function runAmbientPapersLoop(now) {
    if (!ambientActive || prefersReducedMotion) return;
    const time = now / 1000;

    paperItems.forEach((el, i) => {
      const baseRot = parseFloat(el.getAttribute('data-rot'));
      const rot = baseRot + 6 * Math.sin(time * 0.5 + i * 1.7);
      const ty = 14 * Math.sin(time * 0.6 + i);
      el.style.transform = `translateY(${ty}px) rotate(${rot}deg)`;
    });

    requestAnimationFrame(runAmbientPapersLoop);
  }

  // --------------------------------------------------------------------------
  // 6. User Interactions & Validation
  // --------------------------------------------------------------------------
  togglePasswordBtn.addEventListener('click', () => {
    const isPassword = passwordInput.getAttribute('type') === 'password';
    passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
    eyeIconShow.style.display = isPassword ? 'none' : 'block';
    eyeIconHide.style.display = isPassword ? 'block' : 'none';
    togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
  });

  function isValidEmail(val) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  }

  function setFieldError(group, errorEl, msg) {
    group.classList.add('has-error');
    errorEl.textContent = msg;
  }

  function clearFieldError(group, errorEl) {
    group.classList.remove('has-error');
    errorEl.textContent = '';
  }

  emailInput.addEventListener('input', () => clearFieldError(emailGroup, emailError));
  passwordInput.addEventListener('input', () => clearFieldError(passwordGroup, passwordError));

  // Skip handlers (any click or keypress during intro)
  window.addEventListener('click', () => {
    if (introActive) skipIntro();
  });

  window.addEventListener('keydown', (e) => {
    if (introActive && e.key !== 'Tab') {
      skipIntro();
    }
  });

  // Window resize updater
  window.addEventListener('resize', () => {
    layoutPaperShapes();
    if (!introActive) {
      const coords = getLogoCoordinates();
      introLogoRig.style.transform = `translate(${coords.endX}px, ${coords.endY}px) scale(${coords.endScale})`;
      brandPanel.style.clipPath = `circle(1250px at ${coords.panelCenterX}px ${coords.panelCenterY}px)`;
    }
  });

  // --------------------------------------------------------------------------
  // 7. Form Submission: Loading, Error & Success Morph Sequence
  // --------------------------------------------------------------------------
  authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    clearFieldError(emailGroup, emailError);
    clearFieldError(passwordGroup, passwordError);

    let hasError = false;
    const emailVal = emailInput.value.trim();
    const passwordVal = passwordInput.value;

    if (!emailVal || !isValidEmail(emailVal)) {
      setFieldError(emailGroup, emailError, 'Please enter a valid email address');
      hasError = true;
    }

    if (!passwordVal || passwordVal.length < 8) {
      setFieldError(passwordGroup, passwordError, 'Password must be at least 8 characters');
      hasError = true;
    }

    if (hasError) {
      triggerCardShake();
      return;
    }

    // Submit -> Loading sequence
    startSubmitLoading();

    // Mock Authentication (1.2s timeout)
    // demo@syllora.com / password123 succeeds; any other fails!
    setTimeout(() => {
      const isSuccess = (emailVal === 'demo@syllora.com' && passwordVal === 'password123');

      if (isSuccess) {
        handleAuthSuccess();
      } else {
        handleAuthError();
      }
    }, 1200);
  });

  // Loading morph: width 396 -> 56, radius 14 -> 28, bg #024A48
  function startSubmitLoading() {
    isSubmitting = true;
    loginBtn.disabled = true;
    loginBtn.classList.add('is-loading');
    loginBtn.setAttribute('aria-busy', 'true');
    a11yAnnouncer.textContent = 'Logging in...';

    // 0.15 -> 0.35s: label fades out
    setTimeout(() => {
      btnLabel.style.opacity = '0';
    }, 150);

    // 0.15 -> 0.60s: button morphs into 56px circle
    setTimeout(() => {
      loginBtn.style.transition = 'width 450ms var(--ease-in-out-cubic), border-radius 450ms var(--ease-in-out-cubic), background-color 450ms var(--ease-in-out-cubic)';
      loginBtn.style.width = '56px';
      loginBtn.style.borderRadius = '28px';
      loginBtn.style.backgroundColor = '#024A48';
    }, 150);

    // 0.50 -> 0.65s: spinner fades in
    setTimeout(() => {
      btnSpinner.style.display = 'flex';
      btnSpinner.style.transition = 'opacity 150ms linear';
      btnSpinner.style.opacity = '1';
    }, 500);
  }

  // Error State: restore full width, shake card, red field
  function handleAuthError() {
    isSubmitting = false;
    loginBtn.disabled = false;
    loginBtn.classList.remove('is-loading');
    loginBtn.setAttribute('aria-busy', 'false');

    // Morph back to 396px button over 0.4s
    btnSpinner.style.display = 'none';
    btnSpinner.style.opacity = '0';
    loginBtn.style.transition = 'width 400ms var(--ease-in-out-cubic), border-radius 400ms var(--ease-in-out-cubic), background-color 400ms var(--ease-in-out-cubic)';
    loginBtn.style.width = '396px';
    loginBtn.style.borderRadius = '14px';
    loginBtn.style.backgroundColor = '#03605E';

    setTimeout(() => {
      btnLabel.style.opacity = '1';
    }, 150);

    // Card horizontal shake
    triggerCardShake();

    // Mark field error
    setFieldError(passwordGroup, passwordError, 'Incorrect email or password');
    a11yAnnouncer.textContent = 'Incorrect email or password';
  }

  function triggerCardShake() {
    loginCard.classList.remove('shake');
    void loginCard.offsetWidth; // Force reflow
    loginCard.classList.add('shake');
    setTimeout(() => loginCard.classList.remove('shake'), 420);
  }

  // Success State Sequence
  function handleAuthSuccess() {
    a11yAnnouncer.textContent = 'Login successful. Redirecting...';

    // 0 -> 0.15s: spinner fades out
    btnSpinner.style.opacity = '0';
    setTimeout(() => {
      btnSpinner.style.display = 'none';
    }, 150);

    // 0.05 -> 0.40s: checkmark draws inside circle
    setTimeout(() => {
      btnCheckmarkMorph.style.display = 'flex';
      morphCheckPath.style.transition = 'stroke-dashoffset 350ms var(--ease-out-cubic)';
      morphCheckPath.style.strokeDashoffset = '0';
    }, 50);

    // 0.05 -> 0.45s: check "pop" scale 1 -> 1.12 -> 1
    setTimeout(() => {
      btnCheckmarkMorph.style.transition = 'transform 200ms ease';
      btnCheckmarkMorph.style.transform = 'scale(1.12)';
      setTimeout(() => {
        btnCheckmarkMorph.style.transform = 'scale(1)';
      }, 200);
    }, 50);

    // 0 -> 0.30s: button bg back to #03605E
    loginBtn.style.backgroundColor = '#03605E';

    // 0.65 -> 1.45s: Teal flood: clip-path circle(R at button center) R: 0 -> 2400px
    setTimeout(() => {
      const btnRect = loginBtn.getBoundingClientRect();
      const btnCenterX = btnRect.left + btnRect.width / 2;
      const btnCenterY = btnRect.top + btnRect.height / 2;

      tealFloodOverlay.classList.add('active');
      tealFloodOverlay.style.clipPath = `circle(0px at ${btnCenterX}px ${btnCenterY}px)`;
      tealFloodOverlay.style.transition = 'clip-path 800ms var(--ease-in-flood)';

      // Trigger flood expansion
      requestAnimationFrame(() => {
        tealFloodOverlay.style.clipPath = `circle(2400px at ${btnCenterX}px ${btnCenterY}px)`;
      });

      // Welcome Screen timeline (starts when flood finishes at ~1.45s)
      setTimeout(runWelcomeScreenSequence, 800);
    }, 650);
  }

  // Welcome Screen Sequence
  function runWelcomeScreenSequence() {
    // 0.05 -> 0.75s: logo pages open (white)
    setTimeout(() => {
      welcomePageLeft.style.transition = 'transform 700ms var(--ease-out-back)';
      welcomePageRight.style.transition = 'transform 700ms var(--ease-out-back)';
      welcomePageLeft.style.transform = 'scaleX(1)';
      welcomePageRight.style.transform = 'scaleX(1)';
    }, 50);

    // 0.60 -> 1.15s: checkmark draws
    setTimeout(() => {
      welcomeCheckReveal.style.transition = 'stroke-dashoffset 550ms var(--ease-in-out-cubic)';
      welcomeCheckReveal.style.strokeDashoffset = '0';
    }, 600);

    // 0.95 + i*0.05s: letters rise
    welcomeWmLetters.forEach((l, i) => {
      setTimeout(() => {
        l.style.transition = 'opacity 400ms var(--ease-out-cubic), transform 400ms var(--ease-out-cubic)';
        l.style.opacity = '1';
        l.style.transform = 'translateY(0px)';
      }, 950 + i * 50);
    });

    // 1.30 -> 1.80s: "Welcome back!" Poppins 600, 46px, white
    setTimeout(() => {
      welcomeTitle.style.transition = 'opacity 500ms var(--ease-out-cubic), transform 500ms var(--ease-out-cubic)';
      welcomeTitle.style.opacity = '1';
      welcomeTitle.style.transform = 'translate(-50%, 0px)';
    }, 1300);

    // 1.45 -> 1.95s: "Taking you to your dashboard…" Inter 20px, white 75%
    setTimeout(() => {
      welcomeSub.style.transition = 'opacity 500ms var(--ease-out-cubic), transform 500ms var(--ease-out-cubic)';
      welcomeSub.style.opacity = '1';
      welcomeSub.style.transform = 'translate(-50%, 0px)';
    }, 1450);

    // 1.45s: Progress bar track appears
    setTimeout(() => {
      welcomeProgressTrack.style.transition = 'opacity 300ms ease';
      welcomeProgressTrack.style.opacity = '1';
    }, 1450);

    // 1.65 -> 3.05s: Progress fill animates 0 -> 100% over 1.4s (easeInOutCubic)
    setTimeout(() => {
      welcomeProgressFill.style.transition = 'width 1400ms var(--ease-in-out-cubic)';
      welcomeProgressFill.style.width = '100%';

      // On completion -> simulated navigation
      setTimeout(() => {
        a11yAnnouncer.textContent = 'Welcome to Syllora Dashboard!';
        // Simulating navigation
        console.log('Navigating to /dashboard...');
      }, 1450);
    }, 1650);
  }

  // Google SSO Click Simulation
  googleBtn.addEventListener('click', () => {
    emailInput.value = 'demo@syllora.com';
    passwordInput.value = 'password123';
    clearFieldError(emailGroup, emailError);
    clearFieldError(passwordGroup, passwordError);
    authForm.dispatchEvent(new Event('submit'));
  });

  // --------------------------------------------------------------------------
  // 8. Bootstrap
  // --------------------------------------------------------------------------
  layoutPaperShapes();

  if (prefersReducedMotion || hasVisitedSession) {
    // Skip intro on reduced motion or later session visits
    finishIntro();
  } else {
    // Show subtle skip hint after 1 second
    setTimeout(() => {
      if (introActive) introSkipHint.classList.add('visible');
    }, 1000);

    // Kick off exact timeline
    requestAnimationFrame(runIntroTimeline);
  }

})();
