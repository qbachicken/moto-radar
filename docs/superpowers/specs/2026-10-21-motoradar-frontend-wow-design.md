# MotoRadar — Frontend "WOW" Redesign (Design Spec)

Date: 2026-10-21
Status: approved for planning
Repo: `E:\CloudCLI\moto-radar` (github: qbachicken/moto-radar, branch `main`)

## 1. Intent

MotoRadar works. It scrapes Polish automotive calendars into `events.json`, dedupes
them in `fetcher.py`, and renders them in a single 739-line `index.html`. The user's
verdict: **readability is fine, but it looks like a plain, generic interface — it
needs a WOW effect.**

The job of this redesign is to make MotoRadar feel like a premium automotive
cockpit: dark, glassy, neon-accented, with real motion and instant feedback — while
keeping the zero-build, offline-first PWA character that makes it deployable on
GitHub Pages and installable on a phone home screen.

## 2. Goals

- A distinct visual identity (deep-space dark base + crimson/cyan/amber accents).
- Event cards that feel tactile: category accent bar, glowing badges, animated star,
  smooth accordion expansion, "Dziś"/"Za 3 dni" countdown chips.
- Instant search across title, location and description (diacritic-insensitive).
- Predictable ordering: nearest date first, undated events last.
- Feedback instead of `alert()`: toast notifications, skeletons while loading.
- Star state that survives a reload (today it is silently lost — see §7).
- Mobile-first layout with a FAB + bottom sheet for adding events and settings.
- Accessibility and motion hygiene: focus rings, ARIA state, `prefers-reduced-motion`.

## 3. Non-goals

- No changes to `fetcher.py`, its sources, or its dedupe heuristics.
- No server, no accounts, no database. localStorage stays the only persistence.
- No framework, no bundler, no build step, no new runtime dependencies.

## 4. Anti-goals

- A SPA rewrite or a React/Vue migration.
- Decorative motion that fights the user (parallax everywhere, long transitions).
- Losing the Groq AI cleanup feature or the notification reminders.

## 5. Constraints

- Vanilla HTML + CSS + ES modules; served as static files over HTTP (GitHub Pages).
- Must work on Chrome Android, iOS Safari 16+, desktop Chrome/Edge.
- All user-facing copy in Polish (existing wording preserved where it still fits).
- Data contract from `events.json` unchanged: `title`, `fullDescription`,
  `subCategory`, `location`, `locationType` (`exact` | `approximate` | `unknown`),
  `distanceKm` (number | null), `date`, `source`, optional `starred`, `custom`,
  `aiOptimized`, `autoStarred`.
- Keep local-only state keys namespaced under `motoradar_`.

## 6. Visual system

### Tokens

| Token | Value | Use |
|---|---|---|
| `--bg-0` | `#05070d` | page base |
| `--bg-1` | `#0a1020` | gradient mid |
| `--surface` | `rgba(19,27,46,.72)` | glass card |
| `--hairline` | `rgba(148,163,184,.16)` | 1px borders |
| `--text` / `--text-dim` / `--text-faint` | `#f8fafc` / `#94a3b8` / `#64748b` | type ramp |
| `--crimson` | `#ff3b5c` | brand, rajd accent |
| `--amber` | `#fbbf24` | starred, zlot accent |
| `--emerald` | `#34d399` | location / wyprawa accent |
| `--cyan` | `#22d3ee` | tor accent, focus |
| `--blue` | `#3b82f6` | primary action |
| `--violet` | `#a78bfa` | szkolenie accent, AI |
| `--radius-lg/md/sm` | `20px` / `14px` / `10px` | shape scale |

Category accent (`data-cat`) mapping, produced by `categoryKey()`:
`rajd` → crimson, `wyprawa` → emerald, `szkolenie` → violet, `tor` → cyan,
`zlot` → amber.

### Surfaces and depth

- Page background: two fixed radial glows (crimson top-left, blue bottom-right) over
  a vertical `--bg-0 → --bg-1` gradient; drawn once, `pointer-events:none`.
