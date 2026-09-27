import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../../", import.meta.url);

// Root cause of the Android-only Persian input bug (v2.2.0-beta.3 #3):
// `android.captureInput: true` makes CapacitorWebView return a bare
// BaseInputConnection instead of the WebView's real InputConnection.
// IMEs then fall back to ACTION_MULTIPLE key events, which Capacitor
// injects via evaluateJavascript("document.activeElement.value = ...")
// — a direct DOM mutation with NO input event, so React controlled
// state never updates: the text appears while typing, then vanishes on
// the next re-render/submit ("Please enter a name"), and edits save
// truncated. The config default is false; the file must never re-enable
// it. Desktop/web never saw the bug because they use standard inputs.
test("mobile input: capacitor config keeps android.captureInput disabled", async () => {
  const raw = await readFile(new URL("capacitor.config.json", ROOT), "utf8");
  const config = JSON.parse(raw);

  assert.equal(config.appId, "app.testbox.app", "package id unchanged");
  assert.ok(config.android, "android block present");
  assert.notEqual(
    config.android.captureInput,
    true,
    "android.captureInput must never be true (Persian/IME input loss)"
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(config.android, "captureInput"),
    false,
    "captureInput omitted so the Capacitor default (false) applies"
  );
});

// The native side of the same root cause: with captureInput enabled,
// CapacitorWebView falls back to a raw BaseInputConnection. Assert the
// installed Capacitor still contains the bypass we are protecting
// against, so this test fails loudly if the mechanism changes shape.
test("mobile input: CapacitorWebView input-capture bypass is understood", async () => {
  const source = await readFile(
    new URL(
      "node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/CapacitorWebView.java",
      ROOT
    ),
    "utf8"
  );
  assert.ok(
    source.includes("isInputCaptured"),
    "captureInput flag still gates onCreateInputConnection"
  );
  assert.ok(
    source.includes("document.activeElement.value = document.activeElement.value"),
    "ACTION_MULTIPLE injection path present (why captureInput must stay off)"
  );
});
