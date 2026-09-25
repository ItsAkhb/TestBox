# TestBox

<p align="center">
  <img src="public/brand/testbox-primary-lockup.svg" width="420" alt="TestBox — Learn · Practice · Grow" />
</p>

**TestBox** is an offline-first study app for creating, managing, and practicing test answer sheets — on the web, on Windows, and on Android.

Organize exams into folders and subjects, solve practice sheets with a built-in stopwatch, track daily study activity on a calendar, and review marked questions — with or without an internet connection.

## Features

### Practice & exams
* Folders and color-coded subjects for organization
* Practice and exam modes with negative marking
* Per-question answer key editor with custom numbering and partial keys
* Exam lifecycle: start → timer → auto-finish → score report → retake
* **Practice stopwatch** — measures real study time (pause-aware), feeds daily reports and monthly totals
* **Tags (برچسب‌ها)** — tag individual questions (create/rename/delete/assign), fully synced
* **Unresolved questions (حل‌نشده)** — mark questions you worked on but couldn't solve; tracked in reports without distorting accuracy

### Insights
* Dashboard with today's stats, streaks, and a 7-day activity rhythm
* Daily reports drill down: overall → subject → folder → exam
* Monthly calendar (Jalali in FA, Gregorian in EN) with activity intensity

### Offline-first sync
* **Everything works offline** — a persistent change tracker records every edit locally
* When you're back online, changes upload automatically: upload-first, no duplicates, no lost edits, no destructive overwrites
* Offline login keeps your data visible and editable when the network is down

### Platforms
* 🌐 **Web** — https://itsakhb.github.io/TestBox/ (installable in the browser, works offline)
* 🪟 **Windows** — installer: [releases](https://github.com/ItsAkhb/TestBox/releases) (Electron, sandboxed)
* 🤖 **Android** — APK: [releases](https://github.com/ItsAkhb/TestBox/releases) (Capacitor, hardware back-button support)

### Also
* Full **FA (RTL, Jalali)** and **EN (LTR, Gregorian)** support, light & dark themes
* Responsive from 320 px phones to desktop
* Backup & restore as JSON
* Local fonts — no CDN dependencies at launch

## Tech Stack

* React 19 + Vite
* React Router (HashRouter for GitHub Pages)
* Supabase (authentication & cloud sync)
* localStorage persistence (per-user namespace)
* Lucide icons + Framer Motion
* Electron (Windows) / Capacitor 7 (Android)
* Hand-rolled Jalali↔Gregorian conversion (no date library)

## Project Structure

```
src/
├── components/     # UI components (ui/, layout/, exam/, calendar/)
├── context/        # Auth, sync, settings, i18n, toast providers
├── pages/          # Application pages
├── services/       # storage, cloudSync, activityTracker, scoring…
├── hooks/          # useTimer, useStopwatch
├── i18n/           # FA/EN translations
├── styles/         # Token-based CSS system
└── utils/          # date (Jalali), helpers
docs/               # packaging.md, offline.md
electron/           # Windows shell
android/            # Capacitor platform
```

## Development

```bash
git clone https://github.com/ItsAkhb/TestBox.git
cd TestBox
npm install        # use --legacy-peer-deps if peer conflicts appear
npm run dev
```

Builds:

```bash
npm run build            # web (base /TestBox/)
npm run build:packaged   # web with relative paths (Electron/Capacitor)
npm run dist:win         # Windows installer + portable → release/
npm run build:packaged && npx electron-builder --win nsis   # installer only
cd android && ./gradlew assembleRelease   # Android APK (see docs/packaging.md)
```

Lint:

```bash
npm run lint
```

## Deployment

The web version is deployed to GitHub Pages from the `gh-pages` branch:

```bash
npm run deploy
```

See [docs/packaging.md](docs/packaging.md) for Windows/Android build details.

## Environment Variables

Create a `.env.local` file:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

Never commit environment files or private keys to the repository.

## Current Status

**v2.2.0-beta.1 released.**

What's new in v2.2.0-beta.1:

* **Refined brand identity** — new master logo system in [`public/brand/`](public/brand/): crafted wordmark, "Learn · Practice · Grow" lockups, detailed answer-sheet mark, dark variants; used on the auth screens
* **Friend system removed** — the feature and all related services/routes were dropped
* **Offline mode UX** — global offline prompt and capability-gated auth flows
* **Theme system module** — single source of truth for light/dark/system preference with cross-tab sync
* **Tags improvements** — shared question tag picker (Tags + Exam), grouping and label helpers
* New test coverage: statistics, tags UI, timers, settings UI, auth flow

Implemented:

* Complete redesigned UI (FA/EN × light/dark × mobile/desktop)
* Offline-first engine with dirty tracking and upload-first sync
* Practice stopwatch and study-time statistics
* Windows and Android packaging
* Scoring with custom numbering, partial keys, and negative marking

In progress / planned:

* Code-splitting for the web bundle
* Code-signing certificates for Windows/macOS distribution

## License

**TestBox is source-available software and is licensed for non-commercial use only.**

You may use, copy, modify, and redistribute TestBox for personal, educational, research, and other non-commercial purposes, provided that the original copyright notice and license are retained.

**Commercial use is not permitted without prior written permission from the copyright holder.** This includes selling TestBox or modified versions, incorporating it into a commercial product or service, offering it as a paid or monetized service, or otherwise using it for commercial benefit.

The name **TestBox**, its logo, branding, and other project-specific trademarks are not included in the permissions granted by this license.

See the [`LICENSE`](LICENSE) file for the complete terms.

**Copyright (c) 2026 Ali Khatibi**