- Cards: `backdrop-filter: blur(14px) saturate(140%)`, hairline border, 20px radius,
  soft shadow, 3px category accent bar on the leading edge.
- Header: sticky, translucent, blurred, hairline bottom border.

### Typography

System stack (`ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto`).
Headings `-0.02em` tracking; dates and distances use `font-variant-numeric: tabular-nums`.

## 7. Behaviour decisions

1. **Star persistence.** A star is stored as `starKey(ev) = normalizeTitle(title) + "|" + date.toLowerCase()` in
   `localStorage.motoradar_starred` (JSON array). The set — not the `events.json`
   field — is the source of truth for user stars; `autoStarred` from data is kept
   separate. Existing `starred: true` values are seeded into the set once, guarded
   by `motoradar_starred_seeded`.
2. **Ordering.** Ascending by parsed date; unparseable dates ("Wkrótce",
   "Najbliższy termin") last. Tie-break: known distance ascending, then title.
3. **Distance filter.** `distanceKm === null` / `locationType === "unknown"` events
   are always shown — the slider never hides "unknown location" events.
4. **.** Diacritic-insensitive substring match over title, location,
   subCategory and description, debounced 120 ms, combinable with chips.
5. **Date labels.** "Dziś", "Jutro", "Za N dni" (N ≤ 7), past events get
   "N dni temu"; an event is `isSoon` when 0 ≤ days ≤ 3 (pulsing dot).
6. **Feedback.** `alert()` and `confirm()` are replaced by toasts. The old
   "Otworzyć źródło?" confirm modal is removed: the card expands on tap and the
   source is a dedicated anchor, so accidental navigation is no longer possible.
   Star toggles play the existing WebAudio blip and `navigator.vibrate(10)` when
   available.
7. **Notifications.** Behaviour preserved (today and up to 3 days back, once per day
   per event), moved unchanged into the new module.
8. **Settings.** Bottom sheet (mobile) / centered sheet (desktop) with distance
   slider + live value, Groq key, AI button, install instructions, manual add.
9. **Loading.** Three shimmer skeleton cards replace the literal "Ładowanie...".

## 8. Accessibility and motion

- Cards are `<article tabindex="0" aria-expanded>` toggled by click, Enter or Space.
- Star is a real `<button aria-pressed>` with an accessible label; source links are
  real anchors, not click handlers.
- Sheets are `role="dialog" aria-modal="true"`, close on Escape and backdrop click,
  restore focus to the opener.
- `:focus-visible` ring uses `--cyan`; `@media (prefers-reduced-motion: reduce)`
  disables transforms and the aurora animation.

## 9. File structure after the change

```
moto-radar/
  index.html          markup + module import only (no inline CSS/JS)
  styles.css          the design system and all component styles
  js/logic.js         pure, DOM-free functions (parse, format, dedupe, filter, sort)
  js/app.js           DOM wiring, state, rendering, PWA/AI/notification glue
  tests/*.test.js     node:test suites (no dependencies)
  package.json        {"type":"module"} + npm test script (no dependencies)
  tools/make_icons.py one-off icon generator (Pillow)
  sw.js               cache shell, network-first for events.json
  manifest.json       PNG icons (192/512/maskable) + shortcuts
  icons/*.png         generated install icons
```

## 10. Testing strategy

- Pure logic gets `node --test` coverage (date parsing, escaping, formatting,
  dedupe, star keys, filtering, sorting).
- Markup gets a static contract test (required ids present once, no inline
  handlers, single module script).
- Assets get a consistency test (every file in the SW precache list exists;
  manifest icons exist at declared sizes).
- `python -m pytest test_moto_radar.py` must stay green.
- Visual verification via headless Edge screenshots at 430×932 and 1280×900.

## 11. Out of scope

Map view, geolocation, calendar export (`.ics`), push notifications via a server,
user accounts, automated Groq calls, i18n beyond Polish.
