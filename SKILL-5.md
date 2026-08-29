---
name: mon-assistant-scolaires
description: Use whenever working on the "Mon Assistant Scolaires" (MAS) project — a single-file HTML/CSS/JS Progressive Web App for Ivorian students (repo marcelaagbassi-create/Mon-assistant-scolaires-). Trigger this for any request to read, explain, debug, extend, or refactor index.html, its AI assistant "Amina", the ALVACOA backend integration, the course/notes/révision/moyenne features, or anything referencing this codebase's data model (mas_v5 localStorage) or PWA setup (manifest.json, sw.js). Always consult this before editing the file so line ranges and function names don't need to be rediscovered from scratch.
---

# Mon Assistant Scolaires (MAS)

## What this is

A **single-file** (`index.html`, ~14 300 lines) French-language Progressive
Web App aimed at Ivorian secondary/high-school students (collège + lycée,
programme scolaire de Côte d'Ivoire). Everything — HTML structure, CSS, and
JS logic — lives in this one file. There is no build step, no bundler, no
framework: vanilla JS + inline `<style>` + inline `<script>`.

Companion PWA files referenced but not bundled in this upload: `manifest.json`,
`sw.js` (service worker), `icon-16/32/180.png`. Check the repo root for these
before assuming they don't exist.

Core value proposition: an AI tutor named **"Amina"** that answers questions
about the student's exact grade-level curriculum, plus personal-organization
tools (courses, révisions/spaced repetition, notes, grade average calculator,
reminders).

## High-level architecture

```
index.html
├── <style> (~lines 18–1090)      → design tokens via CSS vars, light/dark theme
├── HTML body (~lines 1090–1770)  → auth screen, header, 7 pages, bottom nav,
│                                    modals (note, profile, AI panel, live mode)
└── <script> (~lines 1745–14174)  → all app logic, no imports/modules
```

Because the file is huge, **never `view` the whole thing**. Use `grep -n` to
locate functions/sections first, then `view` with a narrow `view_range`.
Useful anchors:

| Section | Approx. lines |
|---|---|
| `:root` CSS variables / dark theme overrides | 18–44 |
| `NIVEAUX` config (grade levels, colors) | ~1750 |
| `MAT_CFG` (subject colors) | ~1762 |
| `COURS_INTEGRES` (built-in curriculum content, huge object) | ~1770–3730 |
| App state (`D`, localStorage key `mas_v5`) | ~1878 |
| Navigation (`goPage`) | 1891 |
| Page render functions (`renderAccueil`, `renderCours`, `renderRevision`, `renderNotes`, `renderRappels`) | 1907–2432 |
| Moyenne (grade average) calculator | 2317–2367 |
| AI panel core (`openAI`, `sendAI`, model routing) | 2450–3100 |
| Voice: browser TTS + ElevenLabs (`speakWithElevenLabs`) | 3140–3320 |
| "Amina Live" voice-mode overlay (UI + logic) | 3536–3735, 14201–14285 |
| Memory helpers (`saveToMemory`, `recallFromMemory`, `buildMemoryContext`) | 3699–3760 |
| Theme / font-size settings | 13722–13763 |
| Splash screen / PWA service-worker registration | 13763–13906, 14157–14173 |
| Notifications (local reminders) | 13815–13950 |
| Firebase auth stubs + email/Google auth UI | 13950–14144 |

## Pages (bottom nav)

7 pages, toggled via `goPage(pageId)` which shows `#page-<id>` and calls the
matching render function:

1. **accueil** — home/dashboard (streaks, quick stats, welcome banner)
2. **cours** — course browser, organized `niveau → matière → chapitre`
   (data source: `COURS_INTEGRES`, extendable via uploaded PDFs stored in
   `D.pdfs`)
3. **revision** — spaced-repetition-style révision tracker (`D.revisions`)
4. **notes** — colored/tagged sticky notes (`D.notes`)
5. **moyenne** — grade average calculator per subject, with history
   (`D.moyennes`)
6. **rappels** — reminders with local notifications (`D.rappels`)
7. **parametres** — settings (theme, font size, notifications, profile, API
   keys)

Plus non-nav overlays: auth screen, note modal, PDF reader (`.reader`), AI
chat panel (`#aiPanel`), fullscreen image viewer, and "Amina Live" voice
overlay.

## Data model

Single client-side store, persisted to `localStorage['mas_v5']` as JSON via
`save()`:

```js
D = {
  revisions: [],   // { id, matiere, ... }
  notes:     [],   // { id, color, tags[], text, ... }
  rappels:   [],   // { id, done, ... }
  activites: [],   // activity log, capped at 60 entries, newest first
  moyennes:  [],   // grade-average history snapshots
  pdfs:      []     // user-uploaded PDF course material metadata
}
```

Other localStorage keys used elsewhere in the file: `mas_user` (auth profile),
`mistral_api_key`, `mas_auth_skipped`, theme/font-size prefs — `grep -n
"localStorage\."` to find all of them before adding a new one, to avoid key
collisions.

Curriculum data (`COURS_INTEGRES`) is a large **static nested object**:
`{ [niveau]: { [matière]: [chapitre titles...] } }`. Grade levels covered:
6ème, 5ème, 4ème, 3ème, 2nde, Première, Terminale A/C/D/E, Terminale
(générale). This is the canonical source for "what chapters exist" — do not
invent new chapters, extend this object following the exact same shape and
French accented spelling already used (note: some accented words are
deliberately split with a soft hyphen artifact, e.g. `"photosyn-th\u00e8se"`
— an existing typo/escape quirk, preserve or fix deliberately, don't
silently "correct" without flagging it to the user).

## The AI assistant "Amina"

Amina is multi-model, routed through a custom backend called **ALVACOA**
(`callALVACOA`), not a direct Anthropic/OpenAI API key in the client — the
comment `getApiKey(){ return ''; } // Clé gérée par ALVACOA` confirms no
client-side key is exposed for the primary provider.

- `detectBestModel(msg)` — regex/keyword-based router that scores the
  message against 4 specialties and silently switches model:
  - `claude-3.5-sonnet` → code/programming questions
  - `deepseek-chat-v2` → math/hard sciences, step-by-step exercises
  - `mistral-small` → essays/dissertation, philo, history, letters
  - `gemini-2.0-flash` → images, general culture, current events
  - Curriculum-specific questions (bac, bepc, programme CI, etc.) prefer a
    separate **Mistral Agent** (`callMistralAgent`, requires a user-supplied
    `mistral_api_key` in localStorage) ahead of ALVACOA.
- `callAnthropicAPI(userMessage)` is the actual entry point despite the
  name — it runs `detectBestModel`, builds a `tryOrder` fallback chain
  (`FALLBACK_ORDER`), and calls ALVACOA for each until one succeeds.
- System prompt is `AMINA_SYSTEM` + a per-model `taskHints` string + memory
  context (`buildMemoryContext`) + last-8-turn conversation history + the
  new question, capped at "max 600 mots sauf si plus demandé".
- Voice: `speakWithElevenLabs` (premium TTS) with fallback to
  `speakWithBrowser` (Web Speech API `SpeechSynthesis`).
- "Amina Live" (`openLiveMode`) is a fullscreen voice-conversation overlay
  with waveform visuals, live transcript/lyrics toggle, and two voice
  presets (Amina F / Davieslay M).
- Chat has file/image attachment support (`handleAiFile`, `triggerCamera`,
  `triggerAttach`) and inline code-block execution preview
  (`runCodePreview`).

When asked to modify AI behavior (system prompt, model routing, TTS), locate
the exact constant/function first (`AMINA_SYSTEM`, `taskHints`,
`detectBestModel`, `FALLBACK_ORDER`) with `grep -n` rather than assuming line
numbers, since edits shift everything below them.

## Auth

Lightweight auth screen (`#authScreen`) offering Google sign-in
(`signInGoogle`, Firebase-based — `initFirebase()`), email/password
(`authSubmit`), or `skipAuth()` to use the app without an account
(sets `mas_auth_skipped` and relies purely on localStorage). There's no
real backend user database evident in this file — check for a `firebase-config`
or backend API elsewhere in the repo before assuming auth is fully wired up.

## Working conventions in this codebase

- **No semicolons-safe assumption**: code mixes `var`/`let`/`const` and both
  arrow functions and `function` keyword — match the existing style in the
  section being edited rather than imposing one style file-wide.
- **French UI strings, English-ish function/variable names** — keep this
  split when adding code (UI text in French, identifiers in English/French
  mix as already present, e.g. `renderCours`, `goPage`, `saveNote`).
- **Everything persists via `save()`** — any new stateful feature should
  extend `D` and call `save()` after mutation, following the existing
  `add*`/`del*`/`render*` triad pattern (e.g. `addRappel` / `delRap` /
  `renderRappels`).
- **CSS uses custom properties** (`--bg`, `--text`, `--accent`, etc.) with a
  `body.dark` override block for dark mode — new UI should use these vars,
  not hardcoded colors, to stay theme-compatible.
- **Given the file's size**, prefer `grep -n` + targeted `view_range` +
  `str_replace` over reading/rewriting large chunks. When adding a new page,
  mirror the existing 7-page pattern (bottom-nav button + `#page-<id>` div +
  `renderX()` function registered in `goPage`).

## Common tasks checklist

- **Add/edit a curriculum chapter**: edit `COURS_INTEGRES[niveau][matière]`
  array only; don't touch rendering code.
- **Add a new subject color**: add an entry to `MAT_CFG`.
- **Add a new grade level**: add to both `NIVEAUX` (styling/label) and
  `COURS_INTEGRES` (content) — they must stay in sync or `getMC`/level
  cards will silently fall back to defaults.
- **Change Amina's tone/system prompt**: edit `AMINA_SYSTEM`; check
  `taskHints` too if the change should be model-specific.
- **Debug the AI not responding**: check `callALVACOA` (network call to
  `ALVACOA_URL`) and `detectBestModel` routing first — most "Amina doesn't
  answer" bugs are either a fetch/timeout failure or a mis-routed model with
  no fallback.
- **Debug data loss**: confirm the feature both reads and writes through the
  `D` object and calls `save()`; a very common bug pattern in this file is a
  render function reading `D.x` while a form handler pushes to a
  differently-named array.
