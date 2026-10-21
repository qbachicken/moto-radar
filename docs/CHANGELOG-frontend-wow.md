# Changelog: MotoRadar Frontend "WOW" Redesign

Date: 2026-10-21
Branch: `feat/frontend-wow`

## Overview
MotoRadar has been transformed from a utilitarian, single-file script into a stunning, high-end cyberpunk/automotive dark-mode dashboard with glassmorphic cards, neon category accents, instant search, star persistence across reloads, toast notifications, and full PWA readiness.

---

## What Changed

1. **Visual System & Design** (`styles.css`, `index.html`):
   - **Glassmorphism & Aurora Gradients**: Deep obsidian base (`#05070d`) with subtle ambient radial glows and frosted glass cards (`backdrop-filter: blur(16px)`).
   - **Category Color Coding (`data-cat`)**: Distinct glowing accent bars on event cards for Rajdy (crimson), Wyprawy (emerald), Szkolenia (violet), Tory (cyan), and Zloty (amber).
   - **Tactile Cards**: Smooth hover lifts, accordion expansion for details, pulse animation for imminent events ("Dziś", "Jutro"), and accessible focus rings.

2. **Architecture & Modularity** (`js/logic.js`, `js/app.js`):
   - Split monolithic `index.html` into clean ES modules.
   - **Pure Logic Layer** (`js/logic.js`): Extracted date parsing, Polish diacritic folding (`foldPl`), event deduplication, filtering, and sorting into pure functions with 100% unit test coverage (`node --test`).
   - **Safe Persistence**: Local storage reads use resilient JSON parsing (`loadJson`) that never throws on corrupt data.
   - **Star Persistence**: Star toggles are now persistently tracked in `localStorage.motoradar_starred` and survive reloads and data updates.

3. **Search & Filtering**:
   - **Instant Search**: Diacritic-insensitive substring search over title, location, category and description with 120ms debounce.
   - **Robust Distance Filtering**: Unknown-location events (`distanceKm: null`) are never hidden by the distance slider.

4. **UX & Feedback**:
   - Replaced disruptive browser `alert()` and `confirm()` dialogs with sleek animated bottom toasts.
   - Star toggle triggers a satisfying WebAudio chime and haptic vibration (`navigator.vibrate`).
   - Shimmer skeleton loaders replace the plain text "Ładowanie...".

5. **PWA & Assets** (`manifest.json`, `sw.js`, `tools/make_icons.py`):
   - Generated crisp, rounded PNG icons (192, 512, maskable 512) using Pillow.
   - Configured app shortcuts and versioned shell cache (`motoradar-v2`) with network-first fallback for `events.json`.

---

## What Did Not Change
- `fetcher.py` and its automated background schedule remain 100% untouched.
- The underlying `events.json` data schema is fully preserved.
- Groq AI cleanup integration and automated event reminders are fully intact.
- Python unit tests (`test_moto_radar.py`) continue to pass.

---

## How to Verify Locally

1. **Run Unit Tests**:
   ```bash
   npm test
   python -m pytest test_moto_radar.py -q
   ```
2. **Start Local Server**:
   ```bash
   python -m http.server 8765
   ```
   Open `http://localhost:8765/` in your browser.
