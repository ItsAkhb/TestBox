# Packaging: Windows (Electron) & Android (Capacitor)

TestBox v2.1.3 ships three ways from one codebase:

| Platform | Wrapper | Output | Config |
|---|---|---|---|
| Web | none (Vite static site) | `dist/` → GitHub Pages | `vite.config.js` |
| Windows | Electron 44 | `release/TestBox-Setup-2.1.3.exe`, `release/TestBox-Portable-2.1.3.exe` | `electron-builder.json5` |
| Android | Capacitor 7 | `android/app/build/outputs/apk/release/app-release.apk` | `capacitor.config.json` |

## Rationale

- **Electron** gives Windows users a real installed app (Start-menu shortcut,
  taskbar icon, no browser chrome). The renderer is the exact web UI; the main
  process is ~60 lines with `nodeIntegration: false`, `contextIsolation: true`,
  `sandbox: true`, no preload and no IPC — the app is a static page in a frame.
- **Capacitor** wraps the same static bundle in a system WebView for Android,
  adding the hardware back-button handling (`src/services/native.js`) and
  splash/status-bar presentation. No native plugins touch app data; all
  persistence stays in WebView localStorage, identical to web.
- **Pinned Capacitor v7** plugins (`@capacitor/*` 7.x): npm tries to resolve
  v8 peers against v7 core. Install with `--legacy-peer-deps` if peer
  conflicts appear.

## Vite base-path split

`vite.config.js` selects the asset base by mode:

- `npm run build` (web) → base `/TestBox/` (GitHub Pages serves the repo under
  `/TestBox/`; HashRouter makes deep links resolve correctly).
- `npm run build:packaged` (Electron + Capacitor) → base `./` (bundle loaded
  from the filesystem/app assets, so paths must be relative).

## Windows build

```
npm install            # restores node_modules incl. Electron binary
npm run dist:win       # build:packaged + electron-builder --win
```

Outputs in `release/` (gitignored):

- `TestBox-Setup-2.1.3.exe` — NSIS installer x64 (user-chosen install dir,
  desktop + Start-menu shortcuts)
- `TestBox-Portable-2.1.3.exe` — standalone portable x64

Details:

- appId `app.testbox.app`, productName `TestBox`, icon from
  `electron/assets/icon.ico` (generated from `public/favicon.svg` via
  `@resvg/resvg-js` + `png-to-ico`).
- `electron-builder.json5` sets `electronDist: "node_modules/electron/dist"`.
  **Why:** electron-builder's default download-extract-rename step
  (`win-unpacked.tmp` → `win-unpacked`) deterministically fails with EPERM on
  machines where Defender/Search indexes freshly extracted 375 MB of binaries
  and holds rename-blocking handles. Pointing `electronDist` at the dist
  npm already installed skips that step; output is identical.
- The exes are signed with the local self-signed test certificate
  (electron-builder default). For distribution beyond GitHub releases, a real
  code-signing certificate would be needed to avoid SmartScreen warnings.
- Smoke test: launch `release/win-unpacked/TestBox.exe` (or the installer) and
  verify the UI renders.

## Android build

Prerequisites (user-scope, no admin):

- JDK 21 (`JAVA_HOME`) — e.g. Temurin 21 zip extracted to `%LOCALAPPDATA%\Java`
  (**21, not 17**: Capacitor 7's `capacitor.build.gradle` compiles the
  `capacitor-android` module with source/target 21; JDK 17 fails with
  "invalid source release: 21")
- Android SDK (`ANDROID_HOME`) — cmdline-tools zip → `%LOCALAPPDATA%\Android\Sdk`,
  then `sdkmanager "platform-tools" "platforms;android-35" "build-tools;36.0.0"`
  (licenses accepted via `sdkmanager --licenses`)
- `android/local.properties` with `sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk`
  (**forward slashes** — Java properties treat `\U` as an escape and the
  SdkLocator fails with "filename syntax is incorrect")

```
npm run build:packaged
npx cap sync android     # copies dist/ into android/app/src/main/assets/public
cd android
./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`.

### Signing

- `android/keystore.properties` (gitignored) holds `storeFile`, `storePassword`,
  `keyAlias`, `keyPassword`; `android/app/build.gradle` reads it and applies a
  `release` signingConfig.
- The keystore (`android/testbox-release.keystore`, gitignored) was generated
  with `keytool -genkeypair` (RSA 2048, validity 10000 days). **Keep the
  keystore + password safe and identical for every future release** — Android
  refuses updates signed with a different key.
- Without `keystore.properties` the build falls back to the debug key
  (fine for testing, not for release).

### Android notes

- `capacitor.config.json` (JSON, not TS — the `.ts` config breaks with
  `"type": "module"` in package.json): appId `app.testbox.app`, webDir `dist`,
  `androidScheme: https`, no cleartext, SplashScreen `#FAF8F5` 800 ms,
  StatusBar overlay.
- Launcher mipmaps generated from `public/favicon.svg` on `#863BFF`.
- Hardware back button: `src/services/native.js` → history.back() unless at
  root, then exits; wired in `Layout.jsx`.

## Known limitations

- No code-signing certificate for Windows (SmartScreen may warn on first run).
- Single-bundle web build (>500 kB advisory); code-splitting is a later task.
- Cloud sync is capability-gated by design: each data type syncs only when
  its table/column exists, so an incomplete schema never damages local data.
  The live Supabase schema has all pieces below applied (as of v2.1.2); the
  migration is re-runnable (`if not exists`/`if exists`) for a fresh project.

## Supabase schema migration (full cross-device sync)

Run in Supabase → SQL Editor. The app probes capabilities on load; each
piece activates automatically once present:

```sql
alter table folders add column if not exists subject_id text;
alter table exams add column if not exists type text default 'practice';
alter table exams add column if not exists timer_duration int;
alter table exams add column if not exists answer_key jsonb;
alter table exams add column if not exists exam_state jsonb;
alter table exams add column if not exists stopwatch_enabled boolean default false;
alter table exams add column if not exists tag_ids jsonb default '[]'::jsonb;

create table if not exists subjects (
  id bigint primary key, user_id uuid not null, name text not null,
  color text, updated_at timestamptz default now()
);
create table if not exists daily_activity (
  user_id uuid not null, date date not null, payload jsonb not null,
  updated_at timestamptz default now(), primary key (user_id, date)
);
create table if not exists user_settings (
  user_id uuid primary key, settings jsonb not null,
  updated_at timestamptz default now()
);
create table if not exists tags (
  id bigint primary key, user_id uuid not null, name text not null,
  color text, updated_at timestamptz default now()
);

-- Allow the first-class "unresolved" question status
alter table exam_questions drop constraint if exists exam_questions_status_check;
alter table exam_questions add constraint exam_questions_status_check
  check (status in ('correct','wrong','unanswered','unresolved'));

alter table subjects enable row level security;
alter table daily_activity enable row level security;
alter table user_settings enable row level security;
alter table tags enable row level security;

create policy "own subjects" on subjects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own activity" on daily_activity for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own settings" on user_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own tags" on tags for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### Friends schema (v2.1.1)

```sql
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null, display_name text,
  updated_at timestamptz default now()
);
create table if not exists friend_requests (
  id bigint generated always as identity primary key,
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (requester_id, addressee_id)
);
create table if not exists friendships (
  id bigint generated always as identity primary key,
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_a, user_b)
);
```
(RLS: profiles readable by authenticated users, writable only by owner;
requests visible/participable by both parties; friendships visible to
both sides. Presence = profiles.updated_at heartbeat within 5 min.)
