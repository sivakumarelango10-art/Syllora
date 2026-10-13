# Syllora — Education & Learning Platform

> **Your syllabus, simplified.**  
> Plan, learn, and track academic progress in one place.

Welcome to the **Syllora** repository. This repository features the pixel-correct, GPU-compositor-orchestrated authentication experience for Syllora, engineered with locked 60/120fps motion, mathematically calibrated cubic-bezier easings, and accessibility standards.

---

## 📁 Repository Structure

All frontend application code is cleanly encapsulated within the dedicated `frontend/` directory:

```text
Syllora/
├── .agents/                 # AI agents & design skills configuration
├── .gitignore               # Clean system, OS, and dependency ignores
├── README.md                # Project documentation and master specifications
├── index.html               # Root redirect entrypoint to frontend/
├── assets/                  # Brand graphics & vectors
│   └── syllora-logo.jpg
├── frontend/                # Complete modular frontend application
│   ├── index.html           # Semantic HTML structure & outlined vector SVG definitions
│   ├── style.css            # Master design tokens, GPU scalers, and responsive CSS
│   ├── app.js               # Web Animations API master orchestrator
│   ├── logo.svg             # Standalone Syllora vector icon with outlined letter paths
│   └── assets/              # Frontend image and font assets
│       ├── fonts/           # Self-hosted latin-subset woff2 fonts
│       │   ├── inter-400.woff2
│       │   ├── inter-600.woff2
│       │   ├── poppins-500.woff2
│       │   └── poppins-600.woff2
│       ├── logo.svg
│       └── syllora-logo.jpg
└── skills-lock.json         # Agent dependencies lockfile
```

---

## 💎 Pixel-Correct Outlined Wordmark (Zero Layout Shift)

The Syllora wordmark is engineered with **outlined vector paths** rather than `<text>` or web fonts:
- Each letter (`S`, `y`, `l`, `l`, `o`, `r`, `a`) is an independent vector `<path>` with baked-in kerning and spacing matching Poppins SemiBold.
- Letters animate from their baseline using:
  ```css
  .ltr { transform-box: fill-box; transform-origin: 50% 100%; }
  ```
- Two stacked SVG layers eliminate fill-color repaints:
  - **Layer A**: Brand colors on off-white, executes the intro animation.
  - **Layer B**: Inverted colors for the teal panel, always fully drawn, starts at `opacity: 0`.
- The transition between backgrounds is an ultra-fast GPU opacity crossfade (`opacity: 1 → 0` and `0 → 1`) rather than per-frame SVG repaints.

---

## 🎨 Design Tokens & Palette

| Token | Value | Role |
| :--- | :--- | :--- |
| `--teal` | `#03605E` | Primary brand color (book covers, primary buttons) |
| `--teal-dark` | `#024A48` | Hover, active states, gradient depth |
| `--teal-light` | `#0A7A77` | Highlight stops in radial panel gradients |
| `--ink` | `#22272B` | Primary typography & charcoal wordmark |
| `--muted` | `#6B7280` | Secondary metadata and helper labels |
| `--bg` | `#FAFAF8` | Warm off-white canvas |
| `--line` | `#E3E5E2` | Borders, dividers, subtle outlines |
| `--input-bg` | `#FBFCFB` | Form field interior tint |
| `--error` | `#DC2626` | Accessible error validation alerts |

### Exact Bezier Curves
```css
--ease-out:    cubic-bezier(0.33, 1, 0.68, 1);    /* easeOutCubic */
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);    /* easeInOutCubic */
--ease-back:   cubic-bezier(0.34, 1.56, 0.64, 1); /* easeOutBack (1.56 overshoot) */
--ease-in:     cubic-bezier(0.55, 0, 0.9, 0.4);   /* accelerating flood */
```

---

## ⚡ Master Intro Timeline & Motion Architecture

All timings are controlled via a single `SPEED` constant (`1.0` default; set `0.75` for a snappier intro) and run on the Web Animations API compositor:

| Time | Element | Animation | Easing |
|---|---|---|---|
| **0.15 → 0.55s** | `.spine` | scaleY 0 → 1 (`transform-origin: center`) | `ease-out` |
| **0.60 → 1.00s** | `.spine` | opacity 1 → 0 | `linear` |
| **0.50 → 1.35s** | `.page-left`, `.page-right` | scaleX 0 → 1, scaleY 0.9 → 1, origin on spine edge | `ease-back` |
| **0.50 → 0.71s** | both pages | opacity 0 → 1 | `linear` |
| **1.30 → 2.00s** | `.check-reveal` | stroke-dashoffset 1.02 → 0 | `ease-in-out` |
| **1.95 + i×0.07s** | `.ltr` in Layer A | opacity 0 → 1, translateY 40 → 0 | `ease-out` |
| **2.40 → 3.20s** | logo wrapper | scale 1 → 1.03 (gentle breathe) | `ease-out` |
| **3.20 → 4.00s** | logo wrapper | glides from center to panel spot (`(50%, 48%) → (25%, 38%)`, scale 1.03 → 0.6) | `ease-in-out` |
| **3.85 → 4.85s** | panel reveal circle | `transform: scale(0 → 1)` growing from logo center | `ease-out` |
| **3.95 → 4.35s** | Layer A / Layer B | GPU opacity crossfade (A 1 → 0, B 0 → 1) | `ease-in-out` |
| **4.20 + i×0.08s** | 6 paper cards | opacity 0 → 1 | `ease-out` |
| **4.50 → 5.10s** | brand tagline | opacity 0 → 1, translateY 16px → 0 | `ease-out` |
| **4.65 → 5.25s** | sub-tagline + © | opacity 0 → 1, translateY 16px → 0 | `ease-out` |
| **4.70 → 5.40s** | login card | opacity 0 → 1, translateY 40px → 0 | `ease-out` |
| **4.90 + i×0.07s** | 8 card stagger items | opacity 0 → 1, translateY 14px → 0 | `ease-out` |

### Ultra-Smooth Motion Guarantees
1. **Compositor Only:** Only `transform` and `opacity` are animated.
2. **GPU Scalers:** The brand panel reveal and teal flood use circular elements animated with `transform: scale(0 → 1)` instead of CPU-heavy `clip-path` animations.
3. **Contained Morph:** Button is wrapped in a 396×56 box with `contain: strict`, isolating width changes from the rest of the document.
4. **Layer Hint Cleanup:** `will-change: transform, opacity` is added just prior to animation and removed upon completion, keeping the scaled logo crisp and unblurred.
5. **Compositor Ambient Drift:** Paper float and rotation run on pure CSS keyframes with negative delays, automatically pausing when the browser tab is hidden.

---

## 🔐 Interactions & Authentication

- **Instant Button Feedback:** `pointerdown` triggers `scale(0.965)` in the first frame.
- **Button Morph to Spinner:** 396px pill morphs into a 56px circle; 28px spinner rotates at 420°/s.
- **Mock Credentials:** `demo@syllora.com` / `password123` succeeds after 600ms; other credentials trigger a 400ms card shake and error state.
- **Teal Flood & Welcome Dashboard:** Expanding teal flood leads into an inverted Syllora logo intro and 200×4px progress bar animating via `scaleX(0 → 1)`.

---

## 💻 Local Development

```bash
# Clone the repository
git clone https://github.com/sivakumarelango10-art/Syllora.git
cd Syllora

# Start a local static server
python -m http.server 8080

# Visit the application:
# http://127.0.0.1:8080/ (automatically redirects to http://127.0.0.1:8080/frontend/index.html)
```

---

## 📄 License
© 2026 Syllora. All rights reserved.
