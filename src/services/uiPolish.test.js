import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../../", import.meta.url);

async function read(rel) {
  return readFile(new URL(rel, ROOT), "utf8");
}

// #5 — Tags must open with every expandable group collapsed. The state
// tracks what the user EXPLICITLY expanded; an empty set = all closed.
test("ui polish: Tags defaults to collapsed (open-set semantics)", async () => {
  const source = await read("src/pages/Tags.jsx");
  assert.ok(
    source.includes("useState(() => new Set())"),
    "open sets start empty"
  );
  assert.ok(
    source.includes("const subjectOpen = openSubjects.has(group.key)"),
    "subject groups are open only when explicitly expanded"
  );
  assert.ok(
    source.includes("const examOpen = openExams.has(examGroup.examKey)"),
    "exam groups are open only when explicitly expanded"
  );
  assert.ok(
    !source.includes("collapsedSubjects") && !source.includes("collapsedExams"),
    "no inverted collapsed-set logic remains"
  );
});

// #6 — The absolute .auth-password-toggle must resolve against a
// positioned wrapper around the input, not an outer form ancestor,
// or the eye sticks outside the field.
test("ui polish: password toggle is wrapped with its input", async () => {
  for (const page of ["src/pages/Login.jsx", "src/pages/Signup.jsx"]) {
    const source = await read(page);
    assert.ok(
      source.includes('<div className="auth-password-wrap">'),
      `${page} wraps the password input + toggle`
    );
    const wrapAt = source.indexOf('<div className="auth-password-wrap">');
    const toggleAt = source.indexOf('className="auth-password-toggle"');
    const closeAt = source.indexOf("</div>", toggleAt);
    assert.ok(
      wrapAt !== -1 && toggleAt > wrapAt && closeAt > toggleAt,
      `${page} toggle sits inside the wrapper`
    );
    assert.ok(
      source.includes('aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}'),
      `${page} keeps the accessible label`
    );
  }
});

// #7 — The Settings sticky nav must sit exactly under the TopBar's real
// bottom edge (bar height includes the safe-area inset) and below the
// TopBar in the stacking order; anchors scroll past both layers.
test("ui polish: Settings sticky nav aligns with the real TopBar height", async () => {
  const remaining = await read("src/styles/redesign-remaining.css");
  assert.ok(
    remaining.includes(
      "top: calc(var(--topbar-height) + env(safe-area-inset-top));"
    ),
    "settings-nav top includes the status-bar inset"
  );
  assert.ok(
    remaining.includes("z-index: calc(var(--z-sticky) - 1);"),
    "settings-nav stacks below the TopBar"
  );
  assert.ok(
    remaining.includes(
      "scroll-margin-top: calc(var(--topbar-height) + env(safe-area-inset-top) + 64px);"
    ),
    "anchor scrolling clears TopBar + nav"
  );

  const tokens = await read("src/styles/tokens.css");
  assert.ok(
    /@media \(max-width: 768px\)[\s\S]*?--topbar-height: 54px;/.test(tokens),
    "topbar-height token matches the 54px mobile bar"
  );

  const layout = await read("src/styles/layout.css");
  assert.ok(
    layout.includes("height: calc(var(--topbar-height) + env(safe-area-inset-top));"),
    "TopBar height derives from the shared token + inset"
  );
});
