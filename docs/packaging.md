# Packaging: Windows (Electron) & Android (Capacitor)

TestBox v2.2.0-beta.2 ships three ways from one codebase:

| Platform | Wrapper | Output | Config |
|---|---|---|---|
| Web | none (Vite static site) | `dist/` → GitHub Pages | `vite.config.js` |
| Windows | Electron 44 | `release/TestBox-Setup-2.2.0-beta.2.exe` (this release ships the NSIS installer only; the portable target stays in the config for future builds) | `electron-builder.json5` |
| Android | Capacitor 7 | `android/app/build/outputs/apk/release/app-release.apk` | `capacitor.config.json` |

## Rationale

- **Electron** gives Windows users a real installed app (Start-menu shortcut,
  taskbar icon, no browser chrome). The renderer is the exact web UI; the main
  process runs with `nodeIntegration: false`, `contextIsolation: true`,
  `sandbox: true` and a minimal `preload.cjs` bridge (close-to-tray, tray wake,
  OAuth callback delivery) — the app itself is a static page in a frame and no
  renderer code touches Node directly.
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

- `TestBox-Setup-2.2.0-beta.2.exe` — NSIS installer x64 (user-chosen install dir,
  desktop + Start-menu shortcuts)
- `TestBox-Portable-2.2.0-beta.2.exe` — standalone portable x64 (built only when
  the portable target is requested; not shipped in v2.2.0-beta.2)

Details:

- appId `app.testbox.app`, productName `TestBox`, icon from
  `electron/assets/icon.ico` (generated from
  `public/brand/testbox-app-icon.svg` via `@resvg/resvg-js` + `png-to-ico`).
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
- Launcher mipmaps generated from `public/brand/testbox-app-icon.svg` on
  TestBox teal `#0E7490` (adaptive background in
  `values/ic_launcher_background.xml`).
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

### Optional future database cleanup (Friend System removed)

The Friend System was removed from the application. These tables may still exist in Supabase unused — do not drop them automatically; run only when ready:

```sql
-- OPTIONAL — destructive; not part of any app deploy.
-- drop table if exists friend_requests;
-- drop table if exists friendships;
-- drop table if exists profiles;
```

## Google Sign-In (Supabase OAuth) — deploy/setup steps

These are **dashboard configuration steps** (not performed by this repository).
The client never holds the Google Client Secret — it stays in Supabase only.

### Google Cloud Console

1. APIs & Services → Credentials → **Create credentials → OAuth client ID** → type **Web application**.
2. **Authorized JavaScript origins** (exact):
   - Dev: `http://127.0.0.1:5173`
   - Prod: `https://itsakhb.github.io`
3. **Authorized redirect URIs** (exact):
   - `https://mnkqjwtqtzlwmbzfquzf.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client secret** into Supabase (next step). Do not commit either value.

### Supabase Dashboard → Authentication → Providers → Google

1. Enable **Google**.
2. Paste Google **Client ID** + **Client secret**.
3. **Authentication → URL Configuration**:
   - **Site URL**: `https://itsakhb.github.io/TestBox/`
   - **Redirect URLs** (allow-list, exact):
     - Dev: `http://127.0.0.1:5173/` and `http://127.0.0.1:5173/TestBox/`
     - Prod: `https://itsakhb.github.io/TestBox/`
     - Desktop/Android custom scheme: `testbox://auth/callback`
4. Keep the existing email/password provider **enabled** until migration is verified for existing accounts (coexistence period). Do not disable it until every existing user has signed in with Google at least once with a matching verified email (same Supabase UUID).

### Optional env (no secrets)

| Variable | Purpose |
|---|---|
| `VITE_SITE_URL` | Absolute site origin+path override for `redirectTo` when `window.location` is not trustworthy (rare). Never put a client secret here. |

### Existing-account linking (UUID preservation)

- If a Google account’s **verified email** matches an existing confirmed Supabase user, configure/link so the **same auth UUID** is reused (Supabase identity linking). Never create a second user for the same person.
- Until linking is verified end-to-end, password login remains available on the Sign In page.

### Platform return paths

| Platform | Flow |
|---|---|
| Web | `signInWithOAuth` → Google → Supabase → `?code=` on the allowed redirect → PKCE exchange (`detectSessionInUrl`). HashRouter-safe (code is in the query, not the hash). |
| Windows/Electron | OAuth opens in the **system browser**; Supabase redirects to `testbox://auth/callback?code=…`. Main process registers the `testbox` protocol and forwards the URL to the renderer, where the preload **buffers** it until consumed — a code sent before React mounts is never dropped. Requires a packaged install (protocol registration is best-effort in bare `electron .` dev). |
| Android | Google sign-in opens in a **Chrome Custom Tab** (`@capacitor/browser`) — the native Google account screen appears when the Google app is installed. Return is the same custom scheme `testbox://auth/callback` via `AndroidManifest` intent-filter + Capacitor `appUrlOpen`. Rebuild the native project after plugin/manifest changes (`npx cap sync android`). |

### Manual verification checklist (not automated)

- [ ] Web: Continue with Google → completes → lands authenticated
- [ ] Web: reload while signed in → session restored
- [ ] Web: logout → guest UI; login again → same user UUID / same local data namespace
- [ ] Existing password account: first Google sign-in with same email → **same** UUID (sync unchanged)
- [ ] Offline startup with a valid persisted session → `needs_revalidation`, local data still under the same prefix
- [ ] Windows package: Google button opens system browser; return via `testbox://` signs in
- [ ] Android package: Google button; return via deep link signs in

