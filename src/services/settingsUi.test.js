import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

async function read(rel) {
  return readFile(new URL(rel, import.meta.url), "utf8");
}

const NEW_SETTING_KEYS = [
  "settings.account.title",
  "settings.account.description",
  "settings.appearance.title",
  "settings.appearance.description",
  "settings.appearance.darkMode",
  "settings.language.title",
  "settings.language.description",
  "settings.language.fa",
  "settings.language.en",
  "settings.study.title",
  "settings.study.description",
  "settings.study.defaultNegativeMarking",
  "settings.study.defaultNegativeMarking.hint",
  "settings.study.defaultExamType.type",
  "settings.study.defaultExamType.practice",
  "settings.study.defaultExamType.exam",
  "settings.about.title",
  "settings.about.description",
  "settings.about.version",
  "settings.feedback.title",
  "settings.feedback.description",
  "settings.feedback.action",
  "settings.feedback.hint",
  "home.today.bySubject",
];

test("settings: Account functionality lives in Settings (logout + sync)", async () => {
  const source = await read("../pages/Settings.jsx");
  assert.match(source, /markUserInitiatedSignOut\(\)/);
  assert.match(source, /supabase\.auth\.signOut\(\)/);
  assert.match(source, /handleFullSync/);
  assert.match(source, /account\.logout/);
  assert.match(source, /account\.syncToLocal/);
  const markIdx = source.indexOf("markUserInitiatedSignOut()");
  const signOutIdx = source.indexOf("supabase.auth.signOut()");
  assert.ok(markIdx >= 0 && signOutIdx >= 0 && markIdx < signOutIdx);
});

test("settings: Settings route works and /account redirects (no Account page)", async () => {
  const app = await read("../App.jsx");
  assert.match(app, /path="\/settings"[^>]*element=\{<Settings \/>}/);
  assert.match(app, /path="\/account"[^>]*Navigate to="\/settings"/);
  assert.doesNotMatch(app, /from "\.\/pages\/Account"/);

  let accountExists = true;
  try {
    await read("../pages/Account.jsx");
  } catch {
    accountExists = false;
  }
  assert.equal(accountExists, false, "Account.jsx should be removed");
});

test("settings: mobile navigation contains Settings", async () => {
  const source = await read("../components/layout/MobileNav.jsx");
  assert.match(source, /to: "\/settings"/);
  assert.match(source, /labelKey: "nav\.settings"/);
  assert.ok(!source.includes("/account"));
});

test("settings: sidebar no longer lists Account as a nav entry", async () => {
  const source = await read("../components/layout/Sidebar.jsx");
  assert.doesNotMatch(source, /path: "\/account"/);
  assert.match(source, /path: "\/settings"/);
});

test("settings: TopBar avatar opens Settings when signed in", async () => {
  const source = await read("../components/layout/TopBar.jsx");
  assert.match(source, /to=\{user \? "\/settings" : "\/login"\}/);
  assert.ok(!source.includes("/account"));
});

test("settings: study defaults persist via existing settings storage", async () => {
  const storage = await read("./storage.js");
  assert.match(storage, /defaultNegativeMarking:\s*true/);
  assert.match(storage, /defaultExamType:\s*"practice"/);

  const folder = await read("../pages/Folder.jsx");
  assert.match(folder, /defaultNegativeMarking/);
  assert.match(folder, /defaultExamType/);
});

test("settings: all new i18n keys exist in both Persian and English", async () => {
  const source = await read("../i18n/translations.js");
  const faStart = source.indexOf("fa: {");
  const enStart = source.indexOf("en: {");
  assert.ok(faStart >= 0 && enStart > faStart);
  const faBlock = source.slice(faStart, enStart);
  const enBlock = source.slice(enStart);

  for (const key of NEW_SETTING_KEYS) {
    assert.ok(
      faBlock.includes(`"${key}"`),
      `missing fa key: ${key}`
    );
    assert.ok(
      enBlock.includes(`"${key}"`),
      `missing en key: ${key}`
    );
  }
});

test("settings: new i18n keys are actually used", async () => {
  const settings = await read("../pages/Settings.jsx");
  const home = await read("../pages/Home.jsx");
  const used = settings + home;

  for (const key of NEW_SETTING_KEYS) {
    assert.ok(
      used.includes(`"${key}"`) || used.includes(`t("${key}")`),
      `key not used: ${key}`
    );
  }
});

test("daily accuracy: Home uses getDayReport (same source as Calendar)", async () => {
  const home = await read("../pages/Home.jsx");
  assert.match(home, /getDayReport/);
  assert.match(home, /home\.today\.bySubject/);
  assert.match(home, /dayReport\.subjects/);
});

test("responsive: circular answer-choice keeps aspect-ratio guards", async () => {
  const redesign = await read("../styles/redesign-exam.css");
  const match = redesign.match(
    /\.answer-choice,\s*\n\.answer-button\s*\{[^}]+\}/
  );
  assert.ok(match, "answer-choice rule not found");
  assert.match(match[0], /aspect-ratio:\s*1\s*\/\s*1/);
  assert.match(match[0], /flex-shrink:\s*0/);
  assert.match(match[0], /min-width:\s*38px/);
});

test("responsive: ≤480 Correct Answer is compact, not full-width 44px", async () => {
  const pages = await read("../styles/pages.css");
  // Old defect: flex:1 + min-height:44px stretched choices into blocks
  assert.doesNotMatch(
    pages,
    /\.correct-answer-choice\s*\{[^}]*min-height:\s*44px/s,
    "correct-answer-choice must not use min-height:44px"
  );
  assert.doesNotMatch(
    pages,
    /\.answer-choice,\s*\n\s*\.correct-answer-choice\s*\{[^}]*flex:\s*1/s,
    "answer choices must not flex:1 stretch into ovals"
  );
  assert.match(pages, /\.correct-answer-choice\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1/s);
});

test("responsive: answer-key editor has mobile compact rules", async () => {
  const components = await read("../styles/components.css");
  assert.match(components, /@media \(max-width: 600px\)[\s\S]*\.answer-key-btn/);
  assert.match(components, /\.answer-key-options\s*\{[^}]*flex-wrap:\s*wrap/s);
});
