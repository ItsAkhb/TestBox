# TestBox

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
* **Friends (دوستان)** — unique usernames, friend requests, online presence

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
* 🪟 **Windows** — installer & portable: [releases](https://github.com/ItsAkhb/TestBox/releases) (Electron, sandboxed)
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

**v2.1.1 released.**

Implemented:

* Complete redesigned UI (FA/EN × light/dark × mobile/desktop)
* Offline-first engine with dirty tracking and upload-first sync
* Practice stopwatch and study-time statistics
* Windows and Android packaging
* Scoring with custom numbering, partial keys, and negative marking

In progress / planned:

* Leaderboards / shared study stats between friends
* Code-splitting for the web bundle
* Code-signing certificates for Windows/macOS distribution

## License

This project is currently a personal project and is not licensed for redistribution.
