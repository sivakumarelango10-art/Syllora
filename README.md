# Syllora — Education & Learning Platform

> **Your syllabus, simplified.**  
> Plan, learn, and track academic progress in one place.

Welcome to the **Syllora** repository. This repository features the bespoke authentication and onboarding experience for Syllora, engineered with 60fps GPU-orchestrated SVG micro-animations, mathematically calibrated bezier easings, and accessibility standards.

---

## 📁 Repository Structure

All frontend application code is cleanly encapsulated within the dedicated `frontend/` directory:

```text
Syllora/
├── .agents/                 # AI agents & design skills configuration
├── .gitignore               # Ignored system and build artifacts
├── README.md                # Project documentation and specifications
├── index.html               # Root redirect entrypoint to frontend/
├── assets/                  # Brand graphics & vectors
│   └── syllora-logo.jpg
├── frontend/                # Complete modular frontend application
│   ├── index.html           # Main semantic HTML structure & SVG definitions
│   ├── style.css            # Design tokens, layouts, and responsive CSS
│   ├── app.js               # 60fps orchestration engine & interaction state
│   ├── logo.svg             # Standalone Syllora vector icon
│   └── assets/              # Frontend image assets & brand materials
│       ├── logo.svg
│       └── syllora-logo.jpg
└── skills-lock.json         # Agent dependencies lockfile
```

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

### Typography
- **Headings & Wordmark:** [Poppins](https://fonts.google.com/specimen/Poppins) (Weights: 500, 600)
- **Body & Controls:** [Inter](https://fonts.google.com/specimen/Inter) (Weights: 400, 600)

---

## ⚡ Animation Specification & Timeline

The animation sequence uses mathematical cubic-bezier curves for organic physics:
- **`easeOutCubic`** `(0.33, 1, 0.68, 1)`: Natural deceleration
- **`easeInOutCubic`** `(0.65, 0, 0.35, 1)`: Symmetrical transitions
- **`easeOutBack`** `(0.34, 1.56, 0.64, 1)`: 1.5 overshoot on the opening book
- **`easeInFlood`** `(0.55, 0, 0.9, 0.4)`: Power-curve acceleration for the teal flood

### Intro Timeline Sequence
1. **0.15s – 0.55s**: Vertical spine line expands outward (`scaleY: 0 → 1`).
2. **0.50s – 1.35s**: Book pages curve open with overshoot (`easeOutBack`).
3. **1.30s – 2.00s**: Vector checkmark cuts into the center through an SVG stroke mask.
4. **1.95s – 2.45s**: The 7 wordmark letters `S-y-l-l-o-r-a` stagger upward into place.
5. **2.40s – 3.20s**: Breathing pause at the center stage.
6. **3.20s – 4.00s**: Logo glides to the left panel (`(50%, 48%) → (25%, 38%)`, scale `1.0 → 0.6`).
7. **3.85s – 4.85s**: Left brand panel expands outward via dynamic `clip-path: circle(...)`.
8. **4.20s – 4.90s**: 6 ambient paper geometric shapes drift into the brand background.
9. **4.70s – 5.40s**: Right login card surfaces with staggered form controls.

### Authentication & Morph Sequence
- Button smoothly morphs from pill into a 52px circular spinner upon form submission.
- On verification, spinner checks out and morphs into an animated success checkmark.
- A radial teal flood (`clip-path: circle(2400px)`) sweeps outward from the button center.
- The **Welcome Dashboard Transition** emerges with white brand typography and progress bar.

---

## 🚀 Performance & Optimization Features

1. **Battery & Background Optimization:** Automatic pause of paper float loops via `document.addEventListener('visibilitychange')` when tab is backgrounded.
2. **Animation Frame Cleanup:** Explicit `cancelAnimationFrame` handles when the intro is skipped or completed.
3. **Passive Event Listeners:** Input, keydown, and click listeners marked `{ passive: true }` to maximize scroll and touch responsiveness.
4. **Debounced & Throttled Resize:** Viewport dimension recalculations throttled via `requestAnimationFrame`.
5. **Storage Resiliency:** `sessionStorage` lookups and writes wrapped with error guards for incognito and storage-restricted environments.
6. **Zero Dependencies:** Pure vanilla JavaScript, CSS, and SVG without heavy runtime overhead or bulky framework bundles.

---

## 💻 Local Development

To run the application locally:

```bash
# Clone the repository
git clone https://github.com/sivakumarelango10-art/Syllora.git
cd Syllora

# Start a local static server (Python or Node)
python -m http.server 8080
# Or: npx serve .

# Open in your browser:
# http://127.0.0.1:8080/ (redirects directly to http://127.0.0.1:8080/frontend/index.html)
```

---

## 📄 License
© 2026 Syllora. All rights reserved.
